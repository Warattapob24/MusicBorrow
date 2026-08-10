let appSettings = JSON.parse(localStorage.getItem('music_rpg_settings')) || {
    bgmVol: 50, sfxVol: 50, voiceVol: 100, heroId: null
};

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const heroImg = new Image();
const bossImg = new Image();
const currentLevel = parseInt(localStorage.getItem('music_rpg_level') || '0', 10);
const maxLevel = window.LESSON_CATALOG ? window.LESSON_CATALOG.length : 6;
if (currentLevel >= maxLevel) {
    document.getElementById('screen-game-completed').style.display = 'flex';
    document.getElementById('screen-game-completed').classList.remove('hidden');
}

let bossNum = (currentLevel % 3) + 1;
if (currentLevel >= 7) {
    bossNum = 4; // Use Clockwork Golem for Chapter 2
}
bossImg.src = `assets/game/boss${bossNum}.png`;
canvas.style.backgroundImage = `url('assets/game/bg${bossNum}.png')`;
canvas.style.backgroundSize = 'cover';
canvas.style.backgroundPosition = 'center';

// AUDIO SETUP
let audioCtx;
let bgmInterval = null;
let isBgmPlaying = false;
let bgmStep = 0;

function startBGM() {
    if (appSettings.bgmVol === 0) { stopBGM(); return; }
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    if (isBgmPlaying) return;
    isBgmPlaying = true;
    
    // Peaceful explore theme
    const overworldNotes = [60, 62, 64, 67, 69, 72, 69, 67]; 
    const tempo = 200;
    
    bgmInterval = setInterval(() => {
        if (!isBgmPlaying || appSettings.bgmVol === 0) return;
        const noteMidi = overworldNotes[bgmStep % overworldNotes.length];
        const freq = 440 * Math.pow(2, (noteMidi - 69) / 12);
        const now = audioCtx.currentTime;
        
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);
        
        const vol = (appSettings.bgmVol / 100) * 0.15;
        gain.gain.setValueAtTime(vol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + (tempo/1000) * 0.8);
        
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        osc.start(now);
        osc.stop(now + (tempo/1000));
        
        bgmStep++;
    }, tempo);
}

function stopBGM() {
    clearInterval(bgmInterval);
    isBgmPlaying = false;
}

window.selectHero = function(heroFileName) {
    appSettings.heroId = heroFileName;
    localStorage.setItem('music_rpg_settings', JSON.stringify(appSettings));
    document.getElementById('screen-select').style.display = 'none';
    heroImg.src = 'assets/game/' + heroFileName;
    startBGM(); // Start BGM after user interaction
    loop();
};

window.resetSave = function() {
    localStorage.removeItem('music_rpg_level');
    location.reload();
};

window.openSettings = function() {
    document.getElementById('settings-modal').classList.remove('hidden');
    // Init sliders
    const updateSlider = (id, val) => {
        const el = document.getElementById('slider-' + id);
        const disp = document.getElementById('val-' + id);
        if (el) el.value = val;
        if (disp) disp.innerText = val + '%';
    };
    // fallback logic in case it's an old save
    if (appSettings.bgmVol === undefined) appSettings.bgmVol = 50;
    if (appSettings.sfxVol === undefined) appSettings.sfxVol = 50;
    if (appSettings.voiceVol === undefined) appSettings.voiceVol = 100;

    updateSlider('bgm', appSettings.bgmVol);
    updateSlider('sfx', appSettings.sfxVol);
    updateSlider('voice', appSettings.voiceVol);
};

window.closeSettings = function() {
    document.getElementById('settings-modal').classList.add('hidden');
};

window.updateSettings = function(key, value) {
    appSettings[key] = parseInt(value, 10);
    localStorage.setItem('music_rpg_settings', JSON.stringify(appSettings));
    
    if (key === 'bgmVol') {
        document.getElementById('val-bgm').innerText = appSettings.bgmVol + '%';
        if (appSettings.bgmVol > 0 && !isBgmPlaying && document.getElementById('screen-select').style.display === 'none') {
            startBGM();
        } else if (appSettings.bgmVol === 0) {
            stopBGM();
        }
    } else if (key === 'sfxVol') {
        document.getElementById('val-sfx').innerText = appSettings.sfxVol + '%';
    } else if (key === 'voiceVol') {
        document.getElementById('val-voice').innerText = appSettings.voiceVol + '%';
    }
};

// --- GAME SETTINGS ---
const TILE_SIZE = 64;
let keys = {};
let gameLoop;
let camera = { x: 0, y: 0 };

// Detect Mobile
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
if (isMobile) {
    document.getElementById('dpad-container').style.display = 'block';
}

// --- RESIZE CANVAS ---
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// --- ENTITIES ---
const bossNames = [
    'Noise Demon', 
    'Treble Trickster', 
    'Scale Serpent', 
    'Minor Minotaur', 
    'Slime Blob', 
    'Mutant Pitch', 
    'Note Master', 
    'Time Wizard', 
    'Rhythm Golem',
    'Harmony Golem',
    'Scale Architect',
    'Master of Keys',
    'Chord Titan',
    'Melody Dragon',
    'Final Boss'
];

const basePositions = [
    { x: 300, y: 300 },
    { x: 700, y: 300 },
    { x: 1100, y: 300 },
    { x: 1500, y: 300 },
    { x: 1500, y: 700 },
    { x: 1100, y: 700 },
    { x: 700, y: 700 },
    { x: 300, y: 700 },
    { x: 300, y: 1100 },
    { x: 700, y: 1100 },
    { x: 1100, y: 1100 },
    { x: 1500, y: 1100 },
    { x: 1500, y: 1500 },
    { x: 1100, y: 1500 },
    { x: 700, y: 1500 },
    { x: 300, y: 1500 }
];

// Calculate spawn position based on currentLevel
let spawnX = 200;
let spawnY = 200;
if (currentLevel > 0) {
    let activeIdx = Math.min(currentLevel, maxLevel - 1);
    spawnX = basePositions[activeIdx].x - 100;
    spawnY = basePositions[activeIdx].y;
}

const player = {
    x: spawnX, y: spawnY,
    width: 64, height: 64,
    speed: 5,
    draw: function() {
        if (heroImg.complete && heroImg.naturalHeight !== 0) {
            ctx.drawImage(heroImg, this.x - camera.x, this.y - camera.y, this.width, this.height);
        }
    }
};

const enemies = [];
const unlockedLevel = Math.min(currentLevel, maxLevel - 1); 

for (let i = 0; i <= unlockedLevel; i++) {
    enemies.push({
        x: basePositions[i].x,
        y: basePositions[i].y,
        width: 128, height: 128,
        id: `boss${i+1}`,
        name: bossNames[i] || `Boss ${i+1}`,
        cleared: (i < currentLevel),
        image: new Image(),
        loaded: false,
        init: function() {
            let bNum = (i % 3) + 1;
            if (i >= 7) { // Chapter 2 starts at index 7 (Level 8)
                bNum = 4;
            }
            const tempImg = new Image();
            tempImg.src = `assets/game/boss${bNum}.png`;
            tempImg.onload = () => { 
                if (bNum === 4) {
                    const tempCanvas = document.createElement('canvas');
                    tempCanvas.width = tempImg.width;
                    tempCanvas.height = tempImg.height;
                    const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
                    tempCtx.drawImage(tempImg, 0, 0);
                    const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
                    const data = imageData.data;
                    for (let j = 0; j < data.length; j += 4) {
                        // Remove white pixels
                        if (data[j] > 240 && data[j+1] > 240 && data[j+2] > 240) {
                            data[j+3] = 0;
                        }
                    }
                    tempCtx.putImageData(imageData, 0, 0);
                    this.image.src = tempCanvas.toDataURL();
                    this.image.onload = () => { this.loaded = true; };
                } else {
                    this.image.src = tempImg.src;
                    this.loaded = true;
                }
            };
        },
        draw: function() {
            if (this.loaded) {
                // If cleared, maybe draw it semi-transparent or with a filter, but for now just draw it normally
                if (this.cleared) {
                    ctx.globalAlpha = 0.5; // Make defeated bosses semi-transparent
                }
                ctx.drawImage(this.image, this.x - camera.x, this.y - camera.y, this.width, this.height);
                ctx.globalAlpha = 1.0; // Reset
            }
            // Draw text tag
            ctx.fillStyle = this.cleared ? '#aaa' : '#fff'; // Gray text if cleared
            ctx.font = 'bold 16px Sarabun';
            ctx.textAlign = 'center';
            ctx.shadowColor = 'rgba(0,0,0,0.8)';
            ctx.shadowBlur = 4;
            ctx.fillText(this.name, this.x - camera.x + this.width/2, this.y - camera.y - 10);
            
            if (this.cleared) {
                ctx.fillStyle = '#10b981'; // Green color for cleared text
                ctx.fillText("✅ Cleared", this.x - camera.x + this.width/2, this.y - camera.y - 30);
            }
            ctx.shadowBlur = 0; // reset
        }
    });
    enemies[enemies.length - 1].init();
}

if (currentLevel >= maxLevel) {
    // Game Completed NPC
    enemies.push({
        x: 1100, y: 1100, width: 64, height: 64, color: '#fbbf24', id: 'victory', name: 'Master of Music',
        draw: function() {
            ctx.fillStyle = this.color;
            ctx.fillRect(this.x - camera.x, this.y - camera.y, this.width, this.height);
            ctx.fillStyle = '#fff';
            ctx.font = '14px Sarabun'; ctx.textAlign = 'center';
            ctx.fillText("คุณเรียนจบแล้ว!", this.x - camera.x + this.width/2, this.y - camera.y - 10);
        }
    });
}

// --- INPUT HANDLING ---
window.addEventListener('keydown', e => { 
    keys[e.key.toLowerCase()] = true; 
    
    // Developer Cheats
    if (e.key === '7') {
        localStorage.setItem('music_rpg_level', '6');
        window.location.reload();
    }
    if (e.key === '8') {
        localStorage.setItem('music_rpg_level', '7');
        window.location.reload();
    }
    if (e.key === '9') {
        localStorage.setItem('music_rpg_level', '8');
        window.location.reload();
    }
});
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

// Mobile D-Pad
const dpadBtns = {
    'btn-up': 'w', 'btn-down': 's', 'btn-left': 'a', 'btn-right': 'd'
};
for (const [id, key] of Object.entries(dpadBtns)) {
    const el = document.getElementById(id);
    if(el) {
        el.addEventListener('touchstart', (e) => { e.preventDefault(); keys[key] = true; });
        el.addEventListener('touchend', (e) => { e.preventDefault(); keys[key] = false; });
        el.addEventListener('mousedown', (e) => { keys[key] = true; });
        el.addEventListener('mouseup', (e) => { keys[key] = false; });
        el.addEventListener('mouseleave', (e) => { keys[key] = false; });
    }
}

// --- COLLISION LOGIC ---
function checkCollision(r1, r2) {
    return (
        r1.x < r2.x + r2.width &&
        r1.x + r1.width > r2.x &&
        r1.y < r2.y + r2.height &&
        r1.y + r1.height > r2.y
    );
}

// --- UPDATE LOOP ---
let transitioning = false;

function update() {
    if (transitioning) return;

    // Movement
    let dx = 0;
    let dy = 0;
    if (keys['w'] || keys['arrowup']) dy -= player.speed;
    if (keys['s'] || keys['arrowdown']) dy += player.speed;
    if (keys['a'] || keys['arrowleft']) dx -= player.speed;
    if (keys['d'] || keys['arrowright']) dx += player.speed;

    // Normalize diagonal speed
    if (dx !== 0 && dy !== 0) {
        const length = Math.sqrt(dx*dx + dy*dy);
        dx = (dx/length) * player.speed;
        dy = (dy/length) * player.speed;
    }

    player.x += dx;
    player.y += dy;

    // Basic map bounds
    player.x = Math.max(0, Math.min(player.x, 2000 - player.width));
    player.y = Math.max(0, Math.min(player.y, 2000 - player.height));

    // Update Camera (center on player)
    camera.x = player.x + player.width / 2 - canvas.width / 2;
    camera.y = player.y + player.height / 2 - canvas.height / 2;

    // Check Enemy Encounters
    for (let enemy of enemies) {
        if (checkCollision(player, enemy)) {
            startEncounter(enemy.id);
            break;
        }
    }
}

function startEncounter(enemyId) {
    if (transitioning) return;
    transitioning = true;
    
    // Play sound or flash screen here if we had audio context ready
    
    // Simple flash effect
    document.getElementById('loading').innerHTML = "เริ่มการต่อสู้!!";
    document.getElementById('loading').style.background = "#f43f5e";
    document.getElementById('loading').style.opacity = "1";
    document.getElementById('loading').style.display = "flex";
    
    setTimeout(() => {
        // Pass the encounter target via URL query param with cache buster
        window.location.href = `lesson-player.html?encounter=${enemyId}&t=${Date.now()}`;
    }, 1000);
}

// --- RENDER LOOP ---
const floorImg = new Image(); floorImg.src = 'assets/game/floor.png';
let floorPattern = null;
floorImg.onload = () => {
    if (ctx) floorPattern = ctx.createPattern(floorImg, 'repeat');
};

function drawGrid() {
    // We can still draw a very faint grid on top of the texture to help players gauge movement
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;

    const startX = Math.floor(camera.x / TILE_SIZE) * TILE_SIZE;
    const startY = Math.floor(camera.y / TILE_SIZE) * TILE_SIZE;

    for (let x = startX; x < camera.x + canvas.width + TILE_SIZE; x += TILE_SIZE) {
        for (let y = startY; y < camera.y + canvas.height + TILE_SIZE; y += TILE_SIZE) {
            ctx.strokeRect(x - camera.x, y - camera.y, TILE_SIZE, TILE_SIZE);
        }
    }
}

function drawPath() {
    ctx.save();
    ctx.translate(-camera.x, -camera.y);
    
    ctx.beginPath();
    // Start at first boss center (boss is 128x128, so center is +64)
    ctx.moveTo(basePositions[0].x + 64, basePositions[0].y + 64);
    
    // Connect all boss positions
    for (let i = 1; i < basePositions.length; i++) {
        ctx.lineTo(basePositions[i].x + 64, basePositions[i].y + 64);
    }
    // Connect to Victory NPC
    ctx.lineTo(700 + 32, 1100 + 32);

    // 1. Wide faint magical aura
    ctx.strokeStyle = 'rgba(167, 139, 250, 0.15)'; 
    ctx.lineWidth = 60;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(167, 139, 250, 1)';
    ctx.shadowBlur = 20;
    ctx.stroke();

    // 2. Inner bright magical stream
    ctx.strokeStyle = 'rgba(216, 180, 254, 0.3)';
    ctx.lineWidth = 15;
    ctx.stroke();

    // 3. Stardust / Tiny glowing dots
    ctx.beginPath();
    ctx.moveTo(basePositions[0].x + 64, basePositions[0].y + 64);
    for (let i = 1; i < basePositions.length; i++) {
        ctx.lineTo(basePositions[i].x + 64, basePositions[i].y + 64);
    }
    ctx.lineTo(700 + 32, 1100 + 32);
    
    ctx.setLineDash([4, 30]); // 4px dot, 30px gap
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'; 
    ctx.lineWidth = 4;
    ctx.shadowColor = 'rgba(255, 255, 255, 1)';
    ctx.shadowBlur = 10;
    ctx.stroke();

    ctx.restore();
}

function render() {
    // Clear screen
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw Floor Texture
    if (floorPattern) {
        ctx.save();
        // Translate to map coordinates
        ctx.translate(-camera.x, -camera.y);
        ctx.fillStyle = floorPattern;
        ctx.fillRect(0, 0, 2000, 2000); // the map is 2000x2000
        
        // Map borders
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 5;
        ctx.strokeRect(0, 0, 2000, 2000);
        ctx.restore();
    }

    drawPath(); // Draw the magical path connecting bases
    drawGrid();

    // Draw entities
    for (let enemy of enemies) {
        enemy.draw();
    }
    
    player.draw();
}

function loop() {
    update();
    render();
    gameLoop = requestAnimationFrame(loop);
}

// Start Game
window.onload = () => {
    document.getElementById('loading').style.opacity = '0';
    setTimeout(() => document.getElementById('loading').style.display = 'none', 500);
    
    if (!appSettings.heroId) {
        document.getElementById('screen-select').style.display = 'flex';
    } else {
        heroImg.src = 'assets/game/' + appSettings.heroId;
        loop();
    }
    
    // Unlock Audio on first interaction
    document.addEventListener('click', () => {
        if (appSettings.heroId && !isBgmPlaying && document.getElementById('screen-select').style.display === 'none') {
            startBGM();
        }
    }, { once: true });
    document.addEventListener('keydown', () => {
        if (appSettings.heroId && !isBgmPlaying && document.getElementById('screen-select').style.display === 'none') {
            startBGM();
        }
    }, { once: true });
};
