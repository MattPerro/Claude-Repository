import { describe, expect, it } from 'vitest';
import type { Exercise, ExerciseGuide } from '../src/domain/exercise.js';
import {
  EXERCISES,
  EXERCISE_IDS,
  EXERCISE_LIBRARY,
} from '../src/program/exercises.js';

/**
 * Test della libreria degli esercizi (specifica §12).
 *
 * Questi test non verificano "qualita' del contenuto": verificano che la guida
 * offline sia COMPLETA e che i divieti della specifica non siano violati dai
 * dati. Una guida con un campo vuoto e' un dato mancante, non uno stile.
 */

const EXPECTED_IDS = [
  'legPress',
  'chestPressMachine',
  'seatedCableRow',
  'legCurl',
  'pallofPress',
  'farmerCarry',
  'dumbbellRomanianDeadlift',
  'latPulldownFront',
  'stepUp',
  'inclineDumbbellPress',
  'adductorMachine',
  'sideplankKneesDown',
  'hipThrustMachine',
  'stationaryBike',
];

/** Campi della guida che devono essere elenchi non vuoti di stringhe piene. */
const GUIDE_LIST_FIELDS = [
  'primaryMuscles',
  'secondaryMuscles',
  'setup',
  'execution',
  'quickCues',
  'commonMistakes',
  'returningNotes',
  'variantNotes',
  'personalSettingsToRecord',
] as const satisfies readonly (keyof ExerciseGuide)[];

/** Campi della guida che devono essere stringhe non vuote. */
const GUIDE_TEXT_FIELDS = ['breathing', 'motorcyclePurpose'] as const satisfies readonly (keyof ExerciseGuide)[];

/** Raccoglie tutto il testo di un esercizio, per i controlli sui divieti. */
function allTexts(exercise: Exercise): string[] {
  const texts: string[] = [exercise.name, exercise.shortName];
  for (const field of GUIDE_LIST_FIELDS) texts.push(...exercise.guide[field]);
  for (const field of GUIDE_TEXT_FIELDS) texts.push(exercise.guide[field]);
  texts.push(exercise.defaultLoadStep.note ?? '');
  for (const variant of exercise.variants) texts.push(variant.name, variant.description);
  return texts;
}

describe('libreria degli esercizi: completezza', () => {
  it('contiene i 14 esercizi previsti, con ID unici', () => {
    expect(EXERCISES).toHaveLength(14);
    const ids = EXERCISES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...EXPECTED_IDS].sort());
    expect(EXERCISE_LIBRARY.size).toBe(14);
    for (const id of EXPECTED_IDS) {
      expect(EXERCISE_LIBRARY.has(id)).toBe(true);
    }
  });

  it('espone gli ID come costanti, senza stringhe magiche', () => {
    expect(Object.keys(EXERCISE_IDS).sort()).toEqual([...EXPECTED_IDS].sort());
    for (const [key, value] of Object.entries(EXERCISE_IDS)) {
      expect(value).toBe(key);
    }
  });

  it.each(EXERCISES.map((e) => [e.id, e] as const))(
    '%s ha tutti i campi della guida compilati',
    (_id, exercise) => {
      for (const field of GUIDE_LIST_FIELDS) {
        const values = exercise.guide[field];
        expect(values.length, `${exercise.id}.${field} e' vuoto`).toBeGreaterThan(0);
        for (const value of values) {
          expect(value.trim(), `${exercise.id}.${field} contiene una voce vuota`).not.toBe('');
        }
      }
      for (const field of GUIDE_TEXT_FIELDS) {
        expect(exercise.guide[field].trim(), `${exercise.id}.${field} e' vuoto`).not.toBe('');
      }
      expect(exercise.name.trim()).not.toBe('');
      expect(exercise.shortName.trim()).not.toBe('');
      expect(exercise.equipment.length).toBeGreaterThan(0);
      expect(exercise.secondsPerRep).toBeGreaterThan(0);
      expect(exercise.transitionSeconds).toBeGreaterThan(0);
      expect(exercise.variants.length).toBeGreaterThanOrEqual(1);
      for (const variant of exercise.variants) {
        expect(variant.id.trim()).not.toBe('');
        expect(variant.name.trim()).not.toBe('');
        expect(variant.description.trim()).not.toBe('');
      }
    },
  );
});

describe('libreria degli esercizi: coerenza dei riferimenti', () => {
  it('ogni alternativa compatibile esiste in libreria e non e\' se stessa', () => {
    for (const exercise of EXERCISES) {
      for (const alternativeId of exercise.compatibleAlternativeIds) {
        expect(
          EXERCISE_LIBRARY.has(alternativeId),
          `${exercise.id} rimanda a un esercizio inesistente: ${alternativeId}`,
        ).toBe(true);
        expect(alternativeId).not.toBe(exercise.id);
      }
    }
  });

  it('hip thrust esiste ed e\' fra le alternative dello stacco rumeno', () => {
    expect(EXERCISE_LIBRARY.has(EXERCISE_IDS.hipThrustMachine)).toBe(true);
    const rdl = EXERCISE_LIBRARY.get(EXERCISE_IDS.dumbbellRomanianDeadlift);
    expect(rdl.compatibleAlternativeIds).toContain(EXERCISE_IDS.hipThrustMachine);
  });

  it('gli ID delle varianti sono unici dentro ogni esercizio', () => {
    for (const exercise of EXERCISES) {
      const ids = exercise.variants.map((v) => v.id);
      expect(new Set(ids).size, `varianti duplicate in ${exercise.id}`).toBe(ids.length);
    }
  });
});

describe('libreria degli esercizi: divieti della specifica', () => {
  const FORBIDDEN = ['http', 'www.', 'youtube', 'video'];

  it('nessun testo contiene collegamenti, filmati o riferimenti esterni', () => {
    for (const exercise of EXERCISES) {
      for (const text of allTexts(exercise)) {
        const lowered = text.toLowerCase();
        for (const needle of FORBIDDEN) {
          expect(
            lowered.includes(needle),
            `${exercise.id} contiene "${needle}": ${text}`,
          ).toBe(false);
        }
      }
    }
  });

  it('le indicazioni rapide sono brevi, leggibili in un secondo', () => {
    for (const exercise of EXERCISES) {
      expect(exercise.guide.quickCues.length).toBeGreaterThanOrEqual(3);
      expect(exercise.guide.quickCues.length).toBeLessThanOrEqual(5);
      for (const cue of exercise.guide.quickCues) {
        expect(cue.length, `indicazione troppo lunga in ${exercise.id}: ${cue}`).toBeLessThanOrEqual(
          60,
        );
      }
    }
  });

  it('la finalita\' per la moto non promette risultati sul giro', () => {
    for (const exercise of EXERCISES) {
      const purpose = exercise.guide.motorcyclePurpose.toLowerCase();
      expect(purpose).not.toContain('garantisce');
      expect(purpose).not.toContain('migliorera');
      expect(purpose).not.toContain('ti fara');
    }
  });
});

describe('libreria degli esercizi: convenzioni di carico e misura', () => {
  it('gli esercizi per lato sono esattamente i tre previsti', () => {
    const perSide = EXERCISES.filter((e) => e.perSide).map((e) => e.id);
    expect([...perSide].sort()).toEqual(
      [
        EXERCISE_IDS.pallofPress,
        EXERCISE_IDS.sideplankKneesDown,
        EXERCISE_IDS.stepUp,
      ].sort(),
    );
  });

  it('lo step-up recupera dopo entrambe le gambe (specifica §3.3)', () => {
    expect(EXERCISE_LIBRARY.get(EXERCISE_IDS.stepUp).restAfterBothSides).toBe(true);
    const others = EXERCISES.filter((e) => e.id !== EXERCISE_IDS.stepUp);
    for (const exercise of others) {
      expect(exercise.restAfterBothSides, `${exercise.id} non deve avere questo flag`).toBe(false);
    }
  });

  it('gli esercizi misurati in secondi sono esattamente i tre previsti', () => {
    const timed = EXERCISES.filter((e) => e.metric === 'seconds').map((e) => e.id);
    expect([...timed].sort()).toEqual(
      [
        EXERCISE_IDS.farmerCarry,
        EXERCISE_IDS.sideplankKneesDown,
        EXERCISE_IDS.stationaryBike,
      ].sort(),
    );
  });

  it('le macchine a pacco pesi hanno un gradino di carico positivo', () => {
    const machines = EXERCISES.filter((e) => e.loadConvention === 'machineStack');
    expect(machines.length).toBeGreaterThan(0);
    for (const exercise of machines) {
      expect(
        exercise.defaultLoadStep.stepKg,
        `${exercise.id} senza gradino di carico`,
      ).toBeGreaterThan(0);
      expect(exercise.defaultLoadStep.note).not.toBeNull();
    }
  });

  it('gli esercizi a tempo non progrediscono sul carico', () => {
    for (const exercise of EXERCISES.filter((e) => e.loadConvention === 'timeOnly')) {
      expect(exercise.defaultLoadStep.stepKg).toBe(0);
      expect(exercise.metric).toBe('seconds');
      expect(exercise.defaultLoadStep.note).toMatch(/secondi|durata/);
    }
  });

  it('nessuna nota di gradino esprime un incremento in percentuale', () => {
    for (const exercise of EXERCISES) {
      expect(exercise.defaultLoadStep.note ?? '').not.toContain('%');
    }
  });

  it('la cyclette e\' l\'unico esercizio di pattern cardio', () => {
    const cardio = EXERCISES.filter((e) => e.pattern === 'cardio').map((e) => e.id);
    expect(cardio).toEqual([EXERCISE_IDS.stationaryBike]);
  });
});
