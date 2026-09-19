/**
 * Guida di un esercizio.
 *
 * Due livelli, come chiede la specifica §12:
 *
 *  - `QuickGuide`: le indicazioni rapide, disponibili **in seduta** senza
 *    uscire dalla schermata e senza rallentare la registrazione;
 *  - `FullGuide`: l'approfondimento, che si apre **su richiesta** e mostra
 *    tutti i campi di `ExerciseGuide`.
 *
 * Solo testo: nessun video, nessun collegamento, nessuna illustrazione
 * inventata. Il contenuto e' quello della libreria offline in
 * `@trackstrong/core` e non viene riassunto ne' riscritto qui.
 */

import React from 'react';
import { View } from 'react-native';
import {
  EQUIPMENT_LABEL,
  MOVEMENT_PATTERN_LABEL,
  LOAD_CONVENTION_LABEL,
  formatKgIt,
  type Exercise,
} from '@trackstrong/core';
import { Card, Divider, SectionTitle, TsText } from '../base';
import { useTheme } from '../../theme/ThemeProvider';

function Bullets({
  title,
  items,
  numbered = false,
}: {
  readonly title: string;
  readonly items: readonly string[];
  readonly numbered?: boolean;
}): React.ReactElement | null {
  const t = useTheme();
  if (items.length === 0) return null;
  return (
    <View style={{ gap: t.spacing.xs }}>
      <TsText role="body" weight="semibold">
        {title}
      </TsText>
      {items.map((item, index) => (
        <View key={`${title}-${String(index)}`} style={{ flexDirection: 'row', gap: t.spacing.sm }}>
          <TsText role="body" muted>
            {numbered ? `${String(index + 1)}.` : '·'}
          </TsText>
          <TsText role="body" style={{ flex: 1 }}>
            {item}
          </TsText>
        </View>
      ))}
    </View>
  );
}

/** Indicazioni rapide: quello che serve mentre si e' sotto il bilanciere. */
export function QuickGuide({ exercise }: { readonly exercise: Exercise }): React.ReactElement {
  const t = useTheme();
  return (
    <View style={{ gap: t.spacing.md }}>
      <Bullets title="Indicazioni rapide" items={exercise.guide.quickCues} />
      <Bullets title="Attenzione al rientro" items={exercise.guide.returningNotes} />
      <TsText role="small" muted>
        Respirazione: {exercise.guide.breathing}
      </TsText>
    </View>
  );
}

/** Guida completa: tutti i campi di `ExerciseGuide`. */
export function FullGuide({ exercise }: { readonly exercise: Exercise }): React.ReactElement {
  const t = useTheme();
  const step = exercise.defaultLoadStep;
  return (
    <View style={{ gap: t.spacing.xl }}>
      <Card>
        <SectionTitle hint={MOVEMENT_PATTERN_LABEL[exercise.pattern]}>
          {exercise.name}
        </SectionTitle>
        <TsText role="small" muted>
          Attrezzatura: {exercise.equipment.map((kind) => EQUIPMENT_LABEL[kind]).join(', ')}
        </TsText>
        <TsText role="small" muted>
          Convenzione di carico: {LOAD_CONVENTION_LABEL[exercise.loadConvention]}
        </TsText>
        <TsText role="small" muted>
          Misura: {exercise.metric === 'reps' ? 'ripetizioni' : 'secondi'}
          {exercise.perSide ? ' · un lato per volta' : ''}
          {exercise.restAfterBothSides ? ' · recupero dopo entrambi i lati' : ''}
        </TsText>
        <TsText role="small" muted>
          Incremento suggerito dall&apos;attrezzo:{' '}
          {step.stepKg > 0 ? formatKgIt(step.stepKg) : 'non noto'}
          {step.note === null ? '' : ` — ${step.note}`}
        </TsText>
        <TsText role="small" muted>
          L&apos;incremento realmente disponibile si configura per attrezzo nelle
          impostazioni, e vince su questo.
        </TsText>
      </Card>

      <Card>
        <Bullets title="Muscoli principalmente coinvolti" items={exercise.guide.primaryMuscles} />
        <Bullets title="Coinvolti in secondo piano" items={exercise.guide.secondaryMuscles} />
      </Card>

      <Card>
        <Bullets title="Impostazione" items={exercise.guide.setup} numbered />
        <Divider />
        <Bullets title="Esecuzione" items={exercise.guide.execution} numbered />
        <Divider />
        <TsText role="body" weight="semibold">
          Respirazione
        </TsText>
        <TsText role="body">{exercise.guide.breathing}</TsText>
      </Card>

      <Card>
        <Bullets title="Indicazioni rapide" items={exercise.guide.quickCues} />
        <Bullets title="Errori comuni" items={exercise.guide.commonMistakes} />
        <Bullets title="Accorgimenti per il rientro" items={exercise.guide.returningNotes} />
      </Card>

      <Card>
        <Bullets title="Varianti" items={exercise.guide.variantNotes} />
        <Bullets
          title="Regolazioni personali da annotare"
          items={exercise.guide.personalSettingsToRecord}
        />
        {exercise.variants.length > 0 && (
          <Bullets
            title="Varianti in libreria"
            items={exercise.variants.map(
              (variant) =>
                `${variant.name}: ${variant.description}` +
                (variant.separateHistory ? ' (storico separato)' : ''),
            )}
          />
        )}
      </Card>

      <Card>
        <TsText role="body" weight="semibold">
          A che cosa serve per la moto
        </TsText>
        <TsText role="body">{exercise.guide.motorcyclePurpose}</TsText>
        <TsText role="small" muted>
          E&apos; la finalita&apos; della preparazione generale, non una garanzia di
          miglioramento sul giro.
        </TsText>
      </Card>
    </View>
  );
}
