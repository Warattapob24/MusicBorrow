-- ============================================================
-- MIGRATION: Learning Feed System (TikTok-style)
-- ขั้นตอน: เปิด Supabase Dashboard → SQL Editor → Paste ทั้งหมด → Run
-- รันได้หลายครั้ง (idempotent — IF NOT EXISTS / ON CONFLICT)
-- ============================================================

-- 1) เพิ่ม column learning_minutes ใน users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS learning_minutes integer NOT NULL DEFAULT 0;

-- 2) เพิ่ม caption ใน knowledge_links (สำหรับ user ใส่คำบรรยาย)
ALTER TABLE knowledge_links
  ADD COLUMN IF NOT EXISTS caption text;

-- 3) Table: learning_sessions (log แต่ละนาที + ตามประเภทเครื่อง)
CREATE TABLE IF NOT EXISTS learning_sessions (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  instrument_type text,
  knowledge_link_id integer REFERENCES knowledge_links(id) ON DELETE SET NULL,
  minutes_added integer NOT NULL CHECK (minutes_added > 0 AND minutes_added <= 30),
  exp_awarded integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_learning_sessions_user_time
  ON learning_sessions(user_id, created_at DESC);

-- RLS: user เห็นเฉพาะของตัวเอง (admin เห็นหมดผ่าน RPC)
ALTER TABLE learning_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS learning_sessions_self ON learning_sessions;
CREATE POLICY learning_sessions_self ON learning_sessions
  FOR SELECT USING (user_id = auth.uid());

-- 4) Table: system_settings (config ที่ admin ปรับได้)
CREATE TABLE IF NOT EXISTS system_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- เผื่อ table มีอยู่แล้วแต่ยังไม่มี description (ปลอดภัย)
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS description text;

-- ค่าเริ่มต้น (พร้อม description ภาษาไทยเพื่อให้แอดมินอ่านง่าย)
INSERT INTO system_settings (key, value, description) VALUES
  ('learning_exp_multiplier', '1',  'ตัวคูณ EXP ต่อ 1 นาทีของการเรียนรู้ (ค่าเริ่มต้น 1)'),
  ('learning_min_minutes',    '1',  'นาทีขั้นต่ำที่ระบบจะให้ EXP จากการเรียน (ป้องกัน spam)'),
  ('learning_max_minutes',    '30', 'นาทีสูงสุดต่อ 1 heartbeat (กันเปิดหน้าทิ้ง)')
ON CONFLICT (key) DO UPDATE SET description = COALESCE(system_settings.description, EXCLUDED.description);

-- ALL authenticated user อ่าน setting ได้
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS system_settings_read ON system_settings;
CREATE POLICY system_settings_read ON system_settings
  FOR SELECT USING (auth.role() = 'authenticated');

-- 5) RPC: ดึง knowledge links ที่ user "เห็นได้"
--   - approved = ทุกคนเห็น
--   - pending  = เห็นเฉพาะผู้ส่ง + admin
CREATE OR REPLACE FUNCTION get_visible_knowledge_links(p_instrument_type text DEFAULT NULL)
RETURNS SETOF knowledge_links
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT kl.* FROM knowledge_links kl
  WHERE (
    kl.is_approved = TRUE
    OR kl.submitted_by = auth.uid()
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  )
  AND (
    p_instrument_type IS NULL
    OR p_instrument_type = ''
    OR kl.instrument_type = p_instrument_type
  )
  ORDER BY kl.created_at DESC
  LIMIT 100;
$$;

-- 6) RPC: ส่งคลิปขออนุมัติ (ทุก role)
CREATE OR REPLACE FUNCTION submit_knowledge_link(
  p_title text,
  p_url text,
  p_instrument_type text,
  p_caption text DEFAULT NULL
)
RETURNS knowledge_links
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new knowledge_links%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;
  IF p_title IS NULL OR length(trim(p_title)) = 0 THEN
    RAISE EXCEPTION 'TITLE_REQUIRED';
  END IF;
  IF p_url IS NULL OR length(trim(p_url)) = 0 THEN
    RAISE EXCEPTION 'URL_REQUIRED';
  END IF;
  IF p_instrument_type IS NULL OR length(trim(p_instrument_type)) = 0 THEN
    RAISE EXCEPTION 'INSTRUMENT_TYPE_REQUIRED';
  END IF;

  INSERT INTO knowledge_links (title, youtube_url, instrument_type, submitted_by, is_approved, caption)
  VALUES (trim(p_title), trim(p_url), trim(p_instrument_type), auth.uid(), FALSE, p_caption)
  RETURNING * INTO v_new;

  RETURN v_new;
END;
$$;

-- 7) RPC: บันทึกนาทีเรียน (เรียกจาก heartbeat)
CREATE OR REPLACE FUNCTION add_learning_minutes(
  p_minutes integer,
  p_instrument_type text DEFAULT NULL,
  p_knowledge_link_id integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_multiplier numeric;
  v_min_min integer;
  v_max_min integer;
  v_exp integer;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  SELECT value::numeric INTO v_multiplier FROM system_settings WHERE key = 'learning_exp_multiplier';
  SELECT value::integer INTO v_min_min FROM system_settings WHERE key = 'learning_min_minutes';
  SELECT value::integer INTO v_max_min FROM system_settings WHERE key = 'learning_max_minutes';

  v_multiplier := COALESCE(v_multiplier, 1);
  v_min_min := COALESCE(v_min_min, 1);
  v_max_min := COALESCE(v_max_min, 30);

  IF p_minutes < v_min_min OR p_minutes > v_max_min THEN
    RAISE EXCEPTION 'MINUTES_OUT_OF_RANGE: min=% max=% got=%', v_min_min, v_max_min, p_minutes;
  END IF;

  v_exp := floor(p_minutes * v_multiplier)::integer;

  INSERT INTO learning_sessions (user_id, instrument_type, knowledge_link_id, minutes_added, exp_awarded)
  VALUES (v_user, p_instrument_type, p_knowledge_link_id, p_minutes, v_exp);

  -- เพิ่มเข้า users.learning_minutes (ค่ารวมเฉพาะ learning)
  UPDATE users
  SET learning_minutes = learning_minutes + p_minutes
  WHERE id = v_user;

  RETURN jsonb_build_object(
    'success', TRUE,
    'minutes_added', p_minutes,
    'exp_awarded', v_exp,
    'multiplier', v_multiplier
  );
END;
$$;

-- 8) RPC: ประวัติการเรียนรายประเภทเครื่อง
CREATE OR REPLACE FUNCTION get_user_learning_history(p_limit integer DEFAULT 50)
RETURNS TABLE(
  instrument_type text,
  total_minutes bigint,
  total_exp bigint,
  session_count bigint,
  last_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    COALESCE(instrument_type, '(ไม่ระบุ)') AS instrument_type,
    SUM(minutes_added)::bigint AS total_minutes,
    SUM(exp_awarded)::bigint AS total_exp,
    COUNT(*)::bigint AS session_count,
    MAX(created_at) AS last_at
  FROM learning_sessions
  WHERE user_id = auth.uid()
  GROUP BY COALESCE(instrument_type, '(ไม่ระบุ)')
  ORDER BY last_at DESC
  LIMIT p_limit;
$$;

-- 9) RPC: อ่าน setting (open ให้ทุก authenticated)
CREATE OR REPLACE FUNCTION get_system_setting(p_key text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT value FROM system_settings WHERE key = p_key;
$$;

-- 10) RPC: admin ปรับ setting
CREATE OR REPLACE FUNCTION update_system_setting(p_key text, p_value text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'ADMIN_ONLY';
  END IF;
  INSERT INTO system_settings (key, value, updated_at)
  VALUES (p_key, p_value, now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  RETURN jsonb_build_object('key', p_key, 'value', p_value);
END;
$$;

-- 11) RPC: admin อนุมัติ / ปฏิเสธ knowledge link + ส่งแจ้งเตือน
CREATE OR REPLACE FUNCTION admin_review_knowledge_link(
  p_link_id integer,
  p_approve boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_link knowledge_links%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'ADMIN_ONLY';
  END IF;

  SELECT * INTO v_link FROM knowledge_links WHERE id = p_link_id;
  IF v_link.id IS NULL THEN
    RAISE EXCEPTION 'LINK_NOT_FOUND';
  END IF;

  IF p_approve THEN
    UPDATE knowledge_links SET is_approved = TRUE WHERE id = p_link_id;
    IF v_link.submitted_by IS NOT NULL THEN
      INSERT INTO notifications (user_id, title, body, is_read)
      VALUES (
        v_link.submitted_by,
        '✅ คลิปของคุณได้รับการอนุมัติ',
        'คลิป "' || v_link.title || '" ขึ้นในหน้าเรียนรู้แล้ว',
        FALSE
      );
    END IF;
  ELSE
    DELETE FROM knowledge_links WHERE id = p_link_id;
    IF v_link.submitted_by IS NOT NULL THEN
      INSERT INTO notifications (user_id, title, body, is_read)
      VALUES (
        v_link.submitted_by,
        '❌ คลิปของคุณถูกปฏิเสธ',
        'คลิป "' || v_link.title || '" ไม่ผ่านการตรวจ',
        FALSE
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('success', TRUE, 'approved', p_approve);
END;
$$;

-- 12) Grant execute สำหรับ authenticated users
GRANT EXECUTE ON FUNCTION get_visible_knowledge_links(text)         TO authenticated;
GRANT EXECUTE ON FUNCTION submit_knowledge_link(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION add_learning_minutes(integer, text, integer)  TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_learning_history(integer)        TO authenticated;
GRANT EXECUTE ON FUNCTION get_system_setting(text)                  TO authenticated;
GRANT EXECUTE ON FUNCTION update_system_setting(text, text)         TO authenticated;
GRANT EXECUTE ON FUNCTION admin_review_knowledge_link(integer, boolean) TO authenticated;

-- ============================================================
-- ตรวจสอบหลัง run: ควรไม่มี error และ query นี้ต้องคืนผลลัพธ์
SELECT
  'users.learning_minutes'        AS check_item,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'learning_minutes') AS ok
UNION ALL SELECT 'learning_sessions table', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'learning_sessions')
UNION ALL SELECT 'system_settings table', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'system_settings')
UNION ALL SELECT 'rpc submit_knowledge_link', EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'submit_knowledge_link')
UNION ALL SELECT 'rpc add_learning_minutes', EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'add_learning_minutes');
-- ============================================================
