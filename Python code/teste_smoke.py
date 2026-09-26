"""
Teste funcional (não interativo) do motor + metricas.py + modelo_io.py.

Usa uma cadeia direta CEILING -> leg -> RELEVANT -> leg -> FLOOR (o mesmo
padrão do exemplo do Telefone nos dois artigos: ei -> leg -> gi), o que
garante fechamento previsível da esfera, pra validar cálculo de métricas
e o roundtrip de exportar/importar sem depender de input() interativo.

Atualizado para cobrir as métricas novas:
  - Cobertura por rodada (denominador fixo por rodada)
  - Decomposição de α em alpha_ia e alpha_dominio
  - Contribuição do HITL (tau_hitl / tau_ia)
"""
import os
from Main import Grafo
from metricas import calcular_metricas, imprimir_metricas
from modelo_io import exportar_modelo, importar_modelo

grafo = Grafo()
grafo.Inicializar(C=["Ceiling1"], F=["Floor1"], R=["Rel1"])

# Atributos extras necessários para as métricas novas.
# Em produção esses contadores vivem no Grafo — aqui inicializamos
# diretamente para o teste não depender de uma versão específica do Grafo.
if not hasattr(grafo, "pares_ia_sim"):
    grafo.pares_ia_sim = 0
if not hasattr(grafo, "pares_ia_sim_aceitos"):
    grafo.pares_ia_sim_aceitos = 0
if not hasattr(grafo, "pares_aceitos_modificados"):
    grafo.pares_aceitos_modificados = 0
if not hasattr(grafo, "historico_por_rodada"):
    grafo.historico_por_rodada = []

def confirmar(ei, gi, leg, tipo1, tipo2,
              ia_disse_sim=True, humano_modificou=False):
    """
    Simula uma confirmação humana de um par, registrando todos os
    contadores necessários para as métricas novas.
 
    ia_disse_sim     : True se a IA sugeriu relação para este par
    humano_modificou : True se o humano alterou o meio sugerido pela IA
    """
    grafo.Registrar_Par_Avaliado(ei, gi)
 
    if ia_disse_sim:
        grafo.pares_ia_sim += 1
        grafo.pares_ia_sim_aceitos += 1   # humano sempre confirmou aqui
 
    if humano_modificou:
        grafo.pares_aceitos_modificados += 1
 
    grafo.Adicionar_No(leg, ei, gi)
    grafo.Adicionar_FAO(ei, leg, tipo1, gi, tipo2)
    grafo.Adicionar_L(gi, ei, leg)
 
 
def registrar_historico_rodada(rodada, E_inicio, avaliados, aceitos):
    """Simula o que o Grafo registraria ao fechar cada rodada."""
    grafo.historico_por_rodada.append({
        "rodada": rodada,
        "E_inicio": E_inicio,
        "pares_avaliados": avaliados,
        "pares_aceitos": aceitos,
    })
 
 
# ── Rodada 1 ──────────────────────────────────────────────────────────
 
grafo.iteracao_atual = 1
E_inicio_r1 = len(grafo.Nodes)   # |E| fixo no início da rodada 1
 
# Relação aceita: IA disse SIM, humano confirmou sem modificar
confirmar("Ceiling1", "Rel1", "leg1", "é-um", "é-parte-de",
          ia_disse_sim=True, humano_modificou=False)
 
# Par testado e rejeitado: IA disse SIM mas humano não confirmou
grafo.Registrar_Par_Avaliado("Ceiling1", "Floor1")
grafo.pares_ia_sim += 1          # IA disse SIM mas humano pulou — não entra em aceitos
 
grafo.Registrar_Raio_Se_Necessario()
registrar_historico_rodada(rodada=1, E_inicio=E_inicio_r1,
                           avaliados=2, aceitos=1)
 
print(">>> Depois da 1a relação (esfera deve estar ABERTA — Floor1 isolado):")
m1 = imprimir_metricas(grafo)
 
assert m1.esfera_fechada is False,          "esfera deveria estar aberta"
assert m1.raio is None,                     "raio só existe ao fechar"
assert m1.produtividade is None,            "produtividade só existe ao fechar"
assert m1.pares_avaliados == 2,             f"esperado 2, obtido {m1.pares_avaliados}"
assert m1.pares_aceitos == 1,               f"esperado 1, obtido {m1.pares_aceitos}"
 
# alpha_dominio = aceitos / avaliados = 1/2
assert m1.alpha_dominio is not None
assert abs(m1.alpha_dominio - 0.5) < 1e-9, f"alpha_dominio esperado 0.5, obtido {m1.alpha_dominio}"
 
# alpha_ia = ia_aceitos / ia_sim = 1/2 (um foi rejeitado pelo humano)
assert m1.alpha_ia is not None
assert abs(m1.alpha_ia - 0.5) < 1e-9,      f"alpha_ia esperado 0.5, obtido {m1.alpha_ia}"
 
# tau_hitl = modificados / aceitos = 0/1 = 0.0 (humano não modificou nada)
assert m1.tau_hitl is not None
assert abs(m1.tau_hitl - 0.0) < 1e-9,      f"tau_hitl esperado 0.0, obtido {m1.tau_hitl}"
assert abs(m1.tau_ia - 1.0) < 1e-9,        f"tau_ia esperado 1.0, obtido {m1.tau_ia}"
 
# Cobertura global: só uma rodada ainda
assert len(m1.cobertura_por_rodada) == 1
assert m1.cobertura_por_rodada[0]["rodada"] == 1
 
 
# ── Rodada 2 ──────────────────────────────────────────────────────────
 
grafo.iteracao_atual = 2
E_inicio_r2 = len(grafo.Nodes)   # |E| fixo no início da rodada 2 (cresceu com leg1)
 
# Relação aceita: IA disse SIM, humano modificou o meio sugerido
confirmar("Rel1", "Floor1", "leg2", "é-parte-de", "é-parte-de",
          ia_disse_sim=True, humano_modificou=True)
 
grafo.Registrar_Raio_Se_Necessario()
registrar_historico_rodada(rodada=2, E_inicio=E_inicio_r2,
                           avaliados=1, aceitos=1)
 
print("\n>>> Depois da 2a relação (esfera deve FECHAR):")
m2 = imprimir_metricas(grafo)
 
assert m2.esfera_fechada is True,  "esfera deveria ter fechado"
assert m2.raio == 2,               f"raio esperado 2, obtido {m2.raio}"
assert m2.produtividade == round(m2.total_elementos / 2, 2)
 
# Agora alpha_ia = 2/3 (2 aceitos de 3 sugeridos pela IA)
assert m2.alpha_ia is not None
assert abs(m2.alpha_ia - round(2/3, 3)) < 1e-6, \
    f"alpha_ia esperado {round(2/3,3)}, obtido {m2.alpha_ia}"
 
# tau_hitl = 1/2 (1 modificado de 2 aceitos)
assert m2.tau_hitl is not None
assert abs(m2.tau_hitl - 0.5) < 1e-9, f"tau_hitl esperado 0.5, obtido {m2.tau_hitl}"
assert abs(m2.tau_ia - 0.5) < 1e-9,   f"tau_ia esperado 0.5, obtido {m2.tau_ia}"
 
# Cobertura por rodada: agora duas entradas
assert len(m2.cobertura_por_rodada) == 2
r1 = m2.cobertura_por_rodada[0]
r2 = m2.cobertura_por_rodada[1]
assert r1["E_inicio"] == E_inicio_r1, "E_inicio da rodada 1 incorreto"
assert r2["E_inicio"] == E_inicio_r2, "E_inicio da rodada 2 incorreto"
# Cobertura da rodada 2: 1 avaliado / MAX(E_inicio_r2)
MAX_r2 = (E_inicio_r2 * (E_inicio_r2 - 1)) // 2
assert r2["MAX_r"] == MAX_r2, f"MAX_r2 esperado {MAX_r2}, obtido {r2['MAX_r']}"
 
 
# ── Delta ─────────────────────────────────────────────────────────────
 
for no in grafo.Nodes:
    if no.papel == "gerado":
        no.tag_caminho = "positivo"
grafo.Buscar_No("Ceiling1").tag_caminho = "negativo"
 
m3 = calcular_metricas(grafo)
print(f"\nDelta = {m3.delta}   (positivo={m3.positivos} negativo={m3.negativos})")
assert m3.delta is not None, "Delta deveria estar definido"
 
 
# ── Roundtrip exportar/importar ───────────────────────────────────────
 
caminho_teste = "teste_export.json"
exportar_modelo(grafo, caminho_teste)
grafo2 = importar_modelo(caminho_teste)
 
m_original  = calcular_metricas(grafo)
m_importado = calcular_metricas(grafo2)
 
print("\n>>> Roundtrip exportar/importar:")
campos = [
    "total_elementos", "esfera_fechada", "raio", "densidade",
    "pares_avaliados", "pares_aceitos",
    "alpha_dominio", "alpha_ia",
    "tau_hitl", "tau_ia",
    "delta", "produtividade",
    "cobertura_global",
]
tudo_ok = True
for campo in campos:
    v1 = getattr(m_original, campo)
    v2 = getattr(m_importado, campo)
    ok = (v1 == v2)
    tudo_ok &= ok
    print(f"  {campo:20s}: original={v1!r:>10}  importado={v2!r:>10}  [{'OK' if ok else 'DIVERGIU'}]")
 
os.remove(caminho_teste)
assert tudo_ok, "roundtrip exportar/importar divergiu em algum campo"
 
print("\n✅ Todos os testes passaram.")
