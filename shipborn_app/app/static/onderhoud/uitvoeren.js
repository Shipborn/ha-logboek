// Onderhoud › Taken › Uitvoeren: stap voor stap door het stappenplan van een taak, met uitleg, afbeeldingen,
// Home Assistant-entiteiten (status, bedienen, voorwaarde voor Volgende) en uitvoeringsfoto's.
// Afronden maakt één logregel bij de taak met alle foto's, de opmerkingen per stap en de bestede tijd.
// Alles staat tot Afronden alleen in de browser: pagina sluiten = uitvoering kwijt.
let PROC = null, procTimer = null;
const VEREIST_TEKST = {off: 'uit', on: 'aan', closed: 'dicht', open: 'open'};
const WAARDE_TEKST = {on: 'aan', off: 'uit', open: 'open', closed: 'dicht', opening: 'gaat open', closing: 'gaat dicht',
  unavailable: 'niet beschikbaar', unknown: 'onbekend'};
const KNOP_TEKST = {valve: ['Open', 'Dicht'], cover: ['Open', 'Dicht']};   // overige domeinen: Aan / Uit

$('#procDlg .x').removeAttribute('data-close');   // sluiten loopt via stopUitvoeren (vraagt bevestiging)
if (HA_ANDROID) $('#procFile').removeAttribute('multiple');

function openUitvoeren(t) {
  PROC = {taak: t, i: 0, start: Date.now(), fotos: t.stappen.map(() => []), notities: t.stappen.map(() => ''),
          states: {}, bezig: false};
  renderProc();
  $('#procDlg').showModal();
  pollStates();
  clearInterval(procTimer); procTimer = setInterval(pollStates, 3000);
}

const procStap = () => PROC.taak.stappen[PROC.i];

function stopUitvoeren(klaar = false) {
  if (!PROC) return;
  const iets = PROC.fotos.some(l => l.length) || PROC.notities.some(n => n.trim());
  if (!klaar && iets && !confirm("Uitvoering afbreken? Gemaakte foto's en opmerkingen gaan verloren.")) return;
  PROC.fotos.flat().forEach(p => URL.revokeObjectURL(p.url));
  clearInterval(procTimer); PROC = null;
  $('#procDlg').close();
}

// ---------------------------------------------------------------- weergave
function renderProc() {
  const s = procStap(), n = PROC.taak.stappen.length, i = PROC.i;
  $('#procTitle').textContent = PROC.taak.naam;
  $('#procStap').textContent = `stap ${i + 1} van ${n}`;
  $('#procBody').innerHTML = `
    <div class="procvoortgang">${PROC.taak.stappen.map((_, j) => `<span class="${j < i ? 'klaar' : j === i ? 'nu' : ''}"></span>`).join('')}</div>
    <h3 class="proctitel">${i + 1}. ${esc(s.titel)}</h3>
    ${als(s.tekst, `<div class="uitleg">${mdHtml(s.tekst)}</div>`)}
    ${als(s.afbeeldingen.length, `<div class="thumbs procimgs">${s.afbeeldingen.map((a, j) =>
      `<img src="photos/${a.thumb}" data-uitleg="${j}" alt="Afbeelding ${j + 1}">`).join('')}</div>`)}
    ${als(s.entiteiten.length, '<div class="procents" id="procEnts"></div><div id="procGate"></div>')}
    ${als(s.fotos !== 'geen', `<div class="procfoto">
      <label>${esc(s.foto_vraag || "Foto's van de uitvoering")}
        <span class="hint">(${s.fotos === 'verplicht' ? `verplicht, minimaal ${s.min_fotos}` : 'optioneel'})</span></label>
      <div class="photos" id="procFotos"></div><p class="hint" id="procTekort" hidden></p></div>`)}
    <label class="procnotitie">Opmerking bij deze stap <span class="hint">(optioneel, komt in de logregel)</span>
      <textarea id="procNotitie" rows="2">${esc(PROC.notities[i])}</textarea></label>`;
  $('#procTerug').textContent = i ? '‹ Vorige' : 'Annuleren';
  $('#procVerder').textContent = i === n - 1 ? 'Afronden ✓' : 'Volgende ›';
  if (s.entiteiten.length) renderProcEnts();
  if (s.fotos !== 'geen') renderProcFotos();
  knoppenBijwerken();
}

const waardeTekst = st => st ? (WAARDE_TEKST[st.waarde] || st.waarde) + (st.eenheid ? ' ' + st.eenheid : '') : '…';
const entNaam = e => e.naam || PROC.states[e.entity_id]?.naam || e.entity_id;

// voorwaarden van deze stap die nog niet kloppen
const gateMis = () => procStap().entiteiten.filter(e => e.vereist && PROC.states[e.entity_id]?.waarde !== e.vereist)
  .map(e => `${entNaam(e)} moet ${VEREIST_TEKST[e.vereist] || e.vereist} zijn`);

function renderProcEnts() {
  const s = procStap();
  if (!$('#procEnts')) return;
  $('#procEnts').innerHTML = s.entiteiten.map((e, j) => {
    const st = PROC.states[e.entity_id];
    const ok = !e.vereist || st?.waarde === e.vereist;
    const [aan, uit] = KNOP_TEKST[e.entity_id.split('.')[0]] || ['Aan', 'Uit'];
    return `<div class="procent${e.vereist ? (ok ? ' ok' : ' nok') : ''}">
      <div class="grow"><b>${esc(entNaam(e))}</b><span class="hint">${esc(e.entity_id)}</span></div>
      <span class="chip">${esc(waardeTekst(st))}</span>
      ${als(e.bedienen, `<button type="button" class="btn" data-bedien="${j}" data-aan="1">${aan}</button>
        <button type="button" class="btn" data-bedien="${j}" data-aan="0">${uit}</button>`)}
    </div>`;
  }).join('');
  const mis = gateMis();
  $('#procGate').innerHTML = !s.entiteiten.some(e => e.vereist) ? ''
    : mis.length ? `<div class="alert bad">❌ Nog niet gereed${mis.map(m => '<br>• ' + esc(m)).join('')}</div>`
    : '<div class="alert good">✅ Gereed – u kunt door naar de volgende stap</div>';
  knoppenBijwerken();
}

function renderProcFotos() {
  if (!$('#procFotos')) return;
  const busy = PROC.bezig ? ' busy' : '';
  $('#procFotos').innerHTML = PROC.fotos[PROC.i].map((p, j) =>
    `<div class="ph new"><img src="${p.url}" data-pf="${j}" alt=""><button type="button" data-pfdel="${j}" aria-label="Foto weghalen">×</button></div>`).join('') +
    `<label class="addph${busy}" for="procCam"><span>📷</span>Foto maken</label>` +
    `<label class="addph${busy}" for="procFile"><span>🖼️</span>${PROC.bezig ? 'Bezig…' : 'Uit galerij'}</label>`;
  knoppenBijwerken();
}

// Volgende/Afronden alleen als de voorwaarden kloppen en er genoeg foto's zijn
function knoppenBijwerken() {
  const s = procStap(), mis = gateMis();
  const tekort = s.fotos === 'verplicht' ? Math.max(0, s.min_fotos - PROC.fotos[PROC.i].length) : 0;
  $('#procVerder').disabled = !!(tekort || mis.length || PROC.bezig);
  const t = $('#procTekort');
  if (t) { t.hidden = !tekort; t.textContent = `Nog ${meervoud(tekort, 'foto', "foto's")} nodig om verder te gaan.`; }
}

// ---------------------------------------------------------------- Home Assistant
async function pollStates() {
  const ids = PROC && procStap().entiteiten.map(e => e.entity_id);
  if (!ids?.length) return;
  try {
    const states = await api('api/ha/states?ids=' + ids.join(','));
    if (!PROC) return;
    Object.assign(PROC.states, states);
    renderProcEnts();
  } catch (_) {}
}

async function bedien(knop) {
  const e = procStap().entiteiten[+knop.dataset.bedien];
  knop.disabled = true;
  try {
    const st = await api('api/ha/bedien', json('POST', {entity_id: e.entity_id, aan: knop.dataset.aan === '1'}));
    if (st && PROC) PROC.states[e.entity_id] = st;
    renderProcEnts();
    setTimeout(pollStates, 1500);   // kleppen en pompen hebben soms even nodig
  } catch (err) { toast(err.message); knop.disabled = false; }
}

// ---------------------------------------------------------------- foto's
async function procAddFiles(files) {
  if (!files.length) return;
  const lijst = PROC.fotos[PROC.i];
  PROC.bezig = true; renderProcFotos();
  try {
    for (const f of files) {
      const file = await shrinkPhoto(f);
      lijst.push({file, url: URL.createObjectURL(file)});
    }
  } finally { if (PROC) { PROC.bezig = false; renderProcFotos(); } }
}
const procFotoGekozen = ev => { const files = [...ev.target.files]; ev.target.value = ''; procAddFiles(files); };
$('#procCam').addEventListener('change', procFotoGekozen);
$('#procFile').addEventListener('change', procFotoGekozen);
// in de HA Android-app opent Foto maken de camera in de pagina
$('#procBody').addEventListener('click', ev => {
  if (IN_PAGE_CAMERA && ev.target.closest('label[for="procCam"]')) { ev.preventDefault(); openCamera(f => procAddFiles([f])); }
}, true);

$('#procBody').addEventListener('click', ev => {
  const t = ev.target, s = procStap();
  const knop = t.closest('[data-bedien]');
  if (knop) { bedien(knop); return; }
  if (t.dataset.uitleg != null) openLightbox(s.afbeeldingen.map(a => ({src: 'photos/' + a.bestand})), +t.dataset.uitleg);
  if (t.dataset.pf != null) openLightbox(PROC.fotos[PROC.i].map(p => ({src: p.url})), +t.dataset.pf);
  if (t.dataset.pfdel != null) {
    const [p] = PROC.fotos[PROC.i].splice(+t.dataset.pfdel, 1);
    URL.revokeObjectURL(p.url); renderProcFotos();
  }
});
$('#procBody').addEventListener('input', ev => { if (ev.target.id === 'procNotitie') PROC.notities[PROC.i] = ev.target.value; });

// ---------------------------------------------------------------- navigatie en afronden
const naarStap = i => { PROC.i = i; renderProc(); $('#procBody').scrollTop = 0; pollStates(); };
$('#procTerug').addEventListener('click', () => PROC.i ? naarStap(PROC.i - 1) : stopUitvoeren());
$('#procVerder').addEventListener('click', () => PROC.i < PROC.taak.stappen.length - 1 ? naarStap(PROC.i + 1) : afronden());
$('#procDlg .x').addEventListener('click', () => stopUitvoeren());
$('#procDlg').addEventListener('cancel', ev => { ev.preventDefault(); stopUitvoeren(); });

async function afronden() {
  const t = PROC.taak, knop = $('#procVerder');
  const fd = new FormData();
  fd.append('datum', today());
  fd.append('categorie', t.categorie || '');
  fd.append('task_id', t.id);
  fd.append('titel', t.naam);
  fd.append('duur', durInput(Math.max(1, Math.round((Date.now() - PROC.start) / 60000))));
  const opmerkingen = t.stappen.map((s, i) => PROC.notities[i].trim() && `Stap ${i + 1} – ${s.titel}: ${PROC.notities[i].trim()}`);
  fd.append('omschrijving', [`Uitgevoerd volgens stappenplan (${meervoud(t.stappen.length, 'stap', 'stappen')}).`,
    ...opmerkingen.filter(Boolean)].join('\n'));
  t.stappen.forEach((s, i) => PROC.fotos[i].forEach(p => {
    fd.append('fotos', p.file, p.file.name || 'foto.jpg');
    fd.append('foto_omschrijving', `Stap ${i + 1} – ${s.titel}`);
  }));
  knop.disabled = true; knop.textContent = 'Opslaan…';
  try {
    await api('api/entries', {method: 'POST', body: fd});
    stopUitvoeren(true);
    toast('Onderhoud afgerond en gelogd');
    await verversAlles();
  } catch (e) { toast(e.message); knop.disabled = false; knop.textContent = 'Afronden ✓'; }
}
