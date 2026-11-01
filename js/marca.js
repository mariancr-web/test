/* Marca mariancr en las webs: modo oscuro automático y color del curso.
   - Si el sistema está en oscuro, <html data-theme="oscuro"> (lo que pide mariancr.css).
   - Los campos con data-curso (p. ej. «2ºBach B», «ByG - 1ESO B») dan el color a toda la página:
     body.curso-1eso | 2eso | 4eso | 1bach | 2bach; si no se reconoce, curso-general. */
(function () {
  var mq = window.matchMedia && matchMedia('(prefers-color-scheme: dark)');
  function tema() { if (mq) document.documentElement.setAttribute('data-theme', mq.matches ? 'oscuro' : 'claro'); }
  tema(); if (mq && mq.addEventListener) mq.addEventListener('change', tema);

  var CURSOS = ['curso-general', 'curso-1eso', 'curso-2eso', 'curso-4eso', 'curso-1bach', 'curso-2bach'];
  function claseCurso(txt) {
    var t = String(txt || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    var m = t.match(/([1-4])\s*[º°ªo.]*\s*(?:de\s+)?(eso|bach)/);
    if (!m) return 'curso-general';
    var c = 'curso-' + m[1] + m[2];
    return CURSOS.indexOf(c) >= 0 ? c : 'curso-general';
  }
  function cursoMarca(txt) {
    var b = document.body; if (!b) return;
    var c = claseCurso(txt);
    CURSOS.forEach(function (k) { if (k !== c) b.classList.remove(k); });
    b.classList.add(c);
  }
  function revisar() {
    var el = document.querySelector('[data-curso]');
    if (el) cursoMarca(el.value);
  }
  window.cursoMarca = cursoMarca;
  window.revisarCurso = revisar;
  document.addEventListener('input', function (e) { if (e.target && e.target.matches && e.target.matches('[data-curso]')) cursoMarca(e.target.value); });
  document.addEventListener('DOMContentLoaded', function () { revisar(); setTimeout(revisar, 300); });
})();
