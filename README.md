<h1 align="center">Sphere-M</h1>

<h4 align="center">
Uma ferramenta que constrói ontologias — mapas estruturados do conhecimento de um domínio — em parceria com IA generativa, mas sem deixar a IA decidir sozinha.
</h4>

<p align="center">
<img alt="Research" src="https://img.shields.io/badge/Iniciação_Científica-2026.1-8A2BE2?style=for-the-badge&logo=googlescholar&logoColor=white">
<img alt="Python" src="https://img.shields.io/badge/Backend-Python-3776AB?style=for-the-badge&logo=python&logoColor=white">
<img alt="JavaScript" src="https://img.shields.io/badge/Frontend-JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black">
<img alt="License" src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge">
</p>

<p align="center">
<a href="#-o-que-é-isso-e-por-que-existe">O que é isso e por que existe</a> •
<a href="#-como-funciona-na-prática">Como funciona</a> •
<a href="#-instalação-e-execução">Instalação</a> •
<a href="#-aprofundando-o-método-por-trás">O método</a> •
<a href="#-referências">Referências</a>
</p>

---

## 🧠 O que é isso e por que existe

### O que é uma ontologia

Imagine que você precisa explicar tudo o que sabe sobre um assunto — não como um texto corrido, mas como um **mapa de conceitos**: quais são as ideias centrais de um domínio, e como cada uma se relaciona com as outras (*"X é um tipo de Y"*, *"X é parte de Y"*, *"X é uma característica de Y"*). Esse mapa estruturado — um grafo onde os nós são conceitos e as arestas são relações com um tipo bem definido — é, em ciência da computação, chamado de **ontologia**.

Ontologias são usadas sempre que um sistema precisa "entender" um domínio de forma explícita e verificável, em vez de depender só de intuição: bases de conhecimento médico, motores de busca semântica, sistemas de recomendação, ou — o caso deste projeto — como uma etapa preparatória antes de treinar um modelo de aprendizado de máquina, ajudando a decidir quais variáveis e conceitos realmente importam para o domínio em questão.

### Por que construir isso manualmente, com apoio de IA

Pedir para uma IA generativa simplesmente "gerar uma ontologia sobre X" tem um problema conhecido: LLMs erram silenciosamente. Eles alucinam relações que soam plausíveis mas não existem, misturam sentidos diferentes de uma mesma palavra dependendo do contexto, e não têm como saber quais nuances importam de verdade para o seu domínio específico — o conhecimento tácito de um especialista humano, construído por experiência, não está escrito em lugar nenhum que o modelo possa "ler".

Por outro lado, construir uma ontologia inteiramente à mão, conceito por conceito, é um processo lento e sem critério claro de quando parar: quando o grafo está "completo o suficiente"? Faltou alguma conexão importante?

A resposta deste projeto é **Human-in-the-Loop (HITL)**: a IA generativa sugere candidatos a relação entre pares de conceitos — o trabalho de gerar hipóteses, que ela faz bem e em escala — e um humano especialista no domínio confirma, corrige ou rejeita cada sugestão antes que ela vire parte do modelo. A IA acelera a exploração; o humano garante que o resultado final é confiável.

### A ideia central: a analogia da esfera

O método por trás do Sphere-M (chamado **CAPTO2** no artigo acadêmico que o descreve) organiza essa investigação em torno de dois polos, definidos por quem está construindo a ontologia:

- **CEILING (teto):** os conceitos mais **genéricos** do domínio — o "centro" da esfera.
- **FLOOR (piso):** os conceitos mais **específicos**, os que você quer que estejam representados no modelo final — a "superfície" da esfera.

A cada iteração, o método pega pares de conceitos e pergunta (com ajuda da IA, validada por um humano) se existe uma relação entre eles — e se sim, qual conceito intermediário os liga. Cada nova conexão propaga marcas de "este conceito já alcança o teto" e "este conceito já alcança o piso" pelo grafo. **A esfera está "fechada" — e o processo pode parar — quando todo conceito do domínio tem um caminho até o teto e um caminho até o piso.** Nada fica solto, desconectado do resto do mapa.

## 🔧 Como funciona na prática

O projeto tem **dois motores** que implementam o mesmo método, para dois contextos de uso diferentes:

- **CLI (`Main.py`):** fluxo 100% manual pelo terminal — o humano decide toda relação e todo tipo de aresta, sem IA envolvida. Bom para sessões rápidas, scripts, ou quando não há chave de API disponível.
- **WebFront:** interface visual em canvas para capturar o grafo interativamente — arrastar nós, editar arestas com clique, e um modo opcional de sugestão de relações via IA (Mistral), sempre com confirmação humana antes de qualquer relação virar aresta permanente.

Os dois motores se conectam por meio de **arquivos JSON**, não por uma API em tempo real:

1. Uma sessão feita no **WebFront** pode ser exportada como `.json` (botão "Exportar sessão") e lida pelo motor Python via `importar_grafo.py`, que reconstrói o grafo e calcula as métricas formais do método (raio, densidade, cobertura, etc.) ou gera uma visualização interativa.
2. Uma sessão feita pelo **CLI** pode ser salva e retomada depois usando `modelo_io.py` — um formato próprio, mais simples, específico do motor Python.

Esses dois formatos JSON são **intencionalmente diferentes** (um é o formato nativo do motor Python, o outro é o que o canvas do WebFront exporta) — por isso existem dois módulos de import/export separados, cada um documentado para o seu caso de uso.

## 🚀 Instalação e execução

### Pré-requisitos

- Python 3.10+
- Um navegador, se for usar o WebFront

### CLI (Python)

```bash
git clone https://github.com/LuisaCampanhaH/Sphere-M.git
cd Sphere-M
pip install pyvis
cd "Python code"
python Main.py
```

O programa pede os conjuntos **CEILING**, **FLOOR** e **RELEVANT ELEMENTS** (separados por vírgula) e conduz a busca de relações pelo terminal, pergunta a pergunta. A qualquer momento é possível visualizar o grafo (gera um `meu_grafo_interativo.html` via `pyvis`) ou exportar a sessão em JSON para continuar depois.

> `pip install pyvis` já traz o `networkx` como dependência — não é preciso instalá-lo à parte.

### Interface Web

```bash
cd WebFront
cp config.example.js config.js   # depois preencha sua própria chave da Mistral no config.js (opcional)
python -m http.server 8000
```

Depois acesse `http://localhost:8000`. O modo assistido por IA é opcional — sem uma chave em `config.js`, a interface funciona normalmente, só sem sugestões automáticas (você preenche o conceito intermediário manualmente).

### Rodando os testes

```bash
cd "Python code"
python teste_smoke.py
```

Isso roda um teste funcional (sem interação humana) que simula duas rodadas de captura e valida o cálculo de todas as métricas e o roundtrip completo de exportar/importar uma sessão.

> No Windows, se aparecer um erro de encoding ao imprimir os caracteres acentuados/gregos do relatório de métricas, rode `set PYTHONIOENCODING=utf-8` antes (ou `$env:PYTHONIOENCODING="utf-8"` no PowerShell) — é uma limitação do console, não do código.

### 🔒 Segurança

O modo assistido por IA do WebFront requer uma chave de API da Mistral, fornecida por **cada usuário individualmente** em `WebFront/config.js` (nunca commitado — arquivo listado no `.gitignore`). Use `config.example.js` como modelo e gere sua própria chave em [console.mistral.ai](https://console.mistral.ai).

## 📚 Aprofundando: o método por trás

### CEILING, FLOOR, RELEVANT ELEMENTS e a técnica Middle-out

O método usa a técnica **Middle-out**, considerada um meio-termo mais equilibrado do que começar só pelo geral (*top-down*) ou só pelo específico (*bottom-up*): você começa enumerando os elementos centrais do domínio e expande em ambas as direções — mais genérico e mais específico — ao mesmo tempo.

Três conjuntos, definidos pelo usuário, guiam esse processo:

| Conjunto | Papel |
|---|---|
| **CEILING** (teto) | Conceitos mais genéricos do domínio |
| **FLOOR** (piso) | Conceitos mais específicos/alvo do domínio |
| **RELEVANT ELEMENTS** (relacionados) | Termos intermediários relevantes, opcionais |

A união dos três forma o **DOMAIN ELEMENTS (E)** — o conjunto de trabalho inicial da investigação.

### Análise Ontológica Fundamental (AOF)

Cada relação proposta entre dois conceitos é classificada usando um de oito tipos, agrupados em quatro fundamentos filosóficos que orientam a busca (variação/especificação, essência/generalização, parte/todo, e uma regra-guia que exige que todo conceito gerado seja algo que o domínio de fato admite):

| Fundamento | Tipos de relação (AOF) |
|---|---|
| Especificação | `é-uma-variação-de` |
| Generalização | `é-um` |
| Composição (parte→todo) | `é-um-atributo-de`, `é-um-componente-de`, `é-um-elemento-de`, `é-parte-de` |
| Agregação (todo→parte) | `é-composto-por`, `é-caracterizado-por` |

### Métricas

Nada nas métricas decide "quando parar" além da **Densidade** (critério de parada original do método: densidade = 1.0 significa esfera fechada). As demais são leitura/diagnóstico do processo, calculáveis a qualquer momento — esfera aberta ou fechada.

**Herdadas do artigo original (Sphere-M, 2012):**

| Métrica | O que mede |
|---|---|
| Número de iterações | Quantas rodadas de busca já ocorreram |
| Raio da esfera | Iterações até a esfera fechar (indefinido se ainda aberta) |
| Número de elementos | Tamanho do grafo (\|E\|) no momento |
| Densidade | Proporção de nós já conectados a teto **e** piso — critério de parada |
| Produtividade | Elementos por iteração, só definida quando a esfera fecha |

**Novas, adicionadas para o modo assistido por IA** — porque a IA separou "testar um par" de "confirmar uma relação", duas ações que o método original de 2012 tratava como uma coisa só:

| Métrica | O que mede |
|---|---|
| Cobertura (por rodada) | Quanto do espaço de pares possíveis foi de fato testado, rodada a rodada |
| α_IA / α_domínio | Precisão da IA (o quanto ela acerta) vs. riqueza real do domínio (quantos pares testados viram relação aceita) |
| τ_HITL / τ_IA | Quanto o humano precisou corrigir a sugestão da IA vs. quanto foi aceito como veio |
| Delta (Δ) | Desequilíbrio entre polos "positivo"/"negativo" de um domínio marcado manualmente (métrica condicional, só no WebFront) |

Detalhes formais de cada fórmula estão em `docs/Sphere-M_Especificacao_Matematica_Metricas_1.pdf`, implementados em `Python code/metricas.py`.

### Estrutura do projeto

```
Sphere-M/
├── Python code/
│   ├── Main.py             # Motor do método (CLI, modo manual)
│   ├── metricas.py         # Cálculo de todas as métricas (herdadas + novas)
│   ├── modelo_io.py        # Export/import da sessão nativa do CLI
│   ├── importar_grafo.py   # Ponte: lê a sessão exportada pelo WebFront
│   ├── visualizacao.py     # Geração do grafo interativo (pyvis)
│   └── teste_smoke.py      # Teste funcional não-interativo
├── WebFront/                # Interface web (canvas + modo assistido por IA)
│   ├── index.html
│   ├── script.js
│   ├── style.css
│   └── config.example.js   # Copie para config.js e preencha sua própria chave
└── docs/                    # Especificação de métricas e artigo do método
```

## 📖 Referências

- ALENCAR, R. O.; ZÁRATE, L. E.; SONG, M. A. J. **Sphere-M: an Ontology Capture Method**. In: 2012 IEEE International Conference on Systems, Man, and Cybernetics (SMC), Seoul, 2012.
- SATUF, S. D.; ZÁRATE, L. E. **Modelagem Conceitual de Domínios para Aprendizado de Máquina via IA-Generativa dentro do conceito Human-in-the-loop**. Trabalho de Conclusão de Curso — Instituto de Ciências Exatas e de Informática, PUC Minas, Contagem.

<br>

<p align="center">
Projeto de Iniciação Científica — 2026.1<br>
Built by <a href="https://github.com/LuisaCampanhaH">Luisa Campanha</a>
</p>
