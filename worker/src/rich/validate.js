// Validation, auto-repair and Telegram-message reconstruction for rich markup.
import { fixInlineMarkdown, esc } from './kit.js';

export const LIMITS = { chars: 32768, media: 50, blocks: 500, depth: 16, buttons: 8 };

/** Tags Bot API 10.3 understands (plus the few HTML-ish ones Telegram mirrors). */
export const ALLOWED_TAGS = new Set([
  'b', 'strong', 'i', 'em', 'u', 'ins', 's', 'strike', 'del', 'tg-spoiler', 'code', 'pre', 'mark', 'sub', 'sup',
  'a', 'tg-emoji', 'tg-time', 'tg-math', 'tg-math-block', 'tg-reference',
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'aside', 'cite', 'details', 'summary',
  'table', 'caption', 'tr', 'th', 'td', 'hr', 'br', 'footer',
  'img', 'video', 'audio', 'figure', 'figcaption',
  'tg-collage', 'tg-slideshow', 'tg-map', 'tg-button-row', 'tg-button', 'tg-document', 'tg-thinking'
]);
export const VOID_TAGS = new Set(['br', 'hr', 'img', 'tg-map', 'video', 'audio', 'source', 'input']);

const BLOCK_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'aside', 'details',
  'table', 'tr', 'td', 'th', 'footer', 'figure', 'tg-collage', 'tg-slideshow', 'tg-button-row', 'pre', 'hr', 'tg-math-block']);
const MEDIA_TAGS = new Set(['img', 'video', 'audio', 'tg-document']);

const TAG_RE = /<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const attr = (raw, name) => {
  const m = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`).exec(raw || '');
  return m ? (m[2] ?? m[3] ?? '') : '';
};

/** Parse + measure rich markup. Never throws. */
export function analyze(markup) {
  const text = String(markup || '');
  const stack = [];
  const errors = [];
  const warnings = [];
  let chars = 0, media = 0, blocks = 0, maxDepth = 0, buttons = 0, cursor = 0;
  const unknown = new Set();
  const selfClosing = new Set();
  TAG_RE.lastIndex = 0;
  let m;
  while ((m = TAG_RE.exec(text))) {
    chars += m.index - cursor;
    cursor = TAG_RE.lastIndex;
    const name = m[1].toLowerCase();
    const raw = m[2] || '';
    const closing = m[0].startsWith('</');
    const isVoid = VOID_TAGS.has(name) || /\/\s*>$/.test(m[0]) || /selfclosing|tg-map/.test(raw);
    if (!ALLOWED_TAGS.has(name)) unknown.add(name);
    if (BLOCK_TAGS.has(name) && !closing) blocks++;
    if (MEDIA_TAGS.has(name) && !closing) media++;
    if (name === 'tg-button' && !closing) buttons++;
    if (closing) {
      if (isVoid) continue;
      let openIdx = -1;
      for (let i = stack.length - 1; i >= 0; i--) if (stack[i].name === name) { openIdx = i; break; }
      if (openIdx === -1) errors.push({ type: 'stray-close', tag: name, message: `</${name}> has no opening tag` });
      else {
        for (let i = stack.length - 1; i > openIdx; i--) {
          errors.push({ type: 'unclosed', tag: stack[i].name, message: `<${stack[i].name}> is never closed` });
          selfClosing.add(stack[i].name);
        }
        stack.length = openIdx;
      }
    } else if (!isVoid) {
      stack.push({ name, index: m.index });
      maxDepth = Math.max(maxDepth, stack.length);
      const start = stack.length;
      if (start > LIMITS.depth) warnings.push({ type: 'depth', message: `nesting deeper than ${LIMITS.depth}` });
    } else {
      if (name === 'tg-map' || name === 'video' || name === 'audio') selfClosing.add(name);
    }
  }
  chars += text.length - cursor;
  for (const s of stack) errors.push({ type: 'unclosed', tag: s.name, message: `<${s.name}> is never closed` });
  for (const tag of unknown) warnings.push({ type: 'unknown-tag', tag, message: `<${tag}> is not part of the Rich Message spec` });
  if (chars > LIMITS.chars) errors.push({ type: 'too-long', message: `${chars} characters > ${LIMITS.chars}` });
  if (media > LIMITS.media) errors.push({ type: 'too-many-media', message: `${media} media items > ${LIMITS.media}` });
  if (blocks > LIMITS.blocks) warnings.push({ type: 'many-blocks', message: `${blocks} blocks (> ${LIMITS.blocks})` });
  if (buttons > LIMITS.buttons) warnings.push({ type: 'many-buttons', message: `${buttons} buttons in one row (> ${LIMITS.buttons})` });

  return {
    ok: errors.length === 0,
    errors, warnings, stats: { chars, media, blocks, buttons, depth: maxDepth },
    looksLikeHtml: TAG_RE.test(text) || /<[a-zA-Z]/.test(text)
  };
}

/** Close dangling tags so a nearly-good AI answer still sends. */
export function repair(markup) {
  const text = String(markup || '');
  const stack = [];
  let out = '';
  let cursor = 0;
  TAG_RE.lastIndex = 0;
  let m;
  while ((m = TAG_RE.exec(text))) {
    out += text.slice(cursor, m.index);
    cursor = TAG_RE.lastIndex;
    const name = m[1].toLowerCase();
    const closing = m[0].startsWith('</');
    const isVoid = VOID_TAGS.has(name) || /\/\s*>$/.test(m[0]);
    if (!ALLOWED_TAGS.has(name)) continue; // drop unknown tags, keep their text
    if (isVoid) out += m[0];
    else if (closing) {
      const idx = stack.lastIndexOf(name);
      if (idx === -1) continue;                       // stray closer → drop
      while (stack.length > idx) out += `</${stack.pop()}>`;
    } else { stack.push(name); out += m[0]; }
  }
  out += text.slice(cursor);
  while (stack.length) out += `</${stack.pop()}>`;
  return out;
}

/** Remove model chatter, code fences and stray wrappers around the markup. */
export function cleanOutput(raw) {
  let text = String(raw || '').trim();
  // A single fenced block: the model wrapped the whole message — unwrap it.
  const fences = [...text.matchAll(/```[a-zA-Z]*\s*([\s\S]*?)```/g)];
  if (fences.length === 1 && fences[0][1].trim()) text = fences[0][1].trim();
  else if (fences.length > 1 && /^```/.test(text)) text = text.slice(text.indexOf('```') + 3).replace(/```[\s\S]*$/, '').trim();
  text = text.replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/i, '');
  // JSON envelope: {"html": "..."} or {"markdown": "..."}
  if (text.startsWith('{') && text.endsWith('}')) {
    try {
      const obj = JSON.parse(text);
      for (const k of ['html', 'markdown', 'text', 'content', 'rich', 'message']) {
        if (typeof obj[k] === 'string') return cleanOutput(obj[k]);
      }
    } catch { /* not JSON, keep going */ }
  }
  // conversational preamble / sign-off
  const lines = text.split('\n');
  const isChatter = (l) => {
    const s = l.trim();
    if (!s) return false;
    if (!/[<>]/.test(s) && /(here('| i)s|here you go|sure[,!]|certainly|حتماً|البته|این هم|بفرما|امیدوارم|let me know|می‌خواهی|اگر خواستی|امیدوارم لذت)/i.test(s)) return true;
    return /^(?:here('| i)s|sure|certainly|حتماً|این هم|بفرما)[^\n]{0,60}:$/i.test(s);
  };
  while (lines.length && isChatter(lines[0])) lines.shift();
  while (lines.length && isChatter(lines[lines.length - 1])) lines.pop();
  return lines.join('\n').trim();
}

/** Full pipeline for anything that arrives from a model. */
export function normalizeOutput(raw, { lang = 'fa' } = {}) {
  const cleaned = fixInlineMarkdown(cleanOutput(raw));
  const mdLike = !/<[a-zA-Z][^>]*>/.test(cleaned) || /(^|\n)\s{0,3}(#{1,6}\s|[-*]\s|\d+\.\s|>\s)/.test(cleaned);
  if (mdLike && !/<(p|h[1-6]|ul|ol|table|blockquote|aside|details|tg-)/i.test(cleaned)) {
    return { markdown: cleaned.slice(0, LIMITS.chars), repaired: false };
  }
  const a = analyze(cleaned);
  const fixed = a.ok ? cleaned : repair(cleaned);
  const after = analyze(fixed);
  return { html: fixed.slice(0, LIMITS.chars), repaired: !a.ok, warnings: after.warnings, stats: after.stats, lang };
}

/** Any message sent to the bot → rich payload (entity reconstruction, TeleRich-style). */
export function reconstruct(message) {
  const text = message.text || message.caption || '';
  const entities = message.entities || message.caption_entities || [];
  if (!entities.length) {
    const looksHtml = /<\/?[a-zA-Z][\s\S]*?>/.test(text);
    const obj = looksHtml ? { html: text } : { markdown: text };
    if (!looksHtml) return obj;
    const a = analyze(text);
    return { html: a.ok ? text : repair(text) };
  }
  const starts = new Map(), ends = new Map();
  const tags = {
    bold: ['<b>', '</b>'], italic: ['<i>', '</i>'], underline: ['<u>', '</u>'], strikethrough: ['<s>', '</s>'],
    spoiler: ['<tg-spoiler>', '</tg-spoiler>'], code: ['<code>', '</code>'], pre: ['<pre><code>', '</code></pre>'],
    blockquote: ['<blockquote>', '</blockquote>'], expandable_blockquote: ['<blockquote expandable>', '</blockquote>']
  };
  for (const e of [...entities].sort((a, b) => a.offset - b.offset || b.length - a.length)) {
    let pair = tags[e.type];
    if (e.type === 'text_link') pair = [`<a href="${esc(e.url)}">`, '</a>'];
    if (e.type === 'text_mention') pair = [`<a href="tg://user?id=${e.user.id}">`, '</a>'];
    if (e.type === 'custom_emoji') pair = [`<tg-emoji emoji-id="${esc(e.custom_emoji_id)}">`, '</tg-emoji>'];
    if (!pair) continue;
    starts.set(e.offset, (starts.get(e.offset) || '') + pair[0]);
    ends.set(e.offset + e.length, pair[1] + (ends.get(e.offset + e.length) || ''));
  }
  let out = '';
  for (let i = 0; i <= text.length; i++) out += (ends.get(i) || '') + (starts.get(i) || '') + (i < text.length ? esc(text[i]) : '');
  return { html: out };
}

/** Human-readable validation report for the chat. */
export function report(result, lang = 'fa') {
  const fa = lang === 'fa';
  const lines = [];
  if (result.error) lines.push(fa ? `⛔️ خطا: ${result.error}` : `⛔️ ${result.error}`);
  for (const e of result.errors || []) lines.push(`⛔️ ${e.message}`);
  for (const w of result.warnings || []) lines.push(`⚠️ ${w.message}`);
  if (result.stats) {
    lines.push(fa
      ? `📊 ${result.stats.chars} کاراکتر · ${result.stats.media} رسانه · ${result.stats.blocks} بلوک · عمق ${result.stats.depth}`
      : `📊 ${result.stats.chars} chars · ${result.stats.media} media · ${result.stats.blocks} blocks · depth ${result.stats.depth}`);
  }
  return lines.join('\n');
}
