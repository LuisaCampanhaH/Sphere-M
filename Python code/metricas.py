"""
metricas.py
-----------
Camada única de cálculo de métricas do Sphere-M Remastered.

Reúne, num só lugar:
  - as 5 métricas herdadas do artigo original (Sphere-M, 2012);
  - a métrica adaptada (Eficiência -> Cobertura x Taxa de Aceitação),
    necessária porque a IA generativa separou "testar um par" de
    "confirmar uma relação" — a fórmula antiga tratava as duas coisas
    como uma coisa só;
  - Delta, calculada em cima de dado que o grafo já carrega
    (tagCaminho), mas que nenhuma das duas versões do método
    formalizava.

Nada aqui decide "quando parar" — Densidade continua sendo o único
critério de parada do método (ver Grafo.Todos_Conectados()). As
métricas deste módulo são só leitura/diagnóstico, podem ser chamadas
a qualquer momento, com a esfera aberta ou fechada.
"""

from dataclasses import dataclass, field


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

    # --- métrica adaptada (Eficiência decomposta) ---
    pares_avaliados: int
    max_relacoes: int
    cobertura: float
    pares_aceitos: int
    taxa_aceitacao: float | None   # alpha

    # --- métrica nova ---
    positivos: int
    negativos: int
    ambos: int
    delta: float | None          # desequilíbrio de caminho; None se não há nós marcados

    pendentes_por_papel: dict = field(default_factory=dict)


def _round(x, casas=3):
    return round(x, casas) if x is not None else None


def calcular_metricas(grafo) -> Metricas:
    """
    Calcula o pacote completo de métricas para um objeto Grafo, em
    qualquer momento do processo (esfera aberta ou fechada).
    """
    total = len(grafo.Nodes)

    conectados = sum(1 for no in grafo.Nodes if no.achou_teto and no.achou_piso)
    densidade = _round(conectados / total) if total > 0 else 0.0

    esfera_fechada = grafo.Todos_Conectados() if total > 0 else False
    raio = grafo.raio
    produtividade = _round(total / raio, 2) if raio else None

    max_relacoes = (total * (total - 1)) // 2
    pares_avaliados = len(getattr(grafo, "pares_avaliados", set()))
    pares_aceitos = len(grafo.L)

    cobertura = _round(pares_avaliados / max_relacoes) if max_relacoes > 0 else 0.0
    taxa_aceitacao = _round(pares_aceitos / pares_avaliados) if pares_avaliados > 0 else None

    positivos = sum(1 for no in grafo.Nodes if getattr(no, "tag_caminho", None) == "positivo")
    negativos = sum(1 for no in grafo.Nodes if getattr(no, "tag_caminho", None) == "negativo")
    ambos = sum(1 for no in grafo.Nodes if getattr(no, "tag_caminho", None) == "ambos")
    denom = positivos + negativos
    delta = _round(abs(positivos - negativos) / denom) if denom > 0 else None

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
        pares_avaliados=pares_avaliados,
        max_relacoes=max_relacoes,
        cobertura=cobertura,
        pares_aceitos=pares_aceitos,
        taxa_aceitacao=taxa_aceitacao,
        positivos=positivos,
        negativos=negativos,
        ambos=ambos,
        delta=delta,
        pendentes_por_papel=pendentes_por_papel,
    )


def eficiencia_2012(m: Metricas) -> float | None:
    """
    Auxiliar de compatibilidade, fora do pacote Metricas reportado.
    Reproduz o número único de "Iteraction Efficiency" do artigo de
    2012 (|L| / MAX). Matematicamente: cobertura x taxa_aceitacao.
    """
    if m.taxa_aceitacao is None:
        return None
    return _round(m.cobertura * m.taxa_aceitacao)


def imprimir_metricas(grafo) -> Metricas:
    """Calcula e imprime o relatório completo de métricas no terminal."""
    m = calcular_metricas(grafo)

    print(f"\n{'=' * 50}")
    print(f"  METRICAS  —  iteracao {m.num_iteracoes}")
    print(f"{'=' * 50}")
    print(f"  Estado da esfera         : {'FECHADA' if m.esfera_fechada else 'aberta'}")
    print(f"  Nos na esfera (|E|)      : {m.total_elementos}")

    print(f"  ── Herdadas do artigo (2012) ─────────────")
    print(f"  Numero de iteracoes      : {m.num_iteracoes}")
    print(f"  Raio da esfera           : {m.raio if m.raio else 'n/a (esfera aberta)'}")
    print(f"  Densidade                : {m.densidade}")
    print(f"  Produtividade da esfera  : {m.produtividade if m.produtividade else 'n/a (esfera aberta)'}")

    print(f"  ── Adaptada (Eficiencia -> Cobertura x Aceitacao) ─")
    print(f"  Cobertura                : {m.cobertura}  ({m.pares_avaliados} pares testados / {m.max_relacoes} possiveis)")
    taxa_str = m.taxa_aceitacao if m.taxa_aceitacao is not None else "n/a (nenhum par testado)"
    print(f"  Taxa de aceitacao (a)    : {taxa_str}  ({m.pares_aceitos} aceitos / {m.pares_avaliados} testados)")

    print(f"  ── Nova ──────────────────────────────────")
    delta_str = m.delta if m.delta is not None else "n/a (sem nos marcados)"
    print(f"  Delta (desequilibrio)    : {delta_str}  (positivo={m.positivos} negativo={m.negativos} ambos={m.ambos})")

    for papel, nos in m.pendentes_por_papel.items():
        if nos:
            print(f"  Pendentes [{papel:8s}]     : {nos}")
    print(f"{'=' * 50}")

    return m
