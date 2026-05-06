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

# ============================================================
# STUB
# ============================================================
def Buscar_Relacoes(grafo: Grafo, ei: str, gi: str) -> str:
    relacoes = {
        # Iteração 1
        ("cachorro", "animal"):   "mamífero",
        ("cachorro", "gato"):     "pet",
        ("animal",   "gato"):     "peludo",
        # Iteração 2
        ("cachorro", "mamífero"): "pelagem",
        ("cachorro", "pet"):      "dono",
        ("cachorro", "peludo"):   "raça",
        ("animal",   "mamífero"): "vertebrado",
        ("animal",   "pet"):      "adoção",
        ("animal",   "peludo"):   "selvagem",
        ("gato",     "mamífero"): "felino",
        ("gato",     "pet"):      "arranhão",
        ("gato",     "peludo"):   "pelo",
        ("mamífero", "pet"):      "doméstico",
        ("mamífero", "peludo"):   "natureza",
        ("pet",      "peludo"):   "fofo",
        # Iteração 3
        ("pelagem",    "dono"):       "vínculo",
        ("pelagem",    "raça"):       "genética",
        ("pelagem",    "vertebrado"): "espécie",
        ("pelagem",    "adoção"):     "resgate",
        ("pelagem",    "selvagem"):   "instinto",
        ("pelagem",    "felino"):     "textura",
        ("pelagem",    "arranhão"):   "defesa",
        ("pelagem",    "pelo"):       "pelúcia",
        ("pelagem",    "doméstico"):  "convívio",
        ("pelagem",    "natureza"):   "habitat",
        ("pelagem",    "fofo"):       "afeto",
        ("dono",       "raça"):       "criador",
        ("dono",       "vertebrado"): "cuidado",
        ("dono",       "adoção"):     "responsabilidade",
        ("dono",       "selvagem"):   "domesticação",
        ("dono",       "felino"):     "gateiro",
        ("dono",       "arranhão"):   "arranhado",
        ("dono",       "pelo"):       "alergia",
        ("dono",       "doméstico"):  "lar",
        ("dono",       "natureza"):   "passeio",
        ("dono",       "fofo"):       "carinho",
        ("raça",       "vertebrado"): "evolução",
        ("raça",       "adoção"):     "mix",
        ("raça",       "selvagem"):   "ancestral",
        ("raça",       "felino"):     "siamês",
        ("raça",       "arranhão"):   "territorial",
        ("raça",       "pelo"):       "pelagem",
        ("raça",       "doméstico"):  "criação",
        ("raça",       "natureza"):   "adaptação",
        ("raça",       "fofo"):       "pelúcia",
        ("vertebrado", "adoção"):     "proteção",
        ("vertebrado", "selvagem"):   "fauna",
        ("vertebrado", "felino"):     "predador",
        ("vertebrado", "arranhão"):   "garra",
        ("vertebrado", "pelo"):       "cobertura",
        ("vertebrado", "doméstico"):  "companheiro",
        ("vertebrado", "natureza"):   "ecossistema",
        ("vertebrado", "fofo"):       "pelagem",
        ("adoção",     "selvagem"):   "reabilitação",
        ("adoção",     "felino"):     "gatil",
        ("adoção",     "arranhão"):   "adaptação",
        ("adoção",     "pelo"):       "alergia",
        ("adoção",     "doméstico"):  "família",
        ("adoção",     "natureza"):   "vida",
        ("adoção",     "fofo"):       "amor",
        ("selvagem",   "felino"):     "leão",
        ("selvagem",   "arranhão"):   "ataque",
        ("selvagem",   "pelo"):       "muda",
        ("selvagem",   "doméstico"):  "taming",
        ("selvagem",   "natureza"):   "floresta",
        ("selvagem",   "fofo"):       "filhote",
        ("felino",     "arranhão"):   "unha",
        ("felino",     "pelo"):       "bigode",
        ("felino",     "doméstico"):  "miau",
        ("felino",     "natureza"):   "caça",
        ("felino",     "fofo"):       "gatinho",
        ("arranhão",   "pelo"):       "coceira",
        ("arranhão",   "doméstico"):  "mobília",
        ("arranhão",   "natureza"):   "árvore",
        ("arranhão",   "fofo"):       "brincadeira",
        ("pelo",       "doméstico"):  "escova",
        ("pelo",       "natureza"):   "muda",
        ("pelo",       "fofo"):       "pelúcia",
        ("doméstico",  "natureza"):   "jardim",
        ("doméstico",  "fofo"):       "aconchego",
        ("natureza",   "fofo"):       "suave",
    }

    resultado = relacoes.get((ei, gi)) or relacoes.get((gi, ei), None)
    return resultado


# ============================================================
# BUSCAR PARES
# ============================================================
def Buscar_Pares_Aux(E: list[str], G: list[str], grafo: Grafo, i: int, j: int, TAM_E: int, TAM_J: int, iteracao: int):
    if iteracao > 3: return

    print(f"\n=== ITERAÇÃO {iteracao} ===")
    print(f"  E: {E}")
    print(f"  G: {G}")

    leg: list[str] = []
    while i < TAM_E:
        j = i + 1
        while j < TAM_J:
            if E[i] != G[j]:
                resultado = Buscar_Relacoes(grafo, E[i], G[j])
                print(f"  ei='{E[i]}' | gi='{G[j]}' → '{resultado}'")
                if resultado:
                    leg.append(resultado)
                j += 1
            else: j += 1
        i += 1

    leg = list(dict.fromkeys(leg))
    print(f"  leg: {leg}")

    Buscar_Pares(G, leg, grafo, 0, 0, iteracao + 1)
pass 

def Buscar_Pares(E: list[str], G: list[str], grafo: Grafo, i: int, j: int, iteracao: int = 1):
    E = list(dict.fromkeys(E + G))
    tam_e = len(E)
    tam_G = len(G)
    Buscar_Pares_Aux(E, G, grafo, i, j, tam_e, tam_G, iteracao)


# ============================================================
# TESTE
# ============================================================
def teste():
    grafo = Grafo()
    E = ["cachorro", "animal", "gato"]
    G = ["cachorro", "animal", "gato"]
    Buscar_Pares(E, G, grafo, 0, 0)

teste()