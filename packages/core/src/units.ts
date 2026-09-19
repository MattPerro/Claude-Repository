/**
 * Unita' di misura e convenzioni di carico.
 *
 * Regola fondamentale del progetto: un carico senza convenzione non ha
 * significato. 20 su una pressa non e' 20 su un'altra pressa, e 20 "per
 * manubrio" non e' 20 "totale bilanciere". Tutte le funzioni di confronto
 * passano da {@link comparabilityKey}.
 */

/** Unita' di peso. Il progetto usa solo kg (requisito §3 della specifica). */
export const WEIGHT_UNIT = 'kg' as const;
export type WeightUnit = typeof WEIGHT_UNIT;

/**
 * Come va interpretato il numero inserito nel campo "carico".
 *
 * Non sono interscambiabili e non esiste conversione automatica fra loro:
 * `machineStack` in particolare e' significativo solo insieme all'identita'
 * della macchina (vedi `equipmentInstanceId`).
 */
export type LoadConvention =
  /** Peso totale del bilanciere, bilanciere incluso. */
  | 'barbellTotal'
  /** Peso di CIASCUN manubrio (non la somma dei due). */
  | 'perDumbbell'
  /** Valore indicato dalla scala di UNA specifica macchina. Non portabile. */
  | 'machineStack'
  /** Corpo libero, nessun sovraccarico. Il campo carico e' assente. */
  | 'bodyweight'
  /** Corpo libero piu' un sovraccarico esplicito (il numero e' il sovraccarico). */
  | 'bodyweightPlus'
  /** Macchina ad assistenza: il numero RIDUCE il carico percepito. */
  | 'assisted'
  /** Esercizio a tempo/isometrico senza carico esterno. */
  | 'timeOnly';

export const LOAD_CONVENTIONS: readonly LoadConvention[] = [
  'barbellTotal',
  'perDumbbell',
  'machineStack',
  'bodyweight',
  'bodyweightPlus',
  'assisted',
  'timeOnly',
] as const;

/** Etichette italiane mostrate nell'interfaccia accanto al campo carico. */
export const LOAD_CONVENTION_LABEL: Record<LoadConvention, string> = {
  barbellTotal: 'kg totali (bilanciere incluso)',
  perDumbbell: 'kg per manubrio',
  machineStack: 'valore sulla macchina',
  bodyweight: 'corpo libero',
  bodyweightPlus: 'kg di sovraccarico',
  assisted: 'kg di assistenza',
  timeOnly: 'a tempo, senza carico',
};

/** Spiegazione breve, usata nei tooltip e nella schermata di registrazione. */
export const LOAD_CONVENTION_HELP: Record<LoadConvention, string> = {
  barbellTotal:
    'Inserisci il peso complessivo del bilanciere, compreso il bilanciere stesso.',
  perDumbbell:
    'Inserisci il peso di UN manubrio, non la somma dei due. Con due manubri da 12 kg scrivi 12.',
  machineStack:
    'Inserisci il numero indicato dalla scala di questa macchina. Non e\' confrontabile con un\'altra macchina, nemmeno dello stesso tipo.',
  bodyweight: 'Solo corpo libero: non c\'e\' un carico da inserire.',
  bodyweightPlus:
    'Inserisci solo il sovraccarico aggiunto (manubrio, cintura, giubbotto), non il peso del corpo.',
  assisted:
    'Inserisci i kg di assistenza. Piu\' il numero e\' alto, piu\' l\'esercizio e\' facile: i progressi vanno verso il basso.',
  timeOnly: 'Esercizio a tempo: si registrano i secondi, non un carico.',
};

/** Per questa convenzione il progresso significa "numero piu' basso". */
export function isInvertedProgress(convention: LoadConvention): boolean {
  return convention === 'assisted';
}

/** Per questa convenzione il campo carico non va compilato. */
export function requiresNoLoad(convention: LoadConvention): boolean {
  return convention === 'bodyweight' || convention === 'timeOnly';
}

/** Lato del corpo, per gli esercizi unilaterali. */
export type BodySide = 'left' | 'right' | 'both';

export const BODY_SIDE_LABEL: Record<BodySide, string> = {
  left: 'Sinistra',
  right: 'Destra',
  both: 'Entrambi',
};

/**
 * Come si misura una serie: ripetizioni o durata, per lato o bilaterale.
 * Determina quale tastiera mostrare e quale progressione e' applicabile.
 */
export type SetMetric = 'reps' | 'seconds';

/**
 * Chiave di comparabilita' di una prestazione.
 *
 * Due serie sono confrontabili SOLO se questa chiave coincide. Il motore
 * adattivo non guarda mai due prestazioni con chiavi diverse come se fossero
 * la stessa cosa (specifica §9, "CONFRONTI").
 */
export interface ComparabilityInput {
  readonly exerciseId: string;
  /** Variante dell'esercizio (presa, inclinazione, ampiezza...). */
  readonly variantId: string | null;
  readonly loadConvention: LoadConvention;
  /**
   * Identita' della macchina/attrezzo specifico. OBBLIGATORIO quando la
   * convenzione e' `machineStack` o `assisted`: senza questo, due valori
   * letti su macchine diverse non sono confrontabili.
   */
  readonly equipmentInstanceId: string | null;
  readonly metric: SetMetric;
  /** true se l'esercizio si esegue un lato per volta. */
  readonly perSide: boolean;
}

export const COMPARABILITY_KEY_VERSION = 1;

/**
 * Serializza la chiave di comparabilita'. Stringa stabile e ordinabile,
 * salvata insieme a ogni serie eseguita per rendere i confronti verificabili
 * e indipendenti dal codice che li ha generati.
 */
export function comparabilityKey(input: ComparabilityInput): string {
  const machineBound =
    input.loadConvention === 'machineStack' || input.loadConvention === 'assisted';
  if (machineBound && (input.equipmentInstanceId === null || input.equipmentInstanceId === '')) {
    throw new Error(
      `comparabilityKey: la convenzione "${input.loadConvention}" richiede equipmentInstanceId ` +
        `(esercizio ${input.exerciseId}). Senza l'identita' della macchina il valore non e' confrontabile.`,
    );
  }
  return [
    `v${String(COMPARABILITY_KEY_VERSION)}`,
    input.exerciseId,
    input.variantId ?? '-',
    input.loadConvention,
    // Per le convenzioni non legate a una macchina l'identita' dell'attrezzo
    // e' irrilevante e viene deliberatamente esclusa dalla chiave: due sedute
    // con manubri diversi dello stesso peso SONO confrontabili.
    machineBound ? (input.equipmentInstanceId ?? '-') : '-',
    input.metric,
    input.perSide ? 'perSide' : 'bilateral',
  ].join('|');
}

/** Vero se le due prestazioni possono entrare nello stesso confronto. */
export function areComparable(a: ComparabilityInput, b: ComparabilityInput): boolean {
  try {
    return comparabilityKey(a) === comparabilityKey(b);
  } catch {
    return false;
  }
}

/**
 * Incremento minimo realmente disponibile su un attrezzo.
 *
 * Non esiste una percentuale valida per tutte le macchine: la pressa sale di
 * 5 kg, i manubri di 1 o 2 kg, un pacco pesi puo' salire di 4,5 kg.
 * Il valore e' un dato di configurazione dell'attrezzatura, non una costante
 * del motore (specifica §9).
 */
export interface LoadStep {
  /** Gradino minimo, in kg, nell'unita' della convenzione dell'esercizio. */
  readonly stepKg: number;
  /** Carico minimo impostabile (es. il solo carrello della pressa). */
  readonly minKg: number | null;
  /** Carico massimo impostabile, se noto. */
  readonly maxKg: number | null;
  /** Testo libero: "microcarichi da 1,25 kg disponibili", "pacco a 5 kg". */
  readonly note: string | null;
}

/** Incremento di riserva quando l'attrezzo non e' ancora stato configurato. */
export const UNKNOWN_LOAD_STEP: LoadStep = {
  stepKg: 0,
  minKg: null,
  maxKg: null,
  note: 'Incremento non configurato per questo attrezzo.',
};

/**
 * Arrotonda un carico al gradino realmente disponibile sull'attrezzo,
 * arrotondando verso il basso (mai proporre un carico non impostabile).
 * Restituisce `null` se il gradino non e' configurato: in quel caso il motore
 * non deve inventare un numero (§9: "Con dati insufficienti non proporre un
 * aumento ingiustificato").
 */
export function snapToStep(targetKg: number, step: LoadStep): number | null {
  if (!Number.isFinite(targetKg) || targetKg < 0) return null;
  if (step.stepKg <= 0) return null;
  const base = step.minKg ?? 0;
  if (targetKg < base) return null;
  const steps = Math.floor((targetKg - base) / step.stepKg + 1e-9);
  let value = roundKg(base + steps * step.stepKg);
  if (step.maxKg !== null && value > step.maxKg) value = roundKg(step.maxKg);
  return value;
}

/**
 * Prossimo carico impostabile, strettamente superiore a `currentKg`.
 * `null` se il gradino non e' noto o il massimo dell'attrezzo e' raggiunto.
 */
export function nextLoadUp(currentKg: number, step: LoadStep): number | null {
  if (step.stepKg <= 0) return null;
  const next = roundKg(currentKg + step.stepKg);
  if (step.maxKg !== null && next > step.maxKg) return null;
  return next;
}

/** Precedente carico impostabile, strettamente inferiore a `currentKg`. */
export function nextLoadDown(currentKg: number, step: LoadStep): number | null {
  if (step.stepKg <= 0) return null;
  const prev = roundKg(currentKg - step.stepKg);
  const floor = step.minKg ?? 0;
  if (prev < floor) return null;
  return prev;
}

/** I kg si conservano con 2 decimali: evita 12.500000000000002 nei totali. */
export function roundKg(kg: number): number {
  return Math.round(kg * 100) / 100;
}

/**
 * Formatta un numero con la virgola decimale italiana.
 * L'interfaccia mostra "12,5 kg", non "12.5 kg" (specifica §11).
 */
export function formatDecimalIt(value: number, maxDecimals = 2): string {
  const rounded = Number(value.toFixed(maxDecimals));
  return rounded.toLocaleString('it-IT', { maximumFractionDigits: maxDecimals });
}

/** Formatta un carico con la sua unita'. */
export function formatKgIt(kg: number): string {
  return `${formatDecimalIt(kg)} kg`;
}

/**
 * Interpreta un numero scritto dall'utente italiano, accettando sia la virgola
 * sia il punto. Restituisce `null` per input vuoti o non numerici: un campo
 * illeggibile non diventa 0 (uno 0 salvato come carico e' un dato falso).
 */
export function parseDecimalIt(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  // Rifiuta input con entrambi i separatori o con separatori multipli:
  // "1.234,5" e "1,2,3" sono ambigui e vanno corretti dall'utente.
  const commas = (trimmed.match(/,/g) ?? []).length;
  const dots = (trimmed.match(/\./g) ?? []).length;
  if (commas > 1 || dots > 1 || (commas === 1 && dots === 1)) return null;
  const normalised = trimmed.replace(',', '.');
  if (!/^-?\d*\.?\d*$/.test(normalised) || !/\d/.test(normalised)) return null;
  const value = Number(normalised);
  return Number.isFinite(value) ? value : null;
}

/** Formatta una durata in secondi come "1:30" oppure "45 s". */
export function formatDurationIt(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return `${String(s)} s`;
  const minutes = Math.floor(s / 60);
  const seconds = s % 60;
  return `${String(minutes)}:${String(seconds).padStart(2, '0')}`;
}

/** Formatta minuti interi come "1 h 15 min" oppure "45 min". */
export function formatMinutesIt(totalMinutes: number): string {
  const m = Math.max(0, Math.round(totalMinutes));
  if (m < 60) return `${String(m)} min`;
  const hours = Math.floor(m / 60);
  const minutes = m % 60;
  return minutes === 0 ? `${String(hours)} h` : `${String(hours)} h ${String(minutes)} min`;
}
