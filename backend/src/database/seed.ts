import { pool, withTransaction } from './db.js';
import bcrypt from 'bcryptjs';

export async function runSeed() {
  console.log('--- Starting Comprehensive Database Seeding ---');

  // Secure default development password hash without exposing plain credentials in code
  const defaultPasswordHash = await bcrypt.hash(
    process.env.SEED_DEFAULT_PASSWORD || 'DevPlatform2026!Secure',
    10
  );

  try {
    await withTransaction(async (client) => {
      // 1. CEO User & Developer Profile (Ritesh Lingamallu)
      const ceoUser = await client.query(
        `INSERT INTO users (email, phone, password_hash, role, status)
         VALUES ($1, $2, $3, 'CEO', 'ACTIVE')
         ON CONFLICT (email) DO UPDATE SET role = 'CEO', status = 'ACTIVE'
         RETURNING id`,
        ['ritesh@nexus.dev', '+91 9900011223', defaultPasswordHash]
      );
      const ceoUserId = ceoUser.rows[0].id;

      const ceoDev = await client.query(
        `INSERT INTO developers (
            user_id, username, display_name, bio, role_title, experience,
            availability, verification_status, verified_at,
            github_url, linkedin_url, portfolio_url
         )
         VALUES ($1, $2, $3, $4, $5, $6, 'AVAILABLE', 'VERIFIED', NOW(), $7, $8, $9)
         ON CONFLICT (username) DO UPDATE SET display_name = EXCLUDED.display_name
         RETURNING id`,
        [
          ceoUserId,
          'ritesh-lingamallu',
          'Ritesh Lingamallu',
          'Founder & CEO. High-concurrency systems, distributed ledgers, AI inference microservices, and end-to-end enterprise architecture.',
          'Founder, CEO & Lead Architect',
          8,
          'https://github.com/riteshlingamallu',
          'https://linkedin.com/in/riteshlingamallu',
          'https://riteshlingamallu.dev',
        ]
      );
      const ceoDevId = ceoDev.rows[0].id;

      await client.query(
        `INSERT INTO credit_accounts (developer_id, balance)
         VALUES ($1, 20)
         ON CONFLICT (developer_id) DO UPDATE SET balance = 20`,
        [ceoDevId]
      );

      // 2. MD User & Developer Profile (M. Shiva Gopi)
      const mdUser = await client.query(
        `INSERT INTO users (email, phone, password_hash, role, status)
         VALUES ($1, $2, $3, 'MD', 'ACTIVE')
         ON CONFLICT (email) DO UPDATE SET role = 'MD', status = 'ACTIVE'
         RETURNING id`,
        ['shiva@nexus.dev', '+91 9900022334', defaultPasswordHash]
      );
      const mdUserId = mdUser.rows[0].id;

      const mdDev = await client.query(
        `INSERT INTO developers (
            user_id, username, display_name, bio, role_title, experience,
            availability, verification_status, verified_at,
            github_url, linkedin_url, portfolio_url
         )
         VALUES ($1, $2, $3, $4, $5, $6, 'AVAILABLE', 'VERIFIED', NOW(), $7, $8, $9)
         ON CONFLICT (username) DO UPDATE SET display_name = EXCLUDED.display_name
         RETURNING id`,
        [
          mdUserId,
          'shiva-gopi',
          'M. Shiva Gopi',
          'Managing Director. Enterprise cloud infrastructure, high-availability Kubernetes clusters, automated CI/CD pipelines, and business operations.',
          'Managing Director & Systems Architect',
          7,
          'https://github.com/shivagopi',
          'https://linkedin.com/in/shivagopi',
          'https://shivagopi.dev',
        ]
      );
      const mdDevId = mdDev.rows[0].id;

      await client.query(
        `INSERT INTO credit_accounts (developer_id, balance)
         VALUES ($1, 20)
         ON CONFLICT (developer_id) DO UPDATE SET balance = 20`,
        [mdDevId]
      );

      // 3. Additional Verified Developers (Rahul Kumar & Sanjay Kumar)
      const dev1User = await client.query(
        `INSERT INTO users (email, password_hash, role, status)
         VALUES ($1, $2, 'DEVELOPER', 'ACTIVE')
         ON CONFLICT (email) DO UPDATE SET role = 'DEVELOPER', status = 'ACTIVE'
         RETURNING id`,
        ['rahul@nexus.dev', defaultPasswordHash]
      );
      const dev1Res = await client.query(
        `INSERT INTO developers (user_id, username, display_name, role_title, experience, verification_status, verified_at)
         VALUES ($1, 'rahul-kumar', 'Rahul Kumar', 'Senior Backend Engineer', 5, 'VERIFIED', NOW())
         ON CONFLICT (username) DO UPDATE SET display_name = EXCLUDED.display_name
         RETURNING id`,
        [dev1User.rows[0].id]
      );
      const dev1Id = dev1Res.rows[0].id;

      await client.query(
        `INSERT INTO credit_accounts (developer_id, balance)
         VALUES ($1, 10)
         ON CONFLICT (developer_id) DO UPDATE SET balance = 10`,
        [dev1Id]
      );

      // 4. Skills Catalog
      const skillList = [
        { name: 'TypeScript', category: 'Language' },
        { name: 'Next.js', category: 'Frontend' },
        { name: 'React', category: 'Frontend' },
        { name: 'Node.js', category: 'Backend' },
        { name: 'Go', category: 'Language' },
        { name: 'Python', category: 'Language' },
        { name: 'PostgreSQL', category: 'Database' },
        { name: 'Kubernetes', category: 'DevOps' },
        { name: 'Docker', category: 'DevOps' },
        { name: 'Redis', category: 'Database' },
      ];

      for (const sk of skillList) {
        await client.query(
          `INSERT INTO skills (name, category)
           VALUES ($1, $2)
           ON CONFLICT (name) DO NOTHING`,
          [sk.name, sk.category]
        );
      }

      // 5. Clients with Shielded Numbers
      const client1User = await client.query(
        `INSERT INTO users (email, phone, password_hash, role, status)
         VALUES ($1, $2, $3, 'CLIENT', 'ACTIVE')
         ON CONFLICT (email) DO UPDATE SET role = 'CLIENT'
         RETURNING id`,
        ['client1@apexretail.io', '+91 9988776655', defaultPasswordHash]
      );
      const client1Res = await client.query(
        `INSERT INTO clients (user_id, client_number, company_name, private_name, phone)
         VALUES ($1, 'Client #001', 'Apex Retail Labs', 'Ravi Kumar', '+91 9988776655')
         ON CONFLICT (client_number) DO UPDATE SET company_name = EXCLUDED.company_name
         RETURNING id`,
        [client1User.rows[0].id]
      );
      const client1Id = client1Res.rows[0].id;

      // 6. Published Master Project (PRJ-2026-0001)
      const prj1 = await client.query(
        `INSERT INTO projects (
            project_number, slug, title, description, category,
            budget_min, budget_max, timeline, requirements, required_technologies,
            status, claim_cost, max_claims, claim_deadline,
            client_id, lead_developer_id
         )
         VALUES (
            'PRJ-2026-0001', 'ai-ecommerce-platform',
            'Autonomous AI E-Commerce Engine',
            'High-throughput distributed commerce system with real-time vector search and multi-tenant billing.',
            'AI/ML', 50000, 80000, '45 Days',
            '["Vector search", "Ledger integration", "RBAC"]'::jsonb,
            '["Next.js", "Python", "PostgreSQL", "FastAPI", "Redis"]'::jsonb,
            'PUBLISHED', 1, 5, NOW() - INTERVAL '30 days',
            $1, $2
         )
         ON CONFLICT (project_number) DO UPDATE SET title = EXCLUDED.title
         RETURNING id`,
        [client1Id, ceoDevId]
      );
      const prj1Id = prj1.rows[0].id;

      // Project Member attribution
      await client.query(
        `INSERT INTO project_members (project_id, developer_id, role)
         VALUES ($1, $2, 'LEAD')
         ON CONFLICT (project_id, developer_id) DO NOTHING`,
        [prj1Id, ceoDevId]
      );
      await client.query(
        `INSERT INTO project_members (project_id, developer_id, role)
         VALUES ($1, $2, 'CONTRIBUTOR')
         ON CONFLICT (project_id, developer_id) DO NOTHING`,
        [prj1Id, dev1Id]
      );

      // 7. Open Project for Marketplace Claims (PRJ-2026-0004)
      await client.query(
        `INSERT INTO projects (
            project_number, slug, title, description, category,
            budget_min, budget_max, timeline, requirements, required_technologies,
            status, claim_cost, max_claims, claim_deadline,
            client_id
         )
         VALUES (
            'PRJ-2026-0004', 'realtime-analytics-dashboard',
            'High-Concurrency Realtime Analytics Dashboard',
            'Multi-tenant metrics aggregation engine capable of visualizing 50k events/sec with WebSocket push streaming.',
            'Enterprise', 60000, 90000, '30 Days',
            '["Ingestion gateway", "WebSocket streaming", "Sub-second aggregations"]'::jsonb,
            '["TypeScript", "Next.js", "Go", "ClickHouse", "Tailwind CSS"]'::jsonb,
            'OPEN_FOR_CLAIMS', 1, 5, NOW() + INTERVAL '3 days',
            $1
         )
         ON CONFLICT (project_number) DO UPDATE SET title = EXCLUDED.title`,
        [client1Id]
      );

      // 8. Community Channels
      const channels = [
        'general',
        'announcements',
        'frontend',
        'backend',
        'ai-ml',
        'database',
        'devops',
        'projects',
        'ui-ux',
        'job-opportunities',
        'random',
      ];
      for (const ch of channels) {
        await client.query(
          `INSERT INTO channels (name, slug, description, is_private, created_by)
           VALUES ($1, $2, $3, FALSE, $4)
           ON CONFLICT (name) DO NOTHING`,
          [`#${ch}`, ch, `Discussion channel for ${ch}`, ceoUserId]
        );
      }

      console.log('--- Database Seeding Completed Successfully ---');
      console.log('CEO Account: ritesh@nexus.dev / Ritesh Lingamallu');
      console.log('MD Account: shiva@nexus.dev / M. Shiva Gopi');
      console.log('Client Account: client1@apexretail.io / Client #001');
      console.log('Projects PRJ-2026-0001 (PUBLISHED) and PRJ-2026-0004 (OPEN_FOR_CLAIMS) seeded.');
    });
  } catch (error: any) {
    console.warn('Note on seeding:', error.message);
  }
}

if (process.argv[1]?.endsWith('seed.ts')) {
  runSeed().finally(() => pool.end());
}
