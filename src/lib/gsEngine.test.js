import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { BadmintonEngine, getKnockoutRoundTitle } from './gsEngine.js';
import { APPS_SCRIPT_CODE } from './appsScriptBackendCode.js';

test('usa la URL activa de Apps Script como valor predeterminado', () => {
  const instance = new BadmintonEngine();

  assert.equal(
    instance.getWebAppUrl(),
    'https://script.google.com/macros/s/AKfycbzIZxijx_DRPCR7ycYnKSSO2kugZCzBgvimcJ09N-a5HKel5xqHMt9d_wWWyl1-smkOEQ/exec'
  );
});

test('actualiza una URL predeterminada anterior guardada en el navegador', () => {
  const storage = new Map([[
    'liga_badminton_script_url',
    'https://script.google.com/macros/s/AKfycbw7rsu5xrVT06FlpZHgilAA8NZ3UkN_v1J2Id1ynHnmsEgKMy8-9meMdEq6zg1BUb2oEQ/exec'
  ]]);
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value)
    }
  });

  try {
    const instance = new BadmintonEngine();
    const activeUrl = 'https://script.google.com/macros/s/AKfycbzIZxijx_DRPCR7ycYnKSSO2kugZCzBgvimcJ09N-a5HKel5xqHMt9d_wWWyl1-smkOEQ/exec';

    assert.equal(instance.getWebAppUrl(), activeUrl);
    assert.equal(storage.get('liga_badminton_script_url'), activeUrl);
  } finally {
    if (previousStorage) {
      Object.defineProperty(globalThis, 'localStorage', previousStorage);
    } else {
      delete globalThis.localStorage;
    }
  }
});

function createEngine({
  formato = 'UNO',
  desde = '',
  ganarPor2 = false,
  puntosSet = 15,
  sistema = 'GRUPOS'
} = {}) {
  const instance = new BadmintonEngine();
  instance.saveState = () => {};
  instance.jornadas = [{
    id: 'J1',
    fecha: '2026-10-18',
    formato,
    desde,
    ganarPor2,
    puntosSet
  }];
  instance.competiciones['J1_IM-A'] = { sistema };
  instance.callRemote = async () => ({ revision: 'revision-test' });
  instance.syncAllToSheets = async data => {
    instance.lastSyncedSnapshot = data;
    instance.remoteRevision = 'revision-updated';
    instance.localChangesPending = false;
    return { revision: instance.remoteRevision };
  };
  instance.persistBracketMatches = async () => ({ created: 1, updated: 0 });
  return instance;
}

test('clasifica por grupo a todos los inscritos antes de disputar los partidos', () => {
  const instance = createEngine();
  const inscritos = ['1', '2', '3', '4'].map((id, index) => ({
    id,
    ids: [id],
    nombres: [`Jugador ${index + 1}`]
  }));
  const matches = [
    { ronda: 'Fase de grupos', grupo: 'A', estado: 'Pendiente', idsA: ['1'], idsB: ['2'], sets: [] },
    { ronda: 'Fase de grupos', grupo: 'B', estado: 'Pendiente', idsA: ['3'], idsB: ['4'], sets: [] }
  ];

  const standings = instance.calcClasificacion(inscritos, matches, { sistema: 'GRUPOS' });

  assert.deepEqual(Object.keys(standings).sort(), ['A', 'B']);
  assert.deepEqual(standings.A.map(row => row.id).sort(), ['1', '2']);
  assert.deepEqual(standings.B.map(row => row.id).sort(), ['3', '4']);
});

test('aplica el desempate de grupos documentado y mantiene el resultado provisional', () => {
  const instance = createEngine();
  const inscritos = [
    { id: '1', ids: ['1'], nombres: ['Zeta'] },
    { id: '2', ids: ['2'], nombres: ['Alpha'] },
    { id: '3', ids: ['3'], nombres: ['Beta'] }
  ];
  const matches = [
    { ronda: 'Fase de grupos', grupo: 'A', estado: 'Jugado', ganador: 'A', idsA: ['1'], idsB: ['2'], sets: [[15, 10]] },
    { ronda: 'Fase de grupos', grupo: 'A', estado: 'Jugado', ganador: 'B', idsA: ['1'], idsB: ['3'], sets: [[10, 15]] },
    { ronda: 'Fase de grupos', grupo: 'A', estado: 'Jugado', ganador: 'A', idsA: ['2'], idsB: ['3'], sets: [[15, 10]] }
  ];

  const standings = instance.calcClasificacion(inscritos, matches, { sistema: 'GRUPOS' });

  assert.deepEqual(standings.A.map(row => row.nombre), ['Alpha', 'Beta', 'Zeta']);
});

test('valida el formato a un set y rechaza empates o puntuaciones incompletas', () => {
  const instance = createEngine();
  const match = { jornada: 'J1', ronda: 'Fase de grupos', estado: 'Pendiente', idsA: ['1'], idsB: ['2'] };

  assert.equal(instance.validateScore(match, [[15, 12]]), 'A');
  assert.throws(() => instance.validateScore(match, [[12, 12]]), /empatado/);
  assert.throws(() => instance.validateScore(match, [[15]]), /dos puntuaciones/);
  assert.throws(() => instance.validateScore(match, [[16, 14]]), /al llegar a 15/);
  assert.throws(() => instance.validateScore(match, [[15, 12], [15, 8]]), /un solo set/);
});

test('valida el mejor de tres sets y la regla de ganar por dos', () => {
  const instance = createEngine({ formato: 'TRES', ganarPor2: true });
  const match = { jornada: 'J1', ronda: 'Semifinal', estado: 'Pendiente', idsA: ['1'], idsB: ['2'] };

  assert.equal(instance.validateScore(match, [[17, 15], [15, 13]]), 'A');
  assert.throws(() => instance.validateScore(match, [[15, 14], [15, 13]]), /por al menos dos/);
  assert.throws(() => instance.validateScore(match, [[17, 15], [15, 13], [13, 15]]), /después de que un lado haya ganado dos/);
  assert.throws(() => instance.validateScore(match, [[17, 15]]), /al menos dos sets/);
});

test('resuelve el formato mixto a partir de la ronda configurada', () => {
  const instance = createEngine({ formato: 'MIXTO', desde: 'Semifinal' });

  assert.equal(instance.getEffectiveMatchFormat(instance.jornadas[0], { ronda: 'Cuartos' }), 'UNO');
  assert.equal(instance.getEffectiveMatchFormat(instance.jornadas[0], { ronda: 'Semifinal' }), 'TRES');
  assert.throws(
    () => instance.getEffectiveMatchFormat({ ...instance.jornadas[0], desde: 'Ronda desconocida' }, { ronda: 'Final' }),
    /ronda válida/
  );
});

test('al cambiar de un set a mixto conserva el primer set y reabre los partidos que pasan a mejor de tres', async () => {
  const instance = createEngine({ formato: 'UNO', sistema: 'GRUPOS' });
  instance.remoteRevision = 'revision-base';
  instance.partidos = [
    {
      id: 'group-1', jornada: 'J1', categoria: 'IM-A', ronda: 'Fase de grupos',
      grupo: 'A', orden: 1, estado: 'Jugado', ganador: 'A',
      idsA: ['1'], idsB: ['2'], sets: [[15, 10]]
    },
    {
      id: 'quarter-1', jornada: 'J1', categoria: 'IM-A', ronda: 'Cuartos',
      orden: 1, estado: 'Jugado', ganador: 'A',
      idsA: ['1'], idsB: ['2'], sets: [[15, 10]]
    },
    {
      id: 'semi-1', jornada: 'J1', categoria: 'IM-A', ronda: 'Semifinal',
      orden: 1, estado: 'Pendiente', ganador: '',
      idsA: ['1'], idsB: ['3'], sets: []
    }
  ];

  await instance.actualizarFormatoJornada('J1', 'MIXTO', 'Cuartos');

  const groupMatch = instance.partidos.find(match => match.id === 'group-1');
  const quarter = instance.partidos.find(match => match.id === 'quarter-1');
  assert.equal(instance.jornadas[0].formato, 'MIXTO');
  assert.equal(instance.jornadas[0].desde, 'Cuartos');
  assert.equal(groupMatch.estado, 'Jugado');
  assert.deepEqual(groupMatch.sets, [[15, 10]]);
  assert.equal(quarter.estado, 'Pendiente');
  assert.equal(quarter.ganador, '');
  assert.deepEqual(quarter.sets, [[15, 10]]);
  assert.equal(instance.partidos.some(match => match.id === 'semi-1'), false);
  assert.equal(instance.lastSyncedSnapshot.jornadas[0].formato, 'MIXTO');
});

test('al reducir una eliminatoria a un set conserva el primer marcador y recalcula el ganador', async () => {
  const instance = createEngine({ formato: 'TRES', sistema: 'ELIM' });
  instance.remoteRevision = 'revision-base';
  const quarterfinals = Array.from({ length: 4 }, (_, index) => ({
    id: `qf-${index + 1}`,
    jornada: 'J1',
    categoria: 'IM-A',
    ronda: 'Cuartos',
    orden: index + 1,
    estado: 'Jugado',
    ganador: 'A',
    idsA: [String(index * 2 + 1)],
    idsB: [String(index * 2 + 2)],
    sets: index === 0 ? [[10, 15], [15, 10], [15, 12]] : [[15, 10], [15, 12]]
  }));
  instance.partidos = [
    ...quarterfinals,
    { id: 'semi-1', jornada: 'J1', categoria: 'IM-A', ronda: 'Semifinal', orden: 1, estado: 'Jugado', ganador: 'A', idsA: ['1'], idsB: ['5'], sets: [[15, 10], [15, 12]] },
    { id: 'semi-2', jornada: 'J1', categoria: 'IM-A', ronda: 'Semifinal', orden: 2, estado: 'Jugado', ganador: 'A', idsA: ['9'], idsB: ['13'], sets: [[15, 10], [15, 12]] },
    { id: 'final-1', jornada: 'J1', categoria: 'IM-A', ronda: 'Final', orden: 1, estado: 'Pendiente', ganador: '', idsA: ['1'], idsB: ['9'], sets: [] }
  ];

  await instance.actualizarFormatoJornada('J1', 'UNO');

  const firstQuarterfinal = instance.partidos.find(match => match.id === 'qf-1');
  assert.deepEqual(firstQuarterfinal.sets, [[10, 15]]);
  assert.equal(firstQuarterfinal.ganador, 'B');
  assert.equal(firstQuarterfinal.estado, 'Jugado');
  assert.equal(instance.partidos.filter(match => match.ronda === 'Semifinal').length, 2);
  assert.equal(instance.partidos.some(match => match.ronda === 'Final'), false);
});

test('muestra el título de eliminatoria según el número de partidos de la ronda', () => {
  assert.equal(getKnockoutRoundTitle(1), 'Final');
  assert.equal(getKnockoutRoundTitle(2), 'Semifinal');
  assert.equal(getKnockoutRoundTitle(4), 'Cuartos de final');
  assert.equal(getKnockoutRoundTitle(8), 'Octavos de final');
  assert.equal(getKnockoutRoundTitle(16), 'Dieciseisavos de final');
  assert.equal(getKnockoutRoundTitle(3), '');
});

test('conserva cambios locales cuando la hoja remota cambió desde la última carga', async () => {
  const instance = createEngine();
  instance.remoteRevision = 'revision-base';
  instance.localChangesPending = true;
  instance.jornadas[0].fecha = '2026-12-01';
  instance.callRemote = async () => ({
    revision: 'revision-remota-nueva',
    socios: [],
    jornadas: [{ id: 'J1', fecha: '2026-10-18' }],
    inscritos: {},
    competiciones: {},
    partidos: []
  });

  await instance.fetchAllFromSheets();

  assert.equal(instance.jornadas[0].fecha, '2026-12-01');
  assert.equal(instance.remoteRevision, 'revision-base');
  assert.equal(instance.remoteConflictRevision, 'revision-remota-nueva');
  assert.equal(instance.localChangesPending, true);
});

test('requiere confirmación antes de reemplazar una versión remota divergente', async () => {
  const instance = new BadmintonEngine();
  instance.saveState = () => {};
  instance.remoteRevision = 'revision-base';
  instance.remoteConflictRevision = 'revision-remota-nueva';
  instance.jornadas = [{ id: 'J1' }];
  instance.partidos = [];
  let revisionUsed;
  instance.callRemote = async () => {
    revisionUsed = instance.remoteRevision;
    instance.remoteRevision = 'revision-confirmada';
    return { jornadas: 1, partidos: 0, revision: instance.remoteRevision };
  };

  await assert.rejects(
    instance.syncAllToSheets(),
    /Confirma explícitamente/
  );
  await instance.syncAllToSheets(undefined, { confirmedOverwrite: true });

  assert.equal(revisionUsed, 'revision-remota-nueva');
  assert.equal(instance.remoteConflictRevision, null);
  assert.equal(instance.localChangesPending, false);
});

test('cambia el destino remoto sin reutilizar una revisión de la hoja anterior', () => {
  const instance = new BadmintonEngine();
  instance.saveState = () => {};
  instance.remoteRevision = 'revision-antigua';
  instance.remoteConflictRevision = 'conflicto-antiguo';

  instance.setWebAppUrl('https://example.test/apps-script');

  assert.equal(instance.remoteRevision, null);
  assert.equal(instance.remoteConflictRevision, null);
});

test('el backend valida resultados con los participantes y ronda guardados', () => {
  const context = {};
  runInNewContext(`${APPS_SCRIPT_CODE}\nthis.guardarResultado = guardarResultado;`, context);
  const row = ['M1', 'J1', '2026-10-18', 'IM-A', 'Fase de grupos', '', 1, 'Pendiente', '1', 'Jugador 1', '2', 'Jugador 2', '[]', ''];
  const sheet = {
    getDataRange: () => ({ getValues: () => [[], row] }),
    getRange: (_rowNumber, columnNumber) => ({
      setValue: value => { row[columnNumber - 1] = value; }
    })
  };
  context.getOrCreateSheet = () => sheet;
  context.getJornadas = () => [{
    id: 'J1',
    formato: 'MIXTO',
    desde: 'Semifinal',
    puntosSet: 15,
    ganarPor2: false
  }];

  assert.throws(
    () => context.guardarResultado('M1', [[15, 0], [15, 0]], 'A', {
      id: 'M1',
      jornada: 'J1',
      ronda: 'Semifinal',
      idsA: ['otro-jugador'],
      idsB: ['otro-rival']
    }),
    /un solo set/
  );
  assert.equal(row[7], 'Pendiente');
});

test('borrar un resultado eliminatorio invalida también las rondas posteriores', async () => {
  const instance = createEngine({ sistema: 'ELIM' });
  instance.remoteRevision = 'revision-base';
  const semifinal = {
    id: 'semi-1',
    jornada: 'J1',
    categoria: 'IM-A',
    ronda: 'Semifinal',
    orden: 1,
    estado: 'Jugado',
    ganador: 'A',
    idsA: ['1'],
    idsB: ['2'],
    sets: [[15, 10]],
    registrado: 1
  };
  const final = {
    id: 'final-1',
    jornada: 'J1',
    categoria: 'IM-A',
    ronda: 'Final',
    orden: 1,
    estado: 'Pendiente',
    ganador: '',
    idsA: ['1'],
    idsB: ['3'],
    sets: []
  };
  instance.partidos = [semifinal, final];

  await instance.borrarResultado(semifinal.id);

  assert.equal(instance.partidos.find(match => match.id === semifinal.id).estado, 'Pendiente');
  assert.equal(instance.partidos.some(match => match.ronda === 'Final'), false);
  assert.equal(instance.lastSyncedSnapshot.partidos.some(match => match.ronda === 'Final'), false);
});

test('corregir un ganador anterior reinicia las rondas que dependían de él', async () => {
  const instance = createEngine({ formato: 'UNO', sistema: 'ELIM' });
  instance.remoteRevision = 'revision-base';
  instance.callRemote = async () => {
    instance.remoteRevision = 'revision-result';
    return true;
  };
  instance.jornadas[0].formato = 'UNO';
  const quarterfinals = Array.from({ length: 4 }, (_, index) => ({
    id: `qf-${index + 1}`,
    jornada: 'J1',
    categoria: 'IM-A',
    ronda: 'Cuartos',
    orden: index + 1,
    estado: 'Jugado',
    ganador: 'A',
    idsA: [String(index * 2 + 1)],
    idsB: [String(index * 2 + 2)],
    nomA: [`Jugador ${index * 2 + 1}`],
    nomB: [`Jugador ${index * 2 + 2}`],
    sets: [[15, 10]]
  }));
  const semifinals = [
    { id: 'sf-1', jornada: 'J1', categoria: 'IM-A', ronda: 'Semifinal', orden: 1, estado: 'Jugado', ganador: 'A', idsA: ['1'], idsB: ['3'], nomA: ['Jugador 1'], nomB: ['Jugador 3'], sets: [[15, 10]] },
    { id: 'sf-2', jornada: 'J1', categoria: 'IM-A', ronda: 'Semifinal', orden: 2, estado: 'Jugado', ganador: 'A', idsA: ['5'], idsB: ['7'], nomA: ['Jugador 5'], nomB: ['Jugador 7'], sets: [[15, 10]] }
  ];
  const final = {
    id: 'f-1',
    jornada: 'J1',
    categoria: 'IM-A',
    ronda: 'Final',
    orden: 1,
    estado: 'Jugado',
    ganador: 'A',
    idsA: ['1'],
    idsB: ['5'],
    nomA: ['Jugador 1'],
    nomB: ['Jugador 5'],
    sets: [[15, 10]]
  };
  instance.partidos = [...quarterfinals, ...semifinals, final];

  await instance.guardarResultado('qf-1', [[10, 15]]);

  const regeneratedSemifinals = instance.partidos.filter(match => match.ronda === 'Semifinal');
  assert.equal(regeneratedSemifinals.length, 2);
  assert.deepEqual(regeneratedSemifinals[0].idsA, ['2']);
  assert.equal(regeneratedSemifinals[0].estado, 'Pendiente');
  assert.equal(instance.partidos.some(match => match.ronda === 'Final'), false);
});

test('editar el resultado de grupos invalida el cuadro calculado con la clasificación anterior', async () => {
  const instance = createEngine({ formato: 'UNO', sistema: 'GRUPOS' });
  instance.remoteRevision = 'revision-base';
  instance.callRemote = async () => {
    instance.remoteRevision = 'revision-result';
    return true;
  };
  instance.partidos = [
    { id: 'group-match', jornada: 'J1', categoria: 'IM-A', ronda: 'Fase de grupos', grupo: 'A', orden: 1, estado: 'Jugado', ganador: 'A', idsA: ['1'], idsB: ['2'], nomA: ['Jugador 1'], nomB: ['Jugador 2'], sets: [[15, 10]] },
    { id: 'knockout-match', jornada: 'J1', categoria: 'IM-A', ronda: 'Semifinal', orden: 1, estado: 'Pendiente', ganador: '', idsA: ['1'], idsB: ['3'], nomA: ['Jugador 1'], nomB: ['Jugador 3'], sets: [] }
  ];

  await instance.guardarResultado('group-match', [[10, 15]]);

  assert.equal(instance.partidos.find(match => match.id === 'group-match').ganador, 'B');
  assert.equal(instance.partidos.some(match => match.ronda === 'Semifinal'), false);
});

test('el código Apps Script embebido mantiene sintaxis JavaScript válida', () => {
  assert.doesNotThrow(() => new Function(APPS_SCRIPT_CODE));
});
