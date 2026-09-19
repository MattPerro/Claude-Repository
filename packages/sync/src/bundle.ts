/**
 * Pacchetti immutabili di operazioni (specifica §8.1).
 *
 * Su Drive non si carica mai un database intero con "vince l'ultimo
 * caricamento", e non si crea un file per ogni singola operazione: le
 * operazioni viaggiano **raggruppate** in pacchetti immutabili. Un pacchetto,
 * una volta caricato, non viene mai riscritto: si aggiunge, non si sovrascrive.
 *
 * ## Perche' il nome del file NON e' la garanzia di unicita'
 *
 * Il nome remoto e' deterministico solo per rendere leggibile l'archivio e per
 * poter filtrare i file con un prefisso. NON e' il meccanismo
 * anti-duplicazione, per tre motivi verificati sull'API reale:
 *
 *  1. In Drive il nome di un file **non e' unico dentro una cartella**: la
 *     documentazione del campo `name` di `files` dice esplicitamente "The name
 *     of the file. This isn't necessarily unique within a folder."
 *     Due `files.create` con lo stesso `name` producono due file distinti con
 *     due `id` diversi.
 *  2. La chiave di identita' e' l'`id` assegnato da Drive, non il nome.
 *  3. Anche a nome uguale, la de-duplicazione **logica** deve valere fra
 *     dispositivi diversi e attraverso un ripristino: l'unica cosa su cui si
 *     puo' contare e' un identificativo generato sul dispositivo.
 *
 * Quindi la de-duplicazione avviene su:
 *  - `bundleId` (ULID del pacchetto), replicato anche in `appProperties` del
 *    file remoto, cosi' si puo' cercare un pacchetto gia' caricato prima di
 *    ricaricarlo dopo una risposta di rete persa;
 *  - `SyncOperation.id` di ogni operazione contenuta, che rende
 *    l'applicazione idempotente anche se lo stesso pacchetto arriva due volte
 *    con due `fileId` diversi.
 *
 * Riferimenti verificati il 2026-09-19 sul documento di discovery ufficiale
 * `drive v3`, revision `20260901`
 * (https://raw.githubusercontent.com/googleapis/google-api-go-client/main/drive/v3/drive-api.json)
 * e su https://developers.google.com/workspace/drive/api/guides/appdata
 * (consultata tramite ricerca: l'accesso diretto a developers.google.com e'
 * bloccato in questo ambiente - vedi i limiti dichiarati nel rapporto).
 */

import type { DeviceId, Instant, WorkspaceId } from '@trackstrong/core';
import { isUlid } from '@trackstrong/core';
import {
  SYNC_FORMAT_VERSION,
  lamportRange,
  validateOperation,
  type LamportRange,
  type SyncOperation,
} from './operation.js';
import { canonicalJson, computeBundleDigest } from './digest.js';

/**
 * Versione del protocollo di sincronizzazione.
 *
 * Un'app che legge un pacchetto con `protocolVersion` superiore a questa lo
 * **rifiuta** e blocca SOLO la sincronizzazione, preservando i dati locali:
 * un'app vecchia non deve corrompere un archivio aggiornato (specifica §14).
 */
export const SYNC_PROTOCOL_VERSION = 1;

/** Prefisso dei nomi dei pacchetti di operazioni in `appDataFolder`. */
export const BUNDLE_NAME_PREFIX = 'ts-ops';

/** Valore di `appProperties.kind` per un pacchetto di operazioni. */
export const BUNDLE_APP_KIND = 'operations';

export interface OperationBundle {
  /** ULID del pacchetto: chiave di de-duplicazione lato push e lato pull. */
  readonly bundleId: string;
  readonly originDeviceId: DeviceId;
  readonly workspaceId: WorkspaceId;
  readonly protocolVersion: number;
  readonly formatVersion: number;
  readonly operationCount: number;
  readonly lamportRange: LamportRange;
  /** Diagnostica e ordinamento di presentazione. Non decide conflitti. */
  readonly createdAt: Instant;
  /**
   * Digest del contenuto. Rileva **corruzione** (troncamento, download
   * interrotto, byte alterati). NON e' una protezione crittografica: non
   * autentica l'autore e non impedisce una manomissione deliberata, perche'
   * chi altera il contenuto puo' ricalcolare il digest. Per l'integrita'
   * contro un avversario servirebbe una firma con chiave, che questo
   * protocollo non implementa (e che la specifica §14 vieta di dichiarare
   * se non implementata e verificata).
   */
  readonly digest: string;
  readonly operations: readonly SyncOperation[];
}

// ---------------------------------------------------------------------------
// Costruzione
// ---------------------------------------------------------------------------

export interface NewBundleInput {
  readonly bundleId: string;
  readonly originDeviceId: DeviceId;
  readonly workspaceId: WorkspaceId;
  readonly operations: readonly SyncOperation[];
  readonly createdAt: Instant;
  readonly protocolVersion?: number;
  readonly formatVersion?: number;
}

export function createBundle(input: NewBundleInput): OperationBundle {
  if (input.operations.length === 0) {
    throw new Error('Un pacchetto vuoto non va caricato: non si crea un file per nulla.');
  }
  const foreign = input.operations.find((op) => op.workspaceId !== input.workspaceId);
  if (foreign !== undefined) {
    throw new Error(
      `Operazione ${foreign.id} appartiene all'archivio ${foreign.workspaceId}, non a ${input.workspaceId}.`,
    );
  }
  const operations = Object.freeze([...input.operations]);
  return Object.freeze({
    bundleId: input.bundleId,
    originDeviceId: input.originDeviceId,
    workspaceId: input.workspaceId,
    protocolVersion: input.protocolVersion ?? SYNC_PROTOCOL_VERSION,
    formatVersion: input.formatVersion ?? SYNC_FORMAT_VERSION,
    operationCount: operations.length,
    lamportRange: lamportRange(operations),
    createdAt: input.createdAt,
    digest: computeBundleDigest(operations),
    operations,
  });
}

/**
 * Nome remoto deterministico.
 *
 * Forma: `ts-ops-<workspaceId>-<lamportMax a 12 cifre>-<bundleId>.json`.
 * Il `lamport` massimo in testa rende l'elenco ordinabile per nome durante un
 * recupero, e il `bundleId` in coda rende il nome *praticamente* distinto.
 * Ma vedi il commento in testa al file: il nome **non** e' la garanzia di
 * unicita'.
 */
export function bundleFileName(bundle: OperationBundle): string {
  const lamport = String(bundle.lamportRange.max).padStart(12, '0');
  return `${BUNDLE_NAME_PREFIX}-${bundle.workspaceId}-${lamport}-${bundle.bundleId}.json`;
}

/**
 * Proprieta' private del file remoto (`appProperties`).
 *
 * `appProperties` e' documentato come "A collection of arbitrary key-value
 * pairs which are private to the requesting app" e si puo' interrogare con
 * `files.list` usando `q=appProperties has { key='bundleId' and value='...' }`.
 * E' questo che permette di verificare "l'ho gia' caricato?" dopo una risposta
 * di rete persa, senza affidarsi al nome.
 * (discovery drive v3 rev. 20260901, verificato il 2026-09-19;
 * sintassi di `q`: https://developers.google.com/workspace/drive/api/guides/search-files)
 */
export function bundleAppProperties(bundle: OperationBundle): Record<string, string> {
  return {
    kind: BUNDLE_APP_KIND,
    bundleId: bundle.bundleId,
    workspaceId: bundle.workspaceId,
    originDeviceId: bundle.originDeviceId,
    protocolVersion: String(bundle.protocolVersion),
    lamportMax: String(bundle.lamportRange.max),
    operationCount: String(bundle.operationCount),
  };
}

export function serializeBundle(bundle: OperationBundle): string {
  return canonicalJson(bundle);
}

// ---------------------------------------------------------------------------
// Parsing e rifiuto
// ---------------------------------------------------------------------------

export type BundleRejectionCode =
  /** Non e' JSON, o e' troncato (download interrotto). */
  | 'json-non-valido'
  /** Campi mancanti o di tipo sbagliato. */
  | 'struttura-non-valida'
  /** `protocolVersion` superiore a quella supportata da questa app. */
  | 'protocollo-troppo-recente'
  /** `formatVersion` dei dati superiore a quella supportata. */
  | 'formato-troppo-recente'
  /** Il digest non corrisponde al contenuto: file corrotto. */
  | 'digest-non-corrispondente'
  /** Il pacchetto appartiene a un altro archivio. */
  | 'archivio-diverso'
  /** Una o piu' operazioni sono malformate. */
  | 'operazione-non-valida'
  /** `operationCount` o `lamportRange` non coerenti col contenuto. */
  | 'metadati-incoerenti';

export interface BundleRejection {
  readonly code: BundleRejectionCode;
  /** Testo italiano mostrabile nella diagnostica. */
  readonly message: string;
  /** `bundleId` se e' stato possibile leggerlo, per la registrazione. */
  readonly bundleId: string | null;
  readonly detail?: string;
  /**
   * File remoto da cui proviene il pacchetto rifiutato.
   *
   * Non lo riempie il parser (che vede solo del testo) ma il motore. Serve a
   * mettere il file in **quarantena** e a **ritentarlo** ai giri successivi:
   * un rifiuto puo' essere transitorio (download interrotto a meta'), e senza
   * questo riferimento il cursore avanzerebbe oltre il cambiamento e il
   * pacchetto non verrebbe mai piu' visto. Sarebbe una perdita silenziosa.
   */
  readonly fileId?: string;
}

export type BundleParseResult =
  | { readonly ok: true; readonly bundle: OperationBundle }
  | { readonly ok: false; readonly rejection: BundleRejection };

export interface ParseBundleOptions {
  /** Se indicato, rifiuta i pacchetti di un altro archivio. */
  readonly workspaceId?: WorkspaceId;
  readonly supportedProtocolVersion?: number;
  readonly supportedFormatVersion?: number;
}

/**
 * Validazione rigorosa.
 *
 * Un pacchetto malformato, corrotto, o con una versione di protocollo
 * superiore a quella supportata viene **rifiutato senza toccare i dati
 * locali**: un file corrotto non deve cancellare lo storico, e un'app vecchia
 * non deve corrompere un archivio aggiornato (specifica §14).
 */
export function parseBundle(text: string, options: ParseBundleOptions = {}): BundleParseResult {
  const maxProtocol = options.supportedProtocolVersion ?? SYNC_PROTOCOL_VERSION;
  const maxFormat = options.supportedFormatVersion ?? SYNC_FORMAT_VERSION;

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (cause) {
    return reject('json-non-valido', 'Pacchetto illeggibile o troncato: non viene applicato.', null, {
      detail: cause instanceof Error ? cause.message : String(cause),
    });
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return reject('struttura-non-valida', "Il pacchetto non e un oggetto JSON.", null);
  }
  const o = raw as Record<string, unknown>;
  const bundleId = typeof o['bundleId'] === 'string' ? o['bundleId'] : null;

  // 1. Versione del protocollo PRIMA di ogni altra cosa: se non sappiamo
  //    leggere il formato, non dobbiamo nemmeno provare a interpretarlo.
  const protocolVersion = o['protocolVersion'];
  if (!Number.isInteger(protocolVersion) || (protocolVersion as number) < 1) {
    return reject('struttura-non-valida', 'Versione del protocollo assente o non valida.', bundleId);
  }
  if ((protocolVersion as number) > maxProtocol) {
    return reject(
      'protocollo-troppo-recente',
      `Questo pacchetto usa la versione ${String(protocolVersion)} del protocollo, ` +
        `questa app ne supporta al massimo la ${String(maxProtocol)}. ` +
        'Aggiorna TrackStrong: i dati locali restano intatti e la sincronizzazione ' +
        'resta bloccata per non corrompere l archivio.',
      bundleId,
    );
  }

  if (bundleId === null || !isUlid(bundleId)) {
    return reject('struttura-non-valida', 'Identificativo del pacchetto assente o non valido.', bundleId);
  }
  for (const key of ['originDeviceId', 'workspaceId', 'digest'] as const) {
    if (typeof o[key] !== 'string' || (o[key] as string).length === 0) {
      return reject('struttura-non-valida', `Campo "${key}" assente o non valido.`, bundleId);
    }
  }
  const formatVersion = o['formatVersion'];
  if (!Number.isInteger(formatVersion) || (formatVersion as number) < 1) {
    return reject('struttura-non-valida', 'Versione del formato assente o non valida.', bundleId);
  }
  if ((formatVersion as number) > maxFormat) {
    return reject(
      'formato-troppo-recente',
      `I dati di questo pacchetto usano il formato ${String(formatVersion)}, ` +
        `questa app ne supporta al massimo il ${String(maxFormat)}. Aggiorna TrackStrong.`,
      bundleId,
    );
  }
  if (typeof o['createdAt'] !== 'number' || !Number.isFinite(o['createdAt'])) {
    return reject('struttura-non-valida', 'Istante di creazione non valido.', bundleId);
  }
  if (!Array.isArray(o['operations'])) {
    return reject('struttura-non-valida', 'Elenco delle operazioni assente.', bundleId);
  }
  const rawOps = o['operations'] as readonly unknown[];
  if (rawOps.length === 0) {
    return reject('struttura-non-valida', 'Pacchetto senza operazioni.', bundleId);
  }

  if (options.workspaceId !== undefined && o['workspaceId'] !== options.workspaceId) {
    return reject(
      'archivio-diverso',
      `Il pacchetto appartiene all archivio ${String(o['workspaceId'])}, non a ${options.workspaceId}.`,
      bundleId,
    );
  }

  // 2. Ogni operazione deve essere valida: un delta malformato applicato a
  //    metà e' peggio di un pacchetto rifiutato.
  const operations: SyncOperation[] = [];
  for (const [index, candidate] of rawOps.entries()) {
    const defects = validateOperation(candidate);
    if (defects.length > 0) {
      return reject(
        'operazione-non-valida',
        `Operazione in posizione ${String(index)} non valida: ${defects[0]?.message ?? ''}`,
        bundleId,
        { detail: defects.map((d) => `${d.field}: ${d.message}`).join('; ') },
      );
    }
    operations.push(candidate as SyncOperation);
  }

  // 3. Il digest si verifica per ultimo, sul contenuto normalizzato: se non
  //    corrisponde il file e' corrotto e va ignorato, non applicato a meta'.
  const digest = computeBundleDigest(operations);
  if (digest !== o['digest']) {
    return reject(
      'digest-non-corrispondente',
      'Il pacchetto risulta corrotto (impronta del contenuto non corrispondente): ' +
        'viene ignorato e lo storico locale resta intatto.',
      bundleId,
      { detail: `atteso ${String(o['digest'])}, calcolato ${digest}` },
    );
  }

  const count = o['operationCount'];
  if (count !== operations.length) {
    return reject(
      'metadati-incoerenti',
      `Il pacchetto dichiara ${String(count)} operazioni ma ne contiene ${String(operations.length)}.`,
      bundleId,
    );
  }
  const declaredRange = o['lamportRange'];
  const actualRange = lamportRange(operations);
  if (
    typeof declaredRange !== 'object' ||
    declaredRange === null ||
    (declaredRange as LamportRange).min !== actualRange.min ||
    (declaredRange as LamportRange).max !== actualRange.max
  ) {
    return reject('metadati-incoerenti', 'Intervallo del contatore logico non coerente.', bundleId);
  }

  const bundle: OperationBundle = Object.freeze({
    bundleId,
    originDeviceId: o['originDeviceId'] as string,
    workspaceId: o['workspaceId'] as string,
    protocolVersion: protocolVersion as number,
    formatVersion: formatVersion as number,
    operationCount: operations.length,
    lamportRange: actualRange,
    createdAt: o['createdAt'] as number,
    digest,
    operations: Object.freeze(operations),
  });
  return { ok: true, bundle };
}

function reject(
  code: BundleRejectionCode,
  message: string,
  bundleId: string | null,
  extra: { detail?: string } = {},
): BundleParseResult {
  const rejection: BundleRejection =
    extra.detail === undefined
      ? { code, message, bundleId }
      : { code, message, bundleId, detail: extra.detail };
  return { ok: false, rejection };
}

/**
 * Suddivide le operazioni in pacchetti.
 *
 * Il divieto e' esplicito: "non creare un file remoto per ogni aggiornamento
 * del timer" (specifica §8.1). 50 operazioni non devono produrre 50 file.
 */
export function chunkOperations(
  operations: readonly SyncOperation[],
  maxPerBundle: number,
): readonly (readonly SyncOperation[])[] {
  if (!Number.isInteger(maxPerBundle) || maxPerBundle < 1) {
    throw new Error(`Dimensione di pacchetto non valida: ${String(maxPerBundle)}.`);
  }
  const out: SyncOperation[][] = [];
  for (let i = 0; i < operations.length; i += maxPerBundle) {
    out.push(operations.slice(i, i + maxPerBundle));
  }
  return out;
}
