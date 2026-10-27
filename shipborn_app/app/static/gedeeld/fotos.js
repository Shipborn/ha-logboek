// Foto's (gedeeld): verkleinen, camera in de pagina, foto-editor en lightbox.
// De dialogen staan in templates/gedeeld/fotos.html.

// Verklein en zet om naar JPEG in de browser: telefoonfoto's (ook HEIF van Samsung) worden
// klein genoeg voor een snelle upload via ingress. Lukt dat niet, dan gaat het origineel mee.
async function shrinkPhoto(file) {
  const max = CFG.photo_max_px || 2000;
  try {
    const bmp = await createImageBitmap(file, {imageOrientation: 'from-image'});
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.88));
    if (!blob) throw new Error('toBlob mislukt');
    return new File([blob], (file.name || 'foto').replace(/\.[^.]*$/, '') + '.jpg', {type: 'image/jpeg'});
  } catch (e) {
    console.warn('Foto niet verkleind, origineel wordt geüpload', e);
    return file;
  }
}

// De Android-app van Home Assistant negeert capture="environment" (opent de galerij) en geeft bij
// "multiple" geen bestanden terug. Daar dus één foto per keer kiezen en de camera in de pagina zelf.
const HA_ANDROID = /Android/i.test(navigator.userAgent) && (() => {
  if (/Home ?Assistant/i.test(navigator.userAgent) || 'externalApp' in window) return true;
  try { return 'externalApp' in window.parent; } catch (_) { return false; }
})();
const IN_PAGE_CAMERA = HA_ANDROID && !!navigator.mediaDevices?.getUserMedia;

// ---------------------------------------------------------------- camera in de pagina
// openCamera(onFile): onFile krijgt een File (JPEG, nog niet verkleind) na het maken van de foto.
let camStream = null, camKlaar = null;
async function openCamera(onFile) {
  try {
    camStream = await navigator.mediaDevices.getUserMedia({audio: false,
      video: {facingMode: {ideal: 'environment'}, width: {ideal: 4032}, height: {ideal: 3024}}});
  } catch (e) {
    console.warn('Camera niet beschikbaar', e);
    toast(e.name === 'NotAllowedError'
      ? 'Geen toegang tot de camera. Geef de Home Assistant-app cameratoestemming, of kies Uit galerij.'
      : 'Camera niet beschikbaar; kies Uit galerij.');
    return;
  }
  camKlaar = onFile;
  const v = $('#camDlg video');
  v.srcObject = camStream;
  $('#camDlg').showModal();
  try { await v.play(); } catch (_) {}
}
function closeCamera() {
  camStream?.getTracks().forEach(t => t.stop()); camStream = null;
  $('#camDlg video').srcObject = null;
  if ($('#camDlg').open) $('#camDlg').close();
}
$('#camCancel').addEventListener('click', closeCamera);
$('#camDlg').addEventListener('cancel', closeCamera);
$('#camShot').addEventListener('click', async () => {
  const v = $('#camDlg video');
  if (!v.videoWidth) return;
  const c = Object.assign(document.createElement('canvas'), {width: v.videoWidth, height: v.videoHeight});
  c.getContext('2d').drawImage(v, 0, 0);
  closeCamera();
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.92));
  if (!blob) { toast('Foto maken mislukt'); return; }
  camKlaar?.(new File([blob], 'camera.jpg', {type: 'image/jpeg'}));
});

// ---------------------------------------------------------------- foto bewerken (tekenen, pijlen, tekst)
// Vormen worden in beeldcoördinaten bewaard; bij Opslaan wordt alles in de foto "gebakken".
// openEditor(src, target, klaar): target is {pending} (nog niet geüpload: bestand wordt vervangen)
// of {photo} (bestaande foto: direct opgeslagen via de API); klaar() wordt daarna aangeroepen.
const ED_COLORS = ['#e53935', '#fdd835', '#43a047', '#1e88e5', '#ffffff', '#000000'];
const ed = {img: null, shapes: [], cur: null, tool: 'pen', color: ED_COLORS[0], size: 1, target: null, klaar: null, base: null};
$('#edColors').innerHTML = ED_COLORS.map((c, i) =>
  `<button type="button" class="edc${i ? '' : ' on'}" data-color="${c}" style="background:${c}" aria-label="Kleur"></button>`).join('');

async function openEditor(src, target, klaar) {
  ed.target = target; ed.klaar = klaar; ed.shapes = []; ed.cur = null;
  const img = new Image();
  try {
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = src; });
  } catch (_) { toast('Foto kan niet geladen worden'); return; }
  ed.img = img;
  const c = $('#edCanvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  ed.unit = Math.max(c.width, c.height) / 160;   // lijndikte schaalt mee met de foto
  $('#edRestore').hidden = !target.photo?.bewerkt;
  $('#editor').showModal();
  fitEditor(); rebuildBase(); drawEditor();
}

function fitEditor() {
  const c = $('#edCanvas'), w = $('.edwrap');
  const s = Math.min((w.clientWidth - 16) / c.width, (w.clientHeight - 16) / c.height);
  c.style.width = c.width * s + 'px'; c.style.height = c.height * s + 'px';
}
window.addEventListener('resize', () => { if ($('#editor').open) fitEditor(); });

function rebuildBase() {   // foto + afgeronde vormen, zodat tekenen soepel blijft
  const c = $('#edCanvas');
  ed.base = Object.assign(document.createElement('canvas'), {width: c.width, height: c.height});
  const g = ed.base.getContext('2d');
  g.drawImage(ed.img, 0, 0);
  ed.shapes.forEach(sh => drawShape(g, sh));
}

function drawEditor() {
  const g = $('#edCanvas').getContext('2d');
  g.drawImage(ed.base, 0, 0);
  if (ed.cur) drawShape(g, ed.cur);
}

function drawShape(g, sh) {
  g.save();
  g.strokeStyle = g.fillStyle = sh.color;
  g.lineWidth = sh.w; g.lineCap = g.lineJoin = 'round';
  const {a, b} = sh;
  if (sh.tool === 'pen') {
    g.beginPath(); sh.pts.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.stroke();
  } else if (sh.tool === 'line' || sh.tool === 'arrow') {
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    if (sh.tool === 'arrow') {
      const ang = Math.atan2(b.y - a.y, b.x - a.x), len = sh.w * 4 + 10;
      g.beginPath(); g.moveTo(b.x, b.y);
      g.lineTo(b.x - len * Math.cos(ang - 0.45), b.y - len * Math.sin(ang - 0.45));
      g.lineTo(b.x - len * Math.cos(ang + 0.45), b.y - len * Math.sin(ang + 0.45));
      g.closePath(); g.fill();
    }
  } else if (sh.tool === 'rect') {
    g.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  } else if (sh.tool === 'ellipse') {
    g.beginPath();
    g.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, Math.PI * 2);
    g.stroke();
  } else if (sh.tool === 'text') {
    g.font = `bold ${sh.fs}px sans-serif`; g.textBaseline = 'middle';
    g.lineWidth = sh.fs / 7;   // contrastrand voor leesbaarheid op elke achtergrond
    g.strokeStyle = ['#ffffff', '#fdd835'].includes(sh.color) ? '#000' : '#fff';
    g.strokeText(sh.text, sh.x, sh.y); g.fillText(sh.text, sh.x, sh.y);
  }
  g.restore();
}

function edPoint(ev) {
  const c = $('#edCanvas'), r = c.getBoundingClientRect();
  return {x: (ev.clientX - r.left) * c.width / r.width, y: (ev.clientY - r.top) * c.height / r.height};
}

const edCanvas = $('#edCanvas');
edCanvas.addEventListener('pointerdown', ev => {
  ev.preventDefault();
  const p = edPoint(ev), w = ed.unit * ed.size;
  if (ed.tool === 'text') {
    const text = $('#edText').value.trim();
    if (!text) { toast('Typ eerst de tekst bovenaan'); $('#edText').focus(); return; }
    ed.shapes.push({tool: 'text', color: ed.color, text, x: p.x, y: p.y, fs: ed.unit * 9 * ed.size});
    rebuildBase(); drawEditor();
    return;
  }
  try { edCanvas.setPointerCapture(ev.pointerId); } catch (_) {}
  ed.cur = ed.tool === 'pen' ? {tool: 'pen', color: ed.color, w, pts: [p]} : {tool: ed.tool, color: ed.color, w, a: p, b: p};
  drawEditor();
});
edCanvas.addEventListener('pointermove', ev => {
  if (!ed.cur) return;
  const p = edPoint(ev);
  if (ed.cur.tool === 'pen') ed.cur.pts.push(p); else ed.cur.b = p;
  drawEditor();
});
const edEnd = () => {
  if (!ed.cur) return;
  const sh = ed.cur; ed.cur = null;
  const moved = sh.tool === 'pen' ? sh.pts.length > 1 : Math.hypot(sh.b.x - sh.a.x, sh.b.y - sh.a.y) > ed.unit;
  if (moved) { ed.shapes.push(sh); rebuildBase(); }
  drawEditor();
};
edCanvas.addEventListener('pointerup', edEnd);
edCanvas.addEventListener('pointercancel', edEnd);

$('#edTools').addEventListener('click', ev => {
  const b = ev.target.closest('[data-tool]'); if (!b) return;
  ed.tool = b.dataset.tool;
  $$('#edTools .edb').forEach(x => x.classList.toggle('on', x === b));
  $('#edText').hidden = ed.tool !== 'text';
  if (ed.tool === 'text') $('#edText').focus();
});
$('#edColors').addEventListener('click', ev => {
  const b = ev.target.closest('[data-color]'); if (!b) return;
  ed.color = b.dataset.color;
  $$('#edColors .edc').forEach(x => x.classList.toggle('on', x === b));
});
$('#edSizes').addEventListener('click', ev => {
  const b = ev.target.closest('[data-size]'); if (!b) return;
  ed.size = +b.dataset.size;
  $$('#edSizes .edb').forEach(x => x.classList.toggle('on', x === b));
});
$('#edUndo').addEventListener('click', () => { ed.shapes.pop(); rebuildBase(); drawEditor(); });
$('#edClear').addEventListener('click', () => {
  if (ed.shapes.length && !confirm('Alles wat je getekend hebt wissen?')) return;
  ed.shapes = []; rebuildBase(); drawEditor();
});
const edClose = () => $('#editor').close();
$('#edCancel').addEventListener('click', () => {
  if (ed.shapes.length && !confirm('Wijzigingen aan deze foto weggooien?')) return;
  edClose();
});
$('#editor').addEventListener('cancel', ev => { if (ed.shapes.length && !confirm('Wijzigingen aan deze foto weggooien?')) ev.preventDefault(); });

$('#edSave').addEventListener('click', async () => {
  if (!ed.shapes.length) { edClose(); return; }
  const btn = $('#edSave'); btn.disabled = true; btn.textContent = 'Opslaan…';
  try {
    drawEditor();
    const blob = await new Promise(r => $('#edCanvas').toBlob(r, 'image/jpeg', 0.9));
    const file = new File([blob], 'bewerkt.jpg', {type: 'image/jpeg'});
    const {photo, pending: pend} = ed.target;
    if (pend) {   // nog niet geüpload: alleen het bestand vervangen
      URL.revokeObjectURL(pend.url);
      pend.file = file; pend.url = URL.createObjectURL(file);
    } else {
      const fd = new FormData(); fd.append('foto', file, 'bewerkt.jpg');
      Object.assign(photo, await api(`api/photos/${photo.id}/bewerkt`, {method: 'POST', body: fd}));
    }
    edClose(); ed.klaar?.(); toast('Foto bewerkt');
  } catch (e) { toast(e.message); }
  finally { btn.disabled = false; btn.textContent = 'Opslaan'; }
});

$('#edRestore').addEventListener('click', async () => {
  const photo = ed.target.photo;
  if (!photo || !confirm('Alle tekeningen en tekst van deze foto verwijderen en het origineel terugzetten?')) return;
  try {
    Object.assign(photo, await api(`api/photos/${photo.id}/herstel`, {method: 'POST'}));
    edClose(); ed.klaar?.(); toast('Origineel hersteld');
  } catch (e) { toast(e.message); }
});

// ---------------------------------------------------------------- lightbox
// openLightbox([{src, cap}], startIndex)
let lbList = [], lbIdx = 0;
const lbItems = fotos => fotos.map(f => ({src: 'photos/' + f.bestand, cap: f.omschrijving}));
function openLightbox(list, i) { lbList = list; lbIdx = i; showLb(); $('#lightbox').showModal(); }
function showLb() {
  const it = lbList[lbIdx], fc = $('#lightbox figcaption');
  $('#lightbox img').src = it.src;
  fc.textContent = it.cap || ''; fc.hidden = !it.cap;
  $$('#lightbox .nav').forEach(b => b.hidden = lbList.length < 2);
}
$('#lightbox .prev').onclick = () => { lbIdx = (lbIdx - 1 + lbList.length) % lbList.length; showLb(); };
$('#lightbox .next').onclick = () => { lbIdx = (lbIdx + 1) % lbList.length; showLb(); };
$('#lightbox .close').onclick = $('#lightbox img').onclick = () => $('#lightbox').close();
$('#lightbox').addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft') $('#lightbox .prev').click();
  if (e.key === 'ArrowRight') $('#lightbox .next').click();
});
