// register.js
const supabaseUrl = 'https://qsbvitqxwgtmopjjuxin.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFzYnZpdHF4d2d0bW9wamp1eGluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA4MjI1ODIsImV4cCI6MjA2NjM5ODU4Mn0.Bl4Lc27_z8TXDiwvNuzFvZmQvnCROlcEpQAm4dCEZeM';
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

const form = document.getElementById('register-form');
if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    const prefix = document.getElementById('reg-prefix').value;
    const firstname = document.getElementById('reg-firstname').value;
    const lastname = document.getElementById('reg-lastname').value;
    const nickname = document.getElementById('reg-nickname').value;
    const birthdate = document.getElementById('reg-birthdate').value;
    const age = document.getElementById('reg-age').value;
    const className = document.getElementById('reg-class').value;
    const phone = document.getElementById('reg-phone').value;
    const lineid = document.getElementById('reg-lineid').value;
    const group = document.getElementById('reg-group').value;
    const maininstrument = document.getElementById('reg-maininstrument').value;
    // รูปโปรไฟล์
    const profileImageInput = document.getElementById('reg-profileimage');
    let profileImageUrl = '';
    // สมัครสมาชิก auth
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      showToast('สมัครสมาชิกไม่สำเร็จ: ' + error.message, 'error');
      return;
    }
    // อัปโหลดรูปโปรไฟล์ (ถ้ามี)
    const userId = data.user?.id;
    if (userId && profileImageInput.files.length > 0) {
      const file = profileImageInput.files[0];
      const { data: uploadData, error: uploadError } = await supabase.storage.from('profile-images').upload(`users/${userId}/${file.name}`, file, { upsert: true });
      if (!uploadError) {
        const { data: urlData } = supabase.storage.from('profile-images').getPublicUrl(`users/${userId}/${file.name}`);
        profileImageUrl = urlData.publicUrl;
      }
    }
    // เพิ่มข้อมูลลง users table
    const full_name = `${prefix}${firstname} ${lastname}`;
    const student_group = group;
    if (userId) {
      // กำหนด role เป็น 'student' เสมอ (ตาม schema)
      const { error: insertError } = await supabase.from('users').insert([
        {
          id: userId,
          email,
          full_name,
          role: 'student',
          student_group
        }
      ]);
      if (insertError) {
        showToast('บันทึกข้อมูลผู้ใช้ไม่สำเร็จ: ' + insertError.message, 'error');
        return;
      }
    }
    showToast('สมัครสมาชิกสำเร็จ! กรุณายืนยันอีเมลและเข้าสู่ระบบ', 'success');
    setTimeout(() => { window.location.href = 'index.html'; }, 1200);
  });
}

// ฟังก์ชันแสดง toast แจ้งเตือนแบบสวย
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
