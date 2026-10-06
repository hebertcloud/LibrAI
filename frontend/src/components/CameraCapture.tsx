import { useEffect, useRef, useState } from "react";
import Webcam from "react-webcam";
import type { Results } from "@mediapipe/hands";

type CameraCaptureProps = {
  apiUrl: string;
  onRecognized: (text: string) => void;
};

type RecognitionResponse = {
  glosa: string;
  confianca: number;
  resposta: string;
};

export default function CameraCapture({ apiUrl, onRecognized }: CameraCaptureProps) {
  const webcamRef = useRef<Webcam>(null);
  const handsRef = useRef<InstanceType<NonNullable<Window["Hands"]>> | null>(null);
  const timerRef = useRef<number | null>(null);
  const busyRef = useRef(false);
  const lastGlossRef = useRef("");
  const [active, setActive] = useState(false);
  const [status, setStatus] = useState("Câmera desativada");
  const [gloss, setGloss] = useState("");

  useEffect(() => () => stopCamera(), []);

  useEffect(() => {
    const scriptId = "mediapipe-hands-script";
    if (document.getElementById(scriptId)) return;
    const script = document.createElement("script");
    script.id = scriptId;
    script.src = "https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js";
    script.async = true;
    document.body.appendChild(script);
  }, []);

  async function handleResults(results: Results) {
    if (busyRef.current || !results.multiHandLandmarks?.[0]) return;
    const landmarks = results.multiHandLandmarks[0].map((point) => ({
      x: point.x,
      y: point.y,
      z: point.z,
    }));
    busyRef.current = true;
    try {
      const response = await fetch(`${apiUrl}/api/recognize-sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ landmarks }),
      });
      if (!response.ok) throw new Error("Falha no reconhecimento");
      const data = (await response.json()) as RecognitionResponse;
      setGloss(`${data.glosa} (${Math.round(data.confianca * 100)}%)`);
      if (data.resposta && data.glosa !== "GLOSA_DESCONHECIDA" && data.glosa !== lastGlossRef.current) {
        lastGlossRef.current = data.glosa;
        onRecognized(data.resposta);
      }
      setStatus("Sinal analisado");
    } catch {
      setStatus("Não foi possível reconhecer o sinal");
    } finally {
      busyRef.current = false;
    }
  }

  async function processFrame() {
    const video = webcamRef.current?.video;
    if (video && video.readyState >= 2 && handsRef.current) {
      await handsRef.current.send({ image: video });
    }
  }

  async function startCamera() {
    if (!window.Hands) {
      setStatus("Carregando o MediaPipe; tente novamente em alguns segundos");
      return;
    }
    const hands = new window.Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
    hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.6, minTrackingConfidence: 0.6 });
    hands.onResults((results) => void handleResults(results));
    handsRef.current = hands;
    setActive(true);
    setStatus("Posicione sua mão diante da câmera");
    timerRef.current = window.setInterval(() => void processFrame(), 1200);
  }

  function stopCamera() {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    handsRef.current?.close();
    handsRef.current = null;
    setActive(false);
    setStatus("Câmera desativada");
  }

  return (
    <section className="camera-panel" aria-label="Reconhecimento de sinais por câmera">
      <div className="camera-heading">
        <div>
          <p className="eyebrow">Entrada por câmera</p>
          <h2>Reconhecer Libras</h2>
        </div>
        <span className={`camera-state ${active ? "on" : ""}`}>{active ? "Ativa" : "Desativada"}</span>
      </div>
      <div className="camera-preview">
        {active ? <Webcam ref={webcamRef} audio={false} mirrored screenshotFormat="image/jpeg" /> : <span className="camera-placeholder">A câmera aparecerá aqui</span>}
      </div>
      <div className="camera-controls">
        <button type="button" className="camera-button" onClick={active ? stopCamera : startCamera}>{active ? "Desativar câmera" : "Ativar câmera"}</button>
        <span className="camera-status">{status}</span>
      </div>
      {gloss && <p className="last-sign">Última glosa: <strong>{gloss}</strong></p>}
    </section>
  );
}
