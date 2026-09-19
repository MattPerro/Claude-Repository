/**
 * La casella in cui si registra una serie.
 *
 * E' la parte piu' importante dell'app, e risponde alle sei domande della
 * specifica §9.1 nell'ordine in cui si leggono:
 *
 *   1. quale esercizio      -> titolo, `role="heading"`
 *   2. quale serie          -> "Serie 2 di 3" (+ lato se per lato)
 *   3. quante ripetizioni   -> bersaglio prescritto, in grande
 *   4. quale carico l'ultima volta -> riga "Ultima volta", sempre presente
 *   5. cosa registrare      -> i campi, precompilati e marcati come tali
 *   6. quanto recupero      -> il pannello del recupero, sopra questa casella
 *
 * **Un solo tocco** per confermare una serie gia' precompilata: il pulsante
 * "Completa serie" e' l'unico passaggio, non apre nessuna modale e non chiede
 * nessuna conferma (§9.2). Mentre la scrittura e' in corso il pulsante e'
 * disabilitato, quindi il doppio tocco non produce due chiamate; e se una
 * seconda chiamata arrivasse comunque, la chiave di idempotenza dello schema la
 * renderebbe un no-op.
 */

import React from 'react';
import { View } from 'react-native';
import {
  BODY_SIDE_LABEL,
  formatEffortIt,
  LOAD_CONVENTION_HELP,
  LOAD_CONVENTION_LABEL,
  requiresNoLoad,
  type EffortTarget,
} from '@trackstrong/core';
import { Button, Card, Divider, NumericField, StateBadge, TsText } from '../base';
import { useTheme } from '../../theme/ThemeProvider';
import { formatTargetIt } from '../../lib/format';
import type { SetSlot } from '../../lib/sessionModel';

export interface SetDraftValues {
  readonly loadKg: number | null;
  readonly reps: number | null;
  readonly seconds: number | null;
  readonly rir: number | null;
}

export function SetEditor({
  exerciseName,
  slot,
  setNumber,
  setTotal,
  effort,
  values,
  prefilled,
  lastTimeLabel,
  equipmentLabel,
  equipmentMissing,
  saving,
  onChange,
  onConfirm,
  onSkip,
  onOpenGuide,
  onChooseEquipment,
}: {
  readonly exerciseName: string;
  readonly slot: SetSlot;
  readonly setNumber: number;
  readonly setTotal: number;
  readonly effort: EffortTarget;
  readonly values: SetDraftValues;
  /** `true` finche' i valori mostrati vengono dalla precompilazione. */
  readonly prefilled: boolean;
  /** "Ultima volta 40 kg x 8 il 12 marzo", oppure `null` se non c'e' storico. */
  readonly lastTimeLabel: string | null;
  readonly equipmentLabel: string | null;
  /** `true` se la convenzione richiede un attrezzo e non e' stato scelto. */
  readonly equipmentMissing: boolean;
  readonly saving: boolean;
  onChange(patch: Partial<SetDraftValues>): void;
  onConfirm(): void;
  onSkip(): void;
  onOpenGuide(): void;
  onChooseEquipment(): void;
}): React.ReactElement {
  const t = useTheme();
  const noLoad = requiresNoLoad(slot.loadConvention);
  const isReps = slot.metric === 'reps';

  return (
    <Card raised>
      {/* 1. quale esercizio */}
      <View style={{ gap: t.spacing.xs }}>
        <TsText role="heading" weight="bold" numberOfLines={2}>
          {exerciseName}
        </TsText>

        {/* 2. quale serie */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
          <TsText role="bodyLarge" weight="semibold">
            Serie {String(setNumber)} di {String(setTotal)}
          </TsText>
          {slot.perSide && (
            <TsText role="bodyLarge" weight="semibold" color={t.colors.accent}>
              · {BODY_SIDE_LABEL[slot.side]}
            </TsText>
          )}
          {prefilled && <StateBadge state="draft" />}
        </View>

        {/* 3. quante ripetizioni o secondi */}
        <TsText role="body" muted>
          Bersaglio: {formatTargetIt(slot.target, slot.metric, slot.perSide)} ·{' '}
          {formatEffortIt(effort)}
        </TsText>

        {/* 4. quale carico l'ultima volta */}
        <TsText role="small" muted>
          {lastTimeLabel ?? 'Nessuna prestazione confrontabile precedente.'}
        </TsText>
      </View>

      <Divider />

      {/* 5. cosa registrare */}
      <View style={{ gap: t.spacing.md }}>
        {noLoad ? (
          <TsText role="small" muted>
            {LOAD_CONVENTION_HELP[slot.loadConvention]}
          </TsText>
        ) : (
          <>
            <NumericField
              label={`Carico — ${LOAD_CONVENTION_LABEL[slot.loadConvention]}`}
              unit="kg"
              value={values.loadKg}
              prefilled={prefilled}
              disabled={saving}
              onChangeValue={(loadKg) => {
                onChange({ loadKg });
              }}
              testID="campo-carico"
            />
            <TsText role="micro" muted>
              {LOAD_CONVENTION_HELP[slot.loadConvention]}
            </TsText>
          </>
        )}

        {isReps ? (
          <NumericField
            label="Ripetizioni eseguite"
            value={values.reps}
            allowDecimals={false}
            prefilled={prefilled}
            disabled={saving}
            onChangeValue={(reps) => {
              onChange({ reps });
            }}
            testID="campo-ripetizioni"
          />
        ) : (
          <NumericField
            label="Secondi eseguiti"
            unit="s"
            value={values.seconds}
            allowDecimals={false}
            prefilled={prefilled}
            disabled={saving}
            onChangeValue={(seconds) => {
              onChange({ seconds });
            }}
            testID="campo-secondi"
          />
        )}

        {/*
          Il RIR resta facoltativo: per gli esercizi a tempo la specifica (§3.10)
          vieta di imporre un RIR privo di significato, quindi il campo non
          compare nemmeno.
        */}
        {isReps && (
          <NumericField
            label="Ripetizioni in riserva (facoltativo)"
            value={values.rir}
            allowDecimals={false}
            disabled={saving}
            onChangeValue={(rir) => {
              onChange({ rir });
            }}
            testID="campo-rir"
          />
        )}

        {(slot.loadConvention === 'machineStack' || slot.loadConvention === 'assisted') && (
          <Button
            label={
              equipmentLabel === null
                ? 'Scegli la macchina usata'
                : `Macchina: ${equipmentLabel}`
            }
            glyph="⚙"
            variant={equipmentMissing ? 'primary' : 'ghost'}
            onPress={onChooseEquipment}
            accessibilityHint="Il valore indicato da una macchina ha senso solo insieme alla macchina."
          />
        )}
      </View>

      {equipmentMissing && (
        <TsText role="small" color={t.colors.danger}>
          Per questa convenzione serve la macchina: senza saperlo il numero non e
          confrontabile e la serie non viene registrata.
        </TsText>
      )}

      {/*
        6. il comando principale. 64 pt di altezza, un solo tocco, e nessuna
        schermata intermedia: validare, salvare, confermare, avviare il
        recupero avviene tutto qui dentro.
      */}
      <Button
        label="Completa serie"
        glyph="✓"
        variant="primary"
        large
        loading={saving}
        disabled={saving}
        onPress={onConfirm}
        accessibilityHint="Registra la serie con i valori mostrati e avvia il recupero."
        testID="completa-serie"
      />

      <Button
        label="Salta questa serie"
        variant="ghost"
        disabled={saving}
        onPress={onSkip}
        accessibilityHint="Registra la serie come saltata. Non conta come eseguita."
      />

      <Button
        label="Come si esegue"
        glyph="?"
        variant="ghost"
        onPress={onOpenGuide}
        accessibilityHint="Apre le indicazioni rapide dell esercizio."
      />
    </Card>
  );
}
