/**
 * Archivio locale sul DISPOSITIVO (iOS/Android nativo).
 *
 * C'e' un gemello `platform.web.ts` per la PWA. Metro sceglie il file in base
 * alla piattaforma, quindi `StoreProvider` non contiene nessun `if (web)`: la
 * differenza fra i due mondi sta interamente qui dentro, ed e' esattamente
 * questa la ragione per cui la stessa app puo' girare in due modi senza due
 * copie delle schermate.
 *
 * Sul nativo `expo-sqlite` scrive su file: dopo il COMMIT il dato e' durevole
 * e non c'e' niente da attendere. `flush()` esiste comunque perche' la PWA ne
 * ha bisogno, ed e' meglio un no-op esplicito che un ramo condizionale nelle
 * schermate.
 *
 * NON VERIFICATO SU DISPOSITIVO: qui non ci sono ne' simulatore iOS ne'
 * `expo-sqlite` nativo.
 */

import { openExpoSqlite } from '@trackstrong/db';

import type { PlatformStorage } from './platformStorage';

export async function openPlatformStorage(databaseName: string): Promise<PlatformStorage> {
  // L'unico punto dell'intero progetto che nomina `expo-sqlite`.
  const sqliteModule = await import('expo-sqlite');
  const driver = openExpoSqlite({ module: sqliteModule, databaseName });

  return {
    driver,
    // Non e' un flush "finto": su un file SQLite il COMMIT **e'** la
    // durabilita'. Non c'e' un secondo passo da attendere.
    flush: async () => undefined,
    hasPendingWrites: () => false,
    storageDescription:
      "I dati sono in un file SQLite nell'area privata dell'app, sul " +
      'dispositivo. Non escono da qui se non attraverso la sincronizzazione ' +
      'con il tuo Google Drive o un backup che esporti tu.',
    persistence: { kind: 'fileSystem' },
    deviceLabel: 'Questo dispositivo',
    devicePlatform: 'ios',
    close: () => {
      driver.close();
    },
  };
}
