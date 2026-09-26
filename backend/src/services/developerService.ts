import { query, withTransaction } from '../database/db.js';

export interface DeveloperExperienceInput {
  company: string;
  roleTitle: string;
  location?: string;
  startDate: string;
  endDate?: string;
  isCurrent?: boolean;
  description?: string;
}

export interface DeveloperCertificationInput {
  name: string;
  issuer: string;
  issueDate: string;
  expirationDate?: string;
  credentialId?: string;
  credentialUrl?: string;
}

export class DeveloperService {
  /**
   * Public directory of verified platform developers
   */
  static async getVerifiedDevelopers(filter?: { search?: string }) {
    let sql = `
      SELECT d.id, d.username, d.display_name, d.profile_image as avatar_url, d.bio, d.role_title,
             d.experience, d.availability, d.verification_status, d.github_url, d.linkedin_url,
             d.portfolio_url, d.profile_views_count,
             COUNT(DISTINCT p.id) as completed_projects_count,
             COALESCE(
               json_agg(DISTINCT jsonb_build_object('name', s.name, 'category', s.category)) 
               FILTER (WHERE s.id IS NOT NULL), '[]'
             ) as skills
      FROM developers d
      LEFT JOIN project_members pm ON d.id = pm.developer_id
      LEFT JOIN projects p ON (pm.project_id = p.id AND p.status = 'PUBLISHED')
      LEFT JOIN developer_skills ds ON d.id = ds.developer_id
      LEFT JOIN skills s ON ds.skill_id = s.id
      WHERE d.verification_status = 'VERIFIED'
    `;

    const params: any[] = [];
    if (filter?.search) {
      params.push(`%${filter.search}%`);
      sql += ` AND (d.display_name ILIKE $1 OR d.role_title ILIKE $1 OR d.bio ILIKE $1)`;
    }

    sql += ` GROUP BY d.id ORDER BY completed_projects_count DESC, d.experience DESC`;

    const res = await query(sql, params);
    return res.rows.map((row) => ({
      ...row,
      status: 'APPROVED',
      verified: true,
      completed_projects_count: parseInt(row.completed_projects_count, 10),
    }));
  }

  /**
   * Public developer portfolio page by username with attributed projects,
   * skills, experiences, and certifications.
   */
  static async getDeveloperByUsername(username: string) {
    const devRes = await query(
      `SELECT d.id, d.username, d.display_name, d.profile_image as avatar_url, d.bio, d.role_title,
              d.experience, d.availability, d.verification_status, d.verified_at,
              d.github_url, d.linkedin_url, d.portfolio_url, d.profile_views_count
       FROM developers d
       WHERE d.username = $1 AND d.verification_status = 'VERIFIED'`,
      [username]
    );

    if (devRes.rows.length === 0) {
      return null;
    }

    const developer = devRes.rows[0];

    // Record profile view
    try {
      await query(
        `INSERT INTO developer_profile_views (developer_id) VALUES ($1)`,
        [developer.id]
      );
      await query(
        `UPDATE developers SET profile_views_count = profile_views_count + 1 WHERE id = $1`,
        [developer.id]
      );
    } catch (_err) {
      // Non-fatal
    }

    // Fetch skills
    const skillsRes = await query(
      `SELECT s.id, s.name, s.category, ds.experience_level
       FROM developer_skills ds
       JOIN skills s ON ds.skill_id = s.id
       WHERE ds.developer_id = $1`,
      [developer.id]
    );

    // Fetch experiences
    const expRes = await query(
      `SELECT id, company, role_title, location, start_date, end_date, is_current, description
       FROM experiences
       WHERE developer_id = $1
       ORDER BY is_current DESC, start_date DESC`,
      [developer.id]
    );

    // Fetch certifications
    const certRes = await query(
      `SELECT id, name, issuer, issue_date, expiration_date, credential_id, credential_url
       FROM certifications
       WHERE developer_id = $1
       ORDER BY issue_date DESC`,
      [developer.id]
    );

    // Fetch attributed completed projects
    const projectsRes = await query(
      `SELECT DISTINCT p.id, p.project_number, p.slug, p.title, p.description, p.category,
              p.timeline, p.required_technologies, p.created_at, COALESCE(pm.role::text, 'LEAD') as project_role
       FROM projects p
       LEFT JOIN project_members pm ON (pm.project_id = p.id AND pm.developer_id = $1)
       WHERE (pm.developer_id = $1 OR p.lead_developer_id = $1) AND p.status = 'PUBLISHED'
       ORDER BY p.created_at DESC`,
      [developer.id]
    );

    return {
      ...developer,
      status: 'APPROVED',
      verified: true,
      profileViews: (developer.profile_views_count || 0) + 1,
      skills: skillsRes.rows,
      experiences: expRes.rows,
      certifications: certRes.rows,
      attributedProjects: projectsRes.rows,
    };
  }

  /**
   * Fetch developer's own complete profile by ID (even if PENDING)
   */
  static async getDeveloperById(developerId: string) {
    const devRes = await query(
      `SELECT d.id, d.user_id, d.username, d.display_name, d.profile_image as avatar_url, d.bio, d.role_title,
              d.experience, d.availability, d.verification_status, d.verified_at,
              d.github_url, d.linkedin_url, d.portfolio_url, d.profile_views_count,
              u.email, u.status as user_status
       FROM developers d
       JOIN users u ON d.user_id = u.id
       WHERE d.id = $1`,
      [developerId]
    );

    if (devRes.rows.length === 0) {
      return null;
    }

    const developer = devRes.rows[0];

    // Fetch skills
    const skillsRes = await query(
      `SELECT s.id, s.name, s.category, ds.experience_level
       FROM developer_skills ds
       JOIN skills s ON ds.skill_id = s.id
       WHERE ds.developer_id = $1`,
      [developer.id]
    );

    // Fetch experiences
    const expRes = await query(
      `SELECT id, company, role_title, location, start_date, end_date, is_current, description
       FROM experiences
       WHERE developer_id = $1
       ORDER BY is_current DESC, start_date DESC`,
      [developer.id]
    );

    // Fetch certifications
    const certRes = await query(
      `SELECT id, name, issuer, issue_date, expiration_date, credential_id, credential_url
       FROM certifications
       WHERE developer_id = $1
       ORDER BY issue_date DESC`,
      [developer.id]
    );

    // Fetch attributed completed projects
    const projectsRes = await query(
      `SELECT DISTINCT p.id, p.project_number, p.slug, p.title, p.description, p.category,
              p.timeline, p.required_technologies, p.created_at, COALESCE(pm.role::text, 'LEAD') as project_role
       FROM projects p
       LEFT JOIN project_members pm ON (pm.project_id = p.id AND pm.developer_id = $1)
       WHERE (pm.developer_id = $1 OR p.lead_developer_id = $1) AND p.status = 'PUBLISHED'
       ORDER BY p.created_at DESC`,
      [developer.id]
    );

    const isVerified = developer.verification_status === 'VERIFIED';
    const status = isVerified
      ? 'APPROVED'
      : developer.verification_status === 'PENDING'
      ? 'PENDING_VERIFICATION'
      : developer.verification_status;

    return {
      ...developer,
      status,
      verified: isVerified,
      profileViews: developer.profile_views_count || 0,
      skills: skillsRes.rows,
      experiences: expRes.rows,
      certifications: certRes.rows,
      attributedProjects: projectsRes.rows,
    };
  }

  /**
   * Developer's private dashboard overview (metrics calculated from real database records)
   * Projects, Claims, Credits, Messages, Inquiries, Profile views
   */
  static async getDashboardOverview(developerId: string) {
    // 1. Projects: count of projects associated with this developer (lead or member)
    const projectsRes = await query(
      `SELECT COUNT(DISTINCT p.id) as count
       FROM projects p
       LEFT JOIN project_members pm ON p.id = pm.project_id
       WHERE pm.developer_id = $1 OR p.lead_developer_id = $1`,
      [developerId]
    );
    const projectsCount = parseInt(projectsRes.rows[0].count, 10);

    // 2. Claims: total claims made & active claims
    const claimsRes = await query(
      `SELECT pc.*, p.title, p.project_number, p.status as project_status
       FROM project_claims pc
       JOIN projects p ON pc.project_id = p.id
       WHERE pc.developer_id = $1
       ORDER BY pc.claimed_at DESC`,
      [developerId]
    );
    const totalClaimsCount = claimsRes.rows.length;
    const activeClaimsCount = claimsRes.rows.filter((c) => c.status === 'CLAIMED').length;

    // 3. Credits: balance from credit_accounts ledger
    const creditRes = await query(
      `SELECT balance FROM credit_accounts WHERE developer_id = $1`,
      [developerId]
    );
    const balance = creditRes.rows.length > 0 ? creditRes.rows[0].balance : 0;

    // 4. Messages: total messages in conversations the developer participates in
    const devUserRes = await query(
      `SELECT user_id FROM developers WHERE id = $1`,
      [developerId]
    );
    let messagesCount = 0;
    if (devUserRes.rows.length > 0) {
      const userId = devUserRes.rows[0].user_id;
      const msgRes = await query(
        `SELECT COUNT(DISTINCT m.id) as count
         FROM messages m
         JOIN conversation_members cm ON m.conversation_id = cm.conversation_id
         WHERE cm.user_id = $1`,
        [userId]
      );
      messagesCount = parseInt(msgRes.rows[0].count, 10);
    }

    // 5. Inquiries: total direct client inquiries received by this developer
    const inqRes = await query(
      `SELECT COUNT(*) as count FROM inquiries WHERE developer_id = $1`,
      [developerId]
    );
    const inquiriesCount = parseInt(inqRes.rows[0].count, 10);

    // 6. Profile views: total verified views recorded
    const viewsRes = await query(
      `SELECT COUNT(*) as count FROM developer_profile_views WHERE developer_id = $1`,
      [developerId]
    );
    const profileViewsCount = parseInt(viewsRes.rows[0].count, 10);

    return {
      metrics: {
        projects: projectsCount,
        claims: totalClaimsCount,
        activeClaims: activeClaimsCount,
        credits: balance,
        messages: messagesCount,
        inquiries: inquiriesCount,
        profileViews: profileViewsCount,
      },
      balance,
      credits: balance,
      projectsCount,
      claimsCount: totalClaimsCount,
      activeClaimsCount,
      messagesCount,
      inquiriesCount,
      profileViewsCount,
      claims: claimsRes.rows,
      completedProjectsCount: projectsCount,
    };
  }

  /**
   * Update developer profile with skills, availability, experiences, and certifications
   */
  static async updateProfile(
    developerId: string,
    data: {
      displayName?: string;
      roleTitle?: string;
      bio?: string;
      experience?: number;
      availability?: 'AVAILABLE' | 'BUSY' | 'ON_PROJECT' | 'UNAVAILABLE';
      githubUrl?: string;
      linkedinUrl?: string;
      portfolioUrl?: string;
      skills?: string[];
      experiences?: DeveloperExperienceInput[];
      certifications?: DeveloperCertificationInput[];
    }
  ) {
    return withTransaction(async (client) => {
      await client.query(
        `UPDATE developers
         SET display_name = COALESCE($1, display_name),
             role_title = COALESCE($2, role_title),
             bio = COALESCE($3, bio),
             experience = COALESCE($4, experience),
             availability = COALESCE($5, availability),
             github_url = COALESCE($6, github_url),
             linkedin_url = COALESCE($7, linkedin_url),
             portfolio_url = COALESCE($8, portfolio_url),
             updated_at = NOW()
         WHERE id = $9`,
        [
          data.displayName || null,
          data.roleTitle || null,
          data.bio || null,
          data.experience !== undefined ? data.experience : null,
          data.availability || null,
          data.githubUrl || null,
          data.linkedinUrl || null,
          data.portfolioUrl || null,
          developerId,
        ]
      );

      // Upsert skills
      if (Array.isArray(data.skills)) {
        for (const s of data.skills) {
          const name = s.trim();
          if (name) {
            const sRes = await client.query(
              `INSERT INTO skills (name, category) VALUES ($1, 'GENERAL')
               ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
              [name]
            );
            if (sRes.rows[0]) {
              await client.query(
                `INSERT INTO developer_skills (developer_id, skill_id, experience_level)
                 VALUES ($1, $2, 'ADVANCED') ON CONFLICT DO NOTHING`,
                [developerId, sRes.rows[0].id]
              );
            }
          }
        }
      }

      // Upsert experiences
      if (Array.isArray(data.experiences) && data.experiences.length > 0) {
        for (const exp of data.experiences) {
          if (exp.company && exp.roleTitle && exp.startDate) {
            await client.query(
              `INSERT INTO experiences (developer_id, company, role_title, location, start_date, end_date, is_current, description)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
              [
                developerId,
                exp.company,
                exp.roleTitle,
                exp.location || null,
                exp.startDate,
                exp.endDate || null,
                exp.isCurrent || false,
                exp.description || null,
              ]
            );
          }
        }
      }

      // Upsert certifications
      if (Array.isArray(data.certifications) && data.certifications.length > 0) {
        for (const cert of data.certifications) {
          if (cert.name && cert.issuer && cert.issueDate) {
            await client.query(
              `INSERT INTO certifications (developer_id, name, issuer, issue_date, expiration_date, credential_id, credential_url)
               VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [
                developerId,
                cert.name,
                cert.issuer,
                cert.issueDate,
                cert.expirationDate || null,
                cert.credentialId || null,
                cert.credentialUrl || null,
              ]
            );
          }
        }
      }

      return { success: true };
    });
  }

  /**
   * Inquiries management
   */
  static async getInquiries(developerId: string) {
    const res = await query(
      `SELECT id, client_tag, subject, preview, message, status, created_at
       FROM inquiries
       WHERE developer_id = $1
       ORDER BY created_at DESC`,
      [developerId]
    );
    return res.rows;
  }

  static async sendInquiry(data: {
    developerId: string;
    clientId?: string;
    clientTag: string;
    subject: string;
    preview?: string;
    message: string;
  }) {
    const preview = data.preview || data.message.slice(0, 100);
    const res = await query(
      `INSERT INTO inquiries (developer_id, client_id, client_tag, subject, preview, message, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'NEW')
       RETURNING *`,
      [
        data.developerId,
        data.clientId || null,
        data.clientTag,
        data.subject,
        preview,
        data.message,
      ]
    );
    return res.rows[0];
  }
}
