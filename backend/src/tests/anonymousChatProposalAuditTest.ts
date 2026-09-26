import app from '../server.js';
import { query } from '../database/db.js';
import { env } from '../config/environment.js';
import { DeveloperService } from '../services/developerService.js';
import { ChatService } from '../services/chatService.js';
import jwt from 'jsonwebtoken';
import { Server } from 'http';
import bcrypt from 'bcryptjs';

interface AuditResults {
  anonymousIdentity: boolean;
  conversationIsolation: boolean;
  realtime: boolean;
  proposal: boolean;
  authorization: boolean;
  closedChat: boolean;
}

export async function runAnonymousChatProposalAudit(): Promise<AuditResults> {
  console.log('================================================================');
  console.log('PHASE 8: ANONYMOUS CHAT & PROPOSAL AUDIT');
  console.log('================================================================\n');

  let server: Server | null = null;
  let baseUrl = '';

  const results: AuditResults = {
    anonymousIdentity: false,
    conversationIsolation: false,
    realtime: false,
    proposal: false,
    authorization: false,
    closedChat: false,
  };

  try {
    // 0. Start live test server
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const port = (server?.address() as any).port;
        baseUrl = `http://127.0.0.1:${port}`;
        console.log(`[Audit Harness] Live test server listening at ${baseUrl}`);
        resolve();
      });
    });

    const suffix = `chat_${Date.now()}`;
    const pwdHash = await bcrypt.hash('AuditedPassword2026!', 8);

    // -------------------------------------------------------------------------
    // SETUP: CLIENT #001 AND PROJECT #0001
    // -------------------------------------------------------------------------
    console.log('[Setup] Setting up Client #001 and Project #0001...');

    const clientRes = await query("SELECT id, user_id FROM clients WHERE client_number = 'Client #001' LIMIT 1");
    let clientId = '';
    let clientUserId = '';
    if (clientRes.rows.length === 0) {
      const uRes = await query(
        "INSERT INTO users (email, password_hash, role, status) VALUES ('client001@apexretail.io', $1, 'CLIENT', 'ACTIVE') RETURNING id",
        [pwdHash]
      );
      clientUserId = uRes.rows[0].id;
      const cRes = await query(
        "INSERT INTO clients (user_id, client_number, company_name, private_name, phone) VALUES ($1, 'Client #001', 'Apex Retail Labs', 'Ravi Kumar', '+91 9988776655') RETURNING id",
        [clientUserId]
      );
      clientId = cRes.rows[0].id;
    } else {
      clientId = clientRes.rows[0].id;
      clientUserId = clientRes.rows[0].user_id;
    }

    const clientToken = jwt.sign(
      { userId: clientUserId, email: 'client001@apexretail.io', role: 'CLIENT', clientId },
      env.JWT_SECRET,
      { expiresIn: '2h' }
    );

    // Check or create Project #0001
    const projectNumber = 'PRJ-2026-0001';
    const projectRes = await query("SELECT id FROM projects WHERE project_number = 'PRJ-2026-0001' LIMIT 1");
    let projectId = '';

    if (projectRes.rows.length === 0) {
      const pRes = await query(
        `INSERT INTO projects (
           project_number, slug, title, description, category,
           budget_min, budget_max, timeline, requirements, required_technologies,
           status, claim_cost, max_claims, claim_deadline, client_id
         ) VALUES (
           'PRJ-2026-0001', $1, 'Autonomous AI E-Commerce Engine',
           'High-throughput distributed commerce system with real-time vector search and multi-tenant billing.',
           'Full-Stack Development', 50000, 80000, '30–45 days',
           '["React", "Node.js", "PostgreSQL"]'::jsonb,
           '["React", "Node.js", "PostgreSQL"]'::jsonb,
           'OPEN_FOR_CLAIMS', 1, 3, NOW() + INTERVAL '14 days', $2
         ) RETURNING id`,
        [`autonomous-ai-ecommerce-${suffix}`, clientId]
      );
      projectId = pRes.rows[0].id;
    } else {
      projectId = projectRes.rows[0].id;
      // Clean up previous claims and conversations for clean test execution
      await query('DELETE FROM proposals WHERE project_claim_id IN (SELECT id FROM project_claims WHERE project_id = $1)', [projectId]);
      await query('DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE project_id = $1)', [projectId]);
      await query('DELETE FROM conversation_members WHERE conversation_id IN (SELECT id FROM conversations WHERE project_id = $1)', [projectId]);
      await query('DELETE FROM conversations WHERE project_id = $1', [projectId]);
      await query('DELETE FROM project_claims WHERE project_id = $1', [projectId]);
      await query(
        `UPDATE projects
         SET status = 'OPEN_FOR_CLAIMS', max_claims = 3, claim_cost = 1,
             lead_developer_id = NULL,
             requirements = '["React", "Node.js", "PostgreSQL"]'::jsonb,
             required_technologies = '["React", "Node.js", "PostgreSQL"]'::jsonb
         WHERE id = $1`,
        [projectId]
      );
    }

    console.log(`  ✔ Client #001 initialized (Client ID: ${clientId})`);
    console.log(`  ✔ Project #0001 initialized (Project ID: ${projectId}, Number: ${projectNumber})`);

    // -------------------------------------------------------------------------
    // SETUP: DEVELOPER #01, #02, #03
    // -------------------------------------------------------------------------
    console.log('\n[Setup] Provisioning Developers #01, #02, #03 with rich profiles...');

    const createAuditedDeveloper = async (
      name: string,
      username: string,
      email: string,
      phone: string,
      githubUrl: string,
      linkedinUrl: string,
      portfolioUrl: string
    ) => {
      const uRes = await query(
        "INSERT INTO users (email, password_hash, role, status) VALUES ($1, $2, 'DEVELOPER', 'ACTIVE') RETURNING id",
        [email, pwdHash]
      );
      const userId = uRes.rows[0].id;

      const dRes = await query(
        `INSERT INTO developers (
           user_id, username, display_name, role_title, experience,
           github_url, linkedin_url, portfolio_url,
           verification_status, verified_at
         )
         VALUES ($1, $2, $3, 'Senior Full-Stack Engineer', 6, $4, $5, $6, 'VERIFIED', NOW())
         RETURNING id`,
        [userId, username, name, githubUrl, linkedinUrl, portfolioUrl]
      );
      const devId = dRes.rows[0].id;

      await query(
        'INSERT INTO credit_accounts (developer_id, balance) VALUES ($1, 5) ON CONFLICT (developer_id) DO UPDATE SET balance = 5',
        [devId]
      );

      await DeveloperService.updateProfile(devId, { skills: ['React', 'Node.js', 'PostgreSQL'] });

      const token = jwt.sign(
        { userId, email, role: 'DEVELOPER', developerId: devId },
        env.JWT_SECRET,
        { expiresIn: '2h' }
      );

      return {
        userId,
        devId,
        name,
        username,
        email,
        phone,
        githubUrl,
        linkedinUrl,
        portfolioUrl,
        token,
      };
    };

    const dev1 = await createAuditedDeveloper(
      'Aarav Sharma',
      `aarav_${suffix}`,
      `aarav.sharma.${suffix}@nexus.dev`,
      '+91 9123456780',
      'https://github.com/aaravsharma',
      'https://linkedin.com/in/aaravsharma',
      'https://aaravsharma.dev'
    );

    const dev2 = await createAuditedDeveloper(
      'Rohan Varma',
      `rohan_${suffix}`,
      `rohan.varma.${suffix}@nexus.dev`,
      '+91 9123456781',
      'https://github.com/rohanvarma',
      'https://linkedin.com/in/rohanvarma',
      'https://rohanvarma.dev'
    );

    const dev3 = await createAuditedDeveloper(
      'Priya Patel',
      `priya_${suffix}`,
      `priya.patel.${suffix}@nexus.dev`,
      '+91 9123456782',
      'https://github.com/priyapatel',
      'https://linkedin.com/in/priyapatel',
      'https://priyapatel.dev'
    );

    console.log(`  ✔ Developer #01: ${dev1.name} (Dev ID: ${dev1.devId})`);
    console.log(`  ✔ Developer #02: ${dev2.name} (Dev ID: ${dev2.devId})`);
    console.log(`  ✔ Developer #03: ${dev3.name} (Dev ID: ${dev3.devId})`);

    // -------------------------------------------------------------------------
    // TEST 1: ALL THREE DEVELOPERS CLAIM & INDEPENDENT CONVERSATIONS
    // -------------------------------------------------------------------------
    console.log('\n[Test 1] All three developers claim Project #0001...');

    const claimDev = async (dev: any, pitch: string) => {
      const res = await fetch(`${baseUrl}/api/projects/${projectId}/claim`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${dev.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ pitch, estimatedDays: 30 }),
      });
      if (res.status !== 200 && res.status !== 201) {
        throw new Error(`Claim failed for ${dev.name}: ${await res.text()}`);
      }
      return (await res.json()) as any;
    };

    const claim1 = await claimDev(dev1, 'Senior distributed systems lead with deep PostgreSQL optimization experience.');
    const claim2 = await claimDev(dev2, 'Full-stack React and Node architect ready to deliver clean modular code.');
    const claim3 = await claimDev(dev3, 'Performance specialist experienced in enterprise SaaS pipelines.');

    console.log(`  ✔ Developer #01 claim: tag = ${claim1.anonymousTag}, conv = ${claim1.conversationId}`);
    console.log(`  ✔ Developer #02 claim: tag = ${claim2.anonymousTag}, conv = ${claim2.conversationId}`);
    console.log(`  ✔ Developer #03 claim: tag = ${claim3.anonymousTag}, conv = ${claim3.conversationId}`);

    // Verify all 3 conversation IDs are distinct
    const conv1Id = claim1.conversationId;
    const conv2Id = claim2.conversationId;
    const conv3Id = claim3.conversationId;

    if (!conv1Id || !conv2Id || !conv3Id) {
      throw new Error('Conversation IDs were not returned in claim responses!');
    }
    if (conv1Id === conv2Id || conv2Id === conv3Id || conv1Id === conv3Id) {
      throw new Error(`Conversation IDs are not independent! (${conv1Id}, ${conv2Id}, ${conv3Id})`);
    }

    // Verify membership of each conversation in database
    const verifyConvMembers = async (cId: string, expectedDevUserId: string) => {
      const members = await query(
        'SELECT user_id, role FROM conversation_members WHERE conversation_id = $1 ORDER BY role ASC',
        [cId]
      );
      if (members.rows.length !== 2) {
        throw new Error(`Conversation ${cId} expected 2 members, found ${members.rows.length}`);
      }
      const userIds = members.rows.map((r: any) => r.user_id);
      if (!userIds.includes(clientUserId) || !userIds.includes(expectedDevUserId)) {
        throw new Error(`Conversation ${cId} does not map Client #001 ↔ Expected Developer`);
      }
    };

    await verifyConvMembers(conv1Id, dev1.userId);
    await verifyConvMembers(conv2Id, dev2.userId);
    await verifyConvMembers(conv3Id, dev3.userId);

    console.log('  ✔ Verified independent conversation mapping:');
    console.log(`    Client #001 ↔ Developer #01 (${conv1Id})`);
    console.log(`    Client #001 ↔ Developer #02 (${conv2Id})`);
    console.log(`    Client #001 ↔ Developer #03 (${conv3Id})`);

    // -------------------------------------------------------------------------
    // TEST 2: PRIVACY INSPECTION OF ACTUAL API RESPONSES
    // -------------------------------------------------------------------------
    console.log('\n[Test 2] Inspecting actual API responses for privacy leaks...');

    // 2.1 Developer #01 inspects responses
    // Developer #01 must NOT receive Developer #02 real name, email, phone, profile URL
    const dev1ProjRes = await fetch(`${baseUrl}/api/projects/${projectId}`, {
      headers: { Authorization: `Bearer ${dev1.token}` },
    });
    const dev1ProjText = await dev1ProjRes.text();

    const dev1ConvRes = await fetch(`${baseUrl}/api/chat/conversations`, {
      headers: { Authorization: `Bearer ${dev1.token}` },
    });
    const dev1ConvText = await dev1ConvRes.text();

    const dev1ProposalsRes = await fetch(`${baseUrl}/api/projects/${projectId}/proposals`, {
      headers: { Authorization: `Bearer ${dev1.token}` },
    });
    const dev1ProposalsText = await dev1ProposalsRes.text();

    const dev1CombinedText = `${dev1ProjText} ${dev1ConvText} ${dev1ProposalsText}`;

    if (dev1CombinedText.includes(dev2.name)) {
      throw new Error(`PRIVACY LEAK: Developer #01 received Developer #02 real name (${dev2.name})`);
    }
    if (dev1CombinedText.includes(dev2.email)) {
      throw new Error(`PRIVACY LEAK: Developer #01 received Developer #02 email (${dev2.email})`);
    }
    if (dev1CombinedText.includes(dev2.phone)) {
      throw new Error(`PRIVACY LEAK: Developer #01 received Developer #02 phone (${dev2.phone})`);
    }
    if (dev1CombinedText.includes(dev2.portfolioUrl) || dev1CombinedText.includes(dev2.username)) {
      throw new Error(`PRIVACY LEAK: Developer #01 received Developer #02 profile URL / username`);
    }
    console.log('  ✔ Developer #01 does NOT receive Developer #02 real name, email, phone, or profile URL');

    // 2.2 Client #001 inspects responses
    // Client must NOT receive Developer #01 real name, email, phone, social accounts
    const clientProjRes = await fetch(`${baseUrl}/api/projects/${projectId}`, {
      headers: { Authorization: `Bearer ${clientToken}` },
    });
    const clientProjText = await clientProjRes.text();

    const clientMessagesRes = await fetch(`${baseUrl}/api/chat/${conv1Id}/messages`, {
      headers: { Authorization: `Bearer ${clientToken}` },
    });
    const clientMessagesText = await clientMessagesRes.text();

    const clientCombinedText = `${clientProjText} ${clientMessagesText}`;

    if (clientCombinedText.includes(dev1.name)) {
      throw new Error(`PRIVACY LEAK: Client received Developer #01 real name (${dev1.name})`);
    }
    if (clientCombinedText.includes(dev1.email)) {
      throw new Error(`PRIVACY LEAK: Client received Developer #01 email (${dev1.email})`);
    }
    if (clientCombinedText.includes(dev1.phone)) {
      throw new Error(`PRIVACY LEAK: Client received Developer #01 phone (${dev1.phone})`);
    }
    if (clientCombinedText.includes(dev1.githubUrl) || clientCombinedText.includes(dev1.linkedinUrl)) {
      throw new Error('PRIVACY LEAK: Client received Developer #01 social accounts');
    }
    console.log('  ✔ Client #001 does NOT receive Developer #01 real name, email, phone, or social accounts');
    results.anonymousIdentity = true;

    // -------------------------------------------------------------------------
    // TEST 3: MESSAGING (REALTIME, PERSISTENCE, UNREAD COUNTS, READ STATE)
    // -------------------------------------------------------------------------
    console.log('\n[Test 3] Testing messaging lifecycle: realtime delivery, persistence, unread count, read state...');

    // 3.1 Realtime delivery test
    let realtimeReceivedMessage: any = null;
    const realtimeListener = (msg: any) => {
      realtimeReceivedMessage = msg;
    };
    ChatService.onMessage(conv1Id, realtimeListener);

    const clientMessageText = 'Hello Developer #01, welcome to the preliminary discussion for Project #0001.';
    const sendRes1 = await fetch(`${baseUrl}/api/chat/${conv1Id}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${clientToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: clientMessageText }),
    });

    if (sendRes1.status !== 201) {
      throw new Error(`Client send message failed: ${await sendRes1.text()}`);
    }

    // Check realtime delivery
    await new Promise((r) => setTimeout(r, 50));
    ChatService.offMessage(conv1Id, realtimeListener);

    if (!realtimeReceivedMessage || realtimeReceivedMessage.message !== clientMessageText) {
      throw new Error('Realtime event was not received by the chat event bus!');
    }
    console.log(`  ✔ Realtime delivery verified: Message received instantaneously via event bus: "${realtimeReceivedMessage.message}"`);
    results.realtime = true;

    // 3.2 Persistence test
    const getMessagesDev1 = await fetch(`${baseUrl}/api/chat/${conv1Id}/messages`, {
      headers: { Authorization: `Bearer ${dev1.token}` },
    });
    const dev1MessagesData = (await getMessagesDev1.json()) as any;
    const foundMessage = dev1MessagesData.messages?.find((m: any) => m.message === clientMessageText);
    if (!foundMessage) {
      throw new Error('Sent message not found in conversation messages history!');
    }
    console.log(`  ✔ Message persistence verified: ID ${foundMessage.id} retrieved from database`);

    // 3.3 Unread counts test
    const unreadRes1 = await fetch(`${baseUrl}/api/chat/${conv1Id}/unread`, {
      headers: { Authorization: `Bearer ${dev1.token}` },
    });
    const unreadData1 = (await unreadRes1.json()) as any;
    if (unreadData1.unreadCount !== 1 || unreadData1.isRead !== false) {
      throw new Error(`Expected unreadCount=1, isRead=false; got: ${JSON.stringify(unreadData1)}`);
    }
    console.log('  ✔ Unread count verified: Developer #01 has 1 unread message (isRead: false)');

    // 3.4 Read state test
    const markReadRes = await fetch(`${baseUrl}/api/chat/${conv1Id}/read`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${dev1.token}` },
    });
    const markReadData = (await markReadRes.json()) as any;
    if (!markReadData.success || markReadData.unreadCount !== 0 || markReadData.isRead !== true) {
      throw new Error(`Mark read failed: ${JSON.stringify(markReadData)}`);
    }

    const unreadRes2 = await fetch(`${baseUrl}/api/chat/${conv1Id}/unread`, {
      headers: { Authorization: `Bearer ${dev1.token}` },
    });
    const unreadData2 = (await unreadRes2.json()) as any;
    if (unreadData2.unreadCount !== 0 || unreadData2.isRead !== true) {
      throw new Error(`Unread state not updated after mark read: ${JSON.stringify(unreadData2)}`);
    }
    console.log('  ✔ Read state verified: Developer #01 marked conversation as read (unreadCount: 0, isRead: true)');

    // -------------------------------------------------------------------------
    // TEST 4: UNAUTHORIZED CONVERSATION ACCESS (HTTP 403)
    // -------------------------------------------------------------------------
    console.log('\n[Test 4] Testing unauthorized conversation access defense (Expected: 403)...');

    // Dev 1 attempts to read Dev 2's conversation
    const unauthorizedReadRes = await fetch(`${baseUrl}/api/chat/${conv2Id}/messages`, {
      headers: { Authorization: `Bearer ${dev1.token}` },
    });
    if (unauthorizedReadRes.status !== 403) {
      throw new Error(`Expected 403 for unauthorized read, got: ${unauthorizedReadRes.status}`);
    }
    console.log('  ✔ Developer #01 read attempt on Developer #02 conversation rejected with 403 Forbidden');

    // Dev 1 attempts to send message to Dev 2's conversation
    const unauthorizedWriteRes = await fetch(`${baseUrl}/api/chat/${conv2Id}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${dev1.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: 'Spy message into Dev 2 room' }),
    });
    if (unauthorizedWriteRes.status !== 403) {
      throw new Error(`Expected 403 for unauthorized write, got: ${unauthorizedWriteRes.status}`);
    }
    console.log('  ✔ Developer #01 write attempt on Developer #02 conversation rejected with 403 Forbidden');

    // Dev 2 attempts to read Dev 1's conversation
    const dev2ReadDev1Res = await fetch(`${baseUrl}/api/chat/${conv1Id}/messages`, {
      headers: { Authorization: `Bearer ${dev2.token}` },
    });
    if (dev2ReadDev1Res.status !== 403) {
      throw new Error(`Expected 403 for Dev 2 reading Dev 1, got: ${dev2ReadDev1Res.status}`);
    }
    console.log('  ✔ Developer #02 read attempt on Developer #01 conversation rejected with 403 Forbidden');
    results.conversationIsolation = true;
    results.authorization = true;

    // -------------------------------------------------------------------------
    // TEST 5: PROPOSAL SUBMISSION & ISOLATION
    // -------------------------------------------------------------------------
    console.log('\n[Test 5] Testing proposal submission & visibility isolation...');

    const proposalPayload = {
      approach: 'Decoupled event-driven commerce architecture utilizing PostgreSQL CDC, Redis caching, and reactive Next.js storefront.',
      timeline: '35 days',
      price: 65000,
      technologies: ['React', 'Node.js', 'PostgreSQL', 'Docker'],
      milestones: [
        { title: 'Phase 1: Database Schema, CDC & Auth', price: 20000, duration: '10 days' },
        { title: 'Phase 2: Core Commerce Engine & APIs', price: 30000, duration: '15 days' },
        { title: 'Phase 3: Integration, QA & Verification', price: 15000, duration: '10 days' },
      ],
      additionalNotes: 'Full automated unit and integration coverage with > 90% branch coverage included.',
    };

    const submitPropRes = await fetch(`${baseUrl}/api/projects/${projectId}/proposals`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${dev1.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(proposalPayload),
    });

    if (submitPropRes.status !== 200 && submitPropRes.status !== 201) {
      throw new Error(`Proposal submission failed: ${await submitPropRes.text()}`);
    }
    console.log('  ✔ Developer #01 submitted proposal successfully');

    // Client #001 inspects proposal
    const clientPropRes = await fetch(`${baseUrl}/api/projects/${projectId}/proposals`, {
      headers: { Authorization: `Bearer ${clientToken}` },
    });
    if (clientPropRes.status !== 200) {
      throw new Error(`Client fetching proposals failed: ${await clientPropRes.text()}`);
    }
    const clientPropData = (await clientPropRes.json()) as any;
    const clientSeenProposal = clientPropData.proposals?.find((p: any) => p.anonymousTag === 'Developer #01');

    if (!clientSeenProposal) {
      throw new Error('Client #001 cannot find Developer #01 proposal!');
    }

    // Verify all required proposal fields
    if (clientSeenProposal.approach !== proposalPayload.approach) {
      throw new Error('Proposal approach mismatch');
    }
    if (clientSeenProposal.timeline !== proposalPayload.timeline) {
      throw new Error('Proposal timeline mismatch');
    }
    if (Number(clientSeenProposal.price) !== proposalPayload.price) {
      throw new Error('Proposal price mismatch');
    }
    if (JSON.stringify(clientSeenProposal.technologies) !== JSON.stringify(proposalPayload.technologies)) {
      throw new Error('Proposal technologies mismatch');
    }
    if (clientSeenProposal.milestones.length !== proposalPayload.milestones.length) {
      throw new Error(`Milestones count mismatch: expected ${proposalPayload.milestones.length}, got ${clientSeenProposal.milestones.length}`);
    }
    for (let i = 0; i < proposalPayload.milestones.length; i++) {
      const exp = proposalPayload.milestones[i];
      const act = clientSeenProposal.milestones[i];
      if (act.title !== exp.title || act.price !== exp.price || act.duration !== exp.duration) {
        throw new Error(`Milestone ${i} mismatch: ${JSON.stringify(act)} vs ${JSON.stringify(exp)}`);
      }
    }
    if (clientSeenProposal.additionalNotes !== proposalPayload.additionalNotes) {
      throw new Error('Proposal notes mismatch');
    }

    console.log('  ✔ Client #001 sees Developer #01 proposal with all fields verified:');
    console.log(`    - approach: "${clientSeenProposal.approach.slice(0, 50)}..."`);
    console.log(`    - timeline: ${clientSeenProposal.timeline}`);
    console.log(`    - price: ₹${clientSeenProposal.price}`);
    console.log(`    - technologies: [${clientSeenProposal.technologies.join(', ')}]`);
    console.log(`    - milestones: ${clientSeenProposal.milestones.length} milestones`);
    console.log(`    - notes: "${clientSeenProposal.additionalNotes.slice(0, 50)}..."`);

    // Developer #02 inspects proposals: Developer #02 must NOT see Developer #01 proposal!
    const dev2PropRes = await fetch(`${baseUrl}/api/projects/${projectId}/proposals`, {
      headers: { Authorization: `Bearer ${dev2.token}` },
    });
    const dev2PropData = (await dev2PropRes.json()) as any;
    const dev2SeenDev1Prop = dev2PropData.proposals?.find((p: any) => p.anonymousTag === 'Developer #01');
    if (dev2SeenDev1Prop) {
      throw new Error('ISOLATION LEAK: Developer #02 can see Developer #01 private proposal!');
    }
    console.log('  ✔ Developer #02 does NOT see Developer #01 private proposal (Proposals list is isolated)');
    results.proposal = true;

    // -------------------------------------------------------------------------
    // TEST 6: CLOSED CHAT AFTER DEVELOPER SELECTION
    // -------------------------------------------------------------------------
    console.log('\n[Test 6] Testing closed chat after developer selection...');
    console.log('  - Client selects Developer #02 for Project #0001');

    const selectRes = await fetch(`${baseUrl}/api/projects/${projectId}/select`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${clientToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ selectedDeveloperId: dev2.devId }),
    });

    if (selectRes.status !== 200) {
      throw new Error(`Select developer failed: ${await selectRes.text()}`);
    }
    console.log('  ✔ Developer #02 selected. Project status transitioned to IN_PROGRESS');

    // Verify unselected conversations (Conv 1 & Conv 3) are CLOSED
    const conv1StatusRes = await query('SELECT status FROM conversations WHERE id = $1', [conv1Id]);
    if (conv1StatusRes.rows[0].status !== 'CLOSED') {
      throw new Error(`Unselected conversation 1 status is not CLOSED! Got: ${conv1StatusRes.rows[0].status}`);
    }
    const conv3StatusRes = await query('SELECT status FROM conversations WHERE id = $1', [conv3Id]);
    if (conv3StatusRes.rows[0].status !== 'CLOSED') {
      throw new Error(`Unselected conversation 3 status is not CLOSED! Got: ${conv3StatusRes.rows[0].status}`);
    }
    console.log('  ✔ Unselected conversations (Dev 1 & Dev 3) confirmed CLOSED in database');

    // Selected conversation (Conv 2) remains ACTIVE
    const conv2StatusRes = await query('SELECT status FROM conversations WHERE id = $1', [conv2Id]);
    if (conv2StatusRes.rows[0].status !== 'ACTIVE') {
      throw new Error(`Selected conversation 2 status is not ACTIVE! Got: ${conv2StatusRes.rows[0].status}`);
    }
    console.log('  ✔ Selected conversation (Dev 2) confirmed ACTIVE in database');

    // Unselected conversation cannot accept new messages
    const dev1ClosedSendRes = await fetch(`${baseUrl}/api/chat/${conv1Id}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${dev1.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: 'Attempting to send message to closed conversation' }),
    });

    if (dev1ClosedSendRes.status !== 403) {
      throw new Error(`Expected 403 when sending to closed conversation, got: ${dev1ClosedSendRes.status}`);
    }
    console.log('  ✔ Unselected conversation strictly cannot accept new messages (403 Forbidden)');

    // Selected conversation remains available according to project workflow
    const dev2ActiveSendRes = await fetch(`${baseUrl}/api/chat/${conv2Id}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${dev2.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: 'Hello Client #001! Delighted to be selected. Initiating Phase 1 milestones.' }),
    });

    if (dev2ActiveSendRes.status !== 201) {
      throw new Error(`Selected conversation send message failed: ${await dev2ActiveSendRes.text()}`);
    }
    console.log('  ✔ Selected conversation remains available: Developer #02 message successfully sent (201 Created)');

    const clientDev2SendRes = await fetch(`${baseUrl}/api/chat/${conv2Id}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${clientToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: 'Welcome aboard Developer #02! Looking forward to working together.' }),
    });

    if (clientDev2SendRes.status !== 201) {
      throw new Error(`Client send to selected conversation failed: ${await clientDev2SendRes.text()}`);
    }
    console.log('  ✔ Client reply in selected conversation successfully sent (201 Created)');
    results.closedChat = true;

    return results;
  } finally {
    if (server) {
      await new Promise<void>((resolve) => {
        (server as Server).close(() => resolve());
      });
      console.log('\n[Audit Harness] Live test server shut down cleanly.');
    }
  }
}

// Allow direct execution via tsx
if (process.argv[1]?.endsWith('anonymousChatProposalAuditTest.ts')) {
  runAnonymousChatProposalAudit()
    .then((results) => {
      console.log('\n================================================================');
      console.log('AUDIT REPORT OUTPUT');
      console.log('================================================================');
      console.log(`Anonymous identity:\n${results.anonymousIdentity ? 'PASS' : 'FAIL'}\n`);
      console.log(`Conversation isolation:\n${results.conversationIsolation ? 'PASS' : 'FAIL'}\n`);
      console.log(`Realtime:\n${results.realtime ? 'PASS' : 'FAIL'}\n`);
      console.log(`Proposal:\n${results.proposal ? 'PASS' : 'FAIL'}\n`);
      console.log(`Authorization:\n${results.authorization ? 'PASS' : 'FAIL'}\n`);
      console.log(`Closed chat:\n${results.closedChat ? 'PASS' : 'FAIL'}\n`);
      console.log('================================================================\n');
      process.exit(0);
    })
    .catch((err) => {
      console.error('\n❌ Phase 8 Audit Test Suite Failed:', err);
      process.exit(1);
    });
}
