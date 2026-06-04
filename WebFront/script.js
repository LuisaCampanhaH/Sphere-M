// ── Fase 2 ── Modificação para permitir múltiplas palavras do meio ──

function confirmPair() {
  if (finished) return;
  const meioInput = document.getElementById('input-meio').value.trim();
  if (!meioInput) { advancePair(); return; }

  // Divide a entrada por vírgula e remove espaços
  const meioWords = meioInput.split(',').map(s => s.trim()).filter(Boolean);
  
  if (meioWords.length === 0) { advancePair(); return; }

  const [labelA, labelB] = GE[pairIdx];
  const nA = nodes.find(n => n.label === labelA);
  const nB = nodes.find(n => n.label === labelB);
  if (!nA || !nB) { advancePair(); return; }

  let gi = nA, ei = nB;
  if      (nA.linkedToCeiling && nB.linkedToFloor)    { gi = nA; ei = nB; }
  else if (nB.linkedToCeiling && nA.linkedToFloor)    { gi = nB; ei = nA; }
  else if (nB.linkedToCeiling && !nA.linkedToCeiling) { gi = nB; ei = nA; }
  else if (nA.linkedToFloor   && !nB.linkedToFloor)   { gi = nB; ei = nA; }

  // Remove aresta direta se existir
  if (edgeExists(gi.id, ei.id)) removeEdge(gi.id, ei.id);
  if (edgeExists(ei.id, gi.id)) removeEdge(ei.id, gi.id);

  // Para cada palavra do meio, cria um nó e as conexões
  for (const meio of meioWords) {
    let nm = findNode(meio);
    if (!nm) {
      // Posiciona entre os dois nós com um pequeno offset aleatório
      const mx = (gi.x + ei.x) / 2 + (Math.random() - 0.5) * 40;
      const my = (gi.y + ei.y) / 2 + (Math.random() - 0.5) * 40;
      nm = createNode(meio, 'meio', mx, my);
      tempG.add(meio);
      E.add(meio);
    }
    
    getOrCreateEdge(ei.id, nm.id);
    getOrCreateEdge(nm.id, gi.id);
  }

  // Mostra um feedback visual de quantas palavras foram adicionadas
  if (meioWords.length > 1) {
    const originalPlaceholder = document.getElementById('input-meio').placeholder;
    document.getElementById('input-meio').placeholder = `✓ ${meioWords.length} palavras adicionadas!`;
    setTimeout(() => {
      document.getElementById('input-meio').placeholder = originalPlaceholder;
    }, 1000);
  }

  advancePair();
}