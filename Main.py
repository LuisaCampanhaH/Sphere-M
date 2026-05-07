import networkx as nx
import matplotlib.pyplot as plt

class No_Grafo:
    # INICIALIZAR O NODE DO GRAFO
    def __init__(self, valor: str, vizinhos: list['No_Grafo'] = None):
        self.valor = valor
        if vizinhos is None:
            self.vizinhos = []
        else:
            self.vizinhos = vizinhos 
        self.achou_teto = False # UTILIZADO PARA VERIFICAR AS CONEXÕES DO GRAFO
        self.achou_piso = False # UTILIZADO PARA VERIFICAR AS CONEXÕES DO GRAFO


class Grafo:
    def __init__(self, Nodes: list['No_Grafo'] = None):
        if Nodes is None:
            self.Nodes = []
        else:
            self.Nodes = Nodes
        self.FAO = [] # LISTA DAS ARESTAS DO GRAFO

    def Buscar_No(self, valor: str) -> No_Grafo:
        for no in self.Nodes:
            if no.valor == valor:
                return no  # ACHOU O NO, RETORNA ELE
        novo = No_Grafo(valor=valor)
        self.Nodes.append(novo)
        return novo  # NÃO ACHOU O NO, VAI CRIAR UM NO NOVO E RETORNAR ELE

    def Adicionar_No(self, leg: str, ei: str, gi: str): 
        # VAI VERIFICAR SE JA EXITE O NO PARA LIGAR-LO COM O NO LEG. SE NN TIVER CRIA UM NO
        no_leg = self.Buscar_No(leg)  # NO DA PALAVRA RELACIONADA
        no_ei  = self.Buscar_No(ei)   # NO DE EI
        no_gi  = self.Buscar_No(gi)   # NO DE GI

        # LIGA OS NOS EI e GI EM LEG
        no_leg.vizinhos.append(no_ei)  # liga leg → ei
        no_leg.vizinhos.append(no_gi)  # liga leg → gi

    def Adicionar_FAO(self, leg: str, ei: str, gi: str) -> bool:
        # ESTAMOS CRIANDO AS ARESTAS DO GRAFO
        pegar_FAO_LEG_EI = input(f"Descreva o que relaciona '{ei}' com '{leg}' (ou digite 'parar'): ")
        
        # VERIFICA A FLAG
        if pegar_FAO_LEG_EI.strip().lower() == "parar":
            return False 

        pegar_FAO_LEG_GI = input(f"Descreva o que relaciona '{gi}' com '{leg}' (ou digite 'parar'): ")
        
        # VERIFICA A FLAG
        if pegar_FAO_LEG_GI.strip().lower() == "parar":
            return False 
        
        # E O RELACIONAMOS COM AS ARESTAS SE O USUÁRIO NÃO PAROU
        self.FAO.append((leg, ei, pegar_FAO_LEG_EI))  
        self.FAO.append((leg, gi, pegar_FAO_LEG_GI))  
        return True


def desenhar_grafo(grafo: Grafo):
    G = nx.Graph()

    for (origem, destino, peso) in grafo.FAO:
        G.add_edge(origem, destino, label=peso)

    pos = nx.spring_layout(G)

    nx.draw(G, pos, with_labels=True,
            node_color="lightblue",
            node_size=2000,
            font_size=10,
            font_weight="bold")

    edge_labels = {(origem, destino): peso for (origem, destino, peso) in grafo.FAO}
    nx.draw_networkx_edge_labels(G, pos, edge_labels=edge_labels, font_size=8)

    plt.title("Grafo de Relações")
    plt.show()


def Analise_Ia(ei: str, gi: str):
    # Usamos um 'set' para que a ordem não importe {"cachorro", "gato"} == {"gato", "cachorro"}
    par = {ei, gi}
    
    # === RESPOSTAS DA ITERAÇÃO 1 ===
    if par == {"cachorro", "gato"}:
        return "pet"
    elif par == {"cachorro", "animal"}:
        return "canino"
    elif par == {"gato", "animal"}:
        return "felino"
        
    # === EXEMPLOS DE RESPOSTAS PARA A ITERAÇÃO 2 ===
    elif par == {"cachorro", "pet"}:
        return "fiel"
    elif par == {"gato", "pet"}:
        return "companhia"
    elif par == {"animal", "pet"}:
        return "doméstico"
    elif par == {"canino", "felino"}:
        return "carnívoro"
    elif par == {"pet", "canino"}:
        return "cãozinho"
    elif par == {"pet", "felino"}:
        return "gatinho"
    elif par == {"animal", "canino"}:
        return "lobo"
    elif par == {"animal", "felino"}:
        return "leão"
        
    # === RESPOSTA DINÂMICA (Para Iteração 3 em diante) ===
    else:
        return f"rel_{ei[:3]}_{gi[:3]}" 


# BUSCA A RELAÇAO ENTRE O [ei] E [gi] E RETORNA A RESPOTA DA IA
def Buscar_Relacoes(grafo: Grafo, ei: str, gi: str) -> str:
    leg = Analise_Ia(ei, gi) # PEGAR A RESPOSTA DA IA 
    grafo.Adicionar_No(leg, ei, gi) # ADICIONA O NOVO NODE NO GRAFO
    
    continuar = grafo.Adicionar_FAO(leg, ei, gi) # ADICIONA A ARESTA E VERIFICA SE O USUÁRIO PAROU
    
    if not continuar:
        return "PARAR" # Repassa o aviso de parada
        
    return leg


# FUNÇÃO AUXILIAR DE Buscar_Pares
def Buscar_Pares_Aux(E: list[str], G: list[str], grafo: Grafo, iteracao: int, pares_vistos: set):
    print(f"\n=== INICIANDO ITERAÇÃO {iteracao} ===")
    print(f"  E: {E}")
    print(f"  G: {G}")
    
    leg: list[str] = []  # LISTA DOS TERMOS RESULTADO DA RELAÇAO FEITA PELA IA

    for ei in E:
        for gi in G:
            if ei != gi:
                if (ei, gi) not in pares_vistos and (gi, ei) not in pares_vistos:
                    
                    pares_vistos.add((ei, gi))

                    resultado = Buscar_Relacoes(grafo, ei, gi)
                    
                    # VERIFICA SE O USUÁRIO DIGITOU "PARAR" NAS ARESTAS
                    if resultado == "PARAR":
                        print("\n[!] Criação de arestas interrompida. Gerando o grafo com os dados atuais...")
                        desenhar_grafo(grafo)
                        return # Quebra a recursão e encerra tudo

                    print(f"  ei='{ei}' | gi='{gi}' → '{resultado}'")

                    if resultado:
                        leg.append(resultado)

    leg = list(dict.fromkeys(leg)) # REMOVE DUPLICATAS
    print(f"  Termos novos encontrados (leg): {leg}")

    # CHAMA A FUNÇÃO DE DESENHO ANTES DA PERGUNTA
    print("\nGerando visualização parcial do grafo...")
    print("(DICA: Feche a janela com a imagem do grafo para liberar a pergunta no terminal!)")
    desenhar_grafo(grafo)

    # FLAG DE PARADA ENTRE ITERAÇÕES
    continuar = input(f"\nIteração {iteracao} concluída com {len(leg)} novos termos. Deseja iniciar a próxima iteração? (s/n): ")
    
    if continuar.strip().lower() != 's':
        print("\nBusca encerrada pelo usuário.")
        return # Quebra a recursão

    # CHAMADA RECURSIVA PARA A PRÓXIMA ITERAÇÃO
    Buscar_Pares(E, leg, grafo, iteracao + 1, pares_vistos)


# PEGA OS PARES DE PALAVRAS UNICOS DENTRO DOS GRUPOS E e G
def Buscar_Pares(E: list[str], G: list[str], grafo: Grafo, iteracao: int = 1, pares_vistos: set = None):
    # INICIALIZA O SET GLOBAL NA PRIMEIRA CHAMADA
    if pares_vistos is None:
        pares_vistos = set()

    E = list(dict.fromkeys(E + G)) # UNIAO DE E e G E REMOVE DUPLICATAS

    Buscar_Pares_Aux(E, G, grafo, iteracao, pares_vistos)


def teste():
    grafo = Grafo()
    E = ["cachorro", "gato", "animal"]
    G = ["cachorro", "gato", "animal"]
    
    Buscar_Pares(E, G, grafo) 
    
if __name__ == "__main__":
    teste()