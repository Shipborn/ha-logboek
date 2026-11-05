// Onderhoud › Taken: terugkerende onderhoudstaken, de taakdialoog en de geschiedenis per taak.
// Het stappenplan van een taak wordt bewerkt in stappenplan.js en uitgevoerd in uitvoeren.js.
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

// wanneer moet het weer: per interval (dagen, uren per teller); wat het eerst komt telt
function dueText(t) {
  const parts = [];
  if (t.interval_dagen) {
    if (t.dagen_rest == null) parts.push(`elke ${t.interval_dagen} dagen`);
    else if (t.dagen_rest < 0) parts.push(`${-t.dagen_rest} dagen te laat (${fmtDate(t.volgende_datum)})`);
    else if (t.dagen_rest === 0) parts.push(`vandaag`);
    else parts.push(`over ${t.dagen_rest} dagen (${fmtDate(t.volgende_datum)})`);
  }
  for (const c of t.tellers) {
    const n = c.naam.toLowerCase();
    if (c.volgende == null) parts.push(`elke ${fmtNum(c.interval)} u ${n}`);
    else if (c.rest == null) parts.push(`${n} bij ${fmtNum(c.volgende)} u`);
    else if (c.rest < 0) parts.push(`${n} ${fmtNum(-c.rest)} u te laat (bij ${fmtNum(c.volgende)} u)`);
    else parts.push(`${n} over ${fmtNum(c.rest)} u (bij ${fmtNum(c.volgende)} u)`);
  }
  return parts.join(' · ') || 'geen interval';
}

const laatstText = t => !t.laatst_datum ? 'Log de laatste keer dat dit gedaan is om de teller te starten.'
  : `Laatst: ${fmtDate(t.laatst_datum)}` + t.tellers.filter(c => c.laatst != null).map(c => ` · ${c.naam.toLowerCase()} ${fmtNum(c.laatst)} u`).join('');

// ---------------------------------------------------------------- lijst
function renderTasks() {
  const list = [...TASKS].sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.naam.localeCompare(b.naam));
  $('#tasks').innerHTML = list.length ? list.map(taskCard).join('')
    : leeg('Nog geen onderhoudstaken.<br>Voeg terugkerend onderhoud toe, zoals olie verversen of impeller vervangen.');
}

const uitvoerLabel = t => t.stappen.length ? 'Uitvoeren ›' : 'Uitgevoerd';

const taskCard = t => `
  <article class="card s-${t.status}" data-id="${t.id}">
    <div class="taskrow">
      <div class="grow">
        <div class="meta">${statusHtml(t)} ${chip(t.categorie)} ${chip(t.stappen.length && meervoud(t.stappen.length, 'stap', 'stappen'))}
          ${pdfKnop(`api/pdf/task/${t.id}`, 'PDF van deze taak met alle uitvoeringen', true)}</div>
        <h3>${esc(t.naam)}</h3>
        <div class="due">Volgende: ${dueText(t)}</div>
        <div class="due">${laatstText(t)}</div>
      </div>
      ${als(t.actief, `<button class="btn primary" data-done="${t.id}">${uitvoerLabel(t)}</button>`)}
      <span class="chev" aria-hidden="true">›</span>
    </div>
  </article>`;

// met stappenplan: stap voor stap uitvoeren; zonder: direct een logregel
const taakUitgevoerd = t => t.stappen.length ? openUitvoeren(t)
  : openEntry(null, {task_id: t.id, titel: t.naam, categorie: t.categorie});

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
  f.interval_generator.value = nlNum(task?.interval_generator);
  f.notitie.value = task?.notitie || '';
  f.actief.checked = task ? !!task.actief : true;
  zetStappen(task?.stappen || []);
  entPicker($('#taskEnts'), task?.entiteiten || []);
  tellerHint();
  $('#taskDlg').showModal();
}

// waarschuwing als er een urenteller in de taak staat die in Instellingen nog niet gekoppeld is
function tellerHint() {
  const f = $('#taskForm');
  const mist = (CFG.uren || []).filter(u => !u.ingesteld && f[u.id === 'hoofdmotor' ? 'interval_uren' : 'interval_generator'].value.trim());
  $('#tellerHint').hidden = !mist.length;
  $('#tellerHint').textContent = `Voor ${mist.map(u => u.naam.toLowerCase()).join(' en ')} is nog geen sensor gekozen ` +
    '(Instellingen › Urentellers); dat interval telt pas mee als die is ingesteld.';
}
$('#taskForm').addEventListener('input', ev => { if (/^interval_/.test(ev.target.name)) tellerHint(); });

$('#taskForm').addEventListener('submit', async ev => {
  ev.preventDefault();
  const f = ev.target;
  const body = {naam: f.naam.value, categorie: f.categorie.value, interval_dagen: f.interval_dagen.value,
    interval_uren: f.interval_uren.value, interval_generator: f.interval_generator.value,
    notitie: f.notitie.value, actief: f.actief.checked, entiteiten: $('#taskEnts')._list, stappen: STAPPEN};
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
const gemiddelde = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;

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
  $('#histDone').textContent = uitvoerLabel(t);

  // tussenpozen tussen opeenvolgende uitvoeringen, in dagen en per urenteller van de taak
  const asc = [...list].reverse(), dGaps = [], hGaps = Object.fromEntries(t.tellers.map(c => [c.id, []]));
  const gap = {};
  for (let i = 1; i < asc.length; i++) {
    const g = {d: dayDiff(asc[i].datum, asc[i - 1].datum), h: []};
    dGaps.push(g.d);
    for (const c of t.tellers) {
      const a = asc[i - 1][c.kolom], b = asc[i][c.kolom];
      if (a != null && b != null) {
        const h = Math.round((b - a) * 10) / 10;
        hGaps[c.id].push(h); g.h.push(`+${fmtNum(h)} u ${c.naam.toLowerCase()}`);
      }
    }
    gap[asc[i].id] = g;
  }
  const tijd = list.reduce((s, e) => s + (e.duur_minuten || 0), 0);
  const dGem = gemiddelde(dGaps);
  const stats = [
    [`${list.length}×`, 'uitgevoerd'],
    [tijd ? fmtDur(tijd) : '—', 'totale tijd'],
    [dGem != null ? `${fmtNum(dGem, 0)} d` : '—', 'gem. tussenpoos' + (t.interval_dagen ? ` (interval ${t.interval_dagen})` : '')],
    ...t.tellers.map(c => { const g = gemiddelde(hGaps[c.id]);
      return [g != null ? `${fmtNum(g)} u` : '—', `gem. uren ${c.naam.toLowerCase()} (interval ${fmtNum(c.interval)})`]; }),
  ];

  const body = $('#histBody');
  const sinds = e => { const g = gap[e.id]; return g ? [`+${g.d} dagen`, ...g.h].join(' · ') + ' sinds vorige' : 'eerste keer gelogd'; };
  body.innerHTML = `
    <div class="meta s-${t.status}">${statusHtml(t)} ${chip(t.categorie)} <span>Volgende: ${dueText(t)}</span></div>
    ${statsHtml(stats)}
    ${als(t.notitie, `<p class="hnote">${esc(t.notitie)}</p>`)}
    ${list.length ? tijdlijnHtml(body, list, sinds)
      : leeg(`Nog niet uitgevoerd.<br>Tik op <b>${uitvoerLabel(t)}</b> om de eerste keer te loggen.`)}`;
}

$('#histBody').addEventListener('click', tlClick);
$('#histEdit').addEventListener('click', () => openTask(TASKS.find(x => x.id === histTask)));
$('#histDone').addEventListener('click', () => taakUitgevoerd(TASKS.find(x => x.id === histTask)));
$('#histDlg').addEventListener('close', () => { histTask = null; });
