import { Router } from 'express';
import { sql } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// Accepted friends (with level) + incoming pending requests.
router.get('/', async (req, res) => {
  try {
    const friends = await sql`
      SELECT f.id AS friendship_id, p.id AS player_id, p.username, ps.level
      FROM friendships f
      JOIN players p
        ON p.id = CASE WHEN f.player_id = ${req.player.id} THEN f.friend_id ELSE f.player_id END
      JOIN player_stats ps ON ps.player_id = p.id
      WHERE (f.player_id = ${req.player.id} OR f.friend_id = ${req.player.id})
        AND f.status = 'accepted'
      ORDER BY ps.level DESC, p.username
    `;
    const pending = await sql`
      SELECT f.id AS friendship_id, p.id AS player_id, p.username, ps.level
      FROM friendships f
      JOIN players p ON p.id = f.player_id
      JOIN player_stats ps ON ps.player_id = p.id
      WHERE f.friend_id = ${req.player.id} AND f.status = 'pending'
      ORDER BY f.created_at
    `;
    res.json({ friends, pending });
  } catch (err) {
    console.error('friends list failed:', err);
    res.status(500).json({ error: 'Could not load friends' });
  }
});

// Send a friend request by username.
router.post('/request', async (req, res) => {
  const { username } = req.body || {};
  if (!username) return res.status(400).json({ error: 'Username required' });
  try {
    const [target] = await sql`SELECT id, username FROM players WHERE username = ${username}`;
    if (!target) return res.status(404).json({ error: 'No player with that username' });
    if (target.id === req.player.id) {
      return res.status(400).json({ error: "You can't befriend yourself" });
    }
    const [existing] = await sql`
      SELECT id, status FROM friendships
      WHERE (player_id = ${req.player.id} AND friend_id = ${target.id})
         OR (player_id = ${target.id} AND friend_id = ${req.player.id})
    `;
    if (existing) {
      const msg = existing.status === 'accepted' ? 'Already friends' : 'Request already pending';
      return res.status(409).json({ error: msg });
    }
    const [request] = await sql`
      INSERT INTO friendships (player_id, friend_id, status)
      VALUES (${req.player.id}, ${target.id}, 'pending')
      RETURNING id, status
    `;
    res.status(201).json({ request: { ...request, username: target.username } });
  } catch (err) {
    console.error('friend request failed:', err);
    res.status(500).json({ error: 'Could not send request' });
  }
});

// Accept a pending request addressed to you.
router.post('/accept/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid request id' });
  try {
    const [accepted] = await sql`
      UPDATE friendships SET status = 'accepted'
      WHERE id = ${id} AND friend_id = ${req.player.id} AND status = 'pending'
      RETURNING id
    `;
    if (!accepted) return res.status(404).json({ error: 'No such pending request' });
    res.json({ ok: true });
  } catch (err) {
    console.error('friend accept failed:', err);
    res.status(500).json({ error: 'Could not accept request' });
  }
});

// Remove a friend (or decline/cancel a pending request).
router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid friendship id' });
  try {
    const [removed] = await sql`
      DELETE FROM friendships
      WHERE id = ${id} AND (player_id = ${req.player.id} OR friend_id = ${req.player.id})
      RETURNING id
    `;
    if (!removed) return res.status(404).json({ error: 'Friendship not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('friend remove failed:', err);
    res.status(500).json({ error: 'Could not remove friend' });
  }
});

export default router;
