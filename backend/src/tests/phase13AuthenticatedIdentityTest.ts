process.env.NODE_ENV = 'test';

import assert from 'assert';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, withTransaction } from '../database/db.js';
import { httpServer } from '../server.js';
import { ROLES, LEADERSHIP } from '../config/constants.js';
import { generateAccessToken } from '../utils/tokenService.js';
import { hashPassword } from '../utils/password.js';
import { generateUserUid } from '../utils/uidGenerator.js';
import { NotificationService } from '../services/notificationService.js';
import { SupportService } from '../services/supportService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let server: http.Server;
let baseUrl: string;

let passedChecks = 0;
let totalChecks = 0;

function pass(category: string, desc: string) {
  totalChecks++;
  passedChecks++;
  console.log(`  ✔ [PASS] [${category}] ${desc}`);
}

async function api(
  pathUrl: string,
  options: RequestInit = {}
): Promise<{ status: number; body: any; headers: Headers }> {
  const res = await fetch(`${baseUrl}${pathUrl}`, {
    redirect: 'manual',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...options.headers,
    },
  });

  const text = await res.text();
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body, headers: res.headers };
}

async function setupSuite() {
  server = httpServer;
  if (!server.listening) {
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const port = (server.address() as any).port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  } else {
    const port = (server.address() as any).port;
    baseUrl = `http://127.0.0.1:${port}`;
  }
}

interface TestUser {
  user: any;
  token: string;
  client?: any;
  developer?: any;
  supportStaff?: any;
}

async function createTestClient(tag: string): Promise<TestUser> {
  const email = `client_${tag}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}@test.internal`;
  const uid = generateUserUid();
  const passwordHash = await hashPassword('SecurePass123!@#');

  const uRes = await query(
    `INSERT INTO users (uid, public_uid, email, password_hash, role, status, email_verified, token_version)
     VALUES ($1, $1, $2, $3, 'CLIENT', 'ACTIVE', TRUE, 1)
     RETURNING *`,
    [uid, email, passwordHash]
  );
  const user = uRes.rows[0];

  const cRes = await query(
    `INSERT INTO clients (user_id, client_number, company_name, private_name, phone)
     VALUES ($1, $2, $3, $4, '+91 9876543210')
     RETURNING *`,
    [user.id, `CLT-2026-${Math.floor(1000 + Math.random() * 9000)}`, `Company ${tag}`, `Client Name ${tag}`]
  );

  const token = generateAccessToken({
    userId: user.id,
    uid: user.uid,
    publicUid: user.public_uid,
    email: user.email,
    role: user.role,
    tokenVersion: 1,
  });

  return { user, token, client: cRes.rows[0] };
}

async function createTestDeveloper(tag: string, verified: boolean = true): Promise<TestUser> {
  const email = `dev_${tag}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}@test.internal`;
  const username = `dev_${tag}_${Math.random().toString(36).substring(2, 8)}`;
  const uid = generateUserUid();
  const passwordHash = await hashPassword('SecurePass123!@#');

  const uRes = await query(
    `INSERT INTO users (uid, public_uid, email, password_hash, role, status, email_verified, token_version)
     VALUES ($1, $1, $2, $3, 'DEVELOPER', 'ACTIVE', TRUE, 1)
     RETURNING *`,
    [uid, email, passwordHash]
  );
  const user = uRes.rows[0];

  const dRes = await query(
    `INSERT INTO developers (user_id, username, display_name, role_title, experience, verification_status, availability)
     VALUES ($1, $2, $3, 'Full Stack Engineer', 5, $4, 'AVAILABLE')
     RETURNING *`,
    [user.id, username, `Developer ${tag}`, verified ? 'VERIFIED' : 'PENDING']
  );
  const developer = dRes.rows[0];

  // Create credit account with 10 credits
  await query(
    `INSERT INTO credit_accounts (user_id, developer_id, balance)
     VALUES ($1, $2, 10)
     ON CONFLICT (developer_id) DO UPDATE SET balance = 10`,
    [user.id, developer.id]
  );

  // Link TypeScript skill to developer for claim eligibility
  const sRes = await query(
    `INSERT INTO skills (name, category) VALUES ('TypeScript', 'Languages')
     ON CONFLICT (name) DO UPDATE SET name = 'TypeScript' RETURNING id`
  );
  await query(
    `INSERT INTO developer_skills (developer_id, skill_id, experience_level)
     VALUES ($1, $2, 'EXPERT') ON CONFLICT DO NOTHING`,
    [developer.id, sRes.rows[0].id]
  );

  const token = generateAccessToken({
    userId: user.id,
    uid: user.uid,
    publicUid: user.public_uid,
    email: user.email,
    role: user.role,
    tokenVersion: 1,
  });

  return { user, token, developer };
}

async function createTestSupportStaff(tag: string): Promise<TestUser> {
  const email = `support_${tag}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}@test.internal`;
  const uid = generateUserUid();
  const passwordHash = await hashPassword('SecurePass123!@#');

  const uRes = await query(
    `INSERT INTO users (uid, public_uid, email, password_hash, role, status, email_verified, token_version)
     VALUES ($1, $1, $2, $3, 'SUPPORT', 'ACTIVE', TRUE, 1)
     RETURNING *`,
    [uid, email, passwordHash]
  );
  const user = uRes.rows[0];

  const sRes = await query(
    `INSERT INTO support_staff (user_id, title, department, status, permissions)
     VALUES ($1, 'Customer Support Specialist', 'TECHNICAL_SUPPORT', 'AVAILABLE', '["SUPPORT_VIEW_ALL_TICKETS", "SUPPORT_RESPOND_TICKETS"]')
     RETURNING *`,
    [user.id]
  );

  const token = generateAccessToken({
    userId: user.id,
    uid: user.uid,
    publicUid: user.public_uid,
    email: user.email,
    role: user.role,
    tokenVersion: 1,
  });

  return { user, token, supportStaff: sRes.rows[0] };
}

async function getAdminUser(): Promise<TestUser> {
  const email = 'shivaa1906@gmail.com';
  const uRes = await query('SELECT * FROM users WHERE email = $1', [email]);
  let user = uRes.rows[0];
  if (!user) {
    const passwordHash = await hashPassword('CeoStrongPassword123!@#');
    const inserted = await query(
      `INSERT INTO users (email, uid, public_uid, role, status, email_verified, password_hash, permissions, token_version)
       VALUES ($1, 'CEO1906EXECUTIVE', 'CEO1906EXECUTIVE', 'CEO', 'ACTIVE', TRUE, $2, '["*"]'::jsonb, 1)
       RETURNING *`,
      [email, passwordHash]
    );
    user = inserted.rows[0];
  }

  const token = generateAccessToken({
    userId: user.id,
    uid: user.uid,
    publicUid: user.public_uid,
    email: user.email,
    role: user.role,
    tokenVersion: user.token_version || 1,
  });

  return { user, token };
}

export async function runPhase13Tests() {
  console.log('================================================================');
  console.log('PHASE 13 — SUPPORT / CREDITS / PROJECTS AUTHENTICATED IDENTITY');
  console.log('================================================================\n');

  await setupSuite();

  // Create actors
  const clientA = await createTestClient('Alpha');
  const clientB = await createTestClient('Beta');
  const devA = await createTestDeveloper('Delta', true);
  const devB = await createTestDeveloper('Epsilon', true);
  const devPending = await createTestDeveloper('PendingDev', false);
  const supportUser = await createTestSupportStaff('Agent');
  const adminUser = await getAdminUser();

  console.log('--- SECTION 1: CLIENT PROJECT OWNERSHIP & ACCESS CONTROL ---');

  // Vector 1: Client can access own project
  const createProjRes = await api('/api/projects/submit', {
    method: 'POST',
    headers: { Authorization: `Bearer ${clientA.token}` },
    body: JSON.stringify({
      title: 'Confidential Client Project Alpha',
      category: 'WEB',
      description: 'Proprietary enterprise project details for client A.',
      budgetMin: 500,
      budgetMax: 1500,
      timeline: '30 days',
      requirements: ['TypeScript'],
      requiredTechnologies: ['TypeScript'],
    }),
  });
  assert.strictEqual(createProjRes.status, 201, 'Client A project submitted successfully');
  const projectIdA = createProjRes.body.projectId || createProjRes.body.project?.id;
  assert(projectIdA, 'Project ID exists');

  const getOwnProjRes = await api(`/api/projects/${projectIdA}`, {
    headers: { Authorization: `Bearer ${clientA.token}` },
  });
  assert.strictEqual(getOwnProjRes.status, 200, 'Client A can access own project');
  assert.strictEqual(getOwnProjRes.body.project.id, projectIdA);
  pass('CLIENT_ACCESS_OWN_PROJECT', 'Authenticated client successfully accesses own submitted project');

  // Vector 2: Client cannot access another client's project
  const getOtherProjRes = await api(`/api/projects/${projectIdA}`, {
    headers: { Authorization: `Bearer ${clientB.token}` },
  });
  assert.strictEqual(getOtherProjRes.status, 403, 'Client B forbidden from accessing Client A project');
  pass('CLIENT_CANNOT_ACCESS_OTHER_PROJECT', 'Client B access to Client A private project rejected with 403 Forbidden');

  // Vector 3: Client cannot modify another client's project
  const patchOtherProjRes = await api(`/api/projects/${projectIdA}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${clientB.token}` },
    body: JSON.stringify({
      title: 'Tampered Title by Client B',
    }),
  });
  assert.strictEqual(patchOtherProjRes.status, 403, 'Client B forbidden from modifying Client A project');
  pass('CLIENT_CANNOT_MODIFY_OTHER_PROJECT', 'IDOR update attempt on Client A project rejected with 403 Forbidden');

  // Client A can modify own project
  const patchOwnProjRes = await api(`/api/projects/${projectIdA}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${clientA.token}` },
    body: JSON.stringify({
      title: 'Updated Confidential Client Project Alpha',
    }),
  });
  assert.strictEqual(patchOwnProjRes.status, 200, 'Client A can update own project');
  pass('CLIENT_MODIFY_OWN_PROJECT', 'Owner client successfully updates own project details');

  console.log('\n--- SECTION 2: DEVELOPER PROJECT ACCESS & WORKSPACE ISOLATION ---');

  // Vector 5: Developer cannot access unauthorized project in SUBMITTED state
  const devAccessSubmittedRes = await api(`/api/projects/${projectIdA}`, {
    headers: { Authorization: `Bearer ${devA.token}` },
  });
  assert.strictEqual(devAccessSubmittedRes.status, 403, 'Developer cannot view project under review');
  pass('DEV_CANNOT_ACCESS_UNAUTHORIZED_PROJECT', 'Developer access to project under administrative review rejected with 403');

  // Approve project to open for claims
  const approveRes = await api(`/api/admin/projects/${projectIdA}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminUser.token}` },
    body: JSON.stringify({ maxClaims: 5, deadlineDays: 7 }),
  });
  assert.strictEqual(approveRes.status, 200, 'Admin approves project');

  // Vector 4: Developer can access authorized project (opened for claims)
  const devAccessOpenProjRes = await api(`/api/projects/${projectIdA}`, {
    headers: { Authorization: `Bearer ${devA.token}` },
  });
  assert.strictEqual(devAccessOpenProjRes.status, 200, 'Developer can access open marketplace project');
  pass('DEV_ACCESS_AUTHORIZED_PROJECT', 'Verified developer successfully accesses marketplace project open for claims');

  // Vector 6 & 7: Developer claim belongs strictly to authenticated developer
  const claimRes = await api(`/api/projects/${projectIdA}/claim`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${devA.token}` },
    body: JSON.stringify({ developerId: devB.developer.id }), // Attempted spoof of devB's ID in body
  });
  assert.strictEqual(claimRes.status, 200, 'Developer A claims slot');

  // Verify DB record: developer_id must be devA, NOT devB
  const dbClaimRes = await query('SELECT * FROM project_claims WHERE project_id = $1', [projectIdA]);
  assert.strictEqual(dbClaimRes.rows.length, 1);
  assert.strictEqual(dbClaimRes.rows[0].developer_id, devA.developer.id, 'Claim bound to Dev A session');
  pass('DEV_CLAIM_BELONGS_TO_AUTH_DEV', 'Project claim authoritatively assigned to authenticated developer session identity');
  pass('DEV_CANNOT_IMPERSONATE_OTHER_DEV', 'Body developerId spoofing discarded; Dev A cannot claim on behalf of Dev B');

  // Vector 8: Client cannot create claim as developer
  const clientClaimAttempt = await api(`/api/projects/${projectIdA}/claim`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${clientA.token}` },
  });
  assert.strictEqual(clientClaimAttempt.status, 403, 'Client claim attempt rejected');
  pass('CLIENT_CANNOT_CLAIM_PROJECT', 'Client attempt to execute developer claim rejected with 403 Forbidden');

  // Vector 9: Developer cannot create client project
  const devCreateProjAttempt = await api('/api/projects/submit', {
    method: 'POST',
    headers: { Authorization: `Bearer ${devA.token}` },
    body: JSON.stringify({
      title: 'Dev Client Project',
      category: 'WEB',
      description: 'Dev trying to create client project',
      budgetMin: 500,
      budgetMax: 1000,
      timeline: '15 days',
    }),
  });
  assert.strictEqual(devCreateProjAttempt.status, 403, 'Developer project creation rejected');
  pass('DEV_CANNOT_CREATE_CLIENT_PROJECT', 'Developer attempt to submit client project rejected with 403 Forbidden');

  // Select Dev A and move project to IN_PROGRESS
  const selectRes = await api(`/api/projects/${projectIdA}/select`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${clientA.token}` },
    body: JSON.stringify({ selectedDeveloperId: devA.developer.id }),
  });
  assert.strictEqual(selectRes.status, 200, 'Client A selects Developer A');

  // Dev B (unrelated developer) attempts to access Dev A's now IN_PROGRESS project
  const devBAccessPrivateProj = await api(`/api/projects/${projectIdA}`, {
    headers: { Authorization: `Bearer ${devB.token}` },
  });
  assert.strictEqual(devBAccessPrivateProj.status, 403, 'Dev B rejected from Dev A private project');
  pass('DEV_CANNOT_ACCESS_OTHER_DEV_PRIVATE_PROJECT', 'Unassigned developer access to another developer private in-progress project rejected');

  // Workspace access check: Dev A can access workspace, Dev B cannot
  const devAWorkspaceRes = await api(`/api/workspace/${projectIdA}`, {
    headers: { Authorization: `Bearer ${devA.token}` },
  });
  assert.strictEqual(devAWorkspaceRes.status, 200, 'Assigned developer accesses workspace');

  const devBWorkspaceRes = await api(`/api/workspace/${projectIdA}`, {
    headers: { Authorization: `Bearer ${devB.token}` },
  });
  assert.strictEqual(devBWorkspaceRes.status, 403, 'Unassigned developer workspace access blocked');
  pass('WORKSPACE_IDOR_PROTECTION', 'Project workspace strictly restricted to assigned developer and client owner');

  console.log('\n--- SECTION 3: CREDITS & LEDGER AUTHENTICATION ---');

  // Vector 10: Credit balance belongs to authenticated user
  const devABalanceRes = await api('/api/credits/balance', {
    headers: { Authorization: `Bearer ${devA.token}` },
  });
  assert.strictEqual(devABalanceRes.status, 200);
  // Dev A started with 10 credits and spent 1 credit on claim -> balance should be 9
  assert.strictEqual(devABalanceRes.body.balance, 9, 'Dev A balance reflects deduction');
  pass('CREDIT_BALANCE_BELONGS_TO_AUTH_USER', 'Credit balance accurately retrieved from server ledger for authenticated user');

  // Vector 11: User cannot read another user's credits
  const devASpoofBalanceRes = await api(`/api/credits/balance?userId=${devB.user.id}&developerId=${devB.developer.id}`, {
    headers: { Authorization: `Bearer ${devA.token}` },
  });
  assert.strictEqual(devASpoofBalanceRes.status, 200);
  assert.strictEqual(devASpoofBalanceRes.body.balance, 9, 'Returns Dev A balance, ignoring Dev B query parameter');
  pass('USER_CANNOT_READ_OTHER_CREDITS', 'Query parameter spoofing ignored; balance strictly anchored to authenticated session');

  // Client cannot access credits wallet
  const clientCreditsRes = await api('/api/credits/balance', {
    headers: { Authorization: `Bearer ${clientA.token}` },
  });
  assert.strictEqual(clientCreditsRes.status, 403, 'Client forbidden from developer credit wallet');
  pass('CLIENT_FORBIDDEN_FROM_CREDIT_WALLET', 'Client account access to developer credits rejected with 403 Forbidden');

  // Vector 12: User cannot create another user's credit transaction
  const devAPurchaseForBRes = await api('/api/credits/purchase', {
    method: 'POST',
    headers: { Authorization: `Bearer ${devA.token}` },
    body: JSON.stringify({
      packageId: 'pkg_starter',
      developerId: devB.developer.id,
      userId: devB.user.id,
    }),
  });
  assert.strictEqual(devAPurchaseForBRes.status, 200);
  // Check Dev A's balance increased to 9 + 5 = 14, Dev B's balance remains 10
  const devBCheckRes = await api('/api/credits/balance', {
    headers: { Authorization: `Bearer ${devB.token}` },
  });
  assert.strictEqual(devBCheckRes.body.balance, 10, 'Dev B balance untouched');
  pass('USER_CANNOT_MUTATE_OTHER_CREDITS', 'Credit purchase strictly credited to authenticated user, ignoring spoofed target payload');

  console.log('\n--- SECTION 4: SUPPORT TICKETS & SUPPORT BRIDGES ---');

  // Vector 13: Client can create and read own support ticket
  const createTicketRes = await api('/api/support/tickets', {
    method: 'POST',
    headers: { Authorization: `Bearer ${clientA.token}` },
    body: JSON.stringify({
      subject: 'Assistance with Milestone Deliverables',
      description: 'Need review on backend architecture deliverable.',
      priority: 'HIGH',
      category: 'TECHNICAL',
      projectId: projectIdA,
    }),
  });
  assert.strictEqual(createTicketRes.status, 201, 'Ticket created');
  const ticketA = createTicketRes.body.ticket;
  assert(ticketA?.id, 'Ticket ID exists');

  const getOwnTicketRes = await api(`/api/support/tickets/${ticketA.id}`, {
    headers: { Authorization: `Bearer ${clientA.token}` },
  });
  assert.strictEqual(getOwnTicketRes.status, 200, 'Client A can read own ticket');
  assert.strictEqual(getOwnTicketRes.body.ticket.id, ticketA.id);
  pass('CLIENT_READ_OWN_TICKET', 'Client successfully accesses own created support ticket');

  // Vector 14: Client cannot read another client's support ticket
  const clientBReadTicketRes = await api(`/api/support/tickets/${ticketA.id}`, {
    headers: { Authorization: `Bearer ${clientB.token}` },
  });
  assert.strictEqual(clientBReadTicketRes.status, 403, 'Client B cannot read Client A ticket');
  pass('CLIENT_CANNOT_READ_OTHER_TICKET', 'Cross-client support ticket access rejected with 403 Forbidden');

  // Vector 15: Unrelated developer cannot read support ticket
  const devBReadTicketRes = await api(`/api/support/tickets/${ticketA.id}`, {
    headers: { Authorization: `Bearer ${devB.token}` },
  });
  assert.strictEqual(devBReadTicketRes.status, 403, 'Unrelated Dev B cannot read ticket');
  pass('DEV_CANNOT_READ_UNRELATED_TICKET', 'Unrelated developer access to private support ticket rejected with 403 Forbidden');

  // Assigned developer (Dev A) CAN read the support ticket because they are assigned to projectIdA
  const devAReadTicketRes = await api(`/api/support/tickets/${ticketA.id}`, {
    headers: { Authorization: `Bearer ${devA.token}` },
  });
  assert.strictEqual(devAReadTicketRes.status, 200, 'Assigned Dev A can access project ticket');
  pass('ASSIGNED_DEV_CAN_READ_PROJECT_TICKET', 'Assigned project developer successfully authorized for linked support ticket');

  // Vector 16: Authorized support staff member can access bridge
  const bridgeId = ticketA.bridge_id || ticketA.bridgeId;
  const supportBridgeRes = await api(`/api/support/bridges/${bridgeId}`, {
    headers: { Authorization: `Bearer ${supportUser.token}` },
  });
  assert.strictEqual(supportBridgeRes.status, 200, 'Support agent accesses bridge');
  pass('SUPPORT_STAFF_CAN_ACCESS_BRIDGE', 'Authorized support agent successfully accesses support bridge');

  // Vector 17: Unauthorized developer cannot send messages to bridge
  const devBSendBridgeMsgRes = await api(`/api/support/bridges/${bridgeId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${devB.token}` },
    body: JSON.stringify({ message: 'Unauthorized injection into bridge' }),
  });
  assert(devBSendBridgeMsgRes.status >= 400, 'Unauthorized developer cannot send bridge message');
  pass('UNAUTHORIZED_DEV_CANNOT_MESSAGE_BRIDGE', 'Non-member developer prohibited from sending messages to private support bridge');

  console.log('\n--- SECTION 5: NOTIFICATIONS PRIVACY & ISOLATION ---');

  // Vector 18 & 19: Notifications belong to authenticated user
  const notifA = await NotificationService.createNotification({
    userId: clientA.user.id,
    type: 'PROJECT_UPDATE',
    title: 'Milestone 1 Completed',
    message: 'Your milestone deliverable has been submitted.',
  });

  const clientANotifs = await api('/api/notifications', {
    headers: { Authorization: `Bearer ${clientA.token}` },
  });
  assert.strictEqual(clientANotifs.status, 200);
  const foundA = clientANotifs.body.notifications.some((n: any) => n.id === notifA.id);
  assert(foundA, 'Client A sees own notification');

  // Client B cannot see Client A's notification even if requested
  const clientBNotifs = await api(`/api/notifications?userId=${clientA.user.id}`, {
    headers: { Authorization: `Bearer ${clientB.token}` },
  });
  assert.strictEqual(clientBNotifs.status, 200);
  const foundInB = clientBNotifs.body.notifications.some((n: any) => n.id === notifA.id);
  assert(!foundInB, 'Client B does not see Client A notification');
  pass('NOTIFICATIONS_BELONG_TO_AUTH_USER', 'Notifications strictly belong to recipient; cross-user notification leakage prevented');

  // Client B cannot mark Client A's notification as read
  const clientBMarkRead = await api(`/api/notifications/${notifA.id}/read`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${clientB.token}` },
  });
  assert.strictEqual(clientBMarkRead.status, 404, 'Notification not found for Client B');
  pass('USER_CANNOT_MARK_OTHER_NOTIFICATION_READ', 'Attempt to mark another user notification as read returns 404');

  console.log('\n--- SECTION 6: PROFILE APIS & IDENTITY ENFORCEMENT ---');

  // Vector 20: Profile APIs enforce identity
  const meRes = await api('/api/me', {
    headers: { Authorization: `Bearer ${devA.token}` },
  });
  assert.strictEqual(meRes.status, 200);
  assert.strictEqual(meRes.body.user.id, devA.user.id);
  assert.strictEqual(meRes.body.user.role, 'DEVELOPER');
  assert.strictEqual(meRes.body.developer.id, devA.developer.id);
  pass('GET_API_ME_ENFORCES_IDENTITY', 'GET /api/me correctly returns authoritative authenticated profile');

  const devMeRes = await api('/api/developers/me', {
    headers: { Authorization: `Bearer ${devA.token}` },
  });
  assert.strictEqual(devMeRes.status, 200);
  assert.strictEqual(devMeRes.body.developer.id, devA.developer.id);
  pass('GET_API_DEV_ME_ENFORCES_IDENTITY', 'GET /api/developers/me retrieves authenticated developer record');

  // Client calling developer profile endpoint is rejected
  const clientDevMeRes = await api('/api/developers/me', {
    headers: { Authorization: `Bearer ${clientA.token}` },
  });
  assert.strictEqual(clientDevMeRes.status, 403, 'Client calling /api/developers/me rejected');
  pass('CLIENT_CALLING_DEV_ME_REJECTED', 'Client access to developer self-profile rejected with 403 Forbidden');

  console.log('\n--- SECTION 7: SPOOFING & MASS ASSIGNMENT DEFENSE ---');

  // Vector 21, 28, 29, 30: Frontend role, email, and userId spoofing in body rejected
  const clientSpoofAdmin = await api('/api/admin/users', {
    headers: {
      Authorization: `Bearer ${clientA.token}`,
      'x-role': 'ADMIN',
      'x-user-id': adminUser.user.id,
    },
  });
  assert.strictEqual(clientSpoofAdmin.status, 403, 'Client headers spoofing admin rejected');
  pass('FRONTEND_ROLE_SPOOFING_REJECTED', 'Client header and payload role manipulation fails; server uses JWT session role');

  // Developer spoofing admin role in credit adjustment
  const devAdjustCreditAttempt = await api('/api/credits/admin/adjust', {
    method: 'POST',
    headers: { Authorization: `Bearer ${devA.token}` },
    body: JSON.stringify({
      targetId: devA.user.id,
      amount: 1000,
      reason: 'Self awarded credits',
      role: 'ADMIN',
      isAdmin: true,
      isCEO: true,
    }),
  });
  assert.strictEqual(devAdjustCreditAttempt.status, 403, 'Dev credit adjustment rejected');
  pass('MASS_ASSIGNMENT_ROLE_ESCALATION_BLOCKED', 'Injected role, isAdmin, and isCEO fields ignored; credit manipulation blocked');

  // Vector 31 & 32: Admin endpoints reject Client and Developer
  const clientAdminUsers = await api('/api/admin/users', {
    headers: { Authorization: `Bearer ${clientA.token}` },
  });
  assert.strictEqual(clientAdminUsers.status, 403, 'Client rejected from admin routes');
  pass('ADMIN_REJECTS_CLIENT', 'Admin user listing endpoint strictly rejects client accounts');

  const devAdminUsers = await api('/api/admin/users', {
    headers: { Authorization: `Bearer ${devA.token}` },
  });
  assert.strictEqual(devAdminUsers.status, 403, 'Developer rejected from admin routes');
  pass('ADMIN_REJECTS_DEVELOPER', 'Admin user listing endpoint strictly rejects developer accounts');

  // Vector 33: Support staff rejected from credit management
  const supportCreditAdjust = await api('/api/credits/admin/adjust', {
    method: 'POST',
    headers: { Authorization: `Bearer ${supportUser.token}` },
    body: JSON.stringify({
      targetId: devA.user.id,
      amount: 100,
      reason: 'Support staff adjusting credits',
    }),
  });
  assert.strictEqual(supportCreditAdjust.status, 403, 'Support rejected from credit adjustment');
  pass('CREDIT_MANAGEMENT_REJECTS_SUPPORT', 'Support staff prohibited from credit adjustment by requireCreditManagement');

  // Vector 35: Admin credit adjustment succeeds
  const adminAdjustCredits = await api('/api/credits/admin/adjust', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminUser.token}` },
    body: JSON.stringify({
      targetId: devB.user.id,
      amount: 25,
      reason: 'Administrative authorized bonus credits',
    }),
  });
  assert.strictEqual(adminAdjustCredits.status, 200, 'Admin credit adjustment succeeded');
  pass('ADMIN_CREDIT_ADJUSTMENT_AUTHORIZED', 'Executive CEO/ADMIN successfully executes authenticated credit adjustment');

  console.log('\n--- SECTION 8: ACCOUNT STATUS & VERIFICATION STATE ENFORCEMENT ---');

  // Vector 36: Suspended account rejected from protected operations
  const suspendedClient = await createTestClient('Suspended');
  await query("UPDATE users SET is_suspended = TRUE, suspension_reason = 'Policy violation' WHERE id = $1", [suspendedClient.user.id]);

  const suspendedAttempt = await api('/api/projects/my-projects', {
    headers: { Authorization: `Bearer ${suspendedClient.token}` },
  });
  assert.strictEqual(suspendedAttempt.status, 403, 'Suspended client rejected');
  assert.strictEqual(suspendedAttempt.body.code, 'ACCOUNT_SUSPENDED');
  pass('SUSPENDED_ACCOUNT_REJECTED', 'Suspended account immediately blocked with 403 ACCOUNT_SUSPENDED');

  // Disabled account rejected
  const disabledClient = await createTestClient('Disabled');
  await query("UPDATE users SET status = 'DISABLED' WHERE id = $1", [disabledClient.user.id]);

  const disabledAttempt = await api('/api/projects/my-projects', {
    headers: { Authorization: `Bearer ${disabledClient.token}` },
  });
  assert.strictEqual(disabledAttempt.status, 403, 'Disabled client rejected');
  assert.strictEqual(disabledAttempt.body.code, 'ACCOUNT_DISABLED');
  pass('DISABLED_ACCOUNT_REJECTED', 'Disabled account immediately blocked with 403 ACCOUNT_DISABLED');

  // Vector 37: Pending developer cannot claim project slots
  const pendingClaimAttempt = await api(`/api/projects/${projectIdA}/claim`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${devPending.token}` },
  });
  assert.strictEqual(pendingClaimAttempt.status, 403, 'Pending developer rejected from claiming slot');
  pass('PENDING_DEV_CANNOT_CLAIM', 'Pending verification developer blocked from claiming marketplace slots');

  console.log('\n--- SECTION 9: CODEBASE HYGIENE & NO FAKE DATA IN PRODUCTION ---');

  // Vector 40: Zero mock or fake identities in production code paths
  const possiblePaths = [
    path.resolve('src/services/projectService.ts'),
    path.resolve('backend/src/services/projectService.ts'),
  ];
  const projServicePath = possiblePaths.find((p) => fs.existsSync(p)) || possiblePaths[0];
  const projServiceContent = fs.readFileSync(projServicePath, 'utf8');

  assert(!projServiceContent.includes('fakeDeveloper'), 'No fakeDeveloper in projectService');
  assert(!projServiceContent.includes('mockClient'), 'No mockClient in projectService');
  assert(!projServiceContent.includes('mockProject'), 'No mockProject in projectService');
  pass('NO_FAKE_DATA_IN_PROJECT_SERVICE', 'Zero mock, fake, or synthetic data in ProjectService production code');

  console.log('\n================================================================');
  console.log(`PHASE 13 TEST SUMMARY: ${passedChecks} / ${totalChecks} PASSED`);
  console.log('================================================================\n');

  if (passedChecks === totalChecks) {
    console.log('🎉 ALL PHASE 13 AUTHENTICATED IDENTITY CHECKS PASSED!\n');
  } else {
    console.error('❌ SOME PHASE 13 CHECKS FAILED!\n');
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith('phase13AuthenticatedIdentityTest.ts')) {
  runPhase13Tests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Test suite execution failed:', err);
      process.exit(1);
    });
}
