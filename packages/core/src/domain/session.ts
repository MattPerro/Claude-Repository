/**
 * Sessioni e serie EFFETTIVAMENTE eseguite.
 *
 * Questo file descrive i fatti: cosa e' stato fatto, quando, con quale
 * carico e con quale convenzione. Niente di cio' che sta qui viene dedotto
 * dal programma o precompilato dall'interfaccia: se un campo non e' stato
 * confermato dall'utente, non e' un fatto (specifica §5 e §12).
 */

import type { BodySide, LoadConvention, SetMetric } from '../units.js';
import type { Instant, LocalDate } from '../time.js';
import type { SessionPrescription, SessionSlot, SetRole } from './prescription.js';

/** Stato di una serie registrata. */
export type SetStatus =
  /** Confermata dall'utente: e' un fatto. */
  | 'completed'
  /** Saltata deliberatamente. */
  | 'skipped'
  /** In compilazione: bozza salvata, NON eseguita. */
  | 'draft'
  /** Annullata dopo una conferma accidentale. */
  | 'voided';

/** Valore di carico registrato, sempre accompagnato dalla convenzione. */
export interface RecordedLoad {
  readonly convention: LoadConvention;
  /**
   * Valore in kg nella convenzione indicata. `null` per `bodyweight` e
   * `timeOnly`: un esercizio a corpo libero non ha carico 0, ha carico
   * "non applicabile".
   */
  readonly kg: number | null;
  /**
   * Attrezzo specifico usato. Obbligatorio per `machineStack` e `assisted`.
   */
  readonly equipmentInstanceId: string | null;
}

/** Una serie eseguita. */
export interface PerformedSet {
  readonly id: string;
  readonly performedExerciseId: string;
  /** Posizione fra le serie dell'esercizio, 1-based. */
  readonly order: number;
  readonly role: SetRole;
  readonly load: RecordedLoad;
  readonly metric: SetMetric;
  /** Ripetizioni eseguite, se `metric === 'reps'`. */
  readonly reps: number | null;
  /** Secondi eseguiti, se `metric === 'seconds'`. */
  readonly seconds: number | null;
  readonly side: BodySide;
  /** RIR dichiarato. Facoltativo: `null` significa "non dichiarato". */
  readonly rir: number | null;
  readonly note: string | null;
  readonly status: SetStatus;
  /** Momento della conferma. `null` per le bozze. */
  readonly completedAt: Instant | null;
  /**
   * Chiave di comparabilita' calcolata alla conferma e conservata.
   * Rende i confronti riproducibili anche se in futuro cambia il codice.
   */
  readonly comparabilityKey: string;
}

/** Tecnica dichiarata su un esercizio in una seduta. */
export type TechniqueRating =
  /** Controllata: presupposto per proporre un incremento. */
  | 'controlled'
  /** Incerta su alcune ripetizioni. */
  | 'uncertain'
  /** Ceduta: la serie non e' un riferimento valido per progredire. */
  | 'broke';

export const TECHNIQUE_LABEL: Record<TechniqueRating, string> = {
  controlled: 'Controllata',
  uncertain: 'Incerta',
  broke: 'Ceduta',
};

/** Fastidio segnalato su un esercizio. */
export interface DiscomfortReport {
  /** Zona indicata da Mattia, testo libero fra voci proposte. */
  readonly area: string;
  /** Intensita' dichiarata, 1-5. Non e' una diagnosi. */
  readonly intensity: number;
  readonly note: string | null;
  /** true se ha interrotto o modificato l'esercizio. */
  readonly stoppedExercise: boolean;
}

/** Un esercizio svolto dentro una sessione. */
export interface PerformedExercise {
  readonly id: string;
  readonly sessionId: string;
  readonly order: number;
  readonly exerciseId: string;
  readonly variantId: string | null;
  /**
   * `true` se questo esercizio ha sostituito quello prescritto.
   * `substitutedForExerciseId` dice quale.
   */
  readonly substitutedForExerciseId: string | null;
  readonly equipmentInstanceId: string | null;
  readonly technique: TechniqueRating | null;
  readonly discomfort: DiscomfortReport | null;
  /** Regolazioni annotate: sedile, schienale, maniglia, presa, gradino. */
  readonly settingsNote: string | null;
  readonly note: string | null;
  /** true se l'esercizio e' stato saltato del tutto. */
  readonly skipped: boolean;
}

/** Check-in di inizio seduta. Breve e saltabile (specifica §12). */
export interface SessionCheckIn {
  /** 1-5. `null` = non dichiarato. */
  readonly energy: number | null;
  readonly sleepQuality: number | null;
  readonly soreness: number | null;
  readonly stress: number | null;
  readonly note: string | null;
  /** Fastidi segnalati prima di iniziare. */
  readonly discomfort: readonly DiscomfortReport[];
}

export const EMPTY_CHECK_IN: SessionCheckIn = {
  energy: null,
  sleepQuality: null,
  soreness: null,
  stress: null,
  note: null,
  discomfort: [],
};

/** Cardio effettivamente svolto e CONFERMATO. */
export interface PerformedCardio {
  readonly id: string;
  readonly sessionId: string;
  readonly kind: 'steady' | 'intervals';
  readonly minutes: number;
  /** Per gli intervalli: quanti cicli sono stati confermati come svolti. */
  readonly roundsCompleted: number | null;
  readonly intensityNote: string | null;
  /**
   * true solo se l'utente ha confermato l'esecuzione.
   * Il trascorrere del tempo non dimostra il cardio (specifica §13).
   */
  readonly confirmed: boolean;
}

export type SessionStatus =
  /** Pianificata, non iniziata. */
  | 'planned'
  /** In corso su questo dispositivo. */
  | 'active'
  /** In pausa (l'utente ha chiuso l'app o messo in pausa la seduta). */
  | 'paused'
  /** Chiusa con tutte le serie allenanti previste completate. */
  | 'completed'
  /** Chiusa in anticipo: alcune serie previste non sono state svolte. */
  | 'partial'
  /** Prevista e non svolta. */
  | 'skipped';

export const SESSION_STATUS_LABEL: Record<SessionStatus, string> = {
  planned: 'Pianificata',
  active: 'In corso',
  paused: 'In pausa',
  completed: 'Completata',
  partial: 'Parziale',
  skipped: 'Saltata',
};

/**
 * Fotografia della prescrizione al momento dell'avvio della sessione.
 *
 * Congelata: le revisioni future del programma non riscrivono lo storico
 * (specifica §5 e §8).
 */
export interface PrescriptionSnapshot {
  readonly planVersion: number;
  readonly weekIndex: number;
  readonly slot: SessionSlot;
  readonly blockId: string;
  readonly prescription: SessionPrescription;
  /** Istante in cui la fotografia e' stata scattata. */
  readonly capturedAt: Instant;
}

export interface Session {
  readonly id: string;
  readonly workspaceId: string;
  /** Data prevista dal calendario. */
  readonly plannedDate: LocalDate;
  /** Data in cui e' stata effettivamente svolta. `null` se non svolta. */
  readonly performedDate: LocalDate | null;
  readonly slot: SessionSlot;
  readonly status: SessionStatus;
  readonly snapshot: PrescriptionSnapshot;
  readonly checkIn: SessionCheckIn;
  readonly startedAt: Instant | null;
  readonly endedAt: Instant | null;
  /** Millisecondi totali in pausa, per calcolare la durata netta. */
  readonly pausedMs: number;
  readonly note: string | null;
  /**
   * Dispositivo che possiede la seduta attiva. Il trasferimento fra
   * dispositivi e' esplicito (specifica §12).
   */
  readonly ownerDeviceId: string | null;
  /** Numero di revisione dell'entita', per il rilevamento dei conflitti. */
  readonly revision: number;
}

/** Durata netta della seduta in minuti, pause escluse. */
export function sessionNetMinutes(session: Session): number | null {
  if (session.startedAt === null || session.endedAt === null) return null;
  const gross = session.endedAt - session.startedAt;
  return Math.max(0, Math.round((gross - session.pausedMs) / 60_000));
}

/** Serie allenanti confermate, escluse riscaldamento, bozze e annullate. */
export function workingSetsCompleted(sets: readonly PerformedSet[]): readonly PerformedSet[] {
  return sets.filter((s) => s.role === 'working' && s.status === 'completed');
}

/**
 * Stato calcolato della sessione al termine.
 *
 * `completed` solo se tutte le serie allenanti previste risultano confermate.
 * Non "completata perche' l'utente ha premuto Fine".
 */
export function computeFinalStatus(
  snapshot: PrescriptionSnapshot,
  sets: readonly PerformedSet[],
): 'completed' | 'partial' {
  const prescribed = snapshot.prescription.exercises.reduce(
    (sum, e) => sum + e.workingSets * (e.perSide ? 2 : 1),
    0,
  );
  const done = workingSetsCompleted(sets).length;
  return done >= prescribed ? 'completed' : 'partial';
}
