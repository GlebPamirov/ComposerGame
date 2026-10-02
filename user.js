function openModal(id) {
    const m = document.getElementById(id);
    if (m) m.style.display = 'flex';
}
function closeModal(id) {
    const m = document.getElementById(id);
    if (m) m.style.display = 'none';
}

async function handleLogin() {
    const name = document.getElementById('loginName').value;
    const pass = document.getElementById('loginPassword').value;
    if (!name || !pass) return alert('Введите имя и пароль');

    const res = await userService.login(name, pass);
    if (res.success) {
        alert('Приветствуем, ' + userService.currentUser.name + '!');
        closeModal('authModal');
    } else {
        alert('Ошибка: ' + res.message);
    }
}

function handleLogout() {
    userService.logout();
    closeModal('authModal');
    alert('Вы вышли из системы');
}

async function openStudio() {
    if (window.userService) {
        window.userService.openStudio();
    }
}

async function loadSelectedLesson() {
    if (window.userService) {
        await window.userService.loadSelectedLesson();
    }
}

async function saveStudioProject() {
    if (window.userService) {
        await window.userService.saveStudioProject();
    }
}	

	
class UserService {
    constructor() {
        this.gasUrl = 'https://script.google.com/macros/s/AKfycbxQjyL6FCnnJzy0Ma3NC2FMAU3x4P7JKkeGUxv2UdLoID9lOFNruWAz_DYE1zg3hWkM/exec';
        this.currentUser = JSON.parse(localStorage.getItem('app_user')) || null;
        this.cachedTasks = [];
        this.cachedUserProjects = [];
        this.cachedSubmissions = [];
        this.currentTaskId = ''; // Храним task_id открытого задания
    }

    init() {
        this.updateUI();
        this.bindEvents();
        this.ensureUserTasksModal();
        // Фоновая предзагрузка заданий и личных работ при запуске приложения
        this.preloadData();
    }

    preloadData() {
        this.loadTasksFromDrive();
        if (this.currentUser) {
            this.loadUserProjectsFromDrive();
            if (String(this.currentUser.id) === '1' && window.teacherService) {
                window.teacherService.preloadSubmissions();
            }
        }
    }

    bindEvents() {
        const authBtn = document.getElementById('authModalBtn') || document.getElementById('btn-auth');
        if (authBtn) {
            authBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.openModal('authModal');
            });
        }

        document.getElementById('btn-close-modal')?.addEventListener('click', () => this.closeModal('authModal'));
        document.getElementById('btn-submit-login')?.addEventListener('click', () => this.handleLogin());
        document.getElementById('btn-submit-logout')?.addEventListener('click', () => this.handleLogout());

        document.getElementById('btn-studio')?.addEventListener('click', () => {
            if (this.currentUser && String(this.currentUser.id) === '1') {
                window.teacherService?.openTeacherPanel();
            } else {
                this.openStudio();
            }
        });
        document.getElementById('btn-close-studio-modal')?.addEventListener('click', () => this.closeModal('studioModal'));
        document.getElementById('btn-load-lesson')?.addEventListener('click', () => this.loadSelectedLesson());
        document.getElementById('btn-load-user-project')?.addEventListener('click', () => this.loadSelectedUserProject());
        document.getElementById('btn-save-studio-project')?.addEventListener('click', () => this.saveStudioProject());

        document.querySelectorAll('.exercise-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.handleExerciseClick(e.target.dataset.type));
        });

        document.querySelectorAll('.game-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.handleGameClick(e.target.dataset.type));
        });
    }

    // Создание модального окна просмотра заданий ученика поверх всех окон (в тёмном стиле)
    ensureUserTasksModal() {
        if (document.getElementById('userTasksModal')) return;

        const modal = document.createElement('div');
        modal.id = 'userTasksModal';
        modal.style.cssText = 'display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(10, 12, 16, 0.8); backdrop-filter:blur(6px); z-index:99999; align-items:center; justify-content:center;';

        modal.innerHTML = `
            <div style="background:#1e222d; color:#e1e6ed; border:1px solid #2d3345; box-shadow:0 20px 50px rgba(0, 0, 0, 0.7); border-radius:12px; max-width:850px; width:92%; max-height:85vh; overflow-y:auto; padding:24px; position:relative; font-family:var(--font-main, sans-serif);">
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #2d3345; padding-bottom:12px; margin-bottom:16px;">
                    <h3 id="user-tasks-modal-title" style="margin:0; font-size:18px; color:#ffffff; font-weight:600;">Список выполненных и отправленных работ</h3>
                    <button id="btn-close-user-tasks" style="background:none; border:none; font-size:24px; cursor:pointer; color:#8c9ba5; line-height:1; transition:color 0.2s ease;">&times;</button>
                </div>
                <div id="user-tasks-table-container">
                    <!-- Таблица работ -->
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        document.getElementById('btn-close-user-tasks')?.addEventListener('click', () => {
            modal.style.display = 'none';
        });
    }

    openModal(id) {
        const m = document.getElementById(id);
        if (m) m.style.display = 'flex';
    }

    closeModal(id) {
        const m = document.getElementById(id);
        if (m) m.style.display = 'none';
    }

    async login(name, password) {
        try {
            console.log('[Auth] Отправка запроса авторизации для:', name);
            const response = await fetch(this.gasUrl, {
                method: 'POST',
                mode: 'cors',
                redirect: 'follow',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'login', name, password })
            });
            
            const result = await response.json();
            if (result.success) {
                console.log('[Auth] Успешный вход:', result.user);
                this.currentUser = result.user;
                localStorage.setItem('app_user', JSON.stringify(this.currentUser));
                this.updateUI();

                // Фоновая предзагрузка данных сразу после успешной авторизации
                this.preloadData();

                return { success: true };
            } else {
                console.warn('[Auth] Ошибка авторизации:', result.message);
                return { success: false, message: result.message };
            }
        } catch (err) {
            console.error('[Auth] Ошибка соединения:', err);
            return { success: false, message: 'Ошибка подключения к серверу' };
        }
    }

    logout() {
        console.log('[Auth] Выход из системы пользователя:', this.currentUser?.name);
        this.currentUser = null;
        this.cachedUserProjects = [];
        this.cachedSubmissions = [];
        this.currentTaskId = '';
        localStorage.removeItem('app_user');
        this.updateUI();
    }

    async handleLogin() {
        const name = document.getElementById('loginName')?.value;
        const pass = document.getElementById('loginPassword')?.value;
        if (!name || !pass) {
            console.warn('[Auth] Заполните имя и пароль');
            return;
        }

        const res = await this.login(name, pass);
        if (res.success) {
            console.log(`[Auth] Приветствуем, ${this.currentUser.name}!`);
            this.closeModal('authModal');
        } else {
            console.error('[Auth] Не удалось войти:', res.message);
        }
    }

    handleLogout() {
        this.logout();
        this.closeModal('authModal');
        console.log('[Auth] Вы успешно вышли из системы');
    }

    updateUI() {
        const authBtn = document.getElementById('authModalBtn') || document.getElementById('btn-auth');
        const studioBtn = document.getElementById('btn-studio');

        if (this.currentUser) {
            const isTeacher = String(this.currentUser.id) === '1';
            
            if (authBtn) authBtn.innerText = `${this.currentUser.name} ${isTeacher ? '(Учитель)' : ''}`;
            if (studioBtn) {
                studioBtn.style.display = 'inline-block';
                studioBtn.innerText = isTeacher ? 'Меню учителя' : 'Режим обучения';
            }
        } else {
            if (authBtn) authBtn.innerText = 'Авторизация';
            if (studioBtn) studioBtn.style.display = 'none';
        }
    }

    async openStudio() {
        this.openModal('studioModal');
        
        // 1. Отображаем предзагруженные кэшированные списки
        this.renderTasksSelect();
        this.renderUserProjectsSelect();

        // 2. Параллельно обновляем данные с сервера
        const tasksPromise = this.loadTasksFromDrive().then(() => this.renderTasksSelect());
        let projectsPromise = Promise.resolve();

        if (this.currentUser) {
            projectsPromise = this.loadUserProjectsFromDrive().then(() => this.renderUserProjectsSelect());
        }

        // 3. Обновление "Мой прогресс" и "Достижения"
        await Promise.all([tasksPromise, projectsPromise]);
        this.updateProgressAndAchievements(this.cachedTasks || []);
    }

    renderTasksSelect() {
        const selectTask = document.getElementById('select-lessons-list');
        if (!selectTask) return;

        if (this.cachedTasks && this.cachedTasks.length > 0) {
            selectTask.innerHTML = '<option value="">-- Выберите задание --</option>';
            this.cachedTasks.forEach(task => {
                const opt = document.createElement('option');
                opt.value = task.id;               // 1-я колонка листа tasks (task_id)
                opt.dataset.fileId = task.fileId;  // Google Drive File ID
                opt.innerText = task.name;
                selectTask.appendChild(opt);
            });
        } else {
            selectTask.innerHTML = '<option value="">Задания не найдены</option>';
        }
    }

    renderUserProjectsSelect() {
        const selectUserProjects = document.getElementById('select-user-projects-list');
        if (!selectUserProjects) return;

        if (!this.currentUser) {
            selectUserProjects.innerHTML = '<option value="">Требуется авторизация</option>';
            return;
        }

        if (this.cachedUserProjects && this.cachedUserProjects.length > 0) {
            selectUserProjects.innerHTML = '<option value="">-- Выберите вашу работу --</option>';
            this.cachedUserProjects.forEach(file => {
                const opt = document.createElement('option');
                opt.value = file.id;
                opt.innerText = file.name;
                selectUserProjects.appendChild(opt);
            });
        } else {
            selectUserProjects.innerHTML = '<option value="">Сохраненные работы не найдены</option>';
        }
    }

    async loadTasksFromDrive() {
        try {
            const response = await fetch(this.gasUrl, {
                method: 'POST',
                mode: 'cors',
                redirect: 'follow',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'getTasksFromDrive' })
            });
            const res = await response.json();
            if (res.success && res.tasks) {
                this.cachedTasks = res.tasks;
            }
            return res;
        } catch(e) {
            console.error('[Drive] Ошибка загрузки заданий:', e);
            return { success: false, tasks: this.cachedTasks };
        }
    }

    async loadUserProjectsFromDrive() {
        if (!this.currentUser) return { success: false, files: [] };
        try {
            const response = await fetch(this.gasUrl, {
                method: 'POST',
                mode: 'cors',
                redirect: 'follow',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ 
                    action: 'getUserSavedProjects', 
                    userId: this.currentUser.id,
                    userName: this.currentUser.name 
                })
            });
            const res = await response.json();
            if (res.success && res.files) {
                this.cachedUserProjects = res.files;
            }
            return res;
        } catch(e) {
            console.error('[Drive] Ошибка загрузки личных работ:', e);
            return { success: false, files: this.cachedUserProjects };
        }
    }

    async loadFileContent(fileId) {
        const response = await fetch(this.gasUrl, {
            method: 'POST',
            mode: 'cors',
            redirect: 'follow',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'getFileContent', fileId })
        });
        return await response.json();
    }

    async loadSelectedLesson() {
        const select = document.getElementById('select-lessons-list');
        if (!select || !select.value) return alert('Выберите задание из списка');

        const selectedOption = select.options[select.selectedIndex];
        
        // Фиксируем task_id задания в текущую сессию
        this.currentTaskId = select.value;

        // Берем fileId из data-атрибута option или откат на value
        const fileId = selectedOption.dataset.fileId || select.value;

        await this.applyFileToEditor(fileId);
    }

    async loadSelectedUserProject() {
        const select = document.getElementById('select-user-projects-list');
        const fileId = select?.value;
        if (!fileId) return alert('Выберите личную работу из списка');

        // При открытии личной работы сбрасываем текущий task_id
        this.currentTaskId = '';

        await this.applyFileToEditor(fileId);
    }

    async applyFileToEditor(fileId) {
        const editorInstance = window.editor || (typeof editor !== 'undefined' ? editor : null);
        if (!editorInstance) {
            alert('Ошибка: Редактор нот не найден на странице');
            return;
        }

        console.log('[Studio] Загрузка файла ID:', fileId);
        const res = await this.loadFileContent(fileId);
        
        if (res.success && res.content) {
            if (typeof importMusicXML === 'function') {
                importMusicXML(res.content, editorInstance);
                
                this.closeModal('studioModal');
                const teacherModal = document.getElementById('teacherModal');
                if (teacherModal) teacherModal.style.display = 'none';
            } else {
                alert('Ошибка: Функция importMusicXML не доступна');
            }
        } else {
            alert('Не удалось получить содержимое файла с Google Диска: ' + (res.message || ''));
        }
    }

    async saveStudioProject() {
        const titleInput = document.getElementById('studio-project-title') || document.getElementById('track-title-input');
        const commentInput = document.getElementById('studio-project-comment');
        const taskSelect = document.getElementById('select-lessons-list');

        const rawTitle = titleInput ? titleInput.value.trim() : '';
        const comment = commentInput ? commentInput.value.trim() : '';
        
        // Извлекаем taskId из сохраненной переменной или напрямую из слектора
        const taskId = this.currentTaskId || (taskSelect ? taskSelect.value : '');

        if (!rawTitle) return alert('Введите название работы');

        const userName = (this.currentUser && this.currentUser.name) 
            ? this.currentUser.name.trim() 
            : 'Ученик';

        const title = `${userName} - ${rawTitle}`;

        const editorInstance = window.editor || (typeof editor !== 'undefined' ? editor : null);
        if (!editorInstance) return alert('Редактор не найден');

        let xmlData = '';
        try {
            if (typeof buildMusicXMLString === 'function') {
                xmlData = buildMusicXMLString(editorInstance, title);
            } else {
                throw new Error('Функция buildMusicXMLString не найдена');
            }
        } catch (e) {
            console.error('[Studio] Ошибка сборки XML:', e);
            return alert('Ошибка при формировании нотного файла');
        }

        if (!xmlData || xmlData.trim() === '') {
            return alert('Не удалось сформировать нотный файл. Убедитесь, что на дорожках есть ноты.');
        }

        const btn = document.getElementById('btn-save-studio-project');
        if (btn) {
            btn.innerText = 'Сохранение...';
            btn.disabled = true;
        }

        console.log('[Studio] Сохранение проекта под именем:', title, 'с taskId:', taskId);
        const res = await this.saveStudentProject(title, comment, xmlData, taskId);
        
        if (btn) {
            btn.innerText = 'Сохранить';
            btn.disabled = false;
        }

        if (res.success) {
            alert(res.message || 'Проект успешно сохранен!');
            this.closeModal('studioModal');
            this.loadUserProjectsFromDrive();
        } else {
            alert('Ошибка сохранения: ' + (res.message || 'Неизвестная ошибка'));
        }
    }

    async saveStudentProject(title, comment, xmlData, taskId = '') {
        try {
            const userId = this.currentUser ? this.currentUser.id : null;
            const userName = this.currentUser ? this.currentUser.name : 'Аноним';

            const response = await fetch(this.gasUrl, {
                method: 'POST',
                mode: 'cors',
                redirect: 'follow',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({
                    action: 'saveStudentProject',
                    userId: userId,
                    userName: userName,
                    title: title,
                    comment: comment,
                    fileData: xmlData,
                    taskId: taskId
                })
            });

            return await response.json();
        } catch (e) {
            console.error('[Studio] Ошибка сетевого запроса при сохранении:', e);
            return { success: false, message: 'Ошибка сети при отправке файла' };
        }
    }

    // "Мой прогресс": вывод только текстовых цифр и кнопки открытия отдельного модального окна
    async updateProgressAndAchievements(allTasks) {
        const progressContainer = document.getElementById('progress-status-container');
        const achievementsContainer = document.getElementById('achievements-container');

        if (!this.currentUser) {
            if (progressContainer) progressContainer.innerHTML = '<em>Авторизуйтесь для просмотра прогресса</em>';
            if (achievementsContainer) achievementsContainer.innerHTML = '<em>Авторизуйтесь для просмотра наград</em>';
            return;
        }

        try {
            const response = await fetch(this.gasUrl, {
                method: 'POST',
                mode: 'cors',
                redirect: 'follow',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'getUserProgress', userId: this.currentUser.id })
            });
            const data = await response.json();
            
            const completedTaskNames = data.completedTasks || [];
            const revisionTaskNames = data.revisionTasks || [];
            this.cachedSubmissions = data.submissions || [];

            const taskItems = (allTasks || []).map(task => {
                const taskName = task.name;
                const taskId = task.id;
                let status = 'pending';

                if (completedTaskNames.includes(taskName) || (taskId && completedTaskNames.includes(taskId))) {
                    status = 'done';
                } else if (revisionTaskNames.includes(taskName) || (taskId && revisionTaskNames.includes(taskId))) {
                    status = 'revision';
                } else {
                    const foundSub = this.cachedSubmissions.find(s => 
                        (s.taskId && taskId && s.taskId === taskId) || 
                        (s.taskName && (s.taskName === taskName || s.taskName.includes(taskName)))
                    );

                    if (foundSub) {
                        const comp = String(foundSub.isCompleted).trim();
                        if (comp === '1') {
                            status = 'done';
                        } else if (comp === '-1') {
                            status = 'revision';
                        }
                    }
                }
                return { id: taskId, name: taskName, status };
            });

            const doneCount = taskItems.filter(t => t.status === 'done').length;
            const totalCount = (allTasks || []).length;

            // Рендер панели "Мой прогресс": только цифры и кнопка
            if (progressContainer) {
                let html = `<div class="progress-summary" style="margin-bottom:12px; font-weight:600; color:#e2e8f0; font-size:15px;">Выполнено ${doneCount} из ${totalCount} заданий</div>`;
                html += `<button id="btn-open-user-tasks-modal" style="padding:8px 16px; background:#2196F3; color:#ffffff; border:none; border-radius:6px; cursor:pointer; font-weight:bold; font-size:13px; transition:background 0.2s;">📋 Просмотр заданий</button>`;
                progressContainer.innerHTML = html;

                document.getElementById('btn-open-user-tasks-modal')?.addEventListener('click', () => {
                    this.openUserTasksModal();
                });
            }

            // Рендер наград / ачивок
            if (achievementsContainer) {
                let badgesHtml = '<div class="badges-grid">';
                badgesHtml += `<div class="badge-card ${doneCount >= 1 ? 'unlocked' : 'locked'}">
                    <div class="badge-icon">🎵</div>
                    <div class="badge-title">Первый шаг</div>
                </div>`;
                badgesHtml += `<div class="badge-card ${doneCount >= 5 ? 'unlocked' : 'locked'}">
                    <div class="badge-icon">🎼</div>
                    <div class="badge-title">Знаток</div>
                </div>`;
                badgesHtml += `<div class="badge-card ${doneCount >= 10 ? 'unlocked' : 'locked'}">
                    <div class="badge-icon">👑</div>
                    <div class="badge-title">Маэстро</div>
                </div>`;
                badgesHtml += '</div>';
                achievementsContainer.innerHTML = badgesHtml;
            }

        } catch (e) {
            console.error('[Progress] Не удалось обновить прогресс:', e);
        }
    }

    // Открытие всплывающего окна со списком всех работ ученика
    openUserTasksModal() {
        this.ensureUserTasksModal();

        const modal = document.getElementById('userTasksModal');
        const titleElem = document.getElementById('user-tasks-modal-title');
        const tableContainer = document.getElementById('user-tasks-table-container');

        if (titleElem && this.currentUser) {
            titleElem.innerText = `Все работы ученика: ${this.currentUser.name}`;
        }

        const studentWorks = this.cachedSubmissions || [];

        if (studentWorks.length === 0) {
            tableContainer.innerHTML = '<div style="padding:20px; text-align:center; color:#94a3b8;">У вас пока нет сохраненных или сданных работ.</div>';
        } else {
            let tableHtml = `
                <div id="student-history-table-container" style="overflow-x: auto; max-height: 60vh;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left;">
                        <thead>
                            <tr>
                                <th style="padding: 10px;">Название</th>
                                <th style="padding: 10px;">Комм. ученика</th>
                                <th style="padding: 10px;">Комм. учителя</th>
                                <th style="padding: 10px; text-align: center;">Статус</th>
                                <th style="padding: 10px; text-align: center;">Баллы</th>
                                <th style="padding: 10px; text-align: center;">Награда</th>
                                <th style="padding: 10px; text-align: center;">Действие</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            studentWorks.forEach((sub, idx) => {
                const comp = String(sub.isCompleted).trim();
                let statusText = '<span style="color:#f59e0b; font-weight:600;">На проверке</span>';
                
                if (comp === '1') {
                    statusText = '<span style="color:#10b981; font-weight:600;">✔ Выполнено</span>';
                } else if (comp === '-1') {
                    statusText = '<span style="color:#ef4444; font-weight:600;">✖ Доработать</span>';
                }

                tableHtml += `
                    <tr>
                        <td style="padding: 10px;">${this.escapeHtml(sub.taskName || 'Без названия')}</td>
                        <td style="padding: 10px; color:#94a3b8;">${this.escapeHtml(sub.userComment || '—')}</td>
                        <td style="padding: 10px; color:#cbd5e1;">${this.escapeHtml(sub.teacherComment || '—')}</td>
                        <td style="padding: 10px; text-align: center;">${statusText}</td>
                        <td style="padding: 10px; text-align: center;">${sub.points !== undefined && sub.points !== '' ? sub.points + ' б.' : '—'}</td>
                        <td style="padding: 10px; text-align: center;">${this.escapeHtml(sub.reward || '—')}</td>
                        <td style="padding: 10px; text-align: center;">
                            <button class="btn-open-work-file btn-load-user-work" data-index="${idx}" style="padding: 6px 12px; border: none; border-radius: 6px; cursor: pointer;">Загрузить</button>
                        </td>
                    </tr>
                `;
            });

            tableHtml += `
                        </tbody>
                    </table>
                </div>
            `;

            tableContainer.innerHTML = tableHtml;

            // Навешиваем события на кнопки загрузки работы
            tableContainer.querySelectorAll('.btn-load-user-work').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const idx = e.target.getAttribute('data-index');
                    if (idx === null || !this.cachedSubmissions[idx]) return;

                    const sub = this.cachedSubmissions[idx];
                    
                    // 1. Ищем ID или URL файла во всех возможных свойствах объекта
                    let rawUrlOrId = sub.fileUrl || 
                                     sub.fileId || 
                                     sub.driveUrl || 
                                     sub.id || 
                                     sub.file || 
                                     sub.driveId || 
                                     sub.file_id;

                    // 2. Если поле файла пустое, пробуем найти файл по имени в кэше сохраненных проектов
                    if (!rawUrlOrId && sub.taskName) {
                        const foundProject = this.cachedUserProjects.find(p => p.name === sub.taskName || sub.taskName.includes(p.name));
                        if (foundProject) {
                            rawUrlOrId = foundProject.id || foundProject.fileId;
                        }
                    }

                    // 3. Если всё еще не нашли, проверяем кэш общих заданий
                    if (!rawUrlOrId && (sub.taskId || sub.taskName)) {
                        const foundTask = this.cachedTasks.find(t => t.id === sub.taskId || t.name === sub.taskName);
                        if (foundTask) {
                            rawUrlOrId = foundTask.fileId || foundTask.id;
                        }
                    }

                    if (!rawUrlOrId) {
                        alert('У этой работы отсутствует прикрепленный файл или ссылка!');
                        return console.error('[User] Поле файла пустое в объекте:', sub);
                    }

                    let fileId = rawUrlOrId;
                    const match = String(rawUrlOrId).match(/\/d\/([a-zA-Z0-9_-]+)/) || 
                                  String(rawUrlOrId).match(/id=([a-zA-Z0-9_-]+)/);
                    if (match && match[1]) {
                        fileId = match[1];
                    }

                    if (modal) modal.style.display = 'none';
                    await this.applyFileToEditor(fileId);
                });
            });
        }

        if (modal) modal.style.display = 'flex';
    }

    handleExerciseClick(type) {
        console.log(`[Exercise] Запущено упражнение: ${type}`);
        this.closeModal('studioModal');
    }

    handleGameClick(type) {
        console.log(`[Game] Запущена игра: ${type}`);
        this.closeModal('studioModal');
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

const userService = new UserService();
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => userService.init());
} else {
    userService.init();
}
