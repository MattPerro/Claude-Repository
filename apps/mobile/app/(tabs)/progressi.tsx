/**
 * Progressi.
 *
 * Quello che questa schermata **non** fa e' importante quanto quello che fa
 * (§13.1 e §13.2):
 *
 *  - non somma carichi di esercizi diversi in una "forza totale";
 *  - non confronta secondi, ripetizioni e distanze come se fossero la stessa
 *    grandezza: ogni gruppo confrontabile ha la sua tabella e la sua unita';
 *  - non inventa calorie;
 *  - non interpola le pesate mancanti, e accanto alla media mobile dice
 *    **quante osservazioni** ci sono;
 *  - non trasforma il peso dichiarato in profilo in una pesata datata;
 *  - non mostra dati dimostrativi: se non ci sono dati, lo dice.
 *
 * Ogni grafico ha l'**alternativa tabellare** accanto, con unita' e periodo
 * dichiarati: un grafico non e' leggibile con uno screen reader.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import {
  diffDays,
  formatDateShortIt,
  formatDecimalIt,
  formatKgIt,
  formatMinutesIt,
  LOAD_CONVENTION_LABEL,
  MEASUREMENT_LABEL,
  MEASUREMENT_UNIT,
  type LocalDate,
  type Measurement,
  type MeasurementKind,
  type MovingAveragePoint,
} from '@trackstrong/core';
import {
  Button,
  Card,
  Divider,
  EmptyState,
  NumericField,
  SectionTitle,
  TsText,
} from '../../src/components/base';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useStore } from '../../src/store';
import {
  buildComparableRows,
  computeTotals,
  readExposureGroups,
  readHistory,
  type ComparableRow,
} from '../../src/lib/history';
import {
  buildScale,
  DEFAULT_GEOMETRY,
  linePath,
  type ChartSeries,
} from '../../src/lib/chart';
import { ErrorBanner } from '../../src/components/session/ErrorBanner';
import { formatOutOf } from '../../src/lib/format';

export default function ProgressScreen(): React.ReactElement {
  const t = useTheme();
  const store = useStore();
  const [newWeight, setNewWeight] = useState<number | null>(null);
  const [newWaist, setNewWaist] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const history = useMemo(
    () => readHistory(store.repos, 200),
    [store.repos, store.version],
  );
  const totals = useMemo(() => computeTotals(history), [history]);
  const groups = useMemo(() => readExposureGroups(history), [history]);
  const rows = useMemo(() => buildComparableRows(groups), [groups]);

  const weightSeries = useMemo(
    () => store.repos.measurements.series('weightKg'),
    [store.repos, store.version],
  );
  const weightAverage = useMemo(
    () => store.repos.measurements.movingAverage('weightKg'),
    [store.repos, store.version],
  );
  const waistSeries = useMemo(
    () => store.repos.measurements.series('waistCm'),
    [store.repos, store.version],
  );

  const plannedSessions = useMemo(() => {
    if (store.plan === null) return 0;
    // Sedute previste fino alla settimana corrente inclusa: contare le 312
    // sedute di tre anni come "previste" oggi non direbbe niente.
    const upTo = store.cursor?.weekIndex ?? 1;
    let count = 0;
    for (const block of store.plan.plan.blocks) {
      for (const week of block.weeks) {
        if (week.index > upTo) break;
        count += week.sessions.length;
      }
    }
    return count;
  }, [store.plan, store.cursor]);

  const recordMeasurement = useCallback(
    (kind: MeasurementKind, value: number | null) => {
      if (value === null) {
        setError('Inserisci un valore: un campo vuoto non e una misurazione.');
        return;
      }
      setError(null);
      try {
        store.repos.measurements.record({
          kind,
          value,
          measuredOn: store.today,
          recordedAt: store.clock.now(),
        });
        store.reload();
        if (kind === 'weightKg') setNewWeight(null);
        if (kind === 'waistCm') setNewWaist(null);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? `Misurazione non salvata: ${cause.message}`
            : 'Misurazione non salvata per un motivo non identificato.',
        );
      }
    },
    [store],
  );

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

        {/* --------------------------------------------------- allenamento */}
        <Card>
          <SectionTitle hint="Le sedute parziali sono contate a parte, non con le completate.">
            Allenamento
          </SectionTitle>
          <Row
            label="Sedute previste finora"
            value={plannedSessions === 0 ? 'nessun dato' : String(plannedSessions)}
          />
          <Row label="Completate" value={String(totals.completed)} />
          <Row label="Parziali" value={String(totals.partial)} />
          <Row label="Saltate" value={String(totals.skipped)} />
          <Divider />
          <Row label="Serie allenanti confermate" value={String(totals.workingSets)} />
          <Row
            label="Con RIR dichiarato"
            value={
              totals.workingSets === 0
                ? 'nessun dato'
                : formatOutOf(totals.setsWithRir, totals.workingSets)
            }
          />
          <Divider />
          <Row
            label="Durata netta registrata"
            value={
              totals.sessionsWithDuration === 0
                ? 'nessun dato'
                : `${formatMinutesIt(totals.netMinutes)} su ${String(totals.sessionsWithDuration)} sedute`
            }
          />
          <TsText role="micro" muted>
            La durata e quella effettivamente registrata, pause escluse: e il confronto
            con la stima progettuale mostrata in Oggi.
          </TsText>
        </Card>

        {/* ------------------------------------------------------- cardio */}
        <Card>
          <TsText role="body" weight="semibold">
            Minuti di cardio
          </TsText>
          <TsText role="body" muted>
            Non disponibili: il cardio svolto si registra nella tabella
            `performed_cardio`, per la quale la persistenza non espone ancora ne&apos; la
            scrittura ne&apos; la lettura. Non mostro uno zero, perche&apos; uno zero
            sarebbe un dato falso.
          </TsText>
        </Card>

        {/* -------------------------------------- esercizi confrontabili */}
        <Card>
          <SectionTitle hint="Un gruppo per chiave di comparabilita': macchine e varianti diverse non si mescolano.">
            Carichi e ripetizioni
          </SectionTitle>
          {rows.length === 0 ? (
            <EmptyState
              title="Nessuna serie confermata"
              description="Appena registri le prime serie allenanti, qui compaiono i progressi per ciascun esercizio confrontabile. Non ci sono dati dimostrativi."
            />
          ) : (
            rows.map((row) => (
              <ComparableBlock key={row.comparabilityKey} row={row} />
            ))
          )}
        </Card>

        {/* ---------------------------------------------- esercizi a tempo */}
        <Card>
          <SectionTitle hint="Per gli esercizi a tempo contano durata e controllo, non un RIR.">
            Esercizi a tempo
          </SectionTitle>
          {rows.filter((row) => row.metric === 'seconds').length === 0 ? (
            <TsText role="body" muted>
              Nessun esercizio a tempo registrato.
            </TsText>
          ) : (
            rows
              .filter((row) => row.metric === 'seconds')
              .map((row) => {
                const exercise = store.library.find(row.exerciseId);
                const last = row.points[row.points.length - 1];
                const first = row.points[0];
                return (
                  <View key={`sec-${row.comparabilityKey}`} style={{ gap: t.spacing.xs }}>
                    <Divider />
                    <TsText role="body" weight="semibold">
                      {exercise?.name ?? row.exerciseId}
                    </TsText>
                    <TsText role="small" muted>
                      Da {first?.bestValue === undefined || first.bestValue === null
                        ? '—'
                        : `${formatDecimalIt(first.bestValue)} s`}{' '}
                      il {first?.date ?? '—'} a{' '}
                      {last?.bestValue === undefined || last.bestValue === null
                        ? '—'
                        : `${formatDecimalIt(last.bestValue)} s`}{' '}
                      il {last?.date ?? '—'} · unita&apos;: secondi
                    </TsText>
                  </View>
                );
              })
          )}
        </Card>

        {/* ---------------------------------------------------------- peso */}
        <Card>
          <SectionTitle hint="Il peso dichiarato in configurazione non compare qui: non e una pesata.">
            Peso
          </SectionTitle>

          <NumericField
            label="Nuova pesata di oggi"
            unit="kg"
            value={newWeight}
            onChangeValue={setNewWeight}
          />
          <Button
            label="Registra la pesata"
            glyph="+"
            variant="primary"
            onPress={() => {
              recordMeasurement('weightKg', newWeight);
            }}
          />

          {weightSeries.length === 0 ? (
            <EmptyState
              title="Nessuna pesata registrata"
              description="La media mobile a 7 giorni compare quando ci sono pesate. Non viene calcolata su valori inventati."
            />
          ) : (
            <>
              <WeightChart series={weightSeries} average={weightAverage} />
              <Divider />
              <TsText role="body" weight="semibold">
                Alternativa tabellare — peso in kg
              </TsText>
              <TsText role="micro" muted>
                Periodo: dal {formatDateShortIt(firstDate(weightSeries))} al{' '}
                {formatDateShortIt(lastDate(weightSeries))}
              </TsText>
              {[...weightAverage].reverse().slice(0, 14).map((point) => (
                <View
                  key={point.date}
                  style={{ flexDirection: 'row', justifyContent: 'space-between' }}
                >
                  <TsText role="small" muted>
                    {formatDateShortIt(point.date)}
                  </TsText>
                  <TsText role="small">
                    media {formatKgIt(point.average)} su{' '}
                    {String(point.observationCount)}{' '}
                    {point.observationCount === 1 ? 'osservazione' : 'osservazioni'}
                  </TsText>
                </View>
              ))}
              <TsText role="micro" muted>
                La media di ogni giorno usa le pesate presenti nella finestra dei sette
                giorni precedenti. I giorni senza pesata non vengono inventati, e nessuna
                data e promessa per un obiettivo di peso.
              </TsText>
            </>
          )}
        </Card>

        {/* ------------------------------------------------- circonferenze */}
        <Card>
          <SectionTitle hint="Facoltative.">Circonferenza vita</SectionTitle>
          <NumericField
            label="Misura di oggi"
            unit="cm"
            value={newWaist}
            onChangeValue={setNewWaist}
          />
          <Button
            label="Registra la misura"
            glyph="+"
            variant="secondary"
            onPress={() => {
              recordMeasurement('waistCm', newWaist);
            }}
          />
          {waistSeries.length === 0 ? (
            <TsText role="body" muted>
              Nessuna misura registrata.
            </TsText>
          ) : (
            [...waistSeries].reverse().slice(0, 10).map((measurement) => (
              <View
                key={measurement.id}
                style={{ flexDirection: 'row', justifyContent: 'space-between' }}
              >
                <TsText role="small" muted>
                  {formatDateShortIt(measurement.measuredOn)}
                </TsText>
                <TsText role="small">
                  {formatDecimalIt(measurement.value)} {MEASUREMENT_UNIT.waistCm}
                </TsText>
              </View>
            ))
          )}
        </Card>

        <Card>
          <TsText role="body" weight="semibold">
            Percentuale di grasso
          </TsText>
          <TsText role="body" muted>
            Compare solo se la inserisci, con metodo e data. Non viene dedotta dal peso:
            dedurla sarebbe un numero inventato ({MEASUREMENT_LABEL.bodyFatPercent}).
          </TsText>
        </Card>

        <Card>
          <TsText role="body" weight="semibold">
            Recupero, camminate e giornate in pista
          </TsText>
          <TsText role="body" muted>
            Non ancora disponibili in questa schermata: le tabelle
            `recovery_check_ins`, `habit_entries` e `track_days` esistono, ma la
            persistenza non espone ancora le funzioni per leggerle e scriverle. Nessun
            punteggio di salute viene calcolato.
          </TsText>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------

function firstDate(series: readonly Measurement[]): LocalDate {
  return series[0]?.measuredOn ?? ('1970-01-01' as LocalDate);
}
function lastDate(series: readonly Measurement[]): LocalDate {
  return series[series.length - 1]?.measuredOn ?? ('1970-01-01' as LocalDate);
}

function Row({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): React.ReactElement {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: t.spacing.sm }}>
      <TsText role="body" muted style={{ flex: 1 }}>
        {label}
      </TsText>
      <TsText role="body" weight="semibold">
        {value}
      </TsText>
    </View>
  );
}

/**
 * Progresso su un gruppo confrontabile.
 *
 * Il titolo dichiara la convenzione di carico: senza di essa il numero non ha
 * significato, e due gruppi dello stesso esercizio con convenzioni diverse sono
 * due cose diverse.
 */
function ComparableBlock({ row }: { readonly row: ComparableRow }): React.ReactElement {
  const t = useTheme();
  const store = useStore();
  const exercise = store.library.find(row.exerciseId);
  const convention = exercise?.loadConvention ?? null;
  const hasLoads = row.points.some((point) => point.loadKg !== null);

  const series = useMemo<readonly ChartSeries[]>(() => {
    const base = row.points[0]?.date ?? null;
    if (base === null) return [];
    return [
      {
        label: 'carico',
        points: row.points
          .filter((point) => point.loadKg !== null)
          .map((point) => ({
            x: diffDays(base, point.date),
            y: point.loadKg ?? 0,
          })),
      },
    ];
  }, [row]);

  const scale = useMemo(() => buildScale(series), [series]);

  return (
    <View style={{ gap: t.spacing.xs }}>
      <Divider />
      <TsText role="bodyLarge" weight="semibold">
        {exercise?.name ?? row.exerciseId}
      </TsText>
      <TsText role="small" muted>
        {convention === null ? 'convenzione non nota' : LOAD_CONVENTION_LABEL[convention]} ·
        unita&apos;: {row.metric === 'reps' ? 'kg e ripetizioni' : 'kg e secondi'} · periodo:{' '}
        {formatDateShortIt((row.points[0]?.date ?? '1970-01-01') as LocalDate)} –{' '}
        {formatDateShortIt(
          (row.points[row.points.length - 1]?.date ?? '1970-01-01') as LocalDate,
        )}
      </TsText>

      {hasLoads && scale !== null && (
        <Svg
          width={DEFAULT_GEOMETRY.width}
          height={DEFAULT_GEOMETRY.height}
          accessibilityLabel={`Andamento del carico di ${exercise?.name ?? row.exerciseId}. I valori esatti sono nella tabella qui sotto.`}
        >
          <Path
            d={linePath(series[0]?.points ?? [], scale)}
            stroke={t.colors.accent}
            strokeWidth={2}
            fill="none"
          />
          {(series[0]?.points ?? []).map((point, index) => {
            const projected = scale.project(point);
            return (
              <Circle
                key={`p-${String(index)}`}
                cx={projected.x}
                cy={projected.y}
                r={3}
                fill={t.colors.accent}
              />
            );
          })}
        </Svg>
      )}

      {/* Alternativa tabellare: sempre presente, anche quando c'e' il grafico. */}
      {row.points
        .slice(-8)
        .reverse()
        .map((point) => (
          <View
            key={`${row.comparabilityKey}-${point.date}`}
            style={{ flexDirection: 'row', justifyContent: 'space-between', gap: t.spacing.sm }}
          >
            <TsText role="small" muted>
              {formatDateShortIt(point.date as LocalDate)}
            </TsText>
            <TsText role="small" style={{ flex: 1 }} align="right">
              {point.loadKg === null
                ? point.mixedLoads
                  ? 'carichi diversi fra le serie'
                  : 'senza carico esterno'
                : formatKgIt(point.loadKg)}
              {' · '}
              {point.bestValue === null
                ? '—'
                : `${formatDecimalIt(point.bestValue)} ${row.metric === 'reps' ? 'rip.' : 's'}`}
              {' · '}
              {String(point.setCount)} {point.setCount === 1 ? 'serie' : 'serie'}
            </TsText>
          </View>
        ))}
    </View>
  );
}

/** Peso: misurazioni e media mobile a 7 giorni, nello stesso grafico. */
function WeightChart({
  series,
  average,
}: {
  readonly series: readonly Measurement[];
  readonly average: readonly MovingAveragePoint[];
}): React.ReactElement | null {
  const t = useTheme();
  const base = series[0]?.measuredOn ?? null;
  if (base === null) return null;

  const raw: ChartSeries = {
    label: 'pesate',
    points: series.map((m) => ({ x: diffDays(base, m.measuredOn), y: m.value })),
  };
  const mean: ChartSeries = {
    label: 'media 7 giorni',
    points: average.map((p) => ({ x: diffDays(base, p.date), y: p.average })),
  };
  const scale = buildScale([raw, mean]);
  if (scale === null) return null;

  return (
    <View style={{ gap: t.spacing.xs }}>
      <Svg
        width={DEFAULT_GEOMETRY.width}
        height={DEFAULT_GEOMETRY.height}
        accessibilityLabel="Andamento del peso: pesate e media mobile a sette giorni. I valori esatti sono nella tabella qui sotto."
      >
        <Path d={linePath(mean.points, scale)} stroke={t.colors.accent} strokeWidth={2} fill="none" />
        {raw.points.map((point, index) => {
          const projected = scale.project(point);
          return (
            <Circle
              key={`w-${String(index)}`}
              cx={projected.x}
              cy={projected.y}
              r={3}
              fill={t.colors.info}
            />
          );
        })}
      </Svg>
      <TsText role="micro" muted>
        Punti: pesate registrate. Linea: media mobile a 7 giorni. Unita&apos;: kg. L&apos;asse
        verticale copre {formatKgIt(scale.minY)} – {formatKgIt(scale.maxY)} e non parte da
        zero, per rendere visibili le variazioni reali.
      </TsText>
    </View>
  );
}
