import { withTransaction, query } from '../database/db.js';
import { CreditLedgerService } from './creditLedgerService.js';
import { PROJECT_STATUSES, ROLES } from '../config/constants.js';
import { AuditLogger } from '../utils/auditLogger.js';

export interface ProjectSubmissionInput {
  title: string;
  category: string;
  description: string;
  budgetMin: number;
  budgetMax: number;
  timeline: string;
  requirements: string[];
  requiredTechnologies: string[];
}

export interface ProposalInput {
  approach: string;
  timeline: string;
  price: number;
  milestones?: Array<{ title: string; duration: string; priceShare: number }>;
  technologies?: string[];
  additionalNotes?: string;
}

export class ProjectService {
  /**
   * Client submits a new project, entering the PENDING / SUBMITTED state for admin review
   */
  static async submitProject(
    clientId: string,
    userId: string,
    data: ProjectSubmissionInput
  ): Promise<{ projectId: string; projectNumber: string }> {
    return withTransaction(async (client) => {
      // Generate clean slug & unique project number
      const seqRes = await client.query(
        `SELECT COALESCE(MAX(SUBSTRING(project_number FROM 10)::int), 0) + 1 as next_seq 
         FROM projects WHERE project_number ~ '^PRJ-2026-[0-9]+$'`
      );
      const seq = seqRes.rows[0]?.next_seq || Math.floor(1000 + Math.random() * 9000);
      const projectNumber = `PRJ-2026-${String(seq).padStart(4, '0')}`;
      const slug = `${data.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${seq}`;

      const insertRes = await client.query(
        `INSERT INTO projects (
            project_number, slug, title, description, category,
            budget_min, budget_max, timeline, requirements, required_technologies,
            status, claim_cost, max_claims, claim_deadline, client_id
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'SUBMITTED', 1, 5, NOW() + INTERVAL '7 days', $11)
         RETURNING id, project_number`,
        [
          projectNumber,
          slug,
          data.title,
          data.description,
          data.category,
          data.budgetMin,
          data.budgetMax,
          data.timeline,
          JSON.stringify(data.requirements || []),
          JSON.stringify(data.requiredTechnologies || []),
          clientId,
        ]
      );

      const newProject = insertRes.rows[0];

      // Audit Log
      await AuditLogger.log({
        actorUserId: userId,
        action: 'PROJECT_SUBMITTED',
        entityType: 'PROJECT',
        entityId: newProject.id,
        metadata: { projectNumber, title: data.title },
      });

      return {
        projectId: newProject.id,
        projectNumber: newProject.project_number,
      };
    });
  }

  /**
   * Admin approves submitted project and opens it for marketplace developer claims
   */
  static async approveProject(
    projectId: string,
    adminUserId: string,
    maxClaims = 5,
    deadlineDays = 7
  ): Promise<void> {
    await withTransaction(async (client) => {
      const projRes = await client.query('SELECT id, status, title FROM projects WHERE id = $1', [projectId]);
      if (projRes.rows.length === 0) {
        throw new Error('Project not found');
      }

      await client.query(
        `UPDATE projects
         SET status = 'OPEN_FOR_CLAIMS',
             max_claims = $1,
             claim_deadline = NOW() + INTERVAL '${Math.max(1, deadlineDays)} days',
             updated_at = NOW()
         WHERE id = $2`,
        [maxClaims, projectId]
      );

      await AuditLogger.log({
        actorUserId: adminUserId,
        action: 'PROJECT_APPROVED_FOR_CLAIMS',
        entityType: 'PROJECT',
        entityId: projectId,
        metadata: { maxClaims, deadlineDays },
      });
    });
  }

  /**
   * Executes atomic project claim with slot limit checks and anonymous conversation creation
   */
  static async claimProject(
    projectId: string,
    developerId: string,
    userId: string
  ): Promise<{ claimId: string; anonymousTag: string; remainingCredits: number; conversationId: string }> {
    return withTransaction(async (client) => {
      // 1. Fetch project with row lock
      const projectRes = await client.query(
        `SELECT id, status, claim_cost, max_claims, claim_deadline, client_id
         FROM projects WHERE id = $1 FOR UPDATE`,
        [projectId]
      );

      if (projectRes.rows.length === 0) {
        throw new Error('Project not found');
      }

      const project = projectRes.rows[0];

      // 2. Verify developer is verified
      const devRes = await client.query(
        `SELECT verification_status FROM developers WHERE id = $1`,
        [developerId]
      );
      if (devRes.rows.length === 0 || devRes.rows[0].verification_status !== 'VERIFIED') {
        throw new Error('Forbidden: Only verified developers can claim project slots.');
      }

      // 3. Verify project status
      if (project.status !== PROJECT_STATUSES.OPEN_FOR_CLAIMS && project.status !== PROJECT_STATUSES.CLAIMS_ACTIVE) {
        throw new Error(`Project is not open for claims. Current status: ${project.status}`);
      }

      // 3. Verify deadline
      if (project.claim_deadline && new Date(project.claim_deadline) < new Date()) {
        throw new Error('Claim deadline has passed for this project');
      }

      // 4. Verify existing claim
      const existingClaim = await client.query(
        `SELECT id FROM project_claims WHERE project_id = $1 AND developer_id = $2`,
        [projectId, developerId]
      );
      if (existingClaim.rows.length > 0) {
        throw new Error('You have already claimed a slot for this project');
      }

      // 5. Verify max claims
      const countRes = await client.query(
        `SELECT COUNT(*) FROM project_claims WHERE project_id = $1`,
        [projectId]
      );
      const currentClaimsCount = parseInt(countRes.rows[0].count, 10);

      if (currentClaimsCount >= project.max_claims) {
        throw new Error(`Maximum claim slots (${project.max_claims}) already reached`);
      }

      // 6. Deduct credit from ledger
      const ledgerResult = await CreditLedgerService.deductClaimCredit(
        developerId,
        projectId,
        project.claim_cost,
        client
      );

      // 7. Assign anonymous developer tag (e.g. Developer #01, #02)
      const anonymousTag = `Developer #${String(currentClaimsCount + 1).padStart(2, '0')}`;

      // 8. Create project claim
      const claimRes = await client.query(
        `INSERT INTO project_claims (project_id, developer_id, credit_transaction_id, status, anonymous_tag)
         VALUES ($1, $2, $3, 'CLAIMED', $4)
         RETURNING id`,
        [projectId, developerId, ledgerResult.transactionId, anonymousTag]
      );
      const claimId = claimRes.rows[0].id;

      // 9. Update project state if full
      if (currentClaimsCount + 1 >= project.max_claims) {
        await client.query(
          `UPDATE projects SET status = $1, updated_at = NOW() WHERE id = $2`,
          [PROJECT_STATUSES.SELECTION_PENDING, projectId]
        );
      } else {
        await client.query(
          `UPDATE projects SET status = $1, updated_at = NOW() WHERE id = $2`,
          [PROJECT_STATUSES.CLAIMS_ACTIVE, projectId]
        );
      }

      // 10. Create private conversation between client and developer
      const convRes = await client.query(
        `INSERT INTO conversations (project_id, type, status)
         VALUES ($1, 'PROJECT_PRIVATE', 'ACTIVE')
         RETURNING id`,
        [projectId]
      );
      const convId = convRes.rows[0].id;

      // Add developer to conversation
      await client.query(
        `INSERT INTO conversation_members (conversation_id, user_id, developer_id, role)
         VALUES ($1, $2, $3, 'DEVELOPER')`,
        [convId, userId, developerId]
      );

      // Add client to conversation
      const clientUserRes = await client.query(
        `SELECT user_id FROM clients WHERE id = $1`,
        [project.client_id]
      );
      if (clientUserRes.rows.length > 0) {
        await client.query(
          `INSERT INTO conversation_members (conversation_id, user_id, client_id, role)
           VALUES ($1, $2, $3, 'CLIENT')`,
          [convId, clientUserRes.rows[0].user_id, project.client_id]
        );
      }

      // Notify Client that a developer claimed a slot
      if (clientUserRes.rows.length > 0) {
        await client.query(
          `INSERT INTO notifications (user_id, type, title, message)
           VALUES ($1, 'PROJECT_CLAIMED', 'New Project Claim', $2)`,
          [
            clientUserRes.rows[0].user_id,
            `${anonymousTag} has claimed your project and is preparing a proposal.`,
          ]
        );
      }

      return {
        claimId,
        anonymousTag,
        remainingCredits: ledgerResult.newBalance,
        conversationId: convId,
      };
    });
  }

  /**
   * Developer submits a proposal for a claimed project
   */
  static async submitProposal(
    projectId: string,
    developerId: string,
    proposal: ProposalInput
  ): Promise<{ proposalId: string; status: string }> {
    return withTransaction(async (client) => {
      // 1. Verify developer holds an active claim
      const claimRes = await client.query(
        `SELECT id, anonymous_tag FROM project_claims 
         WHERE project_id = $1 AND developer_id = $2`,
        [projectId, developerId]
      );

      if (claimRes.rows.length === 0) {
        throw new Error('You must claim this project before submitting a proposal');
      }

      const claim = claimRes.rows[0];

      // 2. Upsert proposal
      const propRes = await client.query(
        `INSERT INTO proposals (
            project_claim_id, approach, timeline, price, milestones, technologies, additional_notes, status
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'SUBMITTED')
         ON CONFLICT (project_claim_id) DO UPDATE
         SET approach = EXCLUDED.approach,
             timeline = EXCLUDED.timeline,
             price = EXCLUDED.price,
             milestones = EXCLUDED.milestones,
             technologies = EXCLUDED.technologies,
             additional_notes = EXCLUDED.additional_notes,
             updated_at = NOW()
         RETURNING id, status`,
        [
          claim.id,
          proposal.approach,
          proposal.timeline,
          proposal.price,
          JSON.stringify(proposal.milestones || []),
          JSON.stringify(proposal.technologies || []),
          proposal.additionalNotes || null,
        ]
      );

      // Notify Client
      const projectRes = await client.query(
        `SELECT c.user_id, p.title FROM projects p 
         JOIN clients c ON p.client_id = c.id 
         WHERE p.id = $1`,
        [projectId]
      );

      if (projectRes.rows.length > 0) {
        await client.query(
          `INSERT INTO notifications (user_id, type, title, message)
           VALUES ($1, 'PROPOSAL_RECEIVED', 'Proposal Received', $2)`,
          [
            projectRes.rows[0].user_id,
            `${claim.anonymous_tag} submitted a proposal for "${projectRes.rows[0].title}".`,
          ]
        );
      }

      return {
        proposalId: propRes.rows[0].id,
        status: propRes.rows[0].status,
      };
    });
  }

  /**
   * Retrieves proposals for a project with identity shielding
   * Real developer names are masked as Developer #01, #02 etc.
   */
  static async getProposals(
    projectId: string,
    user: { role: string; userId?: string; clientId?: string; developerId?: string }
  ) {
    const isLeadership = [ROLES.CEO, ROLES.MD, ROLES.ADMIN].includes(user.role as any);

    const rows = await query(
      `SELECT pr.id, pr.approach, pr.timeline, pr.price, pr.milestones, pr.technologies,
              pr.additional_notes, pr.status, pr.created_at,
              pc.id as claim_id, pc.anonymous_tag, pc.developer_id,
              d.experience, d.role_title
       FROM proposals pr
       JOIN project_claims pc ON pr.project_claim_id = pc.id
       JOIN developers d ON pc.developer_id = d.id
       WHERE pc.project_id = $1
       ORDER BY pr.created_at ASC`,
      [projectId]
    );

    // If client or regular user, mask developerId unless leadership
    return rows.rows.map((row) => ({
      id: row.id,
      claimId: row.claim_id,
      anonymousTag: row.anonymous_tag,
      anonymous_tag: row.anonymous_tag,
      approach: row.approach,
      timeline: row.timeline,
      price: row.price,
      milestones: row.milestones,
      technologies: row.technologies,
      additionalNotes: row.additional_notes,
      status: row.status,
      created_at: row.created_at,
      developerProfile: {
        roleTitle: row.role_title,
        experienceYears: row.experience,
        // Only leadership sees real developer ID
        developerId: isLeadership || row.developer_id === user.developerId ? row.developer_id : undefined,
      },
    }));
  }

  /**
   * Executes atomic developer selection by client with auto-refunds to unselected developers
   */
  static async selectDeveloper(
    projectId: string,
    selectedDeveloperId: string,
    clientId: string
  ): Promise<{ success: boolean; refundedCount: number }> {
    return withTransaction(async (client) => {
      // 1. Verify project ownership
      const projectRes = await client.query(
        `SELECT id, status, client_id, title FROM projects WHERE id = $1 FOR UPDATE`,
        [projectId]
      );

      if (projectRes.rows.length === 0) {
        throw new Error('Project not found');
      }

      const project = projectRes.rows[0];
      if (project.client_id !== clientId) {
        throw new Error('Forbidden: only the project owner can select a developer');
      }

      // 2. Update selected claim
      await client.query(
        `UPDATE project_claims
         SET status = 'SELECTED', selected_at = NOW()
         WHERE project_id = $1 AND developer_id = $2`,
        [projectId, selectedDeveloperId]
      );

      // 3. Add to project members as LEAD
      await client.query(
        `INSERT INTO project_members (project_id, developer_id, role)
         VALUES ($1, $2, 'LEAD')
         ON CONFLICT (project_id, developer_id) DO UPDATE SET role = 'LEAD'`,
        [projectId, selectedDeveloperId]
      );

      // 4. Update project lead and status to IN_PROGRESS
      await client.query(
        `UPDATE projects
         SET lead_developer_id = $1, status = 'IN_PROGRESS', updated_at = NOW()
         WHERE id = $2`,
        [selectedDeveloperId, projectId]
      );

      // 5. Initialize workspace default milestones
      await client.query(
        `INSERT INTO project_milestones (project_id, title, description, status, order_index)
         VALUES 
           ($1, 'Phase 1: Architecture & Technical Specification', 'System architecture, API contracts, schema finalization', 'IN_PROGRESS', 1),
           ($1, 'Phase 2: Core Development & Implementation', 'Backend APIs, UI integration, end-to-end functionality', 'PENDING', 2),
           ($1, 'Phase 3: QA, Verification & Client Sign-off', 'Regression testing, security checks, production deployment', 'PENDING', 3)
         ON CONFLICT DO NOTHING`,
        [projectId]
      );

      // 6. Trigger automated refunds for all non-selected developers
      const refundResult = await CreditLedgerService.processSelectionRefunds(
        projectId,
        selectedDeveloperId,
        client
      );

      // 7. Notify winning developer
      const winDevUser = await client.query(
        `SELECT user_id FROM developers WHERE id = $1`,
        [selectedDeveloperId]
      );
      if (winDevUser.rows.length > 0) {
        await client.query(
          `INSERT INTO notifications (user_id, type, title, message)
           VALUES ($1, 'PROPOSAL_ACCEPTED', 'Proposal Accepted!', $2)`,
          [
            winDevUser.rows[0].user_id,
            `Congratulations! You have been selected for "${project.title}". The workspace is now open.`,
          ]
        );
      }

      return {
        success: true,
        refundedCount: refundResult.refundedDevelopersCount,
      };
    });
  }

  /**
   * Retrieves open marketplace projects
   */
  static async getMarketplaceProjects(filters?: { category?: string; search?: string }) {
    let sql = `
      SELECT p.id, p.project_number, p.slug, p.title, p.description, p.category,
             p.budget_min, p.budget_max, p.timeline, p.required_technologies,
             p.status, p.claim_cost, p.max_claims, p.claim_deadline, p.created_at,
             COUNT(pc.id) as current_claims
      FROM projects p
      LEFT JOIN project_claims pc ON p.id = pc.project_id
      WHERE p.status IN ('OPEN_FOR_CLAIMS', 'CLAIMS_ACTIVE')
    `;

    const params: any[] = [];
    if (filters?.category && filters.category !== 'ALL') {
      params.push(filters.category);
      sql += ` AND p.category = $${params.length}`;
    }

    if (filters?.search) {
      params.push(`%${filters.search}%`);
      sql += ` AND (p.title ILIKE $${params.length} OR p.description ILIKE $${params.length})`;
    }

    sql += ` GROUP BY p.id ORDER BY p.created_at DESC`;

    const result = await query(sql, params);
    return result.rows.map((r) => ({
      ...r,
      current_claims: parseInt(r.current_claims, 10),
      slots_remaining: Math.max(0, r.max_claims - parseInt(r.current_claims, 10)),
    }));
  }
}
