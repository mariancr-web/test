/* Página del alumnado: entrar con el código, hacer el test (orden propio), guardado al momento y entrega. */
import { auth, db, ref, get, set, update, onValue, serverTimestamp, signOut, onAuthStateChanged, entrarGoogle, entrarSinCuenta, esColegio, mensajeError, DOMINIO } from './fb.js';

const OC = window.OC, TC = window.TC, LET = OC.LET;
const $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const html = t => TC.trozos(t).map(x => x.sub ? `<sub>${esc(x.t)}</sub>` : x.sup ? `<sup>${esc(x.t)}</sup>` : esc(x.t)).join('');
const fmt = n => String(Math.round(n * 100) / 100).replace('.', ',');

let toastT = 0;
function toast(msg, err) { const t = $('#toast'); t.textContent = msg; t.className = 'toast' + (err ? ' err' : ''); t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, err ? 7000 : 3000); }
function ask(text, ok) {
  return new Promise(res => {
    $('#dlg-text').textContent = text; $('#dlg-ok').textContent = ok || 'Aceptar'; $('#dlg').hidden = false;
    const done = v => { $('#dlg').hidden = true; $('#dlg-ok').onclick = $('#dlg-no').onclick = null; res(v); };
    $('#dlg-ok').onclick = () => done(true); $('#dlg-no').onclick = () => done(false); $('#dlg-ok').focus();
  });
}
const guard = fn => async (...a) => { try { await fn(...a); } catch (e) { console.error(e); toast(mensajeError(e), true); } };

const vistas = ['v-codigo', 'v-intro', 'v-test', 'v-fin'];
function ver(id) { vistas.forEach(v => { $('#' + v).hidden = v !== id; }); window.scrollTo({ top: 0 }); }
function cabecera(etq, tit, lead) { $('#h-etq').textContent = etq; $('#h-tit').textContent = tit; $('#h-lead').textContent = lead || ''; $('#h-lead').hidden = !lead; }

let user = null, code = '', test = null, sub = null, orden = [], resp = [], subRef = null, reloj = 0, offset = 0, entregando = false;
onValue(ref(db, '.info/serverTimeOffset'), s => { offset = s.val() || 0; });
const ahora = () => Date.now() + offset;

/* ---------- código y acceso ---------- */
const limpiar = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
code = limpiar(new URLSearchParams(location.search).get('c') || sessionStorage.getItem('test-codigo') || '');
$('#codigo').value = code;
$('#codigo').addEventListener('input', e => { e.target.value = limpiar(e.target.value); });
function leerCodigo() {
  const c = limpiar($('#codigo').value);
  if (c.length !== 6) { $('#m-codigo').textContent = 'El código tiene 6 letras o números.'; $('#codigo').focus(); return ''; }
  code = c; try { sessionStorage.setItem('test-codigo', c); } catch (e) { /* nada */ } return c;
}
$('#b-google').addEventListener('click', guard(async () => {
  if (!leerCodigo()) return;
  $('#m-codigo').textContent = '';
  if (user && !user.isAnonymous && esColegio(user)) return cargar();
  if (user) await signOut(auth);
  await entrarGoogle(true);
}));
$('#b-anon').addEventListener('click', guard(async () => {
  if (!leerCodigo()) return;
  const n = $('#nombre').value.replace(/\s+/g, ' ').trim();
  if (n.length < 3) { $('#m-codigo').textContent = 'Escribe tu nombre y apellidos.'; $('#nombre').focus(); return; }
  $('#m-codigo').textContent = '';
  if (user) await signOut(auth);
  await entrarSinCuenta(n); sessionStorage.setItem('test-nombre', n);
}));
$('#salir').addEventListener('click', guard(async () => { await signOut(auth); code = ''; sessionStorage.removeItem('test-codigo'); location.href = 'hacer.html'; }));

onAuthStateChanged(auth, guard(async u => {
  user = u;
  $('#salir').hidden = !u;
  $('#quien').textContent = u ? (u.isAnonymous ? (u.displayName || sessionStorage.getItem('test-nombre') || 'Sin cuenta') : (u.displayName || u.email)) : '';
  if (!u) { ver('v-codigo'); return; }
  if (!u.isAnonymous && !esColegio(u)) {
    $('#m-codigo').textContent = `Entra con tu cuenta del colegio (@${DOMINIO}).`; await signOut(auth); return;
  }
  if (code) await cargar();
}));

/* ---------- cargar el test y la entrega del alumno ---------- */
async function cargar() {
  $('#m-codigo').textContent = 'Buscando el test…';
  let ts;
  try { ts = await get(ref(db, 'tests/' + code)); }
  catch (e) {
    $('#m-codigo').textContent = user.isAnonymous ? 'Este test no permite entrar sin cuenta (o el código no es correcto).' : mensajeError(e);
    if (user.isAnonymous) await signOut(auth); return;
  }
  if (!ts.exists()) { $('#m-codigo').textContent = 'No hay ningún test con ese código. Revísalo.'; return; }
  test = ts.val(); test.code = code;
  if (window.cursoMarca) window.cursoMarca(test.group);
  subRef = ref(db, `testSubs/${code}/${user.uid}`);
  sub = (await get(subRef)).val();
  $('#m-codigo').textContent = '';
  if (sub && sub.done) return fin();
  if (!test.open) { cabecera('Test en línea', test.title, 'Este test está cerrado.'); ver('v-codigo'); $('#m-codigo').textContent = 'Este test está cerrado: ya no se pueden enviar respuestas.'; return; }
  if (sub) return empezarVista();
  intro();
}

function reglas() {
  const d = [`${test.nq} preguntas, ${test.nopt} opciones cada una${test.multi ? ' (puede haber más de una correcta)' : ''}`];
  if (test.reglas) d.push(test.reglas);
  d.push(test.minutes ? `Tiempo: ${test.minutes} minutos desde que pulses «Empezar». Al acabarse, se entrega solo.` : 'Sin límite de tiempo.');
  return d;
}
function intro() {
  cabecera(test.group || 'Test en línea', test.title, '');
  $('#i-tit').textContent = 'Antes de empezar';
  $('#i-datos').innerHTML = reglas().map(t => `<li>${esc(t)}</li>`).join('');
  ver('v-intro');
}
$('#b-empezar').addEventListener('click', guard(async () => {
  const name = user.isAnonymous ? (user.displayName || sessionStorage.getItem('test-nombre') || '') : (user.displayName || user.email);
  await set(subRef, { name: name.slice(0, 60), email: user.isAnonymous ? '' : user.email.toLowerCase(), startedAt: serverTimestamp(), away: 0, done: false });
  sub = (await get(subRef)).val();
  empezarVista();
}));

/* ---------- el test ---------- */
function empezarVista() {
  cabecera(test.group || 'Test en línea', test.title, '');
  orden = OC.ordenAlumno(test, user.uid);
  resp = OC.respuestas(sub, test.nq);
  $('#preguntas').innerHTML = orden.map(({ q, perm }, i) => {
    const it = test.items[q];
    return `<li class="preg" data-q="${q}"><p class="preg__t"><span class="preg__n">${i + 1}</span>${html(it.t)}</p>
      <div class="opcs" role="${test.multi ? 'group' : 'radiogroup'}">${perm.map((o, j) => `<button class="opc" data-q="${q}" data-l="${LET[o]}" role="${test.multi ? 'checkbox' : 'radio'}" aria-checked="${resp[q].includes(LET[o])}"><span class="opc__l">${LET[j]}</span><span class="opc__t">${html(it.o[o])}</span></button>`).join('')}</div></li>`;
  }).join('');
  progreso(); ver('v-test');
  clearInterval(reloj);
  if (test.minutes) { $('#t-reloj').hidden = false; tic(); reloj = setInterval(tic, 1000); }
}
function progreso() {
  const n = resp.filter(Boolean).length;
  $('#t-prog').textContent = `${n} de ${test.nq} respondidas`;
  $('#t-resumen').textContent = n < test.nq ? `Te quedan ${test.nq - n} sin responder. Las que dejes en blanco no restan.` : 'Has respondido todas. Repasa antes de entregar.';
  $$('.preg').forEach(li => li.classList.toggle('preg--hecha', !!resp[+li.dataset.q]));
}
function tic() {
  const fin = sub.startedAt + test.minutes * 60000, r = Math.max(0, fin - ahora());
  const m = Math.floor(r / 60000), s = Math.floor(r / 1000) % 60;
  const el = $('#t-reloj'); el.textContent = `${m}:${String(s).padStart(2, '0')}`; el.classList.toggle('reloj--poco', r < 120000);
  if (r <= 0) { clearInterval(reloj); entregar(true); }
}
$('#preguntas').addEventListener('click', guard(async e => {
  const b = e.target.closest('.opc'); if (!b || entregando) return;
  const q = +b.dataset.q, L = b.dataset.l;
  let v = resp[q] || '';
  if (test.multi) v = v.includes(L) ? v.replace(L, '') : [...v + L].sort().join('');
  else v = v === L ? '' : L;
  resp[q] = v;
  $$(`.opc[data-q="${q}"]`).forEach(x => x.setAttribute('aria-checked', String(v.includes(x.dataset.l))));
  progreso();
  $('#t-guardado').textContent = 'Guardando…';
  try { await update(subRef, { ['answers/' + q]: v }); $('#t-guardado').textContent = 'Guardado'; }
  catch (err) { $('#t-guardado').textContent = ''; throw cerrado(err); }
}));
function cerrado(err) {
  if (/PERMISSION_DENIED|permission/i.test(String(err && (err.code || err.message)))) return new Error('No se ha podido guardar: el test está cerrado o se ha acabado el tiempo.');
  return err;
}

/* salidas de pestaña o de aplicación */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'hidden' || $('#v-test').hidden || !subRef || entregando) return;
  sub.away = (sub.away || 0) + 1;
  update(subRef, { away: sub.away }).catch(() => { /* nada */ });
});

async function entregar(auto) {
  if (entregando) return;
  if (!auto) {
    const bl = resp.filter(x => !x).length;
    if (!await ask(bl ? `Tienes ${bl} pregunta(s) sin responder. ¿Entregar de todas formas? Después no podrás cambiar nada.` : '¿Entregar el test? Después no podrás cambiar nada.', 'Entregar')) return;
  }
  entregando = true; clearInterval(reloj);
  try { await update(subRef, { done: true, doneAt: serverTimestamp() }); }
  catch (e) { entregando = false; if (!auto) throw cerrado(e); }
  sub = (await get(subRef)).val() || Object.assign(sub, { done: true });
  fin(auto);
}
$('#b-entregar').addEventListener('click', guard(() => entregar(false)));
$('#b-entregar-arriba').addEventListener('click', guard(() => entregar(false)));

/* ---------- entregado ---------- */
function fin(auto) {
  cabecera(test.group || 'Test en línea', test.title, '');
  const n = OC.respuestas(sub, test.nq).filter(Boolean).length;
  $('#f-tit').textContent = auto ? 'Se acabó el tiempo: test entregado' : 'Test entregado';
  $('#f-txt').textContent = `Has respondido ${n} de ${test.nq} preguntas. Ya puedes cerrar esta página.`;
  $('#f-nota').innerHTML = '';
  ver('v-fin');
  onValue(ref(db, `tests/${code}/showResult`), async s => {
    if (s.val() !== true) { $('#f-nota').innerHTML = '<p class="hint">Tu profesor o profesora te dirá la nota. Si la publica aquí, la verás al volver a entrar con el código.</p>'; return; }
    try {
      const r = (await get(ref(db, `testResults/${code}/${user.uid}`))).val();
      $('#f-nota').innerHTML = r ? `<div class="nota-final"><span>Nota</span><b>${fmt(r.nota)}</b><span>sobre ${fmt(r.escala || 10)}</span></div><p class="hint">${r.c} aciertos · ${r.w} fallos · ${r.b} en blanco</p>` : '<p class="hint">Tu nota aún no está publicada.</p>';
    } catch (e) { $('#f-nota').innerHTML = ''; }
  }, () => { /* sin permiso: nada */ });
}
