import os
from dotenv import load_dotenv
import networkx as nx
from pyvis.network import Network
from mistralai.client import Mistral
from visualizacao import desenhar_grafo

load_dotenv()
minha_chave = os.getenv("minha_api_key")
cliente = Mistral(api_key=minha_chave)

class No_Grafo:
    def __init__(self, valor: str, vizinhos: list['No_Grafo'] = None):
        self.valor = valor
        self.vizinhos = [] if vizinhos is None else vizinhos
        self.achou_teto = False  # FLAG: NÓ JÁ TEM CONEXÃO ACIMA
        self.achou_piso = False  # FLAG: NÓ JÁ TEM CONEXÃO ABAIXO


class Grafo:
    def __init__(self, Nodes: list['No_Grafo'] = None):
        self.Nodes = [] if Nodes is None else Nodes
        self.FAO = []  # LISTA DE ARESTAS: (leg, palavra, nome_aresta)

    def Buscar_No(self, valor: str) -> No_Grafo:
        # RETORNA O NÓ SE JÁ EXISTIR, SENÃO CRIA UM NOVO
        for no in self.Nodes:
            if no.valor == valor:
                return no
        novo = No_Grafo(valor=valor)
        self.Nodes.append(novo)
        return novo

    def Adicionar_No(self, leg: str, ei: str, gi: str):
        # BUSCA OU CRIA OS NÓS E LIGA EI e GI AO LEG
        no_leg = self.Buscar_No(leg)
        no_ei  = self.Buscar_No(ei)
        no_gi  = self.Buscar_No(gi)
        no_leg.vizinhos.append(no_ei)
        no_leg.vizinhos.append(no_gi)

    def Adicionar_FAO(self, leg: str, ei: str, gi: str) -> bool:
        # REGISTRA AS DUAS ARESTAS DO PAR NA LISTA FAO
        self.FAO.append((leg, ei, f"ligação_{ei}_{leg}"))
        self.FAO.append((leg, gi, f"ligação_{gi}_{leg}"))
        return True


def Analise_Ia(ei: str, gi: str) -> str:
    # RETORNA O CONCEITO QUE RELACIONA EI e GI
    # ORDEM NÃO IMPORTA: {a, b} == {b, a}
    resposta = cliente.chat.complete(
        model="mistral-small-latest",
        messages=[
            {
                "role":"user",
                "content": f"""
                Identifique palavras isoladas, como substantivos ou adjetivos, que relacionem as duas palavras fornecidas abaixo. É estritamente proibido o uso
                de frases, sentenças, verbos de ligação, explicações ou conectivos lógicos como 'é um tipo de' ou 'faz parte de'. 
                O foco deve ser em atributos, características e associações diretas.
                Responda APENAS com uma lista enumerada das palavras encontradas, sem explicações extras e sem frases, apenas palavras. 

                Palavra A: {ei}
                Palavra B: {gi}
                """
            }
        ]
    )

    texto = resposta.choices[0].message.content.strip()
    linhas = texto.split("\n")
    relacoes = [l.split(".", 1)[-1].strip() for l in linhas if l.strip() and l[0].isdigit()]

    print(f"\nRelações entre '{ei}' e '{gi}':")
    for i, r in enumerate(relacoes, 1):
        print(f" {i} . {r}")

    escolha = 1
    while escolha != 0:
        try:
            escolha = int(input("\nEscolha o número: (Digite 0 para PARAR)\n"))
            if 1 <= escolha <= len(relacoes):
                return relacoes[escolha - 1]
        except ValueError:
            pass
        print("Numero invalido, tente outro")


def Buscar_Relacoes(grafo: Grafo, ei: str, gi: str) -> str:
    # CONSULTA A IA, ADICIONA O NÓ E A ARESTA AO GRAFO
    leg = Analise_Ia(ei, gi)
    grafo.Adicionar_No(leg, ei, gi)

    if not grafo.Adicionar_FAO(leg, ei, gi):
        return "PARAR"

    return leg


def Buscar_Pares_Aux(E: list[str], G: list[str], grafo: Grafo, iteracao: int, pares_vistos: set):
    """print(f"\n=== ITERAÇÃO {iteracao} ===")
    print(f"  E: {E}")
    print(f"  G: {G}")"""

    leg: list[str] = []  # CONCEITOS GERADOS NESSA ITERAÇÃO

    for ei in E:
        for gi in G:
            if ei == gi:
                continue
            if (ei, gi) in pares_vistos or (gi, ei) in pares_vistos:
                continue

            pares_vistos.add((ei, gi))
            resultado = Buscar_Relacoes(grafo, ei, gi)

            if resultado == "PARAR":
                # USUÁRIO INTERROMPEU — DESENHA O QUE TEM E ENCERRA
                print("\n[!] INTERROMPIDO. GERANDO GRAFO...")
                desenhar_grafo(grafo)
                return

            print(f"  '{ei}' + '{gi}' → '{resultado}'")
            if resultado:
                leg.append(resultado)

    leg = list(dict.fromkeys(leg))  # REMOVE DUPLICATAS MANTENDO ORDEM
    print(f"  NOVOS TERMOS: {leg}")

    print("\nGERANDO VISUALIZAÇÃO PARCIAL...")
    desenhar_grafo(grafo)

    continuar = input(f"\nIteração {iteracao} concluída ({len(leg)} novos termos). Continuar? (s/n): ")
    if continuar.strip().lower() != 's':
        print("\nBUSCA ENCERRADA.")
        return

    Buscar_Pares(E, leg, grafo, iteracao + 1, pares_vistos)


def Buscar_Pares(E: list[str], G: list[str], grafo: Grafo, iteracao: int = 1, pares_vistos: set = None):
    if pares_vistos is None:
        pares_vistos = set()

    E = list(dict.fromkeys(E + G))  # UNIÃO DE E e G SEM DUPLICATAS
    Buscar_Pares_Aux(E, G, grafo, iteracao, pares_vistos)


if __name__ == "__main__":
    grafo = Grafo()
    Teto = input("Digite a primeira palavra: ").strip()
    Piso = input("Digite a segunda palavra: ").strip()
    R = [p.strip() for p in input("Digite as palavras relacionadas ao tema, separadas por vírgula: ").split(",")]
    
    E = list(dict.fromkeys([Teto, Piso] + R))  # UNIÃO SEM DUPLICATAS
    G = E.copy()                                # CÓPIA INDEPENDENTE DE E
    
    Buscar_Pares(E, G, grafo)