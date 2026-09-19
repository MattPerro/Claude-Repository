/**
 * Serie gia' registrate, con **correzione e annullamento**.
 *
 * Sta nella schermata di seduta e da nessun'altra parte: la specifica §9.2
 * chiede che correggere un completamento accidentale si faccia **senza entrare
 * nelle impostazioni**. Il posto giusto e' dove l'errore e' stato fatto.
 *
 * Un annullamento non cancella la riga: la porta a `voided`, cosi' "confermata
 * e poi annullata" resta visibile come due fatti e non come un buco nello
 * storico (§7).
 */

import React from 'react';
import { View } from 'react-native';
import { BODY_SIDE_LABEL, formatDecimalIt, type StoredPerformedSet } from '@trackstrong/core';
import { Button, Card, Divider, StateBadge, TsText } from '../base';
import { useTheme } from '../../theme/ThemeProvider';
import { formatLoadIt } from '../../lib/format';

function stateOf(set: StoredPerformedSet): 'completed' | 'skipped' | 'voided' | 'draft' {
  if (set.status === 'completed') return 'completed';
  if (set.status === 'skipped') return 'skipped';
  if (set.status === 'voided') return 'voided';
  return 'draft';
}

export function ConfirmedSets({
  sets,
  exerciseNameOf,
  onCorrect,
  onVoid,
}: {
  readonly sets: readonly StoredPerformedSet[];
  exerciseNameOf(performedExerciseId: string): string;
  onCorrect(set: StoredPerformedSet): void;
  onVoid(set: StoredPerformedSet): void;
}): React.ReactElement {
  const t = useTheme();

  if (sets.length === 0) {
    return (
      <Card>
        <TsText role="body" muted>
          Nessuna serie registrata in questa seduta, per ora.
        </TsText>
      </Card>
    );
  }

  return (
    <Card>
      <TsText role="title" weight="semibold">
        Serie registrate
      </TsText>
      <TsText role="small" muted>
        Hai confermato una serie per sbaglio? Si corregge o si annulla da qui.
      </TsText>
      {sets.map((set, index) => (
        <View key={set.id} style={{ gap: t.spacing.sm }}>
          {index > 0 && <Divider />}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: t.spacing.sm,
            }}
          >
            <View style={{ flex: 1, gap: t.spacing.xs }}>
              <TsText role="body" weight="semibold" numberOfLines={1}>
                {exerciseNameOf(set.performedExerciseId)}
              </TsText>
              <TsText role="small" muted>
                Serie {String(set.order)}
                {set.side === 'both' ? '' : ` · ${BODY_SIDE_LABEL[set.side]}`}
                {set.role === 'warmup' ? ' · riscaldamento' : ''}
              </TsText>
              <TsText role="small">
                {set.metric === 'reps'
                  ? `${set.reps === null ? '—' : formatDecimalIt(set.reps)} ripetizioni`
                  : `${set.seconds === null ? '—' : formatDecimalIt(set.seconds)} secondi`}
                {' · '}
                {formatLoadIt(set.load.kg, set.load.convention)}
                {set.rir === null ? '' : ` · RIR ${formatDecimalIt(set.rir)}`}
              </TsText>
              {set.prefilled && (
                <TsText role="micro" muted>
                  Confermata con i valori precompilati, senza modifiche.
                </TsText>
              )}
            </View>
            <StateBadge state={stateOf(set)} />
          </View>
          {set.status === 'completed' && (
            <View style={{ flexDirection: 'row', gap: t.spacing.sm, flexWrap: 'wrap' }}>
              <Button
                label="Correggi"
                glyph="✎"
                variant="ghost"
                onPress={() => {
                  onCorrect(set);
                }}
              />
              <Button
                label="Annulla la conferma"
                glyph="⊘"
                variant="ghost"
                onPress={() => {
                  onVoid(set);
                }}
                accessibilityHint="La serie resta nello storico come annullata e non conta come eseguita."
              />
            </View>
          )}
        </View>
      ))}
    </Card>
  );
}
