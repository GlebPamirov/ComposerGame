/**
 * ЕДИНЫЙ МОДУЛЬ УПРАВЛЕНИЯ ТИПАМИ АККОРДОВ И ИХ РИСОВАНИЮ В PIANO ROLL
 */

const CHORD_LIBRARY = [
    { id: 'single', name: 'Нота',                        intervals: [0] },
    
    // Трезвучия
    { id: 'maj',    name: 'Мажорное трезвучие',          intervals: [0, 4, 7] },
    { id: 'min',    name: 'Минорное трезвучие',          intervals: [0, 3, 7] },
    //{ id: 'm',      name: 'Минор',                       intervals: [0, 3, 7] },
    { id: 'dim',    name: 'Уменьшенное трезвучие',       intervals: [0, 3, 6] },
    { id: 'aug',    name: 'Увеличенное трезвучие',       intervals: [0, 4, 8] },
    { id: 'sus2',   name: 'Суспенд sus2',                intervals: [0, 2, 7] },
    { id: 'sus4',   name: 'Суспенд sus4',                intervals: [0, 5, 7] },
    //{ id: '5',      name: 'Квинта (Powerchord)',         intervals: [0, 7] },

    // Септаккорды
    { id: '7',      name: 'Доминантсептаккорд',         intervals: [0, 4, 7, 10] },
    { id: 'maj7',   name: 'Большой мажорный септаккорд', intervals: [0, 4, 7, 11] },
    { id: 'm7',     name: 'Малый минорный септаккорд',   intervals: [0, 3, 7, 10] },
    { id: 'dim7',   name: 'Уменьшенный септаккорд',      intervals: [0, 3, 6, 9] },
    { id: 'm7b5',   name: 'Полууменьшенный септаккорд',  intervals: [0, 3, 6, 10] },

    // Нонаккорды и расширения
    //{ id: 'add9',   name: 'Мажор add9',                  intervals: [0, 4, 7, 14] },
    { id: '9',      name: 'Доминантнонаккорд',           intervals: [0, 4, 7, 10, 14] },
    { id: 'maj9',   name: 'Большой мажорный нонаккорд',  intervals: [0, 4, 7, 11, 14] },
    { id: 'm9',     name: 'Минорный нонаккорд',          intervals: [0, 3, 7, 10, 14] },
    { id: '11',     name: 'Ундецимаккорд',               intervals: [0, 4, 7, 10, 14, 17] },
    { id: 'm11',    name: 'Минорный ундецимаккорд',      intervals: [0, 3, 7, 10, 14, 17] },
    { id: '13',     name: 'Терцдецимаккорд',             intervals: [0, 4, 7, 10, 14, 21] },
    { id: 'm13',    name: 'Минорный терцдецимаккорд',    intervals: [0, 3, 7, 10, 14, 21] }
];

// Автоматически формируемый единый массив ID типов для выпадающих списков
const BASE_CHORD_TYPES = CHORD_LIBRARY
    .filter(c => c.id !== 'single')
    .map(c => c.id);

class ChordManager {
    constructor(editor) {
        this.editor = editor;
        this.selectedChordId = 'single';
        this.chords = CHORD_LIBRARY;
    }

    initUI() {
        document.addEventListener('click', async (e) => {
            const btn = e.target.closest('.chord-circle');
            if (!btn) return;

            try {
                await Tone.start();
            } catch (err) {
                console.warn('Tone.js еще не готов:', err);
            }

            document.querySelectorAll('.chord-circle').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const chordId = btn.dataset.chord || btn.innerText.trim();
            if (typeof this.setChordType === 'function') {
                this.setChordType(chordId);
            }
        });
    }

    setChordType(chordId) {
        const chord = this.chords.find(c => 
            c.id.toLowerCase() === chordId.toLowerCase() || 
            c.name.toLowerCase() === chordId.toLowerCase()
        );
        
        this.selectedChordId = chord ? chord.id : 'single';
    }

    getActiveIntervals() {
        return this.getIntervals(this.selectedChordId);
    }

    getIntervals(type) {
        const key = String(type || '').toLowerCase().trim();
        const chord = this.chords.find(c => c.id.toLowerCase() === key);
        if (chord) return chord.intervals;

        // Псевдонимы
        if (key === 'major') return [0, 4, 7];
        if (key === 'minor') return [0, 3, 7];
        if (key === 'dom7' || key === '7th') return [0, 4, 7, 10];
        if (key === 'min7') return [0, 3, 7, 10];

        return [0, 4, 7]; // Мажор по умолчанию
    }

    addChord(rootPitch, startSlot) {
        const intervals = this.getActiveIntervals();
        const durationSlots = Math.max(1, Math.round(this.editor.selectedDuration / 0.0625));
        const maxPitch = this.editor.config.baseNote + this.editor.config.numNotes - 1;

        if (!this.editor.tracks[this.editor.activeTrack]) {
            this.editor.tracks[this.editor.activeTrack] = [];
        }

        this.editor.saveState();

        const addedPitches = [];

        intervals.forEach(interval => {
            const pitch = rootPitch + interval;
            if (pitch <= maxPitch) {
                this.editor.tracks[this.editor.activeTrack].push({
                    pitch: pitch,
                    start: startSlot,
                    duration: durationSlots,
                    dotted: this.editor.hasDotted
                });
                addedPitches.push(pitch);
            }
        });

        this.editor.renderNotes();

        if (addedPitches.length > 0) {
            this.editor.playChordPreviewByPitches(addedPitches);
        }
        
        if (this.editor.harmonyManager) {
            this.editor.harmonyManager.updateTechnicalInfo(rootPitch, this.selectedChordId, durationSlots);
        }
    }
}