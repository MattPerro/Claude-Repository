/**
 * Profilo, impostazioni e archivio personale.
 *
 * Il peso dichiarato in profilo e' una CONFIGURAZIONE INIZIALE modificabile,
 * non una misurazione datata: la specifica (§13.2) vieta di trasformarlo in
 * una pesata, e quindi non compare nei grafici ne' nella media mobile.
 *
 * Nessun dato personale reale e' scritto in questo file: vedi il commento di
 * `NEUTRAL_ONBOARDING` in fondo.
 */

import type { IsoWeekday, Instant, LocalDate, TimeZone } from '../time.js';

/** Archivio personale sincronizzato. */
export interface Workspace {
  readonly id: string;
  readonly name: string;
  readonly createdAt: Instant;
  /** Account Google a cui l'archivio e' collegato; `null` se solo locale. */
  readonly googleAccountId: string | null;
  /** Email dell'account, mostrata nelle impostazioni. */
  readonly googleAccountEmail: string | null;
  /** Versione del protocollo di sincronizzazione dell'archivio. */
  readonly syncProtocolVersion: number;
}

/** Dispositivo/installazione registrata nell'archivio. */
export interface Device {
  readonly id: string;
  readonly workspaceId: string;
  /** Nome leggibile: "iPhone 15 di Mattia". */
  readonly label: string;
  readonly platform: 'ios' | 'ipados' | 'android' | 'other';
  readonly firstSeenAt: Instant;
  readonly lastSeenAt: Instant;
  /** true se su questo dispositivo si vogliono i promemoria locali. */
  readonly remindersEnabled: boolean;
}

/**
 * Obiettivo corporeo.
 *
 * `targetKg` e' un riferimento, non una promessa: l'app non indica una data
 * certa per raggiungerlo (specifica §13.2).
 */
export interface BodyGoal {
  readonly targetKg: number;
  /** Riferimento ulteriore facoltativo (es. 85 kg). `null` se non impostato. */
  readonly stretchTargetKg: number | null;
  readonly note: string | null;
}

export interface Profile {
  readonly id: string;
  readonly workspaceId: string;
  readonly displayName: string;
  /** Altezza in cm. */
  readonly heightCm: number | null;
  /**
   * Peso DICHIARATO in fase di configurazione, in kg.
   * Non e' una pesata: non compare nei grafici e non entra nella media
   * mobile a 7 giorni.
   */
  readonly declaredWeightKg: number | null;
  readonly bodyGoal: BodyGoal | null;
  /** Obiettivo sportivo, testo libero. */
  readonly sportGoal: string | null;
  /** Data di avvio del percorso. */
  readonly programStartDate: LocalDate;
  /** Giorni PROPOSTI per le sedute. Proposti, non imposti (specifica §2). */
  readonly preferredWeekdays: readonly IsoWeekday[];
  /** Minuti disponibili per seduta, doccia esclusa. */
  readonly availableMinutesPerSession: number;
  /** Sedute a settimana previste. */
  readonly sessionsPerWeek: number;
  /** Limitazioni fisiche e dolori, modificabili in qualsiasi momento. */
  readonly limitations: readonly PhysicalLimitation[];
  /** Note aggiuntive libere. */
  readonly notes: string | null;
  readonly revision: number;
}

export interface PhysicalLimitation {
  readonly id: string;
  /** Zona o descrizione. */
  readonly label: string;
  readonly note: string | null;
  /** Esercizi da evitare o adattare. */
  readonly affectedExerciseIds: readonly string[];
  readonly active: boolean;
  readonly recordedOn: LocalDate;
}

/** Tema dell'interfaccia. */
export type ThemePreference = 'system' | 'light' | 'dark';

export interface AppSettings {
  readonly workspaceId: string;
  readonly timeZone: TimeZone;
  readonly theme: ThemePreference;
  /** Mantiene lo schermo acceso durante la seduta. */
  readonly keepScreenAwakeDuringSession: boolean;
  /** Feedback aptico alla conferma delle serie e alla fine del recupero. */
  readonly hapticsEnabled: boolean;
  /** Notifiche locali di fine recupero. */
  readonly restTimerNotifications: boolean;
  /** Promemoria delle sedute pianificate su QUESTO dispositivo. */
  readonly sessionReminders: boolean;
  /** Ore di riposo consigliate prima di una giornata in pista. */
  readonly hoursBeforeTrackDay: number;
  /** Sincronizzazione automatica con Drive. */
  readonly autoSyncEnabled: boolean;
  /** Minuti minimi fra due sincronizzazioni automatiche durante l'uso. */
  readonly autoSyncMinIntervalMinutes: number;
  /** Cifratura lato client dei pacchetti su Drive. */
  readonly clientEncryptionEnabled: boolean;
  /** Le foto di progresso vengono sincronizzate solo se esplicitamente attivo. */
  readonly syncProgressPhotos: boolean;
  /** Coach generativo esterno: disattivato per impostazione predefinita. */
  readonly generativeCoachEnabled: boolean;
  /** Giorni fra due promemoria di backup. */
  readonly backupReminderDays: number;
  /** Ora dei promemoria giornalieri, "HH:MM" locale. */
  readonly reminderTimeOfDay: string;
}

/**
 * Impostazioni predefinite.
 *
 * Tutti i valori sensibili alla privacy partono DISATTIVATI: nessuna
 * telemetria, nessun coach esterno, nessuna sincronizzazione di foto
 * (specifica §14).
 */
export function defaultSettings(workspaceId: string, timeZone: TimeZone): AppSettings {
  return {
    workspaceId,
    timeZone,
    theme: 'system',
    keepScreenAwakeDuringSession: true,
    hapticsEnabled: true,
    restTimerNotifications: true,
    sessionReminders: true,
    // Riferimento prudenziale del piano, configurabile (specifica §13.4).
    hoursBeforeTrackDay: 72,
    autoSyncEnabled: true,
    autoSyncMinIntervalMinutes: 15,
    clientEncryptionEnabled: false,
    syncProgressPhotos: false,
    generativeCoachEnabled: false,
    backupReminderDays: 14,
    reminderTimeOfDay: '18:00',
  };
}

/**
 * Valori proposti in onboarding.
 *
 * ---------------------------------------------------------------------------
 * QUI NON CI SONO DATI PERSONALI, ED E' DELIBERATO.
 *
 * La specifica (§2) chiede di usare i dati dichiarati da Mattia per una
 * configurazione iniziale locale modificabile, e nello stesso punto vieta di
 * inserirli "nei dati demo, nei log o nei file pubblicabili", chiedendo che
 * gli eventuali file di bootstrap personale restino esclusi da Git.
 *
 * Questo file e' tracciato in un repository: e' un file pubblicabile. Quindi
 * altezza, peso e nome NON stanno qui. Ci stanno il TIPO e i valori neutri.
 *
 * I dati reali arrivano da una delle due strade:
 *
 *  1. **Onboarding** (sempre disponibile): Mattia li inserisce una volta al
 *     primo avvio e finiscono nel database locale, che non e' in Git.
 *  2. **Bootstrap locale** (comodita' opzionale): un file
 *     `apps/mobile/src/bootstrap.local.ts`, escluso da Git tramite
 *     `.gitignore`, che precompila l'onboarding. Il modello da copiare e'
 *     `apps/mobile/src/bootstrap.local.example.ts`.
 *
 * In entrambi i casi i valori restano modificabili in qualsiasi momento.
 * ---------------------------------------------------------------------------
 */
export interface OnboardingDefaults {
  readonly displayName: string;
  readonly heightCm: number | null;
  readonly declaredWeightKg: number | null;
  readonly bodyGoal: BodyGoal | null;
  readonly sportGoal: string | null;
  readonly preferredWeekdays: readonly IsoWeekday[];
  readonly availableMinutesPerSession: number;
  readonly sessionsPerWeek: number;
  readonly context: string | null;
}

/**
 * Onboarding neutro: nessun dato personale, solo le impostazioni strutturali
 * del progetto (due sedute a settimana, 70 minuti, lunedi' e giovedi'
 * PROPOSTI e non imposti).
 *
 * I campi lasciati a `null` compaiono vuoti nella schermata di onboarding.
 */
export const NEUTRAL_ONBOARDING: OnboardingDefaults = {
  displayName: '',
  heightCm: null,
  declaredWeightKg: null,
  bodyGoal: null,
  sportGoal: null,
  // Proposti, non imposti (specifica §2).
  preferredWeekdays: [1, 4],
  availableMinutesPerSession: 70,
  sessionsPerWeek: 2,
  context: null,
};

/**
 * Unisce un eventuale bootstrap locale ai valori neutri.
 *
 * Se il file locale non esiste (il caso normale per chiunque cloni il
 * repository) l'onboarding parte vuoto e non si rompe niente.
 */
export function resolveOnboardingDefaults(
  local: Partial<OnboardingDefaults> | null | undefined,
): OnboardingDefaults {
  if (local === null || local === undefined) return NEUTRAL_ONBOARDING;
  return { ...NEUTRAL_ONBOARDING, ...local };
}
