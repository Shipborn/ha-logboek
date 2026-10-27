// Entiteiten uit Home Assistant kiezen (meetwaarden bij taken en categorieën).
let HA_ENTS = null;
async function loadHaEntities() {
  if (HA_ENTS) return HA_ENTS;
  try { HA_ENTS = await api('api/ha/entities'); } catch (_) { HA_ENTS = []; }
  $('#haEntities').innerHTML = HA_ENTS.map(e =>
    `<option value="${esc(e.entity_id)}">${esc(e.naam)}${e.eenheid ? ' (' + esc(e.eenheid) + ')' : ''}</option>`).join('');
  return HA_ENTS;
}
const entName = id => HA_ENTS?.find(e => e.entity_id === id)?.naam;

// keuzelijst met entiteiten; onChange krijgt de nieuwe lijst
function entPicker(el, list, onChange) {
  el._list = [...list];
  const draw = () => {
    el.innerHTML = `<div class="chips">${el._list.map((id, i) =>
      `<span class="entchip">${esc(entName(id) || id)}${entName(id) ? ` <small>${esc(id)}</small>` : ''}
        <button type="button" data-rm="${i}" aria-label="Weghalen">×</button></span>`).join('')}</div>
      <div class="add"><input list="haEntities" placeholder="Zoek entiteit, bijv. sensor.accuspanning" autocomplete="off">
        <button type="button" class="btn">Toevoegen</button></div>`;
  };
  const add = () => {
    const inp = $('input', el), id = inp.value.trim().toLowerCase();
    if (!id) return;
    if (!/^[a-z0-9_]+\.[a-z0-9_]+$/.test(id)) { toast('Ongeldige entiteit: ' + id); return; }
    if (!el._list.includes(id)) { el._list.push(id); onChange?.(el._list); }
    draw(); $('input', el).focus();
  };
  el.onclick = ev => {
    const rm = ev.target.closest('[data-rm]');
    if (rm) { el._list.splice(+rm.dataset.rm, 1); onChange?.(el._list); draw(); }
    else if (ev.target.closest('.add button')) add();
  };
  el.onkeydown = ev => { if (ev.key === 'Enter' && ev.target.matches('input')) { ev.preventDefault(); add(); } };
  draw();
  loadHaEntities().then(draw);
}
