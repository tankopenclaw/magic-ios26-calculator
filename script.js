const $display = document.getElementById('display');
const $expr = document.getElementById('expr');
const $keys = document.getElementById('keys');
const $dialog = document.getElementById('configDialog');
const $form = document.getElementById('configForm');
const $debug = document.getElementById('debug');
const $cfgCount = document.getElementById('cfgCount');
const $topBar = document.querySelector('.top-bar');
const $displayWrap = document.querySelector('.display-wrap');
const $cfgDelay = document.getElementById('cfgDelay');
const $cfgDebug = document.getElementById('cfgDebug');

const STORAGE_KEY = 'magicCalcConfigV1';
const SECRET = '88224466=';

const cfg = loadConfig();
$cfgCount.value = cfg.phase1Count;
$cfgDelay.value = cfg.delaySec;
$cfgDebug.checked = !!cfg.debug;

const state = {
  input: '0',
  expr: '',
  accumulator: null,
  pendingOp: null,
  justEvaluated: false,
  inputDirty: false,

  phase: 1,
  r1: 0,
  phase1CountDone: 0,
  target: null,
  r2Full: '',
  r2Typed: '',

  secretBuffer: '',
  lastKey: '-',
  lastIgnored: false,
};

render();
fitKeyboardHeight();
window.addEventListener('resize', fitKeyboardHeight);
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', fitKeyboardHeight);
}

let lastTouchEndAt = 0;
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - lastTouchEndAt < 300) e.preventDefault();
  lastTouchEndAt = now;
}, { passive: false });

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
    cfg.debug = !!$cfgDebug.checked;
    saveConfig(cfg);
    render();
  }
  $dialog.close();
});

function press(key) {
  state.lastKey = key;
  state.lastIgnored = false;

  if (state.phase === 2 && /^(\d|\.|±|%|back|\+|\-|×|÷)$/.test(key)) {
    state.lastIgnored = true;
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
    state.inputDirty = false;
    resetMagic();
  }

  state.input = state.input === '0' ? d : state.input + d;
  state.inputDirty = true;
  render();
}

function typeDot() {
  if (state.justEvaluated) {
    state.input = '0';
    state.expr = '';
    state.accumulator = null;
    state.pendingOp = null;
    state.justEvaluated = false;
    state.inputDirty = false;
    resetMagic();
  }
  if (!state.input.includes('.')) {
    state.input += '.';
    state.inputDirty = true;
  }
  render();
}

function backspace() {
  if (state.justEvaluated) return clearAll();
  state.input = state.input.length <= 1 ? '0' : state.input.slice(0, -1);
  state.inputDirty = true;
  render();
}

function clearAll() {
  state.input = '0';
  state.expr = '';
  state.accumulator = null;
  state.pendingOp = null;
  state.justEvaluated = false;
  state.inputDirty = false;
  state.secretBuffer = '';
  resetMagic();
  render();
}

function toggleSign() {
  if (state.input === '0') return;
  state.input = state.input.startsWith('-') ? state.input.slice(1) : '-' + state.input;
  state.inputDirty = true;
  render();
}

function percent() {
  const n = Number(state.input || '0') / 100;
  state.input = String(trimFloat(n));
  state.inputDirty = true;
  render();
}

function operate(op) {
  const cur = Number(state.input || '0');

  if (op === '+') {
    if (state.phase === 1) {
      if (state.inputDirty) {
        state.r1 += cur;
        state.phase1CountDone += 1;
        state.expr = `${formatNum(state.r1)}+`;
        state.input = '0';
        state.inputDirty = false;
        state.accumulator = state.r1;
        state.pendingOp = '+';

        if (state.phase1CountDone >= cfg.phase1Count) {
          startPhase2();
          return;
        }

        render();
        return;
      }

      if (!state.inputDirty && state.phase1CountDone >= cfg.phase1Count) {
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
  state.inputDirty = false;
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
    state.inputDirty = false;
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
  state.inputDirty = false;
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
  state.inputDirty = false;
  state.expr = `${formatNum(state.r1)}+`;
  render();
}

function typeMagicR2Digit(silent = false) {
  if (!state.r2Full) return;
  if (state.r2Typed.length >= state.r2Full.length) {
    state.lastIgnored = true;
    if (!silent) render();
    return;
  }
  const i = state.r2Typed.length;
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
  fitKeyboardHeight();

  if ($debug) {
    if (!cfg.debug) {
      $debug.style.display = 'none';
      return;
    }

    $debug.style.display = 'block';
    const ignoreNow = state.phase === 2 ? 'YES' : 'NO';
    const line1 = `phase=${state.phase} ignoreInput=${ignoreNow} lastKey=${state.lastKey} lastIgnored=${state.lastIgnored ? 'YES' : 'NO'}`;
    const line2 = `phase1Count=${state.phase1CountDone}/${cfg.phase1Count} inputDirty=${state.inputDirty ? 'YES' : 'NO'} R1=${formatNum(state.r1)}`;
    const line3 = `target=${state.target ?? '-'} R2full=${state.r2Full || '-'} R2typed=${state.r2Typed || '-'} len=${state.r2Typed.length}/${state.r2Full.length || 0}`;
    $debug.textContent = `${line1}\n${line2}\n${line3}`;
  }
}

function fitKeyboardHeight() {
  const viewportH = window.visualViewport?.height || window.innerHeight;
  const phoneStyle = getComputedStyle(document.querySelector('.phone'));
  const phonePadTop = parseFloat(phoneStyle.paddingTop) || 0;

  const keysStyle = getComputedStyle($keys);
  const gap = parseFloat(keysStyle.gap) || 10;
  const padBottom = parseFloat(keysStyle.paddingBottom) || 0;

  const topH = $topBar?.offsetHeight || 0;
  const displayH = $displayWrap?.offsetHeight || 0;
  const debugH = (cfg.debug && $debug) ? $debug.offsetHeight : 0;

  const reserved = phonePadTop + topH + displayH + debugH + 22;
  const available = Math.max(280, viewportH - reserved - padBottom);

  const byHeight = (available - gap * 4) / 5;
  const byWidth = ($keys.clientWidth - gap * 3) / 4;
  const size = Math.floor(Math.max(58, Math.min(byHeight, byWidth, 108)));

  $keys.style.setProperty('--key-size', `${size}px`);
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
    $cfgDebug.checked = !!cfg.debug;
    $dialog.showModal();
    state.secretBuffer = '';
  }
}

function loadConfig() {
  const fallback = { phase1Count: 2, delaySec: 20, debug: false };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const data = JSON.parse(raw);
    return {
      phase1Count: clampInt(data.phase1Count, 1, 20, 2),
      delaySec: clampInt(data.delaySec, 0, 3600, 20),
      debug: !!data.debug,
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
