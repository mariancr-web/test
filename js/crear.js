/* Generador de tests · interfaz de «Crear examen». */
(() => {
'use strict';
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LET = TC.LET;
const SKEY = 'generador-test-v1', CKEY = 'corrector-test-v1';

/* ---------- estado ---------- */
const nuevo = () => ({ cfg: Object.assign({}, TC.DEF, { modelos: ['A', 'B'], fallos: 'no' }), preguntas: [] });
let S = nuevo();
try { const o = JSON.parse(localStorage.getItem(SKEY) || 'null'); if (o && o.cfg && Array.isArray(o.preguntas)) S = o; } catch (e) { /* sin almacenamiento */ }
let saveT = 0;
const persist = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(SKEY, JSON.stringify(S)); } catch (e) { /* ignorar */ } }, 250); };

/* ---------- avisos ---------- */
let toastT = 0;
function toast(msg, err) { const t = $('#toast'); t.textContent = msg; t.className = 'toast' + (err ? ' err' : ''); t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, err ? 7000 : 3500); }
function ask(text, ok) {
  return new Promise(res => {
    $('#dlg-text').textContent = text; $('#dlg-ok').textContent = ok || 'Aceptar'; $('#dlg').hidden = false;
    const done = v => { $('#dlg').hidden = true; $('#dlg-ok').onclick = $('#dlg-no').onclick = null; res(v); };
    $('#dlg-ok').onclick = () => done(true); $('#dlg-no').onclick = () => done(false); $('#dlg-ok').focus();
  });
}
const guard = fn => async (...a) => { try { await fn(...a); } catch (e) { console.error(e); toast('Algo ha fallado: ' + (e && e.message ? e.message : e), true); } };
const safeName = s => String(s || 'examen').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
function bajar(nombre, data, tipo) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: tipo || 'application/octet-stream' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = safeName(nombre).replace(/ (\.\w+)$/, '$1');
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const ext = f => (f.name.split('.').pop() || '').toLowerCase();

/* ---------- lectura de archivos ---------- */
async function readText(file) {
  const buf = await file.arrayBuffer();
  let t = new TextDecoder('utf-8').decode(buf);
  if (t.includes('�')) t = new TextDecoder('windows-1252').decode(buf);
  return t;
}
let pdfReady = false;
async function pdfLines(file) {
  if (!pdfReady) { pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; pdfReady = true; }
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise, lines = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const tc = await (await pdf.getPage(p)).getTextContent(), rows = new Map();
    tc.items.forEach(it => { if (!it.str) return; const y = Math.round(it.transform[5] / 3); if (!rows.has(y)) rows.set(y, []); rows.get(y).push(it); });
    Array.from(rows.keys()).sort((a, b) => b - a).forEach(y => lines.push(rows.get(y).sort((a, b) => a.transform[4] - b.transform[4]).map(i => i.str).join(' ').replace(/\s+/g, ' ').trim()));
  }
  return lines.filter(Boolean);
}
async function docxXml(file) {
  const z = await JSZip.loadAsync(await file.arrayBuffer());
  const f = z.file('word/document.xml'); if (!f) throw new Error('No parece un archivo de Word (.docx).');
  return f.async('string');
}
async function textoDe(file) {
  const e = ext(file);
  if (e === 'pdf') return (await pdfLines(file)).join('\n');
  if (e === 'docx') return TC.lineasDocx(await docxXml(file)).map(l => l.texto).join('\n');
  if (e === 'doc') throw new Error('Guarda el archivo como .docx (Word > Guardar como).');
  return readText(file);
}

/* ---------- formulario de configuración ---------- */
function pintarCfg() {
  const c = S.cfg;
  $('#c-area').value = c.area || ''; $('#c-contenido').value = c.contenido || ''; $('#c-curso').value = c.curso || '';
  if (window.cursoMarca) cursoMarca(c.curso);
  $('#c-modelos').value = (c.modelos || []).join(', '); $('#c-nota').value = c.nota; $('#c-semilla').value = c.semilla;
  $('#c-num').value = c.numPreguntas || ''; $('#c-obs').value = c.observaciones || '';
  $('#c-bp').checked = !!c.barajarPreguntas; $('#c-bo').checked = !!c.barajarOpciones; $('#c-hoja').checked = !!c.hojaRespuestas;
  $('#c-fallos').value = c.fallos === 'auto' ? 'auto' : typeof c.fallos === 'number' ? 'custom' : 'no';
  if (typeof c.fallos === 'number') $('#c-pen').value = c.fallos;
  $('#c-penwrap').hidden = typeof c.fallos !== 'number';
  obsAuto();
}
function leerCfg() {
  const c = S.cfg;
  c.area = $('#c-area').value.trim(); c.contenido = $('#c-contenido').value.trim(); c.curso = $('#c-curso').value.trim();
  const m = $('#c-modelos').value.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean); c.modelos = m.length ? m.slice(0, 8) : ['A'];
  const n = parseFloat($('#c-nota').value); c.nota = n > 0 ? n : 10;
  const s = parseInt($('#c-semilla').value, 10); c.semilla = s > 0 ? s : 1;
  const k = parseInt($('#c-num').value, 10); c.numPreguntas = k > 0 ? k : 0;
  c.observaciones = $('#c-obs').value.trim();
  c.barajarPreguntas = $('#c-bp').checked; c.barajarOpciones = $('#c-bo').checked; c.hojaRespuestas = $('#c-hoja').checked;
  const f = $('#c-fallos').value; $('#c-penwrap').hidden = f !== 'custom';
  c.fallos = f === 'auto' ? 'auto' : f === 'custom' ? (parseFloat($('#c-pen').value) || 0.25) : 'no';
  obsAuto(); persist(); pintarDescargas();
}
function obsAuto() {
  const n = S.cfg.numPreguntas && S.cfg.numPreguntas < S.preguntas.length ? S.cfg.numPreguntas : S.preguntas.length;
  $('#c-obs-auto').textContent = n && !S.cfg.observaciones ? 'Saldrá: «' + TC.textoObservaciones(S.cfg, n, TC.nOpciones(S.preguntas)) + '»' : '';
}
$$('#c-area,#c-contenido,#c-curso,#c-modelos,#c-nota,#c-semilla,#c-num,#c-obs,#c-pen').forEach(el => el.addEventListener('input', guard(leerCfg)));
$$('#c-bp,#c-bo,#c-hoja,#c-fallos').forEach(el => el.addEventListener('change', guard(leerCfg)));

/* ---------- lista de preguntas ---------- */
function html(t) { // vista previa: `fórmulas`, ^sup, _sub
  return TC.trozos(t).map(x => x.sub ? `<sub>${esc(x.t)}</sub>` : x.sup ? `<sup>${esc(x.t)}</sup>` : esc(x.t)).join('');
}
function pintarPreguntas() {
  const P = S.preguntas;
  $('#q-count').textContent = P.length + (P.length === 1 ? ' pregunta' : ' preguntas');
  const av = TC.validar(P);
  $('#avisos').innerHTML = av.length ? `<div class="warnbox"><b>Revisa:</b><ul class="warnlist">${av.slice(0, 30).map(a => `<li>${esc(a)}</li>`).join('')}</ul></div>` : '';
  if (!P.length) { $('#qlist').innerHTML = '<p class="empty">Todavía no hay preguntas.</p>'; obsAuto(); pintarDescargas(); return; }
  $('#qlist').innerHTML = P.map((q, i) => {
    const chips = [q.nivel, q.apartado, q.origen].filter(Boolean).map(c => `<span class="chip">${esc(c)}</span>`).join('');
    const ops = q.opciones.map((o, j) => {
      const L = LET[j], ok = q.correcta.includes(L);
      return `<li class="${ok ? 'ok' : ''}"><button class="qb" data-q="${i}" data-l="${L}" aria-pressed="${ok}" aria-label="Pregunta ${i + 1}: marcar ${L} como correcta">${L}</button><span>${html(o)}</span></li>`;
    }).join('');
    return `<div class="qcard"><div class="qh"><span class="qn">${i + 1}</span><div class="qt">${html(q.pregunta)}</div><button class="btn sm ghost danger" data-del="${i}" aria-label="Quitar pregunta ${i + 1}">Quitar</button></div>${chips ? `<div class="chips">${chips}</div>` : ''}<ol>${ops}</ol>${q.explicacion ? `<p class="exp">${html(q.explicacion)}</p>` : ''}</div>`;
  }).join('');
  obsAuto(); pintarDescargas();
}
$('#qlist').addEventListener('click', guard(async e => {
  const b = e.target.closest('[data-l]');
  if (b) { const q = S.preguntas[+b.dataset.q]; q.correcta = b.dataset.l; persist(); pintarPreguntas(); return; }
  const d = e.target.closest('[data-del]');
  if (d && await ask(`¿Quitar la pregunta ${+d.dataset.del + 1}?`, 'Quitar')) { S.preguntas.splice(+d.dataset.del, 1); persist(); pintarPreguntas(); }
}));

async function cargar(preguntas, cfg, origen) {
  if (!preguntas.length) { toast('No he encontrado preguntas con al menos dos opciones en ' + origen + '.', true); return; }
  if (S.preguntas.length && !await ask(`Ya hay ${S.preguntas.length} preguntas. ¿Sustituirlas por las ${preguntas.length} de ${origen}?`, 'Sustituir')) return;
  S.preguntas = preguntas;
  if (cfg) S.cfg = cfg;
  persist(); pintarCfg(); pintarPreguntas();
  const sin = preguntas.filter(q => !q.correcta).length;
  toast(`${preguntas.length} preguntas cargadas${sin ? `; ${sin} sin respuesta correcta` : ''}. Revísalas.`, sin > 0);
  document.querySelector('#qlist').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ---------- pestañas ---------- */
$$('.tab').forEach(t => t.addEventListener('click', () => {
  $$('.tab').forEach(x => x.setAttribute('aria-pressed', String(x === t)));
  $$('.tabp').forEach(p => { p.hidden = p.id !== t.dataset.tab; });
}));

/* ---------- 1a. Excel ---------- */
$('#f-excel').addEventListener('change', guard(async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
  const hoja = n => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, defval: '' });
  const nombres = wb.SheetNames;
  const nP = nombres.find(n => /pregunt|clave/i.test(n)) || nombres.find(n => TC.leerPreguntas(hoja(n)).length) || nombres[0];
  const nE = nombres.find(n => /^examen|config|datos/i.test(n));
  const cfg = nE ? TC.leerConfig(hoja(nE)) : Object.assign({}, S.cfg);
  await cargar(TC.leerPreguntas(hoja(nP)), cfg, 'el Excel');
}));

/* ---------- 1b. Importar examen hecho ---------- */
$('#f-imp').addEventListener('change', guard(async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  $('#imp-msg').innerHTML = '<span class="busy"></span> Leyendo…';
  try {
    let ps;
    if (ext(f) === 'docx') ps = TC.importarDocx(await docxXml(f));
    else if (ext(f) === 'pdf') ps = TC.importarTexto((await pdfLines(f)).join('\n'));
    else if (ext(f) === 'xlsx' || ext(f) === 'xls') { toast('Para Excel usa la pestaña «Subir Excel».', true); return; }
    else ps = TC.importarTexto(await textoDe(f));
    const cfg = Object.assign({}, S.cfg);
    if (!cfg.contenido) cfg.contenido = f.name.replace(/\.[^.]+$/, '');
    await cargar(ps, cfg, 'el examen');
  } finally { $('#imp-msg').textContent = ''; }
}));

/* ---------- 1c. Generar con IA ---------- */
let apuntes = [];
$('#f-apuntes').addEventListener('change', guard(async e => {
  const fs = Array.from(e.target.files); e.target.value = ''; if (!fs.length) return;
  $('#ap-msg').innerHTML = '<span class="busy"></span> Leyendo apuntes…';
  try {
    apuntes = [];
    for (const f of fs) apuntes.push({ nombre: f.name, texto: await textoDe(f) });
    const chars = apuntes.reduce((s, a) => s + a.texto.length, 0);
    $('#ap-msg').textContent = `${apuntes.length} archivo(s), ${Math.round(chars / 1000)} mil caracteres leídos.` + (chars < 500 ? ' Parece que casi no hay texto: si es un PDF escaneado, pega el contenido.' : '');
  } catch (err) { $('#ap-msg').textContent = ''; throw err; }
}));
try { $('#ia-clave').value = sessionStorage.getItem('gt-clave') || ''; } catch (e) { /* nada */ }
try { const k = localStorage.getItem('gt-api') || sessionStorage.getItem('gt-api') || ''; $('#ia-api').value = k; $('#ia-api-rec').checked = !!localStorage.getItem('gt-api'); } catch (e) { /* nada */ }
$('#ia-api-rec').addEventListener('change', () => { try { if (!$('#ia-api-rec').checked) localStorage.removeItem('gt-api'); } catch (e) { /* nada */ } });
$('#ia-go').addEventListener('click', guard(async () => {
  const texto = apuntes.map(a => `### ${a.nombre}\n${a.texto}`).join('\n\n') + ($('#ia-texto').value.trim() ? '\n\n' + $('#ia-texto').value.trim() : '');
  if (texto.trim().length < 200) { toast('Sube los apuntes o pega su contenido (hace falta algo de texto).', true); return; }
  if (texto.length > 600000) { toast('Los apuntes son muy largos. Sube solo el tema que entra en el examen.', true); return; }
  const clave = $('#ia-clave').value;
  const apiKey = $('#ia-api').value.trim();
  if (!clave && !apiKey) { toast('Escribe la contraseña de la web o tu propia clave de API.', true); return; }
  if (apiKey && !/^sk-ant-/.test(apiKey)) { toast('La clave de API de Anthropic empieza por «sk-ant-».', true); return; }
  try {
    if (clave) sessionStorage.setItem('gt-clave', clave);
    if (apiKey) { sessionStorage.setItem('gt-api', apiKey); if ($('#ia-api-rec').checked) localStorage.setItem('gt-api', apiKey); else localStorage.removeItem('gt-api'); }
  } catch (e) { /* nada */ }
  const body = {
    clave, apiKey, apuntes: texto, materia: $('#ia-materia').value.trim() || S.cfg.area, curso: $('#ia-curso').value.trim() || S.cfg.curso,
    tema: S.cfg.contenido, n: Math.min(60, Math.max(1, parseInt($('#ia-n').value, 10) || 20)), nopt: +$('#ia-nopt').value,
    nivel: $('#ia-nivel').value, indicaciones: $('#ia-ind').value.trim()
  };
  const btn = $('#ia-go'); btn.disabled = true;
  $('#ia-msg').innerHTML = '<span class="busy"></span> Redactando y comprobando las preguntas… puede tardar unos minutos.';
  try {
    const r = await fetch('api/generar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({ error: 'Respuesta no válida del servidor (' + r.status + ').' }));
    if (!r.ok || j.error) throw new Error(j.error || ('Error ' + r.status));
    const cfg = Object.assign({}, S.cfg);
    if (!cfg.area && body.materia) cfg.area = body.materia;
    await cargar(j.preguntas.map(q => Object.assign({ nivel: '', apartado: '', origen: 'nueva', explicacion: '', ordenFijo: false }, q)), cfg, 'la IA');
    $('#ia-msg').textContent = j.aviso || '';
  } catch (err) { $('#ia-msg').textContent = ''; throw err; } finally { btn.disabled = false; }
}));

/* ---------- 4. descargas ---------- */
let plantilla = null;
async function plantillaZip() {
  if (!plantilla) { const r = await fetch('plantillas/examen-colegio.docx'); if (!r.ok) throw new Error('No se encuentra la plantilla del colegio.'); plantilla = await r.arrayBuffer(); }
  return JSZip.loadAsync(plantilla);
}
async function wordModelo(m, corregido) {
  const z = await plantillaZip();
  const xml = await z.file('word/document.xml').async('string');
  const nf = z.file('word/numbering.xml');
  const num = TC.numeracion(nf ? await nf.async('string') : '');
  z.file('word/numbering.xml', num.xml);
  z.file('word/document.xml', TC.documento(xml, S.cfg, m, corregido, num.numId));
  return z.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}
function xlsxDe(hojas) {
  const wb = XLSX.utils.book_new();
  hojas.forEach(([nombre, filas, anchos]) => { const ws = XLSX.utils.aoa_to_sheet(filas); if (anchos) ws['!cols'] = anchos.map(w => ({ wch: w })); XLSX.utils.book_append_sheet(wb, ws, nombre); });
  return new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
const claveXlsx = m => xlsxDe([['Clave', TC.filasClave(m), [5, 18, 8, 9, 60, 24, 24, 24, 24, 24, 24]]]);
function excelPreguntas() {
  const { conf, pr, nopt } = TC.filasExcel(S.cfg, S.preguntas);
  return xlsxDe([['Examen', conf, [30, 40]], ['Preguntas', pr, [5, 60].concat(Array(nopt).fill(28)).concat([10, 11, 18, 11, 50, 10])]]);
}
const base = () => safeName(S.cfg.contenido || 'Test');
function listo() {
  if (!S.preguntas.length) { toast('Primero carga las preguntas.', true); return false; }
  const sin = S.preguntas.filter(q => !q.correcta).length;
  if (sin) toast(`Ojo: ${sin} pregunta(s) sin respuesta correcta.`, true);
  return true;
}
function modelos() { return TC.componer(S.cfg, S.preguntas); }
function pintarDescargas() {
  const box = $('#d-modelos');
  if (!S.preguntas.length) { box.innerHTML = ''; return; }
  box.innerHTML = S.cfg.modelos.map(n => `<div class="modelrow"><b>Modelo ${esc(n)}</b>
    <button class="btn sm" data-dl="word" data-m="${esc(n)}">Examen (Word)</button>
    <button class="btn sm" data-dl="corr" data-m="${esc(n)}">Corregido</button>
    <button class="btn sm" data-dl="clave" data-m="${esc(n)}">Clave (Excel)</button>
    <button class="btn sm ghost" data-dl="corrector" data-m="${esc(n)}">Al Corrector</button></div>`).join('');
}
$('#d-modelos').addEventListener('click', guard(async e => {
  const b = e.target.closest('[data-dl]'); if (!b || !listo()) return;
  const m = modelos().find(x => x.nombre === b.dataset.m); if (!m) return;
  const tipo = b.dataset.dl, n = `${base()} - Test Modelo ${m.nombre}`;
  if (tipo === 'word') bajar(n + '.docx', await wordModelo(m, false));
  else if (tipo === 'corr') bajar(n + ' - Corregido.docx', await wordModelo(m, true));
  else if (tipo === 'clave') bajar(n + ' - Clave.xlsx', claveXlsx(m));
  else if (tipo === 'corrector') {
    let C = { roster: '', sheets: [] };
    try { C = Object.assign(C, JSON.parse(localStorage.getItem(CKEY) || 'null') || {}); } catch (err) { /* nada */ }
    if (C.sheets && C.sheets.length && !await ask(`El Corrector tiene ${C.sheets.length} hojas escaneadas de otro examen. Si sigues, se borran (los alumnos se mantienen).`, 'Seguir')) return;
    const ex = TC.examenCorrector(S.cfg, m);
    const d = new Date(); ex.date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    ex.code = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
    C.exam = ex; C.sheets = [];
    try { localStorage.setItem(CKEY, JSON.stringify(C)); } catch (err) { toast('El navegador no deja guardar datos: descarga la clave y súbela en el Corrector.', true); return; }
    location.href = 'corrector.html';
  }
}));
$('#d-excel').addEventListener('click', guard(() => { if (listo()) bajar(base() + ' - Preguntas.xlsx', excelPreguntas()); }));
$('#d-zip').addEventListener('click', guard(async () => {
  if (!listo()) return;
  $('#d-msg').innerHTML = '<span class="busy"></span> Preparando…';
  try {
    const z = new JSZip();
    for (const m of modelos()) {
      const n = `${base()} - Test Modelo ${m.nombre}`;
      z.file(n + '.docx', await wordModelo(m, false));
      z.file(n + ' - Corregido.docx', await wordModelo(m, true));
      z.file(n + ' - Clave.xlsx', claveXlsx(m));
    }
    z.file(base() + ' - Preguntas.xlsx', excelPreguntas());
    bajar(base() + ' - Test.zip', await z.generateAsync({ type: 'blob' }));
  } finally { $('#d-msg').textContent = ''; }
}));

$('#btn-nuevo').addEventListener('click', guard(async () => {
  if (!await ask('¿Borrar las preguntas y los datos de este examen?', 'Borrar')) return;
  S = nuevo(); persist(); pintarCfg(); pintarPreguntas();
}));

pintarCfg(); pintarPreguntas();
})();
