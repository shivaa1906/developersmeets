import { query } from '../database/db.js';

export class AuditLogger {
  static async log(
    params: {
      actorUserId?: string | null;
      action: string;
      entityType: string;
      entityId: string;
      metadata?: Record<string, any>;
    },
    client?: any,
    throwOnError: boolean = false
  ): Promise<void> {
    try {
      const runner = client ? client.query.bind(client) : query;
      await runner(
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
      if (throwOnError) {
        throw new Error(`Audit logging failed: ${err.message}`);
      }
    }
  }

  static async logStrict(
    params: {
      actorUserId?: string | null;
      action: string;
      entityType: string;
      entityId: string;
      metadata?: Record<string, any>;
    },
    client?: any
  ): Promise<void> {
    return this.log(params, client, true);
  }
}
