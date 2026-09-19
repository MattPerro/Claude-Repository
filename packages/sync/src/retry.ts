/**
 * Attese progressive con jitter (specifica §8; guida ufficiale
 * https://developers.google.com/workspace/drive/api/guides/handle-errors,
 * consultata il 2026-09-19).
 *
 * La guida di Google prescrive backoff esponenziale con una componente
 * casuale: `1 + random_ms`, poi `2 + random_ms`, ecc., fino a un tetto. Il
 * jitter evita che piu' client (o piu' operazioni dello stesso client)
 * ritentino in sincronia.
 *
 * ## Nessuna attesa reale nei test
 *
 * Il ritardo non viene mai eseguito con `setTimeout` da questo modulo: passa
 * sempre dalla porta {@link Sleeper}. Nei test si inietta un finto che
 * registra le attese e ritorna subito, quindi la suite non aspetta tempo
 * reale.
 */

import { DriveRateLimitError, isDriveError } from './drive.js';

/** Porta di attesa iniettabile. */
export interface Sleeper {
  sleep(ms: number): Promise<void>;
}

/** Attesa reale, per la produzione. */
export const realSleeper: Sleeper = {
  sleep: (ms) =>
    new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    }),
};

export interface RetryPolicy {
  /** Tetto massimo ai tentativi, incluso il primo. */
  readonly maxAttempts: number;
  /** Ritardo di base del backoff esponenziale. */
  readonly baseDelayMs: number;
  /** Tetto al singolo ritardo. */
  readonly maxDelayMs: number;
  /** Ampiezza massima del jitter additivo. */
  readonly jitterMs: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 5,
  baseDelayMs: 1_000,
  maxDelayMs: 32_000,
  jitterMs: 1_000,
};

/**
 * Ritardo per il tentativo `attempt` (1-based).
 *
 * `retryAfterMs`, quando il server lo indica (`Retry-After` su un 429), ha la
 * precedenza sul backoff calcolato: e' il server a sapere quanto aspettare.
 */
export function backoffDelayMs(
  attempt: number,
  policy: RetryPolicy,
  random: () => number,
  retryAfterMs: number | null = null,
): number {
  if (retryAfterMs !== null && retryAfterMs >= 0) {
    return Math.min(retryAfterMs, policy.maxDelayMs * 2);
  }
  const exponential = policy.baseDelayMs * 2 ** Math.max(0, attempt - 1);
  const capped = Math.min(exponential, policy.maxDelayMs);
  return Math.round(capped + random() * policy.jitterMs);
}

export interface RetryContext {
  readonly policy: RetryPolicy;
  readonly sleeper: Sleeper;
  readonly random: () => number;
  /** Chiamata prima di ogni nuovo tentativo, per la diagnostica. */
  readonly onRetry?: (info: { attempt: number; delayMs: number; error: unknown }) => void;
}

/**
 * Esegue `action` ritentando solo gli errori ritentabili.
 *
 * Non ritenta: token revocato, quota esaurita, spazio esaurito, file
 * inesistente. Ritentarli non serve a nulla e nasconderebbe all'utente un
 * problema che deve vedere (specifica §8.5).
 */
export async function withRetry<T>(
  action: (attempt: number) => Promise<T>,
  context: RetryContext,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= context.policy.maxAttempts; attempt += 1) {
    try {
      return await action(attempt);
    } catch (error) {
      lastError = error;
      const retryable = isDriveError(error) ? error.retryable : false;
      if (!retryable || attempt === context.policy.maxAttempts) throw error;
      const retryAfter = error instanceof DriveRateLimitError ? error.retryAfterMs : null;
      const delayMs = backoffDelayMs(attempt, context.policy, context.random, retryAfter);
      context.onRetry?.({ attempt, delayMs, error });
      await context.sleeper.sleep(delayMs);
    }
  }
  throw lastError;
}
