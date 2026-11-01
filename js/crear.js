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
addEventListener('pagehide', () => { clearTimeout(saveT); try { localStorage.setItem(SKEY, JSON.stringify(S)); } catch (e) { /* ignorar */ } });

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

/* ---------- recorridos y pasos ---------- */
const RECORRIDOS = {
  plantilla: [['datos', 'Datos'], ['contenido-plantilla', 'Contenido'], ['lista', 'Preguntas'], ['revision', 'Revisión'], ['descarga', 'Descarga']],
  ia: [['datos', 'Datos'], ['contenido-ia', 'Contenido'], ['config-ia', 'Preguntas'], ['ia', 'Datos de IA'], ['revision', 'Revisión'], ['descarga', 'Descarga']],
};
if (!S.modo) S.modo = ''; if (!S.paso) S.paso = 0;
const pasos = () => RECORRIDOS[S.modo] || [];
function irA(i) {
  const P = pasos(); if (!P.length) return;
  S.paso = Math.max(0, Math.min(P.length - 1, i)); persist();
  const id = P[S.paso][0];
  // en «Generar», la revisión incluye la lista de preguntas; en «Plantilla», nota/modelos/fallos van en Revisión
  $$('.paso').forEach(p => { p.hidden = !(p.dataset.paso === id || (S.modo === 'ia' && id === 'revision' && p.dataset.paso === 'lista')); });
  const lp = $('[data-paso="lista"]'), rv = $('[data-paso="revision"]');
  if (S.modo === 'ia') rv.after(lp); else rv.before(lp);
  const mb = $('#montaje-base');
  if (S.modo === 'ia') $('#montaje-ia').appendChild(mb); else $('#montaje-rev').prepend(mb);
  $('#lista-titulo').textContent = S.modo === 'ia' ? 'Preguntas generadas' : 'Preguntas';
  $('#leido').hidden = S.modo !== 'plantilla';
  $('#steps').innerHTML = P.map(([, t], k) => `<button class="step" data-i="${k}" aria-current="${k === S.paso}"><span class="n">${k + 1}</span><span class="t">${t}</span></button>`).join('');
  $('#steps').style.setProperty('--n', P.length);
  $('#p-ant').hidden = S.paso === 0;
  $('#p-sig').hidden = S.paso === P.length - 1;
  $('#p-sig').textContent = id === 'ia' ? 'Saltar a Revisión →' : 'Siguiente →';
  if (id === 'revision') pintarResumen();
}
function elegirModo(m) {
  S.modo = m; S.paso = 0;
  $$('.modo').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.modo === m)));
  $('#steps').hidden = $('#navp').hidden = !m;
  irA(0);
}
$$('.modo').forEach(b => b.addEventListener('click', () => { elegirModo(b.dataset.modo); $('#steps').scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
$('#steps').addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) irA(+b.dataset.i); });
$('#p-ant').addEventListener('click', () => { irA(S.paso - 1); $('#steps').scrollIntoView({ block: 'start' }); });
$('#p-sig').addEventListener('click', () => {
  const id = pasos()[S.paso][0];
  if (id === 'contenido-plantilla' && !S.preguntas.length) toast('Todavía no hay preguntas cargadas.', true);
  if (id === 'ia' && !S.preguntas.length) { toast('Primero pulsa «Generar preguntas».', true); return; }
  irA(S.paso + 1); $('#steps').scrollIntoView({ block: 'start' });
});

/* ---------- formulario de configuración ---------- */
const letrasModelos = n => LET.slice(0, Math.max(1, Math.min(8, n))).split('');
function pintarCfg() {
  const c = S.cfg;
  $('#c-area').value = c.area || ''; $('#c-contenido').value = c.contenido || ''; $('#c-curso').value = c.curso || '';
  if (window.cursoMarca) cursoMarca(c.curso);
  $('#c-nmod').value = (c.modelos || ['A']).length; $('#c-nota').value = c.nota; $('#c-semilla').value = c.semilla;
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
  c.modelos = letrasModelos(parseInt($('#c-nmod').value, 10) || 1);
  const n = parseFloat($('#c-nota').value); c.nota = n > 0 ? n : 10;
  const s = parseInt($('#c-semilla').value, 10); c.semilla = s > 0 ? s : 1;
  const k = parseInt($('#c-num').value, 10); c.numPreguntas = k > 0 ? k : 0;
  c.observaciones = $('#c-obs').value.trim();
  c.barajarPreguntas = $('#c-bp').checked; c.barajarOpciones = $('#c-bo').checked; c.hojaRespuestas = $('#c-hoja').checked;
  const f = $('#c-fallos').value; $('#c-penwrap').hidden = f !== 'custom';
  c.fallos = f === 'auto' ? 'auto' : f === 'custom' ? (parseFloat($('#c-pen').value) || 0.25) : 'no';
  obsAuto(); persist(); pintarDescargas(); pintarResumen();
}
function obsAuto() {
  const n = S.cfg.numPreguntas && S.cfg.numPreguntas < S.preguntas.length ? S.cfg.numPreguntas : S.preguntas.length;
  $('#c-obs-auto').textContent = n && !S.cfg.observaciones ? 'Saldrá: «' + TC.textoObservaciones(S.cfg, n, TC.nOpciones(S.preguntas)) + '»' : '';
}
$$('#c-area,#c-contenido,#c-curso,#c-nmod,#c-nota,#c-semilla,#c-num,#c-obs,#c-pen').forEach(el => el.addEventListener('input', guard(leerCfg)));
$$('#c-bp,#c-bo,#c-hoja,#c-fallos').forEach(el => el.addEventListener('change', guard(leerCfg)));

/* ---------- lo que se ha leído y resumen ---------- */
const lista = ns => ns.length > 12 ? ns.slice(0, 12).join(', ') + '…' : ns.join(', ');
function pintarLeido() {
  const P = S.preguntas, box = $('#leido');
  if (!P.length) { box.innerHTML = '<p class="hint">Todavía no se ha cargado nada. Vuelve a «Contenido».</p>'; return; }
  const porN = {}; P.forEach(q => { porN[q.opciones.length] = (porN[q.opciones.length] || 0) + 1; });
  const sin = [], varias = [], fuera = [];
  P.forEach((q, i) => {
    if (!q.correcta) sin.push(i + 1);
    else if (q.correcta.length > 1) varias.push(i + 1);
    if ([...(q.correcta || '')].some(L => LET.indexOf(L) >= q.opciones.length)) fuera.push(i + 1);
  });
  const reparto = {}; P.forEach(q => [...(q.correcta || '')].forEach(L => { reparto[L] = (reparto[L] || 0) + 1; }));
  const li = (ok, t) => `<li style="color:var(${ok ? '--ink' : '--warn'})">${ok ? '✓' : '⚠'} ${t}</li>`;
  box.innerHTML = `<h3>Lo que se ha leído${S.origen ? (S.origen.startsWith('el ') ? ' del ' + esc(S.origen.slice(3)) : ' de ' + esc(S.origen)) : ''}</h3><ul class="pasos-ia" style="list-style:none;padding-left:0">
    ${li(true, `<b>${P.length}</b> preguntas`)}
    ${li(Object.keys(porN).length === 1, 'Opciones por pregunta: ' + Object.entries(porN).map(([n, k]) => `${n} opciones (${k})`).join(' · '))}
    ${li(!sin.length, sin.length ? `<b>${sin.length}</b> sin respuesta correcta: nº ${lista(sin)}` : 'Todas tienen respuesta correcta')}
    ${varias.length ? li(true, `${varias.length} con varias opciones verdaderas: nº ${lista(varias)}`) : ''}
    ${fuera.length ? li(false, `Respuesta que no existe en: nº ${lista(fuera)}`) : ''}
    ${li(true, 'Respuestas correctas por letra: ' + Object.keys(reparto).sort().map(L => `${L}: ${reparto[L]}`).join(' · '))}
  </ul>`;
}
function pintarResumen() {
  const P = S.preguntas, c = S.cfg;
  const n = c.numPreguntas && c.numPreguntas < P.length ? c.numPreguntas : P.length;
  const sin = P.filter(q => !q.correcta).length;
  const fallos = c.fallos === 'auto' ? '1/(opc.−1)' : typeof c.fallos === 'number' ? String(c.fallos).replace('.', ',') : 'No restan';
  const it = (v, t) => `<div><b>${esc(v)}</b><span>${t}</span></div>`;
  $('#resumen').innerHTML = it(n, 'preguntas por modelo') + it(c.modelos.join(', '), 'modelos') + it(String(c.nota).replace('.', ','), 'nota máxima')
    + it(fallos, 'fallos') + it(sin, sin === 1 ? 'pregunta sin respuesta' : 'preguntas sin respuesta');
}

/* ---------- lista de preguntas ---------- */
function html(t) { // vista previa: `fórmulas`, ^sup, _sub
  return TC.trozos(t).map(x => x.sub ? `<sub>${esc(x.t)}</sub>` : x.sup ? `<sup>${esc(x.t)}</sup>` : esc(x.t)).join('');
}
let editando = -1;
function tarjeta(q, i) {
  if (i === editando) {
    return `<div class="qcard qedit" data-edit="${i}"><div class="qh"><span class="qn">${i + 1}</span><b>Editar pregunta</b></div>
      <label class="f">Enunciado<textarea rows="2" data-k="pregunta">${esc(q.pregunta)}</textarea></label>
      ${q.opciones.map((o, j) => `<div class="op"><b>${LET[j]}</b><input type="text" data-o="${j}" value="${esc(o)}"></div>`).join('')}
      <div class="row"><button class="btn sm ghost" data-opadd="${i}">+ opción</button>${q.opciones.length > 2 ? `<button class="btn sm ghost" data-opdel="${i}">− última opción</button>` : ''}</div>
      <label class="f">Explicación (sale en el corregido)<input type="text" data-k="explicacion" value="${esc(q.explicacion || '')}"></label>
      <p class="hint">Fórmulas entre acentos graves: \`H2SO4\`. Superíndices con ^: 10^-3.</p>
      <div class="row"><button class="btn sm primary" data-guardar="${i}">Guardar</button><button class="btn sm ghost" data-cancelar>Cancelar</button></div></div>`;
  }
  const chips = [q.nivel, q.apartado, q.origen].filter(Boolean).map(c => `<span class="chip">${esc(c)}</span>`).join('');
  const ops = q.opciones.map((o, j) => {
    const L = LET[j], ok = (q.correcta || '').includes(L);
    return `<li class="${ok ? 'ok' : ''}"><button class="qb" data-q="${i}" data-l="${L}" aria-pressed="${ok}" aria-label="Pregunta ${i + 1}: marcar ${L} como correcta">${L}</button><span>${html(o)}</span></li>`;
  }).join('');
  const aviso = !q.correcta ? '<span class="chip warn">sin respuesta</span>' : q.correcta.length > 1 ? `<span class="chip">${q.correcta.length} verdaderas</span>` : '';
  return `<div class="qcard"><div class="qh"><span class="qn">${i + 1}</span><div class="qt">${html(q.pregunta)}</div><button class="btn sm ghost" data-ed="${i}">Editar</button><button class="btn sm ghost danger" data-del="${i}" aria-label="Quitar pregunta ${i + 1}">Quitar</button></div>${chips || aviso ? `<div class="chips">${aviso}${chips}</div>` : ''}<ol>${ops}</ol>${q.explicacion ? `<p class="exp">${html(q.explicacion)}</p>` : ''}</div>`;
}
function pintarPreguntas() {
  const P = S.preguntas;
  $('#q-count').textContent = P.length + (P.length === 1 ? ' pregunta' : ' preguntas');
  const av = TC.validar(P);
  $('#avisos').innerHTML = av.length ? `<div class="warnbox"><b>Revisa:</b><ul class="warnlist">${av.slice(0, 30).map(a => `<li>${esc(a)}</li>`).join('')}</ul></div>` : '';
  $('#qlist').innerHTML = P.length ? P.map(tarjeta).join('') : '<p class="empty">Todavía no hay preguntas.</p>';
  pintarLeido(); obsAuto(); pintarDescargas(); pintarResumen();
}
function leerEdicion(i) {
  const box = $(`[data-edit="${i}"]`), q = S.preguntas[i];
  q.pregunta = box.querySelector('[data-k="pregunta"]').value.trim();
  q.explicacion = box.querySelector('[data-k="explicacion"]').value.trim();
  q.opciones = Array.from(box.querySelectorAll('[data-o]')).map(x => x.value.trim());
}
$('#qlist').addEventListener('click', guard(async e => {
  const t = e.target;
  const b = t.closest('[data-l]');
  if (b) { // marcar / desmarcar (varias verdaderas permitidas)
    const q = S.preguntas[+b.dataset.q], L = b.dataset.l; let c = q.correcta || '';
    c = c.includes(L) ? c.replace(L, '') : (c + L).split('').sort().join('');
    q.correcta = c; persist(); pintarPreguntas(); return;
  }
  if (t.closest('[data-ed]')) { editando = +t.closest('[data-ed]').dataset.ed; pintarPreguntas(); const ta = $(`[data-edit="${editando}"] textarea`); if (ta) ta.focus(); return; }
  if (t.closest('[data-cancelar]')) { if (S.preguntas[editando] && !S.preguntas[editando].pregunta && S.preguntas[editando].opciones.every(o => !o)) S.preguntas.splice(editando, 1); editando = -1; persist(); pintarPreguntas(); return; }
  if (t.closest('[data-opadd]')) { const i = +t.closest('[data-opadd]').dataset.opadd; leerEdicion(i); if (S.preguntas[i].opciones.length < LET.length) S.preguntas[i].opciones.push(''); pintarPreguntas(); return; }
  if (t.closest('[data-opdel]')) { const i = +t.closest('[data-opdel]').dataset.opdel; leerEdicion(i); const q = S.preguntas[i]; q.opciones.pop(); q.correcta = [...(q.correcta || '')].filter(L => LET.indexOf(L) < q.opciones.length).join(''); pintarPreguntas(); return; }
  if (t.closest('[data-guardar]')) {
    const i = +t.closest('[data-guardar]').dataset.guardar; leerEdicion(i);
    const q = S.preguntas[i]; q.opciones = q.opciones.filter(Boolean);
    q.correcta = [...(q.correcta || '')].filter(L => LET.indexOf(L) < q.opciones.length).join('');
    if (!q.pregunta || q.opciones.length < 2) { toast('Hace falta el enunciado y al menos dos opciones.', true); pintarPreguntas(); return; }
    editando = -1; persist(); pintarPreguntas(); return;
  }
  const d = t.closest('[data-del]');
  if (d && await ask(`¿Quitar la pregunta ${+d.dataset.del + 1}?`, 'Quitar')) { S.preguntas.splice(+d.dataset.del, 1); editando = -1; persist(); pintarPreguntas(); }
}));
$('#q-add').addEventListener('click', () => {
  const n = TC.nOpciones(S.preguntas) || 4;
  S.preguntas.push({ pregunta: '', opciones: Array(n).fill(''), correcta: '', nivel: '', apartado: '', origen: '', explicacion: '', ordenFijo: false });
  editando = S.preguntas.length - 1; pintarPreguntas();
  const ta = $(`[data-edit="${editando}"] textarea`); if (ta) { ta.scrollIntoView({ block: 'center' }); ta.focus(); }
});

async function cargar(preguntas, cfg, origen, siguiente) {
  if (!preguntas.length) { toast('No he encontrado preguntas con al menos dos opciones en ' + origen + '.', true); return; }
  if (S.preguntas.length && !await ask(`Ya hay ${S.preguntas.length} preguntas. ¿Sustituirlas por las ${preguntas.length} de ${origen}?`, 'Sustituir')) return;
  S.preguntas = preguntas; S.origen = origen; editando = -1;
  if (cfg) { // conserva lo que ya se ha escrito en «Datos»
    ['area', 'contenido', 'curso'].forEach(k => { if (S.cfg[k] && !cfg[k]) cfg[k] = S.cfg[k]; else if (S.cfg[k]) cfg[k] = S.cfg[k]; });
    S.cfg = cfg;
  }
  persist(); pintarCfg(); pintarPreguntas();
  const sin = preguntas.filter(q => !q.correcta).length;
  toast(`${preguntas.length} preguntas cargadas${sin ? `; ${sin} sin respuesta correcta` : ''}.`, sin > 0);
  if (siguiente) { irA(S.paso + 1); $('#steps').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
}

/* ---------- pestañas ---------- */
$$('.tab').forEach(t => t.addEventListener('click', () => {
  $$('.tab').forEach(x => x.setAttribute('aria-pressed', String(x === t)));
  $$('.tabp').forEach(p => { p.hidden = p.id !== t.dataset.tab; });
}));

/* ---------- contenido: a mano ---------- */
$('#mano-go').addEventListener('click', guard(async () => {
  const t = $('#mano-texto').value;
  if (!t.trim()) { toast('Escribe o pega primero las preguntas.', true); return; }
  await cargar(TC.importarTexto(t), Object.assign({}, S.cfg), 'el texto escrito', true);
}));

/* ---------- contenido: Excel ---------- */
$('#f-excel').addEventListener('change', guard(async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
  const hoja = n => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, defval: '' });
  const nombres = wb.SheetNames;
  const nP = nombres.find(n => /pregunt|clave/i.test(n)) || nombres.find(n => TC.leerPreguntas(hoja(n)).length) || nombres[0];
  const nE = nombres.find(n => /^examen|config|datos/i.test(n));
  const cfg = nE ? TC.leerConfig(hoja(nE)) : Object.assign({}, S.cfg);
  await cargar(TC.leerPreguntas(hoja(nP)), cfg, '«' + f.name + '»', true);
}));

/* ---------- contenido: Word o PDF ---------- */
$('#f-imp').addEventListener('change', guard(async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  $('#imp-msg').innerHTML = '<span class="busy"></span> Leyendo…';
  try {
    let ps;
    if (ext(f) === 'docx') ps = TC.importarDocx(await docxXml(f));
    else if (ext(f) === 'pdf') ps = TC.importarTexto((await pdfLines(f)).join('\n'));
    else if (ext(f) === 'xlsx' || ext(f) === 'xls') { toast('Para Excel usa la pestaña «Desde un Excel».', true); return; }
    else ps = TC.importarTexto(await textoDe(f));
    const cfg = Object.assign({}, S.cfg);
    if (!cfg.contenido && !$('#c-contenido').value.trim()) cfg.contenido = f.name.replace(/\.[^.]+$/, '');
    await cargar(ps, cfg, '«' + f.name + '»', true);
  } finally { $('#imp-msg').textContent = ''; }
}));

/* ---------- contenido: apuntes para la IA ---------- */
let apuntes = [];
$('#f-apuntes').addEventListener('change', guard(async e => {
  const fs = Array.from(e.target.files); e.target.value = ''; if (!fs.length) return;
  $('#ap-msg').innerHTML = '<span class="busy"></span> Leyendo apuntes…';
  try {
    apuntes = [];
    for (const f of fs) apuntes.push({ nombre: f.name, texto: await textoDe(f) });
    const chars = apuntes.reduce((s, a) => s + a.texto.length, 0);
    $('#ap-msg').textContent = `${apuntes.map(a => a.nombre).join(', ')}: ${Math.round(chars / 1000)} mil caracteres leídos.` + (chars < 500 ? ' Parece que casi no hay texto: si es un PDF escaneado, pega el contenido.' : '');
  } catch (err) { $('#ap-msg').textContent = ''; throw err; }
}));
function ajustarVerdaderas() {
  const nopt = +$('#ia-nopt').value, sel = $('#ia-nver'), v = Math.min(+sel.value || 1, nopt - 1);
  sel.innerHTML = Array.from({ length: nopt - 1 }, (_, k) => `<option${k + 1 === v ? ' selected' : ''}>${k + 1}</option>`).join('');
}
$('#ia-nopt').addEventListener('change', ajustarVerdaderas); ajustarVerdaderas();

/* ---------- datos de IA y generación ---------- */
try { $('#ia-clave').value = sessionStorage.getItem('gt-clave') || ''; } catch (e) { /* nada */ }
try { const k = localStorage.getItem('gt-api') || sessionStorage.getItem('gt-api') || ''; $('#ia-api').value = k; $('#ia-api-rec').checked = !!localStorage.getItem('gt-api'); } catch (e) { /* nada */ }
$('#ia-api-rec').addEventListener('change', () => { try { if (!$('#ia-api-rec').checked) localStorage.removeItem('gt-api'); } catch (e) { /* nada */ } });
$('#ia-go').addEventListener('click', guard(async () => {
  const texto = apuntes.map(a => `### ${a.nombre}\n${a.texto}`).join('\n\n') + ($('#ia-texto').value.trim() ? '\n\n' + $('#ia-texto').value.trim() : '');
  if (texto.trim().length < 200) { toast('En «Contenido», sube los apuntes o pega su texto.', true); return; }
  if (texto.length > 600000) { toast('Los apuntes son muy largos. Sube solo el tema que entra en el examen.', true); return; }
  const clave = $('#ia-clave').value;
  const apiKey = $('#ia-api').value.trim();
  if (!clave && !apiKey) { toast('Pega tu clave de API o escribe la contraseña de la web.', true); return; }
  if (apiKey && !/^sk-ant-/.test(apiKey)) { toast('La clave de API de Anthropic empieza por «sk-ant-».', true); return; }
  try {
    if (clave) sessionStorage.setItem('gt-clave', clave);
    if (apiKey) { sessionStorage.setItem('gt-api', apiKey); if ($('#ia-api-rec').checked) localStorage.setItem('gt-api', apiKey); else localStorage.removeItem('gt-api'); }
  } catch (e) { /* nada */ }
  leerCfg();
  const body = {
    clave, apiKey, apuntes: texto, materia: S.cfg.area, curso: S.cfg.curso, tema: S.cfg.contenido,
    n: Math.min(60, Math.max(1, parseInt($('#ia-n').value, 10) || 20)), nopt: +$('#ia-nopt').value, nver: +$('#ia-nver').value,
    nivel: $('#ia-nivel').value, indicaciones: $('#ia-ind').value.trim()
  };
  const btn = $('#ia-go'); btn.disabled = true;
  $('#ia-msg').innerHTML = '<span class="busy"></span> Redactando y comprobando las preguntas… puede tardar unos minutos.';
  try {
    const r = await fetch('api/generar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({ error: 'Respuesta no válida del servidor (' + r.status + ').' }));
    if (!r.ok || j.error) throw new Error(j.error || ('Error ' + r.status));
    await cargar(j.preguntas.map(q => Object.assign({ nivel: '', apartado: '', origen: 'nueva', explicacion: '', ordenFijo: false }, q)), Object.assign({}, S.cfg), 'la IA', true);
    $('#ia-msg').textContent = j.aviso || '';
  } catch (err) { $('#ia-msg').textContent = ''; throw err; } finally { btn.disabled = false; }
}));

/* ---------- descargas ---------- */
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
  S = nuevo(); apuntes = []; $('#mano-texto').value = ''; $('#ia-texto').value = ''; $('#ap-msg').textContent = ''; editando = -1;
  persist(); pintarCfg(); pintarPreguntas(); elegirModo('');
  $$('.paso').forEach(p => { p.hidden = true; }); window.scrollTo({ top: 0, behavior: 'smooth' });
}));

pintarCfg(); pintarPreguntas();
if (S.modo) { const p = S.paso; elegirModo(S.modo); irA(p); }
})();
