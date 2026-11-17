# LIA

Assistente virtual de acessibilidade para Libras, desenvolvido para reconhecer sinais capturados pela câmera, traduzir glosas para português e oferecer uma interface de conversa integrada ao VLibras.

O projeto foi desenvolvido no curso Técnico em Informática do Instituto Federal de Educação, Ciência e Tecnologia da Bahia (IFBA), Campus Euclides da Cunha.

## Funcionalidades

- Chat em português com a LIA usando um modelo Ollama executado localmente.
- Respostas em streaming, exibidas enquanto o modelo gera o texto.
- Memória da conversa recente, preservada no navegador para manter o contexto após recarregar a página.
- Interpretação de erros de digitação, abreviações e pedidos criativos como poemas e histórias.
- Pesquisa na internet para perguntas sobre assuntos atuais, notícias, preços, clima, resultados e eleições.
- Reconhecimento de uma mão pela câmera usando MediaPipe Hands.
- Extração de 21 landmarks da mão e classificação de gestos.
- Cadastro de sinais, categorias e exemplos de landmarks em SQLite.
- Tradução visual das respostas por meio do widget VLibras.
- Interface React responsiva com abas para conversa, reconhecimento e cadastro.

## Tecnologias utilizadas

### Backend

- Python 3.10 ou superior, recomendado Python 3.11.
- FastAPI para a API HTTP.
- Uvicorn para executar o servidor ASGI.
- Ollama com o modelo `qwen2.5:3b` para geração e tradução de respostas.
- MediaPipe Tasks para detecção de mãos.
- OpenCV e NumPy para processamento de imagens.
- SQLite para persistência dos sinais e exemplos.
- HTTPX para comunicação com o Ollama e serviços de busca.
- Pydantic para validação das requisições.

### Frontend

- React e React DOM.
- TypeScript.
- Vite.
- `react-webcam` para captura de câmera.
- MediaPipe Hands carregado no navegador para análise dos frames.
- Widget VLibras carregado do serviço oficial.

## Pré-requisitos

Instale os seguintes programas antes de executar o projeto:

- Git.
- Python 3.10 ou superior.
- Node.js 18 ou superior, com npm.
- Ollama.
- Um navegador com suporte a câmera, como Chrome, Edge ou Firefox.
- Permissão de acesso à câmera para o endereço local da aplicação.

O backend baixa automaticamente o modelo `hand_landmarker.task` caso ele não esteja em `backend/models/`. O chat também exige que o modelo do Ollama esteja disponível localmente.

## Instalação

Os comandos abaixo usam o PowerShell no Windows. Os comandos equivalentes funcionam em macOS e Linux, substituindo a ativação do ambiente virtual conforme a plataforma.

### 1. Clone o repositório

```powershell
git clone <URL-DO-REPOSITORIO>
cd LibrAI-new
```

### 2. Crie o ambiente virtual Python

```powershell
python -m venv .venv
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
```

Se o comando `python` não estiver disponível no Windows, instale o Python pelo site oficial ou use o caminho completo do interpretador instalado.

### 3. Instale as dependências do backend

```powershell
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

Dependências Python instaladas por `requirements.txt`:

| Pacote | Versão |
| --- | --- |
| `fastapi` | `0.142.2` |
| `uvicorn` | `0.54.0` |
| `httpx` | `0.28.1` |
| `pydantic` | `2.13.5` |
| `opencv-python` | `5.0.0.93` |
| `mediapipe` | `1.0.1` |
| `numpy` | `2.5.3` |

### 4. Instale as dependências do frontend

```powershell
cd frontend
npm install
cd ..
```

O `npm install` instala React, TypeScript, Vite, `react-webcam`, MediaPipe e os plugins necessários para o build.

### 5. Instale e configure o Ollama

Instale o Ollama pelo site [ollama.com](https://ollama.com/) e baixe o modelo usado pelo backend:

```powershell
ollama pull qwen2.5:3b
```

Em instalações nas quais o Ollama não inicia automaticamente, execute-o em um terminal separado:

```powershell
ollama serve
```

O backend espera encontrar a API do Ollama em `http://localhost:11434`.

## Variáveis de ambiente

### Pesquisa web com Tavily

O arquivo `.env.example` contém a variável opcional `TAVILY_API_KEY`:

```env
TAVILY_API_KEY=
```

Com uma chave Tavily, configure a variável no terminal antes de iniciar o backend:

```powershell
$env:TAVILY_API_KEY = "sua-chave-tavily"
```

Para persistir a variável no Windows para novos terminais:

```powershell
setx TAVILY_API_KEY "sua-chave-tavily"
```

Sem essa chave, a aplicação usa DuckDuckGo, Wikipedia e Google News como fontes alternativas. O código lê a variável diretamente do ambiente; copiar `.env.example` para `.env`, por si só, não a carrega automaticamente.

### URL da API no frontend

Por padrão, o frontend usa `http://127.0.0.1:8000`. Para alterar a URL, crie `frontend/.env.local`:

```env
VITE_API_URL=http://127.0.0.1:8000
```

Depois de alterar esse arquivo, reinicie o servidor Vite.

## Execução local

Abra três terminais na raiz do projeto: um para o Ollama, um para o backend e um para o frontend. Se o Ollama já estiver em execução como serviço, o primeiro terminal não será necessário.

### Terminal 1: Ollama

```powershell
ollama serve
```

### Terminal 2: backend

```powershell
cd LibrAI-new
.\.venv\Scripts\Activate.ps1
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

O prefixo `backend.` é necessário porque o backend usa imports relativos entre os módulos do pacote.

Endpoints úteis:

- API: <http://127.0.0.1:8000/>
- Documentação interativa: <http://127.0.0.1:8000/docs>

### Terminal 3: frontend

```powershell
cd LibrAI-new\frontend
npm run dev -- --host 127.0.0.1
```

Acesse a aplicação em <http://127.0.0.1:5173/>.

Para gerar uma versão de produção do frontend:

```powershell
cd LibrAI-new\frontend
npm run build
npm run preview
```

## Estrutura do projeto

```text
LibrAI-new/
├── backend/
│   ├── main.py                         # API FastAPI e integração com Ollama
│   ├── sign_recognition.py             # MediaPipe e extração de landmarks
│   ├── sign_storage.py                 # Persistência de sinais em SQLite
│   ├── lia.db                          # Banco gerado localmente em execução
│   ├── models/
│   │   └── hand_landmarker.task        # Modelo MediaPipe
│   └── services/
│       ├── __init__.py
│       └── gesture_recognizer.py       # Classificação por distância de landmarks
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig*.json
│   └── src/
│       ├── App.tsx                     # Layout e chat principal
│       ├── CameraSign.tsx               # Componente legado de câmera
│       ├── SignRegistration.tsx         # Cadastro de sinais e exemplos
│       ├── main.tsx
│       ├── styles.css
│       └── components/
│           └── CameraCapture.tsx        # Reconhecimento ativo por câmera
├── .env.example                         # Exemplo de variável Tavily
├── requirements.txt                     # Dependências Python
└── README.md
```

O arquivo `backend/lia.db` é criado automaticamente e contém os sinais cadastrados e seus exemplos. Ele deve ser tratado como dado local da aplicação e não como dependência do código.

## Endpoints principais

| Método | Rota | Finalidade |
| --- | --- | --- |
| `GET` | `/` | Verifica se a API está em execução. |
| `POST` | `/api/chat` | Envia uma mensagem para a LIA e recebe a resposta em streaming. |
| `POST` | `/api/recognize-sign` | Reconhece um sinal a partir de uma imagem Base64 ou de 21 landmarks. |
| `GET` | `/api/signs` | Lista os sinais cadastrados. |
| `POST` | `/api/signs` | Cria um sinal com nome e categoria. |
| `POST` | `/api/signs/examples` | Salva um exemplo de sinal com seus landmarks. |

## Fluxo de reconhecimento

1. O navegador captura a imagem da câmera.
2. O MediaPipe Hands identifica a mão e produz 21 landmarks.
3. O backend normaliza os pontos e compara o resultado com exemplos salvos no SQLite.
4. Quando encontra um sinal conhecido, a glosa é enviada ao Ollama para conversão em português.
5. A resposta pode ser enviada ao chat e sinalizada pelo widget VLibras.

O classificador atual é baseado em exemplos cadastrados e distância entre vetores de landmarks. Ele não é um modelo treinado para reconhecer todos os sinais de Libras; a qualidade depende dos exemplos registrados e das condições da câmera.

## Limitações e observações

- O Ollama e o modelo `qwen2.5:3b` precisam estar instalados e em execução para o chat funcionar.
- A busca web depende de acesso à internet. Sem `TAVILY_API_KEY`, são usadas fontes públicas alternativas.
- A câmera só funciona após a permissão do navegador e em um contexto permitido pelo navegador, como `localhost`.
- O VLibras e o MediaPipe do navegador são carregados de serviços externos, portanto precisam de conexão com a internet.
- A API permite origens locais `localhost:5173` e `127.0.0.1:5173` por CORS.
- O projeto está em desenvolvimento ativo; resultados de reconhecimento podem variar conforme iluminação, posição da mão e exemplos cadastrados.

## Desenvolvimento

Para verificar o frontend antes de publicar:

```powershell
cd frontend
npm run build
```

Para criar uma nova funcionalidade, prefira uma branch separada e abra um pull request descrevendo a alteração, os testes executados e eventuais dependências novas.

## Contexto acadêmico

Projeto desenvolvido no Instituto Federal de Educação, Ciência e Tecnologia da Bahia (IFBA), Campus Euclides da Cunha, no curso Técnico em Informática.
