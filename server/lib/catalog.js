// Item catalogue + NPC definitions, shared with the frontend (single source
// of truth lives in /public/js so the browser can fetch the same files).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicJs = path.join(__dirname, '../../public/js');

export const ITEMS = JSON.parse(readFileSync(path.join(publicJs, 'items.json'), 'utf8'));
export const NPCS = JSON.parse(readFileSync(path.join(publicJs, 'npcs.json'), 'utf8'));

export function getNpcById(npcId) {
  return NPCS.find((npc) => npc.id === npcId);
}

// Case-insensitive item lookup ("iron shield" matches "Iron Shield").
export function getItem(name) {
  const key = Object.keys(ITEMS).find(
    (k) => k.toLowerCase() === String(name).toLowerCase()
  );
  return key ? { name: key, ...ITEMS[key] } : null;
}
