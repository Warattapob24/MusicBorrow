-- ═══════════════════════════════════════════════════════════════════════════
-- 🛠️ ADMIN NOTIFICATIONS — STEP 01: Schema Migration
-- ═══════════════════════════════════════════════════════════════════════════
-- 📍 รันที่: Supabase SQL Editor
-- 🎯 เพิ่ม columns + helper RPC ที่จะใช้กับ Steps 02 + 03
-- ⏱️ เวลา: ~1 นาที
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ STEP 1.1 — เพิ่ม columns ใน notifications สำหรับ admin alerts             ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

ALTER TABLE public.notifications
    ADD COLUMN IF NOT EXISTS category text,            -- security|user|operation|learning|system
    ADD COLUMN IF NOT EXISTS severity text DEFAULT 'info' CHECK (severity IN ('info','warning','critical')),
    ADD COLUMN IF NOT EXISTS target_role text DEFAULT 'student' CHECK (target_role IN ('student','admin','all')),
    ADD COLUMN IF NOT EXISTS is_admin_alert boolean DEFAULT false,
    ADD COLUMN IF NOT EXISTS metadata jsonb,           -- เก็บ entity_id, action, context
    ADD COLUMN IF NOT EXISTS dedupe_key text,          -- กัน notif ซ้ำ
    ADD COLUMN IF NOT EXISTS acknowledged_by uuid,     -- admin คนที่กด acknowledge
    ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz;

COMMENT ON COLUMN public.notifications.category IS 'security|user|operation|learning|system';
COMMENT ON COLUMN public.notifications.severity IS 'info|warning|critical';
COMMENT ON COLUMN public.notifications.target_role IS 'student|admin|all';
COMMENT ON COLUMN public.notifications.dedupe_key IS 'unique-ish per category+entity, ใช้กัน spam';


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ STEP 1.2 — Index เพื่อ query เร็ว                                          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE INDEX IF NOT EXISTS idx_notif_admin_unread
    ON public.notifications (target_role, is_read, created_at DESC)
    WHERE is_admin_alert = true;

CREATE INDEX IF NOT EXISTS idx_notif_dedupe
    ON public.notifications (dedupe_key, created_at DESC)
    WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notif_severity
    ON public.notifications (severity, created_at DESC)
    WHERE is_admin_alert = true;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ STEP 1.3 — Backfill ข้อมูลเดิม                                             ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ของเดิม (student notifications) → set target_role = 'student'
UPDATE public.notifications
SET target_role = 'student'
WHERE target_role IS NULL;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ STEP 1.4 — RPC หลัก: notify_admins() — INSERT alert ให้ admin ทุกคน         ║
-- ║ ⚙️ จะถูกเรียกจาก triggers และ cron jobs                                    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public.notify_admins(
    p_category   text,
    p_severity   text,
    p_title      text,
    p_body       text,
    p_metadata   jsonb DEFAULT NULL,
    p_dedupe_key text DEFAULT NULL,            -- ถ้าใส่ → ตรวจ dedup 30 นาทีย้อนหลัง
    p_dedupe_minutes int DEFAULT 30
)
RETURNS int                                    -- จำนวน admin ที่ได้รับ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_count int := 0;
    v_admin_id uuid;
    v_full_title text;
BEGIN
    -- เช็ค dedup ก่อน
    IF p_dedupe_key IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM public.notifications
            WHERE dedupe_key = p_dedupe_key
              AND created_at > now() - (p_dedupe_minutes || ' minutes')::interval
        ) THEN
            RETURN 0;  -- ส่งซ้ำใน window — skip
        END IF;
    END IF;

    -- ใส่ prefix emoji ตาม severity เพื่อให้ admin scan เร็ว
    v_full_title := CASE p_severity
        WHEN 'critical' THEN '🔴 ' || p_title
        WHEN 'warning'  THEN '🟠 ' || p_title
        ELSE                  '🔵 ' || p_title
    END;

    -- Loop INSERT ให้ admin ทุกคน
    FOR v_admin_id IN
        SELECT id FROM public.users WHERE role = 'admin' AND COALESCE(is_blocked, false) = false
    LOOP
        INSERT INTO public.notifications
            (user_id, title, body, category, severity, target_role, is_admin_alert, metadata, dedupe_key, is_read)
        VALUES
            (v_admin_id, v_full_title, p_body, p_category, p_severity, 'admin', true, p_metadata, p_dedupe_key, false);
        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_admins(text,text,text,text,jsonb,text,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_admins(text,text,text,text,jsonb,text,int)
    TO service_role;
-- ⚠️ ห้าม grant authenticated — function นี้เป็น internal เท่านั้น
-- ถูกเรียกผ่าน triggers (SECURITY DEFINER) หรือ Edge Functions


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ STEP 1.5 — RPC: admin_acknowledge_notification(id)                       ║
-- ║ ⚙️ ให้ admin กด "รับทราบ" → ปิด notification                              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public.admin_acknowledge_notification(p_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF get_my_role() <> 'admin' THEN
        RAISE EXCEPTION 'unauthorized: admin only';
    END IF;

    UPDATE public.notifications
    SET is_read = true,
        acknowledged_by = auth.uid(),
        acknowledged_at = now()
    WHERE id = p_id AND is_admin_alert = true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_acknowledge_notification(bigint) TO authenticated;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ STEP 1.6 — RPC: admin_unread_counts_by_category()                        ║
-- ║ ⚙️ คืน count แยกตาม category — ใช้แสดง badge ใน UI                         ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public.admin_unread_counts_by_category()
RETURNS TABLE(category text, severity text, cnt bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT n.category, n.severity, COUNT(*)::bigint
    FROM public.notifications n
    WHERE n.user_id = auth.uid()
      AND n.is_admin_alert = true
      AND n.is_read = false
    GROUP BY n.category, n.severity
    ORDER BY
        CASE n.severity WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
        n.category;
$$;

GRANT EXECUTE ON FUNCTION public.admin_unread_counts_by_category() TO authenticated;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ ✅ VERIFY                                                                   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ตรวจ schema
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'notifications'
  AND column_name IN ('category','severity','target_role','is_admin_alert','metadata','dedupe_key','acknowledged_by','acknowledged_at')
ORDER BY column_name;

-- ตรวจ RPCs
SELECT proname FROM pg_proc
WHERE proname IN ('notify_admins','admin_acknowledge_notification','admin_unread_counts_by_category');

-- 🧪 ทดสอบ notify_admins (จะต้องมี admin อย่างน้อย 1 คนใน users)
SELECT public.notify_admins(
    'system'::text,
    'info'::text,
    'Test alert',
    'นี่คือการทดสอบระบบ — ลบทิ้งได้',
    jsonb_build_object('source', 'install_test'),
    'test_install_' || extract(epoch from now())::text
) AS admins_notified;

-- ลบ notif ทดสอบทิ้ง
DELETE FROM public.notifications
WHERE dedupe_key LIKE 'test_install_%';
