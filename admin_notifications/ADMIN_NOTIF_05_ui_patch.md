# 🎨 ADMIN NOTIFICATIONS — STEP 05: UI Patch Instructions

## เป้าหมาย
เพิ่ม **🔔 Bell icon + Dropdown** ใน admin header (ที่เดียวกับ scheduled notifications tab) เพื่อให้ admin เห็น alerts จากระบบ

---

## 📍 จุดที่ต้องแก้: `admin-dashboard.js`

### Patch 1 — เพิ่ม import (บรรทัด 7)

**ค้นหา:**
```js
import { adminDashboard as api, adminExt, authApi, bossesApi, raidApi, instrumentsExt, notifications, adminKnowledgeApi, scheduledNotificationsApi } from './api.js';
```

**แทนที่ด้วย:**
```js
import { adminDashboard as api, adminExt, authApi, bossesApi, raidApi, instrumentsExt, notifications, adminKnowledgeApi, scheduledNotificationsApi, adminNotifications } from './api.js';
```

---

### Patch 2 — เพิ่ม CSS ใน styles.css (ท้ายไฟล์)

```css
/* ═══ Admin Notification Bell ═══ */
.oad-bell-wrap { position: relative; display: inline-block; margin-left: auto; }
.oad-bell {
    width: 40px; height: 40px; border-radius: 50%;
    background: var(--input-bg); border: 1px solid var(--input-border);
    display: grid; place-items: center; cursor: pointer;
    font-size: 1.2rem; transition: all 0.2s;
}
.oad-bell:hover { background: var(--primary-blue); color: white; transform: scale(1.05); }
.oad-bell-badge {
    position: absolute; top: -4px; right: -4px;
    background: var(--danger, #ef4444); color: white;
    font-size: 0.7rem; font-weight: 800; padding: 2px 6px;
    border-radius: 999px; min-width: 18px; text-align: center;
    border: 2px solid var(--card-bg);
    animation: pulse 2s infinite;
}
.oad-bell-badge.critical { background: #dc2626; }
.oad-bell-badge.warning { background: #f59e0b; }

.oad-notif-panel {
    position: absolute; top: 50px; right: 0; width: 380px; max-height: 480px;
    background: var(--card-bg, #fff); border-radius: 0.75rem;
    border: 1px solid var(--input-border);
    box-shadow: 0 12px 32px rgba(0,0,0,0.15);
    z-index: 100; overflow: hidden;
    display: none;
}
.oad-notif-panel.open { display: flex; flex-direction: column; }
.oad-notif-header {
    padding: 0.75rem 1rem; border-bottom: 1px solid var(--input-border);
    display: flex; align-items: center; gap: 0.5rem;
    background: linear-gradient(135deg, #3b82f6, #2563eb); color: white;
}
.oad-notif-header h4 { margin: 0; font-size: 1rem; flex: 1; font-weight: 700; }
.oad-notif-header button {
    background: rgba(255,255,255,0.2); color: white; border: none;
    padding: 0.3rem 0.6rem; border-radius: 0.4rem; font-size: 0.75rem;
    cursor: pointer; font-weight: 600;
}
.oad-notif-filters {
    padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--input-border);
    display: flex; gap: 0.4rem; flex-wrap: wrap; background: var(--input-bg);
}
.oad-notif-pill {
    padding: 0.3rem 0.7rem; border-radius: 999px; font-size: 0.75rem;
    border: 1px solid var(--input-border); cursor: pointer; font-weight: 600;
    background: var(--card-bg); color: var(--text-main);
}
.oad-notif-pill.active { background: var(--primary-blue); color: white; border-color: var(--primary-blue); }
.oad-notif-list { flex: 1; overflow-y: auto; }
.oad-notif-item {
    padding: 0.75rem 1rem; border-bottom: 1px solid var(--input-border);
    cursor: pointer; transition: background 0.15s;
    border-left: 4px solid transparent;
}
.oad-notif-item:hover { background: var(--input-bg); }
.oad-notif-item.unread { background: rgba(59,130,246,0.05); }
.oad-notif-item.critical { border-left-color: #dc2626; }
.oad-notif-item.warning  { border-left-color: #f59e0b; }
.oad-notif-item.info     { border-left-color: #3b82f6; }
.oad-notif-title { font-weight: 700; font-size: 0.9rem; margin-bottom: 0.2rem; }
.oad-notif-body  { font-size: 0.8rem; color: var(--text-muted, #64748b); line-height: 1.4; }
.oad-notif-meta  { font-size: 0.7rem; color: var(--text-muted); margin-top: 0.3rem; }
.oad-notif-empty {
    padding: 2rem 1rem; text-align: center; color: var(--text-muted);
    font-size: 0.85rem;
}
@keyframes pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.15); }
}
```

---

### Patch 3 — เพิ่ม HTML markup ใน admin header

**ค้นหาบรรทัดที่มี:**
```js
<button class="oad-tab" data-tab="notifications">🔔 แจ้งเตือน</button>
```
(ประมาณบรรทัด 452 — ส่วน tab navigation)

**ไม่ต้องแก้ tab — แต่ค้นหา section ที่ render หัวข้อหลัก** (ประมาณบรรทัด 440-460)
หา div ที่เป็น header bar ของ admin (อาจเป็น `oad-topbar` หรือ `oad-header`)

**ถ้าไม่มี header bar เลย** — เพิ่มต่อท้าย title:

```js
// หลัง <h1>หรือ title ของ admin dashboard ปกติ
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
```

---

### Patch 4 — เพิ่ม JavaScript Module (ท้ายไฟล์ admin-dashboard.js หรือสร้างไฟล์ใหม่ `admin-notif-bell.js`)

```js
// ═══════════════════════════════════════════════════════════════
// 🔔 Admin Notification Bell — initialized on dashboard load
// ═══════════════════════════════════════════════════════════════

let _adminNotifState = {
    activeFilter: 'all',
    items: [],
    unsubscribe: null
};

async function initAdminBell() {
    const bellBtn = document.getElementById('oad-bell-btn');
    const panel   = document.getElementById('oad-notif-panel');
    if (!bellBtn || !panel) return;

    // Toggle dropdown
    bellBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        panel.classList.toggle('open');
        if (panel.classList.contains('open')) loadAdminBellItems();
    });

    // Click outside to close
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#oad-bell-wrap')) panel.classList.remove('open');
    });

    // Filter pills
    document.querySelectorAll('.oad-notif-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            document.querySelectorAll('.oad-notif-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            _adminNotifState.activeFilter = pill.dataset.filter;
            renderAdminBellList();
        });
    });

    // Acknowledge all button
    document.getElementById('oad-notif-ack-all')?.addEventListener('click', async () => {
        const { error } = await adminNotifications.acknowledgeAll();
        if (!error) {
            _adminNotifState.items.forEach(i => i.is_read = true);
            renderAdminBellList();
            updateAdminBellBadge();
        }
    });

    // Initial load + realtime
    await loadAdminBellItems();
    await updateAdminBellBadge();

    _adminNotifState.unsubscribe = adminNotifications.subscribeRealtime((newRow) => {
        _adminNotifState.items.unshift(newRow);
        if (_adminNotifState.items.length > 50) _adminNotifState.items.pop();
        renderAdminBellList();
        updateAdminBellBadge();
        // Toast แจ้งทันที (severity = critical/warning)
        if (newRow.severity === 'critical' || newRow.severity === 'warning') {
            if (typeof toast === 'function') toast(newRow.title, newRow.severity === 'critical' ? 'error' : 'warning');
        }
    });

    // Poll fallback ทุก 5 นาที (เผื่อ realtime หลุด)
    setInterval(() => { loadAdminBellItems(); updateAdminBellBadge(); }, 5 * 60 * 1000);
}

async function loadAdminBellItems() {
    const { data, error } = await adminNotifications.list({ limit: 50 });
    if (error) {
        console.error('[AdminBell] load error', error);
        return;
    }
    _adminNotifState.items = data;
    renderAdminBellList();
}

async function updateAdminBellBadge() {
    const badge = document.getElementById('oad-bell-badge');
    if (!badge) return;
    const { count } = await adminNotifications.getTotalUnread();
    if (count > 0) {
        badge.textContent = count > 99 ? '99+' : String(count);
        badge.classList.remove('hidden');
        // เปลี่ยนสีตาม severity สูงสุด
        const hasCritical = _adminNotifState.items.some(i => !i.is_read && i.severity === 'critical');
        const hasWarning  = _adminNotifState.items.some(i => !i.is_read && i.severity === 'warning');
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

    let items = _adminNotifState.items;
    const f = _adminNotifState.activeFilter;
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
                <div class="oad-notif-title">${escapeHtml(it.title)}</div>
                <div class="oad-notif-body">${escapeHtml(it.body || '')}</div>
                <div class="oad-notif-meta">${time} · ${escapeHtml(it.category || '')}</div>
            </div>
        `;
    }).join('');

    // Click to acknowledge
    list.querySelectorAll('.oad-notif-item').forEach(el => {
        el.addEventListener('click', async () => {
            const id = parseInt(el.dataset.id);
            const item = _adminNotifState.items.find(i => i.id === id);
            if (item && !item.is_read) {
                item.is_read = true;
                el.classList.remove('unread');
                await adminNotifications.acknowledge(id);
                updateAdminBellBadge();
            }
        });
    });
}

// ─── เรียก init ตอน admin dashboard mount ─────────────────────────────────
// ค้นหาบรรทัดที่ render admin dashboard เสร็จ แล้วเพิ่ม:
//
//     initAdminBell();
//
// (มักจะอยู่ใน function หลักของ admin entry point)
```

---

## 🧪 ทดสอบหลังติดตั้ง

1. รัน `ADMIN_NOTIF_01_schema.sql` + `02_triggers.sql` + `03_cron.sql` (ครบทั้ง 3 ไฟล์)
2. Apply patches 1-4 ข้างต้น
3. Bump SW version ใน `sw.js`
4. Deploy: `vercel --prod --yes`
5. **ทดสอบ trigger:**
   - เข้า admin → ไปที่ผู้ใช้ → กดบล็อกใครสักคน → ดูว่า bell badge ขึ้นไหม
   - เปลี่ยน role ของ user เป็น admin ผ่าน SQL Editor → bell ต้องเด้ง 🔴
   - ส่งคลิป knowledge link เป็น student → admin bell ต้องเด้ง 🔵

---

## 📌 หมายเหตุ
- ถ้า realtime ไม่ทำงาน — bell จะ poll ทุก 5 นาที (fallback)
- ทั้งหมดนี้ไม่กระทบ notification ของ student เลย เพราะ filter ด้วย `is_admin_alert = true`
- Push notification (เด้งหน้าจอ) จะทำงานอัตโนมัติผ่าน trigger เดิม `notifications_send_push` (ถ้าตั้งไว้)
