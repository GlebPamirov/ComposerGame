// ID папок на Google Диске
const TASKS_FOLDER_ID = '11x63qnh5Pd3GraHjGX6IWPa2sqKPv3W2';
const STUDENT_UPLOADS_FOLDER_ID = '1RHSK6jHnlf5qM_u90XrjTDRVY-Pjm9oa';

// Обработчик POST-запросов (браузер отправляет большинство API-запросов сюда)
function doPost(e) {
  return handleRequest(e);
}

// Обработчик GET-запросов
function doGet(e) {
  return handleRequest(e);
}

// Единая логика маршрутизации всех запросов
function handleRequest(e) {
  let output;
  try {
    let data = {};
    
    // Считываем данные из POST (JSON) или из GET/POST URL-параметров
    if (e && e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    } else if (e && e.parameter) {
      data = e.parameter;
    }
    
    const action = data.action;

    if (action === 'login') output = loginUser(data.name, data.password);
    else if (action === 'getTasksFromDrive') output = getTasksFromDrive();
    else if (action === 'getFileContent') output = getFileContent(data.fileId);
    else if (action === 'saveProgress' || action === 'saveStudentProject') output = saveProgress(data);
    else if (action === 'getUserSavedProjects') output = getUserSavedProjects(data.userName);
    else if (action === 'getUserProgress') output = getUserProgress(data.userId);
    else if (action === 'getAllStudents') output = getAllStudents();
    else if (action === 'getStudentProjects') output = getUserSavedProjects(data.studentName);
    else if (action === 'getStudentsWithProgress') output = getStudentsWithProgress();
    else if (action === 'saveTeacherReview') output = saveTeacherReview(data);
    else if (action === 'saveNewTaskByTeacher') output = saveNewTaskByTeacher(data);
    else output = { success: false, message: 'Неизвестное действие: ' + action };

  } catch (err) {
    output = { success: false, message: 'Ошибка GAS: ' + err.toString() };
  }

  // Возвращаем корректный JSON-ответ с поддержкой CORS для браузера
  return ContentService.createTextOutput(JSON.stringify(output))
    .setMimeType(ContentService.MimeType.JSON);
}

// 1. Авторизация
function loginUser(name, password) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('user');
  if (!sheet) return { success: false, message: 'Лист "user" не найден' };

  const values = sheet.getDataRange().getValues();

  for (let i = 1; i < values.length; i++) {
    const [id, userName, userPass] = values[i];
    if (String(userName).trim() === String(name).trim() && String(userPass) === String(password)) {
      return { success: true, user: { id, name: userName } };
    }
  }
  return { success: false, message: 'Неверное имя пользователя или пароль' };
}

// 2. Список уроков из Google Диска
function getTasksFromDrive() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('tasks');
  if (!sheet) return { success: false, message: 'Лист "tasks" не найден' };

  const values = sheet.getDataRange().getValues();
  const tasks = [];

  for (let i = 1; i < values.length; i++) {
    const [taskId, taskName, description, fileUrl, isActive] = values[i];
    
    // Проверяем активность
    if (taskId && (isActive === true || isActive === '' || isActive === 1)) {
      // Извлекаем Google Drive File ID из ссылки
      let driveFileId = '';
      const match = String(fileUrl).match(/[-\w]{25,}/);
      if (match) driveFileId = match[0];

      tasks.push({
        id: String(taskId).trim(),             // 1-я колонка: task_id (сохраняется в progress)
        fileId: driveFileId || String(fileUrl), // ID файла на Диске (для открытия нот)
        name: String(taskName).trim()          // Название урока
      });
    }
  }
  return { success: true, tasks };
}

// 3. Получение содержимого файла .musicxml
function getFileContent(fileId) {
  if (!fileId) return { success: false, message: 'Не передан ID файла или задания' };

  try {
    let actualFileId = fileId;

    // Если передан task_id (начинается с task_ или не похож на ID Google Диска)
    if (String(fileId).startsWith('task_')) {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName('tasks');
      if (sheet) {
        const values = sheet.getDataRange().getValues();
        for (let i = 1; i < values.length; i++) {
          if (String(values[i][0]).trim() === String(fileId).trim()) {
            const rawUrl = String(values[i][3]); // 4-я колонка (link/fileUrl)
            
            // Извлекаем чистый ID файла из URL вида https://drive.google.com/open?id=123 или https://drive.google.com/file/d/123/view
            const match = rawUrl.match(/[-\w]{25,}/);
            if (match) {
              actualFileId = match[0];
            } else {
              actualFileId = rawUrl;
            }
            break;
          }
        }
      }
    }

    const file = DriveApp.getFileById(actualFileId);
    const content = file.getBlob().getDataAsString();
    return { success: true, content };

  } catch (err) {
    return { success: false, message: 'Ошибка GAS: ' + err.toString() };
  }
}

// 4. Сохранение работы ученика на Диск и запись в таблицу progress (с колонками task_id и is_completed)
function saveProgress(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('progress');
  if (!sheet) return { success: false, message: 'Лист "progress" не найден' };
  
  const parentFolder = DriveApp.getFolderById(STUDENT_UPLOADS_FOLDER_ID);
  const userName = data.userName || 'Ученик';
  
  // Создаем/находим папку ученика
  let userFolder;
  const folders = parentFolder.getFoldersByName(userName);
  if (folders.hasNext()) {
    userFolder = folders.next();
  } else {
    userFolder = parentFolder.createFolder(userName);
  }

  // Принимаем название либо из title, либо из taskName
  const taskName = data.title || data.taskName || 'Проект';
  
  // Принимаем содержимое файла
  const fileContent = data.fileData || data.fileContent || '';

  // Создаем файл с нотами ученика (.musicxml)
  const fileName = `${taskName}.musicxml`;
  const blob = Utilities.newBlob(fileContent, 'application/xml', fileName);
  const file = userFolder.createFile(blob);
  const fileUrl = file.getUrl();

  // Получаем taskId строго из запроса (без поиска по имени)
  const taskId = data.taskId || data.task_id || '';

  const isCompleted = (data.isCompleted !== undefined && data.isCompleted !== null) 
    ? data.isCompleted 
    : (data.is_completed !== undefined ? data.is_completed : '');

  // Запись в таблицу progress (10 колонок)
  sheet.appendRow([
    data.userId || '',
    userName,
    taskName,
    data.points || 0,
    data.comment || data.userComment || '',
    '',          // 6: teacher_comment
    fileUrl,     // 7: fileUrl
    '',          // 8: reward
    taskId,      // 9: task_id (Записывается напрямую из запроса)
    isCompleted  // 10: is_completed (1, -1 или пустая строка)
  ]);

  return { success: true, message: 'Проект успешно сохранен на Google Диск!', fileUrl, taskId };
}

// 5. Получение списка всех сохраненных файлов из личной папки ученика
function getUserSavedProjects(userName) {
  try {
    if (!userName) return { success: false, message: 'Имя пользователя не передано' };

    const parentFolder = DriveApp.getFolderById(STUDENT_UPLOADS_FOLDER_ID);
    const folders = parentFolder.getFoldersByName(userName);

    if (!folders.hasNext()) {
      return { success: true, files: [], message: 'Персональная папка пока не создана' };
    }

    const userFolder = folders.next();
    const files = userFolder.getFiles();
    const userFiles = [];

    while (files.hasNext()) {
      const file = files.next();
      const fileName = file.getName();
      
      if (fileName.endsWith('.musicxml') || fileName.endsWith('.musicsml') || fileName.endsWith('.xml')) {
        userFiles.push({
          id: file.getId(),
          name: fileName.replace(/\.(musicxml|musicsml|xml)$/, '')
        });
      }
    }

    return { success: true, files: userFiles };
  } catch (err) {
    return { success: false, message: 'Ошибка получения файлов: ' + err.toString() };
  }
}

// 6. Получение истории пройденных заданий ученика
function getUserProgress(userId) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('progress');
    if (!sheet) return { success: true, completedTasks: [], revisionTasks: [], submissions: [] };

    const values = sheet.getDataRange().getValues();
    const completedTasks = new Set();
    const revisionTasks = new Set();
    const submissions = [];

    for (let i = 1; i < values.length; i++) {
      const [uId, uName, tName, points, uComment, tComment, fileUrl, reward, taskId, isCompleted] = values[i];
      if (String(uId) === String(userId)) {
        const compVal = String(isCompleted).trim();
        
        submissions.push({
          rowIndex: i + 1,
          taskName: String(tName || '').trim(),
          taskId: String(taskId || '').trim(),
          points: points,
          isCompleted: compVal,
          userComment: uComment || '',
          teacherComment: tComment || ''
        });

        if (compVal === '1') {
          if (tName) completedTasks.add(String(tName).trim());
          if (taskId) completedTasks.add(String(taskId).trim());
        } else if (compVal === '-1') {
          if (tName) revisionTasks.add(String(tName).trim());
          if (taskId) revisionTasks.add(String(taskId).trim());
        }
      }
    }

    return { 
      success: true, 
      completedTasks: Array.from(completedTasks),
      revisionTasks: Array.from(revisionTasks),
      submissions: submissions 
    };
  } catch (err) {
    return { success: false, completedTasks: [], revisionTasks: [], submissions: [], error: err.toString() };
  }
}

// 7. Получение списка всех учеников из таблицы 'user'
function getAllStudents() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('user');
    if (!sheet) return { success: false, message: 'Лист "user" не найден' };

    const values = sheet.getDataRange().getValues();
    const students = [];

    for (let i = 1; i < values.length; i++) {
      const [id, userName] = values[i];
      if (userName) {
        students.push({
          id: id,
          name: String(userName).trim()
        });
      }
    }

    return { success: true, students };
  } catch (err) {
    return { success: false, message: 'Ошибка получения списка учеников: ' + err.toString() };
  }
}

// 8. Сохранение нового общего задания учителем
function saveNewTaskByTeacher(data) {
  try {
    const folder = DriveApp.getFolderById(TASKS_FOLDER_ID);
    const fileName = `${data.taskName || 'Новое задание'}.musicxml`;
    const blob = Utilities.newBlob(data.fileContent || '', 'application/xml', fileName);
    
    let file;
    const existing = folder.getFilesByName(fileName);
    if (existing.hasNext()) {
      file = existing.next();
      file.setContent(data.fileContent || '');
    } else {
      file = folder.createFile(blob);
    }

    const fileUrl = file.getUrl();

    // Запись/обновление метаданных во вкладке 'tasks'
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName('tasks');
    if (!sheet) {
      sheet = ss.insertSheet('tasks');
      sheet.appendRow(['task_id', 'task', 'description', 'link', 'is_active']);
    }

    const taskName = data.taskName || 'Новое задание';
    const description = data.description || '';
    const isActive = data.isActive !== undefined ? data.isActive : true;

    const values = sheet.getDataRange().getValues();
    let rowIndex = -1;
    let taskId = '';

    for (let i = 1; i < values.length; i++) {
      if (String(values[i][1]).trim() === String(taskName).trim()) {
        rowIndex = i + 1;
        taskId = values[i][0];
        break;
      }
    }

    if (rowIndex > 0) {
      sheet.getRange(rowIndex, 3).setValue(description);
      sheet.getRange(rowIndex, 4).setValue(fileUrl);
      sheet.getRange(rowIndex, 5).setValue(isActive);
    } else {
      taskId = 'task_' + new Date().getTime();
      sheet.appendRow([taskId, taskName, description, fileUrl, isActive]);
    }

    return { 
      success: true, 
      message: 'Задание успешно сохранено в общую папку и запись добавлена в таблицу!',
      taskId: taskId,
      fileUrl: fileUrl
    };
  } catch (err) {
    return { success: false, message: 'Ошибка сохранения задания: ' + err.toString() };
  }
}

// 9. Получение списка всех ответов учеников из таблицы 'progress'
function getStudentsWithProgress() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('progress');
    if (!sheet) return { success: true, submissions: [] };

    const values = sheet.getDataRange().getValues();
    const submissions = [];

    for (let i = 1; i < values.length; i++) {
      const [uId, uName, tName, points, uComment, tComment, fileUrl, reward, taskId, isCompleted] = values[i];
      if (uName && tName) {
        submissions.push({
          rowIndex: i + 1,
          userId: uId,
          userName: uName,
          taskName: tName,
          points: points !== undefined ? points : '',
          userComment: uComment || '',
          teacherComment: tComment || '',
          fileUrl: fileUrl || '',
          reward: reward || '',
          taskId: taskId || '',
          isCompleted: isCompleted !== undefined ? String(isCompleted).trim() : ''
        });
      }
    }

    return { success: true, submissions };
  } catch (err) {
    return { success: false, message: 'Ошибка получения данных: ' + err.toString() };
  }
}

// 10. Сохранение оценки, комментария учителя, награды и статуса выполнения
function saveTeacherReview(data) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('progress');
    if (!sheet) return { success: false, message: 'Лист "progress" не найден' };

    const rowIndex = parseInt(data.rowIndex);
    if (!rowIndex) return { success: false, message: 'Не указана строка записи' };

    if (data.points !== undefined) sheet.getRange(rowIndex, 4).setValue(data.points);
    if (data.teacherComment !== undefined) sheet.getRange(rowIndex, 6).setValue(data.teacherComment);
    if (data.reward !== undefined) sheet.getRange(rowIndex, 8).setValue(data.reward);
    if (data.isCompleted !== undefined || data.is_completed !== undefined) {
      const val = data.isCompleted !== undefined ? data.isCompleted : data.is_completed;
      sheet.getRange(rowIndex, 10).setValue(val);
    }

    return { success: true, message: 'Оценка и статус успешно сохранены!' };
  } catch (err) {
    return { success: false, message: 'Ошибка записи: ' + err.toString() };
  }
}