import { config } from '../../config';

/** Provider-neutral conversation format (structurally identical to Anthropic Messages content blocks). */
export type Block =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };
export interface Msg {
  role: 'user' | 'assistant';
  content: Block[];
}
export interface ToolSpec {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}
export interface ModelResponse {
  content: Block[];
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'other';
  inputTokens: number;
  outputTokens: number;
}
export interface ModelProvider {
  name: string;
  model: string;
  call(args: { system: string; messages: Msg[]; tools: ToolSpec[]; signal: AbortSignal; maxTokens?: number }): Promise<ModelResponse>;
  /** USD per million tokens — used for budget enforcement (estimates; adjust via env for your contract). */
  price: { input: number; output: number };
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
  }
}

const PRICES: Array<[RegExp, { input: number; output: number }]> = [
  [/opus/i, { input: 15, output: 75 }],
  [/sonnet/i, { input: 3, output: 15 }],
  [/haiku/i, { input: 1, output: 5 }],
  [/gpt-4o-mini/i, { input: 0.15, output: 0.6 }],
  [/gpt-4o/i, { input: 2.5, output: 10 }],
];
function priceFor(model: string) {
  const inOverride = Number(process.env.AI_PRICE_INPUT_PER_MTOK);
  const outOverride = Number(process.env.AI_PRICE_OUTPUT_PER_MTOK);
  if (inOverride && outOverride) return { input: inOverride, output: outOverride };
  return PRICES.find(([re]) => re.test(model))?.[1] ?? { input: 5, output: 20 };
}

class AnthropicProvider implements ModelProvider {
  name = 'anthropic';
  price;
  constructor(
    private readonly key: string,
    public readonly model: string,
  ) {
    this.price = priceFor(model);
  }
  async call({ system, messages, tools, signal, maxTokens = 2048 }: Parameters<ModelProvider['call']>[0]): Promise<ModelResponse> {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': this.key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: this.model, system, messages, tools, max_tokens: maxTokens }),
      signal,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new ProviderError(`Anthropic API ${res.status}: ${text.slice(0, 300)}`, res.status === 429 || res.status >= 500);
    }
    const j: any = await res.json();
    return {
      content: j.content.filter((b: any) => b.type === 'text' || b.type === 'tool_use'),
      stopReason: j.stop_reason === 'tool_use' ? 'tool_use' : j.stop_reason === 'end_turn' ? 'end_turn' : j.stop_reason === 'max_tokens' ? 'max_tokens' : 'other',
      inputTokens: j.usage?.input_tokens ?? 0,
      outputTokens: j.usage?.output_tokens ?? 0,
    };
  }
}

/** OpenAI-compatible chat completions adapter (works with OpenAI and compatible gateways). */
class OpenAIProvider implements ModelProvider {
  name = 'openai';
  price;
  constructor(
    private readonly key: string,
    private readonly baseUrl: string,
    public readonly model: string,
  ) {
    this.price = priceFor(model);
  }
  async call({ system, messages, tools, signal, maxTokens = 2048 }: Parameters<ModelProvider['call']>[0]): Promise<ModelResponse> {
    const oaMessages: any[] = [{ role: 'system', content: system }];
    for (const m of messages) {
      if (m.role === 'assistant') {
        const text = m.content.filter((b) => b.type === 'text').map((b: any) => b.text).join('\n');
        const calls = m.content.filter((b) => b.type === 'tool_use') as Extract<Block, { type: 'tool_use' }>[];
        oaMessages.push({ role: 'assistant', content: text || null, ...(calls.length && { tool_calls: calls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.input) } })) }) });
      } else {
        for (const b of m.content) {
          if (b.type === 'tool_result') oaMessages.push({ role: 'tool', tool_call_id: b.tool_use_id, content: b.content });
          else if (b.type === 'text') oaMessages.push({ role: 'user', content: b.text });
        }
      }
    }
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        max_tokens: maxTokens,
        messages: oaMessages,
        tools: tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } })),
      }),
      signal,
    });
    if (!res.ok) throw new ProviderError(`OpenAI API ${res.status}: ${(await res.text()).slice(0, 300)}`, res.status === 429 || res.status >= 500);
    const j: any = await res.json();
    const msg = j.choices[0].message;
    const content: Block[] = [];
    if (msg.content) content.push({ type: 'text', text: msg.content });
    for (const c of msg.tool_calls ?? []) {
      let input: unknown = {};
      try {
        input = JSON.parse(c.function.arguments || '{}');
      } catch {
        input = {};
      }
      content.push({ type: 'tool_use', id: c.id, name: c.function.name, input });
    }
    return {
      content,
      stopReason: msg.tool_calls?.length ? 'tool_use' : j.choices[0].finish_reason === 'length' ? 'max_tokens' : 'end_turn',
      inputTokens: j.usage?.prompt_tokens ?? 0,
      outputTokens: j.usage?.completion_tokens ?? 0,
    };
  }
}

/** Scripted provider for automated tests ONLY. Refuses to load outside NODE_ENV=test. */
export class ScriptedTestProvider implements ModelProvider {
  name = 'scripted-test';
  model = 'scripted';
  price = { input: 1, output: 1 };
  constructor(private readonly script: (messages: Msg[]) => ModelResponse) {
    if (config().NODE_ENV !== 'test') throw new Error('ScriptedTestProvider is test-only');
  }
  async call({ messages }: Parameters<ModelProvider['call']>[0]) {
    return this.script(messages);
  }
}

let testOverride: ModelProvider | null = null;
export function setTestProvider(p: ModelProvider | null) {
  if (config().NODE_ENV !== 'test') throw new Error('test only');
  testOverride = p;
}

/** Returns the configured provider, or null when AI is not configured (runs then fail clearly). */
export function getProvider(modelOverride?: string | null): ModelProvider | null {
  if (testOverride) return testOverride;
  const c = config();
  if (c.AI_PROVIDER === 'anthropic' && c.ANTHROPIC_API_KEY) return new AnthropicProvider(c.ANTHROPIC_API_KEY, modelOverride || c.ANTHROPIC_MODEL);
  if (c.AI_PROVIDER === 'openai' && c.OPENAI_API_KEY) return new OpenAIProvider(c.OPENAI_API_KEY, c.OPENAI_BASE_URL, modelOverride || c.OPENAI_MODEL);
  return null;
}
