-- =====================================================================
-- MIGRATION_SECURITY_03_XSS_IDOR_AND_VIEW.sql
-- รันลงฐานจริงแล้ว 2026-08-13 ผ่าน Supabase MCP apply_migration
--   20260813063711  security_url_scheme_constraints
--   20260813063856  security_pin_user_id_to_auth_uid
--   20260813064320  security_fix_restore_get_user_role_grant   <- 🐛 regression fix
--   20260813064431  security_view_invoker_and_achievements_policy
--
-- ชุดที่ 3 ปิดงานที่เหลือทั้งหมดจาก security review 2026-08-13
-- (ฝั่ง JS / edge function อยู่ใน git ไม่ได้อยู่ในไฟล์นี้ — ดูสรุปท้ายไฟล์)
--
-- ⚠️ ไฟล์นี้เป็นบันทึกสิ่งที่รันไปแล้ว ไม่ต้องรันซ้ำ
-- =====================================================================


-- ---------------------------------------------------------------------
-- PART 1 — บังคับ scheme ของ URL ที่ผู้ใช้ส่งเข้ามา
-- knowledge_links.youtube_url นักเรียนเขียนได้ (submit_knowledge_link + insert ตรง)
-- แล้วถูก render ลง <a href> ตรง ๆ — escapeHtml กัน `javascript:alert(1)` ไม่ได้
-- เพราะไม่มีอักขระที่ต้อง escape เลย และ javascript: URI ทำงานใน document ปัจจุบัน
-- แม้จะมี target="_blank" rel="noopener"
-- ตารางรีวิวของแอดมินคือจุดที่แอดมิน "ต้องกด" ลิงก์เพื่อตรวจ → ยึด session แอดมินได้
-- ---------------------------------------------------------------------
ALTER TABLE public.knowledge_links
  ADD CONSTRAINT knowledge_links_youtube_url_http_only
  CHECK (youtube_url ~* '^https?://');            -- 28 แถว 0 แถวเสีย → บังคับเต็ม

ALTER TABLE public.boss_requests
  ADD CONSTRAINT boss_requests_video_url_http_only
  CHECK (video_url IS NULL OR video_url = '' OR video_url ~* '^https?://')
  NOT VALID;                                      -- 3 แถว 2 แถวเก่าเสีย → เช็คเฉพาะแถวใหม่


-- ---------------------------------------------------------------------
-- PART 2 — ปิด IDOR: pin p_user_id ให้เป็น auth.uid()
-- RPC เหล่านี้รับ uuid ของผู้กระทำจาก client แทนที่จะใช้ auth.uid()
-- และ SECURITY DEFINER ก็ข้าม RLS ของ borrow_logs / game_sessions ที่เขียนไว้ถูกแล้ว
-- → นักเรียนยืมของใส่ชื่อเพื่อน ปิดรายการยืมของเพื่อน อ่านของค้างของเพื่อน หรือปั๊ม XP ให้เพื่อนได้
--
-- ใช้กลไก rename → __inner + wrapper เดิม บอดี้ไม่ถูกแก้
-- guard: uuid ที่ส่งมาต้องเป็นของตัวเอง เว้นแต่เป็นแอดมิน (หน้าแอดมินมีฟีเจอร์
--        "ยืมแทนนักเรียน" จริงที่ ui.js adminQuickBorrow), service_role หรือ cron
-- ---------------------------------------------------------------------
-- ฟังก์ชันที่ถูก pin (11 ตัว):
--   borrow_instrument_atomic, return_instrument_and_log_minutes, get_my_borrowed_items,
--   uniform_checkout (p_student_id), join_raid_lobby, check_and_award_new_badges,
--   reward_user_video_watch, reward_video_watch_time, get_game_leaderboard,
--   get_class_practice_ranking, get_club_practice_ranking
--
-- guard ที่ฝังใน wrapper:
--   IF NOT ( ไม่มี JWT
--            OR jwt role = 'service_role'
--            OR <uuid param> IS NULL
--            OR <uuid param> = auth.uid()
--            OR ผู้เรียกเป็น users.role='admin' )
--   THEN RAISE EXCEPTION 'FORBIDDEN: cannot act on behalf of another user'
--        USING ERRCODE='42501'; END IF;


-- ---------------------------------------------------------------------
-- PART 3 — 🐛 REGRESSION FIX (สำคัญที่สุดในไฟล์นี้)
--
-- migration 20260813023811 (ชุดที่ 2) revoke get_user_role() ออกจาก authenticated
-- เพราะตรวจแล้วว่า "ไม่มีไฟล์ client ไหนเรียก" — ซึ่งไม่พอ
-- ฟังก์ชันนี้ถูกอ้างอยู่ใน RLS POLICY ของ badges, borrow_logs, instruments,
-- knowledge_links และ policy expression ถูกประเมินด้วยสิทธิ์ของ role ที่ query
-- ผลคือนักเรียนที่ล็อกอิน SELECT 4 ตารางนี้ไม่ได้เลย:
--   ERROR: permission denied for function get_user_role
--
-- ฟังก์ชันนี้อ่านแค่ role ของตัวเองผ่าน auth.uid() การคืนสิทธิ์จึงไม่เปิดอะไรเพิ่ม
-- ---------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated;

-- ✅ บทเรียน: ก่อน REVOKE ฟังก์ชัน ต้องเช็ค pg_policies ด้วย ไม่ใช่แค่ source ของแอป
--    query ที่ใช้ตรวจ:
--      SELECT pl.tablename, f.proname
--      FROM pg_policies pl
--      JOIN pg_proc f ON f.pronamespace='public'::regnamespace
--        AND (coalesce(pl.qual,'')||' '||coalesce(pl.with_check,'')) ~ ('\m'||f.proname||'\s*\(')
--      WHERE pl.schemaname='public'
--        AND NOT has_function_privilege('authenticated', f.oid, 'EXECUTE');


-- ---------------------------------------------------------------------
-- PART 4 — view + policy ที่เหลือ
-- ---------------------------------------------------------------------
-- admin_users_with_activity เป็น SECURITY DEFINER view บน public.users
-- จึงรันด้วยสิทธิ์เจ้าของและข้าม RLS ทั้งหมด → นักเรียนที่ล็อกอินอ่านชื่อ อีเมล เบอร์โทร
-- ระดับชั้น เหตุผลที่ถูกบล็อก และรายการยืมของ "ทุกคน" ได้
-- policy ที่มีอยู่รองรับทั้งสองฝั่งถูกต้องแล้ว จึงพลิกเป็น security_invoker ได้เลย:
--   users:       "Users can select own data"  -> (auth.uid() = id OR get_my_role() = 'admin')
--   borrow_logs: "Admins have full access..." -> (get_user_role() = 'admin')
ALTER VIEW public.admin_users_with_activity SET (security_invoker = true);
-- ผลทดสอบ: แอดมินเห็น 493 คน (เท่าเดิม) นักเรียนเห็น 1 คน (จากเดิมเห็น 493)

-- user_achievements INSERT policy เป็น WITH CHECK (true) และไม่มี TO clause
-- → ใครก็ปลดล็อก achievement ให้ตัวเอง หรือเขียนใส่ record ของคนอื่นได้
-- ไม่มี client และไม่มี function ไหน INSERT ตารางนี้เลย (grep + pg_proc) policy จึงมีไว้
-- ให้ผู้โจมตีอย่างเดียว — การให้รางวัลต้องมาจาก SECURITY DEFINER RPC ซึ่งข้าม RLS อยู่แล้ว
DROP POLICY IF EXISTS "user_achievements_insert_system" ON public.user_achievements;


-- =====================================================================
-- ผลทดสอบ (รันจริงบน production)
-- =====================================================================
-- | เคส                                                  | ผล              |
-- |-----------------------------------------------------|-----------------|
-- | นักเรียน -> get_my_borrowed_items(ตัวเอง)              | OK              |
-- | นักเรียน -> get_class_practice_ranking(ตัวเอง)         | OK 1 row        |
-- | นักเรียน -> get_my_borrowed_items(คนอื่น)              | บล็อก 42501     |
-- | นักเรียน -> reward_video_watch_time(คนอื่น)            | บล็อก 42501     |
-- | แอดมิน   -> get_my_borrowed_items(นักเรียน)            | OK (ยืมแทนได้)  |
-- | นักเรียน SELECT borrow_logs / instruments / badges /   | OK (หลัง fix)   |
-- |          knowledge_links                              |                 |
-- | แอดมิน SELECT borrow_logs                             | OK 4,070 rows   |
-- | แอดมิน -> admin_users_with_activity                   | 493 users       |
-- | นักเรียน -> admin_users_with_activity                 | 1 user          |
-- | นักเรียน INSERT user_achievements                      | บล็อกโดย RLS    |
-- | INSERT knowledge_links ด้วย javascript:                | บล็อกโดย CHECK  |
-- | anon key -> POST /functions/v1/send-push               | 401 Unauthorized|


-- =====================================================================
-- การแก้ฝั่งแอป (อยู่ใน git ไม่ใช่ไฟล์นี้) — deploy แล้ว
-- =====================================================================
-- utils.js
--   + escapeJsInAttr()  escape ฝั่ง JS ก่อนแล้วค่อย HTML สำหรับค่าที่อยู่ใน
--                       JS string literal ซึ่งอยู่ใน HTML attribute อีกที
--                       (escapeHtml อย่างเดียวไม่พอ: parser ถอด entity ก่อน compile)
--   + safeUrl()         คืน URL เฉพาะเมื่อเป็น http/https เท่านั้น
--
-- admin-dashboard.js
--   - ตาราง users: เลิกฝังชื่อใน onclick เปลี่ยนเป็น data-uact/data-uid + event delegation
--                  (_userFullName ดึงชื่อจาก state ตอนกด) — นี่คือจุด XSS ที่ร้ายแรงที่สุด
--                  เพราะนักเรียนตั้งชื่อตัวเองได้ และครูต้องกดปุ่มในแถวนั้นเพื่อจัดการผู้ใช้
--   - ตาราง events / part types: เปลี่ยนเป็น data-attribute + delegation เช่นกัน
--     (โค้ดเดิม .replace(/'/g, "\'") เป็น no-op — ใน JS "\'" คือ ' เฉย ๆ)
--   - อีก 6 จุดที่ยังใช้ inline onclick เปลี่ยนมาใช้ escapeJsInAttr()
--   - Swal title 10 จุดใส่ escapeHtml (title ของ SweetAlert2 v11 เป็น innerHTML sink
--     ไม่ใช่ text sink — มี titleText แยกไว้ต่างหาก)
--   - <a href> ใส่ safeUrl()
--
-- student-dashboard.js
--   - <a href> ของ learning feed ใส่ safeUrl()
--   - Swal title ใส่ escapeHtml
--   - window message listener เช็ค event.origin แล้ว (เกม postMessage ด้วย '*'
--     ทำให้หน้าเว็บอื่นที่ window.open() แอปนี้ยิงคะแนนปลอมเข้ามาได้)
--     หมายเหตุ: ข้อความจาก service worker ใช้ listener แยกใน main.js:388 ไม่กระทบ
--
-- ui.js
--   - autocomplete "ยืมแทนนักเรียน" เปลี่ยนเป็น data-attribute + delegation
--   - <a href> ใส่ safeUrl()
--
-- sw.js
--   - บังคับ same-origin ก่อน clients.openWindow()
--     เดิม new URL(absoluteUrl, origin) คืนโดเมนนั้นตรง ๆ (base ใช้กับ relative เท่านั้น)
--     ทำให้ push payload พาผู้ใช้ไปหน้าฟิชชิงได้
--
-- supabase/functions/send-push/index.ts  (deploy v13)
--   - ตรวจ Authorization: service_role ผ่าน / ผู้ใช้ล็อกอินส่งหาตัวเองได้ / แอดมินส่งหาคนอื่นได้
--     นอกนั้น 401-403  (เดิมไม่ตรวจเลย ใครถือ anon key ก็ยิง push ปลอมได้)
--   - CORS จาก "*" เหลือเฉพาะโดเมนแอป
--   - url ใน payload จำกัดเป็น path ภายในแอป, icon จำกัด prefix assets/
--   - ตอบรูปแบบเดียวกันเมื่อไม่มี subscription (เดิมเป็น oracle บอกว่าใครเปิด push)


-- =====================================================================
-- สรุปตัวเลขรวมทั้ง 3 ชุด
-- =====================================================================
--                                    ก่อน   ชุด1   ชุด2   ชุด3
-- anon เรียกฟังก์ชันได้                265     1      1      1
-- authenticated เรียกฟังก์ชันได้         265   265    198    199
-- SECURITY DEFINER ที่ไม่มี guard       131   131     30     19
-- ตารางที่ RLS ปิด                       4     1      1      1
-- view ที่ anon อ่านได้                   1     0      0      0
-- SECURITY DEFINER view                  1     1      1      0



-- =====================================================================
-- PART 5 — display_state (migration 20260813072846 security_enable_rls_display_state)
-- =====================================================================
-- display_state เป็นตารางของแอป QSing (คาราโอเกะ) ที่ใช้ Supabase project เดียวกัน
-- เป็นตารางสุดท้ายใน public ที่ relrowsecurity = false และ anon มี CRUD เต็ม
--
-- ตรวจซอร์ส QSing (New app/QSing/qsing-app/src) แล้วพบว่า:
--   เขียน      -> เฉพาะ src/app/api/display/route.ts POST ซึ่งใช้ createServiceClient()
--                 (service_role ข้าม RLS) หลัง auth check ของตัวเอง
--                 ไม่มี .update/.insert/.delete จาก client ที่ไหนเลยใน src
--   อ่านครั้งแรก -> GET ของ route เดียวกัน ก็ service_role
--   อ่านสด      -> src/app/display/page.tsx และ src/app/sound/page.tsx subscribe
--                 postgres_changes UPDATE ด้วย browser client
--                 /display ไม่ได้อยู่ใน middleware matcher (มีแค่ /api/admin)
--                 จอจึงเป็น anonymous และ Realtime ต้องการ anon SELECT
--
-- จึงเปิดให้อ่านได้ทุกคน แต่ไม่ให้ client เขียนเลย
ALTER TABLE public.display_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "display_state_read_all" ON public.display_state
  FOR SELECT TO anon, authenticated
  USING (true);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.display_state FROM anon, authenticated;

-- ผลทดสอบ: anon SELECT OK (จอยังทำงาน) / anon UPDATE บล็อก / anon DELETE บล็อก
--          ข้อมูลในตารางไม่ถูกแตะต้อง
-- หลัง migration นี้: ไม่มีตารางใดใน schema public ที่ RLS ปิดอีกแล้ว


-- =====================================================================
-- งานต่อ
-- =====================================================================
-- รายการที่ยังไม่ได้ปิด เก็บไว้นอก repo ที่ SECURITY_REMAINING.local.md
-- (repo นี้เป็น public จึงไม่ระบุรายละเอียดไว้ในไฟล์ที่ tracked)
