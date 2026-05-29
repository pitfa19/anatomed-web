// Typed errors the AI client surfaces from the server proxy, shared by the
// chat agent (`agent.ts`) and the deck generator (`aiGenerate.ts`).

export class MissingApiKeyError extends Error {
  constructor() {
    super('ANTHROPIC_API_KEY is not set on the server.');
    this.name = 'MissingApiKeyError';
  }
}

/** Server usage gate: the signed-in user has spent today's AI token budget. */
export class DailyLimitError extends Error {
  constructor() {
    super("You've reached today's AI limit.");
    this.name = 'DailyLimitError';
  }
}

/** Server usage gate: no valid signed-in user (anonymous request rejected). */
export class AuthRequiredError extends Error {
  constructor() {
    super('Sign in to use the assistant.');
    this.name = 'AuthRequiredError';
  }
}

/** Map a non-OK proxy response to a typed error the UI can react to. */
export function proxyError(status: number, body: { error?: string; code?: string }): Error {
  if (body.code === 'missing_key') return new MissingApiKeyError();
  // `no_tokens` kept for resilience across deploys; the gate now emits
  // `daily_limit`.
  if (body.code === 'daily_limit' || body.code === 'no_tokens') return new DailyLimitError();
  if (body.code === 'auth_required') return new AuthRequiredError();
  return new Error(`AI proxy ${status}: ${body.error ?? 'request failed'}`);
}
