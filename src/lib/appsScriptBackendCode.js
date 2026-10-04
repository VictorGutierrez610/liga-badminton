export const APPS_SCRIPT_CODE = `// =====================================================================
//  LIGA DE BÁDMINTON DE LOS VIERNES - GOOGLE APPS SCRIPT WEB APP BACKEND
//  ID Hoja: 19DM6m4Cq5Lxo8NwN1z5d1f12Ar4eAgIpsIjmFZ3qaHw
// =====================================================================

const SHEET_ID = '1wjKLBnakvjzdUmiio_BqTRSpP9Q9TONOmX37PwsbdtI';
const PIN_ADMIN = 'Determinado por la administración'; // Opcional: Escribe aquí tu PIN o déjalo vacío

function doPost(e) {
  try {
    const request = JSON.parse(e.postData.contents);
    const action = request.action;
    const pin = request.pin || '';
    
    if (PIN_ADMIN && String(pin) !== String(PIN_ADMIN)) {
      return responseJSON({ error: 'PIN de administración incorrecto.' });
    }

    let result = null;

    if (action === 'getSocios') {
      result = getSocios(pin);
    } else if (action === 'getJornadas') {
      result = getJornadas(pin);
    } else if (action === 'crearJornada') {
      result = crearJornada(pin, request.jornada);
    } else if (action === 'guardarJornadaDefinitiva') {
      result = guardarJornadaDefinitiva(pin, request.idJornada);
    } else if (action === 'borrarJornada') {
      result = borrarJornada(pin, request.idJornada);
    } else if (action === 'getCategoriasJornada') {
      result = getCategoriasJornada(pin, request.idJornada);
    } else if (action === 'getCompeticionDetalle') {
      result = getCompeticionDetalle(pin, request.idJornada, request.categoria);
    } else if (action === 'anadirInscrito') {
      result = anadirInscrito(pin, request.idJornada, request.categoria, request.ids);
    } else if (action === 'quitarInscrito') {
      result = quitarInscrito(pin, request.idJornada, request.categoria, request.idPart);
    } else if (action === 'crearCompeticion') {
      result = crearCompeticion(pin, request.idJornada, request.categoria, request.cfg);
    } else if (action === 'guardarResultado') {
      result = guardarResultado(pin, request.idPartido, request.sets);
    } else if (action === 'borrarResultado') {
      result = borrarResultado(pin, request.idPartido);
    } else if (action === 'generarEliminatoria') {
      result = generarEliminatoria(pin, request.idJornada, request.categoria, request.seeds);
    } else if (action === 'getRanking') {
      result = getRanking();
    } else {
      return responseJSON({ error: 'Acción no válida: ' + action });
    }

    return responseJSON({ success: true, result });
  } catch (err) {
    return responseJSON({ error: err.message || String(err) });
  }
}

function doGet(e) {
  const action = e.parameter.action;
  if (action === 'getRanking') {
    return responseJSON({ success: true, result: getRanking() });
  }
  return HtmlService.createHtmlOutput('<h1>Servidor Web App de la Liga de Bádminton Activo</h1>');
}

function responseJSON(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
`;
