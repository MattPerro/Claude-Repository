/**
 * Proposte del coach e loro accettazione.
 *
 * Una proposta e' un OGGETTO DI DATI, non un effetto. Nessun componente -
 * nemmeno un modello linguistico - scrive nel programma: il flusso
 * obbligatorio e' proposta strutturata -> validazione -> controllo delle
 * regole -> anteprima -> conferma -> applicazione transazionale
 * (specifica §10).
 */

import type { Instant, LocalDate } from '../time.js';
import type { SetMetric } from '../units.js';
import type { SessionSlot, TargetRange } from './prescription.js';

/** Che cosa la proposta vuole cambiare. */
export type ProposalChange =
  | {
      /** Nessun cambiamento: si conferma il carico attuale. */
      readonly kind: 'hold';
      readonly exerciseId: string;
    }
  | {
      /** Aumenta il carico al prossimo gradino realmente disponibile. */
      readonly kind: 'increaseLoad';
      readonly exerciseId: string;
      readonly fromKg: number;
      readonly toKg: number;
      readonly equipmentInstanceId: string | null;
    }
  | {
      /** Riduzione temporanea del carico, con durata dichiarata. */
      readonly kind: 'reduceLoadTemporarily';
      readonly exerciseId: string;
      readonly fromKg: number;
      readonly toKg: number;
      readonly forSessions: number;
    }
  | {
      /** Sali di ripetizioni dentro l'intervallo, prima del carico. */
      readonly kind: 'increaseReps';
      readonly exerciseId: string;
      readonly fromReps: number;
      readonly toReps: number;
    }
  | {
      /** Migliora la durata dentro l'intervallo (esercizi a tempo). */
      readonly kind: 'increaseDuration';
      readonly exerciseId: string;
      readonly fromSeconds: number;
      readonly toSeconds: number;
    }
  | {
      /** Ripeti la settimana di programma invece di avanzare. */
      readonly kind: 'repeatWeek';
      readonly weekIndex: number;
    }
  | {
      /** Cambia il numero di serie allenanti. */
      readonly kind: 'changeVolume';
      readonly exerciseId: string;
      readonly fromSets: number;
      readonly toSets: number;
    }
  | {
      /** Sostituisci con un'alternativa compatibile. */
      readonly kind: 'substituteExercise';
      readonly exerciseId: string;
      readonly replacementExerciseId: string;
      /** `today` = solo oggi; `program` = anche nel programma futuro. */
      readonly scope: 'today' | 'program';
    }
  | {
      /** Modifica il cardio. */
      readonly kind: 'changeCardio';
      readonly description: string;
    }
  | {
      /** Revisione del blocco: richiede conferma esplicita. */
      readonly kind: 'reviseBlock';
      readonly blockId: string;
      readonly description: string;
    }
  | {
      /** Selezione ragionata del lavoro per una seduta piu' corta. */
      readonly kind: 'shortenSession';
      readonly availableMinutes: number;
      /** Esercizi conservati, in ordine. */
      readonly keepExerciseIds: readonly string[];
      /** Esercizi rimossi da questa seduta. */
      readonly dropExerciseIds: readonly string[];
      /** Riduzioni di serie per esercizio conservato. */
      readonly reducedSets: readonly {
        readonly exerciseId: string;
        readonly fromSets: number;
        readonly toSets: number;
      }[];
    };

/** Dato realmente usato dal motore, citato nella spiegazione. */
export interface ProposalEvidence {
  /** Etichetta leggibile: "Pressa, seduta del 12 marzo". */
  readonly label: string;
  /** Valore osservato, gia' formattato. */
  readonly value: string;
  /** Riferimento all'entita' di origine, per l'ispezione. */
  readonly sourceSetIds: readonly string[];
  readonly sourceSessionIds: readonly string[];
}

/** Informazione che manca e che impedisce una proposta piu' decisa. */
export interface MissingInformation {
  readonly code:
    | 'noRirDeclared'
    | 'noTechniqueDeclared'
    | 'notEnoughExposures'
    | 'noEquipmentStep'
    | 'noComparableHistory'
    | 'noLoadRecorded';
  readonly description: string;
}

export const MISSING_INFO_TEXT: Record<MissingInformation['code'], string> = {
  noRirDeclared:
    "Il margine (RIR) non e' stato dichiarato: senza quel dato non e' possibile sapere quanto era impegnativa la serie.",
  noTechniqueDeclared:
    "La tecnica non e' stata dichiarata: un incremento richiede che l'esecuzione sia stata controllata.",
  notEnoughExposures:
    "Serve una seconda esposizione confrontabile per confermare il risultato: un singolo allenamento non basta.",
  noEquipmentStep:
    "L'incremento minimo di questo attrezzo non e' configurato: non e' possibile proporre un carico realmente impostabile.",
  noComparableHistory:
    "Non esiste ancora uno storico confrontabile per questo esercizio su questo attrezzo.",
  noLoadRecorded: "Nessun carico registrato nelle serie precedenti.",
};

/** Origine della proposta. */
export type ProposalSource =
  /** Motore adattivo locale, deterministico. E' la componente obbligatoria. */
  | 'adaptiveEngine'
  /** Componente generativa esterna, facoltativa e disattivata per default. */
  | 'generativeCoach'
  /** Richiesta diretta dell'utente ("oggi ho 40 minuti"). */
  | 'userRequest';

export type ProposalDecision =
  | 'pending'
  | 'accepted'
  /** Accettata con modifiche dell'utente. */
  | 'modified'
  /** Rinviata: riproposta piu' tardi. */
  | 'deferred'
  | 'rejected'
  /** Annullata dopo l'accettazione. */
  | 'undone'
  /**
   * Superata: e' arrivata da un altro dispositivo una revisione piu' recente.
   * Una proposta obsoleta non sovrascrive una revisione gia' accettata
   * (specifica §9).
   */
  | 'superseded';

export const PROPOSAL_DECISION_LABEL: Record<ProposalDecision, string> = {
  pending: 'Da decidere',
  accepted: 'Accettata',
  modified: 'Accettata con modifiche',
  deferred: 'Rimandata',
  rejected: 'Rifiutata',
  undone: 'Annullata',
  superseded: 'Superata da una revisione piu\' recente',
};

/**
 * Proposta completa.
 *
 * Contiene tutto cio' che la specifica (§9) richiede di mostrare: dati
 * utilizzati, ragione, modifica prevista, informazioni mancanti e momento
 * della rivalutazione.
 */
export interface CoachProposal {
  readonly id: string;
  readonly workspaceId: string;
  readonly source: ProposalSource;
  readonly createdAt: Instant;
  /** Titolo breve mostrato nell'elenco. */
  readonly title: string;
  /** Spiegazione in italiano, una o due frasi. */
  readonly reason: string;
  readonly change: ProposalChange;
  readonly evidence: readonly ProposalEvidence[];
  readonly missingInformation: readonly MissingInformation[];
  /** Quando la proposta va rivalutata se non viene decisa. */
  readonly reevaluateOn: LocalDate;
  /**
   * Versione del piano su cui la proposta e' stata calcolata.
   * Serve per riconoscere le proposte obsolete dopo una sincronizzazione.
   */
  readonly basePlanVersion: number;
  /** Sessione o settimana a cui la proposta si riferisce. */
  readonly targetWeekIndex: number | null;
  readonly targetSlot: SessionSlot | null;
  readonly decision: ProposalDecision;
  readonly decidedAt: Instant | null;
  /** Nota dell'utente al momento della decisione. */
  readonly decisionNote: string | null;
  /**
   * true se applicare la proposta modifica la STRUTTURA del programma
   * (volume, blocco, sostituzione permanente). Richiede conferma esplicita
   * e non puo' essere applicata in automatico.
   */
  readonly requiresExplicitConfirmation: boolean;
  readonly revision: number;
}

/**
 * Dati che una proposta di incremento deve poter esibire.
 * Se `confirmedExposures < 2` il motore non propone aumenti (specifica §9).
 */
export interface ProgressionEvidenceSummary {
  readonly comparabilityKey: string;
  readonly confirmedExposures: number;
  readonly allSetsAtRangeTop: boolean;
  readonly rirWithinPhaseTarget: boolean;
  readonly techniqueControlled: boolean;
  readonly noIssuesReported: boolean;
}

/** Riepilogo di un esercizio a tempo, per la progressione di durata. */
export interface DurationProgressState {
  readonly comparabilityKey: string;
  readonly metric: Extract<SetMetric, 'seconds'>;
  readonly target: TargetRange;
  readonly lastSeconds: number;
  readonly atRangeTop: boolean;
}
