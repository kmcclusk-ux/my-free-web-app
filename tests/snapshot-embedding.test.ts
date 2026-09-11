import { describe, expect, it } from 'vitest';
import { embeddingParentOrigin, trustedEmbeddingMessage } from '../snapshot-calculator/src/embedding';

describe('snapshot embedding boundary', () => {
  it('uses only the embedding origin, not credentials, path or query', () => {
    expect(embeddingParentOrigin('https://user:pass@chat.example/conversation?token=secret')).toBe('https://chat.example');
  });

  it.each(['', 'not-a-url', 'file:///tmp/embed.html', 'data:text/html,hello'])('disables messaging without a safe referrer: %s', referrer => {
    expect(embeddingParentOrigin(referrer)).toBeNull();
  });

  it('requires both the embedding window and its known origin', () => {
    const parent = {} as Window;
    expect(trustedEmbeddingMessage({ source: parent, origin: 'https://chat.example' }, parent, 'https://chat.example')).toBe(true);
    expect(trustedEmbeddingMessage({ source: parent, origin: 'https://evil.example' }, parent, 'https://chat.example')).toBe(false);
    expect(trustedEmbeddingMessage({ source: {} as Window, origin: 'https://chat.example' }, parent, 'https://chat.example')).toBe(false);
    expect(trustedEmbeddingMessage({ source: parent, origin: 'null' }, parent, null)).toBe(false);
  });
});
