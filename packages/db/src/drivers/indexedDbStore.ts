/**
 * Archivio durevole della PWA: IndexedDB.
 *
 * E' la meta' mancante di {@link SqlJsDriver}. Il driver tiene il database
 * SQLite nella memoria della pagina; questo modulo scrive il file altrove, in
 * un posto che sopravvive alla chiusura della scheda. Insieme sono l'unica
 * ragione per cui una PWA puo' essere usata per registrare allenamenti senza
 * perderli: separati, non lo sono.
 *
 * ---------------------------------------------------------------------------
 * PERCHE' SI ATTENDE `transaction.oncomplete` E NON `request.onsuccess`
 *
 * In IndexedDB `request.onsuccess` scatta quando l'operazione e' riuscita
 * **dentro** la transazione, non quando la transazione e' stata confermata. Fra
 * i due momenti la transazione puo' ancora abortire - per quota esaurita, per
 * un errore del motore, o perche' la scheda viene chiusa. Risolvere la
 * promessa su `onsuccess` significherebbe quindi dire "salvato" a un dato che
 * puo' ancora svanire, e su questo la specifica (§10) non lascia margine: un
 * salvataggio non riuscito non deve mai passare per riuscito.
 *
 * `save()` risolve percio' su `oncomplete` della transazione, e rifiuta su
 * `onabort` e su `onerror`.
 * ---------------------------------------------------------------------------
 *
 * ---------------------------------------------------------------------------
 * COSA QUESTO MODULO **NON** GARANTISCE
 *
 * IndexedDB non e' un disco. Il browser puo' espellere i dati di un sito, e
 * iOS lo fa con criteri suoi che non dipendono da questo codice. Chiamare
 * {@link requestPersistentStorage} riduce il rischio ma **non lo elimina**, e
 * il suo esito va mostrato all'utente invece di essere ignorato: e' la
 * differenza fra "i tuoi dati sono al sicuro" e "il browser ha accettato di
 * non cancellarli per primo".
 *
 * Per questo l'esportazione manuale del backup (`BACKUP_RESTORE.md`) resta
 * parte del prodotto e non un extra, e per questo la sincronizzazione con
 * Drive non e' decorativa.
 *
 * NON VERIFICATO SU DISPOSITIVO: qui non c'e' Safari, non c'e' iOS e non c'e'
 * una PWA installata. I test di questo modulo girano su `fake-indexeddb`, che
 * verifica il comportamento del codice, non quello del browser.
 * ---------------------------------------------------------------------------
 */

import type { BinaryStore } from './sqlJs.js';

/** Nome del database IndexedDB che contiene il file SQLite. */
export const INDEXEDDB_DATABASE_NAME = 'trackstrong-archivio';
/** Unico object store: una mappa da chiave a byte. */
export const INDEXEDDB_STORE_NAME = 'file';
/**
 * Versione dello schema di IndexedDB.
 *
 * Non c'entra con le migrazioni SQL: qui lo "schema" e' un solo object store,
 * e il contenuto e' un file opaco. Va alzata solo se cambia la struttura di
 * questo contenitore.
 */
export const INDEXEDDB_VERSION = 1;

/**
 * Spazio di archiviazione esaurito.
 *
 * Distinto da un errore generico perche' la risposta dell'utente e' diversa:
 * non "riprova", ma "libera spazio o esporta un backup". Riconoscerlo evita
 * anche di trattarlo come "archivio vuoto", che la specifica (§7) vieta.
 */
export class StorageQuotaExceededError extends Error {
  constructor(cause: unknown) {
    super(
      "Lo spazio di archiviazione del browser e' esaurito: il salvataggio non " +
        "e' avvenuto. Libera spazio sul dispositivo, oppure esporta un backup e " +
        "riprova. I dati gia' salvati non sono stati toccati.",
      { cause },
    );
    this.name = 'StorageQuotaExceededError';
  }
}

/** IndexedDB non disponibile: modalita' privata, o accesso negato. */
export class IndexedDbUnavailableError extends Error {
  constructor(cause: unknown) {
    super(
      "L'archivio del browser non e' accessibile, quindi non c'e' nessun posto " +
        "sicuro in cui salvare gli allenamenti. L'avvio si interrompe invece di " +
        'tenere i dati solo in memoria: sarebbero perduti alla chiusura della ' +
        'pagina. Su iPhone questo accade in navigazione privata.',
      { cause },
    );
    this.name = 'IndexedDbUnavailableError';
  }
}

function isQuotaError(error: unknown): boolean {
  // `QuotaExceededError` e' un `DOMException` con quel `name`. Il confronto sul
  // nome e non sulla classe perche' `DOMException` non esiste su tutti i
  // runtime in cui questo codice viene verificato.
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name: unknown }).name === 'QuotaExceededError'
  );
}

export interface IndexedDbStoreOptions {
  /**
   * Implementazione di IndexedDB.
   *
   * Iniettabile perche' i test girano su `fake-indexeddb` e non nel browser.
   * Nell'app e' `globalThis.indexedDB`.
   */
  readonly factory: IDBFactory;
  readonly databaseName?: string | undefined;
  readonly version?: number | undefined;
}

/**
 * Apre l'archivio, creando l'object store al primo avvio.
 *
 * @throws {IndexedDbUnavailableError} se il browser nega l'accesso.
 */
export async function openIndexedDbStore(
  options: IndexedDbStoreOptions,
): Promise<IndexedDbBinaryStore> {
  const name = options.databaseName ?? INDEXEDDB_DATABASE_NAME;
  const version = options.version ?? INDEXEDDB_VERSION;

  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = options.factory.open(name, version);
    } catch (error) {
      reject(new IndexedDbUnavailableError(error));
      return;
    }
    request.onupgradeneeded = () => {
      const opened = request.result;
      if (!opened.objectStoreNames.contains(INDEXEDDB_STORE_NAME)) {
        opened.createObjectStore(INDEXEDDB_STORE_NAME);
      }
    };
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(new IndexedDbUnavailableError(request.error));
    };
    request.onblocked = () => {
      // Un'altra scheda tiene aperta una versione precedente. Non si attende
      // in silenzio: chi ha aperto l'app due volte deve saperlo.
      reject(
        new IndexedDbUnavailableError(
          new Error(
            "L'archivio e' bloccato da un'altra scheda con una versione " +
              "precedente dell'app. Chiudi le altre schede e ricarica.",
          ),
        ),
      );
    };
  });

  return new IndexedDbBinaryStore(db);
}

export class IndexedDbBinaryStore implements BinaryStore {
  constructor(private readonly db: IDBDatabase) {}

  async load(key: string): Promise<Uint8Array | null> {
    return new Promise<Uint8Array | null>((resolve, reject) => {
      const tx = this.db.transaction(INDEXEDDB_STORE_NAME, 'readonly');
      const request = tx.objectStore(INDEXEDDB_STORE_NAME).get(key);
      request.onsuccess = () => {
        const value: unknown = request.result;
        if (value === undefined || value === null) {
          resolve(null);
          return;
        }
        if (value instanceof Uint8Array) {
          resolve(value);
          return;
        }
        if (value instanceof ArrayBuffer) {
          resolve(new Uint8Array(value));
          return;
        }
        // Un valore di tipo inatteso non viene "interpretato": restituire
        // `null` qui equivarrebbe a dire "archivio vuoto" davanti a un
        // archivio che contiene qualcosa, e a quel punto l'app ripartirebbe
        // da zero sopra dei dati esistenti.
        reject(
          new Error(
            `L'archivio contiene per la chiave "${key}" un valore di tipo ` +
              'inatteso. Non viene trattato come archivio vuoto: interrompere ' +
              "e' l'unico modo di non sovrascrivere dati validi.",
          ),
        );
      };
      request.onerror = () => {
        reject(request.error ?? new Error('Lettura non riuscita.'));
      };
    });
  }

  async save(key: string, bytes: Uint8Array): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let tx: IDBTransaction;
      try {
        tx = this.db.transaction(INDEXEDDB_STORE_NAME, 'readwrite');
      } catch (error) {
        reject(error);
        return;
      }

      // Copia in un `ArrayBuffer` proprio: `export()` di sql.js restituisce una
      // vista sulla memoria WebAssembly, che puo' essere riutilizzata prima che
      // la transazione si chiuda. Salvare la vista significherebbe salvare
      // byte che nel frattempo sono cambiati.
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);

      let failure: unknown = null;
      const store = tx.objectStore(INDEXEDDB_STORE_NAME);
      try {
        const request = store.put(copy, key);
        request.onerror = () => {
          failure = request.error;
        };
      } catch (error) {
        // `put` puo' sollevare in modo sincrono, per esempio su quota.
        failure = error;
        try {
          tx.abort();
        } catch {
          // Abortire una transazione gia' abortita non aggiunge informazione:
          // l'errore vero e' `failure`, restituito qui sotto.
        }
      }

      // `oncomplete` e non `request.onsuccess`: e' la conferma della
      // transazione, cioe' il solo momento in cui il dato e' durevole.
      tx.oncomplete = () => {
        resolve();
      };
      tx.onabort = () => {
        const error = failure ?? tx.error;
        reject(isQuotaError(error) ? new StorageQuotaExceededError(error) : toError(error));
      };
      tx.onerror = () => {
        const error = failure ?? tx.error;
        reject(isQuotaError(error) ? new StorageQuotaExceededError(error) : toError(error));
      };
    });
  }

  async remove(key: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const tx = this.db.transaction(INDEXEDDB_STORE_NAME, 'readwrite');
      tx.objectStore(INDEXEDDB_STORE_NAME).delete(key);
      tx.oncomplete = () => {
        resolve();
      };
      tx.onabort = () => {
        reject(toError(tx.error));
      };
      tx.onerror = () => {
        reject(toError(tx.error));
      };
    });
  }

  close(): void {
    this.db.close();
  }
}

function toError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error(
    `Scrittura nell'archivio del browser non riuscita: ${String(error ?? 'causa ignota')}`,
  );
}

/**
 * Esito della richiesta di archiviazione persistente.
 *
 * Tre casi distinti, non un booleano: "il browser ha detto sì", "il browser ha
 * detto no" e "il browser non sa di cosa parliamo" richiedono messaggi
 * diversi, e il terzo non e' un rifiuto.
 */
export type PersistenceVerdict =
  | { readonly kind: 'granted' }
  | { readonly kind: 'denied' }
  | { readonly kind: 'unsupported' };

/**
 * Chiede al browser di non espellere i dati del sito.
 *
 * Su iOS l'esito dipende anche dall'aver aggiunto l'app alla schermata Home:
 * una pagina aperta in Safari e visitata di rado e' un candidato
 * all'espulsione. L'esito **va mostrato**, perche' un "denied" cambia cosa
 * l'utente dovrebbe fare (installare l'app, e tenere attivo il backup).
 *
 * Non solleva: un browser che non conosce l'API non e' un errore dell'app.
 */
export async function requestPersistentStorage(
  storage: StorageManager | undefined,
): Promise<PersistenceVerdict> {
  if (storage === undefined || typeof storage.persist !== 'function') {
    return { kind: 'unsupported' };
  }
  try {
    if (typeof storage.persisted === 'function' && (await storage.persisted())) {
      return { kind: 'granted' };
    }
    return (await storage.persist()) ? { kind: 'granted' } : { kind: 'denied' };
  } catch {
    return { kind: 'unsupported' };
  }
}
