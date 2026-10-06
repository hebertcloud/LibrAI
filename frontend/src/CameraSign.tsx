import { useEffect, useRef, useState } from "react";

type RecognitionResponse = {
  sinal: string;
  confianca: number;
  traducao: string;
};

type CameraSignProps = {
  apiUrl: string;
  onRecognized: (text: string) => void;
};

export default function CameraSign({ apiUrl, onRecognized }: CameraSignProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState("Câmera desligada");
  const [lastSign, setLastSign] = useState("");
  const lastSentSign = useRef("");

  useEffect(() => () => stopCamera(), []);

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setIsCameraOn(true);
      setStatus("Aponte um sinal para a câmera");
      timerRef.current = window.setInterval(captureAndRecognize, 1800);
    } catch {
      setStatus("Não foi possível acessar a câmera");
    }
  }

  function stopCamera() {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsCameraOn(false);
    setStatus("Câmera desligada");
  }

  async function captureAndRecognize() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || isProcessing || video.readyState < 2) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    setIsProcessing(true);

    try {
      const response = await fetch(`${apiUrl}/api/recognize-sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imagem: canvas.toDataURL("image/jpeg", 0.8) }),
      });
      if (!response.ok) throw new Error("Falha no reconhecimento");
      const data = (await response.json()) as RecognitionResponse;
      setLastSign(`${data.traducao} (${Math.round(data.confianca * 100)}%)`);
      if (
        data.traducao &&
        data.traducao !== "Nenhum sinal detectado" &&
        data.traducao !== lastSentSign.current
      ) {
        lastSentSign.current = data.traducao;
        onRecognized(data.traducao);
      }
    } catch {
      setStatus("Não foi possível processar o sinal");
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <section className="camera-panel" aria-label="Reconhecimento de sinais">
      <div className="camera-heading">
        <div>
          <p className="eyebrow">Entrada por câmera</p>
          <h2>Reconhecer Libras</h2>
        </div>
        <span className={`camera-state ${isCameraOn ? "on" : ""}`}>
          {isCameraOn ? "Ativa" : "Desativada"}
        </span>
      </div>
      <div className="camera-preview">
        <video ref={videoRef} muted playsInline aria-label="Pré-visualização da câmera" />
        {!isCameraOn && <span className="camera-placeholder">A câmera aparecerá aqui</span>}
        <canvas ref={canvasRef} hidden />
      </div>
      <div className="camera-controls">
        <button type="button" className="camera-button" onClick={isCameraOn ? stopCamera : startCamera}>
          {isCameraOn ? "Desativar câmera" : "Ativar câmera"}
        </button>
        <span className="camera-status">{isProcessing ? "Analisando sinal..." : status}</span>
      </div>
      {lastSign && <p className="last-sign">Último sinal: <strong>{lastSign}</strong></p>}
    </section>
  );
}
