"""
modelo_io.py
------------
Exportação e importação de uma sessão do Sphere-M Remastered (a "esfera")
como um único arquivo .json autocontido.

Diferença em relação a importar_grafo.py:
  - importar_grafo.py lê o formato exportado pelo CANVAS do WebFront.
  - modelo_io.py lê/escreve o formato NATIVO do motor Python: serve
    tanto para salvar uma esfera feita pelo CLI (Main.py) quanto para
    retomar depois, de onde parou (esfera fechada ou não).

Uso típico:
    exportar_modelo(grafo, "minha_esfera.json")
    ...
    grafo = importar_modelo("minha_esfera.json")   # continua de onde parou
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

VERSAO_FORMATO = "1.0"


def exportar_modelo(grafo, caminho: str) -> None:
    """Serializa o estado completo do grafo num .json."""

    nodes = []
    for no in grafo.Nodes:
        nodes.append({
            "valor": no.valor,
            "papel": no.papel,
            "achou_teto": no.achou_teto,
            "achou_piso": no.achou_piso,
            "tag_natureza": getattr(no, "tag_natureza", None),
            "tag_caminho": getattr(no, "tag_caminho", None),
            "vizinhos": [v.valor for v in no.vizinhos],
            "vizinhos_inv": [v.valor for v in no.vizinhos_inv],
        })

    payload = {
        "formato": "sphereM-modelo",
        "versao": VERSAO_FORMATO,
        "exportado_em": datetime.now(timezone.utc).isoformat(),
        "dominio": {
            "ceiling": grafo.C,
            "floor": grafo.F,
            "relevant": grafo.R,
        },
        "nodes": nodes,
        "fao": [[ei, leg, tipo] for (ei, leg, tipo) in grafo.FAO],
        "l": [[gi, ei, legs] for (gi, ei, legs) in grafo.L],
        "pares_avaliados": [list(p) for p in getattr(grafo, "pares_avaliados", set())],
        "iteracao_atual": grafo.iteracao_atual,
        "raio": grafo.raio,
    }

    with open(caminho, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    print(f"\n[OK] Modelo exportado para: {caminho}")


def importar_modelo(caminho: str):
    """Reconstrói um objeto Grafo idêntico ao estado salvo."""

    from Main import Grafo

    with open(caminho, encoding="utf-8") as f:
        payload = json.load(f)

    if payload.get("formato") != "sphereM-modelo":
        raise ValueError(
            "Este arquivo não parece ser um modelo exportado por "
            "exportar_modelo(). Se veio do canvas do WebFront, use "
            "importar_grafo.py em vez deste módulo."
        )

    grafo = Grafo()
    grafo.C = list(payload["dominio"].get("ceiling", []))
    grafo.F = list(payload["dominio"].get("floor", []))
    grafo.R = list(payload["dominio"].get("relevant", []))

    for n in payload["nodes"]:
        no = grafo.Buscar_No(n["valor"])
        no.papel = n.get("papel", "gerado")
        no.achou_teto = n.get("achou_teto", False)
        no.achou_piso = n.get("achou_piso", False)
        no.tag_natureza = n.get("tag_natureza")
        no.tag_caminho = n.get("tag_caminho")

    for n in payload["nodes"]:
        no = grafo.Buscar_No(n["valor"])
        no.vizinhos = [grafo.Buscar_No(v) for v in n.get("vizinhos", [])]
        no.vizinhos_inv = [grafo.Buscar_No(v) for v in n.get("vizinhos_inv", [])]

    grafo.FAO = [tuple(x) for x in payload.get("fao", [])]
    grafo.L = [(x[0], x[1], list(x[2])) for x in payload.get("l", [])]
    grafo.pares_avaliados = {tuple(p) for p in payload.get("pares_avaliados", [])}
    grafo.iteracao_atual = payload.get("iteracao_atual", 0)
    grafo.raio = payload.get("raio")

    grafo._Propagar_Marcas()
    grafo.Registrar_Raio_Se_Necessario()

    print(f"\n[OK] Modelo importado de: {caminho}")
    print(f"     C={grafo.C}  F={grafo.F}  R={grafo.R}")
    print(f"     {len(grafo.Nodes)} nos, iteracao {grafo.iteracao_atual}, "
          f"{'fechada' if grafo.Todos_Conectados() else 'aberta'}")

    return grafo
