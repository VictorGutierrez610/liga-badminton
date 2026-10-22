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

test('actualiza una pareja inscrita en todos sus partidos y conserva los resultados', async () => {
  const instance = createEngine({ sistema: 'GRUPOS' });
  const participant = { id: '1+2', ids: ['1', '2'], nombres: ['Jugador Uno', 'Jugador Dos'] };
  const groupMatch = {
    id: 'group-1',
    jornada: 'J1',
    categoria: 'DM',
    ronda: 'Fase de grupos',
    idsA: ['1', '2'],
    nomA: ['Jugador Uno', 'Jugador Dos'],
    idsB: ['3', '4'],
    nomB: ['Jugador Tres', 'Jugador Cuatro'],
    sets: [[21, 18], [19, 21], [21, 17]],
    estado: 'Jugado',
    ganador: 'A',
    registrado: '2026-10-18T12:00:00.000Z'
  };
  const knockoutMatch = {
    ...groupMatch,
    id: 'knockout-1',
    ronda: 'Semifinal',
    idsA: ['5', '6'],
    nomA: ['Jugador Cinco', 'Jugador Seis'],
    idsB: ['2', '1'],
    nomB: ['Jugador Dos', 'Jugador Uno']
  };
  instance.inscritos['J1_DM'] = [
    participant,
    { id: '3+4', ids: ['3', '4'], nombres: ['Jugador Tres', 'Jugador Cuatro'] },
    { id: '5+6', ids: ['5', '6'], nombres: ['Jugador Cinco', 'Jugador Seis'] }
  ];
  instance.socios = [
    { id: '1', nombre: 'Jugador', apellidos: 'Uno' },
    { id: '2', nombre: 'Jugador', apellidos: 'Dos' },
    { id: '7', nombre: 'Jugador', apellidos: 'Siete' },
    { id: '8', nombre: 'Jugador', apellidos: 'Ocho' }
  ];
  instance.partidos = [groupMatch, knockoutMatch];
  let persistedSnapshot;
  instance.persistFullStateOrLocal = async snapshot => { persistedSnapshot = snapshot; };

  const changed = await instance.actualizarParejaInscrita('J1', 'DM', '1+2', ['7', '8']);

  assert.equal(changed, true);
  assert.deepEqual(instance.inscritos['J1_DM'][0], {
    id: '1+2',
    ids: ['7', '8'],
    nombres: ['Jugador Siete', 'Jugador Ocho']
  });
  assert.deepEqual(instance.partidos.map(match => [match.idsA, match.idsB]), [
    [['7', '8'], ['3', '4']],
    [['5', '6'], ['7', '8']]
  ]);
  assert.deepEqual(instance.partidos.map(match => [match.nomA, match.nomB]), [
    [['Jugador Siete', 'Jugador Ocho'], ['Jugador Tres', 'Jugador Cuatro']],
    [['Jugador Cinco', 'Jugador Seis'], ['Jugador Siete', 'Jugador Ocho']]
  ]);
  assert.deepEqual(instance.partidos[0].sets, groupMatch.sets);
  assert.equal(instance.partidos[0].estado, 'Jugado');
  assert.equal(instance.partidos[0].ganador, 'A');
  assert.equal(instance.partidos[0].registrado, groupMatch.registrado);
  assert.deepEqual(persistedSnapshot.partidos, instance.partidos);
});

test('impide asignar a una pareja un jugador ya inscrito en otra pareja', async () => {
  const instance = createEngine();
  instance.inscritos['J1_DM'] = [
    { id: '1+2', ids: ['1', '2'], nombres: ['Uno', 'Dos'] },
    { id: '3+4', ids: ['3', '4'], nombres: ['Tres', 'Cuatro'] }
  ];

  await assert.rejects(
    instance.actualizarParejaInscrita('J1', 'DM', '1+2', ['1', '3']),
    /más de una pareja/
  );
  assert.deepEqual(instance.inscritos['J1_DM'][0].ids, ['1', '2']);
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

test('preserva la marca local de parejas rotativas si Apps Script devuelve una jornada sin ella', async () => {
  const instance = createEngine();
  instance.jornadas[0].parejasRotativas = true;
  instance.callRemote = async () => ({
    revision: 'revision-remota',
    socios: [],
    jornadas: [{ id: 'J1', fecha: '2026-10-18', parejasRotativas: false }],
    inscritos: {},
    competiciones: {},
    partidos: []
  });

  await instance.fetchAllFromSheets({ discardLocal: true });

  assert.equal(instance.jornadas[0].parejasRotativas, true);
  assert.equal(instance.localChangesPending, true);
  assert.equal(instance.remoteRevision, 'revision-remota');
  assert.match(instance.lastRemoteError, /Apps Script actualizado/);
});

test('rechaza una sincronización que confirma el guardado pero pierde la marca rotativa', async () => {
  const instance = createEngine();
  instance.jornadas[0].parejasRotativas = true;
  instance.remoteRevision = 'revision-base';
  instance.syncAllToSheets = BadmintonEngine.prototype.syncAllToSheets.bind(instance);
  instance.callRemote = async action => action === 'syncAll'
    ? { revision: 'revision-guardada' }
    : {
        revision: 'revision-guardada',
        jornadas: [{ id: 'J1', parejasRotativas: false }]
      };

  await assert.rejects(
    instance.syncAllToSheets(),
    /no guardó la marca de parejas rotativas/
  );

  assert.equal(instance.localChangesPending, true);
  assert.equal(instance.lastSyncStatus, 'remote-error');
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

test('reconoce los encabezados de Jornadas existentes y añade parejas rotativas sin sobrescribir columnas', () => {
  const headers = [
    'ID_Jornada', 'Fecha', 'Modalidad', 'Formato', 'BO3_Desde',
    'PuntosSet', 'GanarPor2', 'Creada', 'Estado'
  ];
  const rows = [[
    'J20261002', '2026-10-02', 'Dobles', 'MIXTO', 'Fase eliminatoria',
    15, false, 'En Curso', ''
  ]];
  const sheet = {
    getLastColumn: () => headers.length,
    getDataRange: () => ({
      getValues: () => [
        [...headers],
        ...rows.map(row => [...row, ...Array(Math.max(0, headers.length - row.length)).fill('')])
      ]
    }),
    getRange: (rowNumber, columnNumber, rowCount, columnCount) => {
      if (rowCount !== undefined && columnCount !== undefined) {
        return {
          getValues: () => [headers.slice(columnNumber - 1, columnNumber - 1 + columnCount)]
        };
      }
      const range = {
        getValue: () => rowNumber === 1
          ? headers[columnNumber - 1]
          : rows[rowNumber - 2]?.[columnNumber - 1],
        setValue: value => {
          if (rowNumber === 1) {
            headers[columnNumber - 1] = value;
          } else {
            rows[rowNumber - 2][columnNumber - 1] = value;
          }
          return range;
        },
        setFontWeight: () => {}
      };
      return range;
    }
  };
  const context = {
    SpreadsheetApp: {
      openById: () => ({ getSheetByName: () => sheet })
    },
    Utilities: {
      formatDate: value => String(value)
    },
    Session: {
      getScriptTimeZone: () => 'UTC'
    }
  };
  runInNewContext(
    `${APPS_SCRIPT_CODE}\nthis.getJornadas = getJornadas; this.getJornadasSheet = getJornadasSheet; this.getJornadasColumns = getJornadasColumns; this.jornadaRow = jornadaRow;`,
    context
  );

  const jornadas = context.getJornadas();
  assert.equal(headers[9], 'ParejasRotativas');
  assert.equal(jornadas[0].id, 'J20261002');
  assert.equal(jornadas[0].desde, 'Fase eliminatoria');
  assert.equal(jornadas[0].definitiva, false);
  assert.equal(jornadas[0].parejasRotativas, false);
  assert.equal(rows[0][7], 'En Curso');
  assert.equal(rows[0][8], 'En Curso');

  const columns = context.getJornadasColumns(context.getJornadasSheet());
  const updatedRow = context.jornadaRow({
    id: 'J20261002',
    fecha: '2026-10-02',
    modalidad: 'Dobles',
    formato: 'MIXTO',
    desde: 'Fase eliminatoria',
    puntosSet: 15,
    ganarPor2: false,
    definitiva: false,
    parejasRotativas: true
  }, columns, rows[0]);

  assert.equal(updatedRow[7], 'En Curso');
  assert.equal(updatedRow[8], 'En Curso');
  assert.equal(updatedRow[9], true);
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

test('genera seis rondas rotativas equilibrando las participaciones en dobles masculinos', async () => {
  const instance = createEngine({ sistema: 'ROTATIVOS' });
  instance.jornadas[0].parejasRotativas = true;
  instance.jornadas[0].modalidad = 'Dobles';
  instance.socios = Array.from({ length: 8 }, (_, index) => ({
    id: String(index + 1),
    nombre: `Jugador ${index + 1}`,
    apellidos: 'Prueba',
    sexo: 'M'
  }));

  for (let id = 1; id <= 8; id++) {
    await instance.anadirInscrito('J1', 'DM', [String(id)]);
  }
  await instance.crearCompeticion('J1', 'DM', { sistema: 'ROTATIVOS' });

  const matches = instance.partidos.filter(match => match.categoria === 'DM');
  assert.equal(matches.length, 12);
  assert.deepEqual(
    [...new Set(matches.map(match => match.grupo))],
    ['Ronda 1', 'Ronda 2', 'Ronda 3', 'Ronda 4', 'Ronda 5', 'Ronda 6']
  );
  const appearances = new Map();
  matches.forEach(match => {
    assert.equal(match.idsA.length, 2);
    assert.equal(match.idsB.length, 2);
    assert.equal(new Set([...match.idsA, ...match.idsB]).size, 4);
    [...match.idsA, ...match.idsB].forEach(id => appearances.set(id, (appearances.get(id) || 0) + 1));
  });
  assert.deepEqual([...appearances.values()], Array(8).fill(6));
});

test('persiste la opción de parejas rotativas en jornadas de dobles, no en individuales', async () => {
  const instance = createEngine();
  const rotating = await instance.crearJornada({
    fecha: '2026-11-20',
    modalidad: 'Dobles',
    formato: 'UNO',
    puntosSet: 15,
    parejasRotativas: true
  });
  const individual = await instance.crearJornada({
    fecha: '2026-11-27',
    modalidad: 'Individual',
    formato: 'UNO',
    puntosSet: 15,
    parejasRotativas: true
  });

  assert.equal(rotating.parejasRotativas, true);
  assert.equal(individual.parejasRotativas, false);
  assert.equal(instance.getStateSnapshot().jornadas.find(item => item.id === rotating.id).parejasRotativas, true);
});

test('genera rondas mixtas con una mujer y un hombre en cada lado e impide repetir inscripciones', async () => {
  const instance = createEngine({ sistema: 'ROTATIVOS' });
  instance.jornadas[0].parejasRotativas = true;
  instance.jornadas[0].modalidad = 'Dobles mixtos';
  instance.socios = [
    ...Array.from({ length: 20 }, (_, index) => ({
      id: String(index + 1),
      nombre: `Hombre ${index + 1}`,
      apellidos: 'Prueba',
      sexo: 'M'
    })),
    ...Array.from({ length: 15 }, (_, index) => ({
      id: String(index + 21),
      nombre: `Mujer ${index + 1}`,
      apellidos: 'Prueba',
      sexo: 'F'
    }))
  ];

  for (let id = 1; id <= 35; id++) {
    await instance.anadirInscrito('J1', 'DX', [String(id)]);
  }
  await assert.rejects(instance.anadirInscrito('J1', 'DX', ['1']), /ya está inscrito/);
  instance.socios.push({ id: '36', nombre: 'Sin sexo', apellidos: 'Prueba', sexo: '' });
  await assert.rejects(instance.anadirInscrito('J1', 'DX', ['36']), /sexo indicado/);
  await instance.crearCompeticion('J1', 'DX', { sistema: 'ROTATIVOS' });

  assert.equal(instance.partidos.length, 42);
  assert.deepEqual(
    Array.from({ length: 6 }, (_, index) =>
      instance.partidos.filter(match => match.grupo === `Ronda ${index + 1}`).length
    ),
    Array(6).fill(7)
  );
  const appearances = new Map();
  for (let round = 1; round <= 6; round++) {
    const roundMatches = instance.partidos.filter(match => match.grupo === `Ronda ${round}`);
    const roundPlayerIds = roundMatches.flatMap(match => [...match.idsA, ...match.idsB]);
    assert.equal(new Set(roundPlayerIds).size, 28);
    roundPlayerIds.forEach(id => appearances.set(id, (appearances.get(id) || 0) + 1));
  }
  const maleAppearances = Array.from({ length: 20 }, (_, index) => appearances.get(String(index + 1)));
  const femaleAppearances = Array.from({ length: 15 }, (_, index) => appearances.get(String(index + 21)));
  assert.ok(Math.max(...maleAppearances) - Math.min(...maleAppearances) <= 1);
  assert.ok(Math.max(...femaleAppearances) - Math.min(...femaleAppearances) <= 1);
  assert.equal(maleAppearances.reduce((sum, count) => sum + count, 0), 84);
  assert.equal(femaleAppearances.reduce((sum, count) => sum + count, 0), 84);
  instance.partidos.forEach(match => {
    for (const side of ['A', 'B']) {
      const sexes = match[`ids${side}`].map(id =>
        instance.socios.find(socio => socio.id === id).sexo
      );
      assert.deepEqual(sexes.sort(), ['F', 'M']);
    }
  });
});

test('no limita el número de partidos por ronda y reparte descansos con inscritos no divisibles entre cuatro', async () => {
  const instance = createEngine({ sistema: 'ROTATIVOS' });
  instance.jornadas[0].parejasRotativas = true;
  instance.jornadas[0].modalidad = 'Dobles';
  instance.socios = Array.from({ length: 26 }, (_, index) => ({
    id: String(index + 1),
    nombre: `Jugador ${index + 1}`,
    apellidos: 'Prueba',
    sexo: 'M'
  }));
  for (let id = 1; id <= 26; id++) {
    await instance.anadirInscrito('J1', 'DM', [String(id)]);
  }
  await instance.crearCompeticion('J1', 'DM', { sistema: 'ROTATIVOS' });

  assert.equal(instance.partidos.length, 36);
  const appearances = new Map();
  for (let round = 1; round <= 6; round++) {
    const roundMatches = instance.partidos.filter(match => match.grupo === `Ronda ${round}`);
    const roundPlayerIds = roundMatches.flatMap(match => [...match.idsA, ...match.idsB]);
    assert.equal(roundMatches.length, 6);
    assert.equal(new Set(roundPlayerIds).size, 24);
    roundPlayerIds.forEach(id => appearances.set(id, (appearances.get(id) || 0) + 1));
  }
  const counts = Array.from({ length: 26 }, (_, index) => appearances.get(String(index + 1)) || 0);
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 1);
  assert.equal(counts.reduce((sum, count) => sum + count, 0), 144);
});

test('clasifica individualmente y genera la final mixta con los dos primeros de cada sexo', async () => {
  const instance = createEngine({ sistema: 'ROTATIVOS' });
  instance.jornadas[0].parejasRotativas = true;
  instance.jornadas[0].modalidad = 'Dobles mixtos';
  instance.socios = [
    { id: 'm1', nombre: 'Hombre 1', apellidos: 'Prueba', sexo: 'M' },
    { id: 'm2', nombre: 'Hombre 2', apellidos: 'Prueba', sexo: 'M' },
    { id: 'f1', nombre: 'Mujer 1', apellidos: 'Prueba', sexo: 'F' },
    { id: 'f2', nombre: 'Mujer 2', apellidos: 'Prueba', sexo: 'F' }
  ];
  const inscritos = instance.socios.map(player => ({
    id: player.id,
    ids: [player.id],
    nombres: [`${player.nombre} ${player.apellidos}`]
  }));
  instance.inscritos['J1_DX'] = inscritos;
  instance.competiciones['J1_DX'] = { sistema: 'ROTATIVOS', grupos: 1, clasifican: 0 };
  instance.partidos = [
    { id: 'r1', jornada: 'J1', categoria: 'DX', ronda: 'Fase de grupos', grupo: 'Ronda 1', estado: 'Jugado', ganador: 'A', idsA: ['f1', 'm1'], idsB: ['f2', 'm2'], sets: [[15, 10]] },
    { id: 'r2', jornada: 'J1', categoria: 'DX', ronda: 'Fase de grupos', grupo: 'Ronda 2', estado: 'Jugado', ganador: 'A', idsA: ['f1', 'm1'], idsB: ['f2', 'm2'], sets: [[15, 10]] },
    { id: 'r3', jornada: 'J1', categoria: 'DX', ronda: 'Fase de grupos', grupo: 'Ronda 3', estado: 'Jugado', ganador: 'A', idsA: ['f1', 'm1'], idsB: ['f2', 'm2'], sets: [[15, 10]] },
    { id: 'r4', jornada: 'J1', categoria: 'DX', ronda: 'Fase de grupos', grupo: 'Ronda 4', estado: 'Jugado', ganador: 'B', idsA: ['f2', 'm2'], idsB: ['f1', 'm1'], sets: [[10, 15]] },
    { id: 'r5', jornada: 'J1', categoria: 'DX', ronda: 'Fase de grupos', grupo: 'Ronda 5', estado: 'Jugado', ganador: 'B', idsA: ['f2', 'm2'], idsB: ['f1', 'm1'], sets: [[10, 15]] },
    { id: 'r6', jornada: 'J1', categoria: 'DX', ronda: 'Fase de grupos', grupo: 'Ronda 6', estado: 'Jugado', ganador: 'B', idsA: ['f2', 'm2'], idsB: ['f1', 'm1'], sets: [[10, 15]] }
  ];
  const detail = instance.getCompeticionDetalle('J1', 'DX');
  const ranking = detail.clasificacion['Clasificación individual'];
  assert.equal(ranking.find(player => player.id === 'm1').G, 6);
  assert.equal(ranking.find(player => player.id === 'f1').PF, 90);
  instance.persistBracketMatches = async (matches, updatedMatches) => {
    assert.equal(matches.length, 1);
    assert.equal(updatedMatches.length, 7);
    return { created: 1, updated: 0 };
  };

  const finalMatch = await instance.generarFinalParejasRotativas('J1', 'DX');

  assert.equal(finalMatch.ronda, 'Final');
  assert.deepEqual(finalMatch.idsA, ['f1', 'm1']);
  assert.deepEqual(finalMatch.idsB, ['f2', 'm2']);
  assert.equal(instance.partidos.length, 7);
  await assert.rejects(instance.generarFinalParejasRotativas('J1', 'DX'), /ya está creada/);
});

test('el código Apps Script embebido mantiene sintaxis JavaScript válida', () => {
  assert.doesNotThrow(() => new Function(APPS_SCRIPT_CODE));
  assert.match(APPS_SCRIPT_CODE, /ParejasRotativas/);
  assert.match(APPS_SCRIPT_CODE, /jornada\.parejasRotativas\s*\|\|\s*false/);
});
