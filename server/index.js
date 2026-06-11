import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import authRoutes from './routes/auth.js';
import playerRoutes from './routes/player.js';
import friendsRoutes from './routes/friends.js';
import aiRoutes from './routes/ai.js';
import shopRoutes from './routes/shop.js';
import { attachGameServer } from './game/ws.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json({ limit: '32kb' }));

app.use('/api/auth', authRoutes);
app.use('/api/player', playerRoutes);
app.use('/api/friends', friendsRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/shop', shopRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use(express.static(path.join(__dirname, '../public')));

app.use((err, req, res, next) => {
  console.error('unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const server = http.createServer(app);
attachGameServer(server);

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`🗡️  RPG server running at http://localhost:${port}`);
});
