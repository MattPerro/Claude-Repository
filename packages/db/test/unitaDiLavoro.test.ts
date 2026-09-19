/**
 * `withWrite`: dato e operazione di sincronizzazione nella stessa transazione.
 *
 * E' il requisito §7 in forma eseguibile. Il test di rollback e' quello che
 * conta davvero: dimostra che se l'accodamento dell'operazione fallisce, la
 * modifica ai dati NON sopravvive.
 */

import { describe, expect, it } from 'vitest';

import { withWrite, type Database, type WriteContext } from '@trackstrong/db';

import { openTestDb, T0 } from './helpers.js';

describe('withWrite scrive dato e operazione nella stessa transazione', () => {
  it('una misurazione confermata lascia in coda esattamente un\'operazione', () => {
    const ctx = openTestDb();
    const primaOperazioni = contaOperazioni(ctx.db, 'measurements');

    const misura = ctx.repos.measurements.record({
      kind: 'weightKg',
      value: 86.2,
      measuredOn: '2027-03-03',
      recordedAt: T0,
    });

    const righe = ctx.db.driver.all<{ id: string }>('SELECT id FROM measurements');
    expect(righe.map((r) => r.id)).toEqual([misura.id]);

    const operazioni = ctx.db.driver.all<{
      entity_id: string;
      op_kind: string;
      revision: number;
      format_version: number;
      origin_device_id: string;
      payload_json: string;
      lamport: number;
    }>("SELECT * FROM sync_operations WHERE entity_table = 'measurements'");

    expect(operazioni).toHaveLength(primaOperazioni + 1);
    expect(operazioni[0]?.entity_id).toBe(misura.id);
    expect(operazioni[0]?.op_kind).toBe('upsert');
    expect(operazioni[0]?.revision).toBe(1);
    expect(operazioni[0]?.origin_device_id).toBe(ctx.db.deviceId);
    expect(operazioni[0]?.format_version).toBe(ctx.db.operationFormatVersion);
    // Il payload descrive proprio la riga scritta.
    const payload = JSON.parse(operazioni[0]?.payload_json ?? '{}') as { id: string; value: number };
    expect(payload.id).toBe(misura.id);
    expect(payload.value).toBeCloseTo(86.2, 5);
    ctx.close();
  });

  it('la tombstone accoda un\'operazione di tipo softDelete', () => {
    const ctx = openTestDb();
    const misura = ctx.repos.measurements.record({
      kind: 'waistCm',
      value: 96,
      measuredOn: '2027-03-03',
      recordedAt: T0,
    });
    ctx.repos.measurements.remove(misura.id);

    const riga = ctx.db.driver.get<{ deleted_at: number | null }>(
      'SELECT deleted_at FROM measurements WHERE id = ?',
      [misura.id],
    );
    // Tombstone, non DELETE: la riga esiste ancora.
    expect(riga?.deleted_at).not.toBeNull();

    const kinds = ctx.db.driver
      .all<{ op_kind: string }>(
        "SELECT op_kind FROM sync_operations WHERE entity_table = 'measurements' AND entity_id = ? ORDER BY lamport",
        [misura.id],
      )
      .map((r) => r.op_kind);
    expect(kinds).toEqual(['upsert', 'softDelete']);
    ctx.close();
  });

  it('le operazioni ricevono un contatore causale crescente', () => {
    const ctx = openTestDb();
    for (const value of [85, 85.5, 86]) {
      ctx.repos.measurements.record({
        kind: 'weightKg',
        value,
        measuredOn: '2027-03-04',
        recordedAt: T0,
      });
    }
    const lamports = ctx.db.driver
      .all<{ lamport: number }>('SELECT lamport FROM sync_operations ORDER BY lamport')
      .map((r) => r.lamport);
    expect(lamports).toEqual([...lamports].sort((a, b) => a - b));
    expect(new Set(lamports).size).toBe(lamports.length);
    ctx.close();
  });

  it('le tabelle di sola pertinenza locale non generano operazioni', () => {
    const ctx = openTestDb();
    const primaCoda = ctx.repos.sync.pendingCount();
    ctx.repos.timers.start({ kind: 'rest', durationSeconds: 120, startedAt: T0 });
    // Un timer e' un fatto di questo dispositivo, adesso: §8 vieta di creare
    // un file remoto per ogni aggiornamento del timer.
    expect(ctx.repos.sync.pendingCount()).toBe(primaCoda);
    expect(ctx.repos.timers.pending()).toHaveLength(1);
    ctx.close();
  });
});

describe('rollback: se l\'accodamento dell\'operazione fallisce, il dato non sopravvive', () => {
  it('un errore iniettato nell\'accodamento annulla anche la scrittura dei dati', () => {
    const ctx = openTestDb();
    const primaMisure = contaRighe(ctx.db, 'measurements');
    const primaOperazioni = contaRighe(ctx.db, 'sync_operations');

    const errore = new Error('Accodamento dell\'operazione di sync fallito (iniettato dal test).');

    expect(() =>
      withWrite(ctx.db, (write: WriteContext) => {
        // 1. il dato viene scritto...
        write.run(
          `INSERT INTO measurements
             (id, workspace_id, kind, value, measured_on, recorded_at, revision, updated_at)
           VALUES (?, ?, 'weightKg', 84.1, '2027-03-05', ?, 1, ?)`,
          ['misura-che-non-deve-restare', ctx.db.workspaceId, T0, T0],
        );
        // ...e a questo punto e' visibile DENTRO la transazione.
        expect(
          write.get<{ n: number }>('SELECT COUNT(*) AS n FROM measurements')?.n,
        ).toBe(primaMisure + 1);

        // 2. l'accodamento dell'operazione fallisce.
        throw errore;
      }),
    ).toThrowError(errore);

    // 3. niente e' sopravvissuto: ne' il dato ne' l'operazione.
    expect(contaRighe(ctx.db, 'measurements')).toBe(primaMisure);
    expect(contaRighe(ctx.db, 'sync_operations')).toBe(primaOperazioni);
    expect(
      ctx.db.driver.get<{ id: string }>('SELECT id FROM measurements WHERE id = ?', [
        'misura-che-non-deve-restare',
      ]),
    ).toBeUndefined();
    ctx.close();
  });

  it('un guasto reale della coda (tabella resa non scrivibile) annulla la modifica', () => {
    const ctx = openTestDb();
    const primaMisure = contaRighe(ctx.db, 'measurements');

    // Guasto non simulato con un `throw`: un TRIGGER che fa fallire davvero
    // l'inserimento nella coda. E' la forma piu' vicina a un disco pieno o a
    // un vincolo violato, e verifica il rollback del driver, non del test.
    ctx.db.driver.exec(`
      CREATE TRIGGER blocca_coda BEFORE INSERT ON sync_operations
      BEGIN
        SELECT RAISE(ABORT, 'coda di sincronizzazione non scrivibile');
      END;
    `);

    expect(() =>
      ctx.repos.measurements.record({
        kind: 'weightKg',
        value: 83.9,
        measuredOn: '2027-03-06',
        recordedAt: T0,
      }),
    ).toThrowError(/coda di sincronizzazione non scrivibile/);

    // La misurazione NON e' stata salvata: "se l'operazione di sync non viene
    // scritta, la modifica non e' avvenuta".
    expect(contaRighe(ctx.db, 'measurements')).toBe(primaMisure);

    ctx.db.driver.exec('DROP TRIGGER blocca_coda;');
    // Rimosso il guasto, la stessa scrittura riesce.
    const misura = ctx.repos.measurements.record({
      kind: 'weightKg',
      value: 83.9,
      measuredOn: '2027-03-06',
      recordedAt: T0,
    });
    expect(ctx.repos.measurements.byId(misura.id)).not.toBeNull();
    ctx.close();
  });

  it('una transazione annidata rotola indietro solo il proprio savepoint', () => {
    const ctx = openTestDb();
    const esterna = withWrite(ctx.db, (write) => {
      const primo = ctx.repos.measurements.record({
        kind: 'waistCm',
        value: 95,
        measuredOn: '2027-03-07',
        recordedAt: T0,
      });
      try {
        withWrite(ctx.db, () => {
          write.run(
            `INSERT INTO measurements
               (id, workspace_id, kind, value, measured_on, recorded_at, revision, updated_at)
             VALUES ('interna', ?, 'waistCm', 94, '2027-03-08', ?, 1, ?)`,
            [ctx.db.workspaceId, T0, T0],
          );
          throw new Error('guasto interno');
        });
      } catch {
        // gestito: la transazione esterna continua.
      }
      return primo.id;
    });

    expect(ctx.repos.measurements.byId(esterna)).not.toBeNull();
    expect(ctx.repos.measurements.byId('interna')).toBeNull();
    ctx.close();
  });
});

function contaRighe(db: Database, table: string): number {
  return db.driver.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`)?.n ?? 0;
}

function contaOperazioni(db: Database, table: string): number {
  return (
    db.driver.get<{ n: number }>(
      'SELECT COUNT(*) AS n FROM sync_operations WHERE entity_table = ?',
      [table],
    )?.n ?? 0
  );
}
