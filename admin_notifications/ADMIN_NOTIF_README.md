# 🔔 Admin Notifications System — Installation Guide

ระบบแจ้งเตือนผู้ดูแลแบบครบวงจร — covers 22 ข้อตามที่ออกแบบไว้
Design: **C (Hybrid)** — extend ตาราง `notifications` เดิม + filter ด้วย `is_admin_alert` + `target_role`

---

## 📦 ไฟล์ในชุดติดตั้งนี้

| ไฟล์ | ทำอะไร | รันที่ |
|---|---|---|
| `ADMIN_NOTIF_01_schema.sql` | เพิ่ม 8 columns + 3 RPCs + 3 indices | Supabase SQL Editor |
| `ADMIN_NOTIF_02_triggers.sql` | 7 synchronous triggers (เหตุการณ์ real-time) | Supabase SQL Editor |
| `ADMIN_NOTIF_03_cron.sql` | 9 pg_cron scheduled jobs | Supabase SQL Editor |
| `ADMIN_NOTIF_04_api_patch.js` | เพิ่ม `adminNotifications` ใน `api.js` | VS Code |
| `ADMIN_NOTIF_05_ui_patch.md` | คำแนะนำแก้ `admin-dashboard.js` + `styles.css` | VS Code |
| `ADMIN_NOTIF_README.md` | ไฟล์นี้ | — |

---

## 🗺️ ลำดับการติดตั้ง (รวม ~30 นาที)

| Step | ทำอะไร | ที่ไหน | เวลา |
|---|---|---|---|
| 1 | สร้าง Supabase Branch | Supabase Dashboard | 2 นาที |
| 2 | Enable extension `pg_cron` | Dashboard → Database → Extensions | 1 นาที |
| 3 | รัน `ADMIN_NOTIF_01_schema.sql` ทั้งไฟล์ | SQL Editor (branch) | 1 นาที |
| 4 | รัน `ADMIN_NOTIF_02_triggers.sql` ทั้งไฟล์ | SQL Editor (branch) | 1 นาที |
| 5 | รัน `ADMIN_NOTIF_03_cron.sql` ทั้งไฟล์ | SQL Editor (branch) | 1 นาที |
| 6 | Append `ADMIN_NOTIF_04_api_patch.js` ลง `api.js` | VS Code | 2 นาที |
| 7 | Apply patches 1-4 ใน `ADMIN_NOTIF_05_ui_patch.md` | VS Code | 10 นาที |
| 8 | Bump `CACHE_NAME` ใน `sw.js` | VS Code | 30 วินาที |
| 9 | `vercel --prod --yes` | PowerShell | 1 นาที |
| 10 | ทดสอบ (ดูด้านล่าง) | Browser | 5 นาที |
| 11 | Merge branch → production (ถ้าผ่าน) | Supabase Dashboard | 1 นาที |

---

## ✅ Coverage Matrix — 22 ข้อ ครอบคลุมขนาดไหน

### 🔴 Priority 1 — Security & Critical
| # | Notification | Status | ที่ไหน |
|---|---|---|---|
| 1 | Failed login attempts | ✅ Cron 15 min | `cron_check_failed_logins` |
| 2 | New admin role granted | ✅ Trigger | `tg_notify_admin_role_change` |
| 3 | Mass data deletion | ✅ Trigger (statement-level) | `tg_notify_mass_delete_*` |
| 4 | RLS policy bypass attempt | ⚠️ Partial | ต้อง enable pg_audit + custom log (Phase 2) |
| 5 | VAPID/Push delivery failure spike | ⚠️ Pending | ต้อง modify `send-push` Edge Function (Phase 2) |

### 🟠 Priority 2 — User Activity
| # | Notification | Status | ที่ไหน |
|---|---|---|---|
| 6 | New user registrations daily | ✅ Cron 18:00 BKK | `cron_daily_user_summary` |
| 7 | User blocked / soft-blocked | ✅ Trigger | `tg_notify_user_block_change` |
| 8 | Inactive users spike | ✅ Cron weekly | `cron_check_inactive_users` |
| 9 | Suspicious XP gain | ✅ Trigger | `tg_notify_xp_spike` |
| 10 | Soft-block expiring | ✅ Cron daily | `cron_check_block_expiring` |

### 🟡 Priority 3 — Borrow / Repair Operations
| # | Notification | Status | ที่ไหน |
|---|---|---|---|
| 11 | Pending borrow approvals > 1 hr | ✅ Cron 30 min | `cron_check_pending_borrows` |
| 12 | Overdue items > 3 days | ✅ Cron daily | `cron_check_overdue_items` |
| 13 | New repair request | ✅ Trigger | `tg_notify_new_repair` |
| 14 | Instrument condition critical | ✅ Trigger | `tg_notify_instrument_critical` |
| 15 | Low inventory alert | ✅ Cron daily | `cron_check_low_inventory` |

### 🟢 Priority 4 — Learning / Content Moderation
| # | Notification | Status | ที่ไหน |
|---|---|---|---|
| 16 | Knowledge link pending review > 24 hr | ✅ Cron daily + Trigger | `cron_check_pending_knowledge` + `tg_notify_new_knowledge_link` |
| 17 | Boss raid submission backlog > 48 hr | ✅ Cron daily | `cron_check_pending_raids` |
| 18 | Scheduled notification fired | ⚠️ Pending | ต้องแก้ RPC `dispatch_due_notifications` (Phase 2) |

### 🔵 Priority 5 — System Health
| # | Notification | Status | ที่ไหน |
|---|---|---|---|
| 19 | Edge function error rate | ❌ Need infra | ต้องสร้างตาราง `edge_errors` + แก้ Edge Functions ทุกตัว |
| 20 | Database connection pool exhausted | ❌ External | ตั้งค่าใน Supabase Dashboard → Settings → Alerts |
| 21 | Service Worker version mismatch | ❌ Client-side | ต้องเพิ่ม tracking ใน main.js |
| 22 | Storage usage > 80% | ❌ External | ตั้งค่าใน Supabase Dashboard → Settings → Alerts |

**สรุป: 15/22 implement ครบใน DB ทันที, 3 ต้อง Phase 2, 4 ต้องตั้งใน Supabase Dashboard/Client**

---

## 🧪 ทดสอบหลังติดตั้ง (Quick Sanity Check)

```sql
-- 1. ตรวจว่า columns ถูกเพิ่ม
SELECT column_name FROM information_schema.columns
WHERE table_name = 'notifications'
  AND column_name IN ('category','severity','is_admin_alert','dedupe_key');
-- ควรเห็น 4 แถว

-- 2. ตรวจว่า triggers ถูกสร้าง
SELECT trigger_name FROM information_schema.triggers
WHERE trigger_name LIKE 'tg_notify_%';
-- ควรเห็น 7+ triggers

-- 3. ตรวจ cron jobs
SELECT jobname, schedule FROM cron.job
WHERE jobname LIKE 'check_%' OR jobname LIKE 'daily_%';
-- ควรเห็น 9 jobs

-- 4. ทดสอบ trigger จริง — block user คนหนึ่ง
UPDATE public.users SET is_blocked = true, block_reason = 'test'
WHERE id = '<UUID-นักเรียนทดสอบ>';
-- จากนั้นเช็ค:
SELECT * FROM public.notifications
WHERE is_admin_alert = true
ORDER BY created_at DESC LIMIT 5;
-- ควรเห็น notification "นักเรียนถูกบล็อก"

-- ลบ test
UPDATE public.users SET is_blocked = false, block_reason = NULL
WHERE id = '<UUID>';
```

---

## ⚠️ ข้อควรรู้

### 1. RLS Policy บน notifications
หลังรัน `FIX_RLS_POLICIES.sql` Step 8 — policy `notifications_select_own` จะอนุญาตให้ admin อ่าน notification ของตัวเองได้  
**สำคัญ:** RLS ต้อง enabled และ policy ต้องมี ไม่งั้น admin จะอ่าน inbox ตัวเองไม่ได้

### 2. pg_cron Timezone
ทุก schedule ใน cron job เป็น **UTC** — เวลาที่ comment ใน SQL file คือ BKK (UTC+7)  
ถ้าต้องการเปลี่ยนเวลา → แก้ cron expression แล้วรัน `cron.unschedule()` → `cron.schedule()` ใหม่

### 3. Dedup Keys
ทุก notification มี `dedupe_key` กัน spam — ถ้าทดสอบบ่อยๆ แล้ว notification ไม่ขึ้น ให้รอ window หรือลบทิ้ง:
```sql
DELETE FROM public.notifications WHERE dedupe_key LIKE 'block_%';
```

### 4. Realtime
UI ใช้ Supabase Realtime channel — ต้อง enable Realtime ในตาราง `notifications`:
Dashboard → Database → Replication → public.notifications → Toggle ON

### 5. Push Notification
ระบบนี้ INSERT ลง `notifications` table — ถ้าโปรเจกต์มี trigger `notifications_send_push` อยู่แล้ว push จะเด้งอัตโนมัติ (ถ้า admin มี subscription)

---

## 🔧 Rollback (ถ้าต้องการ undo)

```sql
-- ลบ cron jobs
SELECT cron.unschedule(jobname) FROM cron.job
WHERE jobname IN ('check_failed_logins','daily_user_summary','check_inactive_users',
                  'check_block_expiring','check_pending_borrows','check_overdue_items',
                  'check_low_inventory','check_pending_knowledge','check_pending_raids');

-- ลบ triggers
DROP TRIGGER IF EXISTS tg_notify_admin_role_change ON public.users;
DROP TRIGGER IF EXISTS tg_notify_user_block_change ON public.users;
DROP TRIGGER IF EXISTS tg_notify_xp_spike ON public.users;
DROP TRIGGER IF EXISTS tg_notify_new_repair ON public.repair_logs;
DROP TRIGGER IF EXISTS tg_notify_instrument_critical ON public.instruments;
DROP TRIGGER IF EXISTS tg_notify_new_knowledge_link ON public.knowledge_links;
DROP TRIGGER IF EXISTS tg_notify_mass_delete_users ON public.users;
DROP TRIGGER IF EXISTS tg_notify_mass_delete_instruments ON public.instruments;
DROP TRIGGER IF EXISTS tg_notify_mass_delete_borrow_logs ON public.borrow_logs;

-- ลบ functions
DROP FUNCTION IF EXISTS public.notify_admins(text,text,text,text,jsonb,text,int);
DROP FUNCTION IF EXISTS public.admin_acknowledge_notification(bigint);
DROP FUNCTION IF EXISTS public.admin_unread_counts_by_category();
DROP FUNCTION IF EXISTS public.tg_notify_admin_role_change();
DROP FUNCTION IF EXISTS public.tg_notify_user_block_change();
DROP FUNCTION IF EXISTS public.tg_notify_xp_spike();
DROP FUNCTION IF EXISTS public.tg_notify_new_repair();
DROP FUNCTION IF EXISTS public.tg_notify_instrument_critical();
DROP FUNCTION IF EXISTS public.tg_notify_new_knowledge_link();
DROP FUNCTION IF EXISTS public.tg_notify_mass_delete();
DROP FUNCTION IF EXISTS public.cron_check_failed_logins();
DROP FUNCTION IF EXISTS public.cron_daily_user_summary();
DROP FUNCTION IF EXISTS public.cron_check_inactive_users();
DROP FUNCTION IF EXISTS public.cron_check_block_expiring();
DROP FUNCTION IF EXISTS public.cron_check_pending_borrows();
DROP FUNCTION IF EXISTS public.cron_check_overdue_items();
DROP FUNCTION IF EXISTS public.cron_check_low_inventory();
DROP FUNCTION IF EXISTS public.cron_check_pending_knowledge();
DROP FUNCTION IF EXISTS public.cron_check_pending_raids();

-- (Optional) ลบ columns — แต่ถ้าเก็บไว้ก็ไม่เสียหาย
-- ALTER TABLE public.notifications
--     DROP COLUMN IF EXISTS category,
--     DROP COLUMN IF EXISTS severity,
--     DROP COLUMN IF EXISTS target_role,
--     DROP COLUMN IF EXISTS is_admin_alert,
--     DROP COLUMN IF EXISTS metadata,
--     DROP COLUMN IF EXISTS dedupe_key,
--     DROP COLUMN IF EXISTS acknowledged_by,
--     DROP COLUMN IF EXISTS acknowledged_at;
```

---

## 🚀 Next Steps After Phase 1

**Phase 2 (ถ้าต้องการครบ 22 ข้อ):**
- #4 RLS bypass — สร้างตาราง `security_audit_log` + log RLS denial ผ่าน trigger
- #5 Push failure — แก้ Edge function `send-push` ให้ log failures ลง table
- #18 Scheduled fired — เพิ่ม `PERFORM notify_admins(...)` ใน RPC `dispatch_due_notifications`
- #19 Edge errors — สร้างตาราง `edge_errors` + wrap Edge functions ด้วย try-catch
- #21 SW version — เพิ่ม heartbeat ที่ส่ง SW version มาเก็บใน DB

**Phase 3 (Operational):**
- ตั้ง Supabase Dashboard alerts สำหรับ #20, #22
- เพิ่ม email summary รายสัปดาห์ (ใช้ Edge function + Resend/SMTP)
- ออกแบบ "Alert Center" page แยก (ถ้า dropdown ไม่พอ)

---

## 💬 Support

ถ้าเจอ error ตอนรัน SQL — ส่ง error message มาให้ดูครับ
ถ้า UI bell ไม่ขึ้น — เช็ค console + ดูว่า `adminNotifications` import สำเร็จไหม
