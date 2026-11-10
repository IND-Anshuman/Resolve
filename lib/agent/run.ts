// The agent loop: the model calls read-only tools until it either asks the buyer a question
// (plain text) or submits a structured assessment. Whatever it returns is validated with Zod
// before any code acts on it; invalid output is retried once, then handed to the seller.

import type OpenAI from 'openai';
import { assessmentSchema, type Assessment } from './assessment';
import { SYSTEM_PROMPT } from './prompt';
import { runTool, TOOLS, type AgentContext, type ToolTrace } from './tools';

export const CHAT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';
// Set OPENAI_VISION=false for text-only models. Photos are then described as unviewable
// instead of being sent, so the model cannot pretend to have judged them.
export const VISION = process.env.OPENAI_VISION !== 'false';
const MAX_STEPS = 8;
// Reasoning models spend part of this on hidden reasoning before the visible reply.
const MAX_TOKENS = 4000;

// The slice of the OpenAI-compatible client the loop needs, so tests can supply a fake.
export type AgentClient = {
  chat: {
    completions: {
      create(params: OpenAI.ChatCompletionCreateParamsNonStreaming): Promise<OpenAI.ChatCompletion>;
    };
  };
};

export type TranscriptEntry = { role: 'buyer' | 'agent'; body: string; imageDataUrl?: string | null };

export type AgentResult =
  | { kind: 'reply'; text: string; trace: ToolTrace[] }
  | { kind: 'assessment'; assessment: Assessment; trace: ToolTrace[] }
  | { kind: 'escalate'; reason: string; trace: ToolTrace[] };

function imageBlock(dataUrl: string): OpenAI.ChatCompletionContentPartImage | null {
  if (!/^data:image\/(?:jpeg|png|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) return null;
  return { type: 'image_url', image_url: { url: dataUrl } };
}

// Buyer text is wrapped as data. Angle brackets are escaped so it cannot close the tag early.
const wrapBuyerText = (body: string) =>
  `<buyer_message>${body.replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</buyer_message>`;

const PHOTO_UNSEEN =
  'The buyer attached a photo, but you cannot view photos. Report photo.provided as true and photo.quality as "unclear", and do not describe what it shows.';

export function toMessages(transcript: TranscriptEntry[], vision = VISION): OpenAI.ChatCompletionMessageParam[] {
  return transcript.map((entry): OpenAI.ChatCompletionMessageParam => {
    if (entry.role === 'agent') return { role: 'assistant', content: entry.body };
    const content: OpenAI.ChatCompletionContentPart[] = [{ type: 'text', text: wrapBuyerText(entry.body) }];
    const image = entry.imageDataUrl ? imageBlock(entry.imageDataUrl) : null;
    if (image && vision) content.push(image);
    else if (image) content.push({ type: 'text', text: PHOTO_UNSEEN });
    return { role: 'user', content };
  });
}

export async function runAgent(args: {
  client: AgentClient;
  transcript: TranscriptEntry[];
  ctx: AgentContext;
  model?: string;
}): Promise<AgentResult> {
  const { client, ctx, model = CHAT_MODEL } = args;
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...toMessages(args.transcript),
  ];
  const trace: ToolTrace[] = [];
  const tools = ctx.findSimilarCases
    ? TOOLS
    : TOOLS.filter((entry) => entry.type !== 'function' || entry.function.name !== 'find_similar_cases');
  let invalidSubmissions = 0;

  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await client.chat.completions.create({
      model,
      max_completion_tokens: MAX_TOKENS,
      tools,
      messages,
    });

    const message = res.choices[0]?.message;
    const calls = (message?.tool_calls ?? []).filter(
      (c): c is OpenAI.ChatCompletionMessageFunctionToolCall => c.type === 'function',
    );
    if (!message || calls.length === 0) {
      const text = message?.content?.trim() ?? '';
      return text ? { kind: 'reply', text, trace } : { kind: 'escalate', reason: 'Empty reply from the model', trace };
    }

    const results: OpenAI.ChatCompletionToolMessageParam[] = [];
    for (const call of calls) {
      const name = call.function.name;
      let input: unknown;
      try {
        input = call.function.arguments ? JSON.parse(call.function.arguments) : {};
      } catch {
        results.push({ role: 'tool', tool_call_id: call.id, content: 'Error: arguments were not valid JSON' });
        continue;
      }
      if (name === 'submit_assessment' && calls.length > 1) {
        results.push({ role: 'tool', tool_call_id: call.id, content: 'Error: submit_assessment must be the only tool call in a turn.' });
        continue;
      }
      if (name === 'submit_assessment') {
        const parsed = assessmentSchema.safeParse(input);
        if (parsed.success) return { kind: 'assessment', assessment: parsed.data, trace };
        if (++invalidSubmissions > 1) {
          return { kind: 'escalate', reason: 'The assessment failed validation twice', trace };
        }
        results.push({
          role: 'tool',
          tool_call_id: call.id,
          content: `Error: Invalid assessment, fix and resubmit: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
        });
        continue;
      }
      try {
        const out = await runTool(name, input, ctx);
        trace.push({ tool: name, summary: out.summary });
        results.push({ role: 'tool', tool_call_id: call.id, content: out.content });
      } catch (err) {
        results.push({
          role: 'tool',
          tool_call_id: call.id,
          content: `Error: ${err instanceof Error ? err.message : 'Tool failed'}`,
        });
      }
    }
    messages.push({ role: 'assistant', content: message.content, tool_calls: calls }, ...results);
  }
  return { kind: 'escalate', reason: 'The agent used too many steps', trace };
}
