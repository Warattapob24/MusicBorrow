/**
 * UI Module
 * Handles all user interface operations including view rendering and DOM manipulation
 */

import { currentUser, getUserProfile, isUserBlocked, setCurrentUser, getCurrentUser, requestPushPermission } from './auth.js';
import { 
    borrow, borrowExt, repair, usersExt, authApi, instrumentsExt, realtimeApi,
    badgesExt, knowledgeExt, rankingsExt, gamesExt, notificationsExt 
} from './api.js';
import { ICONS, VAPID_PUBLIC_KEY } from './config.js';
import { escapeHtml, translateGroup, parseMediaUrl } from './utils.js';
import { initAdminDashboard, destroyAdminDashboard } from './admin-dashboard.js';
import { initStudentDashboard, destroyStudentDashboard } from './student-dashboard.js';

/**
 * Global variables for UI state
 */
export let borrowTimerInterval = null;
export let notificationInterval = null;
export let availableInstruments = [];
export let myBorrowedItems = [];

// ─────────────────────────────────────────────────────────────────────────────
// 🛡️ GLOBAL SOFT BLOCK GUARD (Interceptor) — BLACKLIST mode
// ─────────────────────────────────────────────────────────────────────────────
/*
  Soft-block flow (per user spec):
    ✅ user can navigate menus, scroll feeds, watch clips, use practice tools
    ✅ XP gain is paused server-side (DB trigger + 24h cooldown)
    ❌ user cannot do "write" actions — borrow, return, submit clip, edit
       profile, etc. — those buttons get a `.sb-deny` class so this guard
       blocks them with a friendly popup.
*/
const SOFT_BLOCK_DENY_SELECTORS = [
    '.sb-deny',                          // any element explicitly marked
    '.borrow-btn',                       // borrow an instrument
    '.return-btn',                       // return an instrument
    '#return-selected-btn',              // bulk return
    '#scan-qr-btn',                      // QR scan launcher (if present)
    '#universal-scan-btn',               // QR scan
    '#lf-submit-btn',                    // share-clip in learning feed
    '[data-borrow-action]',              // generic write-action attribute
    '[data-write-action]',
    '#edit-profile-btn',                 // profile edit
    '#suggest-link-btn',                 // legacy suggest link
];
const SOFT_BLOCK_DENY_SEL = SOFT_BLOCK_DENY_SELECTORS.join(',');

function _showSoftBlockReason() {
    const reason = currentUser?.block_reason || 'สิทธิ์ของคุณถูกจำกัดชั่วคราว กรุณาติดต่อแอดมิน';
    Swal.fire({
        title: 'บัญชีถูกจำกัดการใช้งาน',
        html: `<div style="text-align:left;">
            <p style="margin:0 0 0.5rem 0;"><strong>เหตุผล:</strong></p>
            <p style="margin:0; padding:0.75rem; background:#fef3c7; border-radius:8px; color:#78350f;">${escapeHtml(reason)}</p>
            <p style="margin:0.75rem 0 0 0; font-size:0.85rem; color:#64748b;">
                คุณยังใช้งานเมนู / เครื่องมือซ้อม / ดูคลิปได้ตามปกติ — แต่ห้ามยืม / ส่งคลิป / แก้ไขข้อมูลจนกว่าจะปลดล็อก
            </p>
        </div>`,
        icon: 'warning',
        confirmButtonText: 'รับทราบ',
        confirmButtonColor: '#F59E0B'
    });
}

document.addEventListener('click', (e) => {
    if (!currentUser || !currentUser.is_blocked) return;

    // Block only if the click target is in the deny list
    const denied = e.target.closest(SOFT_BLOCK_DENY_SEL);
    if (!denied) return;

    e.stopPropagation();
    e.preventDefault();
    _showSoftBlockReason();
}, true);

/* Forms are submit only via blocked buttons — but guard Enter-key submits too */
document.addEventListener('submit', (e) => {
    if (!currentUser || !currentUser.is_blocked) return;
    // Allow submit on forms NOT containing a deny target
    const form = e.target;
    if (form.matches?.(SOFT_BLOCK_DENY_SEL) || form.querySelector?.(SOFT_BLOCK_DENY_SEL)) {
        e.stopPropagation();
        e.preventDefault();
        _showSoftBlockReason();
    }
}, true);

// ─────────────────────────────────────────────────────────────────────────────
// 🚧 Soft Block UI — sticky banner + body attribute that disables interactions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply visual + interaction guard for a soft-blocked user.
 * - Adds `data-soft-blocked="true"` on <body> so styles.css disables clicks
 * - Renders / refreshes a sticky red banner showing the reason and the
 *   remaining EXP-pause window (if any).
 */
export function applySoftBlockUI(profile) {
    document.body.setAttribute('data-soft-blocked', 'true');

    let banner = document.getElementById('sb-banner');
    const reason = profile?.block_reason || 'สิทธิ์ของคุณถูกจำกัดการใช้งานชั่วคราว';
    let xpNote = '';
    if (profile?.exp_blocked_until) {
        const until = new Date(profile.exp_blocked_until);
        const ms = until.getTime() - Date.now();
        if (ms > 0) {
            const hours = Math.ceil(ms / 3_600_000);
            xpNote = ` · หยุดรับ EXP อีก ~${hours} ชั่วโมง (ยังนับเวลาซ้อมตามปกติ)`;
        }
    }

    const html = `
        🚫 <strong>บัญชีของคุณถูกจำกัดการใช้งาน</strong>
        <button class="sb-banner-btn" id="sb-banner-show-reason">ดูเหตุผล</button>
        <small>เหตุผล: ${escapeHtml(reason)}${xpNote}</small>
    `;

    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'sb-banner';
        banner.className = 'sb-banner';
        document.body.prepend(banner);
    }
    banner.innerHTML = html;

    document.getElementById('sb-banner-show-reason')?.addEventListener('click', (e) => {
        e.stopPropagation();
        Swal.fire({
            icon: 'warning',
            title: 'บัญชีถูกจำกัดการใช้งาน',
            html: `<div style="text-align:left;">
                <p style="margin:0 0 0.5rem 0;"><strong>เหตุผล:</strong></p>
                <p style="margin:0; padding:0.75rem; background:#fef3c7; border-radius:8px; color:#78350f;">${escapeHtml(reason)}</p>
                ${xpNote ? `<p style="margin:0.75rem 0 0 0; font-size:0.85rem; color:#64748b;">${escapeHtml(xpNote.trim())}</p>` : ''}
                <p style="margin:0.75rem 0 0 0; font-size:0.85rem; color:#64748b;">หากคิดว่าเป็นความเข้าใจผิด กรุณาติดต่อแอดมิน</p>
            </div>`,
            confirmButtonText: 'รับทราบ',
            confirmButtonColor: '#F59E0B'
        });
    });
}

export function removeSoftBlockUI() {
    document.body.removeAttribute('data-soft-blocked');
    document.getElementById('sb-banner')?.remove();
}

/**
 * Show a softer "EXP cooldown" banner for users who were JUST unblocked but
 * are still inside the 24-hour no-XP window. They can use everything normally
 * — borrow / return / submit clips — but XP gain stays frozen until the
 * timer runs out.
 */
export function applyExpCooldownBanner(profile) {
    document.body.removeAttribute('data-soft-blocked'); // not soft-blocked anymore
    let banner = document.getElementById('sb-banner');
    const until = new Date(profile.exp_blocked_until);
    const ms = until.getTime() - Date.now();
    const hours = Math.max(0, Math.ceil(ms / 3_600_000));

    const html = `
        ⏳ <strong>กำลังหยุดรับ EXP</strong> · เหลืออีกประมาณ ${hours} ชั่วโมง
        <small>คุณใช้งานทุกฟังก์ชันได้ตามปกติ — เวลาซ้อมยังนับ แต่ XP ยังไม่เพิ่มจนครบเวลา</small>
    `;

    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'sb-banner';
        banner.className = 'sb-banner';
        banner.style.background = 'linear-gradient(90deg, #f59e0b, #fbbf24)';
        document.body.prepend(banner);
    } else {
        banner.style.background = 'linear-gradient(90deg, #f59e0b, #fbbf24)';
    }
    banner.innerHTML = html;

    // Auto-dismiss when the cooldown actually expires
    if (ms > 0 && ms < 25 * 3_600_000) {
        setTimeout(() => removeSoftBlockUI(), ms + 1000);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 🚀 Event Delegation สำหรับ UI ฝั่ง Dashboard
// ─────────────────────────────────────────────────────────────────────────────
document.addEventListener('click', async (e) => {
    const returnBtn = e.target.closest('.return-btn');
    if (returnBtn && document.getElementById('borrowed-list')?.contains(returnBtn)) {
        const id = returnBtn.dataset.id;
        const name = returnBtn.dataset.name;
        handleReturnInstrument(id, name, returnBtn);
    }

    const returnSelectedBtn = e.target.closest('#return-selected-btn');
    if (returnSelectedBtn && document.getElementById('borrowed-list')?.contains(returnSelectedBtn)) {
        const listEl = document.getElementById('borrowed-list');
        const checkedBoxes = Array.from(listEl.querySelectorAll('.return-checkbox:checked'));
        if (checkedBoxes.length === 0) {
            return Swal.fire('แจ้งเตือน', 'กรุณาเลือกเครื่องดนตรีที่ต้องการคืนอย่างน้อย 1 ชิ้น', 'warning');
        }

        const { isConfirmed, isDenied } = await Swal.fire({
            title: `คืนเครื่องดนตรี ${checkedBoxes.length} รายการ?`,
            text: "ยืนยันว่าเครื่องดนตรีทั้งหมดอยู่ในสภาพดี และไม่มีชิ้นใดชำรุดใช่หรือไม่?",
            icon: 'question', showDenyButton: true, showCancelButton: true,
            confirmButtonText: '✅ สภาพดีทั้งหมด, คืนเลย',
            denyButtonText: '❌ มีบางชิ้นชำรุด', cancelButtonText: 'ยกเลิก'
        });

        if (isConfirmed) {
            Swal.showLoading();
            try {
                for (const box of checkedBoxes) {
                    await borrowExt.returnInstrument(Number(box.value), currentUser.id);
                }
                await Swal.fire('สำเร็จ!', 'คืนเครื่องดนตรีทั้งหมดเรียบร้อยแล้ว', 'success');
                if (typeof refreshOnReturn === 'function') await refreshOnReturn();
            } catch (err) {
                Swal.fire('ผิดพลาด', err.message, 'error');
            }
        } else if (isDenied) {
            Swal.fire('แจ้งเตือน', 'กรุณากดปุ่ม "คืน" ที่เครื่องดนตรีทีละรายการ เพื่อกดแจ้งซ่อมเฉพาะเครื่องที่มีปัญหา', 'info');
        }
    }
});

document.addEventListener('change', (e) => {
    const selectAllCb = e.target.closest('#select-all-checkbox');
    if (selectAllCb && document.getElementById('borrowed-list')?.contains(selectAllCb)) {
        const isChecked = selectAllCb.checked;
        document.getElementById('borrowed-list').querySelectorAll('.return-checkbox:not([disabled])').forEach(cb => {
            cb.checked = isChecked;
        });
    }
});

export function showAuthView() {
    if (borrowTimerInterval) {
        clearInterval(borrowTimerInterval);
        borrowTimerInterval = null;
    }
    if (notificationInterval) {
        clearInterval(notificationInterval);
        notificationInterval = null;
    }

    const authSection = document.getElementById('auth-section');
    const dashboardSection = document.getElementById('dashboard-section');

    if (authSection) authSection.classList.remove('hidden');
    if (dashboardSection) dashboardSection.classList.add('hidden');

    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');

    if (loginForm) {
        loginForm.reset();
        loginForm.classList.remove('hidden');
    }
    if (registerForm) {
        registerForm.reset();
        registerForm.classList.add('hidden');
    }

    destroyAdminDashboard();
    destroyStudentDashboard();
}

// [เพิ่มฟังก์ชันนี้เข้าไปสำหรับจัดเตรียมหน้า Register หลักให้รองรับ Google OAuth]
export function prepareUnifiedRegisterForm(authUser) {
    const authSection = document.getElementById('auth-section');
    const dashboardSection = document.getElementById('dashboard-section');
    
    if (authSection) authSection.classList.remove('hidden');
    if (dashboardSection) dashboardSection.classList.add('hidden');

    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');

    if (loginForm) loginForm.classList.add('hidden');
    if (registerForm) {
        registerForm.classList.remove('hidden');
        registerForm.reset();

        // 1. ตั้งค่าสถานะว่านี่คือการสมัครต่อยอดจาก OAuth
        registerForm.dataset.oauth = 'true';
        registerForm.dataset.userId = authUser.id;

        // 2. Prefill อีเมล และตั้งเป็น Readonly
        const emailInput = registerForm.querySelector('input[name="email"]');
        if (emailInput) {
            emailInput.value = authUser.email || '';
            emailInput.setAttribute('readonly', 'true');
            emailInput.style.backgroundColor = 'var(--pico-muted-border-color)';
        }

        // 3. ซ่อนฟิลด์รหัสผ่าน และยกเลิก required
        const passwordInput = registerForm.querySelector('input[name="password"]');
        if (passwordInput) {
            passwordInput.removeAttribute('required');
            passwordInput.style.display = 'none';
        }

        // 4. เปลี่ยนข้อความปุ่ม และซ่อนลิงก์ที่ไม่จำเป็น
        const submitBtn = registerForm.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.textContent = 'บันทึกข้อมูลเพื่อเริ่มใช้งาน';

        const showLoginLink = document.getElementById('show-login-link');
        if (showLoginLink) showLoginLink.style.display = 'none';
    }
}

export function checkPendingScanOnLoad() {
    const pendingScanId = localStorage.getItem('pendingScanId');
    if (pendingScanId) {
        localStorage.removeItem('pendingScanId');
        setTimeout(() => {
            processQrScan(pendingScanId);
        }, 500);
    }
}

let _dashboardRequestId = 0;

export async function showDashboardView(user) {
    const myRequestId = ++_dashboardRequestId;
    const isStale = () => myRequestId !== _dashboardRequestId;

    const dashboardSection = document.getElementById('dashboard-section');
    if (currentUser && currentUser.id === user.id && !dashboardSection.classList.contains('hidden')) {
        const pendingScanId = sessionStorage.getItem('pendingScanId');
        if (pendingScanId) {
            sessionStorage.removeItem('pendingScanId');
            await processQrScan(pendingScanId);
        }
        return;
    }

    const authSection = document.getElementById('auth-section');
    if (authSection) authSection.classList.add('hidden');
    if (dashboardSection) dashboardSection.classList.remove('hidden');

    const dashboardContent = document.getElementById('dashboard-content');
    if (dashboardContent) {
        dashboardContent.innerHTML = `
            <article style="text-align: center; padding: 2rem;" aria-busy="true">
                <p id="dash-progress-msg" style="color: var(--text-main, var(--pico-color)); margin: 0;">กำลังโหลดข้อมูล...</p>
            </article>`;
    }

    const progressTimers = [
        setTimeout(() => {
            if (isStale()) return;
            const el = document.getElementById('dash-progress-msg');
            if (el) el.textContent = 'กำลังเชื่อมต่อเซิร์ฟเวอร์...';
        }, 6000),
        setTimeout(() => {
            if (isStale()) return;
            const el = document.getElementById('dash-progress-msg');
            if (el) el.textContent = 'การเชื่อมต่อช้ากว่าปกติ กรุณารอสักครู่...';
        }, 20000),
    ];
    const clearProgressTimers = () => progressTimers.forEach(clearTimeout);

    try {
        const result = await Promise.race([
            getUserProfile(user.id),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('PROFILE_FETCH_TIMEOUT')), 45000)
            )
        ]);

        clearProgressTimers();

        if (isStale()) return;

        const { data: profile, error } = result;

        if (error && error.code === 'PGRST116') {
            prepareUnifiedRegisterForm(user);
            return;
        }

        if (error) throw error;

        // 🟢 Block-state UI:
        //    - blocked       → soft-block (deny write actions, show banner)
        //    - cooldown only → unblocked but still in 24h XP pause window
        //    - normal        → no banner
        const expBlockedActive = profile.exp_blocked_until
            ? new Date(profile.exp_blocked_until).getTime() > Date.now()
            : false;
        if (isUserBlocked(profile)) {
            applySoftBlockUI(profile);
        } else if (expBlockedActive) {
            applyExpCooldownBanner(profile);
        } else {
            removeSoftBlockUI();
        }

        if (profile.needs_profile_update) {
            const dc = document.getElementById('dashboard-content');
            if (dc) dc.innerHTML = '';
            showForcedProfileUpdateModal({ ...user, ...profile });
            return;
        }

        setCurrentUser({ ...user, ...profile });

        if (getCurrentUser()?.role === 'admin') {
            await renderAdminView();
        } else {
            await renderStudentView(getCurrentUser());
        }

        if (VAPID_PUBLIC_KEY) {
             requestPushPermission(user.id, VAPID_PUBLIC_KEY);
        }

        const pendingScanId = sessionStorage.getItem('pendingScanId');
        if (pendingScanId) {
            sessionStorage.removeItem('pendingScanId');
            await processQrScan(pendingScanId);
        }

    } catch (error) {
        clearProgressTimers();
        if (isStale()) return;

        const isLockStolen = /Lock .*was released because another request stole it/i.test(error?.message || '');
        if (isLockStolen) {
            const dashContent = document.getElementById('dashboard-content');
            if (dashContent) {
                dashContent.innerHTML = `<article style="text-align:center; padding: 2rem;">
                    <p>กำลังเชื่อมต่อใหม่...</p>
                </article>`;
            }
            setTimeout(() => showDashboardView(user).catch(e => console.error('[UI] Retry failed:', e)), 1500);
            return;
        }

        const dashContent = document.getElementById('dashboard-content');
        if (dashContent) {
            const isTimeout = error?.message === 'PROFILE_FETCH_TIMEOUT';
            const friendlyMsg = isTimeout
                ? 'การเชื่อมต่อกับเซิร์ฟเวอร์ใช้เวลานานเกินไป กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง'
                : error.message;
            dashContent.innerHTML = `
                <article style="text-align:center; padding: 2rem;">
                    <h4 style="color:var(--pico-del-color);">⚠️ โหลดข้อมูลไม่สำเร็จ</h4>
                    <p>${escapeHtml(friendlyMsg)}</p>
                    <button onclick="window.location.reload()" class="contrast">
                        🔄 ลองอีกครั้ง
                    </button>
                </article>`;
        }
    }
}

async function showForcedProfileUpdateModal(userData) {
    const { value: formValues } = await Swal.fire({
        title: '🎓 เริ่มต้นปีการศึกษาใหม่!',
        html: `
            <div style="text-align:left; margin-top:1rem;">
                <p style="font-size:0.9rem; color:var(--pico-muted-color);">
                    ระบบได้ทำการรีเซ็ตสถิติเวลาซ้อมทั้งหมด กรุณาตรวจสอบและ <strong>อัปเดตระดับชั้นเรียนของคุณ</strong> สำหรับปีการศึกษาใหม่เพื่อเริ่มใช้งาน
                </p>
                
                <div class="grid">
                    <div>
                        <label style="font-size:0.85rem; font-weight:bold;">ชื่อจริง</label>
                        <input id="swal-fname" class="swal2-input" style="margin: 0.5rem 0 1rem 0;" value="${escapeHtml(userData.first_name || '')}">
                    </div>
                    <div>
                        <label style="font-size:0.85rem; font-weight:bold;">นามสกุล</label>
                        <input id="swal-lname" class="swal2-input" style="margin: 0.5rem 0 1rem 0;" value="${escapeHtml(userData.last_name || '')}">
                    </div>
                </div>

                <div class="grid">
                    <div>
                        <label style="font-size:0.85rem; font-weight:bold;">กลุ่มผู้ใช้</label>
                        <select id="swal-group" class="swal2-select" style="margin: 0.5rem 0; width: 100%;">
                            <option value="student" ${userData.student_group === 'student' ? 'selected' : ''}>นักเรียนทั่วไป</option>
                            <option value="club" ${userData.student_group === 'club' ? 'selected' : ''}>สมาชิกชุมนุม</option>
                            <option value="teacher" ${userData.student_group === 'teacher' ? 'selected' : ''}>ครูอาจารย์</option>
                            <option value="guest" ${userData.student_group === 'guest' ? 'selected' : ''}>บุคคลทั่วไป</option>
                        </select>
                    </div>
                    <div>
                        <label style="font-size:0.85rem; font-weight:bold;">ระดับชั้น/ห้อง ปัจจุบัน</label>
                        <input id="swal-classlevel" class="swal2-input" style="margin: 0.5rem 0 1rem 0;" value="${escapeHtml(userData.class_level || '')}" placeholder="เช่น ม.4/1">
                    </div>
                </div>
            </div>
        `,
        width: '600px',
        focusConfirm: false,
        allowOutsideClick: false,
        allowEscapeKey: false, 
        confirmButtonText: '💾 บันทึกและเข้าสู่ระบบ',
        confirmButtonColor: '#3B82F6',
        preConfirm: () => {
            const fname = document.getElementById('swal-fname').value.trim();
            const lname = document.getElementById('swal-lname').value.trim();
            const group = document.getElementById('swal-group').value;
            const classLevel = document.getElementById('swal-classlevel').value.trim();
            
            if (!fname || !lname || !group) {
                Swal.showValidationMessage('⚠️ กรุณากรอกชื่อ นามสกุล และกลุ่มผู้ใช้ให้ครบถ้วน');
                return false;
            }
            return { 
                first_name: fname, 
                last_name: lname, 
                student_group: group,
                class_level: classLevel || null
            };
        }
    });

    if (formValues) {
        Swal.showLoading();
        const { error } = await usersExt.updateProfile(userData.id, {
            first_name: formValues.first_name,
            last_name: formValues.last_name,
            student_group: formValues.student_group,
            class_level: formValues.class_level,
            needs_profile_update: false
        });

        if (error) {
            Swal.fire('ข้อผิดพลาด', 'ไม่สามารถบันทึกข้อมูลได้: ' + error.message, 'error').then(() => {
                showForcedProfileUpdateModal(userData);
            });
        } else {
            Swal.fire({
                title: 'สำเร็จ! 🎉',
                text: 'อัปเดตข้อมูลปีการศึกษาใหม่เรียบร้อย ขอให้สนุกกับการฝึกซ้อมครับ',
                icon: 'success',
                confirmButtonText: 'ไปที่หน้าหลัก'
            }).then(() => {
                window.location.reload();
            });
        }
    }
}

export async function renderStudentView(user) {
    await initStudentDashboard(document.getElementById('dashboard-content'), user);
}

export async function renderAdminView() {
    const dashboardContent = document.getElementById('dashboard-content');
    if (!dashboardContent) return;

    dashboardContent.innerHTML = '<div id="oad-mount" style="margin:-1rem;overflow:hidden;border-radius:var(--pico-border-radius);"></div>';
    const mount = document.getElementById('oad-mount');

    await initAdminDashboard(mount);
}

export async function refreshUserProfileHeader() {
    const wrapper = document.getElementById('user-info-wrapper');
    if (!wrapper || !currentUser) return;

    const profileImage = currentUser.profile_image_url || 'assets/default-avatar.png';
    const groupText = typeof translateGroup === 'function' ? translateGroup(currentUser.student_group) : currentUser.student_group;
    const fullName = `${currentUser.prefix || ''}${currentUser.first_name || ''} ${currentUser.last_name || ''}`.trim() || 'ผู้ใช้งานระบบ';
    
    let hours = 0; let mins = 0;
    if (currentUser.total_practice_minutes) {
        hours = Math.floor(currentUser.total_practice_minutes / 60);
        mins = currentUser.total_practice_minutes % 60;
    }
    const timeDisplay = hours > 0 ? `${hours} ชม. ${mins} น.` : `${mins} นาที`;

    const scanIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/></svg>`;
    const bellIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>`;
    const editIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;

    wrapper.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; width: 100%;">
            <div style="display: flex; gap: 1rem; align-items: center;">
                <img src="${escapeHtml(profileImage)}" onerror="this.onerror=null; this.src='assets/default-avatar.png';" alt="Profile" style="width: 65px; height: 65px; border-radius: 50%; object-fit: cover; border: 3px solid var(--primary-blue); padding: 2px; background: var(--card-bg);">
                <div>
                    <h3 style="margin: 0 0 0.2rem 0; font-size: 1.2rem; font-weight: 700; color: var(--text-main);">${escapeHtml(fullName)}</h3>
                    <span style="font-size: 0.75rem; background: var(--primary-blue); color: white; padding: 0.15rem 0.6rem; border-radius: 12px; font-weight: 500;">
                        ${escapeHtml(groupText)}
                    </span>
                    <div style="font-size: 0.75rem; color: #10B981; margin-top: 0.3rem; font-weight: 700;">
                        🔥 ซ้อมต่อเนื่อง: ${currentUser.practice_streak || 0} วัน
                    </div>
                </div>
            </div>
            
            <div style="display: flex; gap: 0.5rem;">
                <button id="edit-profile-btn" class="icon-button-circle secondary outline" title="แก้ไขข้อมูล">${editIcon}</button>
                <button id="universal-scan-btn" class="icon-button-circle primary" title="สแกน QR">${scanIcon}</button>
                <button id="notification-bell-btn" class="icon-button-circle secondary outline" title="การแจ้งเตือน" style="position: relative;">
                    ${bellIcon}<span id="notification-badge" class="hidden">!</span>
                </button>
            </div>
        </div>

        <div class="compact-stats-wrapper">
            <div class="compact-stat-card">
                <span class="compact-stat-title">⏱️ เวลาซ้อม</span>
                <span class="compact-stat-score">${timeDisplay}</span>
                <span class="compact-stat-rank" id="hdr-prac-rank">ดึงข้อมูล...</span>
            </div>
            <div class="compact-stat-card">
                <span class="compact-stat-title">⚔️ Staff Wars</span>
                <span class="compact-stat-score" id="hdr-sw-score">0</span>
                <span class="compact-stat-rank" id="hdr-sw-rank">ดึงข้อมูล...</span>
            </div>
            <div class="compact-stat-card">
                <span class="compact-stat-title">🥁 Rhythm Core</span>
                <span class="compact-stat-score" id="hdr-rc-score">0</span>
                <span class="compact-stat-rank" id="hdr-rc-rank">ดึงข้อมูล...</span>
            </div>
        </div>
    `;

    const editBtn = document.getElementById('edit-profile-btn');
    const notifBtn = document.getElementById('notification-bell-btn');
    const scanBtn = document.getElementById('universal-scan-btn');

    if (editBtn) editBtn.addEventListener('click', handleEditProfile);
    if (notifBtn) notifBtn.addEventListener('click', renderNotificationCenter);
    if (scanBtn) scanBtn.addEventListener('click', handleUniversalScan);
    if (typeof updateNotificationBadge === 'function') updateNotificationBadge();

    try {
        const { data: pData } = await rankingsExt.getClubRanking(currentUser.id);
        const myPrac = pData?.find(r => r.is_current_user || r.user_id === currentUser.id);
        const pRankEl = document.getElementById('hdr-prac-rank');
        if (pRankEl) pRankEl.innerHTML = (myPrac && myPrac.rank) ? `🏆 อันดับ #${myPrac.rank}` : `ไม่มีอันดับ`;

        const { data: swData } = await gamesExt.getLeaderboard('staffwars', currentUser.id);
        const swScoreEl = document.getElementById('hdr-sw-score');
        const swRankEl = document.getElementById('hdr-sw-rank');
        if (swData) {
            const score = swData.user_highscore || 0;
            if (swScoreEl) swScoreEl.innerText = score.toLocaleString();
            if (score > 0) {
                const foundUser = (swData.top_10 || []).find(r => r.user_id === currentUser.id || (r.full_name && currentUser.first_name && r.full_name.includes(currentUser.first_name)));
                const rank = swData.user_rank || (foundUser ? foundUser.rank : 'นอกตาราง');
                if (swRankEl) swRankEl.innerHTML = `🏆 อันดับ #${rank}`;
            } else {
                if (swRankEl) swRankEl.innerHTML = `ยังไม่เคยเล่น`;
            }
        }

        const { data: rcData } = await gamesExt.getLeaderboard('rhythm_core', currentUser.id);
        const rcScoreEl = document.getElementById('hdr-rc-score');
        const rcRankEl = document.getElementById('hdr-rc-rank');
        if (rcData) {
            const score = rcData.user_highscore || 0;
            if (rcScoreEl) rcScoreEl.innerText = score.toLocaleString();
            if (score > 0) {
                const foundUser = (rcData.top_10 || []).find(r => r.user_id === currentUser.id || (r.full_name && currentUser.first_name && r.full_name.includes(currentUser.first_name)));
                const rank = rcData.user_rank || (foundUser ? foundUser.rank : 'นอกตาราง');
                if (rcRankEl) rcRankEl.innerHTML = `🏆 อันดับ #${rank}`;
            } else {
                if (rcRankEl) rcRankEl.innerHTML = `ยังไม่เคยเล่น`;
            }
        }
    } catch (e) {
        console.error('Error fetching header stats:', e);
    }
}

export async function handleEditProfile(e) {
    const btn = e.currentTarget;
    btn.setAttribute('aria-busy', 'true');
    try {
        const { value: formValues } = await Swal.fire({
            title: 'แก้ไขข้อมูลส่วนตัว',
            html: `
                <div style="text-align: left;">
                    <div class="grid">
                        <label>คำนำหน้า
                            <select id="swal-prefix" class="swal2-input">
                                <option value="เด็กชาย" ${currentUser.prefix === 'เด็กชาย' ? 'selected' : ''}>เด็กชาย</option>
                                <option value="เด็กหญิง" ${currentUser.prefix === 'เด็กหญิง' ? 'selected' : ''}>เด็กหญิง</option>
                                <option value="นาย" ${currentUser.prefix === 'นาย' ? 'selected' : ''}>นาย</option>
                                <option value="นางสาว" ${currentUser.prefix === 'นางสาว' ? 'selected' : ''}>นางสาว</option>
                                <option value="นาง" ${currentUser.prefix === 'นาง' ? 'selected' : ''}>นาง</option>
                            </select>
                        </label>
                        <label>ชื่อ<input id="swal-firstname" class="swal2-input" value="${escapeHtml(currentUser.first_name || '')}"></label>
                        <label>นามสกุล<input id="swal-lastname" class="swal2-input" value="${escapeHtml(currentUser.last_name || '')}"></label>
                    </div>
                    <div class="grid">
                        <label>ชื่อเล่น<input id="swal-nickname" class="swal2-input" value="${escapeHtml(currentUser.nickname || '')}"></label>
                        <label>เบอร์โทรศัพท์<input id="swal-phone" class="swal2-input" value="${escapeHtml(currentUser.phone_number || '')}"></label>
                        <label>Line ID<input id="swal-lineid" class="swal2-input" value="${escapeHtml(currentUser.line_id || '')}"></label>
                    </div>
                    <div class="grid">
                        <div>
                            <label for="swal-birthdate">วันเกิด</label>
                            <input type="date" id="swal-birthdate" class="swal2-input" value="${currentUser.birth_date || ''}">
                        </div>
                        <div>
                            <label for="swal-student-id">รหัสนักเรียน</label>
                            <input id="swal-student-id" class="swal2-input" value="${escapeHtml(currentUser.student_id || '')}">
                        </div>
                        <div>
                            <label for="swal-student-class">ชั้นเรียน</label>
                            <input id="swal-student-class" class="swal2-input" value="${escapeHtml(currentUser.student_class || '')}" pattern="ม\\.[1-6]/[1-9][0-9]*" placeholder="เช่น ม.4/1">
                        </div>
                        <div id="main-instrument-field-profile" class="${currentUser.student_group === 'club' ? '' : 'hidden'}" style="grid-column: span 2;">
                            <label>เครื่องดนตรีหลัก</label>
                            <input id="swal-main-instrument" class="swal2-input" value="${escapeHtml(currentUser.main_instrument || '')}">
                        </div>
                    </div>
                    <hr>
                    <label>อัปโหลดรูปโปรไฟล์ใหม่</label>
                    <input id="swal-profile-file" type="file" class="swal2-file" accept="image/*">
                </div>`,
            focusConfirm: false,
            showCancelButton: true,
            confirmButtonText: 'บันทึก',
            cancelButtonText: 'ยกเลิก',
            preConfirm: () => {
                const imageFile = document.getElementById('swal-profile-file').files[0];
                if (imageFile && !imageFile.name.toLowerCase().endsWith('.jpg')) {
                    Swal.showValidationMessage('กรุณาอัปโหลดไฟล์รูปภาพนามสกุล .jpg เท่านั้น');
                    return false;
                }
                return {
                    prefix: document.getElementById('swal-prefix').value,
                    first_name: document.getElementById('swal-firstname').value,
                    last_name: document.getElementById('swal-lastname').value,
                    nickname: document.getElementById('swal-nickname').value || null,
                    phone_number: document.getElementById('swal-phone').value || null,
                    line_id: document.getElementById('swal-lineid').value || null,
                    main_instrument: document.getElementById('swal-main-instrument')?.value || null,
                    birth_date: document.getElementById('swal-birthdate').value || null,
                    imageFile: imageFile || null
                };
            }
        });

        if (formValues) {
            Swal.showLoading();
            let finalImageUrl = currentUser.profile_image_url;

            if (formValues.imageFile) {
                const file = formValues.imageFile;
                const { publicUrl, error: uploadError } = await usersExt.uploadProfileImage(currentUser.id, file);
                if (uploadError) throw uploadError;
                finalImageUrl = publicUrl;
            }

            const updateData = { ...formValues, profile_image_url: finalImageUrl };
            delete updateData.imageFile;

            const { error } = await usersExt.updateProfile(currentUser.id, updateData);
            if (error) throw error;
            
            setCurrentUser({ ...currentUser, ...updateData });
            refreshUserProfileHeader();
            await Swal.fire('สำเร็จ!', 'อัปเดตข้อมูลของคุณเรียบร้อยแล้ว', 'success');
        }
    } catch (error) {
        await Swal.fire('ผิดพลาด!', error.message, 'error');
    } finally {
        if(btn) btn.removeAttribute('aria-busy');
    }
}

export function setupStudentEventListeners() {
    const suggestBtn = document.getElementById('suggest-link-btn');
    if (suggestBtn) {
        suggestBtn.addEventListener('click', handleSuggestKnowledgeLink);
    }

    const timeFilter = document.getElementById('history-filter-time');
    const statusFilter = document.getElementById('history-filter-status');

    if (timeFilter) {
        timeFilter.addEventListener('change', filterMyHistory);
    }
    if (statusFilter) {
        statusFilter.addEventListener('change', filterMyHistory);
    }

    lazyLoadSection('#knowledge-base-section', renderKnowledgeBase);
    lazyLoadSection('#badge-section', () => renderMyBadges(currentUser.id));
    lazyLoadSection('#history-section', () => {
        renderMyHistory(currentUser.id);
    });

    if (currentUser.student_group === 'club') {
        lazyLoadSection('#ranking-section', renderPracticeRanking);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 🚀 ฟังก์ชันแสดงฟอร์มและจัดการการยืม (รองรับการยืมทั่วไป, กลับบ้าน และกรณีพิเศษ)
// ─────────────────────────────────────────────────────────────────────────────
export async function renderBorrowForm(user) {
    const container = document.getElementById('borrow-form-container');
    if (!container) return;
    container.setAttribute('aria-busy', 'true');
    
    try {
        const { data, error } = await instrumentsExt.getAvailable();
        if (error) throw error;
        
        // 🟢 FIX: บันทึกข้อมูลลงตัวแปร Global ที่ประกาศไว้ด้านบน
        availableInstruments = data || []; 
        
        let rulesHtml = '';
        let extraFieldsHtml = '';

        if (user.student_group === 'club') {
            rulesHtml = `
                <div class="sd-list-container" style="margin-bottom:1.5rem; padding: 1rem; background: var(--pico-form-element-background-color); border: 1px solid var(--pico-primary-background);">
                    <strong style="color: var(--pico-primary-background);">🌟 สิทธิ์สมาชิกชุมนุม</strong>
                    <p style="margin: 0.5rem 0 0.5rem 0; font-size: 0.85rem; color: var(--pico-muted-color);">เลือกรูปแบบการยืม:</p>
                    <label style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.5rem; color: var(--pico-color);">
                        <input type="radio" name="borrow_type" value="in_school" checked> 🏫 ยืมซ้อมในโรงเรียน (นับเวลา, สูงสุด 6 ชม.)
                    </label>
                    <label style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.5rem; color: var(--pico-color);">
                        <input type="radio" name="borrow_type" value="performance"> 🎭 ออกงาน/ทำการแสดง (นับเวลา, ไม่จำกัดชั่วโมง)
                    </label>
                    <label style="display:flex; align-items:center; gap:0.5rem; color: var(--pico-color);">
                        <input type="radio" name="borrow_type" value="take_home"> 🏠 ยืมกลับบ้าน (ข้ามคืน, ไม่นับเวลา)
                    </label>
                </div>
                <div id="take-home-details" class="hidden" style="background: var(--pico-card-background-color); padding: 1rem; border-radius: 12px; margin-bottom: 1rem; border: 1px solid var(--pico-muted-border-color);">
                    <label style="font-size:0.85rem; font-weight:bold; color: var(--pico-color);">📅 วันกำหนดคืน*</label>
                    <input type="date" id="due-date-input" name="due_date" class="sd-select-minimal" style="margin-bottom:1rem; width:100%;">
                    <label style="display:flex;align-items:center;gap:0.5rem;margin:0; color: var(--pico-color);">
                        <input type="checkbox" id="parent-ack-checkbox" name="parent_acknowledged">
                        <span style="font-size:0.85rem;">ผู้ปกครองรับทราบและอนุญาตแล้ว*</span>
                    </label>
                </div>`;
        } else if (user.student_group === 'teacher' || user.student_group === 'guest') {
            rulesHtml = `<div class="sd-list-container" style="margin-bottom:1.5rem; padding: 1rem; background: var(--pico-form-element-background-color); border: 1px solid #f59e0b;"><strong style="color: #d97706;">📝 การยืมกรณีพิเศษ</strong><p style="margin: 0.5rem 0 0 0; font-size: 0.85rem; color: var(--pico-muted-color);">กรุณาระบุวันกำหนดคืนให้ชัดเจนทุกครั้ง</p></div>`;
            extraFieldsHtml = `<div><label style="font-size:0.85rem; font-weight:bold; color: var(--pico-color);">📅 วันกำหนดคืน*</label><input type="date" id="due-date-input" name="due_date" class="sd-select-minimal" style="width:100%;"></div>`;
        } else {
            rulesHtml = `<div class="sd-list-container" style="margin-bottom:1.5rem; padding: 1rem; background: var(--pico-form-element-background-color); border: 1px solid var(--pico-muted-border-color);"><strong style="color: var(--pico-color);">⏳ กฎการยืมซ้อม</strong><p style="margin: 0.5rem 0 0 0; font-size: 0.85rem; color: var(--pico-muted-color);">ยืมซ้อมในโรงเรียนได้ครั้งละ <strong>1 ชั่วโมง</strong> (ระบบจะเริ่มนับเวลาอัตโนมัติ)</p></div>`;
        }

        container.innerHTML = `
            ${rulesHtml}
            <div style="margin-bottom: 1.5rem;">
                <label style="font-size:0.85rem; font-weight:bold; color: var(--pico-color);">หมวดหมู่</label>
                <select id="type-filter" class="sd-select-minimal" style="width:100%; margin-bottom:1rem;"><option value="all">ทั้งหมด</option></select>
                
                <label style="font-size:0.85rem; font-weight:bold; color: var(--pico-color);">เครื่องดนตรี</label>
                <select id="instrument-select" class="sd-select-minimal" style="width:100%; margin-bottom:1rem;" disabled><option value="">-- รอเลือกหมวด --</option></select>
                
                ${extraFieldsHtml}
            </div>
            <div id="actions-group" style="margin-bottom: 1.5rem;">
                <div id="report-repair-wrapper" class="hidden" style="margin-bottom: 0.5rem;">
                    <label style="display:flex; align-items:center; gap:0.5rem; color: var(--pico-del-color); font-weight:bold;">
                        <input type="checkbox" id="report-repair-switch" name="report-repair"> 🔧 แจ้งซ่อม (ชำรุด/ไม่ต้องยืม)
                    </label>
                </div>
                <div id="agreement-wrapper">
                    <label style="display:flex; align-items:center; gap:0.5rem; color: var(--pico-color);">
                        <input type="checkbox" id="agreement-switch" disabled> ✅ ยอมรับข้อตกลงการยืม
                    </label>
                </div>
            </div>
            <button class="sd-btn-primary borrow-btn" type="button" style="width:100%;" disabled>ยืนยันการยืม</button>`;

        const types = [...new Set(availableInstruments.map(i => i.type).filter(Boolean))];
        const typeFilter = container.querySelector('#type-filter');
        types.forEach(t => typeFilter.innerHTML += `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`);

        container.querySelector('#type-filter')?.addEventListener('change', _populateInstrumentSelect);
        container.querySelector('#instrument-select')?.addEventListener('change', _checkBorrowButtonState);
        
        container.querySelectorAll('input[name="borrow_type"]').forEach(radio => {
            radio.addEventListener('change', e => {
                container.querySelector('#take-home-details')?.classList.toggle('hidden', e.target.value !== 'take_home');
            });
        });

        container.querySelector('#report-repair-switch')?.addEventListener('change', e => {
            const isRepair = e.target.checked;
            const agrWrap  = container.querySelector('#agreement-wrapper');
            if (agrWrap) agrWrap.classList.toggle('hidden', isRepair);
            if (isRepair) container.querySelector('#agreement-switch').checked = false;
            const btn = container.querySelector('.borrow-btn');
            if (btn) {
                btn.textContent = isRepair ? 'ยืนยันการแจ้งซ่อม' : 'ยืนยันการยืม';
                btn.className = isRepair ? 'sd-btn-danger borrow-btn' : 'sd-btn-primary borrow-btn';
                btn.style.width = '100%';
            }
            _checkBorrowButtonState();
        });

        container.querySelector('#agreement-switch')?.addEventListener('change', async e => {
            if (e.target.checked) {
                const { isConfirmed } = await Swal.fire({
                    title: '🎶 ข้อตกลงการยืม 🎶',
                    html: `<div style="text-align:left;font-size:0.95rem;">
                        <ul style="list-style-type:none;padding-left:0;display:flex;flex-direction:column;gap:0.5rem;">
                            <li>👤 <strong>ห้ามยืมแทนกัน</strong></li>
                            <li>⏰ <strong>คืนให้ตรงเวลา</strong> ไม่งั้นจะงดสิทธิ์ยืมครั้งถัดไป</li>
                            <li>💸 <strong>หากของเสียหายหรือหาย</strong> ผู้ยืมต้องรับผิดชอบ</li>
                        </ul></div>`,
                    icon: 'info', showCancelButton: true,
                    confirmButtonText: 'รับทราบและยอมรับ', cancelButtonText: 'ยกเลิก',
                    confirmButtonColor: '#2563eb',
                });
                if (!isConfirmed) e.target.checked = false;
            }
            _checkBorrowButtonState();
        });

        const { data: favData } = await instrumentsExt.getFavorite(user.id);
        if (favData?.length > 0 && availableInstruments.some(i => i.id === favData[0].instrument_id)) {
            typeFilter.value = favData[0].instrument_type;
            _populateInstrumentSelect();
            container.querySelector('#instrument-select').value = favData[0].instrument_id;
            _checkBorrowButtonState();
        } else { 
            _populateInstrumentSelect(); 
        }

        const borrowBtn = container.querySelector('.borrow-btn');
        if (borrowBtn) {
            borrowBtn.addEventListener('click', async () => {
                if (borrowBtn.disabled || borrowBtn.getAttribute('aria-busy') === 'true') return;
                borrowBtn.disabled = true;
                borrowBtn.setAttribute('aria-busy', 'true');

                const cu = getCurrentUser();
                try {
                    const instrumentId = container.querySelector('#instrument-select').value;
                    const isRepairMode = container.querySelector('#report-repair-switch')?.checked;
                    if (!instrumentId) throw new Error('กรุณาเลือกเครื่องดนตรีก่อน');

                    if (isRepairMode) {
                        const { value: problem } = await Swal.fire({
                            title: 'แจ้งเครื่องดนตรีชำรุด', input: 'textarea',
                            inputPlaceholder: 'เช่น สายขาด, นวมรั่ว...', showCancelButton: true, confirmButtonText: 'แจ้งซ่อม',
                            inputValidator: v => !v && 'กรุณาระบุอาการชำรุด!',
                        });
                        if (problem) {
                            Swal.showLoading();
                            await repair.report(instrumentId, cu.id, problem);
                            await instrumentsExt.updateStatus(instrumentId, 'ชำรุด', 'ชำรุด');
                            await Swal.fire('สำเร็จ!', 'แจ้งซ่อมเครื่องดนตรีเรียบร้อย', 'success');
                            renderBorrowForm(user);
                        }
                    } else {
                        const typeRadio = container.querySelector('input[name="borrow_type"]:checked');
                        let borrowType = typeRadio ? typeRadio.value : 'in_school';
                        if (cu.student_group === 'teacher' || cu.student_group === 'guest') borrowType = 'special';
                        
                        const isTakeHome = (borrowType === 'take_home' || borrowType === 'special');
                        let dueDate = null, parentAck = false;

                        if (isTakeHome) {
                            dueDate = container.querySelector('#due-date-input').value;
                            parentAck = container.querySelector('#parent-ack-checkbox')?.checked || false;
                            if (!dueDate) throw new Error('กรุณาระบุวันกำหนดคืน');
                            if (cu.student_group === 'club' && !parentAck) throw new Error('กรุณายืนยันว่าผู้ปกครองรับทราบแล้ว');
                        }

                        Swal.showLoading();
                        
                        // 🟢 FIX: จัดการตัวแปร Response อย่างถูกต้อง
                        const { data: borrowResult, error } = await borrowExt.borrowInstrumentAtomic(
                            Number(instrumentId),
                            cu.id,
                            isTakeHome,
                            dueDate || null,
                            parentAck,
                            borrowType
                        );

                        if (error) throw error;
                        
                        await Swal.fire('สำเร็จ!', borrowResult?.message || 'ทำรายการยืมเรียบร้อย', 'success');
                        
                        renderBorrowForm(user);
                        if (typeof loadAndRenderMyBorrowedItems === 'function') loadAndRenderMyBorrowedItems(cu.id);
                        if (typeof filterMyHistory === 'function') filterMyHistory();
                    }
                } catch (err) {
                    console.error('[Borrow Error]:', err);
                    Swal.fire('เกิดข้อผิดพลาด', err.message || 'ไม่สามารถบันทึกข้อมูลได้', 'error');
                } finally {
                    borrowBtn.disabled = false;
                    borrowBtn.removeAttribute('aria-busy');
                }
            });
        }
    } catch (err) {
        container.innerHTML = `<p style="color:var(--pico-del-color);text-align:center;padding:1rem;">โหลดข้อมูลล้มเหลว: ${err.message}</p>`;
    } finally {
        container.removeAttribute('aria-busy');
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions สำหรับจัดการฟอร์มยืม
// ─────────────────────────────────────────────────────────────────────────────
function _checkBorrowButtonState() {
    const instrumentSelect = document.getElementById('instrument-select');
    const agreementSwitch  = document.getElementById('agreement-switch');
    const repairSwitch     = document.getElementById('report-repair-switch');
    const repairWrapper    = document.getElementById('report-repair-wrapper');
    const borrowBtn        = document.querySelector('.borrow-btn');
    if (!borrowBtn || !instrumentSelect || !agreementSwitch || !repairSwitch) return;

    const selected   = !!instrumentSelect.value;
    const isRepair   = repairSwitch.checked;
    
    if (repairWrapper) repairWrapper.classList.toggle('hidden', !selected);
    borrowBtn.disabled = isRepair ? !selected : (!selected || !agreementSwitch.checked);
}

function _populateInstrumentSelect() {
    const container       = document.getElementById('borrow-form-container');
    const typeFilter      = container?.querySelector('#type-filter');
    const instrumentSelect = container?.querySelector('#instrument-select');
    const agreementSwitch = container?.querySelector('#agreement-switch');
    
    if (!container || !typeFilter || !instrumentSelect || !agreementSwitch) return;

    const selectedType = typeFilter.value;
    
    // 🟢 FIX: ถอด state. ออก ใช้ availableInstruments โดยตรง
    const filtered = selectedType === 'all' 
        ? availableInstruments 
        : availableInstruments.filter(i => i.type === selectedType);

    instrumentSelect.innerHTML = '<option value="">-- กรุณาเลือก --</option>';
    if (filtered.length > 0) {
        filtered.forEach(i => instrumentSelect.innerHTML += `<option value="${escapeHtml(i.id)}">${escapeHtml(i.name)}</option>`);
        instrumentSelect.disabled  = false;
        agreementSwitch.disabled   = false;
    } else {
        instrumentSelect.innerHTML = '<option value="">ไม่มีเครื่องดนตรีในประเภทนี้</option>';
        instrumentSelect.disabled  = true;
        agreementSwitch.disabled   = true;
    }
    agreementSwitch.checked = false;
    _checkBorrowButtonState();
}

function checkBorrowButtonState() {
    const instrumentSelect = document.getElementById('instrument-select');
    const agreementSwitch = document.getElementById('agreement-switch');
    const repairSwitch = document.getElementById('report-repair-switch');
    const repairWrapper = document.getElementById('report-repair-wrapper');
    const borrowBtn = document.querySelector('.borrow-btn');
    
    if (!borrowBtn || !instrumentSelect || !agreementSwitch || !repairSwitch) return;

    const instrumentSelected = !!instrumentSelect.value;
    const isReportingRepair = repairSwitch.checked;

    if (repairWrapper) {
        repairWrapper.classList.toggle('hidden', !instrumentSelected);
    }

    if (isReportingRepair) {
        borrowBtn.disabled = !instrumentSelected;
    } else {
        borrowBtn.disabled = !instrumentSelected || !agreementSwitch.checked;
    }
}

function populateInstrumentSelect() {
    const container = document.getElementById('borrow-form-container');
    const typeFilter = container?.querySelector('#type-filter');
    const instrumentSelect = container?.querySelector('#instrument-select');
    const agreementSwitch = container?.querySelector('#agreement-switch');
    if (!container || !typeFilter || !instrumentSelect || !agreementSwitch) return;
    const selectedType = typeFilter.value;
    const filtered = (selectedType === 'all') ? availableInstruments : availableInstruments.filter(i => i.type === selectedType);
    instrumentSelect.innerHTML = '<option value="">-- กรุณาเลือก --</option>';
    if (filtered.length > 0) {
        filtered.forEach(i => instrumentSelect.innerHTML += `<option value="${i.id}">${escapeHtml(i.name)}</option>`);
        instrumentSelect.disabled = false;
        agreementSwitch.disabled = false;
    } else {
        instrumentSelect.innerHTML = '<option value="">ไม่มีเครื่องดนตรีในประเภทนี้</option>';
        instrumentSelect.disabled = true;
        agreementSwitch.disabled = true;
    }
    agreementSwitch.checked = false;
    checkBorrowButtonState();
}

export async function loadAndRenderMyBorrowedItems(userId) {
    if (borrowTimerInterval) clearInterval(borrowTimerInterval);

    const borrowedSection = document.getElementById('borrowed-section'); 
    const listEl = document.getElementById('borrowed-list');
    if (!borrowedSection || !listEl) return;

    listEl.setAttribute('aria-busy', 'true');
    try {
        const { data, error } = await borrow.getUserBorrowedItems(userId);
        if (error) throw error;
        myBorrowedItems = data || [];

        if (!data || data.length === 0) {
            borrowedSection.classList.add('hidden'); 
            listEl.innerHTML = '';
        } else {
            borrowedSection.classList.remove('hidden'); 
            
            let overdueWarningHtml = ''; 
            const sixHoursAgo = new Date(new Date().getTime() - (6 * 60 * 60 * 1000));
            const overdueItems = data.filter(log => !log.is_take_home && new Date(log.borrow_timestamp) < sixHoursAgo);
            if (overdueItems.length > 0) {
                overdueWarningHtml = `<article style="background-color: var(--pico-form-element-invalid-active-border-color); color: red; padding: 1rem; margin-bottom: 1rem;"><h5 style="margin:0; color:red;">⚠️ พบรายการที่อาจลืมคืน!</h5><p style="margin-top:0.5rem;">คุณมีรายการยืมในโรงเรียนที่นานเกิน 6 ชั่วโมง หากใช้งานเสร็จแล้ว กรุณากดคืน</p></article>`;
            }
            
            const itemsHtml = data.map(log => {
                const instrumentName = log.instrument_name || 'เครื่องดนตรีที่ถูกลบไปแล้ว';
                let statusBadgeHtml = '';

                if (log.is_take_home) {
                    if (log.approval_status === 'pending') {
                        statusBadgeHtml = `<span class="badge status-waiting">รออนุมัติ</span>`;
                    } else if (log.approval_status === 'approved') {
                        statusBadgeHtml = `<span class="badge status-completed" style="white-space: normal;"><span class="borrow-timer" data-borrow-time="${log.borrow_timestamp}" data-is-take-home="true" data-due-date="${log.due_date || ''}">...</span></span>`;
                    } else if (log.approval_status === 'rejected') {
                        statusBadgeHtml = `<span class="badge status-rejected">ถูกปฏิเสธ</span>`;
                    }
                } else {
                    statusBadgeHtml = `<span class="badge status-borrowing" style="white-space: normal;">ยืมไปแล้ว: <span class="borrow-timer" data-borrow-time="${log.borrow_timestamp}" data-is-take-home="false" data-due-date="">00:00:00</span></span>`;
                }
                const canReturn = log.approval_status !== 'pending';

                return `<li style="padding: .25rem 0; border-bottom: 1px dashed var(--pico-muted-border-color);">
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: .25rem; line-height: 1.1;">
                        <div style="display: flex; align-items: center; gap: .25rem; flex: 1; min-width: 0;">
                        <input type="checkbox" class="return-checkbox" data-log-id="${log.id}" value="${log.instrument_id}" ${!canReturn ? 'disabled' : ''} style="flex-shrink: 0; transform: scale(0.9);">
                        <strong style="word-break: break-word; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: .95rem;">${escapeHtml(instrumentName)}</strong>
                        ${statusBadgeHtml}
                        </div>
                        ${canReturn ? `<button type="button" class="return-btn secondary outline btn-small" data-id="${log.instrument_id}" data-name="${escapeHtml(instrumentName)}" style="padding: .2rem .6rem; font-size: .85rem; line-height: 1;">คืน</button>` : '<small style="font-size: .8rem;">คืนไม่ได้</small>'}
                    </div>
                    </li>`;
            }).join('');
            
            listEl.innerHTML = `
                ${overdueWarningHtml}
                <form id="return-form">
                    <ul style="list-style:none;padding:0;margin:0">${itemsHtml}</ul>
                    <hr>
                    <footer style="display:flex;justify-content:space-between;align-items:center">
                        <label style="margin:0;cursor:pointer"><input type="checkbox" id="select-all-checkbox"> เลือกทั้งหมด</label>
                        <button type="button" id="return-selected-btn" class="contrast">คืนที่เลือก</button>
                    </footer>
                </form>`;

            if(typeof updateAllTimers === 'function') updateAllTimers(); 
            borrowTimerInterval = setInterval(() => { if(typeof updateAllTimers === 'function') updateAllTimers(); }, 1000);
        }
    } catch (err) {
        listEl.innerHTML = `<p style="color:red">โหลดข้อมูลล้มเหลว: ${err.message}</p>`;
        borrowedSection.classList.remove('hidden'); 
    } finally {
        listEl.removeAttribute('aria-busy');
    }
}

export function updateAllTimers() {
    const timerElements = document.querySelectorAll('.borrow-timer');
    if (timerElements.length === 0) return;

    timerElements.forEach(timerEl => {
        const isTakeHome = timerEl.dataset.isTakeHome === 'true';
        const borrowTime = timerEl.dataset.borrowTime;
        const dueDate = timerEl.dataset.dueDate;

        if (isTakeHome && dueDate) {
            timerEl.innerHTML = formatCountdown(dueDate);
        } else if (borrowTime) {
            timerEl.textContent = formatElapsedTime(borrowTime);
        }
    });
}

function formatElapsedTime(startTime) {
    if (!startTime || typeof startTime !== 'string') return '00:00:00';
    let parsableTime = startTime.replace(' ', 'T');
    const microsecondMatch = parsableTime.match(/\.(\d+)/);
    if (microsecondMatch && microsecondMatch[1].length > 3) {
        const ms = microsecondMatch[1].substring(0, 3);
        parsableTime = parsableTime.replace(/\.\d+/, `.${ms}`);
    }
    const timezoneRegex = /Z|([+-]\d{2}:\d{2})$/;
    if (!timezoneRegex.test(parsableTime)) {
        parsableTime += 'Z';
    }
    const start = new Date(parsableTime).getTime();
    if (isNaN(start)) return '00:00:00';
    const now = new Date().getTime();
    const difference = now - start;
    if (difference < 0) return '00:00:00';
    const hours = Math.floor(difference / (1000 * 60 * 60));
    const minutes = Math.floor((difference / (1000 * 60)) % 60);
    const seconds = Math.floor((difference / 1000) % 60);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatCountdown(dueDateTimeString) {
    if (!dueDateTimeString) return 'ไม่มีกำหนด';
    const dueTime = new Date(dueDateTimeString);
    dueTime.setHours(23, 59, 59, 999);
    const now = new Date().getTime();
    const difference = dueTime.getTime() - now;

    if (difference < 0) {
        const overdueDiff = now - dueTime.getTime();
        const days = Math.floor(overdueDiff / (1000 * 60 * 60 * 24));
        const hours = Math.floor(overdueDiff / (1000 * 60 * 60));
        const minutes = Math.floor((overdueDiff / (1000 * 60)) % 60);
        let overdueText = '';
        if (days > 0) {
            overdueText = `${days} วัน ${String(hours % 24).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ชม.`;
        } else {
            overdueText = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')} นาที`;
        }
        return `<span style="color:#ef4444; font-weight:bold;">เกินมา ${overdueText}</span>`;
    }

    const days = Math.floor(difference / (1000 * 60 * 60 * 24));
    const hours = Math.floor((difference / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((difference / (1000 * 60)) % 60);
    const seconds = Math.floor((difference / 1000) % 60);
    
    if (days > 0) {
        return `เหลือ ${days} วัน ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    } else {
        return `เหลือ ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
}

export function formatMinutesToHoursMinutes(minutes) {
    if (!minutes || minutes === 0) return '0 นาที';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins} นาที`;
    if (mins === 0) return `${hours} ชม.`;
    return `${hours} ชม. ${mins} น.`;
}

export async function refreshOnReturn() {
    try {
        if (currentUser) {
            await loadAndRenderMyBorrowedItems(currentUser.id);
            if (typeof filterMyHistory === 'function') {
                await filterMyHistory();
            }
            await refreshUserProfileHeader();
            if (typeof renderBorrowForm === 'function') {
                await renderBorrowForm(currentUser);
            }
        }
    } catch (error) {
        console.error('[UI] Error refreshing on return:', error);
    }
}

export async function renderMyHistory() {
    const listEl = document.getElementById('history-list');
    if (!listEl) return;
    listEl.innerHTML = '<div aria-busy="true" style="text-align:center; padding: 2rem;">กำลังโหลดประวัติ...</div>';
    
    const timeFilter = document.getElementById('history-filter-time');
    const statusFilter = document.getElementById('history-filter-status');
    
    if (timeFilter) timeFilter.value = 'this_week'; 
    if (statusFilter) statusFilter.value = 'all';

    if (typeof filterMyHistory === 'function') await filterMyHistory();
}

export async function filterMyHistory() {
    const listEl = document.getElementById('history-list');
    if (!listEl) return;
    
    listEl.innerHTML = '<div style="text-align: center; padding: 1rem;">กำลังโหลดและกรองข้อมูล...</div>';
    
    const timeFilter = document.getElementById('history-filter-time');
    const statusFilter = document.getElementById('history-filter-status');
    const selectedTime = timeFilter?.value || 'all';
    const selectedStatus = statusFilter?.value || 'all';
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    
    try {
        const { data: userHistory, error } = await borrowExt.getUserHistory(currentUser.id);
        if (error) throw error;
        
        if (!userHistory || userHistory.length === 0) {
            listEl.innerHTML = `<div style="text-align:center;padding:2rem 1rem;opacity:0.7"><span style="font-size:3rem;line-height:1">📜</span><h5 style="margin:.5rem 0 .25rem">ไม่พบข้อมูลประวัติ</h5></div>`;
            return;
        }

        const filteredHistory = userHistory.filter(log => {
            const logDate = new Date(log.borrow_timestamp);
            let passesTimeFilter = true;
            
            switch (selectedTime) {
                case 'today': passesTimeFilter = logDate >= today; break;
                case 'this_week': passesTimeFilter = logDate >= startOfWeek; break;
                case 'this_month': passesTimeFilter = logDate >= startOfMonth; break;
                case 'this_year': passesTimeFilter = logDate >= startOfYear; break;
            }
            
            let currentStatusKey = 'borrowing';
            if (log.return_timestamp) {
                currentStatusKey = log.problem_description ? 'returned_damaged' : 'returned_normal';
            } else if (log.is_take_home) {
                if (log.approval_status === 'pending') currentStatusKey = 'pending';
                else if (log.approval_status === 'rejected') currentStatusKey = 'rejected';
                else if (log.approval_status === 'approved') {
                    if (log.due_date && new Date() > new Date(log.due_date)) currentStatusKey = 'overdue';
                    else currentStatusKey = 'approved';
                }
            } else if (log.due_date && new Date() > new Date(log.due_date)) {
                currentStatusKey = 'overdue';
            }

            return passesTimeFilter && (selectedStatus === 'all' || selectedStatus === currentStatusKey);
        });

        const getDisplayStatus = (log) => {
            if (log.return_timestamp) {
                return log.problem_description 
                    ? { text: 'คืนแล้ว (แจ้งซ่อม)', badgeClass: 'status-damaged' }
                    : { text: 'คืนแล้ว', badgeClass: 'status-returned' };
            }
            if (log.is_take_home) {
                if (log.approval_status === 'pending') return { text: 'รออนุมัติ', badgeClass: 'status-waiting' };
                if (log.approval_status === 'rejected') return { text: 'ถูกปฏิเสธ', badgeClass: 'status-rejected' };
                if (log.due_date && new Date() > new Date(log.due_date)) return { text: 'เลยกำหนดคืน!', badgeClass: 'status-overdue' };
                return { text: 'ยืมกลับบ้าน', badgeClass: 'status-completed' };
            }
            if (log.due_date && new Date() > new Date(log.due_date)) return { text: 'เลยกำหนดคืน!', badgeClass: 'status-overdue' };
            return { text: 'กำลังยืม', badgeClass: 'status-borrowing' };
        };

        if (filteredHistory.length === 0) {
            listEl.innerHTML = `<div style="text-align:center;padding:2rem 1rem;opacity:0.7"><span style="font-size:3rem;line-height:1">📜</span><h5 style="margin:.5rem 0 .25rem">ไม่พบข้อมูลตามเงื่อนไข</h5><p style="margin:0;font-size:.9rem">ลองปรับเงื่อนไขการค้นหาใหม่</p></div>`;
        } else {
            const html = filteredHistory.map(log => {
                const status = getDisplayStatus(log);
                const instrumentName = log.instrument_name || 'เครื่องดนตรีที่ถูกลบ';

                return `<li style="padding:.75rem 0;border-bottom:1px dashed var(--pico-muted-border-color);">
                    <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:.5rem 1rem;line-height:1.2">
                        <strong>${escapeHtml(instrumentName)}</strong>
                        <span class="badge ${status.badgeClass||'status-default'}">${status.text}</span>
                    </div>
                    <div style="font-size:.85em;color:var(--pico-muted-color);line-height:1.2;margin-top:.25rem">
                        <span>ยืม: ${new Date(log.borrow_timestamp).toLocaleString('th-TH',{dateStyle:'short',timeStyle:'short'})} น.</span>
                        ${log.return_timestamp ? ` • <span>คืน: ${new Date(log.return_timestamp).toLocaleString('th-TH',{dateStyle:'short',timeStyle:'short'})} น.</span>` : ''}
                        ${log.due_date && log.is_take_home ? ` • <span>กำหนดคืน: ${new Date(log.due_date).toLocaleDateString('th-TH')}</span>` : ''}
                    </div>
                    ${log.problem_description ? `<div style="font-size:.8em;color:var(--pico-red-500);margin-top:.25rem">แจ้งซ่อม: ${escapeHtml(log.problem_description)}</div>` : ''}
                </li>`;
            }).join('');
            listEl.innerHTML = `<ul style="list-style:none;padding:0;margin:0">${html}</ul>`;
        }
    } catch (err) {
        listEl.innerHTML = `<p style="color:red; text-align: center;">เกิดข้อผิดพลาดในการดึงข้อมูล: ${err.message}</p>`;
    }
}

export async function renderMyBadges(userId) {
    const listEl = document.getElementById('badge-list');
    if (!listEl) return;
    listEl.setAttribute('aria-busy', 'true');
    
    try {
        const { data: definitions, error: defsError } = await badgesExt.getDefinitions();
        if (defsError) throw defsError;

        const iconMap = definitions.reduce((acc, def) => {
            if (def.badge_name) acc[def.badge_name.trim()] = def.badge_icon;
            return acc;
        }, {});

        const { data: userBadges, error: userBadgesError } = await badgesExt.getUserBadges(userId);
        if (userBadgesError) throw userBadgesError;

        if (!userBadges || userBadges.length === 0) {
            listEl.innerHTML = '<p>ยังไม่มีเหรียญตราที่ได้รับ</p>';
        } else {
            listEl.innerHTML = userBadges.map(b => {
                if (!b.badge_name) return ''; 
                const icon = iconMap[b.badge_name.trim()] || '🏅'; 
                return `<span class="badge" title="${escapeHtml(b.badge_description || '')}">${icon} ${escapeHtml(b.badge_name)}</span>`;
            }).join(' ');
        }
    } catch (err) {
        listEl.innerHTML = `<p style="color:red">โหลดข้อมูลเหรียญตราล้มเหลว</p>`;
    } finally {
        listEl.removeAttribute('aria-busy');
    }
}

export async function renderKnowledgeBase() {
    const container = document.getElementById('knowledge-base-container');
    if (!container) return;
    
    container.innerHTML = `
        <div class="modern-field-group">
            <h5 style="margin-bottom: 1rem; font-weight: 700;">📚 คลังความรู้</h5>
            <select id="knowledge-type-filter" aria-busy="true"><option>กำลังโหลด...</option></select>
            <div id="knowledge-video-list" style="margin-top: 1.5rem; max-height: 500px; overflow-y: auto;"></div>
        </div>
    `;
    
    const typeFilter = container.querySelector('#knowledge-type-filter');
    typeFilter?.addEventListener('change', (e) => loadAndDisplayMedia(e.target.value));
    
    try {
        const { data: allTypesData, error: typesError } = await knowledgeExt.getTypes();
        if (typesError) throw typesError;
        
        const uniqueTypes = [...new Set(allTypesData.map(item => item.instrument_type).filter(Boolean))];
        typeFilter.innerHTML = '<option value="">-- กรุณาเลือกหมวดหมู่ --</option>';
        uniqueTypes.forEach(type => { typeFilter.innerHTML += `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`; });
        
        let defaultType = uniqueTypes.length > 0 ? uniqueTypes[0] : ''; 
        if (currentUser) {
            const { data: favoriteData, error: favError } = await instrumentsExt.getFavorite(currentUser.id);
            if (!favError && favoriteData && favoriteData.length > 0 && favoriteData[0].instrument_type) {
                defaultType = favoriteData[0].instrument_type; 
            }
        }

        if (defaultType) {
            typeFilter.value = defaultType;
            loadAndDisplayMedia(defaultType);
        } else {
            loadAndDisplayMedia('');
        }
    } catch (err) {
        if(typeFilter) typeFilter.innerHTML = '<option>ผิดพลาดในการโหลดข้อมูล</option>';
    } finally {
        if(typeFilter) typeFilter.removeAttribute('aria-busy');
    }
}

export async function loadAndDisplayMedia(instrumentType) {
    const mediaList = document.getElementById('knowledge-video-list');
    if (!mediaList) return;
    
    if (!instrumentType) { 
        mediaList.innerHTML = '<div style="text-align: center; color: var(--pico-muted-color); padding: 2rem; background: var(--input-bg); border-radius: 1rem; border: 1px dashed var(--input-border);">☝️ กรุณาเลือกประเภทเครื่องดนตรีด้านบน เพื่อดูคลิปสอน</div>'; 
        return; 
    }
    
    mediaList.innerHTML = '<div aria-busy="true" style="text-align: center; padding: 2rem;">กำลังโหลดคลิป...</div>';
    
    try {
        const { data, error } = await knowledgeExt.getLinksByType(instrumentType);
        if (error) throw error;
        
        if (!data || data.length === 0) {
            mediaList.innerHTML = '<div style="text-align: center; padding: 2rem; background: var(--input-bg); border-radius: 1rem;">ยังไม่มีคลิปสอนสำหรับเครื่องดนตรีนี้ 🎬</div>'; 
            return;
        }
        
        const mediaHtml = data.map(link => {
            const mediaInfo = typeof parseMediaUrl === 'function' ? parseMediaUrl(link.youtube_url) : { type: 'unknown', originalUrl: link.youtube_url, thumbnailUrl: 'assets/logo.png' };
            if (!mediaInfo) return '';
            
            let platformBadge = '';
            if (mediaInfo.type === 'facebook') platformBadge = `<span class="badge" style="background-color:#1877f2; color:white; border-radius:12px; font-size:0.7rem;">Facebook</span>`;
            else if (mediaInfo.type === 'tiktok') platformBadge = `<span class="badge" style="background-color:#000; color:white; border-radius:12px; font-size:0.7rem;">TikTok</span>`;
            else platformBadge = `<span class="badge" style="background-color:#ef4444; color:white; border-radius:12px; font-size:0.7rem;">YouTube</span>`;
            
            const titleText = mediaInfo.type === 'playlist' ? `${escapeHtml(link.title)} (เพลย์ลิสต์)` : escapeHtml(link.title);
            
            return `
            <article style="padding:0; margin:0; overflow: hidden; border-radius: 1rem; transition: transform 0.2s, box-shadow 0.2s;">
                <a href="${escapeHtml(mediaInfo.originalUrl)}" target="_blank" rel="noopener noreferrer" style="text-decoration:none; color:inherit; display:flex; flex-direction:column; height:100%;">
                    <div style="position: relative;">
                        <img src="${mediaInfo.thumbnailUrl}" alt="${titleText}" style="aspect-ratio:16/9; width:100%; object-fit:cover; background-color: var(--input-bg);">
                        <div style="position: absolute; bottom: 0.5rem; right: 0.5rem;">${platformBadge}</div>
                    </div>
                    <div style="padding: 0.75rem; flex-grow: 1; display: flex; align-items: center;">
                        <strong style="display:block; font-size:0.95rem; line-height: 1.3; color: var(--text-main);">${titleText}</strong>
                    </div>
                </a>
            </article>`;
        }).join('');
        
        mediaList.innerHTML = `<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap: 1rem;">${mediaHtml}</div>`;
    } catch (err) {
        mediaList.innerHTML = '<p style="color:red; text-align: center;">ไม่สามารถโหลดวิดีโอได้</p>';
    }
}

export async function handleSuggestKnowledgeLink() {
    const { data: instruments, error: typeError } = await instrumentsExt.getTypes();
    if (typeError) return Swal.fire('ผิดพลาด', 'ไม่สามารถโหลดประเภทเครื่องดนตรีได้', 'error');
    const uniqueTypes = [...new Set(instruments.map(i => i.type).filter(Boolean))];
    const typeOptionsHtml = uniqueTypes.map(type => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`).join('');

    const { value: formValues } = await Swal.fire({
        title: 'เสนอลิงก์ความรู้เข้าระบบ',
        html: `
            <div style="text-align:left;">
                <p><small>ลิงก์ของคุณจะถูกส่งให้แอดมินตรวจสอบก่อนแสดงในระบบ</small></p>
                <label for="swal-kn-type">ประเภทเครื่องดนตรี*</label>
                <select id="swal-kn-type" class="swal2-input" required><option value="" disabled selected>-- เลือก --</option>${typeOptionsHtml}</select>
                <label for="swal-kn-title">ชื่อคลิป/หัวข้อ*</label>
                <input id="swal-kn-title" class="swal2-input" placeholder="เช่น เทคนิคการไล่สเกลกีตาร์" required>
                <label for="swal-kn-url">ลิงก์ YouTube*</label>
                <input id="swal-kn-url" type="url" class="swal2-input" placeholder="http://googleusercontent.com/youtube.com/..." required>
            </div>`,
        confirmButtonText: 'ส่งให้แอดมินตรวจสอบ',
        focusConfirm: false,
        showCancelButton: true,
        cancelButtonText: 'ยกเลิก',
        preConfirm: () => {
            const instrument_type = document.getElementById('swal-kn-type').value;
            const title = document.getElementById('swal-kn-title').value;
            const youtube_url = document.getElementById('swal-kn-url').value;
            if (!instrument_type || !title || !youtube_url) {
                Swal.showValidationMessage('กรุณากรอกข้อมูลให้ครบทุกช่อง');
                return false;
            }
            return { instrument_type, title, youtube_url };
        }
    });

    if (formValues) {
        Swal.showLoading();
        try {
            if(!getCurrentUser()) throw new Error("ไม่พบข้อมูลผู้ใช้");

            const { error } = await knowledgeExt.suggestLink({
                ...formValues,
                submitted_by: getCurrentUser()?.id,
                is_approved: false 
            });
            if (error) throw error;
            await Swal.fire('ส่งสำเร็จ!', 'ขอบคุณสำหรับข้อมูล! แอดมินจะทำการตรวจสอบในเร็วๆ นี้', 'success');
        } catch (err) {
            await Swal.fire('ผิดพลาด', err.message, 'error');
        }
    }
}

export function createRankingTableHTML(data, footerText = '') {
    if (!data || data.length === 0) return '<p style="text-align:center; padding: 1rem;">ยังไม่มีข้อมูลเวลาซ้อม</p>';
    const tableRows = data.map(row => {
        const isCurrentUserRow = row.is_current_user;
        return `<tr ${isCurrentUserRow ? 'class="user-rank-highlight"' : ''}><td style="width: 1%; text-align: center;">${row.rank}</td><td>${escapeHtml(row.full_name)} ${isCurrentUserRow ? '(คุณ)' : ''}</td><td style="width: 1%; white-space: nowrap; text-align: right;">${typeof formatMinutesToHoursMinutes === 'function' ? formatMinutesToHoursMinutes(row.total_minutes) : row.total_minutes}</td></tr>`;
    }).join('');
    const footerHtml = footerText ? `<small style="margin-top: 0.5rem; text-align: right; display: block;">${footerText}</small>` : '';
    return `<table role="grid"><thead><tr><th style="width: 1%; text-align: center; min-width: 120px;">อันดับ</th><th>ชื่อ</th><th style="text-align: right; min-width: 200px;">เวลาซ้อม (ชม.)</th></tr></thead><tbody>${tableRows}</tbody></table>${footerHtml}`;
}

export async function renderPracticeRanking() {
    const container = document.getElementById('practice-ranking-list');
    if (!container) return;
    container.setAttribute('aria-busy', 'true');
    try {
        const { data, error } = await rankingsExt.getClubRanking(currentUser?.id);
        if (error) throw error;
        container.innerHTML = createRankingTableHTML(data);
    } catch (err) {
        container.innerHTML = `<p style="color:red">โหลดข้อมูลอันดับล้มเหลว: ${err.message}</p>`;
    } finally {
        container.removeAttribute('aria-busy');
    }
}

export async function renderClassPracticeRanking() {
    const container = document.getElementById('class-ranking-list');
    if (!container) return;
    container.setAttribute('aria-busy', 'true');
    try {
        const { data, error } = await rankingsExt.getClassRanking(currentUser?.id);
        if (error) throw error;
        container.innerHTML = createRankingTableHTML(data, '*นับเฉพาะการยืมและคืนตรงเวลา');
    } catch (err) {
        container.innerHTML = `<p style="color:red">โหลดข้อมูลอันดับล้มเหลว: ${err.message}</p>`;
    } finally {
        container.removeAttribute('aria-busy');
    }
}

export function createLeaderboardHtml(gameTitle, data) {
    if (!data) return `<p>${gameTitle}: ไม่สามารถโหลดข้อมูลได้</p>`;
    const groupTranslations = { student: 'นักเรียน', club: 'ชุมนุม', teacher: 'ครู', guest: 'ทั่วไป' };
    const top10Rows = (data.top_10 || []).map(row => {
        const subtext = [row.nickname, row.class_level, groupTranslations[row.student_group]].filter(Boolean).join(' • ');
        return `<tr><td style="text-align: center;">${row.rank}</td><td>${escapeHtml(row.full_name)}<style="display: block; color: var(--pico-secondary);">(${escapeHtml(subtext)})</style></td><td style="text-align: right;">${row.highscore.toLocaleString()}</td></tr>`;
    }).join('');
    return `<h5 style="margin-bottom: 0.5rem;">${gameTitle}</h5><p style="margin-bottom: 1rem;">คะแนนสูงสุดของคุณ: <strong>${data.user_highscore.toLocaleString()}</strong></p><figure class="table-container" style="max-height: 250px; overflow-y: auto;"><table role="grid"><thead><tr><th style="text-align: center;">อันดับ</th><th>ชื่อ</th><th style="text-align: right;">คะแนน</th></tr></thead><tbody>${top10Rows || '<tr><td colspan="3" style="text-align:center;">ยังไม่มีข้อมูลอันดับ</td></tr>'}</tbody></table></figure>`;
}

export async function renderGameLeaderboards() {
    const staffwarsContainer = document.getElementById('staffwars-leaderboard');
    const rhythmcoreContainer = document.getElementById('rhythmcore-leaderboard');

    if (staffwarsContainer) {
        try {
            const { data, error } = await gamesExt.getLeaderboard('staffwars', currentUser?.id);
            if (error) throw error;
            staffwarsContainer.innerHTML = createLeaderboardHtml('⚔️ Staff Wars', data);
        } catch (err) { staffwarsContainer.innerHTML = `<p>⚔️ Staff Wars: เกิดข้อผิดพลาด - ${err.message}</p>`; }
        finally { staffwarsContainer.removeAttribute('aria-busy'); }
    }
    
    if (rhythmcoreContainer) {
        try {
            const { data, error } = await gamesExt.getLeaderboard('rhythm_core', currentUser?.id);
            if (error) throw error;
            rhythmcoreContainer.innerHTML = createLeaderboardHtml('🥁 Rhythm Core', data);
        } catch (err) { rhythmcoreContainer.innerHTML = `<p>🥁 Rhythm Core: เกิดข้อผิดพลาด - ${err.message}</p>`; }
        finally { rhythmcoreContainer.removeAttribute('aria-busy'); }
    }
}

export async function renderNotificationCenter() {
    Swal.fire({
        title: 'ศูนย์การแจ้งเตือน',
        background: '#ffffff',
        color: '#1e293b',
        html: `<div id="notification-list-container" aria-busy="true" style="min-height: 300px; color: #1e293b;"></div>`,
        width: '600px',
        showCloseButton: true,
        showConfirmButton: false,
        didOpen: async () => {
            const container = document.getElementById('notification-list-container');
            try {
                const { data: notificationsData, error } = await notificationsExt.getRecent(currentUser.id, 20);
                if (error) throw error;

                if (!notificationsData || notificationsData.length === 0) {
                    container.innerHTML = `<p style="text-align: center; padding: 2rem; color: #1e293b;">ยังไม่มีการแจ้งเตือน</p>`;
                    return;
                }

                const TXT = '#1e293b';
                const MUTED = '#64748b';
                const BORDER = '#e2e8f0';
                const UNREAD_BG = 'rgba(59,130,246,0.06)';
                const ACCENT = '#3B82F6';

                const notificationHtml = notificationsData.map(n => {
                    const bg = n.is_read ? 'transparent' : UNREAD_BG;
                    const borderLeft = n.is_read ? `1px solid ${BORDER}` : `3px solid ${ACCENT}`;
                    return `
                    <div class="notification-item ${n.is_read ? 'read' : 'unread'}" data-id="${n.id}" style="padding: 1rem; margin-bottom: 0.5rem; border: 1px solid ${BORDER}; border-left: ${borderLeft}; border-radius: 0.75rem; cursor: pointer; background: ${bg}; color: ${TXT};">
                        <p style="font-weight: 700; margin: 0 0 0.25rem 0; color: ${TXT}; font-size: 0.95rem;">${escapeHtml(n.title)}</p>
                        <p style="margin: 0.25rem 0; color: ${TXT}; font-size: 0.875rem; line-height: 1.4;">${escapeHtml(n.body)}</p>
                        <small style="text-align: left; margin: 0.5rem 0 0 0; color: ${MUTED}; display: block; font-size: 0.75rem;">${timeAgo(n.created_at)}</small>
                    </div>
                    `;
                }).join('');
                
                container.innerHTML = `<div style="max-height: 60vh; overflow-y: auto;">${notificationHtml}</div>`;
                
                const unreadIds = notificationsData.filter(n => !n.is_read).map(n => n.id);
                if (unreadIds.length > 0) {
                    await notificationsExt.markAsRead(unreadIds);
                }

            } catch (err) {
                container.innerHTML = `<p style="color: red;">ไม่สามารถโหลดการแจ้งเตือนได้: ${err.message}</p>`;
            } finally {
                container.removeAttribute('aria-busy');
            }
        }
    });
}

export function handleUniversalScan() {
    Swal.fire({
        title: 'สแกน QR Code',
        html: '<div id="qr-reader" style="width: 100%; max-width: 400px; margin: auto;"></div>',
        showCancelButton: true,
        cancelButtonText: 'ยกเลิก',
        showConfirmButton: false,
        didOpen: () => {
            if (typeof Html5Qrcode === 'undefined') {
                return Swal.fire('ข้อผิดพลาด', 'ไลบรารีสแกนเนอร์ยังไม่ถูกโหลด', 'error');
            }
            const html5QrCode = new Html5Qrcode("qr-reader");
            const qrCodeSuccessCallback = (decodedText) => {
                html5QrCode.stop().then(() => {
                    Swal.close();
                    
                    let instrumentId = null;
                    try {
                        if (decodedText.includes('?')) {
                            const urlParams = new URLSearchParams(new URL(decodedText).search);
                            instrumentId = urlParams.get('scan');
                        } else if (!isNaN(decodedText)) {
                            instrumentId = decodedText;
                        }
                    } catch (e) {
                        console.warn("URL Parsing Error:", e);
                    }

                    if (!instrumentId) {
                        return Swal.fire('ผิดพลาด', 'QR Code ไม่ถูกต้องหรือไม่ใช่ QR ของระบบนี้', 'error');
                    }

                    processQrScan(instrumentId);
                }).catch(err => console.error("Failed to stop QR scanner:", err));
            };
            const config = { fps: 10, qrbox: { width: 250, height: 250 } };
            html5QrCode.start({ facingMode: "environment" }, config, qrCodeSuccessCallback)
                .catch(err => Swal.fire('ผิดพลาด', 'ไม่สามารถเปิดกล้องได้ ให้สิทธิ์การเข้าถึงกล้องหรือยัง?', 'error'));
        }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// 🚀 ฟังก์ชันสแกน QR Code เพื่อทำรายการยืม-คืนด่วน
// ─────────────────────────────────────────────────────────────────────────────
export async function processQrScan(instrumentId) {
    if (!instrumentId) return;

    if (currentUser && currentUser.role === 'admin') {
        Swal.fire('แอดมิน', `สแกน QR Code ของเครื่องดนตรี ID: ${instrumentId}`, 'info');
        return;
    }

    if (!currentUser) {
        localStorage.setItem('pendingScanId', instrumentId);
        return Swal.fire('กรุณาล็อกอิน', 'คุณต้องเข้าสู่ระบบก่อนทำรายการผ่าน QR Code', 'info');
    }

    Swal.fire({ title: 'กำลังตรวจสอบข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        // ใช้ชื่อตัวแปรที่ชัดเจน ป้องกัน Reference Error
        const { data: scanResult, error: fetchError } = await instrumentsExt.getScanDetails(Number(instrumentId));
        if (fetchError) throw fetchError;
        if (!scanResult) throw new Error(`ไม่พบเครื่องดนตรี ID: ${instrumentId} ในระบบ`);

        const { instrument_name, status, is_borrowed_by_current_user } = scanResult;

        if (status === 'พร้อมใช้งาน') {
            if (currentUser.is_blocked) return Swal.fire('บัญชีถูกระงับ', `คุณถูกระงับการใช้งานเนื่องจาก: ${currentUser.block_reason || 'ไม่ระบุ'}`, 'error');

            // ใช้ then(result) อย่างระมัดระวัง หรือใช้ await destructuring { isConfirmed } แบบนี้ครับ
            const { isConfirmed } = await Swal.fire({ 
                title: '🎶 ข้อตกลงการยืม 🎶',
                html: `คุณกำลังจะยืม: <strong>${escapeHtml(instrument_name)}</strong><br><br>โปรดปฏิบัติตามกติกาอย่างเคร่งครัด`, 
                icon: 'info', 
                showCancelButton: true, 
                confirmButtonText: 'ยอมรับ และ ยืนยันการยืม', 
                cancelButtonText: 'ยกเลิก'
            });

            if (isConfirmed) { 
                Swal.fire({ title: 'กำลังบันทึกรายการ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
                
                // ตัวแปร borrowResult ถูกประกาศตรงนี้ ใช้งานได้ปลอดภัย
                const { data: borrowResult, error } = await borrowExt.borrowInstrumentAtomic(
                    Number(instrumentId), 
                    currentUser.id, 
                    false, 
                    null, 
                    false
                );
                
                if (error) throw error;
                
                await Swal.fire('สำเร็จ!', borrowResult?.message || 'ทำรายการยืมเรียบร้อย', 'success');
                
                if(typeof refreshOnReturn === 'function') await refreshOnReturn();
            }
        } else if (status === 'ถูกยืมอยู่' && is_borrowed_by_current_user) {
            // โยนเข้าฟังก์ชันคืนเครื่อง
            handleReturnInstrument(instrumentId, instrument_name, document.body);
        } else {
            Swal.fire('ไม่พร้อมใช้งาน', `"${escapeHtml(instrument_name)}" อยู่ในสถานะ "${escapeHtml(status)}"`, 'warning');
        }
    } catch (err) {
        console.error('[QR Scan Error]:', err);
        Swal.fire('เกิดข้อผิดพลาด!', err?.message || 'ไม่สามารถทำรายการได้ในขณะนี้', 'error');
    }
}

export async function handleReturnInstrument(instrumentId, instrumentName, button) {
    const { isConfirmed, isDenied } = await Swal.fire({
        title: `คืน ${instrumentName}?`, 
        text: "เครื่องดนตรีอยู่ในสภาพดีหรือไม่?", 
        icon: 'question',
        showDenyButton: true, 
        showCancelButton: true,
        confirmButtonText: '✅ สภาพดี, คืนเลย', 
        denyButtonText: '❌ มีปัญหา, แจ้งซ่อม', 
        cancelButtonText: 'ยกเลิก'
    });

    if (isConfirmed) {
        if(button && button.setAttribute) button.setAttribute('aria-busy', 'true');
        Swal.fire({ title: 'กำลังตรวจสอบการคืน...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        
        try {
            const { data, error } = await borrowExt.returnInstrument(Number(instrumentId), currentUser.id);
            if (error) throw error;
            
            await Swal.fire('สำเร็จ!', data?.message || 'คืนเครื่องดนตรีเรียบร้อยแล้ว', 'success');
            
            if (data?.log_id) {
                const { data: newBadges, error: badgeError } = await badgesExt.checkAndAward(currentUser.id, data.log_id);
                if (!badgeError && newBadges && newBadges.length > 0) {
                    for (const badge of newBadges) {
                        Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'ได้รับเหรียญตราใหม่!', html: `<b>${escapeHtml(badge.badge_name)}</b>`, showConfirmButton: false, timer: 4000 });
                    }
                    if (typeof renderMyBadges === 'function') renderMyBadges(currentUser.id);
                }
            }
        } catch (error) { 
            await Swal.fire('ผิดพลาด!', error?.message || 'ไม่สามารถคืนอุปกรณ์ได้', 'error'); 
        } finally { 
            if(typeof refreshOnReturn === 'function') await refreshOnReturn();
            if(button && button.removeAttribute) button.removeAttribute('aria-busy'); 
        }
    }

    if (isDenied) {
        const { value: problemDescription } = await Swal.fire({
            title: 'แจ้งซ่อม ' + instrumentName, 
            input: 'textarea', 
            inputLabel: 'กรุณาอธิบายอาการชำรุด',
            inputPlaceholder: 'เช่น สายขาด, มีรอยร้าว, ลูกสูบค้าง...', 
            showCancelButton: true,
            confirmButtonText: 'ยืนยันการแจ้งซ่อม', 
            inputValidator: (value) => !value && 'กรุณาอธิบายปัญหา!'
        });
        
        if (problemDescription) {
            if(button && button.setAttribute) button.setAttribute('aria-busy', 'true');
            Swal.fire({ title: 'กำลังบันทึกข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            
            try {
                const { data, error } = await borrowExt.returnInstrument(Number(instrumentId), currentUser.id, problemDescription);
                if (error) throw error;
                
                await Swal.fire('ขอบคุณสำหรับข้อมูล!', data?.message || 'บันทึกการแจ้งซ่อมเรียบร้อยแล้ว', 'success');
                
                if (data?.log_id) {
                    const { data: newBadges, error: badgeError } = await badgesExt.checkAndAward(currentUser.id, data.log_id);
                    if (!badgeError && newBadges && newBadges.length > 0) {
                        for (const badge of newBadges) {
                            Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'ได้รับเหรียญตราใหม่!', html: `<b>${escapeHtml(badge.badge_name)}</b>`, showConfirmButton: false, timer: 4000 });
                        }
                        if (typeof renderMyBadges === 'function') renderMyBadges(currentUser.id);
                    }
                }
            } catch (error) { 
                await Swal.fire('ผิดพลาด!', error?.message || 'บันทึกการแจ้งซ่อมล้มเหลว', 'error'); 
            } finally { 
                if(typeof refreshOnReturn === 'function') await refreshOnReturn();
                if(button && button.removeAttribute) button.removeAttribute('aria-busy'); 
            }
        }
    }
}

const noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
function getNoteFromPitch(frequency, refPitch) {
    if (frequency === -1) return "--";
    const noteNum = 12 * (Math.log(frequency / refPitch) / Math.log(2));
    return Math.round(noteNum) + 69;
}
function getNoteString(noteNum) {
    if (noteNum === "--") return "--";
    return noteStrings[noteNum % 12];
}
function getCents(frequency, noteNum, refPitch) {
    if (frequency === -1 || noteNum === "--") return "-";
    const standardFrequency = refPitch * Math.pow(2, (noteNum - 69) / 12);
    return Math.floor(1200 * Math.log(frequency / standardFrequency) / Math.log(2));
}
function autoCorrelate(buf, sampleRate) {
    const SIZE = buf.length;
    const rms = Math.sqrt(buf.reduce((sum, val) => sum + val * val, 0) / SIZE);
    if (rms < 0.01) return -1; 

    let r1 = 0, r2 = SIZE - 1, thres = 0.2;
    for (let i = 0; i < SIZE / 2; i++) { if (Math.abs(buf[i]) < thres) { r1 = i; break; } }
    for (let i = 1; i < SIZE / 2; i++) { if (Math.abs(buf[SIZE - i]) < thres) { r2 = SIZE - i; break; } }

    buf = buf.slice(r1, r2);
    const newSize = buf.length;
    const c = new Array(newSize).fill(0);
    for (let i = 0; i < newSize; i++) {
        for (let j = 0; j < newSize - i; j++) { c[i] = c[i] + buf[j] * buf[j + i]; }
    }
    let d = 0;
    while (d < c.length && c[d] > c[d + 1]) d++;
    let maxval = -1, maxpos = -1;
    for (let i = d; i < newSize; i++) {
        if (c[i] > maxval) { maxval = c[i]; maxpos = i; }
    }
    let T0 = maxpos;
    const x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1];
    const a = (x1 + x3 - 2 * x2) / 2;
    const b = (x3 - x1) / 2;
    if (a) T0 = T0 - b / (2 * a);
    return sampleRate / T0;
}

export function setupNativeTuner() {
    let tunerState = {
        audioContext: null, stream: null, analyserNode: null,
        animationFrameId: null, isInitialized: false, dataArray: null
    };

    const tunerElement = document.getElementById('native-tuner');
    if (!tunerElement) return;

    const noteNameEl = tunerElement.querySelector('.tuner-note-name');
    const freqEl = tunerElement.querySelector('.tuner-freq-display');
    const centEl = tunerElement.querySelector('.tuner-cent-display');
    const indicatorEl = tunerElement.querySelector('.tuner-indicator');
    const toggleBtn = document.getElementById('toggle-tuner-btn'); 
    const refPitchInput = document.getElementById('reference-pitch-input');

    let currentRefPitch = 440; 
    if (refPitchInput) {
        currentRefPitch = parseFloat(refPitchInput.value) || 440;
        refPitchInput.addEventListener('input', () => { currentRefPitch = parseFloat(refPitchInput.value) || 440; });
    }

    const updateTunerDisplay = () => {
        if (!tunerState.isInitialized) return;
        tunerState.analyserNode.getFloatTimeDomainData(tunerState.dataArray);
        const pitch = autoCorrelate(tunerState.dataArray, tunerState.audioContext.sampleRate);
        
        if (pitch !== -1) {
            const noteNum = getNoteFromPitch(pitch, currentRefPitch);
            const noteStr = getNoteString(noteNum);
            const cents = getCents(pitch, noteNum, currentRefPitch);

            noteNameEl.textContent = noteStr.replace("#", "♯");
            freqEl.textContent = `${pitch.toFixed(1)} Hz`;
            centEl.textContent = `${cents} cents`;
            
            const clampedDetune = Math.max(-50, Math.min(50, cents));
            const needlePositionPercent = ((clampedDetune + 50) / 100) * 100;
            indicatorEl.style.left = `${needlePositionPercent}%`;

            if (Math.abs(cents) < 5) tunerElement.classList.add('in-tune');
            else tunerElement.classList.remove('in-tune');

            if (Math.abs(cents) <= 3) noteNameEl.classList.add('note-in-tune');
            else noteNameEl.classList.remove('note-in-tune');
        } else {
            tunerElement.classList.remove('in-tune');
            noteNameEl.classList.remove('note-in-tune');
        }
        tunerState.animationFrameId = window.requestAnimationFrame(updateTunerDisplay);
    };

    const startTuner = async () => {
        if (tunerState.isInitialized) return;
        toggleBtn.setAttribute('aria-busy', 'true');
        refPitchInput.disabled = true; 
        try {
            tunerState.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            tunerState.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            if (tunerState.audioContext.state === 'suspended') await tunerState.audioContext.resume();
            
            tunerState.analyserNode = tunerState.audioContext.createAnalyser();
            tunerState.analyserNode.fftSize = 2048;
            tunerState.dataArray = new Float32Array(tunerState.analyserNode.fftSize);
            const sourceNode = tunerState.audioContext.createMediaStreamSource(tunerState.stream);
            sourceNode.connect(tunerState.analyserNode);
            tunerState.isInitialized = true;
            updateTunerDisplay();
            toggleBtn.innerHTML = '🟢 กำลังทำงาน';
            toggleBtn.classList.remove('contrast');
            toggleBtn.classList.add('secondary');
        } catch (err) {
            console.error("เกิดข้อผิดพลาดในการตั้งค่าจูนเนอร์:", err);
            stopTuner();
        } finally {
            toggleBtn.removeAttribute('aria-busy');
        }
    };

    const stopTuner = () => {
        if (!tunerState.isInitialized && !tunerState.stream) return;
        refPitchInput.disabled = false;
        if (tunerState.animationFrameId) window.cancelAnimationFrame(tunerState.animationFrameId);
        if (tunerState.stream) tunerState.stream.getTracks().forEach(track => track.stop());
        if (tunerState.audioContext && tunerState.audioContext.state !== 'closed') tunerState.audioContext.close();
        tunerState = { audioContext: null, stream: null, analyserNode: null, animationFrameId: null, isInitialized: false, dataArray: null };
        noteNameEl.textContent = '--';
        freqEl.textContent = `${currentRefPitch.toFixed(1)} Hz`; 
        centEl.textContent = '-';
        indicatorEl.style.transform = 'translateX(0)';
        indicatorEl.style.backgroundColor = 'var(--pico-primary)';
        if(toggleBtn) {
            toggleBtn.innerHTML = '🔴 ปิดอยู่';
            toggleBtn.classList.remove('secondary');
            toggleBtn.classList.add('contrast');
        }
    };
    
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            if (tunerState.isInitialized) stopTuner();
            else startTuner();
        });
    }
}

export function setupMetronome() {
    const metronome = {
        audioContext: null, isPlaying: false, nextNoteTime: 0.0, currentBeatInBar: 0,
        scheduleAheadTime: 0.1, lookahead: 25.0, timerID: 0, bpm: 120, timeSignature: 4,
        subdivision: 1, tapTempoTimestamps: [],
    };

    const bpmSlider = document.getElementById('bpm-slider');
    const bpmDisplay = document.getElementById('bpm-display');
    const timeSignatureSelect = document.getElementById('time-signature-select');
    const subdivisionSelect = document.getElementById('subdivision-select');
    const startStopBtn = document.getElementById('metronome-start-stop-btn');
    const tapTempoBtn = document.getElementById('tap-tempo-btn');
    const visualIndicator = document.getElementById('metronome-visual-indicator');

    function scheduleNote(beatNumber, time) {
        if (!metronome.audioContext) return;
        const osc = metronome.audioContext.createOscillator();
        const gain = metronome.audioContext.createGain();
        gain.gain.setValueAtTime(1, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
        osc.connect(gain);
        gain.connect(metronome.audioContext.destination);
        osc.frequency.value = (beatNumber % metronome.timeSignature === 0) ? 1200 : 880;
        setTimeout(() => {
            visualIndicator.classList.add(beatNumber % metronome.timeSignature === 0 ? 'beat-1' : 'beat-other');
            setTimeout(() => { visualIndicator.classList.remove('beat-1', 'beat-other'); }, 80);
        }, (time - metronome.audioContext.currentTime) * 1000);
        osc.start(time);
        osc.stop(time + 0.05);
    }

    function scheduler() {
        while (metronome.nextNoteTime < metronome.audioContext.currentTime + metronome.scheduleAheadTime) {
            const secondsPerBeat = 60.0 / metronome.bpm;
            for (let i = 0; i < metronome.subdivision; i++) {
                const time = metronome.nextNoteTime + i * (secondsPerBeat / metronome.subdivision);
                scheduleNote(metronome.currentBeatInBar, time);
            }
            metronome.currentBeatInBar = (metronome.currentBeatInBar + 1) % metronome.timeSignature;
            metronome.nextNoteTime += secondsPerBeat;
        }
        metronome.timerID = window.setTimeout(scheduler, metronome.lookahead);
    }

    function play() {
        if (metronome.isPlaying) return;
        if (metronome.audioContext === null) metronome.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        metronome.isPlaying = true;
        metronome.currentBeatInBar = 0;
        metronome.nextNoteTime = metronome.audioContext.currentTime + 0.1;
        scheduler();
        startStopBtn.textContent = '◼︎ หยุด';
        startStopBtn.classList.remove('contrast');
    }

    function stop() {
        metronome.isPlaying = false;
        window.clearTimeout(metronome.timerID);
        startStopBtn.textContent = '▶︎ เริ่ม';
        startStopBtn.classList.add('contrast');
    }

    function handleTapTempo() {
        const now = performance.now();
        metronome.tapTempoTimestamps.push(now);
        if (metronome.tapTempoTimestamps.length > 1) {
            const intervals = [];
            for (let i = 1; i < metronome.tapTempoTimestamps.length; i++) {
                intervals.push(metronome.tapTempoTimestamps[i] - metronome.tapTempoTimestamps[i-1]);
            }
            const avgInterval = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
            const newBpm = Math.round(60000 / avgInterval);
            if(newBpm >= 40 && newBpm <= 240) {
                metronome.bpm = newBpm;
                bpmSlider.value = newBpm;
                bpmDisplay.textContent = newBpm;
            }
        }
        setTimeout(() => {
            const lastTap = metronome.tapTempoTimestamps[metronome.tapTempoTimestamps.length - 1];
            if (performance.now() - lastTap > 2000) metronome.tapTempoTimestamps = [];
        }, 2000);
    }

    if(bpmSlider) bpmSlider.addEventListener('input', (e) => { metronome.bpm = parseInt(e.target.value); bpmDisplay.textContent = metronome.bpm; });
    if(timeSignatureSelect) timeSignatureSelect.addEventListener('input', (e) => { metronome.timeSignature = parseInt(e.target.value); });
    if(subdivisionSelect) subdivisionSelect.addEventListener('input', (e) => { metronome.subdivision = parseInt(e.target.value); });
    if(startStopBtn) startStopBtn.addEventListener('click', () => { if (metronome.isPlaying) stop(); else play(); });
    if(tapTempoBtn) tapTempoBtn.addEventListener('click', handleTapTempo);
}

export function lazyLoadSection(sectionSelector, loadingFunction) {
    const section = document.querySelector(sectionSelector);
    if (!section) return;

    const observer = new IntersectionObserver((entries, observerInstance) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                loadingFunction();
                observerInstance.unobserve(entry.target);
            }
        });
    }, { rootMargin: '0px 0px 200px 0px' });

    observer.observe(section);
}

export function timeAgo(date) {
    if (!date) return '';
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    if (seconds < 5) return "เมื่อสักครู่";
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " ปีที่แล้ว";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " เดือนที่แล้ว";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " วันที่แล้ว";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " ชั่วโมงที่แล้ว";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " นาทีที่แล้ว";
    return Math.floor(seconds) + " วินาทีที่แล้ว";
}

export async function checkBorrowingStatusAndNotify() {
        if (!currentUser) return;
        try {
            const { data: statusData, error } = await borrowExt.getCurrentBorrowingStatus(currentUser.id);
            if (error) throw error;
            if (statusData && statusData.overdue_items && statusData.overdue_items.length > 0) {
                const overdueList = statusData.overdue_items.map(item => `<li>${escapeHtml(item.instrument_name)} (ครบกำหนดคืน: ${new Date(item.due_date).toLocaleDateString()})</li>`).join('');
                Swal.fire({
                    title: 'แจ้งเตือน: มีเครื่องดนตรีที่ครบกำหนดคืนแล้ว!',
                    html: `<p>คุณมีเครื่องดนตรีที่ครบกำหนดคืนแล้ว กรุณารีบคืนเพื่อหลีกเลี่ยงการถูกระงับสิทธิ์ยืมในอนาคต:</p><ul style="text-align: left;">${overdueList}</ul>`,
                    icon: 'warning',
                    confirmButtonText: 'รับทราบ'
                });
            }
        } catch (err) {
            console.error("ไม่สามารถตรวจสอบสถานะการยืมได้:", err);
        }
}