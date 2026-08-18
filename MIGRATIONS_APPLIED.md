# Migrations ที่รันลงฐานจริงแล้ว (2026-08-10)

Project: `qsbvitqxwgtmopjjuxin` — ระบบยืมคืนเครื่องดนตรี v5.2

รันผ่าน Supabase MCP `apply_migration` จึงถูกบันทึกใน `supabase_migrations.schema_migrations`
ดึงตัวเต็มของแต่ละตัวได้ด้วย:

```sql
SELECT statements FROM supabase_migrations.schema_migrations WHERE name = '<ชื่อ>';
```

| ลำดับ | version | ชื่อ | ทำอะไร |
|---|---|---|---|
| 1 | 20260810103809 | `borrow_core_fix_01_schema_and_rules` | เพิ่ม `borrow_logs.expected_return_at` + `calc_expected_return_at()` + DROP overload ตาย 5 ตัว |
| 2 | 20260810103839 | `borrow_core_fix_02_borrow_rpc` | เขียน `borrow_instrument_atomic` ใหม่ให้บันทึก `borrow_type` และ `current_borrower_id` |
| 3 | 20260810103909 | `borrow_core_fix_03_read_rpcs` | `admin_get_live_borrowing_status` / `get_instrument_scan_details` / `get_my_borrowed_items` ส่ง `borrow_type`, `expected_return_at`, `is_overdue` |
| 4 | 20260810103936 | `borrow_core_fix_04_reminders_backfill_cron` | `dispatch_due_date_reminders` ใหม่ + backfill 4,036 แถว + ปลดล็อกเครื่องผี + pg_cron ทุก 10 นาที |
| 5 | 20260810104040 | `phase2_sections` | ตาราง `sections` (4 แถว) + `instruments.section_id` + RPC หน้าจับคู่ |
| 6 | 20260810104120 | `phase3_events` | ตาราง `events` + `borrow_logs.event_id` + RPC เปิด/ปิด/สรุปงาน |
| 7 | 20260810104205 | `phase3_borrow_writes_event_id` | ให้การยืมผูก `event_id` และกำหนดคืนยึดตาม `events.return_due_at` |
| 8 | 20260810104300 | `phase4_staff_roles_and_reports` | `staff_roles` + `staff_reports` + `is_staff()` + RLS (อ่านอย่างเดียว เขียนได้แค่ใบตรวจ) |
| 9 | 20260810104347 | `phase6_uniform_system` | 7 ตารางชุด + seed 60 ถุง / 300 ชิ้น / 5 ประเภท + RLS |
| 10 | 20260810104443 | `phase6_uniform_rpcs` | เบิก/คืนรายชิ้น/ของค้าง/ขอสลับ/อนุมัติสลับ |
| 11 | 20260810105836 | `fix_unassigned_record_vars` | 🐛 แก้ `record is not assigned yet` ใน `borrow_instrument_atomic` และ `get_kit_scan_details` |

## บั๊กที่เจอระหว่างทางและแก้แล้ว

| # | อาการ | เจอตอน |
|---|---|---|
| 1 | `date_trunc` ทำงานใน UTC → ยืมกลับบ้านหมดอายุ 06:59 แทน 23:59 | ทดสอบ logic ก่อนรัน |
| 2 | `CREATE OR REPLACE` เปลี่ยน signature ไม่ได้ จะเกิด overload ตัวที่ 4 | ตรวจไฟล์ก่อนรัน |
| 3 | plpgsql `RECORD` ที่ไม่เคย assign → `json_build_object` พังทั้งฟังก์ชัน **ทำให้ยืมไม่ได้เลย** | ทดสอบ RPC หลังรัน |

## ผลทดสอบ end-to-end (ผ่านทั้งหมด แล้วลบข้อมูลทดสอบทิ้ง)

| เคส | ผล |
|---|---|
| นักเรียนทั่วไป ยืมในโรงเรียน | `in_school` / 1.00 ชม. ✅ |
| สมาชิกชุมนุม ยืมในโรงเรียน | `in_school` / 6.00 ชม. ✅ |
| ยืมออกงานโดยไม่เลือกงาน | ถูกบล็อก ✅ |
| นักเรียนทั่วไปขอยืมออกงาน | ถูกบล็อก ✅ |
| ยืมออกงานพร้อมงาน (คืน +30 ชม.) | `performance` / event ผูกถูก / 30.0 ชม. ✅ |
| สรุปงาน (เบิก/คืน/ค้าง) | ทำงาน ✅ |
| สแกน QR ถุงชุด `KIT-012` | คืน 5 ชิ้นครบ ✅ |

## ยังต้องทำต่อ (หน้าจอ)

Backend + `api.js` พร้อมใช้ครบแล้ว แต่ยังไม่มีหน้าจอสำหรับ:

- หน้าแอดมิน: เปิด/ปิดงาน, จับคู่ประเภทเครื่อง→กลุ่ม, มอบหมายหัวหน้า, กล่องใบตรวจ
- หน้าหัวหน้า/ฝ่ายเสื้อผ้า: รายการค้าง + ฟอร์มใบตรวจ
- หน้านักเรียน: เบิก/คืนชุดแบบ checklist 5 ชิ้น, ขอเปลี่ยน/สลับ
- กรอกไซส์ชุด 300 ชิ้น (ตอนนี้ `size` ยังว่าง)

## หมายเหตุ

- `instruments` 68/133 ชิ้นยังไม่ได้จัดกลุ่ม (เครื่องสาย 42, อุปกรณ์ 22, เครื่องเสียง 3, เครื่องลิ่มนิ้ว 1)
  เพราะไม่ใช่กลุ่มของวงโยธวาทิตโดยตรง — ครูจับคู่เองผ่านหน้าแอดมิน
- คัลเลอร์การ์ดยังไม่มีเครื่องผูก เพราะใช้ธง/อุปกรณ์ซึ่งอยู่ในประเภท "อุปกรณ์"
- RLS errors ที่ Supabase advisor รายงาน (`exp_logs`, `xp_event_rules`, `display_state`, `settings`)
  เป็นตารางเก่าที่มีอยู่ก่อน ไม่ได้เกิดจาก migration ชุดนี้
  → **แก้แล้ว 3 จาก 4 ตัวเมื่อ 2026-08-13** ดูหัวข้อถัดไป (เหลือ `display_state` ซึ่งเป็นตารางของ QSing)

---

# Security lockdown (2026-08-13)

มาจาก security review ทั้งระบบ รันผ่าน Supabase MCP `apply_migration` เช่นกัน
ไฟล์ฉบับเต็มพร้อมคำอธิบาย: `MIGRATION_SECURITY_01_LOCKDOWN_ANON.sql`

| ลำดับ | version | ชื่อ | ทำอะไร |
|---|---|---|---|
| 1 | 20260813020506 | `security_revoke_anon_rpc_execute` | ตัดสิทธิ์ `anon` เรียก RPC ทั้ง schema (265 → 1) โดย snapshot แล้ว grant คืนให้ `authenticated`/`service_role` เท่าเดิม |
| 2 | 20260813020554 | `security_enable_rls_exp_logs_settings_xp_rules` | เปิด RLS + policy ให้ `exp_logs`, `xp_event_rules`, `settings` |
| 3 | 20260813020653 | `security_default_privileges_no_anon_execute` | `ALTER DEFAULT PRIVILEGES` กันฟังก์ชันใหม่ถูก grant ให้ `anon` อัตโนมัติ |
| 4 | 20260813022415 | `security_revoke_anon_admin_users_view` | ตัด `anon` ออกจาก SECURITY DEFINER view `admin_users_with_activity` |

**ปัญหาที่แก้:** 264 จาก 265 functions ใน `public` เป็น `SECURITY DEFINER` ที่ไม่มีการตรวจสิทธิ์
และ `anon` เรียกได้หมด → ใครถือ anon key จาก `config.js` (public โดยออกแบบ) ก็เรียก
`trigger_yearly_reset`, `deactivate_user_account`, `admin_get_live_borrowing_status`
ได้โดยไม่ต้องล็อกอิน · อีก 4 ตารางมี RLS ปิดพร้อม grant CRUD เต็มให้ `anon`

**ผลหลังแก้ (ยืนยันด้วย PostgREST จริง):** RPC เดิมตอบ `401 permission denied`,
`check_student_id_taken` (ฟอร์มสมัคร) ยัง `200`, Supabase advisor
`anon_security_definer_function_executable` ลดจาก 218 → 1

**ต่อจากนี้:** ฝั่ง `authenticated` แก้แล้วในชุดที่ 2 ด้านล่าง

## ชุดที่ 2 — admin guards (`MIGRATION_SECURITY_02_ADMIN_GUARDS.sql`)

| ลำดับ | version | ชื่อ | ทำอะไร |
|---|---|---|---|
| 5 | 20260813023459 | `security_guard_register_push_subscription` | ใส่ `auth.uid()` guard กัน push hijack (หยิบเฉพาะ guard จาก `FIX_PUSH_SUBSCRIPTION_UPSERT.sql` ส่วนที่เหลือของไฟล์นั้นไม่ตรง production แล้ว) |
| 6 | 20260813023811 | `security_revoke_authenticated_internal_functions` | ตัด `authenticated` ออกจาก 61 ฟังก์ชันภายใน (cron / trigger helper / edge-function callee / โค้ดตาย) |
| 7 | 20260813024314 | `security_guard_admin_rpcs_stage2` | ครอบ guard ให้ RPC แอดมิน 37 overloads ด้วยวิธี rename เป็น `__inner` + wrapper ชื่อเดิม |
| 8 | 20260813024801 | `security_fix_wrapper_guard_and_anon_grants` | 🐛 แก้บั๊ก 2 ตัวจาก migration ที่ 7 (ดูด้านล่าง) |

**🐛 บั๊กที่เกิดระหว่างทางและแก้แล้ว — อย่าทำซ้ำ:**

| # | อาการ | สาเหตุ |
|---|---|---|
| 1 | wrapper 37 ตัวที่เพิ่งสร้าง กลับมาให้ `anon` เรียกได้ | `CREATE FUNCTION` ได้ default privileges ของ Supabase คืนมา · `ALTER DEFAULT PRIVILEGES` ผูกกับ role ที่รัน CREATE ต้องระบุ `FOR ROLE` ให้ตรง · **ต้อง REVOKE ซ้ำหลังสร้างฟังก์ชันใหม่เสมอ** |
| 2 | guard รุ่นแรกไม่กัน `anon` เลย | เขียนว่า `auth.uid() IS NULL → ผ่าน` เพื่อให้ cron ผ่าน แต่ anon JWT ก็มี `sub` เป็น NULL → เปลี่ยนไปเช็ค `request.jwt.claims->>'role'` แทน |

**ตัวเลขรวม:**

| | ก่อน | หลังชุดที่ 1 | หลังชุดที่ 2 |
|---|---|---|---|
| `anon` เรียกได้ | 265 | 1 | **1** |
| `authenticated` เรียกได้ | 265 | 265 | **198** |
| SECURITY DEFINER ที่ไม่มี guard | 131 | 131 | **30** |

**ต่อจากนี้:** IDOR ฝั่งนักเรียนแก้แล้วในชุดที่ 3 ด้านล่าง

## ชุดที่ 3 — XSS / IDOR / view (`MIGRATION_SECURITY_03_XSS_IDOR_AND_VIEW.sql`)

| ลำดับ | version | ชื่อ | ทำอะไร |
|---|---|---|---|
| 9 | 20260813063711 | `security_url_scheme_constraints` | CHECK บังคับ `^https?://` ที่ `knowledge_links.youtube_url` และ `boss_requests.video_url` (กัน `javascript:`) |
| 10 | 20260813063856 | `security_pin_user_id_to_auth_uid` | pin uuid ผู้กระทำใน 11 RPC ฝั่งนักเรียน (ยอมให้แอดมิน/service_role ผ่าน) |
| 11 | 20260813064320 | `security_fix_restore_get_user_role_grant` | 🐛 คืนสิทธิ์ `get_user_role()` — ชุดที่ 2 revoke ไปแล้วทำให้ 4 ตารางอ่านไม่ได้ |
| 12 | 20260813064431 | `security_view_invoker_and_achievements_policy` | `admin_users_with_activity` → `security_invoker`, ลบ policy `user_achievements` ที่เป็น `WITH CHECK (true)` |
| 13 | 20260813072846 | `security_enable_rls_display_state` | เปิด RLS `display_state` (ตารางของ QSing) — อ่านได้ทุกคนเพราะจอ subscribe realtime แบบ anonymous แต่ client เขียนไม่ได้เลย |

**🐛 บั๊กที่เกิดระหว่างทางและแก้แล้ว — สำคัญ:**

`get_user_role()` ถูก revoke จาก `authenticated` ในชุดที่ 2 เพราะตรวจแล้วว่า "ไม่มีไฟล์ client เรียก"
ซึ่ง**ไม่พอ** — ฟังก์ชันนี้ถูกอ้างใน **RLS policy** ของ `badges`, `borrow_logs`, `instruments`,
`knowledge_links` และ policy expression ประเมินด้วยสิทธิ์ของ role ที่ query
ผลคือนักเรียนที่ล็อกอิน `SELECT` 4 ตารางนี้ไม่ได้เลย (`permission denied for function get_user_role`)

> **ก่อน REVOKE ฟังก์ชันใด ๆ ต้องเช็ค `pg_policies` ด้วย ไม่ใช่แค่ source ของแอป**
> query ที่ใช้ตรวจอยู่ในหัวข้อ PART 3 ของ `MIGRATION_SECURITY_03_XSS_IDOR_AND_VIEW.sql`

## การแก้ฝั่งแอป (deploy แล้ว)

- `utils.js` — เพิ่ม `escapeJsInAttr()` (escape JS ก่อน HTML) และ `safeUrl()` (เฉพาะ http/https)
- `admin-dashboard.js` / `ui.js` — ตาราง users, events, part types และ autocomplete "ยืมแทนนักเรียน"
  เลิกฝังชื่อใน `onclick` เปลี่ยนเป็น `data-*` + event delegation · อีก 6 จุดใช้ `escapeJsInAttr()`
- Swal `title` 10 จุดใส่ `escapeHtml` (v11 `title` เป็น innerHTML sink ไม่ใช่ text sink)
- `<a href>` ที่รับข้อมูลผู้ใช้ใส่ `safeUrl()`
- `student-dashboard.js` — `window` message listener เช็ค `event.origin` (SW ใช้ listener แยกใน `main.js:388`)
- `sw.js` — บังคับ same-origin ก่อน `clients.openWindow()`
- `supabase/functions/send-push/index.ts` (v13) — ตรวจ Authorization, CORS เฉพาะโดเมนแอป,
  จำกัด `url`/`icon` ใน payload, ตอบรูปแบบเดียวกันเมื่อไม่มี subscription

**ตัวเลขรวม:**

| | ก่อน | ชุด 1 | ชุด 2 | ชุด 3 |
|---|---|---|---|---|
| `anon` เรียกฟังก์ชันได้ | 265 | 1 | 1 | **1** |
| `authenticated` เรียกฟังก์ชันได้ | 265 | 265 | 198 | **199** |
| SECURITY DEFINER ไม่มี guard | 131 | 131 | 30 | **19** |
| ตารางที่ RLS ปิด | 4 | 1 | 1 | **0** |
| view ที่ `anon` อ่านได้ | 1 | 0 | 0 | **0** |
| SECURITY DEFINER view | 1 | 1 | 1 | **0** |

**ยังเหลือ:** รายละเอียดเก็บไว้นอก repo ที่ `SECURITY_REMAINING.local.md`
(repo นี้เป็น **public** — `.gitignore` มี `*.local.md` แล้ว ตรวจ `git status` ก่อน commit ทุกครั้ง)

## นอกฐานข้อมูล

- `.vercelignore` — เดิม `vercel.json` ตั้ง `outputDirectory: "."` ทำให้ทั้งรีโปถูกเสิร์ฟ
  `/supabase_rls.sql` และ `/supabase/functions/send-push/index.ts` เคยตอบ 200 พร้อม source เต็ม
  ตอนนี้ 404 แล้ว (deploy `dpl_7MCVp3t5DDaaDtiMvzkAaQZNn3ub`)
  ⚠️ `.vercelignore` ตัดไฟล์ตั้งแต่ตอน **upload** ห้ามใส่อะไรที่ buildCommand ต้องใช้

---

# Bug Fix: Staff Roles Bigint Syntax & Scope Matching (2026-08-17)

ไฟล์: `MIGRATION_FIX_STAFF_ROLES_BIGINT.sql`

**ปัญหาที่แก้:**
1. การแต่งตั้ง "หัวหน้าเครื่อง" (เช่น ทรัมเป็ต) ส่งค่า `scope_value` เป็นข้อความ `"ทรัมเป็ต"` เกิด error `invalid input syntax for type bigint: "ทรัมเป็ต"`
2. หัวหน้าเครื่อง/หัวหน้ากลุ่มเครื่องบางคนกดดูหน้า "งานที่ได้รับมอบหมาย" แล้วไม่เห็นรายการยืมค้างของเครื่องในความดูแล เนื่องจากชื่อเครื่องดนตรี (`i.name` / `i.type`) ในคลัง ไม่ตรงเป๊ะแบบ Case/Spelling Sensitive กับชื่อที่เลือกตอนแต่งตั้ง (เช่น การสะกดตัวสะกดภาษาไทย `แซก` vs `แซ็ก` หรือชื่อเครื่องที่มีเลขต่อท้าย `#01`)

**การปรับปรุง RPC 5 ตัว:**
1. `admin_grant_staff`: ใช้ regex `~ '^\d+$'` ตรวจสอบก่อน cast เป็น `bigint` เพื่อรองรับทั้งชื่อประเภทเครื่อง (เช่น `"ทรัมเป็ต"`) และ ID ของเครื่อง
2. `admin_staff_list`: แสดง `scope_label` ปลอดภัยไม่พังเมื่อเจอข้อความ
3. `get_my_staff_scopes`: คืนค่าขอบเขตหน้าที่โดยไม่เกิด bigint casting error
4. `staff_get_outstanding`: ดึงรายการยืมค้างให้หัวหน้าเครื่องและกลุ่มเครื่อง โดยเพิ่มระบบแมตช์ที่ยืดหยุ่น:
   - รองรับทั้ง `i.type`, `i.name`, และการค้นหาแบบ Partial Match (`ILIKE`)
   - ปรับเรื่องการสะกดคำภาษาไทย (Normalize `แซก` <-> `แซ็ก`) ให้ค้นพบเครื่องในกลุ่มเดียวกันโดยอัตโนมัติ
   - รองรับการแมตช์กลุ่มเครื่อง (Section) ทั้งจาก รหัสกลุ่ม (`s.code`) และชื่อภาษาไทย (`s.name_th`)
5. `staff_get_uniform_outstanding`: ดึงรายการชุดที่ยังไม่คืน สำหรับฝ่ายเสื้อผ้า (Uniform Staff) และหัวหน้าวง

