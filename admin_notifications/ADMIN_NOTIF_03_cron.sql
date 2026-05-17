-- ═══════════════════════════════════════════════════════════════════════════
-- 🛠️ ADMIN NOTIFICATIONS — STEP 03: Scheduled (pg_cron) Jobs
-- ═══════════════════════════════════════════════════════════════════════════
-- 📍 รันที่: Supabase SQL Editor
-- ⚠️ ต้อง enable pg_cron extension ก่อน (Dashboard → Database → Extensions)
-- 🎯 ครอบคลุม #1, #6, #8, #10, #11, #12, #15, #16, #17 จากรายการ 22 ข้อ
-- ⏱️ ทุก job runs in UTC — ปรับเวลาตาม Bangkok (UTC+7) ตามคอมเมนต์
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ STEP 3.0 — เช็คว่า pg_cron พร้อมใช้ไหม                                     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

SELECT
    extname,
    CASE WHEN extname IS NOT NULL THEN '✅ Enabled' ELSE '🔴 ต้องเปิดใน Dashboard → Extensions' END AS status
FROM pg_extension WHERE extname = 'pg_cron'
UNION ALL
SELECT 'pg_cron', '🔴 ยังไม่ enable'
WHERE NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron');

-- 👉 ถ้ายังไม่ enable: ไปที่ Supabase Dashboard → Database → Extensions
--    → ค้นหา "pg_cron" → กด Enable แล้วกลับมารัน Step 3.1-3.10


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ JOB #1: 🔴 Failed login spike (ตรวจทุก 15 นาที)                          ║
-- ║   วิเคราะห์ auth.audit_log_entries — Supabase บันทึก login failures        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public.cron_check_failed_logins()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp, auth AS $$
DECLARE
    v_failed_count int;
    v_ip_list text;
BEGIN
    -- นับ login failures ใน 15 นาทีล่าสุด จาก audit log
    SELECT COUNT(*),
           string_agg(DISTINCT (payload->>'remote_ip'), ', ')
    INTO v_failed_count, v_ip_list
    FROM auth.audit_log_entries
    WHERE created_at > now() - interval '15 minutes'
      AND payload->>'action' = 'login'
      AND (payload->'error' IS NOT NULL OR payload->>'status' = '4%');

    IF v_failed_count >= 5 THEN
        PERFORM public.notify_admins(
            'security', 'critical',
            'พบการ login ล้มเหลวจำนวนมาก',
            format('Login ล้มเหลว %s ครั้งใน 15 นาที (IPs: %s) — อาจเป็น brute force',
                v_failed_count, COALESCE(v_ip_list, 'unknown')),
            jsonb_build_object('count', v_failed_count, 'ips', v_ip_list),
            'failed_login_spike_' || to_char(now(), 'YYYYMMDDHH24MI'),
            30
        );
    END IF;
END;
$$;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ JOB #6: 🔵 Daily user registrations summary (รายวัน 18:00 BKK)            ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public.cron_daily_user_summary()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_new_today int;
    v_total int;
BEGIN
    SELECT COUNT(*) INTO v_new_today
    FROM public.users
    WHERE created_at > current_date AT TIME ZONE 'Asia/Bangkok';

    SELECT COUNT(*) INTO v_total FROM public.users;

    PERFORM public.notify_admins(
        'user', 'info',
        'สรุปยอดผู้ใช้รายวัน',
        format('วันนี้มีผู้ใช้ใหม่ %s คน  รวมทั้งหมด %s คน', v_new_today, v_total),
        jsonb_build_object('new_today', v_new_today, 'total', v_total),
        'daily_user_summary_' || to_char(now(), 'YYYYMMDD'),
        20 * 60
    );
END;
$$;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ JOB #8: 🟠 Inactive users spike (รายสัปดาห์ — จันทร์ 09:00 BKK)            ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public.cron_check_inactive_users()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_inactive int;
    v_total int;
    v_pct numeric;
BEGIN
    SELECT COUNT(*) INTO v_total FROM public.users WHERE role = 'student';

    SELECT COUNT(*) INTO v_inactive
    FROM public.users u
    WHERE u.role = 'student'
      AND NOT EXISTS (
          SELECT 1 FROM auth.audit_log_entries a
          WHERE (a.payload->>'actor_id')::uuid = u.id
            AND a.created_at > now() - interval '7 days'
      );

    IF v_total > 0 THEN
        v_pct := (v_inactive::numeric / v_total) * 100;

        IF v_pct > 20 THEN
            PERFORM public.notify_admins(
                'user', 'warning',
                'นักเรียนไม่ active เพิ่มขึ้น',
                format('%s%% (%s/%s) ไม่ได้ login ในรอบ 7 วัน',
                    round(v_pct, 1), v_inactive, v_total),
                jsonb_build_object('inactive', v_inactive, 'total', v_total, 'pct', v_pct),
                'inactive_users_' || to_char(now(), 'IYYY_IW'),
                7 * 24 * 60
            );
        END IF;
    END IF;
END;
$$;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ JOB #10: 🔵 Soft-block expiring soon (รายวัน 08:00 BKK)                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public.cron_check_block_expiring()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_count int;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM public.users
    WHERE is_blocked = true
      AND exp_blocked_until IS NOT NULL
      AND exp_blocked_until BETWEEN now() AND now() + interval '24 hours';

    IF v_count > 0 THEN
        PERFORM public.notify_admins(
            'user', 'info',
            'นักเรียนที่จะหมดบล็อกใน 24 ชม.',
            format('มี %s คน ที่ block จะหมดอายุภายใน 24 ชม. — ตรวจสอบก่อนพวกเขากลับมาเรียน', v_count),
            jsonb_build_object('count', v_count),
            'block_expiring_' || to_char(now(), 'YYYYMMDD'),
            20 * 60
        );
    END IF;
END;
$$;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ JOB #11: 🟠 Pending borrow approvals > 1 hr (ตรวจทุก 30 นาที)            ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public.cron_check_pending_borrows()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_count int;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM public.borrow_logs
    WHERE approval_status = 'pending'
      AND borrow_timestamp < now() - interval '1 hour';

    IF v_count > 0 THEN
        PERFORM public.notify_admins(
            'operation', 'warning',
            'คำขอยืมค้างนานเกิน 1 ชม.',
            format('มี %s คำขอยืม รออนุมัติเกิน 1 ชั่วโมง — นักเรียนกำลังรอ', v_count),
            jsonb_build_object('count', v_count),
            'pending_borrow_backlog',
            120
        );
    END IF;
END;
$$;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ JOB #12: 🟠 Overdue items > 3 days (ตรวจรายวัน 09:00 BKK)                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public.cron_check_overdue_items()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_count int;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM public.borrow_logs
    WHERE return_timestamp IS NULL
      AND due_date < (current_date AT TIME ZONE 'Asia/Bangkok') - interval '3 days';

    IF v_count > 0 THEN
        PERFORM public.notify_admins(
            'operation', 'warning',
            'มีเครื่องเกินกำหนดคืนเกิน 3 วัน',
            format('%s ชิ้น ค้างคืนเกิน 3 วัน — อาจหาย/เสียหาย', v_count),
            jsonb_build_object('count', v_count),
            'overdue_items_' || to_char(now(), 'YYYYMMDD'),
            12 * 60
        );
    END IF;
END;
$$;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ JOB #15: 🟡 Low inventory alert (ตรวจรายวัน 09:00 BKK)                    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public.cron_check_low_inventory()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_low_types text;
BEGIN
    -- หา type ที่มี ratio พร้อมยืม < 20%
    WITH inv AS (
        SELECT type,
               COUNT(*) FILTER (WHERE status = 'พร้อมใช้งาน') AS available,
               COUNT(*) AS total
        FROM public.instruments
        WHERE type IS NOT NULL
        GROUP BY type
    )
    SELECT string_agg(type || ' (' || available || '/' || total || ')', ', ')
    INTO v_low_types
    FROM inv
    WHERE total > 0 AND (available::numeric / total) < 0.2;

    IF v_low_types IS NOT NULL THEN
        PERFORM public.notify_admins(
            'operation', 'warning',
            'เครื่องดนตรีคงเหลือน้อย',
            format('ประเภทที่เหลือน้อยกว่า 20%%: %s', v_low_types),
            jsonb_build_object('types', v_low_types),
            'low_inventory_' || to_char(now(), 'YYYYMMDD'),
            12 * 60
        );
    END IF;
END;
$$;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ JOB #16: 🟡 Knowledge link pending > 24 ชม. (ตรวจรายวัน 10:00 BKK)        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public.cron_check_pending_knowledge()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_count int;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM public.knowledge_links
    WHERE (is_approved = false OR is_approved IS NULL)
      AND created_at < now() - interval '24 hours';

    IF v_count > 0 THEN
        PERFORM public.notify_admins(
            'learning', 'warning',
            'คลิปความรู้ค้างตรวจนานเกิน 24 ชม.',
            format('%s คลิป ค้างตรวจ — นักเรียนรอ +100 XP', v_count),
            jsonb_build_object('count', v_count),
            'knowledge_backlog_' || to_char(now(), 'YYYYMMDD'),
            20 * 60
        );
    END IF;
END;
$$;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ JOB #17: 🟡 Boss raid submission backlog > 48 ชม.                        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public.cron_check_pending_raids()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_count int;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM public.boss_raids
    WHERE status = 'pending'
      AND submitted_at < now() - interval '48 hours';

    IF v_count > 0 THEN
        PERFORM public.notify_admins(
            'learning', 'warning',
            'ผลสอบบอสค้างตรวจเกิน 48 ชม.',
            format('%s คลิป boss raid ค้างตรวจ — นักเรียนรอผล', v_count),
            jsonb_build_object('count', v_count),
            'raid_backlog_' || to_char(now(), 'YYYYMMDD'),
            20 * 60
        );
    END IF;
END;
$$;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ STEP 3.10 — ลงทะเบียน cron jobs                                            ║
-- ║ ⚠️ ทุก schedule เป็น UTC — BKK = UTC + 7 ชม.                              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ลบ job เก่า (ถ้ามี) ก่อน schedule ใหม่
SELECT cron.unschedule(jobname) FROM cron.job
WHERE jobname IN (
    'check_failed_logins','daily_user_summary','check_inactive_users',
    'check_block_expiring','check_pending_borrows','check_overdue_items',
    'check_low_inventory','check_pending_knowledge','check_pending_raids'
);

-- #1: ทุก 15 นาที
SELECT cron.schedule('check_failed_logins', '*/15 * * * *',
    'SELECT public.cron_check_failed_logins();');

-- #6: ทุกวัน 18:00 BKK = 11:00 UTC
SELECT cron.schedule('daily_user_summary', '0 11 * * *',
    'SELECT public.cron_daily_user_summary();');

-- #8: ทุกจันทร์ 09:00 BKK = 02:00 UTC
SELECT cron.schedule('check_inactive_users', '0 2 * * 1',
    'SELECT public.cron_check_inactive_users();');

-- #10: ทุกวัน 08:00 BKK = 01:00 UTC
SELECT cron.schedule('check_block_expiring', '0 1 * * *',
    'SELECT public.cron_check_block_expiring();');

-- #11: ทุก 30 นาที
SELECT cron.schedule('check_pending_borrows', '*/30 * * * *',
    'SELECT public.cron_check_pending_borrows();');

-- #12: ทุกวัน 09:00 BKK = 02:00 UTC
SELECT cron.schedule('check_overdue_items', '0 2 * * *',
    'SELECT public.cron_check_overdue_items();');

-- #15: ทุกวัน 09:00 BKK = 02:00 UTC
SELECT cron.schedule('check_low_inventory', '5 2 * * *',
    'SELECT public.cron_check_low_inventory();');

-- #16: ทุกวัน 10:00 BKK = 03:00 UTC
SELECT cron.schedule('check_pending_knowledge', '0 3 * * *',
    'SELECT public.cron_check_pending_knowledge();');

-- #17: ทุกวัน 10:30 BKK = 03:30 UTC
SELECT cron.schedule('check_pending_raids', '30 3 * * *',
    'SELECT public.cron_check_pending_raids();');


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ ✅ VERIFY — ดู cron jobs ที่ลงทะเบียนแล้ว                                   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

SELECT jobid, jobname, schedule, command, active
FROM cron.job
WHERE jobname LIKE 'check_%' OR jobname LIKE 'daily_%'
ORDER BY jobname;
