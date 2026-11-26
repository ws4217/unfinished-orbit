import pkg from '../../package.json' with { type: 'json' };
import ui from '../content/text/ui.json' with { type: 'json' };
import { formatText } from './line.ts';

export function titleStage(reunion: boolean): string {
  const { version } = pkg;
  const display = reunion ? formatText(ui.app.reunionVersion, { series: version.split('.').slice(0, 2).join('.') }) : version;
  return formatText(ui.app.stage, { version: display });
}
