// Rich markup kit — turns structured content into Bot API 10.3 rich HTML.
// This is the single source of truth used by BOTH the AI post-processor and the manual designer.

/* ------------------------------------------------------------------ escaping */
export const esc = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ------------------------------------------------------------ inline markup */
export const inline = {
  b: (x) => `<b>${x}</b>`,
  i: (x) => `<i>${x}</i>`,
  u: (x) => `<u>${x}</u>`,
  s: (x) => `<s>${x}</s>`,
  spoiler: (x) => `<tg-spoiler>${x}</tg-spoiler>`,
  code: (x) => `<code>${x}</code>`,
  mark: (x) => `<mark>${x}</mark>`,
  sub: (x) => `<sub>${x}</sub>`,
  sup: (x) => `<sup>${x}</sup>`,
  a: (text, url) => `<a href="${esc(url)}">${text}</a>`,
  user: (text, id) => `<a href="tg://user?id=${esc(id)}">${text}</a>`,
  emoji: (id, alt) => `<tg-emoji emoji-id="${esc(id)}">${alt}</tg-emoji>`,
  time: (unix, text, format = 'wDT') => `<tg-time unix="${esc(unix)}" format="${esc(format)}">${text}</tg-time>`,
  math: (latex) => `<tg-math>${esc(latex)}</tg-math>`,
  anchor: (name) => `<a name="${esc(name)}"></a>`,
  ref: (name, text) => `<tg-reference name="${esc(name)}">${text}</tg-reference>`,
  anchorLink: (text, name) => `<a href="#${esc(name)}">${text}</a>`,
  br: () => '<br>',
  button: (label, attrs = {}) => {
    const a = Object.entries(attrs).filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => ` ${k}="${esc(v)}"`).join('');
    return `<tg-button${a}>${label}</tg-button>`;
  }
};

/* ------------------------------------------------------------- block markup */
export const block = {
  h: (level, text) => `<h${Math.min(6, Math.max(1, Number(level) || 2))}>${text}</h${Math.min(6, Math.max(1, Number(level) || 2))}>`,
  p: (text) => `<p>${text}</p>`,
  ul: (items) => `<ul>${items.map(x => `<li>${x}</li>`).join('')}</ul>`,
  ol: (items, start) => `<ol${start ? ` start="${Number(start)}"` : ''}>${items.map(x => `<li>${x}</li>`).join('')}</ol>`,
  tasks: (items) => `<ul>${items.map(({ text, done }) => `<li>${done ? '+ ' : '- '}${text}</li>`).join('')}</ul>`,
  quote: (text, { expandable = false, credit = '' } = {}) =>
    `<blockquote${expandable ? ' expandable' : ''}>${text}${credit ? `<cite>${credit}</cite>` : ''}</blockquote>`,
  pull: (text, credit = '') => `<aside>${text}${credit ? `<cite>${credit}</cite>` : ''}</aside>`,
  details: (summary, content, open = false) => `<details${open ? ' open' : ''}><summary>${summary}</summary>${content}</details>`,
  pre: (code, lang = '') => lang
    ? `<pre><code class="language-${esc(lang)}">${esc(code)}</code></pre>`
    : `<pre>${esc(code)}</pre>`,
  footer: (text) => `<footer>${text}</footer>`,
  hr: () => '<hr>',
  mathBlock: (latex) => `<tg-math-block>${esc(latex)}</tg-math-block>`,
  caption: (text) => `<figcaption>${text}</figcaption>`,
  cite: (text) => `<cite>${text}</cite>`,

  /** rows = [[{text, header?, colspan?, rowspan?, align?, valign?}, …], …] */
  table: (rows, { bordered = true, striped = true, compact = false, caption = '' } = {}) => {
    const attrs = [bordered && 'bordered', striped && 'striped', compact && 'compact'].filter(Boolean).join(' ');
    const body = rows.map(row => `<tr>${row.map(c => {
      const tag = c.header ? 'th' : 'td';
      const a = [
        c.colspan ? `colspan="${c.colspan}"` : '',
        c.rowspan ? `rowspan="${c.rowspan}"` : '',
        `align="${c.align || 'left'}"`,
        `valign="${c.valign || 'middle'}"`
      ].filter(Boolean).join(' ');
      return `<${tag} ${a}>${c.text ?? ''}</${tag}>`;
    }).join('')}</tr>`).join('');
    return `<table${attrs ? ' ' + attrs : ''}>${caption ? `<caption>${caption}</caption>` : ''}${body}</table>`;
  },

  /** Rich buttons inside the message body. rows = [[{label, type, style, url, data, text, query}, …]] */
  btnRow: (buttons, align = 'left') =>
    `<tg-button-row${align && align !== 'left' ? ` align="${esc(align)}"` : ''}>` +
    buttons.filter(Boolean).map(b => inline.button(b.label, buttonAttrs(b))).join('') +
    '</tg-button-row>',

  photo: (src, caption = '', credit = '') => mediaBlock('img', src, { caption, credit }),
  animation: (src, caption = '', credit = '') => mediaBlock('video', src, { caption, credit, extra: 'loop muted playsinline' }),
  video: (src, caption = '', credit = '') => mediaBlock('video', src, { caption, credit }),
  audio: (src, caption = '', credit = '') => mediaBlock('audio', src, { caption, credit }),
  voice: (src, caption = '', credit = '') => mediaBlock('audio', src, { caption, credit, extra: 'data-voice="1"' }),
  collage: (sources, caption = '') => `<tg-collage>${sources.map(s => `<img src="${esc(s)}"/>`).join('')}${caption ? `<figcaption>${caption}</figcaption>` : ''}</tg-collage>`,
  slideshow: (sources, caption = '') => `<tg-slideshow>${sources.map(s => `<img src="${esc(s)}"/>`).join('')}${caption ? `<figcaption>${caption}</figcaption>` : ''}</tg-slideshow>`,
  map: ({ lat, long, zoom = 14 }) => `<tg-map lat="${esc(lat)}" long="${esc(long)}" zoom="${esc(zoom)}"/>`
};

function mediaBlock(tag, src, { caption = '', credit = '', extra = '' } = {}) {
  const node = `<${tag} src="${esc(src)}"${extra ? ' ' + extra : ''}>${tag === 'img' ? '' : `</${tag}>`}`;
  if (!caption && !credit) return node;
  return `<figure>${node}${caption ? `<figcaption>${caption}${credit ? `<cite>${credit}</cite>` : ''}</figcaption>` : ''}</figure>`;
}

/** RichMessageButton attributes: exactly one action + optional style. */
export function buttonAttrs(b = {}) {
  const a = { type: b.type || 'url' };
  if (b.style) a.style = b.style;
  switch (b.type) {
    case 'url': a.url = b.value; break;
    case 'callback_data': a.data = String(b.value).slice(0, 64); break;
    case 'copy_text': a.text = b.value; break;
    case 'switch_inline_query':
    case 'switch_inline_query_current_chat':
    case 'switch_inline_query_chosen_chat': a.query = b.value || ''; break;
    case 'disabled': delete a.type; a.type = 'disabled'; break;
    default: a.url = b.value;
  }
  return a;
}

/* --------------------------------------------- light markdown → inline HTML */
const PH = '\u0000'; // placeholder sentinel

export function mdInline(input) {
  if (input === undefined || input === null) return '';
  let text = esc(String(input));
  const store = [];
  const keep = (html) => { store.push(html); return `${PH}${store.length - 1}${PH}`; };

  // 1. protect code spans and links first
  text = text.replace(/```([\s\S]+?)```/g, (_, c) => keep(`<code>${c.trim()}</code>`));
  text = text.replace(/`([^`]+)`/g, (_, c) => keep(`<code>${c}</code>`));
  text = text.replace(/\[([^\]\n]+)\]\((https?:[^)\s]+|tg:\/\/[^)\s]+|mailto:[^)\s]+)\)/g,
    (_, label, url) => keep(`<a href="${url}">${label}</a>`));
  text = text.replace(/(^|\s)(@[A-Za-z][A-Za-z0-9_]{3,31})/g, (m, pre, user) => `${pre}${keep(`<a href="https://t.me/${user.slice(1)}">${user}</a>`)}`);

  // 2. inline formatting
  text = text
    .replace(/\*\*\*(.+?)\*\*\*/g, '<b><i>$1</i></b>')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/(^|[\s(])\*([^*\n]+?)\*(?=[\s.,!?)]|$)/g, '$1<i>$2</i>')
    .replace(/__(.+?)__/g, '<u>$1</u>')
    .replace(/~~(.+?)~~/g, '<s>$1</s>')
    .replace(/\|\|(.+?)\|\|/g, '<tg-spoiler>$1</tg-spoiler>')
    .replace(/==(.+?)==/g, '<mark>$1</mark>')
    .replace(/\^([^\s^]+)\^/g, '<sup>$1</sup>')
    .replace(/~(?!~)([^\s~]+)~/g, '<sub>$1</sub>');

  // 3. restore protected spans
  return text.replace(new RegExp(`${PH}(\\d+)${PH}`, 'g'), (_, i) => store[Number(i)]);
}

/** Small Markdown → rich-HTML converter (headings, lists, quotes, fences, rules, paragraphs).
 * Used when plain text still has to become HTML — e.g. so premium emoji can be applied. */
/**
 * Models mix Markdown emphasis into HTML (`<h1>**Title**</h1>`). Strip the markers into
 * real tags — but never inside <code>/<pre>/<tg-*> and never inside a tag or attribute.
 */
export function fixInlineMarkdown(html) {
  const src = String(html || '');
  if (!/\*\*|__|~~|`/.test(src)) return src;
  let out = '';
  let i = 0;
  let skipTag = null;                                  // inside <code>/<pre>/<tg-…>
  const codeTag = /^<(code|pre|tg-[a-z-]+)[\s>]/i;
  const closeTag = /^<\/(code|pre|tg-[a-z-]+)\s*>/i;
  while (i < src.length) {
    const rest = src.slice(i);
    if (rest[0] === '<') {
      const close = /^<\/[a-zA-Z-]+\s*>/.exec(rest);
      const open = /^<[a-zA-Z-]+[^>]*>/.exec(rest);
      if (skipTag && close && closeTag.test(rest)) { skipTag = null; out += close[0]; i += close[0].length; continue; }
      if (!skipTag && open && codeTag.test(rest)) { skipTag = open[0]; out += open[0]; i += open[0].length; continue; }
      out += open ? open[0] : rest[0];
      i += open ? open[0].length : 1;
      continue;
    }
    if (skipTag) { out += rest[0]; i += 1; continue; }
    const rules = [
      [/^``([^`]+)``/, '<code>$1</code>'],
      [/^`([^`\n]+)`/, '<code>$1</code>'],
      [/^\*\*([^*\n]+)\*\*/, '<b>$1</b>'],
      [/^__([^_\n]+)__/, '<b>$1</b>'],
      [/^~~([^~\n]+)~~/, '<s>$1</s>'],
      [/^\*([^*\n]+)\*/, '<i>$1</i>'],
      [/^_([^_\n]+)_/, '<i>$1</i>']
    ];
    let matched = false;
    for (const [re, rep] of rules) {
      const m = re.exec(rest);
      if (m) { out += m[0].replace(re, rep); i += m[0].length; matched = true; break; }
    }
    if (matched) continue;
    out += rest[0];
    i += 1;
  }
  return out;
}

export function mdToHtml(markdown) {
  const lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let list = null;          // 'ul' | 'ol'
  let tasks = false;
  let quote = [];
  let fence = null;

  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; tasks = false; } };
  const closeQuote = () => {
    if (quote.length) {
      const body = quote.join('\n');
      out.push(body.includes('\n') || quote.length > 1
        ? `<blockquote expandable>${body}</blockquote>`
        : `<blockquote>${body}</blockquote>`);
      quote = [];
    }
  };
  const openList = (kind) => { if (list !== kind) { closeList(); out.push(`<${kind}>`); list = kind; } };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (fence) {
      if (/^```/.test(line)) { out.push(block.pre(fence.body.join('\n'), fence.lang)); fence = null; }
      else fence.body.push(raw);
      continue;
    }
    const openFence = /^```([a-zA-Z0-9+#-]*)\s*$/.exec(line);
    if (openFence) { closeList(); closeQuote(); fence = { lang: openFence[1], body: [] }; continue; }

    if (!line.trim()) { closeList(); closeQuote(); continue; }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) { closeList(); closeQuote(); out.push(block.h(heading[1].length, mdInline(heading[2]))); continue; }

    if (/^\s{0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { closeList(); closeQuote(); out.push(block.hr()); continue; }

    if (/^\s*>\s?/.test(line)) { closeList(); quote.push(mdInline(line.replace(/^\s*>\s?/, ''))); continue; }
    closeQuote();

    const task = /^\s*[-*]\s+\[([ xX])\]\s+(.*)$/.exec(line);
    if (task) {
      openList('ul');
      tasks = true;
      out.push(`<li>${task[1].toLowerCase() === 'x' ? '+' : '-'} ${mdInline(task[2])}</li>`);
      continue;
    }
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    if (bullet) { openList('ul'); out.push(`<li>${mdInline(bullet[1])}</li>`); continue; }

    const ordered = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);
    if (ordered) { openList('ol'); out.push(`<li>${mdInline(ordered[2])}</li>`); continue; }

    closeList();
    out.push(block.p(mdInline(line)));
  }
  if (fence) out.push(block.pre(fence.body.join('\n'), fence.lang));
  closeList();
  closeQuote();
  return out.join('\n');
}

/* --------------------------------------------------- document → rich payload */
export const RTL_RE = /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0750-\u077F\u0780-\u07BF\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
export const isRtlText = (s) => RTL_RE.test(String(s || ''));

/** Strip markup for previews / listings (keeps custom emoji + time fallbacks). */
export function plain(markup) {
  return String(markup || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<a name="[^"]*"><\/a>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * doc = {
 *   title?: string, titleLevel?: 1..6,
 *   blocks: [{ id, kind, label, markup }],
 *   media: [{ id, kind, media }],
 *   trailingButtons?: [[{label,type,style,value}]],
 *   isRtl?: boolean|null,        (null = auto)
 *   premium?: boolean            (false = do not upgrade emoji, default on)
 * }
 * options.premiumMap = Map<emoji, custom_emoji_id> learned by the bot
 */
export function renderDoc(doc = {}, options = {}) {
  const parts = [];
  if (doc.title) parts.push(block.h(doc.titleLevel || 1, mdInline(doc.title)));
  for (const b of doc.blocks || []) if (b.markup) parts.push(b.markup);
  for (const row of doc.trailingButtons || []) if (row.length) parts.push(block.btnRow(row));
  let html = parts.join('\n').slice(0, 32768);
  if (doc.premium !== false && options.premiumize) html = options.premiumize(html);
  const rich = { html };
  if (doc.media?.length) rich.media = doc.media.map(m => ({ id: m.id, media: m.media }));
  const rtl = doc.isRtl === null || doc.isRtl === undefined ? isRtlText(plain(html)) : Boolean(doc.isRtl);
  if (rtl) rich.is_rtl = true;
  return rich;
}

export const emptyDoc = () => ({ title: '', titleLevel: 1, blocks: [], media: [], trailingButtons: [], isRtl: null });
