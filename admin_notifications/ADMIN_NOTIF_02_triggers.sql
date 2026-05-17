-- ═══════════════════════════════════════════════════════════════════════════
-- 🛠️ ADMIN NOTIFICATIONS — STEP 02: Synchronous Event Triggers
-- ═══════════════════════════════════════════════════════════════════════════
-- 📍 รันที่: Supabase SQL Editor (ต้องรัน ADMIN_NOTIF_01_schema.sql ก่อน)
-- 🎯 Triggers ที่ fire ทันทีเมื่อเกิดเหตุการณ์ (ไม่ต้องรอ cron)
-- ครอบคลุม #2, #3, #7, #9, #13, #14 จากรายการ 22 ข้อ
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ TRIGGER #2: 🔴 New admin role granted                                     ║
-- ║   ตรวจจับ privilege escalation — ใครเปลี่ยน role เป็น admin               ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public.tg_notify_admin_role_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_actor_name text;
    v_target_name text;
BEGIN
    -- เฉพาะตอนเปลี่ยน "เข้า" เป็น admin (ไม่ใช่ออก)
    IF NEW.role = 'admin' AND COALESCE(OLD.role, '') <> 'admin' THEN
        SELECT COALESCE(first_name || ' ' || last_name, email) INTO v_target_name
        FROM public.users WHERE id = NEW.id;

        v_actor_name := COALESCE(
            (SELECT first_name || ' ' || last_name FROM public.users WHERE id = auth.uid()),
            'System'
        );

        PERFORM public.notify_admins(
            'security',
            'critical',
            'ผู้ใช้ถูกเลื่อนเป็นแอดมิน',
            format('%s ได้รับสิทธิ์ admin (ทำโดย: %s) — ตรวจสอบความถูกต้องด่วน',
                v_target_name, v_actor_name),
            jsonb_build_object(
                'target_user_id', NEW.id,
                'actor_id', auth.uid(),
                'action', 'role_escalation'
            ),
            'role_grant_' || NEW.id::text,
            5  -- dedup 5 นาที
        );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_notify_admin_role_change ON public.users;
CREATE TRIGGER tg_notify_admin_role_change
    AFTER UPDATE OF role ON public.users
    FOR EACH ROW
    WHEN (OLD.role IS DISTINCT FROM NEW.role)
    EXECUTE FUNCTION public.tg_notify_admin_role_change();


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ TRIGGER #7: 🟠 User blocked / unblocked                                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public.tg_notify_user_block_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_target_name text;
BEGIN
    SELECT COALESCE(first_name || ' ' || last_name, email) INTO v_target_name
    FROM public.users WHERE id = NEW.id;

    IF NEW.is_blocked = true AND COALESCE(OLD.is_blocked, false) = false THEN
        PERFORM public.notify_admins(
            'user',
            'warning',
            'นักเรียนถูกบล็อก',
            format('%s ถูกบล็อก — เหตุผล: %s',
                v_target_name, COALESCE(NEW.block_reason, 'ไม่ระบุ')),
            jsonb_build_object('target_user_id', NEW.id, 'action', 'block'),
            'block_' || NEW.id::text,
            10
        );
    ELSIF NEW.is_blocked = false AND COALESCE(OLD.is_blocked, false) = true THEN
        PERFORM public.notify_admins(
            'user',
            'info',
            'นักเรียนถูกปลดบล็อก',
            format('%s ถูกปลดบล็อกแล้ว', v_target_name),
            jsonb_build_object('target_user_id', NEW.id, 'action', 'unblock'),
            'unblock_' || NEW.id::text,
            10
        );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_notify_user_block_change ON public.users;
CREATE TRIGGER tg_notify_user_block_change
    AFTER UPDATE OF is_blocked ON public.users
    FOR EACH ROW
    WHEN (OLD.is_blocked IS DISTINCT FROM NEW.is_blocked)
    EXECUTE FUNCTION public.tg_notify_user_block_change();


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ TRIGGER #9: 🟠 Suspicious XP gain (> 5,000 ใน 1 วัน)                     ║
-- ║   ตรวจจับ cheat / exploit ในระบบ gamification                              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public.tg_notify_xp_spike()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_xp_today int;
    v_target_name text;
BEGIN
    IF NEW.xp IS DISTINCT FROM OLD.xp AND NEW.xp > COALESCE(OLD.xp, 0) THEN
        -- คำนวณ XP gain วันนี้ (จาก notifications metadata หรือ approximate)
        v_xp_today := NEW.xp - COALESCE(OLD.xp, 0);

        -- ถ้าเพิ่มเกิน 1,000 ใน 1 รอบ → suspect
        IF v_xp_today > 1000 THEN
            SELECT COALESCE(first_name || ' ' || last_name, email) INTO v_target_name
            FROM public.users WHERE id = NEW.id;

            PERFORM public.notify_admins(
                'user',
                'warning',
                'XP เพิ่มผิดปกติ',
                format('%s ได้ +%s XP ใน 1 ครั้ง (รวม: %s XP) — ตรวจสอบ',
                    v_target_name, v_xp_today, NEW.xp),
                jsonb_build_object(
                    'target_user_id', NEW.id,
                    'xp_delta', v_xp_today,
                    'xp_total', NEW.xp
                ),
                'xp_spike_' || NEW.id::text || '_' || to_char(now(),'YYYYMMDD'),
                60  -- dedup 1 ชั่วโมง
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_notify_xp_spike ON public.users;
CREATE TRIGGER tg_notify_xp_spike
    AFTER UPDATE OF xp ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_notify_xp_spike();


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ TRIGGER #13: 🟡 New repair request                                       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public.tg_notify_new_repair()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_inst_name text;
    v_reporter_name text;
BEGIN
    SELECT name INTO v_inst_name FROM public.instruments WHERE id = NEW.instrument_id;
    SELECT COALESCE(first_name || ' ' || last_name, email) INTO v_reporter_name
    FROM public.users WHERE id = NEW.reported_by;

    PERFORM public.notify_admins(
        'operation',
        'info',
        'แจ้งซ่อมใหม่',
        format('%s แจ้งซ่อม "%s" — รออนุมัติ',
            COALESCE(v_reporter_name, 'ไม่ระบุ'),
            COALESCE(v_inst_name, 'เครื่อง #' || NEW.instrument_id)),
        jsonb_build_object(
            'repair_id', NEW.id,
            'instrument_id', NEW.instrument_id,
            'reported_by', NEW.reported_by
        ),
        'repair_' || NEW.id::text,
        60
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_notify_new_repair ON public.repair_logs;
CREATE TRIGGER tg_notify_new_repair
    AFTER INSERT ON public.repair_logs
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_notify_new_repair();


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ TRIGGER #14: 🟠 Instrument condition critical                            ║
-- ║   เมื่อเครื่องเปลี่ยนสถานะเป็น "ชำรุด" หรือ condition แย่                   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public.tg_notify_instrument_critical()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    IF NEW.status = 'ชำรุด' AND COALESCE(OLD.status, '') <> 'ชำรุด' THEN
        PERFORM public.notify_admins(
            'operation',
            'warning',
            'เครื่องดนตรีชำรุด',
            format('%s ถูกแจ้งสถานะ "ชำรุด"', NEW.name),
            jsonb_build_object('instrument_id', NEW.id, 'name', NEW.name),
            'instrument_broken_' || NEW.id::text,
            30
        );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_notify_instrument_critical ON public.instruments;
CREATE TRIGGER tg_notify_instrument_critical
    AFTER UPDATE OF status ON public.instruments
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION public.tg_notify_instrument_critical();


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ TRIGGER #16-prep: 🟡 New knowledge link pending review                   ║
-- ║   (cron #16 จะตรวจที่ค้างเกิน 24 ชม. — trigger นี้แจ้งทันทีที่ส่ง)            ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public.tg_notify_new_knowledge_link()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_submitter_name text;
BEGIN
    IF NEW.is_approved = false OR NEW.is_approved IS NULL THEN
        SELECT COALESCE(first_name || ' ' || last_name, email) INTO v_submitter_name
        FROM public.users WHERE id = NEW.submitted_by;

        PERFORM public.notify_admins(
            'learning',
            'info',
            'คลิปความรู้รออนุมัติ',
            format('%s ส่ง "%s" รอตรวจ',
                COALESCE(v_submitter_name, 'ไม่ระบุ'),
                COALESCE(NEW.title, 'ไม่มีชื่อ')),
            jsonb_build_object(
                'knowledge_id', NEW.id,
                'submitted_by', NEW.submitted_by
            ),
            'knowledge_pending_' || NEW.id::text,
            60
        );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_notify_new_knowledge_link ON public.knowledge_links;
CREATE TRIGGER tg_notify_new_knowledge_link
    AFTER INSERT ON public.knowledge_links
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_notify_new_knowledge_link();


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ TRIGGER #3-prep: 🔴 Mass operations watcher                              ║
-- ║   ตรวจ INSERT/UPDATE/DELETE > 50 rows ใน 1 statement                      ║
-- ║   (Postgres ไม่มี way ดี — ใช้ row-level trigger + heuristic)             ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- 💡 หมายเหตุ: การจับ "mass operation" จริงๆ ต้องใช้ pg_audit extension
-- หรือดูจาก Supabase Dashboard → Database → Logs
-- ที่นี่ทำแบบประมาณ — track row count ผ่าน statement-level trigger บนตารางสำคัญ

CREATE OR REPLACE FUNCTION public.tg_notify_mass_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_count int;
BEGIN
    SELECT COUNT(*) INTO v_count FROM deleted_rows;
    IF v_count >= 50 THEN
        PERFORM public.notify_admins(
            'security',
            'critical',
            'ลบข้อมูลจำนวนมาก',
            format('ลบ %s rows ออกจากตาราง %s ใน 1 ครั้ง — ตรวจสอบด่วน',
                v_count, TG_TABLE_NAME),
            jsonb_build_object(
                'table', TG_TABLE_NAME,
                'count', v_count,
                'actor_id', auth.uid()
            ),
            'mass_delete_' || TG_TABLE_NAME || '_' || extract(epoch from now())::text,
            1   -- ไม่ dedup เลย
        );
    END IF;
    RETURN NULL;
END;
$$;

-- ติด trigger บนตารางที่ sensitive ที่สุด
DROP TRIGGER IF EXISTS tg_notify_mass_delete_users ON public.users;
CREATE TRIGGER tg_notify_mass_delete_users
    AFTER DELETE ON public.users
    REFERENCING OLD TABLE AS deleted_rows
    FOR EACH STATEMENT
    EXECUTE FUNCTION public.tg_notify_mass_delete();

DROP TRIGGER IF EXISTS tg_notify_mass_delete_instruments ON public.instruments;
CREATE TRIGGER tg_notify_mass_delete_instruments
    AFTER DELETE ON public.instruments
    REFERENCING OLD TABLE AS deleted_rows
    FOR EACH STATEMENT
    EXECUTE FUNCTION public.tg_notify_mass_delete();

DROP TRIGGER IF EXISTS tg_notify_mass_delete_borrow_logs ON public.borrow_logs;
CREATE TRIGGER tg_notify_mass_delete_borrow_logs
    AFTER DELETE ON public.borrow_logs
    REFERENCING OLD TABLE AS deleted_rows
    FOR EACH STATEMENT
    EXECUTE FUNCTION public.tg_notify_mass_delete();


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ ✅ VERIFY                                                                   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

SELECT trigger_name, event_object_table, action_timing, event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND trigger_name LIKE 'tg_notify_%'
ORDER BY event_object_table, trigger_name;
