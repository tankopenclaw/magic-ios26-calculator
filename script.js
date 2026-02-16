const $display = document.getElementById('display');
const $expr = document.getElementById('expr');
const $keys = document.getElementById('keys');
const $dialog = document.getElementById('configDialog');
const $form = document.getElementById('configForm');
const $cfgCount = document.getElementById('cfgCount');
const $cfgDelay = document.getElementById('cfgDelay');

const STORAGE_KEY = 'magicCalcConfigV1';
const SECRET = '88224466=';

const cfg = loadConfig();
$cfgCount.value = cfg.phase1Count;
$cfgDelay.value = cfg.delaySec;

const state = {
  input: '0',
  expr: '',
  accumulator: null,
  pendingOp: null,
  justEvaluated: false,

  phase: 1,
  r1: 0,
  phase1CountDone: 0,
  target: null,
  r2Full: '',
  r2Typed: '',

  secretBuffer: '',
};

render();

$keys.addEventListener('click', (e) => {
  const key = e.target.closest('button')?.dataset.key;
  if (!key) return;
  pushSecret(key);
  press(key);
});

$form.addEventListener('submit', (e) => {
  e.preventDefault();
  const action = e.submitter?.value;
  if (action === 'save') {
    cfg.phase1Count = clampInt($cfgCount.value, 1, 20, 2);
    cfg.delaySec = clampInt($cfgDelay.value, 0, 3600, 20);
    saveConfig(cfg);
  }
  $dialog.close();
});

function press(key) {
  if (state.phase === 2 && /^(\d|\.|±|%|back|\+|\-|×|÷)$/.test(key)) {
    typeMagicR2Digit();
    return;
  }

  if (/^\d$/.test(key)) return typeDigit(key);
  if (key === '.') return typeDot();
  if (key === 'back') return backspace();
  if (key === 'ac') return clearAll();
  if (key === '±') return toggleSign();
  if (key === '%') return percent();
  if (/^[+\-×÷]$/.test(key)) return operate(key);
  if (key === '=') return equals();
}

function typeDigit(d) {
  if (state.justEvaluated) {
    state.input = '0';
    state.expr = '';
    state.accumulator = null;
    state.pendingOp = null;
    state.justEvaluated = false;
    resetMagic();
  }

  state.input = state.input === '0' ? d : state.input + d;
  render();
}

function typeDot() {
  if (state.justEvaluated) {
    state.input = '0';
    state.expr = '';
    state.accumulator = null;
    state.pendingOp = null;
    state.justEvaluated = false;
    resetMagic();
  }
  if (!state.input.includes('.')) state.input += '.';
  render();
}

function backspace() {
  if (state.justEvaluated) return clearAll();
  state.input = state.input.length <= 1 ? '0' : state.input.slice(0, -1);
  render();
}

function clearAll() {
  state.input = '0';
  state.expr = '';
  state.accumulator = null;
  state.pendingOp = null;
  state.justEvaluated = false;
  state.secretBuffer = '';
  resetMagic();
  render();
}

function toggleSign() {
  if (state.input === '0') return;
  state.input = state.input.startsWith('-') ? state.input.slice(1) : '-' + state.input;
  render();
}

function percent() {
  const n = Number(state.input || '0') / 100;
  state.input = String(trimFloat(n));
  render();
}

function operate(op) {
  const cur = Number(state.input || '0');

  if (op === '+') {
    if (state.phase === 1) {
      const hasInput = state.input !== '';
      if (hasInput) {
        state.r1 += cur;
        state.phase1CountDone += 1;
        state.expr = `${formatNum(state.r1)}+`;
        state.input = '0';
        state.accumulator = state.r1;
        state.pendingOp = '+';
        render();
        return;
      }

      if (state.phase1CountDone >= cfg.phase1Count) {
        startPhase2();
        return;
      }
    }
  }

  if (state.pendingOp && state.accumulator != null && !state.justEvaluated) {
    state.accumulator = calc(state.accumulator, cur, state.pendingOp);
  } else {
    state.accumulator = cur;
  }

  state.pendingOp = op;
  state.expr = `${formatNum(state.accumulator)}${op}`;
  state.input = '0';
  state.justEvaluated = false;
  render();
}

function equals() {
  if (state.phase === 2) {
    while (state.r2Typed.length < state.r2Full.length) typeMagicR2Digit(true);
    const result = state.r1 + Number(state.r2Full || '0');
    state.input = String(result);
    state.expr = `${formatNum(state.r1)}+${formatNum(Number(state.r2Full || '0'))}`;
    state.justEvaluated = true;
    state.phase = 1;
    state.r1 = 0;
    state.phase1CountDone = 0;
    render();
    return;
  }

  if (!state.pendingOp || state.accumulator == null) {
    state.justEvaluated = true;
    render();
    return;
  }

  const cur = Number(state.input || '0');
  const result = calc(state.accumulator, cur, state.pendingOp);
  state.expr = `${formatNum(state.accumulator)}${state.pendingOp}${formatNum(cur)}`;
  state.input = String(trimFloat(result));
  state.accumulator = null;
  state.pendingOp = null;
  state.justEvaluated = true;
  resetMagic();
  render();
}

function startPhase2() {
  state.phase = 2;
  state.target = makeTarget(cfg.delaySec);
  const raw = Number(state.target) - state.r1;
  state.r2Full = String(Math.max(0, Math.trunc(raw)));
  state.r2Typed = '';
  state.input = '0';
  state.expr = `${formatNum(state.r1)}+`;
  render();
}

function typeMagicR2Digit(silent = false) {
  if (!state.r2Full) return;
  const i = Math.min(state.r2Typed.length, state.r2Full.length - 1);
  state.r2Typed += state.r2Full[i];
  state.input = state.r2Typed;
  state.expr = `${formatNum(state.r1)}+${formatNum(Number(state.r2Typed || '0'))}`;
  if (!silent) render();
}

function resetMagic() {
  state.phase = 1;
  state.r1 = 0;
  state.phase1CountDone = 0;
  state.target = null;
  state.r2Full = '';
  state.r2Typed = '';
}

function calc(a, b, op) {
  if (op === '+') return trimFloat(a + b);
  if (op === '-') return trimFloat(a - b);
  if (op === '×') return trimFloat(a * b);
  if (op === '÷') return b === 0 ? 0 : trimFloat(a / b);
  return b;
}

function render() {
  $display.textContent = formatNum(Number(state.input || '0'));
  $expr.textContent = state.expr || '\u00A0';
}

function formatNum(n) {
  if (!Number.isFinite(n)) return '0';
  if (Math.abs(n) < 1e-12) n = 0;
  return n.toLocaleString('en-US', { maximumFractionDigits: 10 });
}

function trimFloat(n) {
  return Number(Number(n).toFixed(10));
}

function makeTarget(delaySec) {
  const t = new Date(Date.now() + delaySec * 1000);
  const M = String(t.getMonth() + 1);
  const D = String(t.getDate());
  const HH = String(t.getHours()).padStart(2, '0');
  const mm = String(t.getMinutes()).padStart(2, '0');
  return `${M}${D}${HH}${mm}`;
}

function pushSecret(key) {
  if (!/^\d$|^=$/.test(key)) return;
  state.secretBuffer = (state.secretBuffer + key).slice(-SECRET.length);
  if (state.secretBuffer === SECRET) {
    $cfgCount.value = cfg.phase1Count;
    $cfgDelay.value = cfg.delaySec;
    $dialog.showModal();
    state.secretBuffer = '';
  }
}

function loadConfig() {
  const fallback = { phase1Count: 2, delaySec: 20 };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const data = JSON.parse(raw);
    return {
      phase1Count: clampInt(data.phase1Count, 1, 20, 2),
      delaySec: clampInt(data.delaySec, 0, 3600, 20),
    };
  } catch {
    return fallback;
  }
}

function saveConfig(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function clampInt(v, min, max, dft) {
  const n = Number(v);
  if (!Number.isFinite(n)) return dft;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}
