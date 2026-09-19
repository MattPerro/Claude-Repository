/**
 * Date, settimane, fusi orari e orologi.
 *
 * Questi test coprono i casi che rompono silenziosamente un calendario: ora
 * legale, anni bisestili, fine mese, cambio manuale dell'orologio.
 */

import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  addYears,
  calendarWeeksSpanned,
  compareDates,
  daysInMonth,
  diffDays,
  endOfMonth,
  endOfWeek,
  FakeClock,
  formatDateLongIt,
  formatDateShortIt,
  instantToLocalDate,
  instantToLocalTime,
  isLeapYear,
  isLocalDate,
  localDateTimeToInstant,
  maxDate,
  minDate,
  nextWeekdayOnOrAfter,
  programWeekStart,
  startOfMonth,
  startOfWeek,
  timeZoneOffsetMs,
  weekday,
  WEEKDAY_LABEL,
  type IsoWeekday,
} from '@trackstrong/core';

describe('Validazione delle date', () => {
  it('accetta date esistenti', () => {
    for (const d of ['2026-01-01', '2024-02-29', '2026-12-31']) {
      expect(isLocalDate(d)).toBe(true);
    }
  });

  it('rifiuta date inesistenti o malformate', () => {
    for (const d of ['2026-02-30', '2027-02-29', '2026-13-01', '2026-00-10', '26-01-01', '2026-1-1', 'oggi', '']) {
      expect(isLocalDate(d)).toBe(false);
    }
  });
});

describe('Anni bisestili', () => {
  it('riconosce le regole dei secoli', () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2027)).toBe(false);
    expect(isLeapYear(1900)).toBe(false); // divisibile per 100 ma non per 400
    expect(isLeapYear(2000)).toBe(true); // divisibile per 400
  });

  it('conta i giorni di febbraio correttamente', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2027, 2)).toBe(28);
    expect(daysInMonth(2026, 1)).toBe(31);
    expect(daysInMonth(2026, 4)).toBe(30);
  });
});

describe('Aritmetica sui giorni', () => {
  it('somma e sottrae giorni attraverso i mesi e gli anni', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
  });

  it('non scivola di un giorno al cambio dell ora legale', () => {
    // In Italia l'ora legale entra l'ultima domenica di marzo ed esce
    // l'ultima di ottobre. L'aritmetica passa da mezzogiorno UTC, quindi
    // questi passaggi non spostano il giorno.
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
    expect(addDays('2026-10-24', 1)).toBe('2026-10-25');
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26');
    expect(diffDays('2026-03-28', '2026-03-30')).toBe(2);
    expect(diffDays('2026-10-24', '2026-10-26')).toBe(2);
  });

  it('calcola differenze simmetriche', () => {
    expect(diffDays('2026-01-01', '2026-01-11')).toBe(10);
    expect(diffDays('2026-01-11', '2026-01-01')).toBe(-10);
    expect(diffDays('2026-01-01', '2026-01-01')).toBe(0);
  });

  it('confronta e ordina le date', () => {
    expect(compareDates('2026-01-01', '2026-01-02')).toBe(-1);
    expect(compareDates('2026-01-02', '2026-01-01')).toBe(1);
    expect(compareDates('2026-01-01', '2026-01-01')).toBe(0);
    expect(minDate('2026-05-01', '2026-01-01')).toBe('2026-01-01');
    expect(maxDate('2026-05-01', '2026-01-01')).toBe('2026-05-01');
  });
});

describe('Aritmetica su mesi e anni', () => {
  it('limita al giorno esistente invece di sforare nel mese dopo', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
  });

  it('gestisce il 29 febbraio sommando anni', () => {
    expect(addYears('2024-02-29', 1)).toBe('2025-02-28');
    expect(addYears('2024-02-29', 4)).toBe('2028-02-29');
    expect(addYears('2024-02-29', 3)).toBe('2027-02-28');
  });
});

describe('Settimana lunedi-domenica (SPEC §2)', () => {
  it('riconosce i giorni della settimana', () => {
    expect(weekday('2026-09-21')).toBe(1); // lunedi'
    expect(weekday('2026-09-27')).toBe(7); // domenica
    expect(WEEKDAY_LABEL[weekday('2026-09-21')]).toBe('Lunedi');
  });

  it('la settimana inizia il lunedi e finisce la domenica', () => {
    expect(startOfWeek('2026-09-24')).toBe('2026-09-21'); // giovedi' -> lunedi'
    expect(endOfWeek('2026-09-24')).toBe('2026-09-27');
    expect(startOfWeek('2026-09-27')).toBe('2026-09-21'); // domenica: stessa settimana
    expect(startOfWeek('2026-09-21')).toBe('2026-09-21');
  });

  it('calcola i confini del mese', () => {
    expect(startOfMonth('2026-09-15')).toBe('2026-09-01');
    expect(endOfMonth('2026-09-15')).toBe('2026-09-30');
    expect(endOfMonth('2024-02-10')).toBe('2024-02-29');
  });

  it('conta le settimane di calendario toccate da un intervallo', () => {
    // Lunedi' -> domenica della stessa settimana: 1.
    expect(calendarWeeksSpanned('2026-09-21', '2026-09-27')).toBe(1);
    // Domenica -> lunedi' successivo: 2 settimane toccate.
    expect(calendarWeeksSpanned('2026-09-27', '2026-09-28')).toBe(2);
    expect(calendarWeeksSpanned('2026-09-28', '2026-09-21')).toBe(0); // intervallo vuoto
  });

  it('trova il prossimo giorno preferito', () => {
    const preferred: readonly IsoWeekday[] = [1, 4]; // lunedi' e giovedi'
    expect(nextWeekdayOnOrAfter('2026-09-21', preferred)).toBe('2026-09-21'); // e' lunedi'
    expect(nextWeekdayOnOrAfter('2026-09-22', preferred)).toBe('2026-09-24'); // giovedi'
    expect(nextWeekdayOnOrAfter('2026-09-25', preferred)).toBe('2026-09-28'); // lunedi' dopo
    expect(nextWeekdayOnOrAfter('2026-09-21', [])).toBeNull();
  });

  it('calcola l inizio di una settimana di programma', () => {
    expect(programWeekStart('2026-09-21', 1)).toBe('2026-09-21');
    expect(programWeekStart('2026-09-21', 2)).toBe('2026-09-28');
    expect(programWeekStart('2026-09-21', 13)).toBe('2026-12-14');
    expect(() => programWeekStart('2026-09-21', 0)).toThrow();
  });
});

describe('Formattazione italiana delle date', () => {
  it('scrive la data lunga', () => {
    expect(formatDateLongIt('2026-09-19')).toBe('19 settembre 2026');
    expect(formatDateLongIt('2026-01-01')).toBe('1 gennaio 2026');
  });

  it('scrive la data breve con il giorno della settimana', () => {
    expect(formatDateShortIt('2026-09-21')).toBe('lun 21 set');
  });
});

describe('Fusi orari e ora legale', () => {
  const ROME = 'Europe/Rome';

  it('assegna un istante al giorno di calendario corretto nel fuso indicato', () => {
    // 2026-01-15 23:30 UTC = 2026-01-16 00:30 a Roma: giorno diverso.
    const instant = Date.UTC(2026, 0, 15, 23, 30);
    expect(instantToLocalDate(instant, ROME)).toBe('2026-01-16');
    expect(instantToLocalDate(instant, 'UTC')).toBe('2026-01-15');
  });

  it('riconosce l offset di ora solare e di ora legale', () => {
    expect(timeZoneOffsetMs(Date.UTC(2026, 0, 15, 12), ROME)).toBe(3_600_000); // +1
    expect(timeZoneOffsetMs(Date.UTC(2026, 6, 15, 12), ROME)).toBe(7_200_000); // +2
  });

  it('converte data e ora locali in istante, in entrambi i regimi', () => {
    const winter = localDateTimeToInstant('2026-01-15', 18, 0, ROME);
    expect(instantToLocalTime(winter, ROME)).toBe('18:00');
    const summer = localDateTimeToInstant('2026-07-15', 18, 0, ROME);
    expect(instantToLocalTime(summer, ROME)).toBe('18:00');
    // Lo stesso orario locale corrisponde a istanti UTC diversi.
    expect(winter - Date.UTC(2026, 0, 15, 18)).toBe(-3_600_000);
    expect(summer - Date.UTC(2026, 6, 15, 18)).toBe(-7_200_000);
  });

  it('un promemoria nell ora che non esiste viene comunque programmato', () => {
    // In Italia nella notte del 29 marzo 2026 le 02:00-03:00 non esistono.
    // La conversione non deve produrre NaN: la notifica arriva comunque.
    const instant = localDateTimeToInstant('2026-03-29', 2, 30, ROME);
    expect(Number.isFinite(instant)).toBe(true);
    expect(instantToLocalDate(instant, ROME)).toBe('2026-03-29');
  });

  it('gestisce un fuso con offset non intero', () => {
    const instant = localDateTimeToInstant('2026-01-15', 12, 0, 'Asia/Kolkata'); // +5:30
    expect(instantToLocalTime(instant, 'Asia/Kolkata')).toBe('12:00');
  });
});

describe('Orologio iniettabile (SPEC §11)', () => {
  it('avanza insieme orologio di sistema e base monotona', () => {
    const clock = new FakeClock(1_000_000);
    clock.advance(5000);
    expect(clock.now()).toBe(1_005_000);
    expect(clock.monotonic()).toBe(5000);
  });

  it('un cambio manuale dell orologio non tocca la base monotona', () => {
    // E' la proprieta' su cui si appoggiano i timer: se l'utente sposta
    // l'ora del telefono, il recupero non salta.
    const clock = new FakeClock(1_000_000);
    clock.advance(10_000);
    const monoBefore = clock.monotonic();
    clock.setWallClock(500_000); // orologio spostato INDIETRO
    expect(clock.now()).toBe(500_000);
    expect(clock.monotonic()).toBe(monoBefore);
    clock.advance(1000);
    expect(clock.monotonic()).toBe(monoBefore + 1000);
  });

  it('la base monotona non torna mai indietro', () => {
    const clock = new FakeClock(1_000_000);
    let previous = clock.monotonic();
    for (const step of [100, 0, 5000, 1]) {
      clock.advance(step);
      const current = clock.monotonic();
      expect(current).toBeGreaterThanOrEqual(previous);
      previous = current;
    }
  });

  it('rifiuta di far scorrere il tempo all indietro', () => {
    const clock = new FakeClock(1_000_000);
    expect(() => clock.advance(-1)).toThrow();
  });
});
