/**
 * Oggi.
 *
 * Vincolo verificabile della specifica §9.2: **iniziare la seduta abituale
 * deve richiedere al massimo 2 tocchi dalla home**. Qui ne serve **uno**:
 * il pulsante "Inizia" crea la seduta con la fotografia congelata e apre
 * direttamente `sessione/[id]`. Non c'e' nessuna schermata di conferma in
 * mezzo, nessuna scelta preliminare, nessuna modale.
 *
 * Il secondo vincolo e' negativo: la home **non** e' un pannello di grafici.
 * Mostra la prossima seduta, dove si e' nel percorso, la durata stimata, UNA
 * indicazione del coach e lo stato della sincronizzazione in piccolo.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { SafeAreaView, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  blockAtWeek,
  estimateSession,
  formatDateLongIt,
  formatMinutesIt,
  PHASE_LABEL,
  type Session,
} from '@trackstrong/core';
import { ActiveSessionExistsError } from '@trackstrong/db';
import {
  Button,
  Card,
  Divider,
  EmptyState,
  SectionTitle,
  StateBadge,
  SyncIndicator,
  TsText,
} from '../../src/components/base';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useStore } from '../../src/store';
import { buildSnapshot, nextPlannedSession } from '../../src/lib/schedule';
import { ErrorBanner } from '../../src/components/session/ErrorBanner';

export default function TodayScreen(): React.ReactElement {
  const t = useTheme();
  const router = useRouter();
  const store = useStore();
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const plan = store.plan;
  const cursor = store.cursor;
  const profile = store.profile;

  /** Seduta gia' aperta su questo dispositivo: "Riprendi" invece di "Inizia". */
  const active = useMemo<Session | null>(
    () => store.repos.sessions.activeForThisDevice(),
    // `version` cambia dopo ogni scrittura: rileggere e' corretto qui.
    [store.repos, store.version],
  );

  const next = useMemo(() => {
    if (plan === null || cursor === null) return null;
    return nextPlannedSession(plan.plan, cursor, profile?.preferredWeekdays ?? []);
  }, [plan, cursor, profile]);

  const estimate = useMemo(() => {
    if (next === null) return null;
    return estimateSession(next.prescription, store.library, undefined, {
      includeCheckIn: true,
    });
  }, [next, store.library]);

  /** UNA indicazione: la proposta del coach in attesa piu' recente, se c'e'. */
  const coachHint = useMemo(() => {
    const pending = store.repos.proposals.pending();
    const first = pending[0];
    if (first !== undefined) {
      return { title: first.title, detail: first.reason, count: pending.length };
    }
    return null;
  }, [store.repos, store.version]);

  const openSession = useCallback(
    (sessionId: string) => {
      router.push(`/sessione/${sessionId}`);
    },
    [router],
  );

  /**
   * Un solo tocco: crea la seduta e apre la schermata.
   *
   * La scrittura e' locale e sincrona: non si attende la rete (§7).
   */
  const start = useCallback(() => {
    if (plan === null || next === null || starting) return;
    setStarting(true);
    setError(null);
    try {
      const snapshot = buildSnapshot(
        plan.plan,
        next.weekIndex,
        next.slot,
        store.clock.now(),
      );
      if (snapshot === null) {
        setError(
          'Il programma non contiene una prescrizione per questa seduta: non la avvio ' +
            'con una scheda vuota.',
        );
        setStarting(false);
        return;
      }
      const session = store.repos.sessions.start({
        plannedDate: next.plannedDate,
        slot: next.slot,
        snapshot,
        startedAt: store.clock.now(),
      });
      store.reload();
      openSession(session.id);
    } catch (cause) {
      if (cause instanceof ActiveSessionExistsError) {
        // Una sola seduta attiva per installazione (§10): si riprende quella.
        openSession(cause.activeSessionId);
      } else {
        setError(
          cause instanceof Error
            ? `Seduta non avviata: ${cause.message}`
            : 'Seduta non avviata per un motivo non identificato.',
        );
      }
    } finally {
      setStarting(false);
    }
  }, [plan, next, starting, store, openSession]);

  const block = useMemo(() => {
    if (plan === null || cursor === null) return undefined;
    return blockAtWeek(plan.plan, cursor.weekIndex);
  }, [plan, cursor]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.background }}>
      <ScrollView
        contentContainerStyle={{
          padding: t.spacing.lg,
          gap: t.spacing.lg,
          paddingBottom: t.spacing.xxxl,
        }}
      >
        {/* Stato della sincronizzazione: discreto, in alto a destra. */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: t.spacing.sm,
          }}
        >
          <TsText role="small" muted numberOfLines={1}>
            {profile === null || profile.displayName === ''
              ? 'Ciao'
              : `Ciao ${profile.displayName}`}
          </TsText>
          <SyncIndicator
            state={store.sync.state}
            {...(store.sync.detail === null ? {} : { detail: store.sync.detail })}
            onPress={() => {
              router.push('/impostazioni');
            }}
          />
        </View>

        {error !== null && (
          <ErrorBanner
            message={error}
            onDismiss={() => {
              setError(null);
            }}
          />
        )}

        {active !== null && (
          <Card raised>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
              <StateBadge state="active" />
              <TsText role="title" weight="semibold">
                Seduta {active.slot} in corso
              </TsText>
            </View>
            <TsText role="body" muted>
              {active.snapshot.prescription.title}
            </TsText>
            {/* 1 tocco per rientrare dove si era. */}
            <Button
              label="Riprendi"
              glyph="▶"
              variant="primary"
              large
              onPress={() => {
                openSession(active.id);
              }}
            />
          </Card>
        )}

        {plan === null || cursor === null || next === null ? (
          <EmptyState
            title="Nessuna seduta prevista"
            description={
              plan === null
                ? "Il percorso non e' ancora stato creato. Apri la configurazione per crearlo."
                : 'Il piano non contiene altre sedute dopo questa settimana.'
            }
          />
        ) : (
          <Card raised>
            <SectionTitle
              hint={`${next.week.label} · seduta ${next.slot}${
                cursor.repetitionCount > 0
                  ? ` · settimana ripetuta ${String(cursor.repetitionCount)} volta/e`
                  : ''
              }`}
            >
              {next.prescription.title}
            </SectionTitle>

            <TsText role="body">{next.prescription.focus}</TsText>

            <Divider />

            <View style={{ gap: t.spacing.xs }}>
              <TsText role="small" muted>
                Data prevista
              </TsText>
              <TsText role="bodyLarge" weight="semibold">
                {formatDateLongIt(next.plannedDate)}
              </TsText>
              <TsText role="micro" muted>
                E&apos; una proposta: allenarti in un altro giorno non conta come seduta
                saltata.
              </TsText>
            </View>

            {block !== undefined && (
              <View style={{ gap: t.spacing.xs }}>
                <TsText role="small" muted>
                  Fase e blocco corrente
                </TsText>
                <TsText role="body" weight="semibold">
                  {block.name} · {PHASE_LABEL[block.phase]}
                </TsText>
              </View>
            )}

            {estimate !== null && (
              <View style={{ gap: t.spacing.xs }}>
                <TsText role="small" muted>
                  Durata indicativa stimata
                </TsText>
                <TsText role="bodyLarge" weight="semibold">
                  {formatMinutesIt(estimate.totalMinutes)}
                </TsText>
                <TsText role="micro" muted>
                  Riscaldamento, lavoro, recuperi, cambi di attrezzo e cardio inclusi. E&apos;
                  una stima progettuale: la durata reale viene registrata e confrontata.
                </TsText>
              </View>
            )}

            {/*
              IL comando. Un tocco: valida, crea la seduta con la fotografia
              congelata, apre la schermata di registrazione.
            */}
            <Button
              label={`Inizia la seduta ${next.slot}`}
              glyph="▶"
              variant="primary"
              large
              loading={starting}
              disabled={starting}
              onPress={start}
              accessibilityHint="Apre subito la schermata di registrazione. Nessun passaggio intermedio."
              testID="inizia-seduta"
            />
          </Card>
        )}

        {/* UNA indicazione del coach, non un elenco. */}
        {coachHint !== null && (
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
              <TsText role="body" weight="bold" color={t.colors.accent}>
                ◎
              </TsText>
              <TsText role="body" weight="semibold" style={{ flex: 1 }}>
                {coachHint.title}
              </TsText>
            </View>
            <TsText role="small" muted numberOfLines={3}>
              {coachHint.detail}
            </TsText>
            <Button
              label={
                coachHint.count > 1
                  ? `Vedi le ${String(coachHint.count)} proposte`
                  : 'Vedi la proposta'
              }
              variant="ghost"
              onPress={() => {
                router.push('/coach');
              }}
            />
          </Card>
        )}

        <Button
          label="Impostazioni e profilo"
          glyph="⚙"
          variant="ghost"
          onPress={() => {
            router.push('/impostazioni');
          }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
