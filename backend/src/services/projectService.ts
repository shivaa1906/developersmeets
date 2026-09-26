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
  attachments?: any[];
  preferredProjectNumber?: string;
}

export interface ProposalInput {
  approach: string;
  timeline: string;
  price: number;
  milestones?: Array<{ title: string; duration: string; priceShare: number }>;
  technologies?: string[];
  additionalNotes?: string;
}

export interface EligibilityResult {
  eligible: boolean;
  missingSkills: string[];
  matchedSkills: string[];
  requiredSkills: string[];
  reason?: string;
}

export class ProjectService {
  /**
   * Client submits a new project, entering the PENDING / SUBMITTED state for admin review
   */
  static async submitProject(
    clientId: string,
    userId: string,
    data: ProjectSubmissionInput
  ): Promise<{ projectId: string; projectNumber: string; status: string }> {
    return withTransaction(async (client) => {
      // Generate clean slug & unique project number (find lowest available sequence starting from 1)
      let projectNumber = data.preferredProjectNumber;
      let seq = 1;
      if (!projectNumber) {
        const seqRes = await client.query(
          `SELECT SUBSTRING(project_number FROM 10)::int as num 
           FROM projects WHERE project_number ~ '^PRJ-2026-[0-9]+$' ORDER BY num ASC`
        );
        const existingNums = new Set(seqRes.rows.map((r: any) => r.num));
        while (existingNums.has(seq)) {
          seq++;
        }
        projectNumber = `PRJ-2026-${String(seq).padStart(4, '0')}`;
      } else {
        const match = projectNumber.match(/PRJ-2026-(\d+)/);
        seq = match ? parseInt(match[1], 10) : 1;
      }

      const slug = `${data.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${seq}`;

      const insertRes = await client.query(
        `INSERT INTO projects (
            project_number, slug, title, description, category,
            budget_min, budget_max, timeline, requirements, required_technologies,
            attachments, status, claim_cost, max_claims, claim_deadline, client_id
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'SUBMITTED', 1, 5, NOW() + INTERVAL '7 days', $12)
         RETURNING id, project_number, status`,
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
          JSON.stringify(data.attachments || []),
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
        status: newProject.status,
      };
    });
  }

  /**
   * Admin reviews submitted project: transitions from SUBMITTED to REVIEWING
   */
  static async reviewProject(
    projectId: string,
    adminUserId: string,
    notes?: string
  ): Promise<{ projectId: string; status: string }> {
    return withTransaction(async (client) => {
      const projRes = await client.query(
        'SELECT id, status, title FROM projects WHERE id = $1 FOR UPDATE',
        [projectId]
      );
      if (projRes.rows.length === 0) {
        throw new Error('Project not found');
      }

      const project = projRes.rows[0];
      if (project.status !== 'SUBMITTED') {
        throw new Error(
          `Invalid status transition: Cannot review project in '${project.status}' state. Expected 'SUBMITTED'.`
        );
      }

      await client.query(
        `UPDATE projects
         SET status = 'REVIEWING',
             updated_at = NOW()
         WHERE id = $1`,
        [projectId]
      );

      await AuditLogger.log({
        actorUserId: adminUserId,
        action: 'PROJECT_REVIEW_STARTED',
        entityType: 'PROJECT',
        entityId: projectId,
        metadata: { previousStatus: project.status, newStatus: 'REVIEWING', notes },
      });

      return { projectId, status: 'REVIEWING' };
    });
  }

  /**
   * Admin approves submitted project and opens it for marketplace developer claims (REVIEWING/SUBMITTED -> OPEN_FOR_CLAIMS)
   */
  static async approveProject(
    projectId: string,
    adminUserId: string,
    maxClaims = 5,
    deadlineDays = 7
  ): Promise<{ projectId: string; status: string }> {
    return withTransaction(async (client) => {
      const projRes = await client.query(
        'SELECT id, status, title FROM projects WHERE id = $1 FOR UPDATE',
        [projectId]
      );
      if (projRes.rows.length === 0) {
        throw new Error('Project not found');
      }

      const project = projRes.rows[0];
      if (project.status !== 'REVIEWING' && project.status !== 'SUBMITTED') {
        throw new Error(
          `Invalid status transition: Cannot approve project in '${project.status}' state. Expected 'REVIEWING' or 'SUBMITTED'.`
        );
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
        metadata: { maxClaims, deadlineDays, previousStatus: project.status, newStatus: 'OPEN_FOR_CLAIMS' },
      });

      return { projectId, status: 'OPEN_FOR_CLAIMS' };
    });
  }

  /**
   * Checks whether a developer possesses all required skills for a project
   */
  static async checkEligibility(
    projectId: string,
    developerId: string,
    dbClient?: any
  ): Promise<EligibilityResult> {
    const runner = dbClient ? dbClient.query.bind(dbClient) : query;

    // 1. Fetch project requirements and technologies
    const projRes = await runner(
      `SELECT requirements, required_technologies, status FROM projects WHERE id = $1`,
      [projectId]
    );

    if (projRes.rows.length === 0) {
      throw new Error('Project not found');
    }

    const project = projRes.rows[0];

    // Collect skills required by the project
    const rawRequirements: string[] = Array.isArray(project.requirements) ? project.requirements : [];
    const rawTech: string[] = Array.isArray(project.required_technologies)
      ? project.required_technologies
      : [];

    const requiredSkills = Array.from(new Set([...rawRequirements, ...rawTech])).filter(
      (s) => typeof s === 'string' && s.trim().length > 0
    );

    // 2. Fetch developer skills
    const devSkillsRes = await runner(
      `SELECT s.name 
       FROM developer_skills ds
       JOIN skills s ON ds.skill_id = s.id
       WHERE ds.developer_id = $1`,
      [developerId]
    );

    const devSkillList = devSkillsRes.rows.map((r: any) => r.name.toLowerCase().trim());

    // 3. Match each required skill
    const matchedSkills: string[] = [];
    const missingSkills: string[] = [];

    const normalizeSkill = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

    for (const reqSkill of requiredSkills) {
      const normReq = normalizeSkill(reqSkill);
      const hasMatch = devSkillList.some((devSkill: string) => {
        const normDev = normalizeSkill(devSkill);
        return (
          normDev === normReq ||
          (normReq === 'postgresql' && (normDev === 'postgres' || normDev === 'pg')) ||
          (normReq === 'postgres' && normDev === 'postgresql') ||
          (normReq === 'nodejs' && (normDev === 'node' || normDev === 'nodeexpress')) ||
          (normReq === 'react' && normDev === 'reactjs')
        );
      });

      if (hasMatch) {
        matchedSkills.push(reqSkill);
      } else {
        missingSkills.push(reqSkill);
      }
    }

    const eligible = missingSkills.length === 0;

    return {
      eligible,
      missingSkills,
      matchedSkills,
      requiredSkills,
      reason: eligible
        ? 'Developer satisfies all skill requirements'
        : `Missing required skills: ${missingSkills.join(', ')}`,
    };
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

      // 2b. Verify skill eligibility
      const eligibility = await ProjectService.checkEligibility(projectId, developerId, client);
      if (!eligibility.eligible) {
        throw new Error(
          `Forbidden: Developer is not eligible to claim this project. Missing required skills: ${eligibility.missingSkills.join(', ')}`
        );
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

      // 9. Update project state if full: transitions to CLAIMS_CLOSED
      if (currentClaimsCount + 1 >= project.max_claims) {
        await client.query(
          `UPDATE projects SET status = $1, updated_at = NOW() WHERE id = $2`,
          [PROJECT_STATUSES.CLAIMS_CLOSED, projectId]
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
   * Competing developers cannot see other developers' proposals.
   */
  static async getProposals(
    projectId: string,
    user: { role: string; userId?: string; clientId?: string; developerId?: string }
  ) {
    const isLeadership = [ROLES.CEO, ROLES.MD, ROLES.ADMIN].includes(user.role as any);

    // If client, verify project ownership
    if (user.role === ROLES.CLIENT && user.clientId) {
      const projOwnerCheck = await query(`SELECT client_id FROM projects WHERE id = $1`, [projectId]);
      if (projOwnerCheck.rows.length === 0 || projOwnerCheck.rows[0].client_id !== user.clientId) {
        throw new Error('Forbidden: You can only view proposals for your own projects');
      }
    }

    let sql = `
      SELECT pr.id, pr.approach, pr.timeline, pr.price, pr.milestones, pr.technologies,
             pr.additional_notes, pr.status, pr.created_at,
             pc.id as claim_id, pc.anonymous_tag, pc.developer_id,
             d.experience, d.role_title
      FROM proposals pr
      JOIN project_claims pc ON pr.project_claim_id = pc.id
      JOIN developers d ON pc.developer_id = d.id
      WHERE pc.project_id = $1
    `;
    const params: any[] = [projectId];

    // Developer isolation: A developer can ONLY see their own proposal!
    if (user.role === ROLES.DEVELOPER) {
      if (!user.developerId) {
        return [];
      }
      sql += ` AND pc.developer_id = $2`;
      params.push(user.developerId);
    }

    sql += ` ORDER BY pr.created_at ASC`;

    const rows = await query(sql, params);

    // If client or regular user, mask developerId unless leadership
    return rows.rows.map((row) => ({
      id: row.id,
      claimId: row.claim_id,
      anonymousTag: row.anonymous_tag,
      anonymous_tag: row.anonymous_tag,
      approach: row.approach,
      timeline: row.timeline,
      price: Number(row.price),
      milestones: typeof row.milestones === 'string' ? JSON.parse(row.milestones) : (row.milestones || []),
      technologies: typeof row.technologies === 'string' ? JSON.parse(row.technologies) : (row.technologies || []),
      additionalNotes: row.additional_notes,
      status: row.status,
      created_at: row.created_at,
      developerProfile: {
        roleTitle: row.role_title,
        experienceYears: row.experience,
        // Only leadership or proposal owner sees real developer ID
        developerId: isLeadership || row.developer_id === user.developerId ? row.developer_id : undefined,
      },
    }));
  }

  /**
   * Executes atomic developer selection by client with auto-refunds to unselected developers
   * and automatic closure of unselected candidate chat channels
   */
  static async selectDeveloper(
    projectId: string,
    selectedDeveloperId: string,
    clientId: string
  ): Promise<{ success: boolean; refundedCount: number }> {
    return withTransaction(async (client) => {
      // 1. Verify project ownership and state with row lock FOR UPDATE
      const projectRes = await client.query(
        `SELECT id, status, client_id, title, lead_developer_id FROM projects WHERE id = $1 FOR UPDATE`,
        [projectId]
      );

      if (projectRes.rows.length === 0) {
        throw new Error('Project not found');
      }

      const project = projectRes.rows[0];
      if (project.client_id !== clientId) {
        throw new Error('Forbidden: only the project owner can select a developer');
      }

      // Duplicate / Concurrent selection guard:
      if (
        project.lead_developer_id !== null ||
        project.status === 'DEVELOPER_SELECTED' ||
        project.status === 'IN_PROGRESS'
      ) {
        throw new Error(
          'Conflict: A lead developer has already been selected for this project. Duplicate selection is not permitted.'
        );
      }

      // Verify selected developer has claimed this project
      const claimCheck = await client.query(
        `SELECT id, status FROM project_claims WHERE project_id = $1 AND developer_id = $2`,
        [projectId, selectedDeveloperId]
      );
      if (claimCheck.rows.length === 0) {
        throw new Error('Candidate developer has not claimed this project');
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

      // 4. Update project lead and status to DEVELOPER_SELECTED
      await client.query(
        `UPDATE projects
         SET lead_developer_id = $1, status = 'DEVELOPER_SELECTED', updated_at = NOW()
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

      // 7. Close private conversations for unselected developers on this project
      await client.query(
        `UPDATE conversations
         SET status = 'CLOSED', closed_at = NOW()
         WHERE project_id = $1
           AND type = 'PROJECT_PRIVATE'
           AND id NOT IN (
             SELECT conversation_id FROM conversation_members WHERE developer_id = $2
           )`,
        [projectId, selectedDeveloperId]
      );

      // 8. Record audit log with client, project, selected developer, timestamp, and refunds
      const clientUserRes = await client.query(
        `SELECT user_id FROM clients WHERE id = $1`,
        [clientId]
      );
      const actorUserId = clientUserRes.rows[0]?.user_id || clientId;

      await client.query(
        `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
         VALUES ($1, 'DEVELOPER_SELECTED', 'PROJECT', $2, $3)`,
        [
          actorUserId,
          projectId,
          JSON.stringify({
            client: clientId,
            clientId,
            project: projectId,
            projectId,
            selectedDeveloperId,
            selected_developer: selectedDeveloperId,
            timestamp: new Date().toISOString(),
            refunds: refundResult.refundedDevelopersCount,
          }),
        ]
      );

      // 9. Notify winning developer
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

  /**
   * Developer submits project for client completion review
   */
  static async submitForReview(
    projectId: string,
    user: { userId: string; role: string; developerId?: string },
    notes?: string
  ) {
    const projRes = await query(
      `SELECT p.id, p.title, p.status, p.client_id, p.lead_developer_id, c.user_id as client_user_id
       FROM projects p
       JOIN clients c ON p.client_id = c.id
       WHERE p.id = $1`,
      [projectId]
    );

    if (projRes.rows.length === 0) {
      throw new Error('Project not found');
    }

    const project = projRes.rows[0];

    const isLeadership = [ROLES.CEO, ROLES.MD, ROLES.ADMIN].includes(user.role as any);
    const isLeadDev = Boolean(user.developerId && user.developerId === project.lead_developer_id);

    let isTeamMember = false;
    if (user.developerId) {
      const memberRes = await query(
        `SELECT 1 FROM project_members WHERE project_id = $1 AND developer_id = $2`,
        [projectId, user.developerId]
      );
      isTeamMember = memberRes.rows.length > 0;
    }

    if (!isLeadership && !isLeadDev && !isTeamMember) {
      throw new Error('Forbidden: Only the assigned developer can submit a project for completion review');
    }

    const validPriorStatuses = ['DEVELOPER_SELECTED', 'IN_PROGRESS'];
    if (!validPriorStatuses.includes(project.status)) {
      throw new Error(`Cannot submit for review from status: ${project.status}`);
    }

    await query(
      `UPDATE projects SET status = 'SUBMITTED_FOR_REVIEW', updated_at = NOW() WHERE id = $1`,
      [projectId]
    );

    if (project.client_user_id) {
      await query(
        `INSERT INTO notifications (user_id, type, title, message)
         VALUES ($1, 'PROJECT_SUBMITTED_FOR_REVIEW', 'Project Submitted for Review', $2)`,
        [
          project.client_user_id,
          `Developer has finalized work on "${project.title}" and submitted it for completion sign-off. Notes: ${notes || 'Ready for review.'}`,
        ]
      );
    }

    await AuditLogger.log({
      actorUserId: user.userId,
      action: 'PROJECT_SUBMITTED_FOR_REVIEW',
      entityType: 'PROJECT',
      entityId: projectId,
      metadata: { notes },
    });

    return { projectId, status: 'SUBMITTED_FOR_REVIEW' };
  }

  /**
   * Client requests changes during project completion review
   */
  static async requestChanges(
    projectId: string,
    user: { userId: string; role: string; clientId?: string },
    feedback?: string
  ) {
    const projRes = await query(
      `SELECT p.id, p.title, p.status, p.client_id, p.lead_developer_id, d.user_id as dev_user_id
       FROM projects p
       LEFT JOIN developers d ON p.lead_developer_id = d.id
       WHERE p.id = $1`,
      [projectId]
    );

    if (projRes.rows.length === 0) {
      throw new Error('Project not found');
    }

    const project = projRes.rows[0];

    const isLeadership = [ROLES.CEO, ROLES.MD, ROLES.ADMIN].includes(user.role as any);
    const isClientOwner = Boolean(user.clientId && user.clientId === project.client_id);

    if (!isLeadership && !isClientOwner) {
      throw new Error('Forbidden: Only the project client can request changes on project review');
    }

    if (project.status !== 'SUBMITTED_FOR_REVIEW') {
      throw new Error(`Cannot request changes from status: ${project.status}`);
    }

    await query(
      `UPDATE projects SET status = 'IN_PROGRESS', updated_at = NOW() WHERE id = $1`,
      [projectId]
    );

    if (project.dev_user_id) {
      await query(
        `INSERT INTO notifications (user_id, type, title, message)
         VALUES ($1, 'PROJECT_CHANGES_REQUESTED', 'Changes Requested on Project', $2)`,
        [
          project.dev_user_id,
          `Client requested adjustments on "${project.title}". Feedback: ${feedback || 'Please update and resubmit.'}`,
        ]
      );
    }

    await AuditLogger.log({
      actorUserId: user.userId,
      action: 'PROJECT_CHANGES_REQUESTED',
      entityType: 'PROJECT',
      entityId: projectId,
      metadata: { feedback },
    });

    return { projectId, status: 'IN_PROGRESS', feedback };
  }

  /**
   * Client approves project completion
   */
  static async approveCompletion(
    projectId: string,
    user: { userId: string; role: string; clientId?: string },
    options?: { feedback?: string; rating?: number; publishImmediately?: boolean }
  ) {
    return withTransaction(async (client) => {
      const projRes = await client.query(
        `SELECT id, client_id, lead_developer_id, title, status FROM projects WHERE id = $1 FOR UPDATE`,
        [projectId]
      );

      if (projRes.rows.length === 0) {
        throw new Error('Project not found');
      }

      const project = projRes.rows[0];

      const isLeadership = [ROLES.CEO, ROLES.MD, ROLES.ADMIN].includes(user.role as any);
      const isClientOwner = Boolean(user.clientId && user.clientId === project.client_id);

      if (!isLeadership && !isClientOwner) {
        throw new Error('Forbidden: Only the project client can approve completion');
      }

      const validStatuses = ['SUBMITTED_FOR_REVIEW', 'IN_PROGRESS', 'DEVELOPER_SELECTED'];
      if (!validStatuses.includes(project.status)) {
        throw new Error(`Cannot approve completion from status: ${project.status}`);
      }

      // Mark all milestones as completed
      await client.query(
        `UPDATE project_milestones
         SET status = 'COMPLETED', completed_at = COALESCE(completed_at, NOW())
         WHERE project_id = $1`,
        [projectId]
      );

      const nextStatus = options?.publishImmediately ? 'PUBLISHED' : 'COMPLETED';

      await client.query(
        `UPDATE projects SET status = $1::project_status, updated_at = NOW() WHERE id = $2`,
        [nextStatus, projectId]
      );

      if (project.lead_developer_id) {
        const devUser = await client.query(
          `SELECT user_id FROM developers WHERE id = $1`,
          [project.lead_developer_id]
        );
        if (devUser.rows.length > 0) {
          await client.query(
            `INSERT INTO notifications (user_id, type, title, message)
             VALUES ($1, 'PROJECT_COMPLETED', 'Project Completion Approved!', $2)`,
            [
              devUser.rows[0].user_id,
              `Congratulations! The client has approved completion for "${project.title}".`,
            ]
          );
        }
      }

      await AuditLogger.log({
        actorUserId: user.userId,
        action: options?.publishImmediately ? 'PROJECT_COMPLETED_AND_PUBLISHED' : 'PROJECT_COMPLETED',
        entityType: 'PROJECT',
        entityId: projectId,
        metadata: {
          rating: options?.rating || 5,
          feedback: options?.feedback || 'Project completion approved.',
          status: nextStatus,
        },
      });

      return {
        projectId,
        status: nextStatus,
        completed: true,
        published: nextStatus === 'PUBLISHED',
      };
    });
  }

  /**
   * Publish completed project to the public showcase
   */
  static async publishProject(
    projectId: string,
    user: { userId: string; role: string; clientId?: string }
  ) {
    const projRes = await query(
      `SELECT p.id, p.client_id, p.lead_developer_id, p.title, p.status, d.user_id as dev_user_id
       FROM projects p
       LEFT JOIN developers d ON p.lead_developer_id = d.id
       WHERE p.id = $1`,
      [projectId]
    );

    if (projRes.rows.length === 0) {
      throw new Error('Project not found');
    }

    const project = projRes.rows[0];

    const isLeadership = [ROLES.CEO, ROLES.MD, ROLES.ADMIN].includes(user.role as any);
    const isClientOwner = Boolean(user.clientId && user.clientId === project.client_id);

    if (!isLeadership && !isClientOwner) {
      throw new Error('Forbidden: Only client or leadership can publish project');
    }

    await query(
      `UPDATE projects SET status = 'PUBLISHED', updated_at = NOW() WHERE id = $1`,
      [projectId]
    );

    if (project.dev_user_id) {
      await query(
        `INSERT INTO notifications (user_id, type, title, message)
         VALUES ($1, 'PROJECT_PUBLISHED', 'Project Published to Public Portfolio!', $2)`,
        [
          project.dev_user_id,
          `"${project.title}" has been published to the public showcase and is now attributed on your developer profile.`,
        ]
      );
    }

    await AuditLogger.log({
      actorUserId: user.userId,
      action: 'PROJECT_PUBLISHED',
      entityType: 'PROJECT',
      entityId: projectId,
    });

    return { projectId, status: 'PUBLISHED' };
  }

  /**
   * Retrieve publicly published project by slug or ID with privacy sanitization
   */
  static async getPublicProjectBySlug(slugOrId: string) {
    const projRes = await query(
      `SELECT p.id, p.project_number, p.slug, p.title, p.description, p.category,
              p.timeline, p.required_technologies, p.attachments, p.status, p.created_at,
              d.id as dev_id, d.username as dev_username, d.display_name as dev_name,
              d.role_title as dev_title, d.profile_image as dev_avatar
       FROM projects p
       LEFT JOIN developers d ON p.lead_developer_id = d.id
       WHERE (p.slug = $1 OR p.id::text = $1)`,
      [slugOrId]
    );

    if (projRes.rows.length === 0) {
      return null;
    }

    const project = projRes.rows[0];

    // Privacy guard: Non-published projects are NEVER returned on public endpoints
    if (project.status !== 'PUBLISHED') {
      return null;
    }

    let technologies: string[] = [];
    if (Array.isArray(project.required_technologies)) {
      technologies = project.required_technologies;
    } else if (typeof project.required_technologies === 'string') {
      try {
        technologies = JSON.parse(project.required_technologies);
      } catch {
        technologies = [project.required_technologies];
      }
    }

    let screenshots: any[] = [];
    if (Array.isArray(project.attachments)) {
      screenshots = project.attachments;
    } else if (typeof project.attachments === 'string') {
      try {
        screenshots = JSON.parse(project.attachments);
      } catch {
        screenshots = [];
      }
    }

    const leadDevName = project.dev_name || 'Nexus Engineer';
    const leadDevUsername = project.dev_username || null;

    return {
      id: project.id,
      projectNumber: project.project_number,
      slug: project.slug,
      title: project.title,
      description: project.description,
      category: project.category,
      status: project.status,
      timeline: project.timeline,
      technology: technologies,
      technologies,
      screenshots,
      leadDeveloper: leadDevUsername
        ? {
            id: project.dev_id,
            name: leadDevName,
            username: leadDevUsername,
            roleTitle: project.dev_title,
            avatarUrl: project.dev_avatar,
          }
        : null,
      attribution: `Built by ${leadDevName}`,
      developerLink: leadDevUsername ? `/developers/${leadDevUsername}` : null,
    };
  }
}

