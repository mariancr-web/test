/* Test en línea: orden por alumno, corrección y paso al Corrector. Sin dependencias (sirve en el navegador y en Node). */
(function (root, f) { const m = f(); if (typeof module === 'object' && module.exports) module.exports = m; else root.OC = m; })(this, function () {
  const LET = 'ABCDEFGH';
  function hash(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function shuffle(a, r) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  /* Orden propio de cada alumno (siempre el mismo para el mismo alumno y test).
     Devuelve [{ q: índice original, perm: [índices originales de las opciones en el orden mostrado] }] */
  function ordenAlumno(test, uid) {
    const r = rng(hash(test.code + '|' + uid));
    const items = test.items || [];
    let qs = items.map((_, i) => i);
    if (test.barajarPreguntas) qs = shuffle(qs, r);
    return qs.map(q => {
      let perm = (items[q].o || []).map((_, i) => i);
      if (test.barajarOpciones && !items[q].f) perm = shuffle(perm, r);
      return { q, perm };
    });
  }

  /* Misma corrección que el Corrector (aciertos, fallos con penalización, en blanco, varias verdaderas) */
  function grade(key, ans, o) {
    const pen = o.penMode === 'auto' ? 1 / Math.max(1, o.nopt - 1) : o.penMode === 'custom' ? (+o.penVal || 0) : 0;
    const modo = o.multiMode || 'una';
    let c = 0, w = 0, b = 0, inc = 0, pts = 0, max = 0;
    const uniq = t => [...new Set(String(t || '').split(''))].sort().join('');
    for (let q = 0; q < o.nq; q++) {
      const k = key[q] || {};
      if (k.x || !k.a) continue;
      const p = +k.p > 0 ? +k.p : 1; max += p;
      const a = uniq(ans[q]), ka = uniq(k.a);
      const ok = () => { c++; pts += p; }, bad = () => { w++; pts -= p * pen; };
      if (!a) b++;
      else if (ka.length === 1) { if (a.length > 1) b++; else if (a === ka) ok(); else bad(); }
      else if ([...a].some(L => !ka.includes(L))) bad();
      else if (a === ka || modo === 'una') ok();
      else if (modo === 'parcial') { inc++; pts += p * a.length / ka.length; }
      else inc++;
    }
    const nota = max ? Math.min(o.scale, Math.max(0, pts / max * o.scale)) : 0;
    return { c, w, b, inc, nota: Math.round(nota * 100) / 100 };
  }
  const opcionesNota = E => ({ nq: E.nq, nopt: E.nopt, penMode: E.penMode, penVal: E.penVal, multiMode: E.multiMode, scale: E.scale });
  const respuestas = (sub, nq) => Array.from({ length: nq }, (_, q) => (sub.answers && sub.answers[q]) || '');

  /* Nombre para el listado: «Apellidos, Nombre» si viene de Google como «Nombre Apellido1 Apellido2» */
  function nombreLista(n) {
    n = String(n || '').replace(/\s+/g, ' ').trim();
    if (!n || n.includes(',')) return n;
    const p = n.split(' ');
    if (p.length >= 3) return p.slice(-2).join(' ') + ', ' + p.slice(0, -2).join(' ');
    if (p.length === 2) return p[1] + ', ' + p[0];
    return n;
  }

  /* Estado del Corrector con las entregas: listado + clave + una «hoja» por alumno ya leída */
  function estadoCorrector(exam, subs, previo) {
    const lista = Object.entries(subs || {}).filter(([, s]) => s && s.done)
      .map(([uid, s]) => ({ uid, s, nombre: nombreLista(s.name) || 'Sin nombre' }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    const usados = new Map();
    lista.forEach(x => { const n = usados.get(x.nombre) || 0; usados.set(x.nombre, n + 1); if (n) x.nombre += ' (' + (n + 1) + ')'; });
    const pages = Math.max(1, Math.ceil(exam.nq / 100)), sheets = []; // el Corrector cuenta 100 preguntas por hoja
    lista.forEach((x, i) => {
      const ans = respuestas(x.s, exam.nq);
      for (let p = 0; p < pages; p++) sheets.push({
        id: 'ol' + i + 'p' + p + '-' + x.uid.slice(0, 8), src: 'En línea', sid: i + 1, page: p, pages, nq: exam.nq, nopt: exam.nopt,
        code: exam.code || '', nameQR: x.nombre, hasQR: false, fixed: {}, warn: [], err: '', dup: false, ignored: false,
        ans: ans.slice(p * 100, p * 100 + 100).map((pick, k) => ({ q: p * 100 + k, pick, state: pick ? 'ok' : 'blank' }))
      });
    });
    return Object.assign({}, previo || {}, { roster: lista.map(x => x.nombre).join('\n'), exam, sheets });
  }

  return { LET, hash, rng, shuffle, ordenAlumno, grade, opcionesNota, respuestas, nombreLista, estadoCorrector };
});
