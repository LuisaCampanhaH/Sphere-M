"""
server.py
---------
Servidor HTTP local (Flask) que expõe as métricas de metricas.py para o
WebFront, sem duplicar nenhuma lógica de cálculo em JavaScript: recebe o
estado do grafo, reconstrói via importar_grafo.Carregar_De_Payload e
devolve o que calcular_metricas() já calcula.

Roda como um processo separado do "python -m http.server" que serve os
arquivos estáticos do WebFront.

Uso:
    python server.py
Depois acesse http://localhost:5001/ping para confirmar que está no ar.
"""
import re
from dataclasses import asdict

from flask import Flask, jsonify, request

from importar_grafo import Carregar_De_Payload
from metricas import calcular_metricas

app = Flask(__name__)

# O WebFront pode ser servido por qualquer ferramenta local — "python -m
# http.server" (porta 8000), o Live Server do VS Code (porta 5500), etc.
# Em vez de fixar uma porta só, aceitamos qualquer origem que seja a
# própria máquina do desenvolvedor (localhost/127.0.0.1, qualquer porta).
# Sem isso, o navegador bloqueia o fetch() do script.js por CORS.
ORIGEM_LOCAL = re.compile(r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$")


@app.after_request
def adicionar_cabecalhos_cors(response):
    origem = request.headers.get("Origin")
    if origem and ORIGEM_LOCAL.match(origem):
        response.headers["Access-Control-Allow-Origin"] = origem
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response


@app.route("/ping", methods=["GET"])
def ping():
    return {"status": "ok"}


@app.route("/metricas", methods=["POST"])
def metricas():
    """
    Recebe no corpo o mesmo JSON que o botão "Exportar sessão (JSON)" do
    WebFront já gera (buildSessionExport() em script.js), reconstrói o
    grafo com importar_grafo.Carregar_De_Payload e devolve o pacote de
    métricas calculado por metricas.calcular_metricas — sem reimplementar
    nenhuma fórmula em JavaScript.
    """
    payload = request.get_json(silent=True)
    if payload is None:
        return jsonify({"erro": "Corpo da requisição precisa ser um JSON válido."}), 400

    try:
        grafo = Carregar_De_Payload(payload)
        m = calcular_metricas(grafo)
    except Exception as e:
        return jsonify({"erro": f"Não foi possível calcular as métricas: {e}"}), 400

    return jsonify(asdict(m))


if __name__ == "__main__":
    app.run(port=5001, debug=True)
