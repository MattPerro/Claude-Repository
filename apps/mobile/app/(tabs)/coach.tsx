/**
 * Coach.
 *
 * Il coach **obbligatorio** e' il motore adattivo locale: deterministico, senza
 * rete, senza modello linguistico. Ogni proposta mostra le cinque cose
 * richieste dalla specifica §5.4:
 *
 *   dati utilizzati · ragione · modifica prevista · informazioni mancanti ·
 *   momento della rivalutazione
 *
 * e offre le cinque azioni: accetta · modifica · rimanda · rifiuta · annulla.
 *
 * Le proposte con `requiresExplicitConfirmation` chiedono una conferma
 * esplicita: cambiano la struttura del programma, e la specifica vieta di
 * applicarle in automatico.
 *
 * Il coach generativo e' **disattivato** e non implementato. Non c'e' nessun
 * pulsante che finge di parlarci: c'e' una frase che dice come stanno le cose.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { SafeAreaView, ScrollView, View } from 'react-native';
import {
  evaluate,
  formatDateLongIt,
  instantToLocalDate,
  formatKgIt,
  formatMinutesIt,
  MISSING_INFO_TEXT,
  PROPOSAL_DECISION_LABEL,
  shortenSession,
  type CoachProposal,
  type EquipmentInstance,
  type ProposalChange,
  type ShortenResult,
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
import { readHistory } from '../../src/lib/history';
import { nextPlannedSession } from '../../src/lib/schedule';
import { ErrorBanner } from '../../src/components/session/ErrorBanner';
import { ChoiceList, Sheet } from '../../src/components/session/Sheet';

export default function CoachScreen(): React.ReactElement {
  const t = useTheme();
  const store = useStore();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<CoachProposal | null>(null);
  const [shortenMinutes, setShortenMinutes] = useState<number | null>(
    store.profile?.availableMinutesPerSession ?? null,
  );
  const [shortened, setShortened] = useState<ShortenResult | null>(null);
  const [decisionSheet, setDecisionSheet] = useState<CoachProposal | null>(null);
  const [decisionChoice, setDecisionChoice] = useState<
    'modified' | 'deferred' | 'rejected' | null
  >(null);

  const pending = useMemo(
    () => store.repos.proposals.pending(),
    [store.repos, store.version],
  );
  const decided = useMemo(
    () => store.repos.proposals.byDecision('accepted'),
    [store.repos, store.version],
  );

  const next = useMemo(() => {
    if (store.plan === null || store.cursor === null) return null;
    return nextPlannedSession(
      store.plan.plan,
      store.cursor,
      store.profile?.preferredWeekdays ?? [],
    );
  }, [store.plan, store.cursor, store.profile]);

  /**
   * Valuta adesso.
   *
   * Il motore non scrive niente da solo: restituisce proposte, che vengono
   * salvate come dati e diventano effetti solo dopo una conferma (§6).
   */
  const runEngine = useCallback(() => {
    setError(null);
    if (store.plan === null || store.cursor === null || store.profile === null) {
      setError(
        'Manca il programma o il profilo: senza di essi il motore non ha dati su cui ' +
          'ragionare e non propone niente.',
      );
      return;
    }
    try {
      const equipment = new Map<string, EquipmentInstance>(
        store.equipment.map((item) => [item.id, item]),
      );
      const result = evaluate({
        now: store.clock.now(),
        today: store.today,
        workspaceId: store.workspaceId,
        plan: store.plan.plan,
        cursor: store.cursor,
        library: store.library,
        equipment,
        history: readHistory(store.repos, 60),
        profile: store.profile,
        // Giornate in pista: la persistenza non espone ancora `track_days`,
        // quindi l'elenco e' vuoto per davvero, non "per comodita'".
        upcomingTrackDays: [],
        newId: () => store.ids.newId(),
      });

      // Le proposte calcolate su una versione di piano superata non devono
      // sovrascrivere una revisione piu' recente (§5.4).
      store.repos.proposals.supersedeOlderThan(store.plan.version, store.clock.now());

      for (const proposal of result.proposals) {
        store.repos.proposals.save({
          id: proposal.id,
          source: proposal.source,
          createdAt: proposal.createdAt,
          title: proposal.title,
          reason: proposal.reason,
          change: proposal.change,
          evidence: proposal.evidence,
          missingInformation: proposal.missingInformation,
          reevaluateOn: proposal.reevaluateOn,
          basePlanVersion: proposal.basePlanVersion,
          targetWeekIndex: proposal.targetWeekIndex,
          targetSlot: proposal.targetSlot,
          requiresExplicitConfirmation: proposal.requiresExplicitConfirmation,
        });
      }
      store.reload();
      if (result.proposals.length === 0) {
        setError(
          'Il motore non ha proposte: con i dati disponibili non c\'e\' nessun ' +
            'cambiamento giustificato. Non e un errore, ed e meglio di una proposta inventata.',
        );
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `Valutazione non completata: ${cause.message}`
          : 'Valutazione non completata per un motivo non identificato.',
      );
    }
  }, [store]);

  const decide = useCallback(
    (proposal: CoachProposal, decision: 'accepted' | 'modified' | 'deferred' | 'rejected' | 'undone') => {
      setError(null);
      try {
        store.repos.proposals.decide({
          proposalId: proposal.id,
          decision,
          decidedAt: store.clock.now(),
          applied: false,
        });
        store.reload();
        setConfirming(null);
        setDecisionSheet(null);
        setDecisionChoice(null);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? `Decisione non registrata: ${cause.message}`
            : 'Decisione non registrata per un motivo non identificato.',
        );
      }
    },
    [store],
  );

  const runShorten = useCallback(() => {
    setError(null);
    if (next === null) {
      setError('Non c\'e\' una prossima seduta da accorciare.');
      return;
    }
    if (shortenMinutes === null || shortenMinutes <= 0) {
      setError('Indica quanti minuti hai davvero a disposizione.');
      return;
    }
    setShortened(shortenSession(next.prescription, store.library, shortenMinutes));
  }, [next, shortenMinutes, store.library]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.background }}>
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

        <Card>
          <SectionTitle hint="Deterministico, offline, senza modello linguistico.">
            Coach adattivo locale
          </SectionTitle>
          <Button
            label="Valuta adesso"
            glyph="◎"
            variant="primary"
            large
            onPress={runEngine}
            accessibilityHint="Ricalcola le proposte sui dati registrati. Non modifica niente da solo."
          />
        </Card>

        {pending.length === 0 ? (
          <EmptyState
            title="Nessuna proposta in attesa"
            description="Il motore propone qualcosa solo quando i dati lo giustificano. Con dati insufficienti non propone aumenti: e una scelta, non una mancanza."
          />
        ) : (
          pending.map((proposal) => (
            <ProposalCard
              key={proposal.id}
              proposal={proposal}
              onAccept={() => {
                if (proposal.requiresExplicitConfirmation) setConfirming(proposal);
                else decide(proposal, 'accepted');
              }}
              onOther={() => {
                setDecisionChoice(null);
                setDecisionSheet(proposal);
              }}
            />
          ))
        )}

        {decided.length > 0 && (
          <Card>
            <SectionTitle hint="Una proposta accettata si puo' ancora annullare.">
              Accettate
            </SectionTitle>
            {decided.map((proposal) => (
              <View key={proposal.id} style={{ gap: t.spacing.xs }}>
                <Divider />
                <TsText role="body" weight="semibold">
                  {proposal.title}
                </TsText>
                <TsText role="small" muted>
                  {proposal.decidedAt === null
                    ? 'decisione senza data registrata'
                    : `decisa il ${formatDateLongIt(
                        instantToLocalDate(proposal.decidedAt, store.timeZone),
                      )}`}{' '}
                  · {PROPOSAL_DECISION_LABEL[proposal.decision]}
                </TsText>
                <Button
                  label="Annulla l'accettazione"
                  glyph="⊘"
                  variant="ghost"
                  onPress={() => {
                    decide(proposal, 'undone');
                  }}
                />
              </View>
            ))}
          </Card>
        )}

        {/* "Oggi ho meno tempo": selezione ragionata, recuperi intatti. */}
        <Card>
          <SectionTitle hint="Riduce il lavoro in un ordine dichiarato. I recuperi non vengono accorciati.">
            Oggi ho meno tempo
          </SectionTitle>
          <NumericField
            label="Minuti disponibili"
            unit="min"
            allowDecimals={false}
            value={shortenMinutes}
            onChangeValue={setShortenMinutes}
          />
          <Button
            label="Calcola la seduta ridotta"
            glyph="⏱"
            variant="secondary"
            onPress={runShorten}
          />
          {shortened !== null && (
            <View style={{ gap: t.spacing.xs }}>
              <Divider />
              <TsText role="body" weight="semibold">
                Da {formatMinutesIt(shortened.originalMinutes)} a{' '}
                {formatMinutesIt(shortened.finalMinutes)}
              </TsText>
              <TsText role="small" muted>
                {shortened.fits
                  ? `Rientra nei ${formatMinutesIt(shortened.availableMinutes)} disponibili.`
                  : `Non rientra nei ${formatMinutesIt(shortened.availableMinutes)} disponibili senza toccare i recuperi, e i recuperi non si toccano.`}
              </TsText>
              {shortened.steps.length === 0 ? (
                <TsText role="small" muted>
                  Nessuna riduzione necessaria.
                </TsText>
              ) : (
                shortened.steps.map((step, index) => (
                  <TsText key={`step-${String(index)}`} role="small">
                    {String(index + 1)}. {step.description} — risparmiati{' '}
                    {formatMinutesIt(step.minutesSaved)}
                  </TsText>
                ))
              )}
              <TsText role="small" weight="semibold">
                I recuperi prescritti non sono stati modificati.
              </TsText>
              <TsText role="small" muted>
                {shortened.explanation}
              </TsText>
              <TsText role="micro" muted>
                Questa e un&apos;anteprima. Per applicarla alla seduta serve avviarla e
                usare i comandi di riduzione in seduta: non cambio la seduta in corso da
                qui (§5.4).
              </TsText>
            </View>
          )}
        </Card>

        {/* Coach generativo: dichiarato non implementato, senza pulsanti inerti. */}
        <Card>
          <TsText role="body" weight="semibold">
            Coach generativo
          </TsText>
          <TsText role="body" muted>
            Disattivato e **non implementato** in questa versione. Non c&apos;e&apos;
            nessun collegamento a un modello linguistico esterno, quindi non trovi un
            pulsante da premere. Quando ci sara&apos;, il flusso obbligatorio restera&apos;
            lo stesso: proposta strutturata, validazione, controllo delle regole,
            anteprima, conferma, applicazione in una transazione. Un modello non scrive
            mai direttamente nel database.
          </TsText>
          <TsText role="small" muted>
            Il coach adattivo locale, che e&apos; quello obbligatorio, funziona
            interamente offline e non ha bisogno di nessun modello.
          </TsText>
        </Card>
      </ScrollView>

      {/* Conferma esplicita per le modifiche strutturali. */}
      <Sheet
        visible={confirming !== null}
        title="Conferma esplicita"
        subtitle="Questa proposta cambia la struttura del programma."
        onClose={() => {
          setConfirming(null);
        }}
      >
        {confirming !== null && (
          <>
            <TsText role="bodyLarge" weight="semibold">
              {confirming.title}
            </TsText>
            <TsText role="body">{confirming.reason}</TsText>
            <TsText role="body" weight="semibold">
              Modifica prevista
            </TsText>
            <TsText role="body">{describeChange(confirming.change)}</TsText>
            <TsText role="small" muted>
              Non viene applicata in automatico e non cambia la seduta in corso.
            </TsText>
            <Button
              label="Confermo la modifica"
              variant="primary"
              large
              onPress={() => {
                decide(confirming, 'accepted');
              }}
            />
          </>
        )}
      </Sheet>

      {/* Modifica / rimanda / rifiuta. */}
      <Sheet
        visible={decisionSheet !== null}
        title="Che cosa vuoi fare"
        onClose={() => {
          setDecisionSheet(null);
        }}
      >
        {decisionSheet !== null && (
          <>
            <TsText role="bodyLarge" weight="semibold">
              {decisionSheet.title}
            </TsText>
            <ChoiceList
              label="Decisione"
              value={decisionChoice}
              options={[
                {
                  value: 'modified',
                  label: 'Accetta con modifiche',
                  hint: 'la decisione resta registrata come "modificata"',
                },
                {
                  value: 'deferred',
                  label: 'Rimanda',
                  hint: `rivalutata il ${formatDateLongIt(decisionSheet.reevaluateOn)}`,
                },
                { value: 'rejected', label: 'Rifiuta', hint: 'non verra riproposta' },
              ]}
              onChange={setDecisionChoice}
            />
            <Button
              label="Registra la decisione"
              variant="primary"
              large
              disabled={decisionChoice === null}
              onPress={() => {
                if (decisionChoice === null) return;
                decide(decisionSheet, decisionChoice);
              }}
            />
            <TsText role="small" muted>
              "Accetta con modifiche" registra la decisione, ma l&apos;applicazione
              effettiva delle modifiche strutturali al piano non e&apos; ancora
              implementata: per ora la proposta resta tracciata e il piano si cambia dai
              comandi in seduta.
            </TsText>
          </>
        )}
      </Sheet>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------

function ProposalCard({
  proposal,
  onAccept,
  onOther,
}: {
  readonly proposal: CoachProposal;
  onAccept(): void;
  onOther(): void;
}): React.ReactElement {
  const t = useTheme();
  return (
    <Card raised>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
        <TsText role="body" weight="bold" color={t.colors.accent}>
          ◎
        </TsText>
        <TsText role="title" weight="semibold" style={{ flex: 1 }}>
          {proposal.title}
        </TsText>
      </View>

      {proposal.requiresExplicitConfirmation && (
        <TsText role="small" color={t.colors.warning} weight="semibold">
          ! Modifica strutturale: richiede una conferma esplicita.
        </TsText>
      )}

      <Divider />
      <Field label="Ragione" value={proposal.reason} />
      <Field label="Modifica prevista" value={describeChange(proposal.change)} />

      <TsText role="small" muted>
        Dati utilizzati
      </TsText>
      {proposal.evidence.length === 0 ? (
        <TsText role="small">Nessun dato citato.</TsText>
      ) : (
        proposal.evidence.map((item, index) => (
          <TsText key={`ev-${String(index)}`} role="small">
            · {item.label}: {item.value}
          </TsText>
        ))
      )}

      <TsText role="small" muted>
        Informazioni mancanti
      </TsText>
      {proposal.missingInformation.length === 0 ? (
        <TsText role="small">Nessuna: i dati necessari ci sono tutti.</TsText>
      ) : (
        proposal.missingInformation.map((item) => (
          <TsText key={item.code} role="small">
            · {MISSING_INFO_TEXT[item.code]}
          </TsText>
        ))
      )}

      <Field
        label="Rivalutazione"
        value={`Se non decidi, viene rivalutata il ${formatDateLongIt(proposal.reevaluateOn)}.`}
      />

      <View style={{ flexDirection: 'row', gap: t.spacing.sm, flexWrap: 'wrap' }}>
        <Button label="Accetta" glyph="✓" variant="primary" onPress={onAccept} />
        <Button label="Modifica, rimanda o rifiuta" variant="ghost" onPress={onOther} />
      </View>
    </Card>
  );
}

function Field({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): React.ReactElement {
  const t = useTheme();
  return (
    <View style={{ gap: t.spacing.xs }}>
      <TsText role="small" muted>
        {label}
      </TsText>
      <TsText role="body">{value}</TsText>
    </View>
  );
}

/** Testo italiano di una modifica proposta. Niente numeri inventati. */
function describeChange(change: ProposalChange): string {
  switch (change.kind) {
    case 'hold':
      return 'Mantieni il carico attuale.';
    case 'increaseLoad':
      return `Aumenta il carico da ${formatKgIt(change.fromKg)} a ${formatKgIt(change.toKg)}, al gradino realmente disponibile sull'attrezzo.`;
    case 'reduceLoadTemporarily':
      return `Riduci temporaneamente da ${formatKgIt(change.fromKg)} a ${formatKgIt(change.toKg)} per ${String(change.forSessions)} sedute.`;
    case 'increaseReps':
      return `Sali dentro l'intervallo: da ${String(change.fromReps)} a ${String(change.toReps)} ripetizioni, prima di toccare il carico.`;
    case 'increaseDuration':
      return `Sali dentro l'intervallo di durata: da ${String(change.fromSeconds)} a ${String(change.toSeconds)} secondi.`;
    case 'repeatWeek':
      return `Ripeti la settimana di programma ${String(change.weekIndex)} invece di avanzare.`;
    case 'changeVolume':
      return `Porta le serie allenanti da ${String(change.fromSets)} a ${String(change.toSets)}.`;
    case 'substituteExercise':
      return `Sostituisci con un'alternativa compatibile, ${change.scope === 'today' ? 'solo per oggi' : 'anche nel programma futuro'}.`;
    case 'changeCardio':
      return change.description;
    case 'reviseBlock':
      return change.description;
    case 'shortenSession':
      return `Seduta ridotta a ${String(change.availableMinutes)} minuti: ${String(change.keepExerciseIds.length)} esercizi conservati, ${String(change.dropExerciseIds.length)} rimossi, recuperi invariati.`;
    default:
      return 'Modifica non descrivibile con questa versione dell\'app.';
  }
}
