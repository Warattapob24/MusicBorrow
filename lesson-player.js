const LESSON_CATALOG = window.LESSON_CATALOG;

let appSettings = {
    bgmVol: 50, sfxVol: 50, voiceVol: 100, heroId: null, showNoteNames: true
};

let currentLessonIndex = 0;
const urlParams = new URLSearchParams(window.location.search);
const encounterParam = urlParams.get('encounter');
if (encounterParam && encounterParam.startsWith('boss')) {
    currentLessonIndex = parseInt(encounterParam.replace('boss', ''), 10) - 1;
} else {
    currentLessonIndex = parseInt(localStorage.getItem('music_rpg_level') || '0', 10);
}
// Clamp
currentLessonIndex = Math.max(0, Math.min(currentLessonIndex, LESSON_CATALOG.length - 1));
let currentLesson = null;
let currentSlideIndex = 0;
let isSlideCompleted = false;
let speedQuizState = { active: false, currentQ: 0, score: 0 };
let rhythmRunnerState = { active: false, started: false, notes: [], lastTime: 0, startTime: 0, hitIndex: 0, reqFrame: null };
let scaleBuilderState = { active: false, started: false, targetKey: '', currentNotes: [], baseNotes: [], targetNotes: [] };
let staffWarState = { active: false, targetQ: 10, currentQ: 0, mistakes: 0, currentNote: null };

// RPG State
let bossHp = 5;
const maxBossHp = 5;
let lives = 3;
let selectedHero = '';

// --- RHYTHM RUNNER LOGIC ---
function startRhythmRunner(slide) {
    const rrContainer = document.getElementById('rhythm-runner-container');
    const track = document.getElementById('rhythm-track');
    if (!rrContainer || !track) return;
    
    rrContainer.style.display = 'flex';
    track.innerHTML = '';
    ui.bossImg.classList.add('anim-dance');
    
    const notes = slide.track.map((n, i) => {
        const el = document.createElement('div');
        el.className = 'rhythm-note';
        el.innerText = '🎵';
        el.style.left = '100%';
        track.appendChild(el);
        return {
            ...n,
            element: el,
            hit: false,
            time: n.time
        };
    });
    
    rhythmRunnerState = {
        active: true,
        slide: slide,
        notes: notes,
        hitIndex: 0,
        bpm: slide.bpm || 100,
        startTime: 0,
        reqFrame: null,
        started: false
    };
}

function updateRhythmRunner(timestamp) {
    if (!rhythmRunnerState.active) return;
    if (!rhythmRunnerState.startTime) rhythmRunnerState.startTime = timestamp;
    
    const elapsedMs = timestamp - rhythmRunnerState.startTime;
    const bps = rhythmRunnerState.bpm / 60;
    const currentBeat = (elapsedMs / 1000) * bps;
    const approachBeats = 2.0;
    
    let allDone = true;
    
    rhythmRunnerState.notes.forEach((n, i) => {
        if (n.hit) return;
        
        const beatsUntilHit = n.time - currentBeat;
        
        if (beatsUntilHit > approachBeats) {
            allDone = false;
        } else if (beatsUntilHit < -0.3) {
            n.hit = true;
            n.element.style.opacity = '0';
            playSFX('error');
            bossAttack();
            rhythmRunnerState.hitIndex++;
            allDone = false;
        } else {
            const pct = 10 + (beatsUntilHit / approachBeats) * 90;
            n.element.style.left = pct + '%';
            allDone = false;
        }
    });
    
    if (allDone && rhythmRunnerState.hitIndex >= rhythmRunnerState.notes.length) {
        rhythmRunnerState.active = false;
        setTimeout(() => {
            if (lives > 0) {
                heroAttack();
                setTimeout(() => { if (bossHp > 0) goNext(); }, 1500);
            }
        }, 500);
    } else {
        rhythmRunnerState.reqFrame = requestAnimationFrame(updateRhythmRunner);
    }
}

function handleRhythmTap() {
    if (!rhythmRunnerState.active || !rhythmRunnerState.started) return;
    
    const n = rhythmRunnerState.notes[rhythmRunnerState.hitIndex];
    if (!n) return;
    
    const elapsedMs = performance.now() - rhythmRunnerState.startTime;
    const bps = rhythmRunnerState.bpm / 60;
    const currentBeat = (elapsedMs / 1000) * bps;
    
    const diff = Math.abs(n.time - currentBeat);
    
    if (diff < 0.25) {
        n.hit = true;
        n.element.classList.add('hit-effect');
        playSFX('correct');
        ui.bossImg.classList.add('anim-damage');
        setTimeout(() => ui.bossImg.classList.remove('anim-damage'), 100);
        rhythmRunnerState.hitIndex++;
    } else if (diff < 0.5) {
        n.hit = true;
        n.element.style.opacity = '0.5';
        playSFX('error');
        bossAttack();
        rhythmRunnerState.hitIndex++;
    }
}

// --- DOM ELEMENTS ---
const ui = {
    screenSelect: document.getElementById('screen-select'),
    screenBattle: document.getElementById('screen-battle'),
    screenVictory: document.getElementById('screen-victory'),
    screenGameover: document.getElementById('screen-gameover'),
    
    charHero: document.getElementById('char-hero-container'),
    charBoss: document.getElementById('char-boss-container'),
    heroImg: document.getElementById('char-hero'),
    bossImg: document.getElementById('char-boss'),
    
    bossHpBar: document.getElementById('boss-hp-bar'),
    bossHpText: document.getElementById('boss-hp-text'),
    progressFill: document.getElementById('progress-bar'),
    livesCount: document.getElementById('lives-count'),
    
    speakerBadge: document.getElementById('speaker-badge'),
    slideText: document.getElementById('slide-text'),
    dialoguePrompt: document.getElementById('dialogue-prompt'),
    
    sheetMusic: document.getElementById('sheet-music-container'),
    quizBox: document.getElementById('quiz-container'),
    pianoSection: document.getElementById('piano-section'),
    noteIdSection: document.getElementById('note-id-section'),
    feedback: document.getElementById('feedback-msg'),
    
    btnNextLevel: document.getElementById('btn-next-level'),
    btnMap: document.getElementById('btn-map'),
    
    sbContainer: document.getElementById('scale-builder-container'),
    sbTargetLabel: document.getElementById('sb-target-label'),
    sbControls: document.getElementById('sb-controls'),
    sbSubmit: document.getElementById('btn-sb-submit')
};

const btnRhythmTap = document.getElementById('btn-rhythm-tap');
if (btnRhythmTap) {
    btnRhythmTap.addEventListener('mousedown', (e) => { e.preventDefault(); handleRhythmTap(); });
    btnRhythmTap.addEventListener('touchstart', (e) => { e.preventDefault(); handleRhythmTap(); }, {passive: false});
}

// --- INITIALIZATION ---
function init() {
    const savedSettings = localStorage.getItem('music_rpg_settings');
    if (savedSettings) {
        appSettings = JSON.parse(savedSettings);
        if (appSettings.showNoteNames === undefined) appSettings.showNoteNames = true;
    }
    selectedHero = appSettings.heroId ? 'assets/game/' + appSettings.heroId : 'assets/game/hero1.png';
    ui.heroImg.src = selectedHero;
    
    if (!appSettings.showNoteNames) {
        document.getElementById('piano-section').classList.add('hide-note-names');
    }

    ui.screenBattle.classList.add('active-screen');
    ui.screenBattle.style.display = 'flex';
    if (ui.screenSelect) ui.screenSelect.style.display = 'none';
    
    document.querySelectorAll('.piano-key-white, .piano-key-black').forEach(btn => {
        btn.addEventListener('mousedown', (e) => {
            const note = e.target.getAttribute('data-note');
            if (note) handlePianoInput(e.target, note);
        });
    });

    document.querySelectorAll('.note-id-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const baseNote = e.target.getAttribute('data-base');
            if (baseNote) handleStaffWarInput(baseNote, e.target);
        });
    });

    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space') {
            if (document.activeElement && document.activeElement.tagName === 'BUTTON') {
                document.activeElement.blur();
            }
            e.preventDefault();
            
            if (rhythmRunnerState.active && rhythmRunnerState.started) {
                handleRhythmTap();
                const tapBtn = document.getElementById('btn-rhythm-tap');
                if(tapBtn) {
                    tapBtn.style.transform = 'translateY(6px)';
                    tapBtn.style.boxShadow = '0 0px 0 #0ea5e9, 0 0px 0px rgba(0,0,0,0.4)';
                    setTimeout(() => {
                        tapBtn.style.transform = '';
                        tapBtn.style.boxShadow = '';
                    }, 100);
                }
                return;
            }
            goNext(false);
        }
    });

    startLesson();
    
    document.addEventListener('click', () => {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        if ('speechSynthesis' in window) {
            window.speechSynthesis.speak(new SpeechSynthesisUtterance(''));
        }
        if (!isBgmPlaying && appSettings.bgmVol > 0) startBGM();
    }, { once: true });
}

window.openSettings = function() {
    document.getElementById('settings-modal').classList.remove('hidden');
    const updateSlider = (id, val) => {
        const el = document.getElementById('slider-' + id);
        const disp = document.getElementById('val-' + id);
        if (el) el.value = val;
        if (disp) disp.innerText = val + '%';
    };
    if (appSettings.bgmVol === undefined) appSettings.bgmVol = 50;
    if (appSettings.sfxVol === undefined) appSettings.sfxVol = 50;
    if (appSettings.voiceVol === undefined) appSettings.voiceVol = 100;
    if (appSettings.showNoteNames === undefined) appSettings.showNoteNames = true;
    
    updateSlider('bgm', appSettings.bgmVol);
    updateSlider('sfx', appSettings.sfxVol);
    updateSlider('voice', appSettings.voiceVol);
    
    const noteToggle = document.getElementById('toggle-note-names');
    if (noteToggle) noteToggle.checked = appSettings.showNoteNames;
};

window.closeSettings = function() {
    document.getElementById('settings-modal').classList.add('hidden');
};

window.updateSettings = function(key, value) {
    if (key === 'showNoteNames') {
        appSettings[key] = value;
    } else {
        appSettings[key] = parseInt(value, 10);
    }
    localStorage.setItem('music_rpg_settings', JSON.stringify(appSettings));
    
    if (key === 'bgmVol') {
        document.getElementById('val-bgm').innerText = appSettings.bgmVol + '%';
        if (appSettings.bgmVol > 0 && !isBgmPlaying) {
            startBGM();
        } else if (appSettings.bgmVol === 0) {
            stopBGM();
        }
    } else if (key === 'sfxVol') {
        document.getElementById('val-sfx').innerText = appSettings.sfxVol + '%';
    } else if (key === 'voiceVol') {
        document.getElementById('val-voice').innerText = appSettings.voiceVol + '%';
        if (appSettings.voiceVol === 0 && 'speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
    } else if (key === 'showNoteNames') {
        const piano = document.getElementById('piano-section');
        if (value) {
            piano.classList.remove('hide-note-names');
        } else {
            piano.classList.add('hide-note-names');
        }
    }
};

function startLesson() {
    currentLesson = LESSON_CATALOG[currentLessonIndex];
    if (!currentLesson) { alert("Lesson not found!"); return; }
    
    currentSlideIndex = 0;
    bossHp = 5;
    lives = 3;
    updateHealthUI();
    
    ui.charBoss.classList.remove('anim-die');
    ui.bossImg.classList.remove('anim-dance');
    
    let bossNum = (currentLessonIndex % 3) + 1;
    if (currentLessonIndex >= 7) {
        bossNum = 4; // Use Clockwork Golem for Chapter 2
    }
    
    const bossNames = [
        'Noise Demon', 'Treble Trickster', 'Scale Serpent', 
        'Minor Minotaur', 'Slime Blob', 'Mutant Pitch', 
        'Note Master', 'Time Wizard', 'Rhythm Golem', 'Harmony Golem'
    ];
    const bName = bossNames[currentLessonIndex] || "Boss";
    const nameDisplay = document.getElementById('boss-name-display');
    if (nameDisplay) {
        nameDisplay.innerText = `BOSS: ${bName.toUpperCase()}`;
    }
    
    const bossTemp = new Image();
    bossTemp.src = `assets/game/boss${bossNum}.png`;
    bossTemp.onload = () => {
        if (bossNum === 4) {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = bossTemp.width;
            tempCanvas.height = bossTemp.height;
            const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
            tempCtx.drawImage(bossTemp, 0, 0);
            const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
            const data = imageData.data;
            for (let j = 0; j < data.length; j += 4) {
                if (data[j] > 240 && data[j+1] > 240 && data[j+2] > 240) {
                    data[j+3] = 0;
                }
            }
            tempCtx.putImageData(imageData, 0, 0);
            ui.bossImg.src = tempCanvas.toDataURL();
        } else {
            ui.bossImg.src = bossTemp.src;
        }
    };
    
    ui.screenBattle.style.backgroundImage = `url('assets/game/bg${bossNum}.png')`;
    ui.screenBattle.style.backgroundSize = 'cover';
    ui.screenBattle.style.backgroundPosition = 'center';
    
    renderSlide();
}

function updateHealthUI() {
    ui.bossHpText.innerText = `${bossHp}/${maxBossHp} HP`;
    ui.bossHpBar.style.width = `${(bossHp / maxBossHp) * 100}%`;
    ui.livesCount.innerText = lives;
    
    if (lives <= 0) setTimeout(showGameOver, 1000);
}

function updateProgress() {
    const total = currentLesson.slides.length;
    const percent = (currentSlideIndex / total) * 100;
    ui.progressFill.style.width = percent + '%';
}

function resetUI() {
    ui.sheetMusic.style.display = 'none';
    ui.sheetMusic.innerHTML = '';
    ui.quizBox.style.display = 'none';
    ui.quizBox.innerHTML = '';
    ui.pianoSection.style.display = 'none';
    const rrContainer = document.getElementById('rhythm-runner-container');
    if (rrContainer) rrContainer.style.display = 'none';
    if (ui.sbContainer) ui.sbContainer.style.display = 'none';
    
    ui.feedback.classList.add('hidden');
    ui.feedback.className = 'w-full text-center mt-4 font-bold text-sm hidden py-2 rounded-lg pointer-events-auto backdrop-blur-md';
    
    ui.dialoguePrompt.style.display = 'none';
    isSlideCompleted = false;
    isAttacking = false;
    speedQuizState.active = false;
    rhythmRunnerState.active = false;
    scaleBuilderState.active = false;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

window.speakText = function(text, lang = 'th-TH', pitch = 1.0, rate = 1.0) {
    if (appSettings.voiceVol === 0 || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const cleanText = text.replace(/<[^>]*>?/gm, '');
    const msg = new SpeechSynthesisUtterance(cleanText);
    msg.lang = lang;
    msg.pitch = pitch;
    msg.rate = rate;
    msg.volume = appSettings.voiceVol / 100;
    window.speechSynthesis.speak(msg);
};

function wrapEnglishWords(text) {
    if (!text) return '';
    const parts = text.split(/(<[^>]+>)/g);
    for (let i = 0; i < parts.length; i++) {
        if (!parts[i].startsWith('<')) {
            parts[i] = parts[i].replace(/([a-zA-Z][a-zA-Z\s\-]*[a-zA-Z]|[a-zA-Z])/g, (match) => {
                const word = match.trim();
                if (word.length === 0) return match;
                return `<span class="text-cyan-300 underline cursor-pointer hover:text-white transition-colors" onclick="speakText('${word}', 'en-US', 1.0, 1.0); event.stopPropagation();" title="กดเพื่อฟังเสียง: ${word}">${match}</span>`;
            });
        }
    }
    return parts.join('');
}
let typeWriterTimeout = null;
let isTyping = false;
let currentFullText = "";
let isAttacking = false;

function typeWriterEffect(element, htmlString, speed = 25) {
    clearTimeout(typeWriterTimeout);
    element.innerHTML = '';
    currentFullText = htmlString;
    isTyping = true;
    
    let i = 0;
    let isTag = false;
    
    function typeChar() {
        if (!isTyping) return;
        if (i < htmlString.length) {
            let char = htmlString.charAt(i);
            if (char === '<') isTag = true;
            if (char === '>') isTag = false;
            
            element.innerHTML = htmlString.substring(0, i + 1);
            i++;
            
            if (isTag || htmlString.charAt(i-1) === '>') {
                typeChar();
            } else {
                if (i >= htmlString.length) {
                    isTyping = false;
                    playSFX('typing_end');
                    
                    const slide = currentLesson.slides[currentSlideIndex];
                    if (slide.type === 'info') {
                        isSlideCompleted = true;
                        ui.dialoguePrompt.innerText = "แตะหน้าจอเพื่อเล่นต่อ ▼";
                        ui.dialoguePrompt.style.display = 'block';
                    } else if (slide.type === 'speed-quiz') {
                        isSlideCompleted = true;
                        ui.dialoguePrompt.innerText = "แตะเพื่อเริ่มโจมตี ⚔️";
                        ui.dialoguePrompt.style.display = 'block';
                    } else if (slide.type === 'rhythm-runner') {
                        isSlideCompleted = true;
                        ui.dialoguePrompt.innerText = "กดแตะ หรือ สเปซบาร์ เพื่อโจมตี ⚔️";
                        ui.dialoguePrompt.style.display = 'block';
                    } else {
                        ui.dialoguePrompt.style.display = 'none';
                    }
                } else {
                    if (i % 2 === 0) playSFX('typing');
                    typeWriterTimeout = setTimeout(typeChar, 30);
                }
            }
        }
    }
    typeChar();
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function setSpeaker(speakerType, speakerName) {
    ui.speakerBadge.innerText = speakerName || "System";
    if (speakerType === 'hero') {
        ui.charHero.classList.add('char-active');
        ui.charHero.classList.remove('char-inactive');
        ui.charBoss.classList.add('char-inactive');
        ui.charBoss.classList.remove('char-active');
        ui.speakerBadge.className = "absolute -top-4 left-4 bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-bold text-xs px-4 py-1 rounded-t-lg rounded-br-lg shadow-lg";
    } else if (speakerType === 'boss') {
        ui.charBoss.classList.add('char-active');
        ui.charBoss.classList.remove('char-inactive');
        ui.charHero.classList.add('char-inactive');
        ui.charHero.classList.remove('char-active');
        ui.speakerBadge.className = "absolute -top-4 right-4 bg-gradient-to-r from-rose-600 to-purple-600 text-white font-bold text-xs px-4 py-1 rounded-t-lg rounded-bl-lg shadow-lg";
    }
}

function renderSlide() {
    resetUI();
    updateProgress();
    
    if (currentSlideIndex >= currentLesson.slides.length || bossHp <= 0) {
        showVictory();
        return;
    }
    
    const slide = currentLesson.slides[currentSlideIndex];
    setSpeaker(slide.speaker, slide.speakerName);
    
    let pitch = 1.0;
    let rate = 1.1;
    if (slide.speaker === 'boss') { pitch = 0.5; rate = 1.3; }
    else if (slide.speaker === 'hero') { pitch = 1.4; rate = 1.1; }
    
    const textContent = slide.text || slide.question || '';
    speakText(textContent, 'th-TH', pitch, rate);

    const formattedText = wrapEnglishWords(textContent);
    typeWriterEffect(ui.slideText, formattedText);
    
    if (slide.abc) {
        ui.sheetMusic.style.display = 'block';
        ABCJS.renderAbc("sheet-music-container", slide.abc, { scale: slide.scale || 1.8, staffwidth: slide.staffwidth || 320, add_classes: true });
    }
    
    if (slide.type === 'quiz' || slide.type === 'piano-input' || slide.type === 'speed-quiz' || slide.type === 'rhythm-runner' || slide.type === 'note-identification' || slide.type === 'scale-builder') {
        ui.bossImg.classList.add('anim-dance');
    } else {
        ui.bossImg.classList.remove('anim-dance');
    }
    
    if (slide.type === 'quiz') {
        renderQuiz(slide);
    } else if (slide.type === 'piano-input') {
        ui.pianoSection.style.display = 'block';
    } else if (slide.type === 'speed-quiz') {
        speedQuizState = { active: true, currentQ: 0, score: 0, started: false };
    } else if (slide.type === 'rhythm-runner') {
        startRhythmRunner(slide);
    } else if (slide.type === 'note-identification') {
        startStaffWar();
    } else if (slide.type === 'scale-builder') {
        startScaleBuilder(slide);
    }

    if (slide.showPiano) {
        ui.pianoSection.style.display = 'block';
    }
}

function renderQuiz(slide) {
    ui.quizBox.style.display = 'grid';
    let mappedOptions = slide.options.map((opt, idx) => ({ text: opt, isCorrect: idx === slide.correctIndex }));
    mappedOptions = shuffleArray(mappedOptions);
    
    mappedOptions.forEach((optMeta) => {
        const btn = document.createElement('button');
        btn.className = 'neu-btn px-4 py-3 rounded-xl font-bold text-sm text-slate-800 bg-slate-100 border border-slate-300 pointer-events-auto';
        btn.innerText = optMeta.text;
        btn.onclick = (e) => { e.stopPropagation(); checkQuiz(optMeta.isCorrect ? slide.correctIndex : -1, btn); };
        ui.quizBox.appendChild(btn);
    });
}

function showDamageEffect(target) {
    ui.screenBattle.classList.add('anim-shake');
    setTimeout(() => ui.screenBattle.classList.remove('anim-shake'), 400);

    const slash = document.createElement('div');
    slash.innerText = target === 'hero' ? "-1 💔" : "-1 💥";
    slash.className = "absolute text-[80px] font-black text-rose-500 pointer-events-none drop-shadow-[0_0_20px_rgba(244,63,94,0.8)]";
    slash.style.zIndex = '9999';
    
    if (target === 'hero') {
        slash.style.bottom = '20%';
        slash.style.left = '25%';
    } else {
        slash.style.bottom = '25%';
        slash.style.right = '15%';
    }
    
    slash.style.animation = 'damageFloat 0.8s cubic-bezier(0.175, 0.885, 0.32, 1) forwards';
    ui.screenBattle.appendChild(slash);
    setTimeout(() => slash.remove(), 800);
}

function heroAttack() {
    isAttacking = true;
    setSpeaker('hero', 'Hero');
    playSFX('attack');
    ui.charHero.classList.add('char-attacking');
    ui.heroImg.classList.add('anim-attack');
    
    setTimeout(() => {
        showDamageEffect('boss');
        ui.charBoss.classList.add('anim-shake', 'anim-damage');
        playSFX('hit');
        bossHp = Math.max(0, bossHp - 1);
        updateHealthUI();
    }, 350);

    setTimeout(() => {
        ui.heroImg.classList.remove('anim-attack');
        ui.charHero.classList.remove('char-attacking');
        ui.charBoss.classList.remove('anim-shake', 'anim-damage');
        
        if (bossHp <= 0) {
            ui.bossImg.classList.remove('anim-dance');
            ui.charBoss.classList.add('anim-die');
            setSpeaker('system', 'System');
            typeWriterEffect(ui.slideText, "บอสถูกกำจัดแล้ว!...");
            setTimeout(showVictory, 2500);
        }
        isAttacking = false;
    }, 800);
}

function bossAttack() {
    isAttacking = true;
    const bossName = currentLesson?.slides[currentSlideIndex]?.speakerName || 'Boss';
    setSpeaker('boss', bossName);
    playSFX('boss_attack');
    ui.charBoss.classList.add('char-attacking');
    ui.bossImg.classList.add('anim-boss-attack');
    
    setTimeout(() => {
        showDamageEffect('hero');
        ui.charHero.classList.add('anim-shake', 'anim-damage');
        playSFX('error');
        lives = Math.max(0, lives - 1);
        updateHealthUI();
    }, 350);

    setTimeout(() => {
        ui.bossImg.classList.remove('anim-boss-attack');
        ui.charBoss.classList.remove('char-attacking');
        ui.charHero.classList.remove('anim-shake', 'anim-damage');
        if (lives <= 0) {
            setTimeout(showGameOver, 1000);
        }
        isAttacking = false;
    }, 800);
}

function checkQuiz(selectedIndex, btnElement) {
    if (isSlideCompleted) return;
    
    const slide = currentLesson.slides[currentSlideIndex];
    if (selectedIndex === slide.correctIndex) {
        btnElement.style.background = '#10b981'; btnElement.style.color = '#fff';
        playSFX('correct');
        isSlideCompleted = true;
        heroAttack();
        setTimeout(() => { if (bossHp > 0) goNext(); }, 1500);
    } else {
        btnElement.style.background = '#f43f5e'; btnElement.style.color = '#fff';
        playSFX('error');
        bossAttack();
        setTimeout(() => {
            btnElement.style = '';
            btnElement.className = 'neu-btn px-4 py-3 rounded-xl font-bold text-sm text-slate-800 bg-slate-100 border border-slate-300 pointer-events-auto';
        }, 1000);
    }
}

function handlePianoInput(btnElement, pressedNote) {
    const slide = currentLesson.slides[currentSlideIndex];
    
    // Always allow playing piano on info slides
    if (slide && slide.type === 'info') {
        btnElement.classList.add('pressed');
        setTimeout(() => btnElement.classList.remove('pressed'), 200);
        playTone(pressedNote);
        return;
    }
    
    if (isSlideCompleted && !speedQuizState.active) return;
    
    btnElement.classList.add('pressed');
    setTimeout(() => btnElement.classList.remove('pressed'), 200);
    playTone(pressedNote);

    if (speedQuizState.active) {
        handleSpeedQuizInput(pressedNote, btnElement);
    } else {
        const baseNote = pressedNote.replace(/[0-9]/g, '');
        const targetBase = slide.targetNote ? slide.targetNote.replace(/[0-9]/g, '') : slide.abc.split(']').pop().replace(/[^a-zA-Z]/g, '');
        
        if (pressedNote === slide.targetNote || baseNote === targetBase) {
            isSlideCompleted = true;
            heroAttack();
            setTimeout(() => { if (bossHp > 0) goNext(); }, 1500);
        } else {
            playSFX('error');
            bossAttack();
        }
    }
}

function startSpeedQuiz() {
    isSlideCompleted = false; 
    ui.dialoguePrompt.style.display = 'none';
    runSpeedQuizLoop();
}

function runSpeedQuizLoop() {
    const slide = currentLesson.slides[currentSlideIndex];
    if (speedQuizState.currentQ >= slide.questions.length || bossHp <= 0 || lives <= 0) {
        speedQuizState.active = false;
        if (bossHp <= 0 || lives <= 0) return; 
        isSlideCompleted = true;
        ui.pianoSection.style.display = 'none';
        ui.quizBox.style.display = 'none';
        ui.sheetMusic.style.display = 'none';
        ui.speakerBadge.innerText = slide.speakerName;
        typeWriterEffect(ui.slideText, "การโจมตีคอมโบสำเร็จ! เตรียมตัวไปด่านต่อไป!");
        return;
    }
    
    const q = slide.questions[speedQuizState.currentQ];
    ui.speakerBadge.innerText = "System (COMBO)";
    
    const questionHtml = `<strong>เป้าหมายที่ ${speedQuizState.currentQ + 1}</strong>: ${q.question || "รีบกดโน้ตนี้ด่วน!"}`;
    speakText(q.question || "รีบกดโน้ตด่วน", 'th-TH', 1.0, 1.3);
    ui.slideText.innerHTML = wrapEnglishWords(questionHtml);
    
    ui.sheetMusic.style.display = 'block';
    ABCJS.renderAbc("sheet-music-container", q.abc, { scale: q.scale || 1.8, staffwidth: q.staffwidth || 320 });
    
    if (q.type === 'note') {
        ui.quizBox.style.display = 'none';
        ui.pianoSection.style.display = 'block';
    } else if (q.type === 'term') {
        ui.pianoSection.style.display = 'none';
        ui.quizBox.innerHTML = '';
        ui.quizBox.style.display = 'grid';
        let mappedOptions = q.options.map((opt, idx) => ({ text: opt, isCorrect: idx === q.correctIndex }));
        mappedOptions = shuffleArray(mappedOptions);
        
        mappedOptions.forEach((optMeta) => {
            const btn = document.createElement('button');
            btn.className = 'neu-btn px-4 py-3 rounded-xl font-bold text-sm text-slate-800 bg-slate-100 border border-slate-300 pointer-events-auto';
            btn.innerText = optMeta.text;
            btn.onclick = (e) => {
                e.stopPropagation();
                if (optMeta.isCorrect) {
                    speedQuizState.score++;
                    playSFX('correct');
                    heroAttack();
                    btn.style.background = '#10b981';
                    setTimeout(() => { speedQuizState.currentQ++; runSpeedQuizLoop(); }, 800);
                } else {
                    playSFX('error');
                    bossAttack();
                    btn.style.background = '#f43f5e';
                    setTimeout(() => { speedQuizState.currentQ++; runSpeedQuizLoop(); }, 800);
                }
            };
            ui.quizBox.appendChild(btn);
        });
    }
}

function handleSpeedQuizInput(pressedNote, btnElement) {
    const slide = currentLesson.slides[currentSlideIndex];
    const q = slide.questions[speedQuizState.currentQ];
    if (q.type !== 'note') return;
    
    const baseNote = pressedNote.replace(/[0-9]/g, '');
    const targetBase = q.targetNote ? q.targetNote.replace(/[0-9]/g, '') : null;
    
    if (pressedNote === q.targetNote || baseNote === targetBase) {
        speedQuizState.score++; heroAttack();
    } else { bossAttack(); }
    
    speedQuizState.currentQ++;
    setTimeout(runSpeedQuizLoop, 800);
}

// --- STAFF WAR LOGIC ---
function startStaffWar() {
    isSlideCompleted = false;
    staffWarState.active = true;
    staffWarState.currentQ = 0;
    staffWarState.mistakes = 0;
    staffWarState.targetQ = 10;
    bossHp = 10; // Set boss HP to 10 for this battle
    updateHealthUI();
    ui.dialoguePrompt.style.display = 'none';
    ui.sheetMusic.style.display = 'block';
    ui.noteIdSection.style.display = 'flex';
    
    // Set boss name and typing text
    ui.speakerBadge.innerText = "Note Master";
    const instructionHtml = `<strong>ทดสอบมาราธอน</strong>: โจมตีข้าให้ครบ 10 ครั้ง!`;
    speakText("โจมตีข้าให้ครบสิบครั้ง", 'th-TH', 0.8, 1.3);
    ui.slideText.innerHTML = wrapEnglishWords(instructionHtml);
    
    generateStaffWarNote();
}

function generateStaffWarNote() {
    // Generate a random note from C3 to C6
    const notes = ['C','D','E','F','G','A','B'];
    const accidentals = ['', '^', '_'];
    const octaves = [3, 4, 5]; // 4 is normal, 3 is low, 5 is high
    
    const note = notes[Math.floor(Math.random() * notes.length)];
    const acc = accidentals[Math.floor(Math.random() * accidentals.length)];
    const octave = octaves[Math.floor(Math.random() * octaves.length)];
    
    // Convert ABC format
    let abcOctave = '';
    if (octave === 3) abcOctave = ',';
    if (octave === 5) abcOctave = 'c'; // lowercase is higher octave in ABC, but wait, C5 is c, C3 is C,
    // Actually ABC: C = C3, c = C4, c' = C5.
    // Let's just use standard ABC: C, D, E... for octave 3? No, C in ABC is C3? Wait, middle C is C4.
    // In our app, we usually use C for C4. Let's check our ABC mapping.
    // Wait, usually C in abcjs is C4. Let's look at previous slides: "C ^C" plays C4 and C#4. So C = C4.
    // Then C, is C3. c is C5.
    // Let's simplify: only use C4 to C5 range (C to c).
    
    const possibleNotes = [
        'C', 'D', 'E', 'F', 'G', 'A', 'B', // C4-B4
        'c', 'd', 'e', 'f', 'g', 'a', 'b'  // C5-B5
    ];
    
    const baseAbc = possibleNotes[Math.floor(Math.random() * possibleNotes.length)];
    const abcStr = acc + baseAbc;
    
    // Calculate target base note for validation (e.g. C#)
    let baseName = baseAbc.toUpperCase();
    let displayAcc = '';
    if (acc === '^') displayAcc = '#';
    if (acc === '_') displayAcc = 'b';
    
    staffWarState.currentNote = baseName + displayAcc; // e.g. C# or Db
    staffWarState.currentAbc = abcStr;
    
    const abcRender = `X:1\nK:C\nL:1/1\n${abcStr} |]`;
    ABCJS.renderAbc("sheet-music-container", abcRender, { scale: 1.8, staffwidth: 320 });
}

function handleStaffWarInput(guessedNote, btnElement) {
    if (!staffWarState.active || bossHp <= 0) return;
    
    btnElement.style.transform = 'scale(0.9)';
    setTimeout(() => btnElement.style.transform = '', 150);
    
    // Normalize both for safety (C# vs Db etc - actually they are distinct buttons, so must match exactly)
    // Wait, if the ABC note is ^C, target is C#. If guessed is C#, it matches.
    if (guessedNote === staffWarState.currentNote) {
        // Correct!
        playSFX('correct');
        heroAttack(); // This will reduce bossHp
        staffWarState.currentQ++;
        
        btnElement.style.backgroundColor = '#10b981';
        btnElement.style.color = 'white';
        setTimeout(() => {
            btnElement.style.backgroundColor = '';
            btnElement.style.color = '';
            if (bossHp > 0) {
                generateStaffWarNote();
            } else {
                endStaffWar();
            }
        }, 500);
    } else {
        // Wrong!
        playSFX('error');
        bossAttack(); // Shakes screen, plays error. (Lives are NOT reduced for this mode by default, but bossAttack reduces life. Wait, user said "ให้หักเลือดผู้เล่นเหมือนเดิม" - so yes, reduce life!)
        staffWarState.mistakes++;
        
        btnElement.style.backgroundColor = '#f43f5e';
        btnElement.style.color = 'white';
        setTimeout(() => {
            btnElement.style.backgroundColor = '';
            btnElement.style.color = '';
            // Do NOT generate new note. Must answer correctly.
        }, 500);
    }
}

function endStaffWar() {
    staffWarState.active = false;
    isSlideCompleted = true;
    ui.noteIdSection.style.display = 'none';
    ui.sheetMusic.style.display = 'none';
    
    const accuracy = Math.round((10 / (10 + staffWarState.mistakes)) * 100);
    
    ui.speakerBadge.innerText = "System";
    const msg = `บอสถูกปราบแล้ว!<br>ความแม่นยำของคุณ: <strong>${accuracy}%</strong><br>กดปุ่มเพื่อไปฉากถัดไป`;
    speakText(`ความแม่นยำ ${accuracy} เปอร์เซ็นต์`, 'th-TH', 1.0, 1.2);
    ui.slideText.innerHTML = wrapEnglishWords(msg);
    
    ui.bossImg.classList.remove('anim-dance');
    ui.charBoss.classList.add('anim-die');
    
    setTimeout(showVictory, 3000);
}

window.goNext = function(fromDialogueClick = false) {
    if (isAttacking) return;
    
    if (isTyping && fromDialogueClick) {
        clearTimeout(typeWriterTimeout);
        ui.slideText.innerHTML = currentFullText;
        isTyping = false;
        
        const slide = currentLesson.slides[currentSlideIndex];
        if (slide.type === 'info') {
            isSlideCompleted = true;
            ui.dialoguePrompt.innerText = "แตะหน้าจอเพื่อเล่นต่อ ▼";
            ui.dialoguePrompt.style.display = 'block';
        } else if (slide.type === 'speed-quiz') {
            isSlideCompleted = true;
            ui.dialoguePrompt.innerText = "แตะเพื่อเริ่มโจมตี ⚔️";
            ui.dialoguePrompt.style.display = 'block';
        } else if (slide.type === 'rhythm-runner') {
            isSlideCompleted = true;
            ui.dialoguePrompt.innerText = "กดแตะ หรือ สเปซบาร์ เพื่อโจมตี ⚔️";
            ui.dialoguePrompt.style.display = 'block';
        } else {
            isSlideCompleted = false;
            ui.dialoguePrompt.style.display = 'none';
        }
        return;
    }

    if (speedQuizState.active && isSlideCompleted && !speedQuizState.started) {
        speedQuizState.started = true;
        isSlideCompleted = false;
        ui.dialoguePrompt.style.display = 'none';
        runSpeedQuizLoop();
        return;
    }
    
    if (rhythmRunnerState.active && isSlideCompleted && !rhythmRunnerState.started) {
        rhythmRunnerState.started = true;
        isSlideCompleted = false;
        ui.dialoguePrompt.style.display = 'none';
        rhythmRunnerState.startTime = performance.now();
        rhythmRunnerState.reqFrame = requestAnimationFrame(updateRhythmRunner);
        return;
    }
    
    if (!isSlideCompleted) return;
    
    if (currentSlideIndex < currentLesson.slides.length - 1) {
        currentSlideIndex++;
        renderSlide();
    } else {
        showVictory();
    }
};

window.nextLevel = function() {
    window.location.href = 'explore.html';
};

function showVictory() { 
    playSFX('victory');
    ui.screenBattle.style.display = 'none'; 
    ui.screenVictory.style.display = 'flex'; 
    
    let nextLevelIndex = currentLessonIndex + 1;
    let savedLevel = parseInt(localStorage.getItem('music_rpg_level') || '0', 10);
    if (nextLevelIndex > savedLevel) {
        localStorage.setItem('music_rpg_level', nextLevelIndex);
    }

    if (currentLessonIndex >= LESSON_CATALOG.length - 1) {
        ui.btnNextLevel.style.display = 'none';
        ui.screenVictory.querySelector('p').innerText = "ยอดเยี่ยม! คุณเรียนรู้และปราบมอนสเตอร์ตัวสุดท้ายสำเร็จ!";
    } else {
        ui.btnNextLevel.style.display = 'block';
        ui.btnNextLevel.innerText = "ลุยด่านต่อไป ⚔️";
    }
}
function showGameOver() { ui.screenBattle.style.display = 'none'; ui.screenGameover.style.display = 'flex'; }

let audioCtx;
let bgmInterval = null;
let bgmStep = 0;
let isBgmPlaying = false;

function startBGM() {
    if (appSettings.bgmVol === 0) { stopBGM(); return; }
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    
    if (isBgmPlaying) return;
    isBgmPlaying = true;
    
    const bossNum = (currentLessonIndex % 3) + 1;
    let trackNotes = [];
    let tempo = 150;
    let oscType = 'square';
    
    if (bossNum === 1) {
        // Boss 1: Original Tense Bassline
        trackNotes = [60, 60, 63, 60, 67, 60, 63, 65];
        tempo = 150;
        oscType = 'square';
    } else if (bossNum === 2) {
        // Boss 2: Darker/Slower rhythm
        trackNotes = [48, 51, 55, 48, 51, 55, 58, 55];
        tempo = 180;
        oscType = 'sawtooth';
    } else {
        // Boss 3: Fast, high tension
        trackNotes = [72, 71, 69, 67, 65, 67, 69, 71];
        tempo = 120;
        oscType = 'triangle';
    }
    
    bgmInterval = setInterval(() => {
        if (!isBgmPlaying || appSettings.bgmVol === 0) return;
        const noteMidi = trackNotes[bgmStep % trackNotes.length];
        const freq = 440 * Math.pow(2, (noteMidi - 69) / 12);
        const now = audioCtx.currentTime;
        
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = oscType;
        osc.frequency.setValueAtTime(freq, now);
        
        const vol = (appSettings.bgmVol / 100) * 0.08;
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

function playTone(noteName, duration = 1.5) {
    if (appSettings.sfxVol === 0) return;
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    const match = noteName.match(/^([A-G])([#b]?)([0-9])$/);
    if (!match) return;
    
    const baseNote = match[1];
    const accidental = match[2];
    const octave = parseInt(match[3], 10);
    const baseMidiMap = { 'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11 };
    let midiNote = baseMidiMap[baseNote] + (octave + 1) * 12;
    if (accidental === '#') midiNote += 1;
    if (accidental === 'b') midiNote -= 1;
    const freq = 440 * Math.pow(2, (midiNote - 69) / 12);
    
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime((appSettings.sfxVol / 100) * 1.5, audioCtx.currentTime + 0.05);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
}

function playSFX(type) {
    if (appSettings.sfxVol === 0) return;
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    const now = audioCtx.currentTime;
    const vol = appSettings.sfxVol / 100;

    switch(type) {
        case 'typing':
            osc.type = 'square';
            osc.frequency.setValueAtTime(800 + Math.random() * 200, now);
            gain.gain.setValueAtTime(0.05 * vol, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
            osc.start(now); osc.stop(now + 0.05);
            break;
        case 'typing_end':
            osc.type = 'square';
            osc.frequency.setValueAtTime(1200, now);
            gain.gain.setValueAtTime(0.05 * vol, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
            osc.start(now); osc.stop(now + 0.1);
            break;
        case 'attack':
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(800, now);
            osc.frequency.exponentialRampToValueAtTime(100, now + 0.2);
            gain.gain.setValueAtTime(0.3 * vol, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
            osc.start(now); osc.stop(now + 0.2);
            break;
        case 'boss_hit':
            osc.type = 'square';
            osc.frequency.setValueAtTime(150, now);
            osc.frequency.exponentialRampToValueAtTime(40, now + 0.3);
            gain.gain.setValueAtTime(0.3 * vol, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
            osc.start(now); osc.stop(now + 0.3);
            break;
        case 'error':
        case 'boss_attack':
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(200, now);
            osc.frequency.linearRampToValueAtTime(100, now + 0.3);
            gain.gain.setValueAtTime(0.4 * vol, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.3);
            osc.start(now); osc.stop(now + 0.3);
            break;
        case 'correct':
            osc.type = 'sine';
            osc.frequency.setValueAtTime(523.25, now);
            osc.frequency.setValueAtTime(659.25, now + 0.1);
            osc.frequency.setValueAtTime(783.99, now + 0.2);
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.3 * vol, now + 0.02);
            gain.gain.setValueAtTime(0.3 * vol, now + 0.2);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
            osc.start(now); osc.stop(now + 0.4);
            break;
        case 'victory':
            osc.type = 'square';
            [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
                const t = now + i * 0.1;
                osc.frequency.setValueAtTime(freq, t);
            });
            gain.gain.setValueAtTime(0.2 * vol, now);
            gain.gain.linearRampToValueAtTime(0.2 * vol, now + 0.4);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 1.5);
            osc.start(now); osc.stop(now + 1.5);
            break;
        case 'gameover':
            osc.type = 'sawtooth';
            [392.00, 370.00, 349.23, 329.63].forEach((freq, i) => {
                const t = now + i * 0.4;
                osc.frequency.setValueAtTime(freq, t);
            });
            gain.gain.setValueAtTime(0.2 * vol, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 2.0);
            osc.start(now); osc.stop(now + 2.0);
            break;
    }
}

function playDemo(demoType, btn) {
    try {
        let originalText = "";
        if (btn) {
            originalText = btn.innerHTML;
            btn.innerHTML = "⏳ กำลังเตรียมเสียง...";
            btn.disabled = true;
        }

        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        
        // Get all rendered ABCJS elements (try standard classes and fallback to wildcard)
        let elements = document.querySelectorAll('#sheet-music-container .abcjs-note, #sheet-music-container .abcjs-rest');
        if (elements.length === 0) {
            // Fallback for older abcjs versions
            elements = document.querySelectorAll('#sheet-music-container g[class*="abcjs-n"], #sheet-music-container g[class*="abcjs-rest"]');
        }
        
        // Filter out non-note/rest elements if using fallback
        const elArray = Array.from(elements).filter(el => {
            const cls = el.getAttribute('class') || '';
            return cls.includes('abcjs-note') || cls.includes('abcjs-n') || cls.includes('abcjs-rest');
        });
        
        if (demoType === '4-notes') {
            const sequence = [
                { type: 'note', duration: 1000, tone: 'C4', soundDuration: 1.0 },
                { type: 'note', duration: 1000, tone: 'C4', soundDuration: 1.0 },
                { type: 'note', duration: 1000, tone: 'C4', soundDuration: 1.0 },
                { type: 'note', duration: 1000, tone: 'C4', soundDuration: 1.0 }
            ];
            runDemoSequence(elArray, sequence, btn, originalText);
        } else if (demoType === '3-notes-rest') {
            const sequence = [
                { type: 'note', duration: 1000, tone: 'C4', soundDuration: 1.0 },
                { type: 'rest', duration: 1000 },
                { type: 'note', duration: 1000, tone: 'C4', soundDuration: 1.0 },
                { type: 'note', duration: 1000, tone: 'C4', soundDuration: 1.0 }
            ];
            runDemoSequence(elArray, sequence, btn, originalText);
        } else if (demoType === 'tie-demo') {
            const sequence = [
                { type: 'tied-start', duration: 2000, tone: 'C4', soundDuration: 4.0 },
                { type: 'tied-continue', duration: 2000 }
            ];
            runDemoSequence(elArray, sequence, btn, originalText);
        } else if (demoType === 'dot-demo') {
            const sequence = [
                { type: 'note', duration: 3000, tone: 'C4', soundDuration: 3.0 }
            ];
            runDemoSequence(elArray, sequence, btn, originalText);
        } else if (demoType === 'half-step-demo') {
            const sequence = [
                { type: 'note', duration: 1500, tone: 'C4', soundDuration: 1.5, count: "1" },
                { type: 'note', duration: 1500, tone: 'C#4', soundDuration: 1.5, count: "2" }
            ];
            runDemoSequence(elArray, sequence, btn, originalText);
        } else if (demoType === 'whole-step-demo') {
            const sequence = [
                { type: 'note', duration: 1000, tone: 'C4', soundDuration: 1.0, count: "1" },
                { type: 'note', duration: 1000, tone: 'C#4', soundDuration: 1.0, count: "2" },
                { type: 'note', duration: 1500, tone: 'D4', soundDuration: 1.5, count: "3" }
            ];
            runDemoSequence(elArray, sequence, btn, originalText);
        } else if (demoType === 'sharp-demo') {
            const sequence = [
                { type: 'note', duration: 1500, tone: 'F4', soundDuration: 1.5 },
                { type: 'note', duration: 1500, tone: 'F#4', soundDuration: 1.5 }
            ];
            runDemoSequence(elArray, sequence, btn, originalText);
        } else if (demoType === 'flat-demo') {
            const sequence = [
                { type: 'note', duration: 1500, tone: 'B4', soundDuration: 1.5 },
                { type: 'note', duration: 1500, tone: 'Bb4', soundDuration: 1.5 }
            ];
            runDemoSequence(elArray, sequence, btn, originalText);
        } else if (demoType === 'natural-demo') {
            const sequence = [
                { type: 'note', duration: 1500, tone: 'F#4', soundDuration: 1.5 },
                { type: 'note', duration: 1500, tone: 'F4', soundDuration: 1.5 }
            ];
            runDemoSequence(elArray, sequence, btn, originalText);
        } else if (demoType === 'c-major') {
            const sequence = [
                { type: 'note', duration: 500, tone: 'C4', soundDuration: 0.5 },
                { type: 'note', duration: 500, tone: 'D4', soundDuration: 0.5 },
                { type: 'note', duration: 500, tone: 'E4', soundDuration: 0.5 },
                { type: 'note', duration: 500, tone: 'F4', soundDuration: 0.5 },
                { type: 'note', duration: 500, tone: 'G4', soundDuration: 0.5 },
                { type: 'note', duration: 500, tone: 'A4', soundDuration: 0.5 },
                { type: 'note', duration: 500, tone: 'B4', soundDuration: 0.5 },
                { type: 'note', duration: 1500, tone: 'C5', soundDuration: 1.5 }
            ];
            runDemoSequence(elArray, sequence, btn, originalText);
        } else if (demoType === 'eb-major') {
            const sequence = [
                { type: 'note', duration: 500, tone: 'Eb4', soundDuration: 0.5 },
                { type: 'note', duration: 500, tone: 'F4', soundDuration: 0.5 },
                { type: 'note', duration: 500, tone: 'G4', soundDuration: 0.5 },
                { type: 'note', duration: 500, tone: 'Ab4', soundDuration: 0.5 },
                { type: 'note', duration: 500, tone: 'Bb4', soundDuration: 0.5 },
                { type: 'note', duration: 500, tone: 'C5', soundDuration: 0.5 },
                { type: 'note', duration: 500, tone: 'D5', soundDuration: 0.5 },
                { type: 'note', duration: 1500, tone: 'Eb5', soundDuration: 1.5 }
            ];
            runDemoSequence(elArray, sequence, btn, originalText);
        } else if (demoType === 'd-major') {
            const sequence = [
                { type: 'note', duration: 500, tone: 'D4', soundDuration: 0.5 },
                { type: 'note', duration: 500, tone: 'E4', soundDuration: 0.5 },
                { type: 'note', duration: 500, tone: 'F#4', soundDuration: 0.5 },
                { type: 'note', duration: 500, tone: 'G4', soundDuration: 0.5 },
                { type: 'note', duration: 500, tone: 'A4', soundDuration: 0.5 },
                { type: 'note', duration: 500, tone: 'B4', soundDuration: 0.5 },
                { type: 'note', duration: 500, tone: 'C#5', soundDuration: 0.5 },
                { type: 'note', duration: 1500, tone: 'D5', soundDuration: 1.5 }
            ];
            runDemoSequence(elArray, sequence, btn, originalText);
        }
    } catch (err) {
        if (btn) {
            btn.innerHTML = "❌ พบข้อผิดพลาด";
            console.error(err);
        }
    }
}

function runDemoSequence(elements, sequence, btn, originalText) {
    let delay = 0;
    
    if (btn) btn.innerHTML = "🎶 กำลังเล่น...";
    
    sequence.forEach((item, index) => {
        setTimeout(() => {
            try {
                // Reset all elements
                elements.forEach(el => {
                    if(el) {
                        el.querySelectorAll('path, text').forEach(p => {
                            p.style.fill = '';
                            p.style.stroke = '';
                        });
                    }
                });
                // Reset piano keys
                document.querySelectorAll('.piano-key-white, .piano-key-black').forEach(k => {
                    k.style.transform = '';
                    k.style.boxShadow = '';
                    k.style.backgroundColor = '';
                    // Remove existing counter badge if any
                    const badge = k.querySelector('.demo-counter-badge');
                    if (badge) badge.remove();
                });
                
                // Highlight current sheet music element
                if (elements[index]) {
                    const isNote = (item.type === 'note' || item.type === 'tied-start' || item.type === 'tied-continue');
                    const color = isNote ? '#3b82f6' : '#f43f5e';
                    elements[index].querySelectorAll('path, text').forEach(p => {
                        p.style.fill = color;
                        p.style.stroke = color;
                    });
                }

                // Highlight piano key and add count if provided
                if (item.tone) {
                    const key = document.querySelector(`.piano-key-white[data-note="${item.tone}"], .piano-key-black[data-note="${item.tone}"]`);
                    if (key) {
                        key.style.transform = 'translateY(2px)';
                        key.style.backgroundColor = item.type === 'note' || item.type === 'tied-start' ? '#3b82f6' : '#f43f5e';
                        key.style.boxShadow = '0 0 15px rgba(59, 130, 246, 0.8)';
                        
                        if (item.count) {
                            const badge = document.createElement('div');
                            badge.className = 'demo-counter-badge absolute -bottom-8 left-1/2 -translate-x-1/2 text-rose-500 font-black text-2xl drop-shadow-md z-50 pointer-events-none';
                            badge.innerText = item.count;
                            key.appendChild(badge);
                        }
                    }
                }
                
                // Play sound if note
                if (item.type === 'note' || item.type === 'tied-start') {
                    playTone(item.tone, item.soundDuration || 1.5);
                }
            } catch (err) {
                if (btn) btn.innerHTML = "❌ เสียงมีปัญหา";
                console.error(err);
            }
        }, delay);
        delay += item.duration;
    });

    // Reset after sequence finishes
    setTimeout(() => {
        elements.forEach(el => {
            if(el) {
                el.querySelectorAll('path, text').forEach(p => {
                    p.style.fill = '';
                    p.style.stroke = '';
                });
            }
        });
        document.querySelectorAll('.piano-key-white, .piano-key-black').forEach(k => {
            k.style.transform = '';
            k.style.boxShadow = '';
            k.style.backgroundColor = '';
            const badge = k.querySelector('.demo-counter-badge');
            if (badge) badge.remove();
        });
        if (btn) {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }, delay);
}

const SCALE_TEMPLATES = {
    'Eb': { label: 'Eb Major (3♭)', base: ['_E', 'F', 'G', 'A', 'B', 'c', 'd', '_e'], target: ['_E', 'F', 'G', '_A', '_B', 'c', 'd', '_e'] },
    'A': { label: 'A Major (3♯)', base: ['A', 'B', 'c', 'd', 'e', 'f', 'g', 'a'], target: ['A', 'B', '^c', 'd', 'e', '^f', '^g', 'a'] },
    'Ab': { label: 'Ab Major (4♭)', base: ['_A', 'B', 'c', 'd', 'e', 'f', 'g', '_a'], target: ['_A', '_B', 'c', '_d', '_e', 'f', 'g', '_a'] },
    'E': { label: 'E Major (4♯)', base: ['E', 'F', 'G', 'A', 'B', 'c', 'd', 'e'], target: ['E', '^F', '^G', 'A', 'B', '^c', '^d', 'e'] }
};

function startScaleBuilder(slide) {
    ui.sbContainer.style.display = 'flex';
    ui.pianoSection.style.display = 'block';
    ui.dialoguePrompt.style.display = 'none';

    // Pick a random scale
    const keys = Object.keys(SCALE_TEMPLATES);
    const key = keys[Math.floor(Math.random() * keys.length)];
    const template = SCALE_TEMPLATES[key];

    scaleBuilderState.active = true;
    scaleBuilderState.targetKey = key;
    scaleBuilderState.baseNotes = [...template.base];
    scaleBuilderState.currentNotes = [...template.base];
    scaleBuilderState.targetNotes = [...template.target];

    ui.sbTargetLabel.innerText = `สร้าง: ${template.label} Scale`;

    renderScaleBuilderUI();
    updateScaleBuilderAbc();
    
    ui.sbSubmit.onclick = () => {
        checkScaleBuilder();
    };
}

function renderScaleBuilderUI() {
    ui.sbControls.innerHTML = '<div class="text-emerald-400 font-bold text-sm animate-pulse mt-2 mb-2">👆 แตะที่ตัวโน้ตบนบรรทัด 5 เส้นเพื่อเปลี่ยน (b / #)</div>';
}

function cycleAccidental(index) {
    let note = scaleBuilderState.currentNotes[index];
    let base = scaleBuilderState.baseNotes[index];
    let baseName = base;
    
    // If base note is already altered (like Bb), we shouldn't really alter it further in basic theory, but we lock first/last anyway.
    if (base.startsWith('^') || base.startsWith('_')) {
        baseName = base.substring(1);
    }
    
    if (note.startsWith('^')) {
        // Sharp -> Flat
        scaleBuilderState.currentNotes[index] = '_' + baseName;
    } else if (note.startsWith('_')) {
        // Flat -> Natural
        scaleBuilderState.currentNotes[index] = baseName;
    } else {
        // Natural -> Sharp
        scaleBuilderState.currentNotes[index] = '^' + baseName;
    }
}

function updateScaleBuilderAbc() {
    const abcString = `X:1\nK:C\nL:1/4\n[V:1] ${scaleBuilderState.currentNotes.join(' ')} |]`;
    ABCJS.renderAbc("sb-sheet-container", abcString, { scale: 1.2, staffwidth: 320, add_classes: true });
    
    // Make notes clickable
    setTimeout(() => {
        const notes = Array.from(document.querySelectorAll('#sb-sheet-container .abcjs-note'));
        
        // Ensure they are sorted left-to-right (ABCJS usually renders them in order, but it's safe to sort by X)
        notes.sort((a, b) => {
            const bboxA = a.getBBox ? a.getBBox().x : 0;
            const bboxB = b.getBBox ? b.getBBox().x : 0;
            return bboxA - bboxB;
        });
        
        notes.forEach((noteElem, index) => {
            // First and last notes (roots) are locked
            if (index === 0 || index === 7) return; 
            
            noteElem.style.cursor = 'pointer';
            
            // Visual feedback on hover
            noteElem.addEventListener('mouseenter', () => { noteElem.style.filter = "drop-shadow(0px 0px 4px #10b981)"; });
            noteElem.addEventListener('mouseleave', () => { noteElem.style.filter = "none"; });
            
            // Click handler
            noteElem.addEventListener('click', (e) => {
                e.preventDefault();
                cycleAccidental(index);
                updateScaleBuilderAbc();
                playSFX('select');
            });
            noteElem.addEventListener('touchstart', (e) => {
                e.preventDefault();
                cycleAccidental(index);
                updateScaleBuilderAbc();
                playSFX('select');
            }, {passive: false});
        });
    }, 100);
}

function checkScaleBuilder() {
    const isCorrect = scaleBuilderState.currentNotes.every((note, idx) => note === scaleBuilderState.targetNotes[idx]);
    
    if (isCorrect) {
        ui.sbSubmit.style.background = '#10b981';
        ui.sbSubmit.style.color = '#fff';
        ui.sbSubmit.innerText = "ถูกต้อง! 🎉";
        playSFX('correct');
        isSlideCompleted = true;
        heroAttack();
        setTimeout(() => { if (bossHp > 0) goNext(); }, 1500);
    } else {
        ui.sbSubmit.style.background = '#f43f5e';
        ui.sbSubmit.style.color = '#fff';
        ui.sbSubmit.innerText = "ยังไม่ถูก ลองใหม่ ❌";
        playSFX('error');
        bossAttack();
        setTimeout(() => {
            ui.sbSubmit.style.background = '';
            ui.sbSubmit.style.color = '';
            ui.sbSubmit.innerText = "✅ ตรวจคำตอบ";
        }, 1500);
    }
}

document.addEventListener("DOMContentLoaded", init);
