// Gedeelde basis: hulpfuncties, API, navigatie tussen modules/tabbladen en het opstarten.
// Elk tabblad (static/<module>/<tabblad>.js) meldt zich aan met tabblad(id, {...}).
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('nl-NL', {day:'numeric', month:'short', year:'numeric'}) : '';
const fmtNum = (n, dec = 1) => n == null ? '' : Number(n).toLocaleString('nl-NL', {maximumFractionDigits: dec});
// tijdstempels zonder offset (vóór 0.4.0) zijn UTC
const fmtStamp = s => s ? new Date(/[zZ]|[+-]\d\d:\d\d$/.test(s) ? s : s + 'Z').toLocaleString('nl-NL',
  {day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'}) : '';
const fmtDur = m => m == null ? '' : m < 60 ? `${m} min` : `${Math.floor(m / 60)} u` + (m % 60 ? ` ${m % 60} min` : '');
const durInput = m => m == null ? '' : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
const nlNum = n => n == null ? '' : String(n).replace('.', ',');
const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const json = (method, body) => ({method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});

let CFG = {categories: []}, TAB = null;

async function api(path, opts = {}) {
  const r = await fetch(path, opts);
  if (!r.ok) {
    let msg = r.statusText;
    try { msg = (await r.json()).error || msg; } catch (_) {}
    throw new Error(msg || 'Er ging iets mis');
  }
  return (r.headers.get('content-type') || '').includes('json') ? r.json() : r.text();
}

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 2600);
}

function fillSelect(sel, items, first) {
  sel.innerHTML = (first ? `<option value="">${esc(first)}</option>` : '') +
    items.map(i => `<option value="${esc(i.value ?? i)}">${esc(i.label ?? i)}</option>`).join('');
}

// Alle keuzelijsten met data-categorieen="<eerste optie>" vullen met de categorieën (keuze blijft staan).
function vulCategorieKeuzes() {
  $$('select[data-categorieen]').forEach(sel => {
    const keep = sel.value;
    fillSelect(sel, CFG.categories, sel.dataset.categorieen);
    sel.value = CFG.categories.includes(keep) ? keep : '';
  });
}

// ---------------------------------------------------------------- berichten tussen tabbladen
const LUISTERAARS = {};
const op = (naam, fn) => (LUISTERAARS[naam] ??= []).push(fn);
const meld = (naam, ...args) => (LUISTERAARS[naam] || []).forEach(fn => fn(...args));

// ---------------------------------------------------------------- tabbladen
// tabblad(id, {nieuw, toon, config, laden, ververs, naVerversen}):
//   nieuw()       – actie van de +-knop (zonder: geen +-knop)
//   toon()        – bij openen van het tabblad
//   config(CFG)   – na het laden van de instellingen
//   laden()       – bij het opstarten
//   ververs()     – na een wijziging ergens in de app; naVerversen() daarna (als alle lijsten bijgewerkt zijn)
const TABBLADEN = {};
const tabblad = (id, def) => { TABBLADEN[id] = def; };
const alle = (hook, ...args) => Promise.all(Object.values(TABBLADEN).map(t => t[hook]?.(...args)));

async function verversAlles() {
  await alle('ververs');
  await alle('naVerversen');
}

// rood getal bij een tabblad; de knop van de module toont het totaal van haar tabbladen
function zetTeller(tab, n) {
  const sec = $('#view-' + tab);
  const knop = $(`.tab[data-tab="${tab}"] .count`) || $(`.mod[data-mod="${tab}"] .count`);
  knop.hidden = !n; knop.textContent = n || '';
  sec.dataset.teller = n || 0;
  const nav = $(`.tab[data-tab="${tab}"]`)?.closest('nav');
  if (nav) {
    const som = $$('.tab', nav).reduce((s, b) => s + (+$('#view-' + b.dataset.tab).dataset.teller || 0), 0);
    const m = $(`.mod[data-mod="${nav.dataset.mod}"] .count`);
    m.hidden = !som; m.textContent = som || '';
  }
}

// ---------------------------------------------------------------- navigatie
// Modules met meer tabbladen hebben een <nav class="tabs" data-mod>; anders is de module zelf het tabblad.
const tabsVan = mod => { const n = $(`nav.tabs[data-mod="${mod}"]`); return n ? $$('.tab', n).map(b => b.dataset.tab) : [mod]; };
const LAATSTE = {};
function show(mod, tab) {
  if (!$(`.mod[data-mod="${mod}"]`)) mod = $('.mod').dataset.mod;
  const tabs = tabsVan(mod);
  if (!tabs.includes(tab)) tab = LAATSTE[mod] || tabs[0];
  LAATSTE[mod] = TAB = tab;
  $$('.mod').forEach(x => x.classList.toggle('active', x.dataset.mod === mod));
  $$('nav.tabs').forEach(n => n.hidden = n.dataset.mod !== mod);
  $$('.tab').forEach(x => x.classList.toggle('active', x.dataset.tab === tab));
  $$('main > section').forEach(s => s.hidden = s.id !== 'view-' + tab);
  $('#fab').hidden = !TABBLADEN[tab]?.nieuw;
  TABBLADEN[tab]?.toon?.();
  history.replaceState(null, '', '#' + mod + (tabs.length > 1 ? '/' + tab : ''));
}

// ---------------------------------------------------------------- opstarten
async function loadConfig() {
  CFG = await api('api/config');
  $('#title').textContent = CFG.title; document.title = CFG.title;
  const h = $('#hours');
  if (CFG.motoruren != null) { h.hidden = false; h.textContent = `${fmtNum(CFG.motoruren)} motoruren`; }
  else h.hidden = true;
  vulCategorieKeuzes();
  await alle('config', CFG);
}

async function start() {
  $$('[data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
  $$('.mod').forEach(b => b.addEventListener('click', () => show(b.dataset.mod)));
  $$('.tab').forEach(b => b.addEventListener('click', () => show(b.closest('nav').dataset.mod, b.dataset.tab)));
  $('#fab').addEventListener('click', () => TABBLADEN[TAB]?.nieuw?.());
  show(...location.hash.slice(1).split('/'));
  try {
    await loadConfig();
    await alle('laden');
  } catch (e) { toast('Laden mislukt: ' + e.message); }
}
