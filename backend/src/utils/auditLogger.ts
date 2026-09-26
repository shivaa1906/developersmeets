import { query } from '../database/db.js';

export class AuditLogger {
  static async log(params: {
    actorUserId?: string | null;
    action: string;
    entityType: string;
    entityId: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    try {
      await query(
        `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          params.actorUserId || null,
          params.action,
          params.entityType,
          params.entityId,
          JSON.stringify(params.metadata || {}),
        ]
      );
    } catch (err: any) {
      console.error('[AuditLogger Error]: Failed to write audit log:', err.message);
    }
  }
}
