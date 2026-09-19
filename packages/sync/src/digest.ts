/**
 * Impronta del contenuto e serializzazione canonica.
 *
 * ## Avvertenza, esplicita e volutamente ripetuta
 *
 * FNV-1a **non e' una funzione di hash crittografica**. Serve a un solo scopo:
 * accorgersi che un file e' **corrotto** - troncato da un download interrotto,
 * alterato da un errore di archiviazione, incollato a meta'. NON autentica
 * l'autore e NON impedisce una manomissione deliberata, perche' chi modifica il
 * contenuto puo' ricalcolare l'impronta. Per una garanzia contro un avversario
 * servirebbe una firma con chiave, che questo protocollo non implementa: la
 * specifica §14 vieta di dichiarare una protezione non implementata e non
 * verificata.
 *
 * Perche' non SHA-256 via `crypto.subtle`: `crypto.subtle.digest` e'
 * **asincrono**, mentre l'impronta serve anche in percorsi sincroni (la
 * validazione durante il parsing di un pacchetto). Introdurre l'asincronia in
 * quel punto avrebbe reso possibile applicare operazioni prima della verifica,
 * che e' esattamente cio' che si vuole evitare. Dato che l'obiettivo e'
 * rilevare corruzione e non manomissione, un hash non crittografico sincrono e'
 * la scelta corretta.
 */

const FNV_OFFSET_64 = 0xcbf29ce484222325n;
const FNV_PRIME_64 = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;

/** FNV-1a a 64 bit su UTF-8. Hash NON crittografico: vedi l'avvertenza sopra. */
export function fnv1a64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let hash = FNV_OFFSET_64;
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = (hash * FNV_PRIME_64) & MASK_64;
  }
  return `fnv1a64-${hash.toString(16).padStart(16, '0')}`;
}

/**
 * JSON canonico: chiavi ordinate a ogni livello, `undefined` omessi.
 *
 * Serve perche' l'impronta sia riproducibile fra dispositivi e fra versioni di
 * runtime, indipendentemente dall'ordine di inserimento delle proprieta'.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
    return `{${entries.join(',')}}`;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Numero non finito non serializzabile.');
    return JSON.stringify(value);
  }
  if (typeof value === 'undefined') return 'null';
  return JSON.stringify(value) ?? 'null';
}

/** Impronta di un elenco di operazioni. */
export function computeBundleDigest(operations: readonly unknown[]): string {
  return fnv1a64(canonicalJson(operations));
}

/** Impronta del corpo di uno snapshot. */
export function computeSnapshotDigest(body: {
  readonly entities: unknown;
  readonly appliedOperationIds: unknown;
  readonly openConflicts: unknown;
}): string {
  return fnv1a64(canonicalJson(body));
}
