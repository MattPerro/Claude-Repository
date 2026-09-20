/**
 * Radice dell'app: tema, store, stato di avvio.
 *
 * Tre stati di avvio, tutti visibili e nessuno silenzioso:
 *
 *  - **in apertura**: il database si sta aprendo. Nessuna schermata finta con
 *    dati a zero: si dice che si sta aprendo.
 *  - **configurazione necessaria**: manca il profilo o il piano -> onboarding.
 *  - **pronto**: si entra nelle schede.
 *
 * Se lo schema del file e' piu' recente del codice l'app **parte comunque** e
 * mostra un avviso che dice esattamente che cosa succede: la sola
 * sincronizzazione e' bloccata e i dati locali sono intatti (§14).
 */

import React, { useEffect } from 'react';
import { SafeAreaView, ScrollView } from 'react-native';
import { Stack, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Button, Card, TsText } from '../src/components/base';
import { ThemeProvider, useTheme, useThemePreference } from '../src/theme/ThemeProvider';
import { StoreProvider, useStoreStatus } from '../src/store';

export default function RootLayout(): React.ReactElement {
  return (
    <ThemeProvider>
      <StoreProvider>
        <BootGate />
      </StoreProvider>
    </ThemeProvider>
  );
}

/**
 * Allinea il tema alla preferenza salvata.
 *
 * Il `ThemeProvider` nasce su "sistema" perche' la preferenza sta nel database
 * e il database non e' ancora aperto quando il provider viene montato.
 */
function ThemeSync(): null {
  const status = useStoreStatus();
  const { preference, setPreference } = useThemePreference();
  const saved = status.core?.settings.theme ?? null;
  useEffect(() => {
    if (saved !== null && saved !== preference) setPreference(saved);
  }, [saved, preference, setPreference]);
  return null;
}

function BootGate(): React.ReactElement {
  const t = useTheme();
  const status = useStoreStatus();

  if (status.status === 'opening') {
    return (
      <Screen>
        <StatusBar style={t.name === 'dark' ? 'light' : 'dark'} />
        <Card>
          <TsText role="title" weight="semibold">
            Apertura dell&apos;archivio
          </TsText>
          <TsText role="body" muted>
            Sto aprendo il database locale e applicando le migrazioni mancanti. Non serve
            la rete.
          </TsText>
        </Card>
      </Screen>
    );
  }

  if (status.status === 'failed') {
    return (
      <Screen>
        <StatusBar style={t.name === 'dark' ? 'light' : 'dark'} />
        <Card style={{ borderWidth: 2, borderColor: t.colors.danger }}>
          <TsText role="title" weight="semibold" color={t.colors.danger}>
            Avvio non riuscito
          </TsText>
          <TsText role="body">{status.error ?? 'Motivo non identificato.'}</TsText>
          <TsText role="small" muted>
            Nessun dato e stato modificato. L&apos;app non prosegue con un archivio
            incerto: proseguire rischierebbe di duplicare i dati.
          </TsText>
          <Button label="Riprova" onPress={status.retry} variant="primary" large />
        </Card>
      </Screen>
    );
  }

  return (
    <>
      <StatusBar style={t.name === 'dark' ? 'light' : 'dark'} />
      <ThemeSync />
      <OnboardingGate needed={status.status === 'needsOnboarding'} />
      <SyncBlockedNotice />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: t.colors.surface },
          headerTitleStyle: { color: t.colors.text },
          headerTintColor: t.colors.accent,
          contentStyle: { backgroundColor: t.colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="onboarding"
          options={{ title: 'Configurazione', headerBackVisible: false }}
        />
        <Stack.Screen name="sessione/[id]" options={{ title: 'Seduta' }} />
        <Stack.Screen name="esercizio/[id]" options={{ title: 'Esercizio' }} />
        <Stack.Screen name="libreria" options={{ title: 'Libreria esercizi' }} />
        <Stack.Screen name="impostazioni" options={{ title: 'Impostazioni' }} />
        <Stack.Screen name="profilo" options={{ title: 'Profilo' }} />
      </Stack>
    </>
  );
}

/**
 * Porta l'utente all'onboarding quando profilo o piano mancano.
 *
 * Un effetto e non un `<Redirect>`: questo e' il layout radice, quindi il
 * navigatore viene montato qui sotto e non esiste ancora quando il componente
 * viene valutato la prima volta.
 */
function OnboardingGate({ needed }: { readonly needed: boolean }): null {
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (needed && pathname !== '/onboarding') router.replace('/onboarding');
  }, [needed, pathname, router]);
  return null;
}

/**
 * Avviso di incompatibilita' di schema o protocollo.
 *
 * Dice le due cose che contano: che cosa e' bloccato (solo la
 * sincronizzazione) e che cosa non lo e' (i dati locali).
 */
function SyncBlockedNotice(): React.ReactElement | null {
  const t = useTheme();
  const status = useStoreStatus();
  const reason = status.core?.sync.blockedReason ?? null;
  if (reason === null) return null;
  return (
    <SafeAreaView
      accessible
      accessibilityLabel={`Sincronizzazione bloccata. ${reason} I dati locali sono intatti.`}
      style={{
        backgroundColor: t.colors.surfaceRaised,
        borderBottomWidth: 2,
        borderBottomColor: t.colors.warning,
        paddingHorizontal: t.spacing.lg,
        paddingVertical: t.spacing.md,
        gap: t.spacing.xs,
      }}
    >
      <TsText role="body" weight="semibold" color={t.colors.warning}>
        ! Sincronizzazione bloccata
      </TsText>
      <TsText role="small">{reason}</TsText>
      <TsText role="small" weight="semibold">
        I dati locali sono intatti e l&apos;app si usa normalmente: allenamenti,
        registrazione, timer e storico funzionano.
      </TsText>
    </SafeAreaView>
  );
}

function Screen({ children }: { readonly children: React.ReactNode }): React.ReactElement {
  const t = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.background }}>
      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.lg }}>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}
