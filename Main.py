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
        # FAO agora salva (origem, destino, tipo_relacao) conforme o artigo
        self.FAO: list[tuple[str, str, str]] = []

        self.C: list[str] = []
        self.F: list[str] = []
        self.R: list[str] = []

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
        Salva as arestas com o tipo ontológico confirmado pelo humano.
        Formato: (origem, destino, tipo_relacao)
        """
        self.FAO.append((ei,  leg, tipo_ei_leg))
        self.FAO.append((leg, gi,  tipo_leg_gi))

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

        return {
            "total"              : total,
            "conectados"         : conectados,
            "so_teto"            : so_teto,
            "so_piso"            : so_piso,
            "nenhum"             : nenhum,
            "densidade"          : round(conectados / total, 3) if total > 0 else 0,
            "pendentes_por_papel": pendentes_por_papel,
        }


# ── Helpers AOF ──────────────────────────────────────────────────────────────


def _Confirmar_Tipo(label_origem: str, label_destino: str,
                    tipo_sugerido: str) -> str:
    """
    Mostra o tipo sugerido pela IA e pede confirmação do humano.
    Se recusar ou IA não inferiu, humano digita livremente o tipo.
    Retorna o tipo confirmado/corrigido.
    """
    print(f"\n  Relação [{label_origem}] → [{label_destino}]")
    print(f"  IA sugere: {tipo_sugerido if tipo_sugerido else '(não identificado)'}")

    if not tipo_sugerido:
        # IA não inferiu — humano digita
        while True:
            tipo = input("  Digite o tipo da relação: ").strip()
            if tipo:
                return tipo
            print("  Tipo não pode ser vazio.")

    confirma = input("  Confirma? (s/n): ").strip().lower()
    if confirma == 's':
        return tipo_sugerido

    # Humano recusou — digita o tipo correto
    while True:
        tipo = input("  Digite o tipo correto: ").strip()
        if tipo:
            return tipo
        print("  Tipo não pode ser vazio.")


# ── IA ───────────────────────────────────────────────────────────────────────

def Analise_Ia(dominio: list[str], ei: str, gi: str) -> list[str]:
    """
    Pede à IA conceitos intermediários que conectam ei e gi.
    Retorna lista de strings com os nomes dos intermediários.
    Tipos de relação são tratados separadamente depois.
    """
    dominio_str = ", ".join(dominio)
    resposta = cliente.chat.complete(
        model="mistral-small-latest",
        messages=[
            {
                "role": "user",
                "content": f"""Dado o domínio composto por: {dominio_str}

Sugira até 5 conceitos intermediários que conectam '{ei}' e '{gi}'.

Formato obrigatório (sem explicações, sem texto extra):
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
    Pede à IA o tipo de relação entre dois conceitos (AOF).
    Retorna o tipo sugerido ou string vazia se não identificado.
    """
    dominio_str = ", ".join(dominio)
    resposta = cliente.chat.complete(
        model="mistral-small-latest",
        messages=[
            {
                "role": "user",
                "content": f"""Dado o domínio: {dominio_str}

Qual o tipo de relação entre '{origem}' e '{destino}'?
Responda com apenas UM dos tipos abaixo, sem explicações:
{TIPOS_AOF_REF}"""
            }
        ]
    )

    tipo = resposta.choices[0].message.content.strip().lower()
    # Valida se a resposta é um dos tipos AOF
    for t in TIPOS_AOF_REF.split(" | "):
        if t.lower() in tipo:
            return t
    return ""


def Buscar_Relacoes(grafo: Grafo, dominio: list[str],
                    ei: str, gi: str) -> str | None:
    """
    Fluxo completo para um par (ei, gi):
    1. IA sugere lista de intermediários (só nomes)
    2. Humano escolhe qual quer
    3. IA sugere tipo de relação de cada lado → humano confirma s/n ou digita o seu
    4. Grafo é atualizado com tipo semântico nas arestas
    Retorna o intermediário escolhido, "PARAR" ou None.
    """
    sugestoes = Analise_Ia(dominio, ei, gi)

    print(f"\nConceitos intermediários entre '{ei}' e '{gi}':")
    for i, s in enumerate(sugestoes, 1):
        print(f"  {i}. {s}")
    print("  0. PARAR")

    escolha = None
    while escolha is None:
        try:
            v = int(input("\n  Escolha o número: ").strip())
            if v == 0:
                return "PARAR"
            if 1 <= v <= len(sugestoes):
                escolha = v - 1
            else:
                print("  Número inválido.")
        except ValueError:
            print("  Número inválido.")

    leg = sugestoes[escolha]

    # ── IA sugere tipo de cada aresta → humano confirma/corrige ──────
    tipo_ei_leg = _Confirmar_Tipo(ei,  leg, Sugerir_Tipo_Ia(dominio, ei,  leg))
    tipo_leg_gi = _Confirmar_Tipo(leg, gi,  Sugerir_Tipo_Ia(dominio, leg, gi))

    grafo.Adicionar_No(leg, ei, gi)
    grafo.Adicionar_FAO(ei, leg, tipo_ei_leg, gi, tipo_leg_gi)

    print(f"\n  ✓ '{ei}' –[{tipo_ei_leg}]→ '{leg}' –[{tipo_leg_gi}]→ '{gi}'")
    return leg


# ── Exibição ─────────────────────────────────────────────────────────────────

def _Imprimir_Status(grafo: Grafo, iteracao: int):
    s = grafo.Status_Conexao()
    print(f"\n--- Status após iteração {iteracao} ---")
    print(f"  Total de nós      : {s['total']}")
    print(f"  Conectados (C+F)  : {s['conectados']}  |  Densidade: {s['densidade']}")
    print(f"  Só teto           : {s['so_teto']}")
    print(f"  Só piso           : {s['so_piso']}")
    print(f"  Sem marca         : {s['nenhum']}")
    for papel, nos in s["pendentes_por_papel"].items():
        if nos:
            print(f"  Pendentes [{papel:8s}]: {nos}")
    print("-----------------------------------")


def _Perguntar_Visualizacao(grafo: Grafo):
    ver = input("\nDeseja visualizar o grafo agora? (s/n): ").strip().lower()
    if ver == 's':
        desenhar_grafo(grafo)


def _Perguntar_Encerrar(grafo: Grafo, iteracao: int) -> bool:
    """
    Só chamada quando densidade = 1.0.
    Pergunta se o especialista quer continuar refinando ou encerrar.
    """
    _Imprimir_Status(grafo, iteracao)
    print("\nDensidade 1.0 — todos os nós conectados ao CEILING e ao FLOOR.")
    _Perguntar_Visualizacao(grafo)
    resposta = input("\nDeseja continuar para refinar o modelo? (s/n): ").strip().lower()
    return resposta == 's'


# ── Busca de pares ────────────────────────────────────────────────────────────

def Buscar_Pares_Aux(E: list[str], G: list[str], grafo: Grafo,
                    iteracao: int, pares_vistos: set):
    leg_gerados: list[str] = []
    dominio = list(dict.fromkeys(E + G))

    for ei in E:
        for gi in G:
            if ei == gi:
                continue
            if (ei, gi) in pares_vistos or (gi, ei) in pares_vistos:
                continue

            pares_vistos.add((ei, gi))
            resultado = Buscar_Relacoes(grafo, dominio, ei, gi)

            if resultado == "PARAR":
                print("\n[!] INTERROMPIDO PELO USUÁRIO.")
                _Perguntar_Visualizacao(grafo)
                return

            if resultado:
                print(f"  '{ei}' + '{gi}' → '{resultado}'")
                leg_gerados.append(resultado)

    leg_gerados = list(dict.fromkeys(leg_gerados))
    print(f"\n  NOVOS TERMOS: {leg_gerados}")

    _Imprimir_Status(grafo, iteracao)

    # Loop externo do Algorithm 1: só para quando densidade = 1.0
    if grafo.Todos_Conectados():
        if not _Perguntar_Encerrar(grafo, iteracao):
            print("\nBUSCA ENCERRADA.")
            return
    
    # Continua para próxima iteração com os novos termos gerados
    if leg_gerados:
        Buscar_Pares(E, leg_gerados, grafo, iteracao + 1, pares_vistos)
    else:
        print("\n⚠️  Nenhum novo termo gerado e esfera incompleta. Encerrando.")
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

    teto_input = input("CEILING — conceito(s) mais genérico(s), separados por vírgula: ").strip()
    piso_input = input("FLOOR   — conceito(s) alvo/específico(s), separados por vírgula: ").strip()
    r_input    = input("RELEVANT ELEMENTS — palavras intermediárias, separadas por vírgula: ").strip()

    C = [p.strip() for p in teto_input.split(",") if p.strip()]
    F = [p.strip() for p in piso_input.split(",") if p.strip()]
    R = [p.strip() for p in r_input.split(",")    if p.strip()]

    grafo.Inicializar(C, F, R)

    print(f"\n  C (CEILING)  : {grafo.C}")
    print(f"  F (FLOOR)    : {grafo.F}")
    print(f"  R (RELEVANT) : {grafo.R}")
    print(f"  E (DOMÍNIO)  : {grafo.Dominio()}\n")

    E = grafo.Dominio()
    G = E.copy()

    Buscar_Pares(E, G, grafo)