/**
 * Attrezzatura di prova del pacchetto `@trackstrong/sync`.
 *
 * Tutto cio' che sta qui e' **finto** e serve a eseguire il protocollo su Node
 * senza rete, senza database e senza attese reali. Non e' codice di
 * produzione, e in particolare {@link InMemoryDriveStore} **non e' una verifica
 * contro i server reali di Google**: vedi l'avvertenza in testa a
 * `inMemoryDrive.ts`.
 */

export { InMemoryDriveBackend, InMemoryDriveStore, type InMemoryDriveOptions } from './inMemoryDrive.js';
export { InMemorySyncStateStore, PersistenceFailure } from './inMemoryState.js';
export { FakeSleeper, fixedRandom } from './fakeSleeper.js';
