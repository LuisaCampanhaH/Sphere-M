"""
metricas.py
-----------
Camada única de cálculo de métricas do Sphere-M Remastered.

Reúne, num só lugar:
  - as 5 métricas herdadas do artigo original (Sphere-M, 2012);
  - a métrica adaptada (Eficiência -> Cobertura x Taxa de Aceitação),
    necessária porque a IA generativa separou "testar um par" de
    "confirmar uma relação" — a fórmula antiga tratava as duas coisas
    como uma coisa só; Cobertura agora calculada por rodada (denominador fixo no
    início de cada rodada, não no momento da leitura);
  - decomposição de α em α_IA e α_domínio, separando precisão da IA
    de riqueza do domínio;
  - τ_HITL e τ_IA, que medem contribuição real do especialista humano
    versus autonomia da IA no processo de captura;
  - Delta, calculada em cima de dado que o grafo já carrega
    (tagCaminho), mas que nenhuma das duas versões do método
    formalizava.

Nada aqui decide "quando parar" — Densidade continua sendo o único
critério de parada do método (ver Grafo.Todos_Conectados()). As
métricas deste módulo são só leitura/diagnóstico, podem ser chamadas
a qualquer momento, com a esfera aberta ou fechada.
"""

"""Dados extras que o Grafo precisa registrar para as métricas novas:
  - grafo.pares_avaliados        : set de pares (str, str) avaliados
  - grafo.pares_ia_sim           : int — pares onde IA disse SIM
  - grafo.pares_ia_sim_aceitos   : int — IA disse SIM e humano confirmou
  - grafo.pares_aceitos_modificados : int — aceitos com meio alterado
    pelo humano em relação à sugestão da IA
  - grafo.historico_por_rodada   : list[dict] com chaves:
      {
        "rodada": int,
        "E_inicio": int,          # |E| no início da rodada
        "pares_avaliados": int,   # pares testados nesta rodada
        "pares_aceitos": int,     # pares confirmados nesta rodada
      }
"""

from dataclasses import dataclass, field

# ── Diagnóstico da decomposição de α ──────────────────────────────────
# Retornado junto com as métricas para facilitar interpretação.
 
@dataclass
class DiagnosticoAlpha:
    alpha_ia: float | None        # precisão da IA
    alpha_dominio: float | None   # riqueza do domínio
    diagnostico: str              # texto curto de interpretação
 
 
def _diagnostico_alpha(alpha_ia, alpha_dominio) -> str:
    if alpha_ia is None or alpha_dominio is None:
        return "sem dados suficientes para diagnóstico"
    diff = alpha_dominio - alpha_ia
    if diff > 0.25:
        return "problema no prompt — IA sugerindo abaixo do potencial do domínio"
    if alpha_ia < 0.30 and alpha_dominio < 0.30:
        return "domínio mal definido — poucos pares têm relação ontológica real"
    if alpha_ia >= 0.70 and alpha_dominio >= 0.70:
        return "IA e domínio bem alinhados"
    return "desempenho intermediário — avaliar prompt e conjuntos iniciais"
 

@dataclass
class Metricas:
    # --- estado geral ---
    total_elementos: int
    esfera_fechada: bool
    num_iteracoes: int
    raio: int | None

    # --- métricas herdadas (Sphere-M, 2012) ---
    densidade: float
    num_elementos: int          # = total_elementos, mantido com o nome do artigo
    produtividade: float | None  # None enquanto esfera_fechada é False

    # --- Cobertura por rodada ---
    # Denominador fixo por rodada, evita distorção pelo crescimento de |E|
    cobertura_global: float          # média ponderada sobre todas as rodadas
    cobertura_por_rodada: list[dict] # [{rodada, E_inicio, avaliados, MAX_r, cobertura_r}]
 
    # --- Decomposição de α ---
    pares_avaliados: int
    pares_aceitos: int
    alpha_ia: float | None           # precisão da IA: IA disse SIM e humano confirmou / IA disse SIM
    alpha_dominio: float | None      # riqueza do domínio: aceitos / avaliados
    diagnostico_alpha: DiagnosticoAlpha
 
    # --- Contribuição do HITL ---
    pares_aceitos_modificados: int   # humano alterou o meio sugerido
    tau_hitl: float | None           # modificados / aceitos
    tau_ia: float | None             # (1 - tau_hitl) aceitos sem modificação

    # --- métrica nova ---
    positivos: int
    negativos: int
    ambos: int
    delta: float | None          # desequilíbrio de caminho; None se não há nós marcados

    pendentes_por_papel: dict = field(default_factory=dict)


def _round(x, casas=3):
    return round(x, casas) if x is not None else None


def _cobertura_por_rodada(grafo) -> tuple[list[dict], float]:
    """
    Calcula Cobertura por rodada usando |E| fixo no início de cada rodada
    como denominador.
 
    Requer grafo.historico_por_rodada: list[dict] com chaves
    rodada, E_inicio, pares_avaliados, pares_aceitos.
    """
    historico = getattr(grafo, "historico_por_rodada", [])
    resultado = []
    soma_avaliados = 0
    soma_max = 0
 
    for entrada in historico:
        E_r = entrada.get("E_inicio", 0)
        avaliados_r = entrada.get("pares_avaliados", 0)
        MAX_r = (E_r * (E_r - 1)) // 2 if E_r > 1 else 1
        cob_r = _round(avaliados_r / MAX_r) if MAX_r > 0 else 0.0
        resultado.append({
            "rodada": entrada.get("rodada"),
            "E_inicio": E_r,
            "avaliados": avaliados_r,
            "MAX_r": MAX_r,
            "cobertura_r": cob_r,
        })
        soma_avaliados += avaliados_r
        soma_max += MAX_r
 
    cobertura_global = _round(soma_avaliados / soma_max) if soma_max > 0 else 0.0
    return resultado, cobertura_global
 
 
def calcular_metricas(grafo) -> Metricas:
    """
    Calcula o pacote completo de métricas para um objeto Grafo, em
    qualquer momento do processo (esfera aberta ou fechada).
    """
    total = len(grafo.Nodes)
 
    # ── Herdadas ──────────────────────────────────────────────────────
    conectados = sum(1 for no in grafo.Nodes if no.achou_teto and no.achou_piso)
    densidade = _round(conectados / total) if total > 0 else 0.0
    esfera_fechada = grafo.Todos_Conectados() if total > 0 else False
    raio = grafo.raio
    produtividade = _round(total / raio, 2) if raio else None
 
    # ── Cobertura por rodada  ────────────────────────────
    cobertura_por_rodada, cobertura_global = _cobertura_por_rodada(grafo)
 
    # Fallback: se não há histórico por rodada, usa fórmula original
    if not cobertura_por_rodada:
        max_relacoes = (total * (total - 1)) // 2
        pares_avaliados = len(getattr(grafo, "pares_avaliados", set()))
        cobertura_global = _round(pares_avaliados / max_relacoes) if max_relacoes > 0 else 0.0
    else:
        pares_avaliados = sum(r["avaliados"] for r in cobertura_por_rodada)
 
    # ── Decomposição de α  ───────────────────────────────
    pares_aceitos = len(grafo.L)
    pares_ia_sim = getattr(grafo, "pares_ia_sim", 0)
    pares_ia_sim_aceitos = getattr(grafo, "pares_ia_sim_aceitos", 0)
 
    # α_IA: dos pares onde IA disse SIM, quantos o humano confirmou
    alpha_ia = _round(pares_ia_sim_aceitos / pares_ia_sim) if pares_ia_sim > 0 else None
 
    # α_domínio: dos pares totais avaliados, quantos tinham relação real
    alpha_dominio = _round(pares_aceitos / pares_avaliados) if pares_avaliados > 0 else None
 
    diagnostico = DiagnosticoAlpha(
        alpha_ia=alpha_ia,
        alpha_dominio=alpha_dominio,
        diagnostico=_diagnostico_alpha(alpha_ia, alpha_dominio),
    )
 
    # ── Contribuição do HITL  ────────────────────────────
    pares_aceitos_modificados = getattr(grafo, "pares_aceitos_modificados", 0)
 
    tau_hitl = _round(pares_aceitos_modificados / pares_aceitos) if pares_aceitos > 0 else None
    tau_ia   = _round(1 - tau_hitl) if tau_hitl is not None else None
 
    # ── Delta ─────────────────────────────────────────────────────────
    positivos = sum(1 for no in grafo.Nodes if getattr(no, "tag_caminho", None) == "positivo")
    negativos = sum(1 for no in grafo.Nodes if getattr(no, "tag_caminho", None) == "negativo")
    ambos     = sum(1 for no in grafo.Nodes if getattr(no, "tag_caminho", None) == "ambos")
    denom_delta = positivos + negativos
    delta = _round(abs(positivos - negativos) / denom_delta) if denom_delta > 0 else None
 
    # ── Pendentes ─────────────────────────────────────────────────────
    pendentes_por_papel = {"ceiling": [], "floor": [], "relevant": [], "gerado": []}
    for no in grafo.Nodes:
        if not (no.achou_teto and no.achou_piso):
            pendentes_por_papel[no.papel].append(no.valor)
 
    return Metricas(
        total_elementos=total,
        esfera_fechada=esfera_fechada,
        num_iteracoes=grafo.iteracao_atual,
        raio=raio,
        densidade=densidade,
        num_elementos=total,
        produtividade=produtividade,
        cobertura_global=cobertura_global,
        cobertura_por_rodada=cobertura_por_rodada,
        pares_avaliados=pares_avaliados,
        pares_aceitos=pares_aceitos,
        alpha_ia=alpha_ia,
        alpha_dominio=alpha_dominio,
        diagnostico_alpha=diagnostico,
        pares_aceitos_modificados=pares_aceitos_modificados,
        tau_hitl=tau_hitl,
        tau_ia=tau_ia,
        positivos=positivos,
        negativos=negativos,
        ambos=ambos,
        delta=delta,
        pendentes_por_papel=pendentes_por_papel,
    )
 
 
# ── Compatibilidade com artigo 2012 ───────────────────────────────────
 
def eficiencia_2012(m: Metricas) -> float | None:
    """
    Auxiliar de compatibilidade — reproduz Iteraction Efficiency do
    artigo de 2012 (|L| / MAX). Matematicamente: cobertura x alpha_dominio.
    Não é reportada como métrica de primeira classe nesta revisão.
    """
    if m.alpha_dominio is None:
        return None
    return _round(m.cobertura_global * m.alpha_dominio)
 
 
# ── Impressão ─────────────────────────────────────────────────────────
 
def imprimir_metricas(grafo) -> Metricas:
    """Calcula e imprime o relatório completo de métricas no terminal."""
    m = calcular_metricas(grafo)
 
    print(f"\n{'=' * 55}")
    print(f"  METRICAS  —  iteracao {m.num_iteracoes}")
    print(f"{'=' * 55}")
    print(f"  Estado da esfera          : {'FECHADA' if m.esfera_fechada else 'aberta'}")
    print(f"  Nos na esfera (|E|)       : {m.total_elementos}")
 
    print(f"\n  ── Herdadas do artigo (2012) ──────────────────────")
    print(f"  Numero de iteracoes       : {m.num_iteracoes}")
    print(f"  Raio da esfera            : {m.raio if m.raio else 'n/a (esfera aberta)'}")
    print(f"  Densidade                 : {m.densidade}")
    print(f"  Produtividade da esfera   : {m.produtividade if m.produtividade else 'n/a (esfera aberta)'}")
 
    print(f"\n  ── Cobertura por rodada ──────────────")
    print(f"  Cobertura global          : {m.cobertura_global}  ({m.pares_avaliados} pares testados)")
    for r in m.cobertura_por_rodada:
        print(f"  Rodada {r['rodada']:>2}  |E| ={r['E_inicio']:>3}  "
              f"avaliados ={r['avaliados']:>3}/{r['MAX_r']:>3}  "
              f"cobertura = {r['cobertura_r']}")
 
    print(f"\n  ── Decomposição de α ─────────────────")
    ai_str  = m.alpha_ia      if m.alpha_ia      is not None else "n/a"
    dom_str = m.alpha_dominio if m.alpha_dominio is not None else "n/a"
    print(f"  α_IA (precisao da IA)     : {ai_str}  "
          f"({getattr(grafo,'pares_ia_sim_aceitos',0)} confirmados / "
          f"{getattr(grafo,'pares_ia_sim',0)} sugeridos pela IA)")
    print(f"  α_dominio (riqueza)       : {dom_str}  "
          f"({m.pares_aceitos} aceitos / {m.pares_avaliados} avaliados)")
    print(f"  Diagnostico               : {m.diagnostico_alpha.diagnostico}")
 
    print(f"\n  ── Contribuição do HITL ──────────────")
    th_str = m.tau_hitl if m.tau_hitl is not None else "n/a"
    ti_str = m.tau_ia   if m.tau_ia   is not None else "n/a"
    print(f"  τ_HITL (intervencao hum.) : {th_str}  "
          f"({m.pares_aceitos_modificados} modificados / {m.pares_aceitos} aceitos)")
    print(f"  τ_IA   (autonomia IA)     : {ti_str}")
 
    print(f"\n  ── Delta (nova) ────────────────────────────────────")
    delta_str = m.delta if m.delta is not None else "n/a (sem nos marcados)"
    print(f"  Delta (desequilibrio)     : {delta_str}  "
          f"(pos={m.positivos} neg={m.negativos} ambos={m.ambos})")
 
    pendentes_totais = sum(len(v) for v in m.pendentes_por_papel.values())
    if pendentes_totais:
        print(f"\n  ── Pendentes ───────────────────────────────────────")
        for papel, nos in m.pendentes_por_papel.items():
            if nos:
                print(f"    [{papel:8s}] : {nos}")
 
    print(f"{'=' * 55}")
    return m