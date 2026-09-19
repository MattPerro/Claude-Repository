/**
 * ===========================================================================
 *  QUESTO FILE NON E' UNA VERIFICA CONTRO I SERVER REALI DI GOOGLE.
 * ===========================================================================
 *
 * `InMemoryDriveStore` e' un **finto**. Riproduce il comportamento dell'API
 * Google Drive v3 *per quanto serve a verificare il protocollo di
 * TrackStrong*, sulla base della documentazione ufficiale (vedi `drive.ts` per
 * gli URL e la data di verifica). Non parla con nessun server, non fa OAuth,
 * non fa HTTP.
 *
 * Di conseguenza, cio' che passa qui e' **verificato automaticamente sul
 * protocollo**, non "verificato su Google Drive". In particolare NON sono
 * verificati da questo file:
 *
 *  - il comportamento effettivo di `changes.list` sotto concorrenza reale
 *    (collasso dei cambiamenti, ritardi di propagazione, ordine effettivo);
 *  - la validita' e la scadenza reali dei `pageToken`;
 *  - il protocollo di upload ripristinabile (sessione, `308 Resume
 *    Incomplete`, header `Range`), che qui e' ridotto al solo fatto rilevante
 *    per il protocollo: "un upload il cui esito e' ignoto puo' essere andato a
 *    buon fine";
 *  - i codici e i `reason` HTTP reali, le soglie di quota, i tempi di
 *    `Retry-After`;
 *  - il flusso OAuth, la revoca del consenso, il comportamento di
 *    `appDataFolder` alla disinstallazione dell'app;
 *  - la latenza, i limiti di dimensione dei file, l'eventuale eventual
 *    consistency dei metadati.
 *
 * Quei punti richiedono una prova contro i server reali con un account di
 * prova, che non e' stata fatta.
 *
 * ## Modello
 *
 * Un {@link InMemoryDriveBackend} rappresenta la cartella `appDataFolder` di
 * **un** account: e' condiviso fra le viste. Ogni {@link InMemoryDriveStore} e'
 * la vista di **un dispositivo**, con il proprio elenco di guasti da iniettare
 * (un dispositivo offline mentre l'altro e' online e' un caso reale).
 */

import {
  DriveAuthError,
  DriveNetworkError,
  DriveNotFoundError,
  DriveQuotaError,
  DriveRateLimitError,
  DriveStorageFullError,
  type DriveChange,
  type DriveChangesPage,
  type DriveFileMetadata,
  type DriveQuery,
  type DriveStore,
  type DriveUploadRequest,
  type DriveUploadResult,
} from '../drive.js';

interface StoredFile {
  id: string;
  name: string;
  content: string;
  appProperties: Record<string, string>;
  trashed: boolean;
}

interface ChangeEntry {
  /** Numero di sequenza: fa da `pageToken`. */
  seq: number;
  fileId: string;
  removed: boolean;
}

/** Archivio condiviso: la cartella `appDataFolder` di un account Google. */
export class InMemoryDriveBackend {
  private readonly files = new Map<string, StoredFile>();
  private readonly changes: ChangeEntry[] = [];
  private nextSeq = 1;
  private nextId = 1;

  /** Vista di un dispositivo su questo archivio. */
  connect(options: InMemoryDriveOptions = {}): InMemoryDriveStore {
    return new InMemoryDriveStore(this, options);
  }

  /** Numero di file presenti (cestino escluso). Per le asserzioni dei test. */
  fileCount(): number {
    return [...this.files.values()].filter((f) => !f.trashed).length;
  }

  allFiles(): readonly DriveFileMetadata[] {
    return [...this.files.values()].map(toMetadata);
  }

  /** Numero di file con una data `appProperties.kind`. */
  countByKind(kind: string): number {
    return [...this.files.values()].filter((f) => !f.trashed && f.appProperties['kind'] === kind)
      .length;
  }

  startPageToken(): string {
    return String(this.nextSeq);
  }

  write(request: DriveUploadRequest, sharedSeq?: number): string {
    const id = `file-${String(this.nextId)}`;
    this.nextId += 1;
    this.files.set(id, {
      id,
      name: request.name,
      content: request.content,
      appProperties: { ...request.appProperties },
      trashed: false,
    });
    const seq = sharedSeq ?? this.nextSeq;
    if (sharedSeq === undefined) this.nextSeq += 1;
    this.changes.push({ seq, fileId: id, removed: false });
    return id;
  }

  /**
   * Due dispositivi che scrivono **contemporaneamente**: i file ricevono lo
   * stesso numero di sequenza, quindi compaiono nella stessa pagina di
   * `changes.list` senza un ordine relativo definito.
   */
  writeSimultaneously(requests: readonly DriveUploadRequest[]): readonly string[] {
    const seq = this.nextSeq;
    this.nextSeq += 1;
    return requests.map((r) => this.write(r, seq));
  }

  read(fileId: string): string {
    const file = this.files.get(fileId);
    if (file === undefined) throw new DriveNotFoundError(fileId);
    return file.content;
  }

  /** Corrompe il contenuto di un file, per i test sul digest. */
  corrupt(fileId: string, mutate: (content: string) => string): void {
    const file = this.files.get(fileId);
    if (file === undefined) throw new DriveNotFoundError(fileId);
    file.content = mutate(file.content);
    this.changes.push({ seq: this.nextSeq, fileId, removed: false });
    this.nextSeq += 1;
  }

  remove(fileId: string): void {
    const file = this.files.get(fileId);
    if (file === undefined) throw new DriveNotFoundError(fileId);
    this.files.delete(fileId);
    this.changes.push({ seq: this.nextSeq, fileId, removed: true });
    this.nextSeq += 1;
  }

  trash(fileId: string): void {
    const file = this.files.get(fileId);
    if (file === undefined) throw new DriveNotFoundError(fileId);
    file.trashed = true;
    this.changes.push({ seq: this.nextSeq, fileId, removed: false });
    this.nextSeq += 1;
  }

  query(query: DriveQuery): readonly DriveFileMetadata[] {
    const includeTrashed = query.includeTrashed ?? false;
    return [...this.files.values()]
      .filter((file) => {
        if (!includeTrashed && file.trashed) return false;
        if (query.namePrefix !== undefined && !file.name.startsWith(query.namePrefix)) return false;
        for (const [key, value] of Object.entries(query.appProperties ?? {})) {
          if (file.appProperties[key] !== value) return false;
        }
        return true;
      })
      .map(toMetadata);
  }

  page(pageToken: string, pageSize: number): { entries: readonly ChangeEntry[]; hasMore: boolean } {
    const from = Number(pageToken);
    if (!Number.isFinite(from)) {
      // Un `pageToken` non valido su Drive e' un errore, non "nessun
      // cambiamento": trattarlo come archivio vuoto perderebbe dati.
      throw new DriveNotFoundError(`pageToken ${pageToken}`);
    }
    const all = this.changes.filter((c) => c.seq >= from).sort((a, b) => a.seq - b.seq);
    const entries = all.slice(0, pageSize);
    return { entries, hasMore: all.length > entries.length };
  }

  metadata(fileId: string): DriveFileMetadata | null {
    const file = this.files.get(fileId);
    return file === undefined ? null : toMetadata(file);
  }

  nextSeqAfter(entries: readonly ChangeEntry[]): string {
    const last = entries.at(-1);
    return last === undefined ? String(this.nextSeq) : String(last.seq + 1);
  }
}

function toMetadata(file: StoredFile): DriveFileMetadata {
  return {
    id: file.id,
    name: file.name,
    size: new TextEncoder().encode(file.content).length,
    appProperties: { ...file.appProperties },
    trashed: file.trashed,
  };
}

export interface InMemoryDriveOptions {
  /** Dimensione delle pagine di `changes.list`. Piccola = piu' pagine. */
  readonly changesPageSize?: number;
  /**
   * Restituisce i cambiamenti di ogni pagina in ordine **inverso**: simula
   * una ricezione fuori ordine in modo deterministico.
   */
  readonly outOfOrderChanges?: boolean;
}

/** Vista di un dispositivo. I guasti si iniettano qui. */
export class InMemoryDriveStore implements DriveStore {
  private tokenRevoked = false;
  private apiQuotaExhausted = false;
  private storageFull = false;
  private offline = false;
  private rateLimitQueue: (number | null)[] = [];
  private lostUploadResponses = 0;
  private truncatedDownloads = 0;
  private failedUploadsBeforeWrite = 0;

  /** Contatori, per le asserzioni dei test. */
  readonly calls = { uploads: 0, downloads: 0, listFiles: 0, listChanges: 0, deletes: 0 };

  constructor(
    readonly backend: InMemoryDriveBackend,
    private readonly options: InMemoryDriveOptions = {},
  ) {}

  // --- guasti iniettabili -------------------------------------------------

  /** Token revocato o consenso ritirato: ogni chiamata falla con 401/403. */
  revokeToken(): void {
    this.tokenRevoked = true;
  }

  restoreToken(): void {
    this.tokenRevoked = false;
  }

  /** Quote dell'API esaurite (numero di richieste), spazio ancora libero. */
  exhaustApiQuota(): void {
    this.apiQuotaExhausted = true;
  }

  /** Spazio di archiviazione dell'utente esaurito: solo gli upload fallano. */
  fillStorage(): void {
    this.storageFull = true;
  }

  freeStorage(): void {
    this.storageFull = false;
  }

  /** Dispositivo senza rete. */
  goOffline(): void {
    this.offline = true;
  }

  goOnline(): void {
    this.offline = false;
  }

  /** Limite di frequenza sulle prossime `times` chiamate. */
  throttle(times = 1, retryAfterMs: number | null = null): void {
    for (let i = 0; i < times; i += 1) this.rateLimitQueue.push(retryAfterMs);
  }

  /**
   * L'upload **scrive** il file e poi la risposta si perde.
   *
   * E' il caso che la documentazione degli upload ripristinabili descrive con
   * "you should not assume that the server received all bytes sent in any
   * given request": l'esito e' ignoto, e puo' essere stato un successo.
   * Il retry non deve creare un secondo pacchetto.
   */
  loseNextUploadResponse(times = 1): void {
    this.lostUploadResponses += times;
  }

  /** L'upload falla **senza** scrivere nulla. */
  failNextUploadBeforeWriting(times = 1): void {
    this.failedUploadsBeforeWrite += times;
  }

  /** Il prossimo download si interrompe a meta': contenuto troncato. */
  truncateNextDownload(times = 1): void {
    this.truncatedDownloads += times;
  }

  // --- DriveStore ---------------------------------------------------------

  async getStartPageToken(): Promise<string> {
    this.guard();
    return this.backend.startPageToken();
  }

  async listChanges(pageToken: string): Promise<DriveChangesPage> {
    this.guard();
    this.calls.listChanges += 1;
    const pageSize = this.options.changesPageSize ?? 100;
    const { entries, hasMore } = this.backend.page(pageToken, pageSize);
    const ordered = this.options.outOfOrderChanges === true ? [...entries].reverse() : entries;
    const changes: DriveChange[] = ordered.map((entry) => {
      const metadata = entry.removed ? null : this.backend.metadata(entry.fileId);
      return {
        fileId: entry.fileId,
        removed: entry.removed || metadata === null,
        file: metadata,
        changeType: 'file',
      };
    });
    const next = this.backend.nextSeqAfter(entries);
    return {
      changes,
      nextPageToken: hasMore ? next : null,
      newStartPageToken: hasMore ? null : next,
    };
  }

  async listFiles(query: DriveQuery): Promise<readonly DriveFileMetadata[]> {
    this.guard();
    this.calls.listFiles += 1;
    return this.backend.query(query);
  }

  async uploadFile(request: DriveUploadRequest): Promise<DriveUploadResult> {
    this.guard();
    if (this.storageFull) throw new DriveStorageFullError();
    this.calls.uploads += 1;
    if (this.failedUploadsBeforeWrite > 0) {
      this.failedUploadsBeforeWrite -= 1;
      throw new DriveNetworkError('Upload interrotto prima della scrittura.');
    }
    const fileId = this.backend.write(request);
    if (this.lostUploadResponses > 0) {
      this.lostUploadResponses -= 1;
      // Il file **c'e'**, la risposta no.
      throw new DriveNetworkError(
        'Risposta di upload persa: il file potrebbe essere stato scritto.',
      );
    }
    return { fileId };
  }

  async downloadFile(fileId: string): Promise<string> {
    this.guard();
    this.calls.downloads += 1;
    const content = this.backend.read(fileId);
    if (this.truncatedDownloads > 0) {
      this.truncatedDownloads -= 1;
      // Download interrotto a meta': il chiamante riceve JSON troncato.
      return content.slice(0, Math.floor(content.length / 2));
    }
    return content;
  }

  async deleteFile(fileId: string): Promise<void> {
    this.guard();
    this.calls.deletes += 1;
    this.backend.remove(fileId);
  }

  // --- porta dei guasti ---------------------------------------------------

  private guard(): void {
    if (this.tokenRevoked) {
      throw new DriveAuthError(
        'Accesso a Google Drive da rinnovare: il collegamento non e piu valido.',
        'token-revocato',
      );
    }
    if (this.offline) throw new DriveNetworkError();
    if (this.rateLimitQueue.length > 0) {
      const retryAfterMs = this.rateLimitQueue.shift() ?? null;
      throw new DriveRateLimitError(retryAfterMs);
    }
    if (this.apiQuotaExhausted) throw new DriveQuotaError();
  }
}
