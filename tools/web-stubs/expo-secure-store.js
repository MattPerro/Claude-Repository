/**
 * Sostituto di `expo-secure-store` per il SOLO banco degli screenshot.
 *
 * Non fa parte dell'app: viene iniettato da `apps/mobile/metro.config.js`
 * unicamente quando la piattaforma e' `web`, che e' la piattaforma usata da
 * `tools/screenshots.mjs` per produrre le schermate di revisione.
 *
 * Su iOS l'app usa il vero `expo-secure-store`, cioe' il Keychain. Questo
 * ripiego usa `localStorage`, che **non e' un archivio sicuro**: e' adeguato a
 * far partire l'app dentro un browser per guardarla, e a nient'altro.
 *
 * Il motivo per cui serve: senza archivio sicuro l'app non riesce a leggere
 * l'identificativo dell'installazione e - correttamente - **si rifiuta di
 * proseguire**, invece di generarne uno nuovo che duplicherebbe l'archivio.
 * E' il comportamento giusto, e rende impossibile vedere le schermate nel
 * browser senza questo sostituto.
 */

const PREFIX = 'trackstrong-screenshot-stub:';

export async function getItemAsync(key) {
  try {
    return globalThis.localStorage?.getItem(PREFIX + key) ?? null;
  } catch {
    return null;
  }
}

export async function setItemAsync(key, value) {
  try {
    globalThis.localStorage?.setItem(PREFIX + key, value);
  } catch {
    // Nel banco di revisione un fallimento di scrittura non e' interessante.
  }
}

export async function deleteItemAsync(key) {
  try {
    globalThis.localStorage?.removeItem(PREFIX + key);
  } catch {
    // Vedi sopra.
  }
}

export async function isAvailableAsync() {
  return typeof globalThis.localStorage !== 'undefined';
}

export const WHEN_UNLOCKED = 'whenUnlocked';
export const AFTER_FIRST_UNLOCK = 'afterFirstUnlock';
