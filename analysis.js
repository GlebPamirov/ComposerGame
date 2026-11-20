/**
 * Модуль анализа гармонии: analysis.js
 */

class HarmonyAnalyzer {
    constructor(editor) {
        this.editor = editor;
    }

    /**
     * Универсальный алгоритм анализа гармонии для произвольного количества нот.
     * @param {Array<Object|number>} notes - Массив нот (объектов с свойством pitch или MIDI-чисел)
     * @returns {Object} Результат анализа: root, scaleKey, confidence, extraPitches
     */
    analyzeHarmony(notes) {
        if (!notes || notes.length === 0) {
            return { root: 0, scaleKey: 'major', confidence: 0, extraPitches: [] };
        }

        // Извлекаем уникальные звуковысотные классы (0-11)
        const pitches = notes.map(n => (typeof n === 'number' ? n : n.pitch));
        const pitchClasses = Array.from(new Set(pitches.map(p => (p % 12 + 12) % 12)));

        let bestMatch = {
            root: 0,
            scaleKey: 'major',
            score: - Infinity,
            matchedCount: 0,
            outOfScaleCount: 999
        };

        // Перебор всех 12 основных тонов и всех ладов из HARMONY_SCALES
        for (let root = 0; root < 12; root++) {
            for (const [scaleKey, scaleData] of Object.entries(HARMONY_SCALES)) {
                const scaleIntervals = scaleData.intervals;
                const activeScalePitches = scaleIntervals.map(i => (root + i) % 12);

                let matchedCount = 0;
                let outOfScaleCount = 0;
                let primaryDegreesWeight = 0; // Дополнительный вес для I, IV, V ступеней

                pitchClasses.forEach(pc => {
                    if (activeScalePitches.includes(pc)) {
                        matchedCount++;
                        const interval = (pc - root + 12) % 12;
                        // Главные опорные ступени: I (0), IV (5), V (7)
                        if (interval === 0 || interval === 5 || interval === 7) {
                            primaryDegreesWeight += 1.5;
                        }
                    } else {
                        outOfScaleCount++;
                    }
                });

                // Формула оценки совпадения
                const coverage = matchedCount / pitchClasses.length;
                const score = (matchedCount * 4) - (outOfScaleCount * 5) + primaryDegreesWeight + (coverage * 3);

                if (score > bestMatch.score || 
                   (score === bestMatch.score && outOfScaleCount < bestMatch.outOfScaleCount)) {
                    bestMatch = {
                        root,
                        scaleKey,
                        score,
                        matchedCount,
                        outOfScaleCount
                    };
                }
            }
        }

        // Поиск дополнительных / альтерированных нот (вне звукоряда)
        const matchedScaleConfig = HARMONY_SCALES[bestMatch.scaleKey];
        const scalePitches = matchedScaleConfig 
            ? matchedScaleConfig.intervals.map(i => (bestMatch.root + i) % 12) 
            : [];
        const extraPitches = pitchClasses.filter(pc => !scalePitches.includes(pc));

        return {
            root: bestMatch.root,
            scaleKey: bestMatch.scaleKey,
            scaleName: matchedScaleConfig ? matchedScaleConfig.name : '',
            extraPitches: extraPitches,
            confidence: Math.round(Math.max(0, Math.min(100, (bestMatch.matchedCount / pitchClasses.length) * 100)))
        };
    }

    /**
     * Определение цвета ноты в зависимости от ее роли в выбранном ладу.
     * @param {number} pitch - MIDI-высота ноты
     * @param {number} root - Основной тон (0-11)
     * @param {string} scaleKey - Ключ лада из HARMONY_SCALES
     * @returns {number} HEX-код цвета для PIXI Graphics
     */
    getNoteColorInScale(pitch, root, scaleKey) {
        const scaleConfig = HARMONY_SCALES[scaleKey] || HARMONY_SCALES['major'];
        const notePc = (pitch % 12 + 12) % 12;
        const interval = (notePc - root + 12) % 12;

        const isInScale = scaleConfig.intervals.includes(interval);

        // 1. Звуки вне звукоряда -> Красный
        if (!isInScale) {
            return 0xE74C3C; 
        }

        // 2. Основные ступени (I = 0, IV = 5, V = 7) -> Зеленый
        if (interval === 0 || interval === 5 || interval === 7) {
            return 0x2ECC71; 
        }

        // 3. Остальные ступени лада -> Белый
        return 0xFFFFFF; 
    }
	
	/**
     * Реестр типов склада / фактурного изложения.
     * ПРОСТРАНСТВО ДЛЯ РАСШИРЕНИЯ: добавляйте новые виды фактуры сюда
     * (например: polyphony, homophony, arpeggio, pedal_point и т.д.)
     */
    static get TEXTURE_TYPES() {
        return {
            MELODY: { id: 'melody', label: 'Мелодия', color: 0x4A90E2 },
            CHORDS: { id: 'chords', label: 'Аккорды', color: 0x9B59B6 },
            MIXED:  { id: 'mixed',  label: 'Смешанная фактура', color: 0xE67E22 },
            UNKNOWN:{ id: 'unknown', label: 'Свободный склад', color: 0x7F8C8D }
            // TODO: Добавить новые виды склада:
            // POLYPHONY: { id: 'polyphony', label: 'Полифония', color: 0x1ABC9C },
            // ARPEGGIO:  { id: 'arpeggio',  label: 'Фигурация / Арпеджио', color: 0xF1C40F },
        };
    }

    /**
     * Анализ склада фрагмента и построение рёбер графа голосоведения (SATB).
     * @param {Array<Object>} notes - Ноты внутри группы
     * @returns {{ texture: Object, edges: Array<{from: Object, to: Object}> }}
     */
    analyzeGroupTextureAndVoiceLeading(notes) {
        const TYPES = HarmonyAnalyzer.TEXTURE_TYPES;
        if (!notes || notes.length === 0) {
            return { texture: TYPES.UNKNOWN, edges: [] };
        }

        // 1. Группируем ноты в вертикальные срезы по времени начала (start)
        const sliceMap = new Map();
        notes.forEach(n => {
            if (!sliceMap.has(n.start)) sliceMap.set(n.start, []);
            sliceMap.get(n.start).push(n);
        });

        // Сортируем срезы по времени, а ноты внутри среза — снизу вверх (от Баса к Сопрано)
        const slices = Array.from(sliceMap.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([start, sliceNotes]) => ({
                start,
                notes: sliceNotes.sort((a, b) => a.pitch - b.pitch)
            }));

        // 2. Определение склада (фактуры)
        let singleSlicesCount = 0;
        let chordSlicesCount = 0;
        let hasHugeLeap = false; // Скачок > дуодецимы (19 полутонов)

        slices.forEach((slice, idx) => {
            if (slice.notes.length === 1) {
                singleSlicesCount++;
            } else if (slice.notes.length >= 2) {
                chordSlicesCount++;
            }

            // Проверка скачка > дуодецимы (19 полутонов) для одноголосных переходов
            if (idx > 0 && slice.notes.length === 1 && slices[idx - 1].notes.length === 1) {
                const diff = Math.abs(slice.notes[0].pitch - slices[idx - 1].notes[0].pitch);
                if (diff > 19) hasHugeLeap = true;
            }
        });

        let texture = TYPES.UNKNOWN;
        if (chordSlicesCount === 0 && singleSlicesCount > 0) {
            // Чистое одноголосье: нет двойных нот и скачков > дуодецимы
            texture = hasHugeLeap ? TYPES.UNKNOWN : TYPES.MELODY;
        } else if (singleSlicesCount === 0 && chordSlicesCount > 0) {
            // Чёткие последовательности интервалов и аккордов
            texture = TYPES.CHORDS;
        } else if (singleSlicesCount > 0 && chordSlicesCount > 0) {
            // Перемешаны мелодическая и аккордовая фактуры
            texture = TYPES.MIXED;
        }

        // TODO: Место для дополнительных эвристик определения других складов
        // (например, анализ независимости ритма голосов для полифонии или разложенных аккордов)

        // 3. Построение рёбер графа голосоведения по принципу SATB
        const edges = [];
        for (let i = 0; i < slices.length - 1; i++) {
            const A = slices[i].notes;     // От баса [0] к сопрано [A.length - 1]
            const B = slices[i + 1].notes;
            const m = A.length;
            const n = B.length;

            if (m === 1 && n === 1) {
                // Одноголосный переход (мелодия)
                edges.push({ from: A[0], to: B[0] });
            } else if (m === n) {
                // Равное число голосов: строгое соответствие SATB без перекрещивания
                for (let k = 0; k < m; k++) {
                    edges.push({ from: A[k], to: B[k] });
                }
            } else if (m === 1 && n > 1) {
                // Расхождение из унисона в интервал/аккорд
                B.forEach(noteB => edges.push({ from: A[0], to: noteB }));
            } else if (m > 1 && n === 1) {
                // Стягивание аккорда/интервала в унисон
                A.forEach(noteA => edges.push({ from: noteA, to: B[0] }));
            } else if (m > n) {
                // Стягивание (например, 4-звучный аккорд -> трезвучие или интервал)
                // Крайние голоса (Бас и Сопрано) соединяются всегда
                edges.push({ from: A[0], to: B[0] });
                edges.push({ from: A[m - 1], to: B[n - 1] });

                const matchedB = new Set([0, n - 1]);
                // Внутренние голоса A идут к ближайшему по высоте звуку B (допуская унисон/дублировку)
                for (let aIdx = 1; aIdx < m - 1; aIdx++) {
                    let bestB = 0;
                    let minDist = Infinity;
                    for (let bIdx = 0; bIdx < n; bIdx++) {
                        // Лёгкий приоритет ещё не занятым внутренним голосам B
                        const penalty = matchedB.has(bIdx) ? 2 : 0;
                        const dist = Math.abs(A[aIdx].pitch - B[bIdx].pitch) + penalty;
                        if (dist < minDist) {
                            minDist = dist;
                            bestB = bIdx;
                        }
                    }
                    matchedB.add(bestB);
                    edges.push({ from: A[aIdx], to: B[bestB] });
                }
            } else {
                // Расширение (например, трезвучие -> септаккорд / нонаккорд)
                // Крайние голоса (Бас и Сопрано)
                edges.push({ from: A[0], to: B[0] });
                edges.push({ from: A[m - 1], to: B[n - 1] });

                const matchedA = new Set([0, m - 1]);
                // Каждый внутренний голос B берёт начало от ближайшего голоса A
                for (let bIdx = 1; bIdx < n - 1; bIdx++) {
                    let bestA = 0;
                    let minDist = Infinity;
                    for (let aIdx = 0; aIdx < m; aIdx++) {
                        const penalty = matchedA.has(aIdx) ? 2 : 0;
                        const dist = Math.abs(B[bIdx].pitch - A[aIdx].pitch) + penalty;
                        if (dist < minDist) {
                            minDist = dist;
                            bestA = aIdx;
                        }
                    }
                    matchedA.add(bestA);
                    edges.push({ from: A[bestA], to: B[bIdx] });
                }
            }
        }

        return { texture, edges };
    }
}