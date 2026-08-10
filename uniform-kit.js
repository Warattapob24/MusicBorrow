/**
 * uniform-kit.js — เบิก/คืนชุดวงโยธวาทิตด้วย QR ที่ถุงชุด
 *
 * หลักการสำคัญ:
 *   QR อยู่ที่ "ถุง" แต่ความจริงว่าในถุงมีชิ้นอะไรอยู่ที่ "ฐานข้อมูล"
 *   เพราะอนุญาตให้สลับชิ้นข้ามถุงได้ (รองเท้าคับ ขอสลับกับชุดอื่น)
 *   จึงต้องดึงรายการชิ้นจาก RPC ทุกครั้ง ห้ามเดาจากเลขถุง
 *
 * เบิก = ติ๊กครบทุกชิ้นที่บังคับถึงจะกดรับได้
 * คืน  = ติ๊กทีละชิ้น + เลือกสภาพ ขาดชิ้นไหนก็ค้างชิ้นนั้น ใบยังไม่ปิด
 */

import { uniformApi, eventsApi } from './api.js';
import { escapeHtml, fmtEventTimes } from './utils.js';
import { getCurrentUser } from './auth.js';

const COND_LABEL = {
    A: 'A — สภาพดี',
    B: 'B — มีร่องรอยใช้งาน',
    C: 'C — ชำรุดเล็กน้อย',
    repair: 'ต้องซ่อม',
    lost: 'สูญหาย / ไม่ได้ส่ง'
};

/** ตรวจว่าข้อความจาก QR เป็นรหัสถุงชุดหรือไม่ — รองรับทั้ง KIT-012 และ URL ที่มี ?kit= */
export function parseKitCode(decodedText) {
    if (!decodedText) return null;
    const raw = String(decodedText).trim();

    if (/^KIT-\d+$/i.test(raw)) return raw.toUpperCase();

    try {
        const url = new URL(raw);
        const kit = url.searchParams.get('kit');
        if (kit) return /^KIT-/i.test(kit) ? kit.toUpperCase() : `KIT-${String(kit).padStart(3, '0')}`;
    } catch { /* ไม่ใช่ URL — ข้าม */ }

    return null;
}

/** เลือกงานที่เปิดเบิกชุดอยู่ — คืน null ถ้าไม่มีงานหรือผู้ใช้ยกเลิก */
async function _pickUniformEvent() {
    const { data: events } = await eventsApi.getOpen();
    const usable = (events || []).filter(e => e.needs_uniform);

    if (!usable.length) {
        await Swal.fire('ยังไม่มีงานที่เปิดเบิกชุด',
            'ชุดเบิกได้เฉพาะตอนมีงาน — กรุณาให้ครูเปิดงานก่อน', 'info');
        return null;
    }
    if (usable.length === 1) return usable[0];

    const result = await Swal.fire({
        title: 'เบิกชุดสำหรับงานไหน?',
        html: `<div style="text-align:left;">${usable.map(e => `
            <button type="button" class="kit-ev-btn" data-id="${e.id}"
                style="display:block;width:100%;margin:0 0 .5rem;padding:.85rem 1rem;border-radius:12px;
                       border:1px solid #f59e0b;background:rgba(245,158,11,.1);color:inherit;
                       text-align:left;cursor:pointer;font-size:.95rem;">
              🎭 <strong>${escapeHtml(e.name)}</strong><br>
              <span style="font-size:.78rem;opacity:.75;">${fmtEventTimes(e)}</span>
            </button>`).join('')}</div>`,
        showConfirmButton: false, showCancelButton: true, cancelButtonText: 'ยกเลิก',
        didOpen: () => {
            document.querySelectorAll('.kit-ev-btn').forEach(b =>
                b.addEventListener('click', () => Swal.close({ isConfirmed: true, value: b.dataset.id })));
        }
    });

    if (!result.isConfirmed || !result.value) return null;
    return usable.find(e => String(e.id) === String(result.value)) || null;
}

/**
 * จุดเข้าหลัก — เรียกจากตัวสแกน QR เมื่อเจอรหัสถุงชุด
 */
export async function processKitScan(qrCode) {
    const user = getCurrentUser();
    if (!user) {
        sessionStorage.setItem('pendingKitScan', qrCode);
        return Swal.fire('กรุณาล็อกอิน', 'ต้องเข้าสู่ระบบก่อนเบิก/คืนชุด', 'info');
    }

    // ── ถุงยังไม่มีเจ้าของ → เสนอให้รับเป็นชุดประจำตัว
    //    เฉพาะสมาชิกชุมนุมเท่านั้น คนกลุ่มอื่นยืมได้เป็นครั้ง ๆ ตอนมีงาน
    //    คืนครบเมื่อไหร่ ชุดว่างทันที ไม่ผูกถาวร
    const isClub = user.student_group === 'club';
    if (isClub) {
        const { data: kitInfo } = await uniformApi.scanKit(qrCode, null);
        if (kitInfo && !kitInfo.owner_id) {
            const { isConfirmed } = await Swal.fire({
                title: `ชุด #${kitInfo.kit_no} ยังไม่มีเจ้าของ`,
                html: `รับชุดนี้เป็น<strong>ชุดประจำตัวของคุณ</strong>ไหม?<br>
                       <span style="font-size:.82rem;opacity:.75;">รับได้คนละ 1 ชุด — เปลี่ยนได้เฉพาะครู</span>`,
                icon: 'question', showCancelButton: true,
                confirmButtonText: '✅ รับชุดนี้', cancelButtonText: 'ยังก่อน'
            });
            if (isConfirmed) {
                const { data, error } = await uniformApi.claimKit(qrCode);
                if (error) return Swal.fire('รับไม่สำเร็จ', error.message, 'error');
                await Swal.fire('เรียบร้อย', `ชุด #${data.kit_no} เป็นชุดประจำตัวของคุณแล้ว`, 'success');
            }
        }
    }

    const ev = await _pickUniformEvent();
    if (!ev) return;

    Swal.fire({ title: 'กำลังอ่านข้อมูลชุด...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    const { data: kit, error } = await uniformApi.scanKit(qrCode, ev.id);
    if (error)  return Swal.fire('ผิดพลาด', error.message || 'อ่านข้อมูลชุดไม่สำเร็จ', 'error');
    if (!kit)   return Swal.fire('ไม่พบชุดนี้', `ไม่พบถุงรหัส ${escapeHtml(qrCode)} ในระบบ`, 'error');

    Swal.close();

    if (kit.checkout_id && kit.checkout_status !== 'closed') {
        return _renderReturnChecklist(kit, ev);
    }
    if (kit.checkout_status === 'closed') {
        return Swal.fire('คืนครบแล้ว', `ชุด #${kit.kit_no} คืนครบทุกชิ้นสำหรับงานนี้แล้ว`, 'success');
    }
    return _renderCheckoutChecklist(kit, ev, user);
}

// ─────────────────────────────────────────────────────────────────────────────
// 📤 เบิกชุด — ติ๊กครบถึงจะกดรับได้
// ─────────────────────────────────────────────────────────────────────────────
async function _renderCheckoutChecklist(kit, ev, user) {
    const parts = kit.parts || [];
    if (!parts.length) {
        return Swal.fire('ชุดนี้ยังไม่มีชิ้นส่วน', 'กรุณาแจ้งครูให้จัดของเข้าถุงก่อน', 'warning');
    }

    const unavailable = parts.filter(p => p.status !== 'available');

    const rows = parts.map(p => `
        <label style="display:flex;align-items:center;gap:.6rem;padding:.55rem .3rem;
                      border-bottom:1px solid rgba(128,128,128,.18);
                      ${p.status !== 'available' ? 'opacity:.45;' : ''}">
            <input type="checkbox" class="kit-chk" value="${p.part_id}"
                   ${p.status !== 'available' ? 'disabled' : ''}
                   style="width:20px;height:20px;flex-shrink:0;">
            <span style="flex:1;">
                ${p.icon || ''} <strong>${escapeHtml(p.type_name)}</strong>
                <span style="opacity:.7;font-size:.8rem;">${escapeHtml(p.part_code)}${p.size ? ` · ไซส์ ${escapeHtml(p.size)}` : ''}</span>
                ${p.status !== 'available' ? '<br><span style="font-size:.75rem;color:#ef4444;">ไม่พร้อมใช้ (ซ่อม/ถูกเบิกอยู่)</span>' : ''}
            </span>
        </label>`).join('');

    // คนที่ไม่ใช่เจ้าของถุง = ยืมชั่วคราว คืนแล้วชุดว่างทันที
    const isTemp = !kit.owner_id || kit.owner_id !== user.id;

    const result = await Swal.fire({
        title: `📤 เบิกชุด #${kit.kit_no}`,
        width: 520,
        html: `<div style="text-align:left;font-size:.9rem;">
                 <div style="padding:.5rem .7rem;border-radius:8px;background:rgba(245,158,11,.12);margin-bottom:.7rem;">
                   🎭 ${escapeHtml(ev.name)}<br><span style="font-size:.82rem;">${fmtEventTimes(ev)}</span>
                 </div>
                 ${isTemp ? `<div style="padding:.45rem .7rem;border-radius:8px;background:rgba(59,130,246,.12);margin-bottom:.7rem;font-size:.83rem;">
                   ℹ️ <strong>ยืมชั่วคราว</strong> — ไม่ผูกเป็นชุดประจำตัว คืนครบเมื่อไหร่ชุดว่างทันที
                 </div>` : ''}
                 <p style="margin:0 0 .3rem;font-weight:700;">ตรวจของในถุงให้ครบก่อนรับ</p>
                 <p style="margin:0 0 .5rem;font-size:.78rem;opacity:.7;">ติ๊กครบทุกชิ้นถึงจะกดรับได้</p>
                 ${rows}
                 ${unavailable.length ? `<p style="margin:.6rem 0 0;font-size:.78rem;color:#ef4444;">
                    มี ${unavailable.length} ชิ้นไม่พร้อมใช้ — กด "ขอเปลี่ยน/สลับ" เพื่อแจ้งครู</p>` : ''}
                 <div id="kit-progress" style="margin-top:.7rem;font-weight:700;"></div>
               </div>`,
        showCancelButton: true, showDenyButton: true,
        confirmButtonText: '✅ รับชุด',
        denyButtonText: '🔄 ขอเปลี่ยน/สลับ',
        cancelButtonText: 'ยกเลิก',
        didOpen: () => {
            const btn  = Swal.getConfirmButton();
            const chks = [...document.querySelectorAll('.kit-chk')];
            const need = chks.filter(c => !c.disabled).length;
            const prog = document.getElementById('kit-progress');
            const sync = () => {
                const n = chks.filter(c => c.checked).length;
                // ต้องติ๊กครบทุกชิ้นที่เบิกได้ และห้ามมีชิ้นที่ใช้ไม่ได้ปนอยู่
                const ok = n === need && unavailable.length === 0;
                btn.disabled = !ok;
                prog.textContent = `ติ๊กแล้ว ${n}/${parts.length} ชิ้น`;
                prog.style.color = ok ? '#10b981' : '#ef4444';
            };
            chks.forEach(c => c.addEventListener('change', sync));
            sync();
        },
        preConfirm: () => [...document.querySelectorAll('.kit-chk:checked')].map(c => Number(c.value))
    });

    if (result.isDenied) return _requestSwap(kit);
    if (!result.isConfirmed) return;

    const partIds = result.value || [];
    Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    const { data, error } = await uniformApi.checkout(ev.id, kit.kit_id, user.id, partIds);
    if (error) return Swal.fire('เบิกไม่สำเร็จ', error.message, 'error');

    return Swal.fire('รับชุดเรียบร้อย', data?.message || `รับชุด #${kit.kit_no} แล้ว`, 'success');
}

// ─────────────────────────────────────────────────────────────────────────────
// 📥 คืนชุด — ทีละชิ้น ขาดชิ้นไหนค้างชิ้นนั้น
// ─────────────────────────────────────────────────────────────────────────────
async function _renderReturnChecklist(kit, ev) {
    const parts = (kit.parts || []).filter(p => p.status === 'checked_out');

    if (!parts.length) {
        return Swal.fire('ไม่มีชิ้นค้างคืน', `ชุด #${kit.kit_no} คืนครบแล้ว`, 'success');
    }

    const rows = parts.map(p => `
        <div style="padding:.6rem .3rem;border-bottom:1px solid rgba(128,128,128,.18);">
            <label style="display:flex;align-items:center;gap:.6rem;">
                <input type="checkbox" class="kit-ret" value="${p.part_id}" checked
                       style="width:20px;height:20px;flex-shrink:0;">
                <span style="flex:1;">
                    ${p.icon || ''} <strong>${escapeHtml(p.type_name)}</strong>
                    <span style="opacity:.7;font-size:.8rem;">${escapeHtml(p.part_code)}</span>
                </span>
            </label>
            <select class="kit-cond" data-part="${p.part_id}"
                    style="width:100%;margin-top:.35rem;padding:.4rem .5rem;border-radius:7px;font-size:.83rem;">
                ${Object.entries(COND_LABEL).map(([v, l]) =>
                    `<option value="${v}"${v === 'A' ? ' selected' : ''}>${l}</option>`).join('')}
            </select>
        </div>`).join('');

    const result = await Swal.fire({
        title: `📥 คืนชุด #${kit.kit_no}`,
        width: 520,
        html: `<div style="text-align:left;font-size:.9rem;">
                 <div style="padding:.5rem .7rem;border-radius:8px;background:rgba(59,130,246,.12);margin-bottom:.7rem;">
                   🎭 ${escapeHtml(ev.name)} — ค้างคืน ${parts.length} ชิ้น
                 </div>
                 <p style="margin:0 0 .5rem;font-size:.78rem;opacity:.75;">
                   ติ๊กเฉพาะชิ้นที่ส่งคืนจริง — ชิ้นที่ไม่ได้ติ๊กจะยังค้างอยู่
                 </p>
                 ${rows}
               </div>`,
        showCancelButton: true,
        confirmButtonText: '📥 บันทึกการคืน',
        cancelButtonText: 'ยกเลิก',
        preConfirm: () => [...document.querySelectorAll('.kit-ret:checked')].map(c => ({
            partId: Number(c.value),
            condition: document.querySelector(`.kit-cond[data-part="${c.value}"]`)?.value || 'A'
        }))
    });

    if (!result.isConfirmed) return;
    const picked = result.value || [];
    if (!picked.length) return Swal.fire('ยังไม่ได้เลือก', 'กรุณาติ๊กอย่างน้อย 1 ชิ้น', 'info');

    Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    let remaining = parts.length;
    let closed = false;
    for (const it of picked) {
        const { data, error } = await uniformApi.returnPart(kit.checkout_id, it.partId, it.condition);
        if (error) return Swal.fire('บันทึกไม่สำเร็จ', error.message, 'error');
        remaining = data?.remaining ?? remaining;
        closed = !!data?.closed;
    }

    const damaged = picked.filter(p => p.condition === 'repair' || p.condition === 'lost').length;

    return Swal.fire(
        closed ? '✅ คืนครบแล้ว' : `คืนแล้ว ${picked.length} ชิ้น`,
        [closed ? `ชุด #${kit.kit_no} คืนครบทุกชิ้น` : `ยังค้างอีก ${remaining} ชิ้น`,
         damaged ? `แจ้งชำรุด/สูญหาย ${damaged} ชิ้น — ครูได้รับแจ้งแล้ว` : ''
        ].filter(Boolean).join('\n'),
        closed ? 'success' : 'info');
}

// ─────────────────────────────────────────────────────────────────────────────
// 🔄 ขอเปลี่ยน/สลับชิ้น
// ─────────────────────────────────────────────────────────────────────────────
async function _requestSwap(kit) {
    const parts = kit.parts || [];

    const result = await Swal.fire({
        title: '🔄 ขอเปลี่ยน/สลับ',
        width: 480,
        html: `<div style="text-align:left;font-size:.9rem;">
                 <label style="font-weight:700;">ชิ้นที่ต้องการเปลี่ยน</label>
                 <select id="swap-part" class="swal2-input" style="width:100%;margin:.25rem 0 .7rem;">
                   ${parts.map(p => `<option value="${p.part_id}">${p.icon || ''} ${escapeHtml(p.type_name)} (${escapeHtml(p.part_code)})</option>`).join('')}
                 </select>
                 <label style="font-weight:700;">ไซส์ที่ต้องการ</label>
                 <input id="swap-size" class="swal2-input" style="width:100%;margin:.25rem 0 .7rem;"
                        placeholder="เช่น L / 42">
                 <label style="font-weight:700;">เหตุผล</label>
                 <input id="swap-reason" class="swal2-input" style="width:100%;margin:.25rem 0 0;"
                        placeholder="เช่น รองเท้าคับ ใส่ไม่ได้">
               </div>`,
        showCancelButton: true,
        confirmButtonText: 'ส่งคำขอให้ครู', cancelButtonText: 'ยกเลิก',
        preConfirm: () => {
            const reason = document.getElementById('swap-reason')?.value?.trim();
            if (!reason) { Swal.showValidationMessage('กรุณาระบุเหตุผล'); return false; }
            return {
                partId: Number(document.getElementById('swap-part').value),
                size:   document.getElementById('swap-size')?.value?.trim() || null,
                reason
            };
        }
    });

    if (!result.isConfirmed) return;

    const { data, error } = await uniformApi.requestSwap(
        kit.kit_id, result.value.partId, result.value.size, result.value.reason);

    return error
        ? Swal.fire('ส่งไม่สำเร็จ', error.message, 'error')
        : Swal.fire('ส่งคำขอแล้ว', data?.message || 'ครูจะพิจารณาให้', 'success');
}
