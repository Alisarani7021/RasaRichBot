# 🍉 Premium Emoji Engine

## Packs (25)

- twilightvibe2_by_TgEmojiBot (62)
- llort_by_TgEmojiBot (90)
- fatiimaa07_by_TgEmodziBot (61)
- MeowieeeQ (95)
- etc. — total 733 custom emojis

## Map Example

```json
{
  "🎨": "4981190958369474742",
  "✍️": "5307891786088227313",
  "🌟": "5339209399120465044",
  "💡": "5422439311196834318"
}
```

## Why DM→Copy?

Bot API 9.4: Custom emoji allowed only in private/group/supergroup if owner has Premium. Channels require copy.

```
User DM (5982315292) ← sendRichMessage with <tg-emoji>
Channel @gjjgjjkmnmk ← copyMessage from DM (preserves custom emoji)
```

## Button Icons

All inline keyboards now use `icon_custom_emoji_id` for premium look, not just text emoji.
