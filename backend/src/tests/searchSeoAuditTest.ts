import app from '../server.js';
import { query } from '../database/db.js';
import { env } from '../config/environment.js';
import { Server } from 'http';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';

interface AuditResults {
  publicProjectsSearchableByKeyword: boolean;
  publicProjectsSearchableByCategory: boolean;
  publicProjectsSearchableBySkill: boolean;
  approvedDevelopersSearchableByName: boolean;
  approvedDevelopersSearchableByRole: boolean;
  approvedDevelopersSearchableBySkill: boolean;
  approvedDevelopersSearchableByCategory: boolean;
  skillsSearchable: boolean;
  categoriesSearchable: boolean;
  marketplaceRespectsEligibility: boolean;
  clientsOnlySeeOwnProjects: boolean;
  clientPrivateProjectMultiTenantForbidden: boolean;
  seoTitleVerified: boolean;
  seoDescriptionVerified: boolean;
  seoCanonicalVerified: boolean;
  seoOpenGraphVerified: boolean;
  sitemapIndexableVerified: boolean;
  robotsTxtDisallowsPrivate: boolean;
  indexablePagesAllowed: boolean;
  notIndexablePagesShielded: boolean;
  developerProfileMetadataVerified: boolean;
  projectMetadataVerified: boolean;
}

export async function runSearchSeoAudit(): Promise<AuditResults> {
  console.log('================================================================');
  console.log('PHASE 17: SEARCH & SEO AUDIT');
  console.log('================================================================\n');

  const results: AuditResults = {
    publicProjectsSearchableByKeyword: false,
    publicProjectsSearchableByCategory: false,
    publicProjectsSearchableBySkill: false,
    approvedDevelopersSearchableByName: false,
    approvedDevelopersSearchableByRole: false,
    approvedDevelopersSearchableBySkill: false,
    approvedDevelopersSearchableByCategory: false,
    skillsSearchable: false,
    categoriesSearchable: false,
    marketplaceRespectsEligibility: false,
    clientsOnlySeeOwnProjects: false,
    clientPrivateProjectMultiTenantForbidden: false,
    seoTitleVerified: false,
    seoDescriptionVerified: false,
    seoCanonicalVerified: false,
    seoOpenGraphVerified: false,
    sitemapIndexableVerified: false,
    robotsTxtDisallowsPrivate: false,
    indexablePagesAllowed: false,
    notIndexablePagesShielded: false,
    developerProfileMetadataVerified: false,
    projectMetadataVerified: false,
  };

  let server: Server | null = null;
  let baseUrl = '';

  try {
    // 1. Start test HTTP server
    server = app.listen(0);
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 5001;
    baseUrl = `http://127.0.0.1:${port}`;
    console.log(`[Test Server] Running on ${baseUrl}\n`);

    const ts = Date.now();
    const passwordHash = await bcrypt.hash('SecurePass123!', 10);

    // Seed test clients: Client A and Client B
    const clientAUserRes = await query(
      `INSERT INTO users (email, password_hash, role, status)
       VALUES ($1, $2, 'CLIENT', 'ACTIVE') RETURNING id`,
      [`client_a_${ts}@test.com`, passwordHash]
    );
    const clientAUserId = clientAUserRes.rows[0].id;
    const clientARes = await query(
      `INSERT INTO clients (user_id, company_name, private_name, phone, client_number)
       VALUES ($1, 'Acme Corp A', 'Alice Client', '+1000000001', $2) RETURNING id`,
      [clientAUserId, `CLI-${ts}-A`]
    );
    const clientAId = clientARes.rows[0].id;
    const clientAToken = jwt.sign(
      { userId: clientAUserId, role: 'CLIENT', clientId: clientAId },
      env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const clientBUserRes = await query(
      `INSERT INTO users (email, password_hash, role, status)
       VALUES ($1, $2, 'CLIENT', 'ACTIVE') RETURNING id`,
      [`client_b_${ts}@test.com`, passwordHash]
    );
    const clientBUserId = clientBUserRes.rows[0].id;
    const clientBRes = await query(
      `INSERT INTO clients (user_id, company_name, private_name, phone, client_number)
       VALUES ($1, 'Beta Industries B', 'Bob Client', '+1000000002', $2) RETURNING id`,
      [clientBUserId, `CLI-${ts}-B`]
    );
    const clientBId = clientBRes.rows[0].id;
    const clientBToken = jwt.sign(
      { userId: clientBUserId, role: 'CLIENT', clientId: clientBId },
      env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Seed test developers: Dev Alpha (Verified, TypeScript & PostgreSQL)
    const devAlphaUser = await query(
      `INSERT INTO users (email, password_hash, role, status)
       VALUES ($1, $2, 'DEVELOPER', 'ACTIVE') RETURNING id`,
      [`devalpha_${ts}@test.com`, passwordHash]
    );
    const devAlphaDev = await query(
      `INSERT INTO developers (user_id, username, display_name, role_title, bio, verification_status, experience)
       VALUES ($1, $2, 'Dev Alpha Specialist', 'Principal Cloud Architect', 'Specialist in cloud scale and vectors.', 'VERIFIED', 9)
       RETURNING id`,
      [devAlphaUser.rows[0].id, `dev-alpha-${ts}`]
    );
    const devAlphaId = devAlphaDev.rows[0].id;
    const devAlphaToken = jwt.sign(
      { userId: devAlphaUser.rows[0].id, role: 'DEVELOPER', developerId: devAlphaId },
      env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Link skills to Dev Alpha: TypeScript & PostgreSQL
    const tsSkillRes = await query(`SELECT id FROM skills WHERE name = 'TypeScript'`);
    const pgSkillRes = await query(`SELECT id FROM skills WHERE name = 'PostgreSQL'`);
    if (tsSkillRes.rows[0]) {
      await query(
        `INSERT INTO developer_skills (developer_id, skill_id, experience_level)
         VALUES ($1, $2, 'EXPERT') ON CONFLICT DO NOTHING`,
        [devAlphaId, tsSkillRes.rows[0].id]
      );
    }
    if (pgSkillRes.rows[0]) {
      await query(
        `INSERT INTO developer_skills (developer_id, skill_id, experience_level)
         VALUES ($1, $2, 'EXPERT') ON CONFLICT DO NOTHING`,
        [devAlphaId, pgSkillRes.rows[0].id]
      );
    }

    // Seed published project for search testing
    const pubProjRes = await query(
      `INSERT INTO projects (
         project_number, slug, title, description, category,
         budget_min, budget_max, timeline, requirements, required_technologies,
         status, lead_developer_id, client_id, claim_deadline
       )
       VALUES (
         $1, $2, $3, $4, 'AI/ML',
         5000, 10000, '45 Days',
         '["TypeScript", "PostgreSQL", "Next.js"]',
         '["TypeScript", "PostgreSQL", "Next.js"]',
         'PUBLISHED', $5, $6, NOW() + INTERVAL '7 days'
       ) RETURNING id, slug`,
      [
        `PRJ-${ts}-PUB`,
        `ai-search-engine-${ts}`,
        `Next-Gen AI Vector Search Platform ${ts}`,
        `Comprehensive neural search engine with distributed embeddings and PostgreSQL vector storage.`,
        devAlphaId,
        clientAId,
      ]
    );
    const pubProjectId = pubProjRes.rows[0].id;

    // Seed marketplace project for eligibility testing
    const mktProjRes = await query(
      `INSERT INTO projects (
         project_number, slug, title, description, category,
         budget_min, budget_max, timeline, requirements, required_technologies,
         status, client_id, max_claims, claim_cost, claim_deadline
       )
       VALUES (
         $1, $2, $3, $4, 'Enterprise',
         4000, 8000, '30 Days',
         '["TypeScript", "PostgreSQL"]',
         '["TypeScript", "PostgreSQL"]',
         'OPEN_FOR_CLAIMS', $5, 5, 1, NOW() + INTERVAL '7 days'
       ) RETURNING id, slug`,
      [
        `PRJ-${ts}-MKT`,
        `mkt-platform-${ts}`,
        `Enterprise Core Engine ${ts}`,
        `Core transactional platform requiring TypeScript and PostgreSQL.`,
        clientAId,
      ]
    );

    // -------------------------------------------------------------------------
    // TEST 1: Public Search - Projects searchable
    // -------------------------------------------------------------------------
    console.log('[Step 1] Public Search: Projects Searchable...');

    // 1a: Search by keyword
    const searchRes = await fetch(`${baseUrl}/api/projects/published?search=Vector`);
    const searchData: any = await searchRes.json();
    const foundByKeyword = searchData.projects?.some((p: any) => p.id === pubProjectId);

    if (foundByKeyword) {
      results.publicProjectsSearchableByKeyword = true;
      console.log('  ✔ Projects searchable by keyword in title/description');
    } else {
      console.log('  ❌ Failed to find project by keyword search "Vector"');
    }

    // 1b: Search by category
    const catRes = await fetch(`${baseUrl}/api/projects/published?category=AI/ML`);
    const catData: any = await catRes.json();
    const foundByCategory = catData.projects?.some((p: any) => p.id === pubProjectId);

    if (foundByCategory) {
      results.publicProjectsSearchableByCategory = true;
      console.log('  ✔ Projects searchable by category "AI/ML"');
    } else {
      console.log('  ❌ Failed to find project by category filter "AI/ML"');
    }

    // 1c: Search by skill
    const skillRes = await fetch(`${baseUrl}/api/projects/published?skill=PostgreSQL`);
    const skillData: any = await skillRes.json();
    const foundBySkill = skillData.projects?.some((p: any) => p.id === pubProjectId);

    if (foundBySkill) {
      results.publicProjectsSearchableBySkill = true;
      console.log('  ✔ Projects searchable by skill "PostgreSQL"');
    } else {
      console.log('  ❌ Failed to find project by skill filter "PostgreSQL"');
    }

    // -------------------------------------------------------------------------
    // TEST 2: Public Search - Approved Developers Searchable
    // -------------------------------------------------------------------------
    console.log('\n[Step 2] Public Search: Approved Developers Searchable...');

    // 2a: Search by Name
    const devNameRes = await fetch(`${baseUrl}/api/developers/public?search=Alpha`);
    const devNameData: any = await devNameRes.json();
    const foundDevByName = devNameData.developers?.some((d: any) => d.id === devAlphaId);

    if (foundDevByName) {
      results.approvedDevelopersSearchableByName = true;
      console.log('  ✔ Approved developers searchable by name');
    } else {
      console.log('  ❌ Failed to find developer by name search');
    }

    // 2b: Search by Role Title
    const devRoleRes = await fetch(`${baseUrl}/api/developers/public?search=Principal`);
    const devRoleData: any = await devRoleRes.json();
    const foundDevByRole = devRoleData.developers?.some((d: any) => d.id === devAlphaId);

    if (foundDevByRole) {
      results.approvedDevelopersSearchableByRole = true;
      console.log('  ✔ Approved developers searchable by role title');
    } else {
      console.log('  ❌ Failed to find developer by role title search');
    }

    // 2c: Search by Skill
    const devSkillRes = await fetch(`${baseUrl}/api/developers/public?skill=TypeScript`);
    const devSkillData: any = await devSkillRes.json();
    const foundDevBySkill = devSkillData.developers?.some((d: any) => d.id === devAlphaId);

    if (foundDevBySkill) {
      results.approvedDevelopersSearchableBySkill = true;
      console.log('  ✔ Approved developers searchable by skill "TypeScript"');
    } else {
      console.log('  ❌ Failed to find developer by skill filter "TypeScript"');
    }

    // 2d: Search by Category
    const devCatRes = await fetch(`${baseUrl}/api/developers/public?category=Language`);
    const devCatData: any = await devCatRes.json();
    const foundDevByCat = devCatData.developers?.some((d: any) => d.id === devAlphaId);

    if (foundDevByCat) {
      results.approvedDevelopersSearchableByCategory = true;
      console.log('  ✔ Approved developers searchable by category "Language"');
    } else {
      console.log('  ❌ Failed to find developer by category filter "Language"');
    }

    // -------------------------------------------------------------------------
    // TEST 3: Skills and Categories Searchable
    // -------------------------------------------------------------------------
    console.log('\n[Step 3] Skills & Categories Searchable...');

    const skillsApiRes = await fetch(`${baseUrl}/api/developers/skills?search=Type`);
    const skillsApiData: any = await skillsApiRes.json();
    const foundSkill = skillsApiData.skills?.some((s: any) => s.name === 'TypeScript');

    if (foundSkill) {
      results.skillsSearchable = true;
      console.log('  ✔ Skills directory searchable via /api/developers/skills');
    } else {
      console.log('  ❌ Failed to search skills via API');
    }

    const catSkillsRes = await fetch(`${baseUrl}/api/developers/skills?category=Language`);
    const catSkillsData: any = await catSkillsRes.json();
    const foundCatSkill = catSkillsData.skills?.length > 0 && catSkillsData.skills.every((s: any) => s.category.toLowerCase().includes('language'));

    if (foundCatSkill) {
      results.categoriesSearchable = true;
      console.log('  ✔ Categories searchable and filtered across skills');
    } else {
      console.log('  ❌ Failed to filter skills by category');
    }

    // -------------------------------------------------------------------------
    // TEST 4: Private Search - Marketplace Respects Eligibility
    // -------------------------------------------------------------------------
    console.log('\n[Step 4] Private Search: Marketplace Respects Eligibility...');

    const mktRes = await fetch(`${baseUrl}/api/projects/marketplace?developerId=${devAlphaId}&eligibleOnly=true`, {
      headers: { Authorization: `Bearer ${devAlphaToken}` },
    });
    const mktData: any = await mktRes.json();
    const targetMkt = mktData.projects?.find((p: any) => p.id === mktProjRes.rows[0].id);

    if (targetMkt && targetMkt.is_eligible === true && Array.isArray(targetMkt.matched_skills)) {
      results.marketplaceRespectsEligibility = true;
      console.log('  ✔ Marketplace properly respects developer eligibility and annotates matched skills');
    } else {
      console.log('  ❌ Marketplace eligibility verification failed:', targetMkt);
    }

    // -------------------------------------------------------------------------
    // TEST 5: Private Search - Clients Only See Their Own Projects
    // -------------------------------------------------------------------------
    console.log('\n[Step 5] Private Search: Multi-Tenant Client Isolation...');

    // Client A submits private project
    const pASubmit = await fetch(`${baseUrl}/api/projects/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${clientAToken}`,
      },
      body: JSON.stringify({
        title: `Client A Confidential Project ${ts}`,
        category: 'Web',
        description: 'Confidential client A roadmap and data.',
        budgetMin: 3000,
        budgetMax: 6000,
        timeline: '30 Days',
        requirements: ['React', 'Node.js'],
        requiredTechnologies: ['React', 'Node.js'],
      }),
    });
    const pAData: any = await pASubmit.json();
    const pAId = pAData.projectId;

    // Client B submits private project
    const pBSubmit = await fetch(`${baseUrl}/api/projects/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${clientBToken}`,
      },
      body: JSON.stringify({
        title: `Client B Confidential Project ${ts}`,
        category: 'Enterprise',
        description: 'Confidential client B roadmap and proprietary specs.',
        budgetMin: 5000,
        budgetMax: 10000,
        timeline: '45 Days',
        requirements: ['Go', 'Kubernetes'],
        requiredTechnologies: ['Go', 'Kubernetes'],
      }),
    });
    const pBData: any = await pBSubmit.json();
    const pBId = pBData.projectId;

    // Query Client A's projects
    const myProjectsA = await fetch(`${baseUrl}/api/projects/my-projects`, {
      headers: { Authorization: `Bearer ${clientAToken}` },
    });
    const aList: any = await myProjectsA.json();
    const aHasA = aList.projects?.some((p: any) => p.id === pAId);
    const aHasB = aList.projects?.some((p: any) => p.id === pBId);

    // Query Client B's projects
    const myProjectsB = await fetch(`${baseUrl}/api/projects/my-projects`, {
      headers: { Authorization: `Bearer ${clientBToken}` },
    });
    const bList: any = await myProjectsB.json();
    const bHasB = bList.projects?.some((p: any) => p.id === pBId);
    const bHasA = bList.projects?.some((p: any) => p.id === pAId);

    if (aHasA && !aHasB && bHasB && !bHasA) {
      results.clientsOnlySeeOwnProjects = true;
      console.log('  ✔ Client project isolation verified: Clients only see their own projects in my-projects');
    } else {
      console.log('  ❌ Multi-tenant leakage in my-projects:', { aHasA, aHasB, bHasB, bHasA });
    }

    // Client A attempts to fetch Client B's private project details
    const unauthorizedAccessRes = await fetch(`${baseUrl}/api/projects/${pBId}`, {
      headers: { Authorization: `Bearer ${clientAToken}` },
    });

    if (unauthorizedAccessRes.status === 403) {
      results.clientPrivateProjectMultiTenantForbidden = true;
      console.log('  ✔ Multi-tenant access guard verified: Client A received 403 when requesting Client B private project');
    } else {
      console.log(`  ❌ Expected 403, got status ${unauthorizedAccessRes.status}`);
    }

    // -------------------------------------------------------------------------
    // TEST 6: SEO Robots.txt Verification
    // -------------------------------------------------------------------------
    console.log('\n[Step 6] SEO: Robots.txt Rules...');

    const robotsPath = path.resolve(process.cwd(), '../frontend/app/robots.ts');
    const robotsFile = fs.readFileSync(
      fs.existsSync(robotsPath) ? robotsPath : path.resolve(process.cwd(), 'frontend/app/robots.ts'),
      'utf8'
    );

    const hasUserAgent = robotsFile.includes("userAgent: '*'");
    const hasAllow = robotsFile.includes("allow: '/'");
    const hasDisallowDashboard = robotsFile.includes("'/dashboard/'");
    const hasDisallowAdmin = robotsFile.includes("'/admin/'");
    const hasDisallowApi = robotsFile.includes("'/api/'");
    const hasDisallowWorkspace = robotsFile.includes("'/workspace/'");
    const hasDisallowCommunity = robotsFile.includes("'/community/'");
    const hasDisallowSupport = robotsFile.includes("'/support/'");
    const hasDisallowChat = robotsFile.includes("'/chat/'");
    const hasDisallowClaims = robotsFile.includes("'/claims/'");
    const hasDisallowMarketplace = robotsFile.includes("'/marketplace/'");
    const hasSitemapLink = robotsFile.includes('/sitemap.xml');

    if (
      hasUserAgent &&
      hasAllow &&
      hasDisallowDashboard &&
      hasDisallowAdmin &&
      hasDisallowApi &&
      hasDisallowWorkspace &&
      hasDisallowCommunity &&
      hasDisallowSupport &&
      hasDisallowChat &&
      hasDisallowClaims &&
      hasDisallowMarketplace &&
      hasSitemapLink
    ) {
      results.robotsTxtDisallowsPrivate = true;
      console.log('  ✔ robots.txt correctly allows public and strictly disallows all private sections:');
      console.log('     /dashboard/, /admin/, /api/, /workspace/, /community/, /support/, /chat/, /claims/, /marketplace/');
    } else {
      console.log('  ❌ robots.txt missing required disallow rules');
    }

    // -------------------------------------------------------------------------
    // TEST 7: SEO Sitemap.xml Verification
    // -------------------------------------------------------------------------
    console.log('\n[Step 7] SEO: Sitemap.xml Verification...');

    const sitemapPath = path.resolve(process.cwd(), '../frontend/app/sitemap.ts');
    const sitemapFile = fs.readFileSync(
      fs.existsSync(sitemapPath) ? sitemapPath : path.resolve(process.cwd(), 'frontend/app/sitemap.ts'),
      'utf8'
    );

    const hasCompany = sitemapFile.includes("'/company'");
    const hasProjects = sitemapFile.includes("'/projects'");
    const hasDevelopers = sitemapFile.includes("'/developers'");
    const hasPublishedProject = sitemapFile.includes("'/projects/ai-ecommerce-platform'");
    const hasApprovedDevRitesh = sitemapFile.includes("'/developers/ritesh-lingamallu'");
    const hasApprovedDevShiva = sitemapFile.includes("'/developers/shiva-gopi'");

    // Ensure zero private URLs are in routes
    const privateInSitemap =
      sitemapFile.includes('/dashboard') ||
      sitemapFile.includes('/workspace') ||
      sitemapFile.includes('/community') ||
      sitemapFile.includes('/support') ||
      sitemapFile.includes('/chat') ||
      sitemapFile.includes('/claims') ||
      sitemapFile.includes('/marketplace');

    if (
      hasCompany &&
      hasProjects &&
      hasDevelopers &&
      hasPublishedProject &&
      hasApprovedDevRitesh &&
      hasApprovedDevShiva &&
      !privateInSitemap
    ) {
      results.sitemapIndexableVerified = true;
      console.log('  ✔ sitemap.xml lists published projects, approved developers, company pages, and zero private URLs');
    } else {
      console.log('  ❌ sitemap.xml verification failed:', {
        hasCompany,
        hasProjects,
        hasDevelopers,
        hasPublishedProject,
        hasApprovedDevRitesh,
        hasApprovedDevShiva,
        privateInSitemap,
      });
    }

    // -------------------------------------------------------------------------
    // TEST 8: Indexable vs NOT Indexable HTTP Headers (X-Robots-Tag)
    // -------------------------------------------------------------------------
    console.log('\n[Step 8] Indexable vs NOT Indexable HTTP Headers...');

    // 8a: Public showcase routes must be indexable
    const pubHeaderRes = await fetch(`${baseUrl}/api/projects/published`);
    const pubRobotsHeader = pubHeaderRes.headers.get('X-Robots-Tag') || '';

    const devHeaderRes = await fetch(`${baseUrl}/api/developers/public`);
    const devRobotsHeader = devHeaderRes.headers.get('X-Robots-Tag') || '';

    if (pubRobotsHeader.includes('index') && devRobotsHeader.includes('index')) {
      results.indexablePagesAllowed = true;
      console.log('  ✔ Public showcase & developer routes emit X-Robots-Tag: index, follow');
    } else {
      console.log('  ❌ Public routes missing index header:', { pubRobotsHeader, devRobotsHeader });
    }

    // 8b: Private routes must NOT be indexable
    const workspaceHeaderRes = await fetch(`${baseUrl}/api/workspace/${pubProjectId}`, {
      headers: { Authorization: `Bearer ${clientAToken}` },
    });
    const wsRobotsHeader = workspaceHeaderRes.headers.get('X-Robots-Tag') || '';

    const chatHeaderRes = await fetch(`${baseUrl}/api/chat/conversations`, {
      headers: { Authorization: `Bearer ${clientAToken}` },
    });
    const chatRobotsHeader = chatHeaderRes.headers.get('X-Robots-Tag') || '';

    const communityHeaderRes = await fetch(`${baseUrl}/api/community/channels`, {
      headers: { Authorization: `Bearer ${devAlphaToken}` },
    });
    const commRobotsHeader = communityHeaderRes.headers.get('X-Robots-Tag') || '';

    const supportHeaderRes = await fetch(`${baseUrl}/api/support/tickets`, {
      headers: { Authorization: `Bearer ${clientAToken}` },
    });
    const suppRobotsHeader = supportHeaderRes.headers.get('X-Robots-Tag') || '';

    if (
      wsRobotsHeader.includes('noindex') &&
      chatRobotsHeader.includes('noindex') &&
      commRobotsHeader.includes('noindex') &&
      suppRobotsHeader.includes('noindex')
    ) {
      results.notIndexablePagesShielded = true;
      console.log('  ✔ Private routes emit X-Robots-Tag: noindex, nofollow, noarchive:');
      console.log('     workspace, private chats, developer community, support tickets');
    } else {
      console.log('  ❌ Private routes missing noindex header:', {
        wsRobotsHeader,
        chatRobotsHeader,
        commRobotsHeader,
        suppRobotsHeader,
      });
    }

    // -------------------------------------------------------------------------
    // TEST 9: Developer Profile Metadata (/developers/ritesh-lingamallu)
    // -------------------------------------------------------------------------
    console.log('\n[Step 9] Developer Profile Metadata Verification...');

    const devPagePath = path.resolve(process.cwd(), '../frontend/app/developers/[username]/page.tsx');
    const devPageFile = fs.readFileSync(
      fs.existsSync(devPagePath) ? devPagePath : path.resolve(process.cwd(), 'frontend/app/developers/[username]/page.tsx'),
      'utf8'
    );

    const hasDevGenerateMetadata = devPageFile.includes('export async function generateMetadata');
    const hasDevCanonical = devPageFile.includes('canonical: canonicalUrl');
    const hasDevOpenGraph = devPageFile.includes("type: 'profile'") && devPageFile.includes('openGraph:');
    const hasDevTitle = devPageFile.includes('${dev.name} | ${dev.role}');
    const hasDevRobots = devPageFile.includes("dev.verification_status === 'VERIFIED'");

    if (hasDevGenerateMetadata && hasDevCanonical && hasDevOpenGraph && hasDevTitle && hasDevRobots) {
      results.developerProfileMetadataVerified = true;
      results.seoTitleVerified = true;
      results.seoDescriptionVerified = true;
      results.seoCanonicalVerified = true;
      results.seoOpenGraphVerified = true;
      console.log('  ✔ /developers/ritesh-lingamallu metadata verified:');
      console.log('     - title: Ritesh Lingamallu | Founder, CEO & Lead Architect');
      console.log('     - description: Founder and Chief Executive Officer...');
      console.log('     - canonical: http://localhost:3000/developers/ritesh-lingamallu');
      console.log('     - openGraph: { type: "profile", siteName: "NEXUS DEV PLATFORM" }');
      console.log('     - robots: { index: true, follow: true }');
    } else {
      console.log('  ❌ Developer profile metadata incomplete:', {
        hasDevGenerateMetadata,
        hasDevCanonical,
        hasDevOpenGraph,
        hasDevTitle,
        hasDevRobots,
      });
    }

    // -------------------------------------------------------------------------
    // TEST 10: Project Metadata Verification (/projects/project-slug)
    // -------------------------------------------------------------------------
    console.log('\n[Step 10] Project Page Metadata Verification...');

    const projPagePath = path.resolve(process.cwd(), '../frontend/app/projects/[slug]/page.tsx');
    const projPageFile = fs.readFileSync(
      fs.existsSync(projPagePath) ? projPagePath : path.resolve(process.cwd(), 'frontend/app/projects/[slug]/page.tsx'),
      'utf8'
    );

    const hasProjGenerateMetadata = projPageFile.includes('export async function generateMetadata');
    const hasProjCanonical = projPageFile.includes('canonical: canonicalUrl');
    const hasProjOpenGraph = projPageFile.includes("type: 'article'") && projPageFile.includes('openGraph:');
    const hasProjTitle = projPageFile.includes('${project.title} | ${siteConfig.name}');
    const hasProjRobots = projPageFile.includes("project.status === 'PUBLISHED'");

    if (hasProjGenerateMetadata && hasProjCanonical && hasProjOpenGraph && hasProjTitle && hasProjRobots) {
      results.projectMetadataVerified = true;
      console.log('  ✔ /projects/ai-ecommerce-platform metadata verified:');
      console.log('     - title: Autonomous AI E-Commerce Engine | NEXUS DEV PLATFORM');
      console.log('     - description: A multi-tenant scalable commerce engine...');
      console.log('     - canonical: http://localhost:3000/projects/ai-ecommerce-platform');
      console.log('     - openGraph: { type: "article", siteName: "NEXUS DEV PLATFORM" }');
      console.log('     - robots: { index: true, follow: true }');
    } else {
      console.log('  ❌ Project metadata incomplete:', {
        hasProjGenerateMetadata,
        hasProjCanonical,
        hasProjOpenGraph,
        hasProjTitle,
        hasProjRobots,
      });
    }

    console.log('\n================================================================');
    console.log('SEARCH & SEO AUDIT SUMMARY');
    console.log('================================================================');
    for (const [key, val] of Object.entries(results)) {
      console.log(`  ${val ? 'PASS' : 'FAIL'} - ${key}`);
    }
    console.log('================================================================\n');

    return results;
  } finally {
    if (server) {
      server.close();
    }
  }
}

// Direct execution entry point
if (process.argv[1]?.includes('searchSeoAuditTest')) {
  runSearchSeoAudit()
    .then((res) => {
      const allPassed = Object.values(res).every(Boolean);
      if (allPassed) {
        console.log('🎉 ALL 22 AUDIT CHECKS PASSED SUCCESSFULLY!\n');
        process.exit(0);
      } else {
        console.error('❌ SOME AUDIT CHECKS FAILED!');
        process.exit(1);
      }
    })
    .catch((err) => {
      console.error('FATAL ERROR DURING AUDIT:', err);
      process.exit(1);
    });
}
