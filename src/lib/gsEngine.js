// =====================================================================
// gsEngine.js - LIGA DE BÁDMINTON DE LOS VIERNES
// Conexión híbrida con Google Apps Script & Almacenamiento Local
// =====================================================================

// ID real de tu hoja de cálculo "Liguilla viernes"
const DEFAULT_SHEET_ID = '1wjKLBnakvjzdUmiio_BqTRSpP9Q9TONOmX37PwsbdtI';

// Coloca aquí la URL que te genera Google Apps Script al hacer la "Nueva Implementación"
const DEFAULT_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxzsCk9JfCn_oFw1N_aprDasb3-KnzznI5U7NKeV7Gi7oWnNiC9Jorx1nHXxbWZxPOl/exec';

export const RONDAS = ['Fase de grupos', 'Dieciseisavos', 'Octavos', 'Cuartos', 'Semifinal', 'Final'];

export const CATEGORIAS = {
  Individual: ['IM-A', 'IF-A', 'IM-B', 'IF-B'],
  Dobles: ['DM', 'DF'],
  'Dobles mixtos': ['DX']
};

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

class BadmintonEngine {
  constructor() {
    this.storageKey = 'liga_badminton_data_v2';
    this.webAppUrlKey = 'liga_badminton_script_url';
    this.pinKey = 'liga_badminton_admin_pin';
    this.socios = [];
    this.jornadas = [];
    this.inscritos = {};
    this.competiciones = {};
    this.partidos = [];
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
        this.partidos = parsed.partidos || [];
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
        partidos: this.partidos
      }));
    }
  }

  getWebAppUrl() {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(this.webAppUrlKey) || DEFAULT_WEB_APP_URL;
    }
    return DEFAULT_WEB_APP_URL;
  }

  setWebAppUrl(url) {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.webAppUrlKey, url);
    }
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
      console.warn('URL de Apps Script no configurada. Trabajando en modo local.');
      return null;
    }

    const pin = this.getAdminPin();
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, pin, ...payload })
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
      this.lastRemoteError = '';
      return data.result;
    } catch (e) {
      console.warn('Llamada a Google Apps Script fallida, recurriendo a datos locales:', e);
      this.lastRemoteError = e.message || String(e);
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
      this.jornadas = remote;
      this.saveState();
    }
    return this.getJornadas();
  }

  async fetchAllFromSheets() {
    const remote = await this.callRemote('getAllData', {}, { strict: true });
    if (!remote || !Array.isArray(remote.jornadas) || !Array.isArray(remote.partidos)) {
      throw new Error('Apps Script no devolvió el conjunto de datos esperado.');
    }

    this.socios = Array.isArray(remote.socios) ? remote.socios : this.socios;
    this.jornadas = remote.jornadas;
    this.inscritos = remote.inscritos || {};
    this.competiciones = remote.competiciones || {};
    this.partidos = remote.partidos;
    this.saveState();
    return remote;
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
      puntosSet: Number(data.puntosSet) || 15,
      ganarPor2: !!data.ganarPor2,
      definitiva: false,
      partidos: 0
    };

    this.jornadas.push(nueva);
    this.saveState();
    void this.callRemote('crearJornada', { jornada: nueva }, { strict: false }).catch(() => {});
    return nueva;
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
    void this.callRemote('borrarJornada', { idJornada }, { strict: false }).catch(() => {});
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

    if (!this.inscritos[key]) this.inscritos[key] = [];
    const list = this.inscritos[key];

    const partId = [...ids].sort((a, b) => Number(a) - Number(b)).join('+');
    if (list.some(x => x.id === partId)) {
      throw new Error('Este participante/pareja ya está inscrito.');
    }

    const nombres = ids.map(id => this.getNombreSocio(id));
    list.push({ id: partId, ids, nombres });
    this.saveState();
    void this.callRemote('anadirInscrito', { idJornada, categoria, ids, nombres }, { strict: false }).catch(() => {});
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
    void this.callRemote('quitarInscrito', { idJornada, categoria, idPart }, { strict: false }).catch(() => {});
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
      const grupos = cfg.grupos || [];
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
      competitionConfig = { sistema: 'GRUPOS', grupos: grupos.length, clasifican: Number(cfg.clasifican) || 2 };
    } else if (cfg.sistema === 'ELIM') {
      const seeds = cfg.seeds || [];
      const matches = this.generateKnockout(j, categoria, seeds, insc);
      newMatches.push(...matches);
      competitionConfig = { sistema: 'ELIM', grupos: 0, clasifican: 0 };
    }

    this.competiciones[key] = competitionConfig;
    this.partidos.push(...newMatches);
    this.saveState();
    void this.callRemote('crearCompeticion', {
      idJornada,
      categoria,
      cfg: competitionConfig,
      partidos: newMatches
    }, { strict: false }).catch(() => {});

    return true;
  }

  async borrarCompeticion(idJornada, categoria) {
    const key = `${idJornada}_${categoria}`;
    delete this.competiciones[key];
    this.partidos = this.partidos.filter(p => !(p.jornada === idJornada && p.categoria === categoria));
    this.saveState();
    void this.callRemote('borrarCompeticion', { idJornada, categoria }, { strict: false }).catch(() => {});
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

  async syncAllToSheets(data = this.getStateSnapshot()) {
    if (!Array.isArray(data.jornadas) || !Array.isArray(data.partidos)) {
      throw new Error('El estado local no contiene listas válidas de jornadas y partidos.');
    }

    try {
      return await this.callRemote('syncAll', { data }, { strict: true });
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

      return {
        jornadas: data.jornadas.length,
        partidos: data.partidos.length,
        verified: true
      };
    }
  }

  matchesSyncedState(expected, actual) {
    if (
      !actual ||
      !Array.isArray(actual.jornadas) ||
      !Array.isArray(actual.partidos) ||
      !Array.isArray(actual.socios)
    ) {
      return false;
    }

    if (
      actual.jornadas.length !== expected.jornadas.length ||
      actual.partidos.length !== expected.partidos.length
    ) {
      return false;
    }
    const actualJornadaIds = new Set(actual.jornadas.map(jornada => String(jornada.id)));
    if (!expected.jornadas.every(jornada => actualJornadaIds.has(String(jornada.id)))) {
      return false;
    }

    const actualMatches = new Map(actual.partidos.map(match => [String(match.id), match]));
    return expected.partidos.every(expectedMatch => {
      const actualMatch = actualMatches.get(String(expectedMatch.id));
      return actualMatch &&
        actualMatch.jornada === expectedMatch.jornada &&
        actualMatch.categoria === expectedMatch.categoria &&
        actualMatch.estado === expectedMatch.estado &&
        actualMatch.ganador === expectedMatch.ganador &&
        JSON.stringify(actualMatch.idsA || []) === JSON.stringify(expectedMatch.idsA || []) &&
        JSON.stringify(actualMatch.idsB || []) === JSON.stringify(expectedMatch.idsB || []) &&
        JSON.stringify(actualMatch.sets || []) === JSON.stringify(expectedMatch.sets || []);
    });
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

  generateKnockout(jornada, categoria, seeds, inscritos) {
    const map = {};
    inscritos.forEach(i => { map[i.id] = i; });
    const size = seeds.length;
    const roundNames = { 1: 'Final', 2: 'Semifinal', 4: 'Cuartos', 8: 'Octavos', 16: 'Dieciseisavos' };

    const matches = [];
    let matchIdIndex = 1;

    for (let i = 0; i < size / 2; i++) {
      const sA = seeds[i * 2], sB = seeds[i * 2 + 1];
      const pA = sA ? map[sA] : null;
      const pB = sB ? map[sB] : null;

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

  async generarCuadroEliminatorio(idJornada, categoria) {
    const key = `${idJornada}_${categoria}`;
    const comp = this.competiciones[key];
    if (!comp || comp.sistema !== 'GRUPOS') {
      throw new Error('Solo se puede generar el cuadro final desde una competición con fase de grupos.');
    }

    const detalle = this.getCompeticionDetalle(idJornada, categoria);
    if (!detalle.todosGruposTerminados) {
      throw new Error('Primero deben terminarse todos los partidos de la fase de grupos para generar el cuadro.');
    }

    const winners = Object.keys(detalle.clasificacion || {})
      .sort()
      .map(grupo => detalle.clasificacion[grupo][0])
      .filter(Boolean)
      .map(entry => entry.id);

    if (winners.length < 2) {
      throw new Error('Necesitas al menos 2 ganadores de grupo para generar el cuadro eliminatorio.');
    }

    const nextPow2 = Math.pow(2, Math.ceil(Math.log2(winners.length || 2)));
    const seeds = [...winners];
    while (seeds.length < nextPow2) seeds.push('');

    const j = this.jornadas.find(x => x.id === idJornada);
    const inscritos = this.inscritos[key] || [];
    const map = {};
    inscritos.forEach(i => { map[i.id] = i; });

    const bracketMatches = [];
    let index = 1;
    const semifinalSeeds = [];
    for (let i = 0; i < seeds.length; i += 2) {
      semifinalSeeds.push([seeds[i], seeds[i + 1]]);
    }

    semifinalSeeds.forEach(([a, b], i) => {
      const pA = a ? map[a] : null;
      const pB = b ? map[b] : null;
      const isBye = !a || !b;
      const winner = !a ? 'B' : (!b ? 'A' : '');
      bracketMatches.push({
        id: 'PG_' + Date.now() + '_' + index++,
        jornada: j.id,
        fecha: j.fecha,
        categoria,
        ronda: semifinalSeeds.length > 1 ? 'Semifinal' : 'Final',
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
    });

    if (semifinalSeeds.length > 1) {
      bracketMatches.push({
        id: 'PG_' + Date.now() + '_' + index++,
        jornada: j.id,
        fecha: j.fecha,
        categoria,
        ronda: 'Final',
        grupo: '',
        orden: semifinalSeeds.length + 1,
        estado: 'Pendiente',
        idsA: [],
        idsB: [],
        nomA: [],
        nomB: [],
        sets: [],
        ganador: '',
        registrado: ''
      });
    }

    const updatedMatches = this.partidos.filter(p => !(p.jornada === idJornada && p.categoria === categoria && p.ronda !== 'Fase de grupos'));
    updatedMatches.push(...bracketMatches);

    let remoteResult;
    try {
      remoteResult = await this.callRemote(
        'guardarPartidos',
        { partidos: bracketMatches },
        { strict: true }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/acci[oó]n no v[aá]lida|guardarPartidos/i.test(message)) throw error;
      remoteResult = await this.syncAllToSheets({ ...this.getStateSnapshot(), partidos: updatedMatches });
    }

    this.partidos = updatedMatches;
    this.saveState();

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
    const stats = {};
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
        if (comp && comp.sistema === 'LIGA') {
          s.pts = Math.max(10, 100 - 15 * idx);
        } else {
          s.pts = 10 + s.grupoVictorias * 5;
        }
      });
    });

    return grupos;
  }

  async guardarResultado(idPartido, sets) {
    const p = this.partidos.find(x => x.id === idPartido);
    if (!p) throw new Error('No se encuentra el partido.');

    let setsA = 0, setsB = 0;
    sets.forEach(s => {
      if (s[0] > s[1]) setsA++; else setsB++;
    });
    const ganador = setsA > setsB ? 'A' : 'B';
    const updatedMatch = { ...p, sets, estado: 'Jugado', ganador, registrado: Date.now() };
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

    Object.assign(p, updatedMatch);
    this.saveState();
    return true;
  }

  async borrarResultado(idPartido) {
    await this.callRemote('borrarResultado', { idPartido }, { strict: true });
    const p = this.partidos.find(x => x.id === idPartido);
    if (!p) throw new Error('No se encuentra el partido.');
    p.sets = [];
    p.estado = 'Pendiente';
    p.ganador = '';
    p.registrado = '';
    this.saveState();
    return true;
  }

  // --- Rankings ---
  async fetchRanking() {
    const remote = await this.callRemote('getRanking');
    if (remote) return remote;
    return this.getRanking();
  }

  getRanking() {
    const MEJORES = 3;
    const playerStats = {};

    this.socios.forEach(s => {
      playerStats[s.id] = {
        id: s.id,
        nombre: `${s.nombre} ${s.apellidos}`,
        categoria: s.categoria,
        sexo: s.sexo,
        porCategoriaJornada: {},
        PG: 0, PP: 0, PF: 0, PC: 0
      };
    });

    this.partidos.forEach(p => {
      if (p.estado !== 'Jugado') return;
      const idsA = p.idsA || [];
      const idsB = p.idsB || [];

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
      const addPoints = (playerId, points) => {
        if (!playerStats[playerId]) return;
        pointsByPlayer.set(playerId, (pointsByPlayer.get(playerId) || 0) + points);
      };

      if (comp.sistema === 'LIGA') {
        const groupMatches = matches.filter(p => p.ronda === 'Fase de grupos');
        if (groupMatches.length && groupMatches.every(p => p.estado === 'Jugado')) {
          const standings = this.calcClasificacion(inscritos, groupMatches, comp);
          const orderedPlayers = Object.values(standings).flat();
          orderedPlayers.forEach((player, index) => {
            const participant = inscritos.find(entry => entry.id === player.id);
            (participant ? participant.ids : [player.id]).forEach(id => {
              addPoints(id, Math.max(10, 100 - 15 * index));
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

        if (comp.sistema === 'GRUPOS') {
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
        const pointsByStage = { 1: 25, 2: 40, 3: 55, 4: 70, 5: 85 };
        const reachedStage = new Map();
        const advance = (playerIds, stage) => {
          playerIds.forEach(id => {
            reachedStage.set(id, Math.max(reachedStage.get(id) || 0, stage));
          });
        };

        matches.filter(p => p.ronda !== 'Fase de grupos').forEach(match => {
          const stage = roundStage[match.ronda];
          if (!stage) return;
          if (match.estado !== 'Jugado' && match.estado !== 'Bye') return;
          const idsA = match.idsA || [];
          const idsB = match.idsB || [];
          advance([...idsA, ...idsB], stage);

          if (match.estado === 'Jugado' || match.estado === 'Bye') {
            const winnerIds = match.ganador === 'A' ? idsA : match.ganador === 'B' ? idsB : [];
            if (stage === 5 && match.estado === 'Jugado') {
              const loserIds = match.ganador === 'A' ? idsB : idsA;
              winnerIds.forEach(id => addPoints(id, 100));
              loserIds.forEach(id => addPoints(id, 85));
            } else if (stage < 5) {
              advance(winnerIds, stage + 1);
            }
          }
        });

        reachedStage.forEach((stage, playerId) => {
          if (stage < 5) addPoints(playerId, pointsByStage[stage]);
          else if (!matches.some(p => p.ronda === 'Final' && p.estado === 'Jugado' &&
            ((p.idsA || []).includes(playerId) || (p.idsB || []).includes(playerId)))) {
            addPoints(playerId, pointsByStage[5]);
          }
        });
      }

      pointsByPlayer.forEach((points, playerId) => {
        const st = playerStats[playerId];
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
      hayDerrotas: true,
      temporadas
    };
  }

  buildRankingCategory(catName, tipo, nivel, sexo, playerStats) {
    const jornadasList = this.jornadas.map((j, i) => ({ n: i + 1, id: j.id, fecha: j.fecha }));
    const MEJORES = 3;

    const jugadores = Object.values(playerStats)
      .filter(st => {
        const playerSex = String(st.sexo || '').toUpperCase();
        const matchesSex = !sexo || playerSex === sexo ||
          (sexo === 'M' && playerSex === 'MASCULINO') ||
          (sexo === 'F' && playerSex === 'FEMENINO');
        return matchesSex && (!nivel || st.categoria === nivel);
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
      })
      .sort((a, b) =>
        b.total - a.total ||
        b.PG - a.PG ||
        a.PP - b.PP ||
        b.difPartidos - a.difPartidos ||
        b.difPuntos - a.difPuntos ||
        b.PF - a.PF ||
        a.nombre.localeCompare(b.nombre, 'es')
      );

    jugadores.forEach((j, i) => { j.pos = i + 1; });

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