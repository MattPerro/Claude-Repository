/**
 * Registrazione della seduta. E' la schermata piu' importante dell'app.
 *
 * ## I sei dati sempre visibili (§9.1)
 *
 * quale esercizio · quale serie · quante ripetizioni o secondi · quale carico
 * l'ultima volta · cosa registrare · quanto recupero rimane.
 *
 * ## L'ordine di "Completa serie" (§10)
 *
 *   validare -> salvare -> confermare -> avviare il recupero
 *
 * In quest'ordine e non in un altro: il feedback aptico e il recupero arrivano
 * **dopo** che la scrittura e' andata a buon fine, cosi' non si festeggia un
 * salvataggio che non c'e' stato. Se la scrittura fallisce, l'errore resta in
 * schermata e i valori restano nei campi.
 *
 * ## Doppio tocco
 *
 * Il pulsante si disabilita durante la scrittura. Anche se una seconda
 * chiamata passasse (rientro in primo piano, ripresa di seduta, riavvio), la
 * chiave `performed_sets.idempotency_key` la renderebbe un no-op:
 * `setRepository` restituisce `inserted: false`, e qui quel caso **non** e' un
 * errore e non viene mostrato come tale.
 *
 * ## Quello che questa schermata NON fa
 *
 * Non attende la rete per salvare. Non completa nessuna serie allo scadere di
 * un timer. Non apre modali fra una serie e l'altra.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import {
  BODY_SIDE_LABEL,
  decideSideRest,
  formatDateShortIt,
  formatKgIt,
  formatRestIt,
  requiresNoLoad,
  TECHNIQUE_LABEL,
  type BodySide,
  type LocalDate,
  type SessionPrescription,
  type TechniqueRating,
} from '@trackstrong/core';
import {
  InvalidSetError,
  type SessionSummary,
  type StoredPerformedSet,
} from '@trackstrong/db';
import {
  Button,
  Card,
  Divider,
  haptics,
  NumericField,
  SectionTitle,
  StateBadge,
  TsText,
} from '../../src/components/base';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useStore } from '../../src/store';
import {
  buildPrefill,
  buildSessionPlan,
  prescribedWorkingSets,
  slotComparabilityKey,
  type ExercisePlanItem,
  type SetSlot,
} from '../../src/lib/sessionModel';
import { substituteInPlan } from '../../src/lib/planEdit';
import { useRestTimer } from '../../src/lib/useRestTimer';
import { formatLoadIt, formatOutOf } from '../../src/lib/format';
import { ErrorBanner } from '../../src/components/session/ErrorBanner';
import { RestTimerPanel } from '../../src/components/session/RestTimerPanel';
import { SetEditor, type SetDraftValues } from '../../src/components/session/SetEditor';
import { ConfirmedSets } from '../../src/components/session/ConfirmedSets';
import { ChoiceList, Sheet } from '../../src/components/session/Sheet';
import { QuickGuide } from '../../src/components/session/ExerciseGuideView';
import { TextField } from '../../src/components/session/TextField';

const KEEP_AWAKE_TAG = 'trackstrong-seduta';

type SheetKind =
  | { readonly kind: 'none' }
  | { readonly kind: 'guide'; readonly exerciseId: string }
  | { readonly kind: 'substitute'; readonly exerciseId: string }
  | { readonly kind: 'equipment'; readonly exerciseId: string }
  | { readonly kind: 'correct'; readonly set: StoredPerformedSet }
  | { readonly kind: 'finish' }
  | { readonly kind: 'technique'; readonly exerciseId: string };

export default function SessionScreen(): React.ReactElement {
  const t = useTheme();
  const router = useRouter();
  const store = useStore();
  const params = useLocalSearchParams<{ readonly id?: string }>();
  const sessionId = params.id ?? '';

  // -------------------------------------------------------------- lettura
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => {
    setRevision((n) => n + 1);
  }, []);

  const session = useMemo(
    () => (sessionId === '' ? null : store.repos.sessions.byId(sessionId)),
    [store.repos, sessionId, revision],
  );
  const performedExercises = useMemo(
    () => (sessionId === '' ? [] : store.repos.sessions.exercises(sessionId)),
    [store.repos, sessionId, revision],
  );
  const recordedSets = useMemo(
    () => (sessionId === '' ? [] : store.repos.sets.bySession(sessionId)),
    [store.repos, sessionId, revision],
  );

  // ------------------------------------------------------- stato di seduta
  const [substitutions, setSubstitutions] = useState<ReadonlyMap<string, string>>(new Map());
  const [equipmentChoice, setEquipmentChoice] = useState<ReadonlyMap<string, string>>(
    new Map(),
  );
  const [extraSets, setExtraSets] = useState<ReadonlyMap<number, number>>(new Map());
  const [displayOrder, setDisplayOrder] = useState<readonly number[] | null>(null);
  const [values, setValues] = useState<SetDraftValues | null>(null);
  const [prefilled, setPrefilled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [sideMessage, setSideMessage] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetKind>({ kind: 'none' });
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [correction, setCorrection] = useState<SetDraftValues | null>(null);
  const [substituteTarget, setSubstituteTarget] = useState<string | null>(null);
  const [substituteScope, setSubstituteScope] = useState<'today' | 'program' | null>(null);

  const prescription: SessionPrescription | null = session?.snapshot.prescription ?? null;

  // ------------------------------------------ schermo acceso, configurabile
  useEffect(() => {
    if (!store.settings.keepScreenAwakeDuringSession) return undefined;
    void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => undefined);
    return () => {
      void deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => undefined);
    };
  }, [store.settings.keepScreenAwakeDuringSession]);

  // --------------------------------------------- ripresa dopo interruzione
  useEffect(() => {
    if (session === null || session.status !== 'paused') return;
    store.repos.sessions.resume(session.id, store.clock.now());
    refresh();
  }, [session, store, refresh]);

  // ------------------------------------------------------ timer di recupero
  const restTimer = useRestTimer({
    repos: store.repos,
    clock: store.clock,
    sessionId,
    newId: () => store.ids.newId(),
    onExpired: useCallback(() => {
      haptics.restFinished(store.settings.hapticsEnabled);
    }, [store.settings.hapticsEnabled]),
  });

  // --------------------------------------------------------- piano di oggi
  const items = useMemo<readonly ExercisePlanItem[]>(() => {
    if (prescription === null) return [];
    const base = buildSessionPlan(prescription, store.library, substitutions);
    if (displayOrder === null) return base;
    const byOrder = new Map(base.map((item) => [item.order, item]));
    const reordered: ExercisePlanItem[] = [];
    for (const order of displayOrder) {
      const item = byOrder.get(order);
      if (item !== undefined) reordered.push(item);
    }
    for (const item of base) {
      if (!displayOrder.includes(item.order)) reordered.push(item);
    }
    return reordered;
  }, [prescription, store.library, substitutions, displayOrder]);

  /** Riga `performed_exercises` di un esercizio, se esiste gia'. */
  const performedIdOf = useCallback(
    (exerciseId: string): string | null =>
      performedExercises.find((row) => row.exerciseId === exerciseId)?.id ?? null,
    [performedExercises],
  );

  /** Caselle nell'ordine di esecuzione, con le serie aggiunte a mano. */
  const slots = useMemo<readonly { readonly item: ExercisePlanItem; readonly slot: SetSlot }[]>(() => {
    const out: { readonly item: ExercisePlanItem; readonly slot: SetSlot }[] = [];
    for (const item of items) {
      for (const slot of item.slots) out.push({ item, slot });
      const extra = extraSets.get(item.order) ?? 0;
      const sides: readonly BodySide[] = item.prescription.perSide
        ? ['left', 'right']
        : ['both'];
      for (let i = 1; i <= extra; i += 1) {
        const order = item.prescription.workingSets + i;
        for (const side of sides) {
          out.push({
            item,
            slot: {
              key: `${String(item.order)}:${String(order)}:${side}`,
              exerciseOrder: item.order,
              exerciseId: item.exerciseId,
              variantId: item.prescription.variantId,
              order,
              role: 'working',
              side,
              metric: item.prescription.metric,
              target: item.prescription.target,
              loadConvention: item.prescription.loadConvention,
              perSide: item.prescription.perSide,
              restSeconds: item.slots[0]?.restSeconds ?? 90,
              restAfterBothSides: item.exercise.restAfterBothSides,
            },
          });
        }
      }
    }
    return out;
  }, [items, extraSets]);

  /** Caselle gia' chiuse (confermate o saltate), per chiave posizione+lato. */
  const closed = useMemo(() => {
    const set = new Set<string>();
    for (const row of recordedSets) {
      if (row.status !== 'completed' && row.status !== 'skipped') continue;
      const exercise = performedExercises.find((pe) => pe.id === row.performedExerciseId);
      if (exercise === undefined) continue;
      set.add(`${exercise.exerciseId}:${String(row.order)}:${row.side}`);
    }
    return set;
  }, [recordedSets, performedExercises]);

  const currentIndex = useMemo(
    () =>
      slots.findIndex(
        ({ slot }) => !closed.has(`${slot.exerciseId}:${String(slot.order)}:${slot.side}`),
      ),
    [slots, closed],
  );
  const current = currentIndex < 0 ? null : (slots[currentIndex] ?? null);

  const currentEquipmentId = useMemo(() => {
    if (current === null) return null;
    return equipmentChoice.get(current.item.exerciseId) ?? null;
  }, [current, equipmentChoice]);

  /** Ultima prestazione confrontabile per la casella corrente. */
  const lastComparable = useMemo<StoredPerformedSet | null>(() => {
    if (current === null) return null;
    const key = slotComparabilityKey(current.slot, currentEquipmentId);
    return store.repos.sets.lastComparable(key, { beforeSessionId: sessionId });
  }, [current, currentEquipmentId, store.repos, sessionId, revision]);

  const describeSource = useCallback(
    (set: StoredPerformedSet): string => {
      const value =
        set.metric === 'reps'
          ? `${String(set.reps ?? 0)} ripetizioni`
          : `${String(set.seconds ?? 0)} secondi`;
      const load = requiresNoLoad(set.load.convention)
        ? ''
        : ` con ${set.load.kg === null ? '—' : formatKgIt(set.load.kg)}`;
      return `Ultima volta: ${value}${load}`;
    },
    [],
  );

  /**
   * Precompilazione e bozza.
   *
   * Prima si guarda se esiste una bozza salvata per questa casella (ripresa
   * dopo un'interruzione), e solo dopo si precompila dall'ultima prestazione
   * comparabile. Una bozza e' piu' recente di uno storico.
   *
   * L'inizializzazione avviene **una volta per casella**: senza il controllo su
   * `initializedSlotRef`, il salvataggio della bozza (che crea la riga
   * dell'esercizio, e quindi cambia le dipendenze) farebbe ripartire l'effetto
   * e riscriverebbe i campi con la bozza di 700 ms prima, cancellando i tasti
   * premuti nel frattempo.
   */
  const slotKey = current === null ? null : current.slot.key;
  const initializedSlotRef = useRef<string | null>(null);
  useEffect(() => {
    if (current === null || slotKey === null) {
      initializedSlotRef.current = null;
      setValues(null);
      return;
    }
    if (initializedSlotRef.current === slotKey) return;
    initializedSlotRef.current = slotKey;
    const performedId = performedIdOf(current.item.exerciseId);
    const draft =
      performedId === null
        ? undefined
        : store.repos.sessions
            .drafts(sessionId)
            .find(
              (d) =>
                d.performedExerciseId === performedId &&
                d.setOrder === current.slot.order &&
                d.side === current.slot.side,
            );

    if (draft !== undefined) {
      setValues({
        loadKg: numberOrNull(draft.fields['loadKg']),
        reps: numberOrNull(draft.fields['reps']),
        seconds: numberOrNull(draft.fields['seconds']),
        rir: numberOrNull(draft.fields['rir']),
      });
      setPrefilled(false);
      return;
    }

    const prefill = buildPrefill(current.slot, lastComparable, describeSource);
    setValues({
      loadKg: prefill.loadKg,
      reps: prefill.reps,
      seconds: prefill.seconds,
      rir: null,
    });
    setPrefilled(true);
    // `slotKey` in dipendenza: cambia solo quando cambia la casella.
  }, [slotKey, current, lastComparable, describeSource, performedIdOf, sessionId, store.repos]);

  // ------------------------------------------------------------- scritture
  /**
   * Crea la riga `performed_exercises` al primo uso.
   *
   * Non alla partenza della seduta: creandole tutte subito, l'ordine
   * registrato sarebbe quello prescritto anche se poi l'esercizio viene
   * spostato. Cosi' invece l'ordine scritto e' quello in cui l'esercizio e'
   * stato davvero affrontato.
   */
  const ensurePerformedExercise = useCallback(
    (item: ExercisePlanItem): string => {
      const existing = performedExercises.find((row) => row.exerciseId === item.exerciseId);
      if (existing !== undefined) return existing.id;
      const position = items.findIndex((i) => i.order === item.order);
      return store.repos.sessions.addExercise({
        sessionId,
        order: position < 0 ? item.order : position + 1,
        exerciseId: item.exerciseId,
        variantId: item.prescription.variantId,
        substitutedForExerciseId: item.substitutedForExerciseId,
        equipmentInstanceId: equipmentChoice.get(item.exerciseId) ?? null,
      });
    },
    [performedExercises, items, store.repos, sessionId, equipmentChoice],
  );

  // --------------------------------------------------- bozza dei campi
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveDraftSoon = useCallback(
    (next: SetDraftValues) => {
      if (current === null) return;
      if (draftTimer.current !== null) clearTimeout(draftTimer.current);
      draftTimer.current = setTimeout(() => {
        try {
          const performedId = ensurePerformedExercise(current.item);
          store.repos.sessions.saveDraft({
            sessionId,
            performedExerciseId: performedId,
            setOrder: current.slot.order,
            side: current.slot.side,
            fields: {
              loadKg: next.loadKg,
              reps: next.reps,
              seconds: next.seconds,
              rir: next.rir,
            },
          });
        } catch {
          // Una bozza non salvata non e' un dato perso: i valori sono ancora
          // nel campo, e la conferma li scrivera' comunque.
        }
      }, 700);
    },
    [current, sessionId, store.repos, ensurePerformedExercise],
  );

  useEffect(
    () => () => {
      if (draftTimer.current !== null) clearTimeout(draftTimer.current);
    },
    [],
  );

  const equipmentMissing =
    current !== null &&
    (current.slot.loadConvention === 'machineStack' ||
      current.slot.loadConvention === 'assisted') &&
    currentEquipmentId === null;

  /** validare -> salvare -> confermare -> avviare recupero. In quest'ordine. */
  const confirmSet = useCallback(
    (status: 'completed' | 'skipped') => {
      if (current === null || values === null || saving) return;
      setSaving(true);
      setSaveError(null);

      // 1. VALIDARE, prima di toccare il database.
      if (status === 'completed') {
        if (equipmentMissing) {
          setSaveError(
            'Scegli la macchina usata: il valore indicato da una macchina non ha ' +
              'significato senza sapere quale macchina e. La serie non e stata registrata.',
          );
          setSaving(false);
          return;
        }
        const needsLoad = !requiresNoLoad(current.slot.loadConvention);
        if (needsLoad && values.loadKg === null) {
          setSaveError(
            'Manca il carico. Un campo vuoto non diventa 0: la serie non e stata registrata.',
          );
          setSaving(false);
          return;
        }
        if (current.slot.metric === 'reps' && values.reps === null) {
          setSaveError('Mancano le ripetizioni: la serie non e stata registrata.');
          setSaving(false);
          return;
        }
        if (current.slot.metric === 'seconds' && values.seconds === null) {
          setSaveError('Mancano i secondi: la serie non e stata registrata.');
          setSaving(false);
          return;
        }
      }

      try {
        // 2. SALVARE.
        const performedExerciseId = ensurePerformedExercise(current.item);
        const noLoad = requiresNoLoad(current.slot.loadConvention);
        const result = store.repos.sets.record({
          sessionId,
          performedExerciseId,
          order: current.slot.order,
          role: 'working',
          exerciseId: current.slot.exerciseId,
          variantId: current.slot.variantId,
          perSide: current.slot.perSide,
          load: {
            convention: current.slot.loadConvention,
            kg: noLoad ? null : values.loadKg,
            equipmentInstanceId: currentEquipmentId,
          },
          metric: current.slot.metric,
          reps: current.slot.metric === 'reps' ? values.reps : null,
          seconds: current.slot.metric === 'seconds' ? values.seconds : null,
          side: current.slot.side,
          rir: current.slot.metric === 'reps' ? values.rir : null,
          note: null,
          status,
          completedAt: status === 'completed' ? store.clock.now() : null,
          prefilled: prefilled && status === 'completed',
        });

        store.repos.sessions.clearDraft(
          sessionId,
          performedExerciseId,
          current.slot.order,
          current.slot.side,
        );

        // `inserted: false` = doppio tocco. Non e' un errore: la serie c'e'
        // gia', ed e' esattamente quella. Si prosegue in silenzio.
        const duplicate = !result.inserted;

        // 3. CONFERMARE.
        if (!duplicate && status === 'completed') {
          haptics.setConfirmed(store.settings.hapticsEnabled);
        }

        // 4. AVVIARE IL RECUPERO, solo per una serie davvero eseguita.
        if (status === 'completed' && !duplicate) {
          const otherSide: BodySide = current.slot.side === 'left' ? 'right' : 'left';
          const otherDone = closed.has(
            `${current.slot.exerciseId}:${String(current.slot.order)}:${otherSide}`,
          );
          const decision = decideSideRest({
            perSide: current.slot.perSide,
            restAfterBothSides: current.slot.restAfterBothSides,
            completedSide: current.slot.side === 'both' ? 'both' : current.slot.side,
            otherSideDone: otherDone,
          });
          setSideMessage(decision.message);
          if (decision.startMainRest) {
            restTimer.start({
              durationSeconds: current.slot.restSeconds,
              performedExerciseId,
              performedSetId: result.set.id,
              note: null,
            });
          }
        }

        refresh();
        store.reload();
      } catch (cause) {
        // NON si finge che sia riuscito: l'errore resta in schermata e i
        // valori restano nei campi.
        if (cause instanceof InvalidSetError) {
          setSaveError(`${cause.message} La serie non e stata registrata.`);
        } else {
          setSaveError(
            cause instanceof Error
              ? `Serie non registrata: ${cause.message}`
              : 'Serie non registrata per un motivo non identificato.',
          );
        }
        haptics.warning(store.settings.hapticsEnabled);
      } finally {
        setSaving(false);
      }
    },
    [
      current,
      values,
      saving,
      equipmentMissing,
      ensurePerformedExercise,
      store,
      sessionId,
      currentEquipmentId,
      prefilled,
      closed,
      restTimer,
      refresh,
    ],
  );

  const applyCorrection = useCallback(
    (set: StoredPerformedSet, next: SetDraftValues, note: string) => {
      setSaveError(null);
      try {
        store.repos.sets.correct(set.id, {
          ...(set.metric === 'reps' && next.reps !== null ? { reps: next.reps } : {}),
          ...(set.metric === 'seconds' && next.seconds !== null
            ? { seconds: next.seconds }
            : {}),
          loadKg: requiresNoLoad(set.load.convention) ? null : next.loadKg,
          rir: next.rir,
          note: note.trim() === '' ? null : note.trim(),
        });
        setSheet({ kind: 'none' });
        refresh();
        store.reload();
      } catch (cause) {
        setSaveError(
          cause instanceof Error
            ? `Correzione non salvata: ${cause.message}`
            : 'Correzione non salvata per un motivo non identificato.',
        );
      }
    },
    [store, refresh],
  );

  const voidSet = useCallback(
    (set: StoredPerformedSet) => {
      setSaveError(null);
      try {
        store.repos.sets.void_(set.id, 'annullata dalla schermata di seduta');
        refresh();
        store.reload();
      } catch (cause) {
        setSaveError(
          cause instanceof Error
            ? `Annullamento non salvato: ${cause.message}`
            : 'Annullamento non salvato per un motivo non identificato.',
        );
      }
    },
    [store, refresh],
  );

  /**
   * Annota com'e' andata la tecnica.
   *
   * ATTENZIONE, limite reale e dichiarato: `sessionRepository.addExercise` e'
   * l'unico modo di scrivere su `performed_exercises` e **azzera sempre** la
   * colonna `technique` (la scrive `null`). Manca quindi un metodo per
   * impostare il campo STRUTTURATO, che e' quello che il motore adattivo legge
   * come presupposto per proporre un incremento (§5.1).
   *
   * Qui si scrive quello che si puo' scrivere davvero: la **nota** della riga.
   * E' un dato vero e persistito, ma il coach non lo usa, e l'interfaccia lo
   * dice invece di far credere il contrario.
   */
  const annotateTechnique = useCallback(
    (exerciseId: string, rating: TechniqueRating) => {
      const item = items.find((i) => i.exerciseId === exerciseId);
      if (item === undefined) return;
      try {
        const performedExerciseId = ensurePerformedExercise(item);
        store.repos.sessions.addExercise({
          id: performedExerciseId,
          sessionId,
          order: items.findIndex((i) => i.order === item.order) + 1,
          exerciseId: item.exerciseId,
          variantId: item.prescription.variantId,
          substitutedForExerciseId: item.substitutedForExerciseId,
          equipmentInstanceId: equipmentChoice.get(item.exerciseId) ?? null,
          note: `tecnica annotata: ${TECHNIQUE_LABEL[rating]}`,
        });
        setSheet({ kind: 'none' });
        refresh();
      } catch (cause) {
        setSaveError(
          cause instanceof Error
            ? `Nota sulla tecnica non salvata: ${cause.message}`
            : 'Nota sulla tecnica non salvata per un motivo non identificato.',
        );
      }
    },
    [items, ensurePerformedExercise, store.repos, sessionId, equipmentChoice, refresh],
  );

  const applySubstitution = useCallback(() => {
    if (sheet.kind !== 'substitute' || substituteTarget === null || substituteScope === null) {
      return;
    }
    setSaveError(null);
    const originalId = sheet.exerciseId;
    try {
      // "Solo oggi": cambia soltanto il piano di questa seduta.
      setSubstitutions((current) => {
        const next = new Map(current);
        next.set(originalId, substituteTarget);
        return next;
      });

      if (substituteScope === 'program') {
        // "Anche nel programma futuro": nuova VERSIONE del piano, dalla
        // settimana corrente in avanti. Il piano precedente resta consultabile.
        const stored = store.repos.program.currentPlan();
        const cursor = store.repos.program.cursor();
        if (stored !== null && cursor !== null) {
          const revised = substituteInPlan(stored.plan, store.library, {
            fromWeekIndex: cursor.weekIndex,
            exerciseId: originalId,
            replacementExerciseId: substituteTarget,
            newVersion: stored.version + 1,
            reason: `Sostituzione decisa in seduta il ${formatDateShortIt(store.today)}.`,
          });
          store.repos.program.savePlan(revised, {
            revisionReason: revised.revisionReason ?? 'sostituzione',
            derivedFromVersion: stored.version,
          });
        }
      }
      setSheet({ kind: 'none' });
      setSubstituteTarget(null);
      setSubstituteScope(null);
      store.reload();
      refresh();
    } catch (cause) {
      setSaveError(
        cause instanceof Error
          ? `Sostituzione non applicata: ${cause.message}`
          : 'Sostituzione non applicata per un motivo non identificato.',
      );
    }
  }, [sheet, substituteTarget, substituteScope, store, refresh]);

  const pauseSession = useCallback(() => {
    if (session === null) return;
    try {
      store.repos.sessions.pause(session.id, store.clock.now());
      store.reload();
      router.back();
    } catch (cause) {
      setSaveError(
        cause instanceof Error
          ? `Pausa non registrata: ${cause.message}`
          : 'Pausa non registrata per un motivo non identificato.',
      );
    }
  }, [session, store, router]);

  const finishSession = useCallback(() => {
    if (session === null) return;
    try {
      const performedDate: LocalDate = store.today;
      const result = store.repos.sessions.finish(
        session.id,
        store.clock.now(),
        performedDate,
      );
      if (result.finalStatus === 'completed') {
        // Il cursore avanza solo su una seduta completata: una seduta saltata
        // non equivale a una completata (§3.11).
        store.repos.program.markSlotCompleted(session.slot);
      }
      setSummary(result);
      setSheet({ kind: 'none' });
      restTimer.dismiss();
      store.reload();
      refresh();
      // Momento di sincronizzazione: fine seduta (§8.4). Non attende.
      store.requestSync('fine-seduta');
    } catch (cause) {
      setSaveError(
        cause instanceof Error
          ? `Chiusura non registrata: ${cause.message}`
          : 'Chiusura non registrata per un motivo non identificato.',
      );
    }
  }, [session, store, restTimer, refresh]);

  // ------------------------------------------------------------- rendering
  if (session === null || prescription === null) {
    return (
      <SafeScreen>
        <Card>
          <TsText role="title" weight="semibold">
            Seduta non trovata
          </TsText>
          <TsText role="body" muted>
            Questa seduta non esiste nell&apos;archivio locale. Non ne apro una vuota.
          </TsText>
          <Button
            label="Torna a Oggi"
            onPress={() => {
              router.replace('/');
            }}
            variant="primary"
          />
        </Card>
      </SafeScreen>
    );
  }

  const totalPrescribed = prescribedWorkingSets(prescription);
  const confirmedWorking = recordedSets.filter(
    (s) => s.role === 'working' && s.status === 'completed',
  );
  const uniqueConfirmed = new Set(
    confirmedWorking.map((s) => `${s.performedExerciseId}:${String(s.order)}`),
  ).size;

  if (summary !== null) {
    return <SessionSummaryView summary={summary} onClose={() => router.replace('/')} />;
  }

  const currentItem = current?.item ?? null;

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
        {/* Intestazione compatta: dove siamo. */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: t.spacing.sm,
          }}
        >
          <TsText role="small" muted numberOfLines={1} style={{ flex: 1 }}>
            {prescription.title} · prevista il {formatDateShortIt(session.plannedDate)}
          </TsText>
          <StateBadge state={session.status === 'active' ? 'active' : 'draft'} />
        </View>
        <TsText role="small" muted>
          Serie allenanti confermate: {formatOutOf(uniqueConfirmed, totalPrescribed)}
        </TsText>

        {/* L'errore di salvataggio resta qui, in schermata. */}
        {saveError !== null && (
          <ErrorBanner
            message={saveError}
            onRetry={() => {
              confirmSet('completed');
            }}
            onDismiss={() => {
              setSaveError(null);
            }}
          />
        )}

        {/* Quanto recupero rimane. */}
        <RestTimerPanel
          timer={restTimer}
          spec={currentItem?.prescription.rest ?? null}
          onDone={restTimer.dismiss}
        />

        {sideMessage !== null && (
          <Card>
            <TsText role="body">{sideMessage}</TsText>
          </Card>
        )}

        {/* La casella corrente, oppure la fine del lavoro previsto. */}
        {current !== null && currentItem !== null && values !== null ? (
          <>
            <SetEditor
              exerciseName={currentItem.exercise.name}
              slot={current.slot}
              setNumber={current.slot.order}
              setTotal={
                currentItem.prescription.workingSets + (extraSets.get(currentItem.order) ?? 0)
              }
              effort={currentItem.prescription.effort}
              values={values}
              prefilled={prefilled}
              lastTimeLabel={lastComparable === null ? null : describeSource(lastComparable)}
              equipmentLabel={
                store.equipment.find((e) => e.id === currentEquipmentId)?.label ?? null
              }
              equipmentMissing={equipmentMissing}
              saving={saving}
              onChange={(patch) => {
                // Una modifica manuale smette di essere una precompilazione:
                // da qui in poi il valore e' scelto, non suggerito (§7).
                const next: SetDraftValues = { ...values, ...patch };
                setValues(next);
                setPrefilled(false);
                saveDraftSoon(next);
              }}
              onConfirm={() => {
                confirmSet('completed');
              }}
              onSkip={() => {
                confirmSet('skipped');
              }}
              onOpenGuide={() => {
                setSheet({ kind: 'guide', exerciseId: currentItem.exerciseId });
              }}
              onChooseEquipment={() => {
                setSheet({ kind: 'equipment', exerciseId: currentItem.exerciseId });
              }}
            />

            {currentItem.prescription.note !== null && (
              <Card>
                <TsText role="small" muted>
                  Nota del programma
                </TsText>
                <TsText role="body">{currentItem.prescription.note}</TsText>
              </Card>
            )}

            {/* Comandi dell'esercizio: nessuno di questi si apre da solo. */}
            <Card>
              <TsText role="small" muted>
                Su questo esercizio
              </TsText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>
                <Button
                  label="Aggiungi una serie"
                  glyph="+"
                  variant="ghost"
                  onPress={() => {
                    setExtraSets((currentMap) => {
                      const next = new Map(currentMap);
                      next.set(currentItem.order, (currentMap.get(currentItem.order) ?? 0) + 1);
                      return next;
                    });
                  }}
                />
                <Button
                  label="Sostituisci"
                  glyph="⇄"
                  variant="ghost"
                  onPress={() => {
                    setSubstituteTarget(null);
                    setSubstituteScope(null);
                    setSheet({ kind: 'substitute', exerciseId: currentItem.exerciseId });
                  }}
                />
                <Button
                  label="Tecnica"
                  glyph="✓"
                  variant="ghost"
                  onPress={() => {
                    setSheet({ kind: 'technique', exerciseId: currentItem.exerciseId });
                  }}
                />
                <Button
                  label="Sposta in fondo"
                  glyph="↓"
                  variant="ghost"
                  disabled={performedIdOf(currentItem.exerciseId) !== null}
                  accessibilityHint={
                    performedIdOf(currentItem.exerciseId) !== null
                      ? 'Non spostabile: questo esercizio ha gia registrazioni in questa seduta.'
                      : 'Sposta questo esercizio dopo gli altri, solo per oggi.'
                  }
                  onPress={() => {
                    setDisplayOrder(() => {
                      const others = items
                        .filter((i) => i.order !== currentItem.order)
                        .map((i) => i.order);
                      return [...others, currentItem.order];
                    });
                  }}
                />
              </View>
              {performedIdOf(currentItem.exerciseId) !== null && (
                <TsText role="micro" muted>
                  L&apos;ordine di questo esercizio e gia stato registrato e non viene
                  riscritto.
                </TsText>
              )}
            </Card>
          </>
        ) : (
          <Card raised>
            <SectionTitle hint="Tutte le serie previste sono state chiuse.">
              Lavoro previsto completato
            </SectionTitle>
            <TsText role="body" muted>
              Restano il cardio, se previsto, e il riepilogo.
            </TsText>
          </Card>
        )}

        {/* Cardio prescritto: il tempo non dimostra l'esecuzione. */}
        {prescription.cardio.length > 0 && (
          <Card>
            <TsText role="small" muted>
              Cardio previsto
            </TsText>
            {prescription.cardio.map((cardio, index) => (
              <TsText key={`cardio-${String(index)}`} role="body">
                · {describeCardio(cardio)}
              </TsText>
            ))}
            <TsText role="micro" muted>
              Il cardio si registra nel riepilogo e richiede la tua conferma: il
              trascorrere del tempo non dimostra che sia stato svolto.
            </TsText>
          </Card>
        )}

        {/* Riscaldamento: descrittivo, non serie allenanti. */}
        {prescription.warmup.length > 0 && (
          <Card>
            <TsText role="small" muted>
              Riscaldamento (non conta come serie allenante)
            </TsText>
            {prescription.warmup.map((item) => (
              <TsText key={`warmup-${String(item.order)}`} role="body">
                {String(item.order)}. {item.label} — {item.detail}
              </TsText>
            ))}
          </Card>
        )}

        {/* Prossimi esercizi, per sapere dove si va. */}
        <Card>
          <TsText role="small" muted>
            Ordine di oggi
          </TsText>
          {items.map((item) => (
            <View
              key={`ord-${String(item.order)}`}
              style={{ flexDirection: 'row', gap: t.spacing.sm, alignItems: 'center' }}
            >
              <TsText
                role="body"
                weight={item.order === currentItem?.order ? 'bold' : 'regular'}
                muted={item.order !== currentItem?.order}
                style={{ flex: 1 }}
                numberOfLines={1}
              >
                {item.exercise.shortName} · {String(item.prescription.workingSets)} ×{' '}
                {item.prescription.target.min === item.prescription.target.max
                  ? String(item.prescription.target.max)
                  : `${String(item.prescription.target.min)}-${String(item.prescription.target.max)}`}
                {item.prescription.perSide ? ' per lato' : ''}
              </TsText>
              <TsText role="micro" muted>
                {formatRestIt(item.prescription.rest)}
              </TsText>
            </View>
          ))}
        </Card>

        {/* Correzione di un completamento accidentale: qui, non nelle impostazioni. */}
        <ConfirmedSets
          sets={recordedSets}
          exerciseNameOf={(performedExerciseId) => {
            const row = performedExercises.find((pe) => pe.id === performedExerciseId);
            if (row === undefined) return 'Esercizio';
            return store.library.find(row.exerciseId)?.name ?? row.exerciseId;
          }}
          onCorrect={(set) => {
            setCorrection({
              loadKg: set.load.kg,
              reps: set.reps,
              seconds: set.seconds,
              rir: set.rir,
            });
            setSheet({ kind: 'correct', set });
          }}
          onVoid={voidSet}
        />

        <View style={{ gap: t.spacing.sm }}>
          <Button
            label="Metti in pausa la seduta"
            glyph="⏸"
            variant="secondary"
            onPress={pauseSession}
            accessibilityHint="La seduta resta aperta e si riprende da Oggi."
          />
          <Button
            label="Termina la seduta"
            glyph="■"
            variant="danger"
            onPress={() => {
              setSheet({ kind: 'finish' });
            }}
            accessibilityHint="Chiude la seduta. Lo stato finale e calcolato sulle serie confermate."
          />
        </View>
      </ScrollView>

      {/* ------------------------------------------------------------ fogli */}

      <Sheet
        visible={sheet.kind === 'guide'}
        title={
          sheet.kind === 'guide'
            ? (store.library.find(sheet.exerciseId)?.name ?? 'Esercizio')
            : ''
        }
        subtitle="Indicazioni rapide. L'approfondimento si apre dalla libreria."
        onClose={() => {
          setSheet({ kind: 'none' });
        }}
      >
        {sheet.kind === 'guide' &&
          (() => {
            const exercise = store.library.find(sheet.exerciseId);
            if (exercise === undefined) {
              return (
                <TsText role="body" muted>
                  Esercizio non in libreria.
                </TsText>
              );
            }
            return (
              <>
                <QuickGuide exercise={exercise} />
                <Button
                  label="Guida completa"
                  variant="ghost"
                  onPress={() => {
                    setSheet({ kind: 'none' });
                    router.push(`/esercizio/${exercise.id}`);
                  }}
                />
              </>
            );
          })()}
      </Sheet>

      <Sheet
        visible={sheet.kind === 'equipment'}
        title="Quale macchina"
        subtitle="Il valore indicato da una macchina ha senso solo insieme alla macchina."
        onClose={() => {
          setSheet({ kind: 'none' });
        }}
      >
        {store.equipment.length === 0 ? (
          <>
            <TsText role="body">
              Non hai ancora configurato nessun attrezzo. Senza l&apos;identita&apos; della
              macchina il carico non e confrontabile, quindi la serie non verra
              registrata.
            </TsText>
            <Button
              label="Apri le impostazioni delle attrezzature"
              variant="primary"
              onPress={() => {
                setSheet({ kind: 'none' });
                router.push('/impostazioni');
              }}
            />
          </>
        ) : (
          <ChoiceList
            label="Attrezzo usato"
            value={currentEquipmentId}
            options={store.equipment.map((e) => ({
              value: e.id,
              label: e.label,
              hint:
                e.loadStep.stepKg > 0
                  ? `incremento ${formatKgIt(e.loadStep.stepKg)}`
                  : 'incremento non configurato',
            }))}
            onChange={(id) => {
              if (sheet.kind !== 'equipment') return;
              const exerciseId = sheet.exerciseId;
              setEquipmentChoice((currentMap) => {
                const next = new Map(currentMap);
                next.set(exerciseId, id);
                return next;
              });
              setSheet({ kind: 'none' });
            }}
          />
        )}
      </Sheet>

      <Sheet
        visible={sheet.kind === 'substitute'}
        title="Sostituisci l'esercizio"
        subtitle="Gli storici dei due esercizi restano distinti."
        onClose={() => {
          setSheet({ kind: 'none' });
        }}
      >
        {sheet.kind === 'substitute' &&
          (() => {
            const item = items.find((i) => i.exerciseId === sheet.exerciseId);
            const candidates = new Set<string>([
              ...(item?.prescription.alternativeExerciseIds ?? []),
              ...(item?.exercise.compatibleAlternativeIds ?? []),
            ]);
            const options = [...candidates]
              .map((id) => store.library.find(id))
              .filter((ex): ex is NonNullable<typeof ex> => ex !== undefined)
              .map((ex) => ({ value: ex.id, label: ex.name }));

            if (options.length === 0) {
              return (
                <TsText role="body">
                  Per questo esercizio la libreria non indica alternative compatibili. Non
                  ne propongo una a caso.
                </TsText>
              );
            }
            return (
              <>
                <ChoiceList
                  label="Con quale esercizio"
                  value={substituteTarget}
                  options={options}
                  onChange={setSubstituteTarget}
                />
                <Divider />
                <ChoiceList
                  label="Per quanto"
                  value={substituteScope}
                  options={[
                    {
                      value: 'today',
                      label: 'Solo oggi',
                      hint: 'il programma non cambia',
                    },
                    {
                      value: 'program',
                      label: 'Anche nel programma futuro',
                      hint: 'crea una nuova versione del piano',
                    },
                  ]}
                  onChange={setSubstituteScope}
                />
                <Button
                  label="Applica la sostituzione"
                  variant="primary"
                  large
                  disabled={substituteTarget === null || substituteScope === null}
                  onPress={applySubstitution}
                />
                {substituteScope === 'program' && (
                  <TsText role="small" muted>
                    La sostituzione vale dalla settimana di programma corrente in avanti.
                    Le settimane gia&apos; svolte non vengono riscritte e il piano
                    precedente resta consultabile.
                  </TsText>
                )}
              </>
            );
          })()}
      </Sheet>

      <Sheet
        visible={sheet.kind === 'technique'}
        title="Com'e andata la tecnica"
        onClose={() => {
          setSheet({ kind: 'none' });
        }}
      >
        {sheet.kind === 'technique' && (
          <>
            <ChoiceList
              label="Su questo esercizio"
              value={null}
              options={[
                { value: 'controlled', label: TECHNIQUE_LABEL.controlled },
                { value: 'uncertain', label: TECHNIQUE_LABEL.uncertain },
                { value: 'broke', label: TECHNIQUE_LABEL.broke },
              ]}
              onChange={(rating: TechniqueRating) => {
                if (sheet.kind !== 'technique') return;
                annotateTechnique(sheet.exerciseId, rating);
              }}
            />
            <TsText role="small" muted>
              Viene salvata come nota dell&apos;esercizio. Il campo strutturato della
              tecnica non e ancora scrivibile in questa versione (manca il metodo
              corrispondente nella persistenza), quindi il coach non lo usa ancora per
              proporre aumenti di carico.
            </TsText>
          </>
        )}
      </Sheet>

      <Sheet
        visible={sheet.kind === 'correct'}
        title="Correggi la serie"
        subtitle="La correzione sostituisce i valori registrati e resta tracciata."
        onClose={() => {
          setSheet({ kind: 'none' });
        }}
      >
        {sheet.kind === 'correct' && correction !== null && (
          <CorrectionForm
            set={sheet.set}
            values={correction}
            onChange={(patch) => {
              setCorrection((previous) => ({ ...(previous ?? correction), ...patch }));
            }}
            onSubmit={(note) => {
              applyCorrection(sheet.set, correction, note);
            }}
          />
        )}
      </Sheet>

      <Sheet
        visible={sheet.kind === 'finish'}
        title="Termina la seduta"
        subtitle="Lo stato finale e calcolato sulle serie confermate, non sul pulsante."
        onClose={() => {
          setSheet({ kind: 'none' });
        }}
      >
        <TsText role="body">
          Serie allenanti confermate: {formatOutOf(uniqueConfirmed, totalPrescribed)}.
          {uniqueConfirmed < totalPrescribed
            ? " La seduta risultera' parziale, e le sedute parziali sono contate a parte."
            : ' Tutte le serie previste sono confermate.'}
        </TsText>
        <TsText role="small" muted>
          Nota: il campo "nota della seduta" non e ancora salvabile in questa versione
          (manca il metodo corrispondente nella persistenza). Non lo mostro come campo
          vuoto per non far credere che venga conservato.
        </TsText>
        <Button label="Chiudi la seduta" variant="danger" large onPress={finishSession} />
      </Sheet>
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------

function numberOrNull(value: string | number | boolean | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function describeCardio(cardio: SessionPrescription['cardio'][number]): string {
  if (cardio.kind === 'steady') {
    return `${String(cardio.minutes.min)}-${String(cardio.minutes.max)} minuti, ${cardio.intensityCue}`;
  }
  return (
    `${String(cardio.warmupMinutes)} min facili, ` +
    `${String(cardio.rounds)} cicli di ${String(cardio.hardSeconds)} s sostenuti e ` +
    `${String(cardio.easySeconds)} s facili, ${String(cardio.cooldownMinutes)} min facili` +
    (cardio.optIn ? ' — alternativa facoltativa, da scegliere espressamente' : '')
  );
}

function CorrectionForm({
  set,
  values,
  onChange,
  onSubmit,
}: {
  readonly set: StoredPerformedSet;
  readonly values: SetDraftValues;
  onChange(patch: Partial<SetDraftValues>): void;
  onSubmit(note: string): void;
}): React.ReactElement {
  const [note, setNote] = useState(set.note ?? '');
  const noLoad = requiresNoLoad(set.load.convention);
  return (
    <>
      <TsText role="small" muted>
        Serie {String(set.order)}
        {set.side === 'both' ? '' : ` · ${BODY_SIDE_LABEL[set.side]}`} ·{' '}
        {formatLoadIt(set.load.kg, set.load.convention)}
      </TsText>
      {!noLoad && (
        <NumericField
          label="Carico"
          unit="kg"
          value={values.loadKg}
          onChangeValue={(loadKg) => {
            onChange({ loadKg });
          }}
        />
      )}
      {set.metric === 'reps' ? (
        <NumericField
          label="Ripetizioni"
          allowDecimals={false}
          value={values.reps}
          onChangeValue={(reps) => {
            onChange({ reps });
          }}
        />
      ) : (
        <NumericField
          label="Secondi"
          unit="s"
          allowDecimals={false}
          value={values.seconds}
          onChangeValue={(seconds) => {
            onChange({ seconds });
          }}
        />
      )}
      <NumericField
        label="Ripetizioni in riserva (facoltativo)"
        allowDecimals={false}
        value={values.rir}
        onChangeValue={(rir) => {
          onChange({ rir });
        }}
      />
      <TextField label="Nota" value={note} onChangeText={setNote} multiline />
      <Button
        label="Salva la correzione"
        variant="primary"
        large
        onPress={() => {
          onSubmit(note);
        }}
      />
    </>
  );
}

function SessionSummaryView({
  summary,
  onClose,
}: {
  readonly summary: SessionSummary;
  onClose: () => void;
}): React.ReactElement {
  const t = useTheme();
  return (
    <SafeScreen>
      <Card raised>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
          <StateBadge state={summary.finalStatus === 'completed' ? 'completed' : 'partial'} />
          <TsText role="title" weight="semibold">
            Seduta chiusa
          </TsText>
        </View>
        <TsText role="small" muted>
          Lo stato e calcolato sulle serie confermate.
        </TsText>
        <Divider />
        <SummaryRow label="Serie allenanti confermate" value={formatOutOf(summary.workingCompleted, summary.workingPrescribed)} />
        <SummaryRow label="Serie di riscaldamento registrate" value={String(summary.warmupCompleted)} />
        <SummaryRow label="Saltate" value={String(summary.skipped)} />
        <SummaryRow label="Annullate" value={String(summary.voided)} />
        <SummaryRow
          label="Bozze non registrate"
          value={String(summary.drafts)}
        />
        <TsText role="micro" muted>
          Le bozze sono campi compilati e non confermati: non sono serie eseguite.
        </TsText>
        <Button label="Torna a Oggi" variant="primary" large onPress={onClose} />
      </Card>
    </SafeScreen>
  );
}

function SummaryRow({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): React.ReactElement {
  const t = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: t.spacing.sm,
      }}
    >
      <TsText role="body" muted style={{ flex: 1 }}>
        {label}
      </TsText>
      <TsText role="body" weight="semibold">
        {value}
      </TsText>
    </View>
  );
}

function SafeScreen({ children }: { readonly children: React.ReactNode }): React.ReactElement {
  const t = useTheme();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.colors.background }}
      contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.lg }}
    >
      {children}
    </ScrollView>
  );
}
