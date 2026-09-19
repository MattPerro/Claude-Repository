/**
 * Profilo, impostazioni e archivio personale.
 *
 * I valori dichiarati da Mattia (183 cm, 100 kg iniziali) sono una
 * CONFIGURAZIONE INIZIALE modificabile, non misurazioni datate: la specifica
 * (§15) vieta di trasformare il peso di profilo in una pesata.
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
 * certa per raggiungerlo (specifica §15).
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
  /** Giorni PROPOSTI per le sedute. Proposti, non imposti (specifica §3). */
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
 * (specifica §16).
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
    // Riferimento prudenziale del piano, configurabile (specifica §15).
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
 * Profilo iniziale di Mattia come CONFIGURAZIONE proposta in onboarding.
 *
 * Questi valori vengono mostrati precompilati nella schermata di conferma e
 * sono tutti modificabili. Non finiscono nei dati demo, nei log o nei file
 * pubblicabili (specifica §3): qui ci sono solo i dati che Mattia ha
 * dichiarato nella specifica stessa, e nessuna deduzione (eta', patologie,
 * percentuale di grasso, frequenza cardiaca, carichi iniziali).
 */
export interface OnboardingDefaults {
  readonly displayName: string;
  readonly heightCm: number;
  readonly declaredWeightKg: number;
  readonly bodyGoal: BodyGoal;
  readonly sportGoal: string;
  readonly preferredWeekdays: readonly IsoWeekday[];
  readonly availableMinutesPerSession: number;
  readonly sessionsPerWeek: number;
  readonly context: string;
}

export const ONBOARDING_DEFAULTS: OnboardingDefaults = {
  displayName: 'Mattia',
  heightCm: 183,
  declaredWeightKg: 100,
  bodyGoal: {
    targetKg: 90,
    stretchTargetKg: 85,
    note:
      "90 kg e' l'obiettivo di riferimento migliorando la composizione corporea. " +
      "85 kg e' un riferimento eventuale, non un obbligo, e l'app non indica una data certa.",
  },
  sportGoal:
    'Forza e preparazione atletica generale utili alla guida amatoriale di una moto in pista.',
  // Lunedi' e giovedi': PROPOSTI, non imposti (specifica §3).
  preferredWeekdays: [1, 4],
  availableMinutesPerSession: 70,
  sessionsPerWeek: 2,
  context: 'Rientro dopo circa quattro anni senza allenamento.',
};
