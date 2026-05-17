/**
 * utils.js — Pure helper functions
 *
 * Rules:
 *   - No DOM mutations beyond what the function explicitly documents
 *   - No Supabase calls
 *   - No side-effects on import
 */

// ─────────────────────────────────────────────
// String helpers
// ─────────────────────────────────────────────

/**
 * Escape HTML special characters to prevent XSS.
 */
export function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

/**
 * Translate a student-group key to Thai.
 */
export function translateGroup(groupKey) {
    const map = {
        student:    'นักเรียนทั่วไป',
        club:       'สมาชิกชุมนุม',
        teacher:    'ครูอาจารย์',
        guest:      'บุคคลทั่วไป',
        resigned:   'ลาออก',
        graduated:  'จบการศึกษา',
        deactivated:'ปิดใช้งาน',
    };
    return map[groupKey] || groupKey || 'N/A';
}

// ─────────────────────────────────────────────
// Media URL parsing
// ─────────────────────────────────────────────

/**
 * Parse a video/playlist URL and return metadata for rendering.
 * Returns null for unrecognised URLs.
 */
export function parseMediaUrl(url) {
    if (!url) return null;

    // YouTube individual video
    const videoPatterns = [
        /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
        /(?:https?:\/\/)?youtu\.be\/([a-zA-Z0-9_-]{11})/,
        /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
        /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    ];
    for (const pattern of videoPatterns) {
        const m = url.match(pattern);
        if (m?.[1]) {
            return {
                type: 'video',
                thumbnailUrl: `https://i.ytimg.com/vi/${m[1]}/mqdefault.jpg`,
                originalUrl: url,
            };
        }
    }

    // YouTube playlist
    const plMatch = url.match(/(?:https?:\/\/)?(?:www\.)?youtube\.com\/playlist\?list=([a-zA-Z0-9_-]+)/);
    if (plMatch?.[1]) {
        return {
            type: 'playlist',
            thumbnailUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSIjNjA2MDYwIj48cGF0aCBkPSJNMjIgN2gtMTJ2LTJoMTJ2MnptMi00aC0xNmMtMS4xMDUgMC0yIC44OTUtMiAydjEwYzAgMS4xMDUuODk1IDIgMiAyaDE2YzEuMTA1IDAgMi0uODk1IDItMnYtMTBjMC0xLjEwNS0uODk1LTItMi0yem0wIDEyaC0xNnYtMTBoMTZ2MTB6bS0xNC05aC0ydjJoMnYtNnptMCA0aC0ydjJoMnYtMnptMCA0aC0ydjJoMnYtMnoiLz48L3N2Zz4=',
            originalUrl: url,
        };
    }

    // Facebook video / reel / share
    if (/(?:https?:\/\/)?(?:www\.)?(?:facebook\.com\/(?:watch|video|reel|share)|fb\.watch)/.test(url)) {
        return {
            type: 'facebook',
            thumbnailUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJ3aGl0ZSI+PHBhdGggZD0iTTIyLDEyYzAtNS41Mi00LjQ4LTEwLTEwLTEwUzIsNi40OCwyLDEyczQuNDgsMTAsMTAsMTBjNS4wOCwwLDkuMjktMy44MSw5Ljg5LTguNzVoLTQuMDd2My4xM2g0LjE3Yy0wLjQ4LDIuNzEtMi4yNCw0Ljg3LTUuNjUsNC44N2MtMy4zMSwwLTYtMi42OS02LTZzMi42OS02LDYtNmMxLjY1LTAuMDEsMy4xOSwwLjc5LDQuMjQsMi4wNUwxOC4zNiw0LjVjLTEuNTEtMS4zOS0zLjU4LTIuMjUtNS43Ni0yLjI1QzYuNDgsMi4yNSwyLjI1LDYuNDgsMi4yNSwxMmMwLDUuNTEsNC4yMyw5Ljc1LDkuNzUsOS43NWM1LjQ3LDAsOS43NS00LjI5LDkuNzUtOS43NVoiIHN0eWxlPSJmaWxsOiMxODc3ZjI7Ii8+PC9zdmc+',
            originalUrl: url,
        };
    }

    // TikTok
    if (/(?:https?:\/\/)?(?:www\.)?tiktok\.com\//.test(url)) {
        return {
            type: 'tiktok',
            thumbnailUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIGhlaWdodD0iNDhweCIgd2lkdGg9IjQ4cHgiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iIzAwMDAwMCI+PHBhdGggZD0iTTEyIDJjNS41MjMgMCAxMCA0LjQ3NyAxMCAxMFMtNC40NzcgMTAtMTAgMTBTMiAxNy41MjMgMiAxMiA2LjQ3NyAyIDEyIDJ6bTUtMi4yNWMwIDEuMjQtLjQ5MiAyLjM3LTEuMjkyIDMuMjEtLjgyIDEuMDEyLTEuOTkyIDEuNjA1LTMuMjYgMS42MDVoLTIuMTM4VjE2LjdjMCAuNDU1LS4zNjguODI1LS44MjMuODI1SDcuNDhjLS40NTYgMC0uODIzLS4zNy0uODI0LS44MjVWOC41NjRoLTIuMTM4Yy0uNDU1IDAtLjgyLS4zNjYtLjgyLS44MnYtMS42OWMwLS40NTQgLjM2NS0uODIgLjgyLS44Mmg1LjE4NmMuNDU1IDAgLjgyLjM2Ni44Mi44MnY2LjI0YzEuODUtLjEwNiAzLjQyNS0xLjQ1IDMuOTg4LTMuMjM3YTQuNDIzIDQuNDIzIDAgMCAwIC4xNjYtMS4yOThWNC45MmMwLS40NTYgLjM3LS44MjYuODI0LS44MjZoMS42NDhjLjQ1NSAwIC44MjQuMzcuODI0LjgyNnY1Ljc1eiIvPjwvc3ZnPg==',
            originalUrl: url,
        };
    }

    return null;
}

// ─────────────────────────────────────────────
// Borrow-history status helpers
// ─────────────────────────────────────────────

/**
 * Returns a display status object for a borrow-log row.
 * Handles force-return, repair, take-home approval states, and overdue.
 */
export function getHistoryStatus(log) {
    if (log.is_force_returned) {
        return { text: 'บังคับคืน', badgeClass: 'status-rejected' };
    }
    if (log.latest_repair_status) {
        const map = {
            'แจ้งซ่อม':           { text: 'แจ้งซ่อม',    badgeClass: 'status-waiting' },
            'กำลังซ่อม':          { text: 'กำลังซ่อม',   badgeClass: 'status-repairing' },
            'ซ่อมเสร็จสิ้น':      { text: 'ซ่อมเสร็จ',   badgeClass: 'status-completed' },
            'ไม่สามารถซ่อมได้':   { text: 'ซ่อมไม่ได้',  badgeClass: 'status-cannot-repair' },
        };
        return map[log.latest_repair_status] || { text: log.latest_repair_status, badgeClass: 'status-default' };
    }
    if (log.problem_description) {
        return { text: 'แจ้งซ่อมแล้ว', badgeClass: 'status-damaged' };
    }
    if (!log.return_timestamp) {
        if (log.is_take_home) {
            if (log.approval_status === 'pending')  return { text: 'รออนุมัติ',       badgeClass: 'status-waiting' };
            if (log.approval_status === 'approved') return { text: 'อนุมัติ (ยังไม่คืน)', badgeClass: 'status-borrowing' };
            if (log.approval_status === 'rejected') return { text: 'ถูกปฏิเสธ',       badgeClass: 'status-rejected' };
        }
        return { text: 'ยังไม่คืน', badgeClass: 'status-borrowing' };
    }
    return { text: 'คืนแล้ว', badgeClass: 'status-completed' };
}

export function getRawHistoryStatus(log) {
    if (log.problem_description) return 'repair';
    if (!log.return_timestamp) {
        if (log.is_take_home) {
            if (log.approval_status === 'pending')  return 'take_home_pending';
            if (log.approval_status === 'approved') return 'borrowed';
            if (log.approval_status === 'rejected') return 'take_home_rejected';
        }
        return 'borrowed';
    }
    return 'returned';
}

// ─────────────────────────────────────────────
// Safe event listener
// ─────────────────────────────────────────────

/**
 * Attach an event listener only if the element exists.
 * Accepts a CSS selector string or an HTMLElement.
 */
export function addSafeEventListener(selectorOrElement, eventType, callback) {
    const el = typeof selectorOrElement === 'string'
        ? document.querySelector(selectorOrElement)
        : selectorOrElement;
    if (el) el.addEventListener(eventType, callback);
}