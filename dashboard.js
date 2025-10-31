// dashboard.js
import supabase from './supabaseClient.js';

// --- State and Main Logic ---
let currentUserProfile = null;

// --- ฟังก์ชันสร้างชื่อเต็มจาก prefix, first_name, last_name ---
function getDisplayName(profile) {
    if (!profile) return '';
    return `${profile.prefix || ''}${profile.first_name || ''} ${profile.last_name || ''}`.trim();
}

document.addEventListener('DOMContentLoaded', async () => {
    // ตรวจสอบการล็อกอินก่อน
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        window.location.href = 'login.html'; // ถ้าไม่ล็อกอิน ให้กลับไปหน้า login
        return;
    }
    
    // ดึงข้อมูลโปรไฟล์ผู้ใช้ (รวมถึง role)
    await fetchUserProfile(session.user.id);
    
    // แสดงผลตาม Role
    if (currentUserProfile && currentUserProfile.role === 'admin') {
        renderAdminDashboard();
    } else {
        renderStudentDashboard();
    }
});

async function fetchUserProfile(userId) {
    const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();
    
    if (error) {
        console.error('Error fetching profile:', error);
        await supabase.auth.signOut(); // ถ้าหาโปรไฟล์ไม่เจอ ให้ signOut ออก
    } else {
        currentUserProfile = data;
    }
}

// --- Student View ---
function renderStudentDashboard() {
    // ... โค้ดสำหรับสร้าง UI ของนักเรียน ...
    // ... เรียกฟังก์ชัน fetchAvailableInstruments(), renderBorrowedInstruments() ...
    // แสดงชื่อเต็มผู้ใช้
    const welcomeDiv = document.getElementById('welcome-message');
    if (welcomeDiv && currentUserProfile) {
        welcomeDiv.textContent = `ยินดีต้อนรับ ${getDisplayName(currentUserProfile)}`;
    }
}

async function borrowInstrument(instrumentId) {
    // ✨ เปลี่ยนมาเรียกใช้ RPC ✨
    const { error } = await supabase.rpc('borrow_instrument_atomic', {
        p_instrument_id: instrumentId,
        p_student_id: currentUserProfile.id
    });

    if (error) {
        alert('เกิดข้อผิดพลาดในการยืม: ' + error.message);
    } else {
        alert('ยืมเครื่องดนตรีสำเร็จ!');
        // โหลดข้อมูล UI ใหม่โดยไม่ต้อง reload ทั้งหน้า
        renderStudentDashboard(); 
    }
}

async function fetchAvailableInstruments() {
  const { data, error } = await supabase
    .from('instruments')
    .select('*')
    .eq('status', 'available');
  if (error) {
    showToast('เกิดข้อผิดพลาด: ' + error.message, 'error');
    return [];
  }
  return data;
}


// ฟังก์ชันคืนเครื่องดนตรี
async function returnInstrument(instrumentId) {
  const user = supabase.auth.getUser ? (await supabase.auth.getUser()).data.user : null;
  if (!user) {
    showToast('กรุณาเข้าสู่ระบบก่อนคืนเครื่องดนตรี', 'error');
    return;
  }
  // หา borrow_log ล่าสุดที่ยังไม่คืน
  const { data: logs, error: logError } = await supabase
    .from('borrow_logs')
    .select('id')
    .eq('instrument_id', instrumentId)
    .eq('student_id', user.id)
    .is('return_timestamp', null)
    .order('borrow_timestamp', { ascending: false })
    .limit(1);
  if (logError || !logs || logs.length === 0) {
    showToast('ไม่พบประวัติการยืมที่ยังไม่คืน', 'error');
    return;
  }
  const logId = logs[0].id;
  // อัปเดต log ให้มี return_timestamp
  const { error: updateLogError } = await supabase
    .from('borrow_logs')
    .update({ return_timestamp: new Date().toISOString() })
    .eq('id', logId);
  if (updateLogError) {
    showToast('ไม่สามารถบันทึกการคืน: ' + updateLogError.message, 'error');
    return;
  }
  // อัปเดตสถานะเครื่องดนตรี
  const { error: updateInstrumentError } = await supabase
    .from('instruments')
    .update({ status: 'available', current_borrower_id: null })
    .eq('id', instrumentId);
  if (updateInstrumentError) {
    showToast('ไม่สามารถอัปเดตสถานะเครื่องดนตรี: ' + updateInstrumentError.message, 'error');
    return;
  }
  showToast('คืนเครื่องดนตรีสำเร็จ!', 'success');
  location.reload();
}

// ปรับปรุงการแสดงผลให้มีปุ่มยืม
async function renderInstruments() {
  const instruments = await fetchAvailableInstruments();
  const list = document.getElementById('instrument-list');
  if (list) {
    list.innerHTML = instruments.map(i =>
      `<li>${i.name} (${i.type}) <button onclick="borrowInstrument(${i.id})">ยืม</button></li>`
    ).join('');
  }
}

// แสดงรายการเครื่องดนตรีที่ผู้ใช้กำลังยืม
async function renderBorrowedInstruments() {
  const user = supabase.auth.getUser ? (await supabase.auth.getUser()).data.user : null;
  if (!user) return;
  const { data, error } = await supabase
    .from('instruments')
    .select('*, borrow_logs:borrow_logs!inner(id, home_borrow_request, home_borrow_approved, return_timestamp)')
    .eq('status', 'borrowed')
    .eq('current_borrower_id', user.id);
  const list = document.getElementById('borrowed-list');
  if (list) {
    if (error) {
      list.innerHTML = '<li>เกิดข้อผิดพลาด: ' + error.message + '</li>';
    } else if (data.length === 0) {
      list.innerHTML = '<li>ไม่มีเครื่องดนตรีที่กำลังยืมอยู่</li>';
    } else {
      list.innerHTML = data.map(i => {
        // หา borrow_log ที่ยังไม่คืน
        const log = (i.borrow_logs || []).find(l => !l.return_timestamp);
        let homeBtn = '';
        if (log && !log.home_borrow_request) {
          homeBtn = `<button onclick=\"requestHomeBorrow(${log.id})\">ขอยืมกลับบ้าน</button>`;
        } else if (log && log.home_borrow_request && log.home_borrow_approved === null) {
          homeBtn = '<span style="color:orange">รออนุมัติขอยืมกลับบ้าน</span>';
        } else if (log && log.home_borrow_approved === true) {
          homeBtn = '<span style="color:green">อนุมัติยืมกลับบ้าน</span>';
        } else if (log && log.home_borrow_approved === false) {
          homeBtn = '<span style="color:red">ปฏิเสธขอยืมกลับบ้าน</span>';
        }
        return `<li>${i.name} (${i.type}) <button onclick=\"returnInstrument(${i.id})\">คืน</button> ${homeBtn}</li>`;
      }).join('');
    }
  }
}

// ฟังก์ชันขอยืมกลับบ้าน
window.requestHomeBorrow = async function(logId) {
  const { error } = await supabase
    .from('borrow_logs')
    .update({ home_borrow_request: true })
    .eq('id', logId);
  if (error) {
    showToast('ขอยืมกลับบ้านไม่สำเร็จ: ' + error.message, 'error');
  } else {
    showToast('ส่งคำขอยืมกลับบ้านแล้ว!', 'success');
    renderBorrowedInstruments();
  }
}

// แสดงประวัติการยืม-คืนของผู้ใช้
async function renderBorrowHistory() {
  const user = supabase.auth.getUser ? (await supabase.auth.getUser()).data.user : null;
  if (!user) return;
  const { data, error } = await supabase
    .from('borrow_logs')
    .select('*, instruments(name, type)')
    .eq('student_id', user.id)
    .order('borrow_timestamp', { ascending: false });
  const list = document.getElementById('history-list');
  if (list) {
    if (error) {
      list.innerHTML = '<li>เกิดข้อผิดพลาด: ' + error.message + '</li>';
    } else if (data.length === 0) {
      list.innerHTML = '<li>ยังไม่มีประวัติการยืม-คืน</li>';
    } else {
      list.innerHTML = data.map(log =>
        `<li>${log.instruments?.name || '-'} (${log.instruments?.type || '-'})<br>
        ยืม: ${new Date(log.borrow_timestamp).toLocaleString()}<br>
        คืน: ${log.return_timestamp ? new Date(log.return_timestamp).toLocaleString() : '<span style=\'color:red\'>ยังไม่คืน</span>'}
        </li>`
      ).join('');
    }
  }
}

// แสดงเหรียญตราของผู้ใช้
async function renderBadges() {
  const user = supabase.auth.getUser ? (await supabase.auth.getUser()).data.user : null;
  if (!user) return;
  const { data, error } = await supabase
    .from('badges')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  const list = document.getElementById('badge-list');
  if (list) {
    if (error) {
      list.innerHTML = '<li>เกิดข้อผิดพลาด: ' + error.message + '</li>';
    } else if (data.length === 0) {
      list.innerHTML = '<li>ยังไม่มีเหรียญตรา</li>';
    } else {
      list.innerHTML = data.map(badge =>
        `<li><strong>${badge.badge_name}</strong><br>${badge.badge_description || ''}</li>`
      ).join('');
    }
  }
}

// โหลดข้อมูลผู้ใช้และกรอกลงฟอร์ม
async function loadProfile() {
  const user = supabase.auth.getUser ? (await supabase.auth.getUser()).data.user : null;
  if (!user) return;
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single();
  if (error || !data) return;
  document.getElementById('student_id').value = data.student_id || '';
  document.getElementById('student_group').value = data.student_group || '';
  if (data.role && document.getElementById('user_role')) {
    document.getElementById('user_role').value = data.role;
  }
  // กรอก prefix, first_name, last_name ถ้ามีฟิลด์ในฟอร์ม
  if (document.getElementById('prefix')) document.getElementById('prefix').value = data.prefix || '';
  if (document.getElementById('first_name')) document.getElementById('first_name').value = data.first_name || '';
  if (document.getElementById('last_name')) document.getElementById('last_name').value = data.last_name || '';
}

document.addEventListener('DOMContentLoaded', loadProfile);

// ฟังก์ชันบันทึกข้อมูลส่วนตัว
const profileForm = document.getElementById('profile-form');
if (profileForm) {
  profileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = supabase.auth.getUser ? (await supabase.auth.getUser()).data.user : null;
    if (!user) return;
    const student_id = document.getElementById('student_id').value;
    const student_group = document.getElementById('student_group').value;
    const role = document.getElementById('user_role') ? document.getElementById('user_role').value : undefined;
    // รับ prefix, first_name, last_name จากฟอร์ม ถ้ามี
    const prefix = document.getElementById('prefix') ? document.getElementById('prefix').value : undefined;
    const first_name = document.getElementById('first_name') ? document.getElementById('first_name').value : undefined;
    const last_name = document.getElementById('last_name') ? document.getElementById('last_name').value : undefined;
    const updateObj = { student_id, student_group };
    if (role) updateObj.role = role;
    if (prefix !== undefined) updateObj.prefix = prefix;
    if (first_name !== undefined) updateObj.first_name = first_name;
    if (last_name !== undefined) updateObj.last_name = last_name;
    const { error } = await supabase
      .from('users')
      .update(updateObj)
      .eq('id', user.id);
    if (error) {
      showToast('บันทึกไม่สำเร็จ: ' + error.message, 'error');
    } else {
      showToast('บันทึกข้อมูลสำเร็จ!', 'success');
    }
  });
}

// แสดงสถิติภาพรวมสำหรับ Admin
async function renderAdminStats() {
  const user = supabase.auth.getUser ? (await supabase.auth.getUser()).data.user : null;
  if (!user) return;
  // ตรวจสอบ role admin
  const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (!userData || userData.role !== 'admin') return;

  // ดึงสถิติ
  const [instrumentsAll, instrumentsBorrowed, usersAll, borrowLogsAll] = await Promise.all([
    supabase.from('instruments').select('id', { count: 'exact', head: true }),
    supabase.from('instruments').select('id', { count: 'exact', head: true }).eq('status', 'borrowed'),
    supabase.from('users').select('id', { count: 'exact', head: true }),
    supabase.from('borrow_logs').select('id', { count: 'exact', head: true })
  ]);

  const statsDiv = document.getElementById('admin-stats');
  if (statsDiv) {
    statsDiv.innerHTML = `
      <h3>สถิติภาพรวม</h3>
      <ul>
        <li>เครื่องดนตรีทั้งหมด: ${instrumentsAll.count ?? '-'}</li>
        <li>เครื่องดนตรีที่ถูกยืม: ${instrumentsBorrowed.count ?? '-'}</li>
        <li>ผู้ใช้ทั้งหมด: ${usersAll.count ?? '-'}</li>
        <li>จำนวนการยืม-คืน: ${borrowLogsAll.count ?? '-'}</li>
      </ul>
    `;
  }
}

// แสดงและจัดการเครื่องดนตรี (Admin CRUD)
async function renderAdminInstruments() {
  const user = supabase.auth.getUser ? (await supabase.auth.getUser()).data.user : null;
  if (!user) return;
  // ตรวจสอบ role admin
  const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (!userData || userData.role !== 'admin') return;

  // ดึงเครื่องดนตรีทั้งหมด
  const { data, error } = await supabase.from('instruments').select('*').order('id');
  const div = document.getElementById('admin-instruments');
  if (div) {
    if (error) {
      div.innerHTML = '<p>เกิดข้อผิดพลาด: ' + error.message + '</p>';
    } else {
      div.innerHTML = '<h3>จัดการเครื่องดนตรี</h3>' +
        '<ul>' +
        data.map(i =>
          `<li>
            <span id="edit-name-${i.id}">${i.name}</span> (${i.type || '-'})
            <button onclick="editInstrument(${i.id})">แก้ไข</button>
            <button onclick="deleteInstrument(${i.id})">ลบ</button>
          </li>`
        ).join('') +
        '</ul>';
    }
  }
}

document.addEventListener('DOMContentLoaded', renderAdminInstruments);

// เพิ่มเครื่องดนตรีใหม่
const addForm = document.getElementById('add-instrument-form');
if (addForm) {
  addForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    // ...insert instrument...
  });
}

// แก้ไขเครื่องดนตรี
window.editInstrument = async (instrumentId) => {
  const nameElem = document.getElementById(`edit-name-${instrumentId}`);
  const currentName = nameElem.innerText;
  const newName = prompt('แก้ไขชื่อเครื่องดนตรี:', currentName);
  if (newName === null || newName.trim() === '') return;

  // อัปเดตชื่อเครื่องดนตรีในฐานข้อมูล
  const { error } = await supabase
    .from('instruments')
    .update({ name: newName })
    .eq('id', instrumentId);
  if (error) {
    showToast('ไม่สามารถแก้ไขเครื่องดนตรี: ' + error.message, 'error');
  } else {
    showToast('แก้ไขเครื่องดนตรีสำเร็จ!', 'success');
    nameElem.innerText = newName;
  }
}

// ลบเครื่องดนตรี
window.deleteInstrument = async (instrumentId) => {
  if (!confirm('คุณแน่ใจว่าต้องการลบเครื่องดนตรีนี้?')) return;

  // ลบเครื่องดนตรีจากฐานข้อมูล
  const { error } = await supabase
    .from('instruments')
    .delete()
    .eq('id', instrumentId);
  if (error) {
    showToast('ไม่สามารถลบเครื่องดนตรี: ' + error.message, 'error');
  } else {
    showToast('ลบเครื่องดนตรีสำเร็จ!', 'success');
    renderAdminInstruments();
  }
}

// แสดงและจัดการนักเรียน (Admin CRUD)
async function renderAdminUsers() {
  const user = supabase.auth.getUser ? (await supabase.auth.getUser()).data.user : null;
  if (!user) return;
  // ตรวจสอบ role admin
  const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (!userData || userData.role !== 'admin') return;

  // ดึงนักเรียนทั้งหมด (role = student)
  const { data, error } = await supabase.from('users').select('*').order('full_name');
  const div = document.getElementById('admin-users');
  if (div) {
    if (error) {
      div.innerHTML = '<p>เกิดข้อผิดพลาด: ' + error.message + '</p>';
    } else {
      div.innerHTML = '<h3>จัดการผู้ใช้</h3>' +
        '<ul>' +
        data.map(u =>
          `<li>
            <span id="edit-user-fullname-${u.id}">${getDisplayName(u)}</span> (${u.student_id || '-'}, ${u.student_group || '-'}, <strong>${roleLabel(u.role)}</strong>)
            <button onclick="editUser('${u.id}')">แก้ไข</button>
            <button onclick="deleteUser('${u.id}')">ลบ</button>
          </li>`
        ).join('') +
        '</ul>';
    }
  }
}

function roleLabel(role) {
  switch (role) {
    case 'student': return 'นักเรียนทั่วไป';
    case 'club': return 'สมาชิกชุมนุม';
    case 'teacher': return 'ครูอาจารย์';
    case 'guest': return 'บุคคลทั่วไป';
    case 'admin': return 'ผู้ดูแล';
    default: return role || '-';
  }
}

// เพิ่มเติมฟังก์ชัน renderAdminUsers ที่นี่ถ้าจำเป็น

document.addEventListener('DOMContentLoaded', renderAdminUsers);

// เพิ่มนักเรียนใหม่
const addUserForm = document.getElementById('add-user-form');
if (addUserForm) {
  addUserForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('add-user-email').value;
    const full_name = document.getElementById('add-user-fullname').value;
    const student_id = document.getElementById('add-user-studentid').value;
    const student_group = document.getElementById('add-user-studentgroup').value;
    // สร้าง user ใน Supabase Auth และ users table
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password: 'changeme123' });
    if (signUpError) {
      showToast('สร้างบัญชีผู้ใช้ไม่สำเร็จ: ' + signUpError.message, 'error');
      return;
    }
    const { error } = await supabase.from('users').insert([
      { id: signUpData.user.id, email, full_name, student_id, student_group, role: 'student' }
    ]);
    if (error) {
      showToast('เพิ่มนักเรียนไม่สำเร็จ: ' + error.message, 'error');
    } else {
      showToast('เพิ่มนักเรียนสำเร็จ! (รหัสผ่านเริ่มต้น changeme123)', 'success');
      addUserForm.reset();
      renderAdminUsers();
    }
  });
}

// ฟังก์ชันลบนักเรียน
window.deleteUser = async function(id) {
  if (!confirm('ยืนยันการลบนักเรียนนี้?')) return;
  const { error } = await supabase.from('users').delete().eq('id', id);
  if (error) {
    showToast('ลบไม่สำเร็จ: ' + error.message, 'error');
  } else {
    showToast('ลบสำเร็จ!', 'success');
    renderAdminUsers();
  }
}

// ฟังก์ชันแก้ไขนักเรียน (popup prompt)
window.editUser = async function(id) {
  const { data, error } = await supabase.from('users').select('*').eq('id', id).single();
  if (error || !data) return showToast('ไม่พบข้อมูล', 'error');
  const newPrefix = prompt('คำนำหน้าใหม่:', data.prefix || '');
  const newFirstName = prompt('ชื่อจริงใหม่:', data.first_name || '');
  const newLastName = prompt('นามสกุลใหม่:', data.last_name || '');
  const newStudentId = prompt('รหัสนักเรียนใหม่:', data.student_id || '');
  const newStudentGroup = prompt('กลุ่ม/ห้องใหม่:', data.student_group || '');
  if (newFirstName === null && newLastName === null) return;
  const { error: updateError } = await supabase.from('users').update({ prefix: newPrefix, first_name: newFirstName, last_name: newLastName, student_id: newStudentId, student_group: newStudentGroup }).eq('id', id);
  if (updateError) {
    showToast('แก้ไขไม่สำเร็จ: ' + updateError.message, 'error');
  } else {
    showToast('แก้ไขสำเร็จ!', 'success');
    renderAdminUsers();
  }
}

// แสดงประวัติการยืม-คืนทั้งหมด (Admin)
async function renderAdminBorrowLogs() {
  const user = supabase.auth.getUser ? (await supabase.auth.getUser()).data.user : null;
  if (!user) return;
  // ตรวจสอบ role admin
  const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (!userData || userData.role !== 'admin') return;

  // ดึงประวัติการยืม-คืนทั้งหมด
  const { data, error } = await supabase
    .from('borrow_logs')
    .select('*, users(full_name), instruments(name, type)')
    .order('borrow_timestamp', { ascending: false });
  const list = document.getElementById('admin-borrow-logs');
  if (list) {
    if (error) {
      list.innerHTML = '<li>เกิดข้อผิดพลาด: ' + error.message + '</li>';
    } else if (data.length === 0) {
      list.innerHTML = '<li>ยังไม่มีประวัติการยืม-คืน</li>';
    } else {
      list.innerHTML = data.map(log =>
        `<li>
          <strong>${getDisplayName(log.users) || '-'}</strong> | 
          ${log.instruments?.name || '-'} (${log.instruments?.type || '-'})<br>
          ยืม: ${new Date(log.borrow_timestamp).toLocaleString()}<br>
          คืน: ${log.return_timestamp ? new Date(log.return_timestamp).toLocaleString() : `<span style='color:red'>ยังไม่คืน</span> <button onclick=\"forceReturnInstrument(${log.id},${log.instrument_id})\">บังคับคืน</button>`}
        </li>`
      ).join('');
    }
  }
}

document.addEventListener('DOMContentLoaded', renderAdminBorrowLogs);

// ฟังก์ชันบังคับคืนเครื่องดนตรี (admin)
window.forceReturnInstrument = async function(logId, instrumentId) {
  if (!confirm('ยืนยันการบังคับคืนเครื่องดนตรีนี้?')) return;
  // อัปเดต log ให้มี return_timestamp
  const { error: updateLogError } = await supabase
    .from('borrow_logs')
    .update({ return_timestamp: new Date().toISOString() })
    .eq('id', logId);
  if (updateLogError) {
    showToast('ไม่สามารถบันทึกการคืน: ' + updateLogError.message, 'error');
    return;
  }
  // อัปเดตสถานะเครื่องดนตรี
  const { error: updateInstrumentError } = await supabase
    .from('instruments')
    .update({ status: 'available', current_borrower_id: null })
    .eq('id', instrumentId);
  if (updateInstrumentError) {
    showToast('ไม่สามารถอัปเดตสถานะเครื่องดนตรี: ' + updateInstrumentError.message, 'error');
    return;
  }
  showToast('บังคับคืนเครื่องดนตรีสำเร็จ!', 'success');
  renderAdminBorrowLogs();
}

// แสดงรายชื่อนักเรียนและปุ่มมอบเหรียญตรา (Admin)
async function renderAdminBadgeUsers() {
  const user = supabase.auth.getUser ? (await supabase.auth.getUser()).data.user : null;
  if (!user) return;
  // ตรวจสอบ role admin
  const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (!userData || userData.role !== 'admin') return;

  // ดึงนักเรียนทั้งหมด
  const { data, error } = await supabase.from('users').select('*').eq('role', 'student').order('full_name');
  const div = document.getElementById('admin-badge-users');
  if (div) {
    if (error) {
      div.innerHTML = '<p>เกิดข้อผิดพลาด: ' + error.message + '</p>';
    } else {
      div.innerHTML = '<h3>มอบเหรียญตราให้นักเรียน</h3>' +
        '<ul>' +
        data.map(u =>
          `<li>
            <span>${getDisplayName(u)} (${u.student_id || '-'})</span>
            <button onclick="giveBadgePrompt('${u.id}', '${getDisplayName(u).replace(/'/g, "\'")}')">มอบเหรียญตรา</button>
          </li>`
        ).join('') +
        '</ul>';
    }
  }
}

document.addEventListener('DOMContentLoaded', renderAdminBadgeUsers);

// ฟังก์ชันมอบเหรียญตรา (Admin)
window.giveBadgePrompt = async function(userId, userFullName) {
  const badgeName = prompt('ชื่อเหรียญตราใหม่:');
  if (badgeName === null || badgeName.trim() === '') return;
  // มอบเหรียญตราให้าผู้ใช้
  const { error } = await supabase
    .from('badges')
    .insert([{ user_id: userId, badge_name: badgeName, badge_description: '', created_at: new Date().toISOString() }]);
  if (error) {
    showToast('มอบเหรียญตราไม่สำเร็จ: ' + error.message, 'error');
  } else {
    showToast('มอบเหรียญตราสำเร็จ!', 'success');
    renderAdminBadgeUsers();
  }
}

// แสดงคำขอยืมกลับบ้าน (Admin)
async function renderAdminHomeBorrowRequests() {
  const user = supabase.auth.getUser ? (await supabase.auth.getUser()).data.user : null;
  if (!user) return;
  // ตรวจสอบ role admin
  const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (!userData || userData.role !== 'admin') return;

  // ดึงคำขอยืมกลับบ้านที่ยังไม่ได้อนุมัติ
  const { data, error } = await supabase
    .from('borrow_logs')
    .select('*, users(full_name), instruments(name, type)')
    .eq('home_borrow_request', true)
    .is('home_borrow_approved', null)
    .order('borrow_timestamp', { ascending: false });
  const list = document.getElementById('admin-home-borrow-requests');
  if (list) {
    if (error) {
      list.innerHTML = '<li>เกิดข้อผิดพลาด: ' + error.message + '</li>';
    } else if (data.length === 0) {
      list.innerHTML = '<li>ยังไม่มีคำขอยืมกลับบ้านที่รออนุมัติ</li>';
    } else {
      list.innerHTML = data.map(log =>
        `<li>
          <strong>${log.users?.full_name || '-'}</strong> | 
          ${log.instruments?.name || '-'} (${log.instruments?.type || '-'})<br>
          ยืม: ${new Date(log.borrow_timestamp).toLocaleString()}<br>
          <button onclick="approveHomeBorrow(${log.id}, true)">อนุมัติ</button>
          <button onclick="approveHomeBorrow(${log.id}, false)">ปฏิเสธ</button>
        </li>`
      ).join('');
    }
  }
}

document.addEventListener('DOMContentLoaded', renderAdminHomeBorrowRequests);

// ฟังก์ชันอนุมัติ/ปฏิเสธคำขอยืมกลับบ้าน
window.approveHomeBorrow = async function(logId, approve) {
  const { error } = await supabase
    .from('borrow_logs')
    .update({ home_borrow_approved: approve })
    .eq('id', logId);
  if (error) {
    showToast('ดำเนินการไม่สำเร็จ: ' + error.message, 'error');
  } else {
    showToast(approve ? 'อนุมัติคำขอยืมกลับบ้านแล้ว' : 'ปฏิเสธคำขอยืมกลับบ้านแล้ว', 'success');
    renderAdminHomeBorrowRequests();
  }
}

// โหลดเครื่องดนตรีที่พร้อมใช้งานทั้งหมด
async function loadAvailableInstruments() {
  const { data, error } = await supabase
    .from('instruments')
    .select('*')
    .eq('status', 'available');
  if (error) {
    Swal.fire('ผิดพลาด', error.message, 'error');
    return [];
  }
  return data;
}

// กรอก dropdown ประเภทเครื่องดนตรีและ dropdown รายการเครื่อง
async function populateInstrumentDropdowns() {
  const instruments = await loadAvailableInstruments();
  const typeFilter = document.getElementById('instrumentTypeFilter');
  const instrumentSelect = document.getElementById('instrumentSelect');
  if (!typeFilter || !instrumentSelect) return;

  // สร้าง set ของประเภท
  const types = [...new Set(instruments.map(i => i.type).filter(Boolean))];
  typeFilter.innerHTML = '<option value="all">-- ทุกประเภท --</option>';
  types.forEach(type => {
    typeFilter.innerHTML += `<option value="${type}">${type}</option>`;
  });

  // ฟังก์ชันอัปเดตรายการเครื่องดนตรีตามประเภทที่เลือก
  function updateInstrumentList() {
    const selectedType = typeFilter.value;
    const filtered = selectedType === 'all'
      ? instruments
      : instruments.filter(i => i.type === selectedType);
    instrumentSelect.innerHTML = '<option value="">-- กรุณาเลือกเครื่องดนตรี --</option>';
    filtered.forEach(i => {
      instrumentSelect.innerHTML += `<option value="${i.id}">${i.name} (${i.type})</option>`;
    });
  }
  typeFilter.onchange = updateInstrumentList;
  updateInstrumentList();
}

// เรียกใช้เมื่อเปิดหน้า borrowSection
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('borrowSection')) {
    populateInstrumentDropdowns();
  }
});

// โหลดเครื่องดนตรีทั้งหมด (admin)
async function loadAllInstrumentsForAdmin() {
  const { data, error } = await supabase.from('instruments').select('*');
  const container = document.getElementById('allInstrumentsListContainer');
  if (!container) return;
  if (error) {
    container.innerHTML = '<p>เกิดข้อผิดพลาด: ' + error.message + '</p>';
  } else {
    container.innerHTML = data.map(i =>
      `<div class="instrument-card">
        <h4>${i.name} (${i.type})</h4>
        <p>สถานะ: ${i.status}</p>
        <button onclick="editInstrument(${i.id})">แก้ไข</button>
        <button onclick="deleteInstrument(${i.id})">ลบ</button>
      </div>`
    ).join('');
  }
}

document.addEventListener('DOMContentLoaded', loadAllInstrumentsForAdmin);

// script สำหรับหน้า index (แสดงข้อมูลสรุปต่างๆ)
document.addEventListener('DOMContentLoaded', async () => {
  // แสดงเครื่องดนตรีที่พร้อมยืม
  if (typeof renderInstruments === 'function') renderInstruments();
  // แสดงเครื่องดนตรีที่กำลังยืม
  if (typeof renderBorrowedInstruments === 'function') renderBorrowedInstruments();
  // แสดงประวัติการยืม-คืน
  if (typeof renderBorrowHistory === 'function') renderBorrowHistory();
  // แสดงเหรียญตรา
  if (typeof renderBadges === 'function') renderBadges();
  // โหลดข้อมูลโปรไฟล์
  if (typeof loadProfile === 'function') loadProfile();
  // แสดงสถิติ admin
  if (typeof renderAdminStats === 'function') renderAdminStats();
  // แสดง/จัดการเครื่องดนตรี (admin)
  if (typeof renderAdminInstruments === 'function') renderAdminInstruments();
  // แสดง/จัดการนักเรียน (admin)
  if (typeof renderAdminUsers === 'function') renderAdminUsers();
  // แสดงประวัติการยืม-คืนทั้งหมด (admin)
  if (typeof renderAdminBorrowLogs === 'function') renderAdminBorrowLogs();
  // แสดงคำขอยืมกลับบ้าน (admin)
  if (typeof renderAdminHomeBorrowRequests === 'function') renderAdminHomeBorrowRequests();
  // แสดงรายชื่อสำหรับมอบเหรียญตรา (admin)
  if (typeof renderAdminBadgeUsers === 'function') renderAdminBadgeUsers();
});
