-- =====================================================================
-- MIGRATION: Fix Staff Roles Scope Value, Thai Spelling & Duty RPCs
-- File: MIGRATION_FIX_STAFF_ROLES_BIGINT.sql
-- =====================================================================

-- 1. admin_grant_staff
DROP FUNCTION IF EXISTS public.admin_grant_staff(uuid, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.admin_grant_staff(uuid, text) CASCADE;

CREATE OR REPLACE FUNCTION public.admin_grant_staff(
    p_user_id uuid,
    p_scope_type text,
    p_scope_value text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_label text;
BEGIN
    -- Security guard check using existing users.role column
    IF current_setting('request.jwt.claims', true)::jsonb->>'role' NOT IN ('admin', 'service_role')
       AND NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'permission denied for admin_grant_staff' USING ERRCODE = '42501';
    END IF;

    -- Validate target student
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id) THEN
        RETURN jsonb_build_object('success', false, 'message', 'ไม่พบนักเรียนนี้ในระบบ');
    END IF;

    -- Validate scope_type
    IF p_scope_type NOT IN ('band', 'section', 'instrument', 'event', 'uniform') THEN
        RETURN jsonb_build_object('success', false, 'message', 'ประเภทขอบเขตไม่ถูกต้อง');
    END IF;

    -- Determine scope label and sanitize scope_value
    IF p_scope_type = 'band' THEN
        v_label := 'ทั้งวง';
        p_scope_value := NULL;
    ELSIF p_scope_type = 'uniform' THEN
        v_label := 'ชุดวงโยธวาทิต';
        p_scope_value := NULL;
    ELSIF p_scope_type = 'section' THEN
        IF p_scope_value IS NULL OR trim(p_scope_value) = '' THEN
            RETURN jsonb_build_object('success', false, 'message', 'กรุณาระบุกลุ่มเครื่อง');
        END IF;
        SELECT name_th INTO v_label FROM public.sections WHERE code = p_scope_value OR name_th = p_scope_value;
        IF v_label IS NULL THEN v_label := p_scope_value; END IF;
    ELSIF p_scope_type = 'event' THEN
        IF p_scope_value IS NULL OR trim(p_scope_value) = '' THEN
            RETURN jsonb_build_object('success', false, 'message', 'กรุณาระบุงาน');
        END IF;
        IF p_scope_value ~ '^\d+$' THEN
            SELECT name INTO v_label FROM public.events WHERE id = p_scope_value::bigint;
        END IF;
        IF v_label IS NULL THEN v_label := 'งาน #' || p_scope_value; END IF;
    ELSIF p_scope_type = 'instrument' THEN
        IF p_scope_value IS NULL OR trim(p_scope_value) = '' THEN
            RETURN jsonb_build_object('success', false, 'message', 'กรุณาระบุเครื่องดนตรี');
        END IF;
        v_label := p_scope_value;
        IF p_scope_value ~ '^\d+$' THEN
            SELECT COALESCE(name, type, p_scope_value) INTO v_label FROM public.instruments WHERE id = p_scope_value::bigint;
        END IF;
    END IF;

    -- Upsert staff role
    DELETE FROM public.staff_roles 
    WHERE user_id = p_user_id 
      AND scope_type = p_scope_type 
      AND (scope_value = p_scope_value OR (scope_value IS NULL AND p_scope_value IS NULL));

    INSERT INTO public.staff_roles (user_id, scope_type, scope_value, granted_by, is_active, granted_at)
    VALUES (p_user_id, p_scope_type, p_scope_value, auth.uid(), true, NOW());

    RETURN jsonb_build_object('success', true, 'message', 'แต่งตั้งสำเร็จ (' || v_label || ')');
END;
$$;


-- 2. admin_staff_list
DROP FUNCTION IF EXISTS public.admin_staff_list() CASCADE;

CREATE OR REPLACE FUNCTION public.admin_staff_list()
RETURNS TABLE (
    role_id bigint,
    user_id uuid,
    full_name text,
    nickname text,
    student_group text,
    main_instrument text,
    scope_type text,
    scope_value text,
    scope_label text,
    granted_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF current_setting('request.jwt.claims', true)::jsonb->>'role' NOT IN ('admin', 'service_role')
       AND NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'permission denied for admin_staff_list' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT 
        sr.id AS role_id,
        sr.user_id,
        TRIM(COALESCE(u.prefix, '') || ' ' || COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS full_name,
        u.nickname,
        u.student_group,
        u.main_instrument,
        sr.scope_type,
        sr.scope_value,
        CASE 
            WHEN sr.scope_type = 'band' THEN 'ทั้งวง'
            WHEN sr.scope_type = 'uniform' THEN 'ชุดวงโยธวาทิต'
            WHEN sr.scope_type = 'section' THEN COALESCE((SELECT s.name_th FROM public.sections s WHERE s.code = sr.scope_value OR s.name_th = sr.scope_value), sr.scope_value)
            WHEN sr.scope_type = 'event' AND sr.scope_value ~ '^\d+$' THEN COALESCE((SELECT e.name FROM public.events e WHERE e.id = sr.scope_value::bigint), 'งาน #' || sr.scope_value)
            WHEN sr.scope_type = 'instrument' THEN 
                CASE 
                    WHEN sr.scope_value ~ '^\d+$' THEN COALESCE((SELECT i.name FROM public.instruments i WHERE i.id = sr.scope_value::bigint), sr.scope_value)
                    ELSE sr.scope_value
                END
            ELSE COALESCE(sr.scope_value, '')
        END AS scope_label,
        sr.granted_at
    FROM public.staff_roles sr
    JOIN public.users u ON u.id = sr.user_id
    WHERE sr.is_active = true
    ORDER BY sr.id DESC;
END;
$$;


-- 3. get_my_staff_scopes
DROP FUNCTION IF EXISTS public.get_my_staff_scopes() CASCADE;

CREATE OR REPLACE FUNCTION public.get_my_staff_scopes()
RETURNS TABLE (
    t text,
    v text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        sr.scope_type AS t,
        CASE 
            WHEN sr.scope_type = 'band' THEN 'ทั้งวง'
            WHEN sr.scope_type = 'uniform' THEN 'ชุดวงโยธวาทิต'
            WHEN sr.scope_type = 'section' THEN COALESCE((SELECT s.name_th FROM public.sections s WHERE s.code = sr.scope_value OR s.name_th = sr.scope_value), sr.scope_value)
            WHEN sr.scope_type = 'event' AND sr.scope_value ~ '^\d+$' THEN COALESCE((SELECT e.name FROM public.events e WHERE e.id = sr.scope_value::bigint), 'งาน #' || sr.scope_value)
            WHEN sr.scope_type = 'instrument' THEN 
                CASE 
                    WHEN sr.scope_value ~ '^\d+$' THEN COALESCE((SELECT i.name FROM public.instruments i WHERE i.id = sr.scope_value::bigint), sr.scope_value)
                    ELSE sr.scope_value
                END
            ELSE COALESCE(sr.scope_value, '')
        END AS v
    FROM public.staff_roles sr
    WHERE sr.user_id = auth.uid()
      AND sr.is_active = true;
END;
$$;


-- 4. staff_get_outstanding
DROP FUNCTION IF EXISTS public.staff_get_outstanding(bigint) CASCADE;
DROP FUNCTION IF EXISTS public.staff_get_outstanding() CASCADE;

CREATE OR REPLACE FUNCTION public.staff_get_outstanding(p_event_id bigint DEFAULT NULL)
RETURNS TABLE (
    log_id bigint,
    instrument_id bigint,
    instrument_name text,
    instrument_kind text,
    section_name text,
    student_id uuid,
    student_name text,
    student_nickname text,
    borrowed_at timestamptz,
    expected_return_at timestamptz,
    is_overdue boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_is_band boolean := false;
BEGIN
    -- Check if user is band leader or admin
    IF EXISTS (SELECT 1 FROM public.staff_roles WHERE user_id = v_user_id AND scope_type = 'band' AND is_active = true)
       OR current_setting('request.jwt.claims', true)::jsonb->>'role' IN ('admin', 'service_role')
       OR EXISTS (SELECT 1 FROM public.users WHERE id = v_user_id AND role = 'admin') THEN
        v_is_band := true;
    END IF;

    RETURN QUERY
    SELECT 
        bl.id AS log_id,
        bl.instrument_id,
        i.name AS instrument_name,
        i.type AS instrument_kind,
        s.name_th AS section_name,
        u.id AS student_id,
        TRIM(COALESCE(u.prefix, '') || ' ' || COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS student_name,
        u.nickname AS student_nickname,
        bl.borrow_timestamp AS borrowed_at,
        bl.expected_return_at,
        (bl.expected_return_at IS NOT NULL AND bl.expected_return_at < NOW()) AS is_overdue
    FROM public.borrow_logs bl
    JOIN public.instruments i ON i.id = bl.instrument_id
    LEFT JOIN public.sections s ON s.id = i.section_id
    JOIN public.users u ON u.id = bl.user_id
    WHERE bl.return_timestamp IS NULL
      AND (p_event_id IS NULL OR bl.event_id = p_event_id)
      AND (
          v_is_band = true
          OR EXISTS (
              SELECT 1 FROM public.staff_roles sr
              WHERE sr.user_id = v_user_id AND sr.is_active = true
                AND (
                    -- Section match
                    (sr.scope_type = 'section' AND (
                        s.code = sr.scope_value 
                        OR s.name_th = sr.scope_value
                        OR (sr.scope_value = 'brass' AND (s.code = 'brass' OR s.name_th ILIKE '%ทองเหลือง%'))
                        OR (sr.scope_value = 'woodwind' AND (s.code = 'woodwind' OR s.name_th ILIKE '%ไม้%'))
                        OR (sr.scope_value = 'percussion' AND (s.code = 'percussion' OR s.name_th ILIKE '%กระทบ%'))
                        OR (sr.scope_value = 'guard' AND (s.code = 'guard' OR s.name_th ILIKE '%การ์ด%'))
                    ))
                    -- Event match
                    OR (sr.scope_type = 'event' AND sr.scope_value ~ '^\d+$' AND bl.event_id = sr.scope_value::bigint)
                    -- Instrument match (name/type & Thai spelling normalization)
                    OR (sr.scope_type = 'instrument' AND (
                        i.type = sr.scope_value 
                        OR i.name = sr.scope_value
                        OR i.name ILIKE '%' || sr.scope_value || '%'
                        OR i.type ILIKE '%' || sr.scope_value || '%'
                        OR sr.scope_value ILIKE '%' || i.type || '%'
                        OR replace(i.type, 'แซก', 'แซ็ก') = replace(sr.scope_value, 'แซก', 'แซ็ก')
                        OR replace(i.name, 'แซก', 'แซ็ก') ILIKE '%' || replace(sr.scope_value, 'แซก', 'แซ็ก') || '%'
                        OR (sr.scope_value ~ '^\d+$' AND bl.instrument_id = sr.scope_value::bigint)
                    ))
                )
          )
      )
    ORDER BY bl.borrow_timestamp DESC;
END;
$$;


-- 5. staff_get_uniform_outstanding
DROP FUNCTION IF EXISTS public.staff_get_uniform_outstanding(bigint) CASCADE;
DROP FUNCTION IF EXISTS public.staff_get_uniform_outstanding() CASCADE;

CREATE OR REPLACE FUNCTION public.staff_get_uniform_outstanding(p_event_id bigint DEFAULT NULL)
RETURNS TABLE (
    id bigint,
    kit_no text,
    part_type text,
    part_code text,
    size text,
    student_name text,
    student_nickname text,
    event_name text,
    icon text,
    issued_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_has_access boolean := false;
BEGIN
    IF EXISTS (SELECT 1 FROM public.staff_roles WHERE user_id = v_user_id AND scope_type IN ('band', 'uniform') AND is_active = true)
       OR current_setting('request.jwt.claims', true)::jsonb->>'role' IN ('admin', 'service_role')
       OR EXISTS (SELECT 1 FROM public.users WHERE id = v_user_id AND role = 'admin') THEN
        v_has_access := true;
    END IF;

    IF NOT v_has_access THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT 
        uk.id,
        uk.kit_no,
        up.part_type,
        up.part_code,
        up.size,
        TRIM(COALESCE(u.prefix, '') || ' ' || COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS student_name,
        u.nickname AS student_nickname,
        e.name AS event_name,
        '👔'::text AS icon,
        uk.issued_at
    FROM public.uniform_kits uk
    JOIN public.uniform_parts up ON up.id = uk.part_id
    JOIN public.users u ON u.id = uk.user_id
    LEFT JOIN public.events e ON e.id = uk.event_id
    WHERE uk.returned_at IS NULL
      AND (p_event_id IS NULL OR uk.event_id = p_event_id)
    ORDER BY uk.issued_at DESC;
END;
$$;


-- Grants
GRANT EXECUTE ON FUNCTION public.admin_grant_staff(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_staff_list() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_staff_scopes() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_get_outstanding(bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_get_uniform_outstanding(bigint) TO authenticated, service_role;
