import { describe, expect, it } from 'vitest';
import { buildUserMessage, explainMove, type MoveFacts } from '../../src/llm/claude';

const facts: MoveFacts = {
  fenBefore: 'r1bqkbnr/pppp1ppp/2n5/4p2Q/4P3/8/PPPP1PPP/RNB1KBNR w KQkq - 2 3',
  playedSan: 'Qxe5+',
  bestSan: 'Bc4',
  bestLineSan: ['Bc4', 'g6', 'Qf3'],
  evalBefore: '−0.38',
  evalAfter: '−8.25',
  category: 'blunder',
  side: 'white',
  language: 'ru',
};

describe('Claude explanation request', () => {
  it('sends only engine facts with the browser headers', async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const f = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return new Response(JSON.stringify({ content: [{ type: 'text', text: 'Ферзь зевнут.' }], stop_reason: 'end_turn' }));
    }) as unknown as typeof fetch;
    const text = await explainMove(facts, 'sk-test', 'claude-sonnet-5-5', undefined, f);
    expect(text).toBe('Ферзь зевнут.');
    const h = seen!.init.headers as Record<string, string>;
    expect(seen!.url).toBe('https://api.anthropic.com/v1/messages');
    expect(h['x-api-key']).toBe('sk-test');
    expect(h['anthropic-version']).toBe('2023-06-01');
    expect(h['anthropic-dangerous-direct-browser-access']).toBe('true');
    const body = JSON.parse(String(seen!.init.body));
    expect(body.model).toBe('claude-sonnet-5-5');
    expect(body.system).toMatch(/2–4/);
    expect(body.messages[0].content).toContain('Qxe5+');
    expect(body.messages[0].content).toContain(facts.fenBefore);
  });

  it('surfaces API errors and refusals', async () => {
    const bad = (async () =>
      new Response(JSON.stringify({ error: { type: 'authentication_error', message: 'bad key' } }), { status: 401 })) as unknown as typeof fetch;
    await expect(explainMove(facts, 'x', 'claude-sonnet-5-5', undefined, bad)).rejects.toThrow(/invalid API key/);
    const refused = (async () => new Response(JSON.stringify({ content: [], stop_reason: 'refusal' }))) as unknown as typeof fetch;
    await expect(explainMove(facts, 'x', 'claude-haiku-5-5', undefined, refused)).rejects.toThrow(/declined/);
  });

  it('builds a compact fact sheet', () => {
    const msg = buildUserMessage(facts);
    expect(msg).toContain('Engine best line: Bc4 g6 Qf3');
    expect(msg).toContain('Answer language: Russian');
  });
});
