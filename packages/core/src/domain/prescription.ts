/**
 * Prescrizione: che cosa il programma chiede di fare in una serie.
 *
 * Distinzione richiesta dalla specifica (§5) e rispettata in tutto il
 * dominio - i quattro stati di un numero non sono la stessa cosa:
 *
 *  - PRESCRITTO   quello che il programma chiede (questo file)
 *  - SUGGERITO    quello che il motore adattivo propone
 *  - PRECOMPILATO quello che l'interfaccia mette nel campo per comodita'
 *  - ESEGUITO     quello che Mattia ha davvero fatto
 *
 * Solo l'ESEGUITO alimenta i progressi e le progressioni.
 */

import type { LoadConvention, SetMetric } from '../units.js';

/** Intervallo chiuso di ripetizioni o di secondi. */
export interface TargetRange {
  readonly min: number;
  readonly max: number;
}

export function range(min: number, max: number): TargetRange {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max || min < 0) {
    throw new Error(`Intervallo non valido: ${String(min)}-${String(max)}.`);
  }
  return { min, max };
}

/** Intervallo con un solo valore, es. "8 per gamba". */
export function exact(value: number): TargetRange {
  return range(value, value);
}

export function isSingleValue(r: TargetRange): boolean {
  return r.min === r.max;
}

/** Formatta un intervallo come "6-8" oppure "8". */
export function formatRange(r: TargetRange): string {
  return isSingleValue(r) ? String(r.min) : `${String(r.min)}-${String(r.max)}`;
}

/**
 * Bersaglio di sforzo.
 *
 * Per gli esercizi a tempo NON si impone un RIR: la specifica (§7) chiede di
 * usare durata e controllo. `durationControl` e' quindi un tipo a se', non un
 * RIR con valori finti.
 */
export type EffortTarget =
  | {
      readonly kind: 'rir';
      /** Ripetizioni in riserva attese, come intervallo (es. 2-3). */
      readonly rir: TargetRange;
    }
  | {
      readonly kind: 'durationControl';
      /** Indicazione testuale: "mantieni la posizione, fermati se cede". */
      readonly cue: string;
    };

export function rirTarget(min: number, max: number = min): EffortTarget {
  return { kind: 'rir', rir: range(min, max) };
}

export function durationControlTarget(cue: string): EffortTarget {
  return { kind: 'durationControl', cue };
}

/** Testo italiano del bersaglio di sforzo. */
export function formatEffortIt(effort: EffortTarget): string {
  if (effort.kind === 'durationControl') return effort.cue;
  return isSingleValue(effort.rir)
    ? `RIR ${String(effort.rir.min)}`
    : `RIR ${formatRange(effort.rir)}`;
}

/**
 * Recupero prescritto.
 *
 * Quando la specifica indica un intervallo ("60-90 secondi") l'interfaccia
 * mostra l'intervallo e il timer parte dal limite SUPERIORE (§7).
 */
export interface RestSpec {
  readonly minSeconds: number;
  readonly maxSeconds: number;
}

export function rest(minSeconds: number, maxSeconds: number = minSeconds): RestSpec {
  if (minSeconds < 0 || maxSeconds < minSeconds) {
    throw new Error(`Recupero non valido: ${String(minSeconds)}-${String(maxSeconds)} s.`);
  }
  return { minSeconds, maxSeconds };
}

/** Durata con cui il timer di recupero viene avviato: il limite superiore. */
export function defaultRestSeconds(spec: RestSpec): number {
  return spec.maxSeconds;
}

export function formatRestIt(spec: RestSpec): string {
  return spec.minSeconds === spec.maxSeconds
    ? `${String(spec.maxSeconds)} s`
    : `${String(spec.minSeconds)}-${String(spec.maxSeconds)} s`;
}

/**
 * Ruolo di una serie.
 *
 * Le serie di riscaldamento NON contano come serie allenanti e NON attivano
 * progressioni (specifica §7). La distinzione e' nel tipo, non in un flag
 * booleano opzionale che si puo' dimenticare.
 */
export type SetRole = 'warmup' | 'working';

/** Prescrizione di un esercizio dentro una seduta. */
export interface ExercisePrescription {
  /** Posizione nella seduta, 1-based. */
  readonly order: number;
  readonly exerciseId: string;
  /** Variante prescritta, se il programma ne specifica una. */
  readonly variantId: string | null;
  /** Numero di serie ALLENANTI. */
  readonly workingSets: number;
  /** Ripetizioni o secondi per serie. */
  readonly target: TargetRange;
  readonly metric: SetMetric;
  /** true se il bersaglio e' "per lato" / "per gamba". */
  readonly perSide: boolean;
  readonly effort: EffortTarget;
  readonly rest: RestSpec;
  /**
   * Convenzione di carico attesa. Serve a mostrare la tastiera e l'etichetta
   * giuste, e a rifiutare confronti fra convenzioni diverse.
   */
  readonly loadConvention: LoadConvention;
  /** Esercizi ammessi come sostituzione, in ordine di preferenza. */
  readonly alternativeExerciseIds: readonly string[];
  /** Nota operativa mostrata in seduta, es. "gradino basso, corpo libero". */
  readonly note: string | null;
  /**
   * Priorita' per la riduzione del lavoro quando c'e' meno tempo.
   * 1 = da conservare sempre; numeri piu' alti = tagliabili prima.
   * Evita il "taglio indiscriminato dei recuperi" vietato dalla specifica (§9).
   */
  readonly timePriority: number;
}

/** Blocco di cardio prescritto (cyclette). */
export type CardioPrescription =
  | {
      readonly kind: 'steady';
      readonly minutes: TargetRange;
      /** "facile", "sostenuto": descrizione, non una frequenza cardiaca inventata. */
      readonly intensityCue: string;
      readonly note: string | null;
    }
  | {
      readonly kind: 'intervals';
      readonly warmupMinutes: number;
      readonly rounds: number;
      readonly hardSeconds: number;
      readonly easySeconds: number;
      readonly cooldownMinutes: number;
      readonly intensityCue: string;
      readonly note: string | null;
      /**
       * true = l'alternativa e' FACOLTATIVA e va scelta espressamente.
       * Non si attiva da sola col passare dei giorni (specifica §7).
       */
      readonly optIn: boolean;
    };

/** Durata totale in minuti di una prescrizione cardio (per le stime). */
export function cardioMinutes(cardio: CardioPrescription): number {
  if (cardio.kind === 'steady') return cardio.minutes.max;
  const intervalSeconds = cardio.rounds * (cardio.hardSeconds + cardio.easySeconds);
  return cardio.warmupMinutes + intervalSeconds / 60 + cardio.cooldownMinutes;
}

export function formatCardioIt(cardio: CardioPrescription): string {
  if (cardio.kind === 'steady') {
    return `Cyclette ${formatRange(cardio.minutes)} min ${cardio.intensityCue}`;
  }
  return (
    `Cyclette a intervalli: ${String(cardio.warmupMinutes)} min facili, ` +
    `${String(cardio.rounds)} x (${String(cardio.hardSeconds)} s ${cardio.intensityCue} + ` +
    `${String(cardio.easySeconds)} s facili), ${String(cardio.cooldownMinutes)} min facili`
  );
}

/** Voce del riscaldamento: descrittiva, non una serie allenante. */
export interface WarmupItem {
  readonly order: number;
  /** Nome breve mostrato in seduta. */
  readonly label: string;
  /** Come si esegue, in una frase. */
  readonly detail: string;
  /** Durata indicativa in secondi, per la stima della seduta. */
  readonly estimatedSeconds: number;
  /**
   * Se la voce e' "serie leggere sul primo esercizio", indica quante:
   * servono al motore per sapere che quelle serie non sono allenanti.
   */
  readonly warmupSetsOnExerciseOrder: number | null;
  readonly warmupSetCount: number;
}

/** Identificativo della seduta all'interno della settimana. */
export type SessionSlot = 'A' | 'B';

/** Prescrizione completa di una seduta. */
export interface SessionPrescription {
  readonly slot: SessionSlot;
  /** Nome mostrato, es. "Allenamento A - spinta e pressa". */
  readonly title: string;
  /** Una frase sullo scopo della seduta, mostrata dal coach. */
  readonly focus: string;
  readonly warmup: readonly WarmupItem[];
  readonly exercises: readonly ExercisePrescription[];
  readonly cardio: readonly CardioPrescription[];
}
