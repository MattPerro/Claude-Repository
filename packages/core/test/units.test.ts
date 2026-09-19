/**
 * Convenzioni di carico, formattazione italiana e gradini di carico.
 *
 * Sono i dettagli in cui un errore silenzioso rovina lo storico: un 12,5
 * interpretato come 125, un carico arrotondato a un valore non impostabile,
 * due macchine confuse fra loro.
 */

import { describe, expect, it } from 'vitest';
import {
  areComparable,
  comparabilityKey,
  formatDecimalIt,
  formatDurationIt,
  formatKgIt,
  formatMinutesIt,
  isInvertedProgress,
  LOAD_CONVENTIONS,
  LOAD_CONVENTION_HELP,
  LOAD_CONVENTION_LABEL,
  nextLoadDown,
  nextLoadUp,
  parseDecimalIt,
  requiresNoLoad,
  roundKg,
  snapToStep,
  UNKNOWN_LOAD_STEP,
  type LoadStep,
} from '@trackstrong/core';

describe('Virgola decimale italiana (SPEC §9.1)', () => {
  it('legge la virgola come separatore decimale', () => {
    expect(parseDecimalIt('12,5')).toBe(12.5);
    expect(parseDecimalIt('0,5')).toBe(0.5);
    expect(parseDecimalIt('100')).toBe(100);
  });

  it('accetta anche il punto, per chi ha la tastiera in inglese', () => {
    expect(parseDecimalIt('12.5')).toBe(12.5);
  });

  it('non trasforma un campo vuoto o illeggibile in zero', () => {
    // Uno 0 salvato come carico e' un dato FALSO: meglio nessun valore.
    for (const input of ['', '   ', 'abc', ',', '.', '-', 'kg', '1,2,3', '1.234,5']) {
      expect(parseDecimalIt(input)).toBeNull();
    }
  });

  it('scrive i numeri con la virgola', () => {
    expect(formatDecimalIt(12.5)).toBe('12,5');
    expect(formatKgIt(12.5)).toBe('12,5 kg');
    expect(formatKgIt(60)).toBe('60 kg');
    expect(formatKgIt(2.25)).toBe('2,25 kg');
  });

  it('fa un giro completo scrittura -> lettura senza perdere valore', () => {
    for (const value of [0.5, 1.25, 2, 12.5, 60, 137.75]) {
      expect(parseDecimalIt(formatDecimalIt(value))).toBe(value);
    }
  });

  it('non produce errori di virgola mobile nei totali', () => {
    expect(roundKg(12.5 * 3)).toBe(37.5);
    expect(roundKg(0.1 + 0.2)).toBe(0.3);
  });
});

describe('Formattazione di durate e minuti', () => {
  it('formatta i secondi', () => {
    expect(formatDurationIt(45)).toBe('45 s');
    expect(formatDurationIt(90)).toBe('1:30');
    expect(formatDurationIt(120)).toBe('2:00');
    expect(formatDurationIt(0)).toBe('0 s');
  });

  it('non mostra durate negative', () => {
    expect(formatDurationIt(-10)).toBe('0 s');
  });

  it('formatta i minuti', () => {
    expect(formatMinutesIt(45)).toBe('45 min');
    expect(formatMinutesIt(70)).toBe('1 h 10 min');
    expect(formatMinutesIt(120)).toBe('2 h');
  });
});

describe('Convenzioni di carico (SPEC §5.3)', () => {
  it('ogni convenzione ha etichetta e spiegazione in italiano', () => {
    for (const convention of LOAD_CONVENTIONS) {
      expect(LOAD_CONVENTION_LABEL[convention].length).toBeGreaterThan(3);
      expect(LOAD_CONVENTION_HELP[convention].length).toBeGreaterThan(20);
    }
  });

  it('spiega che per manubrio si intende UN manubrio', () => {
    expect(LOAD_CONVENTION_HELP.perDumbbell).toContain('non la somma');
  });

  it('spiega che il valore di una macchina non e portabile', () => {
    expect(LOAD_CONVENTION_HELP.machineStack).toContain("un'altra macchina");
  });

  it('spiega che nel sovraccarico non va incluso il peso del corpo', () => {
    expect(LOAD_CONVENTION_HELP.bodyweightPlus).toContain('non il peso del corpo');
  });

  it('sa che nell assistenza il progresso va verso il basso', () => {
    expect(isInvertedProgress('assisted')).toBe(true);
    expect(isInvertedProgress('machineStack')).toBe(false);
    expect(LOAD_CONVENTION_HELP.assisted).toContain('verso il basso');
  });

  it('sa quali convenzioni non hanno un carico da inserire', () => {
    expect(requiresNoLoad('bodyweight')).toBe(true);
    expect(requiresNoLoad('timeOnly')).toBe(true);
    expect(requiresNoLoad('bodyweightPlus')).toBe(false);
    expect(requiresNoLoad('machineStack')).toBe(false);
  });
});

describe('Chiave di comparabilita (SPEC §5.3)', () => {
  const base = {
    exerciseId: 'legPress',
    variantId: null,
    loadConvention: 'machineStack' as const,
    equipmentInstanceId: 'macchina-1',
    metric: 'reps' as const,
    perSide: false,
  };

  it('e stabile a parita di ingressi', () => {
    expect(comparabilityKey(base)).toBe(comparabilityKey({ ...base }));
  });

  it('e versionata, cosi un cambio di formato e riconoscibile', () => {
    expect(comparabilityKey(base)).toMatch(/^v1\|/);
  });

  it('distingue esercizi, varianti, convenzioni, metriche e lati', () => {
    const variations = [
      { ...base, exerciseId: 'chestPressMachine' },
      { ...base, variantId: 'presa-larga' },
      { ...base, loadConvention: 'perDumbbell' as const },
      { ...base, metric: 'seconds' as const },
      { ...base, perSide: true },
    ];
    const keys = new Set([comparabilityKey(base), ...variations.map(comparabilityKey)]);
    expect(keys.size).toBe(variations.length + 1);
  });

  it('distingue due macchine diverse', () => {
    expect(areComparable(base, { ...base, equipmentInstanceId: 'macchina-2' })).toBe(false);
  });

  it('ignora l attrezzo per le convenzioni non legate a una macchina', () => {
    const dumbbell = { ...base, loadConvention: 'perDumbbell' as const };
    expect(
      areComparable(
        { ...dumbbell, equipmentInstanceId: 'rastrelliera-1' },
        { ...dumbbell, equipmentInstanceId: 'rastrelliera-2' },
      ),
    ).toBe(true);
  });

  it('rifiuta una convenzione da macchina senza identita dell attrezzo', () => {
    expect(() => comparabilityKey({ ...base, equipmentInstanceId: null })).toThrow();
    expect(() =>
      comparabilityKey({ ...base, loadConvention: 'assisted', equipmentInstanceId: '' }),
    ).toThrow();
  });

  it('areComparable non lancia su ingressi non validi: restituisce false', () => {
    expect(areComparable(base, { ...base, equipmentInstanceId: null })).toBe(false);
  });
});

describe('Gradini di carico: nessuna percentuale uniforme (SPEC §5.1)', () => {
  const machine: LoadStep = { stepKg: 5, minKg: 20, maxKg: 100, note: null };
  const dumbbells: LoadStep = { stepKg: 2, minKg: 2, maxKg: 40, note: null };
  const micro: LoadStep = { stepKg: 1.25, minKg: 0, maxKg: null, note: null };

  it('sale al gradino successivo realmente impostabile', () => {
    expect(nextLoadUp(60, machine)).toBe(65);
    expect(nextLoadUp(20, dumbbells)).toBe(22);
    expect(nextLoadUp(10, micro)).toBe(11.25);
  });

  it('gradini diversi per attrezzi diversi, a parita di carico', () => {
    // 60 kg: la macchina sale di 5, i manubri di 2, i microcarichi di 1,25.
    // Una percentuale uniforme darebbe lo stesso numero per tutti: e' il
    // difetto che la specifica vieta.
    expect(new Set([nextLoadUp(60, machine), nextLoadUp(60, dumbbells), nextLoadUp(60, micro)]).size).toBe(3);
  });

  it('non supera il massimo dell attrezzo', () => {
    expect(nextLoadUp(100, machine)).toBeNull();
    expect(nextLoadUp(98, machine)).toBeNull();
  });

  it('scende senza andare sotto il minimo', () => {
    expect(nextLoadDown(60, machine)).toBe(55);
    expect(nextLoadDown(20, machine)).toBeNull();
  });

  it('non propone nulla quando il gradino non e configurato', () => {
    expect(nextLoadUp(60, UNKNOWN_LOAD_STEP)).toBeNull();
    expect(nextLoadDown(60, UNKNOWN_LOAD_STEP)).toBeNull();
    expect(snapToStep(60, UNKNOWN_LOAD_STEP)).toBeNull();
  });

  it('arrotonda verso il basso a un valore impostabile', () => {
    expect(snapToStep(63, machine)).toBe(60);
    expect(snapToStep(65, machine)).toBe(65);
    expect(snapToStep(200, machine)).toBe(100); // limitato al massimo
    expect(snapToStep(10, machine)).toBeNull(); // sotto il minimo
  });

  it('rifiuta valori non numerici o negativi', () => {
    expect(snapToStep(Number.NaN, machine)).toBeNull();
    expect(snapToStep(-5, machine)).toBeNull();
  });

  it('non introduce errori di virgola mobile nei gradini frazionari', () => {
    expect(nextLoadUp(1.25, micro)).toBe(2.5);
    expect(nextLoadUp(2.5, micro)).toBe(3.75);
    expect(snapToStep(3.9, micro)).toBe(3.75);
  });
});
