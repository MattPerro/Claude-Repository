/**
 * Motore adattivo locale.
 *
 * Deterministico, senza rete, senza modello linguistico: date le stesse
 * informazioni in ingresso produce sempre le stesse proposte. E' questa
 * proprieta' che lo rende testabile, e quindi verificabile.
 *
 * Il motore NON scrive niente. Restituisce proposte: oggetti di dati che
 * l'applicazione mostra, e che diventano effetti solo dopo una conferma
 * esplicita (specifica §5.4 e §6).
 */

import type { EquipmentInstance, ExerciseLibrary } from '../domain/exercise.js';
import type { Profile } from '../domain/profile.js';
import type {
  ProgramCursor,
  ProgramPlan,
  ProgramWeek,
} from '../domain/program.js';
import { blockAtWeek, nextSlot, weekAt } from '../domain/program.js';
import type {
  CoachProposal,
  MissingInformation,
  ProposalChange,
  ProposalEvidence,
} from '../domain/proposal.js';
import type { SessionSlot } from '../domain/prescription.js';
import { formatRange } from '../domain/prescription.js';
import type { Instant, LocalDate } from '../time.js';
import { addDays, compareDates, diffDays, formatDateShortIt } from '../time.js';
import { formatKgIt, nextLoadDown } from '../units.js';
import type { EngineConfig } from './config.js';
import { DEFAULT_ENGINE_CONFIG } from './config.js';
import type { Exposure, SessionHistoryEntry } from './exposure.js';
import { extractExposures, groupByComparability, performedValue } from './exposure.js';
import { decideProgression, resolveLoadStep, type ProgressionOutcome } from './progression.js';
import { shortenSession } from './shortenSession.js';

/** Tutto cio' che il motore puo' guardare. Niente arriva da altre fonti. */
export interface EngineContext {
  readonly now: Instant;
  readonly today: LocalDate;
  readonly workspaceId: string;
  readonly plan: ProgramPlan;
  readonly cursor: ProgramCursor;
  readonly library: ExerciseLibrary;
  /** Attrezzature configurate, per ID istanza. */
  readonly equipment: ReadonlyMap<string, EquipmentInstance>;
  /** Storico delle sedute, dalla piu' recente. */
  readonly history: readonly SessionHistoryEntry[];
  readonly profile: Profile;
  /** Giornate in pista pianificate, per il promemoria sul recupero. */
  readonly upcomingTrackDays: readonly LocalDate[];
  readonly config?: EngineConfig;
  /** Genera gli ID delle proposte. Iniettato per rendere i test deterministici. */
  readonly newId: () => string;
}

/** Proposte prodotte da una valutazione, con il contesto usato. */
export interface EngineResult {
  readonly proposals: readonly CoachProposal[];
  /** Esposizioni considerate, per l'ispezione e per i test. */
  readonly exposuresConsidered: number;
  /** Informazioni mancanti che limitano l'intera valutazione. */
  readonly globalMissingInformation: readonly MissingInformation[];
}

function buildProposal(
  ctx: EngineContext,
  config: EngineConfig,
  parts: {
    readonly title: string;
    readonly reason: string;
    readonly change: ProposalChange;
    readonly evidence: readonly ProposalEvidence[];
    readonly missing: readonly MissingInformation[];
    readonly weekIndex: number | null;
    readonly slot: SessionSlot | null;
    readonly requiresExplicitConfirmation: boolean;
  },
): CoachProposal {
  return {
    id: ctx.newId(),
    workspaceId: ctx.workspaceId,
    source: 'adaptiveEngine',
    createdAt: ctx.now,
    title: parts.title,
    reason: parts.reason,
    change: parts.change,
    evidence: parts.evidence,
    missingInformation: parts.missing,
    reevaluateOn: addDays(ctx.today, config.proposalValidityDays),
    basePlanVersion: ctx.plan.version,
    targetWeekIndex: parts.weekIndex,
    targetSlot: parts.slot,
    decision: 'pending',
    decidedAt: null,
    decisionNote: null,
    requiresExplicitConfirmation: parts.requiresExplicitConfirmation,
    revision: 1,
  };
}

/** Prova, in forma leggibile, di una singola esposizione. */
function exposureEvidence(exposure: Exposure, library: ExerciseLibrary): ProposalEvidence {
  const name = library.get(exposure.exerciseId).shortName;
  const values = exposure.completedSets
    .map((s) => performedValue(s))
    .map((v) => (v === null ? '?' : String(v)))
    .join(' + ');
  const unit = exposure.metric === 'seconds' ? 's' : 'rip';
  const load =
    exposure.loadKg === null
      ? exposure.mixedLoads
        ? 'carichi diversi fra le serie'
        : 'senza carico'
      : formatKgIt(exposure.loadKg);
  const rir = exposure.completedSets.map((s) => s.rir).filter((r): r is number => r !== null);
  const rirText = rir.length === exposure.completedSets.length ? `, RIR ${rir.join('/')}` : ', RIR non dichiarato';

  return {
    label: `${name}, seduta del ${formatDateShortIt(exposure.date)}`,
    value: `${values} ${unit} a ${load}${rirText}`,
    sourceSetIds: exposure.completedSets.map((s) => s.id),
    sourceSessionIds: [exposure.sessionId],
  };
}

/** Giorni dall'ultima seduta effettivamente svolta. `null` se non ce ne sono. */
export function daysSinceLastPerformedSession(ctx: EngineContext): number | null {
  const dates = ctx.history
    .map((h) => h.session.performedDate)
    .filter((d): d is LocalDate => d !== null)
    .sort((a, b) => compareDates(b, a));
  const last = dates[0];
  return last === undefined ? null : diffDays(last, ctx.today);
}

/**
 * Valuta il contesto e produce le proposte.
 *
 * Non produce MAI una proposta di incremento quando manca uno dei dati
 * necessari: la logica sta in `progression.ts`, qui si traducono i suoi esiti
 * in proposte con dati, ragione, modifica, informazioni mancanti e momento
 * della rivalutazione.
 */
export function evaluate(ctx: EngineContext): EngineResult {
  const config = ctx.config ?? DEFAULT_ENGINE_CONFIG;
  const proposals: CoachProposal[] = [];
  const globalMissing: MissingInformation[] = [];

  const exposures = extractExposures(ctx.history);
  const groups = groupByComparability(exposures);

  const week = weekAt(ctx.plan, ctx.cursor.weekIndex);
  const block = blockAtWeek(ctx.plan, ctx.cursor.weekIndex);
  const slot = week === undefined ? null : nextSlot(ctx.cursor, week);

  // ---------------------------------------------------------------------
  // Interruzione: una pausa lunga NON fa avanzare la fase.
  //
  // Nota di sicurezza (specifica §5.2): una seduta saltata non dimostra
  // sovrallenamento e non attiva nessuna proposta di riduzione. Qui si guarda
  // solo la CONTINUITA', e la proposta e' di ripetere, non di ridurre.
  // ---------------------------------------------------------------------
  const idleDays = daysSinceLastPerformedSession(ctx);
  if (idleDays !== null && idleDays >= config.interruptionDaysToReentry) {
    proposals.push(
      buildProposal(ctx, config, {
        title: 'Rientro dopo una pausa lunga',
        reason:
          `Sono passati ${String(idleDays)} giorni dall'ultima seduta registrata. ` +
          'La proposta e\' ricominciare dal blocco di rientro, con volumi bassi e margine ampio, ' +
          'invece di riprendere dal punto in cui il programma si era interrotto. ' +
          'Il programma non e\' avanzato durante la pausa: le settimane di programma si contano sulle sedute svolte.',
        change: {
          kind: 'reviseBlock',
          blockId: ctx.plan.blocks[0]?.id ?? '',
          description:
            'Torna al blocco di rientro per 2-4 settimane, poi riprendi il percorso da dove si era interrotto.',
        },
        evidence: [
          {
            label: 'Ultima seduta registrata',
            value: `${String(idleDays)} giorni fa`,
            sourceSetIds: [],
            sourceSessionIds: ctx.history[0] === undefined ? [] : [ctx.history[0].session.id],
          },
        ],
        missing: [],
        weekIndex: ctx.cursor.weekIndex,
        slot: null,
        requiresExplicitConfirmation: true,
      }),
    );
  } else if (idleDays !== null && idleDays >= config.interruptionDaysToRepeatWeek) {
    proposals.push(
      buildProposal(ctx, config, {
        title: 'Ripetere la settimana dopo la pausa',
        reason:
          `Sono passati ${String(idleDays)} giorni dall'ultima seduta registrata. ` +
          'La proposta e\' ripetere questa settimana di programma prima di avanzare. ' +
          'Puoi anche proseguire: la scelta e\' tua.',
        change: { kind: 'repeatWeek', weekIndex: ctx.cursor.weekIndex },
        evidence: [
          {
            label: 'Ultima seduta registrata',
            value: `${String(idleDays)} giorni fa`,
            sourceSetIds: [],
            sourceSessionIds: [],
          },
        ],
        missing: [],
        weekIndex: ctx.cursor.weekIndex,
        slot: null,
        requiresExplicitConfirmation: false,
      }),
    );
  }

  // ---------------------------------------------------------------------
  // Promemoria pista: criterio prudenziale configurabile, non una garanzia.
  // ---------------------------------------------------------------------
  const nextTrackDay = [...ctx.upcomingTrackDays]
    .filter((d) => compareDates(d, ctx.today) >= 0)
    .sort(compareDates)[0];
  if (nextTrackDay !== undefined) {
    const daysToTrack = diffDays(ctx.today, nextTrackDay);
    if (daysToTrack >= 0 && daysToTrack <= 3) {
      proposals.push(
        buildProposal(ctx, config, {
          title: 'Giornata in pista in arrivo',
          reason:
            `Hai una giornata in pista il ${formatDateShortIt(nextTrackDay)}. ` +
            'Il riferimento prudenziale impostato nel piano e\' di lasciare circa 72 ore fra l\'ultima seduta ' +
            'impegnativa e la pista. E\' un criterio configurabile, non una garanzia: decidi tu come organizzarti. ' +
            'Un\'alternativa e\' svolgere la seduta a volume di mantenimento.',
          change: {
            kind: 'changeCardio',
            description:
              'Seduta a volume di mantenimento e cardio facile nei giorni che precedono la pista.',
          },
          evidence: [
            {
              label: 'Prossima giornata in pista',
              value: `fra ${String(daysToTrack)} giorni`,
              sourceSetIds: [],
              sourceSessionIds: [],
            },
          ],
          missing: [],
          weekIndex: ctx.cursor.weekIndex,
          slot,
          requiresExplicitConfirmation: false,
        }),
      );
    }
  }

  // ---------------------------------------------------------------------
  // Progressione per esercizio, gruppo confrontabile per gruppo confrontabile.
  // ---------------------------------------------------------------------
  for (const [, comparable] of groups) {
    const first = comparable[0];
    if (first === undefined) continue;

    const exercise = ctx.library.find(first.exerciseId);
    if (exercise === undefined) {
      // Un esercizio sconosciuto nello storico e' un problema di dati, non una
      // occasione per inventare una proposta.
      continue;
    }
    const equipment =
      first.equipmentInstanceId === null
        ? undefined
        : ctx.equipment.get(first.equipmentInstanceId);

    const outcome = decideProgression(comparable, exercise, equipment, config);
    const proposal = outcomeToProposal(ctx, config, outcome, first, slot);
    if (proposal !== null) proposals.push(proposal);
  }

  // ---------------------------------------------------------------------
  // Criteri di revisione del blocco.
  // ---------------------------------------------------------------------
  if (block !== undefined && week !== undefined) {
    const overrun = countSessionOverruns(ctx);
    const overrunCriterion = block.reviewCriteria.find((c) => c.rule.kind === 'sessionOverrun');
    if (
      overrunCriterion !== undefined &&
      overrunCriterion.rule.kind === 'sessionOverrun' &&
      overrun >= overrunCriterion.rule.occurrences
    ) {
      // La proposta riguarda la PROSSIMA seduta, che non e' necessariamente la
      // A. Prima si usava sempre `week.sessions[0]`, quindi con la seduta B in
      // arrivo la proposta elencava gli esercizi della A: se applicata,
      // avrebbe rimosso esercizi che nella B non esistono.
      const target =
        (slot === null ? undefined : week.sessions.find((sx) => sx.slot === slot)) ??
        week.sessions[0];

      if (target !== undefined) {
        // Il taglio si calcola con `shortenSession()`, che e' la funzione
        // verificata: cosi' `reducedSets` e i minuti risparmiati sono reali
        // invece che vuoti, e i recuperi restano garantiti intatti.
        const shortened = shortenSession(
          target,
          ctx.library,
          ctx.profile.availableMinutesPerSession,
        );

        proposals.push(
          buildProposal(ctx, config, {
            title: `Le sedute stanno durando troppo (${target.title})`,
            reason:
              `${String(overrun)} sedute hanno superato di oltre 10 minuti il tempo che hai dichiarato disponibile. ` +
              `${shortened.explanation} ` +
              'I recuperi restano quelli prescritti: accorciarli cambierebbe lo stimolo.',
            change: {
              kind: 'shortenSession',
              availableMinutes: ctx.profile.availableMinutesPerSession,
              keepExerciseIds: shortened.keptExerciseIds,
              dropExerciseIds: shortened.droppedExerciseIds,
              reducedSets: shortened.session.exercises
                .map((ex) => {
                  const before = target.exercises.find((o) => o.exerciseId === ex.exerciseId);
                  return before === undefined || before.workingSets === ex.workingSets
                    ? null
                    : {
                        exerciseId: ex.exerciseId,
                        fromSets: before.workingSets,
                        toSets: ex.workingSets,
                      };
                })
                .filter(
                  (r): r is { exerciseId: string; fromSets: number; toSets: number } => r !== null,
                ),
            },
            evidence: [
              {
                label: 'Sedute oltre il tempo disponibile',
                value: `${String(overrun)} negli ultimi dati`,
                sourceSetIds: [],
                sourceSessionIds: [],
              },
              {
                label: 'Durata stimata',
                value: `${String(shortened.originalMinutes)} min -> ${String(shortened.finalMinutes)} min`,
                sourceSetIds: [],
                sourceSessionIds: [],
              },
            ],
            missing: [],
            weekIndex: ctx.cursor.weekIndex,
            slot,
            requiresExplicitConfirmation: true,
          }),
        );
      }
    }
  }

  if (exposures.length === 0) {
    globalMissing.push({
      code: 'noComparableHistory',
      description:
        'Non ci sono ancora sedute registrate: il motore non ha dati su cui basare una proposta. ' +
        'Le prime proposte arriveranno dopo due sedute confrontabili.',
    });
  }

  return {
    proposals,
    exposuresConsidered: exposures.length,
    globalMissingInformation: globalMissing,
  };
}

function outcomeToProposal(
  ctx: EngineContext,
  config: EngineConfig,
  outcome: ProgressionOutcome,
  latest: Exposure,
  slot: SessionSlot | null,
): CoachProposal | null {
  const name = ctx.library.get(latest.exerciseId).shortName;
  const evidence = outcome.verdicts
    .slice(0, config.confirmExposures)
    .map((v) => exposureEvidence(v.exposure, ctx.library));

  switch (outcome.kind) {
    case 'increaseLoad':
      return buildProposal(ctx, config, {
        title: `${name}: sali a ${formatKgIt(outcome.toKg)}`,
        reason: outcome.reason,
        change: {
          kind: 'increaseLoad',
          exerciseId: latest.exerciseId,
          fromKg: outcome.fromKg,
          toKg: outcome.toKg,
          equipmentInstanceId: latest.equipmentInstanceId,
        },
        evidence,
        // Propaga l'eventuale avvertenza sul gradino non ancora confermato.
        missing: outcome.missing,
        weekIndex: ctx.cursor.weekIndex,
        slot,
        requiresExplicitConfirmation: false,
      });

    case 'increaseWithinRange':
      return buildProposal(ctx, config, {
        title:
          outcome.metric === 'seconds'
            ? `${name}: prova ${String(outcome.toValue)} secondi`
            : `${name}: prova ${String(outcome.toValue)} ripetizioni`,
        reason: outcome.reason,
        change:
          outcome.metric === 'seconds'
            ? {
                kind: 'increaseDuration',
                exerciseId: latest.exerciseId,
                fromSeconds: outcome.fromValue,
                toSeconds: outcome.toValue,
              }
            : {
                kind: 'increaseReps',
                exerciseId: latest.exerciseId,
                fromReps: outcome.fromValue,
                toReps: outcome.toValue,
              },
        evidence,
        // Le informazioni mancanti della proposta di ripetizioni (tipicamente
        // il margine non dichiarato) vengono mostrate, non nascoste.
        missing: outcome.missing,
        weekIndex: ctx.cursor.weekIndex,
        slot,
        requiresExplicitConfirmation: false,
      });

    case 'discomfort': {
      // Tre strade, in ordine di preferenza. Nessuna di esse inventa un
      // numero: prima `fromKg`/`toKg` erano entrambi `latest.loadKg ?? 0`,
      // quindi la proposta "riduci temporaneamente il carico" proponeva lo
      // STESSO carico, e su un esercizio a tempo proponeva 0 kg - cioe' un
      // carico per un esercizio che non ne ha.
      const alternative = latest.prescription.alternativeExerciseIds[0];
      const change = ((): ProposalChange => {
        if (alternative !== undefined) {
          return {
            kind: 'substituteExercise',
            exerciseId: latest.exerciseId,
            replacementExerciseId: alternative,
            scope: 'today',
          };
        }

        // Riduzione del carico: solo se un carico esiste E se esiste un
        // gradino piu' basso realmente impostabile.
        const currentLoad = latest.loadKg;
        if (currentLoad !== null && !latest.loadNotApplicable) {
          const exercise = ctx.library.find(latest.exerciseId);
          const equipment =
            latest.equipmentInstanceId === null
              ? undefined
              : ctx.equipment.get(latest.equipmentInstanceId);
          if (exercise !== undefined) {
            const { step } = resolveLoadStep(exercise, equipment);
            const reduced = nextLoadDown(currentLoad, step);
            if (reduced !== null && reduced < currentLoad) {
              return {
                kind: 'reduceLoadTemporarily',
                exerciseId: latest.exerciseId,
                fromKg: currentLoad,
                toKg: reduced,
                forSessions: 2,
              };
            }
          }
        }

        // Nessun carico da ridurre (esercizio a tempo, corpo libero, carico
        // gia' al minimo): si riduce il VOLUME, che e' una leva reale.
        const currentSets = latest.prescription.workingSets;
        return {
          kind: 'changeVolume',
          exerciseId: latest.exerciseId,
          fromSets: currentSets,
          toSets: Math.max(1, currentSets - 1),
        };
      })();

      const extra =
        change.kind === 'changeVolume'
          ? " Per questo esercizio non c'e' un carico da ridurre, quindi la proposta e' una serie in meno."
          : '';

      return buildProposal(ctx, config, {
        title: `${name}: fastidio ripetuto`,
        reason: outcome.reason + extra,
        change,
        evidence,
        missing: [],
        weekIndex: ctx.cursor.weekIndex,
        slot,
        requiresExplicitConfirmation: true,
      });
    }

    case 'stalled':
      return buildProposal(ctx, config, {
        title: `${name}: nessun progresso da ${String(outcome.exposuresWithoutProgress)} sedute`,
        reason: outcome.reason,
        change: { kind: 'repeatWeek', weekIndex: ctx.cursor.weekIndex },
        evidence,
        missing: [],
        weekIndex: ctx.cursor.weekIndex,
        slot,
        requiresExplicitConfirmation: true,
      });

    case 'hold':
      // Il mantenimento diventa visibile quando ha qualcosa da dire, non solo
      // quando manca un dato: vedi il commento di `surface` in
      // `progression.ts`. La spiegazione di un blocco per fastidio non ha
      // informazioni mancanti da colmare, ed e' la piu' importante di tutte.
      if (!outcome.surface) return null;
      return buildProposal(ctx, config, {
        title: `${name}: mantieni i valori attuali`,
        reason: outcome.reason,
        change: { kind: 'hold', exerciseId: latest.exerciseId },
        evidence,
        missing: outcome.missing,
        weekIndex: ctx.cursor.weekIndex,
        slot,
        requiresExplicitConfirmation: false,
      });

    default:
      return null;
  }
}

/** Quante sedute hanno superato di oltre 10 minuti il tempo disponibile. */
function countSessionOverruns(ctx: EngineContext): number {
  const limit = ctx.profile.availableMinutesPerSession + 10;
  let count = 0;
  // Lo storico viene ORDINATO invece di assumerlo ordinato: `extractExposures`
  // lo fa, e questa funzione non lo faceva, quindi con un array invertito
  // contava le sedute piu' vecchie.
  const recent = [...ctx.history]
    .filter((h) => h.session.performedDate !== null)
    .sort((a, b) => compareDates(b.session.performedDate ?? '', a.session.performedDate ?? ''))
    .slice(0, 6);
  for (const entry of recent) {
    const { startedAt, endedAt, pausedMs } = entry.session;
    if (startedAt === null || endedAt === null) continue;
    const minutes = Math.round((endedAt - startedAt - pausedMs) / 60_000);
    if (minutes > limit) count += 1;
  }
  return count;
}

/** Testo di riepilogo della settimana, per la schermata Coach. */
export function describeWeek(week: ProgramWeek, plan: ProgramPlan): string {
  const block = blockAtWeek(plan, week.index);
  const parts: string[] = [];
  if (block !== undefined) {
    parts.push(`${block.name}: ${block.purpose}`);
  }
  parts.push(
    `Questa settimana: ${week.sessions
      .map(
        (s) =>
          `${s.title} (${String(s.exercises.length)} esercizi, ${s.exercises
            .map((e) => `${String(e.workingSets)}x${formatRange(e.target)}`)
            .join(', ')})`,
      )
      .join(' e ')}.`,
  );
  if (week.note !== null) parts.push(week.note);
  return parts.join(' ');
}
