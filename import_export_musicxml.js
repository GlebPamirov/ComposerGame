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
	let title = customTitle;
    
    if (!title) {
        if (editor && typeof editor.getFormattedProjectTitle === 'function') {
            title = editor.getFormattedProjectTitle();
        } else {
            title = document.getElementById('track-title-input')?.value?.trim() || 'Untitled';
        }
    }
    
    const bpm = document.getElementById('input-bpm')?.value || 120;
    const timeSigVal = document.getElementById('select-time-sig')?.value || '4/4';
    const [beatsStr, beatTypeStr] = timeSigVal.split('/');
    const beats = parseInt(beatsStr, 10) || 4;
    const beatType = parseInt(beatTypeStr, 10) || 4;

    // Используем сформированный заголовок с именем пользователя
    const trackTitle = getFormattedMusicTitle(editor, customTitle);

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
    const formattedTitle = getFormattedMusicTitle(editor, title);

    // Сборка XML
    const xmlContent = buildMusicXMLString(editor, formattedTitle);

    // Скачивание файла
    const blob = new Blob([xmlContent], { type: 'application/vnd.recordare.musicxml+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;

    a.download = `${formattedTitle}.musicxml`;
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

function getFormattedMusicTitle(editor, fallbackTitle) {
    let rawTitle = fallbackTitle || document.getElementById('track-title-input')?.value?.trim() || 'Untitled';
    let userName = '';

    // 1. Проверяем сервис авторизации userService
    if (typeof userService !== 'undefined' && userService && userService.currentUser && userService.currentUser.name) {
        userName = userService.currentUser.name;
    }
    // 2. Проверяем глобальную переменную currentUser
    else if (typeof currentUser !== 'undefined' && currentUser && currentUser.name) {
        userName = currentUser.name;
    } 
    // 3. Читаем из localStorage ключ 'app_user', который использует ваш user_2.js
    else {
        try {
            const savedUser = JSON.parse(localStorage.getItem('app_user'));
            if (savedUser && savedUser.name) {
                userName = savedUser.name;
            }
        } catch (e) {
            // Если там лежала обычная строка, а не JSON
            userName = localStorage.getItem('app_user') || localStorage.getItem('daw_auth_user_name') || '';
        }
    }

    userName = userName ? userName.trim() : '';

    // Если имя отсутствует или равно "Гость", оставляем только базовое название
    if (!userName || userName.toLowerCase() === 'гость') {
        return rawTitle;
    }

    // Избегаем дублирования, если "Имя - " уже есть в начале
    if (rawTitle.startsWith(`${userName} - `)) {
        return rawTitle;
    }

    return `${userName} - ${rawTitle}`;
}

/**
 * ЭКСПОРТ В MP3
 */
async function exportAudioMP3(editor) {
    if (!editor || !editor.tracks) {
        alert('Ошибка: Не найдены данные проекта.');
        return;
    }

    // Убедимся, что Tone.js запущен
    if (Tone.context.state !== 'running') {
        await Tone.start();
    }

    // 1. Вычисляем длительность
    const bpm = parseInt(document.getElementById('input-bpm')?.value || 120, 10);
    const timeSigVal = document.getElementById('select-time-sig')?.value || '4/4';
    const beatType = parseInt(timeSigVal.split('/')[1], 10) || 4;

    const secondsPerSlot = (60 / bpm) / (16 / beatType);

    let maxEndSlot = 0;
    Object.keys(editor.tracks).forEach(trackKey => {
        const notes = editor.tracks[trackKey] || [];
        notes.forEach(note => {
            const endSlot = note.start + note.duration;
            if (endSlot > maxEndSlot) maxEndSlot = endSlot;
        });
    });

    if (maxEndSlot === 0) {
        alert('Проект пуст! Добавьте ноты перед экспортом.');
        return;
    }

    const renderDuration = (maxEndSlot * secondsPerSlot) + 2.0;

    // --- 2. Создание всплывающего окна экспорта ---
    let modalOverlay = document.getElementById('mp3-export-modal');
    if (!modalOverlay) {
        modalOverlay = document.createElement('div');
        modalOverlay.id = 'mp3-export-modal';
        modalOverlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0, 0, 0, 0.75); backdrop-filter: blur(4px);
            display: flex; align-items: center; justify-content: center;
            z-index: 10000; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        `;
        modalOverlay.innerHTML = `
            <div style="background: #252526; border: 1px solid #3c3c3c; border-radius: 8px; padding: 24px 30px; width: 380px; box-shadow: 0 10px 30px rgba(0,0,0,0.7); color: #cccccc; text-align: center;">
                <h3 id="mp3-export-status" style="margin: 0 0 15px 0; font-size: 16px; color: #4A90E2; font-weight: 600;">Подготовка к экспорту...</h3>
                <div style="width: 100%; background: #1e1e1e; height: 10px; border-radius: 5px; overflow: hidden; margin-bottom: 12px; border: 1px solid #333;">
                    <div id="mp3-export-progressbar" style="width: 0%; height: 100%; background: linear-gradient(90deg, #3498db, #2ecc71); transition: width 0.2s ease;"></div>
                </div>
                <p id="mp3-export-detail" style="margin: 0; font-size: 12px; color: #888888;">Пожалуйста, подождите</p>
            </div>
        `;
        document.body.appendChild(modalOverlay);
    } else {
        modalOverlay.style.display = 'flex';
    }

    const statusTitle = document.getElementById('mp3-export-status');
    const progressBar = document.getElementById('mp3-export-progressbar');
    const statusDetail = document.getElementById('mp3-export-detail');

    const updateProgress = (percent, statusText, detailText) => {
        if (progressBar) progressBar.style.width = `${percent}%`;
        if (statusTitle) statusTitle.textContent = statusText;
        if (statusDetail) statusDetail.textContent = detailText;
    };

    updateProgress(10, 'Рендеринг аудио...', 'Идет обработка треков и синтез звука...');

    try {
        await new Promise(res => setTimeout(res, 100));

        // 3. Offline-рендеринг
        const buffer = await Tone.Offline(async ({ transport }) => {
            const offlineReverb = new Tone.Reverb({ decay: 1.5, wet: 0.3 }).toDestination();
            
            const offlineSynth = new Tone.Sampler({
                urls: {
                    A1: "A1.mp3", C3: "C3.mp3", C4: "C4.mp3",
                    A4: "A4.mp3", C5: "C5.mp3", C6: "C6.mp3", A6: "A6.mp3"
                },
                baseUrl: "https://tonejs.github.io/audio/salamander/"
            }).connect(offlineReverb);

            await Tone.loaded();

            Object.keys(editor.tracks).forEach(trackKey => {
                const trackInst = editor.instrumentTypes[trackKey];
                if (trackInst && trackInst.muted) return;
                if (trackKey === 'harmony' && editor.harmonyManager && editor.harmonyManager.isMuted) return;

                const trackVolumeFactor = trackInst ? (trackInst.volume ?? 100) / 100 : 1.0;
                const notes = editor.tracks[trackKey] || [];

                notes.forEach(note => {
                    const startTime = note.start * secondsPerSlot;
                    const durationTime = note.duration * secondsPerSlot;
                    const freq = Tone.Frequency(note.pitch, "midi").toNote();
                    const finalVel = ((note.velocity || 100) / 127) * trackVolumeFactor;

                    offlineSynth.triggerAttackRelease(freq, durationTime, startTime, finalVel);
                });
            });

            transport.bpm.value = bpm;
            transport.start(0);
        }, renderDuration);

        updateProgress(60, 'Кодирование в MP3...', 'Сжатие аудиопотока...');
        await new Promise(res => setTimeout(res, 80));

        // 4. Кодирование lamejs
        const mp3Blob = encodeAudioBufferToMp3(buffer.get());

        updateProgress(100, 'Готово!', 'Скачивание файла...');

        // 5. Имя файла с автором в начале (используем единую функцию)
        const formattedTitle = getFormattedMusicTitle(editor);
        const fileName = `${formattedTitle}.mp3`;

        const url = URL.createObjectURL(mp3Blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

    } catch (err) {
        console.error('Ошибка при экспорте MP3:', err);
        alert('Произошла ошибка при экспорте в MP3.');
    } finally {
        setTimeout(() => {
            if (modalOverlay) modalOverlay.style.display = 'none';
        }, 600);
    }
}

/**
 * Вспомогательная функция кодирования AudioBuffer в MP3 Blob через lamejs
 */
function encodeAudioBufferToMp3(audioBuffer) {
    const channels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const kbps = 192; // Битрейт MP3

    const mp3encoder = new lamejs.Mp3Encoder(channels, sampleRate, kbps);
    const mp3Data = [];

    const sampleLength = audioBuffer.length;
    const leftChannel = audioBuffer.getChannelData(0);
    const rightChannel = channels > 1 ? audioBuffer.getChannelData(1) : leftChannel;

    // Переводим Float32 (-1.0...1.0) в Int16 (-32768...32767)
    const samplesLeft = new Int16Array(sampleLength);
    const samplesRight = new Int16Array(sampleLength);

    for (let i = 0; i < sampleLength; i++) {
        let sL = Math.max(-1, Math.min(1, leftChannel[i]));
        samplesLeft[i] = sL < 0 ? sL * 0x8000 : sL * 0x7FFF;

        let sR = Math.max(-1, Math.min(1, rightChannel[i]));
        samplesRight[i] = sR < 0 ? sR * 0x8000 : sR * 0x7FFF;
    }

    // Кодируем частями по 1152 сэмпла
    const sampleBlockSize = 1152;
    for (let i = 0; i < sampleLength; i += sampleBlockSize) {
        const leftChunk = samplesLeft.subarray(i, i + sampleBlockSize);
        const rightChunk = samplesRight.subarray(i, i + sampleBlockSize);

        let mp3buf;
        if (channels === 2) {
            mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
        } else {
            mp3buf = mp3encoder.encodeBuffer(leftChunk);
        }

        if (mp3buf.length > 0) {
            mp3Data.push(mp3buf);
        }
    }

    // Завершаем кодирование и сбрасываем буфер
    const mp3buf = mp3encoder.flush();
    if (mp3buf.length > 0) {
        mp3Data.push(mp3buf);
    }

    return new Blob(mp3Data, { type: 'audio/mp3' });
}


// Запасной генератор WAV Blob
function audioBufferToWavBlob(buffer) {
    const numOfChan = buffer.numberOfChannels;
    const length = buffer.length * numOfChan * 2 + 44;
    const out = new DataView(new ArrayBuffer(length));
    let channels = [], sampleRate = buffer.sampleRate, offset = 0, pos = 0;

    function setUint16(data) { out.setUint16(pos, data, true); pos += 2; }
    function setUint32(data) { out.setUint32(pos, data, true); pos += 4; }

    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8); // file length - 8
    setUint32(0x45564157); // "WAVE"
    setUint32(0x20746d66); // "fmt " chunk
    setUint32(16);         // length = 16
    setUint16(1);          // PCM (uncompressed)
    setUint16(numOfChan);
    setUint32(sampleRate);
    setUint32(sampleRate * 2 * numOfChan);
    setUint16(numOfChan * 2);
    setUint16(16);         // 16-bit
    setUint32(0x61746164); // "data" chunk
    setUint32(length - pos - 4);

    for (let i = 0; i < buffer.numberOfChannels; i++) channels.push(buffer.getChannelData(i));

    while (pos < length) {
        for (let i = 0; i < numOfChan; i++) {
            let sample = Math.max(-1, Math.min(1, channels[i][offset]));
            sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
            out.setInt16(pos, sample, true);
            pos += 2;
        }
        offset++;
    }

    return new Blob([out], { type: 'audio/wav' });
}

/**
 * ЭКСПОРТ MIDI ЧЕРЕЗ КОНВЕРТАЦИЮ ИМПОРТИРОВАННОГО/БИЛДИРОВАННОГО MUSICXML
 */
/**
 * ЭКСПОРТ MIDI
 */
function exportMIDI(editor, title) {
    // Получаем гарантированно правильно сформированное имя
    const formattedTitle = getFormattedMusicTitle(editor, title);

    // 1. Создаем строковое представление MusicXML
    const xmlContent = buildMusicXMLString(editor, formattedTitle);
    
    // 2. Конвертируем строку MusicXML в MIDI файл
    const midiBytes = convertMusicXMLToMIDI(xmlContent);

    // 3. Отправляем пользователю на скачивание
    const blob = new Blob([midiBytes], { type: 'audio/midi' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;

    // Формируем имя .mid файла
    a.download = `${formattedTitle}.mid`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Алгоритм конвертации MusicXML в бинарный MIDI ( Стандарт MIDI Format 1 )
function convertMusicXMLToMIDI(xmlString) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, 'text/xml');

    let bpm = 120;
    const bpmEl = xmlDoc.querySelector('per-minute');
    if (bpmEl) {
        const parsedBpm = parseInt(bpmEl.textContent, 10);
        if (parsedBpm) bpm = parsedBpm;
    }

    const parts = xmlDoc.querySelectorAll('part');
    const ticksPerQuarter = 480;

    // Вспомогательные методы записи VLQ (Variable Length Quantity) и мета-событий MIDI
    function writeVLQ(val) {
        let buffer = [];
        let v = val;
        let b = v & 0x7F;
        v >>= 7;
        buffer.push(b);
        while (v > 0) {
            b = (v & 0x7F) | 0x80;
            buffer.push(b);
            v >>= 7;
        }
        return buffer.reverse();
    }

    const tracksData = [];

    // Трек 0: Мета-трек с темпом
    const headerTrack = [];
    // Delta time 0
    headerTrack.push(0x00);
    // Tempo Meta Event: FF 51 03 [microseconds per quarter note]
    const mpqn = Math.round(60000000 / bpm);
    headerTrack.push(0xFF, 0x51, 0x03);
    headerTrack.push((mpqn >> 16) & 0xFF, (mpqn >> 8) & 0xFF, mpqn & 0xFF);
    // End of Track
    headerTrack.push(0x00, 0xFF, 0x2F, 0x00);
    tracksData.push(headerTrack);

    // Обработка каждой партии MusicXML в отдельный трек MIDI
    parts.forEach((partNode, partIdx) => {
        const events = []; // { tick, type: 'on'|'off', pitch, vel }
        const measures = partNode.querySelectorAll('measure');
        let currentTick = 0;
        let divisions = 24;

        measures.forEach((mNode) => {
            let mDivisionsCursor = 0;
            let chordStartDivs = 0;

            Array.from(mNode.children).forEach(child => {
                const tag = child.tagName.toLowerCase();

                if (tag === 'attributes') {
                    const divEl = child.querySelector('divisions');
                    if (divEl) {
                        const d = parseInt(divEl.textContent, 10);
                        if (d > 0) divisions = d;
                    }
                } else if (tag === 'backup') {
                    const dur = parseInt(child.querySelector('duration')?.textContent || '0', 10);
                    mDivisionsCursor = Math.max(0, mDivisionsCursor - dur);
                } else if (tag === 'forward') {
                    const dur = parseInt(child.querySelector('duration')?.textContent || '0', 10);
                    mDivisionsCursor += dur;
                } else if (tag === 'note') {
                    const isRest = child.querySelector('rest') !== null;
                    const durDivs = parseInt(child.querySelector('duration')?.textContent || '0', 10);
                    const isChord = child.querySelector('chord') !== null;

                    if (isRest) {
                        mDivisionsCursor += durDivs;
                    } else {
                        const pitchEl = child.querySelector('pitch');
                        if (pitchEl) {
                            const step = pitchEl.querySelector('step')?.textContent?.trim() || 'C';
                            const alter = parseInt(pitchEl.querySelector('alter')?.textContent || '0', 10);
                            const octave = parseInt(pitchEl.querySelector('octave')?.textContent || '4', 10);

                            const stepOffsets = { 'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11 };
                            const pitch = (octave + 1) * 12 + (stepOffsets[step] ?? 0) + alter;

                            let noteStartDivs = isChord ? chordStartDivs : mDivisionsCursor;
                            if (!isChord) {
                                chordStartDivs = mDivisionsCursor;
                                mDivisionsCursor += durDivs;
                            }

                            const startTick = Math.round(currentTick + (noteStartDivs / divisions) * ticksPerQuarter);
                            const durTicks = Math.round((durDivs / divisions) * ticksPerQuarter);

                            let vel = 100;
                            const soundEl = child.querySelector('sound');
                            if (soundEl && soundEl.hasAttribute('dynamics')) {
                                const dyn = parseFloat(soundEl.getAttribute('dynamics'));
                                if (!isNaN(dyn)) vel = Math.round((dyn / 100) * 127);
                            }

                            events.push({ tick: startTick, type: 'on', pitch, vel });
                            events.push({ tick: startTick + durTicks, type: 'off', pitch, vel: 0 });
                        }
                    }
                }
            });

            // Корректируем смещение времени начала следующего такта
            const measureTicks = Math.round((mDivisionsCursor / divisions) * ticksPerQuarter);
            currentTick += measureTicks;
        });

        // Сортируем события по тикам
        events.sort((a, b) => a.tick - b.tick);

        // Генерация MIDI-потока байт для трека
        const trackBytes = [];
        let lastTick = 0;
        const channel = partIdx % 16;

        events.forEach(evt => {
            const delta = evt.tick - lastTick;
            lastTick = evt.tick;

            trackBytes.push(...writeVLQ(delta));

            if (evt.type === 'on') {
                trackBytes.push(0x90 | channel, evt.pitch & 0x7F, evt.vel & 0x7F);
            } else {
                trackBytes.push(0x80 | channel, evt.pitch & 0x7F, 0x00);
            }
        });

        // Конец трека Meta Event
        trackBytes.push(0x00, 0xFF, 0x2F, 0x00);
        tracksData.push(trackBytes);
    });

    // Сборка полного бинарного массива MIDI-файла
    const headerChunk = [
        0x4D, 0x54, 0x68, 0x64, // "MThd"
        0x00, 0x00, 0x00, 0x06, // Длина заголовка = 6
        0x00, 0x01,             // Формат 1 (несколько треков)
        (tracksData.length >> 8) & 0xFF, tracksData.length & 0xFF, // Количество треков
        (ticksPerQuarter >> 8) & 0xFF, ticksPerQuarter & 0xFF      // Разрешение (TPQN)
    ];

    let totalLen = headerChunk.length;
    tracksData.forEach(tr => {
        totalLen += 8 + tr.length; // 4 байта "MTrk" + 4 байта длины + данные
    });

    const finalMidi = new Uint8Array(totalLen);
    finalMidi.set(headerChunk, 0);

    let offset = headerChunk.length;
    tracksData.forEach(tr => {
        // Заголовок "MTrk"
        finalMidi.set([0x4D, 0x54, 0x72, 0x6B], offset);
        offset += 4;
        
        // Длина трека
        const len = tr.length;
        finalMidi.set([
            (len >> 24) & 0xFF,
            (len >> 16) & 0xFF,
            (len >> 8) & 0xFF,
            len & 0xFF
        ], offset);
        offset += 4;

        // Данные трека
        finalMidi.set(tr, offset);
        offset += len;
    });

    return finalMidi;
}

/**
 * ИМПОРТ ИЗ MIDI (Бинарный файл .mid / .midi)
 * Парсит бинарный поток MIDI Format 0/1 и распределяет ноты по дорожкам.
 * 
 * @param {ArrayBuffer} arrayBuffer - Содержимое загруженного файла .mid
 * @param {PianoRoll} editor - Экземпляр редактора Piano Roll
 */
function importMIDI(arrayBuffer, editor) {
    if (!arrayBuffer || !(arrayBuffer instanceof ArrayBuffer)) {
        alert('Ошибка: невалидный файл MIDI.');
        return;
    }

    const data = new DataView(arrayBuffer);
    let offset = 0;

    // Чтение строк/тегов ASCII
    function readString(len) {
        let str = '';
        for (let i = 0; i < len; i++) {
            str += String.fromCharCode(data.getUint8(offset++));
        }
        return str;
    }

    // Чтение Variable Length Quantity (VLQ)
    function readVLQ() {
        let value = 0;
        let byte;
        do {
            byte = data.getUint8(offset++);
            value = (value << 7) | (byte & 0x7F);
        } while (byte & 0x80);
        return value;
    }

    // 1. Парсинг заголовка MThd
    const headerChunk = readString(4);
    if (headerChunk !== 'MThd') {
        alert('Ошибка: файл не является стандартным MIDI-файлом.');
        return;
    }

    const headerLength = data.getUint32(offset); offset += 4;
    const format = data.getUint16(offset); offset += 2;
    const numTracks = data.getUint16(offset); offset += 2;
    const timeDivision = data.getUint16(offset); offset += 2;

    // Пропуск дополнительных байтов заголовка, если есть
    if (headerLength > 6) {
        offset += (headerLength - 6);
    }

    // Расчет тиков на четвертную ноту (TPQN)
    let ticksPerQuarter = 480;
    if ((timeDivision & 0x8000) === 0) {
        ticksPerQuarter = timeDivision;
    }

    let detectedBpm = 120;
    const tracksEvents = [];

    // 2. Чтение треков MTrk
    for (let i = 0; i < numTracks; i++) {
        if (offset >= data.byteLength) break;
        
        const trackChunk = readString(4);
        if (trackChunk !== 'MTrk') {
            break;
        }

        const trackLength = data.getUint32(offset); offset += 4;
        const trackEndOffset = offset + trackLength;
        
        let currentTick = 0;
        let runningStatus = 0;
        const events = [];
        let trackName = `Трек ${i + 1}`;

        while (offset < trackEndOffset && offset < data.byteLength) {
            const deltaTime = readVLQ();
            currentTick += deltaTime;

            let byte = data.getUint8(offset);

            if (byte === 0xFF) { // Meta Event
                offset++;
                const metaType = data.getUint8(offset++);
                const metaLen = readVLQ();

                if (metaType === 0x51 && metaLen === 3) { // Set Tempo
                    const mpqn = (data.getUint8(offset) << 16) | (data.getUint8(offset + 1) << 8) | data.getUint8(offset + 2);
                    if (mpqn > 0) {
                        detectedBpm = Math.round(60000000 / mpqn);
                    }
                } else if (metaType === 0x03) { // Track Name
                    let name = '';
                    for (let n = 0; n < metaLen; n++) {
                        name += String.fromCharCode(data.getUint8(offset + n));
                    }
                    if (name.trim()) trackName = name.trim();
                }

                offset += metaLen;
                runningStatus = 0;
            } else if (byte === 0xF0 || byte === 0xF7) { // SysEx Event
                offset++;
                const sysExLen = readVLQ();
                offset += sysExLen;
                runningStatus = 0;
            } else { // MIDI Event
                if ((byte & 0x80) === 0) {
                    byte = runningStatus; // Использование Running Status
                } else {
                    offset++;
                    runningStatus = byte;
                }

                const eventType = byte & 0xF0;
                const channel = byte & 0x0F;

                if (eventType === 0x90) { // Note On
                    const pitch = data.getUint8(offset++);
                    const vel = data.getUint8(offset++);
                    events.push({
                        tick: currentTick,
                        type: vel > 0 ? 'on' : 'off',
                        pitch,
                        vel,
                        channel
                    });
                } else if (eventType === 0x80) { // Note Off
                    const pitch = data.getUint8(offset++);
                    const vel = data.getUint8(offset++);
                    events.push({
                        tick: currentTick,
                        type: 'off',
                        pitch,
                        vel: 0,
                        channel
                    });
                } else if (eventType === 0xA0 || eventType === 0xB0 || eventType === 0xE0) {
                    offset += 2;
                } else if (eventType === 0xC0 || eventType === 0xD0) {
                    offset += 1;
                }
            }
        }

        if (events.length > 0) {
            tracksEvents.push({ name: trackName, events });
        }
        offset = trackEndOffset; // Корректировка смещения
    }

    if (tracksEvents.length === 0) {
        alert('В MIDI-файле не найдено нотных событий.');
        return;
    }

    // 3. Применение параметров проекта (BPM и музыкальный размер)
    const bpmInput = document.getElementById('input-bpm');
    if (bpmInput) bpmInput.value = detectedBpm;
    if (window.Tone && Tone.Transport) Tone.Transport.bpm.value = detectedBpm;

    const timeSigVal = document.getElementById('select-time-sig')?.value || '4/4';
    const beatType = parseInt(timeSigVal.split('/')[1], 10) || 4;

    // 1 четвертная нота = (16 / beatType) слотов сетки Piano Roll (4 слота при 4/4)
    const slotsPerQuarter = 16 / beatType;

    // Сохранение состояния для возможности отмены (Undo)
    if (typeof editor.saveState === 'function') {
        editor.saveState();
    }

    // Сброс текущих дорожек
    editor.tracks = {};
    editor.instrumentTypes = {};

    const defaultColors = [0x4A90E2, 0x9B59B6, 0xE67E22, 0x1ABC9C, 0xE74C3C, 0x34495E, 0xF1C40F, 0x2ECC71];
    let createdTrackCount = 0;

    // 4. Преобразование MIDI-событий в ноты Piano Roll
    tracksEvents.forEach((trData) => {
        const trackNotes = [];
        const activeNotes = {}; // Отслеживание зажатых нот: pitch -> { startTick, vel }

        trData.events.forEach(evt => {
            if (evt.type === 'on') {
                // Если нота уже была зажата — закрываем предыдущую
                if (activeNotes[evt.pitch]) {
                    const prev = activeNotes[evt.pitch];
                    const startSlot = Math.round((prev.startTick / ticksPerQuarter) * slotsPerQuarter);
                    const endSlot = Math.round((evt.tick / ticksPerQuarter) * slotsPerQuarter);
                    const dur = Math.max(1, endSlot - startSlot);

                    trackNotes.push({
                        pitch: evt.pitch,
                        start: startSlot,
                        duration: dur,
                        velocity: prev.vel,
                        dotted: (dur % 3 === 0)
                    });
                }
                activeNotes[evt.pitch] = { startTick: evt.tick, vel: evt.vel };
            } else if (evt.type === 'off') {
                if (activeNotes[evt.pitch]) {
                    const prev = activeNotes[evt.pitch];
                    const startSlot = Math.round((prev.startTick / ticksPerQuarter) * slotsPerQuarter);
                    const endSlot = Math.round((evt.tick / ticksPerQuarter) * slotsPerQuarter);
                    const dur = Math.max(1, endSlot - startSlot);

                    trackNotes.push({
                        pitch: evt.pitch,
                        start: startSlot,
                        duration: dur,
                        velocity: prev.vel,
                        dotted: (dur % 3 === 0)
                    });

                    delete activeNotes[evt.pitch];
                }
            }
        });

        // Завершение оставшихся открытых нот
        Object.keys(activeNotes).forEach(pitchKey => {
            const pitch = parseInt(pitchKey, 10);
            const prev = activeNotes[pitch];
            const startSlot = Math.round((prev.startTick / ticksPerQuarter) * slotsPerQuarter);
            const dur = 4; // Длительность по умолчанию при отсутствии Note Off

            trackNotes.push({
                pitch: pitch,
                start: startSlot,
                duration: dur,
                velocity: prev.vel,
                dotted: false
            });
        });

        if (trackNotes.length > 0) {
            const trackId = 'inst_' + (createdTrackCount + 1) + '_' + Date.now();
            const color = defaultColors[createdTrackCount % defaultColors.length];

            editor.instrumentTypes[trackId] = {
                name: trData.name || `Дорожка ${createdTrackCount + 1}`,
                color: color,
                volume: 100,
                muted: false
            };
            editor.tracks[trackId] = trackNotes;
            createdTrackCount++;
        }
    });

    // 5. Перерисовка интерфейса
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
