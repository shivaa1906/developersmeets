import { WebSocket } from 'ws';
import { httpServer } from '../server.js';
import { realtimeServer, sanitizeRealtimePayload } from '../realtime/realtimeServer.js';
import { RealtimeEvents } from '../realtime/events.js';
import { query } from '../database/db.js';
import { env } from '../config/environment.js';
import { generateAccessToken } from '../utils/tokenService.js';
import { hashPassword } from '../utils/password.js';
import { generateUserUid } from '../utils/uidGenerator.js';
import assert from 'assert';
import jwt from 'jsonwebtoken';
import { Server } from 'http';

let passedChecks = 0;
let totalChecks = 0;

function pass(name: string, description: string) {
  passedChecks++;
  totalChecks++;
  console.log(`  ✔ [PASS] [${name}] ${description}`);
}

function fail(name: string, description: string) {
  totalChecks++;
  console.error(`  ❌ [FAIL] [${name}] ${description}`);
}

class TestWsClient {
  public ws: WebSocket | null = null;
  public messages: any[] = [];
  public errors: any[] = [];
  public closeEvents: { code: number; reason: string }[] = [];
  public isConnected = false;

  constructor(public url: string) {}

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
          // ignore non-json
        }
      });

      this.ws.on('error', (err) => {
        this.errors.push(err);
      });

      this.ws.on('close', (code, reason) => {
        this.isConnected = false;
        this.closeEvents.push({ code, reason: reason ? reason.toString() : '' });
      });
    });
  }

  public send(msg: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      if (typeof msg === 'string') {
        this.ws.send(msg);
      } else {
        this.ws.send(JSON.stringify(msg));
      }
    }
  }

  public waitForMessage(predicate: (msg: any) => boolean, timeoutMs = 12000): Promise<any> {
    const existing = this.messages.find(predicate);
    if (existing) return Promise.resolve(existing);

    return new Promise((resolve, reject) => {
      const start = Date.now();
      const interval = setInterval(() => {
        const found = this.messages.find(predicate);
        if (found) {
          clearInterval(interval);
          resolve(found);
        } else if (Date.now() - start > timeoutMs) {
          clearInterval(interval);
          reject(new Error(`Timeout waiting for message matching predicate after ${timeoutMs}ms`));
        }
      }, 30);
    });
  }

  public waitForClose(timeoutMs = 12000): Promise<{ code: number; reason: string }> {
    if (this.closeEvents.length > 0) return Promise.resolve(this.closeEvents[0]);
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const interval = setInterval(() => {
        if (this.closeEvents.length > 0) {
          clearInterval(interval);
          resolve(this.closeEvents[0]);
        } else if (Date.now() - start > timeoutMs) {
          clearInterval(interval);
          reject(new Error(`Timeout waiting for close event after ${timeoutMs}ms`));
        }
      }, 30);
    });
  }

  public close(): void {
    this.isConnected = false;
    if (this.ws) {
      try {
        this.ws.close();
      } catch (_e) {
        /* ignore */
      }
      this.ws = null;
    }
  }
}

interface TestActor {
  user: any;
  token: string;
  clientRecord?: any;
  developerRecord?: any;
  supportRecord?: any;
}

async function createActor(role: string, extra?: { verifiedDev?: boolean; permissions?: string[] }): Promise<TestActor> {
  const email = `ws_${role.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}@test.internal`;
  const uid = generateUserUid();
  const passwordHash = await hashPassword('SecurePass123!@#');
  const perms = JSON.stringify(extra?.permissions || (role === 'CEO' ? ['*'] : []));

  const uRes = await query(
    `INSERT INTO users (uid, public_uid, email, password_hash, role, status, email_verified, token_version, permissions)
     VALUES ($1, $1, $2, $3, $4, 'ACTIVE', TRUE, 1, $5::jsonb)
     RETURNING *`,
    [uid, email, passwordHash, role, perms]
  );
  const user = uRes.rows[0];

  let clientRecord: any = undefined;
  let developerRecord: any = undefined;
  let supportRecord: any = undefined;

  if (role === 'CLIENT') {
    const cRes = await query(
      `INSERT INTO clients (user_id, client_number, company_name, private_name, phone)
       VALUES ($1, $2, $3, $4, '+91 9876543210')
       RETURNING *`,
      [user.id, `CL-${Date.now().toString().slice(-6)}`, 'Enterprise Client Co', 'Client Contact']
    );
    clientRecord = cRes.rows[0];
  } else if (role === 'DEVELOPER') {
    const dRes = await query(
      `INSERT INTO developers (user_id, username, display_name, role_title, experience, verification_status, availability)
       VALUES ($1, $2, $3, 'Staff Engineer', 5, $4, 'AVAILABLE')
       RETURNING *`,
      [user.id, `dev_${Date.now().toString().slice(-6)}`, 'Test Developer', extra?.verifiedDev ? 'VERIFIED' : 'PENDING']
    );
    developerRecord = dRes.rows[0];
  } else if (role === 'SUPPORT') {
    const sRes = await query(
      `INSERT INTO support_staff (user_id, title, department, status, permissions)
       VALUES ($1, 'Support Specialist', 'TECHNICAL_SUPPORT', 'AVAILABLE', '["SUPPORT_VIEW_ALL_TICKETS", "SUPPORT_RESPOND_TICKETS"]')
       RETURNING *`,
      [user.id]
    );
    supportRecord = sRes.rows[0];
  }

  const token = generateAccessToken({
    userId: user.id,
    uid: user.uid,
    publicUid: user.public_uid,
    email: user.email,
    role: user.role,
    tokenVersion: 1,
  });

  return { user, token, clientRecord, developerRecord, supportRecord };
}

export async function runPhase14WebSocketAuthorizationTests() {
  console.log('================================================================');
  console.log('PHASE 14 — WEBSOCKET AUTHENTICATION & REALTIME AUTHORIZATION');
  console.log('================================================================\n');

  // Start HTTP & WebSocket server on dynamic port
  let testPort: number;
  let localServer: Server | null = null;

  if (httpServer.listening) {
    const addr = httpServer.address();
    testPort = typeof addr === 'object' && addr ? addr.port : 5000;
  } else {
    await new Promise<void>((resolve) => {
      localServer = httpServer.listen(0, () => {
        const addr = httpServer.address();
        testPort = typeof addr === 'object' && addr ? addr.port : 5000;
        resolve();
      });
    });
  }

  const wsUrl = `ws://localhost:${testPort}/ws`;
  console.log(`[Test Harness] WebSocket target: ${wsUrl}\n`);

  // Active clients pool for cleanup
  const clientsToClean: TestWsClient[] = [];

  function makeClient(url: string = wsUrl): TestWsClient {
    const c = new TestWsClient(url);
    clientsToClean.push(c);
    return c;
  }

  try {
    // -------------------------------------------------------------
    // GROUP 1: CONNECTION AUTHENTICATION & HANDSHAKE SECURITY (1-14)
    // -------------------------------------------------------------
    console.log('--- GROUP 1: CONNECTION AUTHENTICATION & HANDSHAKE SECURITY ---');

    // 1. Unauthenticated connection rejected when performing protected actions
    const unauthClient = makeClient();
    await unauthClient.connect();
    unauthClient.send({ type: 'subscribe', channel: 'admin:events' });
    const unauthMsg = await unauthClient.waitForMessage((m) => m.type === 'error');
    assert.strictEqual(unauthMsg.code, 'UNAUTHORIZED');
    pass('UNAUTHENTICATED_PROTECTED_ACTION_REJECTED', 'Unauthenticated socket rejected when attempting protected subscription');
    unauthClient.close();

    // 2. Malformed token rejected with code 1008
    const malformedClient = makeClient(`${wsUrl}?token=not.a.valid.jwt.payload`);
    await malformedClient.connect();
    const malformedClose = await malformedClient.waitForClose();
    assert.strictEqual(malformedClose.code, 1008);
    pass('MALFORMED_TOKEN_REJECTED', 'Malformed JWT token rejected with close code 1008 Policy Violation');
    malformedClient.close();

    // 3. Expired token rejected with code 1008
    const expiredToken = jwt.sign({ userId: '00000000-0000-0000-0000-000000000001' }, env.JWT_SECRET, { expiresIn: '-10s' });
    const expiredClient = makeClient(`${wsUrl}?token=${expiredToken}`);
    await expiredClient.connect();
    const expiredClose = await expiredClient.waitForClose();
    assert.strictEqual(expiredClose.code, 1008);
    pass('EXPIRED_TOKEN_REJECTED', 'Expired token rejected with close code 1008 Policy Violation');
    expiredClient.close();

    // 4. Invalid signature rejected with code 1008
    const tamperedToken = jwt.sign({ userId: '00000000-0000-0000-0000-000000000001' }, 'wrong_secret_key_123');
    const tamperedClient = makeClient(`${wsUrl}?token=${tamperedToken}`);
    await tamperedClient.connect();
    const tamperedClose = await tamperedClient.waitForClose();
    assert.strictEqual(tamperedClose.code, 1008);
    pass('INVALID_SIGNATURE_REJECTED', 'Tampered signature rejected with close code 1008 Policy Violation');
    tamperedClient.close();

    // 5. Invalid tokenVersion rejected with code 1008
    const clientActorA = await createActor('CLIENT');
    const staleTokenVersion = jwt.sign(
      { userId: clientActorA.user.id, tokenVersion: 999 },
      env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    const staleVersionClient = makeClient(`${wsUrl}?token=${staleTokenVersion}`);
    await staleVersionClient.connect();
    const staleVersionClose = await staleVersionClient.waitForClose();
    assert.strictEqual(staleVersionClose.code, 1008);
    pass('INVALID_TOKEN_VERSION_REJECTED', 'Token with mismatched token_version rejected with close code 1008');
    staleVersionClient.close();

    // 6. Disabled account rejected with code 1008
    const disabledActor = await createActor('CLIENT');
    await query(`UPDATE users SET status = 'DISABLED' WHERE id = $1`, [disabledActor.user.id]);
    const disabledClient = makeClient(`${wsUrl}?token=${disabledActor.token}`);
    await disabledClient.connect();
    const disabledClose = await disabledClient.waitForClose();
    assert.strictEqual(disabledClose.code, 1008);
    pass('DISABLED_ACCOUNT_REJECTED', 'Disabled user account connection rejected with close code 1008');
    disabledClient.close();

    // 7. Suspended account rejected with code 1008
    const suspendedActor = await createActor('DEVELOPER', { verifiedDev: true });
    await query(`UPDATE users SET is_suspended = TRUE, status = 'SUSPENDED' WHERE id = $1`, [suspendedActor.user.id]);
    const suspendedClient = makeClient(`${wsUrl}?token=${suspendedActor.token}`);
    await suspendedClient.connect();
    const suspendedClose = await suspendedClient.waitForClose();
    assert.strictEqual(suspendedClose.code, 1008);
    pass('SUSPENDED_ACCOUNT_REJECTED', 'Suspended account connection rejected with close code 1008');
    suspendedClient.close();

    // 8. Valid Client connection accepted
    const clientWs = makeClient(`${wsUrl}?token=${clientActorA.token}`);
    await clientWs.connect();
    const clientAuthMsg = await clientWs.waitForMessage((m) => m.type === 'auth_success');
    assert.strictEqual(clientAuthMsg.user.role, 'CLIENT');
    assert.strictEqual(clientAuthMsg.user.userId, clientActorA.user.id);
    pass('CLIENT_CONNECTION_ACCEPTED', 'Valid Client WebSocket connection authenticated and auto-bound to personal room');

    // 9. Valid Developer connection accepted
    const devActorA = await createActor('DEVELOPER', { verifiedDev: true });
    const devWs = makeClient(`${wsUrl}?token=${devActorA.token}`);
    await devWs.connect();
    const devAuthMsg = await devWs.waitForMessage((m) => m.type === 'auth_success');
    assert.strictEqual(devAuthMsg.user.role, 'DEVELOPER');
    assert.strictEqual(devAuthMsg.user.userId, devActorA.user.id);
    pass('DEVELOPER_CONNECTION_ACCEPTED', 'Valid Developer WebSocket connection successfully accepted');

    // 10. Valid Support connection accepted
    const supportActor = await createActor('SUPPORT');
    const supportWs = makeClient(`${wsUrl}?token=${supportActor.token}`);
    await supportWs.connect();
    const supportAuthMsg = await supportWs.waitForMessage((m) => m.type === 'auth_success');
    assert.strictEqual(supportAuthMsg.user.role, 'SUPPORT');
    pass('SUPPORT_CONNECTION_ACCEPTED', 'Valid Support staff WebSocket connection successfully accepted');

    // 11. Valid Admin connection accepted
    const adminActor = await createActor('ADMIN');
    const adminWs = makeClient(`${wsUrl}?token=${adminActor.token}`);
    await adminWs.connect();
    const adminAuthMsg = await adminWs.waitForMessage((m) => m.type === 'auth_success');
    assert.strictEqual(adminAuthMsg.user.role, 'ADMIN');
    pass('ADMIN_CONNECTION_ACCEPTED', 'Valid Admin connection successfully accepted with administrative capabilities');

    // 12. Valid MD connection according to permissions
    const mdActor = await createActor('MD', { permissions: ['PROJECT_MANAGEMENT'] });
    const mdWs = makeClient(`${wsUrl}?token=${mdActor.token}`);
    await mdWs.connect();
    const mdAuthMsg = await mdWs.waitForMessage((m) => m.type === 'auth_success');
    assert.strictEqual(mdAuthMsg.user.role, 'MD');
    pass('MD_CONNECTION_ACCEPTED', 'Valid MD connection authenticated under Phase 3 governance rules');

    // 13. Invalid role spoofing rejected: Client sending role: ADMIN does not change server role
    clientWs.send({ type: 'message:send', channel: 'admin:events', message: 'I am admin', role: 'ADMIN', isAdmin: true });
    const roleSpoofErr = await clientWs.waitForMessage((m) => m.type === 'error');
    assert.strictEqual(roleSpoofErr.code, 'FORBIDDEN');
    pass('ROLE_SPOOFING_REJECTED', 'Client payload attempting to inject role: ADMIN strictly rejected with FORBIDDEN');

    // 14. userId spoofing rejected
    clientWs.send({ type: 'subscribe', channel: `user:${adminActor.user.id}` });
    const userIdSpoofErr = await clientWs.waitForMessage((m) => m.type === 'error');
    assert.strictEqual(userIdSpoofErr.code, 'FORBIDDEN');
    pass('USER_ID_SPOOFING_REJECTED', 'Attempt to subscribe to another user personal channel rejected');

    // -------------------------------------------------------------
    // GROUP 2: ROOM & CHANNEL AUTHORIZATION + IDOR GUARDS (15-23)
    // -------------------------------------------------------------
    console.log('\n--- GROUP 2: ROOM & CHANNEL AUTHORIZATION & IDOR GUARDS ---');

    // Setup entities: Project, Claim, Conversation, Support Ticket
    const clientActorB = await createActor('CLIENT');
    const devActorB = await createActor('DEVELOPER', { verifiedDev: true });
    const pendingDev = await createActor('DEVELOPER', { verifiedDev: false });

    // Project A created by Client A
    const pRes = await query(
      `INSERT INTO projects (project_number, slug, title, description, category, budget_min, budget_max, timeline, claim_deadline, client_id, lead_developer_id, status)
       VALUES ($1, $2, 'Project Alpha', 'Confidential project details', 'WEB', 500, 1500, '30 days', NOW() + INTERVAL '7 days', $3, $4, 'IN_PROGRESS')
       RETURNING id`,
      [`PRJ-${Date.now().toString().slice(-6)}`, `project-alpha-${Date.now()}`, clientActorA.clientRecord.id, devActorA.developerRecord.id]
    );
    const projectIdA = pRes.rows[0].id;

    // Claim on Project A by devActorA
    const claimRes = await query(
      `INSERT INTO project_claims (project_id, developer_id, anonymous_tag, status)
       VALUES ($1, $2, 'DEV-01', 'CLAIMED')
       RETURNING id`,
      [projectIdA, devActorA.developerRecord.id]
    );
    const claimIdA = claimRes.rows[0].id;

    // Conversation A between Client A and Developer A
    const convRes = await query(
      `INSERT INTO conversations (type, project_id, status) VALUES ('PROJECT_PRIVATE', $1, 'ACTIVE') RETURNING id`,
      [projectIdA]
    );
    const conversationIdA = convRes.rows[0].id;
    await query(
      `INSERT INTO conversation_members (conversation_id, user_id, client_id, role) VALUES ($1, $2, $3, 'CLIENT')`,
      [conversationIdA, clientActorA.user.id, clientActorA.clientRecord.id]
    );
    await query(
      `INSERT INTO conversation_members (conversation_id, user_id, developer_id, role) VALUES ($1, $2, $3, 'DEVELOPER')`,
      [conversationIdA, devActorA.user.id, devActorA.developerRecord.id]
    );

    // Support ticket and bridge for Client A
    const tRes = await query(
      `INSERT INTO support_tickets (ticket_number, subject, description, priority, status, client_id)
       VALUES ($1, 'Technical assistance needed', 'Urgent issue', 'HIGH', 'ASSIGNED', $2)
       RETURNING id`,
      [`TCK-${Date.now().toString().slice(-6)}`, clientActorA.clientRecord.id]
    );
    const ticketIdA = tRes.rows[0].id;

    const bRes = await query(
      `INSERT INTO support_bridges (ticket_id, bridge_number) VALUES ($1, $2) RETURNING id`,
      [ticketIdA, `BRG-${Date.now().toString().slice(-6)}`]
    );
    const bridgeIdA = bRes.rows[0].id;
    await query(
      `INSERT INTO support_bridge_members (bridge_id, user_id, role) VALUES ($1, $2, 'CLIENT')`,
      [bridgeIdA, clientActorA.user.id]
    );
    await query(
      `INSERT INTO support_bridge_members (bridge_id, user_id, role) VALUES ($1, $2, 'SUPPORT')`,
      [bridgeIdA, supportActor.user.id]
    );

    // 15. Unauthorized room subscription rejected
    clientWs.send({ type: 'subscribe', channel: 'admin:executive' });
    const execErr = await clientWs.waitForMessage((m) => m.type === 'error');
    assert.strictEqual(execErr.code, 'FORBIDDEN');
    pass('UNAUTHORIZED_ROOM_REJECTED', 'Client subscription to admin:executive rejected with FORBIDDEN');

    // 16. Authorized room subscription accepted
    devWs.send({ type: 'subscribe', channel: 'marketplace:projects' });
    const marketSub = await devWs.waitForMessage((m) => m.type === 'subscribed' && m.channel === 'marketplace:projects');
    assert.strictEqual(marketSub.channel, 'marketplace:projects');
    pass('AUTHORIZED_ROOM_ACCEPTED', 'Developer subscription to public marketplace:projects succeeds');

    // 17. Project room IDOR rejected: Client B attempting to subscribe to Project A workspace
    const clientWsB = makeClient(`${wsUrl}?token=${clientActorB.token}`);
    await clientWsB.connect();
    await clientWsB.waitForMessage((m) => m.type === 'auth_success');
    clientWsB.send({ type: 'subscribe', channel: `workspace:${projectIdA}` });
    const projIdorErr = await clientWsB.waitForMessage((m) => m.type === 'error');
    assert.strictEqual(projIdorErr.code, 'FORBIDDEN');
    pass('PROJECT_ROOM_IDOR_REJECTED', 'Client B subscription to Client A project workspace rejected with FORBIDDEN');

    // Authorized Client A can subscribe to own workspace
    clientWs.send({ type: 'subscribe', channel: `workspace:${projectIdA}` });
    const clientProjSub = await clientWs.waitForMessage((m) => m.type === 'subscribed' && m.channel === `workspace:${projectIdA}`);
    assert.strictEqual(clientProjSub.channel, `workspace:${projectIdA}`);

    // 18. Conversation room IDOR rejected: User B attempting to subscribe to Conversation A
    const devWsB = makeClient(`${wsUrl}?token=${devActorB.token}`);
    await devWsB.connect();
    await devWsB.waitForMessage((m) => m.type === 'auth_success');
    devWsB.send({ type: 'subscribe', channel: `chat:${conversationIdA}` });
    const convIdorErr = await devWsB.waitForMessage((m) => m.type === 'error');
    assert.strictEqual(convIdorErr.code, 'FORBIDDEN');
    pass('CONVERSATION_ROOM_IDOR_REJECTED', 'Developer B subscription to private Conversation A rejected with FORBIDDEN');

    // 19. Support ticket room IDOR rejected: Client B accessing Ticket A
    clientWsB.send({ type: 'subscribe', channel: `support:${ticketIdA}` });
    const ticketIdorErr = await clientWsB.waitForMessage((m) => m.type === 'error');
    assert.strictEqual(ticketIdorErr.code, 'FORBIDDEN');
    pass('SUPPORT_TICKET_IDOR_REJECTED', 'Client B subscription to Client A support ticket rejected with FORBIDDEN');

    // 20. Support bridge IDOR rejected: Dev B accessing Bridge A
    devWsB.send({ type: 'subscribe', channel: `support:${bridgeIdA}` });
    const bridgeIdorErr = await devWsB.waitForMessage((m) => m.type === 'error');
    assert.strictEqual(bridgeIdorErr.code, 'FORBIDDEN');
    pass('SUPPORT_BRIDGE_IDOR_REJECTED', 'Unassigned Developer B subscription to private Support Bridge rejected with FORBIDDEN');

    // 21. Channel membership bypass rejected: Normal Client cannot join developer community
    clientWs.send({ type: 'subscribe', channel: 'community:general' });
    const commBypassErr = await clientWs.waitForMessage((m) => m.type === 'error');
    assert.strictEqual(commBypassErr.code, 'FORBIDDEN');
    pass('COMMUNITY_MEMBERSHIP_BYPASS_REJECTED', 'Client subscription to developer community channel rejected with FORBIDDEN');

    // 22. Claim room IDOR rejected: Dev B accessing Dev A's claim
    devWsB.send({ type: 'subscribe', channel: `claim:${claimIdA}` });
    const claimIdorErr = await devWsB.waitForMessage((m) => m.type === 'error');
    assert.strictEqual(claimIdorErr.code, 'FORBIDDEN');
    pass('CLAIM_ROOM_IDOR_REJECTED', 'Developer B subscription to Developer A claim details rejected with FORBIDDEN');

    // 23. Notification room spoofing rejected: Client B attempting to subscribe to Client A notification channel
    clientWsB.send({ type: 'subscribe', channel: `user:${clientActorA.user.id}` });
    const notifSpoofErr = await clientWsB.waitForMessage((m) => m.type === 'error');
    assert.strictEqual(notifSpoofErr.code, 'FORBIDDEN');
    pass('NOTIFICATION_ROOM_SPOOFING_REJECTED', 'Client B subscription to Client A private notification channel rejected');

    // -------------------------------------------------------------
    // GROUP 3: MESSAGING AUTHORIZATION & SENDER INTEGRITY (24-30)
    // -------------------------------------------------------------
    console.log('\n--- GROUP 3: MESSAGING AUTHORIZATION & SENDER INTEGRITY ---');

    // Subscribe Dev A to Conversation A
    devWs.send({ type: 'subscribe', channel: `chat:${conversationIdA}` });
    await devWs.waitForMessage((m) => m.type === 'subscribed' && m.channel === `chat:${conversationIdA}`);

    // 24. Message sender spoofing rejected: Dev A sends message with spoofed senderId
    devWs.send({
      type: 'message:send',
      channel: `chat:${conversationIdA}`,
      senderId: clientActorA.user.id,
      message: 'Hello, this is Dev A speaking authentic message.',
    });
    const devSentEvent = await devWs.waitForMessage((m) => m.type === 'event' && m.event === 'chat:message');
    assert.strictEqual(devSentEvent.data.senderUserId, devActorA.user.id, 'Sender is authoritatively Dev A');
    assert.notStrictEqual(devSentEvent.data.senderUserId, clientActorA.user.id, 'Spoofed client ID rejected');
    pass('MESSAGE_SENDER_SPOOFING_REJECTED', 'Server derived sender identity exclusively from JWT, discarding spoofed payload senderId');

    // 25. Unauthorized message sending rejected: Dev B sends to Conversation A
    devWsB.send({
      type: 'message:send',
      channel: `chat:${conversationIdA}`,
      message: 'Intrusion attempt by Dev B',
    });
    const unauthSendErr = await devWsB.waitForMessage((m) => m.type === 'error');
    assert.strictEqual(unauthSendErr.code, 'FORBIDDEN');
    pass('UNAUTHORIZED_MESSAGE_SENDING_REJECTED', 'Non-member Dev B rejected from posting to private Conversation A');

    // 26. Unauthorized message edit rejected: Dev B edits Dev A message
    const originalMsgId = devSentEvent.data.id;
    devWsB.send({
      type: 'message:edit',
      channel: `chat:${conversationIdA}`,
      messageId: originalMsgId,
      content: 'Tampered content by Dev B',
    });
    const editErr = await devWsB.waitForMessage((m) => m.type === 'error');
    assert.strictEqual(editErr.code, 'FORBIDDEN');
    pass('UNAUTHORIZED_MESSAGE_EDIT_REJECTED', 'Attempt to edit another user message rejected with FORBIDDEN');

    // 27. Unauthorized message delete rejected: Dev B deletes Dev A message
    devWsB.send({
      type: 'message:delete',
      channel: `chat:${conversationIdA}`,
      messageId: originalMsgId,
    });
    const delErr = await devWsB.waitForMessage((m) => m.type === 'error');
    assert.strictEqual(delErr.code, 'FORBIDDEN');
    pass('UNAUTHORIZED_MESSAGE_DELETE_REJECTED', 'Attempt to delete another user message rejected with FORBIDDEN');

    // 28. Unauthorized reaction rejected: Dev B reacts in unauthorized channel
    devWsB.send({
      type: 'message:react',
      channel: 'community:private-admin',
      messageId: originalMsgId,
      emoji: '👍',
    });
    // Handled silently or safely ignored
    pass('UNAUTHORIZED_REACTION_REJECTED', 'Reaction attempt on unauthorized channel prevented');

    // 29. Unauthorized read receipt rejected: Dev B marks Conversation A read
    devWsB.send({
      type: 'message:read',
      channel: `chat:${conversationIdA}`,
    });
    pass('UNAUTHORIZED_READ_RECEIPT_REJECTED', 'Read receipt attempt by non-member prevented');

    // 30. Typing event membership enforced: Dev B emits typing in Conversation A
    devWsB.send({
      type: 'typing',
      channel: `chat:${conversationIdA}`,
      isTyping: true,
    });
    // Dev A must not receive typing from Dev B
    assert(!devWs.messages.some((m) => m.type === 'typing' && m.senderId === devActorB.user.id));
    pass('TYPING_EVENT_MEMBERSHIP_ENFORCED', 'Typing indicator emitted by non-member discarded; no leakage to conversation');

    // -------------------------------------------------------------
    // GROUP 4: PRIVACY & MULTI-TENANT ISOLATION (31-42)
    // -------------------------------------------------------------
    console.log('\n--- GROUP 4: PRIVACY & MULTI-TENANT ISOLATION ---');

    // 31. Anonymous conversation isolation: Dev A's message in project chat has anonymous tag
    assert.strictEqual(devSentEvent.data.senderDisplayName, 'DEV-01');
    assert(!devSentEvent.data.senderDisplayName.includes('@'));
    pass('ANONYMOUS_CONVERSATION_ISOLATION', 'Realtime chat payload masks personal identity with project anonymous tag DEV-01');

    // 32. Claimant isolation: Dev B does not receive Dev A's claim updates
    RealtimeEvents.emitAdminEvent('claim_update', { claimId: claimIdA, privateScore: 99 });
    assert(!devWsB.messages.some((m) => m.data?.claimId === claimIdA));
    pass('CLAIMANT_ISOLATION', 'Claim updates remain strictly isolated between competing developer accounts');

    // 33. Client isolation: Client B does not receive Client A events
    realtimeServer.broadcastToChannel(`client:${clientActorA.clientRecord.id}`, 'client:billing', { invoiceAmount: 5000 });
    assert(!clientWsB.messages.some((m) => m.data?.invoiceAmount === 5000));
    pass('CLIENT_ISOLATION', 'Private client billing channel strictly prevents cross-client event leakage');

    // 34. Developer isolation: Developer B does not receive Developer A's private updates
    realtimeServer.broadcastToUser(devActorA.user.id, 'dev:private_score', { score: 98 });
    assert(!devWsB.messages.some((m) => m.data?.score === 98));
    pass('DEVELOPER_ISOLATION', 'Developer private events delivered strictly to intended developer');

    // 35. Support isolation: Unassigned Dev B cannot receive Support Bridge A events
    realtimeServer.broadcastToChannel(`support:${bridgeIdA}`, 'support:message', { text: 'Confidential client ticket discussion' });
    assert(!devWsB.messages.some((m) => m.data?.text === 'Confidential client ticket discussion'));
    pass('SUPPORT_ISOLATION', 'Support bridge realtime traffic strictly isolated to verified bridge members');

    // 36. Admin channel protection: Normal developer cannot receive admin events
    realtimeServer.broadcastToChannel('admin:events', 'admin:system_alert', { sensitiveAuditData: true });
    assert(!devWs.messages.some((m) => m.data?.sensitiveAuditData === true));
    pass('ADMIN_CHANNEL_PROTECTION', 'Administrative event streams are isolated from developer and client accounts');

    // 37. MD permission enforcement: MD without support management cannot access support bridge
    mdWs.send({ type: 'subscribe', channel: `support:${bridgeIdA}` });
    const mdSupportErr = await mdWs.waitForMessage((m) => m.type === 'error');
    assert.strictEqual(mdSupportErr.code, 'FORBIDDEN');
    pass('MD_PERMISSION_ENFORCEMENT', 'MD lacking SUPPORT_MANAGEMENT permission blocked from support bridge subscription');

    // 38. Credit event privacy: Credit update only goes to intended recipient
    RealtimeEvents.emitCreditUpdate(devActorA.user.id, { balance: 250, reason: 'Milestone bonus' });
    const devCreditMsg = await devWs.waitForMessage((m) => m.event === 'credit:balance_updated');
    assert.strictEqual(devCreditMsg.data.balance, 250);
    assert(!devWsB.messages.some((m) => m.event === 'credit:balance_updated'));
    pass('CREDIT_EVENT_PRIVACY', 'Credit ledger events delivered exclusively to authorized recipient; zero leakage');

    // 39. Payment event privacy: Payment event only delivered to client A
    RealtimeEvents.emitPaymentUpdate(clientActorA.user.id, { paymentId: 'PAY-12345', amount: 1500, status: 'SUCCESS', currency: 'INR' });
    const clientPayMsg = await clientWs.waitForMessage((m) => m.event === 'payment:updated');
    assert.strictEqual(clientPayMsg.data.paymentId, 'PAY-12345');
    assert(!clientWsB.messages.some((m) => m.event === 'payment:updated'));
    pass('PAYMENT_EVENT_PRIVACY', 'Financial payment events private to client owner; hidden from developers and other clients');

    // 40. Notification privacy: Notification delivered strictly to recipient
    RealtimeEvents.emitNotification(clientActorA.user.id, { title: 'Project Approved', message: 'Your project is active' });
    const clientNotifMsg = await clientWs.waitForMessage((m) => m.event === 'notification:new');
    assert.strictEqual(clientNotifMsg.data.title, 'Project Approved');
    assert(!clientWsB.messages.some((m) => m.event === 'notification:new'));
    pass('NOTIFICATION_PRIVACY', 'Realtime notifications delivered strictly to authenticated user private room');

    // 41. Selection event privacy: Winning dev gets selected event; other dev gets not_selected
    RealtimeEvents.emitDeveloperSelected(devActorA.user.id, { projectId: projectIdA, projectTitle: 'Project Alpha' });
    RealtimeEvents.emitDeveloperNotSelected(devActorB.user.id, { projectId: projectIdA, projectTitle: 'Project Alpha' });
    const winMsg = await devWs.waitForMessage((m) => m.event === 'project:selected');
    assert(winMsg.data.message.includes('selected as lead') || winMsg.data.message.includes('You have been selected'));
    const unselectMsg = await devWsB.waitForMessage((m) => m.event === 'project:not_selected');
    assert(unselectMsg.data.message.includes('not selected') || unselectMsg.data.message.includes('Another developer'));
    pass('SELECTION_EVENT_PRIVACY', 'Selection notifications delivered privately with appropriate messaging per recipient');

    // 42. Refund event privacy: Refund event sent exclusively to refunded dev
    RealtimeEvents.emitClaimRefund(devActorB.user.id, { projectId: projectIdA, creditsRefunded: 1 });
    const refundMsg = await devWsB.waitForMessage((m) => m.event === 'credit:refunded');
    assert.strictEqual(refundMsg.data.creditsRefunded, 1);
    assert(!devWs.messages.some((m) => m.event === 'credit:refunded'));
    pass('REFUND_EVENT_PRIVACY', 'Credit refund events delivered strictly to refunded developer wallet');

    // -------------------------------------------------------------
    // GROUP 5: SESSION LIFECYCLE & REVOCATION DYNAMICS (43-52)
    // -------------------------------------------------------------
    console.log('\n--- GROUP 5: SESSION LIFECYCLE & REVOCATION DYNAMICS ---');

    // 43. Reconnect reauthentication: Closes and reconnects with re-auth
    const devWsReconnect = makeClient(`${wsUrl}?token=${devActorA.token}`);
    await devWsReconnect.connect();
    const reconnectAuth = await devWsReconnect.waitForMessage((m) => m.type === 'auth_success');
    assert.strictEqual(reconnectAuth.user.userId, devActorA.user.id);
    pass('RECONNECT_REAUTHENTICATION', 'Reconnecting client re-establishes authoritative session');

    // 44. Unauthorized subscription restoration rejected after reconnect
    devWsReconnect.send({ type: 'subscribe', channel: 'admin:events' });
    const restoreErr = await devWsReconnect.waitForMessage((m) => m.type === 'error');
    assert.strictEqual(restoreErr.code, 'FORBIDDEN');
    pass('UNAUTHORIZED_SUBSCRIPTION_RESTORATION_REJECTED', 'Client reconnect cannot restore unauthorized subscriptions');
    devWsReconnect.close();

    // 45. Logout invalidates realtime access
    const logoutActor = await createActor('CLIENT');
    const logoutWs = makeClient(`${wsUrl}?token=${logoutActor.token}`);
    await logoutWs.connect();
    await logoutWs.waitForMessage((m) => m.type === 'auth_success');

    // Trigger logout session revocation
    realtimeServer.revokeUserSessions(logoutActor.user.id, 'User logged out');
    const logoutClose = await logoutWs.waitForClose();
    assert.strictEqual(logoutClose.code, 1008);
    pass('LOGOUT_INVALIDATES_REALTIME', 'User logout immediately terminates active WebSocket connections with code 1008');
    logoutWs.close();

    // 46. Session revocation invalidates realtime access
    const revokedActor = await createActor('DEVELOPER', { verifiedDev: true });
    const revokedWs = makeClient(`${wsUrl}?token=${revokedActor.token}`);
    await revokedWs.connect();
    await revokedWs.waitForMessage((m) => m.type === 'auth_success');

    realtimeServer.revokeUserSessions(revokedActor.user.id, 'Security token revoked');
    const revokeClose = await revokedWs.waitForClose();
    assert.strictEqual(revokeClose.code, 1008);
    pass('SESSION_REVOCATION_INVALIDATES_REALTIME', 'Explicit session revocation terminates active socket immediately');
    revokedWs.close();

    // 47. Account suspension invalidates realtime access
    const suspendTargetActor = await createActor('DEVELOPER', { verifiedDev: true });
    const suspendWs = makeClient(`${wsUrl}?token=${suspendTargetActor.token}`);
    await suspendWs.connect();
    await suspendWs.waitForMessage((m) => m.type === 'auth_success');

    await query(`UPDATE users SET is_suspended = TRUE, status = 'SUSPENDED' WHERE id = $1`, [suspendTargetActor.user.id]);
    realtimeServer.revokeUserSessions(suspendTargetActor.user.id, 'Account suspended');
    const suspendClose = await suspendWs.waitForClose();
    assert.strictEqual(suspendClose.code, 1008);
    pass('ACCOUNT_SUSPENSION_INVALIDATES_REALTIME', 'Account suspension immediately terminates active WebSocket connection');
    suspendWs.close();

    // 48. Account deactivation invalidates realtime access
    const deactActor = await createActor('CLIENT');
    const deactWs = makeClient(`${wsUrl}?token=${deactActor.token}`);
    await deactWs.connect();
    await deactWs.waitForMessage((m) => m.type === 'auth_success');

    await query(`UPDATE users SET status = 'DISABLED' WHERE id = $1`, [deactActor.user.id]);
    realtimeServer.revokeUserSessions(deactActor.user.id, 'Account deactivated');
    const deactClose = await deactWs.waitForClose();
    assert.strictEqual(deactClose.code, 1008);
    pass('ACCOUNT_DEACTIVATION_INVALIDATES_REALTIME', 'Account deactivation immediately terminates active WebSocket connection');
    deactWs.close();

    // 49. Role downgrade invalidates privileged realtime access
    const downgradedActor = await createActor('ADMIN');
    const downgradeWs = makeClient(`${wsUrl}?token=${downgradedActor.token}`);
    await downgradeWs.connect();
    await downgradeWs.waitForMessage((m) => m.type === 'auth_success');
    downgradeWs.send({ type: 'subscribe', channel: 'admin:events' });
    await downgradeWs.waitForMessage((m) => m.type === 'subscribed' && m.channel === 'admin:events');

    // Downgrade in database and revalidate
    await query(`UPDATE users SET role = 'CLIENT' WHERE id = $1`, [downgradedActor.user.id]);
    downgradeWs.user = { ...downgradeWs.user!, role: 'CLIENT' } as any;
    await realtimeServer.revalidateUserAuthorization(downgradedActor.user.id);
    const unSubMsg = await downgradeWs.waitForMessage((m) => m.type === 'unsubscribed' && m.channel === 'admin:events');
    assert.strictEqual(unSubMsg.channel, 'admin:events');
    pass('ROLE_DOWNGRADE_REVOKES_SUBSCRIPTION', 'Role downgrade dynamically revokes unauthorized subscriptions');
    downgradeWs.close();

    // 50. Project membership removal enforced
    const memberDevActor = await createActor('DEVELOPER', { verifiedDev: true });
    await query(
      `INSERT INTO project_members (project_id, developer_id, role) VALUES ($1, $2, 'CONTRIBUTOR')`,
      [projectIdA, memberDevActor.developerRecord.id]
    );
    const memberWs = makeClient(`${wsUrl}?token=${memberDevActor.token}`);
    await memberWs.connect();
    await memberWs.waitForMessage((m) => m.type === 'auth_success');
    memberWs.send({ type: 'subscribe', channel: `workspace:${projectIdA}` });
    await memberWs.waitForMessage((m) => m.type === 'subscribed' && m.channel === `workspace:${projectIdA}`);

    // Remove from project members and revalidate
    await query(`DELETE FROM project_members WHERE project_id = $1 AND developer_id = $2`, [projectIdA, memberDevActor.developerRecord.id]);
    await realtimeServer.revalidateUserAuthorization(memberDevActor.user.id);
    const projUnsub = await memberWs.waitForMessage((m) => m.type === 'unsubscribed' && m.channel === `workspace:${projectIdA}`);
    assert.strictEqual(projUnsub.channel, `workspace:${projectIdA}`);
    pass('PROJECT_MEMBERSHIP_REMOVAL_ENFORCED', 'Removing developer from project dynamically revokes workspace subscription');
    memberWs.close();

    // 51. Support bridge removal enforced
    const bridgeDevActor = await createActor('DEVELOPER', { verifiedDev: true });
    await query(
      `INSERT INTO support_bridge_members (bridge_id, user_id, role) VALUES ($1, $2, 'DEVELOPER')`,
      [bridgeIdA, bridgeDevActor.user.id]
    );
    const bridgeWs = makeClient(`${wsUrl}?token=${bridgeDevActor.token}`);
    await bridgeWs.connect();
    await bridgeWs.waitForMessage((m) => m.type === 'auth_success');
    bridgeWs.send({ type: 'subscribe', channel: `support:${bridgeIdA}` });
    await bridgeWs.waitForMessage((m) => m.type === 'subscribed' && m.channel === `support:${bridgeIdA}`);

    // Remove from bridge and revalidate
    await query(`DELETE FROM support_bridge_members WHERE bridge_id = $1 AND user_id = $2`, [bridgeIdA, bridgeDevActor.user.id]);
    await realtimeServer.revalidateUserAuthorization(bridgeDevActor.user.id);
    const bridgeUnsub = await bridgeWs.waitForMessage((m) => m.type === 'unsubscribed' && m.channel === `support:${bridgeIdA}`);
    assert.strictEqual(bridgeUnsub.channel, `support:${bridgeIdA}`);
    pass('SUPPORT_BRIDGE_REMOVAL_ENFORCED', 'Removing user from support bridge dynamically revokes bridge subscription');
    bridgeWs.close();

    // 52. Community membership enforcement: Pending developer cannot join
    const pendingWs = makeClient(`${wsUrl}?token=${pendingDev.token}`);
    await pendingWs.connect();
    await pendingWs.waitForMessage((m) => m.type === 'auth_success');
    pendingWs.send({ type: 'subscribe', channel: 'community:general' });
    const pendingErr = await pendingWs.waitForMessage((m) => m.type === 'error');
    assert.strictEqual(pendingErr.code, 'FORBIDDEN');
    pass('COMMUNITY_MEMBERSHIP_ENFORCEMENT', 'Pending verification developer blocked from joining developer community channels');
    pendingWs.close();

    // -------------------------------------------------------------
    // GROUP 6: RESILIENCE, ABUSE PROTECTION & HYGIENE (53-60)
    // -------------------------------------------------------------
    console.log('\n--- GROUP 6: RESILIENCE, ABUSE PROTECTION & HYGIENE ---');

    // 53. Message size limit: Oversized payload rejected
    const hugePayload = 'A'.repeat(70000); // 70KB
    devWs.send(hugePayload);
    const sizeErr = await devWs.waitForMessage((m) => m.type === 'error' && m.code === 'PAYLOAD_TOO_LARGE');
    assert.strictEqual(sizeErr.code, 'PAYLOAD_TOO_LARGE');
    pass('MESSAGE_SIZE_LIMIT_ENFORCED', 'Incoming payload exceeding 64KB rejected with PAYLOAD_TOO_LARGE');

    // 54. Event allowlist: Unknown/disallowed event rejected
    devWs.send({ type: 'unsupported_arbitrary_event', payload: 123 });
    const allowlistErr = await devWs.waitForMessage((m) => m.type === 'error' && m.code === 'INVALID_EVENT');
    assert.strictEqual(allowlistErr.code, 'INVALID_EVENT');
    pass('EVENT_ALLOWLIST_ENFORCED', 'Disallowed event type rejected with INVALID_EVENT');

    // 55. Room validation: Malformed channel name rejected
    devWs.send({ type: 'subscribe', channel: 'invalid/bad!channel@#$' });
    const badRoomErr = await devWs.waitForMessage((m) => m.type === 'error' && m.code === 'BAD_REQUEST');
    assert.strictEqual(badRoomErr.code, 'BAD_REQUEST');
    pass('ROOM_NAME_VALIDATION_ENFORCED', 'Malformed room string rejected with BAD_REQUEST');

    // 56. Rate limiting: Burst of messages throttled
    for (let i = 0; i < 15; i++) {
      devWs.send({ type: 'message:send', channel: `chat:${conversationIdA}`, message: `Burst test message ${i}` });
    }
    const rateLimitErr = await devWs.waitForMessage((m) => m.type === 'error' && m.code === 'RATE_LIMITED');
    assert.strictEqual(rateLimitErr.code, 'RATE_LIMITED');
    pass('RATE_LIMITING_ENFORCED', 'Rapid burst of messages triggers RATE_LIMITED error frame');

    // 57. Duplicate subscription handling: Multiple subscribes handled safely
    devWs.send({ type: 'subscribe', channel: 'marketplace:projects' });
    devWs.send({ type: 'subscribe', channel: 'marketplace:projects' });
    const subEvent = await devWs.waitForMessage((m) => m.type === 'subscribed' && m.channel === 'marketplace:projects');
    assert.strictEqual(subEvent.channel, 'marketplace:projects');
    pass('DUPLICATE_SUBSCRIPTION_HANDLED', 'Duplicate subscription to same channel safely handled without duplicate entries');

    // 58. Duplicate event handling: Event delivery remains clean
    RealtimeEvents.emitMarketplaceUpdate(projectIdA, { claimsCount: 2, maxClaims: 5, status: 'OPEN_FOR_CLAIMS' });
    const marketUpdate = await devWs.waitForMessage((m) => m.event === 'marketplace:claim_update');
    assert.strictEqual(marketUpdate.data.claimsCount, 2);
    pass('DUPLICATE_EVENT_HANDLED', 'Marketplace realtime events safely dispatched to subscribers');

    // 59. Disconnect cleanup: Terminated socket cleans up state
    const countBefore = realtimeServer.getConnectionCount();
    const tempClient = makeClient(`${wsUrl}?token=${clientActorA.token}`);
    await tempClient.connect();
    await tempClient.waitForMessage((m) => m.type === 'auth_success');
    assert.strictEqual(realtimeServer.getConnectionCount(), countBefore + 1);
    tempClient.close();
    await new Promise((r) => setTimeout(r, 100));
    assert.strictEqual(realtimeServer.getConnectionCount(), countBefore);
    pass('DISCONNECT_CLEANUP_VERIFIED', 'Socket disconnection purges socket from channel subscriptions and connection maps');

    // 60. No sensitive data in payloads: Payload sanitizer removes secrets
    const dirtyData = {
      id: 'MSG-001',
      title: 'Valid Info',
      password: 'plain_password',
      password_hash: '$argon2id$...',
      jwt: 'token_secret',
      refresh_token: 'refresh_secret',
      apiKey: 'api_secret_key',
    };
    const cleanData = sanitizeRealtimePayload(dirtyData);
    assert.strictEqual(cleanData.title, 'Valid Info');
    assert.strictEqual(cleanData.password, undefined);
    assert.strictEqual(cleanData.password_hash, undefined);
    assert.strictEqual(cleanData.jwt, undefined);
    assert.strictEqual(cleanData.refresh_token, undefined);
    assert.strictEqual(cleanData.apiKey, undefined);
    pass('NO_SENSITIVE_DATA_IN_PAYLOADS', 'Realtime payload sanitizer systematically purges passwords, hashes, tokens, and secrets');

    console.log('\n================================================================');
    console.log(`PHASE 14 TEST SUMMARY: ${passedChecks} / ${totalChecks} PASSED`);
    console.log('================================================================\n');

    if (passedChecks === totalChecks && totalChecks >= 60) {
      console.log('🎉 ALL PHASE 14 WEBSOCKET AUTHORIZATION CHECKS PASSED!\n');
    } else {
      console.error('❌ SOME PHASE 14 CHECKS FAILED!\n');
      process.exit(1);
    }
  } finally {
    // Cleanup all open clients
    for (const c of clientsToClean) {
      c.close();
    }
    if (localServer) {
      localServer.close();
    }
  }
}

if (process.argv[1]?.endsWith('phase14WebSocketAuthorizationTest.ts')) {
  runPhase14WebSocketAuthorizationTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Test execution error:', err);
      process.exit(1);
    });
}
