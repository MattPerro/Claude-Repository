/**
 * Date, settimane e istanti.
 *
 * Tre tipi distinti, deliberatamente non intercambiabili:
 *
 *  - {@link LocalDate}  "2026-09-19": un giorno di calendario. E' cio' che
 *    l'utente intende con "lunedi'". Non ha fuso orario ne' ora.
 *  - {@link Instant}    millisecondi dall'epoch UTC: un momento preciso.
 *    E' cio' che si salva come timestamp di una serie.
 *  - {@link Monotonic}  millisecondi da un'origine arbitraria, mai
 *    all'indietro. Serve ai timer, che non devono rompersi se l'utente
 *    cambia l'orologio del telefono.
 *
 * L'aritmetica sui giorni passa da mezzogiorno UTC: cosi' un'ora legale che
 * entra o esce non fa mai scivolare un giorno avanti o indietro.
 */

/** Giorno di calendario in formato ISO `YYYY-MM-DD`. */
export type LocalDate = string & { readonly __brand?: 'LocalDate' };

/** Millisecondi dall'epoch UTC (1970-01-01T00:00:00Z). */
export type Instant = number & { readonly __brand?: 'Instant' };

/** Millisecondi da un'origine arbitraria, monotona crescente. */
export type Monotonic = number & { readonly __brand?: 'Monotonic' };

/** Identificativo di fuso orario IANA, es. "Europe/Rome". */
export type TimeZone = string & { readonly __brand?: 'TimeZone' };

export const DEFAULT_TIME_ZONE: TimeZone = 'Europe/Rome';

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

export class InvalidDateError extends Error {
  constructor(value: string) {
    super(`Data non valida: "${value}". Formato atteso YYYY-MM-DD.`);
    this.name = 'InvalidDateError';
  }
}

/** Vero se la stringa e' una data di calendario esistente. */
export function isLocalDate(value: string): value is LocalDate {
  const m = DATE_RE.exec(value);
  if (m === null) return false;
  const [, y, mo, d] = m;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > daysInMonth(year, month)) return false;
  return true;
}

export function assertLocalDate(value: string): LocalDate {
  if (!isLocalDate(value)) throw new InvalidDateError(value);
  return value;
}

/** Giorni nel mese (1-12), con anni bisestili corretti. */
export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 30;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

interface DateParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

export function toParts(date: LocalDate): DateParts {
  const m = DATE_RE.exec(date);
  if (m === null) throw new InvalidDateError(date);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

export function fromParts(year: number, month: number, day: number): LocalDate {
  const pad = (n: number, width = 2): string => String(n).padStart(width, '0');
  return assertLocalDate(`${pad(year, 4)}-${pad(month)}-${pad(day)}`);
}

/** Mezzogiorno UTC del giorno: base sicura per l'aritmetica sui giorni. */
function toUtcNoon(date: LocalDate): number {
  const { year, month, day } = toParts(date);
  return Date.UTC(year, month - 1, day, 12, 0, 0, 0);
}

function fromUtcNoon(ms: number): LocalDate {
  const d = new Date(ms);
  return fromParts(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** Somma (o sottrae) giorni di calendario. */
export function addDays(date: LocalDate, days: number): LocalDate {
  return fromUtcNoon(toUtcNoon(date) + days * MS_PER_DAY);
}

/** Differenza in giorni interi: `b - a`. */
export function diffDays(a: LocalDate, b: LocalDate): number {
  return Math.round((toUtcNoon(b) - toUtcNoon(a)) / MS_PER_DAY);
}

export function compareDates(a: LocalDate, b: LocalDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function minDate(a: LocalDate, b: LocalDate): LocalDate {
  return a <= b ? a : b;
}

export function maxDate(a: LocalDate, b: LocalDate): LocalDate {
  return a >= b ? a : b;
}

/**
 * Somma mesi di calendario, con clamp sull'ultimo giorno del mese: il 31
 * gennaio piu' un mese diventa il 28 (o 29) febbraio, non il 3 marzo.
 */
export function addMonths(date: LocalDate, months: number): LocalDate {
  const { year, month, day } = toParts(date);
  const total = year * 12 + (month - 1) + months;
  const newYear = Math.floor(total / 12);
  const newMonth = (total % 12) + 1;
  return fromParts(newYear, newMonth, Math.min(day, daysInMonth(newYear, newMonth)));
}

/**
 * Somma anni di calendario. Il 29 febbraio di un anno bisestile piu' un anno
 * diventa il 28 febbraio: e' il comportamento che serve per calcolare
 * "tre anni dalla data di avvio" su date reali (specifica §8).
 */
export function addYears(date: LocalDate, years: number): LocalDate {
  return addMonths(date, years * 12);
}

/** Giorno della settimana, 1 = lunedi' ... 7 = domenica (ISO 8601). */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export function weekday(date: LocalDate): IsoWeekday {
  const jsDay = new Date(toUtcNoon(date)).getUTCDay(); // 0 = domenica
  return (jsDay === 0 ? 7 : jsDay) as IsoWeekday;
}

export const WEEKDAY_LABEL: Record<IsoWeekday, string> = {
  1: 'Lunedi',
  2: 'Martedi',
  3: 'Mercoledi',
  4: 'Giovedi',
  5: 'Venerdi',
  6: 'Sabato',
  7: 'Domenica',
};

export const WEEKDAY_SHORT: Record<IsoWeekday, string> = {
  1: 'Lun',
  2: 'Mar',
  3: 'Mer',
  4: 'Gio',
  5: 'Ven',
  6: 'Sab',
  7: 'Dom',
};

export const MONTH_LABEL_IT: readonly string[] = [
  'gennaio',
  'febbraio',
  'marzo',
  'aprile',
  'maggio',
  'giugno',
  'luglio',
  'agosto',
  'settembre',
  'ottobre',
  'novembre',
  'dicembre',
];

/** Formatta come "19 settembre 2026". */
export function formatDateLongIt(date: LocalDate): string {
  const { year, month, day } = toParts(date);
  return `${String(day)} ${MONTH_LABEL_IT[month - 1] ?? ''} ${String(year)}`;
}

/** Formatta come "sab 19 set". */
export function formatDateShortIt(date: LocalDate): string {
  const { month, day } = toParts(date);
  const m = (MONTH_LABEL_IT[month - 1] ?? '').slice(0, 3);
  return `${WEEKDAY_SHORT[weekday(date)].toLowerCase()} ${String(day)} ${m}`;
}

/**
 * Lunedi' della settimana che contiene `date`.
 * La settimana del progetto e' lunedi'-domenica (specifica §3).
 */
export function startOfWeek(date: LocalDate): LocalDate {
  return addDays(date, -(weekday(date) - 1));
}

export function endOfWeek(date: LocalDate): LocalDate {
  return addDays(startOfWeek(date), 6);
}

export function startOfMonth(date: LocalDate): LocalDate {
  const { year, month } = toParts(date);
  return fromParts(year, month, 1);
}

export function endOfMonth(date: LocalDate): LocalDate {
  const { year, month } = toParts(date);
  return fromParts(year, month, daysInMonth(year, month));
}

/**
 * Numero di settimane di calendario (lunedi'-domenica) toccate
 * dall'intervallo chiuso [from, to].
 */
export function calendarWeeksSpanned(from: LocalDate, to: LocalDate): number {
  if (compareDates(from, to) > 0) return 0;
  const first = startOfWeek(from);
  const last = startOfWeek(to);
  return Math.round(diffDays(first, last) / 7) + 1;
}

/**
 * Orizzonte di pianificazione, calcolato su date reali.
 *
 * Tre anni NON sono 156 settimane esatte. Su date reali sono 1095 o 1096
 * giorni, a seconda che nell'intervallo cada un 29 febbraio e di come lo
 * si attraversa: cioe' 156 settimane piene PIU' 3 o 4 giorni di resto.
 * Le settimane di calendario lunedi'-domenica toccate sono 157 o 158 a
 * seconda del giorno della settimana in cui si comincia.
 *
 * Il piano si genera su {@link totalWeeks}, che arrotonda per ECCESSO: cosi'
 * l'ultima settimana di programma copre anche i giorni di resto e nessun
 * giorno dell'orizzonte resta fuori dal piano. Arrotondare per difetto
 * lascerebbe scoperti gli ultimi 3-4 giorni.
 */
export interface PlanningHorizon {
  readonly startDate: LocalDate;
  /** Primo giorno NON piu' coperto dal piano (esclusivo). */
  readonly endDateExclusive: LocalDate;
  /** Ultimo giorno coperto dal piano (inclusivo). */
  readonly lastDate: LocalDate;
  /** Giorni reali nell'intervallo: 1095 o 1096 per tre anni. */
  readonly totalDays: number;
  /**
   * Settimane di programma necessarie a coprire tutto l'orizzonte
   * (arrotondamento per eccesso). E' il numero su cui si genera il piano.
   */
  readonly totalWeeks: number;
  /** Settimane di 7 giorni interamente contenute nell'orizzonte. */
  readonly completeWeeks: number;
  /** Giorni di resto oltre le settimane piene: 3 o 4 per tre anni. */
  readonly remainderDays: number;
  /** Settimane di calendario lunedi'-domenica toccate dall'intervallo. */
  readonly calendarWeeksSpanned: number;
}

/** Calcola l'orizzonte di `years` anni a partire da `startDate`. */
export function planningHorizon(startDate: LocalDate, years = 3): PlanningHorizon {
  const start = assertLocalDate(startDate);
  const endExclusive = addYears(start, years);
  const lastDate = addDays(endExclusive, -1);
  const totalDays = diffDays(start, endExclusive);
  return {
    startDate: start,
    endDateExclusive: endExclusive,
    lastDate,
    totalDays,
    // Le settimane di programma sono contate dall'avvio, non dal lunedi':
    // la settimana 1 del programma inizia il giorno in cui Mattia inizia.
    totalWeeks: Math.ceil(totalDays / 7),
    completeWeeks: Math.floor(totalDays / 7),
    remainderDays: totalDays % 7,
    calendarWeeksSpanned: calendarWeeksSpanned(start, lastDate),
  };
}

/** Primo giorno della settimana di programma `index` (1-based). */
export function programWeekStart(startDate: LocalDate, index: number): LocalDate {
  if (!Number.isInteger(index) || index < 1) {
    throw new Error(`Indice di settimana non valido: ${String(index)} (atteso >= 1).`);
  }
  return addDays(startDate, (index - 1) * 7);
}

/**
 * Prima data `>= from` che cade in uno dei giorni indicati.
 * Usata per proporre le sedute nei giorni preferiti senza imporli.
 */
export function nextWeekdayOnOrAfter(
  from: LocalDate,
  allowed: readonly IsoWeekday[],
): LocalDate | null {
  if (allowed.length === 0) return null;
  for (let i = 0; i < 7; i += 1) {
    const candidate = addDays(from, i);
    if (allowed.includes(weekday(candidate))) return candidate;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Conversione Instant <-> LocalDate in un fuso orario
// ---------------------------------------------------------------------------

/**
 * Giorno di calendario a cui appartiene un istante, nel fuso indicato.
 * Usa `Intl`, non l'offset del dispositivo: un allenamento registrato alle
 * 00:30 resta assegnato al giorno giusto anche se il telefono e' su un altro
 * fuso o se nel frattempo e' cambiata l'ora legale.
 */
export function instantToLocalDate(instant: Instant, timeZone: TimeZone): LocalDate {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  // en-CA produce direttamente "YYYY-MM-DD".
  return assertLocalDate(fmt.format(new Date(instant)));
}

/** Ora locale "HH:MM" di un istante nel fuso indicato. */
export function instantToLocalTime(instant: Instant, timeZone: TimeZone): string {
  const fmt = new Intl.DateTimeFormat('it-IT', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return fmt.format(new Date(instant));
}

/**
 * Istante corrispondente a una data e ora locali in un fuso orario.
 *
 * Risolve l'offset per iterazione (due passaggi bastano per tutti gli offset
 * reali, inclusi quelli a 30/45 minuti). Nelle ore "impossibili" del cambio
 * d'ora restituisce l'istante immediatamente successivo al salto, che e' il
 * comportamento desiderato per un promemoria: la notifica arriva comunque.
 */
export function localDateTimeToInstant(
  date: LocalDate,
  hour: number,
  minute: number,
  timeZone: TimeZone,
): Instant {
  const { year, month, day } = toParts(date);
  const wanted = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let guess = wanted;
  for (let i = 0; i < 3; i += 1) {
    const offset = timeZoneOffsetMs(guess, timeZone);
    const next = wanted - offset;
    if (next === guess) break;
    guess = next;
  }
  return guess;
}

/** Offset del fuso (ms) valido in quell'istante, ora legale inclusa. */
export function timeZoneOffsetMs(instant: number, timeZone: TimeZone): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date(instant));
  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((p) => p.type === type)?.value ?? '0');
  // `hour12: false` puo' produrre 24 per la mezzanotte in alcuni runtime.
  const hour = get('hour') % 24;
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    hour,
    get('minute'),
    get('second'),
  );
  return asUtc - instant;
}

/**
 * Sorgenti di tempo iniettabili.
 *
 * Nessun modulo del dominio chiama `Date.now()` direttamente: i test
 * controllano il tempo, e i timer usano `monotonic()` come fonte di verita'
 * (specifica §13, "Non usare il solo setInterval come fonte di verita'").
 */
export interface Clock {
  /** Ora dell'orologio di sistema. Puo' saltare all'indietro. */
  now(): Instant;
  /** Contatore monotono. Non salta mai all'indietro. */
  monotonic(): Monotonic;
  /** Fuso orario corrente del dispositivo o quello scelto dall'utente. */
  timeZone(): TimeZone;
}

/** Orologio reale di sistema. */
export function systemClock(timeZone: TimeZone = DEFAULT_TIME_ZONE): Clock {
  return {
    now: () => Date.now(),
    monotonic: () =>
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now(),
    timeZone: () => timeZone,
  };
}

/** Orologio controllabile, per i test e per le simulazioni. */
export class FakeClock implements Clock {
  private wall: Instant;
  private mono: Monotonic;
  private zone: TimeZone;

  constructor(startInstant: Instant, timeZone: TimeZone = DEFAULT_TIME_ZONE) {
    this.wall = startInstant;
    this.mono = 0;
    this.zone = timeZone;
  }

  now(): Instant {
    return this.wall;
  }

  monotonic(): Monotonic {
    return this.mono;
  }

  timeZone(): TimeZone {
    return this.zone;
  }

  /** Avanza entrambe le sorgenti: il tempo passa normalmente. */
  advance(ms: number): void {
    if (ms < 0) throw new Error('advance() non accetta valori negativi.');
    this.wall += ms;
    this.mono += ms;
  }

  /**
   * Cambia l'orologio di sistema SENZA toccare il contatore monotono:
   * simula l'utente che sposta l'ora del telefono, o un cambio di fuso.
   */
  setWallClock(instant: Instant): void {
    this.wall = instant;
  }

  setTimeZone(zone: TimeZone): void {
    this.zone = zone;
  }
}
