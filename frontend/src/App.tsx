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
const CHAT_STORAGE_KEY = "@lia-chat-messages";

function App() {
  const [activeTab, setActiveTab] = useState<"chat" | "camera" | "register">("chat");
  const [vlibrasScale, setVlibrasScale] = useState(1);
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const savedMessages = localStorage.getItem(CHAT_STORAGE_KEY);
      if (!savedMessages) return [];
      const parsed = JSON.parse(savedMessages) as Message[];
      return Array.isArray(parsed)
        ? parsed.filter((message) => message?.role && message?.content)
        : [];
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const endOfMessages = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages.slice(-30)));
  }, [messages]);

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

    const history = messages
      .filter((item) => item.content.trim())
      .slice(-12)
      .map(({ role, content }) => ({ role, content }));
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
        body: JSON.stringify({ mensagem: message, historico: history }),
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "A API não conseguiu responder.");
      }

      const assistantId = Date.now() + 1;
      setMessages((current) => [
        ...current,
        { id: assistantId, role: "assistant", content: "" },
      ]);

      const reader = response.body?.getReader();
      if (!reader) throw new Error("A API não enviou uma resposta em streaming.");

      const decoder = new TextDecoder();
      let buffer = "";
      let sources: string[] | undefined;
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const chunk = JSON.parse(line) as ChatResponse & { erro?: string; fim?: boolean };
          if (chunk.erro) throw new Error(chunk.erro);
          if (chunk.fontes) sources = chunk.fontes;
          if (chunk.resposta) {
            setMessages((current) => current.map((item) => item.id === assistantId
              ? { ...item, content: item.content + chunk.resposta }
              : item));
          }
        }
        if (done) break;
      }
      setMessages((current) => current.map((item) => item.id === assistantId
        ? { ...item, sources }
        : item));
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
          <div className="brand-mark" aria-hidden="true">✣</div>
          <div>
            <strong>LIA</strong>
            <span>acessibilidade em Libras</span>
          </div>
        </div>

        <button className="new-chat-button" type="button" onClick={() => {
          setMessages([]);
          localStorage.removeItem(CHAT_STORAGE_KEY);
        }}>
          <span aria-hidden="true">+</span>
          Nova conversa
        </button>

        <nav className="sidebar-nav" aria-label="Áreas da LIA">
          <span className="sidebar-label">Workspace</span>
          <button className={activeTab === "chat" ? "active" : ""} type="button" onClick={() => setActiveTab("chat")}>
            <span aria-hidden="true">⌁</span> Conversa
          </button>
          <button className={activeTab === "camera" ? "active" : ""} type="button" onClick={() => setActiveTab("camera")}>
            <span aria-hidden="true">◉</span> Reconhecer sinais
          </button>
          <button className={activeTab === "register" ? "active" : ""} type="button" onClick={() => setActiveTab("register")}>
            <span aria-hidden="true">⊞</span> Cadastrar sinais
          </button>
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="status-dot" aria-hidden="true" />
            <div>
              <strong>Conectada</strong>
              <span>Ollama local</span>
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
        </div>
      </aside>

      <section className="chat-panel" aria-label="Conversa com a LIA">
        <header className="chat-header">
          <div className="workspace-title">
            <span className="workspace-icon" aria-hidden="true">✣</span>
            <div>
              <strong>LIA</strong>
              <span>Conversa</span>
            </div>
          </div>
          <div className="live-badge">
            <span className="status-dot" aria-hidden="true" />
            Online
          </div>
        </header>

        {activeTab === "chat" && <div className="messages" aria-live="polite">
          {messages.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon" aria-hidden="true">✣</div>
              <h1>Vamos começar uma conversa</h1>
              <p className="empty-copy">Pergunte sobre Libras, acessibilidade ou qualquer outro assunto.</p>
              <div className="suggestions" aria-label="Sugestões de perguntas">
                <button type="button" onClick={() => setInput("O que é Libras?")}>
                  <span aria-hidden="true">⌁</span><strong>Conhecer Libras</strong><small>Uma introdução rápida</small>
                </button>
                <button type="button" onClick={() => setInput("Explique acessibilidade digital")}>
                  <span aria-hidden="true">◌</span><strong>Acessibilidade digital</strong><small>Conceitos e exemplos</small>
                </button>
                <button type="button" onClick={() => setActiveTab("camera")}>
                  <span aria-hidden="true">◉</span><strong>Reconhecer um sinal</strong><small>Usar a câmera</small>
                </button>
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
            <button className="composer-tool" type="button" onClick={() => setActiveTab("camera")} aria-label="Reconhecer sinal pela câmera" title="Reconhecer sinal pela câmera">◉</button>
            <button className="send-button" type="submit" disabled={isLoading || !input.trim()} aria-label="Enviar mensagem">
              <span aria-hidden="true">➤</span>
            </button>
          </form>
          <p className="composer-hint">A LIA pode cometer erros. Confira informações importantes.</p>
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
