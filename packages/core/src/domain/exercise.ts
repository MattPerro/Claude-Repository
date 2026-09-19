/**
 * Libreria degli esercizi.
 *
 * Ogni esercizio porta con se' una guida offline completa, in italiano
 * (specifica §14). Il testo deve bastare da solo: nessun video, nessun link,
 * nessuna illustrazione inventata.
 */

import type { LoadConvention, LoadStep, SetMetric } from '../units.js';

export type MovementPattern =
  | 'squat'
  | 'hinge'
  | 'lunge'
  | 'horizontalPush'
  | 'horizontalPull'
  | 'verticalPush'
  | 'verticalPull'
  | 'kneeFlexion'
  | 'hipAbduction'
  | 'hipAdduction'
  | 'antiRotation'
  | 'antiLateralFlexion'
  | 'antiExtension'
  | 'carry'
  | 'cardio';

export const MOVEMENT_PATTERN_LABEL: Record<MovementPattern, string> = {
  squat: 'Spinta di gambe (schema di accosciata)',
  hinge: 'Flessione delle anche',
  lunge: 'Appoggio su una gamba',
  horizontalPush: 'Spinta orizzontale',
  horizontalPull: 'Tirata orizzontale',
  verticalPush: 'Spinta verticale',
  verticalPull: 'Tirata verticale',
  kneeFlexion: 'Flessione del ginocchio',
  hipAbduction: 'Apertura delle anche',
  hipAdduction: 'Chiusura delle anche',
  antiRotation: 'Resistenza alla rotazione',
  antiLateralFlexion: 'Resistenza alla flessione laterale',
  antiExtension: 'Resistenza all\'estensione',
  carry: 'Trasporto di carico',
  cardio: 'Lavoro aerobico',
};

/** Categoria di attrezzatura, usata per le sostituzioni compatibili. */
export type EquipmentKind =
  | 'legPressMachine'
  | 'chestPressMachine'
  | 'latMachine'
  | 'cableColumn'
  | 'legCurlMachine'
  | 'adductorMachine'
  | 'hipThrustMachine'
  | 'dumbbells'
  | 'barbell'
  | 'bench'
  | 'inclineBench'
  | 'step'
  | 'stationaryBike'
  | 'bodyweightOnly';

export const EQUIPMENT_LABEL: Record<EquipmentKind, string> = {
  legPressMachine: 'Pressa per le gambe',
  chestPressMachine: 'Chest press alla macchina',
  latMachine: 'Lat machine',
  cableColumn: 'Cavi regolabili',
  legCurlMachine: 'Leg curl',
  adductorMachine: 'Macchina per gli adduttori',
  hipThrustMachine: 'Macchina per hip thrust',
  dumbbells: 'Manubri',
  barbell: 'Bilanciere',
  bench: 'Panca piana',
  inclineBench: 'Panca inclinabile',
  step: 'Gradino / step',
  stationaryBike: 'Cyclette',
  bodyweightOnly: 'Solo corpo libero',
};

/**
 * Guida offline di un esercizio. Tutti i campi sono obbligatori: se non c'e'
 * niente da dire su una voce, si scrive una frase, non si lascia vuoto.
 */
export interface ExerciseGuide {
  /** Muscoli principalmente coinvolti, in linguaggio comune. */
  readonly primaryMuscles: readonly string[];
  readonly secondaryMuscles: readonly string[];
  /** Impostazione della macchina o della postazione, passo per passo. */
  readonly setup: readonly string[];
  /** Esecuzione, passo per passo. */
  readonly execution: readonly string[];
  /** Respirazione di base. */
  readonly breathing: string;
  /** Indicazioni rapide: 3-5 frasi brevi, mostrate durante la seduta. */
  readonly quickCues: readonly string[];
  /** Errori comuni e come si riconoscono. */
  readonly commonMistakes: readonly string[];
  /** Accorgimenti specifici per chi rientra dopo una lunga pausa. */
  readonly returningNotes: readonly string[];
  /** Varianti utili e quando usarle. */
  readonly variantNotes: readonly string[];
  /** Cosa annotare fra le regolazioni personali (sedile, schienale, presa). */
  readonly personalSettingsToRecord: readonly string[];
  /**
   * A che cosa serve nella preparazione per la moto.
   * Formulato come finalita' della preparazione generale, non come garanzia
   * di miglioramento sul giro (specifica §14).
   */
  readonly motorcyclePurpose: string;
}

/** Variante di un esercizio: cambia la prestazione, quindi lo storico. */
export interface ExerciseVariant {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /**
   * true se la variante e' abbastanza diversa da non essere confrontabile
   * con la versione base. Entra nella chiave di comparabilita'.
   */
  readonly separateHistory: boolean;
}

export interface Exercise {
  readonly id: string;
  readonly name: string;
  /** Nome breve per gli spazi stretti della schermata di seduta. */
  readonly shortName: string;
  readonly pattern: MovementPattern;
  readonly equipment: readonly EquipmentKind[];
  readonly loadConvention: LoadConvention;
  readonly metric: SetMetric;
  /** true se si esegue un lato per volta. */
  readonly perSide: boolean;
  /**
   * true se il recupero principale va DOPO entrambi i lati.
   * Lo step-up e' il caso previsto dalla specifica (§13).
   */
  readonly restAfterBothSides: boolean;
  /** Secondi stimati per una ripetizione, per la stima di durata. */
  readonly secondsPerRep: number;
  /** Secondi di preparazione fra un esercizio e il successivo. */
  readonly transitionSeconds: number;
  readonly guide: ExerciseGuide;
  /** Esercizi che possono sostituirlo mantenendo lo scopo. */
  readonly compatibleAlternativeIds: readonly string[];
  /**
   * Incremento di carico tipico dell'attrezzo. E' un valore di partenza
   * SUGGERITO: l'attrezzatura reale della palestra si configura per istanza
   * (vedi EquipmentInstance) e vince su questo.
   */
  readonly defaultLoadStep: LoadStep;
  readonly variants: readonly ExerciseVariant[];
}

/**
 * Attrezzo fisico specifico in una palestra specifica.
 *
 * Esiste perche' "60 alla pressa" e' un dato privo di senso senza sapere QUALE
 * pressa: due presse diverse hanno leve e scale diverse. Il motore adattivo
 * non confronta prestazioni su istanze diverse (specifica §9).
 */
export interface EquipmentInstance {
  readonly id: string;
  /** Nome dato da Mattia: "pressa 45 gradi sala pesi". */
  readonly label: string;
  readonly kind: EquipmentKind;
  /** Palestra o luogo, testo libero. */
  readonly location: string | null;
  /** Incremento realmente disponibile su QUESTO attrezzo. */
  readonly loadStep: LoadStep;
  /** Regolazioni annotate: sedile, schienale, maniglia, altezza. */
  readonly settingsNote: string | null;
}

/** Indice della libreria per accessi rapidi. */
export class ExerciseLibrary {
  private readonly byId: Map<string, Exercise>;

  constructor(exercises: readonly Exercise[]) {
    this.byId = new Map();
    for (const exercise of exercises) {
      if (this.byId.has(exercise.id)) {
        throw new Error(`Esercizio duplicato nella libreria: ${exercise.id}`);
      }
      this.byId.set(exercise.id, exercise);
    }
  }

  /** Restituisce l'esercizio o lancia: un ID sconosciuto e' un errore di dati. */
  get(id: string): Exercise {
    const exercise = this.byId.get(id);
    if (exercise === undefined) {
      throw new UnknownExerciseError(id);
    }
    return exercise;
  }

  find(id: string): Exercise | undefined {
    return this.byId.get(id);
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  all(): readonly Exercise[] {
    return [...this.byId.values()];
  }

  get size(): number {
    return this.byId.size;
  }

  variant(exerciseId: string, variantId: string): ExerciseVariant {
    const found = this.get(exerciseId).variants.find((v) => v.id === variantId);
    if (found === undefined) {
      throw new Error(`Variante sconosciuta "${variantId}" per l'esercizio "${exerciseId}".`);
    }
    return found;
  }
}

/**
 * Esercizio non presente in libreria.
 *
 * Errore dedicato perche' e' uno dei casi che il validatore delle proposte
 * generative deve rifiutare: un modello linguistico che inventa un esercizio
 * non deve poter scrivere nel programma (specifica §10).
 */
export class UnknownExerciseError extends Error {
  constructor(readonly exerciseId: string) {
    super(`Esercizio sconosciuto: "${exerciseId}". Non e' presente nella libreria.`);
    this.name = 'UnknownExerciseError';
  }
}
