import networkx as nx
from pyvis.network import Network
from visualizacao import desenhar_grafo


class No_Grafo:
    def __init__(self, valor: str, vizinhos: list['No_Grafo'] = None):
        self.valor = valor
        self.vizinhos = [] if vizinhos is None else vizinhos
        self.achou_teto = False
        self.achou_piso = False


class Grafo:
    def __init__(self, Nodes: list['No_Grafo'] = None):
        self.Nodes = [] if Nodes is None else Nodes
        self.FAO = []  # LISTA DE ARESTAS: (leg, palavra, nome_aresta, iteracao)

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
        no_leg.vizinhos.append(no_ei)
        no_leg.vizinhos.append(no_gi)

    def Adicionar_FAO(self, leg: str, ei: str, gi: str, iteracao: int) -> bool:
        self.FAO.append((leg, ei, f"ligação_{ei}_{leg}", iteracao))
        self.FAO.append((leg, gi, f"ligação_{gi}_{leg}", iteracao))
        return True


def Analise_Ia(ei: str, gi: str) -> str:
    par = {ei, gi}

    # ITERAÇÃO 1
    if   par == {"cachorro", "gato"}:   return "pet"
    elif par == {"cachorro", "animal"}: return "canino"
    elif par == {"gato",     "animal"}: return "felino"

    # ITERAÇÃO 2
    elif par == {"cachorro", "pet"}:    return "fiel"
    elif par == {"gato",     "pet"}:    return "companhia"
    elif par == {"animal",   "pet"}:    return "doméstico"
    elif par == {"canino",   "felino"}: return "carnívoro"
    elif par == {"pet",      "canino"}: return "cãozinho"
    elif par == {"pet",      "felino"}: return "gatinho"
    elif par == {"animal",   "canino"}: return "lobo"
    elif par == {"animal",   "felino"}: return "leão"

    # ITERAÇÃO 3+ — RESPOSTA GENÉRICA
    else: return f"rel_{ei[:3]}_{gi[:3]}"


def Buscar_Relacoes(grafo: Grafo, ei: str, gi: str, iteracao: int) -> str:
    leg = Analise_Ia(ei, gi)
    grafo.Adicionar_No(leg, ei, gi)

    if not grafo.Adicionar_FAO(leg, ei, gi, iteracao):
        return "PARAR"

    return leg


def Buscar_Pares_Aux(E: list[str], G: list[str], grafo: Grafo, iteracao: int, pares_vistos: set):
    print(f"\n=== ITERAÇÃO {iteracao} ===")
    print(f"  E: {E}")
    print(f"  G: {G}")

    leg: list[str] = []

    for ei in E:
        for gi in G:
            if ei == gi:
                continue
            if (ei, gi) in pares_vistos or (gi, ei) in pares_vistos:
                continue

            pares_vistos.add((ei, gi))
            resultado = Buscar_Relacoes(grafo, ei, gi, iteracao)

            if resultado == "PARAR":
                print("\n[!] INTERROMPIDO. GERANDO GRAFO...")
                desenhar_grafo(grafo, iteracao_atual=iteracao)
                return

            print(f"  '{ei}' + '{gi}' → '{resultado}'")
            if resultado:
                leg.append(resultado)

    leg = list(dict.fromkeys(leg))
    print(f"  NOVOS TERMOS: {leg}")

    print("\nGERANDO VISUALIZAÇÃO PARCIAL...")
    desenhar_grafo(grafo, iteracao_atual=iteracao)

    continuar = input(f"\nIteração {iteracao} concluída ({len(leg)} novos termos). Continuar? (s/n): ")
    if continuar.strip().lower() != 's':
        print("\nBUSCA ENCERRADA.")
        return

    Buscar_Pares(E, leg, grafo, iteracao + 1, pares_vistos)


def Buscar_Pares(E: list[str], G: list[str], grafo: Grafo, iteracao: int = 1, pares_vistos: set = None):
    if pares_vistos is None:
        pares_vistos = set()

    E = list(dict.fromkeys(E + G))
    Buscar_Pares_Aux(E, G, grafo, iteracao, pares_vistos)


def teste():
    grafo = Grafo()
    E = ["cachorro", "gato", "animal"]
    G = ["cachorro", "gato", "animal"]
    Buscar_Pares(E, G, grafo)


if __name__ == "__main__":
    teste()