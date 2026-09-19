/**
 * Migrazione 002 — distinzione "precompilato / eseguito" e indice per i
 * conflitti.
 *
 * Non e' una migrazione fittizia messa qui per far esistere un percorso di
 * migrazione: risolve due mancanze reali di 001.
 *
 * 1. `performed_sets.prefilled`
 *    La specifica (§5 e §10) distingue quattro stati di un numero:
 *    prescritto · suggerito · precompilato · eseguito, e chiede che "i valori
 *    precompilati non sono eseguiti". 001 registra il valore confermato ma non
 *    registra se quel valore e' stato DIGITATO o soltanto ACCETTATO cosi' come
 *    era stato precompilato dall'ultima prestazione comparabile. E' una
 *    differenza che conta per il motore adattivo: una serie confermata senza
 *    toccare il campo e' un dato piu' debole di una serie digitata, e senza
 *    questa colonna l'informazione e' perduta per sempre.
 *    Colonna con DEFAULT 0 ("digitato / non precompilato"): le righe storiche
 *    esistenti restano valide e non serve riscriverle.
 *
 * 2. `idx_sync_operations_entity`
 *    Il rilevamento dei conflitti (§8.2) cerca "le operazioni locali ancora
 *    non inviate che riguardano QUESTA entita'" per ogni entita' che arriva
 *    da Drive. In 001 quella ricerca e' una scansione completa della coda, che
 *    su un archivio di tre anni contiene decine di migliaia di righe.
 *
 * Nota sul perche' `ALTER TABLE ... ADD COLUMN` va bene qui: SQLite lo
 * esegue come operazione di sola intestazione, senza riscrivere le righe, e
 * su una tabella STRICT accetta un DEFAULT costante. Nessuna copia della
 * tabella, quindi nessuna finestra in cui lo storico e' a rischio.
 */

export const MIGRATION_002_SQL = `
ALTER TABLE performed_sets
  ADD COLUMN prefilled INTEGER NOT NULL DEFAULT 0 CHECK (prefilled IN (0,1));

CREATE INDEX IF NOT EXISTS idx_sync_operations_entity
  ON sync_operations (entity_table, entity_id);
`;
