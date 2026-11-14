if (typeof Phaser === 'undefined') {
  window.showGameError();
} else {
  const COLUMNS = 12;
  const ROWS = 9;
  const CELL = 60;
  const COLORS = [0xe86b69, 0xf1b94e, 0x6abb8f, 0x658ddd, 0xab7bd1, 0x52b8c2];
  const scoreLabel = document.getElementById('score');
  let removed = 0;

  class BoardScene extends Phaser.Scene {
    constructor() {
      super('BoardScene');
    }

    preload() {
      this.load.on('loaderror', window.showGameError);
      this.load.image('token', 'assets/token-128.png');
    }

    create() {
      this.isFalling = false;
      this.columns = Array.from({ length: COLUMNS }, () => []);
      for (let column = 0; column < COLUMNS; column += 1) {
        for (let row = 0; row < ROWS; row += 1) {
          const color = Phaser.Utils.Array.GetRandom(COLORS);
          const tile = this.add.image(column * CELL + CELL / 2, row * CELL + CELL / 2, 'token')
            .setDisplaySize(CELL * 0.9, CELL * 0.9)
            .setTint(color);
          tile.setInteractive(new Phaser.Geom.Circle(tile.width / 2, tile.height / 2, tile.width * 0.47), Phaser.Geom.Circle.Contains);
          tile.tileColor = color;
          this.columns[column].push(tile);
          tile.on('pointerdown', () => this.removeGroup(column, tile));
        }
      }
    }

    removeGroup(column, tile) {
      if (this.isFalling) return;
      const row = ROWS - this.columns[column].length + this.columns[column].indexOf(tile);
      const queue = [[column, row]];
      const visited = new Set();
      const group = [];
      while (queue.length) {
        const [x, y] = queue.pop();
        const key = `${x},${y}`;
        if (x < 0 || x >= COLUMNS || y < 0 || y >= ROWS || visited.has(key)) continue;
        visited.add(key);
        const tiles = this.columns[x];
        const candidate = tiles[y - (ROWS - tiles.length)];
        if (!candidate || candidate.tileColor !== tile.tileColor) continue;
        group.push({ column: x, tile: candidate });
        queue.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]);
      }
      if (group.length < 3) return;
      const affected = new Set();
      group.forEach(({ column: x, tile: cell }) => {
        const tiles = this.columns[x];
        tiles.splice(tiles.indexOf(cell), 1);
        cell.destroy();
        affected.add(x);
      });
      removed += group.length;
      scoreLabel.textContent = `Убрано клеток: ${removed}`;
      const falling = [];
      affected.forEach((x) => {
        const tiles = this.columns[x];
        const emptyAtTop = ROWS - tiles.length;
        tiles.forEach((cell, row) => {
          const targetY = (emptyAtTop + row) * CELL + CELL / 2;
          if (cell.y !== targetY) falling.push({ cell, targetY });
        });
      });
      if (falling.length === 0) return;
      this.isFalling = true;
      let remaining = falling.length;
      falling.forEach(({ cell, targetY }) => {
        this.tweens.add({
          targets: cell,
          y: targetY,
          duration: Math.min(500, 180 + (targetY - cell.y) * 1.2),
          ease: 'Quad.easeIn',
          onComplete: () => {
            remaining -= 1;
            if (remaining === 0) this.isFalling = false;
          }
        });
      });
    }
  }

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: COLUMNS * CELL,
    height: ROWS * CELL,
    backgroundColor: '#dfe7f1',
    loader: { imageLoadType: 'HTMLImageElement' },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: BoardScene
  });

  document.getElementById('reset').addEventListener('click', () => {
    removed = 0;
    scoreLabel.textContent = 'Убрано клеток: 0';
    game.scene.getScene('BoardScene').scene.restart();
  });
}
