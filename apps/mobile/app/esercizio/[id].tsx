/**
 * Guida completa di un esercizio, offline.
 *
 * Tutti i campi di `ExerciseGuide`, dalla libreria di `@trackstrong/core`.
 * Nessun video, nessun collegamento, nessuna illustrazione: il testo basta
 * anche senza immagini e senza connessione (§12).
 */

import React from 'react';
import { ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Card, TsText } from '../../src/components/base';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useStore } from '../../src/store';
import { FullGuide } from '../../src/components/session/ExerciseGuideView';

export default function ExerciseScreen(): React.ReactElement {
  const t = useTheme();
  const router = useRouter();
  const store = useStore();
  const params = useLocalSearchParams<{ readonly id?: string }>();
  const exercise = params.id === undefined ? undefined : store.library.find(params.id);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.colors.background }}
      contentContainerStyle={{
        padding: t.spacing.lg,
        gap: t.spacing.lg,
        paddingBottom: t.spacing.xxxl,
      }}
    >
      {exercise === undefined ? (
        <Card>
          <TsText role="title" weight="semibold">
            Esercizio non in libreria
          </TsText>
          <TsText role="body" muted>
            Questo identificativo non corrisponde a nessun esercizio conosciuto. Non
            mostro una guida inventata.
          </TsText>
          <Button
            label="Torna alla libreria"
            variant="primary"
            onPress={() => {
              router.replace('/libreria');
            }}
          />
        </Card>
      ) : (
        <FullGuide exercise={exercise} />
      )}
    </ScrollView>
  );
}
