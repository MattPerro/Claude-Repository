/**
 * Archivio locale nella PWA (browser, incluso Safari su iPhone).
 *
 * Gemello di `platform.ts`: stessa interfaccia, motore diverso. Qui SQLite e'
 * `sql.js` (SQLite compilato in WebAssembly) e vive nella memoria della
 * pagina; il file viene reso durevole in IndexedDB dopo ogni transazione
 * confermata.
 *
 * ---------------------------------------------------------------------------
 * LA DIFFERENZA CHE L'INTERFACCIA DEVE RISPETTARE
 *
 * Sul nativo il COMMIT e' la durabilita'. Qui non lo e': fra il COMMIT e la
 * scrittura in IndexedDB c'e' un intervallo in cui il dato esiste solo nella
 * memoria della scheda. Per questo {@link PlatformStorage.flush} **va
 * attesa prima di mostrare una conferma**, e per questo `flush()` rilancia
 * l'errore invece di inghiottirlo: una spunta verde su un dato che non e'
 * stato scritto e' esattamente quello che la specifica (§10) vieta.
 * ---------------------------------------------------------------------------
 *
 * NON VERIFICATO SU DISPOSITIVO: qui non ci sono ne' Safari ne' iOS. Il
 * comportamento di IndexedDB su un iPhone - e la possibilita' che iOS espella
 * i dati di un sito - resta non verificato (vedi `QA_REPORT.md`).
 */

import initSqlJs from 'sql.js';
import type { Device } from '@trackstrong/core';
import {
  IndexedDbUnavailableError,
  openIndexedDbStore,
  requestPersistentStorage,
  SqlJsDriver,
  type SqlJsModule,
} from '@trackstrong/db';

import type { PlatformStorage, StoragePersistence } from './platformStorage';

/**
 * Il modulo WebAssembly viene servito dalla radice del sito.
 *
 * `public/sql-wasm.wasm` e' copiato nell'esportazione web; il service worker
 * lo mette in cache, altrimenti la seconda apertura offline non troverebbe il
 * motore del database e l'app non partirebbe senza rete - cioe' proprio nel
 * caso per cui esiste.
 */
function locateFile(file: string): string {
  return `/${file}`;
}

export async function openPlatformStorage(databaseName: string): Promise<PlatformStorage> {
  const factory = globalThis.indexedDB;
  if (factory === undefined) {
    // Non si prosegue tenendo i dati solo in memoria: sarebbero perduti alla
    // chiusura della pagina, e l'utente avrebbe registrato un allenamento che
    // non esiste.
    throw new IndexedDbUnavailableError(
      new Error("`indexedDB` non e' presente in questo contesto."),
    );
  }

  const store = await openIndexedDbStore({ factory });
  const existing = await store.load(databaseName);

  const module = (await initSqlJs({ locateFile })) as unknown as SqlJsModule;

  let lastPersistError: unknown = null;
  const driver = new SqlJsDriver({
    module,
    store,
    key: databaseName,
    initialBytes: existing,
    onPersistError: (error) => {
      lastPersistError = error;
    },
  });

  // Richiesta, non garanzia: l'esito viene mostrato nelle impostazioni perche'
  // un "negato" cambia cosa l'utente dovrebbe fare (installare l'app dalla
  // schermata Home, e tenere attivo il backup).
  const verdict = await requestPersistentStorage(globalThis.navigator?.storage);
  const persistence: StoragePersistence = verdict;

  return {
    driver,
    flush: async () => {
      await driver.flush();
      // `flush()` azzera il proprio errore quando lo consegna; questa copia
      // serve solo a `hasPendingWrites` e alla diagnostica.
      lastPersistError = null;
    },
    hasPendingWrites: () => driver.hasPendingWrites || lastPersistError !== null,
    storageDescription: describeStorage(persistence),
    persistence,
    ...describeDevice(),
    close: () => {
      driver.close();
      store.close();
    },
  };
}

/**
 * Etichetta e piattaforma di questa installazione.
 *
 * Serve solo all'elenco dei dispositivi: la sincronizzazione distingue le
 * installazioni per `deviceId`, non per piattaforma. Quando la stringa
 * dell'agente non dice niente di riconoscibile si scrive `'other'` invece di
 * indovinare `'ios'`: un'etichetta sbagliata nell'elenco e' piu' confusa di
 * un'etichetta generica.
 */
function describeDevice(): {
  readonly deviceLabel: string;
  readonly devicePlatform: Device['platform'];
} {
  const agent = globalThis.navigator?.userAgent ?? '';
  if (/iPad/i.test(agent)) {
    return { deviceLabel: 'Questo iPad (app web)', devicePlatform: 'ipados' };
  }
  if (/iPhone|iPod/i.test(agent)) {
    return { deviceLabel: 'Questo iPhone (app web)', devicePlatform: 'ios' };
  }
  if (/Android/i.test(agent)) {
    return { deviceLabel: 'Questo telefono (app web)', devicePlatform: 'android' };
  }
  return { deviceLabel: 'Questo browser', devicePlatform: 'other' };
}

function describeStorage(persistence: StoragePersistence): string {
  const base =
    "I dati sono in un database SQLite conservato nell'archivio di questo " +
    'browser (IndexedDB). Non escono da qui se non attraverso la ' +
    'sincronizzazione con il tuo Google Drive o un backup che esporti tu.';
  switch (persistence.kind) {
    case 'granted':
      return `${base} Il browser ha accettato di non cancellarli per liberare spazio.`;
    case 'denied':
      return (
        `${base} Il browser NON ha garantito di conservarli: puo' cancellarli per ` +
        'liberare spazio. Aggiungi l\'app alla schermata Home ed esporta un ' +
        'backup regolarmente.'
      );
    case 'unsupported':
      return (
        `${base} Questo browser non permette di chiedere una conservazione ` +
        "garantita, quindi non c'e' modo di sapere se cancellera' i dati per " +
        'liberare spazio. Esporta un backup regolarmente.'
      );
    case 'fileSystem':
      return base;
  }
}
