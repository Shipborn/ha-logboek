// Logboek › Taken: terugkerende onderhoudstaken, de taakdialoog en de geschiedenis per taak.
let TASKS = [], editingTask = null, histTask = null;

tabblad('tasks', {
  nieuw: () => openTask(),
  laden: () => loadTasks(),
  ververs: () => loadTasks(),
  naVerversen: () => histTask != null && $('#histDlg').open ? renderHistory() : null,
});

async function loadTasks() {
  TASKS = await api('api/tasks');
  renderTasks();
  zetTeller('tasks', TASKS.filter(t => t.status === 'achterstallig').length);
  meld('taken', TASKS);
}

// ---------------------------------------------------------------- status en interval
const ORDER = {achterstallig: 0, binnenkort: 1, onbekend: 2, ok: 3, inactief: 4};
const LABEL = {achterstallig: 'Achterstallig', binnenkort: 'Binnenkort', onbekend: 'Nog niet gelogd', ok: 'In orde', inactief: 'Inactief'};
const statusHtml = t => `<span class="status"><span class="dot"></span>${LABEL[t.status]}</span>`;

function dueText(t) {
  const parts = [];
  if (t.interval_dagen) {
    if (t.dagen_rest == null) parts.push(`elke ${t.interval_dagen} dagen`);
    else if (t.dagen_rest < 0) parts.push(`${-t.dagen_rest} dagen te laat (${fmtDate(t.volgende_datum)})`);
    else if (t.dagen_rest === 0) parts.push(`vandaag`);
    else parts.push(`over ${t.dagen_rest} dagen (${fmtDate(t.volgende_datum)})`);
  }
  if (t.interval_uren) {
    if (t.volgende_uren == null) parts.push(`elke ${fmtNum(t.interval_uren)} motoruren`);
    else if (t.uren_rest == null) parts.push(`bij ${fmtNum(t.volgende_uren)} u`);
    else if (t.uren_rest < 0) parts.push(`${fmtNum(-t.uren_rest)} u te laat (bij ${fmtNum(t.volgende_uren)} u)`);
    else parts.push(`over ${fmtNum(t.uren_rest)} u (bij ${fmtNum(t.volgende_uren)} u)`);
  }
  return parts.join(' · ') || 'geen interval';
}

// ---------------------------------------------------------------- lijst
function renderTasks() {
  const list = [...TASKS].sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.naam.localeCompare(b.naam));
  $('#tasks').innerHTML = list.length ? list.map(taskCard).join('')
    : leeg('Nog geen onderhoudstaken.<br>Voeg terugkerend onderhoud toe, zoals olie verversen of impeller vervangen.');
}

const taskCard = t => `
  <article class="card s-${t.status}" data-id="${t.id}">
    <div class="taskrow">
      <div class="grow">
        <div class="meta">${statusHtml(t)} ${chip(t.categorie)}
          ${pdfKnop(`api/pdf/task/${t.id}`, 'PDF van deze taak met alle uitvoeringen', true)}</div>
        <h3>${esc(t.naam)}</h3>
        <div class="due">Volgende: ${dueText(t)}</div>
        <div class="due">${t.laatst_datum ? `Laatst: ${fmtDate(t.laatst_datum)}${t.laatst_uren != null ? ` · ${fmtNum(t.laatst_uren)} u` : ''}`
          : 'Log de laatste keer dat dit gedaan is om de teller te starten.'}</div>
      </div>
      ${als(t.actief, `<button class="btn primary" data-done="${t.id}">Uitgevoerd</button>`)}
      <span class="chev" aria-hidden="true">›</span>
    </div>
  </article>`;

const taakUitgevoerd = t => openEntry(null, {task_id: t.id, titel: t.naam, categorie: t.categorie});

$('#tasks').addEventListener('click', ev => {
  if (ev.target.closest('.pdfbtn')) return;
  const done = ev.target.closest('[data-done]');
  if (done) { taakUitgevoerd(TASKS.find(x => x.id == done.dataset.done)); return; }
  const card = ev.target.closest('.card');
  if (card) openHistory(+card.dataset.id);
});

// ---------------------------------------------------------------- taakdialoog
function openTask(task = null) {
  editingTask = task;
  const f = $('#taskForm'); f.reset();
  $('#taskTitle').textContent = task ? 'Taak bewerken' : 'Nieuwe taak';
  $('#taskDelete').hidden = !task;
  f.naam.value = task?.naam || '';
  f.categorie.value = task?.categorie || '';
  f.interval_dagen.value = task?.interval_dagen ?? '';
  f.interval_uren.value = nlNum(task?.interval_uren);
  f.notitie.value = task?.notitie || '';
  f.actief.checked = task ? !!task.actief : true;
  entPicker($('#taskEnts'), task?.entiteiten || []);
  $('#taskDlg').showModal();
}

$('#taskForm').addEventListener('submit', async ev => {
  ev.preventDefault();
  const f = ev.target;
  const body = {naam: f.naam.value, categorie: f.categorie.value, interval_dagen: f.interval_dagen.value,
    interval_uren: f.interval_uren.value, notitie: f.notitie.value, actief: f.actief.checked,
    entiteiten: $('#taskEnts')._list};
  try {
    await api(editingTask ? 'api/tasks/' + editingTask.id : 'api/tasks', json(editingTask ? 'PUT' : 'POST', body));
    $('#taskDlg').close(); toast('Opgeslagen');
    await verversAlles();
  } catch (e) { toast(e.message); }
});

$('#taskDelete').addEventListener('click', async () => {
  if (!editingTask || !confirm('Deze taak verwijderen? De logregels blijven bewaard.')) return;
  try {
    await api('api/tasks/' + editingTask.id, {method: 'DELETE'});
    $('#taskDlg').close(); toast('Verwijderd');
    await verversAlles();
  } catch (e) { toast(e.message); }
});

// ---------------------------------------------------------------- geschiedenis per taak
const dayDiff = (a, b) => Math.round((new Date(a + 'T00:00:00') - new Date(b + 'T00:00:00')) / 86400000);

async function openHistory(id) {
  histTask = id;
  await renderHistory();
  if (!$('#histDlg').open) $('#histDlg').showModal();
}

async function renderHistory() {
  const t = TASKS.find(x => x.id === histTask);
  if (!t) { $('#histDlg').close(); return; }
  const list = await api('api/entries?task_id=' + t.id);   // nieuwste eerst
  $('#histTitle').textContent = t.naam;
  $('#histDone').hidden = !t.actief;

  // tussenpozen tussen opeenvolgende uitvoeringen
  const asc = [...list].reverse(), dGaps = [], hGaps = [];
  const gap = {};
  for (let i = 1; i < asc.length; i++) {
    const d = dayDiff(asc[i].datum, asc[i - 1].datum); dGaps.push(d);
    const g = {d};
    if (asc[i].motoruren != null && asc[i - 1].motoruren != null) {
      g.h = Math.round((asc[i].motoruren - asc[i - 1].motoruren) * 10) / 10; hGaps.push(g.h);
    }
    gap[asc[i].id] = g;
  }
  const avg = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
  const tijd = list.reduce((s, e) => s + (e.duur_minuten || 0), 0);

  const stats = [
    [`${list.length}×`, 'uitgevoerd'],
    [tijd ? fmtDur(tijd) : '—', 'totale tijd'],
    [avg(dGaps) != null ? `${fmtNum(avg(dGaps), 0)} d` : '—', 'gem. tussenpoos' + (t.interval_dagen ? ` (interval ${t.interval_dagen})` : '')],
  ];
  if (t.interval_uren || hGaps.length)
    stats.push([avg(hGaps) != null ? `${fmtNum(avg(hGaps))} u` : '—', 'gem. motoruren' + (t.interval_uren ? ` (interval ${fmtNum(t.interval_uren)})` : '')]);

  const body = $('#histBody');
  const sinds = e => { const g = gap[e.id]; return g ? `+${g.d} dagen${g.h != null ? ` · +${fmtNum(g.h)} u` : ''} sinds vorige` : 'eerste keer gelogd'; };
  body.innerHTML = `
    <div class="meta s-${t.status}">${statusHtml(t)} ${chip(t.categorie)} <span>Volgende: ${dueText(t)}</span></div>
    ${statsHtml(stats)}
    ${als(t.notitie, `<p class="hnote">${esc(t.notitie)}</p>`)}
    ${list.length ? tijdlijnHtml(body, list, sinds)
      : leeg('Nog niet uitgevoerd.<br>Tik op <b>Uitgevoerd</b> om de eerste keer te loggen.')}`;
}

$('#histBody').addEventListener('click', tlClick);
$('#histEdit').addEventListener('click', () => openTask(TASKS.find(x => x.id === histTask)));
$('#histDone').addEventListener('click', () => taakUitgevoerd(TASKS.find(x => x.id === histTask)));
$('#histDlg').addEventListener('close', () => { histTask = null; });
