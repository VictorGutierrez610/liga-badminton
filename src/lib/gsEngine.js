// Core engine for Liga Badminton Fridays - replicating logic from gs_competicion.gs & ranking.gs
// Supports both live Google Apps Script Web App connection and local storage simulation.

const DEFAULT_SHEET_ID = '1e-_IZAV4YTyBhgyUFmlCl3iaLeYmYkoGxXFtXlaZcu0';

export const RONDAS = ['Fase de grupos', 'Dieciseisavos', 'Octavos', 'Cuartos', 'Semifinal', 'Final'];

export const CATEGORIAS = {
  Individual: ['IM-A', 'IF-A', 'IM-B', 'IF-B'],
  Dobles: ['DM', 'DF'],
  'Dobles mixtos': ['DX']
};

export const INITIAL_SOCIOS = [
  { id: '1', nombre: 'Carlos', apellidos: 'García', sexo: 'M', categoria: 'A' },
  { id: '2', nombre: 'Ana', apellidos: 'Martínez', sexo: 'F', categoria: 'A' },
  { id: '3', nombre: 'David', apellidos: 'López', sexo: 'M', categoria: 'A' },
  { id: '4', nombre: 'Elena', apellidos: 'Sánchez', sexo: 'F', categoria: 'A' },
  { id: '5', nombre: 'Miguel', apellidos: 'Pérez', sexo: 'M', categoria: 'B' },
  { id: '6', nombre: 'Laura', apellidos: 'Gómez', sexo: 'F', categoria: 'B' },
  { id: '7', nombre: 'Javier', apellidos: 'Fernández', sexo: 'M', categoria: 'B' },
  { id: '8', nombre: 'Carmen', apellidos: 'Ruiz', sexo: 'F', categoria: 'B' },
  { id: '9', nombre: 'Pablo', apellidos: 'Navarro', sexo: 'M', categoria: 'A' },
  { id: '10', nombre: 'Lucía', apellidos: 'Torres', sexo: 'F', categoria: 'A' },
  { id: '11', nombre: 'Alejandro', apellidos: 'Díaz', sexo: 'M', categoria: 'B' },
  { id: '12', nombre: 'Marta', apellidos: 'Vázquez', sexo: 'F', categoria: 'B' }
];

export const INITIAL_JORNADAS = [
  { id: 'J20260925', fecha: '2026-09-25', modalidad: 'Individual', formato: 'UNO', desde: '', puntosSet: 15, ganarPor2: false, definitiva: true, partidos: 6 },
  { id: 'J20261002', fecha: '2026-10-02', modalidad: 'Dobles', formato: 'TRES', desde: '', puntosSet: 15, ganarPor2: false, definitiva: false, partidos: 2 }
];

class BadmintonEngine {
  constructor() {
    this.storageKey = 'liga_badminton_data_v2';
    this.webAppUrlKey = 'liga_badminton_script_url';
    this.pinKey = 'liga_badminton_admin_pin';
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
    this.inscritos = {
      'J20260925_IM-A': [
        { id: '1', ids: ['1'], nombres: ['Carlos García'] },
        { id: '3', ids: ['3'], nombres: ['David López'] },
        { id: '9', ids: ['9'], nombres: ['Pablo Navarro'] }
      ],
      'J20261002_DM': [
        { id: '1+3', ids: ['1', '3'], nombres: ['Carlos García / David López'] },
        { id: '5+7', ids: ['5', '7'], nombres: ['Miguel Pérez / Javier Fernández'] }
      ]
    };
    this.competiciones = {
      'J20260925_IM-A': { sistema: 'LIGA', grupos: 1, clasifican: 0 },
      'J20261002_DM': { sistema: 'ELIM', grupos: 0, clasifican: 0 }
    };
    this.partidos = [
      { id: 'P1', jornada: 'J20260925', fecha: '2026-09-25', categoria: 'IM-A', ronda: 'Fase de grupos', grupo: 'Único', orden: 1, estado: 'Jugado', idsA: ['1'], idsB: ['3'], nomA: ['Carlos García'], nomB: ['David López'], sets: [[15, 12]], ganador: 'A', registrado: Date.now() },
      { id: 'P2', jornada: 'J20260925', fecha: '2026-09-25', categoria: 'IM-A', ronda: 'Fase de grupos', grupo: 'Único', orden: 2, estado: 'Jugado', idsA: ['3'], idsB: ['9'], nomA: ['David López'], nomB: ['Pablo Navarro'], sets: [[15, 10]], ganador: 'A', registrado: Date.now() },
      { id: 'P3', jornada: 'J20260925', fecha: '2026-09-25', categoria: 'IM-A', ronda: 'Fase de grupos', grupo: 'Único', orden: 3, estado: 'Jugado', idsA: ['1'], idsB: ['9'], nomA: ['Carlos García'], nomB: ['Pablo Navarro'], sets: [[15, 13]], ganador: 'A', registrado: Date.now() },

      { id: 'P10', jornada: 'J20261002', fecha: '2026-10-02', categoria: 'DM', ronda: 'Final', grupo: '', orden: 1, estado: 'Pendiente', idsA: ['1', '3'], idsB: ['5', '7'], nomA: ['Carlos García', 'David López'], nomB: ['Miguel Pérez', 'Javier Fernández'], sets: [], ganador: '', registrado: '' }
    ];
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
      return localStorage.getItem(this.webAppUrlKey) || '';
    }
    return '';
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

  // --- API Methods ---
  async callRemote(action, payload = {}) {
    const url = this.getWebAppUrl();
    if (!url) return null;

    const pin = this.getAdminPin();
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, pin, ...payload })
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      return data.result;
    } catch (e) {
      console.warn('Google Apps Script call failed, falling back to local:', e);
      return null;
    }
  }

  // Socios
  getSocios() {
    return this.socios;
  }

  getNombreSocio(id) {
    const s = this.socios.find(x => String(x.id) === String(id));
    return s ? `${s.nombre} ${s.apellidos}`.trim() : String(id);
  }

  // Jornadas
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

  crearJornada(data) {
    const id = 'J' + String(data.fecha).replace(/-/g, '');
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
    return nueva;
  }

  guardarJornadaDefinitiva(idJornada) {
    const j = this.jornadas.find(x => x.id === idJornada);
    if (!j) throw new Error('No se encuentra la jornada.');
    j.definitiva = true;
    this.saveState();
    return true;
  }

  borrarJornada(idJornada) {
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

  // Inscriptions
  anadirInscrito(idJornada, categoria, ids) {
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
    return true;
  }

  quitarInscrito(idJornada, categoria, idPart) {
    const key = `${idJornada}_${categoria}`;
    if (this.competiciones[key]) {
      throw new Error('La competición ya ha sido creada.');
    }
    if (this.inscritos[key]) {
      this.inscritos[key] = this.inscritos[key].filter(x => x.id !== idPart);
      this.saveState();
    }
    return true;
  }

  // Matches & Competitions
  crearCompeticion(idJornada, categoria, cfg) {
    const key = `${idJornada}_${categoria}`;
    const insc = this.inscritos[key] || [];
    if (insc.length < 2) throw new Error('Hacen falta al menos 2 participantes.');

    const j = this.jornadas.find(x => x.id === idJornada);
    const newMatches = [];

    if (cfg.sistema === 'LIGA') {
      const allIds = insc.map(x => x.id);
      const matches = this.generateRoundRobin(j, categoria, 'Único', allIds, insc);
      newMatches.push(...matches);
      this.competiciones[key] = { sistema: 'LIGA', grupos: 1, clasifican: 0 };
    } else if (cfg.sistema === 'GRUPOS') {
      const grupos = cfg.grupos || [];
      grupos.forEach((g, idx) => {
        const groupName = String.fromCharCode(65 + idx);
        const matches = this.generateRoundRobin(j, categoria, groupName, g, insc);
        newMatches.push(...matches);
      });
      this.competiciones[key] = { sistema: 'GRUPOS', grupos: grupos.length, clasifican: Number(cfg.clasifican) || 2 };
    } else if (cfg.sistema === 'ELIM') {
      const seeds = cfg.seeds || [];
      const matches = this.generateKnockout(j, categoria, seeds, insc);
      newMatches.push(...matches);
      this.competiciones[key] = { sistema: 'ELIM', grupos: 0, clasifican: 0 };
    }

    this.partidos.push(...newMatches);
    this.saveState();
    return true;
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
    const roundsCount = Math.log2(size);
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
      const partA = inscritos.find(x => x.ids.join('+') === p.idsA.join('+') || x.id === p.idsA.join('+'));
      const partB = inscritos.find(x => x.ids.join('+') === p.idsB.join('+') || x.id === p.idsB.join('+'));
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

  guardarResultado(idPartido, sets) {
    const p = this.partidos.find(x => x.id === idPartido);
    if (!p) throw new Error('No se encuentra el partido.');

    let setsA = 0, setsB = 0;
    sets.forEach(s => {
      if (s[0] > s[1]) setsA++; else setsB++;
    });

    p.sets = sets;
    p.estado = 'Jugado';
    p.ganador = setsA > setsB ? 'A' : 'B';
    p.registrado = Date.now();
    this.saveState();
    return true;
  }

  borrarResultado(idPartido) {
    const p = this.partidos.find(x => x.id === idPartido);
    if (!p) throw new Error('No se encuentra el partido.');
    p.sets = [];
    p.estado = 'Pendiente';
    p.ganador = '';
    p.registrado = '';
    this.saveState();
    return true;
  }

  // Ranking calculation
  getRanking() {
    const MEJORES = 3;
    const playerStats = {};

    this.socios.forEach(s => {
      playerStats[s.id] = {
        id: s.id,
        nombre: `${s.nombre} ${s.apellidos}`,
        categoria: s.categoria,
        sexo: s.sexo,
        porJornada: {},
        PG: 0, PP: 0, PF: 0, PC: 0
      };
    });

    this.partidos.forEach(p => {
      if (p.estado !== 'Jugado') return;
      const idsA = p.idsA || [];
      const idsB = p.idsB || [];

      let setsA = 0, setsB = 0, pfA = 0, pfB = 0;
      p.sets.forEach(s => {
        if (s[0] > s[1]) setsA++; else setsB++;
        pfA += s[0]; pfB += s[1];
      });

      const updatePlayer = (id, isTeamA, isWinner) => {
        if (!playerStats[id]) return;
        const st = playerStats[id];
        st.PG += isWinner ? 1 : 0;
        st.PP += isWinner ? 0 : 1;
        st.PF += isTeamA ? pfA : pfB;
        st.PC += isTeamA ? pfB : pfA;

        // Puntos estimativos por jornada para ranking
        const ptsMatch = isWinner ? 25 : 10;
        st.porJornada[p.jornada] = (st.porJornada[p.jornada] || 0) + ptsMatch;
      };

      idsA.forEach(id => updatePlayer(id, true, p.ganador === 'A'));
      idsB.forEach(id => updatePlayer(id, false, p.ganador === 'B'));
    });

    const temporadas = [
      {
        id: '2026-27',
        etiqueta: '2026/27',
        categorias: {
          'IM-A': this.buildRankingCategory('IM-A', 'IM', 'A', playerStats),
          'IF-A': this.buildRankingCategory('IF-A', 'IF', 'A', playerStats),
          'IM-B': this.buildRankingCategory('IM-B', 'IM', 'B', playerStats),
          'IF-B': this.buildRankingCategory('IF-B', 'IF', 'B', playerStats),
          'DM': this.buildRankingCategory('DM', 'DM', '', playerStats),
          'DF': this.buildRankingCategory('DF', 'DF', '', playerStats),
          'DX': this.buildRankingCategory('DX', 'DX', '', playerStats)
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

  buildRankingCategory(catName, tipo, nivel, playerStats) {
    const jornadasList = this.jornadas.map((j, i) => ({ n: i + 1, id: j.id, fecha: j.fecha }));
    const MEJORES = 3;

    const jugadores = Object.values(playerStats)
      .filter(st => {
        if (nivel) return st.categoria === nivel;
        return true;
      })
      .map(st => {
        const pts = jornadasList.map(j => st.porJornada[j.id] !== undefined ? st.porJornada[j.id] : null);
        const valid = pts.filter(p => p !== null).sort((a, b) => b - a);
        const mejores = [];
        for (let k = 0; k < MEJORES; k++) mejores.push(k < valid.length ? valid[k] : null);
        const total = mejores.reduce((acc, v) => acc + (v || 0), 0);

        return {
          id: st.id,
          nombre: st.nombre,
          pts,
          mejores,
          total,
          PG: st.PG,
          PP: st.PP,
          difPartidos: st.PG - st.PP,
          PF: st.PF,
          PC: st.PC,
          difPuntos: st.PF - st.PC
        };
      })
      .sort((a, b) => b.total - a.total || b.PG - a.PG || b.difPuntos - a.difPuntos || a.nombre.localeCompare(b.nombre, 'es'));

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
