/**
 * Risoluzione dei conflitti (specifica §8.2).
 *
 * Regole esplicite, in quest'ordine:
 *
 *  1. **Modifiche indipendenti** - entita' diverse, oppure campi disgiunti
 *     della stessa entita' - si uniscono in automatico. Una nuova pesata e un
 *     nuovo allenamento vanno **entrambi** conservati.
 *  2. **Stesso campo, `baseRevision` divergente** - conflitto
 *     **materializzato**: entrambe le alternative finiscono nella tabella dei
 *     conflitti e nessuna viene scartata in silenzio. Caso di riferimento
 *     della specifica: la stessa serie corretta a 8 ripetizioni su un
 *     dispositivo e a 10 sull'altro.
 *  3. **Modifica contro eliminazione** - la cancellazione **non** vince in
 *     automatico: si materializza un conflitto e si chiede.
 *  4. **Revisioni concorrenti del programma** - due `ProgramPlan` con la stessa
 *     `version` da origini diverse: conflitto, e le due revisioni si possono
 *     conservare come versioni distinte, senza distruggere nulla.
 *  5. **Seduta in corso** - un'operazione remota su una sessione con
 *     `status === 'active'` su un altro dispositivo **non** viene applicata in
 *     automatico: richiede conferma.
 *
 * ## Cosa NON decide un conflitto
 *
 * Nessuna regola di questo file usa `createdAt` come criterio di vittoria: il
 * solo orologio del dispositivo non decide chi vince (divieto esplicito della
 * specifica §8.1). Quando serve un ordine deterministico si usa
 * {@link compareForOrdering}, cioe' `(lamport, origin, operationId)`, e resta
 * un **tie-break di ordinamento**: serve perche' due dispositivi che hanno
 * visto le stesse operazioni arrivino allo stesso stato, NON e' un giudizio su
 * quale modifica sia quella giusta. Quel giudizio e' sempre dell'utente.
 */

import type { DeviceId, Instant, WorkspaceId } from '@trackstrong/core';
import { formatDecimalIt } from '@trackstrong/core';
import {
  changedFields,
  compareForOrdering,
  type OperationId,
  type OperationKind,
  type SyncEntityType,
  type SyncOperation,
} from './operation.js';

// ---------------------------------------------------------------------------
// Stato materializzato di un'entita'
// ---------------------------------------------------------------------------

/**
 * Da quale operazione arriva il valore attuale di un campo.
 *
 * La marcatura **per campo** e' cio' che rende possibile l'unione automatica:
 * senza di essa non si potrebbe distinguere "hai toccato un campo che non
 * avevo cambiato" da "hai toccato lo stesso campo che avevo cambiato io".
 */
export interface FieldStamp {
  /** Revisione dell'entita' a cui il campo e' stato impostato. */
  readonly revision: number;
  readonly operationId: OperationId;
  readonly origin: DeviceId;
  readonly lamport: number;
}

export interface EntityRecord {
  readonly workspaceId: WorkspaceId;
  readonly entityType: SyncEntityType;
  readonly entityId: string;
  /** Revisione corrente dell'entita'. */
  readonly revision: number;
  readonly fields: Readonly<Record<string, unknown>>;
  readonly fieldStamps: Readonly<Record<string, FieldStamp>>;
  /** Tombstone: l'entita' e' eliminata ma il fatto resta registrato. */
  readonly deleted: boolean;
  readonly deletedByOperationId: OperationId | null;
  /** Revisione a cui e' avvenuta l'eliminazione. `0` se mai eliminata. */
  readonly deletedAtRevision: number;
  /** Istante dell'eliminazione: serve SOLO alla politica di conservazione. */
  readonly deletedAt: Instant | null;
  readonly lastOperationId: OperationId;
  readonly lamport: number;
}

// ---------------------------------------------------------------------------
// Conflitti
// ---------------------------------------------------------------------------

export type ConflictReason =
  /** Stesso campo, revisioni di base divergenti. */
  | 'stesso-campo-divergente'
  /** Una modifica e un'eliminazione concorrenti. */
  | 'modifica-vs-eliminazione'
  /** Due revisioni del programma con la stessa `version`. */
  | 'revisioni-concorrenti-programma'
  /** Modifica remota su una seduta in corso su un altro dispositivo. */
  | 'seduta-in-corso';

export interface ConflictAlternative {
  readonly operationId: OperationId;
  readonly origin: DeviceId;
  readonly lamport: number;
  readonly kind: OperationKind;
  /** Entita' a cui si riferisce (diversa dall'altra nelle revisioni del programma). */
  readonly entityId: string;
  /** Valore proposto per il campo in conflitto. `null` per un'eliminazione. */
  readonly value: unknown;
  /** Solo diagnostica: non decide nulla. `null` se non ricostruibile. */
  readonly createdAt: Instant | null;
  /** Testo italiano che descrive questa alternativa all'utente. */
  readonly label: string;
}

export interface Conflict {
  readonly id: string;
  readonly workspaceId: WorkspaceId;
  readonly entityType: SyncEntityType;
  readonly entityId: string;
  /** Campo contestato. `null` per i conflitti che riguardano l'entita' intera. */
  readonly field: string | null;
  readonly reason: ConflictReason;
  /** Due o piu' alternative. **Nessuna viene scartata.** */
  readonly alternatives: readonly ConflictAlternative[];
  /** Domanda in italiano, comprensibile, da mostrare per la scelta. */
  readonly question: string;
  readonly detectedAt: Instant;
  /**
   * Vero se le alternative possono coesistere senza perdere nulla (per esempio
   * due revisioni del programma conservate come versioni distinte).
   */
  readonly nonDestructive: boolean;
  readonly resolvedWithOperationId: OperationId | null;
  readonly resolvedAt: Instant | null;
}

// ---------------------------------------------------------------------------
// Testi italiani
// ---------------------------------------------------------------------------

const ENTITY_LABEL: Record<SyncEntityType, string> = {
  profile: 'il profilo',
  workspace: "l'archivio",
  device: 'il dispositivo',
  exercise: "l'esercizio",
  exerciseVariant: "la variante di esercizio",
  equipment: "l'attrezzatura",
  programPlan: 'il programma',
  programBlock: 'il blocco del programma',
  programWeek: 'la settimana del programma',
  prescription: 'la prescrizione',
  plannedEvent: "l'evento pianificato",
  session: 'la seduta',
  performedExercise: "l'esercizio svolto",
  performedSet: 'la serie',
  bodyMeasurement: 'la misurazione',
  checkIn: 'il check-in',
  trackDay: 'la giornata in pista',
  coachProposal: 'la proposta del coach',
  setting: "l'impostazione",
};

const FIELD_LABEL: Record<string, string> = {
  reps: 'le ripetizioni',
  weightKg: 'il carico',
  loadKg: 'il carico',
  rir: 'il RIR',
  rpe: "l'RPE",
  status: 'lo stato',
  note: 'la nota',
  restSeconds: 'il recupero',
  bodyweightKg: 'il peso corporeo',
  waistCm: 'la circonferenza vita',
  version: 'la versione',
  plannedDate: 'la data prevista',
  performedDate: 'la data di svolgimento',
  technique: 'la tecnica',
  sleepHours: 'le ore di sonno',
};

/** Etichetta italiana di un campo, con ricaduta sul nome tecnico. */
export function fieldLabelIt(field: string): string {
  return FIELD_LABEL[field] ?? `il campo "${field}"`;
}

/** Etichetta italiana di un tipo di entita'. */
export function entityLabelIt(entityType: SyncEntityType): string {
  return ENTITY_LABEL[entityType];
}

/** Rappresentazione leggibile di un valore, con virgola decimale italiana. */
export function describeValueIt(value: unknown): string {
  if (value === null || value === undefined) return 'vuoto';
  if (typeof value === 'number') return formatDecimalIt(value);
  if (typeof value === 'boolean') return value ? 'si' : 'no';
  if (typeof value === 'string') return value.length === 0 ? 'vuoto' : `"${value}"`;
  return JSON.stringify(value) ?? 'valore complesso';
}

function deviceLabel(origin: DeviceId): string {
  return `dispositivo ${origin}`;
}

// ---------------------------------------------------------------------------
// Risoluzione
// ---------------------------------------------------------------------------

export type ResolutionKind =
  /** Applicata (creazione, avanzamento lineare o unione automatica). */
  | 'applicata'
  /** Applicata in parte, con uno o piu' conflitti materializzati. */
  | 'conflitto'
  /** Non applicabile adesso: resta in attesa (fuori ordine o da confermare). */
  | 'in-attesa'
  /** Nessun effetto. */
  | 'ignorata';

export type ResolutionReason =
  | 'creazione'
  | 'avanzamento-lineare'
  | 'unione-campi-disgiunti'
  | 'valore-convergente'
  | 'eliminazione'
  | 'eliminazione-gia-applicata'
  | 'stesso-campo-divergente'
  | 'modifica-vs-eliminazione'
  | 'revisioni-concorrenti-programma'
  | 'seduta-in-corso'
  | 'dipendenze-mancanti'
  | 'gia-applicata'
  | 'archivio-diverso';

export interface Resolution {
  readonly kind: ResolutionKind;
  /** Record da persistere. `null` se non cambia nulla. */
  readonly record: EntityRecord | null;
  /** Conflitti materializzati. Entrambe le alternative sono conservate. */
  readonly conflicts: readonly Conflict[];
  /** Campi uniti in automatico. */
  readonly mergedFields: readonly string[];
  /** Campi su cui la scelta e' rinviata all'utente. */
  readonly contestedFields: readonly string[];
  /**
   * Vero se l'operazione va registrata nel registro delle applicate.
   * Per le operazioni in attesa e' `false`: non sono state applicate.
   */
  readonly markApplied: boolean;
  readonly reason: ResolutionReason;
  /** Spiegazione in italiano, utile nei log diagnostici e nei test. */
  readonly explanation: string;
}

export interface ResolveInput {
  readonly incoming: SyncOperation;
  /** Stato locale dell'entita', `null` se mai vista. */
  readonly current: EntityRecord | null;
  /** Dispositivo su cui gira questo motore. */
  readonly localDeviceId: DeviceId;
  readonly workspaceId: WorkspaceId;
  /** Istante di rilevamento, solo per la diagnostica del conflitto. */
  readonly now: Instant;
  readonly newConflictId: () => string;
  /**
   * Altri record dello stesso tipo, necessari **solo** per le revisioni
   * concorrenti del programma (confronto fra entita' diverse).
   */
  readonly siblings?: readonly EntityRecord[];
}

/**
 * Applica le regole della specifica §8.2 a una singola operazione in arrivo.
 *
 * Il chiamante ha gia' verificato l'idempotenza (`markApplied` su un'operazione
 * gia' presente nel registro non arriva qui) e ha gia' verificato le
 * dipendenze causali presenti nell'insieme.
 */
export function resolveIncoming(input: ResolveInput): Resolution {
  const op = input.incoming;

  if (op.workspaceId !== input.workspaceId) {
    return ignored(
      'archivio-diverso',
      `L operazione appartiene all archivio ${op.workspaceId} e non viene applicata.`,
    );
  }

  const current = input.current;

  // --- 5. Seduta in corso: mai modificata da remoto senza conferma. ---------
  // Va controllata per prima: nemmeno un'eliminazione remota puo' toccare una
  // seduta che l'utente sta svolgendo su un altro dispositivo.
  if (current !== null && !current.deleted && isProtectedActiveSession(current, op, input.localDeviceId)) {
    const owner = ownerOf(current, input.localDeviceId);
    const conflict: Conflict = {
      id: input.newConflictId(),
      workspaceId: input.workspaceId,
      entityType: op.entityType,
      entityId: op.entityId,
      field: null,
      reason: 'seduta-in-corso',
      alternatives: [
        {
          operationId: current.lastOperationId,
          origin: owner,
          lamport: current.lamport,
          kind: 'upsert',
          entityId: current.entityId,
          value: current.fields,
          createdAt: null,
          label: `Continuare la seduta in corso su ${deviceLabel(owner)} senza modifiche`,
        },
        {
          operationId: op.id,
          origin: op.origin,
          lamport: op.lamport,
          kind: op.kind,
          entityId: op.entityId,
          value: op.payload,
          createdAt: op.createdAt,
          label:
            op.kind === 'delete'
              ? `Eliminare la seduta come chiesto da ${deviceLabel(op.origin)}`
              : `Applicare le modifiche arrivate da ${deviceLabel(op.origin)}`,
        },
      ],
      question:
        'Una seduta e in corso su questo dispositivo e sono arrivate modifiche da ' +
        `${deviceLabel(op.origin)}. Vuoi applicarle adesso o al termine della seduta? ` +
        'Nulla viene modificato senza la tua conferma.',
      detectedAt: input.now,
      nonDestructive: true,
      resolvedWithOperationId: null,
      resolvedAt: null,
    };
    return {
      kind: 'in-attesa',
      record: null,
      conflicts: [conflict],
      mergedFields: [],
      contestedFields: [],
      markApplied: false,
      reason: 'seduta-in-corso',
      explanation:
        'Modifica remota su una seduta in corso: resta in attesa di conferma esplicita ' +
        '(specifica §8.2).',
    };
  }

  // --- Entita' mai vista --------------------------------------------------
  if (current === null) {
    if (op.baseRevision > 0) {
      // Manca lo storico su cui l'autore si e' basato: applicare adesso
      // significherebbe costruire l'entita' su una base sbagliata.
      return deferred(
        'dipendenze-mancanti',
        `Ricevuta una modifica basata sulla revisione ${String(op.baseRevision)} di ` +
          `un entita mai vista: resta in attesa delle operazioni precedenti.`,
      );
    }
    if (op.kind === 'delete') {
      // Eliminazione di qualcosa che non abbiamo mai avuto: si registra
      // comunque la tombstone, altrimenti un pacchetto arrivato in ordine
      // inverso farebbe ricomparire il dato.
      return {
        kind: 'applicata',
        record: tombstoneFromDelete(op, null, input.workspaceId),
        conflicts: [],
        mergedFields: [],
        contestedFields: [],
        markApplied: true,
        reason: 'eliminazione',
        explanation:
          'Eliminazione registrata come tombstone anche senza il dato originale: ' +
          'evita la resurrezione se le operazioni arrivano in ordine inverso.',
      };
    }
    const created = createRecord(op, input.workspaceId);
    const programConflict = detectConcurrentProgramVersions(op, created, input);
    if (programConflict !== null) {
      return {
        kind: 'conflitto',
        // Entrambe le revisioni restano: la nuova viene creata, la vecchia
        // non viene toccata. Nessuna perdita.
        record: created,
        conflicts: [programConflict],
        mergedFields: Object.keys(created.fields),
        contestedFields: ['version'],
        markApplied: true,
        reason: 'revisioni-concorrenti-programma',
        explanation:
          'Due revisioni del programma con la stessa versione da origini diverse: ' +
          'conservate entrambe come versioni distinte, la scelta e rinviata all utente.',
      };
    }
    return {
      kind: 'applicata',
      record: created,
      conflicts: [],
      mergedFields: Object.keys(created.fields),
      contestedFields: [],
      markApplied: true,
      reason: 'creazione',
      explanation: 'Creazione applicata: nessuno stato locale precedente.',
    };
  }

  // --- Dipendenze mancanti: la base e' piu' avanti di quello che abbiamo ---
  if (op.baseRevision > current.revision) {
    return deferred(
      'dipendenze-mancanti',
      `Modifica basata sulla revisione ${String(op.baseRevision)}, localmente siamo alla ` +
        `${String(current.revision)}: resta in attesa delle operazioni intermedie.`,
    );
  }

  // --- 3. Modifica contro eliminazione ------------------------------------
  if (current.deleted) {
    if (op.kind === 'delete') {
      return ignored(
        'eliminazione-gia-applicata',
        'Eliminazione gia registrata: nessun effetto.',
      );
    }
    if (op.baseRevision >= current.deletedAtRevision) {
      // L'autore **aveva visto** l'eliminazione e ricrea deliberatamente:
      // non e' una resurrezione accidentale.
      const revived = applyUpsert(current, op, changedFields(op));
      return {
        kind: 'applicata',
        record: {
          ...revived,
          deleted: false,
          deletedByOperationId: null,
          deletedAtRevision: 0,
          deletedAt: null,
        },
        conflicts: [],
        mergedFields: changedFields(op),
        contestedFields: [],
        markApplied: true,
        reason: 'avanzamento-lineare',
        explanation:
          'Ricreazione deliberata: l autore si e basato su una revisione successiva ' +
          'all eliminazione.',
      };
    }
    // L'autore NON aveva visto l'eliminazione. La cancellazione **non** vince
    // in automatico, ma il dato **non** riappare: si chiede.
    const conflict = buildConflict({
      input,
      field: null,
      reason: 'modifica-vs-eliminazione',
      alternatives: [
        {
          operationId: current.deletedByOperationId ?? current.lastOperationId,
          origin: current.fieldStamps['__deleted__']?.origin ?? input.localDeviceId,
          lamport: current.lamport,
          kind: 'delete',
          entityId: current.entityId,
          value: null,
          createdAt: current.deletedAt,
          label: `Mantenere l eliminazione (${entityLabelIt(op.entityType)} resta eliminata)`,
        },
        {
          operationId: op.id,
          origin: op.origin,
          lamport: op.lamport,
          kind: 'upsert',
          entityId: op.entityId,
          value: op.payload,
          createdAt: op.createdAt,
          label: `Ripristinare con le modifiche di ${deviceLabel(op.origin)}`,
        },
      ],
      question:
        `${capitalize(entityLabelIt(op.entityType))} e stata eliminata su un dispositivo e ` +
        `modificata su un altro (${deviceLabel(op.origin)}). ` +
        'Finche non scegli, il dato resta eliminato e la modifica resta conservata qui: ' +
        'non viene scartata.',
      nonDestructive: false,
    });
    return {
      kind: 'conflitto',
      // Il record NON cambia: niente resurrezione automatica.
      record: null,
      conflicts: [conflict],
      mergedFields: [],
      contestedFields: [],
      // L'operazione e' stata *considerata* e materializzata in un conflitto:
      // registrarla evita di rimaterializzare lo stesso conflitto a ogni pull.
      markApplied: true,
      reason: 'modifica-vs-eliminazione',
      explanation:
        'Modifica contro eliminazione: conflitto materializzato, la cancellazione non vince ' +
        'in automatico e la modifica non viene scartata (specifica §8.2).',
    };
  }

  // --- Eliminazione di un'entita' viva -------------------------------------
  if (op.kind === 'delete') {
    // Se localmente ci sono modifiche successive alla base dell'eliminazione,
    // e' di nuovo "modifica contro eliminazione", visto dall'altro lato.
    const localChangesAfterBase = Object.entries(current.fieldStamps).filter(
      ([, stamp]) => stamp.revision > op.baseRevision && stamp.origin !== op.origin,
    );
    if (localChangesAfterBase.length > 0) {
      const conflict = buildConflict({
        input,
        field: null,
        reason: 'modifica-vs-eliminazione',
        alternatives: [
          {
            operationId: op.id,
            origin: op.origin,
            lamport: op.lamport,
            kind: 'delete',
            entityId: op.entityId,
            value: null,
            createdAt: op.createdAt,
            label: `Eliminare come chiesto da ${deviceLabel(op.origin)}`,
          },
          {
            operationId: current.lastOperationId,
            origin: localChangesAfterBase[0]?.[1].origin ?? input.localDeviceId,
            lamport: current.lamport,
            kind: 'upsert',
            entityId: current.entityId,
            value: pick(
              current.fields,
              localChangesAfterBase.map(([name]) => name),
            ),
            createdAt: null,
            label: 'Conservare le modifiche piu recenti e annullare l eliminazione',
          },
        ],
        question:
          `${capitalize(entityLabelIt(op.entityType))} e stata eliminata su un dispositivo ` +
          'mentre veniva modificata su un altro. Cosa vuoi conservare? ' +
          'Finche non scegli, nulla viene eliminato.',
        nonDestructive: false,
      });
      return {
        kind: 'conflitto',
        record: null,
        conflicts: [conflict],
        mergedFields: [],
        contestedFields: [],
        markApplied: true,
        reason: 'modifica-vs-eliminazione',
        explanation:
          'Eliminazione remota su un entita modificata localmente: conflitto materializzato, ' +
          'nessuna eliminazione automatica.',
      };
    }
    return {
      kind: 'applicata',
      record: tombstoneFromDelete(op, current, input.workspaceId),
      conflicts: [],
      mergedFields: [],
      contestedFields: [],
      markApplied: true,
      reason: 'eliminazione',
      explanation: 'Eliminazione applicata e conservata come tombstone.',
    };
  }

  // --- 1 e 2. Modifica contro modifica ------------------------------------
  const incomingFields = changedFields(op);
  const merged: string[] = [];
  const contested: string[] = [];
  const conflicts: Conflict[] = [];

  for (const field of incomingFields) {
    const stamp = current.fieldStamps[field];
    const incomingValue = (op.payload ?? {})[field];

    // Campo mai toccato localmente, o toccato a una revisione che l'autore
    // aveva gia' visto: modifica indipendente, si unisce.
    if (stamp === undefined || stamp.revision <= op.baseRevision) {
      merged.push(field);
      continue;
    }
    // Stesso valore: convergenza, non c'e' niente da chiedere.
    if (sameValue(current.fields[field], incomingValue)) continue;
    // Stessa entita', stesso campo, basi divergenti: conflitto materializzato.
    contested.push(field);
    conflicts.push(
      buildConflict({
        input,
        field,
        reason: 'stesso-campo-divergente',
        alternatives: [
          {
            operationId: stamp.operationId,
            origin: stamp.origin,
            lamport: stamp.lamport,
            kind: 'upsert',
            entityId: current.entityId,
            value: current.fields[field],
            createdAt: null,
            label: `${describeValueIt(current.fields[field])} (da ${deviceLabel(stamp.origin)})`,
          },
          {
            operationId: op.id,
            origin: op.origin,
            lamport: op.lamport,
            kind: 'upsert',
            entityId: op.entityId,
            value: incomingValue,
            createdAt: op.createdAt,
            label: `${describeValueIt(incomingValue)} (da ${deviceLabel(op.origin)})`,
          },
        ],
        question:
          `Per ${entityLabelIt(op.entityType)} ${fieldLabelIt(field)} ha due valori diversi: ` +
          `${describeValueIt(current.fields[field])} su ${deviceLabel(stamp.origin)} e ` +
          `${describeValueIt(incomingValue)} su ${deviceLabel(op.origin)}. ` +
          'Quale vuoi conservare? Entrambi restano salvati finche non scegli.',
        nonDestructive: false,
      }),
    );
  }

  const programConflict = detectConcurrentProgramVersions(op, current, input);
  if (programConflict !== null) conflicts.push(programConflict);

  // I campi uniti vengono applicati anche quando altri campi sono in
  // conflitto: non si blocca tutto per un campo.
  const record = merged.length > 0 ? applyUpsert(current, op, merged) : bumpRevision(current, op);

  if (conflicts.length > 0) {
    return {
      kind: 'conflitto',
      record,
      conflicts,
      mergedFields: merged,
      contestedFields: contested,
      markApplied: true,
      reason:
        programConflict !== null && contested.length === 0
          ? 'revisioni-concorrenti-programma'
          : 'stesso-campo-divergente',
      explanation:
        `${String(merged.length)} campi uniti in automatico, ${String(conflicts.length)} ` +
        'conflitti materializzati: nessuna alternativa e stata scartata.',
    };
  }

  if (merged.length === 0) {
    return {
      kind: 'ignorata',
      record: bumpRevision(current, op),
      conflicts: [],
      mergedFields: [],
      contestedFields: [],
      markApplied: true,
      reason: 'valore-convergente',
      explanation: 'I valori in arrivo coincidono con quelli locali: nessuna modifica.',
    };
  }

  return {
    kind: 'applicata',
    record,
    conflicts: [],
    mergedFields: merged,
    contestedFields: [],
    markApplied: true,
    reason:
      op.baseRevision === current.revision ? 'avanzamento-lineare' : 'unione-campi-disgiunti',
    explanation:
      op.baseRevision === current.revision
        ? 'Avanzamento lineare: la base coincide con la revisione locale.'
        : 'Modifiche su campi disgiunti: unite in automatico, entrambe conservate.',
  };
}

// ---------------------------------------------------------------------------
// Costruzione e aggiornamento dei record
// ---------------------------------------------------------------------------

export function createRecord(op: SyncOperation, workspaceId: WorkspaceId): EntityRecord {
  const fields: Record<string, unknown> = {};
  const stamps: Record<string, FieldStamp> = {};
  for (const [key, value] of Object.entries(op.payload ?? {})) {
    fields[key] = value;
    stamps[key] = {
      revision: op.newRevision,
      operationId: op.id,
      origin: op.origin,
      lamport: op.lamport,
    };
  }
  return {
    workspaceId,
    entityType: op.entityType,
    entityId: op.entityId,
    revision: op.newRevision,
    fields,
    fieldStamps: stamps,
    deleted: false,
    deletedByOperationId: null,
    deletedAtRevision: 0,
    deletedAt: null,
    lastOperationId: op.id,
    lamport: op.lamport,
  };
}

function applyUpsert(
  current: EntityRecord,
  op: SyncOperation,
  fieldsToApply: readonly string[],
): EntityRecord {
  const fields = { ...current.fields };
  const stamps = { ...current.fieldStamps };
  for (const field of fieldsToApply) {
    fields[field] = (op.payload ?? {})[field];
    stamps[field] = {
      revision: op.newRevision,
      operationId: op.id,
      origin: op.origin,
      lamport: op.lamport,
    };
  }
  return {
    ...current,
    fields,
    fieldStamps: stamps,
    // La revisione avanza al massimo fra le due: su una base divergente
    // `op.newRevision` e' <= alla revisione locale e non fa scendere nulla.
    revision: Math.max(current.revision, op.newRevision),
    lastOperationId: op.id,
    lamport: Math.max(current.lamport, op.lamport),
  };
}

function bumpRevision(current: EntityRecord, op: SyncOperation): EntityRecord {
  return {
    ...current,
    revision: Math.max(current.revision, op.newRevision),
    lamport: Math.max(current.lamport, op.lamport),
  };
}

/**
 * Tombstone.
 *
 * I campi **restano** nel record: servono a mostrare all'utente cosa sta per
 * essere ripristinato quando un conflitto "modifica contro eliminazione" viene
 * risolto, e a un ripristino non distruttivo (specifica §14).
 */
function tombstoneFromDelete(
  op: SyncOperation,
  current: EntityRecord | null,
  workspaceId: WorkspaceId,
): EntityRecord {
  const base: EntityRecord =
    current ??
    {
      workspaceId,
      entityType: op.entityType,
      entityId: op.entityId,
      revision: 0,
      fields: {},
      fieldStamps: {},
      deleted: false,
      deletedByOperationId: null,
      deletedAtRevision: 0,
      deletedAt: null,
      lastOperationId: op.id,
      lamport: op.lamport,
    };
  return {
    ...base,
    revision: Math.max(base.revision, op.newRevision),
    deleted: true,
    deletedByOperationId: op.id,
    deletedAtRevision: op.newRevision,
    deletedAt: op.createdAt,
    lastOperationId: op.id,
    lamport: Math.max(base.lamport, op.lamport),
    fieldStamps: {
      ...base.fieldStamps,
      __deleted__: {
        revision: op.newRevision,
        operationId: op.id,
        origin: op.origin,
        lamport: op.lamport,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Regole specifiche
// ---------------------------------------------------------------------------

function ownerOf(record: EntityRecord, fallback: DeviceId): DeviceId {
  const owner = record.fields['ownerDeviceId'];
  return typeof owner === 'string' && owner.length > 0 ? owner : fallback;
}

/**
 * Seduta in corso su un altro dispositivo.
 *
 * Il proprietario della seduta attiva puo' continuare a modificarla (e' lui
 * che la sta svolgendo); chiunque altro deve chiedere conferma.
 */
function isProtectedActiveSession(
  record: EntityRecord,
  op: SyncOperation,
  localDeviceId: DeviceId,
): boolean {
  if (record.entityType !== 'session') return false;
  if (record.fields['status'] !== 'active') return false;
  return op.origin !== ownerOf(record, localDeviceId);
}

/**
 * Revisioni concorrenti del programma.
 *
 * Due `ProgramPlan` **distinti** che dichiarano la stessa `version` e vengono
 * da origini diverse sono due revisioni concorrenti: una e' stata creata
 * offline su un dispositivo, l'altra sull'altro. Nessuna delle due va
 * sovrascritta; possono coesistere come versioni distinte.
 */
function detectConcurrentProgramVersions(
  op: SyncOperation,
  candidate: EntityRecord,
  input: ResolveInput,
): Conflict | null {
  if (op.entityType !== 'programPlan') return null;
  const version = candidate.fields['version'];
  if (typeof version !== 'number') return null;
  const siblings = input.siblings ?? [];
  for (const other of siblings) {
    if (other.entityId === candidate.entityId) continue;
    if (other.deleted) continue;
    if (other.fields['version'] !== version) continue;
    const otherStamp = other.fieldStamps['version'];
    const otherOrigin = otherStamp?.origin ?? input.localDeviceId;
    if (otherOrigin === op.origin) continue;
    return buildConflict({
      input,
      field: 'version',
      reason: 'revisioni-concorrenti-programma',
      alternatives: [
        {
          operationId: otherStamp?.operationId ?? other.lastOperationId,
          origin: otherOrigin,
          lamport: other.lamport,
          kind: 'upsert',
          entityId: other.entityId,
          value: other.fields,
          createdAt: null,
          label:
            `Revisione ${describeValueIt(version)} creata su ${deviceLabel(otherOrigin)} ` +
            `(${other.entityId})`,
        },
        {
          operationId: op.id,
          origin: op.origin,
          lamport: op.lamport,
          kind: 'upsert',
          entityId: candidate.entityId,
          value: candidate.fields,
          createdAt: op.createdAt,
          label:
            `Revisione ${describeValueIt(version)} creata su ${deviceLabel(op.origin)} ` +
            `(${candidate.entityId})`,
        },
      ],
      question:
        `Esistono due revisioni del programma numerate ${describeValueIt(version)}, create su ` +
        'due dispositivi diversi. Sono conservate entrambe come versioni distinte: ' +
        'scegli quale usare, oppure rinumerane una. Nessuna viene eliminata.',
      nonDestructive: true,
    });
  }
  return null;
}

// ---------------------------------------------------------------------------
// Utilita'
// ---------------------------------------------------------------------------

function buildConflict(args: {
  readonly input: ResolveInput;
  readonly field: string | null;
  readonly reason: ConflictReason;
  readonly alternatives: readonly ConflictAlternative[];
  readonly question: string;
  readonly nonDestructive: boolean;
}): Conflict {
  // Le alternative sono ordinate con il tie-break deterministico
  // `(lamport, origin, operationId)`: e' **ordinamento**, non un giudizio.
  const alternatives = [...args.alternatives].sort((a, b) => {
    if (a.lamport !== b.lamport) return a.lamport - b.lamport;
    if (a.origin !== b.origin) return a.origin < b.origin ? -1 : 1;
    return a.operationId < b.operationId ? -1 : a.operationId > b.operationId ? 1 : 0;
  });
  return {
    id: args.input.newConflictId(),
    workspaceId: args.input.workspaceId,
    entityType: args.input.incoming.entityType,
    entityId: args.input.incoming.entityId,
    field: args.field,
    reason: args.reason,
    alternatives,
    question: args.question,
    detectedAt: args.input.now,
    nonDestructive: args.nonDestructive,
    resolvedWithOperationId: null,
    resolvedAt: null,
  };
}

function ignored(reason: ResolutionReason, explanation: string): Resolution {
  return {
    kind: 'ignorata',
    record: null,
    conflicts: [],
    mergedFields: [],
    contestedFields: [],
    markApplied: reason !== 'archivio-diverso',
    reason,
    explanation,
  };
}

function deferred(reason: ResolutionReason, explanation: string): Resolution {
  return {
    kind: 'in-attesa',
    record: null,
    conflicts: [],
    mergedFields: [],
    contestedFields: [],
    markApplied: false,
    reason,
    explanation,
  };
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (typeof a === 'object') {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return false;
}

function pick(
  source: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) out[key] = source[key];
  return out;
}

function capitalize(text: string): string {
  return text.length === 0 ? text : text[0]!.toUpperCase() + text.slice(1);
}

/**
 * Ordina le operazioni di un conflitto in modo stabile fra dispositivi.
 * Esportata per i test: dimostra che l'ordine non dipende da `createdAt`.
 */
export const deterministicTieBreak = compareForOrdering;
