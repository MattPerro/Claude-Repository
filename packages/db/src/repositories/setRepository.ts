/**
 * Serie eseguite.
 *
 * Tre requisiti guidano questo file:
 *
 * - §10 "Il doppio tocco NON crea duplicati". Risolto con una chiave di
 *   idempotenza in SQL (`performed_sets.idempotency_key`, UNIQUE), non con un
 *   debounce nell'interfaccia. Un debounce non protegge da un rientro in
 *   primo piano, da un riavvio dell'app dopo il tocco, ne' da una ripresa di
 *   seduta: qui il secondo inserimento identico e' un `changes = 0`
 *   verificabile.
 * - §9 i confronti passano dalla chiave di comparabilita', che viene
 *   CALCOLATA alla conferma e CONSERVATA sulla riga.
 * - §3 un carico senza convenzione non ha significato, e `bodyweight` /
 *   `timeOnly` non hanno carico 0 ma carico non applicabile.
 */

import {
  comparabilityKey,
  requiresNoLoad,
  type BodySide,
  type Instant,
  type LoadConvention,
  type RecordedLoad,
  type SetMetric,
  type SetRole,
  type SetStatus,
} from '@trackstrong/core';

import { sqlBool } from '../driver.js';
import type { Database } from '../database.js';
import { rowPayload, upsertOperation, withWrite, type WriteContext } from '../unitOfWork.js';
import { toPerformedSet, type PerformedSetRow, type StoredPerformedSet } from '../rows.js';

/** Dati di una serie da registrare. */
export interface RecordSetInput {
  readonly sessionId: string;
  readonly performedExerciseId: string;
  /** Posizione fra le serie dell'esercizio, 1-based. */
  readonly order: number;
  readonly role: SetRole;
  /** Esercizio e variante: entrano nella chiave di comparabilita'. */
  readonly exerciseId: string;
  readonly variantId: string | null;
  readonly perSide: boolean;
  readonly load: RecordedLoad;
  readonly metric: SetMetric;
  readonly reps: number | null;
  readonly seconds: number | null;
  readonly side: BodySide;
  readonly rir: number | null;
  readonly note: string | null;
  readonly status: SetStatus;
  /** Istante della conferma. Obbligatorio per `status: 'completed'`. */
  readonly completedAt: Instant | null;
  /** `true` se il valore confermato era quello precompilato (§5, §10). */
  readonly prefilled?: boolean;
  /** ID da usare; se assente viene generato. Utile per l'import. */
  readonly id?: string;
}

export interface RecordSetResult {
  readonly set: StoredPerformedSet;
  /**
   * `false` quando la serie esisteva gia' con la stessa chiave di
   * idempotenza: e' il doppio tocco, ed e' un no-op.
   */
  readonly inserted: boolean;
}

/** La serie non e' registrabile come descritta. */
export class InvalidSetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidSetError';
  }
}

/**
 * Chiave di idempotenza di una serie.
 *
 * Derivata da (sessione, esercizio svolto, posizione, lato): due tocchi sullo
 * stesso pulsante "Completa serie" producono la stessa chiave, due serie
 * diverse no. Il lato e' parte della chiave perche' sullo step-up
 * destra e sinistra sono due serie distinte alla stessa posizione.
 */
export function setIdempotencyKey(input: {
  readonly sessionId: string;
  readonly performedExerciseId: string;
  readonly order: number;
  readonly side: BodySide;
}): string {
  return [input.sessionId, input.performedExerciseId, String(input.order), input.side].join('|');
}

export function setComparabilityKey(input: {
  readonly exerciseId: string;
  readonly variantId: string | null;
  readonly loadConvention: LoadConvention;
  readonly equipmentInstanceId: string | null;
  readonly metric: SetMetric;
  readonly perSide: boolean;
}): string {
  return comparabilityKey(input);
}

function validate(input: RecordSetInput): void {
  const { convention, kg, equipmentInstanceId } = input.load;

  if (requiresNoLoad(convention) && kg !== null) {
    throw new InvalidSetError(
      `La convenzione "${convention}" non ammette un carico (ricevuto ${String(kg)}). ` +
        'Un esercizio a corpo libero o a tempo non ha carico 0: ha carico non applicabile.',
    );
  }
  if (!requiresNoLoad(convention) && kg === null && input.status === 'completed') {
    throw new InvalidSetError(
      `La convenzione "${convention}" richiede un carico per una serie confermata. ` +
        'Un campo vuoto non diventa 0 (§3).',
    );
  }
  if ((convention === 'machineStack' || convention === 'assisted') && equipmentInstanceId === null) {
    throw new InvalidSetError(
      `La convenzione "${convention}" richiede l'attrezzo specifico: senza l'identita' ` +
        'della macchina il valore non e\' confrontabile (§9).',
    );
  }
  if (input.metric === 'reps' && input.seconds !== null) {
    throw new InvalidSetError('Una serie a ripetizioni non registra secondi.');
  }
  if (input.metric === 'seconds' && input.reps !== null) {
    throw new InvalidSetError('Una serie a tempo non registra ripetizioni.');
  }
  if (input.status === 'completed') {
    if (input.completedAt === null) {
      throw new InvalidSetError('Una serie confermata deve avere l\'istante di conferma.');
    }
    if (input.metric === 'reps' && input.reps === null) {
      throw new InvalidSetError('Una serie a ripetizioni confermata deve avere le ripetizioni.');
    }
    if (input.metric === 'seconds' && input.seconds === null) {
      throw new InvalidSetError('Una serie a tempo confermata deve avere i secondi.');
    }
  }
  if (!Number.isInteger(input.order) || input.order < 1) {
    throw new InvalidSetError(`Posizione della serie non valida: ${String(input.order)}.`);
  }
}

export interface SetRepository {
  /**
   * Registra una serie. Ripetere la chiamata con gli stessi
   * (sessione, esercizio, posizione, lato) NON crea un duplicato.
   */
  record(input: RecordSetInput): RecordSetResult;
  /** Come {@link record}, dentro una transazione gia' aperta. */
  recordIn(ctx: WriteContext, input: RecordSetInput): RecordSetResult;
  /** Correzione di una serie gia' registrata (§10: "Permetti: correzione"). */
  correct(
    setId: string,
    changes: { readonly reps?: number; readonly seconds?: number; readonly loadKg?: number | null; readonly rir?: number | null; readonly note?: string | null },
  ): StoredPerformedSet;
  /** Annullamento di una conferma accidentale: `status: 'voided'`. */
  void_(setId: string, reason: string | null): StoredPerformedSet;
  byId(setId: string): StoredPerformedSet | null;
  bySession(sessionId: string): readonly StoredPerformedSet[];
  /**
   * Ultima prestazione CONFRONTABILE: solo serie confermate con la stessa
   * chiave. Non restituisce mai una serie con chiave diversa.
   */
  lastComparable(key: string, options?: { readonly beforeSessionId?: string }): StoredPerformedSet | null;
  /** Serie confrontabili in ordine dalla piu' recente. */
  comparableHistory(key: string, limit?: number): readonly StoredPerformedSet[];
  /** Serie allenanti confermate di una sessione (bozze e annullate escluse). */
  countWorkingCompleted(sessionId: string): number;
}

export function createSetRepository(db: Database): SetRepository {
  const recordIn = (ctx: WriteContext, input: RecordSetInput): RecordSetResult => {
    validate(input);

    const key = setComparabilityKey({
      exerciseId: input.exerciseId,
      variantId: input.variantId,
      loadConvention: input.load.convention,
      equipmentInstanceId: input.load.equipmentInstanceId,
      metric: input.metric,
      perSide: input.perSide,
    });
    const idempotencyKey = setIdempotencyKey(input);

    const row = {
      id: input.id ?? db.ids.newId(),
      session_id: input.sessionId,
      performed_exercise_id: input.performedExerciseId,
      order_index: input.order,
      role: input.role,
      load_convention: input.load.convention,
      load_kg: input.load.kg,
      equipment_instance_id: input.load.equipmentInstanceId,
      metric: input.metric,
      reps: input.reps,
      seconds: input.seconds,
      side: input.side,
      rir: input.rir,
      note: input.note,
      status: input.status,
      completed_at: input.completedAt,
      comparability_key: key,
      idempotency_key: idempotencyKey,
      prefilled: sqlBool(input.prefilled ?? false),
      revision: 1,
      updated_at: ctx.now,
    };

    const { inserted } = ctx.insertIfAbsent(
      'performed_sets',
      row,
      upsertOperation(1, null, rowPayload(row), 'conferma serie'),
      ['idempotency_key'],
    );

    if (!inserted) {
      const existing = ctx.get<PerformedSetRow>(
        'SELECT * FROM performed_sets WHERE idempotency_key = ?',
        [idempotencyKey],
      );
      if (existing === undefined) {
        // Non puo' accadere: il conflitto e' su questa stessa chiave.
        throw new Error(
          'Conflitto di idempotenza su una serie che poi non risulta presente: ' +
            'incoerenza dello schema, va ispezionata.',
        );
      }
      return { set: toPerformedSet(existing), inserted: false };
    }

    const stored = ctx.get<PerformedSetRow>('SELECT * FROM performed_sets WHERE id = ?', [row.id]);
    if (stored === undefined) {
      throw new Error('La serie appena inserita non risulta leggibile.');
    }
    return { set: toPerformedSet(stored), inserted: true };
  };

  const read = (setId: string): PerformedSetRow | undefined =>
    db.driver.get<PerformedSetRow>('SELECT * FROM performed_sets WHERE id = ?', [setId]);

  return {
    record: (input) => withWrite(db, (ctx) => recordIn(ctx, input)),

    recordIn,

    correct: (setId, changes) =>
      withWrite(db, (ctx) => {
        const current = read(setId);
        if (current === undefined) {
          throw new InvalidSetError(`Serie inesistente: ${setId}.`);
        }
        const convention = current.load_convention as LoadConvention;

        if (changes.loadKg !== undefined && changes.loadKg !== null && requiresNoLoad(convention)) {
          throw new InvalidSetError(
            `La convenzione "${current.load_convention}" non ammette un carico.`,
          );
        }

        // Una correzione deve rispettare gli stessi vincoli di un
        // inserimento. Prima non lo faceva, e svuotare il campo carico di una
        // serie GIA' CONFERMATA la lasciava con `load_kg` nullo: il motore
        // adattivo trattava quel buco come "carico uniforme" e proponeva un
        // incremento citando un valore mai registrato.
        if (
          changes.loadKg !== undefined &&
          changes.loadKg === null &&
          !requiresNoLoad(convention) &&
          current.status === 'completed'
        ) {
          throw new InvalidSetError(
            `La convenzione "${current.load_convention}" richiede un carico per una serie confermata: ` +
              'non e\' possibile svuotare il campo. Se il carico era sbagliato, correggilo con il valore giusto; ' +
              'se la serie non va conteggiata, annullala.',
          );
        }
        const patch: Record<string, number | string | null> = {
          revision: current.revision + 1,
          updated_at: ctx.now,
          // Una correzione e' un valore digitato: non e' piu' "precompilato".
          prefilled: 0,
        };
        if (changes.reps !== undefined) patch['reps'] = changes.reps;
        if (changes.seconds !== undefined) patch['seconds'] = changes.seconds;
        if (changes.loadKg !== undefined) patch['load_kg'] = changes.loadKg;
        if (changes.rir !== undefined) patch['rir'] = changes.rir;
        if (changes.note !== undefined) patch['note'] = changes.note;

        ctx.patch(
          'performed_sets',
          setId,
          patch,
          upsertOperation(
            current.revision + 1,
            current.revision,
            { ...patch, id: setId },
            'correzione serie',
          ),
        );
        const updated = read(setId);
        if (updated === undefined) throw new Error('Serie non leggibile dopo la correzione.');
        return toPerformedSet(updated);
      }),

    void_: (setId, reason) =>
      withWrite(db, (ctx) => {
        const current = read(setId);
        if (current === undefined) {
          throw new InvalidSetError(`Serie inesistente: ${setId}.`);
        }
        // `voided` e non DELETE: la serie e' stata confermata, e il fatto che
        // sia stata annullata e' a sua volta un fatto da conservare (§10).
        const patch = {
          status: 'voided',
          note: reason ?? current.note,
          revision: current.revision + 1,
          updated_at: ctx.now,
        };
        ctx.patch(
          'performed_sets',
          setId,
          patch,
          upsertOperation(
            current.revision + 1,
            current.revision,
            { ...patch, id: setId },
            'annullamento serie',
          ),
        );
        const updated = read(setId);
        if (updated === undefined) throw new Error('Serie non leggibile dopo l\'annullamento.');
        return toPerformedSet(updated);
      }),

    byId: (setId) => {
      const row = read(setId);
      return row === undefined ? null : toPerformedSet(row);
    },

    bySession: (sessionId) =>
      db.driver
        .all<PerformedSetRow>(
          `SELECT ps.* FROM performed_sets ps
             JOIN performed_exercises pe ON pe.id = ps.performed_exercise_id
            WHERE ps.session_id = ?
            ORDER BY pe.order_index, ps.order_index, ps.side`,
          [sessionId],
        )
        .map(toPerformedSet),

    lastComparable: (key, options) => {
      // Solo `completed`: una bozza, una serie saltata o una annullata non
      // sono una prestazione (§5, §10).
      const params: (string | number)[] = [key];
      let sql =
        "SELECT * FROM performed_sets WHERE comparability_key = ? AND status = 'completed'";
      if (options?.beforeSessionId !== undefined) {
        sql += ' AND session_id <> ?';
        params.push(options.beforeSessionId);
      }
      sql += ' ORDER BY completed_at DESC, id DESC LIMIT 1';
      const row = db.driver.get<PerformedSetRow>(sql, params);
      return row === undefined ? null : toPerformedSet(row);
    },

    comparableHistory: (key, limit = 20) =>
      db.driver
        .all<PerformedSetRow>(
          `SELECT * FROM performed_sets
            WHERE comparability_key = ? AND status = 'completed'
            ORDER BY completed_at DESC, id DESC
            LIMIT ?`,
          [key, limit],
        )
        .map(toPerformedSet),

    countWorkingCompleted: (sessionId) => {
      const row = db.driver.get<{ n: number }>(
        `SELECT COUNT(*) AS n FROM performed_sets
          WHERE session_id = ? AND role = 'working' AND status = 'completed'`,
        [sessionId],
      );
      return row?.n ?? 0;
    },
  };
}
