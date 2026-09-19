/**
 * Errore di salvataggio, **in schermata**.
 *
 * Non e' un `Alert.alert`: un avviso di sistema si chiude con un tocco e non
 * lascia traccia, mentre qui l'errore deve restare visibile finche' non e'
 * stato risolto, con i dati ancora nel campo. La specifica (§10) vieta di
 * fingere che un salvataggio riuscito sia avvenuto, e un messaggio che
 * scompare da solo e' molto vicino a fingerlo.
 */

import React from 'react';
import { View } from 'react-native';
import { Button, Card, TsText } from '../base';
import { useTheme } from '../../theme/ThemeProvider';

export function ErrorBanner({
  message,
  onRetry,
  onDismiss,
  retryLabel = 'Riprova',
}: {
  readonly message: string;
  readonly onRetry?: () => void;
  readonly onDismiss?: () => void;
  readonly retryLabel?: string;
}): React.ReactElement {
  const t = useTheme();
  return (
    <Card
      raised
      accessibilityLabel={`Errore. ${message}`}
      style={{ borderWidth: 2, borderColor: t.colors.danger }}
    >
      <View style={{ flexDirection: 'row', gap: t.spacing.sm, alignItems: 'flex-start' }}>
        <TsText role="bodyLarge" weight="bold" color={t.colors.danger}>
          !
        </TsText>
        <View style={{ flex: 1, gap: t.spacing.xs }}>
          <TsText role="body" weight="semibold" color={t.colors.danger}>
            Non salvato
          </TsText>
          <TsText role="body">{message}</TsText>
          <TsText role="small" muted>
            I valori sono ancora nei campi: non sono stati registrati.
          </TsText>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
        {onRetry !== undefined && (
          <Button label={retryLabel} onPress={onRetry} variant="primary" />
        )}
        {onDismiss !== undefined && (
          <Button label="Chiudi l'avviso" onPress={onDismiss} variant="ghost" />
        )}
      </View>
    </Card>
  );
}
