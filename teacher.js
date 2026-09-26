class TeacherService {
    constructor() {
        this.gasUrl = 'https://script.google.com/macros/s/AKfycbyDOrEP45WXKf3d7I9P9Y9VhPemTWa2Qr69DGQZm3kfoR1GMTx3XhpKPnEmPvU8WyX8/exec';
        this.submissionsCache = [];
        this.activeSubmission = null;
    }

    init() {
        this.bindEvents();
    }

    bindEvents() {
        document.getElementById('btn-close-teacher-modal')?.addEventListener('click', () => {
            document.getElementById('teacherModal').style.display = 'none';
        });

        document.getElementById('btn-save-new-task')?.addEventListener('click', () => this.saveNewTask());
        document.getElementById('btn-save-review')?.addEventListener('click', () => this.saveReview());
        document.getElementById('btn-load-student-file')?.addEventListener('click', () => this.loadSelectedSubmissionFile());
    }

    async openTeacherPanel() {
        const modal = document.getElementById('teacherModal');
        if (modal) modal.style.display = 'flex';
        await this.loadSubmissions();
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

    // Синхронизируем название с главным инпутом редактора
    const mainTitleInput = document.getElementById('track-title-input');
    if (mainTitleInput) {
        mainTitleInput.value = title;
    }

    // Генерация XML данных
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
    async loadSubmissions() {
        const listContainer = document.getElementById('teacher-students-list');
        if (listContainer) listContainer.innerHTML = 'Загрузка...';

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
                this.submissionsCache = data.submissions || [];
                this.renderSubmissionsList();
            }
        } catch (e) {
            console.error('[Teacher] Ошибка загрузки списка работ:', e);
        }
    }

renderSubmissionsList() {
        const listContainer = document.getElementById('teacher-students-list');
        if (!listContainer) return;

        if (this.submissionsCache.length === 0) {
            listContainer.innerHTML = '<div class="empty-msg">Сданных работ пока нет</div>';
            return;
        }

        let html = '<div class="submissions-table-list">';
        this.submissionsCache.forEach((sub, idx) => {
            const statusClass = sub.points ? 'reviewed' : 'pending';
            html += `
                <div class="submission-item ${statusClass}" data-index="${idx}">
                    <div class="sub-user">${sub.userName || 'Без имени'}</div>
                    <div class="sub-task">${sub.taskName || 'Без названия'}</div>
                    <div class="sub-status">${sub.points ? sub.points + ' б.' : 'не проверено'}</div>
                </div>
            `;
        });
        html += '</div>';
        listContainer.innerHTML = html;

        // Надежное делегирование клика с помощью closest('.submission-item')
        listContainer.querySelectorAll('.submission-item').forEach(el => {
            el.addEventListener('click', (e) => {
                const item = e.target.closest('.submission-item');
                if (!item) return;
                
                const idx = item.getAttribute('data-index');
                if (idx !== null && this.submissionsCache[idx]) {
                    // Подсвечиваем выбранную строку в UI
                    listContainer.querySelectorAll('.submission-item').forEach(s => s.classList.remove('selected'));
                    item.classList.add('selected');

                    this.selectSubmission(this.submissionsCache[idx]);
                }
            });
        });
    }

    selectSubmission(sub) {
        this.activeSubmission = sub;
        console.log('[Teacher] Выбрана работа ученика:', sub);
        
        // Заполняем форму проверки
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

        // Активируем кнопку "Открыть ноты в редакторе"
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

        // Проверяем все возможные наименования полей ссылки/ID
        const rawUrlOrId = this.activeSubmission.fileUrl || 
                           this.activeSubmission.fileId || 
                           this.activeSubmission.driveUrl || 
                           this.activeSubmission.id;

        if (!rawUrlOrId) {
            alert('У этой работы отсутствует прикрепленный файл или ссылка!');
            return console.error('[Teacher] Поле файла пустое в объекте:', this.activeSubmission);
        }

        // Извлекаем чистый Google Drive ID (поддерживает прямые ID, ссылки /d/ID/ и ?id=ID)
        let fileId = rawUrlOrId;
        const match = rawUrlOrId.match(/\/d\/([a-zA-Z0-9_-]+)/) || 
                      rawUrlOrId.match(/id=([a-zA-Z0-9_-]+)/);
        if (match && match[1]) {
            fileId = match[1];
        }

        console.log('[Teacher] Попытка загрузить файл ID:', fileId);

        // Используем рабочий сервис ученика для скачивания и импорта XML в редактор
        const uService = window.userService || (typeof userService !== 'undefined' ? userService : null);

        if (uService && typeof uService.applyFileToEditor === 'function') {
            await uService.applyFileToEditor(fileId);
            
            // Закрываем окно учителя
            const teacherModal = document.getElementById('teacherModal');
            if (teacherModal) teacherModal.style.display = 'none';
        } else {
            console.error('[Teacher] Ошибка: userService.applyFileToEditor недоступен');
            alert('Ошибка: Модуль импорта (UserService) не найден.');
        }
    }    
    
    async saveReview() {
        if (!this.activeSubmission) return;

        const points = document.getElementById('review-points').value;
        const teacherComment = document.getElementById('review-teacher-comment').value;
        const reward = document.getElementById('review-reward-select').value;

        try {
            const response = await fetch(this.gasUrl, {
                method: 'POST',
                mode: 'cors',
                redirect: 'follow',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({
                    action: 'saveTeacherReview',
                    rowIndex: this.activeSubmission.rowIndex,
                    points,
                    teacherComment,
                    reward
                })
            });

            const res = await response.json();
            if (res.success) {
                console.log('[Teacher] Оценка сохранена успешно!');
                this.loadSubmissions(); // Обновляем список
            }
        } catch (e) {
            console.error('[Teacher] Ошибка сохранения оценки:', e);
        }
    }
}

window.teacherService = new TeacherService();
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.teacherService.init());
} else {
    window.teacherService.init();
}