/* Generador de tests · núcleo sin DOM (sirve en el navegador y en Node para las pruebas).
   Excel → preguntas → modelos barajados → Word del colegio (document.xml) y clave para el Corrector.
   Importación de exámenes hechos (texto de PDF o Word). */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.TC = factory();
})(this, function () {
  'use strict';
  const LET = 'ABCDEFGH';

  /* ---------- utilidades ---------- */
  const fold = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const str = v => (v == null ? '' : String(v)).replace(/\r\n?/g, '\n').trim();
  const yes = v => /^(s[ií]|si|x|1|true|verdadero|yes)$/i.test(str(v));
  const xmlEsc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const letters = v => [...new Set(str(v).toUpperCase().replace(/[^A-H]/g, '').split(''))].sort().join('');
  function rng(seed) { // mulberry32
    let a = (seed >>> 0) || 1;
    return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function shuffle(arr, r) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const num = v => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
  const fmt = n => (Math.round(n * 1000) / 1000).toString().replace('.', ',');

  /* ---------- configuración por defecto ---------- */
  const DEF = {
    area: '', contenido: '', curso: '', modelos: ['A', 'B'], barajarPreguntas: true, barajarOpciones: true,
    nota: 10, fallos: 'no', observaciones: '', hojaRespuestas: false, semilla: 1, numPreguntas: 0
  };

  // "no" | "auto" (1/(n-1)) | número (fracción del valor de una pregunta)
  function parseFallos(v) {
    const s = fold(v);
    if (!s || /^(no|0|ninguna|nada)$/.test(s)) return 'no';
    if (/n\s*-\s*1|auto/.test(s)) return 'auto';
    const m = s.match(/^(\d+)\s*\/\s*(\d+)$/); if (m) return (+m[1]) / (+m[2]);
    const n = num(s); return Number.isFinite(n) && n > 0 ? n : 'no';
  }

  /* ---------- lectura del Excel ---------- */
  // filas = matriz (primera hoja «Examen»: Campo | Valor)
  function leerConfig(filas) {
    const c = Object.assign({}, DEF, { modelos: DEF.modelos.slice() });
    (filas || []).forEach(r => {
      const k = fold(r[0]), v = r[1];
      if (!k || v == null || str(v) === '') return;
      if (k.startsWith('area') || k.startsWith('asignatura') || k.startsWith('materia')) c.area = str(v);
      else if (k.startsWith('contenido') || k.startsWith('tema') || k.startsWith('titulo')) c.contenido = str(v);
      else if (k.startsWith('curso') || k.startsWith('grupo')) c.curso = str(v);
      else if (k.startsWith('modelo')) { const m = str(v).toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean); if (m.length) c.modelos = m.slice(0, 8); }
      else if (k.startsWith('barajar preg') || k.startsWith('desordenar preg')) c.barajarPreguntas = yes(v);
      else if (k.startsWith('barajar op') || k.startsWith('desordenar op')) c.barajarOpciones = yes(v);
      else if (k.startsWith('nota')) { const n = num(v); if (n > 0) c.nota = n; }
      else if (k.startsWith('fallo') || k.startsWith('penaliz') || k.startsWith('error')) c.fallos = parseFallos(v);
      else if (k.startsWith('observ')) c.observaciones = str(v);
      else if (k.startsWith('hoja de resp') || k.startsWith('tabla de resp')) c.hojaRespuestas = yes(v);
      else if (k.startsWith('semilla')) { const n = Math.floor(num(v)); if (n > 0) c.semilla = n; }
      else if (k.startsWith('n') && k.includes('pregunta')) { const n = Math.floor(num(v)); if (n > 0) c.numPreguntas = n; }
    });
    return c;
  }

  // Hoja «Preguntas». Acepta también la plantilla de clave del Corrector (Nº, Respuesta correcta, Enunciado, A, B…)
  function leerPreguntas(filas) {
    const rows = (filas || []).map(r => (r || []).map(x => (x == null ? '' : x)));
    const hi = rows.slice(0, 6).findIndex(r => r.some(c => /^(pregunta|enunciado)$/i.test(fold(c))));
    if (hi < 0) return [];
    const h = rows[hi].map(fold);
    const col = re => h.findIndex(c => re.test(c));
    const cP = col(/^(pregunta|enunciado)$/), cC = col(/^(correcta|respuesta|respuesta correcta|clave|solucion)$/);
    const cN = col(/^(nivel|dificultad|complejidad)$/), cA = col(/^(apartado|bloque|contenido|tema)$/);
    const cO = col(/^(origen|fuente)$/), cE = col(/^(explicacion|justificacion|comentario)$/), cF = col(/^(orden fijo|fijar orden|no barajar)$/);
    const cX = col(/^anulada$/);
    const cOpt = {}; h.forEach((c, i) => { const m = c.match(/^(?:opcion\s*)?([a-h])$/); if (m) cOpt[m[1].toUpperCase()] = i; });
    const out = [];
    rows.slice(hi + 1).forEach(r => {
      const p = str(r[cP]);
      const op = []; for (const L of LET) { if (cOpt[L] == null) break; const t = str(r[cOpt[L]]); op.push(t); }
      while (op.length && !op[op.length - 1]) op.pop();
      if (!p && !op.length) return;
      if (cX >= 0 && yes(r[cX])) return;
      out.push({
        pregunta: p, opciones: op, correcta: cC >= 0 ? letters(r[cC]) : '',
        nivel: cN >= 0 ? str(r[cN]) : '', apartado: cA >= 0 ? str(r[cA]) : '', origen: cO >= 0 ? str(r[cO]) : '',
        explicacion: cE >= 0 ? str(r[cE]) : '', ordenFijo: cF >= 0 ? yes(r[cF]) : false
      });
    });
    return out;
  }

  function validar(preguntas) {
    const avisos = [];
    preguntas.forEach((q, i) => {
      const n = i + 1;
      if (!q.pregunta) avisos.push(`Pregunta ${n}: falta el enunciado.`);
      if (q.opciones.length < 2) avisos.push(`Pregunta ${n}: necesita al menos 2 opciones.`);
      if (q.opciones.some(o => !o)) avisos.push(`Pregunta ${n}: hay una opción vacía entre medias.`);
      if (!q.correcta) avisos.push(`Pregunta ${n}: no tiene respuesta correcta.`);
      else if ([...q.correcta].some(L => LET.indexOf(L) >= q.opciones.length)) avisos.push(`Pregunta ${n}: la respuesta ${q.correcta} no existe (solo hay ${q.opciones.length} opciones).`);
      const vistos = new Set(q.opciones.map(o => fold(o)));
      if (vistos.size < q.opciones.length) avisos.push(`Pregunta ${n}: tiene dos opciones iguales.`);
    });
    const nOp = new Set(preguntas.map(q => q.opciones.length));
    if (nOp.size > 1) avisos.push('No todas las preguntas tienen el mismo número de opciones: la hoja del Corrector usará el máximo.');
    return avisos;
  }

  /* ---------- modelos ---------- */
  // Modelo A respeta el orden del Excel; el resto se barajan (si así se indica). Con «Nº de preguntas» se elige al azar ese número de preguntas del banco (las mismas en todos los modelos).
  function componer(cfg, preguntas) {
    const r = rng(cfg.semilla * 7919 + 13);
    let base = preguntas.map((q, i) => Object.assign({ id: i + 1 }, q));
    if (cfg.numPreguntas && cfg.numPreguntas < base.length) base = shuffle(base, r).slice(0, cfg.numPreguntas).sort((a, b) => a.id - b.id);
    return cfg.modelos.map((nombre, mi) => {
      let orden = base;
      if (mi > 0 && cfg.barajarPreguntas) orden = shuffle(base, r);
      const items = orden.map(q => {
        let perm = q.opciones.map((_, i) => i);
        if (mi > 0 && cfg.barajarOpciones && !q.ordenFijo) perm = shuffle(perm, r);
        const opciones = perm.map(i => q.opciones[i]);
        const correcta = [...q.correcta].map(L => LET[perm.indexOf(LET.indexOf(L))]).filter(Boolean).sort().join('');
        return Object.assign({}, q, { opciones, correcta });
      });
      return { nombre, items };
    });
  }

  const nOpciones = items => Math.max(2, ...items.map(q => q.opciones.length));
  function penalizacion(cfg, nopt) { return cfg.fallos === 'auto' ? 1 / Math.max(1, nopt - 1) : (typeof cfg.fallos === 'number' ? cfg.fallos : 0); }
  function textoObservaciones(cfg, n, nopt) {
    if (cfg.observaciones) return cfg.observaciones;
    const v = cfg.nota / n, pen = penalizacion(cfg, nopt);
    return `${n} preguntas · Acierto: +${fmt(v)} · Error: ${pen ? '−' + fmt(v * pen) : '0'} · En blanco: 0`;
  }

  /* ---------- texto con fórmulas → runs de Word ----------
     `CH3COOH` entre acentos graves: los números tras letra o paréntesis van en subíndice.
     ^ sube a superíndice lo que sigue (10^-3, `SO4^2-`, `Fe^3+`); _ baja a subíndice (v_0). */
  function trozos(texto) {
    const out = [], partes = String(texto).split('`');
    partes.forEach((p, i) => {
      const formula = i % 2 === 1;
      const re = /\^\{([^}]*)\}|\^([0-9+\-−·]+)|_\{([^}]*)\}|_([0-9A-Za-z]+)/g;
      let last = 0, m;
      const llano = t => {
        if (!t) return;
        if (!formula) { out.push({ t }); return; }
        t.split(/((?<=[A-Za-z\)\]])\d+)/).forEach(s => { if (s) out.push({ t: s, sub: /^\d+$/.test(s) }); });
      };
      while ((m = re.exec(p))) {
        llano(p.slice(last, m.index));
        if (m[1] != null || m[2] != null) out.push({ t: (m[1] != null ? m[1] : m[2]).replace(/-/g, '−'), sup: true });
        else out.push({ t: m[3] != null ? m[3] : m[4], sub: true });
        last = re.lastIndex;
      }
      llano(p.slice(last));
    });
    return out;
  }
  function runs(texto, o) {
    o = o || {};
    return trozos(texto).map(tr => {
      let rpr = '<w:rFonts w:ascii="Arial Narrow" w:hAnsi="Arial Narrow"/>';
      if (o.b) rpr += '<w:b/>';
      if (o.i) rpr += '<w:i/>';
      if (o.rojo) rpr += '<w:color w:val="FF0000"/>';
      if (o.sz) rpr += `<w:sz w:val="${o.sz}"/><w:szCs w:val="${o.sz}"/>`;
      if (tr.sub) rpr += '<w:vertAlign w:val="subscript"/>';
      if (tr.sup) rpr += '<w:vertAlign w:val="superscript"/>';
      return `<w:r><w:rPr>${rpr}</w:rPr><w:t xml:space="preserve">${xmlEsc(tr.t)}</w:t></w:r>`;
    }).join('');
  }
  const TAB = '<w:r><w:rPr><w:rFonts w:ascii="Arial Narrow" w:hAnsi="Arial Narrow"/></w:rPr><w:tab/></w:r>';

  function pPregunta(q, corregido, numId) {
    let r = runs(q.pregunta);
    if (corregido && q.origen) r += runs(`  [${q.origen.charAt(0).toUpperCase() + q.origen.slice(1)}]`, { rojo: true, sz: 18 });
    return `<w:p><w:pPr><w:pStyle w:val="Prrafodelista"/><w:keepNext/><w:keepLines/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr><w:spacing w:before="200" w:after="60" w:line="264" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr>${r}</w:p>`;
  }
  function pOpcion(L, texto, ultima, marca) {
    const o = marca ? { rojo: true, b: true } : {};
    return `<w:p><w:pPr><w:pStyle w:val="Prrafodelista"/>${ultima ? '' : '<w:keepNext/>'}<w:keepLines/><w:tabs><w:tab w:val="left" w:pos="992"/></w:tabs><w:spacing w:after="20" w:line="252" w:lineRule="auto"/><w:ind w:left="992" w:hanging="425"/><w:jc w:val="both"/></w:pPr>${runs(L + ')', o)}${TAB}${runs(texto, o)}</w:p>`;
  }
  const pTexto = (texto, o, extra) => `<w:p><w:pPr><w:pStyle w:val="Prrafodelista"/><w:spacing w:before="40" w:after="40" w:line="252" w:lineRule="auto"/>${extra || '<w:ind w:left="992"/>'}<w:jc w:val="both"/></w:pPr>${runs(texto, o)}</w:p>`;

  function celda(texto, ancho, o) {
    return `<w:tc><w:tcPr><w:tcW w:w="${ancho}" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:spacing w:before="40" w:after="40"/><w:jc w:val="center"/></w:pPr>${texto ? runs(texto, o) : ''}</w:p></w:tc>`;
  }
  // Tabla de respuestas: filas de 10 preguntas (número arriba, casilla abajo)
  function tablaRespuestas(n, clave) {
    const ancho = 1030, borde = '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(b => `<w:${b} w:val="single" w:sz="6" w:space="0" w:color="000000"/>`).join('') + '</w:tblBorders>';
    let filas = '';
    for (let i = 0; i < n; i += 10) {
      const nums = [], cas = [];
      for (let j = i; j < i + 10; j++) {
        nums.push(celda(j < n ? String(j + 1) : '', ancho, { b: true, sz: 20 }));
        cas.push(celda(clave && j < n ? clave[j] : '', ancho, clave ? { rojo: true, b: true } : {}));
      }
      filas += `<w:tr><w:trPr><w:cantSplit/></w:trPr>${nums.join('')}</w:tr><w:tr><w:trPr><w:cantSplit/><w:trHeight w:val="480"/></w:trPr>${cas.join('')}</w:tr>`;
    }
    const tit = clave ? runs('Clave de respuestas', { b: true, rojo: true }) : runs('Hoja de respuestas', { b: true }) + runs('  (escribe la letra de tu respuesta)', { i: true, sz: 20 });
    return `<w:p><w:pPr><w:keepNext/><w:spacing w:before="360" w:after="120"/></w:pPr>${tit}</w:p>` +
      `<w:tbl><w:tblPr><w:tblW w:w="${ancho * 10}" w:type="dxa"/><w:jc w:val="center"/>${borde}<w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${'<w:gridCol w:w="' + ancho + '"/>'.repeat(10)}</w:tblGrid>${filas}</w:tbl><w:p/>`;
  }

  // Sustituye el texto del párrafo que contiene `marca`, conservando el formato de su primer trozo.
  function cambiarParrafo(xml, marca, texto) {
    const idx = xml.indexOf(marca);
    if (idx < 0) return xml;
    const ini = Math.max(xml.lastIndexOf('<w:p ', idx), xml.lastIndexOf('<w:p>', idx));
    const fin = xml.indexOf('</w:p>', idx) + 6;
    const p = xml.slice(ini, fin);
    const abre = p.match(/^<w:p\b[^>]*>/)[0];
    const ppr = (p.match(/<w:pPr>[\s\S]*?<\/w:pPr>/) || [''])[0];
    const resto = p.slice(abre.length + ppr.length);
    const rpr = (resto.match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || [''])[0];
    const lineas = String(texto).split('\n').map(l => `<w:t xml:space="preserve">${xmlEsc(l)}</w:t>`).join('<w:br/>');
    return xml.slice(0, ini) + abre + ppr + `<w:r>${rpr}${lineas}</w:r></w:p>` + xml.slice(fin);
  }

  // xml = word/document.xml de la plantilla del colegio. Devuelve el nuevo document.xml.
  function documento(xml, cfg, modelo, corregido, numId) {
    numId = numId || NUM_ID;
    const n = modelo.items.length, nopt = nOpciones(modelo.items);
    const modeloTxt = cfg.modelos.length > 1 ? ` · Modelo ${modelo.nombre}` : '';
    const contenido = `Contenido: ${cfg.contenido || ''} · Tipo test${modeloTxt}`;
    const iA = xml.indexOf('Área:'), finA = xml.indexOf('</w:p>', iA);
    if (iA >= 0 && xml.slice(iA, finA).includes('Contenido:')) xml = cambiarParrafo(xml, 'Área:', `Área: ${cfg.area || ''}\n${contenido}`); // plantilla en blanco
    else { xml = cambiarParrafo(xml, 'Área:', `Área: ${cfg.area || ''}`); xml = cambiarParrafo(xml, 'Contenido:', contenido); }
    xml = cambiarParrafo(xml, 'Curso:', `Curso: ${cfg.curso || ''}   nº:`);
    const obs = textoObservaciones(cfg, n, nopt);
    if (xml.includes('Todas las pregunta')) xml = cambiarParrafo(xml, 'Todas las pregunta', obs);
    else xml = cambiarParrafo(xml, 'Observaciones:', `Observaciones: ${obs}`);
    const finTabla = xml.indexOf('</w:tbl>') + 8;
    const sect = xml.lastIndexOf('<w:sectPr');
    let cuerpo = '<w:p/>';
    modelo.items.forEach(q => {
      cuerpo += pPregunta(q, corregido, numId);
      q.opciones.forEach((t, i) => cuerpo += pOpcion(LET[i], t, i === q.opciones.length - 1, corregido && q.correcta.includes(LET[i])));
      if (corregido && q.explicacion) cuerpo += pTexto(q.explicacion, { rojo: true, i: true, sz: 20 });
    });
    if (cfg.hojaRespuestas || corregido) cuerpo += tablaRespuestas(n, corregido ? modelo.items.map(q => q.correcta) : null);
    return xml.slice(0, finTabla) + cuerpo + xml.slice(sect);
  }

  // Añade a numbering.xml una lista «1.» propia (vale para cualquier plantilla). Devuelve { xml, numId }.
  const NUM_ID = 9001;
  function numeracion(numXml) {
    if (!numXml) throw new Error('La plantilla de Word no tiene numeración (numbering.xml).');
    if (numXml.includes(`w:numId="${NUM_ID}"`)) return { xml: numXml, numId: NUM_ID };
    const abs = `<w:abstractNum w:abstractNumId="${NUM_ID}"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="567" w:hanging="425"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial Narrow" w:hAnsi="Arial Narrow"/><w:b/></w:rPr></w:lvl></w:abstractNum>`;
    const num = `<w:num w:numId="${NUM_ID}"><w:abstractNumId w:val="${NUM_ID}"/></w:num>`;
    let x = numXml;
    const iNum = x.search(/<w:num\s/);
    x = iNum >= 0 ? x.slice(0, iNum) + abs + x.slice(iNum) : x.replace('</w:numbering>', abs + '</w:numbering>');
    x = x.replace('</w:numbering>', num + '</w:numbering>');
    return { xml: x, numId: NUM_ID };
  }

  /* ---------- clave para el Corrector (misma plantilla que «Descargar plantilla de clave») ---------- */
  function filasClave(modelo) {
    const nopt = nOpciones(modelo.items);
    const h = ['Nº', 'Respuesta correcta', 'Puntos', 'Anulada', 'Enunciado'].concat(LET.slice(0, nopt).split(''));
    return [h].concat(modelo.items.map((q, i) => [i + 1, q.correcta, 1, '', q.pregunta.replace(/`/g, '')].concat(LET.slice(0, nopt).split('').map((_, j) => (q.opciones[j] || '').replace(/`/g, '')))));
  }
  // Estado del examen tal como lo guarda el Corrector (para abrirlo directamente)
  function examenCorrector(cfg, modelo) {
    const nopt = nOpciones(modelo.items);
    const pen = cfg.fallos === 'auto' ? 'auto' : (typeof cfg.fallos === 'number' ? 'custom' : 'none');
    return {
      title: [cfg.contenido, cfg.modelos.length > 1 ? 'Modelo ' + modelo.nombre : ''].filter(Boolean).join(' · '),
      group: [cfg.area, cfg.curso].filter(Boolean).join(' - '), nq: modelo.items.length, nopt, scale: cfg.nota,
      penMode: pen, penVal: typeof cfg.fallos === 'number' ? cfg.fallos : 0.25,
      key: modelo.items.map(q => ({ a: q.correcta, x: false, p: 1, t: q.pregunta.replace(/`/g, ''), o: Object.fromEntries(q.opciones.map((t, j) => [LET[j], t.replace(/`/g, '')])) }))
    };
  }

  /* ---------- Excel de salida (para guardar lo importado o lo generado) ---------- */
  function filasExcel(cfg, preguntas) {
    const nopt = Math.max(4, ...preguntas.map(q => q.opciones.length));
    const conf = [['Campo', 'Valor'], ['Área', cfg.area], ['Contenido', cfg.contenido], ['Curso', cfg.curso], ['Modelos', cfg.modelos.join(', ')],
      ['Barajar preguntas', cfg.barajarPreguntas ? 'sí' : 'no'], ['Barajar opciones', cfg.barajarOpciones ? 'sí' : 'no'], ['Nota máxima', cfg.nota],
      ['Fallos restan', cfg.fallos === 'auto' ? '1/(n-1)' : cfg.fallos === 'no' ? 'no' : cfg.fallos], ['Observaciones', cfg.observaciones],
      ['Hoja de respuestas en el examen', cfg.hojaRespuestas ? 'sí' : 'no'], ['Nº de preguntas', cfg.numPreguntas || ''], ['Semilla', cfg.semilla]];
    const h = ['Nº', 'Pregunta'].concat(LET.slice(0, nopt).split('')).concat(['Correcta', 'Nivel', 'Apartado', 'Origen', 'Explicación', 'Orden fijo']);
    const pr = [h].concat(preguntas.map((q, i) => [i + 1, q.pregunta].concat(LET.slice(0, nopt).split('').map((_, j) => q.opciones[j] || ''))
      .concat([q.correcta, q.nivel || '', q.apartado || '', q.origen || '', q.explicacion || '', q.ordenFijo ? 'sí' : ''])));
    return { conf, pr, nopt };
  }

  /* ---------- importar un examen hecho ---------- */
  // Texto plano (PDF o Word): «1. Enunciado», «a) opción»; correcta marcada con *, ✓, (correcta) o una línea «Respuesta: B»,
  // o una clave al final del tipo «1-B 2-C …» / «Soluciones: BCAD…».
  function importarTexto(texto, marcas) {
    const lineas = String(texto).split(/\r?\n/).map((l, i) => ({ l: l.replace(/\s+/g, ' ').trim(), m: marcas ? marcas[i] : null })).filter(x => x.l);
    const qs = []; let cur = null, ultima = null, enClave = false; const claveTxt = [];
    const reQ = /^(?:pregunta\s*)?(\d{1,3})\s*[.)\-–:]\s*(.+)$/i, reO = /^\(?([A-Ha-h])\s*[.)\]]\s*(.*)$/;
    const reR = /^(?:respuesta(?:\s+correcta)?|soluci[oó]n|correcta)\s*[:=\-]?\s*\(?([A-Ha-h])\)?(?:\s|$|[.)])/i;
    const reClave = /^(clave|soluciones|respuestas correctas|plantilla de respuestas|hoja de soluciones)\b[:\s]*/i;
    const marca = s => { let ok = false; s = s.replace(/^\s*[*✓✔☑]\s*|\s*[*✓✔☑]\s*$/g, () => { ok = true; return ''; }).replace(/\s*\((?:correcta|x|ok)\)\s*$/i, () => { ok = true; return ''; }).replace(/^\[x\]\s*/i, () => { ok = true; return ''; }); return [s.trim(), ok]; };
    for (const { l, m: mk } of lineas) {
      let m;
      if (enClave) { claveTxt.push(l); continue; }
      if (reClave.test(l) && (qs.length >= 2)) { enClave = true; claveTxt.push(l.replace(reClave, '')); continue; }
      if ((m = l.match(reR)) && cur) { cur.correcta = m[1].toUpperCase(); ultima = null; continue; }
      if ((m = l.match(reO)) && cur && (m[2] || '').length && (m[1] === m[1].toUpperCase() ? true : true)) {
        const L = m[1].toUpperCase(), esperado = LET[cur.opciones.length];
        if (L === esperado) { const [t, ok] = marca(m[2]); cur.opciones.push(t); if (ok || mk) cur.correcta = (cur.correcta || '') + L; ultima = L; continue; }
      }
      if ((m = l.match(reQ)) && (!cur || +m[1] === cur.n + 1 || cur.opciones.length >= 2)) {
        cur = { n: +m[1], pregunta: m[2], opciones: [], correcta: '' }; qs.push(cur); ultima = null; continue;
      }
      if (cur) { if (ultima) cur.opciones[cur.opciones.length - 1] += ' ' + l; else if (!cur.opciones.length) cur.pregunta += ' ' + l; }
    }
    // clave al final
    if (claveTxt.length) {
      const t = claveTxt.join(' ');
      const pares = [...t.matchAll(/(\d{1,3})\s*[-.):=]?\s*([A-Ha-h])(?![A-Za-z])/g)];
      if (pares.length) pares.forEach(p => { const q = qs.find(x => x.n === +p[1]); if (q && !q.correcta) q.correcta = p[2].toUpperCase(); });
      else { const ls = t.toUpperCase().replace(/[^A-H]/g, ''); qs.forEach((q, i) => { if (!q.correcta && ls[i]) q.correcta = ls[i]; }); }
    }
    return qs.filter(q => q.opciones.length >= 2).map(q => ({ pregunta: q.pregunta.trim(), opciones: q.opciones.map(o => o.trim()), correcta: letters(q.correcta), nivel: '', apartado: '', origen: '', explicacion: '', ordenFijo: false }));
  }

  // Word (.docx): document.xml → líneas de texto con la numeración automática y las marcas de formato
  // (texto en color, resaltado o en negrita cuando el resto de opciones no lo está) para detectar la correcta.
  function lineasDocx(xml) {
    xml = xml.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/, m => /Alumno|NOTA|Curso/i.test(m) ? '' : m); // fuera la cabecera
    const parrafos = xml.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>|<w:p\b[^>]*\/>/g) || [];
    const cont = {}; const out = [];
    parrafos.forEach(p => {
      const ilvl = (p.match(/<w:ilvl w:val="(\d+)"/) || [])[1];
      const numId = (p.match(/<w:numId w:val="(\d+)"/) || [])[1];
      let texto = '', marcado = 0, total = 0, negrita = 0;
      (p.match(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/g) || []).forEach(r => {
        const t = (r.match(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g) || []).map(x => x.replace(/<[^>]+>/g, '')).join('') + (/<w:tab\/>/.test(r) ? ' ' : '');
        const tt = t.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
        const rpr = (r.match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || [''])[0];
        const col = (rpr.match(/<w:color w:val="([0-9A-Fa-f]{6}|auto)"/) || [])[1];
        const color = col && col !== 'auto' && !/^(000000|0D0D0D|1A1A1A|262626|404040|595959|7F7F7F)$/i.test(col);
        const hl = /<w:highlight /.test(rpr) || /<w:shd [^>]*w:fill="(?!auto|FFFFFF)/i.test(rpr);
        const b = /<w:b\/>|<w:b w:val="(1|true)"/.test(rpr);
        const vis = tt.replace(/\s/g, '').length;
        texto += /<w:vertAlign w:val="subscript"/.test(rpr) ? tt : tt; total += vis;
        if (color || hl) marcado += vis; if (b) negrita += vis;
      });
      texto = texto.replace(/\s+/g, ' ').trim();
      if (!texto) return;
      let pre = '';
      if (ilvl != null && numId && numId !== '0') {
        const k = numId + ':' + ilvl; cont[k] = (cont[k] || 0) + 1;
        if (+ilvl === 0) { Object.keys(cont).forEach(x => { if (x.startsWith(numId + ':') && x !== k) cont[x] = 0; }); pre = cont[k] + '. '; }
        else pre = 'abcdefgh'[(cont[k] - 1) % 8] + ') ';
      }
      out.push({ texto: pre + texto, marcado: total && marcado / total > 0.5, negrita: total && negrita / total > 0.6 });
    });
    return out;
  }
  function importarDocx(xml) {
    const ls = lineasDocx(xml);
    // la negrita solo cuenta como marca si dentro de una pregunta es la única opción en negrita
    const qs = importarTexto(ls.map(x => x.texto).join('\n'), ls.map(x => x.marcado));
    if (qs.some(q => q.correcta)) return qs;
    const negr = ls.map(x => x.negrita);
    const qs2 = importarTexto(ls.map(x => x.texto).join('\n'), negr);
    return qs2.map(q => (q.correcta.length === 1 ? q : Object.assign(q, { correcta: '' })));
  }

  return { LET, DEF, fold, numeracion, leerConfig, leerPreguntas, validar, componer, nOpciones, documento, filasClave, examenCorrector, filasExcel, importarTexto, importarDocx, lineasDocx, textoObservaciones, trozos, parseFallos };
});
