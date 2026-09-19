/**
 * Serializzazione JSON usata nelle colonne `*_json` e nei backup.
 *
 * Due regole:
 *  - `undefined` non e' un valore JSON. Nelle colonne si scrive `NULL`, non
 *    la stringa "undefined" e non un oggetto a cui manca la chiave.
 *  - la lettura di un JSON non valido non restituisce mai un valore
 *    "ragionevole" di riserva: lancia. Un piano o una fotografia di
 *    prescrizione illeggibile e' un problema di integrita' e va visto, non
 *    mascherato con un oggetto vuoto (§1.1, priorita' 1).
 */

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export class JsonColumnError extends Error {
  constructor(
    readonly column: string,
    override readonly cause: unknown,
  ) {
    super(
      `Contenuto JSON non leggibile nella colonna "${column}". ` +
        'Il dato non viene interpretato con un valore di riserva: va ispezionato.',
    );
    this.name = 'JsonColumnError';
  }
}

/** Serializza per una colonna `*_json`. */
export function toJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

/** Serializza per una colonna `*_json` nullable: `undefined`/`null` -> NULL. */
export function toJsonOrNull(value: unknown): string | null {
  return value === undefined || value === null ? null : JSON.stringify(value);
}

/** Legge una colonna `*_json`. Lancia se il contenuto non e' JSON valido. */
export function fromJson<T>(raw: string, column: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    throw new JsonColumnError(column, error);
  }
}

/** Legge una colonna `*_json` nullable. */
export function fromJsonOrNull<T>(raw: string | null, column: string): T | null {
  if (raw === null) return null;
  return fromJson<T>(raw, column);
}

/** Vero se il valore e' un oggetto JSON (non un array, non `null`). */
export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
