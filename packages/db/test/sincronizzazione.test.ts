/**
 * Coda di sincronizzazione, idempotenza, cursore, conflitti, timer, cursore
 * di programma. Sono i repository di supporto: qui si verifica che rispettino
 * le regole di §8 e §11.
 */

import { describe, expect, it } from 'vitest';

import { openTestDb, T0 } from './helpers.js';

describe('coda delle operazioni', () => {
  it('le operazioni restano in coda finche\' non sono dichiarate inviate', () => {
    const ctx = openTestDb();
    const primaCoda = ctx.repos.sync.pendingCount();
    const misura = ctx.repos.measurements.record({
      kind: 'weightKg',
      value: 88.2,
      measuredOn: '2027-03-02',
      recordedAt: T0,
    });
    expect(ctx.repos.sync.pendingCount()).toBe(primaCoda + 1);

    const inCoda = ctx.repos.sync.pendingOperations();
    const mia = inCoda.find((op) => op.entityId === misura.id);
    expect(mia).toBeDefined();
    expect(mia?.sentAt).toBeNull();

    const segnate = ctx.repos.sync.markSent([mia?.id ?? ''], 'pacchetto-prova-1', T0 + 5_000);
    expect(segnate).toBe(1);
    expect(ctx.repos.sync.pendingOperations().some((op) => op.id === mia?.id)).toBe(false);
    ctx.close();
  });

  it('un tentativo fallito non perde l\'operazione', () => {
    const ctx = openTestDb();
    ctx.repos.measurements.record({
      kind: 'weightKg',
      value: 88,
      measuredOn: '2027-03-02',
      recordedAt: T0,
    });
    const operazione = ctx.repos.sync.pendingOperations()[0];
    expect(operazione).toBeDefined();

    ctx.repos.sync.recordAttemptFailure([operazione?.id ?? ''], 'rete non disponibile');
    const dopo = ctx.repos.sync.pendingOperations().find((op) => op.id === operazione?.id);
    expect(dopo?.attemptCount).toBe(1);
    expect(dopo?.lastError).toBe('rete non disponibile');
    expect(dopo?.sentAt).toBeNull();
    ctx.close();
  });
});

describe('idempotenza delle operazioni remote', () => {
  it('applicare due volte la stessa operazione remota scrive una volta sola', () => {
    const ctx = openTestDb();
    const applica = (): { applied: boolean } =>
      ctx.repos.sync.applyRemote({
        operationId: 'op-remota-1',
        originDeviceId: 'altro-telefono',
        entity: 'measurements',
        entityId: 'misura-remota-1',
        kind: 'upsert',
        appliedAt: T0 + 1_000,
        advanceCursorTo: 'cursore-2',
        write: (write) => {
          write.run(
            `INSERT INTO measurements (id, workspace_id, kind, value, measured_on,
               recorded_at, revision, updated_at)
             VALUES ('misura-remota-1', ?, 'weightKg', 89.9, '2027-03-05', ?, 1, ?)
             ON CONFLICT(id) DO UPDATE SET value = excluded.value`,
            [ctx.db.workspaceId, T0, T0],
          );
        },
      });

    expect(applica().applied).toBe(true);
    // Ricezione ripetuta: no-op, non un errore (§8).
    expect(applica().applied).toBe(false);

    expect(ctx.repos.sync.isApplied('op-remota-1')).toBe(true);
    const righe = ctx.db.driver.get<{ n: number }>(
      'SELECT COUNT(*) AS n FROM measurements WHERE id = ?',
      ['misura-remota-1'],
    );
    expect(righe?.n).toBe(1);
    expect(ctx.repos.sync.state()?.remoteCursor).toBe('cursore-2');
    ctx.close();
  });

  it('se la scrittura remota fallisce, il cursore NON avanza', () => {
    const ctx = openTestDb();
    ctx.repos.sync.setCursor('cursore-1', T0);

    expect(() =>
      ctx.repos.sync.applyRemote({
        operationId: 'op-remota-2',
        originDeviceId: 'altro-telefono',
        entity: 'sessions',
        entityId: 'seduta-remota',
        kind: 'upsert',
        appliedAt: T0,
        advanceCursorTo: 'cursore-99',
        write: (write) => {
          // Riferimento inesistente: la scrittura fallisce davvero.
          write.run(
            `INSERT INTO sessions (id, workspace_id, planned_date, slot, status,
               prescription_snapshot, plan_version, week_index, block_id, paused_ms,
               revision, updated_at)
             VALUES ('seduta-remota', 'archivio-inesistente', '2027-03-05', 'A', 'planned',
                     '{}', 1, 1, 'b1', 0, 1, ?)`,
            [T0],
          );
        },
      }),
    ).toThrowError(/FOREIGN KEY constraint failed/);

    // "Non avanzare il cursore prima di aver persistito i dati" (§8).
    expect(ctx.repos.sync.state()?.remoteCursor).toBe('cursore-1');
    expect(ctx.repos.sync.isApplied('op-remota-2')).toBe(false);
    ctx.close();
  });
});

describe('conflitti', () => {
  it('conserva entrambe le alternative e non ne scarta nessuna in silenzio', () => {
    const ctx = openTestDb();
    // Il caso dell'esempio in §8.2: la stessa serie a 8 su un dispositivo e
    // a 10 sull'altro.
    const conflitto = ctx.repos.sync.recordConflict({
      entity: 'performed_sets',
      entityId: 'serie-contesa',
      kind: 'updateUpdate',
      localPayload: { reps: 8 },
      remotePayload: { reps: 10 },
      localRevision: 2,
      remoteRevision: 2,
      detectedAt: T0,
      remoteOriginDeviceId: 'altro-telefono',
    });

    expect(conflitto.resolution).toBe('pending');
    expect(conflitto.localPayload).toEqual({ reps: 8 });
    expect(conflitto.remotePayload).toEqual({ reps: 10 });
    expect(ctx.repos.sync.openConflicts()).toHaveLength(1);

    const risolto = ctx.repos.sync.resolveConflict(
      conflitto.id,
      'keepRemote',
      T0 + 1_000,
      { reps: 10 },
      'scelta dell\'utente',
    );
    expect(risolto.resolution).toBe('keepRemote');
    expect(ctx.repos.sync.openConflicts()).toHaveLength(0);
    // Risolvere due volte lo stesso conflitto e' un errore, non un no-op
    // silenzioso.
    expect(() => ctx.repos.sync.resolveConflict(conflitto.id, 'keepLocal', T0 + 2_000)).toThrowError(
      /gia' risolto/,
    );
    ctx.close();
  });
});

describe('timer persistiti', () => {
  it('la verita\' e\' la scadenza salvata, non un contatore in memoria', () => {
    const ctx = openTestDb();
    const timer = ctx.repos.timers.start({
      kind: 'rest',
      durationSeconds: 120,
      startedAt: T0,
      monotonicBase: 0,
    });
    expect(timer.expiresAt).toBe(T0 + 120_000);
    expect(ctx.repos.timers.remainingMs(timer, T0 + 30_000)).toBe(90_000);

    // L'app e' stata chiusa per dieci minuti: al rientro il recupero e'
    // scaduto, e NESSUNA serie viene completata automaticamente.
    const scaduti = ctx.repos.timers.reconcile(T0 + 600_000);
    expect(scaduti.map((t) => t.id)).toContain(timer.id);
    expect(ctx.repos.timers.byId(timer.id)?.status).toBe('expired');
    expect(ctx.db.driver.get<{ n: number }>('SELECT COUNT(*) AS n FROM performed_sets')?.n).toBe(0);
    ctx.close();
  });

  it('pausa e ripresa ricalcolano la scadenza', () => {
    const ctx = openTestDb();
    const timer = ctx.repos.timers.start({ kind: 'rest', durationSeconds: 90, startedAt: T0 });
    const inPausa = ctx.repos.timers.pause(timer.id, T0 + 30_000);
    expect(inPausa.status).toBe('paused');
    expect(inPausa.remainingMsAtPause).toBe(60_000);
    // Durante la pausa il tempo rimanente non scende.
    expect(ctx.repos.timers.remainingMs(inPausa, T0 + 300_000)).toBe(60_000);

    const ripreso = ctx.repos.timers.resume(timer.id, T0 + 300_000);
    expect(ripreso.status).toBe('running');
    expect(ripreso.expiresAt).toBe(T0 + 360_000);
    ctx.close();
  });
});

describe('cursore del programma', () => {
  it('avanza solo quando lo si dice, e ripetere non e\' avanzare', () => {
    const ctx = openTestDb();
    const iniziale = ctx.repos.program.initCursor(1, '2027-03-01');
    expect(iniziale.weekIndex).toBe(1);
    expect(iniziale.completedSlots).toEqual([]);

    ctx.repos.program.markSlotCompleted('A');
    const dopoA = ctx.repos.program.cursor();
    expect(dopoA?.completedSlots).toEqual(['A']);
    // Registrare due volte lo stesso slot non lo duplica.
    ctx.repos.program.markSlotCompleted('A');
    expect(ctx.repos.program.cursor()?.completedSlots).toEqual(['A']);
    // Una seduta completata non fa avanzare la settimana da sola.
    expect(ctx.repos.program.cursor()?.weekIndex).toBe(1);

    const ripetuta = ctx.repos.program.repeatWeek('2027-03-08');
    expect(ripetuta.weekIndex).toBe(1);
    expect(ripetuta.repetitionCount).toBe(1);
    expect(ripetuta.completedSlots).toEqual([]);

    const avanzata = ctx.repos.program.advanceWeek('2027-03-15');
    expect(avanzata.weekIndex).toBe(2);
    expect(avanzata.repetitionCount).toBe(0);
    ctx.close();
  });
});

describe('proposte del coach', () => {
  it('salvare una proposta non la applica e la decisione resta nello storico', () => {
    const ctx = openTestDb();
    const proposta = ctx.repos.proposals.save({
      source: 'adaptiveEngine',
      createdAt: T0,
      title: 'Aumento di prova',
      reason: 'Due esposizioni al limite superiore con RIR dichiarato.',
      change: {
        kind: 'increaseLoad',
        exerciseId: 'es-prova-1',
        fromKg: 60,
        toKg: 65,
        equipmentInstanceId: ctx.pressAId,
      },
      evidence: [],
      missingInformation: [],
      reevaluateOn: '2027-03-08',
      basePlanVersion: 1,
      requiresExplicitConfirmation: false,
    });
    expect(proposta.decision).toBe('pending');
    expect(ctx.repos.proposals.pending()).toHaveLength(1);

    ctx.repos.proposals.decide({
      proposalId: proposta.id,
      decision: 'accepted',
      decidedAt: T0 + 1_000,
      applied: true,
    });
    ctx.repos.proposals.decide({
      proposalId: proposta.id,
      decision: 'undone',
      decidedAt: T0 + 2_000,
      note: 'ripensamento',
    });

    // Due fatti distinti, non uno stato sovrascritto.
    const storico = ctx.repos.proposals.decisions(proposta.id);
    expect(storico.map((d) => d.decision)).toEqual(['accepted', 'undone']);
    expect(ctx.repos.proposals.byId(proposta.id)?.decision).toBe('undone');
    expect(ctx.repos.proposals.byDecision('undone')).toHaveLength(1);
    ctx.close();
  });

  it('una proposta obsoleta viene marcata come superata', () => {
    const ctx = openTestDb();
    ctx.repos.proposals.save({
      source: 'adaptiveEngine',
      createdAt: T0,
      title: 'Proposta su un piano ormai superato',
      reason: 'Motivo sintetico.',
      change: { kind: 'hold', exerciseId: 'es-prova-1' },
      evidence: [],
      missingInformation: [],
      reevaluateOn: '2027-03-08',
      basePlanVersion: 1,
      requiresExplicitConfirmation: false,
    });
    const quante = ctx.repos.proposals.supersedeOlderThan(2, T0 + 5_000);
    expect(quante).toBe(1);
    expect(ctx.repos.proposals.pending()).toHaveLength(0);
    expect(ctx.repos.proposals.byDecision('superseded')).toHaveLength(1);
    ctx.close();
  });
});
