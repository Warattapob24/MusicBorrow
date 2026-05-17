// config.js - Configuration and constants
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

export const SUPABASE_URL = 'https://qsbvitqxwgtmopjjuxin.supabase.co';
export const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFzYnZpdHF4d2d0bW9wamp1eGluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTExODMxNDksImV4cCI6MjA2Njc1OTE0OX0.7q2MR7ePBrZKMh08MlZDbeXbFWcoH3dZNgdzWGHOugY';

// FIX: Disable Supabase Web Locks API by providing an async no-op lock.
// The default Web Lock caused "Lock was released because another request stole it"
// errors when multiple tabs / DevTools / PWA windows are open simultaneously,
// which left the dashboard stuck on a loading spinner.
// `async` ensures the function always returns a Promise even if `fn` throws synchronously.
const noopLock = async (_name, _acquireTimeout, fn) => {
    return await fn();
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
        storageKey: 'supabase.auth.token',
        //lock: noopLock, // NOTE: disabled — noopLock causes refresh-token reuse → SIGNED_OUT on F5
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
    }
});
export const VAPID_PUBLIC_KEY = "BLne2K9Bbtft8pst66BwyfGilME7xh8BATwnlb8kqVLHkT11kPd6cEBQNJ5az3QAYkC1WEXYt87bRqQy8f8e6y8";

export const ICONS = {
    history: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M8.5 5.5a.5.5 0 0 0-1 0v3.354l-1.429 2.143a.5.5 0 1 0 .858.514l1.714-2.571A.5.5 0 0 0 8.5 8.5V5.5z"/><path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/><path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/></svg>`,
    award: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M8 0l1.669.864 1.858.282.842 1.68.833 1.692L12.64 7.5l.078 1.854-1.358 1.154-1.358 1.154.078 1.854L11.36 16l-1.833.282-1.858.864L8 16l-1.669-.864-1.858-.282-.842-1.68-.833-1.692L3.36 7.5l-.078-1.854 1.358-1.154L5.996 3.34.078 1.854 3.36 0 4.63.282l1.858-.864L8 0z"/><path d="M4 11.794V16l4-1 4 1v-4.206l-2.018.306L8 13.126 6.018 12.1 4 11.794z"/></svg>`,
    edit: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M12.854.146a.5.5 0 0 0-.707 0L10.5 1.793 14.207 5.5l1.647-1.646a.5.5 0 0 0 0-.708l-3-3zm.646 6.061L9.793 2.5 3.293 9H3.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.207l6.5-6.5zm-7.468 7.468A.5.5 0 0 1 6 13.5V13h-.5a.5.5 0 0 1-.5-.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.5-.5V10h-.5a.499.499 0 0 1-.175-.032l-.179.178a.5.5 0 0 0-.11.168l-2 5a.5.5 0 0 0 .65.65l5-2a.5.5 0 0 0 .168-.11l.178-.178z"/></svg>`,
    block: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M11.534 7.062c-1.258-1.258-2.91-1.92-4.534-1.92-1.623 0-3.275.662-4.534 1.92C1.206 8.32 1.002 9.91 1.002 11.5c0 1.59.204 3.18 1.466 4.438 1.258 1.258 2.91 1.92 4.534 1.92 1.623 0 3.275-.662 4.534-1.92C12.794 14.68 13 13.09 13 11.5c0-1.59-.204-3.18-1.466-4.438zM12 11.5c0 1.288-.162 2.524-.986 3.562-1.016 1.016-2.31 1.562-3.714 1.562-1.403 0-2.698-.546-3.714-1.562C2.162 14.024 2 12.788 2 11.5c0-1.288.162-2.524.986-3.562C4.002 6.924 5.297 6.38 6.7 6.38c1.403 0 2.698.546 3.714 1.562.824 1.038.986 2.274.986 3.562z"/><path d="M10.5 8.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z"/></svg>`,
    unblock: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M11.534 7.062c-1.258-1.258-2.91-1.92-4.534-1.92-1.623 0-3.275.662-4.534 1.92C1.206 8.32 1.002 9.91 1.002 11.5c0 1.59.204 3.18 1.466 4.438 1.258 1.258 2.91 1.92 4.534 1.92 1.623 0 3.275-.662 4.534-1.92C12.794 14.68 13 13.09 13 11.5c0-1.59-.204-3.18-1.466-4.438zM12 11.5c0 1.288-.162 2.524-.986 3.562-1.016 1.016-2.31 1.562-3.714 1.562-1.403 0-2.698-.546-3.714-1.562C2.162 14.024 2 12.788 2 11.5c0-1.288.162-2.524.986-3.562C4.002 6.924 5.297 6.38 6.7 6.38c1.403 0 2.698.546 3.714 1.562.824 1.038.986 2.274.986 3.562z"/></svg>`,
    deactivate: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854Z"/></svg>`,
    viewBadges: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M8 0.5l-1.92 1.92-2.38.34-1.72 2.16.55 2.62-1.5 2.16 2.38.34L8 15.5l1.92-1.92 2.38-.34 1.72-2.16-.55-2.62 1.5-2.16-2.38-.34L8 0.5z"/></svg>`,
    check: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/></svg>`,
    x: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/></svg>`
};

export const groupTranslations = {
    student: 'นักเรียนทั่วไป',
    club: 'สมาชิกชุมนุม',
    teacher: 'ครูอาจารย์',
    guest: 'บุคคลทั่วไป',
    resigned: 'ลาออก',
    graduated: 'จบการศึกษา',
    deactivated: 'ปิดใช้งาน'
};