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

    if (action === 'getSocios') {
      result = getSocios();
    } else if (action === 'getJornadas') {
      result = getJornadas();
    } 
    // Aquí irían el resto de acciones (crearJornada, getRanking, etc.)
    else {
      return responseJSON({ error: 'Acción no válida o aún no programada en Apps Script: ' + action });
    }

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
      fecha: data[i][1],          // Ajusta según tus columnas reales
      modalidad: data[i][2],
      formato: data[i][3],
      desde: data[i][4],
      puntosSet: Number(data[i][5]) || 15,
      ganarPor2: data[i][6] === true || data[i][6] === 'VERDADERO',
      definitiva: data[i][8] === 'Definitiva', // Columna Estado
      partidos: 0 
    });
  }
  return jornadas;
}