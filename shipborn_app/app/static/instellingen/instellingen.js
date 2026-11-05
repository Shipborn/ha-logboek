// Instellingen: urentellers (hoofdmotor, generator), de gekoppelde agenda en het logo
// (ook in de kop van de app, in elke PDF en in de dagmail).
tabblad('settings', {
  config: () => showLogo(),
  toon: () => { loadUren(); loadAgendaInst(); },
});

// ---------------------------------------------------------------- urentellers
async function loadUren() {
  const {tellers} = await api('api/instellingen');
  $('#urenRijen').innerHTML = tellers.map(t => `
    <div class="urenrij">
      <b>${esc(t.naam)}</b>
      <input name="${t.id}" list="haEntities" value="${esc(t.entiteit || '')}" placeholder="bijv. sensor.${t.id}_uren" autocomplete="off">
      <span class="stand">${t.entiteit ? (t.waarde != null ? `nu <b>${fmtNum(t.waarde)} u</b>` : 'geen getal') : 'niet ingesteld'}</span>
    </div>`).join('');
  loadHaEntities();
}

$('#urenForm').addEventListener('submit', async ev => {
  ev.preventDefault();
  const tellers = Object.fromEntries($$('#urenRijen input').map(i => [i.name, i.value.trim()]));
  try {
    await api('api/instellingen', json('PUT', {tellers}));
    toast('Urentellers opgeslagen');
    await Promise.all([loadUren(), loadConfig()]);
    await verversAlles();
  } catch (e) { toast(e.message); }
});

// ---------------------------------------------------------------- agenda (iCloud/CalDAV of Google)
// Inloggegevens staan in de configuratie van de app (HA › Instellingen › Apps › Shipborn App › Configuratie);
// dienst, kalender en of logregels meegaan staan in de database. Google koppel je hier (toestemming geven en het
// adres waar Google naartoe stuurt terugplakken).
let AGI = null, agiDienst = null;

const agendaStatus = st => !st ? '' : st.ok
  ? `Laatst gesynchroniseerd ${fmtStamp(st.tijd)}` + (st.verstuurd || st.opgehaald ? ` (${st.verstuurd} verstuurd, ${st.opgehaald} opgehaald)` : '')
  : `<span class="bad">Synchroniseren mislukt (${fmtStamp(st.tijd)}): ${esc(st.fout)}</span>`;

const OPTIES_PAD = '<b>Instellingen › Apps › Shipborn App › Configuratie</b>';
const CALDAV_UITLEG = `<div class="hnote">Vul in Home Assistant bij ${OPTIES_PAD} in:
  <ul><li><b>caldav_url</b>: voor iCloud <code>https://caldav.icloud.com/</code> (staat al ingevuld)</li>
  <li><b>caldav_username</b>: je Apple ID (e-mailadres)</li>
  <li><b>caldav_password</b>: een <b>app-specifiek wachtwoord</b>, aan te maken op account.apple.com › Inloggen en beveiliging › App-specifieke wachtwoorden (niet je gewone wachtwoord)</li></ul>
  Herstart daarna de app en kies hier de kalender.</div>`;
const GOOGLE_UITLEG = `<div class="hnote">Google vraagt een eigen (gratis) koppeling in Google Cloud. Eenmalig:
  <ol><li>Ga naar <b>console.cloud.google.com</b>, maak een project en zet bij <i>API's en services › Bibliotheek</i> de <b>Google Calendar API</b> aan.</li>
  <li>Bij <i>OAuth-toestemmingsscherm</i>: kies <b>Extern</b>, vul een naam en je e-mailadres in, en zet de app daarna op <b>Publiceren / In productie</b> (anders verloopt de koppeling na 7 dagen). Verificatie door Google is niet nodig.</li>
  <li>Bij <i>Inloggegevens › Inloggegevens maken › OAuth-client-ID</i>: kies type <b>Desktop-app</b>.</li>
  <li>Zet de <b>client-ID</b> en het <b>clientgeheim</b> bij ${OPTIES_PAD} in <b>google_client_id</b> en <b>google_client_secret</b>, herstart de app en koppel hier.</li></ol></div>`;

async function loadAgendaInst() {
  AGI = await api('api/agenda/instellingen');
  agiDienst = AGI.dienst;
  renderAgendaInst();
}

function renderAgendaInst() {
  const box = $('#agendaInst'), d = agiDienst, i = AGI;
  const klaar = d === 'google' ? i.google.gekoppeld : i.caldav.ingesteld;
  let acc = '';
  if (d === 'caldav') acc = i.caldav.ingesteld ? `<p class="hint">Account: ${esc(i.caldav.gebruiker)} · ${esc(i.caldav.url)}</p>` : CALDAV_UITLEG;
  else if (!i.google.ingesteld) acc = GOOGLE_UITLEG;
  else if (!i.google.gekoppeld) acc = `<div class="hnote gkoppel">
      <b>Koppelen met Google</b>
      <ol><li><a class="btn primary" href="#" id="gStart">Google openen en toestemming geven</a><br>
        <span class="hint">Doe dit in een gewone browser (op de computer of telefoon), niet in de Home Assistant-app.
        Krijg je de melding dat Google de app niet heeft geverifieerd: kies <i>Geavanceerd › Ga naar … (onveilig)</i> — het is je eigen koppeling.</span></li>
      <li>Daarna opent een pagina die <b>niet laadt</b> (adres begint met <code>http://localhost</code>). Dat hoort zo:
        kopieer het hele adres uit de adresbalk en plak het hier.
        <div class="gplak"><input id="gAdres" placeholder="http://localhost/?state=…&code=…" autocomplete="off">
        <button type="button" class="btn primary" id="gKlaar">Koppeling afronden</button></div></li></ol></div>`;
  else acc = `<p class="hint">Gekoppeld met Google · <a href="#" id="gOntkoppel">ontkoppelen</a></p>`;

  box.innerHTML = `
    <div class="dienst" role="radiogroup">
      <label class="check"><input type="radio" name="dienst" value="caldav"${d === 'caldav' ? ' checked' : ''}> iCloud / CalDAV</label>
      <label class="check"><input type="radio" name="dienst" value="google"${d === 'google' ? ' checked' : ''}> Google Agenda</label>
    </div>
    ${acc}
    ${als(klaar, `<label class="agkal">Kalender<select name="kalender"><option value="">Kalenders ophalen…</option></select></label>
    <label class="check"><input type="checkbox" name="logregels"${i.logregels ? ' checked' : ''}> Logregels ook in de agenda zetten</label>
    <p class="hint">Logregels gaan alleen van de app naar de agenda, als afspraak van een hele dag (vanaf 90 dagen terug).</p>`)}
    <p class="hint" id="agendaStatus">${d === i.dienst ? agendaStatus(i.status) : ''}</p>`;
  $('#agendaKnoppen').hidden = !klaar;
  if (klaar) vulKalenders();
}

async function vulKalenders() {
  const sel = $('#agendaForm [name=kalender]'), eigen = agiDienst === AGI.dienst;
  const huidig = eigen ? AGI.kalender : '';
  try {
    const kals = await api('api/agenda/kalenders?dienst=' + agiDienst);
    fillSelect(sel, kals.map(k => ({value: k.href, label: k.naam})), '— niet koppelen —');
    sel.value = huidig;
    if (huidig && sel.value !== huidig) {   // gekozen kalender bestaat niet meer
      sel.insertAdjacentHTML('beforeend', `<option value="${esc(huidig)}">${esc(AGI.kalender_naam || huidig)} (niet gevonden)</option>`);
      sel.value = huidig;
    }
  } catch (e) {
    fillSelect(sel, huidig ? [{value: huidig, label: AGI.kalender_naam}] : [], '— niet koppelen —');
    sel.value = huidig;
    $('#agendaStatus').innerHTML = `<span class="bad">${esc(e.message)}</span>`;
  }
}

$('#agendaInst').addEventListener('change', ev => {
  if (ev.target.name === 'dienst') { agiDienst = ev.target.value; renderAgendaInst(); }
});

$('#agendaInst').addEventListener('click', async ev => {
  const id = ev.target.id;
  if (id === 'gStart') {
    ev.preventDefault();
    const w = window.open('', '_blank');   // direct openen, anders blokkeert de browser het venster
    try {
      const {url} = await api('api/agenda/google/start', {method: 'POST'});
      if (w) w.location = url; else location.href = url;
    } catch (e) { w?.close(); toast(e.message); }
  }
  if (id === 'gKlaar') {
    try {
      AGI = await api('api/agenda/google/klaar', json('POST', {adres: $('#gAdres').value}));
      agiDienst = 'google';
      toast('Gekoppeld met Google; kies nu de kalender');
      renderAgendaInst();
    } catch (e) { toast(e.message); }
  }
  if (id === 'gOntkoppel') {
    ev.preventDefault();
    if (!confirm('De koppeling met Google verbreken? De afspraken blijven in Google Agenda staan.')) return;
    try { AGI = await api('api/agenda/google/ontkoppel', {method: 'POST'}); renderAgendaInst(); await verversAlles(); }
    catch (e) { toast(e.message); }
  }
});

$('#agendaForm').addEventListener('submit', async ev => {
  ev.preventDefault();
  const f = ev.target, sel = f.kalender;
  const body = {dienst: agiDienst, kalender: sel.value, kalender_naam: sel.value ? sel.selectedOptions[0].textContent : '',
    logregels: f.logregels.checked};
  if (AGI.kalender && (body.kalender !== AGI.kalender || body.dienst !== AGI.dienst) &&
      !confirm('Een andere agenda kiezen? De afspraken die al in de vorige agenda staan, blijven daar staan.')) return;
  toast('Opslaan en synchroniseren…');
  try {
    AGI = await api('api/agenda/instellingen', json('PUT', body));
    toast(AGI.status && !AGI.status.ok ? 'Opgeslagen, maar synchroniseren mislukt' : 'Agenda opgeslagen');
    $('#agendaStatus').innerHTML = agendaStatus(AGI.status);
    await verversAlles();
  } catch (e) { toast(e.message); }
});

$('#agendaSyncNu').addEventListener('click', async () => {
  toast('Bezig met synchroniseren…');
  try {
    AGI = await api('api/agenda/sync', {method: 'POST'});
    $('#agendaStatus').innerHTML = agendaStatus(AGI.status);
    toast(AGI.status?.ok ? 'Agenda bijgewerkt' : 'Synchroniseren mislukt');
    await verversAlles();
  } catch (e) { toast(e.message); }
});

// ---------------------------------------------------------------- logo
function showLogo() {
  const src = CFG.logo ? 'logo.png?v=' + CFG.logo : null;
  $('#logo').hidden = !src; if (src) $('#logo').src = src;
  $('#logoPrev').innerHTML = src ? `<img src="${src}" alt="Logo">` : '<span class="hint">Nog geen logo</span>';
  $('#logoDel').hidden = !src;
}

$('#logoInput').addEventListener('change', async ev => {
  const file = ev.target.files[0]; ev.target.value = '';
  if (!file) return;
  const fd = new FormData(); fd.append('logo', file);
  try { CFG.logo = (await api('api/logo', {method: 'POST', body: fd})).logo; showLogo(); toast('Logo opgeslagen'); }
  catch (e) { toast(e.message); }
});

$('#logoDel').addEventListener('click', async () => {
  if (!confirm('Logo verwijderen?')) return;
  try { await api('api/logo', {method: 'DELETE'}); CFG.logo = null; showLogo(); toast('Logo verwijderd'); }
  catch (e) { toast(e.message); }
});
