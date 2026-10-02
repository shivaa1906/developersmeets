import { query } from '../database/db.js';
import { RealtimeUser } from './types.js';

/**
 * Validates whether an authenticated user is authorized to subscribe to a given channel/room.
 * Enforces strict multi-tenant boundaries, project isolation, and anonymity rules.
 */
export async function authorizeSubscription(
  user: RealtimeUser,
  channel: string
): Promise<{ authorized: boolean; reason?: string; anonymousTag?: string }> {
  if (!channel || typeof channel !== 'string') {
    return { authorized: false, reason: 'Invalid channel specification' };
  }

  const [scope, id] = channel.split(':');

  // 1. Personal user notification & alert channel (Strictly personal to authenticated user)
  if (scope === 'user') {
    if (user.userId === id) {
      return { authorized: true };
    }
    return { authorized: false, reason: 'Forbidden: Cannot subscribe to another user personal channel' };
  }

  // 2. Private Client channel (client:<clientId>)
  if (scope === 'client') {
    if (!id) return { authorized: false, reason: 'Missing client identifier' };
    if (user.clientId === id || ['CEO', 'ADMIN'].includes(user.role)) {
      return { authorized: true };
    }
    return { authorized: false, reason: 'Forbidden: Access restricted to authorized client account' };
  }

  // 3. Private Developer channel (developer:<developerId>)
  if (scope === 'developer') {
    if (!id) return { authorized: false, reason: 'Missing developer identifier' };
    if (user.developerId === id || ['CEO', 'ADMIN'].includes(user.role)) {
      return { authorized: true };
    }
    return { authorized: false, reason: 'Forbidden: Access restricted to authorized developer account' };
  }

  // 4. Developer Community channels (e.g. community:general, community:frontend)
  if (scope === 'community') {
    if (['DEVELOPER', 'CEO', 'MD', 'ADMIN'].includes(user.role)) {
      // If developer, verify developer account is VERIFIED
      if (user.role === 'DEVELOPER') {
        const devCheck = await query(
          `SELECT verification_status FROM developers WHERE user_id = $1`,
          [user.userId]
        );
        if (devCheck.rows.length === 0 || devCheck.rows[0].verification_status !== 'VERIFIED') {
          return { authorized: false, reason: 'Forbidden: Only verified developers can access community channels' };
        }
      }
      return { authorized: true };
    }
    return { authorized: false, reason: 'Forbidden: Community is restricted to approved developers and leadership' };
  }

  // 5. Project chat & Private Direct Message channels (chat:<id>, conversation:<id>, dm:<id>)
  if (scope === 'chat' || scope === 'conversation' || scope === 'dm') {
    if (!id) return { authorized: false, reason: 'Missing conversation identifier' };

    // Check conversation membership
    const memberCheck = await query(
      `SELECT cm.role, cm.developer_id, cm.client_id, c.type, c.status as conversation_status, c.project_id
       FROM conversation_members cm
       JOIN conversations c ON cm.conversation_id = c.id
       WHERE cm.conversation_id::text = $1 AND cm.user_id = $2`,
      [id, user.userId]
    );

    if (memberCheck.rows.length > 0) {
      const mem = memberCheck.rows[0];

      // For anonymous project conversations, resolve the anonymous developer tag or client tag
      let anonymousTag: string | undefined = undefined;
      if (mem.project_id) {
        if (mem.developer_id) {
          const claimRes = await query(
            `SELECT anonymous_tag FROM project_claims WHERE project_id = $1 AND developer_id = $2`,
            [mem.project_id, mem.developer_id]
          );
          if (claimRes.rows.length > 0) {
            anonymousTag = claimRes.rows[0].anonymous_tag;
          }
        } else if (mem.client_id) {
          const clientRes = await query(
            `SELECT client_number FROM clients WHERE id = $1`,
            [mem.client_id]
          );
          if (clientRes.rows.length > 0) {
            anonymousTag = clientRes.rows[0].client_number || 'Client';
          }
        }
      }

      return { authorized: true, anonymousTag };
    }

    // Leadership override check
    if (['CEO', 'ADMIN'].includes(user.role)) {
      return { authorized: true, anonymousTag: 'Platform Leadership' };
    }

    return { authorized: false, reason: 'Forbidden: You are not an authorized member of this conversation' };
  }

  // 6. Project Workspace channel (workspace:<projectId> or project:<projectId>)
  if (scope === 'workspace' || scope === 'project') {
    if (!id) return { authorized: false, reason: 'Missing project identifier' };

    // Leadership has oversight
    if (['CEO', 'ADMIN'].includes(user.role)) {
      return { authorized: true };
    }
    if (user.role === 'MD') {
      const hasPerm = user.permissions?.includes('PROJECT_MANAGEMENT') || user.permissions?.includes('*');
      if (hasPerm) return { authorized: true };
      return { authorized: false, reason: 'Forbidden: Managing Director lacks project management permissions' };
    }

    // Check project client or selected lead developer
    const projRes = await query(
      `SELECT p.id, p.client_id, p.lead_developer_id, cl.user_id as client_user_id, d.user_id as dev_user_id
       FROM projects p
       LEFT JOIN clients cl ON p.client_id = cl.id
       LEFT JOIN developers d ON p.lead_developer_id = d.id
       WHERE p.id::text = $1`,
      [id]
    );

    if (projRes.rows.length === 0) {
      return { authorized: false, reason: 'Project not found' };
    }

    const proj = projRes.rows[0];
    if (proj.client_user_id === user.userId || proj.dev_user_id === user.userId) {
      return { authorized: true };
    }

    // Check team membership
    const memberCheck = await query(
      `SELECT 1 FROM project_members pm
       JOIN developers d ON pm.developer_id = d.id
       WHERE pm.project_id::text = $1 AND d.user_id = $2`,
      [id, user.userId]
    );
    if (memberCheck.rows.length > 0) {
      return { authorized: true };
    }

    // Check accepted or active project claim
    const claimCheck = await query(
      `SELECT 1 FROM project_claims pc
       JOIN developers d ON pc.developer_id = d.id
       WHERE pc.project_id::text = $1 AND d.user_id = $2 AND pc.status IN ('CLAIMED', 'SELECTED')`,
      [id, user.userId]
    );
    if (claimCheck.rows.length > 0) {
      return { authorized: true };
    }

    return { authorized: false, reason: 'Forbidden: Access restricted to project client and authorized developers' };
  }

  // 7. Claim channel (claim:<claimId>)
  if (scope === 'claim') {
    if (!id) return { authorized: false, reason: 'Missing claim identifier' };

    if (['CEO', 'ADMIN'].includes(user.role)) {
      return { authorized: true };
    }

    const claimRes = await query(
      `SELECT pc.id, d.user_id as dev_user_id, cl.user_id as client_user_id
       FROM project_claims pc
       JOIN developers d ON pc.developer_id = d.id
       JOIN projects p ON pc.project_id = p.id
       LEFT JOIN clients cl ON p.client_id = cl.id
       WHERE pc.id::text = $1`,
      [id]
    );

    if (claimRes.rows.length === 0) {
      return { authorized: false, reason: 'Claim not found' };
    }

    const claim = claimRes.rows[0];
    if (claim.dev_user_id === user.userId || claim.client_user_id === user.userId) {
      return { authorized: true };
    }

    return { authorized: false, reason: 'Forbidden: Access restricted to claimant developer and project owner' };
  }

  // 8. Support bridge & ticket channel (support:<id>, support-bridge:<id>, support-ticket:<id>)
  if (scope === 'support' || scope === 'support-bridge' || scope === 'support-ticket') {
    if (!id) return { authorized: false, reason: 'Missing support identifier' };

    if (['CEO', 'ADMIN'].includes(user.role)) {
      return { authorized: true };
    }
    if (user.role === 'MD') {
      const hasPerm = user.permissions?.includes('SUPPORT_MANAGEMENT') || user.permissions?.includes('*');
      if (hasPerm) return { authorized: true };
      return { authorized: false, reason: 'Forbidden: Managing Director lacks support management permissions' };
    }

    if (user.role === 'SUPPORT') {
      const staffCheck = await query(
        `SELECT id, status, permissions FROM support_staff WHERE user_id = $1`,
        [user.userId]
      );
      if (staffCheck.rows.length === 0 || staffCheck.rows[0].status === 'SUSPENDED') {
        return { authorized: false, reason: 'Forbidden: Support staff account inactive or suspended' };
      }
      return { authorized: true };
    }

    // Check support bridge membership
    const bridgeMemberCheck = await query(
      `SELECT 1 FROM support_bridge_members sbm
       JOIN support_bridges sb ON sbm.bridge_id = sb.id
       WHERE (sb.id::text = $1 OR sb.ticket_id::text = $1) AND sbm.user_id = $2`,
      [id, user.userId]
    );

    if (bridgeMemberCheck.rows.length > 0) {
      return { authorized: true };
    }

    // Check ticket client (by client_id or created_by_user_id)
    const ticketCheck = await query(
      `SELECT st.id FROM support_tickets st
       LEFT JOIN clients cl ON st.client_id = cl.id
       WHERE (st.id::text = $1 OR EXISTS (SELECT 1 FROM support_bridges sb WHERE sb.id::text = $1 AND sb.ticket_id = st.id))
         AND (cl.user_id = $2 OR st.created_by_user_id = $2)`,
      [id, user.userId]
    );

    if (ticketCheck.rows.length > 0) {
      return { authorized: true };
    }

    // Check ticket developer
    const devCheck = await query(
      `SELECT st.id FROM support_tickets st
       LEFT JOIN developers d ON st.developer_id = d.id
       WHERE (st.id::text = $1 OR EXISTS (SELECT 1 FROM support_bridges sb WHERE sb.id::text = $1 AND sb.ticket_id = st.id))
         AND (d.user_id = $2 OR st.created_by_user_id = $2)`,
      [id, user.userId]
    );

    if (devCheck.rows.length > 0) {
      return { authorized: true };
    }

    return { authorized: false, reason: 'Forbidden: You are not authorized for this support channel' };
  }

  // 9. Admin operational dashboard (admin:events, admin:executive, admin:settings)
  if (scope === 'admin') {
    if (id === 'executive' || id === 'settings') {
      if (user.role === 'CEO') {
        return { authorized: true };
      }
      return { authorized: false, reason: 'Forbidden: Executive channel restricted to Chief Executive Officer' };
    }
    if (['CEO', 'MD', 'ADMIN'].includes(user.role)) {
      return { authorized: true };
    }
    return { authorized: false, reason: 'Forbidden: Administrative events channel' };
  }

  // 10. Public marketplace channel (marketplace:projects)
  if (scope === 'marketplace') {
    return { authorized: true };
  }

  return { authorized: false, reason: `Unknown or unauthorized channel scope: ${scope}` };
}
