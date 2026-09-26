import { query, withTransaction } from '../database/db.js';

export class DeveloperService {
  /**
   * Public directory of verified platform developers
   */
  static async getVerifiedDevelopers(filter?: { search?: string }) {
    let sql = `
      SELECT d.id, d.username, d.display_name, d.profile_image as avatar_url, d.bio, d.role_title,
             d.experience, d.availability, d.verification_status, d.github_url, d.linkedin_url,
             d.portfolio_url,
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
      completed_projects_count: parseInt(row.completed_projects_count, 10),
    }));
  }

  /**
   * Public developer portfolio page by username with attributed projects
   */
  static async getDeveloperByUsername(username: string) {
    const devRes = await query(
      `SELECT d.id, d.username, d.display_name, d.profile_image as avatar_url, d.bio, d.role_title,
              d.experience, d.availability, d.verification_status, d.verified_at,
              d.github_url, d.linkedin_url, d.portfolio_url
       FROM developers d
       WHERE d.username = $1 AND d.verification_status = 'VERIFIED'`,
      [username]
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

    // Fetch attributed completed projects
    const projectsRes = await query(
      `SELECT p.id, p.project_number, p.slug, p.title, p.description, p.category,
              p.timeline, p.required_technologies, pm.role as project_role
       FROM project_members pm
       JOIN projects p ON pm.project_id = p.id
       WHERE pm.developer_id = $1 AND p.status = 'PUBLISHED'
       ORDER BY p.created_at DESC`,
      [developer.id]
    );

    return {
      ...developer,
      skills: skillsRes.rows,
      attributedProjects: projectsRes.rows,
    };
  }

  /**
   * Developer's private dashboard overview (credits, active claims, proposals)
   */
  static async getDashboardOverview(developerId: string) {
    // 1. Credit balance
    const creditRes = await query(
      `SELECT balance, locked_balance FROM credit_accounts WHERE developer_id = $1`,
      [developerId]
    );
    const balance = creditRes.rows.length > 0 ? creditRes.rows[0].balance : 0;

    // 2. Active claims
    const claimsRes = await query(
      `SELECT pc.*, p.title, p.project_number, p.status as project_status
       FROM project_claims pc
       JOIN projects p ON pc.project_id = p.id
       WHERE pc.developer_id = $1
       ORDER BY pc.claimed_at DESC`,
      [developerId]
    );

    // 3. Completed projects
    const completedRes = await query(
      `SELECT COUNT(*) FROM project_members pm
       JOIN projects p ON pm.project_id = p.id
       WHERE pm.developer_id = $1 AND p.status = 'PUBLISHED'`,
      [developerId]
    );

    return {
      balance,
      activeClaimsCount: claimsRes.rows.filter((c) => c.status === 'CLAIMED').length,
      claims: claimsRes.rows,
      completedProjectsCount: parseInt(completedRes.rows[0].count, 10),
    };
  }

  /**
   * Update developer profile
   */
  static async updateProfile(
    developerId: string,
    data: {
      displayName?: string;
      roleTitle?: string;
      bio?: string;
      experience?: number;
      githubUrl?: string;
      linkedinUrl?: string;
      portfolioUrl?: string;
      skills?: string[];
    }
  ) {
    return withTransaction(async (client) => {
      await client.query(
        `UPDATE developers
         SET display_name = COALESCE($1, display_name),
             role_title = COALESCE($2, role_title),
             bio = COALESCE($3, bio),
             experience = COALESCE($4, experience),
             github_url = COALESCE($5, github_url),
             linkedin_url = COALESCE($6, linkedin_url),
             portfolio_url = COALESCE($7, portfolio_url),
             updated_at = NOW()
         WHERE id = $8`,
        [
          data.displayName || null,
          data.roleTitle || null,
          data.bio || null,
          data.experience !== undefined ? data.experience : null,
          data.githubUrl || null,
          data.linkedinUrl || null,
          data.portfolioUrl || null,
          developerId,
        ]
      );

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

      return { success: true };
    });
  }
}
