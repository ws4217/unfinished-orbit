const utf8 = new TextEncoder();
const gbk = new TextDecoder('gbk');

export function garbledRules(source: string, symbols: readonly string[]): string {
  const encode = (span: string) => span.split('\n').map(line => gbk.decode(utf8.encode(line))).join('\n');
  return source.trimEnd().split('____').map((span, i) =>
    (i === 0 ? '' : symbols[i - 1] ?? '____') + encode(span),
  ).join('');
}
