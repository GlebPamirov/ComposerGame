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
        this.currentTaskId = ''; // Храним task_id открытого задания
    }

    init() {
        this.updateUI();
        this.bindEvents();
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

    // "Мой прогресс": разделение на выполненные, отправленные на доработку и невыполненные задания
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
			const userSubmissions = data.submissions || [];

			// 1. Формируем taskItems ВНЕ блоков if, чтобы переменная была доступна везде
			const taskItems = (allTasks || []).map(task => {
				const taskName = task.name;
				const taskId = task.id;
				let status = 'pending'; // 'revision', 'pending', 'done'

				// Проверка по ID или Имени
				if (completedTaskNames.includes(taskName) || (taskId && completedTaskNames.includes(taskId))) {
					status = 'done';
				} else if (revisionTaskNames.includes(taskName) || (taskId && revisionTaskNames.includes(taskId))) {
					status = 'revision';
				} else {
					// Поиск в списке сданных работ ученика
					const foundSub = userSubmissions.find(s => 
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

			// 2. Сортировка по приоритету
			const statusPriority = { 'revision': 1, 'pending': 2, 'done': 3 };
			taskItems.sort((a, b) => statusPriority[a.status] - statusPriority[b.status]);

			const doneCount = taskItems.filter(t => t.status === 'done').length;

			// 3. Рендер списка "Мой прогресс"
			if (progressContainer) {
				let html = `<div class="progress-summary" style="margin-bottom:12px; font-weight:600; color:#e2e8f0;">Освоено ${doneCount} из ${allTasks.length} уроков</div>`;
				html += `<ul class="progress-list" style="list-style:none; padding:0; margin:0; max-height:320px; overflow-y:auto;">`;
				
				taskItems.forEach(item => {
					const { name, status } = item;
					let iconHtml = '';
					let badgeHtml = '';

					if (status === 'done') {
						iconHtml = '<span style="color: #4ade80; font-weight: bold; margin-right: 10px;">✓</span>';
						badgeHtml = '<span style="font-size:12px; color:#4ade80; background:rgba(74,222,128,0.15); padding:2px 8px; border-radius:10px; margin-left:auto;">Выполнено</span>';
					} else if (status === 'revision') {
						iconHtml = '<span style="color: #f87171; font-weight: bold; margin-right: 10px;">✕</span>';
						badgeHtml = '<span style="font-size:12px; color:#f87171; background:rgba(248,113,113,0.15); padding:2px 8px; border-radius:10px; margin-left:auto;">Доработать</span>';
					} else {
						iconHtml = '<span style="color: #94a3b8; font-weight: bold; margin-right: 10px;">○</span>';
						badgeHtml = '<span style="font-size:12px; color:#94a3b8; background:rgba(148,163,184,0.15); padding:2px 8px; border-radius:10px; margin-left:auto;">Не выполнено</span>';
					}

					html += `<li class="progress-item ${status}" style="display:flex; align-items:center; padding:8px 6px; border-bottom:1px solid rgba(255,255,255,0.07);">
						${iconHtml}
						<span class="task-name" style="font-size:14px; color:${status === 'done' ? '#94a3b8' : '#f8fafc'}; text-decoration:${status === 'done' ? 'line-through' : 'none'};">${this.escapeHtml(name)}</span>
						${badgeHtml}
					</li>`;
				});

				html += '</ul>';
				progressContainer.innerHTML = html;
			}

			// 4. Рендер наград / ачивок
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
