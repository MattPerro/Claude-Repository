/**
 * Recupero, ordine di arrivo, dispositivi offline a lungo, cancellazioni
 * (specifica §8.1 e §8.3).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { TOMBSTONE_RETENTION_MS } from '../src/index.js';
import { InMemoryDriveBackend } from '../src/testing/index.js';
import {
  GIORNO_MS,
  makeDevice,
  operationFactory,
  publishBundle,
  ulidFactory,
  withHookOnFirstDownload,
  type Device,
} from './harness.js';

describe('recupero e ordine di arrivo', () => {
  let backend: InMemoryDriveBackend;
  let telefono: Device;

  beforeEach(() => {
    backend = new InMemoryDriveBackend();
    telefono = makeDevice({ deviceId: 'dev-telefono', backend });
  });

  it('arriva allo stato finale corretto con operazioni ricevute fuori ordine', async () => {
    // Tre operazioni concatenate sulla stessa serie, pubblicate in ordine
    // **inverso** e consegnate una pagina alla volta: il ricevente vede prima
    // l'ultima modifica.
    const fabbrica = operationFactory('dev-telefono', telefono.clock);
    const ulid = ulidFactory(telefono.clock);
    const creazione = fabbrica({
      entityType: 'performedSet',
      entityId: 'set-1',
      kind: 'upsert',
      baseRevision: 0,
      payload: { reps: 10, loadKg: 40 },
    });
    const correzione = fabbrica({
      entityType: 'performedSet',
      entityId: 'set-1',
      kind: 'upsert',
      baseRevision: 1,
      payload: { reps: 9 },
      causalDeps: [creazione.id],
    });
    const seconda = fabbrica({
      entityType: 'performedSet',
      entityId: 'set-1',
      kind: 'upsert',
      baseRevision: 2,
      payload: { reps: 8, note: 'ultima parola' },
      causalDeps: [correzione.id],
    });

    // Il ricevente e' gia' allineato: i pacchetti passeranno da
    // `changes.list`, una pagina per cambiamento, e ogni pagina viene
    // restituita al contrario. E' la peggiore combinazione: l'ultima modifica
    // arriva per prima, in un giro di applicazione tutto suo.
    const tablet = makeDevice({
      deviceId: 'dev-tablet',
      backend,
      driveOptions: { changesPageSize: 1, outOfOrderChanges: true },
    });
    await tablet.engine.bootstrap();

    for (const operazione of [seconda, correzione, creazione]) {
      publishBundle(backend, {
        originDeviceId: 'dev-telefono',
        operations: [operazione],
        bundleId: ulid(),
        createdAt: telefono.clock.now(),
      });
    }

    const risultato = await tablet.engine.pull();
    expect(risultato.pagesProcessed).toBe(3);
    // Applicate tutte e tre, nonostante siano arrivate al rovescio.
    expect(risultato.operationsApplied).toBe(3);

    const serie = await tablet.store.readEntity('performedSet', 'set-1');
    expect(serie?.fields['reps']).toBe(8);
    expect(serie?.fields['note']).toBe('ultima parola');
    expect(serie?.fields['loadKg']).toBe(40);
    expect(serie?.revision).toBe(3);
    expect(await tablet.store.listDeferredOperations()).toHaveLength(0);
    expect(await tablet.store.listConflicts()).toHaveLength(0);
  });

  it('ricompone le operazioni arrivate a pezzi, senza applicarle su una base sbagliata', async () => {
    // Variante piu' severa del caso precedente: i pacchetti arrivano in giri
    // di pull distinti, quindi l'ordinamento in memoria non basta e serve la
    // coda delle operazioni in attesa.
    const fabbrica = operationFactory('dev-telefono', telefono.clock);
    const ulid = ulidFactory(telefono.clock);
    const creazione = fabbrica({
      entityType: 'performedSet',
      entityId: 'set-1',
      kind: 'upsert',
      baseRevision: 0,
      payload: { reps: 10 },
    });
    const correzione = fabbrica({
      entityType: 'performedSet',
      entityId: 'set-1',
      kind: 'upsert',
      baseRevision: 1,
      payload: { reps: 8 },
      causalDeps: [creazione.id],
    });

    const tablet = makeDevice({ deviceId: 'dev-tablet', backend });
    await tablet.engine.bootstrap();

    // Prima arriva la correzione, da sola.
    publishBundle(backend, {
      originDeviceId: 'dev-telefono',
      operations: [correzione],
      bundleId: ulid(),
      createdAt: telefono.clock.now(),
    });
    const primo = await tablet.engine.pull();
    expect(primo.operationsApplied).toBe(0);
    expect(primo.operationsDeferred).toBe(1);
    // La serie NON viene creata a partire da una modifica parziale.
    expect(await tablet.store.readEntity('performedSet', 'set-1')).toBeNull();

    // Poi arriva la creazione: la coda si ricompone.
    publishBundle(backend, {
      originDeviceId: 'dev-telefono',
      operations: [creazione],
      bundleId: ulid(),
      createdAt: telefono.clock.now(),
    });
    const secondo = await tablet.engine.pull();
    expect(secondo.operationsApplied).toBe(2);
    expect(await tablet.store.listDeferredOperations()).toHaveLength(0);
    const serie = await tablet.store.readEntity('performedSet', 'set-1');
    expect(serie?.fields['reps']).toBe(8);
    expect(serie?.revision).toBe(2);
  });

  it('riallinea senza perdite un dispositivo rimasto offline per settimane', async () => {
    const tablet = makeDevice({ deviceId: 'dev-tablet', backend });
    await telefono.engine.bootstrap();
    await tablet.engine.bootstrap();

    // Il tablet sparisce per sei settimane. Il telefono continua ad allenarsi.
    tablet.drive.goOffline();
    for (let settimana = 0; settimana < 6; settimana += 1) {
      telefono.clock.advance(7 * GIORNO_MS);
      await telefono.engine.recordLocalChange({
        entityType: 'session',
        entityId: `ses-${String(settimana)}`,
        kind: 'upsert',
        payload: { status: 'completed', slot: settimana % 2 === 0 ? 'A' : 'B' },
      });
      await telefono.engine.recordLocalChange({
        entityType: 'bodyMeasurement',
        entityId: `mis-${String(settimana)}`,
        kind: 'upsert',
        payload: { bodyweightKg: 80 - settimana * 0.3 },
      });
      await telefono.engine.push();
    }

    // Nel frattempo anche il tablet ha registrato qualcosa, offline.
    tablet.clock.advance(6 * 7 * GIORNO_MS);
    await tablet.engine.recordLocalChange({
      entityType: 'trackDay',
      entityId: 'pista-1',
      kind: 'upsert',
      payload: { note: 'giornata in pista' },
    });
    const inAttesa = await tablet.store.listPendingOperations();
    expect(inAttesa).toHaveLength(1);

    tablet.drive.goOnline();
    const giro = await tablet.engine.syncOnce();
    expect(giro.ok).toBe(true);

    // Tutto lo storico del telefono e' arrivato.
    for (let settimana = 0; settimana < 6; settimana += 1) {
      expect(await tablet.store.readEntity('session', `ses-${String(settimana)}`)).not.toBeNull();
      expect(await tablet.store.readEntity('bodyMeasurement', `mis-${String(settimana)}`)).not.toBeNull();
    }
    // E la registrazione del tablet non e' andata perduta.
    expect(await tablet.store.listPendingOperations()).toHaveLength(0);
    await telefono.engine.pull();
    expect((await telefono.store.readEntity('trackDay', 'pista-1'))?.fields['note']).toBe(
      'giornata in pista',
    );
    expect(await tablet.store.listConflicts()).toHaveLength(0);
  });

  it('non fa ricomparire dati eliminati quando si riallinea un dispositivo vecchio', async () => {
    const tablet = makeDevice({ deviceId: 'dev-tablet', backend });
    await telefono.engine.bootstrap();
    await tablet.engine.bootstrap();

    await telefono.engine.recordLocalChange({
      entityType: 'bodyMeasurement',
      entityId: 'mis-1',
      kind: 'upsert',
      payload: { bodyweightKg: 80, waistCm: 93 },
    });
    await telefono.engine.push();
    await tablet.engine.pull();
    expect(await tablet.store.readEntity('bodyMeasurement', 'mis-1')).not.toBeNull();

    // Il tablet va offline. Il telefono elimina la misurazione.
    tablet.drive.goOffline();
    telefono.clock.advance(GIORNO_MS);
    await telefono.engine.recordLocalChange({
      entityType: 'bodyMeasurement',
      entityId: 'mis-1',
      kind: 'delete',
    });
    await telefono.engine.push();
    const tombstone = await telefono.store.readEntity('bodyMeasurement', 'mis-1');
    expect(tombstone?.deleted).toBe(true);
    expect(await telefono.store.listLiveEntities('bodyMeasurement')).toHaveLength(0);

    // Il tablet, settimane dopo e ignaro, modifica il dato eliminato.
    tablet.clock.advance(30 * GIORNO_MS);
    await tablet.engine.recordLocalChange({
      entityType: 'bodyMeasurement',
      entityId: 'mis-1',
      kind: 'upsert',
      payload: { waistCm: 90 },
    });
    tablet.drive.goOnline();
    await tablet.engine.push();

    // Il telefono riceve la modifica tardiva: il dato NON risuscita.
    const risultato = await telefono.engine.pull();
    expect(risultato.conflictsOpened).toBe(1);
    const dopo = await telefono.store.readEntity('bodyMeasurement', 'mis-1');
    expect(dopo?.deleted).toBe(true);
    expect(dopo?.fields['waistCm']).toBe(93);
    expect(await telefono.store.listLiveEntities('bodyMeasurement')).toHaveLength(0);

    // Ma la modifica non e' stata scartata: e' un conflitto da risolvere.
    const conflitti = await telefono.store.listConflicts();
    expect(conflitti).toHaveLength(1);
    expect(conflitti[0]?.reason).toBe('modifica-vs-eliminazione');
    expect(conflitti[0]?.alternatives.map((a) => a.kind).sort()).toEqual(['delete', 'upsert']);

    // La tombstone non viene rimossa prima della scadenza dichiarata.
    telefono.clock.advance(30 * GIORNO_MS);
    expect(await telefono.engine.pruneTombstones()).toHaveLength(0);
    expect((await telefono.store.readEntity('bodyMeasurement', 'mis-1'))?.deleted).toBe(true);
    // Solo oltre la politica di conservazione la tombstone si puo' rimuovere.
    telefono.clock.advance(TOMBSTONE_RETENTION_MS);
    expect(await telefono.engine.pruneTombstones()).toHaveLength(1);
  });

  it('recupera completamente lo storico su una nuova installazione', async () => {
    await telefono.engine.bootstrap();
    await telefono.engine.recordLocalChange({
      entityType: 'programPlan',
      entityId: 'plan-1',
      kind: 'upsert',
      payload: { version: 1, horizonYears: 3 },
    });
    for (let i = 0; i < 12; i += 1) {
      await telefono.engine.recordLocalChange({
        entityType: 'session',
        entityId: `ses-${String(i)}`,
        kind: 'upsert',
        payload: { status: 'completed', slot: i % 2 === 0 ? 'A' : 'B' },
      });
      await telefono.engine.recordLocalChange({
        entityType: 'performedSet',
        entityId: `set-${String(i)}`,
        kind: 'upsert',
        payload: { reps: 10, loadKg: 40 + i },
      });
      telefono.clock.advance(3 * GIORNO_MS);
    }
    await telefono.engine.recordLocalChange({
      entityType: 'session',
      entityId: 'ses-3',
      kind: 'delete',
    });
    await telefono.engine.push();
    // Uno snapshot accelera il recupero ma non sostituisce i pacchetti.
    const snapshot = await telefono.engine.writeSnapshot();
    expect(snapshot.tombstoneCount).toBe(1);
    expect(backend.countByKind('operations')).toBeGreaterThan(0);

    const nuovo = makeDevice({ deviceId: 'dev-nuovo', backend });
    const recupero = await nuovo.engine.bootstrap();
    expect(recupero.foundRemoteArchive).toBe(true);
    expect(recupero.shouldCreateInitialProgram).toBe(false);
    expect(recupero.snapshotApplied).toBe(snapshot.snapshotId);
    expect(recupero.rejected).toHaveLength(0);

    // Lo stato ricostruito coincide con quello del dispositivo di origine.
    const attese = await telefono.store.listEntities();
    const ottenute = await nuovo.store.listEntities();
    expect(ottenute).toHaveLength(attese.length);
    expect((await nuovo.store.readEntity('performedSet', 'set-11'))?.fields['loadKg']).toBe(51);
    expect((await nuovo.store.readEntity('session', 'ses-3'))?.deleted).toBe(true);
    expect(await nuovo.store.listLiveEntities('session')).toHaveLength(11);
    // Il registro di idempotenza e' stato ricaricato: nessuna riapplicazione.
    const dopo = await nuovo.engine.pull();
    expect(dopo.operationsApplied).toBe(0);
  });

  it('non perde le modifiche arrivate durante il primo download dello storico', async () => {
    await telefono.engine.bootstrap();
    await telefono.engine.recordLocalChange({
      entityType: 'session',
      entityId: 'ses-storica',
      kind: 'upsert',
      payload: { status: 'completed', slot: 'A' },
    });
    await telefono.engine.push();

    // Il nuovo dispositivo, mentre scarica lo storico, riceve una modifica
    // caricata da un terzo dispositivo.
    const terzo = makeDevice({ deviceId: 'dev-terzo', backend });
    let pubblicato = false;
    const nuovo = makeDevice({
      deviceId: 'dev-nuovo',
      backend,
      driveWrapper: (drive) =>
        withHookOnFirstDownload(drive, () => {
          if (pubblicato) return;
          pubblicato = true;
          const fabbrica = operationFactory('dev-terzo', terzo.clock);
          const operazione = fabbrica({
            entityType: 'bodyMeasurement',
            entityId: 'mis-durante',
            kind: 'upsert',
            baseRevision: 0,
            payload: { bodyweightKg: 78.4 },
          });
          publishBundle(backend, {
            originDeviceId: 'dev-terzo',
            operations: [operazione],
            bundleId: ulidFactory(terzo.clock)(),
            createdAt: terzo.clock.now(),
          });
        }),
    });

    const recupero = await nuovo.engine.bootstrap();
    expect(pubblicato).toBe(true);
    expect(recupero.foundRemoteArchive).toBe(true);
    // Il pacchetto arrivato durante il download non era nell'elenco iniziale.
    expect(await nuovo.store.readEntity('bodyMeasurement', 'mis-durante')).toBeNull();

    // Ma il cursore era stato preso PRIMA del download, quindi il pull
    // successivo lo trova: nulla e' andato perduto.
    const dopo = await nuovo.engine.pull();
    expect(dopo.operationsApplied).toBe(1);
    expect((await nuovo.store.readEntity('bodyMeasurement', 'mis-durante'))?.fields['bodyweightKg']).toBe(78.4);
  });

  it('non crea un secondo programma iniziale se l archivio remoto esiste già', async () => {
    // Primo avvio su archivio vuoto: il chiamante puo' generare il programma.
    const primo = await telefono.engine.bootstrap();
    expect(primo.foundRemoteArchive).toBe(false);
    expect(primo.shouldCreateInitialProgram).toBe(true);
    await telefono.engine.recordLocalChange({
      entityType: 'programPlan',
      entityId: 'plan-iniziale',
      kind: 'upsert',
      payload: { version: 1, horizonYears: 3, revisionReason: null },
    });
    await telefono.engine.push();

    // Secondo dispositivo: l'archivio remoto esiste, quindi NON deve creare
    // un secondo programma iniziale (specifica §8.3).
    const nuovo = makeDevice({ deviceId: 'dev-nuovo', backend });
    const secondo = await nuovo.engine.bootstrap();
    expect(secondo.foundRemoteArchive).toBe(true);
    expect(secondo.shouldCreateInitialProgram).toBe(false);
    const piani = await nuovo.store.listLiveEntities('programPlan');
    expect(piani).toHaveLength(1);
    expect(piani[0]?.entityId).toBe('plan-iniziale');
  });
});
