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

        // Загрузить список уроков при открытии Studio
        async function openStudio() {
            openModal('studioModal');
            const select = document.getElementById('select-lessons-list');
            select.innerHTML = '<option value="">Загрузка...</option>';

            const res = await userService.loadTasksFromDrive();
            if (res.success && res.tasks.length > 0) {
                select.innerHTML = '<option value="">-- Выберите урок --</option>';
                res.tasks.forEach(task => {
                    const opt = document.createElement('option');
                    opt.value = task.id;
                    opt.innerText = task.name;
                    select.appendChild(opt);
                });
            } else {
                select.innerHTML = '<option value="">Уроки не найдены</option>';
            }
        }

        // Вызов подгрузки файла урока в редактор
		async function loadSelectedLesson() {
			const select = document.getElementById('select-lessons-list');
			const fileId = select.value;
			if (!fileId) return alert('Выберите урок из списка');

			// Получаем глобальную ссылку на экземпляр вашего редактора
			const editorInstance = window.editor || (typeof editor !== 'undefined' ? editor : null);

			if (!editorInstance) {
				alert('Ошибка: Объект редактора (editor) не найден в системе.');
				return;
			}

			const res = await userService.loadFileContent(fileId);
			if (res.success && res.content) {
				// Проверяем наличие корректной функции из import_export_musicxml.js
				if (typeof importMusicXML === 'function') {
					importMusicXML(res.content, editorInstance); // Вызов функции с 2 аргументами
					closeModal('studioModal');
				} else {
					alert('Ошибка: функция importMusicXML не загружена.');
				}
			} else {
				alert('Не удалось загрузить файл урока с Google Диска.');
			}
		}

        // Сохранение проекта ученика на Google Диск
        // Исправленная функция сохранения выполненной работы
		async function saveStudioProject() {
			const title = document.getElementById('studio-project-title').value;
			const comment = document.getElementById('studio-project-comment').value;

			if (!title) return alert('Введите название проекта');

			const editorInstance = window.editor || (typeof editor !== 'undefined' ? editor : null);
			if (!editorInstance) return alert('Редактор не найден.');

			// Временно меняем название трека в UI для генерации XML
			const titleInput = document.getElementById('track-title-input');
			if (titleInput) titleInput.value = title;

			// Генерируем MusicXML с помощью функции из import_export_musicxml.js
			// (Используем встроенный генератор, если экспортируем в переменную)
			let xmlData = '';
			try {
				// Запускаем сборку текста
				xmlData = generateXMLFromEditor(editorInstance, title);
			} catch (e) {
				console.error('Ошибка сборки XML:', e);
			}

			if (!xmlData) {
				return alert('Не удалось сформировать нотный файл для сохранения.');
			}

			const btn = document.getElementById('btn-save-studio-project');
			btn.innerText = 'Сохранение...';
			btn.disabled = true;

			const res = await userService.saveStudentProject(title, comment, xmlData);
			
			btn.innerText = 'Сохранить на Google Диск';
			btn.disabled = false;

			if (res.success) {
				alert(res.message);
				closeModal('studioModal');
			} else {
				alert('Ошибка при сохранении: ' + res.message);
			}
		}	

	
class UserService {
    constructor() {
        this.gasUrl = 'https://script.google.com/macros/s/AKfycbyDOrEP45WXKf3d7I9P9Y9VhPemTWa2Qr69DGQZm3kfoR1GMTx3XhpKPnEmPvU8WyX8/exec';
        this.currentUser = JSON.parse(localStorage.getItem('app_user')) || null;
    }

    init() {
        this.updateUI();
        this.bindEvents();
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

        document.getElementById('btn-studio')?.addEventListener('click', () => this.openStudio());
        document.getElementById('btn-close-studio-modal')?.addEventListener('click', () => this.closeModal('studioModal'));
        document.getElementById('btn-load-lesson')?.addEventListener('click', () => this.loadSelectedLesson());
        document.getElementById('btn-load-user-project')?.addEventListener('click', () => this.loadSelectedUserProject());
        document.getElementById('btn-save-studio-project')?.addEventListener('click', () => this.saveStudioProject());

        // Обработчики кнопок Упражнений и Игр
        document.querySelectorAll('.exercise-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.handleExerciseClick(e.target.dataset.type));
        });

        document.querySelectorAll('.game-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.handleGameClick(e.target.dataset.type));
        });
		
		document.getElementById('btn-studio')?.addEventListener('click', () => {
			if (this.currentUser && String(this.currentUser.id) === '1') {
				window.teacherService?.openTeacherPanel();
			} else {
				this.openStudio();
			}
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
			// Проверка: ID === 1 или String(ID) === "1"
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
        
        // Сброс списков
        const selectTask = document.getElementById('select-lessons-list');
        const selectUserProjects = document.getElementById('select-user-projects-list');
        if (selectTask) selectTask.innerHTML = '<option value="">Загрузка...</option>';
        if (selectUserProjects) selectUserProjects.innerHTML = '<option value="">Загрузка...</option>';

        // 1. Загрузка стандартных заданий
        const resTasks = await this.loadTasksFromDrive();
        if (resTasks.success && resTasks.tasks?.length > 0) {
            selectTask.innerHTML = '<option value="">-- Выберите задание --</option>';
            resTasks.tasks.forEach(task => {
                const opt = document.createElement('option');
                opt.value = task.id;
                opt.innerText = task.name;
                selectTask.appendChild(opt);
            });
        } else {
            if (selectTask) selectTask.innerHTML = '<option value="">Задания не найдены</option>';
        }

        // 2. Загрузка выполненных работ ученика (если авторизован)
        if (this.currentUser) {
            const resUserProjects = await this.loadUserProjectsFromDrive();
            if (resUserProjects.success && resUserProjects.files?.length > 0) {
                selectUserProjects.innerHTML = '<option value="">-- Выберите вашу работу --</option>';
                resUserProjects.files.forEach(file => {
                    const opt = document.createElement('option');
                    opt.value = file.id;
                    opt.innerText = file.name;
                    selectUserProjects.appendChild(opt);
                });
            } else {
                if (selectUserProjects) selectUserProjects.innerHTML = '<option value="">Сохраненные работы не найдены</option>';
            }
        } else {
            if (selectUserProjects) selectUserProjects.innerHTML = '<option value="">Требуется авторизация</option>';
        }

        // 3. Обновление "Мой прогресс" и "Достижения"
        this.updateProgressAndAchievements(resTasks.tasks || []);
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
            return await response.json();
        } catch(e) {
            console.error('[Drive] Ошибка загрузки заданий:', e);
            return { success: false };
        }
    }

    async loadUserProjectsFromDrive() {
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
            return await response.json();
        } catch(e) {
            console.error('[Drive] Ошибка загрузки личных работ:', e);
            return { success: false };
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
        const fileId = select?.value;
        if (!fileId) return console.warn('[Studio] Выберите задание из списка');

        this.applyFileToEditor(fileId);
    }

    async loadSelectedUserProject() {
        const select = document.getElementById('select-user-projects-list');
        const fileId = select?.value;
        if (!fileId) return console.warn('[Studio] Выберите личную работу из списка');

        this.applyFileToEditor(fileId);
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
				// Загрузка XML текста непосредственно в редактор
				importMusicXML(res.content, editorInstance);
				
				// Закрываем модальные окна
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

		const rawTitle = titleInput ? titleInput.value.trim() : '';
		const comment = commentInput ? commentInput.value.trim() : '';

		if (!rawTitle) return alert('Введите название работы');

		// 1. Берем имя из текущего авторизованного пользователя (this.currentUser)
		const userName = (this.currentUser && this.currentUser.name) 
			? this.currentUser.name.trim() 
			: 'Ученик';

		// 2. Формируем итоговое название в формате "Имя - Название"
		const title = `${userName} - ${rawTitle}`;

		const editorInstance = window.editor || (typeof editor !== 'undefined' ? editor : null);
		if (!editorInstance) return alert('Редактор не найден');

		// Сборка XML через единый генератор
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

		console.log('[Studio] Сохранение проекта под именем:', title);
		const res = await this.saveStudentProject(title, comment, xmlData);
		
		if (btn) {
			btn.innerText = 'Сохранить';
			btn.disabled = false;
		}

		if (res.success) {
			alert(res.message || 'Проект успешно сохранен!');
			this.closeModal('studioModal');
		} else {
			alert('Ошибка сохранения: ' + (res.message || 'Неизвестная ошибка'));
		}
	}

    // Добавленный недостающий метод отправки файла на сервер
    async saveStudentProject(title, comment, xmlData) {
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
                    fileData: xmlData
                })
            });

            return await response.json();
        } catch (e) {
            console.error('[Studio] Ошибка сетевого запроса при сохранении:', e);
            return { success: false, message: 'Ошибка сети при отправке файла' };
        }
    }

    async updateProgressAndAchievements(allTasks) {
        const progressContainer = document.getElementById('progress-status-container');
        const achievementsContainer = document.getElementById('achievements-container');

        if (!this.currentUser) {
            if (progressContainer) progressContainer.innerHTML = '<em>Авторизуйтесь для просмотра прогресса</em>';
            if (achievementsContainer) achievementsContainer.innerHTML = '<em>Авторизуйтесь для просмотра наград</em>';
            return;
        }

        // Запрос истории прохождения пользователя
        try {
            const response = await fetch(this.gasUrl, {
                method: 'POST',
                mode: 'cors',
                redirect: 'follow',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'getUserProgress', userId: this.currentUser.id })
            });
            const data = await response.json();
            const completedTaskNames = data.completedTasks || []; // Массив имён выполненных заданий

            // Отрисовка Прогресса
            if (progressContainer) {
                let html = `<div class="progress-summary">Освоено ${completedTaskNames.length} из ${allTasks.length} уроков</div><ul class="progress-list">`;
                allTasks.forEach(task => {
                    const isDone = completedTaskNames.includes(task.name);
                    html += `<li class="${isDone ? 'done' : 'pending'}">
                        <span class="status-icon">${isDone ? '✓' : '○'}</span>
                        <span class="task-name">${task.name}</span>
                    </li>`;
                });
                html += '</ul>';
                progressContainer.innerHTML = html;
            }

            // Отрисовка Достижений
            if (achievementsContainer) {
                let badgesHtml = '<div class="badges-grid">';
                badgesHtml += `<div class="badge-card ${completedTaskNames.length >= 1 ? 'unlocked' : 'locked'}">
                    <div class="badge-icon">🎵</div>
                    <div class="badge-title">Первый шаг</div>
                </div>`;
                badgesHtml += `<div class="badge-card ${completedTaskNames.length >= 5 ? 'unlocked' : 'locked'}">
                    <div class="badge-icon">🎼</div>
                    <div class="badge-title">Знаток</div>
                </div>`;
                badgesHtml += `<div class="badge-card ${completedTaskNames.length >= 10 ? 'unlocked' : 'locked'}">
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

    exportMusicXMLString(editor, trackTitle) {
        const bpm = document.getElementById('input-bpm')?.value || 120;
        const timeSig = (document.getElementById('select-time-sig')?.value || '4/4').split('/');
        const beats = parseInt(timeSig[0]) || 4;
        const beatType = parseInt(timeSig[1]) || 4;
        const slotsPerBeat = 16 / beatType;
        const beatsPerMeasure = beats * slotsPerBeat;

        const trackIds = (typeof editor.getOrderedTracks === 'function') 
            ? editor.getOrderedTracks() 
            : Object.keys(editor.tracks);

        let maxEndSlot = 0;
        trackIds.forEach(key => {
            (editor.tracks[key] || []).forEach(note => {
                if (note.start + note.duration > maxEndSlot) maxEndSlot = note.start + note.duration;
            });
        });

        const totalMeasures = Math.max(1, Math.ceil(maxEndSlot / beatsPerMeasure));

        let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<score-partwise version="4.0">\n`;
        xml += `  <work><work-title>${trackTitle}</work-title></work>\n  <part-list>\n`;
        
        let pId = 1;
        const activePartIds = {};
        trackIds.forEach(key => {
            const partId = `P${pId++}`;
            activePartIds[key] = partId;
            const name = editor.instrumentTypes[key]?.name || key;
            xml += `    <score-part id="${partId}"><part-name>${name}</part-name></score-part>\n`;
        });
        xml += `  </part-list>\n`;

        trackIds.forEach(key => {
            const partId = activePartIds[key];
            xml += `  <part id="${partId}">\n`;
            for (let m = 0; m < totalMeasures; m++) {
                xml += `    <measure number="${m + 1}">\n`;
                if (m === 0) {
                    xml += `      <attributes><divisions>4</divisions><time><beats>${beats}</beats><beat-type>${beatType}</beat-type></time></attributes>\n`;
                }
                xml += `    </measure>\n`;
            }
            xml += `  </part>\n`;
        });
        xml += `</score-partwise>`;
        return xml;
    }

}

const userService = new UserService();
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => userService.init());
} else {
    userService.init();
}