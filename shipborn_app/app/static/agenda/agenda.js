// Agenda: maandoverzicht met logregels (op hun datum), geplande klussen, verwachte taken (volgende datum)
// en afspraken uit de gekoppelde agenda (iCloud e.d., Instellingen › Agenda). Klik op een dag voor het
// dagoverzicht; geplande klussen kun je op de computer naar een andere dag slepen.
let AG_MAAND = null, AG_DAG = null, AG_DATA = null, AG_PER = {}, AG_TAKEN = [], editingPlan = null, agSeq = 0;

tabblad('agenda', {
  nieuw: () => openPlan(null, {datum: AG_DAG || today()}),
  toon: () => laadAgenda().then(() => AG_DATA?.sync.kalender && syncAgenda(true)),
  laden: () => laadAgenda(),
  ververs: () => laadAgenda(),
});

op('taken', taken => {
  AG_TAKEN = taken;
  fillSelect($('#planForm [name=task_id]'), taken.filter(t => t.actief).map(t => ({value: t.id, label: t.naam})), '— geen —');
});

// ---------------------------------------------------------------- datums
const isoDag = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const plusDagen = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return isoDag(d); };
const plusMaand = (m, n) => { const d = new Date(m + '-01T12:00:00'); d.setMonth(d.getMonth() + n); return isoDag(d).slice(0, 7); };
const dagNaam = s => new Date(s + 'T12:00:00').toLocaleDateString('nl-NL', {weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'});

// dagen in het rooster: van de maandag vóór de 1e tot en met de zondag na de laatste dag
function rooster(maand) {
  const eerste = maand + '-01';
  let d = plusDagen(eerste, -((new Date(eerste + 'T12:00:00').getDay() + 6) % 7));
  const dagen = [];
  while (dagen.length < 42 && (dagen.length % 7 || d.slice(0, 7) <= maand)) { dagen.push(d); d = plusDagen(d, 1); }
  return dagen;
}

// ---------------------------------------------------------------- laden
async function laadAgenda() {
  AG_MAAND ??= today().slice(0, 7);
  const dagen = rooster(AG_MAAND), seq = ++agSeq;
  const data = await api(`api/agenda?van=${dagen[0]}&tot=${dagen.at(-1)}`);
  if (seq !== agSeq) return;
  AG_DATA = data;
  AG_PER = itemsPerDag(data, dagen[0], dagen.at(-1));
  zetTeller('agenda', data.te_laat);
  renderAgenda(dagen);
}

const SOORT_VOLGORDE = {plan: 0, verwacht: 1, extern: 2, log: 3};
function itemsPerDag(data, van, tot) {
  const per = {};
  const voeg = (d, it) => (per[d] ??= []).push(it);
  data.planning.forEach(p => voeg(p.datum, {soort: 'plan', id: p.id, titel: p.titel, tijd: p.tijd,
    klaar: !!p.entry_id, laat: !p.entry_id && p.datum < data.vandaag, p}));
  data.verwacht.forEach(t => voeg(t.datum, {soort: 'verwacht', id: t.task_id, titel: t.naam, t}));
  data.logregels.forEach(e => voeg(e.datum, {soort: 'log', id: e.id, titel: e.titel, e}));
  data.extern.forEach((x, i) => {
    for (let d = x.datum < van ? van : x.datum; d <= x.einddatum && d <= tot; d = plusDagen(d, 1))
      voeg(d, {soort: 'extern', id: i, titel: x.titel, tijd: d === x.datum ? x.tijd : null, x});
  });
  for (const lijst of Object.values(per))
    lijst.sort((a, b) => SOORT_VOLGORDE[a.soort] - SOORT_VOLGORDE[b.soort] || (a.tijd || '').localeCompare(b.tijd || ''));
  return per;
}

// ---------------------------------------------------------------- maandrooster
const itemKlasse = it => `ai ai-${it.soort}${it.klaar ? ' klaar' : ''}${it.laat ? ' laat' : ''}`;

function renderAgenda(dagen) {
  const t = today();
  const naam = new Date(AG_MAAND + '-01T12:00:00').toLocaleDateString('nl-NL', {month: 'long', year: 'numeric'});
  $('#agMaand').textContent = naam[0].toUpperCase() + naam.slice(1);
  if (!AG_DAG || !dagen.includes(AG_DAG)) AG_DAG = t.startsWith(AG_MAAND) ? t : AG_MAAND + '-01';
  $('#agGrid').innerHTML = dagen.map(d => {
    const items = AG_PER[d] || [];
    const cls = ['agdag', d.slice(0, 7) !== AG_MAAND && 'ander', d === t && 'vandaag', d === AG_DAG && 'gekozen'].filter(Boolean).join(' ');
    return `<div class="${cls}" data-dag="${d}" role="button" tabindex="0" aria-label="${dagNaam(d)}">
      <span class="nr">${+d.slice(8)}</span>
      <span class="items">${items.slice(0, 3).map(it => `<span class="${itemKlasse(it)}" data-soort="${it.soort}" data-id="${it.id}"
        ${it.soort === 'plan' && !it.klaar ? 'draggable="true"' : ''} title="${esc((it.tijd ? it.tijd + ' ' : '') + it.titel)}">${it.klaar ? '✓ ' : ''}${esc(it.titel)}</span>`).join('')}
        ${als(items.length > 3, `<span class="meer">+${items.length - 3}</span>`)}</span>
    </div>`;
  }).join('');
  renderDag();
  renderSync();
}

// ---------------------------------------------------------------- dagoverzicht
function renderDag() {
  const items = AG_PER[AG_DAG] || [];
  $('#agDag').innerHTML = `
    <div class="agdaghead"><h3>${dagNaam(AG_DAG)}</h3>
      <button type="button" class="btn" data-ag="log">+ Logregel</button>
      <button type="button" class="btn primary" data-ag="plan">+ Plannen</button></div>
    ${items.length ? items.map(dagKaart).join('') : leeg('Niets op deze dag.')}`;
}

const tijdTekst = it => it.soort === 'extern' && it.x.tijd && it.tijd ? `${it.x.tijd}–${it.x.eindtijd}` : it.tijd || '';

function dagKaart(it) {
  const kop = (label, extra = '') => `<div class="meta"><span class="agsoort ${itemKlasse(it)}">${label}</span>
    ${als(tijdTekst(it), `<span>${tijdTekst(it)}</span>`)}${extra}</div>`;
  if (it.soort === 'plan') {
    const p = it.p;
    return `<article class="card agkaart" data-soort="plan" data-id="${p.id}"><div class="taskrow"><div class="grow">
      ${kop(it.klaar ? 'Uitgevoerd' : it.laat ? 'Te laat' : 'Gepland', `${chip(p.taak_naam && '⟳ ' + p.taak_naam)} ${duurHtml(p.duur_minuten)}`)}
      <h3>${esc(p.titel)}</h3>
      ${als(p.notitie, `<p class="desc">${esc(p.notitie)}</p>`)}
      ${als(it.klaar, `<div class="due">Uitgevoerd op ${fmtDate(p.uitgevoerd_op)}</div>`)}
      </div>${als(!it.klaar, `<button class="btn primary" data-uitvoeren="${p.id}">${planUitvoerLabel(p)}</button>`)}</div></article>`;
  }
  if (it.soort === 'verwacht') {
    const t = it.t;
    return `<article class="card agkaart s-${t.status}" data-soort="verwacht" data-id="${t.task_id}"><div class="taskrow"><div class="grow">
      ${kop('Taak verwacht', chip(t.categorie))}
      <h3>${esc(t.naam)}</h3><div class="due">Volgens het interval van de taak moet dit nu weer.</div>
      </div><button class="btn" data-inplannen="${t.task_id}">Inplannen</button></div></article>`;
  }
  if (it.soort === 'log') {
    const e = it.e;
    return `<article class="card agkaart" data-soort="log" data-id="${e.id}">
      ${kop('Logregel', `${chip(e.categorie)} ${chip(e.taak_naam && '⟳ ' + e.taak_naam)} ${duurHtml(e.duur_minuten)}`)}
      <h3>${esc(e.titel)}</h3>
      ${als(e.omschrijving, `<p class="desc">${esc(e.omschrijving)}</p>`)}
      ${thumbsHtml(e.fotos, `data-lb="${e.id}"`)}</article>`;
  }
  const x = it.x;
  return `<article class="card agkaart extern" data-soort="extern">
    ${kop(esc(AG_DATA.sync.kalender_naam || 'Agenda'), als(x.einddatum !== x.datum, `<span>${fmtDate(x.datum)} – ${fmtDate(x.einddatum)}</span>`))}
    <h3>${esc(x.titel)}</h3>
    ${als(x.locatie, `<div class="due">📍 ${esc(x.locatie)}</div>`)}
    ${als(x.omschrijving, `<p class="desc">${esc(x.omschrijving)}</p>`)}</article>`;
}

const planTaak = p => p.task_id && AG_TAKEN.find(t => t.id === p.task_id);
const planUitvoerLabel = p => planTaak(p)?.stappen.length ? 'Uitvoeren ›' : 'Uitgevoerd';

// geplande klus uitvoeren: met taak via de taak (stappenplan of logregel), anders een logregel met deze titel
function planUitvoeren(p) {
  const t = planTaak(p);
  if (t) taakUitgevoerd(t, p.id);
  else openEntry(null, {titel: p.titel, planning_id: p.id, omschrijving: p.notitie, duur_minuten: p.duur_minuten});
}

const vindItem = (soort, id) => (AG_PER[AG_DAG] || []).find(it => it.soort === soort && it.id == id);

$('#agDag').addEventListener('click', ev => {
  const knop = ev.target.closest('[data-ag]');
  if (knop) { knop.dataset.ag === 'plan' ? openPlan(null, {datum: AG_DAG}) : openEntry(null, {datum: AG_DAG}); return; }
  const uit = ev.target.closest('[data-uitvoeren]');
  if (uit) { planUitvoeren(vindItem('plan', uit.dataset.uitvoeren).p); return; }
  const inpl = ev.target.closest('[data-inplannen]');
  if (inpl) { openPlan(null, {datum: AG_DAG, task_id: +inpl.dataset.inplannen}); return; }
  const img = ev.target.closest('img[data-lb]');
  if (img) { openLightbox(lbItems(vindItem('log', img.dataset.lb).e.fotos), +img.dataset.i); return; }
  const kaart = ev.target.closest('.agkaart');
  if (kaart) openItem(kaart.dataset.soort, kaart.dataset.id);
});

function openItem(soort, id) {
  const it = vindItem(soort, id);
  if (!it) return;
  if (soort === 'plan') openPlan(it.p);
  else if (soort === 'log') openEntry(it.e);
  else if (soort === 'verwacht') openHistory(it.id);
}

// ---------------------------------------------------------------- rooster: kiezen, openen, slepen
function kiesDag(d) {
  AG_DAG = d;
  $$('#agGrid .agdag').forEach(c => c.classList.toggle('gekozen', c.dataset.dag === d));
  renderDag();
}

$('#agGrid').addEventListener('click', ev => {
  const cel = ev.target.closest('.agdag'); if (!cel) return;
  kiesDag(cel.dataset.dag);
  const it = ev.target.closest('.ai');   // op een groot scherm: item direct openen
  if (it && getComputedStyle(it).pointerEvents !== 'none') openItem(it.dataset.soort, it.dataset.id);
});
$('#agGrid').addEventListener('keydown', ev => {
  const cel = ev.target.closest('.agdag');
  if (cel && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); kiesDag(cel.dataset.dag); }
});
$('#agGrid').addEventListener('dblclick', ev => {
  const cel = ev.target.closest('.agdag');
  if (cel && !ev.target.closest('.ai')) openPlan(null, {datum: cel.dataset.dag});
});

$('#agGrid').addEventListener('dragstart', ev => {
  const it = ev.target.closest('.ai[draggable]'); if (!it) return;
  ev.dataTransfer.setData('text/plain', it.dataset.id);
  ev.dataTransfer.effectAllowed = 'move';
});
$('#agGrid').addEventListener('dragover', ev => {
  const cel = ev.target.closest('.agdag'); if (!cel) return;
  ev.preventDefault();
  $$('#agGrid .drop').forEach(c => c !== cel && c.classList.remove('drop'));
  cel.classList.add('drop');
});
$('#agGrid').addEventListener('dragleave', ev => { if (!ev.currentTarget.contains(ev.relatedTarget)) $$('#agGrid .drop').forEach(c => c.classList.remove('drop')); });
$('#agGrid').addEventListener('drop', async ev => {
  ev.preventDefault();
  $$('#agGrid .drop').forEach(c => c.classList.remove('drop'));
  const cel = ev.target.closest('.agdag'), id = ev.dataTransfer.getData('text/plain');
  if (!cel || !id) return;
  const p = AG_DATA.planning.find(x => x.id == id);
  if (!p || p.datum === cel.dataset.dag) return;
  try {
    await api('api/planning/' + id, json('PUT', {datum: cel.dataset.dag}));
    AG_DAG = cel.dataset.dag;
    toast(`Verplaatst naar ${fmtDate(cel.dataset.dag)}`);
    await verversAlles();
  } catch (e) { toast(e.message); }
});

$('#agVorige').addEventListener('click', () => { AG_MAAND = plusMaand(AG_MAAND, -1); AG_DAG = null; laadAgenda(); });
$('#agVolgende').addEventListener('click', () => { AG_MAAND = plusMaand(AG_MAAND, 1); AG_DAG = null; laadAgenda(); });
$('#agVandaag').addEventListener('click', () => { AG_MAAND = today().slice(0, 7); AG_DAG = today(); laadAgenda(); });

// ---------------------------------------------------------------- koppeling met de agenda
function renderSync() {
  const s = AG_DATA.sync, el = $('#agSync');
  if (!s.account || !s.kalender) {
    el.innerHTML = 'Koppel je iCloud- of Google-agenda via <a href="#settings">Instellingen › Agenda</a>.';
    return;
  }
  const st = s.status;
  el.innerHTML = `Gekoppeld met <b>${esc(s.kalender_naam || 'agenda')}</b>` +
    (st ? (st.ok ? ` · bijgewerkt ${fmtStamp(st.tijd)}` : ` · <span class="bad">synchroniseren mislukt: ${esc(st.fout)}</span>`) : '') +
    ` · <a href="#" id="agSyncNu">nu synchroniseren</a>`;
}

let agSyncBezig = false;
async function syncAgenda(stil = false) {
  if (agSyncBezig) return;
  agSyncBezig = true;
  try {
    const s = await api('api/agenda/sync', {method: 'POST'});
    if (!stil) toast(s.status?.ok ? 'Agenda bijgewerkt' : 'Synchroniseren mislukt: ' + (s.status?.fout || ''));
    await laadAgenda();
  } catch (e) { if (!stil) toast(e.message); }
  finally { agSyncBezig = false; }
}
$('#agSync').addEventListener('click', ev => {
  if (ev.target.id === 'agSyncNu') { ev.preventDefault(); toast('Bezig met synchroniseren…'); syncAgenda(); }
  if (ev.target.getAttribute('href') === '#settings') { ev.preventDefault(); show('settings'); }
});

// ---------------------------------------------------------------- dialoog geplande klus
function openPlan(p = null, preset = {}) {
  editingPlan = p;
  const f = $('#planForm'); f.reset();
  const v = p || preset;
  $('#planTitle').textContent = p ? 'Geplande klus' : 'Klus plannen';
  $('#planDelete').hidden = !p;
  $('#planDone').hidden = !p || !!p.entry_id;
  if (p) $('#planDone').textContent = planUitvoerLabel(p);
  f.datum.value = v.datum || today();
  f.tijd.value = v.tijd || '';
  f.task_id.value = v.task_id || '';
  if (v.task_id && f.task_id.value === '') {   // inactieve of verwijderde taak: toch tonen
    const t = AG_TAKEN.find(t => t.id == v.task_id);
    if (t) { f.task_id.insertAdjacentHTML('beforeend', `<option value="${t.id}">${esc(t.naam)}</option>`); f.task_id.value = t.id; }
  }
  f.titel.value = v.titel || AG_TAKEN.find(t => t.id == v.task_id)?.naam || '';
  f.duur.value = durInput(v.duur_minuten);
  f.notitie.value = v.notitie || '';
  const info = $('#planInfo');
  info.hidden = !p?.entry_id;
  if (p?.entry_id) info.innerHTML = `Uitgevoerd op ${fmtDate(p.uitgevoerd_op)}: <a href="#" id="planLog">logregel openen</a>`;
  $('#planDlg').showModal();
}

$('#planForm [name=task_id]').addEventListener('change', ev => {
  const t = AG_TAKEN.find(t => t.id == ev.target.value), f = $('#planForm');
  if (t && (!f.titel.value.trim() || AG_TAKEN.some(x => x.naam === f.titel.value))) f.titel.value = t.naam;
});

$('#planInfo').addEventListener('click', async ev => {
  if (ev.target.id !== 'planLog') return;
  ev.preventDefault();
  const e = AG_DATA.logregels.find(x => x.id === editingPlan.entry_id)
    || (await api('api/entries')).find(x => x.id === editingPlan.entry_id);
  if (e) { $('#planDlg').close(); openEntry(e); }
});

$('#planForm').addEventListener('submit', async ev => {
  ev.preventDefault();
  const f = ev.target;
  const body = {datum: f.datum.value, tijd: f.tijd.value, task_id: f.task_id.value, titel: f.titel.value,
    duur: f.duur.value, notitie: f.notitie.value};
  try {
    await api(editingPlan ? 'api/planning/' + editingPlan.id : 'api/planning', json(editingPlan ? 'PUT' : 'POST', body));
    $('#planDlg').close(); toast('Opgeslagen');
    AG_DAG = body.datum; AG_MAAND = body.datum.slice(0, 7);
    await verversAlles();
  } catch (e) { toast(e.message); }
});

$('#planDelete').addEventListener('click', async () => {
  if (!editingPlan || !confirm('Deze geplande klus verwijderen? Hij verdwijnt ook uit de gekoppelde agenda.')) return;
  try {
    await api('api/planning/' + editingPlan.id, {method: 'DELETE'});
    $('#planDlg').close(); toast('Verwijderd');
    await verversAlles();
  } catch (e) { toast(e.message); }
});

$('#planDone').addEventListener('click', () => { const p = editingPlan; $('#planDlg').close(); planUitvoeren(p); });
