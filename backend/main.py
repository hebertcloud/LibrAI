from datetime import date
import asyncio
import html
import json
import os
import re
from urllib.parse import quote_plus
from xml.etree import ElementTree

from fastapi import FastAPI, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Literal
import httpx
from .sign_storage import add_example, create_sign, list_signs, initialize_database
from .services.gesture_recognizer import recognizer as gesture_recognizer

try:
    from .sign_recognition import recognizer
except (ImportError, RuntimeError) as error:
    recognizer = None
    RECOGNITION_IMPORT_ERROR = str(error)

app = FastAPI(title="LIA API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

OLLAMA_URL = "http://localhost:11434/api/generate"
OLLAMA_MODEL = "qwen2.5:3b"
TAVILY_URL = "https://api.tavily.com/search"
DUCKDUCKGO_URL = "https://api.duckduckgo.com/"
GOOGLE_NEWS_RSS_URL = "https://news.google.com/rss/search"
WIKIPEDIA_SEARCH_URL = "https://pt.wikipedia.org/w/api.php"
ELECTION_TERMS = (
    "eleição",
    "eleicoes",
    "eleições",
    "candidato",
    "candidatos",
    "votação",
    "votacao",
    "segundo turno",
    "tse",
)
LIVE_SEARCH_TERMS = (
    "atual",
    "agora",
    "hoje",
    "recentemente",
    "mais recente",
    "últimas notícias",
    "ultimas noticias",
    "notícia",
    "noticia",
    "preço",
    "preco",
    "cotação",
    "cotacao",
    "resultado",
    "segundo turno",
    "eleição",
    "eleições",
    "eleicao",
    "eleicoes",
    "presidente atual",
    "placar",
    "tempo hoje",
    "clima hoje",
)

initialize_database()


class ChatHistoryMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    mensagem: str
    historico: list[ChatHistoryMessage] = Field(default_factory=list)


class SignRecognitionRequest(BaseModel):
    imagem: str | None = None
    landmarks: list[dict[str, float]] | None = None


class SignCreateRequest(BaseModel):
    nome: str
    categoria: str


class SignExampleRequest(BaseModel):
    sinal_id: int
    landmarks: list[dict[str, float]]


def should_search_web(query: str) -> bool:
    normalized_query = query.casefold()
    return any(term in normalized_query for term in LIVE_SEARCH_TERMS)


async def search_web(client: httpx.AsyncClient, query: str) -> list[dict[str, str]]:
    api_key = os.getenv("TAVILY_API_KEY")
    if not api_key:
        return await search_duckduckgo(client, query)

    payload: dict[str, object] = {
        "api_key": api_key,
        "query": query,
        "search_depth": "advanced",
        "max_results": 5,
        "include_answer": False,
    }
    normalized_query = query.casefold()
    if any(term in normalized_query for term in ELECTION_TERMS):
        payload["include_domains"] = ["tse.jus.br", "gov.br"]

    try:
        search_response = await client.post(TAVILY_URL, json=payload, timeout=10.0)
        search_response.raise_for_status()
        results = search_response.json().get("results", [])
    except (httpx.RequestError, httpx.HTTPStatusError, ValueError):
        return []

    return [
        {
            "titulo": result.get("title", ""),
            "conteudo": result.get("content", ""),
            "url": result.get("url", ""),
        }
        for result in results
        if result.get("url") and result.get("content")
    ]


async def search_duckduckgo(
    client: httpx.AsyncClient, query: str
) -> list[dict[str, str]]:
    try:
        response = await client.get(
            DUCKDUCKGO_URL,
            params={
                "q": query,
                "format": "json",
                "no_html": 1,
                "skip_disambig": 1,
            },
            timeout=6.0,
        )
        response.raise_for_status()
        data = response.json()
    except (httpx.RequestError, httpx.HTTPStatusError, ValueError):
        return []

    results: list[dict[str, str]] = []
    if data.get("AbstractText") and data.get("AbstractURL"):
        results.append(
            {
                "titulo": data.get("Heading", "Resultado de pesquisa"),
                "conteudo": data["AbstractText"],
                "url": data["AbstractURL"],
            }
        )

    for topic in data.get("RelatedTopics", []):
        if not isinstance(topic, dict) or not topic.get("Text") or not topic.get("FirstURL"):
            continue
        results.append(
            {
                "titulo": "Resultado relacionado",
                "conteudo": topic["Text"],
                "url": topic["FirstURL"],
            }
        )
        if len(results) == 5:
            break

    wikipedia_results, news_results = await asyncio.gather(
        search_wikipedia(client, query),
        search_google_news(client, query),
    )
    return results + wikipedia_results + news_results


async def search_wikipedia(
    client: httpx.AsyncClient, query: str
) -> list[dict[str, str]]:
    try:
        response = await client.get(
            WIKIPEDIA_SEARCH_URL,
            params={
                "action": "query",
                "list": "search",
                "srsearch": query,
                "format": "json",
                "utf8": 1,
                "srlimit": 3,
            },
            timeout=6.0,
        )
        response.raise_for_status()
        pages = response.json().get("query", {}).get("search", [])
    except (httpx.RequestError, httpx.HTTPStatusError, ValueError):
        return []

    return [
        {
            "titulo": page.get("title", ""),
            "conteudo": re.sub(r"<[^>]+>", " ", html.unescape(page.get("snippet", ""))),
            "url": (
                "https://pt.wikipedia.org/wiki/"
                + quote_plus(page.get("title", "")).replace("+", "_")
            ),
        }
        for page in pages
        if page.get("title") and page.get("snippet")
    ]


async def search_google_news(
    client: httpx.AsyncClient, query: str
) -> list[dict[str, str]]:
    search_query = query
    normalized_query = query.casefold()
    if any(term in normalized_query for term in ELECTION_TERMS):
        search_query = f"{query} (site:tse.jus.br OR site:gov.br)"

    try:
        response = await client.get(
            GOOGLE_NEWS_RSS_URL,
            params={
                "q": search_query,
                "hl": "pt-BR",
                "gl": "BR",
                "ceid": "BR:pt-419",
            },
            timeout=8.0,
        )
        response.raise_for_status()
        root = ElementTree.fromstring(response.text)
    except (httpx.RequestError, httpx.HTTPStatusError, ElementTree.ParseError):
        return []

    results: list[dict[str, str]] = []
    for item in root.findall("./channel/item")[:5]:
        title = item.findtext("title", "").strip()
        url = item.findtext("link", "").strip()
        description = html.unescape(item.findtext("description", "").strip())
        description = re.sub(r"<[^>]+>", " ", description).strip()
        if title and url and description:
            results.append({"titulo": title, "conteudo": description, "url": url})
    return results


@app.get("/")
async def root() -> dict[str, str]:
    return {"status": "API da LIA rodando com sucesso!"}


@app.get("/api/signs")
async def get_signs() -> list[dict[str, object]]:
    return list_signs()


@app.post("/api/signs")
async def post_sign(request: SignCreateRequest) -> dict[str, object]:
    if not request.nome.strip() or not request.categoria.strip():
        raise HTTPException(status_code=422, detail="Nome e categoria são obrigatórios.")
    try:
        return create_sign(request.nome, request.categoria)
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@app.post("/api/signs/examples")
async def post_sign_example(request: SignExampleRequest) -> dict[str, object]:
    if len(request.landmarks) != 21:
        raise HTTPException(status_code=422, detail="O exemplo deve conter 21 landmarks.")
    try:
        example_id = add_example(request.sinal_id, request.landmarks)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    return {"id": example_id, "sinal_id": request.sinal_id, "status": "salvo"}


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request, error: RequestValidationError
) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={
            "detail": "Requisição inválida. Envie um JSON com mensagem como texto.",
            "erros": jsonable_encoder(error.errors()),
        },
        media_type="application/json; charset=utf-8",
    )


@app.post("/api/recognize-sign")
async def recognize_sign(request: SignRecognitionRequest) -> JSONResponse:
    if request.landmarks is None and request.imagem is None:
        raise HTTPException(status_code=422, detail="Envie imagem ou landmarks.")

    try:
        landmarks = request.landmarks
        if landmarks is None:
            if recognizer is None:
                raise RuntimeError(RECOGNITION_IMPORT_ERROR)
            landmarks = recognizer.recognize_base64(request.imagem).landmarks
        if len(landmarks) != 21:
            return JSONResponse(
                content={
                    "glosa": "GLOSA_DESCONHECIDA",
                    "confianca": 0.0,
                    "resposta": "Nenhuma mão foi detectada.",
                    "landmarks": [],
                    "enviar_vlibras": True,
                },
                media_type="application/json; charset=utf-8",
            )
        classification = gesture_recognizer.recognize(landmarks)
    except (ValueError, RuntimeError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    glosa = str(classification["glosa"])
    resposta = "Nenhum sinal reconhecido."
    if glosa != "GLOSA_DESCONHECIDA":
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    OLLAMA_URL,
                    json={
                        "model": OLLAMA_MODEL,
                        "system": (
                            "Você é a LIA. Receba uma glosa de Libras cadastrada e "
                            "converta-a em português claro, com ortografia, acentuação "
                            "e concordância corretas. Revise silenciosamente a frase "
                            "antes de enviá-la e não use frases fragmentadas. "
                            "Não invente contexto."
                        ),
                        "prompt": f"Glosa reconhecida: {glosa}",
                        "stream": False,
                    },
                    timeout=120.0,
                )
                response.raise_for_status()
                resposta = response.json()["response"].strip()
        except (httpx.RequestError, httpx.HTTPStatusError, ValueError, KeyError) as error:
            raise HTTPException(
                status_code=503,
                detail="Não foi possível traduzir o sinal com o Ollama.",
            ) from error

    return JSONResponse(
        content={
            "glosa": glosa,
            "confianca": classification["confianca"],
            "resposta": resposta,
            "enviar_vlibras": True,
            "landmarks": landmarks,
        },
        media_type="application/json; charset=utf-8",
    )


@app.post("/api/chat")
async def chat(request: ChatRequest) -> StreamingResponse:
    current_date = date.today().isoformat()
    history = [
        item for item in request.historico
        if item.content.strip()
    ][-12:]

    try:
        async with httpx.AsyncClient() as client:
            search_results = (
                await search_web(client, request.mensagem)
                if should_search_web(request.mensagem)
                else []
            )
            web_context = "\n\n".join(
                f"Fonte: {result['titulo']}\n"
                f"URL: {result['url']}\n"
                f"Informações: {result['conteudo']}"
                for result in search_results
            )
            history_context = "\n".join(
                f"{'Usuário' if item.role == 'user' else 'LIA'}: "
                f"{item.content.strip()}"
                for item in history
            )
            prompt = (
                "Histórico recente da conversa:\n"
                f"{history_context or '(início da conversa)'}\n\n"
                f"Mensagem atual do usuário: {request.mensagem}\n\n"
                "Responda à mensagem atual usando o histórico somente quando ele "
                "for relevante."
            )
            if web_context:
                prompt = (
                    f"Contexto encontrado em fontes da internet em {current_date}:\n"
                    f"{web_context}\n\n"
                    f"{prompt}\n\n"
                    "Responda usando o contexto quando ele for relevante. Não invente "
                    "dados que não estejam no contexto e cite somente as fontes "
                    "relacionadas ao assunto da pergunta."
                )

            ollama_payload = {
                "model": OLLAMA_MODEL,
                "system": (
                    "Você é a LIA, um assistente virtual focado em acessibilidade "
                    "e Libras. Responda exclusivamente em português brasileiro claro, "
                    "natural e correto. Antes de enviar cada resposta, revise "
                    "silenciosamente o texto completo e corrija ortografia, acentuação, "
                    "pontuação, concordância verbal e nominal, regência e ordem das "
                    "palavras. Nunca envie uma frase fragmentada ou sem sujeito e "
                    "predicado quando a resposta exigir uma frase completa. "
                    "Entenda a intenção mesmo quando o usuário digitar com erros, "
                    "abreviações, falta de acentos ou palavras trocadas; não peça "
                    "correção se o sentido estiver claro e não repita os erros. "
                    "Responda perguntas diretamente. Quando o usuário pedir um poema, "
                    "história, ideia, exemplo ou outro conteúdo criativo, produza o "
                    "conteúdo solicitado em vez de explicar que não pode fazê-lo. "
                    "Use o histórico recente para manter continuidade e lembrar fatos "
                    "já mencionados, sem inventar informações que não estejam nele. "
                    f"A data atual é {current_date}. "
                    "Converse naturalmente e responda somente ao que foi perguntado. "
                    "Não misture assuntos, não introduza futebol, eleições ou outras "
                    "informações sem relação com a pergunta e não use respostas genéricas. "
                    "Em perguntas factuais, não chute: se não tiver certeza, diga que "
                    "não tem certeza em vez de inventar uma resposta. "
                    "Só mencione o Tribunal Superior Eleitoral quando a pergunta for "
                    "explicitamente sobre eleições brasileiras. Em temas políticos e "
                    "eleitorais, seja neutra e diferencie fatos de informações não "
                    "confirmadas. Para outros temas, use a fonte pesquisada relacionada "
                    "ao tema ou diga brevemente quando não houver informação atualizada. "
                    "Se houver contexto de pesquisa, use-o apenas para verificar os fatos; "
                    "não copie erros de português das fontes. Não mostre sua revisão, "
                    "apenas envie a resposta final corrigida."
                ),
                "prompt": prompt,
                "stream": True,
                "options": {
                    "temperature": 0.35,
                    "num_predict": 512,
                },
            }
    except httpx.RequestError as error:
        raise HTTPException(
            status_code=503,
            detail="Não foi possível pesquisar na internet.",
        ) from error

    async def stream_response():
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                async with client.stream("POST", OLLAMA_URL, json=ollama_payload) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        if line:
                            data = json.loads(line)
                            if data.get("response"):
                                yield json.dumps({"resposta": data["response"]}) + "\n"
                    yield json.dumps({
                        "fim": True,
                        "fontes": [result["url"] for result in search_results],
                    }) + "\n"
        except (httpx.RequestError, httpx.HTTPStatusError, ValueError, KeyError) as error:
            yield json.dumps({"erro": str(error)}) + "\n"

    return StreamingResponse(
        stream_response(),
        media_type="application/x-ndjson; charset=utf-8",
    )
