"""
Ponte WebFront -> Python.

O WebFront (interface web em canvas) é onde a esfera é construída na
prática: captura interativa, tags de natureza/caminho e sugestão via IA.
Este módulo faz o lado Python do "contrato" combinado com script.js
(botão "Exportar sessão (JSON)"): lê esse .json e reconstrói um objeto
Grafo idêntico ao que Main.py usaria, pra então calcular as métricas
formais do método (raio, densidade, eficiência, produtividade) e, se
quiser, gerar a visualização interativa via pyvis.

Uso:
    python "importar_grafo.py" caminho/para/sessao.json

Ou sem argumento (pede o caminho interativamente):
    python "importar_grafo.py"
"""

import json
import sys

from Main import Grafo, No_Grafo, _Imprimir_Status
from visualizacao import desenhar_grafo


# Grupo do WebFront -> papel usado pelo motor Python (Grafo.Nodes).
MAPA_PAPEL = {
    "teto": "ceiling",
    "piso": "floor",
    "relacionado": "relevant",
    "meio": "gerado",
}


def Carregar_De_Json(caminho: str) -> Grafo:
    """
    Reconstrói um Grafo a partir do .json exportado pelo botão
    "Exportar sessão (JSON)" do WebFront.

    As arestas exportadas já seguem a mesma orientação ei -> meio -> gi
    que Adicionar_No() monta no fluxo manual do Main.py, então a
    reconstrução aqui não precisa adivinhar direção nenhuma — só seguir
    o que já veio pronto do outro lado.
    """
    with open(caminho, encoding="utf-8") as f:
        bruto = json.load(f)

    # Aceita tanto o objeto completo ({"sphereM": {...}}) quanto só o
    # conteúdo interno, caso alguém repasse o payload já "desembrulhado".
    payload = bruto.get("sphereM", bruto)

    grafo = Grafo()
    id_para_no: dict[int, No_Grafo] = {}

    for n in payload.get("nodes", []):
        no = grafo.Buscar_No(n["label"])
        no.papel        = MAPA_PAPEL.get(n.get("group"), "gerado")
        no.tag_natureza = n.get("tagNatureza")
        no.tag_caminho  = n.get("tagCaminho")
        id_para_no[n["id"]] = no

    dominio = payload.get("domain", {})
    grafo.C = list(dict.fromkeys(dominio.get("ceiling", [])))
    grafo.F = list(dict.fromkeys(dominio.get("floor", [])))
    grafo.R = list(dict.fromkeys(dominio.get("relevant", [])))

    for no in grafo.Nodes:
        if no.papel == "ceiling":
            no.achou_teto = True
        if no.papel == "floor":
            no.achou_piso = True

    for e in payload.get("edges", []):
        origem  = id_para_no.get(e["from"])
        destino = id_para_no.get(e["to"])
        if origem is None or destino is None:
            continue  # aresta órfã (não deveria acontecer, mas não quebra o import)

        if destino not in origem.vizinhos:
            origem.vizinhos.append(destino)
        if origem not in destino.vizinhos_inv:
            destino.vizinhos_inv.append(origem)

        # FAO: usado só pela visualização pyvis (rótulo/tooltip da aresta).
        # "tipoAof" vem do seletor de tipo AOF do WebFront (manual ou
        # pré-preenchido pela sugestão da IA); fica vazio só em sessões
        # exportadas antes dessa mudança, ou se o par foi confirmado sem
        # selecionar um tipo.
        grafo.FAO.append((origem.valor, destino.valor, e.get("tipoAof") or ""))

    grafo._Propagar_Marcas()

    # Reconstrói L (relações por par gi/ei) a partir da mesma estrutura
    # ei->meio->gi: cada nó "gerado" (meio) liga um conjunto de origens
    # (vizinhos_inv) a um conjunto de destinos (vizinhos). Isso é o que
    # Adicionar_L já fazia durante o fluxo manual — aqui só é feito de
    # uma vez, depois de já ter todo o grafo montado.
    for no_meio in grafo.Nodes:
        if no_meio.papel != "gerado":
            continue
        eis = [v.valor for v in no_meio.vizinhos_inv]
        gis = [v.valor for v in no_meio.vizinhos]
        for ei_valor in eis:
            for gi_valor in gis:
                if ei_valor == gi_valor:
                    continue
                grafo.Adicionar_L(gi_valor, ei_valor, no_meio.valor)

    grafo.iteracao_atual = payload.get("round", 1)
    grafo.Registrar_Raio_Se_Necessario()

    return grafo


if __name__ == "__main__":
    caminho = sys.argv[1] if len(sys.argv) > 1 else input(
        "Caminho do .json exportado do WebFront: "
    ).strip()

    grafo = Carregar_De_Json(caminho)

    print(f"\n  C (CEILING)  : {grafo.C}")
    print(f"  F (FLOOR)    : {grafo.F}")
    print(f"  R (RELEVANT) : {grafo.R}")
    print(f"  Total de nós : {len(grafo.Nodes)}")

    _Imprimir_Status(grafo, grafo.iteracao_atual)

    ver = input("\nDeseja gerar a visualização interativa (pyvis)? (s/n): ").strip().lower()
    if ver == "s":
        desenhar_grafo(grafo)
