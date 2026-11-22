import Phaser from 'phaser';
import config from '../content/assets/prototype-characters.json';
import type { Facing } from '../core/world-geometry.ts';

export type CharacterId = keyof typeof config.characters;
export function loadCharacters(scene: Phaser.Scene): void {
  const frame = { frameWidth: config.frame.width, frameHeight: config.frame.height };
  for (const [id, character] of Object.entries(config.characters)) {
    scene.load.spritesheet(`prototype-${id}-idle`, character.idle, frame);
    if ('walk' in character) scene.load.spritesheet(`prototype-${id}-walk`, character.walk, frame);
  }
}
export function registerCharacters(scene: Phaser.Scene): void {
  for (const [id, character] of Object.entries(config.characters)) {
    for (const [kind, animation] of Object.entries(config.animations)) {
      if (kind === 'walk' && !('walk' in character)) continue;
      for (const [direction, layout] of Object.entries(config.directions)) {
        scene.anims.create({
          key: `prototype-${id}-${kind}-${direction}`,
          frames: scene.anims.generateFrameNumbers(`prototype-${id}-${kind}`, {
            start: layout.row * animation.columns, end: (layout.row + 1) * animation.columns - 1,
          }),
          frameRate: animation.frameRate, repeat: -1,
        });
      }
    }
  }
}
export function animateCharacter(sprite: Phaser.GameObjects.Sprite, id: CharacterId, facing: Facing, moving = false): void {
  const kind = moving && 'walk' in config.characters[id] ? 'walk' : 'idle';
  sprite.setFlipX(config.directions[facing].flipX);
  sprite.play(`prototype-${id}-${kind}-${facing}`, true);
}
export function createCharacter(scene: Phaser.Scene, id: CharacterId, x: number, y: number): Phaser.GameObjects.Sprite {
  const sprite = scene.add.sprite(x, y, `prototype-${id}-idle`, 0)
    .setOrigin(config.frame.anchorX / config.frame.width, config.frame.anchorY / config.frame.height)
    .setScale(config.frame.scale).setDepth(y);
  animateCharacter(sprite, id, 'down');
  return sprite;
}
