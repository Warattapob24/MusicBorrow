# 🔔 Push Notification Setup — คู่มือทำให้แจ้งเตือนวิ่งจริง

ทำให้แอปแจ้งเตือนได้แม้ปิดแอป — ทุกขั้นตอน 1 ครั้ง ก็จบ

---

## 📋 Overview ของระบบ

```
[Insert into notifications table]
        ↓
[Trigger: notifications_send_push]
        ↓
[Edge Function: send-push]    ← ทำหน้าที่ยิง Web Push ผ่าน VAPID
        ↓
[Browser/Mobile Service Worker (sw.js)]
        ↓
[showNotification() บนเครื่องผู้ใช้]
```

---

## ขั้นตอนที่ 1️⃣ — สร้าง VAPID Keypair (ถ้ายังไม่มี)

VAPID = ใบรับรองที่ Web Push ต้องใช้

### บนคอมของคุณ เปิด terminal/PowerShell แล้ววางทีละบรรทัด:

```bash
npx web-push generate-vapid-keys
```

จะได้ output แบบนี้:
```
=======================================
Public Key:
B...long-string...
Private Key:
xxx...
=======================================
```

📌 **คัดลอก Public Key + Private Key ไว้** (จะใช้ในขั้นถัดไป)

> หมายเหตุ: ในไฟล์ `config.js` มี `VAPID_PUBLIC_KEY` ตั้งไว้แล้ว — ถ้าจะใช้ตัวนั้น (`BI6D8DhCn0rV9iNN3pl3lw9sALosC12riKQhjMnaDUloZ_HVC6YlnS2UECF59G0713FdFF9dE2wcEEunRCn-sNc`) คุณต้องเก็บ **Private Key คู่กับมัน** ไว้ตอนสร้างครั้งแรก ถ้าหายแล้วต้อง generate ใหม่ทั้งคู่ + อัปเดต `config.js`

---

## ขั้นตอนที่ 2️⃣ — รัน SQL Migration

1. เปิด **Supabase Dashboard** → project `qsbvitqxwgtmopjjuxin`
2. **SQL Editor** → **+ New query**
3. เปิดไฟล์ `MIGRATION_PUSH_TRIGGERS.sql` ใน VS Code
4. **Copy ทั้งหมด** → paste → **Run**
5. ดูบรรทัดสุดท้าย — ทุก `ok` ต้องเป็น `true`

---

## ขั้นตอนที่ 3️⃣ — อัปเดต Service Role Key ใน push_config

ใน SQL Editor รันคำสั่ง (1 บรรทัด):

```sql
UPDATE push_config
SET value = 'YOUR_SERVICE_ROLE_KEY_HERE'
WHERE key = 'service_role_key';
```

**หา service_role key ที่ไหน?**
- Dashboard → **Settings** → **API**
- ในกล่อง **Project API keys** → **service_role secret** (กดปุ่มแว่นเพื่อแสดง)
- คัดลอกแล้ววางแทน `YOUR_SERVICE_ROLE_KEY_HERE`

⚠️ **สำคัญ:** อย่าใส่ key นี้ใน code ที่ commit เข้า git — เก็บใน DB หรือ ENV เท่านั้น

---

## ขั้นตอนที่ 4️⃣ — Deploy Edge Function

### A. ติดตั้ง Supabase CLI (ครั้งเดียว)

```powershell
npm install -g supabase
```

### B. Login + Link project

```powershell
cd "G:\ไดรฟ์ของฉัน\ระบบยืมคืนเครื่องดนตรีv5.2"
supabase login
supabase link --project-ref qsbvitqxwgtmopjjuxin
```

(จะถาม database password — ถ้าจำไม่ได้ reset ที่ Settings → Database)

### C. ตั้ง ENV vars สำหรับ Edge Function

```powershell
supabase secrets set VAPID_PUBLIC_KEY="<paste public key>"
supabase secrets set VAPID_PRIVATE_KEY="<paste private key>"
supabase secrets set VAPID_SUBJECT="mailto:warattapob24@gmail.com"
```

(อย่าลืมใส่ `mailto:` นำหน้าอีเมล)

### D. Deploy

```powershell
supabase functions deploy send-push
```

ถ้าได้ข้อความแบบนี้ = สำเร็จ:
```
Deployed Function send-push to project qsbvitqxwgtmopjjuxin
```

---

## ขั้นตอนที่ 5️⃣ — ทดสอบ

### A. ทดสอบใน Supabase SQL Editor

```sql
SELECT test_my_push('ทดสอบส่งเตือนครั้งแรก');
```

✅ ถ้ามือถือ/เบราว์เซอร์เด้งแจ้งเตือน = สำเร็จ!

### B. ทดสอบจากแอปจริง

1. เปิดแอปบนมือถือ → login (ครั้งแรกจะถามขออนุญาตแจ้งเตือน — กด **อนุญาต**)
2. **ปิดแอป** (ปัดออกจาก task manager)
3. ใน Supabase SQL Editor ส่งคำสั่ง:
   ```sql
   SELECT test_my_push('ส่งตอนปิดแอป');
   ```
4. ✅ ควรมีแจ้งเตือนเด้งบนมือถือแม้แอปปิดอยู่

### C. ดู log ถ้าไม่ทำงาน

- Edge Function log: Dashboard → **Edge Functions** → **send-push** → **Logs**
- DB log: Dashboard → **Logs Explorer** → filter `[push trigger]`

---

## 🆘 Troubleshooting

| อาการ | สาเหตุ | แก้ |
|------|--------|----|
| `Function not found` | ยัง deploy ไม่สำเร็จ | รัน `supabase functions deploy send-push` ใหม่ |
| `Invalid VAPID keys` | คีย์คู่ไม่ตรงกัน | Generate ใหม่ + แก้ `config.js` + redeploy |
| ไม่มีแจ้งเตือนเลย | Trigger ไม่ทำงาน | ตรวจ `service_role_key` ใน push_config |
| มีบางคนได้ บางคนไม่ได้ | Subscription หมดอายุ | ระบบลบให้อัตโนมัติ — บอก user เข้าแอปใหม่ |
| iOS ไม่ได้รับ | Safari < 16.4 ไม่รองรับ | ใช้ iOS 16.4+ + เพิ่มเป็น **Add to Home Screen** ก่อน |

---

## ⚙️ How it works (สรุป)

1. User เข้าแอป → `requestPushPermission` ขอ permission + subscribe → save ที่ `push_subscriptions`
2. ระบบสร้าง notification (ผ่าน RPC / scheduled / auto-trigger ใดๆ ก็ตาม) → INSERT into `notifications`
3. Trigger `notifications_send_push` ดักจับ INSERT → call Edge Function `send-push` ผ่าน `pg_net`
4. Edge Function ดึง subscription ทั้งหมดของ user → ส่ง Web Push ไปทุกเครื่อง
5. Service Worker ของเบราว์เซอร์ผู้ใช้ (sw.js) รับ push event → `showNotification()`
6. ✅ ผู้ใช้เห็นแจ้งเตือน — แม้แอปปิดอยู่
