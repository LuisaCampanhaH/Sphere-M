const canvas = document.getElementById('graph-canvas');
const ctx = canvas.getContext('2d');
let W = canvas.parentElement.clientWidth || 800;
let H = canvas.parentElement.clientHeight || 600;
canvas.width = W;
canvas.height = H;

// resize handler
window.addEventListener('resize', () => {
  W = canvas.parentElement.clientWidth;
  H = canvas.parentElement.clientHeight;
  canvas.width = W;
  canvas.height = H;
  draw();
});

let nodes = [], edges = [], selected = null, dragging = null;
let dragOff = { x: 0, y: 0 }, nextId = 0, animFrame = null;

// ── Conjuntos do algoritmo ────────────────────────────────
let E = new Set();       // todos os elementos conhecidos (labels)
let G = new Set();       // nós novos da iteração atual
let tempG = new Set();   // nós criados nesta rodada
let GE = [];             // pares (gi, ei) a percorrer
let seenPairs = new Set();
let pairIdx = 0;
let round = 1;
let finished = false;

const GROUP_COLORS = {
  teto:        { fill: '#fdeee8', stroke: '#d4450c', text: '#7a2506' },
  piso:        { fill: '#e8effe', stroke: '#1d5bbf', text: '#0e3275' },
  relacionado: { fill: '#e8f7ee', stroke: '#1a7a3f', text: '#0d4422' },
  meio:        { fill: '#f3eafd', stroke: '#7c22d4', text: '#4a0e87' },
};

// ── Nós ──────────────────────────────────────────────────

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
    highlight: false, pulse: 0,
    linkedToCeiling: false,
    linkedToFloor: false,
  };
  nodes.push(node);
  return node;
}

function getOrCreateEdge(idA, idB) {
  const exists = edges.find(e =>
    (e.from === idA && e.to === idB) || (e.from === idB && e.to === idA));
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

// ── Propagação de marcas (BFS) ────────────────────────────
// Propaga linkedToCeiling e linkedToFloor pelo grafo inteiro
// a partir dos nós que já têm a marca. Chamado após cada
// inserção de aresta.

function propagateMarks() {
  // BFS a partir de todos os nós já marcados como ceiling
  const cQueue = nodes.filter(n => n.linkedToCeiling).map(n => n.id);
  const cVisited = new Set(cQueue);
  while (cQueue.length) {
    const cur = cQueue.shift();
    const neighbors = edges
      .filter(e => e.from === cur || e.to === cur)
      .map(e => e.from === cur ? e.to : e.from);
    for (const nb of neighbors) {
      if (!cVisited.has(nb)) {
        cVisited.add(nb);
        cQueue.push(nb);
        const nd = nodes.find(n => n.id === nb);
        if (nd) nd.linkedToCeiling = true;
      }
    }
  }

  // BFS a partir de todos os nós já marcados como floor
  const fQueue = nodes.filter(n => n.linkedToFloor).map(n => n.id);
  const fVisited = new Set(fQueue);
  while (fQueue.length) {
    const cur = fQueue.shift();
    const neighbors = edges
      .filter(e => e.from === cur || e.to === cur)
      .map(e => e.from === cur ? e.to : e.from);
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

// Verifica se todos os elementos de E têm as duas marcas
function isGraphComplete() {
  return nodes.every(nd => nd.linkedToCeiling && nd.linkedToFloor);
}

// ── Conjuntos: geração de pares GE ────────────────────────
// GE = { (gi, ei) | gi ∈ G, ei ∈ E, gi ≠ ei, par não visto }
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

// Para o "continuar": reseta seenPairs e trata todos como novos
function buildGEforContinue() {
  seenPairs = new Set();
  G = new Set(E);
  return buildGE();
}

// ── Simulação de forças ───────────────────────────────────

const REPULSION = 8000, SPRING_LEN = 130, SPRING_K = 0.05, DAMPING = 0.82, CENTER_K = 0.008;
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

// ── Desenhar ─────────────────────────────────────────────

function draw() {
  ctx.clearRect(0, 0, W, H);

  // grid
  ctx.fillStyle = 'rgba(0,0,0,0.06)';
  for (let x = 30; x < W; x += 30)
    for (let y = 30; y < H; y += 30) {
      ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI * 2); ctx.fill();
    }

  // arestas
  edges.forEach(e => {
    const a = nodes.find(n => n.id === e.from), b = nodes.find(n => n.id === e.to);
    if (!a || !b) return;
    const dx = b.x - a.x, dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) return;
    const ux = dx / dist, uy = dy / dist, r = 28;
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,0.14)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(a.x + ux * r, a.y + uy * r);
    ctx.lineTo(b.x - ux * r, b.y - uy * r);
    ctx.stroke();
    ctx.restore();
  });

  // (sem linha tracejada — par destacado pelos pulsos nos nós)

  // nós
  nodes.forEach(nd => {
    const c = GROUP_COLORS[nd.group] || GROUP_COLORS.meio;
    const isSel = selected && selected.id === nd.id;
    const r = 28;

    let shape = 'circle';
    if (nd.group === 'teto') shape = 'tri-up';
    else if (nd.group === 'piso') shape = 'tri-down';
    else if (nd.group === 'relacionado') shape = nd.relIdx === 0 ? 'hexagon' : 'diamond';

    function buildPath() {
      ctx.beginPath();
      if (shape === 'circle') {
        ctx.arc(nd.x, nd.y, r, 0, Math.PI * 2);
      } else if (shape === 'tri-up') {
        const h = r * 1.8;
        ctx.moveTo(nd.x,           nd.y - h * 0.62);
        ctx.lineTo(nd.x + r * 1.1, nd.y + h * 0.38);
        ctx.lineTo(nd.x - r * 1.1, nd.y + h * 0.38);
        ctx.closePath();
      } else if (shape === 'tri-down') {
        const h = r * 1.8;
        ctx.moveTo(nd.x,           nd.y + h * 0.62);
        ctx.lineTo(nd.x + r * 1.1, nd.y - h * 0.38);
        ctx.lineTo(nd.x - r * 1.1, nd.y - h * 0.38);
        ctx.closePath();
      } else if (shape === 'diamond') {
        ctx.moveTo(nd.x,           nd.y - r * 1.3);
        ctx.lineTo(nd.x + r * 1.1, nd.y);
        ctx.lineTo(nd.x,           nd.y + r * 1.3);
        ctx.lineTo(nd.x - r * 1.1, nd.y);
        ctx.closePath();
      } else if (shape === 'hexagon') {
        for (let i = 0; i < 6; i++) {
          const ang = Math.PI / 180 * (60 * i - 30);
          const px = nd.x + r * 1.1 * Math.cos(ang);
          const py = nd.y + r * 1.1 * Math.sin(ang);
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath();
      }
    }

    // anel de pulso (par em destaque)
    if (nd.highlight) {
      const pulse = Math.sin(nd.pulse || 0);
      ctx.save();
      ctx.strokeStyle = c.stroke;
      ctx.globalAlpha = 0.22 + 0.13 * pulse;
      ctx.lineWidth = 2;
      ctx.save();
      ctx.translate(nd.x, nd.y);
      ctx.scale(1 + 0.18 + 0.08 * pulse, 1 + 0.18 + 0.08 * pulse);
      ctx.translate(-nd.x, -nd.y);
      buildPath();
      ctx.restore();
      ctx.stroke();
      ctx.restore();
    }

    // forma principal
    ctx.save();
    if (isSel) { ctx.shadowColor = c.stroke; ctx.shadowBlur = 14; }
    buildPath();
    ctx.fillStyle = c.fill;
    ctx.fill();
    ctx.strokeStyle = c.stroke;
    ctx.lineWidth = (isSel || nd.highlight) ? 2.5 : 1.2;
    ctx.stroke();
    ctx.restore();

    // indicadores de marca C/F
    if (nd.linkedToCeiling || nd.linkedToFloor) {
      ctx.save();
      ctx.font = 'bold 7px DM Mono, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const marks = [];
      if (nd.linkedToCeiling) marks.push({ label: 'C', color: '#d4450c' });
      if (nd.linkedToFloor)   marks.push({ label: 'F', color: '#1d5bbf' });
      marks.forEach((m, i) => {
        const ox = (marks.length === 2 ? (i === 0 ? -5 : 5) : 0);
        ctx.fillStyle = m.color;
        ctx.fillText(m.label, nd.x + ox, nd.y + r - 7);
      });
      ctx.restore();
    }

    // label
    ctx.save();
    ctx.font = '500 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = c.text;
    let label = nd.label;
    const maxW = r * 1.8;
    if (ctx.measureText(label).width > maxW) {
      while (ctx.measureText(label + '…').width > maxW && label.length > 1)
        label = label.slice(0, -1);
      label += '…';
    }
    ctx.fillText(label, nd.x, nd.y - 4);
    ctx.restore();
  });

  if (!nodes.length) {
    ctx.save();
    ctx.font = '14px sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Preencha os grupos acima para começar', W / 2, H / 2);
    ctx.restore();
  }
}

// ── Fase 1 ────────────────────────────────────────────────

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
        el.style.borderColor = '#E24B4A';
        setTimeout(() => el.style.borderColor = '', 1200);
      }
    });
    return;
  }

  // reset completo
  nodes = []; edges = []; selected = null; nextId = 0;
  E = new Set(); G = new Set(); tempG = new Set();
  seenPairs = new Set(); pairIdx = 0; round = 1; finished = false;
  if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }

  // cria nós, aplica marcas iniciais, preenche E e G
  tetos.forEach(l => {
    const n = createNode(l, 'teto');
    n.fixed = true;
    n.linkedToCeiling = true;  // C marcado como linkedToCeiling
    E.add(l); G.add(l);
  });
  pisos.forEach(l => {
    const n = createNode(l, 'piso');
    n.fixed = true;
    n.linkedToFloor = true;    // F marcado como linkedToFloor
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

// ── Fase 2 ────────────────────────────────────────────────

function pathToString(startId, endId) {
  // BFS para encontrar caminho entre dois nós
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
    // fim da rodada: E ← E ∪ G (já feito ao confirmar), G ← tempG
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
      // todos têm as duas marcas → grafo completo
      document.getElementById('done-msg').style.display = 'none';
      document.getElementById('complete-msg').style.display = 'block';
    } else if (G.size > 0) {
      // ainda há nós novos → próxima rodada
      GE = buildGE();
      document.getElementById('round-num').textContent = round;
      document.getElementById('done-msg').style.display = GE.length ? 'flex' : 'none';
      document.getElementById('complete-msg').style.display = GE.length ? 'none' : 'block';
      if (!GE.length) GE = buildGEforContinue();
    } else {
      // G vazio, grafo incompleto mas sem pares novos → oferece continuar
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

  // mostra se já há caminho entre eles
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
  const na = nodes.find(n => n.label === labelA);
  const nb = nodes.find(n => n.label === labelB);
  if (!na || !nb) { advancePair(); return; }

  if (edgeExists(na.id, nb.id)) removeEdge(na.id, nb.id);

  let nm = findNode(meio);
  if (!nm) {
    const mx = (na.x + nb.x) / 2 + (Math.random() - 0.5) * 30;
    const my = (na.y + nb.y) / 2 + (Math.random() - 0.5) * 30;
    nm = createNode(meio, 'meio', mx, my);
    tempG.add(meio);
    E.add(meio);
  }

  getOrCreateEdge(na.id, nm.id);
  getOrCreateEdge(nm.id, nb.id);

  // propaga marcas após inserção das arestas
  propagateMarks();

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
  document.getElementById('finished-msg').style.display = 'flex';
  startSim(60);
}

// ── Botões ────────────────────────────────────────────────

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

// ── Reset ─────────────────────────────────────────────────

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

// ── Mouse ─────────────────────────────────────────────────

function nodeAt(x, y) {
  return nodes.slice().reverse().find(nd => {
    const dx = x - nd.x, dy = y - nd.y, r = 28;
    if (nd.group === 'teto' || nd.group === 'piso')
      return Math.abs(dx) <= r * 1.1 && Math.abs(dy) <= r * 1.1;
    if (nd.group === 'relacionado')
      return Math.abs(dx) <= r * 1.1 && Math.abs(dy) <= r * 1.3;
    return Math.hypot(dx, dy) <= r;
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