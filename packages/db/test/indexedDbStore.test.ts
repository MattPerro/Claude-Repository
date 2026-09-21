/**
 * Archivio durevole della PWA.
 *
 * Girano su `fake-indexeddb`, che implementa l'API di IndexedDB in memoria.
 * Questo verifica **il comportamento di questo codice** - in particolare che un
 * fallimento non venga confuso con un successo e che un valore inatteso non
 * venga confuso con un archivio vuoto - e **non** verifica IndexedDB di Safari
 * su iOS, che non e' presente qui (vedi `QA_REPORT.md`).
 */

import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import initSqlJs from 'sql.js';
import {
  IndexedDbUnavailableError,
  INDEXEDDB_STORE_NAME,
  openIndexedDbStore,
  requestPersistentStorage,
  SqlJsDriver,
  StorageQuotaExceededError,
  type SqlJsModule,
} from '@trackstrong/db';

const SQL = (await initSqlJs()) as unknown as SqlJsModule;

/** Un'istanza nuova per test: `fake-indexeddb` e' globale, altrimenti. */
function freshFactory(): IDBFactory {
  return new IDBFactory();
}

describe('Archivio IndexedDB', () => {
  it('restituisce null quando il file non esiste ancora', async () => {
    const store = await openIndexedDbStore({ factory: freshFactory() });
    expect(await store.load('trackstrong.db')).toBeNull();
    store.close();
  });

  it('conserva i byte fra una scrittura e una lettura successiva', async () => {
    const store = await openIndexedDbStore({ factory: freshFactory() });
    const bytes = new Uint8Array([1, 2, 3, 250]);
    await store.save('trackstrong.db', bytes);
    const read = await store.load('trackstrong.db');
    expect(read).not.toBeNull();
    expect(Array.from(read ?? [])).toEqual([1, 2, 3, 250]);
    store.close();
  });

  it('i byte sopravvivono alla chiusura e alla riapertura dell archivio', async () => {
    const factory = freshFactory();
    const first = await openIndexedDbStore({ factory });
    await first.save('trackstrong.db', new Uint8Array([9, 9, 9]));
    first.close();

    const second = await openIndexedDbStore({ factory });
    expect(Array.from((await second.load('trackstrong.db')) ?? [])).toEqual([9, 9, 9]);
    second.close();
  });

  it('non conserva un riferimento vivo ai byte ricevuti', async () => {
    // `export()` di sql.js restituisce una vista sulla memoria WebAssembly, che
    // puo' cambiare subito dopo. Salvare la vista significherebbe salvare byte
    // diversi da quelli passati.
    const store = await openIndexedDbStore({ factory: freshFactory() });
    const mutable = new Uint8Array([1, 2, 3]);
    const saving = store.save('k', mutable);
    mutable.set([7, 7, 7]);
    await saving;
    expect(Array.from((await store.load('k')) ?? [])).toEqual([1, 2, 3]);
    store.close();
  });

  it('cancella un file', async () => {
    const store = await openIndexedDbStore({ factory: freshFactory() });
    await store.save('k', new Uint8Array([1]));
    await store.remove('k');
    expect(await store.load('k')).toBeNull();
    store.close();
  });

  it('una quota esaurita rifiuta con un errore riconoscibile, non risolve', async () => {
    // E' il test che conta: se `save` risolvesse, il driver segnerebbe la
    // modifica come durevole e l'interfaccia mostrerebbe una conferma per un
    // dato che non esiste (specifica §10).
    const factory = freshFactory();
    const store = await openIndexedDbStore({ factory });
    const quota = Object.assign(new Error('quota'), { name: 'QuotaExceededError' });
    breakPut(store, quota);

    await expect(store.save('k', new Uint8Array([1]))).rejects.toBeInstanceOf(
      StorageQuotaExceededError,
    );
    store.close();
  });

  it('un errore generico di scrittura rifiuta e non viene confuso con la quota', async () => {
    const store = await openIndexedDbStore({ factory: freshFactory() });
    breakPut(store, new Error('archivio danneggiato'));

    const rejection = await store.save('k', new Uint8Array([1])).catch((error: unknown) => error);
    expect(rejection).toBeInstanceOf(Error);
    expect(rejection).not.toBeInstanceOf(StorageQuotaExceededError);
    expect(String(rejection)).toContain('archivio danneggiato');
    store.close();
  });

  it('un valore di tipo inatteso non viene trattato come archivio vuoto', async () => {
    // Restituire `null` qui farebbe ripartire l'app dall'onboarding sopra dei
    // dati esistenti, cioe' li sovrascriverebbe. La specifica (§7) vieta di
    // interpretare un errore come archivio vuoto.
    const factory = freshFactory();
    const store = await openIndexedDbStore({ factory });
    await store.save('k', new Uint8Array([1]));
    await putRaw(factory, 'k', 'non sono byte');

    const reopened = await openIndexedDbStore({ factory });
    await expect(reopened.load('k')).rejects.toThrow(/inatteso/);
    reopened.close();
    store.close();
  });

  it('segnala l indisponibilita dell archivio invece di proseguire senza', async () => {
    const factory = {
      open: () => {
        throw new Error('navigazione privata');
      },
    } as unknown as IDBFactory;
    await expect(openIndexedDbStore({ factory })).rejects.toBeInstanceOf(
      IndexedDbUnavailableError,
    );
  });
});

describe('Il driver sql.js sopra IndexedDB', () => {
  it('un allenamento scritto e reso durevole si ritrova dopo la riapertura', async () => {
    const factory = freshFactory();
    const store = await openIndexedDbStore({ factory });

    const first = new SqlJsDriver({ module: SQL, store, key: 'trackstrong.db' });
    first.exec('CREATE TABLE serie (id TEXT PRIMARY KEY, kg REAL NOT NULL) STRICT;');
    first.transaction(() => {
      first.run('INSERT INTO serie (id, kg) VALUES (?, ?)', ['a', 62.5]);
    });
    await first.flush();
    expect(first.hasPendingWrites).toBe(false);
    first.close();

    const reopenedStore = await openIndexedDbStore({ factory });
    const bytes = await reopenedStore.load('trackstrong.db');
    expect(bytes).not.toBeNull();
    const second = new SqlJsDriver({
      module: SQL,
      store: reopenedStore,
      key: 'trackstrong.db',
      initialBytes: bytes,
    });
    expect(second.get<{ kg: number }>('SELECT kg FROM serie WHERE id = ?', ['a'])?.kg).toBe(62.5);
    second.close();
  });

  it('con la quota esaurita il flush rifiuta e la modifica resta da salvare', async () => {
    const factory = freshFactory();
    const store = await openIndexedDbStore({ factory });
    const driver = new SqlJsDriver({ module: SQL, store, key: 'trackstrong.db' });
    driver.exec('CREATE TABLE serie (id TEXT PRIMARY KEY) STRICT;');
    await driver.flush();

    breakPut(store, Object.assign(new Error('quota'), { name: 'QuotaExceededError' }));
    driver.transaction(() => {
      driver.run('INSERT INTO serie (id) VALUES (?)', ['a']);
    });

    await expect(driver.flush()).rejects.toBeInstanceOf(StorageQuotaExceededError);
    expect(driver.hasPendingWrites).toBe(true);
    driver.close();
  });
});

describe('Richiesta di archiviazione persistente', () => {
  it('distingue un rifiuto da un API assente', async () => {
    expect(await requestPersistentStorage(undefined)).toEqual({ kind: 'unsupported' });

    const denied = {
      persisted: async () => false,
      persist: async () => false,
    } as unknown as StorageManager;
    expect(await requestPersistentStorage(denied)).toEqual({ kind: 'denied' });

    const granted = {
      persisted: async () => false,
      persist: async () => true,
    } as unknown as StorageManager;
    expect(await requestPersistentStorage(granted)).toEqual({ kind: 'granted' });
  });

  it('non richiede di nuovo il permesso se e gia concesso', async () => {
    let asked = 0;
    const already = {
      persisted: async () => true,
      persist: async () => {
        asked += 1;
        return true;
      },
    } as unknown as StorageManager;
    expect(await requestPersistentStorage(already)).toEqual({ kind: 'granted' });
    expect(asked).toBe(0);
  });

  it('un API che solleva non fa fallire l avvio', async () => {
    const broken = {
      persisted: async () => {
        throw new Error('negato');
      },
      persist: async () => true,
    } as unknown as StorageManager;
    expect(await requestPersistentStorage(broken)).toEqual({ kind: 'unsupported' });
  });
});

// ---------------------------------------------------------------------------
// Utilita' dei test
// ---------------------------------------------------------------------------

/**
 * Fa fallire la prossima `put` dell'archivio.
 *
 * `fake-indexeddb` non simula la quota, quindi il fallimento va iniettato
 * sostituendo `put` sull'object store. Si interviene sul metodo del prototipo
 * dell'istanza ottenuta, non su un doppio dell'intero archivio, cosi' il resto
 * del percorso - transazione, `onabort`, classificazione dell'errore - viene
 * eseguito davvero.
 */
function breakPut(store: { close(): void }, error: Error): void {
  const db = (store as unknown as { db: IDBDatabase }).db;
  const original = db.transaction.bind(db);
  (db as unknown as { transaction: IDBDatabase['transaction'] }).transaction = ((
    names: string | string[],
    mode?: IDBTransactionMode,
  ) => {
    const tx = original(names as string, mode);
    const objectStore = tx.objectStore.bind(tx);
    (tx as unknown as { objectStore: IDBTransaction['objectStore'] }).objectStore = ((
      name: string,
    ) => {
      const os = objectStore(name);
      (os as unknown as { put: () => never }).put = () => {
        throw error;
      };
      return os;
    }) as IDBTransaction['objectStore'];
    return tx;
  }) as IDBDatabase['transaction'];
}

/** Scrive un valore grezzo, per simulare un archivio corrotto o estraneo. */
async function putRaw(factory: IDBFactory, key: string, value: unknown): Promise<void> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open('trackstrong-archivio');
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error);
    };
  });
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(INDEXEDDB_STORE_NAME, 'readwrite');
    tx.objectStore(INDEXEDDB_STORE_NAME).put(value, key);
    tx.oncomplete = () => {
      resolve();
    };
    tx.onerror = () => {
      reject(tx.error);
    };
  });
  db.close();
}
