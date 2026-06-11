import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

// The Neon HTTP driver runs one statement per call, so migrations are a list.
const statements = [
  `CREATE TABLE IF NOT EXISTS players (
    id            SERIAL PRIMARY KEY,
    username      TEXT UNIQUE NOT NULL,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS player_stats (
    player_id  INT PRIMARY KEY REFERENCES players(id),
    xp         INT DEFAULT 0,
    level      INT DEFAULT 1,
    gold       INT DEFAULT 50,
    hp         INT DEFAULT 100,
    max_hp     INT DEFAULT 100,
    attack     INT DEFAULT 10,
    defence    INT DEFAULT 5
  )`,
  `CREATE TABLE IF NOT EXISTS inventory (
    id          SERIAL PRIMARY KEY,
    player_id   INT REFERENCES players(id),
    item_name   TEXT NOT NULL,
    item_type   TEXT CHECK (item_type IN ('weapon','armour','consumable','misc')),
    slot        TEXT,
    equipped    BOOLEAN DEFAULT FALSE,
    stats       JSONB
  )`,
  `CREATE TABLE IF NOT EXISTS friendships (
    id         SERIAL PRIMARY KEY,
    player_id  INT REFERENCES players(id),
    friend_id  INT REFERENCES players(id),
    status     TEXT CHECK (status IN ('pending','accepted')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(player_id, friend_id)
  )`,
  `CREATE TABLE IF NOT EXISTS npc_memory (
    id         SERIAL PRIMARY KEY,
    player_id  INT REFERENCES players(id),
    npc_id     TEXT NOT NULL,
    summary    TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(player_id, npc_id)
  )`
];

for (const statement of statements) {
  await sql(statement);
}

console.log('✅ Migrations complete — all tables ready.');
