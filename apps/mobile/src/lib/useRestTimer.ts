/**
 * Timer di recupero della seduta.
 *
 * La fonte di verita' e' **doppia e coerente**, non doppia e divergente:
 *
 *  - in memoria, uno {@link TimerState} di `@trackstrong/core`, con tutte le
 *    transizioni (`startTimer`, `pause`, `resume`, `adjust`, `skip`,
 *    `reconcile`) prese da la' e non reimplementate;
 *  - su disco, una riga in `timers` con la **scadenza assoluta**, perche' se il
 *    sistema operativo termina il processo lo stato in memoria non esiste piu'.
 *
 * `setInterval` serve **solo a ridisegnare**: se il suo callback non viene mai
 * eseguito il tempo rimanente resta corretto, perche' e' ricalcolato dalla
 * scadenza a ogni lettura (§11 e mandato dell'ingegnere mobile).
 *
 * Al ritorno in primo piano si riconcilia: un recupero scaduto risulta
 * terminato. **Nessuna serie viene completata automaticamente**: questo modulo
 * non ha nessun modo di scrivere una serie, e non ne conosce l'esistenza.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import {
  adjust as adjustTimer,
  pause as pauseTimer,
  reconcile as reconcileTimer,
  remainingSeconds as coreRemainingSeconds,
  resume as resumeTimer,
  skip as skipTimer,
  startTimer,
  type Clock,
  type Instant,
  type Monotonic,
  type TimerState,
} from '@trackstrong/core';
import type { PersistedTimer, Repositories } from '@trackstrong/db';

/** Passo dei comandi rapidi richiesti dalla specifica §11. */
export const REST_ADJUST_SECONDS = 15;

export interface RestTimerApi {
  /** `null` quando non c'e' nessun recupero in corso. */
  readonly state: TimerState | null;
  readonly remaining: number;
  readonly running: boolean;
  readonly paused: boolean;
  readonly expired: boolean;
  /** Secondi aggiunti o togliti a mano, per trasparenza. */
  readonly manualAdjustmentSeconds: number;
  start(options: {
    readonly durationSeconds: number;
    readonly performedExerciseId: string | null;
    readonly performedSetId: string | null;
    readonly note: string | null;
  }): void;
  pause(): void;
  resume(): void;
  addSeconds(delta: number): void;
  skip(): void;
  /** L'utente ha preso atto della fine del recupero. */
  dismiss(): void;
}

function toCoreState(persisted: PersistedTimer, id: string): TimerState {
  const durationMs = Math.round(persisted.durationSeconds * 1000);
  const paused = persisted.status === 'paused';
  const expired = persisted.status === 'expired';
  return {
    id,
    kind: 'rest',
    status: paused ? 'paused' : expired ? 'expired' : 'running',
    durationMs,
    elapsedBeforeMs: paused
      ? Math.max(0, durationMs - (persisted.remainingMsAtPause ?? 0))
      : expired
        ? durationMs
        : 0,
    // Dopo una terminazione del processo la base monotona non e' piu'
    // confrontabile: si usa solo l'orologio di sistema, ricostruito dalla
    // scadenza persistita. `elapsedSinceStart` di core scarta le misure
    // negative, quindi un orologio spostato indietro non allunga il recupero.
    startedAtMonotonic: null,
    startedAtWall: paused || expired ? null : ((persisted.expiresAt - durationMs) as Instant),
    createdAt: persisted.startedAt,
    sessionId: persisted.sessionId,
    performedExerciseId: null,
    localNotificationId: null,
    manualAdjustmentMs: 0,
  };
}

export function useRestTimer(options: {
  readonly repos: Repositories;
  readonly clock: Clock;
  readonly sessionId: string;
  readonly newId: () => string;
  /** Chiamato una sola volta quando il recupero finisce mentre l'app e' aperta. */
  readonly onExpired?: () => void;
}): RestTimerApi {
  const { repos, clock, sessionId, newId, onExpired } = options;

  const [state, setState] = useState<TimerState | null>(null);
  const persistedIdRef = useRef<string | null>(null);
  const expiredNotifiedRef = useRef(false);
  // Ridisegno: un contatore, non una copia del tempo rimanente.
  const [, setTick] = useState(0);

  /**
   * Copia sincrona dello stato.
   *
   * I comandi scrivono nel database, e una scrittura non puo' stare dentro un
   * aggiornatore di `setState`: React puo' rieseguirlo, e un doppio
   * `timers.start()` lascerebbe due righe. Gli effetti stanno quindi fuori, e
   * leggono da qui.
   */
  const stateRef = useRef<TimerState | null>(null);
  const applyState = useCallback((next: TimerState | null) => {
    stateRef.current = next;
    setState(next);
  }, []);

  // Ripresa dopo un'interruzione: si legge la riga persistita.
  useEffect(() => {
    const pending = repos.timers
      .pending()
      .find((timer) => timer.kind === 'rest' && timer.sessionId === sessionId);
    if (pending === undefined) return;
    persistedIdRef.current = pending.id;
    const restored = reconcileTimer(toCoreState(pending, pending.id), clock);
    applyState(restored);
    expiredNotifiedRef.current = restored.status === 'expired';
  }, [repos, clock, sessionId, applyState]);

  // Ridisegno a 1 Hz mentre il recupero corre. Solo ridisegno.
  useEffect(() => {
    if (state === null || state.status !== 'running') return undefined;
    const handle = setInterval(() => {
      setTick((n) => n + 1);
    }, 250);
    return () => {
      clearInterval(handle);
    };
  }, [state]);

  // Riconciliazione al ritorno in primo piano.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next !== 'active') return;
      repos.timers.reconcile(clock.now());
      const current = stateRef.current;
      applyState(current === null ? null : reconcileTimer(current, clock));
      setTick((n) => n + 1);
    });
    return () => {
      subscription.remove();
    };
  }, [repos, clock, applyState]);

  const remaining = state === null ? 0 : coreRemainingSeconds(state, clock);
  const expired = state !== null && (state.status === 'expired' || remaining <= 0);

  // Avviso una sola volta, e senza toccare nessuna serie.
  useEffect(() => {
    if (!expired || state === null || expiredNotifiedRef.current) return;
    expiredNotifiedRef.current = true;
    onExpired?.();
  }, [expired, state, onExpired]);

  const cancelPersisted = useCallback(() => {
    const id = persistedIdRef.current;
    if (id === null) return;
    try {
      repos.timers.cancel(id);
    } catch {
      // Un timer gia' concluso non e' un errore da mostrare.
    }
    persistedIdRef.current = null;
  }, [repos]);

  const start = useCallback<RestTimerApi['start']>(
    (input) => {
      cancelPersisted();
      const id = newId();
      const created = startTimer(
        {
          id,
          kind: 'rest',
          durationSeconds: input.durationSeconds,
          sessionId,
          performedExerciseId: input.performedExerciseId,
        },
        clock,
      );
      // La riga persistita nasce insieme allo stato in memoria: se l'app muore
      // adesso, al rientro il recupero e' ancora corretto.
      const persisted = repos.timers.start({
        id,
        kind: 'rest',
        durationSeconds: input.durationSeconds,
        startedAt: clock.now(),
        monotonicBase: clock.monotonic() as Monotonic,
        sessionId,
        performedSetId: input.performedSetId,
        note: input.note,
      });
      persistedIdRef.current = persisted.id;
      expiredNotifiedRef.current = false;
      applyState(created);
    },
    [cancelPersisted, newId, clock, repos, sessionId, applyState],
  );

  const pause = useCallback(() => {
    const current = stateRef.current;
    if (current === null || current.status !== 'running') return;
    const id = persistedIdRef.current;
    if (id !== null) {
      try {
        repos.timers.pause(id, clock.now());
      } catch {
        /* la verita' in memoria resta valida */
      }
    }
    applyState(pauseTimer(current, clock));
  }, [repos, clock, applyState]);

  const resume = useCallback(() => {
    const current = stateRef.current;
    if (current === null || current.status !== 'paused') return;
    const id = persistedIdRef.current;
    if (id !== null) {
      try {
        repos.timers.resume(id, clock.now());
      } catch {
        /* la verita' in memoria resta valida */
      }
    }
    applyState(resumeTimer(current, clock));
  }, [repos, clock, applyState]);

  /**
   * +15 / -15 secondi.
   *
   * In memoria l'aggiustamento e' accumulato da `adjust` di core, che lo tiene
   * separato dalla durata prescritta. Sul disco la riga viene ricreata con la
   * nuova durata residua, perche' `timerRepository` conserva una scadenza
   * assoluta e non un aggiustamento: e' la stessa informazione, nella forma che
   * ciascuno dei due sa rappresentare.
   */
  const addSeconds = useCallback(
    (delta: number) => {
      const current = stateRef.current;
      if (current === null) return;
      const next = adjustTimer(current, delta);
      const secondsLeft = coreRemainingSeconds(next, clock);
      cancelPersisted();
      if (secondsLeft > 0 && next.status === 'running') {
        const persisted = repos.timers.start({
          id: newId(),
          kind: 'rest',
          durationSeconds: secondsLeft,
          startedAt: clock.now(),
          monotonicBase: clock.monotonic() as Monotonic,
          sessionId,
          note: 'recupero modificato a mano',
        });
        persistedIdRef.current = persisted.id;
      }
      applyState(next);
    },
    [cancelPersisted, repos, clock, newId, sessionId, applyState],
  );

  const skip = useCallback(() => {
    const current = stateRef.current;
    if (current === null) return;
    const id = persistedIdRef.current;
    if (id !== null) {
      try {
        repos.timers.acknowledge(id);
      } catch {
        /* niente da mostrare */
      }
      persistedIdRef.current = null;
    }
    expiredNotifiedRef.current = true;
    applyState(skipTimer(current, clock));
  }, [repos, clock, applyState]);

  const dismiss = useCallback(() => {
    const id = persistedIdRef.current;
    if (id !== null) {
      try {
        repos.timers.acknowledge(id);
      } catch {
        /* niente da mostrare */
      }
      persistedIdRef.current = null;
    }
    expiredNotifiedRef.current = true;
    applyState(null);
  }, [repos, applyState]);

  return {
    state,
    remaining,
    running: state !== null && state.status === 'running' && !expired,
    paused: state !== null && state.status === 'paused',
    expired,
    manualAdjustmentSeconds: state === null ? 0 : Math.round(state.manualAdjustmentMs / 1000),
    start,
    pause,
    resume,
    addSeconds,
    skip,
    dismiss,
  };
}
