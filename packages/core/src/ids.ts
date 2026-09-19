/**
 * Identificativi univoci generati sul dispositivo, senza rete.
 *
 * Ogni entita' e ogni operazione di sincronizzazione nascono con un ID
 * definitivo sul dispositivo che le crea: non esiste un "ID provvisorio" da
 * rimpiazzare dopo l'upload. E' questo che rende le operazioni applicabili
 * una sola volta anche se la risposta di rete va persa e il client ritenta
 * (specifica §6).
 *
 * Formato: ULID (Crockford base32, 26 caratteri).
 *  - 48 bit di timestamp in millisecondi, quindi ordinabile per creazione;
 *  - 80 bit casuali, quindi collision-safe fra dispositivi;
 *  - monotono all'interno dello stesso millisecondo.
 *
 * L'ordinamento lessicografico e' solo un comodo indice locale: NON viene
 * usato per decidere quale modifica vince in caso di conflitto, perche'
 * incorpora l'orologio del dispositivo (specifica §6).
 */

import type { Instant } from './time.js';

const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32, senza I L O U
const ENCODING_LEN = 32;
const TIME_CHARS = 10;
const RANDOM_CHARS = 16;
export const ULID_LENGTH = TIME_CHARS + RANDOM_CHARS;

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/** Sorgente di byte casuali, iniettabile per i test. */
export type RandomSource = (byteLength: number) => Uint8Array;

/** Sorgente casuale di sistema (WebCrypto, presente su Node 22 e su Hermes). */
export const systemRandom: RandomSource = (byteLength) => {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytes;
};

/**
 * Generatore di ULID monotono.
 *
 * A parita' di millisecondo incrementa la parte casuale invece di rigenerarla,
 * cosi' due entita' create nello stesso istante mantengono l'ordine di
 * creazione. Se l'orologio torna indietro (cambio manuale dell'ora, NTP)
 * riusa l'ultimo timestamp visto: gli ID restano crescenti e univoci.
 */
export class UlidFactory {
  private lastTime = -1;
  private lastRandom: number[] = [];

  constructor(private readonly random: RandomSource = systemRandom) {}

  next(now: Instant): string {
    const time = Math.max(0, Math.floor(now));
    if (time === this.lastTime || time < this.lastTime) {
      this.incrementRandom();
    } else {
      this.lastTime = time;
      this.lastRandom = this.freshRandom();
    }
    return encodeTime(this.lastTime) + this.lastRandom.map((i) => ENCODING[i]).join('');
  }

  private freshRandom(): number[] {
    const bytes = this.random(RANDOM_CHARS);
    const out: number[] = [];
    for (let i = 0; i < RANDOM_CHARS; i += 1) {
      out.push((bytes[i] ?? 0) % ENCODING_LEN);
    }
    return out;
  }

  private incrementRandom(): void {
    if (this.lastRandom.length !== RANDOM_CHARS) {
      this.lastRandom = this.freshRandom();
      return;
    }
    for (let i = RANDOM_CHARS - 1; i >= 0; i -= 1) {
      const value = this.lastRandom[i] ?? 0;
      if (value < ENCODING_LEN - 1) {
        this.lastRandom[i] = value + 1;
        return;
      }
      this.lastRandom[i] = 0;
    }
    // Overflow completo della parte casuale nello stesso millisecondo
    // (1.2e24 ID): avanza il timestamp per non ripetere un ID.
    this.lastTime += 1;
    this.lastRandom = this.freshRandom();
  }
}

function encodeTime(time: number): string {
  let remaining = time;
  const chars: string[] = [];
  for (let i = 0; i < TIME_CHARS; i += 1) {
    chars.push(ENCODING[remaining % ENCODING_LEN] ?? '0');
    remaining = Math.floor(remaining / ENCODING_LEN);
  }
  return chars.reverse().join('');
}

/** Estrae l'istante di creazione da un ULID (solo diagnostica). */
export function ulidTimestamp(id: string): Instant | null {
  if (!isUlid(id)) return null;
  let value = 0;
  for (let i = 0; i < TIME_CHARS; i += 1) {
    const index = ENCODING.indexOf(id[i] ?? '');
    if (index < 0) return null;
    value = value * ENCODING_LEN + index;
  }
  return value;
}

export function isUlid(value: string): boolean {
  return ULID_RE.test(value);
}

/**
 * Generatore deterministico, per i test: produce sempre la stessa sequenza.
 * Non usarlo in produzione.
 */
export function seededRandom(seed: number): RandomSource {
  let state = seed >>> 0 || 0x2f6e2b1;
  return (byteLength) => {
    const out = new Uint8Array(byteLength);
    for (let i = 0; i < byteLength; i += 1) {
      // xorshift32: deterministico e sufficiente per i test.
      state ^= state << 13;
      state >>>= 0;
      state ^= state >>> 17;
      state ^= state << 5;
      state >>>= 0;
      out[i] = state & 0xff;
    }
    return out;
  };
}

/**
 * Identificativo stabile del dispositivo/installazione.
 *
 * Nasce al primo avvio, resta nel database locale e non cambia con gli
 * aggiornamenti dell'app. Compare come `origin` in ogni operazione di
 * sincronizzazione.
 */
export type DeviceId = string;

/** Identificativo dell'archivio personale (workspace). */
export type WorkspaceId = string;

export interface IdGenerator {
  /** Nuovo ID di entita'. */
  newId(): string;
}

/** Costruisce un generatore di ID legato a un orologio. */
export function createIdGenerator(
  now: () => Instant,
  random: RandomSource = systemRandom,
): IdGenerator {
  const factory = new UlidFactory(random);
  return { newId: () => factory.next(now()) };
}
