/**
 * Verifica del motore adattivo (`SPEC.md` §5).
 *
 * Questi test sono scritti al contrario: invece di verificare che il motore
 * funzioni, verificano che NON faccia le cose vietate. Un incremento proposto
 * senza i cinque presupposti della specifica e' il difetto piu' grave che
 * questo progetto possa avere dopo la perdita di dati.
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ENGINE_CONFIG,
  EXERCISE_LIBRARY,
  decideProgression,
  evaluate,
  extractExposures,
  exposureVolume,
  groupByComparability,
  restsAreUnchanged,
  shortenSession,
  buildSessionA,
  buildSessionB,
  comparabilityKey,
  type CoachProposal,
} from '@trackstrong/core';
import {
  buildContext,
  buildHistoryEntry,
  LEG_PRESS_A,
  LEG_PRESS_B,
  testCursor,
  testProfile,
  twoPerfectLegPressExposures,
  UNCONFIGURED_MACHINE,
} from './helpers/fixtures.js';

function increaseProposals(proposals: readonly CoachProposal[]): readonly CoachProposal[] {
  return proposals.filter(
    (p) => p.change.kind === 'increaseLoad' || p.change.kind === 'increaseReps',
  );
}

function loadIncreases(proposals: readonly CoachProposal[]): readonly CoachProposal[] {
  return proposals.filter((p) => p.change.kind === 'increaseLoad');
}

const PERFECT_SETS = [
  { reps: 8, kg: 60, rir: 2 },
  { reps: 8, kg: 60, rir: 2 },
  { reps: 8, kg: 60, rir: 2 },
] as const;

// ===========================================================================
// Il caso positivo: due esposizioni valide producono una proposta motivata
// ===========================================================================

describe('Due esposizioni valide producono una proposta motivata (SPEC §5.1)', () => {
  const result = evaluate(buildContext({ history: twoPerfectLegPressExposures(60) }));
  const proposal = loadIncreases(result.proposals)[0];

  it('propone un incremento di carico', () => {
    expect(proposal).toBeDefined();
    expect(proposal?.change.kind).toBe('increaseLoad');
  });

  it('usa il gradino minimo configurato sull attrezzo, non una percentuale', () => {
    if (proposal?.change.kind !== 'increaseLoad') throw new Error('atteso increaseLoad');
    expect(proposal.change.fromKg).toBe(60);
    // 60 + 5 kg del pacco di QUESTA pressa. Una percentuale del 2,5% darebbe
    // 61,5 kg, un carico non impostabile.
    expect(proposal.change.toKg).toBe(65);
  });

  it('mostra i dati utilizzati, con riferimento alle serie di origine', () => {
    expect(proposal?.evidence.length).toBe(2);
    for (const e of proposal?.evidence ?? []) {
      expect(e.sourceSetIds.length).toBeGreaterThan(0);
      expect(e.sourceSessionIds.length).toBe(1);
      expect(e.value).toContain('RIR');
    }
  });

  it('mostra la ragione, il momento della rivalutazione e la versione di base', () => {
    expect(proposal?.reason).toContain('confermato in 2 esposizioni consecutive confrontabili');
    expect(proposal?.reevaluateOn).toBe('2026-11-13');
    expect(proposal?.basePlanVersion).toBe(1);
  });

  it('nasce da decidere, non applicata', () => {
    expect(proposal?.decision).toBe('pending');
    expect(proposal?.decidedAt).toBeNull();
  });

  it('non dichiara informazioni mancanti quando non ce ne sono', () => {
    expect(proposal?.missingInformation).toEqual([]);
  });

  it('proviene dal motore locale, non da un modello generativo', () => {
    expect(proposal?.source).toBe('adaptiveEngine');
  });
});

// ===========================================================================
// Dati incompleti: nessun incremento ingiustificato
// ===========================================================================

describe('Dati incompleti non producono incrementi ingiustificati (SPEC §5.1)', () => {
  it('una sola esposizione valida non basta', () => {
    const history = [
      buildHistoryEntry({
        performedDate: '2026-10-29',
        exposures: [
          {
            exerciseId: 'legPress',
            equipmentInstanceId: LEG_PRESS_A.id,
            technique: 'controlled',
            sets: [...PERFECT_SETS],
          },
        ],
      }),
    ];
    const result = evaluate(buildContext({ history }));
    expect(loadIncreases(result.proposals)).toEqual([]);
    const hold = result.proposals.find((p) => p.change.kind === 'hold');
    expect(hold?.missingInformation.map((m) => m.code)).toContain('notEnoughExposures');
  });

  it('il RIR non dichiarato blocca l incremento e viene segnalato', () => {
    const sets = [
      { reps: 8, kg: 60, rir: null },
      { reps: 8, kg: 60, rir: null },
      { reps: 8, kg: 60, rir: null },
    ];
    const history = [
      buildHistoryEntry({
        performedDate: '2026-10-29',
        exposures: [
          { exerciseId: 'legPress', equipmentInstanceId: LEG_PRESS_A.id, technique: 'controlled', sets },
        ],
      }),
      buildHistoryEntry({
        performedDate: '2026-10-26',
        exposures: [
          { exerciseId: 'legPress', equipmentInstanceId: LEG_PRESS_A.id, technique: 'controlled', sets },
        ],
      }),
    ];
    const result = evaluate(buildContext({ history }));
    expect(loadIncreases(result.proposals)).toEqual([]);
    const hold = result.proposals.find((p) => p.change.kind === 'hold');
    expect(hold?.missingInformation.map((m) => m.code)).toContain('noRirDeclared');
  });

  it('la tecnica non dichiarata blocca l incremento e viene segnalata', () => {
    const history = [
      buildHistoryEntry({
        performedDate: '2026-10-29',
        exposures: [
          { exerciseId: 'legPress', equipmentInstanceId: LEG_PRESS_A.id, technique: null, sets: [...PERFECT_SETS] },
        ],
      }),
      buildHistoryEntry({
        performedDate: '2026-10-26',
        exposures: [
          { exerciseId: 'legPress', equipmentInstanceId: LEG_PRESS_A.id, technique: null, sets: [...PERFECT_SETS] },
        ],
      }),
    ];
    const result = evaluate(buildContext({ history }));
    expect(loadIncreases(result.proposals)).toEqual([]);
    const hold = result.proposals.find((p) => p.change.kind === 'hold');
    expect(hold?.missingInformation.map((m) => m.code)).toContain('noTechniqueDeclared');
  });

  it('una tecnica incerta o ceduta blocca l incremento', () => {
    for (const technique of ['uncertain', 'broke'] as const) {
      const history = [
        buildHistoryEntry({
          performedDate: '2026-10-29',
          exposures: [
            { exerciseId: 'legPress', equipmentInstanceId: LEG_PRESS_A.id, technique, sets: [...PERFECT_SETS] },
          ],
        }),
        buildHistoryEntry({
          performedDate: '2026-10-26',
          exposures: [
            { exerciseId: 'legPress', equipmentInstanceId: LEG_PRESS_A.id, technique, sets: [...PERFECT_SETS] },
          ],
        }),
      ];
      expect(loadIncreases(evaluate(buildContext({ history })).proposals)).toEqual([]);
    }
  });

  it('il margine sotto il minimo di fase blocca l incremento', () => {
    // Limite superiore raggiunto, ma con RIR 0: non c'era il margine di 2
    // previsto dalla fase. Aggiungere carico lo ridurrebbe ancora.
    const sets = [
      { reps: 8, kg: 60, rir: 0 },
      { reps: 8, kg: 60, rir: 0 },
      { reps: 8, kg: 60, rir: 0 },
    ];
    const history = [
      buildHistoryEntry({
        performedDate: '2026-10-29',
        exposures: [{ exerciseId: 'legPress', equipmentInstanceId: LEG_PRESS_A.id, sets }],
      }),
      buildHistoryEntry({
        performedDate: '2026-10-26',
        exposures: [{ exerciseId: 'legPress', equipmentInstanceId: LEG_PRESS_A.id, sets }],
      }),
    ];
    const result = evaluate(buildContext({ history }));
    expect(loadIncreases(result.proposals)).toEqual([]);
  });

  it('due serie su tre al limite superiore non sono tutte le serie previste', () => {
    const sets = [
      { reps: 8, kg: 60, rir: 2 },
      { reps: 8, kg: 60, rir: 2 },
    ];
    const history = [
      buildHistoryEntry({
        performedDate: '2026-10-29',
        exposures: [{ exerciseId: 'legPress', equipmentInstanceId: LEG_PRESS_A.id, sets }],
      }),
      buildHistoryEntry({
        performedDate: '2026-10-26',
        exposures: [{ exerciseId: 'legPress', equipmentInstanceId: LEG_PRESS_A.id, sets }],
      }),
    ];
    expect(loadIncreases(evaluate(buildContext({ history })).proposals)).toEqual([]);
  });

  it('un gradino non configurato sull attrezzo viene dichiarato da confermare', () => {
    // Decisione di progetto: quando l'attrezzo non e' ancora configurato, il
    // motore usa il valore predefinito dell'esercizio MA lo dichiara come
    // informazione da confermare. Rifiutare del tutto la proposta renderebbe
    // il motore inutile fino a quando ogni macchina della palestra non e'
    // stata censita; proporre il numero in silenzio, invece, lo farebbe
    // passare per un dato verificato. Vedi COACH_RULES.md.
    const sets = [
      { reps: 8, kg: 40, rir: 2 },
      { reps: 8, kg: 40, rir: 2 },
      { reps: 8, kg: 40, rir: 2 },
    ];
    const exposures = [
      {
        exerciseId: 'chestPressMachine',
        equipmentInstanceId: UNCONFIGURED_MACHINE.id,
        technique: 'controlled' as const,
        sets,
      },
    ];
    const history = [
      buildHistoryEntry({ performedDate: '2026-10-29', exposures }),
      buildHistoryEntry({ performedDate: '2026-10-26', exposures }),
    ];
    const proposal = loadIncreases(evaluate(buildContext({ history })).proposals)[0];
    expect(proposal).toBeDefined();
    expect(proposal?.missingInformation.map((m) => m.code)).toContain(
      'unconfirmedEquipmentStep',
    );
    expect(proposal?.reason).toContain('verifica in palestra');
  });

  it('con gradino configurato la proposta non ha avvertenze da confermare', () => {
    const proposal = loadIncreases(
      evaluate(buildContext({ history: twoPerfectLegPressExposures(60) })).proposals,
    )[0];
    expect(proposal?.missingInformation).toEqual([]);
  });

  it('per un esercizio senza alcun gradino di carico non si propone un carico', () => {
    // Plank laterale: `timeOnly`, gradino 0. Anche raggiungendo il limite
    // superiore in due esposizioni, non esiste un carico da aumentare.
    const sets = [
      { seconds: 25, kg: null, rir: null },
      { seconds: 25, kg: null, rir: null },
    ];
    const history = [
      buildHistoryEntry({
        performedDate: '2026-10-29',
        slot: 'B' as const,
        exposures: [{ exerciseId: 'sideplankKneesDown', sets }],
      }),
      buildHistoryEntry({
        performedDate: '2026-10-26',
        slot: 'B' as const,
        exposures: [{ exerciseId: 'sideplankKneesDown', sets }],
      }),
    ];
    expect(loadIncreases(evaluate(buildContext({ history })).proposals)).toEqual([]);
  });

  it('senza storico non produce nessuna proposta di progressione', () => {
    const result = evaluate(buildContext({ history: [] }));
    expect(increaseProposals(result.proposals)).toEqual([]);
    expect(result.exposuresConsidered).toBe(0);
    expect(result.globalMissingInformation.map((m) => m.code)).toContain('noComparableHistory');
  });

  it('le serie in bozza e annullate non contano come eseguite', () => {
    const history = [
      buildHistoryEntry({
        performedDate: '2026-10-29',
        exposures: [
          {
            exerciseId: 'legPress',
            equipmentInstanceId: LEG_PRESS_A.id,
            sets: [
              { reps: 8, kg: 60, rir: 2, status: 'draft' },
              { reps: 8, kg: 60, rir: 2, status: 'voided' },
              { reps: 8, kg: 60, rir: 2, status: 'skipped' },
            ],
          },
        ],
      }),
    ];
    expect(extractExposures(history)).toEqual([]);
  });

  it('le serie di riscaldamento non attivano progressioni', () => {
    const history = [
      buildHistoryEntry({
        performedDate: '2026-10-29',
        exposures: [
          {
            exerciseId: 'legPress',
            equipmentInstanceId: LEG_PRESS_A.id,
            sets: [
              { reps: 8, kg: 60, rir: 2, role: 'warmup' },
              { reps: 8, kg: 60, rir: 2, role: 'warmup' },
              { reps: 8, kg: 60, rir: 2, role: 'warmup' },
            ],
          },
        ],
      }),
    ];
    expect(extractExposures(history)).toEqual([]);
  });

  it('la configurazione non permette di aggirare il controllo sui dati mancanti', () => {
    // Il tipo di `allowIncreaseWithMissingData` e' letteralmente `false`:
    // non esiste un valore che riattivi il comportamento vietato.
    expect(DEFAULT_ENGINE_CONFIG.allowIncreaseWithMissingData).toBe(false);
  });
});

// ===========================================================================
// Confronti illegittimi
// ===========================================================================

describe('Macchine diverse non sono equivalenti (SPEC §5.3)', () => {
  it('due presse diverse producono chiavi di comparabilita distinte', () => {
    const keyA = comparabilityKey({
      exerciseId: 'legPress',
      variantId: null,
      loadConvention: 'machineStack',
      equipmentInstanceId: LEG_PRESS_A.id,
      metric: 'reps',
      perSide: false,
    });
    const keyB = comparabilityKey({
      exerciseId: 'legPress',
      variantId: null,
      loadConvention: 'machineStack',
      equipmentInstanceId: LEG_PRESS_B.id,
      metric: 'reps',
      perSide: false,
    });
    expect(keyA).not.toBe(keyB);
  });

  it('una prestazione su ciascuna delle due presse non conferma un incremento', () => {
    const sets = [
      { reps: 8, kg: 60, rir: 2 },
      { reps: 8, kg: 60, rir: 2 },
      { reps: 8, kg: 60, rir: 2 },
    ];
    const history = [
      buildHistoryEntry({
        performedDate: '2026-10-29',
        exposures: [{ exerciseId: 'legPress', equipmentInstanceId: LEG_PRESS_A.id, sets }],
      }),
      buildHistoryEntry({
        performedDate: '2026-10-26',
        // Stessa scheda, macchina DIVERSA: non e' la seconda esposizione
        // confrontabile richiesta dalla specifica.
        exposures: [{ exerciseId: 'legPress', equipmentInstanceId: LEG_PRESS_B.id, sets }],
      }),
    ];
    const result = evaluate(buildContext({ history }));
    expect(loadIncreases(result.proposals)).toEqual([]);
  });

  it('le esposizioni si raggruppano per chiave, non per esercizio', () => {
    const sets = [{ reps: 8, kg: 60, rir: 2 }];
    const history = [
      buildHistoryEntry({
        performedDate: '2026-10-29',
        exposures: [
          { exerciseId: 'legPress', equipmentInstanceId: LEG_PRESS_A.id, sets },
        ],
      }),
      buildHistoryEntry({
        performedDate: '2026-10-26',
        exposures: [
          { exerciseId: 'legPress', equipmentInstanceId: LEG_PRESS_B.id, sets },
        ],
      }),
    ];
    const groups = groupByComparability(extractExposures(history));
    expect(groups.size).toBe(2);
  });

  it('una convenzione legata a una macchina senza identita attrezzo e rifiutata', () => {
    expect(() =>
      comparabilityKey({
        exerciseId: 'legPress',
        variantId: null,
        loadConvention: 'machineStack',
        equipmentInstanceId: null,
        metric: 'reps',
        perSide: false,
      }),
    ).toThrow(/richiede equipmentInstanceId/);
  });

  it('due manubri dello stesso peso restano confrontabili fra sedute', () => {
    const key = (equipmentInstanceId: string | null): string =>
      comparabilityKey({
        exerciseId: 'dumbbellRomanianDeadlift',
        variantId: null,
        loadConvention: 'perDumbbell',
        equipmentInstanceId,
        metric: 'reps',
        perSide: false,
      });
    // I manubri non sono legati a un attrezzo specifico: 20 kg sono 20 kg.
    expect(key('rastrelliera-1')).toBe(key('rastrelliera-2'));
  });

  it('ripetizioni e secondi non finiscono nello stesso confronto', () => {
    const base = {
      exerciseId: 'farmerCarry',
      variantId: null,
      loadConvention: 'perDumbbell' as const,
      equipmentInstanceId: null,
      perSide: false,
    };
    expect(comparabilityKey({ ...base, metric: 'reps' })).not.toBe(
      comparabilityKey({ ...base, metric: 'seconds' }),
    );
  });
});

describe('Volume: convenzioni esplicite, nessun numero inventato (SPEC §13.1)', () => {
  function volumeFor(
    exerciseId: string,
    sets: readonly { reps?: number; seconds?: number; kg?: number | null }[],
    equipmentInstanceId: string | null = null,
  ): ReturnType<typeof exposureVolume> {
    const history = [
      buildHistoryEntry({
        performedDate: '2026-10-29',
        slot: exerciseId === 'legPress' ? 'A' : 'B',
        exposures: [{ exerciseId, equipmentInstanceId, sets: sets.map((s) => ({ ...s, rir: 2 })) }],
      }),
    ];
    const exposure = extractExposures(history)[0];
    if (exposure === undefined) throw new Error('nessuna esposizione');
    return exposureVolume(exposure);
  }

  it('non somma il peso corporeo al volume dello step-up', () => {
    // 2 kg di sovraccarico x 8 ripetizioni x 2 gambe = 32 kg,
    // NON (95 kg di corpo + 2) x 16.
    const volume = volumeFor('stepUp', [
      { reps: 8, kg: 2 },
      { reps: 8, kg: 2 },
    ]);
    expect(volume?.kg).toBe(32);
    expect(volume?.convention).toContain('peso corporeo escluso');
  });

  it('conta entrambi i manubri dichiarando la convenzione', () => {
    const volume = volumeFor('dumbbellRomanianDeadlift', [{ reps: 8, kg: 20 }]);
    expect(volume?.kg).toBe(320); // 20 x 2 x 8
    expect(volume?.convention).toContain('per manubrio');
  });

  it('non produce un volume per gli esercizi a tempo', () => {
    expect(volumeFor('sideplankKneesDown', [{ seconds: 20, kg: null }])).toBeNull();
  });

  it('dichiara che il valore di una macchina vale solo su quella macchina', () => {
    const volume = volumeFor('legPress', [{ reps: 8, kg: 60 }], LEG_PRESS_A.id);
    expect(volume?.convention).toContain('solo su questa macchina');
  });
});

// ===========================================================================
// Doppia progressione
// ===========================================================================

describe('Doppia progressione: prima le ripetizioni, poi il carico (SPEC §5.1)', () => {
  it('sotto il limite superiore propone piu ripetizioni, non piu carico', () => {
    const sets = [
      { reps: 6, kg: 60, rir: 2 },
      { reps: 6, kg: 60, rir: 2 },
      { reps: 6, kg: 60, rir: 2 },
    ];
    const history = [
      buildHistoryEntry({
        performedDate: '2026-10-29',
        exposures: [{ exerciseId: 'legPress', equipmentInstanceId: LEG_PRESS_A.id, sets }],
      }),
      buildHistoryEntry({
        performedDate: '2026-10-26',
        exposures: [{ exerciseId: 'legPress', equipmentInstanceId: LEG_PRESS_A.id, sets }],
      }),
    ];
    const result = evaluate(buildContext({ history }));
    expect(loadIncreases(result.proposals)).toEqual([]);
    const reps = result.proposals.find((p) => p.change.kind === 'increaseReps');
    expect(reps).toBeDefined();
    if (reps?.change.kind === 'increaseReps') {
      expect(reps.change.fromReps).toBe(6);
      expect(reps.change.toReps).toBe(7);
    }
  });

  it('per gli esercizi a tempo propone prima piu secondi entro l intervallo', () => {
    const sets = [
      { seconds: 18, kg: null, rir: null },
      { seconds: 18, kg: null, rir: null },
    ];
    const history = [
      buildHistoryEntry({
        performedDate: '2026-10-29',
        slot: 'B',
        exposures: [{ exerciseId: 'sideplankKneesDown', sets }],
      }),
    ];
    const result = evaluate(buildContext({ history }));
    const duration = result.proposals.find((p) => p.change.kind === 'increaseDuration');
    expect(duration).toBeDefined();
    if (duration?.change.kind === 'increaseDuration') {
      expect(duration.change.fromSeconds).toBe(18);
      expect(duration.change.toSeconds).toBe(19);
    }
  });

  it('non propone un carico quando l esercizio non ne ha', () => {
    const sets = [
      { seconds: 25, kg: null, rir: null },
      { seconds: 25, kg: null, rir: null },
    ];
    const history = [
      buildHistoryEntry({
        performedDate: '2026-10-29',
        slot: 'B',
        exposures: [{ exerciseId: 'sideplankKneesDown', sets }],
      }),
      buildHistoryEntry({
        performedDate: '2026-10-26',
        slot: 'B',
        exposures: [{ exerciseId: 'sideplankKneesDown', sets }],
      }),
    ];
    expect(loadIncreases(evaluate(buildContext({ history })).proposals)).toEqual([]);
  });

  it('non supera il limite superiore dell intervallo prescritto', () => {
    const sets = [
      { reps: 7, kg: 60, rir: 2 },
      { reps: 7, kg: 60, rir: 2 },
      { reps: 7, kg: 60, rir: 2 },
    ];
    const history = [
      buildHistoryEntry({
        performedDate: '2026-10-29',
        exposures: [{ exerciseId: 'legPress', equipmentInstanceId: LEG_PRESS_A.id, sets }],
      }),
    ];
    const result = evaluate(buildContext({ history }));
    const reps = result.proposals.find((p) => p.change.kind === 'increaseReps');
    if (reps?.change.kind === 'increaseReps') {
      expect(reps.change.toReps).toBe(8); // il massimo dell'intervallo 6-8
    }
  });
});

// ===========================================================================
// Inferenze vietate
// ===========================================================================

describe('Inferenze vietate (SPEC §5.2)', () => {
  it('un solo risultato negativo non diventa un plateau', () => {
    const good = [
      { reps: 8, kg: 60, rir: 2 },
      { reps: 8, kg: 60, rir: 2 },
      { reps: 8, kg: 60, rir: 2 },
    ];
    const bad = [
      { reps: 6, kg: 60, rir: 1 },
      { reps: 5, kg: 60, rir: 0 },
      { reps: 5, kg: 60, rir: 0 },
    ];
    const history = [
      buildHistoryEntry({
        performedDate: '2026-10-29',
        exposures: [{ exerciseId: 'legPress', equipmentInstanceId: LEG_PRESS_A.id, sets: bad }],
      }),
      buildHistoryEntry({
        performedDate: '2026-10-26',
        exposures: [{ exerciseId: 'legPress', equipmentInstanceId: LEG_PRESS_A.id, sets: good }],
      }),
    ];
    const result = evaluate(buildContext({ history }));
    expect(result.proposals.filter((p) => p.title.includes('nessun progresso'))).toEqual([]);
  });

  it('lo stallo richiede tre esposizioni consecutive senza progresso', () => {
    const flat = [
      { reps: 7, kg: 60, rir: 2 },
      { reps: 7, kg: 60, rir: 2 },
      { reps: 7, kg: 60, rir: 2 },
    ];
    const history = [1, 2, 3, 4].map((i) =>
      buildHistoryEntry({
        performedDate: `2026-10-${String(30 - i * 3).padStart(2, '0')}`,
        exposures: [{ exerciseId: 'legPress', equipmentInstanceId: LEG_PRESS_A.id, sets: flat }],
      }),
    );
    const outcome = decideProgression(
      extractExposures(history),
      EXERCISE_LIBRARY.get('legPress'),
      LEG_PRESS_A,
      DEFAULT_ENGINE_CONFIG,
    );
    // Il limite superiore non e' raggiunto (7 su 6-8), quindi la doppia
    // progressione propone piu' ripetizioni prima di parlare di stallo.
    expect(outcome.kind).toBe('increaseWithinRange');
  });

  it('una seduta saltata non produce proposte di riduzione', () => {
    const history = [
      buildHistoryEntry({
        performedDate: '2026-10-26',
        exposures: [
          { exerciseId: 'legPress', equipmentInstanceId: LEG_PRESS_A.id, sets: [...PERFECT_SETS] },
        ],
      }),
    ];
    // Storico con una sola seduta e una previsione non svolta: nessuna
    // proposta interpreta l'assenza come stanchezza.
    const result = evaluate(buildContext({ history, today: '2026-10-30' }));
    expect(
      result.proposals.filter(
        (p) =>
          p.change.kind === 'reduceLoadTemporarily' ||
          p.reason.toLowerCase().includes('sovrallenamento'),
      ),
    ).toEqual([]);
  });

  it('il passare del calendario non fa avanzare la fase', () => {
    // Nessuna seduta per 25 giorni: la proposta e' RIPETERE la settimana,
    // non avanzare, e il cursore non viene toccato dal motore.
    const history = [
      buildHistoryEntry({
        performedDate: '2026-10-01',
        exposures: [
          { exerciseId: 'legPress', equipmentInstanceId: LEG_PRESS_A.id, sets: [...PERFECT_SETS] },
        ],
      }),
    ];
    const cursor = testCursor({ weekIndex: 6 });
    const result = evaluate(buildContext({ history, today: '2026-10-26', cursor }));
    const repeat = result.proposals.find((p) => p.change.kind === 'repeatWeek');
    expect(repeat).toBeDefined();
    if (repeat?.change.kind === 'repeatWeek') expect(repeat.change.weekIndex).toBe(6);
    // Il motore non modifica il cursore: restituisce solo proposte.
    expect(cursor.weekIndex).toBe(6);
  });

  it('dopo una pausa molto lunga propone il rientro, con conferma esplicita', () => {
    const history = [
      buildHistoryEntry({
        performedDate: '2026-08-01',
        exposures: [
          { exerciseId: 'legPress', equipmentInstanceId: LEG_PRESS_A.id, sets: [...PERFECT_SETS] },
        ],
      }),
    ];
    const result = evaluate(buildContext({ history, today: '2026-10-30' }));
    const reentry = result.proposals.find((p) => p.title.includes('Rientro'));
    expect(reentry).toBeDefined();
    expect(reentry?.requiresExplicitConfirmation).toBe(true);
  });
});

describe('Fastidio e interruzioni non vengono ignorati (SPEC §5.2)', () => {
  const discomfort = {
    area: 'ginocchio destro',
    intensity: 3,
    note: null,
    stoppedExercise: false,
  };

  it('un fastidio segnalato blocca l incremento anche con tutto il resto in ordine', () => {
    const history = [
      buildHistoryEntry({
        performedDate: '2026-10-29',
        exposures: [
          {
            exerciseId: 'legPress',
            equipmentInstanceId: LEG_PRESS_A.id,
            discomfort,
            sets: [...PERFECT_SETS],
          },
        ],
      }),
      buildHistoryEntry({
        performedDate: '2026-10-26',
        exposures: [
          { exerciseId: 'legPress', equipmentInstanceId: LEG_PRESS_A.id, sets: [...PERFECT_SETS] },
        ],
      }),
    ];
    expect(loadIncreases(evaluate(buildContext({ history })).proposals)).toEqual([]);
  });

  it('due sedute consecutive con fastidio producono una proposta dedicata', () => {
    const history = [
      buildHistoryEntry({
        performedDate: '2026-10-29',
        slot: 'B',
        exposures: [
          {
            exerciseId: 'dumbbellRomanianDeadlift',
            discomfort,
            sets: [
              { reps: 6, kg: 20, rir: 2 },
              { reps: 6, kg: 20, rir: 2 },
              { reps: 6, kg: 20, rir: 2 },
            ],
          },
        ],
      }),
      buildHistoryEntry({
        performedDate: '2026-10-26',
        slot: 'B',
        exposures: [
          {
            exerciseId: 'dumbbellRomanianDeadlift',
            discomfort,
            sets: [
              { reps: 6, kg: 20, rir: 2 },
              { reps: 6, kg: 20, rir: 2 },
              { reps: 6, kg: 20, rir: 2 },
            ],
          },
        ],
      }),
    ];
    const result = evaluate(buildContext({ history }));
    const proposal = result.proposals.find((p) => p.title.includes('fastidio ripetuto'));
    expect(proposal).toBeDefined();
    // Propone l'alternativa prevista dalla scheda (hip thrust), non un aumento.
    if (proposal?.change.kind === 'substituteExercise') {
      expect(proposal.change.replacementExerciseId).toBe('hipThrustMachine');
      expect(proposal.change.scope).toBe('today');
    }
    expect(proposal?.requiresExplicitConfirmation).toBe(true);
  });

  it('non diagnostica e rimanda a un professionista', () => {
    const history = [1, 2].map((i) =>
      buildHistoryEntry({
        performedDate: `2026-10-${String(30 - i * 3).padStart(2, '0')}`,
        exposures: [
          {
            exerciseId: 'legPress',
            equipmentInstanceId: LEG_PRESS_A.id,
            discomfort,
            sets: [{ reps: 6, kg: 60, rir: 2 }],
          },
        ],
      }),
    );
    const outcome = decideProgression(
      extractExposures(history),
      EXERCISE_LIBRARY.get('legPress'),
      LEG_PRESS_A,
      DEFAULT_ENGINE_CONFIG,
    );
    expect(outcome.kind).toBe('discomfort');
    if (outcome.kind === 'discomfort') {
      expect(outcome.reason).toContain('professionista');
      expect(outcome.reason).toContain('non fa diagnosi');
    }
  });
});

// ===========================================================================
// "Oggi ho meno tempo"
// ===========================================================================

describe('Meno tempo disponibile: selezione ragionata, non tagli ai recuperi (SPEC §5.4)', () => {
  const sessionA = buildSessionA(6);

  it('riduce la seduta a 40 minuti senza toccare i recuperi', () => {
    const result = shortenSession(sessionA, EXERCISE_LIBRARY, 40);
    expect(result.fits).toBe(true);
    expect(result.finalMinutes).toBeLessThanOrEqual(40);
    expect(restsAreUnchanged(sessionA, result.session)).toBe(true);
    expect(result.restsUnchanged).toBe(true);
  });

  it('conserva gli esercizi principali e rimuove quelli a priorita bassa', () => {
    const result = shortenSession(sessionA, EXERCISE_LIBRARY, 40);
    expect(result.keptExerciseIds).toContain('legPress');
    expect(result.keptExerciseIds).toContain('chestPressMachine');
    expect(result.droppedExerciseIds.length).toBeGreaterThan(0);
    // Nessun esercizio a priorita' 1 viene mai rimosso.
    for (const dropped of result.droppedExerciseIds) {
      const prescription = sessionA.exercises.find((e) => e.exerciseId === dropped);
      expect(prescription?.timePriority).toBeGreaterThan(1);
    }
  });

  it('spiega ogni passo con i minuti risparmiati', () => {
    const result = shortenSession(sessionA, EXERCISE_LIBRARY, 40);
    expect(result.steps.length).toBeGreaterThan(0);
    for (const step of result.steps) {
      expect(step.description.length).toBeGreaterThan(10);
      expect(step.minutesSaved).toBeGreaterThanOrEqual(0);
    }
    expect(result.explanation).toContain('I recuperi restano quelli prescritti');
    expect(result.explanation).toContain('non il riposo');
  });

  it('non modifica la seduta quando il tempo basta', () => {
    const result = shortenSession(sessionA, EXERCISE_LIBRARY, 120);
    expect(result.steps).toEqual([]);
    expect(result.session).toBe(sessionA);
  });

  it('con tempo assurdamente poco lo dichiara invece di comprimere i recuperi', () => {
    const result = shortenSession(sessionA, EXERCISE_LIBRARY, 5);
    expect(result.fits).toBe(false);
    expect(restsAreUnchanged(sessionA, result.session)).toBe(true);
    expect(result.explanation).toContain('Non accorcio i recuperi');
  });

  it('funziona anche sulla seduta B', () => {
    const sessionB = buildSessionB(6);
    const result = shortenSession(sessionB, EXERCISE_LIBRARY, 45);
    expect(restsAreUnchanged(sessionB, result.session)).toBe(true);
    expect(result.keptExerciseIds).toContain('dumbbellRomanianDeadlift');
  });
});

// ===========================================================================
// Determinismo e promemoria pista
// ===========================================================================

describe('Determinismo', () => {
  it('lo stesso contesto produce le stesse proposte', () => {
    const history = twoPerfectLegPressExposures(60);
    const a = evaluate(buildContext({ history }));
    const b = evaluate(buildContext({ history }));
    const strip = (proposals: readonly CoachProposal[]): unknown =>
      proposals.map(({ id, ...rest }) => ({ ...rest, id: id.length }));
    expect(strip(a.proposals)).toEqual(strip(b.proposals));
  });
});

describe('Promemoria pista (SPEC §13.4)', () => {
  it('presenta le 72 ore come criterio prudenziale, non come garanzia', () => {
    const result = evaluate(
      buildContext({
        history: twoPerfectLegPressExposures(60),
        today: '2026-10-30',
        upcomingTrackDays: ['2026-11-01'],
      }),
    );
    const reminder = result.proposals.find((p) => p.title.includes('pista'));
    expect(reminder).toBeDefined();
    expect(reminder?.reason).toContain('72 ore');
    expect(reminder?.reason).toContain('non una garanzia');
  });

  it('non mostra il promemoria quando la pista e lontana', () => {
    const result = evaluate(
      buildContext({
        history: twoPerfectLegPressExposures(60),
        today: '2026-10-30',
        upcomingTrackDays: ['2026-12-01'],
      }),
    );
    expect(result.proposals.find((p) => p.title.includes('pista'))).toBeUndefined();
  });
});

describe('Sedute troppo lunghe', () => {
  it('propone di ridurre il lavoro, non i recuperi', () => {
    const longSession = (date: string) =>
      buildHistoryEntry({
        performedDate: date,
        startedAt: 1_780_000_000_000,
        // 95 minuti contro i 70 dichiarati disponibili.
        endedAt: 1_780_000_000_000 + 95 * 60_000,
        exposures: [
          { exerciseId: 'legPress', equipmentInstanceId: LEG_PRESS_A.id, sets: [{ reps: 6, kg: 60, rir: 2 }] },
        ],
      });
    const result = evaluate(
      buildContext({
        history: [longSession('2026-10-29'), longSession('2026-10-26')],
        profile: testProfile({ availableMinutesPerSession: 70 }),
      }),
    );
    const proposal = result.proposals.find((p) => p.change.kind === 'shortenSession');
    expect(proposal).toBeDefined();
    expect(proposal?.reason).toContain('I recuperi restano quelli prescritti');
    expect(proposal?.requiresExplicitConfirmation).toBe(true);
  });
});
