/**
 * Tema dell'app.
 *
 * I colori NON sono definiti qui: arrivano da `@trackstrong/core`, dove il
 * loro contrasto e' verificato da un test automatico. Qui c'e' solo il
 * collegamento con il sistema operativo (tema chiaro/scuro, riduzione delle
 * animazioni) e l'accesso comodo dai componenti.
 *
 * Regola: nessun componente dell'app scrive un colore in esadecimale. Se
 * serve un colore nuovo, si aggiunge un ruolo ai token in core e il test del
 * contrasto lo verifica.
 */

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, useColorScheme } from 'react-native';
import {
  COLORS,
  FONT_SIZE,
  FONT_WEIGHT,
  MIN_TOUCH_SIZE,
  MOTION,
  PRIMARY_ACTION_HEIGHT,
  RADIUS,
  SPACING,
  type ColorTokens,
  type ThemeName,
  type ThemePreference,
} from '@trackstrong/core';

export interface Theme {
  readonly name: ThemeName;
  readonly colors: ColorTokens;
  readonly spacing: typeof SPACING;
  readonly radius: typeof RADIUS;
  readonly fontSize: typeof FONT_SIZE;
  readonly fontWeight: typeof FONT_WEIGHT;
  readonly minTouchSize: typeof MIN_TOUCH_SIZE;
  readonly primaryActionHeight: typeof PRIMARY_ACTION_HEIGHT;
  /**
   * Durate delle animazioni, in millisecondi. Sono tutte 0 se l'utente ha
   * chiesto la riduzione dei movimenti nelle impostazioni di iOS
   * (specifica §9.1).
   *
   * Il tipo e' `number` e non il tipo letterale di `MOTION`: con la riduzione
   * attiva i valori diventano 0, e un tipo letterale lo renderebbe
   * inesprimibile.
   */
  readonly motion: { readonly fast: number; readonly normal: number; readonly slow: number };
  readonly reduceMotion: boolean;
}

function buildTheme(name: ThemeName, reduceMotion: boolean): Theme {
  return {
    name,
    colors: COLORS[name],
    spacing: SPACING,
    radius: RADIUS,
    fontSize: FONT_SIZE,
    fontWeight: FONT_WEIGHT,
    minTouchSize: MIN_TOUCH_SIZE,
    primaryActionHeight: PRIMARY_ACTION_HEIGHT,
    motion: reduceMotion ? { fast: 0, normal: 0, slow: 0 } : MOTION,
    reduceMotion,
  };
}

interface ThemeContextValue {
  readonly theme: Theme;
  readonly preference: ThemePreference;
  readonly setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({
  children,
  initialPreference = 'system',
}: {
  readonly children: React.ReactNode;
  readonly initialPreference?: ThemePreference;
}): React.ReactElement {
  const systemScheme = useColorScheme();
  const [preference, setPreference] = useState<ThemePreference>(initialPreference);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (!cancelled) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (enabled: boolean) => {
        setReduceMotion(enabled);
      },
    );
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  const name: ThemeName =
    preference === 'system' ? (systemScheme === 'light' ? 'light' : 'dark') : preference;

  const value = useMemo<ThemeContextValue>(
    () => ({ theme: buildTheme(name, reduceMotion), preference, setPreference }),
    [name, reduceMotion, preference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const context = useContext(ThemeContext);
  if (context === null) {
    throw new Error('useTheme() richiede <ThemeProvider> piu in alto nell albero.');
  }
  return context.theme;
}

export function useThemePreference(): Omit<ThemeContextValue, 'theme'> {
  const context = useContext(ThemeContext);
  if (context === null) {
    throw new Error('useThemePreference() richiede <ThemeProvider>.');
  }
  return { preference: context.preference, setPreference: context.setPreference };
}
