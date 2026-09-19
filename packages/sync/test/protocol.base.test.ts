/**
 * Casi base del protocollo: uso offline, idempotenza dell'invio,
 * raggruppamento e avanzamento del cursore.
 *
 * Nessun test attende tempo reale: orologio e attese sono finti.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { DriveNetworkError } from '../src/index.js';
import { InMemoryDriveBackend, PersistenceFailure } from '../src/testing/index.js';
import {
  GIORNO_MS,
  makeDevice,
  publishBundle,
  ulidFactory,
  type Device,
} from './harness.js';

describe('protocollo di sincronizzazione - casi base', () => {
  let backend: InMemoryDriveBackend;
  let telefono: Device;
  let tablet: Device;

  beforeEach(() => {
    backend = new InMemoryDriveBackend();
    telefono = makeDevice({ deviceId: 'dev-telefono', backend });
    tablet = makeDevice({ deviceId: 'dev-tablet', backend });
  });

  it('registra un allenamento offline e lo allinea quando torna la connessione', async () => {
    telefono.drive.goOffline();

    // La registrazione deve funzionare senza rete: e' il vincolo piu'
    // importante della specifica §7.
    await telefono.engine.recordLocalChange({
      entityType: 'session',
      entityId: 'ses-1',
      kind: 'upsert',
      payload: { status: 'completed', plannedDate: '2026-09-21', slot: 'A' },
    });
    await telefono.engine.recordLocalChange({
      entityType: 'performedSet',
      entityId: 'set-1',
      kind: 'upsert',
      payload: { reps: 10, loadKg: 40, rir: 2 },
    });

    expect(await telefono.store.listPendingOperations()).toHaveLength(2);
    expect(telefono.engine.getState().status).toBe('modifiche-in-attesa');

    // Un giro di sync offline non perde nulla e non lancia.
    const offline = await telefono.engine.syncOnce();
    expect(offline.ok).toBe(false);
    expect(offline.error).toBeInstanceOf(DriveNetworkError);
    expect(telefono.engine.getState().status).toBe('errore-di-rete');
    expect(await telefono.store.listPendingOperations()).toHaveLength(2);
    expect(await telefono.store.readCursor()).toBeNull();
    // Nessuna attesa reale: le attese del backoff sono state registrate.
    expect(telefono.sleeper.waits.length).toBeGreaterThan(0);

    telefono.drive.goOnline();
    const online = await telefono.engine.syncOnce();
    expect(online.ok).toBe(true);
    expect(await telefono.store.listPendingOperations()).toHaveLength(0);
    expect(telefono.engine.getState().status).toBe('sincronizzato');

    // L'altro dispositivo recupera l'allenamento.
    await tablet.engine.syncOnce();
    const sessione = await tablet.store.readEntity('session', 'ses-1');
    const serie = await tablet.store.readEntity('performedSet', 'set-1');
    expect(sessione?.fields['status']).toBe('completed');
    expect(serie?.fields['reps']).toBe(10);
  });

  it('non crea un secondo pacchetto quando la risposta di un upload va persa', async () => {
    await telefono.engine.recordLocalChange({
      entityType: 'performedSet',
      entityId: 'set-1',
      kind: 'upsert',
      payload: { reps: 8, loadKg: 42.5 },
    });

    // Variante 1: la risposta si perde e il retry interno ritrova il file.
    telefono.drive.loseNextUploadResponse(1);
    const primo = await telefono.engine.push();
    expect(primo.bundlesAlreadyPresent).toBe(1);
    expect(primo.bundlesUploaded).toBe(0);
    expect(backend.countByKind('operations')).toBe(1);
    expect(await telefono.store.listPendingOperations()).toHaveLength(0);

    // Variante 2: il processo muore prima di poter ritentare. Un dispositivo
    // con un solo tentativo disponibile: `push()` lancia, ma l'intento resta
    // scritto e il pacchetto su Drive c'e' gia'.
    const impaziente = makeDevice({
      deviceId: 'dev-impaziente',
      backend,
      maxAttempts: 1,
      store: undefined,
    });
    await impaziente.engine.recordLocalChange({
      entityType: 'performedSet',
      entityId: 'set-2',
      kind: 'upsert',
      payload: { reps: 6 },
    });
    impaziente.drive.loseNextUploadResponse(1);
    await expect(impaziente.engine.push()).rejects.toBeInstanceOf(DriveNetworkError);
    expect(backend.countByKind('operations')).toBe(2);
    const intento = await impaziente.store.readPushIntent();
    expect(intento).not.toBeNull();

    // Secondo tentativo, dopo il riavvio: nessun file nuovo.
    const secondo = await impaziente.engine.push();
    expect(secondo.bundlesAlreadyPresent).toBe(1);
    expect(secondo.bundlesUploaded).toBe(0);
    expect(backend.countByKind('operations')).toBe(2);
    expect(await impaziente.store.readPushIntent()).toBeNull();
    expect(await impaziente.store.listPendingOperations()).toHaveLength(0);
  });

  it('raggruppa le operazioni: 50 operazioni non producono 50 file remoti', async () => {
    for (let i = 0; i < 50; i += 1) {
      await telefono.engine.recordLocalChange({
        entityType: 'performedSet',
        entityId: `set-${String(i)}`,
        kind: 'upsert',
        payload: { reps: 10, loadKg: 40 + i },
      });
    }
    const risultato = await telefono.engine.push();
    expect(risultato.operationsSent).toBe(50);
    expect(backend.countByKind('operations')).toBe(1);
    expect(backend.countByKind('operations')).toBeLessThan(50);

    // Con pacchetti da 20 servono 3 file, non 50: il raggruppamento resta.
    const altro = makeDevice({ deviceId: 'dev-piccolo', backend, maxOperationsPerBundle: 20 });
    for (let i = 0; i < 50; i += 1) {
      await altro.engine.recordLocalChange({
        entityType: 'performedSet',
        entityId: `altro-set-${String(i)}`,
        kind: 'upsert',
        payload: { reps: 5 },
      });
    }
    const secondo = await altro.engine.push();
    expect(secondo.bundlesUploaded).toBe(3);
    expect(backend.countByKind('operations')).toBe(4);
  });

  it('riapplicare la stessa operazione non ha effetto (idempotenza)', async () => {
    // Il tablet e' gia' allineato su un archivio vuoto: cosi' l'operazione
    // arriva dai cambiamenti e non dal primo recupero.
    const avvio = await tablet.engine.bootstrap();
    expect(avvio.foundRemoteArchive).toBe(false);

    const operazione = await telefono.engine.recordLocalChange({
      entityType: 'performedSet',
      entityId: 'set-1',
      kind: 'upsert',
      payload: { reps: 10 },
    });
    await telefono.engine.push();

    const primo = await tablet.engine.pull();
    expect(primo.operationsApplied).toBe(1);
    const dopoPrimo = await tablet.store.readEntity('performedSet', 'set-1');
    expect(dopoPrimo?.revision).toBe(1);

    // La stessa operazione riconsegnata in un pacchetto diverso: il nome e
    // l'identificativo del file sono altri, ma l'`id` dell'operazione e' lo
    // stesso. Deve essere un no-op.
    const nuovoUlid = ulidFactory(telefono.clock);
    publishBundle(backend, {
      originDeviceId: telefono.deviceId,
      operations: [operazione],
      bundleId: nuovoUlid(),
      createdAt: telefono.clock.now(),
    });

    const secondo = await tablet.engine.pull();
    expect(secondo.operationsApplied).toBe(0);
    expect(secondo.operationsSkipped).toBe(1);
    const dopoSecondo = await tablet.store.readEntity('performedSet', 'set-1');
    expect(dopoSecondo?.revision).toBe(1);
    expect(dopoSecondo?.fields['reps']).toBe(10);
  });

  it('avanza il cursore solo dopo la persistenza', async () => {
    await telefono.engine.recordLocalChange({
      entityType: 'bodyMeasurement',
      entityId: 'mis-1',
      kind: 'upsert',
      payload: { bodyweightKg: 80 },
    });
    await telefono.engine.push();

    // Primo recupero riuscito: il cursore c'e'.
    await tablet.engine.bootstrap();
    const cursoreIniziale = await tablet.store.readCursor();
    expect(cursoreIniziale).not.toBeNull();

    telefono.clock.advance(GIORNO_MS);
    await telefono.engine.recordLocalChange({
      entityType: 'bodyMeasurement',
      entityId: 'mis-2',
      kind: 'upsert',
      payload: { bodyweightKg: 79.5 },
    });
    await telefono.engine.push();

    // La persistenza locale fallisce: il cursore NON deve avanzare.
    tablet.store.failNextApplyIncoming(1);
    await expect(tablet.engine.pull()).rejects.toBeInstanceOf(PersistenceFailure);
    expect(await tablet.store.readCursor()).toBe(cursoreIniziale);
    expect(await tablet.store.readEntity('bodyMeasurement', 'mis-2')).toBeNull();

    // Il giro successivo ripete la stessa pagina e recupera tutto.
    const ripetizione = await tablet.engine.pull();
    expect(ripetizione.operationsApplied).toBe(1);
    expect(await tablet.store.readCursor()).not.toBe(cursoreIniziale);
    const misura = await tablet.store.readEntity('bodyMeasurement', 'mis-2');
    expect(misura?.fields['bodyweightKg']).toBe(79.5);
  });
});
