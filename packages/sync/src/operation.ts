/**
 * Registro delle operazioni di sincronizzazione (specifica §8.1).
 *
 * Un'operazione e' un **fatto immutabile** e **applicabile una sola volta**.
 * Nasce nella stessa transazione della modifica ai dati locali (specifica §7)
 * e resta nel registro finche' non e' stata inviata e confermata.
 *
 * Tre invarianti guidano il formato:
 *
 *  1. `id` e' un ULID generato **sul dispositivo** che crea l'operazione. E' la
 *     chiave di idempotenza: se la risposta di rete si perde e il client
 *     ritenta, l'operazione che arriva due volte ha lo stesso `id` e viene
 *     applicata una volta sola.
 *  2. Il conflitto si rileva su `baseRevision`, **non sull'orologio**. Due
 *     dispositivi che partono dalla stessa `baseRevision` e producono la stessa
 *     `newRevision` hanno divergenza; chi ha l'orologio avanti non "vince".
 *  3. `lamport` (contatore logico monotono per dispositivo) fornisce
 *     l'ordinamento causale, e `causalDeps` permette di riconoscere una
 *     ricezione fuori ordine: se le dipendenze non sono ancora applicate,
 *     l'operazione resta in attesa invece di essere applicata su una base
 *     sbagliata.
 *
 * `createdAt` esiste **solo** per diagnostica e per l'ordinamento di
 * presentazione. Nessuna regola di questo pacchetto lo usa per decidere quale
 * modifica vince (divieto esplicito della specifica §8.1).
 */

import type { DeviceId, Instant, WorkspaceId } from '@trackstrong/core';
import { isUlid } from '@trackstrong/core';

/** Versione del formato dei dati trasportati nel `payload`. */
export const SYNC_FORMAT_VERSION = 1;

/**
 * Numero massimo di dipendenze causali trasportate da un'operazione.
 *
 * `causalDeps` e' deliberatamente **breve**: non e' un vettore di versioni
 * completo, ma l'elenco delle ultime operazioni che l'autore aveva applicato
 * *sulla stessa entita'*. Basta per riconoscere "mi manca qualcosa" senza far
 * crescere il pacchetto in modo illimitato.
 */
export const MAX_CAUSAL_DEPS = 8;

/** Identificativo di un'operazione (ULID). */
export type OperationId = string;

export type OperationKind = 'upsert' | 'delete';

/**
 * Entita' sincronizzabili (specifica §7, elenco delle entita' da modellare).
 * Unione chiusa: aggiungere un tipo obbliga a rivedere le regole di conflitto.
 */
export type SyncEntityType =
  | 'profile'
  | 'workspace'
  | 'device'
  | 'exercise'
  | 'exerciseVariant'
  | 'equipment'
  | 'programPlan'
  | 'programBlock'
  | 'programWeek'
  | 'prescription'
  | 'plannedEvent'
  | 'session'
  | 'performedExercise'
  | 'performedSet'
  | 'bodyMeasurement'
  | 'checkIn'
  | 'trackDay'
  | 'coachProposal'
  | 'setting';

const ENTITY_TYPES: readonly SyncEntityType[] = [
  'profile',
  'workspace',
  'device',
  'exercise',
  'exerciseVariant',
  'equipment',
  'programPlan',
  'programBlock',
  'programWeek',
  'prescription',
  'plannedEvent',
  'session',
  'performedExercise',
  'performedSet',
  'bodyMeasurement',
  'checkIn',
  'trackDay',
  'coachProposal',
  'setting',
];

export function isSyncEntityType(value: unknown): value is SyncEntityType {
  return typeof value === 'string' && (ENTITY_TYPES as readonly string[]).includes(value);
}

/**
 * Campi modificati dall'operazione.
 *
 * E' un **delta**, non l'entita' intera: e' cio' che permette l'unione
 * automatica di modifiche su campi disgiunti (specifica §8.2). Se due
 * dispositivi toccano campi diversi della stessa entita', i due delta si
 * sommano senza conflitto.
 */
export type OperationPayload = Readonly<Record<string, unknown>>;

export interface SyncOperation {
  /** ULID generato sul dispositivo di origine: chiave di idempotenza. */
  readonly id: OperationId;
  /** Dispositivo che ha creato l'operazione. */
  readonly origin: DeviceId;
  readonly workspaceId: WorkspaceId;
  readonly entityType: SyncEntityType;
  readonly entityId: string;
  readonly kind: OperationKind;
  /**
   * Revisione dell'entita' su cui l'autore si e' basato. `0` per una
   * creazione. E' il criterio con cui si rileva un conflitto **senza usare
   * l'orologio**.
   */
  readonly baseRevision: number;
  /** Revisione risultante dopo l'applicazione. */
  readonly newRevision: number;
  /** Campi modificati. `null` per `delete`. */
  readonly payload: OperationPayload | null;
  readonly formatVersion: number;
  /**
   * Istante di creazione sul dispositivo di origine.
   * SOLO diagnostica e ordinamento di presentazione: NON decide chi vince un
   * conflitto (specifica §8.1).
   */
  readonly createdAt: Instant;
  /** Contatore logico monotono del dispositivo di origine. */
  readonly lamport: number;
  /** Operazioni sulla stessa entita' che l'autore aveva gia' applicato. */
  readonly causalDeps: readonly OperationId[];
}

/**
 * Contatore di Lamport per dispositivo.
 *
 * `next()` restituisce un valore strettamente maggiore di qualunque valore
 * osservato, incluso quello delle operazioni ricevute dagli altri dispositivi:
 * e' cosi' che l'ordinamento riflette la causalita' invece dell'orologio.
 */
export class LamportCounter {
  private value: number;

  constructor(start = 0) {
    if (!Number.isInteger(start) || start < 0) {
      throw new Error(`Valore di Lamport non valido: ${String(start)}.`);
    }
    this.value = start;
  }

  /** Massimo osservato finora. */
  current(): number {
    return this.value;
  }

  /** Registra un valore visto da un altro dispositivo. */
  observe(seen: number): void {
    if (Number.isInteger(seen) && seen > this.value) this.value = seen;
  }

  /** Prossimo valore da assegnare a un'operazione locale. */
  next(): number {
    this.value += 1;
    return this.value;
  }
}

export interface NewOperationInput {
  readonly entityType: SyncEntityType;
  readonly entityId: string;
  readonly kind: OperationKind;
  readonly baseRevision: number;
  readonly payload?: OperationPayload | null;
  /** Dipendenze causali note sulla stessa entita'. Verranno troncate. */
  readonly causalDeps?: readonly OperationId[];
  /** Solo per migrazioni: per difetto {@link SYNC_FORMAT_VERSION}. */
  readonly formatVersion?: number;
}

export interface OperationFactoryDeps {
  readonly origin: DeviceId;
  readonly workspaceId: WorkspaceId;
  readonly newId: () => OperationId;
  readonly now: () => Instant;
  readonly lamport: LamportCounter;
}

/**
 * Costruisce un'operazione valida.
 *
 * `newRevision` non e' un parametro: e' sempre `baseRevision + 1`. Una
 * revisione salta solo quando un'operazione remota viene applicata, e in quel
 * caso la revisione arriva dall'operazione stessa.
 */
export function createOperation(
  input: NewOperationInput,
  deps: OperationFactoryDeps,
): SyncOperation {
  if (!Number.isInteger(input.baseRevision) || input.baseRevision < 0) {
    throw new Error(`baseRevision non valida: ${String(input.baseRevision)}.`);
  }
  if (input.kind === 'delete' && input.payload != null) {
    throw new Error("Un'operazione 'delete' non trasporta payload.");
  }
  if (input.kind === 'upsert' && (input.payload == null || Object.keys(input.payload).length === 0)) {
    throw new Error("Un'operazione 'upsert' deve trasportare almeno un campo.");
  }
  const deps0 = input.causalDeps ?? [];
  return Object.freeze({
    id: deps.newId(),
    origin: deps.origin,
    workspaceId: deps.workspaceId,
    entityType: input.entityType,
    entityId: input.entityId,
    kind: input.kind,
    baseRevision: input.baseRevision,
    newRevision: input.baseRevision + 1,
    payload: input.kind === 'delete' ? null : Object.freeze({ ...input.payload }),
    formatVersion: input.formatVersion ?? SYNC_FORMAT_VERSION,
    createdAt: deps.now(),
    lamport: deps.lamport.next(),
    // Le dipendenze piu' recenti sono le piu' informative: tronca dalla coda.
    causalDeps: Object.freeze(deps0.slice(-MAX_CAUSAL_DEPS)),
  });
}

/** Campi toccati dall'operazione. Vuoto per un `delete`. */
export function changedFields(op: SyncOperation): readonly string[] {
  if (op.kind === 'delete' || op.payload === null) return [];
  return Object.keys(op.payload);
}

/**
 * Tie-break **deterministico** per l'ordinamento: `(lamport, origin, id)`.
 *
 * ATTENZIONE: e' un criterio di **ordinamento**, non un giudizio su quale
 * modifica sia giusta. Serve perche' due dispositivi che applicano lo stesso
 * insieme di operazioni ottengano lo stesso risultato. Quando due modifiche
 * sono davvero incompatibili la decisione NON viene presa qui: si materializza
 * un conflitto e si chiede all'utente (specifica §8.2).
 */
export function compareForOrdering(a: SyncOperation, b: SyncOperation): number {
  if (a.lamport !== b.lamport) return a.lamport - b.lamport;
  if (a.origin !== b.origin) return a.origin < b.origin ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

/**
 * Ordinamento di **presentazione** per l'interfaccia (cronologia leggibile).
 * Usa `createdAt`, quindi NON va usato per decidere l'applicazione.
 */
export function compareForPresentation(a: SyncOperation, b: SyncOperation): number {
  if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
  return compareForOrdering(a, b);
}

/**
 * Ordina un insieme di operazioni in modo causalmente coerente.
 *
 * Ordinamento topologico sulle `causalDeps` presenti nell'insieme, con
 * {@link compareForOrdering} come tie-break stabile. Le dipendenze che non
 * sono nell'insieme vengono ignorate qui: e' il motore che decide se
 * l'operazione e' applicabile o se deve restare in attesa.
 */
export function sortOperationsCausally(
  ops: readonly SyncOperation[],
): readonly SyncOperation[] {
  const byId = new Map<OperationId, SyncOperation>();
  for (const op of ops) byId.set(op.id, op);

  const out: SyncOperation[] = [];
  const state = new Map<OperationId, 'visiting' | 'done'>();
  const candidates = [...ops].sort(compareForOrdering);

  const visit = (op: SyncOperation): void => {
    const s = state.get(op.id);
    if (s === 'done') return;
    // 'visiting' = ciclo fra dipendenze (non dovrebbe accadere: gli ULID sono
    // generati prima delle dipendenze che li citano). Non blocchiamo la sync:
    // si ricade sul tie-break deterministico.
    if (s === 'visiting') return;
    state.set(op.id, 'visiting');
    const deps = op.causalDeps
      .map((id) => byId.get(id))
      .filter((d): d is SyncOperation => d !== undefined)
      .sort(compareForOrdering);
    for (const dep of deps) visit(dep);
    state.set(op.id, 'done');
    out.push(op);
  };

  for (const op of candidates) visit(op);
  return out;
}

/** Estremi del contatore logico in un insieme di operazioni. */
export interface LamportRange {
  readonly min: number;
  readonly max: number;
}

export function lamportRange(ops: readonly SyncOperation[]): LamportRange {
  if (ops.length === 0) return { min: 0, max: 0 };
  let min = Number.POSITIVE_INFINITY;
  let max = 0;
  for (const op of ops) {
    if (op.lamport < min) min = op.lamport;
    if (op.lamport > max) max = op.lamport;
  }
  return { min, max };
}

/** Problema riscontrato nella validazione di un'operazione. */
export interface OperationDefect {
  readonly field: string;
  readonly message: string;
}

/**
 * Validazione rigorosa di un'operazione arrivata dalla rete.
 *
 * Restituisce l'elenco dei difetti invece di lanciare: un'operazione
 * malformata in un pacchetto non deve interrompere l'applicazione delle altre
 * ne' toccare i dati locali (specifica §14).
 */
export function validateOperation(value: unknown): readonly OperationDefect[] {
  const defects: OperationDefect[] = [];
  const fail = (field: string, message: string): void => {
    defects.push({ field, message });
  };
  if (typeof value !== 'object' || value === null) {
    return [{ field: '.', message: "L'operazione non e' un oggetto." }];
  }
  const o = value as Record<string, unknown>;

  if (typeof o['id'] !== 'string' || !isUlid(o['id'])) fail('id', 'ID non e un ULID valido.');
  if (typeof o['origin'] !== 'string' || o['origin'].length === 0) {
    fail('origin', 'Dispositivo di origine assente.');
  }
  if (typeof o['workspaceId'] !== 'string' || o['workspaceId'].length === 0) {
    fail('workspaceId', 'Archivio di appartenenza assente.');
  }
  if (!isSyncEntityType(o['entityType'])) fail('entityType', 'Tipo di entita sconosciuto.');
  if (typeof o['entityId'] !== 'string' || o['entityId'].length === 0) {
    fail('entityId', 'Entita di destinazione assente.');
  }
  const kind = o['kind'];
  if (kind !== 'upsert' && kind !== 'delete') fail('kind', 'Tipo di operazione sconosciuto.');

  const base = o['baseRevision'];
  const next = o['newRevision'];
  if (!Number.isInteger(base) || (base as number) < 0) {
    fail('baseRevision', 'Revisione di base non valida.');
  }
  if (!Number.isInteger(next) || (next as number) <= 0) {
    fail('newRevision', 'Revisione risultante non valida.');
  }
  if (Number.isInteger(base) && Number.isInteger(next) && (next as number) <= (base as number)) {
    fail('newRevision', 'La revisione risultante deve superare quella di base.');
  }

  if (kind === 'delete') {
    if (o['payload'] !== null) fail('payload', "Un 'delete' non trasporta payload.");
  } else if (typeof o['payload'] !== 'object' || o['payload'] === null || Array.isArray(o['payload'])) {
    fail('payload', "Un 'upsert' deve trasportare un oggetto di campi.");
  } else if (Object.keys(o['payload'] as object).length === 0) {
    fail('payload', "Un 'upsert' deve modificare almeno un campo.");
  }

  if (!Number.isInteger(o['formatVersion']) || (o['formatVersion'] as number) < 1) {
    fail('formatVersion', 'Versione del formato non valida.');
  }
  if (typeof o['createdAt'] !== 'number' || !Number.isFinite(o['createdAt'])) {
    fail('createdAt', 'Istante di creazione non valido.');
  }
  if (!Number.isInteger(o['lamport']) || (o['lamport'] as number) < 1) {
    fail('lamport', 'Contatore logico non valido.');
  }
  const deps = o['causalDeps'];
  if (!Array.isArray(deps)) {
    fail('causalDeps', 'Dipendenze causali non valide.');
  } else if (deps.length > MAX_CAUSAL_DEPS) {
    fail('causalDeps', `Troppe dipendenze causali (max ${String(MAX_CAUSAL_DEPS)}).`);
  } else if (!deps.every((d) => typeof d === 'string' && isUlid(d))) {
    fail('causalDeps', 'Dipendenza causale non e un ULID valido.');
  }

  return defects;
}

/** Vero se il valore e' un'operazione strutturalmente valida. */
export function isSyncOperation(value: unknown): value is SyncOperation {
  return validateOperation(value).length === 0;
}
