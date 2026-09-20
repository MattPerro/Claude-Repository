/**
 * Impostazioni.
 *
 * Raggiungibile con un tocco dalla home (icona della sincronizzazione o
 * pulsante "Impostazioni e profilo"), come chiede la specifica §9.
 *
 * Contiene: tema · caratteri · aptica · notifiche **per dispositivo** · fuso
 * orario · attrezzature con il **loro incremento minimo di carico** ·
 * limitazioni fisiche · sincronizzazione Drive · backup ed esportazione · ore
 * prima della pista.
 *
 * Quello che **non** contiene, deliberatamente: la correzione di una serie.
 * Quella sta nella schermata di seduta (§9.2).
 */

import React, { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Switch, View } from 'react-native';
import { useRouter } from 'expo-router';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Notifications from 'expo-notifications';
import {
  DEFAULT_TIME_ZONE,
  EQUIPMENT_LABEL,
  formatKgIt,
  instantToLocalTime,
  SYNC_STATE_TEXT,
  type EquipmentKind,
  type TimeZone,
  type ThemePreference,
} from '@trackstrong/core';
import { type ImportPreview } from '@trackstrong/db';
import {
  Button,
  Card,
  Divider,
  NumericField,
  SectionTitle,
  SyncIndicator,
  TsText,
} from '../src/components/base';
import { useTheme, useThemePreference } from '../src/theme/ThemeProvider';
import { useStore } from '../src/store';
import { SYNC_MOMENT_LABEL } from '../src/store/syncState';
import { describeDriveLink } from '../src/lib/driveStore';
import { TextField } from '../src/components/session/TextField';
import { ErrorBanner } from '../src/components/session/ErrorBanner';
import { ChoiceList, Sheet } from '../src/components/session/Sheet';

const EQUIPMENT_KINDS: readonly EquipmentKind[] = [
  'legPressMachine',
  'chestPressMachine',
  'latMachine',
  'cableColumn',
  'legCurlMachine',
  'adductorMachine',
  'hipThrustMachine',
  'dumbbells',
  'barbell',
  'bench',
  'inclineBench',
  'step',
  'stationaryBike',
  'bodyweightOnly',
];

export default function SettingsScreen(): React.ReactElement {
  const t = useTheme();
  const router = useRouter();
  const store = useStore();
  const { setPreference } = useThemePreference();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const settings = store.settings;

  // ------------------------------------------------------------ notifiche
  const [permission, setPermission] = useState<string>('sconosciuto');
  useEffect(() => {
    void Notifications.getPermissionsAsync()
      .then((result) => {
        setPermission(result.status);
      })
      .catch(() => {
        setPermission('non disponibile');
      });
  }, []);

  // ----------------------------------------------------------- attrezzature
  const [equipmentSheet, setEquipmentSheet] = useState(false);
  const [equipmentKind, setEquipmentKind] = useState<EquipmentKind | null>(null);
  const [equipmentLabel, setEquipmentLabel] = useState('');
  const [equipmentStep, setEquipmentStep] = useState<number | null>(null);
  const [equipmentNote, setEquipmentNote] = useState('');

  // ------------------------------------------------------------ limitazioni
  const [limitationSheet, setLimitationSheet] = useState(false);
  const [limitationLabel, setLimitationLabel] = useState('');
  const [limitationNote, setLimitationNote] = useState('');

  // ---------------------------------------------------------------- backup
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [pendingImport, setPendingImport] = useState<string | null>(null);

  const [timeZoneDraft, setTimeZoneDraft] = useState<string>(settings.timeZone);

  const patch = useCallback(
    (change: Parameters<typeof store.saveSettings>[0]) => {
      setError(null);
      try {
        store.saveSettings(change);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? `Impostazione non salvata: ${cause.message}`
            : 'Impostazione non salvata per un motivo non identificato.',
        );
      }
    },
    [store],
  );

  const exportBackup = useCallback(() => {
    setError(null);
    setNotice(null);
    try {
      const json = store.repos.backup.exportJson(store.clock.now(), true);
      const file = new File(Paths.cache, `trackstrong-backup-${store.today}.json`);
      file.create({ overwrite: true });
      file.write(json);
      void Sharing.isAvailableAsync().then((available) => {
        if (!available) {
          setNotice(
            `Backup scritto in ${file.uri}. La condivisione di sistema non e disponibile su questo dispositivo.`,
          );
          return;
        }
        void Sharing.shareAsync(file.uri, {
          mimeType: 'application/json',
          dialogTitle: 'Backup TrackStrong',
        }).catch(() => {
          setNotice(`Backup scritto in ${file.uri}. La condivisione e stata annullata.`);
        });
      });
      setNotice(
        'Backup creato. Attenzione: il file contiene i tuoi dati personali in chiaro, ' +
          'perche la cifratura lato client non e attiva. Conservalo di conseguenza.',
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `Backup non creato: ${cause.message}`
          : 'Backup non creato per un motivo non identificato.',
      );
    }
  }, [store]);

  const pickAndPreview = useCallback(() => {
    setError(null);
    setNotice(null);
    void File.pickFileAsync(undefined, 'application/json')
      .then(async (picked) => {
        const file = Array.isArray(picked) ? picked[0] : picked;
        if (file === undefined) return;
        const text = await file.text();
        setPendingImport(text);
        setPreview(store.repos.backup.preview(text));
      })
      .catch((cause: unknown) => {
        setError(
          cause instanceof Error
            ? `File non leggibile: ${cause.message}`
            : 'File non leggibile.',
        );
      });
  }, [store]);

  const confirmImport = useCallback(() => {
    if (pendingImport === null) return;
    setError(null);
    try {
      const result = store.repos.backup.import(pendingImport, { onDuplicate: 'skip' });
      setNotice(
        `Importate ${String(result.inserted)} righe nuove, ${String(result.skippedDuplicates)} duplicati saltati.`,
      );
      setPreview(null);
      setPendingImport(null);
      store.reload();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `Importazione non eseguita: ${cause.message} Nessun dato e stato modificato.`
          : 'Importazione non eseguita. Nessun dato e stato modificato.',
      );
    }
  }, [pendingImport, store]);

  const driveLink = describeDriveLink({ kind: 'notLinked' });

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
            onDismiss={() => {
              setError(null);
            }}
          />
        )}
        {notice !== null && (
          <Card>
            <TsText role="body">{notice}</TsText>
            <Button
              label="Ho capito"
              variant="ghost"
              onPress={() => {
                setNotice(null);
              }}
            />
          </Card>
        )}

        <Button
          label="Profilo"
          glyph="◐"
          variant="secondary"
          large
          onPress={() => {
            router.push('/profilo');
          }}
        />

        {/* ----------------------------------------------------------- tema */}
        <Card>
          <SectionTitle>Aspetto</SectionTitle>
          <ChoiceList<ThemePreference>
            label="Tema"
            value={settings.theme}
            options={[
              { value: 'system', label: 'Come il sistema' },
              { value: 'light', label: 'Chiaro' },
              { value: 'dark', label: 'Scuro' },
            ]}
            onChange={(theme) => {
              patch({ theme });
              setPreference(theme);
            }}
          />
          <Divider />
          <TsText role="body" weight="semibold">
            Dimensione dei caratteri
          </TsText>
          <TsText role="small" muted>
            Segue le impostazioni di iOS (Impostazioni &gt; Schermo e luminosita&apos; &gt;
            Dimensione testo). Tutti i testi dell&apos;app sono ingrandibili: non c&apos;e&apos;
            una dimensione separata da impostare qui, cosi&apos; non ci sono due verita&apos;
            in conflitto.
          </TsText>
          <TsText role="small" muted>
            Riduzione delle animazioni: {t.reduceMotion ? 'attiva' : 'non attiva'} (segue
            iOS).
          </TsText>
        </Card>

        {/* -------------------------------------------------------- aptica */}
        <Card>
          <SectionTitle>Feedback aptico</SectionTitle>
          <Toggle
            label="Vibrazione alla conferma delle serie e a fine recupero"
            value={settings.hapticsEnabled}
            onChange={(hapticsEnabled) => {
              patch({ hapticsEnabled });
            }}
          />
        </Card>

        {/* ------------------------------------------------------- schermo */}
        <Card>
          <SectionTitle>Durante la seduta</SectionTitle>
          <Toggle
            label="Tieni lo schermo acceso"
            value={settings.keepScreenAwakeDuringSession}
            onChange={(keepScreenAwakeDuringSession) => {
              patch({ keepScreenAwakeDuringSession });
            }}
          />
        </Card>

        {/* ----------------------------------------------------- notifiche */}
        <Card>
          <SectionTitle hint="Le notifiche sono locali a questo dispositivo e non vengono sincronizzate.">
            Notifiche su questo dispositivo
          </SectionTitle>
          <TsText role="small" muted>
            Permesso di sistema: {permission}
          </TsText>
          <Button
            label="Chiedi il permesso di notifica"
            variant="ghost"
            onPress={() => {
              void Notifications.requestPermissionsAsync()
                .then((result) => {
                  setPermission(result.status);
                })
                .catch(() => {
                  setPermission('non disponibile');
                });
            }}
          />
          <Toggle
            label="Promemoria delle sedute pianificate"
            value={settings.sessionReminders}
            onChange={(sessionReminders) => {
              patch({ sessionReminders });
            }}
          />
          <Toggle
            label="Avviso di fine recupero"
            value={settings.restTimerNotifications}
            onChange={(restTimerNotifications) => {
              patch({ restTimerNotifications });
            }}
          />
          <TsText role="small" color={t.colors.warning}>
            ! La **programmazione effettiva** delle notifiche locali non e ancora
            implementata: queste preferenze vengono salvate, ma nessuna notifica viene
            ancora pianificata. Il conto alla rovescia del recupero funziona comunque,
            perche non dipende dalle notifiche.
          </TsText>
          <TsText role="small" muted>
            Con il telefono in silenzioso o in modalita&apos; Focus, un avviso puo&apos;
            non arrivare: e una decisione del sistema operativo, non dell&apos;app.
          </TsText>
        </Card>

        {/* ---------------------------------------------------- fuso orario */}
        <Card>
          <SectionTitle hint="Usato per le date, le ore e la media mobile.">
            Fuso orario
          </SectionTitle>
          <TextField
            label="Identificativo IANA"
            value={timeZoneDraft}
            onChangeText={setTimeZoneDraft}
            autoCapitalize="none"
            hint={`Attuale: ${settings.timeZone}. Ora locale adesso: ${instantToLocalTime(
              store.clock.now(),
              settings.timeZone,
            )}`}
          />
          <Button
            label="Salva il fuso orario"
            variant="secondary"
            onPress={() => {
              const candidate = timeZoneDraft.trim();
              if (candidate === '') {
                setError('Il fuso orario non puo essere vuoto.');
                return;
              }
              try {
                // Verifica reale: un identificativo non valido fa lanciare
                // l'API di formattazione, e non viene salvato.
                instantToLocalTime(store.clock.now(), candidate as TimeZone);
              } catch {
                setError(
                  `"${candidate}" non e un fuso orario valido. Esempio: ${DEFAULT_TIME_ZONE}.`,
                );
                return;
              }
              patch({ timeZone: candidate as TimeZone });
            }}
          />
        </Card>

        {/* --------------------------------------------------- attrezzature */}
        <Card>
          <SectionTitle hint="L'incremento minimo e quello realmente disponibile sull'attrezzo: non una percentuale.">
            Attrezzature
          </SectionTitle>
          {store.equipment.length === 0 ? (
            <TsText role="body" muted>
              Nessun attrezzo configurato. Finche&apos; l&apos;incremento minimo non e
              noto, il coach non propone aumenti di carico e lo dichiara.
            </TsText>
          ) : (
            store.equipment.map((item) => (
              <View key={item.id} style={{ gap: t.spacing.xs }}>
                <Divider />
                <TsText role="body" weight="semibold">
                  {item.label}
                </TsText>
                <TsText role="small" muted>
                  {EQUIPMENT_LABEL[item.kind]} · incremento minimo:{' '}
                  {item.loadStep.stepKg > 0
                    ? formatKgIt(item.loadStep.stepKg)
                    : 'non configurato'}
                </TsText>
                <Button
                  label="Modifica l'incremento"
                  variant="ghost"
                  onPress={() => {
                    setEquipmentKind(item.kind);
                    setEquipmentLabel(item.label);
                    setEquipmentStep(item.loadStep.stepKg > 0 ? item.loadStep.stepKg : null);
                    setEquipmentNote('');
                    setEquipmentSheet(true);
                  }}
                />
              </View>
            ))
          )}
          <Button
            label="Aggiungi un attrezzo"
            glyph="+"
            variant="secondary"
            onPress={() => {
              setEquipmentKind(null);
              setEquipmentLabel('');
              setEquipmentStep(null);
              setEquipmentNote('');
              setEquipmentSheet(true);
            }}
          />
        </Card>

        {/* --------------------------------------------------- limitazioni */}
        <Card>
          <SectionTitle hint="Modificabili in qualsiasi momento. Non sono una diagnosi.">
            Limitazioni fisiche
          </SectionTitle>
          {store.profile === null || store.profile.limitations.length === 0 ? (
            <TsText role="body" muted>
              Nessuna limitazione registrata.
            </TsText>
          ) : (
            store.profile.limitations.map((limitation) => (
              <View key={limitation.id} style={{ gap: t.spacing.xs }}>
                <Divider />
                <TsText role="body" weight="semibold">
                  {limitation.label} {limitation.active ? '' : '(non attiva)'}
                </TsText>
                {limitation.note !== null && (
                  <TsText role="small" muted>
                    {limitation.note}
                  </TsText>
                )}
                <Button
                  label={limitation.active ? 'Segna come risolta' : 'Riattiva'}
                  variant="ghost"
                  onPress={() => {
                    if (store.profile === null) return;
                    try {
                      store.repos.workspace.saveLimitation(store.profile.id, {
                        ...limitation,
                        active: !limitation.active,
                      });
                      store.reload();
                    } catch (cause) {
                      setError(
                        cause instanceof Error
                          ? `Limitazione non aggiornata: ${cause.message}`
                          : 'Limitazione non aggiornata.',
                      );
                    }
                  }}
                />
              </View>
            ))
          )}
          <Button
            label="Aggiungi una limitazione"
            glyph="+"
            variant="secondary"
            disabled={store.profile === null}
            onPress={() => {
              setLimitationLabel('');
              setLimitationNote('');
              setLimitationSheet(true);
            }}
          />
        </Card>

        {/* -------------------------------------------------------- pista */}
        <Card>
          <SectionTitle hint="Criterio prudenziale configurabile, non una garanzia.">
            Ore di riposo prima della pista
          </SectionTitle>
          <NumericField
            label="Ore dall'ultima seduta impegnativa"
            unit="h"
            allowDecimals={false}
            value={settings.hoursBeforeTrackDay}
            onChangeValue={(hours) => {
              if (hours === null || hours <= 0) return;
              patch({ hoursBeforeTrackDay: hours });
            }}
          />
          <TsText role="small" muted>
            Il riferimento iniziale del piano e 72 ore. E&apos; un criterio prudenziale,
            non una promessa sul rendimento in pista. L&apos;app non va usata durante la
            guida.
          </TsText>
        </Card>

        {/* -------------------------------------------------------- Drive */}
        <Card>
          <SectionTitle>Sincronizzazione con Google Drive</SectionTitle>
          <SyncIndicator
            state={store.sync.state}
            {...(store.sync.detail === null ? {} : { detail: store.sync.detail })}
          />
          <TsText role="small" muted>
            {SYNC_STATE_TEXT[store.sync.state].long}
          </TsText>
          <Divider />
          <TsText role="body" weight="semibold">
            {driveLink.title}
          </TsText>
          <TsText role="body" muted>
            {driveLink.detail}
          </TsText>
          <Divider />
          <TsText role="small" muted>
            Modifiche in coda sul dispositivo: {String(store.sync.pendingOperations)}
          </TsText>
          <TsText role="small" muted>
            Conflitti aperti: {String(store.sync.openConflicts)}
          </TsText>
          <TsText role="small" muted>
            Ultimo tentativo:{' '}
            {store.sync.lastAttemptAt === null
              ? 'nessuno'
              : `${instantToLocalTime(store.sync.lastAttemptAt, settings.timeZone)}${
                  store.sync.lastAttemptMoment === null
                    ? ''
                    : ` (${SYNC_MOMENT_LABEL[store.sync.lastAttemptMoment]})`
                }`}
          </TsText>
          {store.sync.lastError !== null && (
            <TsText role="small" color={t.colors.warning}>
              {store.sync.lastError}
            </TsText>
          )}
          <Toggle
            label="Tenta la sincronizzazione automaticamente"
            value={settings.autoSyncEnabled}
            onChange={(autoSyncEnabled) => {
              patch({ autoSyncEnabled });
            }}
          />
          <Button
            label="Sincronizza adesso"
            glyph="⟳"
            variant="secondary"
            onPress={() => {
              store.requestSync('comando-manuale');
            }}
            accessibilityHint="Tenta subito. La registrazione delle serie non dipende mai da questo."
          />
          <TsText role="small" muted>
            La sincronizzazione viene tentata all&apos;apertura, al ritorno in primo
            piano, alla fine di una seduta e su comando manuale. Un problema di rete non
            interrompe mai la registrazione.
          </TsText>
        </Card>

        {/* ------------------------------------------------------- backup */}
        <Card>
          <SectionTitle hint="Il backup e una copia recuperabile: e una cosa diversa dalla sincronizzazione.">
            Backup ed esportazione
          </SectionTitle>
          <Button
            label="Esporta il backup completo (JSON)"
            glyph="↓"
            variant="primary"
            onPress={exportBackup}
          />
          <TsText role="small" muted>
            Il file contiene i dati personali **in chiaro**: la cifratura lato client non
            e attiva, e non la chiamo end-to-end perche&apos; non e implementata ne&apos;
            verificata.
          </TsText>
          <Divider />
          <Button
            label="Scegli un file da importare"
            glyph="↑"
            variant="secondary"
            onPress={pickAndPreview}
          />
          <TsText role="small" muted>
            L&apos;importazione mostra prima un&apos;anteprima e avviene in una sola
            transazione: un file corrotto a meta&apos; lascia lo storico esattamente come
            era.
          </TsText>
          <TsText role="small" muted>
            Esportazione CSV di serie, sessioni e misurazioni: non implementata in questa
            versione.
          </TsText>
        </Card>

        <Card>
          <TsText role="small" muted>
            Dispositivo: {store.deviceId}
          </TsText>
          <TsText role="small" muted>
            Archivio: {store.workspaceId}
          </TsText>
          <TsText role="small" muted>
            Nessuna telemetria. Nessun dato personale nei log.
          </TsText>
        </Card>
      </ScrollView>

      {/* ---------------------------------------------------------- fogli */}

      <Sheet
        visible={equipmentSheet}
        title="Attrezzo"
        subtitle="L'incremento minimo va misurato in palestra, non indovinato."
        onClose={() => {
          setEquipmentSheet(false);
        }}
      >
        <TextField
          label="Nome dell'attrezzo"
          value={equipmentLabel}
          onChangeText={setEquipmentLabel}
          hint="Per esempio: pressa 45 gradi sala pesi."
        />
        <ChoiceList<EquipmentKind>
          label="Categoria"
          value={equipmentKind}
          options={EQUIPMENT_KINDS.map((kind) => ({ value: kind, label: EQUIPMENT_LABEL[kind] }))}
          onChange={setEquipmentKind}
        />
        <NumericField
          label="Incremento minimo disponibile"
          unit="kg"
          value={equipmentStep}
          onChangeValue={setEquipmentStep}
        />
        <TextField
          label="Nota sull'incremento (facoltativa)"
          value={equipmentNote}
          onChangeText={setEquipmentNote}
          hint="Per esempio: pacco a 5 kg, microcarichi da 1,25 kg disponibili."
        />
        <Button
          label="Salva l'attrezzo"
          variant="primary"
          large
          disabled={equipmentKind === null || equipmentLabel.trim() === ''}
          onPress={() => {
            if (equipmentKind === null) return;
            setError(null);
            try {
              store.repos.workspace.saveEquipment({
                label: equipmentLabel.trim(),
                kind: equipmentKind,
                stepKg: equipmentStep ?? 0,
                stepNote: equipmentNote.trim() === '' ? null : equipmentNote.trim(),
              });
              setEquipmentSheet(false);
              store.reload();
            } catch (cause) {
              setError(
                cause instanceof Error
                  ? `Attrezzo non salvato: ${cause.message}`
                  : 'Attrezzo non salvato.',
              );
            }
          }}
        />
      </Sheet>

      <Sheet
        visible={limitationSheet}
        title="Limitazione fisica"
        subtitle="Un'informazione che tu dichiari. L'app non diagnostica niente."
        onClose={() => {
          setLimitationSheet(false);
        }}
      >
        <TextField
          label="Zona o descrizione"
          value={limitationLabel}
          onChangeText={setLimitationLabel}
        />
        <TextField
          label="Nota (facoltativa)"
          value={limitationNote}
          onChangeText={setLimitationNote}
          multiline
        />
        <Button
          label="Salva la limitazione"
          variant="primary"
          large
          disabled={limitationLabel.trim() === '' || store.profile === null}
          onPress={() => {
            if (store.profile === null) return;
            setError(null);
            try {
              store.repos.workspace.saveLimitation(store.profile.id, {
                id: store.ids.newId(),
                label: limitationLabel.trim(),
                note: limitationNote.trim() === '' ? null : limitationNote.trim(),
                affectedExerciseIds: [],
                active: true,
                recordedOn: store.today,
              });
              setLimitationSheet(false);
              store.reload();
            } catch (cause) {
              setError(
                cause instanceof Error
                  ? `Limitazione non salvata: ${cause.message}`
                  : 'Limitazione non salvata.',
              );
            }
          }}
        />
      </Sheet>

      <Sheet
        visible={preview !== null}
        title="Anteprima dell'importazione"
        subtitle="Niente viene scritto finche' non confermi."
        onClose={() => {
          setPreview(null);
          setPendingImport(null);
        }}
      >
        {preview !== null && (
          <>
            <TsText role="body">
              Formato {String(preview.formatVersion)} · schema{' '}
              {String(preview.schemaVersion)} ·{' '}
              {preview.sameWorkspace ? 'stesso archivio' : 'archivio diverso'}
            </TsText>
            <TsText role="body" weight="semibold">
              {String(preview.totalNew)} righe nuove, {String(preview.totalDuplicates)}{' '}
              duplicati su {String(preview.totalInFile)} nel file.
            </TsText>
            {preview.warnings.map((warning, index) => (
              <TsText key={`warn-${String(index)}`} role="small" color={t.colors.warning}>
                ! {warning}
              </TsText>
            ))}
            <Divider />
            {preview.perTable
              .filter((row) => row.inFile > 0)
              .map((row) => (
                <TsText key={row.table} role="small">
                  · {row.table}: {String(row.newRows)} nuove, {String(row.duplicates)}{' '}
                  duplicate
                </TsText>
              ))}
            <Button
              label="Importa (salta i duplicati)"
              variant="primary"
              large
              onPress={confirmImport}
            />
            <TsText role="small" muted>
              Il ripristino non sovrascrive gli altri dispositivi: le modifiche entrano
              nella coda locale come qualunque altra modifica.
            </TsText>
          </>
        )}
      </Sheet>
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------

function Toggle({
  label,
  value,
  onChange,
}: {
  readonly label: string;
  readonly value: boolean;
  readonly onChange: (value: boolean) => void;
}): React.ReactElement {
  const t = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: t.spacing.md,
        minHeight: t.minTouchSize,
      }}
    >
      <TsText role="body" style={{ flex: 1 }}>
        {label}
      </TsText>
      <Switch
        value={value}
        onValueChange={onChange}
        accessibilityLabel={label}
        accessibilityRole="switch"
        trackColor={{ false: t.colors.borderControl, true: t.colors.accentSurface }}
        thumbColor={t.colors.onAccent}
        ios_backgroundColor={t.colors.borderControl}
      />
    </View>
  );
}
