const canvas = document.getElementById('graph-canvas');
const ctx = canvas.getContext('2d');
let W = canvas.parentElement.clientWidth || 800;
let H = canvas.parentElement.clientHeight || 600;
canvas.width = W;
canvas.height = H;
let sessionId = 0;

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
let E = new Set();
let G = new Set();
let tempG = new Set();
let GE = [];
let seenPairs = new Set();
let pairIdx = 0;
let round = 1;
let finished = false;

const GROUP_COLORS = {
  teto: { fill: '#fdeee8', stroke: '#d4450c', text: '#7a2506' },
  piso: { fill: '#e8effe', stroke: '#1d5bbf', text: '#0e3275' },
  relacionado: { fill: '#e8f7ee', stroke: '#1a7a3f', text: '#0d4422' },
  meio: { fill: '#f3eafd', stroke: '#7c22d4', text: '#4a0e87' },
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
    w: 64, h: 30,   // will be recalculated on first draw()
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

// ── Propagação de marcas ─────────────────────────────────

function propagateMarks() {
  const cQueue = nodes.filter(nd => nd.linkedToCeiling).map(nd => nd.id);
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

  const fQueue = nodes.filter(nd => nd.linkedToFloor).map(nd => nd.id);
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

// ── Poda: remove qualquer nó sem C+F simultâneo, exceto teto e piso ──
// Roda em loop até estabilizar, pois remover um nó pode desancorar vizinhos.
// Chamada automaticamente pelo botão "encerrar".
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
    // resetar marcas para re-propagar do zero na próxima iteração
    nodes.forEach(nd => {
      if (nd.group !== 'teto') nd.linkedToCeiling = false;
      if (nd.group !== 'piso') nd.linkedToFloor = false;
    });
  }
}

function isGraphComplete() {
  return nodes.every(nd => nd.linkedToCeiling && nd.linkedToFloor);
}

// ── Conjuntos: geração de pares GE ────────────────────────
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

// ── Simulação de forças ───────────────────────────────────
const REPULSION = 28000, SPRING_LEN = 220, SPRING_K = 0.04, DAMPING = 0.82, CENTER_K = 0.008;

// Target Y bands for each group (fractions of H)
const GROUP_TARGET_Y = { teto: 0.10, piso: 0.90, relacionado: 0.50, meio: 0.50 };
const GROUP_Y_K = { teto: 0.06, piso: 0.06, relacionado: 0.04, meio: 0.035 };
// Target X: teto/piso/relacionado pulled to center-X; meios pulled together sideways
const GROUP_X_K = { teto: 0.02, piso: 0.02, relacionado: 0.02, meio: 0.0 };

let simSteps = 0;

function simulateStep() {
  const n = nodes.length;
  if (!n) return;
  nodes.forEach(nd => { nd.fx = 0; nd.fy = 0; });

  // Repulsion between all pairs
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

  // Spring forces along edges
  edges.forEach(e => {
    const a = nodes.find(n => n.id === e.from), b = nodes.find(n => n.id === e.to);
    if (!a || !b) return;
    const dx = b.x - a.x, dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
    const force = SPRING_K * (dist - SPRING_LEN);
    const fx = (dx / dist) * force, fy = (dy / dist) * force;
    a.fx += fx; a.fy += fy; b.fx -= fx; b.fy -= fy;
  });

  // Group-based gravity: each group is pulled to its target Y band
  nodes.forEach(nd => {
    const targetY = (GROUP_TARGET_Y[nd.group] ?? 0.5) * H;
    const yK = GROUP_Y_K[nd.group] ?? CENTER_K;
    nd.fy += (targetY - nd.y) * yK;

    // X gravity: non-meio nodes pulled toward center-X
    const xK = GROUP_X_K[nd.group] ?? 0;
    nd.fx += (W / 2 - nd.x) * xK;
  });

  // Meios: pulled toward center-X (gentle) + slight sibling clustering on X
  const meioNodes = nodes.filter(nd => nd.group === 'meio');
  if (meioNodes.length > 1) {
    // Sort by id so order is stable, then space them evenly around center-X
    const sorted = [...meioNodes].sort((a, b) => a.id - b.id);
    const spacing = Math.min(140, (W * 0.6) / sorted.length);
    const totalW = spacing * (sorted.length - 1);
    sorted.forEach((nd, i) => {
      const targetX = W / 2 - totalW / 2 + i * spacing;
      nd.fx += (targetX - nd.x) * 0.025;
    });
  } else if (meioNodes.length === 1) {
    meioNodes[0].fx += (W / 2 - meioNodes[0].x) * 0.025;
  }

  // Integrate
  nodes.forEach(nd => {
    if (dragging && dragging.id === nd.id) return;
    if (nd.fixed) return;
    nd.vx = (nd.vx + nd.fx) * DAMPING;
    nd.vy = (nd.vy + nd.fy) * DAMPING;
    nd.x = Math.max(nd.w / 2 + 4, Math.min(W - nd.w / 2 - 4, nd.x + nd.vx));
    nd.y = Math.max(nd.h / 2 + 4, Math.min(H - nd.h / 2 - 4, nd.y + nd.vy));
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

  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--canvas-dot').trim() || 'rgba(0,0,0,0.06)';
  for (let x = 30; x < W; x += 30)
    for (let y = 30; y < H; y += 30) {
      ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI * 2); ctx.fill();
    }

  // ── Measure node sizes (two-zone design) ──────────────────
  const LABEL_FONT = '500 12px "Geist Mono", ui-monospace, monospace';
  ctx.font = LABEL_FONT;
  const NODE_R     = 5;   // border radius
  const ACCENT_H   = 3;   // top color stripe height
  const LABEL_ZONE = 30;  // height of label area
  const BADGE_ZONE = 20;  // height of C/F badge area
  const BADGE_W    = 22;  // width of each C/F pill
  const BADGE_H    = 13;  // height of each C/F pill
  const BADGE_R    = 3;   // radius of C/F pill

  nodes.forEach(nd => {
    const textW = ctx.measureText(nd.label).width;
    nd.w = Math.max(textW + 28, 64);
    nd.hasBadges = nd.linkedToCeiling || nd.linkedToFloor;
    nd.h = LABEL_ZONE + (nd.hasBadges ? BADGE_ZONE : 0);
  });

  // ── Helper: rounded rect path ──────────────────────────────
  function roundRect(rx, ry, rw, rh, radii) {
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(rx, ry, rw, rh, radii);
    } else {
      const r = Array.isArray(radii) ? radii : [radii, radii, radii, radii];
      ctx.moveTo(rx + r[0], ry);
      ctx.lineTo(rx + rw - r[1], ry);
      ctx.quadraticCurveTo(rx + rw, ry,      rx + rw,      ry + r[1]);
      ctx.lineTo(rx + rw,      ry + rh - r[2]);
      ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - r[2], ry + rh);
      ctx.lineTo(rx + r[3],      ry + rh);
      ctx.quadraticCurveTo(rx,      ry + rh, rx,            ry + rh - r[3]);
      ctx.lineTo(rx,            ry + r[0]);
      ctx.quadraticCurveTo(rx,      ry,      rx + r[0],     ry);
    }
    ctx.closePath();
  }

  // ── Draw edges ──────────────────────────────────────────────
  edges.forEach(e => {
    const a = nodes.find(n => n.id === e.from), b = nodes.find(n => n.id === e.to);
    if (!a || !b) return;
    ctx.save();
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--edge-color').trim() || 'rgba(0,0,0,0.14)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
  });

  // ── Draw nodes ──────────────────────────────────────────────
  nodes.forEach(nd => {
    const c   = GROUP_COLORS[nd.group] || GROUP_COLORS.meio;
    const isSel = selected && selected.id === nd.id;
    const nx  = nd.x - nd.w / 2;
    const ny  = nd.y - nd.h / 2;
    const nw  = nd.w;
    const nh  = nd.h;

    // ── Pulse ring for highlighted nodes ──
    if (nd.highlight) {
      const pulse = Math.sin(nd.pulse || 0);
      const ring  = 5 + 3 * pulse;
      ctx.save();
      roundRect(nx - ring, ny - ring, nw + ring * 2, nh + ring * 2, NODE_R + ring);
      ctx.strokeStyle = c.stroke;
      ctx.lineWidth   = 2;
      ctx.globalAlpha = 0.18 + 0.12 * pulse;
      ctx.stroke();
      ctx.restore();
    }

    // ── Drop shadow ──
    ctx.save();
    ctx.shadowColor   = isSel ? c.stroke : 'rgba(0,0,0,0.15)';
    ctx.shadowBlur    = isSel ? 18 : 7;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = isSel ? 0 : 3;

    // Main box body
    roundRect(nx, ny, nw, nh, NODE_R);
    ctx.fillStyle = c.fill;
    ctx.fill();
    ctx.restore();

    // ── Main border ──
    ctx.save();
    roundRect(nx, ny, nw, nh, NODE_R);
    ctx.strokeStyle = c.stroke;
    ctx.lineWidth   = isSel ? 2.2 : 1.3;
    ctx.stroke();
    ctx.restore();

    // ── Top accent stripe (colored band) ──
    ctx.save();
    roundRect(nx, ny, nw, ACCENT_H, [NODE_R, NODE_R, 0, 0]);
    ctx.fillStyle = c.stroke;
    ctx.fill();
    ctx.restore();

    // ── Separator line before badge zone ──
    if (nd.hasBadges) {
      ctx.save();
      ctx.strokeStyle = c.stroke;
      ctx.globalAlpha = 0.18;
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.moveTo(nx + 6, ny + LABEL_ZONE);
      ctx.lineTo(nx + nw - 6, ny + LABEL_ZONE);
      ctx.stroke();
      ctx.restore();
    }

    // ── Label text (vertically centered in label zone) ──
    ctx.save();
    ctx.font         = LABEL_FONT;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = c.text;
    ctx.fillText(nd.label, nd.x, ny + ACCENT_H + (LABEL_ZONE - ACCENT_H) / 2);
    ctx.restore();

    // ── C / F badge pills in badge zone ──
    if (nd.hasBadges) {
      const badges = [];
      if (nd.linkedToCeiling) badges.push({ label: 'C', stroke: '#d4450c', fill: '#fdeee8', text: '#b03308' });
      if (nd.linkedToFloor)   badges.push({ label: 'F', stroke: '#1d5bbf', fill: '#e8effe', text: '#0e3275' });

      const gap        = 5;
      const totalBadge = badges.length * BADGE_W + (badges.length - 1) * gap;
      let bx           = nd.x - totalBadge / 2;
      const by         = ny + LABEL_ZONE + BADGE_ZONE / 2;

      badges.forEach(b => {
        ctx.save();
        roundRect(bx, by - BADGE_H / 2, BADGE_W, BADGE_H, BADGE_R);
        ctx.fillStyle   = b.fill;
        ctx.fill();
        ctx.strokeStyle = b.stroke;
        ctx.lineWidth   = 1;
        ctx.stroke();
        ctx.font         = '600 8px "Geist Mono", ui-monospace, monospace';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle    = b.text;
        ctx.fillText(b.label, bx + BADGE_W / 2, by);
        ctx.restore();
        bx += BADGE_W + gap;
      });
    }
  });

  if (!nodes.length) {
    ctx.save();
    ctx.font = '14px sans-serif';
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim() || 'rgba(0,0,0,0.18)';
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
  const pisos = parseList(document.getElementById('input-piso').value);
  const rels = parseList(document.getElementById('input-rel').value);

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

  nodes = []; edges = []; selected = null; nextId = 0;
  E = new Set(); G = new Set(); tempG = new Set();
  seenPairs = new Set(); pairIdx = 0; round = 1; finished = false;
  if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }

  tetos.forEach(l => {
    const n = createNode(l, 'teto');
    n.linkedToCeiling = true;
    E.add(l); G.add(l);
  });
  pisos.forEach(l => {
    const n = createNode(l, 'piso');
    n.linkedToFloor = true;
    E.add(l); G.add(l);
  });
  rels.forEach((l, i) => {
    const n = createNode(l, 'relacionado');
    n.relIdx = i;
    E.add(l); G.add(l);
  });

  // Seed initial positions by group so forces converge faster
  nodes.forEach(nd => {
    const targetY = (GROUP_TARGET_Y[nd.group] ?? 0.5) * H;
    nd.x = W / 2 + (Math.random() - 0.5) * W * 0.5;
    nd.y = targetY + (Math.random() - 0.5) * 40;
    nd.vx = 0; nd.vy = 0;
  });
  GE = buildGE();
  pairIdx = 0;

  document.getElementById('phase1-panel').style.display = 'none';
  document.getElementById('phase2-panel').style.display = 'block';
  updatePairUI();
  startSim(400);
});

// ── Fase 2 ────────────────────────────────────────────────

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

let _aiCurrentPair = null; 

async function callAI(labelGi, labelEi) {
  const domainContext = [...E].join(', ');

  const systemPrompt = `Você é um ontólogo.

Sua tarefa é analisar dois elementos de um domínio ontológico e determinar se existe algum tipo de relação entre eles.

Regras:
- Se existir relação, descreva-a em linguagem natural, de forma clara e objetiva (2 a 4 frases).
- Se não existir relação significativa entre os dois elementos neste domínio, diga isso claramente em uma frase.
- Não invente relações que não existam de fato.
- Seja direto. Não use introduções como "Com certeza" ou "Ótima pergunta".`;

  const userPrompt = `O domínio de conhecimento sendo investigado é composto pelos seguintes elementos: ${domainContext}.

Considere esse contexto ao interpretar os elementos abaixo.

Determine se há uma relação entre "${labelGi}" e "${labelEi}". Se houver, descreva a relação.`;

  try {
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer YqO39pccm4tnqUNQMiRqJXUypPCZPjoM',
      },
      body: JSON.stringify({
        model: 'mistral-medium-latest',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt   },
        ],
        max_tokens: 1000,
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    return data?.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  }
}
 
// ── Detecta se a resposta indica "sem relação" ───────────────────────
 
function aiFoundRelation(text) {
  if (!text) return false;
  const negatives = [
    'não há relação', 'não existe relação', 'não possuem relação',
    'sem relação', 'não estão diretamente relacionados',
    'não há conexão', 'não existe conexão', 'não têm relação',
    'não há uma relação', 'não há nenhuma relação',
  ];
  const lower = text.toLowerCase();
  return !negatives.some(phrase => lower.includes(phrase));
}


// ── Helpers de estado do bloco IA ────────────────────────────────────

function showAIIdle() {
  _setAIState('idle');
  document.getElementById('ai-hint').style.display = 'none';
}

function showAILoading() {
  _setAIState('loading');
  document.getElementById('ai-hint').style.display = 'none';
}

function showAIError() {
  _setAIState('error');
  document.getElementById('ai-hint').style.display = 'none';
}

function showAIResult(text, hasRelation) {
  _setAIState('result');
  document.getElementById('ai-result-text').textContent = text;

  const badge = document.getElementById('ai-relation-badge');
  if (hasRelation) {
    badge.textContent = 'Relação encontrada';
    badge.className = 'found';
  } else {
    badge.textContent = 'Sem relação';
    badge.className = 'not-found';
  }

  document.getElementById('ai-hint').style.display = hasRelation ? 'block' : 'none';
}

function _setAIState(state) {
  ['idle', 'loading', 'result', 'error'].forEach(s => {
    const el = document.getElementById(`ai-${s}`);
    if (el) el.style.display = s === state ? (state === 'result' ? 'block' : 'flex') : 'none';
  });
}

async function updatePairUI() {
  if (finished) return;
  nodes.forEach(n => { n.highlight = false; n.pulse = 0; });

  // ── Fim da rodada ──────────────────────────────────────────────
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

    showAIIdle();

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

  // ── Exibir par atual ───────────────────────────────────────────
  const [labelA, labelB] = GE[pairIdx];
  _aiCurrentPair = [labelA, labelB];

  document.getElementById('node-a-label').textContent = labelA;
  document.getElementById('node-b-label').textContent = labelB;
  document.getElementById('pair-counter').textContent = `Par ${pairIdx + 1} de ${GE.length}  (Rodada ${round})`;
  document.getElementById('progress-bar').style.width = `${(pairIdx / GE.length) * 100}%`;
  document.getElementById('input-meio').value = '';
  document.getElementById('input-meio').disabled = true;   // desabilita até a IA responder
  document.getElementById('confirm-btn').disabled = true;
  document.getElementById('skip-btn').disabled = false;    // pular sempre disponível
  document.getElementById('done-msg').style.display = 'none';
  document.getElementById('complete-msg').style.display = 'none';
  document.getElementById('finished-msg').style.display = 'none';
  document.getElementById('pair-prompt').style.opacity = '1';

  const na = nodes.find(n => n.label === labelA);
  const nb = nodes.find(n => n.label === labelB);

  const pathStr = (na && nb) ? pathToString(na.id, nb.id) : null;
  const msgEl = document.getElementById('already-connected-msg');
  const pathEl = document.getElementById('already-connected-path');
  const inputEl = document.getElementById('input-meio');

  if (pathStr) {
    msgEl.style.display = 'flex';
    pathEl.textContent = pathStr;
    inputEl.placeholder = 'Mais nós do meio (vírgula para vários) ou Pular →';
    inputEl.classList.add('is-extra');
  } else {
    msgEl.style.display = 'none';
    inputEl.placeholder = 'Palavras extraídas do texto da IA — vírgula para várias';
    inputEl.classList.remove('is-extra');
  }

  if (na) na.highlight = true;
  if (nb) nb.highlight = true;
  startSim(200);

  // ── Chamada à IA ───────────────────────────────────────────────
  showAILoading();

  const currentSession = sessionId;
  const aiText = await callAI(labelA, labelB);

  if (finished || sessionId !== currentSession) return;

  if (aiText === null) {
    showAIError();
    // Habilita skip mesmo com erro, para o fluxo não travar
    document.getElementById('skip-btn').disabled = false;
    return;
  }

  const hasRelation = aiFoundRelation(aiText);
  showAIResult(aiText, hasRelation);

  // Habilita entrada e confirmação só agora
  document.getElementById('input-meio').disabled = false;
  document.getElementById('confirm-btn').disabled = false;
  document.getElementById('input-meio').focus();
}

function confirmPair() {
  if (finished) return;
  const raw = document.getElementById('input-meio').value.trim();
  if (!raw) { advancePair(); return; }

  // Support multiple meios separated by comma: A → m1 → m2 → ... → B
  const meios = raw.split(',').map(s => s.trim()).filter(Boolean);
  if (!meios.length) { advancePair(); return; }

  const [labelA, labelB] = GE[pairIdx];
  const nA = nodes.find(n => n.label === labelA);
  const nB = nodes.find(n => n.label === labelB);
  if (!nA || !nB) { advancePair(); return; }

  let gi = nA, ei = nB;
  if (nA.linkedToCeiling && nB.linkedToFloor) { gi = nA; ei = nB; }
  else if (nB.linkedToCeiling && nA.linkedToFloor) { gi = nB; ei = nA; }
  else if (nB.linkedToCeiling && !nA.linkedToCeiling) { gi = nB; ei = nA; }
  else if (nA.linkedToFloor && !nB.linkedToFloor) { gi = nB; ei = nA; }

  // Remove any direct edge between the pair
  if (edgeExists(gi.id, ei.id)) removeEdge(gi.id, ei.id);
  if (edgeExists(ei.id, gi.id)) removeEdge(ei.id, gi.id);

  // Build siblings: each meio connects independently to ei and gi (not to each other)
  meios.forEach((label, idx) => {
    let nm = findNode(label);
    if (!nm) {
      const t = (idx + 1) / (meios.length + 1);
      const mx = gi.x * t + ei.x * (1 - t) + (Math.random() - 0.5) * 30;
      const my = gi.y * t + ei.y * (1 - t) + (Math.random() - 0.5) * 30;
      nm = createNode(label, 'meio', mx, my);
      tempG.add(label);
      E.add(label);
    }
    getOrCreateEdge(ei.id, nm.id);
    getOrCreateEdge(nm.id, gi.id);
  });

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

// ── Encerrar: executa poda automaticamente antes de finalizar ──
function finishLoop() {
  executePoda();   // ← poda integrada aqui
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

// ── Theme toggle ──────────────────────────────────────────
(function () {
  const html = document.documentElement;
  const btn = document.getElementById('theme-toggle');
  const icon = document.getElementById('theme-icon');
  const saved = localStorage.getItem('sphere-theme');
  if (saved) html.setAttribute('data-theme', saved);
  function sync() {
    const dark = html.getAttribute('data-theme') === 'dark';
    icon.textContent = dark ? '☀' : '☽';
  }
  sync();
  btn.addEventListener('click', () => {
    const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    localStorage.setItem('sphere-theme', next);
    sync();
    draw(); // redraw canvas with updated dot/edge colours
  });
})();

document.getElementById('confirm-btn').addEventListener('click', confirmPair);
document.getElementById('skip-btn').addEventListener('click', advancePair);
document.getElementById('stop-btn').addEventListener('click', finishLoop);
document.getElementById('finish-btn').addEventListener('click', finishLoop);
document.getElementById('next-round-btn').addEventListener('click', startNextRound);
document.getElementById('continue-btn').addEventListener('click', continueLoop);
document.getElementById('ai-retry-btn').addEventListener('click', async () => {
  if (!_aiCurrentPair) return;
  const [labelA, labelB] = _aiCurrentPair;
  showAILoading();
  document.getElementById('input-meio').disabled = true;
  document.getElementById('confirm-btn').disabled = true;
  const aiText = await callAI(labelA, labelB);
  if (aiText === null) {
    showAIError();
  } else {
    showAIResult(aiText, aiFoundRelation(aiText));
    document.getElementById('input-meio').disabled = false;
    document.getElementById('confirm-btn').disabled = false;
    document.getElementById('input-meio').focus();
  }
});
document.getElementById('input-meio').addEventListener('keydown', e => {
  if (e.key === 'Enter') confirmPair();
  if (e.key === 'Escape') advancePair();
});

// ── Reset ─────────────────────────────────────────────────

function resetAll() {
  sessionId++;
  nodes = []; edges = []; selected = null; nextId = 0;
  E = new Set(); G = new Set(); tempG = new Set();
  GE = []; seenPairs = new Set(); pairIdx = 0; round = 1; finished = false;
  if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
  document.getElementById('phase1-panel').style.display = 'block';
  document.getElementById('phase2-panel').style.display = 'none';
  document.getElementById('finished-msg').style.display = 'none';
  document.getElementById('complete-msg').style.display = 'none';
  document.getElementById('done-msg').style.display = 'none';
  document.getElementById('stop-btn').disabled = false;
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
    const hw = (nd.w || 64) / 2;
    const hh = (nd.h || 30) / 2;
    return Math.abs(x - nd.x) <= hw && Math.abs(y - nd.y) <= hh;
  });
}

function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (W / rect.width),
    y: (e.clientY - rect.top) * (H / rect.height),
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
    dragging.x = Math.max(dragging.w / 2 + 4, Math.min(W - dragging.w / 2 - 4, p.x - dragOff.x));
    dragging.y = Math.max(dragging.h / 2 + 4, Math.min(H - dragging.h / 2 - 4, p.y - dragOff.y));
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