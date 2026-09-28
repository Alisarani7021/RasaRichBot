// env → typed config. Everything here is optional except BOT_TOKEN / WEBHOOK_SECRET.

const list = (value) => String(value || '').split(/[\s,]+/).map(s => s.trim()).filter(Boolean);

/** Providers that ship a sensible default model list. "custom" = any OpenAI-compatible endpoint. */
export const PROVIDER_INFO = {
  workersai: {
    label: 'Cloudflare Workers AI (رایگان، بدون کلید)',
    keyEnv: null,
    streaming: true,
    models: [
      '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      '@cf/meta/llama-3.1-8b-instruct-fast',
      '@cf/qwen/qwen3-30b-a3b-fp8',
      '@cf/openai/gpt-oss-120b',
      '@cf/mistralai/mistral-small-3.1-24b-instruct'
    ]
  },
  gemini: {
    label: 'Google Gemini (کلید رایگان از AI Studio)',
    keyEnv: 'GEMINI_API_KEY',
    streaming: true,
    models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-2.5-pro']
  },
  groq: {
    label: 'Groq (کلید رایگان، بسیار سریع)',
    keyEnv: 'GROQ_API_KEY',
    streaming: true,
    models: ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3-32b']
  },
  openrouter: {
    label: 'OpenRouter (مدل‌های :free هم دارد)',
    keyEnv: 'OPENROUTER_API_KEY',
    streaming: true,
    models: [
      'deepseek/deepseek-chat-v3.1:free',
      'meta-llama/llama-3.3-70b-instruct:free',
      'qwen/qwen3-235b-a22b:free',
      'google/gemini-2.0-flash-exp:free',
      'z-ai/glm-4.5-air:free'
    ]
  },
  cerebras: {
    label: 'Cerebras (کلید رایگان)',
    keyEnv: 'CEREBRAS_API_KEY',
    streaming: true,
    models: ['llama-3.3-70b', 'qwen-3-235b-a22b-instruct-2507', 'gpt-oss-120b']
  },
  mistral: {
    label: 'Mistral (کلید رایگان)',
    keyEnv: 'MISTRAL_API_KEY',
    streaming: true,
    models: ['mistral-large-latest', 'mistral-small-latest', 'open-mistral-nemo']
  },
  github: {
    label: 'GitHub Models (با GITHUB_TOKEN)',
    keyEnv: 'GITHUB_TOKEN',
    streaming: true,
    models: ['openai/gpt-4o-mini', 'openai/gpt-4.1-mini', 'meta/Llama-3.3-70B-Instruct']
  },
  custom: {
    label: 'سرویس سفارشی (OpenAI-compatible)',
    keyEnv: 'AI_API_KEY',
    streaming: true,
    models: [] // resolved at runtime from AI_MODEL / AI_BASE_URL
  }
};

/** Default order: cheapest/free first. First provider that has credentials wins. */
const DEFAULT_ORDER = ['workersai', 'gemini', 'groq', 'openrouter', 'cerebras', 'mistral', 'github', 'custom'];

export function cfg(env = {}) {
  const admins = list(env.ADMINS_ID);
  const order = list(env.AI_PROVIDERS).length ? list(env.AI_PROVIDERS) : DEFAULT_ORDER;

  return {
    token: String(env.BOT_TOKEN || ''),
    secret: String(env.WEBHOOK_SECRET || ''),
    admins,
    restricted: admins.length > 0,
    defaultLang: String(env.DEFAULT_LANG || 'fa').toLowerCase().startsWith('en') ? 'en' : 'fa',
    store: {
      ttl: Number(env.STATE_TTL || 60 * 60 * 24 * 14), // 14 days
      maxDrafts: Number(env.MAX_DRAFTS || 20),
      maxTemplates: Number(env.MAX_TEMPLATES || 30)
    },
    ai: {
      order,
      providers: PROVIDER_INFO,
      workersai: typeof env.AI !== 'undefined' && env.AI !== null,
      keys: {
        gemini: env.GEMINI_API_KEY || env.GOOGLE_API_KEY || '',
        groq: env.GROQ_API_KEY || '',
        openrouter: env.OPENROUTER_API_KEY || '',
        cerebras: env.CEREBRAS_API_KEY || '',
        mistral: env.MISTRAL_API_KEY || '',
        github: env.GITHUB_TOKEN || '',
        custom: env.AI_API_KEY || ''
      },
      baseUrl: String(env.AI_BASE_URL || '').replace(/\/+$/, ''),
      model: String(env.AI_MODEL || ''),
      stream: String(env.AI_STREAM ?? '1') !== '0',
      temperature: Number(env.AI_TEMPERATURE || 0.7),
      maxTokens: Number(env.AI_MAX_TOKENS || 2048),
      timeoutMs: Number(env.AI_TIMEOUT_MS || 60000)
    }
  };
}

/** Is this Telegram user allowed to use the bot? */
export const userAllowed = (c, id) => !c.restricted || c.admins.includes(String(id));

/** Which providers can actually run right now? */
export function availableProviders(c) {
  return c.ai.order.filter((name) => {
    const info = PROVIDER_INFO[name];
    if (!info) return false;
    if (name === 'workersai') return c.ai.workersai;
    if (name === 'custom') return Boolean(c.ai.keys.custom || c.ai.baseUrl);
    return Boolean(c.ai.keys[name]);
  });
}

/** Selectable models for a provider (the custom gateway has no fixed list). */
export const modelsFor = (c, provider) => {
  if (provider !== 'custom') return PROVIDER_INFO[provider]?.models || [];
  return [...new Set([c.ai.model, 'gpt-4o-mini', 'deepseek-chat', 'llama-3.3-70b-versatile'].filter(Boolean))];
};

/** Default model for a provider. */
export const defaultModel = (c, provider) =>
  provider === 'custom' ? (c.ai.model || 'gpt-4o-mini') : (PROVIDER_INFO[provider]?.models[0] || '');
