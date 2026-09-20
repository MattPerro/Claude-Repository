/**
 * Profilo.
 *
 * Gli stessi dati dell'onboarding, sempre modificabili (§2: "i valori restano
 * modificabili in qualsiasi momento").
 *
 * Il peso dichiarato resta un dato di configurazione: qui si cambia, e **non**
 * diventa una pesata datata (§13.2). Le pesate stanno in Progressi.
 */

import React, { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import {
  formatDateLongIt,
  WEEKDAY_LABEL,
  type IsoWeekday,
} from '@trackstrong/core';
import {
  Button,
  Card,
  NumericField,
  SectionTitle,
  TsText,
} from '../src/components/base';
import { useTheme } from '../src/theme/ThemeProvider';
import { useStore } from '../src/store';
import { TextField } from '../src/components/session/TextField';
import { ErrorBanner } from '../src/components/session/ErrorBanner';

const WEEKDAYS: readonly IsoWeekday[] = [1, 2, 3, 4, 5, 6, 7];

export default function ProfileScreen(): React.ReactElement {
  const t = useTheme();
  const store = useStore();
  const profile = store.profile;

  const [name, setName] = useState(profile?.displayName ?? '');
  const [heightCm, setHeightCm] = useState<number | null>(profile?.heightCm ?? null);
  const [weightKg, setWeightKg] = useState<number | null>(profile?.declaredWeightKg ?? null);
  const [sportGoal, setSportGoal] = useState(profile?.sportGoal ?? '');
  const [targetKg, setTargetKg] = useState<number | null>(profile?.bodyGoal?.targetKg ?? null);
  const [minutes, setMinutes] = useState<number | null>(
    profile?.availableMinutesPerSession ?? null,
  );
  const [weekdays, setWeekdays] = useState<readonly IsoWeekday[]>(
    profile?.preferredWeekdays ?? [],
  );
  const [notes, setNotes] = useState(profile?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = useCallback(() => {
    if (profile === null) return;
    setError(null);
    setSaved(false);
    try {
      store.repos.workspace.saveProfile({
        id: profile.id,
        displayName: name.trim(),
        heightCm,
        declaredWeightKg: weightKg,
        bodyGoal:
          targetKg === null
            ? null
            : {
                targetKg,
                stretchTargetKg: profile.bodyGoal?.stretchTargetKg ?? null,
                note: profile.bodyGoal?.note ?? null,
              },
        sportGoal: sportGoal.trim() === '' ? null : sportGoal.trim(),
        programStartDate: profile.programStartDate,
        preferredWeekdays: weekdays,
        availableMinutesPerSession: minutes ?? profile.availableMinutesPerSession,
        sessionsPerWeek: profile.sessionsPerWeek,
        notes: notes.trim() === '' ? null : notes.trim(),
      });
      store.reload();
      setSaved(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `Profilo non salvato: ${cause.message}`
          : 'Profilo non salvato per un motivo non identificato.',
      );
    }
  }, [profile, store, name, heightCm, weightKg, targetKg, sportGoal, weekdays, minutes, notes]);

  if (profile === null) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: t.colors.background }}
        contentContainerStyle={{ padding: t.spacing.lg }}
      >
        <Card>
          <TsText role="title" weight="semibold">
            Nessun profilo
          </TsText>
          <TsText role="body" muted>
            Il profilo non e ancora stato creato. Completa la configurazione iniziale.
          </TsText>
        </Card>
      </ScrollView>
    );
  }

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
        {error !== null && (
          <ErrorBanner
            message={error}
            onRetry={save}
            onDismiss={() => {
              setError(null);
            }}
          />
        )}
        {saved && (
          <Card>
            <TsText role="body" color={t.colors.success} weight="semibold">
              ✓ Profilo salvato sul dispositivo.
            </TsText>
          </Card>
        )}

        <Card>
          <SectionTitle
            hint={`Percorso iniziato il ${formatDateLongIt(profile.programStartDate)}.`}
          >
            Dati personali
          </SectionTitle>
          <TextField label="Nome" value={name} onChangeText={setName} />
          <NumericField
            label="Altezza"
            unit="cm"
            allowDecimals={false}
            value={heightCm}
            onChangeValue={setHeightCm}
          />
          <NumericField
            label="Peso dichiarato"
            unit="kg"
            value={weightKg}
            onChangeValue={setWeightKg}
          />
          <TsText role="small" muted>
            Il peso dichiarato e una configurazione, non una pesata: non entra nei
            grafici ne nella media mobile a 7 giorni.
          </TsText>
        </Card>

        <Card>
          <SectionTitle hint="Un riferimento, non una promessa: nessuna data viene indicata.">
            Obiettivi
          </SectionTitle>
          <NumericField
            label="Peso di riferimento"
            unit="kg"
            value={targetKg}
            onChangeValue={setTargetKg}
          />
          <TextField
            label="Obiettivo sportivo"
            value={sportGoal}
            onChangeText={setSportGoal}
            multiline
          />
        </Card>

        <Card>
          <SectionTitle hint="Proposti, non imposti.">Giorni preferiti</SectionTitle>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>
            {WEEKDAYS.map((day) => {
              const selected = weekdays.includes(day);
              return (
                <Button
                  key={String(day)}
                  label={WEEKDAY_LABEL[day]}
                  glyph={selected ? '●' : '○'}
                  variant={selected ? 'primary' : 'ghost'}
                  onPress={() => {
                    setWeekdays((current) =>
                      current.includes(day)
                        ? current.filter((d) => d !== day)
                        : [...current, day].sort((a, b) => a - b),
                    );
                  }}
                />
              );
            })}
          </View>
        </Card>

        <Card>
          <SectionTitle hint="Usato per stimare la durata delle sedute.">
            Tempo disponibile
          </SectionTitle>
          <NumericField
            label="Minuti per seduta, doccia esclusa"
            unit="min"
            allowDecimals={false}
            value={minutes}
            onChangeValue={setMinutes}
          />
          <TsText role="small" muted>
            Sedute a settimana: {String(profile.sessionsPerWeek)}.
          </TsText>
        </Card>

        <Card>
          <SectionTitle hint="Testo libero. Non viene interpretato come istruzione dal coach.">
            Note
          </SectionTitle>
          <TextField label="Contesto" value={notes} onChangeText={setNotes} multiline />
        </Card>

        <Button label="Salva il profilo" glyph="✓" variant="primary" large onPress={save} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
