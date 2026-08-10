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
