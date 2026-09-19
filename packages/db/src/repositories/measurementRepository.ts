/**
 * Misurazioni corporee e media mobile a 7 giorni.
 *
 * Tre divieti espliciti della specifica (§15 e §2) sono implementati qui, non
 * lasciati alla disciplina del chiamante:
 *
 * 1. **Il peso dichiarato in profilo non e' una pesata.** Sta in
 *    `profiles.declared_weight_kg`, una tabella diversa: nessuna query di
 *    questo repository lo puo' raggiungere. Non e' una convenzione, e' una
 *    separazione strutturale.
 * 2. **Nessuna interpolazione.** La media mobile produce un punto SOLO nei
 *    giorni in cui esiste almeno una misurazione. I giorni senza pesata non
 *    vengono inventati.
 * 3. **Il conteggio delle osservazioni fa parte del risultato.** Una media su
 *    2 pesate non e' una media su 7, e va mostrato
 *    (`MovingAveragePoint.observationCount`).
 */

import {
  addDays,
  diffDays,
  validateMeasurement,
  type BodyFatMethod,
  type Instant,
  type LocalDate,
  type Measurement,
  type MeasurementKind,
  type MovingAveragePoint,
} from '@trackstrong/core';

import type { Database } from '../database.js';
import { toMeasurement, type MeasurementRow } from '../rows.js';
import { deleteOperation, rowPayload, upsertOperation, withWrite } from '../unitOfWork.js';

export interface RecordMeasurementInput {
  readonly kind: MeasurementKind;
  readonly value: number;
  readonly measuredOn: LocalDate;
  readonly recordedAt: Instant;
  readonly method?: BodyFatMethod | null;
  readonly note?: string | null;
  readonly id?: string;
}

/** Finestra della media mobile, in giorni. Il progetto usa 7 (§15). */
export const MOVING_AVERAGE_WINDOW_DAYS = 7;

export interface MeasurementRepository {
  record(input: RecordMeasurementInput): Measurement;
  byId(id: string): Measurement | null;
  /** Serie completa di un tipo, in ordine di data crescente. */
  series(kind: MeasurementKind): readonly Measurement[];
  latest(kind: MeasurementKind): Measurement | null;
  remove(id: string): void;
  /**
   * Media mobile a 7 giorni con il conteggio delle osservazioni.
   *
   * Un punto per ogni giorno in cui esiste almeno una misurazione; la media
   * e' calcolata sulle misurazioni che cadono nella finestra
   * `[giorno - 6, giorno]`. Nessun giorno mancante viene interpolato e
   * nessun valore dichiarato in profilo entra nel calcolo.
   */
  movingAverage(kind: MeasurementKind, windowDays?: number): readonly MovingAveragePoint[];
}

export function createMeasurementRepository(db: Database): MeasurementRepository {
  const readRow = (id: string): MeasurementRow | undefined =>
    db.driver.get<MeasurementRow>('SELECT * FROM measurements WHERE id = ?', [id]);

  const rowsOf = (kind: MeasurementKind): readonly MeasurementRow[] =>
    db.driver.all<MeasurementRow>(
      `SELECT * FROM measurements
        WHERE workspace_id = ? AND kind = ? AND deleted_at IS NULL
        ORDER BY measured_on ASC, recorded_at ASC`,
      [db.workspaceId, kind],
    );

  return {
    record: (input) =>
      withWrite(db, (ctx) => {
        // La validazione del dominio prima della scrittura: una percentuale
        // di grasso senza metodo non e' un dato e non viene salvata.
        validateMeasurement({
          kind: input.kind,
          method: input.method ?? null,
          value: input.value,
        });

        const row = {
          id: input.id ?? db.ids.newId(),
          workspace_id: db.workspaceId,
          kind: input.kind,
          value: input.value,
          measured_on: input.measuredOn,
          recorded_at: input.recordedAt,
          method: input.method ?? null,
          note: input.note ?? null,
          revision: 1,
          updated_at: ctx.now,
          deleted_at: null,
        };
        ctx.upsert(
          'measurements',
          row,
          upsertOperation(1, null, rowPayload(row), 'nuova misurazione'),
        );
        const stored = readRow(row.id);
        if (stored === undefined) throw new Error('Misurazione non leggibile dopo il salvataggio.');
        return toMeasurement(stored);
      }),

    byId: (id) => {
      const row = readRow(id);
      return row === undefined ? null : toMeasurement(row);
    },

    series: (kind) => rowsOf(kind).map(toMeasurement),

    latest: (kind) => {
      const row = db.driver.get<MeasurementRow>(
        `SELECT * FROM measurements
          WHERE workspace_id = ? AND kind = ? AND deleted_at IS NULL
          ORDER BY measured_on DESC, recorded_at DESC LIMIT 1`,
        [db.workspaceId, kind],
      );
      return row === undefined ? null : toMeasurement(row);
    },

    remove: (id) => {
      withWrite(db, (ctx) => {
        const current = readRow(id);
        if (current === undefined) throw new Error(`Misurazione inesistente: ${id}.`);
        // Tombstone, non DELETE: la cancellazione va propagata, e
        // rimuovere presto l'informazione sulla cancellazione e' vietato (§8).
        ctx.softDelete(
          'measurements',
          id,
          deleteOperation(current.revision + 1, current.revision, 'misurazione eliminata'),
        );
      });
    },

    movingAverage: (kind, windowDays = MOVING_AVERAGE_WINDOW_DAYS) => {
      const rows = rowsOf(kind);
      if (rows.length === 0) return [];

      // Piu' pesate nello stesso giorno: si media il giorno, poi si media la
      // finestra. Cosi' una giornata con tre pesate non pesa il triplo di una
      // con una sola; `observationCount` continua a contare le OSSERVAZIONI
      // reali, che e' il numero che la specifica chiede di mostrare.
      const perDay = new Map<LocalDate, { sum: number; count: number }>();
      for (const row of rows) {
        const day = perDay.get(row.measured_on) ?? { sum: 0, count: 0 };
        perDay.set(row.measured_on, { sum: day.sum + row.value, count: day.count + 1 });
      }

      const days = [...perDay.keys()].sort();
      const points: MovingAveragePoint[] = [];

      // Finestra scorrevole su due indici invece di una scansione per ogni
      // giorno: su tre anni di pesate quotidiane la differenza fra O(n) e
      // O(n^2) e' visibile all'apertura del grafico.
      let left = 0;
      let sumOfDailyMeans = 0;
      let observations = 0;

      for (let right = 0; right < days.length; right += 1) {
        const day = days[right];
        if (day === undefined) continue;
        const entry = perDay.get(day);
        if (entry === undefined) continue;
        sumOfDailyMeans += entry.sum / entry.count;
        observations += entry.count;

        const from = addDays(day, -(windowDays - 1));
        while (left <= right) {
          const oldest = days[left];
          if (oldest === undefined || oldest >= from) break;
          const leaving = perDay.get(oldest);
          if (leaving !== undefined) {
            sumOfDailyMeans -= leaving.sum / leaving.count;
            observations -= leaving.count;
          }
          left += 1;
        }

        const daysWithData = right - left + 1;
        if (daysWithData <= 0) continue; // non puo' accadere: `day` ha dati.
        points.push({
          date: day,
          // Media dei GIORNI con dati nella finestra. I giorni senza pesata
          // non compaiono ne' come zero ne' come valore interpolato.
          average: Math.round((sumOfDailyMeans / daysWithData) * 100) / 100,
          observationCount: observations,
        });
      }
      return points;
    },
  };
}

/** Riesportata: utile a chi costruisce l'asse dei grafici. */
export { diffDays };
