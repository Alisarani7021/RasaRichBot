// Emoji smart-substitution layer — pattern ported from the rich-post-bot worker.
// Canonical storage is two flat KV documents:
//   emoji:map          { "<clean emoji>" : "<custom_emoji_id>", ... }   — fast substitutions
//   emoji:variants_map { "<clean emoji>" : ["<id>", ...], ... }          — variants of the same spelling
//   emoji:packs        { "<pack name>": { title, count, ts, by }, ... }  — what was learned from where
// Legacy `eg:lib` (the old studio document) is migrated into emoji:map on first read.

export const strip = (s) => String(s).replace(/\uFE0F/g, '');

/** Both spellings of an emoji: bare and with the VS16 selector (⚡ vs ⚡️). */
export function variants(emoji) {
  const bare = strip(emoji);
  const vs16 = emoji.includes('\uFE0F') ? emoji : bare + '\uFE0F';
  return [...new Set([bare, vs16, emoji])];
}

/* ---------------------------------------------------------------- harvesting */
/** Telegram sends premium emoji as `custom_emoji` entities: id in the entity, char in text. */
export function harvest(text, entities = []) {
  const entries = {};
  let count = 0;
  for (const e of entities || []) {
    if (e.type !== 'custom_emoji' || !e.custom_emoji_id) continue;
    const emoji = String(text).slice(e.offset, e.offset + e.length);
    if (!emoji) continue;
    for (const v of variants(emoji)) entries[v] = e.custom_emoji_id;
    count++;
  }
  // count every spelling we can now map (tests + learning notice expect both)
  return { count: Object.keys(entries).length, entries };
}

export function harvestFromMessage(message) {
  if (message.entities?.length) return harvest(message.text || '', message.entities);
  if (message.caption_entities?.length) return harvest(message.caption || '', message.caption_entities);
  return { count: 0, entries: {} };
}

/* -------------------------------------------------------------------- packs */
export function packNameFromText(text) {
  if (!text) return null;
  const t = String(text).trim();
  const all = /^(?:https?:\/\/)?(?:t\.me|telegram\.me)\/(?:addemoji|addstickers)\/([A-Za-z0-9_]+)\/?$/i.exec(t);
  if (all) return { whole: true, name: all[1] };
  const tgLink = /^tg:\/\/addemoji\?set=([A-Za-z0-9_]+)/i.exec(t);
  if (tgLink) return { whole: true, name: tgLink[1] };
  const embedded = /(?:https?:\/\/)?(?:t\.me|telegram\.me)\/(?:addemoji|addstickers)\/([A-Za-z0-9_]+)/i.exec(t);
  if (embedded) return { whole: false, name: embedded[1] };
  return null;
}

/** learn a whole premium-emoji pack: getStickerSet → map + variants_map + pack record. */
export async function learnPack(ctx, name) {
  const cleanName = String(name).replace(/^@/, '').replace(/\/+$/, '').trim();
  let set;
  try {
    set = await ctx.tg.call('getStickerSet', { name: cleanName });
  } catch (error) {
    return { ok: false, error: error.message };
  }
  const stickers = set?.stickers || [];
  if (!stickers.length || !stickers[0].custom_emoji_id) {
    return { ok: false, error: 'این پک شامل ایموجی‌های پرمیوم نیست (استیکر معمولی است).' };
  }
  const [rawMap, variantsMap, packs] = await Promise.all([
    ctx.store.get('emoji:map', {}), ctx.store.get('emoji:variants_map', {}), ctx.store.get('emoji:packs', {})
  ]);
  let learned = 0;
  for (const st of stickers) {
    const cid = st.custom_emoji_id;
    if (!cid) continue;
    const spellings = variants(st.emoji || '').filter(Boolean);
    for (const spelling of spellings) if (!rawMap[spelling]) { rawMap[spelling] = cid; learned++; }
    const clean = strip(st.emoji || '');
    if (clean) {
      const bucket = new Set(variantsMap[clean] || []);
      bucket.add(cid);
      variantsMap[clean] = [...bucket].slice(0, 16);
    }
  }
  const members = [];
  {
    const seenB = new Set();
    for (const st of stickers) {
      if (!st.custom_emoji_id) continue;
      const emos = Array.isArray(st.emoji) ? st.emoji : [st.emoji];
      const base = emos.map(e => String(e || '')).find(Boolean);
      if (!base) continue;
      const clean = base.replace(/\uFE0F/g, '');
      if (seenB.has(clean)) continue;
      seenB.add(clean);
      if (members.length < 120) members.push({ b: clean, c: String(st.custom_emoji_id) });
    }
  }
  packs[cleanName] = { title: set.title || cleanName, count: stickers.filter(s => s.custom_emoji_id).length, ts: Date.now(), by: ctx.userId, members };
  await Promise.all([
    ctx.store.put('emoji:map', rawMap),
    ctx.store.put('emoji:variants_map', variantsMap),
    ctx.store.put('emoji:packs', packs)
  ]);
  invalidateCache();
  return { ok: true, title: set.title, stickers: stickers.length, learned, total: Object.keys(rawMap).length };
}

/* ------------------------------------------------------------------- storage */
const MAP_CACHE = new WeakMap(); // per-store Map cache, like before — never leaks across stores

async function rawEmojiMap(store) {
  let map = await store.get('emoji:map', null);
  if (map === null) {
    // one-time migration from the legacy studio document
    const legacy = await store.get('eg:lib', null);
    map = {};
    for (const [emoji, rec] of Object.entries(legacy?.items || {})) if (rec?.id) map[emoji] = rec.id;
    await store.put('emoji:map', map);
  }
  return map;
}

export function invalidateCache() { /* symbol kept for API parity; see per-store cache below */ }

/** Map<emoji spelling, custom_emoji_id> — cached per store instance. */
export async function libraryMap(store) {
  const hit = MAP_CACHE.get(store);
  if (hit) return hit;
  const raw = await rawEmojiMap(store);
  const map = new Map(Object.entries(raw));
  MAP_CACHE.set(store, map);
  return map;
}

export async function getEmojiMap(store) { return libraryMap(store); }

/** Save emoji learned from a message (custom_emoji entities). */
export async function remember(ctx, entries, { by = null } = {}) {
  const keys = Object.keys(entries || {});
  if (!keys.length) return { added: [] };
  const storeKey = 'emoji:map';
  const map = await rawEmojiMap(ctx.store);
  const added = [];
  for (const emoji of keys) {
    if (!map[emoji]) { map[emoji] = entries[emoji]; added.push(emoji); }
  }
  if (added.length) {
    await ctx.store.put(storeKey, map);
    MAP_CACHE.delete(ctx.store);
  }
  return { added };
}

/* -------------------------------------------------------- render-time lookup */
/** Replace every known emoji in rich html with its <tg-emoji id> — both spellings, longest key first. */
export function premiumize(html, map) {
  const src = String(html);
  if (!map || map.size === 0) return src;
  // code / pre / math zones are verbatim: emoji inside them must stay literal
  const keep = [];
  const zoned = src.replace(/<(pre|code|tg-math|tg-math-block|tg-code)[^>]*>[\s\S]*?<\/\1>/gi,
    (m) => { keep.push(m); return `\u0000${keep.length - 1}\u0000`; });
  const keys = [...map.keys()].sort((a, b) => b.length - a.length);
  const pattern = keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const out = zoned.replace(new RegExp(pattern, 'gu'), (match, offset) => {
    const before = zoned.slice(Math.max(0, offset - 64), offset);
    if (/emoji-id="[^"]*$/.test(before)) return match; // already premium
    const id = map.get(match);
    return `<tg-emoji emoji-id="${id}">${match}</tg-emoji>`;
  });
  return out.replace(/\u0000(\d+)\u0000/g, (_, i) => keep[Number(i)]);
}

/** Swap one emoji (all spellings) for a chosen custom id, returning new html. */
export function swapEmoji(html, from, to, id) {
  const clean = strip(String(from));
  if (!clean) return html;
  const shown = strip(String(to || from)) || clean;   // the artwork covers 'to', fallback text too
  const target = id ? `<tg-emoji emoji-id="${id}">${shown}</tg-emoji>` : shown;
  const spellings = variants(from);
  let out = String(html);
  // unsplit existing premium tag first, then replace plain occurrences
  const tagged = new RegExp(`<tg-emoji emoji-id="\\d+">\\s*(${spellings.map(re).join('|')})\\s*</tg-emoji>`, 'gu');
  out = out.replace(tagged, target);
  for (const s of spellings.sort((a, b) => b.length - a.length)) {
    out = out.replace(new RegExp(re(s), 'gu'), target);
  }
  return out;
}
const re = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* ------------------------------------------------------------------ analysis */
const EMOJI_REGEX = /(\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*)/gu;

/** Distinct emoji in a text with counts — VS16 variants collapse to one entry (rich-post-bot parity). */
export function extractEmojis(text) {
  if (!text) return [];
  const counts = new Map();
  EMOJI_REGEX.lastIndex = 0;
  let match;
  while ((match = EMOJI_REGEX.exec(String(text))) !== null) {
    const raw = match[0];
    const clean = raw.replace(/\uFE0F/g, '');
    if (!counts.has(clean)) counts.set(clean, { emoji: raw, clean, count: 0 });
    counts.get(clean).count++;
  }
  return [...counts.values()];
}

/** stats line: total (distinct) + premium share, rich-post-bot style. */
export function emojiStats(html, map = new Map()) {
  const plainText = String(html).replace(/<[^>]*>/g, '');
  const list = extractEmojis(plainText);
  let premium = 0;
  for (const item of list) if (map.get(item.emoji) || map.get(item.clean)) premium += item.count;
  const total = list.reduce((n, item) => n + item.count, 0);
  const missing = list.filter(item => !(map.get(item.emoji) || map.get(item.clean))).map(item => item.emoji);
  return { total, distinct: list.length, unique: list.length, premium, missing, list };
}

export function emojiSummary(html, map, lang = 'fa') {
  const stats = emojiStats(html, map);
  if (!stats.total) return null;
  if (lang === 'fa') return `😀 ${stats.total} ایموجی (${stats.distinct} منحصربفرد) · ✨ ${stats.premium} پرمیوم`;
  return `😀 ${stats.total} emoji (${stats.distinct} distinct) · ✨ ${stats.premium} premium`;
}

/* ------------------------------------------------------------- look-alikes */
// reused: coarse emoji groups for "similar to" suggestions
const GROUPS = [
  ['😐', '😑', '😶', '🫤', '😒', '🙄', '😬', '😕', '🤨', '🥱'],
  ['😢', '😭', '😥', '😞', '😔', '🥺', '😿', '💧', '🌧', '😣', '😖', '😫', '😩', '😤', '😓'],
  ['😂', '🤣', '😹', '😆', '😄', '😃', '😁', '🙂', '🙃', '😀'],
  ['🍉', '🍎', '🍕', '🍔', '🍒', '🍇', '🥝', '🍩', '☕'],
  ['🚗', '🚕', '🚌', '🚎', '🏎', '🚓'],
  ['😠', '👿', '😤', '🤬', '😡'],
  ['👍', '👎', '👌', '🤝', '🙏', '✊', '👏', '🤲'],
  ['🔥', '💥', '⚡', '✨', '🌟', '⭐', '💫'],
  ['❤️', '💖', '😍', '🥰', '😘', '💋'],
  ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🦁', '🐮', '🐸', '🦍', '👅'],
  ['🤡', '👺', '👹', '🤖', '👻', '💩', '🎃', '👼', '🎯', '🔫']
];

function sameGroup(a, b) {
  const ca = strip(a), cb = strip(b);
  return GROUPS.some((g) => g.includes(ca) && g.includes(cb));
}

/** similar learned emoji (rich-post-bot getRelatedEmojis parity: same-group candidates that exist in the map). */
/** Resolve a stored custom-emoji id tolerating the spelling Telegram sent vs the one
 *  we learned: bare, with VS16, either way round. Fixes "دارمش ولی نگاش پیدا نمی‌شه". */
export function mapLookup(map, e) {
  if (!e) return null;
  const bare = strip(e);
  return map.get(e)
    || map.get(bare)
    || map.get(e + '\uFE0F')
    || map.get(bare + '\uFE0F')
    || null;
}

/** rich-post-bot parity: look-alikes are ALWAYS offered for free choice —
 *  learned ones come first with their premium icon, the rest of the family
 *  follows so the user can browse and pick even with a slim library. */
export function similar(emoji, map, max = 14) {
  const clean = strip(emoji);
  for (const g of GROUPS) {
    if (!g.includes(clean)) continue;
    const learned = [];
    const unlearned = [];
    for (const cand of g) {
      if (cand === clean) continue;
      (mapLookup(map, cand) ? learned : unlearned).push(cand);
    }
    if (learned.length) return [...learned, ...unlearned].slice(0, max);
    return unlearned.slice(0, Math.min(8, max));
  }
  return [];
}

/** everything the variants screen needs (rich-post-bot getEmojiInspectionData parity). */
export async function getEmojiInspectionData(store, emojiStr) {
  const clean = strip(emojiStr);
  const map = await libraryMap(store);
  const variantsMap = await store.get('emoji:variants_map', {});
  let ids = variantsMap[clean] || variantsMap[emojiStr] || variantsMap[clean + '\uFE0F'] || [];
  if (!ids.length) {
    const single = mapLookup(map, emojiStr);
    if (single) ids = [single];
  }
  ids = [...new Set(ids)].slice(0, 16);
  return { emoji: emojiStr, clean, variants: ids, similar: similar(emojiStr, map), map };
}

/* ------------------------------------------------------------- studio bits */
// premium mode is always on now (studio toggle removed); kept for wizard compat.
export async function premiumEnabled() { return true; }
export async function setPremiumEnabled() { return true; }
