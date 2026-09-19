/**
 * Calcolo del contrasto secondo WCAG 2.1.
 *
 * Vive in `@trackstrong/core` (TypeScript puro) e non nell'app, per una
 * ragione precisa: cosi' il contrasto dei colori diventa **verificabile da un
 * test automatico** invece di essere un'affermazione in un documento.
 *
 * Formule: WCAG 2.1, relative luminance e contrast ratio.
 * <https://www.w3.org/TR/WCAG21/#dfn-relative-luminance>
 * <https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio>
 * Verificato il 2026-09-19.
 */

/** Soglie WCAG 2.1 livello AA. */
export const WCAG_AA = {
  /** Testo normale su fondo. */
  normalText: 4.5,
  /**
   * Testo grande: almeno 24 px, oppure 19 px in grassetto
   * (equivalenti a 18pt / 14pt bold).
   */
  largeText: 3,
  /** Componenti di interfaccia e oggetti grafici (bordi dei comandi, icone). */
  uiComponent: 3,
} as const;

interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

const HEX_RE = /^#([0-9a-f]{6}|[0-9a-f]{3})$/i;

export function parseHex(hex: string): Rgb {
  if (!HEX_RE.test(hex)) {
    throw new Error(`Colore non valido: "${hex}". Atteso #rrggbb o #rgb.`);
  }
  let body = hex.slice(1);
  if (body.length === 3) {
    body = body
      .split('')
      .map((c) => c + c)
      .join('');
  }
  return {
    r: Number.parseInt(body.slice(0, 2), 16),
    g: Number.parseInt(body.slice(2, 4), 16),
    b: Number.parseInt(body.slice(4, 6), 16),
  };
}

function channelLuminance(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Luminanza relativa, fra 0 (nero) e 1 (bianco). */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  return (
    0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b)
  );
}

/** Rapporto di contrasto fra due colori, fra 1 e 21. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Rapporto arrotondato a due decimali, per i messaggi dei test. */
export function contrastRatioRounded(a: string, b: string): number {
  return Math.round(contrastRatio(a, b) * 100) / 100;
}

export type ContrastUse = 'normalText' | 'largeText' | 'uiComponent';

export interface ContrastCheck {
  readonly foreground: string;
  readonly background: string;
  readonly use: ContrastUse;
  readonly ratio: number;
  readonly required: number;
  readonly passes: boolean;
  /** Messaggio in italiano, usato nei report di revisione. */
  readonly message: string;
}

export function checkContrast(
  foreground: string,
  background: string,
  use: ContrastUse = 'normalText',
): ContrastCheck {
  const ratio = contrastRatioRounded(foreground, background);
  const required = WCAG_AA[use];
  const passes = ratio >= required;
  const useLabel =
    use === 'normalText' ? 'testo normale' : use === 'largeText' ? 'testo grande' : 'componente';
  return {
    foreground,
    background,
    use,
    ratio,
    required,
    passes,
    message: passes
      ? `${foreground} su ${background}: ${String(ratio)}:1, sufficiente per ${useLabel} (minimo ${String(required)}:1).`
      : `${foreground} su ${background}: ${String(ratio)}:1, INSUFFICIENTE per ${useLabel} (minimo ${String(required)}:1).`,
  };
}
