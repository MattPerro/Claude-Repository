/**
 * `@trackstrong/db` - persistenza locale di TrackStrong.
 *
 * Offline-first assoluto: tutto quello che sta qui funziona senza rete, e
 * nessun percorso di salvataggio attende la rete (§7). La sincronizzazione
 * legge la coda che questo pacchetto riempie; non la governa.
 *
 * Tre punti di ingresso:
 *  - un driver (`openNodeSqlite` nei test, `openExpoSqlite` sul dispositivo);
 *  - `openDatabase` / `openDatabaseTolerant`, che applicano le migrazioni;
 *  - i repository, che parlano i tipi di `@trackstrong/core`.
 */

export * from './driver.js';
export * from './drivers/expoSqlite.js';

// Il driver `sql.js` (browser/PWA) e' riesportato da qui perche', al contrario
// di quello Node, non importa nulla: il modulo WebAssembly gli viene passato
// dall'esterno. Importarlo non trascina quindi alcuna dipendenza nel bundle di
// chi non lo usa.
export * from './drivers/sqlJs.js';
export * from './drivers/indexedDbStore.js';

// `./drivers/nodeSqlite.js` NON e' riesportato da qui, deliberatamente.
//
// Importa `node:sqlite`, che Metro non sa risolvere: qualunque import di
// `@trackstrong/db` dall'app Expo trascinava quel modulo e il bundle non si
// costruiva. E' un difetto che nessun test poteva cogliere, perche' su Node
// `node:sqlite` esiste.
//
// Il driver Node vive quindi in un punto d'ingresso separato, come fa
// `@trackstrong/sync` con `src/testing/`:
//
//     import { openNodeSqlite } from '@trackstrong/db/node';
//
// L'app importa solo `@trackstrong/db`, che resta privo di moduli Node.

export * from './json.js';
export * from './migrate.js';
export * from './database.js';
export * from './operations.js';
export * from './unitOfWork.js';
export * from './rows.js';

export { MIGRATION_001_SQL } from './schema/migration001.js';
export { MIGRATION_002_SQL } from './schema/migration002.js';

export * from './repositories/workspaceRepository.js';
export * from './repositories/sessionRepository.js';
export * from './repositories/setRepository.js';
export * from './repositories/programRepository.js';
export * from './repositories/measurementRepository.js';
export * from './repositories/timerRepository.js';
export * from './repositories/proposalRepository.js';
export * from './repositories/syncRepository.js';
export * from './repositories/backupRepository.js';

import type { Database } from './database.js';
import { createBackupRepository, type BackupRepository } from './repositories/backupRepository.js';
import {
  createMeasurementRepository,
  type MeasurementRepository,
} from './repositories/measurementRepository.js';
import {
  createProgramRepository,
  type ProgramRepository,
} from './repositories/programRepository.js';
import {
  createProposalRepository,
  type ProposalRepository,
} from './repositories/proposalRepository.js';
import {
  createSessionRepository,
  type SessionRepository,
} from './repositories/sessionRepository.js';
import { createSetRepository, type SetRepository } from './repositories/setRepository.js';
import { createSyncRepository, type SyncRepository } from './repositories/syncRepository.js';
import { createTimerRepository, type TimerRepository } from './repositories/timerRepository.js';
import {
  createWorkspaceRepository,
  type WorkspaceRepository,
} from './repositories/workspaceRepository.js';

/** Tutti i repository costruiti su uno stesso database. */
export interface Repositories {
  readonly workspace: WorkspaceRepository;
  readonly sessions: SessionRepository;
  readonly sets: SetRepository;
  readonly program: ProgramRepository;
  readonly measurements: MeasurementRepository;
  readonly timers: TimerRepository;
  readonly proposals: ProposalRepository;
  readonly sync: SyncRepository;
  readonly backup: BackupRepository;
}

export function createRepositories(db: Database): Repositories {
  return {
    workspace: createWorkspaceRepository(db),
    sessions: createSessionRepository(db),
    sets: createSetRepository(db),
    program: createProgramRepository(db),
    measurements: createMeasurementRepository(db),
    timers: createTimerRepository(db),
    proposals: createProposalRepository(db),
    sync: createSyncRepository(db),
    backup: createBackupRepository(db),
  };
}
