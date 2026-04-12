const DAW_CONFIG = {
    cellW: 40,
    cellH: 20,
    baseNote: 48,
    numNotes: 37,
    gridSize: 64,
    keyWidth: 60,
	ppq: 4, // Divisions в MusicXML (сколько долей в четверти)
};

const INSTRUMENT_TYPES = {
    'flute': { name: 'Флейта', color: 0x4CAF50, synth: new Tone.Synth({ oscillator: { type: 'triangle' } }).toDestination() },
    'piano': { name: 'Фортепиано', color: 0x4A90E2, synth: new Tone.PolySynth(Tone.Synth).toDestination() },
    'cello': { name: 'Виолончель', color: 0x8B4513, synth: new Tone.Synth({ oscillator: { type: 'sawtooth' }, envelope: { attack: 0.1 } }).toDestination() }
};

class PianoRoll {
    constructor() {
        this.notes = []; // {pitch, start, duration, trackId}
        this.tracks = []; // {id, type}
        this.activeTrackId = null;
        this.selectedDuration = 0.25;
        this.isPlaying = false;
		
		this.timeSignature = "4/4";
        
        this.initApp();
        this.initAudio();
        this.setupListeners();
        this.renderTrackList(); // Панель пуста при старте
		
		this.draggingNote = null;
		this.resizingNote = null;
		this.dragStartData = null;
		this.resizeSide = null;
    }

    initApp() {
        const container = document.getElementById('editor-container');
		const canvasHeight = DAW_CONFIG.numNotes * DAW_CONFIG.cellH;
		
		this.app = new PIXI.Application({
			width: DAW_CONFIG.gridSize * DAW_CONFIG.cellW + DAW_CONFIG.keyWidth,
			height: canvasHeight,
			backgroundColor: 0x232323,
			antialias: true
		});
		container.appendChild(this.app.view);

        this.gridLayer = new PIXI.Container();
        this.notesLayer = new PIXI.Container();
        this.playhead = new PIXI.Graphics();
        this.app.stage.addChild(this.gridLayer, this.notesLayer, this.playhead);

        this.drawGrid();
        this.updatePlayhead(0);
    }

    initAudio() {
        Tone.Transport.bpm.value = 120;
        Tone.Transport.scheduleRepeat((time) => {
            const currentStep = Math.floor(Tone.Transport.ticks / (Tone.Transport.PPQ / 4));
            const progress = Tone.Transport.seconds / Tone.Time("1m").toSeconds() * (DAW_CONFIG.cellW * 16);
            this.updatePlayhead(progress);

            this.notes.forEach(note => {
                if (note.start === currentStep) {
                    const inst = INSTRUMENT_TYPES[this.getTrackType(note.trackId)];
                    inst.synth.triggerAttackRelease(Tone.Frequency(note.pitch, "midi").toNote(), note.duration * (1/4) + "n", time);
                }
            });
        }, "16n");
    }

    getTrackType(trackId) {
        const track = this.tracks.find(t => t.id === trackId);
        return track ? track.type : 'piano';
    }

    addTrack() {
        const id = Date.now();
        const types = Object.keys(INSTRUMENT_TYPES);
        // По очереди предлагаем инструменты или по умолчанию первый
        const type = types[this.tracks.length % types.length];
        this.tracks.push({ id, type });
        this.activeTrackId = id;
        this.renderTrackList();
        this.renderNotes();
    }

    renderTrackList() {
        const listContainer = document.getElementById('tracks-list');
        listContainer.innerHTML = '';
        
        this.tracks.forEach(track => {
            const trackEl = document.createElement('div');
            trackEl.className = `track-item ${track.id === this.activeTrackId ? 'active' : ''}`;
            trackEl.style.borderLeft = `5px solid #${INSTRUMENT_TYPES[track.type].color.toString(16).padStart(6, '0')}`;
            
            trackEl.innerHTML = `
                <select onchange="editor.changeTrackType(${track.id}, this.value)">
                    ${Object.entries(INSTRUMENT_TYPES).map(([key, val]) => 
                        `<option value="${key}" ${track.type === key ? 'selected' : ''}>${val.name}</option>`
                    ).join('')}
                </select>
            `;
            
            trackEl.onclick = (e) => {
                if(e.target.tagName !== 'SELECT') {
                    this.activeTrackId = track.id;
                    this.renderTrackList();
                    this.renderNotes();
                }
            };
            listContainer.appendChild(trackEl);
        });
    }

    changeTrackType(trackId, newType) {
        const track = this.tracks.find(t => t.id === trackId);
        if (track) {
            track.type = newType;
            this.renderTrackList();
            this.renderNotes();
        }
    }

    setupListeners() {
        document.getElementById('btn-add-track').onclick = () => this.addTrack();
        
        // Стандартные кнопки
        document.getElementById('btn-play').onclick = async () => { await Tone.start(); Tone.Transport.start(); };
        document.getElementById('btn-stop').onclick = () => { Tone.Transport.stop(); Tone.Transport.seconds = 0; this.updatePlayhead(0); };
        
        document.querySelectorAll('.dur-btn').forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll('.dur-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.selectedDuration = parseFloat(btn.dataset.dur);
            };
        });
		
		document.getElementById('btn-save-midi').onclick = () => this.exportMIDI();
		document.getElementById('btn-save-xml').onclick = () => this.exportMusicXML();
	
	const tsSelect = document.getElementById('select-time-sig');
		if(tsSelect) {
			tsSelect.onchange = (e) => { this.timeSignature = e.target.value; };
		}

	this.app.view.onmousedown = (e) => {
		if (!this.activeTrackId) return; 

		const rect = this.app.view.getBoundingClientRect();
		const x = e.clientX - rect.left - DAW_CONFIG.keyWidth;
		const y = e.clientY - rect.top;
		
		const timeSlot = Math.floor(x / DAW_CONFIG.cellW);
		const noteIndex = Math.floor(y / DAW_CONFIG.cellH);
		const pitch = DAW_CONFIG.baseNote + (DAW_CONFIG.numNotes - 1 - noteIndex);

		// Ищем ноту ТОЛЬКО на активной дорожке
		const foundNote = this.notes.find(n => 
			n.trackId === this.activeTrackId && 
			n.pitch === pitch && 
			timeSlot >= n.start && timeSlot < n.start + n.duration
		);

		if (e.button === 0) {
			if (foundNote) {
				const noteStartX = foundNote.start * DAW_CONFIG.cellW;
				const noteEndX = (foundNote.start + foundNote.duration) * DAW_CONFIG.cellW;
				
				// Определяем, за что схватились: за край (ресайз) или за центр (перетаскивание)
				if (x > noteEndX - 10) { 
					this.resizingNote = foundNote; 
					this.resizeSide = 'right'; 
				} else if (x < noteStartX + 10) { 
					this.resizingNote = foundNote; 
					this.resizeSide = 'left'; 
				} else { 
					this.draggingNote = foundNote; 
				}
				
				this.dragStartData = { 
					slot: timeSlot, 
					pitch: pitch, 
					originalStart: foundNote.start, 
					originalDuration: foundNote.duration 
				};
			} else {
				this.addNote(pitch, timeSlot);
			}
		} else if (e.button === 2) {
			// Удаление тоже только для активной дорожки
			this.notes = this.notes.filter(n => 
				!(n.trackId === this.activeTrackId && n.pitch === pitch && timeSlot >= n.start && timeSlot < n.start + n.duration)
			);
			this.renderNotes();
		}
	};

	window.onmousemove = (e) => {
		if (!this.draggingNote && !this.resizingNote) return;

		const rect = this.app.view.getBoundingClientRect();
		const x = Math.max(0, e.clientX - rect.left - DAW_CONFIG.keyWidth);
		const y = e.clientY - rect.top;
		
		const currentTimeSlot = Math.floor(x / DAW_CONFIG.cellW);
		const currentPitch = DAW_CONFIG.baseNote + (DAW_CONFIG.numNotes - 1 - Math.floor(y / DAW_CONFIG.cellH));

		if (this.draggingNote) {
			const diff = currentTimeSlot - this.dragStartData.slot;
			this.draggingNote.start = Math.max(0, this.dragStartData.originalStart + diff);
			this.draggingNote.pitch = currentPitch;
		} 
		else if (this.resizingNote) {
			if (this.resizeSide === 'right') {
				this.resizingNote.duration = Math.max(1, currentTimeSlot - this.resizingNote.start + 1);
			} else {
				const diff = currentTimeSlot - this.resizingNote.start;
				if (this.resizingNote.duration - diff >= 1) {
					this.resizingNote.start = currentTimeSlot;
					this.resizingNote.duration -= diff;
				}
			}
		}
		this.renderNotes();
	};

	window.onmouseup = () => { 
		this.draggingNote = null; 
		this.resizingNote = null; 
	};
    }

    addNote(pitch, start) {
        const durationSlots = (this.selectedDuration / 0.0625);
        this.notes.push({ pitch, start, duration: durationSlots, trackId: this.activeTrackId });
        this.renderNotes();
        
        const inst = INSTRUMENT_TYPES[this.getTrackType(this.activeTrackId)];
        inst.synth.triggerAttackRelease(Tone.Frequency(pitch, "midi").toNote(), "16n");
    }

    renderNotes() {
        this.notesLayer.removeChildren();
        const g = new PIXI.Graphics();
        this.notesLayer.addChild(g);

        this.notes.forEach(n => {
            const isActive = n.trackId === this.activeTrackId;
            const type = this.getTrackType(n.trackId);
            const x = DAW_CONFIG.keyWidth + n.start * DAW_CONFIG.cellW;
            const y = (DAW_CONFIG.numNotes - 1 - (n.pitch - DAW_CONFIG.baseNote)) * DAW_CONFIG.cellH;
            
            g.beginFill(INSTRUMENT_TYPES[type].color, isActive ? 1 : 0.3);
            g.lineStyle(1, 0xffffff, isActive ? 0.3 : 0.1);
            g.drawRoundedRect(x + 1, y + 1, (n.duration * DAW_CONFIG.cellW) - 2, DAW_CONFIG.cellH - 2, 2);
            g.endFill();
        });
    }

    // Вспомогательные методы (drawGrid, updatePlayhead, isMidiBlack) остаются из прошлой версии
    updatePlayhead(x) {
        this.playhead.clear();
        this.playhead.lineStyle(2, 0xff0000, 1);
        this.playhead.moveTo(DAW_CONFIG.keyWidth + x, 0);
        this.playhead.lineTo(DAW_CONFIG.keyWidth + x, DAW_CONFIG.numNotes * DAW_CONFIG.cellH);
    }

    drawGrid() {
        const g = new PIXI.Graphics();
        this.gridLayer.addChild(g);
        for (let i = 0; i <= DAW_CONFIG.numNotes; i++) {
            const y = i * DAW_CONFIG.cellH;
            g.lineStyle(1, 0x333333);
            g.moveTo(DAW_CONFIG.keyWidth, y);
            g.lineTo(DAW_CONFIG.gridSize * DAW_CONFIG.cellW + DAW_CONFIG.keyWidth, y);
        }
        for (let i = 0; i <= DAW_CONFIG.gridSize; i++) {
            const x = DAW_CONFIG.keyWidth + i * DAW_CONFIG.cellW;
            g.lineStyle(1, i % 16 === 0 ? 0x666666 : 0x333333);
            g.moveTo(x, 0); g.lineTo(x, DAW_CONFIG.numNotes * DAW_CONFIG.cellH);
        }
    }
	
	exportMusicXML() {
	
		if (this.notes.length === 0) return alert("Проект пуст");

		const [beats, beatType] = this.timeSignature.split('/').map(Number);
		const divisions = 4; // Четвертная нота = 4 единицы

		let xml = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
	<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
	<score-partwise version="3.1">
	  <part-list>
		${this.tracks.map(t => `
		<score-part id="P${t.id}">
		  <part-name>${INSTRUMENT_TYPES[t.type].name}</part-name>
		</score-part>`).join('')}
	  </part-list>
	  ${this.tracks.map(track => {
		  const trackNotes = [...this.notes]
			  .filter(n => n.trackId === track.id)
			  .sort((a, b) => a.start - b.start);
		  
		  return `
	  <part id="P${track.id}">
		<measure number="1">
		  <attributes>
			<divisions>${divisions}</divisions>
			<key><fifths>0</fifths></key>
			<time>
			  <beats>${beats}</beats>
			  <beat-type>${beatType}</beat-type>
			</time>
			<clef><sign>G</sign><line>2</line></clef>
		  </attributes>
		  ${trackNotes.map(n => {
			  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
			  const step = names[n.pitch % 12];
			  const octave = Math.floor(n.pitch / 12) - 1;
			  
			  // Расчет типа ноты на основе длительности (16-е доли)
			  let type = "quarter";
			  if (n.duration <= 1) type = "16th";
			  else if (n.duration <= 2) type = "eighth";
			  else if (n.duration >= 8) type = "half";

			  return `
		  <note>
			<pitch>
			  <step>${step[0]}</step>
			  ${step.includes('#') ? '<alter>1</alter>' : ''}
			  <octave>${octave}</octave>
			</pitch>
			<duration>${n.duration}</duration>
			<type>${type}</type>
		  </note>`;
		  }).join('')}
		</measure>
	  </part>`;
	  }).join('')}
	</score-partwise>`;

		this.downloadFile(xml, 'project.musicxml', 'text/xml');
	}

	exportMIDI() {
		// Пробуем найти библиотеку в разных местах (window или глобально)
		
		const midiLib = window.MidiWriter || window['midi-writer-js'] || (typeof MidiWriter !== 'undefined' ? MidiWriter : null);
    
		if (!midiLib) {
			console.log("Доступные объекты в window:", Object.keys(window).filter(k => k.toLowerCase().includes('midi')));
			alert("Ошибка: библиотека MIDI не найдена. Попробуйте нажать Ctrl+F5.");
			return;
		}

		const tracks = this.tracks.map(t => {
			// Используем найденную библиотеку
			const track = new midiLib.Track(); 
			track.addTrackName(INSTRUMENT_TYPES[t.type].name);
			track.setTempo(120);
			
			this.notes.filter(n => n.trackId === t.id).forEach(n => {
				track.addEvent(new midiLib.NoteEvent({
					pitch: [Tone.Frequency(n.pitch, "midi").toNote()],
					duration: 'T' + (n.duration * 32), 
					startTick: n.start * 32
				}));
			});
			return track;
		});

		const write = new midiLib.Writer(tracks);
		this.downloadFile(write.buildFile(), 'project.mid', 'audio/midi');
	}

	downloadFile(content, fileName, contentType) {
		const a = document.createElement("a");
		const file = new Blob([content], { type: contentType });
		a.href = URL.createObjectURL(file);
		a.download = fileName;
		a.click();
	}
	
	
	
	
}

const editor = new PianoRoll();