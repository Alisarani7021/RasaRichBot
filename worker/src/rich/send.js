// Sending rich messages safely: premium emoji are never allowed to break a message.
import { plain } from './kit.js';

/** Remove <tg-emoji> wrappers but keep the visible emoji. */
export const stripPremium = (html) => String(html || '')
  .replace(/<tg-emoji emoji-id="[^"]*">([\s\S]*?)<\/tg-emoji>/g, '$1')
  .replace(/<tg-emoji emoji-id='[^']*'>([\s\S]*?)<\/tg-emoji>/g, '$1');

const looksLikePremiumError = (error) => /emoji/i.test(error?.message || '');

/** sendRichMessage with an automatic plain-text retry when Telegram rejects premium emoji. */
export async function sendRichSafe(ctx, chatId, rich, extra = {}) {
  try {
    return await ctx.tg.sendRich(chatId, rich, extra);
  } catch (error) {
    if (rich?.html?.includes('<tg-emoji') && looksLikePremiumError(error)) {
      console.warn('premium emoji rejected, retrying plain');
      return ctx.tg.sendRich(chatId, { ...rich, html: stripPremium(rich.html) }, extra);
    }
    throw error;
  }
}

/** editMessageText → rich, with the same fallback. */
export async function editRichSafe(ctx, chatId, messageId, rich, extra = {}) {
  try {
    return await ctx.tg.editRich(chatId, messageId, rich, extra);
  } catch (error) {
    if (rich?.html?.includes('<tg-emoji') && looksLikePremiumError(error)) {
      return ctx.tg.editRich(chatId, messageId, { ...rich, html: stripPremium(rich.html) }, extra);
    }
    throw error;
  }
}

/** Draft streaming (partial messages) — failures are harmless, so they are swallowed. */
export async function sendDraftSafe(ctx, chatId, draftId, rich, extra = {}) {
  try { return await ctx.tg.sendDraft(chatId, draftId, rich, extra); }
  catch { return null; }
}

export const richLength = (rich) => plain(rich?.html || rich?.markdown || '').length;
