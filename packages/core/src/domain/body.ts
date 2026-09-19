/**
 * Corpo, recupero, abitudini e giornate in pista.
 *
 * Regole non negoziabili (specifica §15):
 *  - la percentuale di grasso esiste solo se INSERITA, con metodo e data;
 *  - il peso dichiarato nel profilo non diventa una pesata;
 *  - nessuna caloria bruciata inventata, nessun punteggio sanitario;
 *  - i tempi sul giro non vengono attribuiti alla palestra.
 */

import type { Instant, LocalDate } from '../time.js';

/** Tipo di misurazione corporea. */
export type MeasurementKind =
  | 'weightKg'
  | 'waistCm'
  | 'chestCm'
  | 'hipsCm'
  | 'thighCm'
  | 'armCm'
  | 'neckCm'
  | 'bodyFatPercent';

export const MEASUREMENT_LABEL: Record<MeasurementKind, string> = {
  weightKg: 'Peso',
  waistCm: 'Circonferenza vita',
  chestCm: 'Circonferenza petto',
  hipsCm: 'Circonferenza fianchi',
  thighCm: 'Circonferenza coscia',
  armCm: 'Circonferenza braccio',
  neckCm: 'Circonferenza collo',
  bodyFatPercent: 'Massa grassa',
};

export const MEASUREMENT_UNIT: Record<MeasurementKind, string> = {
  weightKg: 'kg',
  waistCm: 'cm',
  chestCm: 'cm',
  hipsCm: 'cm',
  thighCm: 'cm',
  armCm: 'cm',
  neckCm: 'cm',
  bodyFatPercent: '%',
};

/** Metodo con cui e' stata ottenuta una percentuale di grasso. */
export type BodyFatMethod = 'bioimpedance' | 'calipers' | 'dexa' | 'visualEstimate' | 'other';

export const BODY_FAT_METHOD_LABEL: Record<BodyFatMethod, string> = {
  bioimpedance: 'Bilancia a bioimpedenza',
  calipers: 'Plicometro',
  dexa: 'DEXA',
  visualEstimate: 'Stima visiva',
  other: 'Altro metodo',
};

export interface Measurement {
  readonly id: string;
  readonly workspaceId: string;
  readonly kind: MeasurementKind;
  readonly value: number;
  /** Giorno della misurazione, dichiarato dall'utente. */
  readonly measuredOn: LocalDate;
  /** Momento del salvataggio, distinto dal giorno misurato. */
  readonly recordedAt: Instant;
  /** Obbligatorio quando `kind === 'bodyFatPercent'`. */
  readonly method: BodyFatMethod | null;
  readonly note: string | null;
  readonly revision: number;
}

/** Errore di validazione: una % di grasso senza metodo non e' un dato. */
export class MissingBodyFatMethodError extends Error {
  constructor() {
    super(
      'Una percentuale di massa grassa richiede il metodo di misurazione. ' +
        'Senza metodo il valore non e\' interpretabile e non viene salvato.',
    );
    this.name = 'MissingBodyFatMethodError';
  }
}

export function validateMeasurement(m: Pick<Measurement, 'kind' | 'method' | 'value'>): void {
  if (m.kind === 'bodyFatPercent' && m.method === null) {
    throw new MissingBodyFatMethodError();
  }
  if (!Number.isFinite(m.value) || m.value <= 0) {
    throw new Error(`Valore di misurazione non valido: ${String(m.value)}.`);
  }
  if (m.kind === 'bodyFatPercent' && (m.value < 1 || m.value > 70)) {
    throw new Error(`Percentuale di massa grassa fuori intervallo plausibile: ${String(m.value)}%.`);
  }
  if (m.kind === 'weightKg' && (m.value < 20 || m.value > 400)) {
    throw new Error(`Peso fuori intervallo plausibile: ${String(m.value)} kg.`);
  }
}

/**
 * Punto della media mobile a 7 giorni.
 *
 * `observationCount` e' parte del risultato e va MOSTRATO: una media su 2
 * pesate non e' la stessa cosa di una media su 7, e la specifica (§15)
 * richiede di indicare quante osservazioni ci sono. Nessun valore mancante
 * viene interpolato.
 */
export interface MovingAveragePoint {
  readonly date: LocalDate;
  readonly average: number;
  readonly observationCount: number;
}

/** Check-in di recupero, indipendente dalle sedute. */
export interface RecoveryCheckIn {
  readonly id: string;
  readonly workspaceId: string;
  readonly date: LocalDate;
  /** 1-5, `null` = non dichiarato. Nessun punteggio composito inventato. */
  readonly sleepHours: number | null;
  readonly sleepQuality: number | null;
  readonly energy: number | null;
  readonly stress: number | null;
  readonly soreness: number | null;
  readonly note: string | null;
  readonly recordedAt: Instant;
  readonly revision: number;
}

/** Attivita' aggiuntiva: camminate e cardio fuori seduta. */
export interface HabitEntry {
  readonly id: string;
  readonly workspaceId: string;
  readonly date: LocalDate;
  readonly kind: 'walk' | 'cardio' | 'nutritionNote' | 'other';
  readonly minutes: number | null;
  /** Calorie e proteine sono dati MANUALI e facoltativi. */
  readonly manualKcal: number | null;
  readonly manualProteinG: number | null;
  readonly note: string | null;
  readonly recordedAt: Instant;
  readonly revision: number;
}

/** Fatica dichiarata per zona dopo una giornata in pista. */
export interface TrackFatigue {
  /** 1-5 per zona; `null` = non dichiarata. */
  readonly overall: number | null;
  readonly legs: number | null;
  readonly forearms: number | null;
  readonly shoulders: number | null;
  readonly neck: number | null;
}

export const EMPTY_TRACK_FATIGUE: TrackFatigue = {
  overall: null,
  legs: null,
  forearms: null,
  shoulders: null,
  neck: null,
};

/** Giornata in pista. */
export interface TrackDay {
  readonly id: string;
  readonly workspaceId: string;
  readonly date: LocalDate;
  /** Nome del circuito, testo libero. */
  readonly circuit: string;
  readonly sessionCount: number;
  readonly minutesPerSession: number | null;
  readonly fatigue: TrackFatigue;
  /**
   * Tempi sul giro facoltativi, in secondi.
   * L'app NON li attribuisce alla palestra (specifica §15).
   */
  readonly bestLapSeconds: number | null;
  readonly averageLapSeconds: number | null;
  readonly note: string | null;
  readonly recordedAt: Instant;
  readonly revision: number;
}

/** Foto di progresso: facoltativa, non sincronizzata per default. */
export interface ProgressPhoto {
  readonly id: string;
  readonly workspaceId: string;
  readonly date: LocalDate;
  /** Percorso locale nel contenitore protetto dell'app. */
  readonly localPath: string;
  readonly note: string | null;
  /**
   * true solo se l'utente ha attivato espressamente la sincronizzazione
   * delle foto. Mai inviata a un provider AI per impostazione predefinita.
   */
  readonly syncEnabled: boolean;
  readonly recordedAt: Instant;
  readonly revision: number;
}
