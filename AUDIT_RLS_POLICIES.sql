-- ═══════════════════════════════════════════════════════════════════════════
-- 🛡️ AUDIT RLS POLICIES — ระบบยืมคืนเครื่องดนตรี v5.2
-- ═══════════════════════════════════════════════════════════════════════════
-- 📍 รันที่: Supabase Dashboard → SQL Editor (ไม่ใช่ PowerShell!)
-- 🎯 จุดประสงค์: ตรวจสอบความปลอดภัยของ Row Level Security policies
--               โดยเฉพาะหลังการแก้ Google OAuth register flow
--
-- 💡 วิธีใช้: รันทีละ Section (1-6) แล้วอ่านผลลัพธ์ตาม comment
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ SECTION 1: ตรวจว่า RLS เปิดอยู่บนทุกตารางสำคัญหรือไม่                       ║
-- ║ ⚠️ ถ้า RLS = false บนตารางใด = ใครก็เข้าได้ทุกคน (อันตรายสุด!)             ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

SELECT
    schemaname,
    tablename,
    rowsecurity AS rls_enabled,
    CASE
        WHEN rowsecurity = false THEN '🔴 อันตราย! RLS ปิดอยู่'
        ELSE '✅ ปลอดภัย'
    END AS status
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'users', 'instruments', 'borrow_logs',
    'notifications', 'push_subscriptions', 'push_config',
    'system_settings', 'scheduled_notifications',
    'learning_sessions', 'knowledge_links',
    'repair_logs', 'practice_sessions', 'game_sessions',
    'badges', 'badge_definitions',
    'bosses', 'boss_raids', 'boss_requests',
    'raid_lobbies', 'raid_participants', 'quests'
  )
ORDER BY rowsecurity ASC, tablename;

-- ✅ ผลลัพธ์ที่ต้องการ: ทุกแถว rls_enabled = true
-- 🔴 ถ้าเจอ false → ต้องรัน: ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ SECTION 2: ดู policies ทั้งหมดบนตาราง 'users' (จุดที่เพิ่งแก้)               ║
-- ║ 🎯 โฟกัส: INSERT policy ต้องมี WITH CHECK (auth.uid() = id)                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

SELECT
    policyname,
    cmd          AS operation,
    permissive,
    roles,
    qual         AS "USING (read filter)",
    with_check   AS "WITH CHECK (write filter)"
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'users'
ORDER BY cmd, policyname;

-- ✅ ผลที่ต้องเห็นอย่างน้อย:
--    - INSERT policy: WITH CHECK = (auth.uid() = id)
--      ↑ เพื่อกัน user manipulate userId ใน formData
--    - UPDATE policy: USING = (auth.uid() = id), WITH CHECK = (auth.uid() = id)
--      ↑ กันแก้โปรไฟล์คนอื่น
--    - SELECT policy: USING = (auth.uid() = id) OR role-check สำหรับ admin
--    - DELETE policy: ห้ามมี (หรือจำกัดเฉพาะ service_role)


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ SECTION 3: ตรวจหา "WEAK POLICIES" — policies ที่อนุญาตทุกคนเข้าถึง           ║
-- ║ 🚨 ตัวร้าย: USING (true) หรือ WITH CHECK (true) — เปิดประตูบ้านทิ้งไว้      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

SELECT
    tablename,
    policyname,
    cmd       AS operation,
    qual      AS "USING expression",
    with_check AS "WITH CHECK expression",
    CASE
        WHEN qual = 'true' OR qual IS NULL AND cmd = 'SELECT'
            THEN '🔴 อ่านได้ทุกคน'
        WHEN with_check = 'true'
            THEN '🔴 เขียนได้ทุกคน — อันตรายสุด!'
        WHEN qual ILIKE '%true%' AND length(qual) < 10
            THEN '🟠 อาจอ่อนแอ — ตรวจสอบ'
        ELSE '✅ OK'
    END AS risk_level
FROM pg_policies
WHERE schemaname = 'public'
  AND (
    qual = 'true'
    OR with_check = 'true'
    OR (qual IS NULL AND cmd = 'SELECT')
  )
ORDER BY tablename;

-- ✅ ผลที่ต้องการ: ไม่มีแถวเลย หรือมีเฉพาะ table ที่ตั้งใจให้อ่านสาธารณะ
--                 (เช่น badge_definitions, instruments สำหรับ student อ่าน)


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ SECTION 4: ตรวจ policies ที่ "ไม่มี" บน operation สำคัญ                     ║
-- ║ ⚠️ ถ้า table มี RLS เปิด แต่ไม่มี policy เลย = ไม่มีใครเข้าได้แม้แต่ตัวเอง   ║
-- ║    (หรือเข้าได้เฉพาะ service_role)                                          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

WITH tables_with_rls AS (
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public' AND rowsecurity = true
),
operations AS (
    SELECT 'SELECT'::text AS op UNION ALL
    SELECT 'INSERT' UNION ALL
    SELECT 'UPDATE' UNION ALL
    SELECT 'DELETE'
),
expected AS (
    SELECT t.tablename, o.op
    FROM tables_with_rls t CROSS JOIN operations o
),
actual AS (
    SELECT tablename, cmd AS op
    FROM pg_policies
    WHERE schemaname = 'public'
)
SELECT
    e.tablename,
    e.op AS missing_operation,
    '🟠 ไม่มี policy — operation นี้ทำไม่ได้ (ยกเว้น service_role)' AS note
FROM expected e
LEFT JOIN actual a ON e.tablename = a.tablename AND e.op = a.op
WHERE a.tablename IS NULL
  AND e.tablename IN ('users','borrow_logs','notifications','knowledge_links',
                      'repair_logs','boss_raids','learning_sessions')
ORDER BY e.tablename, e.op;

-- ℹ️ ผลที่ยอมรับได้:
--    - 'users' DELETE missing  → ดี (ห้ามลบ user เอง)
--    - 'borrow_logs' DELETE missing → ดี
-- ⚠️ ผลที่ต้องดู:
--    - 'users' INSERT missing → user ใหม่ลงทะเบียนไม่ได้ (!! ปัญหา Google OAuth)
--    - 'notifications' SELECT missing → user เห็น notification ตัวเองไม่ได้


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ SECTION 5: ทดสอบ policy ของ users ด้วยการ "สวมรอย" auth context             ║
-- ║ 🧪 จำลองว่าตัวเองเป็น user คนหนึ่ง แล้วลอง INSERT/UPDATE ดู                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- 5.1 ดู uid ของ user ทดสอบ (เปลี่ยน email เป็น user จริงในระบบ)
SELECT id, email, created_at
FROM auth.users
WHERE email LIKE '%@%'
ORDER BY created_at DESC
LIMIT 3;
-- 👉 จด UUID หนึ่งไว้ เช่น 'aaaa-bbbb-cccc-dddd' สำหรับใช้ในข้อ 5.2

-- 5.2 ทดลอง INSERT ปลอม (ตัวบุคคล A พยายามใส่ user_id ของบุคคล B)
-- ⚠️ ห้ามรันใน production จริง — ใช้ branch หรือ rollback transaction
BEGIN;

-- จำลองเป็น user A
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'AAAA-AAAA-AAAA-AAAA';   -- ← UUID ของ user A

-- พยายาม INSERT โดยใช้ id ของคนอื่น (BBBB)
INSERT INTO public.users (id, email, first_name, last_name, role)
VALUES (
    'BBBB-BBBB-BBBB-BBBB'::uuid,   -- ← UUID ของ user B (ไม่ใช่ตัวเอง)
    'evil@test.com', 'Evil', 'Hacker', 'admin'
);
-- ✅ ผลที่ต้องการ: ERROR: new row violates row-level security policy
-- 🔴 ถ้า INSERT ผ่าน = ช่องโหว่! ใครก็ register แทนคนอื่นได้

ROLLBACK;   -- ยกเลิกทุกอย่าง ไม่ให้ข้อมูลทดสอบค้าง


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ SECTION 6: ดู policies บน push_config (ข้อมูลลับสุด!)                       ║
-- ║ 🚨 ตารางนี้เก็บ service_role_key — ถ้าหลุดจะ pwn ทั้งระบบ                    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

SELECT
    policyname,
    cmd,
    roles,
    qual,
    with_check,
    CASE
        WHEN cmd = 'SELECT' AND qual = 'true'
            THEN '🔴 CRITICAL — ทุกคนอ่าน service_role_key ได้!'
        WHEN 'authenticated' = ANY(roles) AND cmd = 'SELECT'
            THEN '🟠 ระวัง — authenticated user อ่านได้'
        ELSE '✅ จำกัดสิทธิ์อยู่'
    END AS risk
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'push_config';

-- ✅ ผลที่ปลอดภัย:
--    - ไม่มี policy เลย (เข้าได้แต่ service_role)
--    - หรือ policy จำกัดเฉพาะ role = 'admin'
-- 🔴 ถ้าเห็น qual = 'true' หรือ roles มี 'anon'/'authenticated' = แก้ด่วน!


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ SECTION 7 (BONUS): นับ policies ตามตาราง — ดูภาพรวม                        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

SELECT
    tablename,
    COUNT(*) FILTER (WHERE cmd = 'SELECT') AS select_policies,
    COUNT(*) FILTER (WHERE cmd = 'INSERT') AS insert_policies,
    COUNT(*) FILTER (WHERE cmd = 'UPDATE') AS update_policies,
    COUNT(*) FILTER (WHERE cmd = 'DELETE') AS delete_policies,
    COUNT(*) AS total
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY total DESC, tablename;


-- ═══════════════════════════════════════════════════════════════════════════
-- 🛠️ SECTION 8: SQL Template สำหรับ "แก้" ถ้าเจอช่องโหว่
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ อย่ารันถ้ายังไม่เจอช่องโหว่ — ดูผล Section 1-7 ก่อน
-- ⚠️ ถ้าจะรัน แนะนำใช้ Supabase Branch ก่อน (อย่ารันบน production ตรงๆ)

/*
-- 8.1 บังคับ RLS ทุกตารางสำคัญ
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.borrow_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_config ENABLE ROW LEVEL SECURITY;

-- 8.2 ลบ weak policy (ถ้าเจอจาก Section 3)
DROP POLICY IF EXISTS "Enable all access" ON public.users;
DROP POLICY IF EXISTS "Public read" ON public.users;

-- 8.3 SET policies ที่ถูกต้องสำหรับ 'users' table
--     (สำคัญที่สุด — เพื่อปิดช่องโหว่ Google OAuth)

-- 📝 INSERT: user สร้าง row ของตัวเองเท่านั้น
CREATE POLICY "users_insert_self"
ON public.users FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- 📝 SELECT: user อ่านได้แต่ตัวเอง + admin อ่านได้หมด
CREATE POLICY "users_select_self_or_admin"
ON public.users FOR SELECT
TO authenticated
USING (
    auth.uid() = id
    OR EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role = 'admin'
    )
);

-- 📝 UPDATE: user แก้ของตัวเอง + admin แก้ได้หมด
--     แต่ user ห้ามแก้ role ของตัวเอง!
CREATE POLICY "users_update_self_no_role"
ON public.users FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (
    auth.uid() = id
    AND role = (SELECT role FROM public.users WHERE id = auth.uid())
);

CREATE POLICY "users_update_admin_all"
ON public.users FOR UPDATE
TO authenticated
USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
);

-- 📝 DELETE: เฉพาะ service_role เท่านั้น (ไม่สร้าง policy = ไม่มีใครลบได้)
-- (จงใจไม่สร้าง DELETE policy)

-- 8.4 ปิดประตู push_config (ห้าม client เข้าเด็ดขาด)
DROP POLICY IF EXISTS "push_config_read" ON public.push_config;
-- (ไม่สร้าง policy ใดๆ = เฉพาะ service_role / Edge Function อ่านได้)
*/


-- ═══════════════════════════════════════════════════════════════════════════
-- 📋 CHECKLIST สรุป (รันทุกข้อแล้วเช็คใจตัวเอง)
-- ═══════════════════════════════════════════════════════════════════════════
-- [ ] Section 1: ทุกตารางสำคัญ rls_enabled = true
-- [ ] Section 2: 'users' มี INSERT policy ที่ WITH CHECK (auth.uid() = id)
-- [ ] Section 3: ไม่เจอ policy ที่ qual = 'true' หรือ with_check = 'true'
--               (ยกเว้น table ตั้งใจให้สาธารณะ เช่น badge_definitions)
-- [ ] Section 4: ไม่มี missing operation ที่จำเป็น (เช่น users INSERT)
-- [ ] Section 5: INSERT id ของคนอื่น → ERROR (RLS reject)
-- [ ] Section 6: push_config ไม่มี policy ที่ authenticated/anon อ่านได้
-- [ ] Section 7: ทุก table สำคัญมี policies > 0
-- ═══════════════════════════════════════════════════════════════════════════
