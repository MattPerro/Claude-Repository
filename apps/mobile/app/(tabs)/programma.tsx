/**
 * Programma, su tre orizzonti dichiarati per quello che sono:
 *
 *  1. **prossime sedute operative** — prescrizioni concrete, con serie,
 *     ripetizioni e recuperi;
 *  2. **blocchi successivi programmati** — finalita', durata indicativa,
 *     criteri di ingresso e di revisione;
 *  3. **lungo termine** — dichiarato **provvisorio e rivedibile**, con il
 *     `caveat` di ciascun anno preso dal piano e non riscritto qui.
 *
 * Non ci sono carichi futuri in kg: la specifica (§4) vieta di predirli.
 */

import React, { useMemo, useState } from 'react';
import { SafeAreaView, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  blockAtWeek,
  estimateSessionMinutes,
  formatCardioIt,
  formatDateLongIt,
  formatEffortIt,
  formatMinutesIt,
  formatRange,
  formatRestIt,
  PHASE_LABEL,
  type ProgramBlock,
} from '@trackstrong/core';
import {
  Button,
  Card,
  Divider,
  EmptyState,
  SectionTitle,
  TsText,
} from '../../src/components/base';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useStore } from '../../src/store';
import { plannedSessionsForWeek, type PlannedSession } from '../../src/lib/schedule';

const UPCOMING_WEEKS = 3;

export default function ProgramScreen(): React.ReactElement {
  const t = useTheme();
  const router = useRouter();
  const store = useStore();
  const [expandedBlock, setExpandedBlock] = useState<string | null>(null);

  const plan = store.plan;
  const cursor = store.cursor;

  const upcoming = useMemo<readonly PlannedSession[]>(() => {
    if (plan === null || cursor === null) return [];
    const out: PlannedSession[] = [];
    for (let i = 0; i < UPCOMING_WEEKS; i += 1) {
      const index = cursor.weekIndex + i;
      for (const item of plannedSessionsForWeek(
        plan.plan,
        index,
        store.profile?.preferredWeekdays ?? [],
      )) {
        if (i === 0 && cursor.completedSlots.includes(item.slot)) continue;
        out.push(item);
      }
    }
    return out;
  }, [plan, cursor, store.profile]);

  const currentBlock = useMemo<ProgramBlock | undefined>(() => {
    if (plan === null || cursor === null) return undefined;
    return blockAtWeek(plan.plan, cursor.weekIndex);
  }, [plan, cursor]);

  const nextBlocks = useMemo<readonly ProgramBlock[]>(() => {
    if (plan === null || currentBlock === undefined) return [];
    return plan.plan.blocks.filter((block) => block.order > currentBlock.order).slice(0, 4);
  }, [plan, currentBlock]);

  const revisions = useMemo(
    () => store.repos.program.revisionHistory(),
    [store.repos, store.version],
  );

  if (plan === null || cursor === null) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.background }}>
        <View style={{ padding: t.spacing.lg }}>
          <EmptyState
            title="Nessun programma"
            description="Il percorso non e ancora stato creato. Completa la configurazione iniziale."
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.background }}>
      <ScrollView
        contentContainerStyle={{
          padding: t.spacing.lg,
          gap: t.spacing.lg,
          paddingBottom: t.spacing.xxxl,
        }}
      >
        {/* 1. Prossime sedute operative. */}
        <Card>
          <SectionTitle
            hint={`Settimana di programma ${String(cursor.weekIndex)}${
              cursor.repetitionCount > 0
                ? ` · ripetuta ${String(cursor.repetitionCount)} volta/e`
                : ''
            }`}
          >
            Prossime sedute
          </SectionTitle>
          {upcoming.length === 0 ? (
            <TsText role="body" muted>
              Il piano non contiene altre sedute dopo questa settimana.
            </TsText>
          ) : (
            upcoming.map((item) => (
              <View key={`${String(item.weekIndex)}-${item.slot}`} style={{ gap: t.spacing.xs }}>
                <Divider />
                <TsText role="bodyLarge" weight="semibold">
                  {item.prescription.title}
                </TsText>
                <TsText role="small" muted>
                  {item.week.label} · prevista il {formatDateLongIt(item.plannedDate)} ·{' '}
                  {formatMinutesIt(
                    estimateSessionMinutes(item.prescription, store.library),
                  )}{' '}
                  indicativi
                </TsText>
                {item.week.note !== null && (
                  <TsText role="small" muted>
                    Nota della settimana: {item.week.note}
                  </TsText>
                )}
                {item.prescription.exercises.map((ex) => {
                  const exercise = store.library.find(ex.exerciseId);
                  return (
                    <TsText key={`${item.slot}-${String(ex.order)}`} role="small">
                      {String(ex.order)}. {exercise?.shortName ?? ex.exerciseId} ·{' '}
                      {String(ex.workingSets)} × {formatRange(ex.target)}
                      {ex.metric === 'seconds' ? ' s' : ''}
                      {ex.perSide ? ' per lato' : ''} · {formatEffortIt(ex.effort)} ·
                      recupero {formatRestIt(ex.rest)}
                    </TsText>
                  );
                })}
                {item.prescription.cardio.map((cardio, index) => (
                  <TsText key={`${item.slot}-c-${String(index)}`} role="small" muted>
                    Cardio: {formatCardioIt(cardio)}
                  </TsText>
                ))}
              </View>
            ))
          )}
        </Card>

        {/* Blocco corrente: finalita' e criteri. */}
        {currentBlock !== undefined && (
          <Card raised>
            <SectionTitle hint={PHASE_LABEL[currentBlock.phase]}>
              {currentBlock.name}
            </SectionTitle>
            <TsText role="body">{currentBlock.purpose}</TsText>
            <TsText role="small" muted>
              Durata indicativa: {String(currentBlock.plannedWeeks)} settimane · anno{' '}
              {String(currentBlock.yearNumber)}
            </TsText>

            <Divider />
            <TsText role="body" weight="semibold">
              Criteri di ingresso
            </TsText>
            {currentBlock.entryCriteria.length === 0 ? (
              <TsText role="small" muted>
                Nessun criterio automatico: l&apos;ingresso e sempre ammesso.
              </TsText>
            ) : (
              currentBlock.entryCriteria.map((criterion) => (
                <TsText key={criterion.id} role="small">
                  · {criterion.description}
                </TsText>
              ))
            )}

            <Divider />
            <TsText role="body" weight="semibold">
              Criteri di revisione
            </TsText>
            {currentBlock.reviewCriteria.length === 0 ? (
              <TsText role="small" muted>
                Nessun criterio di revisione dichiarato per questo blocco.
              </TsText>
            ) : (
              currentBlock.reviewCriteria.map((criterion) => (
                <TsText key={criterion.id} role="small">
                  · {criterion.description}
                </TsText>
              ))
            )}

            <Divider />
            <TsText role="body" weight="semibold">
              Recupero, mantenimento e interruzioni
            </TsText>
            <TsText role="small">{currentBlock.interruptionPolicy}</TsText>
          </Card>
        )}

        {/* 2. Blocchi successivi. */}
        <Card>
          <SectionTitle hint="Programmati, non garantiti: i criteri di ingresso decidono.">
            Blocchi successivi
          </SectionTitle>
          {nextBlocks.length === 0 ? (
            <TsText role="body" muted>
              Nessun blocco successivo nel piano.
            </TsText>
          ) : (
            nextBlocks.map((block) => (
              <View key={block.id} style={{ gap: t.spacing.xs }}>
                <Divider />
                <TsText role="bodyLarge" weight="semibold">
                  {String(block.order)}. {block.name}
                </TsText>
                <TsText role="small" muted>
                  {PHASE_LABEL[block.phase]} · {String(block.plannedWeeks)} settimane
                  indicative · anno {String(block.yearNumber)}
                </TsText>
                <TsText role="small">{block.purpose}</TsText>
                <Button
                  label={expandedBlock === block.id ? 'Nascondi i criteri' : 'Mostra i criteri'}
                  variant="ghost"
                  onPress={() => {
                    setExpandedBlock((current) => (current === block.id ? null : block.id));
                  }}
                />
                {expandedBlock === block.id && (
                  <View style={{ gap: t.spacing.xs }}>
                    <TsText role="small" weight="semibold">
                      Ingresso
                    </TsText>
                    {block.entryCriteria.map((criterion) => (
                      <TsText key={criterion.id} role="small" muted>
                        · {criterion.description}
                      </TsText>
                    ))}
                    <TsText role="small" weight="semibold">
                      Revisione
                    </TsText>
                    {block.reviewCriteria.map((criterion) => (
                      <TsText key={criterion.id} role="small" muted>
                        · {criterion.description}
                      </TsText>
                    ))}
                    <TsText role="small" weight="semibold">
                      Interruzioni
                    </TsText>
                    <TsText role="small" muted>
                      {block.interruptionPolicy}
                    </TsText>
                  </View>
                )}
              </View>
            ))
          )}
        </Card>

        {/* 3. Lungo termine: provvisorio e rivedibile. */}
        <Card>
          <SectionTitle hint="Provvisorio e rivedibile: e una struttura progettuale, non una previsione.">
            Lungo termine
          </SectionTitle>
          <TsText role="small" muted>
            Piano dal {formatDateLongIt(plan.plan.startDate)} al{' '}
            {formatDateLongIt(plan.plan.lastDate)} · versione {String(plan.version)}
          </TsText>
          {plan.plan.years.map((year) => (
            <View key={String(year.number)} style={{ gap: t.spacing.xs }}>
              <Divider />
              <TsText role="bodyLarge" weight="semibold">
                Anno {String(year.number)} — {year.title}
              </TsText>
              {year.objectives.map((objective, index) => (
                <TsText key={`${String(year.number)}-${String(index)}`} role="small">
                  · {objective}
                </TsText>
              ))}
              <TsText role="small" muted>
                {year.caveat}
              </TsText>
            </View>
          ))}
          <TsText role="small" muted>
            Nessun carico futuro e indicato in kg: i carichi si decidono sui dati
            registrati, non si prevedono.
          </TsText>
        </Card>

        {/* Storia delle revisioni: una revisione non riscrive il passato. */}
        <Card>
          <SectionTitle hint="Ogni revisione crea una versione nuova; le precedenti restano.">
            Revisioni del piano
          </SectionTitle>
          {revisions.map((revision) => (
            <TsText key={String(revision.version)} role="small">
              · versione {String(revision.version)}
              {revision.derivedFromVersion === null
                ? ' (piano iniziale)'
                : ` (da ${String(revision.derivedFromVersion)})`}
              {revision.revisionReason === null ? '' : ` — ${revision.revisionReason}`}
            </TsText>
          ))}
        </Card>

        <Button
          label="Libreria esercizi"
          glyph="▤"
          variant="secondary"
          large
          onPress={() => {
            router.push('/libreria');
          }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
