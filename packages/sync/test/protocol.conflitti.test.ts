/**
 * Conflitti (specifica §8.2).
 *
 * La proprieta' verificata in tutti i casi e' la stessa: **nessuna modifica
 * viene scartata in silenzio**. Quando le due versioni non si possono unire, il
 * conflitto diventa visibile e la scelta resta all'utente.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryDriveBackend } from '../src/testing/index.js';
import { makeDevice, operationFactory, publishBundle, ulidFactory, type Device } from './harness.js';

/** Scambio completo fra due dispositivi: entrambi inviano e ricevono. */
async function scambia(a: Device, b: Device): Promise<void> {
  await a.engine.push();
  await b.engine.push();
  await a.engine.pull();
  await b.engine.pull();
}

describe('conflitti', () => {
  let backend: InMemoryDriveBackend;
  let telefono: Device;
  let tablet: Device;

  beforeEach(async () => {
    backend = new InMemoryDriveBackend();
    telefono = makeDevice({ deviceId: 'dev-telefono', backend });
    tablet = makeDevice({ deviceId: 'dev-tablet', backend });
    // Entrambi partono allineati su un archivio vuoto.
    await telefono.engine.bootstrap();
    await tablet.engine.bootstrap();
  });

  it('conserva entrambe le modifiche di due dispositivi offline indipendenti', async () => {
    // (a) Entita' diverse: una nuova pesata e un nuovo allenamento.
    telefono.drive.goOffline();
    tablet.drive.goOffline();
    await telefono.engine.recordLocalChange({
      entityType: 'bodyMeasurement',
      entityId: 'mis-1',
      kind: 'upsert',
      payload: { bodyweightKg: 79.8, waistCm: 92 },
    });
    await tablet.engine.recordLocalChange({
      entityType: 'session',
      entityId: 'ses-1',
      kind: 'upsert',
      payload: { status: 'completed', slot: 'B' },
    });
    telefono.drive.goOnline();
    tablet.drive.goOnline();
    await scambia(telefono, tablet);

    for (const dispositivo of [telefono, tablet]) {
      expect((await dispositivo.store.readEntity('bodyMeasurement', 'mis-1'))?.fields['bodyweightKg']).toBe(79.8);
      expect((await dispositivo.store.readEntity('session', 'ses-1'))?.fields['status']).toBe('completed');
      expect(await dispositivo.store.listConflicts()).toHaveLength(0);
    }

    // (b) Stessa entita', campi disgiunti: unione automatica.
    await telefono.engine.recordLocalChange({
      entityType: 'performedSet',
      entityId: 'set-1',
      kind: 'upsert',
      payload: { reps: 10, loadKg: 40 },
    });
    await scambia(telefono, tablet);

    telefono.drive.goOffline();
    tablet.drive.goOffline();
    await telefono.engine.recordLocalChange({
      entityType: 'performedSet',
      entityId: 'set-1',
      kind: 'upsert',
      payload: { note: 'buona tecnica' },
    });
    await tablet.engine.recordLocalChange({
      entityType: 'performedSet',
      entityId: 'set-1',
      kind: 'upsert',
      payload: { rir: 1 },
    });
    telefono.drive.goOnline();
    tablet.drive.goOnline();
    await scambia(telefono, tablet);

    for (const dispositivo of [telefono, tablet]) {
      const serie = await dispositivo.store.readEntity('performedSet', 'set-1');
      expect(serie?.fields['note']).toBe('buona tecnica');
      expect(serie?.fields['rir']).toBe(1);
      expect(serie?.fields['reps']).toBe(10);
      expect(await dispositivo.store.listConflicts()).toHaveLength(0);
    }
  });

  it('rende visibile il conflitto su modifiche incompatibili dello stesso campo', async () => {
    // La stessa serie, corretta a 8 ripetizioni su un dispositivo e a 10
    // sull'altro (caso esplicito della specifica §8.2).
    await telefono.engine.recordLocalChange({
      entityType: 'performedSet',
      entityId: 'set-1',
      kind: 'upsert',
      payload: { reps: 12, loadKg: 40 },
    });
    await scambia(telefono, tablet);

    telefono.drive.goOffline();
    tablet.drive.goOffline();
    await telefono.engine.recordLocalChange({
      entityType: 'performedSet',
      entityId: 'set-1',
      kind: 'upsert',
      payload: { reps: 8 },
    });
    await tablet.engine.recordLocalChange({
      entityType: 'performedSet',
      entityId: 'set-1',
      kind: 'upsert',
      payload: { reps: 10 },
    });
    telefono.drive.goOnline();
    tablet.drive.goOnline();
    await scambia(telefono, tablet);

    for (const dispositivo of [telefono, tablet]) {
      const conflitti = await dispositivo.store.listConflicts();
      expect(conflitti).toHaveLength(1);
      const conflitto = conflitti[0]!;
      expect(conflitto.reason).toBe('stesso-campo-divergente');
      expect(conflitto.field).toBe('reps');
      // Entrambe le alternative sono conservate: nessuno scarto silenzioso.
      const valori = conflitto.alternatives.map((a) => a.value).sort();
      expect(valori).toEqual([10, 8]);
      expect(conflitto.alternatives.map((a) => a.origin)).toContain('dev-telefono');
      expect(conflitto.alternatives.map((a) => a.origin)).toContain('dev-tablet');
      // Il testo della domanda e' in italiano e nomina i due valori.
      expect(conflitto.question).toContain('ripetizioni');
      expect(conflitto.question).toContain('8');
      expect(conflitto.question).toContain('10');
      expect(dispositivo.engine.getState().status).toBe('conflitto-da-risolvere');
      expect(dispositivo.engine.getState().unresolvedConflicts).toBe(1);
    }

    // La risoluzione e' una scelta esplicita e si propaga come operazione.
    const conflitto = (await telefono.store.listConflicts())[0]!;
    const scelta = conflitto.alternatives.find((a) => a.value === 10)!;
    await telefono.engine.resolveConflict(conflitto.id, scelta.operationId);
    await scambia(telefono, tablet);
    expect((await telefono.store.readEntity('performedSet', 'set-1'))?.fields['reps']).toBe(10);
    // Il conflitto resta come storia della decisione, con la scelta registrata.
    const risolto = (await telefono.store.listConflicts()).find((c) => c.id === conflitto.id);
    expect(risolto?.resolvedAt).not.toBeNull();
    expect(risolto?.alternatives).toHaveLength(2);
  });

  it('materializza un conflitto per le revisioni concorrenti del programma', async () => {
    telefono.drive.goOffline();
    tablet.drive.goOffline();
    // Due revisioni del programma numerate 2, create su due dispositivi.
    await telefono.engine.recordLocalChange({
      entityType: 'programPlan',
      entityId: 'plan-telefono',
      kind: 'upsert',
      payload: { version: 2, revisionReason: 'aumento volume', horizonYears: 3 },
    });
    await tablet.engine.recordLocalChange({
      entityType: 'programPlan',
      entityId: 'plan-tablet',
      kind: 'upsert',
      payload: { version: 2, revisionReason: 'riduzione frequenza', horizonYears: 3 },
    });
    telefono.drive.goOnline();
    tablet.drive.goOnline();
    await scambia(telefono, tablet);

    for (const dispositivo of [telefono, tablet]) {
      // Entrambe le revisioni esistono: conservazione non distruttiva.
      const piani = await dispositivo.store.listLiveEntities('programPlan');
      expect(piani).toHaveLength(2);
      const conflitti = (await dispositivo.store.listConflicts()).filter(
        (c) => c.reason === 'revisioni-concorrenti-programma',
      );
      expect(conflitti).toHaveLength(1);
      const conflitto = conflitti[0]!;
      expect(conflitto.nonDestructive).toBe(true);
      expect(conflitto.alternatives).toHaveLength(2);
      expect(conflitto.alternatives.map((a) => a.entityId).sort()).toEqual([
        'plan-tablet',
        'plan-telefono',
      ]);
      expect(conflitto.question).toContain('due revisioni del programma');
    }
  });

  it('non applica in automatico una modifica remota su una seduta in corso', async () => {
    await telefono.engine.recordLocalChange({
      entityType: 'session',
      entityId: 'ses-1',
      kind: 'upsert',
      payload: {
        status: 'active',
        slot: 'A',
        ownerDeviceId: 'dev-telefono',
        note: 'in corso sul telefono',
      },
    });
    await telefono.engine.push();

    // Il tablet manda una modifica sulla stessa seduta, mentre e' attiva.
    const fabbrica = operationFactory('dev-tablet', tablet.clock);
    const remota = fabbrica({
      entityType: 'session',
      entityId: 'ses-1',
      kind: 'upsert',
      baseRevision: 1,
      payload: { note: 'modificata dal tablet' },
    });
    publishBundle(backend, {
      originDeviceId: 'dev-tablet',
      operations: [remota],
      bundleId: ulidFactory(tablet.clock)(),
      createdAt: tablet.clock.now(),
    });

    const risultato = await telefono.engine.pull();
    expect(risultato.operationsDeferred).toBe(1);
    expect(risultato.operationsApplied).toBe(0);

    // La seduta in corso non e' stata toccata.
    const sessione = await telefono.store.readEntity('session', 'ses-1');
    expect(sessione?.fields['note']).toBe('in corso sul telefono');
    expect(sessione?.fields['status']).toBe('active');

    const conflitti = await telefono.store.listConflicts();
    expect(conflitti).toHaveLength(1);
    expect(conflitti[0]?.reason).toBe('seduta-in-corso');
    expect(conflitti[0]?.question).toContain('conferma');

    // Un secondo pull non duplica il conflitto ne' applica di nascosto.
    await telefono.engine.pull();
    expect(await telefono.store.listConflicts()).toHaveLength(1);
    expect((await telefono.store.readEntity('session', 'ses-1'))?.fields['note']).toBe(
      'in corso sul telefono',
    );

    // Solo la conferma esplicita applica la modifica.
    await telefono.engine.confirmDeferredOperation(remota.id);
    expect((await telefono.store.readEntity('session', 'ses-1'))?.fields['note']).toBe(
      'modificata dal tablet',
    );
    expect(await telefono.store.listDeferredOperations()).toHaveLength(0);
  });
});
