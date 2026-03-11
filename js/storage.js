/* Smart Classroom & Timetable Scheduler - LocalStorage and auth utilities */
(function () {
  const APP_KEY = 'smartTTS_data_v1';
  const SESSION_KEY = 'smartTTS_session_v1';

  const SAMPLE_DATA = {
    settings: {
      days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      slots: ['09:00-10:00', '10:00-11:00', '11:15-12:15', '13:00-14:00', '14:00-15:00']
    },
    users: [
      { id: 'u_admin', username: 'admin', password: 'admin123', role: 'Admin', name: 'System Admin' },
      { id: 'u_fac1', username: 'alice', password: 'faculty123', role: 'Faculty', name: 'Dr. Alice' },
      { id: 'u_viewer', username: 'viewer', password: 'viewer123', role: 'Viewer', name: 'Guest Viewer' }
    ],
    classrooms: [
      { id: 'r1', name: 'C-101', capacity: 60, type: 'classroom' },
      { id: 'r2', name: 'C-102', capacity: 45, type: 'classroom' },
      { id: 'r3', name: 'C-201', capacity: 55, type: 'classroom' },
      { id: 'r4', name: 'LAB-A', capacity: 35, type: 'lab' },
      { id: 'r5', name: 'LAB-B', capacity: 40, type: 'lab' }
    ],
    faculty: [
      { id: 'f1', name: 'Dr. Alice' },
      { id: 'f2', name: 'Dr. Bob' },
      { id: 'f3', name: 'Dr. Carla' },
      { id: 'f4', name: 'Prof. Daniel' },
      { id: 'f5', name: 'Prof. Emma' },
      { id: 'f6', name: 'Prof. Farhan' },
      { id: 'f7', name: 'Dr. Grace' },
      { id: 'f8', name: 'Prof. Henry' }
    ],
    subjects: [
      { id: 's1', code: 'CS101', name: 'Programming Fundamentals', defaultType: 'classroom' },
      { id: 's2', code: 'CS102', name: 'Data Structures', defaultType: 'classroom' },
      { id: 's3', code: 'CS103', name: 'Database Systems', defaultType: 'classroom' },
      { id: 's4', code: 'CS104', name: 'Operating Systems Lab', defaultType: 'lab' },
      { id: 's5', code: 'CS105', name: 'Computer Networks', defaultType: 'classroom' },
      { id: 's6', code: 'CS106', name: 'Web Engineering Lab', defaultType: 'lab' }
    ],
    batches: [
      { id: 'b1', name: 'CSE-A', size: 38, maxClassesPerDay: 4 },
      { id: 'b2', name: 'CSE-B', size: 42, maxClassesPerDay: 4 },
      { id: 'b3', name: 'IT-A', size: 34, maxClassesPerDay: 4 }
    ],
    teachingAssignments: [
      { id: 'a1', batchId: 'b1', subjectId: 's1', facultyId: 'f1', classesPerWeek: 3, roomType: 'classroom', fixedSlots: [] },
      { id: 'a2', batchId: 'b1', subjectId: 's2', facultyId: 'f2', classesPerWeek: 3, roomType: 'classroom', fixedSlots: [] },
      { id: 'a3', batchId: 'b1', subjectId: 's4', facultyId: 'f4', classesPerWeek: 2, roomType: 'lab', fixedSlots: [{ day: 'Friday', slot: '14:00-15:00' }] },
      { id: 'a4', batchId: 'b2', subjectId: 's1', facultyId: 'f1', classesPerWeek: 3, roomType: 'classroom', fixedSlots: [] },
      { id: 'a5', batchId: 'b2', subjectId: 's3', facultyId: 'f3', classesPerWeek: 3, roomType: 'classroom', fixedSlots: [] },
      { id: 'a6', batchId: 'b2', subjectId: 's6', facultyId: 'f8', classesPerWeek: 2, roomType: 'lab', fixedSlots: [{ day: 'Friday', slot: '13:00-14:00' }] },
      { id: 'a7', batchId: 'b3', subjectId: 's2', facultyId: 'f2', classesPerWeek: 3, roomType: 'classroom', fixedSlots: [] },
      { id: 'a8', batchId: 'b3', subjectId: 's5', facultyId: 'f5', classesPerWeek: 3, roomType: 'classroom', fixedSlots: [] },
      { id: 'a9', batchId: 'b3', subjectId: 's4', facultyId: 'f7', classesPerWeek: 2, roomType: 'lab', fixedSlots: [{ day: 'Friday', slot: '14:00-15:00' }] }
    ],
    generatedSolutions: [],
    selectedSolutionId: null
  };

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function loadData() {
    const raw = localStorage.getItem(APP_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      console.warn('Corrupted local data. Resetting storage.');
      return null;
    }
  }

  function saveData(data) {
    localStorage.setItem(APP_KEY, JSON.stringify(data));
  }

  function initData(forceReset = false) {
    const existing = loadData();
    if (!existing || forceReset) {
      const fresh = deepClone(SAMPLE_DATA);
      saveData(fresh);
      return fresh;
    }
    return existing;
  }

  function getData() {
    return initData(false);
  }

  function upsertCollection(collectionName, item) {
    const data = getData();
    const arr = data[collectionName] || [];
    const idx = arr.findIndex((x) => x.id === item.id);
    if (idx >= 0) arr[idx] = item;
    else arr.push(item);
    data[collectionName] = arr;
    saveData(data);
    return data;
  }

  function deleteFromCollection(collectionName, id) {
    const data = getData();
    data[collectionName] = (data[collectionName] || []).filter((x) => x.id !== id);

    if (collectionName === 'batches') {
      data.teachingAssignments = data.teachingAssignments.filter((x) => x.batchId !== id);
    }
    if (collectionName === 'subjects') {
      data.teachingAssignments = data.teachingAssignments.filter((x) => x.subjectId !== id);
    }
    if (collectionName === 'faculty') {
      data.teachingAssignments = data.teachingAssignments.filter((x) => x.facultyId !== id);
    }

    saveData(data);
    return data;
  }

  function setSession(user) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  }

  function getSession() {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
  }

  function login(username, password) {
    const data = getData();
    const user = (data.users || []).find(
      (u) => u.username.toLowerCase() === String(username).toLowerCase() && u.password === password
    );
    if (!user) return { ok: false, message: 'Invalid credentials' };
    const session = { id: user.id, username: user.username, role: user.role, name: user.name };
    setSession(session);
    return { ok: true, user: session };
  }

  function uid(prefix = 'id') {
    return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
  }

  window.StorageAPI = {
    APP_KEY,
    SESSION_KEY,
    SAMPLE_DATA,
    initData,
    getData,
    saveData,
    upsertCollection,
    deleteFromCollection,
    setSession,
    getSession,
    clearSession,
    login,
    uid,
    deepClone
  };
})();
