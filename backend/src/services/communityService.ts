import { query, withTransaction } from '../database/db.js';

export class CommunityService {
  /**
   * Retrieves all community channels
   */
  static async getChannels() {
    const res = await query('SELECT * FROM channels ORDER BY name ASC');
    return res.rows;
  }

  /**
   * Retrieves community discussion posts
   */
  static async getPosts(channelSlug?: string, search?: string) {
    let sql = `
      SELECT cp.id, cp.title, cp.content, cp.tags, cp.upvotes, cp.created_at,
             c.name as channel_name, c.slug as channel_slug,
             d.username as author_username, d.display_name as author_name,
             d.profile_image as author_avatar, d.role_title as author_title,
             COUNT(cc.id) as comments_count
      FROM community_posts cp
      JOIN channels c ON cp.channel_id = c.id
      JOIN developers d ON cp.author_developer_id = d.id
      LEFT JOIN community_comments cc ON cp.id = cc.post_id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (channelSlug && channelSlug !== 'all') {
      params.push(channelSlug);
      sql += ` AND c.slug = $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (cp.title ILIKE $${params.length} OR cp.content ILIKE $${params.length})`;
    }

    sql += ` GROUP BY cp.id, c.id, d.id ORDER BY cp.created_at DESC`;

    const res = await query(sql, params);
    return res.rows.map((r) => ({
      ...r,
      comments_count: parseInt(r.comments_count, 10),
    }));
  }

  /**
   * Retrieves post details with comments
   */
  static async getPostById(postId: string) {
    const postRes = await query(
      `SELECT cp.*, c.name as channel_name, c.slug as channel_slug,
              d.username as author_username, d.display_name as author_name,
              d.profile_image as author_avatar, d.role_title as author_title
       FROM community_posts cp
       JOIN channels c ON cp.channel_id = c.id
       JOIN developers d ON cp.author_developer_id = d.id
       WHERE cp.id = $1`,
      [postId]
    );

    if (postRes.rows.length === 0) {
      return null;
    }

    const post = postRes.rows[0];

    // Fetch comments
    const commentsRes = await query(
      `SELECT cc.*, d.username as author_username, d.display_name as author_name,
              d.profile_image as author_avatar, d.role_title as author_title
       FROM community_comments cc
       JOIN developers d ON cc.author_developer_id = d.id
       WHERE cc.post_id = $1
       ORDER BY cc.created_at ASC`,
      [postId]
    );

    return {
      ...post,
      comments: commentsRes.rows,
    };
  }

  /**
   * Creates a community post
   */
  static async createPost(
    developerId: string,
    channelId: string,
    title: string,
    content: string,
    tags?: string[]
  ) {
    const res = await query(
      `INSERT INTO community_posts (channel_id, author_developer_id, title, content, tags)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [channelId, developerId, title, content, JSON.stringify(tags || [])]
    );
    return res.rows[0];
  }

  /**
   * Toggles upvote on a post
   */
  static async upvotePost(developerId: string, postId: string) {
    return withTransaction(async (client) => {
      // Check existing upvote
      const existing = await client.query(
        `SELECT * FROM community_upvotes WHERE post_id = $1 AND developer_id = $2`,
        [postId, developerId]
      );

      if (existing.rows.length > 0) {
        // Remove upvote
        await client.query(
          `DELETE FROM community_upvotes WHERE post_id = $1 AND developer_id = $2`,
          [postId, developerId]
        );
        await client.query(
          `UPDATE community_posts SET upvotes = GREATEST(0, upvotes - 1) WHERE id = $1`,
          [postId]
        );
        return { upvoted: false };
      } else {
        // Add upvote
        await client.query(
          `INSERT INTO community_upvotes (post_id, developer_id) VALUES ($1, $2)`,
          [postId, developerId]
        );
        await client.query(
          `UPDATE community_posts SET upvotes = upvotes + 1 WHERE id = $1`,
          [postId]
        );
        return { upvoted: true };
      }
    });
  }

  /**
   * Adds a comment to a post
   */
  static async addComment(developerId: string, postId: string, content: string) {
    const res = await query(
      `INSERT INTO community_comments (post_id, author_developer_id, content)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [postId, developerId, content]
    );
    return res.rows[0];
  }
}
