// Thin Telegram Bot API client. No HTML, no CORS, no initData — this bot only talks to Telegram.
import { cfg } from './config.js';

const API = 'https://api.telegram.org';

/** Friendly, translatable hints for the errors users actually hit. */
const HINTS = [
  [/can't parse entities|unsupported start tag|can't find end tag/i, 'Markup error: one of the tags is unknown or not closed. / خطای مارک‌آپ: یک تگ ناشناخته یا بسته‌نشده دارید.'],
  [/message is too long/i, 'Message is too long (max 32,768 chars). / پیام بیش از حد بلند است.'],
  [/chat not found/i, 'Chat not found — check the @username or id. / چت پیدا نشد.'],
  [/not enough rights|CHAT_ADMIN_REQUIRED|not enough rights to send/i, 'The bot is not an administrator there. / ربات در آن مقصد ادمین نیست.'],
  [/user is not a member|USER_NOT_PARTICIPANT/i, 'You must be a member/admin there. / شما باید ادمین یا عضو آن مقصد باشید.'],
  [/FLOOD_WAIT_(\d+)/i, 'Rate limited by Telegram, retry later. / محدودیت نرخ تلگرام.'],
  [/wrong file identifier|file is not found/i, 'This media file id is no longer valid. Send the file again. / شناسه‌ی فایل معتبر نیست.'],
  [/message to edit not found|message can't be edited/i, 'The preview message is gone — reopen the builder. / پیام پیش‌نمایش از بین رفته.'],
  [/ephemeral/i, 'Ephemeral messages are only for groups. / پیام زودگذر فقط در گروه.'],
  [/too many requests/i, 'Too many requests. / درخواست‌های بیش از حد.']
];

export class TelegramError extends Error {
  constructor(method, description, code) {
    super(description || `Telegram ${method} failed`);
    this.method = method;
    this.code = code;
    this.hint = (HINTS.find(([re]) => re.test(description || '')) || [])[1] || '';
  }
}

/** A tiny ring buffer of the last Telegram API failures — readable through GET /admin. */
function rememberFailure(env, method, description, code) {
  const store = env?.STORE;
  if (!store || typeof store.get !== 'function') return;
  // fire-and-forget: diagnostics must never slow down or break a reply
  (async () => {
    try {
      const raw = await store.get('diag:tg');
      const list = raw ? JSON.parse(raw) : [];
      list.push({ at: Date.now(), method, code, description: String(description || '').slice(0, 160) });
      await store.put('diag:tg', JSON.stringify(list.slice(-25)));
    } catch { /* ignore */ }
  })();
}

const ACTION_FIELDS = ['callback_data', 'url', 'switch_inline_query', 'switch_inline_query_current_chat', 'copy_text', 'login_url', 'pay', 'web_app'];

/**
 * Last line of defence for keyboards. Telegram rejects the *entire request* with
 * "Bad Request: can't parse InlineKeyboardButton: InlineKeyboardButton must be an Object"
 * if a row is nested one level too deep, a button is `false`/`null`, a placeholder leaked
 * (`_empty`), or two actions compete on one button. Flatten/repair instead of crashing.
 */
export function normalizeMarkup(markup) {
  if (!markup || typeof markup !== 'object') return markup;
  const rows = Array.isArray(markup) ? markup : markup.inline_keyboard;
  if (!Array.isArray(rows)) return markup; // reply keyboard / remove_keyboard — leave as is

  const clean = [];
  for (const rawRow of rows) {
    const row = (Array.isArray(rawRow) ? rawRow : [rawRow]).flat(2);
    const buttons = [];
    for (const raw of row) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
      if (typeof raw.text !== 'string' || !raw.text.trim()) continue;
      const btn = { text: raw.text };
      const actions = ACTION_FIELDS.filter((f) => raw[f] !== undefined && raw[f] !== null);
      for (const field of (actions.length ? [actions[0]] : [])) btn[field] = raw[field];
      // Bot API 10.3: a custom emoji can be the button's icon — it rides alongside the action
      if (raw.icon_custom_emoji_id) btn.icon_custom_emoji_id = String(raw.icon_custom_emoji_id);
      if (raw.style && ['danger', 'success', 'primary'].includes(raw.style)) btn.style = raw.style;
      if (!actions.length && !btn.callback_data) btn.callback_data = 'noop';
      buttons.push(btn);
    }
    if (buttons.length) clean.push(buttons);
  }
  const out = { inline_keyboard: clean };
  try {
    const before = JSON.stringify(rows);
    if (JSON.stringify(out.inline_keyboard) !== before) {
      const bad = rows.findIndex((r, i) => JSON.stringify(out.inline_keyboard[i]) !== JSON.stringify(Array.isArray(r) ? r.flat(2) : r));
      console.error(`keyboard repaired before send: row ${bad < 0 ? '?' : bad} — ${JSON.stringify(rows[bad]).slice(0, 240)}`);
    }
  } catch { /* ignore */ }
  return out;
}

export function createTelegram(env, config = cfg(env)) {
  const token = config.token || env.BOT_TOKEN;
  const doCall = async (method, payload = {}) => {
    if (!token) throw new TelegramError(method, 'BOT_TOKEN is not configured on the Worker.', 503);
    if (payload.reply_markup) payload = { ...payload, reply_markup: normalizeMarkup(payload.reply_markup) };
    if (payload.chat_id !== undefined) {
      const id = payload.chat_id;
      if (!(typeof id === 'number' || /^@[A-Za-z0-9_]{3,}$/.test(id) || /^-?\d+$/.test(String(id)))) {
        console.error(`suspicious chat_id in ${method}: ${JSON.stringify(id).slice(0, 60)}`);
      }
    }
    const res = await fetch(`${API}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    let body;
    try { body = await res.json(); } catch { throw new TelegramError(method, `HTTP ${res.status}`, res.status); }
    if (!body.ok) {
      const code = body.error_code || res.status;
      const wait = /FLOOD_WAIT_(\d+)/.exec(body.description || '');
      if (wait) await new Promise(r => setTimeout(r, Math.min(Number(wait[1]), 5) * 1000));
      rememberFailure(env, method, body.description, code);
      throw new TelegramError(method, body.description, code);
    }
    return body.result;
  };

  const call = doCall;

  return {
    call,
    getMe: () => call('getMe'),
    getChat: (chat_id) => call('getChat', { chat_id }),
    getChatMember: (chat_id, user_id) => call('getChatMember', { chat_id, user_id }),
    getWebhookInfo: () => call('getWebhookInfo'),
    setWebhook: (url, secret_token, allowed_updates) =>
      call('setWebhook', { url, secret_token, allowed_updates, drop_pending_updates: false }),
    deleteWebhook: () => call('deleteWebhook', { drop_pending_updates: false }),
    setMyCommands: (commands) => call('setMyCommands', {
      commands,
      scope: { type: 'all_private_chats' }
    }),
    setMyDescription: (description) => call('setMyDescription', { description }),
    sendChatAction: (chat_id, action = 'typing') => call('sendChatAction', { chat_id, action }).catch(() => null),
    answerCallback: (id, text, alert = false) =>
      call('answerCallbackQuery', { callback_query_id: id, text: text || undefined, show_alert: alert }).catch(() => null),
    deleteMessage: (chat_id, message_id) => call('deleteMessage', { chat_id, message_id }),
    copyMessage: (payload) => call('copyMessage', payload),
    getFile: (file_id) => call('getFile', { file_id }),

    sendMessage: (chat_id, text, extra = {}) =>
      call('sendMessage', { chat_id, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...extra }),

    editMessageText: (chat_id, message_id, text, extra = {}) =>
      call('editMessageText', { chat_id, message_id, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...extra }),

    /** Rich message: the whole point of this bot. `rich` = {html|markdown|blocks, media?, is_rtl?, skip_entity_detection?} */
    sendRich: (chat_id, rich, extra = {}) =>
      call('sendRichMessage', { chat_id, rich_message: rich, ...extra }),

    /** Streaming/partial rich message (private chats only, ephemeral ~30s preview). */
    sendDraft: (chat_id, draft_id, rich, extra = {}) =>
      call('sendRichMessageDraft', { chat_id, draft_id, rich_message: rich, ...extra }),

    /** Edit an existing message into a rich message (Bot API 10.2+). */
    editRich: (chat_id, message_id, rich, extra = {}) =>
      call('editMessageText', { chat_id, message_id, rich_message: rich, ...extra }),

    /** Ephemeral rich message — groups only, visible to one user and it fades away. */
    sendEphemeralRich: (chat_id, rich, receiver_user_id, extra = {}) =>
      call('sendRichMessage', {
        chat_id,
        rich_message: rich,
        ephemeral_message_parameters: typeof receiver_user_id === 'object' ? receiver_user_id : { receiver_user_id },
        ...extra
      })
  };
}

export const tgHint = (error) => (error?.hint ? `\n\n💡 ${error.hint}` : '');
