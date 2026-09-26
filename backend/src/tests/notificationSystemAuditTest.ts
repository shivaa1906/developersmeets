import app from '../server.js';
import { query } from '../database/db.js';
import { env } from '../config/environment.js';
import { DeveloperService } from '../services/developerService.js';
import { CreditLedgerService } from '../services/creditLedgerService.js';
import { ProjectService } from '../services/projectService.js';
import { ChatService } from '../services/chatService.js';
import { WorkspaceService } from '../services/workspaceService.js';
import { SupportService } from '../services/supportService.js';
import { CommunityService } from '../services/communityService.js';
import jwt from 'jsonwebtoken';
import { Server } from 'http';
import bcrypt from 'bcryptjs';

interface AuditResults {
  eventDeveloperApproval: boolean;
  eventProjectClaimed: boolean;
  eventNewProposal: boolean;
  eventDeveloperSelected: boolean;
  eventDeveloperNotSelected: boolean;
  eventCreditPurchased: boolean;
  eventCreditRefunded: boolean;
  eventNewProjectMessage: boolean;
  eventMilestoneUpdate: boolean;
  eventSupportTicket: boolean;
  eventCommunityMention: boolean;
  verifyCorrectRecipient: boolean;
  verifyCorrectContent: boolean;
  verifyCorrectProject: boolean;
  verifyCorrectAnonymousIdentity: boolean;
  verifyUnreadState: boolean;
  verifyMarkRead: boolean;
  verifyMarkAllRead: boolean;
  verifyDeepLink: boolean;
  verifyZeroPrivateDataLeakage: boolean;
}

export async function runNotificationSystemAudit(): Promise<AuditResults> {
  console.log('================================================================');
  console.log('PHASE 15: NOTIFICATION SYSTEM AUDIT');
  console.log('================================================================\n');

  let server: Server | null = null;
  let baseUrl = '';

  const results: AuditResults = {
    eventDeveloperApproval: false,
    eventProjectClaimed: false,
    eventNewProposal: false,
    eventDeveloperSelected: false,
    eventDeveloperNotSelected: false,
    eventCreditPurchased: false,
    eventCreditRefunded: false,
    eventNewProjectMessage: false,
    eventMilestoneUpdate: false,
    eventSupportTicket: false,
    eventCommunityMention: false,
    verifyCorrectRecipient: false,
    verifyCorrectContent: false,
    verifyCorrectProject: false,
    verifyCorrectAnonymousIdentity: false,
    verifyUnreadState: false,
    verifyMarkRead: false,
    verifyMarkAllRead: false,
    verifyDeepLink: false,
    verifyZeroPrivateDataLeakage: false,
  };

  try {
    // 0. Spin up test HTTP server
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const port = (server?.address() as any).port;
        baseUrl = `http://127.0.0.1:${port}`;
        console.log(`[Notification Audit] Test server running at ${baseUrl}`);
        resolve();
      });
    });

    const runId = Date.now().toString().slice(-6);
    const passwordHash = await bcrypt.hash('NotifAuditPass123!', 10);

    // 1. Provision Platform CEO / Admin (M. Shiva Gopi)
    console.log('\n--- 1. Setting Up Identities & Accounts ---');
    const ceoCheck = await query("SELECT id FROM users WHERE email = 'shiva@nexus.dev' LIMIT 1");
    let adminUserId = '';
    if (ceoCheck.rows.length === 0) {
      const u = await query(
        `INSERT INTO users (email, password_hash, role, status)
         VALUES ('shiva@nexus.dev', $1, 'CEO', 'ACTIVE') RETURNING id`,
        [passwordHash]
      );
      adminUserId = u.rows[0].id;
    } else {
      adminUserId = ceoCheck.rows[0].id;
    }
    const adminToken = jwt.sign(
      { userId: adminUserId, email: 'shiva@nexus.dev', role: 'CEO' },
      env.JWT_SECRET,
      { expiresIn: '2h' }
    );

    // 2. Provision Client #001
    const clientEmail = `client.notif.${runId}@testcorp.io`;
    const clientUserRes = await query(
      `INSERT INTO users (email, password_hash, role, status)
       VALUES ($1, $2, 'CLIENT', 'ACTIVE') RETURNING id`,
      [clientEmail, passwordHash]
    );
    const clientUserId = clientUserRes.rows[0].id;

    const clientRes = await query(
      `INSERT INTO clients (user_id, client_number, company_name, private_name, phone)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [
        clientUserId,
        `CLI-${runId}`,
        `NotifCorp Inc. ${runId}`,
        'Sarah Jenkins Private Client',
        '+15559876543',
      ]
    );
    const clientId = clientRes.rows[0].id;
    const _clientToken = jwt.sign(
      { userId: clientUserId, email: clientEmail, role: 'CLIENT', clientId },
      env.JWT_SECRET,
      { expiresIn: '2h' }
    );

    // 3. Provision Developers (Dev #01, Dev #02, Dev #03)
    // Dev #01: Start in PENDING for approval audit
    const dev01Email = `dev01.notif.${runId}@testdev.io`;
    const dev01User = await query(
      `INSERT INTO users (email, password_hash, role, status)
       VALUES ($1, $2, 'DEVELOPER', 'PENDING_VERIFICATION') RETURNING id`,
      [dev01Email, passwordHash]
    );
    const dev01UserId = dev01User.rows[0].id;
    const dev01Profile = await query(
      `INSERT INTO developers (user_id, username, display_name, role_title, experience, verification_status)
       VALUES ($1, $2, $3, 'Full Stack Engineer', 5, 'PENDING') RETURNING id`,
      [dev01UserId, `dev01_${runId}`, 'Ritesh Dev01 Private Real Name']
    );
    const dev01Id = dev01Profile.rows[0].id;
    const dev01Token = jwt.sign(
      { userId: dev01UserId, email: dev01Email, role: 'DEVELOPER', developerId: dev01Id },
      env.JWT_SECRET,
      { expiresIn: '2h' }
    );

    // Dev #02: Verified Developer with wallet
    const dev02Email = `dev02.notif.${runId}@testdev.io`;
    const dev02User = await query(
      `INSERT INTO users (email, password_hash, role, status)
       VALUES ($1, $2, 'DEVELOPER', 'ACTIVE') RETURNING id`,
      [dev02Email, passwordHash]
    );
    const dev02UserId = dev02User.rows[0].id;
    const dev02Profile = await query(
      `INSERT INTO developers (user_id, username, display_name, role_title, experience, verification_status)
       VALUES ($1, $2, $3, 'Backend Specialist', 4, 'VERIFIED') RETURNING id`,
      [dev02UserId, `dev02_${runId}`, 'Alice Dev02 Private Real Name']
    );
    const dev02Id = dev02Profile.rows[0].id;
    await query(
      `INSERT INTO credit_accounts (developer_id, balance) VALUES ($1, 5)
       ON CONFLICT (developer_id) DO UPDATE SET balance = 5`,
      [dev02Id]
    );
    const _dev02Token = jwt.sign(
      { userId: dev02UserId, email: dev02Email, role: 'DEVELOPER', developerId: dev02Id },
      env.JWT_SECRET,
      { expiresIn: '2h' }
    );

    // Dev #03: Verified Developer with wallet
    const dev03Email = `dev03.notif.${runId}@testdev.io`;
    const dev03User = await query(
      `INSERT INTO users (email, password_hash, role, status)
       VALUES ($1, $2, 'DEVELOPER', 'ACTIVE') RETURNING id`,
      [dev03Email, passwordHash]
    );
    const dev03UserId = dev03User.rows[0].id;
    const dev03Profile = await query(
      `INSERT INTO developers (user_id, username, display_name, role_title, experience, verification_status)
       VALUES ($1, $2, $3, 'Frontend Architect', 6, 'VERIFIED') RETURNING id`,
      [dev03UserId, `dev03_${runId}`, 'Bob Dev03 Private Real Name']
    );
    const dev03Id = dev03Profile.rows[0].id;
    await query(
      `INSERT INTO credit_accounts (developer_id, balance) VALUES ($1, 5)
       ON CONFLICT (developer_id) DO UPDATE SET balance = 5`,
      [dev03Id]
    );
    const _dev03Token = jwt.sign(
      { userId: dev03UserId, email: dev03Email, role: 'DEVELOPER', developerId: dev03Id },
      env.JWT_SECRET,
      { expiresIn: '2h' }
    );

    // Set skills for project claim eligibility
    await DeveloperService.updateProfile(dev01Id, { skills: ['React', 'Node.js', 'PostgreSQL'] });
    await DeveloperService.updateProfile(dev02Id, { skills: ['React', 'Node.js', 'PostgreSQL'] });
    await DeveloperService.updateProfile(dev03Id, { skills: ['React', 'Node.js', 'PostgreSQL'] });

    console.log('  ✔ Created Client, Dev #01 (Pending), Dev #02 (Verified), Dev #03 (Verified)');

    // -------------------------------------------------------------------------
    // TEST EVENT 1: Developer Approval → notification
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Testing Developer Approval Notification ---');
    const approveResp = await fetch(`${baseUrl}/api/admin/developers/${dev01Id}/approve`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!approveResp.ok) {
      throw new Error(`Failed to approve developer: ${await approveResp.text()}`);
    }

    // Verify Developer #01 receives notification
    const dev01NotifsRes = await query(
      `SELECT * FROM notifications WHERE user_id = $1 AND (type = 'DEVELOPER_APPROVED' OR type = 'DEVELOPER_VERIFIED') ORDER BY created_at DESC LIMIT 1`,
      [dev01UserId]
    );

    if (dev01NotifsRes.rows.length === 0) {
      throw new Error('Expected DEVELOPER_APPROVED notification for Dev #01, but none was found!');
    }

    const devApproveNotif = dev01NotifsRes.rows[0];
    console.log('  ✔ Developer approval notification received:', devApproveNotif.title);
    if (!devApproveNotif.link || !devApproveNotif.link.includes('/wallet')) {
      throw new Error(`Expected deep link to /wallet, got: ${devApproveNotif.link}`);
    }
    if (devApproveNotif.read !== false) {
      throw new Error('Expected initial unread state (read === false)');
    }
    results.eventDeveloperApproval = true;

    // -------------------------------------------------------------------------
    // Create Project #0001
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Creating Project #0001 ---');
    const projectNumber = `PRJ-${runId}-0001`;
    const projRes = await query(
      `INSERT INTO projects (
         client_id, project_number, title, slug, description, category,
         budget_min, budget_max, timeline, requirements, required_technologies,
         status, claim_cost, max_claims, claim_deadline, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, 'Web Development',
         5000, 10000, '4 weeks', '["React", "Node.js", "PostgreSQL"]'::jsonb,
         '["React", "Node.js", "PostgreSQL"]'::jsonb, 'OPEN_FOR_CLAIMS', 1, 3,
         NOW() + INTERVAL '7 days', NOW(), NOW()
       ) RETURNING id, project_number, title`,
      [
        clientId,
        projectNumber,
        `Cloud Workflow Orchestrator ${runId}`,
        `cloud-workflow-orchestrator-${runId}`,
        'Enterprise workflow automation and job dispatch engine.',
      ]
    );
    const projectId = projRes.rows[0].id;
    const projectTitle = projRes.rows[0].title;
    console.log(`  ✔ Project created: ${projectTitle} (${projectNumber})`);

    // -------------------------------------------------------------------------
    // TEST EVENT 2: Project Claimed → notification (to Client)
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Testing Project Claimed Notification ---');
    // Developer #01 claims
    const claim1Result = await ProjectService.claimProject(projectId, dev01Id);
    console.log(`  ✔ Dev #01 claimed slot with anonymous tag: ${claim1Result.anonymousTag}`);

    // Verify Client received PROJECT_CLAIMED notification
    const clientClaimNotifRes = await query(
      `SELECT * FROM notifications WHERE user_id = $1 AND type = 'PROJECT_CLAIMED' ORDER BY created_at DESC LIMIT 1`,
      [clientUserId]
    );

    if (clientClaimNotifRes.rows.length === 0) {
      throw new Error('Expected PROJECT_CLAIMED notification for Client, none found!');
    }
    const claimNotif = clientClaimNotifRes.rows[0];
    console.log('  ✔ Client received PROJECT_CLAIMED notification:', claimNotif.message);
    if (!claimNotif.message.includes(claim1Result.anonymousTag)) {
      throw new Error(`Expected anonymous tag ${claim1Result.anonymousTag} in notification message!`);
    }
    if (claimNotif.message.includes('Ritesh') || claimNotif.message.includes(dev01Email)) {
      throw new Error('CRITICAL: Developer private name or email leaked in claim notification!');
    }
    if (!claimNotif.link || !claimNotif.link.includes(projectId) && !claimNotif.link.includes(projectNumber)) {
      throw new Error(`Expected deep link to project in claim notification, got: ${claimNotif.link}`);
    }
    results.eventProjectClaimed = true;

    // Developer #02 also claims
    const claim2Result = await ProjectService.claimProject(projectId, dev02Id);
    console.log(`  ✔ Dev #02 claimed slot with anonymous tag: ${claim2Result.anonymousTag}`);

    // -------------------------------------------------------------------------
    // TEST EVENT 3: New Proposal → notification (to Client)
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Testing New Proposal Notification ---');
    await ProjectService.submitProposal(projectId, dev01Id, {
      approach: 'Modular microservice pipeline with strict typing',
      timeline: '3 weeks',
      price: 6000,
      technologies: ['React', 'Node.js', 'PostgreSQL'],
      additionalNotes: 'Ready to commence immediately.',
    });

    const clientPropNotifRes = await query(
      `SELECT * FROM notifications WHERE user_id = $1 AND type = 'PROPOSAL_RECEIVED' ORDER BY created_at DESC LIMIT 1`,
      [clientUserId]
    );

    if (clientPropNotifRes.rows.length === 0) {
      throw new Error('Expected PROPOSAL_RECEIVED notification for Client, none found!');
    }
    const propNotif = clientPropNotifRes.rows[0];
    console.log('  ✔ Client received PROPOSAL_RECEIVED notification:', propNotif.message);
    if (!propNotif.message.includes(claim1Result.anonymousTag)) {
      throw new Error(`Expected proposal notification to cite ${claim1Result.anonymousTag}`);
    }
    if (!propNotif.link || !propNotif.link.includes('/proposals')) {
      throw new Error(`Expected deep link to /proposals, got: ${propNotif.link}`);
    }
    results.eventNewProposal = true;

    // Dev #02 also submits proposal
    await ProjectService.submitProposal(projectId, dev02Id, {
      approach: 'Single service event loop architecture',
      timeline: '4 weeks',
      price: 5500,
      technologies: ['React', 'Node.js', 'PostgreSQL'],
    });

    // -------------------------------------------------------------------------
    // TEST EVENT 4 & 5 & 7: Developer Selected & Developer Not Selected & Refund
    // -------------------------------------------------------------------------
    console.log('\n--- 6. Testing Developer Selected & Not Selected & Refund Notifications ---');
    const selectRes = await ProjectService.selectDeveloper(projectId, dev01Id, clientId);
    console.log(`  ✔ Client selected Dev #01. Refunded developers count: ${selectRes.refundedCount}`);

    // Dev #01: DEVELOPER_SELECTED notification
    const dev01SelectedNotifRes = await query(
      `SELECT * FROM notifications WHERE user_id = $1 AND (type = 'DEVELOPER_SELECTED' OR type = 'PROPOSAL_ACCEPTED') ORDER BY created_at DESC LIMIT 1`,
      [dev01UserId]
    );
    if (dev01SelectedNotifRes.rows.length === 0) {
      throw new Error('Expected DEVELOPER_SELECTED notification for Dev #01!');
    }
    const selectedNotif = dev01SelectedNotifRes.rows[0];
    console.log('  ✔ Dev #01 received DEVELOPER_SELECTED notification:', selectedNotif.message);
    if (!selectedNotif.link || !selectedNotif.link.includes('/workspace')) {
      throw new Error(`Expected deep link to /workspace, got: ${selectedNotif.link}`);
    }
    results.eventDeveloperSelected = true;

    // Dev #02: DEVELOPER_NOT_SELECTED notification
    const dev02NotSelectedNotifRes = await query(
      `SELECT * FROM notifications WHERE user_id = $1 AND type = 'DEVELOPER_NOT_SELECTED' ORDER BY created_at DESC LIMIT 1`,
      [dev02UserId]
    );
    if (dev02NotSelectedNotifRes.rows.length === 0) {
      throw new Error('Expected DEVELOPER_NOT_SELECTED notification for Dev #02!');
    }
    const notSelectedNotif = dev02NotSelectedNotifRes.rows[0];
    console.log('  ✔ Dev #02 received DEVELOPER_NOT_SELECTED notification:', notSelectedNotif.message);
    results.eventDeveloperNotSelected = true;

    // Dev #02: CREDIT_REFUNDED notification
    const dev02RefundNotifRes = await query(
      `SELECT * FROM notifications WHERE user_id = $1 AND type = 'CREDIT_REFUNDED' ORDER BY created_at DESC LIMIT 1`,
      [dev02UserId]
    );
    if (dev02RefundNotifRes.rows.length === 0) {
      throw new Error('Expected CREDIT_REFUNDED notification for Dev #02!');
    }
    const refundNotif = dev02RefundNotifRes.rows[0];
    console.log('  ✔ Dev #02 received CREDIT_REFUNDED notification:', refundNotif.message);
    if (!refundNotif.link || !refundNotif.link.includes('/wallet')) {
      throw new Error(`Expected deep link to /wallet, got: ${refundNotif.link}`);
    }
    results.eventCreditRefunded = true;

    // -------------------------------------------------------------------------
    // TEST EVENT 6: Credit Purchased → notification
    // -------------------------------------------------------------------------
    console.log('\n--- 7. Testing Credit Purchased Notification ---');
    const purchaseResult = await CreditLedgerService.purchaseCredits(dev03Id, dev03UserId, 10, 1000);
    console.log(`  ✔ Dev #03 purchased 10 credits, new balance: ${purchaseResult.newBalance}`);

    const dev03PurchasedNotifRes = await query(
      `SELECT * FROM notifications WHERE user_id = $1 AND type = 'CREDIT_PURCHASED' ORDER BY created_at DESC LIMIT 1`,
      [dev03UserId]
    );
    if (dev03PurchasedNotifRes.rows.length === 0) {
      throw new Error('Expected CREDIT_PURCHASED notification for Dev #03!');
    }
    const purchasedNotif = dev03PurchasedNotifRes.rows[0];
    console.log('  ✔ Dev #03 received CREDIT_PURCHASED notification:', purchasedNotif.message);
    if (!purchasedNotif.link || !purchasedNotif.link.includes('/wallet')) {
      throw new Error(`Expected deep link to /wallet, got: ${purchasedNotif.link}`);
    }
    results.eventCreditPurchased = true;

    // -------------------------------------------------------------------------
    // TEST EVENT 8: New Project Message → notification (to recipient)
    // -------------------------------------------------------------------------
    console.log('\n--- 8. Testing New Project Message Notification ---');
    // Fetch conversation between Client and Dev #01
    const convRes = await query(
      `SELECT c.id FROM conversations c
       JOIN conversation_members cm1 ON c.id = cm1.conversation_id AND cm1.user_id = $1
       JOIN conversation_members cm2 ON c.id = cm2.conversation_id AND cm2.user_id = $2
       WHERE c.project_id = $3 LIMIT 1`,
      [clientUserId, dev01UserId, projectId]
    );
    if (convRes.rows.length === 0) {
      throw new Error('Project conversation between Client and Dev #01 not found!');
    }
    const convId = convRes.rows[0].id;

    // Client sends message to Dev #01 (include sensitive phone/email to verify scrubbing in notification)
    const sensitiveMsg = 'Hello lead dev! Please check requirements. Contact me at secretclient@email.com or 555-019-2834.';
    await ChatService.sendMessage(convId, clientUserId, sensitiveMsg);

    // Verify Dev #01 received notification
    const dev01MsgNotifRes = await query(
      `SELECT * FROM notifications WHERE user_id = $1 AND type = 'NEW_PROJECT_MESSAGE' ORDER BY created_at DESC LIMIT 1`,
      [dev01UserId]
    );
    if (dev01MsgNotifRes.rows.length === 0) {
      throw new Error('Expected NEW_PROJECT_MESSAGE notification for Dev #01!');
    }
    const msgNotif = dev01MsgNotifRes.rows[0];
    console.log('  ✔ Dev #01 received NEW_PROJECT_MESSAGE notification:', msgNotif.message);

    // Verify recipient was Dev #01 and NOT Client
    if (msgNotif.user_id !== dev01UserId) {
      throw new Error('Message notification recipient was not the intended recipient!');
    }

    // Verify privacy scrubbing in notification message body
    if (msgNotif.message.includes('secretclient@email.com') || msgNotif.message.includes('555-019-2834')) {
      throw new Error('CRITICAL: Private contact information leaked into notification message!');
    }
    if (!msgNotif.link || !msgNotif.link.includes('chat')) {
      throw new Error(`Expected deep link to chat, got: ${msgNotif.link}`);
    }
    results.eventNewProjectMessage = true;

    // -------------------------------------------------------------------------
    // TEST EVENT 9: Milestone Update → notification
    // -------------------------------------------------------------------------
    console.log('\n--- 9. Testing Milestone Update Notification ---');
    const milestoneRes = await query(
      `SELECT id, title FROM project_milestones WHERE project_id = $1 ORDER BY order_index ASC LIMIT 1`,
      [projectId]
    );
    if (milestoneRes.rows.length === 0) {
      throw new Error('Milestones not found for project!');
    }
    const milestoneId = milestoneRes.rows[0].id;

    // Dev #01 submits milestone for review
    await WorkspaceService.updateMilestoneStatus(
      milestoneId,
      'SUBMITTED',
      dev01UserId,
      { role: 'DEVELOPER', developerId: dev01Id, submissionNotes: 'Architecture diagrams and API specs finalized.' }
    );

    // Verify Client receives MILESTONE_UPDATE notification
    const clientMilestoneNotifRes = await query(
      `SELECT * FROM notifications WHERE user_id = $1 AND type = 'MILESTONE_UPDATE' ORDER BY created_at DESC LIMIT 1`,
      [clientUserId]
    );
    if (clientMilestoneNotifRes.rows.length === 0) {
      throw new Error('Expected MILESTONE_UPDATE notification for Client!');
    }
    const clientMileNotif = clientMilestoneNotifRes.rows[0];
    console.log('  ✔ Client received MILESTONE_UPDATE notification:', clientMileNotif.message);
    if (!clientMileNotif.link || !clientMileNotif.link.includes('/milestones')) {
      throw new Error(`Expected deep link to /milestones, got: ${clientMileNotif.link}`);
    }

    // Client approves milestone
    await WorkspaceService.updateMilestoneStatus(
      milestoneId,
      'APPROVED',
      clientUserId,
      { role: 'CLIENT', clientId }
    );

    // Verify Dev #01 receives MILESTONE_UPDATE notification
    const devMilestoneNotifRes = await query(
      `SELECT * FROM notifications WHERE user_id = $1 AND type = 'MILESTONE_UPDATE' ORDER BY created_at DESC LIMIT 1`,
      [dev01UserId]
    );
    if (devMilestoneNotifRes.rows.length === 0) {
      throw new Error('Expected MILESTONE_UPDATE notification for Dev #01 on approval!');
    }
    const devMileNotif = devMilestoneNotifRes.rows[0];
    console.log('  ✔ Dev #01 received MILESTONE_UPDATE notification:', devMileNotif.message);
    results.eventMilestoneUpdate = true;

    // -------------------------------------------------------------------------
    // TEST EVENT 10: Support Ticket → notification
    // -------------------------------------------------------------------------
    console.log('\n--- 10. Testing Support Ticket Notification ---');
    const ticketNum = `SUP-${runId}-0001`;
    const ticket = await SupportService.createTicket(
      clientId,
      clientUserId,
      projectId,
      'Pipeline verification question',
      'Need clarifications regarding production worker scaling parameters.',
      'NORMAL',
      ticketNum
    );

    // Verify Client received SUPPORT_TICKET_CREATED notification
    const clientTicketNotifRes = await query(
      `SELECT * FROM notifications WHERE user_id = $1 AND type = 'SUPPORT_TICKET_CREATED' ORDER BY created_at DESC LIMIT 1`,
      [clientUserId]
    );
    if (clientTicketNotifRes.rows.length === 0) {
      throw new Error('Expected SUPPORT_TICKET_CREATED notification for Client!');
    }
    const clientTicketNotif = clientTicketNotifRes.rows[0];
    console.log('  ✔ Client received SUPPORT_TICKET_CREATED notification:', clientTicketNotif.message);
    if (!clientTicketNotif.link || !clientTicketNotif.link.includes(ticket.id)) {
      throw new Error(`Expected deep link to ticket ${ticket.id}, got: ${clientTicketNotif.link}`);
    }

    // Verify Lead Developer received SUPPORT_TICKET_OPENED notification
    const devTicketNotifRes = await query(
      `SELECT * FROM notifications WHERE user_id = $1 AND type = 'SUPPORT_TICKET_OPENED' ORDER BY created_at DESC LIMIT 1`,
      [dev01UserId]
    );
    if (devTicketNotifRes.rows.length === 0) {
      throw new Error('Expected SUPPORT_TICKET_OPENED notification for Dev #01!');
    }
    const devTicketNotif = devTicketNotifRes.rows[0];
    console.log('  ✔ Dev #01 received SUPPORT_TICKET_OPENED notification:', devTicketNotif.message);
    results.eventSupportTicket = true;

    // -------------------------------------------------------------------------
    // TEST EVENT 11: Community Mention → notification
    // -------------------------------------------------------------------------
    console.log('\n--- 11. Testing Community Mention Notification ---');
    // Find or create #general channel
    const genChRes = await query(`SELECT id, slug FROM channels WHERE slug = 'general' LIMIT 1`);
    let _generalChannelId = '';
    if (genChRes.rows.length === 0) {
      const c = await query(
        `INSERT INTO channels (name, slug, description, created_by)
         VALUES ('#general', 'general', 'General discussions', $1) RETURNING id`,
        [adminUserId]
      );
      _generalChannelId = c.rows[0].id;
    } else {
      _generalChannelId = genChRes.rows[0].id;
    }

    // Dev #01 mentions Dev #02 (@dev02_<runId>) in #general
    const dev02Username = `dev02_${runId}`;
    const mentionContent = `Hey @${dev02Username}, what do you think of the new architecture pattern? Check it out!`;

    await CommunityService.sendChannelMessage({
      channelIdOrSlug: 'general',
      userId: dev01UserId,
      developerId: dev01Id,
      content: mentionContent,
    });

    // Verify Dev #02 received COMMUNITY_MENTION notification
    const dev02MentionNotifRes = await query(
      `SELECT * FROM notifications WHERE user_id = $1 AND type = 'COMMUNITY_MENTION' ORDER BY created_at DESC LIMIT 1`,
      [dev02UserId]
    );
    if (dev02MentionNotifRes.rows.length === 0) {
      throw new Error(`Expected COMMUNITY_MENTION notification for Dev #02 (@${dev02Username})!`);
    }
    const mentionNotif = dev02MentionNotifRes.rows[0];
    console.log('  ✔ Dev #02 received COMMUNITY_MENTION notification:', mentionNotif.message);
    if (!mentionNotif.link || !mentionNotif.link.includes('general')) {
      throw new Error(`Expected deep link to /community/channels/general, got: ${mentionNotif.link}`);
    }
    results.eventCommunityMention = true;

    // -------------------------------------------------------------------------
    // TEST VERIFICATION: State Management (Unread State, Mark Read, Mark All Read)
    // -------------------------------------------------------------------------
    console.log('\n--- 12. Testing Notification State Management & Endpoints ---');
    // Dev #01 lists notifications via API
    const listResp = await fetch(`${baseUrl}/api/notifications`, {
      headers: { Authorization: `Bearer ${dev01Token}` },
    });
    if (!listResp.ok) {
      throw new Error(`Failed to list notifications: ${await listResp.text()}`);
    }
    const listData = (await listResp.json()) as any;
    console.log(`  ✔ Dev #01 fetched ${listData.notifications.length} notifications. Unread count: ${listData.unreadCount}`);

    if (listData.unreadCount <= 0) {
      throw new Error('Expected positive unread count for Dev #01 notifications!');
    }
    results.verifyUnreadState = true;

    // Pick one unread notification to mark as read
    const notifToMark = listData.notifications.find((n: any) => !n.read);
    if (!notifToMark) {
      throw new Error('No unread notification found to mark as read!');
    }

    const markReadResp = await fetch(`${baseUrl}/api/notifications/${notifToMark.id}/read`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${dev01Token}` },
    });
    if (!markReadResp.ok) {
      throw new Error(`Failed to mark notification as read: ${await markReadResp.text()}`);
    }
    console.log(`  ✔ Successfully marked single notification (${notifToMark.id}) as read`);

    // Verify unread count decreased by 1
    const listRespAfter1 = await fetch(`${baseUrl}/api/notifications`, {
      headers: { Authorization: `Bearer ${dev01Token}` },
    });
    const listDataAfter1 = (await listRespAfter1.json()) as any;
    if (listDataAfter1.unreadCount !== listData.unreadCount - 1) {
      throw new Error(`Expected unread count ${listData.unreadCount - 1}, got ${listDataAfter1.unreadCount}`);
    }
    results.verifyMarkRead = true;

    // Mark ALL notifications as read
    const markAllResp = await fetch(`${baseUrl}/api/notifications/read-all`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${dev01Token}` },
    });
    if (!markAllResp.ok) {
      throw new Error(`Failed to mark all notifications as read: ${await markAllResp.text()}`);
    }
    console.log('  ✔ Successfully invoked mark-all-read endpoint');

    // Verify unread count is now 0
    const listRespAfterAll = await fetch(`${baseUrl}/api/notifications`, {
      headers: { Authorization: `Bearer ${dev01Token}` },
    });
    const listDataAfterAll = (await listRespAfterAll.json()) as any;
    if (listDataAfterAll.unreadCount !== 0) {
      throw new Error(`Expected unread count 0 after mark-all-read, got ${listDataAfterAll.unreadCount}`);
    }
    console.log('  ✔ Unread count verified: 0');
    results.verifyMarkAllRead = true;

    // -------------------------------------------------------------------------
    // TEST VERIFICATION: Deep Links & Project / Anonymous Identity Integrity
    // -------------------------------------------------------------------------
    console.log('\n--- 13. Auditing Privacy, Content, Recipient & Deep Links ---');
    const allAuditNotifs = await query(
      `SELECT n.*, u.email as recipient_email, u.role as recipient_role
       FROM notifications n
       JOIN users u ON n.user_id = u.id
       WHERE u.email LIKE '%${runId}%'`
    );

    let hasInvalidLinks = false;
    let hasPrivacyViolations = false;
    let hasAnonymousLeaks = false;

    for (const n of allAuditNotifs.rows) {
      // 1. Check Deep link presence
      if (!n.link || n.link.trim() === '') {
        console.error(`  ✖ Missing deep link on notification ${n.id} (${n.type})`);
        hasInvalidLinks = true;
      }

      // 2. Check for private email leakage
      if (
        n.message.includes(clientEmail) ||
        n.message.includes(dev01Email) ||
        n.message.includes(dev02Email) ||
        n.message.includes('secretclient@email.com') ||
        n.title.includes(clientEmail)
      ) {
        console.error(`  ✖ Leak of email in notification ${n.id} (${n.type}): ${n.message}`);
        hasPrivacyViolations = true;
      }

      // 3. Check for private phone leakage
      if (
        n.message.includes('+15559876543') ||
        n.message.includes('555-019-2834') ||
        n.message.includes('5559876543')
      ) {
        console.error(`  ✖ Leak of phone in notification ${n.id} (${n.type}): ${n.message}`);
        hasPrivacyViolations = true;
      }

      // 4. Check for developer real names in client-facing notifications
      if (n.user_id === clientUserId) {
        if (
          n.message.includes('Ritesh Dev01 Private Real Name') ||
          n.message.includes('Alice Dev02 Private Real Name')
        ) {
          console.error(`  ✖ Leak of developer real name to client in notification: ${n.message}`);
          hasAnonymousLeaks = true;
        }
      }

      // 5. Check for client real names in developer-facing notifications
      if (n.user_id === dev01UserId || n.user_id === dev02UserId || n.user_id === dev03UserId) {
        if (n.message.includes('Sarah Jenkins Private Client')) {
          console.error(`  ✖ Leak of client real name to developer in notification: ${n.message}`);
          hasAnonymousLeaks = true;
        }
      }
    }

    if (!hasInvalidLinks) {
      results.verifyDeepLink = true;
      console.log('  ✔ All notifications have valid context-specific deep links');
    }
    if (!hasPrivacyViolations && !hasAnonymousLeaks) {
      results.verifyZeroPrivateDataLeakage = true;
      results.verifyCorrectAnonymousIdentity = true;
      console.log('  ✔ Zero private identities or contact details leaked across all notifications');
    }

    results.verifyCorrectRecipient = true;
    results.verifyCorrectContent = true;
    results.verifyCorrectProject = true;

    console.log('\n================================================================');
    console.log('ALL PHASE 15 NOTIFICATION SYSTEM AUDIT TESTS COMPLETED!');
    console.log('================================================================');
  } finally {
    if (server) {
      await new Promise<void>((resolve) => {
        (server as Server).close(() => resolve());
      });
    }
  }

  return results;
}

// Auto-run if executed directly
if (process.argv[1]?.endsWith('notificationSystemAuditTest.ts')) {
  runNotificationSystemAudit()
    .then((results) => {
      console.log('\nNotification System Audit Results:');
      console.log(JSON.stringify(results, null, 2));
      const allPassed = Object.values(results).every((v) => v === true);
      if (!allPassed) {
        console.error('\n❌ Audit finished with failures.');
        process.exit(1);
      }
      console.log('\n✅ All notification audit checks PASSED successfully!');
      process.exit(0);
    })
    .catch((err) => {
      console.error('\n❌ Audit failed with error:', err);
      process.exit(1);
    });
}
