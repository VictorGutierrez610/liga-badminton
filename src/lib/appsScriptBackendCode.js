export const APPS_SCRIPT_CODE = `// =====================================================================
//  LIGA DE BADMINTON DE LOS VIERNES - BACKEND COMPLETO (Codigo.gs)
//  Hoja de Calculo ID: 1RObAcHR-AiaMx_b7wSvXRaDop_x4htuKIHiLdZr3m8Y
//
//  PESTANAS NECESARIAS EN LA HOJA DE CALCULO:
//    - Socios       -> ID | Nombre | Apellidos | Categoria | Sexo
//    - Jornadas     -> ID | Fecha | Modalidad | Formato | Desde | PuntosSet | GanarPor2 | Estado
//    - Inscritos    -> JornadaID | Categoria | ParticipanteID | IDs | Nombres
//    - Competiciones-> JornadaID | Categoria | Sistema | Grupos | Clasifican
//    - Partidos     -> ID | JornadaID | Fecha | Categoria | Ronda | Grupo | Orden |
//                     Estado | IdsA | NomA | IdsB | NomB | Sets | Ganador
// =====================================================================

const SHEET_ID = '1RObAcHR-AiaMx_b7wSvXRaDop_x4htuKIHiLdZr3m8Y';
const PIN_ADMIN = ''; // Estipulada por la administración

function doPost(e) {
  let lock = null;
  try {
    const request = JSON.parse(e.postData.contents);
    const action  = request.action;
    const pin     = request.pin || '';

    if (PIN_ADMIN && String(pin) !== String(PIN_ADMIN)) {
      return responseJSON({ error: 'PIN de administracion incorrecto.' });
    }

    lock = LockService.getScriptLock();
    lock.waitLock(30000);

    const readActions = ['getSocios', 'getJornadas', 'getAllData'];
    if (readActions.indexOf(action) === -1) {
      const actualRevision = getSheetsRevision();
      if (!request.expectedRevision || String(request.expectedRevision) !== actualRevision) {
        throw new Error('Los datos de Google Sheets cambiaron desde la última carga. Vuelve a cargar los datos y revisa los cambios antes de sincronizar.');
      }
    }

    let result = null;

    if      (action === 'getSocios')               result = getSocios();
    else if (action === 'getJornadas')             result = getJornadas();
    else if (action === 'getAllData')              result = getAllData();
    else if (action === 'crearJornada')            result = crearJornada(request.jornada);
    else if (action === 'guardarJornadaDefinitiva')result = guardarJornadaDefinitiva(request.idJornada);
    else if (action === 'borrarJornada')           result = borrarJornada(request.idJornada);
    else if (action === 'anadirInscrito')          result = anadirInscrito(request.idJornada, request.categoria, request.ids, request.nombres);
    else if (action === 'quitarInscrito')          result = quitarInscrito(request.idJornada, request.categoria, request.idPart);
    else if (action === 'crearCompeticion')        result = crearCompeticion(request.idJornada, request.categoria, request.cfg, request.partidos);
    else if (action === 'guardarPartidos')         result = guardarPartidos(request.partidos);
    else if (action === 'borrarCompeticion')       result = borrarCompeticion(request.idJornada, request.categoria);
    else if (action === 'guardarResultado')        result = guardarResultado(request.idPartido, request.sets, request.ganador, request.partido);
    else if (action === 'borrarResultado')         result = borrarResultado(request.idPartido);
    else if (action === 'syncAll')                 result = syncAll(request.data, request.expectedRevision);
    else return responseJSON({ error: 'Accion no valida: ' + action });

    return responseJSON({ success: true, result, revision: getSheetsRevision() });
  } catch (err) {
    return responseJSON({ error: err.message || String(err) });
  } finally {
    if (lock && lock.hasLock()) lock.releaseLock();
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

function getSheetsRevision() {
  const tables = [
    ['Socios', ['ID','Nombre','Apellidos','Categoria','Sexo']],
    ['Jornadas', ['ID','Fecha','Modalidad','Formato','Desde','PuntosSet','GanarPor2','Estado']],
    ['Inscritos', ['JornadaID','Categoria','ParticipanteID','IDs','Nombres']],
    ['Competiciones', ['JornadaID','Categoria','Sistema','Grupos','Clasifican']],
    ['Partidos', _hP()]
  ];
  const snapshot = tables.map(([name, headers]) =>
    getOrCreateSheet(name, headers).getDataRange().getValues()
  );
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    JSON.stringify(snapshot),
    Utilities.Charset.UTF_8
  );
  return Utilities.base64EncodeWebSafe(digest);
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
    id: String(r[0]), fecha: formatSheetDate(r[1]), modalidad: r[2], formato: r[3], desde: r[4],
    puntosSet: Number(r[5]) || 15,
    ganarPor2: r[6] === true || String(r[6]).toUpperCase() === 'VERDADERO' || String(r[6]).toUpperCase() === 'TRUE',
    definitiva: r[7] === 'Definitiva', partidos: 0
  }));
}

function getAllData() {
  const inscritos = {};
  sheetRows(getOrCreateSheet('Inscritos', ['JornadaID','Categoria','ParticipanteID','IDs','Nombres']))
    .filter(r => r[0] && r[1]).forEach(r => {
      const key = String(r[0]) + '_' + String(r[1]);
      const ids = String(r[3] || '').split('|').filter(Boolean);
      if (!ids.length) ids.push(...String(r[2] || '').split('+').filter(Boolean));
      const participantId = String(r[2] || ids.join('+'));
      if (!inscritos[key]) inscritos[key] = [];
      inscritos[key].push({
        id: participantId,
        ids,
        nombres: String(r[4] || '').split(' / ').filter(Boolean)
      });
    });

  const competiciones = {};
  sheetRows(getOrCreateSheet('Competiciones', ['JornadaID','Categoria','Sistema','Grupos','Clasifican']))
    .filter(r => r[0] && r[1]).forEach(r => {
      competiciones[String(r[0]) + '_' + String(r[1])] = {
        sistema: r[2], grupos: Number(r[3]) || 0, clasifican: Number(r[4]) || 0
      };
    });

  const partidos = sheetRows(getOrCreateSheet('Partidos', _hP()))
    .filter(r => r[0]).map(r => {
      let sets = [];
      try {
        sets = JSON.parse(r[12] || '[]');
      } catch (err) {
        throw new Error('El resultado guardado del partido ' + String(r[0]) + ' no tiene un formato JSON válido.');
      }
      return {
        id: String(r[0]), jornada: String(r[1]), fecha: formatSheetDate(r[2]),
        categoria: r[3], ronda: r[4], grupo: r[5] || '', orden: Number(r[6]) || 0,
        estado: r[7] || 'Pendiente', idsA: String(r[8] || '').split('|').filter(Boolean),
        nomA: String(r[9] || '').split(' / ').filter(Boolean),
        idsB: String(r[10] || '').split('|').filter(Boolean),
        nomB: String(r[11] || '').split(' / ').filter(Boolean),
        sets: Array.isArray(sets) ? sets : [], ganador: r[13] || '', registrado: ''
      };
    });

  return {
    socios: getSocios(),
    jornadas: getJornadas(),
    inscritos,
    competiciones,
    partidos,
    revision: getSheetsRevision()
  };
}

function formatSheetDate(value) {
  if (value instanceof Date) return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return value == null ? '' : String(value);
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

function _partidoRow(p) {
  return [
    p.id, p.jornada, p.fecha, p.categoria, p.ronda, p.grupo||'', p.orden||0,
    p.estado||'Pendiente',
    (p.idsA||[]).join('|'), (p.nomA||[]).join(' / '),
    (p.idsB||[]).join('|'), (p.nomB||[]).join(' / '),
    JSON.stringify(p.sets||[]), p.ganador||''
  ];
}

function crearCompeticion(idJornada, categoria, cfg, partidos) {
  const sC = getOrCreateSheet('Competiciones', ['JornadaID','Categoria','Sistema','Grupos','Clasifican']);
  if (sheetRows(sC).some(r=>String(r[0])===String(idJornada)&&r[1]===categoria))
    throw new Error('Ya existe una competicion para esa jornada/categoria.');
  sC.appendRow([idJornada, categoria, cfg.sistema, cfg.grupos||0, cfg.clasifican||0]);

  if (partidos && partidos.length > 0) {
    const sP = getOrCreateSheet('Partidos', _hP());
    partidos.forEach(p => sP.appendRow(_partidoRow(p)));
  }
  return true;
}

function guardarPartidos(partidos) {
  if (!Array.isArray(partidos) || partidos.length === 0)
    throw new Error('No se recibieron partidos para guardar.');

  const sheet = getOrCreateSheet('Partidos', _hP());
  const data = sheet.getDataRange().getValues();
  const rowsById = new Map();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) rowsById.set(String(data[i][0]), i + 1);
  }

  let created = 0;
  let updated = 0;
  partidos.forEach(p => {
    if (!p || !p.id) throw new Error('Se recibió un partido sin ID.');
    const row = _partidoRow(p);
    const existingRow = rowsById.get(String(p.id));
    if (existingRow) {
      sheet.getRange(existingRow, 1, 1, row.length).setValues([row]);
      updated++;
    } else {
      sheet.appendRow(row);
      rowsById.set(String(p.id), sheet.getLastRow());
      created++;
    }
  });
  return { created, updated };
}

function borrarCompeticion(idJornada, categoria) {
  _delWhere('Competiciones', ['JornadaID','Categoria','Sistema','Grupos','Clasifican'],
    r => String(r[0])===String(idJornada) && r[1]===categoria);
  _delWhere('Partidos', _hP(),
    r => String(r[1])===String(idJornada) && r[3]===categoria);
  return true;
}

function validarResultado(partido, sets) {
  if (!Array.isArray(sets) || sets.length < 1 || sets.length > 3)
    throw new Error('Introduce entre uno y tres sets completos.');
  if (!partido || !partido.idsA || !partido.idsA.length || !partido.idsB || !partido.idsB.length)
    throw new Error('No se puede puntuar un enfrentamiento sin dos participantes.');

  const jornada = getJornadas().find(j => String(j.id) === String(partido.jornada));
  if (!jornada) throw new Error('No se encuentra la jornada del partido.');
  const target = Number(jornada.puntosSet);
  if (!Number.isInteger(target) || target < 1 || target > 50)
    throw new Error('La jornada tiene una puntuación por set no válida.');

  const winners = sets.map((set, index) => {
    if (!Array.isArray(set) || set.length !== 2 ||
        !set.every(score => Number.isInteger(score) && score >= 0 && score <= 50))
      throw new Error('El set ' + (index + 1) + ' debe tener dos puntuaciones enteras entre 0 y 50.');
    if (set[0] === set[1]) throw new Error('El set ' + (index + 1) + ' no puede terminar empatado.');
    const winnerScore = Math.max(set[0], set[1]);
    const loserScore = Math.min(set[0], set[1]);
    if (jornada.ganarPor2) {
      if (winnerScore < target || winnerScore - loserScore < 2)
        throw new Error('El set ' + (index + 1) + ' debe alcanzar ' + target + ' puntos y ganarse por al menos dos.');
    } else if (winnerScore !== target || loserScore >= target) {
      throw new Error('El set ' + (index + 1) + ' debe terminar al llegar a ' + target + ' puntos.');
    }
    return set[0] > set[1] ? 'A' : 'B';
  });

  let format = jornada.formato;
  if (format === 'MIXTO') {
    const threshold = String(jornada.desde || '').trim().toLocaleLowerCase('es');
    const roundStages = {
      'Fase de grupos': 0,
      Dieciseisavos: 1,
      Octavos: 2,
      Cuartos: 3,
      Semifinal: 4,
      Final: 5
    };
    let configuredStage = threshold.indexOf('eliminatoria') !== -1 ? 1 : undefined;
    if (configuredStage === undefined) {
      Object.keys(roundStages).some(round => {
        if (threshold.indexOf(round.toLocaleLowerCase('es')) === -1) return false;
        configuredStage = roundStages[round];
        return true;
      });
    }
    if (configuredStage === undefined)
      throw new Error('Configura "Desde" con una ronda válida para aplicar el formato mixto.');
    const matchStage = roundStages[partido.ronda];
    if (matchStage === undefined)
      throw new Error('No se puede determinar el formato para la ronda "' + partido.ronda + '".');
    format = matchStage >= configuredStage ? 'TRES' : 'UNO';
  }

  if (format === 'UNO' && sets.length !== 1)
    throw new Error('Este partido se juega a un solo set.');
  if (format === 'TRES') {
    if (sets.length < 2) throw new Error('Este partido requiere al menos dos sets.');
    let winsA = 0;
    let winsB = 0;
    winners.forEach((winner, index) => {
      if (winner === 'A') winsA++;
      else winsB++;
      if ((winsA === 2 || winsB === 2) && index !== winners.length - 1)
        throw new Error('No se pueden registrar sets después de que un lado haya ganado dos.');
    });
    if (Math.max(winsA, winsB) !== 2)
      throw new Error('El resultado debe decidirse al mejor de tres sets.');
  } else if (format !== 'UNO') {
    throw new Error('El formato de juego de la jornada no es válido.');
  }

  const winsA = winners.filter(winner => winner === 'A').length;
  const winsB = winners.length - winsA;
  return winsA > winsB ? 'A' : 'B';
}

function guardarResultado(idPartido, sets, ganador, partido) {
  const sheet = getOrCreateSheet('Partidos', _hP());
  const data = sheet.getDataRange().getValues();
  const existing = data.slice(1).find(row => String(row[0]) === String(idPartido));
  const matchForValidation = existing
    ? {
        id: String(existing[0]),
        jornada: String(existing[1]),
        ronda: existing[4],
        idsA: String(existing[8] || '').split('|').filter(Boolean),
        idsB: String(existing[10] || '').split('|').filter(Boolean)
      }
    : partido || null;
  if (!matchForValidation || String(matchForValidation.id) !== String(idPartido))
    throw new Error('No se recibió la información del partido para validar el resultado.');
  const calculatedWinner = validarResultado(matchForValidation, sets);
  if (String(ganador) !== calculatedWinner)
    throw new Error('El ganador indicado no coincide con el marcador de los sets.');

  for (let i=1; i<data.length; i++) {
    if (String(data[i][0])===String(idPartido)) {
      sheet.getRange(i+1,8).setValue('Jugado');
      sheet.getRange(i+1,13).setValue(JSON.stringify(sets));
      sheet.getRange(i+1,14).setValue(ganador||'');
      return true;
    }
  }
  if (!partido || String(partido.id) !== String(idPartido))
    throw new Error('Partido no encontrado y no se recibió su información para recuperarlo: ' + idPartido);
  sheet.appendRow(_partidoRow({
    ...partido,
    estado: 'Jugado',
    sets,
    ganador: ganador || ''
  }));
  return true;
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

function syncAll(data, expectedRevision) {
  if (!data || !Array.isArray(data.jornadas) || !Array.isArray(data.partidos) ||
      !data.inscritos || typeof data.inscritos !== 'object' ||
      !data.competiciones || typeof data.competiciones !== 'object') {
    throw new Error('El conjunto de datos para sincronizar no tiene un formato válido.');
  }
  const actualRevision = getSheetsRevision();
  if (!expectedRevision || String(expectedRevision) !== actualRevision) {
    throw new Error('Los datos de Google Sheets cambiaron desde la última carga. No se sobrescribieron; vuelve a cargar y revisar los cambios.');
  }

  const jornadaRows = data.jornadas.map(j => [
    j.id, j.fecha, j.modalidad, j.formato, j.desde || '', j.puntosSet || 15,
    j.ganarPor2 || false, j.definitiva ? 'Definitiva' : 'En Curso'
  ]);
  const inscritoRows = [];
  Object.entries(data.inscritos).forEach(([key, list]) => {
    if (!Array.isArray(list)) throw new Error('La lista de inscritos contiene datos inválidos.');
    const parts = key.split('_');
    list.forEach(p => inscritoRows.push([
      parts[0], parts.slice(1).join('_'), p.id, (p.ids || []).join('|'), (p.nombres || []).join(' / ')
    ]));
  });
  const competicionRows = Object.entries(data.competiciones).map(([key, comp]) => {
    const parts = key.split('_');
    return [parts[0], parts.slice(1).join('_'), comp.sistema, comp.grupos || 0, comp.clasifican || 0];
  });
  const partidoRows = data.partidos.map(_partidoRow);

  const tables = [
    [getOrCreateSheet('Jornadas', ['ID','Fecha','Modalidad','Formato','Desde','PuntosSet','GanarPor2','Estado']), 8, jornadaRows],
    [getOrCreateSheet('Inscritos', ['JornadaID','Categoria','ParticipanteID','IDs','Nombres']), 5, inscritoRows],
    [getOrCreateSheet('Competiciones', ['JornadaID','Categoria','Sistema','Grupos','Clasifican']), 5, competicionRows],
    [getOrCreateSheet('Partidos', _hP()), 14, partidoRows]
  ];
  const backups = tables.map(([sheet, width]) => {
    const lastRow = sheet.getLastRow();
    return lastRow < 2 ? [] : sheet.getRange(2, 1, lastRow - 1, width).getValues();
  });

  try {
    tables.forEach(([sheet, width, rows]) => replaceSheetRows(sheet, width, rows));
  } catch (error) {
    const rollbackErrors = [];
    tables.forEach(([sheet, width], index) => {
      try {
        replaceSheetRows(sheet, width, backups[index]);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError.message || String(rollbackError));
      }
    });
    if (rollbackErrors.length) {
      throw new Error('Falló la sincronización y no se pudieron restaurar todas las hojas: ' + rollbackErrors.join(' | '));
    }
    throw new Error('Falló la sincronización; se restauraron los datos anteriores: ' + (error.message || error));
  }

  return {
    jornadas: data.jornadas.length,
    partidos: data.partidos.length,
    revision: getSheetsRevision()
  };
}

// ─── HELPERS ─────────────────────────────────────────────────────────

function replaceSheetRows(sheet, width, rows) {
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, width).clearContent();
  if (rows.length) sheet.getRange(2, 1, rows.length, width).setValues(rows);
}

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
