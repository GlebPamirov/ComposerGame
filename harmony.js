const HARMONY_SCALES = {
    // --- ОСНОВНЫЕ И ДИАНИЧЕСКИЕ ЛАДЫ ---
    'major':        { name: 'Ионийский (Мажор)', suffix: '', intervals: [0, 2, 4, 5, 7, 9, 11] },
    'minor':        { name: 'Эолийский (Минор)', suffix: 'm', intervals: [0, 2, 3, 5, 7, 8, 10] },
    'dorian':       { name: 'Дорийский', suffix: ' Dor', intervals: [0, 2, 3, 5, 7, 9, 10] },
    'phrygian':     { name: 'Фригийский', suffix: ' Phr', intervals: [0, 1, 3, 5, 7, 8, 10] },
    'lydian':       { name: 'Лидийский', suffix: ' Lyd', intervals: [0, 2, 4, 6, 7, 9, 11] },
    'mixolydian':   { name: 'Миксолидийский', suffix: ' Mix', intervals: [0, 2, 4, 5, 7, 9, 10] },
    'locrian':      { name: 'Локрийский', suffix: ' Loc', intervals: [0, 1, 3, 5, 6, 8, 10] },

    // --- РАЗНОВИДНОСТИ МАЖОРА И МИНОРА ---
    'harm_minor':   { name: 'Гармонический минор', suffix: 'm(harm)', intervals: [0, 2, 3, 5, 7, 8, 11] },
    'mel_minor':    { name: 'Мелодический минор', suffix: 'm(mel)', intervals: [0, 2, 3, 5, 7, 9, 11] },
    'harm_major':   { name: 'Гармонический мажор', suffix: ' Maj(harm)', intervals: [0, 2, 4, 5, 7, 8, 11] },
    'mel_major':    { name: 'Мелодический мажор', suffix: ' Maj(mel)', intervals: [0, 2, 4, 5, 7, 8, 10] },

    // --- ПЕНТАТОНИКА ---
    'maj_pentatonic': { name: 'Мажорная пентатоника', suffix: ' Pent', intervals: [0, 2, 4, 7, 9] },
    'min_pentatonic': { name: 'Минорная пентатоника', suffix: 'm Pent', intervals: [0, 3, 5, 7, 10] },

    // --- ЭТНИЧЕСКИЕ ЛАДЫ ---
    'japanese':     { name: 'Японский (Инсэн/Хирадзёси)', suffix: ' Jap', intervals: [0, 1, 5, 7, 8] },
    'arabic':       { name: 'Арабский (Двойной гарм.)', suffix: ' Arab', intervals: [0, 1, 4, 5, 7, 8, 11] },
    'jewish':       { name: 'Еврейский (Фрейгиш)', suffix: ' Freyg', intervals: [0, 1, 4, 5, 7, 8, 10] },
    'gypsy_minor':  { name: 'Цыганский (Венгерский минор)', suffix: ' Gyp', intervals: [0, 2, 3, 6, 7, 8, 11] },
    'caucasian':    { name: 'Кавказский', suffix: ' Cauc', intervals: [0, 1, 4, 5, 7, 9, 10] },

    // --- АВТОРСКИЕ И СИММЕТРИЧНЫЕ ЛАДЫ ---
    'acoustic':     { name: 'Акустический / Лид. доминанта', suffix: ' Acou', intervals: [0, 2, 4, 6, 7, 9, 10] },
    'octatonic':    { name: 'Октотоника / Уменьшенный', suffix: ' Oct', intervals: [0, 1, 3, 4, 6, 7, 9, 10] }
};

// эта константа в файле editor.js
//const NOTE_NAMES_LATIN = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

class HarmonyManager {
    constructor(editor) {
        this.editor = editor;
        this.isActive = false;            
        this.isHighlightActive = false;   
        this.isMuted = false;
		this.isScaleHighlightEnabled = false; // Флаг активности индикации ступеней		
        
        this.selectedRoot = 0;            // 0 = C
        this.selectedScale = 'major';
        this.currentLabel = 'C';

        // Хранилище комментариев пользователя по ID аккорда (startSlot)
        this.userComments = {};
        // Состояние раскрытия функционального анализа
        this.expandedBoxes = new Set();

        // Справочник характера функций и рекомендаций для развития
        this.functionDescriptions = {
            'T': { name: 'Тоническая группа', desc: 'Устойчивость, покой, завершенность.', next: 'Развитие: S (субдоминанта) или D (доминанта).' },
            'S': { name: 'Субдоминантовая группа', desc: 'Движение прочь от тоники, мягкое напряжение.', next: 'Развитие: D (доминанта) или возвращение в T.' },
            'D': { name: 'Доминантовая группа', desc: 'Максимальное устремление и напряжение.', next: 'Развитие: Разрешение в T (тонику).' },
            'VI': { name: 'Прерванное оборот (VI)', desc: 'Неожиданный уход вместо тоники.', next: 'Развитие: S или D для нового захода на T.' }
        };

        this.initUI();
    }

    initUI() {
        this.createLeftPanelHarmonyBox();
        this.createBoxesContainer();
		this.updateScaleBackground(); // Инициализация подсвеченной зебры при запуске
    }

    // [ОСТАЕТСЯ БЕЗ ИЗМЕНЕНИЙ]: createLeftPanelHarmonyBox()
    createLeftPanelHarmonyBox() {
        const leftPanel = document.getElementById('instruments-panel');
        if (!leftPanel) return;

        const oldBox = document.getElementById('harmony-side-box');
        if (oldBox) oldBox.remove();

        const box = document.createElement('div');
        box.id = 'harmony-side-box';
        box.className = 'harmony-side-box';

        const rootOptions = NOTE_NAMES_LATIN.map((name, index) => 
            `<option value="${index}">${name}</option>`
        ).join('');

        const scaleOptions = Object.keys(HARMONY_SCALES).map(key => 
            `<option value="${key}">${HARMONY_SCALES[key].name}</option>`
        ).join('');

        box.innerHTML = `
            <div id="btn-harmony-toggle" class="harmony-box-header" title="Включить/выключить режим гармонии">
                <span>ГАРМОНИЯ</span>
                <div class="harmony-badge" id="harmony-current-badge">${this.currentLabel}</div>
            </div>
            
            <div class="harmony-box-body">
                <!-- Селекторы Основного тона и Лада выстроены в одну строку -->
                <div class="harmony-selects-inline">
                    <select id="harmony-root-select" class="chord-styled-select" title="Основной тон">${rootOptions}</select>
                    <select id="harmony-scale-select" class="chord-styled-select" title="Лад">${scaleOptions}</select>
					<button id="btn-scale-toggle" class="chord-styled-select scale-toggle-btn active" title="Вкл/Выкл индикацию ступеней">🎹</button>
                </div>

                <div class="harmony-buttons-row">
                    <!-- Кнопка Звука по умолчанию активна (активный иконка 🔊 и класс active) -->
                    <button id="btn-harmony-sound" class="harmony-action-btn active" title="Вкл/Выкл звук фоновой гармонии">
                        <span id="harmony-sound-icon">🔊</span> Звук
                    </button>

                    <button id="btn-harmony-analyze" class="harmony-action-btn" title="Подсветить негармоничные ноты">
                        <span class="chord-icon">🎹</span> Анализ
                    </button>
                </div>
            </div>
        `;

        leftPanel.appendChild(box);

        // Обработчики событий
        document.getElementById('btn-harmony-toggle').onclick = () => this.toggleHarmonyMode();

        document.getElementById('harmony-root-select').onchange = (e) => {
            this.selectedRoot = parseInt(e.target.value);
            this.updateLabel();
        };

        document.getElementById('harmony-scale-select').onchange = (e) => {
            this.selectedScale = e.target.value;
            this.updateLabel();
        };

        // Нажатие на кнопку переключения индикации ступеней
        document.getElementById('btn-scale-toggle').onclick = () => {
            this.isScaleHighlightEnabled = !this.isScaleHighlightEnabled;
            const btn = document.getElementById('btn-scale-toggle');
            if (btn) btn.classList.toggle('active', this.isScaleHighlightEnabled);
            this.updateScaleBackground();
        };

        document.getElementById('btn-harmony-sound').onclick = () => this.toggleSound();
        document.getElementById('btn-harmony-analyze').onclick = () => this.toggleChordHighlight();
    }

    createBoxesContainer() {
        const workspace = document.getElementById('workspace');
        if (!workspace) return;

        let container = document.getElementById('harmony-boxes-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'harmony-boxes-container';
            container.className = 'harmony-boxes-container';
            workspace.appendChild(container);
        }

        const editorContainer = document.getElementById('editor-container');
        if (editorContainer && !this._isScrollBound) {
            editorContainer.addEventListener('scroll', () => {
                if (this.editor) {
                    const harmonyNotes = this.editor.tracks['harmony'] || [];
                    const chordBlocks = this.editor.groupHarmonyNotesIntoChords(harmonyNotes);
                    this.renderChordBoxes(chordBlocks);
                }
            });
            this._isScrollBound = true;
        }
    }

    // [ОСТАЕТСЯ БЕЗ ИЗМЕНЕНИЙ]: toggleHarmonyMode, toggleSound, muteSoundOnTrackChange, toggleChordHighlight, updateLabel
    toggleHarmonyMode() {
        this.isActive = !this.isActive;
        const box = document.getElementById('harmony-side-box');
        const header = document.getElementById('btn-harmony-toggle');
        if (box) box.classList.toggle('active', this.isActive);
        if (header) header.classList.toggle('active', this.isActive);

        if (this.editor) {
            if (this.isActive) {
                this.previousTrack = this.editor.activeTrack || 'piano';
                if (!this.editor.tracks['harmony']) this.editor.tracks['harmony'] = [];
                if (!this.editor.instrumentTypes['harmony']) {
                    this.editor.instrumentTypes['harmony'] = { name: 'Гармония', color: 0x4A90E2 };
                }
                this.editor.activeTrack = 'harmony';
            } else {
                const targetTrack = (this.previousTrack && this.previousTrack !== 'harmony')
                    ? this.previousTrack 
                    : (Object.keys(this.editor.tracks).find(t => t !== 'harmony') || 'piano');
                this.editor.activeTrack = targetTrack;
            }
            this.editor.renderNotes();
        }
    }

    toggleSound() {
        this.isMuted = !this.isMuted;
        const soundBtn = document.getElementById('btn-harmony-sound');
        const soundIcon = document.getElementById('harmony-sound-icon');
        if (soundBtn && soundIcon) {
            soundBtn.classList.toggle('muted', this.isMuted);
            soundBtn.classList.toggle('active', !this.isMuted);
            soundIcon.innerText = this.isMuted ? '🔇' : '🔊';
        }
    }

    muteSoundOnTrackChange() {
        this.isMuted = true;
        const soundBtn = document.getElementById('btn-harmony-sound');
        const soundIcon = document.getElementById('harmony-sound-icon');
        if (soundBtn && soundIcon) {
            soundBtn.classList.add('muted');
            soundBtn.classList.remove('active');
            soundIcon.innerText = '🔇';
        }
    }

    toggleChordHighlight() {
        this.isHighlightActive = !this.isHighlightActive;
        const analyzeBtn = document.getElementById('btn-harmony-analyze');
        if (analyzeBtn) analyzeBtn.classList.toggle('active', this.isHighlightActive);
        this.editor.renderNotes();
    }

    updateLabel() {
		const rootName = NOTE_NAMES_LATIN[this.selectedRoot];
		const scaleConfig = HARMONY_SCALES[this.selectedScale];
		this.currentLabel = `${rootName}${scaleConfig.suffix}`;

		const badge = document.getElementById('harmony-current-badge');
		if (badge) badge.innerText = this.currentLabel;

		// Обновляем CSS-зебру при смене тональности или лада
		this.updateScaleBackground();

		this.editor.renderNotes();
	}

    // НОВАЯ ИНТЕРАКТИВНАЯ ОТРИСОВКА БОКСОВ
    renderChordBoxes(chordBlocks) {
        const container = document.getElementById('harmony-boxes-container');
        const editorContainer = document.getElementById('editor-container');
        if (!container || !editorContainer) return;

        container.innerHTML = '';
        if (!chordBlocks || chordBlocks.length === 0) return;

        const scrollLeft = editorContainer.scrollLeft;

        // Единый список видов аккордов берущийся из chords.js (BASE_CHORD_TYPES)
        const baseTypes = (typeof BASE_CHORD_TYPES !== 'undefined') 
            ? BASE_CHORD_TYPES 
            : ['maj', 'min', 'dim', 'aug', 'sus2', 'sus4', '7', 'maj7', 'm7', 'dim7', '9', 'm9', 'maj9', '11', 'm11', '13', 'm13'];
            
        const extTypes = ['none', 'add9', 'sus2', 'sus4', '6', '7', 'maj7', 'b5', '#5'];

        chordBlocks.forEach(chord => {
            const leftPx = (chord.startSlot * this.editor.config.cellW) - scrollLeft;
            const widthPx = chord.durationSlots * this.editor.config.cellW;
            const boxId = chord.startSlot;

            // Ступень относительно тональности
            const degreeMap = ['I', 'II♭', 'II', 'III♭', 'III', 'IV', 'V♭', 'V', 'VI♭', 'VI', 'VII♭', 'VII'];
            const semitonesFromKey = (chord.root - this.selectedRoot + 12) % 12;
            const degreeStr = `${degreeMap[semitonesFromKey]} ст.`;

            // Функция аккорда
            let funcBadge = 'T';
            if (semitonesFromKey === 7) funcBadge = 'D';
            else if (semitonesFromKey === 5) funcBadge = 'S';
            else if (semitonesFromKey === 9) funcBadge = 'VI';
            const funcInfo = this.functionDescriptions[funcBadge] || this.functionDescriptions['T'];

            const currentType = (chord.type || 'maj').toLowerCase();
            const currentExt = chord.ext || 'none';
            const currentInversion = chord.inversion || 'none';

            // 1) Выпадающий список тона
            const rootOptionsHtml = NOTE_NAMES_LATIN.map((name, i) => 
                `<option value="${i}" ${i === chord.root % 12 ? 'selected' : ''}>${name}</option>`
            ).join('');

            // 2) Выпадающий список видов (Фиксация строго по аккорду)
            const typeOptionsHtml = baseTypes.map(t => {
                const isSelected = t.toLowerCase() === currentType;
                return `<option value="${t}" ${isSelected ? 'selected' : ''}>${t}</option>`;
            }).join('');

            // 3) Дополнительные звуки
            const extOptionsHtml = extTypes.map(e => 
                `<option value="${e}" ${e === currentExt ? 'selected' : ''}>${e === 'none' ? '+ звук' : e}</option>`
            ).join('');

            const box = document.createElement('div');
            box.className = 'chord-info-box';
            box.style.left = `${leftPx}px`;
            box.style.width = `${Math.max(widthPx - 2, 210)}px`;

            box.innerHTML = `
                <div class="chord-selects-inline">
                    <select class="chord-styled-select chord-root-select" data-boxid="${boxId}">${rootOptionsHtml}</select>
                    <select class="chord-styled-select chord-type-select" data-boxid="${boxId}">${typeOptionsHtml}</select>
                    <select class="chord-styled-select chord-ext-select" data-boxid="${boxId}">${extOptionsHtml}</select>
                </div>
                <div class="chord-degree-func-row">
                    <span class="chord-degree-text">${degreeStr}</span>
                    <span class="chord-func-text">${funcBadge} (${funcInfo.name})</span>
                </div>
                <div class="chord-char-desc">${funcInfo.desc}</div>
            `;

            const playChordBox = () => {
                const intervals = this.editor.getChordIntervals(chord.type);
                const basePitch = 48 + (chord.root % 12);
                const pitches = intervals.map(i => basePitch + i);
                if (typeof this.editor.playChordPreviewByPitches === 'function') {
                    this.editor.playChordPreviewByPitches(pitches, '2n');
                }
            };

            box.addEventListener('click', (e) => {
                if (!e.target.classList.contains('chord-styled-select')) {
                    playChordBox();
                }
            });

            const rootSelect = box.querySelector('.chord-root-select');
            const typeSelect = box.querySelector('.chord-type-select');
            const extSelect = box.querySelector('.chord-ext-select');

            rootSelect.onchange = (e) => {
                const newRoot = parseInt(e.target.value);
                chord.root = newRoot;
                this.updateChordBlock(chord, newRoot, chord.type);
                playChordBox();
            };

            typeSelect.onchange = (e) => {
                const newType = e.target.value;
                chord.type = newType;
                this.updateChordBlock(chord, chord.root, newType);
                playChordBox();
            };

            extSelect.onchange = (e) => {
                chord.ext = e.target.value;
                this.updateChordBlock(chord, chord.root, chord.type);
                playChordBox();
            };

            container.appendChild(box);
        });
    }
	// Вспомогательный метод изменения нот трека гармонии при смене тона/типа в боксе
    updateChordBlock(chord, newRoot, newType) {
        const harmonyNotes = this.editor.tracks['harmony'] || [];
        // Удаляем старые ноты этого аккорда
        this.editor.tracks['harmony'] = harmonyNotes.filter(n => n.start !== chord.startSlot);

        const intervals = this.editor.getChordIntervals(newType);
        const basePitch = 48 + newRoot; // C3 + root

        intervals.forEach(interval => {
            this.editor.tracks['harmony'].push({
                pitch: basePitch + interval,
                start: chord.startSlot,
                duration: chord.durationSlots,
                dotted: false
            });
        });

        this.editor.renderNotes();
    }

    isHarmonicAtSlot(pitch, slot, chordBlocks) {
        if (!chordBlocks || chordBlocks.length === 0) return true;
        const activeChord = chordBlocks.find(c => slot >= c.startSlot && slot < (c.startSlot + c.durationSlots));
        if (!activeChord) return true;

        const noteInOctave = (pitch - 12) % 12;
        const root = activeChord.root % 12;
        
        const intervals = (this.editor && typeof this.editor.getChordIntervals === 'function')
            ? this.editor.getChordIntervals(activeChord.type)
            : [0, 4, 7];

        const allowedPitches = intervals.map(i => (root + i) % 12);
        return allowedPitches.includes(noteInOctave);
    }
    
    updateTechnicalInfo() {
        if (this.editor && typeof this.editor.renderNotes === 'function') {
            this.editor.renderNotes();
        }
    }
	
	// В класс HarmonyManager добавляем новый метод динамической сборки CSS-градиента при выборе лада:
	updateScaleBackground() {
		const container = document.getElementById('editor-container');
		if (!container) return;

		// Если индикация отключена — удаляем переопределенную переменную,
		// и браузер использует дефолтную пианино-зебру из CSS
		if (!this.isScaleHighlightEnabled) {
			container.style.removeProperty('--scale-zebra');
			return;
		}

		const noteIndices = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0];
		
		const scaleConfig = HARMONY_SCALES[this.selectedScale];
		if (!scaleConfig) return;

		const activePitchClasses = scaleConfig.intervals.map(interval => (this.selectedRoot + interval) % 12);

		const colorInScale = '#2C3540';    // Цвет подсвеченных ступеней
		const colorOutOfScale = '#181818'; // Цвет клавиш вне лада

		const stops = [];
		
		noteIndices.forEach((pitchClass, idx) => {
			const isInScale = activePitchClasses.includes(pitchClass);
			const color = isInScale ? colorInScale : colorOutOfScale;

			const startPct = ((idx) / 12 * 100).toFixed(4);
			const endPct = ((idx + 1) / 12 * 100).toFixed(4);

			stops.push(`${color} ${startPct}%`, `${color} ${endPct}%`);
		});

		const gradientStr = `linear-gradient(to bottom, ${stops.join(', ')})`;
		container.style.setProperty('--scale-zebra', gradientStr);
	}
}