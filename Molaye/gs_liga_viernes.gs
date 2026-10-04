// =====================================================================
//  LIGA DE BÁDMINTON DE LOS VIERNES - BACKEND (Código.gs)
// =====================================================================

const SHEET_ID = '1wjKLBnakvjzdUmiio_BqTRSpP9Q9TONOmX37PwsbdtI';
const PIN_ADMIN = ''; // Opcional

function doPost(e) {
  try {
    const request = JSON.parse(e.postData.contents);
    const action = request.action;
    const pin = request.pin || '';
    
    if (PIN_ADMIN && String(pin) !== String(PIN_ADMIN)) {
      return responseJSON({ error: 'PIN de administración incorrecto.' });
    }

    let result = null;

    if (action === 'getSocios') result = getSocios();
    else if (action === 'getJornadas') result = getJornadas();
    else if (action === 'getAllData') result = getAllData();
    else if (action === 'crearJornada') result = crearJornada(request.jornada);
    else if (action === 'guardarJornadaDefinitiva') result = guardarJornadaDefinitiva(request.idJornada);
    else if (action === 'borrarJornada') result = borrarJornada(request.idJornada);
    else if (action === 'anadirInscrito') result = anadirInscrito(request.idJornada, request.categoria, request.ids, request.nombres);
    else if (action === 'quitarInscrito') result = quitarInscrito(request.idJornada, request.categoria, request.idPart);
    else if (action === 'crearCompeticion') result = crearCompeticion(request.idJornada, request.categoria, request.cfg, request.partidos);
    else if (action === 'borrarCompeticion') result = borrarCompeticion(request.idJornada, request.categoria);
    else if (action === 'guardarResultado') result = guardarResultado(request.idPartido, request.sets, request.ganador);
    else if (action === 'borrarResultado') result = borrarResultado(request.idPartido);
    else if (action === 'syncAll') result = syncAll(request.data);
    else return responseJSON({ error: 'Acción no válida: ' + action });

    return responseJSON({ success: true, result });
  } catch (err) {
    return responseJSON({ error: err.message || String(err) });
  }
}

function responseJSON(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// =====================================================================
// FUNCIONES DE LECTURA DE LA HOJA DE CÁLCULO
// =====================================================================

function getSocios() {
  const doc = SpreadsheetApp.openById(SHEET_ID);
  const sheet = doc.getSheetByName('Socios');
  
  if (!sheet) throw new Error("No existe la pestaña 'Socios'");
  
  const data = sheet.getDataRange().getValues();
  const socios = [];
  
  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) continue; // Saltar filas vacías
    socios.push({
      id: String(data[i][0]),
      nombre: data[i][1],
      apellidos: data[i][2],
      categoria: data[i][3],
      sexo: data[i][4]
    });
  }
  return socios;
}

function getJornadas() {
  const doc = SpreadsheetApp.openById(SHEET_ID);
  const sheet = doc.getSheetByName('Jornadas');
  
  if (!sheet) throw new Error("No existe la pestaña 'Jornadas'");
  
  const data = sheet.getDataRange().getValues();
  const jornadas = [];
  
  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    jornadas.push({
      id: String(data[i][0]),
      fecha: formatSheetDate(data[i][1]),
      modalidad: data[i][2],
      formato: data[i][3],
      desde: data[i][4],
      puntosSet: Number(data[i][5]) || 15,
      ganarPor2: data[i][6] === true || data[i][6] === 'VERDADERO',
      definitiva: data[i][7] === 'Definitiva',
      partidos: 0 
    });
  }
  return jornadas;
}

function doGet() {
  return ContentService.createTextOutput('Servidor Liga Bádminton activo');
}

function getAllData() {
  const inscritos = {};
  rows('Inscritos').filter(r => r[0] && r[1]).forEach(r => {
    const key = String(r[0]) + '_' + String(r[1]);
    const ids = String(r[3] || '').split('|').filter(Boolean);
    if (!ids.length) ids.push(...String(r[2] || '').split('+').filter(Boolean));
    if (!inscritos[key]) inscritos[key] = [];
    inscritos[key].push({ id: String(r[2] || ids.join('+')), ids, nombres: String(r[4] || '').split(' / ').filter(Boolean) });
  });

  const competiciones = {};
  rows('Competiciones').filter(r => r[0] && r[1]).forEach(r => {
    competiciones[String(r[0]) + '_' + String(r[1])] = {
      sistema: r[2], grupos: Number(r[3]) || 0, clasifican: Number(r[4]) || 0
    };
  });

  const partidos = rows('Partidos').filter(r => r[0]).map(r => {
    let sets = [];
    try { sets = JSON.parse(r[12] || '[]'); } catch (err) { sets = []; }
    return {
      id: String(r[0]), jornada: String(r[1]), fecha: formatSheetDate(r[2]), categoria: r[3],
      ronda: r[4], grupo: r[5] || '', orden: Number(r[6]) || 0, estado: r[7] || 'Pendiente',
      idsA: String(r[8] || '').split('|').filter(Boolean), nomA: String(r[9] || '').split(' / ').filter(Boolean),
      idsB: String(r[10] || '').split('|').filter(Boolean), nomB: String(r[11] || '').split(' / ').filter(Boolean),
      sets: Array.isArray(sets) ? sets : [], ganador: r[13] || '', registrado: ''
    };
  });
  return { socios: getSocios(), jornadas: getJornadas(), inscritos, competiciones, partidos };
}

function formatSheetDate(value) {
  if (value instanceof Date) return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return value == null ? '' : String(value);
}

function getOrCreateSheet(name, headers) {
  const doc = SpreadsheetApp.openById(SHEET_ID);
  let sheet = doc.getSheetByName(name);
  if (!sheet) {
    sheet = doc.insertSheet(name);
    sheet.appendRow(headers);
  }
  return sheet;
}

function rows(name) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(name);
  return sheet ? sheet.getDataRange().getValues().slice(1) : [];
}

function jornadaHeaders() { return ['ID','Fecha','Modalidad','Formato','Desde','PuntosSet','GanarPor2','Estado']; }
function inscritoHeaders() { return ['JornadaID','Categoria','ParticipanteID','IDs','Nombres']; }
function competicionHeaders() { return ['JornadaID','Categoria','Sistema','Grupos','Clasifican']; }
function partidoHeaders() { return ['ID','JornadaID','Fecha','Categoria','Ronda','Grupo','Orden','Estado','IdsA','NomA','IdsB','NomB','Sets','Ganador']; }

function appendRows(name, headers, values) {
  const sheet = getOrCreateSheet(name, headers);
  sheet.appendRow(values);
  return sheet;
}

function crearJornada(j) {
  if (rows('Jornadas').some(r => String(r[0]) === String(j.id))) throw new Error('Ya existe una jornada con ese ID.');
  appendRows('Jornadas', jornadaHeaders(), [j.id,j.fecha,j.modalidad,j.formato,j.desde||'',j.puntosSet||15,!!j.ganarPor2,'En Curso']);
  return j;
}

function guardarJornadaDefinitiva(id) {
  const sheet = getOrCreateSheet('Jornadas', jornadaHeaders());
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) if (String(data[i][0]) === String(id)) {
    sheet.getRange(i + 1, 8).setValue('Definitiva');
    return true;
  }
  throw new Error('Jornada no encontrada: ' + id);
}

function borrarJornada(id) {
  deleteWhere('Jornadas', r => String(r[0]) === String(id));
  deleteWhere('Inscritos', r => String(r[0]) === String(id));
  deleteWhere('Competiciones', r => String(r[0]) === String(id));
  deleteWhere('Partidos', r => String(r[1]) === String(id));
  return true;
}

function anadirInscrito(id, categoria, ids, nombres) {
  const participantId = ids.slice().sort((a,b) => Number(a)-Number(b)).join('+');
  if (rows('Inscritos').some(r => String(r[0]) === String(id) && r[1] === categoria && String(r[2]) === participantId)) throw new Error('Participante ya inscrito.');
  appendRows('Inscritos', inscritoHeaders(), [id,categoria,participantId,ids.join('|'),(nombres||[]).join(' / ')]);
  return true;
}

function quitarInscrito(id, categoria, participantId) {
  deleteWhere('Inscritos', r => String(r[0]) === String(id) && r[1] === categoria && String(r[2]) === String(participantId));
  return true;
}

function crearCompeticion(id, categoria, cfg, partidos) {
  if (rows('Competiciones').some(r => String(r[0]) === String(id) && r[1] === categoria)) throw new Error('Ya existe una competición para esa jornada/categoría.');
  appendRows('Competiciones', competicionHeaders(), [id,categoria,cfg.sistema,cfg.grupos||0,cfg.clasifican||0]);
  (partidos||[]).forEach(p => appendRows('Partidos', partidoHeaders(), [
    p.id,p.jornada,p.fecha,p.categoria,p.ronda,p.grupo||'',p.orden||0,p.estado||'Pendiente',
    (p.idsA||[]).join('|'),(p.nomA||[]).join(' / '),(p.idsB||[]).join('|'),(p.nomB||[]).join(' / '),JSON.stringify(p.sets||[]),p.ganador||''
  ]));
  return true;
}

function borrarCompeticion(id, categoria) {
  deleteWhere('Competiciones', r => String(r[0]) === String(id) && r[1] === categoria);
  deleteWhere('Partidos', r => String(r[1]) === String(id) && r[3] === categoria);
  return true;
}

function updateMatch(id, values) {
  const sheet = getOrCreateSheet('Partidos', partidoHeaders());
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) if (String(data[i][0]) === String(id)) {
    Object.keys(values).forEach(col => sheet.getRange(i + 1, Number(col)).setValue(values[col]));
    return true;
  }
  throw new Error('Partido no encontrado: ' + id);
}

function guardarResultado(id, sets, ganador) { return updateMatch(id, { 8:'Jugado', 13:JSON.stringify(sets||[]), 14:ganador||'' }); }
function borrarResultado(id) { return updateMatch(id, { 8:'Pendiente', 13:'[]', 14:'' }); }

function syncAll(data) {
  if (!data) throw new Error('Sin datos para sincronizar.');
  replaceRows('Jornadas', jornadaHeaders(), (data.jornadas||[]).map(j => [j.id,j.fecha,j.modalidad,j.formato,j.desde||'',j.puntosSet||15,!!j.ganarPor2,j.definitiva?'Definitiva':'En Curso']));
  const inscritos = [];
  Object.entries(data.inscritos||{}).forEach(([key,list]) => {
    const parts = key.split('_');
    (list||[]).forEach(p => inscritos.push([parts[0],parts.slice(1).join('_'),p.id,(p.ids||[]).join('|'),(p.nombres||[]).join(' / ')]));
  });
  replaceRows('Inscritos', inscritoHeaders(), inscritos);
  const competiciones = [];
  Object.entries(data.competiciones||{}).forEach(([key,c]) => {
    const parts = key.split('_');
    competiciones.push([parts[0],parts.slice(1).join('_'),c.sistema,c.grupos||0,c.clasifican||0]);
  });
  replaceRows('Competiciones', competicionHeaders(), competiciones);
  replaceRows('Partidos', partidoHeaders(), (data.partidos||[]).map(p => [
    p.id,p.jornada,p.fecha,p.categoria,p.ronda,p.grupo||'',p.orden||0,p.estado||'Pendiente',
    (p.idsA||[]).join('|'),(p.nomA||[]).join(' / '),(p.idsB||[]).join('|'),(p.nomB||[]).join(' / '),JSON.stringify(p.sets||[]),p.ganador||''
  ]));
  return { jornadas:(data.jornadas||[]).length, partidos:(data.partidos||[]).length };
}

function replaceRows(name, headers, values) {
  const sheet = getOrCreateSheet(name, headers);
  if (sheet.getLastRow() > 1) sheet.deleteRows(2, sheet.getLastRow() - 1);
  if (values.length) sheet.getRange(2, 1, values.length, headers.length).setValues(values);
}

function deleteWhere(name, predicate) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(name);
  if (!sheet) return;
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) if (predicate(data[i])) sheet.deleteRow(i + 1);
}