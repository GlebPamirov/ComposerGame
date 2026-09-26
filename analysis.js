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
}