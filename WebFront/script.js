// ── Theme toggle ──────────────────────────────
const html = document.documentElement;
const themeBtn  = document.getElementById('theme-toggle');
const themeIcon = document.getElementById('theme-icon');

// detect system preference on first load
if (!localStorage.getItem('sphere-theme')) {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  html.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
} else {
  html.setAttribute('data-theme', localStorage.getItem('sphere-theme'));
}

function applyThemeIcon() {
  const isDark = html.getAttribute('data-theme') === 'dark';
  themeIcon.textContent = isDark ? '☀' : '☽';
}
applyThemeIcon();

themeBtn.addEventListener('click', () => {
  const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  localStorage.setItem('sphere-theme', next);
  applyThemeIcon();
  draw(); // redraw canvas with new colors
});

// ── Canvas setup ─────────────────────────────
const canvas = document.getElementById('graph-canvas');
const ctx = canvas.getContext('2d');
let W = canvas.parentElement.clientWidth || 800;
let H = canvas.parentElement.clientHeight || 600;
canvas.width = W;
canvas.height = H;

window.addEventListener('resize', () => {
  W = canvas.parentElement.clientWidth;
  H = canvas.parentElement.clientHeight;
  canvas.width = W;
  canvas.height = H;
  draw();
});

let nodes = [], edges = [], selected = null, dragging = null;
let dragOff = { x: 0, y: 0 }, nextId = 0, animFrame = null;

// ── Conjuntos do algoritmo ────────────────────
let E = new Set();
let G = new Set();
let tempG = new Set();
let GE = [];
let seenPairs = new Set();
let pairIdx = 0;
let round = 1;
let finished = false;

// ── Node colors: reads CSS vars per-draw so they respect the current theme ──
function getGroupColors() {
  const s = getComputedStyle(html);
  const get = v => s.getPropertyValue(v).trim();
  return {
    teto: {
      fill:   get('--teto-soft'),
      stroke: get('--teto'),
      text:   get('--teto'),
    },
    piso: {
      fill:   get('--piso-soft'),
      stroke: get('--piso'),
      text:   get('--piso'),
    },
    relacionado: {
      fill:   get('--rel-soft'),
      stroke: get('--rel'),
      text:   get('--rel'),
    },
    meio: {
      fill:   get('--meio-soft'),
      stroke: get('--meio'),
      text:   get('--meio'),
    },
  };
}

// ── Nós ──────────────────────────────────────

function findNode(label) {
  return nodes.find(n => n.label.toLowerCase() === label.toLowerCase().trim());
}

function createNode(label, group, x, y) {
  const id = nextId++;
  const node = {
    id, label: label.trim(), group,
    x: x !== undefined ? x : W / 2 + (Math.random() - 0.5) * 100,
    y: y !== undefined ? y : H / 2 + (Math.random() - 0.5) * 100,
    vx: 0, vy: 0,
    w: 60, h: 42,
    highlight: false, pulse: 0,
    linkedToCeiling: false,
    linkedToFloor: false,
  };
  nodes.push(node);
  return node;
}

function getOrCreateEdge(idA, idB) {
  const exists = edges.find(e => e.from === idA && e.to === idB);
  if (!exists) edges.push({ from: idA, to: idB });
}

function removeEdge(idA, idB) {
  edges = edges.filter(e =>
    !((e.from === idA && e.to === idB) || (e.from === idB && e.to === idA)));
}

function edgeExists(idA, idB) {
  return edges.some(e =>
    (e.from === idA && e.to === idB) || (e.from === idB && e.to === idA));
}

// ── Propagação de marcas ──────────────────────

function propagateMarks() {
  const cQueue   = nodes.filter(nd => nd.linkedToCeiling).map(nd => nd.id);
  const cVisited = new Set(cQueue);
  while (cQueue.length) {
    const cur = cQueue.shift();
    const neighbors = edges.filter(e => e.to === cur).map(e => e.from);
    for (const nb of neighbors) {
      if (!cVisited.has(nb)) {
        cVisited.add(nb);
        cQueue.push(nb);
        const nd = nodes.find(n => n.id === nb);
        if (nd) nd.linkedToCeiling = true;
      }
    }
  }

  const fQueue   = nodes.filter(nd => nd.linkedToFloor).map(nd => nd.id);
  const fVisited = new Set(fQueue);
  while (fQueue.length) {
    const cur = fQueue.shift();
    const neighbors = edges.filter(e => e.from === cur).map(e => e.to);
    for (const nb of neighbors) {
      if (!fVisited.has(nb)) {
        fVisited.add(nb);
        fQueue.push(nb);
        const nd = nodes.find(n => n.id === nb);
        if (nd) nd.linkedToFloor = true;
      }
    }
  }
}

// ── Poda ─────────────────────────────────────
function executePoda() {
  let changed = true;
  while (changed) {
    propagateMarks();
    const toRemove = nodes
      .filter(nd =>
        nd.group !== 'teto' &&
        nd.group !== 'piso' &&
        !(nd.linkedToCeiling && nd.linkedToFloor)
      )
      .map(nd => nd.id);
    if (!toRemove.length) { changed = false; break; }
    edges = edges.filter(e => !toRemove.includes(e.from) && !toRemove.includes(e.to));
    nodes = nodes.filter(nd => !toRemove.includes(nd.id));
    nodes.forEach(nd => {
      if (nd.group !== 'teto') nd.linkedToCeiling = false;
      if (nd.group !== 'piso') nd.linkedToFloor   = false;
    });
  }
}

function isGraphComplete() {
  return nodes.every(nd => nd.linkedToCeiling && nd.linkedToFloor);
}

// ── Pares GE ─────────────────────────────────
function buildGE() {
  const result = [];
  for (const gi of G) {
    for (const ei of E) {
      if (gi === ei) continue;
      const key = [gi, ei].sort().join('|||');
      if (seenPairs.has(key)) continue;
      result.push([gi, ei]);
      seenPairs.add(key);
    }
  }
  return result;
}

function buildGEforContinue() {
  seenPairs = new Set();
  G = new Set(E);
  return buildGE();
}

// ── Simulação de forças ───────────────────────
const REPULSION = 10000, SPRING_LEN = 160, SPRING_K = 0.05, DAMPING = 0.82, CENTER_K = 0.008;
let simSteps = 0;

function simulateStep() {
  const n = nodes.length;
  if (!n) return;
  nodes.forEach(nd => { nd.fx = 0; nd.fy = 0; });
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = nodes[i], b = nodes[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
      const force = REPULSION / (dist * dist);
      const fx = (dx / dist) * force, fy = (dy / dist) * force;
      a.fx -= fx; a.fy -= fy; b.fx += fx; b.fy += fy;
    }
  }
  edges.forEach(e => {
    const a = nodes.find(n => n.id === e.from), b = nodes.find(n => n.id === e.to);
    if (!a || !b) return;
    const dx = b.x - a.x, dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
    const force = SPRING_K * (dist - SPRING_LEN);
    const fx = (dx / dist) * force, fy = (dy / dist) * force;
    a.fx += fx; a.fy += fy; b.fx -= fx; b.fy -= fy;
  });
  nodes.forEach(nd => {
    nd.fx += (W / 2 - nd.x) * CENTER_K;
    nd.fy += (H / 2 - nd.y) * CENTER_K;
  });
  nodes.forEach(nd => {
    if (dragging && dragging.id === nd.id) return;
    if (nd.fixed) return;
    nd.vx = (nd.vx + nd.fx) * DAMPING;
    nd.vy = (nd.vy + nd.fy) * DAMPING;
    nd.x = Math.max(36, Math.min(W - 36, nd.x + nd.vx));
    nd.y = Math.max(36, Math.min(H - 36, nd.y + nd.vy));
  });
}

function startSim(steps = 300) {
  simSteps = steps;
  if (animFrame) return;
  function loop() {
    if (simSteps > 0 || dragging) {
      simulateStep();
      if (simSteps > 0) simSteps--;
      nodes.forEach(nd => { if (nd.highlight) nd.pulse = (nd.pulse || 0) + 0.07; });
      draw();
      animFrame = requestAnimationFrame(loop);
    } else {
      draw();
      animFrame = null;
    }
  }
  animFrame = requestAnimationFrame(loop);
}

// ── Draw ──────────────────────────────────────
function draw() {
  ctx.clearRect(0, 0, W, H);
  const style = getComputedStyle(html);
  const dotColor  = style.getPropertyValue('--canvas-dot').trim();
  const edgeColor = style.getPropertyValue('--edge-color').trim();
  const textMuted = style.getPropertyValue('--text-muted').trim();
  const surfaceColor = style.getPropertyValue('--surface').trim();
  const GROUP_COLORS = getGroupColors();

  // dot grid
  ctx.fillStyle = dotColor;
  for (let x = 24; x < W; x += 24)
    for (let y = 24; y < H; y += 24) {
      ctx.beginPath(); ctx.arc(x, y, 0.8, 0, Math.PI * 2); ctx.fill();
    }

  // measure text widths
  ctx.font = '500 12px Geist, sans-serif';
  nodes.forEach(nd => {
    const textW = ctx.measureText(nd.label).width;
    nd.w = Math.max(textW + 32, 64);
    nd.h = 40;
  });

  // edges
  edges.forEach(e => {
    const a = nodes.find(n => n.id === e.from), b = nodes.find(n => n.id === e.to);
    if (!a || !b) return;
    ctx.save();
    ctx.strokeStyle = edgeColor;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
  });

  // nodes
  nodes.forEach(nd => {
    const c = GROUP_COLORS[nd.group] || GROUP_COLORS.meio;
    const isSel = selected && selected.id === nd.id;

    function buildPath() {
      const r = 8;
      const x = nd.x - nd.w / 2;
      const y = nd.y - nd.h / 2;
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(x, y, nd.w, nd.h, r);
      } else {
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + nd.w - r, y);
        ctx.quadraticCurveTo(x + nd.w, y, x + nd.w, y + r);
        ctx.lineTo(x + nd.w, y + nd.h - r);
        ctx.quadraticCurveTo(x + nd.w, y + nd.h, x + nd.w - r, y + nd.h);
        ctx.lineTo(x + r, y + nd.h);
        ctx.quadraticCurveTo(x, y + nd.h, x, y + nd.h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
      }
      ctx.closePath();
    }

    // pulse glow for highlighted nodes
    if (nd.highlight) {
      const pulse = Math.sin(nd.pulse || 0);
      ctx.save();
      ctx.strokeStyle = c.stroke;
      ctx.globalAlpha = 0.18 + 0.10 * pulse;
      ctx.lineWidth = 8 + 4 * pulse;
      ctx.save();
      ctx.translate(nd.x, nd.y);
      ctx.scale(1.08 + 0.04 * pulse, 1.08 + 0.04 * pulse);
      ctx.translate(-nd.x, -nd.y);
      buildPath();
      ctx.restore();
      ctx.stroke();
      ctx.restore();
    }

    // node body
    ctx.save();
    if (isSel) {
      ctx.shadowColor = c.stroke;
      ctx.shadowBlur = 16;
    }
    buildPath();
    ctx.fillStyle = c.fill;
    ctx.fill();
    ctx.strokeStyle = c.stroke;
    ctx.lineWidth = isSel ? 2.5 : 1.5;
    ctx.globalAlpha = isSel ? 1 : 0.9;
    ctx.stroke();
    ctx.restore();

    // C/F marks
    if (nd.linkedToCeiling || nd.linkedToFloor) {
      ctx.save();
      ctx.font = 'bold 8px Geist Mono, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const marks = [];
      const s2 = getComputedStyle(html);
      if (nd.linkedToCeiling) marks.push({ label: 'C', color: s2.getPropertyValue('--teto').trim() });
      if (nd.linkedToFloor)   marks.push({ label: 'F', color: s2.getPropertyValue('--piso').trim() });
      marks.forEach((m, i) => {
        const ox = marks.length === 2 ? (i === 0 ? -7 : 7) : 0;
        ctx.fillStyle = m.color;
        ctx.fillText(m.label, nd.x + ox, nd.y + 10);
      });
      ctx.restore();
    }

    // label
    ctx.save();
    ctx.font = '500 12px Geist, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = c.text;
    ctx.fillText(nd.label, nd.x, nd.y - (nd.linkedToCeiling || nd.linkedToFloor ? 4 : 0));
    ctx.restore();
  });

  // empty state
  if (!nodes.length) {
    ctx.save();
    ctx.font = '400 13px Geist, sans-serif';
    ctx.fillStyle = textMuted;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Preencha os grupos acima para começar', W / 2, H / 2);
    ctx.restore();
  }
}

// ── Fase 1 ───────────────────────────────────

function parseList(str) {
  return str.split(',').map(s => s.trim()).filter(Boolean);
}

function layoutNodes(nodeList) {
  const n = nodeList.length;
  const cx = W / 2, cy = H / 2, rad = Math.min(W, H) * 0.32;
  nodeList.forEach((nd, i) => {
    const angle = (2 * Math.PI * i / n) - Math.PI / 2;
    nd.x = cx + Math.cos(angle) * rad;
    nd.y = cy + Math.sin(angle) * rad;
    nd.vx = 0; nd.vy = 0;
  });
}

document.getElementById('start-btn').addEventListener('click', () => {
  const tetos = parseList(document.getElementById('input-teto').value);
  const pisos  = parseList(document.getElementById('input-piso').value);
  const rels   = parseList(document.getElementById('input-rel').value);

  if (!tetos.length || !pisos.length) {
    ['input-teto', 'input-piso'].forEach(id => {
      const el = document.getElementById(id);
      if (!parseList(el.value).length) {
        el.style.borderColor = 'var(--teto)';
        el.style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--teto) 15%, transparent)';
        setTimeout(() => { el.style.borderColor = ''; el.style.boxShadow = ''; }, 1200);
      }
    });
    return;
  }

  nodes = []; edges = []; selected = null; nextId = 0;
  E = new Set(); G = new Set(); tempG = new Set();
  seenPairs = new Set(); pairIdx = 0; round = 1; finished = false;
  if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }

  tetos.forEach(l => {
    const n = createNode(l, 'teto');
    n.fixed = true; n.linkedToCeiling = true;
    E.add(l); G.add(l);
  });
  pisos.forEach(l => {
    const n = createNode(l, 'piso');
    n.fixed = true; n.linkedToFloor = true;
    E.add(l); G.add(l);
  });
  rels.forEach((l, i) => {
    const n = createNode(l, 'relacionado');
    n.fixed = true; n.relIdx = i;
    E.add(l); G.add(l);
  });

  layoutNodes(nodes);
  GE = buildGE();
  pairIdx = 0;

  document.getElementById('phase1-panel').style.display = 'none';
  document.getElementById('phase2-panel').style.display = 'block';
  updatePairUI();
  startSim(400);
});

// ── Fase 2 ───────────────────────────────────

function pathToString(startId, endId) {
  if (startId === endId) return nodes.find(n => n.id === startId)?.label ?? '';
  const visited = new Set([startId]);
  const queue = [[startId, [startId]]];
  while (queue.length) {
    const [cur, path] = queue.shift();
    const neighbors = edges
      .filter(e => e.from === cur || e.to === cur)
      .map(e => e.from === cur ? e.to : e.from);
    for (const nb of neighbors) {
      if (nb === endId) {
        return [...path, nb].map(id => nodes.find(n => n.id === id)?.label ?? '?').join(' → ');
      }
      if (!visited.has(nb)) { visited.add(nb); queue.push([nb, [...path, nb]]); }
    }
  }
  return null;
}

function updatePairUI() {
  if (finished) return;
  nodes.forEach(n => { n.highlight = false; n.pulse = 0; });

  if (pairIdx >= GE.length) {
    propagateMarks();
    G = new Set(tempG);
    tempG = new Set();

    document.getElementById('pair-prompt').style.opacity = '0.4';
    document.getElementById('input-meio').disabled = true;
    document.getElementById('confirm-btn').disabled = true;
    document.getElementById('skip-btn').disabled = true;
    document.getElementById('already-connected-msg').style.display = 'none';
    document.getElementById('pair-counter').textContent = 'Rodada ' + round + ' concluída!';
    document.getElementById('progress-bar').style.width = '100%';

    const complete = isGraphComplete();

    if (complete) {
      document.getElementById('done-msg').style.display = 'none';
      document.getElementById('complete-msg').style.display = 'block';
    } else if (G.size > 0) {
      GE = buildGE();
      document.getElementById('round-num').textContent = round;
      document.getElementById('done-msg').style.display = GE.length ? 'flex' : 'none';
      document.getElementById('complete-msg').style.display = GE.length ? 'none' : 'block';
      if (!GE.length) GE = buildGEforContinue();
    } else {
      GE = buildGEforContinue();
      document.getElementById('done-msg').style.display = 'none';
      document.getElementById('complete-msg').style.display = 'block';
    }

    startSim(60);
    return;
  }

  const [labelA, labelB] = GE[pairIdx];

  document.getElementById('node-a-label').textContent = labelA;
  document.getElementById('node-b-label').textContent = labelB;
  document.getElementById('pair-counter').textContent = `Par ${pairIdx + 1} de ${GE.length}  (Rodada ${round})`;
  document.getElementById('progress-bar').style.width = `${(pairIdx / GE.length) * 100}%`;
  document.getElementById('input-meio').value = '';
  document.getElementById('input-meio').disabled = false;
  document.getElementById('confirm-btn').disabled = false;
  document.getElementById('skip-btn').disabled = false;
  document.getElementById('done-msg').style.display = 'none';
  document.getElementById('complete-msg').style.display = 'none';
  document.getElementById('finished-msg').style.display = 'none';
  document.getElementById('pair-prompt').style.opacity = '1';

  const na = nodes.find(n => n.label === labelA);
  const nb = nodes.find(n => n.label === labelB);

  const pathStr = (na && nb) ? pathToString(na.id, nb.id) : null;
  const msgEl   = document.getElementById('already-connected-msg');
  const pathEl  = document.getElementById('already-connected-path');
  const inputEl = document.getElementById('input-meio');

  if (pathStr) {
    msgEl.style.display = 'flex';
    pathEl.textContent = pathStr;
    inputEl.placeholder = 'Adicionar mais complexidade (opcional) ou Pular →';
    inputEl.classList.add('is-extra');
  } else {
    msgEl.style.display = 'none';
    inputEl.placeholder = 'Palavra do meio (Enter para confirmar)';
    inputEl.classList.remove('is-extra');
  }

  if (na) na.highlight = true;
  if (nb) nb.highlight = true;
  document.getElementById('input-meio').focus();
  startSim(200);
}

function confirmPair() {
  if (finished) return;
  const meio = document.getElementById('input-meio').value.trim();
  if (!meio) { advancePair(); return; }

  const [labelA, labelB] = GE[pairIdx];
  const nA = nodes.find(n => n.label === labelA);
  const nB = nodes.find(n => n.label === labelB);
  if (!nA || !nB) { advancePair(); return; }

  let gi = nA, ei = nB;
  if      (nA.linkedToCeiling && nB.linkedToFloor)    { gi = nA; ei = nB; }
  else if (nB.linkedToCeiling && nA.linkedToFloor)    { gi = nB; ei = nA; }
  else if (nB.linkedToCeiling && !nA.linkedToCeiling) { gi = nB; ei = nA; }
  else if (nA.linkedToFloor   && !nB.linkedToFloor)   { gi = nB; ei = nA; }

  if (edgeExists(gi.id, ei.id)) removeEdge(gi.id, ei.id);
  if (edgeExists(ei.id, gi.id)) removeEdge(ei.id, gi.id);

  let nm = findNode(meio);
  if (!nm) {
    const mx = (gi.x + ei.x) / 2 + (Math.random() - 0.5) * 30;
    const my = (gi.y + ei.y) / 2 + (Math.random() - 0.5) * 30;
    nm = createNode(meio, 'meio', mx, my);
    tempG.add(meio);
    E.add(meio);
  }

  getOrCreateEdge(ei.id, nm.id);
  getOrCreateEdge(nm.id, gi.id);
  advancePair();
}

function advancePair() {
  if (finished) return;
  pairIdx++;
  updatePairUI();
  startSim(300);
}

function startNextRound() {
  if (finished) return;
  round++;
  pairIdx = 0;
  document.getElementById('done-msg').style.display = 'none';
  document.getElementById('complete-msg').style.display = 'none';
  document.getElementById('pair-prompt').style.opacity = '1';
  document.getElementById('input-meio').disabled = false;
  document.getElementById('confirm-btn').disabled = false;
  document.getElementById('skip-btn').disabled = false;
  document.getElementById('stop-btn').disabled = false;
  updatePairUI();
  startSim(300);
}

function continueLoop() {
  if (finished) return;
  round++;
  GE = buildGEforContinue();
  pairIdx = 0;
  document.getElementById('done-msg').style.display = 'none';
  document.getElementById('complete-msg').style.display = 'none';
  document.getElementById('pair-prompt').style.opacity = '1';
  document.getElementById('input-meio').disabled = false;
  document.getElementById('confirm-btn').disabled = false;
  document.getElementById('skip-btn').disabled = false;
  document.getElementById('stop-btn').disabled = false;
  updatePairUI();
  startSim(300);
}

function finishLoop() {
  executePoda();
  finished = true;
  nodes.forEach(n => { n.highlight = false; n.pulse = 0; });
  document.getElementById('pair-prompt').style.opacity = '0.4';
  document.getElementById('input-meio').disabled = true;
  document.getElementById('confirm-btn').disabled = true;
  document.getElementById('skip-btn').disabled = true;
  document.getElementById('stop-btn').disabled = true;
  document.getElementById('done-msg').style.display = 'none';
  document.getElementById('complete-msg').style.display = 'none';
  document.getElementById('already-connected-msg').style.display = 'none';
  document.getElementById('finished-msg').style.display = 'block';
  startSim(60);
}

// ── Botões ────────────────────────────────────
document.getElementById('confirm-btn').addEventListener('click', confirmPair);
document.getElementById('skip-btn').addEventListener('click', advancePair);
document.getElementById('stop-btn').addEventListener('click', finishLoop);
document.getElementById('finish-btn').addEventListener('click', finishLoop);
document.getElementById('next-round-btn').addEventListener('click', startNextRound);
document.getElementById('continue-btn').addEventListener('click', continueLoop);
document.getElementById('input-meio').addEventListener('keydown', e => {
  if (e.key === 'Enter') confirmPair();
  if (e.key === 'Escape') advancePair();
});

// ── Reset ─────────────────────────────────────
function resetAll() {
  nodes = []; edges = []; selected = null; nextId = 0;
  E = new Set(); G = new Set(); tempG = new Set();
  GE = []; seenPairs = new Set(); pairIdx = 0; round = 1; finished = false;
  if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
  document.getElementById('phase1-panel').style.display = 'block';
  document.getElementById('phase2-panel').style.display = 'none';
  document.getElementById('finished-msg').style.display = 'none';
  document.getElementById('complete-msg').style.display = 'none';
  document.getElementById('done-msg').style.display = 'none';
  document.getElementById('input-teto').value = '';
  document.getElementById('input-piso').value = '';
  document.getElementById('input-rel').value = '';
  draw();
}

document.getElementById('reset-btn').addEventListener('click', resetAll);
document.getElementById('reset-btn2').addEventListener('click', resetAll);

// ── Mouse ─────────────────────────────────────
function nodeAt(x, y) {
  return nodes.slice().reverse().find(nd => {
    const hw = (nd.w || 64) / 2;
    const hh = (nd.h || 40) / 2;
    return Math.abs(x - nd.x) <= hw && Math.abs(y - nd.y) <= hh;
  });
}

function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (W / rect.width),
    y: (e.clientY - rect.top)  * (H / rect.height),
  };
}

canvas.addEventListener('mousedown', e => {
  const p = getPos(e), node = nodeAt(p.x, p.y);
  selected = node || null;
  if (node) {
    dragging = node;
    dragOff = { x: p.x - node.x, y: p.y - node.y };
    canvas.style.cursor = 'grabbing';
    startSim();
  }
  draw();
});

canvas.addEventListener('mousemove', e => {
  const p = getPos(e);
  if (dragging) {
    dragging.x = Math.max(30, Math.min(W - 30, p.x - dragOff.x));
    dragging.y = Math.max(30, Math.min(H - 30, p.y - dragOff.y));
  } else {
    canvas.style.cursor = nodeAt(p.x, p.y) ? 'grab' : 'default';
  }
});

canvas.addEventListener('mouseup', () => {
  if (dragging) { dragging.vx = 0; dragging.vy = 0; }
  dragging = null;
  canvas.style.cursor = 'default';
  startSim();
});

canvas.addEventListener('mouseleave', () => { dragging = null; });

document.addEventListener('keydown', e => {
  const tag = document.activeElement.tagName;
  if ((e.key === 'Delete' || e.key === 'Backspace') && selected && tag !== 'INPUT') {
    edges = edges.filter(ed => ed.from !== selected.id && ed.to !== selected.id);
    nodes = nodes.filter(n => n.id !== selected.id);
    selected = null;
    startSim();
  }
});

draw();