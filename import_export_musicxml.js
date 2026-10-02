/**
 * Модуль импорта и экспорта MusicXML для Piano Roll Editor
 * Обеспечивает 100% точное распределение нот произвольной длительности,
 * со слабых долей, через границы тактов (с лигами), полифонии,
 * аккордов и сохранение Velocity (громкости).
 */

// Карта соответствия MIDI-полутонов нотным шагам MusicXML
const PITCH_MAP = [
    { step: 'C', alter: 0 },  // 0
    { step: 'C', alter: 1 },  // 1
    { step: 'D', alter: 0 },  // 2
    { step: 'D', alter: 1 },  // 3
    { step: 'E', alter: 0 },  // 4
    { step: 'F', alter: 0 },  // 5
    { step: 'F', alter: 1 },  // 6
    { step: 'G', alter: 0 },  // 7
    { step: 'G', alter: 1 },  // 8
    { step: 'A', alter: 0 },  // 9
    { step: 'A', alter: 1 },  // 10
    { step: 'B', alter: 0 }   // 11
];

// Вспомогательная функция экранирования XML-символов
function escapeXml(unsafe) {
    if (!unsafe) return '';
    return unsafe.toString().replace(/[<>&'"]/g, function (c) {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
        }
    });
}

// Определение визуального типа ноты для MusicXML
function getNoteTypeAndDot(durationInSlots) {
    if (durationInSlots >= 16) return { type: 'whole', dot: false };
    if (durationInSlots >= 12) return { type: 'half', dot: true };
    if (durationInSlots >= 8)  return { type: 'half', dot: false };
    if (durationInSlots >= 6)  return { type: 'quarter', dot: true };
    if (durationInSlots >= 4)  return { type: 'quarter', dot: false };
    if (durationInSlots >= 3)  return { type: 'eighth', dot: true };
    if (durationInSlots >= 2)  return { type: 'eighth', dot: false };
    return { type: '16th', dot: false };
}

/**
 * ЭКСПОРТ В MUSICXML
 */
function buildMusicXMLString(editor, customTitle) {
    const bpm = document.getElementById('input-bpm')?.value || 120;
    const timeSigVal = document.getElementById('select-time-sig')?.value || '4/4';
    const [beatsStr, beatTypeStr] = timeSigVal.split('/');
    const beats = parseInt(beatsStr, 10) || 4;
    const beatType = parseInt(beatTypeStr, 10) || 4;

    const titleInput = document.getElementById('track-title-input');
    const trackTitle = customTitle || (titleInput && titleInput.value.trim()) || "Без названия";

    // 24 divisions на четверть -> 1 слот (1/16 нота) = 6 divisions
    const divisions = 24; 
    const slotsPerBeat = 16 / beatType;
    const slotsPerMeasure = Math.round(beats * slotsPerBeat);

    const trackIds = (typeof editor.getOrderedTracks === 'function') 
        ? editor.getOrderedTracks() 
        : Object.keys(editor.tracks || {});

    // Вычисляем максимальную длину композиции в слотах
    let maxEndSlot = 0;
    trackIds.forEach(key => {
        const trackNotes = editor.tracks[key] || [];
        trackNotes.forEach(note => {
            const noteEnd = note.start + note.duration;
            if (noteEnd > maxEndSlot) maxEndSlot = noteEnd;
        });
    });

    const totalMeasures = Math.max(1, Math.ceil(maxEndSlot / slotsPerMeasure));

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n`;
    xml += `<score-partwise version="4.0">\n`;
    xml += `  <work><work-title>${escapeXml(trackTitle)}</work-title></work>\n`;
    xml += `  <movement-title>${escapeXml(trackTitle)}</movement-title>\n`;
    
    xml += `  <part-list>\n`;
    let pId = 1;
    const activePartIds = {};
    trackIds.forEach(key => {
        const partId = `P${pId++}`;
        activePartIds[key] = partId;
        const name = editor.instrumentTypes[key]?.name || key;
        xml += `    <score-part id="${partId}">\n`;
        xml += `      <part-name>${escapeXml(name)}</part-name>\n`;
        xml += `    </score-part>\n`;
    });
    xml += `  </part-list>\n`;

    trackIds.forEach(key => {
        const partId = activePartIds[key];
        const rawNotes = editor.tracks[key] || [];

        // Разбиваем ноты произвольной длины по границам тактов с лигами (tie)
        const measureSegments = [];
        rawNotes.forEach(n => {
            let currStart = n.start;
            let remDuration = n.duration;

            while (remDuration > 0) {
                const mIndex = Math.floor(currStart / slotsPerMeasure);
                const measureStart = mIndex * slotsPerMeasure;
                const measureEnd = measureStart + slotsPerMeasure;
                const maxPossibleInMeasure = measureEnd - currStart;

                const segDuration = Math.min(remDuration, maxPossibleInMeasure);
                const hasTieStart = (remDuration > segDuration);
                const hasTieStop = (currStart > n.start);

                measureSegments.push({
                    pitch: n.pitch,
                    start: currStart,
                    duration: segDuration,
                    velocity: (n.velocity !== undefined && n.velocity !== null) ? n.velocity : 100,
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
            const mStart = m * slotsPerMeasure;
            const mEnd = (m + 1) * slotsPerMeasure;
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
                const restDivs = slotsPerMeasure * 6;
                xml += `      <note>\n`;
                xml += `        <rest measure="yes"/>\n`;
                xml += `        <duration>${restDivs}</duration>\n`;
                xml += `      </note>\n`;
            } else {
                // Сортируем ноты по времени их появления
                const startTimes = Array.from(new Set(mNotes.map(n => n.start))).sort((a, b) => a - b);
                let measureCursor = mStart;
                let maxTimeInMeasure = mStart;

                startTimes.forEach((t) => {
                    if (t > measureCursor) {
                        const gapSlots = t - measureCursor;
                        const gapDivs = gapSlots * 6;
                        xml += `      <note>\n`;
                        xml += `        <rest/>\n`;
                        xml += `        <duration>${gapDivs}</duration>\n`;
                        xml += `      </note>\n`;
                        measureCursor = t;
                    } else if (t < measureCursor) {
                        // Возврат каретки времени для полифонии
                        const backSlots = measureCursor - t;
                        const backDivs = backSlots * 6;
                        xml += `      <backup>\n`;
                        xml += `        <duration>${backDivs}</duration>\n`;
                        xml += `      </backup>\n`;
                        measureCursor = t;
                    }

                    // Сортируем ноты в одной точке времени по убыванию длительности,
                    // чтобы первая нота аккорда задавала корректный шаг каретки времени
                    const notesAtT = mNotes.filter(n => n.start === t).sort((a, b) => b.duration - a.duration);
                    let maxDurationAtT = 0;

                    notesAtT.forEach((n, idx) => {
                        const isChord = (idx > 0);
                        const durDivs = n.duration * 6;
                        if (n.duration > maxDurationAtT) maxDurationAtT = n.duration;
                        if (t + n.duration > maxTimeInMeasure) maxTimeInMeasure = t + n.duration;

                        const octave = Math.floor(n.pitch / 12) - 1;
                        const semitone = n.pitch % 12;
                        const pitchInfo = PITCH_MAP[semitone];
                        const typeInfo = getNoteTypeAndDot(n.duration);

                        // Перевод MIDI Velocity (0-127) в динамику MusicXML (0-100%)
                        const soundDynamics = Math.round((n.velocity / 127) * 100);

                        xml += `      <note>\n`;
                        if (isChord) {
                            xml += `        <chord/>\n`;
                        }
                        xml += `        <pitch>\n`;
                        xml += `          <step>${pitchInfo.step}</step>\n`;
                        if (pitchInfo.alter !== 0) {
                            xml += `          <alter>${pitchInfo.alter}</alter>\n`;
                        }
                        xml += `          <octave>${octave}</octave>\n`;
                        xml += `        </pitch>\n`;
                        xml += `        <duration>${durDivs}</duration>\n`;
                        xml += `        <voice>1</voice>\n`;
                        xml += `        <type>${typeInfo.type}</type>\n`;
                        if (typeInfo.dot) {
                            xml += `        <dot/>\n`;
                        }
                        if (n.tieStop) {
                            xml += `        <tie type="stop"/>\n`;
                        }
                        if (n.tieStart) {
                            xml += `        <tie type="start"/>\n`;
                        }
                        if (n.tieStop || n.tieStart) {
                            xml += `        <notations>\n`;
                            if (n.tieStop) xml += `          <tied type="stop"/>\n`;
                            if (n.tieStart) xml += `          <tied type="start"/>\n`;
                            xml += `        </notations>\n`;
                        }
                        xml += `        <sound dynamics="${soundDynamics}"/>\n`;
                        xml += `      </note>\n`;
                    });

                    measureCursor = t + maxDurationAtT;
                });

                // Выравнивание каретки до самого дальнего момента звучания нот в такте
                if (measureCursor < maxTimeInMeasure) {
                    const fwdSlots = maxTimeInMeasure - measureCursor;
                    const fwdDivs = fwdSlots * 6;
                    xml += `      <forward>\n`;
                    xml += `        <duration>${fwdDivs}</duration>\n`;
                    xml += `      </forward>\n`;
                    measureCursor = maxTimeInMeasure;
                }

                // Пауза до конца такта, если ни одна нота не звучит в конце такта
                if (measureCursor < mEnd) {
                    const remSlots = mEnd - measureCursor;
                    const remDivs = remSlots * 6;
                    xml += `      <note>\n`;
                    xml += `        <rest/>\n`;
                    xml += `        <duration>${remDivs}</duration>\n`;
                    xml += `      </note>\n`;
                }
            }

            xml += `    </measure>\n`;
        }

        xml += `  </part>\n`;
    });

    xml += `</score-partwise>\n`;
    return xml;
}

function exportMusicXML(editor, title) {
    const xmlContent = buildMusicXMLString(editor, title);
    const blob = new Blob([xmlContent], { type: 'application/vnd.recordare.musicxml+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const fileName = (title || document.getElementById('track-title-input')?.value || 'project') + '.musicxml';
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * ИМПОРТ ИЗ MUSICXML
 */
function importMusicXML(xmlString, editor) {
    if (!xmlString || typeof xmlString !== 'string') {
        alert('Ошибка: пустой или невалидный файл MusicXML.');
        return;
    }

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, 'text/xml');

    const parserError = xmlDoc.querySelector('parsererror');
    if (parserError) {
        alert('Ошибка парсинга MusicXML файла.');
        console.error(parserError.textContent);
        return;
    }

    // 1. Извлечение названия
    const title = xmlDoc.querySelector('work-title')?.textContent?.trim() || 
                  xmlDoc.querySelector('movement-title')?.textContent?.trim() || 
                  'Импортированный проект';
    const titleInput = document.getElementById('track-title-input');
    if (titleInput) titleInput.value = title;

    // 2. Извлечение темпа (BPM)
    const bpmEl = xmlDoc.querySelector('per-minute');
    if (bpmEl) {
        const bpm = parseInt(bpmEl.textContent, 10);
        if (bpm && bpm >= 20 && bpm <= 300) {
            const inputBpm = document.getElementById('input-bpm');
            if (inputBpm) inputBpm.value = bpm;
            if (window.Tone && Tone.Transport) Tone.Transport.bpm.value = bpm;
        }
    }

    // 3. Извлечение музыкального размера
    let beats = 4;
    let beatType = 4;
    const timeEl = xmlDoc.querySelector('time');
    if (timeEl) {
        const b = parseInt(timeEl.querySelector('beats')?.textContent, 10);
        const bt = parseInt(timeEl.querySelector('beat-type')?.textContent, 10);
        if (b) beats = b;
        if (bt) beatType = bt;
    }

    const timeSigSelect = document.getElementById('select-time-sig');
    if (timeSigSelect) {
        const targetVal = `${beats}/${beatType}`;
        const hasOption = Array.from(timeSigSelect.options).some(o => o.value === targetVal);
        if (hasOption) timeSigSelect.value = targetVal;
    }

    const slotsPerBeat = 16 / beatType;
    const slotsPerMeasure = Math.round(beats * slotsPerBeat);

    // 4. Парсинг партий
    const partMap = {};
    xmlDoc.querySelectorAll('score-part').forEach(sp => {
        const id = sp.getAttribute('id');
        const name = sp.querySelector('part-name')?.textContent?.trim() || `Инструмент ${id}`;
        partMap[id] = name;
    });

    const parts = xmlDoc.querySelectorAll('part');
    if (parts.length === 0) {
        alert('Музыкальные партии не найдены в файле MusicXML.');
        return;
    }

    if (typeof editor.saveState === 'function') {
        editor.saveState();
    }

    // Сбрасываем текущие треки редактора
    editor.tracks = {};
    editor.instrumentTypes = {};

    const defaultColors = [0x4A90E2, 0x9B59B6, 0xE67E22, 0x1ABC9C, 0xE74C3C, 0x34495E, 0xF1C40F, 0x2ECC71];
    let partCount = 0;

    parts.forEach((partNode) => {
        const pId = partNode.getAttribute('id');
        const trackId = 'inst_' + (partCount + 1) + '_' + Date.now();
        const partName = partMap[pId] || `Инструмент ${partCount + 1}`;
        const color = defaultColors[partCount % defaultColors.length];
        partCount++;

        editor.instrumentTypes[trackId] = {
            name: partName,
            color: color,
            volume: 100,
            muted: false
        };
        editor.tracks[trackId] = [];

        const measures = partNode.querySelectorAll('measure');
        let divisions = 24; // Делитель по умолчанию

        measures.forEach((measureNode, mIdx) => {
            const measureStartSlot = mIdx * slotsPerMeasure;
            let currentMeasureDivs = 0;
            let prevNoteMeasureDivs = 0;

            const children = Array.from(measureNode.children);

            children.forEach(child => {
                const tagName = child.tagName.toLowerCase();

                if (tagName === 'attributes') {
                    const divEl = child.querySelector('divisions');
                    if (divEl) {
                        const d = parseInt(divEl.textContent, 10);
                        if (d > 0) divisions = d;
                    }
                } else if (tagName === 'backup') {
                    const durEl = child.querySelector('duration');
                    if (durEl) {
                        const dur = parseInt(durEl.textContent, 10) || 0;
                        currentMeasureDivs = Math.max(0, currentMeasureDivs - dur);
                    }
                } else if (tagName === 'forward') {
                    const durEl = child.querySelector('duration');
                    if (durEl) {
                        const dur = parseInt(durEl.textContent, 10) || 0;
                        currentMeasureDivs += dur;
                    }
                } else if (tagName === 'note') {
                    const isRest = child.querySelector('rest') !== null;
                    const durEl = child.querySelector('duration');
                    const noteDivs = durEl ? (parseInt(durEl.textContent, 10) || 0) : 0;

                    if (isRest) {
                        currentMeasureDivs += noteDivs;
                    } else {
                        const pitchEl = child.querySelector('pitch');
                        if (pitchEl) {
                            const step = pitchEl.querySelector('step')?.textContent?.trim() || 'C';
                            const alter = parseInt(pitchEl.querySelector('alter')?.textContent || '0', 10);
                            const octave = parseInt(pitchEl.querySelector('octave')?.textContent || '4', 10);

                            const stepOffsets = { 'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11 };
                            const stepOffset = stepOffsets[step] ?? 0;
                            const pitch = (octave + 1) * 12 + stepOffset + alter;

                            const isChord = child.querySelector('chord') !== null;

                            let noteStartDivs;
                            if (isChord) {
                                noteStartDivs = prevNoteMeasureDivs;
                            } else {
                                noteStartDivs = currentMeasureDivs;
                                prevNoteMeasureDivs = currentMeasureDivs;
                                currentMeasureDivs += noteDivs;
                            }

                            // Точный расчёт позиций слотов с поддержкой произвольных длительностей
                            const startSlotFloat = measureStartSlot + (noteStartDivs / divisions) * 4;
                            const endSlotFloat = measureStartSlot + ((noteStartDivs + noteDivs) / divisions) * 4;

                            const startSlot = Math.round(startSlotFloat);
                            const endSlot = Math.round(endSlotFloat);
                            const durationSlots = Math.max(1, endSlot - startSlot);

                            // Извлечение динамики / Velocity
                            let velocity = 100;

                            // 1. Считывание атрибута <sound dynamics="...">
                            const soundEl = child.querySelector('sound');
                            if (soundEl && soundEl.hasAttribute('dynamics')) {
                                const dynAttr = parseFloat(soundEl.getAttribute('dynamics'));
                                if (!isNaN(dynAttr)) {
                                    velocity = dynAttr <= 100 ? Math.round((dynAttr / 100) * 127) : Math.min(127, Math.round(dynAttr));
                                }
                            } else {
                                // 2. Запасной вариант: текстовые динамические обозначения (ppp, mf, ff)
                                const dynamics = child.querySelector('dynamics');
                                if (dynamics) {
                                    const dynNode = dynamics.firstElementChild;
                                    if (dynNode) {
                                        const dynName = dynNode.tagName.toLowerCase();
                                        const dynMap = {
                                            'ppp': 30, 'pp': 45, 'p': 60, 'mp': 75,
                                            'mf': 90, 'f': 105, 'ff': 118, 'fff': 127
                                        };
                                        if (dynMap[dynName]) velocity = dynMap[dynName];
                                    }
                                }
                            }

                            const isTieStop = child.querySelector('tie[type="stop"]') !== null || 
                                              child.querySelector('tied[type="stop"]') !== null ||
                                              child.querySelector('tied[type="continue"]') !== null;

                            const currentTrackNotes = editor.tracks[trackId];
                            let merged = false;

                            // Если нота является продолжением лиги из прошлых тактов
                            if (isTieStop && currentTrackNotes.length > 0) {
                                let existing = null;
                                for (let i = currentTrackNotes.length - 1; i >= 0; i--) {
                                    const candidate = currentTrackNotes[i];
                                    if (candidate.pitch === pitch) {
                                        const candEnd = candidate.start + candidate.duration;
                                        // Допускаем допущение ±2 слота на погрешности округления
                                        if (Math.abs(candEnd - startSlot) <= 2) {
                                            existing = candidate;
                                            break;
                                        }
                                    }
                                }

                                if (existing) {
                                    existing.duration += durationSlots;
                                    merged = true;
                                }
                            }

                            if (!merged) {
                                currentTrackNotes.push({
                                    pitch: pitch,
                                    start: startSlot,
                                    duration: durationSlots,
                                    velocity: velocity,
                                    dotted: (durationSlots % 3 === 0)
                                });
                            }
                        }
                    }
                }
            });
        });
    });

    // Перерисовываем UI и ноты в редакторе
    if (typeof editor.renderInitialInstruments === 'function') {
        editor.renderInitialInstruments();
    }

    const firstTrackId = Object.keys(editor.tracks)[0];
    if (firstTrackId && typeof editor.selectTrack === 'function') {
        editor.selectTrack(firstTrackId);
    }

    if (typeof editor.updateGrid === 'function') editor.updateGrid();
    if (typeof editor.renderNotes === 'function') editor.renderNotes();
    if (typeof editor.scrollToFirstOctave === 'function') editor.scrollToFirstOctave();
}
