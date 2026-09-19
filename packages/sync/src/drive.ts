/**
 * Porta verso Google Drive (`appDataFolder`).
 *
 * Questo modulo NON contiene nessuna chiamata HTTP e nessuna dipendenza da
 * React Native, da Expo o da `node:fs`: e' l'interfaccia minima che il motore
 * di sincronizzazione usa. L'implementazione reale (OAuth + `fetch`) vive
 * nell'app; qui c'e' solo il contratto, cosi' il protocollo e' interamente
 * verificabile su Node.
 *
 * ## Vincoli dell'API reale modellati qui
 *
 * Verificato il **2026-09-19** sul documento di discovery ufficiale
 * `drive v3`, revision `20260901`:
 * https://raw.githubusercontent.com/googleapis/google-api-go-client/main/drive/v3/drive-api.json
 * (l'accesso diretto a `developers.google.com` e' bloccato dal proxy di rete
 * di questo ambiente; il discovery document e' la stessa fonte da cui sono
 * generati i client ufficiali).
 *
 * - **Ambito**: `https://www.googleapis.com/auth/drive.appdata`. E' l'ambito
 *   minimo necessario ed e' fra quelli dichiarati in `auth.oauth2.scopes` del
 *   discovery document. E' anche uno degli ambiti accettati da
 *   `changes.getStartPageToken`. Con questo ambito l'app vede **solo** la
 *   propria cartella dati, non i file personali dell'utente
 *   (specifica §8: "minimo ambito necessario").
 * - **Spazio**: `files.list` e `changes.list` accettano il parametro `spaces`,
 *   documentato come "A comma-separated list of spaces to query within the
 *   corpora. Supported values are `drive` and `appDataFolder`." Tutte le
 *   chiamate di TrackStrong usano `spaces=appDataFolder`, e `files.create`
 *   usa `parents: ['appDataFolder']`.
 * - **Cursore dei cambiamenti**: `changes.getStartPageToken` (GET
 *   `changes/startPageToken`) restituisce uno `StartPageToken` con il solo
 *   campo `startPageToken`. `changes.list` (GET `changes`) accetta `pageToken`
 *   e restituisce uno `ChangeList` con `changes`, `nextPageToken` e
 *   `newStartPageToken`. Quando `nextPageToken` e' assente, `newStartPageToken`
 *   e' il cursore da conservare per la prossima interrogazione.
 * - **`appProperties`**: "A collection of arbitrary key-value pairs which are
 *   private to the requesting app... You cannot use an API key to retrieve
 *   private properties." E' dove TrackStrong replica `bundleId`, cosi' una
 *   risposta di upload persa si puo' riconoscere con una `files.list` invece
 *   di ricaricare.
 * - **`name` non e' unico**: "The name of the file. This isn't necessarily
 *   unique within a folder." Vedi `bundle.ts` per le conseguenze.
 * - **La cartella dati e' cancellabile dall'utente**: viene rimossa se l'utente
 *   disinstalla o scollega l'app, e l'utente puo' eliminarla a mano
 *   (https://developers.google.com/workspace/drive/api/guides/appdata).
 *   Per questo l'archivio remoto **non** e' la fonte di verita': la fonte
 *   operativa e' il database locale (specifica §7).
 * - **Quota**: i file in `appDataFolder` occupano la quota di Drive
 *   dell'utente. Lo spazio esaurito e' quindi un caso reale, distinto dal
 *   superamento delle quote dell'API.
 * - **Errori di limite**: `userRateLimitExceeded` arriva con HTTP 403,
 *   `rateLimitExceeded` con HTTP 429; in entrambi i casi la guida ufficiale
 *   prescrive backoff esponenziale con jitter
 *   (https://developers.google.com/workspace/drive/api/guides/handle-errors).
 * - **Upload ripristinabili**: su un'interruzione o un 5xx si ritenta il pezzo
 *   o si riprende dall'offset indicato dall'header `Range` della risposta
 *   `308 Resume Incomplete`; "you should not assume that the server received
 *   all bytes sent in any given request"
 *   (https://developers.google.com/workspace/drive/api/guides/manage-uploads).
 *   Qui questo si traduce in un fatto di protocollo: **un upload il cui esito
 *   e' ignoto puo' essere andato a buon fine**, quindi il retry deve
 *   verificare per `bundleId` prima di ricaricare.
 */

/** Ambito OAuth minimo necessario (specifica §8). */
export const DRIVE_APPDATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

/** Valore del parametro `spaces` e del `parents` usati da TrackStrong. */
export const DRIVE_APPDATA_SPACE = 'appDataFolder';

// ---------------------------------------------------------------------------
// Metadati
// ---------------------------------------------------------------------------

export interface DriveFileMetadata {
  /** `id` assegnato da Drive: la vera identita' del file. */
  readonly id: string;
  readonly name: string;
  /**
   * Dimensione in byte. Nell'API e' una stringa e non e' popolata per i file
   * senza contenuto binario; qui e' `number | null` per non nascondere il caso.
   */
  readonly size: number | null;
  readonly appProperties: Readonly<Record<string, string>>;
  /** Un file nel cestino non va applicato, ma non e' nemmeno "inesistente". */
  readonly trashed: boolean;
}

export type DriveChangeType = 'file' | 'drive';

export interface DriveChange {
  readonly fileId: string;
  /** `true` se il file e' stato rimosso o non e' piu' visibile all'app. */
  readonly removed: boolean;
  /** Metadati, assenti quando `removed` e' `true`. */
  readonly file: DriveFileMetadata | null;
  readonly changeType: DriveChangeType;
}

export interface DriveChangesPage {
  readonly changes: readonly DriveChange[];
  /** Pagina successiva dello stesso giro. `null` se questa era l'ultima. */
  readonly nextPageToken: string | null;
  /** Cursore da conservare, presente solo sull'ultima pagina. */
  readonly newStartPageToken: string | null;
}

/**
 * Interrogazione sui file.
 *
 * Deliberatamente strutturata invece di una stringa `q` libera: il motore non
 * deve poter costruire interrogazioni fuori da `appDataFolder`.
 * L'implementazione reale la traduce in `q` + `spaces=appDataFolder`.
 */
export interface DriveQuery {
  /** Filtro su `name contains '<prefix>'`. */
  readonly namePrefix?: string;
  /** Filtro su `appProperties has { key='k' and value='v' }`, in AND. */
  readonly appProperties?: Readonly<Record<string, string>>;
  /** Per difetto i file nel cestino sono esclusi. */
  readonly includeTrashed?: boolean;
  readonly pageSize?: number;
}

export interface DriveUploadRequest {
  readonly name: string;
  readonly content: string;
  readonly appProperties: Readonly<Record<string, string>>;
}

export interface DriveUploadResult {
  readonly fileId: string;
}

export interface DriveStore {
  /**
   * Cursore iniziale dei cambiamenti (`changes.getStartPageToken`).
   *
   * Va chiamato **prima** di scaricare lo storico: e' cosi' che il primo
   * recupero non perde le modifiche arrivate durante il download
   * (specifica §8.1).
   */
  getStartPageToken(): Promise<string>;

  /** `changes.list` con `pageToken`. */
  listChanges(pageToken: string): Promise<DriveChangesPage>;

  /** `files.list` limitata a `spaces=appDataFolder`. */
  listFiles(query: DriveQuery): Promise<readonly DriveFileMetadata[]>;

  /** `files.create` con `parents: ['appDataFolder']`. */
  uploadFile(request: DriveUploadRequest): Promise<DriveUploadResult>;

  /** `files.get` con `alt=media`. */
  downloadFile(fileId: string): Promise<string>;

  /** `files.delete`. Usata solo dalla manutenzione, mai dalla sync normale. */
  deleteFile(fileId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Errori tipizzati
// ---------------------------------------------------------------------------

/**
 * Base degli errori di Drive.
 *
 * Gli errori sono **distinti per tipo** perche' la specifica vieta
 * espressamente di interpretare un errore di autorizzazione, di quota o di
 * rete come "archivio vuoto" (specifica §8.1). Un elenco vuoto e un errore
 * sono due cose diverse, e confonderle significa cancellare i dati
 * dell'utente.
 */
export abstract class DriveError extends Error {
  /** Vero se ritentare la stessa richiesta puo' avere senso. */
  abstract readonly retryable: boolean;
  /**
   * Vero se l'errore potrebbe **mascherare un successo** (la scrittura e'
   * avvenuta ma la risposta si e' persa). In quel caso il retry deve prima
   * verificare, non riscrivere.
   */
  readonly maybePartiallyApplied: boolean = false;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options as ErrorOptions);
    this.name = new.target.name;
  }
}

/**
 * Token revocato, scaduto, o consenso ritirato (HTTP 401, o 403 con
 * `authError`). NON significa "archivio vuoto": significa "accesso da
 * rinnovare" (specifica §8.5).
 */
export class DriveAuthError extends DriveError {
  override readonly retryable = false;
  constructor(
    message = 'Accesso a Google Drive da rinnovare: il collegamento non e piu valido.',
    readonly reason: 'token-revocato' | 'token-scaduto' | 'consenso-mancante' = 'token-revocato',
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

/**
 * Quote dell'API superate (HTTP 403 `userRateLimitExceeded`, quota giornaliera
 * del progetto). Diverso da {@link DriveStorageFullError}: qui lo spazio
 * dell'utente c'e', e' il numero di richieste che e' esaurito.
 */
export class DriveQuotaError extends DriveError {
  override readonly retryable = false;
  constructor(
    message = 'Quota di utilizzo di Google Drive esaurita: riprova piu tardi.',
    readonly scope: 'utente' | 'progetto' = 'utente',
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

/**
 * Spazio di archiviazione dell'utente esaurito (HTTP 403
 * `storageQuotaExceeded`). I file in `appDataFolder` occupano la quota di
 * Drive dell'utente, quindi e' un caso reale. La registrazione locale deve
 * continuare a funzionare (specifica §7 e §8.5: "un problema di rete non
 * interrompe la registrazione").
 */
export class DriveStorageFullError extends DriveError {
  override readonly retryable = false;
  constructor(
    message = 'Spazio su Google Drive esaurito: le modifiche restano salvate sul dispositivo.',
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

/**
 * Rete assente o richiesta interrotta.
 *
 * `maybePartiallyApplied` e' `true` perche' un upload interrotto **puo'** aver
 * raggiunto il server: e' esattamente il caso "risposta persa".
 */
export class DriveNetworkError extends DriveError {
  override readonly retryable = true;
  override readonly maybePartiallyApplied: boolean = true;
  constructor(
    message = 'Connessione a Google Drive non disponibile.',
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

/**
 * Limite di frequenza (HTTP 429 `rateLimitExceeded`, o 403
 * `userRateLimitExceeded`). `retryAfterMs` riporta l'header `Retry-After`
 * quando presente; in sua assenza si usa il backoff esponenziale con jitter.
 */
export class DriveRateLimitError extends DriveError {
  override readonly retryable = true;
  constructor(
    readonly retryAfterMs: number | null = null,
    message = 'Troppe richieste a Google Drive: attendo prima di ritentare.',
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

/** File inesistente o non piu' visibile all'app (HTTP 404). */
export class DriveNotFoundError extends DriveError {
  override readonly retryable = false;
  constructor(readonly fileId: string, options?: { cause?: unknown }) {
    super(`File ${fileId} non trovato su Google Drive.`, options);
  }
}

/**
 * Conflitto di scrittura segnalato dal server (HTTP 409, o `ETag`/precondizione
 * non soddisfatta). Non e' un conflitto di dati: e' una scrittura concorrente
 * sullo stesso file remoto.
 */
export class DriveConflictError extends DriveError {
  override readonly retryable = true;
  override readonly maybePartiallyApplied: boolean = true;
  constructor(
    message = 'Scrittura concorrente su Google Drive: verifico prima di ritentare.',
    readonly fileId: string | null = null,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

/** Vero se l'errore viene dalla porta Drive. */
export function isDriveError(value: unknown): value is DriveError {
  return value instanceof DriveError;
}

/**
 * Vero se l'errore riguarda il **collegamento** e non i dati.
 *
 * Usata dal motore per non trattare mai questi casi come "archivio vuoto":
 * davanti a uno di questi errori il primo recupero si interrompe e i dati
 * locali restano come sono.
 */
export function isAccessOrTransportError(value: unknown): boolean {
  return (
    value instanceof DriveAuthError ||
    value instanceof DriveQuotaError ||
    value instanceof DriveStorageFullError ||
    value instanceof DriveNetworkError ||
    value instanceof DriveRateLimitError ||
    value instanceof DriveConflictError
  );
}
