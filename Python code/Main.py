import os
from visualizacao import desenhar_grafo
from metricas import imprimir_metricas
from modelo_io import exportar_modelo, importar_modelo


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
        self.tag_natureza: str | None = None
        self.tag_caminho: str | None = None


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
        self.pares_avaliados: set[tuple[str, str]] = set()

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

    def Registrar_Par_Avaliado(self, ei: str, gi: str):
        self.pares_avaliados.add(tuple(sorted((ei, gi))))

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


def Buscar_Relacoes(grafo: Grafo, dominio: list[str],
                    ei: str, gi: str) -> str | None:
    print(f"\n{'─'*50}")
    print(f"  Par: '{gi}'  ×  '{ei}'")
    print(f"  Tipos disponíveis: {TIPOS_AOF_REF}")

    grafo.Registrar_Par_Avaliado(ei, gi)

    while True:
        resp = input(f"\n  Há relação entre '{gi}' e '{ei}'? (s/n): ").strip().lower()
        if resp in ("s", "n"):
            break
        print("  Digite s ou n.")

    if resp == "n":
        return None

    while True:
        leg = input(f"  Digite o conceito intermediário entre '{ei}' e '{gi}': ").strip()
        if leg:
            break
        print("  O conceito não pode ser vazio.")

    print(f"\n  Aresta: '{ei}' → '{leg}'")
    while True:
        tipo_ei_leg = input("  Tipo da relação (ou digite livremente): ").strip()
        if tipo_ei_leg:
            break
        print("  O tipo não pode ser vazio.")

    print(f"\n  Aresta: '{leg}' → '{gi}'")
    while True:
        tipo_leg_gi = input("  Tipo da relação (ou digite livremente): ").strip()
        if tipo_leg_gi:
            break
        print("  O tipo não pode ser vazio.")

    acao = input(
        "\n  [v] visualizar grafo  /  [e] exportar modelo  /  Enter para continuar: "
    ).strip().lower()
    if acao == "v":
        desenhar_grafo(grafo)
        continua = input("  Continuar a captura? (s = sim / n = encerrar): ").strip().lower()
        if continua != "s":
            return "PARAR"
    elif acao == "e":
        caminho = input("  Nome do arquivo (ex: minha_esfera.json): ").strip() or "minha_esfera.json"
        exportar_modelo(grafo, caminho)

    grafo.Adicionar_No(leg, ei, gi)
    grafo.Adicionar_FAO(ei, leg, tipo_ei_leg, gi, tipo_leg_gi)
    grafo.Adicionar_L(gi, ei, leg)

    print(f"\n  ok: '{ei}' -[{tipo_ei_leg}]-> '{leg}' -[{tipo_leg_gi}]-> '{gi}'")
    return leg


def _Perguntar_Visualizacao_E_Exportacao(grafo: Grafo):
    ver = input("\nDeseja visualizar o grafo agora? (s/n): ").strip().lower()
    if ver == 's':
        desenhar_grafo(grafo)

    exp = input("Deseja exportar o modelo (json) agora? (s/n): ").strip().lower()
    if exp == 's':
        caminho = input("  Nome do arquivo (ex: minha_esfera.json): ").strip() or "minha_esfera.json"
        exportar_modelo(grafo, caminho)


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
                imprimir_metricas(grafo)
                _Perguntar_Visualizacao_E_Exportacao(grafo)
                return

            if resultado:
                print(f"  '{ei}' + '{gi}' -> '{resultado}'")
                leg_gerados.append(resultado)

    leg_gerados = list(dict.fromkeys(leg_gerados))
    print(f"\n  NOVOS TERMOS: {leg_gerados}")

    grafo.Registrar_Raio_Se_Necessario()
    imprimir_metricas(grafo)

    if grafo.Todos_Conectados():
        print("\nDensidade 1.0 — esfera completa. Busca encerrada.")
        _Perguntar_Visualizacao_E_Exportacao(grafo)
        return

    parar = input("\nDeseja encerrar a captura aqui, mesmo com a esfera aberta? (s/n): ").strip().lower()
    if parar == "s":
        print("\n[!] Encerrado manualmente pelo usuario com a esfera ainda aberta.")
        _Perguntar_Visualizacao_E_Exportacao(grafo)
        return

    if leg_gerados:
        Buscar_Pares(E, leg_gerados, grafo, iteracao + 1, pares_vistos)
    else:
        print("\n  Nenhum novo termo gerado e esfera incompleta. Encerrando.")
        _Perguntar_Visualizacao_E_Exportacao(grafo)


def Buscar_Pares(E: list[str], G: list[str], grafo: Grafo,
                 iteracao: int = 1, pares_vistos: set = None):
    if pares_vistos is None:
        pares_vistos = set()
    Buscar_Pares_Aux(E, G, grafo, iteracao, pares_vistos)


if __name__ == "__main__":
    print("\n=== SPHERE-M REMASTERED ===\n")

    retomar = input(
        "Deseja importar um modelo já existente para continuar? (s/n): "
    ).strip().lower()

    if retomar == "s":
        caminho = input("  Caminho do arquivo .json: ").strip()
        grafo = importar_modelo(caminho)
        imprimir_metricas(grafo)

        if grafo.Todos_Conectados():
            print("\nEsse modelo já está com a esfera fechada.")
            _Perguntar_Visualizacao_E_Exportacao(grafo)
        else:
            E = grafo.Dominio()
            pares_vistos = {p for p in grafo.pares_avaliados}
            G = [no.valor for no in grafo.Nodes if no.papel == "gerado"] or E
            Buscar_Pares(E, G, grafo, grafo.iteracao_atual + 1, pares_vistos)

    else:
        grafo = Grafo()

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
