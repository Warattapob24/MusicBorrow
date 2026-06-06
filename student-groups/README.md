# Student Groups — ระบบจัดกลุ่มนักเรียน

## Links สำหรับแจก
| กลุ่มเป้าหมาย | URL |
|---|---|
| 🎒 **นักเรียน** | `https://student-groups.vercel.app/` |
| 📚 **ครู** | `https://student-groups.vercel.app/teacher` |
| ⚙️ **Admin** | `https://student-groups.vercel.app/admin` |

## วิธี Deploy บน Vercel (ครั้งแรก)

### 1. Push ขึ้น GitHub
```bash
git init
git add .
git commit -m "init student groups"
git remote add origin https://github.com/YOUR_USERNAME/student-groups.git
git push -u origin main
```

### 2. Import บน Vercel
1. ไป https://vercel.com/new
2. Import GitHub repo `student-groups`
3. Framework: **Vite**
4. ตั้ง Environment Variables:
   - `VITE_SUPABASE_URL` = `https://qsbvitqxwgtmopjjuxin.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = (anon key จาก Supabase dashboard)
   - `VITE_TEACHER_CODE` = รหัสครู (เปลี่ยนได้)
   - `VITE_ADMIN_CODE` = รหัส admin (เปลี่ยนได้)
5. กด **Deploy**

### 3. Custom domain (optional)
ใน Vercel → Domains → Add `student-groups.vercel.app` หรือ domain ของตัวเอง

## Dev local
```bash
cp .env.example .env.local
# แก้ VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

## รหัสทดสอบ
- นักเรียน: `10001`, `10002`, `10003` (ม.4/1) · `10004`, `10005` (ม.4/2)
- ครู: `teacher001`
- Admin: `admin9999`
