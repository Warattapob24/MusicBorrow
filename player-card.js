/**
 * player-card.js
 * ✨ Gamification: ปรับ Layout ข้อมูลให้เหมือนหน้า Home (Dashboard) 100%
 */
import { escapeHtml } from './utils.js';

// =======================
// 🎯 CONFIG
// =======================
const LEVEL_MESSAGES = [
    "เริ่มต้นก้าวแรก สู่เส้นทางนักดนตรี 🎵",
    "จังหวะเริ่มมาแล้ว! 🔥",
    "พัฒนาเร็วมาก 💪",
    "เริ่มจับทางได้แล้ว 🎶",
    "ความสม่ำเสมอเริ่มเห็นผล ✨",
    "สกิลเริ่มเฉียบขึ้น 🎸",
    "เข้าสู่ระดับจริงจัง 🚀",
    "นี่แหละนักดนตรีตัวจริง 🎼",
    "ใกล้เป็นมือโปร 🏆",
    "โหมดเทพกำลังเปิด ⚡",
    "สปีดการพัฒนาพุ่งสูง 📈",
    "ไม่มีอะไรหยุดคุณได้ 🔥",
    "การฝึกเริ่มเปลี่ยนชีวิต 🎯",
    "คุณกำลังเหนือกว่าคนอื่น 🧠",
    "นี่คือระดับที่คนส่วนใหญ่ไปไม่ถึง 👑"
];

// =======================
// 🧠 UNIQUE MESSAGE
// =======================
function getUniqueLevelMessage() {
    let used = JSON.parse(localStorage.getItem('used_msgs') || '[]');
    if (used.length >= LEVEL_MESSAGES.length) used = [];
    const available = LEVEL_MESSAGES.filter(m => !used.includes(m));
    const msg = available[Math.floor(Math.random() * available.length)];
    used.push(msg);
    localStorage.setItem('used_msgs', JSON.stringify(used));
    return msg;
}

// =======================
// 🏆 RARITY SYSTEM
// =======================
function getRarity(level) {
    if (level >= 30) return 'legendary';
    if (level >= 20) return 'epic';
    if (level >= 10) return 'rare';
    return 'common';
}

// =======================
// 🎨 CARD STYLE
// =======================
function getCardStyle(rarity) {
    switch (rarity) {
        case 'legendary': return "linear-gradient(135deg,#facc15,#f97316,#ec4899)";
        case 'epic': return "linear-gradient(135deg,#7c3aed,#ec4899)";
        case 'rare': return "linear-gradient(135deg,#2563eb,#06b6d4)";
        default: return "linear-gradient(135deg,#4c1d95,#7c3aed)";
    }
}

// =======================
// 🔊 SOUND
// =======================
function playLevelSound(rarity){
    const audio = new Audio( rarity === 'legendary' ? '/assets/legendary.mp3' : '/assets/levelup.mp3' );
    audio.volume = 0.7;
    audio.play().catch(()=>{});
}

// =======================
// 🎇 FULLSCREEN ANIMATION
// =======================
function showFullscreenAnimation(level){
    const el = document.createElement('div');
    el.innerHTML = `
    <div style="position:fixed;inset:0;background:black;display:flex;align-items:center;justify-content:center;z-index:99999;color:white;font-size:3rem;font-weight:900;animation:fadeIn 0.5s;">
        🎉 Lv.${level}
    </div>
    <style>@keyframes fadeIn{ from{opacity:0;transform:scale(0.8)} to{opacity:1;transform:scale(1)} }</style>
    `;
    document.body.appendChild(el);
    setTimeout(()=> el.remove(),1500);
}

// =======================
// 🎁 LOOT BOX
// =======================
function showLootBox(){
    const rewards = ["XP Boost ⚡","เหรียญพิเศษ 🏅","โบนัสเวลา ⏱️","Nothing 😅"];
    const reward = rewards[Math.floor(Math.random()*rewards.length)];
    if (typeof Swal !== 'undefined') {
        Swal.fire({ title:"🎁 Loot Box!", text:`คุณได้รับ: ${reward}`, confirmButtonText:"รับของ!" });
    }
}

// =======================
// 🎴 PLAYER CARD HTML BUILDER
// =======================
export function buildPlayerCardHTML(user, stats) {
    const avatarSrc = stats.avatarUrl || 'assets/default-avatar.png';
    const name = stats.name || 'ผู้ใช้งาน';
    const prevLevel = Math.max(1, stats.level - 1);
    
    const rarity = getRarity(stats.level);
    const message = getUniqueLevelMessage();
    const bgStyle = getCardStyle(rarity);

    // จัดรูปแบบเวลาซ้อมให้เหมือนหน้า Home
    let timeDisplay = stats.practiceMins || 0;
    if (stats.practiceMins >= 60) {
        const h = Math.floor(stats.practiceMins / 60);
        const m = stats.practiceMins % 60;
        timeDisplay = `${h}<span style="font-size:0.8rem;">ชม.</span> ${m}<span style="font-size:0.8rem;">น.</span>`;
    }

    // สร้างกล่อง Ranking
    let ranksHtml = '';
    if (stats.clubRank && stats.clubRank !== '-') {
        ranksHtml += `<div class="sd-rank-box"><div class="sd-rank-val">🏆 #${escapeHtml(String(stats.clubRank))}</div><div class="sd-rank-lbl">อันดับชุมนุม</div></div>`;
    }
    if (stats.classRank && stats.classRank !== '-') {
        ranksHtml += `<div class="sd-rank-box"><div class="sd-rank-val">🎓 #${escapeHtml(String(stats.classRank))}</div><div class="sd-rank-lbl">อันดับห้อง</div></div>`;
    }

    // 💖 การคำนวณและวาดหัวใจ (HP) และดาว (Stars)
    const currentHp = stats.hp !== undefined ? stats.hp : 3;
    const currentStars = stats.stars || 0;
    const hpIcons = Array.from({length: 3}, (_, i) => i < currentHp ? '❤️' : '🖤').join('');

    return `
    <div id="gamification-card-export" style="width:100%; max-width:420px; margin:0 auto; font-family:'Kanit', sans-serif;">
        <style>
            .sd-card { background: ${bgStyle}; border-radius: 28px; padding: 1.5rem; color: white; position: relative; box-shadow: 0 25px 60px rgba(0,0,0,0.5); overflow: hidden; }
            .sd-card::after { content: ""; position: absolute; inset: 0; background: linear-gradient(120deg, transparent, rgba(255,255,255,0.2), transparent); animation: shine 3s linear infinite; pointer-events: none; }
            @keyframes shine { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
            .sd-level { text-align: center; font-size: 1.2rem; font-weight: 900; color: #fde68a; animation: pulse 1.5s infinite; }
            @keyframes pulse { 0% { transform: scale(1); } 50% { transform: scale(1.07); } 100% { transform: scale(1); } }
            .sd-level-num { text-align: center; font-size: 1.8rem; font-weight: 900; margin-bottom: 1rem; }
            .sd-profile { display: flex; align-items: center; gap: 1rem; margin-bottom: 0.5rem; }
            .sd-avatar { width: 64px; height: 64px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 15px rgba(255,255,255,0.7); object-fit: cover; }
            .sd-name { font-size: 1.2rem; font-weight: 800; line-height: 1.2; }
            .sd-message { text-align: center; font-size: 0.95rem; margin: 0.8rem 0 1.2rem 0; font-weight: 600; background: rgba(0,0,0,0.2); padding: 0.5rem; border-radius: 12px; }
            .sd-inner-panels { display: flex; flex-direction: column; gap: 0.5rem; position: relative; z-index: 1; }
            .sd-panel-row { display: flex; background: rgba(255,255,255,0.15); border-radius: 12px; backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.2); padding: 0.8rem 0; }
            .sd-panel-col { flex: 1; text-align: center; display: flex; flex-direction: column; justify-content: center; }
            .sd-panel-val { font-size: 1.2rem; font-weight: 800; line-height: 1.1; margin-bottom: 0.2rem; }
            .sd-panel-lbl { font-size: 0.7rem; font-weight: 600; opacity: 0.95; line-height: 1.3; }
            .sd-panel-divider { width: 1px; background: rgba(255,255,255,0.2); }
            .sd-rank-row { display: flex; gap: 0.5rem; }
            .sd-rank-box { flex: 1; background: rgba(0,0,0,0.2); border-radius: 10px; padding: 0.6rem; text-align: center; border: 1px solid rgba(255,255,255,0.1); }
            .sd-rank-val { font-size: 1.1rem; font-weight: 800; color: #fcd34d; }
            .sd-rank-lbl { font-size: 0.65rem; opacity: 0.8; margin-top: 0.1rem; }
            .sd-games-panel { background: rgba(0,0,0,0.15); border-radius: 10px; padding: 0.8rem; border: 1px solid rgba(255,255,255,0.1); }
            .sd-games-title { font-size: 0.7rem; font-weight: 600; opacity: 0.8; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.5px; text-align: left; }
            .sd-games-list { display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem; }
            .sd-game-item { display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.08); padding: 0.4rem 0.6rem; border-radius: 6px; }
            .sd-game-name { font-size: 0.75rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .sd-game-score { font-size: 0.8rem; font-weight: 800; color: #fde68a; }
            .sd-footer { text-align: center; font-size: 0.65rem; margin-top: 1rem; opacity: 0.7; font-weight: bold; }
        </style>

        <div class="sd-card">
            <div class="sd-level">🎉 LEVEL UP!</div>
            <div class="sd-level-num">Lv.${prevLevel} → Lv.${stats.level}</div>

            <div class="sd-profile">
                <img src="${escapeHtml(avatarSrc)}" class="sd-avatar">
                <div>
                    <div class="sd-name">${escapeHtml(name)}</div>
                    <div style="font-size:0.75rem; color: #fde68a; font-weight: bold;">✨ Music Learner (${stats.xp || 0} XP)</div>
                    <!-- ✨ เพิ่มหัวใจ (HP) ตรงนี้ ✨ -->
                    <div style="font-size:1.1rem; margin-top: 0.2rem; letter-spacing: 2px;">${hpIcons}</div>
                </div>
            </div>

            <div class="sd-message">"${escapeHtml(message)}"</div>

            <div class="sd-inner-panels">
                <div class="sd-panel-row">
                    <div class="sd-panel-col">
                        <div class="sd-panel-val" style="color: #fcd34d;">${timeDisplay}</div>
                        <div class="sd-panel-lbl">เวลาซ้อม</div>
                    </div>
                    <div class="sd-panel-divider"></div>
                    
                    <div class="sd-panel-col">
                        <div class="sd-panel-val">${stats.borrowCount || 0}</div>
                        <div class="sd-panel-lbl">ยืม (ครั้ง)</div>
                    </div>
                    <div class="sd-panel-divider"></div>
                    
                    <div class="sd-panel-col">
                        <div class="sd-panel-val">${stats.badgeCount || 0}</div>
                        <div class="sd-panel-lbl">เหรียญตรา</div>
                    </div>
                    <div class="sd-panel-divider"></div>

                    <!-- ✨ เพิ่มช่อง "ดาวสะสม" (Stars) ✨ -->
                    <div class="sd-panel-col">
                        <div class="sd-panel-val" style="color: #f59e0b;">${currentStars}</div>
                        <div class="sd-panel-lbl">ดาว ⭐️</div>
                    </div>
                </div>

                ${ranksHtml ? `<div class="sd-rank-row">${ranksHtml}</div>` : ''}

                <div class="sd-games-panel">
                    <div class="sd-games-title">🎮 สถิติคะแนนเกมสูงสุด</div>
                    <div class="sd-games-list">
                        <div class="sd-game-item">
                            <span class="sd-game-name">🎼 Staff Wars</span>
                            <span class="sd-game-score">${(stats.staffWarsScore || 0).toLocaleString()}</span>
                        </div>
                        <div class="sd-game-item">
                            <span class="sd-game-name">🥁 Rhythm Core</span>
                            <span class="sd-game-score">${(stats.rhythmScore || 0).toLocaleString()}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div class="sd-footer">
                #LevelUp #MusicPractice #NTUMusicClub
            </div>
        </div>
    </div>
    `;
}

// =======================
// 🎉 LEVEL UP TRIGGER
// =======================
export function triggerLevelUp(user, stats){
    const rarity = getRarity(stats.level);
    playLevelSound(rarity);
    showFullscreenAnimation(stats.level);
    if (typeof confetti !== 'undefined') confetti({ particleCount:200, spread:120 });

    setTimeout(()=>{
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                html: buildPlayerCardHTML(user, stats),
                width:420,
                showConfirmButton:true,
                confirmButtonText:"แชร์เลย 🚀"
            }).then(()=>{ showLootBox(); });
        }
    },1200);
}

// =============================================================================
// 📤 SHARE FUNCTION (Export แทนการใช้ Window)
// =============================================================================
export async function sharePlayerCard() {
    const card = document.getElementById('hidden-capture-card')?.querySelector('#gamification-card-export');
    if (!card) {
        if (typeof Swal !== 'undefined') Swal.fire('ผิดพลาด', 'ไม่พบการ์ดสำหรับแคปเจอร์', 'error');
        return;
    }
    
    try {
        if (typeof Swal !== 'undefined') {
            Swal.fire({ title: 'กำลังสร้างรูปภาพคมชัดสูง...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        }

        if (typeof html2canvas === 'undefined') throw new Error("ยังไม่ได้ติดตั้ง html2canvas");

        const canvas = await html2canvas(card, {
            backgroundColor: '#1e1b4b', // ใส่สีพื้นฐานของการ์ดเผื่อฉากหลังทะลุ
            scale: 3, 
            useCORS: true,
            logging: false
        });
        
        canvas.toBlob(async (blob) => {
            const file = new File([blob], "my-music-card.png", { type: "image/png" });
            
            if (navigator.share && navigator.canShare({ files: [file] })) {
                if (typeof Swal !== 'undefined') Swal.close();
                await navigator.share({
                    title: 'บัตรนักดนตรีของฉัน',
                    text: 'มาดู Level การซ้อมดนตรีของฉันในระบบยืมคืนสิ! 🎵',
                    files: [file]
                });
            } else {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'my-music-card.png';
                a.click();
                URL.revokeObjectURL(url);
                if (typeof Swal !== 'undefined') Swal.fire('สำเร็จ!', 'บันทึกรูปลงเครื่องแล้ว นำไปแชร์อวดเพื่อนได้เลย!', 'success');
            }
        }, 'image/png');
    } catch (err) {
        console.error('Error sharing card:', err);
        if (typeof Swal !== 'undefined') Swal.fire('ผิดพลาด', 'ไม่สามารถสร้างรูปภาพได้ กรุณาลองใหม่', 'error');
    }
}