/**
 * Identita' stabili dell'installazione, nella PWA.
 *
 * Gemello di `identity.ts`, con la stessa regola non negoziabile: se
 * l'archivio non e' leggibile **non si inventa un identificativo nuovo**.
 * Generarne uno a ogni avvio fallito moltiplicherebbe i dispositivi e gli
 * archivi, e la sincronizzazione vedrebbe lo stesso telefono come una fila di
 * telefoni diversi (§8).
 *
 * ---------------------------------------------------------------------------
 * PERCHE' `localStorage` E NON IndexedDB
 *
 * `deviceId` e `workspaceId` servono **prima** di aprire il database, e
 * `localStorage` e' sincrono: leggerli non introduce un secondo passo
 * asincrono nell'avvio. Non sono segreti - sono due ULID senza significato
 * fuori da questo archivio - quindi non hanno bisogno di un archivio
 * protetto; hanno bisogno di essere sempre gli stessi.
 *
 * Quello che invece **e'** un segreto, il token di Google, non sta qui e non
 * sta in `localStorage`: vedi `driveAuth.web.ts` e `PRIVACY.md` §4, dove e'
 * scritto per intero cosa un browser puo' e non puo' proteggere.
 * ---------------------------------------------------------------------------
 */

import { createIdGenerator, isUlid, type Clock, type IdGenerator } from '@trackstrong/core';

import { IdentityUnavailableError, type Identity } from './identityShared';

export { IdentityUnavailableError, type Identity } from './identityShared';

const DEVICE_KEY = 'trackstrong.deviceId';
const WORKSPACE_KEY = 'trackstrong.workspaceId';

/**
 * Sorgente casuale: `crypto.getRandomValues`, che nei browser c'e' sempre.
 *
 * Se mancasse non si ripiega su `Math.random`: due installazioni potrebbero
 * generare lo stesso identificativo e i loro archivi si fonderebbero.
 */
function browserRandom(byteLength: number): Uint8Array {
  const target = new Uint8Array(byteLength);
  const source = globalThis.crypto;
  if (source === undefined || typeof source.getRandomValues !== 'function') {
    throw new Error(
      "Questo browser non espone `crypto.getRandomValues`, quindi non e' " +
        "possibile generare un identificativo univoco per l'installazione. " +
        "L'avvio si interrompe: un identificativo non casuale potrebbe " +
        "coincidere con quello di un'altra installazione e fondere due archivi.",
    );
  }
  source.getRandomValues(target);
  return target;
}

function storage(): Storage {
  const local = globalThis.localStorage as Storage | undefined;
  if (local === undefined) {
    throw new Error("`localStorage` non e' disponibile in questo contesto.");
  }
  // Una lettura di prova: in navigazione privata `localStorage` esiste ma puo'
  // sollevare all'uso, e scoprirlo qui e' meglio che scoprirlo a meta' avvio.
  local.getItem(DEVICE_KEY);
  return local;
}

function readOrCreate(
  local: Storage,
  key: string,
  make: () => string,
): { readonly value: string; readonly created: boolean } {
  const existing = local.getItem(key);
  if (existing !== null && isUlid(existing)) {
    return { value: existing, created: false };
  }
  if (existing !== null) {
    // C'e' qualcosa che non e' un ULID. Sovrascriverlo significherebbe
    // abbandonare l'archivio a cui quel valore puntava.
    throw new Error(
      `L'identificativo "${key}" conservato dal browser non e' valido. ` +
        "L'avvio si interrompe invece di generarne uno nuovo, che " +
        "renderebbe inaccessibile l'archivio esistente.",
    );
  }
  const value = make();
  local.setItem(key, value);
  // Rilettura: `setItem` puo' fallire in silenzio quando la quota e' esaurita,
  // e un identificativo non scritto tornerebbe diverso al prossimo avvio.
  if (local.getItem(key) !== value) {
    throw new Error(
      "L'identificativo dell'installazione non e' stato conservato dal " +
        "browser. Senza di esso ogni avvio creerebbe un archivio nuovo.",
    );
  }
  return { value, created: true };
}

/**
 * Legge le identita', generandole solo al primo avvio.
 *
 * @throws {IdentityUnavailableError} se l'archivio del browser non risponde.
 */
export async function loadIdentity(clock: Clock): Promise<Identity> {
  const ids = createIdGenerator(() => clock.now(), browserRandom);
  try {
    const local = storage();
    const device = readOrCreate(local, DEVICE_KEY, () => ids.newId());
    const workspace = readOrCreate(local, WORKSPACE_KEY, () => ids.newId());
    return {
      deviceId: device.value,
      workspaceId: workspace.value,
      createdNow: device.created || workspace.created,
    };
  } catch (error) {
    if (error instanceof IdentityUnavailableError) throw error;
    throw new IdentityUnavailableError(error);
  }
}

export function createAppIdGenerator(clock: Clock): IdGenerator {
  return createIdGenerator(() => clock.now(), browserRandom);
}
