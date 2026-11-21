import ui from './content/text/ui.json' with { type: 'json' };
import './ui/styles/base.css';
import './ui/styles/pixel.css';
import { validToken } from './core/rules.ts';

if (new URLSearchParams(location.search).has('embedded')) document.body.classList.add('embedded-card');
for (const id of ['title', 'stage', 'status'] as const) {
  document.getElementById(id)!.textContent = ui.tool[id];
}
document.getElementById('token-label')!.textContent = ui.tool.tokenLabel;
document.getElementById('submit')!.textContent = ui.tool.submit;
document.getElementById('letter-title')!.textContent = ui.tool.letterTitle;
document.getElementById('greeting')!.textContent = ui.tool.greeting;
document.getElementById('letter-body')!.textContent = ui.tool.letter;
document.getElementById('signature')!.textContent = ui.tool.signature;
document.getElementById('token-form')!.addEventListener('submit', event => {
  event.preventDefault();
  const value = (document.getElementById('token') as HTMLInputElement).value;
  if (!validToken(value)) {
    document.getElementById('status')!.textContent = ui.tool.wrong;
    return;
  }
  document.getElementById('token-form')!.hidden = true;
  document.getElementById('letter')!.hidden = false;
  document.body.classList.add('gift-open');
  document.title = ui.tool.letterTitle;
  window.scrollTo(0, 0);
});
document.documentElement.dataset.ready = 'true';
