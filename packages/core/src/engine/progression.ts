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
import {
  allSetsAtRangeTop,
  highestPerformedValue,
  lowestPerformedValue,
  performedValue,
} from './exposure.js';

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
  const best = lowestPerformedValue(exposure);
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
  // Zero serie: `Math.min(...[])` vale `Infinity` e la condizione risultava
  // soddisfatta con il messaggio "margine compreso fra Infinity e -Infinity".
  // Un'assenza di dati non e' un margine adeguato.
  if (declared.length === 0) {
    return no(
      "Nessuna serie confermata: non c'e' nessun margine da valutare.",
      missingInfo('noRirDeclared'),
    );
  }
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

/**
 * Il carico registrato e' un dato completo?
 *
 * Quinta condizione, aggiunta dopo la revisione. Serviva perche' un carico
 * cancellato su una sola serie (possibile correggendo una serie gia'
 * confermata) rendeva l'esposizione "a carico uniforme" e la proposta citava
 * come registrato un valore che non esisteva.
 */
export function checkLoadRecorded(exposure: Exposure): ConditionResult {
  if (exposure.loadNotApplicable) {
    return ok("Esercizio senza carico esterno: non c'e' un carico da registrare.");
  }
  if (exposure.partialLoads) {
    return no(
      "Il carico manca su almeno una delle serie confermate: il dato non e' completo.",
      missingInfo('noLoadRecorded'),
    );
  }
  if (exposure.mixedLoads) {
    return no(
      'Le serie di questa seduta hanno usato carichi diversi fra loro: non esiste un riferimento unico da aumentare.',
    );
  }
  if (exposure.loadKg === null) {
    return no('Nessun carico registrato nelle serie confermate.', missingInfo('noLoadRecorded'));
  }
  return ok(`Carico uniforme registrato su tutte le serie.`);
}

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
  readonly loadRecorded: ConditionResult;
  /** true solo se TUTTE le condizioni sono soddisfatte. */
  readonly qualifiesForIncrease: boolean;
  /**
   * true se non ci sono segnali di SICUREZZA contrari: nessun fastidio e
   * tecnica controllata. E' il presupposto minimo anche per una semplice
   * proposta di "una ripetizione in piu'", che resta un incremento.
   */
  readonly safeToProgress: boolean;
  readonly missing: readonly MissingInformation[];
}

export function evaluateExposure(exposure: Exposure, config: EngineConfig): ExposureVerdict {
  const rangeTop = checkRangeTop(exposure);
  const effortMargin = checkEffortMargin(exposure, exposure.prescription.effort, config);
  const technique = checkTechnique(exposure);
  const noIssues = checkNoIssues(exposure);

  const loadRecorded = checkLoadRecorded(exposure);

  const all = [rangeTop, effortMargin, technique, noIssues, loadRecorded];
  const missing = all
    .map((c) => c.missing)
    .filter((m): m is MissingInformation => m !== null);

  return {
    exposure,
    rangeTop,
    effortMargin,
    technique,
    noIssues,
    loadRecorded,
    qualifiesForIncrease: all.every((c) => c.satisfied),
    // Fastidio e tecnica sono i due segnali che riguardano l'incolumita':
    // valgono anche quando l'incremento proposto e' di una sola ripetizione.
    safeToProgress: noIssues.satisfied && technique.satisfied,
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
      /** Informazioni mancanti che la proposta dichiara invece di nascondere. */
      readonly missing: readonly MissingInformation[];
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
      /**
       * true se questo mantenimento va MOSTRATO all'utente.
       *
       * Prima l'interfaccia mostrava un mantenimento solo quando c'era
       * un'informazione mancante da colmare. Conseguenza: la spiegazione piu'
       * importante di tutte - "non propongo nessun aumento perche' hai
       * segnalato un fastidio" - restava invisibile, perche' quel caso non ha
       * informazioni mancanti da colmare. Un mantenimento con una ragione di
       * sicurezza o di schema si mostra sempre.
       */
      readonly surface: boolean;
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
      surface: true,
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

  // "Comparabili" non riguarda solo l'attrezzo: riguarda anche la
  // PRESCRIZIONE. Due esposizioni con serie previste, intervallo o margine
  // diversi non sono confrontabili come risultato.
  //
  // Il caso reale che questo impedisce: la settimana di scarico del piano
  // prescrive meno serie e margine 4, e dichiara esplicitamente che i carichi
  // restano quelli della settimana precedente. Senza questo controllo, una
  // seduta di scarico contava come "seconda esposizione consecutiva
  // confrontabile" e confermava un incremento che nessuno aveva guadagnato.
  const signatures = new Set(confirming.map((v) => v.exposure.prescriptionSignature));
  const samePrescription = signatures.size <= 1;

  const allQualify =
    enoughExposures && samePrescription && confirming.every((v) => v.qualifiesForIncrease);

  if (enoughExposures && !samePrescription && confirming.every((v) => v.qualifiesForIncrease)) {
    const weeks = confirming.map((v) => v.exposure.weekIndex);
    return {
      kind: 'hold',
      surface: true,
      reason:
        'Le due sedute piu\' recenti hanno prescrizioni diverse (settimane ' +
        `${weeks.map((w) => String(w)).join(' e ')}): serie previste, intervallo o margine non coincidono. ` +
        'Un risultato ottenuto con uno schema diverso non conferma un progresso: ' +
        'serve una seconda seduta con la stessa prescrizione.',
      missing: [missingInfo('notEnoughExposures')],
      verdicts,
    };
  }

  const latest = verdicts[0];
  if (latest === undefined) {
    return {
      kind: 'hold',
      surface: true,
      reason: 'Nessuna esposizione utilizzabile.',
      missing: [missingInfo('noComparableHistory')],
      verdicts,
    };
  }

  // ------------------------------------------- 2a. progressione di ripetizioni
  //
  // Doppia progressione: se le ripetizioni non sono al limite superiore, il
  // passo successivo e' salire di ripetizioni, non di carico.
  //
  // MA una ripetizione in piu' E' UN INCREMENTO, e la specifica (§5.1) dice
  // "si propone un incremento solo se tutte queste condizioni sono vere".
  // Prima questo ramo veniva valutato senza guardare fastidio, tecnica e
  // margine: il motore poteva proporre "prova 7 ripetizioni" nella seduta
  // successiva a un dolore che aveva interrotto l'esercizio, con tecnica
  // dichiarata ceduta e margine zero, e senza nessuna avvertenza. Era il
  // difetto piu' pericoloso trovato in revisione.
  //
  // Ora fastidio e tecnica sono vincolanti; il margine, se insufficiente o
  // non dichiarato, non blocca (alzare di una ripetizione dentro
  // l'intervallo prescritto non aggiunge carico) ma viene DICHIARATO fra le
  // informazioni mancanti.
  if (!latest.rangeTop.satisfied) {
    if (!latest.safeToProgress) {
      const blocking = [latest.noIssues, latest.technique].filter((c) => !c.satisfied);
      return {
        kind: 'hold',
        surface: true,
        reason:
          'Non si propone nessun aumento, nemmeno di una ripetizione. ' +
          blocking.map((c) => c.explanation).join(' '),
        missing: dedupeMissing(blocking.map((c) => c.missing).filter((m) => m !== null)),
        verdicts,
      };
    }

    const current = lowestPerformedValue(latest.exposure);
    const highest = highestPerformedValue(latest.exposure);
    if (current !== null && highest !== null && current < latest.exposure.target.max) {
      // La proposta resta DENTRO l'intervallo prescritto anche verso il basso.
      // Prima il limite c'era solo verso l'alto, e una serie crollata da 12 a
      // 5 su un esercizio prescritto 10-12 produceva "prova 6 ripetizioni".
      const next = Math.min(
        Math.max(current + 1, latest.exposure.target.min),
        latest.exposure.target.max,
      );

      // Dispersione ampia fra le serie: non e' una base su cui costruire un
      // "+1". Si segnala invece di proporre.
      const spread = highest - current;
      const range = latest.exposure.target.max - latest.exposure.target.min;
      if (spread > Math.max(2, range)) {
        return {
          kind: 'hold',
          surface: true,
          reason:
            `Le serie di questa seduta sono molto diverse fra loro (dalla piu' bassa a ${String(current)} ` +
            `alla piu' alta a ${String(highest)}, su un intervallo prescritto di ` +
            `${String(latest.exposure.target.min)}-${String(latest.exposure.target.max)}). ` +
            'Prima di aumentare conviene capire perche\', invece di costruire un incremento su una serie crollata.',
          missing: [],
          verdicts,
        };
      }

      const unit = latest.exposure.metric === 'seconds' ? 'secondi' : 'ripetizioni';
      const marginMissing = latest.effortMargin.satisfied
        ? []
        : dedupeMissing([latest.effortMargin.missing].filter((m) => m !== null));

      return {
        kind: 'increaseWithinRange',
        fromValue: current,
        toValue: next,
        metric: latest.exposure.metric,
        reason:
          `Doppia progressione: prima si sale di ${unit} entro l'intervallo prescritto ` +
          `(${String(latest.exposure.target.min)}-${String(latest.exposure.target.max)}), poi eventualmente di carico. ` +
          latest.rangeTop.explanation +
          (latest.effortMargin.satisfied ? '' : ` ${latest.effortMargin.explanation}`),
        missing: marginMissing,
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
        surface: true,
        reason: latest.exposure.mixedLoads
          ? "Il limite superiore dell'intervallo e' stato raggiunto, ma le serie di questa seduta hanno " +
            "usato carichi diversi fra loro: non esiste un riferimento unico da aumentare. " +
            'Per far ripartire la progressione servono due sedute con lo stesso carico su tutte le serie allenanti.'
          : "Il limite superiore dell'intervallo e' stato raggiunto in modo confermato, ma per questo " +
            "esercizio non c'e' un carico da aumentare: il passo successivo e' previsto dal cambio di " +
            'schema del blocco.',
        // Per un esercizio senza carico `noLoadRecorded` sarebbe una richiesta
        // impossibile da soddisfare: non si chiede di colmare
        // un'informazione che non potra' mai esistere.
        missing: latest.exposure.loadNotApplicable ? [] : [missingInfo('noLoadRecorded')],
        verdicts,
      };
    }

    const { step, source } = resolveLoadStep(exercise, equipment);
    if (step.stepKg <= 0) {
      return {
        kind: 'hold',
        surface: true,
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
        surface: true,
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
    for (const c of [v.rangeTop, v.effortMargin, v.technique, v.noIssues, v.loadRecorded]) {
      if (!c.satisfied && !reasons.includes(c.explanation)) reasons.push(c.explanation);
    }
  }

  const missing = dedupeMissing([
    ...verdicts.slice(0, config.confirmExposures).flatMap((v) => v.missing),
    ...(enoughExposures ? [] : [missingInfo('notEnoughExposures')]),
  ]);

  return {
    kind: 'hold',
    // Mantenimento ordinario: si mostra solo se c'e' davvero qualcosa da
    // colmare, altrimenti riempirebbe l'elenco di voci inutili.
    surface: missing.length > 0,
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
    // Totali non calcolabili: confronto impossibile, non assenza di progresso.
    if (newerValue === null || olderValue === null) break;

    // Un dato NON CONFRONTABILE non e' un'assenza di progresso.
    //
    // Prima, se una delle due esposizioni aveva carichi diversi fra le serie
    // (`loadKg: null`), il confronto fallisce e veniva contato come "nessun
    // progresso". Il risultato: un carico salito di 20 kg in quattro sedute
    // veniva letto come stallo, e il motore proponeva di ripetere la
    // settimana. La specifica vieta di inferire un plateau senza prova, e qui
    // la prova non esiste perche' il confronto non si puo' fare.
    // Carichi misti o parziali fra le serie: `loadKg` e' `null` per
    // costruzione, quindi "entrambi null" NON significa "entrambi senza
    // carico". Il confronto e' impossibile, e un confronto impossibile non e'
    // un'assenza di progresso.
    if (newer.mixedLoads || older.mixedLoads || newer.partialLoads || older.partialLoads) break;

    const comparableLoads =
      (newerLoad === null && olderLoad === null) || (newerLoad !== null && olderLoad !== null);
    if (!comparableLoads) break;

    // Anche una prescrizione diversa rende il confronto privo di significato.
    if (newer.prescriptionSignature !== older.prescriptionSignature) break;

    const improvedLoad = newerLoad !== null && olderLoad !== null && newerLoad > olderLoad;
    const regressedLoad = newerLoad !== null && olderLoad !== null && newerLoad < olderLoad;
    // Un carico SCESO non e' un progresso, ma nemmeno uno stallo: e' un altro
    // fenomeno, e contarlo come stallo confonderebbe due cose diverse.
    if (regressedLoad) break;
    const improvedValue = newerValue > olderValue;

    if (improvedLoad || improvedValue) break;
    count += 1;
  }
  return count;
}

/**
 * Somma delle ripetizioni (o secondi) confermate nell'esposizione.
 *
 * Restituisce `null` se una qualunque serie non ha un valore registrato:
 * prima un valore assente contribuiva 0 al totale, il che rendeva
 * l'esposizione artificialmente peggiore e poteva mascherare un progresso.
 * Un totale calcolato su un dato incompleto non e' un totale.
 */
function totalPerformed(exposure: Exposure): number | null {
  let sum = 0;
  for (const set of exposure.completedSets) {
    const value = performedValue(set);
    if (value === null) return null;
    sum += value;
  }
  return sum;
}
