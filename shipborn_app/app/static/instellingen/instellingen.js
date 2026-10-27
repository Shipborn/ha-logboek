// Instellingen: logo (staat ook in de kop van de app, in elke PDF en in de dagmail).
tabblad('settings', {
  config: () => showLogo(),
});

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
