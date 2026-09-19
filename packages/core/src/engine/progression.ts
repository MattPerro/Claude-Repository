/**
 * Doppia progressione: prima le ripetizioni entro l'intervallo, poi il carico.
 *
 * Questo file contiene il controllo di sicurezza piu' importante del progetto.
 * La specifica (§5.1) elenca cinque condizioni che devono essere TUTTE vere
 * prima di proporre un incremento di carico, e vieta espressamente di trattare
 * i dati mancanti come risultati positivi.
 *
 * L'implementazione e' volutamente verbosa: ogni condizione produce un esito
 * esplicito e, quando non e' soddisfatta, dice PERCHE'. Non esiste un percorso
 * in cui un valore assente si trasformi in un `true`.
 */

import type { EffortTarget } from '../domain/prescription.js';
import type { Exercise, EquipmentInstance } from '../domain/exercise.js';
import type { MissingInformation } from '../domain/proposal.js';
import { MISSING_INFO_TEXT } from '../domain/proposal.js';
import type { LoadStep } from '../units.js';
import { isInvertedProgress, nextLoadDown, nextLoadUp } from '../units.js';
import type { EngineConfig } from './config.js';
import type { Exposure } from './exposure.js';
import { allSetsAtRangeTop, bestPerformedValue, performedValue } from './exposure.js';

/** Esito di una singola condizione, con la sua motivazione. */
export interface ConditionResult {
  readonly satisfied: boolean;
  /** Frase in italiano che spiega l'esito. Mostrata nella proposta. */
  readonly explanation: string;
  /** Informazione mancante, se l'esito e' negativo per assenza di dati. */
  readonly missing: MissingInformation | null;
}

function ok(explanation: string): ConditionResult {
  return { satisfied: true, explanation, missing: null };
}

function no(explanation: string, missing: MissingInformation | null = null): ConditionResult {
  return { satisfied: false, explanation, missing };
}

function missingInfo(code: MissingInformation['code']): MissingInformation {
  return { code, description: MISSING_INFO_TEXT[code] };
}

// ---------------------------------------------------------------------------
// Condizione 1: tutte le serie allenanti al limite superiore
// ---------------------------------------------------------------------------

export function checkRangeTop(exposure: Exposure): ConditionResult {
  if (allSetsAtRangeTop(exposure)) {
    return ok(
      `Tutte le ${String(exposure.completedSets.length)} serie allenanti hanno raggiunto il limite superiore ` +
        `(${String(exposure.target.max)} ${exposure.metric === 'seconds' ? 'secondi' : 'ripetizioni'}).`,
    );
  }
  const best = bestPerformedValue(exposure);
  if (best === null) {
    return no(
      'Nessun valore eseguito registrato nelle serie di questa seduta.',
      missingInfo('noLoadRecorded'),
    );
  }
  return no(
    `Non tutte le serie hanno raggiunto ${String(exposure.target.max)}: la serie piu' bassa si e' fermata a ${String(best)}.`,
  );
}

// ---------------------------------------------------------------------------
// Condizione 2: margine coerente con la fase
// ---------------------------------------------------------------------------

/**
 * Il margine dichiarato e' coerente con la fase?
 *
 * "Coerente" significa che il margine registrato e' almeno quello prescritto:
 * se la fase chiede di lasciare 2 ripetizioni in riserva e la serie e' stata
 * chiusa con margine 0, il margine prescritto non c'era, e aggiungere carico
 * lo ridurrebbe ulteriormente.
 *
 * Un margine PIU' AMPIO del prescritto e' invece un segnale a favore
 * dell'incremento: la serie era piu' facile del previsto.
 *
 * Per gli esercizi a tempo (`durationControl`) il RIR non si applica: la
 * specifica (§3.10) vieta di imporre un RIR privo di significato. In quel caso
 * la condizione e' soddisfatta per costruzione e lo dichiara.
 */
export function checkEffortMargin(
  exposure: Exposure,
  effort: EffortTarget,
  config: EngineConfig,
): ConditionResult {
  if (effort.kind === 'durationControl') {
    return ok(
      'Esercizio a tempo: si valutano durata e controllo, non il margine in ripetizioni.',
    );
  }

  const declared = exposure.completedSets.map((s) => s.rir);
  if (declared.some((r) => r === null)) {
    const declaredCount = declared.filter((r) => r !== null).length;
    return no(
      `Il margine non e' stato dichiarato su ${String(declared.length - declaredCount)} serie su ${String(declared.length)}.`,
      missingInfo('noRirDeclared'),
    );
  }

  const floor = effort.rir.min - config.rirToleranceBelowPhaseMin;
  const values = declared.filter((r): r is number => r !== null);
  const lowest = Math.min(...values);
  if (lowest < floor) {
    return no(
      `Il margine dichiarato piu' basso e' ${String(lowest)}, sotto il minimo previsto dalla fase (${String(effort.rir.min)}). ` +
        'Aggiungere carico ridurrebbe ancora il margine.',
    );
  }
  return ok(
    `Margine dichiarato compreso fra ${String(lowest)} e ${String(Math.max(...values))}, coerente con la fase (previsto ${String(effort.rir.min)}-${String(effort.rir.max)}).`,
  );
}

// ---------------------------------------------------------------------------
// Condizione 3: tecnica dichiarata controllata
// ---------------------------------------------------------------------------

export function checkTechnique(exposure: Exposure): ConditionResult {
  if (exposure.technique === null) {
    return no('La tecnica non e\' stata dichiarata per questo esercizio.', missingInfo('noTechniqueDeclared'));
  }
  if (exposure.technique === 'controlled') {
    return ok('Tecnica dichiarata controllata.');
  }
  return no(
    exposure.technique === 'uncertain'
      ? 'Tecnica dichiarata incerta: prima di aggiungere carico conviene consolidare l\'esecuzione.'
      : 'Tecnica dichiarata ceduta: questa serie non e\' un riferimento valido per progredire.',
  );
}

// ---------------------------------------------------------------------------
// Condizione 4: nessun problema segnalato
// ---------------------------------------------------------------------------

export function checkNoIssues(exposure: Exposure): ConditionResult {
  const d = exposure.discomfort;
  if (d === null) return ok('Nessun fastidio segnalato su questo esercizio.');
  return no(
    `Fastidio segnalato (${d.area}, intensita' ${String(d.intensity)}/5${d.stoppedExercise ? ', esercizio interrotto' : ''}). ` +
      'Con un fastidio in corso non si propone un aumento.',
  );
}

// ---------------------------------------------------------------------------
// Valutazione completa di una singola esposizione
// ---------------------------------------------------------------------------

export interface ExposureVerdict {
  readonly exposure: Exposure;
  readonly rangeTop: ConditionResult;
  readonly effortMargin: ConditionResult;
  readonly technique: ConditionResult;
  readonly noIssues: ConditionResult;
  /** true solo se tutte e quattro le condizioni sono soddisfatte. */
  readonly qualifiesForIncrease: boolean;
  readonly missing: readonly MissingInformation[];
}

export function evaluateExposure(exposure: Exposure, config: EngineConfig): ExposureVerdict {
  const rangeTop = checkRangeTop(exposure);
  const effortMargin = checkEffortMargin(exposure, exposure.prescription.effort, config);
  const technique = checkTechnique(exposure);
  const noIssues = checkNoIssues(exposure);

  const all = [rangeTop, effortMargin, technique, noIssues];
  const missing = all
    .map((c) => c.missing)
    .filter((m): m is MissingInformation => m !== null);

  return {
    exposure,
    rangeTop,
    effortMargin,
    technique,
    noIssues,
    qualifiesForIncrease: all.every((c) => c.satisfied),
    missing,
  };
}

// ---------------------------------------------------------------------------
// Decisione di progressione su una serie di esposizioni confrontabili
// ---------------------------------------------------------------------------

export type ProgressionOutcome =
  | {
      /** Salire di ripetizioni (o secondi) entro l'intervallo: primo passo. */
      readonly kind: 'increaseWithinRange';
      readonly fromValue: number;
      readonly toValue: number;
      readonly metric: 'reps' | 'seconds';
      readonly reason: string;
      readonly verdicts: readonly ExposureVerdict[];
    }
  | {
      /** Salire di carico al prossimo gradino realmente impostabile. */
      readonly kind: 'increaseLoad';
      readonly fromKg: number;
      readonly toKg: number;
      readonly step: LoadStep;
      /** Da dove viene il gradino: l'attrezzo configurato o il valore predefinito. */
      readonly stepSource: 'equipment' | 'exerciseDefault';
      readonly reason: string;
      /**
       * Informazioni ancora da confermare. NON e' vuota quando il gradino
       * proviene dal valore predefinito dell'esercizio invece che
       * dall'attrezzo reale: l'utente deve sapere che quel numero e' da
       * verificare in palestra.
       */
      readonly missing: readonly MissingInformation[];
      readonly verdicts: readonly ExposureVerdict[];
    }
  | {
      /** Confermare i valori attuali. */
      readonly kind: 'hold';
      readonly reason: string;
      readonly missing: readonly MissingInformation[];
      readonly verdicts: readonly ExposureVerdict[];
    }
  | {
      /** Stallo confermato: serve un cambio di schema, non piu' carico. */
      readonly kind: 'stalled';
      readonly exposuresWithoutProgress: number;
      readonly reason: string;
      readonly verdicts: readonly ExposureVerdict[];
    }
  | {
      /** Fastidio ripetuto: riduzione temporanea o sostituzione. */
      readonly kind: 'discomfort';
      readonly sessions: number;
      readonly reason: string;
      readonly verdicts: readonly ExposureVerdict[];
    };

/** Gradino di carico da usare, con l'origine dichiarata. */
export function resolveLoadStep(
  exercise: Exercise,
  equipment: EquipmentInstance | undefined,
): { readonly step: LoadStep; readonly source: 'equipment' | 'exerciseDefault' } {
  if (equipment !== undefined && equipment.loadStep.stepKg > 0) {
    return { step: equipment.loadStep, source: 'equipment' };
  }
  return { step: exercise.defaultLoadStep, source: 'exerciseDefault' };
}

/**
 * Decide la progressione su un gruppo di esposizioni CONFRONTABILI, ordinate
 * dalla piu' recente alla piu' vecchia.
 *
 * Ordine di valutazione, pensato per non nascondere i segnali negativi dietro
 * un risultato positivo:
 *   1. fastidio ripetuto
 *   2. incremento confermato (ripetizioni prima, poi carico)
 *   3. stallo confermato
 *   4. mantenimento
 */
export function decideProgression(
  comparable: readonly Exposure[],
  exercise: Exercise,
  equipment: EquipmentInstance | undefined,
  config: EngineConfig,
): ProgressionOutcome {
  if (comparable.length === 0) {
    return {
      kind: 'hold',
      reason: 'Non esiste ancora uno storico confrontabile per questo esercizio su questo attrezzo.',
      missing: [missingInfo('noComparableHistory')],
      verdicts: [],
    };
  }

  const window = comparable.slice(0, config.maxExposuresConsidered);
  const verdicts = window.map((e) => evaluateExposure(e, config));

  // ---------------------------------------------------------------- 1. fastidio
  const discomfortRun = countLeadingDiscomfort(window);
  if (discomfortRun >= config.repeatedDiscomfortSessions) {
    return {
      kind: 'discomfort',
      sessions: discomfortRun,
      reason:
        `Fastidio segnalato su questo esercizio in ${String(discomfortRun)} sedute consecutive. ` +
        'La proposta e\' ridurre temporaneamente il carico o sostituire l\'esercizio con un\'alternativa compatibile, ' +
        'non aumentare. Se il fastidio persiste, conviene parlarne con un professionista: l\'app non fa diagnosi.',
      verdicts,
    };
  }

  // ------------------------------------------------- 2. incremento confermato
  // Servono `confirmExposures` esposizioni CONSECUTIVE (le piu' recenti) che
  // soddisfino tutte e quattro le condizioni. Una sola non basta.
  const confirming = verdicts.slice(0, config.confirmExposures);
  const enoughExposures = confirming.length >= config.confirmExposures;
  const allQualify = enoughExposures && confirming.every((v) => v.qualifiesForIncrease);

  const latest = verdicts[0];
  if (latest === undefined) {
    return {
      kind: 'hold',
      reason: 'Nessuna esposizione utilizzabile.',
      missing: [missingInfo('noComparableHistory')],
      verdicts,
    };
  }

  // Doppia progressione: se le ripetizioni non sono al limite superiore, il
  // passo successivo e' salire di ripetizioni, NON di carico. Questo vale
  // anche quando mancano altri dati: alzare di una ripetizione entro
  // l'intervallo prescritto non aumenta il carico e resta dentro la
  // prescrizione del programma.
  if (!latest.rangeTop.satisfied) {
    const current = bestPerformedValue(latest.exposure);
    if (current !== null && current < latest.exposure.target.max) {
      const next = Math.min(current + 1, latest.exposure.target.max);
      return {
        kind: 'increaseWithinRange',
        fromValue: current,
        toValue: next,
        metric: latest.exposure.metric,
        reason:
          `Doppia progressione: prima si sale di ${latest.exposure.metric === 'seconds' ? 'secondi' : 'ripetizioni'} ` +
          `entro l'intervallo prescritto (${String(latest.exposure.target.min)}-${String(latest.exposure.target.max)}), ` +
          'poi eventualmente di carico. ' +
          latest.rangeTop.explanation,
        verdicts,
      };
    }
  }

  if (allQualify) {
    const currentLoad = latest.exposure.loadKg;
    if (currentLoad === null) {
      // Esercizio senza carico (corpo libero, a tempo) oppure carichi misti:
      // il limite superiore e' raggiunto ma non c'e' un carico da aumentare.
      return {
        kind: 'hold',
        reason:
          'Il limite superiore dell\'intervallo e\' stato raggiunto in modo confermato, ma per questo esercizio ' +
          'non c\'e\' un carico da aumentare: il passo successivo e\' previsto dal cambio di schema del blocco.' +
          (latest.exposure.mixedLoads
            ? ' Le serie di questa seduta hanno usato carichi diversi fra loro: non e\' un riferimento unico.'
            : ''),
        missing: latest.exposure.mixedLoads ? [] : [missingInfo('noLoadRecorded')],
        verdicts,
      };
    }

    const { step, source } = resolveLoadStep(exercise, equipment);
    if (step.stepKg <= 0) {
      return {
        kind: 'hold',
        reason:
          'Le condizioni per un incremento sono soddisfatte, ma per questo attrezzo non e\' disponibile nessun ' +
          'incremento di carico. Senza quel dato il motore non inventa un numero.',
        missing: [missingInfo('noLoadStepAvailable')],
        verdicts,
      };
    }

    // Per le macchine ad assistenza il progresso e' verso il BASSO: meno
    // assistenza significa piu' lavoro.
    const inverted = isInvertedProgress(latest.exposure.completedSets[0]?.load.convention ?? 'machineStack');
    const next = inverted ? nextLoadDown(currentLoad, step) : nextLoadUp(currentLoad, step);

    if (next === null) {
      return {
        kind: 'hold',
        reason: inverted
          ? 'Le condizioni sono soddisfatte, ma l\'assistenza e\' gia\' al minimo impostabile su questo attrezzo.'
          : 'Le condizioni sono soddisfatte, ma il carico e\' gia\' al massimo impostabile su questo attrezzo.',
        missing: [],
        verdicts,
      };
    }

    return {
      kind: 'increaseLoad',
      fromKg: currentLoad,
      toKg: next,
      step,
      stepSource: source,
      reason:
        `Il risultato e' confermato in ${String(config.confirmExposures)} esposizioni consecutive confrontabili. ` +
        (source === 'equipment'
          ? `L'incremento e' il minimo configurato su questo attrezzo (${String(step.stepKg)} kg).`
          : `L'incremento usa il valore predefinito dell'esercizio (${String(step.stepKg)} kg) perche' questo ` +
            "attrezzo non e' ancora configurato: verifica in palestra che la macchina salga davvero di questo valore."),
      // Quando il gradino non viene dall'attrezzo reale, la proposta lo
      // dichiara: il numero e' utilizzabile ma da confermare.
      missing: source === 'equipment' ? [] : [missingInfo('unconfirmedEquipmentStep')],
      verdicts,
    };
  }

  // ------------------------------------------------------ 3. stallo confermato
  const stalled = countExposuresWithoutProgress(window);
  if (stalled >= config.stalledExposures) {
    return {
      kind: 'stalled',
      exposuresWithoutProgress: stalled,
      reason:
        `Nessun progresso confrontabile in ${String(stalled)} esposizioni su questo esercizio. ` +
        'Un singolo allenamento sotto le attese non dimostra uno stallo, ' +
        `${String(config.stalledExposures)} esposizioni consecutive senza progresso si': ` +
        'la proposta e\' rivedere lo schema o ripetere la settimana, non forzare il carico.',
      verdicts,
    };
  }

  // ----------------------------------------------------------- 4. mantenimento
  const reasons: string[] = [];
  if (!enoughExposures) {
    reasons.push(
      `Serve una seconda esposizione confrontabile per confermare il risultato (ne esiste ${String(confirming.length)}).`,
    );
  }
  for (const v of confirming) {
    for (const c of [v.rangeTop, v.effortMargin, v.technique, v.noIssues]) {
      if (!c.satisfied && !reasons.includes(c.explanation)) reasons.push(c.explanation);
    }
  }

  const missing = dedupeMissing([
    ...verdicts.slice(0, config.confirmExposures).flatMap((v) => v.missing),
    ...(enoughExposures ? [] : [missingInfo('notEnoughExposures')]),
  ]);

  return {
    kind: 'hold',
    reason:
      'Si mantengono i valori attuali. ' +
      (reasons.length > 0 ? reasons.join(' ') : 'Nessuna condizione per un incremento e\' soddisfatta.'),
    missing,
    verdicts,
  };
}

function dedupeMissing(items: readonly MissingInformation[]): readonly MissingInformation[] {
  const seen = new Set<string>();
  const out: MissingInformation[] = [];
  for (const item of items) {
    if (seen.has(item.code)) continue;
    seen.add(item.code);
    out.push(item);
  }
  return out;
}

/** Sedute consecutive, a partire dalla piu' recente, con fastidio segnalato. */
function countLeadingDiscomfort(exposures: readonly Exposure[]): number {
  let count = 0;
  for (const exposure of exposures) {
    if (exposure.discomfort === null) break;
    count += 1;
  }
  return count;
}

/**
 * Esposizioni consecutive senza progresso, dalla piu' recente.
 *
 * "Progresso" significa: piu' carico, oppure a parita' di carico un valore
 * eseguito piu' alto. Confronta solo esposizioni con la stessa chiave, quindi
 * la funzione assume di ricevere un gruppo gia' confrontabile.
 *
 * Una seduta saltata non entra in questo conteggio, perche' non e' una
 * esposizione (specifica §5.2): non dimostra uno stallo ne' un
 * sovrallenamento.
 */
function countExposuresWithoutProgress(exposures: readonly Exposure[]): number {
  if (exposures.length < 2) return 0;

  let count = 0;
  for (let i = 0; i < exposures.length - 1; i += 1) {
    const newer = exposures[i];
    const older = exposures[i + 1];
    if (newer === undefined || older === undefined) break;

    const newerLoad = newer.loadKg;
    const olderLoad = older.loadKg;
    const newerValue = totalPerformed(newer);
    const olderValue = totalPerformed(older);

    const improvedLoad = newerLoad !== null && olderLoad !== null && newerLoad > olderLoad;
    const improvedValue =
      newerLoad !== null && olderLoad !== null && newerLoad === olderLoad
        ? newerValue > olderValue
        : newerLoad === null && olderLoad === null
          ? newerValue > olderValue
          : false;

    if (improvedLoad || improvedValue) break;
    count += 1;
  }
  return count;
}

/** Somma delle ripetizioni (o secondi) confermate nell'esposizione. */
function totalPerformed(exposure: Exposure): number {
  return exposure.completedSets.reduce((sum, set) => sum + (performedValue(set) ?? 0), 0);
}
