// Badge System Module
// Handles all badge UI logic, data transformation, and component rendering

import { escapeHtml } from './utils.js';

export const BadgeSystem = {
    // Map badge name → emoji by keyword matching
    getBadgeIcon(badgeName = '') {
        const n = badgeName;
        if (n.includes('จิตอาสา'))                          return '🤝';
        if (n.includes('เวที') || n.includes('ดาวเด่น'))    return '🌟';
        if (n.includes('ดาวรุ่ง') || n.includes('พุ่ง'))   return '🚀';
        if (n.includes('มือใหม่') || n.includes('เดินทาง')) return '🎒';
        if (n.includes('ผู้ช่วยอาจารย์'))                   return '👨‍🏫';
        if (n.includes('สอบ') || n.includes('ทดสอบ'))       return '🏆';
        if (n.includes('รู้') || n.includes('ใฝ่'))         return '📚';
        if (n.includes('มาราธอน'))                          return '⏱️';
        if (n.includes('ตื่นเช้า') || n.includes('วิหค'))  return '🌅';
        if (n.includes('ชั่วโมง') || n.includes('ศิษย์เอก')) return '⏰';
        if (n.includes('สมาชิก'))                           return '👤';
        if (n.includes('สายฟ้า'))                           return '⚡';
        if (n.includes('อาจารย์รุ่นเยาว์'))                 return '🎓';
        return '🎵';
    },

    // Render a single badge card (reusable)
    renderBadgeCard(badgeData, options = {}) {
        const { size = 'medium', showProgress = false, tier = null } = options;
        const { badge_name, badge_icon: _rawIcon, rarity = 'common', badge_description } = badgeData;
        // ใช้ getBadgeIcon เป็น fallback ถ้า icon ว่างหรือเป็น '🏅'
        const badge_icon = (!_rawIcon || _rawIcon === '🏅')
            ? this.getBadgeIcon(badge_name)
            : _rawIcon;

        const sizeClass = {
            small: 'badge-card-small',
            medium: 'badge-card-medium',
            large: 'badge-card-large'
        }[size] || 'badge-card-medium';

        const rarityColor = this.getRarityColor(rarity);

        const tierSection = showProgress && tier ? `
            <div class="badge-tier-status">
                <span class="badge-tier-badge">${escapeHtml(tier.toUpperCase())}</span>
            </div>
        ` : '';

        return `
            <div class="badge-card ${sizeClass} badge-rarity-${rarity}" data-badge-name="${escapeHtml(badge_name)}">
                <div class="badge-card-inner">
                    <div class="badge-card-front">
                        <div class="badge-icon">${badge_icon}</div>
                        <div class="badge-name">${escapeHtml(badge_name)}</div>
                        ${tierSection}
                    </div>
                    <div class="badge-card-back">
                        <div class="badge-description">${escapeHtml(badge_description || '')}</div>
                        <div class="badge-rarity">
                            <span class="rarity-label">${escapeHtml(rarity)}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    // Render badge tier progression (bronze → silver → gold)
    renderTierProgression(badge, userProgress = {}) {
        const { badge_name, badge_progression_tiers = [] } = badge;
        const { [badge_name]: progress = {} } = userProgress;

        const tiers = ['bronze', 'silver', 'gold'];
        let tierHtml = '<div class="badge-tier-progress">';

        tiers.forEach((tierName, idx) => {
            const tierData = badge_progression_tiers.find(t => t.tier_name === tierName);
            const isEarned = progress.earned_tiers && progress.earned_tiers.includes(tierName);

            tierHtml += `
                <div class="tier ${isEarned ? 'earned' : 'locked'}" title="${escapeHtml(tierName)}">
                    ${tierData ? '★' : '☆'}
                </div>
            `;
        });

        tierHtml += '</div>';
        return tierHtml;
    },

    // Transform API data to UI-friendly format
    transformBadgeForUI(badgeData, userData = {}) {
        const {
            badge_name,
            badge_icon,
            badge_description,
            rarity,
            badge_progression_tiers
        } = badgeData;

        const userBadges = userData.userBadges || [];
        const isEarned = userBadges.some(ub => ub.badge_name === badge_name);

        return {
            name: badge_name,
            icon: badge_icon,
            description: badge_description,
            tiers: badge_progression_tiers || [],
            earned: isEarned,
            rarity: rarity || 'common',
            progress: userData.progress?.[badge_name] || {}
        };
    },

    // Batch render multiple badges (for gallery)
    renderBadgeGrid(badges, options = {}) {
        const { layout = 'grid', showStats = false, filterRarity = 'all' } = options;

        let filtered = badges;
        if (filterRarity !== 'all') {
            filtered = badges.filter(b => (b.rarity || 'common') === filterRarity);
        }

        const gridHtml = filtered.map(badge => this.renderBadgeCard(badge, { size: 'medium' })).join('');

        if (layout === 'grid') {
            return `<div class="badge-gallery-grid">${gridHtml}</div>`;
        } else if (layout === 'list') {
            return `<div class="badge-gallery-list">${gridHtml}</div>`;
        }
        return gridHtml;
    },

    // Calculate badge statistics
    calculateStats(allBadges, userBadges = []) {
        const totalAvailable = allBadges.length;
        const totalEarned = userBadges.length;
        const completionPct = totalAvailable > 0 ? Math.round((totalEarned / totalAvailable) * 100) : 0;

        const rarityCount = { common: 0, rare: 0, epic: 0, legendary: 0 };
        const rarityEarned = { common: 0, rare: 0, epic: 0, legendary: 0 };

        allBadges.forEach(badge => {
            const rarity = badge.rarity || 'common';
            rarityCount[rarity]++;
            if (userBadges.some(ub => ub.badge_name === badge.badge_name)) {
                rarityEarned[rarity]++;
            }
        });

        const rarest = allBadges
            .filter(b => userBadges.some(ub => ub.badge_name === b.badge_name))
            .sort((a, b) => {
                const rarityOrder = { legendary: 0, epic: 1, rare: 2, common: 3 };
                return rarityOrder[a.rarity || 'common'] - rarityOrder[b.rarity || 'common'];
            })[0];

        return {
            completion_pct: completionPct,
            total_earned: totalEarned,
            total_available: totalAvailable,
            rarest: rarest?.badge_name || null,
            most_common: this.getMostCommonRarity(allBadges),
            rarity_breakdown: rarityCount,
            rarity_earned: rarityEarned
        };
    },

    // Helper: Get rarity color
    getRarityColor(rarity) {
        const colors = {
            common: '#6b7280',
            rare: '#3b82f6',
            epic: '#a855f7',
            legendary: '#f59e0b'
        };
        return colors[rarity] || colors.common;
    },

    // Helper: Get most common rarity
    getMostCommonRarity(badges) {
        const counts = { common: 0, rare: 0, epic: 0, legendary: 0 };
        badges.forEach(b => {
            const rarity = b.rarity || 'common';
            counts[rarity]++;
        });
        return Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
    },

    // Helper: Format rarity for display
    formatRarity(rarity) {
        return rarity.charAt(0).toUpperCase() + rarity.slice(1);
    }
};
