import { useEffect, useRef, useState } from "react";

type Sign = { id: number; nome: string; categoria: string; exemplos: number };
type Recognition = { landmarks: { x: number; y: number; z: number }[] };

type SignRegistrationProps = { apiUrl: string };

export default function SignRegistration({ apiUrl }: SignRegistrationProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingTimerRef = useRef<number | null>(null);
  const savingRef = useRef(false);
  const [signs, setSigns] = useState<Sign[]>([]);
  const [signId, setSignId] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [cameraOn, setCameraOn] = useState(false);
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState("Cadastre um sinal para começar");

  useEffect(() => {
    void loadSigns();
    return () => stopCamera();
  }, []);

  async function loadSigns() {
    const response = await fetch(`${apiUrl}/api/signs`);
    if (response.ok) setSigns((await response.json()) as Sign[]);
  }

  async function createNewSign() {
    if (!name.trim() || !category.trim()) return;
    const response = await fetch(`${apiUrl}/api/signs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: name, categoria: category }),
    });
    if (!response.ok) {
      setStatus("Não foi possível cadastrar esse sinal");
      return;
    }
    const sign = (await response.json()) as Sign;
    setName("");
    setCategory("");
    setSignId(String(sign.id));
    setStatus(`Sinal ${sign.nome} cadastrado`);
    await loadSigns();
  }

  async function startCamera() {
    if (!signId) {
      setStatus("Selecione ou cadastre um sinal primeiro");
      return;
    }
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      if (videoRef.current) {
        videoRef.current.srcObject = streamRef.current;
        await videoRef.current.play();
      }
      setCameraOn(true);
      setStatus("Posicione sua mão e clique em Gravar exemplo");
    } catch {
      setStatus("Não foi possível acessar a câmera");
    }
  }

  function stopCamera() {
    stopRecording();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOn(false);
  }

  function stopRecording() {
    if (recordingTimerRef.current !== null) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (recording) {
      setRecording(false);
      setStatus("Gravação parada");
    }
  }

  async function saveExample() {
    if (savingRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !signId || video.readyState < 2 || video.videoWidth === 0) {
      setStatus("A câmera ainda não está pronta");
      return;
    }

    savingRef.current = true;
    try {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d")?.drawImage(video, 0, 0);
      setStatus("Reconhecendo sinal...");

      const recognitionResponse = await fetch(`${apiUrl}/api/recognize-sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imagem: canvas.toDataURL("image/jpeg", 0.85) }),
      });
      if (!recognitionResponse.ok) {
        throw new Error("Não foi possível analisar o frame");
      }
      const recognition = (await recognitionResponse.json()) as Recognition;
      if (recognition.landmarks.length !== 21) {
        setStatus("Mão não encontrada. Centralize-a, aproxime-a e tente novamente.");
        return;
      }

      setStatus("Sinal reconhecido. Salvando exemplo...");
      const saveResponse = await fetch(`${apiUrl}/api/signs/examples`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sinal_id: Number(signId), landmarks: recognition.landmarks }),
      });
      if (!saveResponse.ok) throw new Error("Não foi possível salvar o exemplo");
      setStatus("Exemplo reconhecido e salvo");
      await loadSigns();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Erro ao salvar exemplo");
    } finally {
      savingRef.current = false;
    }
  }

  function toggleRecording() {
    if (recording) {
      stopRecording();
      return;
    }
    if (!cameraOn || !signId) {
      setStatus("Ative a câmera e selecione um sinal primeiro");
      return;
    }
    setRecording(true);
    setStatus("Gravando exemplo...");
    void saveExample();
    recordingTimerRef.current = window.setInterval(() => void saveExample(), 1800);
  }

  return (
    <section className="registration-panel" aria-label="Cadastrar sinais">
      <div className="camera-heading">
        <div>
          <p className="eyebrow">Dados para treinamento</p>
          <h2>Cadastrar sinais</h2>
        </div>
        <span className="camera-state">{signs.length} cadastrados</span>
      </div>
      <div className="registration-fields">
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome do sinal" aria-label="Nome do sinal" />
        <input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Categoria" aria-label="Categoria do sinal" />
        <button type="button" className="camera-button" onClick={createNewSign}>Cadastrar</button>
      </div>
      <select value={signId} onChange={(event) => setSignId(event.target.value)} aria-label="Sinal selecionado">
        <option value="">Selecione um sinal para gravar exemplos</option>
        {signs.map((sign) => <option value={sign.id} key={sign.id}>{sign.nome} · {sign.exemplos} exemplos</option>)}
      </select>
      <div className="registration-preview camera-preview">
        <video ref={videoRef} muted playsInline aria-label="Câmera para cadastro" />
        {!cameraOn && <span className="camera-placeholder">A câmera aparecerá aqui</span>}
        <canvas ref={canvasRef} hidden />
      </div>
      <div className="camera-controls">
        <button type="button" className="camera-button" onClick={cameraOn ? stopCamera : startCamera}>{cameraOn ? "Desativar câmera" : "Ativar câmera"}</button>
        <button type="button" className="camera-button secondary" onClick={toggleRecording} disabled={!cameraOn || !signId}>
          {recording ? "Parar gravação" : "Iniciar gravação"}
        </button>
      </div>
      <p className="camera-status">{status}</p>
    </section>
  );
}
