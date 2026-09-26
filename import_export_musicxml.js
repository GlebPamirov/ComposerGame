/**
 * Модуль импорта и экспорта MusicXML
 */

function decomposeDuration(dur) {
    const valid = [16, 12, 8, 6, 4, 3, 2, 1];
    const result = [];
    let rem = dur;
    while (rem > 0) {
        const d = valid.find(v => v <= rem) || 1;
        result.push(d);
        rem -= d;
    }
    return result;
}

function getTypeAndDot(durationSlots) {
    switch (durationSlots) {
        case 16: return { type: 'whole', dot: false };
        case 12: return { type: 'half', dot: true };
        case 8:  return { type: 'half', dot: false };
        case 6:  return { type: 'quarter', dot: true };
        case 4:  return { type: 'quarter', dot: false };
        case 3:  return { type: 'eighth', dot: true };
        case 2:  return { type: 'eighth', dot: false };
        case 1:  return { type: '16th', dot: false };
        default: return { type: 'quarter', dot: false };
    }
}

function generateRestXML(gapLen, startOffsetInMeasure) {
    let xml = '';
    let rem = gapLen;
    let curr = startOffsetInMeasure;

    while (rem > 0) {
        let rDur = 0;
        let offsetInBeat = curr % 4;

        if (offsetInBeat !== 0) {
            let neededToAlign = 4 - offsetInBeat;
            rDur = Math.min(rem, neededToAlign);
        } else {
            if (rem >= 12 && curr % 12 === 0) rDur = 12;
            else if (rem >= 8 && curr % 8 === 0) rDur = 8;
            else if (rem >= 4) rDur = 4;
            else if (rem >= 2) rDur = 2;
            else rDur = 1;
        }

        const typeInfo = getTypeAndDot(rDur);
        xml += `      <note>\n`;
        xml += `        <rest/>\n`;
        xml += `        <duration>${rDur}</duration>\n`;
        if (typeInfo.type) xml += `        <type>${typeInfo.type}</type>\n`;
        if (typeInfo.dot) xml += `        <dot/>\n`;
        xml += `      </note>\n`;

        rem -= rDur;
        curr += rDur;
    }
    return xml;
}

function formatNoteXML(pitch, duration, tieStart, tieStop, isChord) {
    const stepName = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'][pitch % 12];
    const alter = [1, 3, 6, 8, 10].includes(pitch % 12) ? 1 : 0;
    const octave = Math.floor(pitch / 12) - 1;
    const typeInfo = getTypeAndDot(duration);

    let xml = `      <note>\n`;
    if (isChord) xml += `        <chord/>\n`;
    xml += `        <pitch>\n`;
    xml += `          <step>${stepName}</step>\n`;
    if (alter !== 0) xml += `          <alter>${alter}</alter>\n`;
    xml += `          <octave>${octave}</octave>\n`;
    xml += `        </pitch>\n`;
    xml += `        <duration>${duration}</duration>\n`;
    
    if (tieStop) xml += `        <tie type="stop"/>\n`;
    if (tieStart) xml += `        <tie type="start"/>\n`;
    
    if (typeInfo.type) xml += `        <type>${typeInfo.type}</type>\n`;
    if (typeInfo.dot) xml += `        <dot/>\n`;

    if (tieStart || tieStop) {
        xml += `        <notations>\n`;
        if (tieStop) xml += `          <tied type="stop"/>\n`;
        if (tieStart) xml += `          <tied type="start"/>\n`;
        xml += `        </notations>\n`;
    }
    xml += `      </note>\n`;
    return xml;
}

// ЭКСПОРТ В MUSICXML (Экспортируются только используемые такты в порядке UI)
function exportMusicXML(editor) {
    const bpm = document.getElementById('input-bpm')?.value || 120;
    const timeSig = (document.getElementById('select-time-sig')?.value || '4/4').split('/');
    const beats = parseInt(timeSig[0]) || 4;
    const beatType = parseInt(timeSig[1]) || 4;

    // Чтение названия трека из UI
    const titleInput = document.getElementById('track-title-input');
    const trackTitle = (titleInput && titleInput.value.trim()) ? titleInput.value.trim() : "Без автора и Без названия";

    const slotsPerBeat = 16 / beatType;
    const beatsPerMeasure = beats * slotsPerBeat;

    // Получение треков строго в порядке UI (учитывает перетаскивание)
    const trackIds = (typeof editor.getOrderedTracks === 'function') 
        ? editor.getOrderedTracks() 
        : Object.keys(editor.tracks);

    // Определение максимального занятого слота во всех треках
    let maxEndSlot = 0;
    trackIds.forEach(key => {
        const trackNotes = editor.tracks[key] || [];
        trackNotes.forEach(note => {
            const noteEnd = note.start + note.duration;
            if (noteEnd > maxEndSlot) {
                maxEndSlot = noteEnd;
            }
        });
    });

    // Экспортируем ровно столько тактов, сколько перекрывают ноты (минимум 1 такт)
    const totalMeasures = Math.max(1, Math.ceil(maxEndSlot / beatsPerMeasure));

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n`;
    xml += `<score-partwise version="4.0">\n`;
    xml += `  <work><work-title>${trackTitle}</work-title></work>\n`;
    xml += `  <movement-title>${trackTitle}</movement-title>\n`;
    
    xml += `  <part-list>\n`;
    let pId = 1;
    const activePartIds = {};
    trackIds.forEach(key => {
        const partId = `P${pId++}`;
        activePartIds[key] = partId;
        const name = editor.instrumentTypes[key]?.name || key;
        xml += `    <score-part id="${partId}">\n`;
        xml += `      <part-name>${name}</part-name>\n`;
        xml += `    </score-part>\n`;
    });
    xml += `  </part-list>\n`;

    trackIds.forEach(key => {
        const partId = activePartIds[key];
        const rawNotes = editor.tracks[key] || [];

        const measureSegments = [];
        rawNotes.forEach(n => {
            let currStart = n.start;
            let remDuration = n.duration;

            while (remDuration > 0) {
                const mIndex = Math.floor(currStart / beatsPerMeasure);
                const measureStart = mIndex * beatsPerMeasure;
                const measureEnd = measureStart + beatsPerMeasure;
                const maxPossibleInMeasure = measureEnd - currStart;

                const segDuration = Math.min(remDuration, maxPossibleInMeasure);
                const hasTieStart = (remDuration > segDuration);
                const hasTieStop = (currStart > n.start);

                measureSegments.push({
                    pitch: n.pitch,
                    start: currStart,
                    duration: segDuration,
                    tieStart: hasTieStart,
                    tieStop: hasTieStop,
                    measureIndex: mIndex
                });

                currStart += segDuration;
                remDuration -= segDuration;
            }
        });

        xml += `  <part id="${partId}">\n`;

        for (let m = 0; m < totalMeasures; m++) {
            const measureStart = m * beatsPerMeasure;
            const measureEnd = measureStart + beatsPerMeasure;
            const mNotes = measureSegments.filter(n => n.measureIndex === m);

            xml += `    <measure number="${m + 1}">\n`;
            if (m === 0) {
                xml += `      <attributes>\n`;
                xml += `        <divisions>4</divisions>\n`;
                xml += `        <key><fifths>0</fifths></key>\n`;
                xml += `        <time><beats>${beats}</beats><beat-type>${beatType}</beat-type></time>\n`;
                xml += `        <clef><sign>G</sign><line>2</line></clef>\n`;
                xml += `      </attributes>\n`;
                xml += `      <direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${bpm}</per-minute></metronome></direction-type></direction>\n`;
            }

            if (mNotes.length === 0) {
                xml += `      <note>\n`;
                xml += `        <rest measure="yes"/>\n`;
                xml += `        <duration>${beatsPerMeasure}</duration>\n`;
                xml += `      </note>\n`;
            } else {
                const startTimes = Array.from(new Set(mNotes.map(n => n.start))).sort((a, b) => a - b);
                let cursor = measureStart;

                startTimes.forEach((t, idx) => {
                    if (t > cursor) {
                        const gapLen = t - cursor;
                        const startOffset = cursor - measureStart;
                        xml += generateRestXML(gapLen, startOffset);
                        cursor = t;
                    }

                    const chordGroup = mNotes.filter(n => n.start === t);
                    const nextT = (idx < startTimes.length - 1) ? startTimes[idx + 1] : measureEnd;
                    const maxAllowedDur = nextT - t;

                    const rawMaxDur = Math.max(...chordGroup.map(n => n.duration));
                    const groupDur = Math.max(1, Math.min(rawMaxDur, maxAllowedDur));

                    const subDurs = decomposeDuration(groupDur);

                    subDurs.forEach((subDur, subIdx) => {
                        chordGroup.forEach((n, chordIdx) => {
                            const isChord = chordIdx > 0;
                            const isSubTieStart = (subIdx < subDurs.length - 1) || n.tieStart;
                            const isSubTieStop = (subIdx > 0) || n.tieStop;

                            xml += formatNoteXML(n.pitch, subDur, isSubTieStart, isSubTieStop, isChord);
                        });
                    });

                    cursor += groupDur;
                });

                if (cursor < measureEnd) {
                    const gapLen = measureEnd - cursor;
                    const startOffset = cursor - measureStart;
                    xml += generateRestXML(gapLen, startOffset);
                }
            }
            xml += `    </measure>\n`;
        }
        xml += `  </part>\n`;
    });

    xml += `</score-partwise>`;

    const blob = new Blob([xml], { type: 'text/xml' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${trackTitle}.musicxml`;
    link.click();
}

// 1. Единый генератор MusicXML-строки для использования везде (экспорт, сохранение учителя, сохранение ученика)
	function buildMusicXMLString(editor, customTitle) {
		const bpm = document.getElementById('input-bpm')?.value || 120;
		const timeSig = (document.getElementById('select-time-sig')?.value || '4/4').split('/');
		const beats = parseInt(timeSig[0]) || 4;
		const beatType = parseInt(timeSig[1]) || 4;

		const titleInput = document.getElementById('track-title-input');
		const trackTitle = customTitle || (titleInput && titleInput.value.trim()) || "Без названия";

		const slotsPerBeat = 16 / beatType;
		const beatsPerMeasure = beats * slotsPerBeat;

		const trackIds = (typeof editor.getOrderedTracks === 'function') 
			? editor.getOrderedTracks() 
			: Object.keys(editor.tracks);

		let maxEndSlot = 0;
		trackIds.forEach(key => {
			const trackNotes = editor.tracks[key] || [];
			trackNotes.forEach(note => {
				const noteEnd = note.start + note.duration;
				if (noteEnd > maxEndSlot) maxEndSlot = noteEnd;
			});
		});

		const totalMeasures = Math.max(1, Math.ceil(maxEndSlot / beatsPerMeasure));

		let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
		xml += `<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n`;
		xml += `<score-partwise version="4.0">\n`;
		xml += `  <work><work-title>${trackTitle}</work-title></work>\n`;
		xml += `  <movement-title>${trackTitle}</movement-title>\n`;
		
		xml += `  <part-list>\n`;
		let pId = 1;
		const activePartIds = {};
		trackIds.forEach(key => {
			const partId = `P${pId++}`;
			activePartIds[key] = partId;
			const name = editor.instrumentTypes[key]?.name || key;
			xml += `    <score-part id="${partId}">\n`;
			xml += `      <part-name>${name}</part-name>\n`;
			xml += `    </score-part>\n`;
		});
		xml += `  </part-list>\n`;

		trackIds.forEach(key => {
			const partId = activePartIds[key];
			const rawNotes = editor.tracks[key] || [];

			const measureSegments = [];
			rawNotes.forEach(n => {
				let currStart = n.start;
				let remDuration = n.duration;

				while (remDuration > 0) {
					const mIndex = Math.floor(currStart / beatsPerMeasure);
					const measureStart = mIndex * beatsPerMeasure;
					const measureEnd = measureStart + beatsPerMeasure;
					const maxPossibleInMeasure = measureEnd - currStart;

					const segDuration = Math.min(remDuration, maxPossibleInMeasure);
					const hasTieStart = (remDuration > segDuration);
					const hasTieStop = (currStart > n.start);

					measureSegments.push({
						pitch: n.pitch,
						start: currStart,
						duration: segDuration,
						tieStart: hasTieStart,
						tieStop: hasTieStop,
						measureIndex: mIndex
					});

					currStart += segDuration;
					remDuration -= segDuration;
				}
			});

			xml += `  <part id="${partId}">\n`;

			for (let m = 0; m < totalMeasures; m++) {
				const measureStart = m * beatsPerMeasure;
				const measureEnd = measureStart + beatsPerMeasure;
				const mNotes = measureSegments.filter(n => n.measureIndex === m);

				xml += `    <measure number="${m + 1}">\n`;
				if (m === 0) {
					xml += `      <attributes>\n`;
					xml += `        <divisions>4</divisions>\n`;
					xml += `        <key><fifths>0</fifths></key>\n`;
					xml += `        <time><beats>${beats}</beats><beat-type>${beatType}</beat-type></time>\n`;
					xml += `        <clef><sign>G</sign><line>2</line></clef>\n`;
					xml += `      </attributes>\n`;
					xml += `      <direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${bpm}</per-minute></metronome></direction-type></direction>\n`;
				}

				if (mNotes.length === 0) {
					xml += `      <note>\n`;
					xml += `        <rest measure="yes"/>\n`;
					xml += `        <duration>${beatsPerMeasure}</duration>\n`;
					xml += `      </note>\n`;
				} else {
					const startTimes = Array.from(new Set(mNotes.map(n => n.start))).sort((a, b) => a - b);
					let cursor = measureStart;

					startTimes.forEach((t, idx) => {
						if (t > cursor) {
							const gapLen = t - cursor;
							const startOffset = cursor - measureStart;
							xml += generateRestXML(gapLen, startOffset);
							cursor = t;
						}

						const chordGroup = mNotes.filter(n => n.start === t);
						const nextT = (idx < startTimes.length - 1) ? startTimes[idx + 1] : measureEnd;
						const maxAllowedDur = nextT - t;

						const rawMaxDur = Math.max(...chordGroup.map(n => n.duration));
						const groupDur = Math.max(1, Math.min(rawMaxDur, maxAllowedDur));

						const subDurs = decomposeDuration(groupDur);

						subDurs.forEach((subDur, subIdx) => {
							chordGroup.forEach((n, chordIdx) => {
								const isChord = chordIdx > 0;
								const isSubTieStart = (subIdx < subDurs.length - 1) || n.tieStart;
								const isSubTieStop = (subIdx > 0) || n.tieStop;

								xml += formatNoteXML(n.pitch, subDur, isSubTieStart, isSubTieStop, isChord);
							});
						});

						cursor += groupDur;
					});

					if (cursor < measureEnd) {
						const gapLen = measureEnd - cursor;
						const startOffset = cursor - measureStart;
						xml += generateRestXML(gapLen, startOffset);
					}
				}
				xml += `    </measure>\n`;
			}
			xml += `  </part>\n`;
		});

		xml += `</score-partwise>`;
		return xml;
	}

	// 2. Скачивание файла в браузере (теперь просто вызывает buildMusicXMLString)
	function exportMusicXML(editor) {
		const titleInput = document.getElementById('track-title-input');
		const trackTitle = (titleInput && titleInput.value.trim()) ? titleInput.value.trim() : "Без названия";
		
		const xmlContent = buildMusicXMLString(editor, trackTitle);

		const blob = new Blob([xmlContent], { type: 'text/xml' });
		const link = document.createElement('a');
		link.href = URL.createObjectURL(blob);
		link.download = `${trackTitle}.musicxml`;
		link.click();
	}

function importMusicXML(xmlText, editor) {
    try {
        // 0. Проверка: не вернул ли Google Drive HTML-страницу вместо XML
        if (!xmlText || typeof xmlText !== 'string' || xmlText.trim().startsWith('<!DOCTYPE html>') || xmlText.includes('<html')) {
            console.error('[Import] Ошибка: Получены неверные данные (HTML вместо XML). Проверьте права доступа к файлу на Google Диске.');
            alert('Ошибка загрузки: Google Диск вернул страницу авторизации вместо нотного файла. Проверьте права доступа к файлу.');
            return;
        }

        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");

        // Проверка ошибок парсинга XML
        const parserError = xmlDoc.querySelector('parsererror');
        if (parserError) {
            console.error('[Import] Ошибка структуры XML:', parserError.textContent);
            alert('Ошибка чтения нотного файла XML.');
            return;
        }

        // 1. Извлечение названия трека
        const workTitle = xmlDoc.querySelector('work-title')?.textContent;
        const movementTitle = xmlDoc.querySelector('movement-title')?.textContent;
        const trackTitle = (workTitle || movementTitle || "Без названия").trim();

        const titleInput = document.getElementById('track-title-input');
        if (titleInput) {
            titleInput.value = trackTitle;
        }

        // 2. Темп (BPM)
        const bpmElem = xmlDoc.querySelector('per-minute');
        if (bpmElem) {
            const bpm = parseInt(bpmElem.textContent) || 120;
            const bpmInput = document.getElementById('input-bpm');
            if (bpmInput) bpmInput.value = bpm;
            if (typeof Tone !== 'undefined' && Tone.Transport) {
                Tone.Transport.bpm.value = bpm;
            }
        }

        // 3. Размер (Time Signature)
        const beatsElem = xmlDoc.querySelector('time > beats');
        const beatTypeElem = xmlDoc.querySelector('time > beat-type');
        if (beatsElem && beatTypeElem) {
            const timeSig = `${beatsElem.textContent.trim()}/${beatTypeElem.textContent.trim()}`;
            const selectTimeSig = document.getElementById('select-time-sig');
            if (selectTimeSig) {
                selectTimeSig.value = timeSig;
            }
        }

        const newTracks = {};
        const parts = xmlDoc.querySelectorAll('part');
        let totalNotesCount = 0; // Счётчик найденных нот
        
        parts.forEach((part, index) => {
            const partId = part.getAttribute('id') || `part_${index}`;
            const partNameElem = xmlDoc.querySelector(`score-part[id="${partId}"] > part-name`);
            const trackName = partNameElem ? partNameElem.textContent.trim() : `Track ${index + 1}`;
            
            const trackKey = `inst_${index + 1}`;
            const trackColor = [0x4A90E2, 0x4CAF50, 0x8B4513, 0x9B59B6, 0xE67E22][index % 5];
            
            if (!editor.instrumentTypes) editor.instrumentTypes = {};
            editor.instrumentTypes[trackKey] = {
                name: trackName,
                color: trackColor
            };
            newTracks[trackKey] = [];

            let currentDivisions = 4; // Запасное значение по умолчанию
            let timelineCursor = 0;
            let lastNoteStart = 0;

            const measures = part.querySelectorAll('measure');
            
            measures.forEach((measure) => {
                const divElem = measure.querySelector('attributes > divisions');
                if (divElem) {
                    const parsedDiv = parseInt(divElem.textContent);
                    if (parsedDiv > 0) currentDivisions = parsedDiv;
                }

                const notes = measure.querySelectorAll('note');
                notes.forEach((note) => {
                    const isChord = note.querySelector('chord') !== null;
                    const durationElem = note.querySelector('duration');
                    const rawDuration = durationElem ? parseInt(durationElem.textContent) : 0;
                    
                    // Безопасный расчёт длительности в 16-х долях
                    const durationIn16ths = Math.max(1, Math.round((rawDuration / currentDivisions) * 4));

                    if (isChord) {
                        timelineCursor = lastNoteStart;
                    } else {
                        lastNoteStart = timelineCursor;
                    }

                    const pitchElem = note.querySelector('pitch');
                    const isRest = note.querySelector('rest') !== null;

                    if (pitchElem && !isRest) {
                        const step = pitchElem.querySelector('step')?.textContent.trim() || 'C';
                        const alter = parseInt(pitchElem.querySelector('alter')?.textContent || '0');
                        const octave = parseInt(pitchElem.querySelector('octave')?.textContent || '4');

                        const stepOffsets = { 'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11 };
                        const midiPitch = (octave + 1) * 12 + (stepOffsets[step] || 0) + alter;

                        const tieStop = note.querySelector('tie[type="stop"]');
                        let targetNote = null;

                        if (tieStop) {
                            targetNote = newTracks[trackKey].find(n => 
                                n.pitch === midiPitch && (n.start + n.duration === timelineCursor)
                            );
                        }

                        if (targetNote) {
                            targetNote.duration += durationIn16ths;
                        } else {
                            newTracks[trackKey].push({
                                pitch: midiPitch,
                                start: timelineCursor,
                                duration: durationIn16ths,
                                dotted: note.querySelector('dot') !== null
                            });
                            totalNotesCount++;
                        }
                    }

                    timelineCursor += durationIn16ths;
                });
            });
        });

        if (totalNotesCount > 0) {
            // Перезаписываем дорожки в редакторе
            editor.tracks = newTracks;
            editor.activeTrack = Object.keys(newTracks)[0];
            
            if (Array.isArray(editor.tracksOrder)) {
                editor.tracksOrder = Object.keys(newTracks);
            }

            // Перерисовываем UI
            const list = document.getElementById('instruments-list');
            if (list) {
                list.innerHTML = '';
                Object.keys(editor.tracks).forEach(key => {
                    if (typeof editor.addInstrumentToUI === 'function') {
                        editor.addInstrumentToUI(key, editor.instrumentTypes[key].name, editor.instrumentTypes[key].color);
                    }
                });
            }

            if (typeof editor.selectTrack === 'function') {
                editor.selectTrack(editor.activeTrack);
            }

            // Обновляем холст редактора
            if (typeof editor.updateGrid === 'function') editor.updateGrid();
            if (typeof editor.renderNotes === 'function') editor.renderNotes();
            if (typeof editor.draw === 'function') editor.draw();
            if (typeof editor.render === 'function') editor.render();

            console.log(`[Import] Успешно загружено нот: ${totalNotesCount}`, newTracks);
        } else {
            console.warn('[Import] Структура файла прочитана, но ноты не найдены:', newTracks);
            alert('Файл MusicXML не содержит нот или ноты сохранили в пустом формате.');
        }
    } catch (err) {
        console.error('Ошибка при импорте MusicXML:', err);
        alert('Ошибка при чтении файла MusicXML.');
    }
}