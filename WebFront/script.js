const canvas = document.getElementById('graph-canvas');
const ctx = canvas.getContext('2d');
let W = canvas.parentElement.clientWidth || 800;
let H = canvas.parentElement.clientHeight || 600;
canvas.width = W;
canvas.height = H;
let sessionId = 0;

// Elementos do DOM consultados com frequência — resolvidos uma única vez
// (o <script> já roda no fim do <body>, então todos já existem no DOM).
const el = {
  inputMeio: document.getElementById('input-meio'),
  confirmBtn: document.getElementById('confirm-btn'),
  skipBtn: document.getElementById('skip-btn'),
  doneMsg: document.getElementById('done-msg'),
  completeMsg: document.getElementById('complete-msg'),
  stopBtn: document.getElementById('stop-btn'),
  pairPrompt: document.getElementById('pair-prompt'),
  finishedMsg: document.getElementById('finished-msg'),
  alreadyConnectedMsg: document.getElementById('already-connected-msg'),
  aiHint: document.getElementById('ai-hint'),
  phase1Panel: document.getElementById('phase1-panel'),
  phase2Panel: document.getElementById('phase2-panel'),
  inputTeto: document.getElementById('input-teto'),
  inputRel: document.getElementById('input-rel'),
  inputPiso: document.getElementById('input-piso'),
  progressBar: document.getElementById('progress-bar'),
  pairCounter: document.getElementById('pair-counter'),
  importJsonInput: document.getElementById('import-json-input'),
  metricsBtn: document.getElementById('metrics-btn'),
  metricsPanel: document.getElementById('metrics-panel'),
};

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

// Câmera do canvas (zoom/pan). node.x/node.y continuam em coordenadas de
// mundo — a física em simulateStep() nunca precisa saber que a câmera existe.
// camX/camY deslocam a origem, camScale escala tudo; draw() aplica os dois
// via ctx.translate/ctx.scale, e screenToWorld/worldToScreen convertem entre
// pixel do canvas e coordenada de mundo nos dois sentidos.
let camX = 0, camY = 0, camScale = 1;

function screenToWorld(x, y) {
  return { x: (x - camX) / camScale, y: (y - camY) / camScale };
}

function worldToScreen(x, y) {
  return { x: x * camScale + camX, y: y * camScale + camY };
}

// Estado do pan (arrastar com o botão do meio, ou espaço + botão esquerdo).
let isPanning = false;
let panStart = { x: 0, y: 0 };
let camStart = { x: 0, y: 0 };
let spacePressed = false;

function clientDeltaToCanvasDelta(dxClient, dyClient) {
  const rect = canvas.getBoundingClientRect();
  return { x: dxClient * (W / rect.width), y: dyClient * (H / rect.height) };
}

let E = new Set();
let G = new Set(); 
let tempG = new Set(); 
let GE = []; 
let seenPairs = new Set(); 
let pairIdx = 0; 
let round = 1; 
let finished = false; 
let pairsAccepted = 0;          
let pairsAccepted_modificados = 0;
let paresIaSim = 0;
let paresIaSimAceitos = 0;
let historicoPorRodada = [];
let rodadaEInicio = 0;
let paresAvaliadosRodada = 0;
let paresAceitosRodada = 0;
let _aiLastHasRelation = false;
let _aiJaContabilizado = false;

function _iniciarRodadaStats() {
  rodadaEInicio = E.size;
  paresAvaliadosRodada = 0;
  paresAceitosRodada = 0;
}
function _fecharRodadaStats() {
  historicoPorRodada.push({
    rodada: round,
    E_inicio: rodadaEInicio,
    pares_avaliados: paresAvaliadosRodada,
    pares_aceitos: paresAceitosRodada,
  });
}

const GROUP_COLORS = {
  teto: { fill: '#f3cebf', stroke: '#d13f05', text: '#7b280a' },
  piso: { fill: '#c0d0f2', stroke: '#0c51c0', text: '#0d3277' },
  relacionado: { fill: '#c0edd2', stroke: '#0d823a', text: '#0a5c29' },
  meio: { fill: '#dac2f5', stroke: '#710dd3', text: '#4c0e8b' }
};

function findNode(label) {
  return nodes.find(n => n.label.toLowerCase() === label.toLowerCase().trim());
}

function getNodeById(id) {
  return nodes.find(n => n.id === id);
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
    // Filtro visual (Alt+clique) — nunca lido por buildSessionExport(),
    // importSessionFromObject(), auditTags() ou qualquer coisa que vá pro
    // Python: some do desenho/física/clique, mas o nó continua no grafo.
    hidden: false,
    // true só quando `hidden` foi ligado pela poda automática (não por
    // Alt+clique direto) — usado só pro contador e pra saber o que a poda
    // pode desfazer no próximo recálculo.
    podado: false,
  };
  nodes.push(node);
  return node;
}

// Filtro visual de nós (Alt+clique pra esconder, botão "mostrar todos" pra
// reverter). Só mexe em nd.hidden — nunca em nodes/edges/E/G/seenPairs —
// então buildSessionExport(), importSessionFromObject() e auditTags()
// continuam vendo o grafo completo, sem exceção.
function esconderNo(node) {
  node.hidden = true;
  node.podado = false; // escondido por mim, não pela poda
  if (selected === node) selected = null;
  if (dragging === node) dragging = null;
  const idx = ctrlSelectedNodes.indexOf(node);
  if (idx > -1) ctrlSelectedNodes.splice(idx, 1);
  podarNosDoMeio();
}

// Alt+clique num nó já escondido reexibe só ele. Se ele tinha sido
// escondido manualmente, a poda recalcula sem ele no recálculo seguinte —
// o que só estava podado por causa dele volta junto (grau sobe de novo).
// Se ele mesmo era um nó podado, o recálculo tende a escondê-lo de novo na
// mesma hora (nada mudou nos vizinhos dele) — ver explicação em
// podarNosDoMeio().
function reexibirNo(node) {
  node.hidden = false;
  node.podado = false;
  podarNosDoMeio();
}

// Poda em cascata: some com nós do meio (nunca teto/piso/relacionado) que
// ficaram com grau ≤1 considerando só arestas entre nós visíveis — inclui
// grau 0 de propósito (nó do meio sem nenhuma ligação visível não passa
// informação nenhuma, ainda menos que um com 1 ligação).
//
// Recalcula do zero a cada chamada: primeiro desfaz toda poda anterior,
// depois refaz com o conjunto atual de nós escondidos manualmente. Isso
// evita ter que rastrear "quem foi podado por causa de quem" — se um nó
// escondido manualmente volta a aparecer, o que só estava podado por causa
// dele volta sozinho no recálculo, porque o grau dele sobe de novo.
//
// Não roda com seleção direta ativa (pathSelectedNodes) — nesse modo a
// visibilidade já é 100% controlada pela seleção; poda por grau não se
// aplica em cima disso.
function podarNosDoMeio() {
  if (pathSelectedNodes.length > 0) {
    atualizarBotaoEscondidos();
    draw();
    return;
  }
  nodes.forEach(nd => {
    if (nd.podado) { nd.hidden = false; nd.podado = false; }
  });

  const vizinhos = new Map(nodes.map(nd => [nd.id, []]));
  edges.forEach(e => {
    vizinhos.get(e.from)?.push(e.to);
    vizinhos.get(e.to)?.push(e.from);
  });

  let mudou = true;
  while (mudou) {
    mudou = false;
    for (const nd of nodes) {
      if (nd.hidden || nd.group !== 'meio') continue;
      const grauVisivel = vizinhos.get(nd.id).filter(id => !getNodeById(id).hidden).length;
      if (grauVisivel <= 1) {
        nd.hidden = true;
        nd.podado = true;
        mudou = true;
      }
    }
  }
  atualizarBotaoEscondidos();
  draw();
}

function contarNosEscondidos() {
  return nodes.filter(nd => nd.hidden).length;
}

function mostrarTodosOsNos() {
  nodes.forEach(nd => { nd.hidden = false; nd.podado = false; });
  pathSelectedNodes = [];
  avisoFiltroCaminho(null);
  atualizarStatusCaminho();
  atualizarBotaoEscondidos();
  draw();
}

function atualizarBotaoEscondidos() {
  const btn = document.getElementById('show-hidden-btn');
  const count = document.getElementById('hidden-count');
  if (!btn || !count) return;
  const manuais = nodes.filter(nd => nd.hidden && !nd.podado).length;
  const podados = nodes.filter(nd => nd.hidden && nd.podado).length;
  btn.style.display = (manuais + podados) > 0 ? 'flex' : 'none';
  count.textContent = podados > 0
    ? `${manuais} escondido${manuais === 1 ? '' : 's'}, ${podados} podado${podados === 1 ? '' : 's'}`
    : `${manuais}`;
}

// ── Seleção direta (Shift+clique, em ordem, em 1+ nós) ──
// Mostra só os nós escolhidos e as arestas entre eles (subgrafo induzido).
// Não calcula caminho — isso é opcional, via o botão "incluir nós que
// ligam" (reaproveita caminhoMaisCurto sob demanda). Reaproveita nd.hidden
// — mesma garantia de antes: só visual, nunca toca em
// nodes/edges/E/G/seenPairs, então métricas/exportação/importação
// continuam vendo o grafo completo.
let pathSelectedNodes = [];

function caminhoMaisCurto(startId, endId) {
  if (startId === endId) return [startId];
  // Adjacência não-direcionada (a busca ignora o sentido da aresta).
  // Vizinhos sempre ordenados por id crescente antes de explorar — é isso
  // que torna o desempate determinístico: havendo dois caminhos do mesmo
  // tamanho, o BFS sempre "trava" no mesmo primeiro encontrado, porque
  // sempre visita os vizinhos na mesma ordem pro mesmo grafo.
  const vizinhos = new Map();
  const addViz = (a, b) => {
    if (!vizinhos.has(a)) vizinhos.set(a, []);
    vizinhos.get(a).push(b);
  };
  edges.forEach(e => { addViz(e.from, e.to); addViz(e.to, e.from); });
  vizinhos.forEach(lista => lista.sort((a, b) => a - b));

  const visitado = new Set([startId]);
  const anterior = new Map();
  const fila = [startId];
  while (fila.length) {
    const atual = fila.shift();
    if (atual === endId) break;
    for (const viz of (vizinhos.get(atual) || [])) {
      if (!visitado.has(viz)) {
        visitado.add(viz);
        anterior.set(viz, atual);
        fila.push(viz);
      }
    }
  }
  if (!visitado.has(endId)) return null;
  const caminho = [endId];
  let cursor = endId;
  while (cursor !== startId) {
    cursor = anterior.get(cursor);
    caminho.push(cursor);
  }
  caminho.reverse();
  return caminho;
}

function avisoFiltroCaminho(texto) {
  const el = document.getElementById('path-filter-warning');
  if (!el) return;
  el.textContent = texto || '';
  el.style.display = texto ? 'flex' : 'none';
}

// Conexões do subgrafo induzido: arestas com as DUAS pontas selecionadas.
function contarConexoesVisiveis(idsSet) {
  return edges.filter(e => idsSet.has(e.from) && idsSet.has(e.to)).length;
}

function atualizarStatusCaminho() {
  const bar = document.getElementById('path-status');
  const texto = document.getElementById('path-status-text');
  const btnIncluir = document.getElementById('path-include-connectors-btn');
  if (!bar || !texto) return;
  if (!pathSelectedNodes.length) {
    bar.style.display = 'none';
    return;
  }
  bar.style.display = 'flex';
  const idsSet = new Set(pathSelectedNodes.map(nd => nd.id));
  const nSel = pathSelectedNodes.length;
  const nCon = contarConexoesVisiveis(idsSet);
  const txtSel = nSel === 1 ? '1 selecionado' : `${nSel} selecionados`;
  const txtCon = nCon === 1 ? '1 conexão visível' : `${nCon} conexões visíveis`;
  texto.textContent = `${txtSel}, ${txtCon}`;
  if (btnIncluir) btnIncluir.style.display = nSel >= 2 ? 'inline-flex' : 'none';
}

// Mostra só os nós selecionados (e as arestas entre eles) — sem calcular
// caminho nenhum. "Incluir nós que ligam" (abaixo) é o atalho opcional que
// usa caminhoMaisCurto pra completar a seleção sob demanda.
function aplicarSelecaoDireta() {
  if (!pathSelectedNodes.length) {
    nodes.forEach(nd => { nd.hidden = false; nd.podado = false; });
    avisoFiltroCaminho(null);
    atualizarBotaoEscondidos();
    draw();
    return;
  }
  // Seleção direta manda: nenhum nó fica "podado" enquanto ela estiver
  // ativa (ver podarNosDoMeio) — limpa a flag pra não sobrar estado velho
  // num nó que a seleção reexibiu.
  const idsSet = new Set(pathSelectedNodes.map(nd => nd.id));
  nodes.forEach(nd => { nd.hidden = !idsSet.has(nd.id); if (!nd.hidden) nd.podado = false; });
  if (pathSelectedNodes.length >= 2 && contarConexoesVisiveis(idsSet) === 0) {
    avisoFiltroCaminho('⚠ nenhuma conexão direta entre os nós selecionados — use "incluir nós que ligam".');
  } else {
    avisoFiltroCaminho(null);
  }
  atualizarBotaoEscondidos();
  draw();
}

// Atalho opcional: acrescenta à seleção os nós do caminho mais curto entre
// cada par consecutivo (mesma busca de antes, sob demanda). Tudo ou nada —
// se algum par não tiver caminho, nada é acrescentado.
function incluirNosQueLigam() {
  if (pathSelectedNodes.length < 2) return;
  const idsAcrescentar = [];
  for (let i = 0; i < pathSelectedNodes.length - 1; i++) {
    const a = pathSelectedNodes[i], b = pathSelectedNodes[i + 1];
    const trecho = caminhoMaisCurto(a.id, b.id);
    if (!trecho) {
      avisoFiltroCaminho(`⚠ Não há caminho entre "${a.label}" e "${b.label}" — nada foi acrescentado.`);
      return;
    }
    trecho.forEach(id => { if (!idsAcrescentar.includes(id)) idsAcrescentar.push(id); });
  }
  idsAcrescentar.forEach(id => {
    if (!pathSelectedNodes.some(nd => nd.id === id)) pathSelectedNodes.push(getNodeById(id));
  });
  atualizarStatusCaminho();
  aplicarSelecaoDireta();
}

function limparSelecaoCaminho() {
  pathSelectedNodes = [];
  atualizarStatusCaminho();
  mostrarTodosOsNos();
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
    const a = getNodeById(e.from);
    const b = getNodeById(e.to);
    const forcado = tipoRelacaoPorNatureza(a, b);
    if (forcado) e.tipo = forcado;   
  }); 
}

function getOrCreateEdge(idA, idB, tipoSugerido) {   
  const nodeA = getNodeById(idA);
  const nodeB = getNodeById(idB);
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
        const nd = getNodeById(nb);
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
        const nd = getNodeById(nb);
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
  const contadorEl = document.getElementById('tag-audit-count');
  if (contadorEl) contadorEl.textContent = totalMarcados ? ` · ${totalMarcados}` : '';
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
  // Nós escondidos (filtro visual, Alt+clique) ficam de fora da física
  // inteira — não empurram os visíveis, e ficam congelados na posição
  // onde estavam ao sumir.
  const visiveis = nodes.filter(nd => !nd.hidden);
  const n = visiveis.length;
  if (!n) return;
  visiveis.forEach(nd => { nd.fx = 0; nd.fy = 0; });
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = visiveis[i], b = visiveis[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
      const force = REPULSION / (dist * dist);
      const fx = (dx / dist) * force, fy = (dy / dist) * force;
      a.fx -= fx; a.fy -= fy; b.fx += fx; b.fy += fy;
    }
  }
  edges.forEach(e => {
    const a = getNodeById(e.from), b = getNodeById(e.to);
    if (!a || !b) return;
    if (a.hidden || b.hidden) return;
    const dx = b.x - a.x, dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
    const force = SPRING_K * (dist - SPRING_LEN);
    const fx = (dx / dist) * force, fy = (dy / dist) * force;
    a.fx += fx; a.fy += fy; b.fx -= fx; b.fy -= fy;
  });
  visiveis.forEach(nd => {
    const targetY = (GROUP_TARGET_Y[nd.group] ?? 0.5) * H;
    const yK = GROUP_Y_K[nd.group] ?? CENTER_K;
    nd.fy += (targetY - nd.y) * yK;
    const xK = GROUP_X_K[nd.group] ?? 0;
    nd.fx += (W / 2 - nd.x) * xK;
  });
  const meioNodes = visiveis.filter(nd => nd.group === 'meio');
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
  visiveis.forEach(nd => {
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

// Fora de draw() porque draw() roda a cada frame de animação — não usa
// nada do escopo de draw(), então não precisa ser recriada a cada chamada.
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

function draw() {
  clampNodesToCanvas();
  propagatePathTag();
  ctx.clearRect(0, 0, W, H);
  const cssVar = (name, fallback) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  const corPontosFundo  = cssVar('--canvas-dot', 'rgba(0,0,0,0.06)');
  const corArestaPadrao = cssVar('--edge-color-strong', 'rgba(0,0,0,0.55)');
  const corRotuloFundo  = cssVar('--surface', '#faf9f6');
  const corAccent       = cssVar('--accent', '#6d1fc2');
  ctx.fillStyle = corPontosFundo;
  for (let x = 30; x < W; x += 30)
    for (let y = 30; y < H; y += 30) {
      ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI * 2); ctx.fill();
    }
  // Câmera: tudo dentro deste save()/restore() é desenhado em coordenadas
  // de mundo (node.x/node.y) — a grade de pontos acima e a mensagem de
  // "sem nós" abaixo ficam de fora de propósito, fixas na tela.
  ctx.save();
  ctx.translate(camX, camY);
  ctx.scale(camScale, camScale);
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
  edges.forEach(e => {
    const a = getNodeById(e.from), b = getNodeById(e.to);
    if (!a || !b) return;
    if (a.hidden || b.hidden) return;
    ctx.save();
    const tagA = a.tagCaminho, tagB = b.tagCaminho;
    let edgeColor = corArestaPadrao;
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
      ctx.font = '700 11px "Geist Mono", ui-monospace, monospace';       
      const textW = ctx.measureText(e.tipo).width;       
      const padX = 5, padY = 3;       
      roundRect(midX - textW / 2 - padX, midY - 7.5 - padY, textW + padX * 2, 15 + padY * 2, 5);       
      ctx.fillStyle = corRotuloFundo;
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
    if (nd.hidden) return;
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
      ctx.strokeStyle = corAccent;
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }
    const ordemCaminho = pathSelectedNodes.indexOf(nd);
    if (ordemCaminho > -1) {
      ctx.save();
      roundRect(nx - 4, ny - 4, nw + 8, nh + 8, NODE_R + 4);
      ctx.strokeStyle = corAccent;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.restore();
      ctx.save();
      ctx.font = '700 9px "Geist Mono", ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = corAccent;
      ctx.fillText(String(ordemCaminho + 1), nd.x, ny - 8);
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
  ctx.restore(); // fecha o save() da câmera — daqui pra baixo é tela, não mundo
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
  const tetos = parseList(el.inputTeto.value);   
  const pisos = parseList(el.inputPiso.value);   
  const rels = parseList(el.inputRel.value);   
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
  atualizarBotaoEscondidos();
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
  _iniciarRodadaStats();
  el.phase1Panel.style.display = 'none';   
  el.phase2Panel.style.display = 'block';   
  updatePairUI();   
  startSim(400); 
});

function pathToString(startId, endId) {   
  if (startId === endId) return getNodeById(startId)?.label ?? '';
  const visited = new Set([startId]);   
  const queue = [[startId, [startId]]];   
  while (queue.length) {     
    const [cur, path] = queue.shift();     
    const neighbors = edges       
      .filter(e => e.from === cur || e.to === cur)       
      .map(e => e.from === cur ? e.to : e.from);     
    for (const nb of neighbors) {       
      if (nb === endId) {         
        return [...path, nb].map(id => getNodeById(id)?.label ?? '?').join('   ');
      }       
      if (!visited.has(nb)) { visited.add(nb); queue.push([nb, [...path, nb]]); }     
    }   
  }
  return null; 
}

let _aiCurrentPair = null; 
let _aiLastMeio = null; 
let _aiLastTipoAof = null; 

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
  el.aiHint.style.display = 'none'; 
}

function showAILoading() {   
  _setAIState('loading');   
  el.aiHint.style.display = 'none'; 
}

function showAIError() {   
  _setAIState('error');   
  el.aiHint.style.display = 'none'; 
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
    const texto = ordenado.join(' ');
    el.inputMeio.value = texto;
    _aiLastMeio = texto;
  }
}

function showAIResult(parsed) {   
  _setAIState('result');   
  _aiLastHasRelation = parsed.hasRelation;
if (!_aiJaContabilizado) {
  _aiJaContabilizado = true;
  if (parsed.hasRelation) paresIaSim++;
}
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
  const hintEl = el.aiHint;   
  const inputEl = el.inputMeio;   
  const meioLimpo = parsed.meio ? parsed.meio.replace(/\*+/g, '').trim() : null;
  _aiLastMeio = parsed.hasRelation ? meioLimpo : null;
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
    if (inputEl && !inputEl.classList.contains('is-extra')) inputEl.value = meioLimpo || ''; 
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
    el.pairPrompt.style.opacity = '0.4';     
    el.inputMeio.disabled = true;     
    el.confirmBtn.disabled = true;     
    el.skipBtn.disabled = true;     
    el.alreadyConnectedMsg.style.display = 'none';     
    el.pairCounter.textContent = 'Rodada ' + round + ' concluída!';     
    el.progressBar.style.width = '100%';     
    showAIIdle();     
    const complete = isGraphComplete();     
    if (complete) {       
      el.doneMsg.style.display = 'none';       
      el.completeMsg.style.display = 'block';     
    } else if (G.size > 0) {       
      GE = buildGE();       
      document.getElementById('round-num').textContent = round;       
      el.doneMsg.style.display = GE.length ? 'flex' : 'none';       
      el.completeMsg.style.display = GE.length ? 'none' : 'block';       
      if (!GE.length) GE = buildGEforContinue();     
    } else {       
      GE = buildGEforContinue();       
      el.doneMsg.style.display = 'none';       
      el.completeMsg.style.display = 'block';     
    }     
    startSim(60);     
    return;   
  }
  const [labelA, labelB] = GE[pairIdx];   
  _aiCurrentPair = [labelA, labelB];   
  document.getElementById('node-a-label').textContent = labelA;   
  document.getElementById('node-b-label').textContent = labelB;   
  el.pairCounter.textContent = `Par ${pairIdx + 1} de ${GE.length} (Rodada ${round})`;   
  el.progressBar.style.width = `${(pairIdx / GE.length) * 100}%`;   
  el.inputMeio.value = '';   
  el.inputMeio.disabled = true;      
  el.confirmBtn.disabled = true;   
  el.skipBtn.disabled = false;       
  el.doneMsg.style.display = 'none';   
  el.completeMsg.style.display = 'none';   
  el.finishedMsg.style.display = 'none';   
  el.pairPrompt.style.opacity = '1';   
  const na = nodes.find(n => n.label === labelA);   
  const nb = nodes.find(n => n.label === labelB);   
  const pathStr = (na && nb) ? pathToString(na.id, nb.id) : null;   
  const msgEl = el.alreadyConnectedMsg;   
  const pathEl = document.getElementById('already-connected-path');   
  const inputEl = el.inputMeio;   
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
  _aiJaContabilizado = false;
  showAILoading();   
  const currentSession = sessionId;   
  const aiText = await callAI(labelA, labelB);   
  if (finished || sessionId !== currentSession) return;   
  if (aiText === null) {
    showAIError();
    el.inputMeio.disabled = false;
    el.confirmBtn.disabled = false;
    el.skipBtn.disabled = false;
    return;
  }
  try {
    showAIResult(parseAIResponse(aiText));
  } catch (err) {
    showAIError();
    el.inputMeio.disabled = false;
    el.confirmBtn.disabled = false;
    el.skipBtn.disabled = false;
    return;
  }
  el.inputMeio.disabled = false;
  el.confirmBtn.disabled = false;
  el.inputMeio.focus();
}

// Fluxo Teto -> Meio -> Piso
function confirmPair() {   
  if (finished) return;   
  const raw = el.inputMeio?.value.trim();   
  if (!raw) { advancePair(); return; }   
  const humanoModificou = _aiLastMeio === null || raw !== _aiLastMeio;
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

  pairsAccepted++;
  if (humanoModificou) pairsAccepted_modificados++;
  paresAceitosRodada++;
  if (_aiLastHasRelation) paresIaSimAceitos++;

  _aiLastTipoAof = null;   
  advancePair(); 
}

function advancePair() {   
  if (finished) return;  
  if (pairIdx < GE.length) paresAvaliadosRodada++;    
  pairIdx++;   
  updatePairUI();   
  startSim(300); 
}

function _avancarRodada({ rebuildGE = false } = {}) {
  if (finished) return;
  _fecharRodadaStats();
  round++;
  if (rebuildGE) GE = buildGEforContinue();
  pairIdx = 0;
  _iniciarRodadaStats();
  el.doneMsg.style.display = 'none';
  el.completeMsg.style.display = 'none';
  el.pairPrompt.style.opacity = '1';
  el.inputMeio.disabled = false;
  el.confirmBtn.disabled = false;
  el.skipBtn.disabled = false;
  el.stopBtn.disabled = false;
  updatePairUI();
  startSim(300);
}

function startNextRound() {
  _avancarRodada({ rebuildGE: false });
}

function continueLoop() {
  _avancarRodada({ rebuildGE: true });
}

function finishLoop() {   
   _fecharRodadaStats();
  executePoda();      
  finished = true;   
  nodes.forEach(n => { n.highlight = false; n.pulse = 0; });   
  el.pairPrompt.style.opacity = '0.4';   
  el.inputMeio.disabled = true;   
  el.confirmBtn.disabled = true;   
  el.skipBtn.disabled = true;   
  el.stopBtn.disabled = true;   
  el.doneMsg.style.display = 'none';   
  el.completeMsg.style.display = 'none';   
  el.alreadyConnectedMsg.style.display = 'none';   
  el.finishedMsg.style.display = 'flex';   
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

el.confirmBtn.addEventListener('click', confirmPair); 
el.skipBtn.addEventListener('click', advancePair); 
el.stopBtn.addEventListener('click', finishLoop); 
document.getElementById('finish-btn').addEventListener('click', finishLoop); 
document.getElementById('next-round-btn').addEventListener('click', startNextRound); 
document.getElementById('continue-btn').addEventListener('click', continueLoop); 
document.getElementById('ai-retry-btn').addEventListener('click', async () => {   
  if (!_aiCurrentPair) return;   
  const [labelA, labelB] = _aiCurrentPair;   
  showAILoading();   
  el.inputMeio.disabled = true;   
  el.confirmBtn.disabled = true;   
  const aiText = await callAI(labelA, labelB);
  if (aiText === null) {
    showAIError();
    el.inputMeio.disabled = false;
    el.confirmBtn.disabled = false;
    return;
  }
  try {
    showAIResult(parseAIResponse(aiText));
    el.inputMeio.disabled = false;
    el.confirmBtn.disabled = false;
    el.inputMeio.focus();
  } catch (err) {
    showAIError();
    el.inputMeio.disabled = false;
    el.confirmBtn.disabled = false;
  }
});

el.inputMeio.addEventListener('keydown', e => {   
  if (e.key === 'Enter') confirmPair();   
  if (e.key === 'Escape') advancePair(); 
});

function resetAll() {   
  sessionId++;   
  nodes = []; edges = []; selected = null; nextId = 0;   
  E = new Set(); G = new Set(); tempG = new Set();   
  GE = []; seenPairs = new Set(); pairIdx = 0; round = 1; finished = false;   
  ctrlSelectedNodes = [];  
  pairsAccepted = 0;               
  pairsAccepted_modificados = 0;  
  paresIaSim = 0;
  paresIaSimAceitos = 0;
  historicoPorRodada = [];
  rodadaEInicio = 0;
  paresAvaliadosRodada = 0;
  paresAceitosRodada = 0;
  _aiLastHasRelation = false;
  _aiJaContabilizado = false;
  if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }   
  el.phase1Panel.style.display = 'block';   
  el.phase2Panel.style.display = 'none';   
  el.finishedMsg.style.display = 'none';   
  el.completeMsg.style.display = 'none';   
  el.doneMsg.style.display = 'none';   
  el.stopBtn.disabled = false;   
  el.inputTeto.value = '';   
  el.inputPiso.value = '';   
  el.inputRel.value = '';
  renderAuditPanel();
  atualizarBotaoEscondidos();
  draw();
}

document.getElementById('reset-btn').addEventListener('click', resetAll);
document.getElementById('reset-btn2').addEventListener('click', resetAll);

// ── Painel de "mais opções" (legenda, auditoria, ponte com Python, métricas) ──
(function () {
  const btn = document.getElementById('more-options-btn');
  const overlay = document.getElementById('more-options-overlay');
  const panel = document.getElementById('more-options-panel');
  const closeBtn = document.getElementById('more-options-close');
  if (!btn || !overlay || !panel) return;

  function abrir() {
    overlay.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
  }
  function fechar() {
    overlay.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
  }

  btn.addEventListener('click', () => {
    overlay.classList.contains('open') ? fechar() : abrir();
  });
  closeBtn?.addEventListener('click', fechar);
  overlay.addEventListener('mousedown', e => {
    if (!panel.contains(e.target)) fechar();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) fechar();
  });
})();

(function () {
  const sections = [
    { id: 'legend', toggleId: 'legend-toggle', storageKey: 'sphere-legend-collapsed' },     
    { id: 'tag-audit', toggleId: 'tag-audit-toggle', storageKey: 'sphere-tag-audit-collapsed' },     
    { id: 'export-section', toggleId: 'export-toggle', storageKey: 'sphere-export-collapsed' },
    { id: 'metrics-hint-section', toggleId: 'metrics-hint-toggle', storageKey: 'sphere-metrics-hint-collapsed' },
    { id: 'export-hint-section', toggleId: 'export-hint-toggle', storageKey: 'sphere-export-hint-collapsed' },
    { id: 'import-hint-section', toggleId: 'import-hint-toggle', storageKey: 'sphere-import-hint-collapsed' },
  ];
  sections.forEach(({ id, toggleId, storageKey }) => {     
    const section = document.getElementById(id);     
    const toggleBtn = document.getElementById(toggleId);     
    if (!section || !toggleBtn) return;
    // Recolhida por padrão (só fica aberta se o usuário já expandiu antes).
    const collapsed = localStorage.getItem(storageKey) !== '0';
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
  // O ícone fica fixo (🏷️, definido no HTML) — só o estado visual (opacidade,
  // via aria-pressed no CSS) e o title mudam. Antes o texto "Mostrar"/"Ocultar"
  // substituía o ícone e estourava a largura fixa do círculo do botão.
  function applyState() {
    if (btn) btn.setAttribute('aria-pressed', showEdgeLabels ? 'true' : 'false');
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

document.getElementById('reset-view-btn')?.addEventListener('click', () => {
  camX = 0;
  camY = 0;
  camScale = 1;
  draw();
});

document.getElementById('show-hidden-btn')?.addEventListener('click', mostrarTodosOsNos);
document.getElementById('path-status-clear')?.addEventListener('click', limparSelecaoCaminho);
document.getElementById('path-include-connectors-btn')?.addEventListener('click', incluirNosQueLigam);

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
      edges: edges.map(e => ({ from: e.from, to: e.to, tipoAof: e.tipo || null })),  
      paresAvaliados: [...seenPairs],
      paresIaSim,
      paresIaSimAceitos,
      paresAceitos: pairsAccepted,
      paresAceitosModificados: pairsAccepted_modificados,
      historicoPorRodada: finished
      ? historicoPorRodada
      : [...historicoPorRodada, {
      rodada: round,
      E_inicio: rodadaEInicio,
      pares_avaliados: paresAvaliadosRodada,
      pares_aceitos: paresAceitosRodada,
    }],   
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

// ── Métricas — chama o servidor Python local (server.py), sem recalcular nada aqui ──

const METRICS_API_URL = 'http://localhost:5001/metricas';

function formatarMetrica(v) {
  return (v === null || v === undefined) ? 'n/a' : v;
}

function renderMetricsPanel(m) {
  const linhas = [
    ['Estado da esfera', m.esfera_fechada ? 'FECHADA' : 'aberta'],
    ['Nós na esfera', m.total_elementos],
    ['Iterações', m.num_iteracoes],
    ['Raio', formatarMetrica(m.raio)],
    ['Densidade', m.densidade],
    ['Produtividade', formatarMetrica(m.produtividade)],
    ['Cobertura global', m.cobertura_global],
    ['α_IA', formatarMetrica(m.alpha_ia)],
    ['α_domínio', formatarMetrica(m.alpha_dominio)],
    ['τ_HITL', formatarMetrica(m.tau_hitl)],
    ['τ_IA', formatarMetrica(m.tau_ia)],
    ['Delta', formatarMetrica(m.delta)],
  ];
  el.metricsPanel.innerHTML = linhas
    .map(([label, valor]) => `<div class="audit-row"><span>${label}</span><b>${valor}</b></div>`)
    .join('');
}

function renderMetricsError(mensagem) {
  el.metricsPanel.innerHTML = `<div class="metrics-error">${mensagem}</div>`;
}

async function calcularMetricas() {
  el.metricsBtn.disabled = true;
  el.metricsPanel.innerHTML = `<div class="audit-empty">calculando…</div>`;
  const payload = buildSessionExport();
  try {
    const resp = await fetch(METRICS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await resp.json();
    if (!resp.ok) {
      renderMetricsError(data.erro || 'Erro ao calcular as métricas.');
      return;
    }
    renderMetricsPanel(data);
  } catch (err) {
    renderMetricsError(
      'Não consegui falar com o servidor de métricas — ele está rodando? ' +
      '(<code>python "Python code/server.py"</code>, porta 5001)'
    );
  } finally {
    el.metricsBtn.disabled = false;
  }
}

el.metricsBtn.addEventListener('click', calcularMetricas);

// ── Importação de sessão (JSON) — drag-and-drop no canvas ou botão ──

function resetImportState() {
  nodes = []; edges = []; selected = null; dragging = null; nextId = 0;
  ctrlSelectedNodes = [];
  E = new Set(); G = new Set(); tempG = new Set(); GE = []; seenPairs = new Set();
  // Zera os contadores de IA/HITL usados pelas métricas — sem isso, uma
  // sessão importada herdaria valores de qualquer sessão anterior aberta
  // nesta aba, em vez de refletir só o que está no arquivo importado.
  pairsAccepted = 0;
  pairsAccepted_modificados = 0;
  paresIaSim = 0;
  paresIaSimAceitos = 0;
  historicoPorRodada = [];
  if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
  sessionId++;
  atualizarBotaoEscondidos();
}

function importSessionFromObject(raw) {
  const data = (raw && raw.sphereM) ? raw.sphereM : raw;   
  if (!data || !Array.isArray(data.nodes)) {     
    alert('JSON inválido: não encontrei "nodes" no formato esperado (sphereM.nodes).');     
    return false;   
  }
  
  resetImportState();   
  
  const idMap = new Map();   
  data.nodes.forEach(n => {     
    const group = ['teto', 'piso', 'relacionado', 'meio'].includes(n.group) ? n.group : 'relacionado';     
    const node = createNode(String(n.label ?? ''), group);     
    node.tagNatureza = n.tagNatureza || null;     
    const tagCaminho = n.tagCaminho || null;     
    node.tagCaminho = tagCaminho;     
    // Só tratamos positivo/negativo como "semente manual" — "ambos" é sempre
    // recalculado por propagação (mesma regra usada durante a sessão original).     
    node.tagCaminhoManual = tagCaminho === 'positivo' || tagCaminho === 'negativo';     
    if (n.id !== undefined) idMap.set(n.id, node);   
  });   
  
  (data.edges || []).forEach(e => {     
    const a = idMap.get(e.from);     
    const b = idMap.get(e.to);     
    if (!a || !b) return;     
    const tipo = e.tipoAof || null;     
    edges.push({ from: a.id, to: b.id, tipo, tipoManual: !!tipo, showFOA: false });   
  });   
  
  nodes.forEach(nd => {     
    if (nd.group === 'teto') nd.linkedToCeiling = true;     
    if (nd.group === 'piso') nd.linkedToFloor = true;     
    if (nd.group !== 'meio') { E.add(nd.label); G.add(nd.label); }     
    const targetY = (GROUP_TARGET_Y[nd.group] ?? 0.5) * H;     
    nd.x = W / 2 + (Math.random() - 0.5) * W * 0.5;     
    nd.y = targetY + (Math.random() - 0.5) * 40;     
    nd.vx = 0; nd.vy = 0;   
  });   
  propagateMarks();   
  
  // Marca como "já perguntados" os pares que já chegaram a uma conexão via nó
  // do meio (teto -> meio -> piso), pra não repetir esses pares se a rodada continuar.
  // Obs.: pares que foram "pulados" sem gerar conexão não ficam no .json, então
  // não tem como recuperar esse histórico — só o que virou aresta.   
  nodes.filter(nd => nd.group === 'meio').forEach(meio => {
    const gis = edges.filter(e => e.to === meio.id).map(e => getNodeById(e.from)?.label).filter(Boolean);
    const eis = edges.filter(e => e.from === meio.id).map(e => getNodeById(e.to)?.label).filter(Boolean);
    gis.forEach(gi => eis.forEach(ei => {
      if (gi === ei) return;
      seenPairs.add([gi, ei].sort().join('|||'));
    }));
  });

  // Restaura do próprio arquivo os pares avaliados de verdade (inclui pares
  // pulados/rejeitados, que a heurística acima não enxerga) e os contadores
  // de IA/HITL — sem isso, as métricas calculadas depois do import misturam
  // dados reais do arquivo com o que sobrou de uma sessão anterior no navegador.
  if (Array.isArray(data.paresAvaliados)) {
    data.paresAvaliados.forEach(p => seenPairs.add(p));
  }
  pairsAccepted = Number(data.paresAceitos) || 0;
  pairsAccepted_modificados = Number(data.paresAceitosModificados) || 0;
  paresIaSim = Number(data.paresIaSim) || 0;
  paresIaSimAceitos = Number(data.paresIaSimAceitos) || 0;
  historicoPorRodada = Array.isArray(data.historicoPorRodada) ? data.historicoPorRodada : [];

  round = Number(data.round) > 0 ? Number(data.round) : 1;   
  finished = !!data.finished;   
  
  const domain = data.domain || {};   
  el.inputTeto.value = (domain.ceiling || nodes.filter(n => n.group === 'teto').map(n => n.label)).join(', ');   
  el.inputPiso.value = (domain.floor || nodes.filter(n => n.group === 'piso').map(n => n.label)).join(', ');   
  el.inputRel.value = (domain.relevant || nodes.filter(n => n.group === 'relacionado').map(n => n.label)).join(', ');   
  
  el.phase1Panel.style.display = 'none';   
  el.phase2Panel.style.display = 'block';   
  el.stopBtn.disabled = false;   
  
  if (finished) {     
    nodes.forEach(n => { n.highlight = false; n.pulse = 0; });     
    el.pairPrompt.style.opacity = '0.4';     
    el.inputMeio.disabled = true;     
    el.confirmBtn.disabled = true;     
    el.skipBtn.disabled = true;     
    el.stopBtn.disabled = true;     
    el.doneMsg.style.display = 'none';     
    el.completeMsg.style.display = 'none';     
    el.alreadyConnectedMsg.style.display = 'none';     
    el.finishedMsg.style.display = 'flex';   
  } else {
    el.finishedMsg.style.display = 'none';
    GE = buildGE();
    pairIdx = 0;
    _iniciarRodadaStats();
    updatePairUI();
  }
  
  renderAuditPanel();   
  startSim(400);   
  return true; 
}

function parseAndImportFile(file) {   
  if (!file) return;   
  const reader = new FileReader();   
  reader.onload = () => {     
    let data;     
    try {       
      data = JSON.parse(reader.result);     
    } catch (err) {       
      alert('Não consegui ler esse arquivo como JSON.');       
      return;     
    }     
    importSessionFromObject(data);   
  };   
  reader.onerror = () => alert('Falha ao ler o arquivo.');   
  reader.readAsText(file); 
}

document.getElementById('import-json-btn').addEventListener('click', () => {   
  el.importJsonInput.click(); 
}); 
el.importJsonInput.addEventListener('change', (e) => {   
  const file = e.target.files && e.target.files[0];   
  parseAndImportFile(file);   
  e.target.value = ''; 
});

(function () {   
  const wrap = document.getElementById('canvas-wrap');   
  if (!wrap) return;   
  let dragCounter = 0;   
  wrap.addEventListener('dragover', (e) => {     
    e.preventDefault();     
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';   
  });   
  wrap.addEventListener('dragenter', (e) => {     
    e.preventDefault();     
    dragCounter++;     
    wrap.classList.add('dropzone-active');   
  });   
  wrap.addEventListener('dragleave', () => {     
    dragCounter = Math.max(0, dragCounter - 1);     
    if (dragCounter === 0) wrap.classList.remove('dropzone-active');   
  });   
  wrap.addEventListener('drop', (e) => {     
    e.preventDefault();     
    dragCounter = 0;     
    wrap.classList.remove('dropzone-active');     
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];     
    parseAndImportFile(file);   
  }); 
})();

// Mouse (Nova lógica do Ctrl + Click)
function nodeAt(x, y, includeHidden) {
  return nodes.slice().reverse().find(nd => {
    if (nd.hidden && !includeHidden) return false;
    const hw = (nd.w || 64) / 2;
    const hh = (nd.h || 30) / 2;
    return Math.abs(x - nd.x) <= hw && Math.abs(y - nd.y) <= hh;
  });
}

function clientToCanvas(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (W / rect.width),
    y: (e.clientY - rect.top) * (H / rect.height),
  };
}

function getPos(e) {
  const { x, y } = clientToCanvas(e);
  return screenToWorld(x, y);
}

// Zoom com o scroll do mouse, ancorado no cursor: o ponto de mundo sob o
// cursor fica parado na tela, o resto escala ao redor dele.
const ZOOM_MIN = 0.2, ZOOM_MAX = 3;

canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const { x: canvasX, y: canvasY } = clientToCanvas(e);
  const worldSobCursor = screenToWorld(canvasX, canvasY);
  const fator = Math.exp(-e.deltaY * 0.001);
  camScale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, camScale * fator));
  camX = canvasX - worldSobCursor.x * camScale;
  camY = canvasY - worldSobCursor.y * camScale;
  draw();
}, { passive: false });

// Espaço + arrastar também faz pan (além do botão do meio) — cobre quem
// não tem botão do meio disponível (ex: trackpad). Não ativa se o foco
// estiver num campo de texto, pra não atrapalhar quem está digitando.
document.addEventListener('keydown', e => {
  if (e.code !== 'Space' || spacePressed) return;
  const tag = document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  spacePressed = true;
  e.preventDefault();
  if (!isPanning) canvas.style.cursor = 'grab';
});

document.addEventListener('keyup', e => {
  if (e.code !== 'Space') return;
  spacePressed = false;
  if (!isPanning) canvas.style.cursor = 'default';
});

function startPan(e) {
  isPanning = true;
  panStart = { x: e.clientX, y: e.clientY };
  camStart = { x: camX, y: camY };
  canvas.style.cursor = 'grabbing';
}

canvas.addEventListener('mousedown', e => {
  if (e.button === 1 || (e.button === 0 && spacePressed)) {
    e.preventDefault();
    startPan(e);
    return;
  }
  const p = getPos(e), node = nodeAt(p.x, p.y);
  if (e.altKey) {
    // Nó escondido não é desenhado, então o clique também precisa
    // considerar nós escondidos aqui — sem isso não dá pra reexibir um só.
    const alvo = node || nodeAt(p.x, p.y, true);
    if (alvo) {
      if (alvo.hidden) reexibirNo(alvo);
      else esconderNo(alvo);
    }
    return;
  }
  if (e.shiftKey) {
    // Depois do 1º nó, a seleção já escondeu tudo que não está nela —
    // inclusive o próximo nó que o usuário ainda quer escolher. Por isso,
    // aqui (e só aqui) a busca também considera nós escondidos: sem isso,
    // seria impossível selecionar um nó que não estivesse visível.
    const alvo = node || nodeAt(p.x, p.y, true);
    if (alvo) {
      const idxCaminho = pathSelectedNodes.indexOf(alvo);
      if (idxCaminho > -1) {
        // Clicar de novo num nó já escolhido "rebobina" a seleção até ele —
        // dá pra corrigir sem precisar limpar tudo e recomeçar.
        pathSelectedNodes.splice(idxCaminho);
      } else {
        pathSelectedNodes.push(alvo);
      }
      atualizarStatusCaminho();
      aplicarSelecaoDireta();
    }
    return;
  }
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
  if (isPanning) {
    const delta = clientDeltaToCanvasDelta(e.clientX - panStart.x, e.clientY - panStart.y);
    camX = camStart.x + delta.x;
    camY = camStart.y + delta.y;
    draw();
    return;
  }
  const p = getPos(e);
  if (dragging) {
    dragging.x = Math.max(dragging.w / 2 + 4, Math.min(W - dragging.w / 2 - 4, p.x - dragOff.x));
    dragging.y = Math.max(dragging.h / 2 + 4, Math.min(H - dragging.h / 2 - 4, p.y - dragOff.y));
  } else {
    const hoveredNode = nodeAt(p.x, p.y);
    if (hoveredNode) canvas.style.cursor = 'grab';
    else canvas.style.cursor = edgeAt(p.x, p.y) ? 'pointer' : (spacePressed ? 'grab' : 'default');
  }
});

canvas.addEventListener('mouseup', () => {
  if (isPanning) {
    isPanning = false;
    canvas.style.cursor = spacePressed ? 'grab' : 'default';
    return;
  }
  if (dragging) {
    dragging.vx = 0; dragging.vy = 0;
    dragging.fixed = true;
  }
  dragging = null;
  canvas.style.cursor = 'default';
  startSim();
});

canvas.addEventListener('mouseleave', () => {
  dragging = null;
  if (isPanning) {
    isPanning = false;
    canvas.style.cursor = spacePressed ? 'grab' : 'default';
  }
});

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
    const a = getNodeById(e.from), b = getNodeById(e.to);
    if (!a || !b) return;
    if (a.hidden || b.hidden) return;
    const d = distToSegment(x, y, a.x, a.y, b.x, b.y);
    if (d < bestDist) { bestDist = d; best = e; }
  });
  return best; 
}

let editingEdge = null; 
let edgeAofSelect = null; 
let edgeTagPanel = null; 

// Helpers reaproveitados pelos painéis flutuantes de edição (aresta e nó).
function criarPainelFlutuante(left, top, width) {
  const panel = document.createElement('div');
  panel.style.position = 'fixed';
  panel.style.left = left + 'px';
  panel.style.top  = top + 'px';
  panel.style.zIndex = '9999';
  panel.style.boxShadow = '0 4px 14px rgba(0,0,0,0.18)';
  panel.style.display = 'flex';
  panel.style.flexDirection = 'column';
  panel.style.gap = '6px';
  panel.style.padding = '8px';
  panel.style.width = width + 'px';
  panel.style.border = '1px solid var(--border2, #ccc7ba)';
  panel.style.borderRadius = 'var(--radius-sm, 8px)';
  panel.style.background = 'var(--surface, #faf9f6)';
  return panel;
}

function criarBotoesOkCancelar(onOk, onCancel) {
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
  okBtn.addEventListener('click', onOk);
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.textContent = 'Cancelar';
  cancelBtn.style.cssText = `
    flex: 1; font: 500 11px "Geist Mono", ui-monospace, monospace;
    padding: 5px 6px; border-radius: 6px; cursor: pointer;
    border: 1px solid var(--border2, #ccc7ba);
    background: var(--surface2, #f3f1ec); color: var(--text-2, #4a463e);
  `;
  cancelBtn.addEventListener('click', onCancel);
  btnRow.appendChild(okBtn);
  btnRow.appendChild(cancelBtn);
  return btnRow;
}

function registrarFechamentoAoClicarFora(estaAtivo, obterElementos, onFechar) {
  const handler = ev => {
    if (!estaAtivo()) return;
    if (obterElementos().some(el => el?.contains(ev.target))) return;
    onFechar();
  };
  document.addEventListener('mousedown', handler, true);
  return () => document.removeEventListener('mousedown', handler, true);
}

function startEdgeEdit(edge, pos) {
  if (editingNode) commitNodeEdit();
  if (editingEdge) commitEdgeEdit();
  editingEdge = edge;
  const rect = canvas.getBoundingClientRect();
  const scaleX = rect.width / W;
  const scaleY = rect.height / H;
  const posTela = worldToScreen(pos.x, pos.y);
  const a = getNodeById(edge.from), b = getNodeById(edge.to);
  edgeTagPanel = criarPainelFlutuante(
    rect.left + posTela.x * scaleX - 90,
    rect.top  + posTela.y * scaleY - 10,
    190
  );
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
  TIPOS_AOF.forEach(tipo => {
    const opt = document.createElement('option');
    opt.value = tipo; opt.textContent = tipo;
    if ((edge.tipo || '') === tipo) opt.selected = true;
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
  const btnRow = criarBotoesOkCancelar(() => commitEdgeEdit(), () => cancelEdgeEdit());
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
  edgeTagPanel._cleanup = registrarFechamentoAoClicarFora(
    () => !!editingEdge,
    () => [edgeTagPanel],
    () => commitEdgeEdit()
  );
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
  const topLeft = worldToScreen(node.x - node.w / 2, node.y - node.h / 2);
  nodeEditInput = document.createElement('input');
  nodeEditInput.type = 'text';
  nodeEditInput.value = node.label;
  nodeEditInput.style.position = 'fixed';
  nodeEditInput.style.left = (rect.left + topLeft.x * scaleX) + 'px';
  nodeEditInput.style.top  = (rect.top  + topLeft.y * scaleY) + 'px';
  nodeEditInput.style.width = (node.w * camScale * scaleX) + 'px';
  nodeEditInput.style.height = (26 * camScale) + 'px';
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
  nodeTagPanel = criarPainelFlutuante(
    rect.left + topLeft.x * scaleX,
    rect.top  + topLeft.y * scaleY + 30,
    Math.max(node.w * camScale * scaleX, 170)
  );
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
  const btnRow = criarBotoesOkCancelar(() => commitNodeEdit(), () => cancelNodeEdit());
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
  nodeTagPanel._cleanup = registrarFechamentoAoClicarFora(
    () => !!editingNode,
    () => [nodeEditInput, nodeTagPanel],
    () => commitNodeEdit()
  );
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
