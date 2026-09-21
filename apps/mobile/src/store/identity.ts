/**
 * Identita' stabili dell'installazione: `deviceId` e `workspaceId`.
 *
 * Entrambi devono sopravvivere ai riavvii e **non devono cambiare**: il
 * `deviceId` finisce in `origin_device_id` di ogni operazione di
 * sincronizzazione e nel vincolo "una sola seduta attiva per installazione";
 * il `workspaceId` e' la chiave esterna di tutte le tabelle. Se cambiassero, il
 * dispositivo si presenterebbe come un secondo dispositivo e lo stesso archivio
 * si duplicherebbe (§8).
 *
 * Vivono in `expo-secure-store` e non nel database, per un motivo preciso:
 * servono **prima** di aprire il database (`openDatabaseTolerant` li richiede
 * nella configurazione), quindi non possono stare dentro il database stesso.
 *
 * Se l'archivio sicuro non e' leggibile **non si inventa un identificativo
 * nuovo**: si segnala l'errore e si interrompe l'avvio. Generarne uno nuovo a
 * ogni avvio fallito significherebbe moltiplicare i dispositivi e gli archivi.
 */

import * as SecureStore from 'expo-secure-store';
import { getRandomBytes } from 'expo-crypto';
import {
  createIdGenerator,
  isUlid,
  type Clock,
  type IdGenerator,
  type RandomSource,
} from '@trackstrong/core';

import { IdentityUnavailableError, type Identity } from './identityShared';

export { IdentityUnavailableError, type Identity } from './identityShared';

const DEVICE_KEY = 'trackstrong.deviceId';
const WORKSPACE_KEY = 'trackstrong.workspaceId';

/**
 * Sorgente casuale: `expo-crypto`, non il `crypto` globale.
 *
 * `systemRandom` di core usa `crypto.getRandomValues`, che su Node e nei
 * browser c'e' sempre ma su Hermes dipende da un polyfill. Iniettare
 * `expo-crypto` rende la dipendenza esplicita e verificabile.
 */
const expoRandom: RandomSource = (byteLength) => getRandomBytes(byteLength);

async function readOrCreate(key: string, make: () => string): Promise<{
  readonly value: string;
  readonly created: boolean;
}> {
  const existing = await SecureStore.getItemAsync(key);
  if (existing !== null && isUlid(existing)) {
    return { value: existing, created: false };
  }
  const value = make();
  await SecureStore.setItemAsync(key, value);
  return { value, created: true };
}

/**
 * Legge le identita', generandole solo al primo avvio.
 *
 * @throws {IdentityUnavailableError} se l'archivio sicuro non risponde.
 */
export async function loadIdentity(clock: Clock): Promise<Identity> {
  const ids = createIdGenerator(() => clock.now(), expoRandom);
  try {
    const device = await readOrCreate(DEVICE_KEY, () => ids.newId());
    const workspace = await readOrCreate(WORKSPACE_KEY, () => ids.newId());
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

/** Generatore di ID da usare nel resto dell'app, con la sorgente di Expo. */
export function createAppIdGenerator(clock: Clock): IdGenerator {
  return createIdGenerator(() => clock.now(), expoRandom);
}
