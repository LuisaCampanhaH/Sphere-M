<h1 align="center">Sphere-M</h1>

<h4 align="center">
Ferramenta de construção manual de grafos de conhecimento (ontologias), guiada por um método científico de conexão entre conceitos.
</h4>

<p align="center">
<img alt="Research" src="https://img.shields.io/badge/Iniciação_Científica-2026.1-8A2BE2?style=for-the-badge&logo=googlescholar&logoColor=white">
<img alt="Python" src="https://img.shields.io/badge/Backend-Python-3776AB?style=for-the-badge&logo=python&logoColor=white">
<img alt="JavaScript" src="https://img.shields.io/badge/Frontend-JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black">
<img alt="License" src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge">
</p>

<p align="center">
<a href="#-o-problema">O Problema</a> •
<a href="#-o-método">O Método</a> •
<a href="#-estrutura-do-projeto">Estrutura</a> •
<a href="#-como-executar">Como Executar</a> •
<a href="#-segurança">Segurança</a>
</p>

---

## 🧠 O Problema

Construir uma ontologia ou grafo de conceitos manualmente é um processo custoso e pouco sistemático: normalmente não há critério claro de quando parar, nem métricas para medir o quanto o domínio já está "coberto". O **Sphere-M** propõe um método estruturado para isso, tratando o processo como a construção progressiva de uma esfera de conhecimento, ancorada por dois polos.

## 🔬 O Método

O grafo é construído a partir de três conjuntos de conceitos definidos pelo usuário:

- **CEILING (teto):** os conceitos mais genéricos do domínio.
- **FLOOR (piso):** os conceitos mais específicos/alvo do domínio.
- **RELEVANT ELEMENTS (relacionados):** termos intermediários relevantes, opcionais.

A cada iteração, o sistema apresenta pares de conceitos e pergunta se existe uma relação entre eles. Se sim, o usuário (ou uma IA, no modo assistido) informa um **conceito intermediário (leg)** e o tipo de relação AOF (`é-um`, `é-parte-de`, `é-composto-por`, `é-uma-variação-de`, `é-um-atributo-de`, `é-um-componente-de`, `é-um-elemento-de`, `é-caracterizado-por`) que liga cada extremidade a esse conceito.

O algoritmo propaga marcas de "alcançou o teto" e "alcançou o piso" pelo grafo a cada nova conexão. Quando **todo nó está conectado a ambos os polos**, a esfera está fechada — e o sistema calcula métricas como:

- **Raio da esfera:** número de iterações até o fechamento.
- **Densidade:** proporção de nós totalmente conectados.
- **Eficiência da iteração:** relações encontradas / relações possíveis.
- **Produtividade:** nós cobertos por iteração.

O resultado pode ser exportado como um grafo interativo (HTML, via `pyvis`), com nós coloridos por papel semântico (teto, piso, relacionado, gerado).

## 📂 Estrutura do Projeto

```
.
├── Main.py                    # Motor do método Sphere-M (CLI, modo manual)
├── visualizacao.py            # Geração do grafo interativo (pyvis)
├── meu_grafo_interativo.html  # Última visualização gerada
└── WebFront/                  # Interface web (captura visual em canvas + modo assistido por IA)
    ├── index.html
    ├── script.js
    └── style.css
```

Existem dois modos de uso:

1. **CLI (`Main.py`):** fluxo 100% manual pelo terminal — o humano decide toda relação e tipo de aresta.
2. **WebFront:** interface visual em canvas para capturar o grafo interativamente, com um modo opcional de sugestão de relações via IA (Mistral).

## ⚙️ Tecnologias

- **Backend / Motor do método:** Python (`networkx`, `pyvis`)
- **Frontend:** HTML, CSS e JavaScript puro (canvas 2D)
- **IA assistida (opcional, no WebFront):** API da Mistral

## 🚀 Como Executar

### CLI (Python)

```bash
git clone https://github.com/SEU-USUARIO/sphere-m.git
cd sphere-m
pip install networkx pyvis
python Main.py
```

O programa vai pedir os conjuntos **CEILING**, **FLOOR** e **RELEVANT ELEMENTS** (separados por vírgula) e conduzir a busca de relações pelo terminal. Ao final (ou a qualquer momento), é possível gerar a visualização interativa em `meu_grafo_interativo.html`.

### Interface Web

```bash
cd WebFront
# abra index.html diretamente no navegador, ou sirva a pasta com um servidor local:
python -m http.server 8000
```

Depois acesse `http://localhost:8000`.


<p align="center">
Projeto de Iniciação Científica — 2026.1
</p>
