/**
 * Verifica della programmazione triennale (`SPEC.md` §4).
 *
 * I controlli sono pensati per fallire proprio sui difetti che la specifica
 * vieta: anni vuoti, settimane copiate identiche per tre anni, sedute che
 * sforano il tempo disponibile, intensita' che sale perche' cambia l'anno,
 * carichi in kg predetti per il futuro, test massimali.
 */

import { describe, expect, it } from 'vitest';
import {
  addDays,
  addYears,
  compareDates,
  allWeeks,
  blockAtWeek,
  buildThreeYearPlan,
  DEFAULT_DURATION_MODEL,
  estimateSession,
  EXERCISE_LIBRARY,
  planningHorizon,
  programWeekStart,
  resolveBlockWeeks,
  SCHEMES,
  totalPlannedSessions,
  totalWeeks,
  weekAt,
  type ProgramPlan,
} from '@trackstrong/core';

/** Date di avvio scelte per esercitare i casi di calendario difficili. */
const START_DATES = [
  '2026-09-21', // lunedi' normale
  '2026-01-01', // capodanno
  '2024-02-29', // 29 febbraio di un anno bisestile
  '2026-12-31', // fine anno
  '2027-03-01', // giorno dopo febbraio
  '2025-06-15', // domenica
] as const;

function plan(startDate: string): ProgramPlan {
  return buildThreeYearPlan({ id: 'test-plan', startDate });
}

describe('Orizzonte calcolato su date reali (SPEC §4)', () => {
  it('non assume che tre anni siano 156 settimane esatte', () => {
    // Su date reali tre anni sono 1095 o 1096 giorni: 156 settimane piene
    // PIU' 3 o 4 giorni di resto. Il numero di giorni varia davvero fra le
    // date di avvio, e il resto non e' mai zero: "156 settimane esatte" e'
    // falso in entrambi i casi.
    const dayCounts = new Set(START_DATES.map((d) => planningHorizon(d, 3).totalDays));
    expect([...dayCounts].sort()).toEqual([1095, 1096]);

    for (const startDate of START_DATES) {
      const h = planningHorizon(startDate, 3);
      expect(h.completeWeeks).toBe(156);
      expect(h.remainderDays).toBeGreaterThan(0);
      // Il piano arrotonda per eccesso, cosi' nessun giorno resta scoperto.
      expect(h.totalWeeks).toBe(157);
    }
  });

  it('il numero di settimane di calendario toccate dipende dal giorno di avvio', () => {
    const spans = new Set(START_DATES.map((d) => planningHorizon(d, 3).calendarWeeksSpanned));
    expect(spans.size).toBeGreaterThan(1);
  });

  it('l ultima settimana di programma copre gli ultimi giorni dell orizzonte', () => {
    for (const startDate of START_DATES) {
      const p = plan(startDate);
      const h = planningHorizon(startDate, 3);
      const lastWeekStart = programWeekStart(startDate, totalWeeks(p));
      const lastWeekEnd = addDays(lastWeekStart, 6);
      // L'ultimo giorno dell'orizzonte cade dentro l'ultima settimana di
      // programma: non resta un residuo fuori dal piano.
      expect(compareDates(lastWeekStart, h.lastDate)).toBeLessThanOrEqual(0);
      expect(compareDates(h.lastDate, lastWeekEnd)).toBeLessThanOrEqual(0);
    }
  });

  it('gestisce il 29 febbraio senza sbagliare la data finale', () => {
    // 29 febbraio 2024 + 3 anni: il 2027 non e' bisestile, quindi si arrotonda
    // al 28 febbraio, non si scivola al 1 marzo.
    expect(addYears('2024-02-29', 3)).toBe('2027-02-28');
  });

  it('copre esattamente l orizzonte, senza settimane avanzo ne mancanti', () => {
    for (const startDate of START_DATES) {
      const p = plan(startDate);
      const horizon = planningHorizon(startDate, 3);
      expect(totalWeeks(p)).toBe(horizon.totalWeeks);
      expect(p.lastDate).toBe(horizon.lastDate);
    }
  });

  it('assorbe la differenza fra 156 e 157 settimane nell ultimo blocco', () => {
    const w156 = resolveBlockWeeks(156);
    const w157 = resolveBlockWeeks(157);
    expect(w156.slice(0, -1)).toEqual(w157.slice(0, -1));
    expect(w157.at(-1)).toBe((w156.at(-1) ?? 0) + 1);
  });

  it('rifiuta un orizzonte troppo corto invece di produrre un piano incoerente', () => {
    expect(() => resolveBlockWeeks(40)).toThrow(/troppo corto/);
  });
});

describe('Struttura su quattro livelli (SPEC §4.1)', () => {
  const p = plan('2026-09-21');

  it('livello 1: tre anni, ciascuno con obiettivi reali', () => {
    expect(p.years).toHaveLength(3);
    for (const year of p.years) {
      expect(year.title.length).toBeGreaterThan(10);
      expect(year.objectives.length).toBeGreaterThanOrEqual(3);
      for (const objective of year.objectives) {
        expect(objective.length).toBeGreaterThan(20);
      }
      expect(year.blockIds.length).toBeGreaterThan(0);
    }
  });

  it('livello 1: nessun anno resta un titolo o un TODO', () => {
    for (const year of p.years) {
      const weeksInYear = p.blocks
        .filter((b) => b.yearNumber === year.number)
        .reduce((sum, b) => sum + b.weeks.length, 0);
      expect(weeksInYear).toBeGreaterThanOrEqual(50);
    }
    const allText = JSON.stringify(p);
    expect(allText).not.toMatch(/TODO|da definire|TBD|placeholder/i);
  });

  it('livello 2: ogni blocco ha tutti i campi richiesti dalla specifica', () => {
    for (const block of p.blocks) {
      expect(block.purpose.length).toBeGreaterThan(30); // finalita'
      expect(block.plannedWeeks).toBeGreaterThan(0); // durata indicativa
      expect(block.interruptionPolicy.length).toBeGreaterThan(30); // interruzioni
      expect(block.entryCriteria.length).toBeGreaterThan(0); // criteri di ingresso
      expect(block.weeks.length).toBe(block.plannedWeeks);

      for (const week of block.weeks) {
        for (const session of week.sessions) {
          expect(session.exercises.length).toBeGreaterThan(0); // esercizi
          expect(session.cardio.length).toBeGreaterThanOrEqual(0); // cardio
          for (const ex of session.exercises) {
            expect(ex.workingSets).toBeGreaterThan(0); // serie
            expect(ex.target.max).toBeGreaterThan(0); // ripetizioni
            expect(ex.effort).toBeDefined(); // RIR o equivalente
            expect(ex.rest.maxSeconds).toBeGreaterThan(0); // recuperi
          }
        }
      }
    }
  });

  it('livello 2: i blocchi di lavoro hanno criteri di revisione', () => {
    const workBlocks = p.blocks.filter((b) => b.phase === 'development');
    expect(workBlocks.length).toBeGreaterThan(0);
    for (const block of workBlocks) {
      expect(block.reviewCriteria.length).toBeGreaterThan(0);
      for (const criterion of block.reviewCriteria) {
        expect(criterion.description.length).toBeGreaterThan(20);
      }
    }
  });

  it('livello 3: due sedute A/B in ogni settimana del percorso', () => {
    for (const week of allWeeks(p)) {
      expect(week.sessions.map((s) => s.slot)).toEqual(['A', 'B']);
    }
  });

  it('livello 3: gli indici di settimana sono contigui da 1 a N', () => {
    const indices = allWeeks(p).map((w) => w.index);
    expect(indices).toEqual(Array.from({ length: indices.length }, (_, i) => i + 1));
  });

  it('il numero di sedute e coerente con il calendario', () => {
    expect(totalPlannedSessions(p)).toBe(totalWeeks(p) * 2);
  });

  it('weekAt e blockAtWeek trovano ogni settimana del percorso', () => {
    for (let i = 1; i <= totalWeeks(p); i += 1) {
      expect(weekAt(p, i)?.index).toBe(i);
      expect(blockAtWeek(p, i)).toBeDefined();
    }
    expect(weekAt(p, totalWeeks(p) + 1)).toBeUndefined();
    expect(weekAt(p, 0)).toBeUndefined();
  });
});

describe('Prime 12 settimane invariate dentro il piano triennale', () => {
  const p = plan('2026-09-21');

  it('riproduce la scheda dell utente nelle settimane 1-12', () => {
    // Settimane 1-2: due serie sui primi quattro, una sul quinto e sesto.
    expect(weekAt(p, 1)?.sessions[0]?.exercises.map((e) => e.workingSets)).toEqual([
      2, 2, 2, 2, 1, 1,
    ]);
    // Settimane 3-4: due serie su tutti.
    expect(weekAt(p, 3)?.sessions[0]?.exercises.map((e) => e.workingSets)).toEqual([
      2, 2, 2, 2, 2, 2,
    ]);
    // Settimane 5-12: tabelle complete.
    expect(weekAt(p, 5)?.sessions[0]?.exercises.map((e) => e.workingSets)).toEqual([
      3, 3, 3, 2, 2, 2,
    ]);
    expect(weekAt(p, 12)?.sessions[1]?.exercises.map((e) => e.workingSets)).toEqual([
      3, 3, 2, 2, 2, 2,
    ]);
  });

  it('colloca le prime 12 settimane nei primi due blocchi', () => {
    expect(blockAtWeek(p, 1)?.id).toBe('y1b1-rientro');
    expect(blockAtWeek(p, 4)?.id).toBe('y1b1-rientro');
    expect(blockAtWeek(p, 5)?.id).toBe('y1b2-consolidamento');
    expect(blockAtWeek(p, 12)?.id).toBe('y1b2-consolidamento');
  });
});

describe('Divieti espliciti (SPEC §4.4)', () => {
  const p = plan('2026-09-21');

  it('non copia la stessa settimana per tre anni', () => {
    // Confronta la "forma" di ogni settimana (serie, intervalli, recuperi,
    // margine). Se il piano fosse una fotocopia, ci sarebbe una sola forma.
    const shapes = new Set(
      allWeeks(p).map((w) =>
        JSON.stringify(
          w.sessions.map((s) => ({
            sets: s.exercises.map((e) => e.workingSets),
            reps: s.exercises.map((e) => [e.target.min, e.target.max]),
            rest: s.exercises.map((e) => [e.rest.minSeconds, e.rest.maxSeconds]),
            effort: s.exercises.map((e) =>
              e.effort.kind === 'rir' ? [e.effort.rir.min, e.effort.rir.max] : 'duration',
            ),
            cardio: s.cardio.map((c) => c.kind),
          })),
        ),
      ),
    );
    expect(shapes.size).toBeGreaterThanOrEqual(6);
  });

  it('non cambia continuamente esercizi: il pool resta stabile e confrontabile', () => {
    const perWeek = allWeeks(p).map(
      (w) => new Set(w.sessions.flatMap((s) => s.exercises.map((e) => e.exerciseId))),
    );
    const union = new Set(perWeek.flatMap((s) => [...s]));
    // Dodici esercizi in tutto il percorso: uno storico confrontabile e'
    // possibile solo se gli esercizi tornano.
    expect(union.size).toBeLessThanOrEqual(13);

    // Gli esercizi principali compaiono in tutte le settimane.
    const mainLifts = ['legPress', 'chestPressMachine', 'dumbbellRomanianDeadlift', 'latPulldownFront'];
    for (const lift of mainLifts) {
      const weeksWith = perWeek.filter((s) => s.has(lift)).length;
      expect(weeksWith).toBe(perWeek.length);
    }
  });

  it('non aumenta l intensita solo perche cambia l anno', () => {
    // I blocchi di sviluppo del secondo e terzo anno non hanno ripetizioni
    // piu' basse ne' margini piu' stretti di quelli del primo anno: la
    // progressione avviene sui carichi reali, non sullo schema.
    const minRirByYear = new Map<number, number>();
    for (const block of p.blocks) {
      for (const week of block.weeks) {
        for (const session of week.sessions) {
          for (const ex of session.exercises) {
            if (ex.effort.kind !== 'rir') continue;
            const current = minRirByYear.get(block.yearNumber);
            const value = ex.effort.rir.min;
            minRirByYear.set(block.yearNumber, current === undefined ? value : Math.min(current, value));
          }
        }
      }
    }
    expect(minRirByYear.get(2)).toBeGreaterThanOrEqual(minRirByYear.get(1) ?? 0);
    expect(minRirByYear.get(3)).toBeGreaterThanOrEqual(minRirByYear.get(1) ?? 0);
  });

  it('i blocchi di sviluppo dopo il primo hanno criteri di ingresso verificabili', () => {
    const development = p.blocks.filter((b) => b.phase === 'development');
    for (const block of development) {
      const hasRealCriterion = block.entryCriteria.some((c) => c.rule.kind !== 'always');
      expect(hasRealCriterion).toBe(true);
    }
  });

  it('non introduce test massimali ne serie portate a cedimento', () => {
    const text = JSON.stringify(p);

    // 1. Nessuna formula che prescriva un massimale.
    expect(text).not.toMatch(/1\s?RM|test massimal|trova il (tuo )?massimale|prova il massimale/i);

    // 2. Ogni volta che il testo nomina "massimale" o "cedimento", lo fa per
    //    VIETARLO. Il controllo guarda il contesto immediatamente precedente:
    //    una prescrizione affermativa farebbe fallire il test.
    const negations = /\b(non|senza|nessun[ao]?|mai|evita|escluso)\b/i;
    for (const match of text.matchAll(/massimal[ei]|cedimento/gi)) {
      const start = Math.max(0, (match.index ?? 0) - 70);
      const context = text.slice(start, (match.index ?? 0) + match[0].length);
      expect(
        negations.test(context),
        `Occorrenza non negata di "${match[0]}" nel contesto: ...${context}`,
      ).toBe(true);
    }

    // 3. Nessuna prescrizione chiede margine zero (cioe' il cedimento).
    for (const week of allWeeks(p)) {
      for (const session of week.sessions) {
        for (const ex of session.exercises) {
          if (ex.effort.kind === 'rir') {
            expect(ex.effort.rir.min).toBeGreaterThanOrEqual(1);
          }
        }
      }
    }
  });

  it('non predice carichi in kg per il futuro', () => {
    // Nessuna prescrizione contiene un carico assoluto: le prescrizioni
    // portano serie, ripetizioni, margine e recupero, non kg.
    for (const week of allWeeks(p)) {
      for (const session of week.sessions) {
        for (const ex of session.exercises) {
          expect(ex).not.toHaveProperty('loadKg');
          expect(ex).not.toHaveProperty('prescribedKg');
        }
      }
    }
  });

  it('non accumula sedute perse: ogni blocco lo dice nella sua politica', () => {
    for (const block of p.blocks) {
      expect(block.interruptionPolicy).toContain('non si recuperano accumulandole');
    }
  });
});

describe('Durata delle sedute compatibile col tempo disponibile (SPEC §4.5)', () => {
  const p = plan('2026-09-21');
  // La specifica indica 65-75 minuti a regime. Il limite di accettazione e' 75.
  const MAX_MINUTES = 75;

  it('nessuna seduta del percorso supera i 75 minuti stimati', () => {
    const offenders: string[] = [];
    for (const week of allWeeks(p)) {
      for (const session of week.sessions) {
        const estimate = estimateSession(session, EXERCISE_LIBRARY, DEFAULT_DURATION_MODEL);
        if (estimate.totalMinutes > MAX_MINUTES) {
          offenders.push(
            `Settimana ${String(week.index)} ${session.slot}: ${String(estimate.totalMinutes)} min`,
          );
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('le sedute a regime stanno nella finestra 55-75 minuti', () => {
    const week5 = weekAt(p, 5);
    if (week5 === undefined) throw new Error('settimana 5 mancante');
    for (const session of week5.sessions) {
      const minutes = estimateSession(session, EXERCISE_LIBRARY).totalMinutes;
      expect(minutes).toBeGreaterThanOrEqual(55);
      expect(minutes).toBeLessThanOrEqual(MAX_MINUTES);
    }
  });

  it('la stima considera riscaldamento, lavoro, recuperi, cambi e cardio', () => {
    const session = weekAt(p, 5)?.sessions[0];
    if (session === undefined) throw new Error('seduta mancante');
    const b = estimateSession(session, EXERCISE_LIBRARY);
    expect(b.warmupSeconds).toBeGreaterThan(0);
    expect(b.workSeconds).toBeGreaterThan(0);
    expect(b.restSeconds).toBeGreaterThan(0);
    expect(b.transitionSeconds).toBeGreaterThan(0);
    expect(b.loggingSeconds).toBeGreaterThan(0);
    expect(b.cardioSeconds).toBeGreaterThan(0);
    // La somma delle parti e' il totale: nessuna voce nascosta.
    expect(
      b.warmupSeconds +
        b.workSeconds +
        b.restSeconds +
        b.transitionSeconds +
        b.loggingSeconds +
        b.cardioSeconds +
        b.overheadSeconds,
    ).toBe(b.totalSeconds);
  });

  it('non comprime i recuperi per far stare la seduta nel tempo', () => {
    // Ogni blocco dichiara i propri recuperi nello schema. Il piano non
    // contiene recuperi inferiori al minimo dichiarato dallo schema del
    // blocco a cui la settimana appartiene.
    for (const block of p.blocks) {
      const scheme = Object.values(SCHEMES).find((s) => s.label === block.name);
      if (scheme === undefined) continue;
      for (const week of block.weeks) {
        for (const session of week.sessions) {
          for (const ex of session.exercises) {
            expect(ex.rest.maxSeconds).toBeGreaterThanOrEqual(scheme.restCore[0]);
          }
        }
      }
    }
  });
});

describe('Avvertenze e onesta del piano', () => {
  const p = plan('2026-09-21');

  it('ogni anno dichiara di essere una struttura progettuale, non una previsione', () => {
    for (const year of p.years) {
      expect(year.caveat).toContain('struttura progettuale');
      expect(year.caveat).toContain('non e\' clinicamente certificato');
    }
  });

  it('il piano nasce alla versione 1, senza derivazioni', () => {
    expect(p.version).toBe(1);
    expect(p.derivedFromVersion).toBeNull();
    expect(p.revisionReason).toBeNull();
  });

  it('una revisione conserva la derivazione e il motivo', () => {
    const revised = buildThreeYearPlan({
      id: 'test-plan',
      startDate: '2026-09-21',
      version: 2,
      derivedFromVersion: 1,
      revisionReason: 'Fastidio ripetuto al ginocchio sullo step-up.',
    });
    expect(revised.version).toBe(2);
    expect(revised.derivedFromVersion).toBe(1);
    expect(revised.revisionReason).toContain('ginocchio');
  });
});

describe('Blocchi di pista e scarico', () => {
  const p = plan('2026-09-21');

  it('prevede periodi di pista in ogni anno', () => {
    for (const year of [1, 2, 3]) {
      const trackBlocks = p.blocks.filter(
        (b) => b.yearNumber === year && b.phase === 'trackSeason',
      );
      expect(trackBlocks.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('prevede settimane di scarico distribuite, non tutte insieme', () => {
    const deloadWeeks = allWeeks(p)
      .filter((w) => w.isDeload)
      .map((w) => w.index);
    expect(deloadWeeks.length).toBeGreaterThanOrEqual(5);
    // Nessuna coppia di scarichi consecutivi.
    for (let i = 1; i < deloadWeeks.length; i += 1) {
      expect((deloadWeeks[i] ?? 0) - (deloadWeeks[i - 1] ?? 0)).toBeGreaterThan(1);
    }
  });

  it('i periodi di pista dichiarano il riferimento prudenziale delle 72 ore', () => {
    const trackBlock = p.blocks.find((b) => b.phase === 'trackSeason');
    if (trackBlock === undefined) throw new Error('blocco pista mancante');
    const firstWeekNote = trackBlock.weeks[0]?.note ?? '';
    expect(firstWeekNote).toContain('72 ore');
    expect(firstWeekNote).toContain('non una garanzia');
  });

  it('lo scarico riduce il volume e allarga il margine', () => {
    expect(SCHEMES.deload.rir[0]).toBeGreaterThan(SCHEMES.technical.rir[0]);
    expect(SCHEMES.deload.sets[0]).toBeLessThan(SCHEMES.technical.sets[0]);
  });
});

describe('Alternanza personalizzata del terzo anno', () => {
  const p = plan('2026-09-21');

  it('alterna sviluppo e mantenimento dentro lo stesso blocco', () => {
    const block = p.blocks.find((b) => b.id === 'y3b7-alternanza');
    if (block === undefined) throw new Error('blocco di alternanza mancante');
    const labels = block.weeks.map((w) => (w.label.includes('Mantenimento') ? 'M' : 'S'));
    expect(labels.slice(0, 6).join('')).toBe('SSSSMM');
    expect(labels.filter((l) => l === 'M').length).toBeGreaterThan(0);
    expect(labels.filter((l) => l === 'S').length).toBeGreaterThan(0);
  });
});
