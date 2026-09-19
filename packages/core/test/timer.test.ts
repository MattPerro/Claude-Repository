/**
 * Verifica dei timer (`SPEC.md` §11).
 *
 * I casi piu' importanti sono quelli in cui il timer potrebbe MENTIRE: l'app
 * sospesa a lungo, l'orologio del telefono spostato, una scadenza passata
 * senza che nessun callback sia stato eseguito. E il piu' importante di tutti:
 * il tempo che passa non deve mai far risultare eseguito qualcosa che non e'
 * stato confermato.
 */

import { describe, expect, it } from 'vitest';
import {
  adjust,
  cancel,
  decideSideRest,
  elapsedMs,
  expiresAtWall,
  FakeClock,
  intervalPosition,
  intervalTotalSeconds,
  isExpired,
  notificationNeedsReschedule,
  pause,
  reconcile,
  remainingMs,
  remainingSeconds,
  resume,
  skip,
  startTimer,
  TIMER_KIND_LABEL,
  type TimerState,
} from '@trackstrong/core';

const START: number = 1_780_000_000_000;

function newClock(): FakeClock {
  return new FakeClock(START);
}

function restTimer(clock: FakeClock, seconds = 120): TimerState {
  return startTimer({ id: 'timer-1', kind: 'rest', durationSeconds: seconds }, clock);
}

describe('Avvio e conteggio', () => {
  it('parte con la durata piena', () => {
    const clock = newClock();
    const timer = restTimer(clock);
    expect(remainingSeconds(timer, clock)).toBe(120);
    expect(timer.status).toBe('running');
    expect(elapsedMs(timer, clock)).toBe(0);
  });

  it('conta il tempo che passa', () => {
    const clock = newClock();
    const timer = restTimer(clock);
    clock.advance(30_000);
    expect(remainingSeconds(timer, clock)).toBe(90);
    expect(elapsedMs(timer, clock)).toBe(30_000);
  });

  it('non scende sotto zero', () => {
    const clock = newClock();
    const timer = restTimer(clock);
    clock.advance(500_000);
    expect(remainingMs(timer, clock)).toBe(0);
    expect(remainingSeconds(timer, clock)).toBe(0);
  });

  it('rifiuta una durata negativa', () => {
    const clock = newClock();
    expect(() => startTimer({ id: 'x', kind: 'rest', durationSeconds: -1 }, clock)).toThrow();
  });

  it('ha etichette italiane per ogni tipo di timer', () => {
    expect(TIMER_KIND_LABEL.rest).toBe('Recupero');
    expect(TIMER_KIND_LABEL.interval).toBe('Intervalli');
    expect(TIMER_KIND_LABEL.session).toBe('Durata seduta');
  });
});

describe('Sospensione dell app: il residuo resta coerente (SPEC §11)', () => {
  it('dopo una sospensione lunga il tempo rimanente e corretto', () => {
    const clock = newClock();
    const timer = restTimer(clock, 120);
    // L'app viene sospesa per 45 secondi: nessun tick viene eseguito.
    clock.advance(45_000);
    expect(remainingSeconds(timer, clock)).toBe(75);
  });

  it('un recupero scaduto durante la sospensione risulta terminato', () => {
    const clock = newClock();
    const timer = restTimer(clock, 120);
    clock.advance(30 * 60_000); // mezz'ora
    expect(isExpired(timer, clock)).toBe(true);
    const reconciled = reconcile(timer, clock);
    expect(reconciled.status).toBe('expired');
    expect(remainingMs(reconciled, clock)).toBe(0);
  });

  it('la riconciliazione non riavvia e non azzera un timer ancora in corso', () => {
    const clock = newClock();
    const timer = restTimer(clock, 120);
    clock.advance(30_000);
    const reconciled = reconcile(timer, clock);
    expect(reconciled).toBe(timer); // nessuna modifica
    expect(remainingSeconds(reconciled, clock)).toBe(90);
  });

  it('lo stato e interamente serializzabile, quindi persistibile', () => {
    const clock = newClock();
    const timer = restTimer(clock, 120);
    clock.advance(20_000);
    const roundTripped = JSON.parse(JSON.stringify(timer)) as TimerState;
    expect(remainingSeconds(roundTripped, clock)).toBe(remainingSeconds(timer, clock));
  });
});

describe('Cambio dell orologio di sistema (SPEC §11)', () => {
  it('un orologio spostato indietro non allunga il recupero', () => {
    const clock = newClock();
    const timer = restTimer(clock, 120);
    clock.advance(30_000);
    expect(remainingSeconds(timer, clock)).toBe(90);

    // L'utente sposta l'ora del telefono un'ora INDIETRO.
    clock.setWallClock(START - 3_600_000);
    // La base monotona non e' stata toccata: il residuo resta 90 s.
    expect(remainingSeconds(timer, clock)).toBe(90);
  });

  it('un orologio spostato avanti non accorcia il recupero sotto la misura monotona', () => {
    const clock = newClock();
    const timer = restTimer(clock, 120);
    clock.advance(10_000);
    // Orologio spostato un'ora AVANTI: il sistema crede che sia passata un'ora.
    clock.setWallClock(START + 10_000 + 3_600_000);
    // Si usa la misura piu' prudente fra le due, cioe' la maggiore: il timer
    // risulta scaduto. Per un recupero e' la scelta sicura (non spinge a
    // ricominciare troppo presto).
    expect(isExpired(timer, clock)).toBe(true);
  });

  it('dopo un cambio d orologio la notifica va riprogrammata', () => {
    const clock = newClock();
    const timer = restTimer(clock, 120);
    const scheduled = expiresAtWall(timer, clock);
    expect(notificationNeedsReschedule(timer, scheduled, clock)).toBe(false);

    clock.setWallClock(START + 600_000);
    expect(notificationNeedsReschedule(timer, scheduled, clock)).toBe(true);
  });

  it('una modifica manuale richiede la riprogrammazione della notifica', () => {
    const clock = newClock();
    const timer = restTimer(clock, 120);
    const scheduled = expiresAtWall(timer, clock);
    const adjusted = adjust(timer, 15);
    expect(notificationNeedsReschedule(adjusted, scheduled, clock)).toBe(true);
  });

  it('un tick normale non richiede di riprogrammare la notifica', () => {
    const clock = newClock();
    const timer = restTimer(clock, 120);
    const scheduled = expiresAtWall(timer, clock);
    clock.advance(1000);
    // La scadenza attesa e' invariata: nessuna riprogrammazione a ogni secondo.
    expect(notificationNeedsReschedule(timer, scheduled, clock)).toBe(false);
  });

  it('un timer in pausa non ha una scadenza da notificare', () => {
    const clock = newClock();
    const paused = pause(restTimer(clock, 120), clock);
    expect(expiresAtWall(paused, clock)).toBeNull();
    expect(notificationNeedsReschedule(paused, START + 120_000, clock)).toBe(true);
  });
});

describe('Pausa, ripresa, modifica, salto, annullamento (SPEC §11)', () => {
  it('la pausa congela il residuo', () => {
    const clock = newClock();
    let timer = restTimer(clock, 120);
    clock.advance(30_000);
    timer = pause(timer, clock);
    expect(timer.status).toBe('paused');

    clock.advance(600_000); // dieci minuti in pausa
    expect(remainingSeconds(timer, clock)).toBe(90);
    expect(isExpired(timer, clock)).toBe(false);
  });

  it('la ripresa riparte dal residuo congelato', () => {
    const clock = newClock();
    let timer = restTimer(clock, 120);
    clock.advance(30_000);
    timer = pause(timer, clock);
    clock.advance(600_000);
    timer = resume(timer, clock);
    expect(timer.status).toBe('running');
    clock.advance(30_000);
    expect(remainingSeconds(timer, clock)).toBe(60);
  });

  it('pause e riprese ripetute non perdono ne inventano tempo', () => {
    const clock = newClock();
    let timer = restTimer(clock, 120);
    for (let i = 0; i < 5; i += 1) {
      clock.advance(10_000);
      timer = pause(timer, clock);
      clock.advance(60_000); // tempo in pausa: non conta
      timer = resume(timer, clock);
    }
    expect(elapsedMs(timer, clock)).toBe(50_000);
    expect(remainingSeconds(timer, clock)).toBe(70);
  });

  it('mettere in pausa un timer gia in pausa non cambia niente', () => {
    const clock = newClock();
    const paused = pause(restTimer(clock, 120), clock);
    expect(pause(paused, clock)).toBe(paused);
    const running = restTimer(clock, 120);
    expect(resume(running, clock)).toBe(running);
  });

  it('i comandi +15 e -15 secondi funzionano e restano tracciati', () => {
    const clock = newClock();
    let timer = restTimer(clock, 120);
    timer = adjust(timer, 15);
    expect(remainingSeconds(timer, clock)).toBe(135);
    expect(timer.manualAdjustmentMs).toBe(15_000);

    timer = adjust(timer, -15);
    expect(remainingSeconds(timer, clock)).toBe(120);
    expect(timer.manualAdjustmentMs).toBe(0);

    // La durata configurata non viene riscritta: resta ispezionabile.
    expect(timer.durationMs).toBe(120_000);
  });

  it('togliere troppi secondi non produce una durata negativa', () => {
    const clock = newClock();
    const timer = adjust(restTimer(clock, 60), -300);
    expect(remainingMs(timer, clock)).toBe(0);
  });

  it('salta porta il timer a scaduto', () => {
    const clock = newClock();
    clock.advance(0);
    const skipped = skip(restTimer(clock, 120), clock);
    expect(skipped.status).toBe('expired');
    expect(isExpired(skipped, clock)).toBe(true);
  });

  it('annulla non e la stessa cosa di scaduto', () => {
    const clock = newClock();
    const cancelled = cancel(restTimer(clock, 120), clock);
    expect(cancelled.status).toBe('cancelled');
    // Un timer annullato non e' "finito": non deve far suonare niente ne'
    // mostrare "recupero terminato".
    expect(isExpired(cancelled, clock)).toBe(false);
    clock.advance(600_000);
    expect(isExpired(cancelled, clock)).toBe(false);
  });
});

describe('Il tempo non dimostra l esecuzione (SPEC §11)', () => {
  it('il modulo dei timer non ha alcun modo di completare una serie', () => {
    const clock = newClock();
    const timer = restTimer(clock, 1);
    clock.advance(10_000);
    const reconciled = reconcile(timer, clock);

    // Lo stato di un timer contiene SOLO informazioni sul tempo: nessun campo
    // che possa segnare una serie o un cardio come eseguito.
    const keys = Object.keys(reconciled);
    for (const forbidden of ['completed', 'reps', 'seconds', 'confirmed', 'sets', 'load']) {
      expect(keys).not.toContain(forbidden);
    }
    expect(reconciled.status).toBe('expired');
  });

  it('il conteggio dei cicli di intervalli e tempo trascorso, non conferma', () => {
    const plan = { warmupSeconds: 180, rounds: 6, hardSeconds: 30, easySeconds: 60, cooldownSeconds: 180 };
    const position = intervalPosition(plan, 900);
    // Il campo si chiama `roundsElapsed`, non `roundsCompleted`: la conferma
    // dell'esecuzione e' un'altra cosa (PerformedCardio.confirmed).
    expect(position).toHaveProperty('roundsElapsed');
    expect(position).not.toHaveProperty('roundsCompleted');
    expect(position).not.toHaveProperty('confirmed');
  });
});

describe('Timer a intervalli (SPEC §3.9)', () => {
  // La struttura della specifica: 3 min + 6 x (30 s + 60 s) + 3 min = 15 min.
  const plan = {
    warmupSeconds: 180,
    rounds: 6,
    hardSeconds: 30,
    easySeconds: 60,
    cooldownSeconds: 180,
  };

  it('dura in tutto 15 minuti', () => {
    expect(intervalTotalSeconds(plan)).toBe(900);
  });

  it('riconosce il riscaldamento', () => {
    const p = intervalPosition(plan, 0);
    expect(p.phase).toBe('warmup');
    expect(p.remainingInPhaseSeconds).toBe(180);
    expect(p.remainingTotalSeconds).toBe(900);
    expect(p.roundsElapsed).toBe(0);
  });

  it('entra nel primo tratto sostenuto alla fine del riscaldamento', () => {
    const p = intervalPosition(plan, 180);
    expect(p.phase).toBe('hard');
    expect(p.round).toBe(1);
    expect(p.remainingInPhaseSeconds).toBe(30);
  });

  it('passa al tratto facile dopo 30 secondi sostenuti', () => {
    const p = intervalPosition(plan, 180 + 30);
    expect(p.phase).toBe('easy');
    expect(p.round).toBe(1);
    expect(p.remainingInPhaseSeconds).toBe(60);
  });

  it('conta i cicli correttamente', () => {
    // Inizio del quarto ciclo.
    const p = intervalPosition(plan, 180 + 3 * 90);
    expect(p.phase).toBe('hard');
    expect(p.round).toBe(4);
    expect(p.roundsElapsed).toBe(3);
  });

  it('entra nel defaticamento dopo il sesto ciclo', () => {
    const p = intervalPosition(plan, 180 + 6 * 90);
    expect(p.phase).toBe('cooldown');
    expect(p.remainingInPhaseSeconds).toBe(180);
    expect(p.roundsElapsed).toBe(6);
  });

  it('finisce a 15 minuti', () => {
    const p = intervalPosition(plan, 900);
    expect(p.phase).toBe('done');
    expect(p.remainingTotalSeconds).toBe(0);
  });

  it('non va oltre la fine ne prima dell inizio', () => {
    expect(intervalPosition(plan, 5000).phase).toBe('done');
    expect(intervalPosition(plan, -100).phase).toBe('warmup');
  });
});

describe('Recuperi per gli esercizi unilaterali (SPEC §11)', () => {
  it('per lo step-up il recupero parte dopo entrambe le gambe', () => {
    const first = decideSideRest({
      perSide: true,
      restAfterBothSides: true,
      completedSide: 'left',
      otherSideDone: false,
    });
    expect(first.startMainRest).toBe(false);
    expect(first.nextSide).toBe('right');
    expect(first.message).toContain('dopo entrambi i lati');

    const second = decideSideRest({
      perSide: true,
      restAfterBothSides: true,
      completedSide: 'right',
      otherSideDone: true,
    });
    expect(second.startMainRest).toBe(true);
    expect(second.nextSide).toBeNull();
  });

  it('per gli altri esercizi per lato il recupero parte dopo ogni lato', () => {
    const decision = decideSideRest({
      perSide: true,
      restAfterBothSides: false,
      completedSide: 'left',
      otherSideDone: false,
    });
    expect(decision.startMainRest).toBe(true);
    expect(decision.nextSide).toBe('right');
  });

  it('per gli esercizi bilaterali il recupero parte subito', () => {
    const decision = decideSideRest({
      perSide: false,
      restAfterBothSides: false,
      completedSide: 'both',
      otherSideDone: false,
    });
    expect(decision.startMainRest).toBe(true);
    expect(decision.nextSide).toBeNull();
  });
});
