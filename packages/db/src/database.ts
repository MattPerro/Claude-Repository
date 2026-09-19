/**
 * Il "database" di TrackStrong: un driver SQL piu' il contesto che serve per
 * scrivere (chi sta scrivendo, in quale archivio, con quale orologio).
 *
 * Tutti i repository ricevono questo oggetto e non il driver nudo: cosi'
 * `origin_device_id`, `workspace_id` e i timestamp non possono essere
 * dimenticati o inventati riga per riga.
 */

import { createIdGenerator, systemClock, type Clock, type IdGenerator } from '@trackstrong/core';

import type { SqlDriver } from './driver.js';
import {
  CURRENT_SCHEMA_VERSION,
  META_PROTOCOL_VERSION,
  migrate,
  readMeta,
  readSchemaVersion,
  SchemaTooNewError,
  SUPPORTED_PROTOCOL_VERSION,
} from './migrate.js';
import { OPERATION_FORMAT_VERSION } from './operations.js';

export interface DatabaseConfig {
  readonly workspaceId: string;
  /** Identificativo stabile di questa installazione. */
  readonly deviceId: string;
  readonly clock?: Clock;
  readonly ids?: IdGenerator;
  readonly operationFormatVersion?: number;
}

export interface Database {
  readonly driver: SqlDriver;
  readonly workspaceId: string;
  readonly deviceId: string;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly operationFormatVersion: number;
  /** Versione di schema effettivamente presente nel file. */
  readonly schemaVersion: number;
  /**
   * Motivo per cui la SOLA sincronizzazione e' bloccata, `null` se non lo e'.
   * Popolato quando il file e' piu' recente del codice: i dati restano
   * leggibili e scrivibili in locale (§14).
   */
  readonly syncBlockedReason: string | null;
  close(): void;
}

/**
 * Apre il database, applica le migrazioni mancanti e restituisce il contesto
 * di scrittura.
 *
 * @throws {SchemaTooNewError} se l'archivio e' piu' recente del codice.
 *   Per il comportamento richiesto dalla specifica (mostrare i dati e
 *   bloccare solo la sincronizzazione) usa {@link openDatabaseTolerant}.
 */
export function openDatabase(driver: SqlDriver, config: DatabaseConfig): Database {
  migrate(driver);
  return buildDatabase(driver, config, null);
}

export interface TolerantOpenResult {
  readonly db: Database;
  /**
   * Non nullo se l'archivio e' piu' recente del codice. In quel caso
   * nessuna migrazione e' stata applicata e nessun dato e' stato toccato.
   */
  readonly schemaTooNew: SchemaTooNewError | null;
}

/**
 * Apre il database senza lanciare se lo schema e' troppo recente.
 *
 * E' la forma che usa l'app all'avvio: §14 chiede di preservare i dati
 * locali e bloccare la sola sincronizzazione incompatibile, non di
 * rifiutarsi di partire. Il chiamante controlla `schemaTooNew` (oppure
 * `db.syncBlockedReason`) e disattiva la sincronizzazione.
 */
export function openDatabaseTolerant(
  driver: SqlDriver,
  config: DatabaseConfig,
): TolerantOpenResult {
  try {
    migrate(driver);
    return { db: buildDatabase(driver, config, null), schemaTooNew: null };
  } catch (error) {
    if (error instanceof SchemaTooNewError) {
      return { db: buildDatabase(driver, config, error), schemaTooNew: error };
    }
    throw error;
  }
}

function buildDatabase(
  driver: SqlDriver,
  config: DatabaseConfig,
  tooNew: SchemaTooNewError | null,
): Database {
  const clock = config.clock ?? systemClock();
  const ids = config.ids ?? createIdGenerator(() => clock.now());
  const schemaVersion = readSchemaVersion(driver);

  let blocked: string | null = tooNew === null ? null : tooNew.message;
  if (blocked === null) {
    const protocol = readMeta(driver, META_PROTOCOL_VERSION);
    if (protocol !== null) {
      const found = Number.parseInt(protocol, 10);
      if (Number.isInteger(found) && found > SUPPORTED_PROTOCOL_VERSION) {
        blocked =
          `L'archivio usa il protocollo di sincronizzazione ${String(found)}, ` +
          `questa app supporta il ${String(SUPPORTED_PROTOCOL_VERSION)}. ` +
          'I dati locali restano utilizzabili; la sincronizzazione e\' sospesa.';
      }
    }
  }

  return {
    driver,
    workspaceId: config.workspaceId,
    deviceId: config.deviceId,
    clock,
    ids,
    operationFormatVersion: config.operationFormatVersion ?? OPERATION_FORMAT_VERSION,
    schemaVersion,
    syncBlockedReason: blocked,
    close: () => {
      driver.close();
    },
  };
}

/** Versione di schema attesa da questo codice. Esportata per la diagnostica. */
export const EXPECTED_SCHEMA_VERSION = CURRENT_SCHEMA_VERSION;
