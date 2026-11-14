if (typeof Phaser === 'undefined') {
  window.showGameError();
} else {
  const counter = document.getElementById('counter');
  let clicks = 0;

  class DemoScene extends Phaser.Scene {
    constructor() { super('DemoScene'); }

    create() {
      const colors = [0xf17d72, 0xf1c75b, 0x70bca4, 0x829fe8];
      colors.forEach((color, index) => {
        const circle = this.add.circle(190 + index * 140, 200, 48, color)
          .setInteractive({ useHandCursor: true });
        circle.on('pointerdown', () => {
          clicks += 1;
          counter.textContent = `Нажатий: ${clicks}`;
          this.tweens.killTweensOf(circle);
          circle.setScale(1);
          this.tweens.add({ targets: circle, scale: 1.2, duration: 140, yoyo: true });
        });
      });
    }
  }

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: 800,
    height: 400,
    backgroundColor: '#f1f5fa',
    loader: { imageLoadType: 'HTMLImageElement' },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: DemoScene
  });

  document.getElementById('reset').addEventListener('click', () => {
    clicks = 0;
    counter.textContent = 'Нажатий: 0';
    game.scene.getScene('DemoScene').scene.restart();
  });
}
