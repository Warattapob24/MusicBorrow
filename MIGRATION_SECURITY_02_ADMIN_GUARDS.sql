-- =====================================================================
-- MIGRATION_SECURITY_02_ADMIN_GUARDS.sql
-- รันลงฐานจริงแล้ว 2026-08-13 ผ่าน Supabase MCP apply_migration
--   20260813023459  security_guard_register_push_subscription
--   20260813023811  security_revoke_authenticated_internal_functions
--   20260813024314  security_guard_admin_rpcs_stage2
--   20260813024801  security_fix_wrapper_guard_and_anon_grants
--
-- ต่อจาก MIGRATION_SECURITY_01_LOCKDOWN_ANON.sql ซึ่งปิดฝั่ง `anon` ไปแล้ว
-- ไฟล์นี้จัดการฝั่ง `authenticated` — คือนักเรียนที่ล็อกอินแล้ว ซึ่งยังเรียก
-- SECURITY DEFINER ที่ไม่มีการตรวจสิทธิ์ได้ 131 ตัว
--
-- ⚠️ ไฟล์นี้เป็นบันทึกสิ่งที่รันไปแล้ว ไม่ต้องรันซ้ำ
-- =====================================================================


-- ---------------------------------------------------------------------
-- PART 1 — register_push_subscription: กัน push hijack
-- เดิมเชื่อ p_user_id จาก client → ใครก็ลงทะเบียนเครื่องตัวเองใต้ UUID ของเหยื่อได้
-- แล้วรับ push ของเหยื่อทุกฉบับ
--
-- FIX_PUSH_SUBSCRIPTION_UPSERT.sql:66 มี guard ที่ถูกต้อง แต่ส่วนที่เหลือของไฟล์นั้น
-- ไม่ตรงกับ production แล้ว: ประกาศ RETURNS void (ของจริงเป็น jsonb — CREATE OR REPLACE
-- เปลี่ยน return type ไม่ได้) และ ON CONFLICT (endpoint) (ของจริงเป็น (user_id, endpoint))
-- จึงหยิบมาเฉพาะ guard และคงบอดี้เดิมไว้ทุกบรรทัด
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_push_subscription(
  p_user_id uuid, p_endpoint text, p_p256dh text, p_auth text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'unauthorized: cannot register push for another user';
  END IF;
  IF p_user_id IS NULL OR p_endpoint IS NULL OR p_p256dh IS NULL OR p_auth IS NULL THEN
    RAISE EXCEPTION 'MISSING_FIELDS';
  END IF;
  INSERT INTO push_subscriptions (user_id, endpoint, p256dh_key, auth_key)
  VALUES (p_user_id, p_endpoint, p_p256dh, p_auth)
  ON CONFLICT (user_id, endpoint) DO UPDATE
    SET p256dh_key = EXCLUDED.p256dh_key, auth_key = EXCLUDED.auth_key;
  RETURN jsonb_build_object('success', true);
END;
$function$;
REVOKE ALL ON FUNCTION public.register_push_subscription(uuid,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_push_subscription(uuid,text,text,text) TO authenticated, service_role;


-- ---------------------------------------------------------------------
-- PART 2 — ตัดสิทธิ์ authenticated จากฟังก์ชันภายใน 61 ตัว
-- ตรวจแล้วว่าไม่มี client เรียก: ไม่อยู่ใน api.js (ไฟล์เดียวที่แตะ supabase ได้)
-- ไม่อยู่ใน student-groups/src (ใช้ .from('sg_*') อย่างเดียว ไม่มี .rpc เลย)
-- และไม่ถูกเรียกจาก SECURITY INVOKER function ที่นักเรียนจุดชนวนได้
-- service_role ยังเรียกได้ → pg_cron และ edge functions ไม่กระทบ
--
-- ⚠️ ยกเว้น notify_all_admins โดยตั้งใจ — ถูกเรียกจาก handle_new_repair_report และ
--    handle_new_take_home_request ซึ่งเป็น SECURITY INVOKER trigger ที่นักเรียนจุด
--    ถ้า revoke นักเรียนจะแจ้งซ่อม / ขอยืมกลับบ้านไม่ได้
-- ---------------------------------------------------------------------
-- (รายชื่อเต็ม 61 ตัว: admin_* ที่ไม่มี client เรียก, deactivate_user*, block_overdue_users,
--  get_all_users_with_email, find_auth_user_by_email, get_latest_signups, badge engine,
--  cron_*, dispatch_activity_reminders, cleanup_stale_push_subscriptions, notify_admins,
--  gcal_*, calendar_feed_events, approve_sg_request, reject_sg_request, sg_send_push,
--  และ RPC ยืม/คืนรุ่นเก่าที่ถูกแทนที่แล้ว)
-- REVOKE EXECUTE ON FUNCTION public.<each>(...) FROM authenticated, anon, PUBLIC;


-- ---------------------------------------------------------------------
-- PART 3 — ครอบ guard ให้ RPC แอดมิน 37 overloads ที่หน้าแอดมินเรียกจริง
-- (revoke ไม่ได้เพราะแอดมินก็เป็น `authenticated` เหมือนนักเรียน)
--
-- วิธี: rename ตัวเดิมเป็น <name>__inner → REVOKE จาก anon/authenticated/PUBLIC
--       → สร้าง <name> signature เดิมเป็น wrapper plpgsql บาง ๆ ที่เช็ค role แล้วเรียกต่อ
-- ข้อดี: บอดี้เดิมไม่ถูกแก้เลย เลี่ยง pitfall #5 (overload) และเลี่ยงความเสี่ยงจากการ
--        rewrite plpgsql/sql body (โดยเฉพาะ TABLE-returning sql function ที่ชื่อคอลัมน์
--        จะชนกับชื่อตัวแปรถ้าแปลงเป็น plpgsql ตรง ๆ)
--
-- guard ที่ใช้ (แยก 3 กรณีให้ถูก):
--   ไม่มี JWT เลย        → ผ่าน  (psql ตรง / pg_cron)
--   JWT role=service_role → ผ่าน  (edge functions)
--   นอกนั้น               → ต้องเป็น users.role='admin'
--
-- 🐛 บั๊กที่เกิดระหว่างทางและแก้แล้ว (สำคัญ — อย่าทำซ้ำ):
--   1. wrapper ที่ CREATE ใหม่ ได้ default privileges ของ Supabase กลับมา
--      → anon เรียกได้อีก 37 ตัว ต้อง REVOKE ซ้ำหลังสร้างเสมอ
--      (ALTER DEFAULT PRIVILEGES ผูกกับ role ที่รัน CREATE ต้องระบุ FOR ROLE ให้ตรง)
--   2. guard รุ่นแรกเขียน `auth.uid() IS NULL → ผ่าน` เพื่อให้ cron ผ่าน
--      แต่ anon JWT ก็มี sub เป็น NULL → guard ไม่กัน anon เลย
--      จึงเปลี่ยนมาเช็ค request.jwt.claims->>'role' แทน
-- ---------------------------------------------------------------------
-- ฟังก์ชันที่ถูกครอบ (37 overloads / 32 ชื่อ):
--   admin_adjust_xp, admin_complete_repair, admin_delete_instrument,
--   admin_force_return_instrument, admin_process_borrow_request,
--   admin_reset_all_practice_times, admin_update_instrument (4 overloads),
--   admin_update_repair, trigger_yearly_reset, update_user_profile_by_admin (2 overloads),
--   award_boss_video_reward, dispatch_due_date_reminders, dispatch_due_notifications,
--   admin_get_all_repair_history, admin_get_blocked_users, admin_get_live_borrowing_status,
--   admin_kit_history, admin_list_kit_requests, admin_list_kits, admin_list_part_types,
--   admin_list_swap_requests, admin_list_type_sections, admin_size_stock,
--   admin_staff_candidates, admin_staff_list, admin_swap_candidates, admin_uniform_damaged,
--   admin_uniform_size_report, admin_user_kits, get_admin_dashboard_stats (2 overloads),
--   get_admin_kpis, get_admin_leaderboards


-- =====================================================================
-- ผลทดสอบ (รันจริงบนฐาน production)
-- =====================================================================
-- | เคส                                             | ผล                |
-- |------------------------------------------------|-------------------|
-- | admin → admin_get_live_borrowing_status         | OK 2 rows         |
-- | admin → admin_user_kits / admin_staff_list      | OK                |
-- | admin → get_admin_dashboard_stats (รูปแบบ client) | OK              |
-- | student → admin_get_live_borrowing_status       | บล็อก 42501       |
-- | student → trigger_yearly_reset                  | บล็อก 42501       |
-- | student → update_user_profile_by_admin (13-arg) | บล็อก 42501       |
-- | anon JWT → trigger_yearly_reset                 | บล็อก ที่ตัว guard |
-- | service_role → admin_get_live_borrowing_status  | OK                |
-- | student → get_my_borrowed_items (ไม่ได้แตะ)      | OK                |
-- | __inner ทุกตัว authenticated เรียกได้ไหม          | ไม่ได้ (ถูก revoke) |
--
-- ยิงจาก internet ด้วย anon key จริง → 401 permission denied ทุกตัว:
--   trigger_yearly_reset, admin_reset_all_practice_times, deactivate_user_account,
--   admin_get_live_borrowing_status, get_all_users_with_email, admin_adjust_xp,
--   cleanup_stale_push_subscriptions  (sg_send_push ได้ 404 = หายจาก schema cache)
--   check_student_id_taken → 200 (ฟอร์มสมัครยังใช้ได้)


-- =====================================================================
-- สรุปตัวเลข
-- =====================================================================
--                                    ก่อน    หลัง SECURITY_01   หลัง SECURITY_02
-- anon เรียกได้                       265        1                 1
-- authenticated เรียกได้               265      265               198
-- SECURITY DEFINER ที่ไม่มี guard       131      131                30


-- =====================================================================
-- งานต่อ
-- =====================================================================
-- ฝั่งนักเรียนที่รับ user id จาก client (IDOR) แก้แล้วในชุดที่ 3
-- ดู MIGRATION_SECURITY_03_XSS_IDOR_AND_VIEW.sql
--
-- รายการที่ยังไม่ได้ปิด เก็บไว้นอก repo ที่ SECURITY_REMAINING.local.md
-- (repo นี้เป็น public จึงไม่ระบุรายละเอียดไว้ในไฟล์ที่ tracked)
