// Onderhoud › Categorieën: beheer (toevoegen, hernoemen, volgorde, verwijderen) en de logregels per categorie.
let CATS = [], catEdit = null, catView = null;

tabblad('cats', {
  toon: () => loadCats(),
  ververs: () => loadCats(),
  naVerversen: () => catView != null && $('#catDlg').open ? renderCatView() : null,
});

async function loadCats() {
  CATS = await api('api/categories');
  renderCats();
}

// keuzelijsten in filters en formulieren van alle tabbladen bijwerken
function refreshCategoryLists() {
  CFG.categories = CATS.map(c => c.naam);
  vulCategorieKeuzes();
}

async function catsChanged(reloadAll = false) {
  await loadCats();
  refreshCategoryLists();
  if (reloadAll) await verversAlles();
}

// ---------------------------------------------------------------- lijst
function renderCats() {
  $('#cats').innerHTML = CATS.length ? CATS.map((c, i) => catEdit === c.id ? catEditRow(c) : catRow(c, i)).join('')
    : leeg('Nog geen categorieën.');
  const inp = $('#cats [data-edit]');
  if (inp) { inp.focus(); inp.select(); }
}

const knop = (act, titel, tekst, extra = '') => `<button class="ib${act === 'del' ? ' danger' : ''}" data-act="${act}" ${extra} title="${titel}" aria-label="${titel}">${tekst}</button>`;

const catEditRow = c => `
  <div class="card catrow" data-id="${c.id}">
    <input value="${esc(c.naam)}" maxlength="60" data-edit>
    ${knop('save', 'Opslaan', '✓')}
    ${knop('cancel', 'Annuleren', '×')}
  </div>`;

function catRow(c, i) {
  const use = [als(c.logregels, meervoud(c.logregels, 'logregel', 'logregels')),
               als(c.taken, meervoud(c.taken, 'taak', 'taken'))].filter(Boolean).join(' · ') || 'niet gebruikt';
  return `
  <div class="card catrow" data-id="${c.id}">
    <div class="info" data-act="open" title="Logregels bekijken"><div class="name">${esc(c.naam)}</div><div class="use">${use}</div></div>
    <a class="ib pdf" href="api/pdf/category/${c.id}" download title="PDF van alle logregels in deze categorie">PDF</a>
    ${knop('up', 'Omhoog', '↑', i === 0 ? 'disabled' : '')}
    ${knop('down', 'Omlaag', '↓', i === CATS.length - 1 ? 'disabled' : '')}
    ${knop('edit', 'Hernoemen', '✎')}
    ${knop('del', 'Verwijderen', '🗑')}
  </div>`;
}

$('#catAdd').addEventListener('submit', async ev => {
  ev.preventDefault();
  const inp = ev.target.naam;
  try {
    await api('api/categories', json('POST', {naam: inp.value}));
    inp.value = ''; toast('Categorie toegevoegd');
    await catsChanged();
  } catch (e) { toast(e.message); }
});

async function saveCatEdit(row) {
  const naam = $('[data-edit]', row).value;
  try {
    await api('api/categories/' + row.dataset.id, json('PUT', {naam}));
    catEdit = null; toast('Hernoemd');
    await catsChanged(true);
  } catch (e) { toast(e.message); }
}

$('#cats').addEventListener('click', async ev => {
  const b = ev.target.closest('[data-act]'); if (!b) return;
  const row = b.closest('.catrow'), id = +row.dataset.id, i = CATS.findIndex(c => c.id === id), c = CATS[i];
  const act = b.dataset.act;
  if (act === 'open') { openCatView(c.naam); return; }
  if (act === 'edit') { catEdit = id; renderCats(); return; }
  if (act === 'cancel') { catEdit = null; renderCats(); return; }
  if (act === 'save') { saveCatEdit(row); return; }
  if (act === 'up' || act === 'down') {
    const j = act === 'up' ? i - 1 : i + 1;
    [CATS[i], CATS[j]] = [CATS[j], CATS[i]];
    renderCats();
    try {
      await api('api/categories/order', json('PUT', {ids: CATS.map(c => c.id)}));
      refreshCategoryLists();
    } catch (e) { toast(e.message); loadCats(); }
    return;
  }
  if (act === 'del') {
    const n = c.logregels + c.taken;
    if (!confirm(`Categorie "${c.naam}" verwijderen?` + (n ? `\n\n${n} logregel(s) en/of taken blijven bewaard, maar zonder categorie.` : ''))) return;
    try {
      await api('api/categories/' + id, {method: 'DELETE'});
      toast('Verwijderd');
      await catsChanged(n > 0);
    } catch (e) { toast(e.message); }
  }
});

$('#cats').addEventListener('keydown', ev => {
  if (!ev.target.matches('[data-edit]')) return;
  if (ev.key === 'Enter') { ev.preventDefault(); saveCatEdit(ev.target.closest('.catrow')); }
  if (ev.key === 'Escape') { ev.preventDefault(); catEdit = null; renderCats(); }
});

// ---------------------------------------------------------------- logregels per categorie
async function openCatView(naam) {
  catView = naam;
  await renderCatView();
  if (!$('#catDlg').open) $('#catDlg').showModal();
}

async function renderCatView() {
  const list = await api('api/entries?categorie=' + encodeURIComponent(catView));   // nieuwste eerst
  const tijd = list.reduce((s, e) => s + (e.duur_minuten || 0), 0);
  const taken = TASKS.filter(t => t.categorie === catView);
  if (!CATS.length) await loadCats();
  const cat = CATS.find(c => c.naam === catView);
  const body = $('#catBody');
  $('#catTitle').textContent = catView;
  body.innerHTML = `
    <div class="catents"><h3>Meetwaarden uit Home Assistant
      <span class="hint">(bij elke nieuwe logregel in deze categorie automatisch opgeslagen)</span></h3>
      <div class="entpick" id="catEnts"></div></div>
    ${statsHtml([
      [list.length, list.length === 1 ? 'logregel' : 'logregels'],
      [tijd ? fmtDur(tijd) : '—', 'totale tijd'],
      [taken.length, taken.length === 1 ? 'taak' : 'taken'],
    ])}
    ${list.length ? tijdlijnHtml(body, list, e => e.taak_naam ? `⟳ ${esc(e.taak_naam)}` : '')
      : leeg('Nog geen logregels in deze categorie.')}`;
  if (cat) entPicker($('#catEnts'), cat.entiteiten || [], async ids => {
    try {
      const r = await api(`api/categories/${cat.id}/entiteiten`, json('PUT', {entiteiten: ids}));
      cat.entiteiten = r.entiteiten; toast('Meetwaarden opgeslagen');
    } catch (e) { toast(e.message); }
  });
}

$('#catBody').addEventListener('click', tlClick);
$('#catNew').addEventListener('click', () => openEntry(null, {categorie: catView}));
$('#catDlg').addEventListener('close', () => { catView = null; });
