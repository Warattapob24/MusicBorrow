# ตั้งค่าให้แอปเขียนกิจกรรมเข้าปฏิทิน Google เดิม

ทำครั้งเดียว ~10 นาที · หลังจากนี้ครูกรอกกิจกรรมในแอปที่เดียว ปฏิทินอัปเดตเอง

---

## ภาพรวมสิ่งที่จะทำ

```
สร้าง "ผู้ใช้หุ่นยนต์" (service account) ใน Google
        ↓
แชร์ปฏิทินให้หุ่นยนต์ตัวนี้ มีสิทธิ์แก้ไข
        ↓
เอากุญแจของหุ่นยนต์ไปใส่ใน Supabase
        ↓
แอปใช้หุ่นยนต์ตัวนี้เขียนปฏิทินแทนครู
```

**ทำไมต้องมีหุ่นยนต์** — ถ้าใช้บัญชีครูตรง ๆ ต้องล็อกอินใหม่เรื่อย ๆ และถ้าครูเปลี่ยนรหัสผ่านระบบจะพัง

---

## ขั้นที่ 1 — สร้าง Service Account

1. เปิด https://console.cloud.google.com/iam-admin/serviceaccounts
2. ถ้ายังไม่มี project → กด **Create Project** ตั้งชื่ออะไรก็ได้ เช่น `music-borrow` → Create
3. กด **+ CREATE SERVICE ACCOUNT**
   - Service account name: `calendar-writer`
   - กด **CREATE AND CONTINUE** → **CONTINUE** → **DONE**
     (ข้าม role ได้ ไม่ต้องให้สิทธิ์อะไรใน GCP)

## ขั้นที่ 2 — เอากุญแจ (ไฟล์ JSON)

1. คลิกที่ service account ที่เพิ่งสร้าง
2. แท็บ **KEYS** → **ADD KEY** → **Create new key**
3. เลือก **JSON** → **CREATE** → ไฟล์จะดาวน์โหลดมา

> 🔐 **ไฟล์นี้คือกุญแจ** ใครได้ไปแก้ปฏิทินได้หมด
> ห้ามส่งให้ใคร ห้ามอัปขึ้น git ห้ามแนบในแชท — ใช้แค่ขั้นที่ 5 แล้วลบทิ้งได้

## ขั้นที่ 3 — เปิด Calendar API

1. เปิด https://console.cloud.google.com/apis/library/calendar-json.googleapis.com
2. ตรวจว่ามุมบนเลือก **project เดียวกัน**กับที่สร้าง service account
3. กด **ENABLE**

> ถ้าเลือก project ผิด จะขึ้น error ตอนซิงก์ว่า API ยังไม่เปิด

## ขั้นที่ 4 — แชร์ปฏิทินให้ service account ⭐

**ขั้นนี้พลาดบ่อยที่สุด**

1. คัดลอกอีเมลของ service account — อยู่ในหน้า service account หรือในไฟล์ JSON ช่อง `client_email`
   หน้าตาประมาณ `calendar-writer@music-borrow-xxxxx.iam.gserviceaccount.com`
2. เปิด https://calendar.google.com → หาปฏิทิน **วงโยธวาทิต** ในแถบซ้าย
3. ชี้ที่ชื่อปฏิทิน → จุด 3 จุด → **การตั้งค่าและการแชร์**
4. เลื่อนหา **แชร์กับบุคคลและกลุ่มที่ต้องการ** → **เพิ่มบุคคลและกลุ่ม**
5. วางอีเมล service account
6. สิทธิ์เลือก **"ทำการเปลี่ยนแปลงกิจกรรม"** ← ต้องอันนี้ ไม่ใช่ "ดูรายละเอียด"
7. กด **ส่ง**

## ขั้นที่ 5 — ใส่ Secrets ใน Supabase

1. เปิด https://supabase.com/dashboard/project/qsbvitqxwgtmopjjuxin/settings/functions
2. ส่วน **Edge Function Secrets** → **Add new secret** 2 ครั้ง

| Name | Value |
|---|---|
| `GCAL_SERVICE_ACCOUNT` | เปิดไฟล์ JSON ด้วย Notepad → copy **ทั้งไฟล์** ตั้งแต่ `{` ถึง `}` → วาง |
| `GCAL_CALENDAR_ID` | `b5b4ce4a587bdb09b55700d7090bcf636a8a31af6699d64995a594b5900fed98@group.calendar.google.com` |

> วาง JSON ทั้งก้อนตามที่เป็น ไม่ต้องแก้อะไร ไม่ต้องลบ `\n` ออก

## ขั้นที่ 6 — ทดสอบ

1. เข้าแอป → แท็บ **🎭 งาน/การแสดง**
2. เพิ่มกิจกรรมทดสอบสัก 1 รายการ (กด **📢 ประกาศเลย**)
3. กด **🔄 ซิงก์เดี๋ยวนี้**
4. ควรขึ้น `ซิงก์แล้ว — เพิ่ม 1 · แก้ 0 · ลบ 0`
5. เปิดปฏิทิน Google → ต้องเห็นกิจกรรมนั้น

เสร็จแล้ว **ไม่ต้องกดปุ่มอีก** — ครั้งต่อไปเพิ่ม/แก้/ลบกิจกรรม ปฏิทินตามเองภายในไม่กี่วินาที

---

## ถ้าไม่ผ่าน

| ข้อความ | สาเหตุ | แก้ |
|---|---|---|
| `ยังไม่ได้ตั้ง GCAL_...` | Secrets ยังไม่บันทึก | ทำขั้น 5 ใหม่ แล้วรอ ~1 นาที |
| `404` หรือ `Not Found` | ยังไม่ได้แชร์ปฏิทิน / `GCAL_CALENDAR_ID` ผิด | ทำขั้น 4 ใหม่ |
| `403` + `insufficient permission` | แชร์แล้วแต่ให้สิทธิ์แค่ "ดู" | เปลี่ยนเป็น **ทำการเปลี่ยนแปลงกิจกรรม** |
| `403` + `has not been used in project` | Calendar API ยังไม่เปิด หรือเปิดผิด project | ทำขั้น 3 ใหม่ |
| `invalid_grant` / `Invalid JWT` | JSON วางไม่ครบ หรือขาดบางส่วน | copy ไฟล์ใหม่ทั้งก้อน |

**ดู error เต็ม ๆ ได้ที่** Supabase → Edge Functions → `gcal-sync` → Logs

---

## หมายเหตุความปลอดภัย

- กุญแจอยู่ใน Supabase Secrets เท่านั้น ไม่อยู่ในโค้ดและไม่อยู่ใน git
- service account เข้าถึงได้**เฉพาะปฏิทินที่แชร์ให้** ปฏิทินส่วนตัวอื่นแตะไม่ได้
- ถ้าสงสัยว่ากุญแจหลุด: ไปที่ service account → KEYS → ลบ key เก่า → สร้างใหม่ → อัปเดต Secret
