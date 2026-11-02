/* Panel docente del test en línea: publicar, proyectar el código, seguir las entregas, cerrar, pasar al Corrector y publicar notas. */
import { auth, db, ref, get, set, update, remove, onValue, off, serverTimestamp, signOut, onAuthStateChanged, entrarGoogle, nuevoCodigo, mensajeError } from './fb.js';

const OC = window.OC;
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CKEY = 'corrector-test-v1';
const URL_ALUMNO = new URL('hacer.html', location.href).href.replace(/\?.*$/, '');

let toastT = 0;
function toast(msg, err) { const t = $('#toast'); t.textContent = msg; t.className = 'toast' + (err ? ' err' : ''); t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, err ? 7000 : 3500); }
function ask(text, ok) {
  return new Promise(res => {
    $('#dlg-text').textContent = text; $('#dlg-ok').textContent = ok || 'Aceptar'; $('#dlg').hidden = false;
    const done = v => { $('#dlg').hidden = true; $('#dlg-ok').onclick = $('#dlg-no').onclick = null; res(v); };
    $('#dlg-ok').onclick = () => done(true); $('#dlg-no').onclick = () => done(false); $('#dlg-ok').focus();
  });
}
const guard = fn => async (...a) => { try { await fn(...a); } catch (e) { console.error(e); toast(mensajeError(e), true); } };
const fecha = t => t ? new Date(t).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
const hora = t => t ? new Date(t).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '';
const fmt = n => String(Math.round(n * 100) / 100).replace('.', ',');

let user = null, lista = {}, abierto = '', subsRef = null, subs = {}, testAbierto = null, claveAbierta = null, listaRef = null;

/* ---------- acceso ---------- */
$('#t-entrar').addEventListener('click', guard(async () => { $('#acceso-msg').textContent = ''; await entrarGoogle(false); }));
$('#t-salir').addEventListener('click', guard(() => signOut(auth)));
onAuthStateChanged(auth, guard(async u => {
  if (listaRef) { off(listaRef); listaRef = null; } cerrarEntregas();
  user = null; $('#cuenta').hidden = true; $('#lista').hidden = true; $('#nuevo').hidden = true; $('#acceso').hidden = false;
  if (!u || u.isAnonymous) return;
  const t = await get(ref(db, 'teachers/' + u.uid)).catch(() => null);
  if (!t || t.val() !== true) { $('#acceso-msg').textContent = `La cuenta ${u.email} no está dada de alta como docente en Clase en directo.`; return; }
  user = u; $('#acceso').hidden = true; $('#cuenta').hidden = false; $('#cuenta-nombre').textContent = u.displayName || u.email;
  $('#lista').hidden = false; pintarNuevo();
  listaRef = ref(db, 'teacherTests/' + u.uid);
  onValue(listaRef, s => { lista = s.val() || {}; pintarLista(); }, e => toast(mensajeError(e), true));
}));

/* ---------- publicar: el examen de «Crear examen» o un Excel ---------- */
const TC = window.TC;
let fuente = null; // { pub, exam, origen }
function paraPublicar(cfg, preguntas) {
  if (!preguntas || !preguntas.length) throw new Error('No hay preguntas.');
  const m = TC.componer(Object.assign({}, cfg, { modelos: ['A'] }), preguntas)[0]; // cada alumno recibe después su propio orden
  const ex = TC.examenCorrector(Object.assign({}, cfg, { modelos: ['A'] }), m);
  ex.title = cfg.contenido || ex.title || 'Test';
  const d = new Date(); ex.date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const sin = m.items.filter(q => !q.correcta).length;
  const pub = {
    title: ex.title, group: ex.group || '', nq: m.items.length, nopt: ex.nopt, scale: ex.scale,
    multi: m.items.some(q => (q.correcta || '').length > 1),
    reglas: TC.textoObservaciones(cfg, m.items.length, ex.nopt).replace(/^\d+ preguntas · /, ''),
    items: m.items.map(q => ({ t: q.pregunta || '', o: q.opciones.map(o => o || ''), f: !!q.ordenFijo }))
  };
  return { pub, exam: ex, sin };
}
function deCrear() {
  try { const o = JSON.parse(localStorage.getItem('generador-test-v1') || 'null'); if (o && o.cfg && o.preguntas && o.preguntas.length) return o; } catch (e) { /* nada */ }
  return null;
}
function pintarNuevo() {
  $('#nuevo').hidden = !user; if (!user) return;
  const c = deCrear();
  $('#o-crear').disabled = !c;
  $('#o-crear-info').textContent = c ? `${c.cfg.contenido || 'Sin título'}${c.cfg.curso ? ' · ' + c.cfg.curso : ''} · ${c.preguntas.length} preguntas` : 'No tienes ningún examen en Crear examen.';
  $('#o-crear').setAttribute('aria-pressed', String(!!fuente && fuente.origen === 'crear'));
  $('#o-excel').setAttribute('aria-pressed', String(!!fuente && fuente.origen === 'excel'));
  $('#n-datos').hidden = !fuente;
  if (!fuente) return;
  $('#n-tit').textContent = fuente.pub.title;
  $('#n-info').textContent = [fuente.pub.group, fuente.pub.nq + ' preguntas', fuente.pub.reglas, fuente.sin ? `${fuente.sin} sin respuesta correcta (no puntúan)` : ''].filter(Boolean).join(' · ');
  $('#n-titulo').value = fuente.pub.title;
  if (window.cursoMarca) window.cursoMarca(fuente.pub.group);
}
$('#o-crear').addEventListener('click', guard(() => {
  const c = deCrear(); if (!c) return;
  fuente = Object.assign(paraPublicar(c.cfg, c.preguntas), { origen: 'crear' }); pintarNuevo();
}));
$('#n-excel').addEventListener('change', guard(async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  const wb = window.XLSX.read(await f.arrayBuffer(), { type: 'array' });
  const hoja = n => window.XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, defval: '' });
  const nombres = wb.SheetNames;
  const nP = nombres.find(n => /pregunt|clave/i.test(n)) || nombres.find(n => TC.leerPreguntas(hoja(n)).length) || nombres[0];
  const nE = nombres.find(n => /^examen|config|datos/i.test(n));
  const cfg = nE ? TC.leerConfig(hoja(nE)) : Object.assign({}, TC.DEF);
  const preguntas = TC.leerPreguntas(hoja(nP));
  if (!preguntas.length) { toast(`No he encontrado preguntas en «${f.name}».`, true); return; }
  fuente = Object.assign(paraPublicar(cfg, preguntas), { origen: 'excel' });
  $('#o-excel-info').textContent = `«${f.name}» · ${preguntas.length} preguntas`;
  pintarNuevo();
}));
$('#n-pub').addEventListener('click', guard(async () => {
  if (!fuente || !user) return;
  const btn = $('#n-pub'); btn.disabled = true; $('#n-msg').textContent = 'Publicando…';
  try {
    let code = '';
    for (let i = 0; i < 8 && !code; i++) { const c = nuevoCodigo(); if (!(await get(ref(db, 'tests/' + c))).exists()) code = c; }
    if (!code) throw new Error('No he podido generar un código libre.');
    const min = Math.max(0, Math.min(600, parseInt($('#n-min').value, 10) || 0));
    const title = $('#n-titulo').value.trim() || fuente.pub.title;
    const pub = Object.assign({}, fuente.pub, {
      title, owner: user.uid, code, minutes: min, guests: $('#n-inv').checked, open: true, showResult: false,
      barajarPreguntas: $('#n-bp').checked, barajarOpciones: $('#n-bo').checked, createdAt: serverTimestamp()
    });
    await set(ref(db, 'tests/' + code), pub);
    await set(ref(db, 'testKeys/' + code), { exam: Object.assign({}, fuente.exam, { code, title }) });
    await set(ref(db, `teacherTests/${user.uid}/${code}`), { title, group: pub.group || '', nq: pub.nq, minutes: min, open: true, createdAt: serverTimestamp() });
    fuente = null; pintarNuevo(); abierto = code; pintarLista(); proyectar(code, title);
  } finally { btn.disabled = false; $('#n-msg').textContent = ''; }
}));

/* ---------- lista ---------- */
function pintarLista() {
  const box = $('#tests');
  const codes = Object.keys(lista).sort((a, b) => (lista[b].createdAt || 0) - (lista[a].createdAt || 0));
  if (!codes.length) { box.innerHTML = '<div class="mcr-vacio">Aún no has publicado ningún test en línea.<a class="btn primary" href="crear.html">Crear un examen</a></div>'; return; }
  box.innerHTML = codes.map(c => {
    const t = lista[c];
    return `<article class="card ot${t.open ? ' ot--vivo' : ' ot--fin'}" data-c="${c}">
      <div class="row between"><div><h3>${esc(t.title)}</h3><p class="hint">${esc([t.group, t.nq + ' preguntas', t.minutes ? t.minutes + ' min' : 'sin límite de tiempo', 'publicado ' + fecha(t.createdAt)].filter(Boolean).join(' · '))}</p></div>
      <div class="row"><span class="codigo">${c}</span>${t.open ? '<span class="mcr-vivo">abierto</span>' : '<span class="chip">cerrado</span>'}</div></div>
      <div class="row">
        <button class="btn sm primary" data-a="ver">${abierto === c ? 'Ocultar entregas' : 'Ver entregas'}</button>
        <button class="btn sm" data-a="proy">Mostrar código</button>
        <button class="btn sm" data-a="abrir">${t.open ? 'Cerrar test' : 'Volver a abrir'}</button>
        <button class="btn sm" data-a="corr">Al Corrector</button>
        <button class="btn sm ghost danger" data-a="del">Eliminar</button>
      </div>
      ${abierto === c ? '<div class="entregas" id="entregas"><p class="hint">Cargando…</p></div>' : ''}
    </article>`;
  }).join('');
  if (abierto && lista[abierto]) abrirEntregas(abierto); else cerrarEntregas();
}
$('#tests').addEventListener('click', guard(async e => {
  const b = e.target.closest('button'); if (!b) return;
  const art = b.closest('[data-c]'), c = art && art.dataset.c; if (!c) return;
  const t = lista[c], a = b.dataset.a;
  if (a === 'ver') { abierto = abierto === c ? '' : c; pintarLista(); }
  if (a === 'proy') proyectar(c, t.title);
  if (a === 'abrir') {
    const v = !t.open;
    if (!v) {
      const todos = (await get(ref(db, 'testSubs/' + c))).val() || {};
      const pend = Object.entries(todos).filter(([, s]) => s && !s.done);
      if (pend.length && await ask(`${pend.length} alumno(s) no han entregado todavía. ¿Dar por entregado lo que llevan respondido? (Si no, sus respuestas no pasarán al Corrector.)`, 'Dar por entregado')) {
        const upd = {}; pend.forEach(([uid]) => { upd[uid + '/done'] = true; upd[uid + '/doneAt'] = serverTimestamp(); });
        await update(ref(db, 'testSubs/' + c), upd);
      }
    }
    await update(ref(db, 'tests/' + c), { open: v }); await update(ref(db, `teacherTests/${user.uid}/${c}`), { open: v });
    toast(v ? 'El test vuelve a estar abierto.' : 'Test cerrado: ya no se pueden enviar respuestas.');
  }
  if (a === 'corr') await alCorrector(c);
  if (a === 'del') {
    if (!await ask(`¿Eliminar «${t.title}» (${c}) con todas sus entregas? No se puede deshacer. Si quieres conservar las notas, pásalo antes al Corrector.`, 'Eliminar')) return;
    if (abierto === c) { abierto = ''; cerrarEntregas(); }
    await remove(ref(db, 'testResults/' + c)); await remove(ref(db, 'testSubs/' + c)); await remove(ref(db, 'testKeys/' + c));
    await remove(ref(db, 'tests/' + c)); await remove(ref(db, `teacherTests/${user.uid}/${c}`));
    toast('Test eliminado.');
  }
  if (a === 'pubnotas') await publicarNotas(c, true);
  if (a === 'ocnotas') await publicarNotas(c, false);
  if (a === 'seguir') {
    const uid = b.dataset.u, s = subs[uid];
    if (!await ask(`¿Dejar que ${s.name || 'este alumno'} siga respondiendo? Su entrega vuelve a quedar abierta.`, 'Dejar seguir')) return;
    await update(ref(db, `testSubs/${c}/${uid}`), { done: false });
  }
}));

/* ---------- entregas en directo ---------- */
function cerrarEntregas() { if (subsRef) off(subsRef); subsRef = null; subs = {}; testAbierto = claveAbierta = null; }
async function abrirEntregas(c) {
  if (subsRef && testAbierto && testAbierto.code === c) { pintarEntregas(); return; }
  cerrarEntregas();
  const [ts, ks] = await Promise.all([get(ref(db, 'tests/' + c)), get(ref(db, 'testKeys/' + c))]);
  testAbierto = ts.val(); claveAbierta = ks.val() && ks.val().exam;
  if (!testAbierto || !claveAbierta) { $('#entregas').innerHTML = '<p class="hint">No encuentro este test.</p>'; return; }
  if (window.cursoMarca) window.cursoMarca(testAbierto.group);
  subsRef = ref(db, 'testSubs/' + c);
  onValue(subsRef, s => { subs = s.val() || {}; pintarEntregas(); }, e => toast(mensajeError(e), true));
}
function pintarEntregas() {
  const box = $('#entregas'); if (!box || !testAbierto) return;
  const E = claveAbierta, o = OC.opcionesNota(E);
  const filas = Object.entries(subs).map(([uid, s]) => {
    const ans = OC.respuestas(s, E.nq), n = ans.filter(Boolean).length;
    return { uid, s, n, r: s.done ? OC.grade(E.key, ans, o) : null, nombre: OC.nombreLista(s.name) };
  }).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const hechos = filas.filter(f => f.s.done).length;
  const media = hechos ? filas.filter(f => f.r).reduce((m, f) => m + f.r.nota, 0) / hechos : 0;
  box.innerHTML = `<div class="row" style="justify-content:space-between">
      <div class="row"><span class="chip">${filas.length} han entrado</span><span class="chip ok">${hechos} entregados</span>${hechos ? `<span class="chip">media ${fmt(media)}</span>` : ''}</div>
      <div class="row">${testAbierto.showResult ? '<span class="chip ok">notas visibles para el alumnado</span><button class="btn sm ghost" data-a="ocnotas">Ocultar notas</button>' : `<button class="btn sm" data-a="pubnotas"${hechos ? '' : ' disabled'}>Publicar notas al alumnado</button>`}</div></div>
    ${filas.length ? `<div class="tscroll"><table><thead><tr><th>Alumno</th><th>Estado</th><th class="num">Respondidas</th><th class="num">Salidas</th><th class="num">Aciertos</th><th class="num">Fallos</th><th class="num">Nota</th><th></th></tr></thead><tbody>
    ${filas.map(f => `<tr><td>${esc(f.nombre)}${f.s.email ? `<div class="hint">${esc(f.s.email)}</div>` : '<div class="hint">sin cuenta</div>'}</td>
      <td>${f.s.done ? `<span class="chip ok">Entregado ${hora(f.s.doneAt)}</span>` : '<span class="mcr-vivo">haciendo</span>'}</td>
      <td class="num">${f.n}/${E.nq}</td><td class="num">${f.s.away ? `<span class="chip warn">${f.s.away}</span>` : '0'}</td>
      <td class="num">${f.r ? f.r.c : ''}</td><td class="num">${f.r ? f.r.w : ''}</td><td class="num nota">${f.r ? fmt(f.r.nota) : ''}</td>
      <td>${f.s.done ? `<button class="btn sm ghost" data-a="seguir" data-u="${esc(f.uid)}">Dejar seguir</button>` : ''}</td></tr>`).join('')}
    </tbody></table></div>` : `<p class="empty">Nadie ha entrado todavía. Pulsa «Mostrar código» para proyectarlo.</p>`}
    <p class="hint">«Salidas» cuenta las veces que el alumno ha cambiado de pestaña o de aplicación durante el test. La nota se calcula con la clave y la penalización del examen; para informes y el Excel de iDoceo, usa «Al Corrector».</p>`;
}

async function publicarNotas(c, ver) {
  if (!testAbierto || testAbierto.code !== c) return;
  if (ver) {
    const E = claveAbierta, o = OC.opcionesNota(E), upd = {};
    Object.entries(subs).forEach(([uid, s]) => { if (s.done) { const r = OC.grade(E.key, OC.respuestas(s, E.nq), o); upd[uid] = { nota: r.nota, c: r.c, w: r.w, b: r.b, escala: E.scale }; } });
    if (!await ask(`Cada alumno verá su nota (${Object.keys(upd).length} entregas) al volver a entrar con el código. ¿Publicar?`, 'Publicar')) return;
    await set(ref(db, 'testResults/' + c), upd);
  }
  await update(ref(db, 'tests/' + c), { showResult: ver }); testAbierto.showResult = ver; pintarEntregas();
  toast(ver ? 'Notas publicadas.' : 'Notas ocultas para el alumnado.');
}

async function alCorrector(c) {
  const [ks, ss] = await Promise.all([get(ref(db, 'testKeys/' + c)), get(ref(db, 'testSubs/' + c))]);
  const E = ks.val() && ks.val().exam, all = ss.val() || {};
  if (!E) { toast('No encuentro la clave de este test.', true); return; }
  const hechos = Object.values(all).filter(s => s && s.done).length;
  if (!hechos) { toast('Todavía no hay entregas.', true); return; }
  const pend = Object.values(all).length - hechos;
  let C = null; try { C = JSON.parse(localStorage.getItem(CKEY) || 'null'); } catch (e) { /* nada */ }
  const aviso = (pend ? `${pend} alumno(s) aún no han entregado y no se incluirán. ` : '') + (C && C.sheets && C.sheets.length ? `El Corrector tiene ahora otro examen con ${C.sheets.length} hojas: se sustituirá (guárdalo antes con «Guardar proyecto» si lo necesitas). ` : '');
  if (!await ask(`${aviso}¿Abrir en el Corrector las ${hechos} entregas de «${E.title}»?`, 'Abrir en el Corrector')) return;
  const d = new Date(); E.date = E.date || `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  localStorage.setItem(CKEY, JSON.stringify(OC.estadoCorrector(E, all, {})));
  localStorage.setItem('corrector-ir-a', 'p5');
  location.href = 'corrector.html';
}

/* ---------- proyectar el código ---------- */
function proyectar(c, titulo) {
  const url = URL_ALUMNO + '?c=' + c;
  $('#proy-tit').textContent = titulo || ''; $('#proy-cod').textContent = c; $('#proy-url').textContent = URL_ALUMNO.replace(/^https?:\/\//, '');
  const qr = window.qrcode(0, 'M'); qr.addData(url); qr.make();
  $('#proy-qr').innerHTML = qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
  $('#proy-copiar').onclick = guard(async () => { await navigator.clipboard.writeText(url); toast('Enlace copiado: ' + url); });
  $('#proy').hidden = false; $('#proy-cerrar').focus();
}
$('#proy-cerrar').addEventListener('click', () => { $('#proy').hidden = true; });
document.addEventListener('keydown', e => { if (e.key === 'Escape') $('#proy').hidden = true; });
