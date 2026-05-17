-- ============================================================
-- MIGRATION: Push Notification Triggers
--   ทำให้ทุกครั้งที่ insert notifications → Edge Function "send-push"
--   ถูกเรียกอัตโนมัติเพื่อส่ง Web Push ออกไปยังทุก subscription ของ user
--
-- ⚠️  PRE-REQUISITE: ต้อง deploy Edge Function ก่อน (ดูคู่มือใน PUSH_SETUP.md)
-- และตั้งค่า ENV vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
-- VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
-- ============================================================

-- 1) เปิด pg_net extension (Supabase enabled by default)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 2) เก็บค่า Edge Function URL + secret ใน table แทนที่จะ hardcode
--    เพื่อให้ admin แก้ผ่าน SQL ได้โดยไม่ต้องแก้ trigger
CREATE TABLE IF NOT EXISTS push_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ⚠️ INSERT/UPDATE ค่าเหล่านี้ก่อนใช้งาน — แทน <YOUR_PROJECT_REF> + <YOUR_ANON_KEY>
INSERT INTO push_config (key, value) VALUES
  ('edge_url', 'https://qsbvitqxwgtmopjjuxin.supabase.co/functions/v1/send-push'),
  ('service_role_key', 'PUT_YOUR_SERVICE_ROLE_KEY_HERE')
ON CONFLICT (key) DO NOTHING;

-- 3) ตรวจให้ table push_subscriptions มี column ที่ Edge Function ต้องใช้
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id           bigserial PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint     text NOT NULL,
  p256dh_key   text NOT NULL,
  auth_key     text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint)
);
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS endpoint text;
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS p256dh_key text;
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS auth_key text;
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id);

-- 4) RPC: register_push_subscription (idempotent — overwrite if endpoint exists)
-- DROP first in case an older version with a different return type already exists.
DROP FUNCTION IF EXISTS register_push_subscription(uuid, text, text, text);

CREATE OR REPLACE FUNCTION register_push_subscription(
  p_user_id  uuid,
  p_endpoint text,
  p_p256dh   text,
  p_auth     text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF p_user_id IS NULL OR p_endpoint IS NULL OR p_p256dh IS NULL OR p_auth IS NULL THEN
    RAISE EXCEPTION 'MISSING_FIELDS';
  END IF;

  INSERT INTO push_subscriptions (user_id, endpoint, p256dh_key, auth_key)
  VALUES (p_user_id, p_endpoint, p_p256dh, p_auth)
  ON CONFLICT (user_id, endpoint) DO UPDATE
    SET p256dh_key = EXCLUDED.p256dh_key,
        auth_key   = EXCLUDED.auth_key;

  RETURN jsonb_build_object('success', true);
END;
$$;
GRANT EXECUTE ON FUNCTION register_push_subscription(uuid,text,text,text) TO authenticated;

-- 5) ⭐ TRIGGER: every notification insert → call send-push edge function
CREATE OR REPLACE FUNCTION _send_push_on_notification_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_url text;
  v_key text;
  v_payload jsonb;
BEGIN
  -- ดึงค่า config ปัจจุบัน
  SELECT value INTO v_url FROM push_config WHERE key = 'edge_url';
  SELECT value INTO v_key FROM push_config WHERE key = 'service_role_key';

  -- ถ้ายังไม่ได้ตั้งค่า → ข้าม (แค่ insert notification ปกติ ไม่ส่ง push)
  IF v_url IS NULL OR v_url = '' OR v_key IS NULL OR v_key = '' OR v_key LIKE 'PUT_YOUR_%' THEN
    RETURN NEW;
  END IF;

  v_payload := jsonb_build_object(
    'user_id', NEW.user_id,
    'title',   NEW.title,
    'body',    NEW.body,
    'url',     '/',
    'icon',    '/assets/logo.png'
  );

  -- เรียก edge function แบบ async (ไม่รอ response — ไม่ block insert)
  PERFORM extensions.net.http_post(
    url := v_url,
    body := v_payload,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    timeout_milliseconds := 5000
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- ห้าม push fail ทำให้ insert fail — log แล้วผ่านไป
  RAISE WARNING '[push trigger] failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notifications_send_push ON notifications;
CREATE TRIGGER notifications_send_push
  AFTER INSERT ON notifications
  FOR EACH ROW EXECUTE FUNCTION _send_push_on_notification_insert();

-- 6) Helper RPC: ทดสอบส่ง push ให้ตัวเอง (debug)
CREATE OR REPLACE FUNCTION test_my_push(p_message text DEFAULT 'ทดสอบการแจ้งเตือน')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  INSERT INTO notifications (user_id, title, body, is_read)
  VALUES (v_user, '🔔 ทดสอบ Push', p_message, false);
  RETURN jsonb_build_object('success', true, 'message', 'Inserted; check your phone in 1-2 sec');
END;
$$;
GRANT EXECUTE ON FUNCTION test_my_push(text) TO authenticated;

-- 7) Cleanup helper: ลบ subscription เก่ากว่า 90 วันที่ไม่เคยส่งสำเร็จ
CREATE OR REPLACE FUNCTION cleanup_stale_push_subscriptions()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE v_count integer;
BEGIN
  DELETE FROM push_subscriptions WHERE created_at < now() - interval '90 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ============================================================
-- ตรวจสอบหลัง run
SELECT 'extensions.net (pg_net)' AS check_item,
  EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') AS ok
UNION ALL SELECT 'push_subscriptions table',
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='push_subscriptions')
UNION ALL SELECT 'push_config table',
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='push_config')
UNION ALL SELECT 'trigger notifications_send_push',
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='notifications_send_push')
UNION ALL SELECT 'rpc register_push_subscription',
  EXISTS (SELECT 1 FROM pg_proc WHERE proname='register_push_subscription');
-- ============================================================

-- ⚠️ AFTER RUNNING THIS MIGRATION:
--   1. UPDATE push_config SET value = 'YOUR_REAL_SERVICE_ROLE_KEY' WHERE key = 'service_role_key';
--      (หา key ที่ Settings → API → service_role secret)
--   2. Deploy edge function (ดู PUSH_SETUP.md)
--   3. ตั้ง ENV vars ใน Supabase Dashboard → Edge Functions → send-push → Secrets
--   4. ทดสอบ: SELECT test_my_push('ทดสอบครั้งแรก');
