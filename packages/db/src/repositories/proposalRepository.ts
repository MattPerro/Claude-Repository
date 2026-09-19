/**
 * Proposte del coach e decisioni.
 *
 * §9/§10: una proposta e' un OGGETTO DI DATI, non un effetto. Salvarla non
 * modifica il programma. La decisione e' un'altra riga
 * (`proposal_decisions`), cosi' "accettata e poi annullata" resta visibile
 * come due fatti distinti e non come uno stato sovrascritto.
 */

import type {
  CoachProposal,
  Instant,
  LocalDate,
  ProposalChange,
  ProposalDecision,
  ProposalEvidence,
  ProposalSource,
  MissingInformation,
  SessionSlot,
} from '@trackstrong/core';

import { fromSqlBool, sqlBool } from '../driver.js';
import type { Database } from '../database.js';
import { fromJson, toJson } from '../json.js';
import { rowPayload, upsertOperation, withWrite } from '../unitOfWork.js';

interface ProposalRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly source: string;
  readonly created_at: number;
  readonly title: string;
  readonly reason: string;
  readonly change_json: string;
  readonly evidence_json: string;
  readonly missing_information_json: string;
  readonly reevaluate_on: string;
  readonly base_plan_version: number;
  readonly target_week_index: number | null;
  readonly target_slot: string | null;
  readonly decision: string;
  readonly decided_at: number | null;
  readonly decision_note: string | null;
  readonly requires_explicit_confirmation: number;
  readonly revision: number;
  readonly updated_at: number;
  readonly deleted_at: number | null;
}

export interface DecisionRecord {
  readonly id: string;
  readonly proposalId: string;
  readonly decision: ProposalDecision;
  readonly decidedAt: Instant;
  readonly note: string | null;
  readonly applied: boolean;
  readonly appliedAt: Instant | null;
  readonly deviceId: string | null;
}

export interface SaveProposalInput {
  readonly source: ProposalSource;
  readonly createdAt: Instant;
  readonly title: string;
  readonly reason: string;
  readonly change: ProposalChange;
  readonly evidence: readonly ProposalEvidence[];
  readonly missingInformation: readonly MissingInformation[];
  readonly reevaluateOn: LocalDate;
  readonly basePlanVersion: number;
  readonly targetWeekIndex?: number | null;
  readonly targetSlot?: SessionSlot | null;
  readonly requiresExplicitConfirmation: boolean;
  readonly id?: string;
}

export interface ProposalRepository {
  save(input: SaveProposalInput): CoachProposal;
  byId(id: string): CoachProposal | null;
  pending(): readonly CoachProposal[];
  byDecision(decision: ProposalDecision): readonly CoachProposal[];
  /** Registra una decisione: aggiorna la proposta E scrive lo storico. */
  decide(input: {
    readonly proposalId: string;
    readonly decision: ProposalDecision;
    readonly decidedAt: Instant;
    readonly note?: string | null;
    readonly applied?: boolean;
  }): CoachProposal;
  decisions(proposalId: string): readonly DecisionRecord[];
  /**
   * Marca come `superseded` le proposte calcolate su una versione di piano
   * superata: una proposta obsoleta non sovrascrive una revisione piu'
   * recente (§9).
   */
  supersedeOlderThan(planVersion: number, at: Instant): number;
}

export function createProposalRepository(db: Database): ProposalRepository {
  const map = (row: ProposalRow): CoachProposal => ({
    id: row.id,
    workspaceId: row.workspace_id,
    source: row.source as ProposalSource,
    createdAt: row.created_at,
    title: row.title,
    reason: row.reason,
    change: fromJson<ProposalChange>(row.change_json, 'coach_proposals.change_json'),
    evidence: fromJson<ProposalEvidence[]>(row.evidence_json, 'coach_proposals.evidence_json'),
    missingInformation: fromJson<MissingInformation[]>(
      row.missing_information_json,
      'coach_proposals.missing_information_json',
    ),
    reevaluateOn: row.reevaluate_on,
    basePlanVersion: row.base_plan_version,
    targetWeekIndex: row.target_week_index,
    targetSlot: row.target_slot as SessionSlot | null,
    decision: row.decision as ProposalDecision,
    decidedAt: row.decided_at,
    decisionNote: row.decision_note,
    requiresExplicitConfirmation: fromSqlBool(row.requires_explicit_confirmation),
    revision: row.revision,
  });

  const readRow = (id: string): ProposalRow | undefined =>
    db.driver.get<ProposalRow>('SELECT * FROM coach_proposals WHERE id = ?', [id]);

  return {
    save: (input) =>
      withWrite(db, (ctx) => {
        const row = {
          id: input.id ?? db.ids.newId(),
          workspace_id: db.workspaceId,
          source: input.source,
          created_at: input.createdAt,
          title: input.title,
          reason: input.reason,
          change_json: toJson(input.change),
          evidence_json: toJson(input.evidence),
          missing_information_json: toJson(input.missingInformation),
          reevaluate_on: input.reevaluateOn,
          base_plan_version: input.basePlanVersion,
          target_week_index: input.targetWeekIndex ?? null,
          target_slot: input.targetSlot ?? null,
          // Nasce sempre `pending`: salvare una proposta non la applica.
          decision: 'pending',
          decided_at: null,
          decision_note: null,
          requires_explicit_confirmation: sqlBool(input.requiresExplicitConfirmation),
          revision: 1,
          updated_at: ctx.now,
          deleted_at: null,
        };
        ctx.upsert(
          'coach_proposals',
          row,
          upsertOperation(1, null, rowPayload(row), 'nuova proposta'),
        );
        const stored = readRow(row.id);
        if (stored === undefined) throw new Error('Proposta non leggibile dopo il salvataggio.');
        return map(stored);
      }),

    byId: (id) => {
      const row = readRow(id);
      return row === undefined ? null : map(row);
    },

    pending: () =>
      db.driver
        .all<ProposalRow>(
          `SELECT * FROM coach_proposals
            WHERE workspace_id = ? AND decision = 'pending' AND deleted_at IS NULL
            ORDER BY created_at DESC`,
          [db.workspaceId],
        )
        .map(map),

    byDecision: (decision) =>
      db.driver
        .all<ProposalRow>(
          `SELECT * FROM coach_proposals
            WHERE workspace_id = ? AND decision = ? AND deleted_at IS NULL
            ORDER BY created_at DESC`,
          [db.workspaceId, decision],
        )
        .map(map),

    decide: (input) =>
      withWrite(db, (ctx) => {
        const current = readRow(input.proposalId);
        if (current === undefined) {
          throw new Error(`Proposta inesistente: ${input.proposalId}.`);
        }
        const patch = {
          decision: input.decision,
          decided_at: input.decidedAt,
          decision_note: input.note ?? null,
          revision: current.revision + 1,
          updated_at: ctx.now,
        };
        ctx.patch(
          'coach_proposals',
          input.proposalId,
          patch,
          upsertOperation(
            current.revision + 1,
            current.revision,
            { ...patch, id: input.proposalId },
            `decisione: ${input.decision}`,
          ),
        );

        const decisionRow = {
          id: db.ids.newId(),
          proposal_id: input.proposalId,
          decision: input.decision,
          decided_at: input.decidedAt,
          note: input.note ?? null,
          applied: sqlBool(input.applied ?? false),
          applied_at: input.applied === true ? input.decidedAt : null,
          device_id: db.deviceId,
          revision: 1,
          updated_at: ctx.now,
        };
        ctx.upsert(
          'proposal_decisions',
          decisionRow,
          upsertOperation(1, null, rowPayload(decisionRow), 'storico decisioni'),
        );

        const stored = readRow(input.proposalId);
        if (stored === undefined) throw new Error('Proposta non leggibile dopo la decisione.');
        return map(stored);
      }),

    decisions: (proposalId) =>
      db.driver
        .all<{
          id: string;
          proposal_id: string;
          decision: string;
          decided_at: number;
          note: string | null;
          applied: number;
          applied_at: number | null;
          device_id: string | null;
        }>(
          'SELECT * FROM proposal_decisions WHERE proposal_id = ? ORDER BY decided_at ASC, id ASC',
          [proposalId],
        )
        .map((row) => ({
          id: row.id,
          proposalId: row.proposal_id,
          decision: row.decision as ProposalDecision,
          decidedAt: row.decided_at,
          note: row.note,
          applied: fromSqlBool(row.applied),
          appliedAt: row.applied_at,
          deviceId: row.device_id,
        })),

    supersedeOlderThan: (planVersion, at) =>
      withWrite(db, (ctx) => {
        const stale = ctx.all<{ id: string; revision: number }>(
          `SELECT id, revision FROM coach_proposals
            WHERE workspace_id = ? AND decision = 'pending' AND base_plan_version < ?`,
          [db.workspaceId, planVersion],
        );
        for (const proposal of stale) {
          const patch = {
            decision: 'superseded',
            decided_at: at,
            revision: proposal.revision + 1,
            updated_at: ctx.now,
          };
          ctx.patch(
            'coach_proposals',
            proposal.id,
            patch,
            upsertOperation(
              proposal.revision + 1,
              proposal.revision,
              { ...patch, id: proposal.id },
              'proposta superata da una revisione piu\' recente',
            ),
          );
        }
        return stale.length;
      }),
  };
}
