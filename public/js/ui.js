// HUD, NPC chat panel, inventory/friends modals, toasts.

import { api, streamNpcReply, clearToken } from './api.js';
import { catalogEntry } from './items.js';

// Matches a merchant offer like {"action":"offer","item":"Iron Shield","price":80}
const OFFER_RE = /\{[^{}]*"action"\s*:\s*"offer"[^{}]*\}/;

export class Ui {
  constructor(game) {
    this.game = game;
    this.chatNpc = null;
    this.lastExchange = null;
    this.streaming = false;
    this.pendingCount = 0;

    this.hud = {
      name: document.getElementById('hud-name'),
      level: document.getElementById('hud-level'),
      gold: document.getElementById('hud-gold'),
      hpFill: document.getElementById('hp-fill'),
      hpText: document.getElementById('hp-text'),
      xpFill: document.getElementById('xp-fill'),
      xpText: document.getElementById('xp-text'),
      friendsBadge: document.getElementById('friends-badge')
    };
    this.zoneLabel = document.getElementById('zone-label');
    this.interactHint = document.getElementById('interact-hint');
    this.chatPanel = document.getElementById('chat-panel');
    this.chatMessages = document.getElementById('chat-messages');
    this.chatInput = document.getElementById('chat-input');
    this.modalRoot = document.getElementById('modal-root');
    this.toasts = document.getElementById('toasts');

    document.getElementById('chat-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.sendChatMessage();
    });
    this.chatPanel.querySelector('.panel-close').addEventListener('click', () => this.closeChat());
    document.getElementById('btn-inventory').addEventListener('click', () => this.openInventory());
    document.getElementById('btn-friends').addEventListener('click', () => this.openFriends());
    document.getElementById('btn-logout').addEventListener('click', () => {
      clearToken();
      location.reload();
    });
  }

  get blocking() {
    return this.chatNpc !== null || this.modalRoot.children.length > 0;
  }

  // ---------- HUD ----------

  updateHud() {
    const { stats, player } = this.game;
    if (!stats) return;
    this.hud.name.textContent = player.username;
    this.hud.level.textContent = `Lv ${stats.level}`;
    this.hud.gold.textContent = `${stats.gold} g`;
    this.hud.hpFill.style.width = `${Math.max(0, (stats.hp / stats.max_hp) * 100)}%`;
    this.hud.hpText.textContent = `${stats.hp}/${stats.max_hp} HP`;
    const needed = stats.level * 100;
    this.hud.xpFill.style.width = `${Math.min(100, (stats.xp / needed) * 100)}%`;
    this.hud.xpText.textContent = `${stats.xp}/${needed} XP`;
  }

  setZone(name) {
    if (this.zoneLabel.textContent !== name) this.zoneLabel.textContent = name;
  }

  setInteractHint(text) {
    if (!text) {
      this.interactHint.classList.add('hidden');
    } else {
      this.interactHint.textContent = text;
      this.interactHint.classList.remove('hidden');
    }
  }

  toast(message, kind = '') {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = message;
    this.toasts.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }

  // ---------- NPC chat ----------

  async openChat(npc) {
    this.chatNpc = npc;
    this.lastExchange = null;
    this.memoryContext = null;
    this.chatMessages.innerHTML = '';
    document.getElementById('chat-npc-name').textContent =
      `${npc.def.name} — ${npc.def.role}`;
    this.chatPanel.classList.remove('hidden');
    this.addChatBubble('npc', `*${npc.def.name} turns to face you*`);
    this.chatInput.value = '';
    this.chatInput.focus();

    try {
      const { summary } = await api.getMemory(npc.def.id);
      this.memoryContext = summary;
    } catch { /* memory is optional */ }
  }

  closeChat() {
    if (!this.chatNpc) return;
    const npc = this.chatNpc;
    this.chatNpc = null;
    this.chatPanel.classList.add('hidden');
    // Persist a short memory of the conversation for next time.
    if (this.lastExchange) {
      const { playerMessage, reply } = this.lastExchange;
      const summary =
        `Last visit the player said "${playerMessage.slice(0, 120)}" and you replied "${reply.slice(0, 200)}".`;
      api.saveMemory(npc.def.id, summary).catch(() => {});
    }
  }

  addChatBubble(who, text) {
    const bubble = document.createElement('div');
    bubble.className = `chat-msg ${who}`;
    bubble.textContent = text;
    this.chatMessages.appendChild(bubble);
    this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    return bubble;
  }

  async sendChatMessage() {
    const message = this.chatInput.value.trim();
    if (!message || !this.chatNpc || this.streaming) return;
    const npc = this.chatNpc;
    this.chatInput.value = '';
    this.addChatBubble('player', message);

    const bubble = this.addChatBubble('npc', '');
    bubble.innerHTML = '<span class="cursor">▋</span>';
    this.streaming = true;

    const cursor = document.createElement('span');
    cursor.className = 'cursor';
    cursor.textContent = '▋';
    let reply = '';
    try {
      reply = await streamNpcReply(
        {
          npcId: npc.def.id,
          playerMessage: message,
          playerStats: { level: this.game.stats.level, gold: this.game.stats.gold },
          memoryContext: this.memoryContext
        },
        (text) => {
          bubble.textContent = (bubble.dataset.raw || '') + text;
          bubble.dataset.raw = bubble.textContent;
          bubble.appendChild(cursor);
          this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
        }
      );
    } catch (err) {
      bubble.textContent = `*${npc.def.name} seems lost in thought* (${err.message})`;
      this.streaming = false;
      return;
    }
    this.streaming = false;
    this.lastExchange = { playerMessage: message, reply };

    // Pull out a merchant offer JSON block, if present.
    const offerMatch = reply.match(OFFER_RE);
    let displayText = reply;
    let offer = null;
    if (offerMatch) {
      try {
        const parsed = JSON.parse(offerMatch[0]);
        if (parsed.action === 'offer' && parsed.item && Number.isFinite(Number(parsed.price))) {
          offer = { item: String(parsed.item), price: Math.max(0, Math.round(Number(parsed.price))) };
          displayText = reply.replace(offerMatch[0], '').replace(/\s{2,}/g, ' ').trim();
        }
      } catch { /* leave the raw text */ }
    }
    bubble.textContent = displayText || '…';
    if (offer) this.addOfferCard(offer);
    this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
  }

  addOfferCard(offer) {
    const card = document.createElement('div');
    card.className = 'offer-card';
    const label = document.createElement('span');
    label.textContent = `🛒 ${offer.item} — ${offer.price} gold`;
    const buyBtn = document.createElement('button');
    buyBtn.textContent = 'Buy';
    card.append(label, buyBtn);
    this.chatMessages.appendChild(card);
    this.chatMessages.scrollTop = this.chatMessages.scrollHeight;

    buyBtn.addEventListener('click', async () => {
      buyBtn.disabled = true;
      const entry = catalogEntry(offer.item) || {
        item_name: offer.item, item_type: 'misc', slot: null, stats: null
      };
      try {
        await api.addItem({ ...entry, price: offer.price });
        const { stats } = await api.stats();
        this.game.stats = stats;
        await this.game.refreshInventory();
        this.updateHud();
        this.toast(`Bought ${entry.item_name} for ${offer.price} gold`, 'good');
        buyBtn.textContent = 'Bought ✓';
      } catch (err) {
        this.toast(err.message, 'bad');
        buyBtn.disabled = false;
      }
    });
  }

  // ---------- Modals ----------

  closeModal() {
    this.modalRoot.innerHTML = '';
  }

  buildModal(title) {
    this.closeModal();
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) this.closeModal();
    });
    const modal = document.createElement('div');
    modal.className = 'modal';
    const header = document.createElement('div');
    header.className = 'panel-header';
    header.innerHTML = `<span>${title}</span>`;
    const close = document.createElement('button');
    close.className = 'panel-close';
    close.textContent = '✕';
    close.addEventListener('click', () => this.closeModal());
    header.appendChild(close);
    const body = document.createElement('div');
    body.className = 'modal-body';
    modal.append(header, body);
    backdrop.appendChild(modal);
    this.modalRoot.appendChild(backdrop);
    return { modal, body };
  }

  async openInventory() {
    const { body } = this.buildModal('🎒 Inventory');
    body.innerHTML = '<p class="empty-note">Loading…</p>';
    await this.game.refreshInventory();
    this.renderInventory(body);
  }

  renderInventory(body) {
    const items = this.game.items;
    body.innerHTML = '';
    if (!items.length) {
      body.innerHTML = '<p class="empty-note">Your bag is empty. Go loot some goblins.</p>';
      return;
    }
    for (const item of items) {
      const row = document.createElement('div');
      row.className = 'item-row';

      const info = document.createElement('div');
      const name = document.createElement('div');
      name.className = 'item-name';
      name.textContent = item.item_name;
      if (item.equipped) {
        const tag = document.createElement('span');
        tag.className = 'equipped-tag';
        tag.textContent = '● equipped';
        name.appendChild(tag);
      }
      const meta = document.createElement('div');
      meta.className = 'item-meta';
      const statText = item.stats
        ? Object.entries(item.stats).map(([k, v]) => `+${v} ${k}`).join(', ')
        : '';
      meta.textContent = [item.item_type, item.slot, statText].filter(Boolean).join(' · ');
      info.append(name, meta);
      row.appendChild(info);

      if (item.slot) {
        const btn = document.createElement('button');
        btn.textContent = item.equipped ? 'Unequip' : 'Equip';
        btn.addEventListener('click', async () => {
          try {
            const { items: updated } = await api.equip(item.id);
            this.game.items = updated;
            this.renderInventory(body);
          } catch (err) {
            this.toast(err.message, 'bad');
          }
        });
        row.appendChild(btn);
      } else if (item.item_type === 'consumable' && item.stats?.heal) {
        const btn = document.createElement('button');
        btn.textContent = `Use (+${item.stats.heal} HP)`;
        btn.addEventListener('click', async () => {
          try {
            const { stats } = this.game;
            stats.hp = Math.min(stats.max_hp, stats.hp + item.stats.heal);
            await api.setHp(stats.hp);
            await api.removeItem(item.id);
            await this.game.refreshInventory();
            this.updateHud();
            this.renderInventory(body);
            this.toast(`Glug glug… +${item.stats.heal} HP`, 'good');
          } catch (err) {
            this.toast(err.message, 'bad');
          }
        });
        row.appendChild(btn);
      }
      body.appendChild(row);
    }
  }

  // ---------- Friends ----------

  async refreshFriendsBadge() {
    try {
      const { pending } = await api.friends();
      this.pendingCount = pending.length;
      this.hud.friendsBadge.textContent = pending.length;
      this.hud.friendsBadge.classList.toggle('hidden', pending.length === 0);
    } catch { /* non-critical */ }
  }

  async openFriends() {
    const { modal, body } = this.buildModal('👥 Friends');

    const search = document.createElement('div');
    search.className = 'friend-search';
    const input = document.createElement('input');
    input.placeholder = 'Add a friend by username…';
    input.maxLength = 20;
    const sendBtn = document.createElement('button');
    sendBtn.textContent = 'Send';
    search.append(input, sendBtn);
    modal.insertBefore(search, body);

    const send = async () => {
      const username = input.value.trim();
      if (!username) return;
      try {
        await api.friendRequest(username);
        this.toast(`Friend request sent to ${username}`, 'good');
        input.value = '';
      } catch (err) {
        this.toast(err.message, 'bad');
      }
    };
    sendBtn.addEventListener('click', send);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });

    await this.renderFriends(body);
  }

  async renderFriends(body) {
    body.innerHTML = '<p class="empty-note">Loading…</p>';
    let data;
    try {
      data = await api.friends();
    } catch (err) {
      body.innerHTML = `<p class="empty-note">${err.message}</p>`;
      return;
    }
    body.innerHTML = '';

    if (data.pending.length) {
      const label = document.createElement('div');
      label.className = 'section-label';
      label.textContent = 'Pending requests';
      body.appendChild(label);
      for (const req of data.pending) {
        const row = document.createElement('div');
        row.className = 'friend-row';
        row.innerHTML = `<span>${req.username} <span class="friend-level">Lv ${req.level}</span></span>`;
        const accept = document.createElement('button');
        accept.textContent = 'Accept';
        accept.addEventListener('click', async () => {
          try {
            await api.friendAccept(req.friendship_id);
            await this.renderFriends(body);
            await this.refreshFriendsBadge();
          } catch (err) { this.toast(err.message, 'bad'); }
        });
        const decline = document.createElement('button');
        decline.className = 'danger';
        decline.textContent = 'Decline';
        decline.addEventListener('click', async () => {
          try {
            await api.friendRemove(req.friendship_id);
            await this.renderFriends(body);
            await this.refreshFriendsBadge();
          } catch (err) { this.toast(err.message, 'bad'); }
        });
        row.append(accept, decline);
        body.appendChild(row);
      }
    }

    const label = document.createElement('div');
    label.className = 'section-label';
    label.textContent = 'Friends';
    body.appendChild(label);

    if (!data.friends.length) {
      const note = document.createElement('p');
      note.className = 'empty-note';
      note.textContent = 'No friends yet — send a request above.';
      body.appendChild(note);
    }
    for (const friend of data.friends) {
      const row = document.createElement('div');
      row.className = 'friend-row';
      row.innerHTML = `<span>${friend.username} <span class="friend-level">Lv ${friend.level}</span></span>`;
      const remove = document.createElement('button');
      remove.className = 'danger';
      remove.textContent = 'Remove';
      remove.addEventListener('click', async () => {
        try {
          await api.friendRemove(friend.friendship_id);
          await this.renderFriends(body);
        } catch (err) { this.toast(err.message, 'bad'); }
      });
      row.appendChild(remove);
      body.appendChild(row);
    }
  }
}
