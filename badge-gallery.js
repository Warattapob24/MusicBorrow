// Badge Gallery Module
// Handles badge gallery page rendering and interactions

import { badgesExt } from './api.js';
import { BadgeSystem } from './badge-system.js';
import { escapeHtml } from './utils.js';

export async function renderBadgeGallery(userId) {
    try {
        const [statsRes, progressRes, userBadgesRes] = await Promise.all([
            badgesExt.getGalleryStats(userId),
            badgesExt.getUserAchievementProgress(userId),
            badgesExt.getUserBadges(userId)
        ]);

        const stats = statsRes.data?.[0] || {};
        const progress = progressRes.data || [];
        const userBadges = userBadgesRes.data || [];

        // แปลง badges จาก user badges table (ข้อมูลจริง)
        const earnedBadges = userBadges.map(ub => ({
            badge_name: ub.badge_name,
            badge_icon: BadgeSystem.getBadgeIcon(ub.badge_name),
            badge_description: ub.badge_description || '',
            rarity: 'common'
        }));

        const statsWidget = renderStatsWidget(stats, earnedBadges.length);
        const filterBar = renderFilterBar();

        const earnedSection = earnedBadges.length > 0 ? `
            <div class="badge-section">
                <h3 class="section-title">เหรียญตราที่ได้รับ (${earnedBadges.length})</h3>
                <div class="badge-gallery-grid">
                    ${earnedBadges.map(b => BadgeSystem.renderBadgeCard(b, { size: 'medium' })).join('')}
                </div>
            </div>
        ` : `<div class="no-badges">ยังไม่มีเหรียญตราที่ได้รับ ลองยืมเครื่องดนตรีเพื่อปลดล็อค!</div>`;

        const progressSection = progress.length > 0 ? `
            <div class="badge-section">
                <h3 class="section-title">ความคืบหน้า Achievement</h3>
                <div class="badge-gallery-grid">
                    ${progress.filter(a => !a.unlocked).map(a => renderProgressCard(a)).join('')}
                </div>
            </div>
        ` : '';

        return `
            <div class="badge-gallery-page">
                <div class="badge-gallery-header">
                    <h2>🏅 แกลเลอรีเหรียญตรา</h2>
                    <p class="subtitle">สะสมเหรียญตราจากกิจกรรมการยืมเครื่องดนตรี</p>
                </div>

                ${statsWidget}

                <div class="badge-gallery-controls">
                    ${filterBar}
                </div>

                <div class="badge-gallery-content">
                    ${earnedSection}
                    ${progressSection}
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Error rendering badge gallery:', error);
        return '<div class="error" style="text-align:center; padding:2rem; color:var(--pico-del-color);">โหลดแกลเลอรีล้มเหลว กรุณาลองใหม่อีกครั้ง</div>';
    }
}

function renderStatsWidget(stats, earnedCount) {
    const {
        total_available = 0,
        completion_pct = 0,
        rarest_earned = null,
        collecting_streak = 0
    } = stats;

    const pct = total_available > 0 ? Math.round((earnedCount / total_available) * 100) : 0;

    return `
        <div class="badge-stats-widget">
            <div class="stat-item">
                <div class="stat-label">ความคืบหน้า</div>
                <div class="stat-number">${pct}%</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${pct}%"></div>
                </div>
            </div>
            <div class="stat-item">
                <div class="stat-label">เหรียญที่ได้รับ</div>
                <div class="stat-number">${earnedCount}${total_available > 0 ? `/${total_available}` : ''}</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">เหรียญหายากสุด</div>
                <div class="stat-value">${rarest_earned ? escapeHtml(rarest_earned) : 'ยังไม่มี'}</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">ยืมต่อเนื่อง</div>
                <div class="stat-number">${collecting_streak} วัน</div>
            </div>
        </div>
    `;
}

function renderFilterBar() {
    return `
        <div class="badge-filter-bar">
            <div class="filter-group">
                <label>กรองตามความหายาก:</label>
                <div class="filter-buttons">
                    <button class="filter-btn active" data-rarity="all">ทั้งหมด</button>
                    <button class="filter-btn" data-rarity="common">ธรรมดา</button>
                    <button class="filter-btn" data-rarity="rare">หายาก</button>
                    <button class="filter-btn" data-rarity="epic">Epic</button>
                    <button class="filter-btn" data-rarity="legendary">ตำนาน</button>
                </div>
            </div>
            <div class="filter-group">
                <label>เรียงตาม:</label>
                <select class="sort-select">
                    <option value="recent">ได้รับล่าสุด</option>
                    <option value="name">ชื่อ</option>
                    <option value="rarity">ความหายาก</option>
                </select>
            </div>
        </div>
    `;
}

function renderProgressCard(achievement) {
    const { achievement_name, condition_current = 0, condition_value = 1, reward_badge_name, rarity = 'common' } = achievement;
    const pct = Math.min(100, Math.round((condition_current / condition_value) * 100));

    return `
        <div class="badge-card badge-locked badge-rarity-${rarity}" data-badge-name="${escapeHtml(reward_badge_name || '')}">
            <div class="badge-card-inner">
                <div class="badge-card-front">
                    <div class="badge-icon locked-icon">🔒</div>
                    <div class="badge-name">${escapeHtml(reward_badge_name || 'ยังไม่ปลดล็อค')}</div>
                    <div class="badge-locked-label">ยังไม่ได้รับ</div>
                </div>
                <div class="badge-card-back">
                    <div class="badge-name">${escapeHtml(achievement_name)}</div>
                    <div class="condition-progress">
                        <div class="progress-text" style="font-size:0.65rem; color:var(--text-subtle);">${condition_current}/${condition_value}</div>
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${pct}%"></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

export function showBadgeDetailModal(badgeName, badgeData, achievements = []) {
    const { badge_icon = '🏅', badge_description = '', rarity = 'common' } = badgeData;

    const modalHtml = `
        <div class="modal-overlay" id="badge-detail-modal">
            <div class="modal-content">
                <button class="modal-close">&times;</button>
                <div class="modal-header">
                    <div class="badge-icon-large">${badge_icon}</div>
                    <h3>${escapeHtml(badgeName)}</h3>
                    <span class="badge-rarity-tag badge-rarity-${rarity}">${escapeHtml(rarity)}</span>
                </div>
                <div class="modal-body">
                    <div class="badge-desc-section">
                        <h4>รายละเอียด</h4>
                        <p>${escapeHtml(badge_description)}</p>
                    </div>
                </div>
            </div>
        </div>
    `;

    const container = document.getElementById('badge-gallery-container') || document.body;
    const modal = document.createElement('div');
    modal.innerHTML = modalHtml;
    container.appendChild(modal);

    const closeBtn = modal.querySelector('.modal-close');
    const overlay = modal.querySelector('.modal-overlay');
    const closeModal = () => modal.remove();
    closeBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

    return modal;
}

export function filterBadgesByRarity(badges, rarity) {
    if (rarity === 'all') return badges;
    return badges.filter(b => (b.rarity || 'common') === rarity);
}

export function setupBadgeGalleryEvents() {
    const container = document.getElementById('badge-gallery-container');
    if (!container) return;

    container.addEventListener('click', (e) => {
        if (e.target.classList.contains('filter-btn')) {
            container.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            filterGalleryDisplay(e.target.dataset.rarity);
        }
    });

    container.addEventListener('click', (e) => {
        const card = e.target.closest('.badge-card:not(.badge-locked)');
        if (card) {
            const badgeName = card.dataset.badgeName;
            const icon = card.querySelector('.badge-icon')?.textContent || '🏅';
            const desc = card.querySelector('.badge-description')?.textContent || '';
            showBadgeDetailModal(badgeName, { badge_icon: icon, badge_description: desc, rarity: 'common' });
        }
    });
}

function filterGalleryDisplay(rarity) {
    const cards = document.querySelectorAll('.badge-card');
    cards.forEach(card => {
        if (rarity === 'all') {
            card.style.display = '';
        } else {
            const cardRarity = card.className.match(/badge-rarity-(\w+)/)?.[1];
            card.style.display = cardRarity === rarity ? '' : 'none';
        }
    });
}
