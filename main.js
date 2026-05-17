/**
 * main.js — Application Entry Point
 * Bootstraps the app, sets up auth listeners, registers the Service Worker,
 * and wires all form event handlers.
 *
 * Architecture:
 *   main.js → auth.js  (login / register / OAuth)
 *   main.js → ui.js    (showDashboardView / showAuthView)
 *   main.js → config.js (supabase client)
 *   main.js → utils.js (addSafeEventListener)
 */

import { login, register, loginWithGoogle, resetPassword, getUserProfile } from './auth.js';
import { supabase } from './config.js';
import { showDashboardView, showAuthView } from './ui.js';
import { addSafeEventListener } from './utils.js';
import { scheduledNotificationsApi } from './api.js';

window.addEventListener('offline', () => {
    document.getElementById('offline-toast')?.classList.add('show');
});
window.addEventListener('online', () => {
    document.getElementById('offline-toast')?.classList.remove('show');
});

// ─────────────────────────────────────────────────────────────────────────────
// 🔔 Scheduled-notification dispatcher — fires opportunistically when any user
// loads the app. Server enforces "don't double-send" via FOR UPDATE SKIP LOCKED
// + last_sent_at cooldown. Client side just throttles its own pokes.
// ─────────────────────────────────────────────────────────────────────────────
const _DISPATCH_THROTTLE_KEY = 'lastNotifDispatchTs';
const _DISPATCH_THROTTLE_MS = 5 * 60 * 1000; // 5 minutes

async function _maybeDispatchNotifications() {
    try {
        const last = parseInt(localStorage.getItem(_DISPATCH_THROTTLE_KEY) || '0', 10);
        if (Date.now() - last < _DISPATCH_THROTTLE_MS) return;
        localStorage.setItem(_DISPATCH_THROTTLE_KEY, String(Date.now()));
        // Run both (independently) — failures in one don't block the other
        scheduledNotificationsApi.dispatch().catch(err =>
            console.warn('[notif] dispatch failed:', err?.message));
        scheduledNotificationsApi.dispatchDueDateReminders().catch(err =>
            console.warn('[notif] due-date reminders failed:', err?.message));
    } catch (e) {
        console.warn('[notif] dispatcher exception:', e?.message);
    }
}

// FIX: Silence Supabase auth-lock contention errors that surface as
// "Uncaught (in promise)" when multiple tabs are open at the same time.
window.addEventListener('unhandledrejection', (event) => {
    const msg = event.reason?.message || String(event.reason || '');
    if (/Lock .*was released because another request stole it/i.test(msg)) {
        event.preventDefault();
        console.warn('[AUTH] Suppressed benign multi-tab lock contention error.');
    }
});

// ─────────────────────────────────────────────
// App Initialisation
// ─────────────────────────────────────────────
// เวอร์ชัน: v4 (ลบ Delay 3 วินาที + แก้บั๊กหน้าจอค้าง/ลูปเด้งออก 100%)

async function initApp() {
    try {
        let firstAuthEventReceived = false;
        let dashboardLaunched = false;
        // 🛡️ ใช้ access_token ของ session ที่ launch ไปแล้ว เป็น key ป้องกัน race
        //   - dedupe SIGNED_IN ซ้ำของ session เดียวกัน
        //   - แต่ถ้า login ใหม่ (token ใหม่) → allow re-launch ได้
        let launchedSessionToken = null;
        // 📍 ตรวจว่า INITIAL_SESSION มาแล้วหรือยัง — SIGNED_IN ก่อน INITIAL_SESSION
        //    เป็น recovery signal จาก Supabase _recoverAndRefresh ไม่ใช่ user login จริง
        //    → ต้องรอ INITIAL_SESSION ก่อนค่อย launch dashboard
        let initialSessionFired = false;

        // 🚨 Safety net: ถ้า launchDashboard ค้าง (เช่น getUserProfile ไม่ตอบ)
        //    หลังครบ 8 วิ ถ้ายังไม่เห็น dashboard ใน DOM → โชว์หน้า login พร้อม alert
        //    ⚠️ ห้ามทำงานถ้าอยู่ในขั้นตอน OAuth onboarding (register form เปิดอยู่)
        const dashboardSafetyTimer = setTimeout(() => {
            const dashSec = document.getElementById('dashboard-section');
            const regForm = document.getElementById('register-form');
            const isOnboarding = regForm && !regForm.classList.contains('hidden') && regForm.dataset.oauth === 'true';
            if (isOnboarding) {
                console.log('[AUTH] Skipping safety net — OAuth onboarding in progress');
                return;
            }
            if (!dashSec || dashSec.classList.contains('hidden')) {
                console.warn('[AUTH] Dashboard hang timeout — showing login as fallback');
                showAuthView();
                launchedSessionToken = null;
                dashboardLaunched = false;
            }
        }, 8000);

        const launchDashboard = async (session, source) => {
            // 🟢 ป้องกัน race เฉพาะ session เดียวกัน (เทียบจาก access_token)
            if (launchedSessionToken === session.access_token) return;
            launchedSessionToken = session.access_token;
            dashboardLaunched = true;

            console.log(`[AUTH] Launching dashboard from ${source}`);

            // 🟢 บันทึก last_seen_at — fire & forget (ไม่รอผล)
            supabase.rpc('touch_user_last_seen').then(() => {}, (err) => {
                console.warn('[AUTH] touch_user_last_seen failed:', err?.message);
            });

            try {
                console.log('[AUTH] step 1: fetching profile...');
                // ⏱️ Timeout getUserProfile ที่ 8 วิ ป้องกันค้าง
                const profilePromise = getUserProfile(session.user.id);
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('getUserProfile timeout (8s)')), 8000)
                );
                const { data: profile, error: profileError } = await Promise.race([profilePromise, timeoutPromise]);
                console.log('[AUTH] step 2: profile result', { hasProfile: !!profile, error: profileError?.message });

                if (profileError) {
                    console.error('[AUTH] Profile fetch failed:', profileError);
                    // กรณี Token มีปัญหาจริงๆ ให้เคลียร์ออก
                    if (profileError.code === 'PGRST301' || profileError.message?.includes('JWT')) {
                        // 🛡️ ตรวจว่า launch นี้ยังเป็น current อยู่หรือไม่
                        //    ถ้า user login ใหม่ระหว่างที่เรากำลังรอ profile → ห้ามแตะ session ใหม่!
                        if (launchedSessionToken !== session.access_token) {
                            console.log('[AUTH] JWT error from stale launch — skipping signOut (newer session active)');
                            return;
                        }
                        launchedSessionToken = null;
                        dashboardLaunched = false;
                        await supabase.auth.signOut();
                        return;
                    }
                    throw profileError;
                }

                // 2. จัดการเรื่อง URL Hash
                if (window.location.hash && window.location.hash.includes('access_token')) {
                    window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
                }
                
                // 🟢 3. กรณี OAuth แล้วยังไม่มีข้อมูล (User ใหม่)
                if (!profile) {
                    console.log('[AUTH] New OAuth user detected. Rendering Onboarding UI...');
                    
                    // ปิด Dashboard และเปิดส่วน Register
                    document.getElementById('dashboard-section')?.classList.add('hidden');
                    const authSec = document.getElementById('auth-section');
                    const loginForm = document.getElementById('login-form');
                    const regForm = document.getElementById('register-form');
                    
                    if (authSec) authSec.classList.remove('hidden');
                    if (loginForm) loginForm.classList.add('hidden');
                    
                    if (regForm) {
                        regForm.classList.remove('hidden');
                        regForm.dataset.oauth = 'true';
                        regForm.dataset.userId = session.user.id;

                        // Pre-fill email จาก Google
                        if (regForm.email) {
                            regForm.email.value = session.user.email;
                            regForm.email.readOnly = true;
                        }

                        // ซ่อนช่องรหัสผ่านเพราะใช้ Google Auth
                        const passwordGroup = regForm.querySelector('.password-group') || regForm.password?.closest('div');
                        if (passwordGroup) {
                            passwordGroup.style.display = 'none';
                            if (regForm.password) regForm.password.removeAttribute('required');
                        }

                        const regTitle = regForm.querySelector('h2');
                        if (regTitle) regTitle.innerText = 'ยืนยันข้อมูลโปรไฟล์ของคุณ';
                    }
                    
                    // ⚠️ สำคัญ: ห้ามตั้ง dashboardLaunched = false ตรงนี้ 
                    // เพราะเราต้องการค้างหน้า Onboarding ไว้ ไม่ให้ Login ซ้อนเข้ามา
                    return;
                }

                // 4. เข้าสู่หน้า Dashboard ปกติ
                console.log('[AUTH] step 3: calling showDashboardView...');
                await showDashboardView(session.user);
                console.log('[AUTH] step 4: dashboard shown ✅');
                clearTimeout(dashboardSafetyTimer);
                _maybeDispatchNotifications();

            } catch (err) {
                console.error('[AUTH] launchDashboard failed:', err);
                // 🛡️ เคลียร์ state เฉพาะถ้า launch นี้ยังเป็น current — ห้ามแตะ session ใหม่
                if (launchedSessionToken === session.access_token) {
                    launchedSessionToken = null;
                    dashboardLaunched = false;
                    showAuthView();
                }
            }
        };

        supabase.auth.onAuthStateChange(async (event, session) => {
            firstAuthEventReceived = true;
            console.log(`[AUTH] event=${event} hasSession=${!!session}`);

            try {
                if (event === 'INITIAL_SESSION') {
                    initialSessionFired = true;
                    // 🟢 4. แก้ปัญหา Bounce: ถ้าไม่มี session แต่เป็น OAuth Callback (มี hash) ให้รอ SIGNED_IN ทำงาน
                    const isOAuthCallback = window.location.hash.includes('access_token');
                    if (!session && !isOAuthCallback) {
                        showAuthView();
                        return;
                    }
                    if (session) await launchDashboard(session, 'INITIAL_SESSION');
                    return;
                }

                if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
                    // ⚠️ ข้าม SIGNED_IN ที่มาก่อน INITIAL_SESSION — นั่นคือ recovery signal
                    //    จาก Supabase _recoverAndRefresh ระหว่าง init, internal state ยังไม่พร้อม
                    //    getUserProfile จะค้าง Web Lock → ให้รอ INITIAL_SESSION ตามมา
                    if (event === 'SIGNED_IN' && !initialSessionFired) {
                        console.log('[AUTH] Skipping early SIGNED_IN (before INITIAL_SESSION) — recovery signal');
                        return;
                    }
                    await launchDashboard(session, event);
                    return;
                }

                if (event === 'SIGNED_OUT') {
                    dashboardLaunched = false;
                    launchedSessionToken = null; // เคลียร์ token guard
                    localStorage.removeItem('cached_user_data'); // ป้องกัน stale cache
                    showAuthView();
                    return;
                }
            } catch (err) {
                console.error('[AUTH] Auth State Change Error:', err);
                showAuthView();
            }
        });

        addInitialEventListeners();
        registerServiceWorker();
        setupTheme();

        setTimeout(() => {
            if (!firstAuthEventReceived) {
                console.warn('[APP] Auth bootstrap timed out — falling back to login.');
                showAuthView();
            }
        }, 10000);

    } catch (error) {
        console.error('[APP] Initialisation failed:', error);
        showAuthView();
    }
}

// ─────────────────────────────────────────────
// Service Worker
// ─────────────────────────────────────────────
function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/sw.js')
        .then(reg => {
            reg.addEventListener('updatefound', () => {
                const newWorker = reg.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        Swal.fire({
                            title: 'อัปเดตระบบ 🚀',
                            text: 'มีระบบเวอร์ชันใหม่พร้อมใช้งาน กรุณากดปุ่มเพื่อรีเฟรชและป้องกันอาการค้าง',
                            icon: 'info',
                            confirmButtonText: 'อัปเดตและรีเฟรช',
                            confirmButtonColor: '#3B82F6',
                            allowOutsideClick: false
                        }).then(() => newWorker.postMessage({ action: 'skipWaiting' }));
                    }
                });
            });
        })
        .catch(err => console.error('[SW] Registration failed:', err));

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) { refreshing = true; window.location.reload(); }
    });

    // Re-subscribe when the SW reports a subscription rotation/expiry
    navigator.serviceWorker.addEventListener('message', async (event) => {
        if (event.data?.type !== 'PUSH_SUBSCRIPTION_LOST') return;
        console.warn('[main] subscription lost — re-subscribing');
        try {
            const { requestPushPermission } = await import('./auth.js');
            const { VAPID_PUBLIC_KEY } = await import('./config.js');
            const { data: { user } } = await supabase.auth.getUser();
            if (user?.id && VAPID_PUBLIC_KEY) {
                await requestPushPermission(user.id, VAPID_PUBLIC_KEY);
            }
        } catch (e) {
            console.error('[main] re-subscribe failed:', e);
        }
    });
}

// ─────────────────────────────────────────────
// Event Listeners
// ─────────────────────────────────────────────
function addInitialEventListeners() {
    // Theme
    addSafeEventListener('#theme-cycle-btn', 'click', () => {
        const themes = ['light', 'dark', 'rainbow'];
        const current = document.documentElement.getAttribute('data-theme') || 'light';
        const next = themes[(themes.indexOf(current) + 1) % themes.length];
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
    });

    // Logout
    addSafeEventListener('#logout-btn', 'click', async () => {
        const { error } = await supabase.auth.signOut();
        if (error) console.error('[AUTH] Sign-out error:', error);
    });

    // Form toggles
    addSafeEventListener('#show-register-link', 'click', (e) => {
        e.preventDefault();
        document.getElementById('login-form')?.classList.add('hidden');
        document.getElementById('register-form')?.classList.remove('hidden');
    });
    addSafeEventListener('#show-login-link', 'click', (e) => {
        e.preventDefault();
        document.getElementById('register-form')?.classList.add('hidden');
        document.getElementById('login-form')?.classList.remove('hidden');
    });

    // Forgot password
    addSafeEventListener('#forgot-password-link', 'click', (e) => {
        e.preventDefault();
        handleForgotPassword();
    });

    // Google OAuth
    addSafeEventListener('#google-login-btn', 'click', () => loginWithGoogle());

    // Login form
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        addSafeEventListener(loginForm, 'submit', async (e) => {
            e.preventDefault();
            const btn = loginForm.querySelector('button[type="submit"]');
            btn?.setAttribute('aria-busy', 'true');
            try {
                const { error } = await login(loginForm.email.value, loginForm.password.value);
                if (error) await Swal.fire('เข้าสู่ระบบล้มเหลว', error.message, 'error');
            } catch (err) {
                await Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
            } finally {
                btn?.removeAttribute('aria-busy');
            }
        });
    }

    // Register form (v2 - Unified Form Logic)
    const registerForm = document.getElementById('register-form');
    if (registerForm) {
        addSafeEventListener(registerForm, 'submit', async (e) => {
            e.preventDefault();
            const btn = registerForm.querySelector('button[type="submit"]');
            btn?.setAttribute('aria-busy', 'true');
            
            try {
                const formData = new FormData(registerForm);
                
                // ตรวจสอบและแนบตัวแปรจาก Dataset ไปให้ auth.js ตัดสินใจ (สำหรับ Google Auth)
                if (registerForm.dataset.oauth === 'true') {
                    formData.append('isOAuth', 'true');
                    formData.append('userId', registerForm.dataset.userId);
                }

                Swal.showLoading();

                const result = await register(formData);

                if (result.error) {
                    await Swal.fire('เกิดข้อผิดพลาด', result.error.message, 'error');
                } else if (result.recovery_request) {
                    // 🔄 Student ID ซ้ำ → ส่งคำขอกู้คืนแล้ว
                    await Swal.fire({
                        icon: 'info',
                        title: '📬 ส่งคำขอกู้คืนบัญชีเรียบร้อย',
                        html: `
                            <p style="text-align:left;">${result.message || 'รหัสนักเรียนของคุณเคยถูกใช้สมัครมาก่อน'}</p>
                            <hr>
                            <p style="text-align:left; font-size: 0.9rem;">
                                <b>ขั้นตอนถัดไป:</b><br>
                                1. แอดมินจะตรวจสอบคำขอของคุณ<br>
                                2. เมื่อได้รับการอนุมัติ <b>อีเมล ${formData.get('email')}</b> จะได้รับลิงก์ตั้งรหัสผ่านใหม่<br>
                                3. ตั้งรหัสผ่านใหม่ → เข้าสู่บัญชีเดิมพร้อมข้อมูลครบ
                            </p>
                            <p style="font-size: 0.85rem; color: #64748b;">หากต้องการเร่งด่วน กรุณาติดต่อครู</p>
                        `,
                        confirmButtonText: 'รับทราบ'
                    });
                    window.location.reload();
                } else {
                    await Swal.fire('สำเร็จ!', 'ลงทะเบียนบัญชีเรียบร้อย ระบบจะพาคุณเข้าสู่หน้าหลัก', 'success');
                    window.location.reload();
                }
            } catch (err) {
                await Swal.fire('สมัครไม่สำเร็จ', err.message, 'error');
            } finally {
                btn?.removeAttribute('aria-busy');
            }
        });

        // Age calculation
        addSafeEventListener('#reg-birthdate', 'change', (e) => {
            const ageInput = registerForm.querySelector('input[name="age"]');
            if (!ageInput) return;
            if (e.target.value) {
                const birth = new Date(e.target.value);
                const today = new Date();
                let age = today.getFullYear() - birth.getFullYear();
                const hadBirthday =
                    today.getMonth() > birth.getMonth() ||
                    (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate());
                if (!hadBirthday) age--;
                ageInput.value = age;
            } else {
                ageInput.value = '';
            }
        });

        // Student-group conditional fields
        addSafeEventListener('#reg-group', 'change', (e) => {
            const group = e.target.value;
            document.getElementById('student-info-group')
                ?.classList.toggle('hidden', !(group === 'student' || group === 'club'));
            document.getElementById('club-info-group')
                ?.classList.toggle('hidden', group !== 'club');
        });
    }
}

// ─────────────────────────────────────────────
// Theme
// ─────────────────────────────────────────────
function setupTheme() {
    document.documentElement.setAttribute(
        'data-theme',
        localStorage.getItem('theme') || 'light'
    );
}

// ─────────────────────────────────────────────
// Forgot Password
// ─────────────────────────────────────────────
async function handleForgotPassword() {
    const { value: email } = await Swal.fire({
        title: 'ตั้งรหัสผ่านใหม่',
        input: 'email',
        inputLabel: 'กรุณากรอกอีเมลของคุณเพื่อรับลิงก์สำหรับตั้งรหัสผ่านใหม่',
        inputPlaceholder: 'youremail@example.com',
        showCancelButton: true,
        confirmButtonText: 'ส่งอีเมล',
        cancelButtonText: 'ยกเลิก',
    });
    if (!email) return;
    Swal.showLoading();
    try {
        const { error } = await resetPassword(email);
        if (error) throw error;
        await Swal.fire('สำเร็จ!', 'โปรดตรวจสอบอีเมลของคุณสำหรับลิงก์ตั้งรหัสผ่านใหม่', 'success');
    } catch (error) {
        await Swal.fire('ผิดพลาด!', error.message, 'error');
    }
}

// Bootstrap when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}