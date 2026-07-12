import { describe, it, expect } from 'bun:test';
import { formatJson, formatText, formatTable, formatCsv, formatData } from '../lib/formatters';

const rows = [
  { key: 'default.channel', value: '@staqan' },
  { key: 'default.output', value: 'pretty' },
];

describe('formatJson', () => {
  it('pretty-prints with 2-space indent', () => {
    expect(formatJson({ a: 1 })).toBe('{\n  "a": 1\n}');
  });
});

describe('formatText', () => {
  it('tab-joins object values, one row per line', () => {
    expect(formatText(rows)).toBe('default.channel\t@staqan\ndefault.output\tpretty');
  });

  it('JSON-encodes nested values', () => {
    expect(formatText([{ a: [1, 2] }])).toBe('[1,2]');
  });

  it('passes primitives through', () => {
    expect(formatText('hello')).toBe('hello');
  });
});

describe('formatTable', () => {
  it('renders header, separator, and aligned rows', () => {
    const out = formatTable(rows).split('\n');
    expect(out[0]).toMatch(/^key\s+\| value\s*$/);
    expect(out[1]).toMatch(/^-+-\+-+$/);
    expect(out[2]).toContain('@staqan');
    expect(out).toHaveLength(4);
  });

  it('unions keys across heterogeneous rows', () => {
    const out = formatTable([{ a: 1 }, { b: 2 }]);
    expect(out).toContain('a');
    expect(out).toContain('b');
  });
});

describe('formatCsv', () => {
  it('emits RFC 4180 rows', () => {
    expect(formatCsv(rows)).toBe('key,value\ndefault.channel,@staqan\ndefault.output,pretty');
  });

  it('escapes commas and quotes', () => {
    expect(formatCsv([{ v: 'a,b' }])).toBe('v\n"a,b"');
    expect(formatCsv([{ v: 'say "hi"' }])).toBe('v\n"say ""hi"""');
  });

  it('JSON-encodes arrays (tag lists survive round trips)', () => {
    expect(formatCsv([{ tags: ['a', 'b'] }])).toBe('tags\n"[""a"",""b""]"');
  });

  it('renders null/undefined as empty fields', () => {
    expect(formatCsv([{ a: null, b: 1 }])).toBe('a,b\n,1');
  });
});

describe('formatData dispatch', () => {
  it('routes each machine format to its formatter', () => {
    expect(formatData(rows, 'json')).toBe(formatJson(rows));
    expect(formatData(rows, 'text')).toBe(formatText(rows));
    expect(formatData(rows, 'table')).toBe(formatTable(rows));
    expect(formatData(rows, 'csv')).toBe(formatCsv(rows));
  });
});
