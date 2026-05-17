-- ============================================================
-- MIGRATION: Soft Block (24h XP pause) + Force Return without rewards
-- ขั้นตอน: เปิด Supabase Dashboard → SQL Editor → Paste ทั้งหมด → Run
-- รันได้หลายครั้ง (idempotent)
-- ============================================================

-- 1) เพิ่ม column exp_blocked_until (timestamptz)
--    ใช้บอก "เวลาสิ้นสุดที่ห้ามรับ XP" — ถ้า > now() = ห้ามรับ
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS exp_blocked_until timestamptz;

-- 2) เพิ่ม column is_force_returned ใน borrow_logs (กันกรณี schema เก่ายังไม่มี)
ALTER TABLE borrow_logs
  ADD COLUMN IF NOT EXISTS is_force_returned boolean NOT NULL DEFAULT false;

-- 3) Trigger: ป้องกัน xp ของ user เพิ่มขึ้นช่วงที่ exp_blocked_until ยังไม่หมด
--    practice_minutes / learning_minutes เพิ่มได้ตามปกติ — เฉพาะ XP ที่ถูกแช่แข็ง
--
--    NOTE: column ที่เก็บ XP ของ user ในระบบนี้ชื่อ "xp" (ตามที่ใช้ใน
--    increment_user_xp_auto). ถ้าฐานข้อมูลของคุณใช้ชื่ออื่น เปลี่ยน
--    OLD.xp / NEW.xp ในฟังก์ชันด้านล่างให้ตรงกัน
CREATE OR REPLACE FUNCTION enforce_xp_block_during_soft_block()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- ถ้ามีการแช่แข็ง XP ที่ยังไม่หมด และ user พยายามจะรับ XP เพิ่ม → ตีกลับ
  IF NEW.exp_blocked_until IS NOT NULL
     AND NEW.exp_blocked_until > now()
     AND COALESCE(NEW.xp, 0) > COALESCE(OLD.xp, 0) THEN
    NEW.xp := OLD.xp;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_xp_block_guard ON users;
CREATE TRIGGER users_xp_block_guard
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION enforce_xp_block_during_soft_block();

-- 4) RPC: admin_soft_block_user — บล็อกแบบ soft + แช่แข็ง XP เป็นชั่วโมง
CREATE OR REPLACE FUNCTION admin_soft_block_user(
  p_user_id  uuid,
  p_reason   text,
  p_hours    integer DEFAULT 24
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_until timestamptz;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = v_admin AND role = 'admin') THEN
    RAISE EXCEPTION 'ADMIN_ONLY';
  END IF;
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'USER_REQUIRED'; END IF;
  IF coalesce(trim(p_reason), '') = '' THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;

  v_until := now() + (COALESCE(p_hours, 24) || ' hours')::interval;

  UPDATE users
  SET is_blocked        = TRUE,
      block_reason      = trim(p_reason),
      exp_blocked_until = v_until
  WHERE id = p_user_id;

  -- ส่ง notification ให้ user รู้ตัว
  INSERT INTO notifications (user_id, title, body, is_read)
  VALUES (
    p_user_id,
    '🚫 บัญชีของคุณถูกจำกัดการใช้งาน',
    trim(p_reason) || E'\n(หยุดรับ EXP ' || p_hours || ' ชั่วโมง — ยังนับเวลาซ้อมได้ตามปกติ)',
    FALSE
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'is_blocked', TRUE,
    'reason', trim(p_reason),
    'exp_blocked_until', v_until
  );
END;
$$;

-- 5) RPC: admin_unblock_user — ปลดบล็อก + ปลดล็อก XP ทันที
CREATE OR REPLACE FUNCTION admin_unblock_user(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'ADMIN_ONLY';
  END IF;
  UPDATE users
  SET is_blocked        = FALSE,
      block_reason      = NULL,
      exp_blocked_until = NULL
  WHERE id = p_user_id;

  INSERT INTO notifications (user_id, title, body, is_read)
  VALUES (p_user_id, '✅ บัญชีของคุณถูกปลดบล็อก', 'แอดมินได้ปลดล็อกการใช้งานให้คุณแล้ว', FALSE);

  RETURN jsonb_build_object('success', TRUE);
END;
$$;

-- 6) RPC: admin_force_return_no_reward
--    บังคับคืนเครื่อง + ตั้ง is_force_returned=true + "ไม่" ให้ XP / นาทีซ้อม
--    (ต่างจาก admin_force_return_instrument เดิมที่อาจให้รางวัลคืน)
CREATE OR REPLACE FUNCTION admin_force_return_no_reward(p_log_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_log     borrow_logs%ROWTYPE;
  v_user_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'ADMIN_ONLY';
  END IF;

  SELECT * INTO v_log FROM borrow_logs WHERE id = p_log_id;
  IF v_log.id IS NULL THEN
    RAISE EXCEPTION 'LOG_NOT_FOUND';
  END IF;
  IF v_log.return_timestamp IS NOT NULL THEN
    RAISE EXCEPTION 'ALREADY_RETURNED';
  END IF;

  -- ปิดประวัติยืม (ไม่คำนวณ XP / practice เพราะนี่เป็นการ "บังคับ")
  UPDATE borrow_logs
  SET return_timestamp  = now(),
      is_force_returned = TRUE,
      borrow_status     = 'force_returned'
  WHERE id = p_log_id;

  -- ปลดเครื่องดนตรีให้ว่าง
  IF v_log.instrument_id IS NOT NULL THEN
    UPDATE instruments
    SET status = 'พร้อมใช้งาน',
        current_borrower_id = NULL
    WHERE id = v_log.instrument_id;
  END IF;

  v_user_id := v_log.student_id;

  -- แจ้งเตือนผู้ที่ถูกบังคับคืน
  IF v_user_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, title, body, is_read)
    VALUES (
      v_user_id,
      '↩ ระบบได้บังคับคืนเครื่องของคุณ',
      'แอดมินได้บังคับคืนเครื่องดนตรีที่คุณยืมไป — รายการนี้ "ไม่ได้รับ" EXP และเวลาซ้อมจากการยืมครั้งนี้',
      FALSE
    );
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'log_id', p_log_id,
    'awarded_xp', 0,
    'awarded_minutes', 0
  );
END;
$$;

-- 7) Helper: ตรวจสอบว่า user ถูกแช่ XP อยู่หรือไม่
CREATE OR REPLACE FUNCTION is_user_xp_paused(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = p_user_id
      AND exp_blocked_until IS NOT NULL
      AND exp_blocked_until > now()
  );
$$;

-- 8) Grant execute
GRANT EXECUTE ON FUNCTION admin_soft_block_user(uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_unblock_user(uuid)                   TO authenticated;
GRANT EXECUTE ON FUNCTION admin_force_return_no_reward(bigint)       TO authenticated;
GRANT EXECUTE ON FUNCTION is_user_xp_paused(uuid)                    TO authenticated;

-- ============================================================
-- ตรวจสอบหลัง run
SELECT
  'users.exp_blocked_until' AS check_item,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='exp_blocked_until') AS ok
UNION ALL SELECT 'borrow_logs.is_force_returned',
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='borrow_logs' AND column_name='is_force_returned')
UNION ALL SELECT 'rpc admin_soft_block_user',
  EXISTS (SELECT 1 FROM pg_proc WHERE proname='admin_soft_block_user')
UNION ALL SELECT 'rpc admin_force_return_no_reward',
  EXISTS (SELECT 1 FROM pg_proc WHERE proname='admin_force_return_no_reward')
UNION ALL SELECT 'trigger users_xp_block_guard',
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='users_xp_block_guard');
-- ============================================================
