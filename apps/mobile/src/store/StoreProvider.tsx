/**
 * Apertura del database, identita' dell'installazione, stato condiviso.
 *
 * Ordine di avvio, e il motivo di ciascun passo:
 *
 *  1. **identita'** (portachiavi sul dispositivo, `localStorage` nella PWA):
 *     `openDatabaseTolerant` vuole `workspaceId` e `deviceId` nella
 *     configurazione, quindi devono esistere prima del database;
 *  2. **archivio della piattaforma** (`openPlatformStorage`): `expo-sqlite` sul
 *     dispositivo, `sql.js` su IndexedDB nella PWA. Questo modulo non sa quale
 *     dei due sta usando, ed e' per questo che le stesse schermate girano in
 *     entrambi i modi;
 *  3. **apertura tollerante**: se lo schema dell'archivio e' piu' recente del
 *     codice non si rifiuta di partire. I dati locali restano leggibili e
 *     scrivibili e si blocca **solo** la sincronizzazione (§14,
 *     `db.syncBlockedReason`);
 *  4. **archivio e dispositivo** registrati (idempotenti);
 *  5. **fase di avvio**: manca il profilo o il piano -> onboarding; altrimenti
 *     pronto.
 *
 * Nessun passo attende la rete.
 *
 * NON VERIFICATO SU DISPOSITIVO: qui non ci sono ne' simulatore iOS ne'
 * `expo-sqlite` nativo. I passi 2-5 non sono mai stati eseguiti.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import {
  buildThreeYearPlan,
  defaultSettings,
  EXERCISE_LIBRARY,
  instantToLocalDate,
  systemClock,
  type AppSettings,
  type Clock,
  type EquipmentInstance,
  type ExerciseLibrary,
  type IdGenerator,
  type LocalDate,
  type Profile,
  type ProgramCursor,
  type TimeZone,
  type Workspace,
} from '@trackstrong/core';
import {
  createRepositories,
  openDatabaseTolerant,
  StorageQuotaExceededError,
  SUPPORTED_PROTOCOL_VERSION,
  type Database,
  type Repositories,
  type SaveProfileInput,
  type StoredPlan,
} from '@trackstrong/db';
import type { DriveStore } from '@trackstrong/sync';

import { createUnauthenticatedDriveStore } from '../lib/driveStore';
import { createAppIdGenerator, IdentityUnavailableError, loadIdentity } from './identity';
import { openPlatformStorage } from './platform';
import type { PlatformStorage, StoragePersistence } from './platformStorage';
import {
  attemptSync,
  INITIAL_SYNC_SNAPSHOT,
  readSyncSnapshot,
  type SyncMoment,
  type SyncSnapshot,
} from './syncState';

const DATABASE_NAME = 'trackstrong.db';

/**
 * Stato della scrittura durevole dell'ultima modifica.
 *
 * Esiste perche' nella PWA il COMMIT non e' la durabilita': fra il COMMIT e la
 * scrittura in IndexedDB c'e' un intervallo in cui il dato vive solo nella
 * memoria della scheda. Una spunta di conferma mostrata in quell'intervallo
 * sarebbe una conferma per un dato che puo' ancora svanire, e la specifica
 * (§10) vieta esattamente questo.
 *
 * Sul dispositivo nativo lo stato e' sempre `durable`, perche' su un file
 * SQLite il COMMIT **e'** la durabilita'. Le schermate non devono distinguere
 * i due casi: leggono questo stato e si comportano uguale.
 */
export type DurabilityState =
  /** Niente in attesa: quello che si vede e' scritto. */
  | { readonly kind: 'durable' }
  /** Scrittura in corso. La conferma va attesa, non anticipata. */
  | { readonly kind: 'saving' }
  /** Scrittura NON riuscita. Va detto, non nascosto. */
  | { readonly kind: 'failed'; readonly message: string };

/** Tutto quello che le schermate possono usare quando l'app e' pronta. */
export interface StoreCore {
  readonly db: Database;
  readonly repos: Repositories;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly deviceId: string;
  readonly workspaceId: string;
  readonly drive: DriveStore;
  readonly library: ExerciseLibrary;

  readonly workspace: Workspace | null;
  readonly settings: AppSettings;
  readonly profile: Profile | null;
  readonly plan: StoredPlan | null;
  readonly cursor: ProgramCursor | null;
  readonly equipment: readonly EquipmentInstance[];
  readonly sync: SyncSnapshot;
  readonly timeZone: TimeZone;
  readonly today: LocalDate;

  /**
   * Rilegge dal database e avvia la scrittura durevole.
   *
   * Da chiamare dopo ogni scrittura. Non attende: l'esito compare in
   * {@link StoreCore.durability}, cosi' una schermata che non ha bisogno di
   * bloccarsi non si blocca, e una che deve confermare qualcosa aspetta
   * {@link StoreCore.flushNow}.
   */
  reload(): void;
  /**
   * Attende che le modifiche siano durevoli, e **rilancia** se non lo sono.
   *
   * Da attendere prima di mostrare una conferma all'utente.
   */
  flushNow(): Promise<void>;
  /** Stato della scrittura durevole. */
  readonly durability: DurabilityState;
  /** Dove vivono i dati, per la schermata impostazioni. */
  readonly storageDescription: string;
  /** Quanto e' protetto l'archivio dalla cancellazione. */
  readonly storagePersistence: StoragePersistence;
  saveSettings(patch: Partial<AppSettings>): void;
  /** Crea archivio, profilo, piano e cursore. Idempotente sul workspace. */
  completeOnboarding(input: SaveProfileInput): void;
  requestSync(moment: SyncMoment): void;
  /** Contatore che cambia a ogni `reload()`: utile nelle dipendenze di `useMemo`. */
  readonly version: number;
}

export type StoreStatus = 'opening' | 'failed' | 'needsOnboarding' | 'ready';

interface StoreContextValue {
  readonly status: StoreStatus;
  readonly error: string | null;
  readonly core: StoreCore | null;
  retry(): void;
}

const StoreContext = createContext<StoreContextValue | null>(null);

interface OpenedDatabase {
  readonly db: Database;
  readonly repos: Repositories;
  readonly deviceId: string;
  readonly workspaceId: string;
  readonly storage: PlatformStorage;
}

async function openEverything(clock: Clock, ids: IdGenerator): Promise<OpenedDatabase> {
  const identity = await loadIdentity(clock);
  const storage = await openPlatformStorage(DATABASE_NAME);

  const { db } = openDatabaseTolerant(storage.driver, {
    workspaceId: identity.workspaceId,
    deviceId: identity.deviceId,
    clock,
    ids,
  });

  const repos = createRepositories(db);
  return {
    db,
    repos,
    deviceId: identity.deviceId,
    workspaceId: identity.workspaceId,
    storage,
  };
}

/** Dati letti dal database e tenuti in memoria per il disegno. */
interface Loaded {
  readonly workspace: Workspace | null;
  readonly settings: AppSettings;
  readonly profile: Profile | null;
  readonly plan: StoredPlan | null;
  readonly cursor: ProgramCursor | null;
  readonly equipment: readonly EquipmentInstance[];
}

function readEquipment(repos: Repositories): readonly EquipmentInstance[] {
  return repos.workspace.equipment().map((row) => ({
    id: row.id,
    label: row.label,
    kind: row.kind as EquipmentInstance['kind'],
    location: null,
    loadStep: { stepKg: row.stepKg, minKg: null, maxKg: null, note: null },
    settingsNote: null,
  }));
}

function readAll(opened: OpenedDatabase, timeZone: TimeZone): Loaded {
  const { repos } = opened;
  return {
    workspace: repos.workspace.workspace(),
    settings: repos.workspace.settings() ?? defaultSettings(opened.workspaceId, timeZone),
    profile: repos.workspace.profile(),
    plan: repos.program.currentPlan(),
    cursor: repos.program.cursor(),
    equipment: readEquipment(repos),
  };
}

export function StoreProvider({
  children,
}: {
  readonly children: React.ReactNode;
}): React.ReactElement {
  const timeZoneRef = useRef<TimeZone>(systemClock().timeZone());
  const clock = useMemo<Clock>(() => {
    const base = systemClock();
    return {
      now: base.now,
      monotonic: base.monotonic,
      // Il fuso segue le impostazioni senza dover riaprire il database.
      timeZone: () => timeZoneRef.current,
    };
  }, []);
  const ids = useMemo(() => createAppIdGenerator(clock), [clock]);
  const drive = useMemo(() => createUnauthenticatedDriveStore(), []);

  const [opened, setOpened] = useState<OpenedDatabase | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sync, setSync] = useState<SyncSnapshot>(INITIAL_SYNC_SNAPSHOT);
  const [version, setVersion] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [durability, setDurability] = useState<DurabilityState>({ kind: 'durable' });

  // ---------------------------------------------------------------- apertura
  useEffect(() => {
    let cancelled = false;
    setError(null);
    void openEverything(clock, ids)
      .then((result) => {
        if (cancelled) {
          result.storage.close();
          return;
        }
        result.repos.workspace.ensureWorkspace(
          'Archivio personale',
          clock.now(),
          SUPPORTED_PROTOCOL_VERSION,
        );
        result.repos.workspace.registerDevice(
          result.storage.deviceLabel,
          result.storage.devicePlatform,
          clock.now(),
        );
        if (result.repos.sync.state() === null) {
          result.repos.sync.initState(SUPPORTED_PROTOCOL_VERSION);
        }
        const first = readAll(result, timeZoneRef.current);
        timeZoneRef.current = first.settings.timeZone;
        setOpened(result);
        setLoaded(first);
        setSync(readSyncSnapshot(result.db, result.repos, INITIAL_SYNC_SNAPSHOT));
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(describeBootFailure(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [clock, ids, attempt]);

  // ------------------------------------------------------------------ azioni
  const flushNow = useCallback(async () => {
    if (opened === null) return;
    const { storage } = opened;
    if (!storage.hasPendingWrites()) {
      setDurability({ kind: 'durable' });
      return;
    }
    setDurability({ kind: 'saving' });
    try {
      await storage.flush();
      setDurability({ kind: 'durable' });
    } catch (cause) {
      // Lo stato diventa `failed` E l'errore viene rilanciato: chi attendeva
      // per mostrare una conferma non deve mostrarla, e chi non attendeva
      // deve comunque vedere il banner.
      setDurability({ kind: 'failed', message: describePersistFailure(cause) });
      throw cause;
    }
  }, [opened]);

  const reload = useCallback(() => {
    if (opened === null) return;
    const next = readAll(opened, timeZoneRef.current);
    timeZoneRef.current = next.settings.timeZone;
    setLoaded(next);
    setSync((previous) => readSyncSnapshot(opened.db, opened.repos, previous));
    setVersion((n) => n + 1);
    // L'errore e' gia' riportato in `durability`: qui si ignora il rifiuto
    // della promessa, non il fallimento.
    void flushNow().catch(() => undefined);
  }, [opened, flushNow]);

  const requestSync = useCallback(
    (moment: SyncMoment) => {
      if (opened === null) return;
      // Non si attende: la registrazione non dipende mai da questo.
      void attemptSync(opened.db, opened.repos, drive, moment).then((snapshot) => {
        setSync(snapshot);
      });
    },
    [opened, drive],
  );

  const saveSettings = useCallback(
    (patch: Partial<AppSettings>) => {
      if (opened === null || loaded === null) return;
      const next: AppSettings = { ...loaded.settings, ...patch };
      opened.repos.workspace.saveSettings(next);
      timeZoneRef.current = next.timeZone;
      reload();
    },
    [opened, loaded, reload],
  );

  const completeOnboarding = useCallback(
    (input: SaveProfileInput) => {
      if (opened === null) return;
      const { repos } = opened;
      repos.workspace.saveProfile(input);
      if (repos.workspace.settings() === null) {
        repos.workspace.saveSettings(
          defaultSettings(opened.workspaceId, timeZoneRef.current),
        );
      }
      if (repos.program.currentPlan() === null) {
        const plan = buildThreeYearPlan({
          id: ids.newId(),
          startDate: input.programStartDate,
        });
        const stored = repos.program.savePlan(plan);
        repos.program.initCursor(stored.version, input.programStartDate);
      } else if (repos.program.cursor() === null) {
        const current = repos.program.currentPlan();
        if (current !== null) {
          repos.program.initCursor(current.version, input.programStartDate);
        }
      }
      reload();
      requestSync('comando-manuale');
    },
    [opened, ids, reload, requestSync],
  );

  // ------------------------------------------------- ritorno in primo piano
  useEffect(() => {
    if (opened === null) return undefined;
    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next !== 'active') return;
      // 1. i timer scaduti risultano terminati. Nessuna serie viene
      //    completata automaticamente: `reconcile` non tocca le serie (§11).
      opened.repos.timers.reconcile(opened.db.clock.now());
      // 2. si rilegge e si tenta la sincronizzazione (§8.4).
      const next2 = readAll(opened, timeZoneRef.current);
      setLoaded(next2);
      setVersion((n) => n + 1);
      void attemptSync(opened.db, opened.repos, drive, 'primo-piano').then(setSync);
    });
    return () => {
      subscription.remove();
    };
  }, [opened, drive]);

  // Sincronizzazione all'apertura, una volta sola.
  const openedSyncDone = useRef(false);
  useEffect(() => {
    if (opened === null || openedSyncDone.current) return;
    openedSyncDone.current = true;
    void attemptSync(opened.db, opened.repos, drive, 'apertura').then(setSync);
  }, [opened, drive]);

  const value = useMemo<StoreContextValue>(() => {
    if (error !== null) {
      return { status: 'failed', error, core: null, retry: () => setAttempt((n) => n + 1) };
    }
    if (opened === null || loaded === null) {
      return { status: 'opening', error: null, core: null, retry: () => setAttempt((n) => n + 1) };
    }
    const core: StoreCore = {
      db: opened.db,
      repos: opened.repos,
      ids,
      clock,
      deviceId: opened.deviceId,
      workspaceId: opened.workspaceId,
      drive,
      library: EXERCISE_LIBRARY,
      workspace: loaded.workspace,
      settings: loaded.settings,
      profile: loaded.profile,
      plan: loaded.plan,
      cursor: loaded.cursor,
      equipment: loaded.equipment,
      sync,
      timeZone: loaded.settings.timeZone,
      today: instantToLocalDate(clock.now(), loaded.settings.timeZone),
      reload,
      flushNow,
      durability,
      storageDescription: opened.storage.storageDescription,
      storagePersistence: opened.storage.persistence,
      saveSettings,
      completeOnboarding,
      requestSync,
      version,
    };
    const ready = loaded.profile !== null && loaded.plan !== null && loaded.cursor !== null;
    return {
      status: ready ? 'ready' : 'needsOnboarding',
      error: null,
      core,
      retry: () => setAttempt((n) => n + 1),
    };
  }, [
    error,
    opened,
    loaded,
    sync,
    version,
    ids,
    clock,
    drive,
    reload,
    flushNow,
    durability,
    saveSettings,
    completeOnboarding,
    requestSync,
  ]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

/**
 * Messaggio per una scrittura durevole non riuscita.
 *
 * Deve dire **che cosa fare**, non solo che qualcosa e' andato storto: una
 * quota esaurita e un archivio inaccessibile richiedono due azioni diverse, e
 * "errore di salvataggio" non ne suggerisce nessuna. In nessun caso si dice
 * che il dato e' salvato.
 */
function describePersistFailure(cause: unknown): string {
  if (cause instanceof StorageQuotaExceededError) return cause.message;
  if (cause instanceof Error) {
    return (
      `Il salvataggio NON e' riuscito: ${cause.message} ` +
      'Quello che hai appena registrato non e ancora al sicuro. Non chiudere ' +
      "l'app: riprova, oppure esporta un backup dalle impostazioni."
    );
  }
  return (
    "Il salvataggio NON e' riuscito, per un motivo non identificato. Quello " +
    'che hai appena registrato non e ancora al sicuro. Riprova, oppure ' +
    'esporta un backup dalle impostazioni.'
  );
}

function describeBootFailure(cause: unknown): string {
  if (cause instanceof IdentityUnavailableError) return cause.message;
  if (cause instanceof Error) {
    return `Apertura del database non riuscita: ${cause.message}`;
  }
  return 'Apertura del database non riuscita per un motivo non identificato.';
}

/** Stato di avvio, disponibile anche prima che il database sia pronto. */
export function useStoreStatus(): StoreContextValue {
  const context = useContext(StoreContext);
  if (context === null) {
    throw new Error('useStoreStatus() richiede <StoreProvider> piu in alto nell albero.');
  }
  return context;
}

/**
 * Store pronto all'uso.
 *
 * Lancia se il database non e' aperto: e' preferibile a restituire un oggetto
 * finto, perche' una schermata che legge da uno store finto mostra numeri che
 * non esistono.
 */
export function useStore(): StoreCore {
  const context = useStoreStatus();
  if (context.core === null) {
    throw new Error(
      'useStore() usato prima che il database fosse aperto. ' +
        'Le schermate dentro (tabs) sono montate solo quando lo stato e pronto.',
    );
  }
  return context.core;
}
