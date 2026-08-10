-- ============================================================================
-- MIGRATION 01 — BORROW CORE FIX
-- ============================================================================
-- ⚠️ รันลงฐานจริงไปแล้ว 2026-08-10 (ดู MIGRATIONS_APPLIED.md)
--    ฉบับในฐานมีการแก้เพิ่มอีก 1 จุดที่ไฟล์นี้ยังไม่มี:
--    borrow_instrument_atomic เดิมประกาศ v_event เป็น RECORD แล้วอ้าง v_event.name
--    ใน RETURN ทั้งที่ตอนยืมในโรงเรียนไม่เคย SELECT INTO
--    → error "record is not assigned yet" ทำให้ยืมไม่ได้เลย
--    แก้แล้วใน migration `fix_unassigned_record_vars`
--    เวอร์ชันที่ใช้งานจริงดูได้จาก:
--      SELECT statements FROM supabase_migrations.schema_migrations
--       WHERE name='fix_unassigned_record_vars';
-- ============================================================================
-- แก้ต้นตอ 5 อย่างที่ตรวจพบจากข้อมูลจริง (borrow_logs 4,036 แถว):
--
--   1. borrow_instrument_atomic มี 3 overload ซ้อนกัน → PostgREST เลือกตัวที่
--      "รับ p_borrow_type แต่ไม่เคย INSERT ลงคอลัมน์" → borrow_type NULL 4,035/4,036
--   2. overload นั้นไม่มี logic 1 ชม./6 ชม. เลย ใช้ p_due_date จาก client
--      ซึ่ง QR scan ส่ง null มาตลอด → due_date NULL → เตือนคืนไม่เคยทำงาน
--   3. overload นั้นไม่ set current_borrower_id → เครื่อง 3 ชิ้นสถานะ "ถูกยืมอยู่"
--      แต่ current_borrower_id NULL และมี log ค้างจริงแค่ 1 → ghost lock 2 ชิ้น
--   4. dispatch_due_date_reminders กรอง due_date IS NOT NULL → ยืมในโรงเรียน
--      ไม่เคยเข้าเงื่อนไขแม้แต่ครั้งเดียว
--   5. dispatch_due_date_reminders ไม่ได้อยู่ใน pg_cron → ต้องรอคนเปิดแอป
--
-- ผลกระทบที่วัดได้: บังคับคืน 710/3,996 ครั้ง (17.8%), ยืมในโรงเรียนเฉลี่ย 6.8 ชม.
--
-- 📍 รันใน Supabase Dashboard → SQL Editor
-- ♻️ Idempotent — รันซ้ำได้
-- ============================================================================


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ STEP 1 — คอลัมน์ expected_return_at                                       ║
-- ║   due_date เป็น date (ไม่มีเวลา) ใช้กับการยืมรายชั่วโมงไม่ได้              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

ALTER TABLE public.borrow_logs
    ADD COLUMN IF NOT EXISTS expected_return_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_borrow_logs_open_expected
    ON public.borrow_logs (expected_return_at)
    WHERE return_timestamp IS NULL;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ STEP 2 — ฟังก์ชันกลาง: กติกาเวลายืม (แหล่งความจริงที่เดียว)                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- กติกา:
--   นักเรียนทั่วไป  in_school    → 1 ชม.
--   สมาชิกชุมนุม    in_school    → 6 ชม.
--   สมาชิกชุมนุม    performance  → ตามที่ครูกำหนด (ยังไม่มีงาน = 12 ชม.)
--   ทุกกลุ่ม        take_home    → ตามวันที่เลือก (สิ้นวัน 23:59)
--   ครู/บุคคลทั่วไป special      → ตามวันที่เลือก

CREATE OR REPLACE FUNCTION public.calc_expected_return_at(
    p_student_group text,
    p_borrow_type   text,
    p_due_date      timestamptz DEFAULT NULL,
    p_from          timestamptz DEFAULT now()
) RETURNS timestamptz
LANGUAGE sql STABLE
AS $$
    SELECT CASE
        -- ⚠️ ต้อง trunc ตามเวลาไทย ไม่ใช่ UTC
        -- ถ้า trunc ตรง ๆ จะได้ 06:59 ของวันถัดไป (ทดสอบแล้วพลาดจริง)
        WHEN p_borrow_type IN ('take_home', 'special') THEN
            COALESCE(
                (date_trunc('day', p_due_date AT TIME ZONE 'Asia/Bangkok')
                     + interval '23 hours 59 minutes') AT TIME ZONE 'Asia/Bangkok',
                p_from + interval '1 day')
        WHEN p_borrow_type = 'performance' THEN
            COALESCE(p_due_date, p_from + interval '12 hours')
        WHEN p_student_group = 'club' THEN
            p_from + interval '6 hours'
        ELSE
            p_from + interval '1 hour'
    END;
$$;

COMMENT ON FUNCTION public.calc_expected_return_at IS
    'กติกาเวลายืม — แหล่งความจริงที่เดียว ห้ามคำนวณซ้ำใน client';


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ STEP 3 — ลบ overload ที่ตายแล้ว                                           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- #1 (5 args, p_due_date date) — ไม่มี p_borrow_type ไม่มีผู้เรียกใน api.js
-- #2 (p_instrument_id uuid)    — ใช้ไม่ได้เลย เพราะ instruments.id เป็น bigint
-- #3 (7 args)                  — ตัวที่ถูกเรียกจริง ต้อง DROP ก่อนเพราะเรากำลังเพิ่ม
--                                p_event_id ถ้าใช้ CREATE OR REPLACE เฉย ๆ จะได้
--                                overload ตัวที่ 4 → กลับไปกำกวมเหมือนเดิม
-- เป้าหมาย: เหลือฟังก์ชันนี้เพียงตัวเดียวในฐานข้อมูล

DROP FUNCTION IF EXISTS public.borrow_instrument_atomic(bigint, uuid, boolean, date, boolean);
DROP FUNCTION IF EXISTS public.borrow_instrument_atomic(uuid, uuid, boolean, timestamptz, boolean, integer);
DROP FUNCTION IF EXISTS public.borrow_instrument_atomic(text, timestamptz, bigint, boolean, boolean, uuid, integer);

-- อีกสองตัวที่ต้อง DROP เพราะเปลี่ยน return type / ชนิดพารามิเตอร์
--   admin_get_live_borrowing_status — เพิ่มคอลัมน์ borrow_type, expected_return_at, is_overdue
--   get_instrument_scan_details     — เดิมรับ integer เปลี่ยนเป็น bigint ให้ตรง instruments.id
DROP FUNCTION IF EXISTS public.admin_get_live_borrowing_status();
DROP FUNCTION IF EXISTS public.get_instrument_scan_details(integer);


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ STEP 4 — เขียน borrow_instrument_atomic ใหม่ (ตัวเดียวที่เหลือ)            ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public.borrow_instrument_atomic(
    p_borrow_type          text,
    p_due_date             timestamptz,
    p_instrument_id        bigint,
    p_is_take_home         boolean,
    p_parent_acknowledged  boolean,
    p_user_id              uuid,
    p_borrow_quantity      integer DEFAULT 1,
    p_event_id             bigint  DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_inst      RECORD;
    v_user      RECORD;
    v_type      text;
    v_approval  text;
    v_expected  timestamptz;
BEGIN
    -- 1) ผู้ใช้
    SELECT student_group, is_blocked, block_reason
      INTO v_user
      FROM public.users WHERE id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ไม่พบข้อมูลผู้ใช้';
    END IF;
    IF v_user.is_blocked THEN
        RAISE EXCEPTION 'บัญชีถูกระงับการใช้งาน: %', COALESCE(v_user.block_reason, 'ไม่ระบุ');
    END IF;

    -- 2) ชนิดการยืม — normalize ให้ไม่มีทางเป็น NULL อีก (ต้นตอบั๊กเดิม)
    v_type := COALESCE(NULLIF(TRIM(p_borrow_type), ''),
                       CASE WHEN p_is_take_home THEN 'take_home' ELSE 'in_school' END);

    IF v_type NOT IN ('in_school', 'performance', 'take_home', 'special') THEN
        RAISE EXCEPTION 'ประเภทการยืมไม่ถูกต้อง: %', v_type;
    END IF;

    -- นักเรียนทั่วไปยืมได้เฉพาะซ้อมในโรงเรียน
    IF v_user.student_group = 'student' AND v_type <> 'in_school' THEN
        RAISE EXCEPTION 'นักเรียนทั่วไปยืมได้เฉพาะการซ้อมในโรงเรียน';
    END IF;

    -- ยืมออกงานต้องผูกกับงานที่ครูเปิดไว้ (บังคับเมื่อมีระบบงานแล้ว)
    IF v_type = 'performance' AND p_event_id IS NULL
       AND EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_schema='public' AND table_name='events') THEN
        RAISE EXCEPTION 'การยืมออกงานต้องเลือกงานที่ครูเปิดไว้';
    END IF;

    -- 3) เครื่องดนตรี — ล็อกแถวกัน race
    SELECT * INTO v_inst
      FROM public.instruments WHERE id = p_instrument_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ไม่พบรหัสเครื่องดนตรีนี้ (ID: %)', p_instrument_id;
    END IF;

    -- 4) กำหนดคืน — คำนวณฝั่ง server เสมอ ไม่เชื่อ client
    v_expected := public.calc_expected_return_at(
        v_user.student_group, v_type, p_due_date, now());

    v_approval := CASE WHEN v_type = 'take_home' THEN 'pending' ELSE 'approved' END;

    IF v_type = 'take_home' AND p_due_date IS NULL THEN
        RAISE EXCEPTION 'การยืมกลับบ้านต้องระบุวันกำหนดคืน';
    END IF;

    -- 5) ตัดสต๊อก
    IF v_inst.stock_type = 'Serialized' THEN
        IF v_inst.status <> 'พร้อมใช้งาน' THEN
            RAISE EXCEPTION 'เครื่องไม่พร้อมให้ยืม (สถานะ: "%")', v_inst.status;
        END IF;
        UPDATE public.instruments
           SET status = 'ถูกยืมอยู่',
               current_borrower_id = p_user_id      -- ⭐ overload เดิมลืมบรรทัดนี้
         WHERE id = p_instrument_id;
    ELSE
        IF v_inst.quantity < p_borrow_quantity THEN
            RAISE EXCEPTION 'ของในสต๊อกไม่พอ (เหลือ % ต้องการ %)',
                            v_inst.quantity, p_borrow_quantity;
        END IF;
        UPDATE public.instruments
           SET quantity = quantity - p_borrow_quantity,
               status = CASE WHEN (quantity - p_borrow_quantity) <= 0
                             THEN 'หมดสต๊อก' ELSE 'พร้อมใช้งาน' END
         WHERE id = p_instrument_id;
    END IF;

    -- 6) บันทึก log
    INSERT INTO public.borrow_logs (
        student_id, instrument_id, instrument_name, instrument_type,
        borrow_timestamp, due_date, expected_return_at,
        is_take_home, borrow_type, approval_status,
        parent_acknowledged, borrow_quantity
    ) VALUES (
        p_user_id, p_instrument_id, v_inst.name, v_inst.type,
        now(), p_due_date::date, v_expected,
        (v_type IN ('take_home','special')), v_type, v_approval,
        p_parent_acknowledged, p_borrow_quantity
    );

    RETURN json_build_object(
        'success', true,
        'borrow_type', v_type,
        'expected_return_at', v_expected,
        'message', format('ยืม %s เรียบร้อย — กำหนดคืน %s',
                          v_inst.name,
                          to_char(v_expected AT TIME ZONE 'Asia/Bangkok', 'DD/MM HH24:MI'))
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.borrow_instrument_atomic(
    text, timestamptz, bigint, boolean, boolean, uuid, integer, bigint) TO authenticated;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ STEP 5 — ให้ scan/live-status ส่งประเภทกลับมาด้วย                          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public.admin_get_live_borrowing_status()
RETURNS TABLE (
    log_id bigint, student_id uuid, student_name text, instrument_name text,
    borrow_timestamp timestamptz, is_take_home boolean, approval_status text,
    due_date date, borrow_type text, expected_return_at timestamptz,
    is_overdue boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT bl.id,
           bl.student_id,
           COALESCE(u.prefix,'') || u.first_name || ' ' || u.last_name,
           i.name,
           bl.borrow_timestamp,
           bl.is_take_home,
           bl.approval_status,
           bl.due_date,
           COALESCE(bl.borrow_type, CASE WHEN bl.is_take_home
                                         THEN 'take_home' ELSE 'in_school' END),
           bl.expected_return_at,
           (bl.expected_return_at IS NOT NULL AND bl.expected_return_at < now())
      FROM public.borrow_logs bl
      JOIN public.users       u ON u.id = bl.student_id
      JOIN public.instruments i ON i.id = bl.instrument_id
     WHERE bl.return_timestamp IS NULL
     ORDER BY bl.expected_return_at NULLS LAST, bl.borrow_timestamp;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_live_borrowing_status() TO authenticated;


CREATE OR REPLACE FUNCTION public.get_instrument_scan_details(p_instrument_id bigint)
RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_inst RECORD;
    v_log  RECORD;
BEGIN
    SELECT * INTO v_inst FROM public.instruments WHERE id = p_instrument_id;
    IF NOT FOUND THEN RETURN NULL; END IF;

    SELECT * INTO v_log
      FROM public.borrow_logs
     WHERE instrument_id = p_instrument_id AND return_timestamp IS NULL
     ORDER BY borrow_timestamp DESC LIMIT 1;

    RETURN json_build_object(
        'instrument_id',   v_inst.id,
        'instrument_name', v_inst.name,
        'instrument_type', v_inst.type,
        'image_url',       v_inst.image_url,
        'condition',       v_inst.condition,
        'status',          v_inst.status,
        'is_borrowed_by_current_user',
            (v_log.student_id IS NOT NULL AND v_log.student_id = auth.uid()),
        'borrow_type',        v_log.borrow_type,
        'expected_return_at', v_log.expected_return_at,
        'log_id',             v_log.id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_instrument_scan_details(bigint) TO authenticated;


-- get_my_borrowed_items เดิมไม่ส่ง borrow_type กลับมาเลย ทำให้หน้านักเรียน
-- (student-dashboard.js:273,287) เทียบ log.borrow_type === 'performance' ได้ false เสมอ
-- → ยืมออกงานขึ้นว่า "🏫 กำลังซ้อม" และโดนเตือน "ลืมคืน" ที่ 6 ชม. ทั้งที่ไม่ควร
DROP FUNCTION IF EXISTS public.get_my_borrowed_items(uuid);

CREATE OR REPLACE FUNCTION public.get_my_borrowed_items(p_user_id uuid)
RETURNS TABLE (
    id bigint, instrument_id bigint, borrow_timestamp timestamptz,
    is_take_home boolean, due_date date, approval_status text,
    instrument_name text, borrow_type text,
    expected_return_at timestamptz, is_overdue boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT bl.id, bl.instrument_id, bl.borrow_timestamp,
           bl.is_take_home, bl.due_date, bl.approval_status,
           i.name,
           COALESCE(bl.borrow_type, CASE WHEN bl.is_take_home
                                         THEN 'take_home' ELSE 'in_school' END),
           bl.expected_return_at,
           (bl.expected_return_at IS NOT NULL AND bl.expected_return_at < now())
      FROM public.borrow_logs bl
      JOIN public.instruments i ON i.id = bl.instrument_id
     WHERE bl.student_id = p_user_id
       AND bl.return_timestamp IS NULL
     ORDER BY bl.expected_return_at NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_borrowed_items(uuid) TO authenticated;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ STEP 6 — เตือนคืนที่ใช้ได้จริง (เดิมกรอง due_date IS NOT NULL จนไม่เคยยิง) ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public.dispatch_due_date_reminders()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_soon integer := 0;
    v_over integer := 0;
BEGIN
    -- ใกล้ครบกำหนด: เหลือ <= 10 นาที (ครอบคลุมทั้งยืม 1 ชม. และ 6 ชม.)
    INSERT INTO public.notifications (user_id, title, body, is_read)
    SELECT bl.student_id,
           '⏰ ใกล้ครบกำหนดคืน',
           format('%s — เหลืออีก %s นาที กดคืนได้จากการแจ้งเตือนนี้',
                  bl.instrument_name,
                  GREATEST(0, round(EXTRACT(epoch FROM (bl.expected_return_at - now()))/60))),
           false
      FROM public.borrow_logs bl
     WHERE bl.return_timestamp IS NULL
       AND bl.expected_return_at BETWEEN now() AND now() + interval '10 minutes'
       AND NOT EXISTS (
             SELECT 1 FROM public.notifications n
              WHERE n.user_id = bl.student_id
                AND n.title = '⏰ ใกล้ครบกำหนดคืน'
                AND n.created_at > now() - interval '45 minutes');
    GET DIAGNOSTICS v_soon = ROW_COUNT;

    -- เลยกำหนด: เตือนซ้ำทุก 2 ชม. จนกว่าจะคืน
    INSERT INTO public.notifications (user_id, title, body, is_read)
    SELECT bl.student_id,
           '⚠️ เลยกำหนดคืนแล้ว',
           format('%s — เลยกำหนด %s ชม. กรุณาคืนด่วน',
                  bl.instrument_name,
                  round(EXTRACT(epoch FROM (now() - bl.expected_return_at))/3600, 1)),
           false
      FROM public.borrow_logs bl
     WHERE bl.return_timestamp IS NULL
       AND bl.expected_return_at < now()
       AND NOT EXISTS (
             SELECT 1 FROM public.notifications n
              WHERE n.user_id = bl.student_id
                AND n.title = '⚠️ เลยกำหนดคืนแล้ว'
                AND n.created_at > now() - interval '2 hours');
    GET DIAGNOSTICS v_over = ROW_COUNT;

    RETURN jsonb_build_object('soon', v_soon, 'overdue', v_over, 'at', now());
END;
$$;

GRANT EXECUTE ON FUNCTION public.dispatch_due_date_reminders() TO authenticated;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ STEP 7 — ซ่อมข้อมูลเดิม                                                    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- 7.1 backfill borrow_type (NULL 4,035 แถว)
UPDATE public.borrow_logs
   SET borrow_type = CASE WHEN is_take_home THEN 'take_home' ELSE 'in_school' END
 WHERE borrow_type IS NULL;

-- 7.2 backfill expected_return_at จากกติกาเดียวกัน
UPDATE public.borrow_logs bl
   SET expected_return_at = public.calc_expected_return_at(
           u.student_group, bl.borrow_type,
           bl.due_date::timestamptz, bl.borrow_timestamp)
  FROM public.users u
 WHERE u.id = bl.student_id
   AND bl.expected_return_at IS NULL;

-- 7.3 ⭐ ปลดล็อกเครื่องผี — status 'ถูกยืมอยู่' แต่ไม่มี log ค้างจริง (พบ 2 ชิ้น)
UPDATE public.instruments i
   SET status = 'พร้อมใช้งาน', current_borrower_id = NULL
 WHERE i.status = 'ถูกยืมอยู่'
   AND NOT EXISTS (SELECT 1 FROM public.borrow_logs bl
                    WHERE bl.instrument_id = i.id AND bl.return_timestamp IS NULL);

-- 7.4 เติม current_borrower_id ให้เครื่องที่ยืมอยู่จริง
UPDATE public.instruments i
   SET current_borrower_id = bl.student_id
  FROM public.borrow_logs bl
 WHERE bl.instrument_id = i.id
   AND bl.return_timestamp IS NULL
   AND i.current_borrower_id IS DISTINCT FROM bl.student_id;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ STEP 8 — pg_cron: เตือนทุก 10 นาที (เดิมรอคนเปิดแอปเท่านั้น)              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.unschedule('return_reminders')
          WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'return_reminders');
        PERFORM cron.schedule('return_reminders', '*/10 * * * *',
                              'SELECT public.dispatch_due_date_reminders();');
        RAISE NOTICE '✅ cron job "return_reminders" ตั้งแล้ว (ทุก 10 นาที)';
    ELSE
        RAISE WARNING '🔴 ยังไม่ได้เปิด pg_cron — ไปที่ Dashboard → Database → Extensions';
    END IF;
END $$;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ ✅ VERIFY                                                                 ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

SELECT 'overload ที่เหลือ' AS check_item, count(*)::text AS value,
       CASE WHEN count(*) = 1 THEN '✅' ELSE '🔴 ต้องเหลือ 1' END AS ok
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'borrow_instrument_atomic'
UNION ALL
SELECT 'borrow_type ที่ยัง NULL', count(*)::text,
       CASE WHEN count(*) = 0 THEN '✅' ELSE '🔴' END
  FROM public.borrow_logs WHERE borrow_type IS NULL
UNION ALL
SELECT 'expected_return_at ที่ยัง NULL', count(*)::text,
       CASE WHEN count(*) = 0 THEN '✅' ELSE '🔴' END
  FROM public.borrow_logs WHERE expected_return_at IS NULL
UNION ALL
SELECT 'เครื่องผี (ล็อกค้างไม่มีคนยืม)', count(*)::text,
       CASE WHEN count(*) = 0 THEN '✅' ELSE '🔴' END
  FROM public.instruments i
 WHERE i.status = 'ถูกยืมอยู่'
   AND NOT EXISTS (SELECT 1 FROM public.borrow_logs bl
                    WHERE bl.instrument_id = i.id AND bl.return_timestamp IS NULL);
