/**
 * Campo di testo libero.
 *
 * `base.tsx` fornisce `NumericField` per carichi, ripetizioni e secondi, ma non
 * un campo testuale: serve per note, nomi, data di inizio, etichette delle
 * attrezzature. Sta qui e non in `base.tsx` perche' quel file e' del sistema
 * visivo e non va toccato.
 *
 * Requisiti rispettati: area di tocco di almeno 44 punti, etichetta per lo
 * screen reader, caratteri ingranditi attivi, nessun colore fuori dai token.
 */

import React from 'react';
import { TextInput, View, type KeyboardTypeOptions } from 'react-native';
import { TsText } from '../base';
import { useTheme } from '../../theme/ThemeProvider';

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  autoCapitalize = 'sentences',
  keyboardType,
  hint,
  disabled = false,
  testID,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChangeText: (value: string) => void;
  readonly placeholder?: string;
  readonly multiline?: boolean;
  readonly autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  readonly keyboardType?: KeyboardTypeOptions;
  readonly hint?: string;
  readonly disabled?: boolean;
  readonly testID?: string;
}): React.ReactElement {
  const t = useTheme();
  return (
    <View style={{ gap: t.spacing.xs }}>
      <TsText role="small" muted>
        {label}
      </TsText>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        editable={!disabled}
        placeholder={placeholder ?? '—'}
        placeholderTextColor={t.colors.textMuted}
        multiline={multiline}
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        accessibilityLabel={label}
        accessibilityHint={hint}
        allowFontScaling
        style={{
          minHeight: multiline ? t.minTouchSize * 2 : t.minTouchSize,
          borderWidth: 1,
          borderColor: t.colors.borderControl,
          borderRadius: t.radius.md,
          backgroundColor: t.colors.surface,
          paddingHorizontal: t.spacing.md,
          paddingVertical: t.spacing.md,
          color: t.colors.text,
          fontSize: t.fontSize.body,
          textAlignVertical: multiline ? 'top' : 'center',
        }}
      />
      {hint !== undefined && (
        <TsText role="micro" muted>
          {hint}
        </TsText>
      )}
    </View>
  );
}
