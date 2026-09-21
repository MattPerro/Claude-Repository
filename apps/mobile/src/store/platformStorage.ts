/**
 * Contratto dell'archivio locale, comune a dispositivo e PWA.
 *
 * Vive in un file SENZA gemello di piattaforma, e non per ordine: se questo
 * contratto stesse in `platform.ts`, il gemello `platform.web.ts` che lo
 * importa risolverebbe su se stesso - Metro, in compilazione per il web,
 * preferisce `.web.ts` a `.ts` - e l'import sarebbe circolare.
 */

import type { Device } from '@trackstrong/core';
import type { SqlDriver } from '@trackstrong/db';

/**
 * Quanto e' protetto l'archivio dalla cancellazione.
 *
 * Non e' un booleano perche' i quattro casi richiedono messaggi diversi, e
 * "il browser non conosce l'API" non e' un rifiuto.
 */
export type StoragePersistence =
  /** File nell'area privata dell'app nativa: il sistema non lo cancella. */
  | { readonly kind: 'fileSystem' }
  /** Il browser ha accettato di non espellere i dati del sito. */
  | { readonly kind: 'granted' }
  /** Il browser ha rifiutato: puo' cancellarli per liberare spazio. */
  | { readonly kind: 'denied' }
  /** Il browser non permette di chiedere: l'esito e' ignoto, non favorevole. */
  | { readonly kind: 'unsupported' };

export interface PlatformStorage {
  readonly driver: SqlDriver;
  /**
   * Rende durevoli le scritture confermate.
   *
   * L'interfaccia deve attenderla **prima di mostrare una conferma**. Sul
   * nativo risolve immediatamente, perche' su un file SQLite il COMMIT e' la
   * durabilita'; nella PWA attende la scrittura in IndexedDB e **rilancia** se
   * non e' riuscita.
   */
  flush(): Promise<void>;
  /** `true` se esistono scritture confermate ma non ancora durevoli. */
  hasPendingWrites(): boolean;
  /** Dove vivono i dati, in una frase, per la schermata impostazioni. */
  readonly storageDescription: string;
  readonly persistence: StoragePersistence;
  /** Come si chiama questa installazione nell'elenco dei dispositivi. */
  readonly deviceLabel: string;
  readonly devicePlatform: Device['platform'];
  close(): void;
}
