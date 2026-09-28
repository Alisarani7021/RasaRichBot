// Persistence layer: Cloudflare KV when the STORE binding exists, in-memory fallback otherwise.
// Everything is scoped per Telegram user id, so two people never see each other's drafts.

const memFallback = new Map();

export class Store {
  constructor(env, config) {
    this.config = config;
    this.kv = env?.STORE && typeof env.STORE.get === 'function' ? env.STORE : null;
    this.mem = this.kv ? null : memFallback;
    this.ttl = config?.store?.ttl ?? 1209600;
  }

  get ephemeral() { return !this.kv; }

  async get(key, fallback = null) {
    try {
      const raw = this.kv ? await this.kv.get(key) : this.mem.get(key);
      if (raw === null || raw === undefined) return fallback;
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch { return fallback; }
  }

  async put(key, value, ttl = this.ttl) {
    const raw = JSON.stringify(value);
    try {
      if (this.kv) await this.kv.put(key, raw, { expirationTtl: ttl });
      else this.mem.set(key, raw);
    } catch (error) {
      console.error('store.put failed', key, error?.message);
    }
    return value;
  }

  async del(key) {
    try { if (this.kv) await this.kv.delete(key); else this.mem.delete(key); } catch { /* ignore */ }
  }

  /* ------------------------------------------------------------------ state */
  async state(userId) { return this.get(`s:${userId}`, null); }
  saveState(userId, state) { return this.put(`s:${userId}`, state); }
  clearState(userId) { return this.del(`s:${userId}`); }

  /* ----------------------------------------------------------------- drafts */
  async #index(kind, userId) { return this.get(`${kind}:${userId}:index`, { items: [] }); }

  async #push(kind, userId, item, max) {
    const index = await this.#index(kind, userId);
    const items = [{ id: item.id, title: item.title || '', ts: item.ts || Date.now() }, ...index.items.filter(i => i.id !== item.id)]
      .slice(0, max);
    await this.put(`${kind}:${userId}:index`, { items });
    await this.put(`${kind}:${userId}:${item.id}`, item);
    for (const stale of index.items.slice(max - 1)) await this.del(`${kind}:${userId}:${stale.id}`);
    return item.id;
  }

  async addDraft(userId, draft) {
    const item = { id: draft.id || String(Date.now()), ts: Date.now(), ...draft };
    await this.#push('d', userId, item, this.config?.store?.maxDrafts ?? 20);
    return item;
  }

  async listDrafts(userId) { return (await this.#index('d', userId)).items; }
  async getDraft(userId, id) { return this.get(`d:${userId}:${id}`, null); }

  async deleteDraft(userId, id) {
    const index = await this.#index('d', userId);
    await this.put(`d:${userId}:index`, { items: index.items.filter(i => i.id !== id) });
    await this.del(`d:${userId}:${id}`);
  }

  /* -------------------------------------------------------------- templates */
  async addTemplate(userId, tpl) {
    const item = { id: tpl.id || `t${Date.now()}`, ts: Date.now(), ...tpl };
    await this.#push('t', userId, item, this.config?.store?.maxTemplates ?? 30);
    return item;
  }

  async listTemplates(userId) { return (await this.#index('t', userId)).items; }
  async getTemplate(userId, id) { return this.get(`t:${userId}:${id}`, null); }

  async deleteTemplate(userId, id) {
    const index = await this.#index('t', userId);
    await this.put(`t:${userId}:index`, { items: index.items.filter(i => i.id !== id) });
    await this.del(`t:${userId}:${id}`);
  }

  /* ------------------------------------------------------------------ media */
  async mediaLibrary(userId) { return this.get(`m:${userId}`, { items: [] }); }

  async saveMedia(userId, item) {
    const lib = await this.mediaLibrary(userId);
    const items = [item, ...lib.items.filter(i => i.name !== item.name && i.fileId !== item.fileId)].slice(0, 30);
    await this.put(`m:${userId}`, { items });
    return item;
  }

  async getMedia(userId, name) {
    const lib = await this.mediaLibrary(userId);
    return lib.items.find(i => i.name === name) || null;
  }

  async deleteMedia(userId, name) {
    const lib = await this.mediaLibrary(userId);
    await this.put(`m:${userId}`, { items: lib.items.filter(i => i.name !== name) });
  }

  /* ------------------------------------------------------------------ prefs */
  async prefs(userId) {
    return this.get(`p:${userId}`, { lang: null, provider: null, model: null, style: null, ai: {} });
  }

  async savePrefs(userId, patch) {
    const current = await this.prefs(userId);
    const next = { ...current, ...patch, ai: { ...current.ai, ...(patch.ai || {}) } };
    await this.put(`p:${userId}`, next);
    return next;
  }
}
