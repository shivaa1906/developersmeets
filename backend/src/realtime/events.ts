import { realtimeServer } from './realtimeServer.js';

export class RealtimeEvents {
  /**
   * Broadcasts a project chat message to the conversation channel
   */
  static emitChatMessage(conversationId: string, message: any): void {
    realtimeServer.broadcastToChannel(`chat:${conversationId}`, 'chat:message', message);
  }

  /**
   * Broadcasts a read receipt / unread status update
   */
  static emitChatRead(conversationId: string, data: { userId: string; unreadCount: number }): void {
    realtimeServer.broadcastToChannel(`chat:${conversationId}`, 'chat:read', data);
  }

  /**
   * Broadcasts a notification directly to the user's private channel
   */
  static emitNotification(userId: string, notification: any): void {
    realtimeServer.broadcastToUser(userId, 'notification:new', notification);
  }

  /**
   * Broadcasts a community channel message
   */
  static emitCommunityMessage(channelSlug: string, message: any): void {
    realtimeServer.broadcastToChannel(`community:${channelSlug}`, 'community:message', message);
  }

  /**
   * Broadcasts a community reaction update
   */
  static emitCommunityReaction(channelSlug: string, data: { messageId: string; emoji: string; added: boolean; count: number }): void {
    realtimeServer.broadcastToChannel(`community:${channelSlug}`, 'community:reaction', data);
  }

  /**
   * Broadcasts project workspace updates (milestones, tasks, files)
   */
  static emitWorkspaceUpdate(projectId: string, update: { type: string; payload: any }): void {
    realtimeServer.broadcastToChannel(`workspace:${projectId}`, 'workspace:update', update);
  }

  /**
   * Broadcasts support bridge message / ticket status update
   */
  static emitSupportUpdate(bridgeId: string, update: { type: string; payload: any }): void {
    realtimeServer.broadcastToChannel(`support:${bridgeId}`, 'support:update', update);
  }

  /**
   * Broadcasts marketplace project status / claim availability update
   */
  static emitMarketplaceUpdate(projectId: string, update: { claimsCount: number; maxClaims: number; status: string }): void {
    realtimeServer.broadcastToChannel('marketplace:projects', 'marketplace:claim_update', {
      projectId,
      ...update,
    });
  }

  /**
   * Broadcasts administrative events to CEO / MD / Admin
   */
  static emitAdminEvent(event: string, data: any): void {
    realtimeServer.broadcastToChannel('admin:events', `admin:${event}`, data);
  }

  /**
   * Broadcasts new project creation event to administrative, client, and marketplace channels
   */
  static emitProjectCreated(project: any): void {
    realtimeServer.broadcastToChannel('admin:events', 'project:create', project);
    if (project.client_id) {
      realtimeServer.broadcastToChannel(`client:${project.client_id}`, 'project:create', project);
    }
  }

  /**
   * Broadcasts private credit balance update strictly to authorized user
   */
  static emitCreditUpdate(userId: string, data: { balance: number; reason: string; amount?: number }): void {
    realtimeServer.broadcastToUser(userId, 'credit:balance_updated', data);
  }

  /**
   * Broadcasts private payment update strictly to authorized client
   */
  static emitPaymentUpdate(userId: string, data: { paymentId: string; amount: number; status: string; currency: string }): void {
    realtimeServer.broadcastToUser(userId, 'payment:updated', data);
  }

  /**
   * Broadcasts private developer selection notifications
   */
  static emitDeveloperSelected(developerUserId: string, data: { projectId: string; projectTitle: string }): void {
    realtimeServer.broadcastToUser(developerUserId, 'project:selected', {
      ...data,
      message: 'You have been selected for this project.',
    });
  }

  static emitDeveloperNotSelected(developerUserId: string, data: { projectId: string; projectTitle: string }): void {
    realtimeServer.broadcastToUser(developerUserId, 'project:not_selected', {
      ...data,
      message: 'Another developer was selected for this project.',
    });
  }

  static emitClaimRefund(developerUserId: string, data: { projectId: string; creditsRefunded: number }): void {
    realtimeServer.broadcastToUser(developerUserId, 'credit:refunded', {
      ...data,
      message: `Your project claim deposit of ${data.creditsRefunded} credits has been refunded.`,
    });
  }

  static emitProjectSelectionToClient(clientUserId: string, data: { projectId: string; developerTag: string }): void {
    realtimeServer.broadcastToUser(clientUserId, 'project:developer_selected', {
      ...data,
      message: 'A developer has been assigned to your project.',
    });
  }
}
