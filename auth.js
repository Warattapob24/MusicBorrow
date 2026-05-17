/**
 * auth.js — Authentication Module
 *
 * Responsibilities:
 *   - Login / logout / Google OAuth / password reset
 *   - User profile fetch (getUserProfile)
 *   - currentUser state management
 *   - Push Notification Permissions
 */

import { supabase } from './config.js';
import { pushApi } from './api.js';

// ─────────────────────────────────────────────
// State
// ─────────────────────────────────────────────
export let currentUser = null;

export function setCurrentUser(user) {
    currentUser = user;
    localStorage.setItem('cached_user_data', JSON.stringify(user));
}
export function getCurrentUser() {
    if (!currentUser) {
        const cached = localStorage.getItem('cached_user_data');
        if (cached) currentUser = JSON.parse(cached);
    }
    return currentUser;
}

// ─────────────────────────────────────────────
// Login & Registration & OAuth
// ─────────────────────────────────────────────
export async function login(email, password) {
    try {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        return { error: null };
    } catch (error) {
        return { error };
    }
}

export async function register(formData) {
    try {
        // ตรวจสอบว่าเป็นการกรอกข้อมูลให้สมบูรณ์หลังจาก Google Login หรือไม่
        const isOAuth = formData.get('isOAuth') === 'true';
        const userIdFromForm = formData.get('userId');

        // 🛡️ Security: ดึง auth.uid() จาก session จริง — กัน formData spoof
        // OAuth flow: ผู้ใช้ login Google แล้ว → session มีอยู่ → ดึง auth.uid() ได้
        // Email flow: ยังไม่มี session → จะ upload ภายหลังตอน login ครั้งแรก
        const { data: { user: authUser } } = await supabase.auth.getUser();
        const effectiveUserId = authUser?.id || userIdFromForm;

        let profileImageUrl = null;
        const imageFile = formData.get('profileimage');

        if (imageFile && imageFile.size > 0 && effectiveUserId) {
            // 📝 Filename ต้องเป็น "<user-uuid>.<ext>" เพื่อผ่าน Storage RLS policy
            //    Policy: auth.uid()::text = split_part(name, '.', 1)
            const fileExt  = imageFile.name.split('.').pop();
            const fileName = `${effectiveUserId}.${fileExt}`;
            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('profile-images')
                .upload(fileName, imageFile, { upsert: true });  // upsert: เผื่อ retry register

            if (uploadError) {
                // ⚠️ Email signup path: ไม่มี session → upload fail → ยังให้ register ต่อได้
                //    ผู้ใช้สามารถอัปโหลดรูปทีหลังในหน้า profile
                console.warn('[Register] Profile image upload failed (will skip):', uploadError.message);
            } else {
                profileImageUrl = supabase.storage
                    .from('profile-images')
                    .getPublicUrl(uploadData.path).data.publicUrl;
            }
        } else if (imageFile && imageFile.size > 0 && !effectiveUserId) {
            console.warn('[Register] No session yet — profile image will be uploaded after first login');
        }

        // สร้าง Payload และ Map ชื่อฟิลด์จากฟอร์มให้ตรงกับ Database
        const payload = {
            ...Object.fromEntries(formData.entries()),
            first_name:        formData.get('firstname'),
            last_name:         formData.get('lastname'),
            student_group:     formData.get('group'),
            student_id:        formData.get('studentid'),
            main_instrument:   formData.get('maininstrument'),
            birth_date:        formData.get('birthdate'),
            line_id:           formData.get('lineid'),       
            phone_number:      formData.get('phone'),        
            profile_image_url: profileImageUrl,
        };

        // 🧹 DATA SANITIZATION
        const password = payload.password; // 🟢 ดึงรหัสผ่านแยกเก็บไว้ก่อน
        delete payload.password;           // 🟢 ลบออกจาก payload หลักเพื่อไม่ให้ public.users พัง

        delete payload.firstname;
        delete payload.lastname;
        delete payload.group;
        delete payload.studentid;
        delete payload.maininstrument;
        delete payload.profileimage; 
        delete payload.isOAuth;
        delete payload.userId;
        delete payload.birthdate; 
        delete payload.age;       
        delete payload.lineid;    
        delete payload.phone;     

        if (isOAuth && effectiveUserId) {
            // Flow A: Google Login — ใช้ auth.uid() จาก session (ไม่ใช่จาก formData)
            payload.id = effectiveUserId;
            payload.role = 'student';

            // 🔄 ตรวจ student_id ซ้ำก่อน insert — ถ้าซ้ำ → สร้าง recovery request แทน
            if (payload.student_id) {
                const { data: chk } = await supabase.rpc('check_student_id_taken', {
                    p_student_id: payload.student_id
                });
                const row = Array.isArray(chk) ? chk[0] : chk;
                if (row?.taken && row?.old_user_id !== effectiveUserId) {
                    // มีบัญชีเดิมอยู่แล้ว → ส่งคำขอกู้คืน
                    // ⚠️ ห้ามใช้ .select().single() ที่นี่ — เพราะ user ไม่มี SELECT permission บน recovery_requests
                    //   (RLS SELECT จำกัดเฉพาะ admin) — จะทำให้ INSERT ... RETURNING fail
                    const { error: recErr } = await supabase
                        .from('account_recovery_requests')
                        .insert({
                            student_id: payload.student_id,
                            old_user_id: row.old_user_id,
                            new_email: payload.email,
                            requested_first_name: payload.first_name,
                            requested_last_name: payload.last_name,
                            requested_phone: payload.phone_number,
                            note: 'submitted via Google OAuth (auth_id=' + effectiveUserId + ')',
                            status: 'pending'
                        });

                    if (recErr) throw recErr;

                    // logout OAuth session — กัน user เห็น dashboard ที่ไม่มี profile
                    try { await supabase.auth.signOut(); } catch (_) {}

                    return {
                        error: null,
                        recovery_request: true,
                        message: 'พบบัญชีเดิมจากรหัสนักเรียนนี้ — ระบบส่งคำขอกู้คืนแล้ว รอแอดมินอนุมัติ'
                    };
                }
            }

            const { error } = await supabase.from('users').insert(payload);
            if (error) throw error;
            return { error: null };

        } else {
            // Flow B: สมัครด้วย Email + Password
            
            // 🟢 เพิ่มการตรวจสอบว่าต้องมีรหัสผ่านเสมอสำหรับ Flow นี้
            if (!password) {
                throw new Error("กรุณากำหนดรหัสผ่านสำหรับการสมัครสมาชิก");
            }

            payload.password = password; 
            
            const { data, error } = await supabase.functions.invoke('sign-up', { body: payload });
            if (error || data?.error) {
                throw error || new Error(data.error.message || 'เกิดข้อผิดพลาดที่ไม่รู้จัก');
            }
            // 🔄 ถ้า student_id ซ้ำ → สร้าง recovery request แทน
            if (data?.recovery_request) {
                return {
                    error: null,
                    recovery_request: true,
                    request_id: data.request_id,
                    message: data.message
                };
            }
            return { error: null };
        }
    } catch (error) {
        return { error };
    }
}

/**
 * ตรวจ student_id ก่อนที่ผู้ใช้จะกรอกฟอร์มทั้งหมด — เพื่อแจ้งล่วงหน้า
 * เรียกจาก main.js หรือ register form ตอน input student_id blur
 */
export async function checkStudentIdTaken(studentId) {
    try {
        if (!studentId || !studentId.trim()) return { taken: false };
        const { data, error } = await supabase.rpc('check_student_id_taken', { p_student_id: studentId.trim() });
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : data;
        return {
            taken: row?.taken || false,
            oldName: row?.old_name || null,
            isDeactivated: row?.is_deactivated || false
        };
    } catch (error) {
        console.warn('[checkStudentIdTaken] error:', error.message);
        return { taken: false };
    }
}

export async function loginWithGoogle() {
    try {
        const { error } = await supabase.auth.signInWithOAuth({ 
            provider: 'google',
            options: {
                // กำหนด redirectTo ให้กลับมาที่ URL ปัจจุบันเสมอ
                redirectTo: window.location.origin + window.location.pathname
            }
        });
        if (error) throw error;
        return { error: null };
    } catch (error) {
        return { error };
    }
}

export async function resetPassword(email) {
    try {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin,
        });
        if (error) throw error;
        return { error: null };
    } catch (error) {
        return { error };
    }
}

export async function logout() {
    try {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        return { error: null };
    } catch (error) {
        return { error };
    }
}

export async function getUserProfile(userId) {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            // 🟢 [FIX] เปลี่ยนจาก .single() เป็น .maybeSingle() เพื่อป้องกัน Error 406 กรณีไม่พบผู้ใช้
            .maybeSingle();

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        return { data: null, error };
    }
}

export function isUserBlocked(profile) {
    return profile?.is_blocked === true;
}

export function initAuth() {}

// ─────────────────────────────────────────────
// Push Notification Permission
// ─────────────────────────────────────────────

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

export async function requestPushPermission(userId, vapidPublicKey) {
    try {
        // ── Pre-flight checks ───────────────────────────────────────────
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            console.warn('[Push] เบราว์เซอร์นี้ไม่รองรับ Push Notification (ServiceWorker/PushManager)');
            return;
        }
        if (!vapidPublicKey) {
            console.error('[Push] VAPID_PUBLIC_KEY ว่างเปล่า — ใส่ใน config.js ก่อน');
            return;
        }
        if (!userId) {
            console.error('[Push] requestPushPermission เรียกโดยไม่มี userId');
            return;
        }

        // iOS Safari: must be installed as PWA (add-to-home-screen) before push works.
        const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches
            || window.navigator?.standalone;
        const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
        if (isIOS && !isStandalone) {
            console.warn('[Push] iOS ต้อง "Add to Home Screen" ก่อน push notification จะทำงาน');
            // ไม่ return เพราะ desktop Safari ก็เป็น iOS UA แต่ทำงานได้
        }

        // ── Permission ──────────────────────────────────────────────────
        let permission = Notification.permission;
        if (permission === 'default') {
            console.info('[Push] ขออนุญาตจากผู้ใช้...');
            permission = await Notification.requestPermission();
        }
        if (permission !== 'granted') {
            console.info('[Push] ผู้ใช้ปฏิเสธการรับการแจ้งเตือน (permission =', permission, ')');
            return;
        }

        // ── ServiceWorker ──────────────────────────────────────────────
        const registration = await navigator.serviceWorker.ready;
        if (!registration?.pushManager) {
            console.error('[Push] ServiceWorker registration ไม่มี pushManager');
            return;
        }

        // ── Reuse existing subscription if it has the same VAPID key ───
        let subscription = await registration.pushManager.getSubscription();
        if (subscription) {
            try {
                const currentKey = btoa(String.fromCharCode(...new Uint8Array(subscription.options.applicationServerKey)));
                const targetKey = btoa(String.fromCharCode(...urlBase64ToUint8Array(vapidPublicKey)));
                if (currentKey !== targetKey) {
                    console.info('[Push] VAPID key เปลี่ยน — un-subscribe เก่า แล้ว subscribe ใหม่');
                    await subscription.unsubscribe();
                    subscription = null;
                }
            } catch (e) {
                console.warn('[Push] เปรียบเทียบ VAPID key ล้มเหลว — re-subscribe เพื่อความปลอดภัย:', e?.message);
                try { await subscription.unsubscribe(); } catch (_) {}
                subscription = null;
            }
        }

        // ── Subscribe ──────────────────────────────────────────────────
        if (!subscription) {
            console.info('[Push] เริ่ม subscribe pushManager...');
            const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: convertedVapidKey,
            });
            console.info('[Push] subscribe สำเร็จ — endpoint:', subscription.endpoint?.slice(0, 60), '...');
        } else {
            console.info('[Push] ใช้ subscription เดิม — endpoint:', subscription.endpoint?.slice(0, 60), '...');
        }

        // ── Save to DB (upsert via RPC) ────────────────────────────────
        const { error } = await pushApi.saveSubscription(userId, subscription);
        if (error) {
            console.error('[Push] บันทึก subscription ลง DB ล้มเหลว:', error);
            throw new Error(error.message);
        }
        console.info('[Push] ✅ สมัครรับการแจ้งเตือนและบันทึก DB เรียบร้อย');

    } catch (error) {
        console.error('[Push] กระบวนการขอสิทธิ์แจ้งเตือนล้มเหลว:', error);
    }
}