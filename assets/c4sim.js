/* Endgame simulator for the Connect 4 course. Requires c4.js CSS classes.
 *
 * C4.sim(el, {board, intro, messages}) — user plays Red against a built-in
 * Yellow policy:
 *   1. win immediately if possible;
 *   2. else occupy any square where Red would win next turn (if playable);
 *   3. else any "safe" move (one that doesn't hand Red an immediate win);
 *   4. else forced — zugzwang — plays the least-bad legal move.
 *
 * Board spec: 6 strings, top row first (same as C4.board / C4.puzzle).
 * The pure game logic lives in C4SimCore so it can be unit-tested in node.
 */
(function () {
  const COLS = 'abcdefg';

  const Core = {
    parse(spec) { return spec.map(row => row.split('')); },

    dropRow(grid, col) {
      for (let r = 5; r >= 0; r--) if (grid[r][col] === '.') return r;
      return -1;
    },

    legalCols(grid) {
      const out = [];
      for (let c = 0; c < 7; c++) if (grid[0][c] === '.') out.push(c);
      return out;
    },

    winAt(grid, r, c) {
      const color = grid[r][c];
      if (color !== 'R' && color !== 'Y') return null;
      const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
      for (const [dr, dc] of dirs) {
        const cells = [[r, c]];
        for (const s of [1, -1]) {
          let rr = r + dr * s, cc = c + dc * s;
          while (rr >= 0 && rr < 6 && cc >= 0 && cc < 7 && grid[rr][cc] === color) {
            cells.push([rr, cc]);
            rr += dr * s; cc += dc * s;
          }
        }
        if (cells.length >= 4) return cells;
      }
      return null;
    },

    // Columns where `color` wins by dropping right now.
    winningCols(grid, color) {
      const out = [];
      for (const c of Core.legalCols(grid)) {
        const r = Core.dropRow(grid, c);
        grid[r][c] = color;
        if (Core.winAt(grid, r, c)) out.push(c);
        grid[r][c] = '.';
      }
      return out;
    },

    // Squares safe for BOTH players: dropping either color there neither wins
    // on the spot nor hands the opponent an immediate win. Used for the
    // zugzwang countdown.
    neutralCols(grid) {
      return Core.legalCols(grid).filter(c => {
        for (const color of ['R', 'Y']) {
          const r = Core.dropRow(grid, c);
          grid[r][c] = color;
          const win = Core.winAt(grid, r, c);
          const opp = color === 'R' ? 'Y' : 'R';
          const exposes = Core.winningCols(grid, opp).length > 0;
          grid[r][c] = '.';
          if (win || exposes) return false;
        }
        return true;
      });
    },

    yellowMove(grid) {
      const mine = Core.winningCols(grid, 'Y');
      if (mine.length) return { col: mine[0], why: 'win' };
      const theirs = Core.winningCols(grid, 'R');
      if (theirs.length) return { col: theirs[0], why: 'block' };
      const safe = Core.legalCols(grid).filter(c => {
        const r = Core.dropRow(grid, c);
        grid[r][c] = 'Y';
        const bad = Core.winningCols(grid, 'R').length > 0;
        grid[r][c] = '.';
        return !bad;
      });
      if (safe.length) return { col: safe[Math.floor(Math.random() * safe.length)], why: 'safe' };
      const legal = Core.legalCols(grid);
      return legal.length ? { col: legal[0], why: 'zugzwang' } : null;
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Core;
  if (typeof window === 'undefined') return;

  window.C4 = window.C4 || {};

  window.C4.sim = function (el, opts) {
    const original = Core.parse(opts.board);
    let grid, over, busy, timer = null;
    const msg = Object.assign({
      yourTurn: 'Your move, Red. Click a column.',
      thinking: 'Yellow is thinking…',
      safe: c => `Yellow plays ${COLS[c]} — a safe filler move.`,
      block: c => `Yellow plays ${COLS[c]}, occupying your winning square. Your claim is dead.`,
      blockFutile: (c, wins) => `Yellow blocks ${COLS[c]} — but you had a double threat. Yellow can only stop one; win at ${(wins || []).map(x => COLS[x]).join(' or ')}.`,
      zugzwang: c => `ZUGZWANG — Yellow has no safe move left and is forced to play ${COLS[c]}. Finish it!`,
      win: 'You win! Yellow ran out of safe moves and had to floor your claim.',
      lose: 'Yellow wins. Your claim died, and Yellow cashed in the leftovers.',
      draw: 'Board full — a draw. Your banked claim died along the way. Reset and guard it.'
    }, opts.messages || {});

    const wrap = document.createElement('div');
    wrap.className = 'c4-wrap';
    if (opts.intro) {
      const p = document.createElement('div');
      p.className = 'c4-prompt';
      p.textContent = opts.intro;
      wrap.appendChild(p);
    }
    const holder = document.createElement('div');
    const status = document.createElement('div');
    status.className = 'c4-feedback show';
    const meta = document.createElement('div');
    meta.className = 'c4-caption';
    const controls = document.createElement('div');
    controls.style.textAlign = 'center';
    const reset = document.createElement('button');
    reset.className = 'c4-retry';
    reset.textContent = 'Reset';
    reset.addEventListener('click', init);
    controls.appendChild(reset);
    wrap.appendChild(holder);
    wrap.appendChild(status);
    wrap.appendChild(meta);
    wrap.appendChild(controls);
    el.appendChild(wrap);

    function renderGrid(highlight) {
      holder.innerHTML = '';
      const cols = document.createElement('div');
      cols.className = 'c4-cols';
      const board = document.createElement('div');
      board.className = 'c4-board';
      for (let r = 0; r < 6; r++) for (let c = 0; c < 7; c++) {
        const cell = document.createElement('div');
        cell.className = 'c4-cell';
        if (grid[r][c] === 'R') cell.classList.add('r');
        if (grid[r][c] === 'Y') cell.classList.add('y');
        if (highlight && highlight.some(([hr, hc]) => hr === r && hc === c)) cell.classList.add('threat');
        board.appendChild(cell);
      }
      cols.appendChild(board);
      if (!over) {
        const hits = document.createElement('div');
        hits.className = 'c4-colgrid';
        for (let c = 0; c < 7; c++) {
          const hit = document.createElement('div');
          hit.className = 'c4-colhit';
          hit.title = 'Drop in column ' + COLS[c];
          hit.setAttribute('role', 'button');
          hit.setAttribute('aria-label', 'Drop in column ' + COLS[c]);
          hit.tabIndex = 0;
          hit.addEventListener('click', () => userMove(c));
          hit.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); userMove(c); }
          });
          hits.appendChild(hit);
        }
        cols.appendChild(hits);
      }
      holder.appendChild(cols);
      const labels = document.createElement('div');
      labels.className = 'c4-labels';
      for (const ch of COLS) {
        const s = document.createElement('div');
        s.textContent = ch;
        labels.appendChild(s);
      }
      holder.appendChild(labels);
    }

    function setStatus(text, tone) {
      status.className = 'c4-feedback show' + (tone ? ' ' + tone : '');
      status.textContent = text;
    }

    function updateMeta() {
      if (opts.showCounter === false) { meta.textContent = ''; return; }
      meta.textContent = 'Columns currently safe for both sides: ' + Core.neutralCols(grid).length;
    }

    function finish(text, tone, cells) {
      over = true;
      renderGrid(cells);
      setStatus(text, tone);
    }

    function userMove(col) {
      if (over || busy) return;
      const r = Core.dropRow(grid, col);
      if (r < 0) { setStatus('Column ' + COLS[col] + ' is full — pick another. ' + msg.yourTurn); return; }
      grid[r][col] = 'R';
      const win = Core.winAt(grid, r, col);
      if (win) return finish(msg.win, 'good', win);
      if (!Core.legalCols(grid).length) return finish(msg.draw, 'bad');
      busy = true;
      renderGrid();
      setStatus(msg.thinking);
      updateMeta();
      timer = setTimeout(() => {
        timer = null;
        const mv = Core.yellowMove(grid);
        const rr = Core.dropRow(grid, mv.col);
        grid[rr][mv.col] = 'Y';
        const ywin = Core.winAt(grid, rr, mv.col);
        busy = false;
        if (ywin) return finish(msg.lose, 'bad', ywin);
        if (!Core.legalCols(grid).length) return finish(msg.draw, 'bad');
        renderGrid();
        // A "block" that leaves Red still winning was futile — Red had a double
        // threat. Celebrate it instead of scolding a single-threat miss.
        let why = mv.why, redWins = null;
        if (why === 'block') {
          redWins = Core.winningCols(grid, 'R');
          if (redWins.length) why = 'blockFutile';
        }
        const note = msg[why] || msg.safe;
        const text = (typeof note === 'function' ? note(mv.col, redWins) : note);
        setStatus(text + ' ' + msg.yourTurn,
                  (why === 'zugzwang' || why === 'blockFutile') ? 'good' : (why === 'block' ? 'bad' : undefined));
        updateMeta();
      }, 550);
    }

    function init() {
      if (timer) { clearTimeout(timer); timer = null; } // cancel a pending Yellow reply
      grid = original.map(row => row.slice());
      over = false;
      busy = false;
      renderGrid();
      setStatus(msg.yourTurn);
      updateMeta();
    }

    init();
  };
})();
