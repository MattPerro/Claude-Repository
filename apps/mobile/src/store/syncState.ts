/**
 * Stato della sincronizzazione mostrato dall'interfaccia, e i momenti in cui si
 * tenta.
 *
 * ## Che cosa e' collegato e che cosa no
 *
 * Collegato:
 *  - la **coda locale** delle operazioni (`syncRepository.pendingOperations`),
 *    che `withWrite` riempie nella stessa transazione del dato (§7);
 *  - i **conflitti aperti** (`syncRepository.openConflicts`);
 *  - il **blocco della sola sincronizzazione** quando lo schema o il protocollo
 *    dell'archivio sono piu' recenti del codice (`db.syncBlockedReason`, §14);
 *  - la **porta Drive** (`DriveStore`), con i suoi errori tipizzati;
 *  - i **momenti** in cui si tenta: apertura, ritorno in primo piano, fine
 *    seduta, comando manuale (§8.4).
 *
 * NON collegato, e dichiarato:
 *  - `SyncEngine` di `@trackstrong/sync` **non e' istanziato**. Gli serve una
 *    implementazione di `SyncStateStore` su SQLite (record materializzati,
 *    quarantena dei pacchetti, `applyIncoming` atomico, tombstone) che in
 *    `@trackstrong/db` non esiste: `syncRepository` e' un modello diverso e piu'
 *    piccolo. Scrivere qui un adattatore parziale darebbe una
 *    sincronizzazione che sembra funzionare e perde dati, che e' il caso
 *    peggiore secondo la gerarchia di priorita' della specifica (§1.1).
 *  - OAuth: vedi `src/lib/driveStore.ts`.
 *
 * Conseguenza visibile: le modifiche si accumulano nella coda locale e
 * l'interfaccia lo dice ("Modifiche in attesa" / "Non collegato"). **Nessun
 * percorso di salvataggio attende la rete**: `attemptSync` non e' mai sul
 * cammino di una registrazione.
 */

import {
  isDriveError,
  DriveAuthError,
  DriveNetworkError,
  DriveRateLimitError,
  DriveStorageFullError,
  type DriveStore,
} from '@trackstrong/sync';
import type { Instant, SyncStateName } from '@trackstrong/core';
import type { Database, Repositories } from '@trackstrong/db';

/** Momenti previsti dalla specifica §8.4. */
export type SyncMoment =
  | 'apertura'
  | 'primo-piano'
  | 'fine-seduta'
  | 'comando-manuale'
  | 'rete-tornata';

export const SYNC_MOMENT_LABEL: Record<SyncMoment, string> = {
  apertura: "all'apertura dell'app",
  'primo-piano': 'al ritorno in primo piano',
  'fine-seduta': 'alla fine della seduta',
  'comando-manuale': 'su comando manuale',
  'rete-tornata': 'al ritorno della connessione',
};

export interface SyncSnapshot {
  readonly state: SyncStateName;
  /** Testo aggiuntivo per `SyncIndicator`, es. "3 in coda". */
  readonly detail: string | null;
  readonly pendingOperations: number;
  readonly openConflicts: number;
  readonly lastAttemptAt: Instant | null;
  readonly lastAttemptMoment: SyncMoment | null;
  /** Messaggio dell'ultimo errore, da mostrare per intero nelle impostazioni. */
  readonly lastError: string | null;
  /** Motivo per cui la SOLA sincronizzazione e' bloccata (§14). */
  readonly blockedReason: string | null;
  readonly lastPushedAt: Instant | null;
}

/** Stato di partenza, prima di qualunque lettura. */
export const INITIAL_SYNC_SNAPSHOT: SyncSnapshot = {
  state: 'savedLocally',
  detail: null,
  pendingOperations: 0,
  openConflicts: 0,
  lastAttemptAt: null,
  lastAttemptMoment: null,
  lastError: null,
  blockedReason: null,
  lastPushedAt: null,
};

/**
 * Legge lo stato dal database locale. Lettura pura, nessuna rete.
 *
 * L'ordine di precedenza e' quello della specifica §8.5: un conflitto da
 * risolvere e' piu' importante di modifiche in attesa, e modifiche in attesa
 * sono piu' importanti di "salvato sul dispositivo".
 */
export function readSyncSnapshot(
  db: Database,
  repos: Repositories,
  previous: SyncSnapshot,
): SyncSnapshot {
  const pending = repos.sync.pendingCount();
  const conflicts = repos.sync.openConflicts().length;
  const state = repos.sync.state();
  const blocked = db.syncBlockedReason ?? state?.syncBlockedReason ?? null;

  const base: Omit<SyncSnapshot, 'state' | 'detail'> = {
    pendingOperations: pending,
    openConflicts: conflicts,
    lastAttemptAt: previous.lastAttemptAt,
    lastAttemptMoment: previous.lastAttemptMoment,
    lastError: previous.lastError,
    blockedReason: blocked,
    lastPushedAt: state?.lastPushedAt ?? null,
  };

  if (conflicts > 0) {
    return {
      ...base,
      state: 'conflict',
      detail: `${String(conflicts)} da risolvere`,
    };
  }
  if (blocked !== null) {
    // Lo stato visivo e' quello di un accesso da rinnovare: e' l'unico stato
    // dei token disponibili che significhi "la sincronizzazione e' sospesa,
    // i dati locali no".
    return { ...base, state: 'authExpired', detail: 'sincronizzazione sospesa' };
  }
  if (pending > 0) {
    return { ...base, state: 'pending', detail: `${String(pending)} in coda` };
  }
  return { ...base, state: 'savedLocally', detail: null };
}

function describeDriveError(error: unknown): { readonly state: SyncStateName; readonly message: string } {
  if (error instanceof DriveAuthError) {
    return { state: 'authExpired', message: error.message };
  }
  if (error instanceof DriveNetworkError) {
    return { state: 'offline', message: error.message };
  }
  if (error instanceof DriveRateLimitError) {
    return { state: 'pending', message: error.message };
  }
  if (error instanceof DriveStorageFullError) {
    return { state: 'authExpired', message: error.message };
  }
  if (isDriveError(error)) {
    return { state: 'authExpired', message: error.message };
  }
  return {
    state: 'authExpired',
    message: error instanceof Error ? error.message : 'Errore non identificato.',
  };
}

/**
 * Tenta una sincronizzazione.
 *
 * Non e' mai sul cammino di una registrazione: viene invocata dopo, e un suo
 * fallimento non tocca i dati locali. Finche' l'integrazione OAuth non c'e',
 * la porta Drive risponde con {@link DriveAuthError} e questo si traduce in
 * "Accesso da rinnovare" (§8.5), non in "archivio vuoto".
 */
export async function attemptSync(
  db: Database,
  repos: Repositories,
  drive: DriveStore,
  moment: SyncMoment,
): Promise<SyncSnapshot> {
  const local = readSyncSnapshot(db, repos, INITIAL_SYNC_SNAPSHOT);
  const at = db.clock.now();

  if (local.blockedReason !== null) {
    return {
      ...local,
      lastAttemptAt: at,
      lastAttemptMoment: moment,
      lastError: local.blockedReason,
    };
  }

  try {
    // Prima chiamata reale attraverso la porta: serve il cursore dei
    // cambiamenti prima di qualunque scaricamento (§8.1).
    await drive.getStartPageToken();
    // Se un giorno ci sara' un token valido, qui va invocato SyncEngine.
    // Finche' non c'e' un `SyncStateStore` su SQLite non si prosegue: meglio
    // fermarsi che applicare a meta'.
    return {
      ...local,
      state: 'authExpired',
      detail: 'da completare',
      lastAttemptAt: at,
      lastAttemptMoment: moment,
      lastError:
        "Il collegamento a Drive ha risposto, ma il motore di sincronizzazione non e' " +
        "collegato in questa versione: manca l'archivio di stato su SQLite. " +
        'Le modifiche restano in coda sul dispositivo.',
    };
  } catch (error) {
    const described = describeDriveError(error);
    return {
      ...local,
      state: described.state,
      detail: local.pendingOperations > 0 ? `${String(local.pendingOperations)} in coda` : null,
      lastAttemptAt: at,
      lastAttemptMoment: moment,
      lastError: described.message,
    };
  }
}
