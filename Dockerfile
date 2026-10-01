# برای اجرای تست‌ها و بررسی سینتکس در محیط یکسان.
# نکته: خودِ ربات روی Cloudflare Workers اجرا می‌شود و برای انتشار نیازی به
# این ایمیج ندارد — این فایل فقط ابزار توسعه است.
FROM node:22-alpine

WORKDIR /app

# فقط چیزهایی که برای تست لازم است
COPY package.json ./
COPY worker/ ./worker/
COPY tests/ ./tests/
COPY miniapp/ ./miniapp/

RUN node --check worker/index.js

# پیش‌فرض: اجرای کل تست‌ها
CMD ["npm", "test"]
