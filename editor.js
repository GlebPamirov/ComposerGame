const DAW_CONFIG = {
    cellW: 10,        // 1/16 длительность = 10px
    cellH: 20,        // Высота одной ноты
	minCellW: 3,      // Минимальная ширина (максимальное отдаление)
    maxCellW: 40,     // Максимальная ширина (максимальное приближение)
	inCellH: 8,      // Минимальная высота ноты (px)
    maxCellH: 50,     // Максимальная высота ноты (px)
    baseNote: 12,     // C1
    numNotes: 84,     // 7 октав
    gridSize: 512,    // Всего 1/16 слотов в сетке
    keyWidth: 0
};

const INSTRUMENT_TYPES = {
    'piano': { name: 'Piano', color: 0x4A90E2 },
    //'flute': { name: 'Flute', color: 0x4CAF50 },
    //'cello': { name: 'Cello', color: 0xE33569 }
};

// Константы наименований нот для подписей в пианоролле
const NOTE_NAMES_LATIN = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTE_NAMES_RU = ['до', 'до#', 'ре', 'ре#', 'ми', 'фа', 'фа#', 'соль', 'соль#', 'ля', 'ля#', 'си'];

class PianoRoll {
    
	constructor() {
        this.config = DAW_CONFIG;
        this.instrumentTypes = INSTRUMENT_TYPES;

        this.tracks = {
            'piano': [],
        };
        this.activeTrack = 'piano';
        this.selectedDuration = 0.25;
        this.baseDuration = 0.25;
        this.hasDotted = false;
        this.instrumentCounter = 1;

        // ИНИЦИАЛИЗИРУЕМ ВСЕ СВОЙСТВА И СОСТОЯНИЯ
        //this.history = [];      // Стек для Undo
        // this.redoHistory = [];  // Стек для Redo
	
		this.notes = this.notes || [];
		this.groups = this.groups || [];
		this.history = [];
		this.historyIndex = -1;

		// Первичный снимок состояния (по желанию)
		this.saveState();
		
        this.selectedNotes = new Set();
        this.isSelecting = false;
        this.isMultiDragging = false;
        this.selectionStart = { x: 0, y: 0 };
        this.hasMovedSelection = false;

        this.isPlaying = false;
        this.isRecording = false;
        this.isMetronomeOn = false;
        this.currentStep = 0;

        this.resizingNote = null;
        this.dragStartData = null;
        this.resizeSide = null;
		
		this.harmonyManager = new HarmonyManager(this);

        // 2. ИНИЦИАЛИЗИРУЕМ МЕНЕДЖЕРЫ
        this.keyboardManager = new KeyboardManager(this);
        this.chordManager = new ChordManager(this);

        // 3. ТОЛЬКО ПОТОМ ВЫЗЫВАЕМ МЕТОДЫ ОТРИСОВКИ И НАСТРОЙКИ
        this.setupDragAndDrop();
        this.initApp();
        this.initAudio();
        this.renderInitialInstruments(); // Теперь selectTrack() пройдет без ошибок!
        this.setupListeners();
        this.updateGrid();
		
		// Автоматическое центрирование на Первой октаве (C4) при старте
        this.scrollToFirstOctave();
	
		this.noteLabelMode = 0; // Кнопка переключения подписей нот 0 = Выкл, 1 = Латиница (C4), 2 = Русские (до)
		this.initToolbarButtons();
		
		// подсказка ноты при наведении мыши
		this.hoverTimer = null;
		this.hoveredNote = null;
		this.tooltipEl = null;
		this.initHoverTooltip(); // Создаем DOM-элемент подсказки
		
		// Список групп для окна "Форма"
		this.groups = [];
		this.groupCounter = 0;
		
		// Контекстное меню и буфер обмена
		this.clipboard = null; // Для скопированных нот
		this.contextMenuEl = null;
		this.contextMenuTarget = null; // Данные о позиции/ноте при клике ПКМ

		this.harmonyAnalyzer = new HarmonyAnalyzer(this); // Анализ гармонии
			
		this.initContextMenu(); // инициализатор меню в конце конструктора
    }
	
	// Внутри класса PianoRoll:

	zoom(zoomIn, isVertical = false, mouseX = 0, mouseY = 0) {
		const container = document.getElementById('editor-container');
		if (!container) return;

		const scrollLeft = container.scrollLeft;
		const scrollTop = container.scrollTop;
		const pointX = scrollLeft + mouseX;
		const pointY = scrollTop + mouseY;

		const zoomFactor = zoomIn ? 1.15 : 0.85;

		if (isVertical) {
			const oldH = this.config.cellH;
			let newH = Math.round(oldH * zoomFactor);
			if (zoomIn && newH <= oldH) newH = oldH + 1;
			if (!zoomIn && newH >= oldH) newH = oldH - 1;

			// Защита от undefined: считываем конфиг с фоллбэком
			const minH = this.config.minCellH || 8;
			const maxH = this.config.maxCellH || 50;

			newH = Math.max(minH, Math.min(maxH, newH));
			if (oldH === newH) return;

			this.config.cellH = newH;

			// Изменяем размеры холста Canvas и PixiJS
			this.resizeCanvas();

			// Корректируем вертикальный скролл
			container.scrollTop = (pointY * (newH / oldH)) - mouseY;
		} else {
			const oldW = this.config.cellW;
			let newW = Math.round(oldW * zoomFactor);
			if (zoomIn && newW <= oldW) newW = oldW + 1;
			if (!zoomIn && newW >= oldW) newW = oldW - 1;

			const minW = this.config.minCellW || 3;
			const maxW = this.config.maxCellW || 40;

			newW = Math.max(minW, Math.min(maxW, newW));
			if (oldW === newW) return;

			this.config.cellW = newW;

			// Изменяем размеры холста Canvas и PixiJS
			this.resizeCanvas();

			// Корректируем горизонтальный скролл
			container.scrollLeft = (pointX * (newW / oldW)) - mouseX;
		}

		// Обновляем сетку и перерисовываем ноты
		this.updateGrid();
		this.renderNotes();
	}
    // Вспомогательный метод точного изменения размеров Canvas и PixiJS
    resizeCanvas() {
        const totalWidth = this.config.gridSize * this.config.cellW;
        const totalHeight = this.config.numNotes * this.config.cellH;

        if (this.app && this.app.renderer) {
            // Меняем внутренний рендер PixiJS
            this.app.renderer.resize(totalWidth, totalHeight);

            // Обязательно обновляем стили самого элемента <canvas>
            if (this.app.view) {
                this.app.view.style.width = `${totalWidth}px`;
                this.app.view.style.height = `${totalHeight}px`;
            }
        }
    }
	
	// Метод точного центрирования первой октавы (C4 = MIDI note 60)
    scrollToFirstOctave() {
        const container = document.getElementById('editor-container');
        if (!container) return;

        // Нота C4 = 60 MIDI. Считаем ее индекс сверху вниз:
        const c4NoteIndex = (this.config.baseNote + this.config.numNotes - 1) - 60;
        const c4PixelY = c4NoteIndex * this.config.cellH;

        // Позиционируем C4 ровно по центру видимой области контейнера
        const containerHeight = container.clientHeight;
        const targetScrollTop = c4PixelY - (containerHeight / 2) + (this.config.cellH / 2);

        container.scrollTop = Math.max(0, targetScrollTop);
    }
	
		// Первоначальный рендер существующих инструментов
	renderInitialInstruments() {
		const list = document.getElementById('instruments-list');
		if (list) list.innerHTML = '';

		Object.keys(this.instrumentTypes).forEach(id => {
			const inst = this.instrumentTypes[id];
			this.addInstrumentToUI(id, inst.name, inst.color);
		});

		this.selectTrack(this.activeTrack);
	}

	// Переключение активного трека
	selectTrack(id) {
		this.switchToSingleNoteMode();
		document.querySelectorAll('.inst-item').forEach(b => b.classList.remove('active'));
		
		const activeEl = document.querySelector(`.inst-item[data-type="${id}"]`);
		if (activeEl) activeEl.classList.add('active');

		this.activeTrack = id;
		this.selectedNotes.clear();

		// При переключении на любой голос/инструмент звук гармонии по умолчанию отключается
		if (this.harmonyManager) {
			this.harmonyManager.muteSoundOnTrackChange();
		}

		this.renderNotes();
	}

	// Метод создания прямоугольного карточки инструмента
	addInstrumentToUI(id, name, color) {
		const list = document.getElementById('instruments-list');
		if (!list) return;

		// Инициализируем громкость и состояние Mute в объекте инструмента
		const inst = this.instrumentTypes[id] || {};
		if (inst.volume === undefined) inst.volume = 100;
		if (inst.muted === undefined) inst.muted = false;

		const item = document.createElement('div');
		item.className = `inst-item ${inst.muted ? 'muted-track' : ''}`;
		item.dataset.type = id;
		item.draggable = true;

		const hexColorStr = '#' + (color || 0x4A90E2).toString(16).padStart(6, '0');
		const volIcon = (inst.muted || inst.volume === 0) ? '🔇' : '🔊';

		item.innerHTML = `
			<span class="inst-drag-handle" title="Перетащите для изменения порядка">⋮⋮</span>
			<span class="inst-name" title="Кликните для переименования">${name}</span>
			<button class="inst-vol-btn ${inst.muted ? 'muted' : ''}" title="ЛКМ: Вкл/Выкл звук | Колесико: Громкость (${inst.volume}%)">${volIcon}</button>
			<input type="color" class="inst-color-picker" value="${hexColorStr}" title="Изменить цвет">
		`;

		// 1. Выбор инструмента по клику на карточку
		item.onclick = (e) => {
			if (e.target.classList.contains('inst-color-picker') || 
				e.target.classList.contains('inst-name-input') ||
				e.target.classList.contains('inst-vol-btn')) {
				return;
			}
			this.selectTrack(id);
		};

		// 2. Управление громкостью и Mute (КЛИК и СКРОЛЛ)
		const volBtn = item.querySelector('.inst-vol-btn');

		// Клик ЛКМ — ВКЛ / ВЫКЛ (Mute)
		volBtn.onclick = (e) => {
			e.stopPropagation();
			inst.muted = !inst.muted;

			this.updateVolumeBtnUI(volBtn, item, inst);
			this.renderNotes(); // Перерисовываем для отражения состояния
		};

		// Прокрутка колесиком мыши / тачпадом — регулировка % громкости
		volBtn.onwheel = (e) => {
			e.preventDefault();
			e.stopPropagation();

			// Шаг 5% за щелчок колеса (вверх — плюс, вниз — минус)
			const delta = e.deltaY < 0 ? 5 : -5;
			inst.volume = Math.max(0, Math.min(100, inst.volume + delta));

			// Если при прокрутке вверх был Mute, автоматически включаем звук
			if (inst.volume > 0 && inst.muted && e.deltaY < 0) {
				inst.muted = false;
			}

			this.updateVolumeBtnUI(volBtn, item, inst);

			// Показываем плавающую подсказку с процентом
			this.showVelocityTooltip(`Громкость: ${inst.volume}%`, e.clientX, e.clientY);

			// Автоскрытие подсказки после завершения скролла
			clearTimeout(this.volTooltipTimer);
			this.volTooltipTimer = setTimeout(() => this.hideVelocityTooltip(), 800);
		};

		volBtn.onmouseleave = () => {
			this.hideVelocityTooltip();
		};

		// 3. Редактирование названия по клику на текст
		const nameSpan = item.querySelector('.inst-name');
		nameSpan.onclick = (e) => {
			e.stopPropagation();
			
			const currentName = nameSpan.innerText;
			const input = document.createElement('input');
			input.type = 'text';
			input.value = currentName;
			input.className = 'inst-name-input';

			nameSpan.replaceWith(input);
			input.focus();
			input.select();

			const saveName = () => {
				const newName = input.value.trim() || currentName;
				nameSpan.innerText = newName;
				if (this.instrumentTypes[id]) {
					this.instrumentTypes[id].name = newName;
				}
				input.replaceWith(nameSpan);
			};

			input.onblur = saveName;
			input.onkeydown = (evt) => {
				if (evt.key === 'Enter') saveName();
			};
		};

		// 4. Изменение цвета через палитру
		const colorPicker = item.querySelector('.inst-color-picker');
		colorPicker.oninput = (e) => {
			const newColorHex = parseInt(e.target.value.replace('#', ''), 16);
			if (this.instrumentTypes[id]) {
				this.instrumentTypes[id].color = newColorHex;
			}
			this.renderNotes();
		};

		// 5. События Drag and Drop для элемента
		item.ondragstart = (e) => {
			item.classList.add('dragging');
			e.dataTransfer.effectAllowed = 'move';
		};

		item.ondragend = () => {
			item.classList.remove('dragging');
		};

		list.appendChild(item);
		
		
		// Контекстное меню по клику ПКМ на карточку инструмента
		item.oncontextmenu = (e) => {
			e.preventDefault();
			e.stopPropagation();
			
			// Показываем меню инструмента
			this.showInstrumentContextMenu(e.clientX, e.clientY, id);
		};
	}

	// Вспомогательный метод обновления внешнего вида кнопки громкости
	updateVolumeBtnUI(volBtn, itemEl, inst) {
		const isMuted = inst.muted || inst.volume === 0;
		volBtn.textContent = isMuted ? '🔇' : '🔊';
		volBtn.classList.toggle('muted', isMuted);
		itemEl.classList.toggle('muted-track', inst.muted);
		volBtn.title = `ЛКМ: Вкл/Выкл звук | Колесико: Громкость (${inst.volume}%)`;
	}

	// Настройка контекста Drag and Drop для контейнера
	setupDragAndDrop() {
		const list = document.getElementById('instruments-list');
		if (!list) return;

		list.ondragover = (e) => {
			e.preventDefault();
			const draggingItem = list.querySelector('.dragging');
			if (!draggingItem) return;

			const siblings = [...list.querySelectorAll('.inst-item:not(.dragging)')];
			const nextSibling = siblings.find(sibling => {
				const box = sibling.getBoundingClientRect();
				return e.clientY <= box.top + box.height / 2;
			});

			if (nextSibling) {
				list.insertBefore(draggingItem, nextSibling);
			} else {
				list.appendChild(draggingItem);
			}
		};
	}

	// Получение списка треков в актуальном UI-порядке (для экспорта)
	getOrderedTracks() {
		const list = document.getElementById('instruments-list');
		if (!list) return Object.keys(this.tracks);

		const orderedIds = [];
		list.querySelectorAll('.inst-item').forEach(el => {
			const id = el.dataset.type;
			if (id && this.tracks[id]) {
				orderedIds.push(id);
			}
		});
		return orderedIds;
	}

	// Автоматический пересчет длины холста под количество тактов
	updateGridSize() {
        let maxEndSlot = 0;

        Object.keys(this.tracks).forEach(trackKey => {
            const notes = this.tracks[trackKey] || [];
            notes.forEach(note => {
                const endSlot = note.start + note.duration;
                if (endSlot > maxEndSlot) {
                    maxEndSlot = endSlot;
                }
            });
        });

        const timeSigVal = document.getElementById('select-time-sig')?.value || '4/4';
        const [beatsStr, beatTypeStr] = timeSigVal.split('/');
        const beats = parseInt(beatsStr) || 4;
        const beatType = parseInt(beatTypeStr) || 4;
        const slotsPerMeasure = beats * (16 / beatType);

        const requiredMeasures = Math.max(32, Math.ceil(maxEndSlot / slotsPerMeasure) + 8);
        const newGridSize = requiredMeasures * slotsPerMeasure;

        if (this.config.gridSize !== newGridSize) {
            this.config.gridSize = newGridSize;
            // Обновляем размер холста Canvas (НЕ трогая width у editor-container!)
            this.resizeCanvas();
        }

        this.updateGrid();
    }
	
    // Переключение в режим одной ноты через сброс или симуляцию клика
    switchToSingleNoteMode() {
        const singleBtn = document.querySelector('.chord-circle[data-chord="single"]') 
                       || document.querySelector('[data-chord="single"]')
                       || document.querySelector('[data-chord="1"]')
                       || Array.from(document.querySelectorAll('.chord-circle, .chord-btn, .tri-btn')).find(el => el.innerText.trim() === '1');

        if (singleBtn) {
            singleBtn.click();
        } else {
            document.querySelectorAll('.tri-btn, .chord-btn, .chord-circle, [data-chord], [data-triad]').forEach(b => {
                b.classList.remove('active');
            });

            if (this.chordManager) {
                this.chordManager.currentChord = 'single';
                this.chordManager.selectedChord = 'single';
                this.chordManager.selectedChordType = 'single';
                this.chordManager.chordType = 'single';
                if (typeof this.chordManager.setChord === 'function') {
                    this.chordManager.setChord('single');
                }
            }
        }
    }

    // Точное определение интервалов (в полутонах) для трезвучий, септаккордов и нонаккордов
    // Получение интервалов аккорда напрямую из ChordManager (chords.js)
    getChordIntervals(chordType) {
        if (this.chordManager && typeof this.chordManager.getIntervals === 'function') {
            return this.chordManager.getIntervals(chordType);
        }
        return [0, 4, 7];
    }
	// Построение аккордов вверх от всех выделенных нот с сохранением их индивидуальных длительностей
    applyChordToSelectedNotes(chordType) {
        if (!this.selectedNotes || this.selectedNotes.size === 0) return false;
        if (chordType === 'single' || chordType === '1') return false;

        const intervals = this.getChordIntervals(chordType);
        if (!intervals || intervals.length <= 1) return false;

        this.saveState();

        const maxPitch = this.config.baseNote + this.config.numNotes - 1;
        const currentTrack = this.tracks[this.activeTrack];
        const newSelectedNotes = new Set(this.selectedNotes);
        const previewPitches = [];

        this.selectedNotes.forEach(baseNote => {
            intervals.forEach(interval => {
                if (interval === 0) return; // Тоника уже существует

                const targetPitch = baseNote.pitch + interval;
                if (targetPitch <= maxPitch) {
                    const existing = currentTrack.find(n => n.pitch === targetPitch && n.start === baseNote.start);
                    if (!existing) {
                        const newNote = {
                            pitch: targetPitch,
                            start: baseNote.start,
                            duration: baseNote.duration, // Наследование индивидуальной длительности
                            dotted: baseNote.dotted || false
                        };
                        currentTrack.push(newNote);
                        newSelectedNotes.add(newNote);
                        previewPitches.push(targetPitch);
                    }
                }
            });
        });

        this.selectedNotes = newSelectedNotes;
        this.renderNotes();

        if (previewPitches.length > 0) {
            this.playChordPreviewByPitches(previewPitches.slice(0, 8));
        }

        return true;
    }

    initApp() {
        const container = document.getElementById('editor-container');
        if (!container) return;

        if (this.app) {
            this.app.destroy(true, { children: true });
            container.innerHTML = '';
        }

        const totalWidth = this.config.gridSize * this.config.cellW;
        const totalHeight = this.config.numNotes * this.config.cellH;

        this.app = new PIXI.Application({
            width: totalWidth,
            height: totalHeight,
            backgroundAlpha: 0,
            antialias: true,
			
			// подписи нот в пианоролле
			autoDensity: true,                              // Включаем корректную плотность пикселей
			resolution: Math.max(1, window.devicePixelRatio) // Использование разрешения экрана
        });

        const canvas = this.app.view;
        canvas.style.display = 'block';
        canvas.style.position = 'relative';
        canvas.style.zIndex = '1';
        canvas.style.pointerEvents = 'auto';
        canvas.style.width = `${totalWidth}px`;
        canvas.style.height = `${totalHeight}px`;

        container.appendChild(canvas);

        this.notesLayer = new PIXI.Container();
        this.measuresLayer = new PIXI.Container();
        this.selectionGraphics = new PIXI.Graphics();
        this.playhead = new PIXI.Graphics();

        this.app.stage.addChild(this.notesLayer, this.measuresLayer, this.selectionGraphics, this.playhead);
        this.updatePlayhead(0);
		
    }

	initAudio() {
		this.reverb = new Tone.Reverb({
			decay: 1.5,
			wet: 0.3
		}).toDestination();

		this.synth = new Tone.Sampler({
			urls: {
				A1: "A1.mp3",
				C3: "C3.mp3",
				C4: "C4.mp3",
				A4: "A4.mp3",
				C5: "C5.mp3",
				C6: "C6.mp3",
				A6: "A6.mp3"
			},
			baseUrl: "https://tonejs.github.io/audio/salamander/",
			onload: () => {
				console.log("Сэмплы рояля успешно загружены!");
			}
		}).connect(this.reverb);

		this.metronomeClick = new Tone.MembraneSynth().toDestination();
		Tone.Transport.bpm.value = 120;

		Tone.Transport.scheduleRepeat((time) => {
			const currentTicks = Tone.Transport.ticks;
			const ppq = Tone.Transport.PPQ;
			this.currentStep = Math.floor(currentTicks / (ppq / 4));

			const progress = this.currentStep * this.config.cellW;
			this.updatePlayhead(progress);

			if (this.isMetronomeOn && this.currentStep % 4 === 0) {
				const pitch = this.currentStep % 16 === 0 ? "C5" : "C4";
				this.metronomeClick.triggerAttackRelease(pitch, "32n", time);
			}

			Object.keys(this.tracks).forEach(trackKey => {
				// Если это трек гармонии и звук гармонии выключен — пропускаем
				if (trackKey === 'harmony' && this.harmonyManager && this.harmonyManager.isMuted) {
					return;
				}

				const trackInst = this.instrumentTypes[trackKey];
				
				// ПРОВЕРКА MUTE: если инструмент заглушен, пропускаем его проигрывание
				if (trackInst && trackInst.muted) {
					return;
				}

				// МНОЖИТЕЛЬ ГРОМКОСТИ: переводим % громкости трека в коэффициент от 0.0 до 1.0
				const trackVolumeFactor = trackInst ? (trackInst.volume ?? 100) / 100 : 1.0;

				this.tracks[trackKey].forEach(note => {
					if (note.start === this.currentStep) {
						const freq = Tone.Frequency(note.pitch, "midi").toNote();
						const durationSec = Tone.Transport.toSeconds("16n") * note.duration;
						
						// Итоговая сила атаки = (Velocity ноты) * (Громкость трека)
						const finalVel = ((note.velocity || 100) / 127) * trackVolumeFactor;
						
						this.synth.triggerAttackRelease(freq, durationSec, time, finalVel);
					}
				});
			});
		}, "16n");
	}
	
	playNotePreview(pitch, velocity = 100) {
		if (Tone.context.state !== 'running') Tone.start();
		const freq = Tone.Frequency(pitch, "midi").toFrequency();
		const normVel = Math.max(0.1, velocity / 127);
		this.synth.triggerAttackRelease(freq, "16n", undefined, normVel);
	}

    getSnapStepSlots() {
        if (this.baseDuration >= 0.25) {
            return 4;
        }
        return Math.max(1, Math.round(this.selectedDuration / 0.0625));
    }

    updateGrid() {
        const timeSigVal = document.getElementById('select-time-sig')?.value || '4/4';
        const [beatsStr, beatTypeStr] = timeSigVal.split('/');
        const beats = parseInt(beatsStr) || 4;
        const beatType = parseInt(beatTypeStr) || 4;

        const beatWidthPx = (16 / beatType) * this.config.cellW; 
        const measureWidthPx = beats * beatWidthPx; 

        const snapStepSlots = this.getSnapStepSlots();
        const snapPx = snapStepSlots * this.config.cellW;

        // ДИНАМИЧЕСКИЕ РАЗМЕРЫ ВЫСОТЫ НОТЫ И ОКТАВЫ ДЛЯ CSS-ФОНА
        const rowH = this.config.cellH;
        const octaveH = rowH * 12;

        const container = document.getElementById('editor-container');
        if (container) {
            container.style.backgroundSize = `
                ${measureWidthPx}px 100%,
                ${beatWidthPx}px 100%,
                ${snapPx}px 100%,
                100% ${rowH}px,
                100% ${octaveH}px
            `;
            container.style.backgroundAttachment = 'local';
        }

        this.renderMeasureNumbers();
    }


    renderMeasureNumbers() {
        if (!this.measuresLayer) return;
        this.measuresLayer.removeChildren();

        const timeSigVal = document.getElementById('select-time-sig')?.value || '4/4';
        const [beatsStr, beatTypeStr] = timeSigVal.split('/');
        const beats = parseInt(beatsStr) || 4;
        const beatType = parseInt(beatTypeStr) || 4;

        const slotsPerBeat = 16 / beatType;
        const beatsPerMeasure = beats * slotsPerBeat;
        const measureWidthPx = beatsPerMeasure * this.config.cellW;
        const totalMeasures = Math.ceil(this.config.gridSize / beatsPerMeasure);

        const bg = new PIXI.Graphics();
        bg.beginFill(0x1e1e1e, 0.85);
        bg.drawRect(0, 0, this.config.gridSize * this.config.cellW, 18);
        bg.endFill();
        this.measuresLayer.addChild(bg);

        const textStyle = new PIXI.TextStyle({
            fontSize: 10,
            fill: '#4A90E2',
            fontWeight: 'bold',
            fontFamily: 'Segoe UI, sans-serif'
        });

        for (let m = 0; m < totalMeasures; m++) {
            const txt = new PIXI.Text((m + 1).toString(), textStyle);
            txt.x = m * measureWidthPx + 4;
            txt.y = 2;
            this.measuresLayer.addChild(txt);
        }
    }

    updatePlayhead(x) {
        this.playhead.clear();
        this.playhead.lineStyle(2, 0xff0000, 1);
        this.playhead.moveTo(x, 0);
        this.playhead.lineTo(x, this.config.numNotes * this.config.cellH);
    }

    bindEvent(id, event, callback) {
        const el = document.getElementById(id);
        if (el) el.addEventListener(event, callback);
    }

    bindAll(selector, event, callback) {
        document.querySelectorAll(selector).forEach(el => {
            el.addEventListener(event, callback);
        });
    }

    setupListeners() {
        if (this.chordManager) {
            this.chordManager.initUI();
        }
		
        this.app.view.addEventListener('contextmenu', e => e.preventDefault());

        const container = document.getElementById('editor-container');
		if (container) {
			container.addEventListener('scroll', () => {
				this.clearHoverTooltip(); // Скрываем подсказку ноты при скролле
				if (this.measuresLayer) {
					this.measuresLayer.y = container.scrollTop;
				}
			});

			// ЕДИНЫЙ ОБРАБОТЧИК: Скроллинг + Масштабирование (Ctrl + Колесо / Тачпад)
			container.addEventListener('wheel', (e) => {
				e.preventDefault(); // Запрещаем стандартный скролл страницы браузера

				const rect = container.getBoundingClientRect();
				const mouseX = e.clientX - rect.left;
				const mouseY = e.clientY - rect.top;

				// 1. МАСШТАБИРОВАНИЕ (Ctrl + колесо мыши ИЛИ Gesture Pinch на тачпаде)
				if (e.ctrlKey) {
					const zoomIn = e.deltaY < 0;
					// Alt/Option дополнительно переключает на вертикальный зум
					const isVertical = e.altKey; 

					this.zoom(zoomIn, isVertical, mouseX, mouseY);
					return;
				}

				// 2. ОБЫЧНАЯ ПРОКРУТКА (Лифт вверх-вниз / влево-вправо)
				if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
					// Горизонтальный скролл (Shift + колесо или свайп влево-вправо)
					container.scrollLeft += e.deltaX || e.deltaY;
				} else {
					// Вертикальный скролл (Обычный свайп / колесико)
					container.scrollTop += e.deltaY;
				}
			}, { passive: false });
		}
		
		// Дополнительная поддержка жестов для Safari (macOS / iPad)
		let initialCellW = this.config.cellW;

		container.addEventListener('gesturestart', (e) => {
			e.preventDefault();
			initialCellW = this.config.cellW;
		});

		container.addEventListener('gesturechange', (e) => {
			e.preventDefault();
			const rect = container.getBoundingClientRect();
			const mouseX = e.clientX - rect.left;
			const mouseY = e.clientY - rect.top;

			const zoomIn = e.scale > 1;
			this.zoom(zoomIn, false, mouseX, mouseY);
		});

        // Автоматический перерасчет центра при изменении размеров окна браузера
        window.addEventListener('resize', () => {
            this.updateGridSize();
        });

        // Слушатель для кнопок аккордов
        document.querySelectorAll('.tri-btn, .chord-btn, .chord-circle, [data-chord], [data-triad]').forEach(btn => {
            btn.addEventListener('click', () => {
                const chordType = btn.dataset.chord || btn.dataset.triad || btn.dataset.type || btn.innerText.trim();
                if (this.selectedNotes && this.selectedNotes.size > 0) {
                    this.applyChordToSelectedNotes(chordType);
                }
            });
        });

        this.bindEvent('btn-play', 'click', async () => {
            await Tone.start();
            Tone.Transport.start();
            this.isPlaying = true;
            document.getElementById('btn-play')?.classList.add('active');
        });

        this.bindEvent('btn-stop', 'click', () => {
            Tone.Transport.stop();
            Tone.Transport.seconds = 0;
            this.currentStep = 0;
            this.updatePlayhead(0);
            this.isPlaying = false;
            document.getElementById('btn-play')?.classList.remove('active');
            document.getElementById('btn-record')?.classList.remove('active');
        });

        this.bindEvent('btn-to-start', 'click', () => {
            Tone.Transport.seconds = 0;
            this.currentStep = 0;
            this.updatePlayhead(0);
        });

        this.bindEvent('btn-record', 'click', (e) => {
            this.isRecording = !this.isRecording;
            e.currentTarget.classList.toggle('active', this.isRecording);
        });

        this.bindEvent('btn-step-next', 'click', () => {
            this.currentStep++;
            this.updatePlayhead(this.currentStep * this.config.cellW);
        });

        this.bindEvent('input-bpm', 'change', (e) => {
            const bpm = Math.max(20, Math.min(300, parseInt(e.target.value) || 120));
            Tone.Transport.bpm.value = bpm;
        });

        this.bindEvent('select-time-sig', 'change', () => {
            this.updateGrid();
        });

        this.bindEvent('btn-metronome', 'click', (e) => {
            this.isMetronomeOn = !this.isMetronomeOn;
            e.currentTarget.classList.toggle('active', this.isMetronomeOn);
        });

		this.bindEvent('btn-undo', 'click', () => {
			this.undo();
		});

		this.bindEvent('btn-redo', 'click', () => {
			this.redo();
		});

        // Смена длительности переключает на режим одиночной ноты
        document.querySelectorAll('.dur-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchToSingleNoteMode();

                document.querySelectorAll('.dur-btn').forEach(b => {
                    b.classList.remove('active');
                    if (b.dataset.baseText) b.innerText = b.dataset.baseText;
                });

                e.currentTarget.classList.add('active');
                this.baseDuration = parseFloat(e.currentTarget.dataset.dur);
                this.selectedDuration = this.baseDuration;
                this.hasDotted = false;
                
                this.updateGrid();
            });

            // Замените существующий btn.addEventListener('dblclick', ...) на этот код:
			btn.addEventListener('dblclick', (e) => {
				e.preventDefault();
				this.switchToSingleNoteMode();

				const target = e.currentTarget;

				if (!target.dataset.baseText) {
					target.dataset.baseText = target.innerText.replace('.', '');
				}

				// Если точка уже установлена — снимаем её и возвращаемся к исходной длительности
				if (this.hasDotted && this.baseDuration === parseFloat(target.dataset.dur)) {
					this.selectedDuration = this.baseDuration;
					this.hasDotted = false;
					target.innerText = target.dataset.baseText;
				} else {
					// Иначе включаем режим ноты с точкой
					document.querySelectorAll('.dur-btn').forEach(b => {
						b.classList.remove('active');
						if (b.dataset.baseText) b.innerText = b.dataset.baseText;
					});

					target.classList.add('active');
					this.baseDuration = parseFloat(target.dataset.dur);
					this.selectedDuration = this.baseDuration * 1.5;
					this.hasDotted = true;
					target.innerText = target.dataset.baseText + '.';
				}

				this.updateGrid();
			});
        });

        // Смена инструмента переключает на режим одиночной ноты
        this.bindAll('.inst-square', 'click', (e) => {
            this.switchToSingleNoteMode();
            document.querySelectorAll('.inst-square').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            this.activeTrack = e.currentTarget.dataset.type;
            this.selectedNotes.clear();
            this.renderNotes();
        });

        // Обработчик кнопки добавления нового инструмента
		this.bindEvent('add-inst-btn', 'click', () => {
			this.instrumentCounter++;
			const name = `Инструмент ${this.instrumentCounter}`;
			const id = 'inst_' + Date.now();
			
			// Выбор палитры по умолчанию для новых инструментов
			const defaultColors = [0x9B59B6, 0xE67E22, 0x1ABC9C, 0xE74C3C, 0x34495E, 0xF1C40F, 0x2ECC71];
			const color = defaultColors[(this.instrumentCounter - 1) % defaultColors.length];

			this.instrumentTypes[id] = { name: name, color: color };
			this.tracks[id] = [];

			this.addInstrumentToUI(id, name, color);
			this.selectTrack(id);
		});

        this.bindEvent('btn-export-xml', 'click', () => exportMusicXML(this));

        this.bindEvent('btn-import-xml', 'click', () => {
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = '.xml,.musicxml';
            
            fileInput.onchange = (e) => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (evt) => {
                        importMusicXML(evt.target.result, this);
                    };
                    reader.readAsText(file);
                }
            };

            fileInput.click();
        });

        // --- ОБРАБОТКА МЫШИ: КЛИКИ, ВЫДЕЛЕНИЕ И ГРУППОВОЙ ПЕРЕНОС ---
        this.app.view.onmousedown = async (e) => {
			
			const rect = this.app.view.getBoundingClientRect();
			const x = e.clientX - rect.left;
			const y = e.clientY - rect.top;

			// ПРОВЕРКА: Если клик пришелся на область плашки любой из групп — игнорируем клик по холсту
			const clickedOnBadge = this.groups.some(group => {
				const activeTrackNotes = this.tracks[this.activeTrack] || [];
				const validNotes = group.notes.filter(n => activeTrackNotes.includes(n));
				if (validNotes.length === 0) return false;

				const minStart = Math.min(...validNotes.map(n => n.start));
				const maxPitch = Math.max(...validNotes.map(n => n.pitch));

				const paddingX = 8;
				const paddingY = 6;
				const x1 = minStart * this.config.cellW - paddingX;
				const topNoteRowIndex = (this.config.numNotes - 1) - (maxPitch - this.config.baseNote);
				const y1 = topNoteRowIndex * this.config.cellH - paddingY;
				const badgeY = Math.max(2, y1 - 18 - 4);

				// Проверяем попадание в прямоугольник плашки (высота 18px)
				return x >= x1 && x <= x1 + 200 && y >= badgeY && y <= badgeY + 18;
			});

			if (clickedOnBadge) return; // Прерываем обработку клика по холсту
			
			if (e._badgeClicked) return; // Если кликнули по плашке — прерываем событие, чтобы НЕ ставилась нота и НЕ включалось выделение!
            
			await Tone.start();

            const timeSlot = Math.floor(x / this.config.cellW);
            const noteIndex = Math.floor(y / this.config.cellH);
            const pitch = this.config.baseNote + (this.config.numNotes - 1 - noteIndex);

            const activeNotes = this.tracks[this.activeTrack] || [];
            const foundNote = activeNotes.find(n =>
                n.pitch === pitch && timeSlot >= n.start && timeSlot < n.start + n.duration
            );
			
			this.clearHoverTooltip(); // Скрываем подсказку при клике

            if (e.button === 0) { // ЛКМ		
				if (foundNote) {
					if (!this.selectedNotes.has(foundNote)) {
						if (!e.shiftKey) this.selectedNotes.clear();
						this.selectedNotes.add(foundNote);
					} else if (e.shiftKey) {
						this.selectedNotes.delete(foundNote);
						this.renderNotes();
						return;
					}

					this.playNotePreview(foundNote.pitch, foundNote.velocity || 100);

					
					if (this.isVelocityMode) {  // --- РЕЖИМ VELOCITY ---
						this.isChangingVelocity = true;
						this.saveState();
						this.velocityStartData = {
							startY: e.clientY,
							notes: Array.from(this.selectedNotes).map(n => ({
								note: n,
								originalVel: n.velocity || 100
							}))
						};
						this.renderNotes();
						return;
					}

					const noteStartX = foundNote.start * this.config.cellW;
					const noteEndX = (foundNote.start + foundNote.duration) * this.config.cellW;

					const isRightEdge = x > noteEndX - 6;
					const isLeftEdge = x < noteStartX + 6;

					// ИЗМЕНЕНИЕ: Поддержка одиночного и ГРУППОВОГО изменения длины
					if (isRightEdge || isLeftEdge) {
						this.saveState();
						this.resizingNote = foundNote; // Флаг активности изменения размера
						this.resizeSide = isRightEdge ? 'right' : 'left';
						
						// Запоминаем исходные параметры всех выделенных нот
						this.resizeStartData = {
							startSlot: timeSlot,
							notes: Array.from(this.selectedNotes).map(n => ({
								note: n,
								originalStart: n.start,
								originalDuration: n.duration
							}))
						};
					} else {
						// Групповой перенос нот
						this.isMultiDragging = true;
						this.saveState();
						this.dragStartData = {
							slot: timeSlot,
							pitch: pitch,
							notes: Array.from(this.selectedNotes).map(n => ({
								note: n,
								originalStart: n.start,
								originalPitch: n.pitch
							}))
						};
					}
					this.renderNotes();
				} else {
					if (!e.shiftKey) {
						this.selectedNotes.clear();
						this.renderNotes();
					}
					this.isSelecting = true;
					this.hasMovedSelection = false;
					this.selectionStart = { x, y };
					this.selectionGraphics.clear();
				}
			} else if (e.button === 2) { // ПКМ — Вызов контекстного меню
				e.preventDefault();

				if (foundNote) {
					// Если нота ещё не выделена — выделяем только её
					if (!this.selectedNotes.has(foundNote)) {
						this.selectedNotes.clear();
						this.selectedNotes.add(foundNote);
						this.renderNotes();
					}
					// Вызываем меню ноты
					this.showContextMenu(e.clientX, e.clientY, 'note', { note: foundNote, slot: timeSlot, pitch: pitch });
				} else {
					// Вызываем меню пустой сетки (для вставки)
					this.showContextMenu(e.clientX, e.clientY, 'grid', { slot: timeSlot, pitch: pitch });
				}
			}
			
			// Удаление нот двойным кликлм ЛКМ вместо ПКМ
			if (e.detail === 2 && foundNote) { 
				this.saveState();

				if (this.selectedNotes.has(foundNote)) {
					this.selectedNotes.forEach(note => this.removeNoteObject(note));
					this.selectedNotes.clear();
				} else {
					this.removeNoteObject(foundNote);
				}

				this.renderNotes();
				return; // Завершаем выполнение, чтобы не включался перенос/изменение длины
			}
		};

        window.onmousemove = (e) => {
            const rect = this.app.view.getBoundingClientRect();
            const x = Math.max(0, e.clientX - rect.left);
            const y = Math.max(0, e.clientY - rect.top);

			if (this.isSelecting || this.isMultiDragging || this.resizingNote) {
				this.clearHoverTooltip();
				// 1. Рисование рамки выделения
				if (this.isSelecting) {
					const dx = Math.abs(x - this.selectionStart.x);
					const dy = Math.abs(y - this.selectionStart.y);
					if (dx > 3 || dy > 3) this.hasMovedSelection = true;

					const x1 = Math.min(this.selectionStart.x, x);
					const y1 = Math.min(this.selectionStart.y, y);
					const x2 = Math.max(this.selectionStart.x, x);
					const y2 = Math.max(this.selectionStart.y, y);

					this.selectionGraphics.clear();
					this.selectionGraphics.lineStyle(1, 0x4A90E2, 1);
					this.selectionGraphics.beginFill(0x4A90E2, 0.25);
					this.selectionGraphics.drawRect(x1, y1, x2 - x1, y2 - y1);
					this.selectionGraphics.endFill();

					const activeNotes = this.tracks[this.activeTrack] || [];
					activeNotes.forEach(n => {
						const nx = n.start * this.config.cellW;
						const ny = (this.config.numNotes - 1 - (n.pitch - this.config.baseNote)) * this.config.cellH;
						const nw = n.duration * this.config.cellW;
						const nh = this.config.cellH;

						const intersects = (nx < x2 && nx + nw > x1 && ny < y2 && ny + nh > y1);
						if (intersects) {
							this.selectedNotes.add(n);
						} else if (!e.shiftKey) {
							this.selectedNotes.delete(n);
						}
					});

					this.renderNotes();
					return;
				}

				// 2. Групповое перемещение выделенных нот
				if (this.isMultiDragging) {
					const currentTimeSlot = Math.floor(x / this.config.cellW);
					const currentPitch = this.config.baseNote + (this.config.numNotes - 1 - Math.floor(y / this.config.cellH));
					const snapStepSlots = this.getSnapStepSlots();

					const slotDiff = currentTimeSlot - this.dragStartData.slot;
					const pitchDiff = currentPitch - this.dragStartData.pitch;

					const snappedSlotDiff = Math.round(slotDiff / snapStepSlots) * snapStepSlots;

					let canMoveSlot = true;
					let canMovePitch = true;
					const maxPitch = this.config.baseNote + this.config.numNotes - 1;

					this.dragStartData.notes.forEach(item => {
						if (item.originalStart + snappedSlotDiff < 0) canMoveSlot = false;
						const targetPitch = item.originalPitch + pitchDiff;
						if (targetPitch < this.config.baseNote || targetPitch > maxPitch) canMovePitch = false;
					});

					let pitchChanged = false;
					this.dragStartData.notes.forEach(item => {
						if (canMoveSlot) {
							item.note.start = item.originalStart + snappedSlotDiff;
						}
						if (canMovePitch) {
							if (item.note.pitch !== item.originalPitch + pitchDiff) {
								pitchChanged = true;
							}
							item.note.pitch = item.originalPitch + pitchDiff;
						}
					});

					if (pitchChanged) {
						this.playNotePreview(currentPitch);
					}
					
					
					this.renderNotes();
					return;
				}

				// 3. Изменение длительности всех выделенных нот одновременно
				if (this.resizingNote && this.resizeStartData) {
					const currentTimeSlot = Math.floor(x / this.config.cellW);
					const snapStepSlots = this.getSnapStepSlots();

					const slotDiff = currentTimeSlot - this.resizeStartData.startSlot;
					const snappedDiff = Math.round(slotDiff / snapStepSlots) * snapStepSlots;

					if (this.resizeSide === 'right') {
						// Изменение длины СПРАВА
						// Проверяем, чтобы ни одна нота в группе не стала меньше 1 слота
						let canResize = true;
						this.resizeStartData.notes.forEach(item => {
							if (item.originalDuration + snappedDiff < 1) {
								canResize = false;
							}
						});

						if (canResize) {
							this.resizeStartData.notes.forEach(item => {
								item.note.duration = item.originalDuration + snappedDiff;
							});
						}
					} else if (this.resizeSide === 'left') {
						// Изменение длины СЛЕВА
						// Проверяем границы: старт >= 0 и длительность >= 1 слот
						let canResize = true;
						this.resizeStartData.notes.forEach(item => {
							const newStart = item.originalStart + snappedDiff;
							const newDuration = item.originalDuration - snappedDiff;
							if (newStart < 0 || newDuration < 1) {
								canResize = false;
							}
						});

						if (canResize) {
							this.resizeStartData.notes.forEach(item => {
								item.note.start = item.originalStart + snappedDiff;
								item.note.duration = item.originalDuration - snappedDiff;
							});
						}
					}

					this.renderNotes();
					return;
				}
			}

			// ЛОГИКА ТАЙМЕРА ДЛЯ ПОДСКАЗКИ
			const timeSlot = Math.floor(x / this.config.cellW);
			const noteIndex = Math.floor(y / this.config.cellH);
			const pitch = this.config.baseNote + (this.config.numNotes - 1 - noteIndex);

			const activeNotes = this.tracks[this.activeTrack] || [];
			const foundNote = activeNotes.find(n =>
				n.pitch === pitch && timeSlot >= n.start && timeSlot < n.start + n.duration
			);

			if (foundNote) {
				// Если мышь перешла на ДРУГУЮ ноту
				if (this.hoveredNote !== foundNote) {
					this.clearHoverTooltip();
					this.hoveredNote = foundNote;

					const cursorX = e.clientX;
					const cursorY = e.clientY;

					// Запускаем таймер на 1 секунду (1000 мс)
					this.hoverTimer = setTimeout(() => {
						this.showHoverTooltip(foundNote, cursorX, cursorY);
					}, 1000);
				}
			} else {
				// Мышь на пустой сетке
				this.clearHoverTooltip();
			}	
			
			// Изменение Velocity перетягиванием мыши вверх/вниз
			if (this.isChangingVelocity && this.velocityStartData) {
				const deltaY = this.velocityStartData.startY - e.clientY; // Вверх = плюс, Вниз = минус
				const velChange = Math.round(deltaY / 1); // Чувствительность: 1px = 1 единица velocity

				let lastVelPercent = 0;

				this.velocityStartData.notes.forEach(item => {
					const newVel = Math.max(1, Math.min(127, item.originalVel + velChange));
					item.note.velocity = newVel;
					lastVelPercent = Math.round((newVel / 127) * 100);
				});

				// Отображаем плавающую подсказку возле курсора
				this.showVelocityTooltip(`${lastVelPercent}%`, e.clientX, e.clientY);
				this.renderNotes();
				return;
			}
        };

        window.onmouseup = () => {
            if (this.isSelecting) {
                this.isSelecting = false;
                this.selectionGraphics.clear();

                if (!this.hasMovedSelection) {
                    const snapStepSlots = this.getSnapStepSlots();
                    const timeSlot = Math.floor(this.selectionStart.x / this.config.cellW);
                    const noteIndex = Math.floor(this.selectionStart.y / this.config.cellH);
                    const pitch = this.config.baseNote + (this.config.numNotes - 1 - noteIndex);
                    const snappedStart = Math.floor(timeSlot / snapStepSlots) * snapStepSlots;

                    this.saveState();
                    if (this.chordManager && typeof this.chordManager.addChord === 'function') {
                        this.chordManager.addChord(pitch, snappedStart);
                    } else {
                        this.addNote(pitch, snappedStart);
                    }
                }
            }
			
			if (this.isChangingVelocity) {
				this.isChangingVelocity = false;
				this.velocityStartData = null;
				this.hideVelocityTooltip();
			}

            this.isMultiDragging = false;
            this.resizingNote = null;
			this.resizeStartData = null; // Очищаем данные группового изменения размера
        };
    }


    saveState() {
		// Если мы сделали действие после ряда Undo, отсекаем "будущую" историю
		if (this.historyIndex < this.history.length - 1) {
			this.history = this.history.slice(0, this.historyIndex + 1);
		}

		// Сохраняем глубокую копию ВСЕХ треков и ВСЕХ групп
		const state = {
			tracks: JSON.parse(JSON.stringify(this.tracks || {})),
			groups: JSON.parse(JSON.stringify(this.groups || []))
		};

		this.history.push(state);
		this.historyIndex++;
	}

	undo() {
		if (this.historyIndex > 0) {
			this.historyIndex--;
			this.applyState(this.history[this.historyIndex]);
		}
	}

	redo() {
		if (this.historyIndex < this.history.length - 1) {
			this.historyIndex++;
			this.applyState(this.history[this.historyIndex]);
		}
	}

	// Применение состояния из истории
	applyState(state) {
		if (!state) return;

		// Восстанавливаем треки и группы глубокой копией
		this.tracks = JSON.parse(JSON.stringify(state.tracks || {}));
		this.groups = JSON.parse(JSON.stringify(state.groups || []));

		// Важно: восстанавливаем ссылки на объекты нот внутри групп,
		// чтобы group.notes содержал реальные объекты из this.tracks
		this.relinkGroupNotes();

		// Очищаем выделение и перерисовываем
		if (this.selectedNotes) {
			this.selectedNotes.clear();
		}

		this.renderNotes();
	}

	// Вспомогательный метод для восстановления связей нот и групп после JSON.parse
	relinkGroupNotes() {
		if (!this.groups || !this.tracks) return;

		// Все ноты всех треков в один массив для поиска
		const allCurrentNotes = Object.values(this.tracks).flat();

		this.groups.forEach(group => {
			if (!group.notes) return;
			
			// Связываем сохраненные ноты с восстановленными объектами в треках
			group.notes = group.notes.map(savedNote => {
				return allCurrentNotes.find(n => 
					n.pitch === savedNote.pitch && 
					n.start === savedNote.start && 
					n.duration === savedNote.duration
				) || savedNote;
			});
		});
	}

    addNote(pitch, start) {
		
		
        // 1. Расчет длительности слотов с учетом точки
        let durationSlots = Math.max(1, Math.round(this.selectedDuration / 0.0625));
        if (this.hasDotted) {
            durationSlots = Math.round(durationSlots * 1.5);
        }

        if (!this.tracks[this.activeTrack]) {
            this.tracks[this.activeTrack] = [];
        }

        const newNote = { 
            pitch, 
            start, 
            duration: durationSlots, 
            dotted: !!this.hasDotted,
            velocity: 70
        };
		
        // Сохраняем ноту на трек
        this.tracks[this.activeTrack].push(newNote);
		
		alert('Нота добавлена');
		
        // 2. Проверка и добавление ноты в группы
        if (this.groups && Array.isArray(this.groups)) {
			
            // Берём группы активного трека (или все группы, если trackIndex не используется)
            const activeGroups = this.groups.filter(g => 
                g.trackIndex === undefined || g.trackIndex === this.activeTrack
            );

            activeGroups.forEach(group => {
                if (!group.notes || group.notes.length === 0) return;

                // Находим границы группы напрямую из массива group.notes
                const minStart = Math.min(...group.notes.map(n => n.start));
                const maxEnd = Math.max(...group.notes.map(n => n.start + n.duration));
                const minPitch = Math.min(...group.notes.map(n => n.pitch));
                const maxPitch = Math.max(...group.notes.map(n => n.pitch));

                // --- ДОПУСКИ (TOLERANCE) ---
                // tMargin = допуск по времени (в слотах). 1 слот позволяет захватывать ноты встык
                // pMargin = допуск по высоте (в полутонах). 1 полутон захватывает соседние клавиши
                const tMargin = 1; 
                const pMargin = 1;

                const noteEnd = start + durationSlots;

                // Пересечение или примыкание по времени и высоте
                const isPitchClose = pitch >= (minPitch - pMargin) && pitch <= (maxPitch + pMargin);
                const isTimeClose = start <= (maxEnd + tMargin) && noteEnd >= (minStart - tMargin);

                if (isPitchClose && isTimeClose) {
                    if (!group.notes.includes(newNote)) {
                        group.notes.push(newNote);
                    }
                }
            });
        }

        this.renderNotes();
        this.playNotePreview(pitch, 100);
    }

    removeNote(pitch, start) {
        if (!this.tracks[this.activeTrack]) return;
        this.tracks[this.activeTrack] = this.tracks[this.activeTrack].filter(
            n => !(n.pitch === pitch && start >= n.start && start < n.start + n.duration)
        );
        this.renderNotes();
    }

    removeNoteObject(noteObj) {
        if (!this.tracks[this.activeTrack]) return;
        this.tracks[this.activeTrack] = this.tracks[this.activeTrack].filter(n => n !== noteObj);
    }

    playChordPreview(chord) {
        const chordPitches = {
            'A': ["A3", "C#4", "E4"],
            'A7': ["A3", "C#4", "E4", "G4"],
            'A9': ["A3", "C#4", "E4", "G4", "B4"]
        };
        const notes = chordPitches[chord] || ["A3", "C#4", "E4"];
        this.synth.triggerAttackRelease(notes, "0.5s");
    }

    renderNotes() {
		this.updateGridSize();
		this.notesLayer.removeChildren();

		const harmonyHighlightGraphics = new PIXI.Graphics();
		const bgGraphics = new PIXI.Graphics();
		const activeGraphics = new PIXI.Graphics();

		this.notesLayer.addChild(harmonyHighlightGraphics);
		this.notesLayer.addChild(bgGraphics);
		this.notesLayer.addChild(activeGraphics);

		const harmonyNotes = this.tracks['harmony'] || [];
		const chordBlocks = this.groupHarmonyNotesIntoChords(harmonyNotes);

		// 1. ПОДСВЕТКА И ПОДПИСИ АККОРДОВ
		if (chordBlocks.length > 0) {
			const totalHeight = this.config.numNotes * this.config.cellH;

			chordBlocks.forEach(chord => {
				const startX = chord.startSlot * this.config.cellW;
				const widthPx = chord.durationSlots * this.config.cellW;

				const overlayAlpha = this.harmonyManager && this.harmonyManager.isActive ? 0.15 : 0.06;
				harmonyHighlightGraphics.beginFill(0x4A90E2, overlayAlpha);
				harmonyHighlightGraphics.lineStyle(1, 0x4A90E2, 0.3);
				harmonyHighlightGraphics.drawRect(startX, 0, widthPx, totalHeight);
				harmonyHighlightGraphics.endFill();

				const rootName = NOTE_NAMES_LATIN[chord.root % 12];
				const labelText = new PIXI.Text(`${rootName} ${chord.type}`, {
					fontFamily: 'sans-serif',
					fontSize: 12,
					fontWeight: 'bold',
					fill: 0x4A90E2,
					align: 'left'
				});
				labelText.x = startX + 6;
				labelText.y = 6;
				this.notesLayer.addChild(labelText);
			});
		}

		if (this.harmonyManager) {
			this.harmonyManager.renderChordBoxes(chordBlocks);
		}
		
		
					
		
		

		// 2. Отрисовка неактивных треков
		Object.keys(this.tracks).forEach(trackKey => {
			if (trackKey === this.activeTrack) return;

			const trackConfig = this.instrumentTypes[trackKey] || { color: 0x777777 };
			const notes = this.tracks[trackKey] || [];

			notes.forEach(n => {
				const x = n.start * this.config.cellW;
				const y = (this.config.numNotes - 1 - (n.pitch - this.config.baseNote)) * this.config.cellH;
				const w = n.duration * this.config.cellW;

				bgGraphics.beginFill(trackConfig.color, 0.35);
				bgGraphics.lineStyle(1, trackConfig.color, 0.5);
				bgGraphics.drawRoundedRect(x + 1, y + 1, w - 2, this.config.cellH - 2, 3);
				bgGraphics.endFill();
			});
		});

		// 3. Отрисовка активного трека
		const activeTrackConfig = this.instrumentTypes[this.activeTrack] || { color: 0x4A90E2 };
		const activeNotes = this.tracks[this.activeTrack] || [];

		activeNotes.forEach(n => {
			const x = n.start * this.config.cellW;
			const y = (this.config.numNotes - 1 - (n.pitch - this.config.baseNote)) * this.config.cellH;
			const w = n.duration * this.config.cellW;

			const isSelected = this.selectedNotes && this.selectedNotes.has(n);
			const noteVel = n.velocity || 100;
			
			const parentGroup = this.groups ? this.groups.find(g => g.notes.includes(n)) : null;
			
			// --- ИСПРАВЛЕНИЕ 1: Инициализация и определение fillColor без TDZ и перезаписи ---
			let fillColor;
			if (parentGroup && parentGroup.analysisEnabled && this.harmonyAnalyzer) {
				fillColor = this.harmonyAnalyzer.getNoteColorInScale(
					n.pitch, 
					parentGroup.analysisRoot, 
					parentGroup.analysisScale
				);
			} else if (this.isVelocityMode) {
				fillColor = this.getVelocityColor(noteVel);
			} else if (isSelected) {
				fillColor = 0x72B0FF;
			} else {
				fillColor = activeTrackConfig.color;
			}

			if (this.harmonyManager && this.harmonyManager.isHighlightActive) {
				const isHarmonic = this.harmonyManager.isHarmonicAtSlot(n.pitch, n.start, chordBlocks);
				if (!isHarmonic) {
					fillColor = 0xE74C3C;
				}
			}

			const lineWidth = isSelected ? 2 : 1;
			const lineColor = 0xffffff;
			const lineAlpha = isSelected ? 1 : 0.8;

			activeGraphics.beginFill(fillColor, 1.0);
			activeGraphics.lineStyle(lineWidth, lineColor, lineAlpha);
			activeGraphics.drawRoundedRect(x + 1, y + 1, w - 2, this.config.cellH - 2, 3);
			activeGraphics.endFill();

			const labelStr = this.getNoteLabelText(n.pitch);
			if (labelStr) {
				const minNoteWidthToDraw = 16; 

				if (w >= minNoteWidthToDraw) {
					const fontSize = Math.max(9, Math.min(12, Math.floor(this.config.cellH * 0.55)));

					const pixiText = new PIXI.Text(labelStr, {
						fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif',
						fontSize: fontSize,
						fontWeight: '700',
						fill: 0xFFFFFF,
						stroke: 0x000000,
						strokeThickness: 2,
						lineJoin: 'round',
						align: 'left'
					});

					pixiText.resolution = Math.max(2, window.devicePixelRatio || 1);

					if (pixiText.width <= w - 4) {
						pixiText.x = Math.round(x + 4);
						pixiText.y = Math.round(y + (this.config.cellH - pixiText.height) / 2);

						this.notesLayer.addChild(pixiText);
					}
				}
			}
		});
		// --- ОТРИСОВКА ОБЛАК И РАМОК ДЛЯ ГРУПП НОТ ---
					if (this.groups && this.groups.length > 0) {
						const groupsGraphics = new PIXI.Graphics();
						this.notesLayer.addChild(groupsGraphics);

						// Габариты, размеры рамки-облака группы за пределами нот
						const paddingX = 2;
						const paddingY = 2;

						this.groups.forEach(group => {
							const activeTrackNotes = this.tracks[this.activeTrack] || [];
							const validNotes = group.notes.filter(n => activeTrackNotes.includes(n));

							if (validNotes.length === 0) return;

							const minStart = Math.min(...validNotes.map(n => n.start));
							const maxEnd = Math.max(...validNotes.map(n => n.start + n.duration));
							const minPitch = Math.min(...validNotes.map(n => n.pitch));
							const maxPitch = Math.max(...validNotes.map(n => n.pitch));

							const x1 = minStart * this.config.cellW - paddingX;
							const topNoteRowIndex = (this.config.numNotes - 1) - (maxPitch - this.config.baseNote);
							const y1 = topNoteRowIndex * this.config.cellH - paddingY;

							const w = (maxEnd - minStart) * this.config.cellW + (paddingX * 2);
							const h = (maxPitch - minPitch + 1) * this.config.cellH + (paddingY * 2);

							// 1. Полупрозрачное облако группы
							groupsGraphics.beginFill(group.color, 0.15);
							groupsGraphics.lineStyle(1.5, group.color, 0.6);
							groupsGraphics.drawRoundedRect(x1, y1, w, h, 10);
							groupsGraphics.endFill();

							// 2. Создаем контейнер для плашки с названием
							const badgeContainer = new PIXI.Container();
							badgeContainer.eventMode = 'static';
							badgeContainer.cursor = 'grab';

							const badgePaddingX = 6;
							const badgeHeight = 18;
							const badgeY = Math.max(2, y1 - badgeHeight - 4);

							const labelText = new PIXI.Text(group.name, {
								fontFamily: 'system-ui, -apple-system, sans-serif',
								fontSize: 10,
								fontWeight: '600',
								fill: 0xFFFFFF
							});
							labelText.resolution = Math.max(2, window.devicePixelRatio || 1);

							const badgeWidth = labelText.width + (badgePaddingX * 2);

							// Графика плашки
							const badgeBg = new PIXI.Graphics();
							badgeBg.beginFill(0x1E1E1E, 0.9);
							badgeBg.lineStyle(1, group.color, 0.8);
							badgeBg.drawRoundedRect(0, 0, badgeWidth, badgeHeight, 4);
							badgeBg.endFill();

							badgeContainer.addChild(badgeBg);

							labelText.x = badgePaddingX;
							labelText.y = (badgeHeight - labelText.height) / 2;
							badgeContainer.addChild(labelText);

							badgeContainer.x = x1;
							badgeContainer.y = badgeY;

							// --- ОБРАБОТКА ЗАЖАТИЯ И ПЕРЕМЕЩЕНИЯ ВСЕЙ ГРУППЫ ЗА НАЗВАНИЕ ---
							let lastClickTime = 0;
							badgeContainer.on('pointerdown', (e) => {
								e.stopPropagation();
								const origEvt = e.data.originalEvent;
								
								origEvt._badgeClicked = true; // ФЛАГ: сообщаем Canvas-холсту, что PixiJS уже обработал этот клик
								if (origEvt.button !== 0) return; // Регистрируем только ЛКМ

								// --- ПРОВЕРКА НА ДВОЙНОЙ КЛИК для переименования ---
								const now = Date.now();
								if (now - lastClickTime < 300) {
									lastClickTime = 0; // Сбрасываем таймер
									this.renameGroup(group, badgeContainer);
									return;
								}
								lastClickTime = now;
								
								// Автоматически выделяем все ноты группы
								this.selectedNotes = new Set(validNotes);

								// Рассчитываем стартовую позицию мыши в слотах сетки
								const rect = this.app.view.getBoundingClientRect();
								const mouseX = origEvt.clientX - rect.left;
								const mouseY = origEvt.clientY - rect.top;

								const timeSlot = Math.floor(mouseX / this.config.cellW);
								const noteIndex = Math.floor(mouseY / this.config.cellH);
								const pitch = this.config.baseNote + (this.config.numNotes - 1 - noteIndex);

								// Активируем режим перетаскивания группы
								this.isMultiDragging = true;
								this.saveState();
								
								this.dragStartData = {
									slot: timeSlot,
									pitch: pitch,
									notes: Array.from(this.selectedNotes).map(n => ({
										note: n,
										originalStart: n.start,
										originalPitch: n.pitch
									}))
								};
								this.selectedNotes.clear();
							});

							// --- ДВОЙНОЙ КЛИК: ИНЛАЙН-РЕДАКТИРОВАНИЕ НАЗВАНИЯ ---
							// --- ИСПРАВЛЕНИЕ 2: Вызов существующего метода renameGroup вместо renameGroupInline ---
							badgeContainer.on('dblclick', (e) => {
								e.stopPropagation();
								this.renameGroup(group, badgeContainer);
							});

							this.notesLayer.addChild(badgeContainer);
						});
					}
					
					// --- ВНУТРИ PianoRoll.renderNotes() В СЕКЦИИ ОТРИСОВКИ ГРУПП ---
					if (this.groups && this.groups.length > 0) {
						const container = document.getElementById('editor-container');
						let analysisBoxContainer = document.getElementById('group-analysis-boxes');
						if (!analysisBoxContainer) {
							analysisBoxContainer = document.createElement('div');
							analysisBoxContainer.id = 'group-analysis-boxes';
							analysisBoxContainer.className = 'group-analysis-boxes-layer';
							container.appendChild(analysisBoxContainer);
						}
						analysisBoxContainer.innerHTML = '';

						this.groups.forEach(group => {
							const activeTrackNotes = this.tracks[this.activeTrack] || [];
							const validNotes = group.notes.filter(n => activeTrackNotes.includes(n));
							if (validNotes.length === 0) return;

							// 1. Автоматический первично определяемый анализ при первом создании группы
							if (group.analysisRoot === undefined) {
								const detected = this.harmonyAnalyzer.analyzeHarmony(validNotes);
								group.analysisRoot = detected.root;
								group.analysisScale = detected.scaleKey;
								group.analysisEnabled = true;
							}

							// 2. Расчет границ области выделенной группы
							const minStart = Math.min(...validNotes.map(n => n.start));
							const minPitch = Math.min(...validNotes.map(n => n.pitch));
							const maxPitch = Math.max(...validNotes.map(n => n.pitch));

							const paddingX = 2;
							const paddingY = 4;
							
							// 1. Индекс строки для самой нижней ноты в выделении
							const bottomNoteRowIndex = (this.config.numNotes - 1) - (minPitch - this.config.baseNote);

							// 2. Левый край выделения (с учётом вылета рамки влево)
							
							const leftPx = (minStart * this.config.cellW) - paddingX + this.app.view.offsetLeft; // добавили примерно 245 px от левого меню

							// 3. Нижний край выделения (с учётом вылета рамки вниз)
							const topPx = (bottomNoteRowIndex + 1) * this.config.cellH + paddingY;

							// Создание HTML-карточки
							const boxEl = document.createElement('div');
							boxEl.className = 'group-harmony-analysis-card';
							boxEl.style.position = 'absolute';
							boxEl.style.left = `${Math.max(4, leftPx)}px`;
							boxEl.style.top = `${topPx}px`;

							// Монтируем прямо в container
							container.appendChild(boxEl);
							

							const rootOptions = NOTE_NAMES_LATIN.map((name, i) => 
								`<option value="${i}" ${i === group.analysisRoot ? 'selected' : ''}>${name}</option>`
							).join('');

							const scaleOptions = Object.keys(HARMONY_SCALES).map(key => 
								`<option value="${key}" ${key === group.analysisScale ? 'selected' : ''}>${HARMONY_SCALES[key].name}</option>`
							).join('');

							boxEl.innerHTML = `
								<!-- 
								<div class="group-harmony-header">
									<span class="group-harmony-title">🎼 Гармония группы</span>
								</div> 
								-->
								<div class="group-harmony-selects">
									<select class="group-root-select chord-styled-select">${rootOptions}</select>
									<select class="group-scale-select chord-styled-select">${scaleOptions}</select>
								</div>
							`;

							// Обработчики изменения Основного тона и Лада
							const rootSelect = boxEl.querySelector('.group-root-select');
							const scaleSelect = boxEl.querySelector('.group-scale-select');

							rootSelect.onchange = (e) => {
								group.analysisRoot = parseInt(e.target.value);
								this.renderNotes(); // Изменяет ТОЛЬКО цветовую индикацию нот группы
							};

							scaleSelect.onchange = (e) => {
								group.analysisScale = e.target.value;
								this.renderNotes(); // Изменяет ТОЛЬКО цветовую индикацию нот группы
							};

							analysisBoxContainer.appendChild(boxEl);
						});
					}
		
		
		
	}
	
	// Преобразование значения Velocity (1-127) в цвет от Синего к Красному
	getVelocityColor(velocity) {
		const v = Math.max(1, Math.min(127, velocity || 100));
		const ratio = (v - 1) / 126; // От 0.0 до 1.0
		
		let r, g, b;

		if (ratio < 0.5) {
			// Первая половина: От темно-синего к фиолетовому
			const subRatio = ratio * 2; // от 0.0 до 1.0
			r = Math.round(10 + (160 - 10) * subRatio);
			g = Math.round(20 + (20 - 20) * subRatio);
			b = Math.round(90 + (180 - 90) * subRatio);
		} else {
			// Вторая половина: От фиолетового к ярко-красному
			const subRatio = (ratio - 0.5) * 2; // от 0.0 до 1.0
			r = Math.round(160 + (255 - 160) * subRatio);
			g = Math.round(20 + (15 - 20) * subRatio);
			b = Math.round(180 + (15 - 180) * subRatio);
		}

		return (r << 16) | (g << 8) | b;
	}
	
	// Инициализация кнопки тулбара для переключения подписей нот
	initToolbarButtons() {
		// Подпись нот
		const labelBtn = document.getElementById('btn-note-labels');
		if (labelBtn) {
			labelBtn.onclick = () => this.cycleNoteLabelMode();
		}
		
		// Velocity mode
		const velBtn = document.getElementById('btn-velocity-mode');
		if (velBtn) {
			velBtn.onclick = () => {
				this.isVelocityMode = !this.isVelocityMode;
				velBtn.classList.toggle('active', this.isVelocityMode);
				this.renderNotes();
			};
		}
	}

	// Переключение режимов по кругу (0 -> 1 -> 2 -> 0)
	cycleNoteLabelMode() {
		this.noteLabelMode = (this.noteLabelMode + 1) % 3;
		const btn = document.getElementById('btn-note-labels');

		if (btn) {
			btn.classList.remove('active', 'mode-latin', 'mode-ru');

			switch (this.noteLabelMode) {
				case 0:
					btn.title = 'Подпись нот: Отключена';
					break;
				case 1:
					btn.classList.add('active', 'mode-latin');
					btn.title = 'Подпись нот: Латиница (C4)';
					break;
				case 2:
					btn.classList.add('active', 'mode-ru');
					btn.title = 'Подпись нот: Русский (до)';
					break;
			}
		}

		// Перерисовываем ноты с обновленными подписями
		this.renderNotes();
	}

	// Вспомогательный метод получения текста подписи для конкретной ноты
	getNoteLabelText(pitch) {
		if (this.noteLabelMode === 0) return '';

		const index = pitch % 12;

		if (this.noteLabelMode === 1) {
			// Режим 1: Латиница + Октава (например, C4)
			const octave = Math.floor(pitch / 12) - 1;
			return `${NOTE_NAMES_LATIN[index]}${octave}`;
		}

		if (this.noteLabelMode === 2) {
			// Режим 2: Русские названия без октавы (например, до, ре#)
			return NOTE_NAMES_RU[index];
		}

		return '';
	}

	// Вспомогательный метод группировки нот гармонии в блоки аккордов с ТОЧНЫМ определением типа
    groupHarmonyNotesIntoChords(harmonyNotes) {
        if (!harmonyNotes || harmonyNotes.length === 0) return [];

        const slotsMap = {};
        harmonyNotes.forEach(n => {
            if (!slotsMap[n.start]) slotsMap[n.start] = [];
            slotsMap[n.start].push(n);
        });

        const sortedStarts = Object.keys(slotsMap).map(Number).sort((a, b) => a - b);
        const chords = [];

        sortedStarts.forEach(start => {
            const notes = slotsMap[start];
            const minPitch = Math.min(...notes.map(n => n.pitch));
            const duration = Math.max(...notes.map(n => n.duration));

            // Получаем интервалы от тоники
            const intervals = notes
                .map(n => n.pitch - minPitch)
                .sort((a, b) => a - b);

            // Ищем совпадение по библиотеке CHORD_LIBRARY
            let matchedType = 'maj';
            if (this.chordManager && this.chordManager.chords) {
                const found = this.chordManager.chords.find(c => {
                    if (c.intervals.length !== intervals.length) return false;
                    return c.intervals.every((val, idx) => val === intervals[idx]);
                });
                if (found) matchedType = found.id;
            }

            chords.push({
                root: minPitch % 12,
                type: matchedType,
                startSlot: start,
                durationSlots: duration
            });
        });

        return chords;
    }
	
    playChordPreviewByPitches(pitches, duration = '2n') {
        if (!this.synth || !pitches || pitches.length === 0) return;

        try {
            const noteNames = pitches.map(p => Tone.Frequency(p, "midi").toNote());
            // Проигрываем аккорд с длительностью половинной ноты
            this.synth.triggerAttackRelease(noteNames, duration);
        } catch (err) {
            console.warn('Ошибка при предпрослушивании аккорда:', err);
        }
    }
	
	// Создание DOM-элемента тултипа для подсказки ноты
	initHoverTooltip() {
		let tooltip = document.getElementById('note-hover-tooltip');
		if (!tooltip) {
			tooltip = document.createElement('div');
			tooltip.id = 'note-hover-tooltip';
			tooltip.className = 'note-hover-tooltip';
			document.body.appendChild(tooltip);
		}
		this.tooltipEl = tooltip;
	}

	// Форматирование полного названия ноты: "C4 (до)"
	getNoteFullTitle(pitch) {
		const index = pitch % 12;
		const octave = Math.floor(pitch / 12) - 1;
		const latin = `${NOTE_NAMES_LATIN[index]}${octave}`;
		const ru = NOTE_NAMES_RU[index];
		return `${latin} (${ru})`;
	}

	// Отображение подсказки возле курсора
	showHoverTooltip(note, clientX, clientY) {
		if (!this.tooltipEl) return;

		this.tooltipEl.textContent = this.getNoteFullTitle(note.pitch);
		
		// Смещение подсказки на +12px от курсора
		this.tooltipEl.style.left = `${clientX + 12}px`;
		this.tooltipEl.style.top = `${clientY + 12}px`;
		this.tooltipEl.style.display = 'block';
	}

	// Сброс таймера и скрытие подсказки
	clearHoverTooltip() {
		if (this.hoverTimer) {
			clearTimeout(this.hoverTimer);
			this.hoverTimer = null;
		}
		this.hoveredNote = null;
		if (this.tooltipEl) {
			this.tooltipEl.style.display = 'none';
		}
	}
	
						// 1. Инициализация DOM-элемента контекстного меню и CSS стилей
						initContextMenu() {
							let menu = document.getElementById('piano-roll-context-menu');
							if (!menu) {
								menu = document.createElement('div');
								menu.id = 'piano-roll-context-menu';
								menu.className = 'piano-roll-context-menu';
								document.body.appendChild(menu);

								// Добавляем минимальные стили для красивого DAW-меню
								const style = document.createElement('style');
								style.textContent = `
									.piano-roll-context-menu {
										position: fixed;
										z-index: 10000;
										background: #252526;
										border: 1px solid #3c3c3c;
										border-radius: 6px;
										box-shadow: 0 4px 12px rgba(0,0,0,0.5);
										padding: 4px 0;
										min-width: 180px;
										display: none;
										font-family: system-ui, -apple-system, sans-serif;
										font-size: 13px;
										color: #cccccc;
									}
									.piano-roll-context-menu .menu-item {
										padding: 6px 14px;
										cursor: pointer;
										display: flex;
										justify-content: space-between;
										align-items: center;
										user-select: none;
									}
									.piano-roll-context-menu .menu-item:hover {
										background: #04395e;
										color: #ffffff;
									}
									.piano-roll-context-menu .menu-item.disabled {
										color: #666666;
										cursor: default;
									}
									.piano-roll-context-menu .menu-item.disabled:hover {
										background: transparent;
										color: #666666;
									}
									.piano-roll-context-menu .menu-divider {
										height: 1px;
										background: #3c3c3c;
										margin: 4px 0;
									}
									.piano-roll-context-menu .menu-badge {
										font-size: 10px;
										background: #3a3a3a;
										padding: 2px 5px;
										border-radius: 3px;
										color: #888888;
									}
								`;
								document.head.appendChild(style);
							}
							this.contextMenuEl = menu;

							// Скрываем меню при клике в любое другое место
							window.addEventListener('click', () => this.hideContextMenu());
							window.addEventListener('scroll', () => this.hideContextMenu(), true);
						}

						// 2. Отображение контекстного меню
						showContextMenu(x, y, mode, targetData) {
							this.contextMenuTarget = targetData;
							const menu = this.contextMenuEl;
							menu.innerHTML = '';

							const createItem = (text, onClick, isDisabled = false, badgeText = null) => {
								const item = document.createElement('div');
								item.className = `menu-item ${isDisabled ? 'disabled' : ''}`;
								
								let html = `<span>${text}</span>`;
								if (badgeText) {
									html += `<span class="menu-badge">${badgeText}</span>`;
								}
								item.innerHTML = html;

								if (!isDisabled) {
									item.onclick = (e) => {
										e.stopPropagation();
										onClick();
										this.hideContextMenu();
									};
								}
								return item;
							};

							const createDivider = () => {
								const divider = document.createElement('div');
								divider.className = 'menu-divider';
								return divider;
							};

							if (mode === 'note') {
								const count = this.selectedNotes.size;
								const noteLabel = count > 1 ? `(${count})` : '';

								// 1. Скопировать
								menu.appendChild(createItem(`Скопировать ${noteLabel}`, () => this.copySelectedNotes()));
								// 2. Дублировать
								menu.appendChild(createItem(`Дублировать ${noteLabel}`, () => this.duplicateSelectedNotes()));
								// 3. В новый голос
								menu.appendChild(createItem(`В новый голос ${noteLabel}`, () => this.moveSelectedNotesToNewTrack()));
								
								menu.appendChild(createDivider());

								// 4. Сгруппировать / Разгруппировать
								const isGrouped = this.areSelectedNotesGrouped();
								if (isGrouped) {
									menu.appendChild(createItem(`Разгруппировать`, () => this.ungroupSelectedNotes()));
								} else {
									menu.appendChild(createItem(`Сгруппировать`, () => this.groupSelectedNotes()));
								}
								// 5. Динамика (Заготовка)
								menu.appendChild(createItem(`Динамика...`, () => {}, true, 'Скоро'));
								// 6. Фигурация (Заготовка)
								menu.appendChild(createItem(`Фигурация...`, () => {}, true, 'Скоро'));
								// 7. Анализ (Заготовка)
								menu.appendChild(createItem(`Анализ гармонии`, () => {}, true, 'Скоро'));

								menu.appendChild(createDivider());

								// 8. Удалить
								menu.appendChild(createItem(`Удалить ${noteLabel}`, () => this.deleteSelectedNotes()));

							} else if (mode === 'grid') {
								// Меню клика по пустому полю
								const hasClipboard = this.clipboard && this.clipboard.length > 0;
								menu.appendChild(createItem(
									`Вставить ${hasClipboard ? `(${this.clipboard.length})` : ''}`, 
									() => this.pasteNotes(targetData.slot), 
									!hasClipboard
								));
							}

							// Позиционирование с защитой от выхода за края экрана
							menu.style.display = 'block';
							const menuWidth = menu.offsetWidth;
							const menuHeight = menu.offsetHeight;

							const posX = (x + menuWidth > window.innerWidth) ? x - menuWidth : x;
							const posY = (y + menuHeight > window.innerHeight) ? y - menuHeight : y;

							menu.style.left = `${posX}px`;
							menu.style.top = `${posY}px`;
						}

						// 3. Скрытие меню
						hideContextMenu() {
							if (this.contextMenuEl) {
								this.contextMenuEl.style.display = 'none';
							}
						}

						// --- ЛОГИКА ДЕЙСТВИЙ КОНТЕКСТНОГО МЕНЮ ---

						// Скопировать
						copySelectedNotes() {
							if (!this.selectedNotes || this.selectedNotes.size === 0) return;

							const notesArray = Array.from(this.selectedNotes);
							const minStart = Math.min(...notesArray.map(n => n.start));

							// Запоминаем ноты с относительным смещением от первой
							this.clipboard = notesArray.map(n => ({
								pitch: n.pitch,
								startOffset: n.start - minStart,
								duration: n.duration,
								dotted: n.dotted || false
							}));
						}

						// Вставить
						pasteNotes(targetSlot) {
							if (!this.clipboard || this.clipboard.length === 0) return;

							this.saveState();
							const currentTrack = this.tracks[this.activeTrack] || [];
							this.selectedNotes.clear();

							this.clipboard.forEach(item => {
								const newNote = {
									pitch: item.pitch, // Сохраняет оригинальную высоту
									start: targetSlot + item.startOffset, // Размещается начиная с указанного такта/слота
									duration: item.duration,
									dotted: item.dotted
								};
								currentTrack.push(newNote);
								this.selectedNotes.add(newNote);
							});

							this.renderNotes();
						}

						// Дублировать (создает копию сразу вслед за выделенными нотами)
						duplicateSelectedNotes() {
							if (!this.selectedNotes || this.selectedNotes.size === 0) return;

							this.saveState();
							const notesArray = Array.from(this.selectedNotes);
							const minStart = Math.min(...notesArray.map(n => n.start));
							const maxEnd = Math.max(...notesArray.map(n => n.start + n.duration));
							const currentTrack = this.tracks[this.activeTrack] || [];

							const newSelection = new Set();

							notesArray.forEach(n => {
								const duplicatedNote = {
									pitch: n.pitch,
									start: maxEnd + (n.start - minStart),
									duration: n.duration,
									dotted: n.dotted || false
								};
								currentTrack.push(duplicatedNote);
								newSelection.add(duplicatedNote);
							});

							this.selectedNotes = newSelection;
							this.renderNotes();
						}

						// Перенести в новый голос (инструмент)
						moveSelectedNotesToNewTrack() {
							if (!this.selectedNotes || this.selectedNotes.size === 0) return;

							this.saveState();
							this.instrumentCounter++;

							const id = 'inst_' + Date.now();
							const name = `Голос ${this.instrumentCounter}`;
							const defaultColors = [0x9B59B6, 0xE67E22, 0x1ABC9C, 0xE74C3C, 0x34495E, 0xF1C40F, 0x2ECC71];
							const color = defaultColors[(this.instrumentCounter - 1) % defaultColors.length];

							// 1. Создаем карту соответствия (старая нота -> новая нота)
							const noteMap = new Map();
							const newTrackNotes = [];

							this.selectedNotes.forEach(oldNote => {
								const newNote = { ...oldNote }; // Клонируем объект ноты
								noteMap.set(oldNote, newNote);
								newTrackNotes.push(newNote);
							});

							// 2. Регистрируем новый трек
							this.instrumentTypes[id] = { name: name, color: color };
							this.tracks[id] = newTrackNotes;

							// 3. Удаляем перенесенные ноты из исходного трека
							const currentTrack = this.tracks[this.activeTrack] || [];
							this.tracks[this.activeTrack] = currentTrack.filter(n => !this.selectedNotes.has(n));

							// 4. ОБНОВЛЯЕМ ГРУППЫ: связываем перенесенные ноты с их новыми объектами
							if (this.groups && this.groups.length > 0) {
								this.groups.forEach(group => {
									group.notes = group.notes.map(groupNote => {
										// Если нота из группы была перенесена, обновляем ссылку
										return noteMap.get(groupNote) || groupNote;
									});
								});
							}

							// 5. Создаем плашку инструмента в UI и переключаемся на нее
							this.addInstrumentToUI(id, name, color);
							this.selectTrack(id);

							// 6. Оставляем ноты выделенными на новом треке для удобства
							this.selectedNotes = new Set(newTrackNotes);
							this.renderNotes();
						}

						// Удаление выделенных
						deleteSelectedNotes() {
							if (!this.selectedNotes || this.selectedNotes.size === 0) return;

							this.saveState();
							this.selectedNotes.forEach(note => this.removeNoteObject(note));
							this.selectedNotes.clear();
							this.renderNotes();
						}
						
						// Отображение контекстного меню карточки инструмента
						showInstrumentContextMenu(x, y, trackId) {
							const inst = this.instrumentTypes[trackId];
							if (!inst) return;

							const menu = this.contextMenuEl;
							menu.innerHTML = '';

							const createItem = (text, icon, onClick, isDisabled = false, badgeText = null, isDanger = false) => {
								const item = document.createElement('div');
								item.className = `menu-item ${isDisabled ? 'disabled' : ''} ${isDanger ? 'danger' : ''}`;
								
								let html = `<div><span class="menu-item-icon">${icon}</span><span>${text}</span></div>`;
								if (badgeText) {
									html += `<span class="menu-badge">${badgeText}</span>`;
								}
								item.innerHTML = html;

								if (!isDisabled) {
									item.onclick = (e) => {
										e.stopPropagation();
										onClick();
										this.hideContextMenu();
									};
								}
								return item;
							};

							const createDivider = () => {
								const divider = document.createElement('div');
								divider.className = 'menu-divider';
								return divider;
							};

							// 1. Копировать (Создает точную копию трека со всеми нотами)
							menu.appendChild(createItem('Копировать', '📋', () => this.duplicateTrack(trackId)));

							// 2. Эффекты (Заготовка)
							menu.appendChild(createItem('Эффекты (EQ, Reverb...)', '🎛️', () => {}, true, 'Скоро'));

							// 3. Тембр (Заготовка)
							menu.appendChild(createItem('Тембр', '🎹', () => {}, true, 'Скоро'));

							// 4. VST-плагин (Заготовка)
							menu.appendChild(createItem('VST-плагин', '🔌', () => {}, true, 'Скоро'));

							// 5. MIDI клавиатура (Заготовка)
							menu.appendChild(createItem('MIDI клавиатура', '⌨️', () => {}, true, 'Скоро'));

							menu.appendChild(createDivider());

							// 6. Удалить (С подтверждением)
							menu.appendChild(createItem('Удалить инструмент', '🗑️', () => this.deleteTrackWithConfirmation(trackId), false, null, true));

							// Позиционирование меню
							menu.style.display = 'block';
							const menuWidth = menu.offsetWidth;
							const menuHeight = menu.offsetHeight;

							const posX = (x + menuWidth > window.innerWidth) ? x - menuWidth : x;
							const posY = (y + menuHeight > window.innerHeight) ? y - menuHeight : y;

							menu.style.left = `${posX}px`;
							menu.style.top = `${posY}px`;
						}
						
			
			//
			// ГРУППИРОВКИ НОТ
			//			
			// 1. Создать новую группу из выделенных нот
			groupSelectedNotes() {
				if (!this.selectedNotes || this.selectedNotes.size === 0) return;

				this.saveState();
				this.groupCounter++;

				const newGroup = {
					id: 'group_' + Date.now(),
					name: `Группа нот # ${this.groupCounter}`,
					notes: Array.from(this.selectedNotes),
					color: 0x9B59B6 // Фиолетово-облачный оттенок по умолчанию
				};
				
				this.groups.push(newGroup);
				this.selectedNotes.clear();
				this.saveState(); 
				this.renderNotes();
			}

			// 2. Разгруппировать выделенные ноты
			ungroupSelectedNotes() {
				if (!this.selectedNotes || this.selectedNotes.size === 0) return;

				this.saveState();
				const selectedArr = Array.from(this.selectedNotes);

				// Удаляем из списка те группы, все ноты которых входят в текущее выделение
				this.groups = this.groups.filter(group => {
					const isEntireGroupSelected = group.notes.every(n => this.selectedNotes.has(n));
					return !isEntireGroupSelected;
				});
				
				this.renderNotes();
			}

			// 3. Быстрое переименование группы через клик по плашке
			// Инлайн-редактирование названия группы прямо на холсте
			renameGroup(group, badgeContainer) {
				// Сбрасываем флаг перетаскивания, чтобы группа не сдвинулась
				this.isMultiDragging = false;

				// Получаем глобальные координаты плашки относительно экрана
				const rect = this.app.view.getBoundingClientRect();
				const globalPos = badgeContainer.getGlobalPosition();

				// Создаем HTML-инпут
				const input = document.createElement('input');
				input.type = 'text';
				input.value = group.name || 'Группа';

				// Используем fixed, чтобы позиция идеально совпадала вне зависимости от скролла
				Object.assign(input.style, {
					position: 'fixed',
					left: `${rect.left + globalPos.x}px`,
					top: `${rect.top + globalPos.y}px`,
					width: '130px',
					height: '22px',
					fontSize: '12px',
					fontFamily: 'sans-serif',
					fontWeight: 'bold',
					color: '#ffffff',
					background: '#2c2c2c',
					border: '1px solid #4a90e2',
					borderRadius: '3px',
					outline: 'none',
					padding: '0 6px',
					boxSizing: 'border-box',
					zIndex: '10000'
				});

				// Блокируем проход событий мыши от инпута к Canvas
				['mousedown', 'mouseup', 'click', 'pointerdown', 'pointerup'].forEach(evt => {
					input.addEventListener(evt, e => e.stopPropagation());
				});

				document.body.appendChild(input);

				// Небольшая задержка фокуса, чтобы событие mouseup второго клика не закрыло поле
				setTimeout(() => {
					input.focus();
					input.select();
				}, 50);

				let isFinished = false;

				const finishRename = () => {
					if (isFinished) return;
					isFinished = true;

					const newName = input.value.trim();
					if (newName && newName !== group.name) {
						group.name = newName;
						if (typeof this.saveState === 'function') {
							this.saveState();
						}
					}

					cleanup();
					this.renderNotes(); // Перерисовываем плашку с новым текстом
				};

				const cleanup = () => {
					if (input.parentNode) {
						input.parentNode.removeChild(input);
					}
				};

				// Сохранение по Enter, отмена по Escape
				input.addEventListener('keydown', (e) => {
					if (e.key === 'Enter') {
						finishRename();
					} else if (e.key === 'Escape') {
						isFinished = true;
						cleanup();
					}
				});

				// Сохранение при клике мимо инпута
				input.addEventListener('blur', () => {
					finishRename();
				});
			}
			// 4. Вспомогательный метод: проверка, входят ли все выделенные ноты в какую-либо группу
			areSelectedNotesGrouped() {
				if (!this.selectedNotes || this.selectedNotes.size === 0) return false;
				return this.groups.some(group => 
					group.notes.length === this.selectedNotes.size &&
					group.notes.every(n => this.selectedNotes.has(n))
				);
			}
			
	//Два небольших метода для показа и скрытия всплывающего процента:		
	showVelocityTooltip(text, clientX, clientY) {
		if (!this.tooltipEl) this.initHoverTooltip();
		this.tooltipEl.textContent = `Velocity: ${text}`;
		this.tooltipEl.style.left = `${clientX + 14}px`;
		this.tooltipEl.style.top = `${clientY + 14}px`;
		this.tooltipEl.style.display = 'block';
	}

	hideVelocityTooltip() {
		this.clearHoverTooltip();
	}
	
			// 1. Копирование инструмента со всеми нотами И ГРУППАМИ
			duplicateTrack(sourceTrackId) {
				const sourceInst = this.instrumentTypes[sourceTrackId];
				const sourceNotes = this.tracks[sourceTrackId] || [];

				if (!sourceInst) return;

				this.saveState();
				this.instrumentCounter++;

				const newId = 'inst_' + Date.now();
				const newName = `${sourceInst.name} (Копия)`;
				
				// Палитра для подбора цвета копии
				const defaultColors = [0x9B59B6, 0xE67E22, 0x1ABC9C, 0xE74C3C, 0x34495E, 0xF1C40F, 0x2ECC71];
				const newColor = defaultColors[(this.instrumentCounter - 1) % defaultColors.length];

				// 1. Клонируем ноты и создаем карту соответствия (старый объект ноты -> новый объект)
				const noteMap = new Map();
				const clonedNotes = sourceNotes.map(oldNote => {
					const newNote = { ...oldNote }; // Клонируем свойства ноты
					noteMap.set(oldNote, newNote);
					return newNote;
				});

				// 2. Копируем все группы, содержащие ноты из исходного трека
				if (this.groups && this.groups.length > 0) {
					const duplicatedGroups = [];

					this.groups.forEach(group => {
						// Отбираем из текущей группы только те ноты, которые принадлежат копируемому треку
						const clonedGroupNotes = group.notes
							.filter(oldNote => noteMap.has(oldNote))
							.map(oldNote => noteMap.get(oldNote));

						// Если в этой группе есть ноты из нашего трека — создаем для них новую группу
						if (clonedGroupNotes.length > 0) {
							duplicatedGroups.push({
								id: 'group_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
								name: `${group.name} (Копия)`,
								notes: clonedGroupNotes,
								color: group.color
							});
						}
					});

					// Добавляем скопированные группы в общий список
					this.groups.push(...duplicatedGroups);
				}

				// 3. Создаем настройки нового трека
				this.instrumentTypes[newId] = {
					name: newName,
					color: newColor,
					volume: sourceInst.volume ?? 100,
					muted: sourceInst.muted ?? false
				};

				this.tracks[newId] = clonedNotes;

				// 4. Отрисовываем карточку в UI и переключаемся на неё
				this.addInstrumentToUI(newId, newName, newColor);
				this.selectTrack(newId);
			}
			// 2. Безопасное удаление инструмента с подтверждением
			deleteTrackWithConfirmation(trackId) {
				const inst = this.instrumentTypes[trackId];
				if (!inst) return;

				// Защита: запрещаем удалять единственный оставшийся трек
				const trackKeys = Object.keys(this.tracks);
				if (trackKeys.length <= 1) {
					alert('Нельзя удалить единственный инструмент в проекте.');
					return;
				}

				const noteCount = (this.tracks[trackId] || []).length;
				const confirmMessage = noteCount > 0 
					? `Вы уверены, что хотите удалить "${inst.name}"?\nЭто действие нельзя отменить! В треке содержится нот: ${noteCount}.`
					: `Вы уверены, что хотите удалить "${inst.name}"?`;

				if (confirm(confirmMessage)) {
					this.saveState();

					// Удаляем из данных
					delete this.instrumentTypes[trackId];
					delete this.tracks[trackId];

					// Удаляем карточку из UI
					const itemEl = document.querySelector(`.inst-item[data-type="${trackId}"]`);
					if (itemEl) itemEl.remove();

					// Если удалили активный трек, переключаемся на первый доступный
					if (this.activeTrack === trackId) {
						const remainingTracks = Object.keys(this.tracks);
						this.selectTrack(remainingTracks[0]);
					} else {
						this.renderNotes();
					}
				}
			}
	
}

document.addEventListener('DOMContentLoaded', () => {
    window.editor = new PianoRoll();
});
