/**
 * Timer.
 *
 * La specifica (§11) e' esplicita: "Non usare il solo `setInterval` come fonte
 * di verita'". Qui la fonte di verita' e' uno STATO PERSISTIBILE con una
 * scadenza calcolata su una base monotona. `setInterval` serve soltanto a
 * ridisegnare i numeri sullo schermo, e se muore non cambia niente.
 *
 * Tre garanzie che questo modulo deve dare, e che i test verificano:
 *
 *  1. Al rientro nell'app il tempo rimanente e' coerente, anche se l'app e'
 *     stata sospesa per mezz'ora.
 *  2. Un recupero scaduto risulta TERMINATO, non azzerato e non riavviato.
 *  3. **Nessuna serie viene completata automaticamente** e il trascorrere del
 *     tempo **non dimostra** che il cardio sia stato svolto: la scadenza di un
 *     timer e' un fatto sul tempo, non sull'esecuzione.
 *
 * La terza e' il motivo per cui questo modulo non conosce le serie: non ha
 * nessun modo di segnarle come fatte.
 */

import type { Clock, Instant, Monotonic } from '../time.js';

/** A cosa serve il timer. Ogni tipo ha un suo comportamento in interfaccia. */
export type TimerKind =
  /** Recupero fra le serie. Parte dopo la CONFERMA di una serie. */
  | 'rest'
  /** Esercizio a tempo (plank, farmer carry): conta la durata di lavoro. */
  | 'timedSet'
  /** Cardio continuo. */
  | 'cardio'
  /** Intervalli: alterna tratti sostenuti e facili. */
  | 'interval'
  /** Durata complessiva della seduta. */
  | 'session';

export const TIMER_KIND_LABEL: Record<TimerKind, string> = {
  rest: 'Recupero',
  timedSet: 'Esercizio a tempo',
  cardio: 'Cardio',
  interval: 'Intervalli',
  session: 'Durata seduta',
};

export type TimerStatus = 'running' | 'paused' | 'expired' | 'cancelled';

/**
 * Stato persistito di un timer.
 *
 * Contiene sia la base monotona sia l'orologio di sistema, per un motivo
 * preciso: la base monotona e' affidabile mentre il processo vive, ma si azzera
 * quando l'app viene terminata dal sistema operativo. In quel caso serve un
 * riferimento all'orologio di sistema. Quando i due non concordano si usa il
 * piu' PRUDENTE (vedi `remainingMs`).
 */
export interface TimerState {
  readonly id: string;
  readonly kind: TimerKind;
  readonly status: TimerStatus;
  /** Durata configurata, in millisecondi. */
  readonly durationMs: number;
  /**
   * Millisecondi gia' trascorsi e "congelati" nelle fasi precedenti
   * (accumulati a ogni pausa).
   */
  readonly elapsedBeforeMs: number;
  /** Base monotona al momento dell'ultimo avvio/ripresa. `null` se in pausa. */
  readonly startedAtMonotonic: Monotonic | null;
  /** Orologio di sistema al momento dell'ultimo avvio/ripresa. */
  readonly startedAtWall: Instant | null;
  /** Istante di creazione, per la diagnostica. */
  readonly createdAt: Instant;
  /**
   * Sessione a cui il timer appartiene. `null` per i timer non legati a una
   * seduta.
   */
  readonly sessionId: string | null;
  /** Esercizio svolto a cui il recupero si riferisce. */
  readonly performedExerciseId: string | null;
  /**
   * Identificativo della notifica locale programmata su QUESTO dispositivo.
   * Non viene mai sincronizzato: le notifiche sono locali (specifica §11).
   */
  readonly localNotificationId: string | null;
  /** Modifiche manuali applicate (+15 / -15 secondi), per la trasparenza. */
  readonly manualAdjustmentMs: number;
}

export interface CreateTimerInput {
  readonly id: string;
  readonly kind: TimerKind;
  readonly durationSeconds: number;
  readonly sessionId?: string | null;
  readonly performedExerciseId?: string | null;
}

/** Crea un timer gia' avviato. */
export function startTimer(input: CreateTimerInput, clock: Clock): TimerState {
  if (input.durationSeconds < 0) {
    throw new Error(`Durata del timer non valida: ${String(input.durationSeconds)} s.`);
  }
  return {
    id: input.id,
    kind: input.kind,
    status: 'running',
    durationMs: Math.round(input.durationSeconds * 1000),
    elapsedBeforeMs: 0,
    startedAtMonotonic: clock.monotonic(),
    startedAtWall: clock.now(),
    createdAt: clock.now(),
    sessionId: input.sessionId ?? null,
    performedExerciseId: input.performedExerciseId ?? null,
    localNotificationId: null,
    manualAdjustmentMs: 0,
  };
}

/**
 * Millisecondi trascorsi dall'ultimo avvio, con gestione dei cambi d'orologio.
 *
 * Confronta due misure:
 *  - **monotona**: immune ai cambi manuali dell'ora, ma azzerata se il processo
 *    e' stato ricreato (l'app terminata e riaperta);
 *  - **orologio di sistema**: sopravvive alla ricreazione del processo, ma puo'
 *    saltare avanti o indietro.
 *
 * Regola: se la misura monotona e' plausibile (non negativa) si usa **la
 * maggiore** delle due. Prendere la maggiore e' la scelta prudente per un
 * recupero, perche' un recupero sottostimato spinge a ricominciare troppo
 * presto. Se l'orologio e' tornato indietro, la sua misura e' negativa e viene
 * scartata: resta quella monotona.
 */
function elapsedSinceStart(state: TimerState, clock: Clock): number {
  const monoStart = state.startedAtMonotonic;
  const wallStart = state.startedAtWall;

  const monoElapsed = monoStart === null ? null : clock.monotonic() - monoStart;
  const wallElapsed = wallStart === null ? null : clock.now() - wallStart;

  const candidates: number[] = [];
  if (monoElapsed !== null && monoElapsed >= 0) candidates.push(monoElapsed);
  // Un valore negativo significa orologio spostato indietro: non e' una misura
  // del tempo passato, va ignorato.
  if (wallElapsed !== null && wallElapsed >= 0) candidates.push(wallElapsed);

  if (candidates.length === 0) return 0;
  return Math.max(...candidates);
}

/** Millisecondi complessivamente trascorsi, pause escluse. */
export function elapsedMs(state: TimerState, clock: Clock): number {
  if (state.status === 'paused' || state.status === 'cancelled') {
    return state.elapsedBeforeMs;
  }
  return state.elapsedBeforeMs + elapsedSinceStart(state, clock);
}

/** Millisecondi rimanenti. Mai negativo: un recupero scaduto rimane a 0. */
export function remainingMs(state: TimerState, clock: Clock): number {
  const total = state.durationMs + state.manualAdjustmentMs;
  return Math.max(0, total - elapsedMs(state, clock));
}

/** Secondi rimanenti, arrotondati per eccesso: "1 s" fino allo zero effettivo. */
export function remainingSeconds(state: TimerState, clock: Clock): number {
  return Math.ceil(remainingMs(state, clock) / 1000);
}

/**
 * Il timer e' scaduto?
 *
 * Calcolato dal tempo, non da un evento: se l'app era sospesa quando la
 * scadenza e' passata, al rientro il timer risulta comunque scaduto senza
 * bisogno che nessun callback sia stato eseguito.
 */
export function isExpired(state: TimerState, clock: Clock): boolean {
  if (state.status === 'cancelled') return false;
  if (state.status === 'expired') return true;
  return remainingMs(state, clock) <= 0;
}

/**
 * Riconcilia lo stato dopo un ritorno in primo piano.
 *
 * Restituisce uno stato con `status: 'expired'` se il tempo e' finito. Non fa
 * nient'altro: **non completa serie**, non registra cardio, non avanza il
 * programma. Il chiamante decide che cosa mostrare.
 */
export function reconcile(state: TimerState, clock: Clock): TimerState {
  if (state.status === 'running' && isExpired(state, clock)) {
    return {
      ...state,
      status: 'expired',
      elapsedBeforeMs: state.durationMs + state.manualAdjustmentMs,
      startedAtMonotonic: null,
      startedAtWall: null,
    };
  }
  return state;
}

export function pause(state: TimerState, clock: Clock): TimerState {
  if (state.status !== 'running') return state;
  return {
    ...state,
    status: 'paused',
    elapsedBeforeMs: elapsedMs(state, clock),
    startedAtMonotonic: null,
    startedAtWall: null,
  };
}

export function resume(state: TimerState, clock: Clock): TimerState {
  if (state.status !== 'paused') return state;
  return {
    ...state,
    status: 'running',
    startedAtMonotonic: clock.monotonic(),
    startedAtWall: clock.now(),
  };
}

/**
 * Aggiunge (o toglie) secondi. I comandi +15 / -15 della specifica (§11).
 *
 * La durata configurata non viene riscritta: si accumula in
 * `manualAdjustmentMs`, cosi' resta visibile che il recupero e' stato
 * modificato a mano e di quanto. La durata totale non scende sotto zero.
 */
export function adjust(state: TimerState, deltaSeconds: number): TimerState {
  const deltaMs = Math.round(deltaSeconds * 1000);
  const total = state.durationMs + state.manualAdjustmentMs + deltaMs;
  const clamped = total < 0 ? -state.durationMs : state.manualAdjustmentMs + deltaMs;
  return { ...state, manualAdjustmentMs: clamped };
}

/** Salta il timer: lo porta a scaduto senza attendere. */
export function skip(state: TimerState, clock: Clock): TimerState {
  return {
    ...state,
    status: 'expired',
    elapsedBeforeMs: elapsedMs(state, clock),
    startedAtMonotonic: null,
    startedAtWall: null,
  };
}

/** Annulla il timer: non e' scaduto, semplicemente non esiste piu'. */
export function cancel(state: TimerState, clock: Clock): TimerState {
  return {
    ...state,
    status: 'cancelled',
    elapsedBeforeMs: elapsedMs(state, clock),
    startedAtMonotonic: null,
    startedAtWall: null,
  };
}

/**
 * Istante in cui il timer scade, per programmare la notifica locale.
 * `null` se il timer non e' in corsa.
 *
 * Nota: e' un'ora dell'orologio di SISTEMA, perche' e' quello che il sistema
 * operativo usa per le notifiche. Se l'utente sposta l'orologio, la notifica
 * va riprogrammata: vedi `notificationNeedsReschedule`.
 */
export function expiresAtWall(state: TimerState, clock: Clock): Instant | null {
  if (state.status !== 'running') return null;
  return clock.now() + remainingMs(state, clock);
}

/**
 * La notifica programmata va rifatta?
 *
 * Vero quando la scadenza attesa si discosta di oltre `toleranceMs` da quella
 * per cui la notifica era stata programmata. Serve per i cambi d'orologio e per
 * le modifiche manuali (+15 / -15), evitando di riprogrammare a ogni tick.
 */
export function notificationNeedsReschedule(
  state: TimerState,
  scheduledForWall: Instant | null,
  clock: Clock,
  toleranceMs = 2000,
): boolean {
  const expected = expiresAtWall(state, clock);
  if (expected === null) return scheduledForWall !== null;
  if (scheduledForWall === null) return true;
  return Math.abs(expected - scheduledForWall) > toleranceMs;
}

// ---------------------------------------------------------------------------
// Intervalli
// ---------------------------------------------------------------------------

export type IntervalPhaseKind = 'warmup' | 'hard' | 'easy' | 'cooldown' | 'done';

export const INTERVAL_PHASE_LABEL: Record<IntervalPhaseKind, string> = {
  warmup: 'Riscaldamento',
  hard: 'Sostenuto',
  easy: 'Facile',
  cooldown: 'Defaticamento',
  done: 'Finito',
};

export interface IntervalPlan {
  readonly warmupSeconds: number;
  readonly rounds: number;
  readonly hardSeconds: number;
  readonly easySeconds: number;
  readonly cooldownSeconds: number;
}

export interface IntervalPosition {
  readonly phase: IntervalPhaseKind;
  /** Ciclo corrente, 1-based. `null` fuori dai cicli. */
  readonly round: number | null;
  /** Secondi rimanenti nella fase corrente. */
  readonly remainingInPhaseSeconds: number;
  /** Secondi rimanenti in tutto il lavoro. */
  readonly remainingTotalSeconds: number;
  /**
   * Cicli **effettivamente trascorsi**. Non e' una conferma di esecuzione:
   * si chiama cosi' per non confonderlo con `roundsCompleted` di
   * `PerformedCardio`, che l'utente deve confermare (specifica §11).
   */
  readonly roundsElapsed: number;
}

export function intervalTotalSeconds(plan: IntervalPlan): number {
  return (
    plan.warmupSeconds +
    plan.rounds * (plan.hardSeconds + plan.easySeconds) +
    plan.cooldownSeconds
  );
}

/**
 * Dove si trova il lavoro a intervalli dopo `elapsedSeconds`.
 *
 * Funzione pura sul tempo trascorso: non registra niente e non conferma
 * niente. Il trascorrere del tempo non dimostra l'esecuzione del cardio.
 */
export function intervalPosition(plan: IntervalPlan, elapsedSeconds: number): IntervalPosition {
  const total = intervalTotalSeconds(plan);
  const t = Math.max(0, Math.min(elapsedSeconds, total));
  const remainingTotal = Math.max(0, total - t);

  if (t < plan.warmupSeconds) {
    return {
      phase: 'warmup',
      round: null,
      remainingInPhaseSeconds: plan.warmupSeconds - t,
      remainingTotalSeconds: remainingTotal,
      roundsElapsed: 0,
    };
  }

  const cycleSeconds = plan.hardSeconds + plan.easySeconds;
  const intoCycles = t - plan.warmupSeconds;
  const cyclesSpan = plan.rounds * cycleSeconds;

  if (cycleSeconds > 0 && intoCycles < cyclesSpan) {
    const roundIndex = Math.floor(intoCycles / cycleSeconds);
    const intoCycle = intoCycles - roundIndex * cycleSeconds;
    const inHard = intoCycle < plan.hardSeconds;
    return {
      phase: inHard ? 'hard' : 'easy',
      round: roundIndex + 1,
      remainingInPhaseSeconds: inHard
        ? plan.hardSeconds - intoCycle
        : cycleSeconds - intoCycle,
      remainingTotalSeconds: remainingTotal,
      roundsElapsed: roundIndex,
    };
  }

  const intoCooldown = intoCycles - cyclesSpan;
  if (intoCooldown < plan.cooldownSeconds) {
    return {
      phase: 'cooldown',
      round: null,
      remainingInPhaseSeconds: plan.cooldownSeconds - intoCooldown,
      remainingTotalSeconds: remainingTotal,
      roundsElapsed: plan.rounds,
    };
  }

  return {
    phase: 'done',
    round: null,
    remainingInPhaseSeconds: 0,
    remainingTotalSeconds: 0,
    roundsElapsed: plan.rounds,
  };
}

// ---------------------------------------------------------------------------
// Recuperi per gli esercizi unilaterali
// ---------------------------------------------------------------------------

/**
 * Quando parte il recupero PRINCIPALE in un esercizio per lato.
 *
 * Per lo step-up il recupero e' dopo entrambe le gambe (`restAfterBothSides`):
 * fra un lato e l'altro non parte un recupero completo, ma il conteggio delle
 * serie **non** raddoppia (specifica §11).
 */
export interface SideRestDecision {
  /** Avviare il recupero principale adesso? */
  readonly startMainRest: boolean;
  /** Quale lato va eseguito ora. `null` se la serie e' conclusa. */
  readonly nextSide: 'left' | 'right' | null;
  /** Testo da mostrare, in italiano. */
  readonly message: string;
}

export function decideSideRest(options: {
  readonly perSide: boolean;
  readonly restAfterBothSides: boolean;
  /** Lato appena completato. */
  readonly completedSide: 'left' | 'right' | 'both';
  /** true se l'altro lato di questa serie e' gia' stato svolto. */
  readonly otherSideDone: boolean;
}): SideRestDecision {
  if (!options.perSide) {
    return { startMainRest: true, nextSide: null, message: 'Serie completata: recupero avviato.' };
  }

  if (options.otherSideDone) {
    return {
      startMainRest: true,
      nextSide: null,
      message: 'Entrambi i lati completati: recupero avviato.',
    };
  }

  const next = options.completedSide === 'left' ? 'right' : 'left';
  const nextLabel = next === 'left' ? 'sinistro' : 'destro';

  if (options.restAfterBothSides) {
    return {
      startMainRest: false,
      nextSide: next,
      message: `Passa al lato ${nextLabel}. Il recupero parte dopo entrambi i lati.`,
    };
  }

  return {
    startMainRest: true,
    nextSide: next,
    message: `Recupero avviato. Poi il lato ${nextLabel}.`,
  };
}
