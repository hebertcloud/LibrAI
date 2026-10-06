import { FormEvent, useEffect, useRef, useState } from "react";
import CameraCapture from "./components/CameraCapture";
import SignRegistration from "./SignRegistration";

type Message = {
  id: number;
  role: "user" | "assistant";
  content: string;
  sources?: string[];
};

type ChatResponse = {
  resposta: string;
  enviar_vlibras?: boolean;
  fontes?: string[];
};

const API_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";
const vlibrasRootAttributes = { vw: "true" } as Record<string, string>;
const vlibrasAccessAttributes = { "vw-access-button": "true" } as Record<string, string>;
const vlibrasWrapperAttributes = { "vw-plugin-wrapper": "true" } as Record<string, string>;

function App() {
  const [activeTab, setActiveTab] = useState<"chat" | "camera" | "register">("chat");
  const [vlibrasScale, setVlibrasScale] = useState(1);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const endOfMessages = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scriptId = "vlibras-plugin-script";
    if (document.getElementById(scriptId)) return;

    try {
      const savedState = localStorage.getItem("@vlibras-widget");
      if (savedState) {
        const parsedState = JSON.parse(savedState) as Record<string, unknown>;
        parsedState.isOpen = false;
        localStorage.setItem("@vlibras-widget", JSON.stringify(parsedState));
      }
    } catch {
    }

    const script = document.createElement("script");
    script.id = scriptId;
    script.src = "https://vlibras.gov.br/app/vlibras-plugin.js";
    script.async = true;
    script.onload = () => {
      if (window.VLibras) {
        new window.VLibras.Widget("https://vlibras.gov.br/app");
      }
    };
    document.body.appendChild(script);
  }, []);

  useEffect(() => {
    endOfMessages.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  useEffect(() => {
    const applyScale = () => {
      const widget = window.VLibrasWidget?.wrapper ?? document.getElementById("vlibras-access-wrapper");
      if (widget) {
        widget.style.transformOrigin = "center right";
        widget.style.setProperty("transform", `scale(${vlibrasScale})`, "important");
        widget.style.pointerEvents = "auto";
      }
    };
    applyScale();
    const timer = window.setInterval(applyScale, 250);
    const stopTimer = window.setTimeout(() => window.clearInterval(timer), 5000);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(stopTimer);
    };
  }, [vlibrasScale]);

  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role !== "assistant" || !lastMessage.content) return;

    const timer = window.setTimeout(() => {
      const target = document.createElement("span");
      target.textContent = lastMessage.content;
      target.setAttribute("aria-hidden", "true");
      target.style.position = "fixed";
      target.style.left = "-10000px";
      target.style.top = "0";
      document.body.appendChild(target);

      window.VLibrasWidget?.open?.();
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(target);
      selection?.removeAllRanges();
      selection?.addRange(range);
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      window.setTimeout(() => {
        selection?.removeAllRanges();
        target.remove();
      }, 1000);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [messages]);

  async function sendMessage(message: string) {
    if (!message || isLoading) return;

    setMessages((current) => [
      ...current,
      { id: Date.now(), role: "user", content: message },
    ]);
    setInput("");
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ mensagem: message }),
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "A API não conseguiu responder.");
      }

      const data = (await response.json()) as ChatResponse;
      setMessages((current) => [
        ...current,
        {
          id: Date.now() + 1,
          role: "assistant",
          content: data.resposta,
          sources: data.fontes,
        },
      ]);
    } catch {
      setError("Não foi possível conectar à LIA. Verifique se o backend está ativo.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = input.trim();
    setInput("");
    await sendMessage(message);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Navegação principal">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">L</div>
          <div>
            <strong>LIA</strong>
            <span>acessibilidade em Libras</span>
          </div>
        </div>

        <button className="new-chat-button" type="button" onClick={() => setMessages([])}>
          <span aria-hidden="true">+</span>
          Nova conversa
        </button>

        <div className="sidebar-note">
          <span className="status-dot" aria-hidden="true" />
          <div>
            <strong>Conectada</strong>
            <span>Pronta para conversar</span>
          </div>
        </div>

        <div className="vlibras-size-control">
          <span>Tamanho do VLibras</span>
          <div className="size-options" role="group" aria-label="Tamanho do VLibras">
            <button type="button" className={vlibrasScale === 0.82 ? "selected" : ""} onClick={() => setVlibrasScale(0.82)} aria-label="VLibras pequeno">A−</button>
            <button type="button" className={vlibrasScale === 1 ? "selected" : ""} onClick={() => setVlibrasScale(1)} aria-label="VLibras normal">A</button>
            <button type="button" className={vlibrasScale === 1.2 ? "selected" : ""} onClick={() => setVlibrasScale(1.2)} aria-label="VLibras grande">A+</button>
          </div>
        </div>

        <footer className="sidebar-footer">LIA · projeto de acessibilidade</footer>
      </aside>

      <section className="chat-panel" aria-label="Conversa com a LIA">
        <header className="chat-header">
          <div>
            <p className="eyebrow">Assistente virtual</p>
            <h1>Como posso ajudar?</h1>
          </div>
          <div className="live-badge">
            <span className="status-dot" aria-hidden="true" />
            Ollama local
          </div>
        </header>

        <nav className="workspace-tabs" aria-label="Áreas da LIA">
          <button className={activeTab === "chat" ? "active" : ""} type="button" onClick={() => setActiveTab("chat")}>Conversa</button>
          <button className={activeTab === "camera" ? "active" : ""} type="button" onClick={() => setActiveTab("camera")}>Reconhecer sinais</button>
          <button className={activeTab === "register" ? "active" : ""} type="button" onClick={() => setActiveTab("register")}>Cadastrar sinais</button>
        </nav>

        {activeTab === "chat" && <div className="messages" aria-live="polite">
          {messages.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon" aria-hidden="true">L</div>
              <p className="eyebrow">Olá, eu sou a LIA</p>
              <h2>Uma conversa mais acessível começa aqui.</h2>
              <p className="empty-copy">Digite uma pergunta para conversar com a inteligência artificial. As respostas também podem ser sinalizadas pelo VLibras.</p>
              <div className="suggestions" aria-label="Sugestões de perguntas">
                <button type="button" onClick={() => setInput("O que é Libras?")}>O que é Libras?</button>
                <button type="button" onClick={() => setInput("Explique acessibilidade digital")}>Acessibilidade digital</button>
              </div>
            </div>
          )}

          {messages.map((message) => (
            <article className={`message-row ${message.role}`} key={message.id}>
              <div className="message-avatar" aria-hidden="true">{message.role === "user" ? "V" : "L"}</div>
              <div className="message-body">
                <span className="message-author">{message.role === "user" ? "Você" : "LIA"}</span>
                <p>{message.content}</p>
                {message.sources && message.sources.length > 0 && (
                  <div className="sources">
                    <span>Fontes consultadas</span>
                    {message.sources.map((source) => (
                      <a href={source} target="_blank" rel="noreferrer" key={source}>{source}</a>
                    ))}
                  </div>
                )}
              </div>
            </article>
          ))}

          {isLoading && (
            <div className="message-row assistant">
              <div className="message-avatar" aria-hidden="true">L</div>
              <div className="message-body">
                <span className="message-author">LIA</span>
                <div className="typing-indicator" aria-label="LIA está respondendo"><i /><i /><i /></div>
              </div>
            </div>
          )}
          <div ref={endOfMessages} />
        </div>}

        {activeTab === "camera" && <CameraCapture apiUrl={API_URL} onRecognized={sendMessage} />}
        {activeTab === "register" && <SignRegistration apiUrl={API_URL} />}

        {activeTab === "chat" && <div className="composer-wrap">
          {error && <p className="error-message" role="alert">{error}</p>}
          <form className="composer" onSubmit={handleSubmit}>
            <label className="sr-only" htmlFor="chat-input">Digite sua mensagem</label>
            <textarea
              id="chat-input"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder="Escreva sua mensagem..."
              rows={1}
              disabled={isLoading}
            />
            <button className="send-button" type="submit" disabled={isLoading || !input.trim()} aria-label="Enviar mensagem">
              <span aria-hidden="true">↑</span>
            </button>
          </form>
          <p className="composer-hint">Enter para enviar · Shift + Enter para quebrar linha</p>
        </div>}
      </section>

      <button
        className="vlibras-launcher"
        type="button"
        onClick={() => window.VLibrasWidget?.open?.()}
        aria-label="Abrir tradução em Libras"
      >
        <span aria-hidden="true">◈</span>
        VLibras
      </button>

      <div {...vlibrasRootAttributes} className="enabled">
        <div {...vlibrasAccessAttributes} className="active" />
        <div {...vlibrasWrapperAttributes}>
          <div className="vw-plugin-top-wrapper" />
        </div>
      </div>
    </main>
  );
}

export default App;
