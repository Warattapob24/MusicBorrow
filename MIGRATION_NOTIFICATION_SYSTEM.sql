-- ============================================================
-- MIGRATION: Full Notification System
--   1. scheduled_notifications (admin-created, repeats supported)
--   2. dispatch_due_notifications RPC (smart rules)
--   3. Auto-triggers for core events: borrow / approval / overdue / repair
--
-- Run in Supabase Dashboard → SQL Editor → paste → Run.
-- Idempotent (safe to re-run).
-- ============================================================

-- 1) ตารางเก็บแจ้งเตือนที่ admin ตั้งล่วงหน้า
CREATE TABLE IF NOT EXISTS scheduled_notifications (
  id              bigserial PRIMARY KEY,
  title           text NOT NULL,
  body            text NOT NULL,
  -- กลุ่มเป้าหมาย: 'all' | 'student' | 'club' | 'teacher' | 'guest' | 'admin'
  target_group    text NOT NULL DEFAULT 'all',
  -- เวลาที่ต้องส่งครั้งถัดไป
  scheduled_at    timestamptz NOT NULL,
  -- 'once' | 'daily' | 'weekly' | 'custom'
  repeat_type     text NOT NULL DEFAULT 'once' CHECK (repeat_type IN ('once','daily','weekly','custom')),
  -- สำหรับ weekly: จำนวนวัน (1-7), หรือ days array — เก็บใน config
  repeat_config   jsonb,
  -- เมื่อ dispatcher ส่งล่าสุด
  last_sent_at    timestamptz,
  -- เปิด/ปิดใช้งาน
  is_active       boolean NOT NULL DEFAULT true,
  -- ใครสร้าง (admin)
  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sched_notif_due
  ON scheduled_notifications(is_active, scheduled_at) WHERE is_active = true;

ALTER TABLE scheduled_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sched_notif_admin ON scheduled_notifications;
CREATE POLICY sched_notif_admin ON scheduled_notifications
  FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- 2) Helper: คำนวณ scheduled_at ครั้งถัดไปจาก repeat_type
CREATE OR REPLACE FUNCTION _compute_next_run(
  p_current     timestamptz,
  p_repeat_type text,
  p_repeat_config jsonb
) RETURNS timestamptz
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_next timestamptz;
  v_days_of_week int[];
  v_dow int;
  v_target_day int;
  v_min_diff int := 8;
  v_d int;
BEGIN
  IF p_repeat_type = 'once' THEN
    RETURN NULL; -- จบแล้ว ไม่ต้องส่งซ้ำ
  ELSIF p_repeat_type = 'daily' THEN
    RETURN p_current + interval '1 day';
  ELSIF p_repeat_type = 'weekly' THEN
    -- repeat_config = {"days": [1,3,5]}  (0=Sun, 1=Mon, ..., 6=Sat)
    v_days_of_week := ARRAY(
      SELECT (jsonb_array_elements_text(COALESCE(p_repeat_config->'days', '[]'::jsonb)))::int
    );
    IF v_days_of_week IS NULL OR array_length(v_days_of_week, 1) IS NULL THEN
      -- ถ้าไม่ระบุวัน → ส่งทุก 7 วัน
      RETURN p_current + interval '7 days';
    END IF;
    v_dow := EXTRACT(DOW FROM p_current)::int;
    -- หาวันถัดไปที่อยู่ใน list
    FOREACH v_target_day IN ARRAY v_days_of_week LOOP
      v_d := ((v_target_day - v_dow) + 7) % 7;
      IF v_d = 0 THEN v_d := 7; END IF; -- ขั้นต่ำ 1 วัน
      IF v_d < v_min_diff THEN v_min_diff := v_d; END IF;
    END LOOP;
    RETURN p_current + (v_min_diff || ' days')::interval;
  ELSIF p_repeat_type = 'custom' THEN
    -- repeat_config = {"interval_minutes": 60}
    v_d := COALESCE((p_repeat_config->>'interval_minutes')::int, 60);
    RETURN p_current + (v_d || ' minutes')::interval;
  END IF;
  RETURN NULL;
END;
$$;

-- 3) RPC: admin สร้าง scheduled notification
CREATE OR REPLACE FUNCTION admin_create_scheduled_notification(
  p_title         text,
  p_body          text,
  p_scheduled_at  timestamptz,
  p_target_group  text DEFAULT 'all',
  p_repeat_type   text DEFAULT 'once',
  p_repeat_config jsonb DEFAULT NULL
) RETURNS scheduled_notifications
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_row scheduled_notifications%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'ADMIN_ONLY';
  END IF;
  IF coalesce(trim(p_title), '') = '' THEN RAISE EXCEPTION 'TITLE_REQUIRED'; END IF;
  IF coalesce(trim(p_body), '')  = '' THEN RAISE EXCEPTION 'BODY_REQUIRED'; END IF;

  INSERT INTO scheduled_notifications
    (title, body, target_group, scheduled_at, repeat_type, repeat_config, created_by)
  VALUES
    (trim(p_title), trim(p_body), COALESCE(p_target_group, 'all'),
     p_scheduled_at, COALESCE(p_repeat_type, 'once'), p_repeat_config, auth.uid())
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

-- 4) RPC: admin update / delete / toggle
CREATE OR REPLACE FUNCTION admin_update_scheduled_notification(
  p_id            bigint,
  p_title         text DEFAULT NULL,
  p_body          text DEFAULT NULL,
  p_scheduled_at  timestamptz DEFAULT NULL,
  p_target_group  text DEFAULT NULL,
  p_repeat_type   text DEFAULT NULL,
  p_repeat_config jsonb DEFAULT NULL,
  p_is_active     boolean DEFAULT NULL
) RETURNS scheduled_notifications
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_row scheduled_notifications%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'ADMIN_ONLY';
  END IF;
  UPDATE scheduled_notifications SET
    title         = COALESCE(p_title,         title),
    body          = COALESCE(p_body,          body),
    scheduled_at  = COALESCE(p_scheduled_at,  scheduled_at),
    target_group  = COALESCE(p_target_group,  target_group),
    repeat_type   = COALESCE(p_repeat_type,   repeat_type),
    repeat_config = COALESCE(p_repeat_config, repeat_config),
    is_active     = COALESCE(p_is_active,     is_active),
    updated_at    = now()
  WHERE id = p_id RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION admin_delete_scheduled_notification(p_id bigint)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'ADMIN_ONLY';
  END IF;
  DELETE FROM scheduled_notifications WHERE id = p_id;
  RETURN jsonb_build_object('success', true);
END;
$$;

-- 5) RPC: admin ส่งประกาศทันที (ไม่ต้อง schedule)
CREATE OR REPLACE FUNCTION admin_send_announcement_now(
  p_title         text,
  p_body          text,
  p_target_group  text DEFAULT 'all'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'ADMIN_ONLY';
  END IF;

  INSERT INTO notifications (user_id, title, body, is_read)
  SELECT u.id, p_title, p_body, false
  FROM users u
  WHERE p_target_group = 'all'
     OR (p_target_group = 'student' AND u.role = 'student')
     OR (p_target_group = 'admin'   AND u.role = 'admin')
     OR u.student_group = p_target_group;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('success', true, 'recipients', v_count);
END;
$$;

-- 6) ⭐ DISPATCHER — เรียกเมื่อมี user/admin โหลดแอป (throttled client-side)
--    ส่ง scheduled_notifications ที่ "ถึงเวลา" + ยังไม่ส่ง / หรือ recurring
--    Smart rules:
--      - "เลยเวลาแล้วยังไม่ส่ง" → ส่งทันที (จับ scheduled_at <= now)
--      - "กันส่งซ้ำ" → ใช้ FOR UPDATE SKIP LOCKED + last_sent_at check
--      - หลังส่ง: คำนวณ scheduled_at ใหม่จาก repeat_type
--                 ถ้า once → set is_active = false
CREATE OR REPLACE FUNCTION dispatch_due_notifications()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_dispatched integer := 0;
  v_inserted   integer := 0;
  v_total_recipients integer := 0;
  rec RECORD;
  v_next timestamptz;
  v_now timestamptz := now();
BEGIN
  -- ดึง scheduled ที่ถึงเวลาแล้ว (เลยมาก็ได้) + active
  -- + กันแย่งกัน (ถ้ามี dispatcher 2 ตัวรันพร้อมกัน): SKIP LOCKED
  FOR rec IN
    SELECT *
    FROM scheduled_notifications
    WHERE is_active = true
      AND scheduled_at <= v_now
      -- once: ต้องยังไม่เคยส่ง; repeating: ส่งใหม่ได้
      AND (last_sent_at IS NULL OR repeat_type <> 'once')
      -- กันการส่งซ้ำใกล้กันเกินไปสำหรับ recurring (cooldown 30 วินาที)
      AND (last_sent_at IS NULL OR last_sent_at < v_now - interval '30 seconds')
    ORDER BY scheduled_at
    FOR UPDATE SKIP LOCKED
  LOOP
    -- ส่งให้ทุก user ที่ตรง target_group
    INSERT INTO notifications (user_id, title, body, is_read)
    SELECT u.id, rec.title, rec.body, false
    FROM users u
    WHERE rec.target_group = 'all'
       OR (rec.target_group = 'student' AND u.role = 'student')
       OR (rec.target_group = 'admin'   AND u.role = 'admin')
       OR u.student_group = rec.target_group;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    v_total_recipients := v_total_recipients + v_inserted;

    -- คำนวณ next run
    v_next := _compute_next_run(rec.scheduled_at, rec.repeat_type, rec.repeat_config);
    -- ถ้า next < now (recurring แต่เลยเวลาไปไกลแล้ว) → กระโดดไปครั้งถัดไป
    WHILE v_next IS NOT NULL AND v_next <= v_now LOOP
      v_next := _compute_next_run(v_next, rec.repeat_type, rec.repeat_config);
    END LOOP;

    UPDATE scheduled_notifications
    SET last_sent_at = v_now,
        scheduled_at = COALESCE(v_next, scheduled_at),
        is_active    = (v_next IS NOT NULL),  -- once → หยุด
        updated_at   = v_now
    WHERE id = rec.id;

    v_dispatched := v_dispatched + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'dispatched', v_dispatched,
    'total_recipients', v_total_recipients
  );
END;
$$;

-- 7) RPC: list scheduled (admin) + run history
CREATE OR REPLACE FUNCTION admin_list_scheduled_notifications()
RETURNS SETOF scheduled_notifications
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT * FROM scheduled_notifications
  WHERE EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  ORDER BY is_active DESC, scheduled_at;
$$;

-- 8) Auto-trigger: ยืมสำเร็จ → notify
CREATE OR REPLACE FUNCTION _notify_on_borrow_created()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_inst_name text;
BEGIN
  IF NEW.student_id IS NULL OR NEW.return_timestamp IS NOT NULL THEN
    RETURN NEW;
  END IF;
  SELECT name INTO v_inst_name FROM instruments WHERE id = NEW.instrument_id;

  IF NEW.is_take_home AND COALESCE(NEW.approval_status, '') = 'pending' THEN
    INSERT INTO notifications (user_id, title, body, is_read)
    VALUES (NEW.student_id, '⏳ คำขอยืมกลับบ้านส่งให้แอดมินแล้ว',
      'เครื่อง: ' || COALESCE(v_inst_name, '-') || ' — รออนุมัติ', false);
  ELSE
    INSERT INTO notifications (user_id, title, body, is_read)
    VALUES (NEW.student_id, '✅ ยืมเครื่องสำเร็จ',
      'เครื่อง: ' || COALESCE(v_inst_name, '-'), false);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS notify_borrow_created ON borrow_logs;
CREATE TRIGGER notify_borrow_created
  AFTER INSERT ON borrow_logs
  FOR EACH ROW EXECUTE FUNCTION _notify_on_borrow_created();

-- 9) Auto-trigger: อนุมัติ/ปฏิเสธ approval status เปลี่ยน
CREATE OR REPLACE FUNCTION _notify_on_approval_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE v_inst text;
BEGIN
  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status
     AND NEW.student_id IS NOT NULL THEN
    SELECT name INTO v_inst FROM instruments WHERE id = NEW.instrument_id;
    IF NEW.approval_status = 'approved' THEN
      INSERT INTO notifications (user_id, title, body, is_read)
      VALUES (NEW.student_id, '🎉 คำขอยืมกลับบ้านได้รับการอนุมัติ',
        'เครื่อง: ' || COALESCE(v_inst, '-'), false);
    ELSIF NEW.approval_status = 'rejected' THEN
      INSERT INTO notifications (user_id, title, body, is_read)
      VALUES (NEW.student_id, '❌ คำขอยืมกลับบ้านถูกปฏิเสธ',
        'เครื่อง: ' || COALESCE(v_inst, '-'), false);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS notify_approval_change ON borrow_logs;
CREATE TRIGGER notify_approval_change
  AFTER UPDATE OF approval_status ON borrow_logs
  FOR EACH ROW EXECUTE FUNCTION _notify_on_approval_change();

-- 10) RPC: เช็คคืนใกล้/เกินกำหนด — เรียกจาก dispatcher หรือ cron
CREATE OR REPLACE FUNCTION dispatch_due_date_reminders()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_warn integer := 0;
  v_overdue integer := 0;
BEGIN
  -- ใกล้ครบกำหนด: 1 วันก่อน due_date
  INSERT INTO notifications (user_id, title, body, is_read)
  SELECT bl.student_id,
         '⏰ ใกล้ครบกำหนดคืน',
         'เหลือเวลาคืน ~1 วัน — กรุณาเตรียมคืน',
         false
  FROM borrow_logs bl
  WHERE bl.return_timestamp IS NULL
    AND bl.due_date IS NOT NULL
    AND bl.due_date::timestamptz BETWEEN now() AND now() + interval '1 day'
    AND NOT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.user_id = bl.student_id
        AND n.title = '⏰ ใกล้ครบกำหนดคืน'
        AND n.created_at > now() - interval '20 hours'
    );
  GET DIAGNOSTICS v_warn = ROW_COUNT;

  -- เกินกำหนด: due_date < now()
  INSERT INTO notifications (user_id, title, body, is_read)
  SELECT bl.student_id,
         '⚠️ เลยกำหนดคืนแล้ว',
         'กรุณาคืนเครื่องด่วน — มิฉะนั้นอาจถูกบังคับคืน',
         false
  FROM borrow_logs bl
  WHERE bl.return_timestamp IS NULL
    AND bl.due_date IS NOT NULL
    AND bl.due_date::timestamptz < now()
    AND NOT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.user_id = bl.student_id
        AND n.title = '⚠️ เลยกำหนดคืนแล้ว'
        AND n.created_at > now() - interval '20 hours'
    );
  GET DIAGNOSTICS v_overdue = ROW_COUNT;

  RETURN jsonb_build_object('warn', v_warn, 'overdue', v_overdue);
END;
$$;

-- 11) Auto-trigger: repair_logs status changes (รับเรื่อง / กำลังซ่อม / เสร็จ / ซ่อมไม่ได้)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'repair_logs') THEN
    -- create trigger function
    EXECUTE $T$
      CREATE OR REPLACE FUNCTION _notify_on_repair_status()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $F$
      DECLARE
        v_user uuid;
        v_inst text;
        v_msg  text;
      BEGIN
        IF NEW.repair_status IS DISTINCT FROM OLD.repair_status THEN
          -- หาเจ้าของจาก borrow_log
          SELECT bl.student_id, i.name INTO v_user, v_inst
          FROM borrow_logs bl
          LEFT JOIN instruments i ON i.id = bl.instrument_id
          WHERE bl.id = NEW.borrow_log_id;
          IF v_user IS NULL THEN RETURN NEW; END IF;

          v_msg := 'เครื่อง: ' || COALESCE(v_inst, '-');
          IF NEW.repair_status = 'แจ้งซ่อม' OR NEW.repair_status = 'received' THEN
            INSERT INTO notifications (user_id, title, body, is_read)
            VALUES (v_user, '🛠 รับเรื่องแจ้งซ่อมแล้ว', v_msg, false);
          ELSIF NEW.repair_status = 'กำลังซ่อม' OR NEW.repair_status = 'in_progress' THEN
            INSERT INTO notifications (user_id, title, body, is_read)
            VALUES (v_user, '🔧 กำลังดำเนินการซ่อม', v_msg, false);
          ELSIF NEW.repair_status = 'ซ่อมเสร็จสิ้น' OR NEW.repair_status = 'completed' THEN
            INSERT INTO notifications (user_id, title, body, is_read)
            VALUES (v_user, '✅ ซ่อมเครื่องเสร็จเรียบร้อย', v_msg, false);
          ELSIF NEW.repair_status = 'ไม่สามารถซ่อมได้' OR NEW.repair_status = 'cannot_repair' THEN
            INSERT INTO notifications (user_id, title, body, is_read)
            VALUES (v_user, '❌ ไม่สามารถซ่อมเครื่องได้', v_msg, false);
          END IF;
        END IF;
        RETURN NEW;
      END;
      $F$;
    $T$;
    EXECUTE 'DROP TRIGGER IF EXISTS notify_repair_status ON repair_logs';
    EXECUTE 'CREATE TRIGGER notify_repair_status AFTER UPDATE OF repair_status ON repair_logs FOR EACH ROW EXECUTE FUNCTION _notify_on_repair_status()';
  END IF;
END $$;

-- 12) Grant execute
GRANT EXECUTE ON FUNCTION admin_create_scheduled_notification(text,text,timestamptz,text,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_update_scheduled_notification(bigint,text,text,timestamptz,text,text,jsonb,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_delete_scheduled_notification(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_list_scheduled_notifications() TO authenticated;
GRANT EXECUTE ON FUNCTION admin_send_announcement_now(text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION dispatch_due_notifications() TO authenticated;
GRANT EXECUTE ON FUNCTION dispatch_due_date_reminders() TO authenticated;

-- ============================================================
-- ตรวจสอบหลัง run
SELECT 'scheduled_notifications table' AS check_item,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='scheduled_notifications') AS ok
UNION ALL SELECT 'rpc dispatch_due_notifications',
  EXISTS (SELECT 1 FROM pg_proc WHERE proname='dispatch_due_notifications')
UNION ALL SELECT 'rpc admin_create_scheduled_notification',
  EXISTS (SELECT 1 FROM pg_proc WHERE proname='admin_create_scheduled_notification')
UNION ALL SELECT 'trigger notify_borrow_created',
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='notify_borrow_created')
UNION ALL SELECT 'trigger notify_approval_change',
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='notify_approval_change');
-- ============================================================
