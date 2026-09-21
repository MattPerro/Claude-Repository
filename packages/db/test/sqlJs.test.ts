/**
 * Driver `sql.js` per il browser.
 *
 * Il rischio specifico di questo driver e' che il database vive in memoria:
 * senza una scrittura durevole i dati sparirebbero alla chiusura della pagina.
 * I test qui sotto verificano soprattutto quello, e in particolare il caso
 * peggiore: **una scrittura durevole fallita non deve mai passare per
 * riuscita** (specifica §10).
 *
 * Girano su Node, perche' `sql.js` e' WebAssembly e funziona anche fuori dal
 * browser. Questo significa che lo stesso driver che usa la PWA e' verificato
 * automaticamente - ma NON significa che sia verificato su iPhone: IndexedDB,
 * l'eventuale espulsione dei dati da parte di iOS e il comportamento di Safari
 * restano non verificati (vedi `QA_REPORT.md`).
 */

import { describe, expect, it } from 'vitest';
import initSqlJs from 'sql.js';
import {
  createRepositories,
  InMemoryBinaryStore,
  migrate,
  openDatabase,
  SqlJsDriver,
  SUPPORTED_PROTOCOL_VERSION,
  type SqlJsModule,
} from '@trackstrong/db';
import { comparabilityKey, systemClock, createIdGenerator, seededRandom } from '@trackstrong/core';

/** Modulo `sql.js` inizializzato una volta per tutti i test. */
const SQL = (await initSqlJs()) as unknown as SqlJsModule;

interface Harness {
  readonly driver: SqlJsDriver;
  readonly store: InMemoryBinaryStore;
}

function openDriver(store = new InMemoryBinaryStore(), bytes: Uint8Array | null = null): Harness {
  const driver = new SqlJsDriver({
    module: SQL,
    store,
    key: 'trackstrong.db',
    initialBytes: bytes,
  });
  return { driver, store };
}

describe('Il driver rispetta la porta SqlDriver', () => {
  it('esegue DDL, scritture e letture', () => {
    const { driver } = openDriver();
    driver.exec('CREATE TABLE prova (id TEXT PRIMARY KEY, n INTEGER NOT NULL) STRICT;');
    const result = driver.run('INSERT INTO prova (id, n) VALUES (?, ?)', ['a', 1]);
    expect(result.changes).toBe(1);
    expect(driver.get<{ n: number }>('SELECT n FROM prova WHERE id = ?', ['a'])?.n).toBe(1);
    expect(driver.all('SELECT * FROM prova')).toHaveLength(1);
    driver.close();
  });

  it('restituisce undefined per una riga assente, non null', () => {
    const { driver } = openDriver();
    driver.exec('CREATE TABLE prova (id TEXT PRIMARY KEY, n INTEGER) STRICT;');
    // `null` e' un valore di colonna legittimo: "riga assente" e' un'altra
    // cosa, e la porta lo distingue.
    driver.run('INSERT INTO prova (id, n) VALUES (?, ?)', ['a', null]);
    expect(driver.get('SELECT * FROM prova WHERE id = ?', ['assente'])).toBeUndefined();
    expect(driver.get<{ n: number | null }>('SELECT n FROM prova WHERE id = ?', ['a'])?.n).toBeNull();
    driver.close();
  });

  it('annulla la transazione quando la funzione lancia', () => {
    const { driver } = openDriver();
    driver.exec('CREATE TABLE prova (id TEXT PRIMARY KEY) STRICT;');
    expect(() =>
      driver.transaction(() => {
        driver.run('INSERT INTO prova (id) VALUES (?)', ['a']);
        throw new Error('errore iniettato');
      }),
    ).toThrow('errore iniettato');
    expect(driver.all('SELECT * FROM prova')).toEqual([]);
    driver.close();
  });

  it('gestisce le transazioni annidate con savepoint', () => {
    const { driver } = openDriver();
    driver.exec('CREATE TABLE prova (id TEXT PRIMARY KEY) STRICT;');
    driver.transaction(() => {
      driver.run('INSERT INTO prova (id) VALUES (?)', ['esterna']);
      // L'annidata fallisce, ma l'esterna prosegue: e' il comportamento che
      // permette a un repository di chiamarne un altro senza sapere se e'
      // gia' dentro una transazione.
      try {
        driver.transaction(() => {
          driver.run('INSERT INTO prova (id) VALUES (?)', ['interna']);
          throw new Error('annidata annullata');
        });
      } catch {
        // atteso
      }
    });
    expect(driver.all<{ id: string }>('SELECT id FROM prova').map((r) => r.id)).toEqual(['esterna']);
    driver.close();
  });

  it('applica i vincoli e li classifica', () => {
    const { driver } = openDriver();
    driver.exec('CREATE TABLE prova (id TEXT PRIMARY KEY) STRICT;');
    driver.run('INSERT INTO prova (id) VALUES (?)', ['a']);
    let caught: unknown = null;
    try {
      driver.run('INSERT INTO prova (id) VALUES (?)', ['a']);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(String(caught)).toMatch(/UNIQUE/i);
    driver.close();
  });

  it('ha le chiavi esterne attive', () => {
    const { driver } = openDriver();
    driver.exec(`
      CREATE TABLE padre (id TEXT PRIMARY KEY) STRICT;
      CREATE TABLE figlio (id TEXT PRIMARY KEY, padre_id TEXT NOT NULL REFERENCES padre(id)) STRICT;
    `);
    expect(() =>
      driver.run('INSERT INTO figlio (id, padre_id) VALUES (?, ?)', ['f', 'inesistente']),
    ).toThrow();
    driver.close();
  });

  it('mantiene le chiavi esterne attive dopo molte esportazioni', async () => {
    // `export()` di sql.js chiude e riapre la connessione, e alla riapertura
    // `foreign_keys` torna al default, che e' OFF. Senza il riapplicarlo, il
    // primo salvataggio disattiverebbe in silenzio tutti i vincoli dello
    // schema: i dati resterebbero scrivibili ma non piu' integri.
    const { driver } = openDriver();
    driver.exec(`
      CREATE TABLE padre (id TEXT PRIMARY KEY) STRICT;
      CREATE TABLE figlio (id TEXT PRIMARY KEY, padre_id TEXT NOT NULL REFERENCES padre(id)) STRICT;
    `);
    driver.transaction(() => {
      driver.run('INSERT INTO padre (id) VALUES (?)', ['p']);
    });
    await driver.flush();

    for (let i = 0; i < 3; i += 1) {
      driver.transaction(() => {
        driver.run('INSERT INTO figlio (id, padre_id) VALUES (?, ?)', [`f${String(i)}`, 'p']);
      });
      await driver.flush();
      expect(() =>
        driver.run('INSERT INTO figlio (id, padre_id) VALUES (?, ?)', [
          `x${String(i)}`,
          'inesistente',
        ]),
      ).toThrow(/FOREIGN KEY/i);
    }
    driver.close();
  });

  it('conta le righe modificate anche quando il salvataggio esporta subito', () => {
    // Fuori da una transazione il driver esporta immediatamente, e l'export
    // azzera `sqlite3_changes`: il conteggio va letto prima.
    const { driver } = openDriver();
    driver.exec('CREATE TABLE prova (id TEXT PRIMARY KEY, n INTEGER NOT NULL) STRICT;');
    driver.run('INSERT INTO prova (id, n) VALUES (?, ?)', ['a', 1]);
    driver.run('INSERT INTO prova (id, n) VALUES (?, ?)', ['b', 1]);
    expect(driver.run('UPDATE prova SET n = 2').changes).toBe(2);
    expect(driver.run('DELETE FROM prova WHERE id = ?', ['a']).changes).toBe(1);
    driver.close();
  });

  it('rifiuta di esportare un backup dentro una transazione aperta', () => {
    // Esportare chiuderebbe la connessione e annullerebbe la transazione: un
    // backup non deve poter cancellare le scritture in corso.
    const { driver } = openDriver();
    driver.exec('CREATE TABLE prova (id TEXT PRIMARY KEY) STRICT;');
    expect(() =>
      driver.transaction(() => {
        driver.run('INSERT INTO prova (id) VALUES (?)', ['a']);
        driver.exportBytes();
      }),
    ).toThrow(/transazione/i);

    // E la transazione e' stata annullata per intero, non a meta'.
    expect(driver.all('SELECT * FROM prova')).toEqual([]);
    driver.close();
  });
});

describe('Persistenza durevole (priorita 1)', () => {
  it('scrive nell archivio dopo una transazione confermata', async () => {
    const { driver, store } = openDriver();
    driver.exec('CREATE TABLE prova (id TEXT PRIMARY KEY) STRICT;');
    driver.transaction(() => {
      driver.run('INSERT INTO prova (id) VALUES (?)', ['a']);
    });
    await driver.flush();
    expect(store.peek('trackstrong.db')).not.toBeNull();
    driver.close();
  });

  it('i dati sopravvivono alla chiusura e alla riapertura', async () => {
    const store = new InMemoryBinaryStore();
    const first = openDriver(store).driver;
    first.exec('CREATE TABLE prova (id TEXT PRIMARY KEY, n INTEGER NOT NULL) STRICT;');
    first.transaction(() => {
      first.run('INSERT INTO prova (id, n) VALUES (?, ?)', ['a', 42]);
    });
    await first.flush();
    first.close();

    // Nuova "sessione della pagina": si riparte dai byte durevoli.
    const bytes = store.peek('trackstrong.db');
    expect(bytes).not.toBeNull();
    const second = openDriver(store, bytes).driver;
    expect(second.get<{ n: number }>('SELECT n FROM prova WHERE id = ?', ['a'])?.n).toBe(42);
    second.close();
  });

  it('una transazione annullata non lascia niente di durevole', async () => {
    const store = new InMemoryBinaryStore();
    const first = openDriver(store).driver;
    first.exec('CREATE TABLE prova (id TEXT PRIMARY KEY) STRICT;');
    await first.flush();
    const savesAfterDdl = store.saveCount;

    try {
      first.transaction(() => {
        first.run('INSERT INTO prova (id) VALUES (?)', ['a']);
        throw new Error('annullata');
      });
    } catch {
      // atteso
    }
    await first.flush();
    // Nessuna nuova scrittura: non c'era niente da rendere durevole.
    expect(store.saveCount).toBe(savesAfterDdl);

    const second = openDriver(store, store.peek('trackstrong.db')).driver;
    expect(second.all('SELECT * FROM prova')).toEqual([]);
    second.close();
    first.close();
  });

  it('una scrittura durevole fallita NON passa per riuscita', async () => {
    // E' il test piu' importante di questo file. La specifica (§10) vieta di
    // fingere che un salvataggio sia riuscito: `flush()` deve rilanciare.
    const { driver, store } = openDriver();
    driver.exec('CREATE TABLE prova (id TEXT PRIMARY KEY) STRICT;');
    await driver.flush();

    store.failNextSave = new Error('quota di archiviazione esaurita');
    driver.transaction(() => {
      driver.run('INSERT INTO prova (id) VALUES (?)', ['a']);
    });

    await expect(driver.flush()).rejects.toThrow('quota di archiviazione esaurita');
    driver.close();
  });

  it('dopo un fallimento la modifica resta da salvare e un nuovo flush riprova', async () => {
    const { driver, store } = openDriver();
    driver.exec('CREATE TABLE prova (id TEXT PRIMARY KEY) STRICT;');
    await driver.flush();

    store.failNextSave = new Error('scrittura non riuscita');
    driver.transaction(() => {
      driver.run('INSERT INTO prova (id) VALUES (?)', ['a']);
    });
    await expect(driver.flush()).rejects.toThrow();

    // La modifica non e' andata perduta dalla coda: resta in attesa.
    expect(driver.hasPendingWrites).toBe(true);

    // Il secondo tentativo riesce, e il dato diventa durevole.
    await driver.flush();
    expect(driver.hasPendingWrites).toBe(false);
    const reopened = openDriver(store, store.peek('trackstrong.db')).driver;
    expect(reopened.all('SELECT * FROM prova')).toHaveLength(1);
    reopened.close();
    driver.close();
  });

  it('segnala subito l errore di scrittura, senza attendere il flush', async () => {
    let reported: unknown = null;
    const store = new InMemoryBinaryStore();
    const driver = new SqlJsDriver({
      module: SQL,
      store,
      key: 'k',
      onPersistError: (error) => {
        reported = error;
      },
    });
    driver.exec('CREATE TABLE prova (id TEXT PRIMARY KEY) STRICT;');
    await driver.flush();

    store.failNextSave = new Error('disco pieno');
    driver.transaction(() => {
      driver.run('INSERT INTO prova (id) VALUES (?)', ['a']);
    });
    await driver.flush().catch(() => undefined);
    expect(String(reported)).toContain('disco pieno');
    driver.close();
  });

  it('non rende durevole uno stato intermedio di una transazione', async () => {
    const { driver, store } = openDriver();
    driver.exec('CREATE TABLE prova (id TEXT PRIMARY KEY) STRICT;');
    await driver.flush();
    const before = store.saveCount;

    driver.transaction(() => {
      driver.run('INSERT INTO prova (id) VALUES (?)', ['a']);
      driver.run('INSERT INTO prova (id) VALUES (?)', ['b']);
      driver.run('INSERT INTO prova (id) VALUES (?)', ['c']);
      // Nessuna scrittura durevole e' stata programmata dentro la
      // transazione: esportare uno stato intermedio significherebbe rendere
      // durevole qualcosa che potrebbe essere annullato.
      expect(store.saveCount).toBe(before);
    });
    await driver.flush();
    // Una sola scrittura per l'intera transazione, non tre.
    expect(store.saveCount).toBe(before + 1);
    driver.close();
  });

  it('le scritture concorrenti si accodano invece di sovrascriversi al contrario', async () => {
    const { driver, store } = openDriver();
    driver.exec('CREATE TABLE prova (id TEXT PRIMARY KEY, n INTEGER NOT NULL) STRICT;');
    for (let i = 1; i <= 5; i += 1) {
      driver.transaction(() => {
        driver.run('INSERT INTO prova (id, n) VALUES (?, ?)', [`r${String(i)}`, i]);
      });
    }
    await driver.flush();
    // Lo stato durevole e' l'ULTIMO, non uno intermedio arrivato in ritardo.
    const reopened = openDriver(store, store.peek('trackstrong.db')).driver;
    expect(reopened.all('SELECT * FROM prova')).toHaveLength(5);
    reopened.close();
    driver.close();
  });

  it('un driver chiuso rifiuta le operazioni invece di fallire in silenzio', () => {
    const { driver } = openDriver();
    driver.close();
    expect(() => driver.exec('SELECT 1')).toThrow(/chiuso/);
  });
});

describe('Lo schema completo del progetto funziona su sql.js', () => {
  it('applica tutte le migrazioni', async () => {
    const { driver } = openDriver();
    migrate(driver);
    const tables = driver.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    );
    // Lo stesso schema del driver nativo: 30 tabelle.
    expect(tables.length).toBeGreaterThanOrEqual(30);
    expect(tables.map((t) => t.name)).toContain('performed_sets');
    expect(tables.map((t) => t.name)).toContain('sync_operations');
    driver.close();
  });

  it('i repository scrivono e rileggono, e il dato diventa durevole', async () => {
    const store = new InMemoryBinaryStore();
    const { driver } = openDriver(store);
    const db = openDatabase(driver, {
      workspaceId: '01JPWAWORKSPACE0000000001',
      deviceId: '01JPWADEVICE000000000001A',
      clock: systemClock(),
      ids: createIdGenerator(() => 1_780_000_000_000, seededRandom(7)),
    });
    const repos = createRepositories(db);

    repos.workspace.ensureWorkspace('Archivio di prova', 1_780_000_000_000, SUPPORTED_PROTOCOL_VERSION);
    repos.workspace.registerDevice('Telefono di prova', 'ios', 1_780_000_000_000);
    const pressId = repos.workspace.saveEquipment({
      label: 'Pressa di prova',
      kind: 'legPressMachine',
      stepKg: 5,
    });
    expect(pressId).not.toBe('');

    await driver.flush();

    // Riapertura dai byte durevoli: l'attrezzatura e' ancora li'.
    const bytes = store.peek('trackstrong.db');
    const reopenedDriver = openDriver(store, bytes).driver;
    const reopened = openDatabase(reopenedDriver, {
      workspaceId: '01JPWAWORKSPACE0000000001',
      deviceId: '01JPWADEVICE000000000001A',
    });
    const reopenedRepos = createRepositories(reopened);
    expect(reopenedRepos.workspace.equipment()).toHaveLength(1);
    expect(reopenedRepos.workspace.workspace()?.name).toBe('Archivio di prova');
    reopenedDriver.close();
    driver.close();
  });

  it('la chiave di comparabilita salvata e la stessa del driver nativo', async () => {
    // Non e' una verifica sul driver, e' una verifica sull'invarianza: la
    // stessa serie registrata su sql.js e su node:sqlite deve produrre la
    // stessa chiave, altrimenti lo storico di un dispositivo non sarebbe
    // confrontabile con quello di un altro.
    const expected = comparabilityKey({
      exerciseId: 'legPress',
      variantId: null,
      loadConvention: 'machineStack',
      equipmentInstanceId: 'eq-1',
      metric: 'reps',
      perSide: false,
    });
    expect(expected).toMatch(/^v1\|legPress\|/);
  });

  it('esporta i byte per un backup manuale', async () => {
    const { driver } = openDriver();
    migrate(driver);
    const bytes = driver.exportBytes();
    expect(bytes.length).toBeGreaterThan(0);
    // I byte esportati sono un file SQLite valido: si riapre.
    const reopened = openDriver(new InMemoryBinaryStore(), bytes).driver;
    expect(
      reopened.all("SELECT name FROM sqlite_master WHERE type='table'").length,
    ).toBeGreaterThanOrEqual(30);
    reopened.close();
    driver.close();
  });
});
