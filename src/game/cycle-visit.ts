import type { App, Line } from './app.ts';
import { chooseReturn, cycleOf, LAST_RETURN } from '../core/cycle.ts';
import { createState } from '../core/state.ts';
import data from '../content/text/cycle.json';
import ui from '../content/text/ui.json' with { type: 'json' };

const thoughts = (items: string[]): Line[] => items.map(text => ({ speaker: 'pruto', text }));
const lines = (items: string[][]): Line[] => items.map(([speaker, text]) => ({ speaker: speaker as Line['speaker'], text }));

/** 从显式玩家动作进入折返；恢复已有演出走resume，绝不复用加次数的路径。 */
export class CycleVisit {
  constructor(private app: App) {}
  title(): void {
    const a = this.app;
    if (a.state.phase !== 'entrance' || a.session.blocked) return;
    const c = cycleOf(a.state);
    if (c.beat === 'open' && !c.sawTitle) {
      a.titleDialogue(thoughts(data.titleMind), () => {
        c.sawTitle = true; a.session.save(); a.showTitle();
      });
    }
  }
  enterFromTitle(): boolean {
    const a = this.app;
    if (a.state.phase !== 'entrance' && a.state.phase !== 'cycle') return false;
    if (chooseReturn(a.state)) a.session.save();
    this.resume();
    return true;
  }
  private resume(): void {
    const a = this.app, c = cycleOf(a.state);
    switch (c.beat) {
      case 'return': {
        a.diamondSwap(() => {
          a.scene.drawWorld(false);
          const episode = data.returns[c.count - 1].map((text, index): Line => ({
            speaker: index % 2 === 0 ? 'karo' : 'pruto', text,
          }));
          a.dialogue(episode, () => {
            c.beat = 'open'; a.session.save(); a.diamondSwap(() => a.showTitle());
          }, true);
        }); break;
      }
      case 'closed':
        // 先在原启动界面撤下按钮，人物看见后才回站。
        a.showTitle();
        a.titleDialogue(thoughts(data.closed), () => {
          c.beat = 'apology'; a.session.save(); this.resume();
        }); break;
      case 'apology':
        a.diamondSwap(() => {
          a.scene.drawWorld(false);
          a.dialogue(lines(data.apology), () => a.transition(() => {
            a.session.state = { ...createState(), phase: 'cycle', cycle: {
              count: LAST_RETURN, beat: 'visit', sawTitle: true, p01: false, merin: false,
            } };
            a.session.save(); this.resume();
          }), true);
        }); break;
      case 'visit': a.scene.drawWorld(false); a.world(); break;
      case 'p01': case 'merin': a.scene.drawWorld(false); this.interact(c.beat); break;
      case 'drawing': a.scene.drawWorld(false); this.draw(); break;
      case 'end': a.endCard(data.end, ui.app.back); break;
    }
  }
  interact(id: string): boolean {
    const a = this.app;
    if (a.state.phase !== 'cycle') return false;
    const c = cycleOf(a.state);
    if (id === 'old-note') { a.dialogue(thoughts([data.note])); return true; }
    if (id !== 'p01' && id !== 'merin') return false;
    c.beat = id; a.session.save();
    a.dialogue(id === 'p01' ? thoughts(data.p01) : lines(data.merin), completed => {
      if (completed) c[id] = true;
      c.beat = 'visit'; a.session.save();
      a.world();
    }, true);
    return true;
  }
  exitPublic(): boolean {
    const a = this.app;
    if (a.state.phase !== 'cycle') return false;
    const c = cycleOf(a.state);
    if (!c.p01 || !c.merin) {
      a.dialogue(thoughts([!c.p01 ? data.needProjector : data.needMerin]));
    } else {
      c.beat = 'drawing'; a.session.save(); this.draw();
    }
    return true;
  }
  private draw(): void {
    const a = this.app;
    a.dialogue(lines(data.painting), () => a.transition(() => {
      cycleOf(a.state).beat = 'end'; a.session.save(); this.resume();
    }), true);
  }
}
