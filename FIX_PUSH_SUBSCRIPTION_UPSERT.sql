-- ═══════════════════════════════════════════════════════════════════════════
-- 🛠️ FIX: register_push_subscription RPC — เปลี่ยน INSERT → UPSERT
-- ═══════════════════════════════════════════════════════════════════════════
-- 📍 รันที่: Supabase SQL Editor
-- 🐛 Bug: error 23505 duplicate key on endpoint column ตอน login ซ้ำ
-- 🎯 ผลลัพธ์: ถ้า endpoint มีอยู่แล้ว → อัพเดท user_id + keys (ไม่ throw error)
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ STEP A: ดู schema ปัจจุบัน — ตรวจว่า unique constraint อยู่ที่ไหน            ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

SELECT
    conname AS constraint_name,
    pg_get_constraintdef(c.oid) AS definition,
    CASE
        WHEN pg_get_constraintdef(c.oid) LIKE '%(endpoint)%'
             AND pg_get_constraintdef(c.oid) NOT LIKE '%(user_id, endpoint)%'
        THEN '🟠 unique บน endpoint เดี่ยว — อาจกระทบเมื่อเปลี่ยน account'
        WHEN pg_get_constraintdef(c.oid) LIKE '%(user_id, endpoint)%'
        THEN '✅ unique บน (user_id, endpoint) — compound key ที่ดี'
        ELSE '—'
    END AS note
FROM pg_constraint c
JOIN pg_class t ON c.conrelid = t.oid
WHERE t.relname = 'push_subscriptions'
  AND c.contype IN ('p', 'u');

-- 👉 ดูผลก่อนตัดสินใจ:
--    - ถ้ามี constraint บน endpoint อย่างเดียว → ทางแก้ที่ 1 หรือ 2
--    - ถ้ามี compound (user_id, endpoint) อยู่แล้ว → ทางแก้ที่ 2 พอ


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ STEP B: ดู source code ของ RPC ปัจจุบัน                                   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

SELECT pg_get_functiondef(p.oid) AS current_source
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'register_push_subscription'
  AND n.nspname = 'public';


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ STEP C: 🛠️ FIX — เขียน RPC ใหม่ให้เป็น UPSERT                            ║
-- ║ ตรงกับ signature ที่ client เรียก:                                          ║
-- ║   register_push_subscription(p_user_id, p_endpoint, p_p256dh, p_auth)     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public.register_push_subscription(
    p_user_id uuid,
    p_endpoint text,
    p_p256dh text,
    p_auth text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- กัน user spoof — ต้องเรียกจาก authenticated context และ user_id ต้องตรงตัวเอง
    -- (ถ้า service_role เรียก จะ bypass auth.uid() — ผ่าน)
    IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
        RAISE EXCEPTION 'unauthorized: cannot register push for another user';
    END IF;

    -- UPSERT: ถ้า endpoint เดิมมีอยู่ → อัพเดท user_id + keys
    -- (กรณี: ผู้ใช้คนใหม่ใช้ browser ที่เคยลงทะเบียนของคนเก่า)
    INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh_key, auth_key, updated_at)
    VALUES (p_user_id, p_endpoint, p_p256dh, p_auth, now())
    ON CONFLICT (endpoint)
    DO UPDATE SET
        user_id    = EXCLUDED.user_id,
        p256dh_key = EXCLUDED.p256dh_key,
        auth_key   = EXCLUDED.auth_key,
        updated_at = now();
END;
$$;

-- ⚠️ ถ้า table ไม่มี column updated_at — ให้รันบรรทัดนี้ก่อน:
-- ALTER TABLE public.push_subscriptions ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- จำกัดสิทธิ์
REVOKE ALL ON FUNCTION public.register_push_subscription(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_push_subscription(uuid, text, text, text)
    TO authenticated, service_role;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ STEP D: ทดสอบ — รัน UPSERT 2 ครั้งติด ต้องไม่ error                        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ครั้งที่ 1
SELECT public.register_push_subscription(
    auth.uid(),                            -- หรือใช้ UUID ของ user จริง
    'https://test.example/endpoint-001',
    'test-p256dh-key',
    'test-auth-key'
);

-- ครั้งที่ 2 (endpoint เดิม) — ต้องไม่ error ✅
SELECT public.register_push_subscription(
    auth.uid(),
    'https://test.example/endpoint-001',
    'test-p256dh-key-UPDATED',
    'test-auth-key-UPDATED'
);

-- ตรวจว่า row ถูกอัพเดท (มี 1 row, key ใหม่)
SELECT user_id, endpoint, p256dh_key, auth_key, updated_at
FROM public.push_subscriptions
WHERE endpoint = 'https://test.example/endpoint-001';

-- ลบ row ทดสอบทิ้ง
DELETE FROM public.push_subscriptions WHERE endpoint = 'https://test.example/endpoint-001';


-- ═══════════════════════════════════════════════════════════════════════════
-- 📋 ทางแก้สำรอง (ถ้าอยากเปลี่ยน schema แทน RPC)
-- ═══════════════════════════════════════════════════════════════════════════
/*
-- ทางเลือก: เปลี่ยน unique key เป็น compound (user_id, endpoint)
-- ⚠️ แต่ทำให้ "endpoint เดียวกัน 2 user" บันทึกได้ — push อาจส่งซ้ำ
-- ผมแนะนำใช้ UPSERT (Step C) มากกว่า

ALTER TABLE public.push_subscriptions
    DROP CONSTRAINT IF EXISTS push_subscriptions_endpoint_key;

ALTER TABLE public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_user_endpoint_unique
    UNIQUE (user_id, endpoint);
*/
