/* Connect 4 board renderer + puzzle engine, shared across lessons.
 *
 * Board spec: array of 6 strings (TOP row first), 7 chars each.
 *   '.' empty, 'R' red disc, 'Y' yellow disc.
 * Columns are labeled a–g left to right; rows 1–6 bottom to top.
 *
 * C4.board(el, {board, caption, threats})
 *   Static diagram. threats: [[displayRow, col], ...] cells to outline.
 *
 * C4.puzzle(el, {board, prompt, correct, success, wrong, wrongByCol, threats})
 *   Click-a-column puzzle. correct: array of column indices (0–6).
 *   success: message on correct. wrong: default message on incorrect.
 *   wrongByCol: {colIndex: message} overrides for instructive mistakes.
 *   threats: cells to pulse after the correct disc lands.
 *
 * C4.choice(el, {board, prompt, options, threats})
 *   Multiple choice. options: [{label, correct, explain}]
 */
(function () {
  const COLS = 'abcdefg';

  function parse(spec) {
    return spec.map(row => row.split(''));
  }

  function renderGrid(grid) {
    const board = document.createElement('div');
    board.className = 'c4-board';
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 7; c++) {
        const cell = document.createElement('div');
        cell.className = 'c4-cell';
        if (grid[r][c] === 'R') cell.classList.add('r');
        if (grid[r][c] === 'Y') cell.classList.add('y');
        cell.dataset.r = r;
        cell.dataset.c = c;
        board.appendChild(cell);
      }
    }
    return board;
  }

  function labels() {
    const el = document.createElement('div');
    el.className = 'c4-labels';
    for (const ch of COLS) {
      const s = document.createElement('div');
      s.textContent = ch;
      el.appendChild(s);
    }
    return el;
  }

  function markThreats(boardEl, threats) {
    (threats || []).forEach(([r, c]) => {
      const cell = boardEl.querySelector(`.c4-cell[data-r="${r}"][data-c="${c}"]`);
      if (cell) cell.classList.add('threat');
    });
  }

  function dropRow(grid, col) {
    for (let r = 5; r >= 0; r--) {
      if (grid[r][col] === '.') return r;
    }
    return -1;
  }

  window.C4 = {
    board(el, opts) {
      const grid = parse(opts.board);
      const wrap = document.createElement('div');
      wrap.className = 'c4-wrap';
      const boardEl = renderGrid(grid);
      wrap.appendChild(boardEl);
      wrap.appendChild(labels());
      markThreats(boardEl, opts.threats);
      if (opts.caption) {
        const cap = document.createElement('div');
        cap.className = 'c4-caption';
        cap.textContent = opts.caption;
        wrap.appendChild(cap);
      }
      el.appendChild(wrap);
    },

    puzzle(el, opts) {
      const original = parse(opts.board);
      let grid = parse(opts.board);
      let solved = false;
      let locked = false; // set after a wrong move until "Try again"

      const wrap = document.createElement('div');
      wrap.className = 'c4-wrap';

      if (opts.prompt) {
        const p = document.createElement('div');
        p.className = 'c4-prompt';
        p.textContent = opts.prompt;
        wrap.appendChild(p);
      }

      const holder = document.createElement('div');
      const feedback = document.createElement('div');
      feedback.className = 'c4-feedback';
      wrap.appendChild(holder);
      wrap.appendChild(feedback);
      el.appendChild(wrap);

      function draw() {
        holder.innerHTML = '';
        const cols = document.createElement('div');
        cols.className = 'c4-cols';
        const boardEl = renderGrid(grid);
        cols.appendChild(boardEl);

        if (!solved) {
          const hits = document.createElement('div');
          hits.className = 'c4-colgrid';
          for (let c = 0; c < 7; c++) {
            const hit = document.createElement('div');
            hit.className = 'c4-colhit';
            hit.title = 'Drop in column ' + COLS[c];
            hit.setAttribute('role', 'button');
            hit.setAttribute('aria-label', 'Drop in column ' + COLS[c]);
            hit.tabIndex = 0;
            hit.addEventListener('click', () => play(c));
            hit.addEventListener('keydown', e => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); play(c); }
            });
            hits.appendChild(hit);
          }
          cols.appendChild(hits);
        }
        holder.appendChild(cols);
        holder.appendChild(labels());
        return boardEl;
      }

      function play(col) {
        if (locked) return; // wrong disc on the board — must reset first
        const r = dropRow(grid, col);
        if (r < 0) return;
        const ok = opts.correct.includes(col);
        grid[r][col] = 'R';
        if (ok) solved = true; else locked = true;
        const boardEl = draw();
        const cell = boardEl.querySelector(`.c4-cell[data-r="${r}"][data-c="${col}"]`);
        if (cell) cell.classList.add('dropped');

        feedback.className = 'c4-feedback show ' + (ok ? 'good' : 'bad');
        if (ok) {
          feedback.textContent = '✓ ' + opts.success;
          markThreats(boardEl, opts.threats);
        } else {
          const msg = (opts.wrongByCol && opts.wrongByCol[col]) || opts.wrong;
          feedback.textContent = '✗ ' + msg;
          const retry = document.createElement('button');
          retry.className = 'c4-retry';
          retry.textContent = 'Try again';
          retry.addEventListener('click', () => {
            grid = original.map(row => row.slice());
            locked = false;
            feedback.className = 'c4-feedback';
            draw();
          });
          feedback.appendChild(document.createElement('br'));
          feedback.appendChild(retry);
        }
      }

      draw();
    },

    choice(el, opts) {
      const wrap = document.createElement('div');
      wrap.className = 'c4-wrap';

      if (opts.board) {
        const boardEl = renderGrid(parse(opts.board));
        wrap.appendChild(boardEl);
        wrap.appendChild(labels());
        if (opts.threats) markThreats(boardEl, opts.threats);
      }

      if (opts.prompt) {
        const p = document.createElement('div');
        p.className = 'c4-prompt';
        p.textContent = opts.prompt;
        wrap.appendChild(p);
      }

      const choices = document.createElement('div');
      choices.className = 'c4-choices';
      const feedback = document.createElement('div');
      feedback.className = 'c4-feedback';

      opts.options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'c4-choice';
        btn.textContent = opt.label;
        btn.addEventListener('click', () => {
          choices.querySelectorAll('.c4-choice').forEach(b => { b.disabled = true; });
          btn.classList.add(opt.correct ? 'good' : 'bad');
          if (!opt.correct) {
            const right = opts.options.findIndex(o => o.correct);
            choices.children[right].classList.add('good');
          }
          feedback.className = 'c4-feedback show ' + (opt.correct ? 'good' : 'bad');
          feedback.textContent = (opt.correct ? '✓ ' : '✗ ') + opt.explain;
        });
        choices.appendChild(btn);
      });

      wrap.appendChild(choices);
      wrap.appendChild(feedback);
      el.appendChild(wrap);
    }
  };
})();
