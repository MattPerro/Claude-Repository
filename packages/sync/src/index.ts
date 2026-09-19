/**
 * `@trackstrong/sync` - protocollo di sincronizzazione bidirezionale su
 * Google Drive (`appDataFolder`).
 *
 * TypeScript puro: nessun import da React Native, da Expo o da `node:fs`.
 * Tutto l'I/O passa da porte iniettabili ({@link DriveStore},
 * {@link SyncStateStore}, {@link Sleeper}), quindi il protocollo e'
 * interamente eseguibile e verificabile su Node. E' una scelta deliberata: la
 * sincronizzazione e' la parte in cui un errore silenzioso perde dati
 * dell'utente, e deve poter essere provata senza un simulatore e senza un
 * account Google.
 *
 * ## Mappa
 *
 *  - `operation.ts` - il registro delle operazioni: fatti immutabili,
 *    applicabili una sola volta, con revisione di base e informazioni causali.
 *  - `bundle.ts` - pacchetti immutabili, serializzazione e **rifiuto** dei
 *    pacchetti malformati, corrotti o di un protocollo piu' recente.
 *  - `snapshot.ts` - copie coerenti periodiche per velocizzare il recupero.
 *  - `drive.ts` - la porta verso Drive e gli **errori tipizzati**, perche' un
 *    errore non e' mai "archivio vuoto".
 *  - `conflict.ts` - le regole di conflitto della specifica §8.2.
 *  - `state.ts` - la porta di persistenza, con l'applicazione **atomica** di
 *    dati e cursore.
 *  - `retry.ts` - attese progressive con jitter dietro una porta iniettabile.
 *  - `protocol.ts` - il motore: `push`, `pull`, `bootstrap`, `syncOnce`.
 *
 * ## Cosa NON e' verificato
 *
 * I test di questo pacchetto girano contro un finto in memoria. Il
 * comportamento dei server reali di Google - upload ripristinabili, tempi e
 * ordine effettivi di `changes.list`, codici di errore reali, OAuth - **non e'
 * verificato**. Vedi l'avvertenza in `src/testing/inMemoryDrive.ts`.
 */

export * from './operation.js';
export * from './digest.js';
export * from './bundle.js';
export * from './snapshot.js';
export * from './drive.js';
export * from './retry.js';
export * from './conflict.js';
export * from './state.js';
export * from './protocol.js';
