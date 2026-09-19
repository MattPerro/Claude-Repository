/**
 * Errori di accesso, di quota e di integrita'.
 *
 * Proprieta' verificata in tutti i casi: **un errore non e' mai "archivio
 * vuoto"**, e in nessun caso i dati locali vengono toccati (specifica §8.1 e
 * §14).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  AccountChangedError,
  DriveAuthError,
  DriveQuotaError,
  DriveStorageFullError,
  SYNC_PROTOCOL_VERSION,
  SyncEngine,
} from '../src/index.js';
import { FakeSleeper, InMemoryDriveBackend, fixedRandom } from '../src/testing/index.js';
import {
  ACCOUNT_A,
  ACCOUNT_B,
  WORKSPACE,
  makeDevice,
  operationFactory,
  publishBundle,
  ulidFactory,
  type Device,
} from './harness.js';

describe('errori di accesso, quota e integrità', () => {
  let backend: InMemoryDriveBackend;
  let telefono: Device;

  beforeEach(() => {
    backend = new InMemoryDriveBackend();
    telefono = makeDevice({ deviceId: 'dev-telefono', backend });
  });

  it('segnala il token revocato come errore distinto, non come archivio vuoto', async () => {
    // Il dispositivo ha dati locali e una coda in attesa.
    await telefono.engine.recordLocalChange({
      entityType: 'performedSet',
      entityId: 'set-1',
      kind: 'upsert',
      payload: { reps: 10, loadKg: 40 },
    });
    const primaEntita = await telefono.store.readEntity('performedSet', 'set-1');

    telefono.drive.revokeToken();

    // Nessuna delle operazioni di rete "riesce restituendo vuoto": lanciano.
    await expect(telefono.engine.push()).rejects.toBeInstanceOf(DriveAuthError);
    await expect(telefono.engine.pull()).rejects.toBeInstanceOf(DriveAuthError);
    await expect(telefono.engine.bootstrap()).rejects.toBeInstanceOf(DriveAuthError);
    await expect(telefono.engine.writeSnapshot()).rejects.toBeInstanceOf(DriveAuthError);

    // In particolare `bootstrap` NON conclude "non c'e' niente da recuperare":
    // non restituisce nulla, lancia. Il cursore resta assente.
    expect(await telefono.store.readCursor()).toBeNull();

    // Dati locali intatti, coda intatta, stato leggibile dall'interfaccia.
    expect(await telefono.store.readEntity('performedSet', 'set-1')).toEqual(primaEntita);
    expect(await telefono.store.listPendingOperations()).toHaveLength(1);
    expect(telefono.engine.getState().status).toBe('accesso-da-rinnovare');
    expect(telefono.engine.getState().label).toBe('Accesso da rinnovare');
    // Un errore di autorizzazione non si ritenta: non ha senso e nasconderebbe
    // all'utente un problema che deve vedere.
    expect(telefono.sleeper.waits).toHaveLength(0);

    // Rinnovato l'accesso, la sincronizzazione riprende da dove era.
    telefono.drive.restoreToken();
    const giro = await telefono.engine.syncOnce();
    expect(giro.ok).toBe(true);
    expect(await telefono.store.listPendingOperations()).toHaveLength(0);
  });

  it('distingue quota di utilizzo e spazio esaurito, senza compromettere la registrazione', async () => {
    await telefono.engine.bootstrap();
    await telefono.engine.recordLocalChange({
      entityType: 'session',
      entityId: 'ses-1',
      kind: 'upsert',
      payload: { status: 'active', slot: 'A', ownerDeviceId: 'dev-telefono' },
    });

    // (a) Spazio di archiviazione dell'utente esaurito.
    telefono.drive.fillStorage();
    const spazio = await telefono.engine.push().catch((e: unknown) => e);
    expect(spazio).toBeInstanceOf(DriveStorageFullError);
    expect(spazio).not.toBeInstanceOf(DriveQuotaError);
    expect(spazio).not.toBeInstanceOf(DriveAuthError);
    expect(telefono.engine.getState().status).toBe('spazio-esaurito');
    expect(telefono.engine.getState().label).toBe('Spazio su Drive esaurito');

    // La registrazione locale continua a funzionare: un problema di rete non
    // interrompe la seduta (specifica §8.5).
    await telefono.engine.recordLocalChange({
      entityType: 'performedSet',
      entityId: 'set-1',
      kind: 'upsert',
      payload: { reps: 10, loadKg: 40 },
    });
    await telefono.engine.recordLocalChange({
      entityType: 'performedSet',
      entityId: 'set-2',
      kind: 'upsert',
      payload: { reps: 9, loadKg: 40 },
    });
    expect(await telefono.store.listPendingOperations()).toHaveLength(3);
    expect((await telefono.store.readEntity('performedSet', 'set-2'))?.fields['reps']).toBe(9);

    // (b) Quote dell'API esaurite: errore di tipo diverso, spazio libero.
    telefono.drive.freeStorage();
    telefono.drive.exhaustApiQuota();
    const quota = await telefono.engine.push().catch((e: unknown) => e);
    expect(quota).toBeInstanceOf(DriveQuotaError);
    expect(quota).not.toBeInstanceOf(DriveStorageFullError);
    expect(quota).not.toBeInstanceOf(DriveAuthError);

    // Nessuna delle due condizioni ha perso operazioni.
    expect(await telefono.store.listPendingOperations()).toHaveLength(3);
    expect(backend.fileCount()).toBe(0);
  });

  it('non trasferisce nulla in automatico quando cambia l account Google', async () => {
    await telefono.engine.recordLocalChange({
      entityType: 'bodyMeasurement',
      entityId: 'mis-1',
      kind: 'upsert',
      payload: { bodyweightKg: 80 },
    });
    await telefono.engine.push();
    const fileDopoPrimoInvio = backend.fileCount();
    expect(fileDopoPrimoInvio).toBe(1);

    await telefono.engine.recordLocalChange({
      entityType: 'bodyMeasurement',
      entityId: 'mis-2',
      kind: 'upsert',
      payload: { bodyweightKg: 79 },
    });

    // Stesso archivio locale, nuovo account Google autenticato.
    const nuovoBackend = new InMemoryDriveBackend();
    const nuovaVista = nuovoBackend.connect();
    const sleeper = new FakeSleeper();
    const motoreNuovoAccount = new SyncEngine({
      deviceId: telefono.deviceId,
      workspaceId: WORKSPACE,
      googleAccountId: ACCOUNT_B,
      drive: nuovaVista,
      state: telefono.store,
      clock: telefono.clock,
      sleeper,
      random: fixedRandom([0.5]),
    });

    await expect(motoreNuovoAccount.push()).rejects.toBeInstanceOf(AccountChangedError);
    await expect(motoreNuovoAccount.pull()).rejects.toBeInstanceOf(AccountChangedError);
    await expect(motoreNuovoAccount.bootstrap()).rejects.toBeInstanceOf(AccountChangedError);
    const giro = await motoreNuovoAccount.syncOnce();
    expect(giro.ok).toBe(false);
    expect(giro.error).toBeInstanceOf(AccountChangedError);

    // Nessun dato e' finito sul nuovo account, e nemmeno una richiesta di
    // scrittura e' partita.
    expect(nuovoBackend.fileCount()).toBe(0);
    expect(nuovaVista.calls.uploads).toBe(0);
    expect(motoreNuovoAccount.getState().status).toBe('trasferimento-da-confermare');
    // L'account collegato non e' stato riscritto di nascosto.
    expect((await telefono.store.readLinkedAccount())?.googleAccountId).toBe(ACCOUNT_A);
    // I dati locali sono intatti e ancora in attesa di invio.
    expect(await telefono.store.listPendingOperations()).toHaveLength(1);

    // Solo dopo la conferma esplicita il trasferimento avviene.
    await motoreNuovoAccount.confirmAccountTransfer(ACCOUNT_B);
    await motoreNuovoAccount.push();
    expect(nuovoBackend.countByKind('operations')).toBe(1);
    expect((await telefono.store.readLinkedAccount())?.googleAccountId).toBe(ACCOUNT_B);
  });

  it('rifiuta un pacchetto con versione di protocollo futura lasciando intatti i dati locali', async () => {
    await telefono.engine.bootstrap();
    await telefono.engine.recordLocalChange({
      entityType: 'performedSet',
      entityId: 'set-1',
      kind: 'upsert',
      payload: { reps: 10, loadKg: 40 },
    });
    await telefono.engine.push();
    const primaEntita = await telefono.store.readEntity('performedSet', 'set-1');

    // Un'app piu' recente carica un pacchetto con un protocollo futuro.
    const fabbrica = operationFactory('dev-futuro', telefono.clock);
    publishBundle(backend, {
      originDeviceId: 'dev-futuro',
      operations: [
        fabbrica({
          entityType: 'performedSet',
          entityId: 'set-1',
          kind: 'upsert',
          baseRevision: 1,
          payload: { reps: 99 },
        }),
      ],
      bundleId: ulidFactory(telefono.clock)(),
      createdAt: telefono.clock.now(),
      protocolVersionOverride: SYNC_PROTOCOL_VERSION + 1,
    });

    const risultato = await telefono.engine.pull();
    expect(risultato.rejected).toHaveLength(1);
    expect(risultato.rejected[0]?.code).toBe('protocollo-troppo-recente');
    expect(risultato.rejected[0]?.message).toContain('Aggiorna TrackStrong');
    expect(risultato.operationsApplied).toBe(0);
    // I dati locali non sono stati toccati.
    expect(await telefono.store.readEntity('performedSet', 'set-1')).toEqual(primaEntita);

    // E un dispositivo nuovo che trova SOLO pacchetti futuri riconosce
    // comunque che l'archivio remoto esiste: non deve creare un secondo
    // programma iniziale (specifica §8.3 e §14).
    const nuovo = makeDevice({ deviceId: 'dev-nuovo', backend });
    const recupero = await nuovo.engine.bootstrap();
    expect(recupero.foundRemoteArchive).toBe(true);
    expect(recupero.shouldCreateInitialProgram).toBe(false);
    expect(recupero.rejected.some((r) => r.code === 'protocollo-troppo-recente')).toBe(true);
  });

  it('rifiuta un pacchetto corrotto senza cancellare lo storico', async () => {
    await telefono.engine.bootstrap();
    await telefono.engine.recordLocalChange({
      entityType: 'performedSet',
      entityId: 'set-buono',
      kind: 'upsert',
      payload: { reps: 10, loadKg: 40 },
    });
    await telefono.engine.push();

    const tablet = makeDevice({ deviceId: 'dev-tablet', backend });
    await tablet.engine.bootstrap();
    expect(await tablet.store.readEntity('performedSet', 'set-buono')).not.toBeNull();
    const storicoPrima = await tablet.store.listEntities();

    // (a) Contenuto alterato: l'impronta non corrisponde piu'.
    await telefono.engine.recordLocalChange({
      entityType: 'performedSet',
      entityId: 'set-corrotto',
      kind: 'upsert',
      payload: { reps: 8, loadKg: 45 },
    });
    await telefono.engine.push();
    const corrotto = backend
      .allFiles()
      .find((f) => f.appProperties['kind'] === 'operations' && f.appProperties['operationCount'] === '1' && f.id === 'file-2');
    expect(corrotto).toBeDefined();
    backend.corrupt(corrotto!.id, (content) => content.replace('"reps":8', '"reps":88'));

    const primo = await tablet.engine.pull();
    expect(primo.rejected.map((r) => r.code)).toContain('digest-non-corrispondente');
    expect(primo.operationsApplied).toBe(0);
    expect(await tablet.store.readEntity('performedSet', 'set-corrotto')).toBeNull();
    // Lo storico precedente e' intatto.
    expect(await tablet.store.listEntities()).toEqual(storicoPrima);

    // (b) Download interrotto a metà: JSON troncato, stesso esito.
    await telefono.engine.recordLocalChange({
      entityType: 'performedSet',
      entityId: 'set-troncato',
      kind: 'upsert',
      payload: { reps: 6 },
    });
    await telefono.engine.push();
    tablet.drive.truncateNextDownload(2);
    const secondo = await tablet.engine.pull();
    expect(secondo.rejected.map((r) => r.code)).toContain('json-non-valido');
    expect(await tablet.store.readEntity('performedSet', 'set-troncato')).toBeNull();
    expect(await tablet.store.listEntities()).toEqual(storicoPrima);

    // Riletto integro, il pacchetto viene applicato: il rifiuto non e'
    // definitivo, perche' il pacchetto remoto non e' stato toccato.
    const terzo = await tablet.engine.pull();
    expect(terzo.rejected.every((r) => r.code !== 'json-non-valido')).toBe(true);
    expect((await tablet.store.readEntity('performedSet', 'set-troncato'))?.fields['reps']).toBe(6);
  });
});
