/**
 * Verifica AUTOMATICA del sistema visivo.
 *
 * Il contrasto non e' un'opinione: e' un numero. Questi test lo calcolano con
 * le formule WCAG 2.1 e fanno fallire la build se una coppia di colori scende
 * sotto la soglia. E' la differenza fra "abbiamo curato l'accessibilita'" e
 * "l'accessibilita' e' verificata".
 *
 * Nota onesta su cosa questi test NON fanno: non guardano l'app. Verificano i
 * TOKEN. Che i token siano poi usati davvero, e che il risultato sulla
 * schermata sia leggibile, richiede screenshot reali e una revisione visiva
 * (vedi `QA_REPORT.md`).
 */

import { describe, expect, it } from 'vitest';
import {
  checkContrast,
  COLORS,
  contrastRatio,
  contrastRatioRounded,
  DARK_COLORS,
  FONT_SIZE,
  LARGE_TEXT_THRESHOLD_PT,
  LIGHT_COLORS,
  MIN_TOUCH_SIZE,
  parseHex,
  PRIMARY_ACTION_HEIGHT,
  relativeLuminance,
  STATE_APPEARANCE,
  SYNC_STATE_TEXT,
  WCAG_AA,
  type ColorTokens,
  type ThemeName,
} from '@trackstrong/core';

describe('Calcolo del contrasto (WCAG 2.1)', () => {
  it('riproduce i valori di riferimento noti', () => {
    // Nero su bianco: 21:1, il massimo possibile.
    expect(contrastRatioRounded('#000000', '#FFFFFF')).toBe(21);
    // Un colore con se stesso: 1:1.
    expect(contrastRatioRounded('#123456', '#123456')).toBe(1);
    // Il grigio #767676 su bianco e' l'esempio canonico di 4,54:1.
    expect(contrastRatio('#767676', '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#777777', '#FFFFFF')).toBeLessThan(4.6);
  });

  it('e simmetrico', () => {
    expect(contrastRatio('#0E1116', '#F2F5F8')).toBe(contrastRatio('#F2F5F8', '#0E1116'));
  });

  it('calcola la luminanza agli estremi', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 10);
  });

  it('accetta la forma abbreviata a tre cifre', () => {
    expect(parseHex('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(contrastRatio('#000', '#fff')).toBe(contrastRatio('#000000', '#ffffff'));
  });

  it('rifiuta un colore non valido invece di restituire un numero senza senso', () => {
    for (const bad of ['rosso', '#12345', '', '#GGGGGG', 'rgb(0,0,0)']) {
      expect(() => parseHex(bad)).toThrow();
    }
  });

  it('produce un messaggio leggibile in italiano', () => {
    const pass = checkContrast('#F2F5F8', '#0E1116', 'normalText');
    expect(pass.passes).toBe(true);
    expect(pass.message).toContain('sufficiente per testo normale');

    const fail = checkContrast('#39424E', '#0E1116', 'normalText');
    expect(fail.passes).toBe(false);
    expect(fail.message).toContain('INSUFFICIENTE');
  });
});

/** Fondi su cui il testo puo' apparire in ciascun tema. */
const SURFACES: readonly (keyof ColorTokens)[] = ['background', 'surface', 'surfaceRaised'];

const THEMES: readonly ThemeName[] = ['dark', 'light'];

describe.each(THEMES)('Tema %s: contrasto dei testi', (theme) => {
  const c = COLORS[theme];

  it.each(SURFACES)('il testo principale e leggibile su %s', (surface) => {
    const check = checkContrast(c.text, c[surface], 'normalText');
    expect(check.passes, check.message).toBe(true);
  });

  it.each(SURFACES)('il testo secondario e leggibile su %s', (surface) => {
    // Un testo "tenue" resta testo: stessa soglia del testo principale.
    // Nessuna scorciatoia sul grigio chiaro.
    const check = checkContrast(c.textMuted, c[surface], 'normalText');
    expect(check.passes, check.message).toBe(true);
  });

  it('i colori di stato sono leggibili sul fondo della schermata', () => {
    for (const role of ['success', 'warning', 'danger', 'info', 'accent'] as const) {
      const check = checkContrast(c[role], c.background, 'normalText');
      expect(check.passes, `${role}: ${check.message}`).toBe(true);
    }
  });

  it('i colori di stato sono leggibili anche su una scheda', () => {
    for (const role of ['success', 'warning', 'danger', 'info', 'accent'] as const) {
      const check = checkContrast(c[role], c.surface, 'normalText');
      expect(check.passes, `${role}: ${check.message}`).toBe(true);
    }
  });

  it('il testo sul pulsante primario e leggibile', () => {
    const check = checkContrast(c.onAccent, c.accentSurface, 'normalText');
    expect(check.passes, check.message).toBe(true);
  });
});

describe.each(THEMES)('Tema %s: contrasto dei comandi', (theme) => {
  const c = COLORS[theme];

  it.each(SURFACES)('il bordo dei comandi e visibile su %s', (surface) => {
    // Soglia 3:1 per i componenti di interfaccia: un campo di inserimento con
    // un bordo invisibile non e' un campo.
    const check = checkContrast(c.borderControl, c[surface], 'uiComponent');
    expect(check.passes, check.message).toBe(true);
  });

  it('l anello di messa a fuoco e visibile sul fondo', () => {
    const check = checkContrast(c.focusRing, c.background, 'uiComponent');
    expect(check.passes, check.message).toBe(true);
  });

  it('il separatore decorativo non pretende la soglia dei comandi', () => {
    // Documentato: `borderSubtle` e' decorativo. Se qualcuno lo usasse per il
    // bordo di un comando, il test sopra su `borderControl` non lo coprirebbe:
    // qui si mette per iscritto che i due ruoli sono distinti.
    expect(c.borderSubtle).not.toBe(c.borderControl);
  });
});

describe('Stati distinguibili senza il solo colore (SPEC §9.1)', () => {
  it('ogni stato ha anche un simbolo e un testo, non solo un colore', () => {
    for (const [name, appearance] of Object.entries(STATE_APPEARANCE)) {
      expect(appearance.glyph.length, `stato ${name}`).toBeGreaterThan(0);
      expect(appearance.label.length, `stato ${name}`).toBeGreaterThan(2);
      expect(appearance.colorRole, `stato ${name}`).toBeTruthy();
    }
  });

  it('i simboli degli stati sono distinguibili fra loro', () => {
    const glyphs = Object.values(STATE_APPEARANCE).map((a) => a.glyph);
    // I simboli non devono ripetersi fra stati con significato diverso:
    // altrimenti resterebbe solo il colore a distinguerli.
    expect(new Set(glyphs).size).toBe(glyphs.length);
  });

  it('distingue bozza, annullata e saltata, che hanno lo stesso colore', () => {
    // Tre stati condividono `textMuted`: e' proprio il caso in cui il colore
    // da solo non basta.
    expect(STATE_APPEARANCE.draft.colorRole).toBe(STATE_APPEARANCE.voided.colorRole);
    expect(STATE_APPEARANCE.draft.glyph).not.toBe(STATE_APPEARANCE.voided.glyph);
    expect(STATE_APPEARANCE.draft.label).not.toBe(STATE_APPEARANCE.voided.label);
    expect(STATE_APPEARANCE.draft.label).toContain('non registrata');
  });

  it('i ruoli di colore degli stati esistono nei token di entrambi i temi', () => {
    for (const appearance of Object.values(STATE_APPEARANCE)) {
      expect(DARK_COLORS[appearance.colorRole]).toBeDefined();
      expect(LIGHT_COLORS[appearance.colorRole]).toBeDefined();
    }
  });
});

describe('Testi della sincronizzazione (SPEC §8.5)', () => {
  it('contiene tutti e sei gli stati richiesti dalla specifica', () => {
    expect(SYNC_STATE_TEXT.savedLocally.short).toBe('Salvato sul dispositivo');
    expect(SYNC_STATE_TEXT.pending.short).toBe('Modifiche in attesa');
    expect(SYNC_STATE_TEXT.syncing.short).toBe('Sincronizzazione in corso');
    expect(SYNC_STATE_TEXT.synced.short).toBe('Sincronizzato con Drive');
    expect(SYNC_STATE_TEXT.authExpired.short).toBe('Accesso da rinnovare');
    expect(SYNC_STATE_TEXT.conflict.short).toBe('Conflitto da risolvere');
  });

  it('chiarisce che sincronizzato non significa scaricato dagli altri dispositivi', () => {
    expect(SYNC_STATE_TEXT.synced.long).toContain('non significa');
    expect(SYNC_STATE_TEXT.synced.long).toContain('altri dispositivi');
  });

  it('un problema di autorizzazione dice che i dati locali sono intatti', () => {
    expect(SYNC_STATE_TEXT.authExpired.long).toContain('intatti');
  });

  it('un conflitto dice che nessuna versione e stata scartata', () => {
    expect(SYNC_STATE_TEXT.conflict.long).toContain('Nessuna delle due');
    expect(SYNC_STATE_TEXT.conflict.long).toContain('scartata');
  });

  it('offline dice che si puo comunque allenarsi', () => {
    expect(SYNC_STATE_TEXT.offline.long).toContain('funziona comunque');
  });

  it('ogni stato ha un simbolo, non solo un colore', () => {
    for (const [name, state] of Object.entries(SYNC_STATE_TEXT)) {
      expect(state.glyph.length, name).toBeGreaterThan(0);
      expect(state.short.length, name).toBeGreaterThan(3);
      expect(state.long.length, name).toBeGreaterThan(30);
    }
  });
});

describe('Dimensioni e aree di tocco (SPEC §9.1)', () => {
  it('l area minima di tocco e 44 punti', () => {
    expect(MIN_TOUCH_SIZE).toBe(44);
  });

  it('il comando principale in seduta e piu grande del minimo', () => {
    expect(PRIMARY_ACTION_HEIGHT).toBeGreaterThanOrEqual(MIN_TOUCH_SIZE);
  });

  it('i numeri della seduta e del timer sono grandi', () => {
    expect(FONT_SIZE.setValue).toBeGreaterThanOrEqual(LARGE_TEXT_THRESHOLD_PT);
    expect(FONT_SIZE.timer).toBeGreaterThan(FONT_SIZE.setValue);
    expect(FONT_SIZE.heading).toBeGreaterThanOrEqual(LARGE_TEXT_THRESHOLD_PT);
  });

  it('la scala tipografica e monotona crescente', () => {
    const sizes = [
      FONT_SIZE.micro,
      FONT_SIZE.small,
      FONT_SIZE.body,
      FONT_SIZE.bodyLarge,
      FONT_SIZE.title,
      FONT_SIZE.heading,
      FONT_SIZE.setValue,
      FONT_SIZE.timer,
    ];
    for (let i = 1; i < sizes.length; i += 1) {
      expect(sizes[i] ?? 0).toBeGreaterThan(sizes[i - 1] ?? 0);
    }
  });

  it('il testo corrente non e piu piccolo di 16 punti', () => {
    // Sotto i 16 punti iOS tende a ingrandire i campi al tocco, e il testo
    // diventa faticoso da leggere in palestra.
    expect(FONT_SIZE.body).toBeGreaterThanOrEqual(16);
  });
});

describe('Coerenza fra i due temi', () => {
  it('i due temi definiscono esattamente gli stessi ruoli', () => {
    expect(Object.keys(DARK_COLORS).sort()).toEqual(Object.keys(LIGHT_COLORS).sort());
  });

  it('nessun ruolo e vuoto', () => {
    for (const theme of THEMES) {
      for (const [role, value] of Object.entries(COLORS[theme])) {
        expect(value.length, `${theme}.${role}`).toBeGreaterThan(3);
      }
    }
  });

  it('il tema scuro e davvero scuro e quello chiaro davvero chiaro', () => {
    expect(relativeLuminance(DARK_COLORS.background)).toBeLessThan(0.05);
    expect(relativeLuminance(LIGHT_COLORS.background)).toBeGreaterThan(0.8);
  });

  it('le soglie WCAG usate sono quelle del livello AA', () => {
    expect(WCAG_AA.normalText).toBe(4.5);
    expect(WCAG_AA.largeText).toBe(3);
    expect(WCAG_AA.uiComponent).toBe(3);
  });
});
