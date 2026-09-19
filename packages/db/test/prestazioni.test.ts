/**
 * Prestazioni su un archivio sintetico di tre anni.
 *
 * Scopo: verificare che il percorso critico della registrazione (§4,
 * priorita' 3: "essere semplice e veloce durante l'allenamento") non degradi
 * quando lo storico raggiunge la dimensione prevista dalla specifica (tre
 * anni di percorso, due sedute a settimana).
 *
 * Le soglie sono deliberatamente GENEROSE: questo test gira su una macchina
 * di sviluppo condivisa, non su un iPhone 15, e non pretende di misurare il
 * dispositivo. Serve a cogliere una regressione di ordine di grandezza (una
 * scansione completa al posto di un indice), non a certificare una latenza.
 * I numeri reali misurati vengono stampati.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { comparabilityKey } from '@trackstrong/core';

import { openTestDb, syntheticSnapshot, T0, type TestContext } from './helpers.js';

/** Tre anni, due sedute a settimana: 156 settimane x 2 = 312 sedute. */
const SEDUTE = 312;
const ESERCIZI_PER_SEDUTA = 4;
const SERIE_PER_ESERCIZIO = 5;
const MISURAZIONI = 500;

interface ArchivioSintetico {
  readonly sedute: number;
  readonly serie: number;
  readonly misurazioni: number;
  readonly operazioni: number;
  readonly generazioneMs: number;
}

/**
 * Genera l'archivio con SQL diretta dentro una sola transazione.
 *
 * Non passa dai repository di proposito: qui interessa costruire in fretta
 * uno storico realistico, non misurare la generazione. Il percorso che viene
 * misurato dopo (registrazione di una serie) passa invece dai repository
 * veri, con la loro transazione e la loro operazione di sincronizzazione.
 */
function generaTreAnni(ctx: TestContext): ArchivioSintetico {
  const inizio = performance.now();
  let serie = 0;
  let operazioni = 0;

  ctx.db.driver.transaction(() => {
    let lamport = 0;
    const giornoBase = Date.UTC(2027, 2, 1);

    for (let s = 0; s < SEDUTE; s += 1) {
      const sessionId = `sessione-prova-${String(s).padStart(4, '0')}`;
      const giorno = new Date(giornoBase + s * 3.5 * 86_400_000).toISOString().slice(0, 10);
      const istante = giornoBase + s * 3.5 * 86_400_000 + 18 * 3_600_000;

      ctx.db.driver.run(
        `INSERT INTO sessions (id, workspace_id, planned_date, performed_date, slot, status,
           prescription_snapshot, plan_version, week_index, block_id, paused_ms,
           started_at, ended_at, owner_device_id, revision, updated_at)
         VALUES (?, ?, ?, ?, ?, 'completed', ?, 1, ?, 'blocco-prova-1', 0, ?, ?, NULL, 1, ?)`,
        [
          sessionId,
          ctx.db.workspaceId,
          giorno,
          giorno,
          s % 2 === 0 ? 'A' : 'B',
          JSON.stringify(syntheticSnapshot(1, Math.floor(s / 2) + 1)),
          Math.floor(s / 2) + 1,
          istante,
          istante + 4_200_000,
          T0,
        ],
      );

      for (let e = 0; e < ESERCIZI_PER_SEDUTA; e += 1) {
        const exerciseId = `${sessionId}-es-${String(e)}`;
        ctx.db.driver.run(
          `INSERT INTO performed_exercises (id, session_id, order_index, exercise_id,
             equipment_instance_id, technique, skipped, revision, updated_at)
           VALUES (?, ?, ?, ?, ?, 'controlled', 0, 1, ?)`,
          [exerciseId, sessionId, e + 1, `es-prova-${String(e + 1)}`, ctx.pressAId, T0],
        );

        const chiave = comparabilityKey({
          exerciseId: `es-prova-${String(e + 1)}`,
          variantId: null,
          loadConvention: 'machineStack',
          equipmentInstanceId: ctx.pressAId,
          metric: 'reps',
          perSide: false,
        });

        for (let i = 0; i < SERIE_PER_ESERCIZIO; i += 1) {
          const setId = `${exerciseId}-serie-${String(i)}`;
          ctx.db.driver.run(
            `INSERT INTO performed_sets (id, session_id, performed_exercise_id, order_index, role,
               load_convention, load_kg, equipment_instance_id, metric, reps, side, rir,
               status, completed_at, comparability_key, idempotency_key, prefilled, revision, updated_at)
             VALUES (?, ?, ?, ?, ?, 'machineStack', ?, ?, 'reps', ?, 'both', 2,
                     'completed', ?, ?, ?, 0, 1, ?)`,
            [
              setId,
              sessionId,
              exerciseId,
              i + 1,
              i === 0 ? 'warmup' : 'working',
              40 + (s % 40) + e * 5,
              ctx.pressAId,
              8 + (i % 3),
              istante + i * 180_000,
              chiave,
              `${sessionId}|${exerciseId}|${String(i + 1)}|both`,
              T0,
            ],
          );
          serie += 1;

          lamport += 1;
          operazioni += 1;
          ctx.db.driver.run(
            `INSERT INTO sync_operations (id, workspace_id, origin_device_id, entity_table,
               entity_id, op_kind, base_revision, revision, format_version, payload_json,
               created_at, lamport, cause, bundle_id, sent_at, attempt_count, last_error)
             VALUES (?, ?, ?, 'performed_sets', ?, 'upsert', NULL, 1, 1, '{}', ?, ?,
                     'storico sintetico', NULL, ?, 0, NULL)`,
            [
              `op-${String(lamport).padStart(6, '0')}`,
              ctx.db.workspaceId,
              ctx.db.deviceId,
              setId,
              istante,
              lamport,
              istante,
            ],
          );
        }
      }
    }

    for (let m = 0; m < MISURAZIONI; m += 1) {
      const giorno = new Date(giornoBase + m * 2 * 86_400_000).toISOString().slice(0, 10);
      ctx.db.driver.run(
        `INSERT INTO measurements (id, workspace_id, kind, value, measured_on, recorded_at,
           revision, updated_at)
         VALUES (?, ?, 'weightKg', ?, ?, ?, 1, ?)`,
        [
          `misura-prova-${String(m).padStart(4, '0')}`,
          ctx.db.workspaceId,
          90 - m * 0.005,
          giorno,
          giornoBase + m * 2 * 86_400_000,
          T0,
        ],
      );
    }
  });

  return {
    sedute: SEDUTE,
    serie,
    misurazioni: MISURAZIONI,
    operazioni,
    generazioneMs: performance.now() - inizio,
  };
}

function mediana(valori: readonly number[]): number {
  const ordinati = [...valori].sort((a, b) => a - b);
  const meta = Math.floor(ordinati.length / 2);
  if (ordinati.length % 2 === 1) return ordinati[meta] ?? 0;
  return ((ordinati[meta - 1] ?? 0) + (ordinati[meta] ?? 0)) / 2;
}

describe('archivio sintetico di tre anni', () => {
  it(
    'registrare una nuova serie e cercare l\'ultima prestazione comparabile restano rapidi',
    () => {
      const ctx = openTestDb();
      const archivio = generaTreAnni(ctx);

      // Dimensioni effettive dell'archivio generato.
      const conteggi = {
        sessions: ctx.db.driver.get<{ n: number }>('SELECT COUNT(*) AS n FROM sessions')?.n ?? 0,
        performed_sets:
          ctx.db.driver.get<{ n: number }>('SELECT COUNT(*) AS n FROM performed_sets')?.n ?? 0,
        measurements:
          ctx.db.driver.get<{ n: number }>('SELECT COUNT(*) AS n FROM measurements')?.n ?? 0,
        sync_operations:
          ctx.db.driver.get<{ n: number }>('SELECT COUNT(*) AS n FROM sync_operations')?.n ?? 0,
      };
      expect(conteggi.sessions).toBe(SEDUTE);
      expect(conteggi.performed_sets).toBe(SEDUTE * ESERCIZI_PER_SEDUTA * SERIE_PER_ESERCIZIO);
      expect(conteggi.measurements).toBe(MISURAZIONI);

      const chiave = comparabilityKey({
        exerciseId: 'es-prova-1',
        variantId: null,
        loadConvention: 'machineStack',
        equipmentInstanceId: ctx.pressAId,
        metric: 'reps',
        perSide: false,
      });

      // --- Query "ultima prestazione comparabile" ---------------------------
      // E' quella che l'app esegue per precompilare il campo a ogni serie.
      const tempiQuery: number[] = [];
      for (let i = 0; i < 200; i += 1) {
        const t = performance.now();
        const ultima = ctx.repos.sets.lastComparable(chiave);
        tempiQuery.push(performance.now() - t);
        expect(ultima).not.toBeNull();
        expect(ultima?.comparabilityKey).toBe(chiave);
      }

      // --- Inserimento di una nuova serie ----------------------------------
      // Percorso completo: validazione, chiave di comparabilita', transazione,
      // riga + operazione di sincronizzazione.
      const nuovaSeduta = ctx.repos.sessions.start({
        plannedDate: '2030-02-28',
        slot: 'A',
        snapshot: syntheticSnapshot(1, 157),
        startedAt: T0,
      });
      const nuovoEsercizio = ctx.repos.sessions.addExercise({
        sessionId: nuovaSeduta.id,
        order: 1,
        exerciseId: 'es-prova-1',
        equipmentInstanceId: ctx.pressAId,
      });

      const tempiInserimento: number[] = [];
      for (let i = 0; i < 50; i += 1) {
        const t = performance.now();
        const esito = ctx.repos.sets.record({
          sessionId: nuovaSeduta.id,
          performedExerciseId: nuovoEsercizio,
          order: i + 1,
          role: 'working',
          exerciseId: 'es-prova-1',
          variantId: null,
          perSide: false,
          load: { convention: 'machineStack', kg: 75, equipmentInstanceId: ctx.pressAId },
          metric: 'reps',
          reps: 9,
          seconds: null,
          side: 'both',
          rir: 2,
          note: null,
          status: 'completed',
          completedAt: T0 + i * 120_000,
        });
        tempiInserimento.push(performance.now() - t);
        expect(esito.inserted).toBe(true);
      }

      const rapporto = {
        archivio: {
          ...conteggi,
          generazioneMs: Math.round(archivio.generazioneMs),
        },
        inserimentoSerieMs: {
          mediana: Number(mediana(tempiInserimento).toFixed(3)),
          massimo: Number(Math.max(...tempiInserimento).toFixed(3)),
          medio: Number(
            (tempiInserimento.reduce((a, b) => a + b, 0) / tempiInserimento.length).toFixed(3),
          ),
        },
        ultimaComparabileMs: {
          mediana: Number(mediana(tempiQuery).toFixed(3)),
          massimo: Number(Math.max(...tempiQuery).toFixed(3)),
          medio: Number((tempiQuery.reduce((a, b) => a + b, 0) / tempiQuery.length).toFixed(3)),
        },
      };
      // Stampato di proposito: il rapporto del lavoro deve riportare numeri
      // realmente misurati, non soglie.
      // eslint-disable-next-line no-console
      console.log('[prestazioni] ' + JSON.stringify(rapporto, null, 2));

      // Soglie generose: cercano la regressione di ordine di grandezza.
      expect(mediana(tempiInserimento)).toBeLessThan(50);
      expect(mediana(tempiQuery)).toBeLessThan(20);
      ctx.close();
    },
    // L'archivio di tre anni richiede piu' del timeout predefinito.
    120_000,
  );

  it('su un database su FILE (con WAL) la registrazione resta rapida', () => {
    // La misura in memoria sottostima il costo reale: sull'iPhone il
    // database e' un file, con WAL e fsync. Questo caso usa un file vero.
    // Resta comunque una misura su Linux, non sul dispositivo.
    const cartella = mkdtempSync(join(tmpdir(), 'trackstrong-perf-'));
    const ctx = openTestDb({ location: join(cartella, 'prova.db') });
    try {
      const archivio = generaTreAnni(ctx);
      const giornale = ctx.db.driver.get<{ journal_mode: string }>('PRAGMA journal_mode');
      expect(giornale?.journal_mode).toBe('wal');

      const chiave = comparabilityKey({
        exerciseId: 'es-prova-1',
        variantId: null,
        loadConvention: 'machineStack',
        equipmentInstanceId: ctx.pressAId,
        metric: 'reps',
        perSide: false,
      });

      const seduta = ctx.repos.sessions.start({
        plannedDate: '2030-02-28',
        slot: 'A',
        snapshot: syntheticSnapshot(1, 157),
        startedAt: T0,
      });
      const esercizio = ctx.repos.sessions.addExercise({
        sessionId: seduta.id,
        order: 1,
        exerciseId: 'es-prova-1',
        equipmentInstanceId: ctx.pressAId,
      });

      const tempiInserimento: number[] = [];
      for (let i = 0; i < 50; i += 1) {
        const t = performance.now();
        ctx.repos.sets.record({
          sessionId: seduta.id,
          performedExerciseId: esercizio,
          order: i + 1,
          role: 'working',
          exerciseId: 'es-prova-1',
          variantId: null,
          perSide: false,
          load: { convention: 'machineStack', kg: 75, equipmentInstanceId: ctx.pressAId },
          metric: 'reps',
          reps: 9,
          seconds: null,
          side: 'both',
          rir: 2,
          note: null,
          status: 'completed',
          completedAt: T0 + i * 120_000,
        });
        tempiInserimento.push(performance.now() - t);
      }

      const tempiQuery: number[] = [];
      for (let i = 0; i < 200; i += 1) {
        const t = performance.now();
        ctx.repos.sets.lastComparable(chiave);
        tempiQuery.push(performance.now() - t);
      }

      // eslint-disable-next-line no-console
      console.log(
        '[prestazioni-file] ' +
          JSON.stringify(
            {
              generazioneMs: Math.round(archivio.generazioneMs),
              serie: archivio.serie,
              inserimentoSerieMs: {
                mediana: Number(mediana(tempiInserimento).toFixed(3)),
                massimo: Number(Math.max(...tempiInserimento).toFixed(3)),
              },
              ultimaComparabileMs: {
                mediana: Number(mediana(tempiQuery).toFixed(3)),
                massimo: Number(Math.max(...tempiQuery).toFixed(3)),
              },
            },
            null,
            2,
          ),
      );

      expect(mediana(tempiInserimento)).toBeLessThan(100);
      expect(mediana(tempiQuery)).toBeLessThan(20);
    } finally {
      ctx.close();
      rmSync(cartella, { recursive: true, force: true });
    }
  }, 180_000);

  it('l\'indice di comparabilita\' viene effettivamente usato', () => {
    const ctx = openTestDb();
    generaTreAnni(ctx);
    // Se questa query smette di usare l'indice, la latenza di
    // precompilazione cresce con lo storico: il piano di esecuzione e' la
    // verifica strutturale, i tempi sopra sono quella empirica.
    const piano = ctx.db.driver
      .all<{ detail: string }>(
        `EXPLAIN QUERY PLAN
         SELECT * FROM performed_sets WHERE comparability_key = ? AND status = 'completed'
         ORDER BY completed_at DESC, id DESC LIMIT 1`,
        ['chiave-qualsiasi'],
      )
      .map((r) => r.detail)
      .join(' | ');
    expect(piano).toContain('idx_performed_sets_comparability');
    expect(piano).not.toContain('SCAN performed_sets');
    ctx.close();
  }, 120_000);
});
