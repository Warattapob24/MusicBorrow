-- ═══════════════════════════════════════════════════════════════════════════
-- 🛠️ FIX RLS POLICIES — ปะช่องโหว่ 7 จุดจาก Audit
-- ═══════════════════════════════════════════════════════════════════════════
-- 📍 รันที่: Supabase SQL Editor
-- ⚠️ คำเตือน: รันทีละ Section, อ่าน comment ก่อนรัน
-- 🛟 แนะนำ: ใช้ Supabase "Branching" สร้าง preview branch ก่อนรันบน production
--          (Dashboard → Branches → Create branch → ทดสอบ → Merge)
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ STEP 0: BACKUP — สำคัญที่สุด! รันก่อนเสมอ                                 ║
-- ║ คัดลอกผลลัพธ์ของ query นี้ไปเก็บไว้ใน .txt — เผื่อต้อง rollback           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

SELECT
    schemaname || '.' || tablename AS table_name,
    policyname,
    cmd,
    roles::text,
    qual,
    with_check,
    -- สร้าง CREATE POLICY statement สำหรับ rollback (เผื่อกรณีฉุกเฉิน)
    format(
        'CREATE POLICY %I ON %I.%I FOR %s TO %s%s%s;',
        policyname, schemaname, tablename, cmd,
        array_to_string(roles, ', '),
        CASE WHEN qual IS NOT NULL THEN ' USING (' || qual || ')' ELSE '' END,
        CASE WHEN with_check IS NOT NULL THEN ' WITH CHECK (' || with_check || ')' ELSE '' END
    ) AS rollback_sql
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('users', 'bosses', 'boss_requests', 'instruments', 'raid_lobbies', 'knowledge_links')
ORDER BY tablename, cmd, policyname;

-- 👉 Copy ผลลัพธ์ทั้งหมดไปเก็บไว้ใน NOTES_BACKUP.txt ก่อนทำขั้นถัดไป!


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ STEP 1: 🔴 ปิดช่องโหว่ #1 — Anyone (anon) insert users                    ║
-- ║ ผลกระทบ: ทุก user signup จะต้องผ่าน authenticated context (ดีกว่าเดิม)    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

DROP POLICY IF EXISTS "Allow signup insert" ON public.users;

-- ⚠️ หมายเหตุ: ถ้า Edge Function `sign-up` ใช้ anon key เพื่อ insert
--            จะต้องเปลี่ยนเป็น service_role key (ใน function แทน)
--            Edge Function ส่วนใหญ่ใช้ service_role อยู่แล้ว → ไม่กระทบ


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ STEP 2: 🔴 ปิดช่องโหว่ #2 — "Admins can update any user" (ที่ไม่เช็ค admin)║
-- ╚══════════════════════════════════════════════════════════════════════════╝

DROP POLICY IF EXISTS "Admins can update any user" ON public.users;

-- ตอนนี้เหลือ policy ที่ตรวจ admin จริง:
--   - "Users: Admin can update all fields" (ตรวจ role = 'admin' ผ่าน EXISTS)
--   - "Users: Admin can update everything" (เหมือนกัน — duplicate)
--   - "Allow individual users to update their own profile" (auth.uid() = id OR admin)


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ STEP 3: 🟡 Consolidate redundant policies บน users                       ║
-- ║ ลบ duplicates เพื่อให้ maintain ง่าย + ลดความสับสน                        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ลบ INSERT duplicates (เก็บไว้แค่ตัวเดียว)
DROP POLICY IF EXISTS "Users: Allow individual insert" ON public.users;
DROP POLICY IF EXISTS "Users: Self can insert" ON public.users;
-- เก็บ "Allow individual users to create their own profile" ไว้ตัวเดียว

-- ลบ UPDATE duplicates
DROP POLICY IF EXISTS "Users: Admin can update everything" ON public.users;
DROP POLICY IF EXISTS "Users: Self can update personal info" ON public.users;
DROP POLICY IF EXISTS "Allow users to update own XP" ON public.users;
-- เก็บไว้: "Users: Admin can update all fields" + "Users: Self can update personal info only"
-- + "Allow individual users to update their own profile"


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ STEP 4: 🔴 ปิดช่องโหว่ #3 + #4 — bosses + boss_requests                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ลบ policy ที่อันตราย
DROP POLICY IF EXISTS "Allow authenticated to manage bosses" ON public.bosses;
DROP POLICY IF EXISTS "Allow authenticated to select bosses" ON public.bosses;
DROP POLICY IF EXISTS "Allow authenticated to update boss_requests" ON public.boss_requests;
DROP POLICY IF EXISTS "Allow authenticated to select boss_requests" ON public.boss_requests;

-- สร้าง policy ใหม่ที่ปลอดภัย

-- bosses: ทุก authenticated user "อ่านได้" (เพื่อแสดงในหน้านักเรียน)
CREATE POLICY "bosses_select_authenticated"
ON public.bosses FOR SELECT
TO authenticated
USING (true);

-- bosses: เฉพาะ admin เท่านั้นที่ INSERT/UPDATE/DELETE
CREATE POLICY "bosses_admin_all"
ON public.bosses FOR ALL
TO authenticated
USING (get_my_role() = 'admin')
WITH CHECK (get_my_role() = 'admin');

-- boss_requests: นักเรียนเห็นเฉพาะของตัวเอง, admin เห็นทุก request
CREATE POLICY "boss_requests_select_own_or_admin"
ON public.boss_requests FOR SELECT
TO authenticated
USING (
    user_id = auth.uid()
    OR get_my_role() = 'admin'
);

-- boss_requests: นักเรียน INSERT request ของตัวเองได้
CREATE POLICY "boss_requests_insert_own"
ON public.boss_requests FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- boss_requests: เฉพาะ admin เท่านั้นที่ UPDATE สถานะได้
CREATE POLICY "boss_requests_update_admin"
ON public.boss_requests FOR UPDATE
TO authenticated
USING (get_my_role() = 'admin')
WITH CHECK (get_my_role() = 'admin');


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ STEP 5: 🔴 ปิดช่องโหว่ #5 — instruments                                   ║
-- ║ ลบ duplicate SELECT policies + จำกัด UPDATE ให้เฉพาะ admin               ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ลบ policy ที่ซ้ำ + อันตราย
DROP POLICY IF EXISTS "Public can view instruments" ON public.instruments;
DROP POLICY IF EXISTS "Public read access for instruments" ON public.instruments;
DROP POLICY IF EXISTS "ทุกคนที่ล็อกอินสามารถ" ON public.instruments;
DROP POLICY IF EXISTS "Allow users to update instrument status" ON public.instruments;
DROP POLICY IF EXISTS "Allow authenticated users to read instruments" ON public.instruments;
DROP POLICY IF EXISTS "Allow authenticated users to view all instruments" ON public.instruments;
DROP POLICY IF EXISTS "Allow read for all" ON public.instruments;
DROP POLICY IF EXISTS "Authenticated users can see all instruments" ON public.instruments;

-- สร้างใหม่ — ตัวเดียว ครอบคลุม
CREATE POLICY "instruments_select_authenticated"
ON public.instruments FOR SELECT
TO authenticated
USING (true);

-- UPDATE เฉพาะ admin (การยืม/คืนใช้ RPC ผ่าน Edge Function/SECURITY DEFINER ฟังก์ชัน)
CREATE POLICY "instruments_admin_modify"
ON public.instruments FOR ALL
TO authenticated
USING (get_my_role() = 'admin')
WITH CHECK (get_my_role() = 'admin');


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ STEP 6: 🔴 ปิดช่องโหว่ #6 — raid_lobbies                                 ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

DROP POLICY IF EXISTS "Enable SELECT for authenticated users" ON public.raid_lobbies;
DROP POLICY IF EXISTS "Enable INSERT for authenticated users" ON public.raid_lobbies;
DROP POLICY IF EXISTS "Enable UPDATE for authenticated users" ON public.raid_lobbies;

-- SELECT: นักเรียนเห็น lobby ที่ตัวเองเข้าร่วม, admin เห็นทุก lobby
CREATE POLICY "raid_lobbies_select"
ON public.raid_lobbies FOR SELECT
TO authenticated
USING (
    admin_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.raid_participants rp
               WHERE rp.lobby_id = raid_lobbies.id AND rp.user_id = auth.uid())
    OR get_my_role() = 'admin'
);

-- INSERT: เฉพาะ admin สร้าง lobby ได้
CREATE POLICY "raid_lobbies_insert_admin"
ON public.raid_lobbies FOR INSERT
TO authenticated
WITH CHECK (
    get_my_role() = 'admin'
    AND admin_id = auth.uid()
);

-- UPDATE: เฉพาะ admin ที่เป็นเจ้าของ lobby
CREATE POLICY "raid_lobbies_update_owner"
ON public.raid_lobbies FOR UPDATE
TO authenticated
USING (admin_id = auth.uid() AND get_my_role() = 'admin')
WITH CHECK (admin_id = auth.uid() AND get_my_role() = 'admin');


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ STEP 7: 🟠 ปะ knowledge_links — นักเรียน insert ของตัวเองได้เท่านั้น      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

DROP POLICY IF EXISTS "Allow authenticated users to insert knowledge links" ON public.knowledge_links;
DROP POLICY IF EXISTS "ทุกคนที่ล็อกอินสามารถ" ON public.knowledge_links;
DROP POLICY IF EXISTS "Public read access for knowledge" ON public.knowledge_links;

-- SELECT: นักเรียนเห็นเฉพาะ approved + ของตัวเอง, admin เห็นทุก
CREATE POLICY "knowledge_links_select"
ON public.knowledge_links FOR SELECT
TO authenticated
USING (
    is_approved = true
    OR submitted_by = auth.uid()
    OR get_my_role() = 'admin'
);

-- INSERT: ผูกกับ submitted_by = ตัวเอง (กัน spam แทนคนอื่น)
CREATE POLICY "knowledge_links_insert_own"
ON public.knowledge_links FOR INSERT
TO authenticated
WITH CHECK (submitted_by = auth.uid());

-- UPDATE: เฉพาะ admin (อนุมัติ/ปฏิเสธ)
CREATE POLICY "knowledge_links_update_admin"
ON public.knowledge_links FOR UPDATE
TO authenticated
USING (get_my_role() = 'admin')
WITH CHECK (get_my_role() = 'admin');


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ STEP 8: 🟢 เติม policy ที่ขาด — notifications                            ║
-- ║ นักเรียนต้องอ่าน notif ของตัวเองได้ (ปกติตอนนี้น่าจะอ่านผ่าน Edge Function)║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ตรวจก่อนว่ามี policy นี้อยู่หรือยัง
SELECT policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'notifications';

-- ถ้าไม่มี SELECT policy → สร้างใหม่
CREATE POLICY IF NOT EXISTS "notifications_select_own"
ON public.notifications FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR get_my_role() = 'admin');

-- ถ้าไม่มี UPDATE policy → ให้ user mark as read ได้
CREATE POLICY IF NOT EXISTS "notifications_update_own_read"
ON public.notifications FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (
    user_id = auth.uid()
    -- บังคับไม่ให้แก้ title/body/created_at ตัวเองได้ (เฉพาะ is_read)
    AND title = (SELECT title FROM public.notifications WHERE id = notifications.id)
    AND body  = (SELECT body  FROM public.notifications WHERE id = notifications.id)
);


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ STEP 9: ✅ VERIFY — รัน Section 1-3 ของ AUDIT ซ้ำ ดูว่ายังเจอ 🔴 อยู่ไหม ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ตรวจอีกครั้งหลังแก้ไข
SELECT
    tablename,
    policyname,
    cmd,
    qual,
    with_check,
    CASE
        WHEN qual = 'true' OR with_check = 'true' THEN '🔴 ยังหลวมอยู่'
        ELSE '✅ ปลอดภัย'
    END AS status
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('users','bosses','boss_requests','instruments','raid_lobbies','knowledge_links','notifications')
  AND (qual = 'true' OR with_check = 'true')
ORDER BY tablename;

-- ✅ ผลที่ต้องการ: ไม่มีแถวเลย (ไม่เจอ 🔴 อีกแล้ว)
-- หรือมีเฉพาะที่ตั้งใจให้สาธารณะอ่าน (เช่น select instruments แสดงในหน้านักเรียน)


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ STEP 10: 🧪 ทดสอบจริง — ลอง escalate role ตัวเองเป็น admin               ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ⚠️ รันใน BEGIN/ROLLBACK เพื่อไม่ให้กระทบจริง
BEGIN;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'YOUR-STUDENT-UUID-HERE';  -- ← UUID นักเรียนจริง

-- พยายาม escalate ตัวเองเป็น admin
UPDATE public.users SET role = 'admin' WHERE id = 'YOUR-STUDENT-UUID-HERE';
-- ✅ ผลที่ต้องการ: ERROR หรือ 0 rows updated
-- 🔴 ถ้าสำเร็จ = ยังมีช่องโหว่ — เรียกผมตรวจอีก

ROLLBACK;


-- ═══════════════════════════════════════════════════════════════════════════
-- 📝 หมายเหตุสำคัญสำหรับ Edge Functions และ RPC
-- ═══════════════════════════════════════════════════════════════════════════
-- หลังรัน fix แล้ว ตรวจสอบว่า function ต่อไปนี้ยังทำงาน (ใช้ service_role bypass RLS):
--   - send-push (Edge Function)
--   - sign-up (Edge Function)
--   - admin_soft_block_user (RPC)
--   - register_push_subscription (RPC)
--   - add_learning_minutes (RPC)
-- หากใด function เหล่านี้ใช้ anon key + RLS → ต้องเปลี่ยนเป็น service_role
-- ═══════════════════════════════════════════════════════════════════════════
