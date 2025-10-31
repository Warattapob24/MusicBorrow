// supabaseClient.js

// ✨ 1. Import ฟังก์ชัน createClient โดยตรงจาก CDN ที่รองรับ Module ✨
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// 2. ใส่ URL และ Key ของคุณเหมือนเดิม
const SUPABASE_URL = 'https://qsbvitqxwgtmopjjuxin.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFzYnZpdHF4d2d0bW9wamp1eGluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA4MjI1ODIsImV4cCI6MjA2NjM5ODU4Mn0.Bl4Lc27_z8TXDiwvNuzFvZmQvnCROlcEpQAm4dCEZeM';

// 3. สร้าง client จากฟังก์ชันที่ import เข้ามาโดยตรง
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 4. Export ออกไปให้ไฟล์อื่นใช้ (เหมือนเดิม)
export default supabase;