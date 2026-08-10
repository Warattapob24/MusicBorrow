// Vocal Pitch Trainer - Unified Flow, 5-Line Staff, Gamification, Mobile

const LEVELS = [
    { id: 1, name: 'Level 1: Long Tone', description: 'ลากเสียงโน้ตเดียวให้นิ่ง', shifts: [0, 1, 2, 1, 0], sequence: [{ step: 0, duration: 4, lyric: 'Ah' }] },
    { id: 2, name: 'Level 2: Intervals', description: 'สลับโน้ต 2 ตัว', shifts: [0, 1, 2, 3, 2, 1, 0], sequence: [{ step: 0, duration: 2, lyric: 'Ah' }, { step: 2, duration: 2, lyric: 'Ah' }, { step: 0, duration: 2, lyric: 'Ah' }] },
    { id: 3, name: 'Level 3: 1-2-3-2-1', description: 'วอร์มเสียงแบบบันได 3 ขั้น (Ma)', shifts: [0, 1, 2, 3, 4, 3, 2, 1, 0], sequence: [{ step: 0, duration: 1.5, lyric: 'Ma' }, { step: 2, duration: 1.5, lyric: 'Ma' }, { step: 4, duration: 1.5, lyric: 'Ma' }, { step: 2, duration: 1.5, lyric: 'Ma' }, { step: 0, duration: 3, lyric: 'Ma' }] },
    { id: 4, name: 'Level 4: Triads', description: 'โน้ตกระโดด (Major Triad)', shifts: [0, 1, 2, 3, 4, 3, 2, 1, 0], sequence: [{ step: 0, duration: 1.5, lyric: 'Ah' }, { step: 4, duration: 1.5, lyric: 'Eh' }, { step: 7, duration: 3, lyric: 'Ee' }] },
    { id: 5, name: 'Level 5: 5-Finger', description: 'ไล่เสียง 5 ลำดับ', shifts: [0, 1, 2, 3, 4, 3, 2, 1, 0], sequence: [{ step: 0, duration: 1, lyric: '1' }, { step: 2, duration: 1, lyric: '2' }, { step: 4, duration: 1, lyric: '3' }, { step: 5, duration: 1, lyric: '4' }, { step: 7, duration: 2, lyric: '5' }] },
    { id: 6, name: 'Level 6: Arpeggio', description: 'ก้าวกระโดดเสียง 1 Octave', shifts: [0, 1, 2, 3, 2, 1, 0], sequence: [{ step: 0, duration: 1, lyric: 'Ah' }, { step: 4, duration: 1, lyric: 'Oh' }, { step: 7, duration: 1, lyric: 'Ah' }, { step: 12, duration: 2, lyric: 'Oo' }] },
    { id: 7, name: 'Level 7: Full Scale (ขึ้น-ลง)', description: 'สเกลเต็ม 8 เสียง (ขึ้น-ลง)', shifts: [0, 1, 2, 3, 2, 1, 0], sequence: [
        {step: 0, duration: 1, lyric:'Do'}, {step: 2, duration: 1, lyric:'Re'}, {step: 4, duration: 1, lyric:'Mi'}, {step: 5, duration: 1, lyric:'Fa'}, {step: 7, duration: 1, lyric:'Sol'}, {step: 9, duration: 1, lyric:'La'}, {step: 11, duration: 1, lyric:'Ti'}, {step: 12, duration: 1.5, lyric:'Do'},
        {step: 11, duration: 1, lyric:'Ti'}, {step: 9, duration: 1, lyric:'La'}, {step: 7, duration: 1, lyric:'Sol'}, {step: 5, duration: 1, lyric:'Fa'}, {step: 4, duration: 1, lyric:'Mi'}, {step: 2, duration: 1, lyric:'Re'}, {step: 0, duration: 2, lyric:'Do'}
    ]},
    { id: 8, name: 'Level 8: Scale & Triad', description: 'สเกลและคอร์ด (ขึ้น-ลง)', shifts: [0, 1, 2, 1, 0], sequence: [
        {step: 0, duration: 0.8, lyric: 'Ah'}, {step: 2, duration: 0.8, lyric: 'Eh'}, {step: 4, duration: 0.8, lyric: 'Ee'}, {step: 5, duration: 0.8, lyric: 'Oh'}, 
        {step: 7, duration: 0.8, lyric: 'Oo'}, {step: 9, duration: 0.8, lyric: 'Ah'}, {step: 11, duration: 0.8, lyric: 'Eh'}, {step: 12, duration: 0.8, lyric: 'Ee'},
        {step: 11, duration: 0.8, lyric: 'Eh'}, {step: 9, duration: 0.8, lyric: 'Ah'}, {step: 7, duration: 0.8, lyric: 'Oo'}, {step: 5, duration: 0.8, lyric: 'Oh'},
        {step: 4, duration: 0.8, lyric: 'Ee'}, {step: 2, duration: 0.8, lyric: 'Eh'}, {step: 0, duration: 2.0, lyric: 'Ah'},
        {step: 0, duration: 0.8, lyric: 'Oh'}, {step: 4, duration: 0.8, lyric: 'Ah'}, {step: 7, duration: 0.8, lyric: 'Ee'}, {step: 12, duration: 0.8, lyric: 'Oh'},
        {step: 7, duration: 0.8, lyric: 'Ee'}, {step: 4, duration: 0.8, lyric: 'Ah'}, {step: 0, duration: 2.0, lyric: 'Oh'}
    ]},
    { id: 9, name: 'Level 9: Song Melody', description: 'เพลงฝึกทำนอง (Twinkle Twinkle)', shifts: [0], sequence: [
        {step: 0, duration: 1, lyric: 'Twin'}, {step: 0, duration: 1, lyric: 'kle'}, {step: 7, duration: 1, lyric: 'Twin'}, {step: 7, duration: 1, lyric: 'kle'}, 
        {step: 9, duration: 1, lyric: 'lit'}, {step: 9, duration: 1, lyric: 'tle'}, {step: 7, duration: 2, lyric: 'star'}
    ]}
];

const TUTORIAL_SLIDES = [
    { title: "บทที่ 1: การหายใจ (Breathing)", content: "การร้องเพลงที่ดีเริ่มจากการหายใจ ลองเอามือจับที่ท้อง หายใจเข้าให้ท้องป่อง (กระบังลมทำงาน) และเวลาเปล่งเสียงให้ค่อยๆ ปล่อยลมออกช้าๆ ท้องจะค่อยๆ แฟบลง ห้ามยกไหล่ตอนหายใจเด็ดขาด!" },
    { title: "บทที่ 2: วอร์มเสียงด้วย Lip Trill", content: "ลองทำปากสั่นๆ เหมือนเสียงรถมอเตอร์ไซค์ (บรื๊ออออ) แล้วไล่เสียงสูง-ต่ำไปมา การทำแบบนี้จะช่วยให้เส้นเสียงผ่อนคลายและลดความตึงเครียดของคอได้ดีมาก" },
    { title: "บทที่ 3: การฟังและการแมตช์เสียง", content: "สิ่งที่สำคัญที่สุดคือ 'หู' ลองกดปุ่มฟังเสียงตัวอย่าง แล้วตั้งสมาธิฮัมเสียง 'อืมมม' ในคอให้คลื่นเสียงของคุณกลืนไปกับเสียงเปียโน ถ้ารู้สึกสั่นต้านกันแปลว่ายังเพี้ยนอยู่" }
];

const NOTE_STRINGS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const DIATONIC_SCALE = [0, 2, 4, 5, 7, 9, 11]; // C major intervals for visual spacing

// State
let appMode = null; // 'tutorial', 'practice', 'test'
let currentBeatDuration = 0.5;
let arenaState = 'idle'; // 'singing', 'results'
let currentLevelId = 1;

let userId = null;
try {
    const cachedUser = localStorage.getItem('cached_user_data') || localStorage.getItem('sd_game_user');
    if (cachedUser) {
        const userObj = JSON.parse(cachedUser);
        userId = userObj.id || null;
    }
} catch(e) {}

function getLocalSetting(key, defaultVal) {
    if (!userId) return localStorage.getItem(key) || defaultVal;
    return localStorage.getItem(`${userId}_${key}`) || localStorage.getItem(key) || defaultVal;
}
function saveLocalSetting(key, value) {
    if (userId) localStorage.setItem(`${userId}_${key}`, value);
    else localStorage.setItem(key, value);
}

let savedGender = getLocalSetting('userGender', 'male');
let isMaleVoice = savedGender === 'male';
let userBaseNote = parseInt(getLocalSetting('userBaseNote', null)) || null;

// Audio Web API
let audioCtx, analyser, microphone;
let guideOsc, recorder;
let recordedChunks = [];
let audioBlobUrl = null;

// Canvas & Animation
let canvas, ctx, animationId;
let startTime = 0;
let canvasWidth = 800, canvasHeight = 400;
const SCROLL_SPEED = window.innerWidth < 768 ? 80 : 120; // Slower on mobile so notes don't rush

// Data
let targetBlocks = [];
let pitchHistory = [];
let rawPitches = []; 
let activeParticles = []; // For gamification feedback
let calibPitches = []; // For calibration
let calibTimer = null;

// UI Elements
const U = {
    viewDash: document.getElementById('view-dashboard'),
    viewLevels: document.getElementById('view-levels'),
    viewTut: document.getElementById('view-tutorial'),
    viewArena: document.getElementById('view-arena'),
    viewBreathing: document.getElementById('view-breathing'),
    levelGrid: document.getElementById('level-grid'),
    startArenaBtn: document.getElementById('start-arena-btn'),
    genderInd: document.getElementById('gender-indicator'),
    genderBtnM: document.getElementById('gender-btn-male'),
    genderBtnF: document.getElementById('gender-btn-female'),
    arenaTitle: document.getElementById('arena-title'),
    arenaGuideToggle: document.getElementById('arena-guide-toggle'),
    arenaTestToggle: document.getElementById('arena-testmode-toggle'),
    actionSingBtn: document.getElementById('action-sing-btn'),
    arenaStatus: document.getElementById('arena-status'),
    blindfold: document.getElementById('test-blindfold'),
    tunerNote: document.getElementById('tuner-note'),
    tunerCents: document.getElementById('tuner-cents'),
    micFill: document.getElementById('mic-level-fill'),
    micFillMob: document.getElementById('mic-level-fill-mobile'),
    resPanel: document.getElementById('results-panel'),
    scoreDisplay: document.getElementById('score-display'),
    feedbackDisplay: document.getElementById('feedback-display'),
    viewCalib: document.getElementById('view-calibration'),
    btnStartCalib: document.getElementById('btn-start-calibration'),
    btnFinishCalib: document.getElementById('btn-finish-calibration'),
    calibNoteDisplay: document.getElementById('calib-note-display'),
    calibMicBar: document.getElementById('calib-mic-bar'),
    calibProgBar: document.getElementById('calib-progress-bar'),
    calibProgFill: document.getElementById('calib-progress-fill'),
    calibResult: document.getElementById('calib-result'),
    calibResultNote: document.getElementById('calib-result-note'),
    calibResultType: document.getElementById('calib-result-type')
};

// --- Synthetic Voice Node ---
function createVoiceNode(ctx, freq) {
    const gn = ctx.createGain();
    gn.gain.value = 1.0; // Increased volume
    const osc1 = ctx.createOscillator(); osc1.type = 'sine'; osc1.frequency.value = freq;
    const osc2 = ctx.createOscillator(); osc2.type = 'triangle'; osc2.frequency.value = freq;
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = freq * 2.5; 
    osc1.connect(gn); osc2.connect(filter); filter.connect(gn);
    return { 
        start: () => { osc1.start(); osc2.start(); }, stop: () => { osc1.stop(); osc2.stop(); },
        connect: (dest) => gn.connect(dest),
        setFrequency: (f) => { 
            osc1.frequency.setValueAtTime(f, ctx.currentTime);
            osc2.frequency.setValueAtTime(f, ctx.currentTime);
            filter.frequency.setValueAtTime(f * 2.5, ctx.currentTime);
        }
    };
}

// --- Init & Resize ---
function initCanvas() {
    canvas = document.getElementById('pitch-canvas');
    ctx = canvas.getContext('2d');
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    setGender(savedGender); // initialize UI
}
function resizeCanvas() {
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    canvasWidth = rect.width;
    canvasHeight = rect.height;
    if(arenaState === 'idle' && targetBlocks.length > 0) drawReviewStatic();
}

// --- View Navigation ---
function hideAllViews() {
    [U.viewDash, U.viewLevels, U.viewTut, U.viewArena, U.viewCalib, U.viewBreathing].forEach(v => {
        if (v) v.classList.add('hidden');
    });
}
function handleGlobalBack() {
    if ((U.viewArena && !U.viewArena.classList.contains('hidden')) || 
        (U.viewTut && !U.viewTut.classList.contains('hidden')) || 
        (U.viewCalib && !U.viewCalib.classList.contains('hidden')) || 
        (U.viewLevels && !U.viewLevels.classList.contains('hidden')) ||
        (U.viewBreathing && !U.viewBreathing.classList.contains('hidden'))) {
        // Stop audio components if active
        if (animationId) cancelAnimationFrame(animationId);
        if (guideOsc) { guideOsc.stop(); guideOsc = null; }
        if (microphone) { microphone.disconnect(); microphone = null; }
        if (breathRunning) resetBreathingSession();
        arenaState = 'idle';
        
        goBackToDashboard();
    } else {
        window.location.href = 'index.html';
    }
}

function goBackToDashboard() {
    hideAllViews();
    if (breathRunning) resetBreathingSession();
    U.viewDash.classList.remove('hidden');
    if(tutorialVoice) toggleSampleTone(); // stop tutorial tone
}
function selectMode(mode) {
    appMode = mode; // 'tutorial', 'practice', 'breathing'
    hideAllViews();
    if (mode === 'breathing') {
        if (U.viewBreathing) U.viewBreathing.classList.remove('hidden');
        setBreathingPreset('basic');
    } else if (mode === 'tutorial') {
        U.viewTut.classList.remove('hidden'); renderTutorial();
    } else {
        if (!userBaseNote) {
            startCalibrationFlow();
        } else {
            U.viewLevels.classList.remove('hidden'); renderLevelGrid();
        }
    }
}

// --- Gender Switch Logic ---
function setGender(gender) {
    isMaleVoice = gender === 'male';
    saveLocalSetting('userGender', gender);
    
    if (U.genderInd) {
        if (isMaleVoice) {
            U.genderInd.style.transform = 'translateX(100%)';
            U.genderBtnM.classList.add('text-slate-800');
            U.genderBtnM.classList.remove('text-slate-500');
            U.genderBtnF.classList.add('text-slate-500');
            U.genderBtnF.classList.remove('text-slate-800');
        } else {
            U.genderInd.style.transform = 'translateX(0)';
            U.genderBtnF.classList.add('text-slate-800');
            U.genderBtnF.classList.remove('text-slate-500');
            U.genderBtnM.classList.add('text-slate-500');
            U.genderBtnM.classList.remove('text-slate-800');
        }
    }
}

// --- Tutorial Logic ---
let tutIdx = 0, tutorialVoice = null;
function renderTutorial() {
    document.getElementById('tutorial-content').innerHTML = `
        <h2 class="text-2xl font-bold text-blue-600 mb-4">${TUTORIAL_SLIDES[tutIdx].title}</h2>
        <p class="text-lg text-slate-600 leading-relaxed min-h-[100px]">${TUTORIAL_SLIDES[tutIdx].content}</p>
        ${tutIdx === 2 ? '<button id="tut-sample-btn" onclick="toggleSampleTone()" class="mt-6 bg-yellow-400 hover:bg-yellow-500 text-white font-bold py-3 px-8 rounded-full shadow"><i class="fas fa-play"></i> เปิดเสียงนำ C4 (ลากยาวต่อเนื่อง)</button>' : ''}
    `;
    document.getElementById('tut-progress').innerHTML = TUTORIAL_SLIDES.map((_, i) => `<div class="w-3 h-3 rounded-full ${i === tutIdx ? 'bg-blue-500' : 'bg-slate-300'}"></div>`).join('');
    document.getElementById('tut-prev-btn').disabled = tutIdx === 0;
    document.getElementById('tut-next-btn').disabled = tutIdx === TUTORIAL_SLIDES.length - 1;
}
document.getElementById('tut-prev-btn').addEventListener('click', () => { if(tutIdx > 0) { tutIdx--; renderTutorial(); } });
document.getElementById('tut-next-btn').addEventListener('click', () => { if(tutIdx < TUTORIAL_SLIDES.length-1) { tutIdx++; renderTutorial(); } });
function toggleSampleTone() {
    if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const btn = document.getElementById('tut-sample-btn');
    if (tutorialVoice) {
        tutorialVoice.stop(); tutorialVoice = null;
        if(btn) btn.innerHTML = '<i class="fas fa-play"></i> เปิดเสียงนำ C4 (ลากยาวต่อเนื่อง)';
    } else {
        tutorialVoice = createVoiceNode(audioCtx, 261.63);
        tutorialVoice.connect(audioCtx.destination); tutorialVoice.start();
        if(btn) btn.innerHTML = '<i class="fas fa-stop"></i> หยุดเสียงนำ';
    }
}

function startCalibrationFlow() {
    hideAllViews();
    U.viewCalib.classList.remove('hidden');
    U.calibResult.classList.add('hidden');
    U.btnStartCalib.classList.remove('hidden');
    U.btnFinishCalib.classList.add('hidden');
    document.getElementById('btn-skip-calibration')?.classList.remove('hidden');
    U.calibNoteDisplay.innerText = '-';
    U.calibProgBar.classList.add('hidden');
    U.calibMicBar.style.height = '0%';
}

function skipCalibration() {
    userBaseNote = isMaleVoice ? 48 : 60; // C3 or C4
    saveLocalSetting('userBaseNote', userBaseNote);
    U.viewCalib.classList.add('hidden');
    U.viewLevels.classList.remove('hidden');
    renderLevelGrid();
}

async function startCalibration() {
    initAudioCtx();
    U.btnStartCalib.classList.remove('hidden');
    document.getElementById('btn-skip-calibration')?.classList.add('hidden');
    U.calibProgBar.classList.remove('hidden');
    U.calibResult.classList.add('hidden');
    U.calibProgFill.style.width = '0%';
    U.calibNoteDisplay.innerText = 'ร้องเลย...';
    calibPitches = [];
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: { echoCancellation: false, autoGainControl: false, noiseSuppression: false, latency: 0 } 
        });
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 2048;
        microphone = audioCtx.createMediaStreamSource(stream);
        microphone.connect(analyser);
        
        let calibStartTime = audioCtx.currentTime;
        
        function calibLoop() {
            if (!U.viewCalib.classList.contains('hidden')) {
                let elapsed = audioCtx.currentTime - calibStartTime;
                let progress = Math.min(100, (elapsed / 3) * 100);
                U.calibProgFill.style.width = progress + '%';
                
                const buf = new Float32Array(analyser.fftSize);
                analyser.getFloatTimeDomainData(buf);
                let rawP = autoCorrelate(buf, audioCtx.sampleRate);
                
                let rms = 0; for (let i = 0; i < buf.length; i++) rms += buf[i]*buf[i];
                let meterH = Math.min(100, Math.sqrt(rms/buf.length) * 500);
                U.calibMicBar.style.height = meterH + '%';

                if (rawP !== -1) {
                    let note = noteFromPitch(rawP);
                    calibPitches.push(note);
                    U.calibNoteDisplay.innerText = NOTE_STRINGS[note % 12];
                }
                
                if (elapsed < 3) {
                    requestAnimationFrame(calibLoop);
                } else {
                    finishCalibration();
                }
            }
        }
        requestAnimationFrame(calibLoop);
    } catch(err) {
        alert("ไม่สามารถเข้าถึงไมโครโฟนได้ กรุณาอนุญาตให้เข้าถึงไมโครโฟน");
        U.btnStartCalib.classList.remove('hidden');
    }
}

function finishCalibration() {
    if(microphone) { microphone.disconnect(); microphone = null; }
    
    if (calibPitches.length < 10) {
        U.calibNoteDisplay.innerText = 'ไม่พบเสียง';
        U.btnStartCalib.classList.remove('hidden');
        U.calibProgBar.classList.add('hidden');
        alert("ไม่สามารถจับเสียงได้ชัดเจน ลองร้องให้ดังขึ้นและลากเสียงยาวๆ ครับ");
        return;
    }
    
    calibPitches.sort((a,b)=>a-b);
    userBaseNote = calibPitches[Math.floor(calibPitches.length/2)];
    saveLocalSetting('userBaseNote', userBaseNote);
    
    // Auto-set gender clef based on pitch (Below A3 = Male/Bass)
    setGender(userBaseNote < 57 ? 'male' : 'female');
    
    let noteStr = NOTE_STRINGS[userBaseNote % 12] + (Math.floor(userBaseNote/12)-1);
    let voiceType = "ทั่วไป";
    if (userBaseNote < 50) voiceType = "Bass / Baritone (เสียงต่ำ-กลางชาย)";
    else if (userBaseNote < 60) voiceType = "Tenor / Alto (เสียงสูงชาย-ต่ำหญิง)";
    else voiceType = "Soprano (เสียงสูงหญิง)";
    
    U.calibNoteDisplay.innerText = noteStr;
    U.calibResultNote.innerText = noteStr;
    U.calibResultType.innerText = voiceType;
    
    U.calibResult.classList.remove('hidden');
    U.btnFinishCalib.classList.remove('hidden');
    U.calibProgBar.classList.add('hidden');
}

U.btnStartCalib.addEventListener('click', startCalibration);
U.btnFinishCalib.addEventListener('click', () => {
    U.viewLevels.classList.remove('hidden'); 
    U.viewCalib.classList.add('hidden');
    renderLevelGrid();
});

// --- Level Selection ---
function renderLevelGrid() {
    U.levelGrid.innerHTML = '';
    LEVELS.forEach(level => {
        const card = document.createElement('div');
        card.className = `p-3 md:p-4 rounded-xl relative level-card flex flex-col justify-center relative ${currentLevelId === level.id ? 'selected' : 'bg-white'}`;
        const isPassed = getLocalSetting('pitchperfect_passed_' + level.id, 'false') === 'true';
        const passBadge = isPassed ? '<div class="absolute -top-2 -right-2 bg-green-500 text-white text-xs font-bold px-2 py-1 rounded-full shadow-sm"><i class="fas fa-check mr-1"></i>ผ่านแล้ว</div>' : '';
        
        card.innerHTML = `
            ${passBadge}
            <div class="text-3xl font-black text-slate-300 mb-2">${level.id}</div>
            <h3 class="font-bold text-slate-800 text-sm md:text-base mb-1">${level.name}</h3>
            <p class="text-xs text-slate-500">${level.description}</p>
        `;
        card.onclick = () => { currentLevelId = level.id; renderLevelGrid(); prepareArena(); };
        U.levelGrid.appendChild(card);
    });
    U.startArenaBtn.parentElement.classList.add('hidden'); // Hide the start button wrapper
}
U.startArenaBtn.addEventListener('click', prepareArena);

// --- Arena Setup (Unified Flow) ---
function prepareArena() {
    hideAllViews();
    U.viewArena.classList.remove('hidden');
    initCanvas();
    
    U.resPanel.classList.add('hidden');
    U.blindfold.classList.add('hidden');
    U.actionSingBtn.classList.add('hidden');
    U.tunerNote.innerText = '-';
    U.tunerCents.innerText = '';
    U.micFill.style.height = '0%';
    if(U.micFillMob) U.micFillMob.style.height = '0%';
    
    appMode = U.arenaTestToggle && U.arenaTestToggle.checked ? 'test' : 'practice';
    U.arenaGuideToggle.checked = appMode === 'practice';
    
    startSingPhase(); // Skip static review, jump straight to phase
}
U.actionSingBtn.addEventListener('click', startSingPhase);

function initAudioCtx() {
    if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    if(audioCtx.state === 'suspended') audioCtx.resume();
}

// Note to Y mapping (Diatonic Music Staff)
// C D E F G A B
const chromaticToDiatonic = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6]; 
function getDiatonicIndex(noteNum) {
    const octave = Math.floor(noteNum / 12) - 1; 
    const pc = noteNum % 12;
    return (octave * 7) + chromaticToDiatonic[pc];
}

const LINE_SPACING = 24; // 24px between staff lines (12px per diatonic step)

function getYForNote(noteNum, cents, isMale, centerY) {
    const centerIndex = isMale ? 22 : 34; // D3(22) for Bass, B4(34) for Treble
    
    const noteDiatonic = getDiatonicIndex(noteNum);
    const pc = noteNum % 12;
    const isAccidental = [1, 3, 6, 8, 10].includes(pc); // C#, D#, F#, G#, A#
    
    let visualDiatonic = noteDiatonic;
    if (isAccidental) visualDiatonic += 0.5; // Shift sharp/flat notes halfway visually
    if (cents) visualDiatonic += (cents / 100) * 0.5; // Add cents for pitch accuracy line
    
    return centerY - (visualDiatonic - centerIndex) * (LINE_SPACING / 2);
}

function drawStaffLines(ctx, centerY, isMale) {
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)'; // slate-400
    
    // Draw the 5 lines (-4, -2, 0, 2, 4 from center)
    const offsets = [-4, -2, 0, 2, 4];
    offsets.forEach(off => {
        let y = centerY - off * (LINE_SPACING / 2);
        ctx.beginPath();
        ctx.moveTo(0, y); ctx.lineTo(canvasWidth, y);
        ctx.stroke();
    });
    
    // Draw Clef symbol (fallback to text)
    ctx.font = '40px Arial';
    ctx.fillStyle = 'rgba(148, 163, 184, 0.3)';
    ctx.fillText(isMale ? '\uD834\uDD22' : '\uD834\uDD1E', 10, centerY + 15);
}

function buildTargets() {
    const lvl = LEVELS.find(l => l.id === currentLevelId);
    targetBlocks = [];
    
    let baseNote = userBaseNote || (isMaleVoice ? 48 : 60);
    
    currentBeatDuration = lvl.sequence[0].duration;
    if (currentBeatDuration > 1.5) currentBeatDuration = 1.0;
    
    let leadInTime = currentBeatDuration * 4; 
    let currentTimeOffset = leadInTime;
    let currentX = canvasWidth * 0.7 + (leadInTime * SCROLL_SPEED); // Keep for compatibility if needed elsewhere
    
    let shifts = lvl.shifts || [0];
    
    shifts.forEach((shift, index) => {
        // Practice Mode: Listen Phase
        if (appMode === 'practice') {
            lvl.sequence.forEach(item => {
                let absoluteNoteNum = baseNote + item.step + shift; 
                let noteName = NOTE_STRINGS[absoluteNoteNum % 12] + (Math.floor(absoluteNoteNum/12)-1);
                let displayStr = item.lyric ? item.lyric : noteName;

                targetBlocks.push({
                    x: currentX, 
                    w: item.duration * SCROLL_SPEED,
                    noteNum: absoluteNoteNum, noteStr: displayStr,
                    freq: freqFromNote(absoluteNoteNum),
                    tStart: currentTimeOffset,
                    tEnd: currentTimeOffset + item.duration,
                    type: 'listen'
                });
                currentX += item.duration * SCROLL_SPEED;
                currentTimeOffset += item.duration;
            });
            currentTimeOffset += currentBeatDuration; // Gap before singing
            currentX += currentBeatDuration * SCROLL_SPEED;
        }
        
        // Sing Phase
        lvl.sequence.forEach(item => {
            let absoluteNoteNum = baseNote + item.step + shift; 
            let noteName = NOTE_STRINGS[absoluteNoteNum % 12] + (Math.floor(absoluteNoteNum/12)-1);
            let displayStr = item.lyric ? item.lyric : noteName;

            targetBlocks.push({
                x: currentX, 
                w: item.duration * SCROLL_SPEED,
                noteNum: absoluteNoteNum, noteStr: displayStr,
                freq: freqFromNote(absoluteNoteNum),
                tStart: currentTimeOffset,
                tEnd: currentTimeOffset + item.duration,
                type: 'sing'
            });
            currentX += item.duration * SCROLL_SPEED;
            currentTimeOffset += item.duration;
        });
        
        // Gap before next key shift
        currentTimeOffset += currentBeatDuration * 2; 
        currentX += currentBeatDuration * 2 * SCROLL_SPEED;
    });
}

function playTick(time) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(800, time);
    osc.frequency.exponentialRampToValueAtTime(10, time + 0.1);
    gain.gain.setValueAtTime(0.5, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
    osc.start(time); osc.stop(time + 0.1);
}

// --- Phase: Sing (Real-time Unified) ---
async function startSingPhase() {
    initAudioCtx();
    appMode = U.arenaTestToggle && U.arenaTestToggle.checked ? 'test' : 'practice';
    
    hideAllViews();
    U.viewArena.classList.remove('hidden');
    U.resPanel.classList.add('hidden');
    U.actionSingBtn.classList.add('hidden');
    U.scoreDisplay.innerText = '';
    
    if (appMode === 'test') {
        U.blindfold.classList.remove('hidden');
    } else {
        U.blindfold.classList.add('hidden');
    }
    
    const lvl = LEVELS.find(l => l.id === currentLevelId);
    U.arenaTitle.innerHTML = `${lvl.name} <span class="text-sm text-slate-500 font-normal ml-2" id="arena-status"></span>`;
    
    arenaState = 'running';
    document.getElementById('arena-status').innerText = 'เตรียมตัว...';
    
    pitchHistory = [];
    rawPitches = [];
    activeParticles = [];
    buildTargets();
    
    if (U.arenaGuideToggle.checked) handleGuideTone(targetBlocks[0].freq);
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: { echoCancellation: false, autoGainControl: false, noiseSuppression: false, latency: 0 } 
        });
        recorder = new MediaRecorder(stream);
        recordedChunks = [];
        recorder.ondataavailable = e => recordedChunks.push(e.data);
        recorder.start();
        
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 2048;
        microphone = audioCtx.createMediaStreamSource(stream);
        microphone.connect(analyser);
        
        startTime = audioCtx.currentTime;
        
        // Metronome Count-in 
        for (let i = 0; i < 4; i++) playTick(startTime + (i * currentBeatDuration));
        
        if(animationId) cancelAnimationFrame(animationId);
        drawLoop();
    } catch(err) {
        alert("ไม่สามารถเข้าถึงไมโครโฟนได้ กรุณากดอนุญาตเบราว์เซอร์");
    }
}

// --- Math & Pitch Algo ---
function autoCorrelate(buf, sampleRate) {
    let SIZE = buf.length;
    let rms = 0;
    for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / SIZE);
    
    let meterH = Math.min(100, Math.max(0, (rms * 100) * 5)); 
    U.micFill.style.height = meterH + '%';
    if(U.micFillMob) U.micFillMob.style.height = meterH + '%';
    
    if (rms < 0.03) return -1; // Noise Gate increased for stability

    let r1 = 0, r2 = SIZE - 1, thres = 0.2;
    for (let i = 0; i < SIZE / 2; i++) if (Math.abs(buf[i]) < thres) { r1 = i; break; }
    for (let i = 1; i < SIZE / 2; i++) if (Math.abs(buf[SIZE - i]) < thres) { r2 = SIZE - i; break; }
    buf = buf.slice(r1, r2); SIZE = buf.length;

    let c = new Array(SIZE).fill(0);
    for (let i = 0; i < SIZE; i++) for (let j = 0; j < SIZE - i; j++) c[i] = c[i] + buf[j] * buf[j + i];
    let d = 0; while (c[d] > c[d + 1]) d++;
    let maxval = -1, maxpos = -1;
    for (let i = d; i < SIZE; i++) { if (c[i] > maxval) { maxval = c[i]; maxpos = i; } }
    let T0 = maxpos;
    let x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1];
    let a = (x1 + x3 - 2 * x2) / 2; let b = (x3 - x1) / 2;
    if (a) T0 = T0 - b / (2 * a);
    let pitch = sampleRate / T0;
    if (pitch < 80 || pitch > 1200) return -1;
    return pitch;
}

function getSmoothedPitch(pitch) {
    if (pitch === -1) return -1;
    rawPitches.push(pitch);
    if (rawPitches.length > 9) rawPitches.shift(); // 9 frames median for stability
    let sorted = [...rawPitches].sort((a,b)=>a-b);
    return sorted[Math.floor(sorted.length/2)];
}
function noteFromPitch(f) { return Math.round( 12 * (Math.log(f / 440) / Math.log(2)) ) + 69; }
function freqFromNote(n) { return 440 * Math.pow(2, (n - 69) / 12); }
function centsOff(f, n) { return Math.floor( 1200 * Math.log(f / freqFromNote(n)) / Math.log(2) ); }

// --- Gamification ---
function spawnParticle(x, y, text) {
    activeParticles.push({ x, y, text, alpha: 1, age: 0 });
}
function drawParticles(ctx) {
    for (let i = activeParticles.length - 1; i >= 0; i--) {
        let p = activeParticles[i];
        p.age += 0.02;
        p.y -= 1;
        p.alpha = Math.max(0, 1 - p.age);
        ctx.fillStyle = `rgba(245, 158, 11, ${p.alpha})`; // amber
        ctx.font = "bold 20px Kanit";
        ctx.fillText(p.text, p.x, p.y);
        if (p.alpha <= 0) activeParticles.splice(i, 1);
    }
}

function drawLoop() {
    let now = audioCtx.currentTime;
    let elapsed = now - startTime;
    let scrollOffset = elapsed * SCROLL_SPEED;
    let playheadX = canvasWidth * 0.7; // Moved to 70% for longer history view
    
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    const centerY = canvasHeight / 2;

    drawStaffLines(ctx, centerY, isMaleVoice);
    
    // Playhead Line
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.5)';
    ctx.lineWidth = 2;
    ctx.moveTo(playheadX, 0); ctx.lineTo(playheadX, canvasHeight);
    ctx.stroke();

    let activeBlock = null;
    
    // Draw Blocks
    targetBlocks.forEach(block => {
        let blockX = playheadX + (block.tStart - elapsed) * SCROLL_SPEED;
        let isHit = playheadX >= blockX && playheadX <= blockX + block.w;
        if (isHit) activeBlock = block;

        let y = getYForNote(block.noteNum, 0, isMaleVoice, centerY);
        y = Math.max(30, Math.min(canvasHeight - 30, y)); // Clamp visually
        
        // Listen blocks are gray, Sing blocks are blue
        let baseColor = block.type === 'listen' ? '148, 163, 184' : '59, 130, 246';
        let highlightColor = block.type === 'listen' ? '#cbd5e1' : '#60a5fa';
        
        ctx.fillStyle = isHit ? `rgba(${baseColor}, 0.8)` : `rgba(${baseColor}, 0.5)`;
            
        ctx.beginPath();
        ctx.roundRect(blockX, y - 15, block.w, 30, 8);
        ctx.fill();
        
        ctx.fillStyle = isHit ? '#ffffff' : '#334155';
        ctx.font = 'bold 12px Nunito';
        ctx.fillText(block.noteStr, blockX + 8, y + 4);
    });
    
    let currentType = 'sing';
    if (activeBlock) {
        currentType = activeBlock.type;
    } else {
        let upcoming = targetBlocks.find(b => b.tStart > elapsed);
        if (upcoming) currentType = upcoming.type;
    }
    
    document.getElementById('arena-status').innerText = currentType === 'listen' ? '(ฟังตัวอย่าง)' : '(ตาคุณแล้ว ร้องเลย!)';

    // Play Guide Tone (always play in listening mode, toggle dictates singing mode)
    let shouldPlayGuide = (currentType === 'listen') || (U.arenaGuideToggle && U.arenaGuideToggle.checked);
    handleGuideTone((activeBlock && shouldPlayGuide) ? activeBlock.freq : null);

    // Analyze Pitch (Only in singing blocks)
    if (analyser && currentType === 'sing' && activeBlock) {
        const buf = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(buf);
        let rawP = autoCorrelate(buf, audioCtx.sampleRate);
        let pitch = getSmoothedPitch(rawP);
        
        if (pitch !== -1) {
            // Octave Folding Logic
            if (activeBlock) {
                let targetFreq = activeBlock.freq;
                // If pitch is an octave too high (approx 2x), fold it down
                if (pitch > targetFreq * 1.7 && pitch < targetFreq * 2.3) pitch /= 2;
                // If pitch is an octave too low (approx 0.5x), fold it up
                else if (pitch > targetFreq * 0.4 && pitch < targetFreq * 0.6) pitch *= 2;
            }
            
            let note = noteFromPitch(pitch);
            let cents = centsOff(pitch, note);
            pitchHistory.push({ time: elapsed, noteNum: note, cents: cents });
            
            if (appMode !== 'test') { 
                U.tunerNote.innerText = NOTE_STRINGS[note % 12] + (Math.floor(note/12)-1);
                U.tunerCents.innerText = Math.abs(cents) < 15 ? 'Perfect!' : (cents > 0 ? '+'+cents : cents);
                U.tunerCents.style.color = Math.abs(cents) < 15 ? '#22c55e' : '#f59e0b';
                
                // Gamification Feedback
                if (activeBlock && Math.abs(note - activeBlock.noteNum) === 0 && Math.abs(cents) < 15) {
                    if (Math.random() > 0.95) spawnParticle(playheadX, getYForNote(note, 0, isMaleVoice, centerY) - 20, "⭐ Perfect!");
                }
            }
        } else {
            if (appMode !== 'test') { U.tunerNote.innerText = '-'; U.tunerCents.innerText = ''; }
        }

        // Draw Pitch Line (Only visible in practice)
        if (pitchHistory.length > 0 && appMode !== 'test') {
            ctx.beginPath();
            ctx.lineWidth = 5;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            ctx.strokeStyle = '#f97316'; // Orange vibrant

            let isPathBroken = true;
            pitchHistory.forEach((p, idx) => {
                let x = playheadX - (elapsed - p.time) * SCROLL_SPEED;
                if (idx > 0 && (p.time - pitchHistory[idx-1].time) > 0.1) isPathBroken = true;
                
                if (x > 0 && x < canvasWidth) {
                    let y = getYForNote(p.noteNum, p.cents, isMaleVoice, centerY);
                    y = Math.max(10, Math.min(canvasHeight - 10, y)); // Clamp
                    if (isPathBroken) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                    isPathBroken = false;
                }
            });
            ctx.stroke();
        }
    }

    drawParticles(ctx);

    let lastBlock = targetBlocks[targetBlocks.length - 1];
    if (elapsed > lastBlock.tEnd + 1.25) {
        finishArena();
        return;
    }
    animationId = requestAnimationFrame(drawLoop);
}

function handleGuideTone(freq) {
    if (freq) {
        if (!guideOsc) {
            guideOsc = createVoiceNode(audioCtx, freq);
            guideOsc.connect(audioCtx.destination);
            guideOsc.start();
        }
        guideOsc.setFrequency(freq);
    } else {
        if (guideOsc) { guideOsc.stop(); guideOsc = null; }
    }
}

function finishArena() {
    arenaState = 'idle';
    handleGuideTone(null);
    if (recorder && recorder.state !== 'inactive') {
        recorder.onstop = () => {
            const blob = new Blob(recordedChunks, { 'type' : 'audio/ogg; codecs=opus' });
            audioBlobUrl = URL.createObjectURL(blob);
        };
        recorder.stop();
        if(microphone) microphone.disconnect();
    }
    
    // Evaluate Score based on real timing and hit matching for sing blocks only
    let singBlocks = targetBlocks.filter(b => b.type === 'sing');
    let totalTargetTime = singBlocks.reduce((sum, b) => sum + (b.w / SCROLL_SPEED), 0);
    let hitTime = 0;
    
    pitchHistory.forEach((p, i) => {
        let dt = i > 0 ? (p.time - pitchHistory[i-1].time) : 0.016;
        if (dt > 0.1) dt = 0.016;
        
        let hitBlock = singBlocks.find(b => p.time >= b.tStart && p.time <= b.tEnd);
        
        // Allow up to 1.5 semitones (150 cents) tolerance for beginners!
        if (hitBlock) {
            let noteDiff = p.noteNum - hitBlock.noteNum;
            let totalCentsOff = (noteDiff * 100) + p.cents;
            if (Math.abs(totalCentsOff) <= 150) {
                hitTime += dt;
            }
        }
    });
    
    let totalScore = 0;
    if (totalTargetTime > 0) {
        totalScore = Math.min(100, Math.floor((hitTime / totalTargetTime) * 100));
    }
    
    U.blindfold.classList.add('hidden'); 
    U.resPanel.classList.remove('hidden');
    U.scoreDisplay.innerText = totalScore + '%';
    
    let feedback = '';
    if (totalScore >= 80) {
        feedback = 'สุดยอด! เสียงตรงเป๊ะมาก! 🌟';
        triggerConfetti();
        saveLocalSetting('pitchperfect_passed_' + currentLevelId, 'true');
    } else if (totalScore >= 40) { // Beginner friendly: 40% hit time is a pass!
        feedback = 'เก่งมาก สอบผ่าน! 🎉';
        triggerConfetti();
        saveLocalSetting('pitchperfect_passed_' + currentLevelId, 'true');
    } else {
        feedback = 'เกือบแล้ว! ลองตั้งใจฟังเสียงนำแล้วเอาใหม่นะ ✌️';
    }
    
    U.feedbackDisplay.innerText = feedback;
    
    // Push Score to Main App (Supabase) if user is logged in
    if (userId && window.SupabaseAPI && window.SupabaseAPI.saveSession) {
        const lvl = LEVELS.find(l => l.id === currentLevelId);
        let durationMinutes = Math.max(1, Math.round((audioCtx.currentTime - startTime) / 60));
        let gameName = `Vocal Trainer: ${lvl.name}`;
        
        let sessionStartTime = new Date(Date.now() - durationMinutes * 60000).toISOString();
        
        window.SupabaseAPI.saveSession(userId, gameName, totalScore, durationMinutes, sessionStartTime)
            .then(res => console.log('Saved Vocal Trainer session to Supabase', res))
            .catch(err => console.error('Error saving Vocal Trainer session', err));
    }
    
    renderLevelGrid(); // Update stars in background
    
    // Static Review Draw
    appMode = 'practice'; // reveal graph
    drawReviewStatic();
}

function triggerConfetti() {
    if(window.confetti) {
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    }
}

// Static Draw for Reviewing before/after
function drawReviewStatic() {
    if(!canvas) return;
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    const centerY = canvasHeight/2;
    
    drawStaffLines(ctx, centerY, isMaleVoice);
    
    // draw blocks
    targetBlocks.forEach(b => {
        let y = getYForNote(b.noteNum, 0, isMaleVoice, centerY);
        y = Math.max(30, Math.min(canvasHeight - 30, y));
        ctx.fillStyle = 'rgba(203, 213, 225, 0.5)';
        ctx.beginPath(); ctx.roundRect(100 + b.x - targetBlocks[0].x, y-15, b.w, 30, 8); ctx.fill();
    });
    
    // draw line
    if(pitchHistory.length > 0) {
        ctx.beginPath(); ctx.lineWidth = 5; ctx.strokeStyle = '#f97316';
        let isBroken = true;
        pitchHistory.forEach((p, idx) => {
            let x = 100 + (p.time * SCROLL_SPEED); 
            if (idx > 0 && (p.time - pitchHistory[idx-1].time) > 0.1) isBroken = true;
            let y = getYForNote(p.noteNum, p.cents, isMaleVoice, centerY);
            y = Math.max(10, Math.min(canvasHeight - 10, y));
            if (isBroken) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            isBroken = false;
        });
        ctx.stroke();
    }
}

function replayAudio() { if(audioBlobUrl) { new Audio(audioBlobUrl).play(); } }

function stopAndGoBack() {
    if(animationId) cancelAnimationFrame(animationId);
    handleGuideTone(null);
    if(audioCtx) { audioCtx.close(); audioCtx = null; }
    goBackToDashboard();
}

// --- Breathing Trainer Controller ---
let breathPreset = 'basic'; // 'basic', 'relax', 'stamina'
let breathPresets = {
    basic: { name: 'เริ่มต้น', inhale: 4, hold: 4, exhale: 8, cycles: 5 },
    relax: { name: '4-7-8', inhale: 4, hold: 7, exhale: 8, cycles: 5 },
    stamina: { name: 'ความอึดปอด', inhale: 4, hold: 8, exhale: 16, cycles: 4 }
};

let breathRunning = false;
let breathInterval = null;
let breathPhase = 'idle'; // 'inhale', 'hold', 'exhale'
let breathTimeLeft = 0;
let breathCurrentCycle = 0;
let breathTotalSeconds = 0;
let breathTotalTimer = null;
let breathMicAnalyser = null;

function setBreathingPreset(preset) {
    if (breathRunning) resetBreathingSession();
    breathPreset = preset;
    
    ['basic', 'relax', 'stamina'].forEach(p => {
        const btn = document.getElementById(`breath-preset-${p}`);
        if (!btn) return;
        if (p === preset) {
            btn.className = "py-2 px-4 rounded-full text-sm font-bold bg-emerald-500 text-white shadow-md transition";
        } else {
            btn.className = "py-2 px-4 rounded-full text-sm font-bold bg-slate-200 text-slate-700 hover:bg-slate-300 transition";
        }
    });
    
    const phaseEl = document.getElementById('breath-phase-text');
    const timerEl = document.getElementById('breath-timer-text');
    const subEl = document.getElementById('breath-sub-text');
    const countEl = document.getElementById('breath-cycle-count');
    
    if (phaseEl) phaseEl.innerText = 'พร้อมแล้ว';
    if (timerEl) timerEl.innerText = breathPresets[preset].inhale;
    if (subEl) subEl.innerText = 'กดปุ่มเริ่มฝึก';
    if (countEl) countEl.innerText = `รอบที่: 0 / ${breathPresets[preset].cycles}`;
}

function toggleBreathingSession() {
    if (breathRunning) {
        pauseBreathingSession();
    } else {
        startBreathingSession();
    }
}

function startBreathingSession() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();

    breathRunning = true;
    const startBtn = document.getElementById('btn-start-breath');
    if (startBtn) startBtn.innerHTML = `<i class="fas fa-pause"></i> หยุดชั่วคราว`;
    
    if (breathPhase === 'idle') {
        breathCurrentCycle = 1;
        breathTotalSeconds = 0;
        startBreathPhase('inhale');
    } else {
        runBreathTimer();
    }
    
    if (!breathTotalTimer) {
        breathTotalTimer = setInterval(() => {
            breathTotalSeconds++;
            const mins = String(Math.floor(breathTotalSeconds / 60)).padStart(2, '0');
            const secs = String(breathTotalSeconds % 60).padStart(2, '0');
            const totalEl = document.getElementById('breath-total-time');
            if (totalEl) totalEl.innerText = `เวลารวม: ${mins}:${secs}`;
        }, 1000);
    }

    initBreathMic();
}

function pauseBreathingSession() {
    breathRunning = false;
    if (breathInterval) clearInterval(breathInterval);
    if (breathTotalTimer) { clearInterval(breathTotalTimer); breathTotalTimer = null; }
    const startBtn = document.getElementById('btn-start-breath');
    if (startBtn) startBtn.innerHTML = `<i class="fas fa-play"></i> เริ่มต่อ`;
    const phaseEl = document.getElementById('breath-phase-text');
    if (phaseEl) phaseEl.innerText = 'หยุดชั่วคราว';
}

function resetBreathingSession() {
    pauseBreathingSession();
    breathPhase = 'idle';
    breathTimeLeft = 0;
    breathCurrentCycle = 0;
    breathTotalSeconds = 0;
    
    const sphere = document.getElementById('breath-sphere');
    if (sphere) {
        sphere.style.transitionDuration = '1000ms';
        sphere.className = "w-28 h-28 rounded-full bg-emerald-400 shadow-[0_0_40px_rgba(52,211,153,0.6)] flex flex-col items-center justify-center transition-all duration-1000 transform scale-100 text-white p-4";
    }
    
    const phaseEl = document.getElementById('breath-phase-text');
    const timerEl = document.getElementById('breath-timer-text');
    const subEl = document.getElementById('breath-sub-text');
    const countEl = document.getElementById('breath-cycle-count');
    const totalEl = document.getElementById('breath-total-time');
    const startBtn = document.getElementById('btn-start-breath');

    if (phaseEl) phaseEl.innerText = 'พร้อมแล้ว';
    if (timerEl) timerEl.innerText = breathPresets[breathPreset].inhale;
    if (subEl) subEl.innerText = 'กดปุ่มเริ่มฝึก';
    if (countEl) countEl.innerText = `รอบที่: 0 / ${breathPresets[breathPreset].cycles}`;
    if (totalEl) totalEl.innerText = 'เวลารวม: 00:00';
    if (startBtn) startBtn.innerHTML = `<i class="fas fa-play"></i> เริ่มฝึกลมหายใจ`;
}

function startBreathPhase(phase) {
    breathPhase = phase;
    const cfg = breathPresets[breathPreset];
    const sphere = document.getElementById('breath-sphere');
    const phaseEl = document.getElementById('breath-phase-text');
    const subEl = document.getElementById('breath-sub-text');
    const timerEl = document.getElementById('breath-timer-text');
    const countEl = document.getElementById('breath-cycle-count');

    if (phase === 'inhale') {
        breathTimeLeft = cfg.inhale;
        playTick(audioCtx.currentTime);
        if (phaseEl) phaseEl.innerText = '🌬️ สูดลมเข้า';
        if (subEl) subEl.innerText = 'หายใจเข้าทางปาก/จมูก (ท้องป่อง)';
        if (sphere) {
            sphere.style.transitionDuration = `${cfg.inhale * 1000}ms`;
            sphere.className = "w-28 h-28 rounded-full bg-sky-500 shadow-[0_0_50px_rgba(14,165,233,0.8)] flex flex-col items-center justify-center transition-all transform scale-[2.2] text-white p-4";
        }
    } else if (phase === 'hold') {
        breathTimeLeft = cfg.hold;
        playTick(audioCtx.currentTime);
        if (phaseEl) phaseEl.innerText = '🛑 กักลมหายใจ';
        if (subEl) subEl.innerText = 'กลั้นลมไว้อย่างผ่อนคลาย';
        if (sphere) {
            sphere.style.transitionDuration = '500ms';
            sphere.className = "w-28 h-28 rounded-full bg-amber-500 shadow-[0_0_50px_rgba(245,158,11,0.8)] flex flex-col items-center justify-center transition-all transform scale-[2.2] text-white p-4";
        }
    } else if (phase === 'exhale') {
        breathTimeLeft = cfg.exhale;
        playTick(audioCtx.currentTime);
        if (phaseEl) phaseEl.innerText = '💨 พ่นลม Ss...';
        if (subEl) subEl.innerText = 'ปล่อยลมผ่านไรฟัน เสียง สสส... (ท้องแฟบ)';
        if (sphere) {
            sphere.style.transitionDuration = `${cfg.exhale * 1000}ms`;
            sphere.className = "w-28 h-28 rounded-full bg-emerald-500 shadow-[0_0_50px_rgba(16,185,129,0.8)] flex flex-col items-center justify-center transition-all transform scale-100 text-white p-4";
        }
    }
    
    if (timerEl) timerEl.innerText = breathTimeLeft;
    if (countEl) countEl.innerText = `รอบที่: ${breathCurrentCycle} / ${cfg.cycles}`;
    
    runBreathTimer();
}

function runBreathTimer() {
    if (breathInterval) clearInterval(breathInterval);
    
    breathInterval = setInterval(() => {
        if (!breathRunning) return;
        
        breathTimeLeft--;
        const timerEl = document.getElementById('breath-timer-text');
        
        if (breathTimeLeft > 0) {
            if (timerEl) timerEl.innerText = breathTimeLeft;
            if (audioCtx) playTick(audioCtx.currentTime);
        } else {
            const cfg = breathPresets[breathPreset];
            if (breathPhase === 'inhale') {
                startBreathPhase('hold');
            } else if (breathPhase === 'hold') {
                startBreathPhase('exhale');
            } else if (breathPhase === 'exhale') {
                if (breathCurrentCycle < cfg.cycles) {
                    breathCurrentCycle++;
                    startBreathPhase('inhale');
                } else {
                    finishBreathingSession();
                }
            }
        }
    }, 1000);
}

function finishBreathingSession() {
    resetBreathingSession();
    triggerConfetti();
    
    const phaseEl = document.getElementById('breath-phase-text');
    const subEl = document.getElementById('breath-sub-text');
    if (phaseEl) phaseEl.innerText = '🎉 สำเร็จ!';
    if (subEl) subEl.innerText = 'เยี่ยมมาก! ปอดและกระบังลมของคุณแข็งแรงขึ้นแล้ว';
    
    if (userId && window.SupabaseAPI && window.SupabaseAPI.saveSession) {
        let mins = Math.max(1, Math.round(breathTotalSeconds / 60));
        window.SupabaseAPI.saveSession(userId, `Vocal Breathing: ${breathPresets[breathPreset].name}`, 100, mins, new Date().toISOString());
    }
}

function initBreathMic() {
    if (breathMicAnalyser || !navigator.mediaDevices) return;
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const source = audioCtx.createMediaStreamSource(stream);
            breathMicAnalyser = audioCtx.createAnalyser();
            breathMicAnalyser.fftSize = 256;
            source.connect(breathMicAnalyser);
            updateBreathMicLevel();
        })
        .catch(err => {
            const statusEl = document.getElementById('breath-mic-status');
            if (statusEl) statusEl.innerText = 'ไม่เปิดไมค์';
        });
}

function updateBreathMicLevel() {
    if (!breathMicAnalyser || !breathRunning) {
        const fill = document.getElementById('breath-mic-fill');
        if (fill) fill.style.width = '0%';
        requestAnimationFrame(updateBreathMicLevel);
        return;
    }
    
    const data = new Uint8Array(breathMicAnalyser.frequencyBinCount);
    breathMicAnalyser.getByteFrequencyData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i];
    let avg = sum / data.length;
    let percent = Math.min(100, Math.round((avg / 128) * 100));
    
    const fill = document.getElementById('breath-mic-fill');
    const statusEl = document.getElementById('breath-mic-status');
    if (fill) fill.style.width = `${percent}%`;
    if (statusEl) {
        if (breathPhase === 'exhale') {
            statusEl.innerText = percent > 15 ? 'กำลังผ่อนลม สสส... 👍' : 'ผ่อนลมเบาไปนิด';
            statusEl.className = percent > 15 ? 'text-emerald-600 font-bold' : 'text-amber-500 font-bold';
        } else {
            statusEl.innerText = 'เปิดการวัด';
            statusEl.className = 'text-slate-400';
        }
    }
    
    requestAnimationFrame(updateBreathMicLevel);
}

// Window bindings for inline HTML handlers
window.setBreathingPreset = setBreathingPreset;
window.toggleBreathingSession = toggleBreathingSession;
window.resetBreathingSession = resetBreathingSession;

U.voiceToggle.addEventListener('change', e => {
    isMaleVoice = e.target.checked;
    if(arenaState === 'idle') drawReviewStatic();
});
window.U = U; // Export for debugging
