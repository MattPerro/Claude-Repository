/**
 * Verifica che la scheda inserita nell'app corrisponda ESATTAMENTE a quella
 * fornita dall'utente (`SPEC.md` §3).
 *
 * Questi test sono scritti come una lista di controllo voce per voce, non come
 * un confronto con un'istantanea: un'istantanea passerebbe anche se il
 * programma fosse sbagliato, purche' sbagliato in modo stabile.
 */

import { describe, expect, it } from 'vitest';
import {
  buildSessionA,
  buildSessionB,
  buildWeekSessions,
  CARDIO_INTERVALS_FROM_WEEK_7,
  EXERCISE_LIBRARY,
  formatRange,
  INITIAL_SCHEDULE_WEEKS,
  INTERVALS_AVAILABLE_FROM_WEEK,
  phaseForWeek,
  SCHEDULE_EXERCISE_IDS as E,
  WARMUP,
  withHipThrustAlternative,
  type ExercisePrescription,
  type SessionPrescription,
} from '@trackstrong/core';

/** Estrae la riga della tabella per un esercizio, per confronti leggibili. */
function row(session: SessionPrescription, order: number): ExercisePrescription {
  const ex = session.exercises.find((e) => e.order === order);
  if (ex === undefined) throw new Error(`Nessun esercizio in posizione ${String(order)}`);
  return ex;
}

/** Descrizione compatta "3x6-8 / rec 120 s" per i confronti. */
function describeRow(ex: ExercisePrescription): string {
  const unit = ex.metric === 'seconds' ? 's' : '';
  const side = ex.perSide ? ' per lato' : '';
  const restText =
    ex.rest.minSeconds === ex.rest.maxSeconds
      ? `${String(ex.rest.maxSeconds)} s`
      : `${String(ex.rest.minSeconds)}-${String(ex.rest.maxSeconds)} s`;
  return `${String(ex.workingSets)}x${formatRange(ex.target)}${unit}${side} / rec ${restText}`;
}

describe('Riscaldamento (SPEC §3.1)', () => {
  it('contiene le sei voci previste, nell ordine', () => {
    expect(WARMUP).toHaveLength(6);
    expect(WARMUP.map((w) => w.order)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(WARMUP[0]?.label).toContain('5 minuti di cyclette');
    expect(WARMUP[1]?.label).toContain('6-8 alzate');
    expect(WARMUP[2]?.label).toContain("flessioni dell'anca");
    expect(WARMUP[3]?.label).toContain('spalle e caviglie');
    expect(WARMUP[4]?.label).toContain('Due serie leggere');
    expect(WARMUP[5]?.label).toContain('Una serie leggera');
  });

  it('aggancia due serie leggere al primo esercizio e una al secondo', () => {
    expect(WARMUP[4]?.warmupSetsOnExerciseOrder).toBe(1);
    expect(WARMUP[4]?.warmupSetCount).toBe(2);
    expect(WARMUP[5]?.warmupSetsOnExerciseOrder).toBe(2);
    expect(WARMUP[5]?.warmupSetCount).toBe(1);
  });

  it('e identico nelle sedute A e B di tutte le settimane', () => {
    for (let week = 1; week <= INITIAL_SCHEDULE_WEEKS; week += 1) {
      expect(buildSessionA(week).warmup).toBe(WARMUP);
      expect(buildSessionB(week).warmup).toBe(WARMUP);
    }
  });
});

describe('Allenamento A, settimane 5-12 (SPEC §3.2)', () => {
  const session = buildSessionA(5);

  it('ha i sette elementi nell ordine previsto', () => {
    expect(session.exercises.map((e) => e.exerciseId)).toEqual([
      E.legPress,
      E.chestPressMachine,
      E.seatedCableRow,
      E.legCurl,
      E.pallofPress,
      E.farmerCarry,
    ]);
    // Il settimo elemento della tabella e' la cyclette, modellata come cardio.
    expect(session.cardio.length).toBeGreaterThanOrEqual(1);
  });

  it('riproduce la tabella riga per riga', () => {
    expect(describeRow(row(session, 1))).toBe('3x6-8 / rec 120 s'); // Pressa
    expect(describeRow(row(session, 2))).toBe('3x6-8 / rec 120 s'); // Chest press
    expect(describeRow(row(session, 3))).toBe('3x8-10 / rec 90 s'); // Rematore
    expect(describeRow(row(session, 4))).toBe('2x10-12 / rec 60-90 s'); // Leg curl
    expect(describeRow(row(session, 5))).toBe('2x8-10 per lato / rec 45-60 s'); // Pallof
    expect(describeRow(row(session, 6))).toBe('2x20-30s / rec 60 s'); // Farmer carry
  });

  it('usa il margine 2-3 ripetizioni previsto dalla fase', () => {
    for (const order of [1, 2, 3, 4, 5]) {
      const effort = row(session, order).effort;
      expect(effort.kind).toBe('rir');
      if (effort.kind === 'rir') {
        expect(effort.rir).toEqual({ min: 2, max: 3 });
      }
    }
  });

  it('non impone un RIR al farmer carry, che e a tempo', () => {
    expect(row(session, 6).effort.kind).toBe('durationControl');
  });

  it('usa il peso per manubrio sul farmer carry, non il totale', () => {
    expect(row(session, 6).loadConvention).toBe('perDumbbell');
  });
});

describe('Allenamento B, settimane 5-12 (SPEC §3.3)', () => {
  const session = buildSessionB(5);

  it('ha i sei esercizi nell ordine previsto', () => {
    expect(session.exercises.map((e) => e.exerciseId)).toEqual([
      E.dumbbellRomanianDeadlift,
      E.latPulldownFront,
      E.stepUp,
      E.inclineDumbbellPress,
      E.adductorMachine,
      E.sideplankKneesDown,
    ]);
  });

  it('riproduce la tabella riga per riga', () => {
    expect(describeRow(row(session, 1))).toBe('3x6-8 / rec 120 s'); // Stacco rumeno
    expect(describeRow(row(session, 2))).toBe('3x8-10 / rec 90 s'); // Lat machine
    expect(describeRow(row(session, 3))).toBe('2x8 per lato / rec 90 s'); // Step-up
    expect(describeRow(row(session, 4))).toBe('2x8-10 / rec 90 s'); // Spinte inclinate
    expect(describeRow(row(session, 5))).toBe('2x12-15 / rec 60 s'); // Adduttori
    expect(describeRow(row(session, 6))).toBe('2x15-25s per lato / rec 45-60 s'); // Plank
  });

  it('recupera lo step-up dopo entrambe le gambe, non dopo ogni gamba', () => {
    expect(EXERCISE_LIBRARY.get(E.stepUp).restAfterBothSides).toBe(true);
  });

  it('usa il peso per manubrio su stacco rumeno e spinte inclinate', () => {
    expect(row(session, 1).loadConvention).toBe('perDumbbell');
    expect(row(session, 4).loadConvention).toBe('perDumbbell');
  });

  it('non impone un RIR al plank laterale, che e a tempo', () => {
    expect(row(session, 6).effort.kind).toBe('durationControl');
  });
});

describe('Settimane 1-2 (SPEC §3.6)', () => {
  for (const week of [1, 2]) {
    describe(`settimana ${String(week)}`, () => {
      const a = buildSessionA(week);
      const b = buildSessionB(week);

      it('fa due serie dei primi quattro esercizi e una del quinto e del sesto', () => {
        expect([1, 2, 3, 4].map((o) => row(a, o).workingSets)).toEqual([2, 2, 2, 2]);
        expect([5, 6].map((o) => row(a, o).workingSets)).toEqual([1, 1]);
        expect([1, 2, 3, 4].map((o) => row(b, o).workingSets)).toEqual([2, 2, 2, 2]);
        expect([5, 6].map((o) => row(b, o).workingSets)).toEqual([1, 1]);
      });

      it('usa circa 4 ripetizioni in riserva', () => {
        const effort = row(a, 1).effort;
        expect(effort.kind).toBe('rir');
        if (effort.kind === 'rir') expect(effort.rir).toEqual({ min: 4, max: 4 });
      });

      it('porta pressa, chest press e stacco rumeno a 8-10 ripetizioni', () => {
        expect(formatRange(row(a, 1).target)).toBe('8-10');
        expect(formatRange(row(a, 2).target)).toBe('8-10');
        expect(formatRange(row(b, 1).target)).toBe('8-10');
      });

      it('tiene rematore, lat machine e spinte inclinate a 8-10', () => {
        expect(formatRange(row(a, 3).target)).toBe('8-10');
        expect(formatRange(row(b, 2).target)).toBe('8-10');
        expect(formatRange(row(b, 4).target)).toBe('8-10');
      });

      it('mette lo step-up a 6-8 per gamba, senza manubri', () => {
        const stepUp = row(b, 3);
        expect(formatRange(stepUp.target)).toBe('6-8');
        expect(stepUp.perSide).toBe(true);
        expect(stepUp.note).toContain('SENZA manubri');
      });

      it('tiene leg curl a 10-12 e adduttori a 12-15', () => {
        expect(formatRange(row(a, 4).target)).toBe('10-12');
        expect(formatRange(row(b, 5).target)).toBe('12-15');
      });

      it('conserva gli intervalli di pallof, farmer carry e plank', () => {
        expect(formatRange(row(a, 5).target)).toBe('8-10');
        expect(formatRange(row(a, 6).target)).toBe('20-30');
        expect(formatRange(row(b, 6).target)).toBe('15-25');
      });

      it('chiude con 8-10 minuti di cyclette facile', () => {
        const cardio = a.cardio[0];
        expect(cardio?.kind).toBe('steady');
        if (cardio?.kind === 'steady') {
          expect(cardio.minutes).toEqual({ min: 8, max: 10 });
          expect(cardio.intensityCue).toBe('facili');
        }
      });

      it('non propone l alternativa a intervalli', () => {
        expect(b.cardio.some((c) => c.kind === 'intervals')).toBe(false);
      });
    });
  }
});

describe('Settimane 3-4 (SPEC §3.7)', () => {
  for (const week of [3, 4]) {
    describe(`settimana ${String(week)}`, () => {
      const a = buildSessionA(week);
      const b = buildSessionB(week);

      it('fa due serie per tutti e sei gli esercizi', () => {
        expect(a.exercises.map((e) => e.workingSets)).toEqual([2, 2, 2, 2, 2, 2]);
        expect(b.exercises.map((e) => e.workingSets)).toEqual([2, 2, 2, 2, 2, 2]);
      });

      it('mantiene gli intervalli della fase di rientro', () => {
        expect(formatRange(row(a, 1).target)).toBe('8-10');
        expect(formatRange(row(a, 2).target)).toBe('8-10');
        expect(formatRange(row(b, 1).target)).toBe('8-10');
      });

      it('porta lo step-up a 8 per gamba', () => {
        expect(formatRange(row(b, 3).target)).toBe('8');
      });

      it('usa circa 3 ripetizioni in riserva', () => {
        const effort = row(a, 1).effort;
        if (effort.kind === 'rir') expect(effort.rir).toEqual({ min: 3, max: 3 });
      });

      it('porta la cyclette a 12-15 minuti, gradualmente', () => {
        const cardio = a.cardio[0];
        if (cardio?.kind === 'steady') {
          expect(cardio.minutes).toEqual({ min: 12, max: 15 });
          expect(cardio.note).toContain('gradualmente');
        }
      });
    });
  }
});

describe('Settimane 5-12 (SPEC §3.8)', () => {
  it('usa le tabelle complete in tutte le settimane da 5 a 12', () => {
    for (let week = 5; week <= 12; week += 1) {
      expect(buildSessionA(week).exercises.map((e) => e.workingSets)).toEqual([3, 3, 3, 2, 2, 2]);
      expect(buildSessionB(week).exercises.map((e) => e.workingSets)).toEqual([3, 3, 2, 2, 2, 2]);
    }
  });

  it('chiude con 12-15 minuti di cyclette', () => {
    const cardio = buildSessionA(6).cardio[0];
    if (cardio?.kind === 'steady') expect(cardio.minutes).toEqual({ min: 12, max: 15 });
  });
});

describe('Alternativa cardio a intervalli dalla settimana 7 (SPEC §3.9)', () => {
  it('non esiste prima della settimana 7', () => {
    for (let week = 1; week <= 6; week += 1) {
      expect(buildSessionB(week).cardio.some((c) => c.kind === 'intervals')).toBe(false);
    }
  });

  it('esiste dalla settimana 7 in poi, nella sola seduta B', () => {
    for (let week = INTERVALS_AVAILABLE_FROM_WEEK; week <= 12; week += 1) {
      expect(buildSessionB(week).cardio.some((c) => c.kind === 'intervals')).toBe(true);
      expect(buildSessionA(week).cardio.some((c) => c.kind === 'intervals')).toBe(false);
    }
  });

  it('e facoltativa: non si attiva da sola', () => {
    const intervals = CARDIO_INTERVALS_FROM_WEEK_7;
    expect(intervals.kind).toBe('intervals');
    if (intervals.kind === 'intervals') {
      expect(intervals.optIn).toBe(true);
    }
  });

  it('ha la struttura 3 minuti + 6 x (30 s + 60 s) + 3 minuti, totale 15 minuti', () => {
    const intervals = CARDIO_INTERVALS_FROM_WEEK_7;
    if (intervals.kind !== 'intervals') throw new Error('atteso intervals');
    expect(intervals.warmupMinutes).toBe(3);
    expect(intervals.rounds).toBe(6);
    expect(intervals.hardSeconds).toBe(30);
    expect(intervals.easySeconds).toBe(60);
    expect(intervals.cooldownMinutes).toBe(3);
    const totalMinutes =
      intervals.warmupMinutes +
      (intervals.rounds * (intervals.hardSeconds + intervals.easySeconds)) / 60 +
      intervals.cooldownMinutes;
    expect(totalMinutes).toBe(15);
  });

  it('dichiara che i tratti sostenuti non sono sprint massimali', () => {
    expect(CARDIO_INTERVALS_FROM_WEEK_7.note).toContain('NON sono sprint massimali');
  });
});

describe('Alternativa hip thrust (SPEC §3.4)', () => {
  it('sostituisce lo stacco rumeno mantenendo la posizione', () => {
    const b = withHipThrustAlternative(buildSessionB(6), 6);
    expect(row(b, 1).exerciseId).toBe(E.hipThrustMachine);
    expect(b.exercises.some((e) => e.exerciseId === E.dumbbellRomanianDeadlift)).toBe(false);
  });

  it('usa 2 x 8-10 nelle prime quattro settimane', () => {
    for (const week of [1, 2, 3, 4]) {
      const b = withHipThrustAlternative(buildSessionB(week), week);
      expect(describeRow(row(b, 1))).toBe('2x8-10 / rec 120 s');
    }
  });

  it('usa 3 x 8-10 a regime', () => {
    for (const week of [5, 8, 12]) {
      const b = withHipThrustAlternative(buildSessionB(week), week);
      expect(describeRow(row(b, 1))).toBe('3x8-10 / rec 120 s');
    }
  });

  it('mantiene storici distinti dallo stacco rumeno', () => {
    // La convenzione di carico cambia (macchina invece di manubri), quindi le
    // due prestazioni non possono finire nella stessa serie di dati.
    const rdl = row(buildSessionB(6), 1);
    const hip = row(withHipThrustAlternative(buildSessionB(6), 6), 1);
    expect(rdl.exerciseId).not.toBe(hip.exerciseId);
    expect(rdl.loadConvention).not.toBe(hip.loadConvention);
  });

  it('rimanda la valutazione a un istruttore', () => {
    const hip = row(withHipThrustAlternative(buildSessionB(6), 6), 1);
    expect(hip.note).toContain('istruttore');
  });

  it('non si applica alla seduta A', () => {
    expect(() => withHipThrustAlternative(buildSessionA(6), 6)).toThrow();
  });
});

describe('Recuperi espressi come intervallo (SPEC §3.5)', () => {
  it('conserva il range e parte dal limite superiore', () => {
    const legCurl = row(buildSessionA(5), 4);
    expect(legCurl.rest).toEqual({ minSeconds: 60, maxSeconds: 90 });
    // `defaultRestSeconds` usa il massimo: verificato in duration.test.ts.
  });
});

describe('Fasi', () => {
  it('assegna le settimane alle tre fasi previste', () => {
    expect([1, 2].map(phaseForWeek)).toEqual(['weeks1to2', 'weeks1to2']);
    expect([3, 4].map(phaseForWeek)).toEqual(['weeks3to4', 'weeks3to4']);
    expect([5, 8, 12].map(phaseForWeek)).toEqual(['weeks5to12', 'weeks5to12', 'weeks5to12']);
  });

  it('produce due sedute per settimana, A e poi B', () => {
    for (let week = 1; week <= 12; week += 1) {
      expect(buildWeekSessions(week).map((s) => s.slot)).toEqual(['A', 'B']);
    }
  });
});

describe('Coerenza con la libreria degli esercizi', () => {
  it('tutti gli esercizi della scheda esistono in libreria', () => {
    for (let week = 1; week <= 12; week += 1) {
      for (const session of buildWeekSessions(week)) {
        for (const ex of session.exercises) {
          expect(EXERCISE_LIBRARY.has(ex.exerciseId)).toBe(true);
        }
      }
    }
    expect(EXERCISE_LIBRARY.has(E.hipThrustMachine)).toBe(true);
  });

  it('le convenzioni di carico della scheda coincidono con quelle della libreria', () => {
    // Unica eccezione ammessa e documentata: lo step-up usa `bodyweightPlus`
    // anche nelle settimane senza manubri (assunzione A3 in twelveWeeks.ts).
    for (const session of buildWeekSessions(6)) {
      for (const ex of session.exercises) {
        expect(ex.loadConvention).toBe(EXERCISE_LIBRARY.get(ex.exerciseId).loadConvention);
      }
    }
  });

  it('le metriche della scheda coincidono con quelle della libreria', () => {
    for (const session of buildWeekSessions(6)) {
      for (const ex of session.exercises) {
        expect(ex.metric).toBe(EXERCISE_LIBRARY.get(ex.exerciseId).metric);
      }
    }
  });

  it('gli esercizi per lato coincidono con quelli della libreria', () => {
    for (const session of buildWeekSessions(6)) {
      for (const ex of session.exercises) {
        expect(ex.perSide).toBe(EXERCISE_LIBRARY.get(ex.exerciseId).perSide);
      }
    }
  });
});
