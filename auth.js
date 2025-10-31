// ในไฟล์ auth.js

if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const messageDiv = document.getElementById('register-error'); // สมมติว่ามี div นี้สำหรับแสดง error
        messageDiv.textContent = 'กำลังสมัครสมาชิก...';
        messageDiv.style.color = 'blue';

        // --- 1. รวบรวมข้อมูลจากฟอร์มทั้งหมด ---
        const email = document.getElementById('reg-email').value;
        const password = document.getElementById('reg-password').value;
        const prefix = document.getElementById('reg-prefix').value;
        const firstName = document.getElementById('reg-firstname').value;
        const lastName = document.getElementById('reg-lastname').value;
        const nickname = document.getElementById('reg-nickname').value;
        const birthDate = document.getElementById('reg-birthdate').value;
        const studentId = document.getElementById('reg-studentid').value;
        const classLevel = document.getElementById('reg-class').value;
        const phone = document.getElementById('reg-phone').value;
        const lineId = document.getElementById('reg-lineid').value;
        const studentGroup = document.getElementById('reg-group').value;
        const mainInstrument = document.getElementById('reg-maininstrument').value;

        try {
            // --- 2. สร้างผู้ใช้ในระบบ Auth ก่อน (ไม่ส่ง data ใดๆ) ---
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email: email,
                password: password,
            });

            if (authError) {
                // ถ้าการสร้าง user ในระบบ Auth ล้มเหลว (เช่น อีเมลซ้ำ) ให้โยน Error
                throw authError;
            }
            
            if (!authData.user) {
                throw new Error('ไม่สามารถสร้างข้อมูลผู้ใช้ในระบบ Auth ได้');
            }

            // --- 3. ถ้าสำเร็จ ให้บันทึกข้อมูลโปรไฟล์ลงตาราง 'users' ต่อ ---
            console.log('Auth user created successfully, now inserting profile...');
            
            const { error: profileError } = await supabase
                .from('users')
                .insert({
                    id: authData.user.id, // ใช้ id จาก user ที่เพิ่งสร้าง
                    email: email,
                    role: 'student', // กำหนดค่าเริ่มต้น
                    prefix: prefix,
                    first_name: firstName,
                    last_name: lastName,
                    nickname: nickname,
                    birth_date: birthDate || null,
                    student_id: studentId,
                    class_level: classLevel,
                    phone_number: phone,
                    line_id: lineId,
                    student_group: studentGroup,
                    main_instrument: mainInstrument
                });
            
            if (profileError) {
                // ถ้าการบันทึกโปรไฟล์ล้มเหลว ให้โยน Error
                // นี่คือจุดที่จะบอกเราได้ว่าคอลัมน์ไหนมีปัญหา
                console.error('Profile Insert Error:', profileError);
                throw profileError;
            }

            // --- 4. ถ้าทุกอย่างสำเร็จ ---
            await Swal.fire({
                icon: 'success',
                title: 'สมัครสมาชิกสำเร็จ!',
                text: 'กรุณาตรวจสอบอีเมลเพื่อยืนยันบัญชี แล้วกลับมาล็อกอินอีกครั้ง'
            });
            window.location.href = 'login.html';

        } catch (error) {
            messageDiv.style.color = 'red';
            messageDiv.textContent = `สมัครสมาชิกไม่สำเร็จ: ${error.message}`;
            console.error(error);
        }
    });
}