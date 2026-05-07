# visualizacao.py
from pyvis.network import Network

PALETA_ITERACOES = [
    {"base": "#720404", "borda": "#770404"},   # Vermelho (iter 1 — entradas)
    {"base": "#1e6104", "borda": "#196b08"},   # Verde (conceitos iter 1)
    {"base": "#04307a", "borda": "#083680"},   # Azul (conceitos iter 2)
    {"base": "#6b4a00", "borda": "#7a5500"},   # Âmbar (conceitos iter 3)
    {"base": "#4a0470", "borda": "#580880"},   # Roxo (conceitos iter 4)
    {"base": "#047a6b", "borda": "#0a8878"},   # Teal (conceitos iter 5)
]

def _cor_da_iteracao(indice: int) -> dict:
    idx = min(indice, len(PALETA_ITERACOES) - 1)
    c = PALETA_ITERACOES[idx]
    return {"background": c["base"], "border": c["borda"]}


def desenhar_grafo(grafo, iteracao_atual: int = 1):
    net = Network(
        notebook=False,
        width="100%",
        height="900px",
        bgcolor="#ffffff",
        font_color="#000000",
        directed=False
    )

    # Mapeia cada nó para a iteração em que apareceu pela primeira vez
    nos_por_iteracao: dict[str, int] = {}
    for (leg, palavra, _, iter_no) in grafo.FAO:
        if leg not in nos_por_iteracao:
            nos_por_iteracao[leg] = iter_no
        if palavra not in nos_por_iteracao:
            nos_por_iteracao[palavra] = 0  # 0 = entrada original (vermelho)

    todos_nos = set(nos_por_iteracao.keys())

    for no in todos_nos:
        iter_no = nos_por_iteracao[no]
        cor = _cor_da_iteracao(iter_no)
        net.add_node(no,
            label=no,
            color={"background": cor["background"], "border": cor["border"]},
            size=50,
            shape="dot",
            font={"size": 14, "color": "#000000", "bold": True, "vadjust": 0},
            shadow=True,
            title=f"Iteração {iter_no if iter_no > 0 else 'entrada'}"
        )

    for (leg, palavra, peso, _) in grafo.FAO:
        net.add_edge(leg, palavra,
            label=peso,
            title=peso,
            color={"color": "#09079B", "opacity": 0.7},
            width=2,
            font={"size": 14, "color": "#000000", "align": "middle"},
            smooth=False
        )

    net.set_options("""
    {
      "layout": { "randomSeed": 42 },
      "physics": {
        "enabled": true,
        "barnesHut": {
          "gravitationalConstant": -8000,
          "centralGravity": 0.3,
          "springLength": 200,
          "springConstant": 0.02,
          "damping": 0.95,
          "avoidOverlap": 1
        },
        "stabilization": { "enabled": true, "iterations": 300, "fit": true },
        "minVelocity": 0.5,
        "maxVelocity": 5
      },
      "interaction": {
        "hover": true,
        "tooltipDelay": 150,
        "navigationButtons": true,
        "keyboard": true,
        "zoomView": true
      }
    }
    """)

    net.html = net.generate_html()
    net.html = net.html.replace(
        "</body>",
        """
        <script>
        network.once("stabilized", function() {
            network.setOptions({ physics: { enabled: false } });
        });
        </script>
        </body>"""
    )

    with open("meu_grafo_interativo.html", "w", encoding="utf-8") as f:
        f.write(net.html)

    import webbrowser, os
    webbrowser.open("file://" + os.path.abspath("meu_grafo_interativo.html"))