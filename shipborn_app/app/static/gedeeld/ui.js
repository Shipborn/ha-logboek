// Gedeelde HTML-bouwstenen, zodat de tabbladen alleen hun eigen inhoud hoeven te beschrijven.
const als = (v, html) => v ? html : '';
const meervoud = (n, een, meer) => `${n} ${n === 1 ? een : meer}`;
const chip = tekst => als(tekst, `<span class="chip">${esc(tekst)}</span>`);
const leeg = html => `<div class="empty">${html}</div>`;
const duurHtml = m => als(m != null, `<span title="Bestede tijd">⏱ ${fmtDur(m)}</span>`);
const pdfKnop = (href, titel, eind = false) => `<a class="pdfbtn${eind ? ' end' : ''}" href="${href}" download title="${esc(titel)}">PDF</a>`;
const stampHtml = e => als(e.created_at, `<span class="stamp" title="Opgeslagen">opgeslagen ${fmtStamp(e.created_at)}${e.ingevoerd_door ? ' door ' + esc(e.ingevoerd_door) : ''}</span>`);
// statistiekblokjes: [[waarde, omschrijving], ...]
const statsHtml = lijst => `<div class="stats">${lijst.map(([v, l]) => `<div class="stat"><b>${v}</b><span>${esc(l)}</span></div>`).join('')}</div>`;

// miniaturen van de foto's van een logregel; extra = extra attributen per <img> (bijv. data-lb)
const thumbsHtml = (fotos, extra = '') => als(fotos.length, `<div class="thumbs">${fotos.map((f, i) =>
  `<img loading="lazy" src="photos/${f.thumb}" ${extra} data-i="${i}" alt="${esc(f.omschrijving)}" title="${esc(f.omschrijving)}">`).join('')}</div>`);

// meetwaarden uit HA bij een logregel
const fmtVal = v => {
  const n = Number(v.waarde);
  const w = v.waarde != null && v.waarde !== '' && !isNaN(n) ? fmtNum(n, 2) : esc(v.waarde ?? '—');
  return `<span class="val" title="${esc(v.entity_id)}">${esc(v.naam)}: <b>${w}${v.eenheid ? ' ' + esc(v.eenheid) : ''}</b></span>`;
};
const valsHtml = list => als(list?.length, `<div class="vals">${(list || []).map(fmtVal).join('')}</div>`);

// Eenvoudige opmaak voor uitleg (stappenplan): **vet**, *cursief*, regels met "- " of "1. " worden een
// lijst, een lege regel begint een nieuwe alinea. Alles wordt eerst ge-escaped.
function mdHtml(tekst) {
  const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>');
  const out = [];
  let lijst = null, alinea = [];
  const sluit = () => {
    if (alinea.length) out.push(`<p>${alinea.join('<br>')}</p>`);
    if (lijst) out.push(`<${lijst.tag}>${lijst.items.join('')}</${lijst.tag}>`);
    alinea = []; lijst = null;
  };
  for (const regel of String(tekst || '').split('\n')) {
    const m = regel.match(/^\s*(?:([-*•])|(\d+)[.)])\s+(.*)$/);
    if (m) {
      const tag = m[1] ? 'ul' : 'ol';
      if (alinea.length || (lijst && lijst.tag !== tag)) sluit();
      lijst ??= {tag, items: []};
      lijst.items.push(`<li>${inline(m[3])}</li>`);
    } else if (!regel.trim()) {
      sluit();
    } else {
      if (lijst) sluit();
      alinea.push(inline(regel));
    }
  }
  sluit();
  return out.join('');
}

// ---------------------------------------------------------------- tijdlijn van logregels (taakgeschiedenis, categorie)
function tlItem(e, top) {
  return `<li data-id="${e.id}">
        ${als(top, `<div class="gap">${top}</div>`)}
        <div class="meta"><span>${fmtDate(e.datum)}</span>
          ${als(e.uitgevoerd_door, `<span>${esc(e.uitgevoerd_door)}</span>`)}
          ${duurHtml(e.duur_minuten)}
          ${stampHtml(e)}</div>
        <h4>${esc(e.titel)}</h4>
        ${als(e.omschrijving, `<p class="full-desc">${esc(e.omschrijving)}</p>`)}
        ${valsHtml(e.waarden)}
        ${thumbsHtml(e.fotos)}
      </li>`;
}

// HTML van een tijdlijn in el (el._list onthoudt de logregels voor tlClick); klik op een foto opent de lightbox, anders de logregel
function tijdlijnHtml(el, lijst, top) {
  el._list = lijst;
  return `<ul class="tl">${lijst.map(e => tlItem(e, top(e))).join('')}</ul>`;
}
function tlClick(ev) {
  const li = ev.target.closest('.tl li'); if (!li) return;
  const e = ev.currentTarget._list.find(x => x.id == li.dataset.id);
  const img = ev.target.closest('img[data-i]');
  if (img) openLightbox(lbItems(e.fotos), +img.dataset.i);
  else openEntry(e);
}
