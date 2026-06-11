import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { sql } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function signToken(player) {
  return jwt.sign({ id: player.id, username: player.username }, process.env.JWT_SECRET, {
    expiresIn: '7d'
  });
}

router.post('/register', async (req, res) => {
  const { username, email, password } = req.body || {};
  if (!USERNAME_RE.test(username || '')) {
    return res.status(400).json({ error: 'Username must be 3-20 letters, numbers or underscores' });
  }
  if (!EMAIL_RE.test(email || '')) {
    return res.status(400).json({ error: 'Invalid email address' });
  }
  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const [player] = await sql`
      INSERT INTO players (username, email, password_hash)
      VALUES (${username}, ${email}, ${passwordHash})
      RETURNING id, username, email, created_at
    `;
    await sql`INSERT INTO player_stats (player_id) VALUES (${player.id})`;
    // Starter gear so new players aren't punching goblins bare-handed
    await sql`
      INSERT INTO inventory (player_id, item_name, item_type, slot, equipped, stats)
      VALUES (${player.id}, 'Rusty Sword', 'weapon', 'mainhand', TRUE, ${JSON.stringify({ attack: 2 })}),
             (${player.id}, 'Cloth Tunic', 'armour', 'chest', TRUE, ${JSON.stringify({ defence: 1 })})
    `;
    res.status(201).json({ token: signToken(player), player });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Username or email already taken' });
    }
    console.error('register failed:', err);
    res.status(500).json({ error: 'Could not create account' });
  }
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  try {
    const [player] = await sql`
      SELECT id, username, email, password_hash FROM players WHERE username = ${username}
    `;
    if (!player || !(await bcrypt.compare(password, player.password_hash))) {
      return res.status(401).json({ error: 'Wrong username or password' });
    }
    const { password_hash, ...profile } = player;
    res.json({ token: signToken(player), player: profile });
  } catch (err) {
    console.error('login failed:', err);
    res.status(500).json({ error: 'Could not log in' });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const [player] = await sql`
      SELECT id, username, email, created_at FROM players WHERE id = ${req.player.id}
    `;
    if (!player) return res.status(404).json({ error: 'Player not found' });
    res.json({ player });
  } catch (err) {
    console.error('me failed:', err);
    res.status(500).json({ error: 'Could not load profile' });
  }
});

export default router;
