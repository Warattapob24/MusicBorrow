// Badge Gallery Module
// Handles badge gallery page rendering and interactions

import { badgesExt } from './api.js';
import { BadgeSystem } from './badge-system.js';
import { escapeHtml } from './utils.js';

export async function renderBadgeGallery(userId) {
    try {
        const [badgesRes, statsRes, progressRes, userBadgesRes] = await Promise.all([
            badgesExt.getAvailableBadges(),
            badgesExt.getGalleryStats(userId),
            badgesExt.getUserAchievementProgress(userId),
            badgesExt.getUserBadges(userId)
        ]);

        const badges = badgesRes.data || [];
        const stats = statsRes.data || {};
        const progress = progressRes.data || [];
        const userBadges = userBadgesRes.data || [];

        const statsWidget = renderStatsWidget(stats);
        const filterBar = renderFilterBar();
        const earnedBadges = badges.filter(b => userBadges.some(ub => ub.badge_name === b.badge_name));
        const lockedBadges = badges.filter(b => !userBadges.some(ub => ub.badge_name === b.badge_name));

        const earnedSection = earnedBadges.length > 0 ? `
            <div class="badge-section">
                <h3 class="section-title">Earned Badges (${earnedBadges.length})</h3>
                <div class="badge-gallery-grid">
                    ${earnedBadges.map(b => BadgeSystem.renderBadgeCard(b, { size: 'medium' })).join('')}
                </div>
            </div>
        ` : '<div class="no-badges">No badges earned yet. Keep playing to unlock badges!</div>';

        const lockedSection = lockedBadges.length > 0 ? `
            <div class="badge-section">
                <h3 class="section-title">Available Badges (${lockedBadges.length})</h3>
                <div class="badge-gallery-grid">
                    ${lockedBadges.map(b => renderLockedBadgeCard(b, progress)).join('')}
                </div>
            </div>
        ` : '';

        const html = `
            <div class="badge-gallery-page">
                <div class="badge-gallery-header">
                    <h2>Badge Gallery</h2>
                    <p class="subtitle">Earn badges by completing achievements</p>
                </div>

                ${statsWidget}

                <div class="badge-gallery-controls">
                    ${filterBar}
                </div>

                <div class="badge-gallery-content">
                    ${earnedSection}
                    ${lockedSection}
                </div>
            </div>
        `;

        return html;
    } catch (error) {
        console.error('Error rendering badge gallery:', error);
        return '<div class="error">Failed to load badge gallery</div>';
    }
}

function renderStatsWidget(stats) {
    const {
        earned_count = 0,
        total_available = 0,
        completion_pct = 0,
        rarest_earned = null,
        collecting_streak = 0
    } = stats;

    return `
        <div class="badge-stats-widget">
            <div class="stat-item">
                <div class="stat-label">Progress</div>
                <div class="stat-number">${completion_pct}%</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${completion_pct}%"></div>
                </div>
            </div>
            <div class="stat-item">
                <div class="stat-label">Earned Badges</div>
                <div class="stat-number">${earned_count}/${total_available}</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">Rarest Badge</div>
                <div class="stat-value">${rarest_earned ? escapeHtml(rarest_earned) : 'None yet'}</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">Collecting Streak</div>
                <div class="stat-number">${collecting_streak} days</div>
            </div>
        </div>
    `;
}

function renderFilterBar() {
    return `
        <div class="badge-filter-bar">
            <div class="filter-group">
                <label>Filter by Rarity:</label>
                <div class="filter-buttons">
                    <button class="filter-btn active" data-rarity="all">All</button>
                    <button class="filter-btn" data-rarity="common">Common</button>
                    <button class="filter-btn" data-rarity="rare">Rare</button>
                    <button class="filter-btn" data-rarity="epic">Epic</button>
                    <button class="filter-btn" data-rarity="legendary">Legendary</button>
                </div>
            </div>
            <div class="filter-group">
                <label>Sort by:</label>
                <select class="sort-select">
                    <option value="recent">Recently Earned</option>
                    <option value="rarity">Rarity</option>
                    <option value="name">Name</option>
                    <option value="progress">Progress</option>
                </select>
            </div>
        </div>
    `;
}

function renderLockedBadgeCard(badgeData, achievements = []) {
    const { badge_name, badge_icon, rarity = 'common' } = badgeData;
    const relevant = achievements.filter(a => a.reward_badge_name === badge_name);

    const unlockedConditions = relevant
        .map(a => `
            <div class="unlock-condition">
                <div class="condition-name">${escapeHtml(a.achievement_name)}</div>
                <div class="condition-progress">
                    <div class="progress-text">${a.condition_current}/${a.condition_value}</div>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${Math.min(100, (a.condition_current / a.condition_value) * 100)}%"></div>
                    </div>
                </div>
            </div>
        `)
        .join('');

    return `
        <div class="badge-card badge-locked badge-rarity-${rarity}" data-badge-name="${escapeHtml(badge_name)}">
            <div class="badge-card-inner">
                <div class="badge-card-front">
                    <div class="badge-icon locked-icon">${badge_icon}</div>
                    <div class="badge-locked-label">Locked</div>
                </div>
                <div class="badge-card-back">
                    <div class="unlock-section">
                        ${unlockedConditions}
                    </div>
                </div>
            </div>
        </div>
    `;
}

export function showBadgeDetailModal(badgeName, badgeData, achievements = []) {
    const { badge_icon, badge_description, rarity = 'common' } = badgeData;

    const relevant = achievements.filter(a => a.reward_badge_name === badgeName);
    const achievementsList = relevant
        .map(a => `
            <div class="achievement-item">
                <div class="achievement-icon">🏆</div>
                <div class="achievement-info">
                    <div class="achievement-name">${escapeHtml(a.achievement_name)}</div>
                    <div class="achievement-desc">${escapeHtml(a.description || '')}</div>
                </div>
            </div>
        `)
        .join('');

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
                        <h4>Description</h4>
                        <p>${escapeHtml(badge_description || '')}</p>
                    </div>

                    ${relevant.length > 0 ? `
                        <div class="achievements-section">
                            <h4>How to Unlock</h4>
                            <div class="achievements-list">
                                ${achievementsList}
                            </div>
                        </div>
                    ` : '<div class="no-achievements">No unlock conditions available</div>'}
                </div>
            </div>
        </div>
    `;

    // Insert modal into DOM
    const container = document.getElementById('badge-gallery-container') || document.body;
    const modal = document.createElement('div');
    modal.innerHTML = modalHtml;
    container.appendChild(modal);

    // Setup close handler
    const closeBtn = modal.querySelector('.modal-close');
    const overlay = modal.querySelector('.modal-overlay');

    const closeModal = () => modal.remove();

    closeBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
    });

    return modal;
}

export function filterBadgesByRarity(badges, rarity) {
    if (rarity === 'all') return badges;
    return badges.filter(b => (b.rarity || 'common') === rarity);
}

// Setup event delegation for badge cards
export function setupBadgeGalleryEvents() {
    const container = document.getElementById('badge-gallery-container');
    if (!container) return;

    // Filter buttons
    container.addEventListener('click', (e) => {
        if (e.target.classList.contains('filter-btn')) {
            document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            const rarity = e.target.dataset.rarity;
            filterGalleryDisplay(rarity);
        }
    });

    // Badge card click for detail modal
    container.addEventListener('click', (e) => {
        const card = e.target.closest('.badge-card');
        if (card) {
            const badgeName = card.dataset.badgeName;
            console.log('Badge clicked:', badgeName);
            // TODO: Load and show badge detail modal
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
