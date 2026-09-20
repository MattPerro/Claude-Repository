/**
 * Libreria degli esercizi.
 *
 * Elenco completo di quello che c'e' davvero nella libreria offline, compresa
 * l'alternativa hip thrust (§12). Da qui si apre la guida completa.
 */

import React, { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  EQUIPMENT_LABEL,
  MOVEMENT_PATTERN_LABEL,
  type Exercise,
} from '@trackstrong/core';
import { Button, Card, Divider, SectionTitle, TsText } from '../src/components/base';
import { useTheme } from '../src/theme/ThemeProvider';
import { useStore } from '../src/store';
import { TextField } from '../src/components/session/TextField';

export default function LibraryScreen(): React.ReactElement {
  const t = useTheme();
  const router = useRouter();
  const store = useStore();
  const [query, setQuery] = useState('');

  const exercises = useMemo<readonly Exercise[]>(() => {
    const all = [...store.library.all()].sort((a, b) => a.name.localeCompare(b.name));
    const needle = query.trim().toLowerCase();
    if (needle === '') return all;
    return all.filter(
      (exercise) =>
        exercise.name.toLowerCase().includes(needle) ||
        exercise.shortName.toLowerCase().includes(needle) ||
        exercise.equipment.some((kind) =>
          EQUIPMENT_LABEL[kind].toLowerCase().includes(needle),
        ),
    );
  }, [store.library, query]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, backgroundColor: t.colors.background }}
    >
      <ScrollView
        contentContainerStyle={{
          padding: t.spacing.lg,
          gap: t.spacing.lg,
          paddingBottom: t.spacing.xxxl,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Card>
          <SectionTitle
            hint={`${String(store.library.size)} esercizi con guida offline completa.`}
          >
            Libreria
          </SectionTitle>
          <TextField
            label="Cerca per nome o attrezzatura"
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
          />
        </Card>

        <Card>
          {exercises.length === 0 ? (
            <TsText role="body" muted>
              Nessun esercizio corrisponde alla ricerca.
            </TsText>
          ) : (
            exercises.map((exercise, index) => (
              <View key={exercise.id} style={{ gap: t.spacing.xs }}>
                {index > 0 && <Divider />}
                <TsText role="bodyLarge" weight="semibold">
                  {exercise.name}
                </TsText>
                <TsText role="small" muted>
                  {MOVEMENT_PATTERN_LABEL[exercise.pattern]} ·{' '}
                  {exercise.equipment.map((kind) => EQUIPMENT_LABEL[kind]).join(', ')}
                </TsText>
                <TsText role="small" numberOfLines={2}>
                  {exercise.guide.quickCues[0] ?? ''}
                </TsText>
                <Button
                  label="Guida completa"
                  variant="ghost"
                  onPress={() => {
                    router.push(`/esercizio/${exercise.id}`);
                  }}
                />
              </View>
            ))
          )}
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
