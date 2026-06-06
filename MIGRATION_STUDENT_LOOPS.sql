-- ============================================================
-- MIGRATION: Student DJ Loops System
-- ขั้นตอน: เปิด Supabase Dashboard → SQL Editor → Paste ทั้งหมด → Run
-- รันได้หลายครั้ง (idempotent — IF NOT EXISTS / ON CONFLICT)
-- ============================================================

-- 1) Table: student_loops (เก็บข้อมูลลูปเพลงและการเชื่อมโยง Google Drive)
CREATE TABLE IF NOT EXISTS student_loops (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  bpm integer NOT NULL DEFAULT 120,
  pad_sequence jsonb NOT NULL,      -- ข้อมูลจำลองการกดปุ่ม (ตาราง 4x4)
  google_drive_id text NOT NULL,    -- รหัสไฟล์เสียงบน Google Drive
  created_at timestamptz NOT NULL DEFAULT now()
);

-- สร้าง index เพื่อให้ดึงข้อมูล Feed ได้รวดเร็วขึ้น
CREATE INDEX IF NOT EXISTS idx_student_loops_user_time
  ON student_loops(user_id, created_at DESC);

-- 2) เปิดใช้งาน Row Level Security (RLS)
ALTER TABLE student_loops ENABLE ROW LEVEL SECURITY;

-- 3) ลบนโยบายเดิมที่มีอยู่ก่อน (กันสร้างซ้ำ)
DROP POLICY IF EXISTS student_loops_read ON student_loops;
DROP POLICY IF EXISTS student_loops_write ON student_loops;
DROP POLICY IF EXISTS student_loops_delete ON student_loops;

-- 4) สร้าง RLS Policies
--   - นักเรียน/ครูทุกคน (Authenticated Role) มีสิทธิ์ดูและฟังเพลงทั้งหมด
CREATE POLICY student_loops_read ON student_loops
  FOR SELECT USING (auth.role() = 'authenticated');

--   - นักเรียนสามารถเพิ่มเพลงลูปของตัวเองเข้าไปในระบบได้เท่านั้น
CREATE POLICY student_loops_write ON student_loops
  FOR INSERT WITH CHECK (user_id = auth.uid());

--   - นักเรียนสามารถลบเพลงลูปของตัวเองออกจากระบบได้เท่านั้น
CREATE POLICY student_loops_delete ON student_loops
  FOR DELETE USING (user_id = auth.uid());

-- 5) Grant Permissions ให้บทบาทที่เหมาะสมเข้าถึงได้
GRANT SELECT, INSERT, DELETE ON student_loops TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE student_loops_id_seq TO authenticated;

-- ============================================================
-- ตรวจสอบหลังรัน: Query เพื่อความมั่นใจ
SELECT
  'student_loops table' AS check_item,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'student_loops') AS ok;
-- ============================================================
