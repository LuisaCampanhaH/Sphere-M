import os
import networkx as nx
from pyvis.network import Network
from visualizacao import desenhar_grafo


#  Tipos de relação (AOF) — referência para o humano 
TIPOS_AOF_REF = "é-um | é-parte-de | é-composto-por | é-uma-variação-de | é-um-atributo-de | é-um-componente-de | é-um-elemento-de | é-caracterizado-por"


class No_Grafo:
    def __init__(self, valor: str, vizinhos: list['No_Grafo'] = None):
        self.valor        = valor
        self.vizinhos     = [] if vizinhos is None else vizinhos
        self.vizinhos_inv = []
        self.achou_teto   = False
        self.achou_piso   = False
        self.papel: str   = "gerado"


class Grafo:
    def __init__(self, Nodes: list['No_Grafo'] = None):
        self.Nodes = [] if Nodes is None else Nodes
        self.FAO: list[tuple[str, str, str]] = []
        self.L: list[tuple[str, str, list[str]]] = []
        self.C: list[str] = []
        self.F: list[str] = []
        self.R: list[str] = []
        self.raio: int | None = None
        self.iteracao_atual: int = 0

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

        for origem, destino in [(no_ei, no_leg), (no_leg, no_gi)]:
            if destino not in origem.vizinhos:
                origem.vizinhos.append(destino)
            if origem not in destino.vizinhos_inv:
                destino.vizinhos_inv.append(origem)

        self._Propagar_Marcas()

    def Adicionar_FAO(self, ei: str, leg: str, tipo_ei_leg: str,
                      gi: str, tipo_leg_gi: str):
        self.FAO.append((ei,  leg, tipo_ei_leg))
        self.FAO.append((leg, gi,  tipo_leg_gi))

    def Adicionar_L(self, gi: str, ei: str, leg: str):
        for entrada in self.L:
            if entrada[0] == gi and entrada[1] == ei:
                if leg not in entrada[2]:
                    entrada[2].append(leg)
                return
        self.L.append((gi, ei, [leg]))

    def _Propagar_Marcas(self):
        for flag, attr_viz in (("achou_teto", "vizinhos"),
                               ("achou_piso", "vizinhos_inv")):
            fila   = [no for no in self.Nodes if getattr(no, flag)]
            vistos = set(id(no) for no in fila)
            while fila:
                atual = fila.pop(0)
                for vizinho in getattr(atual, attr_viz):
                    if not getattr(vizinho, flag):
                        setattr(vizinho, flag, True)
                        if id(vizinho) not in vistos:
                            fila.append(vizinho)
                            vistos.add(id(vizinho))

    def Todos_Conectados(self) -> bool:
        return all(no.achou_teto and no.achou_piso for no in self.Nodes)

    def Registrar_Raio_Se_Necessario(self):
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

        densidade    = round(conectados / total, 3) if total > 0 else 0
        max_relacoes = (total * (total - 1)) // 2
        eficiencia   = round(len(self.L) / max_relacoes, 3) if max_relacoes > 0 else 0
        raio         = self.raio
        produtividade = round(total / raio, 2) if raio else None

        return {
            "total"              : total,
            "conectados"         : conectados,
            "so_teto"            : so_teto,
            "so_piso"            : so_piso,
            "nenhum"             : nenhum,
            "num_iteracoes"      : self.iteracao_atual,
            "raio"               : raio,
            "densidade"          : densidade,
            "num_relacoes"       : len(self.L),
            "max_relacoes"       : max_relacoes,
            "eficiencia"         : eficiencia,
            "produtividade"      : produtividade,
            "pendentes_por_papel": pendentes_por_papel,
        }


# ─────────────────────────────────────────────
#  Busca de relações — 100% manual (sem IA)
# ─────────────────────────────────────────────

def Buscar_Relacoes(grafo: Grafo, dominio: list[str],
                    ei: str, gi: str) -> str | None:
    """
    O humano decide tudo:
      1. Se há relação entre ei e gi.
      2. Qual o conceito intermediário (leg).
      3. O tipo AOF de cada aresta.
    """
    print(f"\n{'─'*50}")
    print(f"  Par: '{gi}'  ×  '{ei}'")
    print(f"  Tipos disponíveis: {TIPOS_AOF_REF}")

    # PASSO 1 — há relação?
    while True:
        resp = input(f"\n  Há relação entre '{gi}' e '{ei}'? (s/n): ").strip().lower()
        if resp in ("s", "n"):
            break
        print("  Digite s ou n.")

    if resp == "n":
        return None

    # PASSO 2 — conceito intermediário
    while True:
        leg = input(f"  Digite o conceito intermediário entre '{ei}' e '{gi}': ").strip()
        if leg:
            break
        print("  O conceito não pode ser vazio.")

    # PASSO 3 — tipo da aresta ei → leg
    print(f"\n  Aresta: '{ei}' → '{leg}'")
    while True:
        tipo_ei_leg = input("  Tipo da relação (ou digite livremente): ").strip()
        if tipo_ei_leg:
            break
        print("  O tipo não pode ser vazio.")

    # PASSO 3 — tipo da aresta leg → gi
    print(f"\n  Aresta: '{leg}' → '{gi}'")
    while True:
        tipo_leg_gi = input("  Tipo da relação (ou digite livremente): ").strip()
        if tipo_leg_gi:
            break
        print("  O tipo não pode ser vazio.")

    # PASSO 4 — opção de visualizar o grafo antes de continuar
    ver = input("\n  Deseja visualizar o grafo agora? (s/n): ").strip().lower()
    if ver == "s":
        desenhar_grafo(grafo)
        continua = input("  Continuar? (s = sim / n = encerrar): ").strip().lower()
        if continua != "s":
            return "PARAR"

    # PASSO 5 — atualiza estruturas
    grafo.Adicionar_No(leg, ei, gi)
    grafo.Adicionar_FAO(ei, leg, tipo_ei_leg, gi, tipo_leg_gi)
    grafo.Adicionar_L(gi, ei, leg)

    print(f"\n  ok: '{ei}' -[{tipo_ei_leg}]-> '{leg}' -[{tipo_leg_gi}]-> '{gi}'")
    return leg


# ─────────────────────────────────────────────
#  Exibição de métricas
# ─────────────────────────────────────────────

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


# ─────────────────────────────────────────────
#  Busca de pares
# ─────────────────────────────────────────────

def Buscar_Pares_Aux(E: list[str], G: list[str], grafo: Grafo,
                     iteracao: int, pares_vistos: set):
    leg_gerados: list[str] = []

    E = list(dict.fromkeys(E + G))
    dominio = E

    grafo.iteracao_atual = iteracao

    for ei in E:
        for gi in G:
            if ei == gi:
                continue
            if (ei, gi) in pares_vistos or (gi, ei) in pares_vistos:
                continue

            pares_vistos.add((ei, gi))
            resultado = Buscar_Relacoes(grafo, dominio, ei, gi)

            if resultado == "PARAR":
                print("\n[!] Interrompido pelo usuario.")
                return

            if resultado:
                print(f"  '{ei}' + '{gi}' -> '{resultado}'")
                leg_gerados.append(resultado)

    leg_gerados = list(dict.fromkeys(leg_gerados))
    print(f"\n  NOVOS TERMOS: {leg_gerados}")

    grafo.Registrar_Raio_Se_Necessario()
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
    Buscar_Pares_Aux(E, G, grafo, iteracao, pares_vistos)


# ─────────────────────────────────────────────
#  Entrypoint
# ─────────────────────────────────────────────

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