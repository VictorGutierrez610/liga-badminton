export const APPS_SCRIPT_CODE = `// =====================================================================
//  LIGA DE BADMINTON DE LOS VIERNES - BACKEND COMPLETO (Codigo.gs)
//  Hoja de Calculo ID: 1wjKLBnakvjzdUmiio_BqTRSpP9Q9TONOmX37PwsbdtI
//
//  PESTANAS NECESARIAS EN LA HOJA DE CALCULO:
//    - Socios       -> ID | Nombre | Apellidos | Categoria | Sexo
//    - Jornadas     -> ID | Fecha | Modalidad | Formato | Desde | PuntosSet | GanarPor2 | Estado
//    - Inscritos    -> JornadaID | Categoria | ParticipanteID | IDs | Nombres
//    - Competiciones-> JornadaID | Categoria | Sistema | Grupos | Clasifican
//    - Partidos     -> ID | JornadaID | Fecha | Categoria | Ronda | Grupo | Orden |
//                     Estado | IdsA | NomA | IdsB | NomB | Sets | Ganador
// =====================================================================

const SHEET_ID = '1wjKLBnakvjzdUmiio_BqTRSpP9Q9TONOmX37PwsbdtI';
const PIN_ADMIN = ''; // Deja vacio para usar el mismo PIN que configuraste en la app

function doPost(e) {
  try {
    const request = JSON.parse(e.postData.contents);
    const action  = request.action;
    const pin     = request.pin || '';

    if (PIN_ADMIN && String(pin) !== String(PIN_ADMIN)) {
      return responseJSON({ error: 'PIN de administracion incorrecto.' });
    }

    let result = null;

    if      (action === 'getSocios')               result = getSocios();
    else if (action === 'getJornadas')             result = getJornadas();
    else if (action === 'crearJornada')            result = crearJornada(request.jornada);
    else if (action === 'guardarJornadaDefinitiva')result = guardarJornadaDefinitiva(request.idJornada);
    else if (action === 'borrarJornada')           result = borrarJornada(request.idJornada);
    else if (action === 'anadirInscrito')          result = anadirInscrito(request.idJornada, request.categoria, request.ids, request.nombres);
    else if (action === 'quitarInscrito')          result = quitarInscrito(request.idJornada, request.categoria, request.idPart);
    else if (action === 'crearCompeticion')        result = crearCompeticion(request.idJornada, request.categoria, request.cfg, request.partidos);
    else if (action === 'borrarCompeticion')       result = borrarCompeticion(request.idJornada, request.categoria);
    else if (action === 'guardarResultado')        result = guardarResultado(request.idPartido, request.sets, request.ganador);
    else if (action === 'borrarResultado')         result = borrarResultado(request.idPartido);
    else if (action === 'syncAll')                 result = syncAll(request.data);
    else return responseJSON({ error: 'Accion no valida: ' + action });

    return responseJSON({ success: true, result });
  } catch (err) {
    return responseJSON({ error: err.message || String(err) });
  }
}

function doGet(e) {
  return HtmlService.createHtmlOutput('<h1>Servidor Liga Badminton activo</h1>');
}

function responseJSON(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── UTILIDADES DE HOJA ─────────────────────────────────────────────

function getOrCreateSheet(name, headers) {
  const doc = SpreadsheetApp.openById(SHEET_ID);
  let sheet = doc.getSheetByName(name);
  if (!sheet) {
    sheet = doc.insertSheet(name);
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  }
  return sheet;
}

function sheetRows(sheet) {
  return sheet.getDataRange().getValues().slice(1);
}

// ─── SOCIOS (lectura) ────────────────────────────────────────────────

function getSocios() {
  const sheet = getOrCreateSheet('Socios', ['ID','Nombre','Apellidos','Categoria','Sexo']);
  return sheetRows(sheet).filter(r => r[0])
    .map(r => ({ id: String(r[0]), nombre: r[1], apellidos: r[2], categoria: r[3], sexo: r[4] }));
}

// ─── JORNADAS ────────────────────────────────────────────────────────

function getJornadas() {
  const sheet = getOrCreateSheet('Jornadas',
    ['ID','Fecha','Modalidad','Formato','Desde','PuntosSet','GanarPor2','Estado']);
  return sheetRows(sheet).filter(r => r[0]).map(r => ({
    id: String(r[0]), fecha: r[1], modalidad: r[2], formato: r[3], desde: r[4],
    puntosSet: Number(r[5]) || 15,
    ganarPor2: r[6] === true || r[6] === 'VERDADERO' || r[6] === 'TRUE',
    definitiva: r[7] === 'Definitiva', partidos: 0
  }));
}

function crearJornada(j) {
  const sheet = getOrCreateSheet('Jornadas',
    ['ID','Fecha','Modalidad','Formato','Desde','PuntosSet','GanarPor2','Estado']);
  if (sheetRows(sheet).some(r => String(r[0]) === String(j.id)))
    throw new Error('Ya existe una jornada con ese ID.');
  sheet.appendRow([j.id, j.fecha, j.modalidad, j.formato, j.desde||'', j.puntosSet||15, j.ganarPor2||false, 'En Curso']);
  return j;
}

function guardarJornadaDefinitiva(idJornada) {
  const sheet = getOrCreateSheet('Jornadas',
    ['ID','Fecha','Modalidad','Formato','Desde','PuntosSet','GanarPor2','Estado']);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(idJornada)) { sheet.getRange(i+1,8).setValue('Definitiva'); return true; }
  }
  throw new Error('Jornada no encontrada: ' + idJornada);
}

function borrarJornada(idJornada) {
  _delWhere('Jornadas',     ['ID','Fecha','Modalidad','Formato','Desde','PuntosSet','GanarPor2','Estado'], r => String(r[0])===String(idJornada));
  _delWhere('Inscritos',    ['JornadaID','Categoria','ParticipanteID','IDs','Nombres'],                   r => String(r[0])===String(idJornada));
  _delWhere('Competiciones',['JornadaID','Categoria','Sistema','Grupos','Clasifican'],                    r => String(r[0])===String(idJornada));
  _delWhere('Partidos',     _hP(),                                                                        r => String(r[1])===String(idJornada));
  return true;
}

// ─── INSCRIPCIONES ───────────────────────────────────────────────────

function anadirInscrito(idJornada, categoria, ids, nombres) {
  const sheet = getOrCreateSheet('Inscritos', ['JornadaID','Categoria','ParticipanteID','IDs','Nombres']);
  const partId = [...ids].sort((a,b)=>Number(a)-Number(b)).join('+');
  if (sheetRows(sheet).some(r=>String(r[0])===String(idJornada)&&r[1]===categoria&&String(r[2])===partId))
    throw new Error('Participante ya inscrito.');
  sheet.appendRow([idJornada, categoria, partId, ids.join('|'), (nombres||[]).join(' / ')]);
  return true;
}

function quitarInscrito(idJornada, categoria, idPart) {
  _delWhere('Inscritos', ['JornadaID','Categoria','ParticipanteID','IDs','Nombres'],
    r => String(r[0])===String(idJornada) && r[1]===categoria && String(r[2])===String(idPart));
  return true;
}

// ─── COMPETICION Y PARTIDOS ───────────────────────────────────────────

function _hP() {
  return ['ID','JornadaID','Fecha','Categoria','Ronda','Grupo','Orden',
          'Estado','IdsA','NomA','IdsB','NomB','Sets','Ganador'];
}

function crearCompeticion(idJornada, categoria, cfg, partidos) {
  const sC = getOrCreateSheet('Competiciones', ['JornadaID','Categoria','Sistema','Grupos','Clasifican']);
  if (sheetRows(sC).some(r=>String(r[0])===String(idJornada)&&r[1]===categoria))
    throw new Error('Ya existe una competicion para esa jornada/categoria.');
  sC.appendRow([idJornada, categoria, cfg.sistema, cfg.grupos||0, cfg.clasifican||0]);

  if (partidos && partidos.length > 0) {
    const sP = getOrCreateSheet('Partidos', _hP());
    partidos.forEach(p => sP.appendRow([
      p.id, p.jornada, p.fecha, p.categoria, p.ronda, p.grupo||'', p.orden||0,
      p.estado||'Pendiente',
      (p.idsA||[]).join('|'), (p.nomA||[]).join(' / '),
      (p.idsB||[]).join('|'), (p.nomB||[]).join(' / '),
      JSON.stringify(p.sets||[]), p.ganador||''
    ]));
  }
  return true;
}

function borrarCompeticion(idJornada, categoria) {
  _delWhere('Competiciones', ['JornadaID','Categoria','Sistema','Grupos','Clasifican'],
    r => String(r[0])===String(idJornada) && r[1]===categoria);
  _delWhere('Partidos', _hP(),
    r => String(r[1])===String(idJornada) && r[3]===categoria);
  return true;
}

function guardarResultado(idPartido, sets, ganador) {
  const sheet = getOrCreateSheet('Partidos', _hP());
  const data = sheet.getDataRange().getValues();
  for (let i=1; i<data.length; i++) {
    if (String(data[i][0])===String(idPartido)) {
      sheet.getRange(i+1,8).setValue('Jugado');
      sheet.getRange(i+1,13).setValue(JSON.stringify(sets));
      sheet.getRange(i+1,14).setValue(ganador||'');
      return true;
    }
  }
  throw new Error('Partido no encontrado: ' + idPartido);
}

function borrarResultado(idPartido) {
  const sheet = getOrCreateSheet('Partidos', _hP());
  const data = sheet.getDataRange().getValues();
  for (let i=1; i<data.length; i++) {
    if (String(data[i][0])===String(idPartido)) {
      sheet.getRange(i+1,8).setValue('Pendiente');
      sheet.getRange(i+1,13).setValue('[]');
      sheet.getRange(i+1,14).setValue('');
      return true;
    }
  }
  throw new Error('Partido no encontrado: ' + idPartido);
}

// ─── SYNC COMPLETO ───────────────────────────────────────────────────

function syncAll(data) {
  if (!data) throw new Error('Sin datos para sincronizar.');

  const sJ = getOrCreateSheet('Jornadas', ['ID','Fecha','Modalidad','Formato','Desde','PuntosSet','GanarPor2','Estado']);
  _clearRows(sJ);
  (data.jornadas||[]).forEach(j => sJ.appendRow([
    j.id, j.fecha, j.modalidad, j.formato, j.desde||'', j.puntosSet||15,
    j.ganarPor2||false, j.definitiva?'Definitiva':'En Curso'
  ]));

  const sI = getOrCreateSheet('Inscritos', ['JornadaID','Categoria','ParticipanteID','IDs','Nombres']);
  _clearRows(sI);
  Object.entries(data.inscritos||{}).forEach(([key, list]) => {
    const parts = key.split('_'); const jornadaId = parts[0]; const categoria = parts.slice(1).join('_');
    list.forEach(p => sI.appendRow([jornadaId, categoria, p.id, (p.ids||[]).join('|'), (p.nombres||[]).join(' / ')]));
  });

  const sC = getOrCreateSheet('Competiciones', ['JornadaID','Categoria','Sistema','Grupos','Clasifican']);
  _clearRows(sC);
  Object.entries(data.competiciones||{}).forEach(([key, comp]) => {
    const parts = key.split('_'); const jornadaId = parts[0]; const categoria = parts.slice(1).join('_');
    sC.appendRow([jornadaId, categoria, comp.sistema, comp.grupos||0, comp.clasifican||0]);
  });

  const sP = getOrCreateSheet('Partidos', _hP());
  _clearRows(sP);
  (data.partidos||[]).forEach(p => sP.appendRow([
    p.id, p.jornada, p.fecha, p.categoria, p.ronda, p.grupo||'', p.orden||0,
    p.estado||'Pendiente',
    (p.idsA||[]).join('|'), (p.nomA||[]).join(' / '),
    (p.idsB||[]).join('|'), (p.nomB||[]).join(' / '),
    JSON.stringify(p.sets||[]), p.ganador||''
  ]));

  return { jornadas: (data.jornadas||[]).length, partidos: (data.partidos||[]).length };
}

// ─── HELPERS ─────────────────────────────────────────────────────────

function _clearRows(sheet) {
  const last = sheet.getLastRow();
  if (last > 1) sheet.deleteRows(2, last - 1);
}

function _delWhere(name, headers, predFn) {
  const sheet = getOrCreateSheet(name, headers);
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (predFn(data[i])) sheet.deleteRow(i + 1);
  }
}
`;

