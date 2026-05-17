// ═══════════════════════════════════════════════════════════════════════════
// 🛠️ ADMIN NOTIFICATIONS — STEP 04: API Helper Patch
// ═══════════════════════════════════════════════════════════════════════════
// 📍 Apply: เปิด api.js → หา section `export const notifications = { ... }`
//          → เพิ่ม object `adminNotifications` ต่อท้าย (ไม่แตะของเดิม)
// ⚠️ อย่า copy-paste replace ทั้งไฟล์ — ให้ append เฉพาะ block ใหม่นี้
// ═══════════════════════════════════════════════════════════════════════════

// ─── EXPORT ใหม่: เพิ่มในไฟล์ api.js หลัง `export const notifications = {...};` ───

export const adminNotifications = {
    /**
     * ดึงรายการ admin alerts ของ admin คนปัจจุบัน
     * @param {Object} opts - filter options
     * @param {string[]} opts.categories - กรองตาม category (e.g. ['security', 'operation'])
     * @param {string[]} opts.severities - กรองตาม severity (e.g. ['critical', 'warning'])
     * @param {boolean} opts.unreadOnly - แสดงเฉพาะที่ยังไม่อ่าน (default: false)
     * @param {number} opts.limit - default 50
     */
    async list(opts = {}) {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('ไม่ได้ login');

            let query = supabase.from('notifications')
                .select('id, title, body, category, severity, metadata, is_read, created_at, acknowledged_by, acknowledged_at')
                .eq('user_id', user.id)
                .eq('is_admin_alert', true)
                .order('created_at', { ascending: false })
                .limit(opts.limit || 50);

            if (opts.categories?.length) query = query.in('category', opts.categories);
            if (opts.severities?.length) query = query.in('severity', opts.severities);
            if (opts.unreadOnly)         query = query.eq('is_read', false);

            const { data, error } = await query;
            if (error) throw error;
            return { data: data || [], error: null };
        } catch (error) {
            return { data: [], error };
        }
    },

    /**
     * คืน count แยกตาม category + severity — สำหรับ dropdown badge
     * @returns {Array<{category, severity, cnt}>}
     */
    async getUnreadCounts() {
        try {
            const { data, error } = await supabase.rpc('admin_unread_counts_by_category');
            if (error) throw error;
            return { data: data || [], error: null };
        } catch (error) {
            return { data: [], error };
        }
    },

    /**
     * คืน total unread count (รวมทุก category)
     */
    async getTotalUnread() {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return { count: 0, error: null };

            const { count, error } = await supabase.from('notifications')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', user.id)
                .eq('is_admin_alert', true)
                .eq('is_read', false);

            if (error) throw error;
            return { count: count || 0, error: null };
        } catch (error) {
            return { count: 0, error };
        }
    },

    /**
     * acknowledge (กดรับทราบ) 1 notification
     */
    async acknowledge(notificationId) {
        try {
            const { error } = await supabase.rpc('admin_acknowledge_notification', { p_id: notificationId });
            if (error) throw error;
            return { error: null };
        } catch (error) {
            return { error };
        }
    },

    /**
     * acknowledge ทั้งหมด (mark all as read)
     */
    async acknowledgeAll() {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('ไม่ได้ login');

            const { error } = await supabase.from('notifications')
                .update({ is_read: true, acknowledged_by: user.id, acknowledged_at: new Date().toISOString() })
                .eq('user_id', user.id)
                .eq('is_admin_alert', true)
                .eq('is_read', false);

            if (error) throw error;
            return { error: null };
        } catch (error) {
            return { error };
        }
    },

    /**
     * Realtime subscription — รับ notification ใหม่แบบ live
     * @param {Function} onInsert - callback (row) => void
     * @returns unsubscribe function
     */
    subscribeRealtime(onInsert) {
        const channel = supabase.channel('admin-notifications')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'notifications',
                filter: 'is_admin_alert=eq.true'
            }, (payload) => {
                onInsert(payload.new);
            })
            .subscribe();

        return () => supabase.removeChannel(channel);
    }
};

// ─── End of admin_notifications patch ───────────────────────────────────────

/* ═══════════════════════════════════════════════════════════════════════════
   📝 IMPORT ใน admin-dashboard.js — แก้ import line ที่บรรทัด 7
   ═══════════════════════════════════════════════════════════════════════════
   เปลี่ยน:
       import { adminDashboard as api, adminExt, authApi, bossesApi, raidApi,
                instrumentsExt, notifications, adminKnowledgeApi,
                scheduledNotificationsApi } from './api.js';
   เป็น:
       import { adminDashboard as api, adminExt, authApi, bossesApi, raidApi,
                instrumentsExt, notifications, adminKnowledgeApi,
                scheduledNotificationsApi, adminNotifications } from './api.js';
   ═══════════════════════════════════════════════════════════════════════════ */
