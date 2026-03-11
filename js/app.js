/* Shared UI logic: auth, navigation, and dashboard data management */
(function () {
  const route = window.location.pathname.split('/').pop() || 'index.html';

  function qs(sel, root = document) {
    return root.querySelector(sel);
  }

  function qsa(sel, root = document) {
    return [...root.querySelectorAll(sel)];
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function safeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function go(path) {
    window.location.href = path;
  }

  function ensureAuth(requiredRoles = null) {
    const session = StorageAPI.getSession();
    if (!session) {
      if (route !== 'login.html') go('login.html');
      return null;
    }
    if (requiredRoles && !requiredRoles.includes(session.role)) {
      alert('You do not have access to this page.');
      go('scheduler.html');
      return null;
    }
    return session;
  }

  function logout() {
    StorageAPI.clearSession();
    go('login.html');
  }

  function parseFixedSlots(input) {
    const text = String(input || '').trim();
    if (!text) return [];

    // Format: Friday@14:00-15:00;Monday@09:00-10:00
    return text
      .split(';')
      .map((x) => x.trim())
      .filter(Boolean)
      .map((pair) => {
        const [day, slot] = pair.split('@').map((x) => x && x.trim());
        return day && slot ? { day, slot } : null;
      })
      .filter(Boolean);
  }

  function renderSelectOptions(selectId, items, valueKey, labelFn) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    sel.innerHTML = items
      .map((item) => `<option value="${safeHtml(item[valueKey])}">${safeHtml(labelFn(item))}</option>`)
      .join('');
  }

  function refreshDashboardTables() {
    const data = StorageAPI.getData();

    // Classrooms
    const classroomBody = qs('#table-classrooms tbody');
    if (classroomBody) {
      classroomBody.innerHTML = data.classrooms
        .map(
          (r) => `<tr>
            <td>${safeHtml(r.name)}</td>
            <td>${r.capacity}</td>
            <td>${safeHtml(r.type)}</td>
            <td><button data-del="classrooms:${r.id}" class="btn danger sm">Delete</button></td>
          </tr>`
        )
        .join('');
    }

    // Subjects
    const subjectBody = qs('#table-subjects tbody');
    if (subjectBody) {
      subjectBody.innerHTML = data.subjects
        .map(
          (s) => `<tr>
            <td>${safeHtml(s.code)}</td>
            <td>${safeHtml(s.name)}</td>
            <td>${safeHtml(s.defaultType)}</td>
            <td><button data-del="subjects:${s.id}" class="btn danger sm">Delete</button></td>
          </tr>`
        )
        .join('');
    }

    // Faculty
    const facultyBody = qs('#table-faculty tbody');
    if (facultyBody) {
      facultyBody.innerHTML = data.faculty
        .map(
          (f) => `<tr>
            <td>${safeHtml(f.name)}</td>
            <td><button data-del="faculty:${f.id}" class="btn danger sm">Delete</button></td>
          </tr>`
        )
        .join('');
    }

    // Batches
    const batchBody = qs('#table-batches tbody');
    if (batchBody) {
      batchBody.innerHTML = data.batches
        .map(
          (b) => `<tr>
            <td>${safeHtml(b.name)}</td>
            <td>${b.size}</td>
            <td>${b.maxClassesPerDay}</td>
            <td><button data-del="batches:${b.id}" class="btn danger sm">Delete</button></td>
          </tr>`
        )
        .join('');
    }

    // Assignments
    const mapSub = Object.fromEntries(data.subjects.map((s) => [s.id, s]));
    const mapFac = Object.fromEntries(data.faculty.map((f) => [f.id, f]));
    const mapBatch = Object.fromEntries(data.batches.map((b) => [b.id, b]));

    const assignmentBody = qs('#table-assignments tbody');
    if (assignmentBody) {
      assignmentBody.innerHTML = data.teachingAssignments
        .map((a) => {
          const fixedText = (a.fixedSlots || []).map((f) => `${f.day}@${f.slot}`).join('; ') || '-';
          return `<tr>
            <td>${safeHtml(mapBatch[a.batchId]?.name || a.batchId)}</td>
            <td>${safeHtml(mapSub[a.subjectId]?.name || a.subjectId)}</td>
            <td>${safeHtml(mapFac[a.facultyId]?.name || a.facultyId)}</td>
            <td>${a.classesPerWeek}</td>
            <td>${safeHtml(a.roomType || mapSub[a.subjectId]?.defaultType || 'classroom')}</td>
            <td>${safeHtml(fixedText)}</td>
            <td><button data-del="teachingAssignments:${a.id}" class="btn danger sm">Delete</button></td>
          </tr>`;
        })
        .join('');
    }

    // Form selects
    renderSelectOptions('assignment-batch', data.batches, 'id', (x) => x.name);
    renderSelectOptions('assignment-subject', data.subjects, 'id', (x) => `${x.code} - ${x.name}`);
    renderSelectOptions('assignment-faculty', data.faculty, 'id', (x) => x.name);

    const user = StorageAPI.getSession();
    setText('welcomeName', user ? `${user.name} (${user.role})` : '');
  }

  function wireDeleteButtons() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-del]');
      if (!btn) return;
      const [collection, id] = btn.dataset.del.split(':');
      if (!collection || !id) return;
      if (!confirm('Delete this item?')) return;
      StorageAPI.deleteFromCollection(collection, id);
      refreshDashboardTables();
    });
  }

  function setupDashboard() {
    const session = ensureAuth(['Admin']);
    if (!session) return;

    setText('welcomeName', `${session.name} (${session.role})`);

    qs('#btn-logout')?.addEventListener('click', logout);
    qs('#btn-reset-data')?.addEventListener('click', () => {
      if (!confirm('Reset all app data to sample defaults?')) return;
      StorageAPI.initData(true);
      refreshDashboardTables();
      alert('Data has been reset.');
    });

    qs('#form-classroom')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const item = {
        id: StorageAPI.uid('r'),
        name: qs('#classroom-name').value.trim(),
        capacity: Number(qs('#classroom-capacity').value),
        type: qs('#classroom-type').value
      };
      if (!item.name || !item.capacity) return alert('Please enter classroom name and capacity.');
      StorageAPI.upsertCollection('classrooms', item);
      e.target.reset();
      refreshDashboardTables();
    });

    qs('#form-subject')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const item = {
        id: StorageAPI.uid('s'),
        code: qs('#subject-code').value.trim(),
        name: qs('#subject-name').value.trim(),
        defaultType: qs('#subject-type').value
      };
      if (!item.code || !item.name) return alert('Please enter subject code and name.');
      StorageAPI.upsertCollection('subjects', item);
      e.target.reset();
      refreshDashboardTables();
    });

    qs('#form-faculty')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const item = {
        id: StorageAPI.uid('f'),
        name: qs('#faculty-name').value.trim()
      };
      if (!item.name) return alert('Please enter faculty name.');
      StorageAPI.upsertCollection('faculty', item);
      e.target.reset();
      refreshDashboardTables();
    });

    qs('#form-batch')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const item = {
        id: StorageAPI.uid('b'),
        name: qs('#batch-name').value.trim(),
        size: Number(qs('#batch-size').value),
        maxClassesPerDay: Number(qs('#batch-max').value)
      };
      if (!item.name || !item.size || !item.maxClassesPerDay) {
        return alert('Please enter batch name, size, and max classes/day.');
      }
      StorageAPI.upsertCollection('batches', item);
      e.target.reset();
      refreshDashboardTables();
    });

    qs('#form-assignment')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const item = {
        id: StorageAPI.uid('a'),
        batchId: qs('#assignment-batch').value,
        subjectId: qs('#assignment-subject').value,
        facultyId: qs('#assignment-faculty').value,
        classesPerWeek: Number(qs('#assignment-cpw').value),
        roomType: qs('#assignment-roomtype').value,
        fixedSlots: parseFixedSlots(qs('#assignment-fixed').value)
      };

      if (!item.batchId || !item.subjectId || !item.facultyId || !item.classesPerWeek) {
        return alert('Please fill all required assignment fields.');
      }

      StorageAPI.upsertCollection('teachingAssignments', item);
      e.target.reset();
      refreshDashboardTables();
    });

    wireDeleteButtons();
    refreshDashboardTables();
  }

  function setupLogin() {
    StorageAPI.initData(false);
    const current = StorageAPI.getSession();
    if (current) {
      go(current.role === 'Admin' ? 'dashboard.html' : 'scheduler.html');
      return;
    }

    qs('#form-login')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const username = qs('#username').value.trim();
      const password = qs('#password').value;
      const result = StorageAPI.login(username, password);
      if (!result.ok) return alert(result.message);
      go(result.user.role === 'Admin' ? 'dashboard.html' : 'scheduler.html');
    });

    qs('#demoCreds').innerHTML = `
      <li><b>Admin:</b> admin / admin123</li>
      <li><b>Faculty:</b> alice / faculty123</li>
      <li><b>Viewer:</b> viewer / viewer123</li>
    `;
  }

  function setupIndex() {
    StorageAPI.initData(false);
    const session = StorageAPI.getSession();
    if (!session) go('login.html');
    else if (session.role === 'Admin') go('dashboard.html');
    else go('scheduler.html');
  }

  function setupSchedulerShell() {
    const session = ensureAuth(['Admin', 'Faculty', 'Viewer']);
    if (!session) return;
    setText('welcomeName', `${session.name} (${session.role})`);
    qs('#btn-logout')?.addEventListener('click', logout);

    const adminOnly = qsa('.admin-only');
    if (session.role !== 'Admin') {
      adminOnly.forEach((x) => x.classList.add('hidden'));
    }
  }

  if (route === 'index.html' || route === '') setupIndex();
  if (route === 'login.html') setupLogin();
  if (route === 'dashboard.html') setupDashboard();
  if (route === 'scheduler.html') setupSchedulerShell();
})();
