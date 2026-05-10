import os
from dotenv import load_dotenv
import networkx as nx
from pyvis.network import Network
from mistralai.client import Mistral
from visualizacao import desenhar_grafo

load_dotenv()
minha_chave = os.getenv("minha_api_key")
cliente = Mistral(api_key=minha_chave)

# ── Tipos de relação (AOF) — referência para o prompt da IA ─────────────────
# Humano digita livremente; a IA usa estes como guia no prompt.
TIPOS_AOF_REF = "is-a | is-part-of | is-composed-by | is-a-variation-of"


class No_Grafo:
    def __init__(self, valor: str, vizinhos: list['No_Grafo'] = None):
        self.valor    = valor
        self.vizinhos = [] if vizinhos is None else vizinhos
        self.achou_teto = False
        self.achou_piso = False
        self.papel: str = "gerado"


class Grafo:
    def __init__(self, Nodes: list['No_Grafo'] = None):
        self.Nodes = [] if Nodes is None else Nodes
        # FAO salva (origem, destino, tipo_relacao) conforme o artigo
        self.FAO: list[tuple[str, str, str]] = []
        # L salva (gi, ei, [intermediarios]) — base para Eficiencia da Iteracao
        self.L: list[tuple[str, str, list[str]]] = []

        self.C: list[str] = []
        self.F: list[str] = []
        self.R: list[str] = []

        # Metricas de processo
        self.raio: int | None = None   # iteracao em que a densidade atingiu 1.0
        self.iteracao_atual: int = 0   # atualizada pelo loop principal

    def Inicializar(self, C: list[str], F: list[str], R: list[str]):
        self.C = list(dict.fromkeys(C))
        self.F = list(dict.fromkeys(F))
        self.R = list(dict.fromkeys(R))

        for valor in self.C:
            no = self.Buscar_No(valor)
            no.papel      = "ceiling"
            no.achou_teto = True

        for valor in self.F:
            no = self.Buscar_No(valor)
            no.papel      = "floor"
            no.achou_piso = True

        for valor in self.R:
            no = self.Buscar_No(valor)
            no.papel = "relevant"

    def Dominio(self) -> list[str]:
        return list(dict.fromkeys(self.C + self.F + self.R))

    def Buscar_No(self, valor: str) -> No_Grafo:
        for no in self.Nodes:
            if no.valor == valor:
                return no
        novo = No_Grafo(valor=valor)
        self.Nodes.append(novo)
        return novo

    def Adicionar_No(self, leg: str, ei: str, gi: str):
        no_leg = self.Buscar_No(leg)
        no_ei  = self.Buscar_No(ei)
        no_gi  = self.Buscar_No(gi)

        for a, b in [(no_leg, no_ei), (no_leg, no_gi),
                    (no_ei, no_leg), (no_gi, no_leg)]:
            if b not in a.vizinhos:
                a.vizinhos.append(b)

        self._Propagar_Marcas()

    def Adicionar_FAO(self, ei: str, leg: str, tipo_ei_leg: str,
                      gi: str, tipo_leg_gi: str):
        """
        Salva as arestas com o tipo ontologico confirmado pelo humano.
        Formato: (origem, destino, tipo_relacao)
        """
        self.FAO.append((ei,  leg, tipo_ei_leg))
        self.FAO.append((leg, gi,  tipo_leg_gi))

    def Adicionar_L(self, gi: str, ei: str, leg: str):
        """
        Registra a tripla (gi, ei, [intermediario]) no conjunto L do artigo.
        Eficiencia = |L| / MAX,  onde MAX = |E|*(|E|-1)/2
        Se o par ja existe, apenas acumula o intermediario na lista.
        """
        for entrada in self.L:
            if entrada[0] == gi and entrada[1] == ei:
                if leg not in entrada[2]:
                    entrada[2].append(leg)
                return
        self.L.append((gi, ei, [leg]))

    def _Propagar_Marcas(self):
        for flag in ("achou_teto", "achou_piso"):
            fila   = [no for no in self.Nodes if getattr(no, flag)]
            vistos = set(id(no) for no in fila)
            while fila:
                atual = fila.pop(0)
                for vizinho in atual.vizinhos:
                    if not getattr(vizinho, flag):
                        setattr(vizinho, flag, True)
                        if id(vizinho) not in vistos:
                            fila.append(vizinho)
                            vistos.add(id(vizinho))

    def Todos_Conectados(self) -> bool:
        return all(no.achou_teto and no.achou_piso for no in self.Nodes)

    def Registrar_Raio_Se_Necessario(self):
        """Grava o raio na primeira vez que a esfera fecha (densidade = 1.0)."""
        if self.raio is None and self.Todos_Conectados():
            self.raio = self.iteracao_atual

    def Status_Conexao(self) -> dict:
        total      = len(self.Nodes)
        conectados = sum(1 for no in self.Nodes if no.achou_teto and no.achou_piso)
        so_teto    = sum(1 for no in self.Nodes if no.achou_teto and not no.achou_piso)
        so_piso    = sum(1 for no in self.Nodes if no.achou_piso and not no.achou_teto)
        nenhum     = sum(1 for no in self.Nodes if not no.achou_teto and not no.achou_piso)

        pendentes_por_papel = {"ceiling": [], "floor": [], "relevant": [], "gerado": []}
        for no in self.Nodes:
            if not (no.achou_teto and no.achou_piso):
                pendentes_por_papel[no.papel].append(no.valor)

        # ── Metricas do artigo (secao 4.2) ──────────────────────────────────
        densidade = round(conectados / total, 3) if total > 0 else 0

        # Eficiencia = |L| / MAX,  MAX = |E|*(|E|-1)/2
        max_relacoes = (total * (total - 1)) // 2
        eficiencia   = round(len(self.L) / max_relacoes, 3) if max_relacoes > 0 else 0

        raio = self.raio

        # Produtividade = |E| / raio  (so calculavel apos a esfera fechar)
        produtividade = round(total / raio, 2) if raio else None

        return {
            "total"              : total,
            "conectados"         : conectados,
            "so_teto"            : so_teto,
            "so_piso"            : so_piso,
            "nenhum"             : nenhum,
            # metricas
            "num_iteracoes"      : self.iteracao_atual,
            "raio"               : raio,
            "densidade"          : densidade,
            "num_relacoes"       : len(self.L),
            "max_relacoes"       : max_relacoes,
            "eficiencia"         : eficiencia,
            "produtividade"      : produtividade,
            "pendentes_por_papel": pendentes_por_papel,
        }


# ── Helpers AOF ──────────────────────────────────────────────────────────────


def _Confirmar_Tipo(label_origem: str, label_destino: str,
                    tipo_sugerido: str) -> str:
    """
    Mostra o tipo sugerido pela IA e pede confirmacao do humano.
    Se recusar ou IA nao inferiu, humano digita livremente o tipo.
    Retorna o tipo confirmado/corrigido.
    """
    print(f"\n  Relacao [{label_origem}] -> [{label_destino}]")
    print(f"  IA sugere: {tipo_sugerido if tipo_sugerido else '(nao identificado)'}")

    if not tipo_sugerido:
        while True:
            tipo = input("  Digite o tipo da relacao: ").strip()
            if tipo:
                return tipo
            print("  Tipo nao pode ser vazio.")

    confirma = input("  Confirma? (s/n): ").strip().lower()
    if confirma == 's':
        return tipo_sugerido

    while True:
        tipo = input("  Digite o tipo correto: ").strip()
        if tipo:
            return tipo
        print("  Tipo nao pode ser vazio.")


# ── IA ───────────────────────────────────────────────────────────────────────

def Analise_Ia(dominio: list[str], ei: str, gi: str) -> list[str]:
    """
    Pede a IA conceitos intermediarios que conectam ei e gi.
    Retorna lista de strings com os nomes dos intermediarios.
    """
    dominio_str = ", ".join(dominio)
    resposta = cliente.chat.complete(
        model="mistral-small-latest",
        messages=[
            {
                "role": "user",
                "content": f"""Dado o dominio composto por: {dominio_str}

Sugira ate 5 conceitos intermediarios que conectam '{ei}' e '{gi}'.

Formato obrigatorio (sem explicacoes, sem texto extra):
1. <conceito>
2. <conceito>
..."""
            }
        ]
    )

    texto  = resposta.choices[0].message.content.strip()
    linhas = texto.split("\n")

    resultados = []
    for linha in linhas:
        if not linha.strip() or not linha[0].isdigit():
            continue
        conceito = linha.split(".", 1)[-1].strip()
        if conceito:
            resultados.append(conceito)

    return resultados


def Sugerir_Tipo_Ia(dominio: list[str], origem: str, destino: str) -> str:
    """
    Pede a IA o tipo de relacao entre dois conceitos (AOF).
    Retorna o tipo sugerido ou string vazia se nao identificado.
    """
    dominio_str = ", ".join(dominio)
    resposta = cliente.chat.complete(
        model="mistral-small-latest",
        messages=[
            {
                "role": "user",
                "content": f"""Dado o dominio: {dominio_str}

Qual o tipo de relacao entre '{origem}' e '{destino}'?
Responda com apenas UM dos tipos abaixo, sem explicacoes:
{TIPOS_AOF_REF}"""
            }
        ]
    )

    tipo = resposta.choices[0].message.content.strip().lower()
    for t in TIPOS_AOF_REF.split(" | "):
        if t.lower() in tipo:
            return t
    return ""


def Buscar_Relacoes(grafo: Grafo, dominio: list[str],
                    ei: str, gi: str) -> str | None:
    """
    Fluxo completo para um par (ei, gi):
    1. IA sugere lista de intermediarios
    2. Humano escolhe qual quer
    3. IA sugere tipo de relacao de cada lado -> humano confirma/corrige
    4. Grafo, FAO e L sao atualizados
    Retorna o intermediario escolhido, "PARAR" ou None.
    """
    sugestoes = Analise_Ia(dominio, ei, gi)

    print(f"\nConceitos intermediarios entre '{ei}' e '{gi}':")
    for i, s in enumerate(sugestoes, 1):
        print(f"  {i}. {s}")

    escolha = None
    while escolha is None:
        try:
            v = int(input("\n  Escolha o numero (0 = nenhum): ").strip())
            if v == 0:
                return None
            if 1 <= v <= len(sugestoes):
                escolha = v - 1
            else:
                print("  Numero invalido.")
        except ValueError:
            print("  Numero invalido.")

    leg = sugestoes[escolha]

    tipo_ei_leg = _Confirmar_Tipo(ei,  leg, Sugerir_Tipo_Ia(dominio, ei,  leg))
    tipo_leg_gi = _Confirmar_Tipo(leg, gi,  Sugerir_Tipo_Ia(dominio, leg, gi))

    grafo.Adicionar_No(leg, ei, gi)
    grafo.Adicionar_FAO(ei, leg, tipo_ei_leg, gi, tipo_leg_gi)
    # Registra no conjunto L para calculo de Eficiencia
    grafo.Adicionar_L(gi, ei, leg)
    # Verifica se a esfera acabou de fechar com esta relacao
    grafo.Registrar_Raio_Se_Necessario()

    print(f"\n  ok: '{ei}' -[{tipo_ei_leg}]-> '{leg}' -[{tipo_leg_gi}]-> '{gi}'")
    return leg


# ── Exibicao ─────────────────────────────────────────────────────────────────

def _Imprimir_Status(grafo: Grafo, iteracao: int):
    s = grafo.Status_Conexao()

    print(f"\n{'='*44}")
    print(f"  METRICAS  —  iteracao {iteracao}")
    print(f"{'='*44}")
    print(f"  Nos na esfera            : {s['total']}")
    print(f"  Conectados (C+F)         : {s['conectados']}")
    print(f"  So teto                  : {s['so_teto']}")
    print(f"  So piso                  : {s['so_piso']}")
    print(f"  Sem marca                : {s['nenhum']}")
    print(f"  ── Metricas do artigo ──────────────────────")
    print(f"  Numero de iteracoes      : {s['num_iteracoes']}")
    raio_str = str(s['raio']) if s['raio'] else "ainda aberta"
    print(f"  Raio da esfera           : {raio_str}")
    print(f"  Densidade                : {s['densidade']}")
    print(f"  Eficiencia da iteracao   : {s['eficiencia']}  "
          f"({s['num_relacoes']} rel. / {s['max_relacoes']} possiveis)")
    prod = s['produtividade']
    prod_str = str(prod) if prod else "n/a (esfera ainda aberta)"
    print(f"  Produtividade da esfera  : {prod_str}")
    for papel, nos in s["pendentes_por_papel"].items():
        if nos:
            print(f"  Pendentes [{papel:8s}]     : {nos}")
    print(f"{'='*44}")


def _Perguntar_Visualizacao(grafo: Grafo):
    ver = input("\nDeseja visualizar o grafo agora? (s/n): ").strip().lower()
    if ver == 's':
        desenhar_grafo(grafo)





# ── Busca de pares ────────────────────────────────────────────────────────────

def Buscar_Pares_Aux(E: list[str], G: list[str], grafo: Grafo,
                     iteracao: int, pares_vistos: set):
    leg_gerados: list[str] = []
    dominio = list(dict.fromkeys(E + G))

    # Atualiza iteracao corrente no grafo (usada pelas metricas)
    grafo.iteracao_atual = iteracao

    for ei in E:
        for gi in G:
            if ei == gi:
                continue
            if (ei, gi) in pares_vistos or (gi, ei) in pares_vistos:
                continue

            pares_vistos.add((ei, gi))
            resultado = Buscar_Relacoes(grafo, dominio, ei, gi)

            if resultado:
                print(f"  '{ei}' + '{gi}' -> '{resultado}'")
                leg_gerados.append(resultado)

    leg_gerados = list(dict.fromkeys(leg_gerados))
    print(f"\n  NOVOS TERMOS: {leg_gerados}")

    _Imprimir_Status(grafo, iteracao)

    if grafo.Todos_Conectados():
        print("\nDensidade 1.0 — esfera completa. Busca encerrada.")
        _Perguntar_Visualizacao(grafo)
        return

    if leg_gerados:
        Buscar_Pares(E, leg_gerados, grafo, iteracao + 1, pares_vistos)
    else:
        print("\n  Nenhum novo termo gerado e esfera incompleta. Encerrando.")
        _Perguntar_Visualizacao(grafo)


def Buscar_Pares(E: list[str], G: list[str], grafo: Grafo,
                 iteracao: int = 1, pares_vistos: set = None):
    if pares_vistos is None:
        pares_vistos = set()
    E = list(dict.fromkeys(E + G))
    Buscar_Pares_Aux(E, G, grafo, iteracao, pares_vistos)


# ── Entrypoint ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    grafo = Grafo()

    print("\n=== SPHERE-M REMASTERED ===\n")

    teto_input = input("CEILING — conceito(s) mais generico(s), separados por virgula: ").strip()
    piso_input = input("FLOOR   — conceito(s) alvo/especifico(s), separados por virgula: ").strip()
    r_input    = input("RELEVANT ELEMENTS — palavras intermediarias, separadas por virgula: ").strip()

    C = [p.strip() for p in teto_input.split(",") if p.strip()]
    F = [p.strip() for p in piso_input.split(",") if p.strip()]
    R = [p.strip() for p in r_input.split(",")    if p.strip()]

    grafo.Inicializar(C, F, R)

    print(f"\n  C (CEILING)  : {grafo.C}")
    print(f"  F (FLOOR)    : {grafo.F}")
    print(f"  R (RELEVANT) : {grafo.R}")
    print(f"  E (DOMINIO)  : {grafo.Dominio()}\n")

    E = grafo.Dominio()
    G = E.copy()

    Buscar_Pares(E, G, grafo)