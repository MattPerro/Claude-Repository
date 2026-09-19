/**
 * Conformita' ai requisiti di CONTENUTO della specifica.
 *
 * Gli altri file di test verificano il comportamento del codice. Questo
 * verifica che certe frasi e certe cautele che l'utente ha chiesto
 * espressamente di conservare siano ancora presenti nei dati.
 *
 * Esiste perche' un requisito di contenuto e' il piu' facile da perdere in una
 * riscrittura: nessun tipo lo protegge, nessun compilatore lo nota. Se qualcuno
 * riscrive la guida della pressa e dimentica "bacino appoggiato", solo un test
 * come questo lo ferma.
 */

import { describe, expect, it } from 'vitest';
import {
  buildSessionA,
  buildSessionB,
  buildThreeYearPlan,
  CARDIO_INTERVALS_FROM_WEEK_7,
  defaultSettings,
  EXERCISE_LIBRARY,
  MISSING_INFO_TEXT,
  NEUTRAL_ONBOARDING,
  SYNC_STATE_TEXT,
  withHipThrustAlternative,
  type Exercise,
} from '@trackstrong/core';

/** Tutto il testo di un esercizio, in una stringa, per le ricerche. */
function exerciseText(exercise: Exercise): string {
  const g = exercise.guide;
  return [
    exercise.name,
    exercise.shortName,
    ...g.primaryMuscles,
    ...g.secondaryMuscles,
    ...g.setup,
    ...g.execution,
    g.breathing,
    ...g.quickCues,
    ...g.commonMistakes,
    ...g.returningNotes,
    ...g.variantNotes,
    ...g.personalSettingsToRecord,
    g.motorcyclePurpose,
  ].join(' \n ');
}

describe('Accorgimenti che la specifica chiede di conservare (SPEC §12)', () => {
  const cases: readonly {
    readonly exerciseId: string;
    readonly what: string;
    readonly pattern: RegExp;
  }[] = [
    {
      exerciseId: 'legPress',
      what: 'bacino appoggiato',
      pattern: /bacino[^.]{0,40}appoggiat/i,
    },
    {
      exerciseId: 'legPress',
      what: 'movimento controllato',
      pattern: /controllat/i,
    },
    {
      exerciseId: 'dumbbellRomanianDeadlift',
      what: 'bacino indietro',
      pattern: /bacino indietro/i,
    },
    {
      exerciseId: 'dumbbellRomanianDeadlift',
      what: 'manubri vicini',
      pattern: /manubri vicin/i,
    },
    {
      exerciseId: 'dumbbellRomanianDeadlift',
      what: 'non serve arrivare a terra',
      pattern: /non serve arrivare a terra/i,
    },
    {
      exerciseId: 'stepUp',
      what: 'gradino stabile e inizialmente basso',
      pattern: /gradino[^.]{0,60}(stabil|bass)/i,
    },
    {
      exerciseId: 'stepUp',
      what: 'appoggio quando necessario',
      pattern: /appogg/i,
    },
    {
      exerciseId: 'farmerCarry',
      // La specifica chiede "postura controllata". Il controllo verifica la
      // SOSTANZA (la guida parla di postura e dice di fermarsi quando cede),
      // non una formula esatta: pretendere le parole letterali renderebbe il
      // test un ostacolo a una riscrittura migliore dello stesso concetto.
      what: 'il controllo della postura, e di fermarsi quando cede',
      pattern: /postur[ae][\s\S]{0,400}(cede|deform|non e' piu' sicur|si perde)/i,
    },
    {
      exerciseId: 'farmerCarry',
      what: 'senza prova massimale di presa',
      pattern: /(nessuna|senza)[^.]{0,20}prova[^.]{0,20}massimal/i,
    },
    {
      exerciseId: 'sideplankKneesDown',
      what: 'interrompere quando non si mantiene la posizione',
      pattern: /interromp[^.]{0,60}(mantener|posizion)/i,
    },
  ];

  it.each(cases)('$exerciseId conserva: $what', ({ exerciseId, pattern }) => {
    const text = exerciseText(EXERCISE_LIBRARY.get(exerciseId));
    expect(pattern.test(text)).toBe(true);
  });
});

describe('Guide offline complete e autosufficienti (SPEC §12)', () => {
  it('nessuna guida rimanda a video, collegamenti o immagini', () => {
    for (const exercise of EXERCISE_LIBRARY.all()) {
      const text = exerciseText(exercise);
      for (const forbidden of [/https?:\/\//i, /www\./i, /youtube/i, /\bvideo\b/i, /guarda l'immagine/i]) {
        expect(forbidden.test(text), `${exercise.id}: ${String(forbidden)}`).toBe(false);
      }
    }
  });

  it('ogni campo della guida contiene qualcosa di reale', () => {
    for (const exercise of EXERCISE_LIBRARY.all()) {
      const g = exercise.guide;
      expect(g.primaryMuscles.length, exercise.id).toBeGreaterThan(0);
      expect(g.setup.length, exercise.id).toBeGreaterThanOrEqual(3);
      expect(g.execution.length, exercise.id).toBeGreaterThanOrEqual(3);
      expect(g.breathing.length, exercise.id).toBeGreaterThan(15);
      expect(g.quickCues.length, exercise.id).toBeGreaterThanOrEqual(3);
      expect(g.commonMistakes.length, exercise.id).toBeGreaterThanOrEqual(3);
      expect(g.returningNotes.length, exercise.id).toBeGreaterThan(0);
      expect(g.personalSettingsToRecord.length, exercise.id).toBeGreaterThan(0);
      expect(g.motorcyclePurpose.length, exercise.id).toBeGreaterThan(30);
    }
  });

  it('le indicazioni rapide restano leggibili in seduta', () => {
    for (const exercise of EXERCISE_LIBRARY.all()) {
      for (const cue of exercise.guide.quickCues) {
        expect(cue.length, `${exercise.id}: "${cue}"`).toBeLessThanOrEqual(60);
      }
    }
  });

  it("l'utilita per la moto e' una finalita, non una garanzia", () => {
    // Attenzione al verso del controllo: la parola "garanzia" compare nelle
    // guide proprio perche' NEGATA ("non una garanzia di risultato in
    // pista"). Cercarla e bocciarla boccerebbe la cautela invece della
    // promessa. Quindi ogni occorrenza deve essere in un contesto negato.
    const promiseWords = /garanzi|garantis|promess|assicur|migliorer[àa]|scenderai/gi;
    const negation = /\b(non|senza|nessun[ao]?|mai)\b/i;

    for (const exercise of EXERCISE_LIBRARY.all()) {
      const purpose = exercise.guide.motorcyclePurpose;
      for (const match of purpose.matchAll(promiseWords)) {
        const from = Math.max(0, (match.index ?? 0) - 40);
        const context = purpose.slice(from, (match.index ?? 0) + match[0].length);
        expect(
          negation.test(context),
          `${exercise.id}: promessa non negata -> ...${context}`,
        ).toBe(true);
      }
      // E in positivo: ogni scopo dichiara di essere preparazione generale.
      expect(/preparazione generale|finalita'/i.test(purpose), exercise.id).toBe(true);
    }
  });
});

describe('Contenuti fuori perimetro, vietati dalla specifica (SPEC §6)', () => {
  /** Tutto il testo che l'app puo' mostrare, in una stringa sola. */
  function allProgramText(): string {
    const plan = buildThreeYearPlan({ id: 'x', startDate: '2026-09-21' });
    const library = EXERCISE_LIBRARY.all().map(exerciseText).join(' \n ');
    const sessions = [1, 3, 6, 8]
      .flatMap((w) => [buildSessionA(w), buildSessionB(w), withHipThrustAlternative(buildSessionB(w), w)])
      .map((s) => JSON.stringify(s))
      .join(' \n ');
    return [JSON.stringify(plan), library, sessions, JSON.stringify(MISSING_INFO_TEXT)].join(' \n ');
  }

  const text = allProgramText();

  it('non introduce riabilitazione', () => {
    expect(/riabilitaz|fisioterap|rieducazione funzionale/i.test(text)).toBe(false);
  });

  it('non introduce apnea o trattenimento del respiro', () => {
    expect(/apnea|trattieni il respiro|trattenendo il respiro/i.test(text)).toBe(false);
  });

  it('non introduce esercizi cervicali zavorrati', () => {
    expect(/collo zavorrat|cervical[ei] (con|zavorr)|estension[ei] del collo con/i.test(text)).toBe(false);
  });

  it('non diagnostica e non certifica idoneita', () => {
    expect(/diagnos(i|tic)|idoneit[àa] (sportiva|agonistica)|certificat[oa] medic/i.test(text)).toBe(
      false,
    );
  });

  it('non genera obiettivi nutrizionali', () => {
    expect(/dieta|deficit calorico|assumi \d+ (g|grammi|kcal)|calorie da assumere/i.test(text)).toBe(
      false,
    );
  });

  it('non promette una data per raggiungere un peso', () => {
    expect(/(raggiunger|arriverai|sarai) a \d+ ?kg (entro|in|fra)/i.test(text)).toBe(false);
  });

  it('non attribuisce i tempi sul giro alla palestra', () => {
    expect(/grazie alla palestra|per effetto degli allenamenti il tuo tempo/i.test(text)).toBe(false);
  });
});

describe('Cautele che devono restare scritte', () => {
  it("l'alternativa a intervalli dichiara che non sono sprint massimali", () => {
    expect(CARDIO_INTERVALS_FROM_WEEK_7.note).toMatch(/non sono sprint massimali/i);
  });

  it("l'alternativa a intervalli e' facoltativa e va scelta", () => {
    expect(CARDIO_INTERVALS_FROM_WEEK_7.note).toMatch(/facoltativ/i);
    if (CARDIO_INTERVALS_FROM_WEEK_7.kind === 'intervals') {
      expect(CARDIO_INTERVALS_FROM_WEEK_7.optIn).toBe(true);
    }
  });

  it("l'hip thrust rimanda alla valutazione di un istruttore", () => {
    const hip = withHipThrustAlternative(buildSessionB(6), 6).exercises.find(
      (e) => e.exerciseId === 'hipThrustMachine',
    );
    expect(hip?.note).toMatch(/istruttore/i);
  });

  it('ogni anno del piano dichiara di non essere clinicamente certificato', () => {
    const plan = buildThreeYearPlan({ id: 'x', startDate: '2026-09-21' });
    for (const year of plan.years) {
      expect(year.caveat).toMatch(/non e' clinicamente certificato/i);
      expect(year.caveat).toMatch(/struttura progettuale/i);
    }
  });

  it('il periodo di pista presenta le 72 ore come criterio, non come garanzia', () => {
    const plan = buildThreeYearPlan({ id: 'x', startDate: '2026-09-21' });
    const track = plan.blocks.find((b) => b.phase === 'trackSeason');
    const note = track?.weeks[0]?.note ?? '';
    expect(note).toMatch(/72 ore/);
    expect(note).toMatch(/non una garanzia/i);
  });
});

describe('Impostazioni sensibili alla privacy: disattivate all inizio (SPEC §14)', () => {
  const settings = defaultSettings('ws', 'Europe/Rome');

  it('il coach generativo esterno e disattivato', () => {
    expect(settings.generativeCoachEnabled).toBe(false);
  });

  it('la sincronizzazione delle foto di progresso e disattivata', () => {
    expect(settings.syncProgressPhotos).toBe(false);
  });

  it('la cifratura lato client e dichiarata disattivata, coerentemente con PRIVACY.md', () => {
    // PRIVACY.md §5 afferma che la cifratura lato client NON e' implementata.
    // Se qualcuno la attivasse per impostazione predefinita senza
    // implementarla, questo test lo fermerebbe.
    expect(settings.clientEncryptionEnabled).toBe(false);
  });

  it('il riferimento prima della pista e 72 ore, configurabile', () => {
    expect(settings.hoursBeforeTrackDay).toBe(72);
  });
});

describe('Nessun dato personale nei valori predefiniti (SPEC §2)', () => {
  it("l'onboarding non contiene nome, altezza o peso reali", () => {
    expect(NEUTRAL_ONBOARDING.displayName).toBe('');
    expect(NEUTRAL_ONBOARDING.heightCm).toBeNull();
    expect(NEUTRAL_ONBOARDING.declaredWeightKg).toBeNull();
    expect(NEUTRAL_ONBOARDING.bodyGoal).toBeNull();
    expect(NEUTRAL_ONBOARDING.sportGoal).toBeNull();
    expect(NEUTRAL_ONBOARDING.context).toBeNull();
  });

  it('conserva pero le impostazioni strutturali del progetto', () => {
    // Queste non sono dati personali: sono la struttura concordata.
    expect(NEUTRAL_ONBOARDING.sessionsPerWeek).toBe(2);
    expect(NEUTRAL_ONBOARDING.availableMinutesPerSession).toBe(70);
    // Lunedi' e giovedi', PROPOSTI e non imposti.
    expect(NEUTRAL_ONBOARDING.preferredWeekdays).toEqual([1, 4]);
  });
});

describe('Testi della sincronizzazione: nessuna promessa eccessiva (SPEC §8.5)', () => {
  it('non promette allineamento istantaneo', () => {
    const all = Object.values(SYNC_STATE_TEXT)
      .map((s) => `${s.short} ${s.long}`)
      .join(' ');
    expect(/istantane|immediatamente su tutti|subito su tutti i dispositivi/i.test(all)).toBe(false);
  });

  it('un errore di rete non viene descritto come perdita di dati', () => {
    expect(SYNC_STATE_TEXT.offline.long).toMatch(/funziona comunque/i);
    expect(SYNC_STATE_TEXT.authExpired.long).toMatch(/intatti/i);
  });
});
