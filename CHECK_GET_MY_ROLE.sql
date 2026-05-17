-- ═══════════════════════════════════════════════════════════════════════════
-- 🔍 ตรวจ metadata ของ get_my_role() ว่าปลอดภัยพอ
-- ═══════════════════════════════════════════════════════════════════════════
-- 📍 รันที่: Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

SELECT
    p.proname                              AS function_name,
    CASE WHEN p.prosecdef THEN 'DEFINER ✅' ELSE 'INVOKER 🔴' END AS security_mode,
    CASE p.provolatile
        WHEN 'i' THEN 'IMMUTABLE'
        WHEN 's' THEN 'STABLE ✅'
        WHEN 'v' THEN 'VOLATILE 🟡 (ควรเป็น STABLE)'
    END AS volatility,
    pg_get_function_identity_arguments(p.oid) AS arguments,
    p.proconfig                            AS search_path_setting,
    pg_get_userbyid(p.proowner)            AS owner,
    -- คำแนะนำสรุป
    CASE
        WHEN p.prosecdef = false THEN '🔴 FIX REQUIRED — ต้องเปลี่ยนเป็น SECURITY DEFINER'
        WHEN p.provolatile = 'v' THEN '🟡 ควรเปลี่ยนเป็น STABLE (performance)'
        WHEN p.proconfig IS NULL THEN '🟡 ควรกำหนด search_path = public, pg_temp (security)'
        ELSE '✅ พร้อมใช้งาน'
    END AS recommendation
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'get_my_role'
  AND n.nspname IN ('public', 'auth');

-- ═══════════════════════════════════════════════════════════════════════════
-- 📋 ผลลัพธ์ที่ "ปลอดภัย":
--   - security_mode = 'DEFINER ✅'
--   - volatility   = 'STABLE ✅'
--   - search_path_setting ไม่เป็น null
-- ═══════════════════════════════════════════════════════════════════════════
