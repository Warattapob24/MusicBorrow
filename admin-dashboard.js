/**
 * admin-dashboard.js — One-Stop Admin Dashboard
 * ✨ REFACTORED: ผ่าน Strict Separation of Concerns - ไม่มี supabase calls
 * เรียกใช้ฟังก์ชันทั้งหมดผ่าน api.js แทน
 */

import { adminDashboard as api, adminExt, authApi, bossesApi, raidApi, instrumentsExt, notifications, adminKnowledgeApi, scheduledNotificationsApi, adminNotifications, recoveryApi, studentLoopsApi, eventsApi, uniformApi, staffApi, sectionsApi } from './api.js';
import { escapeHtml, translateGroup } from './utils.js';
import { SUPABASE_URL } from './config.js';
import { getCurrentUser } from './auth.js';

// ─────────────────────────────────────────────────────────────────────────────
// Module-local state  (no globals)
// ─────────────────────────────────────────────────────────────────────────────
const state = {
    activeTab:      'overview',
    stats:          null,
    borrows:        [],   
    pendingBorrows: [],   
    borrowHistory:  [],   
    repairs:        [],   
    repairHistory:  [],   
    users:          [],
    instruments:    [],
    knowledgeLinks: [],
    bosses:         [],   
    activeLobby: null,
    raidParticipants: [],
    unsubscribeRaid: null,
    pollInterval: null,
    bossRequests:   [],   
    clubRankings:   [],   
    classRankings:  [],   
    realtimeChannel: null,
    refreshTimer:    null,
    charts:          {},
    filters: {
        borrows:     { search: '', status: 'all', sort: 'borrow_timestamp', dir: 'desc' },
        repairs:     { search: '', status: 'all', sort: 'report_date',      dir: 'desc' },
        users:       { search: '', group: 'all',  sort: 'first_name',       dir: 'asc'  },
        instruments: { search: '', type: 'all',   sort: 'name',             dir: 'asc'  },
        history:     { search: '', status: 'all', sort: 'borrow_timestamp', dir: 'desc', page: 0 },
    },
};
const PAGE_SIZE = 25;

// ─────────────────────────────────────────────────────────────────────────────
// Colour / badge helpers
// ─────────────────────────────────────────────────────────────────────────────
const STATUS_BADGE = {
    active:       { label: 'ยืมอยู่',   cls: 'oad-badge-blue'   },
    pending:      { label: 'รออนุมัติ', cls: 'oad-badge-amber'  },
    approved:     { label: 'อนุมัติแล้ว', cls: 'oad-badge-green' },
    rejected:     { label: 'ปฏิเสธ',    cls: 'oad-badge-red'    },
    returned:     { label: 'คืนแล้ว',   cls: 'oad-badge-gray'   },
    overdue:      { label: 'เกินกำหนด', cls: 'oad-badge-red'    },
    'แจ้งซ่อม':  { label: 'แจ้งซ่อม',   cls: 'oad-badge-amber'  },
    'รอซ่อม':    { label: 'รอซ่อม',     cls: 'oad-badge-orange' },
    'กำลังซ่อม': { label: 'กำลังซ่อม',  cls: 'oad-badge-blue'   },
    'ซ่อมเสร็จสิ้น': { label: 'ซ่อมเสร็จ', cls: 'oad-badge-green' },
    'ไม่สามารถซ่อมได้': { label: 'ซ่อมไม่ได้', cls: 'oad-badge-red' },
};
function badge(key) {
    const s = STATUS_BADGE[key] || { label: key || '—', cls: 'oad-badge-gray' };
    return `<span class="oad-badge ${s.cls}">${escapeHtml(s.label)}</span>`;
}
function fmtDate(ts) {
    if (!ts) return '—';
    return new Date(ts).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
}
function fmtDateShort(ts) {
    if (!ts) return '—';
    return new Date(ts).toLocaleDateString('th-TH', { day:'2-digit', month:'short', year:'2-digit' });
}

function toast(msg, type = 'success') {
    const id = `oad-toast-${Date.now()}`;
    const colors = { success: '#10b981', error: '#ef4444', info: '#3b82f6' };
    const t = document.createElement('div');
    t.id = id;
    t.style.cssText = `position:fixed;bottom:1.5rem;right:1.5rem;z-index:99999;
        background:${colors[type]};color:#fff;padding:0.75rem 1.25rem;
        border-radius:10px;font-size:0.9rem;font-weight:600;
        box-shadow:0 4px 20px rgba(0,0,0,0.2);
        animation:oad-toast-in 0.25s ease;max-width:320px;line-height:1.4;`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => { t.style.animation = 'oad-toast-out 0.25s ease forwards'; setTimeout(() => t.remove(), 300); }, 3000);
}

function skeleton(rows = 5, cols = 4) {
    const cells = Array.from({ length: cols }, () => `<td><div class="oad-skel"></div></td>`).join('');
    const trows = Array.from({ length: rows }, () => `<tr>${cells}</tr>`).join('');
    return `<table class="oad-table"><tbody>${trows}</tbody></table>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// CSS injection 
// ─────────────────────────────────────────────────────────────────────────────
function injectStyles() {
    if (document.getElementById('oad-styles')) return;
    const style = document.createElement('style');
    style.id = 'oad-styles';
    style.textContent = `
/* ── Reset inside dashboard ─────────────────────── */
.oad-dashboard *, .oad-dashboard *::before, .oad-dashboard *::after { box-sizing: border-box; }

/* ── Design tokens (Linked to Global CSS Variables) ── */
.oad-dashboard {
    --oad-bg:        transparent; 
    --oad-surface:   var(--card-bg, #ffffff);
    --oad-surface2:  var(--input-bg, #f8fafc);
    --oad-border:    var(--input-border, #cbd5e1);
    --oad-text:      var(--text-main, #1e293b);
    --oad-muted:     var(--pico-muted-color, #64748b);
    --oad-accent:    var(--primary-blue, #3b82f6);
    --oad-accent2:   var(--pico-primary-hover, #2563eb);
    
    --oad-green:     #10b981;
    --oad-amber:     #f59e0b;
    --oad-red:       #ef4444;
    --oad-blue:      #3b82f6;
    
    --oad-radius:    var(--pico-border-radius, 12px);
    --oad-radius-sm: 8px;
    
    font-family: 'Sarabun', 'Noto Sans Thai', sans-serif;
    background: var(--oad-bg);
    color: var(--oad-text);
    padding: 0;
}

/* ── Layout ─────────────────────────────────────── */
.oad-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid var(--oad-border);
    background: var(--oad-surface);
    gap: 1rem;
    flex-wrap: wrap;
    border-radius: var(--oad-radius) var(--oad-radius) 0 0;
}
.oad-header-title {
    font-size: 1.1rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--oad-text);
}
.oad-header-actions { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }

/* ── Tab bar ─────────────────────────────────────── */
.oad-tabs {
    display: flex;
    gap: 0.25rem;
    padding: 0.75rem 1.5rem 0;
    background: var(--oad-surface);
    border-bottom: 1px solid var(--oad-border);
    overflow-x: auto;
    scrollbar-width: none;
}
.oad-tabs::-webkit-scrollbar { display: none; }
.oad-tab {
    padding: 0.55rem 1.1rem;
    border-radius: var(--oad-radius-sm) var(--oad-radius-sm) 0 0;
    border: none;
    background: transparent;
    color: var(--oad-muted);
    font-size: 0.88rem;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: color 0.15s, background 0.15s;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-family: inherit;
}
.oad-tab:hover { color: var(--oad-text); background: var(--oad-surface2); }
.oad-tab.active {
    color: var(--oad-accent2);
    background: transparent;
    border-bottom: 2px solid var(--oad-accent);
    margin-bottom: -1px;
}
.oad-tab-badge {
    background: var(--oad-red);
    color: #fff;
    border-radius: 99px;
    font-size: 0.7rem;
    padding: 0.1em 0.45em;
    font-weight: 700;
    line-height: 1.4;
}

/* ── Body / panels ──────────────────────────────── */
.oad-body { padding: 1.5rem; }
.oad-panel {
    background: var(--oad-surface);
    border: 1px solid var(--oad-border);
    border-radius: var(--oad-radius);
    padding: 1.25rem;
    margin-bottom: 1.25rem;
    box-shadow: 0 4px 6px rgba(0,0,0,0.02);
}
.oad-panel-title {
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--oad-text);
    margin: 0 0 1rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    justify-content: space-between;
    flex-wrap: wrap;
}

/* ── Stat cards ─────────────────────────────────── */
.oad-stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 1rem;
    margin-bottom: 1.25rem;
}
.oad-stat-card {
    background: var(--oad-surface);
    border: 1px solid var(--oad-border);
    border-radius: var(--oad-radius);
    padding: 1rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    box-shadow: 0 2px 4px rgba(0,0,0,0.02);
}
.oad-stat-value { font-size: 1.8rem; font-weight: 800; line-height: 1; }
.oad-stat-label { font-size: 0.78rem; color: var(--oad-muted); font-weight: 600; }
.oad-stat-sub   { font-size: 0.72rem; color: var(--oad-muted); }

/* ── Toolbar (search + filters) ─────────────────── */
.oad-toolbar {
    display: flex;
    gap: 0.6rem;
    margin-bottom: 1rem;
    flex-wrap: wrap;
    align-items: center;
}
.oad-search, .oad-select {
    flex: 1;
    min-width: 180px;
    padding: 0.5rem 0.9rem;
    border-radius: var(--oad-radius-sm);
    border: 1px solid var(--oad-border);
    background: var(--oad-surface2);
    color: var(--oad-text);
    font-size: 0.88rem;
    font-family: inherit;
    outline: none;
    transition: border-color 0.15s;
}
.oad-search:focus, .oad-select:focus { border-color: var(--oad-accent); }
.oad-select { cursor: pointer; flex: 0 1 auto; }

/* ── Table ──────────────────────────────────────── */
.oad-table-wrap { overflow-x: auto; border-radius: var(--oad-radius-sm); }
.oad-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.88rem;
}
.oad-table th {
    padding: 0.65rem 0.9rem;
    text-align: left;
    font-weight: 700;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--oad-muted);
    border-bottom: 1px solid var(--oad-border);
    white-space: nowrap;
    background: rgba(124,132,156,0.05); 
    position: sticky;
    top: 0;
    z-index: 1;
}
.oad-table td {
    padding: 0.65rem 0.9rem;
    border-bottom: 1px solid var(--oad-border);
    vertical-align: middle;
    color: var(--oad-text);
}
.oad-table tr:last-child td { border-bottom: none; }
.oad-table tr:hover td { background: var(--oad-surface2); }
.oad-table .nowrap { white-space: nowrap; }
.oad-table .actions { display: flex; gap: 0.4rem; align-items: center; flex-wrap: nowrap; }

/* ── Buttons ────────────────────────────────────── */
.oad-btn {
    padding: 0.4rem 0.85rem;
    border-radius: var(--oad-radius-sm);
    border: none;
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s, transform 0.1s;
    font-family: inherit;
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
}
.oad-btn:active { transform: scale(0.96); }
.oad-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.oad-btn-primary  { background: var(--oad-accent);  color: #fff; }
.oad-btn-green    { background: var(--oad-green);   color: #fff; }
.oad-btn-red      { background: var(--oad-red);     color: #fff; }
.oad-btn-amber    { background: var(--oad-amber);   color: #fff; }
.oad-btn-ghost    { background: transparent; border: 1px solid var(--oad-border); color: var(--oad-text); }
.oad-btn-ghost:hover { background: var(--oad-surface2); }
.oad-btn-icon { padding: 0.4rem; width: 2rem; height: 2rem; justify-content: center; }
.oad-btn-approve { background: #059669; color: #fff; border: none; }
.oad-btn-approve:hover { background: #047857; }
.oad-btn-reject-outline { background: transparent; color: #ef4444; border: 1.5px solid #ef4444; }
.oad-btn-reject-outline:hover { background: rgba(239,68,68,0.07); }
.oad-approval-actions { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }

/* ── Badges ─────────────────────────────────────── */
.oad-badge {
    display: inline-block;
    padding: 0.2em 0.6em;
    border-radius: 99px;
    font-size: 0.75rem;
    font-weight: 700;
    white-space: nowrap;
}
.oad-badge-green  { background: rgba(16,185,129,0.15); color: #10b981; }
.oad-badge-red    { background: rgba(239,68,68,0.15);  color: #ef4444; }
.oad-badge-amber  { background: rgba(245,158,11,0.15); color: #f59e0b; }
.oad-badge-orange { background: rgba(249,115,22,0.15); color: #f97316; }
.oad-badge-blue   { background: rgba(59,130,246,0.15); color: #60a5fa; }
.oad-badge-gray   { background: rgba(124,132,156,0.12);color: var(--oad-muted); }
.oad-badge-purple { background: rgba(99,102,241,0.15); color: var(--oad-accent2); }

/* ── Form input (แท็บงาน/การแสดง) ──────────────── */
.oad-input {
    width: 100%;
    padding: 0.55rem 0.7rem;
    margin-top: 0.25rem;
    border-radius: 8px;
    border: 1px solid var(--oad-border);
    background: var(--oad-surface2);
    color: var(--oad-text);
    font-size: 0.9rem;
    font-family: inherit;
}
.oad-input:focus { outline: 2px solid var(--oad-accent); outline-offset: -1px; }

/* ── Avatar ─────────────────────────────────────── */
.oad-avatar {
    width: 32px; height: 32px;
    border-radius: 50%;
    object-fit: cover;
    border: 1.5px solid var(--oad-border);
    flex-shrink: 0;
    background: var(--oad-surface2);
}
.oad-user-cell { display: flex; align-items: center; gap: 0.6rem; min-width: 0; }
.oad-user-name { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* ── Skeleton ───────────────────────────────────── */
.oad-skel {
    height: 1.1em;
    border-radius: 4px;
    background: linear-gradient(90deg,var(--oad-surface2) 25%,var(--oad-border) 50%,var(--oad-surface2) 75%);
    background-size: 400% 100%;
    animation: oad-shimmer 1.4s infinite;
}
@keyframes oad-shimmer { 0%{background-position:100% 0} 100%{background-position:-100% 0} }

/* ── Empty state ────────────────────────────────── */
.oad-empty {
    text-align: center;
    padding: 3rem 1rem;
    color: var(--oad-muted);
    font-size: 0.9rem;
}
.oad-empty-icon { font-size: 2.5rem; display: block; margin-bottom: 0.75rem; }

/* ── Tabs visibility ─────────────────────────────── */
.oad-tab-panel { display: none; }
.oad-tab-panel.active { display: block; }

/* ── Charts ─────────────────────────────────────── */
.oad-chart-grid {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 1.25rem;
    margin-bottom: 1.25rem;
}
@media (max-width: 768px) { .oad-chart-grid { grid-template-columns: 1fr; } }

/* ── Toast animations ───────────────────────────── */
@keyframes oad-toast-in  { from{opacity:0;transform:translateY(1rem)} to{opacity:1;transform:none} }
@keyframes oad-toast-out { from{opacity:1;transform:none} to{opacity:0;transform:translateY(0.5rem)} }

/* ── Pagination ─────────────────────────────────── */
.oad-pagination {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 0.4rem;
    margin-top: 0.75rem;
    font-size: 0.84rem;
    color: var(--oad-muted);
}
.oad-page-info { margin: 0 0.5rem; }

/* ── Refresh indicator ──────────────────────────── */
.oad-live-dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    background: var(--oad-green);
    display: inline-block;
    animation: oad-pulse 2s infinite;
}
@keyframes oad-pulse {
    0%,100% { opacity: 1; box-shadow: 0 0 0 0 rgba(16,185,129,0.4); }
    50%      { opacity: 0.7; box-shadow: 0 0 0 5px rgba(16,185,129,0); }
}

/* ── Two-column layout for overview panels ──────── */
.oad-overview-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.25rem;
}
@media (max-width: 900px) { .oad-overview-grid { grid-template-columns: 1fr; } }
`;
    document.head.appendChild(style);
}

// ─────────────────────────────────────────────────────────────────────────────
// Shell HTML
// ─────────────────────────────────────────────────────────────────────────────
// admin-dashboard.js (v4) - แทนที่ฟังก์ชัน buildShell() ทั้งหมด

function buildShell() {
    return `
<div class="oad-dashboard" id="oad-root">
    <div class="oad-header">
        <div class="oad-header-title">
            <span class="oad-live-dot"></span>
            แผงควบคุมผู้ดูแลระบบ
        </div>
        <div class="oad-header-actions">
            <div class="oad-bell-wrap" id="oad-bell-wrap">
                <button class="oad-bell" id="oad-bell-btn" title="แจ้งเตือนผู้ดูแล" aria-label="แจ้งเตือนผู้ดูแล">
                    🔔
                    <span class="oad-bell-badge hidden" id="oad-bell-badge">0</span>
                </button>
                <div class="oad-notif-panel" id="oad-notif-panel" role="dialog" aria-label="กล่องข้อความผู้ดูแล">
                    <div class="oad-notif-header">
                        <h4>🔔 แจ้งเตือนผู้ดูแล</h4>
                        <button id="oad-notif-ack-all" title="อ่านทั้งหมด">อ่านหมด</button>
                    </div>
                    <div class="oad-notif-filters" id="oad-notif-filters">
                        <button class="oad-notif-pill active" data-filter="all">ทั้งหมด</button>
                        <button class="oad-notif-pill" data-filter="critical">🔴 ด่วน</button>
                        <button class="oad-notif-pill" data-filter="warning">🟠 เตือน</button>
                        <button class="oad-notif-pill" data-filter="security">🛡️ ความปลอดภัย</button>
                        <button class="oad-notif-pill" data-filter="operation">📋 งาน</button>
                    </div>
                    <div class="oad-notif-list" id="oad-notif-list">
                        <div class="oad-notif-empty">กำลังโหลด...</div>
                    </div>
                </div>
            </div>
            <button onclick="window.__oadLogout()" style="color: var(--pico-del-color); border:none; background:transparent; cursor:pointer;">
                <span>🚪 ออกจากระบบ</span>
            </button>
            <button class="oad-btn oad-btn-ghost" id="oad-refresh-btn">🔄 รีเฟรช</button>
            <button class="oad-btn oad-btn-red" id="oad-yearly-reset-btn">⚠️ รีเซ็ตประจำปี</button>
        </div>
    </div>

    <div class="oad-tabs" id="oad-tabs">
        <button class="oad-tab active" data-tab="overview">📊 ภาพรวม</button>
        <button class="oad-tab" data-tab="borrows">📦 การยืม <span class="oad-tab-badge hidden" id="oad-pending-badge">0</span></button>
        <button class="oad-tab" data-tab="events">🎭 งาน/การแสดง <span class="oad-tab-badge hidden" id="oad-events-badge">0</span></button>
        <button class="oad-tab" data-tab="uniforms">👔 ชุดวงโยธวาทิต</button>
        <button class="oad-tab" data-tab="repairs">🔧 แจ้งซ่อม <span class="oad-tab-badge hidden" id="oad-repair-badge">0</span></button>
        <button class="oad-tab" data-tab="users">👤 ผู้ใช้</button>
        <button class="oad-tab" data-tab="recovery">🔄 กู้คืนบัญชี <span class="oad-tab-badge hidden" id="oad-recovery-badge">0</span></button>
        <button class="oad-tab" data-tab="rankings">⏱️ เวลาซ้อม</button>
        <button class="oad-tab" data-tab="config">⚙️ ตั้งค่า EXP</button>
        <button class="oad-tab" data-tab="instruments">🎺 เครื่องดนตรี</button>
        <button class="oad-tab" data-tab="knowledge">📚 คลังความรู้</button>
        <button class="oad-tab" data-tab="notifications">🔔 แจ้งเตือน</button>
        <button class="oad-tab" data-tab="bosses">🐉 ล่าบอส <span class="oad-tab-badge hidden" id="oad-boss-badge">0</span></button>
        <button class="oad-tab" data-tab="history">📜 ประวัติ</button>
        <button class="oad-tab" data-tab="loops">🎛️ เพลง Launchpad</button>
    </div>

    <div class="oad-body">

        <div class="oad-tab-panel active" id="oad-panel-overview">
            
            <div id="oad-stats-row" class="oad-stats-grid"></div>

            <div class="oad-panel-title" style="margin-top: 1rem; color: var(--oad-text);">⚡ งานที่ต้องจัดการด่วน (Action Items)</div>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.25rem; margin-bottom: 2rem;">
                <div class="oad-panel" style="margin-bottom: 0;">
                    <div class="oad-panel-title">📬 รออนุมัติ <span style="font-size:0.7rem; color:var(--oad-muted); font-weight:normal; margin-left:auto;">(ล่าสุด)</span></div>
                    <div id="oad-overview-pending"></div>
                </div>
                <div class="oad-panel" style="margin-bottom: 0;">
                    <div class="oad-panel-title">🛠️ คิวแจ้งซ่อม <span style="font-size:0.7rem; color:var(--oad-muted); font-weight:normal; margin-left:auto;">(ล่าสุด)</span></div>
                    <div id="oad-overview-repairs"></div>
                </div>
                <div class="oad-panel" style="margin-bottom: 0;">
                    <div class="oad-panel-title">🚫 ถูกบล็อก <span style="font-size:0.7rem; color:var(--oad-muted); font-weight:normal; margin-left:auto;">(ล่าสุด)</span></div>
                    <div id="oad-overview-blocked"></div>
                </div>
            </div>

            <hr style="border: 0; border-top: 1px dashed var(--oad-border); margin: 2rem 0; opacity: 0.5;">

            <div class="oad-panel-title" style="margin-top: 0.75rem; color: var(--oad-text);">🎯 สถิติและผลสัมฤทธิ์ระบบ (Analytics & KPIs)</div>
            <div id="oad-kpi-row" class="oad-stats-grid" style="grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); margin-bottom: 1.25rem;"></div>
            
            <div class="oad-chart-grid" style="margin-bottom: 1.25rem;">
                <div class="oad-panel" style="margin-bottom: 0;">
                    <div class="oad-panel-title">
                        📈 ความเคลื่อนไหว
                        <select class="oad-select" id="oad-timeline-filter" style="font-size:0.8rem; flex:0 1 auto; min-width:120px;">
                            <option value="60-1">1 ชั่วโมง</option>
                            <option value="720-30" selected>12 ชั่วโมง</option>
                            <option value="1440-60">24 ชั่วโมง</option>
                        </select>
                    </div>
                    <div style="position:relative;height:240px;"><canvas id="oad-timeline-chart"></canvas></div>
                </div>
                <div class="oad-panel" style="margin-bottom: 0;">
                    <div class="oad-panel-title">🍩 ประเภทที่ยืมบ่อย</div>
                    <div style="position:relative;height:240px;"><canvas id="oad-donut-chart"></canvas></div>
                </div>
            </div>
            
            <div class="oad-panel" style="margin-bottom: 1.25rem;">
                <div class="oad-panel-title">🔥 ช่วงเวลาที่มีการใช้งานหนาแน่น (Heat Map)</div>
                <div id="oad-heatmap-container" style="height: 60px; display: grid; grid-template-columns: repeat(24, 1fr); gap: 2px;"></div>
                <div style="display: flex; justify-content: space-between; font-size: 0.7rem; color: var(--oad-muted); margin-top: 5px;">
                    <span>00:00</span><span>12:00</span><span>23:00</span>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.25rem;">
                <div class="oad-panel" style="margin-bottom: 0;">
                    <div class="oad-panel-title">⏱️ Top Practice Time (ซ้อมนานสุด)</div>
                    <div id="oad-top-practicers-list"></div>
                </div>
                <div class="oad-panel" style="margin-bottom: 0;">
                    <div class="oad-panel-title">🏆 Top Borrowers (ยืมบ่อยสุด)</div>
                    <div id="oad-top-borrowers-list"></div>
                </div>
                <div class="oad-panel" style="margin-bottom: 0;">
                    <div class="oad-panel-title">🏅 Top Badges (เหรียญเยอะสุด)</div>
                    <div id="oad-top-badges-list"></div>
                </div>
            </div>

        </div>

        <div class="oad-tab-panel" id="oad-panel-borrows">
            <div class="oad-panel">
                <div class="oad-panel-title">
                    📦 การยืมทั้งหมด
                    <select class="oad-select" id="oad-borrow-view-select" style="flex:0 1 auto; min-width:180px;">
                        <option value="active">🔴 กำลังยืมอยู่</option>
                        <option value="pending">📬 รออนุมัติ</option>
                        <option value="history">📜 ประวัติทั้งหมด (ตาราง)</option>
                    </select>
                </div>
                <div class="oad-toolbar">
                    <input class="oad-search" id="oad-borrow-search" placeholder="ค้นหาชื่อ / เครื่องดนตรี...">
                    <select class="oad-select" id="oad-borrow-status-filter">
                        <option value="all">ทุกสถานะ</option>
                        <option value="active">กำลังยืม</option>
                        <option value="pending">รออนุมัติ</option>
                        <option value="overdue">เกินกำหนด</option>
                    </select>
                </div>
                <div class="oad-table-wrap" id="oad-borrow-table-wrap">
                    ${skeleton(5, 5)}
                </div>
                <div class="oad-pagination" id="oad-borrow-pagination"></div>
            </div>
        </div>

        <div class="oad-tab-panel" id="oad-panel-repairs">
            <div class="oad-panel">
                <div class="oad-panel-title">🔧 รายการแจ้งซ่อม</div>
                <div class="oad-toolbar">
                    <input class="oad-search" id="oad-repair-search" placeholder="ค้นหาเครื่องดนตรี / ผู้แจ้ง...">
                    <select class="oad-select" id="oad-repair-status-filter">
                        <option value="active" selected>รายการที่ยังไม่เสร็จ</option>
                        <option value="all">ทุกสถานะ (รวมประวัติ)</option>
                        <option value="แจ้งซ่อม">แจ้งซ่อม</option>
                        <option value="รอซ่อม">รอซ่อม (ยืมได้)</option>
                        <option value="กำลังซ่อม">กำลังซ่อม</option>
                        <option value="ซ่อมเสร็จสิ้น">ซ่อมเสร็จ</option>
                        <option value="ไม่สามารถซ่อมได้">ซ่อมไม่ได้</option>
                    </select>
                </div>
                <div class="oad-table-wrap" id="oad-repair-table-wrap">
                    ${skeleton(4, 5)}
                </div>
            </div>
        </div>

        <div class="oad-tab-panel" id="oad-panel-users">
            <div class="oad-panel">
                <div class="oad-panel-title">
                    🎖 ตำแหน่งหัวหน้า
                    <button class="oad-btn oad-btn-approve" id="oad-staff-add" style="margin-left:auto;">➕ แต่งตั้ง</button>
                </div>
                <p style="font-size:0.85rem; color:var(--oad-muted); margin-bottom:1rem;">
                    หัวหน้า <strong>ดูข้อมูลได้อย่างเดียว + ส่งใบตรวจให้ครู</strong> —
                    ไม่มีสิทธิ์คืนของ ปิดงาน หรือบล็อกใคร ทุกอย่างที่มีผลจริงยังอยู่ที่ครูคนเดียว
                </p>
                <div class="oad-table-wrap" id="oad-staff-wrap"></div>
            </div>

            <div class="oad-panel">
                <div class="oad-panel-title">
                    📋 ใบตรวจจากหัวหน้า
                    <span class="oad-tab-badge hidden" id="oad-staffrep-badge" style="margin-left:.5rem;">0</span>
                </div>
                <div class="oad-table-wrap" id="oad-staffrep-wrap"></div>
            </div>

            <div class="oad-panel">
                <div class="oad-panel-title">
                    👤 จัดการผู้ใช้
                    <button class="oad-btn oad-btn-primary" onclick="window.__oadManageBadgeDefs()" style="margin-left:auto;">🏅 จัดการเงื่อนไขเหรียญตรา</button>
                </div>
                <div class="oad-toolbar">
                    <input class="oad-search" id="oad-user-search" placeholder="ค้นหาชื่อ / รหัสนักเรียน...">
                    <select class="oad-select" id="oad-user-group-filter">
                        <option value="all">ทุกกลุ่ม</option>
                        <option value="student">นักเรียนทั่วไป</option>
                        <option value="club">สมาชิกชุมนุม</option>
                        <option value="teacher">ครูอาจารย์</option>
                        <option value="guest">บุคคลทั่วไป</option>
                    </select>
                    <select id="oad-user-class-filter" class="oad-select" style="display:none;">
                        <option value="all">ทุกห้องเรียน</option>
                    </select>
                    <select class="oad-select" id="oad-user-status-filter">
                        <option value="all">ทุกสถานะ</option>
                        <option value="normal">ปกติ</option>
                        <option value="blocked">ถูกบล็อก</option>
                        <option value="closed">ปิดบัญชี</option>
                    </select>
                    <select class="oad-select" id="oad-user-kit-filter" title="เฉพาะสมาชิกชุมนุม">
                        <option value="all">👔 ชุด: ทั้งหมด</option>
                        <option value="has">✅ เลือกชุดแล้ว</option>
                        <option value="none">⬜ ยังไม่เลือกชุด</option>
                    </select>
                </div>
                <div id="oad-kit-status-summary" style="font-size:.85rem;color:var(--oad-muted);margin-bottom:.6rem;"></div>
                <div class="oad-table-wrap" id="oad-user-table-wrap">
                    ${skeleton(6, 5)}
                </div>
            </div>
        </div>

        <div class="oad-tab-panel" id="oad-panel-recovery">
            <div class="oad-panel">
                <div class="oad-panel-title">
                    🔄 คำขอกู้คืนบัญชี (นักเรียนเก่าลืม email)
                    <button class="oad-btn oad-btn-ghost" id="oad-recovery-refresh" style="margin-left:auto;">🔄 รีเฟรช</button>
                </div>
                <div class="oad-toolbar">
                    <select class="oad-select" id="oad-recovery-status-filter">
                        <option value="pending" selected>⏳ รออนุมัติ</option>
                        <option value="approved">✅ อนุมัติแล้ว</option>
                        <option value="rejected">❌ ปฏิเสธแล้ว</option>
                        <option value="all">ทั้งหมด</option>
                    </select>
                </div>
                <div class="oad-table-wrap" id="oad-recovery-table-wrap">
                    ${skeleton(4, 5)}
                </div>
            </div>
        </div>

        <div class="oad-tab-panel" id="oad-panel-config">
            <div class="oad-panel">
                <div class="oad-panel-title">⚙️ ตั้งค่าเกณฑ์การให้ EXP อัตโนมัติ</div>
                <div id="oad-config-settings-wrap" style="margin-bottom: 2rem;"></div>
                
                <div class="oad-panel-title" style="border-top: 1px solid var(--oad-border); padding-top: 1.5rem;">
                    📅 กฎ EXP พิเศษตามช่วงเวลา
                    <button class="oad-btn oad-btn-primary" onclick="window.__oadAddRule()" style="margin-left:auto;">+ เพิ่มกฎใหม่</button>
                </div>
                <div id="oad-config-rules-wrap"></div>
            </div>
        </div>

        <div class="oad-tab-panel" id="oad-panel-rankings">
            <div class="oad-panel">
                <div class="oad-panel-title">
                    📊 อันดับและสถิติการฝึกซ้อม
                    <button id="oad-reset-practice-btn" class="oad-btn oad-btn-red" style="margin-left:auto;">⚠️ รีเซ็ตเวลาซ้อมทั้งหมด</button>
                </div>
                <div class="oad-toolbar">
                    <select class="oad-select" id="oad-rank-type-filter" style="min-width: 150px;">
                        <option value="club" selected>⭐ สมาชิกชุมนุม</option>
                        <option value="class">🏫 รายห้องเรียน</option>
                    </select>
                    <select class="oad-select hidden" id="oad-rank-class-filter" style="min-width: 150px;">
                        <option value="all">-- เลือกห้องเรียน --</option>
                    </select>
                </div>
                <div class="oad-table-wrap" id="oad-rank-table-wrap">
                    ${skeleton(5, 4)}
                </div>
            </div>
        </div>

        <div class="oad-tab-panel" id="oad-panel-instruments">
            <div class="oad-panel">
                <div class="oad-panel-title">
                    🎼 จัดกลุ่มเครื่องดนตรีเข้ากลุ่มของวง
                    <span class="oad-tab-badge hidden" id="oad-section-badge" style="margin-left:.5rem;">0</span>
                </div>
                <p style="font-size:0.85rem; color:var(--oad-muted); margin-bottom:1rem;">
                    จับคู่ <strong>ประเภทเครื่องดนตรี</strong> ที่มีอยู่จริงในคลัง เข้ากับ <strong>กลุ่มของวง</strong>
                    (ทองเหลือง / ลมไม้ / กระทบ / คัลเลอร์การ์ด)<br>
                    ใช้เพื่อให้ <strong>หัวหน้ากลุ่มเครื่อง</strong> เห็นเฉพาะของในกลุ่มตัวเอง —
                    เครื่องที่ไม่ได้อยู่ในวงโยธวาทิต (เช่น เครื่องสาย) เว้นว่างไว้ได้
                </p>
                <div class="oad-table-wrap" id="oad-section-map"></div>
            </div>

            <div class="oad-panel">
                <div class="oad-panel-title">
                    🎺 คลังเครื่องดนตรี
                    <div style="margin-left:auto; display:flex; gap:0.5rem;">
                        <button class="oad-btn oad-btn-ghost" onclick="window.__oadExportAllQR()">🖨️ พิมพ์ QR</button>
                        <button class="oad-btn oad-btn-primary" id="oad-add-instrument-btn">+ เพิ่มใหม่</button>
                    </div>
                </div>
                <div class="oad-toolbar">
                    <input class="oad-search" id="oad-inst-search" placeholder="ค้นหาชื่อ / ประเภท / ผู้ยืม...">
                    <select class="oad-select" id="oad-inst-type-filter" style="min-width:140px;">
                        <option value="all">ทุกประเภท</option>
                    </select>
                    <select class="oad-select" id="oad-inst-condition-filter" style="min-width:130px;">
                        <option value="all">ทุกสภาพ</option>
                    </select>
                    <select class="oad-select" id="oad-inst-status-filter">
                        <option value="all">ทุกสถานะ</option>
                        <option value="พร้อมใช้งาน">พร้อมใช้งาน</option>
                        <option value="ถูกยืมอยู่">ถูกยืมอยู่</option>
                        <option value="ชำรุด">ชำรุด</option>
                    </select>
                    <select class="oad-select" id="oad-inst-sort" style="min-width:140px;">
                        <option value="default">เรียง: ค่าเริ่มต้น</option>
                        <option value="name-asc">ชื่อ A→Z</option>
                        <option value="name-desc">ชื่อ Z→A</option>
                        <option value="recent">เพิ่มล่าสุด</option>
                        <option value="condition-bad">สภาพแย่ → ดี</option>
                    </select>
                    <button class="oad-btn oad-btn-ghost" id="oad-inst-clear-filters" title="ล้างตัวกรองทั้งหมด">↺ ล้าง</button>
                </div>
                <div class="oad-table-wrap" id="oad-inst-table-wrap">
                    ${skeleton(5, 5)}
                </div>
            </div>
        </div>

        <div class="oad-tab-panel" id="oad-panel-history">
            <div class="oad-panel">
                <div class="oad-panel-title">📜 ประวัติการยืม-คืน</div>
                <div class="oad-toolbar">
                    <input class="oad-search" id="oad-hist-search" placeholder="ค้นหา...">
                    <select class="oad-select" id="oad-hist-status-filter">
                        <option value="all">ทุกสถานะ</option>
                        <option value="returned">คืนแล้ว</option>
                        <option value="active">ยังไม่คืน</option>
                        <option value="overdue">เกินกำหนด</option>
                    </select>
                </div>
                <div class="oad-table-wrap" id="oad-hist-table-wrap">
                    ${skeleton(8, 4)}
                </div>
                <div class="oad-pagination" id="oad-hist-pagination"></div>
            </div>
        </div>

        <div class="oad-tab-panel" id="oad-panel-notifications">
            <div class="oad-panel">
                <div class="oad-panel-title">
                    🔔 จัดการแจ้งเตือน (ประกาศ + ตั้งเวลาแจ้งซ้อม)
                    <button class="oad-btn oad-btn-primary" onclick="window.__oadNewScheduledNotif()" style="margin-left:auto;">+ สร้างแจ้งเตือน</button>
                </div>
                <div style="display:flex; gap:0.5rem; margin-bottom:1rem; flex-wrap:wrap;">
                    <button class="oad-btn oad-btn-amber" onclick="window.__oadAnnounceNow()">📣 ส่งประกาศทันที</button>
                    <button class="oad-btn oad-btn-ghost" onclick="window.__oadDispatchNow()">▶ Run Dispatcher</button>
                </div>
                <div id="oad-sched-notif-wrap"></div>
            </div>
        </div>

        <div class="oad-tab-panel" id="oad-panel-knowledge">
            <div class="oad-panel">
                <div class="oad-panel-title">
                    📚 จัดการคลังความรู้ (วิดีโอ/บทความ)
                    <button class="oad-btn oad-btn-primary" onclick="window.__oadAddKnowledge()" style="margin-left:auto;">+ เพิ่มเนื้อหาใหม่</button>
                </div>
                <div class="oad-toolbar">
                    <input class="oad-search" id="oad-know-search" placeholder="ค้นหาชื่อเรื่อง / ประเภท...">
                    <select class="oad-select" id="oad-know-status-filter">
                        <option value="all">ทุกสถานะ</option>
                        <option value="pending">⏳ รอตรวจสอบ</option>
                        <option value="approved">✅ อนุมัติแล้ว</option>
                    </select>
                </div>
                <div class="oad-table-wrap" id="oad-know-table-wrap"></div>
            </div>
        </div>

        <div class="oad-tab-panel" id="oad-panel-bosses">
            <div id="oad-boss-video-reviews" style="display:none;"></div>
            <div class="oad-panel">
                <div class="oad-panel-title">
                    🐉 บริหารจัดการบอส & ห้องสอบ (Boss Raids)
                    <button class="oad-btn oad-btn-primary" onclick="window.__oadAddBoss()" style="margin-left:auto;">+ สร้างบอสใหม่</button>
                </div>

                <div id="oad-boss-lobby-area" style="margin-bottom: 1.5rem; display: none; background: var(--oad-surface2); padding: 1.5rem; border-radius: var(--oad-radius); border: 2px dashed var(--oad-accent);"></div>

                <div class="oad-table-wrap" id="oad-boss-table-wrap"></div>
            </div>
        </div>

        <div class="oad-tab-panel" id="oad-panel-events">
            <div class="oad-panel">
                <div class="oad-panel-title">📅 เพิ่มกิจกรรม</div>
                <p style="font-size:0.85rem; color:var(--oad-muted); margin-bottom:1rem;">
                    กรอกที่นี่ที่เดียว — ขึ้นทั้งตารางในแอปและปฏิทิน Google ที่นักเรียน subscribe ไว้<br>
                    ติ๊ก "เบิกของ" เฉพาะงานที่ต้องเบิกจริง (ซ้อมปกติไม่ต้องติ๊ก จะได้ไม่ไปโผล่ตอนเด็กสแกนยืมเครื่อง)
                </p>
                <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:.75rem; align-items:end;">
                    <div>
                        <label style="font-size:.8rem; font-weight:700;">ประเภท*</label>
                        <select id="oad-ev-type" class="oad-input">
                            <option value="practice">🎵 นัดซ้อม</option>
                            <option value="performance" selected>🎭 ออกงาน</option>
                            <option value="camp">⛺ เข้าค่าย</option>
                            <option value="meeting">📋 ประชุม</option>
                            <option value="other">📌 อื่นๆ</option>
                        </select>
                    </div>
                    <div>
                        <label style="font-size:.8rem; font-weight:700;">ชื่อกิจกรรม*</label>
                        <input id="oad-ev-name" class="oad-input" placeholder="เช่น แห่เทียนพรรษา">
                    </div>
                    <div>
                        <label style="font-size:.8rem; font-weight:700;">📍 สถานที่</label>
                        <input id="oad-ev-loc" class="oad-input" placeholder="เช่น วัดกลาง">
                    </div>
                    <div>
                        <label style="font-size:.8rem; font-weight:700;">วันที่จัดงาน*</label>
                        <input id="oad-ev-date" type="date" class="oad-input">
                    </div>
                    <div>
                        <label style="font-size:.8rem; font-weight:700;">⏰ เริ่ม</label>
                        <input id="oad-ev-start" type="time" class="oad-input" value="08:00">
                    </div>
                    <div>
                        <label style="font-size:.8rem; font-weight:700;">⏱️ เลิก</label>
                        <input id="oad-ev-end" type="time" class="oad-input" value="12:00">
                    </div>
                    <div id="oad-ev-due-wrap">
                        <label style="font-size:.8rem; font-weight:700;">กำหนดคืนของ</label>
                        <input id="oad-ev-due" type="datetime-local" class="oad-input">
                    </div>
                    <div>
                        <label style="font-size:.8rem; font-weight:700;">เปิดให้ใคร</label>
                        <select id="oad-ev-open" class="oad-input">
                            <option value="club">สมาชิกชุมนุม</option>
                            <option value="all">ทุกคน</option>
                        </select>
                    </div>
                </div>
                <div style="display:flex; gap:1.25rem; flex-wrap:wrap; margin:.9rem 0;">
                    <label style="font-size:.85rem;"><input type="checkbox" id="oad-ev-inst"> 🎺 เบิกเครื่องดนตรี</label>
                    <label style="font-size:.85rem;"><input type="checkbox" id="oad-ev-uni"> 👔 เบิกชุด</label>
                    <label style="font-size:.85rem;"><input type="checkbox" id="oad-ev-cal" checked> 📅 แสดงในปฏิทิน</label>
                </div>

                <div style="margin:.9rem 0;">
                    <label style="font-size:.8rem; font-weight:700; display:block; margin-bottom:.35rem;">
                        🔔 แจ้งเตือนล่วงหน้า
                    </label>
                    <div style="display:flex; gap:1rem; flex-wrap:wrap; font-size:.85rem;">
                        <label><input type="checkbox" class="oad-ev-rem" value="20160"> 2 สัปดาห์</label>
                        <label><input type="checkbox" class="oad-ev-rem" value="10080"> 1 สัปดาห์</label>
                        <label><input type="checkbox" class="oad-ev-rem" value="4320"> 3 วัน</label>
                        <label><input type="checkbox" class="oad-ev-rem" value="1440" checked> 1 วัน</label>
                        <label><input type="checkbox" class="oad-ev-rem" value="120" checked> 2 ชม.</label>
                        <label><input type="checkbox" class="oad-ev-rem" value="30"> 30 นาที</label>
                    </div>
                    <p style="font-size:.75rem;color:var(--oad-muted);margin:.35rem 0 0;">
                        ตั้งงานล่วงหน้าเป็นเดือนได้ ระบบจะเตือนตามจังหวะที่ติ๊กไว้เอง
                    </p>
                </div>

                <div style="display:flex; gap:.6rem; flex-wrap:wrap;">
                    <button class="oad-btn oad-btn-approve" id="oad-ev-create">📢 ประกาศเลย</button>
                    <button class="oad-btn" id="oad-ev-draft">📝 บันทึกเป็นร่าง</button>
                    <button class="oad-btn" id="oad-ev-quick">⚡ ซ้อมวันนี้ (13:00–16:00)</button>
                </div>
                <p style="font-size:.78rem;color:var(--oad-muted);margin:.6rem 0 0;">
                    <strong>ร่าง</strong> = วางแผนไว้ก่อน นักเรียนยังไม่เห็น และยังไม่ขึ้นปฏิทิน · กด "ประกาศ" ในตารางเมื่อพร้อม
                </p>
            </div>

            <div class="oad-panel">
                <div class="oad-panel-title">
                    📆 ซิงก์เข้าปฏิทินเดิมของโรงเรียน
                    <span id="oad-gcal-status" style="margin-left:auto;font-size:.8rem;font-weight:400;color:var(--oad-muted);"></span>
                </div>
                <p style="font-size:0.85rem; color:var(--oad-muted); margin-bottom:.8rem;">
                    เขียนกิจกรรมเข้า<strong>ปฏิทินเดิม</strong>ที่นักเรียนใช้อยู่โดยตรง — ไม่ต้องสร้างปฏิทินใหม่<br>
                    แก้ในแอปแล้วปฏิทินตามทันที · ลบในแอปแล้วปฏิทินก็ลบตาม
                </p>
                <div style="display:flex; gap:.6rem; flex-wrap:wrap; align-items:center; margin-bottom:1.2rem;">
                    <button class="oad-btn oad-btn-approve" id="oad-gcal-sync">🔄 ซิงก์เดี๋ยวนี้</button>
                    <span id="oad-gcal-hint" style="font-size:.8rem;color:var(--oad-muted);"></span>
                </div>

                <details style="margin-bottom:1.2rem;">
                    <summary style="cursor:pointer;font-size:.87rem;font-weight:700;">⚙️ วิธีตั้งค่าครั้งแรก (ทำครั้งเดียว)</summary>
                    <ol style="font-size:.83rem;color:var(--oad-muted);line-height:1.9;margin:.6rem 0 0;padding-left:1.2rem;">
                        <li>ไป <a href="https://console.cloud.google.com/iam-admin/serviceaccounts" target="_blank" rel="noopener">Google Cloud Console → Service Accounts</a> → สร้าง project (ถ้ายังไม่มี) → <strong>Create service account</strong></li>
                        <li>เข้า service account ที่สร้าง → แท็บ <strong>Keys</strong> → Add key → <strong>JSON</strong> → ได้ไฟล์มา</li>
                        <li>เปิด <a href="https://console.cloud.google.com/apis/library/calendar-json.googleapis.com" target="_blank" rel="noopener">Google Calendar API</a> → กด <strong>Enable</strong></li>
                        <li>เปิดปฏิทินเดิมใน Google Calendar → ตั้งค่า → <strong>แชร์กับบุคคลที่ต้องการ</strong> → เพิ่มอีเมลของ service account (ลงท้าย <code>@…iam.gserviceaccount.com</code>) → สิทธิ์ <strong>"แก้ไขกิจกรรม"</strong></li>
                        <li>ไป <a href="https://supabase.com/dashboard/project/qsbvitqxwgtmopjjuxin/settings/functions" target="_blank" rel="noopener">Supabase → Edge Functions → Secrets</a> เพิ่ม 2 ตัว:
                            <ul style="margin:.3rem 0;">
                                <li><code>GCAL_SERVICE_ACCOUNT</code> = เนื้อหาไฟล์ JSON ทั้งก้อน</li>
                                <li><code>GCAL_CALENDAR_ID</code> = อีเมลปฏิทิน (ลงท้าย <code>@group.calendar.google.com</code>)</li>
                            </ul>
                        </li>
                        <li>กลับมากด <strong>ซิงก์เดี๋ยวนี้</strong></li>
                    </ol>
                    <p style="font-size:.8rem;color:#f59e0b;margin:.6rem 0 0;">
                        🔐 ไฟล์ JSON มีกุญแจลับ — วางใน Supabase Secrets เท่านั้น อย่าส่งให้ใครหรือ commit ลง git
                    </p>
                </details>

                <div class="oad-panel-title" style="font-size:.95rem;">📥 หรือใช้ลิงก์ subscribe (สร้างปฏิทินใหม่แยก)</div>
                <p style="font-size:0.85rem; color:var(--oad-muted); margin-bottom:.8rem;">
                    subscribe ครั้งเดียว แล้วกิจกรรมที่เพิ่มในแอปจะขึ้นปฏิทินเอง <strong>ไม่ต้องกรอกซ้ำ</strong><br>
                    Google รีเฟรชช้า (บางครั้งหลายชั่วโมง) — เรื่องด่วนให้พึ่งการแจ้งเตือนของแอปซึ่งถึงใน 10 วินาที
                </p>
                <div style="display:flex; gap:.6rem; flex-wrap:wrap; align-items:center;">
                    <input id="oad-cal-url" class="oad-input" readonly style="flex:1; min-width:260px; font-size:.78rem;">
                    <button class="oad-btn oad-btn-approve" id="oad-cal-copy">📋 คัดลอกลิงก์</button>
                    <button class="oad-btn" id="oad-cal-open">➕ เปิด Google Calendar</button>
                    <button class="oad-btn oad-btn-red" id="oad-cal-reset">🔑 เปลี่ยนลิงก์</button>
                </div>
                <p style="font-size:.78rem; color:var(--oad-muted); margin:.7rem 0 0;">
                    วิธี: Google Calendar → "ปฏิทินอื่นๆ" + → <strong>จากURL</strong> → วางลิงก์ → เพิ่มปฏิทิน<br>
                    ⚠️ ใครมีลิงก์นี้เห็นตารางทั้งหมด — ถ้าหลุด กด "เปลี่ยนลิงก์" แล้วให้ทุกคน subscribe ใหม่
                </p>
            </div>

            <div class="oad-panel">
                <div class="oad-panel-title">📋 งานทั้งหมด</div>
                <div class="oad-table-wrap" id="oad-events-wrap"></div>
            </div>

        </div>

        <div class="oad-tab-panel" id="oad-panel-uniforms">
            <div class="oad-panel">
                <div class="oad-panel-title">👔 ถุงชุด</div>
                <div style="display:flex; gap:.6rem; flex-wrap:wrap; align-items:center; margin-bottom:1rem;">
                    <select id="oad-uni-settype" class="oad-input" style="width:auto; min-width:170px;"></select>
                    <select id="oad-uni-filter" class="oad-input" style="width:auto; min-width:150px;">
                        <option value="all">ทั้งหมด</option>
                        <option value="free">🟢 ชุดว่าง</option>
                        <option value="owned">👤 มีเจ้าของ</option>
                        <option value="inactive">⚠️ เจ้าของจบ/ออกแล้ว</option>
                        <option value="nosize">📏 ไซส์ยังไม่ครบ</option>
                    </select>
                    <button class="oad-btn oad-btn-approve" id="oad-uni-card">🪪 พิมพ์บัตรใส่ถุงสูท</button>
                    <button class="oad-btn" id="oad-uni-sizes">📏 กรอกไซส์</button>
                    <button class="oad-btn" id="oad-uni-newkits">➕ เพิ่มถุงชุด</button>
                    <button class="oad-btn oad-btn-red" id="oad-uni-relinactive">🧹 ปลดชุดของคนที่จบ/ออก</button>
                    <button class="oad-btn" id="oad-uni-refresh">🔄 รีเฟรช</button>
                </div>
                <div id="oad-uni-summary" style="font-size:.85rem; color:var(--oad-muted); margin-bottom:.75rem;"></div>
                <div class="oad-table-wrap" id="oad-uni-kits"></div>
            </div>

            <div class="oad-panel" id="oad-sizegrid-panel">
                <div class="oad-panel-title">
                    📏 กรอกไซส์เร็ว
                    <span id="oad-sizegrid-save" style="margin-left:auto;font-size:.8rem;font-weight:400;color:var(--oad-muted);"></span>
                </div>
                <div style="display:flex; gap:.8rem; flex-wrap:wrap; align-items:center; margin-bottom:.8rem;">
                    <label style="font-size:.87rem;">
                        <input type="checkbox" id="oad-sg-onlyempty"> เฉพาะที่ยังกรอกไม่ครบ
                    </label>
                    <button class="oad-btn" id="oad-sg-jump">⤵️ ไปช่องว่างถัดไป</button>
                    <span id="oad-sg-progress" style="font-size:.87rem;"></span>
                </div>
                <p style="font-size:.8rem;color:var(--oad-muted);margin:0 0 .8rem;">
                    บันทึกอัตโนมัติ · <kbd>Enter</kbd> / <kbd>↓</kbd> ลงช่องล่างคอลัมน์เดิม ·
                    <kbd>↑</kbd> ขึ้น · พิมพ์ตัวเลขหรือตัวอักษรเพื่อเลือกได้เลยไม่ต้องกดเปิด
                </p>
                <div class="oad-table-wrap" id="oad-sizegrid" style="max-height:65vh;overflow:auto;"></div>
            </div>

            <div class="oad-panel">
                <div class="oad-panel-title">📊 รายงานไซส์และสภาพ</div>
                <div id="oad-uni-report"></div>
            </div>

            <div class="oad-panel">
                <div class="oad-panel-title">🔒 ล็อกการเลือกชุด</div>
                <p style="font-size:0.85rem; color:var(--oad-muted); margin-bottom:.8rem;">
                    ปิดสวิตช์นี้เมื่อจัดชุดเสร็จแล้ว เพื่อกันนักเรียนลงเบอร์มั่ว<br>
                    <strong>ชุดที่ยังกรอกไซส์ไม่ครบ ระบบไม่ให้เลือกอยู่แล้ว</strong> — และล็อกรายชุดได้ด้วยปุ่ม 🔓/🔒 ในตารางด้านบน
                </p>
                <label style="display:flex; align-items:center; gap:.6rem; font-size:.95rem;">
                    <input type="checkbox" id="oad-uni-selfselect" style="width:20px;height:20px;">
                    <span>เปิดให้นักเรียนเลือกชุดเองได้</span>
                </label>
            </div>

            <div class="oad-panel">
                <div class="oad-panel-title">🧩 อุปกรณ์ในชุด</div>
                <p style="font-size:0.85rem; color:var(--oad-muted); margin-bottom:1rem;">
                    เพิ่ม/ลดอุปกรณ์ได้เอง ไม่ต้องแก้โปรแกรม — เพิ่มแล้วระบบจะเติมให้ทุกถุงอัตโนมัติ
                    ส่วนการลดจะ<strong>ไม่ลบประวัติ</strong> แค่ปลดออกจากรายการที่ต้องติ๊ก
                </p>
                <div style="display:flex; gap:.6rem; flex-wrap:wrap; margin-bottom:1rem;">
                    <button class="oad-btn oad-btn-approve" id="oad-uni-addpart">➕ เพิ่มอุปกรณ์</button>
                    <button class="oad-btn" id="oad-uni-sync">🔧 เติมชิ้นที่ขาดให้ทุกถุง</button>
                </div>
                <div class="oad-table-wrap" id="oad-uni-parttypes"></div>
            </div>
        </div>

        <div class="oad-tab-panel" id="oad-panel-loops">
            <div class="oad-panel">
                <div class="oad-panel-title">🎛️ รายการเพลง Launchpad ของนักเรียน</div>
                <p style="font-size:0.85rem; color:var(--oad-muted); margin-bottom:1.5rem;">
                    ผู้ดูแลสามารถรับฟังและตรวจสอบเพลงลูปที่นักเรียนสร้างและแชร์ได้ผ่านหน้านี้ ไฟล์เสียงทั้งหมดจะถูกดึงมาจาก Google Drive ของนักเรียนโดยตรง
                </p>
                <div class="oad-table-wrap">
                    <table class="oad-table">
                        <thead>
                            <tr>
                                <th>ชื่อเพลง</th>
                                <th>ผู้แต่ง</th>
                                <th>BPM</th>
                                <th>เครื่องมือเล่นเสียง</th>
                                <th>การจัดการ</th>
                            </tr>
                        </thead>
                        <tbody id="oad-loops-table-body">
                            <tr><td colspan="5" style="text-align:center;">กำลังโหลดข้อมูล...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

    </div>
</div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Data loading
// ─────────────────────────────────────────────────────────────────────────────
async function loadAll() {
    const [
        statsRes, pendingRes, activeRes, repairRes,
        usersRes, instRes, clubRankRes, classRankRes, knowRes,
        bossRes, bossReqRes
    ] = await Promise.allSettled([
        api.getStats(),
        api.getPendingBorrowRequests(),
        api.getActiveBorrows(),
        api.getRepairRequests(),
        adminExt.getUsers(),
        api.getAllInstruments(),
        adminExt.getClubRankings(), 
        adminExt.getClassRankings(), 
        adminExt.getKnowledgeLinks(),
        bossesApi.getAllBosses(),
        bossesApi.getPendingRequests()
    ]);

    if (statsRes.status === 'fulfilled' && !statsRes.value.error)
        state.stats = statsRes.value.data;
    if (pendingRes.status === 'fulfilled' && !pendingRes.value.error)
        state.pendingBorrows = pendingRes.value.data;
    if (activeRes.status === 'fulfilled' && !activeRes.value.error)
        state.borrows = activeRes.value.data;
    if (repairRes.status === 'fulfilled' && !repairRes.value.error) {
        state.repairs = repairRes.value.data || [];
        state.repairHistory = []; // reset cache so repair tab reloads fresh on next render
    }
    if (usersRes.status === 'fulfilled' && !usersRes.value.error)
        state.users = usersRes.value.data;
    if (instRes.status === 'fulfilled' && !instRes.value.error)
        state.instruments = instRes.value.data;
    if (clubRankRes.status === 'fulfilled' && !clubRankRes.value.error)
        state.clubRankings = clubRankRes.value.data;
    if (classRankRes.status === 'fulfilled' && !classRankRes.value.error)
        state.classRankings = classRankRes.value.data;
    if (knowRes && knowRes.status === 'fulfilled' && !knowRes.value.error) 
        state.knowledgeLinks = knowRes.value.data;
    if (bossRes.status === 'fulfilled' && !bossRes.value.error)
        state.bosses = bossRes.value.data;
    if (bossReqRes.status === 'fulfilled' && !bossReqRes.value.error)
        state.bossRequests = bossReqRes.value.data;

    // อัปเดต State.repairs โดยตรง พร้อมดัก Error
    if (repairRes.status === 'fulfilled') {
        if (repairRes.value.error) {
            console.error("❌ [State Sync] Failed to load repairs:", repairRes.value.error);
            state.repairs = [];
        } else {
            state.repairs = repairRes.value.data || [];
            console.log("✅ [State Sync] Repairs loaded:", state.repairs.length, "items");
        }
    }

    const badgeEl = document.getElementById('oad-boss-badge');
    if (badgeEl) {
        badgeEl.textContent = state.bossRequests.length;
        badgeEl.classList.toggle('hidden', state.bossRequests.length === 0);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Realtime subscription 
// ─────────────────────────────────────────────────────────────────────────────
function setupRealtime() {
    state.realtimeChannel = adminExt.setupRealtime({
        onUsers: () => {
            debounceRefresh();
            toast('👤 มีการอัปเดตข้อมูลผู้ใช้!', 'info');
        },
        onBorrow: () => {
            debounceRefresh(); 
            toast('🔔 มีการทำรายการยืม/คืนใหม่!', 'info');
        },
        onRepair: () => {
            debounceRefresh();
            toast('🛠️ มีการแจ้งซ่อมใหม่!', 'warning');
        },
        onKnowledge: () => {
            debounceRefresh(); 
            toast('📚 มีการอัปเดตคลังความรู้ใหม่!', 'info');
        }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Action handlers — exposed on window for onclick attributes
// ─────────────────────────────────────────────────────────────────────────────
function registerWindowActions() {
    const refreshUI = async () => {
        await refreshDirtyData(); 
        renderActiveTab();       
        updateBadges();          
    };

    window.__oadApprove = async (logId, isApproved) => {
        const { error } = await api.processBorrowRequest(logId, isApproved);
        if (error) { toast('เกิดข้อผิดพลาด: ' + error.message, 'error'); return; }
        toast(isApproved ? '✅ อนุมัติแล้ว' : '❌ ปฏิเสธแล้ว', isApproved ? 'success' : 'error');
        await refreshUI();
    };

    // ✨ REFACTORED: จัดการ Logic การซ่อมและแจ้งเตือน ตามกฎ Condition Policy
    window.__oadEditRepair = async (repairId) => {
        if (!repairId || repairId === 'undefined') {
            toast('ผิดพลาด: ไม่พบ ID ของรายการแจ้งซ่อม', 'error');
            return;
        }

        const allRepairs = [...(state.repairs || []), ...(state.repairHistory || [])];
        const r = allRepairs.find(x => (x.id || x.repair_id || x.log_id) == repairId);
        if (!r) {
            toast('ผิดพลาด: ไม่พบข้อมูลรายการซ่อมนี้', 'error');
            return;
        }

        const curStatus = r.repair_status || 'แจ้งซ่อม';
        const curNotes = r.repair_notes || '';
        const curCost = r.repair_cost || 0;
        const instId = r.instrument_id;
        const reporterId = r.reported_by_user_id || r.student_id;

        const inst = state.instruments.find(i => i.id === instId);
        const curCondition = inst ? inst.condition : 'ดี';

        const { value: vals } = await Swal.fire({
            title: 'อัปเดตสถานะการซ่อม',
            html: `
                <div style="text-align:left;">
                    <label>สถานะกระบวนการ</label>
                    <select id="s-status" class="swal2-input" style="margin-bottom:1rem; background: var(--input-bg); color: var(--text-main);">
                        ${['แจ้งซ่อม','รอซ่อม','กำลังซ่อม','ซ่อมเสร็จสิ้น','ไม่สามารถซ่อมได้'].map(
                            s => `<option value="${s}" ${s===curStatus?'selected':''}>${s}</option>`
                        ).join('')}
                    </select>

                    <label>สภาพเครื่องดนตรี (ระบบจะจัดการให้อัตโนมัติ)</label>
                    <select id="s-condition" class="swal2-input" style="margin-bottom:0.5rem; background: var(--input-bg); color: var(--text-main);" disabled>
                        ${['ใหม่','ดี','พอใช้','ชำรุด'].map(
                            c => `<option value="${c}" ${c===curCondition?'selected':''}>${c}</option>`
                        ).join('')}
                    </select>
                    <div style="font-size: 0.8rem; color: var(--oad-muted); margin-bottom: 1rem; line-height: 1.2;">
                        * ระบบจะปรับสภาพเครื่องอัตโนมัติ<br>"รอซ่อม" = พอใช้ ยืมได้ระหว่างรอ | "ซ่อมเสร็จ" = ปรับเป็น "ดี"
                    </div>

                    <label>หมายเหตุ</label>
                    <textarea id="s-notes" class="swal2-textarea" style="background: var(--input-bg); color: var(--text-main);">${escapeHtml(curNotes || '')}</textarea>
                    
                    <label>ค่าซ่อม (บาท)</label>
                    <input id="s-cost" type="number" class="swal2-input" value="${curCost || 0}" min="0" step="100" style="background: var(--input-bg); color: var(--text-main);">
                </div>`,
            showCancelButton: true, confirmButtonText: 'บันทึก',
            preConfirm: () => {
                const newStatus = document.getElementById('s-status').value;
                let newCondition = document.getElementById('s-condition').value;
                let newInstStatus = inst ? inst.status : 'พร้อมใช้งาน';

                // --- 🛡️ LOGIC RULES: Strict Condition Management ---
                if (newStatus === 'แจ้งซ่อม') {
                    // เครื่องอยู่ในกระบวนการแจ้งซ่อมใหม่ => ต้องบล็อกไว้ก่อนจนกว่าจะตรวจสอบ
                    newInstStatus = 'ชำรุด';
                    newCondition = curCondition;
                } else if (newStatus === 'รอซ่อม') {
                    // ประเมินแล้ว: ยังใช้งานได้ระหว่างรอซ่อม → ไม่บล็อก
                    newInstStatus = 'พร้อมใช้งาน';
                    newCondition = 'พอใช้';
                } else if (newStatus === 'กำลังซ่อม') {
                    newInstStatus = 'ส่งซ่อม';
                    // ถ้าไม่ใช่ ใหม่/ดี => เปลี่ยนเป็น ดี
                    if (newCondition !== 'ใหม่' && newCondition !== 'ดี') {
                        newCondition = 'ดี';
                    }
                } else if (newStatus === 'ซ่อมเสร็จสิ้น') {
                    newInstStatus = 'พร้อมใช้งาน';
                    // ถ้าไม่ใช่ ใหม่/ดี => เปลี่ยนเป็น ดี
                    if (newCondition !== 'ใหม่' && newCondition !== 'ดี') {
                        newCondition = 'ดี';
                    }
                } else if (newStatus === 'ไม่สามารถซ่อมได้') {
                    newInstStatus = 'ชำรุด'; 
                    newCondition = 'ชำรุด';
                }

                return {
                    repair_status: newStatus,
                    repair_notes: document.getElementById('s-notes').value.trim() || null,
                    repair_cost: parseFloat(document.getElementById('s-cost').value) || 0,
                    instrument_status: newInstStatus,
                    instrument_condition: newCondition
                };
            }
        });
        
        if (!vals) return;
        Swal.showLoading();
        
        const { error: repErr } = await api.updateRepair(repairId, {
            repair_status: vals.repair_status,
            repair_notes: vals.repair_notes,
            repair_cost: vals.repair_cost
        });
        if (repErr) { toast('ผิดพลาด: ' + repErr.message, 'error'); return; }

        if (instId) {
            const { error: instErr } = await instrumentsExt.updateStatus(instId, vals.instrument_status, vals.instrument_condition);
            if (instErr) { console.error('Failed to update instrument status:', instErr); }
        }

        // 🔔 Notification Sync
        if (vals.repair_status !== curStatus && reporterId) {
            let notifBody = '';
            if (vals.repair_status === 'รอซ่อม') {
                notifBody = 'เครื่องดนตรียังใช้งานได้ระหว่างรอซ่อม';
            } else if (vals.repair_status === 'กำลังซ่อม') {
                notifBody = 'เครื่องดนตรีของคุณกำลังอยู่ระหว่างการซ่อม';
            } else if (vals.repair_status === 'ซ่อมเสร็จสิ้น') {
                notifBody = 'ซ่อมเสร็จแล้ว เครื่องพร้อมใช้งาน';
            } else if (vals.repair_status === 'ไม่สามารถซ่อมได้') {
                notifBody = 'ไม่สามารถซ่อมได้ เครื่องถูกปรับเป็นชำรุด';
            }

            if (notifBody) {
                await notifications.save(reporterId, 'อัปเดตสถานะการแจ้งซ่อม', notifBody);
            }
        }
        
        await refreshUI();
        toast('✅ อัปเดตข้อมูลการซ่อมแล้ว', 'success');
    };

    window.__oadUnblock = async (userId) => {
        const { error } = await api.unblockUser(userId);
        if (error) { toast('ผิดพลาด: ' + error.message, 'error'); return; }
        toast('🔓 ปลดบล็อกแล้ว', 'success');
        const { data: users } = await adminExt.getUsers();
        state.users = users;
        await refreshUI();
    };

    window.__oadForceReturn = async (logId) => {
        const { isConfirmed } = await Swal.fire({
            title: 'ยืนยันการบังคับคืน?',
            icon: 'warning', showCancelButton: true,
            confirmButtonText: 'บังคับคืน', cancelButtonText: 'ยกเลิก',
            confirmButtonColor: '#ef4444',
        });
        if (!isConfirmed) return;
        const { error } = await api.forceReturn(logId);
        if (error) { toast('ผิดพลาด: ' + error.message, 'error'); return; }
        toast('↩ บังคับคืนเรียบร้อย', 'success');
        await refreshUI();
    };

    window.__oadBlock = async (userId, userName) => {
        const { value: form } = await Swal.fire({
            title: `บล็อก ${escapeHtml(userName)}?`,
            html: `
                <div style="text-align:left;">
                    <label style="font-size:0.85rem; font-weight:bold; display:block; margin-bottom:0.3rem;">เหตุผล (ผู้ใช้จะเห็นข้อความนี้) *</label>
                    <textarea id="oad-block-reason" class="swal2-textarea" style="width:100%; min-height:80px; margin-bottom:0.75rem;" placeholder="เช่น ทำผิดกฎการยืม / สเปม / ใช้คำไม่สุภาพ"></textarea>
                    <label style="font-size:0.85rem; font-weight:bold; display:block; margin-bottom:0.3rem;">หยุดรับ EXP เป็นเวลา</label>
                    <select id="oad-block-hours" class="swal2-select" style="width:100%; display:block;">
                        <option value="24" selected>24 ชั่วโมง (มาตรฐาน)</option>
                        <option value="12">12 ชั่วโมง</option>
                        <option value="48">48 ชั่วโมง</option>
                        <option value="72">3 วัน</option>
                        <option value="168">1 สัปดาห์</option>
                        <option value="0">ไม่หยุด (บล็อกอย่างเดียว)</option>
                    </select>
                    <p style="font-size:0.8rem; color:#64748b; margin-top:0.6rem;">
                        ผู้ใช้ยังเข้าระบบและดูหน้าจอได้ แต่กดอะไรไม่ได้<br>
                        เวลาซ้อมยังเพิ่มได้ตามปกติ — แค่ XP ที่ถูกหยุด
                    </p>
                </div>
            `,
            showCancelButton: true, confirmButtonText: '🚫 ยืนยันบล็อก', cancelButtonText: 'ยกเลิก',
            confirmButtonColor: '#ef4444',
            focusConfirm: false,
            preConfirm: () => {
                const reason = document.getElementById('oad-block-reason').value.trim();
                const hours = parseInt(document.getElementById('oad-block-hours').value, 10) || 0;
                if (!reason) { Swal.showValidationMessage('กรุณาระบุเหตุผล'); return false; }
                return { reason, hours };
            }
        });
        if (!form) return;
        const { reason, hours } = form;
        const { error } = await api.blockUser(userId, reason, hours);
        if (error) { toast('ผิดพลาด: ' + error.message, 'error'); return; }
        const hoursLabel = hours > 0 ? ` + หยุด EXP ${hours} ชม.` : '';
        toast(`🚫 บล็อกผู้ใช้แล้ว${hoursLabel}`, 'success');
        const idx = state.users.findIndex(u => u.id === userId);
        if (idx !== -1) {
            state.users[idx].is_blocked = true;
            state.users[idx].block_reason = reason;
            if (hours > 0) state.users[idx].exp_blocked_until = new Date(Date.now() + hours * 3600_000).toISOString();
        }
        renderUsersTable();
        if (state.stats) state.stats.blocked_users = (state.stats.blocked_users || 0) + 1;
        renderStats();
    };

    // ═══ Recovery Requests Actions ═══
    window.__oadApproveRecovery = async (requestId) => {
        const confirm = await Swal.fire({
            title: 'อนุมัติคำขอกู้คืนบัญชี?',
            html: `
                <p>ระบบจะดำเนินการ:</p>
                <ul style="text-align:left; font-size:0.9rem;">
                    <li>เปลี่ยนอีเมลของบัญชีเดิมเป็นอีเมลใหม่</li>
                    <li>ปลดล็อก + เปิดบัญชี</li>
                    <li>ส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่อีเมลใหม่</li>
                </ul>
                <p style="font-size:0.85rem; color:#dc2626;">⚠️ การยืนยันจะมีผลทันที</p>
            `,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'ยืนยันอนุมัติ',
            cancelButtonText: 'ยกเลิก',
            confirmButtonColor: '#10b981'
        });
        if (!confirm.isConfirmed) return;

        Swal.showLoading();
        try {
            const { data, error } = await recoveryApi.approve(requestId);
            if (error) throw error;
            Swal.close();
            toast(data?.message || '✅ อนุมัติเรียบร้อย', 'success');
            renderRecoveryTable();
        } catch (err) {
            Swal.fire('อนุมัติไม่สำเร็จ', err.message || String(err), 'error');
        }
    };

    window.__oadRejectRecovery = async (requestId) => {
        const { value: reason } = await Swal.fire({
            title: 'ปฏิเสธคำขอกู้คืน',
            input: 'textarea',
            inputLabel: 'เหตุผลที่ปฏิเสธ',
            inputPlaceholder: 'เช่น ข้อมูลไม่ตรงกับนักเรียนจริง',
            inputValidator: (v) => !v ? 'กรุณาระบุเหตุผล' : null,
            showCancelButton: true,
            confirmButtonText: 'ปฏิเสธ',
            cancelButtonText: 'ยกเลิก',
            confirmButtonColor: '#dc2626'
        });
        if (!reason) return;

        try {
            const { error } = await recoveryApi.reject(requestId, reason);
            if (error) throw error;
            toast('❌ ปฏิเสธเรียบร้อย', 'success');
            renderRecoveryTable();
        } catch (err) {
            Swal.fire('ผิดพลาด', err.message || String(err), 'error');
        }
    };

    window.__oadEditUser = async (userId) => {
        const { data: u, error } = await api.getUserById(userId);
        if (error || !u) { toast('ไม่สามารถโหลดข้อมูลผู้ใช้ได้', 'error'); return; }

        const { value: vals } = await Swal.fire({
            title: 'แก้ไขข้อมูลผู้ใช้',
            width: '600px',
            html: `<div style="text-align:left;">
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.5rem;margin-bottom:0.5rem;">
                    <div><label>คำนำหน้า</label>
                        <select id="eu-prefix" class="swal2-input" style="background: var(--input-bg); color: var(--text-main);">
                            ${['เด็กชาย','เด็กหญิง','นาย','นางสาว','นาง'].map(p => `<option ${u.prefix===p?'selected':''}>${p}</option>`).join('')}
                        </select>
                    </div>
                    <div><label>ชื่อ*</label><input id="eu-fname" class="swal2-input" value="${escapeHtml(u.first_name||'')}" style="background: var(--input-bg); color: var(--text-main);"></div>
                    <div><label>นามสกุล*</label><input id="eu-lname" class="swal2-input" value="${escapeHtml(u.last_name||'')}" style="background: var(--input-bg); color: var(--text-main);"></div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;margin-bottom:0.5rem;">
                    <div><label>กลุ่มผู้ใช้</label>
                        <select id="eu-group" class="swal2-input" style="background: var(--input-bg); color: var(--text-main);">
                            ${['student','club','teacher','guest','resigned','graduated','deactivated'].map(g =>
                                `<option value="${g}" ${u.student_group===g?'selected':''}>${translateGroup(g)}</option>`
                            ).join('')}
                        </select>
                    </div>
                    <div><label>ระดับชั้น</label><input id="eu-class" class="swal2-input" value="${escapeHtml(u.class_level||'')}" placeholder="เช่น ม.4/1" style="background: var(--input-bg); color: var(--text-main);"></div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;">
                    <div><label>เบอร์โทรศัพท์</label><input id="eu-phone" class="swal2-input" value="${escapeHtml(u.phone_number||'')}" style="background: var(--input-bg); color: var(--text-main);"></div>
                    <div><label>Line ID</label><input id="eu-line" class="swal2-input" value="${escapeHtml(u.line_id||'')}" style="background: var(--input-bg); color: var(--text-main);"></div>
                </div>
            </div>`,
            focusConfirm: false, showCancelButton: true,
            confirmButtonText: 'บันทึก', cancelButtonText: 'ยกเลิก',
            preConfirm: () => {
                const fn = document.getElementById('eu-fname').value.trim();
                const ln = document.getElementById('eu-lname').value.trim();
                if (!fn || !ln) { Swal.showValidationMessage('กรุณากรอกชื่อและนามสกุล'); return false; }
                return {
                    p_user_id:      userId,
                    p_prefix:       document.getElementById('eu-prefix').value,
                    p_first_name:   fn,
                    p_last_name:    ln,
                    p_student_group: document.getElementById('eu-group').value,
                    p_class_level:  document.getElementById('eu-class').value.trim() || null,
                    p_phone_number: document.getElementById('eu-phone').value.trim() || null,
                    p_line_id:      document.getElementById('eu-line').value.trim() || null,
                    p_nickname:     u.nickname || null,
                    p_student_id:   u.student_id || null,
                    p_main_instrument: u.main_instrument || null,
                    p_birth_date:   u.birth_date || null,
                    p_profile_image_url: u.profile_image_url || null,
                };
            }
        });
        if (!vals) return;
        const { error: updateErr } = await api.updateUser(vals);
        if (updateErr) { toast('ผิดพลาด: ' + updateErr.message, 'error'); return; }
        toast('✅ อัปเดตข้อมูลผู้ใช้แล้ว', 'success');
        const idx = state.users.findIndex(u2 => u2.id === userId);
        if (idx !== -1) {
            state.users[idx] = { ...state.users[idx],
                prefix: vals.p_prefix, first_name: vals.p_first_name,
                last_name: vals.p_last_name, student_group: vals.p_student_group,
                class_level: vals.p_class_level,
            };
        }
        renderUsersTable();
    };

    window.__oadEditInstrument = async (instId) => {
        const inst = state.instruments.find(i => i.id === instId);
        if (!inst) { toast('ไม่พบเครื่องดนตรีในแคช', 'error'); return; }

        const { value: vals } = await Swal.fire({
            title: 'แก้ไขเครื่องดนตรี',
            width: '600px',
            html: `
            <style>
                .oad-swal-form label { font-size: 0.85rem; font-weight: bold; color: var(--text-muted); margin-bottom: 0.2rem; display: block; text-align: left; }
                .oad-swal-form input, .oad-swal-form select, .oad-swal-form textarea { width: 100%; padding: 0.5rem; margin-bottom: 0.8rem; border-radius: 6px; border: 1px solid var(--oad-border); background: var(--input-bg); color: var(--text-main); font-family: inherit; font-size: 0.9rem; box-sizing: border-box; }
                .oad-swal-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem; }
                @media (max-width: 500px) { .oad-swal-grid { grid-template-columns: 1fr; gap: 0; } }
            </style>
            <div class="oad-swal-form" style="max-height: 65vh; overflow-y: auto; padding: 0.5rem 0.2rem;">
                <div class="oad-swal-grid">
                    <div><label>รหัสเครื่อง (Code)</label><input id="ei-code" value="${escapeHtml(inst.instrument_code||'')}"></div>
                    <div><label>ยี่ห้อ (Brand)</label><input id="ei-brand" value="${escapeHtml(inst.brand||'')}"></div>
                </div>
                <div class="oad-swal-grid">
                    <div><label>ชื่อเครื่อง*</label><input id="ei-name" value="${escapeHtml(inst.name||'')}"></div>
                    <div><label>ประเภท*</label><input id="ei-type" value="${escapeHtml(inst.type||'')}"></div>
                </div>
                <div class="oad-swal-grid">
                    <div><label>หมายเลขซีเรียล (S/N)</label><input id="ei-serial" value="${escapeHtml(inst.serial_number||'')}"></div>
                    <div><label>วันที่จัดซื้อ</label><input id="ei-date" type="date" value="${escapeHtml(inst.purchase_date||'')}"></div>
                </div>
                <div class="oad-swal-grid">
                    <div><label>ระบบสต๊อก</label>
                        <select id="ei-stock">
                            <option value="Serialized" ${inst.stock_type==='Serialized'?'selected':''}>รายชิ้น (มีซีเรียล)</option>
                            <option value="Bulk" ${inst.stock_type==='Bulk'?'selected':''}>นับจำนวนชิ้น (Bulk)</option>
                        </select>
                    </div>
                    <div><label>จำนวนในคลัง</label>
                        <input id="ei-qty" type="number" min="1" value="${inst.quantity || 1}">
                    </div>
                </div>
                <div class="oad-swal-grid">
                    <div><label>สภาพ</label>
                        <select id="ei-cond">
                            ${['ใหม่','ดี','พอใช้','ชำรุด'].map(c => `<option ${inst.condition===c?'selected':''}>${c}</option>`).join('')}
                        </select>
                    </div>
                    <div><label>สถานะ</label>
                        <select id="ei-status">
                            ${['พร้อมใช้งาน','ถูกยืมอยู่','ชำรุด','ส่งซ่อม','หมดสต๊อก'].map(s => `<option ${inst.status===s?'selected':''}>${s}</option>`).join('')}
                        </select>
                    </div>
                </div>
                
                <div style="background: var(--oad-surface); padding: 1rem; border-radius: 8px; margin-bottom: 0.8rem; border: 1px dashed var(--oad-border);">
                    <label>📸 อัปโหลดรูปภาพใหม่ (ถ้าไม่เปลี่ยนให้เว้นไว้)</label>
                    <input type="file" id="ei-img-file" accept="image/*" style="margin-bottom: 0;">
                    ${inst.image_url ? `<div style="margin-top: 0.5rem; font-size: 0.8rem;"><a href="${escapeHtml(inst.image_url)}" target="_blank" style="color: var(--pico-primary);">🖼️ ดูรูปภาพปัจจุบันคลิกที่นี่</a></div>` : ''}
                </div>

                <div><label>รายละเอียดเพิ่มเติม</label><textarea id="ei-desc" rows="2">${escapeHtml(inst.description||'')}</textarea></div>
            </div>`,
            focusConfirm: false, showCancelButton: true,
            confirmButtonText: 'บันทึก', cancelButtonText: 'ยกเลิก',
            preConfirm: async () => {
                const name = document.getElementById('ei-name').value.trim();
                const type = document.getElementById('ei-type').value.trim();
                if (!name || !type) { Swal.showValidationMessage('กรุณากรอกชื่อและประเภทเครื่องดนตรี'); return false; }
                
                Swal.showLoading(); 
                
                let finalImageUrl = inst.image_url || null;
                const fileInput = document.getElementById('ei-img-file');
                
                if (fileInput.files && fileInput.files.length > 0) {
                    const file = fileInput.files[0];
                    const { publicUrl, error } = await adminExt.uploadInstrumentImage(file);
                    if (error) {
                        Swal.showValidationMessage(`อัปโหลดรูปภาพล้มเหลว: ${error.message}`);
                        return false;
                    }
                    finalImageUrl = publicUrl;
                }

                return {
                    p_id:              instId,
                    p_instrument_code: document.getElementById('ei-code').value.trim() || null,
                    p_brand:           document.getElementById('ei-brand').value.trim() || null,
                    p_name:            name,
                    p_type:            type,
                    p_serial_number:   document.getElementById('ei-serial').value.trim() || null,
                    p_purchase_date:   document.getElementById('ei-date').value || null,
                    p_stock_type:      document.getElementById('ei-stock').value,
                    p_quantity:        parseInt(document.getElementById('ei-qty').value) || 1,
                    p_condition:       document.getElementById('ei-cond').value,
                    p_status:          document.getElementById('ei-status').value,
                    p_image_url:       finalImageUrl,
                    p_description:     document.getElementById('ei-desc').value.trim() || null,
                };
            }
        });
        if (!vals) return;
        const { error } = await api.updateInstrument(vals);
        if (error) { toast('ผิดพลาด: ' + error.message, 'error'); return; }
        toast('✅ แก้ไขเครื่องดนตรีแล้ว', 'success');
        
        const idx = state.instruments.findIndex(i => i.id === instId);
        if (idx !== -1) {
            state.instruments[idx] = { 
                ...state.instruments[idx], 
                instrument_code: vals.p_instrument_code,
                brand: vals.p_brand,
                name: vals.p_name, 
                type: vals.p_type, 
                serial_number: vals.p_serial_number,
                purchase_date: vals.p_purchase_date,
                stock_type: vals.p_stock_type,
                quantity: vals.p_quantity,
                condition: vals.p_condition, 
                status: vals.p_status,
                image_url: vals.p_image_url,
                description: vals.p_description
            };
        }
        renderInstrumentsTable();
    };

    window.__oadDeleteInstrument = async (instId, instName) => {
        const { isConfirmed } = await Swal.fire({
            title: `ลบ "${escapeHtml(instName)}"?`,
            text: 'การกระทำนี้ไม่สามารถย้อนกลับได้',
            icon: 'warning', showCancelButton: true,
            confirmButtonText: 'ลบ', cancelButtonText: 'ยกเลิก',
            confirmButtonColor: '#ef4444',
        });
        if (!isConfirmed) return;
        const { error } = await api.deleteInstrument(instId);
        if (error) { toast('ผิดพลาด: ' + error.message, 'error'); return; }
        toast('🗑️ ลบเครื่องดนตรีแล้ว', 'success');
        state.instruments = state.instruments.filter(i => i.id !== instId);
        renderInstrumentsTable();
    };

    window.__oadAddInstrument = async () => {
        const { value: vals } = await Swal.fire({
            title: 'เพิ่มเครื่องดนตรีใหม่',
            width: '600px',
            html: `
            <style>
                .oad-swal-form label { font-size: 0.85rem; font-weight: bold; color: var(--text-muted); margin-bottom: 0.2rem; display: block; text-align: left; }
                .oad-swal-form input, .oad-swal-form select, .oad-swal-form textarea { width: 100%; padding: 0.5rem; margin-bottom: 0.8rem; border-radius: 6px; border: 1px solid var(--oad-border); background: var(--input-bg); color: var(--text-main); font-family: inherit; font-size: 0.9rem; box-sizing: border-box; }
                .oad-swal-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem; }
                @media (max-width: 500px) { .oad-swal-grid { grid-template-columns: 1fr; gap: 0; } }
            </style>
            <div class="oad-swal-form" style="max-height: 65vh; overflow-y: auto; padding: 0.5rem 0.2rem;">
                <div class="oad-swal-grid">
                    <div><label>รหัสเครื่อง (Code)</label><input id="ni-code" placeholder="เช่น TRP-001"></div>
                    <div><label>ยี่ห้อ (Brand)</label><input id="ni-brand" placeholder="เช่น Yamaha"></div>
                </div>
                <div class="oad-swal-grid">
                    <div><label>ชื่อเครื่อง*</label><input id="ni-name" placeholder="เช่น ทรัมเป็ตมาตรฐาน"></div>
                    <div><label>ประเภท*</label><input id="ni-type" placeholder="เช่น ทรัมเป็ต"></div>
                </div>
                <div class="oad-swal-grid">
                    <div><label>หมายเลขซีเรียล (S/N)</label><input id="ni-serial" placeholder="S/N..."></div>
                    <div><label>วันที่จัดซื้อ</label><input id="ni-date" type="date"></div>
                </div>
                <div class="oad-swal-grid">
                    <div><label>ระบบสต๊อก</label>
                        <select id="ni-stock">
                            <option value="Serialized">รายชิ้น (มีซีเรียล)</option>
                            <option value="Bulk">นับจำนวนชิ้น (Bulk)</option>
                        </select>
                    </div>
                    <div><label>จำนวนเริ่มต้น</label>
                        <input id="ni-qty" type="number" min="1" value="1">
                    </div>
                </div>
                <div class="oad-swal-grid">
                    <div><label>สภาพ</label>
                        <select id="ni-cond">
                            <option value="ใหม่">ใหม่</option>
                            <option value="ดี">ดี</option>
                            <option value="พอใช้">พอใช้</option>
                            <option value="ชำรุด">ชำรุด</option>
                        </select>
                    </div>
                    <div><label>สถานะเริ่มต้น</label>
                        <select id="ni-status">
                            <option value="พร้อมใช้งาน">พร้อมใช้งาน</option>
                            <option value="ชำรุด">ชำรุด</option>
                        </select>
                    </div>
                </div>
                <div>
                    <label>📸 อัปโหลดรูปภาพ (หรือถ่ายรูปจากกล้อง)</label>
                    <input type="file" id="ni-img-file" accept="image/*">
                </div>
                <div><label>รายละเอียดเพิ่มเติม</label><textarea id="ni-desc" rows="2" placeholder="หมายเหตุเพิ่มเติม..."></textarea></div>
            </div>`,
            focusConfirm: false, showCancelButton: true,
            confirmButtonText: 'บันทึก', cancelButtonText: 'ยกเลิก',
            preConfirm: async () => {
                const name = document.getElementById('ni-name').value.trim();
                const type = document.getElementById('ni-type').value.trim();
                if (!name || !type) { Swal.showValidationMessage('กรุณากรอกชื่อและประเภทเครื่องดนตรี'); return false; }
                
                Swal.showLoading(); 
                
                let imageUrl = null;
                const fileInput = document.getElementById('ni-img-file');
                
                if (fileInput.files && fileInput.files.length > 0) {
                    const file = fileInput.files[0];
                    const { publicUrl, error } = await adminExt.uploadInstrumentImage(file);
                    if (error) {
                        Swal.showValidationMessage(`อัปโหลดรูปภาพล้มเหลว: ${error.message}`);
                        return false;
                    }
                    imageUrl = publicUrl;
                }

                return { 
                    instrument_code: document.getElementById('ni-code').value.trim() || null,
                    brand: document.getElementById('ni-brand').value.trim() || null,
                    name: name, 
                    type: type, 
                    serial_number: document.getElementById('ni-serial').value.trim() || null,
                    purchase_date: document.getElementById('ni-date').value || null,
                    stock_type: document.getElementById('ni-stock').value,
                    quantity: parseInt(document.getElementById('ni-qty').value) || 1,
                    condition: document.getElementById('ni-cond').value,
                    status: document.getElementById('ni-status').value,
                    image_url: imageUrl, 
                    description: document.getElementById('ni-desc').value.trim() || null
                };
            }
        });
        if (!vals) return;
        const { error } = await api.addInstrument(vals);
        if (error) { toast('ผิดพลาด: ' + error.message, 'error'); return; }
        toast('✅ เพิ่มเครื่องดนตรีและรูปภาพแล้ว', 'success');
        const { data } = await api.getAllInstruments();
        state.instruments = data;
        renderInstrumentsTable();
    };

    window.__oadYearlyReset = async () => {
        const { value: conf } = await Swal.fire({
            title: '⚠️ ยืนยันการรีเซ็ตระบบรายปี?',
            html: `การกระทำนี้จะล้างอันดับ/เวลาซ้อมทั้งหมด<br>พิมพ์ <strong>RESET</strong> เพื่อยืนยัน`,
            icon: 'warning', input: 'text', inputPlaceholder: 'RESET',
            showCancelButton: true, confirmButtonColor: '#ef4444',
            confirmButtonText: 'รีเซ็ต', cancelButtonText: 'ยกเลิก',
            inputValidator: v => v !== 'RESET' && 'พิมพ์ RESET เพื่อยืนยัน'
        });
        if (conf !== 'RESET') return;
        Swal.showLoading();
        const { error } = await adminExt.triggerYearlyReset();
        if (error) { await Swal.fire('ผิดพลาด', error.message, 'error'); return; }
        await Swal.fire('สำเร็จ', 'รีเซ็ตระบบรายปีเรียบร้อย', 'success');
        window.location.reload();
    };

    window.__oadManageBadgeDefs = async () => {
        Swal.showLoading();
        try {
            const { data: defs, error } = await adminExt.getBadgeDefinitions();
            if (error) throw error;

            const AWARD_METHODS = {
                'manual': 'แอดมินมอบให้', 'borrow_count': 'จำนวนครั้งที่ยืม',
                'first_on_time_return': 'คืนตรงเวลาครั้งแรก', 'profile_complete': 'กรอกโปรไฟล์สมบูรณ์',
                'on_time_streak': 'คืนตรงเวลาติดต่อกัน', 'distinct_types_borrowed': 'ยืมครบตามประเภท',
                'borrow_count_string': 'ยืมเครื่องสายครบ', 'borrow_count_wind': 'ยืมเครื่องเป่าครบ',
                'borrow_count_drum': 'ยืมกลองครบ', 'game_highscore': 'คะแนนเกมสูงสุด',
                'game_play_count': 'จำนวนครั้งที่เล่นเกม', 'game_total_score': 'คะแนนเกมสะสม'
            };

            const rows = defs.map(d => `
                <tr>
                    <td style="text-align:center;">${d.badge_icon || '🏅'}</td>
                    <td class="nowrap"><strong>${escapeHtml(d.badge_name)}</strong></td>
                    <td class="nowrap">${AWARD_METHODS[d.award_method] || d.award_method}</td>
                    <td style="text-align:center;">
                        <button class="oad-btn oad-btn-red oad-btn-icon" style="padding: 0.2rem 0.5rem;" onclick="window.__oadDeleteBadgeDef(${d.id})">🗑️</button>
                    </td>
                </tr>
            `).join('');

            const methodOpts = Object.entries(AWARD_METHODS).map(([k,v]) => `<option value="${k}">${v}</option>`).join('');

            Swal.fire({
                title: 'จัดการเงื่อนไขเหรียญตรา',
                width: '700px',
                html: `
                    <div style="text-align:left;">
                        <div class="oad-table-wrap" style="max-height:35vh; overflow-y:auto; margin-bottom:1.5rem; border:1px solid var(--oad-border); border-radius: var(--oad-radius-sm);">
                            <table class="oad-table" style="margin-bottom:0;">
                                <thead><tr><th style="text-align:center;">ไอคอน</th><th>ชื่อเหรียญ</th><th>วิธีได้รับ</th><th style="text-align:center;">ลบ</th></tr></thead>
                                <tbody>${rows || '<tr><td colspan="4" style="text-align:center; padding: 2rem;">ไม่มีข้อมูลเงื่อนไขเหรียญตรา</td></tr>'}</tbody>
                            </table>
                        </div>
                        <div style="background: var(--oad-surface2); padding: 1.25rem; border-radius: var(--oad-radius-sm); border: 1px solid var(--oad-border);">
                            <h5 style="margin: 0 0 1rem 0; font-size: 1rem; color: var(--oad-text);">✨ เพิ่มเหรียญตราใหม่</h5>
                            <div style="display:grid; grid-template-columns:1fr 100px; gap:0.75rem; margin-bottom:0.75rem;">
                                <input id="nb-name" class="oad-search" placeholder="ชื่อเหรียญ*">
                                <input id="nb-icon" class="oad-search" placeholder="ไอคอน (เช่น 🏅)" style="text-align:center;">
                            </div>
                            <input id="nb-desc" class="oad-search" placeholder="คำอธิบาย (จะแสดงเมื่อผู้ใช้เอาเมาส์ชี้)" style="width:100%; margin-bottom:0.75rem;">
                            <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.75rem; margin-bottom:1rem;">
                                <select id="nb-method" class="oad-select">
                                    <option value="" disabled selected>-- วิธีได้รับ* --</option>
                                    ${methodOpts}
                                </select>
                                <input id="nb-val" type="number" class="oad-search" placeholder="เป้าหมาย (ใส่ตัวเลขถ้ามี)">
                            </div>
                            <button class="oad-btn oad-btn-primary" style="width:100%; justify-content:center;" onclick="window.__oadAddBadgeDef()">+ บันทึกเหรียญตราใหม่</button>
                        </div>
                    </div>
                `,
                showConfirmButton: false,
                showCloseButton: true
            });
        } catch(err) {
            toast('ผิดพลาด: ' + err.message, 'error');
        }
    };

    window.__oadDeleteBadgeDef = async (id) => {
        const { isConfirmed } = await Swal.fire({ title: 'ลบเงื่อนไขเหรียญตรา?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444' });
        if (!isConfirmed) return;
        Swal.showLoading();
        const { error } = await adminExt.deleteBadgeDefinition(id);
        if (error) toast('ผิดพลาด: ' + error.message, 'error');
        else { toast('ลบสำเร็จ', 'success'); window.__oadManageBadgeDefs(); }
    };

    window.__oadAddBadgeDef = async () => {
        const name = document.getElementById('nb-name').value.trim();
        const icon = document.getElementById('nb-icon').value.trim();
        const desc = document.getElementById('nb-desc').value.trim();
        const method = document.getElementById('nb-method').value;
        const val = document.getElementById('nb-val').value;

        if (!name || !method) { toast('กรุณากรอกชื่อและเลือกวิธีได้รับเหรียญ', 'error'); return; }

        Swal.showLoading();
        const { error } = await adminExt.addBadgeDefinition({
            badge_name: name, badge_icon: icon || null, badge_description: desc || null,
            award_method: method, goal_value: val ? parseInt(val) : null
        });
        if (error) toast('ผิดพลาด: ' + error.message, 'error');
        else { toast('เพิ่มเหรียญตราเรียบร้อย', 'success'); window.__oadManageBadgeDefs(); }
    };

    window.__oadManageBadges = async (userId, userName) => {
        Swal.showLoading();

        try {
            const { data: awarded, error: err1 } = await adminExt.getUserBadges(userId);
            if (err1) throw err1;

            const { data: allDefs, error: err2 } = await adminExt.getBadgeDefinitions();
            if (err2) throw err2;

            const manualDefs = allDefs.filter(d => d.award_method === 'manual');
            const awardedNames = awarded.map(b => b.badge_name);
            const available = manualDefs.filter(d => !awardedNames.includes(d.badge_name));

            let existingHtml = awarded.length
                ? awarded.map(b => {
                    const def = allDefs.find(d => d.badge_name === b.badge_name);
                    const icon = def?.badge_icon || '🏅';
                    const desc = b.badge_description || def?.badge_description || 'ไม่มีคำอธิบาย';

                    return `
                    <div style="
                        background:#ffffff;
                        border:1px solid #dbe3ee;
                        border-radius:14px;
                        padding:.75rem;
                        display:flex;
                        gap:.75rem;
                        align-items:center;
                        margin-bottom:.65rem;
                        box-shadow:0 4px 10px rgba(0,0,0,.05);
                    ">
                        <div style="
                            width:56px;
                            height:56px;
                            border-radius:14px;
                            background:linear-gradient(135deg,#facc15,#f59e0b);
                            display:flex;
                            align-items:center;
                            justify-content:center;
                            font-size:1.7rem;
                            flex-shrink:0;
                        ">
                            ${icon}
                        </div>

                        <div style="flex:1;min-width:0;line-height:1.25;">
                            <div style="
                                font-size:.95rem;
                                font-weight:800;
                                color:#111827;
                                margin-bottom:2px;
                            ">
                                ${escapeHtml(b.badge_name)}
                            </div>

                            <div style="
                                font-size:.78rem;
                                color:#6b7280;
                                line-height:1.2;
                            ">
                                ${escapeHtml(desc)}
                            </div>
                        </div>

                        <button
                            onclick="window.__oadRemoveUserBadge('${b.id}', '${userId}', '${escapeHtml(userName)}')"
                            style="
                                width:36px;
                                height:36px;
                                border:none;
                                border-radius:10px;
                                background:#ef4444;
                                color:#fff;
                                cursor:pointer;
                                flex-shrink:0;
                            "
                        >🗑️</button>
                    </div>
                    `;
                }).join('')
                : `
                <div style="
                    background:#ffffff;
                    border:1px dashed #cbd5e1;
                    border-radius:14px;
                    padding:2rem 1rem;
                    text-align:center;
                ">
                    <div style="font-size:2.3rem;">🎖️</div>
                    <div style="
                        margin-top:.4rem;
                        font-size:.92rem;
                        font-weight:700;
                        color:#111827;
                        line-height:1.2;
                    ">
                        ยังไม่ได้รับเหรียญตราใดๆ
                    </div>
                </div>
                `;

            let awardHtml = available.length
                ? `
                <div style="
                    margin-top:1rem;
                    background:#f8fafc;
                    border:1px solid #dbeafe;
                    border-radius:14px;
                    padding:.8rem;
                ">
                    <div style="
                        font-size:.88rem;
                        font-weight:800;
                        color:#2563eb;
                        margin-bottom:.55rem;
                        line-height:1.2;
                    ">
                        ✨ มอบเหรียญตราพิเศษ
                    </div>

                    <div style="display:flex;gap:.5rem;flex-wrap:wrap;">
                        <select
                            id="swal-badge-select"
                            class="oad-select"
                            style="
                                flex:1;
                                min-width:220px;
                                margin:0;
                                background:#ffffff;
                                border-radius:10px;
                                padding:.55rem .7rem;
                            "
                        >
                            <option value="" disabled selected>เลือกเหรียญตรา</option>
                            ${available.map(a => `
                                <option value="${escapeHtml(a.badge_name)}">
                                    ${a.badge_icon || '🏅'} ${escapeHtml(a.badge_name)}
                                </option>
                            `).join('')}
                        </select>

                        <button
                            onclick="window.__oadAwardUserBadge('${userId}', '${escapeHtml(userName)}')"
                            style="
                                border:none;
                                padding:.55rem .9rem;
                                border-radius:10px;
                                cursor:pointer;
                                font-weight:800;
                                color:#fff;
                                background:#2563eb;
                                white-space:nowrap;
                            "
                        >
                            🎁 มอบทันที
                        </button>
                    </div>
                </div>
                `
                : `
                <div style="
                    margin-top:1rem;
                    background:#ecfdf5;
                    border:1px solid #86efac;
                    border-radius:14px;
                    padding:.8rem;
                    text-align:center;
                    color:#047857;
                    font-size:.9rem;
                    font-weight:800;
                    line-height:1.2;
                ">
                    🎉 ได้รับครบทุกเหรียญแล้ว
                </div>
                `;

            Swal.fire({
                width: '700px',
                showConfirmButton: false,
                showCloseButton: true,
                background: '#f1f5f9',
                title: `
                    <div style="line-height:1.15;">
                        <div style="
                            font-size:1.15rem;
                            font-weight:900;
                            color:#111827;
                        ">
                            🏆 คลังเหรียญตรา
                        </div>
                        <div style="
                            font-size:.85rem;
                            font-weight:600;
                            color:#6b7280;
                            margin-top:2px;
                        ">
                            ${escapeHtml(userName)}
                        </div>
                    </div>
                `,
                html: `
                    <div style="text-align:left;margin-top:.4rem;">

                        <div style="
                            display:flex;
                            justify-content:space-between;
                            align-items:center;
                            margin-bottom:.6rem;
                        ">
                            <div style="
                                font-size:.9rem;
                                font-weight:800;
                                color:#111827;
                                line-height:1.1;
                            ">
                                🎖️ เหรียญที่ครอบครอง
                            </div>

                            <div style="
                                background:#ffffff;
                                border:1px solid #e5e7eb;
                                border-radius:999px;
                                padding:.22rem .6rem;
                                font-size:.72rem;
                                font-weight:800;
                                color:#374151;
                                line-height:1;
                            ">
                                ${awarded.length} เหรียญ
                            </div>
                        </div>

                        <div style="
                            max-height:45vh;
                            overflow-y:auto;
                            padding-right:2px;
                        ">
                            ${existingHtml}
                        </div>

                        ${awardHtml}

                    </div>
                `
            });

        } catch (err) {
            toast('ผิดพลาด: ' + err.message, 'error');
        }
    };

    window.__oadAwardUserBadge = async (userId, userName) => {
        const badgeName = document.getElementById('swal-badge-select')?.value;
        if (!badgeName) return;
        Swal.showLoading();
        const { data: def } = await adminExt.getBadgeDefinitionByName(badgeName);

        const { error } = await adminExt.awardBadge(userId, badgeName, def?.badge_description);
        if (error) toast('ผิดพลาด: ' + error.message, 'error');
        else { toast('มอบเหรียญตราเรียบร้อย', 'success'); window.__oadManageBadges(userId, userName); }
    };

    window.__oadRemoveUserBadge = async (badgeId, userId, userName) => {
        Swal.showLoading();
        const { error } = await adminExt.removeBadge(badgeId);
        if (error) toast('ผิดพลาด: ' + error.message, 'error');
        else { toast('ดึงเหรียญตราคืนแล้ว', 'success'); window.__oadManageBadges(userId, userName); }
    };

    window.__oadManageExp = async (userId, userName) => {
        const { value: formValues } = await Swal.fire({
            title: `จัดการ EXP: ${escapeHtml(userName)}`,
            html: `<div style="text-align:left;">
                <label style="font-size:0.85rem;font-weight:bold;">จำนวน EXP (ใส่ติดลบเพื่อลดคะแนน)</label>
                <input id="swal-exp-amount" type="number" class="swal2-input" placeholder="เช่น 50 หรือ -10" style="background: var(--input-bg); color: var(--text-main); margin-bottom:1rem;">
                
                <label style="font-size:0.85rem;font-weight:bold;">รายละเอียด/กิจกรรม</label>
                <input id="swal-exp-reason" type="text" class="swal2-input" placeholder="เช่น ลงเพลงชาติหน้าเสาธง, จิตอาสาช่วยงาน..." style="background: var(--input-bg); color: var(--text-main);">
            </div>`,
            focusConfirm: false,
            showCancelButton: true,
            confirmButtonText: 'บันทึกคะแนน',
            cancelButtonText: 'ยกเลิก',
            confirmButtonColor: '#2563eb',
            preConfirm: () => {
                const amount = parseInt(document.getElementById('swal-exp-amount').value);
                const reason = document.getElementById('swal-exp-reason').value.trim();
                if (isNaN(amount) || !reason) {
                    Swal.showValidationMessage('กรุณากรอกจำนวน EXP และรายละเอียดให้ครบถ้วน');
                    return false;
                }
                return { amount, reason };
            }
        });

        if (!formValues) return;
        Swal.showLoading();
        
        try {
            const adminUser = getCurrentUser();
            const { error } = await adminExt.adjustUserXp(userId, formValues.amount, formValues.reason, adminUser?.id);

            if (error) throw error;
            
            toast('✅ บันทึก EXP พิเศษเรียบร้อยแล้ว', 'success');
            document.getElementById('oad-refresh-btn')?.click();
        } catch (err) {
            toast('ผิดพลาด: ' + err.message, 'error');
        }
    };

    window.__oadSaveConfig = async (key, val) => {
        if (!val || isNaN(val)) return;
        const { error } = await adminExt.upsertSystemSettings({ key: key, value: parseFloat(val) });
        
        if (error) toast('ผิดพลาด: ' + error.message, 'error');
        else toast(`✅ บันทึกค่า ${key} เรียบร้อย`, 'success');
    };

    window.__oadDeleteRule = async (id) => {
        const { isConfirmed } = await Swal.fire({ title: 'ลบกฎพิเศษนี้?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444' });
        if (!isConfirmed) return;
        const { error } = await adminExt.deleteXpRule(id);
        if (error) toast('ผิดพลาด: ' + error.message, 'error');
        else { toast('ลบสำเร็จ', 'success'); renderConfigTab(); }
    };

    window.__oadAddRule = async () => {
        const { value: formVals } = await Swal.fire({
            title: 'สร้างกฎ EXP พิเศษ',
            html: `
            <div style="text-align:left;">
                <label>ชื่อกิจกรรม/กฎ</label>
                <input id="nr-name" class="swal2-input" placeholder="เช่น ซ้อมวันเสาร์, เพลงชาติ" style="background:var(--input-bg); color:var(--text-main); margin-bottom:1rem;">
                
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem; margin-bottom:1rem;">
                    <div><label>บังคับเฉพาะวัน</label>
                    <select id="nr-day" class="swal2-input" style="background:var(--input-bg); color:var(--text-main);">
                        <option value="">ทุกวัน</option>
                        <option value="0">วันอาทิตย์</option>
                        <option value="1">วันจันทร์</option>
                        <option value="2">วันอังคาร</option>
                        <option value="3">วันพุธ</option>
                        <option value="4">วันพฤหัสบดี</option>
                        <option value="5">วันศุกร์</option>
                        <option value="6">วันเสาร์</option>
                    </select></div>
                    <div><label>ตัวคูณ EXP</label><input type="number" id="nr-mul" class="swal2-input" value="1.0" step="0.5" style="background:var(--input-bg); color:var(--text-main);"></div>
                </div>

                <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem; margin-bottom:1rem;">
                    <div><label>เวลาเริ่ม (ถ้ามี)</label><input type="time" id="nr-start" class="swal2-input" style="background:var(--input-bg); color:var(--text-main);"></div>
                    <div><label>เวลาสิ้นสุด (ถ้ามี)</label><input type="time" id="nr-end" class="swal2-input" style="background:var(--input-bg); color:var(--text-main);"></div>
                </div>
                
                <label>โบนัสบวกเพิ่มทันที (EXP)</label>
                <input type="number" id="nr-flat" class="swal2-input" value="0" style="background:var(--input-bg); color:var(--text-main);">
            </div>`,
            focusConfirm: false, showCancelButton: true, confirmButtonText: 'บันทึกกฎ', cancelButtonText: 'ยกเลิก',
            preConfirm: () => {
                const name = document.getElementById('nr-name').value.trim();
                if (!name) { Swal.showValidationMessage('กรุณาตั้งชื่อกฎ'); return false; }
                return {
                    rule_name: name,
                    day_of_week: document.getElementById('nr-day').value ? parseInt(document.getElementById('nr-day').value) : null,
                    start_time: document.getElementById('nr-start').value || null,
                    end_time: document.getElementById('nr-end').value || null,
                    multiplier: parseFloat(document.getElementById('nr-mul').value) || 1.0,
                    bonus_flat: parseInt(document.getElementById('nr-flat').value) || 0
                };
            }
        });

        if (formVals) {
            Swal.showLoading();
            const { error } = await adminExt.addXpRule(formVals);
            if (error) toast('ผิดพลาด: ' + error.message, 'error');
            else { toast('เพิ่มกฎสำเร็จ!', 'success'); renderConfigTab(); }
        }
    };

    window.__oadQuickBoost = async () => {
        const xp = parseInt(document.getElementById('quick-boost-xp').value);
        const mins = parseInt(document.getElementById('quick-boost-mins').value);

        if (!xp || !mins) {
            toast('กรุณากรอกจำนวน EXP และระยะเวลา', 'error');
            return;
        }

        const now = new Date();
        const end = new Date(now.getTime() + (mins * 60000));
        
        const formatTime = (date) => date.toTimeString().split(' ')[0];

        const payload = {
            rule_name: `⚡ Boost พิเศษ (${mins} นาที)`,
            day_of_week: now.getDay(),
            start_time: formatTime(now),
            end_time: formatTime(end),
            bonus_flat: xp,
            is_active: true
        };

        Swal.showLoading();
        const { error } = await adminExt.addXpRule(payload);
        
        if (error) toast('ผิดพลาด: ' + error.message, 'error');
        else {
            Swal.close();
            toast(`🚀 เริ่มกิจกรรม Boost +${xp} EXP เป็นเวลา ${mins} นาทีแล้ว!`, 'success');
            renderConfigTab();
        }
    };

    window.__oadShowQR = (instrumentId, name) => {
        const modal = document.getElementById('oad-qr-modal');
        const container = document.getElementById('oad-qr-container');
        
        if (!modal || !container) {
            alert('ไม่พบ HTML สำหรับแสดง QR Code');
            return;
        }

        document.getElementById('oad-qr-title').textContent = `QR: ${name}`;
        container.innerHTML = ''; 

        const baseUrl = window.location.origin + window.location.pathname;
        const scanUrl = `${baseUrl}?scan=${instrumentId}`;

        new QRCode(container, {
            text: scanUrl, 
            width: 200,
            height: 200,
            colorDark : "#000000",
            colorLight : "#ffffff",
            correctLevel : QRCode.CorrectLevel.H
        });

        modal.classList.remove('hidden');
    };

    window.__oadHandleGroupFilter = (val) => {
        const classFilter = document.getElementById('oad-user-class-filter');
        if (val === 'student' || val === 'club') {
            classFilter.style.display = 'block';
            const classes = [...new Set(state.users.filter(u => u.class_level).map(u => u.class_level))].sort();
            classFilter.innerHTML = '<option value="all">ทุกห้องเรียน</option>' + 
                classes.map(c => `<option value="${c}">${c}</option>`).join('');
        } else {
            classFilter.style.display = 'none';
            classFilter.value = 'all';
        }
        debounceRefresh();
    };

    window.__oadExportAllQR = async () => {
        if (!state.instruments || state.instruments.length === 0) {
            toast('ไม่มีข้อมูลเครื่องดนตรีให้ Export', 'error');
            return;
        }

        const printWindow = window.open('', '_blank');
        
        if (!printWindow) {
            Swal.fire({
                title: 'ถูกบล็อกหน้าต่าง (Pop-up)',
                text: 'กรุณาอนุญาต (Allow) ให้เบราว์เซอร์เปิด Pop-up สำหรับเว็บไซต์นี้ก่อนทำการ Export ครับ',
                icon: 'warning',
                confirmButtonText: 'รับทราบ'
            });
            return;
        }

        printWindow.document.write('<div style="font-family:sans-serif; text-align:center; margin-top:50px;"><h2>⏳ กำลังสร้าง QR Code... กรุณารอสักครู่</h2></div>');

        Swal.fire({ title: 'กำลังเตรียมไฟล์เอกสาร...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        try {
            const baseUrl = window.location.origin + window.location.pathname;
            
            const qrPromises = state.instruments.map(inst => {
                return new Promise(resolve => {
                    const tempDiv = document.createElement('div');
                    const scanUrl = `${baseUrl}?scan=${inst.id}`;
                    
                    new QRCode(tempDiv, {
                        text: scanUrl,
                        width: 150, height: 150,
                        colorDark: "#000000", colorLight: "#ffffff",
                        correctLevel: QRCode.CorrectLevel.M
                    });
                    
                    setTimeout(() => {
                        const canvas = tempDiv.querySelector('canvas');
                        resolve({
                            name: inst.name,
                            type: inst.type,
                            id: inst.id,
                            base64: canvas ? canvas.toDataURL('image/png') : ''
                        });
                    }, 50);
                });
            });

            const qrData = await Promise.all(qrPromises);

            const html = `
                <!DOCTYPE html>
                <html lang="th">
                <head>
                    <meta charset="UTF-8">
                    <title>Export_QRCodes_Music</title>
                    <style>
                        @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap');
                        body { font-family: 'Sarabun', sans-serif; padding: 20px; background: #fff; color: #000; }
                        .header { text-align: center; margin-bottom: 30px; }
                        .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; }
                        .qr-card { border: 1px dashed #aaa; padding: 15px 10px; text-align: center; border-radius: 8px; break-inside: avoid; }
                        .qr-card img { width: 120px; height: 120px; margin-bottom: 10px; display: inline-block; }
                        .qr-name { font-weight: 700; font-size: 15px; margin-bottom: 2px; line-height: 1.2; }
                        .qr-id { font-size: 12px; color: #555; }
                        
                        @media print {
                            body { padding: 0; }
                            .no-print { display: none !important; }
                            .qr-card { border: 1px solid #000; }
                        }
                    </style>
                </head>
                <body>
                    <div class="header no-print">
                        <h2>คิวอาร์โค้ดเครื่องดนตรีทั้งหมด</h2>
                        <button onclick="window.print()" style="padding: 12px 24px; font-size: 16px; cursor: pointer; background: #3b82f6; color: white; border: none; border-radius: 8px; font-family: 'Sarabun', sans-serif; font-weight: 600; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                            🖨️ สั่งพิมพ์ / บันทึกเป็น PDF
                        </button>
                    </div>
                    <div class="grid">
                        ${qrData.map(d => `
                            <div class="qr-card">
                                <img src="${d.base64}" alt="QR">
                                <div class="qr-name">${escapeHtml(d.name)}</div>
                                <div class="qr-id">${escapeHtml(d.type || '-')}</div>
                            </div>
                        `).join('')}
                    </div>
                    <script>
                        setTimeout(() => window.print(), 800);
                    </script>
                </body>
                </html>
            `;

            printWindow.document.open();
            printWindow.document.write(html);
            printWindow.document.close();

            Swal.close();
        } catch (err) {
            console.error(err);
            toast('เกิดข้อผิดพลาดในการ Export', 'error');
            if (printWindow) printWindow.close(); 
            Swal.close();
        }
    };

    window.__oadInstrumentHistory = async (instId) => {
        const inst = state.instruments.find(i => i.id === instId);
        if (!inst) { toast('ไม่พบข้อมูลเครื่องดนตรี', 'error'); return; }

        Swal.fire({ title: 'กำลังโหลดประวัติ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        try {
            // โค้ดเดิมของคุณ: ดึงข้อมูลประวัติการยืม
            const { data: borrowData, error: borrowErr } = await adminExt.getInstrumentBorrowLogs(instId);
            if (borrowErr) throw borrowErr;

            // โหลดประวัติซ่อมลง State (ใช้ฟังก์ชันเดิมของคุณ)
            if (!state.repairHistory || state.repairHistory.length === 0) {
                await loadRepairHistory();
            }

            let timeline = [];
            
            // --- 1. ใส่ข้อมูลการยืมลง Timeline (โค้ดเดิมของคุณทั้งหมด) ---
            (borrowData || []).forEach(b => {
                const userObj = state.users.find(u => u.id === b.student_id);
                const displayName = userObj ? `${userObj.first_name || ''} ${userObj.last_name || ''}`.trim() || userObj.student_id : (b.student_name || 'ไม่ทราบชื่อ');

                timeline.push({
                    type: 'borrow',
                    date: b.borrow_timestamp,
                    user_id: b.student_id,
                    user_name: displayName,
                    detail: `จำนวน ${b.borrow_quantity || 1} ชิ้น ${b.is_take_home ? '(ยืมกลับบ้าน)' : '(ยืมใน ร.ร.)'}`,
                    status: b.return_status || b.approval_status || (b.return_timestamp ? 'คืนแล้ว' : 'กำลังยืม')
                });
                
                if (b.problem_description) {
                    timeline.push({
                        type: 'repair',
                        date: b.return_timestamp || b.borrow_timestamp,
                        user_id: b.student_id,
                        user_name: displayName,
                        detail: b.problem_description,
                        status: b.repair_status || 'ชำรุด/รอซ่อม'
                    });
                }
            });

            // --- 2. [เพิ่มใหม่] นำรายการแจ้งซ่อมจาก State มาใส่ Timeline ---
            const allRepairsInState = [...state.repairs, ...(state.repairHistory || [])];
            const standaloneRepairs = allRepairsInState.filter(r => r.instrument_id === instId && !r.log_id); // กรองเฉพาะที่เป็นการซ่อมเดี่ยวๆ
            
            standaloneRepairs.forEach(r => {
                timeline.push({
                    type: 'repair',
                    date: r.report_date || r.created_at || r.updated_at,
                    user_id: r.reported_by_user_id || r.student_id,
                    user_name: escapeHtml(r.reporter_name || 'ไม่ทราบชื่อผู้แจ้ง'),
                    detail: r.problem_description || 'แจ้งซ่อม (ไม่มีรายละเอียด)',
                    status: r.repair_status || 'แจ้งซ่อม'
                });
            });

            // เรียงลำดับจากใหม่ไปเก่า
            timeline.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

            let tableHtml = timeline.length === 0 ? '<div style="text-align:center; padding:2rem;">ไม่พบประวัติการใช้งาน</div>' : `
                <div style="overflow-x:auto;">
                <table class="oad-table" style="font-size:0.85rem; width:100%; text-align:left;">
                    <thead style="background: var(--oad-surface);">
                        <tr>
                            <th>วัน/เวลา</th><th>รายการ</th><th>ผู้ทำรายการ</th><th>สถานะ</th><th style="text-align:center;">จัดการ</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${timeline.map(item => `
                            <tr style="border-bottom: 1px solid var(--oad-border);">
                                <td style="color:var(--text-muted);">${item.date ? new Date(item.date).toLocaleString('th-TH', { dateStyle:'short', timeStyle:'short' }) : '-'}</td>
                                <td>${item.type === 'borrow' ? '📦 ยืม-คืน' : '🛠️ แจ้งซ่อม'}</td>
                                <td><strong>${escapeHtml(item.user_name)}</strong></td>
                                <td>${escapeHtml(item.status)}</td>
                                <td style="text-align:center;">
                                    <button class="oad-btn oad-btn-ghost" style="padding:0.2rem 0.5rem; font-size:0.75rem;" onclick="window.__oadJumpToUser('${item.user_id}')">👤 ตรวจสอบ</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                </div>
            `;

            Swal.fire({
                title: `📜 ประวัติ: ${escapeHtml(inst.name)}`,
                width: '850px',
                html: `<div style="max-height:60vh; overflow-y:auto;">${tableHtml}</div>`,
                showCloseButton: true, showConfirmButton: false
            });

        } catch (err) {
            Swal.fire('ผิดพลาด', err.message, 'error');
        }
    };

    window.__oadJumpToUser = (userId) => {
        Swal.close();
        const user = state.users.find(u => u.id === userId);
        if (!user) { toast('ไม่พบข้อมูลผู้ใช้ในระบบ', 'error'); return; }
        
        const fullName = `${user.prefix||''} ${user.first_name||''} ${user.last_name||''}`.trim();
        
        Swal.fire({
            title: 'การจัดการผู้ใช้',
            html: `
                <div style="text-align:left; background:var(--oad-surface); padding:1rem; border-radius:8px;">
                    <div style="display:flex; align-items:center; gap:1rem; margin-bottom:1rem;">
                        <img src="${escapeHtml(user.profile_image_url || 'assets/default-avatar.png')}" style="width:50px; height:50px; border-radius:50%; object-fit:cover;">
                        <h5 style="margin:0;">${escapeHtml(fullName)}</h5>
                    </div>
                    <p style="font-size:0.9rem; margin:0;">รหัส: ${escapeHtml(user.student_id || '-')}</p>
                    <p style="font-size:0.9rem; margin:0;">สถานะ: ${user.is_blocked ? '🚫 ถูกบล็อก' : '✅ ปกติ'}</p>
                </div>
            `,
            showDenyButton: true,
            confirmButtonText: '✏️ แก้ไขข้อมูล',
            denyButtonText: user.is_blocked ? '🔓 ปลดบล็อก' : '🚫 บล็อกผู้ใช้',
        }).then((result) => {
            if (result.isConfirmed) window.__oadEditUser(userId);
            else if (result.isDenied) {
                if (user.is_blocked) window.__oadUnblock(userId);
                else window.__oadBlock(userId, fullName);
            }
        });
    };

    window.__oadEditRule = async (ruleId) => {
        try {
            Swal.fire({ title: 'กำลังโหลดข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

            const { data: ruleData, error: fetchErr } = await adminExt.getXpRuleById(ruleId);
                
            if (fetchErr) throw fetchErr;
            if (!ruleData) {
                Swal.fire('ผิดพลาด', 'ไม่พบข้อมูลกฎนี้ในระบบ', 'error');
                return;
            }
            
            Swal.close(); 

            const { value: formValues } = await Swal.fire({
                title: '✏️ แก้ไขกฎ EXP',
                html: `
                    <div style="text-align:left;">
                        <label style="font-size:0.85rem; font-weight:bold; color:var(--text-muted);">ชื่อกิจกรรม/กฎ</label>
                        <input id="edit-rule-name" class="swal2-input" placeholder="ชื่อกฎ" value="${escapeHtml(ruleData.rule_name || '')}" style="margin-bottom:1rem; width:100%; box-sizing:border-box; background:var(--input-bg); color:var(--text-main);">
                        
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem; margin-bottom:1rem;">
                            <div>
                                <label style="font-size:0.85rem; font-weight:bold; color:var(--text-muted);">โบนัส EXP (บวกเพิ่ม)</label>
                                <input id="edit-rule-xp" type="number" class="swal2-input" value="${ruleData.bonus_flat || 0}" style="margin:0; width:100%; box-sizing:border-box; background:var(--input-bg); color:var(--text-main);">
                            </div>
                            <div>
                                <label style="font-size:0.85rem; font-weight:bold; color:var(--text-muted);">ตัวคูณ EXP</label>
                                <input id="edit-rule-mul" type="number" step="0.1" class="swal2-input" value="${ruleData.multiplier || 1}" style="margin:0; width:100%; box-sizing:border-box; background:var(--input-bg); color:var(--text-main);">
                            </div>
                        </div>

                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem; margin-bottom:1rem;">
                            <div>
                                <label style="font-size:0.85rem; font-weight:bold; color:var(--text-muted);">เวลาเริ่ม</label>
                                <input id="edit-rule-start" type="time" class="swal2-input" value="${ruleData.start_time || ''}" style="margin:0; width:100%; box-sizing:border-box; background:var(--input-bg); color:var(--text-main);">
                            </div>
                            <div>
                                <label style="font-size:0.85rem; font-weight:bold; color:var(--text-muted);">เวลาสิ้นสุด</label>
                                <input id="edit-rule-end" type="time" class="swal2-input" value="${ruleData.end_time || ''}" style="margin:0; width:100%; box-sizing:border-box; background:var(--input-bg); color:var(--text-main);">
                            </div>
                        </div>
                    </div>
                `,
                focusConfirm: false,
                showCancelButton: true,
                confirmButtonText: 'บันทึก',
                cancelButtonText: 'ยกเลิก',
                preConfirm: () => {
                    const name = document.getElementById('edit-rule-name').value.trim();
                    if (!name) { Swal.showValidationMessage('กรุณากรอกชื่อกฎให้ครบถ้วน'); return false; }
                    return {
                        rule_name: name,
                        bonus_flat: parseInt(document.getElementById('edit-rule-xp').value) || 0,
                        multiplier: parseFloat(document.getElementById('edit-rule-mul').value) || 1,
                        start_time: document.getElementById('edit-rule-start').value || null,
                        end_time: document.getElementById('edit-rule-end').value || null
                    }
                }
            });

            if (formValues) {
                Swal.showLoading();
                const { error } = await adminExt.updateXpRule(ruleId, formValues);
                
                if (error) throw error;
                
                toast('✅ อัปเดตกฎเรียบร้อย', 'success');
                if (typeof renderConfigTab === 'function') renderConfigTab();
            }
        } catch (err) {
            Swal.fire('ผิดพลาด', 'ไม่สามารถแก้ไขกฎได้: ' + err.message, 'error');
        }
    };

    window.__oadStartFlashBoost = async () => {
        const xp = parseInt(document.getElementById('quick-boost-xp').value);
        const mins = parseInt(document.getElementById('quick-boost-mins').value);

        if (!xp || !mins) { toast('กรุณากรอกจำนวน EXP และเวลาให้ครบ', 'error'); return; }

        const until = Date.now() + (mins * 60000);
        
        Swal.showLoading();
        const { error } = await adminExt.upsertSystemSettings([
            { key: 'flash_boost_xp', value: xp, description: 'EXP นาทีทอง' },
            { key: 'flash_boost_until', value: until, description: 'เวลาหมดอายุนาทีทอง' }
        ]);

        if (error) { toast('ผิดพลาด: ' + error.message, 'error'); return; }

        toast('🔥 เปิดนาทีทองแล้ว!', 'success');
        
        if (!state.stats.settings) state.stats.settings = [];
        const updateSet = (k, v) => {
            const f = state.stats.settings.find(x => x.key === k);
            if (f) f.value = v; else state.stats.settings.push({ key: k, value: v, description: k });
        };
        updateSet('flash_boost_xp', xp);
        updateSet('flash_boost_until', until);
        
        Swal.close();
        renderFlashBoost(); 
    };

    window.__oadStopFlashBoost = async () => {
        Swal.showLoading();
        const { error } = await adminExt.upsertSystemSettings([
            { key: 'flash_boost_until', value: 0, description: 'เวลาหมดอายุนาทีทอง' }
        ]);
        
        if (error) { toast('ผิดพลาด: ' + error.message, 'error'); return; }

        toast('⏹️ ปิดโปรโมชั่นแล้ว', 'success');
        const s = state.stats?.settings?.find(x => x.key === 'flash_boost_until');
        if (s) s.value = 0;
        
        Swal.close();
        renderFlashBoost(); 
    };

    window.__oadUserHistory = async (userId, userName) => {
        Swal.fire({ title: 'กำลังโหลด...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            const [
                { data: borrows, error: borrowError },
                { data: games, error: gameError },
                { data: learning, error: learningError },
                { data: repairs }
            ] = await Promise.all([
                adminExt.getUserBorrowLogs(userId),
                adminExt.getUserGameSessions(userId),
                adminExt.getUserLearningSessions(userId),
                adminExt.getUserRepairLogs(userId)
            ]);

            if (borrowError || gameError || learningError)
                throw borrowError || gameError || learningError;

            const totalBorrows = borrows?.length || 0;
            const totalReturned = borrows?.filter(h => h.return_timestamp).length || 0;
            const totalForced = borrows?.filter(h => h.is_force_returned).length || 0;
            const totalNormalReturned = totalReturned - totalForced;
            const stillOut = totalBorrows - totalReturned;
            const totalRepairs = repairs?.length || 0;

            const allActivities = [];

            borrows?.forEach(b => {
                allActivities.push({ type: 'borrow', timestamp: b.borrow_timestamp, data: b });
            });

            repairs?.forEach(r => {
                allActivities.push({ type: 'repair', timestamp: r.created_at || r.report_date, data: r });
            });

            games?.forEach(g => {
                allActivities.push({ type: 'game', timestamp: g.start_time, data: g });
            });

            learning?.forEach(l => {
                allActivities.push({ type: 'learning', timestamp: l.created_at || l.start_time, data: l });
            });

            allActivities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            let historyHtml = !allActivities.length ? '<p style="text-align:center; padding:2rem;">ไม่พบประวัติใดๆ</p>' : `
                <div style="display:flex; gap:0.5rem; margin-bottom:0.75rem; flex-wrap:wrap; font-size:0.78rem;">
                    <span style="background:rgba(99,102,241,0.15); border:1px solid rgba(99,102,241,0.3); border-radius:99px; padding:2px 10px; color:#a5b4fc;">
                        📦 ยืม ${totalBorrows}
                    </span>
                    <span style="background:rgba(16,185,129,0.15); border:1px solid rgba(16,185,129,0.3); border-radius:99px; padding:2px 10px; color:#6ee7b7;">
                        ✅ คืน ${totalNormalReturned}
                    </span>
                    ${stillOut > 0 ? `<span style="background:rgba(245,158,11,0.15); border:1px solid rgba(245,158,11,0.3); border-radius:99px; padding:2px 10px; color:#fcd34d;">
                        ⏳ ค้างคืน ${stillOut}
                    </span>` : ''}
                    ${totalForced > 0 ? `<span style="background:rgba(239,68,68,0.15); border:1px solid rgba(239,68,68,0.3); border-radius:99px; padding:2px 10px; color:#fca5a5;">
                        🔴 บังคับคืน ${totalForced}
                    </span>` : ''}
                    ${totalRepairs > 0 ? `<span style="background:rgba(251,146,60,0.15); border:1px solid rgba(251,146,60,0.3); border-radius:99px; padding:2px 10px; color:#fdba74;">
                        🔧 แจ้งซ่อม ${totalRepairs}
                    </span>` : ''}
                    <span style="background:rgba(139,92,246,0.15); border:1px solid rgba(139,92,246,0.3); border-radius:99px; padding:2px 10px; color:#c4b5fd;">
                        🎮 เกม ${games?.length || 0}
                    </span>
                    <span style="background:rgba(236,72,153,0.15); border:1px solid rgba(236,72,153,0.3); border-radius:99px; padding:2px 10px; color:#f9a8d4;">
                        🎬 ดูคลิป ${learning?.length || 0}
                    </span>
                </div>
                <div style="overflow-x:auto;">
                    <table class="oad-table" style="font-size:0.75rem;">
                        <thead><tr><th>วันเวลา</th><th>ประเภท</th><th>รายละเอียด</th></tr></thead>
                        <tbody>
                            ${allActivities.map(act => {
                                const date = new Date(act.timestamp);
                                const dateStr = isNaN(date) ? '—' : date.toLocaleDateString('th-TH');
                                const timeStr = isNaN(date) ? '' : date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
                                let row = '';

                                if (act.type === 'borrow') {
                                    const h = act.data;
                                    const instName = h.instruments?.name || '—';
                                    let returnStr = '';
                                    if (h.is_force_returned) {
                                        const retDate = h.return_timestamp ? new Date(h.return_timestamp).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : '—';
                                        returnStr = ` <span style="color:#fca5a5; font-size:0.72rem;">🔴 บังคับคืน ${retDate}</span>`;
                                    } else if (h.return_timestamp) {
                                        const retDate = new Date(h.return_timestamp).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
                                        returnStr = ` <span style="color:#6ee7b7; font-size:0.72rem;">✅ คืน ${retDate}</span>`;
                                    } else {
                                        returnStr = ` <span style="color:#fcd34d; font-size:0.72rem;">⏳ ยังไม่คืน</span>`;
                                    }
                                    row = `<tr><td style="white-space:nowrap;">${dateStr} ${timeStr}</td><td>📦 ยืม</td><td><strong>${escapeHtml(instName)}</strong>${returnStr}</td></tr>`;
                                } else if (act.type === 'repair') {
                                    const r = act.data;
                                    const instName = r.instruments?.name || '—';
                                    const status = r.repair_status || 'แจ้งซ่อมแล้ว';
                                    const problem = r.problem_description ? escapeHtml(r.problem_description) : '';
                                    row = `<tr><td style="white-space:nowrap;">${dateStr} ${timeStr}</td><td>🔧 ซ่อม</td><td><strong>${escapeHtml(instName)}</strong> [${status}]${problem ? ` — ${problem}` : ''}</td></tr>`;
                                } else if (act.type === 'game') {
                                    const g = act.data;
                                    const duration = g.duration_minutes ? ` (${g.duration_minutes} นาที)` : '';
                                    const score = g.score ? ` • ${g.score} คะแนน` : '';
                                    row = `<tr><td style="white-space:nowrap;">${dateStr} ${timeStr}</td><td>🎮 เกม</td><td>${escapeHtml(g.game_name || '—')}${duration}${score}</td></tr>`;
                                } else if (act.type === 'learning') {
                                    const l = act.data;
                                    const title = l.knowledge_links?.title ? escapeHtml(l.knowledge_links.title) : 'ดูคลิป';
                                    const duration = l.minutes_added ? ` (${l.minutes_added} นาที)` : '';
                                    row = `<tr><td style="white-space:nowrap;">${dateStr} ${timeStr}</td><td>🎬 ดูคลิป</td><td>${title}${duration}</td></tr>`;
                                }
                                return row;
                            }).join('')}
                        </tbody>
                    </table>
                </div>`;

            Swal.fire({ title: `ประวัติ: ${userName}`, width: '750px', html: historyHtml, showCloseButton: true, showConfirmButton: false });
        } catch (err) { toast('ผิดพลาด: ' + err.message, 'error'); }
    };

    window.__oadToggleDeactivate = async (userId, shouldDeactivate) => {
        const actionText = shouldDeactivate ? 'ปิดบัญชีใช้งาน' : 'เปิดใช้งานบัญชี';
        const { isConfirmed } = await Swal.fire({
            title: `ยืนยัน${actionText}?`,
            text: shouldDeactivate ? 'บัญชีจะถูกย้ายไปที่หมวดหมู่ "ปิดบัญชี" และไม่สามารถเข้าใช้งานได้' : 'บัญชีจะกลับมาเป็นสถานะปกติ',
            icon: 'warning', showCancelButton: true, confirmButtonText: 'ยืนยัน', cancelButtonText: 'ยกเลิก'
        });

        if (!isConfirmed) return;
        Swal.showLoading();

        const { error } = await adminExt.updateUserGroup(userId, shouldDeactivate ? 'deactivated' : 'student');

        if (error) {
            toast('ผิดพลาด: ' + error.message, 'error');
        } else {
            toast(`✅ ${actionText}เรียบร้อย`, 'success');
            const { data } = await adminExt.getUsers();
            state.users = data;
            renderUsersTable();
        }
        Swal.close();
    };

    window.__oadQuickNav = (tabId, filterValue) => {
        switchTab(tabId);
        
        setTimeout(() => {
            if (tabId === 'borrows') {
                const statusFilter = document.getElementById('oad-borrow-status-filter');
                const viewFilter = document.getElementById('oad-borrow-view-select');
                
                if (filterValue === 'overdue') {
                    if (statusFilter) { statusFilter.value = 'overdue'; statusFilter.dispatchEvent(new Event('change')); }
                } else if (filterValue === 'active') {
                    if (viewFilter) { viewFilter.value = 'active'; viewFilter.dispatchEvent(new Event('change')); }
                    if (statusFilter) { statusFilter.value = 'all'; statusFilter.dispatchEvent(new Event('change')); }
                }
            } else if (tabId === 'users') {
                const statusFilter = document.getElementById('oad-user-status-filter');
                if (statusFilter) {
                    statusFilter.value = filterValue === 'blocked' ? 'blocked' : 'all';
                    statusFilter.dispatchEvent(new Event('change'));
                }
            } else if (tabId === 'instruments') {
                const statusFilter = document.getElementById('oad-inst-status-filter');
                if (statusFilter) {
                    statusFilter.value = filterValue === 'พร้อมใช้งาน' ? 'พร้อมใช้งาน' : 'all';
                    statusFilter.dispatchEvent(new Event('change'));
                }
            }
            
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }, 50);
    };

    window.__oadApproveKnowledge = async (id, isApproved) => {
        Swal.showLoading();
        const { error } = await adminExt.updateKnowledgeStatus(id, isApproved);
        if (error) toast('ผิดพลาด: ' + error.message, 'error');
        else { toast(isApproved ? '✅ อนุมัติคลังความรู้แล้ว' : 'ซ่อนคลังความรู้แล้ว', 'success'); document.getElementById('oad-refresh-btn')?.click(); }
    };

    /**
     * ⭐ NEW: Approve / reject a knowledge link via RPC.
     * - approve=true  → set is_approved=true, send notification to submitter
     * - approve=false → DELETE the row, send rejection notification
     * Used for the pending-review flow where user-submitted clips need an
     * explicit yes/no decision (different from __oadApproveKnowledge which
     * just toggles visibility for already-approved items).
     */
    window.__oadReviewKnowledge = async (id, approve) => {
        const confirmTitle = approve ? '✅ อนุมัติคลิปนี้?' : '❌ ปฏิเสธคลิปนี้?';
        const confirmText = approve
            ? 'คลิปจะแสดงใน feed ของทุกคน + แจ้งเตือนผู้ส่ง'
            : 'คลิปจะถูกลบออก + แจ้งเตือนผู้ส่งว่าไม่ผ่านการตรวจ';
        const { isConfirmed } = await Swal.fire({
            title: confirmTitle,
            text: confirmText,
            icon: approve ? 'question' : 'warning',
            showCancelButton: true,
            confirmButtonColor: approve ? '#10b981' : '#ef4444',
            confirmButtonText: approve ? 'อนุมัติ' : 'ปฏิเสธ',
            cancelButtonText: 'ยกเลิก',
        });
        if (!isConfirmed) return;

        Swal.showLoading();
        try {
            const { error } = await adminKnowledgeApi.review(id, approve);
            if (error) throw error;
            toast(approve ? '✅ อนุมัติแล้ว — แจ้งเตือนผู้ส่งเรียบร้อย' : '❌ ปฏิเสธแล้ว — แจ้งเตือนผู้ส่งเรียบร้อย', 'success');
            document.getElementById('oad-refresh-btn')?.click();
        } catch (e) {
            toast('ผิดพลาด: ' + (e?.message || 'ไม่ทราบสาเหตุ'), 'error');
        } finally {
            Swal.close();
        }
    };

    window.__oadDeleteKnowledge = async (id) => {
        const { isConfirmed } = await Swal.fire({ title: 'ลบข้อมูลนี้?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444' });
        if (!isConfirmed) return;
        const { error } = await adminExt.deleteKnowledgeLink(id);
        if (error) toast('ผิดพลาด: ' + error.message, 'error');
        else { toast('ลบสำเร็จ', 'success'); document.getElementById('oad-refresh-btn')?.click(); }
    };

    window.__oadAddKnowledge = async () => {
        const types = [...new Set(state.instruments.map(i => i.type).filter(Boolean))].sort();
        const typeOptions = types.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');

        const { value: formVals } = await Swal.fire({
            title: 'เพิ่มคลังความรู้',
            html: `
                <div style="text-align:left;">
                    <label style="font-size:0.85rem;font-weight:bold;">ชื่อเรื่อง / หัวข้อ (บังคับ)</label>
                    <input id="nk-title" class="swal2-input" style="background:var(--input-bg); color:var(--text-main); margin-bottom:1rem;">
                    
                    <label style="font-size:0.85rem;font-weight:bold;">URL ของคลิป (เช่น Youtube)</label>
                    <input id="nk-url" class="swal2-input" style="background:var(--input-bg); color:var(--text-main); margin-bottom:1rem;">
                    
                    <label style="font-size:0.85rem;font-weight:bold;">ประเภทเครื่องดนตรี</label>
                    <select id="nk-type" class="swal2-input" style="background:var(--input-bg); color:var(--text-main); margin-bottom:1rem;">
                        <option value="" disabled selected>-- เลือกประเภทเครื่องดนตรี --</option>
                        <option value="">-- ทั่วไป (ไม่ระบุ) --</option>
                        ${typeOptions}
                    </select>
                    
                    <label style="font-size:0.85rem;font-weight:bold;">คำอธิบายเพิ่มเติม</label>
                    <textarea id="nk-desc" class="swal2-textarea" style="background:var(--input-bg); color:var(--text-main);"></textarea>
                </div>
            `,
            showCancelButton: true, confirmButtonText: 'เพิ่มข้อมูล',
            preConfirm: () => {
                const title = document.getElementById('nk-title').value.trim();
                const url = document.getElementById('nk-url').value.trim();
                if (!title || !url) { Swal.showValidationMessage('กรุณากรอกชื่อเรื่องและ URL'); return false; }
                return { 
                    title, 
                    youtube_url: url, 
                    instrument_type: document.getElementById('nk-type').value.trim() || null, 
                    description: document.getElementById('nk-desc').value.trim() || null, 
                    is_approved: true 
                };
            }
        });
        if (formVals) {
            Swal.showLoading();
            const { error } = await adminExt.addKnowledgeLink(formVals);
            if (error) toast('ผิดพลาด: ' + error.message, 'error');
            else { toast('เพิ่มคลังความรู้สำเร็จ!', 'success'); document.getElementById('oad-refresh-btn')?.click(); }
        }
    };

    window.__oadEditKnowledge = async (id) => {
        const link = state.knowledgeLinks.find(l => l.id === id);
        if (!link) return;

        const types = [...new Set(state.instruments.map(i => i.type).filter(Boolean))].sort();
        const typeOptions = types.map(t => `<option value="${escapeHtml(t)}" ${link.instrument_type === t ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('');

        const { value: formVals } = await Swal.fire({
            title: 'แก้ไขคลังความรู้',
            html: `
                <div style="text-align:left;">
                    <label style="font-size:0.85rem;font-weight:bold;">ชื่อเรื่อง / หัวข้อ</label>
                    <input id="ek-title" class="swal2-input" value="${escapeHtml(link.title)}" style="background:var(--input-bg); color:var(--text-main); margin-bottom:1rem;">
                    
                    <label style="font-size:0.85rem;font-weight:bold;">URL ของคลิป</label>
                    <input id="ek-url" class="swal2-input" value="${escapeHtml(link.youtube_url)}" style="background:var(--input-bg); color:var(--text-main); margin-bottom:1rem;">
                    
                    <label style="font-size:0.85rem;font-weight:bold;">ประเภทเครื่องดนตรี</label>
                    <select id="ek-type" class="swal2-input" style="background:var(--input-bg); color:var(--text-main); margin-bottom:1rem;">
                        <option value="">-- ทั่วไป (ไม่ระบุ) --</option>
                        ${typeOptions}
                    </select>
                    
                    <label style="font-size:0.85rem;font-weight:bold;">คำอธิบายเพิ่มเติม</label>
                    <textarea id="ek-desc" class="swal2-textarea" style="background:var(--input-bg); color:var(--text-main);">${escapeHtml(link.description || '')}</textarea>
                </div>
            `,
            showCancelButton: true, confirmButtonText: 'บันทึกการแก้ไข',
            preConfirm: () => {
                const title = document.getElementById('ek-title').value.trim();
                const url = document.getElementById('ek-url').value.trim();
                if (!title || !url) { Swal.showValidationMessage('กรุณากรอกชื่อเรื่องและ URL'); return false; }
                return { 
                    title, 
                    youtube_url: url, 
                    instrument_type: document.getElementById('ek-type').value.trim() || null, 
                    description: document.getElementById('ek-desc').value.trim() || null 
                };
            }
        });

        if (formVals) {
            Swal.showLoading();
            const { error } = await adminExt.updateKnowledgeLink(id, formVals);
            if (error) toast('ผิดพลาด: ' + error.message, 'error');
            else { 
                toast('แก้ไขคลังความรู้สำเร็จ!', 'success'); 
                document.getElementById('oad-refresh-btn')?.click(); 
            }
        }
    };
    
    /**
     * สร้าง popup ฟอร์มสำหรับเพิ่ม/แก้ไขบอส — ใช้ร่วมกันระหว่าง add/edit
     * คืนค่า formValues ที่กรอก หรือ null ถ้ายกเลิก
     */
    const openBossForm = async (mode, existing) => {
        const v = existing || {};
        const titleText = mode === 'edit' ? '✏️ แก้ไขบอส' : '🐉 สร้างบอสใหม่ (บทสอบ)';
        const { value: formValues } = await Swal.fire({
            title: titleText,
            html: `
                <div style="text-align:left;">
                    <label>ชื่อบอส/บทสอบ</label>
                    <input id="nb-title" class="swal2-input" placeholder="เช่น มังกรไฟ" value="${escapeHtml(v.title || '')}">
                    <label>รายละเอียด</label>
                    <textarea id="nb-desc" class="swal2-textarea" placeholder="ระบุภารกิจ...">${escapeHtml(v.description || '')}</textarea>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                        <div><label>รางวัล XP</label><input id="nb-xp" type="number" class="swal2-input" value="${v.reward_xp ?? 50}"></div>
                        <div><label>รางวัลดาว ⭐️</label><input id="nb-stars" type="number" class="swal2-input" value="${v.reward_stars ?? 1}"></div>
                    </div>
                    <label>ซ้อมแก้ตัว (นาที) — กรณีตก</label>
                    <input id="nb-prac" type="number" class="swal2-input" value="${v.required_practice_mins ?? 30}">
                    <label style="display:flex; align-items:center; gap:8px; margin-top:8px; cursor:pointer;">
                        <input id="nb-active" type="checkbox" ${(v.is_active ?? true) ? 'checked' : ''}>
                        <span>เปิดใช้งานบอสตัวนี้ (นักเรียนเห็นในรายการ)</span>
                    </label>
                </div>
            `,
            focusConfirm: false,
            showCancelButton: true,
            confirmButtonText: mode === 'edit' ? 'บันทึกการแก้ไข' : 'บันทึก',
            preConfirm: () => {
                const title = document.getElementById('nb-title').value.trim();
                if (!title) { Swal.showValidationMessage('กรุณากรอกชื่อบอส'); return false; }
                return {
                    title,
                    description:            document.getElementById('nb-desc').value.trim(),
                    reward_xp:              parseInt(document.getElementById('nb-xp').value)   || 0,
                    reward_stars:           parseInt(document.getElementById('nb-stars').value) || 0,
                    required_practice_mins: parseInt(document.getElementById('nb-prac').value)  || 0,
                    is_active:              document.getElementById('nb-active').checked
                };
            }
        });
        return formValues || null;
    };

    window.__oadAddBoss = async () => {
        try {
            const formValues = await openBossForm('add');
            if (!formValues) return;
            Swal.showLoading();
            const { error } = await bossesApi.createBoss(formValues);
            if (error) {
                Swal.fire('สร้างบอสไม่สำเร็จ', error.message || String(error), 'error');
                return;
            }
            Swal.close();
            toast('✅ สร้างบอสใหม่เรียบร้อย', 'success');
            const refreshed = await bossesApi.getAllBosses();
            if (!refreshed.error) state.bosses = refreshed.data;
            renderBossesTable();
        } catch (err) {
            console.error('[Admin] Add Boss Error:', err);
            Swal.fire('เกิดข้อผิดพลาด', err.message || String(err), 'error');
        }
    };

    window.__oadEditBoss = async (bossId) => {
        try {
            const boss = (state.bosses || []).find(b => String(b.id) === String(bossId));
            if (!boss) { toast('ไม่พบบอสในแคช', 'error'); return; }
            const formValues = await openBossForm('edit', boss);
            if (!formValues) return;
            Swal.showLoading();
            const { error } = await bossesApi.updateBoss(bossId, formValues);
            if (error) {
                Swal.fire('แก้ไขไม่สำเร็จ', error.message || String(error), 'error');
                return;
            }
            Swal.close();
            toast('✅ แก้ไขบอสแล้ว', 'success');
            const refreshed = await bossesApi.getAllBosses();
            if (!refreshed.error) state.bosses = refreshed.data;
            renderBossesTable();
        } catch (err) {
            console.error('[Admin] Edit Boss Error:', err);
            Swal.fire('เกิดข้อผิดพลาด', err.message || String(err), 'error');
        }
    };

    window.__oadToggleBossActive = async (bossId, makeActive) => {
        try {
            const { error } = await bossesApi.toggleBossActive(bossId, !!makeActive);
            if (error) { toast('ผิดพลาด: ' + error.message, 'error'); return; }
            const boss = (state.bosses || []).find(b => String(b.id) === String(bossId));
            if (boss) boss.is_active = !!makeActive;
            toast(makeActive ? '🟢 เปิดใช้งานบอสแล้ว' : '⚫ ปิดบอสจากนักเรียนแล้ว', 'success');
            renderBossesTable();
        } catch (err) {
            toast('ผิดพลาด: ' + (err.message || err), 'error');
        }
    };

    window.__oadDuplicateBoss = async (bossId) => {
        try {
            const confirm = await Swal.fire({
                title: 'คัดลอกบอสนี้?',
                text: 'จะสร้างบอสใหม่ที่ตั้งค่าเหมือนต้นฉบับ (ปิดใช้งานไว้ก่อน เพื่อกันสับสน)',
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: 'คัดลอก',
                cancelButtonText: 'ยกเลิก'
            });
            if (!confirm.isConfirmed) return;
            Swal.showLoading();
            const { error } = await bossesApi.duplicateBoss(bossId);
            if (error) { Swal.fire('คัดลอกไม่สำเร็จ', error.message || String(error), 'error'); return; }
            Swal.close();
            toast('📋 คัดลอกบอสเรียบร้อย', 'success');
            const refreshed = await bossesApi.getAllBosses();
            if (!refreshed.error) state.bosses = refreshed.data;
            renderBossesTable();
        } catch (err) {
            Swal.fire('เกิดข้อผิดพลาด', err.message || String(err), 'error');
        }
    };

    /**
     * ลบบอสแบบ hard delete — บังคับให้พิมพ์ชื่อบอสยืนยัน
     * ถ้า DB ติด FK constraint (มี boss_raids/raid_lobbies ผูกอยู่) จะแนะนำให้ "ปิดใช้งาน" แทน
     */
    window.__oadDeleteBoss = async (bossId) => {
        try {
            const boss = (state.bosses || []).find(b => String(b.id) === String(bossId));
            if (!boss) { toast('ไม่พบบอส', 'error'); return; }
            const expected = boss.title;
            const { value: typed } = await Swal.fire({
                title: '🗑️ ยืนยันการลบบอส',
                html: `<div style="text-align:left;">
                    <p>การลบจะลบบอส <b>"${escapeHtml(expected)}"</b> ออกจากระบบถาวร</p>
                    <p style="color:var(--oad-red); font-weight:bold;">⚠️ ถ้ามีประวัติการสอบของนักเรียนผูกอยู่ ระบบจะลบไม่ได้ — ให้กด "ปิดใช้งาน" แทน</p>
                    <p>พิมพ์ชื่อบอส <code>${escapeHtml(expected)}</code> เพื่อยืนยัน:</p>
                    <input id="nb-confirm" class="swal2-input" placeholder="${escapeHtml(expected)}">
                </div>`,
                focusConfirm: false,
                showCancelButton: true,
                confirmButtonText: 'ลบถาวร',
                cancelButtonText: 'ยกเลิก',
                confirmButtonColor: '#dc2626',
                preConfirm: () => {
                    const v = document.getElementById('nb-confirm').value.trim();
                    if (v !== expected) { Swal.showValidationMessage('ชื่อไม่ตรง'); return false; }
                    return v;
                }
            });
            if (!typed) return;
            Swal.showLoading();
            const { error } = await bossesApi.deleteBoss(bossId);
            if (error) {
                const msg = (error.message || '').toLowerCase();
                const isFk = msg.includes('foreign key') || msg.includes('violates') || error.code === '23503';
                if (isFk) {
                    Swal.fire({
                        icon: 'warning',
                        title: 'ลบไม่ได้',
                        html: 'บอสนี้มีประวัติการสอบของนักเรียนผูกอยู่<br>แนะนำให้ <b>ปิดใช้งาน</b> แทน เพื่อให้นักเรียนไม่เห็นบอสนี้อีก'
                    });
                } else {
                    Swal.fire('ลบไม่สำเร็จ', error.message || String(error), 'error');
                }
                return;
            }
            Swal.close();
            toast('🗑️ ลบบอสแล้ว', 'success');
            state.bosses = (state.bosses || []).filter(b => String(b.id) !== String(bossId));
            renderBossesTable();
        } catch (err) {
            Swal.fire('เกิดข้อผิดพลาด', err.message || String(err), 'error');
        }
    };
    
    // ── ตรวจคลิปล่าบอส (Video Raid Review) ────────────────────────────────────
    window.__oadReviewBossRequest = async (requestId, isApproved) => {
        const req = (state.bossRequests || []).find(r => String(r.id) === String(requestId));
        const bossTitle  = req?.bosses?.title       || 'บอสนี้';
        const rewardXp   = req?.bosses?.reward_xp   ?? 0;
        const rewardStars= req?.bosses?.reward_stars ?? 0;
        const studentId  = req?.student_id;
        const studentName = req?.users
            ? `${req.users.prefix || ''} ${req.users.first_name || ''} ${req.users.last_name || ''}`.trim()
            : 'นักเรียน';

        const confirmResult = await Swal.fire({
            title: isApproved ? '✅ ยืนยันว่าผ่าน?' : '❌ ยืนยันว่าตก?',
            html: `<b>${escapeHtml(studentName)}</b> — ${escapeHtml(bossTitle)}`,
            icon: isApproved ? 'success' : 'warning',
            showCancelButton: true,
            confirmButtonText: isApproved ? 'ผ่าน + ให้รางวัล' : 'ตก ไม่ให้รางวัล',
            cancelButtonText: 'ยกเลิก',
            confirmButtonColor: isApproved ? '#22c55e' : '#ef4444',
        });
        if (!confirmResult.isConfirmed) return;

        Swal.showLoading();
        const { error } = await bossesApi.reviewRequest(
            requestId, isApproved, studentId, rewardXp, rewardStars
        );
        if (error) { Swal.fire('ผิดพลาด', error.message, 'error'); return; }

        // ส่ง notification ให้นักเรียน
        const notifTitle = isApproved ? '🎉 ผ่านการทดสอบบอสแล้ว!' : '😢 ไม่ผ่านการทดสอบบอส';
        const notifBody  = isApproved
            ? `ผ่าน "${bossTitle}" ได้รับ +${rewardXp} XP และ +${rewardStars} ⭐️`
            : `ยังไม่ผ่าน "${bossTitle}" ลองส่งคลิปใหม่ได้เลย`;
        if (studentId) {
            await notifications.save(studentId, notifTitle, notifBody);
        }

        // อัปเดต state แล้ว re-render
        state.bossRequests = (state.bossRequests || []).filter(r => String(r.id) !== String(requestId));
        Swal.close();
        toast(isApproved ? '✅ อนุมัติแล้ว รางวัลถูกมอบให้' : '❌ บันทึกว่าตกแล้ว', isApproved ? 'success' : 'info');
        renderBossVideoReviews();
        updateBadges();
    };

    window.__oadOpenLobby = async (bossId, bossTitle) => {
        try {
            Swal.showLoading();
            const user = getCurrentUser();
            
            const lobby = await raidApi.createLobby(bossId, user.id);
            state.activeLobby = lobby;
            state.activeBossTitle = bossTitle; 
            state.raidParticipants = [];
            
            state.unsubscribeRaid = raidApi.subscribeToLobby(
                lobby.id,
                async (participantPayload) => {
                    if (participantPayload.eventType === 'INSERT') {
                        const raw = participantPayload.new;
                        // Realtime payload ไม่มี join data — ต้อง fetch ชื่อแยก
                        const userData = await raidApi.getParticipantUser(raw.user_id);
                        raw.user_name = userData
                            ? `${userData.first_name || ''} ${userData.last_name || ''}`.trim() || raw.user_id
                            : raw.user_id;
                        state.raidParticipants.push(raw);
                        renderBossLobby();
                        toast('มีนักเรียนเข้าร่วมปาร์ตี้!', 'info');
                    }
                },
                (lobbyPayload) => {
                    state.activeLobby = lobbyPayload;
                    renderBossLobby();
                }
            );

            // Poll fallback — กรณี Realtime ไม่ทำงาน (publication ยังไม่เปิด)
            if (state.pollInterval) {
                clearInterval(state.pollInterval);
                state.pollInterval = null;
            }
            state.pollInterval = setInterval(async () => {
                if (!state.activeLobby || state.activeLobby.status !== 'waiting') {
                    clearInterval(state.pollInterval);
                    state.pollInterval = null;
                    return;
                }
                try {
                    const fresh = await raidApi.getParticipantsWithUsers(state.activeLobby.id);
                    const enriched = fresh.map(p => ({
                        ...p,
                        user_name: p.users
                            ? `${p.users.first_name || ''} ${p.users.last_name || ''}`.trim() || p.user_id
                            : p.user_name || p.user_id
                    }));
                    // อัปเดตเฉพาะถ้า count เปลี่ยน (ลด re-render)
                    if (enriched.length !== state.raidParticipants.length) {
                        state.raidParticipants = enriched;
                        renderBossLobby();
                    }
                } catch (_) { /* silently ignore */ }
            }, 5000);

            Swal.close();
            renderBossLobby();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (err) {
            Swal.fire('เปิดห้องไม่สำเร็จ', err.message, 'error');
        }
    };

    window.__oadCloseLobby = async () => {
        if (state.unsubscribeRaid) state.unsubscribeRaid();
        if (state.pollInterval) { clearInterval(state.pollInterval); state.pollInterval = null; }
        state.activeLobby = null;
        state.raidParticipants = [];
        state.bossStatsMap = null; // invalidate cache → renderBossesTable จะ fetch ใหม่
        renderBossLobby();
        renderBossesTable(); // re-render ตารางบอสพร้อมสถิติล่าสุด
    };

    window.__oadStartRaid = async () => {
        try {
            Swal.showLoading();
            const updatedLobby = await raidApi.updateLobbyStatus(state.activeLobby.id, 'raiding');
            state.activeLobby = updatedLobby;
            // Re-fetch ผู้เข้าร่วมพร้อมชื่อจาก DB เพื่อให้ชื่อครบถ้วน
            // (Realtime INSERT payload ไม่มี join data — นี่คือ source of truth)
            const participants = await raidApi.getParticipantsWithUsers(state.activeLobby.id);
            state.raidParticipants = participants.map(p => ({
                ...p,
                user_name: p.users
                    ? `${p.users.first_name || ''} ${p.users.last_name || ''}`.trim() || p.user_id
                    : p.user_name || p.user_id
            }));
            Swal.close();
            renderBossLobby();
        } catch (err) {
            Swal.close();
            Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
        }
    };

    window.__oadSubmitRaidResults = async () => {
        Swal.showLoading();
        try {
            const results = [];
            state.raidParticipants.forEach(p => {
                const radio = document.querySelector(`input[name="result_${p.user_id}"]:checked`);
                if (radio) {
                    results.push({ user_id: p.user_id, status: radio.value });
                }
            });

            if (results.length !== state.raidParticipants.length) {
                return Swal.fire('แจ้งเตือน', 'กรุณาให้คะแนนนักเรียนให้ครบทุกคน', 'warning');
            }

            await raidApi.submitRaidResults(state.activeLobby.id, results);

            // สร้างรายชื่อผ่าน/ตก จาก results + state.raidParticipants (ที่มีชื่อ)
            const passedList = results
                .filter(r => r.status === 'passed')
                .map(r => escapeHtml(state.raidParticipants.find(p => p.user_id === r.user_id)?.user_name || r.user_id));
            const failedList = results
                .filter(r => r.status === 'failed')
                .map(r => escapeHtml(state.raidParticipants.find(p => p.user_id === r.user_id)?.user_name || r.user_id));

            await Swal.fire({
                title: '✅ บันทึกผลสอบสำเร็จ!',
                html: `
                    <div style="text-align:left;">
                        <p style="text-align:center; margin-bottom:1rem; font-size:1.05rem;">
                            <strong>ผลสรุป: ${results.length} คน</strong>
                        </p>
                        ${passedList.length ? `
                            <div style="background:rgba(34,197,94,0.1); border:1px solid rgba(34,197,94,0.4);
                                        border-radius:10px; padding:0.75rem 1rem; margin-bottom:0.6rem;">
                                <div style="color:#22c55e; font-weight:700; margin-bottom:0.35rem;">
                                    ✅ ผ่าน (${passedList.length} คน)
                                </div>
                                <div style="font-size:0.9rem;">${passedList.join(' · ')}</div>
                            </div>
                        ` : ''}
                        ${failedList.length ? `
                            <div style="background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.4);
                                        border-radius:10px; padding:0.75rem 1rem;">
                                <div style="color:#ef4444; font-weight:700; margin-bottom:0.35rem;">
                                    ❌ ตก (${failedList.length} คน)
                                </div>
                                <div style="font-size:0.9rem;">${failedList.join(' · ')}</div>
                            </div>
                        ` : ''}
                    </div>
                `,
                icon: 'success',
                confirmButtonText: 'รับทราบ'
            });
            window.__oadCloseLobby();
        } catch (err) {
            Swal.fire('ผิดพลาด', err.message, 'error');
        }
    };
    
    window.__oadLogout = async () => {
        const { isConfirmed } = await Swal.fire({
            title: 'ยืนยันการออกจากระบบ?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'ใช่, ออกจากระบบ',
            cancelButtonText: 'ยกเลิก'
        });
        if (isConfirmed) {
            await authApi.signOut(); 
            window.location.reload();
        }
    };
}

async function loadBorrowHistory() {
    if (state.borrowHistory.length > 0) return;
    const { data } = await api.getBorrowHistory();
    state.borrowHistory = data;
}

async function loadRepairHistory() {
    if (state.repairHistory.length > 0) return;
    const { data } = await api.getRepairHistory();
    state.repairHistory = data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Render: Overview tab
// ─────────────────────────────────────────────────────────────────────────────
function renderStats() {
    const el = document.getElementById('oad-stats-row');
    const kpiEl = document.getElementById('oad-kpi-row'); // Element ใหม่สำหรับ KPI
    
    if (!el) return;
    const s = state.stats;
    
    // โหลด Skeleton หากยังไม่มีข้อมูล
    if (!s) { 
        el.innerHTML = skeleton(1, 6); 
        if (kpiEl) kpiEl.innerHTML = skeleton(1, 4);
        return; 
    }

    // ── 1. การ์ดสถานะการทำงานปัจจุบัน (Operational Stats) ──
    const cards = [
        { icon: '👥', value: s.active_total_users || 0,  label: 'ผู้ใช้ทั้งหมด',  sub: `${s.club_members || 0} ชุมนุม`,        color: '#6366f1', tab: 'users', filter: 'all' },
        { icon: '📖', value: s.borrowed_now || 0,        label: 'กำลังยืมอยู่',   sub: `${s.pending_approvals || 0} รออนุมัติ`, color: '#3b82f6', tab: 'borrows', filter: 'active' },
        { icon: '🔥', value: s.overdue_items || 0,       label: 'เกินกำหนดคืน',   sub: '',                                     color: '#ef4444', tab: 'borrows', filter: 'overdue' },
        { icon: '🛠️', value: s.actionable_repairs || 0, label: 'รายการซ่อม',     sub: `${s.cannot_repair || 0} ซ่อมไม่ได้`,   color: '#f59e0b', tab: 'repairs', filter: 'all' },
        { icon: '🎸', value: s.available_now || 0,       label: 'พร้อมให้ยืม',    sub: `/${s.total_instruments || 0} ชิ้น`,    color: '#10b981', tab: 'instruments', filter: 'พร้อมใช้งาน' },
        { icon: '🚫', value: s.blocked_users || 0,       label: 'ถูกบล็อก',       sub: '',                                     color: '#7c849c', tab: 'users', filter: 'blocked' },
    ];

    el.innerHTML = cards.map(c => `
        <div class="oad-stat-card" style="border-left:4px solid ${c.color}; cursor:pointer; transition: transform 0.15s ease, box-shadow 0.15s ease;"
             onmouseover="this.style.transform='translateY(-3px)'; this.style.boxShadow='0 6px 12px rgba(0,0,0,0.08)';"
             onmouseout="this.style.transform='none'; this.style.boxShadow='0 2px 4px rgba(0,0,0,0.02)';"
             onclick="window.__oadQuickNav('${c.tab}', '${c.filter}')">
            <span class="oad-stat-label">${c.icon} ${c.label}</span>
            <span class="oad-stat-value" style="color:${c.color}">${c.value}</span>
            ${c.sub ? `<span class="oad-stat-sub">${escapeHtml(c.sub)}</span>` : ''}
        </div>`).join('');

    // ── 2. การ์ดสถิติผลสัมฤทธิ์ (KPIs / Impact Stats) ──
    if (kpiEl) {
        const kpiCards = [
            { icon: '🔄', value: s.total_transactions || 0, label: 'ยืม-คืนทั้งหมด', sub: 'รายการผ่านระบบ', color: '#8b5cf6' },
            { icon: '📈', value: `${s.on_time_rate_after || 0}%`, label: 'อัตราคืนตรงเวลา', sub: `เพิ่มจากเดิม (${s.on_time_rate_before || 0}%)`, color: '#10b981' },
            { icon: '⏱️', value: `+${s.avg_extra_practice_days || 0}`, label: 'วันยืมซ้อมเฉลี่ย', sub: 'วันที่นร.ได้ซ้อมเพิ่มขึ้น/คน', color: '#0ea5e9' },
            { icon: '📝', value: s.total_repairs_all_time || 0, label: 'การแจ้งซ่อมทั้งหมด', sub: 'สะท้อนการใช้งานจริง', color: '#f43f5e' },
        ];

        kpiEl.innerHTML = kpiCards.map(c => `
            <div class="oad-stat-card" style="border-top:4px solid ${c.color}; background: var(--oad-surface2);">
                <span class="oad-stat-label" style="font-size: 0.85rem;">${c.icon} ${c.label}</span>
                <span class="oad-stat-value" style="color:${c.color}; font-size: 1.6rem;">${c.value}</span>
                <span class="oad-stat-sub" style="font-size: 0.75rem;">${escapeHtml(c.sub)}</span>
            </div>`).join('');
    }
}

function renderOverviewPanels() {
    const pendContainer = document.getElementById('oad-overview-pending');
    const repContainer = document.getElementById('oad-overview-repairs');
    const blockedContainer = document.getElementById('oad-overview-blocked');

    // ✨ กำหนดความสูงและทำให้เลื่อนได้ (Scrollable)
    const scrollStyle = "max-height: 260px; overflow-y: auto; padding-right: 8px;";

    // ✨ 1. จัดการคิวรออนุมัติ (ดึงทั้งหมด + เรียงล่าสุดขึ้นก่อน)
    const pend = (state.pendingBorrows || [])
        .filter(r => r && r.approval_status === 'pending')
        .sort((a, b) => {
            const tA = new Date(a.borrow_timestamp || 0).getTime();
            const tB = new Date(b.borrow_timestamp || 0).getTime();
            return (isNaN(tB) ? 0 : tB) - (isNaN(tA) ? 0 : tA);
        });

    let pendHtml = !pend.length 
        ? `<div class="oad-empty" style="padding:1.5rem 1rem;"><span class="oad-empty-icon">✨</span>ไม่มีคิวรออนุมัติ</div>` 
        : `<div style="${scrollStyle}">` + pend.map(r => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:0.6rem 0;border-bottom:1px solid var(--oad-border);gap:0.5rem;flex-wrap:wrap;">
            <div style="font-size:0.87rem;">
                <strong>${escapeHtml(r.student_name || '—')}</strong>
                <div style="color:var(--oad-muted); font-size:0.75rem;">ยืม ${escapeHtml(r.instrument_name || '—')} <span style="color: var(--oad-accent); margin-left: 4px;">• ${fmtDate(r.borrow_timestamp)}</span></div>
            </div>
            <div style="display:flex;gap:0.4rem;flex-shrink:0;">
                <button class="oad-btn oad-btn-approve" style="font-size:0.75rem;padding:0.25rem 0.6rem;" onclick="window.__oadApprove(${r.log_id}, true)">✅ อนุมัติ</button>
                <button class="oad-btn oad-btn-reject-outline" style="font-size:0.75rem;padding:0.25rem 0.6rem;" onclick="window.__oadApprove(${r.log_id}, false)">❌ ปฏิเสธ</button>
            </div>
        </div>`).join('') + `</div>`;

    if (pendContainer) pendContainer.innerHTML = pendHtml;

    // ✨ 2. จัดการคิวแจ้งซ่อม (Production UI - พร้อมเปลี่ยนสถานะ & ดูอาการเสีย)
    const activeRepairs = (state.repairs || [])
        .filter(r => r.repair_status === 'แจ้งซ่อม' || r.repair_status === 'รอซ่อม' || r.repair_status === 'กำลังซ่อม')
        .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    let repHtml = !activeRepairs.length 
        ? `<div class="oad-empty" style="padding:1.5rem 1rem;"><span class="oad-empty-icon">✅</span>ไม่มีคิวแจ้งซ่อม</div>` 
        : `<div style="${scrollStyle}">` + activeRepairs.map(r => `
        <div style="display:flex;align-items:flex-start;justify-content:space-between;padding:0.8rem 0;border-bottom:1px solid var(--oad-border);gap:0.5rem;flex-wrap:wrap;">
            <div style="font-size:0.87rem; line-height:1.4; flex:1; min-width:200px;">
                <strong>${escapeHtml(r.instrument_name || 'ไม่ทราบชื่อ')}</strong>
                <div style="font-size:0.75rem; color:var(--oad-muted);">
                    👤 แจ้งโดย: ${escapeHtml(r.reporter_name || 'ไม่ระบุ')}
                </div>
                <div style="font-size:0.75rem; color:var(--pico-del-color, #e63946); margin-top:0.4rem; background:var(--oad-surface2); padding:6px 8px; border-radius:4px; border-left:3px solid var(--pico-del-color);">
                    ⚠️ <b>อาการเสีย:</b> ${escapeHtml(r.problem_description || 'ไม่ระบุรายละเอียด')}
                </div>
            </div>
            
            <div style="margin-top: 0.2rem;">
                <select 
                    class="oad-select" 
                    style="font-size: 0.75rem; padding: 0.2rem 1.5rem 0.2rem 0.5rem; height: auto; min-height: 0; min-width: 120px; cursor: pointer; border: 1px solid var(--oad-border);"
                    onchange="window.__oadQuickUpdateRepairStatus('${r.id}', '${r.instrument_id}', this.value, this, '${r.reported_by_user_id || r.student_id || ''}')"
                    data-old-value="${r.repair_status}"
                >
                    <option value="แจ้งซ่อม" ${r.repair_status === 'แจ้งซ่อม' ? 'selected' : ''}>🔴 แจ้งซ่อม</option>
                    <option value="รอซ่อม" ${r.repair_status === 'รอซ่อม' ? 'selected' : ''}>🟠 รอซ่อม (ยืมได้)</option>
                    <option value="กำลังซ่อม" ${r.repair_status === 'กำลังซ่อม' ? 'selected' : ''}>🟡 กำลังซ่อม</option>
                    <option value="ซ่อมเสร็จสิ้น" ${r.repair_status === 'ซ่อมเสร็จสิ้น' ? 'selected' : ''}>🟢 ซ่อมเสร็จสิ้น</option>
                    <option value="ไม่สามารถซ่อมได้" ${r.repair_status === 'ไม่สามารถซ่อมได้' ? 'selected' : ''}>⚫ ไม่สามารถซ่อมได้</option>
                </select>
            </div>
        </div>`).join('') + `</div>`;

    if (repContainer) repContainer.innerHTML = repHtml;

    // ✨ 3. จัดการผู้ใช้ถูกบล็อก
    const blocked = (state.users || [])
        .filter(u => u && u.is_blocked)
        .sort((a, b) => {
            const tA = new Date(a.updated_at || a.created_at || 0).getTime();
            const tB = new Date(b.updated_at || b.created_at || 0).getTime();
            return (isNaN(tB) ? 0 : tB) - (isNaN(tA) ? 0 : tA);
        });

    let blockHtml = !blocked.length 
        ? `<div class="oad-empty" style="padding:1.5rem 1rem;"><span class="oad-empty-icon">✅</span>ไม่มีผู้ใช้ที่ถูกบล็อก</div>` 
        : `<div style="${scrollStyle}">` + blocked.map(u => {
        const fullName = `${u.prefix||''} ${u.first_name||''} ${u.last_name||''}`.trim() || u.email || '—';
        return `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:0.6rem 0;border-bottom:1px solid var(--oad-border);gap:0.5rem;flex-wrap:wrap;">
            <div style="font-size:0.87rem; line-height:1.2;">
                <strong>${escapeHtml(fullName)}</strong>
                <div style="font-size:0.75rem; color:var(--oad-red); margin-top:0.2rem;">เหตุผล: ${escapeHtml(u.block_reason || 'ไม่มีระบุ')}</div>
            </div>
            <button class="oad-btn oad-btn-green" style="font-size:0.75rem; padding:0.2rem 0.5rem;" onclick="window.__oadUnblock('${u.id}')">🔓 ปลดบล็อก</button>
        </div>`;
    }).join('') + `</div>`;

    if (blockedContainer) blockedContainer.innerHTML = blockHtml;
}

// ─────────────────────────────────────────────────────────────────────────────
// Render: Borrows tab
// ─────────────────────────────────────────────────────────────────────────────
function getBorrowView() {
    return document.getElementById('oad-borrow-view-select')?.value || 'active';
}

function renderBorrowsTable() {
    const wrap    = document.getElementById('oad-borrow-table-wrap');
    if (!wrap) return;
    const search  = (document.getElementById('oad-borrow-search')?.value || '').toLowerCase();
    const sf      = state.filters.borrows;
    const view    = getBorrowView();

    let rows;
    if (view === 'active') rows = state.borrows;
    else if (view === 'pending') rows = state.pendingBorrows;
    else rows = state.borrowHistory;

    if (search) {
        rows = rows.filter(r =>
            (r.student_name  || r.borrower_name || '').toLowerCase().includes(search) ||
            (r.instrument_name || '').toLowerCase().includes(search)
        );
    }

    if (view === 'active') {
        rows = [...rows].sort((a, b) => {
            const av = a['borrow_timestamp'] || '';
            const bv = b['borrow_timestamp'] || '';
            return sf.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
        });

        if (!rows.length) {
            wrap.innerHTML = `<div class="oad-empty"><span class="oad-empty-icon">✨</span>ไม่มีเครื่องดนตรีที่กำลังยืมอยู่</div>`;
            return;
        }
        wrap.innerHTML = `
            <table class="oad-table">
                <thead><tr>
                    <th>ผู้ยืม</th>
                    <th>เครื่องดนตรี</th>
                    <th>ยืมมาแล้ว / เหลือเวลา</th>
                    <th>ประเภท</th>
                    <th>สถานะ</th>
                    <th>จัดการ</th>
                </tr></thead>
                <tbody>
                ${rows.map(r => {
                    // 🟢 FIX: เดิมตัดสินทุกอย่างจาก is_take_home อย่างเดียว ทำให้
                    //   - ยืมออกงาน (performance) ขึ้นว่า "ในโรงเรียน"
                    //   - ยืมออกงานเกิน 6 ชม. (ปกติมาก) ถูกตีว่าเลยกำหนด
                    // ตอนนี้ใช้ borrow_type + is_overdue ที่ RPC คำนวณให้จาก expected_return_at
                    const type = r.borrow_type || (r.is_take_home ? 'take_home' : 'in_school');
                    const isOverdue = r.is_overdue === true;
                    const needsApproval = r.approval_status === 'pending';

                    const statusBadge = needsApproval ? badge('pending')
                                      : isOverdue     ? badge('overdue')
                                      : badge('active');

                    const TYPE_BADGE = {
                        in_school:   '<span class="oad-badge oad-badge-blue">🏫 ในโรงเรียน</span>',
                        performance: '<span class="oad-badge oad-badge-amber">🎭 ออกงาน</span>',
                        take_home:   '<span class="oad-badge oad-badge-purple">🏠 กลับบ้าน</span>',
                        special:     '<span class="oad-badge oad-badge-gray">📝 กรณีพิเศษ</span>'
                    };

                    // 🕐 Live timer cell — countdown สำหรับ take-home, elapsed สำหรับ in-school
                    // ⚠️ ห้ามเปลี่ยนทิศทางการนับ: ยืมในโรงเรียน/ออกงานต้อง "นับเดินหน้า"
                    // เพราะเวลาที่เดินไปถูกใช้สะสมเป็นเวลาซ้อมของนักเรียน
                    const countsDown = (type === 'take_home' || type === 'special');
                    const timerCell = countsDown
                        ? `<div style="font-size:0.85rem;">
                              <div style="font-size:0.7rem; color:var(--oad-muted);">📅 กำหนดคืน ${fmtDateShort(r.due_date)}</div>
                              <div class="oad-live-countdown" data-due="${escapeHtml(r.due_date || '')}" style="font-weight:700; color:var(--oad-accent);">…</div>
                           </div>`
                        : `<div style="font-size:0.85rem;">
                              <div style="font-size:0.7rem; color:var(--oad-muted);">⏱️ ยืมเมื่อ ${fmtDate(r.borrow_timestamp)}</div>
                              <div class="oad-live-elapsed" data-start="${escapeHtml(r.borrow_timestamp || '')}" style="font-weight:700; font-family:monospace; color:var(--oad-accent);">00:00:00</div>
                           </div>`;

                    return `<tr>
                        <td><div class="oad-user-cell">
                            <span class="oad-user-name">${escapeHtml(r.student_name || '—')}</span>
                        </div></td>
                        <td class="nowrap">${escapeHtml(r.instrument_name || '—')}</td>
                        <td>${timerCell}</td>
                        <td>${TYPE_BADGE[type] || TYPE_BADGE.in_school}</td>
                        <td>${statusBadge}</td>
                        <td><div class="actions">
                            <button class="oad-btn oad-btn-red" onclick="window.__oadForceReturn(${r.log_id})">↩ บังคับคืน</button>
                        </div></td>
                    </tr>`;
                }).join('')}
                </tbody>
            </table>`;

        // ⏱️ Start live timer (update every second)
        _startAdminBorrowTimer();

    } else if (view === 'pending') {
        const pending = rows.filter(r => r.approval_status === 'pending');
        if (!pending.length) {
            wrap.innerHTML = `<div class="oad-empty"><span class="oad-empty-icon">✨</span>ไม่มีรายการรออนุมัติ</div>`;
            return;
        }
        wrap.innerHTML = `
            <table class="oad-table">
                <thead><tr>
                    <th>ผู้ยืม</th>
                    <th>เครื่องดนตรี</th>
                    <th>วันกำหนดคืน</th>
                    <th>สถานะ</th>
                    <th>จัดการ</th>
                </tr></thead>
                <tbody>
                ${pending.map(r => `<tr>
                    <td>${escapeHtml(r.student_name || '—')}</td>
                    <td>${escapeHtml(r.instrument_name || '—')}</td>
                    <td class="nowrap">${fmtDateShort(r.due_date)}</td>
                    <td><span class="oad-badge oad-badge-amber">⏳ รออนุมัติ</span></td>
                    <td><div class="oad-approval-actions">
                        <button class="oad-btn oad-btn-approve" onclick="window.__oadApprove(${r.log_id}, true)">✅ อนุมัติ</button>
                        <button class="oad-btn oad-btn-reject-outline" onclick="window.__oadApprove(${r.log_id}, false)">❌ ปฏิเสธ</button>
                    </div></td>
                </tr>`).join('')}
                </tbody>
            </table>`;

    } else {
        const page = sf.page || 0;
        const total = rows.length;
        const paginated = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

        if (!rows.length) {
            wrap.innerHTML = `<div class="oad-empty"><span class="oad-empty-icon">📜</span>ไม่มีประวัติ</div>`;
            document.getElementById('oad-borrow-pagination').innerHTML = '';
            return;
        }

        wrap.innerHTML = `
            <table class="oad-table">
                <thead><tr>
                    <th>ผู้ยืม</th><th>เครื่องดนตรี</th>
                    <th>เวลายืม</th><th>เวลาคืน</th><th>สถานะ</th>
                </tr></thead>
                <tbody>
                ${paginated.map(r => {
                    let st = 'active';
                    if (r.return_timestamp) st = 'returned';
                    else if (r.is_take_home && r.approval_status === 'pending') st = 'pending';
                    return `<tr>
                        <td>${escapeHtml(r.borrower_name || r.student_name || '—')}</td>
                        <td>${escapeHtml(r.instrument_name || '—')}</td>
                        <td class="nowrap">${fmtDate(r.borrow_timestamp)}</td>
                        <td class="nowrap">${fmtDate(r.return_timestamp)}</td>
                        <td>${badge(st)}</td>
                    </tr>`;
                }).join('')}
                </tbody>
            </table>`;

        renderPagination('oad-borrow-pagination', page, total, (p) => {
            state.filters.borrows.page = p;
            renderBorrowsTable();
        });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Render: Repairs tab
// ─────────────────────────────────────────────────────────────────────────────
async function renderRepairsTable() {
    const wrap   = document.getElementById('oad-repair-table-wrap');
    if (!wrap) return;

    // 1. เรียกใช้ฟังก์ชันเดิมของคุณ เพื่อโหลดประวัติซ่อมถ้ายังไม่มี
    if (!state.repairHistory || state.repairHistory.length === 0) {
        await loadRepairHistory();
    }

    const search = (document.getElementById('oad-repair-search')?.value || '').toLowerCase();
    const statF  = document.getElementById('oad-repair-status-filter')?.value || 'all';

    // 2. เอาข้อมูลแจ้งซ่อมปัจจุบัน และ ประวัติซ่อม มารวมกัน (จาก API เดิมของคุณล้วนๆ)
    const activeIds = new Set(state.repairs.map(r => r.id || r.repair_id || r.log_id));
    const uniqueHistory = (state.repairHistory || []).filter(h => !activeIds.has(h.id || h.repair_id || h.log_id));
    
    let rows = [...state.repairs, ...uniqueHistory];

    // 3. ปรับการเรียงลำดับให้ล่าสุดขึ้นก่อน โดยเผื่อกรณีใช้ฟิลด์เวลาชื่ออื่น
    rows.sort((a, b) => new Date(b.report_date || b.created_at || b.updated_at || 0) - new Date(a.report_date || a.created_at || a.updated_at || 0));

    if (search) rows = rows.filter(r =>
        (r.instrument_name || '').toLowerCase().includes(search) ||
        (r.reporter_name || '').toLowerCase().includes(search)
    );
    const DONE_STATUSES = ['ซ่อมเสร็จสิ้น', 'ไม่สามารถซ่อมได้'];
    if (statF === 'active') {
        rows = rows.filter(r => !DONE_STATUSES.includes(r.repair_status));
    } else if (statF !== 'all') {
        rows = rows.filter(r => r.repair_status === statF);
    }

    if (!rows.length) {
        wrap.innerHTML = `<div class="oad-empty"><span class="oad-empty-icon">🛠️</span>ไม่มีรายการแจ้งซ่อม</div>`;
        return;
    }

    wrap.innerHTML = `
        <table class="oad-table">
            <thead><tr>
                <th>เครื่องดนตรี</th>
                <th>ปัญหา</th>
                <th>ผู้แจ้ง</th>
                <th>สถานะ</th>
                <th>ค่าซ่อม</th>
                <th>จัดการ</th>
            </tr></thead>
            <tbody>
            ${rows.map(r => {
                const repId = r.id || r.repair_id || r.log_id;
                return `<tr>
                    <td class="nowrap"><strong>${escapeHtml(r.instrument_name || '—')}</strong></td>
                    <td style="max-width:220px;white-space:pre-wrap;word-break:break-word;">${escapeHtml(r.problem_description || '—')}</td>
                    <td class="nowrap">${escapeHtml(r.reporter_name || '—')}</td>
                    <td>${badge(r.repair_status)}</td>
                    <td class="nowrap">${r.repair_cost ? `฿${Number(r.repair_cost).toLocaleString()}` : '—'}</td>
                    <td><div class="actions">
                        ${repId && !['ซ่อมเสร็จสิ้น','ไม่สามารถซ่อมได้'].includes(r.repair_status)
                            ? `<button class="oad-btn oad-btn-ghost" onclick="window.__oadEditRepair(${repId})">✏️ อัปเดต</button>`
                            : '—'}
                    </div></td>
                </tr>`;
            }).join('')}
            </tbody>
        </table>`;
}

function renderUsersTable() {
    const wrap = document.getElementById('oad-user-table-wrap');
    if (!wrap) return;

    const search = (document.getElementById('oad-user-search')?.value || '').toLowerCase();
    const group  = document.getElementById('oad-user-group-filter')?.value || 'all';
    const status = document.getElementById('oad-user-status-filter')?.value || 'all';
    const classF = document.getElementById('oad-user-class-filter')?.value || 'all';

    let rows = state.users;

    if (status === 'closed') {
        rows = rows.filter(r => r.student_group === 'deactivated');
    } else {
        rows = rows.filter(r => r.student_group !== 'deactivated');
        if (status === 'blocked') rows = rows.filter(r => r.is_blocked);
        if (status === 'normal')  rows = rows.filter(r => !r.is_blocked);
    }

    // 👔 กรองตามสถานะการเลือกชุด — มีผลเฉพาะสมาชิกชุมนุม (คนอื่นไม่มีชุดประจำตัว)
    const kitF = document.getElementById('oad-user-kit-filter')?.value || 'all';
    if (kitF !== 'all') {
        rows = rows.filter(r => r.student_group === 'club'
            && (kitF === 'has' ? _userKitMap.has(r.id) : !_userKitMap.has(r.id)));
    }
    _renderKitStatusSummary();

    if (group !== 'all') {
        rows = rows.filter(r => r.student_group === group);
    }

    if (classF !== 'all' && (group === 'student' || group === 'club')) {
        rows = rows.filter(r => r.class_level === classF);
    }

    if (search) {
        rows = rows.filter(r => {
            const name = `${r.first_name || ''} ${r.last_name || ''} ${r.student_id || ''}`.toLowerCase();
            return name.includes(search);
        });
    }

    if (!rows.length) {
        wrap.innerHTML = `<div class="oad-empty"><span class="oad-empty-icon">👤</span>ไม่พบข้อมูลผู้ใช้</div>`;
        return;
    }

    wrap.innerHTML = `
        <table class="oad-table">
            <thead><tr>
                <th>ชื่อ</th>
                <th>กลุ่ม</th>
                <th>ชั้นเรียน</th>
                <th style="text-align:center;">เลเวล / EXP</th>
                <th>กิจกรรม</th>
                <th style="text-align:center;">สถานะ</th>
                <th style="text-align:center;">จัดการ</th>
            </tr></thead>
            <tbody>
            ${rows.map(r => {
                const fullName = `${r.prefix||''} ${r.first_name||''} ${r.last_name||''}`.trim() || r.email || '—';
                const xp = r.xp || 0;
                const level = Math.floor(xp / 100) + 1;

                const isDeactivated = r.student_group === 'deactivated';

                let statusBadge = '';
                if (isDeactivated) {
                    statusBadge = '<span class="oad-badge oad-badge-gray">📁 ปิดบัญชี</span>';
                } else if (r.is_blocked) {
                    statusBadge = `<span class="oad-badge oad-badge-red" title="${escapeHtml(r.block_reason||'')}">🚫 บล็อก</span>`;
                } else {
                    statusBadge = '<span class="oad-badge oad-badge-green">✓ ปกติ</span>';
                }

                // 📊 Activity column — last_seen + active borrows
                const activityHtml = (() => {
                    const lastSeen = r.last_seen_at ? new Date(r.last_seen_at) : null;
                    const profileUpdated = r.profile_updated_at ? new Date(r.profile_updated_at) : null;
                    const now = Date.now();

                    let activityLine = '';
                    if (lastSeen) {
                        const diffMin = Math.floor((now - lastSeen.getTime()) / 60000);
                        if (diffMin < 5) activityLine = '<span style="color:#10b981; font-weight:600;">🟢 ออนไลน์</span>';
                        else if (diffMin < 60) activityLine = `<span style="color:#10b981; font-size:0.75rem;">🟢 ${diffMin} นาทีก่อน</span>`;
                        else if (diffMin < 1440) activityLine = `<span style="color:#f59e0b; font-size:0.75rem;">🟡 ${Math.floor(diffMin/60)} ชม.ก่อน</span>`;
                        else if (diffMin < 10080) activityLine = `<span style="color:#94a3b8; font-size:0.75rem;">⚫ ${Math.floor(diffMin/1440)} วันก่อน</span>`;
                        else activityLine = `<span style="color:#94a3b8; font-size:0.75rem;">⚫ ${Math.floor(diffMin/10080)} สัปดาห์ก่อน</span>`;
                    } else {
                        activityLine = '<span style="color:#94a3b8; font-size:0.75rem;">⚫ ไม่เคยใช้งาน</span>';
                    }

                    // Profile updated within 7 days?
                    let profileLine = '';
                    if (profileUpdated) {
                        const diffDays = Math.floor((now - profileUpdated.getTime()) / 86400000);
                        if (diffDays <= 7) {
                            profileLine = `<div style="font-size:0.7rem; color:#3b82f6;">✏️ แก้ไขโปรไฟล์ ${diffDays === 0 ? 'วันนี้' : diffDays + ' วันก่อน'}</div>`;
                        }
                    }

                    // Active borrows
                    let borrowLine = '';
                    const borrows = r.active_borrows || [];
                    if (borrows.length > 0) {
                        const namesShort = borrows.slice(0, 2).map(b => b.instrument_name || '#' + b.instrument_id).join(', ');
                        const more = borrows.length > 2 ? ` +${borrows.length - 2}` : '';
                        borrowLine = `<div style="font-size:0.7rem; color:#7c3aed; margin-top:2px;" title="${escapeHtml(borrows.map(b => b.instrument_name).join(', '))}">🎺 ยืม: ${escapeHtml(namesShort)}${more}</div>`;
                    }

                    return `${activityLine}${profileLine}${borrowLine}`;
                })();

                return `<tr style="${isDeactivated ? 'opacity:0.6; background:var(--oad-surface2);' : ''}">
                    <td><div class="oad-user-cell">
                        <img class="oad-avatar" src="${escapeHtml(r.profile_image_url || 'assets/default-avatar.png')}"
                             onerror="this.src='assets/default-avatar.png'" alt="">
                        <div>
                            <div class="oad-user-name">${escapeHtml(fullName)}</div>
                            <div style="font-size:0.75rem;color:var(--oad-muted);">${escapeHtml(r.student_id || r.email || '')}</div>
                        </div>
                    </div></td>
                    <td>${isDeactivated ? '<span class="oad-badge oad-badge-gray">ไม่มีกลุ่ม</span>' : escapeHtml(translateGroup(r.student_group))}</td>
                    <td>${escapeHtml(r.class_level || '—')}</td>

                    <td style="text-align:center;">
                        <span class="oad-badge oad-badge-purple" style="font-size:0.85rem;">Lv.${level}</span>
                        <div style="font-size:0.7rem; color:var(--oad-muted);">${xp} XP</div>
                    </td>

                    <td style="font-size:0.85rem; line-height:1.4;">${activityHtml}</td>

                    <td style="text-align:center;">${statusBadge}${_userKitBadge(r.id, r.student_group)}</td>

                    <td><div class="actions" style="justify-content:center;">
                        ${r.student_group === 'club'
                          ? `<button class="oad-btn oad-btn-ghost" title="จัดการชุดประจำตัว" onclick="window.__oadUserKit('${r.id}', '${escapeHtml(fullName)}')">👔</button>`
                          : ''}
                        <button class="oad-btn oad-btn-ghost" title="ดูประวัติการยืม" onclick="window.__oadUserHistory('${r.id}', '${escapeHtml(fullName)}')">📜</button>
                        
                        ${isDeactivated ? `
                            <button class="oad-btn oad-btn-green" title="กู้คืนบัญชี" onclick="window.__oadToggleDeactivate('${r.id}', false)">♻️ กู้คืนบัญชี</button>
                        ` : `
                            <button class="oad-btn oad-btn-ghost" title="จัดการเหรียญตรา" onclick="window.__oadManageBadges('${r.id}', '${escapeHtml(fullName)}')">🏅</button>
                            <button class="oad-btn oad-btn-ghost" title="จัดการ EXP พิเศษ" onclick="window.__oadManageExp('${r.id}', '${escapeHtml(fullName)}')">⚡</button>
                            <button class="oad-btn oad-btn-ghost" title="แก้ไขข้อมูล" onclick="window.__oadEditUser('${r.id}')">✏️</button>
                            
                            ${r.is_blocked
                                ? `<button class="oad-btn oad-btn-green" title="ปลดบล็อก" onclick="window.__oadUnblock('${r.id}')">🔓</button>`
                                : `<button class="oad-btn oad-btn-amber" title="บล็อก" onclick="window.__oadBlock('${r.id}', '${escapeHtml(fullName)}')">🚫</button>`
                            }
                            
                            <button class="oad-btn oad-btn-red" title="ปิดบัญชีการใช้งาน" onclick="window.__oadToggleDeactivate('${r.id}', true)">📁</button>
                        `}
                    </div></td>
                </tr>`;
            }).join('')}
            </tbody>
        </table>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Render: Instruments tab
// ─────────────────────────────────────────────────────────────────────────────
function populateInstrumentFilterOptions() {
    const all = state.instruments || [];
    const typeSel = document.getElementById('oad-inst-type-filter');
    const condSel = document.getElementById('oad-inst-condition-filter');

    const fillOnce = (sel, values, placeholderText) => {
        if (!sel) return;
        const current = sel.value || 'all';
        const sorted = [...new Set(values.filter(v => v && v !== '—'))].sort((a, b) => a.localeCompare(b, 'th'));
        sel.innerHTML = `<option value="all">${placeholderText}</option>` +
            sorted.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
        if (sorted.includes(current)) sel.value = current;
    };

    fillOnce(typeSel, all.map(r => r.type), 'ทุกประเภท');
    fillOnce(condSel, all.map(r => r.condition), 'ทุกสภาพ');
}

function renderInstrumentsTable() {
    const wrap   = document.getElementById('oad-inst-table-wrap');
    if (!wrap) return;

    populateInstrumentFilterOptions();

    const search   = (document.getElementById('oad-inst-search')?.value || '').toLowerCase();
    const tf       = document.getElementById('oad-inst-type-filter')?.value      || 'all';
    const cf       = document.getElementById('oad-inst-condition-filter')?.value || 'all';
    const sf       = document.getElementById('oad-inst-status-filter')?.value    || 'all';
    const sort     = document.getElementById('oad-inst-sort')?.value             || 'default';

    // Build borrower lookup from cached users so we can search by borrower name too
    const userMap = new Map();
    (state.users || []).forEach(u => userMap.set(u.id, u));
    const borrowerName = id => {
        if (!id) return '';
        const u = userMap.get(id);
        if (!u) return '';
        return `${u.prefix || ''}${u.first_name || ''} ${u.last_name || ''}`.trim();
    };

    let rows = state.instruments || [];

    if (tf !== 'all') rows = rows.filter(r => r.type === tf);
    if (cf !== 'all') rows = rows.filter(r => (r.condition || '') === cf);
    if (sf !== 'all') rows = rows.filter(r => r.status === sf);

    if (search) {
        rows = rows.filter(r =>
            (r.name || '').toLowerCase().includes(search) ||
            (r.type || '').toLowerCase().includes(search) ||
            (r.condition || '').toLowerCase().includes(search) ||
            borrowerName(r.current_borrower_id).toLowerCase().includes(search)
        );
    }

    // Sorting (condition-bad ranks "ชำรุด"/"ต้องซ่อม" first, then "พอใช้", then good)
    const condRank = c => {
        const v = (c || '').trim();
        if (/ชำรุด|ซ่อม|เสีย/.test(v)) return 0;
        if (/พอใช้|ปานกลาง/.test(v))   return 1;
        if (/ดี|พร้อม/.test(v))         return 2;
        return 3;
    };
    if (sort === 'name-asc')        rows = [...rows].sort((a, b) => (a.name||'').localeCompare(b.name||'', 'th'));
    else if (sort === 'name-desc')  rows = [...rows].sort((a, b) => (b.name||'').localeCompare(a.name||'', 'th'));
    else if (sort === 'recent')     rows = [...rows].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    else if (sort === 'condition-bad') rows = [...rows].sort((a, b) => condRank(a.condition) - condRank(b.condition));

    if (!rows.length) {
        wrap.innerHTML = `<div class="oad-empty"><span class="oad-empty-icon">🎺</span>ไม่พบเครื่องดนตรี</div>`;
        return;
    }

    const statusBadge = s => {
        if (s === 'พร้อมใช้งาน') return `<span class="oad-badge oad-badge-green">พร้อม</span>`;
        if (s === 'ถูกยืมอยู่')  return `<span class="oad-badge oad-badge-blue">ยืมอยู่</span>`;
        if (s === 'ชำรุด')       return `<span class="oad-badge oad-badge-red">ชำรุด</span>`;
        return `<span class="oad-badge oad-badge-gray">${escapeHtml(s||'—')}</span>`;
    };

    const totalCount    = (state.instruments || []).length;
    const filteredCount = rows.length;
    const countLine     = filteredCount === totalCount
        ? `<div style="margin-bottom:0.75rem; color:var(--oad-muted); font-size:0.9rem;">รวม <strong>${totalCount}</strong> ชิ้น</div>`
        : `<div style="margin-bottom:0.75rem; color:var(--oad-muted); font-size:0.9rem;">พบ <strong>${filteredCount}</strong> จากทั้งหมด ${totalCount} ชิ้น</div>`;

    wrap.innerHTML = countLine + `
        <table class="oad-table">
            <thead><tr>
                <th>รูป</th><th>ชื่อ</th><th>ประเภท</th>
                <th>สภาพ</th><th>สถานะ</th><th>จัดการ</th>
            </tr></thead>
            <tbody>
            ${rows.map(r => {
                const imgUrl = r.image_url && !r.image_url.includes('undefined') ? r.image_url : 'assets/default-instrument.png';
                const bName  = borrowerName(r.current_borrower_id);
                const borrowerLine = (r.status === 'ถูกยืมอยู่' && bName)
                    ? `<div style="font-size:0.75rem; color:var(--oad-muted); margin-top:2px;">👤 ${escapeHtml(bName)}</div>`
                    : '';
                return `<tr>
                    <td><img src="${escapeHtml(imgUrl)}" onerror="this.src='assets/default-instrument.png'"
                         style="width:40px;height:40px;border-radius:8px;object-fit:cover;border:1px solid var(--oad-border);"></td>
                    <td><strong>${escapeHtml(r.name||'—')}</strong>${borrowerLine}</td>
                    <td>${escapeHtml(r.type||'—')}</td>
                    <td>${escapeHtml(r.condition||'—')}</td>
                    <td>${statusBadge(r.status)}</td>
                    <td><div class="actions">
                        <button class="oad-btn oad-btn-ghost" title="ดูประวัติการใช้งาน" onclick="window.__oadInstrumentHistory(${r.id})">📜</button>
                        <button class="oad-btn oad-btn-ghost" onclick="window.__oadShowQR('${r.id}', '${escapeHtml(r.name)}')">⛶</button>
                        <button class="oad-btn oad-btn-ghost" onclick="window.__oadEditInstrument(${r.id})">✏️</button>
                        <button class="oad-btn oad-btn-red" onclick="window.__oadDeleteInstrument(${r.id}, '${escapeHtml(r.name||'')}')">🗑️</button>
                    </div></td>
                </tr>`;
            }).join('')}
            </tbody>
        </table>`;
}

function renderKnowledgeTable() {
    const wrap = document.getElementById('oad-know-table-wrap');
    if (!wrap) return;

    const search = (document.getElementById('oad-know-search')?.value || '').toLowerCase();
    const status = document.getElementById('oad-know-status-filter')?.value || 'all';

    let rows = state.knowledgeLinks || [];

    // Sort: pending first (newest first), then approved (newest first)
    rows = [...rows].sort((a, b) => {
        if (a.is_approved !== b.is_approved) return a.is_approved ? 1 : -1;
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });

    if (status === 'pending') rows = rows.filter(r => !r.is_approved);
    if (status === 'approved') rows = rows.filter(r => r.is_approved);

    if (search) rows = rows.filter(r =>
        (r.title || '').toLowerCase().includes(search) ||
        (r.instrument_type || '').toLowerCase().includes(search) ||
        (r.caption || '').toLowerCase().includes(search)
    );

    // Build submitter lookup from cached users
    const userMap = new Map();
    (state.users || []).forEach(u => userMap.set(u.id, u));

    const pendingCount = (state.knowledgeLinks || []).filter(r => !r.is_approved).length;
    const headerNote = pendingCount > 0
        ? `<div style="background:#fef3c7; border-left:4px solid #f59e0b; padding:0.75rem 1rem; border-radius:8px; margin-bottom:1rem; color:#78350f;">⏳ <strong>${pendingCount} คลิป</strong> รอการตรวจสอบ — กดอนุมัติเพื่อเปิดให้ทุกคนเห็นใน feed</div>`
        : '';

    if (!rows.length) {
        wrap.innerHTML = headerNote + `<div class="oad-empty"><span class="oad-empty-icon">📚</span>ไม่พบข้อมูลคลังความรู้</div>`;
        return;
    }

    wrap.innerHTML = headerNote + `
        <table class="oad-table">
            <thead><tr>
                <th>เรื่อง / ลิงก์ / คำบรรยาย</th>
                <th>ผู้ส่ง</th>
                <th>ประเภทเครื่อง</th>
                <th style="text-align:center;">สถานะ</th>
                <th style="text-align:center;">จัดการ</th>
            </tr></thead>
            <tbody>
            ${rows.map(r => {
                const submitter = r.submitted_by ? userMap.get(r.submitted_by) : null;
                const submitterName = submitter
                    ? `${escapeHtml(submitter.first_name || '')} ${escapeHtml(submitter.last_name || '')}`.trim() || escapeHtml(submitter.email || '-')
                    : '<em style="color:var(--oad-muted);">แอดมินเพิ่ม</em>';
                return `
                <tr ${!r.is_approved ? 'style="background: rgba(245, 158, 11, 0.05);"' : ''}>
                    <td>
                        <strong style="font-size:0.95rem;">${escapeHtml(r.title || '')}</strong><br>
                        <a href="${escapeHtml(r.youtube_url || '')}" target="_blank" rel="noopener" style="font-size:0.8rem; color:var(--oad-accent); text-decoration:none;">🔗 เปิดดูคลิป</a>
                        ${r.caption ? `<div style="font-size:0.8rem; color:var(--oad-muted); margin-top:0.3rem; white-space:pre-wrap;">${escapeHtml(r.caption)}</div>` : ''}
                    </td>
                    <td style="font-size:0.85rem;">${submitterName}</td>
                    <td>${escapeHtml(r.instrument_type || 'ทั่วไป')}</td>
                    <td style="text-align:center;">
                        ${r.is_approved ? '<span class="oad-badge oad-badge-green">✅ อนุมัติแล้ว</span>' : '<span class="oad-badge oad-badge-amber">⏳ รอตรวจ</span>'}
                    </td>
                    <td><div class="actions" style="justify-content:center; flex-wrap:wrap;">
                        ${!r.is_approved
                            ? `<button class="oad-btn oad-btn-green" onclick="window.__oadReviewKnowledge(${r.id}, true)">✅ อนุมัติ</button>
                               <button class="oad-btn oad-btn-red" onclick="window.__oadReviewKnowledge(${r.id}, false)">❌ ปฏิเสธ</button>`
                            : `<button class="oad-btn oad-btn-ghost" onclick="window.__oadEditKnowledge(${r.id})">✏️ แก้ไข</button>
                               <button class="oad-btn oad-btn-amber" onclick="window.__oadApproveKnowledge(${r.id}, false)">ซ่อน</button>
                               <button class="oad-btn oad-btn-red" onclick="window.__oadDeleteKnowledge(${r.id})">🗑️ ลบ</button>`}
                    </div></td>
                </tr>`;
            }).join('')}
            </tbody>
        </table>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Render: Boss Video Review Panel (คลิปที่นักเรียนส่งรอตรวจ)
// ─────────────────────────────────────────────────────────────────────────────
function renderBossVideoReviews() {
    const panel = document.getElementById('oad-boss-video-reviews');
    if (!panel) return;

    const pending = state.bossRequests || [];
    if (!pending.length) {
        panel.style.display = 'none';
        return;
    }
    panel.style.display = '';

    // helper: ตรวจว่าเป็น URL จริงไหม
    const isValidUrl = (str) => {
        try { const u = new URL(str); return ['http:','https:'].includes(u.protocol); }
        catch { return false; }
    };

    panel.innerHTML = `
        <div class="oad-panel" style="margin-bottom:1.5rem; border: 2px solid var(--oad-amber);">
            <div class="oad-panel-title" style="color:var(--oad-amber);">
                🎬 คลิปรอตรวจ
                <span class="oad-badge oad-badge-amber" style="margin-left:0.5rem;">${pending.length} รายการ</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:0.75rem;">
            ${pending.map(r => {
                const name = r.users
                    ? `${r.users.prefix || ''} ${r.users.first_name || ''} ${r.users.last_name || ''}`.trim()
                    : '—';
                const bossTitle = r.bosses?.title || '—';
                const xp    = r.bosses?.reward_xp    ?? 0;
                const stars = r.bosses?.reward_stars ?? 0;
                const validUrl = isValidUrl(r.video_url || '');
                const clipHtml = validUrl
                    ? `<a href="${escapeHtml(r.video_url)}" target="_blank" rel="noopener"
                           class="oad-btn oad-btn-ghost" style="font-size:0.8rem; width:100%; text-align:center;">▶️ เปิดดูคลิป</a>`
                    : `<span style="font-size:0.8rem; color:var(--oad-red); word-break:break-all;">⚠️ ลิงก์ไม่ถูกต้อง:<br>${escapeHtml(r.video_url || '(ว่าง)')}</span>`;
                return `
                <div style="background:var(--oad-surface2); border-radius:var(--oad-radius); padding:0.85rem; display:flex; flex-direction:column; gap:0.5rem;">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:0.4rem;">
                        <div>
                            <strong>${escapeHtml(name)}</strong>
                            <div style="font-size:0.82rem; color:var(--oad-muted);">📋 ${escapeHtml(bossTitle)}</div>
                        </div>
                        <div style="display:flex; gap:0.3rem; flex-shrink:0;">
                            <span class="oad-badge oad-badge-purple">+${xp} XP</span>
                            <span class="oad-badge oad-badge-amber">+${stars} ⭐️</span>
                        </div>
                    </div>
                    ${clipHtml}
                    <div style="display:flex; gap:0.5rem;">
                        <button class="oad-btn oad-btn-green" style="flex:1;"
                            onclick="window.__oadReviewBossRequest('${r.id}', true)">✅ ผ่าน</button>
                        <button class="oad-btn oad-btn-red" style="flex:1;"
                            onclick="window.__oadReviewBossRequest('${r.id}', false)">❌ ตก</button>
                    </div>
                </div>`;
            }).join('')}
            </div>
        </div>`;
}

async function renderBossesTable() {
    const wrap = document.getElementById('oad-boss-table-wrap');
    if (!wrap) return;

    renderBossVideoReviews();

    if (!state.bosses || state.bosses.length === 0) {
        const { data, error } = await bossesApi.getAllBosses();
        if (error) {
            wrap.innerHTML = `<div class="oad-empty"><span class="oad-empty-icon">⚠️</span>ไม่สามารถโหลดบอสได้: ${escapeHtml(error.message || 'เกิดข้อผิดพลาด')}</div>`;
            return;
        }
        state.bosses = data || [];
    }

    if (!state.bosses.length) {
        wrap.innerHTML = `<div class="oad-empty"><span class="oad-empty-icon">🐉</span>ยังไม่มีบอสในระบบ</div>`;
        return;
    }

    // Lazy-load mini stats once per render (won't block initial paint if it fails)
    let statsMap = state.bossStatsMap || {};
    if (!state.bossStatsMap) {
        const { data: smap, error: serr } = await bossesApi.getBossStats();
        if (!serr) { state.bossStatsMap = smap; statsMap = smap; }
    }

    const renderActiveBadge = (b) => b.is_active === false
        ? `<span class="oad-badge oad-badge-gray" title="ปิดใช้งาน — นักเรียนไม่เห็น">⚫ ปิดอยู่</span>`
        : `<span class="oad-badge oad-badge-green" title="เปิดใช้งาน">🟢 เปิดอยู่</span>`;

    const renderStats = (b) => {
        const s = statsMap[String(b.id)];
        if (!s || !s.total) return `<div style="font-size:0.72rem; color:var(--oad-muted); margin-top:2px;">ยังไม่มีสถิติ</div>`;
        return `<div style="font-size:0.72rem; color:var(--oad-muted); margin-top:2px;">
            🗡️ ${s.total} ครั้ง · ✅ ${s.passed} · ❌ ${s.failed}
            <button onclick="window.__oadShowBossHistory('${b.id}', '${escapeHtml(b.title || '')}')"
                style="margin-left:0.5rem; font-size:0.7rem; padding:1px 7px; border-radius:99px;
                       background:rgba(99,102,241,0.2); border:1px solid rgba(99,102,241,0.4);
                       color:#a5b4fc; cursor:pointer;">📋 ดูรายละเอียด</button>
        </div>`;
    };

    wrap.innerHTML = `
        <table class="oad-table">
            <thead><tr>
                <th>ชื่อบอส (บทสอบ)</th>
                <th>รายละเอียด</th>
                <th style="text-align:center;">รางวัล (XP / ⭐️)</th>
                <th style="text-align:center;">ซ้อมแก้ตัว</th>
                <th style="text-align:center;">สถานะ</th>
                <th style="text-align:center; min-width:180px;">จัดการ</th>
            </tr></thead>
            <tbody>
            ${state.bosses.map(b => {
                const safeTitle = escapeHtml(b.title || '');
                const isActive  = b.is_active !== false;
                const toggleBtn = isActive
                    ? `<button class="oad-btn oad-btn-icon" title="ปิดใช้งาน (ซ่อนจากนักเรียน)"
                           style="background:rgba(245,158,11,0.15); border:1px solid var(--oad-amber); color:var(--oad-amber);"
                           onclick="window.__oadToggleBossActive('${b.id}', false)">⚫</button>`
                    : `<button class="oad-btn oad-btn-icon" title="เปิดใช้งาน"
                           style="background:rgba(34,197,94,0.15); border:1px solid var(--oad-green); color:var(--oad-green);"
                           onclick="window.__oadToggleBossActive('${b.id}', true)">🟢</button>`;
                return `
                <tr style="${isActive ? '' : 'opacity:0.6;'}">
                    <td>
                        <strong>${safeTitle}</strong>
                        ${renderStats(b)}
                    </td>
                    <td style="max-width:240px; white-space:pre-wrap;">${escapeHtml(b.description || '—')}</td>
                    <td style="text-align:center;">
                        <span class="oad-badge oad-badge-purple">+${b.reward_xp ?? 0} XP</span>
                        <span class="oad-badge oad-badge-amber">+${b.reward_stars ?? 0} ⭐️</span>
                    </td>
                    <td style="text-align:center; color:var(--oad-red);">${b.required_practice_mins ?? 0} นาที</td>
                    <td style="text-align:center;">${renderActiveBadge(b)}</td>
                    <td style="text-align:center;">
                        <div style="display:flex; flex-direction:column; gap:0.35rem; align-items:stretch;">
                            <button class="oad-btn oad-btn-green" title="เปิดห้องสอบ"
                                style="width:100%;"
                                onclick="window.__oadOpenLobby('${b.id}', '${safeTitle}')"
                                ${isActive ? '' : 'disabled'}>⚔️ เปิดห้องสอบ</button>
                            <div style="display:flex; gap:0.25rem; justify-content:center; align-items:center;">
                                <button class="oad-btn oad-btn-ghost oad-btn-icon" title="แก้ไขบอส"
                                    onclick="window.__oadEditBoss('${b.id}')">✏️</button>
                                <button class="oad-btn oad-btn-ghost oad-btn-icon" title="คัดลอกบอส"
                                    onclick="window.__oadDuplicateBoss('${b.id}')">📋</button>
                                <span style="width:1px; height:1.4rem; background:var(--oad-border); display:inline-block; margin:0 0.1rem;"></span>
                                ${toggleBtn}
                                <span style="width:1px; height:1.4rem; background:var(--oad-border); display:inline-block; margin:0 0.1rem;"></span>
                                <button class="oad-btn oad-btn-red oad-btn-icon" title="ลบถาวร"
                                    onclick="window.__oadDeleteBoss('${b.id}')">🗑️</button>
                            </div>
                        </div>
                    </td>
                </tr>`;
            }).join('')}
            </tbody>
        </table>`;
}

window.__oadShowBossHistory = async (bossId, bossTitle) => {
    Swal.showLoading();
    try {
        const { data, error } = await raidApi.getBossExamHistory(bossId);
        if (error) throw error;

        if (!data.length) {
            return Swal.fire('ประวัติการสอบ', 'ยังไม่มีข้อมูลการสอบ', 'info');
        }

        const isValidUrl = (s) => { try { const u = new URL(s); return ['http:','https:'].includes(u.protocol); } catch { return false; } };

        const rows = data.map(r => {
            const date = r.date
                ? new Date(r.date).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })
                : '—';
            const resultBadge = r.result_status === 'passed'
                ? `<span style="color:#4ade80; font-weight:700;">✅ ผ่าน</span>`
                : `<span style="color:#f87171; font-weight:700;">❌ ตก</span>`;
            const typeBadge = r.type === 'video'
                ? `<span style="font-size:0.72rem; background:rgba(99,102,241,0.2); color:#a5b4fc; padding:1px 6px; border-radius:99px;">🎬 คลิป</span>`
                : `<span style="font-size:0.72rem; background:rgba(34,197,94,0.15); color:#4ade80; padding:1px 6px; border-radius:99px;">⚔️ ออฟไลน์</span>`;
            const clipLink = r.type === 'video' && r.video_url && isValidUrl(r.video_url)
                ? `<br><a href="${escapeHtml(r.video_url)}" target="_blank" rel="noopener"
                       style="font-size:0.75rem; color:#60a5fa;">▶️ ดูคลิป</a>`
                : (r.type === 'video' && r.video_url
                    ? `<br><span style="font-size:0.72rem; color:#f87171;">⚠️ ลิงก์ไม่ถูกต้อง</span>`
                    : '');
            return `<tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                <td style="padding:0.45rem 0.6rem;">
                    ${escapeHtml(r.name || '—')}
                    ${clipLink}
                </td>
                <td style="text-align:center; padding:0.45rem 0.4rem;">${resultBadge}</td>
                <td style="text-align:center; padding:0.45rem 0.4rem;">${typeBadge}</td>
                <td style="text-align:center; font-size:0.78rem; color:#94a3b8; padding:0.45rem 0.4rem;">${date}</td>
            </tr>`;
        }).join('');

        Swal.fire({
            title: `📋 ประวัติการสอบ: ${escapeHtml(bossTitle)}`,
            html: `<div style="max-height:420px; overflow-y:auto;">
                <table style="width:100%; border-collapse:collapse; font-size:0.88rem;">
                    <thead><tr style="border-bottom:2px solid rgba(255,255,255,0.1); font-size:0.8rem; color:#94a3b8;">
                        <th style="padding:0.4rem 0.6rem; text-align:left;">ชื่อนักเรียน</th>
                        <th style="text-align:center;">ผล</th>
                        <th style="text-align:center;">วิธี</th>
                        <th style="text-align:center;">วันที่</th>
                    </tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`,
            width: '640px',
            confirmButtonText: 'ปิด',
        });
    } catch (err) {
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    }
};

function renderBossLobby() {
    const lobbyArea = document.getElementById('oad-boss-lobby-area');
    if (!state.activeLobby) {
        lobbyArea.style.display = 'none';
        return;
    }

    lobbyArea.style.display = 'block';
    
    if (state.activeLobby.status === 'waiting') {
        lobbyArea.innerHTML = `
            <div style="text-align:center;">
                <h3 style="margin-bottom:0.5rem; color:var(--oad-text);">
                    ⚔️ ปาร์ตี้ล่าบอส: <span style="color:var(--oad-accent);">${escapeHtml(state.activeBossTitle || 'ไม่ทราบชื่อบอส')}</span>
                </h3>
                <p style="margin-bottom:1rem; color:var(--oad-muted); font-size:1.1rem;">
                    ให้นักเรียนนำ <b>"รหัส 4 หลัก"</b> ด้านล่างนี้ไปกรอกเพื่อเข้าปาร์ตี้
                </p>
                
                <div style="font-size:5rem; font-weight:900; letter-spacing:16px; color:var(--oad-accent); font-family:monospace; margin-bottom:1.5rem; text-shadow: 2px 2px 8px rgba(0,0,0,0.1); background:var(--oad-surface); display:inline-block; padding:0 2rem; border-radius:16px; border:2px dashed var(--oad-border);">
                    ${state.activeLobby.room_code}
                </div>
                
                <div style="margin-bottom:1.5rem; font-size:1.1rem;">
                    <strong>ผู้เข้าร่วมปาร์ตี้ (${state.raidParticipants.length} คน):</strong>
                    <span style="color:${state.raidParticipants.length ? 'var(--oad-green)' : 'var(--oad-muted)'}; font-weight:bold;">
                        ${state.raidParticipants.length ? 'พร้อมลุย!' : 'กำลังรอสมาชิก...'}
                    </span>
                    ${state.raidParticipants.length ? `
                        <div style="display:flex; flex-wrap:wrap; gap:0.5rem; justify-content:center; margin-top:0.75rem;">
                            ${state.raidParticipants.map(p => `
                                <span style="background:rgba(34,197,94,0.15); border:1px solid rgba(34,197,94,0.3);
                                             color:var(--oad-green); padding:0.3rem 0.75rem; border-radius:999px; font-size:0.9rem;">
                                    ${escapeHtml(p.user_name || p.user_id)}
                                </span>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>
                
                <div style="display:flex; justify-content:center; gap:1rem; flex-wrap:wrap;">
                    <button class="oad-btn oad-btn-red" onclick="window.__oadCloseLobby()" style="padding:0.75rem 1.5rem; font-size:1rem;">❌ ปิดห้อง (ยกเลิก)</button>
                    <button class="oad-btn oad-btn-primary" onclick="window.__oadStartRaid()" ${state.raidParticipants.length === 0 ? 'disabled' : ''} style="padding:0.75rem 1.5rem; font-size:1rem;">🚀 เริ่มสอบเลย!</button>
                </div>
            </div>
        `;
    } 
    else if (state.activeLobby.status === 'raiding') {
        lobbyArea.innerHTML = `
            <div>
                <h3 style="margin-bottom:1rem; color:var(--oad-text);">⚔️ กำลังสอบ: ให้คะแนนปาร์ตี้ <span style="color:var(--oad-accent);">${escapeHtml(state.activeBossTitle || '')}</span></h3>
                <table class="oad-table" style="background:var(--oad-surface); margin-bottom:1rem;">
                    <thead><tr><th>ชื่อนักเรียน</th><th style="text-align:center;">ผลการสอบ</th></tr></thead>
                    <tbody>
                        ${state.raidParticipants.map(p => `
                            <tr>
                                <td>
                                    <strong>${escapeHtml(p.user_name || p.user_id)}</strong>
                                </td>
                                <td style="text-align:center; display:flex; justify-content:center; gap:1.5rem;">
                                    <label style="cursor:pointer; font-size:1.1rem; font-weight:bold; color:var(--oad-green);">
                                        <input type="radio" name="result_${p.user_id}" value="passed" style="transform:scale(1.5); margin-right:0.5rem;"> ✅ ผ่าน
                                    </label>
                                    <label style="cursor:pointer; font-size:1.1rem; font-weight:bold; color:var(--oad-red);">
                                        <input type="radio" name="result_${p.user_id}" value="failed" style="transform:scale(1.5); margin-right:0.5rem;"> ❌ ตก
                                    </label>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                <div style="display:flex; justify-content:flex-end;">
                    <button class="oad-btn oad-btn-green" onclick="window.__oadSubmitRaidResults()" style="padding:0.75rem 1.5rem; font-size:1rem;">💾 บันทึกผลสอบทั้งหมด</button>
                </div>
            </div>
        `;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Render: Rankings tab
// ─────────────────────────────────────────────────────────────────────────────
function renderRankingsTable() {
    const wrap = document.getElementById('oad-rank-table-wrap');
    const typeFilter = document.getElementById('oad-rank-type-filter');
    const classFilter = document.getElementById('oad-rank-class-filter');
    if (!wrap || !typeFilter || !classFilter) return;

    const type = typeFilter.value;
    const selectedClass = classFilter.value;

    classFilter.classList.toggle('hidden', type !== 'class');

    let rows = [];
    if (type === 'club') {
        rows = state.clubRankings;
    } else {
        if (classFilter.options.length <= 1) {
            const classes = [...new Set(state.classRankings.map(r => r.class_level).filter(Boolean))].sort();
            classFilter.innerHTML = '<option value="all">-- เลือกห้องเรียน --</option>' + classes.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
            classFilter.value = selectedClass;
        }

        if (selectedClass === 'all') {
            wrap.innerHTML = '<div class="oad-empty"><span class="oad-empty-icon">🏫</span>กรุณาเลือกห้องเรียนที่ต้องการดูอันดับ</div>';
            return;
        }
        rows = state.classRankings.filter(r => r.class_level === selectedClass);
    }

    if (!rows.length) {
        wrap.innerHTML = `<div class="oad-empty"><span class="oad-empty-icon">📊</span>ไม่พบข้อมูลเวลาซ้อม</div>`;
        return;
    }

    wrap.innerHTML = `
        <table class="oad-table">
            <thead>
                <tr>
                    <th style="text-align:center; width:80px;">อันดับ</th>
                    <th>รายชื่อนักเรียน</th>
                    ${type === 'club' ? '<th>ระดับชั้น</th>' : ''}
                    <th style="text-align:right;">เวลาซ้อมสะสม</th>
                </tr>
            </thead>
            <tbody>
            ${rows.map((r, i) => {
                const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1);
                const timeStr = r.total_minutes >= 60 ? `${Math.floor(r.total_minutes/60)} ชม. ${r.total_minutes%60} น.` : `${r.total_minutes} นาที`;
                return `
                <tr>
                    <td style="text-align:center; font-size: 1.1rem; font-weight:bold;">${medal}</td>
                    <td class="nowrap">${escapeHtml(r.full_name || r.first_name || 'N/A')}</td>
                    ${type === 'club' ? `<td>${escapeHtml(r.class_level || '-')}</td>` : ''}
                    <td style="text-align:right; font-weight:bold; color:var(--oad-accent);">${timeStr}</td>
                </tr>`;
            }).join('')}
            </tbody>
        </table>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Render: Config tab (EXP Settings & Rules)
// ─────────────────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════
// 🔔 Scheduled Notifications — admin tab
// ═══════════════════════════════════════════════════════════════════════════

const _TARGET_GROUP_LABELS = {
    all: 'ทุกคน', student: 'นักเรียนทั่วไป', club: 'สมาชิกชุมนุม',
    teacher: 'ครูอาจารย์', guest: 'บุคคลทั่วไป', admin: 'แอดมิน',
};
const _REPEAT_LABELS = { once: 'ครั้งเดียว', daily: 'ทุกวัน', weekly: 'รายสัปดาห์', custom: 'กำหนดเอง' };
const _DAY_NAMES_TH = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];

function _formatThaiDate(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '-';
    const date = d.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' });
    const time = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    return `${date} ${time}`;
}

async function renderLoopsTable() {
    const tbody = document.getElementById('oad-loops-table-body');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;">กำลังโหลดข้อมูล...</td></tr>`;
    try {
        const { data, error } = await studentLoopsApi.getFeed();
        if (error) throw error;
        
        if (!data || data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--oad-muted);">ยังไม่มีใครอัปโหลดและแชร์เพลง</td></tr>`;
            return;
        }
        
        tbody.innerHTML = data.map((loop) => {
            const userName = `${loop.users?.prefix || ''} ${loop.users?.first_name || 'ไม่ระบุ'} ${loop.users?.last_name || ''}`.trim();
            const groupName = translateGroup(loop.users?.student_group);
            return `
                <tr>
                    <td><strong>${escapeHtml(loop.title || 'เพลงไม่มีชื่อ')}</strong></td>
                    <td>${escapeHtml(userName)} <br><small style="color:var(--oad-muted);">${escapeHtml(groupName)}</small></td>
                    <td>${loop.bpm}</td>
                    <td>
                        <audio controls src="https://docs.google.com/uc?export=download&id=${loop.google_drive_id}" style="height: 35px; width: 220px;"></audio>
                    </td>
                    <td>
                        <button class="oad-btn oad-btn-red" style="padding: 0.25rem 0.6rem; font-size: 0.8rem;" onclick="window.__oadDeleteStudentLoop(${loop.id})">
                            🗑️ ลบเพลง
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--pico-del-color);">โหลดไม่สำเร็จ: ${escapeHtml(e.message)}</td></tr>`;
    }
}

window.__oadDeleteStudentLoop = async (loopId) => {
    const confirm = await Swal.fire({
        title: 'ยืนยันการลบเพลง?',
        text: 'คุณต้องการลบเพลงนี้ของนักเรียนออกจากระบบหรือไม่? (ไฟล์ใน Google Drive ของนักเรียนจะไม่ถูกลบ แต่ลิงก์ที่แชร์บนระบบจะถูกลบออก)',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'ลบเลย',
        cancelButtonText: 'ยกเลิก'
    });
    
    if (confirm.isConfirmed) {
        try {
            const { error } = await studentLoopsApi.deleteLoop(loopId);
            if (error) throw error;
            
            Swal.fire({
                title: 'ลบสำเร็จ!',
                text: 'ลบเพลงลูปของนักเรียนเรียบร้อยแล้ว',
                icon: 'success',
                timer: 1500,
                showConfirmButton: false
            });
            
            // Reload loops table
            renderLoopsTable();
        } catch (e) {
            Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถลบเพลงได้: ' + e.message, 'error');
        }
    }
};

async function renderScheduledNotifications() {
    const wrap = document.getElementById('oad-sched-notif-wrap');
    if (!wrap) return;
    wrap.innerHTML = `<div class="oad-skel" style="height:200px;"></div>`;

    const { data: rows, error } = await scheduledNotificationsApi.list();
    if (error) {
        wrap.innerHTML = `<p style="color:var(--oad-red); padding:1rem;">โหลดไม่สำเร็จ: ${escapeHtml(error.message)}</p>`;
        return;
    }
    if (!rows?.length) {
        wrap.innerHTML = `<div class="oad-empty"><span class="oad-empty-icon">🔕</span>ยังไม่มีแจ้งเตือนตั้งเวลา</div>`;
        return;
    }

    wrap.innerHTML = `
        <table class="oad-table">
            <thead><tr>
                <th>เรื่อง / ข้อความ</th>
                <th>กลุ่มเป้าหมาย</th>
                <th>ครั้งถัดไป</th>
                <th>ทำซ้ำ</th>
                <th>สถานะ</th>
                <th>จัดการ</th>
            </tr></thead>
            <tbody>
            ${rows.map(r => {
                let repeatLabel = _REPEAT_LABELS[r.repeat_type] || r.repeat_type;
                if (r.repeat_type === 'weekly') {
                    const days = r.repeat_config?.days || [];
                    if (days.length) repeatLabel += ' · ' + days.map(d => _DAY_NAMES_TH[d] || '?').join(',');
                }
                if (r.repeat_type === 'custom') {
                    const m = r.repeat_config?.interval_minutes;
                    if (m) repeatLabel += ` · ทุก ${m} นาที`;
                }
                return `
                <tr ${r.is_active ? '' : 'style="opacity:0.55;"'}>
                    <td>
                        <strong>${escapeHtml(r.title)}</strong>
                        <div style="font-size:0.8rem; color:var(--oad-muted); margin-top:0.2rem; white-space:pre-wrap;">${escapeHtml(r.body)}</div>
                    </td>
                    <td>${escapeHtml(_TARGET_GROUP_LABELS[r.target_group] || r.target_group)}</td>
                    <td>${_formatThaiDate(r.scheduled_at)}</td>
                    <td>${escapeHtml(repeatLabel)}</td>
                    <td>${r.is_active
                        ? '<span class="oad-badge oad-badge-green">เปิด</span>'
                        : '<span class="oad-badge oad-badge-amber">ปิด</span>'}
                    ${r.last_sent_at ? `<div style="font-size:0.75rem; color:var(--oad-muted); margin-top:0.2rem;">ส่งล่าสุด: ${_formatThaiDate(r.last_sent_at)}</div>` : ''}
                    </td>
                    <td><div class="actions" style="flex-wrap:wrap;">
                        <button class="oad-btn oad-btn-ghost" onclick="window.__oadEditScheduledNotif(${r.id})">✏️ แก้ไข</button>
                        <button class="oad-btn ${r.is_active ? 'oad-btn-amber' : 'oad-btn-green'}" onclick="window.__oadToggleScheduledNotif(${r.id}, ${!r.is_active})">${r.is_active ? '⏸ ปิด' : '▶ เปิด'}</button>
                        <button class="oad-btn oad-btn-red" onclick="window.__oadDeleteScheduledNotif(${r.id})">🗑️ ลบ</button>
                    </div></td>
                </tr>`;
            }).join('')}
            </tbody>
        </table>
        <p style="font-size:0.8rem; color:var(--oad-muted); margin-top:0.75rem;">
            💡 ระบบ dispatcher จะรันอัตโนมัติเมื่อมีผู้ใช้เปิดแอป — แจ้งเตือนที่ถึงเวลาแล้วจะถูกส่งทันที (ไม่หลุด)
        </p>
    `;
}

/**
 * ฟอร์มสร้าง/แก้ไข scheduled notification (ใช้ร่วมกัน)
 */
async function _scheduledNotifForm(existing = null) {
    const isEdit = !!existing;
    const titleVal = existing?.title || '';
    const bodyVal = existing?.body || '';
    const targetVal = existing?.target_group || 'all';
    const repeatVal = existing?.repeat_type || 'once';
    const intervalMinVal = existing?.repeat_config?.interval_minutes || 60;
    const weeklyDays = existing?.repeat_config?.days || [];

    // Default scheduled_at = today 16:30 (สามารถแก้ใน input)
    let dateInputVal = '';
    if (existing?.scheduled_at) {
        const d = new Date(existing.scheduled_at);
        const pad = n => String(n).padStart(2, '0');
        dateInputVal = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } else {
        const d = new Date();
        d.setHours(16, 30, 0, 0);
        if (d < new Date()) d.setDate(d.getDate() + 1);
        const pad = n => String(n).padStart(2, '0');
        dateInputVal = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    const dayCheckboxes = _DAY_NAMES_TH.map((label, i) => `
        <label style="display:inline-flex; align-items:center; gap:0.3rem; padding:0.3rem 0.5rem; border-radius:6px; background:var(--input-bg); cursor:pointer;">
            <input type="checkbox" value="${i}" ${weeklyDays.includes(i) ? 'checked' : ''}> ${label}
        </label>`).join(' ');

    const groupOpts = Object.entries(_TARGET_GROUP_LABELS)
        .map(([k, v]) => `<option value="${k}" ${targetVal === k ? 'selected' : ''}>${v}</option>`).join('');
    const repeatOpts = Object.entries(_REPEAT_LABELS)
        .map(([k, v]) => `<option value="${k}" ${repeatVal === k ? 'selected' : ''}>${v}</option>`).join('');

    const { value: form } = await Swal.fire({
        title: isEdit ? 'แก้ไขแจ้งเตือน' : '🔔 สร้างแจ้งเตือนตั้งเวลา',
        width: '560px',
        html: `<div style="text-align:left;">
            <label style="font-size:0.85rem; font-weight:bold;">หัวข้อ *</label>
            <input id="snf-title" class="swal2-input" value="${escapeHtml(titleVal)}" placeholder="เช่น เข้าซ้อมวันนี้ 16:30" maxlength="120" style="width:100%; margin-bottom:0.75rem;">

            <label style="font-size:0.85rem; font-weight:bold;">ข้อความ *</label>
            <textarea id="snf-body" class="swal2-textarea" placeholder="รายละเอียด..." maxlength="500" style="width:100%; min-height:80px; margin-bottom:0.75rem;">${escapeHtml(bodyVal)}</textarea>

            <div class="grid" style="display:grid; grid-template-columns:1fr 1fr; gap:0.75rem; margin-bottom:0.75rem;">
                <div>
                    <label style="font-size:0.85rem; font-weight:bold;">วันที่และเวลา *</label>
                    <input type="datetime-local" id="snf-when" class="swal2-input" value="${dateInputVal}" style="width:100%;">
                </div>
                <div>
                    <label style="font-size:0.85rem; font-weight:bold;">กลุ่มเป้าหมาย</label>
                    <select id="snf-target" class="swal2-select" style="width:100%; display:block;">${groupOpts}</select>
                </div>
            </div>

            <label style="font-size:0.85rem; font-weight:bold;">ทำซ้ำ</label>
            <select id="snf-repeat" class="swal2-select" style="width:100%; display:block; margin-bottom:0.75rem;">${repeatOpts}</select>

            <div id="snf-weekly-config" style="${repeatVal === 'weekly' ? '' : 'display:none;'} margin-bottom:0.75rem;">
                <label style="font-size:0.85rem; font-weight:bold;">วันในสัปดาห์</label>
                <div id="snf-days" style="display:flex; flex-wrap:wrap; gap:0.4rem; margin-top:0.3rem;">${dayCheckboxes}</div>
            </div>

            <div id="snf-custom-config" style="${repeatVal === 'custom' ? '' : 'display:none;'} margin-bottom:0.5rem;">
                <label style="font-size:0.85rem; font-weight:bold;">ทำซ้ำทุกๆ (นาที)</label>
                <input type="number" id="snf-interval" class="swal2-input" value="${intervalMinVal}" min="1" max="10080" style="width:100%;">
            </div>
        </div>`,
        showCancelButton: true,
        confirmButtonText: isEdit ? '💾 บันทึก' : '➕ สร้าง',
        cancelButtonText: 'ยกเลิก',
        focusConfirm: false,
        didOpen: () => {
            document.getElementById('snf-repeat').addEventListener('change', e => {
                document.getElementById('snf-weekly-config').style.display = e.target.value === 'weekly' ? '' : 'none';
                document.getElementById('snf-custom-config').style.display = e.target.value === 'custom' ? '' : 'none';
            });
        },
        preConfirm: () => {
            const title = document.getElementById('snf-title').value.trim();
            const body = document.getElementById('snf-body').value.trim();
            const when = document.getElementById('snf-when').value;
            const target = document.getElementById('snf-target').value;
            const repeat = document.getElementById('snf-repeat').value;
            if (!title || !body || !when) { Swal.showValidationMessage('กรุณากรอกหัวข้อ ข้อความ และวันเวลา'); return false; }
            const config = {};
            if (repeat === 'weekly') {
                config.days = [...document.getElementById('snf-days').querySelectorAll('input:checked')].map(c => parseInt(c.value, 10));
                if (!config.days.length) { Swal.showValidationMessage('กรุณาเลือกวันในสัปดาห์อย่างน้อย 1 วัน'); return false; }
            }
            if (repeat === 'custom') {
                const v = parseInt(document.getElementById('snf-interval').value, 10);
                if (!v || v < 1) { Swal.showValidationMessage('กรุณาระบุช่วงนาที'); return false; }
                config.interval_minutes = v;
            }
            return {
                title, body,
                scheduledAt: new Date(when).toISOString(),
                targetGroup: target,
                repeatType: repeat,
                repeatConfig: Object.keys(config).length ? config : null,
            };
        }
    });
    return form;
}

window.__oadNewScheduledNotif = async () => {
    const f = await _scheduledNotifForm(null);
    if (!f) return;
    Swal.showLoading();
    const { error } = await scheduledNotificationsApi.create(f);
    if (error) toast('ผิดพลาด: ' + error.message, 'error');
    else { toast('✅ สร้างแจ้งเตือนแล้ว', 'success'); renderScheduledNotifications(); }
};

window.__oadEditScheduledNotif = async (id) => {
    const { data: list } = await scheduledNotificationsApi.list();
    const existing = (list || []).find(r => r.id === id);
    if (!existing) return toast('ไม่พบรายการ', 'error');
    const f = await _scheduledNotifForm(existing);
    if (!f) return;
    Swal.showLoading();
    const { error } = await scheduledNotificationsApi.update(id, { ...f, isActive: existing.is_active });
    if (error) toast('ผิดพลาด: ' + error.message, 'error');
    else { toast('💾 บันทึกแล้ว', 'success'); renderScheduledNotifications(); }
};

window.__oadToggleScheduledNotif = async (id, makeActive) => {
    const { error } = await scheduledNotificationsApi.update(id, { isActive: !!makeActive });
    if (error) toast('ผิดพลาด: ' + error.message, 'error');
    else { toast(makeActive ? '▶ เปิดใช้งาน' : '⏸ ปิดใช้งาน', 'success'); renderScheduledNotifications(); }
};

window.__oadDeleteScheduledNotif = async (id) => {
    const { isConfirmed } = await Swal.fire({
        title: 'ลบแจ้งเตือนนี้?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'ลบ', cancelButtonText: 'ยกเลิก'
    });
    if (!isConfirmed) return;
    const { error } = await scheduledNotificationsApi.remove(id);
    if (error) toast('ผิดพลาด: ' + error.message, 'error');
    else { toast('🗑 ลบแล้ว', 'success'); renderScheduledNotifications(); }
};

window.__oadAnnounceNow = async () => {
    const groupOpts = Object.entries(_TARGET_GROUP_LABELS)
        .map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
    const { value: f } = await Swal.fire({
        title: '📣 ส่งประกาศทันที',
        html: `<div style="text-align:left;">
            <input id="ann-title" class="swal2-input" placeholder="หัวข้อ" maxlength="120" style="width:100%; margin-bottom:0.5rem;">
            <textarea id="ann-body" class="swal2-textarea" placeholder="ข้อความ..." maxlength="500" style="width:100%; min-height:80px; margin-bottom:0.5rem;"></textarea>
            <label style="font-size:0.85rem; font-weight:bold;">กลุ่มเป้าหมาย</label>
            <select id="ann-target" class="swal2-select" style="width:100%; display:block;">${groupOpts}</select>
        </div>`,
        showCancelButton: true, confirmButtonText: '📣 ส่งเลย', cancelButtonText: 'ยกเลิก',
        focusConfirm: false,
        preConfirm: () => {
            const title = document.getElementById('ann-title').value.trim();
            const body = document.getElementById('ann-body').value.trim();
            if (!title || !body) { Swal.showValidationMessage('กรุณากรอกหัวข้อและข้อความ'); return false; }
            return { title, body, targetGroup: document.getElementById('ann-target').value };
        }
    });
    if (!f) return;
    Swal.showLoading();
    const { data, error } = await scheduledNotificationsApi.announceNow(f);
    if (error) toast('ผิดพลาด: ' + error.message, 'error');
    else toast(`✅ ส่งให้ ${data?.recipients ?? 0} คน`, 'success');
};

window.__oadDispatchNow = async () => {
    Swal.showLoading();
    const { data, error } = await scheduledNotificationsApi.dispatch();
    if (error) toast('ผิดพลาด: ' + error.message, 'error');
    else { toast(`▶ ส่ง ${data?.dispatched ?? 0} รายการ ให้ ${data?.total_recipients ?? 0} คน`, 'success'); renderScheduledNotifications(); }
};

// ==========================================
// 🚀 ฟังก์ชันอัปเดตสถานะการซ่อมแบบด่วน (Inline) - SweetAlert Version
// ==========================================
window.__oadQuickUpdateRepairStatus = async (repairId, instrumentId, newStatus, selectElem, reporterId) => {
    const oldStatus = selectElem.getAttribute('data-old-value');
    
    // 1. ถามยืนยันด้วย SweetAlert
    const confirmResult = await Swal.fire({
        title: 'ยืนยันการเปลี่ยนสถานะ?',
        text: `คุณต้องการเปลี่ยนสถานะเป็น "${newStatus}" ใช่หรือไม่?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: 'var(--pico-primary-background)', 
        cancelButtonColor: 'var(--pico-del-color, #e63946)',
        confirmButtonText: '✅ ใช่, เปลี่ยนเลย',
        cancelButtonText: '❌ ยกเลิก'
    });

    if (!confirmResult.isConfirmed) {
        selectElem.value = oldStatus; 
        return;
    }

    try {
        Swal.fire({
            title: 'กำลังบันทึกข้อมูล...',
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });
        
        let apiResult;

        if (newStatus === 'ซ่อมเสร็จสิ้น' || newStatus === 'ไม่สามารถซ่อมได้') {
            apiResult = await api.completeRepair(repairId, instrumentId, { 
                repair_status: newStatus, 
                repair_notes: 'อัปเดตสถานะด่วนจากหน้า Dashboard' 
            });
        } else {
            apiResult = await api.updateRepair(repairId, { repair_status: newStatus });
            
            // Sync instrument status/condition
            let instStatus = null;
            let instCondition = null;
            if (newStatus === 'แจ้งซ่อม') {
                instStatus = 'ชำรุด';
            } else if (newStatus === 'รอซ่อม') {
                instStatus = 'พร้อมใช้งาน';
                instCondition = 'พอใช้';
            } else if (newStatus === 'กำลังซ่อม') {
                instStatus = 'ส่งซ่อม';
                instCondition = 'ดี';
            }
            
            if (instStatus) {
                const { error: instErr } = await instrumentsExt.updateStatus(Number(instrumentId), instStatus, instCondition || 'ปกติ');
                if (instErr) console.error('[Quick Repair Status Sync Error]:', instErr);
            }
        }
        
        // 🚨 เช็คว่าถ้า API ทำงานพลาด ให้โยน Error ออกไปเข้า Catch
        if (apiResult && apiResult.error) {
            throw apiResult.error;
        }

        // 🔔 Send notification to reporter if present
        if (reporterId && oldStatus !== newStatus) {
            let notifBody = '';
            if (newStatus === 'รอซ่อม') {
                notifBody = 'เครื่องดนตรียังใช้งานได้ระหว่างรอซ่อม';
            } else if (newStatus === 'กำลังซ่อม') {
                notifBody = 'เครื่องดนตรีของคุณกำลังอยู่ระหว่างการซ่อม';
            } else if (newStatus === 'ซ่อมเสร็จสิ้น') {
                notifBody = 'ซ่อมเสร็จแล้ว เครื่องพร้อมใช้งาน';
            } else if (newStatus === 'ไม่สามารถซ่อมได้') {
                notifBody = 'ไม่สามารถซ่อมได้ เครื่องถูกปรับเป็นชำรุด';
            }
            
            if (notifBody && typeof notifications !== 'undefined' && typeof notifications.save === 'function') {
                await notifications.save(reporterId, 'อัปเดตสถานะการแจ้งซ่อม', notifBody);
            }
        }
        
        Swal.fire({ 
            icon: 'success', 
            title: 'บันทึกสำเร็จ!', 
            text: `เปลี่ยนสถานะเป็น "${newStatus}" เรียบร้อยแล้ว`,
            timer: 1500, 
            showConfirmButton: false 
        });
        
        selectElem.setAttribute('data-old-value', newStatus);

        if (typeof refreshDirtyData === 'function') {
            await refreshDirtyData();
        }
        
    } catch (error) {
        console.error("[API Error] Failed to quick update repair:", error);
        Swal.fire({
            icon: 'error',
            title: 'เกิดข้อผิดพลาด',
            text: 'ไม่สามารถอัปเดตสถานะได้: ' + (error.message || 'กรุณาลองใหม่อีกครั้ง')
        });
        selectElem.value = oldStatus; 
    }
};

async function renderConfigTab() {
    const setWrap = document.getElementById('oad-config-settings-wrap');
    const ruleWrap = document.getElementById('oad-config-rules-wrap');
    if (!setWrap || !ruleWrap) return;

    setWrap.innerHTML = `<div class="oad-skel" style="height:100px; margin-bottom:1rem;"></div>`;
    ruleWrap.innerHTML = `<div class="oad-skel" style="height:100px;"></div>`;

    try {
        const { data: settings, error: errSet } = await adminExt.getSystemSettings();
        if (errSet) throw errSet;

        const visibleSettings = settings.filter(s => s.key !== 'flash_boost_xp' && s.key !== 'flash_boost_until');

        if (visibleSettings && visibleSettings.length > 0) {
            setWrap.innerHTML = visibleSettings.map(s => `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:1rem; border:1px solid var(--oad-border); border-radius:var(--oad-radius-sm); margin-bottom:0.5rem; background:var(--oad-surface2);">
                    <div>
                        <strong style="color:var(--oad-text);">${escapeHtml(s.description || s.key)}</strong><br>
                        <small style="color:var(--oad-muted);">${s.key}</small>
                    </div>
                    <div style="display:flex; gap:0.5rem; align-items:center;">
                        <input type="number" id="conf-${s.key}" value="${s.value}" step="0.1" class="swal2-input" style="width:100px; margin:0; text-align:center; background:var(--input-bg); color:var(--text-main);"
                            onchange="window.__oadSaveConfig('${s.key}', this.value)">
                    </div>
                </div>
            `).join('') + `<div style="font-size:0.85rem; color:var(--oad-green); margin-top:0.5rem; font-weight:bold; text-align:right;">* ระบบจะบันทึกค่าให้อัตโนมัติเมื่อแก้ไขตัวเลข</div>`;
        } else {
            setWrap.innerHTML = '<p style="color:var(--oad-muted); padding:1rem; text-align:center;">ยังไม่มีข้อมูลการตั้งค่า</p>';
        }

        setWrap.innerHTML += `
            <hr style="margin:2rem 0; opacity:0.1;">
            <div id="oad-quick-boost-wrapper"></div>
        `;
        
        renderFlashBoost();

        const { data: rules, error: errRule } = await adminExt.getXpRules();
        if (errRule) throw errRule;

        const dayNames = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

        if (rules && rules.length > 0) {
            ruleWrap.innerHTML = rules.map(r => `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:1rem; border:1px solid var(--oad-border); border-left:4px solid var(--oad-accent); border-radius:var(--oad-radius-sm); margin-bottom:0.5rem; background:var(--oad-surface);">
                    <div>
                        <strong style="font-size:1rem; color:var(--oad-text);">${escapeHtml(r.rule_name)}</strong><br>
                        <span style="font-size:0.85rem; color:var(--oad-muted);">
                            📍 ${r.day_of_week !== null ? `เฉพาะวัน${dayNames[r.day_of_week]}` : 'ทุกวัน'} 
                            ${r.start_time ? `| เวลา ${r.start_time.slice(0,5)} - ${r.end_time.slice(0,5)}` : ''}
                        </span>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-size:0.9rem; font-weight:bold; color:var(--oad-accent2); margin-bottom:0.3rem;">
                            ✨ รับ EXP x${r.multiplier} และโบนัส +${r.bonus_flat}
                        </div>
                        <div style="display:flex; gap:0.4rem; justify-content:flex-end;">
                            <button class="oad-btn oad-btn-ghost" style="padding:0.2rem 0.5rem; font-size:0.75rem;" onclick="window.__oadEditRule(${r.id})">✏️ แก้ไข</button>
                            <button class="oad-btn oad-btn-red" style="padding:0.2rem 0.5rem; font-size:0.75rem;" onclick="window.__oadDeleteRule(${r.id})">🗑️ ลบกฎ</button>
                        </div>
                    </div>
                </div>
            `).join('');
        } else {
            ruleWrap.innerHTML = `<div class="oad-empty" style="padding:2rem;">ยังไม่มีการตั้งกฎพิเศษ</div>`;
        }
    } catch (error) {
        console.error("Config Tab Error:", error);
        setWrap.innerHTML = `<p style="color:red; text-align:center;">โหลดข้อมูลผิดพลาด: ${error.message}</p>`;
        ruleWrap.innerHTML = '';
    }
}

window._flashInterval = null;

function renderFlashBoost() {
    const wrap = document.getElementById('oad-quick-boost-wrapper');
    if (!wrap) return;

    const xpSetting = state.stats?.settings?.find(s => s.key === 'flash_boost_xp');
    const untilSetting = state.stats?.settings?.find(s => s.key === 'flash_boost_until');

    const xp = xpSetting ? parseInt(xpSetting.value) || 0 : 0;
    const until = untilSetting ? parseInt(untilSetting.value) || 0 : 0;
    const now = Date.now();

    if (window._flashInterval) { clearInterval(window._flashInterval); window._flashInterval = null; }

    if (until > now) {
        wrap.innerHTML = `
            <div class="oad-panel-title">⚡ โปรโมชั่นนาทีทอง (Flash Boost)</div>
            <div style="background: linear-gradient(135deg, #f59e0b, #ef4444); color: #fff; padding: 1.5rem; border-radius: 12px; text-align: center; box-shadow: 0 4px 15px rgba(245, 158, 11, 0.3);">
                <h3 style="margin: 0; font-size: 1.4rem; color: #fff;">🔥 นาทีทองกำลังทำงาน!</h3>
                <p style="margin: 0.3rem 0 0 0; opacity: 0.9; font-size: 0.9rem;">แจกโบนัสพิเศษ <strong>+${xp} EXP</strong> สำหรับผู้ที่ทำรายการในเวลานี้</p>
                <div style="font-size: 3.5rem; font-weight: 800; margin: 1rem 0; font-family: monospace; letter-spacing: 3px; text-shadow: 2px 2px 4px rgba(0,0,0,0.2);" id="flash-countdown">--:--</div>
                <button class="oad-btn" style="background: rgba(255,255,255,0.2); color: #fff; border: 1px solid rgba(255,255,255,0.5); padding: 0.6rem 1.2rem;" onclick="window.__oadStopFlashBoost()">⏹️ ปิดโปรโมชั่นทันที</button>
            </div>
        `;
        
        window._flashInterval = setInterval(() => {
            const el = document.getElementById('flash-countdown');
            if (!el) { clearInterval(window._flashInterval); return; }
            const remain = until - Date.now();
            if (remain <= 0) {
                clearInterval(window._flashInterval);
                renderFlashBoost(); 
            } else {
                const m = Math.floor(remain / 60000).toString().padStart(2, '0');
                const s = Math.floor((remain % 60000) / 1000).toString().padStart(2, '0');
                el.textContent = `${m}:${s}`;
            }
        }, 1000);
    } else {
        wrap.innerHTML = `
            <div class="oad-panel-title">⚡ เปิดนาทีทอง (Flash Boost)</div>
            <p style="font-size:0.85rem; color:var(--text-muted);">ให้โบนัส EXP แบบนับถอยหลัง (หมดเวลาแล้วระบบจะตัดโบนัสทิ้งทันที)</p>
            <div style="display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap; background: var(--oad-surface2); padding: 1.2rem; border-radius: 8px; border: 1px solid var(--oad-border);">
                <div style="flex:1; min-width: 120px;">
                    <label style="font-size:0.75rem; font-weight:bold; color:var(--text-muted);">โบนัส EXP พิเศษ</label>
                    <input type="number" id="quick-boost-xp" class="swal2-input" placeholder="เช่น 20" style="width: 100%; margin:0; background:var(--input-bg); color:var(--text-main);">
                </div>
                <div style="flex:1; min-width: 120px;">
                    <label style="font-size:0.75rem; font-weight:bold; color:var(--text-muted);">ระยะเวลา (นาที)</label>
                    <input type="number" id="quick-boost-mins" class="swal2-input" placeholder="เช่น 10" style="width: 100%; margin:0; background:var(--input-bg); color:var(--text-main);">
                </div>
                <button class="oad-btn" style="background: #f59e0b; color: #fff; border:none; margin-top: auto; height: 44px; padding: 0 1.5rem;" onclick="window.__oadStartFlashBoost()">🚀 เปิดนาทีทอง!</button>
            </div>
        `;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Render: History tab (paginated)
// ─────────────────────────────────────────────────────────────────────────────
async function renderHistoryTable() {
    const wrap   = document.getElementById('oad-hist-table-wrap');
    if (!wrap) return;

    if (!state.borrowHistory.length) {
        wrap.innerHTML = skeleton(8, 5);
        await loadBorrowHistory();
    }

    const search = (document.getElementById('oad-hist-search')?.value || '').toLowerCase();
    const sf     = document.getElementById('oad-hist-status-filter')?.value || 'all';
    const page   = state.filters.history.page;

    let rows = state.borrowHistory;
    if (search) rows = rows.filter(r =>
        (r.borrower_name||'').toLowerCase().includes(search) ||
        (r.instrument_name||'').toLowerCase().includes(search)
    );
    if (sf === 'returned') rows = rows.filter(r => r.return_timestamp);
    if (sf === 'active')   rows = rows.filter(r => !r.return_timestamp);
    if (sf === 'overdue')  rows = rows.filter(r => !r.return_timestamp && r.due_date && new Date() > new Date(r.due_date));

    const paginated = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

    if (!rows.length) {
        wrap.innerHTML = `<div class="oad-empty"><span class="oad-empty-icon">📜</span>ไม่พบรายการ</div>`;
        document.getElementById('oad-hist-pagination').innerHTML = '';
        return;
    }

    wrap.innerHTML = `
        <table class="oad-table">
            <thead><tr>
                <th>ผู้ยืม</th><th>เครื่องดนตรี</th>
                <th>เวลายืม</th><th>เวลาคืน</th><th>สถานะ</th>
            </tr></thead>
            <tbody>
            ${paginated.map(r => {
                let st = 'active';
                if (r.return_timestamp) st = 'returned';
                else if (r.is_take_home && r.approval_status === 'pending') st = 'pending';
                else if (r.due_date && new Date() > new Date(r.due_date)) st = 'overdue';
                return `<tr>
                    <td>${escapeHtml(r.borrower_name || '—')}</td>
                    <td>${escapeHtml(r.instrument_name || '—')}</td>
                    <td class="nowrap">${fmtDate(r.borrow_timestamp)}</td>
                    <td class="nowrap">${fmtDate(r.return_timestamp)}</td>
                    <td>${badge(st)}</td>
                </tr>`;
            }).join('')}
            </tbody>
        </table>`;

    renderPagination('oad-hist-pagination', page, rows.length, (p) => {
        state.filters.history.page = p;
        renderHistoryTable();
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Pagination helper
// ─────────────────────────────────────────────────────────────────────────────
function renderPagination(containerId, page, total, onPage) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const totalPages = Math.ceil(total / PAGE_SIZE);
    if (totalPages <= 1) { el.innerHTML = ''; return; }

    el.innerHTML = `
        <button class="oad-btn oad-btn-ghost" ${page === 0 ? 'disabled' : ''} id="${containerId}-prev">‹</button>
        <span class="oad-page-info">${page + 1} / ${totalPages} (${total} รายการ)</span>
        <button class="oad-btn oad-btn-ghost" ${page >= totalPages - 1 ? 'disabled' : ''} id="${containerId}-next">›</button>`;

    el.querySelector(`#${containerId}-prev`)?.addEventListener('click', () => onPage(page - 1));
    el.querySelector(`#${containerId}-next`)?.addEventListener('click', () => onPage(page + 1));
}

// ─────────────────────────────────────────────────────────────────────────────
// Charts
// ─────────────────────────────────────────────────────────────────────────────
async function renderCharts() {
    if (typeof Chart === 'undefined') return;

    const donutCtx = document.getElementById('oad-donut-chart');
    if (donutCtx) {
        const { data } = await api.getBorrowCountsByType();
        if (state.charts.donut) state.charts.donut.destroy();
        
        if (data && data.length > 0) {
            state.charts.donut = new Chart(donutCtx, {
                type: 'doughnut',
                data: {
                    labels: data.map(d => d.instrument_type),
                    datasets: [{ data: data.map(d => d.borrow_count), backgroundColor: ['#6366f1','#3b82f6','#10b981','#f59e0b','#ef4444', '#8b5cf6', '#06b6d4'], hoverOffset: 4 }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, color: '#7c849c' } } },
                    // ✨ แก้ไขบัค 400 Bad Request: ดักการคลิกพื้นที่ว่าง
                    onClick: async (evt, item) => {
                        if (!item || item.length === 0) return; // ถ้าคลิกโดนพื้นที่ว่าง ให้ยกเลิกทันที
                        const idx = item[0].index;
                        const type = state.charts.donut.data.labels[idx];
                        if (type) {
                            showCategoryDetails(type);
                        }
                    }
                }
            });
        }
    }

    await refreshTimelineChart(); // ของเดิม
    document.getElementById('oad-timeline-filter')?.addEventListener('change', refreshTimelineChart);

    // ✨ เพิ่ม 2 บรรทัดนี้ต่อท้าย เพื่อบังคับให้มันวาด Heat Map และ Leaderboard ทุกครั้ง
    if (typeof renderHeatmap === 'function') renderHeatmap();
    if (typeof renderLeaderboards === 'function') renderLeaderboards();

    // ✨ เรียกใช้งาน Panel ใหม่
    renderHeatmap(); 
    renderLeaderboards(); 
}

// ✨ ฟังก์ชันแสดงรายละเอียดเมื่อคลิก Donut Chart
async function showCategoryDetails(type) {
    Swal.fire({ title: `กำลังโหลดข้อมูล ${type}...`, didOpen: () => Swal.showLoading() });
    
    try {
        const { data, error } = await api.getCategoryDetails(type);
        
        // ดักกรณี API Error หรือ Database มีปัญหา
        if (error || !data) {
            Swal.fire('ผิดพลาด', `ไม่สามารถโหลดข้อมูลได้: ${error?.message || 'ไม่พบฟังก์ชันบน DB'}`, 'error');
            return;
        }

        // ดักกรณีไม่มีคนยืมเลย (Array ว่าง)
        if (!Array.isArray(data) || data.length === 0) {
            Swal.fire({ title: `อันดับเครื่องดนตรี: ${type}`, html: '<div class="oad-empty">ยังไม่มีข้อมูลการยืมสำหรับประเภทนี้</div>', width: '500px' });
            return;
        }

        let html = `<table class="oad-table"><thead><tr><th style="text-align:left;">ชื่อเครื่องดนตรี</th><th style="text-align:right;">จำนวนครั้งที่ยืม</th></tr></thead><tbody>`;
        data.forEach(inst => {
            html += `<tr><td>${escapeHtml(inst.name || 'ไม่ทราบชื่อ')}</td><td style="text-align:right;"><strong>${inst.count}</strong> ครั้ง</td></tr>`;
        });
        html += `</tbody></table>`;

        Swal.fire({ title: `อันดับเครื่องดนตรี: ${type}`, html: html, width: '500px' });
        
    } catch (err) {
        Swal.fire('ผิดพลาด', `การเชื่อมต่อขัดข้อง: ${err.message}`, 'error');
    }
}

// ✨ ฟังก์ชันเรนเดอร์ Heatmap แบบง่ายด้วย CSS Grid
async function renderHeatmap() {
    const container = document.getElementById('oad-heatmap-container');
    if (!container) return;

    const { data, error } = await api.getHeatmapData();
    
    if (error || !data) {
        container.innerHTML = '<div style="grid-column: 1/-1; text-align:center; color:var(--oad-red); font-size:0.8rem;">ไม่สามารถโหลดข้อมูล Heat Map ได้</div>';
        return;
    }

    // ✨ ปรับ Container ให้เรียงเป็น 2 แถวบนล่าง (ไม่ต้องไปแก้ HTML ใน buildShell)
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '8px';
    container.style.height = 'auto'; 

    // หาค่าสูงสุดเพื่อมาคำนวณความเข้มของสี (ป้องกันกราฟสีเข้มเกินไปถ้าคนยืมน้อย)
    const maxVal = Math.max(...data.map(d => Math.max(d.borrows, d.returns, 1))); 

    // ฟังก์ชันย่อยสำหรับสร้างแถว Heat Map 
    const buildRow = (title, key, colorRGB) => {
        let rowHtml = `<div style="display:flex; align-items:center; gap:8px;">`;
        rowHtml += `<div style="width:30px; font-size:0.75rem; font-weight:bold; color:var(--oad-muted); text-align:right;">${title}</div>`;
        rowHtml += `<div style="flex:1; display:grid; grid-template-columns: repeat(24, 1fr); gap: 2px; height: 25px;">`;
        
        data.forEach(d => {
            const val = d[key];
            let bg, border;
            if (val === 0) {
                bg = 'var(--oad-surface2)';
                border = '1px solid var(--oad-border)';
            } else {
                // คำนวณความเข้มสี ยิ่งเยอะยิ่งเข้ม (ขั้นต่ำ 0.25)
                const opacity = Math.min(0.25 + (val / maxVal * 0.75), 1); 
                bg = `rgba(${colorRGB}, ${opacity})`;
                border = `1px solid rgba(${colorRGB}, 0.3)`;
            }
            // Tooltip เวลาเอาเมาส์ชี้
            rowHtml += `<div style="border-radius:3px; background:${bg}; border:${border}; cursor:pointer;" title="เวลา ${String(d.hour_of_day).padStart(2, '0')}:00 น. | ${title} ${val} ครั้ง"></div>`;
        });
        
        rowHtml += `</div></div>`;
        return rowHtml;
    };

    // สร้าง HTML 2 แถว: ยืม (สีฟ้า) และ คืน (สีเขียว)
    let html = '';
    html += buildRow('ยืม', 'borrows', '59, 130, 246');   // โทนสีฟ้า --oad-blue
    html += buildRow('คืน', 'returns', '16, 185, 129');   // โทนสีเขียว --oad-green

    container.innerHTML = html;
}

// ✨ ฟังก์ชันเรนเดอร์ Leaderboards
async function renderLeaderboards() {
    try {
        const { data, error } = await api.getLeaderboards();
        
        // ในฟังก์ชัน renderLeaderboards (admin-dashboard.js)
        if (error || !data) {
            console.warn("[Admin] Leaderboard fetch failed:", error);
            const tb = document.getElementById('oad-top-borrowers-list');
            const bd = document.getElementById('oad-top-badges-list');
            if (tb) tb.innerHTML = '<div class="oad-empty" style="padding:1rem;">⚠️ รอการเชื่อมต่อฐานข้อมูล</div>';
            if (bd) bd.innerHTML = '<div class="oad-empty" style="padding:1rem;">⚠️ รอการเชื่อมต่อฐานข้อมูล</div>';
            return;
        }

        const renderList = (elId, list, labelAttr) => {
            const el = document.getElementById(elId);
            if (!el) return;
            
            // ดักจับกรณี List ว่าง
            if (!Array.isArray(list) || list.length === 0) {
                el.innerHTML = '<div class="oad-empty" style="padding:1rem; font-size:0.8rem;">ยังไม่มีข้อมูลในระบบ</div>';
                return;
            }

            el.innerHTML = list.map((item, i) => `
                <div style="display:flex; justify-content:space-between; padding: 8px 0; border-bottom: 1px solid var(--oad-border); font-size: 0.9rem;">
                    <span>${i+1}. ${escapeHtml(item.student_name || item.first_name || 'ไม่ทราบชื่อ')}</span>
                    <strong style="color:var(--oad-accent);">${item.count || item.badge_count} ${labelAttr}</strong>
                </div>
            `).join('');
        };

        // ใช้ fallback [] เพื่อป้องกัน null error
        renderList('oad-top-borrowers-list', data.top_borrowers || [], 'ครั้ง');
        renderList('oad-top-badges-list', data.top_badges || [], 'เหรียญ');

        // ⏱️ Top Practicers — ใช้ state.clubRankings ที่โหลดมาแล้ว (RPC: get_club_practice_ranking)
        const practicers = (state.clubRankings || []).slice(0, 5).map(r => ({
            student_name: r.full_name,
            count: r.total_minutes >= 60
                ? `${Math.floor(r.total_minutes/60)}ชม.${r.total_minutes%60}น.`
                : `${r.total_minutes}น.`
        }));
        const practicersEl = document.getElementById('oad-top-practicers-list');
        if (practicersEl) {
            if (!practicers.length) {
                practicersEl.innerHTML = '<div class="oad-empty" style="padding:1rem; font-size:0.8rem;">ยังไม่มีข้อมูลเวลาซ้อม</div>';
            } else {
                practicersEl.innerHTML = practicers.map((item, i) => `
                    <div style="display:flex; justify-content:space-between; padding: 8px 0; border-bottom: 1px solid var(--oad-border); font-size: 0.9rem;">
                        <span>${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i+1) + '.'} ${escapeHtml(item.student_name || item.first_name || 'ไม่ทราบชื่อ')}</span>
                        <strong style="color:var(--oad-accent);">${item.count}</strong>
                    </div>
                `).join('');
            }
        }

    } catch (err) {
        console.error("[Admin] Leaderboard render error:", err);
    }
}

async function refreshTimelineChart() {
    const timelineCtx = document.getElementById('oad-timeline-chart');
    if (!timelineCtx || typeof Chart === 'undefined') return;

    const val = document.getElementById('oad-timeline-filter')?.value || '720-30';
    const [totalMin, intMin] = val.split('-').map(Number);
    const { data } = await api.getBorrowTimeline(totalMin, intMin);

    if (state.charts.timeline) state.charts.timeline.destroy();
    if (!data.length) return;

    const timeSlots = [...new Set(data.map(d => d.time_slot))].sort();
    const types     = [...new Set(data.map(d => d.instrument_type))];
    const palette   = ['#6366f1','#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4'];
    const labels    = timeSlots.map(ts => new Date(ts).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }));

    const datasets = types.map((type, i) => ({
        label: type,
        data: timeSlots.map(ts => data.find(d => d.time_slot === ts && d.instrument_type === type)?.borrowed_count || 0),
        borderColor: palette[i % palette.length],
        backgroundColor: palette[i % palette.length],
        fill: false, stepped: true, borderWidth: 2, pointRadius: 0,
    }));

    state.charts.timeline = new Chart(timelineCtx, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index' },
            plugins: { legend: { labels: { font: { size: 10 }, color: '#7c849c' } } },
            scales: {
                x: { grid: { color: 'rgba(124,132,156,0.1)' }, ticks: { color: '#7c849c', maxTicksLimit: 8 } },
                y: { beginAtZero: true, grid: { color: 'rgba(124,132,156,0.1)' }, ticks: { color: '#7c849c', precision: 0 } }
            }
        }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab badge counts
// ─────────────────────────────────────────────────────────────────────────────
function updateBadges() {
    const pending = state.pendingBorrows.filter(r => r.approval_status === 'pending').length;
    const pendEl  = document.getElementById('oad-pending-badge');
    if (pendEl) {
        pendEl.textContent = pending;
        pendEl.classList.toggle('hidden', pending === 0);
    }

    const repairs = state.repairs.filter(r => r.repair_status === 'แจ้งซ่อม' || r.repair_status === 'รอซ่อม').length;
    const repEl   = document.getElementById('oad-repair-badge');
    if (repEl) {
        repEl.textContent = repairs;
        repEl.classList.toggle('hidden', repairs === 0);
    }
}

let _refreshTimer = null;
function debounceRefresh() {
    if (_refreshTimer) clearTimeout(_refreshTimer);
    _refreshTimer = setTimeout(async () => {
        await refreshDirtyData();
        renderActiveTab();
        updateBadges();
    }, 300);
}

async function refreshDirtyData() {
    const [
        pendingRes, activeRes, repairRes, statsRes, knowRes,
        bossRes, bossReqRes
    ] = await Promise.allSettled([
        api.getPendingBorrowRequests(),
        api.getActiveBorrows(),
        api.getRepairRequests(),
        api.getStats(),
        adminExt.getKnowledgeLinks(),
        bossesApi.getAllBosses(),       
        bossesApi.getPendingRequests()  
    ]);

    // ✅ ใช้ Optional Chaining (?.) และ Fallback (|| []) เพื่อความปลอดภัยสูงสุด
    if (pendingRes.status === 'fulfilled' && !pendingRes.value.error) state.pendingBorrows = pendingRes.value.data || [];
    if (activeRes.status  === 'fulfilled' && !activeRes.value.error)  state.borrows        = activeRes.value.data || [];
    
    // ✅ ยุบรวม Logic ของ repairRes ไว้ที่เดียว บังคับให้เป็น Array เสมอ
    if (repairRes.status  === 'fulfilled') {
        state.repairs = repairRes.value.data || [];
    }

    if (statsRes.status   === 'fulfilled' && !statsRes.value.error)   state.stats          = statsRes.value.data || {};
    if (knowRes.status    === 'fulfilled' && !knowRes.value.error)    state.knowledgeLinks = knowRes.value.data || [];

    if (bossRes?.status === 'fulfilled' && !bossRes.value.error) {
        state.bosses = bossRes.value.data || [];
    }
    
    if (bossReqRes?.status === 'fulfilled' && !bossReqRes.value.error) {
        state.bossRequests = bossReqRes.value.data || [];
        
        // UI DOM Manipulation
        const badgeEl = document.getElementById('oad-boss-badge');
        if (badgeEl) {
            const count = state.bossRequests.length;
            badgeEl.textContent = count;
            badgeEl.classList.toggle('hidden', count === 0);
        }
    }

    // ล้างค่า History เพื่อรอโหลดใหม่ (ถ้าจำเป็นใน Flow ของคุณ)
    state.borrowHistory = []; 
    state.repairHistory = [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab switching
// ─────────────────────────────────────────────────────────────────────────────
function switchTab(tabName) {
    state.activeTab = tabName;
    document.querySelectorAll('.oad-tab').forEach(t =>
        t.classList.toggle('active', t.dataset.tab === tabName)
    );
    document.querySelectorAll('.oad-tab-panel').forEach(p =>
        p.classList.toggle('active', p.id === `oad-panel-${tabName}`)
    );
    renderActiveTab();
}

function renderActiveTab() {
    switch (state.activeTab) {
        case 'overview':     renderStats(); renderOverviewPanels(); break;
        case 'borrows':      renderBorrowsTable(); break;
        case 'events':       renderEventsTab(); _loadCalendarUrl(); _loadGcalStatus(); break;
        case 'uniforms':     renderUniformsTab(); break;
        case 'repairs':      renderRepairsTable(); break;
        case 'users':        loadUserKitMap().then(renderUsersTable); renderStaffPanels(); break;
        case 'recovery':     renderRecoveryTable(); break;
        case 'config':       renderConfigTab(); break;
        case 'rankings':     renderRankingsTable(); break;
        case 'instruments':  renderInstrumentsTable(); renderSectionMap(); break;
        case 'history':      renderHistoryTable(); break;
        case 'knowledge':    renderKnowledgeTable(); break;
        case 'notifications': renderScheduledNotifications(); break;
        case 'bosses':       renderBossesTable(); break;
        case 'loops':        renderLoopsTable(); break;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Wire all event listeners
// ─────────────────────────────────────────────────────────────────────────────
function wireListeners() {
    document.getElementById('oad-tabs')?.addEventListener('click', e => {
        const tab = e.target.closest('.oad-tab');
        if (tab?.dataset.tab) {
            document.querySelectorAll('.oad-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            state.activeTab = tab.dataset.tab;
            document.querySelectorAll('.oad-tab-panel').forEach(p => p.classList.remove('active'));
            document.getElementById(`oad-panel-${state.activeTab}`).classList.add('active');
            renderActiveTab();
        }
    });

    // 🎭 Events tab
    document.getElementById('oad-ev-create')?.addEventListener('click', () => _createEvent(false, 'open'));
    document.getElementById('oad-ev-draft')?.addEventListener('click', () => _createEvent(false, 'draft'));
    document.getElementById('oad-ev-quick')?.addEventListener('click', () => _createEvent(true));
    // เลือกวันที่ → เดากำหนดคืนเป็นเย็นวันเดียวกัน (งานส่วนใหญ่จบในวันเดียว)
    document.getElementById('oad-ev-date')?.addEventListener('change', e => {
        const dueEl = document.getElementById('oad-ev-due');
        if (!dueEl || dueEl.value || !e.target.value) return;
        dueEl.value = `${e.target.value}T18:00`;
    });

    // กำหนดคืนมีความหมายเฉพาะงานที่มีการเบิก — ไม่งั้นซ่อนไปเลยจะได้ไม่สับสน
    const syncDueVisibility = () => {
        const wrap = document.getElementById('oad-ev-due-wrap');
        const on = document.getElementById('oad-ev-inst')?.checked
                || document.getElementById('oad-ev-uni')?.checked;
        if (wrap) wrap.style.display = on ? '' : 'none';
    };
    ['oad-ev-inst', 'oad-ev-uni'].forEach(id =>
        document.getElementById(id)?.addEventListener('change', syncDueVisibility));

    // เลือกประเภทกิจกรรม → ตั้งค่าเริ่มต้นที่สมเหตุสมผลให้เลย
    document.getElementById('oad-ev-type')?.addEventListener('change', e => {
        const isShow = e.target.value === 'performance' || e.target.value === 'camp';
        const inst = document.getElementById('oad-ev-inst');
        const uni  = document.getElementById('oad-ev-uni');
        if (inst) inst.checked = isShow;
        if (uni)  uni.checked  = isShow;
        const st = document.getElementById('oad-ev-start');
        const en = document.getElementById('oad-ev-end');
        if (st && en && !st.dataset.touched) {
            if (e.target.value === 'practice') { st.value = '13:00'; en.value = '16:00'; }
            else { st.value = '08:00'; en.value = '12:00'; }
        }
        syncDueVisibility();
    });
    document.getElementById('oad-ev-start')?.addEventListener('input', e => { e.target.dataset.touched = '1'; });
    syncDueVisibility();

    // 📆 ซิงก์เข้าปฏิทินเดิม
    document.getElementById('oad-gcal-sync')?.addEventListener('click', async (e) => {
        const btn = e.target;
        btn.disabled = true; btn.textContent = '⏳ กำลังซิงก์...';
        const { data, error } = await eventsApi.gcalSync();
        btn.disabled = false; btn.textContent = '🔄 ซิงก์เดี๋ยวนี้';

        const res = data?.data ?? data;   // functions.invoke ห่อ payload ไว้ใน .data
        if (error || res?.ok === false) {
            const msg = res?.error || error?.message || 'ซิงก์ไม่สำเร็จ';
            return Swal.fire('ซิงก์ไม่สำเร็จ', msg, 'error');
        }
        toast(`ซิงก์แล้ว — เพิ่ม ${res?.created ?? 0} · แก้ ${res?.updated ?? 0} · ลบ ${res?.removed ?? 0}`);
        _loadGcalStatus();
    });

    // 📆 ปฏิทิน Google
    document.getElementById('oad-cal-copy')?.addEventListener('click', async () => {
        const el = document.getElementById('oad-cal-url');
        if (!el?.value) return toast('ยังไม่มีลิงก์', 'error');
        try { await navigator.clipboard.writeText(el.value); toast('คัดลอกลิงก์แล้ว'); }
        catch { el.select(); toast('กด Ctrl+C เพื่อคัดลอก'); }
    });
    document.getElementById('oad-cal-open')?.addEventListener('click', () => {
        const el = document.getElementById('oad-cal-url');
        if (!el?.value) return toast('ยังไม่มีลิงก์', 'error');
        window.open('https://calendar.google.com/calendar/u/0/r/settings/addbyurl', '_blank');
    });
    document.getElementById('oad-cal-reset')?.addEventListener('click', async () => {
        const { isConfirmed } = await Swal.fire({
            title: 'เปลี่ยนลิงก์ปฏิทิน?',
            text: 'ลิงก์เดิมจะใช้ไม่ได้ทันที — ทุกคนที่ subscribe ไว้ต้อง subscribe ใหม่',
            icon: 'warning', showCancelButton: true,
            confirmButtonText: 'เปลี่ยน', cancelButtonText: 'ยกเลิก'
        });
        if (!isConfirmed) return;
        const { error } = await eventsApi.resetCalendarToken();
        if (error) return toast(error.message, 'error');
        toast('เปลี่ยนลิงก์แล้ว — แจ้งให้ทุกคน subscribe ใหม่');
        _loadCalendarUrl();
    });

    // 🎖 Staff roles
    document.getElementById('oad-staff-add')?.addEventListener('click', () => window.__oadAddStaff());
    document.getElementById('oad-user-kit-filter')?.addEventListener('change', () => renderUsersTable());

    // 👔 Uniforms tab
    document.getElementById('oad-uni-settype')?.addEventListener('change', e => {
        _uni.setTypeId = Number(e.target.value);
        _renderKitTable();
    });
    document.getElementById('oad-uni-card')?.addEventListener('click', () => window.__oadPrintKitCards());
    document.getElementById('oad-uni-sizes')?.addEventListener('click', () => {
        document.getElementById('oad-sizegrid-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        window.__oadSizeJump();
    });
    document.getElementById('oad-sg-onlyempty')?.addEventListener('change', () => renderSizeGrid());
    document.getElementById('oad-sg-jump')?.addEventListener('click', () => window.__oadSizeJump());
    // กันปิดหน้าทั้งที่ยังบันทึกไม่เสร็จ
    window.addEventListener('beforeunload', e => {
        if (_sg.dirty.size) { e.preventDefault(); e.returnValue = ''; }
    });
    document.getElementById('oad-uni-newkits')?.addEventListener('click', () => window.__oadNewKits());
    document.getElementById('oad-uni-refresh')?.addEventListener('click', () => renderUniformsTab());
    document.getElementById('oad-uni-filter')?.addEventListener('change', () => _renderKitTable());
    document.getElementById('oad-uni-relinactive')?.addEventListener('click', async () => {
        const { isConfirmed } = await Swal.fire({
            title: '🧹 ปลดชุดของคนที่จบ/ลาออก/ปิดบัญชี?',
            text: 'ชุดเหล่านั้นจะกลับมาว่างให้รุ่นน้องเลือกได้ ประวัติเจ้าของเดิมยังอยู่ครบ',
            icon: 'question', showCancelButton: true,
            confirmButtonText: 'ปลดทั้งหมด', cancelButtonText: 'ยกเลิก'
        });
        if (!isConfirmed) return;
        const { data, error } = await uniformApi.releaseInactiveKits();
        if (error) return toast(error.message, 'error');
        toast(data?.message || 'ปลดแล้ว');
        _renderKitTable();
    });
    document.getElementById('oad-uni-addpart')?.addEventListener('click', () => window.__oadAddPartType());
    document.getElementById('oad-uni-sync')?.addEventListener('click', async () => {
        const { data, error } = await uniformApi.syncKitParts(_uni.setTypeId);
        if (error) return toast(error.message, 'error');
        toast(data?.message || 'เติมชิ้นส่วนแล้ว');
        renderUniformsTab();
    });

    // Recovery tab listeners
    document.getElementById('oad-recovery-refresh')?.addEventListener('click', () => renderRecoveryTable());
    document.getElementById('oad-recovery-status-filter')?.addEventListener('change', () => renderRecoveryTable());

    document.getElementById('oad-refresh-btn')?.addEventListener('click', async () => {
        await refreshDirtyData();
        const { data: users } = await adminExt.getUsers();
        if (users) state.users = users;
        const { data: inst }  = await api.getAllInstruments();
        if (inst)  state.instruments = inst;
        state.borrowHistory = [];
        state.repairHistory  = [];
        renderActiveTab();
        updateBadges();
        toast('🔄 รีเฟรชแล้ว', 'info');
    });

    document.getElementById('oad-yearly-reset-btn')?.addEventListener('click', () => window.__oadYearlyReset());
    document.getElementById('oad-add-instrument-btn')?.addEventListener('click', () => window.__oadAddInstrument());

    document.getElementById('oad-borrow-view-select')?.addEventListener('change', async () => {
        state.filters.borrows.page = 0;
        const view = getBorrowView();
        if (view === 'history' && !state.borrowHistory.length) {
            document.getElementById('oad-borrow-table-wrap').innerHTML = skeleton(8, 5);
            await loadBorrowHistory();
        }
        renderBorrowsTable();
    });

    const watchFilter = (id, renderFn) => {
        document.getElementById(id)?.addEventListener('input',  () => renderFn());
        document.getElementById(id)?.addEventListener('change', () => renderFn());
    };

    watchFilter('oad-borrow-search',        renderBorrowsTable);
    watchFilter('oad-borrow-status-filter', renderBorrowsTable);
    watchFilter('oad-repair-search',        renderRepairsTable);
    watchFilter('oad-repair-status-filter', renderRepairsTable);
    watchFilter('oad-inst-search',           renderInstrumentsTable);
    watchFilter('oad-inst-status-filter',    renderInstrumentsTable);
    watchFilter('oad-inst-type-filter',      renderInstrumentsTable);
    watchFilter('oad-inst-condition-filter', renderInstrumentsTable);
    watchFilter('oad-inst-sort',             renderInstrumentsTable);
    document.getElementById('oad-inst-clear-filters')?.addEventListener('click', () => {
        const ids = ['oad-inst-search','oad-inst-type-filter','oad-inst-condition-filter','oad-inst-status-filter','oad-inst-sort'];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            if (el.tagName === 'SELECT') el.value = el.querySelector('option')?.value || 'all';
            else el.value = '';
        });
        renderInstrumentsTable();
    });
    watchFilter('oad-hist-search',          renderHistoryTable);
    watchFilter('oad-hist-status-filter',   renderHistoryTable);
    watchFilter('oad-rank-type-filter',     renderRankingsTable);
    watchFilter('oad-rank-class-filter',    renderRankingsTable);

    watchFilter('oad-user-search',          renderUsersTable);
    watchFilter('oad-user-status-filter',   renderUsersTable);
    watchFilter('oad-user-class-filter',    renderUsersTable); 
    watchFilter('oad-know-search',          renderKnowledgeTable);
    watchFilter('oad-know-status-filter',   renderKnowledgeTable);

    document.getElementById('oad-user-group-filter')?.addEventListener('change', (e) => {
        const classFilter = document.getElementById('oad-user-class-filter');
        if (!classFilter) return;

        const val = e.target.value;
        if (val === 'student' || val === 'club') {
            classFilter.style.display = 'inline-block';
            
            const targetUsers = state.users.filter(u => u.student_group === val && u.class_level);
            const classes = [...new Set(targetUsers.map(u => u.class_level))].sort();
            
            classFilter.innerHTML = '<option value="all">ทุกห้องเรียน</option>' + 
                                    classes.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
        } else {
            classFilter.style.display = 'none';
            classFilter.value = 'all';
        }
        renderUsersTable();
    });

    document.getElementById('oad-reset-practice-btn')?.addEventListener('click', async () => {
        const { value: confirmation } = await Swal.fire({
            title: '⚠️ ยืนยันการรีเซ็ต?',
            html: `การกระทำนี้จะล้างเวลาซ้อมทั้งหมดในระบบและ <b>ไม่สามารถย้อนกลับได้</b><br><br>โปรดพิมพ์ <strong>RESET</strong> เพื่อยืนยัน`,
            icon: 'warning', input: 'text', inputPlaceholder: 'พิมพ์ RESET ที่นี่',
            showCancelButton: true, confirmButtonText: 'ยืนยันการล้างข้อมูล', confirmButtonColor: '#d33'
        });
        if (confirmation === 'RESET') {
            Swal.showLoading();
            const { error } = await adminExt.resetAllPracticeTimes();
            if (error) { toast('ผิดพลาด: ' + error.message, 'error'); return; }
            await Swal.fire('สำเร็จ!', 'ล้างเวลาซ้อมเรียบร้อยแล้ว', 'success');
            await loadAll();
            renderActiveTab();
        }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Public entry point — called by ui.js renderAdminView()
// ─────────────────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════
// ⏱️ Admin Borrow Live Timer (countdown / elapsed)
// ═══════════════════════════════════════════════════════════════
let _adminBorrowTimerInterval = null;

function _fmtElapsed(startIso) {
    if (!startIso) return '00:00:00';
    const start = new Date(startIso).getTime();
    if (isNaN(start)) return '00:00:00';
    const diff = Math.max(0, Date.now() - start);
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function _fmtCountdown(dueDateStr) {
    if (!dueDateStr) return '<span style="color:var(--oad-muted);">ไม่มีกำหนด</span>';
    const due = new Date(dueDateStr);
    if (isNaN(due)) return '<span style="color:var(--oad-muted);">ไม่มีกำหนด</span>';

    // 🟢 FIX: เดิมบังคับ setHours(23,59) เสมอ ซึ่งถูกเฉพาะตอนรับค่าเป็น date (ยืมกลับบ้าน)
    // ตอนนี้รับ expected_return_at ที่มีเวลาจริง (เช่น ยืม 1 ชม. หมดเวลา 15:30)
    // ถ้ายังบังคับสิ้นวันจะนับถอยหลังผิดไปหลายชั่วโมง
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(dueDateStr).trim())) {
        due.setHours(23, 59, 59, 999);
    }

    const diff = due.getTime() - Date.now();
    if (diff < 0) {
        const od = Math.abs(diff);
        const d = Math.floor(od / 86400000);
        const h = Math.floor((od % 86400000) / 3600000);
        const m = Math.floor((od % 3600000) / 60000);
        return `<span style="color:#ef4444;">⚠️ เกินมา ${d > 0 ? d + ' วัน ' : ''}${h} ชม. ${m} นาที</span>`;
    }
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    if (d > 0) return `<span style="color:#10b981;">🕐 อีก ${d} วัน ${h} ชม. ${m} นาที</span>`;

    // เกณฑ์สีอิงเวลาที่เหลือจริง — ยืม 1 ชม. กับ 6 ชม. ใช้เกณฑ์เดียวกันได้
    const minsLeft = diff / 60000;
    const color = minsLeft <= 10 ? '#ef4444' : minsLeft <= 30 ? '#f59e0b' : '#10b981';
    return `<span style="color:${color};">🕐 ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}</span>`;
}

function _updateAdminBorrowTimers() {
    document.querySelectorAll('.oad-live-elapsed').forEach(el => {
        el.textContent = _fmtElapsed(el.dataset.start);
    });
    document.querySelectorAll('.oad-live-countdown').forEach(el => {
        el.innerHTML = _fmtCountdown(el.dataset.due);
    });
}

function _startAdminBorrowTimer() {
    if (_adminBorrowTimerInterval) return;  // already running
    _updateAdminBorrowTimers();  // fire immediately
    _adminBorrowTimerInterval = setInterval(_updateAdminBorrowTimers, 1000);
}

function _stopAdminBorrowTimer() {
    if (_adminBorrowTimerInterval) {
        clearInterval(_adminBorrowTimerInterval);
        _adminBorrowTimerInterval = null;
    }
}

// ═══════════════════════════════════════════════════════════════
// 🔄 Account Recovery Requests
// ═══════════════════════════════════════════════════════════════
const _recoveryState = { items: [], status: 'pending' };

async function loadRecoveryRequests() {
    const status = document.getElementById('oad-recovery-status-filter')?.value || 'pending';
    _recoveryState.status = status;
    const { data, error } = await recoveryApi.list(status);
    if (error) {
        console.error('[Recovery] load error', error);
        _recoveryState.items = [];
    } else {
        _recoveryState.items = data || [];
    }
    updateRecoveryBadge();
}

function updateRecoveryBadge() {
    const badge = document.getElementById('oad-recovery-badge');
    if (!badge) return;
    const pendingCount = _recoveryState.items.filter(r => r.status === 'pending').length
        + (_recoveryState.status !== 'pending' ? 0 : 0);
    // ถ้า filter ปัจจุบันคือ pending — count = items.length
    const cnt = _recoveryState.status === 'pending' ? _recoveryState.items.length : 0;
    if (cnt > 0) {
        badge.textContent = String(cnt);
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

async function renderRecoveryTable() {
    const wrap = document.getElementById('oad-recovery-table-wrap');
    if (!wrap) return;

    await loadRecoveryRequests();
    const rows = _recoveryState.items;

    if (!rows.length) {
        wrap.innerHTML = `<div class="oad-empty"><span class="oad-empty-icon">✨</span>ไม่มีคำขอ${_recoveryState.status === 'pending' ? 'ที่รออนุมัติ' : ''}</div>`;
        return;
    }

    const statusBadge = (s) => {
        if (s === 'pending')  return '<span class="oad-badge oad-badge-amber">⏳ รออนุมัติ</span>';
        if (s === 'approved') return '<span class="oad-badge oad-badge-green">✅ อนุมัติแล้ว</span>';
        if (s === 'rejected') return '<span class="oad-badge oad-badge-red">❌ ปฏิเสธ</span>';
        return s || '—';
    };

    wrap.innerHTML = `
        <table class="oad-table">
            <thead><tr>
                <th>วันที่ขอ</th>
                <th>รหัสนักเรียน</th>
                <th>บัญชีเดิม</th>
                <th>อีเมลใหม่</th>
                <th>ชื่อใหม่ที่กรอก</th>
                <th>สถานะ</th>
                <th>จัดการ</th>
            </tr></thead>
            <tbody>
            ${rows.map(r => {
                const reqDate = new Date(r.created_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
                const oldName = r.old_name || '(ไม่พบบัญชีเดิม)';
                const newName = `${r.requested_first_name || ''} ${r.requested_last_name || ''}`.trim() || '—';
                const actions = r.status === 'pending'
                    ? `<button class="oad-btn oad-btn-green" onclick="window.__oadApproveRecovery('${r.id}')">✅ อนุมัติ</button>
                       <button class="oad-btn oad-btn-red"   onclick="window.__oadRejectRecovery('${r.id}')">❌ ปฏิเสธ</button>`
                    : (r.rejected_reason ? `<span style="font-size:0.8rem; color:var(--oad-muted);" title="${escapeHtml(r.rejected_reason)}">เหตุผล: ${escapeHtml(r.rejected_reason)}</span>` : '—');
                return `<tr>
                    <td><div style="font-size:0.85rem;">${reqDate}</div></td>
                    <td><strong>${escapeHtml(r.student_id)}</strong></td>
                    <td>
                        <div>${escapeHtml(oldName)}</div>
                        <div style="font-size:0.75rem; color:var(--oad-muted);">${escapeHtml(r.old_email || '—')} · ${escapeHtml(r.old_class || '—')}</div>
                    </td>
                    <td><strong>${escapeHtml(r.new_email)}</strong></td>
                    <td>${escapeHtml(newName)}</td>
                    <td>${statusBadge(r.status)}</td>
                    <td><div class="actions" style="gap:0.4rem; flex-wrap:wrap;">${actions}</div></td>
                </tr>`;
            }).join('')}
            </tbody>
        </table>`;
}

// ═══════════════════════════════════════════════════════════════
// 🔔 Admin Notification Bell
// ═══════════════════════════════════════════════════════════════
const _adminBellState = {
    activeFilter: 'all',
    items: [],
    unsubscribe: null,
    pollTimer: null
};

async function initAdminBell() {
    const bellBtn = document.getElementById('oad-bell-btn');
    const panel   = document.getElementById('oad-notif-panel');
    if (!bellBtn || !panel) return;

    bellBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        panel.classList.toggle('open');
        if (panel.classList.contains('open')) loadAdminBellItems();
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('#oad-bell-wrap')) panel.classList.remove('open');
    });

    document.querySelectorAll('.oad-notif-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            document.querySelectorAll('.oad-notif-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            _adminBellState.activeFilter = pill.dataset.filter;
            renderAdminBellList();
        });
    });

    document.getElementById('oad-notif-ack-all')?.addEventListener('click', async () => {
        const { error } = await adminNotifications.acknowledgeAll();
        if (!error) {
            _adminBellState.items.forEach(i => i.is_read = true);
            renderAdminBellList();
            updateAdminBellBadge();
            toast('✅ อ่านทุกการแจ้งเตือนแล้ว', 'success');
        }
    });

    await loadAdminBellItems();
    await updateAdminBellBadge();

    _adminBellState.unsubscribe = adminNotifications.subscribeRealtime((newRow) => {
        _adminBellState.items.unshift(newRow);
        if (_adminBellState.items.length > 50) _adminBellState.items.pop();
        renderAdminBellList();
        updateAdminBellBadge();
        if (newRow.severity === 'critical' || newRow.severity === 'warning') {
            const t = newRow.severity === 'critical' ? 'error' : 'warning';
            toast(newRow.title, t);
        }
    });

    _adminBellState.pollTimer = setInterval(() => {
        loadAdminBellItems();
        updateAdminBellBadge();
    }, 5 * 60 * 1000);
}

async function loadAdminBellItems() {
    const { data, error } = await adminNotifications.list({ limit: 50 });
    if (error) { console.error('[AdminBell] load error', error); return; }
    _adminBellState.items = data;
    renderAdminBellList();
}

async function updateAdminBellBadge() {
    const badge = document.getElementById('oad-bell-badge');
    if (!badge) return;
    const { count } = await adminNotifications.getTotalUnread();
    if (count > 0) {
        badge.textContent = count > 99 ? '99+' : String(count);
        badge.classList.remove('hidden');
        const hasCritical = _adminBellState.items.some(i => !i.is_read && i.severity === 'critical');
        const hasWarning  = _adminBellState.items.some(i => !i.is_read && i.severity === 'warning');
        badge.classList.remove('critical', 'warning');
        if (hasCritical) badge.classList.add('critical');
        else if (hasWarning) badge.classList.add('warning');
    } else {
        badge.classList.add('hidden');
    }
}

function renderAdminBellList() {
    const list = document.getElementById('oad-notif-list');
    if (!list) return;

    let items = _adminBellState.items;
    const f = _adminBellState.activeFilter;
    if (f === 'critical') items = items.filter(i => i.severity === 'critical');
    else if (f === 'warning') items = items.filter(i => i.severity === 'warning');
    else if (['security','user','operation','learning','system'].includes(f)) {
        items = items.filter(i => i.category === f);
    }

    if (!items.length) {
        list.innerHTML = '<div class="oad-notif-empty">✨ ไม่มีข้อความ</div>';
        return;
    }

    list.innerHTML = items.map(it => {
        const time = new Date(it.created_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
        const sev = it.severity || 'info';
        const unreadCls = it.is_read ? '' : 'unread';
        return `
            <div class="oad-notif-item ${sev} ${unreadCls}" data-id="${it.id}">
                <div class="oad-notif-title">${escapeHtml(it.title || '')}</div>
                <div class="oad-notif-body">${escapeHtml(it.body || '')}</div>
                <div class="oad-notif-meta">${time} · ${escapeHtml(it.category || '')}</div>
            </div>
        `;
    }).join('');

    list.querySelectorAll('.oad-notif-item').forEach(el => {
        el.addEventListener('click', async () => {
            const id = parseInt(el.dataset.id);
            const item = _adminBellState.items.find(i => i.id === id);
            if (!item) return;

            // acknowledge ก่อน
            if (!item.is_read) {
                item.is_read = true;
                el.classList.remove('unread');
                await adminNotifications.acknowledge(id);
                updateAdminBellBadge();
            }

            // 🧭 Navigate ไปยัง tab ที่เกี่ยวข้องตาม category + metadata
            const targetTab = _mapNotifToTab(item);
            if (targetTab) {
                // ปิด panel + switch tab
                document.getElementById('oad-notif-panel')?.classList.remove('open');
                const tabBtn = document.querySelector(`.oad-tab[data-tab="${targetTab}"]`);
                if (tabBtn) {
                    tabBtn.click();
                    // เลื่อนหน้าไปบน + flash highlight tab
                    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 100);
                }
            }
        });
    });
}

// 🧭 Map notification → admin tab ที่ relevant
function _mapNotifToTab(item) {
    const cat = item.category;
    const title = (item.title || '').toLowerCase();
    const meta = item.metadata || {};

    // Recovery — กู้คืนบัญชี
    if (title.includes('กู้คืน')) return 'recovery';

    // Repair — แจ้งซ่อม
    if (cat === 'operation' && (title.includes('ซ่อม') || meta.repair_id)) return 'repairs';

    // Borrow — คำขอยืม
    if (cat === 'operation' && (title.includes('ยืม') || title.includes('เกินกำหนด') || meta.borrow_id)) return 'borrows';

    // Knowledge — คลังความรู้
    if (cat === 'learning' && (title.includes('คลังความรู้') || title.includes('คลิป') || meta.knowledge_id)) return 'knowledge';

    // Boss raid backlog
    if (cat === 'learning' && (title.includes('บอส') || title.includes('raid'))) return 'bosses';

    // User: block / xp spike / role change
    if (cat === 'user' || cat === 'security') {
        if (title.includes('บล็อก') || title.includes('xp') || title.includes('แอดมิน')) return 'users';
    }

    // System / default: ไม่ navigate
    return null;
}

export async function initAdminDashboard(containerEl) {
    const user = getCurrentUser();
    if (!user || user.role !== 'admin') {
        containerEl.innerHTML = `<div style="text-align:center;padding:4rem;">
            <h3>⛔ Access Denied</h3><p>เฉพาะผู้ดูแลระบบเท่านั้น</p></div>`;
        return;
    }

    document.body.classList.add('admin-mode');

    injectStyles();
    containerEl.innerHTML = buildShell();

    registerWindowActions();
    wireListeners();

    await loadAll();

    renderStats();
    renderOverviewPanels();
    updateBadges();
    renderCharts();

    setupRealtime();
    initAdminBell();
}

export function destroyAdminDashboard() {
    document.body.classList.remove('admin-mode');
    if (state.realtimeChannel) {
        adminExt.removeRealtime(state.realtimeChannel);
        state.realtimeChannel = null;
    }
    if (_adminBellState.unsubscribe) { _adminBellState.unsubscribe(); _adminBellState.unsubscribe = null; }
    if (_adminBellState.pollTimer) { clearInterval(_adminBellState.pollTimer); _adminBellState.pollTimer = null; }
    _stopAdminBorrowTimer();
    if (_refreshTimer) { clearTimeout(_refreshTimer); _refreshTimer = null; }
    if (state.charts.timeline) state.charts.timeline.destroy();
    if (state.charts.donut)    state.charts.donut.destroy();
    state.charts = {};
    ['__oadApprove','__oadForceReturn','__oadEditRepair','__oadBlock','__oadUnblock',
     '__oadEditUser','__oadEditInstrument','__oadDeleteInstrument','__oadAddInstrument',
     '__oadYearlyReset', '__oadManageBadgeDefs', '__oadDeleteBadgeDef', '__oadAddBadgeDef', 
     '__oadManageBadges', '__oadAwardUserBadge', '__oadRemoveUserBadge', '__oadManageExp',
     '__oadSaveConfig', '__oadDeleteRule', '__oadAddRule', '__oadQuickBoost', '__oadLogout',
     '__oadShowQR', '__oadHandleGroupFilter', '__oadExportAllQR', '__oadInstrumentHistory',
     '__oadJumpToUser', '__oadToggleDeactivate', '__oadQuickNav', '__oadApproveKnowledge',
     '__oadDeleteKnowledge', '__oadAddKnowledge', '__oadEditKnowledge', '__oadReviewKnowledge', '__oadStartFlashBoost',
     '__oadNewScheduledNotif', '__oadEditScheduledNotif', '__oadToggleScheduledNotif', '__oadDeleteScheduledNotif',
     '__oadAnnounceNow', '__oadDispatchNow',
     '__oadStopFlashBoost', '__oadUserHistory'].forEach(k => delete window[k]);
}
// ═══════════════════════════════════════════════════════════════════════════
// 🎭 EVENTS TAB — หน้าเปิด/ปิดงานของครู
//    งานเป็นตัวกลางของทุกอย่าง: เด็กเลือกงานตอนสแกน → กำหนดคืนยึดตามงาน
//    → ปิดงานไม่ได้ถ้ายังมีของค้าง (เว้นแต่ระบุเหตุผล)
// ═══════════════════════════════════════════════════════════════════════════

const _ACT = {
    practice:    { icon: '🎵', name: 'ซ้อม',      cls: 'oad-badge-blue' },
    camp:        { icon: '⛺', name: 'เข้าค่าย',  cls: 'oad-badge-purple' },
    performance: { icon: '🎭', name: 'ออกงาน',    cls: 'oad-badge-amber' },
    meeting:     { icon: '📋', name: 'ประชุม',    cls: 'oad-badge-gray' },
    other:       { icon: '📌', name: 'อื่นๆ',     cls: 'oad-badge-gray' }
};

const _EV_STATUS = {
    draft:  '<span class="oad-badge oad-badge-amber">📝 ร่าง — นักเรียนยังไม่เห็น</span>',
    open:   '<span class="oad-badge oad-badge-green">เปิดรับเบิก</span>',
    active: '<span class="oad-badge oad-badge-blue">กำลังดำเนินงาน</span>',
    closed: '<span class="oad-badge oad-badge-gray">ปิดแล้ว</span>'
};

async function renderEventsTab() {
    const wrap = document.getElementById('oad-events-wrap');
    if (!wrap) return;
    wrap.innerHTML = '<div class="oad-skel" style="height:120px;"></div>';

    const { data: events, error } = await eventsApi.list();
    if (error) {
        wrap.innerHTML = `<div class="oad-empty">โหลดรายการงานไม่สำเร็จ: ${escapeHtml(error.message)}</div>`;
        return;
    }
    if (!events?.length) {
        wrap.innerHTML = '<div class="oad-empty"><span class="oad-empty-icon">🎭</span>ยังไม่มีงาน — เปิดงานแรกได้เลย</div>';
        _updateEventsBadge(0);
        return;
    }

    // ดึงสรุปของแต่ละงานพร้อมกัน
    const summaries = await Promise.all(
        events.map(e => eventsApi.getSummary(e.id).then(r => r.data || {}).catch(() => ({})))
    );

    _updateEventsBadge(events.filter(e => e.status === 'open' || e.status === 'active').length);

    wrap.innerHTML = `
        <table class="oad-table">
            <thead><tr>
                <th>ประเภท</th><th>กิจกรรม</th><th>วันที่</th><th>⏰ เวลา</th><th>กำหนดคืน</th>
                <th>เครื่องดนตรี</th><th>ชุด</th><th>สถานะ</th><th>จัดการ</th>
            </tr></thead>
            <tbody>
            ${events.map((e, i) => {
                const s = summaries[i] || {};
                const iPend = s.instrument_pending || 0;
                const uPend = s.uniform_pending || 0;
                const cell = (back, out, pend) => out
                    ? `${back}/${out}${pend ? ` <span style="color:#ef4444;font-weight:700;">ค้าง ${pend}</span>` : ' ✅'}`
                    : '—';
                const isClosed = e.status === 'closed';
                return `<tr>
                    <td class="nowrap">${(() => { const a = _ACT[e.activity_type] || _ACT.other;
                        return `<span class="oad-badge ${a.cls}">${a.icon} ${a.name}</span>`; })()}</td>
                    <td><strong>${escapeHtml(e.name)}</strong>
                        ${e.location ? `<div style="font-size:.72rem;opacity:.65;">📍 ${escapeHtml(e.location)}</div>` : ''}
                        ${e.show_in_calendar ? '' : '<div style="font-size:.72rem;opacity:.55;">ไม่แสดงในปฏิทิน</div>'}</td>
                    <td class="nowrap">${fmtDateShort(e.event_date)}</td>
                    <td class="nowrap" style="font-size:.82rem;">${(() => {
                        const t = d => new Date(d).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
                        if (!e.start_at) return '<span style="opacity:.4;">—</span>';
                        return e.end_at ? `${t(e.start_at)}–${t(e.end_at)}` : `${t(e.start_at)} น.`;
                    })()}</td>
                    <td class="nowrap">${(e.needs_instrument || e.needs_uniform)
                        ? fmtDate(e.return_due_at) : '<span style="opacity:.4;">ไม่มีการเบิก</span>'}</td>
                    <td class="nowrap">${cell(s.instrument_back, s.instrument_out, iPend)}</td>
                    <td class="nowrap">${cell(s.uniform_back, s.uniform_out, uPend)}</td>
                    <td>${_EV_STATUS[e.status] || escapeHtml(e.status)}</td>
                    <td><div class="actions">
                        ${e.status === 'draft'
                          ? `<button class="oad-btn oad-btn-approve" onclick="window.__oadPublishEvent(${e.id}, '${escapeHtml(e.name).replace(/'/g, "\'")}')">📢 ประกาศ</button>`
                          : ''}
                        ${isClosed || e.status === 'draft' ? '' :
                          `<button class="oad-btn oad-btn-red" onclick="window.__oadCloseEvent(${e.id}, ${iPend + uPend})">🔴 ปิดงาน</button>`}
                        <button class="oad-btn" onclick="window.__oadEventDetail(${e.id})">🔍 ของค้าง</button>
                    </div></td>
                </tr>`;
            }).join('')}
            </tbody>
        </table>`;
}

function _updateEventsBadge(n) {
    const b = document.getElementById('oad-events-badge');
    if (!b) return;
    if (n > 0) { b.textContent = String(n); b.classList.remove('hidden'); }
    else b.classList.add('hidden');
}

async function _createEvent(quick = false, status = 'open') {
    const pick = id => document.getElementById(id);
    let payload;

    if (quick) {
        // ⚡ ซ้อมวันนี้ — กรณีที่ใช้บ่อยที่สุด ไม่ต้องกรอกอะไรนอกจากชื่อ
        const { value: qName } = await Swal.fire({
            title: '⚡ นัดซ้อมวันนี้',
            input: 'text', inputPlaceholder: 'ชื่อ (เว้นว่าง = "ซ้อมประจำ")',
            text: '13:00 – 16:00 วันนี้ · ไม่ต้องเบิกของ',
            showCancelButton: true, confirmButtonText: 'เพิ่ม', cancelButtonText: 'ยกเลิก'
        });
        if (qName === undefined) return;
        const today = new Date().toISOString().slice(0, 10);
        payload = {
            name: (qName || '').trim() || 'ซ้อมประจำ',
            eventDate: today,
            startAt: new Date(`${today}T13:00`).toISOString(),
            endAt:   new Date(`${today}T16:00`).toISOString(),
            activityType: 'practice', showInCalendar: true,
            needsInstrument: false, needsUniform: false, openTo: 'club',
            status: 'open', remindBefore: [120]
        };
    } else {
        const name = pick('oad-ev-name')?.value?.trim();
        const date = pick('oad-ev-date')?.value;
        const st   = pick('oad-ev-start')?.value;
        const en   = pick('oad-ev-end')?.value;
        const due  = pick('oad-ev-due')?.value;
        const inst = pick('oad-ev-inst')?.checked ?? false;
        const uni  = pick('oad-ev-uni')?.checked ?? false;

        if (!name || !date || !st || !en) {
            return toast('กรอกชื่อ วันที่ เวลาเริ่ม-เลิก ให้ครบ', 'error');
        }
        const startAt = new Date(`${date}T${st}`);
        const endAt   = new Date(`${date}T${en}`);
        if (endAt <= startAt) return toast('เวลาเลิกต้องอยู่หลังเวลาเริ่ม', 'error');

        if ((inst || uni) && !due) return toast('งานที่มีการเบิกต้องระบุกำหนดคืน', 'error');
        if (due && new Date(due) <= startAt) return toast('กำหนดคืนต้องอยู่หลังเวลาเริ่ม', 'error');

        payload = {
            name, eventDate: date,
            startAt: startAt.toISOString(), endAt: endAt.toISOString(),
            returnDueAt: due ? new Date(due).toISOString() : null,
            activityType: pick('oad-ev-type')?.value || 'performance',
            location: pick('oad-ev-loc')?.value?.trim() || null,
            needsInstrument: inst, needsUniform: uni,
            openTo: pick('oad-ev-open')?.value || 'club',
            showInCalendar: pick('oad-ev-cal')?.checked ?? true,
            status,
            remindBefore: [...document.querySelectorAll('.oad-ev-rem:checked')]
                .map(c => Number(c.value)).sort((a, b) => b - a)
        };
    }

    const { data, error } = await eventsApi.create(payload);
    if (error) return toast(error.message || 'เพิ่มกิจกรรมไม่สำเร็จ', 'error');

    toast(data?.message || `เพิ่ม "${payload.name}" แล้ว`);
    ['oad-ev-name', 'oad-ev-date', 'oad-ev-due', 'oad-ev-loc'].forEach(id => {
        const el = pick(id); if (el) el.value = '';
    });
    renderEventsTab();
}

window.__oadCloseEvent = async (eventId, pending) => {
    let note = null;

    if (pending > 0) {
        const { value, isConfirmed } = await Swal.fire({
            title: `ยังมีของค้าง ${pending} รายการ`,
            text: 'ถ้าจะปิดงานตอนนี้ ต้องระบุเหตุผลไว้เป็นหลักฐาน',
            input: 'text', inputPlaceholder: 'เช่น ตามเก็บภายหลัง / ของหาย แจ้งแล้ว',
            showCancelButton: true, confirmButtonText: 'ปิดงาน', cancelButtonText: 'ยกเลิก',
            inputValidator: v => (!v || !v.trim()) ? 'ต้องระบุเหตุผล' : undefined
        });
        if (!isConfirmed) return;
        note = (value || '').trim();
    } else {
        const { isConfirmed } = await Swal.fire({
            title: 'ปิดงานนี้?', text: 'ของคืนครบแล้ว ปิดงานได้เลย',
            icon: 'question', showCancelButton: true,
            confirmButtonText: 'ปิดงาน', cancelButtonText: 'ยกเลิก'
        });
        if (!isConfirmed) return;
    }

    const { data, error } = await eventsApi.close(eventId, note);
    if (error) return toast(error.message || 'ปิดงานไม่สำเร็จ', 'error');
    toast(`ปิดงานแล้ว${data?.pending_when_closed ? ` (ค้าง ${data.pending_when_closed} รายการ)` : ''}`);
    renderEventsTab();
};

window.__oadEventDetail = async (eventId) => {
    Swal.fire({ title: 'กำลังโหลด...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    const [liveRes, uniRes] = await Promise.all([
        api.getActiveBorrows(),
        uniformApi.getOutstanding(eventId)
    ]);

    const insts = (liveRes.data || []).filter(r => r.event_id === eventId);
    const unis  = uniRes.data || [];

    const section = (title, rows, render) => rows.length
        ? `<div style="margin-bottom:1rem;">
             <strong style="font-size:.9rem;">${title} (${rows.length})</strong>
             <div style="margin-top:.4rem;">${rows.map(render).join('')}</div>
           </div>`
        : `<div style="margin-bottom:1rem;font-size:.85rem;opacity:.7;">${title}: คืนครบแล้ว ✅</div>`;

    Swal.fire({
        title: '🔍 ของที่ยังไม่คืน',
        width: 620,
        html: `<div style="text-align:left;font-size:.88rem;">
            ${section('🎺 เครื่องดนตรี', insts, r => `
                <div style="padding:.4rem .6rem;border-bottom:1px solid rgba(128,128,128,.2);">
                    ${escapeHtml(r.student_name || '—')} — ${escapeHtml(r.instrument_name || '—')}
                    ${r.is_overdue ? ' <span style="color:#ef4444;">เลยกำหนด</span>' : ''}
                </div>`)}
            ${section('👔 ชุด', unis, r => `
                <div style="padding:.4rem .6rem;border-bottom:1px solid rgba(128,128,128,.2);">
                    ชุด #${r.kit_no} — ${escapeHtml(r.student_name || '—')}
                    <span style="opacity:.75;">${r.icon || ''} ${escapeHtml(r.part_type || '')} (${escapeHtml(r.part_code || '')})</span>
                </div>`)}
        </div>`,
        confirmButtonText: 'ปิด'
    });
};


// ═══════════════════════════════════════════════════════════════════════════
// 👔 UNIFORMS TAB — จัดการถุงชุด เจ้าของ ไซส์ และอุปกรณ์ในชุด
// ═══════════════════════════════════════════════════════════════════════════

const _uni = { setTypes: [], kits: [], partTypes: [], setTypeId: null, selected: new Set(), stock: new Map() };

// อัปเดตป้ายจำนวนที่เลือกบนปุ่มพิมพ์บัตร
function _syncKitSelectionUI(visibleIds) {
    const btn = document.getElementById('oad-uni-card');
    const n = _uni.selected.size;
    if (btn) btn.textContent = n ? `🪪 พิมพ์บัตร (${n} ใบ)` : '🪪 พิมพ์บัตรใส่ถุงสูท';
    const all = document.getElementById('uni-check-all');
    if (all && visibleIds) {
        all.checked = visibleIds.length > 0 && visibleIds.every(id => _uni.selected.has(id));
        all.indeterminate = !all.checked && visibleIds.some(id => _uni.selected.has(id));
    }
}

async function renderUniformsTab() {
    const sel = document.getElementById('oad-uni-settype');

    if (!_uni.setTypes.length) {
        const { data } = await uniformApi.setTypes();
        _uni.setTypes = data || [];
        if (sel) {
            sel.innerHTML = _uni.setTypes
                .map(s => `<option value="${s.id}">${s.icon || ''} ${escapeHtml(s.name_th)}</option>`).join('');
        }
        _uni.setTypeId = _uni.setTypes[0]?.id ?? null;
        if (sel && _uni.setTypeId) sel.value = String(_uni.setTypeId);
    }

    const ss = document.getElementById('oad-uni-selfselect');
    if (ss && !ss.dataset.wired) {
        const { data: on } = await uniformApi.getSelfSelect();
        ss.checked = on !== false;
        ss.dataset.wired = '1';
        ss.addEventListener('change', async e => {
            const { error } = await uniformApi.setSelfSelect(e.target.checked);
            if (error) { e.target.checked = !e.target.checked; return toast(error.message, 'error'); }
            toast(e.target.checked ? 'เปิดให้นักเรียนเลือกชุดเองแล้ว' : 'ปิดการเลือกชุดเองแล้ว');
        });
    }

    // ต้องรอทั้ง _renderKitTable (ให้ _uni.kits มีข้อมูล) และ _renderUniformReport
    // (ให้ _uni.stock มีข้อมูล) ก่อน ตารางกรอกไซส์ถึงจะแสดง "เหลือกี่ตัว" ได้
    await Promise.all([_renderKitTable(), _renderPartTypeTable(), _renderUniformReport()]);
    renderSizeGrid();
}

async function _renderKitTable() {
    const wrap = document.getElementById('oad-uni-kits');
    const sum  = document.getElementById('oad-uni-summary');
    if (!wrap) return;
    wrap.innerHTML = '<div class="oad-skel" style="height:100px;"></div>';

    const { data, error } = await uniformApi.adminListKits(_uni.setTypeId);
    if (error) { wrap.innerHTML = `<div class="oad-empty">${escapeHtml(error.message)}</div>`; return; }

    _uni.kits = data || [];
    if (!_uni.kits.length) {
        wrap.innerHTML = '<div class="oad-empty"><span class="oad-empty-icon">👔</span>ยังไม่มีถุงชุดของประเภทนี้ — กด "เพิ่มถุงชุด"</div>';
        if (sum) sum.textContent = '';
        return;
    }

    const INACTIVE = ['graduated', 'resigned', 'deactivated'];
    const isInactive = k => k.owner_id && INACTIVE.includes(k.owner_group);

    const owned    = _uni.kits.filter(k => k.owner_id).length;
    const free     = _uni.kits.length - owned;
    const sized    = _uni.kits.filter(k => k.parts_total > 0 && k.parts_sized === k.parts_total).length;
    const orphaned = _uni.kits.filter(isInactive).length;

    if (sum) {
        sum.innerHTML = `ทั้งหมด <strong>${_uni.kits.length}</strong> ถุง ·
            🟢 ว่าง <strong>${free}</strong> ·
            👤 มีเจ้าของ <strong>${owned}</strong> ·
            📏 ไซส์ครบ <strong>${sized}</strong>
            ${orphaned ? ` · <span style="color:#ef4444;font-weight:700;">⚠️ เจ้าของจบ/ออกแล้ว ${orphaned} ชุด</span>` : ''}`;
    }

    // ตัวกรอง — ทำฝั่ง client เพราะข้อมูลโหลดมาครบแล้ว ไม่ต้องยิงซ้ำ
    const f = document.getElementById('oad-uni-filter')?.value || 'all';
    const rows = _uni.kits.filter(k =>
        f === 'free'     ? !k.owner_id :
        f === 'owned'    ? !!k.owner_id :
        f === 'inactive' ? isInactive(k) :
        f === 'nosize'   ? (k.parts_total === 0 || k.parts_sized < k.parts_total) : true);

    if (!rows.length) {
        wrap.innerHTML = '<div class="oad-empty"><span class="oad-empty-icon">🔍</span>ไม่มีถุงที่ตรงกับตัวกรองนี้</div>';
        return;
    }

    wrap.innerHTML = `
        <table class="oad-table">
            <thead><tr>
                <th style="width:34px;text-align:center;">
                    <input type="checkbox" id="uni-check-all" title="เลือก/ยกเลิกทั้งหมดที่แสดงอยู่"
                           style="width:18px;height:18px;cursor:pointer;"></th>
                <th>เบอร์ชุด</th><th>เจ้าของ</th><th>ชั้น</th><th>เครื่องดนตรี</th>
                <th>ไซส์</th><th>จัดการ</th>
            </tr></thead>
            <tbody>
            ${rows.map(k => {
                const parts = k.parts || [];
                const sizeTxt = parts.length
                    ? parts.map(p => `${p.icon || ''}${p.size ? escapeHtml(p.size) : '—'}`).join(' ')
                    : '<span style="opacity:.5;">ไม่มีชิ้น</span>';
                const ownerCell = k.owner_name
                    ? escapeHtml(k.owner_name)
                      + (k.owner_nickname ? ` <span style="opacity:.6;">(${escapeHtml(k.owner_nickname)})</span>` : '')
                      + (isInactive(k)
                          ? `<div><span class="oad-badge oad-badge-red">⚠️ ${escapeHtml(translateGroup(k.owner_group))}</span></div>`
                          : '')
                    : '<span class="oad-badge oad-badge-green">🟢 ว่าง</span>';
                const locked = k.is_selectable === false;
                return `<tr${isInactive(k) ? ' style="background:rgba(239,68,68,.06);"' : ''}>
                    <td style="text-align:center;">
                        <input type="checkbox" class="uni-pick" value="${k.kit_id}"
                               ${_uni.selected.has(k.kit_id) ? 'checked' : ''}
                               style="width:18px;height:18px;cursor:pointer;"></td>
                    <td><strong style="font-size:1.05rem;">#${k.kit_no}</strong>
                        ${locked ? ' <span class="oad-badge oad-badge-gray">🔒 ล็อก</span>' : ''}
                        <div style="font-size:.7rem;opacity:.6;">${escapeHtml(k.qr_code || '')}</div></td>
                    <td>${ownerCell}</td>
                    <td class="nowrap">${escapeHtml(k.owner_class || '—')}</td>
                    <td class="nowrap">${escapeHtml(k.owner_instrument || '—')}</td>
                    <td style="font-size:.8rem;">${sizeTxt}
                        <div style="font-size:.7rem;opacity:.6;">
                            ${k.parts_sized}/${k.parts_total} ชิ้น
                            ${k.parts_issue ? ` · <span style="color:#f59e0b;font-weight:700;">🔧 ${k.parts_issue}</span>` : ''}
                        </div></td>
                    <td><div class="actions">
                        <button class="oad-btn" onclick="window.__oadAssignKit(${k.kit_id})">${k.owner_id ? '🔁 ย้าย' : '👤 กำหนด'}</button>
                        ${k.owner_id ? `<button class="oad-btn oad-btn-red" onclick="window.__oadReleaseKit(${k.kit_id}, ${k.kit_no})">🚪 ปลด</button>` : ''}
                        <button class="oad-btn" onclick="window.__oadKitSizes(${k.kit_id})">📏 ไซส์</button>
                        <button class="oad-btn" onclick="window.__oadLockKit(${k.kit_id}, ${k.kit_no}, ${!locked})">${locked ? '🔓' : '🔒'}</button>
                        <button class="oad-btn" onclick="window.__oadKitHistory(${k.kit_id}, ${k.kit_no})">📜</button>
                    </div></td>
                </tr>`;
            }).join('')}
            </tbody>
        </table>`;

    // ── ติ๊กเลือกถุงสำหรับพิมพ์บัตรเฉพาะที่ต้องการ
    const visibleIds = rows.map(r => r.kit_id);
    wrap.querySelectorAll('.uni-pick').forEach(cb => {
        cb.addEventListener('change', e => {
            const id = Number(e.target.value);
            if (e.target.checked) _uni.selected.add(id); else _uni.selected.delete(id);
            _syncKitSelectionUI(visibleIds);
        });
    });
    document.getElementById('uni-check-all')?.addEventListener('change', e => {
        // เลือก/ยกเลิกเฉพาะแถวที่แสดงอยู่ตามตัวกรอง ไม่ไปยุ่งกับถุงอื่น
        visibleIds.forEach(id => e.target.checked ? _uni.selected.add(id) : _uni.selected.delete(id));
        wrap.querySelectorAll('.uni-pick').forEach(cb => { cb.checked = e.target.checked; });
        _syncKitSelectionUI(visibleIds);
    });
    _syncKitSelectionUI(visibleIds);
}

async function _renderPartTypeTable() {
    const wrap = document.getElementById('oad-uni-parttypes');
    if (!wrap) return;

    const { data, error } = await uniformApi.adminListPartTypes();
    if (error) { wrap.innerHTML = `<div class="oad-empty">${escapeHtml(error.message)}</div>`; return; }
    _uni.partTypes = data || [];

    wrap.innerHTML = `
        <table class="oad-table">
            <thead><tr><th>ประเภทชุด</th><th>อุปกรณ์</th><th>รหัสนำหน้า</th>
                       <th>สต๊อกรายไซส์ (มีกี่ตัว)</th><th>จำนวนชิ้น</th><th>บังคับติ๊ก</th><th>จัดการ</th></tr></thead>
            <tbody>
            ${_uni.partTypes.map(p => {
                const nameEsc = escapeHtml(p.name_th).replace(/'/g, "\\'");
                const opts = p.size_options || [];
                return `<tr>
                <td class="nowrap">${escapeHtml(p.set_name || '—')}</td>
                <td>${p.icon || ''} <strong>${escapeHtml(p.name_th)}</strong></td>
                <td><code>${escapeHtml(p.prefix)}-001</code></td>
                <td style="font-size:.82rem;max-width:280px;">
                    ${(p.size_stock || []).length
                        ? (p.size_stock || []).map(r =>
                            `<span style="display:inline-block;margin:0 .3rem .2rem 0;padding:.1rem .35rem;
                                          border-radius:5px;background:var(--oad-surface2);white-space:nowrap;">
                               ${escapeHtml(r.size)} <strong>${r.qty ?? '∞'}</strong>
                             </span>`).join('')
                        : '<span style="color:#f59e0b;">ยังไม่กำหนด</span>'}
                    ${p.stock_total != null
                        ? `<div style="opacity:.65;font-size:.75rem;margin-top:.15rem;">รวม ${p.stock_total} ตัว</div>`
                        : ''}
                </td>
                <td>${p.part_count}</td>
                <td>${p.is_required
                    ? '<span class="oad-badge oad-badge-green">บังคับ</span>'
                    : '<span class="oad-badge oad-badge-gray">ปลดแล้ว</span>'}</td>
                <td><div class="actions">
                    <button class="oad-btn" onclick='window.__oadEditSizeStock(${p.id}, "${nameEsc}", ${JSON.stringify(p.size_stock || [])})'>📦 สต๊อก</button>
                    ${p.is_required
                        ? `<button class="oad-btn oad-btn-red" onclick="window.__oadRetirePart(${p.id}, '${nameEsc}')">ปลดออก</button>`
                        : ''}
                </div></td>
            </tr>`; }).join('')}
            </tbody>
        </table>`;
}

// ── กำหนดเจ้าของชุด ────────────────────────────────────────────────────────
window.__oadAssignKit = async (kitId) => {
    const kit = _uni.kits.find(k => k.kit_id === kitId);
    const candidates = (state.users || [])
        .filter(u => u.role !== 'admin' && u.student_group !== 'deactivated')
        .sort((a, b) => (a.class_level || '').localeCompare(b.class_level || ''));

    const { value, isConfirmed } = await Swal.fire({
        title: `👤 เจ้าของชุด #${kit?.kit_no}`,
        html: `<select id="assign-stu" class="swal2-input" style="width:100%;margin:0;">
                 <option value="">— ไม่มีเจ้าของ —</option>
                 ${candidates.map(u => `<option value="${u.id}"${kit?.owner_id === u.id ? ' selected' : ''}>
                    ${escapeHtml((u.prefix || '') + u.first_name + ' ' + u.last_name)}
                    ${u.class_level ? ' · ' + escapeHtml(u.class_level) : ''}
                    ${u.main_instrument ? ' · ' + escapeHtml(u.main_instrument) : ''}
                 </option>`).join('')}
               </select>`,
        showCancelButton: true, confirmButtonText: 'บันทึก', cancelButtonText: 'ยกเลิก',
        preConfirm: () => document.getElementById('assign-stu').value || null
    });
    if (!isConfirmed) return;

    // ใช้ transfer เสมอ — จัดการเคสคนใหม่ถือชุดอื่นอยู่ / คนเดิมต้องถูกปลด ให้ในตัว
    const { data, error } = value
        ? await uniformApi.transferKit(kitId, value)
        : await uniformApi.releaseKit(kitId, 'ปลดโดยครู');
    if (error) return toast(error.message, 'error');
    toast(data?.message || 'บันทึกเจ้าของชุดแล้ว');
    _renderKitTable();
};

// ── ปลดเจ้าของ (คนเดิมออก / เปลี่ยนชุด) ────────────────────────────────────
window.__oadReleaseKit = async (kitId, kitNo) => {
    const { value, isConfirmed } = await Swal.fire({
        title: `🚪 ปลดเจ้าของชุด #${kitNo}?`,
        input: 'text', inputPlaceholder: 'เหตุผล เช่น ลาออก / เปลี่ยนไซส์',
        text: 'ชุดจะกลับมาเป็นชุดว่าง ให้คนอื่นเลือกได้ ประวัติเจ้าของเดิมถูกบันทึกไว้',
        showCancelButton: true, confirmButtonText: 'ปลด', cancelButtonText: 'ยกเลิก'
    });
    if (!isConfirmed) return;

    const { data, error } = await uniformApi.releaseKit(kitId, (value || '').trim() || null);
    if (error) return toast(error.message, 'error');
    toast(data?.message || 'ปลดแล้ว');
    _renderKitTable();
};

// ── ประวัติเจ้าของ ─────────────────────────────────────────────────────────
window.__oadKitHistory = async (kitId, kitNo) => {
    const { data, error } = await uniformApi.kitHistory(kitId);
    if (error) return toast(error.message, 'error');

    const rows = data || [];
    Swal.fire({
        title: `📜 ประวัติเจ้าของชุด #${kitNo}`,
        width: 520,
        html: rows.length
            ? `<div style="text-align:left;font-size:.85rem;">
                 ${rows.map(h => `<div style="padding:.5rem .3rem;border-bottom:1px solid rgba(128,128,128,.2);">
                     <strong>${escapeHtml(h.student_name || 'ไม่ทราบชื่อ')}</strong>
                     <div style="opacity:.7;font-size:.78rem;">
                       ${h.assigned_at ? fmtDateShort(h.assigned_at) : '—'} → ${fmtDateShort(h.released_at)}
                       ${h.reason ? ' · ' + escapeHtml(h.reason) : ''}
                     </div>
                   </div>`).join('')}
               </div>`
            : '<div style="opacity:.7;">ยังไม่เคยเปลี่ยนเจ้าของ</div>',
        confirmButtonText: 'ปิด'
    });
};

// ── กรอกไซส์รายถุง ─────────────────────────────────────────────────────────
window.__oadKitSizes = async (kitId) => {
    const kit = _uni.kits.find(k => k.kit_id === kitId);
    const parts = kit?.parts || [];
    if (!parts.length) return toast('ถุงนี้ยังไม่มีชิ้นส่วน', 'error');

    const { value, isConfirmed } = await Swal.fire({
        title: `📏 ไซส์ชุด #${kit.kit_no}`,
        width: 460,
        html: `<div style="text-align:left;font-size:.9rem;">
                 ${parts.map(p => `
                   <div style="display:flex;align-items:center;gap:.6rem;margin-bottom:.5rem;">
                     <span style="flex:1;">${p.icon || ''} ${escapeHtml(p.type_name)}
                       <span style="opacity:.6;font-size:.78rem;">${escapeHtml(p.part_code)}</span></span>
                     ${_sizeField(p, 120)}
                   </div>`).join('')}
               </div>`,
        showCancelButton: true, confirmButtonText: 'บันทึก', cancelButtonText: 'ยกเลิก',
        preConfirm: () => [...document.querySelectorAll('.size-in')].map(i => ({
            part_id: Number(i.dataset.part), size: i.value.trim()
        }))
    });
    if (!isConfirmed) return;

    const { error } = await uniformApi.setPartSizes(value);
    if (error) return toast(error.message, 'error');
    toast('บันทึกไซส์แล้ว');
    _renderKitTable();
    renderSizeGrid();
};

// ── เพิ่มถุงชุด / เพิ่ม-ลดอุปกรณ์ ────────────────────────────────────────────
window.__oadNewKits = async () => {
    const st = _uni.setTypes.find(s => s.id === _uni.setTypeId);
    const { value, isConfirmed } = await Swal.fire({
        title: `➕ เพิ่มถุงชุด — ${st?.name_th || ''}`,
        input: 'number', inputLabel: 'เพิ่มกี่ถุง?', inputValue: 20,
        inputAttributes: { min: 1, max: 200 },
        text: 'เลขถุงจะต่อจากเลขสูงสุดที่มีอยู่ และระบบจะสร้างชิ้นส่วนให้อัตโนมัติ',
        showCancelButton: true, confirmButtonText: 'สร้าง', cancelButtonText: 'ยกเลิก'
    });
    if (!isConfirmed) return;

    const { data, error } = await uniformApi.createKits(_uni.setTypeId, Number(value));
    if (error) return toast(error.message, 'error');
    toast(`สร้างถุง #${data.from}–#${data.to} แล้ว`);
    _renderKitTable();
};

window.__oadRetirePart = async (partTypeId, name) => {
    const { isConfirmed } = await Swal.fire({
        title: `ปลด "${name}" ออกจากชุด?`,
        text: 'ประวัติการเบิกเดิมยังอยู่ครบ แต่จะไม่ต้องติ๊กชิ้นนี้อีกต่อไป',
        icon: 'warning', showCancelButton: true,
        confirmButtonText: 'ปลดออก', cancelButtonText: 'ยกเลิก'
    });
    if (!isConfirmed) return;

    const { data, error } = await uniformApi.retirePartType(partTypeId);
    if (error) return toast(error.message, 'error');
    toast(data?.message || 'ปลดออกแล้ว');
    renderUniformsTab();
};

window.__oadAddPartType = async () => {
    const { value, isConfirmed } = await Swal.fire({
        title: '➕ เพิ่มอุปกรณ์ในชุด',
        width: 460,
        html: `<div style="text-align:left;font-size:.9rem;">
                 <label style="font-weight:700;">ประเภทชุด</label>
                 <select id="pt-set" class="swal2-input" style="width:100%;margin:.2rem 0 .6rem;">
                   ${_uni.setTypes.map(s => `<option value="${s.id}"${s.id === _uni.setTypeId ? ' selected' : ''}>${s.icon || ''} ${escapeHtml(s.name_th)}</option>`).join('')}
                 </select>
                 <label style="font-weight:700;">ชื่ออุปกรณ์</label>
                 <input id="pt-name" class="swal2-input" style="width:100%;margin:.2rem 0 .6rem;" placeholder="เช่น ถุงมือ">
                 <label style="font-weight:700;">อีโมจิ</label>
                 <input id="pt-icon" class="swal2-input" style="width:100%;margin:.2rem 0 .6rem;" placeholder="🧤">
                 <label style="font-weight:700;">รหัสนำหน้า (ตัวอักษร ไม่ซ้ำของเดิม)</label>
                 <input id="pt-prefix" class="swal2-input" style="width:100%;margin:.2rem 0 .3rem;" placeholder="G" maxlength="3">
                 <p style="margin:0 0 .6rem;font-size:.75rem;opacity:.7;">ชิ้นจะได้รหัสเช่น G-001, G-002 …</p>
                 <label style="font-weight:700;">ตัวเลือกไซส์ (คั่นด้วยจุลภาค)</label>
                 <input id="pt-sizes" class="swal2-input" style="width:100%;margin:.2rem 0 .3rem;" placeholder="S,M,L,XL">
                 <p style="margin:0;font-size:.75rem;opacity:.7;">เว้นว่าง = ให้พิมพ์ไซส์เองอิสระ · แก้ทีหลังได้</p>
               </div>`,
        showCancelButton: true, confirmButtonText: 'เพิ่ม', cancelButtonText: 'ยกเลิก',
        preConfirm: () => {
            const name   = document.getElementById('pt-name').value.trim();
            const prefix = document.getElementById('pt-prefix').value.trim().toUpperCase();
            if (!name || !prefix) { Swal.showValidationMessage('กรอกชื่อและรหัสนำหน้า'); return false; }
            if (!/^[A-Z]{1,3}$/.test(prefix)) { Swal.showValidationMessage('รหัสนำหน้าต้องเป็นตัวอักษร A-Z 1-3 ตัว'); return false; }
            return {
                setTypeId: Number(document.getElementById('pt-set').value),
                nameTh: name, prefix,
                icon: document.getElementById('pt-icon').value.trim() || null,
                sizeOptions: (document.getElementById('pt-sizes').value || '')
                    .split(',').map(s => s.trim()).filter(Boolean),
                code: prefix.toLowerCase() + '_' + Date.now().toString(36)
            };
        }
    });
    if (!isConfirmed) return;

    const { data, error } = await uniformApi.addPartType(value);
    if (error) return toast(error.message, 'error');
    toast(data?.message || 'เพิ่มอุปกรณ์แล้ว');
    renderUniformsTab();
};

// ═══════════════════════════════════════════════════════════════════════════
// 🪪 บัตรประจำชุด — ขนาดเครดิตการ์ด 85.6 × 54 มม. ใส่ในซองใสของถุงสูทได้
//    ด้านหน้า: QR + เบอร์ชุด + ชื่อเจ้าของ + ชั้น + เครื่องดนตรี + ไซส์รายชิ้น
// ═══════════════════════════════════════════════════════════════════════════
window.__oadPrintKitCards = async () => {
    if (typeof QRCode === 'undefined') return toast('ไลบรารี QRCode ยังไม่ถูกโหลด', 'error');
    if (!_uni.kits.length) return toast('ยังไม่มีถุงชุด', 'error');

    // เลือกไว้กี่ใบก็พิมพ์เท่านั้น — ไม่ได้ติ๊กเลยค่อยถามว่าจะพิมพ์ทั้งหมดไหม
    let targets = _uni.kits.filter(k => _uni.selected.has(k.kit_id));
    if (!targets.length) {
        const { isConfirmed } = await Swal.fire({
            title: 'ยังไม่ได้เลือกถุง',
            text: `พิมพ์บัตรทั้งหมด ${_uni.kits.length} ใบเลยไหม? (ติ๊กช่องหน้าแถวเพื่อเลือกเฉพาะที่ต้องการ)`,
            icon: 'question', showCancelButton: true,
            confirmButtonText: `พิมพ์ทั้งหมด ${_uni.kits.length} ใบ`, cancelButtonText: 'ยกเลิก'
        });
        if (!isConfirmed) return;
        targets = _uni.kits;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) return toast('เบราว์เซอร์บล็อกป๊อปอัป — อนุญาตก่อนแล้วลองใหม่', 'error');
    printWindow.document.write('<div style="font-family:sans-serif;text-align:center;margin-top:50px;"><h2>⏳ กำลังสร้างบัตร...</h2></div>');

    Swal.fire({ title: 'กำลังเตรียมบัตร...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        const cards = await Promise.all(targets.map(k => new Promise(resolve => {
            const div = document.createElement('div');
            new QRCode(div, {
                text: k.qr_code || `KIT-${String(k.kit_no).padStart(3, '0')}`,
                width: 200, height: 200,
                colorDark: '#000000', colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.H
            });
            setTimeout(() => {
                const c = div.querySelector('canvas');
                resolve({ ...k, base64: c ? c.toDataURL('image/png') : '' });
            }, 50);
        })));

        const setName = _uni.setTypes.find(s => s.id === _uni.setTypeId)?.name_th || '';

        const cardHtml = c => {
            const parts = c.parts || [];
            return `<div class="card">
              <div class="left">
                <img src="${c.base64}" alt="">
                <div class="code">${escapeHtml(c.qr_code || '')}</div>
              </div>
              <div class="right">
                <div class="kitno">ชุด #${c.kit_no}</div>
                <div class="name">${escapeHtml(c.owner_name || 'ยังไม่มีเจ้าของ')}</div>
                <div class="meta">
                  ${c.owner_nickname ? `(${escapeHtml(c.owner_nickname)}) ` : ''}
                  ${c.owner_class ? escapeHtml(c.owner_class) : ''}
                </div>
                <div class="inst">${escapeHtml(c.owner_instrument || setName)}</div>
                <table class="sizes">
                  ${parts.map(p => `<tr>
                    <td class="pn">${p.icon || ''} ${escapeHtml(p.type_name)}</td>
                    <td class="pc">${escapeHtml(p.part_code)}</td>
                    <td class="ps">${p.size ? escapeHtml(p.size) : '—'}</td>
                  </tr>`).join('')}
                </table>
              </div>
            </div>`;
        };

        const html = `<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8">
<title>บัตรประจำชุด_${setName}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap');
* { box-sizing: border-box; }
body { font-family:'Sarabun',sans-serif; background:#f4f4f5; margin:0; padding:12mm 8mm; color:#000; }
.header { text-align:center; margin-bottom:8mm; }
.sheet { display:flex; flex-wrap:wrap; gap:4mm; justify-content:flex-start; }

/* ขนาดบัตรเครดิต ISO/IEC 7810 ID-1 = 85.6 x 54 mm */
.card {
  width:85.6mm; height:54mm;
  border:0.3mm solid #333; border-radius:3mm;
  background:#fff; padding:3mm;
  display:flex; gap:3mm; overflow:hidden;
  break-inside:avoid; page-break-inside:avoid;
}
.left { width:26mm; flex-shrink:0; text-align:center; }
.left img { width:26mm; height:26mm; display:block; }
.code { font-size:7pt; letter-spacing:.3pt; margin-top:1mm; color:#333; }
.right { flex:1; min-width:0; display:flex; flex-direction:column; }
.kitno { font-size:15pt; font-weight:700; line-height:1.05; }
.name  { font-size:10pt; font-weight:600; line-height:1.15; margin-top:.6mm;
         white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.meta  { font-size:7.5pt; color:#555; line-height:1.1; }
.inst  { font-size:8pt; color:#111; font-weight:600; margin:.6mm 0 1mm; }
.sizes { width:100%; border-collapse:collapse; font-size:7pt; margin-top:auto; }
.sizes td { border-top:0.15mm solid #ddd; padding:.35mm 0; line-height:1.25; }
.pn { white-space:nowrap; }
.pc { color:#777; text-align:center; font-size:6.5pt; }
.ps { text-align:right; font-weight:700; width:11mm; }

@media print {
  body { background:#fff; padding:0; }
  .no-print { display:none !important; }
  .sheet { gap:0; }
  .card { border:0.2mm dashed #999; border-radius:0; margin:0; }
  @page { size:A4; margin:8mm; }
}
</style></head><body>
<div class="header no-print">
  <h2>บัตรประจำชุด — ${escapeHtml(setName)} (${cards.length} ใบ)</h2>
  <p style="font-size:14px;color:#555;margin:.3rem 0 1rem;">
    ขนาดเท่าบัตรเครดิต (85.6 × 54 มม.) — ตัดแล้วใส่ซองใสของถุงสูทได้เลย<br>
    พิมพ์บนกระดาษ A4 แนวตั้ง ได้ 8 ใบ/แผ่น · ตั้งค่าการพิมพ์เป็น <strong>ขนาดจริง 100%</strong> (ห้าม Fit to page)
  </p>
  <button onclick="window.print()" style="padding:12px 24px;font-size:16px;cursor:pointer;background:#3b82f6;color:#fff;border:none;border-radius:8px;font-family:'Sarabun',sans-serif;font-weight:600;">🖨️ สั่งพิมพ์ / บันทึกเป็น PDF</button>
</div>
<div class="sheet">${cards.map(cardHtml).join('')}</div>
</body></html>`;

        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
        Swal.close();
        toast(`สร้างบัตร ${cards.length} ใบแล้ว`);
    } catch (e) {
        Swal.close();
        toast('สร้างบัตรไม่สำเร็จ: ' + (e?.message || e), 'error');
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// 📊 รายงานไซส์และสภาพชุด — ครูดูได้ว่ามีไซส์ไหนกี่ชุด เสียหายกี่ชิ้น
// ═══════════════════════════════════════════════════════════════════════════
const _COND_TH = { A: 'สภาพดี', B: 'มีร่องรอย', C: 'ชำรุดเล็กน้อย', repair: 'ต้องซ่อม', lost: 'สูญหาย' };

async function _renderUniformReport() {
    const box = document.getElementById('oad-uni-report');
    if (!box) return;
    box.innerHTML = '<div class="oad-skel" style="height:80px;"></div>';

    const [repRes, dmgRes, stkRes] = await Promise.all([
        uniformApi.sizeReport(_uni.setTypeId),
        uniformApi.damagedList(_uni.setTypeId),
        uniformApi.sizeStock(_uni.setTypeId)
    ]);
    // เก็บไว้ให้ตารางกรอกไซส์ใช้แสดง "เหลือกี่ตัว" ใน dropdown
    _uni.stock = new Map((stkRes.data || []).map(r => [`${r.part_type_id}|${r.size}`, r]));

    if (repRes.error) { box.innerHTML = `<div class="oad-empty">${escapeHtml(repRes.error.message)}</div>`; return; }

    const rows = repRes.data || [];
    const dmg  = dmgRes.data || [];

    if (!rows.length) { box.innerHTML = '<div class="oad-empty">ยังไม่มีข้อมูลชิ้นส่วน</div>'; return; }

    // จัดกลุ่มตามประเภทชิ้น → ไซส์
    const byType = new Map();
    for (const r of rows) {
        if (!byType.has(r.type_id)) byType.set(r.type_id, { name: r.type_name, icon: r.icon, sizes: [] });
        byType.get(r.type_id).sizes.push(r);
    }

    const totalDamaged = rows.reduce((s, r) => s + Number(r.damaged_n), 0);
    const totalLost    = rows.reduce((s, r) => s + Number(r.lost_n), 0);
    const totalUnsized = rows.filter(r => r.size === '(ยังไม่ระบุ)').reduce((s, r) => s + Number(r.n), 0);

    box.innerHTML = `
        <div style="display:flex; gap:1.2rem; flex-wrap:wrap; margin-bottom:1rem; font-size:.9rem;">
            <span>🧾 ทั้งหมด <strong>${rows.reduce((s, r) => s + Number(r.n), 0)}</strong> ชิ้น</span>
            <span style="color:#f59e0b;">🔧 ชำรุด/ต้องซ่อม <strong>${totalDamaged}</strong></span>
            <span style="color:#ef4444;">❌ สูญหาย <strong>${totalLost}</strong></span>
            <span style="color:${totalUnsized ? '#f59e0b' : 'inherit'};">📏 ยังไม่ระบุไซส์ <strong>${totalUnsized}</strong></span>
        </div>

        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(230px,1fr)); gap:1rem;">
        ${[...byType.values()].map(t => `
            <div style="border:1px solid var(--oad-border); border-radius:10px; padding:.8rem;">
                <div style="font-weight:700; margin-bottom:.5rem;">${t.icon || ''} ${escapeHtml(t.name)}</div>
                <table style="width:100%; font-size:.83rem; border-collapse:collapse;">
                    <thead><tr style="opacity:.6; font-size:.75rem;">
                        <th style="text-align:left;">ไซส์</th><th>มี</th><th>ใช้</th><th>เหลือ</th><th>ซ่อม</th><th>หาย</th>
                    </tr></thead>
                    <tbody>
                    ${t.sizes.map(s => {
                        const st = _uni.stock?.get(`${s.type_id}|${s.size}`);
                        const qty = st?.qty;
                        const rem = st?.remaining;
                        return `<tr${s.size === '(ยังไม่ระบุ)' ? ' style="color:#f59e0b;"' : ''}>
                        <td style="padding:.2rem 0;"><strong>${escapeHtml(s.size)}</strong></td>
                        <td style="text-align:center;">${qty ?? '<span style="opacity:.4;">—</span>'}</td>
                        <td style="text-align:center;">${s.n}</td>
                        <td style="text-align:center;font-weight:700;color:${
                            rem == null ? 'inherit' : rem === 0 ? '#ef4444' : rem < 0 ? '#ef4444' : '#10b981'};">
                            ${rem ?? '<span style="opacity:.4;font-weight:400;">—</span>'}</td>
                        <td style="text-align:center;color:${Number(s.damaged_n) ? '#f59e0b' : 'inherit'};">${s.damaged_n}</td>
                        <td style="text-align:center;color:${Number(s.lost_n) ? '#ef4444' : 'inherit'};">${s.lost_n}</td>
                    </tr>`; }).join('')}
                    </tbody>
                </table>
            </div>`).join('')}
        </div>

        ${dmg.length ? `
        <div style="margin-top:1.2rem;">
            <div style="font-weight:700; margin-bottom:.5rem;">🔧 ชิ้นที่ต้องจัดการ (${dmg.length})</div>
            <table class="oad-table">
                <thead><tr><th>ชิ้น</th><th>รหัส</th><th>ไซส์</th><th>สภาพ</th><th>ถุง</th><th>เจ้าของ</th><th>แก้สภาพ</th></tr></thead>
                <tbody>
                ${dmg.map(d => `<tr>
                    <td class="nowrap">${d.icon || ''} ${escapeHtml(d.type_name)}</td>
                    <td><code>${escapeHtml(d.part_code)}</code></td>
                    <td>${escapeHtml(d.size || '—')}</td>
                    <td><span class="oad-badge ${d.condition === 'lost' ? 'oad-badge-red' : 'oad-badge-amber'}">${_COND_TH[d.condition] || d.condition}</span></td>
                    <td>#${d.kit_no}</td>
                    <td>${escapeHtml(d.owner_name || '—')}</td>
                    <td><button class="oad-btn" onclick="window.__oadFixPart(${d.part_id}, '${escapeHtml(d.part_code)}')">แก้</button></td>
                </tr>`).join('')}
                </tbody>
            </table>
        </div>` : '<p style="margin-top:1rem;font-size:.85rem;color:#10b981;">✅ ไม่มีชิ้นที่ชำรุดหรือสูญหาย</p>'}`;
}

window.__oadFixPart = async (partId, code) => {
    const { value, isConfirmed } = await Swal.fire({
        title: `แก้สภาพ ${code}`,
        input: 'select',
        inputOptions: { A: 'A — สภาพดี', B: 'B — มีร่องรอย', C: 'C — ชำรุดเล็กน้อย',
                        repair: 'ต้องซ่อม', lost: 'สูญหาย' },
        inputValue: 'A',
        showCancelButton: true, confirmButtonText: 'บันทึก', cancelButtonText: 'ยกเลิก'
    });
    if (!isConfirmed) return;
    const { error } = await uniformApi.setPartCondition(partId, value);
    if (error) return toast(error.message, 'error');
    toast('อัปเดตสภาพแล้ว');
    _renderUniformReport();
    _renderKitTable();
};

window.__oadLockKit = async (kitId, kitNo, lock) => {
    const { error } = await uniformApi.lockKit(kitId, !lock);
    if (error) return toast(error.message, 'error');
    toast(lock ? `ล็อกชุด #${kitNo} แล้ว` : `ปลดล็อกชุด #${kitNo} แล้ว`);
    _renderKitTable();
};

// ═══════════════════════════════════════════════════════════════════════════
// 👔 ชุดประจำตัวในหน้าจัดการผู้ใช้
//    ข้อมูลดึงจาก uniform_kits แหล่งเดียว (ไม่เก็บซ้ำใน users) จึงตรงกันเสมอ
//    _userKitMap ถูกโหลดพร้อมรายชื่อผู้ใช้ และรีเฟรชทุกครั้งที่เปลี่ยนเจ้าของ
// ═══════════════════════════════════════════════════════════════════════════
let _userKitMap = new Map();

async function loadUserKitMap() {
    const { data, error } = await uniformApi.userKits();
    if (error) { console.warn('[uniform] loadUserKitMap:', error.message); return; }
    _userKitMap = new Map((data || []).map(k => [k.user_id, k]));
}

// สรุปสถานะการเลือกชุดของสมาชิกชุมนุม — คนกลุ่มอื่นไม่นับ เพราะไม่มีชุดประจำตัว
function _renderKitStatusSummary() {
    const el = document.getElementById('oad-kit-status-summary');
    if (!el) return;
    const club = (state.users || []).filter(u => u.student_group === 'club');
    if (!club.length) { el.textContent = ''; return; }
    const has = club.filter(u => _userKitMap.has(u.id)).length;
    const none = club.length - has;
    el.innerHTML = `👔 สมาชิกชุมนุม <strong>${club.length}</strong> คน ·
        ✅ เลือกชุดแล้ว <strong style="color:#10b981;">${has}</strong> ·
        ⬜ ยังไม่เลือก <strong style="color:${none ? '#f59e0b' : 'inherit'};">${none}</strong>`;
}

function _userKitBadge(userId, studentGroup) {
    // คนนอกชุมนุมไม่มีชุดประจำตัว — ไม่ต้องแสดงอะไรเลย
    if (studentGroup !== 'club') return '';
    const k = _userKitMap.get(userId);
    if (!k) return '<div style="margin-top:3px;"><span class="oad-badge oad-badge-gray">⬜ ยังไม่เลือกชุด</span></div>';
    const incomplete = k.parts_sized < k.parts_total;
    return `<div style="margin-top:3px;">
        <span class="oad-badge ${k.has_issue ? 'oad-badge-amber' : 'oad-badge-blue'}"
              title="${k.has_issue ? 'มีชิ้นชำรุด/สูญหาย' : (incomplete ? 'ไซส์ยังไม่ครบ' : 'ชุดปกติ')}">
            ${k.set_icon || '👔'} #${k.kit_no}${k.has_issue ? ' 🔧' : (incomplete ? ' 📏' : '')}
        </span></div>`;
}

window.__oadUserKit = async (userId, fullName) => {
    Swal.fire({ title: 'กำลังโหลด...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    await loadUserKitMap();
    const mine = _userKitMap.get(userId);

    // ถ้ายังไม่มีชุด → ให้เลือกจากชุดที่ว่าง
    if (!mine) {
        const { data: kits, error } = await uniformApi.adminListKits(null);
        if (error) return Swal.fire('ผิดพลาด', error.message, 'error');
        const free = (kits || []).filter(k => !k.owner_id);
        if (!free.length) return Swal.fire('ไม่มีชุดว่าง', 'ชุดถูกใช้หมดแล้ว', 'info');

        const { value, isConfirmed } = await Swal.fire({
            title: `👔 กำหนดชุดให้ ${fullName}`,
            html: `<select id="uk-pick" class="swal2-input" style="width:100%;margin:0;">
                     ${free.map(k => `<option value="${k.kit_id}">
                        ${k.set_icon || ''} ชุด #${k.kit_no}
                        ${k.parts_sized < k.parts_total ? ' · ⚠️ ไซส์ไม่ครบ' : ''}
                        ${k.is_selectable === false ? ' · 🔒 ล็อก' : ''}
                     </option>`).join('')}
                   </select>`,
            showCancelButton: true, confirmButtonText: 'กำหนด', cancelButtonText: 'ยกเลิก',
            preConfirm: () => Number(document.getElementById('uk-pick').value)
        });
        if (!isConfirmed) return;

        const { data, error: tErr } = await uniformApi.transferKit(value, userId, 'กำหนดจากหน้าผู้ใช้');
        if (tErr) return Swal.fire('ไม่สำเร็จ', tErr.message, 'error');
        await loadUserKitMap();
        renderUsersTable();
        return Swal.fire('เรียบร้อย', data?.message || 'กำหนดชุดแล้ว', 'success');
    }

    // มีชุดแล้ว → แสดงรายละเอียด + ปุ่มจัดการ
    const { data: kits } = await uniformApi.adminListKits(null);
    const kit = (kits || []).find(k => k.kit_id === mine.kit_id);
    const parts = kit?.parts || [];

    const result = await Swal.fire({
        title: `${mine.set_icon || '👔'} ชุด #${mine.kit_no}`,
        width: 480,
        html: `<div style="text-align:left;font-size:.88rem;">
                 <p style="margin:0 0 .6rem;opacity:.75;">${escapeHtml(fullName)}</p>
                 <table style="width:100%;border-collapse:collapse;font-size:.85rem;">
                   ${parts.map(p => `<tr>
                     <td style="padding:.28rem 0;border-top:1px solid rgba(128,128,128,.2);">
                       ${p.icon || ''} ${escapeHtml(p.type_name)}</td>
                     <td style="padding:.28rem 0;border-top:1px solid rgba(128,128,128,.2);opacity:.6;font-size:.78rem;">
                       ${escapeHtml(p.part_code)}</td>
                     <td style="padding:.28rem 0;border-top:1px solid rgba(128,128,128,.2);text-align:right;font-weight:700;">
                       ${p.size ? escapeHtml(p.size) : '<span style="color:#f59e0b;font-weight:400;">ยังไม่ระบุ</span>'}</td>
                     <td style="padding:.28rem 0;border-top:1px solid rgba(128,128,128,.2);text-align:right;">
                       ${['C','repair','lost'].includes(p.condition)
                          ? `<span style="color:#ef4444;">${_COND_TH[p.condition]}</span>` : ''}</td>
                   </tr>`).join('')}
                 </table>
               </div>`,
        showCancelButton: true, showDenyButton: true,
        confirmButtonText: '🔁 เปลี่ยนชุด',
        denyButtonText: '🚪 ปลดชุด',
        cancelButtonText: 'ปิด'
    });

    if (result.isDenied) {
        const { data, error } = await uniformApi.releaseKit(mine.kit_id, 'ปลดจากหน้าผู้ใช้');
        if (error) return Swal.fire('ไม่สำเร็จ', error.message, 'error');
        await loadUserKitMap();
        renderUsersTable();
        return Swal.fire('ปลดแล้ว', data?.message || '', 'success');
    }

    if (result.isConfirmed) {
        const free = (kits || []).filter(k => !k.owner_id);
        if (!free.length) return Swal.fire('ไม่มีชุดว่าง', 'ต้องปลดชุดคนอื่นก่อน', 'info');

        const { value, isConfirmed } = await Swal.fire({
            title: 'เปลี่ยนเป็นชุดไหน?',
            html: `<select id="uk-new" class="swal2-input" style="width:100%;margin:0;">
                     ${free.map(k => `<option value="${k.kit_id}">${k.set_icon || ''} ชุด #${k.kit_no}</option>`).join('')}
                   </select>`,
            showCancelButton: true, confirmButtonText: 'เปลี่ยน', cancelButtonText: 'ยกเลิก',
            preConfirm: () => Number(document.getElementById('uk-new').value)
        });
        if (!isConfirmed) return;

        const { data, error } = await uniformApi.transferKit(value, userId, 'เปลี่ยนชุดจากหน้าผู้ใช้');
        if (error) return Swal.fire('ไม่สำเร็จ', error.message, 'error');
        await loadUserKitMap();
        renderUsersTable();
        return Swal.fire('เรียบร้อย', data?.message || '', 'success');
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// 🎖 ตำแหน่งหัวหน้า + กล่องใบตรวจ  (อยู่ในแท็บ "👤 ผู้ใช้")
//    หัวหน้า = อ่านอย่างเดียว + ส่งใบตรวจ ไม่มีสิทธิ์คืน/ปิดงาน/บล็อก
// ═══════════════════════════════════════════════════════════════════════════
const _SCOPE_LABEL = {
    band:    { icon: '🎖', name: 'หัวหน้าวง',        hint: 'เห็นทั้งวง' },
    section: { icon: '🎺', name: 'หัวหน้ากลุ่มเครื่อง', hint: 'เห็นเฉพาะกลุ่มตน' },
    event:   { icon: '🎭', name: 'หัวหน้างาน',        hint: 'เห็นเฉพาะงานนั้น' },
    uniform: { icon: '👔', name: 'ฝ่ายเสื้อผ้า',      hint: 'ดูแลชุด' }
};

async function renderStaffPanels() {
    await Promise.all([_renderStaffRoles(), _renderStaffReports()]);
}

async function _renderStaffRoles() {
    const wrap = document.getElementById('oad-staff-wrap');
    if (!wrap) return;
    wrap.innerHTML = '<div class="oad-skel" style="height:60px;"></div>';

    const { data, error } = await staffApi.listAll();
    if (error) { wrap.innerHTML = `<div class="oad-empty">${escapeHtml(error.message)}</div>`; return; }

    const rows = data || [];
    if (!rows.length) {
        wrap.innerHTML = '<div class="oad-empty"><span class="oad-empty-icon">🎖</span>ยังไม่ได้แต่งตั้งใคร — กด "แต่งตั้ง"</div>';
        return;
    }

    wrap.innerHTML = `
        <table class="oad-table">
            <thead><tr><th>ชื่อ</th><th>ตำแหน่ง</th><th>ขอบเขต</th><th>จัดการ</th></tr></thead>
            <tbody>
            ${rows.map(r => {
                const s = _SCOPE_LABEL[r.scope_type] || { icon: '•', name: r.scope_type, hint: '' };
                const u = r.users || {};
                const name = `${u.prefix || ''}${u.first_name || ''} ${u.last_name || ''}`.trim() || '—';
                return `<tr>
                    <td><strong>${escapeHtml(name)}</strong></td>
                    <td>${s.icon} ${escapeHtml(s.name)}</td>
                    <td style="font-size:.85rem;opacity:.8;">${escapeHtml(r.scope_value || s.hint)}</td>
                    <td><button class="oad-btn oad-btn-red" onclick="window.__oadRevokeStaff(${r.id})">ถอดถอน</button></td>
                </tr>`;
            }).join('')}
            </tbody>
        </table>`;
}

async function _renderStaffReports() {
    const wrap  = document.getElementById('oad-staffrep-wrap');
    const badge = document.getElementById('oad-staffrep-badge');
    if (!wrap) return;

    const { data, error } = await staffApi.listReports(true);
    if (error) { wrap.innerHTML = `<div class="oad-empty">${escapeHtml(error.message)}</div>`; return; }

    const rows = data || [];
    if (badge) {
        if (rows.length) { badge.textContent = String(rows.length); badge.classList.remove('hidden'); }
        else badge.classList.add('hidden');
    }
    if (!rows.length) {
        wrap.innerHTML = '<div class="oad-empty"><span class="oad-empty-icon">✨</span>ไม่มีใบตรวจค้าง</div>';
        return;
    }

    wrap.innerHTML = `
        <table class="oad-table">
            <thead><tr><th>เมื่อ</th><th>เรื่อง</th><th>ผลตรวจ</th><th>หมายเหตุ</th><th>จัดการ</th></tr></thead>
            <tbody>
            ${rows.map(r => `<tr>
                <td class="nowrap" style="font-size:.8rem;">${fmtDate(r.created_at)}</td>
                <td>${escapeHtml(r.target_label || r.target_kind)}</td>
                <td><span class="oad-badge ${r.finding === 'ครบ' ? 'oad-badge-green' : 'oad-badge-amber'}">${escapeHtml(r.finding)}</span></td>
                <td style="font-size:.85rem;">${escapeHtml(r.note || '—')}</td>
                <td><button class="oad-btn oad-btn-approve" onclick="window.__oadAckReport(${r.id})">✓ รับทราบ</button></td>
            </tr>`).join('')}
            </tbody>
        </table>`;
}

window.__oadAckReport = async (id) => {
    const { error } = await staffApi.ackReport(id);
    if (error) return toast(error.message, 'error');
    toast('รับทราบแล้ว');
    _renderStaffReports();
};

window.__oadRevokeStaff = async (roleId) => {
    const { isConfirmed } = await Swal.fire({
        title: 'ถอดถอนตำแหน่งนี้?', icon: 'warning',
        showCancelButton: true, confirmButtonText: 'ถอดถอน', cancelButtonText: 'ยกเลิก'
    });
    if (!isConfirmed) return;
    const { error } = await staffApi.revoke(roleId);
    if (error) return toast(error.message, 'error');
    toast('ถอดถอนแล้ว');
    _renderStaffRoles();
};

window.__oadAddStaff = async () => {
    const [{ data: sections }, { data: events }] = await Promise.all([
        sectionsApi.list(), eventsApi.list()
    ]);

    const candidates = (state.users || [])
        .filter(u => u.student_group !== 'deactivated')
        .map(u => `<option value="${u.id}">${escapeHtml((u.prefix||'') + u.first_name + ' ' + u.last_name)}${u.class_level ? ' · ' + escapeHtml(u.class_level) : ''}</option>`)
        .join('');

    const result = await Swal.fire({
        title: '🎖 แต่งตั้งหัวหน้า',
        width: 480,
        html: `<div style="text-align:left;font-size:.9rem;">
                 <label style="font-weight:700;">นักเรียน</label>
                 <select id="st-user" class="swal2-input" style="width:100%;margin:.2rem 0 .7rem;">${candidates}</select>
                 <label style="font-weight:700;">ตำแหน่ง</label>
                 <select id="st-scope" class="swal2-input" style="width:100%;margin:.2rem 0 .7rem;">
                   ${Object.entries(_SCOPE_LABEL).map(([k, v]) =>
                      `<option value="${k}">${v.icon} ${v.name} — ${v.hint}</option>`).join('')}
                 </select>
                 <div id="st-value-wrap" style="display:none;">
                   <label style="font-weight:700;">ขอบเขต</label>
                   <select id="st-value" class="swal2-input" style="width:100%;margin:.2rem 0 0;"></select>
                 </div>
               </div>`,
        showCancelButton: true, confirmButtonText: 'แต่งตั้ง', cancelButtonText: 'ยกเลิก',
        didOpen: () => {
            const scope = document.getElementById('st-scope');
            const wrap  = document.getElementById('st-value-wrap');
            const val   = document.getElementById('st-value');
            const sync = () => {
                const s = scope.value;
                if (s === 'section') {
                    wrap.style.display = 'block';
                    val.innerHTML = (sections || []).map(x =>
                        `<option value="${escapeHtml(x.code)}">${x.icon || ''} ${escapeHtml(x.name_th)}</option>`).join('');
                } else if (s === 'event') {
                    wrap.style.display = 'block';
                    const open = (events || []).filter(e => e.status === 'open' || e.status === 'active');
                    val.innerHTML = open.length
                        ? open.map(e => `<option value="${e.id}">🎭 ${escapeHtml(e.name)}</option>`).join('')
                        : '<option value="">— ยังไม่มีงานที่เปิดอยู่ —</option>';
                } else {
                    wrap.style.display = 'none';
                }
            };
            scope.addEventListener('change', sync);
            sync();
        },
        preConfirm: () => {
            const scope = document.getElementById('st-scope').value;
            const needsValue = scope === 'section' || scope === 'event';
            const value = needsValue ? document.getElementById('st-value').value : null;
            if (needsValue && !value) { Swal.showValidationMessage('ต้องเลือกขอบเขต'); return false; }
            return { userId: document.getElementById('st-user').value, scope, value };
        }
    });

    if (!result.isConfirmed) return;
    const { error } = await staffApi.grant(result.value.userId, result.value.scope, result.value.value);
    if (error) return toast(error.message, 'error');
    toast('แต่งตั้งเรียบร้อย');
    _renderStaffRoles();
};

// ═══════════════════════════════════════════════════════════════════════════
// 🎼 จับคู่ประเภทเครื่องดนตรี → กลุ่มของวง  (แท็บ "🎺 เครื่องดนตรี")
//    ชื่อประเภทดึงสดจาก instruments.type ไม่เก็บซ้ำที่ไหน
//    เปลี่ยนกลุ่ม = UPDATE instruments.section_id ทุกชิ้นของประเภทนั้น
// ═══════════════════════════════════════════════════════════════════════════
let _sectionList = [];

async function renderSectionMap() {
    const wrap = document.getElementById('oad-section-map');
    if (!wrap) return;
    wrap.innerHTML = '<div class="oad-skel" style="height:80px;"></div>';

    if (!_sectionList.length) {
        const { data } = await sectionsApi.list();
        _sectionList = data || [];
    }

    const { data, error } = await sectionsApi.listTypeMapping();
    if (error) { wrap.innerHTML = `<div class="oad-empty">${escapeHtml(error.message)}</div>`; return; }

    const rows = data || [];
    const unmappedTypes = rows.filter(r => !r.section_id);
    const unmappedItems = unmappedTypes.reduce((s, r) => s + Number(r.n), 0);

    const badge = document.getElementById('oad-section-badge');
    if (badge) {
        if (unmappedTypes.length) { badge.textContent = String(unmappedTypes.length); badge.classList.remove('hidden'); }
        else badge.classList.add('hidden');
    }

    // สรุปจำนวนชิ้นต่อกลุ่ม
    const perSection = new Map(_sectionList.map(s => [s.id, 0]));
    rows.forEach(r => { if (r.section_id) perSection.set(r.section_id, (perSection.get(r.section_id) || 0) + Number(r.n)); });

    wrap.innerHTML = `
        <div style="display:flex; gap:1rem; flex-wrap:wrap; margin-bottom:.9rem; font-size:.88rem;">
            ${_sectionList.map(s => `<span>${s.icon || ''} ${escapeHtml(s.name_th)}
                <strong>${perSection.get(s.id) || 0}</strong> ชิ้น</span>`).join('')}
            <span style="color:${unmappedItems ? '#f59e0b' : '#10b981'};">
                ${unmappedItems ? `⚠️ ยังไม่จัดกลุ่ม ${unmappedTypes.length} ประเภท (${unmappedItems} ชิ้น)` : '✅ จัดกลุ่มครบแล้ว'}
            </span>
        </div>

        <table class="oad-table">
            <thead><tr><th>ประเภทเครื่อง (จากคลังจริง)</th><th style="text-align:center;">จำนวน</th><th>กลุ่มของวง</th></tr></thead>
            <tbody>
            ${rows.map(r => `<tr${!r.section_id ? ' style="background:rgba(245,158,11,.06);"' : ''}>
                <td><strong>${escapeHtml(r.type)}</strong></td>
                <td style="text-align:center;">${r.n}</td>
                <td>
                    <select class="oad-input sec-pick" data-type="${escapeHtml(r.type)}" style="max-width:230px;">
                        <option value=""${!r.section_id ? ' selected' : ''}>— ไม่อยู่ในวงโยธวาทิต —</option>
                        ${_sectionList.map(s => `<option value="${s.id}"${r.section_id === s.id ? ' selected' : ''}>
                            ${s.icon || ''} ${escapeHtml(s.name_th)}</option>`).join('')}
                    </select>
                </td>
            </tr>`).join('')}
            </tbody>
        </table>`;

    wrap.querySelectorAll('.sec-pick').forEach(sel => {
        sel.addEventListener('change', async e => {
            const type = e.target.dataset.type;
            const val  = e.target.value ? Number(e.target.value) : null;
            e.target.disabled = true;
            const { data: res, error: err } = await sectionsApi.setTypeSection(type, val);
            e.target.disabled = false;
            if (err) return toast(err.message, 'error');
            toast(`จัดกลุ่ม "${type}" แล้ว (${res?.updated ?? 0} ชิ้น)`);
            renderSectionMap();
        });
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// 📏 ช่องกรอกไซส์ — เป็น dropdown เมื่อประเภทชิ้นกำหนดตัวเลือกไว้
//    ถ้ายังไม่กำหนดตัวเลือก (เช่น อุปกรณ์ที่เพิ่งเพิ่ม) จะกลับไปเป็นช่องพิมพ์อิสระ
//    ทั้งสองแบบใช้ class เดียวกัน ตัวเก็บค่าจึงไม่ต้องแยกกรณี
// ─────────────────────────────────────────────────────────────────────────────
function _sizeField(part, widthPx, cls = 'size-in') {
    const opts = part.size_options || [];
    const cur  = part.size || '';
    const style = `width:${widthPx}px;padding:.3rem .4rem;border-radius:6px;font-size:.83rem;`;

    if (!opts.length) {
        return `<input class="${cls}" data-part="${part.part_id}" value="${escapeHtml(cur)}"
                       placeholder="ไซส์" style="${style}">`;
    }
    return `<select class="${cls}" data-part="${part.part_id}" style="${style}">
              <option value=""${cur ? '' : ' selected'}>—</option>
              ${opts.map(o => `<option value="${escapeHtml(o)}"${o === cur ? ' selected' : ''}>${escapeHtml(o)}</option>`).join('')}
            </select>`;
}

// ── แก้สต๊อกรายไซส์: มีไซส์อะไรบ้าง และแต่ละไซส์มีกี่ตัว
//    ตารางนี้เป็นแหล่งเดียว — ตัวเลือกใน dropdown ก็มาจากที่นี่
window.__oadEditSizeStock = async (partTypeId, name, rows) => {
    const list = Array.isArray(rows) ? rows : [];

    const rowHtml = (r, i) => `<tr data-i="${i}">
        <td style="padding:.15rem;"><input class="ss-size" value="${escapeHtml(r.size || '')}"
            placeholder="ไซส์" style="width:88px;padding:.28rem;border-radius:5px;"></td>
        <td style="padding:.15rem;"><input class="ss-qty" type="number" min="0"
            value="${r.qty === null || r.qty === undefined ? '' : r.qty}"
            placeholder="ไม่จำกัด" style="width:96px;padding:.28rem;border-radius:5px;"></td>
        <td style="padding:.15rem;"><button type="button" class="ss-del oad-btn oad-btn-red"
            style="padding:.2rem .5rem;">✕</button></td>
    </tr>`;

    const { value, isConfirmed } = await Swal.fire({
        title: `📦 สต๊อกไซส์ — ${name}`,
        width: 460,
        html: `<div style="text-align:left;font-size:.87rem;">
                 <p style="margin:0 0 .6rem;opacity:.75;">
                   ใส่ว่าโรงเรียนมีไซส์ไหน <strong>กี่ตัว</strong> —
                   ระบบจะไม่ให้กรอกไซส์เกินจำนวนนี้<br>
                   เว้นช่องจำนวนว่าง = ไม่จำกัด
                 </p>
                 <table style="width:100%;border-collapse:collapse;">
                   <thead><tr style="font-size:.78rem;opacity:.7;">
                     <th style="text-align:left;">ไซส์</th><th style="text-align:left;">มีกี่ตัว</th><th></th>
                   </tr></thead>
                   <tbody id="ss-body">${list.map(rowHtml).join('')}</tbody>
                 </table>
                 <button type="button" id="ss-add" class="oad-btn" style="margin-top:.6rem;">➕ เพิ่มไซส์</button>
                 <div id="ss-total" style="margin-top:.6rem;font-weight:700;"></div>
               </div>`,
        showCancelButton: true, confirmButtonText: 'บันทึก', cancelButtonText: 'ยกเลิก',
        didOpen: () => {
            const body = document.getElementById('ss-body');
            const total = document.getElementById('ss-total');
            const sync = () => {
                const n = [...body.querySelectorAll('.ss-qty')]
                    .reduce((s, i) => s + (i.value === '' ? 0 : Number(i.value) || 0), 0);
                total.textContent = `รวม ${n} ตัว`;
            };
            const wire = () => {
                body.querySelectorAll('.ss-del').forEach(b => b.onclick = () => { b.closest('tr').remove(); sync(); });
                body.querySelectorAll('.ss-qty').forEach(i => i.oninput = sync);
            };
            document.getElementById('ss-add').onclick = () => {
                body.insertAdjacentHTML('beforeend', rowHtml({ size: '', qty: null }, body.children.length));
                wire(); sync();
            };
            wire(); sync();
        },
        preConfirm: () => {
            const out = [];
            const seen = new Set();
            for (const tr of document.querySelectorAll('#ss-body tr')) {
                const size = tr.querySelector('.ss-size').value.trim();
                if (!size) continue;
                if (seen.has(size)) { Swal.showValidationMessage(`ไซส์ "${size}" ซ้ำ`); return false; }
                seen.add(size);
                const q = tr.querySelector('.ss-qty').value.trim();
                out.push({ size, qty: q === '' ? null : Number(q) });
            }
            if (!out.length) { Swal.showValidationMessage('ต้องมีอย่างน้อย 1 ไซส์'); return false; }
            return out;
        }
    });
    if (!isConfirmed) return;

    const { error } = await uniformApi.setSizeStock(partTypeId, value);
    if (error) return toast(error.message, 'error');   // เกินที่ใช้ไปแล้ว / ลบไซส์ที่มีคนใช้
    toast('บันทึกสต๊อกแล้ว');
    renderUniformsTab();
};

// ═══════════════════════════════════════════════════════════════════════════
// 📏 กรอกไซส์เร็ว — ตารางเดียวจบทั้ง 60 ชุด
//    เร็วเพราะ: ตั้งทั้งคอลัมน์ได้ · เติมค่าลงล่าง · Enter เลื่อนลง ·
//    บันทึกอัตโนมัติ (ไม่ต้องกดปุ่ม ไม่มีทางกรอกเสร็จแล้วหาย)
// ═══════════════════════════════════════════════════════════════════════════
const _sg = { dirty: new Map(), timer: null, saving: false };

function _sgSetStatus(text, color) {
    const el = document.getElementById('oad-sizegrid-save');
    if (el) { el.textContent = text; el.style.color = color || 'var(--oad-muted)'; }
}

function _sgProgress() {
    const el = document.getElementById('oad-sg-progress');
    if (!el) return;
    const total = _uni.kits.reduce((s, k) => s + (k.parts_total || 0), 0);
    // นับจากค่าที่แสดงอยู่จริง (รวมที่เพิ่งแก้แต่ยังไม่ถูก reload)
    let filled = 0;
    _uni.kits.forEach(k => (k.parts || []).forEach(p => {
        const v = _sg.dirty.has(p.part_id) ? _sg.dirty.get(p.part_id) : (p.size || '');
        if (v) filled++;
    }));
    const pct = total ? Math.round(filled / total * 100) : 0;
    el.innerHTML = `กรอกแล้ว <strong style="color:${filled === total ? '#10b981' : '#f59e0b'};">${filled}/${total}</strong> (${pct}%)`;
}

async function _sgFlush() {
    if (_sg.saving || !_sg.dirty.size) return;
    _sg.saving = true;
    const batch = [..._sg.dirty.entries()].map(([part_id, size]) => ({ part_id, size }));
    _sgSetStatus('กำลังบันทึก...', '#f59e0b');

    const { error } = await uniformApi.setPartSizes(batch);
    _sg.saving = false;

    if (error) {
        _sgSetStatus('บันทึกไม่สำเร็จ — ลองใหม่', '#ef4444');
        toast(error.message, 'error');
        return;
    }

    // อัปเดตข้อมูลในหน่วยความจำให้ตรง โดยไม่ต้องดึงใหม่ทั้งก้อน
    batch.forEach(({ part_id, size }) => {
        _uni.kits.forEach(k => (k.parts || []).forEach(p => { if (p.part_id === part_id) p.size = size || null; }));
    });
    _uni.kits.forEach(k => {
        k.parts_sized = (k.parts || []).filter(p => p.size).length;
    });

    _sg.dirty.clear();
    _sgSetStatus(`✓ บันทึกแล้ว ${batch.length} ช่อง`, '#10b981');
    _sgProgress();

    // ของคงเหลือเปลี่ยนไปแล้ว — ดึงสต๊อกใหม่ให้ป้าย "เหลือ N" ตรงความจริง
    const { data: stk } = await uniformApi.sizeStock(_uni.setTypeId);
    if (stk) {
        _uni.stock = new Map(stk.map(r => [`${r.part_type_id}|${r.size}`, r]));
        renderSizeGrid();
        _renderUniformReport();
    }
}

function _sgTouch(partId, value) {
    _sg.dirty.set(partId, value);
    _sgSetStatus(`มี ${_sg.dirty.size} ช่องรอบันทึก...`);
    _sgProgress();
    clearTimeout(_sg.timer);
    _sg.timer = setTimeout(_sgFlush, 700);
}

function renderSizeGrid() {
    const wrap = document.getElementById('oad-sizegrid');
    if (!wrap) return;

    const onlyEmpty = document.getElementById('oad-sg-onlyempty')?.checked;
    let kits = _uni.kits.filter(k => (k.parts_total || 0) > 0);
    if (onlyEmpty) kits = kits.filter(k => k.parts_sized < k.parts_total);

    if (!kits.length) {
        wrap.innerHTML = `<div class="oad-empty"><span class="oad-empty-icon">${onlyEmpty ? '✅' : '👔'}</span>${
            onlyEmpty ? 'กรอกไซส์ครบทุกชุดแล้ว' : 'ยังไม่มีถุงชุด'}</div>`;
        _sgProgress();
        return;
    }

    // ประเภทชิ้นเรียงตามลำดับจริง เอาจากถุงที่มีชิ้นครบที่สุด
    const ref = kits.reduce((a, b) => (b.parts?.length || 0) > (a.parts?.length || 0) ? b : a, kits[0]);
    const types = (ref.parts || []).map(p => ({
        id: p.type_id, name: p.type_name, icon: p.icon, options: p.size_options || []
    }));

    wrap.innerHTML = `
      <table class="oad-table" style="font-size:.85rem;">
        <thead>
          <tr>
            <th style="position:sticky;left:0;background:var(--oad-surface);z-index:2;">ชุด</th>
            ${types.map(t => `<th style="text-align:center;min-width:96px;">
                ${t.icon || ''} ${escapeHtml(t.name)}</th>`).join('')}
          </tr>
          <tr>
            <th style="position:sticky;left:0;background:var(--oad-surface);z-index:2;
                       font-weight:400;font-size:.75rem;color:var(--oad-muted);">ตั้งทั้งคอลัมน์ →</th>
            ${types.map(t => `<th style="text-align:center;">
              ${t.options.length ? `
                <select class="sg-fillcol" data-type="${t.id}"
                        style="width:112px;padding:.22rem;border-radius:5px;font-size:.78rem;">
                  <option value="">— เลือก —</option>
                  ${t.options.map(o => `<option value="${escapeHtml(o)}">${escapeHtml(o)}${_sgStockNote(t.id, o)}</option>`).join('')}
                </select>` : '<span style="font-size:.72rem;opacity:.5;">พิมพ์อิสระ</span>'}
            </th>`).join('')}
          </tr>
        </thead>
        <tbody>
        ${kits.map((k, rowIdx) => `<tr>
          <td style="position:sticky;left:0;background:var(--oad-surface);white-space:nowrap;">
            <strong>#${k.kit_no}</strong>
            <span style="opacity:.65;font-size:.78rem;">${escapeHtml(k.owner_nickname || k.owner_name || '')}</span>
          </td>
          ${types.map((t, colIdx) => {
            const p = (k.parts || []).find(x => x.type_id === t.id);
            if (!p) return '<td style="text-align:center;opacity:.35;">—</td>';
            const cur = _sg.dirty.has(p.part_id) ? _sg.dirty.get(p.part_id) : (p.size || '');
            const common = `class="sg-cell" data-part="${p.part_id}" data-row="${rowIdx}" data-col="${colIdx}"
                            style="width:88px;padding:.28rem;border-radius:5px;font-size:.82rem;
                                   ${cur ? '' : 'background:rgba(245,158,11,.12);'}"`;
            return `<td style="text-align:center;">${
              t.options.length
                ? `<select ${common}>
                     <option value=""${cur ? '' : ' selected'}>—</option>
                     ${t.options.map(o => {
                        const note = _sgStockNote(t.id, o, cur === o);
                        return `<option value="${escapeHtml(o)}"${o === cur ? ' selected' : ''}>${escapeHtml(o)}${note}</option>`;
                     }).join('')}
                   </select>`
                : `<input ${common} value="${escapeHtml(cur)}" placeholder="—">`
            }</td>`;
          }).join('')}
        </tr>`).join('')}
        </tbody>
      </table>`;

    const cells = [...wrap.querySelectorAll('.sg-cell')];

    const markCell = el => {
        el.style.background = el.value ? '' : 'rgba(245,158,11,.12)';
    };

    cells.forEach(el => {
        el.addEventListener('change', e => {
            _sgTouch(Number(e.target.dataset.part), e.target.value);
            markCell(e.target);
        });
        // Enter / ลูกศร = เลื่อนในคอลัมน์เดิม กรอกทีละคอลัมน์ได้เร็วสุด
        el.addEventListener('keydown', e => {
            if (!['Enter', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
            e.preventDefault();
            const row = Number(e.target.dataset.row);
            const col = Number(e.target.dataset.col);
            const step = e.key === 'ArrowUp' ? -1 : 1;
            const next = cells.find(c => Number(c.dataset.row) === row + step && Number(c.dataset.col) === col);
            if (next) { next.focus(); next.select?.(); }
        });
    });

    // ตั้งทั้งคอลัมน์ = เติมให้ทุกแถวที่แสดงอยู่ (เคารพตัวกรอง)
    wrap.querySelectorAll('.sg-fillcol').forEach(sel => {
        sel.addEventListener('change', e => {
            const val = e.target.value;
            if (!val) return;
            const typeId = e.target.dataset.type;
            const colIdx = types.findIndex(t => String(t.id) === typeId);
            let n = 0;
            cells.filter(c => Number(c.dataset.col) === colIdx).forEach(c => {
                c.value = val;
                _sg.dirty.set(Number(c.dataset.part), val);
                markCell(c);
                n++;
            });
            e.target.value = '';
            _sgSetStatus(`มี ${_sg.dirty.size} ช่องรอบันทึก...`);
            _sgProgress();
            clearTimeout(_sg.timer);
            _sg.timer = setTimeout(_sgFlush, 700);
            toast(`ตั้ง "${val}" ให้ ${n} ชุดแล้ว`);
        });
    });

    _sgProgress();
}

// ⤵️ กระโดดไปช่องว่างถัดไป — ไล่กรอกไม่ต้องหาเอง
window.__oadSizeJump = () => {
    const empty = [...document.querySelectorAll('.sg-cell')].find(c => !c.value);
    if (!empty) return toast('กรอกครบทุกช่องแล้ว 🎉');
    empty.scrollIntoView({ block: 'center', behavior: 'smooth' });
    empty.focus();
};

// ป้ายบอกของคงเหลือในตัวเลือกไซส์ เช่น "8 (เหลือ 2)" / "8 (หมด)"
// ช่องที่กำลังเลือกไซส์นั้นอยู่แล้วไม่ต้องเตือนว่าหมด เพราะมันคือของที่ถืออยู่
function _sgStockNote(typeId, size, isCurrent = false) {
    const st = _uni.stock?.get(`${typeId}|${size}`);
    if (!st || st.qty == null) return '';
    const left = st.remaining;
    if (left > 0) return ` (เหลือ ${left})`;
    return isCurrent ? '' : ' (หมด)';
}

// ── ลิงก์ ICS สำหรับ subscribe เข้า Google Calendar
async function _loadCalendarUrl() {
    const el = document.getElementById('oad-cal-url');
    if (!el) return;
    const { data: token, error } = await eventsApi.calendarToken();
    if (error || !token) { el.value = ''; el.placeholder = 'โหลดลิงก์ไม่สำเร็จ'; return; }
    el.value = `${SUPABASE_URL}/functions/v1/calendar-ics?token=${token}`;
}

// ── สถานะการซิงก์เข้าปฏิทินเดิม
async function _loadGcalStatus() {
    const el = document.getElementById('oad-gcal-status');
    const hint = document.getElementById('oad-gcal-hint');
    if (!el) return;

    const { data, error } = await eventsApi.gcalStatus();
    if (error || !data) { el.textContent = ''; return; }

    const pending = Number(data.pending || 0);
    el.innerHTML = pending
        ? `<span style="color:#f59e0b;">รอซิงก์ ${pending} รายการ</span>`
        : `<span style="color:#10b981;">ซิงก์ครบแล้ว</span>`;
    if (hint) {
        hint.textContent = data.last_sync
            ? `ซิงก์ล่าสุด ${new Date(data.last_sync).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}`
            : 'ยังไม่เคยซิงก์ — ตั้งค่าตามขั้นตอนด้านล่างก่อน';
    }
}

// ── ประกาศกิจกรรมที่ร่างไว้ — นักเรียนเห็นและปฏิทินอัปเดตทันที
window.__oadPublishEvent = async (eventId, name) => {
    const { isConfirmed } = await Swal.fire({
        title: `ประกาศ "${name}"?`,
        text: 'นักเรียนจะเห็นทันที และกิจกรรมจะถูกส่งขึ้นปฏิทิน Google',
        icon: 'question', showCancelButton: true,
        confirmButtonText: '📢 ประกาศ', cancelButtonText: 'ยังก่อน'
    });
    if (!isConfirmed) return;

    const { error } = await eventsApi.setStatus(eventId, 'open');
    if (error) return toast(error.message, 'error');
    toast('ประกาศแล้ว — นักเรียนเห็นและกำลังซิงก์เข้าปฏิทิน');
    renderEventsTab();
    _loadGcalStatus();
};
