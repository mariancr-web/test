/* Marca mariancr en las webs: modo oscuro automático y color del curso.
   - Si el sistema está en oscuro, <html data-theme="oscuro"> (lo que pide mariancr.css).
   - Los campos con data-curso (p. ej. «2ºBach B», «ByG - 1ESO B») y data-materia dan el color a toda la página:
     body.curso-1eso | 2eso | 4eso | 1bach | 2bach, SOLO si es una materia de Marián (ByG 1.º ESO, FyQ 2.º/4.º ESO
     y 1.º Bach, Química 2.º Bach). Cualquier otra materia o curso (otros profesores) queda en curso-general (azul). */
(function () {
  var mq = window.matchMedia && matchMedia('(prefers-color-scheme: dark)');
  function tema() { if (mq) document.documentElement.setAttribute('data-theme', mq.matches ? 'oscuro' : 'claro'); }
  tema(); if (mq && mq.addEventListener) mq.addEventListener('change', tema);

  var CURSOS = ['curso-general', 'curso-1eso', 'curso-2eso', 'curso-4eso', 'curso-1bach', 'curso-2bach'];
  var BIO = /\b(byg|bg|biogeo\w*|biolog\w*|geolog\w*)\b/, FYQ = /\b(fyq|fq|f\s*y\s*q|fisica|quim\w*)\b/, QUI = /\b(quim\w*|qui)\b/;
  var MATERIA = { 'curso-1eso': BIO, 'curso-2eso': FYQ, 'curso-4eso': FYQ, 'curso-1bach': FYQ, 'curso-2bach': QUI };
  function claseCurso(txt) {
    var t = String(txt || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    var m = t.match(/([1-4])\s*[º°ªo.]*\s*(?:de\s+)?(eso|bach)/);
    if (!m) return 'curso-general';
    var c = 'curso-' + m[1] + m[2];
    return MATERIA[c] && MATERIA[c].test(t) ? c : 'curso-general';
  }
  function materias() { return Array.prototype.map.call(document.querySelectorAll('[data-materia]'), function (el) { return el.value; }).join(' '); }
  function cursoMarca(txt) {
    var b = document.body; if (!b) return;
    var c = claseCurso(txt + ' ' + materias());
    CURSOS.forEach(function (k) { if (k !== c) b.classList.remove(k); });
    b.classList.add(c);
  }
  function revisar() {
    var el = document.querySelector('[data-curso]');
    cursoMarca(el ? el.value : '');
  }
  window.cursoMarca = cursoMarca;
  window.revisarCurso = revisar;
  document.addEventListener('input', function (e) { if (e.target && e.target.matches && e.target.matches('[data-curso],[data-materia]')) revisar(); });
  document.addEventListener('DOMContentLoaded', function () { revisar(); setTimeout(revisar, 300); });
})();
