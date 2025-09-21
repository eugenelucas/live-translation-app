import { useRef, useState, useEffect } from "react";

export default function AnomalyFeatures() {
  const [isListening, setIsListening] = useState(false);
  const [status, setStatus] = useState("Idle");

  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [corrected, setCorrected] = useState("");
  const [anomalies, setAnomalies] = useState([]);
  const [error, setError] = useState("");

  const [autoCorrect, setAutoCorrect] = useState(true);
  const [detectAnomaly, setDetectAnomaly] = useState(true);

  const wsRef = useRef(null);
  const audioContextRef = useRef(null);
  const processorRef = useRef(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [transcript, interim, corrected, anomalies]);

  const startLive = async () => {
    if (isListening) return;

    // Clear everything at the start of a new cycle
    setTranscript("");
    setInterim("");
    setCorrected("");
    setAnomalies([]);
    setError("");

    setStatus("Preparing microphone…");
    const backendUrl = import.meta.env.VITE_SOCKET_BACKEND_URL;
    const ws = new WebSocket(
      backendUrl
    );
    wsRef.current = ws;

    ws.onopen = () => {
      setIsListening(true);
      ws.send(JSON.stringify({ auto_correct: autoCorrect, anomaly: detectAnomaly }));
      setStatus("Listening");
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case "transcribing":
            setInterim(data.text);
            break;
          case "transcribed":
            setTranscript((prev) => (prev ? prev + "\n" + data.text : data.text));
            setInterim("");
            break;
          case "auto_corrected":
            // Auto-corrected text accumulates for the whole cycle
            setCorrected((prev) => (prev ? prev + "\n" + data.text : data.text));
            break;
          case "anomaly":
            if (data.isAnomaly) {
              const newAnomaly = { reason: data.reason };
              setAnomalies((prev) => [...prev, newAnomaly]);
            }
            break;
        }
      } catch (err) {
        console.error(err);
      }
    };

    ws.onclose = () => {
      setIsListening(false);
      setStatus("Idle");
    };

    ws.onerror = (e) => {
      setError("WebSocket error");
      console.error(e);
    };

    // Audio capture
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const audioContext = new AudioContext({ sampleRate: 16000 });
    audioContextRef.current = audioContext;

    await audioContext.audioWorklet.addModule("/pcm-processor.js");
    const source = audioContext.createMediaStreamSource(stream);
    const processor = new AudioWorkletNode(audioContext, "pcm-processor");
    processorRef.current = processor;

    processor.port.onmessage = (event) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(event.data);
    };

    source.connect(processor).connect(audioContext.destination);
  };

  const stopLive = () => {
    if (processorRef.current) processorRef.current.disconnect();
    if (audioContextRef.current) audioContextRef.current.close();
    if (wsRef.current) wsRef.current.close();

    setIsListening(false);
    setStatus("Idle");
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(
      transcript +
        (interim ? "\n" + interim : "") +
        (corrected ? "\nCorrected: " + corrected : "") +
        (anomalies.length
          ? "\nAnomalies:\n" + anomalies.map((a) => a.reason).join("\n")
          : "")
    );
  };

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="mx-auto w-full max-w-5xl px-6">
        <div className="rounded-3xl border bg-white p-8 shadow-lg">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            Live Transcription & Anomaly Detection
          </h2>

          <span
            className={`inline-flex px-4 py-1 text-sm font-medium rounded-full mb-4 ${
              isListening ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-600"
            }`}
          >
            {status}
          </span>

          <div className="flex flex-wrap gap-3 mb-6 items-center">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={autoCorrect}
                onChange={(e) => setAutoCorrect(e.target.checked)}
                className="h-4 w-4"
              />
              Auto-Correct
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={detectAnomaly}
                onChange={(e) => setDetectAnomaly(e.target.checked)}
                className="h-4 w-4"
              />
              Detect Anomaly
            </label>
          </div>

          <div className="flex gap-3 mb-6">
            {!isListening ? (
              <button
                onClick={startLive}
                className="bg-indigo-600 text-white px-5 py-2 rounded-xl hover:bg-indigo-700 transition"
              >
                Start
              </button>
            ) : (
              <button
                onClick={stopLive}
                className="bg-rose-600 text-white px-5 py-2 rounded-xl hover:bg-rose-700 transition"
              >
                Stop
              </button>
            )}
            <button
              onClick={handleCopy}
              className="border border-gray-300 px-5 py-2 rounded-xl hover:bg-gray-50 transition"
            >
              Copy Transcript
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold text-gray-700 mb-2">Transcript</h3>
              <div
                ref={scrollRef}
                className="max-h-60 overflow-y-auto border p-3 rounded-lg bg-gray-50 whitespace-pre-wrap"
              >
                <div>{transcript || "— No transcript yet —"}</div>
                {interim && <div className="italic text-gray-500">…{interim}</div>}
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-gray-700 mb-2">Auto-Corrected</h3>
              <div className="max-h-60 overflow-y-auto border p-3 rounded-lg bg-gray-50 whitespace-pre-wrap">
                {corrected || "— No corrected text yet —"}
              </div>
            </div>
          </div>

          {anomalies.length > 0 && (
            <div className="mt-6">
              <h3 className="font-semibold text-gray-700 mb-2">Anomalies Detected</h3>
              <div className="border p-3 rounded-lg bg-gray-50 text-rose-600 font-medium space-y-1">
                {anomalies.map((a, idx) => (
                  <div key={idx}>⚠ {a.reason}</div>
                ))}
              </div>
            </div>
          )}

          {error && <div className="mt-4 text-rose-600 font-medium">{error}</div>}
        </div>
      </div>
    </div>
  );
}
