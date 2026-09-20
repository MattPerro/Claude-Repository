/**
 * Regressioni: i difetti trovati dalla revisione indipendente COACH-SAFETY.
 *
 * Ogni test qui sotto FALLIVA prima della correzione. Il report completo della
 * revisione, con i controesempi originali, e' in
 * `artifacts/review-coach-safety.md` (non tracciato).
 *
 * Il valore di questo file sta nel fatto che il motore era gia' coperto da 52
 * test scritti proprio per cogliere i comportamenti vietati, e questi difetti
 * ci sono passati attraverso comunque. Sono la ragione per cui la specifica
 * (§17) chiede che l'autore di una parte non sia il suo unico revisore.
 */

import { describe, expect, it } from 'vitest';
import {
  decideProgression,
  DEFAULT_ENGINE_CONFIG,
  evaluate,
  EXERCISE_LIBRARY,
  exposureVolume,
  extractExposures,
  checkEffortMargin,
  allSetsAtRangeTop,
  prescriptionSignature,
  shortenSession,
  buildSessionA,
  buildSessionB,
  rirTarget,
  type CoachProposal,
  type Exposure,
} from '@trackstrong/core';
import { buildContext, buildHistoryEntry, LEG_PRESS_A, testCursor } from './helpers/fixtures.js';

function titles(proposals: readonly CoachProposal[]): readonly string[] {
  return proposals.map((p) => `${p.change.kind}: ${p.title}`);
}

function anyIncrease(proposals: readonly CoachProposal[]): readonly CoachProposal[] {
  return proposals.filter(
    (p) =>
      p.change.kind === 'increaseLoad' ||
      p.change.kind === 'increaseReps' ||
      p.change.kind === 'increaseDuration',
  );
}

// ===========================================================================
// B1 - il difetto piu' pericoloso trovato
// ===========================================================================

describe('B1: una ripetizione in piu e un incremento, e passa dai controlli di sicurezza', () => {
  /** Seduta chiusa con dolore acuto, tecnica ceduta e margine zero. */
  function badSession(date: string) {
    return buildHistoryEntry({
      performedDate: date,
      exposures: [
        {
          exerciseId: 'legPress',
          equipmentInstanceId: LEG_PRESS_A.id,
          technique: 'broke',
          discomfort: {
            area: 'ginocchio destro',
            intensity: 5,
            note: 'dolore acuto',
            stoppedExercise: true,
          },
          sets: [
            { reps: 6, kg: 60, rir: 0 },
            { reps: 6, kg: 60, rir: 0 },
          ],
        },
      ],
    });
  }

  it('non propone nessun aumento dopo un fastidio che ha interrotto l esercizio', () => {
    const result = evaluate(buildContext({ history: [badSession('2026-10-29')] }));
    expect(anyIncrease(result.proposals), titles(result.proposals).join(' | ')).toEqual([]);
  });

  it('non propone nessun aumento con la tecnica dichiarata ceduta', () => {
    const history = [
      buildHistoryEntry({
        performedDate: '2026-10-29',
        exposures: [
          {
            exerciseId: 'legPress',
            equipmentInstanceId: LEG_PRESS_A.id,
            technique: 'broke',
            sets: [{ reps: 6, kg: 60, rir: 3 }],
          },
        ],
      }),
    ];
    expect(anyIncrease(evaluate(buildContext({ history })).proposals)).toEqual([]);
  });

  it('spiega perche non propone niente, invece di tacere', () => {
    const result = evaluate(buildContext({ history: [badSession('2026-10-29')] }));
    const hold = result.proposals.find((p) => p.change.kind === 'hold');
    expect(hold).toBeDefined();
    expect(hold?.reason).toContain('nemmeno di una ripetizione');
    expect(hold?.reason.toLowerCase()).toContain('fastidio');
  });

  it('con il margine non dichiarato propone le ripetizioni MA lo dichiara', () => {
    // Il margine non e' un segnale di incolumita': non blocca un aumento di
    // ripetizioni dentro l'intervallo prescritto, ma va detto che manca.
    const history = [
      buildHistoryEntry({
        performedDate: '2026-10-29',
        exposures: [
          {
            exerciseId: 'legPress',
            equipmentInstanceId: LEG_PRESS_A.id,
            technique: 'controlled',
            sets: [
              { reps: 6, kg: 60, rir: null },
              { reps: 6, kg: 60, rir: null },
              { reps: 6, kg: 60, rir: null },
            ],
          },
        ],
      }),
    ];
    const result = evaluate(buildContext({ history }));
    const reps = result.proposals.find((p) => p.change.kind === 'increaseReps');
    expect(reps).toBeDefined();
    expect(reps?.missingInformation.map((m) => m.code)).toContain('noRirDeclared');
  });
});

// ===========================================================================
// B2 - prescrizione di un altro esercizio dopo una sostituzione
// ===========================================================================

describe('B2: dopo una sostituzione non si giudica con la prescrizione di un altro esercizio', () => {
  /**
   * Leg curl svolto al posto della pressa, con una fotografia che contiene
   * solo la prescrizione della pressa (6-8). Il leg curl e' prescritto 10-12:
   * 8 ripetizioni sono SOTTO il minimo, non al limite superiore.
   */
  function substituted(date: string) {
    const entry = buildHistoryEntry({
      performedDate: date,
      exposures: [
        {
          exerciseId: 'legCurl',
          equipmentInstanceId: LEG_PRESS_A.id,
          technique: 'controlled',
          sets: [
            { reps: 8, kg: 40, rir: 2 },
            { reps: 8, kg: 40, rir: 2 },
            { reps: 8, kg: 40, rir: 2 },
          ],
        },
      ],
    });
    // La fotografia contiene SOLO la pressa, in posizione 1.
    const pressOnly = buildSessionA(6).exercises.filter((e) => e.exerciseId === 'legPress');
    return {
      ...entry,
      session: {
        ...entry.session,
        snapshot: {
          ...entry.session.snapshot,
          prescription: { ...entry.session.snapshot.prescription, exercises: pressOnly },
        },
      },
      exercises: entry.exercises.map((e) => ({ ...e, substitutedForExerciseId: 'legPress' })),
    };
  }

  it("l'esposizione viene scartata invece di essere giudicata con l'intervallo sbagliato", () => {
    const exposures = extractExposures([substituted('2026-10-29')]);
    expect(exposures).toEqual([]);
  });

  it('non propone un incremento sul leg curl usando l intervallo della pressa', () => {
    const result = evaluate(
      buildContext({ history: [substituted('2026-10-29'), substituted('2026-10-26')] }),
    );
    expect(anyIncrease(result.proposals), titles(result.proposals).join(' | ')).toEqual([]);
  });
});

// ===========================================================================
// B3 - carico cancellato su una serie
// ===========================================================================

describe('B3: un carico assente su una serie non diventa un carico uniforme', () => {
  function partial(date: string) {
    return buildHistoryEntry({
      performedDate: date,
      exposures: [
        {
          exerciseId: 'legPress',
          equipmentInstanceId: LEG_PRESS_A.id,
          technique: 'controlled',
          sets: [
            { reps: 8, kg: 60, rir: 2 },
            // Carico svuotato correggendo la serie.
            { reps: 8, kg: null, rir: 2 },
            { reps: 8, kg: 60, rir: 2 },
          ],
        },
      ],
    });
  }

  it("l'esposizione risulta a carico incompleto, non a 60 kg", () => {
    const exposure = extractExposures([partial('2026-10-29')])[0];
    expect(exposure).toBeDefined();
    expect(exposure?.partialLoads).toBe(true);
    expect(exposure?.loadKg).toBeNull();
  });

  it('non propone un incremento e dichiara il dato mancante', () => {
    const result = evaluate(buildContext({ history: [partial('2026-10-29'), partial('2026-10-26')] }));
    expect(result.proposals.filter((p) => p.change.kind === 'increaseLoad')).toEqual([]);
    const hold = result.proposals.find((p) => p.change.kind === 'hold');
    expect(hold?.missingInformation.map((m) => m.code)).toContain('noLoadRecorded');
  });

  it('nessuna prova dichiara un carico che non e stato registrato', () => {
    const result = evaluate(buildContext({ history: [partial('2026-10-29'), partial('2026-10-26')] }));
    for (const proposal of result.proposals) {
      for (const evidence of proposal.evidence) {
        // Prima le prove stampavano "8 + 8 + 8 rip a 60 kg" anche quando una
        // delle tre serie non aveva carico.
        if (evidence.value.includes('60 kg')) {
          throw new Error(`Prova che afferma un carico non registrato: ${evidence.value}`);
        }
      }
    }
  });

  it('nessun volume viene calcolato su carichi parziali', () => {
    const exposure = extractExposures([partial('2026-10-29')])[0];
    expect(exposure === undefined ? null : exposureVolume(exposure)).toBeNull();
  });
});

// ===========================================================================
// B4 - cambio di schema (settimana di scarico)
// ===========================================================================

describe('B4: un cambio di schema non conferma un incremento', () => {
  /** Settimana a regime: 3 serie, margine 2-3. */
  const regime = buildHistoryEntry({
    performedDate: '2026-10-29',
    weekIndex: 6,
    exposures: [
      {
        exerciseId: 'legPress',
        equipmentInstanceId: LEG_PRESS_A.id,
        technique: 'controlled',
        sets: [
          { reps: 8, kg: 60, rir: 2 },
          { reps: 8, kg: 60, rir: 2 },
          { reps: 8, kg: 60, rir: 2 },
        ],
      },
    ],
  });

  /** Settimana di scarico: 2 serie, margine 4. Meno lavoro, per costruzione. */
  const deload = buildHistoryEntry({
    performedDate: '2026-10-26',
    weekIndex: 6,
    exposures: [
      {
        exerciseId: 'legPress',
        equipmentInstanceId: LEG_PRESS_A.id,
        technique: 'controlled',
        prescriptionOverride: { workingSets: 2, effort: rirTarget(4) },
        sets: [
          { reps: 8, kg: 60, rir: 4 },
          { reps: 8, kg: 60, rir: 4 },
        ],
      },
    ],
  });

  it('due prescrizioni diverse producono firme diverse', () => {
    const a = extractExposures([regime])[0];
    const b = extractExposures([deload])[0];
    expect(a?.prescriptionSignature).not.toBe(b?.prescriptionSignature);
  });

  it('una seduta di scarico non conta come seconda esposizione confrontabile', () => {
    const result = evaluate(buildContext({ history: [regime, deload] }));
    expect(
      result.proposals.filter((p) => p.change.kind === 'increaseLoad'),
      titles(result.proposals).join(' | '),
    ).toEqual([]);
  });

  it('lo spiega, invece di tacere', () => {
    const result = evaluate(buildContext({ history: [regime, deload] }));
    const hold = result.proposals.find((p) => p.change.kind === 'hold');
    expect(hold?.reason).toContain('prescrizioni diverse');
  });

  it('la firma include serie, intervallo, metrica, lato e sforzo', () => {
    const base = buildSessionA(6).exercises[0];
    if (base === undefined) throw new Error('prescrizione mancante');
    const signature = prescriptionSignature(base);
    expect(signature).toContain('sets:3');
    expect(signature).toContain('target:6-8');
    expect(signature).toContain('metric:reps');
    expect(signature).toContain('rir:2-3');
  });
});

// ===========================================================================
// I1 - esposizione senza serie
// ===========================================================================

describe('I1: un esposizione senza serie non soddisfa nessuna condizione', () => {
  const empty: Exposure = {
    sessionId: 's',
    date: '2026-10-29',
    exerciseId: 'legPress',
    variantId: null,
    comparabilityKey: 'k',
    equipmentInstanceId: LEG_PRESS_A.id,
    completedSets: [],
    technique: 'controlled',
    discomfort: null,
    prescription: { ...buildSessionA(6).exercises[0]!, workingSets: 0 },
    metric: 'reps',
    target: { min: 6, max: 8 },
    perSide: false,
    loadKg: 60,
    mixedLoads: false,
    partialLoads: false,
    loadNotApplicable: false,
    weekIndex: 6,
    blockId: 'b',
    prescriptionSignature: 'x',
    startedAt: null,
  };

  it('il limite superiore non risulta raggiunto con zero serie', () => {
    // `[].every()` vale `true`: senza una guardia esplicita la condizione
    // passava, con il messaggio "tutte le 0 serie hanno raggiunto...".
    expect(allSetsAtRangeTop(empty)).toBe(false);
  });

  it('il margine non risulta coerente con zero serie', () => {
    // `Math.min(...[])` vale `Infinity`.
    const result = checkEffortMargin(empty, rirTarget(2, 3), DEFAULT_ENGINE_CONFIG);
    expect(result.satisfied).toBe(false);
    expect(result.explanation).not.toContain('Infinity');
  });

  it('non produce un incremento', () => {
    const outcome = decideProgression(
      [empty, empty],
      EXERCISE_LIBRARY.get('legPress'),
      LEG_PRESS_A,
      DEFAULT_ENGINE_CONFIG,
    );
    expect(outcome.kind).not.toBe('increaseLoad');
  });
});

// ===========================================================================
// I2 - proposta di ripetizioni sotto il minimo prescritto
// ===========================================================================

describe('I2: la proposta di ripetizioni resta dentro l intervallo prescritto', () => {
  it('non propone 6 ripetizioni su un esercizio prescritto 10-12', () => {
    const history = [
      buildHistoryEntry({
        performedDate: '2026-10-29',
        exposures: [
          {
            exerciseId: 'legCurl',
            equipmentInstanceId: LEG_PRESS_A.id,
            technique: 'controlled',
            sets: [
              { reps: 12, kg: 40, rir: 2 },
              { reps: 5, kg: 40, rir: 2 },
              { reps: 12, kg: 40, rir: 2 },
            ],
          },
        ],
      }),
    ];
    const result = evaluate(buildContext({ history }));
    for (const proposal of result.proposals) {
      if (proposal.change.kind === 'increaseReps') {
        expect(proposal.change.toReps).toBeGreaterThanOrEqual(10);
        expect(proposal.change.toReps).toBeLessThanOrEqual(12);
      }
    }
  });

  it('con una dispersione ampia fra le serie lo segnala invece di proporre un piu uno', () => {
    const history = [
      buildHistoryEntry({
        performedDate: '2026-10-29',
        exposures: [
          {
            exerciseId: 'legCurl',
            equipmentInstanceId: LEG_PRESS_A.id,
            technique: 'controlled',
            sets: [
              { reps: 12, kg: 40, rir: 2 },
              { reps: 5, kg: 40, rir: 2 },
              { reps: 12, kg: 40, rir: 2 },
            ],
          },
        ],
      }),
    ];
    const result = evaluate(buildContext({ history }));
    const hold = result.proposals.find((p) => p.change.kind === 'hold');
    expect(hold?.reason).toContain('molto diverse fra loro');
  });
});

// ===========================================================================
// I3 - progresso reale letto come stallo
// ===========================================================================

describe('I3: un dato non confrontabile non e un assenza di progresso', () => {
  it('un carico che sale non viene letto come stallo', () => {
    // Quattro sedute con l'ultima serie piu' pesante: `loadKg` e' null
    // (carichi diversi fra le serie), ma il carico complessivo sale.
    const history = [
      ['2026-10-29', 75, 80],
      ['2026-10-26', 70, 75],
      ['2026-10-22', 65, 70],
      ['2026-10-19', 60, 65],
    ].map(([date, a, b]) =>
      buildHistoryEntry({
        performedDate: String(date),
        exposures: [
          {
            exerciseId: 'legPress',
            equipmentInstanceId: LEG_PRESS_A.id,
            technique: 'controlled',
            sets: [
              { reps: 8, kg: Number(a), rir: 2 },
              { reps: 8, kg: Number(a), rir: 2 },
              { reps: 8, kg: Number(b), rir: 2 },
            ],
          },
        ],
      }),
    );
    const result = evaluate(buildContext({ history }));
    const stalled = result.proposals.filter((p) => p.title.includes('nessun progresso'));
    expect(stalled, titles(result.proposals).join(' | ')).toEqual([]);
  });
});

// ===========================================================================
// I4 - "riduci temporaneamente" che non riduce niente
// ===========================================================================

describe('I4: la riduzione temporanea riduce davvero, e non inventa carichi', () => {
  const discomfort = { area: 'ginocchio', intensity: 3, note: null, stoppedExercise: false };

  it('su un esercizio con carico propone un gradino reale piu basso', () => {
    const history = [1, 2].map((i) =>
      buildHistoryEntry({
        performedDate: `2026-10-${String(30 - i * 3).padStart(2, '0')}`,
        exposures: [
          {
            exerciseId: 'legPress',
            equipmentInstanceId: LEG_PRESS_A.id,
            discomfort,
            technique: 'controlled',
            sets: [{ reps: 6, kg: 60, rir: 2 }],
          },
        ],
      }),
    );
    const result = evaluate(buildContext({ history }));
    const proposal = result.proposals.find((p) => p.change.kind === 'reduceLoadTemporarily');
    if (proposal?.change.kind === 'reduceLoadTemporarily') {
      expect(proposal.change.toKg).toBeLessThan(proposal.change.fromKg);
      // 60 - 5 kg, il gradino configurato su questa pressa.
      expect(proposal.change.toKg).toBe(55);
    }
  });

  it('su un esercizio a tempo non propone nessun carico', () => {
    const history = [1, 2].map((i) =>
      buildHistoryEntry({
        performedDate: `2026-10-${String(30 - i * 3).padStart(2, '0')}`,
        slot: 'B' as const,
        exposures: [
          {
            exerciseId: 'sideplankKneesDown',
            discomfort,
            technique: 'controlled',
            sets: [{ seconds: 20, kg: null, rir: null }],
          },
        ],
      }),
    );
    const result = evaluate(buildContext({ history }));
    for (const proposal of result.proposals) {
      // Nessuna proposta di carico su un esercizio che non ha carico: prima
      // proponeva `fromKg: 0, toKg: 0`.
      expect(proposal.change.kind).not.toBe('reduceLoadTemporarily');
      expect(proposal.change.kind).not.toBe('increaseLoad');
    }
    const volume = result.proposals.find((p) => p.change.kind === 'changeVolume');
    expect(volume?.reason).toContain("non c'e' un carico da ridurre");
  });
});

// ===========================================================================
// I5 - "ho meno tempo" sulla seduta sbagliata
// ===========================================================================

describe('I5: la proposta di accorciare riguarda la seduta che sta per iniziare', () => {
  function longSession(date: string, slot: 'A' | 'B') {
    return buildHistoryEntry({
      performedDate: date,
      slot,
      startedAt: 1_780_000_000_000,
      endedAt: 1_780_000_000_000 + 95 * 60_000,
      exposures: [
        {
          exerciseId: slot === 'A' ? 'legPress' : 'dumbbellRomanianDeadlift',
          equipmentInstanceId: slot === 'A' ? LEG_PRESS_A.id : null,
          technique: 'controlled',
          sets: [{ reps: 6, kg: 60, rir: 2 }],
        },
      ],
    });
  }

  it('con la seduta B in arrivo elenca gli esercizi della B', () => {
    const result = evaluate(
      buildContext({
        history: [longSession('2026-10-29', 'A'), longSession('2026-10-26', 'A')],
        // La A e' gia' stata completata: il prossimo slot e' B.
        cursor: testCursor({ completedSlots: ['A'] }),
      }),
    );
    const proposal = result.proposals.find((p) => p.change.kind === 'shortenSession');
    expect(proposal).toBeDefined();
    expect(proposal?.targetSlot).toBe('B');
    if (proposal?.change.kind === 'shortenSession') {
      const sessionB = buildSessionB(6).exercises.map((e) => e.exerciseId);
      const all = [...proposal.change.keepExerciseIds, ...proposal.change.dropExerciseIds];
      for (const id of all) {
        expect(sessionB, `${id} non appartiene alla seduta B`).toContain(id);
      }
    }
  });

  it('i minuti risparmiati sono reali, non vuoti', () => {
    const result = evaluate(
      buildContext({
        history: [longSession('2026-10-29', 'A'), longSession('2026-10-26', 'A')],
        cursor: testCursor({ completedSlots: ['A'] }),
      }),
    );
    const proposal = result.proposals.find((p) => p.change.kind === 'shortenSession');
    const durations = proposal?.evidence.find((e) => e.label === 'Durata stimata');
    expect(durations?.value).toMatch(/\d+ min -> \d+ min/);
  });
});

// ===========================================================================
// Minori con conseguenze visibili
// ===========================================================================

describe('M2: l esito non dipende dall ordine dell array di storico', () => {
  const good = buildHistoryEntry({
    performedDate: '2026-10-29',
    startedAt: 1_780_000_100_000,
    exposures: [
      {
        exerciseId: 'legPress',
        equipmentInstanceId: LEG_PRESS_A.id,
        technique: 'controlled',
        sets: [
          { reps: 8, kg: 60, rir: 2 },
          { reps: 8, kg: 60, rir: 2 },
          { reps: 8, kg: 60, rir: 2 },
        ],
      },
    ],
  });
  const bad = buildHistoryEntry({
    performedDate: '2026-10-29',
    startedAt: 1_780_000_900_000, // piu' recente, stesso giorno
    exposures: [
      {
        exerciseId: 'legPress',
        equipmentInstanceId: LEG_PRESS_A.id,
        technique: 'broke',
        sets: [{ reps: 4, kg: 60, rir: 0 }],
      },
    ],
  });

  it('due sedute nello stesso giorno si ordinano per istante di avvio', () => {
    const a = extractExposures([good, bad]);
    const b = extractExposures([bad, good]);
    expect(a.map((e) => e.sessionId)).toEqual(b.map((e) => e.sessionId));
    // La piu' recente e' quella avviata dopo.
    expect(a[0]?.sessionId).toBe(bad.session.id);
  });
});

describe('M4: il volume per manubrio non raddoppia negli esercizi per lato', () => {
  it('conta un manubrio per volta quando si lavora un lato alla volta', () => {
    const history = [
      buildHistoryEntry({
        performedDate: '2026-10-29',
        slot: 'B',
        exposures: [
          {
            exerciseId: 'stepUp',
            technique: 'controlled',
            sets: [
              { reps: 8, kg: 10, rir: 2, side: 'left' },
              { reps: 8, kg: 10, rir: 2, side: 'right' },
            ],
          },
        ],
      }),
    ];
    const exposure = extractExposures(history)[0];
    const volume = exposure === undefined ? null : exposureVolume(exposure);
    // Lo step-up usa `bodyweightPlus`: solo il sovraccarico, 10 x 8 x 2 serie.
    expect(volume?.convention).toContain('peso corporeo escluso');
    expect(volume?.kg).toBe(160);
  });
});

describe('M6: minuti disponibili non validi vengono rifiutati, non mostrati', () => {
  const session = buildSessionA(6);

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 0, -5])('rifiuta %s', (minutes) => {
    expect(() => shortenSession(session, EXERCISE_LIBRARY, minutes)).toThrow(/non validi/);
  });

  it('nessun messaggio mostrato contiene NaN o Infinity', () => {
    const result = shortenSession(session, EXERCISE_LIBRARY, 40);
    expect(result.explanation).not.toMatch(/NaN|Infinity/);
  });
});

describe('M5: non si chiede di colmare un informazione che non puo esistere', () => {
  it('un esercizio senza carico non riporta noLoadRecorded fra i dati mancanti', () => {
    const sets = [
      { seconds: 25, kg: null, rir: null },
      { seconds: 25, kg: null, rir: null },
    ];
    const history = [1, 2].map((i) =>
      buildHistoryEntry({
        performedDate: `2026-10-${String(30 - i * 3).padStart(2, '0')}`,
        slot: 'B' as const,
        exposures: [{ exerciseId: 'sideplankKneesDown', technique: 'controlled', sets }],
      }),
    );
    const result = evaluate(buildContext({ history }));
    for (const proposal of result.proposals) {
      expect(proposal.missingInformation.map((m) => m.code)).not.toContain('noLoadRecorded');
    }
  });
});

describe('M10: la configurazione non contiene piu un interruttore che non fa niente', () => {
  it('non esiste un campo allowIncreaseWithMissingData', () => {
    // Era presentato come "interruttore che rende il vincolo ispezionabile",
    // ma nessuna riga del motore lo leggeva: una dichiarazione di intenti
    // travestita da configurazione. Il vincolo vero sta nei test sui singoli
    // dati mancanti in `engine.test.ts`.
    expect(Object.keys(DEFAULT_ENGINE_CONFIG)).not.toContain('allowIncreaseWithMissingData');
  });
});
