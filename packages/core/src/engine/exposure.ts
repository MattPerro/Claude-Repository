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
import type {
  DiscomfortReport,
  PerformedExercise,
  PerformedSet,
  Session,
  TechniqueRating,
} from '../domain/session.js';
import type { LocalDate } from '../time.js';
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
  /** true se le serie completate hanno usato carichi diversi. */
  readonly mixedLoads: boolean;
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

      // La prescrizione si cerca per esercizio EFFETTIVAMENTE svolto, non per
      // posizione: se c'e' stata una sostituzione, la prescrizione originale
      // non descrive quello che e' stato fatto.
      const prescription =
        snapshot.exercises.find((p) => p.exerciseId === performed.exerciseId) ??
        snapshot.exercises.find((p) => p.order === performed.order);
      if (prescription === undefined) continue;

      const loads = sets.map((s) => s.load.kg).filter((kg): kg is number => kg !== null);
      const uniqueLoads = new Set(loads);
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
        loadKg: uniqueLoads.size === 1 ? (loads[0] ?? null) : null,
        mixedLoads: uniqueLoads.size > 1,
      });
    }
  }

  return out.sort((a, b) => compareDates(b.date, a.date));
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
  const required = prescribedSetEvents(exposure.prescription);
  if (exposure.completedSets.length < required) return false;
  return exposure.completedSets.every((set) => {
    const value = performedValue(set);
    return value !== null && value >= exposure.target.max;
  });
}

/** Migliore valore eseguito nell'esposizione (per il confronto dei progressi). */
export function bestPerformedValue(exposure: Exposure): number | null {
  const values = exposure.completedSets
    .map(performedValue)
    .filter((v): v is number => v !== null);
  return values.length === 0 ? null : Math.min(...values);
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
        total += kg * 2 * reps;
        convention = 'kg per manubrio x 2 x ripetizioni';
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
