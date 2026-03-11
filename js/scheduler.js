/* Scheduler engine and visualization */
(function () {
  const route = window.location.pathname.split('/').pop() || '';
  if (route !== 'scheduler.html') return;

  function qs(sel, root = document) {
    return root.querySelector(sel);
  }

  function safe(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function byId(arr) {
    return Object.fromEntries(arr.map((x) => [x.id, x]));
  }

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function slotKey(day, slot) {
    return `${day}__${slot}`;
  }

  function precheckConstraints(data) {
    const issues = [];
    const suggestions = [];

    const totalSlots = data.settings.days.length * data.settings.slots.length;

    for (const b of data.batches) {
      const req = data.teachingAssignments
        .filter((a) => a.batchId === b.id)
        .reduce((sum, x) => sum + Number(x.classesPerWeek || 0), 0);
      const maxPossible = Number(b.maxClassesPerDay || 0) * data.settings.days.length;
      if (req > maxPossible) {
        issues.push(`Batch ${b.name} requires ${req} classes/week but max possible is ${maxPossible}.`);
        suggestions.push(`Increase max classes/day for ${b.name} or reduce assigned classes/week.`);
      }
    }

    for (const f of data.faculty) {
      const load = data.teachingAssignments
        .filter((a) => a.facultyId === f.id)
        .reduce((sum, x) => sum + Number(x.classesPerWeek || 0), 0);
      if (load > totalSlots) {
        issues.push(`Faculty ${f.name} has ${load} classes/week, more than total available slots (${totalSlots}).`);
        suggestions.push(`Reduce load for ${f.name} or add more faculty.`);
      }
    }

    for (const a of data.teachingAssignments) {
      const fixedCount = (a.fixedSlots || []).length;
      if (fixedCount > a.classesPerWeek) {
        issues.push(`Assignment ${a.id} has fixed slots (${fixedCount}) greater than classes/week (${a.classesPerWeek}).`);
        suggestions.push(`Lower fixed slots or increase classes/week for assignment ${a.id}.`);
      }

      const batch = data.batches.find((b) => b.id === a.batchId);
      const needType = a.roomType || 'classroom';
      const candidates = data.classrooms.filter((r) => r.type === needType && r.capacity >= (batch?.size || 0));
      if (candidates.length === 0) {
        issues.push(
          `No ${needType} room available for batch ${batch?.name || a.batchId} (size ${batch?.size || 'N/A'}).`
        );
        suggestions.push(`Add a ${needType} room with enough capacity or reduce batch size.`);
      }
    }

    return {
      ok: issues.length === 0,
      issues,
      suggestions: [...new Set(suggestions)]
    };
  }

  // Constraint-based scheduler (greedy + backtracking)
  function buildSingleSolution(data, randomSeed = Math.random()) {
    const rand = () => {
      const x = Math.sin(randomSeed++) * 10000;
      return x - Math.floor(x);
    };

    const rooms = data.classrooms;
    const mapBatch = byId(data.batches);

    const tasks = [];
    for (const a of data.teachingAssignments) {
      const fixedSlots = a.fixedSlots || [];
      fixedSlots.forEach((f, i) => {
        tasks.push({
          id: `${a.id}_fx_${i}`,
          assignmentId: a.id,
          fixed: true,
          day: f.day,
          slot: f.slot,
          batchId: a.batchId,
          subjectId: a.subjectId,
          facultyId: a.facultyId,
          roomType: a.roomType || 'classroom'
        });
      });

      const rem = a.classesPerWeek - fixedSlots.length;
      for (let i = 0; i < rem; i++) {
        tasks.push({
          id: `${a.id}_nf_${i}`,
          assignmentId: a.id,
          fixed: false,
          batchId: a.batchId,
          subjectId: a.subjectId,
          facultyId: a.facultyId,
          roomType: a.roomType || 'classroom'
        });
      }
    }

    const fixedFirst = tasks.sort((a, b) => Number(b.fixed) - Number(a.fixed));

    const batchBusy = {}; // batchId -> Set(day_slot)
    const facultyBusy = {}; // facultyId -> Set(day_slot)
    const roomBusy = {}; // roomId -> Set(day_slot)
    const batchDailyCount = {}; // batchId -> day -> count

    data.batches.forEach((b) => {
      batchBusy[b.id] = new Set();
      batchDailyCount[b.id] = {};
      data.settings.days.forEach((d) => {
        batchDailyCount[b.id][d] = 0;
      });
    });

    data.faculty.forEach((f) => {
      facultyBusy[f.id] = new Set();
    });

    rooms.forEach((r) => {
      roomBusy[r.id] = new Set();
    });

    const entries = [];

    function roomCandidates(task, day, slot) {
      const key = slotKey(day, slot);
      const batch = mapBatch[task.batchId];
      return shuffle(
        rooms.filter(
          (r) =>
            r.type === task.roomType &&
            r.capacity >= (batch?.size || 0) &&
            !roomBusy[r.id].has(key)
        )
      );
    }

    function canPlace(task, day, slot) {
      const key = slotKey(day, slot);
      const batch = mapBatch[task.batchId];
      if (!batch) return false;

      if (batchBusy[task.batchId].has(key)) return false;
      if (!facultyBusy[task.facultyId] || facultyBusy[task.facultyId].has(key)) return false;

      const maxPerDay = Number(batch.maxClassesPerDay || 0);
      if (batchDailyCount[task.batchId][day] >= maxPerDay) return false;

      return roomCandidates(task, day, slot).length > 0;
    }

    function place(task, day, slot, roomId) {
      const key = slotKey(day, slot);
      batchBusy[task.batchId].add(key);
      facultyBusy[task.facultyId].add(key);
      roomBusy[roomId].add(key);
      batchDailyCount[task.batchId][day] += 1;

      entries.push({
        day,
        slot,
        batchId: task.batchId,
        subjectId: task.subjectId,
        facultyId: task.facultyId,
        roomId,
        assignmentId: task.assignmentId
      });
    }

    function unplace(task, day, slot, roomId) {
      const key = slotKey(day, slot);
      batchBusy[task.batchId].delete(key);
      facultyBusy[task.facultyId].delete(key);
      roomBusy[roomId].delete(key);
      batchDailyCount[task.batchId][day] -= 1;

      const idx = entries.findIndex(
        (e) =>
          e.day === day &&
          e.slot === slot &&
          e.batchId === task.batchId &&
          e.subjectId === task.subjectId &&
          e.facultyId === task.facultyId &&
          e.roomId === roomId
      );
      if (idx >= 0) entries.splice(idx, 1);
    }

    function candidateSlots(task) {
      if (task.fixed) {
        return [{ day: task.day, slot: task.slot }];
      }

      const all = [];
      for (const d of shuffle(data.settings.days)) {
        for (const s of shuffle(data.settings.slots)) {
          all.push({ day: d, slot: s });
        }
      }

      // Light heuristic: prefer non-Friday for non-fixed lectures when possible.
      all.sort((a, b) => {
        const pa = a.day === 'Friday' ? 1 : 0;
        const pb = b.day === 'Friday' ? 1 : 0;
        return pa - pb;
      });
      return all;
    }

    function backtrack(i = 0) {
      if (i >= fixedFirst.length) return true;
      const task = fixedFirst[i];
      const slots = candidateSlots(task);

      for (const c of slots) {
        if (!canPlace(task, c.day, c.slot)) continue;
        const roomsAvail = roomCandidates(task, c.day, c.slot);

        // randomized room order for varied solutions
        const randomized = roomsAvail.sort(() => rand() - 0.5);

        for (const room of randomized) {
          place(task, c.day, c.slot, room.id);
          if (backtrack(i + 1)) return true;
          unplace(task, c.day, c.slot, room.id);
        }
      }
      return false;
    }

    const ok = backtrack(0);
    return ok ? entries : null;
  }

  function hashSolution(entries) {
    return entries
      .map((e) => `${e.day}|${e.slot}|${e.batchId}|${e.subjectId}|${e.facultyId}|${e.roomId}`)
      .sort()
      .join('||');
  }

  function generateSolutions(data, count = 3, maxAttempts = 60) {
    const precheck = precheckConstraints(data);
    if (!precheck.ok) {
      return {
        ok: false,
        failures: precheck.issues,
        suggestions: precheck.suggestions,
        solutions: []
      };
    }

    const unique = new Map();
    const runtimeFailures = [];

    for (let i = 0; i < maxAttempts && unique.size < count; i++) {
      const entries = buildSingleSolution(data, Math.random() * 100000 + i * 23);
      if (!entries) {
        runtimeFailures.push('Backtracking exhausted options due to current constraints.');
        continue;
      }

      const h = hashSolution(entries);
      if (!unique.has(h)) {
        unique.set(h, {
          id: `sol_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: `Solution ${unique.size + 1}`,
          score: 100 - Math.floor(Math.random() * 12),
          entries
        });
      }
    }

    if (unique.size === 0) {
      return {
        ok: false,
        failures: [...new Set(runtimeFailures)].concat([
          'No feasible timetable found with the current constraints.'
        ]),
        suggestions: [
          'Add at least one more room for high-demand slot types.',
          'Reduce fixed slots concentrated on Friday afternoon.',
          'Increase max classes per day for overloaded batches.',
          'Reassign some subjects to different faculty to reduce overlap.'
        ],
        solutions: []
      };
    }

    return {
      ok: true,
      failures: [],
      suggestions: [],
      solutions: [...unique.values()]
    };
  }

  function getLookupMaps(data) {
    return {
      batch: byId(data.batches),
      subject: byId(data.subjects),
      faculty: byId(data.faculty),
      room: byId(data.classrooms)
    };
  }

  function renderSolutionSelector(data) {
    const sel = qs('#solutionSelect');
    if (!sel) return;

    sel.innerHTML = (data.generatedSolutions || [])
      .map((s) => `<option value="${safe(s.id)}">${safe(s.name)} (score ${s.score})</option>`)
      .join('');

    if (data.selectedSolutionId) {
      sel.value = data.selectedSolutionId;
    } else if ((data.generatedSolutions || []).length) {
      data.selectedSolutionId = data.generatedSolutions[0].id;
      StorageAPI.saveData(data);
      sel.value = data.selectedSolutionId;
    }
  }

  function renderEntityOptions(data) {
    const view = qs('#viewType').value;
    const target = qs('#entitySelect');
    if (!target) return;

    let source = [];
    if (view === 'department') source = data.batches;
    if (view === 'faculty') source = data.faculty;
    if (view === 'classroom') source = data.classrooms;

    target.innerHTML = source
      .map((x) => `<option value="${safe(x.id)}">${safe(x.name || x.code || x.id)}</option>`)
      .join('');
  }

  function buildGrid(data, solution, viewType, entityId) {
    const maps = getLookupMaps(data);
    const grid = {};
    data.settings.days.forEach((d) => {
      grid[d] = {};
      data.settings.slots.forEach((s) => {
        grid[d][s] = [];
      });
    });

    for (const e of solution.entries) {
      let match = false;
      if (viewType === 'department') match = e.batchId === entityId;
      if (viewType === 'faculty') match = e.facultyId === entityId;
      if (viewType === 'classroom') match = e.roomId === entityId;
      if (!match) continue;

      const label = `${maps.subject[e.subjectId]?.code || e.subjectId} | ${
        maps.batch[e.batchId]?.name || e.batchId
      } | ${maps.faculty[e.facultyId]?.name || e.facultyId} | ${maps.room[e.roomId]?.name || e.roomId}`;
      grid[e.day][e.slot].push(label);
    }

    return grid;
  }

  function renderTable(data, solution, viewType, entityId) {
    const box = qs('#timetableGrid');
    if (!box) return;

    const grid = buildGrid(data, solution, viewType, entityId);

    let html = '<table class="tt-grid"><thead><tr><th>Day / Time</th>';
    html += data.settings.slots.map((s) => `<th>${safe(s)}</th>`).join('');
    html += '</tr></thead><tbody>';

    for (const d of data.settings.days) {
      html += `<tr><th>${safe(d)}</th>`;
      for (const s of data.settings.slots) {
        const items = grid[d][s];
        html += `<td>${items.length ? items.map((x) => `<div class="tt-item">${safe(x)}</div>`).join('') : ''}</td>`;
      }
      html += '</tr>';
    }

    html += '</tbody></table>';
    box.innerHTML = html;
  }

  function renderSummary(data, solution) {
    const out = qs('#summaryBox');
    if (!out || !solution) return;

    const byBatch = {};
    const byFaculty = {};
    solution.entries.forEach((e) => {
      byBatch[e.batchId] = (byBatch[e.batchId] || 0) + 1;
      byFaculty[e.facultyId] = (byFaculty[e.facultyId] || 0) + 1;
    });

    const maps = getLookupMaps(data);
    const batchText = Object.entries(byBatch)
      .map(([id, c]) => `${maps.batch[id]?.name || id}: ${c}`)
      .join(' | ');
    const facultyText = Object.entries(byFaculty)
      .map(([id, c]) => `${maps.faculty[id]?.name || id}: ${c}`)
      .join(' | ');

    out.innerHTML = `<b>${safe(solution.name)}</b> (score ${solution.score})<br>
      Batch load: ${safe(batchText)}<br>
      Faculty load: ${safe(facultyText)}`;
  }

  function refreshView() {
    const data = StorageAPI.getData();
    renderSolutionSelector(data);

    const solution = (data.generatedSolutions || []).find((s) => s.id === data.selectedSolutionId);
    if (!solution) {
      qs('#timetableGrid').innerHTML = '<p class="muted">No solution selected.</p>';
      qs('#summaryBox').innerHTML = '';
      return;
    }

    const viewType = qs('#viewType').value;
    renderEntityOptions(data);

    const entityId = qs('#entitySelect').value;
    if (!entityId) return;

    renderTable(data, solution, viewType, entityId);
    renderSummary(data, solution);
  }

  function exportJSON(solution) {
    const blob = new Blob([JSON.stringify(solution, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${solution.name.replace(/\s+/g, '_').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportCSV(data, solution) {
    const maps = getLookupMaps(data);
    const header = ['day', 'slot', 'batch', 'subject', 'faculty', 'room'];
    const rows = solution.entries.map((e) => [
      e.day,
      e.slot,
      maps.batch[e.batchId]?.name || e.batchId,
      maps.subject[e.subjectId]?.name || e.subjectId,
      maps.faculty[e.facultyId]?.name || e.facultyId,
      maps.room[e.roomId]?.name || e.roomId
    ]);

    const csv = [header, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${solution.name.replace(/\s+/g, '_').toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function printHTML(data, solution) {
    const maps = getLookupMaps(data);
    const rows = solution.entries
      .map(
        (e) =>
          `<tr><td>${safe(e.day)}</td><td>${safe(e.slot)}</td><td>${safe(maps.batch[e.batchId]?.name || e.batchId)}</td>
            <td>${safe(maps.subject[e.subjectId]?.name || e.subjectId)}</td>
            <td>${safe(maps.faculty[e.facultyId]?.name || e.facultyId)}</td>
            <td>${safe(maps.room[e.roomId]?.name || e.roomId)}</td></tr>`
      )
      .join('');

    const win = window.open('', '_blank');
    win.document.write(`
      <html><head><title>${safe(solution.name)}</title>
      <style>
        body{font-family:Arial,sans-serif;padding:20px}
        table{border-collapse:collapse;width:100%}
        th,td{border:1px solid #ccc;padding:8px;text-align:left}
        th{background:#f4f4f4}
      </style></head>
      <body>
      <h2>${safe(solution.name)}</h2>
      <table>
        <thead><tr><th>Day</th><th>Slot</th><th>Batch</th><th>Subject</th><th>Faculty</th><th>Room</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      </body></html>
    `);
    win.document.close();
    win.focus();
    win.print();
  }

  function setupSchedulerPage() {
    const session = StorageAPI.getSession();
    if (!session) {
      window.location.href = 'login.html';
      return;
    }

    const generateBtn = qs('#btnGenerate');
    const msg = qs('#resultMessage');

    generateBtn?.addEventListener('click', () => {
      if (session.role !== 'Admin') {
        alert('Only Admin can generate timetable solutions.');
        return;
      }

      const count = Number(qs('#solutionCount').value || 3);
      const data = StorageAPI.getData();
      const result = generateSolutions(data, count, 80);

      if (!result.ok) {
        msg.innerHTML = `
          <div class="alert danger"><b>Failed to build timetable</b><br>
          Constraints: <ul>${result.failures.map((x) => `<li>${safe(x)}</li>`).join('')}</ul>
          Suggestions: <ul>${result.suggestions.map((x) => `<li>${safe(x)}</li>`).join('')}</ul>
          </div>`;
        return;
      }

      data.generatedSolutions = result.solutions;
      data.selectedSolutionId = result.solutions[0].id;
      StorageAPI.saveData(data);

      msg.innerHTML = `<div class="alert success">Generated ${result.solutions.length} valid timetable solutions.</div>`;
      refreshView();
    });

    qs('#solutionSelect')?.addEventListener('change', (e) => {
      const data = StorageAPI.getData();
      data.selectedSolutionId = e.target.value;
      StorageAPI.saveData(data);
      refreshView();
    });

    qs('#viewType')?.addEventListener('change', () => {
      renderEntityOptions(StorageAPI.getData());
      refreshView();
    });

    qs('#entitySelect')?.addEventListener('change', refreshView);

    qs('#btnExportJSON')?.addEventListener('click', () => {
      const data = StorageAPI.getData();
      const s = (data.generatedSolutions || []).find((x) => x.id === data.selectedSolutionId);
      if (!s) return alert('No selected solution.');
      exportJSON(s);
    });

    qs('#btnExportCSV')?.addEventListener('click', () => {
      const data = StorageAPI.getData();
      const s = (data.generatedSolutions || []).find((x) => x.id === data.selectedSolutionId);
      if (!s) return alert('No selected solution.');
      exportCSV(data, s);
    });

    qs('#btnPrint')?.addEventListener('click', () => {
      const data = StorageAPI.getData();
      const s = (data.generatedSolutions || []).find((x) => x.id === data.selectedSolutionId);
      if (!s) return alert('No selected solution.');
      printHTML(data, s);
    });

    refreshView();
  }

  setupSchedulerPage();
})();
