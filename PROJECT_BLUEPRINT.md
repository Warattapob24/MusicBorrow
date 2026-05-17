# 🏛️ Project Blueprint: ระบบยืมคืนเครื่องดนตรี SPA

## 📌 Core Architecture (กฎเกณฑ์สถาปัตยกรรม)
1. **Strict Separation of Concerns:**
   - `api.js`: รับหน้าที่คุยกับ Database (Supabase) **เพียงผู้เดียว** ห้ามไฟล์ UI ใดๆ เรียกใช้ `supabase` โดยตรงเด็ดขาด
   - `ui.js` / `*-dashboard.js`: รับหน้าที่จัดการ DOM และ Event เท่านั้น 
2. **Component Reusability:** - ห้าม Hardcode โครงสร้าง HTML ซ้ำๆ ให้แยกเป็น Helper Functions (Component-like)
3. **State & Security:**
   - Supabase Auth Session (JWT) คือแหล่งความจริงเพียงหนึ่งเดียว ห้ามไว้ใจ `localStorage` สำหรับ Logic สิทธิ์และคะแนน
4. **Mini-Game Architecture (`staffwars.html`, `rhythmcore.html`):**
   - ทำงานแบบ Isolated ห้ามติดต่อ Supabase โดยตรง ให้ส่งคะแนนผ่าน `window.postMessage` ไปให้หน้าหลักจัดการ
   - ตัวจับเวลาต้องรัดกุม ป้องกันผู้เล่นหาช่องโหว่ (Exploit) จากระยะเวลาการเล่น
5. **PWA & Performance:**
   - `sw.js` ต้องใช้ **Network-First** สำหรับหน้าหลัก (`.html`) เสมอ เพื่อรับประกันการส่งมอบอัปเดตให้ผู้ใช้
   - ใช้ **Event Delegation** สำหรับ UI ที่มีการ Rerender บ่อยๆ ป้องกัน Memory Leak
6. **No Global Pollution:**
   - ห้ามประกาศตัวแปร/ฟังก์ชันลง `window` ในระบบ ES Modules ให้ใช้ `export` เสมอ

## 🚀 Next Action Plan (เรียงตามลำดับความสำคัญ)
1. [Phase 1] แก้ไข `sw.js` เป็น Network-First Strategy 
2. [Phase 1] คลีนอัปโค้ดฝั่งเกม (`staffwars.html`) ลบ Supabase Key และอุดช่องโหว่เวลา
3. [Phase 2] Refactor ดึงคำสั่ง Database ออกจาก UI files ให้เหลือแค่ที่ `api.js`
4. [Phase 3] คลีนอัป HTML strings ใน JS และจัดระเบียบ `player-card.js`

## 📌 Database Schema & Architecture (Web Push Notifications)
1. **Table `push_subscriptions`:** (id, user_id, endpoint, auth_key, p256dh_key, created_at)
   - ใช้เก็บ "ที่อยู่และกุญแจประจำเครื่อง" ของผู้ใช้แต่ละคน (1 คนอาจมีหลายเครื่อง)
2. **Supabase Edge Functions:** 
   - สร้าง Function ชื่อ `send-push` ทำหน้าที่รับ Payload จาก Database/RPC แล้วใช้ VAPID Private Key ยิงแจ้งเตือนผ่าน Web-Push library ไปยังเครื่องผู้ใช้
3. **PWA Service Worker (`sw.js`):**
   - เพิ่ม Event Listener `push` รับข้อความจาก Background แล้วสั่ง `self.registration.showNotification()`

# 🏛️ Blueprint: Guild & Raid System (ระบบวงดนตรีและสอบล่าบอส)

## 📌 Database Schema
1. **Table `bosses`:** (id, title, description, reward_xp, reward_stars, required_practice_mins [เวลาซ้อมเพื่อฟื้น HP], is_active)
2. **Table `quests`:** (id, boss_id [FK], title, target_type, target_value) -> เควสต์ที่เป็นทางผ่านก่อนตีบอส
3. **Table `raid_lobbies`:** (id, boss_id, admin_id, room_code [4 digits], status ['waiting', 'raiding', 'closed'], created_at)
4. **Table `raid_participants`:** (id, lobby_id, user_id, status ['joined', 'passed', 'failed'])
5. **Table `users` (Alter):** 
   - เพิ่ม `stars` (int, default 0)
   - เพิ่ม `hp` (int, default 3)
   - เพิ่ม `rested_xp_until` (timestamp, ใช้เก็บเวลาบัฟ Comeback)

## 📌 Architecture Rules
1. **Seamless Raid:** ใช้ `supabase.channel` (Realtime) ในการทำ Lobby นักเรียนใส่ Room Code แล้วเด้งขึ้นจอ Admin ทันที
2. **Dynamic Configurations:** ค่า XP และการตั้งค่ารางวัลต่างๆ ให้ดึงจาก Table `system_settings`
3. **Avatar Level UI:** การแสดงผล Level บน Leaderboard ให้ใช้ CSS Position (Absolute) แปะทับมุมขวาล่างของ Avatar โดยไม่ต้องเพิ่มคอลัมน์ HTML