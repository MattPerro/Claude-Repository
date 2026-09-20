/**
 * Calendario: vista mese e vista settimana.
 *
 * Il punto piu' importante di questa schermata e' una distinzione, non un
 * disegno: **data prevista** ed **esecuzione effettiva** restano separate e
 * visibili (§11). Una seduta prevista lunedi' e svolta mercoledi' compare in
 * entrambe le informazioni, e non diventa "svolta lunedi'".
 *
 * Gli stati sono resi con `StateBadge`, quindi **simbolo + testo** e non solo
 * colore (§9.1).
 *
 * ## Limiti dichiarati
 *
 *  - Le date previste sono **calcolate** dal piano e dai giorni proposti nel
 *    profilo: `@trackstrong/db` non espone un repository per `planned_events`,
 *    quindi spostare una singola occorrenza non e' ancora persistibile. Il
 *    comando non c'e' invece di esserci e non funzionare.
 *  - Cardio, camminate e giornate in pista hanno le tabelle
 *    (`performed_cardio`, `habit_entries`, `track_days`) ma **nessun
 *    repository**: non sono leggibili ne' scrivibili da qui, e la schermata lo
 *    dichiara invece di mostrare una riga vuota.
 */

import React, { useMemo, useState } from 'react';
import { SafeAreaView, ScrollView, View } from 'react-native';
import {
  addDays,
  addMonths,
  compareDates,
  daysInMonth,
  endOfMonth,
  endOfWeek,
  formatDateLongIt,
  formatDateShortIt,
  fromParts,
  MONTH_LABEL_IT,
  startOfMonth,
  startOfWeek,
  toParts,
  WEEKDAY_SHORT,
  weekday,
  type IsoWeekday,
  type LocalDate,
  type Session,
  type StateName,
} from '@trackstrong/core';
import {
  Button,
  Card,
  Divider,
  EmptyState,
  SectionTitle,
  StateBadge,
  TsText,
} from '../../src/components/base';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useStore } from '../../src/store';
import { plannedSessionsBetween, type PlannedSession } from '../../src/lib/schedule';

type ViewMode = 'month' | 'week';

/** Stato di una seduta registrata, nei termini dei badge condivisi. */
function badgeOf(session: Session): StateName {
  switch (session.status) {
    case 'completed':
      return 'completed';
    case 'partial':
      return 'partial';
    case 'skipped':
      return 'skipped';
    case 'active':
    case 'paused':
      return 'active';
    case 'planned':
      return 'planned';
    default:
      return 'planned';
  }
}

export default function CalendarScreen(): React.ReactElement {
  const t = useTheme();
  const store = useStore();
  const [mode, setMode] = useState<ViewMode>('month');
  const [anchor, setAnchor] = useState<LocalDate>(store.today);

  const range = useMemo(() => {
    if (mode === 'month') {
      return { from: startOfMonth(anchor), to: endOfMonth(anchor) };
    }
    return { from: startOfWeek(anchor), to: endOfWeek(anchor) };
  }, [mode, anchor]);

  const planned = useMemo<readonly PlannedSession[]>(() => {
    if (store.plan === null) return [];
    return plannedSessionsBetween(
      store.plan.plan,
      range.from,
      range.to,
      store.profile?.preferredWeekdays ?? [],
    );
  }, [store.plan, store.profile, range]);

  /** Sedute REALMENTE registrate nel periodo, per data di esecuzione. */
  const performed = useMemo<readonly Session[]>(() => {
    return store.repos.sessions
      .history(400)
      .filter(
        (session) =>
          session.performedDate !== null &&
          compareDates(session.performedDate, range.from) >= 0 &&
          compareDates(session.performedDate, range.to) <= 0,
      );
  }, [store.repos, range, store.version]);

  const performedByDate = useMemo(() => {
    const map = new Map<string, Session[]>();
    for (const session of performed) {
      if (session.performedDate === null) continue;
      const list = map.get(session.performedDate) ?? [];
      list.push(session);
      map.set(session.performedDate, list);
    }
    return map;
  }, [performed]);

  const plannedByDate = useMemo(() => {
    const map = new Map<string, PlannedSession[]>();
    for (const item of planned) {
      const list = map.get(item.plannedDate) ?? [];
      list.push(item);
      map.set(item.plannedDate, list);
    }
    return map;
  }, [planned]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.background }}>
      <ScrollView
        contentContainerStyle={{
          padding: t.spacing.lg,
          gap: t.spacing.lg,
          paddingBottom: t.spacing.xxxl,
        }}
      >
        <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
          <Button
            label="Mese"
            glyph={mode === 'month' ? '●' : '○'}
            variant={mode === 'month' ? 'primary' : 'ghost'}
            onPress={() => {
              setMode('month');
            }}
          />
          <Button
            label="Settimana"
            glyph={mode === 'week' ? '●' : '○'}
            variant={mode === 'week' ? 'primary' : 'ghost'}
            onPress={() => {
              setMode('week');
            }}
          />
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: t.spacing.sm,
          }}
        >
          <Button
            label="Precedente"
            glyph="‹"
            variant="ghost"
            onPress={() => {
              setAnchor(mode === 'month' ? addMonths(anchor, -1) : addDays(anchor, -7));
            }}
          />
          <TsText role="body" weight="semibold" align="center" style={{ flex: 1 }}>
            {mode === 'month'
              ? `${MONTH_LABEL_IT[toParts(anchor).month - 1] ?? ''} ${String(toParts(anchor).year)}`
              : `${formatDateShortIt(range.from)} – ${formatDateShortIt(range.to)}`}
          </TsText>
          <Button
            label="Successivo"
            glyph="›"
            variant="ghost"
            onPress={() => {
              setAnchor(mode === 'month' ? addMonths(anchor, 1) : addDays(anchor, 7));
            }}
          />
        </View>

        {mode === 'month' ? (
          <MonthGrid
            anchor={anchor}
            today={store.today}
            plannedByDate={plannedByDate}
            performedByDate={performedByDate}
          />
        ) : (
          <WeekStrip
            from={range.from}
            today={store.today}
            plannedByDate={plannedByDate}
            performedByDate={performedByDate}
          />
        )}

        <Card>
          <SectionTitle hint="La data prevista e l'esecuzione effettiva restano separate.">
            Nel periodo
          </SectionTitle>

          {planned.length === 0 && performed.length === 0 ? (
            <TsText role="body" muted>
              Nessuna seduta prevista e nessuna seduta svolta in questo periodo.
            </TsText>
          ) : (
            <>
              {planned.map((item) => {
                // Corrispondenza fra previsto e svolto: stessa settimana di
                // programma e stesso slot. Non per data, che puo' differire.
                const match = performed.find(
                  (session) =>
                    session.snapshot.weekIndex === item.weekIndex &&
                    session.slot === item.slot,
                );
                return (
                  <View key={`${String(item.weekIndex)}-${item.slot}`} style={{ gap: t.spacing.xs }}>
                    <Divider />
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: t.spacing.sm,
                      }}
                    >
                      <TsText role="body" weight="semibold" style={{ flex: 1 }} numberOfLines={1}>
                        {item.prescription.title}
                      </TsText>
                      <StateBadge state={match === undefined ? 'planned' : badgeOf(match)} />
                    </View>
                    <TsText role="small" muted>
                      Prevista: {formatDateLongIt(item.plannedDate)}
                    </TsText>
                    <TsText role="small" muted>
                      {match?.performedDate === undefined || match.performedDate === null
                        ? 'Svolta: non ancora'
                        : `Svolta: ${formatDateLongIt(match.performedDate)}`}
                    </TsText>
                  </View>
                );
              })}

              {/* Sedute svolte che non corrispondono a nessuna previsione del periodo. */}
              {performed
                .filter(
                  (session) =>
                    !planned.some(
                      (item) =>
                        item.weekIndex === session.snapshot.weekIndex &&
                        item.slot === session.slot,
                    ),
                )
                .map((session) => (
                  <View key={session.id} style={{ gap: t.spacing.xs }}>
                    <Divider />
                    <View
                      style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}
                    >
                      <TsText role="body" weight="semibold" style={{ flex: 1 }} numberOfLines={1}>
                        {session.snapshot.prescription.title}
                      </TsText>
                      <StateBadge state={badgeOf(session)} />
                    </View>
                    <TsText role="small" muted>
                      Prevista: {formatDateLongIt(session.plannedDate)}
                    </TsText>
                    <TsText role="small" muted>
                      Svolta:{' '}
                      {session.performedDate === null
                        ? 'non ancora'
                        : formatDateLongIt(session.performedDate)}
                    </TsText>
                  </View>
                ))}
            </>
          )}
        </Card>

        <Card>
          <TsText role="body" weight="semibold">
            Cardio, camminate e giornate in pista
          </TsText>
          <TsText role="body" muted>
            Non sono ancora leggibili ne&apos; registrabili da questa schermata: le
            tabelle esistono nel database, ma la persistenza non espone ancora le
            funzioni per leggerle e scriverle. Preferisco dirlo che mostrare un
            elenco sempre vuoto.
          </TsText>
        </Card>

        <Card>
          <TsText role="body" weight="semibold">
            Spostare una seduta
          </TsText>
          <TsText role="body" muted>
            Lo spostamento di una singola occorrenza non e&apos; ancora implementato: le
            date previste sono calcolate dal programma e dai giorni proposti nel
            profilo, e cambiarle in modo persistente richiede una funzione che la
            persistenza non espone ancora. I giorni proposti si cambiano dal profilo.
          </TsText>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------

function DayCell({
  date,
  today,
  planned,
  performed,
  compact = false,
}: {
  readonly date: LocalDate | null;
  readonly today: LocalDate;
  readonly planned: number;
  readonly performed: readonly Session[];
  readonly compact?: boolean;
}): React.ReactElement {
  const t = useTheme();
  if (date === null) {
    return <View style={{ flexBasis: '14.28%', height: compact ? 64 : 56 }} />;
  }
  const isToday = date === today;
  const first = performed[0];
  const glyphs = performed.map((session) => {
    if (session.status === 'completed') return '✓';
    if (session.status === 'partial') return '◐';
    if (session.status === 'skipped') return '—';
    return '▶';
  });
  return (
    <View
      accessible
      accessibilityLabel={
        `${formatDateLongIt(date)}. ` +
        (planned > 0 ? `${String(planned)} seduta prevista. ` : '') +
        (first === undefined
          ? 'nessuna seduta svolta.'
          : `svolte: ${performed.length}, stato ${first.status}.`)
      }
      style={{
        flexBasis: '14.28%',
        height: compact ? 64 : 56,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: t.radius.sm,
        borderWidth: isToday ? 2 : 0,
        borderColor: t.colors.accent,
        backgroundColor: planned > 0 ? t.colors.surfaceRaised : 'transparent',
      }}
    >
      <TsText role="small" weight={isToday ? 'bold' : 'regular'}>
        {String(toParts(date).day)}
      </TsText>
      <TsText role="micro" muted={glyphs.length === 0}>
        {glyphs.length === 0 ? (planned > 0 ? '○' : ' ') : glyphs.join('')}
      </TsText>
    </View>
  );
}

function MonthGrid({
  anchor,
  today,
  plannedByDate,
  performedByDate,
}: {
  readonly anchor: LocalDate;
  readonly today: LocalDate;
  readonly plannedByDate: ReadonlyMap<string, readonly PlannedSession[]>;
  readonly performedByDate: ReadonlyMap<string, readonly Session[]>;
}): React.ReactElement {
  const t = useTheme();
  const parts = toParts(anchor);
  const first = fromParts(parts.year, parts.month, 1);
  const total = daysInMonth(parts.year, parts.month);
  const leading = (weekday(first) as number) - 1;

  const cells: (LocalDate | null)[] = [];
  for (let i = 0; i < leading; i += 1) cells.push(null);
  for (let day = 1; day <= total; day += 1) {
    cells.push(fromParts(parts.year, parts.month, day));
  }

  return (
    <Card>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {([1, 2, 3, 4, 5, 6, 7] as readonly IsoWeekday[]).map((day) => (
          <View key={`h-${String(day)}`} style={{ flexBasis: '14.28%', alignItems: 'center' }}>
            <TsText role="micro" muted>
              {WEEKDAY_SHORT[day]}
            </TsText>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: t.spacing.xs }}>
        {cells.map((date, index) => (
          <DayCell
            key={date ?? `empty-${String(index)}`}
            date={date}
            today={today}
            planned={date === null ? 0 : (plannedByDate.get(date)?.length ?? 0)}
            performed={date === null ? [] : (performedByDate.get(date) ?? [])}
          />
        ))}
      </View>
      <TsText role="micro" muted>
        ○ prevista · ✓ completata · ◐ parziale · — saltata · ▶ in corso
      </TsText>
    </Card>
  );
}

function WeekStrip({
  from,
  today,
  plannedByDate,
  performedByDate,
}: {
  readonly from: LocalDate;
  readonly today: LocalDate;
  readonly plannedByDate: ReadonlyMap<string, readonly PlannedSession[]>;
  readonly performedByDate: ReadonlyMap<string, readonly Session[]>;
}): React.ReactElement {
  const t = useTheme();
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  return (
    <Card>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {days.map((date) => (
          <View key={`wh-${date}`} style={{ flexBasis: '14.28%', alignItems: 'center' }}>
            <TsText role="micro" muted>
              {WEEKDAY_SHORT[weekday(date)]}
            </TsText>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: t.spacing.xs }}>
        {days.map((date) => (
          <DayCell
            key={date}
            date={date}
            today={today}
            planned={plannedByDate.get(date)?.length ?? 0}
            performed={performedByDate.get(date) ?? []}
            compact
          />
        ))}
      </View>
      {days.every(
        (date) =>
          (plannedByDate.get(date)?.length ?? 0) === 0 &&
          (performedByDate.get(date)?.length ?? 0) === 0,
      ) && (
        <EmptyState
          title="Settimana libera"
          description="Nessuna seduta prevista e nessuna seduta svolta in questi sette giorni."
        />
      )}
    </Card>
  );
}
