-- =====================================================================
-- MIGRATION_SECURITY_01_LOCKDOWN_ANON.sql
-- รันลงฐานจริงแล้ว 2026-08-13 ผ่าน Supabase MCP apply_migration
-- (4 migrations: 20260813020506, 20260813020554, 20260813020653, 20260813022415)
--
-- ที่มา: security review 2026-08-13 พบว่า 264 จาก 265 functions ใน schema public
-- เป็น SECURITY DEFINER ที่ไม่มีการตรวจสิทธิ์ และ `anon` เรียกได้ทั้งหมด
-- แปลว่าใครก็ตามที่ถือ anon key จาก config.js (ซึ่งเป็น public โดยออกแบบ)
-- เรียก trigger_yearly_reset / deactivate_user_account / admin_get_live_borrowing_status
-- ได้โดยไม่ต้องล็อกอิน
--
-- ⚠️ ไฟล์นี้เป็นบันทึกสิ่งที่รันไปแล้ว ไม่ต้องรันซ้ำ
-- =====================================================================


-- ---------------------------------------------------------------------
-- STEP 1 — ตัดสิทธิ์ anon เรียก RPC ทั้ง schema
-- คงสิทธิ์ authenticated + service_role ไว้ "เท่าเดิมทุกตัว" โดย snapshot
-- ก่อน revoke แล้ว grant คืน จึงไม่กระทบผู้ใช้ที่ล็อกอินแล้ว / edge functions / cron
-- (edge functions ทั้ง 3 ตัวใช้ SUPABASE_SERVICE_ROLE_KEY ตรวจแล้ว)
-- ---------------------------------------------------------------------
DO $$
DECLARE
  sig        text;
  auth_sigs  text[];
  svc_sigs   text[];
  n_revoked  int := 0;
BEGIN
  SELECT array_agg(p.oid::regprocedure::text) INTO auth_sigs
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind IN ('f','p')
    AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e');

  SELECT array_agg(p.oid::regprocedure::text) INTO svc_sigs
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind IN ('f','p')
    AND has_function_privilege('service_role', p.oid, 'EXECUTE')
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e');

  FOR sig IN
    SELECT p.oid::regprocedure::text
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind IN ('f','p')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', sig);
    n_revoked := n_revoked + 1;
  END LOOP;

  IF auth_sigs IS NOT NULL THEN
    FOREACH sig IN ARRAY auth_sigs LOOP
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', sig);
    END LOOP;
  END IF;

  IF svc_sigs IS NOT NULL THEN
    FOREACH sig IN ARRAY svc_sigs LOOP
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', sig);
    END LOOP;
  END IF;

  RAISE NOTICE 'revoked anon+PUBLIC on % functions; restored % authenticated, % service_role',
    n_revoked, coalesce(array_length(auth_sigs,1),0), coalesce(array_length(svc_sigs,1),0);
END $$;

-- RPC ตัวเดียวที่ฟอร์มสมัครสมาชิกต้องใช้ก่อนล็อกอิน (auth.js:119, auth.js:194)
GRANT EXECUTE ON FUNCTION public.check_student_id_taken(text) TO anon;


-- ---------------------------------------------------------------------
-- STEP 2 — เปิด RLS ตารางที่หลุด (relrowsecurity = false + anon มีสิทธิ์ CRUD เต็ม)
-- ทั้ง 3 ตารางนี้ไม่อยู่ในลิสต์ที่ AUDIT_RLS_POLICIES.sql ไล่ตรวจ จึงรอดมาตลอด
--
-- ⚠️ increment_user_xp_auto() เป็น SECURITY INVOKER และถูกเรียกโดยนักเรียนที่ล็อกอิน
--    มัน INSERT exp_logs และ SELECT xp_event_rules → policy ต้องเผื่อไว้พอดี ไม่มาก ไม่น้อย
-- ---------------------------------------------------------------------

-- exp_logs (audit trail ของ XP)
ALTER TABLE public.exp_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.exp_logs FROM anon;

CREATE POLICY "exp_logs_select_own_or_admin" ON public.exp_logs
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

-- จำเป็นสำหรับ increment_user_xp_auto (SECURITY INVOKER) — ตรึงไว้ที่แถวของตัวเอง
-- ผลพลอยได้: ปิด IDOR เดิมที่ส่ง p_user_id เป็นของคนอื่นได้
CREATE POLICY "exp_logs_insert_self" ON public.exp_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ตั้งใจไม่มี UPDATE/DELETE policy: audit trail ต้องลบ/แก้ไม่ได้
-- admin_adjust_xp() เป็น SECURITY DEFINER จึงข้าม RLS ได้ตามปกติ

-- xp_event_rules (กติกาตัวคูณ XP)
ALTER TABLE public.xp_event_rules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.xp_event_rules FROM anon;

CREATE POLICY "xp_event_rules_select_authenticated" ON public.xp_event_rules
  FOR SELECT TO authenticated USING (true);   -- increment_user_xp_auto ต้องอ่าน

CREATE POLICY "xp_event_rules_write_admin" ON public.xp_event_rules
  FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'));

-- settings (key/value ของระบบ)
-- ผู้ใช้ทุกตัวเป็น SECURITY DEFINER (get_system_setting, update_system_setting,
-- calendar_feed_events, gcal_trigger_sync, admin_*_calendar_token, get/admin_set_uniform_*)
-- จึงไม่ต้องมี policy เลย: RLS on + 0 policies = deny-all
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.settings FROM anon;


-- ---------------------------------------------------------------------
-- STEP 3 — กันปัญหาเดิมกลับมา
-- ค่า default ของ Postgres/Supabase คือ grant EXECUTE ให้ PUBLIC/anon ทุกฟังก์ชันใหม่
-- ซึ่งเป็นสาเหตุที่ 264 ฟังก์ชันเปิดโล่ง ต่อจากนี้ต้อง GRANT เองทีละตัว
-- ---------------------------------------------------------------------
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;


-- ---------------------------------------------------------------------
-- STEP 4 — SECURITY DEFINER view ที่ anon อ่านได้
-- view ไม่ใช่ function จึงไม่โดน REVOKE ... ON FUNCTION ใน STEP 1
-- ---------------------------------------------------------------------
REVOKE ALL ON public.admin_users_with_activity FROM anon;


-- =====================================================================
-- ตรวจผล
-- =====================================================================
-- anon ต้องเหลือเรียกได้ฟังก์ชันเดียว: check_student_id_taken(text)
SELECT p.oid::regprocedure::text AS anon_still_allowed
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND has_function_privilege('anon', p.oid, 'EXECUTE');

-- authenticated / service_role ต้องยังครบ 265
SELECT count(*) AS total,
  count(*) FILTER (WHERE has_function_privilege('anon', p.oid, 'EXECUTE'))          AS anon_exec,
  count(*) FILTER (WHERE has_function_privilege('authenticated', p.oid, 'EXECUTE')) AS auth_exec,
  count(*) FILTER (WHERE has_function_privilege('service_role', p.oid, 'EXECUTE'))  AS svc_exec
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prokind IN ('f','p');

-- ตารางใน public ที่ยัง RLS ปิดอยู่ (ควรเหลือแค่ display_state ของ QSing)
SELECT c.relname
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
ORDER BY 1;


-- =====================================================================
-- งานต่อ
-- =====================================================================
-- ชุดที่ 2 (MIGRATION_SECURITY_02_ADMIN_GUARDS.sql) จัดการฝั่ง `authenticated`
-- ชุดที่ 3 (MIGRATION_SECURITY_03_XSS_IDOR_AND_VIEW.sql) จัดการ XSS / IDOR / view
--
-- รายการที่ยังไม่ได้ปิด เก็บไว้นอก repo ที่ SECURITY_REMAINING.local.md
-- (repo นี้เป็น public จึงไม่ระบุรายละเอียดไว้ในไฟล์ที่ tracked)
