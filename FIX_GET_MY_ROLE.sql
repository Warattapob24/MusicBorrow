-- ═══════════════════════════════════════════════════════════════════════════
-- 🛠️ FIX get_my_role() — เพิ่ม SECURITY DEFINER + STABLE + search_path
-- ═══════════════════════════════════════════════════════════════════════════
-- 📍 รันที่: Supabase SQL Editor
-- ⚠️ รันก่อน FIX_RLS_POLICIES.sql เสมอ (ถ้า CHECK ขึ้น 🔴)
--
-- 💡 ทำไมต้องแก้:
--    - SECURITY DEFINER → function รันด้วยสิทธิ์ของ "ผู้สร้าง function" → bypass RLS ของ users
--                         ป้องกัน infinite recursion เวลา policy เรียก function ที่ query users
--    - STABLE          → PostgreSQL cache ผลลัพธ์ในระหว่าง query เดียว → เร็วขึ้นมาก
--                         (เรียก 100 ครั้งใน 1 query = run จริง 1 ครั้ง)
--    - search_path     → ป้องกัน SQL injection ผ่าน schema spoofing (security best practice)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
STABLE                                    -- 🟢 cache ใน query เดียว
SECURITY DEFINER                          -- 🟢 รันด้วยสิทธิ์ owner → bypass RLS
SET search_path = public, pg_temp         -- 🟢 ป้องกัน schema spoofing
AS $$
    SELECT role FROM public.users WHERE id = auth.uid();
$$;

-- จำกัดสิทธิ์การเรียก function (เฉพาะ authenticated user)
REVOKE ALL ON FUNCTION public.get_my_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- ✅ verify อีกครั้ง — ต้องขึ้น 'DEFINER ✅' และ 'STABLE ✅'
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
    p.proname,
    CASE WHEN p.prosecdef THEN 'DEFINER ✅' ELSE 'INVOKER 🔴' END AS security_mode,
    CASE p.provolatile WHEN 's' THEN 'STABLE ✅' ELSE 'NOT STABLE 🔴' END AS volatility,
    p.proconfig AS search_path
FROM pg_proc p
WHERE p.proname = 'get_my_role';
