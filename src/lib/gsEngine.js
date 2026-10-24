// =====================================================================
// gsEngine.js - LIGA DE BÁDMINTON DE LOS VIERNES
// Conexión híbrida con Google Apps Script & Almacenamiento Local
// =====================================================================

// ID real de tu hoja de cálculo "Liguilla viernes"
const DEFAULT_SHEET_ID = '1RObAcHR-AiaMx_b7wSvXRaDop_x4htuKIHiLdZr3m8Y';

// Coloca aquí la URL que te genera Google Apps Script al hacer la "Nueva Implementación"
const DEFAULT_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbygLCq-7tFGb-BHrPphKAWIovEAGSIxyZZ8FU8qVRsNZ7bP71sgUvzRzwwbmy3L48Smdg/exec';
const PREVIOUS_DEFAULT_WEB_APP_URLS = new Set([
  'https://script.google.com/macros/s/AKfycbw07qlmfatAryNZix_7qDC5rih5QOzYGXkg9i2FcAgt2DvmedJv7QcEit4kQEo4VSVyKg/exec',
  'https://script.google.com/macros/s/AKfycbzIZxijx_DRPCR7ycYnKSSO2kugZCzBgvimcJ09N-a5HKel5xqHMt9d_wWWyl1-smkOEQ/exec',
  'https://script.google.com/macros/s/AKfycbw7rsu5xrVT06FlpZHgilAA8NZ3UkN_v1J2Id1ynHnmsEgKMy8-9meMdEq6zg1BUb2oEQ/exec'
]);

export const RONDAS = ['Fase de grupos', 'Dieciseisavos', 'Octavos', 'Cuartos', 'Semifinal', 'Final'];

export function getKnockoutRoundTitle(matchCount) {
  return {
    1: 'Final',
    2: 'Semifinal',
    4: 'Cuartos de final',
    8: 'Octavos de final',
    16: 'Dieciseisavos de final'
  }[matchCount] || '';
}

export const CATEGORIAS = {
  Individual: ['IM-A', 'IF-A', 'IM-B', 'IF-B'],
  Dobles: ['DM', 'DF'],
  'Dobles mixtos': ['DX']
};

const MUTATING_REMOTE_ACTIONS = new Set([
  'crearJornada',
  'guardarJornadaDefinitiva',
  'borrarJornada',
  'anadirInscrito',
  'quitarInscrito',
  'crearCompeticion',
  'guardarPartidos',
  'borrarCompeticion',
  'guardarResultado',
  'borrarResultado',
  'syncAll'
]);

const ROUND_STAGE = {
  'Fase de grupos': 0,
  Dieciseisavos: 1,
  Octavos: 2,
  Cuartos: 3,
  Semifinal: 4,
  Final: 5
};
const ROTATING_QUALIFYING_ROUNDS = 6;
const WILDCARD_FEMALE_NAMES = new Set(['pedrito', 'pedrito 2']);

function normalizeRankingName(value) {
  return String(value || '').trim().toLocaleLowerCase('es')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function parseMixedRankingImport(input) {
  if (Array.isArray(input)) return input;
  if (input && typeof input === 'object') {
    const records = input.puntosPrecalculados || input.puntos || input.records;
    if (Array.isArray(records)) return records;
    throw new Error('El JSON debe contener una lista en "puntosPrecalculados" o "puntos".');
  }
  if (typeof input !== 'string' || !input.trim()) {
    throw new Error('El archivo de puntos mixtos está vacío.');
  }

  const text = input.replace(/^\uFEFF/, '').trim();
  if (text[0] === '[' || text[0] === '{') {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw new Error('El JSON de puntos mixtos no tiene un formato válido.');
    }
    return parseMixedRankingImport(parsed);
  }

  const firstLine = text.split(/\r?\n/, 1)[0];
  const delimiters = [',', ';', '\t'];
  const delimiter = delimiters
    .map(value => ({ value, count: firstLine.split(value).length - 1 }))
    .sort((a, b) => b.count - a.count)[0];
  if (!delimiter || delimiter.count === 0) {
    throw new Error('El CSV debe incluir encabezados jornadaId, jugadorId o nombre, y puntos.');
  }

  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index++;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter.value && !quoted) {
      row.push(cell.trim());
      cell = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index++;
      row.push(cell.trim());
      if (row.some(value => value)) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }
  row.push(cell.trim());
  if (row.some(value => value)) rows.push(row);

  if (rows.length < 2) {
    throw new Error('El CSV debe incluir al menos una fila de puntos además de los encabezados.');
  }
  const headers = rows.shift().map(value => normalizeRankingName(value)
    .replace(/[^a-z0-9]/g, ''));
  const column = aliases => headers.findIndex(header => aliases.includes(header));
  const jornadaColumn = column(['jornadaid', 'jornada']);
  const playerIdColumn = column(['jugadorid', 'playerid', 'id']);
  const playerNameColumn = column(['nombre', 'jugador', 'playername']);
  const pointsColumn = column(['puntos', 'points']);
  if (jornadaColumn < 0 || (playerIdColumn < 0 && playerNameColumn < 0) || pointsColumn < 0) {
    throw new Error('El CSV debe incluir jornadaId, jugadorId o nombre, y puntos.');
  }

  return rows.map(values => ({
    jornadaId: values[jornadaColumn],
    jugadorId: playerIdColumn >= 0 ? values[playerIdColumn] : '',
    nombre: playerNameColumn >= 0 ? values[playerNameColumn] : '',
    puntos: values[pointsColumn]
  }));
}

export const INITIAL_SOCIOS = [
  { id: '1', nombre: 'Molaye', apellidos: 'Mohamed Ahid', sexo: 'M', categoria: 'B' },
  { id: '2', nombre: 'Darío', apellidos: 'Dámaso', sexo: 'M', categoria: 'A' },
  { id: '3', nombre: 'Pedro', apellidos: 'Alonso', sexo: 'M', categoria: 'A' },
  { id: '4', nombre: 'Nicolas', apellidos: 'Charles', sexo: 'M', categoria: 'A' },
  { id: '5', nombre: 'Samuel', apellidos: 'Tarife', sexo: 'M', categoria: 'A' },
  { id: '6', nombre: 'Carlos', apellidos: 'Roger', sexo: 'M', categoria: 'B' },
  { id: '7', nombre: 'Marta', apellidos: 'Siverio', sexo: 'F', categoria: 'A' },
  { id: '8', nombre: 'Roberto', apellidos: 'Siverio', sexo: 'M', categoria: 'B' },
  { id: '21', nombre: 'Víctor', apellidos: 'Arrocha', sexo: 'M', categoria: 'B' },
  { id: '40', nombre: 'Víctor', apellidos: 'Gutiérrez', sexo: 'M', categoria: 'B' }
];

export const INITIAL_JORNADAS = [];

export class BadmintonEngine {
  constructor() {
    this.storageKey = 'liga_badminton_data_v2';
    this.webAppUrlKey = 'liga_badminton_script_url';
    this.pinKey = 'liga_badminton_admin_pin';
    this.socios = [];
    this.jornadas = [];
    this.inscritos = {};
    this.competiciones = {};
    this.partidos = [];
    this.remoteRevision = null;
    this.remoteConflictRevision = null;
    this.localChangesPending = false;
    this.lastSyncStatus = 'unknown';
    this.lastRemoteError = '';
    this.loadState();
  }

  loadState() {
    if (typeof localStorage === 'undefined') {
      this.initDefaultData();
      return;
    }
    const raw = localStorage.getItem(this.storageKey);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        this.socios = parsed.socios || INITIAL_SOCIOS;
        this.jornadas = parsed.jornadas || INITIAL_JORNADAS;
        this.inscritos = parsed.inscritos || {};
        this.competiciones = parsed.competiciones || {};
        this.partidos = Array.isArray(parsed.partidos) ? parsed.partidos : [];
        this.remoteRevision = typeof parsed.remoteRevision === 'string' ? parsed.remoteRevision : null;
        this.remoteConflictRevision = typeof parsed.remoteConflictRevision === 'string'
          ? parsed.remoteConflictRevision
          : null;
        this.localChangesPending = parsed.localChangesPending === true;
      } catch (e) {
        this.initDefaultData();
      }
    } else {
      this.initDefaultData();
    }
  }

  initDefaultData() {
    this.socios = [...INITIAL_SOCIOS];
    this.jornadas = [...INITIAL_JORNADAS];
    this.inscritos = {};
    this.competiciones = {};
    this.partidos = [];
    this.saveState();
  }

  saveState() {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.storageKey, JSON.stringify({
        socios: this.socios,
        jornadas: this.jornadas,
        inscritos: this.inscritos,
        competiciones: this.competiciones,
        partidos: this.partidos,
        remoteRevision: this.remoteRevision,
        remoteConflictRevision: this.remoteConflictRevision,
        localChangesPending: this.localChangesPending
      }));
    }
  }

  getWebAppUrl() {
    if (typeof localStorage !== 'undefined') {
      const savedUrl = localStorage.getItem(this.webAppUrlKey);
      if (PREVIOUS_DEFAULT_WEB_APP_URLS.has(savedUrl)) {
        localStorage.setItem(this.webAppUrlKey, DEFAULT_WEB_APP_URL);
        return DEFAULT_WEB_APP_URL;
      }
      return savedUrl || DEFAULT_WEB_APP_URL;
    }
    return DEFAULT_WEB_APP_URL;
  }

  setWebAppUrl(url) {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.webAppUrlKey, url);
    }
    this.remoteRevision = null;
    this.remoteConflictRevision = null;
    this.saveState();
  }

  getAdminPin() {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(this.pinKey) || '';
    }
    return '';
  }

  setAdminPin(pin) {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.pinKey, pin);
    }
  }

  // --- Sesión de Administración ---
  isAdminSession() {
    if (typeof sessionStorage !== 'undefined') {
      return sessionStorage.getItem('liga_badminton_is_admin') === 'true';
    }
    return false;
  }

  setAdminSession(active) {
    if (typeof sessionStorage !== 'undefined') {
      if (active) {
        sessionStorage.setItem('liga_badminton_is_admin', 'true');
      } else {
        sessionStorage.removeItem('liga_badminton_is_admin');
      }
    }
  }

  verifyAndLoginAdmin(enteredPin) {
    const pinStr = String(enteredPin || '').trim();
    if (!pinStr) {
      throw new Error('Por favor, introduce el PIN de administración.');
    }

    const savedPin = this.getAdminPin();
    if (!savedPin) {
      this.setAdminPin(pinStr);
      this.setAdminSession(true);
      return true;
    }

    if (pinStr === savedPin) {
      this.setAdminSession(true);
      return true;
    } else {
      throw new Error('PIN de administración incorrecto.');
    }
  }

  logoutAdmin() {
    this.setAdminSession(false);
  }

  // --- Conexión remota con Google Apps Script ---
  async callRemote(action, payload = {}, { strict = false } = {}) {
    const url = this.getWebAppUrl();
    if (!url || url.includes('TU_SCRIPT_ID_DESPLEGADO')) {
      this.lastSyncStatus = 'local-only';
      this.localChangesPending = this.localChangesPending || MUTATING_REMOTE_ACTIONS.has(action);
      this.lastRemoteError = 'No hay una conexión de Google Sheets configurada.';
      this.saveState();
      return null;
    }

    const isMutation = MUTATING_REMOTE_ACTIONS.has(action);
    if (isMutation && action !== 'syncAll' && this.localChangesPending) {
      const error = new Error('Hay cambios locales pendientes. Sincroniza o vuelve a cargar los datos antes de enviar otra modificación.');
      this.lastSyncStatus = 'local-only';
      this.lastRemoteError = error.message;
      if (strict) throw error;
      this.saveState();
      return null;
    }
    if (isMutation && !this.remoteRevision) {
      const error = new Error('Carga primero el estado actual de Google Sheets antes de modificar o sincronizar datos.');
      this.lastSyncStatus = 'remote-error';
      this.lastRemoteError = error.message;
      if (strict) throw error;
      this.localChangesPending = true;
      this.saveState();
      return null;
    }

    const pin = this.getAdminPin();
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action,
          pin,
          ...(isMutation ? { expectedRevision: this.remoteRevision } : {}),
          ...payload
        })
      });
      const responseText = await response.text();
      let data;
      try {
        data = JSON.parse(responseText);
      } catch {
        const isHtml = /^\s*(<!doctype html|<html)/i.test(responseText);
        const error = new Error(
          isHtml
            ? `Apps Script devolvió una página HTML en lugar de JSON para "${action}" (HTTP ${response.status}).`
            : `Apps Script devolvió una respuesta no válida para "${action}" (HTTP ${response.status}).`
        );
        error.code = 'NON_JSON_RESPONSE';
        throw error;
      }
      if (!response.ok || data.error || data.success === false) {
        throw new Error(data.error || `Error HTTP ${response.status}`);
      }
      if (isMutation && typeof data.revision === 'string') this.remoteRevision = data.revision;
      else if (isMutation && typeof data.result?.revision === 'string') this.remoteRevision = data.result.revision;
      if (action === 'syncAll') this.localChangesPending = false;
      if (isMutation) this.lastSyncStatus = 'synced';
      this.lastRemoteError = '';
      if (isMutation) this.saveState();
      return data.result;
    } catch (e) {
      console.warn('Llamada a Google Apps Script fallida, recurriendo a datos locales:', e);
      this.lastRemoteError = e.message || String(e);
      this.lastSyncStatus = isMutation && !strict ? 'local-only' : 'remote-error';
      if (isMutation) this.localChangesPending = true;
      if (isMutation) this.saveState();
      if (strict) throw e;
      return null;
    }
  }

  // --- Socios ---
  async fetchSocios() {
    const remote = await this.callRemote('getSocios');
    if (remote && Array.isArray(remote)) {
      this.socios = remote;
      this.saveState();
    }
    return this.socios;
  }

  getSocios() {
    return this.socios;
  }

  getNombreSocio(id) {
    const s = this.socios.find(x => String(x.id) === String(id));
    return s ? `${s.nombre} ${s.apellidos}`.trim() : String(id);
  }

  // --- Jornadas ---
  async fetchJornadas() {
    const remote = await this.callRemote('getJornadas');
    if (remote && Array.isArray(remote)) {
      const { jornadas, restoredIds } = this.mergeRotatingJornadaFlags(remote);
      this.jornadas = jornadas;
      if (restoredIds.length) {
        this.localChangesPending = true;
        this.lastSyncStatus = 'local-only';
        this.lastRemoteError = `Google Sheets no devolvió la configuración de parejas rotativas de ${restoredIds.join(', ')}. Se conservó localmente; sincroniza con el Apps Script actualizado.`;
      }
      this.saveState();
    }
    return this.getJornadas();
  }

  mergeRotatingJornadaFlags(remoteJornadas) {
    const localRotatingById = new Map(
      this.jornadas
        .filter(jornada => jornada.parejasRotativas)
        .map(jornada => [String(jornada.id), jornada])
    );
    const restoredIds = [];
    const jornadas = remoteJornadas.map(jornada => {
      const localJornada = localRotatingById.get(String(jornada.id));
      if (!localJornada || jornada.parejasRotativas) return jornada;
      restoredIds.push(String(jornada.id));
      return { ...jornada, parejasRotativas: true };
    });
    return { jornadas, restoredIds };
  }

  async fetchAllFromSheets({ discardLocal = false } = {}) {
    const remote = await this.callRemote('getAllData', {}, { strict: true });
    if (
      !remote ||
      !Array.isArray(remote.jornadas) ||
      !Array.isArray(remote.partidos) ||
      typeof remote.revision !== 'string' ||
      !remote.revision
    ) {
      this.lastSyncStatus = 'remote-error';
      this.lastRemoteError = 'Apps Script no devolvió una revisión de datos. Despliega el backend actualizado antes de sincronizar.';
      throw new Error(this.lastRemoteError);
    }

    if (this.localChangesPending && !discardLocal) {
      this.remoteConflictRevision = !this.remoteRevision || remote.revision !== this.remoteRevision
        ? remote.revision
        : null;
      this.lastSyncStatus = this.remoteConflictRevision ? 'remote-error' : 'local-only';
      this.lastRemoteError = this.remoteConflictRevision
        ? 'Hay cambios locales pendientes y Google Sheets también cambió. Elige explícitamente qué versión conservar.'
        : 'Hay cambios locales pendientes; se conservaron y no se reemplazaron con la copia remota.';
      this.saveState();
      return remote;
    }

    this.socios = Array.isArray(remote.socios) ? remote.socios : this.socios;
    // Keep the rotation setting if the deployed backend doesn't return its column.
    const { jornadas, restoredIds } = this.mergeRotatingJornadaFlags(remote.jornadas);
    this.jornadas = jornadas;
    this.inscritos = remote.inscritos || {};
    this.competiciones = remote.competiciones || {};
    this.partidos = remote.partidos;
    this.remoteRevision = remote.revision;
    this.remoteConflictRevision = null;
    this.localChangesPending = restoredIds.length > 0;
    this.lastSyncStatus = restoredIds.length ? 'local-only' : 'synced';
    this.lastRemoteError = restoredIds.length
      ? `Google Sheets no devolvió la configuración de parejas rotativas de ${restoredIds.join(', ')}. Se conservó localmente; sincroniza con el Apps Script actualizado.`
      : '';
    this.saveState();
    return remote;
  }

  async persistFullStateOrLocal(data) {
    if (!this.getWebAppUrl() || !this.remoteRevision) {
      this.localChangesPending = true;
      this.lastSyncStatus = 'local-only';
      return null;
    }
    return this.syncAllToSheets(data);
  }

  getJornadas() {
    const cuenta = {};
    this.partidos.forEach(p => {
      if (p.estado === 'Jugado') {
        cuenta[p.jornada] = (cuenta[p.jornada] || 0) + 1;
      }
    });
    return this.jornadas.map(j => ({
      ...j,
      partidos: cuenta[j.id] || 0
    })).sort((a, b) => b.fecha.localeCompare(a.fecha));
  }

  async crearJornada(data) {
    this.validateJornadaFormat(data.formato, data.desde);
    const puntosSet = Number(data.puntosSet);
    if (!Number.isInteger(puntosSet) || puntosSet < 1 || puntosSet > 50) {
      throw new Error('Los puntos por set deben ser un entero entre 1 y 50.');
    }

    const id = data.id || 'J' + String(data.fecha).replace(/-/g, '');
    if (this.jornadas.some(j => j.id === id)) {
      throw new Error('Ya existe una jornada para esa fecha.');
    }
    const nueva = {
      id,
      fecha: data.fecha,
      modalidad: data.modalidad,
      formato: data.formato,
      desde: data.formato === 'MIXTO' ? data.desde : '',
      parejasRotativas: Boolean(data.parejasRotativas) && data.modalidad !== 'Individual',
      puntosSet,
      ganarPor2: !!data.ganarPor2,
      definitiva: false,
      partidos: 0
    };

    this.jornadas.push(nueva);
    this.saveState();
    const remoteResult = await this.callRemote('crearJornada', { jornada: nueva }, { strict: false });
    if (nueva.parejasRotativas && remoteResult) {
      try {
        const remoteJornadas = await this.callRemote('getJornadas', {}, { strict: true });
        const remoteJornada = Array.isArray(remoteJornadas)
          ? remoteJornadas.find(jornada => String(jornada.id) === String(nueva.id))
          : null;
        if (!remoteJornada?.parejasRotativas) {
          throw new Error('Google Sheets no devolvió la marca de parejas rotativas para la nueva jornada.');
        }
      } catch (error) {
        this.localChangesPending = true;
        this.lastSyncStatus = 'remote-error';
        this.lastRemoteError = error.message || String(error);
        this.saveState();
        throw new Error(`No se pudo verificar el guardado de parejas rotativas: ${this.lastRemoteError}`);
      }
    }
    return nueva;
  }

  validateJornadaFormat(formato, desde) {
    if (!['UNO', 'TRES', 'MIXTO'].includes(formato)) {
      throw new Error('Selecciona un formato de juego válido.');
    }
    if (formato === 'MIXTO') {
      const threshold = String(desde || '').trim().toLocaleLowerCase('es');
      const hasValidThreshold = threshold.includes('eliminatoria') ||
        Object.keys(ROUND_STAGE).some(round => threshold.includes(round.toLocaleLowerCase('es')));
      if (!hasValidThreshold) {
        throw new Error('Para el formato mixto, indica una ronda válida en "Desde".');
      }
    }
  }

  async actualizarFormatoJornada(idJornada, formato, desde) {
    const jornada = this.jornadas.find(item => item.id === idJornada);
    if (!jornada) throw new Error('No se encuentra la jornada.');
    if (jornada.definitiva) throw new Error('No se puede modificar el formato de una jornada definitiva.');
    this.validateJornadaFormat(formato, desde);

    const updatedJornada = {
      ...jornada,
      formato,
      desde: formato === 'MIXTO' ? desde : ''
    };
    const changedResults = [];
    const updatedMatches = this.partidos.map(match => {
      if (match.jornada !== idJornada) return match;
      if (match.estado === 'Bye') return match;

      const oldFormat = this.getEffectiveMatchFormat(jornada, match);
      const newFormat = this.getEffectiveMatchFormat(updatedJornada, match);
      const savedSets = Array.isArray(match.sets) ? match.sets.map(set => [...set]) : [];
      let sets = savedSets;
      if (newFormat === 'UNO') {
        sets = savedSets.slice(0, 1);
      } else if (oldFormat === 'UNO') {
        sets = savedSets.slice(0, 1);
      }

      const updatedMatch = { ...match, sets };
      if (newFormat === 'UNO') {
        if (sets.length) {
          try {
            updatedMatch.ganador = this.validateScore(updatedMatch, sets, updatedJornada);
            updatedMatch.estado = 'Jugado';
          } catch {
            updatedMatch.ganador = '';
            updatedMatch.estado = 'Pendiente';
          }
        } else {
          updatedMatch.ganador = '';
          updatedMatch.estado = 'Pendiente';
        }
        if (updatedMatch.estado === 'Pendiente') updatedMatch.registrado = '';
      } else if (newFormat === 'TRES' && sets.length < 2) {
        updatedMatch.ganador = '';
        updatedMatch.estado = 'Pendiente';
        updatedMatch.registrado = '';
      } else if (newFormat === 'TRES' && sets.length >= 2) {
        try {
          updatedMatch.ganador = this.validateScore(updatedMatch, sets, updatedJornada);
          updatedMatch.estado = 'Jugado';
        } catch {
          updatedMatch.ganador = '';
          updatedMatch.estado = 'Pendiente';
          updatedMatch.registrado = '';
        }
      }

      const resultChanged = updatedMatch.estado !== match.estado ||
        updatedMatch.ganador !== match.ganador;
      const groupScoreChanged = match.ronda === 'Fase de grupos' &&
        JSON.stringify(updatedMatch.sets) !== JSON.stringify(match.sets || []);
      if (resultChanged || groupScoreChanged) {
        changedResults.push({ match, updatedMatch });
      }
      return updatedMatch;
    });

    const roundsToRemove = new Map();
    const roundsToResume = new Map();
    changedResults.forEach(({ match }) => {
      const key = `${match.jornada}_${match.categoria}`;
      const invalidated = this.getRoundsToInvalidate(match);
      if (invalidated.size) {
        if (!roundsToRemove.has(key)) roundsToRemove.set(key, new Set());
        invalidated.forEach(round => roundsToRemove.get(key).add(round));
      }
      if (match.ronda !== 'Fase de grupos' && this.nextKnockoutRound(match.ronda)) {
        const previous = roundsToResume.get(key);
        const stage = ROUND_STAGE[match.ronda];
        if (previous === undefined || stage < previous.stage) {
          roundsToResume.set(key, { categoria: match.categoria, ronda: match.ronda, stage });
        }
      }
    });

    const matchesToSave = updatedMatches.filter(match => {
      const rounds = roundsToRemove.get(`${match.jornada}_${match.categoria}`);
      return !rounds?.has(match.ronda);
    });
    const jornadasToSave = this.jornadas.map(item =>
      item.id === idJornada ? updatedJornada : item
    );
    await this.persistFullStateOrLocal({
      ...this.getStateSnapshot(),
      jornadas: jornadasToSave,
      partidos: matchesToSave
    });

    this.jornadas = jornadasToSave;
    this.partidos = matchesToSave;
    this.saveState();

    for (const [key, resume] of roundsToResume) {
      if (!roundsToRemove.has(key)) continue;
      await this.advanceKnockoutBracket(idJornada, resume.categoria, resume.ronda);
    }
    return true;
  }

  async guardarJornadaDefinitiva(idJornada) {
    await this.callRemote('guardarJornadaDefinitiva', { idJornada }, { strict: true });
    const j = this.jornadas.find(x => x.id === idJornada);
    if (!j) throw new Error('No se encuentra la jornada.');
    j.definitiva = true;
    this.saveState();
    return true;
  }

  async borrarJornada(idJornada) {
    const j = this.jornadas.find(x => x.id === idJornada);
    if (!j) throw new Error('No se encuentra la jornada.');
    if (j.definitiva) throw new Error('La jornada es definitiva y no se puede borrar.');

    this.jornadas = this.jornadas.filter(x => x.id !== idJornada);
    this.partidos = this.partidos.filter(p => p.jornada !== idJornada);
    Object.keys(this.inscritos).forEach(k => {
      if (k.startsWith(idJornada + '_')) delete this.inscritos[k];
    });
    Object.keys(this.competiciones).forEach(k => {
      if (k.startsWith(idJornada + '_')) delete this.competiciones[k];
    });
    this.saveState();
    await this.callRemote('borrarJornada', { idJornada }, { strict: false });
    return true;
  }

  getCategoriasJornada(idJornada) {
    const j = this.jornadas.find(x => x.id === idJornada);
    if (!j) return [];
    const cats = CATEGORIAS[j.modalidad] || [];

    return cats.map(cat => {
      const key = `${idJornada}_${cat}`;
      const ins = this.inscritos[key] || [];
      const comp = this.competiciones[key] || null;
      const pars = this.partidos.filter(p => p.jornada === idJornada && p.categoria === cat);
      return {
        categoria: cat,
        inscritos: ins,
        numeroParticipantes: ins.length,
        competicion: comp,
        totalPartidos: pars.length,
        jugados: pars.filter(p => p.estado === 'Jugado').length
      };
    });
  }

  // --- Inscripciones ---
  async anadirInscrito(idJornada, categoria, ids) {
    const key = `${idJornada}_${categoria}`;
    if (this.competiciones[key]) {
      throw new Error('La competición ya ha sido creada. No se pueden añadir participantes.');
    }

    const jornada = this.jornadas.find(item => item.id === idJornada);
    const rotatingDoubles = Boolean(jornada?.parejasRotativas) && String(categoria).startsWith('D');
    if (rotatingDoubles) {
      if (!Array.isArray(ids) || ids.length !== 1) {
        throw new Error('En jornadas de parejas rotativas se inscribe a cada jugador individualmente.');
      }
      const sex = this.getRotatingPlayerSex(ids[0]);
      const expectedSex = categoria === 'DM' ? 'M' : categoria === 'DF' ? 'F' : '';
      if (categoria === 'DX' && !sex) {
        throw new Error('Los participantes de dobles mixtos deben tener el sexo indicado como masculino o femenino en sus datos.');
      }
      if (expectedSex && sex !== expectedSex) {
        throw new Error(`La categoría ${categoria} requiere participantes ${expectedSex === 'M' ? 'masculinos' : 'femeninos'}.`);
      }
      const currentInscritos = this.inscritos[key] || [];
      if (currentInscritos.some(participant => (participant.ids || []).map(String).includes(String(ids[0])))) {
        throw new Error('Este jugador ya está inscrito en esta categoría.');
      }
    }

    if (!this.inscritos[key]) this.inscritos[key] = [];
    const list = this.inscritos[key];

    const partId = [...ids].sort((a, b) => Number(a) - Number(b)).join('+');
    if (list.some(x => x.id === partId)) {
      throw new Error('Este participante/pareja ya está inscrito.');
    }

    const nombres = ids.map(id => this.getNombreSocio(id));
    list.push({ id: partId, ids, nombres });
    this.saveState();
    await this.callRemote('anadirInscrito', { idJornada, categoria, ids, nombres }, { strict: false });
    return true;
  }

  async quitarInscrito(idJornada, categoria, idPart) {
    const key = `${idJornada}_${categoria}`;
    if (this.competiciones[key]) {
      throw new Error('La competición ya ha sido creada.');
    }
    if (this.inscritos[key]) {
      this.inscritos[key] = this.inscritos[key].filter(x => x.id !== idPart);
      this.saveState();
    }
    await this.callRemote('quitarInscrito', { idJornada, categoria, idPart }, { strict: false });
    return true;
  }

  async actualizarParejaInscrita(idJornada, categoria, idPareja, ids) {
    if (!String(categoria || '').startsWith('D')) {
      throw new Error('Solo se pueden modificar parejas en categorías de dobles.');
    }
    if (!Array.isArray(ids) || ids.length !== 2 || ids.some(id => !String(id || '').trim())) {
      throw new Error('Selecciona dos jugadores para formar la pareja.');
    }
    const normalizedIds = ids.map(String);
    if (new Set(normalizedIds).size !== 2) {
      throw new Error('Los dos integrantes de la pareja deben ser distintos.');
    }

    const key = `${idJornada}_${categoria}`;
    const inscritos = this.inscritos[key] || [];
    const participant = inscritos.find(item => item.id === idPareja);
    if (!participant) throw new Error('No se encuentra la pareja inscrita.');
    const otherMembers = new Set(
      inscritos
        .filter(item => item.id !== idPareja)
        .flatMap(item => (item.ids || []).map(String))
    );
    if (normalizedIds.some(id => otherMembers.has(id))) {
      throw new Error('Un jugador no puede estar inscrito en más de una pareja de esta categoría.');
    }
    const oldIds = participant.ids || [];
    if (
      [...normalizedIds].sort().join('+') === [...oldIds].map(String).sort().join('+')
    ) return false;

    const oldKey = [...oldIds].map(String).sort().join('+');
    const names = normalizedIds.map(id => this.getNombreSocio(id));
    const updatedParticipants = inscritos.map(item =>
      item.id === idPareja
        ? { ...item, ids: normalizedIds, nombres: names }
        : item
    );
    const updatedMatches = this.partidos.map(match => {
      if (match.jornada !== idJornada || match.categoria !== categoria) return match;
      const updatedMatch = { ...match };
      ['A', 'B'].forEach(side => {
        const sideIds = (match[`ids${side}`] || []).map(String).sort().join('+');
        if (sideIds === oldKey) {
          updatedMatch[`ids${side}`] = [...normalizedIds];
          updatedMatch[`nom${side}`] = [...names];
        }
      });
      return updatedMatch;
    });
    const snapshot = {
      ...this.getStateSnapshot(),
      inscritos: { ...this.inscritos, [key]: updatedParticipants },
      partidos: updatedMatches
    };

    await this.persistFullStateOrLocal(snapshot);
    this.inscritos[key] = updatedParticipants;
    this.partidos = updatedMatches;
    this.saveState();
    return true;
  }

  // --- Competiciones y Partidos ---
  async crearCompeticion(idJornada, categoria, cfg) {
    const key = `${idJornada}_${categoria}`;
    const insc = this.inscritos[key] || [];
    if (insc.length < 2) throw new Error('Hacen falta al menos 2 participantes.');

    const j = this.jornadas.find(x => x.id === idJornada);
    const newMatches = [];
    let competitionConfig;

    if (cfg.sistema === 'LIGA') {
      const allIds = insc.map(x => x.id);
      const matches = this.generateRoundRobin(j, categoria, 'Único', allIds, insc);
      newMatches.push(...matches);
      competitionConfig = { sistema: 'LIGA', grupos: 1, clasifican: 0 };
    } else if (cfg.sistema === 'GRUPOS') {
      let grupos = cfg.grupos || [];
      if (cfg.metodoAsignacion === 'ALEATORIO') {
        if (grupos.length < 2 || grupos.length > insc.length) {
          throw new Error('El número de grupos debe ser al menos 2 y no puede superar el número de participantes.');
        }
        const shuffledIds = this.shuffle(insc.map(x => x.id));
        grupos = Array.from({ length: grupos.length }, () => []);
        shuffledIds.forEach((id, index) => grupos[index % grupos.length].push(id));
      }
      if (grupos.length < 2 || grupos.length > insc.length || grupos.some(g => g.length < 2)) {
        throw new Error('Cada grupo debe tener al menos 2 participantes y no puede haber más grupos que participantes.');
      }
      const assignedParticipants = grupos.flat();
      if (
        assignedParticipants.length !== insc.length ||
        new Set(assignedParticipants).size !== insc.length ||
        insc.some(participant => !assignedParticipants.includes(participant.id))
      ) {
        throw new Error('El reparto de participantes en los grupos no es válido.');
      }
      grupos.forEach((g, idx) => {
        const groupName = String.fromCharCode(65 + idx);
        const matches = this.generateRoundRobin(j, categoria, groupName, g, insc);
        newMatches.push(...matches);
      });
      competitionConfig = {
        sistema: 'GRUPOS',
        grupos: grupos.length,
        clasifican: Number(cfg.clasifican) || 2,
        metodoAsignacion: cfg.metodoAsignacion === 'MANUAL' ? 'MANUAL' : 'ALEATORIO'
      };
    } else if (cfg.sistema === 'ELIM') {
      const seeds = cfg.metodoCruces === 'MANUAL'
        ? (cfg.cruces || []).flat()
        : this.distributeKnockoutByes(this.shuffle(insc.map(x => x.id)));
      const matches = this.generateKnockout(j, categoria, seeds, insc);
      newMatches.push(...matches);
      competitionConfig = {
        sistema: 'ELIM',
        grupos: 0,
        clasifican: 0,
        metodoCruces: cfg.metodoCruces === 'MANUAL' ? 'MANUAL' : 'ALEATORIO'
      };
    } else if (cfg.sistema === 'ROTATIVOS') {
      const jornada = this.jornadas.find(item => item.id === idJornada);
      if (!jornada?.parejasRotativas || !categoria.startsWith('D')) {
        throw new Error('El sistema de parejas rotativas solo está disponible en jornadas de dobles configuradas para ello.');
      }
      newMatches.push(...this.generateRotatingDoublesMatches(jornada, categoria, insc));
      competitionConfig = {
        sistema: 'ROTATIVOS',
        grupos: 1,
        clasifican: 0
      };
    } else {
      throw new Error('El sistema de competición seleccionado no es válido.');
    }

    this.competiciones[key] = competitionConfig;
    this.partidos.push(...newMatches);
    this.saveState();
    const remoteResult = await this.callRemote('crearCompeticion', {
      idJornada,
      categoria,
      cfg: competitionConfig,
      partidos: newMatches
    }, { strict: false });
    if (competitionConfig.sistema === 'ELIM' && newMatches.length) {
      await this.advanceKnockoutBracket(idJornada, categoria, newMatches[0].ronda);
    }

    return remoteResult;
  }

  async borrarCompeticion(idJornada, categoria) {
    const key = `${idJornada}_${categoria}`;
    delete this.competiciones[key];
    this.partidos = this.partidos.filter(p => !(p.jornada === idJornada && p.categoria === categoria));
    this.saveState();
    await this.callRemote('borrarCompeticion', { idJornada, categoria }, { strict: false });
    return true;
  }

  // Sincronización completa de todo el estado local a Google Sheets
  getStateSnapshot() {
    return {
      jornadas: this.jornadas,
      inscritos: this.inscritos,
      competiciones: this.competiciones,
      partidos: this.partidos
    };
  }

  async syncAllToSheets(data = this.getStateSnapshot(), { confirmedOverwrite = false } = {}) {
    if (!Array.isArray(data.jornadas) || !Array.isArray(data.partidos)) {
      throw new Error('El estado local no contiene listas válidas de jornadas y partidos.');
    }

    try {
      if (this.remoteConflictRevision) {
        if (!confirmedOverwrite) {
          throw new Error('Google Sheets tiene cambios distintos. Confirma explícitamente si quieres reemplazarlos con la copia local.');
        }
        this.remoteRevision = this.remoteConflictRevision;
      }
      if (!this.remoteRevision) {
        throw new Error('No se puede reemplazar la hoja sin una revisión remota cargada. Actualiza los datos y resuelve las diferencias antes de sincronizar.');
      }
      const result = await this.callRemote('syncAll', { data }, { strict: true });
      if (result?.revision) this.remoteRevision = result.revision;
      const rotatingJornadas = data.jornadas.filter(jornada => jornada.parejasRotativas);
      const importedMixedCompetitions = Object.entries(data.competiciones || {})
        .filter(([key, competition]) =>
          key.endsWith('_DX') && Object.keys(competition.puntosPrecalculados || {}).length
        );
      if (rotatingJornadas.length || importedMixedCompetitions.length) {
        let remote;
        try {
          remote = await this.callRemote('getAllData', {}, { strict: true });
        } catch (error) {
          this.localChangesPending = true;
          this.lastSyncStatus = 'remote-error';
          this.lastRemoteError = error.message || String(error);
          this.saveState();
          const dataToVerify = rotatingJornadas.length
            ? 'las parejas rotativas o los puntos mixtos'
            : 'los puntos precalculados de dobles mixtos';
          throw new Error(`No se pudo verificar que Google Sheets conservara ${dataToVerify}: ${this.lastRemoteError}`);
        }
        const remoteJornadasById = new Map(
          (remote?.jornadas || []).map(jornada => [String(jornada.id), jornada])
        );
        const missingFlags = rotatingJornadas
          .filter(jornada => !remoteJornadasById.get(String(jornada.id))?.parejasRotativas)
          .map(jornada => String(jornada.id));
        const missingMixedPoints = importedMixedCompetitions.filter(([key, competition]) =>
          JSON.stringify(remote?.competiciones?.[key]?.puntosPrecalculados || {}) !==
            JSON.stringify(competition.puntosPrecalculados || {})
        ).map(([key]) => key);
        if (missingFlags.length || missingMixedPoints.length) {
          this.localChangesPending = true;
          this.lastSyncStatus = 'remote-error';
          const missingData = [
            missingFlags.length
              ? `la marca de parejas rotativas de ${missingFlags.join(', ')}`
              : '',
            missingMixedPoints.length
              ? `los puntos precalculados de ${missingMixedPoints.join(', ')}`
              : ''
          ].filter(Boolean).join(' y ');
          this.lastRemoteError = `Google Sheets no guardó ${missingData}. Despliega el Apps Script actualizado y vuelve a sincronizar.`;
          this.saveState();
          throw new Error(this.lastRemoteError);
        }
      }
      this.remoteConflictRevision = null;
      this.saveState();
      return result;
    } catch (error) {
      if (error.code !== 'NON_JSON_RESPONSE') throw error;

      let remote;
      try {
        remote = await this.callRemote('getAllData', {}, { strict: true });
      } catch (verificationError) {
        throw new Error(
          `Google Sheets pudo recibir la sincronización, pero Apps Script devolvió HTML y no se pudo verificar la hoja: ${verificationError.message || verificationError}`
        );
      }

      if (!this.matchesSyncedState(data, remote)) {
        throw new Error(
          'Apps Script devolvió HTML y la lectura de verificación no coincide con los datos enviados. Revisa la implementación de Apps Script y vuelve a sincronizar.'
        );
      }

      this.remoteRevision = remote.revision || null;
      if (!this.remoteRevision) {
        throw new Error('Google Sheets no devolvió una revisión para verificar la sincronización.');
      }
      this.remoteConflictRevision = null;
      this.localChangesPending = false;
      this.lastSyncStatus = 'synced';
      this.lastRemoteError = '';
      this.saveState();
      return {
        jornadas: data.jornadas.length,
        partidos: data.partidos.length,
        verified: true,
        revision: remote.revision || null
      };
    }
  }

  matchesSyncedState(expected, actual) {
    if (
      !actual ||
      !Array.isArray(actual.jornadas) ||
      !Array.isArray(actual.partidos) ||
      !Array.isArray(actual.socios) ||
      !actual.inscritos ||
      !actual.competiciones ||
      !Array.isArray(expected.jornadas) ||
      !Array.isArray(expected.partidos) ||
      !expected.inscritos ||
      !expected.competiciones
    ) {
      return false;
    }

    if (
      actual.jornadas.length !== expected.jornadas.length ||
      actual.partidos.length !== expected.partidos.length ||
      Object.keys(actual.inscritos).length !== Object.keys(expected.inscritos).length ||
      Object.keys(actual.competiciones).length !== Object.keys(expected.competiciones).length
    ) {
      return false;
    }

    const actualJornadas = new Map(actual.jornadas.map(jornada => [String(jornada.id), jornada]));
    const sameJornadas = expected.jornadas.every(expectedJornada => {
      const jornada = actualJornadas.get(String(expectedJornada.id));
      return jornada &&
        String(jornada.fecha) === String(expectedJornada.fecha) &&
        jornada.modalidad === expectedJornada.modalidad &&
        jornada.formato === expectedJornada.formato &&
        String(jornada.desde || '') === String(expectedJornada.desde || '') &&
        Number(jornada.puntosSet) === Number(expectedJornada.puntosSet) &&
        Boolean(jornada.ganarPor2) === Boolean(expectedJornada.ganarPor2) &&
        Boolean(jornada.parejasRotativas) === Boolean(expectedJornada.parejasRotativas) &&
        Boolean(jornada.definitiva) === Boolean(expectedJornada.definitiva);
    });
    if (!sameJornadas) return false;

    const sameParticipants = (left = [], right = []) =>
      JSON.stringify(left.map(String)) === JSON.stringify(right.map(String));
    const sameNames = (left = [], right = []) =>
      JSON.stringify(left) === JSON.stringify(right);
    for (const key of Object.keys(expected.inscritos)) {
      const actualList = actual.inscritos[key];
      const expectedList = expected.inscritos[key];
      if (!Array.isArray(actualList) || !Array.isArray(expectedList) || actualList.length !== expectedList.length) {
        return false;
      }
      const actualListById = new Map(actualList.map(participant => [String(participant.id), participant]));
      if (!expectedList.every(participant => {
        const actualParticipant = actualListById.get(String(participant.id));
        return actualParticipant &&
          sameParticipants(actualParticipant.ids || [], participant.ids || []) &&
          sameNames(actualParticipant.nombres || [], participant.nombres || []);
      })) return false;
    }
    for (const key of Object.keys(expected.competiciones)) {
      const actualCompetition = actual.competiciones[key];
      const expectedCompetition = expected.competiciones[key];
      if (!actualCompetition ||
          actualCompetition.sistema !== expectedCompetition.sistema ||
          Number(actualCompetition.grupos || 0) !== Number(expectedCompetition.grupos || 0) ||
          Number(actualCompetition.clasifican || 0) !== Number(expectedCompetition.clasifican || 0) ||
          JSON.stringify(actualCompetition.puntosPrecalculados || {}) !==
            JSON.stringify(expectedCompetition.puntosPrecalculados || {})) {
        return false;
      }
    }

    const actualMatches = new Map(actual.partidos.map(match => [String(match.id), match]));
    return expected.partidos.every(expectedMatch => {
      const actualMatch = actualMatches.get(String(expectedMatch.id));
      return actualMatch &&
        String(actualMatch.jornada) === String(expectedMatch.jornada) &&
        String(actualMatch.fecha) === String(expectedMatch.fecha) &&
        actualMatch.categoria === expectedMatch.categoria &&
        actualMatch.ronda === expectedMatch.ronda &&
        String(actualMatch.grupo || '') === String(expectedMatch.grupo || '') &&
        Number(actualMatch.orden || 0) === Number(expectedMatch.orden || 0) &&
        actualMatch.estado === expectedMatch.estado &&
        actualMatch.ganador === expectedMatch.ganador &&
        sameParticipants(actualMatch.idsA || [], expectedMatch.idsA || []) &&
        sameNames(actualMatch.nomA || [], expectedMatch.nomA || []) &&
        sameParticipants(actualMatch.idsB || [], expectedMatch.idsB || []) &&
        sameNames(actualMatch.nomB || [], expectedMatch.nomB || []) &&
        JSON.stringify(actualMatch.sets || []) === JSON.stringify(expectedMatch.sets || []);
    });
  }

  getRotatingPlayerSex(id) {
    const socio = this.socios.find(item => String(item.id) === String(id));
    const sex = String(socio?.sexo || '').trim().toLocaleUpperCase('es')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (['M', 'H', 'MASCULINO', 'HOMBRE'].includes(sex)) return 'M';
    if (['F', 'FEMENINO', 'MUJER'].includes(sex)) return 'F';
    return '';
  }

  generateRotatingDoublesMatches(jornada, categoria, inscritos) {
    const players = inscritos.map(participant => {
      if (!Array.isArray(participant.ids) || participant.ids.length !== 1) {
        throw new Error('En parejas rotativas cada inscripción debe corresponder a una sola persona.');
      }
      const id = String(participant.ids[0]);
      if (String(participant.id) !== id) {
        throw new Error('La inscripción individual no tiene un identificador compatible con parejas rotativas.');
      }
      return {
        id,
        nombre: participant.nombres?.[0] || this.getNombreSocio(id),
        sexo: this.getRotatingPlayerSex(id),
        apariciones: 0
      };
    });
    if (new Set(players.map(player => player.id)).size !== players.length) {
      throw new Error('Hay participantes duplicados en la inscripción de parejas rotativas.');
    }

    const isMixed = categoria === 'DX';
    const expectedSex = categoria === 'DM' ? 'M' : categoria === 'DF' ? 'F' : '';
    if (!isMixed && !expectedSex) {
      throw new Error('Las parejas rotativas solo están disponibles en categorías de dobles.');
    }
    if (expectedSex && players.some(player => player.sexo !== expectedSex)) {
      throw new Error(`La categoría ${categoria} requiere inscribir únicamente participantes ${expectedSex === 'M' ? 'masculinos' : 'femeninos'}.`);
    }

    const malePlayers = players.filter(player => player.sexo === 'M');
    const femalePlayers = players.filter(player => player.sexo === 'F');
    if (players.some(player => !player.sexo)) {
      throw new Error('No se puede identificar el sexo de todos los inscritos. Revisa sus datos antes de generar los partidos.');
    }
    if (isMixed && (malePlayers.length < 2 || femalePlayers.length < 2)) {
      throw new Error('Para dobles mixtos rotativos hacen falta al menos dos jugadores y dos jugadoras.');
    }
    if (!isMixed && players.length < 4) {
      throw new Error('Para dobles rotativos hacen falta al menos cuatro participantes.');
    }

    const matchesPerRound = isMixed
      ? Math.min(Math.floor(malePlayers.length / 2), Math.floor(femalePlayers.length / 2))
      : Math.floor(players.length / 4);
    if (matchesPerRound < 1) {
      throw new Error('No hay suficientes participantes para generar un partido de dobles.');
    }

    const partnerHistory = new Map();
    const pairKey = (a, b) => [a, b].sort((left, right) => left.localeCompare(right, 'en')).join('|');
    const selectPlayers = (pool, count) => this.shuffle([...pool])
      .sort((a, b) => a.apariciones - b.apariciones)
      .slice(0, count);
    const pairPlayers = (pool) => {
      const remaining = this.shuffle([...pool]);
      const pairs = [];
      while (remaining.length >= 2) {
        const first = remaining.shift();
        remaining.sort((a, b) =>
          (partnerHistory.get(pairKey(first.id, a.id)) || 0) -
          (partnerHistory.get(pairKey(first.id, b.id)) || 0)
        );
        const second = remaining.shift();
        pairs.push([first, second]);
      }
      return pairs;
    };
    const pairMixedPlayers = () => {
      const men = selectPlayers(malePlayers, matchesPerRound * 2);
      const availableWomen = selectPlayers(femalePlayers, matchesPerRound * 2);
      const teams = [];
      men.forEach(man => {
        availableWomen.sort((a, b) =>
          (partnerHistory.get(pairKey(man.id, a.id)) || 0) -
          (partnerHistory.get(pairKey(man.id, b.id)) || 0)
        );
        const woman = availableWomen.shift();
        teams.push([woman, man]);
        const key = pairKey(man.id, woman.id);
        partnerHistory.set(key, (partnerHistory.get(key) || 0) + 1);
      });
      return teams;
    };
    const newMatches = [];
    const datePrefix = Date.now();

    for (let round = 1; round <= ROTATING_QUALIFYING_ROUNDS; round++) {
      const teams = isMixed
        ? pairMixedPlayers()
        : pairPlayers(selectPlayers(players, matchesPerRound * 4));

      for (let index = 0; index < matchesPerRound; index++) {
        const teamA = teams[index * 2];
        const teamB = teams[index * 2 + 1];
        [...teamA, ...teamB].forEach(player => { player.apariciones++; });
        if (!isMixed) {
          [teamA, teamB].forEach(team => {
            const key = pairKey(team[0].id, team[1].id);
            partnerHistory.set(key, (partnerHistory.get(key) || 0) + 1);
          });
        }
        const idsA = teamA.map(player => player.id);
        const idsB = teamB.map(player => player.id);
        newMatches.push({
          id: `PR_${datePrefix}_${round}_${index + 1}_${Math.random().toString(36).slice(2, 6)}`,
          jornada: jornada.id,
          fecha: jornada.fecha,
          categoria,
          ronda: 'Fase de grupos',
          grupo: `Ronda ${round}`,
          orden: index + 1,
          estado: 'Pendiente',
          idsA,
          nomA: teamA.map(player => player.nombre),
          idsB,
          nomB: teamB.map(player => player.nombre),
          sets: [],
          ganador: '',
          registrado: ''
        });
      }
    }
    return newMatches;
  }

  calcRotatingClassification(inscritos, partidos) {
    const stats = {};
    inscritos.forEach(participant => {
      const id = String(participant.ids?.[0] || participant.id);
      const nombre = participant.nombres?.[0] || this.getNombreSocio(id);
      stats[id] = {
        id,
        ids: [id],
        nombres: [nombre],
        nombre,
        grupo: 'Clasificación individual',
        PJ: 0, G: 0, P: 0,
        SF: 0, SC: 0, PF: 0, PC: 0,
        grupoVictorias: 0,
        diffSetsGrupo: 0,
        diffPuntosGrupo: 0,
        pts: 10
      };
    });

    partidos.forEach(match => {
      if (match.ronda !== 'Fase de grupos' || match.estado !== 'Jugado') return;
      const idsA = (match.idsA || []).map(String);
      const idsB = (match.idsB || []).map(String);
      const scoreA = (match.sets || []).reduce((sum, set) => sum + Number(set[0] || 0), 0);
      const scoreB = (match.sets || []).reduce((sum, set) => sum + Number(set[1] || 0), 0);
      const setsA = (match.sets || []).filter(set => set[0] > set[1]).length;
      const setsB = (match.sets || []).filter(set => set[1] > set[0]).length;
      idsA.forEach(id => {
        const player = stats[id];
        if (!player) return;
        player.PJ++;
        player.PF += scoreA;
        player.PC += scoreB;
        player.SF += setsA;
        player.SC += setsB;
        if (match.ganador === 'A') {
          player.G++;
          player.grupoVictorias++;
        } else if (match.ganador === 'B') {
          player.P++;
        }
      });
      idsB.forEach(id => {
        const player = stats[id];
        if (!player) return;
        player.PJ++;
        player.PF += scoreB;
        player.PC += scoreA;
        player.SF += setsB;
        player.SC += setsA;
        if (match.ganador === 'B') {
          player.G++;
          player.grupoVictorias++;
        } else if (match.ganador === 'A') {
          player.P++;
        }
      });
    });

    const ranking = Object.values(stats);
    ranking.forEach(player => {
      player.diffSetsGrupo = player.SF - player.SC;
      player.diffPuntosGrupo = player.PF - player.PC;
      player.pts = 10 + player.grupoVictorias * 5;
    });
    ranking.sort((a, b) =>
      b.grupoVictorias - a.grupoVictorias ||
      b.diffPuntosGrupo - a.diffPuntosGrupo ||
      b.PF - a.PF ||
      a.nombre.localeCompare(b.nombre, 'es')
    );
    ranking.forEach((player, index) => {
      const previous = ranking[index - 1];
      const tied = previous &&
        previous.grupoVictorias === player.grupoVictorias &&
        previous.diffPuntosGrupo === player.diffPuntosGrupo &&
        previous.PF === player.PF;
      player.posicion = tied ? previous.posicion : (previous ? previous.posicion + 1 : 1);
    });
    return { 'Clasificación individual': ranking };
  }

  async generarFinalParejasRotativas(idJornada, categoria) {
    const key = `${idJornada}_${categoria}`;
    const jornada = this.jornadas.find(item => item.id === idJornada);
    const competicion = this.competiciones[key];
    if (!jornada?.parejasRotativas || competicion?.sistema !== 'ROTATIVOS') {
      throw new Error('No existe una competición de parejas rotativas para esta categoría.');
    }
    const qualifyingMatches = this.partidos.filter(match =>
      match.jornada === idJornada &&
      match.categoria === categoria &&
      match.ronda === 'Fase de grupos'
    );
    if (!qualifyingMatches.length || qualifyingMatches.some(match => match.estado !== 'Jugado')) {
      throw new Error('Debes completar todas las rondas clasificatorias antes de generar la final.');
    }
    const inscritos = this.inscritos[key] || [];
    const isMixed = categoria === 'DX';
    const maleCount = inscritos.filter(player => this.getRotatingPlayerSex(player.ids?.[0]) === 'M').length;
    const femaleCount = inscritos.filter(player => this.getRotatingPlayerSex(player.ids?.[0]) === 'F').length;
    const matchesPerRound = isMixed
      ? Math.min(Math.floor(maleCount / 2), Math.floor(femaleCount / 2))
      : Math.floor(inscritos.length / 4);
    const expectedRounds = Array.from(
      { length: ROTATING_QUALIFYING_ROUNDS },
      (_, index) => `Ronda ${index + 1}`
    );
    if (
      matchesPerRound < 1 ||
      qualifyingMatches.length !== matchesPerRound * ROTATING_QUALIFYING_ROUNDS ||
      expectedRounds.some(round =>
        qualifyingMatches.filter(match => match.grupo === round).length !== matchesPerRound
      )
    ) {
      throw new Error('La fase clasificatoria no contiene las seis rondas completas esperadas; revisa los partidos antes de generar la final.');
    }
    if (this.partidos.some(match =>
      match.jornada === idJornada && match.categoria === categoria && match.ronda === 'Final'
    )) {
      throw new Error('La final de parejas rotativas ya está creada.');
    }

    const classification = this.calcRotatingClassification(
      inscritos,
      qualifyingMatches
    )['Clasificación individual'];
    let teamA;
    let teamB;
    if (isMixed) {
      const men = classification.filter(player => this.getRotatingPlayerSex(player.id) === 'M');
      const women = classification.filter(player => this.getRotatingPlayerSex(player.id) === 'F');
      if (men.length < 2 || women.length < 2) {
        throw new Error('Para la final mixta hacen falta dos jugadores y dos jugadoras clasificadas.');
      }
      teamA = [women[0], men[0]];
      teamB = [women[1], men[1]];
    } else {
      if (classification.length < 4) {
        throw new Error('Se necesitan al menos cuatro participantes para generar la final.');
      }
      teamA = classification.slice(0, 2);
      teamB = classification.slice(2, 4);
    }

    const finalMatch = {
      id: `PR_FINAL_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      jornada: idJornada,
      fecha: jornada.fecha,
      categoria,
      ronda: 'Final',
      grupo: '',
      orden: 1,
      estado: 'Pendiente',
      idsA: teamA.map(player => player.id),
      nomA: teamA.map(player => player.nombre),
      idsB: teamB.map(player => player.id),
      nomB: teamB.map(player => player.nombre),
      sets: [],
      ganador: '',
      registrado: ''
    };
    const updatedMatches = [...this.partidos, finalMatch];
    await this.persistBracketMatches([finalMatch], updatedMatches);
    this.partidos = updatedMatches;
    this.saveState();
    return finalMatch;
  }

  generateRoundRobin(jornada, categoria, grupoName, participantIds, inscritos) {
    const map = {};
    inscritos.forEach(i => { map[i.id] = i; });
    const p = [...participantIds];
    if (p.length % 2 !== 0) p.push('');
    const n = p.length;
    const matches = [];
    let order = 1;

    for (let r = 0; r < n - 1; r++) {
      for (let i = 0; i < n / 2; i++) {
        const x = p[i], y = p[n - 1 - i];
        if (x !== '' && y !== '') {
          const pA = map[x], pB = map[y];
          matches.push({
            id: 'P_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            jornada: jornada.id,
            fecha: jornada.fecha,
            categoria,
            ronda: 'Fase de grupos',
            grupo: grupoName,
            orden: order++,
            estado: 'Pendiente',
            idsA: pA.ids,
            idsB: pB.ids,
            nomA: pA.nombres,
            nomB: pB.nombres,
            sets: [],
            ganador: '',
            registrado: ''
          });
        }
      }
      p.splice(1, 0, p.pop());
    }
    return matches;
  }

  shuffle(items) {
    const shuffled = [...items];
    for (let index = shuffled.length - 1; index > 0; index--) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
    }
    return shuffled;
  }

  distributeKnockoutByes(seeds) {
    const size = Math.pow(2, Math.ceil(Math.log2(Math.max(seeds.length, 2))));
    const byeCount = size - seeds.length;
    const arranged = [];
    seeds.slice(0, byeCount).forEach(seed => arranged.push(seed, ''));
    arranged.push(...seeds.slice(byeCount));
    return arranged;
  }

  generateKnockout(jornada, categoria, seeds, inscritos, expectedParticipantIds = inscritos.map(x => x.id)) {
    const map = {};
    inscritos.forEach(i => { map[i.id] = i; });
    const uniqueSeeds = seeds.filter(Boolean);
    if (
      uniqueSeeds.length !== expectedParticipantIds.length ||
      new Set(uniqueSeeds).size !== expectedParticipantIds.length ||
      expectedParticipantIds.some(id => !uniqueSeeds.includes(id))
    ) {
      throw new Error('Los cruces deben incluir a cada participante una sola vez.');
    }
    const size = Math.pow(2, Math.ceil(Math.log2(Math.max(seeds.length, 2))));
    const paddedSeeds = [...seeds];
    while (paddedSeeds.length < size) paddedSeeds.push('');
    const roundNames = { 1: 'Final', 2: 'Semifinal', 4: 'Cuartos', 8: 'Octavos', 16: 'Dieciseisavos' };

    const matches = [];
    let matchIdIndex = 1;

    for (let i = 0; i < size / 2; i++) {
      const sA = paddedSeeds[i * 2], sB = paddedSeeds[i * 2 + 1];
      const pA = sA ? map[sA] : null;
      const pB = sB ? map[sB] : null;

      if (!sA && !sB) continue;
      const isBye = !sA || !sB;
      const winner = !sA ? 'B' : (!sB ? 'A' : '');

      matches.push({
        id: 'PK_' + Date.now() + '_' + matchIdIndex++,
        jornada: jornada.id,
        fecha: jornada.fecha,
        categoria,
        ronda: roundNames[size / 2] || `Ronda de ${size}`,
        grupo: '',
        orden: i + 1,
        estado: isBye ? 'Bye' : 'Pendiente',
        idsA: pA ? pA.ids : [],
        idsB: pB ? pB.ids : [],
        nomA: pA ? pA.nombres : [],
        nomB: pB ? pB.nombres : [],
        sets: [],
        ganador: winner,
        registrado: ''
      });
    }

    return matches;
  }

  nextKnockoutRound(ronda) {
    return {
      Dieciseisavos: 'Octavos',
      Octavos: 'Cuartos',
      Cuartos: 'Semifinal',
      Semifinal: 'Final'
    }[ronda] || '';
  }

  getRoundsToInvalidate(match) {
    const key = `${match.jornada}_${match.categoria}`;
    const competition = this.competiciones[key];
    if (match.ronda === 'Fase de grupos' && competition?.sistema === 'GRUPOS') {
      return new Set(this.partidos
        .filter(item => item.jornada === match.jornada &&
          item.categoria === match.categoria &&
          item.ronda !== 'Fase de grupos')
        .map(item => item.ronda));
    }

    const rounds = new Set();
    let round = match.ronda;
    while (this.nextKnockoutRound(round)) {
      round = this.nextKnockoutRound(round);
      rounds.add(round);
    }
    return rounds;
  }

  createNextKnockoutRound(sourceMatches, jornada, categoria, ronda) {
    const nextRound = this.nextKnockoutRound(ronda);
    if (!nextRound) return [];

    const matchesPerRound = {
      Dieciseisavos: 16,
      Octavos: 8,
      Cuartos: 4,
      Semifinal: 2
    };
    const sourceCount = matchesPerRound[ronda];
    if (!sourceCount) return [];

    const winnersByOrder = new Map(sourceMatches.map(match => {
      const ids = match.ganador === 'A' ? match.idsA : match.ganador === 'B' ? match.idsB : [];
      const nombres = match.ganador === 'A' ? match.nomA : match.ganador === 'B' ? match.nomB : [];
      return [match.orden, ids?.length ? { ids: [...ids], nombres: [...(nombres || [])] } : null];
    }));
    const nextMatches = [];

    for (let index = 0; index < sourceCount / 2; index++) {
      const participantA = winnersByOrder.get(index * 2 + 1) || null;
      const participantB = winnersByOrder.get(index * 2 + 2) || null;
      if (!participantA && !participantB) continue;

      const isBye = !participantA || !participantB;
      nextMatches.push({
        id: `PG_${Date.now()}_${index + 1}_${Math.random().toString(36).slice(2, 7)}`,
        jornada: jornada.id,
        fecha: jornada.fecha,
        categoria,
        ronda: nextRound,
        grupo: '',
        orden: index + 1,
        estado: isBye ? 'Bye' : 'Pendiente',
        idsA: participantA?.ids || [],
        idsB: participantB?.ids || [],
        nomA: participantA?.nombres || [],
        nomB: participantB?.nombres || [],
        sets: [],
        ganador: isBye ? (participantA ? 'A' : 'B') : '',
        registrado: ''
      });
    }

    return nextMatches;
  }

  async persistBracketMatches(matches, updatedMatches) {
    try {
      return await this.callRemote('guardarPartidos', { partidos: matches }, { strict: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/acci[oó]n no v[aá]lida|guardarPartidos/i.test(message)) throw error;
      return this.syncAllToSheets({ ...this.getStateSnapshot(), partidos: updatedMatches });
    }
  }

  async advanceKnockoutBracket(idJornada, categoria, initialRound) {
    let sourceRound = initialRound;
    while (this.nextKnockoutRound(sourceRound)) {
      const sourceMatches = this.partidos
        .filter(match => match.jornada === idJornada && match.categoria === categoria && match.ronda === sourceRound)
        .sort((a, b) => a.orden - b.orden);
      if (!sourceMatches.length || sourceMatches.some(match => match.estado !== 'Jugado' && match.estado !== 'Bye')) return;

      const nextRound = this.nextKnockoutRound(sourceRound);
      const jornada = this.jornadas.find(item => item.id === idJornada);
      if (!jornada) throw new Error('No se encuentra la jornada para generar la siguiente ronda.');

      const generatedMatches = this.createNextKnockoutRound(sourceMatches, jornada, categoria, sourceRound);
      if (!generatedMatches.length) return;

      const existingMatches = this.partidos.filter(match =>
        match.jornada === idJornada && match.categoria === categoria && match.ronda === nextRound
      );
      const existingByOrder = new Map(existingMatches.map(match => [match.orden, match]));
      const matchesToSave = [];
      let participantsChanged = false;
      const reconciledMatches = generatedMatches.map(generated => {
        const existing = existingByOrder.get(generated.orden);
        const sameParticipants = existing &&
          JSON.stringify(existing.idsA || []) === JSON.stringify(generated.idsA) &&
          JSON.stringify(existing.idsB || []) === JSON.stringify(generated.idsB);
        if (sameParticipants) return existing;
        if (existing) participantsChanged = true;
        matchesToSave.push(generated);
        return generated;
      });
      const reconciledOrders = new Set(reconciledMatches.map(match => match.orden));
      const descendantRounds = new Set();
      if (participantsChanged) {
        let descendant = nextRound;
        while (this.nextKnockoutRound(descendant)) {
          descendant = this.nextKnockoutRound(descendant);
          descendantRounds.add(descendant);
        }
      }
      const updatedMatches = this.partidos.filter(match =>
        !(match.jornada === idJornada && match.categoria === categoria && (
          (match.ronda === nextRound && !reconciledOrders.has(match.orden)) ||
          descendantRounds.has(match.ronda)
        ))
      );
      const updatedById = new Set(updatedMatches.map(match => match.id));
      updatedMatches.push(...reconciledMatches.filter(match => !updatedById.has(match.id)));

      if (participantsChanged && descendantRounds.size) {
        await this.persistFullStateOrLocal({ ...this.getStateSnapshot(), partidos: updatedMatches });
      } else if (matchesToSave.length) {
        await this.persistBracketMatches(matchesToSave, updatedMatches);
      }
      this.partidos = updatedMatches;
      this.saveState();

      if (reconciledMatches.some(match => match.estado === 'Pendiente')) return;
      sourceRound = nextRound;
    }
  }

  async generarCuadroEliminatorio(idJornada, categoria, cfg = {}) {
    const key = `${idJornada}_${categoria}`;
    const comp = this.competiciones[key];
    if (!comp || comp.sistema !== 'GRUPOS') {
      throw new Error('Solo se puede generar el cuadro final desde una competición con fase de grupos.');
    }

    const detalle = this.getCompeticionDetalle(idJornada, categoria);
    if (!detalle.todosGruposTerminados) {
      throw new Error('Primero deben terminarse todos los partidos de la fase de grupos para generar el cuadro.');
    }

    const qualified = Object.keys(detalle.clasificacion || {})
      .sort()
      .flatMap(grupo => (detalle.clasificacion[grupo] || [])
        .slice(0, comp.clasifican || 1)
        .map((entry, index) => ({ id: entry.id, grupo, posicion: index + 1 })));

    if (qualified.length < 2) {
      throw new Error('Necesitas al menos 2 participantes clasificados para generar el cuadro eliminatorio.');
    }

    const j = this.jornadas.find(x => x.id === idJornada);
    const inscritos = this.inscritos[key] || [];
    const metodoCruces = cfg.metodoCruces === 'MANUAL' ? 'MANUAL' : 'ALEATORIO';
    let seeds;
    if (metodoCruces === 'MANUAL') {
      const available = new Set(qualified.map(entry => `${entry.grupo}:${entry.posicion}`));
      const selected = (cfg.cruces || []).flat().filter(Boolean);
      if (
        selected.length !== qualified.length ||
        new Set(selected).size !== selected.length ||
        selected.some(slot => !available.has(slot))
      ) {
        throw new Error('Asigna una sola vez a todos los clasificados y deja vacíos únicamente los puestos de bye.');
      }
      const idBySlot = new Map(qualified.map(entry => [`${entry.grupo}:${entry.posicion}`, entry.id]));
      seeds = (cfg.cruces || []).flat().map(slot => slot ? idBySlot.get(slot) : '');
    } else {
      seeds = this.distributeKnockoutByes(this.shuffle(qualified.map(entry => entry.id)));
    }
    const bracketMatches = this.generateKnockout(
      j,
      categoria,
      seeds,
      inscritos,
      qualified.map(entry => entry.id)
    )
      .map(match => ({ ...match, id: match.id.replace(/^PK_/, 'PG_') }));
    comp.metodoCruces = metodoCruces;

    const updatedMatches = this.partidos.filter(p => !(p.jornada === idJornada && p.categoria === categoria && p.ronda !== 'Fase de grupos'));
    updatedMatches.push(...bracketMatches);

    const remoteResult = await this.persistBracketMatches(bracketMatches, updatedMatches);

    this.partidos = updatedMatches;
    this.saveState();
    await this.advanceKnockoutBracket(idJornada, categoria, bracketMatches[0]?.ronda);

    return { partidos: bracketMatches, sincronizacion: remoteResult };
  }

  getCompeticionDetalle(idJornada, categoria) {
    const key = `${idJornada}_${categoria}`;
    const comp = this.competiciones[key] || null;
    const insc = this.inscritos[key] || [];
    const pars = this.partidos.filter(p => p.jornada === idJornada && p.categoria === categoria);
    const clasificacion = this.calcClasificacion(insc, pars, comp);

    return {
      competicion: comp,
      participantes: insc,
      partidos: pars,
      clasificacion,
      todosGruposTerminados: pars.filter(p => p.ronda === 'Fase de grupos' && p.estado !== 'Jugado').length === 0
    };
  }

  calcClasificacion(inscritos, partidos, comp) {
    if (comp?.sistema === 'ROTATIVOS') {
      return this.calcRotatingClassification(inscritos, partidos);
    }

    const stats = {};
    const participantByMatchIds = new Map(inscritos.map(participant => [
      [...(participant.ids || [])].map(String).sort((a, b) => Number(a) - Number(b)).join('+'),
      participant.id
    ]));
    inscritos.forEach(i => {
      stats[i.id] = {
        id: i.id,
        ids: i.ids,
        nombres: i.nombres,
        nombre: i.nombres.join(' / '),
        grupo: '',
        PJ: 0, G: 0, P: 0,
        SF: 0, SC: 0, PF: 0, PC: 0,
        grupoVictorias: 0,
        diffSetsGrupo: 0,
        diffPuntosGrupo: 0,
        pts: 0
      };
    });

    partidos.forEach(match => {
      if (match.ronda !== 'Fase de grupos' || !match.grupo) return;
      [match.idsA || [], match.idsB || []].forEach(ids => {
        const participantId = participantByMatchIds.get(
          [...ids].map(String).sort((a, b) => Number(a) - Number(b)).join('+')
        );
        if (participantId && stats[participantId]) stats[participantId].grupo = match.grupo;
      });
    });

    partidos.forEach(p => {
      if (p.ronda !== 'Fase de grupos' || p.estado !== 'Jugado') return;
      const participantKey = ids => [...ids].map(String).sort((a, b) => Number(a) - Number(b)).join('+');
      const partAKey = participantKey(p.idsA || []);
      const partBKey = participantKey(p.idsB || []);
      const partA = inscritos.find(x => x.id === partAKey);
      const partB = inscritos.find(x => x.id === partBKey);
      if (!partA || !partB) return;

      const sA = stats[partA.id], sB = stats[partB.id];
      if (p.grupo) { sA.grupo = p.grupo; sB.grupo = p.grupo; }

      let sfA = 0, sfB = 0, pfA = 0, pfB = 0;
      p.sets.forEach(s => {
        if (s[0] > s[1]) sfA++; else sfB++;
        pfA += s[0]; pfB += s[1];
      });

      sA.PJ++; sB.PJ++;
      sA.SF += sfA; sA.SC += sfB; sA.PF += pfA; sA.PC += pfB;
      sB.SF += sfB; sB.SC += sfA; sB.PF += pfB; sB.PC += pfA;

      if (p.ganador === 'A') { sA.G++; sB.P++; sA.grupoVictorias++; }
      else if (p.ganador === 'B') { sB.G++; sA.P++; sB.grupoVictorias++; }
    });

    const grupos = {};
    Object.values(stats).forEach(s => {
      s.diffSetsGrupo = s.SF - s.SC;
      s.diffPuntosGrupo = s.PF - s.PC;
      const g = s.grupo || 'Sin grupo';
      if (!grupos[g]) grupos[g] = [];
      grupos[g].push(s);
    });

    Object.keys(grupos).forEach(g => {
      grupos[g].sort((a, b) => (
        b.grupoVictorias - a.grupoVictorias ||
        b.diffSetsGrupo - a.diffSetsGrupo ||
        b.diffPuntosGrupo - a.diffPuntosGrupo ||
        a.nombre.localeCompare(b.nombre, 'es')
      ));

      grupos[g].forEach((s, idx) => {
        const previous = grupos[g][idx - 1];
        const tied = previous &&
          previous.grupoVictorias === s.grupoVictorias &&
          previous.diffSetsGrupo === s.diffSetsGrupo &&
          previous.diffPuntosGrupo === s.diffPuntosGrupo;
        s.posicion = tied ? previous.posicion : (previous ? previous.posicion + 1 : 1);
        if (comp && comp.sistema === 'LIGA') {
          s.pts = Math.max(10, 100 - 15 * (s.posicion - 1));
        } else {
          s.pts = 10 + s.grupoVictorias * 5;
        }
      });
    });

    return grupos;
  }

  getEffectiveMatchFormat(jornada, match) {
    if (match.formato) {
      if (match.formato === 'UNO' || match.formato === 'TRES') return match.formato;
      throw new Error('El formato individual del partido no es válido.');
    }
    if (jornada.formato !== 'MIXTO') {
      if (jornada.formato === 'UNO' || jornada.formato === 'TRES') return jornada.formato;
      throw new Error('El formato de juego de la jornada no es válido.');
    }

    const threshold = String(jornada.desde || '').trim().toLocaleLowerCase('es');
    const configuredStage = threshold.includes('eliminatoria')
      ? 1
      : Object.entries(ROUND_STAGE).find(([round]) =>
          threshold.includes(round.toLocaleLowerCase('es'))
        )?.[1];
    if (configuredStage === undefined) {
      throw new Error('Configura "Desde" con una ronda válida para aplicar el formato mixto.');
    }

    const matchStage = ROUND_STAGE[match.ronda];
    if (matchStage === undefined) {
      throw new Error(`No se puede determinar el formato para la ronda "${match.ronda}".`);
    }
    return matchStage >= configuredStage ? 'TRES' : 'UNO';
  }

  validateScore(match, sets, jornadaOverride) {
    if (!Array.isArray(sets) || sets.length < 1 || sets.length > 3) {
      throw new Error('Introduce entre uno y tres sets completos.');
    }
    if (match.estado === 'Bye' || !match.idsA?.length || !match.idsB?.length) {
      throw new Error('No se puede puntuar un enfrentamiento sin dos participantes.');
    }

    const jornada = jornadaOverride || this.jornadas.find(item => item.id === match.jornada);
    if (!jornada) throw new Error('No se encuentra la jornada del partido.');
    const target = Number(jornada.puntosSet);
    if (!Number.isInteger(target) || target < 1 || target > 50) {
      throw new Error('La jornada tiene una puntuación por set no válida.');
    }

    const setWinners = sets.map((set, index) => {
      if (
        !Array.isArray(set) ||
        set.length !== 2 ||
        !set.every(score => Number.isInteger(score) && score >= 0 && score <= 50)
      ) {
        throw new Error(`El set ${index + 1} debe tener dos puntuaciones enteras entre 0 y 50.`);
      }
      if (set[0] === set[1]) {
        throw new Error(`El set ${index + 1} no puede terminar empatado.`);
      }

      const winnerScore = Math.max(set[0], set[1]);
      const loserScore = Math.min(set[0], set[1]);
      if (jornada.ganarPor2) {
        if (winnerScore < target || winnerScore - loserScore < 2) {
          throw new Error(`El set ${index + 1} debe alcanzar ${target} puntos y ganarse por al menos dos.`);
        }
      } else if (winnerScore !== target || loserScore >= target) {
        throw new Error(`El set ${index + 1} debe terminar al llegar a ${target} puntos.`);
      }
      return set[0] > set[1] ? 'A' : 'B';
    });

    const format = this.getEffectiveMatchFormat(jornada, match);
    if (format === 'UNO' && sets.length !== 1) {
      throw new Error('Este partido se juega a un solo set.');
    }
    if (format === 'TRES') {
      if (sets.length < 2) throw new Error('Este partido requiere al menos dos sets.');
      let winsA = 0;
      let winsB = 0;
      for (let index = 0; index < setWinners.length; index++) {
        if (setWinners[index] === 'A') winsA++;
        else winsB++;
        if ((winsA === 2 || winsB === 2) && index !== setWinners.length - 1) {
          throw new Error('No se pueden registrar sets después de que un lado haya ganado dos.');
        }
      }
      if (Math.max(winsA, winsB) !== 2) {
        throw new Error('El resultado debe decidirse al mejor de tres sets.');
      }
    }
    return setWinners.filter(winner => winner === 'A').length >
      setWinners.filter(winner => winner === 'B').length ? 'A' : 'B';
  }

  async guardarResultado(idPartido, sets, formato) {
    const p = this.partidos.find(x => x.id === idPartido);
    if (!p) throw new Error('No se encuentra el partido.');

    const matchFormat = formato === undefined ? (p.formato || '') : formato;
    const matchWithFormat = { ...p, formato: matchFormat };
    const ganador = this.validateScore(matchWithFormat, sets);
    const updatedMatch = {
      ...matchWithFormat,
      sets,
      estado: 'Jugado',
      ganador,
      registrado: Date.now()
    };
    try {
      await this.callRemote('guardarResultado', {
        idPartido,
        sets,
        ganador,
        partido: updatedMatch
      }, { strict: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/partido no encontrado/i.test(message)) throw error;
      const updatedMatches = this.partidos.map(match =>
        match.id === idPartido ? updatedMatch : match
      );
      await this.syncAllToSheets({ ...this.getStateSnapshot(), partidos: updatedMatches });
    }

    const invalidateDownstream =
      p.ronda === 'Fase de grupos'
        ? this.getRoundsToInvalidate(p).size > 0
        : p.estado !== 'Jugado' || (p.ganador && p.ganador !== ganador);
    Object.assign(p, updatedMatch);
    const roundsToInvalidate = this.getRoundsToInvalidate(p);
    if (invalidateDownstream && roundsToInvalidate.size) {
      const updatedMatches = this.partidos.filter(match =>
        !(match.jornada === p.jornada && match.categoria === p.categoria &&
          roundsToInvalidate.has(match.ronda))
      );
      await this.persistFullStateOrLocal({ ...this.getStateSnapshot(), partidos: updatedMatches });
      this.partidos = updatedMatches;
    }
    this.saveState();
    await this.advanceKnockoutBracket(p.jornada, p.categoria, p.ronda);
    return true;
  }

  async borrarResultado(idPartido) {
    const p = this.partidos.find(x => x.id === idPartido);
    if (!p) throw new Error('No se encuentra el partido.');
    const updatedMatch = { ...p, sets: [], estado: 'Pendiente', ganador: '', registrado: '' };
    const laterRounds = this.getRoundsToInvalidate(p);
    const updatedMatches = this.partidos.filter(match =>
      !(match.jornada === p.jornada && match.categoria === p.categoria && laterRounds.has(match.ronda))
    ).map(match => match.id === idPartido ? updatedMatch : match);

    if (laterRounds.size) {
      await this.persistFullStateOrLocal({ ...this.getStateSnapshot(), partidos: updatedMatches });
    } else {
      await this.persistBracketMatches([updatedMatch], updatedMatches);
    }
    this.partidos = updatedMatches;
    this.saveState();
    return true;
  }

  async actualizarParticipantesPartido(idPartido, participanteAId, participanteBId) {
    const match = this.partidos.find(partido => partido.id === idPartido);
    if (!match) throw new Error('No se encuentra el partido.');

    const inscritos = this.inscritos[`${match.jornada}_${match.categoria}`] || [];
    const findParticipant = id => inscritos.find(participant => participant.id === id);
    const participantA = participanteAId ? findParticipant(participanteAId) : null;
    const participantB = participanteBId ? findParticipant(participanteBId) : null;

    if ((participanteAId && !participantA) || (participanteBId && !participantB)) {
      throw new Error('Selecciona participantes inscritos en esta categoría.');
    }
    if (!participantA && !participantB) {
      throw new Error('El enfrentamiento debe tener al menos un jugador o pareja.');
    }
    if (participanteAId && participanteAId === participanteBId) {
      throw new Error('El mismo jugador o pareja no puede ocupar ambos lados del enfrentamiento.');
    }

    const idsA = participantA?.ids || [];
    const idsB = participantB?.ids || [];
    if (
      JSON.stringify(match.idsA || []) === JSON.stringify(idsA) &&
      JSON.stringify(match.idsB || []) === JSON.stringify(idsB)
    ) return false;

    const updatedMatch = {
      ...match,
      idsA: [...idsA],
      nomA: [...(participantA?.nombres || [])],
      idsB: [...idsB],
      nomB: [...(participantB?.nombres || [])],
      sets: [],
      estado: participantA && participantB ? 'Pendiente' : 'Bye',
      ganador: participantA ? 'A' : 'B',
      registrado: ''
    };
    if (participantA && participantB) updatedMatch.ganador = '';

    const updatedMatches = this.partidos.map(partido =>
      partido.id === idPartido ? updatedMatch : partido
    );
    const laterRounds = this.getRoundsToInvalidate(match);
    if (laterRounds.size) {
      const retainedMatches = updatedMatches.filter(partido =>
        !(partido.jornada === match.jornada && partido.categoria === match.categoria &&
          laterRounds.has(partido.ronda))
      );
      await this.persistFullStateOrLocal({ ...this.getStateSnapshot(), partidos: retainedMatches });
      this.partidos = retainedMatches;
      this.saveState();
      await this.advanceKnockoutBracket(match.jornada, match.categoria, match.ronda);
      return true;
    }

    await this.persistBracketMatches([updatedMatch], updatedMatches);
    this.partidos = updatedMatches;
    this.saveState();
    return true;
  }

  // --- Rankings ---
  async fetchRanking() {
    const remote = await this.callRemote('getRanking');
    if (remote) return remote;
    return this.getRanking();
  }

  async importarPuntosMixtos(input) {
    const records = parseMixedRankingImport(input);
    if (!records.length) throw new Error('No se recibieron puntos mixtos para importar.');

    const updatedCompetitions = { ...this.competiciones };
    Object.entries(updatedCompetitions).forEach(([key, competition]) => {
      if (key.slice(key.indexOf('_') + 1) === 'DX') {
        updatedCompetitions[key] = { ...competition, puntosPrecalculados: {} };
      }
    });

    const importedKeys = new Set();
    records.forEach((record, index) => {
      if (!record || typeof record !== 'object' || Array.isArray(record)) {
        throw new Error(`La fila ${index + 1} de la importación no tiene un formato válido.`);
      }
      if (record.categoria && String(record.categoria).toUpperCase() !== 'DX') {
        throw new Error(`La fila ${index + 1} no pertenece a dobles mixtos (DX).`);
      }

      const jornadaId = String(record.jornadaId ?? record.jornada ?? '').trim();
      if (!jornadaId || !this.jornadas.some(jornada => String(jornada.id) === jornadaId)) {
        throw new Error(`La fila ${index + 1} indica una jornada inexistente.`);
      }
      const competitionKey = `${jornadaId}_DX`;
      if (!updatedCompetitions[competitionKey]) {
        throw new Error(`No existe una competición DX para la jornada ${jornadaId}.`);
      }

      const suppliedId = String(record.jugadorId ?? record.playerId ?? record.id ?? '').trim();
      const suppliedName = normalizeRankingName(record.nombre ?? record.jugador ?? record.playerName);
      let player = suppliedId
        ? this.socios.find(socio => String(socio.id) === suppliedId)
        : null;
      if (!player && suppliedName) {
        const candidates = this.socios.filter(socio =>
          normalizeRankingName(`${socio.nombre} ${socio.apellidos}`) === suppliedName ||
          normalizeRankingName(socio.nombre) === suppliedName
        );
        const uniqueCandidates = [...new Map(candidates.map(socio => [String(socio.id), socio])).values()];
        if (uniqueCandidates.length !== 1) {
          throw new Error(`No se pudo identificar de forma única al jugador "${record.nombre || record.jugador || record.playerName}".`);
        }
        player = uniqueCandidates[0];
      }
      if (!player) {
        throw new Error(`La fila ${index + 1} indica un jugador inexistente.`);
      }

      const points = Number(String(record.puntos ?? record.points ?? '').trim().replace(',', '.'));
      if (!Number.isFinite(points) || points < 0) {
        throw new Error(`La fila ${index + 1} contiene una puntuación no válida.`);
      }
      const entryKey = `${jornadaId}_${player.id}`;
      if (importedKeys.has(entryKey)) {
        throw new Error(`El jugador ${player.nombre} aparece más de una vez en la jornada ${jornadaId}.`);
      }
      importedKeys.add(entryKey);
      updatedCompetitions[competitionKey].puntosPrecalculados[player.id] = points;
    });

    await this.persistFullStateOrLocal({
      ...this.getStateSnapshot(),
      competiciones: updatedCompetitions
    });
    this.competiciones = updatedCompetitions;
    this.saveState();
    return { count: importedKeys.size };
  }

  getRanking() {
    const MEJORES = 3;
    const playerStats = {};
    const namesByPlayerId = new Map();

    this.socios.forEach(s => {
      namesByPlayerId.set(String(s.id), normalizeRankingName(`${s.nombre} ${s.apellidos}`));
      playerStats[s.id] = {
        id: s.id,
        nombre: `${s.nombre} ${s.apellidos}`,
        categoria: s.categoria,
        sexo: s.sexo,
        porCategoriaJornada: {},
        participaciones: new Set(),
        PG: 0, PP: 0, PF: 0, PC: 0
      };
    });

    Object.entries(this.inscritos).forEach(([key, participants]) => {
      const category = key.slice(key.indexOf('_') + 1);
      if (!['IF-A', 'IF-B', 'DF'].includes(category) || !Array.isArray(participants)) return;
      participants.forEach(participant => {
        (participant.ids || []).forEach((id, index) => {
          const name = participant.nombres?.[index] ||
            ((participant.ids || []).length === 1 ? participant.nombres?.[0] : '');
          if (name) namesByPlayerId.set(String(id), normalizeRankingName(name));
        });
      });
    });
    this.partidos.forEach(match => {
      if (!['IF-A', 'IF-B', 'DF'].includes(match.categoria)) return;
      ['A', 'B'].forEach(side => {
        (match[`ids${side}`] || []).forEach((id, index) => {
          const name = match[`nom${side}`]?.[index] ||
            ((match[`ids${side}`] || []).length === 1 ? match[`nom${side}`]?.[0] : '');
          if (name) namesByPlayerId.set(String(id), normalizeRankingName(name));
        });
      });
    });
    const wildcardFemalePlayerIds = new Set(
      [...namesByPlayerId.entries()]
        .filter(([, name]) => WILDCARD_FEMALE_NAMES.has(name))
        .map(([id]) => id)
    );

    this.partidos.forEach(p => {
      if (p.estado !== 'Jugado' || !Array.isArray(p.sets)) return;
      const idsA = p.idsA || [];
      const idsB = p.idsB || [];
      [...idsA, ...idsB].forEach(id => {
        if (playerStats[id]) playerStats[id].participaciones.add(p.categoria);
      });

      let pfA = 0, pfB = 0;
      p.sets.forEach(s => {
        pfA += s[0]; pfB += s[1];
      });

      const updatePlayer = (id, isTeamA, isWinner) => {
        if (!playerStats[id]) return;
        const st = playerStats[id];
        st.PG += isWinner ? 1 : 0;
        st.PP += isWinner ? 0 : 1;
        st.PF += isTeamA ? pfA : pfB;
        st.PC += isTeamA ? pfB : pfA;
      };

      idsA.forEach(id => updatePlayer(id, true, p.ganador === 'A'));
      idsB.forEach(id => updatePlayer(id, false, p.ganador === 'B'));
    });

    Object.entries(this.competiciones).forEach(([key, comp]) => {
      const separator = key.indexOf('_');
      if (separator < 0) return;
      const jornadaId = key.slice(0, separator);
      const categoria = key.slice(separator + 1);
      const matches = this.partidos.filter(p =>
        p.jornada === jornadaId && p.categoria === categoria
      );
      const inscritos = this.inscritos[key] || [];
      const pointsByPlayer = new Map();
      const femaleRanking = ['IF-A', 'IF-B', 'DF'].includes(categoria);
      const addPoints = (playerId, points) => {
        if (!playerStats[playerId] ||
            (femaleRanking && wildcardFemalePlayerIds.has(String(playerId)))) return;
        pointsByPlayer.set(playerId, (pointsByPlayer.get(playerId) || 0) + points);
      };

      const importedMixedPoints = categoria === 'DX' && comp.puntosPrecalculados &&
        Object.keys(comp.puntosPrecalculados).length
        ? comp.puntosPrecalculados
        : null;
      if (importedMixedPoints) {
        Object.entries(importedMixedPoints).forEach(([playerId, points]) => {
          const numericPoints = Number(points);
          if (!playerStats[playerId]) {
            throw new Error(`La competición ${jornadaId}_DX tiene puntos para el socio inexistente ${playerId}.`);
          }
          if (!Number.isFinite(numericPoints) || numericPoints < 0) {
            throw new Error(`La competición ${jornadaId}_DX contiene una puntuación precalculada no válida.`);
          }
          addPoints(playerId, numericPoints);
        });
      } else if (comp.sistema === 'LIGA') {
        const groupMatches = matches.filter(p => p.ronda === 'Fase de grupos');
        const playedMatches = groupMatches.filter(p => p.estado === 'Jugado');
        if (playedMatches.length) {
          const standings = this.calcClasificacion(inscritos, playedMatches, comp);
          const orderedPlayers = Object.values(standings).flat();
          orderedPlayers.filter(player => player.PJ > 0).forEach(player => {
            const participant = inscritos.find(entry => entry.id === player.id);
            (participant ? participant.ids : [player.id]).forEach(id => {
              addPoints(id, Math.max(10, 100 - 15 * ((player.posicion || 1) - 1)));
            });
          });
        }
      } else {
        const groupMatches = matches.filter(p => p.ronda === 'Fase de grupos');
        const groupWins = new Map();
        groupMatches.forEach(match => {
          if (match.estado !== 'Jugado') return;
          const winnerIds = match.ganador === 'A' ? match.idsA : match.ganador === 'B' ? match.idsB : [];
          winnerIds.forEach(id => groupWins.set(id, (groupWins.get(id) || 0) + 1));
        });

        if (comp.sistema === 'GRUPOS' || comp.sistema === 'ROTATIVOS') {
          inscritos.forEach(participant => {
            (participant.ids || []).forEach(id => {
              addPoints(id, 10 + (groupWins.get(id) || 0) * 5);
            });
          });
        }

        const roundStage = {
          Dieciseisavos: 1,
          Octavos: 2,
          Cuartos: 3,
          Semifinal: 4,
          Final: 5
        };
        const pointsByStage = { 1: 25, 2: 40, 3: 80, 4: 95 };
        const reachedStage = new Map();
        const knockoutPoints = new Map();
        const advance = (playerIds, stage) => {
          playerIds.forEach(id => {
            reachedStage.set(id, Math.max(reachedStage.get(id) || 0, stage));
          });
        };

        matches.filter(p => p.ronda !== 'Fase de grupos').forEach(match => {
          const stage = roundStage[match.ronda];
          if (!stage) return;
          const idsA = match.idsA || [];
          const idsB = match.idsB || [];
          if (match.estado !== 'Jugado' && match.estado !== 'Bye' &&
              !(stage === 5 && match.estado === 'Pendiente')) return;
          advance([...idsA, ...idsB], stage);

          const winnerIds = match.ganador === 'A' ? idsA : match.ganador === 'B' ? idsB : [];
          if (stage === 5 && match.estado === 'Jugado' && winnerIds.length) {
            const loserIds = match.ganador === 'A' ? idsB : idsA;
            winnerIds.forEach(id => knockoutPoints.set(id, 125));
            loserIds.forEach(id => knockoutPoints.set(id, 110));
          } else if (stage < 5 && (match.estado === 'Jugado' || match.estado === 'Bye')) {
            advance(winnerIds, stage + 1);
          }
        });

        reachedStage.forEach((stage, playerId) => {
          if (knockoutPoints.has(playerId)) return;
          const pointsStage = stage === 5 ? 4 : stage;
          knockoutPoints.set(playerId, pointsByStage[pointsStage]);
        });
        knockoutPoints.forEach((points, playerId) => {
          pointsByPlayer.set(playerId, points);
        });
      }

      pointsByPlayer.forEach((points, playerId) => {
        const st = playerStats[playerId];
        st.participaciones.add(categoria);
        if (!st.porCategoriaJornada[categoria]) st.porCategoriaJornada[categoria] = {};
        st.porCategoriaJornada[categoria][jornadaId] = points;
      });
    });

    const temporadas = [
      {
        id: '2026-27',
        etiqueta: '2026/27',
        categorias: {
          'IM-A': this.buildRankingCategory('IM-A', 'IM', 'A', 'M', playerStats),
          'IF-A': this.buildRankingCategory('IF-A', 'IF', 'A', 'F', playerStats),
          'IM-B': this.buildRankingCategory('IM-B', 'IM', 'B', 'M', playerStats),
          'IF-B': this.buildRankingCategory('IF-B', 'IF', 'B', 'F', playerStats),
          'DM': this.buildRankingCategory('DM', 'DM', '', 'M', playerStats),
          'DF': this.buildRankingCategory('DF', 'DF', '', 'F', playerStats),
          'DX': this.buildRankingCategory('DX', 'DX', '', '', playerStats)
        }
      }
    ];

    return {
      generado: new Date().toLocaleDateString('es-ES') + ' ' + new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
      mejoresJornadas: MEJORES,
      provisional: this.partidos.some(p => p.estado === 'Pendiente'),
      hayDerrotas: true,
      temporadas
    };
  }

  buildRankingCategory(catName, tipo, nivel, sexo, playerStats) {
    const jornadasList = this.jornadas.map((j, i) => ({ n: i + 1, id: j.id, fecha: j.fecha }));
    const MEJORES = 3;
    const isFemaleRanking = ['IF-A', 'IF-B', 'DF'].includes(catName);

    const jugadores = Object.values(playerStats)
      .filter(st => {
        const playerSex = String(st.sexo || '').toUpperCase();
        const matchesSex = !sexo || (sexo === 'M'
          ? ['M', 'MASCULINO', 'H', 'HOMBRE'].includes(playerSex)
          : ['F', 'FEMENINO', 'MUJER'].includes(playerSex));
        return matchesSex &&
          !(isFemaleRanking && WILDCARD_FEMALE_NAMES.has(normalizeRankingName(st.nombre))) &&
          (!nivel || String(st.categoria || '').toUpperCase() === nivel) &&
          st.participaciones.has(catName);
      })
      .map(st => {
        const categoryPoints = st.porCategoriaJornada[catName] || {};
        const pts = jornadasList.map(j => categoryPoints[j.id] !== undefined ? categoryPoints[j.id] : null);
        const rankedJornadas = pts
          .map((points, index) => ({ points, index }))
          .filter(entry => entry.points !== null)
          .sort((a, b) => b.points - a.points);
        const mejores = rankedJornadas.slice(0, MEJORES).map(entry => entry.points);
        const mejoresIndices = rankedJornadas.slice(0, MEJORES).map(entry => entry.index);
        const total = mejores.reduce((acc, points) => acc + points, 0);

        return {
          id: st.id,
          nombre: st.nombre,
          pts,
          mejores,
          mejoresIndices,
          total,
          PG: st.PG,
          PP: st.PP,
          difPartidos: st.PG - st.PP,
          PF: st.PF,
          PC: st.PC,
          difPuntos: st.PF - st.PC
        };
      });

    const compareRankingResults = (a, b) =>
        b.total - a.total ||
        b.PG - a.PG ||
        a.PP - b.PP ||
        b.difPartidos - a.difPartidos ||
        b.difPuntos - a.difPuntos ||
        b.PF - a.PF;

    jugadores.sort((a, b) =>
      compareRankingResults(a, b) || a.nombre.localeCompare(b.nombre, 'es')
    );
    jugadores.forEach((player, index) => {
      const previous = jugadores[index - 1];
      player.pos = previous && compareRankingResults(previous, player) === 0
        ? previous.pos
        : (previous ? previous.pos + 1 : 1);
    });

    return {
      categoria: catName,
      tipo,
      nivel,
      jornadas: jornadasList,
      jugadores
    };
  }
}

export const engine = new BadmintonEngine();