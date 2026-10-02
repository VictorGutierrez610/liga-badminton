// =====================================================================
//  RANKINGS DE LA Liga de viernes UNI · Temporada 2026/27  ·  proyecto de Apps Script APARTE del gestor
//  Solo LEE la hoja "ResultadosIndividuales" del mismo Google Sheet.
//  Archivos del proyecto:  este (Código.gs)  +  un HTML llamado "Ranking"
// =====================================================================

// Mismo Google Sheet que usa el gestor
const SHEET_ID = '19DM6m4Cq5Lxo8NwN1z5d1f12Ar4eAgIpsIjmFZ3qaHw';
const HOJA_INDIVIDUAL = 'ResultadosIndividuales';

// Cuántas jornadas cuentan para el ranking final de cada jugador
const MEJORES_JORNADAS = 3;

// Mes en el que empieza la temporada (9 = septiembre). Así las jornadas de una temporada
// nueva no se mezclan con las de la anterior. Pon 1 si la temporada es el año natural.
const MES_INICIO_TEMPORADA = 9;

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Ranking')
    .setTitle('Rankings de la Liga de viernes UNI · Temporada 2026/27')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ---------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------
function num_(v) {
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

// La fecha de la jornada sale del propio ID (J20260911 -> 2026-09-11). Si no se puede, de la columna Fecha.
function fechaDeJornada_(idJornada, fechaCelda, tz) {
  const m = /^J?(\d{4})(\d{2})(\d{2})$/.exec(String(idJornada).trim());
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  if (fechaCelda instanceof Date) return Utilities.formatDate(fechaCelda, tz, 'yyyy-MM-dd');
  const t = String(fechaCelda || '').trim();
  let x = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (x) return x[1] + '-' + x[2] + '-' + x[3];
  x = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(t);
  if (x) return x[3] + '-' + ('0' + x[2]).slice(-2) + '-' + ('0' + x[1]).slice(-2);
  return '';
}

function temporadaDe_(fechaIso) {
  const y = Number(fechaIso.slice(0, 4));
  const mes = Number(fechaIso.slice(5, 7));
  if (MES_INICIO_TEMPORADA === 1) return { id: String(y), etiqueta: String(y) };
  const inicio = mes >= MES_INICIO_TEMPORADA ? y : y - 1;
  const fin = String(inicio + 1).slice(2);
  return { id: inicio + '-' + fin, etiqueta: inicio + '/' + fin };
}

// Individual: IM-A, IF-A, IM-B, IF-B (con nivel). Dobles: DM, DF y DX (sin nivel A/B).
// Si en la hoja quedaran categorías antiguas de dobles (DM-A, DX-B...), se unifican quitando el nivel.
function normalizarCategoria_(cat) {
  const c = String(cat).trim().toUpperCase();
  const m = /^(DM|DF|DX)(-[AB])?$/.exec(c);
  return m ? m[1] : String(cat).trim();
}

// IM-A -> { tipo: 'IM', nivel: 'A' } ; DM -> { tipo: 'DM', nivel: '' }
function partirCategoria_(cat) {
  const p = String(cat).trim().split('-');
  return { tipo: p[0], nivel: p[1] || '' };
}

// Cada viernes es de una modalidad: Individual, Dobles (DM y DF) o Dobles mixtos (DX).
// Las columnas J1, J2... de cada ranking cuentan solo los viernes de su modalidad.
function modalidadDe_(cat) {
  const c = String(cat).charAt(0).toUpperCase();
  if (c !== 'D') return 'Individual';
  return String(cat).toUpperCase().indexOf('DX') === 0 ? 'Dobles mixtos' : 'Dobles';
}

// ---------------------------------------------------------------------
// Datos del ranking (lo que llama la página)
// ---------------------------------------------------------------------
function getRanking() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const hoja = ss.getSheetByName(HOJA_INDIVIDUAL);
  if (!hoja) throw new Error('No encuentro la hoja "' + HOJA_INDIVIDUAL + '" en el Google Sheet.');
  const tz = ss.getSpreadsheetTimeZone();

  const datos = hoja.getDataRange().getValues();
  const cab = {};
  (datos[0] || []).forEach(function (c, i) { cab[String(c).trim().toLowerCase()] = i; });
  ['id_jugador', 'nombre', 'id_jornada', 'categoria', 'victoria', 'puntosfavor', 'puntoscontra', 'puntos'].forEach(function (k) {
    if (cab[k] === undefined) throw new Error('Falta la columna "' + k + '" en la hoja ' + HOJA_INDIVIDUAL + '.');
  });
  const hayDerrotas = cab['derrotas'] !== undefined;

  // temporada -> { jornadas: {modalidad: {id: fecha}}, cats: {categoria: {idJugador: acumulado}} }
  const temporadas = {};
  for (let i = 1; i < datos.length; i++) {
    const f = datos[i];
    const idJugador = String(f[cab['id_jugador']]).trim();
    const idJornada = String(f[cab['id_jornada']]).trim();
    const categoria = normalizarCategoria_(f[cab['categoria']]);
    if (!idJugador || !idJornada || !categoria) continue;

    const fecha = fechaDeJornada_(idJornada, cab['fecha'] !== undefined ? f[cab['fecha']] : '', tz);
    if (!fecha) continue;
    const t = temporadaDe_(fecha);
    const T = temporadas[t.id] || (temporadas[t.id] = { id: t.id, etiqueta: t.etiqueta, jornadas: {}, cats: {} });

    const modalidad = modalidadDe_(categoria);
    (T.jornadas[modalidad] = T.jornadas[modalidad] || {})[idJornada] = fecha;

    const C = T.cats[categoria] = T.cats[categoria] || {};
    const J = C[idJugador] = C[idJugador] || { id: idJugador, nombre: '', porJornada: {}, PG: 0, PP: 0, PF: 0, PC: 0 };
    J.nombre = String(f[cab['nombre']]).trim() || J.nombre;
    const puntos = num_(f[cab['puntos']]);
    J.porJornada[idJornada] = Math.max(J.porJornada[idJornada] || 0, puntos);
    J.PG += num_(f[cab['victoria']]);
    J.PP += hayDerrotas ? num_(f[cab['derrotas']]) : 0;
    J.PF += num_(f[cab['puntosfavor']]);
    J.PC += num_(f[cab['puntoscontra']]);
  }

  const salida = Object.keys(temporadas).sort().reverse().map(function (tid) {
    const T = temporadas[tid];
    const categorias = {};
    Object.keys(T.cats).forEach(function (cat) {
      const modalidad = modalidadDe_(cat);
      const jornadas = Object.keys(T.jornadas[modalidad] || {})
        .map(function (id) { return { id: id, fecha: T.jornadas[modalidad][id] }; })
        .sort(function (a, b) { return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : (a.id < b.id ? -1 : 1); })
        .map(function (j, i) { return { n: i + 1, id: j.id, fecha: j.fecha }; });

      const jugadores = Object.keys(T.cats[cat]).map(function (idJ) {
        const J = T.cats[cat][idJ];
        const pts = jornadas.map(function (j) { return J.porJornada[j.id] === undefined ? null : J.porJornada[j.id]; });
        const jugadas = pts.filter(function (p) { return p !== null; }).sort(function (a, b) { return b - a; });
        const mejores = [];
        for (let k = 0; k < MEJORES_JORNADAS; k++) mejores.push(k < jugadas.length ? jugadas[k] : null);
        const total = mejores.reduce(function (s, p) { return s + (p || 0); }, 0);
        return {
          id: J.id, nombre: J.nombre, pts: pts, mejores: mejores, total: total,
          jornadasJugadas: jugadas.length,
          PG: J.PG, PP: hayDerrotas ? J.PP : null, difPartidos: hayDerrotas ? J.PG - J.PP : null,
          PF: J.PF, PC: J.PC, difPuntos: J.PF - J.PC
        };
      });

      // Orden: total de las mejores jornadas; en caso de empate -> victorias, diferencia de partidos,
      // diferencia de puntos, puntos a favor y, por último, el nombre.
      jugadores.sort(function (a, b) {
        return (b.total - a.total) ||
               (b.PG - a.PG) ||
               ((b.difPartidos || 0) - (a.difPartidos || 0)) ||
               (b.difPuntos - a.difPuntos) ||
               (b.PF - a.PF) ||
               String(a.nombre).localeCompare(String(b.nombre), 'es');
      });
      let pos = 0, anterior = null;
      jugadores.forEach(function (j, i) {
        const clave = [j.total, j.PG, j.difPartidos, j.difPuntos, j.PF].join('|');
        if (clave !== anterior) { pos = i + 1; anterior = clave; }
        j.pos = pos;
      });

      const p = partirCategoria_(cat);
      categorias[cat] = { categoria: cat, tipo: p.tipo, nivel: p.nivel, modalidad: modalidad, jornadas: jornadas, jugadores: jugadores };
    });
    return { id: T.id, etiqueta: T.etiqueta, categorias: categorias };
  });

  return {
    generado: Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy HH:mm'),
    mejoresJornadas: MEJORES_JORNADAS,
    hayDerrotas: hayDerrotas,
    temporadas: salida
  };
}