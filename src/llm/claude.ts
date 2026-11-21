import type { MoveReview } from '../analysis/classify';
import { formatEval } from '../analysis/evalMath';
import { playLine } from '../analysis/material';
import type { Lang } from '../i18n/i18n';

/** Models offered in Settings (free text is allowed too). */
export const MODEL_CHOICES = ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5', 'claude-fable-5-2'];

/** Models that accept the server-side refusal fallback (`fallbacks: "default"`). */
const FALLBACK_MODELS = new Set(['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-2', 'claude-fable-5-1']);

export const SYSTEM_PROMPT = {
  ru: 'Ты шахматный тренер. Объясняй как тренер ученику, коротко: 2–4 предложения. Опирайся только на переданные данные движка (позиция, ходы, оценки, линия) и ничего не выдумывай: не придумывай угроз, планов или вариантов, которых нет в данных. Отвечай на русском, без markdown.',
  en: 'You are a chess coach. Explain like a coach to a student, briefly: 2–4 sentences. Rely only on the engine data provided (position, moves, evaluations, line) and invent nothing: no threats, plans or variations that are not in the data. Answer in English, no markdown.',
} as const;

/** The only facts sent to the model: engine output for one move. */
export interface MoveFacts {
  fenBefore: string;
  playedSan: string;
  bestSan: string | null;
  bestLineSan: string[];
  evalBefore: string;
  evalAfter: string;
  category: string;
  side: 'white' | 'black';
  language: Lang;
}

export function buildFacts(m: MoveReview, lang: Lang): MoveFacts {
  return {
    fenBefore: m.fenBefore,
    playedSan: m.san,
    bestSan: m.bestSan,
    bestLineSan: playLine(m.fenBefore, m.bestLine, 8).san,
    evalBefore: formatEval(m.evalBefore),
    evalAfter: formatEval(m.evalAfter),
    category: m.category,
    side: m.color === 'w' ? 'white' : 'black',
    language: lang,
  };
}

export function buildUserMessage(f: MoveFacts): string {
  return [
    'Engine facts (evaluations from White’s point of view, # = forced mate):',
    `FEN before the move: ${f.fenBefore}`,
    `Side to move: ${f.side}`,
    `Played: ${f.playedSan}`,
    `Engine best move: ${f.bestSan ?? '—'}`,
    `Engine best line: ${f.bestLineSan.join(' ') || '—'}`,
    `Evaluation before: ${f.evalBefore}`,
    `Evaluation after the played move: ${f.evalAfter}`,
    `Category: ${f.category}`,
    `Answer language: ${f.language === 'ru' ? 'Russian' : 'English'}`,
    '',
    'Explain why the played move earned this category and what the best move achieves.',
  ].join('\n');
}

export class LlmError extends Error {}

interface ApiResponse {
  content?: Array<{ type: string; text?: string }>;
  stop_reason?: string;
  error?: { type: string; message: string };
}

/**
 * Call the Claude Messages API directly from the browser.
 * The key comes from localStorage and is sent only in this request's x-api-key header.
 */
export async function explainMove(
  facts: MoveFacts,
  apiKey: string,
  model: string,
  signal?: AbortSignal,
  f: typeof fetch = fetch,
): Promise<string> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  };
  const body: Record<string, unknown> = {
    model,
    max_tokens: 4000,
    system: SYSTEM_PROMPT[facts.language],
    messages: [{ role: 'user', content: buildUserMessage(facts) }],
  };
  if (FALLBACK_MODELS.has(model)) {
    // Short coaching text: low effort is enough. On a policy decline the API retries on a fallback model.
    body.output_config = { effort: 'low' };
    headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
    body.fallbacks = 'default';
  }
  let res: Response;
  try {
    res = await f('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    throw new LlmError((e as Error).message);
  }
  const data = (await res.json().catch(() => ({}))) as ApiResponse;
  if (!res.ok) {
    const msg = data.error?.message ?? `HTTP ${res.status}`;
    if (res.status === 401) throw new LlmError(`invalid API key (${msg})`);
    if (res.status === 429) throw new LlmError(`rate limited (${msg})`);
    throw new LlmError(msg);
  }
  if (data.stop_reason === 'refusal') throw new LlmError('the model declined to answer');
  const text = (data.content ?? [])
    .filter((b) => b.type === 'text' && b.text)
    .map((b) => b.text)
    .join('\n')
    .trim();
  if (!text) throw new LlmError('empty response');
  return text;
}
