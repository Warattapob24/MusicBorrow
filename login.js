// import { createClient } from '@supabase/supabase-js'; // ลบออก

const supabaseUrl = 'https://qsbvitqxwgtmopjjuxin.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFzYnZpdHF4d2d0bW9wamp1eGluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA4MjI1ODIsImV4cCI6MjA2NjM5ODU4Mn0.Bl4Lc27_z8TXDiwvNuzFvZmQvnCROlcEpQAm4dCEZeM';
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

// ฟังก์ชันแสดง toast แจ้งเตือนแบบสวย (ใช้ร่วมกับทุกไฟล์)
function showToast(message, type = 'info') {
  let toast = document.createElement('div');
  toast.textContent = message;
  toast.style.position = 'fixed';
  toast.style.bottom = '32px';
  toast.style.left = '50%';
  toast.style.transform = 'translateX(-50%)';
  toast.style.background = type === 'success' ? '#2ecc40' : (type === 'error' ? '#ff4136' : '#0074d9');
  toast.style.color = '#fff';
  toast.style.padding = '16px 32px';
  toast.style.borderRadius = '8px';
  toast.style.fontSize = '1.1em';
  toast.style.boxShadow = '0 2px 12px rgba(0,0,0,0.15)';
  toast.style.zIndex = 9999;
  document.body.appendChild(toast);
  setTimeout(() => { toast.remove(); }, 3000);
}

// ฟังก์ชันเข้าสู่ระบบด้วยอีเมลและรหัสผ่าน
async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    showToast('เข้าสู่ระบบไม่สำเร็จ: ' + error.message, 'error');
    return null;
  }
  return data.user;
}

// --- ✨ รวบรวมข้อมูลจากทุก Input ในฟอร์ม ✨ ---
const email = document.getElementById('reg-email').value;
const password = document.getElementById('reg-password').value;
const prefix = document.getElementById('reg-prefix').value;
const firstName = document.getElementById('reg-firstname').value;
const lastName = document.getElementById('reg-lastname').value;
const nickname = document.getElementById('reg-nickname').value;
const birthDate = document.getElementById('reg-birthdate').value;
const classLevel = document.getElementById('reg-class').value;
const phone = document.getElementById('reg-phone').value;
const lineId = document.getElementById('reg-lineid').value;
const studentGroup = document.getElementById('reg-group').value;
const mainInstrument = document.getElementById('reg-maininstrument').value;
const fullName = `<span class="math-inline">\{prefix\}</span>{firstName} ${lastName}`; // สร้างชื่อเต็มจาก prefix, first, last name

// (ส่วนของ Profile Image จะซับซ้อนกว่า ขอข้ามไปก่อนในขั้นตอนนี้)

const { data, error } = await supabase.auth.signUp({
    email: email,
    password: password,
    options: {
        // ✨ ส่งข้อมูลทั้งหมดเข้าไปใน data เพื่อให้ Trigger นำไปใช้ต่อ ✨
        data: {
            full_name: fullName,
            student_id: document.getElementById('reg-studentid').value, // รหัสนักเรียน
            role: 'student', // กำหนดค่าเริ่มต้น
            student_group: studentGroup,
            prefix: prefix,
            first_name: firstName,
            last_name: lastName,
            nickname: nickname,
            birth_date: birthDate || null, // ถ้าไม่กรอกให้เป็น null
            class_level: classLevel,
            phone_number: phone,
            line_id: lineId,
            main_instrument: mainInstrument
        }
    }
});

if (error) {
    Swal.fire('สมัครไม่สำเร็จ', error.message, 'error');
} else {
    await Swal.fire({
        icon: 'success',
        title: 'สมัครสมาชิกสำเร็จ!',
        text: 'กรุณาตรวจสอบอีเมลของคุณเพื่อยืนยันบัญชี แล้วกลับมาล็อกอินอีกครั้ง'
    });
    window.location.href = 'login.html';
}

// ตัวอย่างการใช้งานกับฟอร์ม
const form = document.getElementById('login-form');
if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const user = await login(email, password);
    if (user) {
      showToast('เข้าสู่ระบบสำเร็จ!', 'success');
      setTimeout(() => { window.location.href = '/dashboard.html'; }, 1000);
    }
  });
}
