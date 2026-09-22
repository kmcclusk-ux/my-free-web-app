import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const main = readFileSync(new URL('../snapshot-calculator/src/main.tsx', import.meta.url), 'utf8');

describe('snapshot investment symbol control', () => {
  it('uses one editable asset dropdown instead of separate symbol controls', () => {
    expect(main).toContain('const symbolListId = useId();');
    expect(main).toContain('list={symbolListId}');
    expect(main).toContain('<datalist id={symbolListId}>');
    expect(main).toContain('placeholder="Select or type a symbol"');
    expect(main).not.toContain('<select value={value.symbol}');
  });
});
