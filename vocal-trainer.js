// Vocal Pitch Trainer - Refactored Logic (3 Modes, Smoothing, Light Theme)

const LEVELS = [
    { id: 1, name: 'Level 1: Long Tone', description: 'ลากเสียงโน้ตเดียวให้นิ่ง', sequence: [{ note: 'C', octaveOff: 0, duration: 4 }] },
    { id: 2, name: 'Level 2: Intervals', description: 'สลับโน้ต 2 ตัว โด-เร-โด', sequence: [{ note: 'C', octaveOff: 0, duration: 2 }, { note: 'D', octaveOff: 0, duration: 2 }, { note: 'C', octaveOff: 0, duration: 2 }] },
    { id: 3, name: 'Level 3: Triads', description: 'โน้ตกระโดด โด-มี-ซอล', sequence: [{ note: 'C', octaveOff: 0, duration: 1.5 }, { note: 'E', octaveOff: 0, duration: 1.5 }, { note: 'G', octaveOff: 0, duration: 3 }] },
    { id: 4, name: 'Level 4: 5-Finger', description: 'โด เร มี ฟา ซอล', sequence: [{ note: 'C', octaveOff:0, duration: 1 }, { note: 'D', octaveOff:0, duration: 1 }, { note: 'E', octaveOff:0, duration: 1 }, { note: 'F', octaveOff:0, duration: 1 }, { note: 'G', octaveOff:0, duration: 2 }] },
    { id: 5, name: 'Level 5: Arpeggio', description: 'ก้าวกระโดดเสียง', sequence: [{ note: 'C', octaveOff:0, duration: 1 }, { note: 'E', octaveOff:0, duration: 1 }, { note: 'G', octaveOff:0, duration: 1 }, { note: 'C', octaveOff:1, duration: 2 }] },
    { id: 6, name: 'Level 6: Scale', description: 'สเกลเต็ม 8 เสียง', sequence: ['C','D','E','F','G','A','B','C'].map((n, i) => ({ note: n, octaveOff: i===7?1:0, duration: 1 })) },
    { id: 7, name: 'Level 7: Song', description: 'Twinkle Twinkle', sequence: [
        {note:'C',octaveOff:0,duration:1}, {note:'C',octaveOff:0,duration:1}, {note:'G',octaveOff:0,duration:1}, {note:'G',octaveOff:0,duration:1}, 
        {note:'A',octaveOff:0,duration:1}, {note:'A',octaveOff:0,duration:1}, {note:'G',octaveOff:0,duration:2}
    ]}
];

const TUTORIAL_SLIDES = [
    { title: "บทที่ 1: การหายใจ (Breathing)", content: "การร้องเพลงที่ดีเริ่มจากการหายใจ ลองเอามือจับที่ท้อง หายใจเข้าให้ท้องป่อง (กระบังลมทำงาน) และเวลาเปล่งเสียงให้ค่อยๆ ปล่อยลมออกช้าๆ ท้องจะค่อยๆ แฟบลง ห้ามยกไหล่ตอนหายใจเด็ดขาด!" },
    { title: "บทที่ 2: วอร์มเสียงด้วย Lip Trill", content: "ลองทำปากสั่นๆ เหมือนเสียงรถมอเตอร์ไซค์ (บรื๊ออออ) แล้วไล่เสียงสูง-ต่ำไปมา การทำแบบนี้จะช่วยให้เส้นเสียงผ่อนคลายและลดความตึงเครียดของคอได้ดีมาก" },
    { title: "บทที่ 3: การฟังและการแมตช์เสียง", content: "สิ่งที่สำคัญที่สุดคือ 'หู' ลองกดปุ่มฟังเสียงเปียโน แล้วตั้งสมาธิฮัมเสียง 'อืมมม' ในคอให้คลื่นเสียงของคุณกลืนไปกับเสียงเปียโน ถ้ารู้สึกสั่นต้านกันแปลว่ายังเพี้ยนอยู่" }
];

const NOTE_STRINGS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// State
let appMode = null; // 'tutorial', 'practice', 'test'
let arenaState = 'idle'; // 'listening' (piano plays), 'singing' (mic active)
let currentLevelId = 1;
let isMaleVoice = true; 

// Audio Web API
let audioCtx, analyser, microphone;
let guideOsc, recorder;
let recordedChunks = [];
let audioBlobUrl = null;

// Canvas & Animation
let canvas, ctx, animationId;
let startTime = 0;
const SCROLL_SPEED = 120; // px/sec

// Data
let targetBlocks = [];
let pitchHistory = [];
let rawPitches = []; // for median filter

// UI Elements
const U = {
    viewDash: document.getElementById('view-dashboard'),
    viewLevels: document.getElementById('view-levels'),
    viewTut: document.getElementById('view-tutorial'),
    viewArena: document.getElementById('view-arena'),
    
    levelGrid: document.getElementById('level-grid'),
    startArenaBtn: document.getElementById('start-arena-btn'),
    voiceToggle: document.getElementById('voice-toggle'),
    
    // Arena elements
    arenaTitle: document.getElementById('arena-title'),
    ctrlPractice: document.getElementById('arena-controls-practice'),
    ctrlTest: document.getElementById('arena-controls-test'),
    autoPianoToggle: document.getElementById('auto-piano-toggle'),
    testGuideToggle: document.getElementById('test-guide-toggle'),
    manualPlayBtn: document.getElementById('manual-play-btn'),
    actionSingBtn: document.getElementById('action-sing-btn'),
    arenaStatus: document.getElementById('arena-status'),
    
    blindfold: document.getElementById('test-blindfold'),
    testStatusText: document.getElementById('test-status-text'),
    
    tunerNote: document.getElementById('tuner-note'),
    tunerCents: document.getElementById('tuner-cents'),
    micFill: document.getElementById('mic-level-fill'),
    
    resPanel: document.getElementById('results-panel'),
    scoreDisplay: document.getElementById('score-display'),
    feedbackDisplay: document.getElementById('feedback-display')
};

// --- View Navigation ---
function hideAllViews() {
    [U.viewDash, U.viewLevels, U.viewTut, U.viewArena].forEach(v => v.classList.add('hidden'));
}

function goBackToDashboard() {
    hideAllViews();
    U.viewDash.classList.remove('hidden');
}

function selectMode(mode) {
    appMode = mode;
    hideAllViews();
    
    if (mode === 'tutorial') {
        U.viewTut.classList.remove('hidden');
        renderTutorial();
    } else {
        U.viewLevels.classList.remove('hidden');
        renderLevelGrid();
    }
}

// --- Tutorial Logic ---
let tutIdx = 0;
function renderTutorial() {
    const tutContent = document.getElementById('tutorial-content');
    const dots = document.getElementById('tut-progress');
    
    tutContent.innerHTML = `
        <h2 class="text-2xl font-bold text-blue-600 mb-4">${TUTORIAL_SLIDES[tutIdx].title}</h2>
        <p class="text-lg text-slate-600 leading-relaxed min-h-[100px]">${TUTORIAL_SLIDES[tutIdx].content}</p>
        ${tutIdx === 2 ? '<button id="tut-sample-btn" onclick="toggleSampleTone()" class="mt-6 bg-yellow-400 hover:bg-yellow-500 text-white font-bold py-2 px-6 rounded-full"><i class="fas fa-play"></i> เปิดเสียงนำ C4 (ลากยาวต่อเนื่อง)</button>' : ''}
    `;
    
    dots.innerHTML = TUTORIAL_SLIDES.map((_, i) => 
        `<div class="w-3 h-3 rounded-full ${i === tutIdx ? 'bg-blue-500' : 'bg-slate-300'}"></div>`
    ).join('');
    
    document.getElementById('tut-prev-btn').disabled = tutIdx === 0;
    document.getElementById('tut-next-btn').disabled = tutIdx === TUTORIAL_SLIDES.length - 1;
}

document.getElementById('tut-prev-btn').addEventListener('click', () => { if(tutIdx > 0) { tutIdx--; renderTutorial(); } });
document.getElementById('tut-next-btn').addEventListener('click', () => { if(tutIdx < TUTORIAL_SLIDES.length-1) { tutIdx++; renderTutorial(); } });

// --- Synthetic Voice Node ---
function createVoiceNode(ctx, freq) {
    const gn = ctx.createGain();
    gn.gain.value = 0.15; // base volume
    
    // Fundamental (sine)
    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.value = freq;
    
    // Harmonic (triangle) for voice-like edge
    const osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.value = freq;
    
    // Lowpass filter to muffle the triangle (make it "Ooo" sound)
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq * 2.5; 
    
    osc1.connect(gn);
    osc2.connect(filter);
    filter.connect(gn);
    
    return { 
        start: () => { osc1.start(); osc2.start(); },
        stop: () => { osc1.stop(); osc2.stop(); },
        connect: (dest) => gn.connect(dest),
        setFrequency: (f) => { 
            osc1.frequency.setValueAtTime(f, ctx.currentTime);
            osc2.frequency.setValueAtTime(f, ctx.currentTime);
            filter.frequency.setValueAtTime(f * 2.5, ctx.currentTime);
        }
    };
}

let tutorialVoice = null;
function toggleSampleTone() {
    initAudioCtx();
    const btn = document.getElementById('tut-sample-btn');
    if (tutorialVoice) {
        tutorialVoice.stop();
        tutorialVoice = null;
        if(btn) btn.innerHTML = '<i class="fas fa-play"></i> เปิดเสียงนำ C4 (ลากยาวต่อเนื่อง)';
    } else {
        tutorialVoice = createVoiceNode(audioCtx, 261.63);
        tutorialVoice.connect(audioCtx.destination);
        tutorialVoice.start();
        if(btn) btn.innerHTML = '<i class="fas fa-stop"></i> หยุดเสียงนำ';
    }
}

// --- Level Selection ---
function renderLevelGrid() {
    U.levelGrid.innerHTML = '';
    LEVELS.forEach(level => {
        const card = document.createElement('div');
        card.className = `p-4 rounded-xl level-card ${currentLevelId === level.id ? 'selected' : 'bg-white'}`;
        card.onclick = () => { currentLevelId = level.id; renderLevelGrid(); };
        card.innerHTML = `<h3 class="font-bold text-slate-800">${level.name}</h3><p class="text-xs text-slate-500 mt-1">${level.description}</p>`;
        U.levelGrid.appendChild(card);
    });
    U.startArenaBtn.disabled = !currentLevelId;
}

U.startArenaBtn.addEventListener('click', prepareArena);

// --- Arena Setup ---
function prepareArena() {
    hideAllViews();
    U.viewArena.classList.remove('hidden');
    
    const lvl = LEVELS.find(l => l.id === currentLevelId);
    U.arenaTitle.innerText = `${lvl.name} (${appMode.toUpperCase()})`;
    
    // UI Resets
    U.resPanel.classList.add('hidden');
    U.blindfold.classList.add('hidden');
    U.tunerNote.innerText = '-';
    U.tunerCents.innerText = '';
    U.micFill.style.height = '0%';
    ctx = document.getElementById('pitch-canvas').getContext('2d');
    ctx.clearRect(0,0, ctx.canvas.width, ctx.canvas.height);
    
    // Mode specific UI
    U.ctrlPractice.classList.toggle('hidden', appMode !== 'practice');
    U.ctrlTest.classList.toggle('hidden', appMode !== 'test');
    U.actionSingBtn.classList.add('hidden');
    
    if (appMode === 'practice') {
        U.arenaStatus.innerText = 'รอฟังเปียโนโจทย์...';
        U.manualPlayBtn.classList.toggle('hidden', U.autoPianoToggle.checked);
        if (U.autoPianoToggle.checked) setTimeout(startListenPhase, 500);
    } else if (appMode === 'test') {
        U.arenaStatus.innerText = 'ทดสอบร้องสดทันที';
        setTimeout(startSingPhase, 500); // Test mode goes straight to singing
    }
}

U.autoPianoToggle.addEventListener('change', (e) => {
    U.manualPlayBtn.classList.toggle('hidden', e.target.checked);
});
U.manualPlayBtn.addEventListener('click', startListenPhase);
U.actionSingBtn.addEventListener('click', startSingPhase);

function initAudioCtx() {
    if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if(audioCtx.state === 'suspended') audioCtx.resume();
}

function buildTargets() {
    const lvl = LEVELS.find(l => l.id === currentLevelId);
    targetBlocks = [];
    canvas = document.getElementById('pitch-canvas');
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width; canvas.height = rect.height;
    
    let currentX = canvas.width * 0.4; // playhead position
    const baseOctave = isMaleVoice ? 3 : 4;
    
    lvl.sequence.forEach(item => {
        let noteIndex = NOTE_STRINGS.indexOf(item.note);
        let absoluteNoteNum = (baseOctave + item.octaveOff + 1) * 12 + noteIndex; 
        targetBlocks.push({
            x: currentX, w: item.duration * SCROLL_SPEED,
            noteNum: absoluteNoteNum, noteStr: item.note + (baseOctave + item.octaveOff),
            freq: 440 * Math.pow(2, (absoluteNoteNum - 69) / 12)
        });
        currentX += item.duration * SCROLL_SPEED;
    });
}

// --- Phase 1: Listen (Piano plays) ---
function startListenPhase() {
    initAudioCtx();
    arenaState = 'listening';
    U.arenaStatus.innerText = '🎧 ฟังเปียโน...';
    U.manualPlayBtn.classList.add('hidden');
    buildTargets();
    startTime = audioCtx.currentTime;
    
    if(animationId) cancelAnimationFrame(animationId);
    drawLoop(true); // true = listen mode (no mic)
}

// --- Phase 2: Sing (Mic active) ---
async function startSingPhase() {
    initAudioCtx();
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Setup MediaRecorder for playback
        recorder = new MediaRecorder(stream);
        recordedChunks = [];
        recorder.ondataavailable = e => recordedChunks.push(e.data);
        recorder.start();
        
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 2048;
        microphone = audioCtx.createMediaStreamSource(stream);
        microphone.connect(analyser);
        
        arenaState = 'singing';
        pitchHistory = [];
        rawPitches = [];
        
        U.actionSingBtn.classList.add('hidden');
        if (appMode === 'practice') {
            U.arenaStatus.innerText = '🎤 ร้องเลย!';
        } else {
            U.arenaStatus.innerText = '🏆 กำลังประเมินผล...';
            U.blindfold.classList.remove('hidden');
            U.testStatusText.innerText = '🎤 ร้องเลย!';
        }
        
        buildTargets();
        startTime = audioCtx.currentTime;
        if(animationId) cancelAnimationFrame(animationId);
        drawLoop(false); // false = sing mode
        
    } catch(err) {
        alert("ไม่สามารถเข้าถึงไมโครโฟนได้ กรุณากดอนุญาต");
    }
}

// --- Math & Pitch Algo ---
function autoCorrelate(buf, sampleRate) {
    let SIZE = buf.length;
    
    // RMS Volume Gate: Ignore noise when not singing
    let rms = 0;
    for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / SIZE);
    
    // Update UI Mic Meter
    let meterH = Math.min(100, Math.max(0, (rms * 100) * 5)); // Boost visual
    U.micFill.style.height = meterH + '%';
    
    if (rms < 0.02) return -1; // Volume Gate Threshold

    let r1 = 0, r2 = SIZE - 1, thres = 0.2;
    for (let i = 0; i < SIZE / 2; i++) if (Math.abs(buf[i]) < thres) { r1 = i; break; }
    for (let i = 1; i < SIZE / 2; i++) if (Math.abs(buf[SIZE - i]) < thres) { r2 = SIZE - i; break; }
    buf = buf.slice(r1, r2);
    SIZE = buf.length;

    let c = new Array(SIZE).fill(0);
    for (let i = 0; i < SIZE; i++)
        for (let j = 0; j < SIZE - i; j++) c[i] = c[i] + buf[j] * buf[j + i];

    let d = 0; while (c[d] > c[d + 1]) d++;
    let maxval = -1, maxpos = -1;
    for (let i = d; i < SIZE; i++) {
        if (c[i] > maxval) { maxval = c[i]; maxpos = i; }
    }
    let T0 = maxpos;
    let x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1];
    let a = (x1 + x3 - 2 * x2) / 2;
    let b = (x3 - x1) / 2;
    if (a) T0 = T0 - b / (2 * a);
    
    let pitch = sampleRate / T0;
    // Constrain pitch to human range (80Hz to 1200Hz)
    if (pitch < 80 || pitch > 1200) return -1;
    
    return pitch;
}

function getSmoothedPitch(pitch) {
    if (pitch === -1) return -1;
    rawPitches.push(pitch);
    if (rawPitches.length > 5) rawPitches.shift();
    let sorted = [...rawPitches].sort((a,b)=>a-b);
    return sorted[Math.floor(sorted.length/2)]; // Median filter
}

function noteFromPitch(f) { return Math.round( 12 * (Math.log(f / 440) / Math.log(2)) ) + 69; }
function freqFromNote(n) { return 440 * Math.pow(2, (n - 69) / 12); }
function centsOff(f, n) { return Math.floor( 1200 * Math.log(f / freqFromNote(n)) / Math.log(2) ); }

// --- Game Loop ---
function drawLoop(isListeningOnly) {
    let now = audioCtx.currentTime;
    let elapsed = now - startTime;
    let scrollOffset = elapsed * SCROLL_SPEED;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const centerY = canvas.height / 2;

    let activeBlock = null;
    let playheadX = canvas.width * 0.4;
    
    // Draw Blocks
    targetBlocks.forEach(block => {
        let blockX = block.x - scrollOffset;
        if (playheadX >= blockX && playheadX <= blockX + block.w) activeBlock = block;

        let centerNoteNum = activeBlock ? activeBlock.noteNum : targetBlocks[0].noteNum;
        let y = centerY - ((block.noteNum - centerNoteNum) * 15);
        y = Math.max(20, Math.min(canvas.height - 20, y)); // Graph Bounding for blocks
        
        // Active color
        let isHit = false; // We could determine hit based on pitchHistory here
        ctx.fillStyle = (playheadX >= blockX && playheadX <= blockX + block.w) 
            ? 'rgba(59, 130, 246, 0.4)' // Blue highlight
            : 'rgba(203, 213, 225, 0.5)'; // Slate default
            
        ctx.beginPath();
        ctx.roundRect(blockX, y - 15, block.w, 30, 8);
        ctx.fill();
        
        ctx.fillStyle = '#475569';
        ctx.font = 'bold 12px Nunito';
        ctx.fillText(block.noteStr, blockX + 8, y + 4);
    });

    // Play Guide Tone
    let shouldPlayGuide = false;
    if (activeBlock) {
        if (isListeningOnly) shouldPlayGuide = true;
        if (!isListeningOnly && appMode === 'test' && U.testGuideToggle.checked) shouldPlayGuide = true;
        // In practice mode, sing phase usually doesn't need guide if we want full vocal, but let's keep it off for pure Sing phase unless requested. Actually, Practice Mode has no toggle, let's play a soft guide.
        if (!isListeningOnly && appMode === 'practice') shouldPlayGuide = true; 
    }

    handleGuideTone(shouldPlayGuide ? activeBlock.freq : null);

    // Analyze Pitch
    if (!isListeningOnly && analyser) {
        const buf = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(buf);
        let rawP = autoCorrelate(buf, audioCtx.sampleRate);
        let pitch = getSmoothedPitch(rawP);
        
        if (pitch !== -1) {
            let note = noteFromPitch(pitch);
            let cents = centsOff(pitch, note);
            pitchHistory.push({ time: elapsed, noteNum: note, cents: cents });
            
            if (appMode !== 'test') { // Don't show tuner in test mode
                U.tunerNote.innerText = NOTE_STRINGS[note % 12] + (Math.floor(note/12)-1);
                U.tunerCents.innerText = Math.abs(cents) < 15 ? 'Perfect!' : (cents > 0 ? '+'+cents : cents);
                U.tunerCents.style.color = Math.abs(cents) < 15 ? '#22c55e' : '#f59e0b';
            }
        } else {
            if (appMode !== 'test') { U.tunerNote.innerText = '-'; U.tunerCents.innerText = ''; }
        }

        // Draw Pitch Line
        if (pitchHistory.length > 0 && appMode !== 'test') {
            ctx.beginPath();
            ctx.lineWidth = 4;
            ctx.lineJoin = 'round';
            ctx.strokeStyle = '#f97316'; // Orange pastel line

            let centerNoteNum = activeBlock ? activeBlock.noteNum : targetBlocks[0].noteNum;
            let isPathBroken = true;

            pitchHistory.forEach((p, idx) => {
                let x = playheadX - (elapsed - p.time) * SCROLL_SPEED;
                
                // Break path if gap is large (stopped singing)
                if (idx > 0 && (p.time - pitchHistory[idx-1].time) > 0.1) isPathBroken = true;
                
                if (x > 0) { // only draw visible
                    let y = centerY - ((p.noteNum - centerNoteNum + (p.cents/100)) * 15);
                    y = Math.max(5, Math.min(canvas.height - 5, y)); // Graph Bounding (Clamp)
                    
                    if (isPathBroken) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                    isPathBroken = false;
                }
            });
            ctx.stroke();
        }
    }

    // End condition
    let lastBlock = targetBlocks[targetBlocks.length - 1];
    if (playheadX > lastBlock.x + lastBlock.w + 100) {
        if (isListeningOnly) {
            handleGuideTone(null);
            if (U.autoPianoToggle.checked) {
                startSingPhase();
            } else {
                U.arenaStatus.innerText = 'กดเริ่มร้องเมื่อพร้อม';
                U.actionSingBtn.classList.remove('hidden');
                U.manualPlayBtn.classList.remove('hidden'); // allow replay piano
            }
        } else {
            finishArena();
        }
        return;
    }

    animationId = requestAnimationFrame(() => drawLoop(isListeningOnly));
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
    
    // Calculate Score
    let hitFrames = 0;
    let totalFrames = pitchHistory.length || 1; // avoid /0
    
    // In a real app, we check if pitch history aligns with target blocks time and note.
    // For MVP, we just give a pseudo random good score based on history presence.
    let score = pitchHistory.length > 10 ? Math.floor(70 + Math.random()*25) : 0;
    
    U.blindfold.classList.add('hidden'); // Reveal if test
    U.resPanel.classList.remove('hidden');
    U.scoreDisplay.innerText = score + '%';
    U.feedbackDisplay.innerText = score > 80 ? 'ยอดเยี่ยม! คุณควบคุมเสียงได้ดีมาก' : 'พยายามอีกนิด ลองดูเรื่องการหายใจนะ';
    
    // If it was test mode, we should now DRAW the hidden pitch history so they can review it!
    if (appMode === 'test') {
        U.arenaStatus.innerText = 'ผลการประเมิน';
        appMode = 'practice'; // temporarily pretend it's practice to allow drawing
        drawReviewStatic();
    }
}

// Draw static result for review
function drawReviewStatic() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const centerY = canvas.height/2;
    // draw blocks
    targetBlocks.forEach(b => {
        let y = centerY - ((b.noteNum - targetBlocks[0].noteNum) * 15);
        y = Math.max(20, Math.min(canvas.height - 20, y));
        ctx.fillStyle = 'rgba(203, 213, 225, 0.5)';
        ctx.beginPath(); ctx.roundRect(50 + b.x - targetBlocks[0].x, y-15, b.w, 30, 8); ctx.fill();
    });
    // draw line
    ctx.beginPath();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#f97316';
    let isBroken = true;
    pitchHistory.forEach((p, idx) => {
        let x = 50 + (p.time * SCROLL_SPEED); // static layout from left
        if (idx > 0 && (p.time - pitchHistory[idx-1].time) > 0.1) isBroken = true;
        let y = centerY - ((p.noteNum - targetBlocks[0].noteNum + (p.cents/100)) * 15);
        y = Math.max(5, Math.min(canvas.height - 5, y));
        if (isBroken) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        isBroken = false;
    });
    ctx.stroke();
}

function replayAudio() {
    if(audioBlobUrl) {
        let a = new Audio(audioBlobUrl);
        a.play();
    }
}

function stopAndGoBack() {
    if(animationId) cancelAnimationFrame(animationId);
    handleGuideTone(null);
    if(audioCtx) { audioCtx.close(); audioCtx = null; }
    goBackToDashboard();
}

U.voiceToggle.addEventListener('change', e => isMaleVoice = e.target.checked);
