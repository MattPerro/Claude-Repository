/**
 * Esposizioni: l'unita' di confronto del motore adattivo.
 *
 * Un'esposizione e' "questo esercizio, in questa seduta, su questo attrezzo,
 * con questa convenzione di carico". Due esposizioni sono confrontabili solo
 * se hanno la stessa chiave di comparabilita' (`units.ts`).
 *
 * Tutto cio' che il motore sa viene da qui, e qui entrano SOLO fatti: serie
 * con `status === 'completed'` e ruolo `working`. Le bozze, le serie annullate,
 * le serie di riscaldamento e i valori precompilati non compaiono.
 */

import type { ExercisePrescription, TargetRange } from '../domain/prescription.js';
import type { SetMetric } from '../units.js';
import { requiresNoLoad } from '../units.js';
import type {
  DiscomfortReport,
  PerformedExercise,
  PerformedSet,
  Session,
  TechniqueRating,
} from '../domain/session.js';
import type { Instant, LocalDate } from '../time.js';
import { compareDates } from '../time.js';
import { workingSetsCompleted } from '../domain/session.js';

/** Una seduta con i suoi dati, come arriva dal livello di persistenza. */
export interface SessionHistoryEntry {
  readonly session: Session;
  readonly exercises: readonly PerformedExercise[];
  readonly sets: readonly PerformedSet[];
}

/** Esposizione di un esercizio in una seduta. */
export interface Exposure {
  readonly sessionId: string;
  /** Data di ESECUZIONE. Le esposizioni non svolte non esistono. */
  readonly date: LocalDate;
  readonly exerciseId: string;
  readonly variantId: string | null;
  readonly comparabilityKey: string;
  readonly equipmentInstanceId: string | null;
  /** Serie allenanti CONFERMATE. */
  readonly completedSets: readonly PerformedSet[];
  readonly technique: TechniqueRating | null;
  readonly discomfort: DiscomfortReport | null;
  /** Prescrizione congelata all'avvio della seduta. */
  readonly prescription: ExercisePrescription;
  readonly metric: SetMetric;
  readonly target: TargetRange;
  readonly perSide: boolean;
  /**
   * Carico rappresentativo dell'esposizione, `null` se non applicabile
   * (corpo libero, esercizi a tempo) o se le serie hanno usato carichi
   * diversi fra loro.
   */
  readonly loadKg: number | null;
  /** true se le serie completate hanno usato carichi diversi fra loro. */
  readonly mixedLoads: boolean;
  /**
   * true se ALCUNE serie hanno un carico e altre no. E' un dato incompleto:
   * il motore non deve trattarlo come un carico uniforme.
   */
  readonly partialLoads: boolean;
  /** true se l'esercizio non prevede un carico (corpo libero, a tempo). */
  readonly loadNotApplicable: boolean;
  /** Settimana di programma della fotografia, per la diagnostica. */
  readonly weekIndex: number;
  readonly blockId: string;
  /**
   * Firma della prescrizione: serie previste, intervallo e sforzo.
   *
   * Due esposizioni con firme diverse non sono confrontabili come RISULTATO,
   * anche se l'attrezzo e' lo stesso. E' quello che impedisce a una settimana
   * di scarico (meno serie, margine piu' ampio) di "confermare" un
   * incremento.
   */
  readonly prescriptionSignature: string;
  /** Istante di avvio della seduta, per ordinare due sedute nello stesso giorno. */
  readonly startedAt: Instant | null;
}

/**
 * Firma della parte di prescrizione che rende due risultati confrontabili.
 *
 * Non include il recupero ne' la convenzione di carico: il recupero non cambia
 * cosa significa "8 ripetizioni", e la convenzione e' gia' nella chiave di
 * comparabilita'.
 */
export function prescriptionSignature(prescription: ExercisePrescription): string {
  const effort =
    prescription.effort.kind === 'rir'
      ? `rir:${String(prescription.effort.rir.min)}-${String(prescription.effort.rir.max)}`
      : 'duration';
  return [
    `sets:${String(prescription.workingSets)}`,
    `target:${String(prescription.target.min)}-${String(prescription.target.max)}`,
    `metric:${prescription.metric}`,
    `perSide:${String(prescription.perSide)}`,
    effort,
  ].join('|');
}

/**
 * Estrae le esposizioni confrontabili dallo storico.
 *
 * Ordina dalla piu' recente alla piu' vecchia. Le sedute senza data di
 * esecuzione (pianificate, saltate) vengono ignorate: una seduta saltata non
 * e' un'esposizione (specifica §3.11).
 */
export function extractExposures(history: readonly SessionHistoryEntry[]): readonly Exposure[] {
  const out: Exposure[] = [];

  for (const entry of history) {
    const performedDate = entry.session.performedDate;
    if (performedDate === null) continue;

    const snapshot = entry.session.snapshot.prescription;

    for (const performed of entry.exercises) {
      if (performed.skipped) continue;

      const sets = workingSetsCompleted(
        entry.sets.filter((s) => s.performedExerciseId === performed.id),
      );
      if (sets.length === 0) continue;

      // La chiave e' quella SALVATA con le serie, non ricalcolata: cosi' un
      // confronto resta riproducibile anche se il codice cambia. Se le serie
      // di una stessa esposizione avessero chiavi diverse (attrezzo cambiato
      // a metà esercizio) l'esposizione viene scartata: non e' un confronto
      // legittimo.
      const keys = new Set(sets.map((s) => s.comparabilityKey));
      if (keys.size !== 1) continue;
      const comparabilityKey = sets[0]?.comparabilityKey;
      if (comparabilityKey === undefined) continue;

      // La prescrizione si cerca SOLO per esercizio effettivamente svolto.
      //
      // Qui c'era un ripiego "altrimenti prendi quella in questa posizione",
      // che contraddiceva il commento sopra e produceva il difetto peggiore
      // trovato in revisione: dopo una sostituzione, un leg curl (prescritto
      // 10-12) veniva giudicato contro l'intervallo 6-8 della pressa, e 8
      // ripetizioni contavano come "limite superiore raggiunto".
      //
      // Se la prescrizione dell'esercizio svolto non e' nella fotografia,
      // l'esposizione NON e' valutabile: non si giudica una prestazione con
      // l'intervallo di un altro esercizio. Viene scartata.
      const prescription = snapshot.exercises.find(
        (p) => p.exerciseId === performed.exerciseId,
      );
      if (prescription === undefined) continue;

      // I carichi vanno classificati in TRE casi, non due.
      //
      // Prima i `null` venivano filtrati prima del controllo di uniformita',
      // quindi tre serie a 60 / assente / 60 diventavano "carico uniforme 60
      // kg": un dato mancante si trasformava in un dato presente, e la
      // proposta ne citava il valore come se fosse stato registrato.
      const rawLoads = sets.map((s) => s.load.kg);
      const presentLoads = rawLoads.filter((kg): kg is number => kg !== null);
      const allAbsent = presentLoads.length === 0;
      const allPresent = presentLoads.length === rawLoads.length;
      const uniquePresent = new Set(presentLoads);
      // `partialLoads`: alcune serie hanno un carico e altre no. E' un dato
      // incompleto, e il motore lo deve trattare come tale.
      const partialLoads = !allAbsent && !allPresent;

      const firstSet = sets[0];
      if (firstSet === undefined) continue;

      out.push({
        sessionId: entry.session.id,
        date: performedDate,
        exerciseId: performed.exerciseId,
        variantId: performed.variantId,
        comparabilityKey,
        equipmentInstanceId: performed.equipmentInstanceId,
        completedSets: sets,
        technique: performed.technique,
        discomfort: performed.discomfort,
        prescription,
        metric: firstSet.metric,
        target: prescription.target,
        perSide: prescription.perSide,
        loadKg: allPresent && uniquePresent.size === 1 ? (presentLoads[0] ?? null) : null,
        mixedLoads: uniquePresent.size > 1,
        partialLoads,
        // L'esercizio non prevede un carico: e' un fatto, non un dato
        // mancante. Serve a non chiedere all'utente di colmare
        // un'informazione che non potra' mai esistere (difetto M5).
        loadNotApplicable: requiresNoLoad(prescription.loadConvention),
        weekIndex: entry.session.snapshot.weekIndex,
        blockId: entry.session.snapshot.blockId,
        prescriptionSignature: prescriptionSignature(prescription),
        startedAt: entry.session.startedAt,
      });
    }
  }

  // Ordina dalla piu' recente. A parita' di data si usa l'istante di avvio:
  // senza questo, con due sedute nello stesso giorno le "due esposizioni piu'
  // recenti" erano quelle che capitavano prima nell'array, e l'esito del
  // motore dipendeva dall'ordine con cui il chiamante passava lo storico.
  return out.sort((a, b) => {
    const byDate = compareDates(b.date, a.date);
    if (byDate !== 0) return byDate;
    // `?? 0` qui riguarda un criterio di ORDINAMENTO, non un dato
    // dell'atleta: una seduta senza istante di avvio finisce in coda fra
    // quelle dello stesso giorno. Nessun valore mancante diventa un
    // risultato.
    return (b.startedAt ?? 0) - (a.startedAt ?? 0);
  });
}

/**
 * Raggruppa le esposizioni per chiave di comparabilita'.
 *
 * E' questo raggruppamento che impedisce di confrontare due macchine diverse,
 * il peso di un manubrio con il totale di un bilanciere, o secondi con
 * ripetizioni (specifica §5.3).
 */
export function groupByComparability(
  exposures: readonly Exposure[],
): ReadonlyMap<string, readonly Exposure[]> {
  const map = new Map<string, Exposure[]>();
  for (const exposure of exposures) {
    const list = map.get(exposure.comparabilityKey);
    if (list === undefined) {
      map.set(exposure.comparabilityKey, [exposure]);
    } else {
      list.push(exposure);
    }
  }
  return map;
}

/** Quante esecuzioni ha richiesto la prescrizione (due per gli esercizi per lato). */
export function prescribedSetEvents(prescription: ExercisePrescription): number {
  return prescription.workingSets * (prescription.perSide ? 2 : 1);
}

/** Valore eseguito di una serie: ripetizioni oppure secondi. */
export function performedValue(set: PerformedSet): number | null {
  return set.metric === 'seconds' ? set.seconds : set.reps;
}

/**
 * Tutte le serie allenanti previste hanno raggiunto il LIMITE SUPERIORE
 * dell'intervallo?
 *
 * Richiede anche che il numero di serie completate copra quello prescritto:
 * due serie su tre al limite superiore non sono "tutte le serie previste".
 * Un valore mancante (`null`) fa fallire il controllo: non e' un successo.
 */
export function allSetsAtRangeTop(exposure: Exposure): boolean {
  // Zero serie non sono "tutte le serie": `[].every()` vale `true`, e senza
  // questa guardia un'esposizione vuota soddisfaceva la condizione.
  if (exposure.completedSets.length === 0) return false;
  const required = prescribedSetEvents(exposure.prescription);
  // Una prescrizione che non chiede nessuna serie non e' un riferimento
  // valido per dichiarare un limite superiore raggiunto.
  if (required < 1) return false;
  if (exposure.completedSets.length < required) return false;
  return exposure.completedSets.every((set) => {
    const value = performedValue(set);
    return value !== null && value >= exposure.target.max;
  });
}

/**
 * Valore eseguito PIU' BASSO dell'esposizione.
 *
 * Si chiamava `bestPerformedValue` ma restituiva il minimo: il nome diceva il
 * contrario di quello che faceva, e un chiamante l'ha usata come "valore
 * corrente" producendo una proposta sotto il minimo prescritto.
 */
export function lowestPerformedValue(exposure: Exposure): number | null {
  const values = exposure.completedSets
    .map(performedValue)
    .filter((v): v is number => v !== null);
  return values.length === 0 ? null : Math.min(...values);
}

/** Valore eseguito piu' alto dell'esposizione. */
export function highestPerformedValue(exposure: Exposure): number | null {
  const values = exposure.completedSets
    .map(performedValue)
    .filter((v): v is number => v !== null);
  return values.length === 0 ? null : Math.max(...values);
}

/**
 * Volume `carico x ripetizioni` dell'esposizione, con convenzione esplicita.
 *
 * Restituisce `null` quando il volume non ha senso: esercizi a tempo, corpo
 * libero senza sovraccarico, assistenza. La specifica (§13.1) ammette il
 * volume "dove sensato, con convenzione esplicita", e vieta di trattare
 * secondi e ripetizioni come equivalenti.
 *
 * Per `perDumbbell` il volume usa il peso di UN manubrio moltiplicato per due,
 * perche' entrambi vengono sollevati: la convenzione e' dichiarata nel
 * risultato, non nascosta.
 * Per `bodyweightPlus` conta SOLO il sovraccarico: il peso corporeo non viene
 * sommato (specifica §5.3).
 */
export interface VolumeResult {
  readonly kg: number;
  readonly convention: string;
}

export function exposureVolume(exposure: Exposure): VolumeResult | null {
  if (exposure.metric === 'seconds') return null;
  if (exposure.completedSets.length === 0) return null;
  // Carichi parzialmente assenti: nessun volume attendibile.
  if (exposure.partialLoads) return null;
  // Convenzioni diverse nella stessa esposizione: sommarle e dichiararne una
  // sola produce un numero senza significato. La chiave di comparabilita' lo
  // impedisce con dati validi, ma questa funzione e' esportata.
  const conventions = new Set(exposure.completedSets.map((s) => s.load.convention));
  if (conventions.size > 1) return null;

  let total = 0;
  let convention = '';

  for (const set of exposure.completedSets) {
    const reps = set.reps;
    const kg = set.load.kg;
    if (reps === null) return null;

    switch (set.load.convention) {
      case 'barbellTotal':
      case 'machineStack':
        if (kg === null) return null;
        total += kg * reps;
        convention =
          set.load.convention === 'barbellTotal'
            ? 'kg totali del bilanciere x ripetizioni'
            : 'valore della macchina x ripetizioni (confrontabile solo su questa macchina)';
        break;
      case 'perDumbbell':
        if (kg === null) return null;
        // Negli esercizi PER LATO si solleva un manubrio per volta: non si
        // moltiplica per due. Farlo raddoppiava il volume di ogni esercizio
        // unilaterale con manubri.
        if (exposure.perSide) {
          total += kg * reps;
          convention = 'kg per manubrio x ripetizioni (un lato per volta)';
        } else {
          total += kg * 2 * reps;
          convention = 'kg per manubrio x 2 x ripetizioni';
        }
        break;
      case 'bodyweightPlus':
        if (kg === null) return null;
        // Solo il sovraccarico: il peso corporeo non entra nel volume.
        total += kg * reps;
        convention = 'kg di sovraccarico x ripetizioni (peso corporeo escluso)';
        break;
      case 'bodyweight':
      case 'timeOnly':
      case 'assisted':
        // Nessun volume sensato: non si inventa un numero.
        return null;
      default:
        return null;
    }
  }

  return { kg: Math.round(total * 100) / 100, convention };
}
