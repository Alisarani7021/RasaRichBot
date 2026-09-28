# 🔘 Rich Buttons — Bot API 10.3

## HTML

```html
<tg-button-row>
  <tg-button type="url" style="success" url="https://t.me">ورود</tg-button>
  <tg-button type="callback_data" style="link" data="cb_demo">کال‌بک</tg-button>
  <tg-button type="copy_text" text="RICH10">کپی</tg-button>
</tg-button-row>
```

## Builder States

- `manual_button_new` → type selection
- `manual_btn_type` → style selection
- `manual_btn_style` → label input
- `manual_button_label` → value input
- `manual_button_value` → push to draftRows
- `manual_buttons_done` → append to richHtml

## Fix for Channels

Before: only private chats tried sendRichMessage
After: all chats try sendRichMessage first, then fallback
