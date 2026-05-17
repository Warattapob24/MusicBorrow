/**
 * student-dashboard.js
 *
 * Modern Mobile-First SPA Student Dashboard
 * Fully integrated with Supabase, Tuner, Metronome, and Gamification.
 * ✨ FIXED: ผูก CSS Variables สำหรับระบบ Theme Switcher เรียบร้อยแล้ว
 * ✨ FIXED: ปรับชื่อหน้าโปรไฟล์ไม่ให้ตัดบรรทัด และแสดงอันดับแค่ 10 อันดับแรก
 */

// นำ supabase ออกและ import api เข้ามาแทน
import { authApi, notificationsExt, borrowExt, usersExt, repair, 
         instrumentsExt, realtimeApi, gamesExt, knowledgeExt, statsApi, 
         badgesExt, rankingsExt, bossesApi, raidApi } from './api.js';
import { currentUser, setCurrentUser, getCurrentUser } from './auth.js';
import { escapeHtml, translateGroup, parseMediaUrl } from './utils.js';
import { buildPlayerCardHTML, triggerLevelUp, sharePlayerCard  } from './player-card.js';

// เปลี่ยนจากการเรียก setView โดยตรง เป็นการเปลี่ยน Hash แทน
window.__sdSetView = (viewName) => {
    if (window.location.hash !== `#${viewName}`) {
        window.location.hash = viewName;
    } else {
        // Fallback กรณีอยู่ที่ hash เดิมแล้วเรียกซ้ำ
        setView(viewName, getCurrentUser()); 
    }
};

// ดักจับเมื่อผู้ใช้กด Back/Forward หรือ URL Hash เปลี่ยน
window.addEventListener('hashchange', () => {
    const viewName = window.location.hash.replace('#', '') || 'home';
    // ตรวจสอบ View ที่อนุญาต (ป้องกันมั่ว Hash)
    const validViews = ['home', 'borrow', 'repairs', 'knowledge', 'games', 'profile'];
    if (validViews.includes(viewName)) {
        setView(viewName, getCurrentUser());
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// 🎸 TUNING PRESETS (Structured Data)
// ─────────────────────────────────────────────────────────────────────────────
const TUNING_PRESETS = {
    "Chromatic (ทุกโน้ต)": {
        "Key C (Concert)": ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"],
        "Key Bb (Trumpet, Tenor Sax)": ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"],
        "Key Eb (Alto, Bari Sax)": ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"],
        "Key F (French Horn)": ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    },
    "Guitar": {
        "6 String Standard": ["E2", "A2", "D3", "G3", "B3", "E4"],
        "Drop D": ["D2", "A2", "D3", "G3", "B3", "E4"],
        "Open D": ["D2", "A2", "D3", "F#3", "A3", "D4"],
        "Open G": ["D2", "G2", "D3", "G3", "B3", "D4"],
        "Open E": ["E2", "B2", "E3", "G#3", "B3", "E4"],
        "DADGAD": ["D2", "A2", "D3", "G3", "A3", "D4"],
        "Eb Standard": ["Eb2", "Ab2", "Db3", "Gb3", "Bb3", "Eb4"],
        "Drop C": ["C2", "G2", "C3", "F3", "A3", "D4"]
    },
    "Bass": {
        "4 String Standard": ["E1", "A1", "D2", "G2"],
        "4 String Drop D": ["D1", "A1", "D2", "G2"],
        "4 String Eb": ["Eb1", "Ab1", "Db2", "Gb2"],
        "4 String Drop C": ["C1", "G1", "C2", "F2"],
        "5 String Standard": ["B0", "E1", "A1", "D2", "G2"],
        "5 String High C": ["E1", "A1", "D2", "G2", "C3"],
        "6 String Standard": ["B0", "E1", "A1", "D2", "G2", "C3"]
    },
    "Ukulele": {
        "Standard C": ["G4", "C4", "E4", "A4"],
        "D Tuning": ["A4", "D4", "F#4", "B4"],
        "Low G": ["G3", "C4", "E4", "A4"],
        "Low A": ["A3", "D4", "F#4", "B4"],
        "Open C": ["G4", "C4", "E4", "G4"],
        "B Tuning": ["F#4", "B3", "D#4", "G#4"],
        "C# Tuning": ["G#4", "C#4", "F4", "A#4"]
    },
    "Violin Family": {
        "Violin": ["G3", "D4", "A4", "E5"],
        "Viola": ["C3", "G3", "D4", "A4"],
        "Cello": ["C2", "G2", "D3", "A3"],
        "Double Bass": ["E1", "A1", "D2", "G2"]
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// 🧩 UI COMPONENTS (Component Reusability)
// ─────────────────────────────────────────────────────────────────────────────
export function renderUnifiedCard({ emoji, title, subtitle, customContent = '', extraStyles = "padding-bottom: 1.5rem; text-align: center;" }) {
    let headerHtml = '';
    if (title || subtitle) {
        headerHtml = `
            <div class="sd-page-header" style="margin-bottom: 0;">
                ${title ? `<h2 class="sd-page-title" style="color: var(--sd-accent-color) !important;">${title}</h2>` : ''}
                ${subtitle ? `<p class="sd-page-subtitle" style="color: var(--sd-accent-color); opacity: 0.9;">${subtitle}</p>` : ''}
            </div>`;
    }
    return `
        <div class="sd-unified-card" style="${extraStyles}">
            ${emoji ? `<div class="sd-unified-bg-emoji">${emoji}</div>` : ''}
            ${headerHtml}
            ${customContent}
        </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. State (ข้อมูลสถานะของแอป)
// ─────────────────────────────────────────────────────────────────────────────
const state = {
    mountEl:    null,
    activeView: 'home',
    availableInstruments: [],
    myBorrowedItems:      [],
    borrowTimerInterval:  null,
    notificationInterval: null,
    realtimeChannel:      null,
    xp:    0,
    level: 0,
    timer: {
        intervalId: null,
        seconds:    0,
        running:    false,
    },
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. Core Functions & Helpers (ป้องกัน ReferenceError)
// ─────────────────────────────────────────────────────────────────────────────
export async function updateNotificationBadge() {
    const cu = getCurrentUser();
    const badge = document.getElementById('notification-badge');
    if (!cu || !badge) return;
    try {
        const { count, error } = await notificationsExt.getUnreadCount(cu.id);
        if (!error && count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    } catch (_) { /* silent */ }
}

export async function checkBorrowingStatusAndNotify() {
    const cu = getCurrentUser();
    if (!cu) return;
    try {
        const { data } = await borrowExt.getMyBorrowedItems(cu.id);
        if (!data?.length) return;
        const sixHoursAgo = new Date(Date.now() - 6 * 3600 * 1000);
        
        const overdue = data.filter(l => 
            !l.is_take_home && 
            l.borrow_type !== 'performance' && 
            new Date(l.borrow_timestamp) < sixHoursAgo
        );
        if (overdue.length > 0) updateNotificationBadge();
    } catch (_) { /* silent */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. ฟังก์ชันคืนเครื่องดนตรี "หลายชิ้นพร้อมกัน" (Bulk Return)
// ─────────────────────────────────────────────────────────────────────────────
document.addEventListener('click', async (e) => {
    const returnSelectedBtn = e.target.closest('#return-selected-btn');
    if (returnSelectedBtn && document.getElementById('borrowed-list')?.contains(returnSelectedBtn)) {
        const cu = getCurrentUser();
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
                // เช็คจำนวนก่อนคืน
                const practiceBefore = (state.myBorrowedItems || []).filter(l => !l.is_take_home && l.borrow_type !== 'take_home').length;
                let totalMins = 0;
                let totalExp = 0;

                for (const box of checkedBoxes) {
                    const { data, error } = await borrowExt.returnInstrument(Number(box.value), cu.id);
                    if (error) throw error;
                    if (data?.practice_minutes) totalMins += data.practice_minutes; // สะสมเวลาถ้าคืนหลายชิ้น
                    if (data?.earned_xp) totalExp += data.earned_xp;
                }
                
                // เช็คจำนวนหลังคืน
                await loadAndRenderMyBorrowedItems(cu.id);
                const practiceAfter = (state.myBorrowedItems || []).filter(l => !l.is_take_home && l.borrow_type !== 'take_home').length;

                // 🟢 โชว์หน้าจอ EXP รวม
                if (practiceBefore > 0 && practiceAfter === 0 && totalMins > 0) {
                    await Swal.fire({
                        title: 'สิ้นสุดการซ้อม! 🎉',
                        html: `คุณคืนเครื่องดนตรีครบแล้ว<br>รวมเวลาซ้อม: <strong>${totalMins} นาที</strong><br>ได้รับ EXP รวม: <strong style="color:var(--pico-primary);">+${totalExp}</strong>`,
                        icon: 'success'
                    });
                } else {
                    await Swal.fire('สำเร็จ!', 'คืนเครื่องดนตรีทั้งหมดเรียบร้อยแล้ว', 'success');
                }

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
    // 3. Checkbox "เลือกทั้งหมด"
    const selectAllCb = e.target.closest('#select-all-checkbox');
    if (selectAllCb && document.getElementById('borrowed-list')?.contains(selectAllCb)) {
        const listEl = document.getElementById('borrowed-list');
        listEl.querySelectorAll('.return-checkbox:not([disabled])').forEach(cb => cb.checked = selectAllCb.checked);
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. ฟังก์ชัน Render รายการที่กำลังยืม (เพิ่มป้ายเวลาให้ชัดเจน)
// ─────────────────────────────────────────────────────────────────────────────
export async function loadAndRenderMyBorrowedItems(userId) {
    if (state.borrowTimerInterval) clearInterval(state.borrowTimerInterval);

    const borrowedSection = document.getElementById('borrowed-section');
    const listEl          = document.getElementById('borrowed-list');
    if (!borrowedSection || !listEl) return;

    listEl.setAttribute('aria-busy', 'true');
    try {
        const { data, error } = await borrowExt.getMyBorrowedItems(userId);
        if (error) throw error;
        state.myBorrowedItems = data || [];

        if (!data?.length) {
            borrowedSection.style.display = 'none';
            listEl.innerHTML = '';
            updateAllTimers();
            return;
        }

        borrowedSection.style.display = 'block';
        const sixHoursAgo = new Date(Date.now() - 6 * 3600 * 1000);
        
        const overdueWarningHtml = data.some(l => !l.is_take_home && l.borrow_type !== 'performance' && new Date(l.borrow_timestamp) < sixHoursAgo)
            ? `<div style="background-color:var(--pico-form-element-background-color); border-left:4px solid var(--pico-del-color); border-radius:8px; padding:1.2rem; margin-bottom:1.5rem; display: flex; gap: 1rem; align-items: flex-start; box-shadow: var(--pico-box-shadow);">
                <div style="font-size: 1.5rem; line-height: 1;">⚠️</div>
                <div>
                    <h5 style="margin:0 0 0.25rem 0; color:var(--pico-del-color); font-size:1rem; font-weight:700;">พบรายการที่อาจลืมคืน!</h5>
                    <p style="margin:0; font-size:0.85rem; color:var(--pico-color); line-height: 1.4;">คุณมีรายการยืมในโรงเรียนที่นานเกิน 6 ชั่วโมง หากใช้งานเสร็จแล้ว กรุณากด <b>คืน</b> เพื่อบันทึกเวลา</p>
                </div>
               </div>`
            : '';

        const itemsHtml = data.map(log => {
            const name = log.instrument_name || 'เครื่องดนตรีที่ถูกลบไปแล้ว';
            let statusHtml = '';
            
            // 🟢 Logic การแสดงผลเวลา (แยกตามประเภทการยืม)
            if (log.is_take_home || log.borrow_type === 'special' || log.borrow_type === 'take_home') {
                if (log.approval_status === 'pending') {
                    statusHtml = `<span style="display:inline-flex; align-items:center; gap:4px; padding: 4px 10px; border-radius: 99px; font-size: 0.75rem; font-weight: bold; background:rgba(245,158,11,0.1); color:#d97706;">⏳ รออนุมัติยืมออก</span>`;
                } else if (log.approval_status === 'rejected') {
                    statusHtml = `<span style="display:inline-flex; align-items:center; gap:4px; padding: 4px 10px; border-radius: 99px; font-size: 0.75rem; font-weight: bold; background:rgba(239,68,68,0.1); color:#dc2626;">❌ คำขอถูกปฏิเสธ</span>`;
                } else {
                    statusHtml = `<span style="display:inline-flex; align-items:center; gap:4px; padding: 4px 10px; border-radius: 99px; font-size: 0.75rem; font-weight: bold; background:rgba(16,185,129,0.1); color:#059669;">
                        🏠 กำหนดคืน: <span class="borrow-timer" data-is-take-home="true" data-due-date="${log.due_date || ''}">กำลังคำนวณ...</span>
                    </span>`;
                }
            } else {
                const modeIcon = log.borrow_type === 'performance' ? '🎭' : '🏫';
                const modeText = log.borrow_type === 'performance' ? 'ออกงาน' : 'กำลังซ้อม';
                statusHtml = `<span style="display:inline-flex; align-items:center; gap:4px; padding: 4px 10px; border-radius: 99px; font-size: 0.75rem; font-weight: bold; background:rgba(59,130,246,0.1); color:#2563eb;">
                    ${modeIcon} ${modeText}: <span class="borrow-timer" data-is-take-home="false" data-borrow-time="${log.borrow_timestamp}">00:00:00</span>
                </span>`;
            }

            const canReturn = log.approval_status !== 'pending';
            
            return `
                <div class="sd-list-item" style="flex-wrap: wrap; gap: 0.5rem; padding: 1rem; background: var(--pico-card-background-color); border: 1px solid var(--pico-muted-border-color); border-radius: 12px; margin-bottom: 0.75rem;">
                    <div style="display: flex; align-items: center; gap: 0.75rem; width: 100%;">
                        <input type="checkbox" class="return-checkbox" data-log-id="${log.id}" value="${log.instrument_id}" ${!canReturn ? 'disabled' : ''} style="width: 22px; height: 22px; flex-shrink: 0; cursor: pointer;">
                        <div class="sd-list-content" style="flex: 1; min-width: 0;">
                            <div class="sd-list-title" style="white-space: normal; word-break: break-word; font-size: 1.05rem; font-weight: 700; color: var(--pico-color); line-height: 1.2;">
                                ${escapeHtml(name)}
                            </div>
                            <div class="sd-list-subtitle" style="margin-top: 0.5rem; display: block;">
                                ${statusHtml}
                            </div>
                        </div>
                        <div style="flex-shrink: 0;">
                            ${canReturn
                                ? `<button type="button" class="sd-btn-danger return-btn" data-id="${log.instrument_id}" data-name="${escapeHtml(name)}" style="padding:0.6rem 1.2rem; font-size:0.85rem; margin: 0; border-radius: 8px;">คืน</button>`
                                : '<small style="color:var(--pico-muted-color); font-size:0.8rem; font-weight: bold;">รออนุมัติ</small>'}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        listEl.innerHTML = `
            ${overdueWarningHtml}
            <form id="return-form" style="margin:0;">
                <div style="margin-bottom: 0.5rem;">
                    ${itemsHtml}
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-top: 1rem; padding: 0.5rem; background: var(--pico-form-element-background-color); border-radius: 8px;">
                    <label style="display:flex; align-items:center; gap:0.5rem; margin:0; font-size:0.9rem; font-weight: bold; color:var(--pico-color); cursor: pointer;">
                        <input type="checkbox" id="select-all-checkbox" style="width:20px; height:20px;"> เลือกทั้งหมด
                    </label>
                    <button type="button" id="return-selected-btn" class="sd-btn-primary" style="padding: 0.5rem 1.2rem; font-size:0.85rem; margin:0; border-radius: 8px;">คืนที่เลือก</button>
                </div>
            </form>`;

        // สั่งให้ตัวจับเวลาเริ่มทำงานทันทีที่เรนเดอร์เสร็จ
        updateAllTimers();
        state.borrowTimerInterval = setInterval(updateAllTimers, 1000);

    } catch (err) {
        listEl.innerHTML = `<p style="color:red; text-align:center;">โหลดข้อมูลล้มเหลว: ${err.message}</p>`;
        borrowedSection.style.display = 'block';
    } finally {
        listEl.removeAttribute('aria-busy');
    }
}

export function timeAgo(date) {
    if (!date) return '';
    const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (s < 5)     return 'เมื่อสักครู่';
    if (s < 60)    return `${s} วินาทีที่แล้ว`;
    if (s < 3600)  return `${Math.floor(s/60)} นาทีที่แล้ว`;
    if (s < 86400) return `${Math.floor(s/3600)} ชั่วโมงที่แล้ว`;
    if (s < 2592000) return `${Math.floor(s/86400)} วันที่แล้ว`;
    if (s < 31536000) return `${Math.floor(s/2592000)} เดือนที่แล้ว`;
    return `${Math.floor(s/31536000)} ปีที่แล้ว`;
}

export function formatMinutesToHoursMinutes(minutes) {
    if (!minutes || minutes === 0) return '0 นาที';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m} นาที`;
    if (m === 0) return `${h} ชม.`;
    return `${h} ชม. ${m} น.`;
}

// student-dashboard.js

// ─────────────────────────────────────────────────────────────────────────────
// 1. ฟังก์ชัน Loop อัปเดตเวลาบนหน้าจอ (UI Sync)
// ─────────────────────────────────────────────────────────────────────────────
export function updateAllTimers() {
    const cu = getCurrentUser();
    if (!cu) return;

    // ก. อัปเดตเวลาใต้ชื่อเครื่องดนตรีที่กำลังยืม
    document.querySelectorAll('.borrow-timer').forEach(el => {
        if (el.dataset.isTakeHome === 'true') {
            el.innerHTML = _formatCountdown(el.dataset.dueDate);
        } else {
            el.textContent = _formatElapsedTime(el.dataset.borrowTime);
        }
    });

    // ข. ซิงค์เวลาเข้ากับ "หน้าเครื่องมือ" (Global Timer)
    const globalTimerEls = document.querySelectorAll('#practice-timer, .practice-timer, #global-timer, .tuner-timer, [data-id="global-practice-time"], #sd-timer-display');

    if (cu.student_group === 'teacher' || cu.student_group === 'guest') {
        globalTimerEls.forEach(el => {
            const cardContainer = el.closest('article, .card, .sd-panel, div');
            if (cardContainer && cardContainer.textContent.includes('00:00:00')) {
                cardContainer.style.display = 'none';
            } else {
                el.style.display = 'none';
            }
        });
        return; 
    }

    const activePracticeItems = (state.myBorrowedItems || []).filter(item => 
        !item.is_take_home && 
        item.borrow_type !== 'take_home' &&
        item.approval_status !== 'pending'
    );

    if (activePracticeItems.length > 0) {
        // อ้างอิงจากเวลาที่ยืม "ชิ้นแรกสุด"
        const earliestTime = Math.min(...activePracticeItems.map(i => new Date(i.borrow_timestamp).getTime()));
        const timeString = _formatElapsedTime(new Date(earliestTime).toISOString());
        
        globalTimerEls.forEach(el => {
            el.textContent = timeString;
            el.style.color = 'var(--pico-primary)'; 
        });
        
        // 🟢 FIX: มาร์คสถานะและ "แคปเจอร์เวลาล่าสุด" เอาไว้สำหรับแช่แข็งเมื่อกดคืน
        state.wasPracticing = true;
        state.frozenTimeStr = timeString;
        
        // 🛑 ลบนาฬิกาผีตัวเก่าทิ้งเพื่อกันการทำงานซ้อนทับ (ถ้ามีตกค้าง)
        if (window._sdPracticeIntervals) {
            window._sdPracticeIntervals.forEach(clearInterval);
            window._sdPracticeIntervals = [];
        }
        
    } else {
        // ถ้าไม่มีเครื่องที่กำลังยืมซ้อม 
        globalTimerEls.forEach(el => {
            if (state.wasPracticing && state.frozenTimeStr) {
                // 🟢 FIX: คืนเครื่องครบแล้ว ให้แสดงเวลาที่ถูก "แช่แข็ง" ไว้ตัวเลขจะหยุดนิ่ง
                el.textContent = state.frozenTimeStr;
                el.style.color = 'var(--pico-muted-color)';
            } else {
                // กรณีเปิดเว็บมาใหม่ ยังไม่เคยมียืม ให้โชว์ 00 ตามปกติ
                el.textContent = '00:00:00';
                el.style.color = 'var(--pico-muted-color)';
            }
        });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. ฟังก์ชันคำนวณเวลาเดินหน้า (ยืมในโรงเรียน / ออกงาน)
// ─────────────────────────────────────────────────────────────────────────────
function _formatElapsedTime(startTime) {
    if (!startTime) return '00:00:00';
    const start = new Date(startTime).getTime();
    if (isNaN(start)) return '00:00:00';
    
    const diff = Math.max(0, Date.now() - start);
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. ฟังก์ชันคำนวณเวลานับถอยหลัง (ยืมกลับบ้าน / กรณีพิเศษ)
// ─────────────────────────────────────────────────────────────────────────────
function _formatCountdown(dueDateStr) {
    if (!dueDateStr) return 'ไม่มีกำหนด';
    const due = new Date(dueDateStr);
    
    // ตั้งให้เส้นตายคือ 23:59:59 ของวันกำหนดคืน
    due.setHours(23, 59, 59, 999);
    
    const diff = due.getTime() - Date.now();
    
    // กรณีที่เกินกำหนดเวลาแล้ว (Overdue)
    if (diff < 0) {
        const od = Math.abs(diff);
        const d  = Math.floor(od / 86400000);
        const h  = Math.floor((od % 86400000) / 3600000);
        const m  = Math.floor((od % 3600000) / 60000);
        return `<span style="color:#ef4444;">⚠️ เกินมา ${d > 0 ? d + ' วัน ' : ''}${h} ชม. ${m} นาที</span>`;
    }
    
    // กรณียังไม่ถึงกำหนด (Countdown)
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    
    if (d > 0) return `${d} วัน ${h} ชม. ${m} นาที`;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

const VIEWS = {
    home: {
        label: 'ภาพรวม',
        render(user) {
            const calendarHtml = user.student_group === 'club' ? `
                <div style="margin-top: 1.5rem;">
                    <div style="margin-bottom: 0.5rem;">
                        <h3 class="sd-section-title" style="margin:0;">📅 ปฏิทินนัดหมายชุมนุม</h3>
                    </div>
                    <div style="height:250px; border-radius:12px; overflow:hidden; border: 1px solid var(--pico-muted-border-color);">
                        <iframe src="https://calendar.google.com/calendar/embed?height=250&wkst=1&ctz=Asia%2FBangkok&showPrint=0&mode=AGENDA&hl=th&src=YjViNGNlNGE1ODdiZGIwOWI1NTcwMGQ3MDkwYmNmNjM2YThhMzFhZjY2OTlkNjQ5OTVhNTk0YjU5MDBmZWQ5OEBncm91cC5jYWxlbmRhci5nb29nbGUuY29t&color=%23f6bf26" style="width:100%; height:100%; border:0;" scrolling="no"></iframe>
                    </div>
                </div>` : '';

            const avatarSrc = user.profile_image_url || 'assets/default-avatar.png';

            return `
                <style>
                    /* 🔔 ระบบกระดิ่งแจ้งเตือน Pop-up */
                    .sd-bell-container { position: absolute; top: 1.2rem; right: 1.2rem; z-index: 10; }
                    .sd-bell-btn { background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3); border-radius: 50%; width: 42px; height: 42px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 1.2rem; transition: all 0.2s; backdrop-filter: blur(5px); color: white; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
                    .sd-bell-btn:hover { background: rgba(255,255,255,0.3); transform: scale(1.05); }
                    .sd-bell-badge { position: absolute; top: -2px; right: -2px; background: var(--pico-del-color, #ef4444); color: white; font-size: 0.65rem; font-weight: bold; width: 18px; height: 18px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid var(--pico-primary); display: none; }
                    
                    /* ✨ Dropdown แจ้งเตือน (บังคับพื้นหลังและตัวอักษรสีเข้ม เพื่อป้องกันการกลืนสี) */
                    .sd-notif-dropdown { 
                        position: absolute; top: 52px; right: 0; width: 300px; 
                        background-color: #ffffff !important; 
                        border-radius: 12px; 
                        box-shadow: 0 10px 25px rgba(0,0,0,0.15) !important;
                        border: 1px solid #e2e8f0 !important; 
                        z-index: 99999 !important; 
                        opacity: 0; visibility: hidden; transform: translateY(-10px); 
                        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); 
                        max-height: 350px; overflow-y: auto; text-align: left; 
                    }
                    .sd-notif-dropdown.show { opacity: 1; visibility: visible; transform: translateY(0); }
                    
                    .sd-notif-header { padding: 1rem; border-bottom: 1px solid #e2e8f0; font-weight: bold; display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; background-color: #ffffff !important; z-index: 2; color: #1e293b !important; }
                    .sd-notif-item { padding: 0.8rem 1rem; border-bottom: 1px solid #e2e8f0; cursor: pointer; display: flex; gap: 0.8rem; transition: background 0.2s; background-color: #ffffff !important; color: #475569 !important; }
                    .sd-notif-item:hover { background-color: #f8fafc !important; }
                    .sd-notif-item.unread { background-color: #eff6ff !important; color: #1d4ed8 !important; }
                    .sd-notif-item-title { font-size: 0.85rem; font-weight: 600; color: #0f172a !important; margin-bottom: 0.2rem; }

                    /* ⚡ CRITICAL FIX: ".sd-unified-card *" rule below forces every
                       descendant text to white — including this dropdown! Override
                       with higher-specificity selectors so dropdown text stays dark.
                       LIGHT theme defaults: white background + dark text */
                    .sd-unified-card .sd-notif-dropdown,
                    .sd-unified-card .sd-notif-dropdown * { color: #1e293b !important; }
                    .sd-unified-card .sd-notif-dropdown .sd-notif-header { color: #1e293b !important; }
                    .sd-unified-card .sd-notif-dropdown .sd-notif-header a { color: #2563eb !important; }
                    .sd-unified-card .sd-notif-dropdown .sd-notif-item { color: #475569 !important; }
                    .sd-unified-card .sd-notif-dropdown .sd-notif-item.unread { color: #1d4ed8 !important; }
                    .sd-unified-card .sd-notif-dropdown .sd-notif-item.unread .sd-notif-item-title { color: #1d4ed8 !important; }
                    .sd-unified-card .sd-notif-dropdown .sd-notif-item-title { color: #0f172a !important; }
                    .sd-unified-card .sd-notif-dropdown .sd-notif-item div[style*="color"] { color: #64748b !important; }

                    /* 🌙 DARK theme: black-ish background + light text */
                    html[data-theme="dark"] .sd-unified-card .sd-notif-dropdown {
                        background-color: #1e293b !important;
                        border-color: #334155 !important;
                        box-shadow: 0 10px 25px rgba(0,0,0,0.5) !important;
                    }
                    html[data-theme="dark"] .sd-unified-card .sd-notif-dropdown,
                    html[data-theme="dark"] .sd-unified-card .sd-notif-dropdown * { color: #f1f5f9 !important; }
                    html[data-theme="dark"] .sd-unified-card .sd-notif-dropdown .sd-notif-header {
                        background-color: #1e293b !important;
                        border-bottom-color: #334155 !important;
                        color: #f8fafc !important;
                    }
                    html[data-theme="dark"] .sd-unified-card .sd-notif-dropdown .sd-notif-header a { color: #60a5fa !important; }
                    html[data-theme="dark"] .sd-unified-card .sd-notif-dropdown .sd-notif-item {
                        background-color: #1e293b !important;
                        border-bottom-color: #334155 !important;
                        color: #cbd5e1 !important;
                    }
                    html[data-theme="dark"] .sd-unified-card .sd-notif-dropdown .sd-notif-item:hover {
                        background-color: #334155 !important;
                    }
                    html[data-theme="dark"] .sd-unified-card .sd-notif-dropdown .sd-notif-item.unread {
                        background-color: #1e3a8a !important;
                        color: #dbeafe !important;
                    }
                    html[data-theme="dark"] .sd-unified-card .sd-notif-dropdown .sd-notif-item.unread .sd-notif-item-title { color: #dbeafe !important; }
                    html[data-theme="dark"] .sd-unified-card .sd-notif-dropdown .sd-notif-item-title { color: #f8fafc !important; }
                    html[data-theme="dark"] .sd-unified-card .sd-notif-dropdown .sd-notif-item div[style*="color"] { color: #94a3b8 !important; }
                    
                    /* 💳 Unified Dashboard Card (ล็อกสีฟ้ากันตายและผูกกับธีม) */
                    .sd-unified-card { 
                        background: var(--sd-accent-bg, linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)) !important; 
                        margin: -1.25rem -1.25rem 1.5rem -1.25rem !important; 
                        border-radius: 0 0 24px 24px !important; 
                        padding: 2rem 1.5rem 1.5rem 1.5rem; 
                        position: relative; 
                        box-shadow: 0 10px 25px rgba(0,0,0,0.15); 
                        overflow: hidden; 
                    }
                    
                    /* ✨ บังคับให้ตัวอักษร "ทุกตัว" ในการ์ดเป็นสีสว่าง/ทึบ ตามธีมเสมอ */
                    .sd-unified-card *, .sd-unified-name, .sd-power-level, .sd-power-xp {
                        color: var(--sd-accent-color, #ffffff) !important;
                    }
                    
                    /* ปรับสี Emoji พื้นหลังและข้อความอื่นๆ ให้สัมพันธ์กัน */
                    .sd-unified-bg-emoji { opacity: 0.1; color: var(--sd-accent-color); }
                    .sd-unified-name { color: var(--sd-accent-color) !important; }
                    .sd-unified-header { display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem; padding-right: 50px; }
                    .sd-unified-avatar { width: 56px; height: 56px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.6); object-fit: cover; box-shadow: 0 4px 10px rgba(0,0,0,0.1); background-color: white; }
                    .sd-unified-greeting { font-size: 0.85rem; opacity: 0.9; margin-bottom: 0.2rem; }
                    
                    /* ⚡ แถบวัดพลัง (Power Bar) */
                    .sd-power-box { margin-bottom: 1.5rem; }
                    .sd-power-header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 0.4rem; }
                    .sd-power-level { font-size: 1.3rem; font-weight: 900; line-height: 1; text-shadow: 0 2px 4px rgba(0,0,0,0.2); }
                    .sd-power-xp { font-size: 0.75rem; font-weight: bold; color: var(--pico-ins-color, #60ffca); }
                    /* ปรับแต่งแถบวัดพลังให้อ่านง่ายขึ้นเมื่อตัวหนังสือเปลี่ยนสี */
                    .sd-power-track { width: 100%; height: 14px; background: rgba(0,0,0,0.3); border-radius: 99px; overflow: hidden; border: 1px solid rgba(255,255,255,0.2); box-shadow: inset 0 2px 4px rgba(0,0,0,0.2); }
                    .sd-power-fill { 
                        height: 100%; 
                        background: #10b981 !important; /* ใส่สีพื้นฐานเป็นสีเขียวทึบ */
                        background: linear-gradient(90deg, #10b981, #34d399, #10b981) !important;
                        background-size: 200% 100% !important;
                        border-radius: 99px; 
                        transition: width 1s cubic-bezier(0.4, 0, 0.2, 1); /* เพิ่มความลื่นไหล */
                        animation: powerGlow 2s infinite linear; 
                    }
                    @keyframes powerGlow { 0% { background-position: 100% 0; } 100% { background-position: -100% 0; } }

                    /* 📊 กรอบข้อมูลสรุป */
                    .sd-inner-panels { display: flex; flex-direction: column; gap: 0.5rem; position: relative; z-index: 1; }
                    .sd-panel-row { display: flex; background: rgba(255,255,255,0.15); border-radius: 12px; backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.2); padding: 0.8rem 0; }
                    .sd-panel-col { flex: 1; text-align: center; cursor: pointer; transition: transform 0.1s; display: flex; flex-direction: column; justify-content: center; }
                    .sd-panel-col:active { transform: scale(0.95); }
                    .sd-panel-val { font-size: 1.4rem; font-weight: 800; line-height: 1.1; margin-bottom: 0.2rem; }
                    .sd-panel-lbl { font-size: 0.75rem; font-weight: 600; opacity: 0.95; line-height: 1.3; }
                    .sd-panel-sublbl { font-size: 0.65rem; opacity: 0.75; font-weight: normal; }
                    .sd-panel-divider { width: 1px; background: rgba(255,255,255,0.2); }

                    .sd-rank-row { display: none; gap: 0.5rem; }
                    .sd-rank-box { flex: 1; background: rgba(0,0,0,0.2); border-radius: 10px; padding: 0.6rem; text-align: center; border: 1px solid rgba(255,255,255,0.1); cursor: pointer; }
                    .sd-rank-val { font-size: 1.1rem; font-weight: 800; color: var(--pico-mark-color, #d97706); }
                    .sd-rank-lbl { font-size: 0.65rem; opacity: 0.8; margin-top: 0.1rem; }

                    /* 🎮 สถิติเกม (ปรับให้เลื่อนซ้ายขวาได้ ไม่ตัดบรรทัด ข้อ 1) */
                    .sd-games-panel { background: rgba(0,0,0,0.15); border-radius: 10px; padding: 0.8rem; border: 1px solid rgba(255,255,255,0.1); }
                    .sd-games-title { font-size: 0.7rem; font-weight: 600; opacity: 0.8; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.5px; }
                    .sd-games-list { 
                        display: flex; 
                        overflow-x: auto; /* เปิดการเลื่อนแนวนอน */
                        gap: 0.5rem; 
                        padding-bottom: 0.4rem; 
                        scrollbar-width: none; /* ซ่อน scrollbar ใน Firefox */
                    }
                    .sd-games-list::-webkit-scrollbar { display: none; /* ซ่อน scrollbar ใน Chrome/Safari */ }
                    .sd-game-item { 
                        display: flex; 
                        justify-content: space-between; 
                        align-items: center; 
                        background: rgba(255,255,255,0.08); 
                        padding: 0.4rem 0.8rem; 
                        border-radius: 6px; 
                        flex-shrink: 0; /* ป้องกันการหดตัว */
                        min-width: 140px; /* กำหนดความกว้างขั้นต่ำให้อ่านง่าย */
                    }
                    .sd-game-name { font-size: 0.75rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-right: 0.5rem; }
                    .sd-game-score { font-size: 0.8rem; font-weight: 800; color: var(--pico-primary); }

                    .sd-board-btn { 
                        width: 100%; 
                        background: var(--pico-card-background-color); 
                        color: var(--pico-primary); 
                        border: 2px solid var(--pico-primary); 
                        padding: 1rem; 
                        border-radius: 16px; 
                        font-weight: 800; 
                        font-size: 1.05rem; 
                        margin-top: 1rem; 
                        cursor: pointer; 
                        transition: all 0.25s ease; 
                        box-shadow: var(--pico-box-shadow); 
                        display: flex; align-items: center; justify-content: center; gap: 0.5rem; 
                        position: relative; z-index: 1; 
                    }
                    .sd-board-btn:hover { background: var(--pico-primary-background); color: var(--pico-primary-inverse); }
                    .sd-board-btn:active { transform: scale(0.96); box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
                </style>

                <div class="sd-unified-card">
                    <div class="sd-unified-bg-emoji">🎵</div>

                    <div class="sd-bell-container" style="position: absolute; top: 1.5rem; right: 1.5rem; z-index: 99;">
                        <div class="sd-bell-btn" id="sd-bell-toggle">🔔</div>
                        <div class="sd-bell-badge" id="sd-bell-badge">0</div>
                        <div class="sd-notif-dropdown" id="sd-notif-dropdown">
                            <div class="sd-notif-header">
                                <span>การแจ้งเตือน</span>
                                <a href="#" onclick="window.__sdSetView('notifications'); return false;" style="font-size: 0.75rem; font-weight: normal; color: var(--pico-primary);">ดูทั้งหมด</a>
                            </div>
                            <div id="sd-notif-list">
                                <div style="padding: 2rem; text-align: center; color: var(--pico-muted-color); font-size: 0.85rem;">กำลังโหลด...</div>
                            </div>
                        </div>
                    </div>

                    <div class="sd-unified-header" style="position: relative; z-index: 10; padding-right: 60px;">
                        <img src="${avatarSrc}" alt="Profile" class="sd-unified-avatar" id="sd-home-avatar">
                        <div style="min-width: 0;">
                            <div class="sd-unified-greeting">ยินดีต้อนรับกลับมา 👋</div>
                            <h2 class="sd-unified-name" style="margin: 0; font-size: 1.3rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(user.first_name || 'ผู้ใช้งาน')}</h2>
                        </div>
                    </div>

                    <!-- นำโค้ดนี้ไปแทนที่แถบวัดพลังเดิมของคุณได้เลยครับ -->
                    <div class="sd-power-box" id="sd-power-box" style="cursor: pointer; transition: transform 0.1s;" onmousedown="this.style.transform='scale(0.97)'" onmouseup="this.style.transform='scale(1)'" onmouseleave="this.style.transform='scale(1)'">
                        <div class="sd-power-header">
                            <span class="sd-power-level" id="sum-level">Lv.-</span>
                            <span class="sd-power-xp" id="sum-xp-text">- / - XP</span>
                        </div>
                        <div class="sd-power-track">
                            <div class="sd-power-fill" id="sum-xp-bar" style="width: 0%;"></div>
                        </div>
                        <div style="font-size: 0.65rem; text-align: right; opacity: 0.8; margin-top: 0.3rem;">⚡ แถบวัดพลังการซ้อมสะสม</div>
                    </div>

                    <div class="sd-inner-panels">
                        <div class="sd-panel-row">
                            <div class="sd-panel-col" onclick="window.__sdSetView('borrows')">
                                <div class="sd-panel-val" id="sum-total-time" style="color: #fcd34d;">-</div>
                                <div class="sd-panel-lbl">เวลาซ้อมสะสม<br><span class="sd-panel-sublbl">นาทีทั้งหมด</span></div>
                            </div>
                            <div class="sd-panel-divider"></div>
                            
                            <div class="sd-panel-col" onclick="window.__sdSetView('borrows')">
                                <div class="sd-panel-val" id="sum-active-borrows">-</div>
                                <div class="sd-panel-lbl">กำลังยืม<br><span class="sd-panel-sublbl">จาก <span id="sum-total-borrows">-</span> ครั้ง</span></div>
                            </div>
                            <div class="sd-panel-divider"></div>
                            
                            <div class="sd-panel-col" onclick="window.__sdSetView('profile')">
                                <div class="sd-panel-val" id="sum-badges">-</div>
                                <div class="sd-panel-lbl">เหรียญตรา<br><span class="sd-panel-sublbl">ปลดล็อคแล้ว</span></div>
                            </div>
                        </div>
                        <div class="sd-rank-row" id="ranks-container"></div>
                        <div class="sd-games-panel" onclick="window.__sdSetView('games')" style="cursor: pointer;">
                            <div class="sd-games-title">🎮 สถิติคะแนนเกมสูงสุด</div>
                            <div class="sd-games-list" id="sum-all-games">
                                <div style="grid-column: 1 / -1; text-align: center; font-size: 0.65rem; opacity: 0.7;">กำลังโหลดข้อมูล...</div>
                            </div>
                        </div>
                    </div>

                    <button class="sd-board-btn" id="home-qr-btn">
                        <span style="font-size: 1.2rem;">📷</span> สแกน QR ยืมเครื่องดนตรี
                    </button>
                </div>

                ${calendarHtml}
                <div class="sd-bottom-spacer"></div>`;
        },
        async afterRender(user) {
            document.getElementById('home-qr-btn')?.addEventListener('click', handleUniversalScan);
            document.getElementById('sd-power-box')?.addEventListener('click', () => showGamificationCard());

            const bellBtn = document.getElementById('sd-bell-toggle');
            const notifDropdown = document.getElementById('sd-notif-dropdown');
            
            bellBtn?.addEventListener('click', (e) => {
                e.stopPropagation();
                notifDropdown.classList.toggle('show');
            });
            document.addEventListener('click', (e) => {
                if (notifDropdown && notifDropdown.classList.contains('show') && !e.target.closest('.sd-bell-container')) {
                    notifDropdown.classList.remove('show');
                }
            });

            try {
                const [
                    { data: activeBorrows }, { data: totalBorrows }, { data: notifs },
                    { data: userProfile }, { count: totalBadges }, { data: gameSessions }
                ] = await statsApi.getHomeStats(user.id);

                // --- 1. การคำนวณ XP และ Level ให้แม่นยำ ---
                const xp = Number(userProfile?.xp || 0);
                const currentLevel = Math.floor(xp / 100) + 1; 
                const xpInCurrentLevel = xp % 100; 
                const xpPercentage = Math.min(100, Math.max(0, xpInCurrentLevel));

                // อัปเดตตัวเลขบนหน้าจอ
                const levelEl = document.getElementById('sum-level');
                const xpTextEl = document.getElementById('sum-xp-text');
                const barEl = document.getElementById('sum-xp-bar');

                if (levelEl) levelEl.textContent = `Lv.${currentLevel}`;
                
                // ✨ แก้ไขบรรทัดนี้: ให้แสดงคะแนนรวมนำหน้า จะได้ไม่งงครับ
                if (xpTextEl) xpTextEl.textContent = `รวม ${xp} XP (อีก ${100 - xpInCurrentLevel} XP ถึง Lv.${currentLevel + 1})`;
                
                if (barEl) {
                    barEl.style.width = '0%';
                    setTimeout(() => { barEl.style.width = `${xpPercentage}%`; }, 300);
                }

                // --- 3. อัปเดตตัวเลขสถิติอื่นๆ ---
                document.getElementById('sum-active-borrows').textContent = activeBorrows ? activeBorrows.length : 0;
                document.getElementById('sum-total-borrows').textContent = totalBorrows ? totalBorrows.length : 0;
                document.getElementById('sum-badges').textContent = totalBadges || 0;

                // --- 4. ระบบคำนวณและแสดงเวลาซ้อมรวม ---
                let totalPracticeMins = 0;
                
                if (totalBorrows) { // บวกเวลาจากการยืม
                    totalBorrows.forEach(b => {
                        if (b.practice_minutes) totalPracticeMins += Number(b.practice_minutes);
                    });
                }
                
                if (gameSessions) { // บวกเวลาจากเกม
                    gameSessions.forEach(g => {
                        if (g.duration_minutes) totalPracticeMins += Number(g.duration_minutes);
                    });
                }
                
                // จัดรูปแบบการแสดงผลเวลาซ้อม
                const timeEl = document.getElementById('sum-total-time');
                if (timeEl) {
                    if (totalPracticeMins >= 60) {
                        const h = Math.floor(totalPracticeMins / 60);
                        const m = totalPracticeMins % 60;
                        timeEl.innerHTML = `${h}<span style="font-size:0.8rem;">ชม.</span> ${m}<span style="font-size:0.8rem;">น.</span>`;
                    } else {
                        timeEl.textContent = totalPracticeMins;
                    }
                }

                const gameContainer = document.getElementById('sum-all-games');
                if (!gameSessions || gameSessions.length === 0) {
                    gameContainer.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; font-size: 0.65rem; opacity: 0.7;">ยังไม่เคยเล่นมินิเกม</div>`;
                } else {
                    const bestScores = {};
                    gameSessions.forEach(g => {
                        if (!bestScores[g.game_name] || g.score > bestScores[g.game_name]) bestScores[g.game_name] = g.score;
                    });
                    let gamesHtml = '';
                    for (const [name, score] of Object.entries(bestScores)) {
                        const displayName = name === 'staffwars' ? '🎼 Staff Wars' : name === 'rhythm_core' || name === 'rhythmcore' ? '🥁 Rhythm Core' : name;
                        gamesHtml += `<div class="sd-game-item"><span class="sd-game-name">${escapeHtml(displayName)}</span><span class="sd-game-score">${score.toLocaleString()}</span></div>`;
                    }
                    gameContainer.innerHTML = gamesHtml;
                }

                let ranksHtml = '';
                if (user.student_group === 'club') {
                    try {
                        const { data: clubRankData } = await rankingsExt.getClubRanking(user.id);
                        const myClubRank = clubRankData?.find(r => r.is_current_user)?.rank || '-';
                        ranksHtml += `<div class="sd-rank-box" onclick="window.__sdSetView('profile')"><div class="sd-rank-val">🏆 #${myClubRank}</div><div class="sd-rank-lbl">อันดับชุมนุม</div></div>`;
                    } catch(e) {}
                }
                if (user.class_level) {
                    try {
                        const { data: classRankData } = await rankingsExt.getClassRanking(user.id);
                        const myClassRank = classRankData?.find(r => r.is_current_user)?.rank || '-';
                        ranksHtml += `<div class="sd-rank-box" onclick="window.__sdSetView('profile')"><div class="sd-rank-val">🎓 #${myClassRank}</div><div class="sd-rank-lbl">อันดับห้อง ${escapeHtml(user.class_level)}</div></div>`;
                    } catch(e) {}
                }
                if (ranksHtml) {
                    const rc = document.getElementById('ranks-container');
                    rc.innerHTML = ranksHtml;
                    rc.style.display = 'flex';
                }

                const notifList = document.getElementById('sd-notif-list');
                const badgeEl = document.getElementById('sd-bell-badge');
                
                if (!notifs || notifs.length === 0) {
                    notifList.innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--pico-muted-color); font-size: 0.85rem;">ไม่มีการแจ้งเตือนใหม่</div>';
                    badgeEl.style.display = 'none';
                } else {
                    const unreadCount = notifs.filter(n => !n.is_read).length;
                    if (unreadCount > 0) {
                        badgeEl.textContent = unreadCount > 9 ? '9+' : unreadCount;
                        badgeEl.style.display = 'flex';
                    } else {
                        badgeEl.style.display = 'none';
                    }

                    notifList.innerHTML = notifs.map(n => `
                        <div class="sd-notif-item ${!n.is_read ? 'unread' : ''}" onclick="document.getElementById('sd-notif-dropdown')?.classList.remove('show'); window.__sdSetView('notifications');">
                            <div style="font-size: 1.2rem; flex-shrink: 0;">${n.title.includes('บล็อก') ? '🚫' : n.title.includes('เหรียญ') ? '🏅' : '🔔'}</div>
                            <div>
                                <div class="sd-notif-item-title">${escapeHtml(n.title)}</div>
                                <div style="font-size: 0.75rem; color: var(--pico-muted-color);">${timeAgo(n.created_at)}</div>
                            </div>
                        </div>
                    `).join('');
                }
            } catch (err) { console.error("Home error:", err); }
        }
    },

    instruments: {
        label: 'ยืม / คืน',
        icon: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>',
        render() {
            return `
                ${renderUnifiedCard({ emoji: '🎸', title: 'ยืม และ คืนเครื่องดนตรี', subtitle: 'จัดการเครื่องดนตรีของคุณในหน้าเดียว' })}

                <div id="borrowed-section" style="margin-bottom: 2.5rem; display: none;">
                    <h3 class="sd-section-title" style="color: var(--pico-color-green-500);">🎸 เครื่องดนตรีที่กำลังยืม</h3>
                    <div id="borrowed-list" aria-busy="true" class="sd-list-container"></div>
                </div>

                <div>
                    <h3 class="sd-section-title">➕ ทำรายการยืมใหม่</h3>
                    <div id="borrow-form-container" aria-busy="true">
                        <p style="text-align:center; color: var(--pico-muted-color); padding: 2rem;">กำลังโหลดข้อมูล...</p>
                    </div>
                </div>
                <div class="sd-bottom-spacer"></div>`;
        },
        async afterRender(user) {
            await loadAndRenderMyBorrowedItems(user.id);
            await renderBorrowForm(user);
        }
    },

    borrows: {
        label: 'ประวัติ',
        icon: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>',
        render() {
            return `
                ${renderUnifiedCard({ emoji: '🕒', title: 'ประวัติการยืม-คืน', subtitle: 'ดูประวัติการใช้งานของคุณ' })}

                <div id="history-section">
                    <div class="sd-filter-group">
                        <select id="history-filter-time" class="sd-select-minimal">
                            <option value="today" selected>วันนี้</option>
                            <option value="this_week">สัปดาห์นี้</option>
                            <option value="this_month">เดือนนี้</option>
                            <option value="all">ทั้งหมด</option>
                        </select>
                        <select id="history-filter-status" class="sd-select-minimal">
                            <option value="all">ทุกสถานะ</option>
                            <option value="borrowed">ยังไม่คืน</option>
                            <option value="returned">คืนแล้ว</option>
                        </select>
                    </div>
                    <div id="history-list" aria-busy="true" class="sd-list-container" style="margin-top:1rem;"></div>
                </div>
                <div class="sd-bottom-spacer"></div>`;
        },
        async afterRender(user) {
            await renderMyHistory();
            document.getElementById('history-filter-time')?.addEventListener('change', filterMyHistory);
            document.getElementById('history-filter-status')?.addEventListener('change', filterMyHistory);
        }
    },

    favorites: {
        label: 'เรียนรู้',
        icon: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>',
        render() {
            return `
                <style>
                    /* TikTok-style learning feed */
                    .lf-wrap { position: relative; margin: -1.25rem -1.25rem 0 -1.25rem; height: calc(100vh - 140px); min-height: 500px; background: #000; overflow: hidden; }
                    .lf-filters { position: absolute; top: 0.75rem; left: 0; right: 0; z-index: 20; display: flex; gap: 0.5rem; padding: 0 1rem; overflow-x: auto; scrollbar-width: none; }
                    .lf-filters::-webkit-scrollbar { display: none; }
                    .lf-chip { flex-shrink: 0; padding: 0.4rem 0.9rem; border-radius: 999px; background: rgba(255,255,255,0.15); backdrop-filter: blur(8px); color: #fff; font-size: 0.8rem; font-weight: 600; border: 1px solid rgba(255,255,255,0.2); cursor: pointer; white-space: nowrap; transition: all 0.15s; }
                    .lf-chip.active { background: #fff; color: #000; }
                    .lf-actions { position: absolute; top: 0.75rem; right: 0.75rem; z-index: 25; display: flex; gap: 0.5rem; }
                    .lf-action-btn { background: rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.2); color: #fff; border-radius: 50%; width: 38px; height: 38px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 1rem; backdrop-filter: blur(6px); }

                    .lf-feed { height: 100%; overflow-y: scroll; scroll-snap-type: y mandatory; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
                    .lf-feed::-webkit-scrollbar { display: none; }
                    .lf-card { position: relative; height: 100%; scroll-snap-align: start; scroll-snap-stop: always; background: #000; display: flex; align-items: center; justify-content: center; }
                    .lf-card iframe { width: 100%; height: 100%; border: 0; }
                    .lf-card .lf-overlay { position: absolute; left: 0; right: 0; bottom: 0; padding: 4rem 1rem 1.25rem 1rem; background: linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0) 100%); color: #fff; pointer-events: none; }
                    .lf-overlay > * { pointer-events: auto; }
                    .lf-tag-row { display: flex; gap: 0.4rem; margin-bottom: 0.5rem; flex-wrap: wrap; }
                    .lf-tag { font-size: 0.65rem; font-weight: bold; padding: 2px 8px; border-radius: 6px; }
                    .lf-tag.platform-yt { background: #ef4444; color: #fff; }
                    .lf-tag.platform-tt { background: #000; color: #fff; border: 1px solid rgba(255,255,255,0.4); }
                    .lf-tag.platform-fb { background: #1877f2; color: #fff; }
                    .lf-tag.platform-other { background: #64748b; color: #fff; }
                    .lf-tag.pending { background: #f59e0b; color: #000; }
                    .lf-tag.instrument { background: rgba(255,255,255,0.2); color: #fff; backdrop-filter: blur(4px); }
                    .lf-title { font-size: 1.05rem; font-weight: 700; margin: 0 0 0.25rem 0; line-height: 1.3; }
                    .lf-caption { font-size: 0.85rem; margin: 0 0 0.5rem 0; opacity: 0.92; line-height: 1.4; }
                    .lf-open-app { display: inline-flex; align-items: center; gap: 0.4rem; background: rgba(255,255,255,0.18); color: #fff; padding: 0.4rem 0.85rem; border-radius: 999px; font-size: 0.8rem; text-decoration: none; backdrop-filter: blur(6px); border: 1px solid rgba(255,255,255,0.3); }
                    .lf-open-app:hover { background: rgba(255,255,255,0.3); }

                    .lf-empty { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #fff; padding: 2rem; text-align: center; gap: 1rem; }
                    .lf-loading { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #fff; }

                    /* Watch-time pill (top-center) */
                    .lf-timer { position: absolute; top: 0.75rem; left: 50%; transform: translateX(-50%); z-index: 22; background: rgba(0,0,0,0.55); color: #fff; padding: 0.25rem 0.7rem; border-radius: 999px; font-size: 0.7rem; backdrop-filter: blur(6px); border: 1px solid rgba(255,255,255,0.2); display: none; }
                    .lf-timer.show { display: block; }

                    /* Mobile tweaks */
                    @media (max-width: 768px) {
                        .lf-wrap { margin: -1rem -1rem 0 -1rem; height: calc(100vh - 120px); border-radius: 0; }
                    }
                </style>
                <div class="lf-wrap" id="learning-feed-wrap">
                    <div class="lf-filters" id="lf-filters"></div>
                    <div class="lf-actions">
                        <button class="lf-action-btn" id="lf-submit-btn" title="แชร์คลิปของฉัน">📤</button>
                        <button class="lf-action-btn" id="lf-history-btn" title="ประวัติการเรียน">📊</button>
                    </div>
                    <div class="lf-timer" id="lf-timer">⏱ 0:00</div>
                    <div class="lf-feed" id="lf-feed">
                        <div class="lf-loading"><span aria-busy="true">กำลังโหลดคลิป...</span></div>
                    </div>
                </div>
                <div class="sd-bottom-spacer"></div>`;
        },
        async afterRender(user) {
            document.getElementById('lf-submit-btn')?.addEventListener('click', handleSubmitClip);
            document.getElementById('lf-history-btn')?.addEventListener('click', showLearningHistory);
            await renderLearningFeed();
        }
    },

    games: {
        label: 'มินิเกม',
        icon: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"></rect><path d="M6 12h4"></path><path d="M8 10v4"></path><line x1="15" y1="13" x2="15.01" y2="13"></line><line x1="18" y1="11" x2="18.01" y2="11"></line></svg>',
        render() {
            return `
                ${renderUnifiedCard({ emoji: '🎮', title: 'ศูนย์ฝึกทักษะ', subtitle: 'เล่นเกมเพื่อพัฒนาทักษะการอ่านโน้ตและจังหวะ' })}
                <div class="sd-grid-2" style="margin-bottom: 2.5rem;">
                    <button id="launch-game-btn" class="sd-app-btn">
                        <span class="icon">🎼</span>
                        <span>ห้องโน้ต<br>(Staff Wars)</span>
                    </button>
                    <button id="launch-rhythm-core-btn" class="sd-app-btn">
                        <span class="icon">🥁</span>
                        <span>ห้องจังหวะ<br>(Rhythm Core)</span>
                    </button>
                </div>
                <div>
                    <h3 class="sd-section-title">🏆 อันดับคะแนนเกม</h3>
                    <div id="staffwars-leaderboard" aria-busy="true" class="sd-list-container" style="margin-bottom:1rem; padding: 1rem;"></div>
                    <div id="rhythmcore-leaderboard" aria-busy="true" class="sd-list-container" style="padding: 1rem;"></div>
                </div>
                <div class="sd-bottom-spacer"></div>`;
        },
        async afterRender(user) {   
            // ตั้งค่าปุ่ม Staff Wars
            document.getElementById('launch-game-btn')?.addEventListener('click', () => {
                // ฝากข้อมูล User ไว้ในเครื่องก่อนเปิดเกม
                localStorage.setItem('sd_game_user', JSON.stringify(user));
                window.open('staffwars.html', '_blank'); // เปิดแท็บใหม่
            });

            // ตั้งค่าปุ่ม Rhythm Core
            document.getElementById('launch-rhythm-core-btn')?.addEventListener('click', () => {
                // ฝากข้อมูล User ไว้ในเครื่องก่อนเปิดเกม
                localStorage.setItem('sd_game_user', JSON.stringify(user));
                window.open('rhythmcore.html', '_blank'); // เปิดแท็บใหม่
            });

            await renderGameLeaderboards();
        }
    },

    profile: {
        label: 'โปรไฟล์',
        icon: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>',
        render(user) {
            const profileImage = user.profile_image_url || 'assets/default-avatar.png';
            const fullName = `${user.prefix || ''}${user.first_name || ''} ${user.last_name || ''}`.trim() || 'ผู้ใช้งาน';
            const groupText = translateGroup(user.student_group);
            
            const clubFeaturesHtml = user.student_group === 'club' ? `
                <div style="margin-bottom: 2rem;">
                    <h3 class="sd-section-title">กิจกรรมและนัดหมาย</h3>
                    <div id="appointment-button-container" style="margin-bottom:1rem;text-align:center;"></div>
                    <div style="height:400px; border-radius:12px; overflow:hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.05);">
                        <iframe
                            src="https://calendar.google.com/calendar/embed?height=600&wkst=1&ctz=Asia%2FBangkok&showPrint=0&mode=AGENDA&hl=th&src=YjViNGNlNGE1ODdiZGIwOWI1NTcwMGQ3MDkwYmNmNjM2YThhMzFhZjY2OTlkNjQ5OTVhNTk0YjU5MDBmZWQ5OEBncm91cC5jYWxlbmRhci5nb29nbGUuY29t&color=%23f6bf26"
                            style="border:0;width:100%;height:100%;" frameborder="0" scrolling="no"></iframe>
                    </div>
                </div>` : '';

            // ✨ แก้ไขส่วนแสดงชื่อตรงนี้ให้ใช้ clamp() ยืดหยุ่นได้ และ white-space: nowrap ไม่ให้ตัดบรรทัด
            return `
                <div class="sd-unified-card" style="padding-bottom: 1.5rem;">
                    <div class="sd-unified-bg-emoji">🏅</div>
                    <div class="sd-page-header" style="text-align: center; margin-bottom: 0; overflow: hidden;">
                        <img src="${escapeHtml(profileImage)}" onerror="this.onerror=null; this.src='assets/default-avatar.png';" 
                            style="width: 100px; height: 100px; border-radius: 50%; object-fit: cover; border: 4px solid rgba(255,255,255,0.6); background: var(--pico-card-background-color); margin-bottom: 1rem; box-shadow: 0 4px 10px rgba(0,0,0,0.1);">
                        <h2 class="sd-page-title" style="font-size: clamp(1.2rem, 6vw, 1.6rem); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; margin: 0 auto 0.25rem auto; padding: 0 10px; color: var(--sd-accent-color) !important;">${escapeHtml(fullName)}</h2>
                        <p class="sd-page-subtitle" style="margin-bottom: 1rem; color: var(--sd-accent-color); opacity: 0.9;">${escapeHtml(groupText)} ${user.class_level ? `(${escapeHtml(user.class_level)})` : ''}</p>
                        <button id="sd-edit-profile-btn" class="sd-btn-outline" style="padding: 0.4rem 1.2rem; font-size: 0.85rem; border-radius: 99px; background: rgba(255,255,255,0.2); color: var(--sd-accent-color); border: 1px solid rgba(255,255,255,0.4); transition: background 0.2s;">✏️ แก้ไขโปรไฟล์</button>
                    </div>
                </div>

                <div id="badge-section" style="margin-bottom: 2rem;">
                    <h3 class="sd-section-title">🏅 เหรียญตราของฉัน</h3>
                    <div id="badge-list" aria-busy="true" class="sd-badge-container"></div>
                </div>

                ${user.student_group === 'club' ? `
                <div id="ranking-section" style="margin-bottom: 2rem;">
                    <h3 class="sd-section-title">🏆 อันดับเวลาซ้อมชุมนุม</h3>
                    <div id="practice-ranking-list" aria-busy="true"></div>
                </div>` : ''}

                ${user.class_level ? `
                <div style="margin-bottom: 2rem;">
                    <h3 class="sd-section-title">🏆 อันดับซ้อมในห้องเรียน</h3>
                    <div id="class-ranking-list" aria-busy="true"></div>
                </div>` : ''}

                ${clubFeaturesHtml}

                <div style="margin-top: 3rem; text-align: center;">
                    <button id="sd-logout-btn" class="sd-btn-danger" style="width: 100%;">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px; vertical-align:middle;"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                        ออกจากระบบ
                    </button>
                </div>
                <div class="sd-bottom-spacer"></div>
            `;
        },
        async afterRender(user) {
            document.getElementById('sd-edit-profile-btn')?.addEventListener('click', handleEditProfile);
            
            await renderMyBadges(user.id);
            
            const badgeContainer = document.getElementById('badge-list');
            if (badgeContainer) {
                const badgesWithTitle = badgeContainer.querySelectorAll('[title]');
                badgesWithTitle.forEach(badge => {
                    const description = badge.getAttribute('title');
                    badge.style.cursor = 'pointer';
                    badge.addEventListener('click', (e) => {
                        e.preventDefault();
                        if (typeof Swal !== 'undefined') {
                            Swal.fire({
                                title: 'รายละเอียดเหรียญตรา',
                                text: description,
                                icon: 'info',
                                confirmButtonText: 'ปิดหน้าต่าง',
                                confirmButtonColor: 'var(--pico-primary)'
                            });
                        } else {
                            alert(description);
                        }
                    });
                });
            }

            // ✨ ลบตรรกะการซ่อน DOM ทิ้งเพราะเราจัดการตั้งแต่ตอนดึงข้อมูลแล้ว
            if (user.student_group === 'club') {
                await renderPracticeRanking();
            }

            if (user.class_level) {
                await renderClassPracticeRanking();
            }

            document.getElementById('sd-logout-btn')?.addEventListener('click', async () => {
                const { isConfirmed } = await Swal.fire({
                    title: 'ออกจากระบบ?',
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: 'ออกจากระบบ',
                    cancelButtonText: 'ยกเลิก',
                    confirmButtonColor: '#ef4444'
                });
                if (isConfirmed) {
                    Swal.showLoading();
                    await authApi.signOut();
                    window.location.reload(); 
                }
            });
        }
    },

    notifications: {
        label: 'แจ้งเตือน',
        icon: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>',
        render() {
            return `
                ${renderUnifiedCard({ title: 'การแจ้งเตือน', subtitle: 'อัปเดตและข้อความจากระบบ' })}
                <div id="notification-page-container" aria-busy="true" class="sd-list-container" style="min-height:300px;"></div>
                <div class="sd-bottom-spacer"></div>`;
        },
        async afterRender(user) {
            const container = document.getElementById('notification-page-container');
            try {
                const { data, error } = await notificationsExt.getRecent(user.id, 20);
                if (error) throw error;
                if (!data?.length) {
                    container.innerHTML = '<p style="text-align:center;padding:2rem;color:var(--pico-muted-color);">ยังไม่มีการแจ้งเตือน</p>';
                    return;
                }
                
                container.innerHTML = data.map(n => `
                    <div class="sd-list-item" style="opacity:${n.is_read?0.6:1};">
                        <div class="sd-list-icon" style="background-color:var(--pico-primary-background); color:white;">🔔</div>
                        <div class="sd-list-content">
                            <div class="sd-list-title">${escapeHtml(n.title)}</div>
                            <div class="sd-list-desc">${escapeHtml(n.body)}</div>
                            <div class="sd-list-subtitle">${timeAgo(n.created_at)}</div>
                        </div>
                    </div>
                `).join('');

                const unread = data.filter(n => !n.is_read).map(n => n.id);
                if (unread.length) {
                    await notificationsExt.markAsRead(unread);
                    updateNotificationBadge();
                }
            } catch (err) {
                container.innerHTML = `<p style="color:var(--pico-del-color);">ไม่สามารถโหลดการแจ้งเตือนได้: ${err.message}</p>`;
            } finally {
                container.removeAttribute('aria-busy');
            }
        }
    },

    practice: {
        label: 'ซ้อม',
        icon: '🎛️',
        render(user) {
            return `
                <style>
                    .sd-timer-box { background: var(--pico-card-background-color); border: 1px solid var(--pico-muted-border-color); border-radius: 16px; padding: 1.5rem; text-align: center; margin-bottom: 1.5rem; border-top: 4px solid var(--pico-primary); box-shadow: var(--pico-box-shadow); }
                    .sd-timer-digits { font-size: clamp(2.5rem, 11vw, 4rem); font-weight: 900; font-family: monospace; line-height: 1; margin: 1rem 0; color: var(--pico-color); letter-spacing: -1px; }
                    .sd-timer-status { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.6rem 1rem; border-radius: 99px; font-weight: 600; font-size: 0.9rem; }
                    .status-active { background: rgba(16,185,129,0.1); color: #10b981; }
                    .status-inactive { background: rgba(239,68,68,0.1); color: #ef4444; }

                    .tuner-card, .metro-card { 
                        background: var(--pico-card-background-color); 
                        border: 1px solid var(--pico-muted-border-color); 
                        border-radius: 20px; 
                        padding: 2rem 1.5rem; 
                        text-align: center; 
                        margin-bottom: 2rem; 
                        box-shadow: 0 10px 30px rgba(0,0,0,0.08); 
                        position: relative;
                        overflow: hidden;
                    }
                    /* แก้เส้นขอบบนให้ตามธีม */
                    .tuner-card::before, .metro-card::before {
                        content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px;
                        background: var(--pico-primary);
                    }
                    
                    /* 🎸 TUNER UPGRADE STYLES */
                    .tuner-controls-panel { background: var(--pico-form-element-background-color); padding: 1rem; border-radius: 12px; margin-bottom: 1.5rem; border: 1px solid var(--pico-muted-border-color); }
                    .tuner-string-btn { background: var(--pico-muted-background-color); border: 2px solid transparent; color: var(--pico-color); width: 45px; height: 45px; border-radius: 50%; font-weight: 800; font-size: 0.9rem; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
                    .tuner-string-btn.active { border-color: var(--pico-primary); background: rgba(59,130,246,0.15); color: var(--pico-primary); transform: scale(1.05); }
                    .tuner-string-btn:active { transform: scale(0.95); }
                    .tuner-strings-grid { display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: center; margin-top: 1rem; }
                    
                    .tuner-mode-toggle { display: flex; background: var(--pico-muted-background-color); border-radius: 99px; padding: 4px; margin-bottom: 1rem; }
                    .tuner-mode-btn { flex: 1; padding: 0.5rem; border-radius: 99px; font-size: 0.85rem; font-weight: bold; color: var(--pico-muted-color); border: none; background: transparent; cursor: pointer; transition: 0.2s; }
                    .tuner-mode-btn.active { background: var(--pico-primary); color: white; box-shadow: 0 2px 8px rgba(37,99,235,0.3); }

                    .tuner-svg-container { width: 100%; max-width: 320px; margin: 0 auto; position: relative; }
                    .tuner-hz-box { display: inline-flex; align-items: center; gap: 0.4rem; background: var(--pico-form-element-background-color); padding: 0.3rem 1rem; border-radius: 99px; border: 1px solid var(--pico-muted-border-color); margin-bottom: 0.5rem; }
                    .tuner-hz-input { width: 60px; border: none; background: transparent; font-weight: 900; font-size: 1.1rem; color: var(--pico-primary); text-align: center; outline: none; padding: 0; }
                    
                    .metro-tempo-text { font-size: 1.2rem; font-weight: 800; color: var(--pico-primary); text-transform: uppercase; letter-spacing: 2px; margin-bottom: 0.5rem; text-align: center; transition: color 0.2s; }
                    .metro-top-row { display: flex; align-items: center; justify-content: center; gap: 0.5rem; margin-bottom: 0.5rem; flex-wrap: nowrap; }
                    .metro-btn-circle { width: 40px; height: 40px; border-radius: 50%; border: 2px solid var(--pico-muted-border-color); background: var(--pico-form-element-background-color); font-size: 1.5rem; font-weight: bold; color: var(--pico-color); cursor: pointer; transition: all 0.1s; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
                    
                    /* ปรับฟอนต์ BPM ให้ดูดิจิทัลและชัดเจนขึ้น */
                    .metro-bpm-val { 
                        font-size: 5rem; 
                        font-weight: 900; 
                        line-height: 1; 
                        color: var(--pico-primary); 
                        min-width: 150px; 
                        text-align: center; 
                        font-variant-numeric: tabular-nums; 
                        text-shadow: 0 4px 10px rgba(var(--pico-primary-background), 0.2);
                        cursor: pointer; transition: transform 0.1s; 
                    }
                    .metro-bpm-val:active { transform: scale(0.95); }
                    
                    .metro-tap-btn { background: rgba(59, 130, 246, 0.1); color: var(--pico-primary); border: 1px solid var(--pico-primary); padding: 0.4rem 1.5rem; border-radius: 99px; font-weight: 800; font-size: 0.85rem; cursor: pointer; transition: transform 0.1s; margin-bottom: 1.5rem; letter-spacing: 1px; }
                    .metro-tap-btn:active { transform: scale(0.95); background: var(--pico-primary); color: white; }
                    .metro-slider { width: 100%; max-width: 350px; accent-color: var(--pico-primary); margin-bottom: 1.5rem; }
                    
                    .metro-settings-grid { display: grid; grid-template-columns: 1fr; gap: 1rem; margin-bottom: 1.5rem; max-width: 350px; margin-left: auto; margin-right: auto; }
                    .metro-setting-group { background: var(--pico-form-element-background-color); padding: 0.8rem; border-radius: 12px; border: 1px solid var(--pico-muted-border-color); }
                    .metro-setting-label { font-size: 0.75rem; font-weight: bold; color: var(--pico-muted-color); margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 1px; }
                    
                    .metro-select { width: 100%; background: transparent; border: 1px solid var(--pico-muted-border-color); padding: 0.5rem; border-radius: 8px; font-weight: bold; color: var(--pico-color); text-align: center; cursor: pointer; outline: none; }
                    
                    .metro-sub-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.4rem; }
                    .metro-sub-btn { background: transparent; border: 1px solid var(--pico-muted-border-color); padding: 0.5rem 0; border-radius: 8px; cursor: pointer; font-size: 1.1rem; color: var(--pico-color); transition: all 0.2s; display: flex; flex-direction: column; align-items: center; line-height: 1.2; }
                    .metro-sub-btn span { font-size: 0.6rem; font-weight: bold; opacity: 0.7; margin-top: 0.2rem; }
                    .metro-sub-btn.active { background: rgba(59, 130, 246, 0.15); border-color: var(--pico-primary); color: var(--pico-primary); }

                    .metro-leds { display: flex; justify-content: center; gap: 10px; margin-bottom: 1.5rem; flex-wrap: wrap; }
                    .metro-led { width: 16px; height: 16px; border-radius: 50%; background: var(--pico-muted-border-color); transition: background 0.05s, transform 0.05s; box-shadow: inset 0 2px 4px rgba(0,0,0,0.2); }
                    .metro-led.active-1 { background: #3b82f6; box-shadow: 0 0 15px #3b82f6; transform: scale(1.3); } 
                    .metro-led.active-other { background: #10b981; box-shadow: 0 0 10px #10b981; transform: scale(1.1); } 
                    .metro-led.active-sub { background: #f59e0b; box-shadow: 0 0 8px #f59e0b; transform: scale(0.9); }

                    .practice-big-btn { width: 100%; border-radius: 99px; font-weight: 900; font-size: 1.2rem; padding: 1rem; transition: all 0.2s; text-transform: uppercase; letter-spacing: 1px; }
                </style>

                <div class="sd-unified-card" style="padding-bottom: 1.5rem; text-align: center;">
                    <div class="sd-unified-bg-emoji">🎛️</div>
                    <h2 class="sd-page-title" style="margin-bottom: 0; color: var(--sd-accent-color) !important;">🎛️ เครื่องมือซ้อม</h2>
                    <p class="sd-page-subtitle" style="color: var(--sd-accent-color); opacity: 0.9;">(Practice Studio)</p>
                </div>
                
                <div class="sd-timer-box">
                    <h3 style="margin-bottom:0; font-size:1.1rem; color:var(--pico-muted-color);">เวลาซ้อมปัจจุบัน</h3>
                    <div class="sd-timer-digits" id="sd-timer-display">00:00:00</div>
                    
                    <div id="sd-timer-active" class="sd-timer-status status-active" style="display:none;">
                        <span class="spin-icon">⏳</span> กำลังบันทึกเวลาอัตโนมัติ (ยืมในโรงเรียน)
                    </div>
                    <div id="sd-timer-inactive" class="sd-timer-status status-inactive">
                        <span style="font-size:1.2rem;">⚠️</span> <span id="sd-timer-msg">รอตรวจสอบสิทธิ์การซ้อม...</span>
                    </div>
                </div>

                <div class="tuner-card" id="native-tuner">
                    <h3 style="font-size: 1.2rem; margin-bottom: 1rem;">โปรจูนเนอร์ (Tuner)</h3>
                    
                    <div class="tuner-controls-panel">
                        <div class="grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-bottom: 0.5rem;">
                            <div>
                                <label style="font-size:0.75rem; color:var(--pico-muted-color); font-weight:bold;">โหมด / เครื่องดนตรี</label>
                                <select id="tuner-inst-select" class="sd-select-minimal" style="width:100%; padding: 0.3rem;"></select>
                            </div>
                            <div>
                                <label style="font-size:0.75rem; color:var(--pico-muted-color); font-weight:bold;">Tuning</label>
                                <select id="tuner-preset-select" class="sd-select-minimal" style="width:100%; padding: 0.3rem;"></select>
                            </div>
                        </div>

                        <div id="tuner-strings-container" class="tuner-strings-grid">
                            </div>
                    </div>

                    <div style="display: flex; justify-content: center; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.5rem;">
                        <div class="tuner-hz-box" style="margin-bottom:0;">
                            <span style="font-weight:bold; font-size:0.85rem;">A4 =</span>
                            <input type="number" class="tuner-hz-input" id="tuner-hz-input" value="440" min="400" max="480">
                            <span style="font-weight:bold; font-size:0.85rem;">Hz</span>
                        </div>
                        <div class="tuner-hz-box" style="margin-bottom:0;" title="ตัดเสียงรบกวนภายนอก">
                            <span style="font-weight:bold; font-size:0.85rem;">Noise Gate</span>
                            <input type="range" id="tuner-noise-gate" min="1" max="15" value="4" style="width: 70px; margin: 0 0.5rem; accent-color: var(--pico-primary);">
                        </div>
                    </div>

                    <div class="tuner-svg-container">
                        <svg viewBox="0 0 200 120" style="width: 100%; height: auto; overflow: visible;">
                            <path d="M 30 100 A 70 70 0 0 1 170 100" fill="none" stroke="var(--pico-muted-border-color)" stroke-width="12" stroke-linecap="round"/>
                            <g transform="translate(100,100)">
                                <g transform="rotate(0)"><line x1="0" y1="-82" x2="0" y2="-68" stroke="#10b981" stroke-width="3" stroke-linecap="round"/><text x="0" y="-92" text-anchor="middle" font-size="12" fill="var(--pico-color)" font-weight="900">0</text></g>
                                <g transform="rotate(-45)"><line x1="0" y1="-82" x2="0" y2="-72" stroke="var(--pico-color)" stroke-width="2" stroke-linecap="round"/><text x="0" y="-92" text-anchor="middle" font-size="10" fill="var(--pico-muted-color)" font-weight="bold">-50</text></g>
                                <g transform="rotate(45)"><line x1="0" y1="-82" x2="0" y2="-72" stroke="var(--pico-color)" stroke-width="2" stroke-linecap="round"/><text x="0" y="-92" text-anchor="middle" font-size="10" fill="var(--pico-muted-color)" font-weight="bold">+50</text></g>
                                <g transform="rotate(-22.5)"><line x1="0" y1="-80" x2="0" y2="-72" stroke="var(--pico-muted-color)" stroke-width="1.5"/></g>
                                <g transform="rotate(22.5)"><line x1="0" y1="-80" x2="0" y2="-72" stroke="var(--pico-muted-color)" stroke-width="1.5"/></g>
                                <line id="tuner-needle" x1="0" y1="5" x2="0" y2="-88" stroke="#ef4444" stroke-width="3.5" stroke-linecap="round" style="transition: transform 0.1s cubic-bezier(0.4,0,0.2,1); transform: rotate(0deg);"/>
                                <circle cx="0" cy="0" r="8" fill="var(--pico-color)" stroke="var(--pico-background-color)" stroke-width="2"/>
                            </g>
                        </svg>
                    </div>
                    
                    <div style="display:flex; justify-content:center; align-items:baseline; gap:0.2rem;">
                        <div id="sd-tuner-note" style="font-size:4.5rem; font-weight:900; line-height:1; color:#ef4444; transition: color 0.1s;">-</div>
                        <div id="sd-tuner-octave" style="font-size:2.5rem; font-weight:bold; color:var(--pico-muted-color);"></div>
                    </div>
                    
                    <div style="display:flex; justify-content:center; gap: 1rem; align-items: center; margin-bottom:1.5rem;">
                        <div id="sd-tuner-freq" style="font-size:0.9rem; font-weight:bold; color:var(--pico-muted-color);">--- Hz</div>
                        <div style="width:1px; height:15px; background:var(--pico-muted-border-color);"></div>
                        <div id="sd-tuner-cents" style="font-size:0.9rem; font-weight:bold; color:#ef4444;">ปิดการทำงาน</div>
                    </div>
                    
                    <button id="toggle-tuner-btn" class="sd-btn-primary practice-big-btn">🎙️ เริ่ม (START)</button>
                </div>

                <div class="metro-card">
                    
                    <div class="metro-tempo-text" id="metro-tempo-text">Moderato</div>
                    
                    <div class="metro-top-row">
                        <button class="metro-btn-circle" id="metro-minus">−</button>
                        <div class="metro-bpm-val" id="metro-bpm-val" title="คลิกเพื่อ เริ่ม/หยุด">120</div>
                        <button class="metro-btn-circle" id="metro-plus">+</button>
                    </div>
                    
                    <button class="metro-tap-btn" id="metro-tap">👆 TAP TEMPO (เคาะจังหวะ)</button>
                    <input type="range" class="metro-slider" id="metro-slider" min="30" max="250" value="120">
                    
                    <div class="metro-settings-grid">
                        <div class="metro-setting-group">
                            <div class="metro-setting-label">อัตราจังหวะ (Meter)</div>
                            <select class="metro-select" id="metro-beats">
                                <option value="1">1/4 (เคาะทุกจังหวะ)</option>
                                <option value="2">2/4 (มาร์ช)</option>
                                <option value="3">3/4 (วอลทซ์)</option>
                                <option value="4" selected>4/4 (มาตรฐาน)</option>
                                <option value="5">5/4</option>
                                <option value="6">6/8</option>
                                <option value="7">7/8</option>
                                <option value="9">9/8</option>
                                <option value="12">12/8</option>
                            </select>
                        </div>
                        
                        <div class="metro-setting-group">
                            <div class="metro-setting-label">รูปแบบโน้ตย่อย (Subdivision)</div>
                            <div class="metro-sub-grid">
                                <button class="metro-sub-btn active" data-sub="1">♩<span>ตัวดำ</span></button>
                                <button class="metro-sub-btn" data-sub="2">♫<span>เขบ็ต 1</span></button>
                                <button class="metro-sub-btn" data-sub="3" style="font-style:italic;">3<span>3 พยางค์</span></button>
                                <button class="metro-sub-btn" data-sub="4">♬<span>เขบ็ต 2</span></button>
                            </div>
                        </div>
                    </div>

                    <div class="metro-leds" id="metro-leds"></div>

                    <button id="metro-play-btn" class="sd-btn-primary practice-big-btn">▶ เริ่ม (START)</button>
                </div>
            `;
        },
        async afterRender(user) {
            if (window._sdPracticeIntervals) window._sdPracticeIntervals.forEach(clearInterval);
            window._sdPracticeIntervals = [];

            // ==========================================
            // 1. นาฬิกาจับเวลา (อัปเดตล่าสุด)
            // ==========================================
            const activeStatus = document.getElementById('sd-timer-active');
            const inactiveStatus = document.getElementById('sd-timer-inactive');
            const msgEl = document.getElementById('sd-timer-msg');
            
            const isStudent = user.role === 'student' || user.student_group === 'club' || user.student_group === 'class';
            
            if (!isStudent) {
                activeStatus.style.display = 'none';
                msgEl.innerHTML = 'เฉพาะ "นักเรียน" เท่านั้นที่มีการนับเวลาซ้อม';
            } else {
                try {
                    const borrowsToUse = state.myBorrowedItems?.length ? state.myBorrowedItems : [];
                    
                    const inSchoolBorrows = borrowsToUse.filter(b => 
                        !b.is_take_home && 
                        b.borrow_type !== 'take_home' && 
                        b.approval_status !== 'pending'
                    );
                    
                    if (inSchoolBorrows.length > 0) {
                        inactiveStatus.style.display = 'none';
                        activeStatus.style.display = 'inline-flex';
                    } else {
                        // 🟢 FIX: เปลี่ยน UI ให้แสดงสถานะจบการซ้อม เมื่อเวลาหยุดเดิน
                        activeStatus.style.display = 'none';
                        inactiveStatus.style.display = 'inline-flex';
                        
                        if (state.wasPracticing && state.frozenTimeStr) {
                            msgEl.innerHTML = '<b>สิ้นสุดการซ้อม</b> (บันทึกเวลาเรียบร้อย)';
                        } else {
                            msgEl.innerHTML = 'เวลาเริ่มอัตโนมัติเมื่อ <b>"ยืมเครื่องในโรงเรียน"</b>';
                        }
                    }
                    
                    // บังคับอัปเดตตัวเลขเวลาบนหน้าจอให้ตรงกับสถานะล่าสุด 1 ครั้ง
                    if (typeof updateAllTimers === 'function') updateAllTimers();
                    
                } catch(e) { console.error('Timer Error:', e); }
            }

            // ==========================================
            // 2. เครื่องตั้งสาย (Tuner) - PRO UPGRADED
            // ==========================================
            let ts = { ctx:null, stream:null, analyser:null, raf:null, on:false, buf:null };
            const COLORS = { flat: '#f59e0b', sharp: '#ef4444', tune: '#10b981', gray: 'var(--pico-color)' };
            
            const tunerEl = document.getElementById('native-tuner');
            const noteEl = document.getElementById('sd-tuner-note');
            const octEl = document.getElementById('sd-tuner-octave');
            const freqEl = document.getElementById('sd-tuner-freq');
            const centsEl = document.getElementById('sd-tuner-cents');
            const needle = document.getElementById('tuner-needle');
            const toggleBtn = document.getElementById('toggle-tuner-btn');
            
            // UI & Settings
            const instSelect = document.getElementById('tuner-inst-select');
            const presetSelect = document.getElementById('tuner-preset-select');
            const stringsContainer = document.getElementById('tuner-strings-container');
            const hzInput = document.getElementById('tuner-hz-input');
            const noiseGateSlider = document.getElementById('tuner-noise-gate');

            let tuningMode = 'auto'; // 'auto' | 'target'
            let currentTargetMidi = null;
            let pitchHistory = []; 

            // 💾 ระบบดึงค่า LocalStorage (Auto-Save)
            const savedHz = localStorage.getItem('sd_tuner_hz');
            if (savedHz) hzInput.value = savedHz;
            const savedGate = localStorage.getItem('sd_tuner_gate');
            if (savedGate) noiseGateSlider.value = savedGate;

            hzInput.addEventListener('change', () => localStorage.setItem('sd_tuner_hz', hzInput.value));
            noiseGateSlider.addEventListener('change', () => localStorage.setItem('sd_tuner_gate', noiseGateSlider.value));

            // Note Math Helpers
            const NOTE_NAMES = ["C","C#/Db","D","D#/Eb","E","F","F#/Gb","G","G#/Ab","A","A#/Bb","B"];
            const noteToMidi = (noteStr) => {
                const match = noteStr.match(/^([A-G][#b]?)(-?\d+)?$/);
                if (!match) return null;
                let n = match[1];
                const map = {"Db":"C#","Eb":"D#","Gb":"F#","Ab":"G#","Bb":"A#"};
                if (map[n]) n = map[n];
                const oct = match[2] ? parseInt(match[2], 10) : null;
                const base = NOTE_NAMES.indexOf(n);
                return oct !== null ? base + (oct + 1) * 12 : base;
            };
            const midiToFreq = (midi, ref) => ref * Math.pow(2, (midi - 69) / 12);
            
            // Initialize Dropdowns
            const initTunerUI = () => {
                instSelect.innerHTML = Object.keys(TUNING_PRESETS).map(k => `<option value="${k}">${k}</option>`).join('');
                const savedInst = localStorage.getItem('sd_tuner_inst');
                if (savedInst && TUNING_PRESETS[savedInst]) instSelect.value = savedInst;
                updatePresetDropdown();
            };

            const updatePresetDropdown = () => {
                const inst = instSelect.value;
                presetSelect.innerHTML = Object.keys(TUNING_PRESETS[inst]).map(k => `<option value="${k}">${k}</option>`).join('');
                
                const savedPreset = localStorage.getItem('sd_tuner_preset');
                if (savedPreset && TUNING_PRESETS[inst][savedPreset]) {
                    presetSelect.value = savedPreset;
                }
                renderStringButtons();
            };

            const renderStringButtons = () => {
                const inst = instSelect.value;
                const preset = presetSelect.value;
                const strings = TUNING_PRESETS[inst][preset] || [];
                
                // 🟢 ปุ่ม AUTO
                let html = `<button class="tuner-string-btn auto-btn ${tuningMode === 'auto' ? 'active' : ''}" id="btn-tuner-auto" style="width:auto; padding:0 1rem; border-radius:99px; font-size:0.8rem; background: ${tuningMode === 'auto' ? 'var(--pico-primary)' : 'var(--pico-muted-border-color)'}; color: ${tuningMode === 'auto' ? 'white' : 'var(--pico-color)'};">AUTO</button>`;
                
                if (strings.length > 0) {
                    html += [...strings].reverse().map(note => 
                        `<button class="tuner-string-btn note-btn" data-note="${note}">${note}</button>`
                    ).join('');
                }

                stringsContainer.innerHTML = html;

                const btnAutoInner = stringsContainer.querySelector('#btn-tuner-auto');
                const noteBtns = stringsContainer.querySelectorAll('.note-btn');

                btnAutoInner.addEventListener('click', () => {
                    tuningMode = 'auto';
                    currentTargetMidi = null;
                    stringsContainer.querySelectorAll('.tuner-string-btn').forEach(b => {
                        b.classList.remove('active'); b.style.boxShadow = ''; b.style.transform = '';
                    });
                    btnAutoInner.classList.add('active');
                    btnAutoInner.style.background = 'var(--pico-primary)'; btnAutoInner.style.color = 'white';
                });

                // เมื่อกดโน้ต ให้เข้า Target Mode (ล็อกสาย) อัตโนมัติ
                noteBtns.forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        tuningMode = 'target';
                        stringsContainer.querySelectorAll('.tuner-string-btn').forEach(b => {
                            b.classList.remove('active'); b.style.boxShadow = ''; b.style.transform = '';
                        });
                        btnAutoInner.classList.remove('active');
                        btnAutoInner.style.background = 'var(--pico-muted-border-color)'; btnAutoInner.style.color = 'var(--pico-color)';

                        e.target.classList.add('active');
                        currentTargetMidi = noteToMidi(e.target.dataset.note);
                    });
                });

                if (tuningMode === 'target' && currentTargetMidi !== null) {
                     const isChromatic = instSelect.value.startsWith("Chromatic");
                     const targetBtn = Array.from(noteBtns).find(b => {
                         const bMidi = noteToMidi(b.dataset.note);
                         return isChromatic ? (bMidi % 12 === currentTargetMidi % 12) : (bMidi === currentTargetMidi);
                     });
                     if(targetBtn) targetBtn.classList.add('active');
                }
            };

            instSelect.addEventListener('change', () => {
                tuningMode = 'auto'; currentTargetMidi = null;
                localStorage.setItem('sd_tuner_inst', instSelect.value);
                localStorage.removeItem('sd_tuner_preset');
                updatePresetDropdown();
            });

            presetSelect.addEventListener('change', () => {
                tuningMode = 'auto'; currentTargetMidi = null;
                localStorage.setItem('sd_tuner_preset', presetSelect.value);
                renderStringButtons();
            });

            initTunerUI();

            // 🎵 Audio Algorithm + NOISE GATE
            const autoCorrelate = (buf, rate) => {
                const SIZE = buf.length;
                let rms = 0; for (let i=0; i<SIZE; i++) rms += buf[i]*buf[i];
                rms = Math.sqrt(rms/SIZE);
                
                // 🔊 ระบบ Noise Gate
                const gateValue = parseInt(noiseGateSlider.value) || 4;
                const threshold = gateValue * 0.005; 
                if (rms < threshold) return -1; // ตัดเสียงรบกวน คืนค่า -1

                let r1 = 0, r2 = SIZE-1;
                for (let i=0; i<SIZE/2; i++) if (Math.abs(buf[i])<0.2) { r1=i; break; }
                for (let i=1; i<SIZE/2; i++) if (Math.abs(buf[SIZE-i])<0.2) { r2=SIZE-i; break; }
                buf = buf.slice(r1, r2); const n = buf.length;
                const c = new Array(n).fill(0);
                for (let i=0; i<n; i++) for (let j=0; j<n-i; j++) c[i] += buf[j]*buf[j+i];
                let d=0; while (d<c.length && c[d]>c[d+1]) d++;
                let mx=-1, mp=-1;
                for (let i=d; i<n; i++) if (c[i]>mx) { mx=c[i]; mp=i; }
                let T = mp;
                if (T <= 0 || T >= c.length - 1) return -1;
                const a=(c[T-1]+c[T+1]-2*c[T])/2, b=(c[T+1]-c[T-1])/2;
                if (a) T = T - b/(2*a);
                if (T <= 0) return -1;
                return rate/T;
            };

            const tick = () => {
                if (!ts.on) return;
                ts.analyser.getFloatTimeDomainData(ts.buf);
                const rawPitch = autoCorrelate(ts.buf, ts.ctx.sampleRate);
                
                if (rawPitch !== -1) {
                    pitchHistory.push(rawPitch);
                    if (pitchHistory.length > 5) pitchHistory.shift();
                    const pitch = pitchHistory.reduce((a,b)=>a+b) / pitchHistory.length;

                    const ref = parseFloat(hzInput.value) || 440;
                    freqEl.textContent = `${pitch.toFixed(1)} Hz`;

                    // 🎷 ระบบ Transposition (เครื่องเป่า In Bb, Eb, F)
                    const isChromatic = instSelect.value.startsWith("Chromatic");
                    let offset = 0;
                    if (isChromatic) {
                        const preset = presetSelect.value;
                        if (preset.includes("Bb")) offset = 2;
                        else if (preset.includes("Eb")) offset = 9;
                        else if (preset.includes("F")) offset = 7;
                    }

                    const noteNumFloat = 12 * Math.log2(pitch / ref);
                    const writtenMidiFloat = noteNumFloat + offset;
                    const autoWrittenMidi = Math.round(writtenMidiFloat) + 69;

                    let targetWrittenMidi, targetFreq, centsDiff;

                    if (tuningMode === 'auto' || currentTargetMidi === null) {
                        targetWrittenMidi = autoWrittenMidi;
                        targetFreq = midiToFreq(targetWrittenMidi - offset, ref);

                        // ไฮไลต์ปุ่มโน้ต (ใช้ classDiff หรือเปรียบเทียบตรงๆ)
                        const noteBtns = stringsContainer.querySelectorAll('.note-btn');
                        noteBtns.forEach(btn => {
                            const btnMidi = noteToMidi(btn.dataset.note);
                            const match = isChromatic ? (btnMidi % 12 === autoWrittenMidi % 12) : (btnMidi === autoWrittenMidi);
                            if (match) {
                                btn.classList.add('active'); btn.style.transform = 'scale(1.1)'; btn.style.boxShadow = '0 0 10px var(--pico-primary)';
                            } else {
                                btn.classList.remove('active'); btn.style.transform = ''; btn.style.boxShadow = '';
                            }
                        });
                    } else {
                        if (isChromatic) {
                            let classDiff = (currentTargetMidi % 12) - (autoWrittenMidi % 12);
                            if (classDiff > 6) classDiff -= 12;
                            if (classDiff < -6) classDiff += 12;
                            targetWrittenMidi = autoWrittenMidi + classDiff;
                        } else {
                            targetWrittenMidi = currentTargetMidi;
                        }
                        targetFreq = midiToFreq(targetWrittenMidi - offset, ref);
                    }

                    centsDiff = 1200 * Math.log2(pitch / targetFreq);

                    const noteName = NOTE_NAMES[targetWrittenMidi % 12];
                    const octave = isChromatic ? "" : Math.floor(targetWrittenMidi / 12) - 1;

                    noteEl.textContent = noteName.replace('#', '♯');
                    octEl.textContent = octave;

                    // Green Rule: <= 8 cents
                    const isGreen = Math.abs(centsDiff) <= 8;
                    
                    let angle = centsDiff * 0.9; 
                    if (angle > 45) angle = 45; if (angle < -45) angle = -45;
                    needle.style.transform = `rotate(${angle}deg)`;

                    if (isGreen) {
                        centsEl.innerHTML = `ตรงคีย์ (In Tune)`;
                        centsEl.style.color = COLORS.tune; noteEl.style.color = COLORS.tune; needle.style.stroke = COLORS.tune;
                    } else {
                        const sign = centsDiff > 0 ? '+' : '';
                        centsEl.textContent = `${sign}${centsDiff.toFixed(0)} cents`;
                        const errColor = centsDiff > 0 ? COLORS.sharp : COLORS.flat;
                        centsEl.style.color = errColor; noteEl.style.color = COLORS.gray; needle.style.stroke = errColor;
                    }

                } else {
                    // 🟢 HOLD STATE: หากไม่มีเสียง หรือเสียงรบกวนเบาเกินไป (Noise Gate ทำงาน)
                    // โค้ดจะไม่ทำงานในส่วนนี้ ทำให้ค่าบนหน้าจอ "ค้าง (Hold)" อยู่ที่ตำแหน่งล่าสุด ไม่หายไปหรือเด้งไปมา
                }
                ts.raf = requestAnimationFrame(tick);
            };

            const startTuner = async () => {
                if (ts.on) return;
                toggleBtn.setAttribute('aria-busy', 'true');
                hzInput.disabled = true; noiseGateSlider.disabled = true;
                try {
                    ts.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, autoGainControl: false, noiseSuppression: false } });
                    ts.ctx = new (window.AudioContext || window.webkitAudioContext)();
                    if (ts.ctx.state === 'suspended') await ts.ctx.resume();
                    ts.analyser = ts.ctx.createAnalyser();
                    ts.analyser.fftSize = 8192; 
                    ts.buf = new Float32Array(ts.analyser.fftSize);
                    ts.ctx.createMediaStreamSource(ts.stream).connect(ts.analyser);
                    ts.on = true; pitchHistory = [];
                    tick();
                    toggleBtn.innerHTML = '⏹️ หยุดจูน (STOP)';
                    toggleBtn.classList.replace('sd-btn-primary', 'sd-btn-danger');
                } catch (e) { Swal.fire('ผิดพลาด', 'ไม่สามารถเข้าถึงไมโครโฟนได้', 'error'); stopTuner(); }
                finally { toggleBtn.removeAttribute('aria-busy'); }
            };

            const stopTuner = () => {
                hzInput.disabled = false; noiseGateSlider.disabled = false;
                if (ts.raf) cancelAnimationFrame(ts.raf);
                if (ts.stream) ts.stream.getTracks().forEach(t => t.stop());
                if (ts.ctx && ts.ctx.state !== 'closed') ts.ctx.close();
                ts = { ctx:null, stream:null, analyser:null, raf:null, on:false, buf:null };
                noteEl.textContent = '-'; octEl.textContent = ''; freqEl.textContent = '--- Hz'; centsEl.textContent = 'ปิดการทำงาน'; centsEl.style.color = COLORS.sharp; needle.style.transform = 'rotate(0deg)'; needle.style.stroke = COLORS.sharp; noteEl.style.color = COLORS.sharp;
                toggleBtn.innerHTML = '🎙️ เริ่มจูน (START)'; toggleBtn.classList.replace('sd-btn-danger', 'sd-btn-primary');
            };

            toggleBtn.addEventListener('click', () => ts.on ? stopTuner() : startTuner());

            // ==========================================
            // 3. เมโทรนอม (Pro Metronome)
            // ==========================================
            const mPlayBtn = document.getElementById('metro-play-btn');
            const mMinus = document.getElementById('metro-minus');
            const mPlus = document.getElementById('metro-plus');
            const mSlider = document.getElementById('metro-slider');
            const mBpmVal = document.getElementById('metro-bpm-val');
            const mBeatsSelect = document.getElementById('metro-beats');
            const mLedsContainer = document.getElementById('metro-leds');
            const mSubBtns = document.querySelectorAll('.metro-sub-btn');
            const mTapBtn = document.getElementById('metro-tap');
            const mTempoText = document.getElementById('metro-tempo-text'); 
            
            let audioCtx = null;
            let isMetroPlaying = false;
            let tempo = 120;
            let beatsPerBar = 4;
            let subdivision = 1; 
            
            let currentBeat = 0;
            let currentSub = 0;
            let nextNoteTime = 0;
            let scheduleTimerID = null;
            let noteQueue = [];
            let lastDrawnObj = { beat: -1, sub: -1 };

            mBpmVal.addEventListener('click', () => { mPlayBtn.click(); });

            function updateTempoUI() {
                mBpmVal.textContent = tempo;
                mSlider.value = tempo;
                
                let t = "Moderato";
                if (tempo < 40) t = "Grave";
                else if (tempo < 60) t = "Largo";
                else if (tempo < 66) t = "Adagio";
                else if (tempo < 108) t = "Andante";
                else if (tempo < 120) t = "Moderato";
                else if (tempo < 168) t = "Allegro";
                else if (tempo < 200) t = "Presto";
                else t = "Prestissimo";
                
                if(mTempoText) mTempoText.textContent = t;
            }

            let tapTimes = [];
            mTapBtn.addEventListener('click', () => {
                const now = performance.now();
                tapTimes.push(now);
                if (tapTimes.length > 4) tapTimes.shift();
                if (tapTimes.length >= 2) {
                    let diffs = [];
                    for(let i=1; i<tapTimes.length; i++) diffs.push(tapTimes[i] - tapTimes[i-1]);
                    let avg = diffs.reduce((a,b)=>a+b, 0) / diffs.length;
                    let newBpm = Math.round(60000 / avg);
                    if (newBpm >= 30 && newBpm <= 250) {
                        tempo = newBpm;
                        updateTempoUI();
                    }
                }
            });

            mSlider.addEventListener('input', e => { tempo = parseInt(e.target.value); updateTempoUI(); });
            mMinus.addEventListener('click', () => { if(tempo > 30) { tempo--; updateTempoUI(); } });
            mPlus.addEventListener('click', () => { if(tempo < 250) { tempo++; updateTempoUI(); } });
            
            function generateLEDs() {
                mLedsContainer.innerHTML = '';
                for(let i=0; i<beatsPerBar; i++) {
                    const led = document.createElement('div');
                    led.className = 'metro-led';
                    mLedsContainer.appendChild(led);
                }
            }
            mBeatsSelect.addEventListener('change', e => { beatsPerBar = parseInt(e.target.value); generateLEDs(); });

            mSubBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    mSubBtns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    subdivision = parseInt(btn.dataset.sub);
                });
            });

            function scheduleNote(beatNumber, subNumber, time) {
                noteQueue.push({ beat: beatNumber, sub: subNumber, time: time });
                
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                
                if (subNumber === 0) {
                    if (beatNumber === 0) {
                        osc.frequency.value = 1000.0; 
                        gain.gain.setValueAtTime(1, time);
                    } else {
                        osc.frequency.value = 750.0; 
                        gain.gain.setValueAtTime(0.8, time);
                    }
                } else {
                    osc.frequency.value = 400.0; 
                    gain.gain.setValueAtTime(0.3, time);
                }
                
                gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
                osc.start(time);
                osc.stop(time + 0.05);
            }

            function nextNote() {
                const secondsPerBeat = 60.0 / tempo;
                const secondsPerSub = secondsPerBeat / subdivision;
                
                nextNoteTime += secondsPerSub;
                currentSub++;
                
                if (currentSub >= subdivision) {
                    currentSub = 0;
                    currentBeat++;
                    if (currentBeat >= beatsPerBar) {
                        currentBeat = 0;
                    }
                }
            }

            function scheduler() {
                while (nextNoteTime < audioCtx.currentTime + 0.1) {
                    scheduleNote(currentBeat, currentSub, nextNoteTime);
                    nextNote();
                }
                scheduleTimerID = setTimeout(scheduler, 25.0);
            }

            function drawLEDs() {
                if (!isMetroPlaying) return;
                let currentTime = audioCtx.currentTime;
                let currentDraw = lastDrawnObj;
                
                while (noteQueue.length && noteQueue[0].time < currentTime) {
                    currentDraw = noteQueue[0];
                    noteQueue.splice(0, 1);
                }
                
                if (lastDrawnObj.beat !== currentDraw.beat || lastDrawnObj.sub !== currentDraw.sub) {
                    const leds = mLedsContainer.children;
                    for (let i=0; i<leds.length; i++) {
                        leds[i].className = 'metro-led';
                        if (i === currentDraw.beat) {
                            if (currentDraw.sub === 0) {
                                leds[i].classList.add(i === 0 ? 'active-1' : 'active-other');
                                
                                mBpmVal.style.color = i === 0 ? '#3b82f6' : '#10b981';
                                mBpmVal.style.textShadow = i === 0 ? '0 0 25px rgba(59,130,246,0.8)' : '0 0 20px rgba(16,185,129,0.8)';
                                
                                setTimeout(() => {
                                    if (isMetroPlaying) {
                                        mBpmVal.style.color = '';
                                        mBpmVal.style.textShadow = '';
                                    }
                                }, 100);

                            } else {
                                leds[i].classList.add('active-sub');
                            }
                        }
                    }
                    lastDrawnObj = currentDraw;
                }
                requestAnimationFrame(drawLEDs);
            }

            mPlayBtn.addEventListener('click', () => {
                if (isMetroPlaying) {
                    isMetroPlaying = false;
                    clearTimeout(scheduleTimerID);
                    mPlayBtn.innerHTML = '▶ เริ่ม (START)';
                    mPlayBtn.style.background = '';
                    mPlayBtn.style.borderColor = '';
                    
                    mBpmVal.style.color = '';
                    mBpmVal.style.textShadow = '';
                    Array.from(mLedsContainer.children).forEach(led => led.className = 'metro-led');
                } else {
                    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                    if (audioCtx.state === 'suspended') audioCtx.resume();
                    isMetroPlaying = true;
                    currentBeat = 0;
                    currentSub = 0;
                    nextNoteTime = audioCtx.currentTime + 0.05;
                    
                    mPlayBtn.innerHTML = '⏹ หยุด (STOP)';
                    mPlayBtn.style.background = 'var(--pico-del-color)';
                    mPlayBtn.style.borderColor = 'var(--pico-del-color)';
                    
                    scheduler();
                    requestAnimationFrame(drawLEDs);
                }
            });

            updateTempoUI();
            generateLEDs();

            const originalDestroy = window.__sdPracticeDestroy;
            window.__sdPracticeDestroy = () => {
                if(tuning) stopTuner();
                if(isMetroPlaying) mPlayBtn.click();
                if(originalDestroy) originalDestroy();
            };
        }
    },
    
    bosses: {
        label: 'ล่าบอส',
        icon: '🐉',
        render() {
            return `
                ${renderUnifiedCard({ emoji: '🐉', title: 'กระดานล่าบอส', subtitle: 'ท้าทายบทสอบเพื่อรับ XP และดาวสะสม' })}
                <div id="sd-boss-list" aria-busy="true" style="margin-bottom: 2rem;">
                    <p style="text-align:center; padding: 2rem; color: var(--pico-muted-color);">กำลังอัปเดตกระดานเควสต์...</p>
                </div>
                <div class="sd-bottom-spacer"></div>
            `;
        },
        async afterRender(user) {
            const container = document.getElementById('sd-boss-list');
            try {
                // ดึงข้อมูล HP ของผู้เล่นปัจจุบัน และรายการบอสผ่าน API (No Supabase Code here!)
                const [userStatsRes, bossesRes] = await Promise.all([
                    bossesApi.getUserHpAndStars(user.id),
                    bossesApi.getActiveBosses()
                ]);

                if (bossesRes.error) throw bossesRes.error;
                if (userStatsRes.error) throw userStatsRes.error;

                const hp = userStatsRes.data?.hp ?? 3;
                const bosses = bossesRes.data || [];

                if (!bosses.length) {
                    container.innerHTML = '<div class="sd-list-container"><p style="text-align:center; padding: 2rem;">ยังไม่มีบอสให้ท้าทายในขณะนี้ 🕊️</p></div>';
                    return;
                }

                let html = '';

                // แจ้งเตือนถ้าหัวใจหมด
                if (hp <= 0) {
                     html += `
                     <div style="background:rgba(239,68,68,0.1); border:1px solid #ef4444; padding:1.2rem; border-radius:12px; margin-bottom:1.5rem; color:#ef4444; text-align:center; box-shadow: var(--pico-box-shadow);">
                        <div style="font-size: 2rem; margin-bottom: 0.5rem;">💔</div>
                        <strong style="font-size: 1.1rem;">หัวใจหมด! คุณอยู่ในสภาพหมดแรง (Exhausted)</strong><br>
                        <small style="color: var(--pico-color);">คุณต้องสะสมเวลาซ้อมผ่าน "เครื่องมือซ้อม" หรือ "มินิเกม" ให้ครบกำหนด เพื่อฟื้นฟูหัวใจกลับมา</small>
                     </div>`;
                } else {
                     html += `
                     <div style="text-align:center; margin-bottom:1.5rem; font-size:1.1rem; font-weight:bold; letter-spacing: 2px;">
                        พลังชีวิตของคุณ: ${Array.from({length:3}, (_,i)=> i < hp ? '❤️':'🖤').join('')}
                     </div>`;
                }

                html += bosses.map(b => `
                    <div class="sd-list-container" style="margin-bottom: 1rem; padding: 1.5rem; opacity: ${hp <= 0 ? 0.6 : 1}; transition: transform 0.2s;">
                        <div style="display:flex; gap: 1rem; align-items:flex-start;">
                            <div style="font-size: 2.5rem; line-height: 1;">👹</div>
                            <div style="flex:1;">
                                <h4 style="margin: 0 0 0.25rem 0; color: var(--pico-color); font-weight: 800;">${escapeHtml(b.title)}</h4>
                                <p style="margin: 0; font-size: 0.85rem; color: var(--pico-muted-color);">${escapeHtml(b.description)}</p>
                                <div style="margin-top: 0.5rem; display: flex; gap: 0.5rem; flex-wrap: wrap;">
                                    <span class="sd-badge" style="background:rgba(139,92,246,0.15); color:#8b5cf6; padding: 2px 8px; border-radius: 99px; font-size: 0.75rem; font-weight: bold;">+${b.reward_xp} XP</span>
                                    <span class="sd-badge" style="background:rgba(245,158,11,0.15); color:#f59e0b; padding: 2px 8px; border-radius: 99px; font-size: 0.75rem; font-weight: bold;">+${b.reward_stars} ⭐️ ดาว</span>
                                </div>
                            </div>
                        </div>
                        
                        <div style="display: flex; gap: 0.5rem; margin-top: 1.25rem;">
                            <button class="sd-btn-outline" style="flex:1; padding:0.6rem; font-size: 0.85rem;" data-boss-action="join-lobby" data-boss-id="${b.id}" ${hp <= 0 ? 'disabled' : ''}>🤝 เข้าปาร์ตี้ (ใส่รหัส)</button>
                            <button class="sd-btn-primary" style="flex:1; padding:0.6rem; font-size: 0.85rem;" data-boss-action="submit-video" data-boss-id="${b.id}" ${hp <= 0 ? 'disabled' : ''}>🎥 ส่งคลิปโจมตี</button>
                        </div>
                    </div>
                `).join('');
                
                container.innerHTML = html;
                container.removeAttribute('aria-busy');

                const handleJoinLobby = async (bossId) => {
                    const { value: roomCode } = await Swal.fire({
                        title: 'เข้าร่วมปาร์ตี้ล่าบอส',
                        input: 'text',
                        inputLabel: 'ใส่รหัสห้อง 4 หลักที่ครูบอก',
                        inputPlaceholder: 'ABCD',
                        showCancelButton: true,
                        inputValidator: (val) => (!val || val.length !== 4) && 'กรุณาใส่รหัส 4 หลักให้ถูกต้อง'
                    });
                    if (!roomCode) return;

                    Swal.showLoading();
                    try {
                        await raidApi.joinLobby(user.id, roomCode);
                        Swal.fire('เข้าร่วมสำเร็จ!', 'คุณอยู่ในห้องสอบแล้ว รอครูกดเริ่มสอบเลย!', 'success');
                    } catch (err) {
                        Swal.fire('ผิดพลาด', err.message || 'รหัสห้องไม่ถูกต้อง หรือห้องปิดไปแล้ว', 'error');
                    }
                };

                const handleSubmitVideoRaid = async (bossId) => {
                    const { value: url } = await Swal.fire({
                        title: 'ส่งคลิปโจมตีบอส',
                        input: 'url',
                        inputLabel: 'วางลิงก์วิดีโอ (YouTube/Google Drive)',
                        showCancelButton: true,
                        inputValidator: (val) => !val && 'กรุณาใส่ลิงก์วิดีโอ'
                    });
                    if (!url) return;

                    Swal.showLoading();
                    try {
                        const { error } = await bossesApi.submitVideoRaid(user.id, bossId, url);
                        if (error) throw error;
                        Swal.fire('ส่งข้อสอบสำเร็จ!', 'คลิปของคุณถูกส่งไปโจมตีบอสแล้ว รอครูตรวจให้คะแนนนะ', 'success');
                    } catch (err) {
                        Swal.fire('ผิดพลาด', err.message, 'error');
                    }
                };

                container.addEventListener('click', async (event) => {
                    const button = event.target.closest('[data-boss-action]');
                    if (!button) return;
                    const bossId = button.dataset.bossId;
                    const action = button.dataset.bossAction;
                    if (!bossId || !action) return;
                    event.preventDefault();

                    if (action === 'join-lobby') await handleJoinLobby(bossId);
                    if (action === 'submit-video') await handleSubmitVideoRaid(bossId);
                });

            } catch (err) {
                container.innerHTML = `<p style="color:var(--pico-del-color); text-align:center;">เกิดข้อผิดพลาด: ${err.message}</p>`;
            }
        }
    },
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. Practice Logic (ระบบจับเวลา)
// ─────────────────────────────────────────────────────────────────────────────
function renderPractice() {
    return `
        <div style="text-align: center; padding: 2rem 0;">
            <div class="sd-timer-display" id="sd-timer-display" style="font-size: 5rem; font-weight: 800; color: var(--pico-primary-background); line-height: 1; font-variant-numeric: tabular-nums;">00:00</div>
            <p id="sd-timer-status" style="color: var(--pico-muted-color); margin-top: 0.5rem; margin-bottom: 2rem;">กดเริ่มเพื่อจับเวลา</p>

            <div style="display: flex; gap: 1rem; justify-content: center;">
                <button class="sd-btn-primary" id="sd-btn-start" style="padding: 0.8rem 2.5rem; border-radius: 99px; font-size: 1.1rem;">
                    ▶ เริ่มซ้อม
                </button>
                <button class="sd-btn-danger" id="sd-btn-stop" disabled style="padding: 0.8rem 2.5rem; border-radius: 99px; font-size: 1.1rem; opacity: 0.5;">
                    ⏹ หยุด
                </button>
            </div>
        </div>

        <div id="sd-summary" class="hidden" style="background: var(--pico-card-background-color); border-radius: 16px; padding: 1.5rem; text-align: center; box-shadow: var(--pico-box-shadow);">
            <h3 style="font-size: 1rem; margin-bottom: 0.5rem;">📋 สรุปการซ้อม</h3>
            <span style="font-size: 1.5rem; font-weight: bold; color: var(--pico-primary-background);" id="sd-summary-duration">—</span>
        </div>`;
}

function formatTime(totalSeconds) {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Timer Logic & Return Validation
// ─────────────────────────────────────────────────────────────────────────────

function startTimer() {
    if (state.timer.running) return;

    const hasActiveBorrow = state.myBorrowedItems.some(item => 
        (item.return_timestamp === null && item.approval_status !== 'pending' && item.approval_status !== 'rejected')
    );

    if (!hasActiveBorrow) {
        Swal.fire('แจ้งเตือน', 'คุณต้องทำการ "ยืมเครื่องดนตรี" ให้สำเร็จก่อน จึงจะเริ่มจับเวลาซ้อมได้ครับ', 'warning');
        return;
    }

    state.timer.running = true;

    state.timer.intervalId = setInterval(() => {
        state.timer.seconds += 1;
        const display = document.getElementById('sd-timer-display');
        if (display) display.textContent = formatTime(state.timer.seconds);
    }, 1000);

    const btnStart = document.getElementById('sd-btn-start');
    const btnStop  = document.getElementById('sd-btn-stop');
    if (btnStart) { btnStart.disabled = true; btnStart.style.opacity = '0.5'; }
    if (btnStop)  { btnStop.disabled  = false; btnStop.style.opacity = '1'; }

    const status = document.getElementById('sd-timer-status');
    if (status) status.textContent = 'กำลังซ้อม...';

    document.getElementById('sd-summary')?.classList.add('hidden');
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. ฟังก์ชันจัดการคืนเครื่องดนตรีทีละชิ้น และหยุดนับเวลา EXP
// ─────────────────────────────────────────────────────────────────────────────
export async function handleReturnInstrument(instrumentId, instrumentName, button) {
    const cu = getCurrentUser();
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
            // นับจำนวนเครื่องที่ "ยืมซ้อมอยู่" (ก่อนคืน)
            const practiceCountBefore = (state.myBorrowedItems || []).filter(l => !l.is_take_home && l.borrow_type !== 'take_home').length;

            const { data, error } = await borrowExt.returnInstrument(Number(instrumentId), cu.id);
            if (error) throw error;
            
            // อัปเดตรายการที่กำลังยืมล่าสุด
            await loadAndRenderMyBorrowedItems(cu.id);
            
            // นับจำนวนเครื่องที่ "ยืมซ้อมอยู่" (หลังคืน)
            const practiceCountAfter = (state.myBorrowedItems || []).filter(l => !l.is_take_home && l.borrow_type !== 'take_home').length;

            // 🟢 กฎข้อที่ 3: ถ้าจำนวนก่อนหน้า > 0 และหลังคืนเหลือ 0 แปลว่า "คืนชิ้นสุดท้าย" ให้โชว์สรุปเวลา
            if (practiceCountBefore > 0 && practiceCountAfter === 0) {
                const mins = data?.practice_minutes || 0;
                const exp = data?.earned_xp || 0;
                
                if (mins > 0) {
                    await Swal.fire({
                        title: 'สิ้นสุดการซ้อม! 🎉',
                        html: `คุณคืนเครื่องดนตรีครบแล้ว<br>ตั้งใจเรียนรู้ไป <strong>${mins} นาที</strong><br>ได้รับ EXP: <strong style="color:var(--pico-primary);">+${exp}</strong>`,
                        icon: 'success'
                    });
                } else {
                    await Swal.fire('สำเร็จ!', data?.message || 'คืนเครื่องดนตรีเรียบร้อยแล้ว', 'success');
                }
            } else {
                await Swal.fire('สำเร็จ!', data?.message || 'คืนเครื่องดนตรีเรียบร้อยแล้ว', 'success');
            }
            
            // แจกเหรียญตรา (ถ้ามี)
            if (data?.log_id) {
                const { data: newBadges } = await badgesExt.checkAndAward(cu.id, data.log_id);
                if (newBadges && newBadges.length > 0) {
                    for (const badge of newBadges) {
                        Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'ได้รับเหรียญตราใหม่!', html: `<b>${escapeHtml(badge.badge_name)}</b>`, showConfirmButton: false, timer: 4000 });
                    }
                    if (typeof renderMyBadges === 'function') renderMyBadges(cu.id);
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
            inputPlaceholder: 'เช่น สายขาด, นวมรั่ว...', 
            showCancelButton: true,
            confirmButtonText: 'ยืนยันการแจ้งซ่อม', 
            inputValidator: (value) => !value && 'กรุณาอธิบายปัญหา!'
        });
        
        if (problemDescription) {
            if(button && button.setAttribute) button.setAttribute('aria-busy', 'true');
            Swal.fire({ title: 'กำลังบันทึกข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            
            try {
                const practiceCountBefore = (state.myBorrowedItems || []).filter(l => !l.is_take_home && l.borrow_type !== 'take_home').length;
                
                const { data, error } = await borrowExt.returnInstrument(Number(instrumentId), cu.id, problemDescription);
                if (error) throw error;
                
                await loadAndRenderMyBorrowedItems(cu.id);
                const practiceCountAfter = (state.myBorrowedItems || []).filter(l => !l.is_take_home && l.borrow_type !== 'take_home').length;

                if (practiceCountBefore > 0 && practiceCountAfter === 0) {
                    const mins = data?.practice_minutes || 0;
                    const exp = data?.earned_xp || 0;
                    if (mins > 0) {
                        await Swal.fire({
                            title: 'สิ้นสุดการซ้อมและแจ้งซ่อมเรียบร้อย! 🎉',
                            html: `คุณคืนเครื่องดนตรีครบแล้ว<br>ตั้งใจเรียนรู้ไป <strong>${mins} นาที</strong><br>ได้รับ EXP: <strong style="color:var(--pico-primary);">+${exp}</strong><br><br><small style="color:var(--pico-del-color);">ระบบได้รับเรื่องแจ้งซ่อมแล้ว</small>`,
                            icon: 'success'
                        });
                    } else {
                        await Swal.fire('ขอบคุณสำหรับข้อมูล!', data?.message || 'บันทึกการแจ้งซ่อมเรียบร้อยแล้ว', 'success');
                    }
                } else {
                    await Swal.fire('ขอบคุณสำหรับข้อมูล!', data?.message || 'บันทึกการแจ้งซ่อมเรียบร้อยแล้ว', 'success');
                }
                
                if (data?.log_id) {
                    const { data: newBadges } = await badgesExt.checkAndAward(cu.id, data.log_id);
                    if (newBadges && newBadges.length > 0) {
                        for (const badge of newBadges) {
                            Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'ได้รับเหรียญตราใหม่!', html: `<b>${escapeHtml(badge.badge_name)}</b>`, showConfirmButton: false, timer: 4000 });
                        }
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

function stopTimer() {
    if (!state.timer.running && state.timer.intervalId === null) return;

    clearInterval(state.timer.intervalId);
    state.timer.intervalId = null;
    state.timer.running    = false;

    const elapsed = state.timer.seconds;
    if (elapsed > 0) awardXP(10);

    const btnStart = document.getElementById('sd-btn-start');
    const btnStop  = document.getElementById('sd-btn-stop');
    if (btnStart) { btnStart.disabled = false; btnStart.style.opacity = '1'; }
    if (btnStop)  { btnStop.disabled  = true; btnStop.style.opacity = '0.5'; }

    const status = document.getElementById('sd-timer-status');
    if (status) status.textContent = 'หยุดแล้ว';

    const summary  = document.getElementById('sd-summary');
    const durEl    = document.getElementById('sd-summary-duration');
    if (summary && durEl) {
        durEl.textContent = elapsed > 0 ? formatTime(elapsed) : '—';
        summary.classList.remove('hidden');
    }

    state.timer.seconds = 0;
    const display = document.getElementById('sd-timer-display');
    if (display) display.textContent = '00:00';
}

function wireTimerButtons() {
    document.getElementById('sd-btn-start')?.addEventListener('click', startTimer);
    document.getElementById('sd-btn-stop') ?.addEventListener('click', stopTimer);
}

function awardXP(amount = 10) {
    state.xp    += amount;
    state.level  = Math.floor(state.xp / 100);
    refreshXPBar();
}

function refreshXPBar() {
    const xpInLevel = state.xp % 100;
    const levelEl = document.getElementById('sd-xp-level');
    const fillEl  = document.getElementById('sd-xp-fill');
    const textEl  = document.getElementById('sd-xp-text');

    if (levelEl) levelEl.textContent = `Level ${state.level}`;
    if (fillEl)  fillEl.style.width  = `${xpInLevel}%`;
    if (textEl)  textEl.textContent  = `${state.xp} XP · ${xpInLevel}/100 สู่ Level ${state.level + 1}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles  (Mobile-First UI, Theme Aware)
// ─────────────────────────────────────────────────────────────────────────────
function injectStyles() {
    if (document.getElementById('sd-styles')) return;
    const style = document.createElement('style');
    style.id = 'sd-styles';
    style.textContent = `
/* ── Mobile-First App Container ── */
body { margin: 0; padding: 0; background-color: var(--main-bg, var(--pico-background-color)); }
#sd-app-container {
    position: relative; width: 100%; max-width: 600px; margin: 0 auto;
    min-height: 100vh; background-color: var(--main-bg, var(--pico-background-color));
    display: flex; flex-direction: column; overflow-x: hidden;
}
#sd-content {
    flex: 1; padding: 1.5rem 1.25rem 0 1.25rem; box-sizing: border-box; 
    max-width: 100%; overflow-x: hidden;
}
.sd-bottom-spacer { height: 2rem; width: 100%; } /* ข้อ 2: ปรับลดความสูงจาก 90px เหลือ 2rem เพื่อให้ยืดหยุ่นและเหลือที่ว่างแค่พอสวยงาม */

/* ── Typography ── */
.sd-page-header { margin-bottom: 2rem; width: 100%; word-wrap: break-word; }
.sd-page-title { font-size: 1.6rem; font-weight: 800; margin: 0 0 0.25rem 0; line-height: 1.2; color: var(--pico-color); }
.sd-page-subtitle { font-size: 0.9rem; color: var(--pico-muted-color); margin: 0; }
.sd-section-title { font-size: 1.1rem; font-weight: 700; margin: 0 0 1rem 0; color: var(--pico-color); }

/* ── Top Navigation ── */
.sd-tabs {
    display: flex;
    gap: 0.15rem; /* ข้อ 3: ลดความห่างของแต่ละปุ่มเมนูลงจาก 0.25rem เป็น 0.15rem */
    padding: 0 0rem 0; /* ✨ ปรับ padding ด้านบนเป็น 0 เพื่อให้แนบชิดขอบจอ */
    background: var(--pico-card-background-color);
    border-bottom: 1px solid var(--pico-muted-border-color);
    overflow-x: auto;
    scrollbar-width: none;
    position: sticky;
    top: 0;
    z-index: 1000;
}
.sd-tabs::-webkit-scrollbar { display: none; }
.sd-tab {
    padding: 0.5rem 0.5rem; /* ข้อ 3: ลด padding เพื่อให้ปุ่มกระชับขึ้นและไม่กินพื้นที่ */
    border-radius: 8px 0px 0 0;
    border: none;
    background: transparent;
    color: var(--pico-muted-color);
    font-size: 0.88rem;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: color 0.15s, background 0.15s;
    display: flex;
    align-items: left;
    gap: 0.4rem;
    font-family: inherit;
    margin-bottom: -1px;
}
.sd-tab:hover {
    color: var(--pico-color);
    background: var(--pico-form-element-background-color);
}
.sd-tab.active {
    color: var(--pico-primary);
    background: var(--pico-background-color);
    border-bottom: 2px solid var(--pico-primary);
}

/* ── Buttons (Colors & Contrast) ── */
.sd-btn-primary, .sd-btn-outline, .sd-btn-danger, .sd-app-btn {
    font-family: inherit; font-weight: 700; border-radius: 12px; cursor: pointer;
    transition: transform 0.1s, opacity 0.2s; border: none; display: inline-flex;
    align-items: center; justify-content: center; text-decoration: none; text-align: center;
    box-sizing: border-box;
}
/* ปุ่มสีน้ำเงินหลัก ยืม/เริ่มซ้อม */
.sd-btn-primary { background-color: #2563eb !important; color: #ffffff !important; padding: 0.75rem 1.5rem; box-shadow: 0 4px 10px rgba(37,99,235,0.2); }
/* ปุ่มเส้นขอบ */
.sd-btn-outline { background-color: transparent !important; color: #2563eb !important; border: 2px solid #2563eb !important; padding: 0.6rem 1.2rem; }
/* ปุ่มสีแดง หยุดซ้อม/แจ้งซ่อม/ออกจากระบบ */
.sd-btn-danger { background-color: #ef4444 !important; color: #ffffff !important; padding: 0.75rem 1.5rem; box-shadow: 0 4px 10px rgba(239,68,68,0.2); }
/* ปุ่มแอปพลิเคชัน (เกม) */
.sd-app-btn {
    background: var(--pico-card-background-color); border: 2px solid var(--pico-muted-border-color);
    padding: 1.5rem 1rem; flex-direction: column; gap: 0.5rem; color: var(--pico-color);
    width: 100%; height: auto;
}
.sd-app-btn .icon { font-size: 2.5rem; line-height: 1; }
.sd-btn-primary:active, .sd-btn-outline:active, .sd-btn-danger:active, .sd-app-btn:active { transform: scale(0.96); }

/* ปุ่มหน้าจูนเนอร์/เมโทรนอม เฉพาะเจาะจงให้เห็นชัด */
#toggle-tuner-btn { background-color: #10b981 !important; color: #ffffff !important; border: none !important; font-size: 1.1rem; padding: 1rem; }
#toggle-tuner-btn.sd-btn-danger { background-color: #ef4444 !important; }
#metronome-start-stop-btn { background-color: #2563eb !important; color: white !important; font-size: 1.1rem; padding: 1rem; }
#tap-tempo-btn { border: 2px solid #6b7280 !important; color: var(--pico-color) !important; font-size: 1.1rem; padding: 1rem; }


/* ── Status Badges (สำหรับหน้ารายการยืม) ── */
.sd-tag { padding: 4px 10px; border-radius: 99px; font-size: 0.75rem; font-weight: bold; border: 1px solid transparent; }
.sd-tag-pending { background: var(--pico-form-element-background-color); color: var(--pico-mark-color, #d97706); border-color: var(--pico-mark-color, #d97706); }
.sd-tag-approved { background: var(--pico-form-element-background-color); color: var(--pico-ins-color, #059669); border-color: var(--pico-ins-color, #059669); }
.sd-tag-rejected { background: var(--pico-form-element-background-color); color: var(--pico-del-color, #dc2626); border-color: var(--pico-del-color, #dc2626); }
.sd-tag-normal { background: var(--pico-form-element-background-color); color: var(--pico-primary); border-color: var(--pico-primary); }

@media (max-width: 480px) {
    .sd-grid-4 { grid-template-columns: repeat(2, 1fr); gap: 0.5rem; }
    .sd-grid-2 { grid-template-columns: 1fr; gap: 0.5rem; } 
    .sd-page-title { font-size: 1.4rem; }
    .sd-action-icon { width: 45px !important; height: 45px !important; font-size: 1.2rem !important; }
    .sd-app-btn { padding: 1rem 0.5rem; }
}

/* ── Lists ── */
.sd-list-container {
    background: var(--pico-card-background-color); border: 1px solid var(--pico-muted-border-color);
    border-radius: 16px; overflow: hidden; box-shadow: var(--pico-box-shadow);
    width: 100%; max-width: 100%;
}
.sd-list-item {
    display: flex; align-items: center; padding: 1rem; border-bottom: 1px solid var(--pico-muted-border-color); 
    gap: 0.75rem; transition: background 0.2s; width: 100%; box-sizing: border-box;
}
.sd-list-item:last-child { border-bottom: none; }
.sd-list-icon {
    width: 40px; height: 40px; border-radius: 12px; background: var(--pico-muted-background-color); display: flex;
    align-items: center; justify-content: center; flex-shrink: 0; font-size: 1.2rem; font-weight: bold;
}
.sd-list-content { display: flex; flex-direction: column; flex: 1; min-width: 0; overflow: hidden; }
.sd-list-title { font-size: 0.95rem; font-weight: 600; color: var(--pico-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sd-list-subtitle, .sd-list-desc { font-size: 0.8rem; color: var(--pico-muted-color); margin-top: 0.2rem; }
.sd-list-action { flex-shrink: 0; font-size: 0.9rem; }

/* ── Hero Section ── */
.sd-hero {
    display: flex; align-items: center; justify-content: space-between;
    background: var(--primary-blue, linear-gradient(135deg, var(--pico-primary-hover) 0%, var(--pico-primary) 100%)); 
    border-radius: 20px; padding: 2rem 1.5rem; margin-bottom: 1.5rem;
    color: #fff; position: relative; overflow: hidden; box-shadow: 0 10px 25px rgba(37, 99, 235, 0.2);
}
.sd-hero-sub { font-size: 0.9rem; opacity: 0.9; margin: 0 0 0.5rem; font-weight: 500; color: #fff; }
.sd-hero-title { font-size: 1.4rem; font-weight: 800; margin: 0 0 1.2rem; line-height: 1.3; color: #fff; text-wrap: balance; }
.sd-hero-emoji { font-size: 7rem; position: absolute; right: -15px; bottom: -20px; opacity: 0.15; transform: rotate(-15deg); pointer-events: none; }
.sd-hero .sd-btn-primary { background: #fff !important; color: var(--pico-primary) !important; border-radius: 99px; padding: 0.6rem 1.2rem; font-size: 0.9rem; }

/* ── Cards & Stats ── */
.sd-stat-card {
    background: var(--pico-card-background-color); border: 1px solid var(--pico-muted-border-color);
    border-radius: 16px; padding: 1.5rem 1rem; display: flex; flex-direction: column; align-items: center;
    justify-content: center; text-align: center; box-shadow: var(--pico-box-shadow); width: 100%; box-sizing: border-box;
}
.sd-stat-value { font-size: 2rem; font-weight: 800; line-height: 1; margin-bottom: 0.25rem; color: var(--pico-color); }
.sd-stat-label { font-size: 0.75rem; font-weight: 600; color: var(--pico-muted-color); }

/* Forms & Filters */
.sd-filter-group { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1rem; width: 100%; }
.sd-select-minimal {
    padding: 0.5rem 1rem; border-radius: 99px; border: 1px solid var(--pico-muted-border-color);
    background: var(--pico-card-background-color); font-size: 0.85rem; font-family: inherit; color: var(--pico-color); flex: 1; min-width: 120px;
}
.sd-badge-container { display: flex; flex-wrap: wrap; gap: 0.5rem; padding: 1rem; }

/* ── Animations ── */
@keyframes sd-fade-slide {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0); }
}
#sd-content.sd-fade { animation: sd-fade-slide 0.2s cubic-bezier(0.4, 0, 0.2, 1) both; }
`;
    document.head.appendChild(style);
}

// ─────────────────────────────────────────────────────────────────────────────
// Shell HTML (Modern Mobile-First Wrapper)
// ─────────────────────────────────────────────────────────────────────────────
function buildShell() {
    const tabs = [
        { id: 'home', icon: '🏠', label: 'ภาพรวม' },
        { id: 'instruments', icon: '🎺', label: 'ยืม/คืน' },
        { id: 'borrows', icon: '📜', label: 'ประวัติ' },
        { id: 'practice', icon: '🎛️', label: 'เครื่องมือซ้อม' },
        { id: 'favorites', icon: '📚', label: 'เรียนรู้' },
        { id: 'bosses', icon: '🐉', label: 'ล่าบอส' },
        { id: 'games', icon: '🎮', label: 'มินิเกม' },
        { id: 'profile', icon: '👤', label: 'โปรไฟล์' }
    ];
    
    const navHtml = tabs.map(t => `
        <button class="sd-tab" data-view="${t.id}">
            ${t.icon} ${t.label}
        </button>
    `).join('');

    return `
        <div id="sd-app-container">
            <nav class="sd-tabs" id="sd-top-nav">
                ${navHtml}
            </nav>
            <main id="sd-content"></main>
        </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Router & Init
// ─────────────────────────────────────────────────────────────────────────────
export async function setView(viewName, user = getCurrentUser()) {
    if (!VIEWS[viewName]) return;
    // ✨ ระบบสุ่มสีพาสเทลสำหรับธีม Rainbow
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    if (currentTheme === 'rainbow') {
        // สุ่ม Hue (0-360), Saturation (70% สำหรับพาสเทล), Lightness (85% เพื่อให้สีจาง)
        const h = Math.floor(Math.random() * 360);
        const pastelBg = `hsl(${h}, 70%, 85%)`;
        document.documentElement.style.setProperty('--sd-accent-bg', pastelBg);
    } else {
        // ล้างค่าที่สุ่มไว้เพื่อใช้ค่าจาก CSS ปกติ
        document.documentElement.style.removeProperty('--sd-accent-bg');
    }
    
    state.activeView = viewName;

    state.mountEl?.querySelectorAll('.sd-tab').forEach(btn => {
        if (btn.dataset.view === viewName) {
            btn.classList.add('active');
            btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        } else {
            btn.classList.remove('active');
        }
    });

    const content = state.mountEl?.querySelector('#sd-content');
    if (content) {
        if (state.activeView !== viewName && viewName !== 'practice') stopTimer();
        
        // 1. ดึง HTML เดิมของหน้านั้นๆ (ไม่มีการเอาอะไรไปทับหรือแทรกมั่วๆ อีกแล้ว)
        let viewHtml = VIEWS[viewName].render(user);

        // 2. ส่ง HTML ไปแสดงผลหน้าจอแบบคลีนๆ
        content.innerHTML = viewHtml;
        
        content.classList.remove('sd-fade');
        requestAnimationFrame(() => content.classList.add('sd-fade'));

        content.querySelectorAll('[data-view]').forEach(el => {
            el.addEventListener('click', e => {
                e.preventDefault();
                setView(el.dataset.view, user);
            });
        });

        if (VIEWS[viewName].afterRender) await VIEWS[viewName].afterRender(user);
    }

    // ✨ ระบบตรวจสอบ Level Up อัตโนมัติ (จะตรวจสอบทุกครั้งที่โหลดหน้า Dashboard)
    if (viewName === 'home') {
        checkAndTriggerLevelUp();
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// ✨ GAMIFICATION: ระบบตรวจสอบเลเวลอัปอัตโนมัติ
// ─────────────────────────────────────────────────────────────────────────────
async function checkAndTriggerLevelUp() {
    const user = getCurrentUser();
    if (!user) return;
    
    // รอให้ DOM วาดเสร็จเล็กน้อยเพื่อให้อ่านค่า Lv. ปัจจุบันได้
    setTimeout(() => {
        const levelText = document.getElementById('sum-level')?.innerText || '';
        const currentLevel = parseInt(levelText.replace('Lv.', '')) || state.level || 1;
        
        const storageKey = `last_seen_level_${user.id}`;
        const lastSeenLevel = parseInt(localStorage.getItem(storageKey)) || currentLevel;

        // ถ้าเลเวลปัจจุบันมากกว่าที่เคยบันทึกไว้ และ >= 2 ให้เด้ง Popup อัตโนมัติ
        if (currentLevel > lastSeenLevel && currentLevel >= 2) {
            localStorage.setItem(storageKey, currentLevel);
            showGamificationCard(true); // true = โหมดฉลอง Level Up Auto
        } else if (currentLevel > lastSeenLevel) {
            // อัปเดตเงียบๆ กรณีเพิ่งเริ่มเล่นจาก Lv.0 -> Lv.1
            localStorage.setItem(storageKey, currentLevel);
        } else if (!localStorage.getItem(storageKey)) {
            // เซ็ตค่าเริ่มต้นถ้ายังไม่เคยมี
            localStorage.setItem(storageKey, currentLevel);
        }
    }, 500);
}

// =============================================================================
// ✨ GAMIFICATION: ระบบแสดงการ์ดประจำตัวแบบ Popup พร้อมดึงข้อมูลจริง (Full Stats)
// =============================================================================
export const showGamificationCard = async (isAutoLevelUp = false) => {
    const user = getCurrentUser();
    if (!user) return;

    const levelText = document.getElementById('sum-level')?.innerText || 'Lv.1';
    const currentLevel = parseInt(levelText.replace('Lv.', '')) || state.level || 1;

    if (currentLevel < 2 && !isAutoLevelUp) {
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                title: 'ยังไม่ปลดล็อก 🔒',
                text: 'บัตรประจำตัวนักดนตรีสุดเท่ จะปลดล็อกเมื่อคุณซ้อมจนถึง Level 2 ขึ้นไป! สู้ๆ นะ!',
                icon: 'info', confirmButtonText: 'รับทราบ', timer: 3000
            });
        }
        return;
    }

    if (typeof Swal !== 'undefined') {
        Swal.fire({ title: 'กำลังดึงข้อมูล Status...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    }

    try {
        const [
            { data: profile },
            { data: totalBorrows }, 
            { count: badgeCount },
            { data: gameSessions },
            { data: allUsers }
        ] = await statsApi.getGamificationStats(user.id);

        let totalPracticeMinutes = 0;
        let borrowCount = 0;
        let activeBorrows = 0;
        
        if (totalBorrows) {
            borrowCount = totalBorrows.length;
            totalBorrows.forEach(b => {
                if (b.practice_minutes) totalPracticeMinutes += Number(b.practice_minutes);
                if (!b.return_timestamp) activeBorrows++;
            });
        }
        
        if (gameSessions) { 
            gameSessions.forEach(g => {
                if (g.duration_minutes) totalPracticeMinutes += Number(g.duration_minutes);
            });
        }
        
        let rhythmScore = 0;
        let staffWarsScore = profile?.staff_wars_highscore || 0;
        if (gameSessions) {
            gameSessions.forEach(session => {
                const sName = session.game_name?.toLowerCase() || '';
                if ((sName.includes('rhythm') || sName === 'rhythmcore') && session.score > rhythmScore) rhythmScore = session.score;
                if ((sName.includes('staff') || sName === 'staffwars') && session.score > staffWarsScore) staffWarsScore = session.score;
            });
        }

        let clubRank = '-';
        let classRank = '-';
        if (allUsers && profile) {
            const clubUsers = allUsers.filter(u => u.student_group === profile.student_group);
            const clubIndex = clubUsers.findIndex(u => u.id === user.id);
            if (clubIndex !== -1) clubRank = `${clubIndex + 1}`;

            const classUsers = allUsers.filter(u => u.class_level === profile.class_level);
            const classIndex = classUsers.findIndex(u => u.id === user.id);
            if (classIndex !== -1) classRank = `${classIndex + 1}`;
        }

        const stats = { 
            level: currentLevel, 
            xp: profile?.xp || state.xp || 0, 
            practiceMins: totalPracticeMinutes,
            borrowCount,
            activeBorrows,
            badgeCount: badgeCount || 0,
            clubRank,
            classRank,
            rhythmScore,
            staffWarsScore,
            hp: profile?.hp ?? 3,       // <--- ✨ เพิ่มบรรทัดนี้
            stars: profile?.stars ?? 0, // <--- ✨ เพิ่มบรรทัดนี้
            avatarUrl: profile?.profile_image_url || user.user_metadata?.avatar_url || 'assets/default-avatar.png', 
            name: profile?.first_name ? `${profile.first_name} ${profile.last_name || ''}`.trim() : user.user_metadata?.full_name || 'ผู้ใช้งาน' 
        };

        const cardHtml = buildPlayerCardHTML(user, stats);

        let hiddenCard = document.getElementById('hidden-capture-card');
        if (!hiddenCard) {
            hiddenCard = document.createElement('div');
            hiddenCard.id = 'hidden-capture-card';
            hiddenCard.style.position = 'absolute';
            hiddenCard.style.opacity = '0';
            hiddenCard.style.zIndex = '-9999';
            hiddenCard.style.pointerEvents = 'none';
            document.body.appendChild(hiddenCard);
        }
        hiddenCard.innerHTML = cardHtml;

        if (typeof Swal !== 'undefined') {
            Swal.fire({
                html: `
                    ${cardHtml}
                    <div style="margin-top: 15px; text-align: center;">
                        <button id="sd-btn-share-player-card" style="
                            background: transparent; border: 1px solid rgba(255,255,255,0.3); color: #fff; 
                            font-size: 0.95rem; cursor: pointer; padding: 8px 20px; border-radius: 8px;
                            transition: background 0.2s; font-family: 'Kanit', sans-serif;
                        " onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='transparent'">
                            📸 แคปเจอร์เพื่อแชร์
                        </button>
                    </div>
                `,
                showConfirmButton: false, 
                showCloseButton: true,
                background: 'transparent',
                backdrop: `rgba(0,0,0,0.85)`,
                padding: '0',
                didOpen: () => {
                    // ผูก Event ฝั่ง Logic แทนการใช้ onclick ใน HTML (No Global Pollution)
                    document.getElementById('sd-btn-share-player-card')?.addEventListener('click', sharePlayerCard);
                }
            });
        }
    } catch (err) {
        console.error('Error fetching stats:', err);
        if (typeof Swal !== 'undefined') Swal.fire('ผิดพลาด', 'ไม่สามารถโหลดข้อมูลนักดนตรีได้', 'error');
    }
};

function handleNavClick(e) {
    const btn = e.target.closest('.sd-tab');
    if (btn?.dataset.view) setView(btn.dataset.view, getCurrentUser());
}

export async function initStudentDashboard(mountEl, user) {
    if (!mountEl || !user) return;
    state.mountEl = mountEl;

    const oldHeader = document.getElementById('user-info-wrapper');
    if (oldHeader) oldHeader.style.display = 'none';

    if (!state.notificationInterval) {
        checkBorrowingStatusAndNotify();
        state.notificationInterval = setInterval(checkBorrowingStatusAndNotify, 60_000);
    }

    injectStyles();
    if (mountEl.parentElement) mountEl.parentElement.style.display = 'block';
    
    mountEl.innerHTML = buildShell();
    const topNav = mountEl.querySelector('#sd-top-nav');
    topNav?.addEventListener('click', handleNavClick);

    await setView('home', user);
    setupRealtime(user);
}

export function destroyStudentDashboard() {
    stopTimer();
    state.timer.seconds = 0;

    if (state.borrowTimerInterval) { clearInterval(state.borrowTimerInterval); state.borrowTimerInterval = null; }
    if (state.notificationInterval) { clearInterval(state.notificationInterval); state.notificationInterval = null; }
    if (state.realtimeChannel) { realtimeApi.unsubscribe(state.realtimeChannel); state.realtimeChannel = null; }
    if (typeof isPlaying !== 'undefined') isPlaying = false; 
    
    const topNav = state.mountEl?.querySelector('#sd-top-nav');
    topNav?.removeEventListener('click', handleNavClick);

    if (state.mountEl) state.mountEl.innerHTML = '';
    state.mountEl = null;
    state.activeView = 'home';
    state.availableInstruments = [];
    state.myBorrowedItems = [];
}

function setupRealtime(user) {
    if (state.realtimeChannel) return;
    let debounce = null;
    const refresh = () => {
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(async () => {
            await loadAndRenderMyBorrowedItems(user.id);
            updateNotificationBadge();
        }, 1_500);
    };

    state.realtimeChannel = realtimeApi.subscribeStudentDashboard(user.id, refresh);
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Logic & Helpers (Data Loading, Lists, Forms)
// ─────────────────────────────────────────────────────────────────────────────

export function createRankingTableHTML(data, footerText = '', selfBelowTop = null) {
    if (!data?.length) return '<p style="text-align:center; padding:2rem; color:var(--pico-muted-color);">ยังไม่มีข้อมูลเวลาซ้อม</p>';

    const renderRow = (row) => {
        const isCurrent = row.is_current_user;
        let rankMedal = `#${row.rank}`;
        if (row.rank === 1) rankMedal = '🥇';
        else if (row.rank === 2) rankMedal = '🥈';
        else if (row.rank === 3) rankMedal = '🥉';

        return `
        <div class="sd-list-item ${isCurrent ? 'sd-highlight' : ''}">
            <div class="sd-list-icon" style="background:transparent; font-size:1.2rem; font-weight:bold; width: 30px;">
                ${rankMedal}
            </div>
            <div class="sd-list-content">
                <div class="sd-list-title">${escapeHtml(row.full_name)} ${isCurrent ? '(คุณ)' : ''}</div>
            </div>
            <div class="sd-list-action" style="font-weight: bold; color: var(--pico-primary-background);">
                ${formatMinutesToHoursMinutes(row.total_minutes)}
            </div>
        </div>`;
    };

    const rows = data.map(renderRow).join('');

    // ⭐ ถ้า user อยู่นอก top → เพิ่ม separator + row ของตัวเอง
    let selfBlock = '';
    if (selfBelowTop) {
        selfBlock = `
            <div style="text-align:center; padding: 0.5rem 0; color: var(--pico-muted-color); font-size: 0.85rem; letter-spacing: 0.5em;">
                ...
            </div>
            <div style="background: linear-gradient(135deg, rgba(59,130,246,0.08), rgba(59,130,246,0.02)); border-radius: 0.75rem; padding: 0.25rem; border: 1.5px solid rgba(59,130,246,0.3);">
                ${renderRow(selfBelowTop)}
            </div>
        `;
    }

    const footer = footerText ? `<div style="text-align:center; font-size:0.8rem; color:var(--pico-muted-color); margin-top:1rem;">${footerText}</div>` : '';
    return `<div class="sd-list-container">${rows}${selfBlock}</div>${footer}`;
}

export function createLeaderboardHtml(gameTitle, data) {
    if (!data) return `<p style="text-align:center; color:var(--pico-muted-color);">${gameTitle}: ไม่สามารถโหลดข้อมูลได้</p>`;
    const groupLabel = { student:'นักเรียน', club:'ชุมนุม', teacher:'ครู', guest:'ทั่วไป' };
    
    const rows = (data.top_10 || []).map(r => {
        const sub = [r.nickname, r.class_level, groupLabel[r.student_group]].filter(Boolean).join(' • ');
        let rankMedal = `#${r.rank}`;
        if (r.rank === 1) rankMedal = '🥇';
        else if (r.rank === 2) rankMedal = '🥈';
        else if (r.rank === 3) rankMedal = '🥉';

        return `
        <div class="sd-list-item">
            <div class="sd-list-icon" style="background:transparent; font-size:1.2rem; font-weight:bold; width: 30px;">
                ${rankMedal}
            </div>
            <div class="sd-list-content">
                <div class="sd-list-title">${escapeHtml(r.full_name)}</div>
                <div class="sd-list-subtitle">${escapeHtml(sub)}</div>
            </div>
            <div class="sd-list-action" style="font-weight: bold; color: #f59e0b;">
                ${r.highscore.toLocaleString()} pts
            </div>
        </div>`;
    }).join('');

    return `
        <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:1rem;">
            <h5 style="margin:0;">${gameTitle}</h5>
            <small style="color:var(--pico-muted-color);">คะแนนคุณ: <strong>${(data.user_highscore||0).toLocaleString()}</strong></small>
        </div>
        <div class="sd-list-container">
            ${rows || '<p style="text-align:center; padding:1rem;">ยังไม่มีข้อมูลอันดับ</p>'}
        </div>`;
}

export async function renderBorrowForm(user) {
    const container = document.getElementById('borrow-form-container');
    if (!container) return;
    container.setAttribute('aria-busy', 'true');

    try {
        const { data, error } = await instrumentsExt.getAvailable();
        if (error) throw error;
        
        // 🟢 FIX: นำ state. กลับมาให้ถูกต้องตามโครงสร้างของไฟล์ student-dashboard.js
        state.availableInstruments = data || []; 

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

        // 🟢 FIX: ใช้ state.availableInstruments
        const types = [...new Set(state.availableInstruments.map(i => i.type).filter(Boolean))];
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
        // 🟢 FIX: ใช้ state.availableInstruments
        if (favData?.length > 0 && state.availableInstruments.some(i => i.id === favData[0].instrument_id)) {
            typeFilter.value = favData[0].instrument_type;
            _populateInstrumentSelect();
            container.querySelector('#instrument-select').value = favData[0].instrument_id;
            _checkBorrowButtonState();
        } else { _populateInstrumentSelect(); }

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
                            // 🛠️ FIX ISSUE 1: เปลี่ยนสถานะเป็น 'ส่งซ่อม' (Pending Inspection) แทน 'ชำรุด' ทันที
                            // และดึงสภาพเครื่องปัจจุบันมาใช้งานเพื่อคงสภาพไว้จนกว่าครูจะประเมิน
                            const currentInst = state.availableInstruments.find(i => i.id === Number(instrumentId));
                            const currentCondition = currentInst ? currentInst.condition : 'ดี';
                            
                            await instrumentsExt.updateStatus(instrumentId, 'ส่งซ่อม', currentCondition);
                            
                            await Swal.fire('สำเร็จ!', 'แจ้งซ่อมเครื่องดนตรีเรียบร้อย (รอตรวจสอบ)', 'success');
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
                        
                        // 🟢 FIX: นำการจับตัวแปร Response ที่รัดกุมมารวมกับการส่ง borrowType กลับเข้าไป
                        const { data: borrowResult, error } = await borrowExt.borrowInstrumentAtomic(
                            Number(instrumentId),
                            cu.id,
                            isTakeHome,
                            dueDate || null,
                            parentAck,
                            borrowType
                        );

                        if (error) throw error;
                        
                        await Swal.fire('สำเร็จ!', borrowResult?.message || 'ทำรายการยืมเรียบร้อย ระบบเริ่มประมวลผลเวลา', 'success');
                        
                        renderBorrowForm(user);
                        if (typeof loadAndRenderMyBorrowedItems === 'function') loadAndRenderMyBorrowedItems(cu.id);
                        if (typeof filterMyHistory === 'function') filterMyHistory();
                    }
                } catch (err) {
                    console.error('[Borrow Error]:', err);
                    Swal.fire('เกิดข้อผิดพลาด', err.message || 'ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่อีกครั้ง', 'error');
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

function _populateInstrumentSelect() {
    const container       = document.getElementById('borrow-form-container');
    const typeFilter      = container?.querySelector('#type-filter');
    const instrumentSelect = container?.querySelector('#instrument-select');
    const agreementSwitch = container?.querySelector('#agreement-switch');
    
    if (!container || !typeFilter || !instrumentSelect || !agreementSwitch) return;

    const selectedType = typeFilter.value;
    
    // 🟢 FIX: นำ state. กลับมาใช้งานให้ถูกต้องตาม Scope
    const filtered = selectedType === 'all' 
        ? state.availableInstruments 
        : state.availableInstruments.filter(i => i.type === selectedType);

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

export async function processQrScan(instrumentId) {
    const cu = getCurrentUser();
    if (!cu) {
        sessionStorage.setItem('pendingScanId', instrumentId);
        return Swal.fire('กรุณาล็อกอิน', 'คุณต้องเข้าสู่ระบบก่อนทำรายการผ่าน QR Code', 'info');
    }
    if (cu.role === 'admin') {
        return Swal.fire('แอดมิน', `สแกน QR Code ของเครื่องดนตรี ID: ${instrumentId}`, 'info');
    }

    Swal.fire({ title: 'กำลังตรวจสอบข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
        const { data: scanResult, error: fetchError } = await instrumentsExt.getScanDetails(Number(instrumentId));
        if (fetchError) throw fetchError;
        if (!scanResult) throw new Error(`ไม่พบเครื่องดนตรี ID: ${instrumentId} ในระบบ`);
        
        const { instrument_name, status, is_borrowed_by_current_user } = scanResult;

        if (status === 'พร้อมใช้งาน') {
            if (cu.is_blocked) return Swal.fire('บัญชีถูกระงับ', `คุณถูกระงับการใช้งานเนื่องจาก: ${cu.block_reason || 'ไม่ระบุ'}`, 'error');
            
            const { isConfirmed } = await Swal.fire({
                title: '🎶 ข้อตกลงการยืม 🎶',
                html: `คุณกำลังจะยืม: <strong>${escapeHtml(instrument_name)}</strong><br><br>
                    <div style="text-align:left; font-size:0.9rem; margin-top:1rem; padding:1rem; background:var(--pico-form-element-background-color); border-radius:12px;">
                        🛑 1. ห้ามยืมแทนกัน 👤<br>
                        📅 2. คืนให้ตรงเวลา ⏰<br>
                        💸 3. ของเสียหายต้องรับผิดชอบ 🔧<br>
                        🔍 4. เช็กสภาพก่อนและหลัง 💼<br>
                        🧼 5. ทำความสะอาดก่อนคืน ✨
                    </div>`,
                icon: 'info', showCancelButton: true,
                confirmButtonText: 'ยอมรับ และ ยืนยันการยืม', cancelButtonText: 'ยกเลิก',
                confirmButtonColor: 'var(--pico-primary)',
            });
            
            if (isConfirmed) {
                Swal.fire({ title: 'กำลังบันทึกรายการ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
                
                // 🟢 FIX: Destructure ให้ถูกต้อง และส่ง borrowType = 'in_school' เพื่อให้เวลานับอัตโนมัติ
                const { data: borrowResult, error } = await borrowExt.borrowInstrumentAtomic(
                    Number(instrumentId),
                    cu.id,
                    false,
                    null,
                    false,
                    'in_school'
                );
                
                if (error) throw error;
                await Swal.fire('สำเร็จ!', borrowResult?.message || 'ทำรายการยืมเรียบร้อย', 'success');
                if (typeof refreshOnReturn === 'function') await refreshOnReturn();
            }
        } else if (status === 'ถูกยืมอยู่' && is_borrowed_by_current_user) {
            if (typeof handleReturnInstrument === 'function') {
                handleReturnInstrument(instrumentId, instrument_name, document.body);
            }
        } else {
            Swal.fire('ไม่พร้อมใช้งาน', `"${escapeHtml(instrument_name)}" อยู่ในสถานะ "${escapeHtml(status)}"`, 'warning');
        }
    } catch (err) {
        console.error('[QR Scan Error]:', err);
        Swal.fire('เกิดข้อผิดพลาด!', err.message || 'ไม่สามารถทำรายการได้ในขณะนี้', 'error'); 
    }
}

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

async function _checkAndShowNewBadges(userId, logId) {
    const { data: newBadges } = await badgesExt.checkAndAward(userId, logId);
    if (newBadges?.length > 0) {
        for (const b of newBadges) {
            Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'ได้รับเหรียญตราใหม่!', html: `<b>${escapeHtml(b.badge_name)}</b>`, showConfirmButton: false, timer: 4000 });
        }
        renderMyBadges(userId);
    }
}

export async function refreshOnReturn() {
    const cu = getCurrentUser();
    if (!cu) return;
    try {
        await loadAndRenderMyBorrowedItems(cu.id);
        
        // --- ระบบนับเวลาอัตโนมัติเฉพาะยืมในโรงเรียน ---
        const activeInSchoolItems = state.myBorrowedItems.filter(item => 
            (item.borrow_type === 'in_school') && item.return_timestamp === null
        );

        // ถ้าคืนเครื่องสุดท้ายของประเภท 'in_school' แล้ว แต่เวลายังเดินอยู่ -> ให้หยุด
        if (activeInSchoolItems.length === 0 && state.timer.running) {
            stopTimer(); 
            Swal.fire({
                title: 'คืนเครื่องซ้อมแล้ว',
                text: 'หยุดบันทึกเวลาซ้อมให้อัตโนมัติ',
                icon: 'info', toast: true, position: 'bottom-end', showConfirmButton: false, timer: 3000
            });
        }
    } catch (_) { }
}

export async function renderMyHistory() {
    const listEl = document.getElementById('history-list');
    if (!listEl) return;
    const timeFilter = document.getElementById('history-filter-time');
    const statusFilter = document.getElementById('history-filter-status');
    if (timeFilter) timeFilter.value = 'this_week'; 
    if (statusFilter) statusFilter.value = 'all';
    if (typeof filterMyHistory === 'function') await filterMyHistory();
}

export async function filterMyHistory() {
    const listEl = document.getElementById('history-list');
    if (!listEl) return;
    
    listEl.setAttribute('aria-busy', 'true');
    listEl.innerHTML = '<p style="text-align: center; padding: 2rem; color: var(--pico-muted-color);">กำลังโหลดประวัติ...</p>';
    
    const timeFilter = document.getElementById('history-filter-time');
    const statusFilter = document.getElementById('history-filter-status');
    const selectedTime = timeFilter?.value || 'all';
    const selectedStatus = statusFilter?.value || 'all';
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(today); startOfWeek.setDate(today.getDate() - today.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    
    try {
        const { data: userHistory, error } = await borrowExt.getUserHistory(getCurrentUser().id);
        if (error) throw error;
        if (!userHistory || userHistory.length === 0) {
            listEl.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--pico-muted-color);"><span style="font-size:3rem;">📜</span><p>ไม่พบข้อมูลประวัติ</p></div>`;
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
            } else if (log.due_date && new Date() > new Date(log.due_date)) { currentStatusKey = 'overdue'; }
            return passesTimeFilter && (selectedStatus === 'all' || selectedStatus === currentStatusKey);
        });

        const getDisplayStatus = (log) => {
            if (log.return_timestamp) {
                return log.problem_description ? { text: 'แจ้งซ่อม', color: 'var(--pico-del-color)' } : { text: 'คืนแล้ว', color: '#10b981' };
            }
            if (log.is_take_home) {
                if (log.approval_status === 'pending') return { text: 'รออนุมัติ', color: '#f59e0b' };
                if (log.approval_status === 'rejected') return { text: 'ถูกปฏิเสธ', color: 'var(--pico-del-color)' };
                if (log.due_date && new Date() > new Date(log.due_date)) return { text: 'เลยกำหนด!', color: 'var(--pico-del-color)' };
                return { text: 'ยืมกลับบ้าน', color: 'var(--pico-primary)' };
            }
            if (log.due_date && new Date() > new Date(log.due_date)) return { text: 'เลยกำหนด!', color: 'var(--pico-del-color)' };
            return { text: 'กำลังยืม', color: 'var(--pico-primary)' };
        };

        if (filteredHistory.length === 0) {
            listEl.innerHTML = `<p style="text-align:center;padding:2rem;color:var(--pico-muted-color);">ไม่พบข้อมูลตามเงื่อนไข</p>`;
        } else {
            const html = filteredHistory.map(log => {
                const status = getDisplayStatus(log);
                const instrumentName = log.instrument_name || 'เครื่องดนตรีที่ถูกลบ';
                return `
                <div class="sd-list-item">
                    <div class="sd-list-content">
                        <div class="sd-list-title" style="display:flex; justify-content:space-between; align-items:center;">
                            <span>${escapeHtml(instrumentName)}</span>
                            <span style="font-size:0.75rem; font-weight:bold; color:${status.color}; background:${status.color}15; padding:2px 8px; border-radius:12px;">${status.text}</span>
                        </div>
                        <div class="sd-list-subtitle" style="font-size:0.8rem; margin-top:4px;">
                            ยืม: ${new Date(log.borrow_timestamp).toLocaleString('th-TH',{dateStyle:'short',timeStyle:'short'})} น.
                            ${log.return_timestamp ? `<br>คืน: ${new Date(log.return_timestamp).toLocaleString('th-TH',{dateStyle:'short',timeStyle:'short'})} น.` : ''}
                        </div>
                        ${log.problem_description ? `<div style="font-size:0.8rem; color:var(--pico-del-color); margin-top:4px;">ซ่อม: ${escapeHtml(log.problem_description)}</div>` : ''}
                    </div>
                </div>`;
            }).join('');
            listEl.innerHTML = `<div class="sd-list-container">${html}</div>`;
        }
    } catch (err) {
        listEl.innerHTML = `<p style="color:var(--pico-del-color); text-align: center;">เกิดข้อผิดพลาดในการดึงข้อมูล: ${err.message}</p>`;
    } finally { if (listEl) listEl.removeAttribute('aria-busy'); }
}

export async function renderMyBadges(userId) {
    const listEl = document.getElementById('badge-list');
    if (!listEl) return;
    listEl.setAttribute('aria-busy', 'true');
    try {
        const [defsRes, badgesRes] = await Promise.all([
            badgesExt.getDefinitions(),
            badgesExt.getUserBadges(userId),
        ]);
        if (defsRes.error) throw defsRes.error;
        if (badgesRes.error) throw badgesRes.error;

        const iconMap = defsRes.data.reduce((acc, d) => {
            if (d.badge_name) acc[d.badge_name.trim()] = d.badge_icon;
            return acc;
        }, {});

        if (!badgesRes.data?.length) {
            listEl.innerHTML = '<p style="color:var(--pico-muted-color); text-align:center; padding: 1rem;">ยังไม่มีเหรียญตราที่ได้รับ</p>';
        } else {
            listEl.innerHTML = badgesRes.data.map(b => {
                if (!b.badge_name) return '';
                const icon = iconMap[b.badge_name.trim()] || '🏅';
                return `
                <div style="display:inline-flex; align-items:center; gap:0.5rem; background:var(--pico-form-element-background-color); padding:0.5rem 0.8rem; border-radius:99px; font-size:0.85rem; border:1px solid var(--pico-muted-border-color);" title="${escapeHtml(b.badge_description||'')}">
                    <span style="font-size:1.2rem;">${icon}</span>
                    <span style="font-weight:600; color:var(--pico-color);">${escapeHtml(b.badge_name)}</span>
                </div>`;
            }).join(' ');
        }
    } catch (err) { listEl.innerHTML = `<p style="color:var(--pico-del-color); text-align:center;">โหลดข้อมูลเหรียญตราล้มเหลว</p>`; } 
    finally { listEl.removeAttribute('aria-busy'); }
}

// ═══════════════════════════════════════════════════════════════════════════
// 📺 LEARNING FEED — TikTok-style auto-playing video feed with watch tracker
// ═══════════════════════════════════════════════════════════════════════════
//
// - หน้าโหลดเสร็จ → autoplay video แรก, scroll ลงเพื่อดูคลิปถัดไป
// - 1 viewport = 1 video (scroll-snap)
// - Heartbeat ทุก 60 วินาที → ยิง add_learning_minutes(1) ไปบันทึก server
// - หยุดนับเมื่อ tab ถูกซ่อน หรือผู้ใช้ idle ≥ 5 นาที
// - ปุ่ม "เปิดในแอป" สำหรับคลิปที่ embed ไม่ได้ — ระบบจับเวลาต่อเนื่อง
//   user กลับมาภายใน 30 นาทีแล้ว heartbeat ยังนับเวลา
// ═══════════════════════════════════════════════════════════════════════════

const _lf = {
    feed: [],                  // visible items
    types: [],                 // all instrument types
    activeType: '',            // selected filter
    activeIndex: -1,           // currently visible card index
    isVisible: false,          // page tab visibility
    lastActivityTs: Date.now(),
    heartbeatTimer: null,
    timerEl: null,
    sessionStart: 0,           // ms, this session start
    accumulatedMs: 0,          // for the on-screen pill
    inObserver: null,
    // ── pause / external-app flags ─────────────────────────────────
    pausedVideoIds: new Set(), // YouTube videos that user has paused
    externalMode: false,       // user clicked "เปิดในแอป" — keep heartbeat alive
    externalUntil: 0,          // ms timestamp when external mode auto-expires (30 min cap)
};

function _lfPlatformTag(type) {
    if (type === 'video' || type === 'playlist') return { cls: 'platform-yt', label: 'YouTube' };
    if (type === 'tiktok') return { cls: 'platform-tt', label: 'TikTok' };
    if (type === 'facebook') return { cls: 'platform-fb', label: 'Facebook' };
    return { cls: 'platform-other', label: 'ลิงก์' };
}

function _lfBuildEmbed(url) {
    if (!url) return null;
    try {
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            // enablejsapi=1 lets us listen for play / pause via postMessage
            const ytParams = 'autoplay=1&playsinline=1&rel=0&enablejsapi=1';
            if (url.includes('list=')) {
                const u = new URL(url.replace('m.youtube', 'youtube'));
                const list = u.searchParams.get('list');
                if (list) return `https://www.youtube.com/embed/videoseries?list=${list}&${ytParams}`;
            }
            let id = '';
            if (url.includes('youtu.be/')) id = url.split('youtu.be/')[1].split(/[?&]/)[0];
            else if (url.includes('/shorts/')) id = url.split('/shorts/')[1].split(/[?&]/)[0];
            else {
                const u = new URL(url.replace('m.youtube', 'youtube'));
                id = u.searchParams.get('v') || '';
            }
            if (id) return `https://www.youtube.com/embed/${id}?${ytParams}`;
        }
        if (url.includes('facebook.com') || url.includes('fb.watch')) {
            return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false&autoplay=true`;
        }
        if (url.includes('tiktok.com')) {
            const m = url.match(/(\d{18,20})/);
            if (m?.[1]) return `https://www.tiktok.com/embed/v2/${m[1]}?autoplay=1`;
        }
    } catch (_) {}
    return null;
}

function _lfRenderCard(link, index) {
    const info = parseMediaUrl(link.youtube_url) || { type: 'unknown', originalUrl: link.youtube_url };
    const platform = _lfPlatformTag(info.type);
    const embed = _lfBuildEmbed(link.youtube_url);
    const isPending = link.is_approved === false;

    // Extract YouTube video ID for pause-state tracking
    let ytId = '';
    try {
        const url = link.youtube_url || '';
        if (url.includes('youtu.be/')) ytId = url.split('youtu.be/')[1].split(/[?&]/)[0];
        else if (url.includes('/shorts/')) ytId = url.split('/shorts/')[1].split(/[?&]/)[0];
        else if (url.includes('youtube.com/watch')) {
            const u = new URL(url.replace('m.youtube', 'youtube'));
            ytId = u.searchParams.get('v') || '';
        }
    } catch (_) {}

    const tags = [];
    tags.push(`<span class="lf-tag ${platform.cls}">${platform.label}</span>`);
    if (link.instrument_type) tags.push(`<span class="lf-tag instrument">🎵 ${escapeHtml(link.instrument_type)}</span>`);
    if (isPending) tags.push(`<span class="lf-tag pending">⏳ ยังไม่ตรวจ</span>`);

    const playerHtml = embed
        ? `<iframe data-src="${embed}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`
        : `<div style="color:#fff; padding:2rem; text-align:center;">
              <div style="font-size:3rem; margin-bottom:1rem;">▶️</div>
              <p>คลิปนี้เล่นในแอปไม่ได้</p>
              <p style="font-size:0.85rem; opacity:0.7;">กดปุ่ม "เปิดในแอป" ด้านล่าง — ระบบจะนับเวลาต่อจนกว่าคุณจะกลับมา</p>
           </div>`;

    const noEmbed = embed ? '' : 'data-no-embed="1"';

    return `
        <article class="lf-card" data-index="${index}" data-link-id="${link.id ?? ''}" data-instrument-type="${escapeHtml(link.instrument_type || '')}" data-youtube-id="${escapeHtml(ytId)}" ${noEmbed}>
            ${playerHtml}
            <div class="lf-overlay">
                <div class="lf-tag-row">${tags.join('')}</div>
                <h3 class="lf-title">${escapeHtml(link.title || '')}</h3>
                ${link.caption ? `<p class="lf-caption">${escapeHtml(link.caption)}</p>` : ''}
                <a class="lf-open-app" href="${escapeHtml(link.youtube_url)}" target="_blank" rel="noopener noreferrer" onclick="window.__lfMarkExternal && window.__lfMarkExternal()">🚀 เปิดในแอป</a>
            </div>
        </article>
    `;
}

/**
 * Decide whether the timer should be ticking right now.
 * Returns true if we should accumulate seconds / send heartbeats, false otherwise.
 *
 * Rules:
 *  - Tab not visible AND not in external-app mode → pause
 *  - User idle (no scroll/click) > 5 min → pause
 *  - Active card is a YouTube video the user explicitly paused → pause
 *  - Active card has NO embed (must open externally) → never pause for that
 *    reason (we cannot tell whether the user is watching). External-app mode
 *    keeps timer alive even when the tab is hidden, capped at 30 minutes.
 */
function _lfShouldTick() {
    // External app mode auto-expires after 30 min
    if (_lf.externalMode && Date.now() > _lf.externalUntil) {
        _lf.externalMode = false;
    }

    if (!_lf.isVisible && !_lf.externalMode) return false;
    if (Date.now() - _lf.lastActivityTs > 5 * 60 * 1000 && !_lf.externalMode) return false;

    const card = _lfActiveCardEl();
    if (!card) return false;

    // No iframe = external-only clip → always count when card is active
    const ifr = card.querySelector('iframe');
    if (!ifr) return true;

    // Iframe present → respect YouTube paused state
    const videoId = card.dataset.youtubeId;
    if (videoId && _lf.pausedVideoIds.has(videoId)) return false;

    return true;
}

function _lfStartHeartbeat() {
    _lfStopHeartbeat();
    _lf.sessionStart = Date.now();
    _lf.accumulatedMs = 0;
    if (_lf.timerEl) _lf.timerEl.classList.add('show');

    // Update on-screen timer every second
    const tickTimer = setInterval(() => {
        if (!document.getElementById('learning-feed-wrap')) { clearInterval(tickTimer); return; }
        if (!_lfShouldTick()) {
            // visual hint that timer is paused
            if (_lf.timerEl) _lf.timerEl.style.opacity = '0.5';
            return;
        }
        if (_lf.timerEl) _lf.timerEl.style.opacity = '1';
        _lf.accumulatedMs += 1000;
        if (_lf.timerEl) {
            const total = Math.floor(_lf.accumulatedMs / 1000);
            const m = Math.floor(total / 60);
            const s = String(total % 60).padStart(2, '0');
            _lf.timerEl.textContent = `⏱ ${m}:${s}`;
        }
    }, 1000);
    _lf.tickTimer = tickTimer;

    // Server heartbeat every 60 seconds
    _lf.heartbeatTimer = setInterval(async () => {
        if (!_lfShouldTick()) return;
        const card = _lfActiveCardEl();
        const instrument = card?.dataset.instrumentType || _lf.activeType || null;
        const linkId = parseInt(card?.dataset.linkId || '0', 10) || null;
        try {
            const { data, error } = await knowledgeExt.addLearningMinutes(1, instrument || null, linkId);
            if (error) console.warn('[LF] heartbeat error:', error.message);
            else if (data?.exp_awarded) console.log(`[LF] +${data.minutes_added} นาที, +${data.exp_awarded} EXP`);
        } catch (e) {
            console.warn('[LF] heartbeat exception:', e?.message);
        }
    }, 60_000);
}

function _lfStopHeartbeat() {
    if (_lf.heartbeatTimer) { clearInterval(_lf.heartbeatTimer); _lf.heartbeatTimer = null; }
    if (_lf.tickTimer) { clearInterval(_lf.tickTimer); _lf.tickTimer = null; }
}

function _lfActiveCardEl() {
    if (_lf.activeIndex < 0) return null;
    return document.querySelector(`.lf-card[data-index="${_lf.activeIndex}"]`);
}

function _lfActivateCard(card) {
    if (!card) return;
    const idx = parseInt(card.dataset.index || '-1', 10);
    if (idx === _lf.activeIndex) return;
    // Pause prev
    const prev = _lfActiveCardEl();
    if (prev) {
        const ifr = prev.querySelector('iframe');
        if (ifr) ifr.src = '';
    }
    _lf.activeIndex = idx;
    // Reset pause state for the new video — new active card starts as "playing"
    const newYtId = card.dataset.youtubeId;
    if (newYtId) _lf.pausedVideoIds.delete(newYtId);
    // Play current
    const ifr = card.querySelector('iframe');
    if (ifr && ifr.dataset.src && !ifr.src) {
        ifr.src = ifr.dataset.src;
        // Poke YouTube iframes after they load so they start broadcasting state events
        ifr.addEventListener('load', () => {
            setTimeout(() => _lfPokeYouTubeIframes(), 600);
        }, { once: true });
    }

    // ⭐ Infinite loop: when user reaches near the LAST rendered card, append
    // another batch of the same clips so the feed never ends in the same type.
    // Compare against the last rendered card's index (not DOM count) because we
    // trim old cards off the front — counting elements would trigger spurious
    // appends.
    const feedEl = document.getElementById('lf-feed');
    const lastCard = feedEl?.lastElementChild;
    const lastIdx = lastCard ? parseInt(lastCard.dataset.index || '-1', 10) : -1;
    if (lastIdx >= 0 && idx >= lastIdx - 1 && _lf.feed.length > 0) {
        _lfAppendLoopBatch();
    }
}

function _lfAppendLoopBatch() {
    const feedEl = document.getElementById('lf-feed');
    if (!feedEl || !_lf.feed.length) return;

    // Cap rendered cards so DOM doesn't grow unbounded — drop earliest if too many
    const MAX_CARDS = Math.max(_lf.feed.length * 4, 24);
    const baseIdx = document.querySelectorAll('.lf-card').length;

    // Append next batch with continuous indices
    const fragment = document.createElement('div');
    fragment.innerHTML = _lf.feed.map((link, i) => _lfRenderCard(link, baseIdx + i)).join('');
    while (fragment.firstChild) {
        feedEl.appendChild(fragment.firstChild);
    }

    // Observe the new cards
    const newCards = feedEl.querySelectorAll(`.lf-card`);
    newCards.forEach(c => {
        const cIdx = parseInt(c.dataset.index || '-1', 10);
        if (cIdx >= baseIdx) _lf.inObserver?.observe(c);
    });

    // Trim oldest cards if total exceeds cap (keep currently active + nearby)
    const totalNow = newCards.length;
    if (totalNow > MAX_CARDS) {
        const removeCount = totalNow - MAX_CARDS;
        for (let k = 0; k < removeCount; k++) {
            const c = newCards[k];
            // Don't remove the currently visible or its neighbour
            const ci = parseInt(c.dataset.index || '-1', 10);
            if (ci >= _lf.activeIndex - 1) break;
            try { _lf.inObserver?.unobserve(c); } catch (_) {}
            c.remove();
        }
    }
}

function _lfBindActivityListeners(wrap) {
    const bump = () => { _lf.lastActivityTs = Date.now(); };
    wrap.addEventListener('scroll', bump, { passive: true });
    wrap.addEventListener('click', bump);
    wrap.addEventListener('touchstart', bump, { passive: true });
}

/**
 * Horizontal-swipe to switch instrument type.
 * Wraps around (last → first, first → last) so user never hits a wall.
 *
 * scroll-snap-type: y mandatory consumes vertical drags, but a clearly
 * horizontal flick still surfaces as touchstart/touchend on the wrap with
 * |dx| significantly larger than |dy|. We require the gesture to be:
 *   - shorter than 700 ms total (a real flick, not a slow drag)
 *   - at least 60 px in horizontal distance
 *   - mostly horizontal: |dx| > |dy| × 1.5
 */
function _lfBindSwipeHorizontal(wrap) {
    let sx = 0, sy = 0, st = 0;
    const onStart = e => {
        const t = (e.changedTouches || e.touches)?.[0];
        if (!t) return;
        sx = t.clientX; sy = t.clientY; st = Date.now();
    };
    const onEnd = e => {
        const t = e.changedTouches?.[0];
        if (!t) return;
        const dx = t.clientX - sx;
        const dy = t.clientY - sy;
        const dt = Date.now() - st;
        if (dt > 700) return;
        if (Math.abs(dx) < 60) return;
        if (Math.abs(dx) < Math.abs(dy) * 1.5) return; // mostly vertical → leave to scroll-snap
        if (dx < 0) _lfSwitchType(+1); else _lfSwitchType(-1);
    };
    wrap.addEventListener('touchstart', onStart, { passive: true });
    wrap.addEventListener('touchend', onEnd, { passive: true });
    _lf._swipeStart = onStart; _lf._swipeEnd = onEnd; _lf._swipeWrap = wrap;
}

/**
 * Cycle to the next/previous instrument type, wrapping around at the ends.
 * Scrolls the chip into view so the user sees which type is now active.
 */
async function _lfSwitchType(direction) {
    if (!_lf.types?.length) return;
    const cur = _lf.types.indexOf(_lf.activeType);
    const next = ((cur < 0 ? 0 : cur) + direction + _lf.types.length) % _lf.types.length;
    if (_lf.types[next] === _lf.activeType) return;
    _lf.activeType = _lf.types[next];

    const filterEl = document.getElementById('lf-filters');
    if (filterEl) {
        filterEl.querySelectorAll('.lf-chip').forEach(b => {
            b.classList.toggle('active', b.dataset.type === _lf.activeType);
        });
        const activeChip = filterEl.querySelector(`.lf-chip[data-type="${CSS.escape(_lf.activeType)}"]`);
        try { activeChip?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); } catch (_) {}
    }
    // Briefly flash a visual cue so user knows the swipe registered
    _lfFlashSwipeHint(direction > 0 ? 'right' : 'left');
    await _lfLoadFeed();
}

function _lfFlashSwipeHint(direction) {
    const wrap = document.getElementById('learning-feed-wrap');
    if (!wrap) return;
    const hint = document.createElement('div');
    hint.style.cssText = `
        position: absolute; top: 50%; ${direction === 'right' ? 'left: 1rem' : 'right: 1rem'};
        transform: translateY(-50%); z-index: 30;
        background: rgba(0,0,0,0.7); color: #fff; padding: 0.5rem 0.9rem;
        border-radius: 999px; font-size: 0.85rem; font-weight: 600;
        pointer-events: none; opacity: 0; transition: opacity 0.2s;
    `;
    hint.textContent = direction === 'right' ? '👈 ' + (_lf.activeType || '') : (_lf.activeType || '') + ' 👉';
    wrap.appendChild(hint);
    requestAnimationFrame(() => hint.style.opacity = '1');
    setTimeout(() => { hint.style.opacity = '0'; setTimeout(() => hint.remove(), 250); }, 800);
}

/**
 * Listen for YouTube IFrame postMessage events to detect play / pause / end.
 * Requires `enablejsapi=1` on the embed URL (handled in _lfBuildEmbed).
 *
 * YouTube playerState: -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued.
 * We need to first send a "listening" command for YouTube to start
 * broadcasting state events.
 */
function _lfBindYouTubeStateListener() {
    const onMsg = (e) => {
        if (!/^https:\/\/(www\.)?youtube\.com$/.test(e.origin)) return;
        let data;
        try { data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; }
        catch (_) { return; }
        if (!data || data.event !== 'infoDelivery') return;
        const state = data.info?.playerState;
        if (typeof state !== 'number') return;
        // We don't know which iframe sent this; assume currently active card
        const card = _lfActiveCardEl();
        const ytId = card?.dataset.youtubeId;
        if (!ytId) return;
        if (state === 2) {
            _lf.pausedVideoIds.add(ytId);
            console.log('[LF] paused', ytId);
        } else if (state === 1) {
            _lf.pausedVideoIds.delete(ytId);
            console.log('[LF] playing', ytId);
        }
    };
    window.addEventListener('message', onMsg);
    _lf._onYtMsg = onMsg;
}

/** Tell each YouTube iframe to start broadcasting state events. */
function _lfPokeYouTubeIframes() {
    document.querySelectorAll('.lf-card iframe').forEach(ifr => {
        if (!ifr.src || !ifr.src.includes('youtube.com')) return;
        try {
            ifr.contentWindow?.postMessage(
                JSON.stringify({ event: 'listening', id: ifr.dataset.ytPoked || '' }),
                'https://www.youtube.com'
            );
            ifr.contentWindow?.postMessage(
                JSON.stringify({ event: 'command', func: 'addEventListener', args: ['onStateChange'] }),
                'https://www.youtube.com'
            );
            ifr.dataset.ytPoked = '1';
        } catch (_) {}
    });
}

/**
 * Activate "external app mode": the user has clicked "Open in app" so the
 * native browser tab will lose focus. Keep the heartbeat alive for up to
 * 30 minutes so they get credit when they come back.
 */
window.__lfMarkExternal = function () {
    _lf.externalMode = true;
    _lf.externalUntil = Date.now() + 30 * 60 * 1000;
    console.log('[LF] entered external-app mode for 30 min');
};

function _lfBindVisibility() {
    const onVis = () => {
        _lf.isVisible = document.visibilityState === 'visible' && !!document.getElementById('learning-feed-wrap');
        if (_lf.isVisible) _lf.lastActivityTs = Date.now();
    };
    document.addEventListener('visibilitychange', onVis);
    onVis();
    _lf._onVis = onVis;
}

function _lfTearDown() {
    _lfStopHeartbeat();
    if (_lf.inObserver) { try { _lf.inObserver.disconnect(); } catch (_) {} _lf.inObserver = null; }
    if (_lf._onVis) { document.removeEventListener('visibilitychange', _lf._onVis); _lf._onVis = null; }
    if (_lf._onYtMsg) { window.removeEventListener('message', _lf._onYtMsg); _lf._onYtMsg = null; }
    if (_lf._swipeWrap && _lf._swipeStart) {
        try { _lf._swipeWrap.removeEventListener('touchstart', _lf._swipeStart); } catch (_) {}
        try { _lf._swipeWrap.removeEventListener('touchend', _lf._swipeEnd); } catch (_) {}
        _lf._swipeWrap = null; _lf._swipeStart = null; _lf._swipeEnd = null;
    }
    if (_lf.timerEl) { _lf.timerEl.classList.remove('show'); _lf.timerEl = null; }
    _lf.activeIndex = -1;
    _lf.pausedVideoIds.clear();
    _lf.externalMode = false;
}

async function _lfLoadFeed() {
    const feedEl = document.getElementById('lf-feed');
    if (!feedEl) return;
    feedEl.innerHTML = `<div class="lf-loading"><span aria-busy="true">กำลังโหลดคลิป...</span></div>`;
    try {
        const { data, error } = await knowledgeExt.getVisibleLinks(_lf.activeType || null);
        if (error) throw error;
        _lf.feed = data || [];
        if (!_lf.feed.length) {
            feedEl.innerHTML = `
                <div class="lf-empty">
                    <div style="font-size:3rem;">🎬</div>
                    <p>ยังไม่มีคลิปสำหรับ${_lf.activeType ? `เครื่อง "${escapeHtml(_lf.activeType)}"` : 'หมวดนี้'}</p>
                    <button class="sd-btn-primary" id="lf-empty-submit">📤 แชร์คลิปแรก</button>
                </div>`;
            document.getElementById('lf-empty-submit')?.addEventListener('click', handleSubmitClip);
            return;
        }
        feedEl.innerHTML = _lf.feed.map((link, i) => _lfRenderCard(link, i)).join('');
        _lfSetupObserver(feedEl);
        // Auto-play first card
        const firstCard = feedEl.querySelector('.lf-card');
        if (firstCard) _lfActivateCard(firstCard);
    } catch (e) {
        feedEl.innerHTML = `<div class="lf-empty"><p>โหลดคลิปไม่สำเร็จ: ${escapeHtml(e?.message || '')}</p></div>`;
    }
}

function _lfSetupObserver(feedEl) {
    if (_lf.inObserver) { try { _lf.inObserver.disconnect(); } catch (_) {} }
    _lf.inObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
                _lfActivateCard(entry.target);
            }
        }
    }, { root: feedEl, threshold: [0.6] });
    feedEl.querySelectorAll('.lf-card').forEach(c => _lf.inObserver.observe(c));
}

async function _lfLoadTypes() {
    try {
        const { data, error } = await knowledgeExt.getTypes();
        if (error) throw error;
        const types = [...new Set((data || []).map(i => i.instrument_type).filter(Boolean))].sort();
        _lf.types = types;

        // Ensure activeType is one of the available types; if not, pick first.
        if (!types.includes(_lf.activeType)) {
            _lf.activeType = types[0] || '';
        }

        const filterEl = document.getElementById('lf-filters');
        if (!filterEl) return;
        // No "ทั้งหมด" chip — feed must always show a single instrument type at a time.
        filterEl.innerHTML = types.map(t =>
            `<button class="lf-chip ${_lf.activeType === t ? 'active' : ''}" data-type="${escapeHtml(t)}">${escapeHtml(t)}</button>`
        ).join('');
        filterEl.querySelectorAll('.lf-chip').forEach(btn => {
            btn.addEventListener('click', async () => {
                _lf.activeType = btn.dataset.type || '';
                filterEl.querySelectorAll('.lf-chip').forEach(b => b.classList.toggle('active', b === btn));
                await _lfLoadFeed();
            });
        });
    } catch (_) {}
}

export async function renderLearningFeed() {
    const wrap = document.getElementById('learning-feed-wrap');
    if (!wrap) return;

    // Tear down previous run if user navigates back
    _lfTearDown();
    _lf.timerEl = document.getElementById('lf-timer');

    // Default: pick the user's "most-used instrument type" (favorite).
    // The user explicitly asked for a single-type feed seeded with the
    // instrument they borrow / practise most. Chips at the top let them switch.
    const cu = getCurrentUser();
    _lf.activeType = '';
    if (cu) {
        try {
            const { data: fav } = await instrumentsExt.getFavorite(cu.id);
            if (fav?.[0]?.instrument_type) _lf.activeType = fav[0].instrument_type;
        } catch (_) {}
    }

    _lfBindActivityListeners(wrap);
    _lfBindSwipeHorizontal(wrap);
    _lfBindVisibility();
    _lfBindYouTubeStateListener();
    _lfStartHeartbeat();

    await _lfLoadTypes();
    await _lfLoadFeed();

    // Detach when switching away from this view (sd-view changes)
    const tabBar = document.querySelector('.sd-bottom-nav');
    if (tabBar) {
        const onTab = () => {
            // a tiny defer so the view DOM is already swapped
            setTimeout(() => {
                if (!document.getElementById('learning-feed-wrap')) {
                    _lfTearDown();
                    tabBar.removeEventListener('click', onTab);
                }
            }, 100);
        };
        tabBar.addEventListener('click', onTab);
    }
}

// Expose for external triggers
window.__sdRenderLearningFeed = renderLearningFeed;

// ═══════════════════════════════════════════════════════════════════════════
// 📤 SUBMIT CLIP — share own clip for admin review (any role)
// ═══════════════════════════════════════════════════════════════════════════

export async function handleSubmitClip() {
    const cu = getCurrentUser();
    if (!cu) { Swal.fire('แจ้งเตือน', 'ไม่พบข้อมูลผู้ใช้', 'warning'); return; }

    const { data: instData, error } = await instrumentsExt.getTypes();
    if (error) return Swal.fire('ผิดพลาด', 'ไม่สามารถโหลดประเภทเครื่องดนตรีได้', 'error');
    const types = [...new Set((instData || []).map(i => i.type).filter(Boolean))].sort();
    const typeOptions = types.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');

    const { value: form } = await Swal.fire({
        title: '📤 แชร์คลิปของฉัน',
        html: `<div style="text-align:left;">
            <p style="font-size:0.85rem; color:#64748b; margin-bottom: 1rem;">
                คลิปจะส่งให้แอดมินตรวจ — เห็นได้เฉพาะคุณและแอดมินจนกว่าจะอนุมัติ
            </p>
            <label style="font-size:0.85rem;font-weight:bold;">ประเภทเครื่องดนตรี *</label>
            <select id="swal-clip-type" class="swal2-select" style="width:100%;margin-bottom:1rem;display:block;">
                <option value="" disabled selected>-- เลือกประเภท --</option>${typeOptions}
            </select>
            <label style="font-size:0.85rem;font-weight:bold;">ชื่อคลิป *</label>
            <input id="swal-clip-title" class="swal2-input" style="width:100%;margin:0.4rem 0 1rem 0;" placeholder="เช่น เทคนิคการไล่สเกล" maxlength="120">
            <label style="font-size:0.85rem;font-weight:bold;">ลิงก์คลิป (YouTube / TikTok / Facebook) *</label>
            <input id="swal-clip-url" type="url" class="swal2-input" style="width:100%;margin:0.4rem 0 1rem 0;" placeholder="https://...">
            <label style="font-size:0.85rem;font-weight:bold;">คำบรรยาย (ไม่บังคับ)</label>
            <textarea id="swal-clip-caption" class="swal2-textarea" style="width:100%; min-height:60px;" placeholder="อธิบายสั้นๆ" maxlength="280"></textarea>
        </div>`,
        showCancelButton: true,
        confirmButtonText: '📨 ส่งให้แอดมินตรวจ',
        cancelButtonText: 'ยกเลิก',
        focusConfirm: false,
        preConfirm: () => {
            const t = document.getElementById('swal-clip-type').value;
            const ti = document.getElementById('swal-clip-title').value.trim();
            const u = document.getElementById('swal-clip-url').value.trim();
            const c = document.getElementById('swal-clip-caption').value.trim();
            if (!t || !ti || !u) { Swal.showValidationMessage('กรุณากรอกข้อมูลให้ครบ (ประเภท / ชื่อ / ลิงก์)'); return false; }
            if (!/^https?:\/\//i.test(u)) { Swal.showValidationMessage('ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://'); return false; }
            return { instrumentType: t, title: ti, url: u, caption: c || null };
        },
    });

    if (!form) return;

    Swal.showLoading();
    try {
        const { data, error } = await knowledgeExt.submitClip(form);
        if (error) throw error;
        await Swal.fire('✅ ส่งสำเร็จ', 'คลิปของคุณรอแอดมินตรวจ\nคุณจะเห็นคลิปนี้ติด tag "ยังไม่ตรวจ" ใน feed', 'success');
        // Refresh feed so the user sees their submission immediately
        await _lfLoadFeed();
    } catch (e) {
        await Swal.fire('ผิดพลาด', e?.message || 'ส่งไม่สำเร็จ', 'error');
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// 📊 LEARNING HISTORY — per instrument-type breakdown
// ═══════════════════════════════════════════════════════════════════════════

export async function showLearningHistory() {
    Swal.fire({
        title: '📊 ประวัติการเรียนของฉัน',
        html: `<div id="swal-learn-hist" aria-busy="true" style="min-height:200px; text-align:left;">กำลังโหลด...</div>`,
        width: '500px',
        showCloseButton: true,
        showConfirmButton: false,
        background: '#ffffff',
        color: '#1e293b',
        didOpen: async () => {
            const c = document.getElementById('swal-learn-hist');
            try {
                const { data, error } = await knowledgeExt.getLearningHistory(50);
                if (error) throw error;
                if (!data?.length) {
                    c.innerHTML = '<p style="text-align:center; padding:2rem; color:#64748b;">ยังไม่มีประวัติการเรียน</p>';
                    return;
                }
                let totalMin = 0, totalExp = 0;
                data.forEach(r => { totalMin += Number(r.total_minutes); totalExp += Number(r.total_exp); });
                c.innerHTML = `
                    <div style="background:#eff6ff; padding:1rem; border-radius:12px; margin-bottom:1rem; text-align:center;">
                        <div style="font-size:0.8rem; color:#475569;">รวมทั้งหมด</div>
                        <div style="font-size:1.4rem; font-weight:700; color:#1d4ed8; margin-top:0.25rem;">⏱ ${totalMin} นาที · ⭐ ${totalExp} EXP</div>
                    </div>
                    ${data.map(r => `
                        <div style="display:flex; justify-content:space-between; align-items:center; padding:0.75rem 0.5rem; border-bottom:1px solid #e2e8f0;">
                            <div>
                                <div style="font-weight:600; color:#1e293b;">🎵 ${escapeHtml(r.instrument_type)}</div>
                                <div style="font-size:0.75rem; color:#64748b;">${r.session_count} ครั้ง</div>
                            </div>
                            <div style="text-align:right;">
                                <div style="font-weight:600; color:#1d4ed8;">${r.total_minutes} นาที</div>
                                <div style="font-size:0.75rem; color:#64748b;">+${r.total_exp} EXP</div>
                            </div>
                        </div>
                    `).join('')}
                `;
            } catch (e) {
                c.innerHTML = `<p style="color:#dc2626; text-align:center;">โหลดประวัติไม่สำเร็จ: ${escapeHtml(e?.message || '')}</p>`;
            } finally {
                c.removeAttribute('aria-busy');
            }
        },
    });
}

// Backward-compat shims so any leftover external callers don't break
export async function renderKnowledgeBase() { return renderLearningFeed(); }
export async function loadAndDisplayMedia() { return renderLearningFeed(); }
export async function handleSuggestKnowledgeLink() { return handleSubmitClip(); }

// 🔧 Helper: ถ้า user อยู่นอก top N → คืน row ของ user เพื่อ append ใต้ table
function _findSelfBelowTop(allRows, top) {
    if (!allRows?.length) return null;
    const me = allRows.find(r => r.is_current_user);
    if (!me) return null;
    const inTop = top.some(r => r.is_current_user);
    return inTop ? null : me;
}

export async function renderPracticeRanking() {
    const container = document.getElementById('practice-ranking-list');
    if (!container) return;
    container.setAttribute('aria-busy', 'true');
    try {
        const { data, error } = await rankingsExt.getClubRanking(getCurrentUser()?.id);
        if (error) throw error;
        const allData = data || [];
        const top10 = allData.slice(0, 10);
        const selfBelow = _findSelfBelowTop(allData, top10);
        container.innerHTML = createRankingTableHTML(top10, '', selfBelow);
    } catch (err) { container.innerHTML = `<p style="color:#ef4444">โหลดข้อมูลอันดับล้มเหลว: ${err.message}</p>`; }
    finally { container.removeAttribute('aria-busy'); }
}

export async function renderClassPracticeRanking() {
    const container = document.getElementById('class-ranking-list');
    if (!container) return;
    container.setAttribute('aria-busy', 'true');
    try {
        const { data, error } = await rankingsExt.getClassRanking(getCurrentUser()?.id);
        if (error) throw error;
        const allData = data || [];
        const top10 = allData.slice(0, 10);
        const selfBelow = _findSelfBelowTop(allData, top10);
        container.innerHTML = createRankingTableHTML(top10, '*นับเฉพาะการยืมและคืนตรงเวลา', selfBelow);
    } catch (err) { container.innerHTML = `<p style="color:#ef4444">โหลดข้อมูลอันดับล้มเหลว: ${err.message}</p>`; }
    finally { container.removeAttribute('aria-busy'); }
}

export async function renderGameLeaderboards() {
    const cu = getCurrentUser();
    const [swEl, rcEl] = [
        document.getElementById('staffwars-leaderboard'),
        document.getElementById('rhythmcore-leaderboard'),
    ];
    const [swRes, rcRes] = await Promise.allSettled([
        swEl ? gamesExt.getLeaderboard('staffwars', cu?.id) : Promise.resolve(null),
        rcEl ? gamesExt.getLeaderboard('rhythm_core', cu?.id) : Promise.resolve(null),
    ]);
    if (swEl) {
        swEl.innerHTML = (swRes.status==='fulfilled' && !swRes.value?.error) ? createLeaderboardHtml('⚔️ Staff Wars', swRes.value.data) : `<p>⚔️ Staff Wars: เกิดข้อผิดพลาด</p>`;
        swEl.removeAttribute('aria-busy');
    }
    if (rcEl) {
        rcEl.innerHTML = (rcRes.status==='fulfilled' && !rcRes.value?.error) ? createLeaderboardHtml('🥁 Rhythm Core', rcRes.value.data) : `<p>🥁 Rhythm Core: เกิดข้อผิดพลาด</p>`;
        rcEl.removeAttribute('aria-busy');
    }
}

export function handleUniversalScan() {
    Swal.fire({
        title: 'สแกน QR Code',
        html: '<div id="qr-reader" style="width:100%;max-width:400px;margin:auto;border-radius:12px;overflow:hidden;"></div>',
        showCancelButton: true, cancelButtonText: 'ยกเลิก', showConfirmButton: false,
        didOpen: () => {
            if (typeof Html5Qrcode === 'undefined') return Swal.fire('ข้อผิดพลาด', 'ไลบรารีสแกนเนอร์ยังไม่ถูกโหลด', 'error');
            const scanner = new Html5Qrcode('qr-reader');
            scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 250, height: 250 } },
                (decoded) => {
                    scanner.stop().then(() => {
                        Swal.close();
                        try {
                            const id = new URLSearchParams(new URL(decoded).search).get('scan');
                            if (!id) return Swal.fire('ผิดพลาด', 'QR Code ไม่ถูกต้อง', 'error');
                            processQrScan(id);
                        } catch (_) { Swal.fire('ผิดพลาด', 'QR Code ไม่ถูกต้อง', 'error'); }
                    });
                }).catch(() => Swal.fire('ผิดพลาด', 'ไม่สามารถเปิดกล้องได้', 'error'));
        },
    });
}

export async function handleEditProfile(e) {
    const btn = e?.currentTarget;
    if (btn) btn.disabled = true;
    const cu = getCurrentUser();
    try {
        const { value: formValues } = await Swal.fire({
            title: 'แก้ไขข้อมูลส่วนตัว',
            html: `<div style="text-align:left;">
                <div class="grid">
                    <div>
                        <label style="font-size:0.85rem;font-weight:bold;">คำนำหน้า</label>
                        <select id="swal-prefix" class="sd-select-minimal" style="width:100%;margin-bottom:1rem;">
                            ${['เด็กชาย','เด็กหญิง','นาย','นางสาว','นาง'].map(p => `<option ${cu.prefix===p?'selected':''}>${p}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label style="font-size:0.85rem;font-weight:bold;">ชื่อ</label>
                        <input id="swal-firstname" class="sd-select-minimal" style="width:100%;margin-bottom:1rem;" value="${escapeHtml(cu.first_name||'')}">
                    </div>
                    <div>
                        <label style="font-size:0.85rem;font-weight:bold;">นามสกุล</label>
                        <input id="swal-lastname" class="sd-select-minimal" style="width:100%;margin-bottom:1rem;" value="${escapeHtml(cu.last_name||'')}">
                    </div>
                </div>
                <div class="grid">
                    <div>
                        <label style="font-size:0.85rem;font-weight:bold;">วันเกิด</label>
                        <input type="date" id="swal-birthdate" class="sd-select-minimal" style="width:100%;margin-bottom:1rem;" value="${cu.birth_date||''}">
                    </div>
                    <div>
                        <label style="font-size:0.85rem;font-weight:bold;">รหัสนักเรียน</label>
                        <input id="swal-student-id" class="sd-select-minimal" style="width:100%;margin-bottom:1rem;" value="${escapeHtml(cu.student_id||'')}">
                    </div>
                    <div>
                        <label style="font-size:0.85rem;font-weight:bold;">ชั้นเรียน</label>
                        <input id="swal-student-class" class="sd-select-minimal" style="width:100%;margin-bottom:1rem;" value="${escapeHtml(cu.class_level||'')}" placeholder="ม.4/1">
                    </div>
                </div>
                <hr style="margin:1rem 0;">
                <label style="font-size:0.85rem;font-weight:bold;">อัปโหลดรูปโปรไฟล์ใหม่</label>
                <input id="swal-profile-file" type="file" style="margin-top:0.5rem;" accept="image/*">
            </div>`,
            focusConfirm: false, showCancelButton: true, confirmButtonColor: 'var(--pico-primary)',
            confirmButtonText: 'บันทึก', cancelButtonText: 'ยกเลิก',
            preConfirm: () => {
                const imageFile = document.getElementById('swal-profile-file').files[0];
                if (imageFile && !imageFile.name.toLowerCase().endsWith('.jpg')) {
                    Swal.showValidationMessage('กรุณาอัปโหลดไฟล์รูปภาพนามสกุล .jpg เท่านั้น');
                    return false;
                }
                return {
                    prefix:         document.getElementById('swal-prefix').value,
                    first_name:     document.getElementById('swal-firstname').value,
                    last_name:      document.getElementById('swal-lastname').value,
                    class_level:    document.getElementById('swal-student-class').value || null,
                    student_id:     document.getElementById('swal-student-id').value || null,
                    birth_date:     document.getElementById('swal-birthdate').value || null,
                    imageFile:      imageFile || null,
                };
            },
        });

        if (formValues) {
            Swal.showLoading();
            let finalImageUrl = cu.profile_image_url;
            if (formValues.imageFile) {
                const file = formValues.imageFile;
                const filePath = `${cu.id}.jpg`;
                const { error: uploadErr } = await usersExt.uploadProfileImage(cu.id, formValues.imageFile);
                if (uploadErr) throw uploadErr;
                finalImageUrl = publicUrl;
            }
            const updateData = { ...formValues, profile_image_url: finalImageUrl };
            delete updateData.imageFile;
            const { error } = await usersExt.updateProfile(cu.id, updateData);
            if (error) throw error;
            setCurrentUser({ ...cu, ...updateData });
            
            await Swal.fire('สำเร็จ!', 'อัปเดตข้อมูลของคุณเรียบร้อยแล้ว กรุณารีเฟรชหน้าเว็บ', 'success');
            window.location.reload(); 
        }
    } catch (err) { await Swal.fire('ผิดพลาด!', err.message, 'error'); } 
    finally { if (btn) btn.disabled = false; }
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Tuner & Metronome 
// ─────────────────────────────────────────────────────────────────────────────
const NOTE_STRINGS = ["C","C#/Db","D","D#/Eb","E","F","F#/Gb","G","G#/Ab","A","A#/Bb","B"];
function _getNoteFromPitch(f, ref) { return Math.round(12 * Math.log(f/ref) / Math.log(2)) + 69; }
function _getNoteString(n)         { return NOTE_STRINGS[n % 12]; }
function _getCents(f, n, ref)      {
    const std = ref * Math.pow(2, (n-69)/12);
    return Math.floor(1200 * Math.log(f/std) / Math.log(2));
}
function _autoCorrelate(buf, rate) {
    const SIZE = buf.length;
    const rms  = Math.sqrt(buf.reduce((s,v) => s+v*v, 0) / SIZE);
    if (rms < 0.01) return -1;
    let r1 = 0, r2 = SIZE-1;
    for (let i=0; i<SIZE/2; i++) { if (Math.abs(buf[i])  < 0.2) { r1=i; break; } }
    for (let i=1; i<SIZE/2; i++) { if (Math.abs(buf[SIZE-i]) < 0.2) { r2=SIZE-i; break; } }
    buf = buf.slice(r1, r2);
    const n = buf.length;
    const c = new Array(n).fill(0);
    for (let i=0; i<n; i++) for (let j=0; j<n-i; j++) c[i] += buf[j]*buf[j+i];
    let d=0; while (d<c.length && c[d]>c[d+1]) d++;
    let mx=-1, mp=-1;
    for (let i=d; i<n; i++) if (c[i]>mx) { mx=c[i]; mp=i; }
    let T = mp;
    if (T <= 0 || T >= c.length - 1) return -1;
    const x1=c[T-1], x2=c[T], x3=c[T+1];
    const a=(x1+x3-2*x2)/2, b=(x3-x1)/2;
    if (a) T = T - b/(2*a);
    if (T <= 0) return -1;
    return rate/T;
}

export function setupNativeTuner() {
    let ts = { ctx:null, stream:null, analyser:null, raf:null, on:false, buf:null };
    const tunerEl   = document.getElementById('native-tuner');
    if (!tunerEl) return;
    const noteEl    = tunerEl.querySelector('.tuner-note-name');
    const freqEl    = tunerEl.querySelector('.tuner-freq-display');
    const centEl    = tunerEl.querySelector('.tuner-cent-display');
    const indEl     = tunerEl.querySelector('.tuner-indicator');
    const toggleBtn = document.getElementById('toggle-tuner-btn');
    const refInput  = document.getElementById('reference-pitch-input');
    let ref = 440;
    if (refInput) {
        ref = parseFloat(refInput.value) || 440;
        refInput.addEventListener('input', () => { ref = parseFloat(refInput.value) || 440; });
    }
    const tick = () => {
        if (!ts.on) return;
        ts.analyser.getFloatTimeDomainData(ts.buf);
        const pitch = _autoCorrelate(ts.buf, ts.ctx.sampleRate);
        if (pitch !== -1) {
            const n  = _getNoteFromPitch(pitch, ref);
            const ns = _getNoteString(n);
            const ct = _getCents(pitch, n, ref);
            noteEl.textContent = ns.replace('#','♯');
            freqEl.textContent = `${pitch.toFixed(1)} Hz`;
            centEl.textContent = `${ct} cents`;
            const pos = ((Math.max(-50, Math.min(50, ct)) + 50) / 100) * 100;
            indEl.style.left = `${pos}%`;
            tunerEl.classList.toggle('in-tune', Math.abs(ct) < 5);
            noteEl.classList.toggle('note-in-tune', Math.abs(ct) <= 3);
        } else {
            tunerEl.classList.remove('in-tune');
            noteEl.classList.remove('note-in-tune');
        }
        ts.raf = requestAnimationFrame(tick);
    };
    const start = async () => {
        if (ts.on) return;
        toggleBtn.setAttribute('aria-busy', 'true');
        if (refInput) refInput.disabled = true;
        try {
            ts.stream  = await navigator.mediaDevices.getUserMedia({ audio: true });
            ts.ctx     = new (window.AudioContext || window.webkitAudioContext)();
            if (ts.ctx.state === 'suspended') await ts.ctx.resume();
            ts.analyser = ts.ctx.createAnalyser();
            ts.analyser.fftSize = 2048;
            ts.buf = new Float32Array(ts.analyser.fftSize);
            ts.ctx.createMediaStreamSource(ts.stream).connect(ts.analyser);
            ts.on = true;
            tick();
            toggleBtn.innerHTML = '🟢 กำลังทำงาน';
            toggleBtn.classList.replace('sd-btn-outline', 'sd-btn-danger');
            toggleBtn.style.color = 'white';
        } catch (_) { stop(); }
        finally { toggleBtn.removeAttribute('aria-busy'); }
    };
    const stop = () => {
        if (refInput) refInput.disabled = false;
        if (ts.raf)    cancelAnimationFrame(ts.raf);
        if (ts.stream) ts.stream.getTracks().forEach(t => t.stop());
        if (ts.ctx && ts.ctx.state !== 'closed') ts.ctx.close();
        ts = { ctx:null, stream:null, analyser:null, raf:null, on:false, buf:null };
        noteEl.textContent = '--';
        freqEl.textContent = `${ref.toFixed(1)} Hz`;
        centEl.textContent = '-';
        indEl.style.transform = 'translateX(0)';
        indEl.style.backgroundColor = '#ef4444';
        if (toggleBtn) { 
            toggleBtn.innerHTML = '🔴 เปิดจูนเนอร์'; 
            toggleBtn.classList.replace('sd-btn-danger', 'sd-btn-outline'); 
            toggleBtn.style.color = '';
        }
    };
    toggleBtn?.addEventListener('click', () => ts.on ? stop() : start());
}

export function setupMetronome() {
    const m = {
        ctx: null, playing: false, nextNote: 0, beat: 0,
        ahead: 0.1, look: 25, timer: 0, bpm: 120, sig: 4, sub: 1, taps: [],
    };
    const bpmSlider   = document.getElementById('bpm-slider');
    const bpmDisplay  = document.getElementById('bpm-display');
    const sigSel      = document.getElementById('time-signature-select');
    const subSel      = document.getElementById('subdivision-select');
    const startBtn    = document.getElementById('metronome-start-stop-btn');
    const tapBtn      = document.getElementById('tap-tempo-btn');
    const indicator   = document.getElementById('metronome-circle');

    const scheduleNote = (beat, time) => {
        if (!m.ctx) return;
        const osc = m.ctx.createOscillator(), g = m.ctx.createGain();
        g.gain.setValueAtTime(1, time);
        g.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
        osc.connect(g); g.connect(m.ctx.destination);
        osc.frequency.value = (beat % m.sig === 0) ? 1200 : 880;
        setTimeout(() => {
            if (!indicator) return;
            indicator.style.backgroundColor = beat % m.sig === 0 ? 'var(--pico-primary-background)' : '#9ca3af';
            setTimeout(() => indicator.style.backgroundColor = 'transparent', 80);
        }, (time - m.ctx.currentTime) * 1000);
        osc.start(time); osc.stop(time + 0.05);
    };
    const scheduler = () => {
        while (m.nextNote < m.ctx.currentTime + m.ahead) {
            const spb = 60 / m.bpm;
            for (let i=0; i<m.sub; i++) scheduleNote(m.beat, m.nextNote + i*(spb/m.sub));
            m.beat = (m.beat+1) % m.sig;
            m.nextNote += spb;
        }
        m.timer = window.setTimeout(scheduler, m.look);
    };
    const play = () => {
        if (m.playing) return;
        if (!m.ctx) m.ctx = new (window.AudioContext || window.webkitAudioContext)();
        m.playing = true; m.beat = 0; m.nextNote = m.ctx.currentTime + 0.1;
        scheduler();
        startBtn.textContent = '◼︎ หยุด'; startBtn.className = 'sd-btn-danger';
    };
    const stop = () => {
        m.playing = false; window.clearTimeout(m.timer);
        startBtn.textContent = '▶︎ เริ่ม'; startBtn.className = 'sd-btn-primary';
    };
    const tap = () => {
        const now = performance.now();
        m.taps.push(now);
        if (m.taps.length > 1) {
            const avg = m.taps.slice(1).reduce((s,t,i) => s + (t - m.taps[i]), 0) / (m.taps.length-1);
            const bpm = Math.round(60000 / avg);
            if (bpm >= 40 && bpm <= 240) {
                m.bpm = bpm;
                if (bpmSlider)  bpmSlider.value = bpm;
                if (bpmDisplay) bpmDisplay.textContent = bpm;
            }
        }
        setTimeout(() => {
            if (performance.now() - m.taps[m.taps.length-1] > 2000) m.taps = [];
        }, 2000);
    };

    bpmSlider  ?.addEventListener('input',  e => { m.bpm = parseInt(e.target.value); bpmDisplay.textContent = m.bpm; });
    sigSel     ?.addEventListener('input',  e => { m.sig = parseInt(e.target.value); });
    subSel     ?.addEventListener('input',  e => { m.sub = parseInt(e.target.value); });
    startBtn   ?.addEventListener('click',  () => m.playing ? stop() : play());
    tapBtn     ?.addEventListener('click',  tap);
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. Game Event Listener (รับค่ากลับมาจากเกม)
// ─────────────────────────────────────────────────────────────────────────────
window.addEventListener('message', async (event) => {
    // 1. รับคะแนนเมื่อเกมจบ
    if (event.data && event.data.type === 'GAME_OVER') {
        const cu = getCurrentUser();
        if (!cu) return;

        const { gameName, score, duration } = event.data.payload;
        
        try {
            const playDuration = Math.max(1, Math.round(duration || 1));
            const earnedXp = Math.floor(score / 10) + (playDuration * 5);

            // 📍 1. สร้างตัวแปรเวลา start_time (เอาเวลาปัจจุบัน ลบด้วยเวลาที่เล่น)
            const endTime = new Date();
            const startTime = new Date(endTime.getTime() - (playDuration * 60 * 1000));

            // ⚠️ แยกบันทึกคะแนนเกมไว้บนสุด! (ถ้า XP พัง คะแนนเกมต้องไม่หาย)
            const { error: sessionError } = await gamesExt.saveSession(cu.id, gameName, score, playDuration, startTime.toISOString());

            if (sessionError) console.error('ไม่สามารถบันทึกคะแนนได้:', sessionError);

            // พยายามอัปเดต XP (ใส่ try-catch ครอบไว้ ป้องกันการหยุดทำงาน)
            try {
                await gamesExt.incrementXpAuto(cu.id, 'game', playDuration, score, gameName);
            } catch (xpErr) {
                console.log('อัปเดต XP/เวลา ไม่สำเร็จ:', xpErr);
            }

            if (typeof Swal !== 'undefined') {
                Swal.fire({
                    title: 'บันทึกคะแนนสำเร็จ!',
                    text: `คะแนนของคุณถูกบันทึกเรียบร้อยแล้ว ⚡`,
                    icon: 'success', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000
                });
            }

            // บังคับรีเฟรชตารางคะแนน
            if (state.activeView === 'games' || state.activeView === 'home') {
                window.__sdSetView(state.activeView);
            }
        } catch (error) {
            console.error('Error ในการรับค่า GAME_OVER:', error);
        }
    }

    // 2. รับคำสั่งเมื่อผู้เล่นกดปุ่ม "ออก" (เพื่อรีเฟรช Dashboard)
    if (event.data && event.data.type === 'CLOSE_GAME') {
        if (state.activeView === 'games' || state.activeView === 'home') {
            window.__sdSetView(state.activeView);
        }
    }
});

// ✨ เสริม: รีเฟรชตารางคะแนนอัตโนมัติ เมื่อผู้เล่นปิดแท็บเกมแล้วสลับกลับมาที่แท็บ Dashboard
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
        if (state.activeView === 'games') {
            window.__sdSetView('games');
        }
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// ✨ ระบบเปิดวิดีโอและจับเวลาในแอป (Watch & Learn Timer) - รองรับแอปนอก
// ─────────────────────────────────────────────────────────────────────────────
window.__sdWatchVideo = async (url, title) => {
    let embedUrl = url;

    // 1. ระบบพยายามแปลง URL เป็น Embed เผื่อบางคลิปดูในแอปได้ (เช่น Youtube)
    try {
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            if (url.includes('list=')) {
                const urlObj = new URL(url.replace('m.youtube', 'youtube'));
                const listId = urlObj.searchParams.get('list');
                if (listId) embedUrl = `https://www.youtube.com/embed/videoseries?list=${listId}&autoplay=1`;
            } else if (url.includes('youtu.be/')) {
                const videoId = url.split('youtu.be/')[1].split('?')[0];
                if (videoId) embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
            } else {
                const urlObj = new URL(url.replace('m.youtube', 'youtube'));
                const videoId = urlObj.searchParams.get('v');
                if (videoId) embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
            }
        }
        else if (url.includes('facebook.com') || url.includes('fb.watch')) {
            embedUrl = `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false&width=auto&autoplay=true`;
        }
        else if (url.includes('tiktok.com')) {
            const match = url.match(/(\d{18,20})/);
            if (match && match[1]) embedUrl = `https://www.tiktok.com/embed/v2/${match[1]}?autoplay=1`;
        }
    } catch (e) { console.error("URL Parsing error:", e); }

    // 2. เริ่มจับเวลาตอนเปิด Pop-up
    const startTime = Date.now();

    // 3. เด้ง Pop-up
    await Swal.fire({
        title: escapeHtml(title),
        html: `
            <div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; border-radius: 12px; box-shadow: var(--pico-box-shadow); background: #000;">
                <iframe src="${embedUrl}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
            </div>
            
            <div style="margin-top: 1rem; padding: 1rem; background: var(--pico-form-element-background-color); border-radius: 8px; border: 1px dashed var(--pico-muted-border-color); text-align: left;">
                <strong style="color:var(--pico-color);">📺 วิดีโอไม่เล่น / จอดำ?</strong>
                <p style="font-size:0.85rem; color:var(--pico-muted-color); margin: 0.4rem 0;">เนื่องจากระบบความปลอดภัยของแอป (เช่น Facebook, TikTok) ให้คลิกปุ่มด้านล่างเพื่อ <b>เปิดดูในแอปหลัก</b> เมื่อดูจบแล้วค่อยกลับมากด "✅ เรียนรู้เสร็จสิ้น" ที่หน้านี้</p>
                <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="sd-btn-outline" style="width:100%; padding:0.6rem; display:block; text-align:center; text-decoration:none; border-radius:8px;">🚀 ดูไม่ได้กดที่นี่</a>
            </div>

            <p style="font-size:0.85rem; color:var(--pico-primary); margin-top:1rem; font-weight:bold; text-align:center;">
                ⏱️ ระบบกำลังจับเวลา...
            </p>
        `,
        width: '650px',
        showCancelButton: true,
        confirmButtonText: '✅ เรียนรู้เสร็จสิ้น',
        cancelButtonText: 'ปิดหน้าต่าง (ยกเลิก)',
        confirmButtonColor: 'var(--pico-primary)',
        allowOutsideClick: false // บังคับให้ต้องกดปุ่มเพื่อปิด
    }).then(async (result) => {
        
        // 4. ถ้ากดยืนยันว่าเรียนรู้เสร็จแล้ว ค่อยนำเวลามาคำนวณ
        if (result.isConfirmed) {
            const endTime = Date.now();
            const exactMinutes = (endTime - startTime) / 60000; // คำนวณแบบทศนิยมเป๊ะๆ

            // ⚠️ เงื่อนไขที่ 1: เร็วเกินไป (กันเด็กหัวหมอกดรัวๆ)
            if (exactMinutes < 0.5) {
                Swal.fire('เวลาสั้นเกินไป ❌', 'คุณใช้เวลาเรียนรู้น้อยกว่า 30 วินาที ระบบจึงไม่สามารถให้ EXP และเวลาซ้อมได้', 'info');
                return;
            }
            
            // ⚠️ เงื่อนไขที่ 2: นานเกินไป (กันเปิดแช่ทิ้งไว้ข้ามวัน)
            if (exactMinutes > 30) {
                Swal.fire('เวลาเกินกำหนด ❌', 'คุณเปิดหน้านี้ทิ้งไว้นานเกิน 30 นาที ระบบประเมินว่าเกินความยาวของคลิปปกติ จึงไม่สามารถให้คะแนนในรอบนี้ได้', 'error');
                return;
            }

            // ผ่านเงื่อนไข -> แจกรางวัลตามเวลาที่ดูจริง x ตัวคูณ EXP
            Swal.showLoading();
            const cu = getCurrentUser();
            
            // ปัดเศษให้เป็นนาทีเต็ม แต่ถ้าเลย 30 วินาทีมาแล้ว ให้ขั้นต่ำคือ 1 นาที
            const finalMinutes = Math.max(1, Math.round(exactMinutes));

            const { error } = await knowledgeExt.rewardVideoWatch(cu.id, title, finalMinutes);

            if (!error) {
                Swal.fire('เยี่ยมมาก! 🎉', `คุณตั้งใจเรียนรู้ไป ${finalMinutes} นาที\nระบบได้บันทึกเวลาซ้อมและ EXP ให้คุณเรียบร้อยแล้ว!`, 'success')
                .then(() => {
                    // ✨ แก้ไขระบบกันหน้าค้าง: ดึงหน้าเดิมมาวาดใหม่แบบไร้รอยต่อ แทนการโหลดทั้งเว็บใหม่
                    window.__sdSetView(state.activeView); 
                });
            } else {
                Swal.fire('ผิดพลาด', error.message, 'error');
            }
        }
    });
};

// ✨ [Engineer Added]: ฟังก์ชันสำหรับนักเรียนส่งคำขอโจมตีบอส
window.__sdChallengeBoss = async (bossId, bossTitle) => {
    const { value: url } = await Swal.fire({
        title: `⚔️ ท้าทาย: ${bossTitle}`,
        input: 'url',
        inputLabel: 'วางลิงก์ YouTube ที่อัดคลิปการสอบของคุณ',
        inputPlaceholder: 'https://youtu.be/...',
        showCancelButton: true,
        confirmButtonText: 'ส่งคำท้าโจมตี',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#2563eb'
    });

    if (url) {
        Swal.showLoading();
        const cu = getCurrentUser();
        try {
            // เรียกใช้ API เพื่อส่งคำขอ
            const { error } = await bossesApi.submitRaidRequest(bossId, cu.id, url);
            if (error) throw error;
            
            Swal.fire('ส่งคำท้าทายสำเร็จ!', 'รอกรรมการกิลด์ (คุณครู) ตรวจสอบและแจ้งผลกลับมานะ สู้ๆ! 🎉', 'success');
        } catch (err) {
            Swal.fire('ผิดพลาด', err.message, 'error');
        }
    }
};