// WebSocket hub: JWT-authenticated connections, message routing into the
// shared world, and heartbeats so dead connections get cleaned up.
import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import { sql } from '../db.js';
import { world } from './state.js';

export function attachGameServer(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', async (socket, req) => {
    let payload;
    try {
      const token = new URL(req.url, 'http://localhost').searchParams.get('token');
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      socket.close(4001, 'Unauthorized');
      return;
    }

    let level = 1;
    try {
      const [stats] = await sql`SELECT level FROM player_stats WHERE player_id = ${payload.id}`;
      if (stats) level = stats.level;
    } catch (err) {
      console.error('ws level lookup failed:', err);
    }

    const playerId = payload.id;
    socket.isAlive = true;
    socket.on('pong', () => { socket.isAlive = true; });

    world.addPlayer(playerId, payload.username, level, socket);

    socket.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      switch (msg.t) {
        case 'move':
          world.movePlayer(playerId, msg.x, msg.y, msg.facing);
          break;
        case 'engage':
          world.engage(playerId, msg.enemyId);
          break;
        case 'attack':
          world.attack(playerId, msg.enemyId, msg.damage);
          break;
        case 'disengage':
          world.freeEngagedEnemies(playerId);
          break;
      }
    });

    socket.on('close', () => {
      // Only remove if this socket still represents the player (it may have
      // been replaced by a newer connection from the same account).
      if (world.players.get(playerId)?.socket === socket) {
        world.removePlayer(playerId);
      }
    });
    socket.on('error', () => socket.terminate());
  });

  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (!socket.isAlive) { socket.terminate(); continue; }
      socket.isAlive = false;
      socket.ping();
    }
  }, 30000);
  heartbeat.unref();

  return wss;
}
