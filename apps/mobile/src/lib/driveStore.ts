/**
 * Porta Google Drive dell'app.
 *
 * ┌───────────────────────────────────────────────────────────────────────────┐
 * │  L'INTEGRAZIONE OAUTH NON E' IMPLEMENTATA E NON E' VERIFICATA.            │
 * │                                                                           │
 * │  In questo ambiente non esiste nessuna credenziale Google (nessun         │
 * │  `client_id`, nessun consenso, nessun accesso di rete verso               │
 * │  `accounts.google.com` o `www.googleapis.com`), quindi non c'e' modo di   │
 * │  scrivere un client OAuth e **dimostrare** che funziona. Scrivere         │
 * │  comunque il codice delle chiamate HTTP produrrebbe un'integrazione       │
 * │  simulata, e la specifica §15 vieta espressamente di dichiarare           │
 * │  funzionante un'integrazione simulata.                                    │
 * │                                                                           │
 * │  Quello che c'e' qui e' quindi la PORTA collegata e un'implementazione    │
 * │  che dice la verita': non c'e' nessun token, quindi ogni operazione       │
 * │  remota falisce con {@link DriveAuthError} e l'interfaccia mostra         │
 * │  "Non collegato" oppure "Accesso da rinnovare". Nessun pulsante inerte,   │
 * │  nessuna promessa.                                                        │
 * │                                                                           │
 * │  Cosa manca per completarla (senza cambiare il resto dell'app):           │
 * │   1. un `client_id` iOS in `app.json` e il relativo redirect URI;         │
 * │   2. `expo-auth-session` con PKCE e **nessun client secret** nel binario  │
 * │      (specifica §8 e mandato dell'ingegnere mobile);                      │
 * │   3. il token in `expo-secure-store`, mai nel database;                   │
 * │   4. `fetch` verso l'API Drive v3 con `spaces=appDataFolder` e            │
 * │      `parents: ['appDataFolder']`, mappando gli errori HTTP nelle classi  │
 * │      tipizzate di `@trackstrong/sync` (`drive.ts` documenta la mappa).    │
 * └───────────────────────────────────────────────────────────────────────────┘
 */

import {
  DriveAuthError,
  type DriveChangesPage,
  type DriveFileMetadata,
  type DriveStore,
  type DriveUploadResult,
} from '@trackstrong/sync';

/** Stato del collegamento, mostrato nelle impostazioni. */
export type DriveLinkState =
  /** Nessun account collegato: non e' un errore, e' la condizione iniziale. */
  | { readonly kind: 'notLinked' }
  /** Collegato in passato, token non piu' valido o non disponibile. */
  | { readonly kind: 'authExpired'; readonly accountEmail: string | null };

const NOT_IMPLEMENTED =
  "L'accesso a Google Drive non e' collegato: l'integrazione OAuth non e' " +
  'implementata in questa versione. I dati restano salvati sul dispositivo.';

/**
 * `DriveStore` senza token.
 *
 * Ogni metodo solleva {@link DriveAuthError}, che il motore di
 * sincronizzazione tratta come "accesso da rinnovare" e **non** come "archivio
 * vuoto" (specifica §8.1). Nessun metodo restituisce un elenco vuoto: sarebbe
 * esattamente l'errore vietato.
 */
export function createUnauthenticatedDriveStore(): DriveStore {
  return {
    getStartPageToken: (): Promise<string> => Promise.reject(newAuthError()),
    listChanges: (): Promise<DriveChangesPage> => Promise.reject(newAuthError()),
    listFiles: (): Promise<readonly DriveFileMetadata[]> => Promise.reject(newAuthError()),
    uploadFile: (): Promise<DriveUploadResult> => Promise.reject(newAuthError()),
    downloadFile: (): Promise<string> => Promise.reject(newAuthError()),
    deleteFile: (): Promise<void> => Promise.reject(newAuthError()),
  };
}

function newAuthError(): DriveAuthError {
  return new DriveAuthError(NOT_IMPLEMENTED, 'consenso-mancante');
}

/** Testo da mostrare per lo stato del collegamento. */
export function describeDriveLink(state: DriveLinkState): {
  readonly title: string;
  readonly detail: string;
} {
  if (state.kind === 'notLinked') {
    return {
      title: 'Non collegato',
      detail:
        "Nessun account Google collegato. L'integrazione OAuth con Drive non e' " +
        'implementata in questa versione: la sincronizzazione fra dispositivi non ' +
        'e\' disponibile. Il backup manuale in JSON funziona ed e\' nella sezione Backup.',
    };
  }
  return {
    title: 'Accesso da rinnovare',
    detail:
      state.accountEmail === null
        ? "L'accesso a Drive va rinnovato. Le modifiche restano salvate sul dispositivo."
        : `L'accesso a Drive per ${state.accountEmail} va rinnovato. Le modifiche restano salvate sul dispositivo.`,
  };
}
