// The story: the Rift tore the sky and four shards fell across the land.
// Collect them all and seal the Rift at the altar in the Ashlands.
// This module owns the intro, the journal (Q), shard tracking and the ending.

export const SHARDS = [
  { item: 'Meadow Shard', biome: 'meadow', den: 'Goblin Caves', holder: 'Goblin Brute' },
  { item: 'Dune Shard', biome: 'desert', den: 'Scorpion Den', holder: 'Bandit Raider' },
  { item: 'Jungle Shard', biome: 'rainforest', den: 'Viper Hollow', holder: 'Shadow Panther' },
  { item: 'Ember Shard', biome: 'ashlands', den: 'Ember Depths', holder: 'Flame Tyrant' }
];

const INTRO = [
  'On the night the sky split open, four burning shards fell from the Rift and scattered across the land — into the goblin caves of the meadows, the bandit dens of the desert, the hollows of the rainforest, and the depths of the ashlands.',
  'The Rift still hangs above the world, growing. Elder Mara believes only the four shards, returned to the Rift Altar beyond the ashlands, can seal it.',
  'The strongest beast of each den hoards its shard. Grow strong, claim all four, and close the Rift.'
];

export class Story {
  constructor(game) {
    this.game = game;
    this.intro = document.getElementById('story-intro');
    this.ending = document.getElementById('story-ending');
    document.getElementById('intro-begin').addEventListener('click', () => {
      localStorage.setItem('rift_intro_seen', '1');
      this.intro.classList.add('hidden');
    });
    document.getElementById('ending-close').addEventListener('click', () => {
      this.ending.classList.add('hidden');
    });
    document.getElementById('intro-text').innerHTML =
      INTRO.map((p) => `<p>${p}</p>`).join('');
  }

  maybeShowIntro() {
    if (!localStorage.getItem('rift_intro_seen')) {
      this.intro.classList.remove('hidden');
    }
  }

  get introOpen() {
    return !this.intro.classList.contains('hidden')
      || !this.ending.classList.contains('hidden');
  }

  ownedShards() {
    const names = new Set(this.game.items.map((i) => i.item_name));
    return SHARDS.filter((s) => names.has(s.item));
  }

  shardCount() { return this.ownedShards().length; }

  onShard(itemName) {
    const shard = SHARDS.find((s) => s.item === itemName);
    if (shard) {
      this.game.ui.toast(`💠 ${itemName} claimed — check your journal (Q)`, 'good');
    }
    this.game.ui.updateHud();
  }

  // The player's current objective, derived from shards + level.
  objective() {
    const owned = new Set(this.ownedShards().map((s) => s.item));
    const level = this.game.stats.level;
    const world = this.game.world;

    for (const shard of SHARDS) {
      if (owned.has(shard.item)) continue;
      const biome = world.biomes.find((b) => b.id === shard.biome);
      if (biome?.gate && level < biome.gate.minLevel) {
        return `Reach level ${biome.gate.minLevel} to pass the gate into ${biome.name} — then take the ${shard.item} from the ${shard.holder} in ${shard.den}.`;
      }
      return `Defeat the ${shard.holder} in ${shard.den} (${world.biomes.find((b) => b.id === shard.biome)?.name}) and claim the ${shard.item}.`;
    }
    return 'All four shards burn in your pack. Carry them to the Rift Altar at the far edge of the Ember Ashlands and seal the Rift!';
  }

  openJournal() {
    const { body } = this.game.ui.buildModal('📜 Journal — Seal the Rift');
    const owned = new Set(this.ownedShards().map((s) => s.item));

    const story = document.createElement('div');
    story.className = 'journal-story';
    story.innerHTML = INTRO.map((p) => `<p>${p}</p>`).join('');
    body.appendChild(story);

    const label = document.createElement('div');
    label.className = 'section-label';
    label.textContent = `Rift shards — ${owned.size}/4`;
    body.appendChild(label);

    for (const shard of SHARDS) {
      const row = document.createElement('div');
      row.className = 'item-row';
      const has = owned.has(shard.item);
      row.innerHTML = `
        <div>
          <div class="item-name">${has ? '💠' : '◇'} ${shard.item}</div>
          <div class="item-meta">${has ? 'claimed' : `held by the ${shard.holder} · ${shard.den}`}</div>
        </div>
        <span class="${has ? 'shard-done' : 'shard-missing'}">${has ? '✓' : '…'}</span>`;
      body.appendChild(row);
    }

    const objLabel = document.createElement('div');
    objLabel.className = 'section-label';
    objLabel.textContent = 'Current objective';
    body.appendChild(objLabel);
    const obj = document.createElement('p');
    obj.className = 'journal-objective';
    obj.textContent = this.objective();
    body.appendChild(obj);
  }

  // Pressing E at the Rift Altar.
  useAltar() {
    if (this.shardCount() >= 4) {
      document.getElementById('ending-stats').textContent =
        `Sealed at level ${this.game.stats.level} · ${this.game.stats.gold} gold in your pack`;
      this.ending.classList.remove('hidden');
      localStorage.setItem('rift_sealed', '1');
    } else {
      this.game.ui.toast(
        `The altar is silent. ${this.shardCount()}/4 shards — the Rift demands all four.`, 'bad'
      );
    }
  }
}
