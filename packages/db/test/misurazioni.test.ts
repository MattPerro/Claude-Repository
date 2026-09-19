/**
 * Misurazioni e media mobile a 7 giorni.
 *
 * Verifica i tre divieti di §15: nessuna interpolazione, conteggio delle
 * osservazioni presente, peso dichiarato in profilo fuori dai calcoli.
 */

import { describe, expect, it } from 'vitest';

import { MissingBodyFatMethodError } from '@trackstrong/core';

import { openTestDb, T0 } from './helpers.js';

describe('media mobile a 7 giorni', () => {
  it('riporta il conteggio corretto delle osservazioni', () => {
    const ctx = openTestDb();
    // Tre pesate sintetiche in tre giorni consecutivi.
    const pesate: readonly [string, number][] = [
      ['2027-03-01', 90],
      ['2027-03-02', 89],
      ['2027-03-03', 88],
    ];
    for (const [giorno, valore] of pesate) {
      ctx.repos.measurements.record({
        kind: 'weightKg',
        value: valore,
        measuredOn: giorno,
        recordedAt: T0,
      });
    }

    const media = ctx.repos.measurements.movingAverage('weightKg');
    expect(media.map((p) => p.date)).toEqual(['2027-03-01', '2027-03-02', '2027-03-03']);
    // Il conteggio cresce con la finestra: 1, 2, 3 osservazioni.
    expect(media.map((p) => p.observationCount)).toEqual([1, 2, 3]);
    expect(media[0]?.average).toBeCloseTo(90, 5);
    expect(media[1]?.average).toBeCloseTo(89.5, 5);
    expect(media[2]?.average).toBeCloseTo(89, 5);
    ctx.close();
  });

  it('non interpola i giorni mancanti: nessun punto dove non c\'e\' una pesata', () => {
    const ctx = openTestDb();
    // Due pesate a dieci giorni di distanza: in mezzo non c'e' niente.
    ctx.repos.measurements.record({
      kind: 'weightKg',
      value: 92,
      measuredOn: '2027-03-01',
      recordedAt: T0,
    });
    ctx.repos.measurements.record({
      kind: 'weightKg',
      value: 89,
      measuredOn: '2027-03-11',
      recordedAt: T0,
    });

    const media = ctx.repos.measurements.movingAverage('weightKg');
    expect(media).toHaveLength(2);
    expect(media.map((p) => p.date)).toEqual(['2027-03-01', '2027-03-11']);
    // La finestra del secondo punto non raggiunge il primo: una sola
    // osservazione, non una media fra i due con i giorni riempiti.
    expect(media[1]?.observationCount).toBe(1);
    expect(media[1]?.average).toBeCloseTo(89, 5);
    ctx.close();
  });

  it('la finestra e\' di 7 giorni e non include misurazioni piu\' vecchie', () => {
    const ctx = openTestDb();
    for (const [giorno, valore] of [
      ['2027-03-01', 100],
      ['2027-03-08', 90],
    ] as const) {
      ctx.repos.measurements.record({
        kind: 'weightKg',
        value: valore,
        measuredOn: giorno,
        recordedAt: T0,
      });
    }
    const media = ctx.repos.measurements.movingAverage('weightKg');
    const ultimo = media[media.length - 1];
    // 1 marzo e' fuori dalla finestra [2 marzo, 8 marzo].
    expect(ultimo?.observationCount).toBe(1);
    expect(ultimo?.average).toBeCloseTo(90, 5);
    ctx.close();
  });

  it('piu\' pesate nello stesso giorno contano come piu\' osservazioni', () => {
    const ctx = openTestDb();
    for (const valore of [90, 91]) {
      ctx.repos.measurements.record({
        kind: 'weightKg',
        value: valore,
        measuredOn: '2027-03-01',
        recordedAt: T0,
      });
    }
    const media = ctx.repos.measurements.movingAverage('weightKg');
    expect(media).toHaveLength(1);
    expect(media[0]?.observationCount).toBe(2);
    // Il giorno vale una volta sola: media del giorno, non somma.
    expect(media[0]?.average).toBeCloseTo(90.5, 5);
    ctx.close();
  });

  it('il peso dichiarato in profilo non compare nella media', () => {
    const ctx = openTestDb();
    // Il profilo sintetico dichiara 88 kg (vedi helpers).
    expect(ctx.repos.workspace.profile()?.declaredWeightKg).toBe(88);

    // Nessuna pesata registrata: nessun punto.
    expect(ctx.repos.measurements.movingAverage('weightKg')).toEqual([]);
    expect(ctx.repos.measurements.series('weightKg')).toEqual([]);
    expect(ctx.repos.measurements.latest('weightKg')).toBeNull();

    // Una pesata reale, con un valore diverso da quello dichiarato.
    ctx.repos.measurements.record({
      kind: 'weightKg',
      value: 91.5,
      measuredOn: '2027-03-02',
      recordedAt: T0,
    });
    const media = ctx.repos.measurements.movingAverage('weightKg');
    expect(media).toHaveLength(1);
    expect(media[0]?.observationCount).toBe(1);
    expect(media[0]?.average).toBeCloseTo(91.5, 5);
    // 88 non entra: non e' una pesata datata.
    expect(media.some((p) => Math.abs(p.average - 88) < 0.001)).toBe(false);
    ctx.close();
  });

  it('una misurazione eliminata esce dalla media', () => {
    const ctx = openTestDb();
    const prima = ctx.repos.measurements.record({
      kind: 'weightKg',
      value: 95,
      measuredOn: '2027-03-01',
      recordedAt: T0,
    });
    ctx.repos.measurements.record({
      kind: 'weightKg',
      value: 90,
      measuredOn: '2027-03-02',
      recordedAt: T0,
    });
    ctx.repos.measurements.remove(prima.id);

    const media = ctx.repos.measurements.movingAverage('weightKg');
    expect(media).toHaveLength(1);
    expect(media[0]?.date).toBe('2027-03-02');
    expect(media[0]?.observationCount).toBe(1);
    ctx.close();
  });
});

describe('validazione delle misurazioni', () => {
  it('una percentuale di grasso senza metodo non viene salvata', () => {
    const ctx = openTestDb();
    expect(() =>
      ctx.repos.measurements.record({
        kind: 'bodyFatPercent',
        value: 28,
        measuredOn: '2027-03-01',
        recordedAt: T0,
      }),
    ).toThrowError(MissingBodyFatMethodError);
    expect(ctx.repos.measurements.series('bodyFatPercent')).toEqual([]);
    ctx.close();
  });

  it('con il metodo viene salvata', () => {
    const ctx = openTestDb();
    const misura = ctx.repos.measurements.record({
      kind: 'bodyFatPercent',
      value: 28,
      measuredOn: '2027-03-01',
      recordedAt: T0,
      method: 'calipers',
    });
    expect(misura.method).toBe('calipers');
    ctx.close();
  });

  it('un peso implausibile viene rifiutato', () => {
    const ctx = openTestDb();
    expect(() =>
      ctx.repos.measurements.record({
        kind: 'weightKg',
        value: 900,
        measuredOn: '2027-03-01',
        recordedAt: T0,
      }),
    ).toThrowError(/fuori intervallo plausibile/);
    ctx.close();
  });
});
