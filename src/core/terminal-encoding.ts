const utf8 = new TextEncoder();
const gbk = new TextDecoder('gbk');

export function terminalRules(lines: readonly string[], elements: ReadonlyMap<string, string>) {
  const names = [...elements.keys()].filter(Boolean).sort((a, b) => b.length - a.length);
  const pattern = new RegExp(names.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gu');
  const plain = lines.join('\n');
  const encode = (span: string) => span.split('\n').map(line => gbk.decode(utf8.encode(line))).join('\n');
  let raw = '', damaged = '', last = 0;
  for (const match of names.length ? plain.matchAll(pattern) : []) {
    const span = plain.slice(last, match.index);
    raw += span + '____';
    damaged += encode(span) + elements.get(match[0]);
    last = match.index + match[0].length;
  }
  return { raw: raw + plain.slice(last), damaged: damaged + encode(plain.slice(last)) };
}
