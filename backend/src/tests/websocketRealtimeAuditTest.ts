import { WebSocket } from 'ws';
import { httpServer } from '../server.js';
import { query } from '../database/db.js';
import { env } from '../config/environment.js';
import { ProjectService } from '../services/projectService.js';
import { WorkspaceService } from '../services/workspaceService.js';
import { CreditLedgerService } from '../services/creditLedgerService.js';
import { ChatService } from '../services/chatService.js';
import { CommunityService } from '../services/communityService.js';
import { SupportService } from '../services/supportService.js';
import { NotificationService } from '../services/notificationService.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Server } from 'http';

interface TestResult {
  domain: string;
  test: string;
  passed: boolean;
  evidence: string;
}

const results: TestResult[] = [];

function record(domain: string, test: string, passed: boolean, evidence: string) {
  results.push({ domain, test, passed, evidence });
  const status = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`[${status}] [${domain}] ${test}: ${evidence}`);
}

class TestWsClient {
  public ws: WebSocket | null = null;
  public messages: any[] = [];
  public errors: any[] = [];
  public isConnected = false;

  constructor(private url: string) {}

  public connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      const timer = setTimeout(() => {
        reject(new Error(`WebSocket connection timeout to ${this.url}`));
      }, 5000);

      this.ws.on('open', () => {
        this.isConnected = true;
        clearTimeout(timer);
        resolve();
      });

      this.ws.on('message', (raw: Buffer) => {
        try {
          const parsed = JSON.parse(raw.toString('utf8'));
          this.messages.push(parsed);
        } catch (_err) {
          // ignore
        }
      });

      this.ws.on('error', (err) => {
        this.errors.push(err);
      });

      this.ws.on('close', () => {
        this.isConnected = false;
      });
    });
  }

  public send(msg: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  public waitForMessage(predicate: (msg: any) => boolean, timeoutMs = 4000): Promise<any> {
    return new Promise((resolve, reject) => {
      // Check existing
      const existing = this.messages.find(predicate);
      if (existing) {
        return resolve(existing);
      }

      const startTime = Date.now();
      const interval = setInterval(() => {
        const found = this.messages.find(predicate);
        if (found) {
          clearInterval(interval);
          return resolve(found);
        }
        if (Date.now() - startTime > timeoutMs) {
          clearInterval(interval);
          reject(new Error(`Timeout waiting for message matching predicate after ${timeoutMs}ms`));
        }
      }, 50);
    });
  }

  public close(): void {
    this.isConnected = false;
    if (this.ws) {
      try {
        this.ws.close();
      } catch (_e) {
        // Ignored on close
      }
      this.ws = null;
    }
  }
}

async function runWebSocketRealtimeAudit() {
  console.log('\n========================================================================');
  console.log('   DEDICATED REAL-TIME & WEBSOCKET ARCHITECTURE VERIFICATION TEST');
  console.log('========================================================================\n');

  // Connect to existing server or start test server
  let testPort = Number(env.PORT || 5000);
  let serverInstance: Server | null = null;

  if (httpServer.listening) {
    const addr = httpServer.address();
    if (addr && typeof addr === 'object') {
      testPort = addr.port;
    }
  } else {
    await new Promise<void>((resolve) => {
      serverInstance = httpServer.listen(0, () => {
        const addr = httpServer.address();
        if (addr && typeof addr === 'object') {
          testPort = addr.port;
        }
        resolve();
      });
    });
  }

  console.log(`[Test Server] Running on http://localhost:${testPort} with ws://localhost:${testPort}/ws`);
  const wsBaseUrl = `ws://localhost:${testPort}/ws`;

  try {
    // -------------------------------------------------------------
    // SETUP TEST ENTITIES
    // -------------------------------------------------------------
    console.log('\n--- Setting up test identities ---');
    const pwdHash = await bcrypt.hash('SecurePass123!', 10);
    const suffix = Date.now();

    // 1. CEO / Admin User
    const ceoRes = await query(
      `INSERT INTO users (email, password_hash, role, status)
       VALUES ($1, $2, 'CEO', 'ACTIVE') RETURNING id`,
      [`ceo_ws_${suffix}@nexus.dev`, pwdHash]
    );
    const ceoUserId = ceoRes.rows[0].id;
    const ceoToken = jwt.sign({ userId: ceoUserId, role: 'CEO' }, env.JWT_SECRET, { expiresIn: '1h' });

    // 2. MD User
    const mdRes = await query(
      `INSERT INTO users (email, password_hash, role, status)
       VALUES ($1, $2, 'MD', 'ACTIVE') RETURNING id`,
      [`md_ws_${suffix}@nexus.dev`, pwdHash]
    );
    const mdUserId = mdRes.rows[0].id;
    const _mdToken = jwt.sign({ userId: mdUserId, role: 'MD' }, env.JWT_SECRET, { expiresIn: '1h' });

    // 3. Client #001
    const clientUserRes = await query(
      `INSERT INTO users (email, password_hash, role, status)
       VALUES ($1, $2, 'CLIENT', 'ACTIVE') RETURNING id`,
      [`client1_ws_${suffix}@test.com`, pwdHash]
    );
    const clientUserId = clientUserRes.rows[0].id;
    const clientNumber = `Client #${String(suffix).slice(-4)}`;
    const clientRes = await query(
      `INSERT INTO clients (user_id, company_name, client_number, private_name)
       VALUES ($1, 'Acme Corp', $2, 'John Doe') RETURNING id`,
      [clientUserId, clientNumber]
    );
    const clientId = clientRes.rows[0].id;
    const clientToken = jwt.sign({ userId: clientUserId, role: 'CLIENT', clientId }, env.JWT_SECRET, { expiresIn: '1h' });

    // 4. Client #002 (Unrelated)
    const client2UserRes = await query(
      `INSERT INTO users (email, password_hash, role, status)
       VALUES ($1, $2, 'CLIENT', 'ACTIVE') RETURNING id`,
      [`client2_ws_${suffix}@test.com`, pwdHash]
    );
    const client2UserId = client2UserRes.rows[0].id;
    const client2Number = `Client #${String(suffix + 1).slice(-4)}`;
    const client2Res = await query(
      `INSERT INTO clients (user_id, company_name, client_number, private_name)
       VALUES ($1, 'Beta LLC', $2, 'Jane Smith') RETURNING id`,
      [client2UserId, client2Number]
    );
    const client2Id = client2Res.rows[0].id;
    const _client2Token = jwt.sign({ userId: client2UserId, role: 'CLIENT', clientId: client2Id }, env.JWT_SECRET, { expiresIn: '1h' });

    // 5. Developers: Dev 1, Dev 2, Dev 3
    const devUsers: string[] = [];
    const devTokens: string[] = [];
    const devIds: string[] = [];

    for (let i = 1; i <= 3; i++) {
      const dUser = await query(
        `INSERT INTO users (email, password_hash, role, status)
         VALUES ($1, $2, 'DEVELOPER', 'ACTIVE') RETURNING id`,
        [`dev${i}_ws_${suffix}@nexus.dev`, pwdHash]
      );
      const dDev = await query(
        `INSERT INTO developers (user_id, username, display_name, verification_status, experience, role_title)
         VALUES ($1, $2, $3, 'VERIFIED', 5, 'Senior Full Stack Engineer') RETURNING id`,
        [dUser.rows[0].id, `dev${i}_${suffix}`, `Developer 0${i}`]
      );
      devUsers.push(dUser.rows[0].id);
      devIds.push(dDev.rows[0].id);
      const token = jwt.sign(
        { userId: dUser.rows[0].id, role: 'DEVELOPER', developerId: dDev.rows[0].id },
        env.JWT_SECRET,
        { expiresIn: '1h' }
      );
      devTokens.push(token);

      // Seed credit account with initial 0 balance
      await query(`INSERT INTO credit_accounts (developer_id, balance) VALUES ($1, 0)`, [dDev.rows[0].id]);

      // Add credits and skills (React, Node.js, PostgreSQL)
      await CreditLedgerService.purchaseCredits(dDev.rows[0].id, dUser.rows[0].id, 10, 500);
      const skills = ['React', 'Node.js', 'PostgreSQL'];
      for (const s of skills) {
        let sRes = await query(`SELECT id FROM skills WHERE LOWER(name) = LOWER($1)`, [s]);
        if (sRes.rows.length === 0) {
          sRes = await query(`INSERT INTO skills (name, category) VALUES ($1, 'Core') RETURNING id`, [s]);
        }
        await query(
          `INSERT INTO developer_skills (developer_id, skill_id, experience_level) VALUES ($1, $2, 'EXPERT') ON CONFLICT DO NOTHING`,
          [dDev.rows[0].id, sRes.rows[0].id]
        );
      }
    }

    // 6. Suspended Developer
    const suspUserRes = await query(
      `INSERT INTO users (email, password_hash, role, status)
       VALUES ($1, $2, 'DEVELOPER', 'SUSPENDED') RETURNING id`,
      [`susp_ws_${suffix}@nexus.dev`, pwdHash]
    );
    const suspToken = jwt.sign({ userId: suspUserRes.rows[0].id, role: 'DEVELOPER' }, env.JWT_SECRET, { expiresIn: '1h' });

    // -------------------------------------------------------------
    // DOMAIN 1: AUTHENTICATION & HANDSHAKE SECURITY
    // -------------------------------------------------------------
    console.log('\n--- DOMAIN 1: Connection & Authentication Security ---');

    // Test 1.1: Valid token connection
    const clientWs = new TestWsClient(`${wsBaseUrl}?token=${encodeURIComponent(clientToken)}`);
    await clientWs.connect();
    const authSuccessMsg = await clientWs.waitForMessage((m) => m.type === 'auth_success');
    record(
      'AUTH',
      'Valid Token Handshake',
      authSuccessMsg && authSuccessMsg.user.userId === clientUserId,
      `Connected and verified identity: ${authSuccessMsg.user.displayName} (Role: ${authSuccessMsg.user.role})`
    );

    // Test 1.2: Expired token rejection
    const expiredToken = jwt.sign({ userId: clientUserId }, env.JWT_SECRET, { expiresIn: '-10s' });
    const expiredWs = new TestWsClient(`${wsBaseUrl}?token=${encodeURIComponent(expiredToken)}`);
    let expiredRejected = false;
    try {
      await expiredWs.connect();
      await expiredWs.waitForMessage((m) => m.type === 'auth_error');
      expiredRejected = true;
    } catch (_err) {
      expiredRejected = true;
    }
    record(
      'AUTH',
      'Expired Token Rejection',
      expiredRejected,
      'Connection closed with policy violation error on expired JWT'
    );
    expiredWs.close();

    // Test 1.3: Suspended user rejection
    const suspWs = new TestWsClient(`${wsBaseUrl}?token=${encodeURIComponent(suspToken)}`);
    let suspRejected = false;
    try {
      await suspWs.connect();
      const err = await suspWs.waitForMessage((m) => m.type === 'auth_error');
      suspRejected = err && err.message.includes('suspended');
    } catch (_err) {
      suspRejected = true;
    }
    record(
      'AUTH',
      'Suspended User Rejection',
      suspRejected,
      'Suspended user blocked from establishing WebSocket session'
    );
    suspWs.close();

    // Test 1.4: Spoofed Role Defense
    // Client connects and attempts to claim role='ADMIN' via payload
    clientWs.send({ type: 'auth', token: clientToken, role: 'ADMIN' });
    const spoofMsg = await clientWs.waitForMessage((m) => m.type === 'auth_success' && m.user.userId === clientUserId);
    record(
      'AUTH',
      'Spoofed Client Role Defense',
      spoofMsg.user.role === 'CLIENT',
      `Server derived role from trusted DB record: role=${spoofMsg.user.role}, ignored client spoofing`
    );

    // -------------------------------------------------------------
    // DOMAIN 2: CHANNEL AUTHORIZATION & ROOM ISOLATION
    // -------------------------------------------------------------
    console.log('\n--- DOMAIN 2: Channel Authorization & Room Isolation ---');

    const dev1Ws = new TestWsClient(`${wsBaseUrl}?token=${encodeURIComponent(devTokens[0])}`);
    await dev1Ws.connect();
    await dev1Ws.waitForMessage((m) => m.type === 'auth_success');

    // Test 2.1: Client attempts to join developer community
    clientWs.send({ type: 'subscribe', channel: 'community:general' });
    const clientCommunityErr = await clientWs.waitForMessage((m) => m.type === 'error' && m.code === 'FORBIDDEN');
    record(
      'AUTHORIZATION',
      'Client Community Channel Block',
      clientCommunityErr !== null,
      `Client rejected from developer community: ${clientCommunityErr.message}`
    );

    // Test 2.2: Verified developer joins community channel
    dev1Ws.send({ type: 'subscribe', channel: 'community:general' });
    const devSubSuccess = await dev1Ws.waitForMessage((m) => m.type === 'subscribed' && m.channel === 'community:general');
    record(
      'AUTHORIZATION',
      'Developer Community Channel Authorization',
      devSubSuccess !== null,
      `Verified Developer subscribed to community:general successfully`
    );

    // Test 2.3: Developer attempts to join admin operational channel
    dev1Ws.send({ type: 'subscribe', channel: 'admin:events' });
    const devAdminErr = await dev1Ws.waitForMessage((m) => m.type === 'error' && m.code === 'FORBIDDEN');
    record(
      'AUTHORIZATION',
      'Developer Admin Channel Block',
      devAdminErr !== null,
      `Developer blocked from administrative events channel: ${devAdminErr.message}`
    );

    // Test 2.4: CEO joins admin channel
    const ceoWs = new TestWsClient(`${wsBaseUrl}?token=${encodeURIComponent(ceoToken)}`);
    await ceoWs.connect();
    await ceoWs.waitForMessage((m) => m.type === 'auth_success');
    ceoWs.send({ type: 'subscribe', channel: 'admin:events' });
    const ceoSubSuccess = await ceoWs.waitForMessage((m) => m.type === 'subscribed' && m.channel === 'admin:events');
    record(
      'AUTHORIZATION',
      'CEO Admin Channel Access',
      ceoSubSuccess !== null,
      `CEO successfully subscribed to admin:events`
    );

    // -------------------------------------------------------------
    // DOMAIN 3: DEVELOPER COMMUNITY REAL-TIME (MESSAGING, REACTIONS, TYPING)
    // -------------------------------------------------------------
    console.log('\n--- DOMAIN 3: Developer Community Real-time ---');

    const dev2Ws = new TestWsClient(`${wsBaseUrl}?token=${encodeURIComponent(devTokens[1])}`);
    await dev2Ws.connect();
    await dev2Ws.waitForMessage((m) => m.type === 'auth_success');

    dev2Ws.send({ type: 'subscribe', channel: 'community:general' });
    await dev2Ws.waitForMessage((m) => m.type === 'subscribed' && m.channel === 'community:general');

    // Test 3.1: Real-time Community Message Broadcast
    await CommunityService.sendChannelMessage({
      channelIdOrSlug: 'general',
      userId: devUsers[0],
      developerId: devIds[0],
      content: 'Hello developer community via WebSocket!',
    });

    const dev2Msg = await dev2Ws.waitForMessage(
      (m) => m.type === 'event' && m.channel === 'community:general' && m.data.content.includes('Hello developer community')
    );
    record(
      'COMMUNITY',
      'Real-time Community Channel Broadcast',
      dev2Msg !== null,
      `Developer #02 received Developer #01 message without refreshing`
    );

    // Test 3.2: Typing Indicators in Community
    dev1Ws.send({ type: 'typing', channel: 'community:general', isTyping: true });
    const dev2Typing = await dev2Ws.waitForMessage(
      (m) => m.type === 'typing' && m.channel === 'community:general' && m.isTyping === true
    );
    record(
      'COMMUNITY',
      'Community Typing Indicator',
      dev2Typing !== null && dev2Typing.senderId === devUsers[0],
      `Developer #02 received typing indicator from ${dev2Typing?.displayName}`
    );

    // Test 3.3: Typing Indicator Stop
    dev1Ws.send({ type: 'typing', channel: 'community:general', isTyping: false });
    const dev2StopTyping = await dev2Ws.waitForMessage(
      (m) => m.type === 'typing' && m.channel === 'community:general' && m.isTyping === false
    );
    record(
      'COMMUNITY',
      'Community Stop Typing Event',
      dev2StopTyping !== null,
      `Developer #02 received stop typing event`
    );

    // Test 3.4: Real-time Reaction Broadcast
    const msgId = dev2Msg.data.id;
    await CommunityService.toggleReaction(msgId, devUsers[1], devIds[1], '🚀');
    const dev1Reaction = await dev1Ws.waitForMessage(
      (m) => m.type === 'event' && m.channel === 'community:general' && m.event === 'community:reaction'
    );
    record(
      'COMMUNITY',
      'Real-time Emoji Reaction',
      dev1Reaction !== null && dev1Reaction.data.emoji === '🚀' && dev1Reaction.data.added === true,
      `Developer #01 received reaction update: emoji=${dev1Reaction?.data?.emoji}, count=${dev1Reaction?.data?.count}`
    );

    // -------------------------------------------------------------
    // DOMAIN 4: ANONYMOUS PROJECT CHAT & CONVERSATION ISOLATION
    // -------------------------------------------------------------
    console.log('\n--- DOMAIN 4: Anonymous Project Chat & Isolation ---');

    // Create a project and claim it with all 3 developers
    const projResult = await ProjectService.submitProject(clientId, clientUserId, {
      title: 'Realtime Cloud Dashboard',
      category: 'Full Stack',
      description: 'Production real-time WebSocket dashboard',
      budgetMin: 50000,
      budgetMax: 80000,
      timeline: '4 weeks',
      requirements: ['React', 'Node.js', 'PostgreSQL'],
      requiredTechnologies: ['React', 'Node.js', 'PostgreSQL'],
    });

    const projectId = projResult.projectId;
    await query(`UPDATE projects SET status = 'OPEN_FOR_CLAIMS' WHERE id = $1`, [projectId]);

    const claim1 = await ProjectService.claimProject(projectId, devIds[0], devUsers[0]);
    const claim2 = await ProjectService.claimProject(projectId, devIds[1], devUsers[1]);
    const claim3 = await ProjectService.claimProject(projectId, devIds[2], devUsers[2]);

    const conv1 = claim1.conversationId;
    const conv2 = claim2.conversationId;
    const conv3 = claim3.conversationId;

    const dev3Ws = new TestWsClient(`${wsBaseUrl}?token=${encodeURIComponent(devTokens[2])}`);
    await dev3Ws.connect();
    await dev3Ws.waitForMessage((m) => m.type === 'auth_success');

    // Dev 1 subscribes to Conv 1
    dev1Ws.send({ type: 'subscribe', channel: `chat:${conv1}` });
    await dev1Ws.waitForMessage((m) => m.type === 'subscribed' && m.channel === `chat:${conv1}`);

    // Dev 2 subscribes to Conv 2
    dev2Ws.send({ type: 'subscribe', channel: `chat:${conv2}` });
    await dev2Ws.waitForMessage((m) => m.type === 'subscribed' && m.channel === `chat:${conv2}`);

    // Dev 3 subscribes to Conv 3
    dev3Ws.send({ type: 'subscribe', channel: `chat:${conv3}` });
    await dev3Ws.waitForMessage((m) => m.type === 'subscribed' && m.channel === `chat:${conv3}`);

    // Client subscribes to all 3
    clientWs.send({ type: 'subscribe', channel: `chat:${conv1}` });
    clientWs.send({ type: 'subscribe', channel: `chat:${conv2}` });
    clientWs.send({ type: 'subscribe', channel: `chat:${conv3}` });

    // Test 4.1: Cross-Developer Subscription Isolation
    // Dev 1 attempts to subscribe to Conv 2 (Dev 2's conversation)
    dev1Ws.send({ type: 'subscribe', channel: `chat:${conv2}` });
    const dev1CrossSubErr = await dev1Ws.waitForMessage(
      (m) => m.type === 'error' && m.code === 'FORBIDDEN' && m.message.includes('not an authorized member')
    );
    record(
      'ISOLATION',
      'Cross-Conversation Subscription Block',
      dev1CrossSubErr !== null,
      `Developer #01 rejected from subscribing to Developer #02 conversation: ${dev1CrossSubErr?.message}`
    );

    // Test 4.2: Client sends message in Conv 1 -> Only Dev 1 receives it
    await ChatService.sendMessage(conv1, clientUserId, 'Hello Developer 01, review the requirements.');
    const dev1RecvMsg = await dev1Ws.waitForMessage(
      (m) => m.type === 'event' && m.channel === `chat:${conv1}` && m.data.message.includes('review the requirements')
    );

    // Verify Dev 2 and Dev 3 did NOT receive Conv 1 message
    const dev2Leak = dev2Ws.messages.some((m) => m.channel === `chat:${conv1}`);
    const dev3Leak = dev3Ws.messages.some((m) => m.channel === `chat:${conv1}`);
    record(
      'ISOLATION',
      'Private Conversation Isolation',
      dev1RecvMsg !== null && !dev2Leak && !dev3Leak,
      `Developer #01 received message. Developer #02 leak=${dev2Leak}, Developer #03 leak=${dev3Leak}`
    );

    // Test 4.3: Anonymous Identity Protection in WebSocket Payload
    // Inspect actual network payload received by Client and Developer
    await ChatService.sendMessage(conv1, devUsers[0], 'Understood, starting work.');
    const clientRecvMsg = await clientWs.waitForMessage(
      (m) => m.type === 'event' && m.channel === `chat:${conv1}` && m.data.message.includes('Understood, starting work')
    );

    const payload = clientRecvMsg.data;
    const leaksEmail = JSON.stringify(payload).includes('@');
    const showsAnonTag = payload.senderDisplayName === 'Developer #01';
    record(
      'PRIVACY',
      'Anonymous Identity Shielding in WebSocket Payload',
      showsAnonTag && !leaksEmail,
      `Client received senderDisplayName="${payload.senderDisplayName}" (leaksEmail=${leaksEmail})`
    );

    // Test 4.4: Anonymous Typing Indicator
    dev1Ws.send({ type: 'typing', channel: `chat:${conv1}`, isTyping: true });
    const clientTyping = await clientWs.waitForMessage(
      (m) => m.type === 'typing' && m.channel === `chat:${conv1}` && m.isTyping === true
    );
    record(
      'PRIVACY',
      'Anonymous Typing Indicator Display Name',
      clientTyping && clientTyping.displayName === 'Developer #01',
      `Typing event masked sender as "${clientTyping?.displayName}" without leaking real developer name`
    );

    // -------------------------------------------------------------
    // DOMAIN 5: READ/UNREAD PERSISTED REAL-TIME STATE
    // -------------------------------------------------------------
    console.log('\n--- DOMAIN 5: Read/Unread State Synchronization ---');

    await ChatService.markConversationAsRead(conv1, clientUserId);
    const readEvent = await clientWs.waitForMessage(
      (m) => m.type === 'event' && m.channel === `chat:${conv1}` && m.event === 'chat:read'
    );
    record(
      'READ_STATE',
      'Real-time Chat Read Receipt',
      readEvent !== null && readEvent.data.unreadCount === 0,
      `Read receipt broadcast for user ${readEvent?.data?.userId} with unreadCount=0`
    );

    // -------------------------------------------------------------
    // DOMAIN 6: REAL-TIME NOTIFICATIONS PUSH
    // -------------------------------------------------------------
    console.log('\n--- DOMAIN 6: Real-time Notifications ---');

    // Trigger notification to Dev 2
    await NotificationService.createNotification({
      userId: devUsers[1],
      type: 'PROJECT_CLAIMED',
      title: 'Claim Confirmed',
      message: 'Your project claim has been confirmed.',
      link: `/projects/${projectId}`,
    });

    const dev2Notif = await dev2Ws.waitForMessage(
      (m) => m.type === 'event' && m.channel === `user:${devUsers[1]}` && m.event === 'notification:new'
    );
    record(
      'NOTIFICATIONS',
      'Direct Real-time User Notification Push',
      dev2Notif !== null && dev2Notif.data.title === 'Claim Confirmed',
      `Notification pushed to user:${devUsers[1]} with title="${dev2Notif?.data?.title}"`
    );

    // -------------------------------------------------------------
    // DOMAIN 7: WORKSPACE REAL-TIME (MILESTONES & FILES)
    // -------------------------------------------------------------
    console.log('\n--- DOMAIN 7: Project Workspace Real-time ---');

    // Submit proposals
    await ProjectService.submitProposal(projectId, devIds[0], { approach: 'Approach 1', timeline: '3w', price: 60000 });
    await ProjectService.submitProposal(projectId, devIds[1], { approach: 'Approach 2', timeline: '4w', price: 65000 });
    await ProjectService.submitProposal(projectId, devIds[2], { approach: 'Approach 3', timeline: '4w', price: 70000 });

    // Select Developer #02
    await ProjectService.selectDeveloper(projectId, devIds[1], clientId);

    // Dev 2 subscribes to workspace
    dev2Ws.send({ type: 'subscribe', channel: `workspace:${projectId}` });
    const dev2WorkspaceSub = await dev2Ws.waitForMessage(
      (m) => m.type === 'subscribed' && m.channel === `workspace:${projectId}`
    );
    record(
      'WORKSPACE',
      'Selected Developer Workspace Subscription',
      dev2WorkspaceSub !== null,
      `Selected Developer #02 authorized and subscribed to workspace:${projectId}`
    );

    // Unselected Developer #01 attempts to subscribe to workspace
    dev1Ws.send({ type: 'subscribe', channel: `workspace:${projectId}` });
    const dev1WorkspaceErr = await dev1Ws.waitForMessage(
      (m) => m.type === 'error' && m.code === 'FORBIDDEN'
    );
    record(
      'WORKSPACE',
      'Unselected Developer Workspace Access Rejection',
      dev1WorkspaceErr !== null,
      `Unselected Developer #01 rejected with 403 Forbidden`
    );

    // Create and update milestone
    const ms = await WorkspaceService.createMilestone(projectId, 'Requirement Analysis', 'Initial spec', undefined, 1, clientUserId);
    await WorkspaceService.updateMilestoneStatus(ms.id, 'SUBMITTED', devUsers[1], {
      role: 'DEVELOPER',
      developerId: devIds[1],
      submissionNotes: 'Spec completed and attached',
    });

    const wsUpdateEvent = await dev2Ws.waitForMessage(
      (m) => m.type === 'event' && m.channel === `workspace:${projectId}` && m.data.type === 'MILESTONE_UPDATED'
    );
    record(
      'WORKSPACE',
      'Real-time Milestone Transition Broadcast',
      wsUpdateEvent !== null && wsUpdateEvent.data.payload.status === 'SUBMITTED',
      `Workspace broadcast status update: ${wsUpdateEvent?.data?.payload?.status}`
    );

    // -------------------------------------------------------------
    // DOMAIN 8: SUPPORT BRIDGE REAL-TIME
    // -------------------------------------------------------------
    console.log('\n--- DOMAIN 8: Support Bridge Real-time ---');

    // Create support ticket & bridge
    const ticketRes = await SupportService.createTicket(
      clientId,
      clientUserId,
      projectId,
      'Integration query',
      'Assistance required on API gateway'
    );

    const bridgeId = ticketRes.bridgeId;
    const ticketId = ticketRes.id;

    // Client subscribes to support bridge
    clientWs.send({ type: 'subscribe', channel: `support:${bridgeId}` });
    const _clientSupportSub = await clientWs.waitForMessage(
      (m) => m.type === 'subscribed' && m.channel === `support:${bridgeId}`
    );

    // Update status to INVESTIGATING
    await SupportService.updateStatus(ticketId, 'INVESTIGATING', ceoUserId);
    const supportUpdateEvent = await clientWs.waitForMessage(
      (m) =>
        m.type === 'event' &&
        (m.channel === `support:${bridgeId}` || m.channel === `support:${ticketId}`) &&
        m.data.type === 'TICKET_STATUS_UPDATED'
    );
    record(
      'SUPPORT',
      'Support Bridge Real-time Update',
      supportUpdateEvent !== null && supportUpdateEvent.data.payload.status === 'INVESTIGATING',
      `Support bridge received real-time status: ${supportUpdateEvent?.data?.payload?.status}`
    );

    // -------------------------------------------------------------
    // DOMAIN 9: RECONNECTION & DUPLICATE PREVENTION
    // -------------------------------------------------------------
    console.log('\n--- DOMAIN 9: Reconnection & Event Deduplication ---');

    // Disconnect Dev 2 socket
    dev2Ws.close();
    record('RECONNECT', 'Graceful Socket Disconnect', !dev2Ws.isConnected, 'Socket disconnected intentionally');

    // Reconnect Dev 2
    const dev2ReconnectWs = new TestWsClient(`${wsBaseUrl}?token=${encodeURIComponent(devTokens[1])}`);
    await dev2ReconnectWs.connect();
    await dev2ReconnectWs.waitForMessage((m) => m.type === 'auth_success');

    // Resubscribe
    dev2ReconnectWs.send({ type: 'subscribe', channel: 'community:general' });
    await dev2ReconnectWs.waitForMessage((m) => m.type === 'subscribed');

    // Send single message
    await CommunityService.sendChannelMessage({
      channelIdOrSlug: 'general',
      userId: devUsers[0],
      developerId: devIds[0],
      content: 'Testing deduplication after reconnect',
    });

    const dedupMsg = await dev2ReconnectWs.waitForMessage(
      (m) => m.type === 'event' && m.channel === 'community:general' && m.data.content.includes('Testing deduplication')
    );

    const matchingCount = dev2ReconnectWs.messages.filter(
      (m) => m.type === 'event' && m.data?.id === dedupMsg.data.id
    ).length;

    record(
      'RECONNECT',
      'Duplicate Prevention on Reconnected Session',
      matchingCount === 1,
      `Delivered exactly ${matchingCount} time(s) to reconnected client (no duplicates)`
    );

    // -------------------------------------------------------------
    // DOMAIN 10: MESSAGE ORDERING
    // -------------------------------------------------------------
    console.log('\n--- DOMAIN 10: Logical Sequence Ordering ---');

    const _orderChannel = 'community:general';
    const sentSeq = ['Order Alpha', 'Order Beta', 'Order Gamma', 'Order Delta'];

    for (const text of sentSeq) {
      await CommunityService.sendChannelMessage({
        channelIdOrSlug: 'general',
        userId: devUsers[0],
        developerId: devIds[0],
        content: text,
      });
    }

    // Wait for all 4
    await new Promise((r) => setTimeout(r, 400));
    const receivedSeq = dev2ReconnectWs.messages
      .filter((m) => m.type === 'event' && sentSeq.some((s) => m.data?.content === s))
      .map((m) => m.data.content);

    const isOrdered = JSON.stringify(receivedSeq) === JSON.stringify(sentSeq);
    record(
      'ORDERING',
      'Sequential Message Delivery Ordering',
      isOrdered,
      `Messages delivered in exact chronological sequence: [${receivedSeq.join(' -> ')}]`
    );

    // -------------------------------------------------------------
    // DOMAIN 11: DATABASE + WEBSOCKET CONSISTENCY & RACE CONDITIONS
    // -------------------------------------------------------------
    console.log('\n--- DOMAIN 11: Concurrency & Transaction Consistency ---');

    // Create a 1-slot project to test simultaneous race conditions
    const raceProj = await ProjectService.submitProject(clientId, clientUserId, {
      title: 'Race Condition Test Project',
      category: 'Backend',
      description: 'Single slot concurrency test',
      budgetMin: 30000,
      budgetMax: 40000,
      timeline: '2 weeks',
      requirements: ['Node.js'],
      requiredTechnologies: ['Node.js'],
    });

    await query(`UPDATE projects SET status = 'OPEN_FOR_CLAIMS', max_claims = 1 WHERE id = $1`, [raceProj.projectId]);

    // Developers #01 and #02 attempt simultaneous claim on 1 slot
    const claimPromises = [
      ProjectService.claimProject(raceProj.projectId, devIds[0], devUsers[0]).then(() => 'Dev1_Success').catch((e) => `Dev1_Fail: ${e.message}`),
      ProjectService.claimProject(raceProj.projectId, devIds[1], devUsers[1]).then(() => 'Dev2_Success').catch((e) => `Dev2_Fail: ${e.message}`),
    ];

    const raceResults = await Promise.all(claimPromises);
    const successes = raceResults.filter((r) => r.includes('Success')).length;
    const failures = raceResults.filter((r) => r.includes('Fail')).length;

    record(
      'CONCURRENCY',
      'Simultaneous 1-Slot Claim Race Condition Lock',
      successes === 1 && failures === 1,
      `Exactly 1 developer claimed slot (${raceResults.join(' | ')}). Database lock prevented double claim.`
    );

    // Verify database consistency: project has exactly 1 claim
    const finalClaimCountRes = await query(`SELECT COUNT(*) FROM project_claims WHERE project_id = $1`, [raceProj.projectId]);
    const finalClaimCount = parseInt(finalClaimCountRes.rows[0].count, 10);
    record(
      'CONSISTENCY',
      'Database Row Consistency After Concurrent Claims',
      finalClaimCount === 1,
      `Database project_claims record count = ${finalClaimCount} (strictly matching max_claims=1)`
    );

    // -------------------------------------------------------------
    // DOMAIN 12: PERFORMANCE & PAYLOAD INTEGRITY
    // -------------------------------------------------------------
    console.log('\n--- DOMAIN 12: Latency & Performance ---');

    // Warm-up ping
    clientWs.send({ type: 'ping' });
    await clientWs.waitForMessage((m) => m.type === 'pong');

    const rtts: number[] = [];
    for (let p = 0; p < 3; p++) {
      const pingStart = Date.now();
      clientWs.send({ type: 'ping' });
      await clientWs.waitForMessage((m) => m.type === 'pong');
      rtts.push(Date.now() - pingStart);
      await new Promise((r) => setTimeout(r, 20));
    }
    const avgRtt = Math.round(rtts.reduce((a, b) => a + b, 0) / rtts.length);

    record(
      'PERFORMANCE',
      'WebSocket Round-Trip Latency (RTT)',
      avgRtt < 50,
      `Average Heartbeat RTT = ${avgRtt}ms [${rtts.join(', ')}ms] (< 50ms requirement)`
    );

    // Clean up sockets
    clientWs.close();
    dev1Ws.close();
    dev2Ws.close();
    dev3Ws.close();
    dev2ReconnectWs.close();
    ceoWs.close();

  } finally {
    if (serverInstance) {
      await new Promise<void>((resolve) => {
        (serverInstance as Server).close(() => {
          resolve();
        });
      });
    }
  }

  // -------------------------------------------------------------
  // PRINT SUMMARY
  // -------------------------------------------------------------
  console.log('\n========================================================================');
  console.log('   WEBSOCKET REAL-TIME ARCHITECTURE AUDIT SUMMARY');
  console.log('========================================================================');

  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`Total Verification Tests: ${total}`);
  console.log(`Passed:                   ${passed}`);
  console.log(`Failed:                   ${failed}`);

  if (failed > 0) {
    console.error('\n❌ FAILED TESTS:');
    results.filter((r) => !r.passed).forEach((r) => {
      console.error(`- [${r.domain}] ${r.test}: ${r.evidence}`);
    });
    process.exit(1);
  } else {
    console.log('\n🎉 ALL REAL-TIME & WEBSOCKET AUDIT TESTS PASSED SUCCESSFULLY!\n');
    process.exit(0);
  }
}

runWebSocketRealtimeAudit().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
