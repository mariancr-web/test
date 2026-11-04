/**
 * Volcar a Google Classroom las notas y los informes del Corrector de test (test.mariancr.es).
 *
 * Va pegado en una hoja de cálculo de Google (Extensiones → Apps Script) y necesita
 * el servicio avanzado «Google Classroom API» (Servicios → +). Ver «LEEME Classroom.md».
 *
 * Qué hace, con el menú «Classroom»:
 *  1. «Cargar mis clases»: rellena la lista de clases de la hoja «Configuración».
 *  2. «Comprobar alumnos»: empareja los nombres de la hoja «Notas» con los alumnos de la clase
 *     y busca el informe (PDF) de cada uno en la carpeta de Drive. No cambia nada en Classroom.
 *  3. «Crear tarea y poner notas»: crea la tarea, adjunta a cada alumno el enlace a SU informe,
 *     le pone la nota (borrador o devuelta) y comparte el PDF solo con él.
 */

const HOJA_CONFIG = 'Configuración';
const HOJA_NOTAS = 'Notas';
const HOJA_CLASES = 'Clases';

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Classroom')
    .addItem('1. Cargar mis clases', 'cargarClases')
    .addItem('2. Comprobar alumnos', 'comprobar')
    .addItem('3. Crear tarea y poner notas', 'crearTareaYNotas')
    .addSeparator()
    .addItem('Preparar la hoja', 'prepararHoja')
    .addToUi();
}

/* ---------------- hoja ---------------- */
function prepararHoja() {
  const ss = SpreadsheetApp.getActive();
  let c = ss.getSheetByName(HOJA_CONFIG) || ss.insertSheet(HOJA_CONFIG, 0);
  if (!c.getRange('A1').getValue()) {
    c.getRange('A1:B8').setValues([
      ['Campo', 'Valor'],
      ['Clase', ''],
      ['Título de la tarea', 'Test · Tema 1'],
      ['Instrucciones', 'Tienes adjunto tu informe de corrección.'],
      ['Nota máxima', 10],
      ['Carpeta de informes (enlace de Drive)', ''],
      ['Al terminar', 'Dejar las notas como borrador'],
      ['Tema de Classroom (opcional)', ''],
    ]);
    c.getRange('A1:B1').setFontWeight('bold');
    c.setColumnWidth(1, 260); c.setColumnWidth(2, 420);
    c.getRange('B7').setDataValidation(SpreadsheetApp.newDataValidation()
      .requireValueInList(['Dejar las notas como borrador', 'Devolver a los alumnos'], true).build());
  }
  let n = ss.getSheetByName(HOJA_NOTAS) || ss.insertSheet(HOJA_NOTAS, 1);
  if (!n.getRange('A1').getValue()) {
    n.getRange('A1:B1').setValues([['Alumno', 'Nota']]).setFontWeight('bold');
    n.getRange('D1').setValue('Pega aquí las columnas «Alumno» y «Nota» del Excel de notas del Corrector (desde la fila 2).');
    n.setColumnWidth(1, 300);
  }
  SpreadsheetApp.getUi().alert('Hoja preparada. Ahora: menú Classroom → 1. Cargar mis clases.');
}

function config_() {
  const v = SpreadsheetApp.getActive().getSheetByName(HOJA_CONFIG).getRange('A2:B8').getValues();
  const g = i => String(v[i][1] || '').trim();
  const max = Number(String(v[3][1]).replace(',', '.')) || 10;
  return { clase: g(0), titulo: g(1), instrucciones: g(2), max, carpeta: g(4), devolver: /devolver/i.test(g(5)), tema: g(6) };
}

/* ---------------- 1. clases ---------------- */
function cargarClases() {
  prepararHoja_silencio_();
  const cursos = listar_(t => Classroom.Courses.list({ teacherId: 'me', courseStates: ['ACTIVE'], pageToken: t }), 'courses');
  if (!cursos.length) { SpreadsheetApp.getUi().alert('No encuentro clases activas en las que seas profesora.'); return; }
  const ss = SpreadsheetApp.getActive();
  const h = ss.getSheetByName(HOJA_CLASES) || ss.insertSheet(HOJA_CLASES);
  h.clear(); h.getRange(1, 1, 1, 2).setValues([['Clase', 'Id']]).setFontWeight('bold');
  const filas = cursos.map(c => [c.name + (c.section ? ' · ' + c.section : ''), c.id]);
  h.getRange(2, 1, filas.length, 2).setValues(filas);
  const c = ss.getSheetByName(HOJA_CONFIG);
  c.getRange('B2').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInRange(h.getRange(2, 1, filas.length, 1), true).build());
  ss.setActiveSheet(c); c.getRange('B2').activate();
  SpreadsheetApp.getUi().alert(cursos.length + ' clases cargadas. Elige la clase en «Configuración» (celda B2).');
}
function prepararHoja_silencio_() {
  const ss = SpreadsheetApp.getActive();
  if (!ss.getSheetByName(HOJA_CONFIG) || !ss.getSheetByName(HOJA_NOTAS)) prepararHoja();
}
function idClase_(nombre) {
  const h = SpreadsheetApp.getActive().getSheetByName(HOJA_CLASES);
  if (!h || h.getLastRow() < 2) throw new Error('Primero: menú Classroom → 1. Cargar mis clases.');
  const f = h.getRange(2, 1, h.getLastRow() - 1, 2).getValues().find(r => r[0] === nombre);
  if (!f) throw new Error('Elige la clase en «Configuración» (celda B2).');
  return String(f[1]);
}

/* ---------------- emparejar ---------------- */
const fold_ = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-zñ ]/g, ' ').replace(/\s+/g, ' ').trim();
const palabras_ = s => fold_(s).split(' ').filter(w => w.length > 1 && !['de', 'del', 'la', 'las', 'los', 'y'].includes(w));
function parecido_(a, b) { // 0..1, independiente del orden «Apellidos, Nombre» / «Nombre Apellidos»
  const A = new Set(palabras_(a)), B = new Set(palabras_(b));
  if (!A.size || !B.size) return 0;
  let c = 0; A.forEach(w => { if (B.has(w)) c++; });
  return c / Math.max(A.size, B.size);
}

function emparejar_() {
  const cfg = config_();
  const curso = idClase_(cfg.clase);
  const alumnos = listar_(t => Classroom.Courses.Students.list(curso, { pageToken: t }), 'students')
    .map(s => ({ id: s.userId, nombre: s.profile.name.fullName, email: s.profile.emailAddress || '' }));
  const h = SpreadsheetApp.getActive().getSheetByName(HOJA_NOTAS);
  const filas = h.getLastRow() < 2 ? [] : h.getRange(2, 1, h.getLastRow() - 1, 2).getValues().filter(r => String(r[0]).trim());
  // informes de la carpeta
  const pdfs = [];
  if (cfg.carpeta) {
    const m = cfg.carpeta.match(/[-\w]{25,}/);
    if (!m) throw new Error('El enlace de la carpeta de informes no es válido.');
    const it = DriveApp.getFolderById(m[0]).getFiles();
    while (it.hasNext()) { const f = it.next(); if (/pdf$/i.test(f.getMimeType()) || /\.pdf$/i.test(f.getName())) pdfs.push(f); }
  }
  const usados = new Set();
  const res = filas.map(([nombre, nota]) => {
    let mejor = null, p = 0;
    alumnos.forEach(a => { const v = parecido_(nombre, a.nombre); if (v > p) { p = v; mejor = a; } });
    const al = p >= 0.6 && !usados.has(mejor.id) ? mejor : null;
    if (al) usados.add(al.id);
    let pdf = null, pp = 0;
    pdfs.forEach(f => { const v = parecido_(f.getName().replace(/\.pdf$/i, ''), nombre); if (v > pp) { pp = v; pdf = f; } });
    if (pp < 0.6) pdf = null;
    const n = Number(String(nota).replace(',', '.'));
    return { nombre, nota: isFinite(n) && String(nota) !== '' ? n : null, alumno: al, pdf };
  });
  const sinHoja = alumnos.filter(a => !usados.has(a.id));
  return { cfg, curso, res, sinHoja };
}

/* ---------------- 2. comprobar ---------------- */
function comprobar() {
  const { res, sinHoja } = emparejar_();
  const h = SpreadsheetApp.getActive().getSheetByName(HOJA_NOTAS);
  h.getRange(1, 3, 1, 3).setValues([['Alumno en Classroom', 'Informe encontrado', '']]).setFontWeight('bold');
  if (res.length) h.getRange(2, 3, res.length, 2).setValues(res.map(r => [r.alumno ? r.alumno.nombre : '⚠ NO ENCONTRADO', r.pdf ? r.pdf.getName() : '— sin informe']));
  const mal = res.filter(r => !r.alumno).length, sinPdf = res.filter(r => !r.pdf).length, sinNota = res.filter(r => r.nota == null).length;
  SpreadsheetApp.getUi().alert(
    `${res.length} filas en «Notas».\n` +
    `${res.length - mal} emparejadas con alumnos de la clase` + (mal ? `, ${mal} sin emparejar (revisa la columna C).` : '.') + '\n' +
    (sinPdf ? `${sinPdf} sin informe en la carpeta.\n` : 'Todos con informe.\n') +
    (sinNota ? `${sinNota} sin nota (no se les pondrá).\n` : '') +
    (sinHoja.length ? `En Classroom pero no en la hoja: ${sinHoja.map(a => a.nombre).join(', ')}.` : ''));
}

/* ---------------- 3. crear tarea y notas ---------------- */
function crearTareaYNotas() {
  const ui = SpreadsheetApp.getUi();
  const { cfg, curso, res } = emparejar_();
  const ok = res.filter(r => r.alumno && r.nota != null);
  if (!ok.length) { ui.alert('No hay alumnos emparejados con nota. Usa antes «2. Comprobar alumnos».'); return; }
  if (ui.alert(`Se creará la tarea «${cfg.titulo}» en ${cfg.clase} y se pondrá nota a ${ok.length} alumnos` +
    (cfg.devolver ? ' (y se les devolverá)' : ' (como borrador)') + '. ¿Seguir?', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;

  const tw = { title: cfg.titulo, description: cfg.instrucciones, workType: 'ASSIGNMENT', state: 'PUBLISHED', maxPoints: cfg.max };
  if (cfg.tema) {
    const temas = listar_(t => Classroom.Courses.Topics.list(curso, { pageToken: t }), 'topic');
    const t = temas.find(x => fold_(x.name) === fold_(cfg.tema));
    if (t) tw.topicId = t.topicId;
  }
  const tarea = Classroom.Courses.CourseWork.create(tw, curso);
  const subs = listar_(t => Classroom.Courses.CourseWork.StudentSubmissions.list(curso, tarea.id, { pageToken: t }), 'studentSubmissions');
  const porAlumno = {}; subs.forEach(s => { porAlumno[s.userId] = s; });

  const log = [];
  ok.forEach(r => {
    const s = porAlumno[r.alumno.id]; if (!s) { log.push(`${r.nombre}: sin entrega en la tarea`); return; }
    // informe: compartir solo con el alumno y adjuntar el enlace a su entrega
    if (r.pdf) {
      try { if (r.alumno.email) r.pdf.addViewer(r.alumno.email); } catch (e) { log.push(`${r.nombre}: no se pudo compartir el PDF (${e.message})`); }
      try {
        Classroom.Courses.CourseWork.StudentSubmissions.modifyAttachments(
          { addAttachments: [{ link: { url: r.pdf.getUrl() } }] }, curso, tarea.id, s.id);
      } catch (e) { log.push(`${r.nombre}: enlace no adjuntado (${e.message}); el PDF está compartido con su cuenta.`); }
    }
    // nota
    const nota = Math.round(Math.max(0, Math.min(cfg.max, r.nota)) * 100) / 100;
    const campos = cfg.devolver ? 'draftGrade,assignedGrade' : 'draftGrade';
    Classroom.Courses.CourseWork.StudentSubmissions.patch({ draftGrade: nota, assignedGrade: nota }, curso, tarea.id, s.id, { updateMask: campos });
    if (cfg.devolver) { try { Classroom.Courses.CourseWork.StudentSubmissions.return_({}, curso, tarea.id, s.id); } catch (e) { log.push(`${r.nombre}: no se pudo devolver (${e.message})`); } }
  });
  ui.alert(`Tarea creada: ${tarea.alternateLink}\n${ok.length} notas puestas.` + (log.length ? '\n\nAvisos:\n' + log.join('\n') : ''));
}

/* ---------------- util ---------------- */
function listar_(fn, campo) {
  const out = []; let t;
  do { const r = fn(t); (r[campo] || []).forEach(x => out.push(x)); t = r.nextPageToken; } while (t);
  return out;
}
