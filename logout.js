// logout.js
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

async function logout() {
  await supabase.auth.signOut();
  showToast('ออกจากระบบสำเร็จ', 'success');
  setTimeout(() => { window.location.href = 'index.html'; }, 1000);
}

// ตัวอย่างการใช้งาน: <button onclick="logout()">ออกจากระบบ</button>
