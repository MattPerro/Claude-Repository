/**
 * Identita' dell'installazione: parte comune a dispositivo e PWA.
 *
 * Senza gemello di piattaforma, per la stessa ragione di
 * `platformStorage.ts`: un `identity.web.ts` che importasse `./identity`
 * risolverebbe su se stesso.
 *
 * `deviceId` e `workspaceId` devono sopravvivere ai riavvii e **non devono
 * cambiare**: il `deviceId` finisce in `origin_device_id` di ogni operazione
 * di sincronizzazione e nel vincolo "una sola seduta attiva per
 * installazione"; il `workspaceId` e' la chiave esterna di tutte le tabelle.
 * Se cambiassero, il dispositivo si presenterebbe come un secondo dispositivo
 * e lo stesso archivio si duplicherebbe (§8).
 */

export interface Identity {
  readonly deviceId: string;
  readonly workspaceId: string;
  /** `true` al primissimo avvio su questa installazione. */
  readonly createdNow: boolean;
}

/**
 * L'archivio delle identita' non risponde.
 *
 * L'avvio si interrompe invece di generare identificativi nuovi: sarebbe la
 * via piu' comoda e moltiplicherebbe dispositivi e archivi.
 */
export class IdentityUnavailableError extends Error {
  constructor(cause: unknown) {
    super(
      "L'archivio delle identita' non e' accessibile, quindi non e' possibile " +
        "leggere l'identificativo di questa installazione. L'avvio si " +
        "interrompe invece di generarne uno nuovo: un identificativo nuovo " +
        "duplicherebbe il dispositivo e l'archivio. Riprova, e se il problema " +
        'resta verifica lo sblocco del portachiavi di iOS (app nativa) oppure ' +
        'che il browser non sia in navigazione privata (PWA).',
      { cause },
    );
    this.name = 'IdentityUnavailableError';
  }
}
