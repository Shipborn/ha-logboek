// Onderhoud › Taken › Stappenplan bewerken. STAPPEN hoort bij de taak in de taakdialoog en wordt bewaard bij
// Opslaan van de taak; de dialoog werkt op een kopie (KOPIE) die bij Klaar wordt overgenomen.
// Per stap: titel, uitleg (eenvoudige opmaak, zie mdHtml), uitlegafbeeldingen, HA-entiteiten en foto-eis.
let STAPPEN = [], KOPIE = [], stapOpen = 0, stapImgDoel = 0;
const FOTO_EIS = {geen: "Geen foto's", vragen: "Foto's vragen (optioneel)", verplicht: "Foto's verplicht"};
// status die een entiteit moet hebben voordat de volgende stap kan
const VEREIST = {'': 'geen voorwaarde', off: 'moet uit zijn', on: 'moet aan zijn', closed: 'moet dicht zijn', open: 'moet open zijn'};
const nieuweStap = () => ({titel: '', tekst: '', afbeeldingen: [], entiteiten: [], fotos: 'geen', min_fotos: 1, foto_vraag: ''});
const opties = (map, keuze) => Object.entries(map).map(([v, l]) => `<option value="${v}"${v === (keuze || '') ? ' selected' : ''}>${esc(l)}</option>`).join('');

if (HA_ANDROID) $('#stapImgInput').removeAttribute('multiple');

function zetStappen(lijst) { STAPPEN = structuredClone(lijst); stappenSamenvatting(); }
function stappenSamenvatting() {
  $('#taskStappen').textContent = STAPPEN.length
    ? `${meervoud(STAPPEN.length, 'stap', 'stappen')}: ${STAPPEN.map(s => s.titel).join(' › ')}` : 'Geen stappenplan.';
  $('#taskStappenEdit').textContent = STAPPEN.length ? 'Stappenplan bewerken' : 'Stappenplan maken';
}

$('#taskStappenEdit').addEventListener('click', () => {
  KOPIE = structuredClone(STAPPEN);
  if (!KOPIE.length) KOPIE.push(nieuweStap());
  stapOpen = 0;
  $('#stapTitle').textContent = 'Stappenplan: ' + ($('#taskForm').naam.value.trim() || 'nieuwe taak');
  renderStappen();
  $('#stapDlg').showModal();
  loadHaEntities();
});

$('#stapKlaar').addEventListener('click', () => {
  const zonder = KOPIE.findIndex(s => !s.titel.trim());
  if (zonder >= 0) { stapOpen = zonder; renderStappen(); toast(`Stap ${zonder + 1} heeft nog geen titel`); return; }
  STAPPEN = KOPIE; stappenSamenvatting();
  $('#stapDlg').close();
});

$('#stapAdd').addEventListener('click', () => {
  KOPIE.push(nieuweStap()); stapOpen = KOPIE.length - 1; renderStappen();
  $(`.stap[data-i="${stapOpen}"] [data-f=titel]`).focus();
});

// ---------------------------------------------------------------- weergave
function renderStappen() {
  $('#stapList').innerHTML = KOPIE.map(stapKaart).join('') || leeg('Nog geen stappen. Zonder stappen opent Uitgevoerd direct een logregel.');
}

const stapTags = s => [
  als(s.afbeeldingen.length, chip(`🖼 ${s.afbeeldingen.length}`)),
  als(s.entiteiten.length, chip(`⚙ ${s.entiteiten.length}`)),
  als(s.fotos !== 'geen', chip(s.fotos === 'verplicht' ? `📷 min. ${s.min_fotos}` : '📷')),
].join('');

const stapKaart = (s, i) => `
  <div class="stap${i === stapOpen ? ' open' : ''}" data-i="${i}">
    <div class="stapkop" data-act="open">
      <span class="nr">${i + 1}</span>
      <span class="naam">${esc(s.titel) || '<i>zonder titel</i>'}</span>
      <span class="tags">${stapTags(s)}</span>
      <button type="button" class="ib" data-act="up" ${i === 0 ? 'disabled' : ''} title="Omhoog" aria-label="Omhoog">↑</button>
      <button type="button" class="ib" data-act="down" ${i === KOPIE.length - 1 ? 'disabled' : ''} title="Omlaag" aria-label="Omlaag">↓</button>
      <button type="button" class="ib danger" data-act="del" title="Stap verwijderen" aria-label="Stap verwijderen">🗑</button>
    </div>
    ${als(i === stapOpen, stapVelden(s))}
  </div>`;

const stapVelden = s => `
  <div class="stapbody">
    <label>Titel<input data-f="titel" value="${esc(s.titel)}" maxlength="80" placeholder="Bijv. Pompen uitzetten"></label>
    <label>Uitleg <span class="hint">(**vet**, *cursief*; regels die met - of 1. beginnen worden een lijst)</span>
      <textarea data-f="tekst" rows="6" placeholder="Wat moet er in deze stap gebeuren?">${esc(s.tekst || '')}</textarea></label>
    <div>
      <label>Afbeeldingen bij de uitleg</label>
      <div class="stapimgs">${s.afbeeldingen.map((a, j) => `<div class="ph"><img src="photos/${a.thumb}" data-uitleg="${j}" alt="">
          <button type="button" data-act="imgdel" data-j="${j}" aria-label="Afbeelding weghalen">×</button></div>`).join('')}
        <label class="addph" for="stapImgInput" data-act="img"><span>🖼️</span>Toevoegen</label></div>
    </div>
    <div>
      <label>Home Assistant-entiteiten <span class="hint">(optioneel: status tonen, bedienen, of als voorwaarde om door te gaan)</span></label>
      <div class="stapents">${s.entiteiten.map(entRij).join('')}</div>
      <button type="button" class="btn" data-act="entadd">+ Entiteit</button>
    </div>
    <div class="stapfoto">
      <label>Foto's tijdens het uitvoeren<select data-f="fotos">${opties(FOTO_EIS, s.fotos)}</select></label>
      <label${s.fotos === 'verplicht' ? '' : ' hidden'}>Minimaal<input data-f="min_fotos" type="number" min="1" max="20" value="${s.min_fotos || 1}"></label>
      <label class="full"${s.fotos === 'geen' ? ' hidden' : ''}>Wat moet er op de foto?<input data-f="foto_vraag" value="${esc(s.foto_vraag || '')}" placeholder="Bijv. de schone wierpot van binnen"></label>
    </div>
  </div>`;

const entRij = (e, j) => `
  <div class="entrij" data-j="${j}">
    <input data-e="entity_id" list="haEntities" value="${esc(e.entity_id)}" placeholder="bijv. switch.dekspoelpomp" autocomplete="off">
    <input data-e="naam" value="${esc(e.naam || '')}" placeholder="Naam (optioneel)">
    <label class="check"><input type="checkbox" data-e="bedienen"${e.bedienen ? ' checked' : ''}> Bedienen</label>
    <select data-e="vereist">${opties(VEREIST, e.vereist)}</select>
    <button type="button" class="ib danger" data-act="entdel" data-j="${j}" title="Entiteit weghalen" aria-label="Entiteit weghalen">×</button>
  </div>`;

// ---------------------------------------------------------------- bewerken
const stapVan = el => KOPIE[+el.closest('.stap').dataset.i];

$('#stapList').addEventListener('input', ev => {
  const t = ev.target, kaart = t.closest('.stap'); if (!kaart) return;
  const s = stapVan(t);
  if (t.dataset.f) {
    s[t.dataset.f] = t.dataset.f === 'min_fotos' ? Math.max(1, +t.value || 1) : t.value;
    if (t.dataset.f === 'titel') $('.naam', kaart).textContent = t.value || 'zonder titel';
    if (t.dataset.f === 'fotos') renderStappen();
  }
  if (t.dataset.e) {
    const e = s.entiteiten[+t.closest('.entrij').dataset.j];
    e[t.dataset.e] = t.type === 'checkbox' ? t.checked : t.dataset.e === 'entity_id' ? t.value.trim().toLowerCase() : t.value;
  }
});
// naam van een gekozen entiteit overnemen uit HA
$('#stapList').addEventListener('change', ev => {
  const t = ev.target; if (t.dataset.e !== 'entity_id') return;
  const naamVeld = $('[data-e=naam]', t.closest('.entrij'));
  if (!naamVeld.value && entName(t.value.trim())) { naamVeld.value = entName(t.value.trim()); naamVeld.dispatchEvent(new Event('input', {bubbles: true})); }
});

$('#stapList').addEventListener('click', ev => {
  const img = ev.target.closest('img[data-uitleg]');
  if (img) { openLightbox(stapVan(img).afbeeldingen.map(a => ({src: 'photos/' + a.bestand})), +img.dataset.uitleg); return; }
  const b = ev.target.closest('[data-act]'); if (!b) return;
  const i = +b.closest('.stap').dataset.i, s = KOPIE[i], act = b.dataset.act;
  if (act === 'img') { stapImgDoel = i; return; }   // label opent de bestandskiezer
  if (act === 'open') { stapOpen = stapOpen === i ? -1 : i; }
  if (act === 'up' || act === 'down') {
    const j = act === 'up' ? i - 1 : i + 1;
    [KOPIE[i], KOPIE[j]] = [KOPIE[j], KOPIE[i]];
    if (stapOpen === i) stapOpen = j; else if (stapOpen === j) stapOpen = i;
  }
  if (act === 'del') {
    if ((s.titel || s.tekst || s.afbeeldingen.length) && !confirm(`Stap ${i + 1} "${s.titel || 'zonder titel'}" verwijderen?`)) return;
    KOPIE.splice(i, 1);
    stapOpen = Math.min(stapOpen, KOPIE.length - 1);
  }
  if (act === 'imgdel') s.afbeeldingen.splice(+b.dataset.j, 1);
  if (act === 'entadd') s.entiteiten.push({entity_id: '', naam: '', bedienen: false, vereist: ''});
  if (act === 'entdel') s.entiteiten.splice(+b.dataset.j, 1);
  renderStappen();
  if (act === 'entadd') $(`.stap[data-i="${i}"] .entrij:last-child [data-e=entity_id]`).focus();
});

$('#stapImgInput').addEventListener('change', async ev => {
  const files = [...ev.target.files], s = KOPIE[stapImgDoel];
  ev.target.value = '';
  if (!files.length || !s) return;
  toast('Afbeelding wordt opgeslagen…');
  try {
    for (const f of files) {
      const fd = new FormData(); fd.append('foto', await shrinkPhoto(f));
      s.afbeeldingen.push(await api('api/stappen/afbeelding', {method: 'POST', body: fd}));
    }
    renderStappen(); toast('Afbeelding toegevoegd');
  } catch (e) { toast(e.message); }
});
