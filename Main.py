class No_Grafo:
    def __init__(self,valor: str, vizinhos: list['No_Grafo'] = None):
        self.valor = valor
        if vizinhos is None:
            self.vizinhos = []
        else:
            self.vizinhos = vizinhos 
        self.achou_teto = False
        self.achou_piso = False
        self.peso = "0"

class Grafo:
    def __init__(self, Nodes: No_Grafo = None):
        if Nodes is None:
            self.Nodes = []
        else:
            self.Nodes = Nodes

def Buscar_Relacoes(grafo: Grafo, ei: str, gi: str) -> str:
    relacoes = {
        ("cachorro", "gato"):     "pet",
        ("cachorro", "animal"):   "mamífero",
        ("gato",     "animal"):   "peludo",
        ("pet",      "mamífero"): "doméstico",
        ("pet",      "peludo"):   "fofo",
        ("mamífero", "peludo"):   "natureza",
        ("doméstico","fofo"):     "aconchego",
        ("doméstico","natureza"): "jardim",
        ("fofo",     "natureza"): "suave",
        ("aconchego","jardim"):   "lar",
        ("aconchego","suave"):    "calmo",
        ("jardim",   "suave"):    "brisa",
    }
    return relacoes.get((ei, gi)) or relacoes.get((gi, ei), None)

def Buscar_Pares_Aux(E: list[str], G: list[str], grafo: Grafo, i: int, j: int, TAM_E: int, TAM_J: int, iteracao: int):
    if iteracao > 3: return

    print(f"\n=== ITERAÇÃO {iteracao} ===")
    print(f"  E: {E}")
    print(f"  G: {G}")

    leg: list[str] = []
    pares_vistos = set()

    while i < TAM_E:
        j = 0
        while j < TAM_J:
            ei = E[i]
            gi = G[j]
            if ei != gi:
                if (ei, gi) not in pares_vistos and (gi, ei) not in pares_vistos:
                    pares_vistos.add((gi, ei))
                    resultado = Buscar_Relacoes(grafo, ei, gi)
                    print(f"  ei='{ei}' | gi='{gi}' → '{resultado}'")
                    if resultado:
                        leg.append(resultado)
            j += 1
        i += 1

    leg = list(dict.fromkeys(leg))
    print(f"  leg: {leg}")
    Buscar_Pares(G, leg, grafo, 0, 0, iteracao + 1)


def Buscar_Pares(E: list[str], G: list[str], grafo: Grafo, i: int, j: int, iteracao: int = 1):
    E = list(dict.fromkeys(E + G))
    tam_e = len(E)
    tam_G = len(G)
    Buscar_Pares_Aux(E, G, grafo, i, j, tam_e, tam_G, iteracao)

def teste():
    grafo = Grafo()
    E = ["cachorro", "gato", "animal"]
    G = ["cachorro", "gato", "animal"]
    Buscar_Pares(E, G, grafo, 0, 0)

teste()