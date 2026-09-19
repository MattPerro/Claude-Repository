/**
 * Foglio modale, usato **solo su richiesta esplicita**.
 *
 * Due vincoli della specifica sono incorporati qui:
 *
 *  - §9.2: **nessuna modale ripetitiva fra le serie**. Questo componente non si
 *    apre mai da solo: si apre solo quando l'utente tocca un comando dedicato
 *    (approfondimento della guida, sostituzione, correzione, fine anticipata).
 *  - §9.1: nessun controllo essenziale coperto dalla tastiera. Il contenuto e'
 *    dentro un `KeyboardAvoidingView` + `ScrollView`, e i comandi stanno in
 *    fondo al contenuto scorribile, non sotto la tastiera.
 *
 * La chiusura e' sempre disponibile con un pulsante: nessun gesto nascosto
 * obbligatorio.
 */

import React from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, View } from 'react-native';
import { Button, Divider, TsText } from '../base';
import { useTheme } from '../../theme/ThemeProvider';

export function Sheet({
  visible,
  title,
  subtitle,
  onClose,
  children,
  closeLabel = 'Chiudi',
}: {
  readonly visible: boolean;
  readonly title: string;
  readonly subtitle?: string;
  readonly onClose: () => void;
  readonly children: React.ReactNode;
  readonly closeLabel?: string;
}): React.ReactElement {
  const t = useTheme();
  return (
    <Modal
      visible={visible}
      animationType={t.reduceMotion ? 'none' : 'slide'}
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      supportedOrientations={['portrait']}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, backgroundColor: t.colors.background }}
      >
        <View style={{ padding: t.spacing.lg, gap: t.spacing.xs }}>
          <TsText role="title" weight="semibold">
            {title}
          </TsText>
          {subtitle !== undefined && (
            <TsText role="small" muted>
              {subtitle}
            </TsText>
          )}
        </View>
        <Divider />
        <ScrollView
          contentContainerStyle={{
            padding: t.spacing.lg,
            gap: t.spacing.lg,
            paddingBottom: t.spacing.xxxl,
          }}
          keyboardShouldPersistTaps="handled"
        >
          {children}
          <Button label={closeLabel} onPress={onClose} variant="secondary" large />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Elenco di scelte esclusive, con simbolo e testo (mai solo il colore). */
export function ChoiceList<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  readonly options: readonly { readonly value: T; readonly label: string; readonly hint?: string }[];
  readonly value: T | null;
  readonly onChange: (value: T) => void;
  readonly label: string;
}): React.ReactElement {
  const t = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={{ gap: t.spacing.sm }}
    >
      <TsText role="small" muted>
        {label}
      </TsText>
      {options.map((option) => (
        <Button
          key={option.value}
          label={option.hint === undefined ? option.label : `${option.label} — ${option.hint}`}
          glyph={value === option.value ? '●' : '○'}
          onPress={() => {
            onChange(option.value);
          }}
          variant={value === option.value ? 'primary' : 'ghost'}
          style={{ justifyContent: 'flex-start' }}
        />
      ))}
    </View>
  );
}
