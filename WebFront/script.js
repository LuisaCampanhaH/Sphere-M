const canvas = document.getElementById('graph-canvas'); 
const ctx = canvas.getContext('2d'); 
let W = canvas.parentElement.clientWidth || 800; 
let H = canvas.parentElement.clientHeight || 600; 
canvas.width = W; 
canvas.height = H; 
let sessionId = 0; 

window.addEventListener('resize', () => {   
  const oldW = W, oldH = H;   
  W = canvas.parentElement.clientWidth;   
  H = canvas.parentElement.clientHeight;   
  canvas.width = W;   
  canvas.height = H;   
  rescaleNodesToCanvas(oldW, oldH);   
  draw(); 
});

function rescaleNodesToCanvas(oldW, oldH) {   
  if (!oldW || !oldH || !W || !H) return;   
  if (oldW === W && oldH === H) return;   
  nodes.forEach(nd => {     
    nd.x = nd.x / oldW * W;     
    nd.y = nd.y / oldH * H;   
  });   
  clampNodesToCanvas(); 
}

function clampNodesToCanvas() {   
  nodes.forEach(nd => {     
    const hw = (nd.w || 64) / 2;     
    const hh = (nd.h || 30) / 2;     
    if (W > hw * 2 + 8) {       
      nd.x = Math.max(hw + 4, Math.min(W - hw - 4, nd.x));     
    }     
    if (H > hh * 2 + 8) {       
      nd.y = Math.max(hh + 4, Math.min(H - hh - 4, nd.y));     
    }   
  }); 
}

window.addEventListener('load', () => {   
  const oldW = W, oldH = H;   
  const freshW = canvas.parentElement.clientWidth;   
  const freshH = canvas.parentElement.clientHeight;   
  if (freshW && freshH && (freshW !== W || freshH !== H)) {     
    W = freshW; H = freshH;     
    canvas.width = W;     
    canvas.height = H;     
    rescaleNodesToCanvas(oldW, oldH);     
    draw(); 
  }
});

let nodes = [], edges = [], selected = null, dragging = null; 
let showEdgeLabels = localStorage.getItem('sphere-show-edge-labels') !== '0';  
let dragOff = { x: 0, y: 0 }, nextId = 0, animFrame = null; 
let ctrlSelectedNodes = []; 
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
  meio: { fill: '#f3eafd', stroke: '#7c22d4', text: '#4a0e87' }
};

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
    w: 64, h: 30,        
    highlight: false, pulse: 0,     
    linkedToCeiling: false,     
    linkedToFloor: false,     
    tagNatureza: null,       
    tagCaminho: null,        
    tagCaminhoManual: false,    
  };   
  nodes.push(node);   
  return node; 
}

function tipoRelacaoPorNatureza(nodeA, nodeB) {   
  const a = nodeA?.tagNatureza, b = nodeB?.tagNatureza;   
  if (!a || !b) return null;   
  if (a === 'Classe' && b === 'Classe') return 'é-um';   
  if ((a === 'Classe' && b === 'Objeto') || (a === 'Objeto' && b === 'Classe')) return 'é-um';   
  return null; 
}

function reavaliarTiposDeArestas() {   
  edges.forEach(e => {     
    if (e.tipoManual) return;     
    const a = nodes.find(n => n.id === e.from);     
    const b = nodes.find(n => n.id === e.to);     
    const forcado = tipoRelacaoPorNatureza(a, b);     
    if (forcado) e.tipo = forcado;   
  }); 
}

function getOrCreateEdge(idA, idB, tipoSugerido) {   
  const nodeA = nodes.find(n => n.id === idA);   
  const nodeB = nodes.find(n => n.id === idB);   
  const tipoForcado = tipoRelacaoPorNatureza(nodeA, nodeB);   
  const tipo = tipoForcado || tipoSugerido || null;   
  const exists = edges.find(e => e.from === idA && e.to === idB);   
  if (exists) {     
    if (exists.tipoManual) return exists;     
    if (tipoForcado) exists.tipo = tipoForcado;     
    else if (!exists.tipo && tipo) exists.tipo = tipo;     
    return exists;   
  }
  const edge = { from: idA, to: idB, tipo, tipoManual: false, showFOA: false };   
  edges.push(edge);   
  return edge; 
}

function removeEdge(idA, idB) {   
  edges = edges.filter(e =>     
    !((e.from === idA && e.to === idB) || (e.from === idB && e.to === idA))); 
}

function edgeExists(idA, idB) {   
  return edges.some(e =>     
    (e.from === idA && e.to === idB) || (e.from === idB && e.to === idA)); 
}

function propagateMarks() {   
  const cQueue = nodes.filter(nd => nd.linkedToCeiling).map(nd => nd.id);   
  const cVisited = new Set(cQueue);   
  while (cQueue.length) {     
    const cur = cQueue.shift();     
    const neighbors = edges.filter(e => e.from === cur).map(e => e.to);     
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
    const neighbors = edges.filter(e => e.to === cur).map(e => e.from);     
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

function combineCaminho(atual, novo) {   
  if (!novo) return atual;   
  if (!atual) return novo;   
  if (atual === novo) return atual;   
  return 'ambos'; 
}

function _nosQueAlcancam(targetId) {   
  const alcancam = new Set();   
  let fronteira = [targetId];   
  while (fronteira.length) {     
    const proxima = [];     
    for (const atual of fronteira) {       
      const predecessores = edges.filter(e => e.to === atual).map(e => e.from);       
      for (const p of predecessores) {         
        if (!alcancam.has(p)) {           
          alcancam.add(p);           
          proxima.push(p);         
        }       
      }     
    }     
    fronteira = proxima;   
  }
  return alcancam; 
}

function propagatePathTag() {   
  const sementes = nodes.filter(nd =>     
    nd.tagCaminhoManual && (nd.tagCaminho === 'positivo' || nd.tagCaminho === 'negativo')   
  );   
  const calculado = new Map();   
  sementes.forEach(semente => {     
    const alcancaveis = _nosQueAlcancam(semente.id);     
    alcancaveis.forEach(id => {       
      const atual = calculado.get(id) || null;       
      calculado.set(id, combineCaminho(atual, semente.tagCaminho));     
    });   
  });   
  nodes.forEach(nd => {     
    if (nd.tagCaminhoManual) return;     
    nd.tagCaminho = calculado.get(nd.id) || null;   
  }); 
}

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
      if (nd.group !== 'piso') nd.linkedToFloor = false;     
    }); 
  }
}

function isGraphComplete() {   
  return nodes.every(nd => nd.linkedToCeiling && nd.linkedToFloor); 
}

const NATUREZAS = ['Classe', 'Objeto', 'Atributo', 'Instância']; 
const SIMBOLOS_NATUREZA = { Classe: '(C)', Objeto: '(O)', Atributo: '(A)', 'Instância': '(I)' }; 

function auditTags() {   
  const contagem = { positivo: 0, negativo: 0, ambos: 0, semTag: 0 };   
  const ambosPorNatureza = { semNatureza: [] };   
  NATUREZAS.forEach(nat => { ambosPorNatureza[nat] = []; });   
  nodes.forEach(nd => {     
    if (nd.tagCaminho === 'positivo') contagem.positivo++;     
    else if (nd.tagCaminho === 'negativo') contagem.negativo++;     
    else if (nd.tagCaminho === 'ambos') contagem.ambos++;     
    else contagem.semTag++;     
    if (nd.tagCaminho === 'ambos') {       
      const chave = nd.tagNatureza || 'semNatureza';       
      ambosPorNatureza[chave].push(nd.label);     
    }   
  });   
  const { positivo, negativo } = contagem;   
  const desequilibrio = (positivo + negativo) > 0     
    ? Math.abs(positivo - negativo) / (positivo + negativo)     
    : null;   
  return { contagem, desequilibrio, ambosPorNatureza }; 
}

function renderAuditPanel() {   
  const el = document.getElementById('tag-audit-panel');   
  if (!el) return;   
  const { contagem, desequilibrio, ambosPorNatureza } = auditTags();   
  const totalMarcados = contagem.positivo + contagem.negativo + contagem.ambos;   
  if (!totalMarcados) {     
    el.innerHTML = `<div class="audit-empty">nenhum nó com tag de caminho ainda (duplo clique num nó pra marcar)</div>`;     
    return;   
  }
  const desqStr = desequilibrio === null ? '-' : desequilibrio.toFixed(2);   
  const desqAlerta = desequilibrio !== null && desequilibrio > 0.4;   
  let html = `     
    <div class="audit-row"><span class="audit-dot" style="background:${COR_CAMINHO.positivo}"></span>positivo: <b>${contagem.positivo}</b></div>     
    <div class="audit-row"><span class="audit-dot" style="background:${COR_CAMINHO.negativo}"></span>negativo: <b>${contagem.negativo}</b></div>     
    <div class="audit-row"><span class="audit-dot" style="background:${COR_CAMINHO.ambos}"></span>ambos: <b>${contagem.ambos}</b></div>     
    <div class="audit-row audit-desq${desqAlerta ? ' audit-desq-alert' : ''}">       
      desequilíbrio pos/neg: <b>${desqStr}</b>${desqAlerta ? ' (possível viés)' : ''}     
    </div>`;   
  NATUREZAS.concat('semNatureza').forEach(nat => {     
    const lista = ambosPorNatureza[nat];     
    if (!lista.length) return;     
    const rotulo = nat === 'semNatureza' ? 'nós sem natureza definida' : `${nat.toLowerCase()}s`;     
    html += `<div class="audit-row audit-list">       
      <span>${rotulo} marcados "ambos" (revisar se é papel duplo real):</span>       
      <ul>${lista.map(l => `<li>${l}</li>`).join('')}</ul>     
    </div>`;   
  });   
  el.innerHTML = html; 
}

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

const REPULSION = 28000, SPRING_LEN = 220, SPRING_K = 0.04, DAMPING = 0.82, CENTER_K = 0.008; 
const GROUP_TARGET_Y = { teto: 0.10, piso: 0.90, relacionado: 0.50, meio: 0.50 }; 
const GROUP_Y_K = { teto: 0.06, piso: 0.06, relacionado: 0.04, meio: 0.035 }; 
const GROUP_X_K = { teto: 0.02, piso: 0.02, relacionado: 0.02, meio: 0.0 }; 
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
    const targetY = (GROUP_TARGET_Y[nd.group] ?? 0.5) * H;     
    const yK = GROUP_Y_K[nd.group] ?? CENTER_K;     
    nd.fy += (targetY - nd.y) * yK;     
    const xK = GROUP_X_K[nd.group] ?? 0;     
    nd.fx += (W / 2 - nd.x) * xK;   
  });   
  const meioNodes = nodes.filter(nd => nd.group === 'meio');   
  if (meioNodes.length > 1) {     
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

function draw() {   
  clampNodesToCanvas();   
  propagatePathTag();   
  ctx.clearRect(0, 0, W, H);   
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--canvas-dot').trim() || 'rgba(0,0,0,0.06)';   
  for (let x = 30; x < W; x += 30)     
    for (let y = 30; y < H; y += 30) {       
      ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI * 2); ctx.fill();     
    }   
  const LABEL_FONT = '500 12px "Geist Mono", ui-monospace, monospace';   
  ctx.font = LABEL_FONT;   
  const NODE_R     = 5;   
  const ACCENT_H   = 3;   
  const LABEL_ZONE = 30;   
  const BADGE_ZONE = 20;   
  const BADGE_W    = 22;   
  const BADGE_H    = 13;   
  const BADGE_R    = 3;   
  nodes.forEach(nd => {     
    const textW = ctx.measureText(nd.label).width;     
    nd.w = Math.max(textW + 28, 64);     
    nd.hasBadges = nd.linkedToCeiling || nd.linkedToFloor;     
    nd.h = LABEL_ZONE + (nd.hasBadges ? BADGE_ZONE : 0);   
  });   
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
  edges.forEach(e => {     
    const a = nodes.find(n => n.id === e.from), b = nodes.find(n => n.id === e.to);     
    if (!a || !b) return;     
    ctx.save();     
    const tagA = a.tagCaminho, tagB = b.tagCaminho;     
    let edgeColor = getComputedStyle(document.documentElement).getPropertyValue('--edge-color-strong').trim() || 'rgba(0,0,0,0.55)';     
    let edgeWidth = 2.4;     
    if (tagA && tagB && tagA !== tagB) {       
      edgeColor = COR_CAMINHO.ambos;       
      edgeWidth = 3.2;     
    } else if (tagA || tagB) {       
      edgeColor = COR_CAMINHO[tagA || tagB];       
      edgeWidth = 3.2;     
    }     
    const dx = b.x - a.x, dy = b.y - a.y;     
    const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;     
    const ux = dx / dist, uy = dy / dist;     
    const rx = (b.w || 64) / 2, ry = (b.h || 30) / 2;     
    const denom = Math.sqrt((ux * ux) / (rx * rx) + (uy * uy) / (ry * ry)) || 1;     
    const tipX = b.x - ux / denom, tipY = b.y - uy / denom;     
    ctx.strokeStyle = edgeColor;     
    ctx.lineWidth = edgeWidth;     
    ctx.beginPath();     
    ctx.moveTo(a.x, a.y);     
    ctx.lineTo(tipX, tipY);     
    ctx.stroke();     
    const ARROW_LEN = 9, ARROW_W = 6;     
    const backX = tipX - ux * ARROW_LEN, backY = tipY - uy * ARROW_LEN;     
    const perpX = -uy, perpY = ux;     
    ctx.beginPath();     
    ctx.moveTo(tipX, tipY);     
    ctx.lineTo(backX + perpX * ARROW_W / 2, backY + perpY * ARROW_W / 2);     
    ctx.lineTo(backX - perpX * ARROW_W / 2, backY - perpY * ARROW_W / 2);     
    ctx.closePath();     
    ctx.fillStyle = edgeColor;     
    ctx.fill();     
    const isSelectedEdge = e.showFOA;          
    if ((showEdgeLabels || isSelectedEdge) && e.tipo) {       
      const midX = (a.x + tipX) / 2, midY = (a.y + tipY) / 2;       
      ctx.save();       
      ctx.font = '700 16px "Geist Mono", ui-monospace, monospace';       
      const textW = ctx.measureText(e.tipo).width;       
      const padX = 7, padY = 5;       
      roundRect(midX - textW / 2 - padX, midY - 11 - padY, textW + padX * 2, 22 + padY * 2, 5);       
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() || '#faf9f6';       
      ctx.globalAlpha = 0.97;       
      ctx.fill();       
      ctx.globalAlpha = 1;       
      ctx.strokeStyle = edgeColor;       
      ctx.lineWidth = 2;       
      if (e.tipoManual) ctx.setLineDash([2, 2]);       
      ctx.stroke();       
      ctx.setLineDash([]);       
      ctx.fillStyle = edgeColor;       
      ctx.textAlign = 'center';       
      ctx.textBaseline = 'middle';       
      ctx.fillText(e.tipo, midX, midY);       
      ctx.restore();     
    }     
    ctx.restore();   
  });   
  nodes.forEach(nd => {     
    const c   = GROUP_COLORS[nd.group] || GROUP_COLORS.meio;     
    const isSel = selected && selected.id === nd.id;     
    const nx  = nd.x - nd.w / 2;     
    const ny  = nd.y - nd.h / 2;     
    const nw  = nd.w;     
    const nh  = nd.h;     
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
    if (ctrlSelectedNodes.includes(nd)) {       
      ctx.save();       
      roundRect(nx - 4, ny - 4, nw + 8, nh + 8, NODE_R + 4);       
      ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#6d1fc2';       
      ctx.setLineDash([4, 4]);       
      ctx.lineWidth = 1.5;       
      ctx.stroke();       
      ctx.restore();     
    }     
    ctx.save();     
    ctx.shadowColor   = isSel ? c.stroke : 'rgba(0,0,0,0.15)';     
    ctx.shadowBlur    = isSel ? 18 : 7;     
    ctx.shadowOffsetX = 0;     
    ctx.shadowOffsetY = isSel ? 0 : 3;     
    roundRect(nx, ny, nw, nh, NODE_R);     
    ctx.fillStyle = c.fill;     
    ctx.fill();     
    ctx.restore();     
    ctx.save();     
    roundRect(nx, ny, nw, nh, NODE_R);     
    const corBordaTag = COR_CAMINHO[nd.tagCaminho];     
    ctx.strokeStyle = corBordaTag || c.stroke;     
    ctx.lineWidth   = corBordaTag ? 3 : (isSel ? 2.2 : 1.3);     
    ctx.stroke();     
    ctx.restore();     
    ctx.save();     
    roundRect(nx, ny, nw, ACCENT_H, [NODE_R, NODE_R, 0, 0]);     
    ctx.fillStyle = c.stroke;     
    ctx.fill();     
    ctx.restore();     
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
    ctx.save();     
    ctx.font         = LABEL_FONT;     
    ctx.textAlign    = 'center';     
    ctx.textBaseline = 'middle';     
    ctx.fillStyle    = c.text;     
    ctx.fillText(nd.label, nd.x, ny + ACCENT_H + (LABEL_ZONE - ACCENT_H) / 2);     
    ctx.restore();     
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
    if (nd.tagNatureza) {       
      ctx.save();       
      ctx.font = '600 10px "Geist Mono", ui-monospace, monospace';       
      ctx.textAlign = 'center';       
      ctx.textBaseline = 'middle';       
      ctx.fillStyle = c.stroke;       
      const simbolo = SIMBOLOS_NATUREZA[nd.tagNatureza] || '';       
      ctx.fillText(simbolo, nx + nw - 10, ny + 10);       
      ctx.restore();     
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

function parseList(str) {   
  return str.split(',').map(s => s.trim()).filter(Boolean); 
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
  ctrlSelectedNodes = [];   
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
        return [...path, nb].map(id => nodes.find(n => n.id === id)?.label ?? '?').join('   ');       
      }       
      if (!visited.has(nb)) { visited.add(nb); queue.push([nb, [...path, nb]]); }     
    }   
  }
  return null; 
}

let _aiCurrentPair = null; 
let _aiLastMeio = null; 
let _aiLastTipoAof = null; 

// TIPOS_AOF restaurado com a codificação correta
const TIPOS_AOF = ['é-um', 'é-parte-de', 'é-composto-por', 'é-uma-variação-de', 'é-um-atributo-de', 'é-um-componente-de', 'é-um-elemento-de', 'é-caracterizado-por']; 
const DOMAIN_NOTES = `- "Natal", "pré-natal" e "pós-natal": aqui SEMPRE se referem ao contexto de mortalidade/natalidade (gravidez, parto, período neonatal) NUNCA ao feriado de Natal (25 de dezembro). Trate esses termos exclusivamente como fases do ciclo gestacional/perinatal, mesmo que a palavra "Natal" sozinha remeta ao feriado no uso cotidiano.`; 

async function callAI(labelGi, labelEi) {   
  const domainContext = [...E].filter(el => el !== labelGi && el !== labelEi).join(', ');   
  const meiosExistentes = nodes.filter(nd => nd.group === 'meio').map(nd => nd.label);   
  const meiosStr = meiosExistentes.length ? meiosExistentes.join(', ') : '(nenhum ainda)';   
  const systemPrompt = `Você é um ontólogo aplicando o método Sphere-M de construção de grafos de conhecimento. REGRA MAIS IMPORTANTE, aplique-a antes de qualquer outra coisa (DESAMBIGUAÇÃO DE TERMOS): Muitas palavras do português têm mais de um sentido possível. Você NUNCA deve assumir o sentido mais comum ou mais frequente de uma palavra no uso cotidiano. Para CADA termo do par abaixo, primeiro decida qual sentido faz sentido dentro do domínio informado (a lista de "Domínio" no final e os outros conceitos já usados no grafo) - depois de fixar esse sentido, avalie a relação. Se um termo puder ser lido de duas formas diferentes, escolha sempre a leitura compatível com o domínio, mesmo que ela não seja a mais óbvia fora desse contexto. Casos já conhecidos onde isso é crítico (mas a regra vale para qualquer termo ambíguo, não apenas estes): ${DOMAIN_NOTES} O método conecta dois conceitos ("${labelGi}" e "${labelEi}") através de um único CONCEITO INTERMEDIÁRIO (o "meio"), usando relações do tipo AOF: ${TIPOS_AOF.join(' | ')} Sua tarefa: dado um par de conceitos, decidir se existe (ou pode ser construída) uma relação ontológica direta e plausível entre eles, e se sim, propor UM conceito intermediário curto que ligue os dois - de forma que "${labelGi}" se relacione com o meio, e o meio se relacione com "${labelEi}", cada ligação usando um dos tipos AOF acima. Regras estritas de formato responda SEMPRE exatamente neste layout, sem nenhum texto antes ou depois: RELAÇÃO: SIM ou NÃO CONCEITO_MEIO: <1 a 3 palavras, ou "-" se RELAÇÃO for NÃO> TIPO_AOF: <um dos tipos da lista acima, ou "-" se RELAÇÃO for NÃO> JUSTIFICATIVA: <1 a 2 frases, direto, sem introduções como "com certeza" ou "ótima pergunta"> Regras de conteúdo: Não invente relações fracas, genéricas ou forçadas só para preencher a resposta. Se a relação exigir mais de um passo intermediário óbvio ou for artificial, responda RELAÇÃO: NÃO - O CONCEITO_MEIO deve ser um substantivo ou expressão curta, nunca uma frase. - Use os outros elementos do domínio apenas como contexto de fundo, não force conexão com eles. - Conceitos de meio já usados em outros pares deste grafo: ${meiosStr}. NÃO repita nenhum desses como CONCEITO_MEIO - proponha um termo diferente, específico pra esse par. Só repita um termo já usado se ele for literalmente o mesmo conceito exato (não apenas parecido), o que é raro.`;   
  const userPrompt = `Domínio: ${domainContext || '(sem outros elementos ainda)'}\n\nPar a analisar: "${labelGi}" e "${labelEi}".\nLembrete: antes de decidir a relação, confirme o sentido de cada termo do par usando o domínio acima, não o sentido mais comum da palavra fora desse contexto.`;   
  const apiKey = window.APP_CONFIG?.MISTRAL_API_KEY;   
  if (!apiKey) return null;   
  try {     
    const controller = new AbortController();     
    const timeoutId = setTimeout(() => controller.abort(), 20000);      
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {       
      method: 'POST',       
      headers: {         
        'Content-Type': 'application/json',         
        'Authorization': `Bearer ${apiKey}`,       
      },       
      body: JSON.stringify({         
        model: 'ministral-8b-latest',         
        messages: [           
          { role: 'system', content: systemPrompt },           
          { role: 'user',   content: userPrompt   },         
        ],         
        temperature: 0.2,         
        max_tokens: 300,       
      }),       
      signal: controller.signal,     
    });     
    clearTimeout(timeoutId);     
    if (!response.ok) return null;     
    const data = await response.json();     
    return data?.choices?.[0]?.message?.content ?? null;   
  } catch {     
    return null; 
  }
}

function parseAIResponse(text) {   
  if (!text) return { hasRelation: false, meio: null, tipoAof: null, justificativa: '' };   
  const grab = (label) => {     
    const m = text.match(new RegExp('(?:' + label + ')\\s*:\\s*(.+)', 'i'));     
    return m && m[1] ? m[1].trim().replace(/^["'-]+|["'-]+$/g, '').trim() : '';   
  };   
  const relacaoRaw = grab('RELAÇÃO|RELACAO');   
  if (relacaoRaw) {     
    const hasRelation = /^sim/i.test(relacaoRaw);     
    const meioRaw = grab('CONCEITO_MEIO|CONCEITO MEIO');     
    const tipoRaw = grab('TIPO_AOF|TIPO AOF');     
    const justRaw = grab('JUSTIFICATIVA') || text;     
    return {       
      hasRelation,       
      meio: hasRelation && meioRaw && meioRaw !== '-' ? meioRaw : null,       
      tipoAof: hasRelation && tipoRaw && tipoRaw !== '-' ? tipoRaw : null,       
      justificativa: justRaw,     
    };   
  }
  const negatives = ['não há relação', 'não existe relação', 'não possuem relação', 'sem relação'];   
  const lower = text.toLowerCase();   
  const hasRelation = !negatives.some(phrase => lower.includes(phrase));   
  return { hasRelation, meio: null, tipoAof: null, justificativa: text }; 
}

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

let _aiWordList = []; 
let _aiSelectedIdx = new Set(); 

function renderClickableJustificativa(text) {   
  const container = document.getElementById('ai-result-text');   
  container.innerHTML = '';   
  _aiWordList = [];   
  _aiSelectedIdx = new Set();   
  const tokens = text.split(/(\s+)/);   
  tokens.forEach(token => {     
    if (!token) return;     
    if (/^\s+$/.test(token)) {       
      container.appendChild(document.createTextNode(token));       
      return;     
    }     
    const m = token.match(/^([^\p{L}\p{N}]*)([\p{L}\p{N}][\p{L}\p{N}-]*)?([^\p{L}\p{N}]*)$/u);     
    if (!m || !m[2]) {       
      container.appendChild(document.createTextNode(token));       
      return;     
    }     
    const [, pre, word, pos] = m;     
    if (pre) container.appendChild(document.createTextNode(pre));     
    const span = document.createElement('span');     
    span.className = 'ai-word';     
    span.textContent = word;     
    const idx = _aiWordList.length;     
    _aiWordList.push(word);     
    span.addEventListener('click', () => toggleAIWord(idx, span));     
    container.appendChild(span);     
    if (pos) container.appendChild(document.createTextNode(pos));   
  }); 
}

function toggleAIWord(idx, span) {   
  if (_aiSelectedIdx.has(idx)) {     
    _aiSelectedIdx.delete(idx);     
    span.classList.remove('selected');   
  } else {     
    _aiSelectedIdx.add(idx);     
    span.classList.add('selected');   
  }
  if (_aiSelectedIdx.size) {     
    const ordenado = [..._aiSelectedIdx].sort((a, b) => a - b).map(i => _aiWordList[i]);     
    document.getElementById('input-meio').value = ordenado.join(' '); 
  }
}

function showAIResult(parsed) {   
  _setAIState('result');   
  let displayText = parsed.justificativa || '';   
  if (parsed.hasRelation && parsed.tipoAof) {     
    displayText = `[${parsed.tipoAof}] ${displayText}`;   
  }
  renderClickableJustificativa(displayText);   
  const badge = document.getElementById('ai-relation-badge');   
  if (parsed.hasRelation) {     
    badge.textContent = 'Relação encontrada';     
    badge.className = 'found';   
  } else {     
    badge.textContent = 'Sem relação';     
    badge.className = 'not-found';   
  }
  const hintEl = document.getElementById('ai-hint');   
  const inputEl = document.getElementById('input-meio');   
  _aiLastMeio = parsed.hasRelation ? parsed.meio : null;   
  _aiLastTipoAof = parsed.hasRelation ? parsed.tipoAof : null;   
  _aiLastTipoAof = (parsed.hasRelation && TIPOS_AOF.includes(parsed.tipoAof)) ? parsed.tipoAof : null;   
  const jaExiste = parsed.meio && nodes.some(     
    nd => nd.group === 'meio' && nd.label.toLowerCase() === parsed.meio.toLowerCase()   
  );   
  if (parsed.hasRelation && parsed.meio && jaExiste) {     
    hintEl.textContent = `A IA sugeriu "${parsed.meio}", mas esse termo já existe no grafo. Confira se faz sentido reaproveitar.`;     
    hintEl.style.display = 'block';     
    if (inputEl && !inputEl.classList.contains('is-extra')) inputEl.value = '';   
  } else if (parsed.hasRelation && parsed.meio) {     
    hintEl.textContent = `A IA sugeriu "${parsed.meio}" como conceito do meio (tipo AOF: ${_aiLastTipoAof || 'não identificado'}).`;     
    hintEl.style.display = 'block';     
    if (inputEl && !inputEl.classList.contains('is-extra')) inputEl.value = parsed.meio;   
  } else if (parsed.hasRelation) {     
    hintEl.textContent = 'Leia a justificativa acima e digite abaixo o conceito que conecta os dois elementos.';     
    hintEl.style.display = 'block';   
  } else {     
    hintEl.style.display = 'none'; 
  }
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
  if (pairIdx >= GE.length) {     
    propagateMarks();     
    renderAuditPanel();     
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
  const [labelA, labelB] = GE[pairIdx];   
  _aiCurrentPair = [labelA, labelB];   
  document.getElementById('node-a-label').textContent = labelA;   
  document.getElementById('node-b-label').textContent = labelB;   
  document.getElementById('pair-counter').textContent = `Par ${pairIdx + 1} de ${GE.length} (Rodada ${round})`;   
  document.getElementById('progress-bar').style.width = `${(pairIdx / GE.length) * 100}%`;   
  document.getElementById('input-meio').value = '';   
  document.getElementById('input-meio').disabled = true;      
  document.getElementById('confirm-btn').disabled = true;   
  document.getElementById('skip-btn').disabled = false;       
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
    inputEl.placeholder = 'Mais nós do meio ou Pular';      
    inputEl.classList.add('is-extra');   
  } else {     
    msgEl.style.display = 'none';     
    inputEl.placeholder = 'Palavras extraídas do texto da IA';     
    inputEl.classList.remove('is-extra');   
  }
  if (na) na.highlight = true;   
  if (nb) nb.highlight = true;   
  startSim(200);   
  showAILoading();   
  const currentSession = sessionId;   
  const aiText = await callAI(labelA, labelB);   
  if (finished || sessionId !== currentSession) return;   
  if (aiText === null) {     
    showAIError();     
    document.getElementById('skip-btn').disabled = false;     
    return;   
  }
  try {     
    showAIResult(parseAIResponse(aiText));   
  } catch (err) {     
    showAIError();     
    document.getElementById('skip-btn').disabled = false;     
    return;   
  }
  document.getElementById('input-meio').disabled = false;   
  document.getElementById('confirm-btn').disabled = false;   
  document.getElementById('input-meio').focus(); 
}

// CORREÇÃO APLICADA: Fluxo Teto -> Meio -> Piso
function confirmPair() {   
  if (finished) return;   
  const raw = document.getElementById('input-meio')?.value.trim();   
  if (!raw) { advancePair(); return; }   
  const meios = raw.split(',').map(s => s.trim()).filter(Boolean);   
  if (!meios.length) { advancePair(); return; }   
  
  const [labelA, labelB] = GE[pairIdx];   
  const nA = nodes.find(n => n.label === labelA);   
  const nB = nodes.find(n => n.label === labelB);   
  if (!nA || !nB) { advancePair(); return; }   
  
  // Define Teto e Piso
  let gi = nA, ei = nB;   
  if (nA.linkedToCeiling && nB.linkedToFloor) { gi = nA; ei = nB; }   
  else if (nB.linkedToCeiling && nA.linkedToFloor) { gi = nB; ei = nA; }   
  else if (nB.linkedToCeiling && !nA.linkedToCeiling) { gi = nB; ei = nA; }   
  else if (nA.linkedToFloor && !nB.linkedToFloor) { gi = nB; ei = nA; }   
  
  if (edgeExists(gi.id, ei.id)) removeEdge(gi.id, ei.id);   
  if (edgeExists(ei.id, gi.id)) removeEdge(ei.id, gi.id);   
  
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
    
    // As arestas agora fluem de Teto -> Meio e de Meio -> Piso (Ajustado)
    getOrCreateEdge(gi.id, nm.id, _aiLastTipoAof);     
    getOrCreateEdge(nm.id, ei.id, _aiLastTipoAof);   
  });   
  
  _aiLastTipoAof = null;   
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
  document.getElementById('finished-msg').style.display = 'flex';   
  startSim(60); 
}

(function () {   
  const html = document.documentElement;   
  const btn = document.getElementById('theme-toggle');   
  const icon = document.getElementById('theme-icon');   
  const saved = localStorage.getItem('sphere-theme');   
  if (saved) html.setAttribute('data-theme', saved);   
  function sync() {     
    const dark = html.getAttribute('data-theme') === 'dark';     
    icon.textContent = dark ? '🌙' : '☀️';   
  }
  sync();   
  btn.addEventListener('click', () => {     
    const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';     
    html.setAttribute('data-theme', next);     
    localStorage.setItem('sphere-theme', next);     
    sync();     
    draw();   
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
    return;   
  }
  try {     
    showAIResult(parseAIResponse(aiText));     
    document.getElementById('input-meio').disabled = false;     
    document.getElementById('confirm-btn').disabled = false;     
    document.getElementById('input-meio').focus();   
  } catch (err) {     
    showAIError(); 
  }
});

document.getElementById('input-meio').addEventListener('keydown', e => {   
  if (e.key === 'Enter') confirmPair();   
  if (e.key === 'Escape') advancePair(); 
});

function resetAll() {   
  sessionId++;   
  nodes = []; edges = []; selected = null; nextId = 0;   
  E = new Set(); G = new Set(); tempG = new Set();   
  GE = []; seenPairs = new Set(); pairIdx = 0; round = 1; finished = false;   
  ctrlSelectedNodes = [];   
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
  renderAuditPanel();   
  draw(); 
}

document.getElementById('reset-btn').addEventListener('click', resetAll); 
document.getElementById('reset-btn2').addEventListener('click', resetAll); 

(function () {   
  const sections = [     
    { id: 'legend', toggleId: 'legend-toggle', storageKey: 'sphere-legend-collapsed' },     
    { id: 'tag-audit', toggleId: 'tag-audit-toggle', storageKey: 'sphere-tag-audit-collapsed' },     
    { id: 'export-section', toggleId: 'export-toggle', storageKey: 'sphere-export-collapsed' },   
  ];   
  sections.forEach(({ id, toggleId, storageKey }) => {     
    const section = document.getElementById(id);     
    const toggleBtn = document.getElementById(toggleId);     
    if (!section || !toggleBtn) return;     
    const collapsed = localStorage.getItem(storageKey) === '1';     
    if (collapsed) {       
      section.classList.add('collapsed');       
      toggleBtn.setAttribute('aria-expanded', 'false');     
    }     
    toggleBtn.addEventListener('click', () => {       
      const nowCollapsed = section.classList.toggle('collapsed');       
      toggleBtn.setAttribute('aria-expanded', nowCollapsed ? 'false' : 'true');       
      localStorage.setItem(storageKey, nowCollapsed ? '1' : '0');     
    });   
  }); 
})(); 

(function () {   
  const btn = document.getElementById('toggle-edge-labels-btn');   
  const icon = document.getElementById('toggle-edge-labels-icon');   
  function applyState() {     
    if (btn) btn.setAttribute('aria-pressed', showEdgeLabels ? 'true' : 'false');     
    if (icon) icon.textContent = showEdgeLabels ? 'Ocultar' : 'Mostrar';     
    if (btn) btn.title = showEdgeLabels       
      ? 'Ocultar rótulos das relações'       
      : 'Mostrar rótulos das relações';   
  }
  function toggleEdgeLabels() {     
    showEdgeLabels = !showEdgeLabels;     
    localStorage.setItem('sphere-show-edge-labels', showEdgeLabels ? '1' : '0');     
    applyState();     
    draw();   
  }
  applyState();   
  btn?.addEventListener('click', toggleEdgeLabels); 
})(); 

function buildSessionExport() {   
  return {     
    sphereM: {       
      version: 1,       
      exportedAt: new Date().toISOString(),       
      round,       
      finished,       
      domain: {         
        ceiling: nodes.filter(n => n.group === 'teto').map(n => n.label),         
        floor: nodes.filter(n => n.group === 'piso').map(n => n.label),         
        relevant: nodes.filter(n => n.group === 'relacionado').map(n => n.label),       
      },       
      nodes: nodes.map(n => ({         
        id: n.id,         
        label: n.label,         
        group: n.group,         
        tagNatureza: n.tagNatureza || null,         
        tagCaminho: n.tagCaminho || null,       
      })),       
      edges: edges.map(e => ({ from: e.from, to: e.to, tipoAof: e.tipoAof || null })),     
    },   
  }; 
}

function exportSessionJSON() {   
  const payload = buildSessionExport();   
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });   
  const url = URL.createObjectURL(blob);   
  const a = document.createElement('a');   
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');   
  a.href = url;   
  a.download = `sphere-m-sessao-${stamp}.json`;   
  document.body.appendChild(a);   
  a.click();   
  a.remove();   
  URL.revokeObjectURL(url); 
}

document.getElementById('export-json-btn').addEventListener('click', exportSessionJSON);  

// Mouse (Nova lógica do Ctrl + Click)
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
    if (e.ctrlKey || e.metaKey) {       
      // Se clicou no nó segurando Ctrl
      const idx = ctrlSelectedNodes.indexOf(node);       
      if (idx > -1) {         
        // Se já estava selecionado, desmarca
        ctrlSelectedNodes.splice(idx, 1);       
      } else {         
        // Marca o nó
        ctrlSelectedNodes.push(node);       
      }              
      // Se tiver dois nós selecionados com o Ctrl
      if (ctrlSelectedNodes.length === 2) {         
        const n1 = ctrlSelectedNodes[0];         
        const n2 = ctrlSelectedNodes[1];                  
        // Acha a aresta que liga esses dois nós
        const edge = edges.find(ed =>           
          (ed.from === n1.id && ed.to === n2.id) ||           
          (ed.from === n2.id && ed.to === n1.id)         
        );                  
        if (edge) {           
          // Inverte a visualização da legenda dessa aresta
          edge.showFOA = !edge.showFOA;         
        }                  
        // Limpa a seleção para poder selecionar a próxima aresta
        ctrlSelectedNodes = [];       
      }     
    } else {       
      // Clique normal (sem Ctrl)
      ctrlSelectedNodes = [];        
      dragging = node;       
      dragOff = { x: p.x - node.x, y: p.y - node.y };       
      canvas.style.cursor = 'grabbing';     
    }     
    startSim();   
  } else {     
    // Clique num espaço vazio
    ctrlSelectedNodes = [];     
    if (!(e.ctrlKey || e.metaKey)) {       
      // Se não segurou o Ctrl, limpa todas as arestas
      edges.forEach(ed => ed.showFOA = false);     
    }   
  }
  draw(); 
});

canvas.addEventListener('mousemove', e => {   
  const p = getPos(e);   
  if (dragging) {     
    dragging.x = Math.max(dragging.w / 2 + 4, Math.min(W - dragging.w / 2 - 4, p.x - dragOff.x));     
    dragging.y = Math.max(dragging.h / 2 + 4, Math.min(H - dragging.h / 2 - 4, p.y - dragOff.y));   
  } else {     
    const hoveredNode = nodeAt(p.x, p.y);     
    if (hoveredNode) canvas.style.cursor = 'grab';     
    else canvas.style.cursor = edgeAt(p.x, p.y) ? 'pointer' : 'default'; 
  }
});

canvas.addEventListener('mouseup', () => {   
  if (dragging) {     
    dragging.vx = 0; dragging.vy = 0;     
    dragging.fixed = true;   
  }
  dragging = null;   
  canvas.style.cursor = 'default';   
  startSim(); 
});

canvas.addEventListener('mouseleave', () => { dragging = null; });  

// Edição inline de nós (duplo clique)
let editingNode = null; 
let nodeEditInput = null; 
let nodeTagPanel = null; 
const COR_CAMINHO = {   
  positivo: '#0a8f3c',   
  negativo: '#c1121f',   
  ambos: '#6a2ca5', 
};

function distToSegment(px, py, ax, ay, bx, by) {   
  const dx = bx - ax, dy = by - ay;   
  const lenSq = dx * dx + dy * dy;   
  let t = lenSq ? ((px - ax) * dx + (py - ay) * dy) / lenSq : 0;   
  t = Math.max(0, Math.min(1, t));   
  const cx = ax + t * dx, cy = ay + t * dy;   
  return Math.hypot(px - cx, py - cy); 
}

function edgeAt(x, y) {   
  const THRESH = 10;   
  let best = null, bestDist = THRESH;   
  edges.forEach(e => {     
    const a = nodes.find(n => n.id === e.from), b = nodes.find(n => n.id === e.to);     
    if (!a || !b) return;     
    const d = distToSegment(x, y, a.x, a.y, b.x, b.y);     
    if (d < bestDist) { bestDist = d; best = e; }   
  });   
  return best; 
}

let editingEdge = null; 
let edgeAofSelect = null; 
let edgeTagPanel = null; 

function startEdgeEdit(edge, pos) {   
  if (editingNode) commitNodeEdit();   
  if (editingEdge) commitEdgeEdit();   
  editingEdge = edge;   
  const rect = canvas.getBoundingClientRect();   
  const scaleX = rect.width / W;   
  const scaleY = rect.height / H;   
  const a = nodes.find(n => n.id === edge.from), b = nodes.find(n => n.id === edge.to);   
  edgeTagPanel = document.createElement('div');   
  edgeTagPanel.style.position = 'fixed';   
  edgeTagPanel.style.left = (rect.left + pos.x * scaleX - 90) + 'px';   
  edgeTagPanel.style.top  = (rect.top  + pos.y * scaleY - 10) + 'px';   
  edgeTagPanel.style.zIndex = '9999';   
  edgeTagPanel.style.boxShadow = '0 4px 14px rgba(0,0,0,0.18)';   
  edgeTagPanel.style.display = 'flex';   
  edgeTagPanel.style.flexDirection = 'column';   
  edgeTagPanel.style.gap = '6px';   
  edgeTagPanel.style.padding = '8px';   
  edgeTagPanel.style.width = '190px';   
  edgeTagPanel.style.border = '1px solid var(--border2, #ccc7ba)';   
  edgeTagPanel.style.borderRadius = 'var(--radius-sm, 8px)';   
  edgeTagPanel.style.background = 'var(--surface, #faf9f6)';   
  const titleEl = document.createElement('div');   
  titleEl.textContent = `${a?.label ?? '?'} -> ${b?.label ?? '?'}`;   
  titleEl.style.cssText = 'font:600 10px "Geist Mono", ui-monospace, monospace; opacity:0.75; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';   
  const selStyle = `     
    font: 500 11px "Geist Mono", ui-monospace, monospace;     
    padding: 4px 6px; border-radius: 6px;     
    border: 1px solid var(--border2, #ccbac5);     
    background: var(--surface2, #f3f1ec); color: var(--text, #1c1a17);     
    cursor: pointer; outline: none;   
  `;   
  const selTipo = document.createElement('select');   
  selTipo.title = 'Tipo de relação (AOF)';   
  selTipo.style.cssText = selStyle;   
  const opts = [...TIPOS_AOF.map(t => [t, t])];   
  opts.forEach(([v, t]) => {     
    const opt = document.createElement('option');     
    opt.value = v; opt.textContent = t;     
    if ((edge.tipo || '') === v) opt.selected = true;     
    selTipo.appendChild(opt);   
  });   
  const inputManual = document.createElement('input');   
  inputManual.type = 'text';   
  inputManual.placeholder = 'Ou digite outro FOA';   
  inputManual.style.cssText = `     
    font: 500 11px "Geist Mono", ui-monospace, monospace;     
    padding: 4px 6px;      
    border-radius: 6px;     
    border: 1px solid var(--border2, #ccc7ba);     
    background: var(--bg-1, #ffffff);      
    color: var(--text-1, #1a1a1a);     
    outline: none;     
    width: 150px;   
  `;   
  const ehTipoPadrao = TIPOS_AOF.includes(edge.tipo);   
  if (!ehTipoPadrao && edge.tipo) {     
    inputManual.value = edge.tipo;     
    selTipo.value = '';   
  }
  selTipo.addEventListener('change', () => {     
    if (selTipo.value !== '') inputManual.value = '';   
  });   
  inputManual.addEventListener('input', () => {     
    if (inputManual.value.trim() !== '') selTipo.value = '';   
  });   
  const btnRow = document.createElement('div');   
  btnRow.style.display = 'flex';   
  btnRow.style.gap = '6px';   
  const okBtn = document.createElement('button');   
  okBtn.type = 'button';   
  okBtn.textContent = 'OK';   
  okBtn.style.cssText = `     
    flex: 1; font: 600 11px "Geist Mono", ui-monospace, monospace;     
    padding: 5px 6px; border-radius: 6px; border: none; cursor: pointer;     
    background: var(--accent, #6d1fc2); color: #fff;   
  `;   
  okBtn.addEventListener('click', () => commitEdgeEdit());   
  const cancelBtn = document.createElement('button');   
  cancelBtn.type = 'button';   
  cancelBtn.textContent = 'Cancelar';   
  cancelBtn.style.cssText = `     
    flex: 1; font: 500 11px "Geist Mono", ui-monospace, monospace;     
    padding: 5px 6px; border-radius: 6px; cursor: pointer;     
    border: 1px solid var(--border2, #ccc7ba);     
    background: var(--surface2, #f3f1ec); color: var(--text-2, #4a463e);   
  `;   
  cancelBtn.addEventListener('click', () => cancelEdgeEdit());   
  btnRow.appendChild(okBtn);   
  btnRow.appendChild(cancelBtn);   
  edgeTagPanel.appendChild(titleEl);   
  edgeTagPanel.appendChild(selTipo);   
  edgeTagPanel.appendChild(inputManual);   
  edgeTagPanel.appendChild(btnRow);   
  document.body.appendChild(edgeTagPanel);   
  edgeTagPanel._selTipo = selTipo;   
  edgeTagPanel._inputManual = inputManual;   
  selTipo.addEventListener('keydown', ev => {     
    if (ev.key === 'Enter')  { ev.preventDefault(); commitEdgeEdit(); }     
    if (ev.key === 'Escape') { ev.preventDefault(); cancelEdgeEdit(); }   
  });   
  selTipo.focus();   
  const outsideClickHandler = ev => {     
    if (!editingEdge) return;     
    if (edgeTagPanel?.contains(ev.target)) return;     
    commitEdgeEdit();   
  };   
  document.addEventListener('mousedown', outsideClickHandler, true);   
  edgeTagPanel._cleanup = () => document.removeEventListener('mousedown', outsideClickHandler, true); 
}

function commitEdgeEdit() {   
  if (!editingEdge) return;   
  if (edgeTagPanel) {     
    const manual = edgeTagPanel._inputManual?.value.trim();     
    const select = edgeTagPanel._selTipo.value;     
    editingEdge.tipo = manual || select || null;     
    editingEdge.tipoManual = true;   
  }
  edgeTagPanel?._cleanup?.();   
  edgeTagPanel?.remove();   
  edgeTagPanel = null;   
  editingEdge = null;   
  draw(); 
}

function cancelEdgeEdit() {   
  edgeTagPanel?._cleanup?.();   
  edgeTagPanel?.remove();   
  edgeTagPanel = null;   
  editingEdge = null;   
  draw(); 
}

function startNodeEdit(node) {   
  if (editingNode) commitNodeEdit();   
  if (editingEdge) cancelEdgeEdit();   
  editingNode = node;   
  const rect = canvas.getBoundingClientRect();   
  const scaleX = rect.width / W;   
  const scaleY = rect.height / H;   
  nodeEditInput = document.createElement('input');   
  nodeEditInput.type = 'text';   
  nodeEditInput.value = node.label;   
  nodeEditInput.style.position = 'fixed';   
  nodeEditInput.style.left = (rect.left + (node.x - node.w / 2) * scaleX) + 'px';   
  nodeEditInput.style.top  = (rect.top  + (node.y - node.h / 2) * scaleY) + 'px';   
  nodeEditInput.style.width = (node.w * scaleX) + 'px';   
  nodeEditInput.style.height = '26px';   
  nodeEditInput.style.font = '500 12px "Geist Mono", ui-monospace, monospace';   
  nodeEditInput.style.textAlign = 'center';   
  nodeEditInput.style.border = '2px solid ' + (GROUP_COLORS[node.group]?.stroke || '#888');   
  nodeEditInput.style.borderRadius = '4px';   
  nodeEditInput.style.background = GROUP_COLORS[node.group]?.fill || '#fff';   
  nodeEditInput.style.color = GROUP_COLORS[node.group]?.text || '#000';   
  nodeEditInput.style.outline = 'none';   
  nodeEditInput.style.padding = '0 4px';   
  nodeEditInput.style.boxSizing = 'border-box';   
  nodeEditInput.style.zIndex = '9999';   
  nodeEditInput.style.boxShadow = '0 2px 8px rgba(0,0,0,0.18)';   
  document.body.appendChild(nodeEditInput);   
  nodeEditInput.select();   
  nodeTagPanel = document.createElement('div');   
  nodeTagPanel.style.position = 'fixed';   
  nodeTagPanel.style.left = nodeEditInput.style.left;   
  nodeTagPanel.style.top  = (rect.top + (node.y - node.h / 2) * scaleY + 30) + 'px';   
  nodeTagPanel.style.zIndex = '9999';   
  nodeTagPanel.style.boxShadow = '0 4px 14px rgba(0,0,0,0.18)';   
  nodeTagPanel.style.display = 'flex';   
  nodeTagPanel.style.flexDirection = 'column';   
  nodeTagPanel.style.gap = '6px';   
  nodeTagPanel.style.padding = '8px';   
  nodeTagPanel.style.width = Math.max(node.w * scaleX, 170) + 'px';   
  nodeTagPanel.style.border = '1px solid var(--border2, #ccc7ba)';   
  nodeTagPanel.style.borderRadius = 'var(--radius-sm, 8px)';   
  nodeTagPanel.style.background = 'var(--surface, #faf9f6)';   
  const selectsRow = document.createElement('div');   
  selectsRow.style.display = 'flex';   
  selectsRow.style.gap = '6px';   
  const selStyle = `     
    flex: 1; font: 500 11px "Geist Mono", ui-monospace, monospace;     
    padding: 4px 6px; border-radius: 6px;     
    border: 1px solid var(--border2, #ccc7ba);     
    background: var(--surface2, #f3f1ec); color: var(--text, #1c1a17);     
    cursor: pointer; outline: none;   
  `;   
  const selNatureza = document.createElement('select');   
  selNatureza.title = 'Tag de natureza';   
  selNatureza.style.cssText = selStyle;   
  [['', 'Natureza'], ...NATUREZAS.map(n => [n, n])].forEach(([v, t]) => {     
    const opt = document.createElement('option');     
    opt.value = v; opt.textContent = t;     
    if (node.tagNatureza === v || (!node.tagNatureza && v === '')) opt.selected = true;     
    selNatureza.appendChild(opt);   
  });   
  const selCaminho = document.createElement('select');   
  selCaminho.title = 'Tag de caminho';   
  selCaminho.style.cssText = selStyle;   
  [['', 'Caminho'], ['positivo', 'positivo'], ['negativo', 'negativo'], ['ambos', 'ambos']].forEach(([v, t]) => {     
    const opt = document.createElement('option');     
    opt.value = v; opt.textContent = t;     
    if (node.tagCaminho === v || (!node.tagCaminho && v === '')) opt.selected = true;     
    selCaminho.appendChild(opt);   
  });   
  selectsRow.appendChild(selNatureza);   
  selectsRow.appendChild(selCaminho);   
  const btnRow = document.createElement('div');   
  btnRow.style.display = 'flex';   
  btnRow.style.gap = '6px';   
  const okBtn = document.createElement('button');   
  okBtn.type = 'button';   
  okBtn.textContent = 'OK';   
  okBtn.style.cssText = `     
    flex: 1; font: 600 11px "Geist Mono", ui-monospace, monospace;     
    padding: 5px 6px; border-radius: 6px; border: none; cursor: pointer;     
    background: var(--accent, #6d1fc2); color: #fff;   
  `;   
  okBtn.addEventListener('click', () => commitNodeEdit());   
  const cancelBtn = document.createElement('button');   
  cancelBtn.type = 'button';   
  cancelBtn.textContent = 'Cancelar';   
  cancelBtn.style.cssText = `     
    flex: 1; font: 500 11px "Geist Mono", ui-monospace, monospace;     
    padding: 5px 6px; border-radius: 6px; cursor: pointer;     
    border: 1px solid var(--border2, #ccc7ba);     
    background: var(--surface2, #f3f1ec); color: var(--text-2, #4a463e);   
  `;   
  cancelBtn.addEventListener('click', () => cancelNodeEdit());   
  btnRow.appendChild(okBtn);   
  btnRow.appendChild(cancelBtn);   
  nodeTagPanel.appendChild(selectsRow);   
  nodeTagPanel.appendChild(btnRow);   
  document.body.appendChild(nodeTagPanel);   
  nodeTagPanel._selNatureza = selNatureza;   
  nodeTagPanel._selCaminho = selCaminho;   
  nodeEditInput.addEventListener('keydown', e => {     
    if (e.key === 'Enter')  { e.preventDefault(); commitNodeEdit(); }     
    if (e.key === 'Escape') { e.preventDefault(); cancelNodeEdit(); }   
  });   
  [selNatureza, selCaminho].forEach(sel => {     
    sel.addEventListener('keydown', e => {       
      if (e.key === 'Enter')  { e.preventDefault(); commitNodeEdit(); }       
      if (e.key === 'Escape') { e.preventDefault(); cancelNodeEdit(); }     
    });   
  });   
  const outsideClickHandler = e => {     
    if (!editingNode) return;     
    if (nodeEditInput?.contains(e.target)) return;     
    if (nodeTagPanel?.contains(e.target)) return;     
    commitNodeEdit();   
  };   
  document.addEventListener('mousedown', outsideClickHandler, true);   
  nodeTagPanel._cleanup = () => document.removeEventListener('mousedown', outsideClickHandler, true); 
}

function commitNodeEdit() {   
  if (!editingNode || !nodeEditInput) return;   
  const newLabel = nodeEditInput.value.trim();   
  if (newLabel && newLabel !== editingNode.label) {     
    const oldLabel = editingNode.label;     
    editingNode.label = newLabel;     
    if (E.has(oldLabel)) {       
      E.delete(oldLabel);     
      E.add(newLabel);     
    }     
    if (G.has(oldLabel)) {       
      G.delete(oldLabel);     
      G.add(newLabel);     
    }     
    if (tempG.has(oldLabel)) {       
      tempG.delete(oldLabel);       
      tempG.add(newLabel);     
    }     
    const updatedPairs = new Set();     
    for (const pair of seenPairs) {       
      const parts = pair.split('|||');       
      const updated = parts.map(p => p === oldLabel ? newLabel : p).sort().join('|||');       
      updatedPairs.add(updated);     
    }     
    seenPairs = updatedPairs;   
  }
  if (nodeTagPanel) {     
    const novaNatureza = nodeTagPanel._selNatureza.value || null;     
    const novoCaminho  = nodeTagPanel._selCaminho.value || null;     
    editingNode.tagNatureza = novaNatureza;     
    editingNode.tagCaminho  = novoCaminho;     
    editingNode.tagCaminhoManual = !!novoCaminho;     
    reavaliarTiposDeArestas();     
    nodeTagPanel._cleanup?.();     
    nodeTagPanel.remove();     
    nodeTagPanel = null;   
  }
  nodeEditInput.remove();   
  nodeEditInput = null;   
  editingNode = null;   
  renderAuditPanel();   
  draw(); 
}

function cancelNodeEdit() {   
  if (nodeEditInput) { nodeEditInput.remove(); nodeEditInput = null; }   
  if (nodeTagPanel) { nodeTagPanel._cleanup?.(); nodeTagPanel.remove(); nodeTagPanel = null; }   
  editingNode = null;   
  draw(); 
}

canvas.addEventListener('dblclick', e => {   
  const p = getPos(e);   
  const node = nodeAt(p.x, p.y);   
  if (node) {     
    e.preventDefault();     
    startNodeEdit(node);     
    return;   
  }
  const edge = edgeAt(p.x, p.y);   
  if (edge) {     
    e.preventDefault();     
    startEdgeEdit(edge, p);   
  }
});

document.addEventListener('keydown', e => {   
  const tag = document.activeElement.tagName;   
  if ((e.key === 'Delete' || e.key === 'Backspace') && selected && tag !== 'INPUT') {     
    edges = edges.filter(ed => ed.from !== selected.id && ed.to !== selected.id);     
    nodes = nodes.filter(n => n.id !== selected.id);     
    selected = null;     
    startSim(); 
    renderAuditPanel(); 
    draw(); 
  }
});
