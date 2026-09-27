class KeyboardManager {
    constructor(pianoRoll) {
        this.pianoRoll = pianoRoll;
        this.clipboard = []; // Буфер обмена для скопированных нот

        this.initListeners();
    }

    initListeners() {
        window.addEventListener('keydown', (e) => {
            // Игнорируем горячие клавиши, если фокус находится в поле ввода
            const activeElement = document.activeElement;
            if (activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeElement.tagName)) {
                return;
            }

            const isCtrl = e.ctrlKey || e.metaKey; // Поддержка Windows (Ctrl) и macOS (Cmd)

            // Пробел — Play / Stop
            if (e.code === 'Space') {
                e.preventDefault();
                this.togglePlay();
            }

            // Стрелка влево — смещение транспорта назад
            else if (e.code === 'ArrowLeft') {
                e.preventDefault();
                this.moveTransport(-1);
            }

            // Стрелка вправо — смещение транспорта вперёд
            else if (e.code === 'ArrowRight') {
                e.preventDefault();
                this.moveTransport(1);
            }

            // Delete / Backspace — удаление выделенных нот
            else if (e.code === 'Delete' || e.code === 'Backspace') {
                e.preventDefault();
                this.deleteSelected();
            }

            // Ctrl + C — копировать
            else if (isCtrl && e.code === 'KeyC') {
                e.preventDefault();
                this.copy();
            }

            // Ctrl + V — вставить в текущей точке транспорта
            else if (isCtrl && e.code === 'KeyV') {
                e.preventDefault();
                this.paste();
            }

            // Ctrl + D — дублировать в ближайшую ячейку справа
            else if (isCtrl && e.code === 'KeyD') {
                e.preventDefault();
                this.duplicate();
            }
			

			const isShift = e.shiftKey;

			// Ctrl + Z — Отмена (Undo)
			if (isCtrl && e.code === 'KeyZ' && !isShift) {
				e.preventDefault();
				this.pianoRoll.undo();
			}

			// Ctrl + Y или Ctrl + Shift + Z — Повтор (Redo)
			else if ((isCtrl && e.code === 'KeyY') || (isCtrl && isShift && e.code === 'KeyZ')) {
				e.preventDefault();
				this.pianoRoll.redo();
			}

			// Внутри window.addEventListener('keydown', (e) => { ... })[cite: 15]

			// Выбор длительностей нот с клавиатуры
			const durMap = {
			    'Digit1': 1,     'Numpad1': 1,      // 1 - целая (1/1)
			    'Digit2': 0.5,   'Numpad2': 0.5,    // 2 - половина (1/2)
			    'Digit4': 0.25,  'Numpad4': 0.25,   // 4 - четверть (1/4)
			    'Digit8': 0.125, 'Numpad8': 0.125,  // 8 - восьмая (1/8)
			    'Digit6': 0.0625,'Numpad6': 0.0625  // 6 - шестнадцатая (1/16)
			};
			
			if (durMap[e.code] !== undefined) {
			    e.preventDefault();
			    const targetDur = durMap[e.code];
			    const btn = document.querySelector(`.dur-btn[data-dur="${targetDur}"]`);
			    if (btn) {
			        // Симулируем клик по соответствующей кнопке длительности
			        btn.click();
			    }
			}
			
			// Нажатие точки (Period) — переключение длительности с точкой
			if (e.code === 'Period' || e.code === 'NumpadDecimal') {
			    e.preventDefault();
			    const activeBtn = document.querySelector('.dur-btn.active');
			    if (activeBtn) {
			        // Симулируем двойной клик для включения/отключения точки
			        activeBtn.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
			    }
			}
			
        });
    }

    // --- ЛОГИКА ДЕЙСТВИЙ ---

    // 1. Старт / Стоп
    togglePlay() {
        if (this.pianoRoll.isPlaying) {
            document.getElementById('btn-stop')?.click();
        } else {
            document.getElementById('btn-play')?.click();
        }
    }

    // 2. Управление транспортом (стрелочки)
    moveTransport(direction) {
        const snapSlots = this.pianoRoll.getSnapStepSlots ? this.pianoRoll.getSnapStepSlots() : 4;
        let newStep = this.pianoRoll.currentStep + (direction * snapSlots);
        
        if (newStep < 0) newStep = 0;
        if (newStep >= this.pianoRoll.config.gridSize) newStep = this.pianoRoll.config.gridSize - 1;

        this.pianoRoll.currentStep = newStep;
        
        // Синхронизация с Tone.js, если плейхед стоит
        if (typeof Tone !== 'undefined' && Tone.Transport) {
            const secondsPerStep = Tone.Transport.toSeconds("16n");
            Tone.Transport.seconds = newStep * secondsPerStep;
        }

        this.pianoRoll.updatePlayhead(newStep * this.pianoRoll.config.cellW);
    }

    // 3. Удаление выделенных нот (Delete)
    deleteSelected() {
        if (!this.pianoRoll.selectedNotes || this.pianoRoll.selectedNotes.size === 0) return;

        this.pianoRoll.saveState();
        this.pianoRoll.selectedNotes.forEach(note => {
            this.pianoRoll.removeNoteObject(note);
        });
        this.pianoRoll.selectedNotes.clear();
        this.pianoRoll.renderNotes();
    }

    // 4. Копирование (Ctrl + C)
    copy() {
        if (!this.pianoRoll.selectedNotes || this.pianoRoll.selectedNotes.size === 0) return;

        const selected = Array.from(this.pianoRoll.selectedNotes);
        // Находим самую левую точку выделенного фрагмента для сохранения относительно нее
        const minStart = Math.min(...selected.map(n => n.start));

        this.clipboard = selected.map(note => ({
            pitch: note.pitch,
            duration: note.duration,
            dotted: note.dotted || false,
            relativeStart: note.start - minStart // Относительный сдвиг
        }));
    }

    // 5. Вставка (Ctrl + V) в точку транспорта
    paste() {
        if (this.clipboard.length === 0) return;

        this.pianoRoll.saveState();
        
        const targetStart = this.pianoRoll.currentStep;
        const currentTrack = this.pianoRoll.tracks[this.pianoRoll.activeTrack];
        
        this.pianoRoll.selectedNotes.clear();

        this.clipboard.forEach(item => {
            const newNote = {
                pitch: item.pitch,
                start: targetStart + item.relativeStart,
                duration: item.duration,
                dotted: item.dotted
            };
            currentTrack.push(newNote);
            this.pianoRoll.selectedNotes.add(newNote);
        });

        this.pianoRoll.renderNotes();
    }

    // 6. Дублирование (Ctrl + D) сразу за последней выделенной нотой
    duplicate() {
        if (!this.pianoRoll.selectedNotes || this.pianoRoll.selectedNotes.size === 0) return;

        const selected = Array.from(this.pianoRoll.selectedNotes);
        const minStart = Math.min(...selected.map(n => n.start));
        const maxEnd = Math.max(...selected.map(n => n.start + n.duration));

        this.pianoRoll.saveState();

        const currentTrack = this.pianoRoll.tracks[this.pianoRoll.activeTrack];
        const newSelection = new Set();

        selected.forEach(note => {
            const offset = note.start - minStart;
            const newNote = {
                pitch: note.pitch,
                start: maxEnd + offset, // Вставка строго встык справа
                duration: note.duration,
                dotted: note.dotted || false
            };
            currentTrack.push(newNote);
            newSelection.add(newNote);
        });

        // Переключаем выделение на свежесозданные ноты
        this.pianoRoll.selectedNotes = newSelection;
        this.pianoRoll.renderNotes();
    }
}
