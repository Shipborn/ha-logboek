// Logboek › Logregels: lijst met filters en de dialoog om een logregel te maken of te bewerken.
let ENTRIES = [], ALLE_TAKEN = [];
let editing = null, pending = [], capEdits = {}, photoBusy = false;

tabblad('log', {
  nieuw: () => openEntry(),
  config: cfg => {
    $('#mailTest').hidden = !cfg.email;
    if (HA_ANDROID) $('#fileInput').removeAttribute('multiple');
  },
  laden: () => loadEntries(),
  ververs: () => loadEntries(),
});

// taken voor de keuzelijst in de dialoog (komen van het tabblad Taken)
op('taken', taken => {
  ALLE_TAKEN = taken;
  fillSelect($('#entryForm [name=task_id]'), taken.filter(t => t.actief).map(t => ({value: t.id, label: t.naam})), '— geen —');
});

async function loadEntries() {
  const p = new URLSearchParams();
  if ($('#q').value.trim()) p.set('q', $('#q').value.trim());
  if ($('#fcat').value) p.set('categorie', $('#fcat').value);
  ENTRIES = await api('api/entries?' + p);
  renderEntries();
}

// ---------------------------------------------------------------- lijst
function renderEntries() {
  $('#sum').textContent = meervoud(ENTRIES.length, 'regel', 'regels');
  $('#entries').innerHTML = ENTRIES.length ? ENTRIES.map(entryCard).join('')
    : leeg($('#q').value || $('#fcat').value ? 'Niets gevonden.' : 'Nog geen logregels. Tik op + om te beginnen.');
}

const entryCard = e => `
  <article class="card" data-id="${e.id}">
    <div class="meta">
      <span>${fmtDate(e.datum)}</span>
      ${chip(e.categorie)}
      ${chip(e.taak_naam && '⟳ ' + e.taak_naam)}
      ${duurHtml(e.duur_minuten)}
      ${stampHtml(e)}
      ${pdfKnop(`api/pdf/entry/${e.id}`, 'PDF van deze logregel', !e.created_at)}
    </div>
    <h3>${esc(e.titel)}</h3>
    ${als(e.omschrijving, `<p class="desc">${esc(e.omschrijving)}</p>`)}
    ${valsHtml(e.waarden)}
    ${thumbsHtml(e.fotos, `data-lb="${e.id}"`)}
  </article>`;

$('#entries').addEventListener('click', ev => {
  if (ev.target.closest('.pdfbtn')) return;
  const img = ev.target.closest('img[data-lb]');
  if (img) {
    const e = ENTRIES.find(x => x.id == img.dataset.lb);
    openLightbox(lbItems(e.fotos), +img.dataset.i);
    return;
  }
  const card = ev.target.closest('.card');
  if (card) openEntry(ENTRIES.find(x => x.id == card.dataset.id));
});

$('#mailTest').addEventListener('click', async ev => {
  ev.preventDefault();
  toast('Testmail wordt verstuurd…');
  try {
    const r = await api('api/email/test', {method: 'POST'});
    toast(`Testmail verstuurd (${meervoud(r.logregels, 'logregel', 'logregels')} van vandaag)`);
  } catch (e) { toast(e.message); }
});

let qTimer;
$('#q').addEventListener('input', () => { clearTimeout(qTimer); qTimer = setTimeout(loadEntries, 250); });
$('#fcat').addEventListener('change', loadEntries);

// ---------------------------------------------------------------- dialoog
// openEntry(logregel) bewerkt; openEntry(null, {task_id, titel, categorie}) maakt een nieuwe (ook vanuit andere tabbladen)
function openEntry(entry = null, preset = {}) {
  editing = entry; pending = []; capEdits = {};
  const f = $('#entryForm'); f.reset();
  $('#entryTitle').textContent = entry ? 'Logregel bewerken' : 'Nieuwe logregel';
  $('#entryDelete').hidden = !entry;
  const v = entry || {datum: today(), ...preset};
  f.datum.value = v.datum || today();
  f.categorie.value = v.categorie || '';
  f.task_id.value = v.task_id || '';
  if (v.task_id && f.task_id.value === '') {  // inactieve taak: toch tonen
    const t = ALLE_TAKEN.find(t => t.id == v.task_id);
    if (t) { f.task_id.insertAdjacentHTML('beforeend', `<option value="${t.id}">${esc(t.naam)}</option>`); f.task_id.value = t.id; }
  }
  f.titel.value = v.titel || '';
  f.uitgevoerd_door.value = v.uitgevoerd_door || '';
  f.duur.value = durInput(v.duur_minuten);
  const st = $('#entryStamp');
  st.hidden = !entry?.created_at;
  if (entry?.created_at) st.textContent = `Opgeslagen op ${fmtStamp(entry.created_at)}` +
    (entry.ingevoerd_door ? ` door ${entry.ingevoerd_door}` : '') +
    (entry.updated_at && entry.updated_at !== entry.created_at ? ` · laatst gewijzigd ${fmtStamp(entry.updated_at)}` +
      (entry.gewijzigd_door ? ` door ${entry.gewijzigd_door}` : '') : '');
  f.omschrijving.value = v.omschrijving || '';
  renderPhotos();
  $('#entryVals').hidden = true;
  entryValuesPreview();
  $('#entryDlg').showModal();
}

$('#entryForm [name=task_id]').addEventListener('change', ev => {
  const t = ALLE_TAKEN.find(t => t.id == ev.target.value);
  const f = $('#entryForm');
  if (t) {
    if (!f.titel.value.trim()) f.titel.value = t.naam;
    if (t.categorie && !f.categorie.value) f.categorie.value = t.categorie;
  }
  entryValuesPreview();
});
$('#entryForm [name=categorie]').addEventListener('change', entryValuesPreview);

$('#entryForm').addEventListener('submit', async ev => {
  ev.preventDefault();
  const f = ev.target, btn = $('#entrySave');
  const fd = new FormData(f);
  pending.forEach(p => fd.append('fotos', p.file, p.file.name || 'foto.jpg'));
  btn.disabled = true; btn.textContent = pending.length ? 'Uploaden…' : 'Opslaan…';
  try {
    await api(editing ? 'api/entries/' + editing.id : 'api/entries', {method: editing ? 'PUT' : 'POST', body: fd});
    pending.forEach(p => URL.revokeObjectURL(p.url)); pending = [];
    $('#entryDlg').close();
    toast('Opgeslagen');
    await verversAlles();
  } catch (e) { toast(e.message); }
  finally { btn.disabled = false; btn.textContent = 'Opslaan'; }
});

$('#entryDelete').addEventListener('click', async () => {
  if (!editing || !confirm('Deze logregel en alle foto\'s verwijderen?')) return;
  try {
    await api('api/entries/' + editing.id, {method: 'DELETE'});
    $('#entryDlg').close(); toast('Verwijderd');
    await verversAlles();
  } catch (e) { toast(e.message); }
});

// voorbeeld in de dialoog: welke meetwaarden er bij opslaan worden vastgelegd
let previewSeq = 0;
async function entryValuesPreview() {
  const box = $('#entryVals'), f = $('#entryForm');
  if (editing) {
    box.hidden = !editing.waarden?.length;
    box.innerHTML = `<label>Meetwaarden bij opslaan</label>${valsHtml(editing.waarden)}`;
    return;
  }
  const seq = ++previewSeq;
  const p = new URLSearchParams({task_id: f.task_id.value, categorie: f.categorie.value});
  let list = [];
  try { list = await api('api/ha/preview?' + p); } catch (_) {}
  if (seq !== previewSeq) return;
  box.hidden = !list.length;
  box.innerHTML = `<label>Wordt automatisch opgeslagen <span class="hint">(actuele waarden)</span></label>${valsHtml(list)}`;
}

// ---------------------------------------------------------------- foto's in de dialoog
// per foto een omschrijving; de velden gaan via FormData mee (bestaand: foto_<id>_omschrijving,
// nieuw: foto_omschrijving in dezelfde volgorde als de bestanden)
function renderPhotos() {
  const existing = editing ? editing.fotos : [];
  const cap = (name, v, attr) => `<textarea name="${name}" ${attr} rows="3" placeholder="Omschrijving bij deze foto (optioneel)">${esc(v ?? '')}</textarea>`;
  const knoppen = (rm, edit) => `<button type="button" ${rm}>×</button><button type="button" class="edit" ${edit} aria-label="Foto bewerken" title="Tekenen / tekst">✎</button>`;
  const busy = photoBusy ? ' busy' : '';
  $('#photoList').innerHTML =
    existing.map((p, i) => `<div class="phrow"><div class="ph"><img src="photos/${p.thumb}" data-ex="${i}" alt="">${als(p.bewerkt, '<span class="tag">bewerkt</span>')}
        ${knoppen(`data-del="${p.id}" aria-label="Foto verwijderen"`, `data-edit-ex="${i}"`)}</div>
      ${cap(`foto_${p.id}_omschrijving`, p.id in capEdits ? capEdits[p.id] : p.omschrijving, `data-cap-ex="${p.id}"`)}</div>`).join('') +
    pending.map((p, i) => `<div class="phrow"><div class="ph new"><img src="${p.url}" data-new="${i}" alt="">
        ${knoppen(`data-rm="${i}" aria-label="Foto weghalen"`, `data-edit-new="${i}"`)}</div>
      ${cap('foto_omschrijving', p.cap, `data-cap-new="${i}"`)}</div>`).join('') +
    `<div class="addrow"><label class="addph${busy}" for="camInput"><span>📷</span>Foto maken</label>` +
    `<label class="addph${busy}" for="fileInput"><span>🖼️</span>${photoBusy ? 'Bezig…' : 'Uit galerij'}</label></div>`;
}

$('#photoList').addEventListener('input', ev => {
  const t = ev.target;
  if (t.dataset.capEx != null) capEdits[t.dataset.capEx] = t.value;
  if (t.dataset.capNew != null) pending[+t.dataset.capNew].cap = t.value;
});

const naBewerken = () => { renderPhotos(); loadEntries(); };
$('#photoList').addEventListener('click', async ev => {
  const t = ev.target;
  if (t.dataset.editEx != null) { const p = editing.fotos[+t.dataset.editEx]; openEditor('photos/' + p.bestand, {photo: p}, naBewerken); return; }
  if (t.dataset.editNew != null) { const p = pending[+t.dataset.editNew]; openEditor(p.url, {pending: p}, renderPhotos); return; }
  if (t.dataset.rm != null) { URL.revokeObjectURL(pending[t.dataset.rm].url); pending.splice(+t.dataset.rm, 1); renderPhotos(); return; }
  if (t.dataset.del != null) {
    if (!confirm('Deze foto definitief verwijderen?')) return;
    try {
      await api('api/photos/' + t.dataset.del, {method: 'DELETE'});
      editing.fotos = editing.fotos.filter(p => p.id != t.dataset.del);
      renderPhotos(); loadEntries();
    } catch (e) { toast(e.message); }
    return;
  }
  if (t.dataset.ex != null) openLightbox(editing.fotos.map(f => ({src: 'photos/' + f.bestand, cap: f.id in capEdits ? capEdits[f.id] : f.omschrijving})), +t.dataset.ex);
  if (t.dataset.new != null) openLightbox(pending.map(p => ({src: p.url, cap: p.cap})), +t.dataset.new);
});

async function addFiles(files) {
  if (!files.length) return;
  photoBusy = true; renderPhotos();
  try {
    for (const f of files) {
      const file = await shrinkPhoto(f);
      pending.push({file, url: URL.createObjectURL(file)});
    }
  } finally { photoBusy = false; renderPhotos(); }
}
const addPhotos = ev => { const files = [...ev.target.files]; ev.target.value = ''; addFiles(files); };
$('#fileInput').addEventListener('change', addPhotos);
$('#camInput').addEventListener('change', addPhotos);
// in de HA Android-app opent Foto maken de camera in de pagina
$('#photoList').addEventListener('click', ev => {
  if (IN_PAGE_CAMERA && ev.target.closest('label[for="camInput"]')) { ev.preventDefault(); openCamera(f => addFiles([f])); }
}, true);
