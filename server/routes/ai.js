import { Router } from 'express';
import AiClient from 'groq-sdk';
import { sql } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { getNpcById } from '../lib/catalog.js';

const router = Router();
router.use(requireAuth);

// AI_API_KEY is preferred; GROQ_API_KEY still works for older .env files.
const AI_API_KEY = process.env.AI_API_KEY || process.env.GROQ_API_KEY;
const AI_MODEL = process.env.AI_MODEL || process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
const ai = AI_API_KEY ? new AiClient({ apiKey: AI_API_KEY }) : null;

// Player message + NPC context → AI → streamed reply (SSE over POST).
router.post('/npc', async (req, res) => {
  const { npcId, playerMessage, playerStats, memoryContext } = req.body || {};
  const npc = getNpcById(npcId);
  if (!npc) return res.status(404).json({ error: 'Unknown NPC' });
  if (!playerMessage || typeof playerMessage !== 'string' || playerMessage.length > 500) {
    return res.status(400).json({ error: 'playerMessage required (max 500 chars)' });
  }
  if (!ai) {
    return res.status(503).json({ error: 'AI_API_KEY is not configured on the server' });
  }

  const level = Number(playerStats?.level) || 1;
  const gold = Number(playerStats?.gold) || 0;

  const merchantLine = npc.sells?.length
    ? `You sell: ${npc.sells.join(', ')}. If the player wants to buy, include a JSON block like {"action":"offer","item":"Iron Shield","price":80} with a fair price.`
    : '';

  const systemPrompt = `
You are ${npc.name}, a ${npc.role} in ${npc.location}.
Personality: ${npc.personality}
The player is level ${level} with ${gold} gold.
Previous context: ${memoryContext || 'No prior interaction.'}
Stay fully in character. Keep replies under 3 sentences.
${merchantLine}
  `.trim();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  try {
    const stream = await ai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: playerMessage }
      ],
      stream: true,
      max_tokens: 150
    });

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || '';
      if (text) res.write(`data: ${JSON.stringify({ text })}\n\n`);
    }
    res.write('data: [DONE]\n\n');
  } catch (err) {
    console.error('AI stream failed:', err);
    res.write(`data: ${JSON.stringify({ error: 'The NPC stares at you blankly. (AI error)' })}\n\n`);
    res.write('data: [DONE]\n\n');
  }
  res.end();
});

// Lightweight NPC memory: one short summary per player+NPC pair.
router.get('/memory/:npcId', async (req, res) => {
  try {
    const [memory] = await sql`
      SELECT summary, updated_at FROM npc_memory
      WHERE player_id = ${req.player.id} AND npc_id = ${req.params.npcId}
    `;
    res.json({ summary: memory?.summary || null });
  } catch (err) {
    console.error('memory get failed:', err);
    res.status(500).json({ error: 'Could not load memory' });
  }
});

router.post('/memory/:npcId', async (req, res) => {
  const { summary } = req.body || {};
  if (!summary || typeof summary !== 'string' || summary.length > 500) {
    return res.status(400).json({ error: 'summary required (max 500 chars)' });
  }
  try {
    await sql`
      INSERT INTO npc_memory (player_id, npc_id, summary, updated_at)
      VALUES (${req.player.id}, ${req.params.npcId}, ${summary}, NOW())
      ON CONFLICT (player_id, npc_id)
      DO UPDATE SET summary = ${summary}, updated_at = NOW()
    `;
    res.json({ ok: true });
  } catch (err) {
    console.error('memory save failed:', err);
    res.status(500).json({ error: 'Could not save memory' });
  }
});

export default router;
