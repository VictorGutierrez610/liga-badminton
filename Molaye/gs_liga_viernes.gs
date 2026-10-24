// =====================================================================
//  LIGA DE BADMINTON DE LOS VIERNES - BACKEND COMPLETO (Codigo.gs)
//  Hoja de Calculo ID: 1RObAcHR-AiaMx_b7wSvXRaDop_x4htuKIHiLdZr3m8Y
//
//  PESTANAS NECESARIAS EN LA HOJA DE CALCULO:
//    - Socios       -> ID | Nombre | Apellidos | Categoria | Sexo
//    - Jornadas     -> ID | Fecha | Modalidad | Formato | Desde | PuntosSet | GanarPor2 | Estado | ParejasRotativas
//    - Inscritos    -> JornadaID | Categoria | ParticipanteID | IDs | Nombres
//    - Competiciones-> JornadaID | Categoria | Sistema | Grupos | Clasifican | PuntosPrecalculados | Rondas | PartidosPorRonda
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
    else if (action === 'actualizarCompeticionRotativos') result = actualizarCompeticionRotativos(request.idJornada, request.categoria, request.cfg, request.partidos);
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

function normalizeJornadaHeader(value) {
  return String(value || '').trim().toLocaleUpperCase('es')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9]/g, '');
}

function getJornadasSheet() {
  const headers = ['ID','Fecha','Modalidad','Formato','Desde','PuntosSet','GanarPor2','Estado','ParejasRotativas'];
  const sheet = getOrCreateSheet('Jornadas', headers);
  let headerValues = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length)).getValues()[0];
  let rotatingColumn = headerValues.findIndex(value => normalizeJornadaHeader(value) === 'PAREJASROTATIVAS');
  if (rotatingColumn < 0) {
    let lastHeaderColumn = headerValues.reduce(
      (last, value, index) => value ? index + 1 : last,
      0
    );
    rotatingColumn = lastHeaderColumn;
    sheet.getRange(1, rotatingColumn + 1).setValue(headers[8]).setFontWeight('bold');
    headerValues[rotatingColumn] = headers[8];
  }
  getJornadasColumns(sheet);
  return sheet;
}

function getJornadasColumns(sheet) {
  const headerValues = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 9)).getValues()[0];
  const findColumn = aliases => {
    const aliasSet = new Set(aliases.map(normalizeJornadaHeader));
    return headerValues.findIndex(value => aliasSet.has(normalizeJornadaHeader(value)));
  };
  const columns = {
    id: findColumn(['ID', 'ID_Jornada']),
    fecha: findColumn(['Fecha']),
    modalidad: findColumn(['Modalidad']),
    formato: findColumn(['Formato']),
    desde: findColumn(['Desde', 'BO3_Desde']),
    puntosSet: findColumn(['PuntosSet']),
    ganarPor2: findColumn(['GanarPor2']),
    rotating: findColumn(['ParejasRotativas'])
  };

  const estadoColumn = findColumn(['Estado']);
  const legacyStateColumn = findColumn(['Creada']);
  const rows = sheetRows(sheet);
  const stateValues = new Set(['ENCURSO', 'DEFINITIVA', 'FINALIZADA']);
  columns.estado = estadoColumn >= 0 ? estadoColumn : legacyStateColumn;
  if (estadoColumn >= 0 && legacyStateColumn >= 0) {
    rows.forEach((row, index) => {
      const legacyStatus = normalizeJornadaHeader(row[legacyStateColumn]);
      if (
        !normalizeJornadaHeader(row[estadoColumn]) &&
        stateValues.has(legacyStatus)
      ) {
        sheet.getRange(index + 2, estadoColumn + 1).setValue(row[legacyStateColumn]);
      }
    });
  }
  columns.width = Math.max(
    headerValues.length,
    Math.max(...Object.values(columns).filter(value => Number.isInteger(value))) + 1
  );
  if (Object.entries(columns).some(([key, value]) => key !== 'width' && value < 0)) {
    throw new Error('La hoja Jornadas no contiene los encabezados necesarios. Revisa ID_Jornada, Fecha, Modalidad, Formato, BO3_Desde, PuntosSet, GanarPor2 y Estado.');
  }
  return columns;
}

function jornadaRow(jornada, columns, existingRow) {
  const row = Array.from({ length: columns.width }, (_, index) =>
    existingRow && index < existingRow.length ? existingRow[index] : ''
  );
  row[columns.id] = jornada.id;
  row[columns.fecha] = jornada.fecha;
  row[columns.modalidad] = jornada.modalidad;
  row[columns.formato] = jornada.formato;
  row[columns.desde] = jornada.desde || '';
  row[columns.puntosSet] = jornada.puntosSet || 15;
  row[columns.ganarPor2] = jornada.ganarPor2 || false;
  row[columns.estado] = jornada.definitiva ? 'Definitiva' : 'En Curso';
  row[columns.rotating] = jornada.parejasRotativas || false;
  return row;
}

function getSheetsRevision() {
  const tables = [
    ['Socios', ['ID','Nombre','Apellidos','Categoria','Sexo']],
    ['Jornadas', ['ID','Fecha','Modalidad','Formato','Desde','PuntosSet','GanarPor2','Estado','ParejasRotativas']],
    ['Inscritos', ['JornadaID','Categoria','ParticipanteID','IDs','Nombres']],
    ['Competiciones', _hC()],
    ['Partidos', _hP()]
  ];
  const snapshot = tables.map(([name, headers]) =>
    (name === 'Jornadas'
      ? getJornadasSheet()
      : name === 'Competiciones'
        ? getCompeticionesSheet()
        : name === 'Partidos'
        ? getPartidosSheet()
        : getOrCreateSheet(name, headers)).getDataRange().getValues()
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
  const sheet = getJornadasSheet();
  const columns = getJornadasColumns(sheet);
  return sheetRows(sheet).filter(r => r[columns.id]).map(r => ({
    id: String(r[columns.id]),
    fecha: formatSheetDate(r[columns.fecha]),
    modalidad: r[columns.modalidad],
    formato: r[columns.formato],
    desde: r[columns.desde],
    puntosSet: Number(r[columns.puntosSet]) || 15,
    ganarPor2: r[columns.ganarPor2] === true || String(r[columns.ganarPor2]).toUpperCase() === 'VERDADERO' || String(r[columns.ganarPor2]).toUpperCase() === 'TRUE',
    definitiva: normalizeJornadaHeader(r[columns.estado]) === 'DEFINITIVA',
    parejasRotativas: r[columns.rotating] === true ||
      String(r[columns.rotating]).toUpperCase() === 'VERDADERO' || String(r[columns.rotating]).toUpperCase() === 'TRUE',
    partidos: 0
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
  sheetRows(getCompeticionesSheet())
    .filter(r => r[0] && r[1]).forEach(r => {
      let puntosPrecalculados = {};
      try {
        puntosPrecalculados = JSON.parse(r[5] || '{}');
      } catch (err) {
        throw new Error('Los puntos precalculados de la competición ' + String(r[0]) + '_' + String(r[1]) + ' no tienen un formato JSON válido.');
      }
      if (!puntosPrecalculados || typeof puntosPrecalculados !== 'object' || Array.isArray(puntosPrecalculados)) {
        throw new Error('Los puntos precalculados de la competición ' + String(r[0]) + '_' + String(r[1]) + ' no tienen un formato válido.');
      }
      competiciones[String(r[0]) + '_' + String(r[1])] = {
        sistema: r[2], grupos: Number(r[3]) || 0, clasifican: Number(r[4]) || 0,
        puntosPrecalculados,
        rondas: Number(r[6]) || 0,
        partidosPorRonda: Number(r[7]) || 0
      };
    });

  const partidos = sheetRows(getPartidosSheet())
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
        sets: Array.isArray(sets) ? sets : [], ganador: r[13] || '',
        formato: r[14] || '', registrado: ''
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
  const sheet = getJornadasSheet();
  const columns = getJornadasColumns(sheet);
  if (sheetRows(sheet).some(r => String(r[columns.id]) === String(j.id)))
    throw new Error('Ya existe una jornada con ese ID.');
  sheet.appendRow(jornadaRow(j, columns));
  return j;
}

function guardarJornadaDefinitiva(idJornada) {
  const sheet = getJornadasSheet();
  const data = sheet.getDataRange().getValues();
  const columns = getJornadasColumns(sheet);
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][columns.id]) === String(idJornada)) {
      sheet.getRange(i + 1, columns.estado + 1).setValue('Definitiva');
      return true;
    }
  }
  throw new Error('Jornada no encontrada: ' + idJornada);
}

function borrarJornada(idJornada) {
  _delWhere('Jornadas',     ['ID','Fecha','Modalidad','Formato','Desde','PuntosSet','GanarPor2','Estado','ParejasRotativas'], r => String(r[0])===String(idJornada));
  _delWhere('Inscritos',    ['JornadaID','Categoria','ParticipanteID','IDs','Nombres'],                   r => String(r[0])===String(idJornada));
  _delWhere('Competiciones',_hC(),                                                                      r => String(r[0])===String(idJornada));
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
          'Estado','IdsA','NomA','IdsB','NomB','Sets','Ganador','FormatoPartido'];
}

function _hC() {
  return ['JornadaID','Categoria','Sistema','Grupos','Clasifican','PuntosPrecalculados','Rondas','PartidosPorRonda'];
}

function getCompeticionesSheet() {
  const headers = _hC();
  const sheet = getOrCreateSheet('Competiciones', headers);
  const lastColumn = sheet.getLastColumn();
  const existingPointHeader = lastColumn >= 6 ? sheet.getRange(1, 6).getValue() : '';
  if (!existingPointHeader) {
    sheet.getRange(1, 6).setValue(headers[5]).setFontWeight('bold');
  } else if (existingPointHeader !== headers[5]) {
    throw new Error('La columna F de Competiciones debe llamarse PuntosPrecalculados. Revisa los encabezados antes de sincronizar.');
  }
  for (let column = 7; column <= headers.length; column++) {
    const existingHeader = lastColumn >= column ? sheet.getRange(1, column).getValue() : '';
    if (!existingHeader) {
      sheet.getRange(1, column).setValue(headers[column - 1]).setFontWeight('bold');
    } else if (existingHeader !== headers[column - 1]) {
      throw new Error('Las columnas G y H de Competiciones deben llamarse Rondas y PartidosPorRonda. Revisa los encabezados antes de sincronizar.');
    }
  }
  return sheet;
}

function getPartidosSheet() {
  const headers = _hP();
  const sheet = getOrCreateSheet('Partidos', headers);
  if (typeof sheet.getLastColumn === 'function') {
    const headerCell = sheet.getRange(1, headers.length);
    const hasHeaderValue = typeof headerCell.getValue === 'function';
    if (
      (hasHeaderValue && headerCell.getValue() !== headers[headers.length - 1]) ||
      (!hasHeaderValue && sheet.getLastColumn() < headers.length)
    ) {
      headerCell.setValue(headers[headers.length - 1]).setFontWeight('bold');
    }
  }
  return sheet;
}

function _partidoRow(p) {
  return [
    p.id, p.jornada, p.fecha, p.categoria, p.ronda, p.grupo||'', p.orden||0,
    p.estado||'Pendiente',
    (p.idsA||[]).join('|'), (p.nomA||[]).join(' / '),
    (p.idsB||[]).join('|'), (p.nomB||[]).join(' / '),
    JSON.stringify(p.sets||[]), p.ganador||'', p.formato||''
  ];
}

function crearCompeticion(idJornada, categoria, cfg, partidos) {
  const sC = getCompeticionesSheet();
  if (sheetRows(sC).some(r=>String(r[0])===String(idJornada)&&r[1]===categoria))
    throw new Error('Ya existe una competicion para esa jornada/categoria.');
  sC.appendRow([
    idJornada, categoria, cfg.sistema, cfg.grupos || 0,
    cfg.clasifican || 0, '{}', cfg.rondas || 0, cfg.partidosPorRonda || 0
  ]);

  if (partidos && partidos.length > 0) {
    const sP = getPartidosSheet();
    partidos.forEach(p => sP.appendRow(_partidoRow(p)));
  }
  return true;
}

function actualizarCompeticionRotativos(idJornada, categoria, cfg, partidos) {
  if (!Number.isInteger(Number(cfg && cfg.rondas)) || Number(cfg.rondas) < 1 || Number(cfg.rondas) > 30) {
    throw new Error('El número de rondas debe estar entre 1 y 30.');
  }
  if (!Number.isInteger(Number(cfg && cfg.partidosPorRonda)) || Number(cfg.partidosPorRonda) < 1) {
    throw new Error('Los partidos por ronda deben ser un número entero positivo.');
  }
  if (!Array.isArray(partidos) || partidos.length !== Number(cfg.rondas) * Number(cfg.partidosPorRonda)) {
    throw new Error('La cantidad de partidos no coincide con las rondas y partidos configurados.');
  }

  const competitionsSheet = getCompeticionesSheet();
  const competitionData = competitionsSheet.getDataRange().getValues();
  const rowIndex = competitionData.findIndex((row, index) =>
    index > 0 && String(row[0]) === String(idJornada) && String(row[1]) === String(categoria)
  );
  if (rowIndex < 0 || competitionData[rowIndex][2] !== 'ROTATIVOS') {
    throw new Error('No existe una competición de parejas rotativas para esta categoría.');
  }
  const competitionRow = rowIndex + 1;
  competitionsSheet.getRange(competitionRow, 7, 1, 2).setValues([[
    Number(cfg.rondas), Number(cfg.partidosPorRonda)
  ]]);

  const matchesSheet = getPartidosSheet();
  const existingMatches = matchesSheet.getDataRange().getValues();
  for (let index = existingMatches.length - 1; index >= 1; index--) {
    const row = existingMatches[index];
    if (
      String(row[1]) === String(idJornada) &&
      String(row[3]) === String(categoria) &&
      (row[4] === 'Fase de grupos' || row[4] === 'Final')
    ) {
      matchesSheet.deleteRow(index + 1);
    }
  }
  partidos.forEach(partido => matchesSheet.appendRow(_partidoRow(partido)));
  return true;
}

function guardarPartidos(partidos) {
  if (!Array.isArray(partidos) || partidos.length === 0)
    throw new Error('No se recibieron partidos para guardar.');

  const sheet = getPartidosSheet();
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
  _delWhere('Competiciones', _hC(),
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

  let format = partido.formato || jornada.formato;
  if (partido.formato && partido.formato !== 'UNO' && partido.formato !== 'TRES')
    throw new Error('El formato individual del partido no es válido.');
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
  const sheet = getPartidosSheet();
  const data = sheet.getDataRange().getValues();
  const existing = data.slice(1).find(row => String(row[0]) === String(idPartido));
  const matchForValidation = existing
    ? {
        id: String(existing[0]),
        jornada: String(existing[1]),
        ronda: existing[4],
        idsA: String(existing[8] || '').split('|').filter(Boolean),
        idsB: String(existing[10] || '').split('|').filter(Boolean),
        formato: partido && String(partido.id) === String(idPartido) &&
          Object.prototype.hasOwnProperty.call(partido, 'formato')
          ? partido.formato || ''
          : existing[14] || ''
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
      sheet.getRange(i+1,15).setValue(matchForValidation.formato || '');
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
  const sheet = getPartidosSheet();
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

  const jornadasSheet = getJornadasSheet();
  const jornadaColumns = getJornadasColumns(jornadasSheet);
  const currentJornadaRows = sheetRows(jornadasSheet);
  const currentJornadaRowsById = new Map(
    currentJornadaRows.map(row => [String(row[jornadaColumns.id]), row])
  );
  const jornadaRows = data.jornadas.map(j =>
    jornadaRow(j, jornadaColumns, currentJornadaRowsById.get(String(j.id)))
  );
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
    return [
      parts[0], parts.slice(1).join('_'), comp.sistema, comp.grupos || 0,
      comp.clasifican || 0, JSON.stringify(comp.puntosPrecalculados || {}),
      comp.rondas || 0, comp.partidosPorRonda || 0
    ];
  });
  const partidoRows = data.partidos.map(_partidoRow);

  const tables = [
    [jornadasSheet, jornadaColumns.width, jornadaRows],
    [getOrCreateSheet('Inscritos', ['JornadaID','Categoria','ParticipanteID','IDs','Nombres']), 5, inscritoRows],
    [getCompeticionesSheet(), 8, competicionRows],
    [getPartidosSheet(), 15, partidoRows]
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
  const sheet = name === 'Partidos'
    ? getPartidosSheet()
    : name === 'Competiciones'
      ? getCompeticionesSheet()
      : getOrCreateSheet(name, headers);
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (predFn(data[i])) sheet.deleteRow(i + 1);
  }
}
