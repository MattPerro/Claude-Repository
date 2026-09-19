/**
 * Pannello del recupero.
 *
 * Mostra **quanto recupero rimane** con il numero piu' grande della schermata
 * (`role="timer"`, 64 pt) e i cinque comandi richiesti dalla specifica §11:
 * pausa, riprendi, +15 s, -15 s, salta.
 *
 * Un recupero scaduto **resta visibile come terminato**: non scompare e non
 * completa niente. Sta all'utente prendere atto e passare alla serie
 * successiva.
 */

import React from 'react';
import { View } from 'react-native';
import { formatRestIt, type RestSpec } from '@trackstrong/core';
import { Button, Card, StepperButton, TsText } from '../base';
import { useTheme } from '../../theme/ThemeProvider';
import { formatCountdown } from '../../lib/format';
import { REST_ADJUST_SECONDS, type RestTimerApi } from '../../lib/useRestTimer';

export function RestTimerPanel({
  timer,
  spec,
  onDone,
}: {
  readonly timer: RestTimerApi;
  /** Recupero prescritto, mostrato come intervallo accanto al conto. */
  readonly spec: RestSpec | null;
  readonly onDone: () => void;
}): React.ReactElement | null {
  const t = useTheme();
  if (timer.state === null) return null;

  const finished = timer.expired;

  return (
    <Card raised accessibilityLabel={finished ? 'Recupero terminato' : 'Recupero in corso'}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'baseline',
          justifyContent: 'space-between',
        }}
      >
        <TsText role="small" muted>
          {finished ? 'Recupero terminato' : timer.paused ? 'Recupero in pausa' : 'Recupero'}
        </TsText>
        {spec !== null && (
          <TsText role="small" muted>
            prescritto {formatRestIt(spec)}
          </TsText>
        )}
      </View>

      <TsText
        role="timer"
        align="center"
        color={finished ? t.colors.success : t.colors.text}
        accessibilityLabel={
          finished
            ? 'Recupero terminato. Nessuna serie e stata registrata automaticamente.'
            : `Recupero: ${formatCountdown(timer.remaining)}`
        }
      >
        {finished ? '0:00' : formatCountdown(timer.remaining)}
      </TsText>

      {timer.manualAdjustmentSeconds !== 0 && (
        <TsText role="small" muted align="center">
          {timer.manualAdjustmentSeconds > 0 ? '+' : ''}
          {String(timer.manualAdjustmentSeconds)} s rispetto al prescritto
        </TsText>
      )}

      {finished ? (
        <>
          <TsText role="small" muted>
            Il tempo e finito. Nessuna serie e stata completata automaticamente: la
            prossima serie va confermata da te.
          </TsText>
          <Button label="Ho ripreso" onPress={onDone} variant="primary" large glyph="▶" />
        </>
      ) : (
        <View
          style={{
            flexDirection: 'row',
            gap: t.spacing.sm,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <StepperButton
            label={`−${String(REST_ADJUST_SECONDS)}`}
            accessibilityLabel={`Togli ${String(REST_ADJUST_SECONDS)} secondi al recupero`}
            onPress={() => {
              timer.addSeconds(-REST_ADJUST_SECONDS);
            }}
          />
          <StepperButton
            label={`+${String(REST_ADJUST_SECONDS)}`}
            accessibilityLabel={`Aggiungi ${String(REST_ADJUST_SECONDS)} secondi al recupero`}
            onPress={() => {
              timer.addSeconds(REST_ADJUST_SECONDS);
            }}
          />
          {timer.paused ? (
            <Button
              label="Riprendi"
              glyph="▶"
              onPress={timer.resume}
              accessibilityHint="Riprende il conto alla rovescia del recupero."
            />
          ) : (
            <Button
              label="Pausa"
              glyph="⏸"
              onPress={timer.pause}
              accessibilityHint="Mette in pausa il conto alla rovescia del recupero."
            />
          )}
          <Button
            label="Salta"
            glyph="⏭"
            variant="ghost"
            onPress={timer.skip}
            accessibilityHint="Chiude il recupero senza attendere. Non registra nessuna serie."
          />
        </View>
      )}
    </Card>
  );
}
