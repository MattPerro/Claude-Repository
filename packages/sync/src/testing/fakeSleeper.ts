/**
 * Attesa finta: registra i ritardi richiesti e ritorna subito.
 *
 * Nessun test di questo pacchetto attende tempo reale. Se un test diventasse
 * lento, e' il segno che qualcosa sta usando `setTimeout` invece della porta
 * {@link Sleeper}.
 */

import type { Sleeper } from '../retry.js';

export class FakeSleeper implements Sleeper {
  readonly waits: number[] = [];

  async sleep(ms: number): Promise<void> {
    this.waits.push(ms);
  }

  get totalWaitMs(): number {
    return this.waits.reduce((a, b) => a + b, 0);
  }

  reset(): void {
    this.waits.length = 0;
  }
}

/** Jitter deterministico: sequenza fissa in [0,1). */
export function fixedRandom(sequence: readonly number[] = [0.5]): () => number {
  let i = 0;
  return () => {
    const value = sequence[i % sequence.length] ?? 0.5;
    i += 1;
    return value;
  };
}
