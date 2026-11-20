/**
 * Модуль упражнения "Музыкальный диктант" для Amadeus DAW
 * - Настройки (11 параметров, включая галочку "Показать первую ноту")
 * - Передача сессии в новую вкладку через URL-параметры без автозагрузки кэша
 * - Полное визуальное сокрытие нот трека "Проверить ответ" до нажатия на него
 * - Музыкальный генератор мелодий: уровни 1-10, фразовые паузы, строгий запрет синкоп
 * - Окончание на сильную долю целой длительностью, разрешение в устойчивые ступени и тонику в басу
 * - Настоящая полифония с имитацией темы сопрано и неспешным басом
 * - Строгая проверка по высоте, тактовой позиции и длительности + кнопки "Повторить" и "Еще музыкальный диктант"
 */

const DICTATION_INTERVALS = [
    // Основные (диатонические)
    { id: 'm2',  semitones: 1,  name: 'м.2 (Малая секунда)',   type: 'diatonic' },
    { id: 'M2',  semitones: 2,  name: 'б.2 (Большая секунда)', type: 'diatonic' },
    { id: 'm3',  semitones: 3,  name: 'м.3 (Малая терция)',    type: 'diatonic' },
    { id: 'M3',  semitones: 4,  name: 'б.3 (Большая терция)',  type: 'diatonic' },
    { id: 'P4',  semitones: 5,  name: 'ч.4 (Чистая кварта)',   type: 'diatonic' },
    { id: 'P5',  semitones: 7,  name: 'ч.5 (Чистая квинта)',   type: 'diatonic' },
    { id: 'm6',  semitones: 8,  name: 'м.6 (Малая секста)',    type: 'diatonic' },
    { id: 'M6',  semitones: 9,  name: 'б.6 (Большая секста)',  type: 'diatonic' },
    { id: 'm7',  semitones: 10, name: 'м.7 (Малая септима)',   type: 'diatonic' },
    { id: 'M7',  semitones: 11, name: 'б.7 (Большая септима)', type: 'diatonic' },
    { id: 'P8',  semitones: 12, name: 'ч.8 (Чистая октава)',   type: 'diatonic' },
    // Расширенные (хроматические / составные)
    { id: 'TT',  semitones: 6,  name: 'Тритон (ув.4 / ум.5)',  type: 'extended' },
    { id: 'm9',  semitones: 13, name: 'м.9 (Малая нона)',      type: 'extended' },
    { id: 'M9',  semitones: 14, name: 'б.9 (Большая нона)',    type: 'extended' },
    { id: 'm10', semitones: 15, name: 'м.10 (Малая децима)',   type: 'extended' },
    { id: 'M10', semitones: 16, name: 'б.10 (Большая децима)', type: 'extended' },
    { id: 'P11', semitones: 17, name: 'ч.11 (Ундецима)',       type: 'extended' },
    { id: 'P12', semitones: 19, name: 'ч.12 (Дуодецима)',      type: 'extended' }
];

const DICTATION_DIFFICULTY_DESCRIPTIONS = {
    1:  'Уровень 1: Чередование основных устойчивых ступеней (I, III, V), плавные переходы без синкоп.',
    2:  'Уровень 2: Основные ступени (I, III, V) и их плавные диатонические опевания.',
    3:  'Уровень 3: Добавляются проходящие звуки между основными ступенями лада.',
    4:  'Уровень 4: Добавляются скачки на терции (м.3, б.3) и разрешение неустойчивых ступеней.',
    5:  'Уровень 5: Добавляются скачки на чистую кварту (ч.4) и плавное заполнение.',
    6:  'Уровень 6: Добавляются скачки на чистую квинту (ч.5) и мотивные секвенции.',
    7:  'Уровень 7: Добавляются сексты (м.6, б.6) и вводные тоны к ступеням.',
    8:  'Уровень 8: Добавляются септимы (м.7, б.7) и октавные скачки (ч.8).',
    9:  'Уровень 9: Добавляется тритон и альтерированные проходящие звуки.',
    10: 'Уровень 10: Полная свобода лада, хроматизмы и широкие интервалы (ноны, децимы).'
};

class DictationManager {
    constructor() {
        this.isDictationMode = false;
        this.sessionData = null;
        this.isChecked = false;
        this.noteCheckResults = new Map(); // noteObj -> 'correct' | 'wrong'
        this._renderHookInstalled = false;
        this.injectStyles();
    }

    injectStyles() {
        if (document.getElementById('dictation-module-styles')) return;
        const style = document.createElement('style');
        style.id = 'dictation-module-styles';
        style.textContent = `
            #dictationSettingsModal {
                display: none;
                position: fixed;
                top: 0; left: 0; width: 100vw; height: 100vh;
                background: rgba(10, 12, 16, 0.82);
                backdrop-filter: blur(6px);
                z-index: 100000;
                align-items: center;
                justify-content: center;
                font-family: var(--font-main, 'Segoe UI', sans-serif);
            }
            .dictation-modal-box {
                background: #1e222d;
                color: #e1e6ed;
                border: 1px solid #3a4252;
                border-radius: 12px;
                width: 680px;
                max-width: 94vw;
                max-height: 90vh;
                display: flex;
                flex-direction: column;
                box-shadow: 0 20px 50px rgba(0,0,0,0.75);
                overflow: hidden;
            }
            .dictation-modal-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 16px 22px;
                background: #252a34;
                border-bottom: 1px solid #323846;
            }
            .dictation-modal-header h2 {
                margin: 0;
                font-size: 18px;
                color: #4A90E2;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .dictation-modal-body {
                padding: 18px 22px;
                overflow-y: auto;
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 14px 18px;
            }
            .dict-field {
                display: flex;
                flex-direction: column;
                gap: 5px;
            }
            .dict-field.full-span {
                grid-column: 1 / -1;
            }
            .dict-field label {
                font-size: 11px;
                color: #94a3b8;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.4px;
            }
            .dict-select, .dict-input {
                background: #141721;
                color: #fff;
                border: 1px solid #3a4252;
                border-radius: 6px;
                padding: 7px 10px;
                font-size: 13px;
                outline: none;
            }
            .dict-select:focus, .dict-input:focus {
                border-color: #4A90E2;
            }
            .dict-dur-group {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                align-items: center;
                background: #141721;
                padding: 8px 10px;
                border-radius: 6px;
                border: 1px solid #3a4252;
            }
            .dict-check-pill {
                display: inline-flex;
                align-items: center;
                gap: 5px;
                background: #252a34;
                border: 1px solid #3a4252;
                padding: 4px 9px;
                border-radius: 4px;
                font-size: 12px;
                cursor: pointer;
                user-select: none;
                color: #cbd5e1;
            }
            .dict-check-pill input {
                accent-color: #4A90E2;
                cursor: pointer;
            }
            .dict-dot-toggle {
                margin-left: auto;
                background: #2d3342;
                border: 1px solid #454f62;
                color: #cbd5e1;
                padding: 4px 10px;
                border-radius: 4px;
                font-size: 12px;
                cursor: pointer;
                font-weight: 600;
            }
            .dict-dot-toggle.active {
                background: #4A90E2;
                border-color: #72B0FF;
                color: #fff;
            }
            .dict-first-note-bar {
                display: flex;
                align-items: center;
                gap: 8px;
                background: #141721;
                border: 1px solid #3a4252;
                border-radius: 6px;
                padding: 8px 12px;
                cursor: pointer;
                user-select: none;
                font-size: 13px;
                color: #e1e6ed;
            }
            .dict-first-note-bar input {
                width: 15px;
                height: 15px;
                accent-color: #27AE60;
                cursor: pointer;
            }
            .dict-intervals-box {
                background: #141721;
                border: 1px solid #3a4252;
                border-radius: 6px;
                padding: 10px;
                max-height: 130px;
                overflow-y: auto;
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 6px 12px;
            }
            .dict-interval-section-title {
                grid-column: 1 / -1;
                font-size: 11px;
                color: #4A90E2;
                font-weight: bold;
                margin-top: 4px;
                border-bottom: 1px solid #252a34;
                padding-bottom: 2px;
            }
            .dict-interval-item {
                display: flex;
                align-items: center;
                gap: 6px;
                font-size: 12px;
                color: #cbd5e1;
                cursor: pointer;
            }
            .dict-difficulty-desc {
                font-size: 11px;
                color: #2ECC71;
                background: rgba(46, 204, 113, 0.1);
                border: 1px solid rgba(46, 204, 113, 0.3);
                padding: 6px 10px;
                border-radius: 5px;
                margin-top: 4px;
            }
            .dictation-modal-footer {
                padding: 14px 22px;
                background: #252a34;
                border-top: 1px solid #323846;
                display: flex;
                justify-content: flex-end;
                gap: 10px;
            }
            .dict-btn-start {
                background: #27AE60;
                color: #fff;
                border: none;
                padding: 9px 20px;
                border-radius: 6px;
                font-size: 13px;
                font-weight: bold;
                cursor: pointer;
                transition: background 0.15s;
            }
            .dict-btn-start:hover { background: #219150; }
            .dict-btn-cancel {
                background: #3a4252;
                color: #e1e6ed;
                border: none;
                padding: 9px 16px;
                border-radius: 6px;
                font-size: 13px;
                cursor: pointer;
            }
            .dict-btn-cancel:hover { background: #4a5366; }

            /* Плавающее окно результатов диктанта справа сверху */
            #dictation-result-widget {
                position: fixed;
                top: 64px;
                right: 95px;
                width: 245px;
                background: rgba(26, 29, 36, 0.96);
                border: 1px solid #3a4252;
                border-top: 3px solid #4A90E2;
                border-radius: 10px;
                padding: 14px;
                box-shadow: 0 10px 28px rgba(0, 0, 0, 0.7);
                z-index: 9500;
                color: #e1e6ed;
                font-family: var(--font-main, 'Segoe UI', sans-serif);
                backdrop-filter: blur(6px);
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 10px;
            }
            #dictation-result-widget h4 {
                margin: 0;
                font-size: 13px;
                color: #ffffff;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            .dict-pie-wrapper {
                position: relative;
                width: 116px;
                height: 116px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: inset 0 0 10px rgba(0,0,0,0.6);
            }
            .dict-pie-inner {
                width: 74px;
                height: 74px;
                border-radius: 50%;
                background: #1a1d24;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                font-weight: bold;
                font-size: 16px;
                color: #2ECC71;
            }
            .dict-stats-legend {
                width: 100%;
                display: flex;
                justify-content: space-between;
                font-size: 12px;
                padding: 6px 8px;
                background: #141721;
                border-radius: 6px;
                box-sizing: border-box;
            }
            .dict-stat-ok { color: #2ECC71; font-weight: 600; }
            .dict-stat-err { color: #E74C3C; font-weight: 600; }
            .dict-result-actions {
                width: 100%;
                display: flex;
                flex-direction: column;
                gap: 6px;
            }
            .dict-btn-repeat {
                width: 100%;
                background: #27AE60;
                color: #fff;
                border: none;
                border-radius: 6px;
                padding: 8px 10px;
                font-size: 12px;
                font-weight: bold;
                cursor: pointer;
                transition: background 0.15s;
            }
            .dict-btn-repeat:hover { background: #219150; }
            .dict-btn-again {
                width: 100%;
                background: #4A90E2;
                color: #fff;
                border: none;
                border-radius: 6px;
                padding: 8px 10px;
                font-size: 12px;
                font-weight: bold;
                cursor: pointer;
                transition: background 0.15s;
            }
            .dict-btn-again:hover { background: #357ABD; }
        `;
        document.head.appendChild(style);
    }

    /**
     * Генератор псевдослучайных чисел (Mulberry32) с перемешиванием seed
     */
    createSeededRandom(seed) {
        let a = (seed ^ 0x9E3779B9) >>> 0;
        return function () {
            a |= 0;
            a = a + 0x6D2B79F5 | 0;
            let t = Math.imul(a ^ a >>> 15, 1 | a);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }

    generateUniqueSeed() {
        if (window.crypto && window.crypto.getRandomValues) {
            const arr = new Uint32Array(1);
            window.crypto.getRandomValues(arr);
            return (arr[0] ^ (Date.now() & 0xFFFFFFFF)) >>> 0;
        }
        return (Math.floor(Math.random() * 2147483647) ^ Date.now()) >>> 0;
    }

    openSettingsModal() {
        this.ensureSettingsModal();
        const modal = document.getElementById('dictationSettingsModal');
        if (modal) modal.style.display = 'flex';
    }

    closeSettingsModal() {
        const modal = document.getElementById('dictationSettingsModal');
        if (modal) modal.style.display = 'none';
    }

    ensureSettingsModal() {
        if (document.getElementById('dictationSettingsModal')) return;

        const rootOptions = (typeof NOTE_NAMES_LATIN !== 'undefined' ? NOTE_NAMES_LATIN : ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'])
            .map((n, idx) => `<option value="${idx}">${n}</option>`).join('');

        const scalesObj = (typeof HARMONY_SCALES !== 'undefined') ? HARMONY_SCALES : {
            major: { name: 'Ионийский (Мажор)', intervals: [0, 2, 4, 5, 7, 9, 11] },
            minor: { name: 'Эолийский (Минор)', intervals: [0, 2, 3, 5, 7, 8, 10] }
        };
        const scaleOptions = Object.keys(scalesObj)
            .map(k => `<option value="${k}">${scalesObj[k].name}</option>`).join('');

        const diatonicHtml = DICTATION_INTERVALS.filter(i => i.type === 'diatonic').map(i => `
            <label class="dict-interval-item">
                <input type="checkbox" class="dict-req-interval" value="${i.semitones}">
                <span>${i.name}</span>
            </label>
        `).join('');

        const extendedHtml = DICTATION_INTERVALS.filter(i => i.type === 'extended').map(i => `
            <label class="dict-interval-item">
                <input type="checkbox" class="dict-req-interval" value="${i.semitones}">
                <span>${i.name}</span>
            </label>
        `).join('');

        const levelOptions = Array.from({ length: 10 }, (_, idx) => {
            const lvl = idx + 1;
            return `<option value="${lvl}">Уровень ${lvl}</option>`;
        }).join('');

        const modal = document.createElement('div');
        modal.id = 'dictationSettingsModal';
        modal.innerHTML = `
            <div class="dictation-modal-box">
                <div class="dictation-modal-header">
                    <h2>🎼 Настройки музыкального диктанта</h2>
                    <button id="btn-close-dict-modal" class="btn-close">&times;</button>
                </div>

                <div class="dictation-modal-body">
                    <!-- 1. Основной тон -->
                    <div class="dict-field">
                        <label>1. Основной тон</label>
                        <select id="dict-root" class="dict-select">${rootOptions}</select>
                    </div>

                    <!-- 2. Лад -->
                    <div class="dict-field">
                        <label>2. Лад</label>
                        <select id="dict-scale" class="dict-select">${scaleOptions}</select>
                    </div>

                    <!-- 3. Количество нот -->
                    <div class="dict-field">
                        <label>3. Количество нот (от 2 до 30)</label>
                        <input type="number" id="dict-note-count" class="dict-input" min="2" max="30" value="8">
                    </div>

                    <!-- 4. Октава -->
                    <div class="dict-field">
                        <label>4. Начальная октава</label>
                        <select id="dict-octave" class="dict-select">
                            <option value="2">Большая октава (C2)</option>
                            <option value="3">Малая октава (C3)</option>
                            <option value="4" selected>Первая октава (C4)</option>
                            <option value="5">Вторая октава (C5)</option>
                            <option value="6">Третья октава (C6)</option>
                        </select>
                    </div>

                    <!-- 5. Музыкальный размер -->
                    <div class="dict-field">
                        <label>5. Музыкальный размер</label>
                        <select id="dict-time-sig" class="dict-select">
                            <option value="4/4" selected>4/4</option>
                            <option value="3/4">3/4</option>
                            <option value="2/4">2/4</option>
                            <option value="5/4">5/4</option>
                        </select>
                    </div>

                    <!-- 7. Количество голосов -->
                    <div class="dict-field">
                        <label>7. Количество голосов (1–4)</label>
                        <select id="dict-voices" class="dict-select">
                            <option value="1" selected>1 голос (Одноголосие)</option>
                            <option value="2">2 голоса</option>
                            <option value="3">3 голоса</option>
                            <option value="4">4 голоса</option>
                        </select>
                    </div>

                    <!-- 6. Длительности нот -->
                    <div class="dict-field full-span">
                        <label>6. Длительности нот</label>
                        <div class="dict-dur-group">
                            <label class="dict-check-pill"><input type="checkbox" class="dict-dur-cb" value="16"> 1/1</label>
                            <label class="dict-check-pill"><input type="checkbox" class="dict-dur-cb" value="8" checked> 1/2</label>
                            <label class="dict-check-pill"><input type="checkbox" class="dict-dur-cb" value="4" checked> 1/4</label>
                            <label class="dict-check-pill"><input type="checkbox" class="dict-dur-cb" value="2"> 1/8</label>
                            <label class="dict-check-pill"><input type="checkbox" class="dict-dur-cb" value="1"> 1/16</label>
                            <button type="button" id="dict-dotted-btn" class="dict-dot-toggle" title="Разрешить длительности с точкой">• С точками</button>
                        </div>
                    </div>

                    <!-- 8. Допустимые ступени -->
                    <div class="dict-field">
                        <label>8. Допустимые ступени</label>
                        <select id="dict-degrees-mode" class="dict-select">
                            <option value="primary" selected>Основные ступени (I, III, V / I, IV, V)</option>
                            <option value="all_scale">Все ступени лада</option>
                            <option value="leading">С вводными ступенями</option>
                            <option value="chromatic">С хроматикой</option>
                        </select>
                    </div>

                    <!-- 10. Уровень сложности -->
                    <div class="dict-field">
                        <label>10. Уровень сложности (1–10)</label>
                        <select id="dict-difficulty" class="dict-select">${levelOptions}</select>
                    </div>

                    <div class="dict-field full-span" style="margin-top:-6px;">
                        <div id="dict-difficulty-hint" class="dict-difficulty-desc">${DICTATION_DIFFICULTY_DESCRIPTIONS[1]}</div>
                    </div>

                    <!-- 11. Настройка подсказки первой ноты -->
                    <div class="dict-field full-span">
                        <label class="dict-first-note-bar">
                            <input type="checkbox" id="dict-show-first-note" checked>
                            <span>🎵 Показать первую ноту (настройка слуха перед записью)</span>
                        </label>
                    </div>

                    <!-- 9. Обязательные интервалы -->
                    <div class="dict-field full-span">
                        <label>9. Обязательные интервалы (обязательно прозвучат в диктанте)</label>
                        <div class="dict-intervals-box">
                            <div class="dict-interval-section-title">Основные (диатонические)</div>
                            ${diatonicHtml}
                            <div class="dict-interval-section-title">Расширенные (включая хроматические)</div>
                            ${extendedHtml}
                        </div>
                    </div>
                </div>

                <div class="dictation-modal-footer">
                    <button type="button" id="btn-cancel-dict-modal" class="dict-btn-cancel">Отмена</button>
                    <button type="button" id="btn-start-dictation" class="dict-btn-start">▶ Начать диктант</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        document.getElementById('btn-close-dict-modal').onclick = () => this.closeSettingsModal();
        document.getElementById('btn-cancel-dict-modal').onclick = () => this.closeSettingsModal();

        const dotBtn = document.getElementById('dict-dotted-btn');
        dotBtn.onclick = () => dotBtn.classList.toggle('active');

        const diffSelect = document.getElementById('dict-difficulty');
        const diffHint = document.getElementById('dict-difficulty-hint');
        diffSelect.onchange = () => {
            const lvl = parseInt(diffSelect.value, 10) || 1;
            diffHint.textContent = DICTATION_DIFFICULTY_DESCRIPTIONS[lvl] || '';
        };

        document.getElementById('btn-start-dictation').onclick = () => this.startNewDictationSession();
    }

    /**
     * Формирует URL с заданными настройками и уникальным seed и открывает новую вкладку
     */
    launchDictationTab(settingsObj) {
        const seed = this.generateUniqueSeed();
        const url = new URL(window.location.origin + window.location.pathname);
        url.searchParams.set('dictation', '1');
        url.searchParams.set('root', String(settingsObj.root));
        url.searchParams.set('scale', settingsObj.scaleKey);
        url.searchParams.set('count', String(settingsObj.noteCount));
        url.searchParams.set('oct', String(settingsObj.octave));
        url.searchParams.set('ts', settingsObj.timeSig);
        url.searchParams.set('voices', String(settingsObj.voicesCount));
        url.searchParams.set('deg', settingsObj.degreesMode);
        url.searchParams.set('diff', String(settingsObj.difficulty));
        url.searchParams.set('dot', settingsObj.allowDotted ? '1' : '0');
        url.searchParams.set('first', settingsObj.showFirstNote ? '1' : '0');
        url.searchParams.set('durs', settingsObj.selectedDurations.join(','));
        if (settingsObj.requiredIntervals && settingsObj.requiredIntervals.length > 0) {
            url.searchParams.set('req', settingsObj.requiredIntervals.join(','));
        }
        url.searchParams.set('seed', String(seed));

        window.open(url.toString(), '_blank');
    }

    /**
     * Сбор параметров из модального окна и запуск новой вкладки диктанта
     */
    startNewDictationSession() {
        const root = parseInt(document.getElementById('dict-root')?.value || '0', 10);
        const scaleKey = document.getElementById('dict-scale')?.value || 'major';
        const noteCount = Math.max(2, Math.min(30, parseInt(document.getElementById('dict-note-count')?.value || '8', 10)));
        const octave = parseInt(document.getElementById('dict-octave')?.value || '4', 10);
        const timeSig = document.getElementById('dict-time-sig')?.value || '4/4';
        const voicesCount = Math.max(1, Math.min(4, parseInt(document.getElementById('dict-voices')?.value || '1', 10)));
        const degreesMode = document.getElementById('dict-degrees-mode')?.value || 'primary';
        const difficulty = parseInt(document.getElementById('dict-difficulty')?.value || '1', 10);
        const allowDotted = document.getElementById('dict-dotted-btn')?.classList.contains('active') || false;
        const showFirstNote = document.getElementById('dict-show-first-note')?.checked ?? true;

        let selectedDurations = Array.from(document.querySelectorAll('.dict-dur-cb:checked'))
            .map(cb => parseInt(cb.value, 10));
        if (selectedDurations.length === 0) selectedDurations = [4];

        const requiredIntervals = Array.from(document.querySelectorAll('.dict-req-interval:checked'))
            .map(cb => parseInt(cb.value, 10));

        this.closeSettingsModal();

        this.launchDictationTab({
            root,
            scaleKey,
            noteCount,
            octave,
            timeSig,
            voicesCount,
            degreesMode,
            difficulty,
            allowDotted,
            showFirstNote,
            selectedDurations,
            requiredIntervals
        });
    }

    /**
     * Повтор диктанта с теми же параметрами, но новой мелодией (новый seed)
     */
    repeatDictationWithSameSettings() {
        if (!this.sessionData || !this.sessionData.settings) {
            this.openSettingsModal();
            return;
        }
        this.launchDictationTab(this.sessionData.settings);
    }

    parseSettingsFromUrl() {
        const params = new URLSearchParams(window.location.search);
        if (params.get('dictation') !== '1') return null;

        const dursRaw = params.get('durs') || '8,4';
        const selectedDurations = dursRaw.split(',').map(v => parseInt(v, 10)).filter(n => !isNaN(n) && n > 0);

        const reqRaw = params.get('req') || '';
        const requiredIntervals = reqRaw
            ? reqRaw.split(',').map(v => parseInt(v, 10)).filter(n => !isNaN(n) && n > 0)
            : [];

        return {
            root: parseInt(params.get('root') || '0', 10),
            scaleKey: params.get('scale') || 'major',
            noteCount: Math.max(2, Math.min(30, parseInt(params.get('count') || '8', 10))),
            octave: parseInt(params.get('oct') || '4', 10),
            timeSig: params.get('ts') || '4/4',
            voicesCount: Math.max(1, Math.min(4, parseInt(params.get('voices') || '1', 10))),
            degreesMode: params.get('deg') || 'all_scale',
            difficulty: parseInt(params.get('diff') || '1', 10),
            allowDotted: params.get('dot') === '1',
            showFirstNote: params.get('first') === '1',
            selectedDurations: selectedDurations.length > 0 ? selectedDurations : [4],
            requiredIntervals,
            seed: parseInt(params.get('seed') || String(this.generateUniqueSeed()), 10)
        };
    }

    /**
     * Генерация ритмического ряда с фразовыми паузами, строгим запретом синкоп
     * и обязательным окончанием на сильную долю (posInMeasure === 0) целой длительностью (slotsPerMeasure).
     *
     * Правило отсутствия синкоп:
     * - На сильной или относительно сильной доле длительность >= следующей за ней ноты.
     * - Если на долю попала мелкая длительность (например, 1/8), она заполняет долю серией
     *   мелких нот до следующей опорной доли (без скачка в более крупную ноту на слабой доле).
     */
    buildMusicalRhythmWithCadence(noteCount, slotsPerMeasure, slotsPerBeat, durationPool, addPhraseRests, rng) {
        const randItem = (arr) => arr[Math.floor(rng() * arr.length)];
        const sortedDursAsc = [...durationPool].sort((a, b) => a.slots - b.slots);
        const minDur = sortedDursAsc[0].slots;

        const events = []; // { start, duration, dotted, isStrongBeat, isPhraseEnd }
        let currentSlot = 0;
        let activeBurstDur = null; // Если начался пассаж мелких нот внутри доли — держим его до следующей доли

        const halfPoint = Math.floor(noteCount / 2);

        for (let i = 0; i < noteCount; i++) {
            const isLastNote = (i === noteCount - 1);
            const isPenultimateNote = (i === noteCount - 2);
            const posInMeasure = currentSlot % slotsPerMeasure;
            const remInMeasure = slotsPerMeasure - posInMeasure;
            const posInBeat = currentSlot % slotsPerBeat;
            const remInBeat = slotsPerBeat - posInBeat;

            // 1. ФИНАЛЬНАЯ НОТА:
            // Всегда начинается строго на сильную долю (posInMeasure === 0)
            // и имеет длительность целого такта (slotsPerMeasure = 1/1 в 4/4).
            if (isLastNote) {
                if (posInMeasure !== 0) {
                    // Доводим позицию до сильной доли следующего такта
                    currentSlot += remInMeasure;
                }
                events.push({
                    start: currentSlot,
                    duration: slotsPerMeasure,
                    dotted: false,
                    isStrongBeat: true,
                    isPhraseEnd: true
                });
                currentSlot += slotsPerMeasure;
                break;
            }

            // 2. ПРЕДПОСЛЕДНЯЯ НОТА:
            // Если до конца такта остаётся место и следующий шаг — финальная нота,
            // подбираем длительность так, чтобы завершить текущий такт ровно к сильной доле следующего.
            if (isPenultimateNote && posInMeasure > 0) {
                events.push({
                    start: currentSlot,
                    duration: remInMeasure,
                    dotted: (remInMeasure % 3 === 0 && remInMeasure !== 3),
                    isStrongBeat: (posInBeat === 0),
                    isPhraseEnd: false
                });
                currentSlot += remInMeasure;
                continue;
            }

            // 3. ОСНОВНОЙ РИТМИЧЕСКИЙ ПОТОК (БЕЗ СИНКОП И ПЕРЕНОСОВ ЧЕРЕЗ ТАКТ)
            let validDurs = durationPool.filter(d => d.slots <= remInMeasure);
            if (validDurs.length === 0) {
                validDurs = [{ slots: remInMeasure, dotted: false }];
            }

            // Если мы находимся внутри начатого пассажа мелких нот (внутри доли) — продолжаем этим же шагом до конца доли
            if (posInBeat !== 0 && activeBurstDur !== null && activeBurstDur <= remInBeat) {
                const sameBurst = validDurs.filter(d => d.slots === activeBurstDur);
                if (sameBurst.length > 0) {
                    validDurs = sameBurst;
                } else {
                    validDurs = [{ slots: Math.min(activeBurstDur, remInBeat), dotted: false }];
                }
            } else {
                // Начало новой доли (posInBeat === 0)
                activeBurstDur = null;

                // На слабых долях такта запрещаем длительности больше, чем на сильной доле этого такта
                if (posInMeasure !== 0 && events.length > 0) {
                    // Находим первую ноту текущего такта
                    const measureStartSlot = currentSlot - posInMeasure;
                    const firstNoteInMeasure = events.find(e => e.start === measureStartSlot);
                    const maxAllowedInMeasure = firstNoteInMeasure ? firstNoteInMeasure.duration : remInMeasure;

                    const nonSyncopated = validDurs.filter(d => d.slots <= maxAllowedInMeasure);
                    if (nonSyncopated.length > 0) validDurs = nonSyncopated;
                }

                // Не допускаем одиночных "оборванных" мелких нот на сильной доле (если взяли 1/8 — запускаем пассаж до конца доли)
                const chosenPreview = randItem(validDurs);
                if (chosenPreview.slots < slotsPerBeat) {
                    activeBurstDur = chosenPreview.slots;
                    validDurs = [chosenPreview];
                }
            }

            const chosen = randItem(validDurs);
            const isPhraseEnd = (i === halfPoint - 1 && noteCount >= 4);

            events.push({
                start: currentSlot,
                duration: chosen.slots,
                dotted: !!chosen.dotted,
                isStrongBeat: (posInMeasure === 0) || (slotsPerMeasure >= 12 && posInMeasure === Math.floor(slotsPerMeasure / 2)),
                isPhraseEnd
            });

            currentSlot += chosen.slots;

            // Добавляем фразовую паузу (цезуру) после середины диктанта (окончания "вопроса")
            if (addPhraseRests && isPhraseEnd) {
                const newPosInMeasure = currentSlot % slotsPerMeasure;
                const remAfterPhrase = slotsPerMeasure - newPosInMeasure;
                if (newPosInMeasure > 0 && remAfterPhrase >= minDur) {
                    // Пауза до конца текущего такта, чтобы ответная фраза началась с сильной доли
                    currentSlot += remAfterPhrase;
                    activeBurstDur = null;
                } else if (newPosInMeasure === 0 && noteCount >= 6) {
                    // Короткая дыхательная пауза в 1 долю на границе фраз
                    currentSlot += slotsPerBeat;
                    activeBurstDur = null;
                }
            }
        }

        return events;
    }

    /**
     * Генератор мелодий и настоящей полифонии:
     * - Уровни 1-3: музыкальные мелодии с вопросно-ответной формой, паузами и без синкоп
     * - Многоголосие: имитация темы сопрано, неспешный бас (1/1, 1/2), самостоятельный ритм и паузы
     * - Финал: всегда на сильную долю, длительность 1/1, в басу — основной тон лада
     */
    generateDictationVoices(settings) {
        const rng = this.createSeededRandom(settings.seed);
        const randItem = (arr) => arr[Math.floor(rng() * arr.length)];

        const scalesObj = (typeof HARMONY_SCALES !== 'undefined') ? HARMONY_SCALES : {
            major: { intervals: [0, 2, 4, 5, 7, 9, 11] }
        };
        const scaleIntervals = (scalesObj[settings.scaleKey] || scalesObj.major).intervals;

        const baseTonicMidi = (settings.octave + 1) * 12 + settings.root;
        const minMidi = 24;
        const maxMidi = 95;

        const scalePitches = [];       // Все ступени лада
        const tonicTriadPitches = [];  // I, III, V ступени
        const primaryPitches = [];     // I, III, IV, V ступени

        for (let p = baseTonicMidi - 5; p <= baseTonicMidi + 14; p++) {
            if (p < minMidi || p > maxMidi) continue;
            const rel = ((p - baseTonicMidi) % 12 + 12) % 12;
            const degIndex = scaleIntervals.indexOf(rel);

            if (degIndex !== -1) {
                scalePitches.push(p);
                if (degIndex === 0 || degIndex === 2 || degIndex === 4) {
                    tonicTriadPitches.push(p);
                    primaryPitches.push(p);
                } else if (degIndex === 3) {
                    primaryPitches.push(p);
                }
            } else if (settings.degreesMode === 'chromatic' || settings.difficulty >= 9) {
                scalePitches.push(p);
            } else if (settings.degreesMode === 'leading' && (rel === 11 || rel === 6 || rel === 1)) {
                scalePitches.push(p);
            }
        }

        scalePitches.sort((a, b) => a - b);
        tonicTriadPitches.sort((a, b) => a - b);
        primaryPitches.sort((a, b) => a - b);

        let activeLadder = scalePitches;
        if (settings.difficulty === 1) {
            activeLadder = tonicTriadPitches.length >= 3 ? tonicTriadPitches : scalePitches;
        } else if (settings.degreesMode === 'primary' && settings.difficulty > 3) {
            activeLadder = primaryPitches.length >= 3 ? primaryPitches : scalePitches;
        }

        const [beatsStr, beatTypeStr] = settings.timeSig.split('/');
        const beats = parseInt(beatsStr, 10) || 4;
        const beatType = parseInt(beatTypeStr, 10) || 4;
        const slotsPerBeat = 16 / beatType;
        const slotsPerMeasure = Math.round(beats * slotsPerBeat);

        const durationPool = [];
        settings.selectedDurations.forEach(d => {
            durationPool.push({ slots: d, dotted: false });
            if (settings.allowDotted && d >= 2 && d <= 8) {
                durationPool.push({ slots: Math.round(d * 1.5), dotted: true });
            }
        });

        // 1. Ритм ведущего голоса (Сопрано) с паузами между фразами и финалом на сильную долю целой длительностью
        const melodyRhythm = this.buildMusicalRhythmWithCadence(
            settings.noteCount,
            slotsPerMeasure,
            slotsPerBeat,
            durationPool,
            settings.noteCount >= 5,
            rng
        );

        // 2. Мелодическая линия сопрано
        const melodyNotes = [];
        const halfIndex = Math.floor(settings.noteCount / 2);

        let currIdx = activeLadder.findIndex(p => p >= baseTonicMidi);
        if (currIdx === -1) currIdx = Math.floor(activeLadder.length / 2);

        const startCandidates = activeLadder
            .map((p, idx) => ({ p, idx }))
            .filter(item => tonicTriadPitches.includes(item.p) && Math.abs(item.p - baseTonicMidi) <= 7);
        if (startCandidates.length > 0) {
            currIdx = randItem(startCandidates).idx;
        }

        let direction = rng() < 0.5 ? 1 : -1;
        let stepsInSameDir = 0;
        let stepsSinceLeap = 2;
        const pendingRequired = [...settings.requiredIntervals];

        for (let i = 0; i < melodyRhythm.length; i++) {
            const rSlot = melodyRhythm[i];

            if (i === 0) {
                // Начинаем с устойчивой ступени
            } else if (i === halfIndex - 1 && settings.noteCount >= 4) {
                // Окончание первой фразы ("вопрос"): остановка на III или V ступени
                const halfCadenceCands = activeLadder
                    .map((p, idx) => ({ p, idx }))
                    .filter(item => {
                        const rel = ((item.p - baseTonicMidi) % 12 + 12) % 12;
                        return (rel === 4 || rel === 3 || rel === 7) && Math.abs(item.idx - currIdx) <= 2;
                    });
                if (halfCadenceCands.length > 0) {
                    currIdx = randItem(halfCadenceCands).idx;
                }
                direction = -direction;
                stepsInSameDir = 0;
            } else if (i === melodyRhythm.length - 1) {
                // Финал ("ответ"): разрешение в устойчивую ступень трезвучия (преимущественно в I ступень)
                const stableEndCands = activeLadder
                    .map((p, idx) => ({ p, idx }))
                    .filter(item => {
                        const rel = ((item.p - baseTonicMidi) % 12 + 12) % 12;
                        return rel === 0 || rel === 4 || rel === 3 || rel === 7;
                    });
                const tonicOnly = stableEndCands.filter(item => ((item.p - baseTonicMidi) % 12 + 12) % 12 === 0);
                const endPool = (tonicOnly.length > 0 && rng() < 0.75) ? tonicOnly : stableEndCands;

                if (endPool.length > 0) {
                    const nearestEnd = endPool.reduce((best, c) =>
                        Math.abs(c.idx - currIdx) < Math.abs(best.idx - currIdx) ? c : best
                    , endPool[0]);
                    currIdx = nearestEnd.idx;
                }
            } else if (pendingRequired.length > 0 && i % 2 === 1) {
                const reqSemi = pendingRequired.shift();
                const targetPitch = activeLadder[currIdx] + direction * reqSemi;
                let bestIdx = currIdx;
                let minDiff = Infinity;
                activeLadder.forEach((p, idx) => {
                    if (Math.abs(p - targetPitch) < minDiff) {
                        minDiff = Math.abs(p - targetPitch);
                        bestIdx = idx;
                    }
                });
                currIdx = bestIdx;
                direction = -direction;
                stepsInSameDir = 0;
                stepsSinceLeap = 0;
            } else if (settings.difficulty === 1) {
                // Уровень 1: плавное чередование основных ступеней I, III, V
                if (rng() < 0.16 && i > 1) {
                    // Повтор звука
                } else {
                    if (stepsInSameDir >= 2 + Math.floor(rng() * 2) || currIdx + direction < 0 || currIdx + direction >= activeLadder.length) {
                        direction = -direction;
                        stepsInSameDir = 0;
                    }
                    const nextIdx = currIdx + direction;
                    if (nextIdx >= 0 && nextIdx < activeLadder.length) {
                        currIdx = nextIdx;
                        stepsInSameDir++;
                    }
                }
            } else if (settings.difficulty === 2) {
                // Уровень 2: I, III, V и их диатонические опевания
                const currPitch = activeLadder[currIdx];
                const isStable = tonicTriadPitches.includes(currPitch);

                if (!isStable) {
                    const stableCands = activeLadder
                        .map((p, idx) => ({ p, idx }))
                        .filter(item => tonicTriadPitches.includes(item.p) && Math.abs(item.idx - currIdx) === 1);
                    if (stableCands.length > 0) {
                        currIdx = randItem(stableCands).idx;
                    }
                } else if (rng() < 0.45 && i < melodyRhythm.length - 2) {
                    const neighborIdx = currIdx + direction;
                    if (neighborIdx >= 0 && neighborIdx < activeLadder.length) {
                        currIdx = neighborIdx;
                    }
                } else {
                    if (stepsInSameDir >= 2 || currIdx + direction < 0 || currIdx + direction >= activeLadder.length) {
                        direction = -direction;
                        stepsInSameDir = 0;
                    }
                    const stableList = activeLadder
                        .map((p, idx) => ({ p, idx }))
                        .filter(item => tonicTriadPitches.includes(item.p));
                    const posInStable = stableList.findIndex(s => s.idx === currIdx);
                    const nextStablePos = Math.max(0, Math.min(stableList.length - 1, posInStable + direction));
                    if (stableList[nextStablePos]) {
                        currIdx = stableList[nextStablePos].idx;
                        stepsInSameDir++;
                    }
                }
            } else {
                // Уровни 3-10: поступенные проходящие движения + редкие контролируемые скачки
                const maxStepIndex = settings.difficulty === 3 ? 1 : (settings.difficulty <= 5 ? 2 : 3);
                const canLeap = (settings.difficulty >= 4) && (stepsSinceLeap >= 3) && (rng() < 0.25);

                if (rng() < 0.14 && i > 1) {
                    // Повтор звука
                } else if (canLeap) {
                    const leapSize = 2 + Math.floor(rng() * (maxStepIndex - 1));
                    const targetIdx = Math.max(0, Math.min(activeLadder.length - 1, currIdx + direction * leapSize));
                    currIdx = targetIdx;
                    direction = -direction;
                    stepsInSameDir = 0;
                    stepsSinceLeap = 0;
                } else {
                    if (stepsInSameDir >= 3 || currIdx + direction < 0 || currIdx + direction >= activeLadder.length) {
                        direction = -direction;
                        stepsInSameDir = 0;
                    }
                    const nextIdx = currIdx + direction;
                    if (nextIdx >= 0 && nextIdx < activeLadder.length) {
                        currIdx = nextIdx;
                        stepsInSameDir++;
                        stepsSinceLeap++;
                    }
                }
            }

            melodyNotes.push({
                pitch: activeLadder[currIdx],
                start: rSlot.start,
                duration: rSlot.duration,
                dotted: rSlot.dotted,
                velocity: rSlot.isStrongBeat ? 95 : 80
            });
        }

        const voiceLines = [melodyNotes];
        const allNotes = [...melodyNotes];

        // 3. ПОЛИФОНИЯ С ИМИТАЦИЕЙ, ПАУЗАМИ И НЕСПЕШНЫМ БАСОМ (для 2–4 голосов)
        if (settings.voicesCount > 1) {
            const lastTopNote = melodyNotes[melodyNotes.length - 1];
            const finalMeasureStart = lastTopNote.start; // Сильная доля заключительного такта
            const finalNoteDuration = lastTopNote.duration; // Целая длительность (slotsPerMeasure)

            // Извлекаем начальную тему (мотив из 3-4 нот сопрано) для полифонической имитации
            const sopranoTheme = melodyNotes.slice(0, Math.min(4, melodyNotes.length - 1));

            for (let v = 1; v < settings.voicesCount; v++) {
                const isBassVoice = (v === settings.voicesCount - 1);
                const polyNotes = [];

                // Смещение регистра: бас на 1–2 октавы ниже, средние голоса — в среднем регистре
                const octaveShift = isBassVoice ? -12 : (v === 1 ? -12 : -12);
                const voiceTonicMidi = Math.max(minMidi, baseTonicMidi + octaveShift);

                // Строим ладовый звукоряд в регистре текущего голоса
                const voiceScale = [];
                for (let p = voiceTonicMidi - 5; p <= voiceTonicMidi + 12; p++) {
                    if (p < minMidi || p > maxMidi) continue;
                    const rel = ((p - baseTonicMidi) % 12 + 12) % 12;
                    if (scaleIntervals.includes(rel)) voiceScale.push(p);
                }
                voiceScale.sort((a, b) => a - b);

                // Пул длительностей голоса:
                // Бас всегда неспешный (1/1 и 1/2, даже если в настройках выбраны только 1/8 и 1/16)
                const voiceDurations = isBassVoice
                    ? [slotsPerMeasure, Math.max(4, Math.floor(slotsPerMeasure / 2))]
                    : [Math.max(4, Math.floor(slotsPerMeasure / 2)), slotsPerBeat];

                // Имитационное вступление:
                // Голос может вступить сразу с первой доли или после небольшой имитационной паузы (1–2 доли)
                let vSlot = (v === 1 && finalMeasureStart >= slotsPerMeasure * 2) ? slotsPerBeat : 0;
                let vPrevPitch = voiceTonicMidi;

                // Шаг 3.1: Проводим имитацию темы сопрано в начале или во второй фразе голоса
                const imitationStartSlot = isBassVoice ? slotsPerMeasure : vSlot;
                const imitationNotes = [];
                let imCursor = imitationStartSlot;

                // В басу имитация идёт в ритмическом увеличении (более крупными длительностями), в средних голосах — в квинту/октаву
                const imIntervalShift = isBassVoice ? -12 : -5;
                sopranoTheme.forEach((tNote, idx) => {
                    if (imCursor >= finalMeasureStart) return;
                    const posInM = imCursor % slotsPerMeasure;
                    const remInM = slotsPerMeasure - posInM;

                    let imDur = isBassVoice
                        ? Math.min(remInM, Math.max(4, Math.floor(slotsPerMeasure / 2)))
                        : Math.min(remInM, tNote.duration);

                    if (imCursor + imDur > finalMeasureStart) {
                        imDur = finalMeasureStart - imCursor;
                    }
                    if (imDur <= 0) return;

                    const rawTarget = tNote.pitch + imIntervalShift;
                    const snapped = voiceScale.reduce((best, p) =>
                        Math.abs(p - rawTarget) < Math.abs(best - rawTarget) ? p : best
                    , voiceScale[0] || voiceTonicMidi);

                    imitationNotes.push({
                        pitch: snapped,
                        start: imCursor,
                        duration: imDur,
                        dotted: false,
                        velocity: isBassVoice ? 85 : 76
                    });
                    imCursor += imDur;
                });

                // Шаг 3.2: Заполняем движение голоса до финального такта с паузами между фразами и запретом синкоп
                while (vSlot < finalMeasureStart) {
                    // Если достигли точки имитации — вставляем имитационный мотив и переводим курсор
                    if (imitationNotes.length > 0 && vSlot <= imitationStartSlot && vSlot + slotsPerBeat >= imitationStartSlot) {
                        imitationNotes.forEach(imN => {
                            polyNotes.push(imN);
                            allNotes.push(imN);
                            vPrevPitch = imN.pitch;
                        });
                        vSlot = imCursor;
                        imitationNotes.length = 0;

                        // После проведения имитации добавляем дыхательную паузу (цезуру)
                        const posAfterIm = vSlot % slotsPerMeasure;
                        if (posAfterIm > 0 && vSlot + (slotsPerMeasure - posAfterIm) <= finalMeasureStart) {
                            vSlot += (slotsPerMeasure - posAfterIm);
                        }
                        continue;
                    }

                    const posInMeasure = vSlot % slotsPerMeasure;
                    const remInMeasure = slotsPerMeasure - posInMeasure;
                    const remToFinal = finalMeasureStart - vSlot;
                    const maxAllowed = Math.min(remInMeasure, remToFinal);

                    // Если остаток до имитации мал — делаем паузу перед вступлением имитации
                    if (imitationNotes.length > 0 && vSlot < imitationStartSlot && (imitationStartSlot - vSlot) < 4) {
                        vSlot = imitationStartSlot;
                        continue;
                    }

                    const activeTop = melodyNotes.find(m => vSlot >= m.start && vSlot < m.start + m.duration) || melodyNotes[0];

                    // Выбор длительности без синкоп (на сильной доле >= следующей)
                    let validDurs = voiceDurations.filter(d => d <= maxAllowed);
                    if (validDurs.length === 0) validDurs = [maxAllowed];

                    if (posInMeasure !== 0 && polyNotes.length > 0) {
                        const prevNote = polyNotes[polyNotes.length - 1];
                        const nonSync = validDurs.filter(d => d <= prevNote.duration);
                        if (nonSync.length > 0) validDurs = nonSync;
                    }

                    const chosenDur = randItem(validDurs);

                    // Подбор высоты: консонанс к сопрано с плавным голосоведением
                    const consonantIntervals = [0, 3, 4, 7, 8, 9];
                    const candidates = voiceScale.filter(p => {
                        if (p >= activeTop.pitch - 2) return false;
                        const relToTop = ((activeTop.pitch - p) % 12 + 12) % 12;
                        return consonantIntervals.includes(relToTop);
                    });

                    let chosenPitch = vPrevPitch;
                    if (vSlot === 0) {
                        // В начале диктанта бас берёт тонику, средний голос — терцию или квинту
                        chosenPitch = isBassVoice
                            ? voiceTonicMidi
                            : (candidates.find(p => Math.abs(p - voiceTonicMidi) <= 7) || voiceTonicMidi);
                    } else if (candidates.length > 0) {
                        const smooth = candidates.filter(p => Math.abs(p - vPrevPitch) <= 5);
                        const pool = smooth.length > 0 ? smooth : candidates;
                        chosenPitch = pool.reduce((best, p) =>
                            Math.abs(p - vPrevPitch) < Math.abs(best - vPrevPitch) ? p : best
                        , pool[0]);
                    }

                    // Избегаем дублирования одинаковой высоты с другими голосами в этой точке
                    const occupied = allNotes.filter(n => n.start === vSlot).map(n => n.pitch);
                    if (occupied.includes(chosenPitch) && voiceScale.length > 0) {
                        const alt = voiceScale.find(p => !occupied.includes(p) && p < activeTop.pitch - 2);
                        if (alt !== undefined) chosenPitch = alt;
                    }

                    const noteObj = {
                        pitch: chosenPitch,
                        start: vSlot,
                        duration: chosenDur,
                        dotted: false,
                        velocity: isBassVoice ? 84 : 76
                    };

                    polyNotes.push(noteObj);
                    allNotes.push(noteObj);
                    vPrevPitch = chosenPitch;
                    vSlot += chosenDur;
                }

                // Шаг 3.3: ФИНАЛЬНАЯ НОТА ГОЛОСА
                // Строго на сильную долю заключительного такта (finalMeasureStart), длительность 1/1 (finalNoteDuration).
                // Самый нижний (басовый) голос ВСЕГДА разрешается строго в основной тон выбранного лада!
                let finalVoicePitch = voiceTonicMidi;
                if (!isBassVoice) {
                    // Средние голоса разрешаются в устойчивую ступень трезвучия (I, III или V), не совпадающую с сопрано и басом
                    const occupiedFinal = allNotes.filter(n => n.start === finalMeasureStart).map(n => n.pitch);
                    const stableVoiceCands = voiceScale.filter(p => {
                        const rel = ((p - baseTonicMidi) % 12 + 12) % 12;
                        const isTriad = (rel === 0 || rel === 3 || rel === 4 || rel === 7);
                        return isTriad && !occupiedFinal.includes(p) && p < lastTopNote.pitch;
                    });
                    if (stableVoiceCands.length > 0) {
                        finalVoicePitch = stableVoiceCands.reduce((best, p) =>
                            Math.abs(p - vPrevPitch) < Math.abs(best - vPrevPitch) ? p : best
                        , stableVoiceCands[0]);
                    }
                } else {
                    // Нижний (басовый) голос — строго основной тон выбранного лада (I ступень)
                    finalVoicePitch = voiceTonicMidi;
                }

                const finalPolyNote = {
                    pitch: finalVoicePitch,
                    start: finalMeasureStart,
                    duration: finalNoteDuration,
                    dotted: false,
                    velocity: isBassVoice ? 90 : 80
                };

                polyNotes.push(finalPolyNote);
                allNotes.push(finalPolyNote);

                if (polyNotes.length > 0) {
                    voiceLines.push(polyNotes);
                }
            }
        }

        return { allNotes, voiceLines };
    }

    /**
     * Перехватчик отрисовки в редакторе:
     * полностью скрывает ноты второго голоса "Проверить ответ" в рабочей области,
     * пока ученик работает с первым голосом "Запиши по слуху".
     */
    installHiddenAnswerHook(editor) {
        if (!editor || this._renderHookInstalled) return;
        this._renderHookInstalled = true;

        const originalRenderNotes = editor.renderNotes.bind(editor);
        editor.renderNotes = () => {
            if (this.isDictationMode && !this.isChecked && editor.activeTrack !== 'dict_answer') {
                const savedAnswer = editor.tracks['dict_answer'];
                editor.tracks['dict_answer'] = [];
                try {
                    originalRenderNotes();
                } finally {
                    editor.tracks['dict_answer'] = savedAnswer;
                }
                return;
            }
            originalRenderNotes();
        };
    }

    /**
     * Инициализация чистого листа диктанта при загрузке новой вкладки (?dictation=1&...)
     */
    initDictationPageIfNeeded(editor) {
        const settings = this.parseSettingsFromUrl();
        if (!settings) return false;

        this.isDictationMode = true;
        this.isChecked = false;
        this.noteCheckResults.clear();

        this.installHiddenAnswerHook(editor);

        const generated = this.generateDictationVoices(settings);

        this.sessionData = {
            settings,
            answerNotes: generated.allNotes,
            voiceLines: generated.voiceLines
        };

        const timeSigSelect = document.getElementById('select-time-sig');
        if (timeSigSelect && settings.timeSig) {
            timeSigSelect.value = settings.timeSig;
        }

        const titleInput = document.getElementById('track-title-input');
        if (titleInput) {
            titleInput.value = `Музыкальный диктант (Уровень ${settings.difficulty})`;
        }

        editor.instrumentTypes = {
            'dict_student': { name: 'Запиши по слуху', color: 0x4A90E2, volume: 100, muted: false },
            'dict_answer':  { name: 'Проверить ответ', color: 0x2ECC71, volume: 100, muted: false }
        };

        const initialStudentNotes = [];
        if (settings.showFirstNote && generated.voiceLines.length > 0) {
            generated.voiceLines.forEach(line => {
                if (line.length > 0) {
                    initialStudentNotes.push({ ...line[0] });
                }
            });
        }

        editor.tracks = {
            'dict_student': initialStudentNotes,
            'dict_answer': generated.allNotes
        };

        editor.groups = [];
        editor.activeTrack = 'dict_student';

        editor.renderInitialInstruments();
        editor.updateGrid();
        editor.renderNotes();

        return true;
    }

    /**
     * Обработчик выбора трека. При нажатии на "Проверить ответ" делает видимым эталон,
     * группирует мелодические линии голосов и запускает проверку.
     */
    onTrackSelected(trackId, editor) {
        if (!this.isDictationMode) return;

        if (trackId === 'dict_answer' && !this.isChecked) {
            this.evaluateAnswer(editor);
        }
    }

    /**
     * Строгая проверка ответа (совпадение высоты, тактовой позиции start и длительности duration),
     * группировка мелодических линий и отрисовка окна результатов.
     */
    evaluateAnswer(editor) {
        this.isChecked = true;
        this.noteCheckResults.clear();

        const studentNotes = editor.tracks['dict_student'] || [];
        const answerNotes = editor.tracks['dict_answer'] || [];

        const matchedAnswerIndices = new Set();
        let correctCount = 0;

        studentNotes.forEach(sNote => {
            const matchIdx = answerNotes.findIndex((aNote, idx) =>
                !matchedAnswerIndices.has(idx) &&
                aNote.pitch === sNote.pitch &&
                aNote.start === sNote.start &&
                aNote.duration === sNote.duration
            );

            if (matchIdx !== -1) {
                matchedAnswerIndices.add(matchIdx);
                this.noteCheckResults.set(sNote, 'correct');
                correctCount++;
            } else {
                this.noteCheckResults.set(sNote, 'wrong');
            }
        });

        answerNotes.forEach((aNote, idx) => {
            if (matchedAnswerIndices.has(idx)) {
                this.noteCheckResults.set(aNote, 'correct');
            } else {
                this.noteCheckResults.set(aNote, 'wrong');
            }
        });

        const voiceLines = this.sessionData?.voiceLines || [];
        const voiceNames = ['Голос 1 (Мелодия)', 'Голос 2', 'Голос 3', 'Голос 4'];
        const voiceColors = [0x4A90E2, 0x9B59B6, 0xE67E22, 0x1ABC9C];

        editor.groups = [];
        voiceLines.forEach((lineNotes, vIdx) => {
            if (!lineNotes || lineNotes.length === 0) return;

            const newGroup = {
                id: `dict_voice_group_${vIdx + 1}_${Date.now()}`,
                name: voiceNames[vIdx] || `Голос ${vIdx + 1}`,
                notes: lineNotes,
                color: voiceColors[vIdx % voiceColors.length],
                analysisRoot: this.sessionData.settings.root,
                analysisScale: this.sessionData.settings.scaleKey,
                analysisEnabled: false
            };

            editor.groups.push(newGroup);
            if (typeof editor.revealGroupUI === 'function') {
                editor.revealGroupUI(newGroup.id, 4500);
            }
        });

        const totalBasis = Math.max(answerNotes.length, studentNotes.length, 1);
        const correctPercent = Math.round((correctCount / totalBasis) * 100);
        const wrongPercent = Math.max(0, 100 - correctPercent);

        let studentId = 'guest';
        let studentName = 'Гость';
        if (typeof userService !== 'undefined' && userService && userService.currentUser) {
            studentId = userService.currentUser.id;
            studentName = userService.currentUser.name;
        } else {
            try {
                const saved = JSON.parse(localStorage.getItem('app_user'));
                if (saved) {
                    studentId = saved.id || 'guest';
                    studentName = saved.name || 'Гость';
                }
            } catch (e) {}
        }

        const difficulty = this.sessionData?.settings?.difficulty || 1;

        console.log('=== РЕЗУЛЬТАТ МУЗЫКАЛЬНОГО ДИКТАНТА ===', {
            studentId,
            studentName,
            difficultyLevel: difficulty,
            voicesCount: this.sessionData?.settings?.voicesCount || 1,
            correctPercent: `${correctPercent}%`,
            wrongPercent: `${wrongPercent}%`,
            correctNotes: correctCount,
            totalExpectedNotes: answerNotes.length
        });

        this.renderResultWidget(correctPercent, wrongPercent);
        editor.renderNotes();
    }

    /**
     * Всплывающее окно справа сверху с круговой диаграммой и кнопками "Повторить" и "Еще музыкальный диктант"
     */
    renderResultWidget(correctPercent, wrongPercent) {
        let widget = document.getElementById('dictation-result-widget');
        if (!widget) {
            widget = document.createElement('div');
            widget.id = 'dictation-result-widget';
            document.body.appendChild(widget);
        }

        const deg = Math.round((correctPercent / 100) * 360);

        widget.innerHTML = `
            <h4>Результат диктанта</h4>
            <div class="dict-pie-wrapper" style="background: conic-gradient(#2ECC71 0deg ${deg}deg, #E74C3C ${deg}deg 360deg);">
                <div class="dict-pie-inner">
                    <span>${correctPercent}%</span>
                </div>
            </div>
            <div class="dict-stats-legend">
                <span class="dict-stat-ok">✔ Верно: ${correctPercent}%</span>
                <span class="dict-stat-err">✖ Ошибки: ${wrongPercent}%</span>
            </div>
            <div class="dict-result-actions">
                <button type="button" id="btn-dictation-repeat" class="dict-btn-repeat">🔄 Повторить</button>
                <button type="button" id="btn-dictation-again" class="dict-btn-again">🎼 Еще музыкальный диктант</button>
            </div>
        `;

        document.getElementById('btn-dictation-repeat').onclick = () => {
            this.repeatDictationWithSameSettings();
        };

        document.getElementById('btn-dictation-again').onclick = () => {
            this.openSettingsModal();
        };
    }
}

window.dictationManager = new DictationManager();