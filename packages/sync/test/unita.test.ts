/**
 * Verifiche puntuali sui meccanismi di supporto: attese progressive,
 * de-duplicazione e tie-break deterministico.
 */

import { describe, expect, it } from 'vitest';
import { FakeClock } from '@trackstrong/core';
import {
  DriveNetworkError,
  DriveRateLimitError,
  compareForOrdering,
} from '../src/index.js';
import { InMemoryDriveBackend } from '../src/testing/index.js';
import {
  T0,
  makeDevice,
  operationFactory,
  publishBundle,
  ulidFactory,
} from './harness.js';

describe('meccanismi di supporto', () => {
  it('rispetta il ritardo indicato dal server e non attende mai tempo reale', async () => {
    const backend = new InMemoryDriveBackend();
    const telefono = makeDevice({ deviceId: 'dev-telefono', backend });
    await telefono.engine.recordLocalChange({
      entityType: 'performedSet',
      entityId: 'set-1',
      kind: 'upsert',
      payload: { reps: 10 },
    });

    // Due limitazioni di frequenza con `Retry-After` esplicito.
    telefono.drive.throttle(2, 4_500);
    const inizio = Date.now();
    const risultato = await telefono.engine.push();
    // Il ritardo del server ha la precedenza sul backoff calcolato.
    expect(telefono.sleeper.waits).toEqual([4_500, 4_500]);
    expect(risultato.bundlesUploaded).toBe(1);
    // Il tempo reale trascorso e' trascurabile: le attese erano finte.
    expect(Date.now() - inizio).toBeLessThan(2_000);
  });

  it('smette di ritentare al tetto massimo dei tentativi', async () => {
    const backend = new InMemoryDriveBackend();
    const telefono = makeDevice({ deviceId: 'dev-telefono', backend, maxAttempts: 3 });
    await telefono.engine.recordLocalChange({
      entityType: 'performedSet',
      entityId: 'set-1',
      kind: 'upsert',
      payload: { reps: 10 },
    });
    telefono.drive.goOffline();
    await expect(telefono.engine.push()).rejects.toBeInstanceOf(DriveNetworkError);
    // Tre tentativi, quindi due attese fra l'uno e l'altro.
    expect(telefono.sleeper.waits).toHaveLength(2);
    // Backoff crescente con jitter deterministico.
    expect(telefono.sleeper.waits[1]).toBeGreaterThan(telefono.sleeper.waits[0]!);
    // L'operazione non e' stata persa.
    expect(await telefono.store.listPendingOperations()).toHaveLength(1);
  });

  it('de-duplica sull identificativo del pacchetto e non sul nome del file', async () => {
    const backend = new InMemoryDriveBackend();
    const telefono = makeDevice({ deviceId: 'dev-telefono', backend });
    const tablet = makeDevice({ deviceId: 'dev-tablet', backend });
    await tablet.engine.bootstrap();

    const fabbrica = operationFactory('dev-telefono', telefono.clock);
    const ulid = ulidFactory(telefono.clock);
    const operazione = fabbrica({
      entityType: 'performedSet',
      entityId: 'set-1',
      kind: 'upsert',
      baseRevision: 0,
      payload: { reps: 10 },
    });
    const bundleId = ulid();

    // Lo stesso pacchetto caricato due volte: in Drive il nome non e' unico,
    // quindi si ottengono due file distinti con lo stesso contenuto.
    const primo = publishBundle(backend, {
      originDeviceId: 'dev-telefono',
      operations: [operazione],
      bundleId,
      createdAt: telefono.clock.now(),
    });
    const secondo = publishBundle(backend, {
      originDeviceId: 'dev-telefono',
      operations: [operazione],
      bundleId,
      createdAt: telefono.clock.now(),
    });
    expect(primo).not.toBe(secondo);
    const nomi = backend.allFiles().map((f) => f.name);
    expect(nomi[0]).toBe(nomi[1]);
    expect(backend.fileCount()).toBe(2);

    // Il ricevente applica una volta sola.
    const risultato = await tablet.engine.pull();
    expect(risultato.operationsApplied).toBe(1);
    expect(risultato.bundlesSkipped).toBeGreaterThanOrEqual(1);
    expect((await tablet.store.readEntity('performedSet', 'set-1'))?.revision).toBe(1);
  });

  it('usa un tie-break che non dipende dall orologio del dispositivo', async () => {
    // Due dispositivi con lo stesso contatore logico e orologi molto diversi.
    const orologioAvanti = new FakeClock(T0 + 3_600_000);
    const orologioIndietro = new FakeClock(T0);
    const fabbricaA = operationFactory('dev-aaa', orologioAvanti);
    const fabbricaB = operationFactory('dev-bbb', orologioIndietro);
    const a = fabbricaA({
      entityType: 'performedSet',
      entityId: 'set-1',
      kind: 'upsert',
      baseRevision: 1,
      payload: { reps: 8 },
    });
    const b = fabbricaB({
      entityType: 'performedSet',
      entityId: 'set-1',
      kind: 'upsert',
      baseRevision: 1,
      payload: { reps: 10 },
    });

    expect(a.lamport).toBe(b.lamport);
    expect(a.createdAt).toBeGreaterThan(b.createdAt);
    // L'ordine segue `(lamport, origin, id)`: 'dev-aaa' < 'dev-bbb'.
    expect(compareForOrdering(a, b)).toBeLessThan(0);

    // Invertendo gli orologi l'ordine NON cambia: l'orologio non decide.
    orologioAvanti.setWallClock(T0 - 3_600_000);
    const a2 = fabbricaA({
      entityType: 'performedSet',
      entityId: 'set-2',
      kind: 'upsert',
      baseRevision: 1,
      payload: { reps: 8 },
    });
    const b2 = fabbricaB({
      entityType: 'performedSet',
      entityId: 'set-2',
      kind: 'upsert',
      baseRevision: 1,
      payload: { reps: 10 },
    });
    expect(a2.createdAt).toBeLessThan(b2.createdAt);
    expect(compareForOrdering(a2, b2)).toBeLessThan(0);
  });

  it('distingue il limite di frequenza dagli altri errori e ne espone l attesa', () => {
    const limite = new DriveRateLimitError(7_000);
    expect(limite.retryable).toBe(true);
    expect(limite.retryAfterMs).toBe(7_000);
    expect(limite).not.toBeInstanceOf(DriveNetworkError);
    // Un upload interrotto puo' avere avuto successo: il retry deve verificare.
    expect(new DriveNetworkError().maybePartiallyApplied).toBe(true);
  });
});
