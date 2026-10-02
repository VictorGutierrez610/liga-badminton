// ===================== CONFIGURACIÓN =====================
const SHEET_ID = '19DM6m4Cq5Lxo8NwN1z5d1f12Ar4eAgIpsIjmFZ3qaHw';

// PIN que tendréis que escribir tú y el presidente para entrar en la página.
// Cámbialo por el vuestro. Si lo dejas vacío ('') no se pide PIN.
const PIN_ADMIN = '';

const HOJA_SOCIOS = 'Socios';
const HOJA_JORNADAS = 'Jornadas';
const HOJA_INSCRIPCIONES = 'Inscripciones';
const HOJA_COMPETICIONES = 'Competiciones';
const HOJA_RESULTADOS = 'Resultados';
const HOJA_INDIVIDUAL = 'ResultadosIndividuales';

const RONDAS = ['Fase de grupos', 'Dieciseisavos', 'Octavos', 'Cuartos', 'Semifinal', 'Final'];

// Cada viernes se juega UNA de estas modalidades:
//  - Individual: hombres y mujeres, en nivel A y en nivel B.
//  - Dobles: masculino (DM) y femenino (DF), sin distinguir A/B.
//  - Dobles mixtos: DX, sin distinguir A/B.
const CATEGORIAS = {
  Individual: ['IM-A', 'IF-A', 'IM-B', 'IF-B'],
  'Dobles': ['DM', 'DF'],
  'Dobles mixtos': ['DX']
};

// Cabeceras que debe tener la fila 1 de cada hoja, en este orden exacto (el código lee por posición de columna).
// Las hojas y sus cabeceras se crean a mano en el Google Sheet; el script no las toca.
const CAB_JORNADAS = ['ID_Jornada', 'Fecha', 'Modalidad', 'Formato', 'BO3_Desde', 'PuntosSet', 'GanarPor2', 'Creada', 'Estado'];
const CAB_INSCRIPCIONES = ['ID_Jornada', 'Categoria', 'ID_Participante', 'ID_J1', 'Nombre_J1', 'ID_J2', 'Nombre_J2'];
const CAB_COMPETICIONES = ['ID_Jornada', 'Categoria', 'Sistema', 'NumGrupos', 'Clasifican', 'Creada'];
const CAB_RESULTADOS = ['ID_Partido', 'ID_Jornada', 'Fecha', 'Categoria', 'Ronda', 'Grupo', 'Orden', 'Estado',
  'ID_A1', 'ID_A2', 'ID_B1', 'ID_B2',
  'Nombre_A1', 'Nombre_A2', 'Nombre_B1', 'Nombre_B2',
  'Set1A', 'Set1B', 'Set2A', 'Set2B', 'Set3A', 'Set3B',
  'Ganador', 'Registrado'];
const CAB_INDIVIDUAL = ['ID_Jugador', 'Nombre', 'ID_Jornada', 'Fecha', 'Categoria', 'Ronda', 'ID_Partido',
  'Victoria', 'SetsGanados', 'SetsPerdidos', 'PuntosFavor', 'PuntosContra', 'Puntos', 'Diferencia', 'Derrotas'];
const NCOL_RES = CAB_RESULTADOS.length;

// ===================== SERVIR LA PÁGINA =====================
function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('Anotar')
    .setTitle('Liga de los viernes UNI')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ===================== UTILIDADES =====================
function getSs_() {
  return SpreadsheetApp.openById(SHEET_ID);
}

function hoja_(nombre) {
  const h = getSs_().getSheetByName(nombre);
  if (!h) throw new Error('Falta la hoja "' + nombre + '" en el Google Sheet (revisa que el nombre de la pestaña sea exactamente ese).');
  return h;
}

function validarPin(pin) {
  return !PIN_ADMIN || String(pin) === String(PIN_ADMIN);
}

function comprobarPin_(pin) {
  if (!validarPin(pin)) throw new Error('PIN incorrecto.');
}

function fechaTxt_(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

// '2026-09-25' -> Date a las 12:00 (evita saltos de día por zona horaria)
function parseFecha_(txt) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(txt));
  if (!m) throw new Error('Fecha no válida.');
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
}

function limpiaId_(x) {
  return String(x === undefined || x === null ? '' : x).trim();
}

function idNum_(id) {
  return isNaN(Number(id)) ? id : Number(id);
}

// ID de participante: individual '3'; pareja '3+7' (ordenados)
function partId_(ids) {
  return ids.map(String).sort(function (a, b) { return Number(a) - Number(b); }).join('+');
}

function vacios_(lista) {
  return lista.filter(function (v) { return v !== '' && v !== undefined && v !== null; }).map(String);
}

// Borra varias filas de una hoja (agrupa las consecutivas para ir más rápido)
function borrarFilas_(hoja, filas) {
  const orden = filas.slice().sort(function (a, b) { return b - a; });
  let i = 0;
  while (i < orden.length) {
    const ini = orden[i];
    let n = 1;
    while (i + n < orden.length && orden[i + n] === ini - n) n++;
    hoja.deleteRows(ini - n + 1, n);
    i += n;
  }
}

// ===================== SOCIOS =====================
// Hoja Socios: A ID | B Nombre | C Apellidos | D Categoria (A/B) | E Sexo (M/F)
function leerSocios_() {
  const datos = hoja_(HOJA_SOCIOS).getDataRange().getValues();
  const socios = [];
  for (let i = 1; i < datos.length; i++) {
    const f = datos[i];
    if (!f[0] || !f[1]) continue; // ignora filas sin ID o sin nombre
    socios.push({
      id: String(f[0]),
      nombre: String(f[1]).trim(),
      apellidos: String(f[2] || '').trim(),
      categoria: String(f[3] || '').trim().toUpperCase(),
      sexo: String(f[4] || '').trim().toUpperCase().charAt(0) // 'M', 'F' o ''
    });
  }
  return socios;
}

function getSocios(pin) {
  comprobarPin_(pin);
  return leerSocios_();
}

function nombreSocio_(socios, id) {
  const s = socios.filter(function (s) { return s.id === String(id); })[0];
  return s ? (s.nombre + ' ' + s.apellidos).trim() : String(id);
}

// Sexo que debe tener el jugador de cada casilla según la categoría.
// DM = hombres, DF = mujeres, DX = un hombre (casilla 1) y una mujer (casilla 2).
function sexoRequerido_(categoria, pos) {
  const c = String(categoria || '').toUpperCase();
  if (c.indexOf('DX') === 0) return pos === 0 ? 'M' : 'F';
  const sexo = c.charAt(1);
  return sexo === 'M' || sexo === 'F' ? sexo : '';
}

// Categoría de ranking de una pareja: DM, DF o DX (sin nivel A/B).
// Si en la hoja quedaran categorías antiguas (DM-A, DX-B...), se unifican quitando el nivel.
function categoriaRankingDobles_(categoria) {
  const c = String(categoria || '').trim().toUpperCase();
  const m = /^(DM|DF|DX)(-[AB])?$/.exec(c);
  return m ? m[1] : c;
}

// ===================== JORNADAS =====================
function leerJornadas_() {
  const datos = hoja_(HOJA_JORNADAS).getDataRange().getValues();
  const lista = [];
  for (let i = 1; i < datos.length; i++) {
    const f = datos[i];
    if (!f[0]) continue;
    lista.push({
      id: String(f[0]),
      fecha: f[1] instanceof Date ? fechaTxt_(f[1]) : String(f[1]),
      modalidad: String(f[2]),
      formato: String(f[3]),
      desde: String(f[4] || ''),
      puntosSet: Number(f[5]) || 15,
      ganarPor2: String(f[6]) === 'SI',
      definitiva: String(f[8] || '').toUpperCase() === 'DEFINITIVA'
    });
  }
  return lista;
}

function jornadaPorId_(id) {
  const j = leerJornadas_().filter(function (x) { return x.id === String(id); })[0];
  if (!j) throw new Error('No encuentro esa jornada.');
  return j;
}

function comprobarCategoria_(jornada, categoria) {
  if (CATEGORIAS[jornada.modalidad].indexOf(categoria) === -1) {
    throw new Error('Esa categoría no corresponde a una jornada de ' + jornada.modalidad.toLowerCase() + '.');
  }
}

// Últimas jornadas (más reciente primero) con su nº de partidos jugados
function getJornadas(pin) {
  comprobarPin_(pin);
  const lista = leerJornadas_();
  const cuenta = {};
  const res = hoja_(HOJA_RESULTADOS).getDataRange().getValues();
  for (let i = 1; i < res.length; i++) {
    if (String(res[i][7]) !== 'Jugado') continue;
    const idJ = String(res[i][1]);
    cuenta[idJ] = (cuenta[idJ] || 0) + 1;
  }
  lista.forEach(function (j) { j.partidos = cuenta[j.id] || 0; });
  lista.sort(function (a, b) { return a.fecha < b.fecha ? 1 : (a.fecha > b.fecha ? -1 : 0); });
  return lista.slice(0, 15);
}

// j = { fecha:'yyyy-MM-dd', modalidad:'Individual'|'Dobles'|'Dobles mixtos', formato:'UNO'|'TRES'|'MIXTO',
//       desde:'Octavos'|'Cuartos'|'Semifinal'|'Final' (solo MIXTO), puntosSet:15, ganarPor2:false }
function crearJornada(pin, j) {
  comprobarPin_(pin);
  if (!CATEGORIAS[j.modalidad]) throw new Error('Elige la modalidad.');
  if (['UNO', 'TRES', 'MIXTO'].indexOf(j.formato) === -1) throw new Error('Elige el sistema de juego.');
  if (j.formato === 'MIXTO' && RONDAS.indexOf(j.desde) < 2) throw new Error('Elige desde qué ronda se juega al mejor de 3.');
  const puntosSet = Number(j.puntosSet);
  if (!(puntosSet >= 1 && puntosSet <= 50)) throw new Error('Los puntos por set no son válidos.');

  const fecha = parseFecha_(j.fecha);
  const id = 'J' + String(j.fecha).replace(/-/g, '');

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (leerJornadas_().some(function (x) { return x.id === id; })) {
      throw new Error('Ya hay una jornada creada para esa fecha. Continúala desde la lista.');
    }
    hoja_(HOJA_JORNADAS).appendRow([
      id, fecha, j.modalidad, j.formato,
      j.formato === 'MIXTO' ? j.desde : '',
      puntosSet, j.ganarPor2 ? 'SI' : 'NO', new Date()
    ]);
  } finally {
    lock.releaseLock();
  }

  return {
    id: id, fecha: j.fecha, modalidad: j.modalidad, formato: j.formato,
    desde: j.formato === 'MIXTO' ? j.desde : '', puntosSet: puntosSet,
    ganarPor2: !!j.ganarPor2, definitiva: false, partidos: 0
  };
}

// ===================== INSCRIPCIONES =====================
function leerInscritos_(idJornada, categoria) {
  const datos = hoja_(HOJA_INSCRIPCIONES).getDataRange().getValues();
  const lista = [];
  for (let i = 1; i < datos.length; i++) {
    const f = datos[i];
    if (String(f[0]) !== String(idJornada)) continue;
    if (categoria && String(f[1]) !== categoria) continue;
    const ids = vacios_([f[3], f[5]]);
    lista.push({
      categoria: String(f[1]), id: partId_(ids), ids: ids,
      nombres: vacios_([f[4], f[6]]), fila: i + 1
    });
  }
  return lista;
}

function leerCompeticiones_(idJornada) {
  const datos = hoja_(HOJA_COMPETICIONES).getDataRange().getValues();
  const lista = [];
  for (let i = 1; i < datos.length; i++) {
    const f = datos[i];
    if (!f[0] || String(f[0]) !== String(idJornada)) continue;
    lista.push({
      categoria: String(f[1]), sistema: String(f[2]),
      grupos: Number(f[3]) || 0, clasifican: Number(f[4]) || 0, fila: i + 1
    });
  }
  return lista;
}

function competicionDe_(idJornada, categoria) {
  return leerCompeticiones_(idJornada).filter(function (c) { return c.categoria === categoria; })[0] || null;
}

// ids: [idJugador] en individual, [id1, id2] en dobles
function anadirInscrito(pin, idJornada, categoria, ids) {
  comprobarPin_(pin);
  const jornada = jornadaPorId_(idJornada);
  comprobarCategoria_(jornada, categoria);

  const dobles = categoria.charAt(0) === 'D';
  const lista = (ids || []).map(limpiaId_);
  if (lista.length !== (dobles ? 2 : 1) || lista.some(function (x) { return !x; })) {
    throw new Error(dobles ? 'Elige los dos jugadores de la pareja.' : 'Elige un jugador.');
  }
  if (lista.length === 2 && lista[0] === lista[1]) throw new Error('Los dos jugadores de la pareja no pueden ser el mismo.');

  const socios = leerSocios_();
  lista.forEach(function (id, pos) {
    const s = socios.filter(function (x) { return x.id === id; })[0];
    if (!s) throw new Error('No encuentro al socio #' + id + '.');
    const sexo = sexoRequerido_(categoria, pos);
    if (s.sexo && sexo && s.sexo !== sexo) {
      throw new Error(nombreSocio_(socios, id) + ' no puede jugar en ' + categoria + '.');
    }
  });

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (competicionDe_(idJornada, categoria)) {
      throw new Error('Esta categoría ya tiene la competición creada; no se pueden añadir participantes.');
    }
    const actuales = leerInscritos_(idJornada, categoria);
    lista.forEach(function (id) {
      if (actuales.some(function (a) { return a.ids.indexOf(id) !== -1; })) {
        throw new Error(nombreSocio_(socios, id) + ' ya está inscrito en ' + categoria + '.');
      }
    });

    // En dobles un jugador solo puede participar en una categoría de dobles por jornada.
    if (dobles) {
      const todasLasParejas = leerInscritos_(idJornada);
      const otraCategoria = todasLasParejas.filter(function (p) {
        return String(p.categoria).charAt(0) === 'D' && p.categoria !== categoria &&
          p.ids.some(function (id) { return lista.indexOf(id) !== -1; });
      })[0];
      if (otraCategoria) {
        const quien = lista.filter(function (id) { return otraCategoria.ids.indexOf(id) !== -1; })[0];
        throw new Error(nombreSocio_(socios, quien) + ' ya está inscrito en otra categoría de dobles de esta jornada (' + otraCategoria.categoria + ').');
      }
    }
    hoja_(HOJA_INSCRIPCIONES).appendRow([
      idJornada, categoria, partId_(lista),
      idNum_(lista[0]), nombreSocio_(socios, lista[0]),
      lista[1] ? idNum_(lista[1]) : '', lista[1] ? nombreSocio_(socios, lista[1]) : ''
    ]);
  } finally {
    lock.releaseLock();
  }
  return true;
}

function quitarInscrito(pin, idJornada, categoria, idPart) {
  comprobarPin_(pin);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (competicionDe_(idJornada, categoria)) {
      throw new Error('Esta categoría ya tiene la competición creada. Reiníciala para cambiar los participantes.');
    }
    const x = leerInscritos_(idJornada, categoria).filter(function (i) { return i.id === String(idPart); })[0];
    if (!x) throw new Error('No encuentro ese participante.');
    hoja_(HOJA_INSCRIPCIONES).deleteRow(x.fila);
  } finally {
    lock.releaseLock();
  }
  return true;
}

// ===================== PARTIDOS (lectura / escritura) =====================
function filaAPartido_(f, fila) {
  const sets = [];
  for (let k = 0; k < 3; k++) {
    if (f[16 + 2 * k] !== '' && f[17 + 2 * k] !== '') sets.push([Number(f[16 + 2 * k]), Number(f[17 + 2 * k])]);
  }
  return {
    fila: fila, id: String(f[0]), jornada: String(f[1]), fecha: f[2], categoria: String(f[3]),
    ronda: String(f[4]), grupo: String(f[5]), orden: Number(f[6]) || 0, estado: String(f[7]),
    idsA: vacios_([f[8], f[9]]), idsB: vacios_([f[10], f[11]]),
    nomA: vacios_([f[12], f[13]]), nomB: vacios_([f[14], f[15]]),
    sets: sets, ganador: String(f[22]), registrado: f[23]
  };
}

function partidoAFila_(m) {
  const s = [];
  for (let k = 0; k < 3; k++) {
    s.push(m.sets[k] ? m.sets[k][0] : '');
    s.push(m.sets[k] ? m.sets[k][1] : '');
  }
  return [
    m.id, m.jornada, m.fecha, m.categoria, m.ronda, m.grupo, m.orden, m.estado,
    m.idsA[0] ? idNum_(m.idsA[0]) : '', m.idsA[1] ? idNum_(m.idsA[1]) : '',
    m.idsB[0] ? idNum_(m.idsB[0]) : '', m.idsB[1] ? idNum_(m.idsB[1]) : '',
    m.nomA[0] || '', m.nomA[1] || '', m.nomB[0] || '', m.nomB[1] || '',
    s[0], s[1], s[2], s[3], s[4], s[5],
    m.ganador, m.registrado
  ];
}

function leerPartidos_(idJornada, categoria) {
  const datos = hoja_(HOJA_RESULTADOS).getDataRange().getValues();
  const lista = [];
  for (let i = 1; i < datos.length; i++) {
    const f = datos[i];
    if (!f[0]) continue;
    if (idJornada && String(f[1]) !== String(idJornada)) continue;
    if (categoria && String(f[3]) !== categoria) continue;
    lista.push(filaAPartido_(f, i + 1));
  }
  return lista;
}

function escribirPartido_(m) {
  hoja_(HOJA_RESULTADOS).getRange(m.fila, 1, 1, NCOL_RES).setValues([partidoAFila_(m)]);
}

function escribirPartidosNuevos_(partidos) {
  const h = hoja_(HOJA_RESULTADOS);
  const filas = partidos.map(partidoAFila_);
  h.getRange(h.getLastRow() + 1, 1, filas.length, NCOL_RES).setValues(filas);
}

function lado_(m, lado) {
  return lado === 'A' ? { ids: m.idsA, nombres: m.nomA } : { ids: m.idsB, nombres: m.nomB };
}

function asignarLado_(m, lado, o) {
  if (lado === 'A') { m.idsA = o.ids.slice(); m.nomA = o.nombres.slice(); }
  else { m.idsB = o.ids.slice(); m.nomB = o.nombres.slice(); }
}

function partidoACliente_(m) {
  return {
    id: m.id, categoria: m.categoria, ronda: m.ronda, grupo: m.grupo, orden: m.orden, estado: m.estado,
    a: { id: partId_(m.idsA), ids: m.idsA, nombre: m.nomA.join(' / ') },
    b: { id: partId_(m.idsB), ids: m.idsB, nombre: m.nomB.join(' / ') },
    sets: m.sets, ganador: m.ganador,
    registrado: m.registrado instanceof Date ? m.registrado.getTime() : 0
  };
}

// Todo lo de una jornada de una sola vez (inscritos, competiciones y partidos)
function getEstado(pin, idJornada) {
  comprobarPin_(pin);
  return {
    inscritos: leerInscritos_(idJornada).map(function (x) {
      return { categoria: x.categoria, id: x.id, ids: x.ids, nombres: x.nombres };
    }),
    competiciones: leerCompeticiones_(idJornada).map(function (c) {
      return { categoria: c.categoria, sistema: c.sistema, grupos: c.grupos, clasifican: c.clasifican };
    }),
    partidos: leerPartidos_(idJornada).map(partidoACliente_)
  };
}

// ===================== GENERAR PARTIDOS =====================
let contadorId_ = 0;
function idPartidoNuevo_() {
  contadorId_++;
  return 'P' + new Date().getTime() + '-' + contadorId_;
}

function nuevoPartido_(jornada, categoria, o) {
  return {
    id: idPartidoNuevo_(), jornada: jornada.id, fecha: parseFecha_(jornada.fecha), categoria: categoria,
    ronda: o.ronda, grupo: o.grupo || '', orden: o.orden, estado: 'Pendiente',
    idsA: [], idsB: [], nomA: [], nomB: [], sets: [], ganador: '', registrado: ''
  };
}

// Todos contra todos (método del círculo: reparte los descansos)
function todosContraTodos_(ids) {
  const p = ids.slice();
  if (p.length % 2) p.push('');
  const n = p.length;
  const pares = [];
  for (let r = 0; r < n - 1; r++) {
    for (let i = 0; i < n / 2; i++) {
      const x = p[i], y = p[n - 1 - i];
      if (x !== '' && y !== '') pares.push([x, y]);
    }
    p.splice(1, 0, p.pop());
  }
  return pares;
}

function partidosDeGrupo_(jornada, categoria, nombreGrupo, ids, porId) {
  return todosContraTodos_(ids).map(function (par, i) {
    const p = nuevoPartido_(jornada, categoria, { ronda: 'Fase de grupos', grupo: nombreGrupo, orden: i + 1 });
    asignarLado_(p, 'A', { ids: porId[par[0]].ids, nombres: porId[par[0]].nombres });
    asignarLado_(p, 'B', { ids: porId[par[1]].ids, nombres: porId[par[1]].nombres });
    return p;
  });
}

function nombreRondaElim_(m) {
  return { 1: 'Final', 2: 'Semifinal', 4: 'Cuartos', 8: 'Octavos', 16: 'Dieciseisavos' }[m] || ('Ronda de ' + (m * 2));
}

// seeds: participantes en las posiciones del cuadro (pares consecutivos se enfrentan); '' = pase directo
function partidosEliminatoria_(jornada, categoria, seeds, porId) {
  const rondas = [];
  for (let m = seeds.length / 2; m >= 1; m = m / 2) {
    const lista = [];
    for (let i = 0; i < m; i++) lista.push(nuevoPartido_(jornada, categoria, { ronda: nombreRondaElim_(m), orden: i + 1 }));
    rondas.push(lista);
  }
  rondas[0].forEach(function (p, i) {
    const x = seeds[2 * i], y = seeds[2 * i + 1];
    if (x) asignarLado_(p, 'A', { ids: porId[x].ids, nombres: porId[x].nombres });
    if (y) asignarLado_(p, 'B', { ids: porId[y].ids, nombres: porId[y].nombres });
    if (!x || !y) { p.estado = 'Bye'; p.ganador = x ? 'A' : 'B'; }
  });
  if (rondas.length > 1) {
    rondas[0].forEach(function (p, i) {
      if (p.estado === 'Bye') asignarLado_(rondas[1][Math.floor(i / 2)], i % 2 === 0 ? 'A' : 'B', lado_(p, p.ganador));
    });
  }
  return [].concat.apply([], rondas);
}

function validarReparto_(permitidos, ids) {
  if (ids.length !== permitidos.length) throw new Error('Faltan o sobran participantes en el reparto.');
  ids.forEach(function (x, i) {
    if (ids.indexOf(x) !== i) throw new Error('Hay un participante repetido.');
    if (permitidos.indexOf(x) === -1) throw new Error('Participante no válido.');
  });
}

function validarSeeds_(permitidos, seeds, obligatorios) {
  const S = (seeds || []).length;
  if (S < 2 || (S & (S - 1)) !== 0) throw new Error('El cuadro debe tener 2, 4, 8, 16... posiciones.');
  const reales = seeds.filter(Boolean).map(String);
  if (reales.length < 2) throw new Error('Hacen falta al menos 2 participantes en el cuadro.');
  reales.forEach(function (x, i) {
    if (reales.indexOf(x) !== i) throw new Error('Hay un participante repetido en el cuadro.');
    if (permitidos.indexOf(x) === -1) throw new Error('Participante no válido en el cuadro.');
  });
  if (obligatorios && reales.length !== permitidos.length) throw new Error('Faltan participantes por colocar en el cuadro.');
  for (let i = 0; i < S; i += 2) {
    if (!seeds[i] && !seeds[i + 1]) throw new Error('Hay un partido sin ningún participante en la primera ronda.');
  }
}

// cfg = { sistema:'LIGA' }
//     | { sistema:'GRUPOS', clasifican:2, grupos:[[idPart,...],[...]] }
//     | { sistema:'ELIM', seeds:[idPart|'', ...] }
function crearCompeticion(pin, idJornada, categoria, cfg) {
  comprobarPin_(pin);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const jornada = jornadaPorId_(idJornada);
    comprobarCategoria_(jornada, categoria);
    if (competicionDe_(idJornada, categoria)) {
      throw new Error('Esta categoría ya tiene la competición creada. Reiníciala si quieres rehacerla.');
    }
    const insc = leerInscritos_(idJornada, categoria);
    if (insc.length < 2) throw new Error('Hacen falta al menos 2 participantes.');
    const porId = {};
    insc.forEach(function (x) { porId[x.id] = x; });
    const todosIds = insc.map(function (x) { return x.id; });

    let partidos = [];
    let numGrupos = 0, clasifican = 0;

    if (cfg.sistema === 'LIGA') {
      numGrupos = 1;
      partidos = partidosDeGrupo_(jornada, categoria, 'Único', todosIds, porId);
    } else if (cfg.sistema === 'GRUPOS') {
      const grupos = (cfg.grupos || []).map(function (g) { return g.map(String); });
      if (grupos.length < 2) throw new Error('Con fase de grupos hacen falta al menos 2 grupos.');
      validarReparto_(todosIds, [].concat.apply([], grupos));
      grupos.forEach(function (g) {
        if (g.length < 2) throw new Error('Cada grupo necesita al menos 2 participantes.');
      });
      clasifican = Number(cfg.clasifican);
      const minTam = Math.min.apply(null, grupos.map(function (g) { return g.length; }));
      if (!(clasifican >= 1 && clasifican <= minTam)) {
        throw new Error('Los clasificados por grupo no pueden ser más que los del grupo más pequeño (' + minTam + ').');
      }
      numGrupos = grupos.length;
      grupos.forEach(function (g, i) {
        partidos = partidos.concat(partidosDeGrupo_(jornada, categoria, String.fromCharCode(65 + i), g, porId));
      });
    } else if (cfg.sistema === 'ELIM') {
      const seeds = (cfg.seeds || []).map(function (s) { return s ? String(s) : ''; });
      validarSeeds_(todosIds, seeds, true);
      partidos = partidosEliminatoria_(jornada, categoria, seeds, porId);
    } else {
      throw new Error('Sistema de competición no válido.');
    }

    escribirPartidosNuevos_(partidos);
    hoja_(HOJA_COMPETICIONES).appendRow([idJornada, categoria, cfg.sistema, numGrupos, clasifican, new Date()]);
  } finally {
    lock.releaseLock();
  }
  return true;
}

// Crea el cuadro eliminatorio tras la fase de grupos. seeds: posiciones del cuadro ('' = pase directo)
function generarEliminatoria(pin, idJornada, categoria, seeds) {
  comprobarPin_(pin);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const jornada = jornadaPorId_(idJornada);
    const comp = competicionDe_(idJornada, categoria);
    if (!comp || comp.sistema !== 'GRUPOS') throw new Error('Esta categoría no tiene fase de grupos.');
    const partidos = leerPartidos_(idJornada, categoria);
    if (partidos.some(function (p) { return p.ronda !== 'Fase de grupos'; })) throw new Error('La eliminatoria ya está generada.');
    const pendientes = partidos.filter(function (p) { return p.estado !== 'Jugado'; }).length;
    if (pendientes) throw new Error('Faltan ' + pendientes + ' partidos de grupo por jugar.');

    const insc = leerInscritos_(idJornada, categoria);
    const porId = {};
    insc.forEach(function (x) { porId[x.id] = x; });
    const lista = (seeds || []).map(function (s) { return s ? String(s) : ''; });
    const detalle = detalleCompeticion_(idJornada, categoria);
    const clasificados = [];
    Object.keys(detalle.clasificacion).sort().forEach(function (g) {
      detalle.clasificacion[g].slice(0, comp.clasifican).forEach(function (x) { clasificados.push(String(x.id)); });
    });
    const reales = lista.filter(Boolean).map(String);
    if (reales.length !== clasificados.length) throw new Error('El cuadro final debe contener exactamente a todos los clasificados.');
    clasificados.slice().sort().forEach(function (id, i, arr) {
      if (arr.indexOf(id) !== i || reales.indexOf(id) === -1) throw new Error('Los clasificados del cuadro no son válidos.');
    });
    validarSeeds_(clasificados, lista, false);
    escribirPartidosNuevos_(partidosEliminatoria_(jornada, categoria, lista, porId));
  } finally {
    lock.releaseLock();
  }
  return true;
}

// Borra la competición de una categoría (partidos, resultados individuales y sorteo). Deja los inscritos.
function reiniciarCompeticion(pin, idJornada, categoria) {
  comprobarPin_(pin);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const comp = competicionDe_(idJornada, categoria);
    if (!comp) throw new Error('Esta categoría no tiene competición creada.');
    const partidos = leerPartidos_(idJornada, categoria);
    borrarFilas_(hoja_(HOJA_RESULTADOS), partidos.map(function (p) { return p.fila; }));
    hoja_(HOJA_COMPETICIONES).deleteRow(comp.fila);
    reconstruirResultadosIndividuales_();
  } finally {
    lock.releaseLock();
  }
  return true;
}

// ===================== RESULTADOS =====================
// Valida el marcador y devuelve { sets, setsA, setsB, puntosA, puntosB }
function validarSets_(setsEntrada) {
  const sets = (setsEntrada || []).map(function (s) { return [Number(s[0]), Number(s[1])]; });
  if (!sets.length || sets.length > 3) throw new Error('El marcador debe tener entre 1 y 3 sets.');

  let setsA = 0, setsB = 0, puntosA = 0, puntosB = 0;
  sets.forEach(function (s, i) {
    if (!isFinite(s[0]) || !isFinite(s[1]) || s[0] < 0 || s[1] < 0 || s[0] % 1 !== 0 || s[1] % 1 !== 0) {
      throw new Error('Marcador no válido en el set ' + (i + 1) + '.');
    }
    if (s[0] === s[1]) throw new Error('El set ' + (i + 1) + ' no puede acabar en empate.');
    if (setsA === 2 || setsB === 2) throw new Error('El partido ya estaba decidido antes del set ' + (i + 1) + '.');
    if (s[0] > s[1]) setsA++; else setsB++;
    puntosA += s[0];
    puntosB += s[1];
  });
  if (sets.length > 1 && Math.max(setsA, setsB) < 2) {
    throw new Error('Al mejor de 3 sets, alguien tiene que ganar 2.');
  }
  return { sets: sets, setsA: setsA, setsB: setsB, puntosA: puntosA, puntosB: puntosB };
}

// A qué partido de la siguiente ronda pasa el ganador (null si es la final o fase de grupos)
function siguientePartido_(delComp, m) {
  if (m.ronda === 'Fase de grupos') return null;
  const elim = delComp.filter(function (x) { return x.ronda !== 'Fase de grupos'; });
  const conteo = {};
  elim.forEach(function (x) { conteo[x.ronda] = (conteo[x.ronda] || 0) + 1; });
  const rondas = Object.keys(conteo).sort(function (a, b) { return conteo[b] - conteo[a]; });
  const k = rondas.indexOf(m.ronda);
  if (k === -1 || k === rondas.length - 1) return null;
  const orden = Math.ceil(m.orden / 2);
  const p = elim.filter(function (x) { return x.ronda === rondas[k + 1] && x.orden === orden; })[0];
  return p ? { partido: p, lado: m.orden % 2 === 1 ? 'A' : 'B' } : null;
}

function borrarIndividualesDe_(idsPartido) {
  // Se mantiene por compatibilidad, pero los resultados acumulados se reconstruyen completos.
  reconstruirResultadosIndividuales_();
}

function asegurarCabeceraIndividual_() {
  const h = hoja_(HOJA_INDIVIDUAL);
  h.getRange(1, 1, 1, CAB_INDIVIDUAL.length).setValues([CAB_INDIVIDUAL]);
}

function indiceRonda_(ronda) {
  const mapa = {
    'Fase de grupos': 0,
    'Dieciseisavos': 1,
    'Octavos': 2,
    'Cuartos': 3,
    'Semifinal': 4,
    'Final': 5
  };
  return Object.prototype.hasOwnProperty.call(mapa, ronda) ? mapa[ronda] : 0;
}

// ---------------------------------------------------------------------
// PUNTUACIÓN (igual para los tres sistemas de competición)
//   Eliminatorias: Campeón 100 | Subcampeón 85 | Semifinalistas 70 | Cuartos 55 | Octavos 40 | Dieciseisavos 25
// Perder en una ronda da siempre los mismos puntos, en eliminatoria directa y en el cuadro final.
// Fase de grupos: 10 de base + 5 por victoria. Si pasas al cuadro final, los puntos de la ronda
// que corresponda (con tope por debajo de la ronda más baja del cuadro para los eliminados en grupos).
// Grupo único (todos contra todos): por posición, 1º 100 y 15 menos por puesto (100, 85, 70, 55, 40, 25, 10), mínimo 10.
// ---------------------------------------------------------------------
const PUNTOS_CAMPEON = 100;
const PUNTOS_FINALISTA = 85;
const PUNTOS_SEMIFINAL = 70;
const PUNTOS_CUARTOS = 55;
const PUNTOS_OCTAVOS = 40;
const PUNTOS_DIECISEISAVOS = 25;
const PUNTOS_BASE_GRUPO = 10;      // base por participar en la fase de grupos
const PUNTOS_VICTORIA_GRUPO = 5;   // por cada victoria en la fase de grupos

// Grupo único (todos contra todos): 1º 100 y cada puesto siguiente 15 puntos menos
// (100, 85, 70, 55, 40, 25, 10). El mínimo es 10.
function puntosPorPosicion_(pos) {
  pos = Number(pos) || 0;
  return Math.max(PUNTOS_BASE_GRUPO, PUNTOS_CAMPEON - 15 * (Math.max(pos, 1) - 1));
}

// Cuadro: puntos de quien pierde en la ronda con índice idxRonda.
function puntosPorRondaPerdida_(idxRonda) {
  if (idxRonda >= 5) return PUNTOS_FINALISTA;       // pierde la final
  if (idxRonda === 4) return PUNTOS_SEMIFINAL;      // pierde semifinal
  if (idxRonda === 3) return PUNTOS_CUARTOS;        // pierde cuartos
  if (idxRonda === 2) return PUNTOS_OCTAVOS;        // pierde octavos
  if (idxRonda === 1) return PUNTOS_DIECISEISAVOS;  // pierde dieciseisavos
  return PUNTOS_BASE_GRUPO;
}

// Puntos de un jugador dentro de un cuadro (eliminatoria directa o cuadro final).
// Si aún sigue vivo, se le da la puntuación asegurada de la ronda en la que está.
function puntosCuadro_(x) {
  if (x.finalJugado) return x.finalGanada ? PUNTOS_CAMPEON : PUNTOS_FINALISTA;
  const perdio = x.elimPartidos > 0 && !x.elimUltimaGanada;
  if (perdio) return puntosPorRondaPerdida_(x.elimRonda);
  const idx = Math.max(x.elimRondaActual, x.elimPartidos > 0 ? x.elimRonda + 1 : 0);
  if (idx <= 0) return 0;
  return puntosPorRondaPerdida_(idx);
}

// Grupos + eliminatoria. bandaMinCuadro = puntos de quien pierde en la primera ronda
// del cuadro (null si el cuadro aún no está generado).
function puntosGruposEliminatoria_(x, bandaMinCuadro) {
  if (x.elimRondaActual > 0) return puntosCuadro_(x);
  const base = PUNTOS_BASE_GRUPO + (Number(x.grupoVictorias) || 0) * PUNTOS_VICTORIA_GRUPO;
  if (bandaMinCuadro == null) return base;
  return Math.min(base, Math.max(PUNTOS_BASE_GRUPO, bandaMinCuadro - 1));
}

// Una sola fila por jugador y jornada/categoría.
// Acumula todos sus partidos y calcula Puntos/Diferencia automáticamente.
function reconstruirResultadosIndividuales_() {
  asegurarCabeceraIndividual_();
  const h = hoja_(HOJA_INDIVIDUAL);
  const res = hoja_(HOJA_RESULTADOS).getDataRange().getValues();
  const socios = leerSocios_();
  const acc = {};

  function nombre(id) { return nombreSocio_(socios, id); }
  function get(key, id, jornada, fecha, categoria) {
    if (!acc[key]) {
      acc[key] = {
        id: id, nombre: nombre(id), jornada: jornada, fecha: fecha, categoria: categoria,
        ronda: '', rondaIdx: 0, idPartido: '', victoria: 0, derrotas: 0, setsG: 0, setsP: 0,
        pf: 0, pc: 0
      };
    }
    return acc[key];
  }

  // Todos los inscritos deben tener fila aunque todavía no hayan jugado.
  // En dobles, la categoría almacenada en ResultadosIndividuales es la modalidad real
  // de ranking de la pareja (DM, DF o DX).
  leerJornadas_().forEach(function (j) {
    leerCompeticiones_(j.id).forEach(function (comp) {
      leerInscritos_(j.id, comp.categoria).forEach(function (ins) {
        const catRanking = comp.categoria.charAt(0) === 'D'
          ? categoriaRankingDobles_(comp.categoria, ins.ids, socios)
          : comp.categoria;
        ins.ids.forEach(function (id) {
          const key = j.id + '|' + catRanking + '|' + String(id);
          get(key, id, j.id, parseFecha_(j.fecha), catRanking);
        });
      });
    });
  });

  for (let i = 1; i < res.length; i++) {
    const f = res[i];
    if (!f[0] || String(f[7]) !== 'Jugado') continue;
    const jornada = String(f[1]);
    const categoriaFuente = String(f[3]);
    const ronda = String(f[4]);
    const idPartido = String(f[0]);
    const idsA = vacios_([f[8], f[9]]);
    const idsB = vacios_([f[10], f[11]]);
    const ganador = String(f[22]);
    const sets = [];
    for (let k = 0; k < 3; k++) {
      if (f[16 + 2*k] !== '' && f[17 + 2*k] !== '') sets.push([Number(f[16 + 2*k]), Number(f[17 + 2*k])]);
    }
    let setsA = 0, setsB = 0, pfA = 0, pfB = 0;
    sets.forEach(function(s) { if (s[0] > s[1]) setsA++; else setsB++; pfA += Number(s[0]); pfB += Number(s[1]); });
    const idx = indiceRonda_(ronda);

    idsA.concat(idsB).forEach(function(id) {
      const esA = idsA.indexOf(String(id)) !== -1;
      const idsEquipo = esA ? idsA : idsB;
      const catRanking = categoriaFuente.charAt(0) === 'D'
        ? categoriaRankingDobles_(categoriaFuente, idsEquipo, socios)
        : categoriaFuente;
      const key = jornada + '|' + catRanking + '|' + String(id);
      const x = get(key, id, jornada, f[2], catRanking);
      const gana = (ganador === 'A' && esA) || (ganador === 'B' && !esA);
      x.victoria += gana ? 1 : 0;
      x.derrotas += gana ? 0 : 1;
      x.setsG += esA ? setsA : setsB;
      x.setsP += esA ? setsB : setsA;
      x.pf += esA ? pfA : pfB;
      x.pc += esA ? pfB : pfA;
      x.idPartido = idPartido;
      if (idx > x.rondaIdx) { x.rondaIdx = idx; x.ronda = ronda; }
    });
  }

  // Mapa de puntos por jugador y categoría de ranking.
  const puntosMap = {};
  const combos = {};
  Object.keys(acc).forEach(function(key) {
    const parts = key.split('|');
    combos[parts[0] + '|' + parts[1]] = true;
  });

  Object.keys(combos).forEach(function(combo) {
    const parts = combo.split('|');
    const jornada = parts[0], categoriaRankingObjetivo = parts[1];
    const comps = leerCompeticiones_(jornada);
    comps.forEach(function(comp) {
      const inscritos = leerInscritos_(jornada, comp.categoria);
      const partidos = leerPartidos_(jornada, comp.categoria);
      const grupos = construirClasificacion_(inscritos, partidos, comp);
      Object.keys(grupos).forEach(function(g) {
        grupos[g].forEach(function(x) {
          const catRanking = comp.categoria.charAt(0) === 'D'
            ? categoriaRankingDobles_(comp.categoria, x.ids, socios)
            : comp.categoria;
          if (catRanking !== categoriaRankingObjetivo) return;
          (x.ids || []).forEach(function(id) {
            puntosMap[jornada + '|' + catRanking + '|' + String(id)] = Number(x.pts || 0);
          });
        });
      });
    });
  });

  const filas = Object.keys(acc).map(function(key) {
    const x = acc[key];
    const ronda = x.ronda || 'Fase de grupos';
    return [
      idNum_(x.id), x.nombre, x.jornada, x.fecha, x.categoria, ronda, x.idPartido,
      x.victoria, x.setsG, x.setsP, x.pf, x.pc,
      Number(puntosMap[key] || 0), x.pf - x.pc, x.derrotas
    ];
  });

  const last = h.getLastRow();
  if (last > 1) h.getRange(2, 1, last - 1, Math.max(h.getLastColumn(), CAB_INDIVIDUAL.length)).clearContent();
  if (filas.length) h.getRange(2, 1, filas.length, CAB_INDIVIDUAL.length).setValues(filas);
}
// Guarda (o corrige) el resultado de un partido ya generado. sets: [[a,b],...]
function guardarResultado(pin, idPartido, setsEntrada) {
  comprobarPin_(pin);
  const r = validarSets_(setsEntrada);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const todos = leerPartidos_();
    const m = todos.filter(function (x) { return x.id === String(idPartido); })[0];
    if (!m) throw new Error('No encuentro ese partido.');
    if (m.estado === 'Bye') throw new Error('Ese partido es un pase directo, no se juega.');
    if (!m.idsA.length || !m.idsB.length) throw new Error('Todavía no se conocen los dos participantes de este partido.');

    const ganaA = r.setsA > r.setsB;
    const lado = ganaA ? 'A' : 'B';
    const delComp = todos.filter(function (x) { return x.jornada === m.jornada && x.categoria === m.categoria; });
    const sig = siguientePartido_(delComp, m);
    if (sig && sig.partido.estado === 'Jugado' && m.ganador !== lado) {
      throw new Error('Cambiar el ganador afecta a un partido ya jugado de la siguiente ronda. Borra antes ese resultado.');
    }

    m.sets = r.sets;
    m.estado = 'Jugado';
    m.ganador = lado;
    m.registrado = new Date();
    escribirPartido_(m);

    if (sig) {
      asignarLado_(sig.partido, sig.lado, lado_(m, lado));
      escribirPartido_(sig.partido);
    }

    reconstruirResultadosIndividuales_();
  } finally {
    lock.releaseLock();
  }
  return true;
}

// Quita el resultado de un partido (vuelve a "Pendiente")
function borrarResultado(pin, idPartido) {
  comprobarPin_(pin);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const todos = leerPartidos_();
    const m = todos.filter(function (x) { return x.id === String(idPartido); })[0];
    if (!m) throw new Error('No encuentro ese partido.');
    if (m.estado !== 'Jugado') throw new Error('Ese partido no tiene resultado.');

    const delComp = todos.filter(function (x) { return x.jornada === m.jornada && x.categoria === m.categoria; });
    const sig = siguientePartido_(delComp, m);
    if (sig && sig.partido.estado === 'Jugado') throw new Error('Borra antes el resultado de la siguiente ronda.');
    if (sig) {
      asignarLado_(sig.partido, sig.lado, { ids: [], nombres: [] });
      escribirPartido_(sig.partido);
    }

    m.sets = [];
    m.estado = 'Pendiente';
    m.ganador = '';
    m.registrado = '';
    escribirPartido_(m);
    reconstruirResultadosIndividuales_();
  } finally {
    lock.releaseLock();
  }
  return true;
}

// Recalcula la hoja ResultadosIndividuales desde la hoja Resultados.
// Ejecútala a mano UNA VEZ desde el editor (elige esta función arriba y pulsa Ejecutar) para que
// las jornadas antiguas tengan también la columna Derrotas. Después se mantiene sola.
function actualizarResultadosIndividuales() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    reconstruirResultadosIndividuales_();
  } finally {
    lock.releaseLock();
  }
  return true;
}

// ===================== BORRAR JORNADA =====================
// Borra la jornada y TODO lo que cuelga de ella: inscripciones, competiciones, partidos y
// resultados individuales (los que alimentan el ranking). También desaparece del Google Sheet.
// Se borra de más "dependiente" a menos, y la fila de Jornadas la última: si algo fallara a medias,
// la jornada seguiría en la lista y se podría volver a borrar.
function asegurarCabeceraJornadas_() {
  const h = hoja_(HOJA_JORNADAS);
  h.getRange(1, 1, 1, CAB_JORNADAS.length).setValues([CAB_JORNADAS]);
}

function guardarJornadaDefinitiva(pin, idJornada) {
  comprobarPin_(pin);
  asegurarCabeceraJornadas_();
  const id = String(idJornada || '');
  if (!id) throw new Error('Falta la jornada.');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const datos = hoja_(HOJA_JORNADAS).getDataRange().getValues();
    for (let i = 1; i < datos.length; i++) {
      if (String(datos[i][0]) === id) {
        if (String(datos[i][8] || '').toUpperCase() === 'DEFINITIVA') throw new Error('La jornada ya está guardada definitivamente.');
        hoja_(HOJA_JORNADAS).getRange(i + 1, 9).setValue('DEFINITIVA');
        return true;
      }
    }
    throw new Error('No encuentro esa jornada.');
  } finally {
    lock.releaseLock();
  }
}

function borrarJornada(pin, idJornada) {
  comprobarPin_(pin);
  const id = String(idJornada || '');
  if (!id) throw new Error('Falta la jornada que se quiere borrar.');

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  const borrado = {};
  try {
    const jornada = jornadaPorId_(id); // comprueba que existe
    if (jornada.definitiva) throw new Error('La jornada está guardada definitivamente y no se puede borrar.');
    [
      { nombre: HOJA_INDIVIDUAL, col: 2 },      // ID_Jornada está en la columna C
      { nombre: HOJA_RESULTADOS, col: 1 },      // columna B
      { nombre: HOJA_COMPETICIONES, col: 0 },   // columna A
      { nombre: HOJA_INSCRIPCIONES, col: 0 },   // columna A
      { nombre: HOJA_JORNADAS, col: 0 }         // columna A
    ].forEach(function (d) {
      const h = hoja_(d.nombre);
      const datos = h.getDataRange().getValues();
      const filas = [];
      for (let i = 1; i < datos.length; i++) {
        if (String(datos[i][d.col]) === id) filas.push(i + 1);
      }
      if (filas.length) borrarFilas_(h, filas);
      borrado[d.nombre] = filas.length;
    });
  } finally {
    lock.releaseLock();
  }
  return { jornada: id, borrado: borrado };
}

// ===================== API NUEVA PARA EL GESTOR =====================
function participanteCliente_(x) {
  return {
    id: x.id,
    ids: x.ids,
    nombres: x.nombres,
    nombre: x.nombres.join(' / ')
  };
}

function competicionCliente_(c) {
  if (!c) return null;
  return {
    categoria: c.categoria,
    sistema: c.sistema,
    grupos: c.grupos,
    clasifican: c.clasifican
  };
}

function resultadoGrupoDePartido_(p) {
  if (p.ronda !== 'Fase de grupos' || p.estado !== 'Jugado') return null;
  return {
    ganador: p.ganador,
    idsA: p.idsA,
    idsB: p.idsB,
    sets: p.sets
  };
}

function construirClasificacion_(inscritos, partidos, comp) {
  const porId = {};
  inscritos.forEach(function (x) {
    porId[x.id] = {
      id: x.id, ids: x.ids.slice(), nombres: x.nombres.slice(), nombre: x.nombres.join(' / '),
      grupo: '', PJ: 0, G: 0, P: 0, pts: 0, SF: 0, SC: 0, PF: 0, PC: 0,
      GSF: 0, GSC: 0, GPF: 0, GPC: 0,
      grupoVictorias: 0,
      elimRonda: 0, elimRondaActual: 0, elimPartidos: 0, elimUltimaGanada: false,
      finalJugado: false, finalGanada: false
    };
  });

  // El tramo actual del cuadro se determina por la casilla en la que está el jugador,
  // incluso aunque todavía no haya disputado el partido de esa ronda.
  partidos.forEach(function (m) {
    if (m.ronda === 'Fase de grupos') return;
    const idx = indiceRonda_(m.ronda);
    [m.idsA, m.idsB].forEach(function (ids) {
      if (!ids || !ids.length) return;
      const x = porId[partId_(ids)];
      if (x && idx > x.elimRondaActual) x.elimRondaActual = idx;
    });
  });

  partidos.forEach(function (m) {
    if (m.estado === 'Bye') return;
    if (m.estado !== 'Jugado') return;
    const aId = partId_(m.idsA), bId = partId_(m.idsB);
    const A = porId[aId], B = porId[bId];
    if (!A || !B) return;
    if (m.grupo) { A.grupo = m.grupo; B.grupo = m.grupo; }

    let sfA = 0, sfB = 0, pfA = 0, pfB = 0;
    m.sets.forEach(function (s) { if (s[0] > s[1]) sfA++; else sfB++; pfA += Number(s[0]); pfB += Number(s[1]); });
    A.PJ++; B.PJ++;
    A.SF += sfA; A.SC += sfB; A.PF += pfA; A.PC += pfB;

    if (m.ronda === 'Fase de grupos') {
      A.G += m.ganador === 'A' ? 1 : 0; B.G += m.ganador === 'B' ? 1 : 0;
      A.P += m.ganador === 'B' ? 1 : 0; B.P += m.ganador === 'A' ? 1 : 0;
      A.GSF += sfA; A.GSC += sfB; A.GPF += pfA; A.GPC += pfB;
      B.GSF += sfB; B.GSC += sfA; B.GPF += pfB; B.GPC += pfA;
      if (m.ganador === 'A') A.grupoVictorias++;
      if (m.ganador === 'B') B.grupoVictorias++;
    } else {
      A.G += m.ganador === 'A' ? 1 : 0; B.G += m.ganador === 'B' ? 1 : 0;
      A.P += m.ganador === 'B' ? 1 : 0; B.P += m.ganador === 'A' ? 1 : 0;
      const idx = indiceRonda_(m.ronda);
      [[A, m.ganador === 'A'], [B, m.ganador === 'B']].forEach(function(par) {
        const x = par[0];
        x.elimPartidos++;
        if (idx > x.elimRonda) { x.elimRonda = idx; x.elimUltimaGanada = par[1]; }
      });
      if (m.ronda === 'Final') {
        A.finalJugado = true; B.finalJugado = true;
        A.finalGanada = m.ganador === 'A'; B.finalGanada = m.ganador === 'B';
      }
    }
  });

  // Primera ronda del cuadro final (para el tope de los eliminados en grupos).
  let minIdxCuadro = 0;
  partidos.forEach(function (m) {
    if (m.ronda === 'Fase de grupos') return;
    const i = indiceRonda_(m.ronda);
    if (i > 0 && (minIdxCuadro === 0 || i < minIdxCuadro)) minIdxCuadro = i;
  });
  const bandaMinCuadro = minIdxCuadro > 0 ? puntosPorRondaPerdida_(minIdxCuadro) : null;

  const grupos = {};
  Object.keys(porId).forEach(function (id) {
    const x = porId[id];
    x.diffSets = x.SF - x.SC;
    x.diffPuntos = x.PF - x.PC;
    x.diffSetsGrupo = x.GSF - x.GSC;
    x.diffPuntosGrupo = x.GPF - x.GPC;
    const g = x.grupo || 'Sin grupo';
    if (!grupos[g]) grupos[g] = [];
    grupos[g].push(x);
  });

  Object.keys(grupos).forEach(function (g) {
    grupos[g].sort(function (a, b) {
      return b.grupoVictorias - a.grupoVictorias ||
        b.diffSetsGrupo - a.diffSetsGrupo ||
        b.diffPuntosGrupo - a.diffPuntosGrupo ||
        a.nombre.localeCompare(b.nombre, 'es');
    });

    grupos[g].forEach(function (x, index) {
      if (comp && comp.sistema === 'LIGA') {
        x.pts = puntosPorPosicion_(index + 1);
      } else if (comp && comp.sistema === 'GRUPOS') {
        x.pts = puntosGruposEliminatoria_(x, bandaMinCuadro);
      } else {
        x.pts = puntosCuadro_(x);
      }
    });
  });
  return grupos;
}

function detalleCompeticion_(idJornada, categoria) {
  const comp = competicionDe_(idJornada, categoria);
  const inscritos = leerInscritos_(idJornada, categoria);
  const partidos = leerPartidos_(idJornada, categoria);
  const grupos = construirClasificacion_(inscritos, partidos, comp);

  return {
    competicion: competicionCliente_(comp),
    participantes: inscritos.map(participanteCliente_),
    partidos: partidos.map(partidoACliente_),
    clasificacion: grupos,
    todosGruposTerminados: partidos.filter(function (p) {
      return p.ronda === 'Fase de grupos' && p.estado !== 'Jugado';
    }).length === 0,
    partidosGrupo: partidos.filter(function (p) {
      return p.ronda === 'Fase de grupos';
    }).length,
    partidosGrupoJugados: partidos.filter(function (p) {
      return p.ronda === 'Fase de grupos' && p.estado === 'Jugado';
    }).length
  };
}

function getCompeticionDetalle(pin, idJornada, categoria) {
  comprobarPin_(pin);
  const jornada = jornadaPorId_(idJornada);
  comprobarCategoria_(jornada, categoria);
  return detalleCompeticion_(idJornada, categoria);
}

function getCategoriasJornada(pin, idJornada) {
  comprobarPin_(pin);
  const jornada = jornadaPorId_(idJornada);
  const comps = leerCompeticiones_(idJornada);
  const inscritos = leerInscritos_(idJornada);
  const todosPartidos = leerPartidos_(idJornada);
  return CATEGORIAS[jornada.modalidad].map(function (categoria) {
    const ins = inscritos.filter(function (x) { return x.categoria === categoria; });
    const comp = comps.filter(function (x) { return x.categoria === categoria; })[0] || null;
    const partidos = todosPartidos.filter(function (p) { return p.categoria === categoria; });
    return {
      categoria: categoria,
      inscritos: ins.map(participanteCliente_),
      numeroParticipantes: ins.length,
      competicion: competicionCliente_(comp),
      totalPartidos: partidos.length,
      jugados: partidos.filter(function (p) { return p.estado === 'Jugado'; }).length
    };
  });
}

// Permite rehacer el reparto de una competición sin tocar las inscripciones.
// Útil si el organizador quiere volver a sortear grupos o cuadro antes de empezar.
// Solo se permite mientras no haya partidos jugados.
function reconstruirCompeticion(pin, idJornada, categoria, cfg) {
  comprobarPin_(pin);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const comp = competicionDe_(idJornada, categoria);
    if (!comp) throw new Error('No existe la competición.');
    const partidos = leerPartidos_(idJornada, categoria);
    if (partidos.some(function (p) { return p.estado === 'Jugado'; })) {
      throw new Error('Ya hay resultados registrados. No se puede reconstruir sin borrar primero los resultados.');
    }

    borrarFilas_(hoja_(HOJA_RESULTADOS), partidos.map(function (p) { return p.fila; }));
    const hComp = hoja_(HOJA_COMPETICIONES);
    hComp.deleteRow(comp.fila);

    const jornada = jornadaPorId_(idJornada);
    const insc = leerInscritos_(idJornada, categoria);
    if (insc.length < 2) throw new Error('Hacen falta al menos 2 participantes.');
    const porId = {};
    insc.forEach(function (x) { porId[x.id] = x; });
    const todosIds = insc.map(function (x) { return x.id; });

    let nuevos = [], numGrupos = 0, clasifican = 0;
    if (cfg.sistema === 'LIGA') {
      numGrupos = 1;
      nuevos = partidosDeGrupo_(jornada, categoria, 'Único', todosIds, porId);
    } else if (cfg.sistema === 'GRUPOS') {
      const grupos = (cfg.grupos || []).map(function (g) { return g.map(String); });
      if (grupos.length < 2) throw new Error('Hacen falta al menos 2 grupos.');
      validarReparto_(todosIds, [].concat.apply([], grupos));
      grupos.forEach(function (g) {
        if (g.length < 2) throw new Error('Cada grupo necesita al menos 2 participantes.');
      });
      clasifican = Number(cfg.clasifican);
      const minTam = Math.min.apply(null, grupos.map(function (g) { return g.length; }));
      if (!(clasifican >= 1 && clasifican <= minTam)) throw new Error('Clasificados no válidos.');
      numGrupos = grupos.length;
      grupos.forEach(function (g, i) {
        nuevos = nuevos.concat(partidosDeGrupo_(jornada, categoria, String.fromCharCode(65 + i), g, porId));
      });
    } else if (cfg.sistema === 'ELIM') {
      const seeds = (cfg.seeds || []).map(function (s) { return s ? String(s) : ''; });
      validarSeeds_(todosIds, seeds, true);
      nuevos = partidosEliminatoria_(jornada, categoria, seeds, porId);
    } else {
      throw new Error('Sistema no válido.');
    }

    escribirPartidosNuevos_(nuevos);
    hComp.appendRow([idJornada, categoria, cfg.sistema, numGrupos, clasifican, new Date()]);
  } finally {
    lock.releaseLock();
  }
  return detalleCompeticion_(idJornada, categoria);
}

// Devuelve los clasificados ordenados para que la interfaz pueda rellenar
// automáticamente un cuadro de fase final si el organizador lo desea.
function obtenerClasificados(pin, idJornada, categoria) {
  comprobarPin_(pin);
  const comp = competicionDe_(idJornada, categoria);
  if (!comp || comp.sistema !== 'GRUPOS') throw new Error('No hay una fase de grupos en esta categoría.');
  const detalle = detalleCompeticion_(idJornada, categoria);
  if (!detalle.todosGruposTerminados) throw new Error('Todavía quedan partidos de grupos por jugar.');

  const salida = [];
  Object.keys(detalle.clasificacion).sort().forEach(function (g) {
    detalle.clasificacion[g].slice(0, comp.clasifican).forEach(function (x, idx) {
      salida.push({
        grupo: g,
        puesto: idx + 1,
        id: x.id,
        ids: x.ids,
        nombre: x.nombre
      });
    });
  });
  return salida;
}