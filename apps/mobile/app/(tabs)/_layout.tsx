/**
 * Le cinque schede della specifica §9: Oggi · Calendario · Programma ·
 * Progressi · Coach.
 *
 * Ogni scheda ha un'etichetta esplicita per lo screen reader: il simbolo da
 * solo ("○", "▤") non dice niente a chi non lo vede.
 */

import React from 'react';
import Tabs from 'expo-router/js-tabs';
import { TsText } from '../../src/components/base';
import { useTheme } from '../../src/theme/ThemeProvider';

/**
 * Icona testuale.
 *
 * Nessuna libreria di icone fra le dipendenze, e non ne aggiungo una per una
 * barra di navigazione: un simbolo testuale scala con i caratteri di iOS e
 * l'etichetta accanto resta sempre leggibile.
 */
function TabGlyph({
  glyph,
  focused,
}: {
  readonly glyph: string;
  readonly focused: boolean;
}): React.ReactElement {
  const t = useTheme();
  return (
    <TsText
      role="body"
      color={focused ? t.colors.accent : t.colors.textMuted}
      weight="bold"
    >
      {glyph}
    </TsText>
  );
}

export default function TabsLayout(): React.ReactElement {
  const t = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: t.colors.surface },
        headerTitleStyle: { color: t.colors.text },
        tabBarStyle: {
          backgroundColor: t.colors.surface,
          borderTopColor: t.colors.borderSubtle,
        },
        tabBarActiveTintColor: t.colors.accent,
        tabBarInactiveTintColor: t.colors.textMuted,
        sceneStyle: { backgroundColor: t.colors.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Oggi',
          tabBarAccessibilityLabel: 'Oggi: la prossima seduta e il comando per iniziare',
          tabBarIcon: ({ focused }) => <TabGlyph glyph="▶" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="calendario"
        options={{
          title: 'Calendario',
          tabBarAccessibilityLabel: 'Calendario: sedute previste e svolte, per mese e per settimana',
          tabBarIcon: ({ focused }) => <TabGlyph glyph="▦" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="programma"
        options={{
          title: 'Programma',
          tabBarAccessibilityLabel: 'Programma: prossime sedute, blocchi e lungo termine',
          tabBarIcon: ({ focused }) => <TabGlyph glyph="▤" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="progressi"
        options={{
          title: 'Progressi',
          tabBarAccessibilityLabel: 'Progressi: carichi, ripetizioni, durate, peso e misurazioni',
          tabBarIcon: ({ focused }) => <TabGlyph glyph="◪" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="coach"
        options={{
          title: 'Coach',
          tabBarAccessibilityLabel: 'Coach: proposte del motore adattivo locale',
          tabBarIcon: ({ focused }) => <TabGlyph glyph="◎" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
