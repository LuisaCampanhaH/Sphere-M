import os
from dotenv import load_dotenv
import networkx as nx
from pyvis.network import Network
from mistralai.client import Mistral
from visualizacao import desenhar_grafo

load_dotenv()
minha_chave = os.getenv("minha_api_key")
cliente = Mistral(api_key=minha_chave)

#  Tipos de relação (AOF) — referência para o prompt da IA 
# Humano digita livremente; a IA usa estes como guia no prompt.
TIPOS_AOF_REF = "é-um | é-parte-de | é-composto-por | é-uma-variação-de | é-um-atributo-de | é-um-componente-de | é-um-elemento-de | é-composto-por | é-caracterizado-por"


class No_Grafo:
    def __init__(self, valor: str, vizinhos: list['No_Grafo'] = None):
        self.valor        = valor
        self.vizinhos     = [] if vizinhos is None else vizinhos  # arestas de saida
        self.vizinhos_inv = []                                    # arestas de entrada
        self.achou_teto   = False
        self.achou_piso   = False
        self.papel: str   = "gerado"
    pass

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
    pass

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
    pass

    def Dominio(self) -> list[str]:
        return list(dict.fromkeys(self.C + self.F + self.R))
    pass

    def Buscar_No(self, valor: str) -> No_Grafo:
        for no in self.Nodes:
            if no.valor == valor:
                return no
        novo = No_Grafo(valor=valor)
        self.Nodes.append(novo)
        return novo
    pass
    def Adicionar_No(self, leg: str, ei: str, gi: str):
        # 
        # Cria arestas direcionadas: ei -> leg -> gi.
        # vizinhos_inv armazena arestas de entrada para propagacao
        # de marcas no sentido inverso sem tornar o grafo nao-direcionado.
        # 

        no_leg = self.Buscar_No(leg)
        no_ei  = self.Buscar_No(ei)
        no_gi  = self.Buscar_No(gi)

        for origem, destino in [(no_ei, no_leg), (no_leg, no_gi)]:
            if destino not in origem.vizinhos:
                origem.vizinhos.append(destino)
            if origem not in destino.vizinhos_inv:
                destino.vizinhos_inv.append(origem)

        self._Propagar_Marcas()
    pass

    def Adicionar_FAO(self, ei: str, leg: str, tipo_ei_leg: str,
                        gi: str, tipo_leg_gi: str):
        # 
        # Salva as arestas direcionadas com o tipo ontologico confirmado.
        # Formato: (origem, destino, tipo_relacao) - consistente com vizinhos direcionados.
        # 
        self.FAO.append((ei,  leg, tipo_ei_leg))
        self.FAO.append((leg, gi,  tipo_leg_gi))
    pass

    def Adicionar_L(self, gi: str, ei: str, leg: str):
        # 
        # Registra a tripla (gi, ei, [intermediario]) no conjunto L do artigo.
        # Eficiencia = |L| / MAX,  onde MAX = |E|*(|E|-1)/2
        # Se o par ja existe, apenas acumula o intermediario na lista.
        # 
        for entrada in self.L:
            if entrada[0] == gi and entrada[1] == ei:
                if leg not in entrada[2]:
                    entrada[2].append(leg)
                return
        self.L.append((gi, ei, [leg]))
    pass

    def _Propagar_Marcas(self):
        # 
        # Propaga marcas respeitando a direcionalidade:
        # - achou_teto: segue arestas de saida (vizinhos) -- de C descendo ate F.
        # - achou_piso: segue arestas de entrada (vizinhos_inv) -- de F subindo ate C.
        # 
        for flag, attr_viz in (("achou_teto", "vizinhos"),
                            ("achou_piso",  "vizinhos_inv")):
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
    pass

    def Todos_Conectados(self) -> bool:
        return all(no.achou_teto and no.achou_piso for no in self.Nodes)
    pass

    def Registrar_Raio_Se_Necessario(self):
        # Grava o raio na primeira vez que a esfera fecha (densidade = 1.0).

        if self.raio is None and self.Todos_Conectados():
            self.raio = self.iteracao_atual
    pass

    #Calcula as metricas do artigo
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

        #  Metricas do artigo (secao 4.2) 
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
    pass

#  Helpers AOF 


def _Confirmar_Tipo(label_origem: str, label_destino: str,
                    tipo_sugerido: str) -> str:
    # 
    # Mostra o tipo sugerido pela IA e pede confirmacao do humano.
    # Se recusar ou IA nao inferiu, humano digita livremente o tipo.
    # Retorna o tipo confirmado/corrigido.
    # 
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
pass

#  IA 

def Verificar_Relacao_Ia(dominio: list[str], gi: str, ei: str) -> tuple[bool, str]:
    # 
    # PASSO 1 do Algoritmo 2: determina se ha relacao entre gi e ei no dominio.
    # Retorna (ha_relacao, descricao_da_relacao).
    # Corresponde ao prompt da linha 6 do Algoritmo 2:
    #  'Determine se ha uma relacao entre gi e ei. Se houver, descreva a relacao.'
    # 
    dominio_str = ", ".join(dominio)
    resposta = cliente.chat.complete(
        model="mistral-small-latest",
        messages=[
            {
                "role": "user",
                "content": f"""Dado o dominio composto por: {dominio_str}
                Determine se ha uma relacao ontologica entre '{gi}' e '{ei}'.
                Responda EXATAMENTE neste formato (sem texto extra):
                HA_RELACAO: sim | nao
                DESCRICAO: <descricao breve da relacao, ou 'nenhuma'>"""
            }
        ]
    )

    texto = resposta.choices[0].message.content.strip().lower()

    ha_relacao = "ha_relacao: sim" in texto

    descricao = ""
    for linha in texto.split("\n"):
        if linha.startswith("descricao:"):
            descricao = linha.split(":", 1)[-1].strip()
            break

    return ha_relacao, descricao
pass

def Sugerir_Intermediarios_Ia(dominio: list[str], ei: str, gi: str,
                                descricao_relacao: str) -> list[str]:
    # 
    # PASSO 2 do Algoritmo 2: dado que ha relacao (confirmada no passo 1),
    # sugere conceitos intermediarios (leg) que materializam essa relacao.
    # Corresponde à geracao de LEG pela IA com human-in-loop (linha 7 do Alg 2).
    # 
    dominio_str = ", ".join(dominio)
    resposta = cliente.chat.complete(
        model="mistral-small-latest",
        messages=[
            {
                "role": "user",
                "content": f"""Dado o dominio composto por: {dominio_str}
                Foi identificada a seguinte relacao entre '{ei}' e '{gi}': {descricao_relacao}
                Sugira ate 5 conceitos intermediarios que representem essa relacao,
                podendo ser inseridos entre '{ei}' e '{gi}' no grafo ontologico.
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
pass

def Sugerir_Tipo_Ia(dominio: list[str], origem: str, destino: str) -> str:
    # 
    # Pede a IA o tipo de relacao entre dois conceitos (AOF).
    # Retorna o tipo sugerido ou string vazia se nao identificado.
    # 
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
pass

def Buscar_Relacoes(grafo: Grafo, dominio: list[str],
                    ei: str, gi: str) -> str | None:
    # 
    # Fluxo fiel ao Algoritmo 2 (buscaRelacoes):

    # PASSO 1 — IA determina SE ha relacao entre gi e ei e descreve qual e.
    #         (linha 6 do Alg 2: 'Determine se ha uma relacao entre gi e ei.')
    # PASSO 2 — Humano confirma (HITL) se a relacao identificada e valida.
    #         (linha 8 do Alg 2: 'if houver relacao, por intervencao humana')
    # PASSO 3 — IA sugere conceitos intermediarios (LEG) para materializar
    #         a relacao confirmada. Humano escolhe qual incluir.
    #         (linha 7 do Alg 2: 'LEG <- Lista de entes gerados pela IA com HITL')
    # PASSO 4 — IA sugere o tipo AOF de cada aresta; humano confirma/corrige.
    # PASSO 5 — Grafo, FAO e L sao atualizados.

    # Retorna o intermediario inserido ou None se nenhuma relacao foi aceita.
    # 
    print(f"\n{'─'*50}")
    print(f"  Par: '{gi}'  ×  '{ei}'")

    #  PASSO 1: IA verifica existencia da relacao 
    ha_relacao, descricao = Verificar_Relacao_Ia(dominio, gi, ei)

    if not ha_relacao:
        print(f"  IA: nenhuma relacao identificada entre '{gi}' e '{ei}'.")
        #  HITL: humano pode discordar e forcar a relacao 
        forcou = input("  Voce identifica alguma relacao mesmo assim? (s/n): ").strip().lower()
        if forcou != 's':
            return None
        descricao = input("  Descreva a relacao: ").strip()
    else:
        print(f"  IA: relacao identificada — {descricao}")
        #  PASSO 2: HITL confirma se a relacao e valida 
        confirma = input("  Confirma essa relacao? (s/n): ").strip().lower()
        if confirma != 's':
            outro = input("  Descreva a relacao correta (ou deixe vazio para ignorar): ").strip()
            if not outro:
                return None
            descricao = outro

    #  PASSO 3: IA sugere intermediarios; humano escolhe (HITL) 
    sugestoes = Sugerir_Intermediarios_Ia(dominio, ei, gi, descricao)

    if not sugestoes:
        print("  IA nao gerou intermediarios para esta relacao.")
        manual = input("  Digite um conceito intermediario manualmente (ou deixe vazio): ").strip()
        if not manual:
            return None
        sugestoes = [manual]

    print(f"\n  Conceitos intermediarios sugeridos:")
    for i, s in enumerate(sugestoes, 1):
        print(f"    {i}. {s}")

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

    #  PASSO 4: tipos AOF das arestas; humano confirma/corrige 
    tipo_ei_leg = _Confirmar_Tipo(ei,  leg, Sugerir_Tipo_Ia(dominio, ei,  leg))
    tipo_leg_gi = _Confirmar_Tipo(leg, gi,  Sugerir_Tipo_Ia(dominio, leg, gi))

    #  PASSO 5: atualiza estruturas 
    grafo.Adicionar_No(leg, ei, gi)
    grafo.Adicionar_FAO(ei, leg, tipo_ei_leg, gi, tipo_leg_gi)
    grafo.Adicionar_L(gi, ei, leg)
    # Raio e condicao de parada sao checados so ao fim da iteracao completa,
    # nao aqui — para nao fechar a esfera antes de G ser totalmente processado.

    print(f"\n  ok: '{ei}' -[{tipo_ei_leg}]-> '{leg}' -[{tipo_leg_gi}]-> '{gi}'")
    return leg
pass

# = Exibicao 

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
pass

def _Perguntar_Visualizacao(grafo: Grafo):
    ver = input("\nDeseja visualizar o grafo agora? (s/n): ").strip().lower()
    if ver == 's':
        desenhar_grafo(grafo)
pass




#  Busca de pares 

def Buscar_Pares_Aux(E: list[str], G: list[str], grafo: Grafo,
                    iteracao: int, pares_vistos: set):
    leg_gerados: list[str] = []

    # Algoritmo 1, linha 18: E ← E ∪ G no inicio de cada iteracao.
    # G continua separado — e so ele que e cruzado com E nesta rodada.
    E = list(dict.fromkeys(E + G))
    dominio = E  # dominio completo conhecido ate aqui

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

    # Raio e condicao de parada checados aqui — so apos todos os pares
    # de E x G terem sido processados, nunca no meio da iteracao.
    grafo.Registrar_Raio_Se_Necessario()
    _Imprimir_Status(grafo, iteracao)

    if grafo.Todos_Conectados():
        print("\nDensidade 1.0 — esfera completa. Busca encerrada.")
        _Perguntar_Visualizacao(grafo)
        return

    if leg_gerados:
        # E ja foi atualizado (E ∪ G) nesta iteracao; proxima rodada cruza
        # esse E expandido com os novos termos gerados (leg_gerados = novo G).
        Buscar_Pares(E, leg_gerados, grafo, iteracao + 1, pares_vistos)
    else:
        print("\n  Nenhum novo termo gerado e esfera incompleta. Encerrando.")
        _Perguntar_Visualizacao(grafo)
pass

def Buscar_Pares(E: list[str], G: list[str], grafo: Grafo,
                iteracao: int = 1, pares_vistos: set = None):
    if pares_vistos is None:
        pares_vistos = set()
    # E e G chegam separados; a fusao E ← E ∪ G e feita dentro de Buscar_Pares_Aux
    # no inicio de cada iteracao, conforme o Algoritmo 1 linha 18.
    Buscar_Pares_Aux(E, G, grafo, iteracao, pares_vistos)
pass

#  Entrypoint 

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