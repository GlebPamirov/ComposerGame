class TeacherService {
    constructor() {
        this.gasUrl = 'https://script.google.com/macros/s/AKfycbxQjyL6FCnnJzy0Ma3NC2FMAU3x4P7JKkeGUxv2UdLoID9lOFNruWAz_DYE1zg3hWkM/exec';
        this.submissionsCache = [];
        this.activeSubmission = null;
    }

    init() {
        this.bindEvents();
        this.ensureStudentHistoryModal();
        // Фоновая предзагрузка работ учеников при старте
        this.preloadSubmissions();
    }

    preloadSubmissions() {
        this.loadSubmissions(true);
    }

    bindEvents() {
        document.getElementById('btn-close-teacher-modal')?.addEventListener('click', () => {
            document.getElementById('teacherModal').style.display = 'none';
        });

        document.getElementById('btn-save-new-task')?.addEventListener('click', () => this.saveNewTask());
        document.getElementById('btn-save-review')?.addEventListener('click', () => this.saveReview());
        document.getElementById('btn-load-student-file')?.addEventListener('click', () => this.loadSelectedSubmissionFile());
    }

    // Создание кнопок смены статуса (1: Выполнено, -1: Доработать)
    ensureStatusButtons() {
        let container = document.getElementById('review-status-buttons-container');
        if (!container) {
            const reviewPanel = document.getElementById('review-panel');
            if (!reviewPanel) return;

            container = document.createElement('div');
            container.id = 'review-status-buttons-container';
            container.style.cssText = 'margin: 12px 0; display: flex; align-items: center; gap: 10px; flex-wrap: wrap;';
            container.innerHTML = `
                <label style="font-weight:bold; font-size:13px; color:#333;">Статус выполнения:</label>
                <div style="display:flex; gap:8px;">
                    <button id="btn-status-complete" type="button" style="padding: 6px 14px; background: #e8f5e9; border: 2px solid #4CAF50; color: #2e7d32; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 13px; display: flex; align-items: center; gap: 6px; transition: all 0.2s;" title="Отметить как выполненное">
                        <span>✔</span> Выполнено
                    </button>
                    <button id="btn-status-revision" type="button" style="padding: 6px 14px; background: #ffebee; border: 2px solid #f44336; color: #c62828; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 13px; display: flex; align-items: center; gap: 6px; transition: all 0.2s;" title="Отправить на доработку">
                        <span>✖</span> Доработать
                    </button>
                </div>
            `;

            const pointsElem = document.getElementById('review-points');
            if (pointsElem && pointsElem.parentNode) {
                pointsElem.parentNode.insertBefore(container, pointsElem.nextSibling);
            } else {
                reviewPanel.appendChild(container);
            }

            document.getElementById('btn-status-complete')?.addEventListener('click', () => {
                this.setStatus('1');
            });

            document.getElementById('btn-status-revision')?.addEventListener('click', () => {
                this.setStatus('-1');
            });
        }
    }

    setStatus(val) {
        if (!this.activeSubmission) return;
        this.activeSubmission.isCompleted = String(val);
        this.updateStatusButtonsUI(val);
        this.saveReview();
    }

    updateStatusButtonsUI(val) {
        const btnComplete = document.getElementById('btn-status-complete');
        const btnRevision = document.getElementById('btn-status-revision');
        const strVal = String(val).trim();

        if (btnComplete) {
            if (strVal === '1') {
                btnComplete.style.background = '#4CAF50';
                btnComplete.style.color = '#ffffff';
                btnComplete.style.boxShadow = '0 0 8px rgba(76, 175, 80, 0.4)';
            } else {
                btnComplete.style.background = '#e8f5e9';
                btnComplete.style.color = '#2e7d32';
                btnComplete.style.boxShadow = 'none';
            }
        }

        if (btnRevision) {
            if (strVal === '-1') {
                btnRevision.style.background = '#f44336';
                btnRevision.style.color = '#ffffff';
                btnRevision.style.boxShadow = '0 0 8px rgba(244, 67, 54, 0.4)';
            } else {
                btnRevision.style.background = '#ffebee';
                btnRevision.style.color = '#c62828';
                btnRevision.style.boxShadow = 'none';
            }
        }
    }

    // Всплывающее окно истории работ конкретного ученика поверх всех остальных
    ensureStudentHistoryModal() {
        if (document.getElementById('studentHistoryModal')) return;

        const modal = document.createElement('div');
        modal.id = 'studentHistoryModal';
        modal.style.cssText = 'display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.65); z-index:99999; align-items:center; justify-content:center;';

        modal.innerHTML = `
            <div style="background:#ffffff; padding:24px; border-radius:12px; max-width:850px; width:92%; max-height:85vh; overflow-y:auto; box-shadow:0 10px 30px rgba(0,0,0,0.3); position:relative; font-family:sans-serif;">
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #f0f0f0; padding-bottom:12px; margin-bottom:16px;">
                    <h3 id="student-history-title" style="margin:0; font-size:18px; color:#2c3e50;">История работ ученика</h3>
                    <button id="btn-close-student-history" style="background:none; border:none; font-size:24px; cursor:pointer; color:#7f8c8d; line-height:1;">&times;</button>
                </div>
                <div id="student-history-table-container" style="max-height: 60vh; overflow-y: auto;">
                    <!-- Таблица работ -->
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        document.getElementById('btn-close-student-history')?.addEventListener('click', () => {
            modal.style.display = 'none';
        });
    }

    async openTeacherPanel() {
        const modal = document.getElementById('teacherModal');
        if (modal) modal.style.display = 'flex';

        // Отображаем данные из кэша
        if (this.submissionsCache.length > 0) {
            this.renderSubmissionsList();
        }

        // Обновляем данные с сервера
        await this.loadSubmissions(false);
    }

    // 1. Создание нового задания для всех
    async saveNewTask() {
        const titleInput = document.getElementById('teacher-task-title');
        const descInput = document.getElementById('teacher-task-description');
        const activeInput = document.getElementById('teacher-task-active');

        const title = titleInput ? titleInput.value.trim() : '';
        const description = descInput ? descInput.value.trim() : '';
        const isActive = activeInput ? activeInput.checked : true;

        if (!title) {
            alert('Введите название задания!');
            return console.warn('[Teacher] Введите название задания');
        }

        const editorInstance = window.editor || (typeof editor !== 'undefined' ? editor : null);
        if (!editorInstance) {
            alert('Редактор не найден!');
            return console.error('[Teacher] Редактор не найден');
        }

        const mainTitleInput = document.getElementById('track-title-input');
        if (mainTitleInput) {
            mainTitleInput.value = title;
        }

        let xmlData = '';
        try {
            if (typeof buildMusicXMLString === 'function') {
                xmlData = buildMusicXMLString(editorInstance, title);
            } else {
                throw new Error('Функция buildMusicXMLString не найдена');
            }
        } catch (e) {
            console.error('[Teacher] Ошибка сборки XML:', e);
        }

        if (!xmlData || xmlData.trim() === '') {
            alert('Не удалось сформировать нотный файл. Добавьте ноты в редактор перед сохранением.');
            return console.error('[Teacher] Ошибка генерации XML');
        }

        console.log('[Teacher] Сохранение нового задания:', title);

        try {
            const response = await fetch(this.gasUrl, {
                method: 'POST',
                mode: 'cors',
                redirect: 'follow',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({
                    action: 'saveNewTaskByTeacher',
                    taskName: title,
                    description: description,
                    isActive: isActive,
                    fileContent: xmlData
                })
            });

            const res = await response.json();
            if (res.success) {
                alert('Задание успешно создано и сохранено на Google Диск!');
                
                if (titleInput) titleInput.value = '';
                if (descInput) descInput.value = '';
                if (activeInput) activeInput.checked = true;
                
                const teacherModal = document.getElementById('teacherModal');
                if (teacherModal) teacherModal.style.display = 'none';
            } else {
                alert('Ошибка при сохранении задания: ' + res.message);
            }
        } catch (e) {
            console.error('[Teacher] Ошибка создания задания:', e);
            alert('Ошибка сетевого запроса при сохранении задания');
        }
    }

    // 2. Загрузка всех сдач учеников
    async loadSubmissions(silent = false) {
        const listContainer = document.getElementById('teacher-students-list');
        if (listContainer && !silent && this.submissionsCache.length === 0) {
            listContainer.innerHTML = 'Загрузка...';
        }

        try {
            const response = await fetch(this.gasUrl, {
                method: 'POST',
                mode: 'cors',
                redirect: 'follow',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'getStudentsWithProgress' })
            });

            const data = await response.json();
            if (data.success) {
                // Новые работы сверху
                const rawSubmissions = data.submissions || [];
                this.submissionsCache = [...rawSubmissions].reverse();

                this.renderSubmissionsList();
            }
        } catch (e) {
            console.error('[Teacher] Ошибка загрузки списка работ:', e);
            if (listContainer && !silent && this.submissionsCache.length === 0) {
                listContainer.innerHTML = '<div class="empty-msg">Ошибка загрузки данных</div>';
            }
        }
    }

    renderSubmissionsList() {
        const listContainer = document.getElementById('teacher-students-list');
        if (!listContainer) return;

        // Фильтрация: отображаем работ, где еще не выставлен статус выполнения и баллы
        const unreviewedSubmissions = this.submissionsCache.filter(sub => {
			const comp = String(sub.isCompleted).trim();
			// Считаем работу проверенной только если явным образом установлен статус 1 (выполнено) или -1 (на доработку)
			return comp !== '1' && comp !== '-1';
		});

        // Уникальный список имен учеников для фильтра
        const uniqueStudents = [...new Set(this.submissionsCache.map(s => s.userName || 'Без имени'))].filter(Boolean);

        let html = `
			<div class="teacher-student-filter-bar" style="margin-bottom:12px; background:#f4f6f8; padding:10px 12px; border-radius:8px; display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
				<label style="font-weight:bold; font-size:13px; color:#333;">Выбор ученика:</label>
				<select id="teacher-student-select" style="padding:6px 10px; border-radius:6px; border:1px solid #ccc; flex-grow:1; max-width:200px; font-size:13px;">
					<option value="">-- Выберите ученика --</option>
					${uniqueStudents.map(name => `<option value="${this.escapeHtml(name)}">${this.escapeHtml(name)}</option>`).join('')}
				</select>
				<button id="btn-show-student-history" style="padding:6px 12px; background:#2196F3; color:white; border:none; border-radius:6px; cursor:pointer; font-size:13px; font-weight:bold;">Все работы</button>
				<button id="btn-refresh-submissions" style="padding:6px 12px; background:#4CAF50; color:white; border:none; border-radius:6px; cursor:pointer; font-size:13px; font-weight:bold;">🔄 Обновить</button>
			</div>
			<div style="font-weight:bold; margin-bottom:8px; color:#555; font-size:13px;">
				Непроверенные работы (${unreviewedSubmissions.length}):
			</div>
		`;
		
		document.getElementById('btn-refresh-submissions')?.addEventListener('click', () => {
			this.loadSubmissions(false);
		});

        if (unreviewedSubmissions.length === 0) {
            html += '<div class="empty-msg" style="padding:15px; color:#888; text-align:center; background:#fafafa; border-radius:6px;">Все сданные работы проверены!</div>';
        } else {
            html += '<div class="submissions-table-list" style="max-height: 320px; overflow-y: auto; padding-right: 4px;">';
            unreviewedSubmissions.forEach((sub) => {
                const originalIdx = this.submissionsCache.indexOf(sub);
                html += `
                    <div class="submission-item pending" data-index="${originalIdx}">
                        <div class="sub-user">${this.escapeHtml(sub.userName || 'Без имени')}</div>
                        <div class="sub-task">${this.escapeHtml(sub.taskName || 'Без названия')}</div>
                        <div class="sub-status" style="color:#e65100;">не проверено</div>
                    </div>
                `;
            });
            html += '</div>';
        }

        listContainer.innerHTML = html;

        // Навешиваем событие на кнопку просмотра истории ученика
        document.getElementById('btn-show-student-history')?.addEventListener('click', () => {
            const select = document.getElementById('teacher-student-select');
            const selectedName = select?.value;
            if (!selectedName) {
                alert('Выберите имя ученика из списка!');
                return;
            }
            this.openStudentHistoryModal(selectedName);
        });

        // Навешиваем события клика по не проверенным работам
        listContainer.querySelectorAll('.submission-item').forEach(el => {
            el.addEventListener('click', (e) => {
                const item = e.target.closest('.submission-item');
                if (!item) return;
                
                const idx = item.getAttribute('data-index');
                if (idx !== null && this.submissionsCache[idx]) {
                    listContainer.querySelectorAll('.submission-item').forEach(s => s.classList.remove('selected'));
                    item.classList.add('selected');

                    this.selectSubmission(this.submissionsCache[idx]);
                }
            });
        });
    }

    // Открытие модального окна со всеми работами ученика
    openStudentHistoryModal(studentName) {
        this.ensureStudentHistoryModal();

        const modal = document.getElementById('studentHistoryModal');
        const titleElem = document.getElementById('student-history-title');
        const tableContainer = document.getElementById('student-history-table-container');

        if (titleElem) titleElem.innerText = `Все работы ученика: ${studentName}`;

        const studentWorks = this.submissionsCache.filter(sub => (sub.userName || 'Без имени') === studentName);

        if (studentWorks.length === 0) {
            tableContainer.innerHTML = '<div style="padding:20px; text-align:center; color:#777;">У этого ученика нет сохраненных работ.</div>';
        } else {
            let tableHtml = `
                <table style="width:100%; border-collapse:collapse; font-size:13px; text-align:left; background:#fff;">
                    <thead>
                        <tr style="background:#f0f4f8; border-bottom:2px solid #ccc; color:#333;">
                            <th style="padding:10px; border:1px solid #ddd;">Название</th>
                            <th style="padding:10px; border:1px solid #ddd;">Комм. ученика</th>
                            <th style="padding:10px; border:1px solid #ddd;">Комм. учителя</th>
                            <th style="padding:10px; border:1px solid #ddd; text-align:center;">Статус</th>
                            <th style="padding:10px; border:1px solid #ddd; text-align:center;">Баллы</th>
                            <th style="padding:10px; border:1px solid #ddd; text-align:center;">Награда</th>
                            <th style="padding:10px; border:1px solid #ddd; text-align:center;">Действие</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            studentWorks.forEach((sub) => {
                const originalIdx = this.submissionsCache.indexOf(sub);
                const comp = String(sub.isCompleted).trim();
                let statusText = '<span style="color:#e65100; font-weight:bold;">На проверке</span>';
                
                if (comp === '1') {
                    statusText = '<span style="color:#2e7d32; font-weight:bold;">✔ Выполнено</span>';
                } else if (comp === '-1') {
                    statusText = '<span style="color:#c62828; font-weight:bold;">✖ Доработать</span>';
                }
                
                tableHtml += `
                    <tr style="border-bottom:1px solid #eee;">
                        <td style="padding:8px; border:1px solid #ddd; font-weight:bold; color:#2c3e50;">${this.escapeHtml(sub.taskName || 'Без названия')}</td>
                        <td style="padding:8px; border:1px solid #ddd; color:#555;">${this.escapeHtml(sub.userComment || '—')}</td>
                        <td style="padding:8px; border:1px solid #ddd; color:#333;">${this.escapeHtml(sub.teacherComment || '—')}</td>
                        <td style="padding:8px; border:1px solid #ddd; text-align:center;">${statusText}</td>
                        <td style="padding:8px; border:1px solid #ddd; text-align:center;">${sub.points !== '' ? sub.points + ' б.' : '—'}</td>
                        <td style="padding:8px; border:1px solid #ddd; text-align:center;">${this.escapeHtml(sub.reward || '—')}</td>
                        <td style="padding:8px; border:1px solid #ddd; text-align:center;">
                            <button class="btn-open-work-file" data-index="${originalIdx}" style="padding:4px 10px; background:#4CAF50; color:white; border:none; border-radius:4px; cursor:pointer; font-size:12px;">Открыть</button>
                        </td>
                    </tr>
                `;
            });

            tableHtml += `
                    </tbody>
                </table>
            `;

            tableContainer.innerHTML = tableHtml;

            // Навешиваем события на кнопки открытия работы в редакторе
            tableContainer.querySelectorAll('.btn-open-work-file').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const idx = e.target.getAttribute('data-index');
                    if (idx !== null && this.submissionsCache[idx]) {
                        this.selectSubmission(this.submissionsCache[idx]);
                        this.loadSelectedSubmissionFile();
                        if (modal) modal.style.display = 'none';
                    }
                });
            });
        }

        if (modal) modal.style.display = 'flex';
    }

    selectSubmission(sub) {
        this.activeSubmission = sub;
        console.log('[Teacher] Выбрана работа ученика:', sub);
        
        const nameElem = document.getElementById('review-student-name');
        if (nameElem) nameElem.innerText = `${sub.userName || 'Ученик'} - ${sub.taskName || 'Задание'}`;

        const commentElem = document.getElementById('review-user-comment');
        if (commentElem) commentElem.value = sub.userComment || '(нет комментария)';

        const pointsElem = document.getElementById('review-points');
        if (pointsElem) pointsElem.value = sub.points || '';

        const teacherCommentElem = document.getElementById('review-teacher-comment');
        if (teacherCommentElem) teacherCommentElem.value = sub.teacherComment || '';

        const rewardElem = document.getElementById('review-reward-select');
        if (rewardElem) rewardElem.value = sub.reward || '';

        // Внедряем и обновляем кнопки Выполнено / Доработать
        this.ensureStatusButtons();
        this.updateStatusButtonsUI(sub.isCompleted);

        const btnLoad = document.getElementById('btn-load-student-file');
        if (btnLoad) {
            btnLoad.disabled = false;
            btnLoad.style.opacity = '1';
            btnLoad.style.cursor = 'pointer';
        }

        const reviewPanel = document.getElementById('review-panel');
        if (reviewPanel) reviewPanel.style.display = 'block';
    }

    async loadSelectedSubmissionFile() {
        if (!this.activeSubmission) {
            alert('Сначала выберите работу ученика из списка!');
            return;
        }

        const rawUrlOrId = this.activeSubmission.fileUrl || 
                           this.activeSubmission.fileId || 
                           this.activeSubmission.driveUrl || 
                           this.activeSubmission.id;

        if (!rawUrlOrId) {
            alert('У этой работы отсутствует прикрепленный файл или ссылка!');
            return console.error('[Teacher] Поле файла пустое в объекте:', this.activeSubmission);
        }

        let fileId = rawUrlOrId;
        const match = rawUrlOrId.match(/\/d\/([a-zA-Z0-9_-]+)/) || 
                      rawUrlOrId.match(/id=([a-zA-Z0-9_-]+)/);
        if (match && match[1]) {
            fileId = match[1];
        }

        console.log('[Teacher] Попытка загрузить файл ID:', fileId);

        const uService = window.userService || (typeof userService !== 'undefined' ? userService : null);

        if (uService && typeof uService.applyFileToEditor === 'function') {
            await uService.applyFileToEditor(fileId);
            
            const teacherModal = document.getElementById('teacherModal');
            if (teacherModal) teacherModal.style.display = 'none';
        } else {
            console.error('[Teacher] Ошибка: userService.applyFileToEditor недоступен');
            alert('Ошибка: Модуль импорта (UserService) не найден.');
        }
    }    
    
    async saveReview() {
        if (!this.activeSubmission) return;

        const points = document.getElementById('review-points')?.value || '';
        const teacherComment = document.getElementById('review-teacher-comment')?.value || '';
        const reward = document.getElementById('review-reward-select')?.value || '';
        const isCompleted = this.activeSubmission.isCompleted !== undefined ? this.activeSubmission.isCompleted : '';

        try {
            const response = await fetch(this.gasUrl, {
                method: 'POST',
                mode: 'cors',
                redirect: 'follow',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({
                    action: 'saveTeacherReview',
                    rowIndex: this.activeSubmission.rowIndex,
                    points: points,
                    teacherComment: teacherComment,
                    reward: reward,
                    isCompleted: isCompleted
                })
            });

            const res = await response.json();
            if (res.success) {
                console.log('[Teacher] Оценка и статус сохранены успешно!');
                this.loadSubmissions(false);
            }
        } catch (e) {
            console.error('[Teacher] Ошибка сохранения оценки:', e);
        }
    }

    escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}

window.teacherService = new TeacherService();
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.teacherService.init());
} else {
    window.teacherService.init();
}
