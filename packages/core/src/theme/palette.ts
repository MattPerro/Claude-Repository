/**
 * Sistema visivo di TrackStrong.
 *
 * Professionale e sportivo, con richiami motorsport discreti: un rosso da
 * corsa usato con parsimonia come accento, grigi freddi da abitacolo, numeri
 * grandi e tabellari. Niente interfaccia da videogioco.
 *
 * I colori vivono qui, in TypeScript puro, e non nei fogli di stile dell'app,
 * perche' cosi' il loro contrasto viene verificato da un test automatico
 * (`packages/core/test/theme.test.ts`) invece di essere un'affermazione in un
 * documento di revisione.
 *
 * Il tema **scuro e' quello di riferimento**: e' quello che si usa in palestra,
 * spesso con luce artificiale e telefono a luminosita' ridotta.
 */

export type ThemeName = 'dark' | 'light';

/**
 * Ruoli di colore. Ogni voce ha un ruolo dichiarato, cosi' e' possibile
 * verificare automaticamente che ciascuna coppia rispetti la soglia giusta.
 */
export interface ColorTokens {
  /** Fondo della schermata. */
  readonly background: string;
  /** Fondo di una scheda o di un pannello. */
  readonly surface: string;
  /** Fondo di un elemento in rilievo (serie corrente, timer attivo). */
  readonly surfaceRaised: string;
  /** Testo principale. Deve avere >= 4,5:1 su background, surface e raised. */
  readonly text: string;
  /** Testo secondario. Stessa soglia: un testo "tenue" resta testo. */
  readonly textMuted: string;
  /** Accento motorsport. Usato per il comando principale e per i progressi. */
  readonly accent: string;
  /** Fondo pieno dell'accento, per i pulsanti primari. */
  readonly accentSurface: string;
  /** Testo sopra `accentSurface`. */
  readonly onAccent: string;
  /** Esito positivo: serie completata, sincronizzazione riuscita. */
  readonly success: string;
  /** Avviso: modifiche in attesa, accesso da rinnovare. */
  readonly warning: string;
  /** Errore o azione distruttiva. */
  readonly danger: string;
  /** Informazione neutra. */
  readonly info: string;
  /**
   * Bordo dei COMANDI interattivi. Deve avere >= 3:1 su tutti i fondi:
   * un campo di inserimento con un bordo invisibile non e' un campo.
   */
  readonly borderControl: string;
  /** Separatore decorativo. Non e' un comando, nessuna soglia richiesta. */
  readonly borderSubtle: string;
  /** Anello di messa a fuoco, per la navigazione da tastiera e screen reader. */
  readonly focusRing: string;
  /** Sfondo del velo dietro una finestra modale. */
  readonly scrim: string;
}

/**
 * Tema scuro.
 *
 * Rapporti di contrasto misurati (vedi `theme.test.ts` per il calcolo):
 *   text su background      17,28:1
 *   text su surface         15,46:1
 *   text su surfaceRaised   13,41:1
 *   textMuted su background  8,89:1
 *   textMuted su surface     7,95:1
 *   accent su background     6,15:1
 *   onAccent su accentSurface 5,33:1
 *   borderControl su background 5,17:1
 */
export const DARK_COLORS: ColorTokens = {
  background: '#0E1116',
  surface: '#181D25',
  surfaceRaised: '#222932',
  text: '#F2F5F8',
  textMuted: '#A8B3C0',
  accent: '#FF5A4E',
  accentSurface: '#C9302A',
  onAccent: '#FFFFFF',
  success: '#4ADE80',
  warning: '#FBBF24',
  danger: '#FF6B6B',
  info: '#7DD3FC',
  borderControl: '#7A8798',
  borderSubtle: '#39424E',
  focusRing: '#4FA8FF',
  scrim: 'rgba(5, 7, 10, 0.72)',
};

/**
 * Tema chiaro.
 *
 * Rapporti di contrasto misurati:
 *   text su background      17,08:1
 *   text su surface         18,15:1
 *   textMuted su background  6,11:1
 *   accent su background     5,32:1
 *   onAccent su accentSurface 5,65:1
 *   borderControl su background 4,34:1
 */
export const LIGHT_COLORS: ColorTokens = {
  background: '#F7F8FA',
  surface: '#FFFFFF',
  surfaceRaised: '#EEF1F5',
  text: '#12161C',
  textMuted: '#545F6D',
  accent: '#C42B23',
  accentSurface: '#C42B23',
  onAccent: '#FFFFFF',
  success: '#15803D',
  warning: '#92600A',
  danger: '#C42B23',
  info: '#0369A1',
  borderControl: '#6B7684',
  borderSubtle: '#C3CAD3',
  focusRing: '#1D4ED8',
  scrim: 'rgba(18, 22, 28, 0.45)',
};

export const COLORS: Record<ThemeName, ColorTokens> = {
  dark: DARK_COLORS,
  light: LIGHT_COLORS,
};

/**
 * Scala tipografica, in punti.
 *
 * `setValue` e `timer` sono deliberatamente enormi: durante il recupero il
 * telefono e' appoggiato su una macchina e va letto in un colpo d'occhio, con
 * il respiro corto (specifica §9.1, "numeri grandi").
 */
export const FONT_SIZE = {
  /** Etichette minime, unita' di misura. */
  micro: 12,
  /** Testo secondario. */
  small: 14,
  /** Testo corrente. */
  body: 16,
  /** Testo importante, nomi degli esercizi in elenco. */
  bodyLarge: 18,
  /** Titoli di sezione. */
  title: 22,
  /** Titolo di schermata, nome dell'esercizio in seduta. */
  heading: 28,
  /** Valore di una serie: carico e ripetizioni. */
  setValue: 40,
  /** Conto alla rovescia del recupero. */
  timer: 64,
} as const;

export const FONT_WEIGHT = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

/** Soglia oltre la quale un testo conta come "grande" per il contrasto WCAG. */
export const LARGE_TEXT_THRESHOLD_PT = 24;
export const LARGE_TEXT_BOLD_THRESHOLD_PT = 19;

/** Spaziature, multipli di 4. */
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const RADIUS = {
  sm: 6,
  md: 10,
  lg: 14,
  pill: 999,
} as const;

/**
 * Area minima di tocco, in punti.
 *
 * Requisito della specifica (§9.1) e delle linee guida Apple: 44 x 44 punti.
 * Ogni comando principale dell'app deve rispettarlo, e un test sui fogli di
 * stile lo verifica.
 */
export const MIN_TOUCH_SIZE = 44;

/**
 * Altezza del comando principale in seduta ("Completa serie").
 * Piu' grande del minimo: si preme con il pollice, di fretca, con le mani
 * sudate.
 */
export const PRIMARY_ACTION_HEIGHT = 64;

/** Durate delle animazioni, in millisecondi. Azzerate se l'utente lo chiede. */
export const MOTION = {
  fast: 120,
  normal: 200,
  slow: 320,
} as const;

/**
 * Stato visivo di un elemento.
 *
 * Ogni stato ha un colore MA ANCHE un'icona e un testo: la specifica (§9.1)
 * richiede stati distinguibili senza il solo colore. Chi non distingue il
 * verde dal rosso deve poter capire comunque.
 */
export interface StateAppearance {
  readonly colorRole: keyof ColorTokens;
  /** Simbolo testuale, leggibile da uno screen reader. */
  readonly glyph: string;
  /** Etichetta in italiano. */
  readonly label: string;
}

/** Stati di una serie o di una seduta. */
export const STATE_APPEARANCE = {
  completed: { colorRole: 'success', glyph: '✓', label: 'Completata' },
  partial: { colorRole: 'warning', glyph: '◐', label: 'Parziale' },
  skipped: { colorRole: 'textMuted', glyph: '—', label: 'Saltata' },
  planned: { colorRole: 'info', glyph: '○', label: 'Pianificata' },
  active: { colorRole: 'accent', glyph: '▶', label: 'In corso' },
  draft: { colorRole: 'textMuted', glyph: '…', label: 'Bozza, non registrata' },
  voided: { colorRole: 'textMuted', glyph: '⊘', label: 'Annullata' },
  error: { colorRole: 'danger', glyph: '!', label: 'Errore' },
} as const satisfies Record<string, StateAppearance>;

export type StateName = keyof typeof STATE_APPEARANCE;

/**
 * Stati della sincronizzazione, con i testi esatti richiesti dalla
 * specifica (§8.5).
 *
 * "Sincronizzato con Drive" **non** significa che gli altri dispositivi
 * abbiano gia' scaricato i dati: il testo esteso lo dice.
 */
export const SYNC_STATE_TEXT = {
  savedLocally: {
    short: 'Salvato sul dispositivo',
    long: 'Le modifiche sono salvate nel database locale. Non serve la rete per allenarsi.',
    colorRole: 'textMuted',
    glyph: '✓',
  },
  pending: {
    short: 'Modifiche in attesa',
    long: 'Ci sono modifiche salvate sul dispositivo che non sono ancora state inviate a Drive.',
    colorRole: 'warning',
    glyph: '↑',
  },
  syncing: {
    short: 'Sincronizzazione in corso',
    long: 'Invio e ricezione delle modifiche con Google Drive.',
    colorRole: 'info',
    glyph: '⟳',
  },
  synced: {
    short: 'Sincronizzato con Drive',
    long:
      'Le modifiche sono su Drive. Questo non significa che gli altri dispositivi le abbiano ' +
      'gia\' scaricate: lo faranno alla loro prossima sincronizzazione.',
    colorRole: 'success',
    glyph: '✓',
  },
  authExpired: {
    short: 'Accesso da rinnovare',
    long:
      'Google ha revocato o fatto scadere l\'autorizzazione. I dati sul dispositivo sono intatti: ' +
      'serve solo rientrare con il tuo account.',
    colorRole: 'warning',
    glyph: '!',
  },
  conflict: {
    short: 'Conflitto da risolvere',
    long:
      'Lo stesso dato e\' stato modificato in modo diverso su due dispositivi. Nessuna delle due ' +
      'versioni e\' stata scartata: scegli tu quale conservare.',
    colorRole: 'danger',
    glyph: '⚠',
  },
  offline: {
    short: 'Offline',
    long: 'Nessuna connessione. Tutto funziona comunque: le modifiche partiranno al ritorno della rete.',
    colorRole: 'textMuted',
    glyph: '⌀',
  },
} as const;

export type SyncStateName = keyof typeof SYNC_STATE_TEXT;
