"""
Teste funcional (não interativo) do motor + metricas.py + modelo_io.py.

Usa uma cadeia direta CEILING -> leg -> RELEVANT -> leg -> FLOOR (o mesmo
padrão do exemplo do Telefone nos dois artigos: ei -> leg -> gi), o que
garante fechamento previsível da esfera, pra validar cálculo de métricas
e o roundtrip de exportar/importar sem depender de input() interativo.
"""
import os
from Main import Grafo
from metricas import calcular_metricas, imprimir_metricas
from modelo_io import exportar_modelo, importar_modelo

grafo = Grafo()
grafo.Inicializar(C=["Ceiling1"], F=["Floor1"], R=["Rel1"])

def confirmar(ei, gi, leg, tipo1, tipo2):
    grafo.Registrar_Par_Avaliado(ei, gi)
    grafo.Adicionar_No(leg, ei, gi)
    grafo.Adicionar_FAO(ei, leg, tipo1, gi, tipo2)
    grafo.Adicionar_L(gi, ei, leg)

grafo.iteracao_atual = 1

# 1a relação: liga CEILING ao RELEVANT (esfera ainda não fecha - falta o FLOOR)
confirmar("Ceiling1", "Rel1", "leg1", "é-um", "é-parte-de")
# um par testado e rejeitado (só entra na Cobertura, não na aceitação)
grafo.Registrar_Par_Avaliado("Ceiling1", "Floor1")

grafo.Registrar_Raio_Se_Necessario()
print(">>> Depois da 1a relação (esfera deve estar ABERTA — Floor1 isolado):")
m1 = imprimir_metricas(grafo)
assert m1.esfera_fechada is False
assert m1.raio is None
assert m1.produtividade is None
assert m1.pares_avaliados == 2
assert m1.pares_aceitos == 1
assert abs(m1.taxa_aceitacao - 0.5) < 1e-9

# 2a relação: liga RELEVANT ao FLOOR -> fecha a cadeia inteira
grafo.iteracao_atual = 2
confirmar("Rel1", "Floor1", "leg2", "é-parte-de", "é-parte-de")
grafo.Registrar_Raio_Se_Necessario()

print("\n>>> Depois da 2a relação (esfera deve FECHAR):")
m2 = imprimir_metricas(grafo)
assert m2.esfera_fechada is True
assert m2.raio == 2
assert m2.produtividade == round(m2.total_elementos / 2, 2)

# --- Delta ---
for no in grafo.Nodes:
    if no.papel == "gerado":
        no.tag_caminho = "positivo"
grafo.Buscar_No("Ceiling1").tag_caminho = "negativo"

m3 = calcular_metricas(grafo)
print(f"\nDelta = {m3.delta}   (positivo={m3.positivos} negativo={m3.negativos})")
assert m3.delta is not None

# --- roundtrip exportar/importar ---
caminho_teste = "teste_export.json"
exportar_modelo(grafo, caminho_teste)
grafo2 = importar_modelo(caminho_teste)

m_original  = calcular_metricas(grafo)
m_importado = calcular_metricas(grafo2)

campos = ["total_elementos", "esfera_fechada", "raio", "densidade",
          "pares_avaliados", "pares_aceitos", "delta", "produtividade"]
tudo_ok = True
for campo in campos:
    v1, v2 = getattr(m_original, campo), getattr(m_importado, campo)
    ok = (v1 == v2)
    tudo_ok &= ok
    print(f"  {campo:16s}: original={v1!r:>10}  importado={v2!r:>10}  [{'OK' if ok else 'DIVERGIU'}]")

os.remove(caminho_teste)
assert tudo_ok, "roundtrip exportar/importar divergiu em algum campo"

print("\n✅ Todos os testes passaram.")
