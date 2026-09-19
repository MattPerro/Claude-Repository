/**
 * Configurazione iniziale: **breve e saltabile per le parti non essenziali**.
 *
 * La specifica §2 e' esplicita: "Non bloccare l'accesso alla scheda con un
 * lungo questionario". Quindi qui:
 *
 *  - obbligatorio: **solo** la data di inizio, che serve a costruire il piano
 *    su date reali;
 *  - tutto il resto e' facoltativo e modificabile in qualsiasi momento dalle
 *    impostazioni; il pulsante "Salta e inizia" e' sempre disponibile;
 *  - lunedi' e giovedi' sono **proposti**, non imposti: si possono togliere
 *    tutti;
 *  - i campi partono dai valori del bootstrap locale se esiste, altrimenti
 *    vuoti (vedi `src/lib/bootstrap.ts`). Niente dati personali nel codice.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  EQUIPMENT_LABEL,
  instantToLocalDate,
  isLocalDate,
  WEEKDAY_LABEL,
  type EquipmentKind,
  type IsoWeekday,
  type LocalDate,
} from '@trackstrong/core';
import {
  Button,
  Card,
  NumericField,
  SectionTitle,
  TsText,
} from '../src/components/base';
import { useTheme } from '../src/theme/ThemeProvider';
import { useStoreStatus } from '../src/store';
import { loadOnboardingDefaults } from '../src/lib/bootstrap';
import { ErrorBanner } from '../src/components/session/ErrorBanner';
import { TextField } from '../src/components/session/TextField';

const WEEKDAYS: readonly IsoWeekday[] = [1, 2, 3, 4, 5, 6, 7];

/**
 * Attrezzature proposte in configurazione.
 *
 * Sono le categorie che il programma iniziale usa. L'**incremento minimo di
 * carico** non e' indovinato qui: si configura per attrezzo nelle impostazioni,
 * perche' dipende dalla palestra (§5.1). Finche' non e' configurato il motore
 * non propone aumenti, e lo dichiara.
 */
const EQUIPMENT_CHOICES: readonly EquipmentKind[] = [
  'legPressMachine',
  'chestPressMachine',
  'latMachine',
  'cableColumn',
  'legCurlMachine',
  'adductorMachine',
  'hipThrustMachine',
  'dumbbells',
  'bench',
  'inclineBench',
  'step',
  'stationaryBike',
];

export default function OnboardingScreen(): React.ReactElement {
  const t = useTheme();
  const router = useRouter();
  const status = useStoreStatus();
  const core = status.core;

  const bootstrap = useMemo(() => loadOnboardingDefaults(), []);
  const defaults = bootstrap.defaults;

  const todayIso = useMemo<LocalDate | null>(() => {
    if (core === null) return null;
    return instantToLocalDate(core.clock.now(), core.timeZone);
  }, [core]);

  const [name, setName] = useState(defaults.displayName);
  const [startDate, setStartDate] = useState<string>(todayIso ?? '');
  const [weekdays, setWeekdays] = useState<readonly IsoWeekday[]>(defaults.preferredWeekdays);
  const [minutes, setMinutes] = useState<number | null>(defaults.availableMinutesPerSession);
  const [heightCm, setHeightCm] = useState<number | null>(defaults.heightCm);
  const [weightKg, setWeightKg] = useState<number | null>(defaults.declaredWeightKg);
  const [sportGoal, setSportGoal] = useState(defaults.sportGoal ?? '');
  const [equipment, setEquipment] = useState<readonly EquipmentKind[]>([]);
  const [error, setError] = useState<string | null>(null);

  const effectiveStart = startDate.trim() === '' ? (todayIso ?? '') : startDate.trim();
  const startValid = isLocalDate(effectiveStart);

  const submit = useCallback(
    (skipOptional: boolean) => {
      if (core === null) return;
      if (!isLocalDate(effectiveStart)) {
        setError(
          'La data di inizio non e leggibile. Il formato e anno-mese-giorno, per esempio 2026-09-21.',
        );
        return;
      }
      try {
        // Le attrezzature vanno scritte prima del profilo: il loro incremento
        // resta "non configurato" (0) finche' non lo si imposta, e il motore
        // non propone aumenti su un incremento che non conosce (§5.1).
        if (!skipOptional) {
          for (const kind of equipment) {
            core.repos.workspace.saveEquipment({
              label: EQUIPMENT_LABEL[kind],
              kind,
              stepKg: 0,
              stepNote:
                "Incremento minimo non ancora rilevato in palestra: da misurare e impostare.",
            });
          }
        }
        core.completeOnboarding({
          displayName: skipOptional ? '' : name.trim(),
          heightCm: skipOptional ? null : heightCm,
          declaredWeightKg: skipOptional ? null : weightKg,
          bodyGoal: skipOptional ? null : defaults.bodyGoal,
          sportGoal: skipOptional || sportGoal.trim() === '' ? null : sportGoal.trim(),
          programStartDate: effectiveStart,
          preferredWeekdays: skipOptional ? [] : weekdays,
          availableMinutesPerSession: minutes ?? defaults.availableMinutesPerSession,
          sessionsPerWeek: defaults.sessionsPerWeek,
        });
        router.replace('/');
      } catch (cause) {
        setError(
          cause instanceof Error
            ? `Configurazione non salvata: ${cause.message}`
            : 'Configurazione non salvata per un motivo non identificato.',
        );
      }
    },
    [
      core,
      effectiveStart,
      equipment,
      name,
      heightCm,
      weightKg,
      sportGoal,
      weekdays,
      minutes,
      defaults,
      router,
    ],
  );

  if (core === null) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.background, padding: t.spacing.lg }}>
        <TsText role="body" muted>
          Archivio in apertura.
        </TsText>
      </View>
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
        <Card>
          <SectionTitle hint="Due minuti. Tutto resta modificabile dalle impostazioni.">
            Prima di iniziare
          </SectionTitle>
          <TsText role="body">
            Serve solo la data di inizio: il percorso di tre anni viene calcolato su date
            reali a partire da quella. Il resto e facoltativo.
          </TsText>
          {bootstrap.foundLocalFile && (
            <TsText role="small" muted>
              I campi sono precompilati dal tuo file di configurazione locale, che non e
              nel repository.
            </TsText>
          )}
        </Card>

        {error !== null && (
          <ErrorBanner
            message={error}
            onDismiss={() => {
              setError(null);
            }}
          />
        )}

        <Card>
          <SectionTitle hint="Obbligatoria: e l'unica cosa che serve.">
            Data di inizio
          </SectionTitle>
          <TextField
            label="Data di inizio (anno-mese-giorno)"
            value={startDate}
            onChangeText={setStartDate}
            placeholder={todayIso ?? '2026-01-01'}
            autoCapitalize="none"
          />
          {!startValid && (
            <TsText role="small" color={t.colors.danger}>
              Formato atteso: 2026-09-21.
            </TsText>
          )}
        </Card>

        <Card>
          <SectionTitle hint="Facoltativo.">Come ti chiami</SectionTitle>
          <TextField
            label="Nome mostrato nella home"
            value={name}
            onChangeText={setName}
            placeholder="—"
          />
        </Card>

        <Card>
          <SectionTitle hint="Proposti, non imposti: puoi togliere tutti i giorni.">
            Giorni preferiti
          </SectionTitle>
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
          <TsText role="small" muted>
            Le date delle sedute sono una proposta. Allenarti in un altro giorno non
            conta come seduta saltata.
          </TsText>
        </Card>

        <Card>
          <SectionTitle hint="Facoltativo. Serve alla stima della durata delle sedute.">
            Tempo disponibile
          </SectionTitle>
          <NumericField
            label="Minuti per seduta, doccia esclusa"
            unit="min"
            allowDecimals={false}
            value={minutes}
            onChangeValue={setMinutes}
          />
        </Card>

        <Card>
          <SectionTitle hint="Facoltativi. Il peso dichiarato non e una pesata.">
            Altezza e peso dichiarato
          </SectionTitle>
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
            Questo numero e una configurazione iniziale: non entra nei grafici e non
            entra nella media mobile a 7 giorni. Le pesate si registrano in Progressi.
          </TsText>
        </Card>

        <Card>
          <SectionTitle hint="Facoltativo.">Obiettivo sportivo</SectionTitle>
          <TextField
            label="In una frase"
            value={sportGoal}
            onChangeText={setSportGoal}
            placeholder="—"
            multiline
          />
        </Card>

        <Card>
          <SectionTitle hint="Facoltative. L'incremento minimo si imposta poi, attrezzo per attrezzo.">
            Attrezzature principali
          </SectionTitle>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>
            {EQUIPMENT_CHOICES.map((kind) => {
              const selected = equipment.includes(kind);
              return (
                <Button
                  key={kind}
                  label={EQUIPMENT_LABEL[kind]}
                  glyph={selected ? '●' : '○'}
                  variant={selected ? 'primary' : 'ghost'}
                  onPress={() => {
                    setEquipment((current) =>
                      current.includes(kind)
                        ? current.filter((k) => k !== kind)
                        : [...current, kind],
                    );
                  }}
                />
              );
            })}
          </View>
          <TsText role="small" muted>
            L&apos;incremento realmente disponibile su ciascun attrezzo va misurato in
            palestra. Finche&apos; non lo imposti, il coach non propone aumenti di carico
            e dice perche&apos;.
          </TsText>
        </Card>

        <Button
          label="Salva e inizia"
          glyph="✓"
          variant="primary"
          large
          disabled={!startValid}
          onPress={() => {
            submit(false);
          }}
        />
        <Button
          label="Salta il resto e inizia"
          variant="ghost"
          disabled={!startValid}
          onPress={() => {
            submit(true);
          }}
          accessibilityHint="Crea il percorso con la sola data di inizio. Tutto il resto si imposta dopo."
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
