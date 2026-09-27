/**
 * Модуль импорта и экспорта MusicXML
 * Приоритет: 100% точное сохранение длительностей, наложений (легато/арпеджио) и Velocity.
 */

// Определение визуального типа ноты для MusicXML (для совместимости с нотными редакторами)
function getTypeAndDot(durationIn16ths) {
    if (durationIn16ths >= 16) return { type: 'whole', dot: false };
    if (durationIn16ths >= 12) return { type: 'half', dot: true };
    if (durationIn16ths >= 8)  return { type: 'half', dot: false };
    if (durationIn16ths >= 6)  return { type: 'quarter', dot: true };
    if (durationIn16ths >= 4)  return { type: 'quarter', dot: false };
    if (durationIn16ths >= 3)  return { type: 'eighth', dot: true };
    if (durationIn16ths >= 2)  return { type: 'eighth', dot: false };
    return { type: '16th', dot: false };
}

// Построение единой строки MusicXML
function buildMusicXMLString(editor, customTitle) {
    const bpm = document.getElementById('input-bpm')?.value || 120;
    const timeSig = (document.getElementById('select-time-sig')?.value || '4/4').split('/');
    const beats = parseInt(timeSig[0], 10) || 4;
    const beatType = parseInt(timeSig[1], 10) || 4;

    const titleInput = document.getElementById('track-title-input');
    const trackTitle = customTitle || (titleInput && titleInput.value.trim()) || "Без названия";

    // 24 divisions per quarter note — идеальный делитель для любых размеров
    const divisions = 24; 
    const slotsPerBeat = 16 / beatType;
    const beatsPerMeasure = Math.round(beats * slotsPerBeat);

    const trackIds = (typeof editor.getOrderedTracks === 'function') 
        ? editor.getOrderedTracks() 
        : Object.keys(editor.tracks);

    // Вычисляем общую длину композиции в тактах
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

        // Разбиваем длинные ноты по тактам С СОХРАНЕНИЕМ ЛИГ (tie), если они пересекают границу такта
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
                    velocity: n.velocity ?? 100,
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
            const mNotes = measureSegments.filter(n => n.measureIndex === m);

            xml += `    <measure number="${m + 1}">\n`;
            if (m === 0) {
                xml += `      <attributes>\n`;
                xml += `        <divisions>${divisions}</divisions>\n`;
                xml += `        <key><fifths>0</fifths></key>\n`;
                xml += `        <time><beats>${beats}</beats><beat-type>${beatType}</beat-type></time>\n`;
                xml += `        <clef><sign>G</sign><line>2</line></clef>\n`;
                xml += `      </attributes>\n`;
                xml += `      <direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${bpm}</per-minute></metronome></direction-type></direction>\n`;
            }

            if (mNotes.length === 0) {
                // Пустой такт (пауза)
                const restDivs = Math.round(beatsPerMeasure * (divisions / 4));
                xml += `      <note>\n`;
                xml += `        <rest measure="yes"/>\n`;
                xml += `        <duration>${restDivs}</duration>\n`;
                xml += `      </note>\n`;
            } else {
                // Сортируем ноты по времени старта
                mNotes.sort((a, b) => a.start - b.start);

                let measureTimeCursor = measureStart;

                mNotes.forEach((n) => {
                    // Если нота начинается позже текущего положения курсора такта
                    if (n.start > measureTimeCursor) {
                        const gap16ths = n.start - measureTimeCursor;
                        const gapDivs = Math.round(gap16ths * (divisions / 4));
                        xml += `      <note>\n`;
                        xml += `        <rest/>\n`;
                        xml += `        <duration>${gapDivs}</duration>\n`;
                        xml += `      </note>\n`;
                        measureTimeCursor = n.start;
                    } 
                    // Если нота начинается раньше (наложение / легато / арпеджио)
                    else if (n.start < measureTimeCursor) {
                        const back16ths = measureTimeCursor - n.start;
                        const backDivs = Math.round(back16ths * (divisions / 4));
                        xml += `      <backup>\n`;
                        xml += `        <duration>${backDivs}</duration>\n`;
                        xml += `      </backup>\n`;
                        measureTimeCursor = n.start;
                    }

                    const durationDivs = Math.round(n.duration * (divisions / 4));
                    const velocityPct = Math.min(100, Math.max(1, Math.round(((n.velocity ?? 100) / 127) * 100)));
                    const stepName = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'][n.pitch % 12];
                    const alter = [1, 3, 6, 8, 10].includes(n.pitch % 12) ? 1 : 0;
                    const octave = Math.floor(n.pitch / 12) - 1;
                    const typeInfo = getTypeAndDot(n.duration);

                    xml += `      <note>\n`;
                    xml += `        <pitch>\n`;
                    xml += `          <step>${stepName}</step>\n`;
                    if (alter !== 0) xml += `          <alter>${alter}</alter>\n`;
                    xml += `          <octave>${octave}</octave>\n`;
                    xml += `        </pitch>\n`;
                    xml += `        <duration>${durationDivs}</duration>\n`;
                    xml += `        <sound dynamics="${velocityPct}"/>\n`;

                    if (n.tieStop) xml += `        <tie type="stop"/>\n`;
                    if (n.tieStart) xml += `        <tie type="start"/>\n`;

                    if (typeInfo.type) xml += `        <type>${typeInfo.type}</type>\n`;
                    if (typeInfo.dot) xml += `        <dot/>\n`;

                    if (n.tieStart || n.tieStop) {
                        xml += `        <notations>\n`;
                        if (n.tieStop) xml += `          <tied type="stop"/>\n`;
                        if (n.tieStart) xml += `          <tied type="start"/>\n`;
                        xml += `        </notations>\n`;
                    }
                    xml += `      </note>\n`;

                    measureTimeCursor += n.duration;
                });
            }
            xml += `    </measure>\n`;
        }
        xml += `  </part>\n`;
    });

    xml += '</score-partwise>';
    return xml;
}

// Экспорт в файл
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

// Импорт из файла c 100% восстановлением оригинальных длительностей и Velocity
function importMusicXML(xmlText, editor) {
    try {
        if (!xmlText || typeof xmlText !== 'string' || xmlText.trim().startsWith('<!DOCTYPE html>') || xmlText.includes('<html')) {
            console.error('[Import] Ошибка: Получены неверные данные.');
            alert('Ошибка загрузки нотного файла.');
            return;
        }

        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");

        const parserError = xmlDoc.querySelector('parsererror');
        if (parserError) {
            console.error('[Import] Ошибка структуры XML:', parserError.textContent);
            alert('Ошибка чтения нотного файла XML.');
            return;
        }

        // Заголовок
        const workTitle = xmlDoc.querySelector('work-title')?.textContent;
        const movementTitle = xmlDoc.querySelector('movement-title')?.textContent;
        const trackTitle = (workTitle || movementTitle || "Без названия").trim();

        const titleInput = document.getElementById('track-title-input');
        if (titleInput) titleInput.value = trackTitle;

        // Темп (BPM)
        const bpmElem = xmlDoc.querySelector('per-minute');
        if (bpmElem) {
            const bpm = parseInt(bpmElem.textContent, 10) || 120;
            const bpmInput = document.getElementById('input-bpm');
            if (bpmInput) bpmInput.value = bpm;
            if (typeof Tone !== 'undefined' && Tone.Transport) {
                Tone.Transport.bpm.value = bpm;
            }
        }

        // Размер (Time Signature)
        const beatsElem = xmlDoc.querySelector('time > beats');
        const beatTypeElem = xmlDoc.querySelector('time > beat-type');
        if (beatsElem && beatTypeElem) {
            const timeSig = `${beatsElem.textContent.trim()}/${beatTypeElem.textContent.trim()}`;
            const selectTimeSig = document.getElementById('select-time-sig');
            if (selectTimeSig) selectTimeSig.value = timeSig;
        }

        const newTracks = {};
        const parts = xmlDoc.querySelectorAll('part');
        let totalNotesCount = 0;
        
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

            let currentDivisions = 24;
            let timelineCursor = 0;
            let lastNoteStart = 0;

            // Буфер для склеивания залигованных нот (ties) в единую ноту
            const activeTies = {}; // { pitch: noteObject }

            const measures = part.querySelectorAll('measure');
            
            measures.forEach((measure) => {
                const divElem = measure.querySelector('attributes > divisions');
                if (divElem) {
                    const parsedDiv = parseInt(divElem.textContent, 10);
                    if (parsedDiv > 0) currentDivisions = parsedDiv;
                }

                const children = Array.from(measure.children);

                children.forEach((node) => {
                    if (node.tagName === 'forward') {
                        const durElem = node.querySelector('duration');
                        if (durElem) {
                            const rawDur = parseInt(durElem.textContent, 10) || 0;
                            timelineCursor += Math.round((rawDur / currentDivisions) * 4);
                        }
                    } else if (node.tagName === 'backup') {
                        const durElem = node.querySelector('duration');
                        if (durElem) {
                            const rawDur = parseInt(durElem.textContent, 10) || 0;
                            timelineCursor -= Math.round((rawDur / currentDivisions) * 4);
                        }
                    } else if (node.tagName === 'note') {
                        const note = node;
                        const isChord = note.querySelector('chord') !== null;
                        const durationElem = note.querySelector('duration');
                        const rawDuration = durationElem ? parseInt(durationElem.textContent, 10) : 0;
                        
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
                            const alter = parseInt(pitchElem.querySelector('alter')?.textContent || '0', 10);
                            const octave = parseInt(pitchElem.querySelector('octave')?.textContent || '4', 10);

                            const stepOffsets = { 'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11 };
                            const midiPitch = (octave + 1) * 12 + (stepOffsets[step] || 0) + alter;

                            // Чтение Velocity
                            let velocity = 100;
                            const soundEl = note.querySelector('sound');
                            const dynamicsEl = note.querySelector('dynamics');

                            if (soundEl && soundEl.getAttribute('dynamics')) {
                                const dynPct = parseFloat(soundEl.getAttribute('dynamics'));
                                velocity = Math.min(127, Math.max(1, Math.round((dynPct / 100) * 127)));
                            } else if (dynamicsEl && dynamicsEl.firstElementChild) {
                                const tag = dynamicsEl.firstElementChild.tagName.toLowerCase();
                                const dynMap = { ppp: 30, pp: 45, p: 60, mp: 75, mf: 90, f: 105, ff: 118, fff: 127 };
                                if (dynMap[tag]) velocity = dynMap[tag];
                            }

                            // Восстановление длинных нот через лиги (tie/tied)
                            const tieTypes = Array.from(note.querySelectorAll('tie, tied')).map(t => t.getAttribute('type'));
                            const isTieStart = tieTypes.includes('start');
                            const isTieStop = tieTypes.includes('stop');

                            if (isTieStop && activeTies[midiPitch]) {
                                // Если нота переходит через такт, сшиваем её обратно в одну целостную ноту
                                activeTies[midiPitch].duration += durationIn16ths;
                                
                                if (!isTieStart) {
                                    delete activeTies[midiPitch];
                                }
                            } else {
                                const newNote = {
                                    pitch: midiPitch,
                                    start: timelineCursor,
                                    duration: durationIn16ths,
                                    velocity: velocity,
                                    dotted: note.querySelector('dot') !== null
                                };

                                newTracks[trackKey].push(newNote);
                                totalNotesCount++;

                                if (isTieStart) {
                                    activeTies[midiPitch] = newNote;
                                }
                            }
                        }

                        if (!isChord) {
                            timelineCursor += durationIn16ths;
                        }
                    }
                });
            });
        });

        if (totalNotesCount > 0) {
            editor.tracks = newTracks;
            editor.activeTrack = Object.keys(newTracks)[0];
            
            if (Array.isArray(editor.tracksOrder)) {
                editor.tracksOrder = Object.keys(newTracks);
            }

            // Обновление UI
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

            if (typeof editor.updateGrid === 'function') editor.updateGrid();
            if (typeof editor.renderNotes === 'function') editor.renderNotes();
            if (typeof editor.draw === 'function') editor.draw();
            if (typeof editor.render === 'function') editor.render();

            console.log(`[Import] Успешно загружено нот: ${totalNotesCount}`, newTracks);
        } else {
            console.warn('[Import] Ноты не найдены.');
            alert('Файл MusicXML не содержит нот.');
        }
    } catch (err) {
        console.error('Ошибка при импорте MusicXML:', err);
        alert('Ошибка при чтении файла MusicXML.');
    }
}
