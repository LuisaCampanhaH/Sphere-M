from pyvis.network import Network

# Paleta por papel semântico
CORES = {
    "ceiling" : {"background": "#720404", "border": "#4a0202"},  # vermelho escuro
    "floor"   : {"background": "#09079B", "border": "#050468"},  # azul escuro
    "relevant": {"background": "#b07d00", "border": "#7a5700"},  # dourado
    "gerado"  : {"background": "#1e6104", "border": "#144303"},  # verde escuro
}

TAMANHOS = {
    "ceiling" : 60,
    "floor"   : 60,
    "relevant": 45,
    "gerado"  : 35,
}


def desenhar_grafo(grafo):
    net = Network(
        notebook=False,
        width="100%",
        height="900px",
        bgcolor="#ffffff",
        font_color="#000000",
        directed=False
    )

    # Coleta todos os valores que aparecem nas arestas FAO
    nos_no_fao = set()
    for (leg, palavra, _) in grafo.FAO:
        nos_no_fao.add(leg)
        nos_no_fao.add(palavra)

    # Usa os nós do grafo quando disponíveis (têm .papel),
    # e adiciona como "gerado" qualquer nó que só exista no FAO
    nos_ja_adicionados = set()

    for no in grafo.Nodes:
        if no.valor not in nos_no_fao:
            continue  # nó ainda sem arestas — não exibe
        papel  = no.papel
        cor    = CORES.get(papel, CORES["gerado"])
        tam    = TAMANHOS.get(papel, TAMANHOS["gerado"])

        # Tooltip mostra o papel e as marcas de conexão
        teto_str = "V" if no.achou_teto else "X"
        piso_str = "V" if no.achou_piso else "X"
        titulo   = f"{no.valor}\npapel: {papel}\nteto: {teto_str}  piso: {piso_str}"

        net.add_node(
            no.valor,
            label=no.valor,
            title=titulo,
            color=cor,
            size=tam,
            shape="dot",
            font={"size": 14, "color": "#000000", "bold": True, "vadjust": 0},
            shadow=True
        )
        nos_ja_adicionados.add(no.valor)

    # Qualquer nó no FAO que não esteja em grafo.Nodes (edge case) — trata como gerado
    for valor in nos_no_fao - nos_ja_adicionados:
        net.add_node(
            valor,
            label=valor,
            color=CORES["gerado"],
            size=TAMANHOS["gerado"],
            shape="dot",
            font={"size": 13, "color": "#1a1a1a", "bold": True, "vadjust": 0},
            shadow=True
        )

    # Arestas
    for (leg, palavra, peso) in grafo.FAO:
        net.add_edge(
            leg, palavra,
            label=peso,
            title=peso,
            color={"color": "#555555", "opacity": 0.6},
            width=2,
            font={"size": 12, "color": "#333333", "align": "middle"},
            smooth=False
        )

    # Legenda injetada como HTML fixo no canto
    legenda_html = """
    <div style="
        position: fixed; bottom: 20px; left: 20px;
        background: rgba(255,255,255,0.92);
        border: 1px solid #ccc;
        border-radius: 8px;
        padding: 12px 16px;
        font-family: sans-serif;
        font-size: 13px;
        z-index: 9999;
        box-shadow: 2px 2px 8px rgba(0,0,0,0.15);
    ">
      <b>Legenda</b><br><br>
      <span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:#720404;margin-right:6px;vertical-align:middle"></span> CEILING (genérico)<br>
      <span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:#09079B;margin-right:6px;vertical-align:middle"></span> FLOOR (específico)<br>
      <span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:#b07d00;margin-right:6px;vertical-align:middle"></span> RELEVANT ELEMENT<br>
      <span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:#1e6104;margin-right:6px;vertical-align:middle"></span> Gerado pela IA
    </div>
    """

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

    # Injeta legenda e desliga física após estabilização
    net.html = net.html.replace(
        "</body>",
        f"""
        {legenda_html}
        <script>
        network.once("stabilized", function() {{
            network.setOptions({{ physics: {{ enabled: false }} }});
        }});
        </script>
        </body>"""
    )

    with open("meu_grafo_interativo.html", "w", encoding="utf-8") as f:
        f.write(net.html)

    import webbrowser, os
    webbrowser.open("file://" + os.path.abspath("meu_grafo_interativo.html"))