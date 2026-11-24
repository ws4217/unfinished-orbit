import ui from './ui.json' with { type: 'json' };

export interface TextLine {
  speaker: string;
  text: string;
}

export interface DialogueLine extends TextLine {
  color?: string;
  spans?: readonly { text: string; color?: string }[];
  paper?: string;
  cue?: string;
}

export interface BootLine extends TextLine {
  id: string;
  warning: boolean;
}

export function dialogueSpeaker({ speaker }: DialogueLine): { name: string; color: string; portrait?: string } {
  if (!Object.hasOwn(ui.speakers, speaker)) throw new Error(`Unknown dialogue speaker: ${speaker}`);
  return ui.speakers[speaker as keyof typeof ui.speakers];
}

export function formatText(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}

export function fillText<T extends TextLine>(line: T, values: Readonly<Record<string, string>>): T {
  return { ...line, text: formatText(line.text, values) };
}
