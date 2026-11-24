import './ui/styles/base.css';
import './ui/styles/pixel.css';
import './ui/styles/mobile.css';
import { installMobileControls } from './ui/mobile-controls.ts';
import { App } from './game/app.ts';
import { installBranch } from './game/branch.ts';
import { installExperiment } from './game/experiment.ts';
import { installDesktop } from './ui/desktop.ts';
import { installEnding } from './game/ending.ts';
import ui from './content/text/ui.json' with { type: 'json' };
import { formatText } from './content/text/line.ts';

document.title = formatText(ui.app.pageTitle, ui.app);
document.getElementById('app')!.setAttribute('aria-label', ui.app.subtitle);
document.getElementById('entry-target')!.textContent = ui.desktop.marks.diamond;
document.getElementById('status')!.textContent = ui.app.status;
// Canvas labels must be drawn after the local font is available, not rasterized in a fallback face.
void Promise.all([
  document.fonts.load('20px OrbitPixel'),
  document.fonts.load('700 20px OrbitPixel'),
]).catch(error => console.warn('Local font unavailable; using monospace fallback.', error)).then(() => {
  const app = new App();
  installMobileControls(app);
  installBranch(app);
  installExperiment(app);
  installDesktop(app);
  installEnding(app);
});
