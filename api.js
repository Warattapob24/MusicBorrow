/**
 * API Module
 * ศูนย์กลางเดียวที่ติดต่อกับ Supabase ตามหลักการ Strict Separation of Concerns
 */

import { supabase } from './config.js';

// ═══════════════════════════════════════════════════════════════
// 1. AUTH & USERS API
// ═══════════════════════════════════════════════════════════════

export const authApi = {
    /**
     * ออกจากระบบ
     */
    async signOut() {
        try {
            const { error } = await supabase.auth.signOut();
            if (error) throw error;
            return { error: null };
        } catch (error) {
            return { error };
        }
    }
};

export const users = {
    async getAll() {
        try {
            const { data, error } = await supabase.rpc('get_all_users');
            if (error) throw error;
            return { data: data || [], error: null };
        } catch (error) {
            return { data: [], error };
        }
    },
    async getBlocked() {
        try {
            const { data, error } = await supabase.rpc('admin_get_blocked_users');
            if (error) throw error;
            return { data: data || [], error: null };
        } catch (error) {
            return { data: [], error };
        }
    },
    async unblock(userId) {
        try {
            const { error } = await supabase
                .from('users')
                .update({ is_blocked: false, block_reason: null })
                .eq('id', userId);
            if (error) throw error;
            return { error: null };
        } catch (error) {
            return { error };
        }
    }
};

export const usersExt = {
    async updateProfile(userId, updateData) {
        try {
            const { error } = await supabase.from('users').update(updateData).eq('id', userId);
            if (error) throw error;
            return { error: null };
        } catch (error) {
            return { error };
        }
    },
    async uploadProfileImage(userId, file) {
        const filePath = `${userId}.jpg`;
        const { error: uploadError } = await supabase.storage.from('profile-images').upload(filePath, file, { upsert: true });
        if (uploadError) return { publicUrl: null, error: uploadError };
        const { data } = supabase.storage.from('profile-images').getPublicUrl(filePath);
        return { publicUrl: `${data.publicUrl}?t=${Date.now()}`, error: null };
    }
};

// ═══════════════════════════════════════════════════════════════
// 2. RAID & BOSSES API (Lobby System)
// ═══════════════════════════════════════════════════════════════

export const bossesApi = {
    async getAllBosses() {
        try {
            const { data, error } = await supabase.from('bosses').select('*').order('id');
            if (error) throw error;
            return { data: data || [], error: null };
        } catch (error) {
            return { data: [], error };
        }
    },
    /**
     * ดึงข้อมูลบอสที่เปิดให้สู้ในปัจจุบัน
     */
    async getActiveBosses() {
        try {
            const { data, error } = await supabase.from('bosses').select('*').eq('is_active', true).order('id');
            if (error) throw error;
            return { data: data || [], error: null };
        } catch (error) {
            return { data: [], error };
        }
    },
    /**
     * ดึงข้อมูล HP และ Stars ของผู้ใช้
     */
    async getUserHpAndStars(userId) {
        try {
            const { data, error } = await supabase.from('users').select('hp, stars').eq('id', userId).single();
            if (error) throw error;
            return { data, error: null };
        } catch (error) { 
            return { data: null, error }; 
        }
    },
    async submitVideoRaid(userId, bossId, videoUrl) {
        try {
            const { data, error } = await supabase.from('boss_requests').insert({
                student_id: userId, boss_id: bossId, video_url: videoUrl, status: 'pending'
            });
            if (error) throw error;
            return { data, error: null };
        } catch (error) {
            return { data: null, error };
        }
    },
    async getPendingRequests() {
        try {
            const { data, error } = await supabase
                .from('boss_requests')
                .select('*, users (first_name, last_name, prefix), bosses (title, reward_xp, reward_stars)')
                .eq('status', 'pending')
                .order('id', { ascending: true });
            if (error) throw error;
            return { data: data || [], error: null };
        } catch (error) {
            return { data: [], error };
        }
    },
    async reviewRequest(requestId, isApproved, studentId, rewardXp, rewardStars) {
        try {
            // 1. อัปเดตสถานะคำขอโดยตรง (RLS อนุญาต admin UPDATE)
            const newStatus = isApproved ? 'passed' : 'failed';
            const { error: upErr } = await supabase
                .from('boss_requests')
                .update({ status: newStatus })
                .eq('id', requestId);
            if (upErr) throw upErr;

            // 2. ถ้าผ่าน: ให้รางวัล XP+Stars ผ่าน SECURITY DEFINER function
            if (isApproved && studentId) {
                const { error: rewErr } = await supabase.rpc('award_boss_video_reward', {
                    p_student_id: studentId,
                    p_xp:         rewardXp   ?? 0,
                    p_stars:      rewardStars ?? 0
                });
                if (rewErr) throw rewErr;
            }
            return { error: null };
        } catch (error) {
            return { error };
        }
    },

    // ─── Admin CRUD ────────────────────────────────────────────────
    async createBoss(payload) {
        try {
            const { data, error } = await supabase
                .from('bosses')
                .insert([{
                    title:                  payload.title,
                    description:            payload.description || '',
                    reward_xp:              payload.reward_xp ?? 0,
                    reward_stars:           payload.reward_stars ?? 0,
                    required_practice_mins: payload.required_practice_mins ?? 0,
                    is_active:              payload.is_active ?? true
                }])
                .select()
                .single();
            if (error) throw error;
            return { data, error: null };
        } catch (error) {
            return { data: null, error };
        }
    },
    async updateBoss(id, payload) {
        try {
            const updates = {};
            ['title','description','reward_xp','reward_stars','required_practice_mins','is_active']
                .forEach(k => { if (payload[k] !== undefined) updates[k] = payload[k]; });
            const { data, error } = await supabase
                .from('bosses')
                .update(updates)
                .eq('id', id)
                .select()
                .single();
            if (error) throw error;
            return { data, error: null };
        } catch (error) {
            return { data: null, error };
        }
    },
    async deleteBoss(id) {
        try {
            const { error } = await supabase.from('bosses').delete().eq('id', id);
            if (error) throw error;
            return { error: null };
        } catch (error) {
            return { error };
        }
    },
    async toggleBossActive(id, isActive) {
        try {
            const { data, error } = await supabase
                .from('bosses')
                .update({ is_active: isActive })
                .eq('id', id)
                .select()
                .single();
            if (error) throw error;
            return { data, error: null };
        } catch (error) {
            return { data: null, error };
        }
    },
    /**
     * คัดลอกบอส: ดึงต้นฉบับมา insert ใหม่ พร้อมต่อท้ายชื่อด้วย " (สำเนา)"
     * และตั้ง is_active = false ไว้ก่อน เพื่อกันใช้งานพร้อมต้นฉบับ
     */
    async duplicateBoss(id) {
        try {
            const { data: src, error: e1 } = await supabase
                .from('bosses').select('*').eq('id', id).single();
            if (e1) throw e1;
            if (!src) throw new Error('ไม่พบบอสต้นฉบับ');
            const { id: _omit, created_at: _c, ...rest } = src;
            rest.title = (rest.title || 'บอส') + ' (สำเนา)';
            rest.is_active = false;
            const { data, error } = await supabase
                .from('bosses').insert([rest]).select().single();
            if (error) throw error;
            return { data, error: null };
        } catch (error) {
            return { data: null, error };
        }
    },
    /**
     * นับสถิติของบอสแต่ละตัว: เคยสู้กี่ครั้ง / ผ่าน / ตก
     * คืน Map<bossId, { total, passed, failed }> เพื่อใช้ render มินิสติมในตาราง
     */
    async getBossStats() {
        try {
            // รวมสถิติจาก 2 แหล่ง: boss_requests (วิดีโอ) + raid_participants (ปาร์ตี้)
            const [reqRes, raidRes] = await Promise.all([
                supabase.from('boss_requests').select('boss_id, status'),
                supabase.rpc('get_boss_raid_stats')
            ]);

            const map = {};

            // สถิติวิดีโอ
            (reqRes.data || []).forEach(row => {
                const key = String(row.boss_id);
                if (!map[key]) map[key] = { total: 0, passed: 0, failed: 0 };
                map[key].total += 1;
                if (row.status === 'passed' || row.status === 'approved') map[key].passed += 1;
                if (row.status === 'failed' || row.status === 'rejected')  map[key].failed += 1;
            });

            // สถิติ raid (ปาร์ตี้)
            (raidRes.data || []).forEach(row => {
                const key = String(row.boss_id);
                if (!map[key]) map[key] = { total: 0, passed: 0, failed: 0 };
                map[key].total  += Number(row.total)  || 0;
                map[key].passed += Number(row.passed) || 0;
                map[key].failed += Number(row.failed) || 0;
            });

            return { data: map, error: null };
        } catch (error) {
            return { data: {}, error };
        }
    }
};

export const raidApi = {
    async getBossQuests(bossId) {
        const { data, error } = await supabase.from('quests').select('*').eq('boss_id', bossId).order('created_at', { ascending: true });
        if (error) throw error;
        return data;
    },
    /**
     * สร้างห้อง Lobby สุ่มรหัส 4 หลัก
     */
    async createLobby(bossId, adminId) {
        // ใช้ A-Z, 2-9 ตามข้อกำหนด
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789';
        let roomCode = '';
        for (let i = 0; i < 4; i++) {
            roomCode += chars.charAt(Math.floor(Math.random() * chars.length));
        }

        const { data, error } = await supabase
            .from('raid_lobbies')
            .insert([{ boss_id: bossId, admin_id: adminId, room_code: roomCode, status: 'waiting' }])
            .select()
            .single();

        if (error) throw error;
        return data;
    },
    /**
     * นักเรียนเข้าร่วมห้องผ่าน Room Code
     */
    async joinLobby(userId, roomCode) {
        const { data, error } = await supabase.rpc('join_raid_lobby', {
            p_user_id: userId,
            p_room_code: roomCode.toUpperCase(),
        });
        if (error) throw error;
        return data; 
    },
    /**
     * ครูกดส่งผลการสอบรวดเดียวทั้งปาร์ตี้
     */
    async submitRaidResults(lobbyId, resultsArray) {
        const { error } = await supabase.rpc('process_raid_result', {
            p_lobby_id: lobbyId,
            p_results_json: resultsArray,
        });
        if (error) throw error;
        return true;
    },
    /**
     * Realtime Subscription แบบ Combined Channel เพื่อประหยัด Connection
     */
    subscribeToLobby(lobbyId, onParticipantsChange, onLobbyChange) {
        const channel = supabase.channel(`lobby-tracker-${lobbyId}`)
            .on('postgres_changes', { 
                event: '*', 
                schema: 'public', 
                table: 'raid_participants',
                filter: `lobby_id=eq.${lobbyId}` 
            }, payload => onParticipantsChange(payload))
            .on('postgres_changes', { 
                event: 'UPDATE', 
                schema: 'public', 
                table: 'raid_lobbies',
                filter: `id=eq.${lobbyId}` 
            }, payload => onLobbyChange(payload.new))
            .subscribe();

        // คืนค่าฟังก์ชัน Cleanup
        return () => {
            supabase.removeChannel(channel);
        };
    },
    async updateLobbyStatus(lobbyId, status) {
        const { data, error } = await supabase.from('raid_lobbies').update({ status }).eq('id', lobbyId).select().single();
        if (error) throw error;
        return data;
    },
    /**
     * ดึงชื่อ-นามสกุลของ user คนเดียว (ใช้ตอน Realtime INSERT ที่ไม่มี join data)
     */
    async getParticipantUser(userId) {
        const { data } = await supabase
            .from('users')
            .select('id, first_name, last_name')
            .eq('id', userId)
            .single();
        return data;
    },
    /**
     * ดึงรายชื่อผู้เข้าร่วม lobby (สำหรับแสดงในหน้านักเรียน)
     */
    async getLobbyParticipants(lobbyId) {
        const { data } = await supabase
            .from('raid_participants')
            .select('id, user_id, users(first_name, last_name)')
            .eq('lobby_id', lobbyId);
        return (data || []).map(p => ({
            user_id: p.user_id,
            name: p.users
                ? `${p.users.first_name || ''} ${p.users.last_name || ''}`.trim() || 'ไม่ทราบชื่อ'
                : 'ไม่ทราบชื่อ'
        }));
    },
    /**
     * ดึง raid_participants ทั้งหมดของ lobby พร้อม join users (ใช้ตอนเริ่มสอบเพื่อให้ชื่อครบ)
     */
    async getParticipantsWithUsers(lobbyId) {
        const { data, error } = await supabase
            .from('raid_participants')
            .select('*, users(first_name, last_name)')
            .eq('lobby_id', lobbyId);
        if (error) throw error;
        return data || [];
    },
    /**
     * ดึง lobby ที่นักเรียนอยู่ในปัจจุบัน (status: waiting หรือ raiding)
     */
    async getActiveRaidForUser(userId) {
        const { data } = await supabase
            .from('raid_participants')
            .select('*, raid_lobbies(id, room_code, status, boss_id, bosses(title))')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(10);
        // หา lobby ที่ยัง active (waiting หรือ raiding)
        return (data || []).find(p =>
            p.raid_lobbies?.status === 'waiting' || p.raid_lobbies?.status === 'raiding'
        ) || null;
    },
    /**
     * Subscribe เฉพาะ lobby status (สำหรับนักเรียนดู status card)
     * คืน cleanup function
     */
    subscribeToLobbyStatus(lobbyId, onChange) {
        const channel = supabase.channel(`student-raid-${lobbyId}`)
            .on('postgres_changes', {
                event: 'UPDATE', schema: 'public',
                table: 'raid_lobbies', filter: `id=eq.${lobbyId}`
            }, payload => onChange(payload.new))
            .subscribe();
        return () => supabase.removeChannel(channel);
    },
    /**
     * ดึงผลสอบของนักเรียนจาก lobby ที่ปิดแล้ว
     */
    async getMyRaidResult(lobbyId, userId) {
        const { data } = await supabase
            .from('raid_participants')
            .select('result_status, raid_lobbies(id, boss_id, status, bosses(title))')
            .eq('lobby_id', lobbyId)
            .eq('user_id', userId)
            .maybeSingle();
        return data;
    },
    /**
     * ดึงผลสอบล่าสุดของนักเรียน (lobby ปิดแล้ว + มี result จริง)
     * ใช้เป็น fallback กรณี realtime ไม่ทำงาน หรือเปิดหน้าหลังสอบแล้ว
     */
    async getLatestRaidResultForUser(userId) {
        const { data } = await supabase
            .from('raid_participants')
            .select('result_status, joined_at, raid_lobbies(id, boss_id, status, bosses(title))')
            .eq('user_id', userId)
            .in('result_status', ['passed', 'failed'])
            .order('joined_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        return data;
    },

    /**
     * ดึงประวัติการสอบบอส (ผ่าน/ตก) ทั้งหมดของบอสตัวนั้น สำหรับแสดงใน admin
     */
    async getBossExamHistory(bossId) {
        // รวมประวัติจาก 2 แหล่ง: offline exam (raid_participants) + video submission (boss_requests)
        const [raidRes, videoRes] = await Promise.all([
            supabase.from('raid_participants')
                .select('result_status, joined_at, users(first_name, last_name), raid_lobbies!inner(boss_id, status)')
                .eq('raid_lobbies.boss_id', bossId)
                .eq('raid_lobbies.status', 'closed')
                .in('result_status', ['passed', 'failed'])
                .order('joined_at', { ascending: false })
                .limit(50),
            supabase.from('boss_requests')
                .select('id, status, video_url, submitted_at, users(first_name, last_name)')
                .eq('boss_id', bossId)
                .in('status', ['passed', 'failed'])
                .order('submitted_at', { ascending: false })
                .limit(50)
        ]);
        const offline = (raidRes.data || []).map(r => ({
            type: 'offline',
            result_status: r.result_status,
            date: r.joined_at,
            name: r.users ? `${r.users.first_name || ''} ${r.users.last_name || ''}`.trim() : '—',
            video_url: null
        }));
        const video = (videoRes.data || []).map(r => ({
            type: 'video',
            result_status: r.status,
            date: r.submitted_at,
            name: r.users ? `${r.users.first_name || ''} ${r.users.last_name || ''}`.trim() : '—',
            video_url: r.video_url
        }));
        const merged = [...offline, ...video]
            .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
        return { data: merged, error: raidRes.error || videoRes.error };
    },
    /**
     * ดึงคลิปที่นักเรียนส่งสำหรับบอสตัวนั้น (ทุกสถานะ: pending/passed/failed)
     */
    async getMyVideoSubmissions(userId, bossId) {
        const { data, error } = await supabase
            .from('boss_requests')
            .select('id, status, video_url, submitted_at')
            .eq('student_id', userId)
            .eq('boss_id', bossId)
            .order('submitted_at', { ascending: false });
        return { data: data || [], error };
    },
    /**
     * ดึงสถิติส่วนตัวของนักเรียนสำหรับบอสตัวนั้น (รวมทั้ง offline + video)
     */
    async getMyBossStats(userId, bossId) {
        const [raidRes, videoRes] = await Promise.all([
            supabase.from('raid_participants')
                .select('result_status, raid_lobbies!inner(boss_id)')
                .eq('user_id', userId)
                .eq('raid_lobbies.boss_id', bossId)
                .in('result_status', ['passed', 'failed']),
            supabase.from('boss_requests')
                .select('status')
                .eq('student_id', userId)
                .eq('boss_id', bossId)
                .in('status', ['passed', 'failed'])
        ]);
        const raidPassed  = (raidRes.data  || []).filter(r => r.result_status === 'passed').length;
        const raidFailed  = (raidRes.data  || []).filter(r => r.result_status === 'failed').length;
        const videoPassed = (videoRes.data || []).filter(r => r.status === 'passed').length;
        const videoFailed = (videoRes.data || []).filter(r => r.status === 'failed').length;
        const passed = raidPassed + videoPassed;
        const failed = raidFailed + videoFailed;
        return { total: passed + failed, passed, failed };
    }
};

// ═══════════════════════════════════════════════════════════════
// 3. PUSH & NOTIFICATIONS API
// ═══════════════════════════════════════════════════════════════

export const pushApi = {
    /**
     * บันทึกหรืออัปเดตข้อมูล Push Subscription ลงฐานข้อมูล
     */
    async saveSubscription(userId, subscription) {
        try {
            const subJson = subscription.toJSON();
            const { error } = await supabase.rpc('register_push_subscription', {
                p_user_id: userId,
                p_endpoint: subJson.endpoint,
                p_p256dh: subJson.keys.p256dh,
                p_auth: subJson.keys.auth
            });
            if (error) throw error;
            return { error: null };
        } catch (error) {
            return { error };
        }
    }
};

export const notificationApi = {
    async triggerPush(userId, title, body = "") {
        try {
            const { data, error } = await supabase.functions.invoke('send-push', {
                body: { user_id: userId, title: title, body: body, url: "/", icon: "assets/logo.png" }
            });
            if (error) throw error;
            return { data, error: null };
        } catch (error) {
            return { data: null, error };
        }
    }
};

export const notifications = {
    async save(userId, title, body = '') {
        try {
            const { error } = await supabase.from('notifications').insert({ user_id: userId, title: title, body: body });
            if (error) throw error;
            return { error: null };
        } catch (error) { return { error }; }
    },
    async markAsRead(notificationIds) {
        try {
            const { error } = await supabase.from('notifications').update({ is_read: true }).in('id', notificationIds);
            if (error) throw error;
            return { error: null };
        } catch (error) { return { error }; }
    },
    async getUnreadCount(userId) {
        try {
            const { error, count } = await supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('is_read', false);
            if (error) throw error;
            return { count: count || 0, error: null };
        } catch (error) { return { count: 0, error }; }
    },
    async getUserNotifications(userId, limit = 20) {
        try {
            const { data, error } = await supabase.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(limit);
            if (error) throw error;
            return { data: data || [], error: null };
        } catch (error) { return { data: [], error }; }
    }
};

export const notificationsExt = {
    async getUnreadCount(userId) {
        return supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('is_read', false);
    },
    async getRecent(userId, limit = 20) {
        return supabase.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(limit);
    },
    async markAsRead(ids) {
        return supabase.from('notifications').update({ is_read: true }).in('id', ids);
    }
};

// ═══════════════════════════════════════════════════════════════
// 🔔 ADMIN NOTIFICATIONS API — alerts สำหรับผู้ดูแล (filter is_admin_alert=true)
// ═══════════════════════════════════════════════════════════════
export const adminNotifications = {
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
    async getUnreadCounts() {
        try {
            const { data, error } = await supabase.rpc('admin_unread_counts_by_category');
            if (error) throw error;
            return { data: data || [], error: null };
        } catch (error) {
            return { data: [], error };
        }
    },
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
    async acknowledge(notificationId) {
        try {
            const { error } = await supabase.rpc('admin_acknowledge_notification', { p_id: notificationId });
            if (error) throw error;
            return { error: null };
        } catch (error) {
            return { error };
        }
    },
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
    subscribeRealtime(onInsert) {
        const channel = supabase.channel('admin-notifications')
            .on('postgres_changes', {
                event: 'INSERT', schema: 'public', table: 'notifications',
                filter: 'is_admin_alert=eq.true'
            }, (payload) => { onInsert(payload.new); })
            .subscribe();
        return () => supabase.removeChannel(channel);
    }
};

// ═══════════════════════════════════════════════════════════════
// 🔄 ACCOUNT RECOVERY API
// ═══════════════════════════════════════════════════════════════
export const recoveryApi = {
    async list(status = 'pending') {
        try {
            const { data, error } = await supabase.rpc('admin_list_recovery_requests', {
                p_status: status === 'all' ? null : status
            });
            if (error) throw error;
            return { data: data || [], error: null };
        } catch (error) {
            return { data: [], error };
        }
    },
    async approve(requestId) {
        try {
            const { data, error } = await supabase.functions.invoke('approve-recovery', {
                body: { request_id: requestId }
            });
            if (error) {
                // 🔍 ดึง error body จาก response — supabase-js ไม่ extract message ให้
                let detailMsg = error.message;
                try {
                    if (error.context?.json) {
                        const body = await error.context.json();
                        if (body?.error) detailMsg = body.error;
                    } else if (error.context?.text) {
                        const text = await error.context.text();
                        try { const j = JSON.parse(text); if (j?.error) detailMsg = j.error; } catch { detailMsg = text; }
                    }
                } catch (_) {}
                throw new Error(detailMsg);
            }
            if (data?.error) throw new Error(data.error);
            return { data, error: null };
        } catch (error) {
            return { data: null, error };
        }
    },
    async reject(requestId, reason) {
        try {
            const { error } = await supabase.rpc('admin_reject_recovery_request', {
                p_id: requestId, p_reason: reason
            });
            if (error) throw error;
            return { error: null };
        } catch (error) {
            return { error };
        }
    }
};

// ═══════════════════════════════════════════════════════════════
// 4. INSTRUMENTS, BORROW & REPAIR API
// ═══════════════════════════════════════════════════════════════

export const instruments = {
    async getAvailable() {
        try {
            const { data, error } = await supabase.rpc('get_available_instruments');
            if (error) throw error;
            return { data: data || [], error: null };
        } catch (error) { return { data: [], error }; }
    },
    async getAll() {
        try {
            const { data, error } = await supabase.rpc('get_all_instruments');
            if (error) throw error;
            return { data: data || [], error: null };
        } catch (error) { return { data: [], error }; }
    },
    async getTypes() {
        try {
            const { data, error } = await supabase.from('instruments').select('type');
            if (error) throw error;
            const types = [...new Set(data.map(item => item.type).filter(Boolean))];
            return { data: types, error: null };
        } catch (error) { return { data: [], error }; }
    }
};

export const instrumentsExt = {
    async getAvailable() { return supabase.rpc('get_available_instruments'); },
    async getFavorite(userId) { return supabase.rpc('get_favorite_instrument', { p_user_id: userId }); },
    async getTypes() { return supabase.from('instruments').select('type').order('type'); },
    async updateStatus(instrumentId, status, condition) { return supabase.from('instruments').update({ status, condition }).eq('id', instrumentId); },
    async getScanDetails(instrumentId) { return supabase.rpc('get_instrument_scan_details', { p_instrument_id: instrumentId }); }
};

export const favorites = {
    async get(userId) {
        try {
            const { data, error } = await supabase.rpc('get_favorite_instrument', { p_user_id: userId });
            if (error) throw error;
            return { data: data || [], error: null };
        } catch (error) { return { data: [], error }; }
    }
};

export const borrow = {
    async getUserBorrowedItems(userId) {
        try {
            const { data, error } = await supabase.rpc('get_my_borrowed_items', { p_user_id: userId });
            if (error) throw error;
            return { data: data || [], error: null };
        } catch (error) { return { data: [], error }; }
    },
    async getHistory(userId = null) {
        try {
            const params = userId ? { p_user_id: userId } : {};
            const { data, error } = await supabase.rpc('get_detailed_borrow_history', params);
            if (error) throw error;
            return { data: data || [], error: null };
        } catch (error) { return { data: [], error }; }
    },
    async getLiveStatus() {
        try {
            const { data, error } = await supabase.rpc('admin_get_live_borrowing_status');
            if (error) throw error;
            return { data: data || [], error: null };
        } catch (error) { return { data: [], error }; }
    }
};

export const borrowExt = {
    async returnInstrument(instrumentId, userId, problemDescription = null) {
        try {
            const params = { p_instrument_id: Number(instrumentId), p_user_id: userId };
            if (problemDescription) params.p_problem_description = problemDescription;
            const { data, error } = await supabase.rpc('return_instrument_and_log_minutes', params);
            if (error) throw error;
            return { data, error: null };
        } catch (error) { return { data: null, error }; }
    },
    async borrowInstrumentAtomic(instrumentId, userId, isTakeHome, dueDate, parentAck, borrowType, eventId = null) {
        try {
            // borrowType ต้องไม่เป็น undefined เด็ดขาด — เดิมผู้เรียกบางจุดส่งไม่ครบ
            // ทำให้ RPC ได้ค่า NULL และ borrow_type ในฐานว่าง 4,035/4,036 แถว
            const resolvedType = borrowType || (isTakeHome ? 'take_home' : 'in_school');
            const { data, error } = await supabase.rpc('borrow_instrument_atomic', {
                p_instrument_id: parseInt(instrumentId),
                p_user_id: userId,
                p_is_take_home: isTakeHome,
                p_due_date: dueDate || null,
                p_parent_acknowledged: parentAck,
                p_borrow_type: resolvedType,
                p_event_id: eventId
            });
            if (error) throw error;
            return { data, error: null };
        } catch (error) { return { data: null, error }; }
    },
    async getMyBorrowedItems(userId) { return supabase.rpc('get_my_borrowed_items', { p_user_id: userId }); },
    async getUserHistory(userId) {
        return supabase.from('borrow_logs')
            .select('*, instruments(name)')
            .eq('student_id', userId)
            .order('borrow_timestamp', { ascending: false });
    }
};

export const repair = {
    async report(instrumentId, userId, problem) {
        try {
            const { error } = await supabase.from('repair_logs').insert({
                instrument_id: parseInt(instrumentId),
                reported_by_user_id: userId,
                problem_description: problem,
                repair_status: 'แจ้งซ่อม'
            });
            if (error) throw error;
            return { error: null };
        } catch (error) { return { error }; }
    },
    async getUserHistory(userId) {
        const [{ data: byUser }, { data: borrowIds }] = await Promise.all([
            supabase.from('repair_logs').select('*, instruments(name)').eq('reported_by_user_id', userId),
            supabase.from('borrow_logs').select('id').eq('student_id', userId)
        ]);
        const ids = (borrowIds || []).map(b => b.id).filter(Boolean);
        let byBorrows = [];
        if (ids.length) {
            const { data } = await supabase.from('repair_logs').select('*, instruments(name)').in('borrow_log_id', ids);
            byBorrows = data || [];
        }
        const seen = new Set();
        const data = [...(byUser || []), ...byBorrows].filter(r => !seen.has(r.id) && seen.add(r.id));
        data.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        return { data, error: null };
    }
};

// ═══════════════════════════════════════════════════════════════
// 5. GAMES, KNOWLEDGE, BADGES & RANKING API
// ═══════════════════════════════════════════════════════════════

export const games = {
    async saveSession(userId, gameName, startTime, endTime, duration, score) {
        try {
            const { error } = await supabase.from('game_sessions').insert({
                user_id: userId, game_name: gameName, start_time: startTime.toISOString(),
                end_time: endTime.toISOString(), duration_minutes: Math.round(duration), score: score
            });
            if (error) throw error;
            return { error: null };
        } catch (error) { return { error }; }
    },
    async savePracticeSession(userId, sessionType, duration) {
        try {
            const { error } = await supabase.from('practice_sessions').insert({
                user_id: userId, session_type: sessionType, duration_minutes: Math.round(duration)
            });
            if (error) throw error;
            return { error: null };
        } catch (error) { return { error }; }
    }
};

export const gamesExt = {
    async saveSession(userId, gameName, score, duration, startTime) {
        return supabase.from('game_sessions').insert({ user_id: userId, game_name: gameName, score: score || 0, duration_minutes: duration, start_time: startTime });
    },
    async incrementXpAuto(userId, actionType, duration, score, gameName) {
        return supabase.rpc('increment_user_xp_auto', { p_user_id: userId, p_action_type: actionType, p_duration_minutes: duration, p_game_score: score, p_game_name: gameName });
    },
    async getLeaderboard(gameName, userId) {
        return supabase.rpc('get_game_leaderboard', { p_game_name: gameName, p_user_id: userId });
    },
    async getUserSessions(userId, limit = 15) {
        return supabase.from('game_sessions')
            .select('game_name, score, duration_minutes, start_time, created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(limit);
    }
};

export const knowledge = {
    async getByType(instrumentType) {
        try {
            const { data, error } = await supabase.rpc('get_knowledge_links_by_type', { p_instrument_type: instrumentType });
            if (error) throw error;
            return { data: data || [], error: null };
        } catch (error) { return { data: [], error }; }
    },
    async getTypes() {
        try {
            const { data, error } = await supabase.from('knowledge_links').select('instrument_type');
            if (error) throw error;
            const types = [...new Set(data.map(item => item.instrument_type).filter(Boolean))];
            return { data: types, error: null };
        } catch (error) { return { data: [], error }; }
    }
};

export const knowledgeExt = {
    async rewardVideoWatch(userId, videoTitle, minutes) {
        return supabase.rpc('reward_video_watch_time', { p_user_id: userId, p_video_title: videoTitle, p_minutes: minutes });
    },
    async rewardUserVideoWatch(userId, videoId) {
        return supabase.rpc('reward_user_video_watch', { p_user_id: userId, p_video_id: videoId });
    },
    async getLinksByType(type) {
        return supabase.rpc('get_knowledge_links_by_type', { p_instrument_type: type });
    },
    async getTypes() {
        return supabase.from('knowledge_links').select('instrument_type');
    },
    async suggestLink(data) {
        return supabase.from('knowledge_links').insert(data);
    },

    // ── NEW: TikTok-style learning feed ──────────────────────────
    /** Returns approved links + the caller's own pending links + (admin sees all). */
    async getVisibleLinks(instrumentType = null) {
        return supabase.rpc('get_visible_knowledge_links', { p_instrument_type: instrumentType });
    },
    /** Submit a clip for admin review (any authenticated role). */
    async submitClip({ title, url, instrumentType, caption = null }) {
        return supabase.rpc('submit_knowledge_link', {
            p_title: title,
            p_url: url,
            p_instrument_type: instrumentType,
            p_caption: caption,
        });
    },
    /** Heartbeat: add learning minutes (server caps at min/max from system_settings). */
    async addLearningMinutes(minutes, instrumentType = null, knowledgeLinkId = null) {
        return supabase.rpc('add_learning_minutes', {
            p_minutes: minutes,
            p_instrument_type: instrumentType,
            p_knowledge_link_id: knowledgeLinkId,
        });
    },
    /** Per-instrument-type learning history for the current user. */
    async getLearningHistory(limit = 50) {
        return supabase.rpc('get_user_learning_history', { p_limit: limit });
    },
    /** Individual clip-viewing sessions with clip title for the current user. */
    async getClipHistory(userId, limit = 15) {
        return supabase.from('learning_sessions')
            .select('instrument_type, minutes_added, exp_awarded, created_at, knowledge_links(title)')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(limit);
    },
};

// System settings — used by both student (read multiplier) and admin (update)
export const settingsApi = {
    async get(key) {
        return supabase.rpc('get_system_setting', { p_key: key });
    },
    async update(key, value) {
        return supabase.rpc('update_system_setting', { p_key: key, p_value: String(value) });
    },
};

// ─────────────────────────────────────────────────────────────────────────────
// 🔔 Notification system — scheduled notifications + dispatcher + announcements
// ─────────────────────────────────────────────────────────────────────────────

export const scheduledNotificationsApi = {
    /** Admin: create a scheduled notification (one-time or recurring) */
    async create({ title, body, scheduledAt, targetGroup = 'all', repeatType = 'once', repeatConfig = null }) {
        return supabase.rpc('admin_create_scheduled_notification', {
            p_title: title, p_body: body,
            p_scheduled_at: scheduledAt instanceof Date ? scheduledAt.toISOString() : scheduledAt,
            p_target_group: targetGroup,
            p_repeat_type: repeatType,
            p_repeat_config: repeatConfig,
        });
    },
    async update(id, fields) {
        return supabase.rpc('admin_update_scheduled_notification', {
            p_id: id,
            p_title: fields.title ?? null,
            p_body: fields.body ?? null,
            p_scheduled_at: fields.scheduledAt
                ? (fields.scheduledAt instanceof Date ? fields.scheduledAt.toISOString() : fields.scheduledAt)
                : null,
            p_target_group: fields.targetGroup ?? null,
            p_repeat_type: fields.repeatType ?? null,
            p_repeat_config: fields.repeatConfig ?? null,
            p_is_active: fields.isActive ?? null,
        });
    },
    async remove(id) { return supabase.rpc('admin_delete_scheduled_notification', { p_id: id }); },
    async list() { return supabase.rpc('admin_list_scheduled_notifications'); },
    /** Admin: send an announcement immediately (no schedule) */
    async announceNow({ title, body, targetGroup = 'all' }) {
        return supabase.rpc('admin_send_announcement_now', {
            p_title: title, p_body: body, p_target_group: targetGroup,
        });
    },
    /** Anyone: trigger the dispatcher (server enforces admin / auth checks where needed) */
    async dispatch() { return supabase.rpc('dispatch_due_notifications'); },
    /** Anyone: emit due-date reminders (idempotent, dedup'd in DB) */
    async dispatchDueDateReminders() { return supabase.rpc('dispatch_due_date_reminders'); },
};

// Admin-only: review pending knowledge links
export const adminKnowledgeApi = {
    async listAll() {
        return supabase.from('knowledge_links').select('*').order('created_at', { ascending: false });
    },
    async listPending() {
        return supabase.from('knowledge_links').select('*').eq('is_approved', false).order('created_at', { ascending: false });
    },
    async review(linkId, approve) {
        return supabase.rpc('admin_review_knowledge_link', { p_link_id: linkId, p_approve: approve });
    },
};

export const badges = {
    async getUserBadges(userId) {
        try {
            const { data, error } = await supabase.from('badges').select('badge_name, badge_description').eq('user_id', userId);
            if (error) throw error;
            return { data: data || [], error: null };
        } catch (error) { return { data: [], error }; }
    },
    async getDefinitions() {
        try {
            const { data, error } = await supabase.from('badge_definitions').select('badge_name, badge_icon');
            if (error) throw error;
            return { data: data || [], error: null };
        } catch (error) { return { data: [], error }; }
    },
    async award(userId, badgeName, description) {
        try {
            const { error } = await supabase.from('badges').insert({ user_id: userId, badge_name: badgeName, badge_description: description });
            if (error) throw error;
            return { error: null };
        } catch (error) { return { error }; }
    },
    async checkAndAward(userId) {
        try {
            const { data, error } = await supabase.rpc('check_and_award_new_badges', { p_user_id: userId });
            if (error) throw error;
            return { data: data || [], error: null };
        } catch (error) { return { data: [], error }; }
    }
};

export const badgesExt = {
    async checkAndAward(userId, logId) {
        return supabase.rpc('check_new_badges_after_borrow', { p_user_id: userId, p_log_id: logId });
    },
    async getDefinitions() {
        return supabase.from('badge_definitions').select('badge_name, badge_icon');
    },
    async getUserBadges(userId) {
        return supabase.from('badges').select('badge_name, badge_description').eq('user_id', userId);
    },
    async getBadgeWithProgression(badgeName) {
        const [defs, tiers] = await Promise.all([
            supabase.from('badge_definitions').select('*').eq('badge_name', badgeName),
            supabase.from('badge_progression_tiers').select('*').eq('badge_name', badgeName)
        ]);
        return { definition: defs?.data?.[0], tiers: tiers?.data || [], error: defs?.error || tiers?.error || null };
    },
    async getAvailableBadges() {
        const { data, error } = await supabase.from('badge_definitions').select('*').order('badge_name');
        return { data: data || [], error };
    },
    async getUserAchievementProgress(userId) {
        return supabase.rpc('get_user_achievement_progress', { p_user_id: userId });
    },
    async getGalleryStats(userId) {
        return supabase.rpc('get_badge_gallery_stats', { p_user_id: userId });
    }
};

export const rankings = {
    async getClubPractice(userId) {
        try {
            const { data, error } = await supabase.rpc('get_club_practice_ranking', { p_user_id: userId });
            if (error) throw error;
            return { data: data || [], error: null };
        } catch (error) { return { data: [], error }; }
    },
    async getClassPractice(userId) {
        try {
            const { data, error } = await supabase.rpc('get_class_practice_ranking', { p_user_id: userId });
            if (error) throw error;
            return { data: data || [], error: null };
        } catch (error) { return { data: [], error }; }
    }
};

export const rankingsExt = {
    async getClubRanking(userId) { return supabase.rpc('get_club_practice_ranking', { p_user_id: userId }); },
    async getClassRanking(userId) { return supabase.rpc('get_class_practice_ranking', { p_user_id: userId }); }
};

export const statsApi = {
    async getHomeStats(userId) {
        return Promise.all([
            supabase.rpc('get_my_borrowed_items', { p_user_id: userId }),
            supabase.rpc('get_user_borrow_history', { p_user_id: userId }),
            supabase.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(6),
            supabase.from('users').select('xp').eq('id', userId).single(),
            supabase.from('badges').select('id', { count: 'exact', head: true }).eq('user_id', userId),
            supabase.from('game_sessions').select('game_name, score, duration_minutes').eq('user_id', userId).order('score', { ascending: false })
        ]);
    },
    async getGamificationStats(userId) {
        return Promise.all([
            supabase.from('users').select('*').eq('id', userId).single(),
            supabase.rpc('get_user_borrow_history', { p_user_id: userId }),
            supabase.from('badges').select('id', { count: 'exact' }).eq('user_id', userId),
            supabase.from('game_sessions').select('game_name, score, duration_minutes').eq('user_id', userId),
            supabase.from('users').select('id, xp, student_group, class_level').order('xp', { ascending: false })
        ]);
    }
};

// ═══════════════════════════════════════════════════════════════
// 6. ADMIN & DASHBOARD API
// ═══════════════════════════════════════════════════════════════

export const admin = {
    async getDashboardStats(instrumentType = 'all') {
        try {
            const { data, error } = await supabase.rpc('get_admin_dashboard_stats', { p_instrument_type: instrumentType });
            if (error) throw error;
            return { data, error: null };
        } catch (error) { return { data: null, error }; }
    }
};

export const adminDashboard = {
    async getStats() {
        try {
            // ✨ ยิง Request ไปยัง Supabase 2 เส้นพร้อมกัน (Parallel) เพื่อความรวดเร็ว
            const [statsRes, kpiRes] = await Promise.all([
                supabase.rpc('get_admin_dashboard_stats', { p_instrument_type: null }),
                supabase.rpc('get_admin_kpis')
            ]);

            // ตรวจสอบ Error ของทั้ง 2 Request
            if (statsRes.error) throw statsRes.error;
            if (kpiRes.error) throw kpiRes.error;

            // ผสม (Merge) ข้อมูลทั้ง 2 ชุดเข้าด้วยกันเป็น Object เดียว
            const mergedData = {
                ...(statsRes.data || {}),
                ...(kpiRes.data || {})
            };

            return { data: mergedData, error: null };
        } catch (error) { 
            console.error("Error fetching admin stats:", error);
            return { data: null, error }; 
        }
    },
    async getPendingBorrowRequests() {
        try {
            const { data, error } = await supabase.rpc('get_recent_approval_requests');
            if (error) throw error;
            return { data: data || [], error: null };
        } catch (error) { return { data: [], error }; }
    },
    async getActiveBorrows() {
        try {
            const { data, error } = await supabase.rpc('admin_get_live_borrowing_status');
            if (error) throw error;
            return { data: data || [], error: null };
        } catch (error) { return { data: [], error }; }
    },
    async getBorrowHistory() {
        try {
            const { data, error } = await supabase.rpc('get_detailed_borrow_history');
            if (error) throw error;
            return { data: data || [], error: null };
        } catch (error) { return { data: [], error }; }
    },
    async processBorrowRequest(logId, isApproved) {
        try {
            const { error } = await supabase.rpc('admin_process_borrow_request', { p_log_id: Number(logId), p_is_approved: isApproved });
            if (error) throw error;
            return { error: null };
        } catch (error) { return { error }; }
    },
    /**
     * Force-return an instrument WITHOUT awarding XP / practice minutes.
     * The new RPC is in MIGRATION_SOFT_BLOCK_AND_FORCE_RETURN.sql.
     * If that migration hasn't been applied yet, fall back to the legacy RPC
     * so the button keeps working — but warn so the admin notices.
     */
    async forceReturn(logId) {
        try {
            let { error } = await supabase.rpc('admin_force_return_no_reward', { p_log_id: Number(logId) });
            if (error && /could not find the function/i.test(error.message || '')) {
                console.warn('[api] admin_force_return_no_reward not found — falling back to legacy RPC. Run MIGRATION_SOFT_BLOCK_AND_FORCE_RETURN.sql.');
                ({ error } = await supabase.rpc('admin_force_return_instrument', { p_log_id: Number(logId) }));
            }
            if (error) throw error;
            return { error: null };
        } catch (error) { return { error }; }
    },
    // [Refactored] ดึงข้อมูลแจ้งซ่อมโดยตรงจาก Table พร้อม Join ข้อมูลที่จำเป็น
    async getRepairRequests() {
        try {
            const { data, error } = await supabase
                .from('repair_logs')
                .select(`
                    id,
                    instrument_id,
                    reported_by_user_id,
                    problem_description,
                    repair_status,
                    repair_notes,
                    repair_cost,
                    created_at,
                    instruments ( name, condition, status ),
                    users!reported_by_user_id ( first_name, last_name )
                `)
                // เลือกเฉพาะรายการที่ยังซ่อมไม่เสร็จเพื่อแสดงในหน้า Overview
                .in('repair_status', ['แจ้งซ่อม', 'รอซ่อม', 'กำลังซ่อม'])
                .order('created_at', { ascending: false });

            if (error) throw error;

            // Map ข้อมูลให้ตรงกับโครงสร้างที่ UI ต้องการใช้งาน
            const formattedData = data.map(row => ({
                id: row.id,
                repair_id: row.id,
                log_id: row.id, // รองรับ Legacy ID mapping
                instrument_id: row.instrument_id,
                instrument_name: row.instruments?.name || 'ไม่ทราบชื่อ',
                student_id: row.reported_by_user_id,
                reporter_name: row.users ? `${row.users.first_name || ''} ${row.users.last_name || ''}`.trim() : 'ไม่ระบุ',
                problem_description: row.problem_description,
                repair_status: row.repair_status,
                repair_notes: row.repair_notes,
                repair_cost: row.repair_cost,
                report_date: row.created_at,
                created_at: row.created_at
            }));

            return { data: formattedData, error: null };
        } catch (error) { 
            console.error('[API] Error fetching repair logs:', error);
            return { data: [], error }; 
        }
    },
    async getRepairHistory() {
        try {
            const { data, error } = await supabase.rpc('admin_get_all_repair_history');
            if (error) throw error;
            return { data: data || [], error: null };
        } catch (error) { return { data: [], error }; }
    },
    async updateRepair(repairId, fields) {
        try {
            const { error } = await supabase.rpc('admin_update_repair', {
                p_repair_id: Number(repairId), 
                p_status: fields.repair_status, 
                p_notes: fields.repair_notes || null, // ✅ ป้องกัน undefined
                p_cost: fields.repair_cost || 0       // ✅ ป้องกัน undefined
            });
            if (error) throw error;
            return { error: null };
        } catch (error) { return { error }; }
    },
    async getAllUsers() {
        try {
            const { data, error } = await supabase.rpc('get_all_users');
            if (error) throw error;
            return { data: data || [], error: null };
        } catch (error) { return { data: [], error }; }
    },
    /**
     * Soft-block a user: they can still log in and read the dashboard, but
     * cannot interact with anything, and their XP gain is paused for `hours`
     * (default 24). practice_minutes / learning_minutes still accrue.
     * Falls back to the legacy `block_user` RPC if the new one isn't deployed.
     */
    async blockUser(userId, reason, hours = 24) {
        try {
            let { data, error } = await supabase.rpc('admin_soft_block_user', {
                p_user_id: userId, p_reason: reason, p_hours: hours
            });
            if (error && /could not find the function/i.test(error.message || '')) {
                console.warn('[api] admin_soft_block_user not found — falling back to legacy block_user. Run MIGRATION_SOFT_BLOCK_AND_FORCE_RETURN.sql for full features.');
                ({ data, error } = await supabase.rpc('block_user', { p_user_id: userId, p_reason: reason }));
            }
            if (error) throw error;
            return { data, error: null };
        } catch (error) { return { error }; }
    },
    async unblockUser(userId) {
        try {
            let { error } = await supabase.rpc('admin_unblock_user', { p_user_id: userId });
            if (error && /could not find the function/i.test(error.message || '')) {
                console.warn('[api] admin_unblock_user not found — falling back to direct UPDATE.');
                ({ error } = await supabase.from('users').update({ is_blocked: false, block_reason: null, exp_blocked_until: null }).eq('id', userId));
            }
            if (error) throw error;
            return { error: null };
        } catch (error) { return { error }; }
    },
    async updateUser(payload) {
        try {
            const { error } = await supabase.rpc('update_user_profile_by_admin', payload);
            if (error) throw error;
            return { error: null };
        } catch (error) { return { error }; }
    },
    async getUserById(userId) {
        try {
            const { data, error } = await supabase.from('users').select('*').eq('id', userId).single();
            if (error) throw error;
            return { data, error: null };
        } catch (error) { return { data: null, error }; }
    },
    async getAllInstruments() {
        try {
            const { data, error } = await supabase.rpc('get_all_instruments');
            if (error) throw error;
            return { data: data || [], error: null };
        } catch (error) { return { data: [], error }; }
    },
    async addInstrument(fields) {
        try {
            const { error } = await supabase.from('instruments').insert([fields]);
            if (error) throw error;
            return { error: null };
        } catch (error) { return { error }; }
    },
    async updateInstrument(payload) {
        try {
            const { error } = await supabase.rpc('admin_update_instrument', payload);
            if (error) throw error;
            return { error: null };
        } catch (error) { return { error }; }
    },
    async deleteInstrument(instrumentId) {
        try {
            const { error } = await supabase.rpc('admin_delete_instrument', { p_instrument_id: Number(instrumentId) });
            if (error) throw error;
            return { error: null };
        } catch (error) { return { error }; }
    },
    async getBorrowCountsByType() {
        try {
            const { data, error } = await supabase.rpc('get_borrow_counts_by_type');
            if (error) throw error;
            return { data: data || [], error: null };
        } catch (error) { return { data: [], error }; }
    },
    async getBorrowTimeline(totalMinutes, intervalMinutes) {
        try {
            const { data, error } = await supabase.rpc('get_borrow_status_by_type_over_time', {
                total_history_minutes: totalMinutes, interval_minutes: intervalMinutes
            });
            if (error) throw error;
            return { data: data || [], error: null };
        } catch (error) { return { data: [], error }; }
    },
    async addXPFromBadge(userId, xpAmount) {
        try {
            const { error } = await supabase.rpc('add_user_xp', {
                p_user_id: userId, p_xp_amount: xpAmount, p_reason: 'ได้รับเหรียญตรา (Badge Granted)'
            });
            if (error) throw error;
            return { error: null };
        } catch (error) { return { error }; }
    },
    async getHeatmapData() {
        return supabase.rpc('get_borrow_heatmap');
    },
    async getLeaderboards() {
        return supabase.rpc('get_admin_leaderboards');
    },
    async getCategoryDetails(type) {
        return supabase.rpc('get_instrument_ranks_by_type', { p_type: type });
    },
    /**
     * 🛠️ ยืนยันการซ่อมเสร็จสิ้นและคืนสภาพเครื่อง
     */
    async completeRepair(repairId, instrumentId, fields) {
        try {
            const { error } = await supabase.rpc('admin_complete_repair', {
                p_repair_id: Number(repairId),
                p_instrument_id: Number(instrumentId),
                p_status: fields.repair_status || 'ตรวจสอบแล้วปกติ',
                p_notes: fields.repair_notes || '',
                p_cost: Number(fields.repair_cost) || 0
            });
            if (error) throw error;
            return { error: null };
        } catch (error) {
            return { error };
        }
    }
};

export const adminExt = {
    async getUsers() { return supabase.from('admin_users_with_activity').select('*').order('first_name', { ascending: true }); },
    async updateUserGroup(userId, group) { return supabase.from('users').update({ student_group: group }).eq('id', userId); },
    async getClubRankings() { return supabase.rpc('get_club_practice_ranking'); },
    async getClassRankings() { return supabase.rpc('get_class_practice_ranking'); },
    async adjustUserXp(userId, amount, activityName, adminId) {
        return supabase.rpc('admin_adjust_xp', { p_user_id: userId, p_amount: amount, p_activity_name: activityName, p_admin_id: adminId });
    },
    async getKnowledgeLinks() { return supabase.from('knowledge_links').select('*').order('created_at', { ascending: false }); },
    async updateKnowledgeStatus(id, isApproved) { return supabase.from('knowledge_links').update({ is_approved: isApproved }).eq('id', id); },
    async deleteKnowledgeLink(id) { return supabase.from('knowledge_links').delete().eq('id', id); },
    async addKnowledgeLink(data) { return supabase.from('knowledge_links').insert(data); },
    async updateKnowledgeLink(id, data) { return supabase.from('knowledge_links').update(data).eq('id', id); },
    async getSystemSettings() { return supabase.from('system_settings').select('*').order('key'); },
    async upsertSystemSettings(payload) { return supabase.from('system_settings').upsert(payload, { onConflict: 'key' }); },
    async getXpRules() { return supabase.from('xp_event_rules').select('*').order('id'); },
    async getXpRuleById(id) { return supabase.from('xp_event_rules').select('*').eq('id', id).single(); },
    async deleteXpRule(id) { return supabase.from('xp_event_rules').delete().eq('id', id); },
    async addXpRule(data) { return supabase.from('xp_event_rules').insert(data); },
    async updateXpRule(id, data) { return supabase.from('xp_event_rules').update(data).eq('id', id); },
    async getBadgeDefinitions() { return supabase.from('badge_definitions').select('*').order('created_at'); },
    async getBadgeDefinitionByName(name) { return supabase.from('badge_definitions').select('badge_description').eq('badge_name', name).single(); },
    async deleteBadgeDefinition(id) { return supabase.from('badge_definitions').delete().eq('id', id); },
    async addBadgeDefinition(data) { return supabase.from('badge_definitions').insert(data); },
    async getUserBadges(userId) { return supabase.from('badges').select('id, badge_name, badge_description').eq('user_id', userId); },
    async awardBadge(userId, badgeName, description) { return supabase.from('badges').insert({ user_id: userId, badge_name: badgeName, badge_description: description }); },
    async removeBadge(badgeId) { return supabase.from('badges').delete().eq('id', badgeId); },
    async getInstrumentBorrowLogs(instrumentId) { return supabase.from('borrow_logs').select('*').eq('instrument_id', instrumentId); },
    async getUserBorrowLogs(userId) { return supabase.from('borrow_logs').select('*, instruments(name, type)').eq('student_id', userId).order('borrow_timestamp', { ascending: false }); },
    async getUserGameSessions(userId) { return supabase.from('game_sessions').select('*').eq('user_id', userId); },
    async getUserLearningSessions(userId) { return supabase.from('learning_sessions').select('*, knowledge_links(title)').eq('user_id', userId); },
    async getUserRepairLogs(userId) {
        const [{ data: byUser }, { data: borrowIds }] = await Promise.all([
            supabase.from('repair_logs').select('*, instruments(name)').eq('reported_by_user_id', userId),
            supabase.from('borrow_logs').select('id').eq('student_id', userId)
        ]);
        const ids = (borrowIds || []).map(b => b.id).filter(Boolean);
        let byBorrows = [];
        if (ids.length) {
            const { data } = await supabase.from('repair_logs').select('*, instruments(name)').in('borrow_log_id', ids);
            byBorrows = data || [];
        }
        const seen = new Set();
        const data = [...(byUser || []), ...byBorrows].filter(r => !seen.has(r.id) && seen.add(r.id));
        data.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        return { data, error: null };
    },
    async uploadInstrumentImage(file) {
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `inst-${Date.now()}.${fileExt}`;
            const { error } = await supabase.storage.from('instrument-images').upload(fileName, file);
            if (error) throw error;
            const { data } = supabase.storage.from('instrument-images').getPublicUrl(fileName);
            return { publicUrl: data.publicUrl, error: null };
        } catch (error) { return { publicUrl: null, error }; }
    },
    async triggerYearlyReset() { return supabase.rpc('trigger_yearly_reset'); },
    async resetAllPracticeTimes() { return supabase.rpc('admin_reset_all_practice_times'); },
    async signOut() { return supabase.auth.signOut(); },
    async toggleUserDeactivation(userId, shouldDeactivate) { return supabase.from('users').update({ student_group: shouldDeactivate ? 'deactivated' : 'student' }).eq('id', userId); },
    async getAllUsers() { return supabase.from('users').select('*').order('first_name'); },
    setupRealtime(callbacks) {
        return supabase.channel('oad-admin-realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, callbacks.onUsers)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'borrow_logs' }, callbacks.onBorrow)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'repair_logs' }, callbacks.onRepair)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'knowledge_links' }, callbacks.onKnowledge)
            .subscribe();
    },
    removeRealtime(channel) { if (channel) supabase.removeChannel(channel); }
};

export const realtimeApi = {
    subscribeStudentDashboard(userId, callback) {
        return supabase.channel(`student-rt-${userId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'borrow_logs' }, callback)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, callback)
            .subscribe();
    },
    unsubscribe(channel) {
        if (channel) supabase.removeChannel(channel);
    }
};

export const studentLoopsApi = {
    async saveLoop(title, bpm, padSequence, googleDriveId) {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('ไม่ได้เข้าสู่ระบบ');
            const { data, error } = await supabase.from('student_loops').insert({
                user_id: user.id,
                title,
                bpm,
                pad_sequence: padSequence,
                google_drive_id: googleDriveId
            }).select().single();
            if (error) throw error;
            return { data, error: null };
        } catch (error) {
            return { data: null, error };
        }
    },
    async getFeed(limit = 30) {
        try {
            const { data, error } = await supabase.from('student_loops')
                .select('*, users(first_name, last_name, prefix)')
                .order('created_at', { ascending: false })
                .limit(limit);
            if (error) throw error;
            return { data: data || [], error: null };
        } catch (error) {
            return { data: [], error };
        }
    },
    async getLoopById(loopId) {
        try {
            const { data, error } = await supabase.from('student_loops')
                .select('*, users(first_name, last_name, prefix)')
                .eq('id', loopId)
                .single();
            if (error) throw error;
            return { data, error: null };
        } catch (error) {
            return { data: null, error };
        }
    },
    async deleteLoop(loopId) {
        try {
            const { error } = await supabase.from('student_loops').delete().eq('id', loopId);
            if (error) throw error;
            return { error: null };
        } catch (error) {
            return { error };
        }
    }
};
// ═══════════════════════════════════════════════════════════════════════════
// 🎭 EVENTS — งานที่ครูเปิด (Phase 3)
// ═══════════════════════════════════════════════════════════════════════════
const _wrap = async (fn) => {
    try {
        const { data, error } = await fn();
        if (error) throw error;
        return { data, error: null };
    } catch (error) { return { data: null, error }; }
};

export const eventsApi = {
    getOpen()               { return _wrap(() => supabase.rpc('get_open_events')); },
    getSummary(eventId)     { return _wrap(() => supabase.rpc('get_event_summary', { p_event_id: eventId })); },
    create({ name, eventDate, startAt = null, endAt = null, returnDueAt = null,
             activityType = 'performance', location = null,
             needsInstrument = false, needsUniform = false,
             openTo = 'club', showInCalendar = true,
             status = 'open', remindBefore = [1440, 120] }) {
        return _wrap(() => supabase.rpc('admin_create_event', {
            p_name: name, p_event_date: eventDate,
            p_start_at: startAt, p_end_at: endAt, p_return_due_at: returnDueAt,
            p_activity_type: activityType, p_location: location,
            p_needs_instrument: needsInstrument, p_needs_uniform: needsUniform,
            p_open_to: openTo, p_show_in_calendar: showInCalendar,
            p_status: status, p_remind_before: remindBefore
        }));
    },
    setStatus(eventId, status) {
        return _wrap(() => supabase.rpc('admin_set_event_status',
            { p_event_id: eventId, p_status: status }));
    },
    setReminders(eventId, minutes) {
        return _wrap(() => supabase.rpc('admin_set_event_reminders',
            { p_event_id: eventId, p_minutes: minutes }));
    },
    // 📅 ตารางกิจกรรม (ซ้อม / ค่าย / ออกงาน / ประชุม)
    schedule(days = 60) {
        return _wrap(() => supabase.rpc('get_activity_schedule', { p_from: null, p_days: days }));
    },
    calendarToken()      { return _wrap(() => supabase.rpc('admin_get_calendar_token')); },
    // ซิงก์เข้าปฏิทิน Google เดิมของโรงเรียน (ผ่าน Calendar API ไม่ใช่ ICS)
    gcalStatus()         { return _wrap(() => supabase.rpc('admin_gcal_status')); },
    gcalSync()           { return _wrap(() => supabase.functions.invoke('gcal-sync')); },
    resetCalendarToken() { return _wrap(() => supabase.rpc('admin_reset_calendar_token')); },
    close(eventId, note = null) {
        return _wrap(() => supabase.rpc('admin_close_event', { p_event_id: eventId, p_note: note }));
    },
    list() {
        return _wrap(() => supabase.from('events').select('*').order('event_date', { ascending: false }));
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// 🎺 SECTIONS — กลุ่มเครื่องของวง (Phase 2)
// ═══════════════════════════════════════════════════════════════════════════
export const sectionsApi = {
    list()                  { return _wrap(() => supabase.from('sections').select('*').order('sort_order')); },
    listTypeMapping()       { return _wrap(() => supabase.rpc('admin_list_type_sections')); },
    setTypeSection(type, sectionId) {
        return _wrap(() => supabase.rpc('admin_set_type_section', { p_type: type, p_section_id: sectionId }));
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// 🎖 STAFF — หัวหน้าวง / กลุ่มเครื่อง / งาน / ฝ่ายเสื้อผ้า (Phase 4)
//    สิทธิ์: อ่านในขอบเขตตน + เขียนได้เฉพาะใบตรวจ ไม่มีสิทธิ์คืน/บล็อกใคร
// ═══════════════════════════════════════════════════════════════════════════
export const staffApi = {
    myScopes()              { return _wrap(() => supabase.rpc('get_my_staff_scopes')); },
    getOutstanding(eventId = null) {
        return _wrap(() => supabase.rpc('staff_get_outstanding', { p_event_id: eventId }));
    },
    submitReport({ targetKind, finding, eventId = null, subjectId = null,
                   targetId = null, targetLabel = null, note = null, photoUrl = null }) {
        return _wrap(() => supabase.rpc('staff_submit_report', {
            p_target_kind: targetKind, p_finding: finding, p_event_id: eventId,
            p_subject_id: subjectId, p_target_id: targetId, p_target_label: targetLabel,
            p_note: note, p_photo_url: photoUrl
        }));
    },
    listReports(onlyOpen = true) {
        let q = supabase.from('staff_reports').select('*').order('created_at', { ascending: false });
        if (onlyOpen) q = q.is('teacher_ack_at', null);
        return _wrap(() => q);
    },
    ackReport(reportId)     { return _wrap(() => supabase.rpc('admin_ack_staff_report', { p_report_id: reportId })); },
    grant(userId, scopeType, scopeValue = null) {
        return _wrap(() => supabase.from('staff_roles')
            .upsert({ user_id: userId, scope_type: scopeType, scope_value: scopeValue, is_active: true },
                    { onConflict: 'user_id,scope_type,scope_value' }));
    },
    revoke(roleId)          { return _wrap(() => supabase.from('staff_roles').update({ is_active: false }).eq('id', roleId)); },
    listAll()               { return _wrap(() => supabase.from('staff_roles').select('*, users(prefix, first_name, last_name)').eq('is_active', true)); }
};

// ═══════════════════════════════════════════════════════════════════════════
// 👔 UNIFORMS — ชุดวงโยธวาทิต 60 ชุด (Phase 6)
// ═══════════════════════════════════════════════════════════════════════════
export const uniformApi = {
    scanKit(qr, eventId = null) {
        return _wrap(() => supabase.rpc('get_kit_scan_details', { p_qr: qr, p_event_id: eventId }));
    },
    checkout(eventId, kitId, studentId, partIds) {
        return _wrap(() => supabase.rpc('uniform_checkout', {
            p_event_id: eventId, p_kit_id: kitId, p_student_id: studentId, p_part_ids: partIds
        }));
    },
    returnPart(checkoutId, partId, condition, note = null) {
        return _wrap(() => supabase.rpc('uniform_return_part', {
            p_checkout_id: checkoutId, p_part_id: partId, p_condition: condition, p_note: note
        }));
    },
    getOutstanding(eventId)  { return _wrap(() => supabase.rpc('get_uniform_outstanding', { p_event_id: eventId })); },
    requestSwap(kitId, partId, wantSize, reason) {
        return _wrap(() => supabase.rpc('uniform_request_swap', {
            p_kit_id: kitId, p_part_id: partId, p_want_size: wantSize, p_reason: reason
        }));
    },
    approveSwap(requestId, replacementPartId) {
        return _wrap(() => supabase.rpc('admin_approve_swap', {
            p_request_id: requestId, p_replacement_part_id: replacementPartId
        }));
    },
    listSwapRequests(status = 'pending') {
        return _wrap(() => supabase.from('uniform_swap_requests')
            .select('*, users!uniform_swap_requests_requester_id_fkey(prefix, first_name, last_name)')
            .eq('status', status).order('created_at', { ascending: false }));
    },
    listKits()              { return _wrap(() => supabase.from('uniform_kits').select('*').order('kit_no')); },

    // ── จัดการชุด (Phase 7)
    setTypes()              { return _wrap(() => supabase.from('uniform_set_types').select('*').order('sort_order')); },
    adminListKits(setTypeId = null) {
        return _wrap(() => supabase.rpc('admin_list_kits', { p_set_type_id: setTypeId }));
    },
    adminListPartTypes()    { return _wrap(() => supabase.rpc('admin_list_part_types')); },
    assignKit(kitId, studentId) {
        return _wrap(() => supabase.rpc('admin_assign_kit', { p_kit_id: kitId, p_student_id: studentId }));
    },
    claimKit(qr)            { return _wrap(() => supabase.rpc('claim_kit', { p_qr: qr })); },

    // ── วงจรเจ้าของชุด (Phase 8)
    releaseKit(kitId, reason = null) {
        return _wrap(() => supabase.rpc('admin_release_kit', { p_kit_id: kitId, p_reason: reason }));
    },
    transferKit(kitId, studentId, reason = null) {
        return _wrap(() => supabase.rpc('admin_transfer_kit', {
            p_kit_id: kitId, p_new_student_id: studentId, p_reason: reason }));
    },
    releaseInactiveKits()   { return _wrap(() => supabase.rpc('admin_release_inactive_kits')); },
    kitHistory(kitId)       { return _wrap(() => supabase.rpc('admin_kit_history', { p_kit_id: kitId })); },

    // ── ฝั่งนักเรียน: เลือกชุดเองจากรายการ ไม่ต้องสแกน
    availableKits(setTypeId = null) {
        return _wrap(() => supabase.rpc('get_available_kits', { p_set_type_id: setTypeId }));
    },
    selectMyKit(kitId)      { return _wrap(() => supabase.rpc('select_my_kit', { p_kit_id: kitId })); },
    myKit()                 { return _wrap(() => supabase.rpc('get_my_kit')); },

    // ── รายงาน + ล็อกกันลงเบอร์มั่ว (Phase 9)
    sizeReport(setTypeId = null) {
        return _wrap(() => supabase.rpc('admin_uniform_size_report', { p_set_type_id: setTypeId }));
    },
    damagedList(setTypeId = null) {
        return _wrap(() => supabase.rpc('admin_uniform_damaged', { p_set_type_id: setTypeId }));
    },
    setPartCondition(partId, condition) {
        return _wrap(() => supabase.rpc('admin_set_part_condition', { p_part_id: partId, p_condition: condition }));
    },
    getSelfSelect()         { return _wrap(() => supabase.rpc('get_uniform_self_select')); },
    setSelfSelect(on)       { return _wrap(() => supabase.rpc('admin_set_uniform_self_select', { p_on: on })); },
    lockKit(kitId, selectable) {
        return _wrap(() => supabase.rpc('admin_lock_kit', { p_kit_id: kitId, p_selectable: selectable }));
    },
    // ผูกกับหน้าจัดการผู้ใช้ — ดึงจาก uniform_kits แหล่งเดียว ไม่เก็บซ้ำใน users
    userKits()              { return _wrap(() => supabase.rpc('admin_user_kits')); },
    setPartSizes(items)     { return _wrap(() => supabase.rpc('admin_set_part_sizes', { p_items: items })); },
    // สต๊อกรายไซส์ — "โรงเรียนมีเสื้อเบอร์ 8 อยู่กี่ตัว"
    // เป็นแหล่งเดียวของทั้งตัวเลือกไซส์และจำนวนที่มีจริง
    sizeStock(setTypeId = null) {
        return _wrap(() => supabase.rpc('admin_size_stock', { p_set_type_id: setTypeId }));
    },
    setSizeStock(partTypeId, rows) {
        return _wrap(() => supabase.rpc('admin_set_size_stock', {
            p_part_type_id: partTypeId, p_rows: rows
        }));
    },
    createKits(setTypeId, count) {
        return _wrap(() => supabase.rpc('admin_create_kits', { p_set_type_id: setTypeId, p_count: count }));
    },
    addPartType({ setTypeId, code, nameTh, prefix, icon = null, isRequired = true, sizeOptions = [] }) {
        return _wrap(() => supabase.rpc('admin_add_part_type', {
            p_set_type_id: setTypeId, p_code: code, p_name_th: nameTh,
            p_prefix: prefix, p_icon: icon, p_is_required: isRequired,
            p_size_options: sizeOptions
        }));
    },
    retirePartType(partTypeId) {
        return _wrap(() => supabase.rpc('admin_retire_part_type', { p_part_type_id: partTypeId }));
    },
    syncKitParts(setTypeId = null) {
        return _wrap(() => supabase.rpc('admin_sync_kit_parts', { p_set_type_id: setTypeId }));
    },
    listParts(kitId = null) {
        let q = supabase.from('uniform_parts').select('*, uniform_part_types(code, name_th, icon, sort_order)');
        if (kitId) q = q.eq('kit_id', kitId);
        return _wrap(() => q.order('id'));
    },
    setPartSize(partId, size) {
        return _wrap(() => supabase.from('uniform_parts').update({ size }).eq('id', partId));
    }
};
