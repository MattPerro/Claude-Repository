/**
 * Struttura del programma, su quattro livelli (specifica §8):
 *
 *   1. {@link ProgramYear}   obiettivi annuali
 *   2. {@link ProgramBlock}  blocchi con finalita' specifiche
 *   3. {@link ProgramWeek}   settimane e sedute A/B
 *   4. prescrizioni operative (vedi `prescription.ts`)
 *
 * Il programma e' un dato VERSIONATO: una revisione non riscrive le sedute
 * gia' svolte. Ogni sessione conserva una fotografia della prescrizione
 * valida al proprio avvio (specifica §5).
 */

import type { LocalDate } from '../time.js';
import type { SessionPrescription, SessionSlot } from './prescription.js';

/** Fase del percorso, usata per etichette e per i criteri del motore. */
export type ProgramPhaseKind =
  /** Rientro: volumi ridotti, margine ampio, priorita' alla tolleranza. */
  | 'reentry'
  /** Consolidamento tecnico: schemi stabili, carichi prudenti. */
  | 'technicalConsolidation'
  /** Sviluppo: la progressione del carico e' l'obiettivo principale. */
  | 'development'
  /** Mantenimento: si conserva quanto costruito con meno stress. */
  | 'maintenance'
  /** Scarico: riduzione programmata del volume per recuperare. */
  | 'deload'
  /** Periodo con molta pista: la palestra passa in secondo piano. */
  | 'trackSeason';

export const PHASE_LABEL: Record<ProgramPhaseKind, string> = {
  reentry: 'Rientro',
  technicalConsolidation: 'Consolidamento tecnico',
  development: 'Sviluppo',
  maintenance: 'Mantenimento',
  deload: 'Scarico',
  trackSeason: 'Periodo di pista',
};

/**
 * Criterio di ingresso in un blocco.
 *
 * Non e' una data: il passaggio a una fase dipende da risultati e tolleranza
 * (specifica §8). Sono condizioni verificabili sui dati realmente registrati.
 */
export interface BlockEntryCriterion {
  readonly id: string;
  /** Testo mostrato all'utente. */
  readonly description: string;
  readonly rule:
    | {
        /** Almeno N sedute completate nel blocco precedente. */
        readonly kind: 'minCompletedSessions';
        readonly count: number;
      }
    | {
        /** Almeno N sedute consecutive senza fastidi segnalati. */
        readonly kind: 'consecutiveSessionsWithoutIssue';
        readonly count: number;
      }
    | {
        /** Tecnica dichiarata controllata su questi esercizi. */
        readonly kind: 'techniqueControlled';
        readonly exerciseIds: readonly string[];
      }
    | {
        /** Percentuale minima di aderenza nelle ultime N settimane. */
        readonly kind: 'adherence';
        readonly weeks: number;
        readonly minRatio: number;
      }
    | {
        /** Nessuna condizione automatica: l'ingresso e' sempre ammesso. */
        readonly kind: 'always';
      };
}

/** Criterio che suggerisce di rivedere il blocco prima della fine. */
export interface BlockReviewCriterion {
  readonly id: string;
  readonly description: string;
  readonly rule:
    | {
        /** N sedute consecutive con fastidio sullo stesso esercizio. */
        readonly kind: 'repeatedDiscomfort';
        readonly count: number;
      }
    | {
        /** Nessun progresso comparabile per N esposizioni. */
        readonly kind: 'stalledExposures';
        readonly count: number;
      }
    | {
        /** Aderenza sotto soglia nelle ultime N settimane. */
        readonly kind: 'lowAdherence';
        readonly weeks: number;
        readonly maxRatio: number;
      }
    | {
        /** Durata reale delle sedute oltre il tempo disponibile. */
        readonly kind: 'sessionOverrun';
        readonly minutesOver: number;
        readonly occurrences: number;
      };
}

/** Settimana di programma: due sedute A/B come struttura ordinaria. */
export interface ProgramWeek {
  /** Indice assoluto nel percorso, 1-based. */
  readonly index: number;
  /** Indice all'interno del blocco, 1-based. */
  readonly indexInBlock: number;
  /** Etichetta breve: "Settimana 3 - rientro". */
  readonly label: string;
  /** Nota della settimana, es. "step-up a 8 per gamba". */
  readonly note: string | null;
  readonly sessions: readonly SessionPrescription[];
  /** true se la settimana e' di scarico. */
  readonly isDeload: boolean;
}

export interface ProgramBlock {
  readonly id: string;
  /** Numero del blocco nel percorso, 1-based. */
  readonly order: number;
  readonly name: string;
  readonly phase: ProgramPhaseKind;
  /** Finalita' del blocco, in una o due frasi. */
  readonly purpose: string;
  /** Durata indicativa in settimane. */
  readonly plannedWeeks: number;
  /** Indice (1-based) della prima settimana del blocco nel percorso. */
  readonly startWeekIndex: number;
  readonly weeks: readonly ProgramWeek[];
  readonly entryCriteria: readonly BlockEntryCriterion[];
  readonly reviewCriteria: readonly BlockReviewCriterion[];
  /** Come gestire recupero, mantenimento e interruzioni in questo blocco. */
  readonly interruptionPolicy: string;
  /** Anno del percorso a cui appartiene (1, 2 o 3). */
  readonly yearNumber: number;
}

export interface ProgramYear {
  readonly number: number;
  readonly title: string;
  /** Obiettivi dell'anno, in forma di elenco. */
  readonly objectives: readonly string[];
  /**
   * Avvertenza esplicita: e' una struttura progettuale, non una previsione
   * certa del livello che verra' raggiunto (specifica §8).
   */
  readonly caveat: string;
  readonly blockIds: readonly string[];
}

/** Come sono state generate le prescrizioni di un piano. */
export const PROGRAM_PLAN_FORMAT_VERSION = 1;

/**
 * Piano completo. Immutabile: una revisione produce un nuovo `version`
 * e il vecchio piano resta consultabile (specifica §8, storia delle revisioni).
 */
export interface ProgramPlan {
  readonly id: string;
  /** Versione progressiva del piano per questo archivio, 1-based. */
  readonly version: number;
  /** Versione del formato dei dati, per le migrazioni. */
  readonly formatVersion: number;
  /** Data di avvio del percorso. */
  readonly startDate: LocalDate;
  /** Orizzonte del piano in anni. */
  readonly horizonYears: number;
  /** Ultimo giorno coperto, calcolato su date reali. */
  readonly lastDate: LocalDate;
  readonly years: readonly ProgramYear[];
  readonly blocks: readonly ProgramBlock[];
  /** Motivo di questa revisione; `null` per il piano iniziale. */
  readonly revisionReason: string | null;
  /** Versione da cui deriva questa revisione; `null` per il piano iniziale. */
  readonly derivedFromVersion: number | null;
}

/** Tutte le settimane del piano, in ordine. */
export function allWeeks(plan: ProgramPlan): readonly ProgramWeek[] {
  return plan.blocks.flatMap((block) => block.weeks);
}

/** Settimana con l'indice assoluto indicato. */
export function weekAt(plan: ProgramPlan, index: number): ProgramWeek | undefined {
  for (const block of plan.blocks) {
    if (index >= block.startWeekIndex && index < block.startWeekIndex + block.weeks.length) {
      return block.weeks[index - block.startWeekIndex];
    }
  }
  return undefined;
}

/** Blocco che contiene la settimana con l'indice indicato. */
export function blockAtWeek(plan: ProgramPlan, index: number): ProgramBlock | undefined {
  return plan.blocks.find(
    (block) => index >= block.startWeekIndex && index < block.startWeekIndex + block.weeks.length,
  );
}

export function sessionAt(
  plan: ProgramPlan,
  weekIndex: number,
  slot: SessionSlot,
): SessionPrescription | undefined {
  return weekAt(plan, weekIndex)?.sessions.find((s) => s.slot === slot);
}

export function totalWeeks(plan: ProgramPlan): number {
  return plan.blocks.reduce((sum, block) => sum + block.weeks.length, 0);
}

export function totalPlannedSessions(plan: ProgramPlan): number {
  return plan.blocks.reduce(
    (sum, block) => sum + block.weeks.reduce((s, w) => s + w.sessions.length, 0),
    0,
  );
}

/**
 * Cursore del programma: dove si trova Mattia nel percorso.
 *
 * Distingue la settimana di CALENDARIO dalla settimana di PROGRAMMA
 * (specifica §7). Avanza solo quando le sedute previste sono state
 * completate: una seduta saltata non equivale a una seduta completata, e
 * un'interruzione non fa avanzare la fase.
 */
export interface ProgramCursor {
  readonly planVersion: number;
  /** Settimana di programma corrente, 1-based. */
  readonly weekIndex: number;
  /**
   * Quante volte questa settimana e' stata ripetuta.
   * 0 = prima esecuzione.
   */
  readonly repetitionCount: number;
  /** Slot completati nella settimana corrente. */
  readonly completedSlots: readonly SessionSlot[];
  /**
   * Data in cui il cursore e' entrato nella settimana corrente.
   * Serve per le viste di calendario, NON per far avanzare il cursore.
   */
  readonly enteredOn: LocalDate;
}

/** Il cursore ha completato tutte le sedute previste dalla settimana? */
export function weekIsComplete(cursor: ProgramCursor, week: ProgramWeek): boolean {
  return week.sessions.every((s) => cursor.completedSlots.includes(s.slot));
}

/** Prossimo slot da svolgere nella settimana corrente, se ce n'e' uno. */
export function nextSlot(cursor: ProgramCursor, week: ProgramWeek): SessionSlot | null {
  const pending = week.sessions.find((s) => !cursor.completedSlots.includes(s.slot));
  return pending?.slot ?? null;
}
