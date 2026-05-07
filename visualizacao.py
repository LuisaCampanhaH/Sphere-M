# visualizacao.py
from pyvis.network import Network

def desenhar_grafo(grafo):
    net = Network(
        notebook=False,
        width="100%",
        height="900px",
        bgcolor="#ffffff",
        font_color="#000000",
        directed=False
    )

    nos_leg = set()
    nos_base = set()
    for (leg, palavra, _) in grafo.FAO:
        nos_leg.add(leg)
        nos_base.add(palavra)

    palavras_raiz = nos_base - nos_leg
    todos_nos = nos_leg | nos_base

    for no in todos_nos:
        if no in palavras_raiz:
            net.add_node(no,
                label=no,
                color={"background": "#720404", "border": "#770404"},
                size=50,                              # ← maior pra caber o texto
                shape="dot",
                font={"size": 14, "color": "#000000", "bold": True, "vadjust": 0},
                shadow=True
            )
        else:
            net.add_node(no,
                label=no,
                color={"background": "#1e6104", "border": "#196b08"},
                size=50,
                shape="dot",
                font={"size": 13, "color": "#1a1a1a", "bold": True, "vadjust": 0},
                shadow=True
            )

    for (leg, palavra, peso) in grafo.FAO:
        net.add_edge(leg, palavra,
            label=peso,
            title=peso,
            color={"color": "#09079B", "opacity": 0.7},
            width=2,
            font={"size": 14, "color": "#000000", "align": "middle"},  # ← tamanho maior
            smooth=False   # ← linha reta
        )

    net.set_options("""
    {
      "layout": {
        "randomSeed": 42
      },
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
        "stabilization": {
          "enabled": true,
          "iterations": 300,
          "fit": true
        },
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