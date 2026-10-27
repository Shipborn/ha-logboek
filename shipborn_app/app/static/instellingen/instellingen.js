// Instellingen: urentellers (hoofdmotor, generator) en logo (ook in de kop van de app, in elke PDF en in de dagmail).
tabblad('settings', {
  config: () => showLogo(),
  toon: () => loadUren(),
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
