import { useRef, useState, useEffect } from 'react';
import { getTokenOrRefresh } from './token_util';
import { ResultReason, SpeechRecognizer, AudioConfig, SpeechConfig } from 'microsoft-cognitiveservices-speech-sdk';
import { AzureOpenAI } from "openai";

function App() {
  const [isListening, setIsListening] = useState(false);
  const [status, setStatus] = useState('Idle');
  const [language, setLanguage] = useState('en-US');
  const [transcript, setTranscript] = useState('');     // committed text
  const [interim, setInterim] = useState('');           // live partial line
  const [error, setError] = useState('');

  // Anomaly detection UI state
  const [detectEnabled, setDetectEnabled] = useState(true);
  const [detectStatus, setDetectStatus] = useState('Idle'); // Idle | Checking | OK | Anomaly | Error
  const [detectReason, setDetectReason] = useState('');
  const [lastCheckedAt, setLastCheckedAt] = useState(null);
  const [anomalies, setAnomalies] = useState([]); 


  const [autoCorrectEnabled, setAutoCorrectEnabled] = useState(true);
  const [correctStatus, setCorrectStatus] = useState('Idle'); // 'Idle' | 'Checking' | 'OK' | 'Error'

  const [corrected, setCorrected] = useState('');          // corrected transcript
  const [lastCorrectedAt, setLastCorrectedAt] = useState(null);

  const correctInFlightRef = useRef(0);     // request de-dupe
  const correctDebounceRef = useRef(null);  // simple debounce timer

  const recognizerRef = useRef(null);
  const scrollRef = useRef(null);
  const detectInFlightRef = useRef(0); // basic request de-dupe

  const endpoint   = import.meta.env.VITE_AZURE_OPENAI_ENDPOINT;
  const deployment = import.meta.env.VITE_AZURE_OPENAI_DEPLOYMENT;
  const apiVersion = import.meta.env.VITE_AZURE_VERSION ;
  const apiKey     = import.meta.env.VITE_AZURE_OPENAI_KEY;
  const modelName = import.meta.env.VITE_AZURE_OPENAI_DEPLOYMENT;



  // Auto-scroll transcript
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [transcript, interim]);

  async function startLive() {
    setTranscript("");
    if (isListening) return;

    setError('');
    setStatus('Preparing microphone…');

    const tokenObj = await getTokenOrRefresh();
    const speechConfig = SpeechConfig.fromAuthorizationToken(tokenObj.authToken, tokenObj.region);
    speechConfig.speechRecognitionLanguage = language;
    speechConfig.enableDictation(); // better punctuation for continuous dictation

    const audioConfig = AudioConfig.fromDefaultMicrophoneInput();
    const recognizer = new SpeechRecognizer(speechConfig, audioConfig);

    recognizer.sessionStarted = () => {
      setIsListening(true);
      setStatus('Listening');
    };
    recognizer.sessionStopped = () => {
      setIsListening(false);
      setStatus('Idle');
    };
    recognizer.canceled = (_s, e) => {
      setError(e.errorDetails || 'Recognition canceled.');
      stopLive(); // ensure cleanup
    };

    recognizer.recognizing = (_s, e) => {
      setInterim(e.result?.text || '');
    };

    recognizer.recognized = (_s, e) => {
      if (e.result.reason === ResultReason.RecognizedSpeech) {
        // Append and trigger anomaly detection on the NEW full transcript
        if (e.result.text && e.result.text.trim() !== '') 
        setTranscript(prev => {
          const next = prev ? prev + '\n' + e.result.text : e.result.text;
          // Trigger anomaly detection only on finalized updates
          // (If you want to detect on every partial too, also call checkAnomaly in 'recognizing')
          checkAnomaly(next);
          scheduleAutoCorrect(next);
          return next;
        });
      }
      setInterim(''); // clear interim after each finalization
    };

    recognizerRef.current = recognizer;
    recognizer.startContinuousRecognitionAsync(
      () => {},
      err => {
        setError(String(err));
        setStatus('Idle');
      }
    );
  }

  function stopLive() {
    const r = recognizerRef.current;
    if (!r) return;

    setStatus('Stopping…');
    r.stopContinuousRecognitionAsync(
      () => {
        r.close();
        recognizerRef.current = null;
        setIsListening(false);
        setStatus('Idle');
        setInterim('');
      },
      err => setError(String(err))
    );
    if (correctDebounceRef.current) {
  window.clearTimeout(correctDebounceRef.current);
  correctDebounceRef.current = null;
}
  }

  // Cleanup on unmount
  useEffect(() => {
    if (correctDebounceRef.current) {
  window.clearTimeout(correctDebounceRef.current);
  correctDebounceRef.current = null;
}
    return () => {
      if (recognizerRef.current) {
        recognizerRef.current.stopContinuousRecognitionAsync(() => {
          recognizerRef.current.close();
          recognizerRef.current = null;
        });
      }
    };
  }, []);

  function handleCopy() {
    const text = transcript + (interim ? '\n' + interim : '');
    navigator.clipboard.writeText(text).catch(() => {});
  }
 
  async function analyzeTranscript(_text) {
    const text = String(_text || '').trim();
     
    const systemPrompt = `
      You are a strict JSON classifier.Given a call transcript between an agent and a caller, decide if the caller's behavior indicates an anomaly (possible fraud).
      "Anomaly" includes:
      - Requests for or attempts to reveal sensitive personal data (PII): SSN, social security number, credit/debit card numbers, CVV, PIN, passwords, bank account/routing numbers, driver's license, passport, national ID, mother's maiden name, security questions, OTP/2FA codes, etc.
      - Repeated or suspicious attempts to obtain account/benefit/claim details.
      - Contradictory or inconsistent statements about identity, account, or intent.
      - Scripted scam-like patterns (IRS scam, IT support scam, insurance fraud, etc.).
      - Mismatch between caller-provided information and metadata/context (e.g., location).
      - Emotional manipulation, urgency, or pressure tactics to bypass normal flow.

      Return ONLY a compact JSON object with:
      {"isAnomaly": <true|false>, "reason": "<short reason>"}

      Keep "reason" short and specific, e.g.:
      - "Sensitive info requested"
      - "Repeated attempts to extract account details"
      - "Contradictory statements"
      - "Possible scam pattern"
      - "Emotional pressure tactic"

      Do NOT include any extra text.
    `.trim();

    const userPrompt = `
      Transcript:
      """${text}"""

      Return JSON only.
    `.trim();
    try {
      const options = { endpoint, apiKey, deployment, apiVersion, dangerouslyAllowBrowser: true }
      const client = new AzureOpenAI(options);
      const response = await client.chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 4096,
          temperature: 1,
          top_p: 1,
          model: modelName
      });

      
      if (response?.error !== undefined && response.status !== "200") {
         return { isAnomaly: false, reason: 'No issues detected...' };
      }
 
      const content = response.choices[0].message.content;
      try {
        const parsed = JSON.parse(content);
        const isAnomaly = !!parsed?.isAnomaly;
        const reason = typeof parsed?.reason === 'string' && parsed.reason.trim()
          ? parsed.reason.trim()
          : (isAnomaly ? 'Anomaly detected.' : 'No issues detected.');
        return { isAnomaly, reason };
      } catch {
        // If the model returned non-JSON for some reason
        return { isAnomaly: false, reason: 'No issues detected.' };
      }
    } catch (err) {
      return { isAnomaly: false, reason: 'No issues detected....' };
    }
  }
 async function autoCorrectTranscript(_text) {
  const text = String(_text || '').trim();
  if (!text) return '';

    const systemPrompt = `
  You are a careful, minimal copy editor for live transcripts.
- Fix grammar, punctuation, casing, and obvious ASR errors.
- Do NOT change meaning or add/remove facts.
- Preserve line breaks and speaker turns.
- Also remove common disfluencies (um/umm/uh/er/erm/eh/hmm/mmm/mm/ah, "uh-huh"/"mm-hmm",
  and the phrases "I mean" and "you know" when they appear as fillers).
Return ONLY the corrected text.
    `.trim();

    const userPrompt = `
  Correct the following transcript. Keep the same formatting and line breaks.

  ---
  ${text}
  ---
    `.trim();

    try {
      const options = { endpoint, apiKey, deployment, apiVersion, dangerouslyAllowBrowser: true }
      const client = new AzureOpenAI(options);
      const resp = await client.chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 4096,
        temperature: 0.2,
        top_p: 1,
        model: modelName,
      });

      const content = resp?.choices?.[0]?.message?.content ?? '';
      return String(content).trim();
    } catch {
      return '';
    }
  }
  async function checkAnomaly(text) {
  if (!detectEnabled || !text) return;

  const reqId = ++detectInFlightRef.current;
  setDetectStatus('Checking');
  setDetectReason('');

  try {
    const result = await analyzeTranscript(text);
    if (reqId !== detectInFlightRef.current) return;

    const isAnomaly = !!result?.isAnomaly;
    const reason = result?.reason || (isAnomaly ? 'Anomaly detected.' : 'No issues detected.');

    const anomalyRecord = {
      text,
      status: isAnomaly ? 'Anomaly' : 'OK',
      reason,
      timestamp: new Date().toISOString()
    };

    setAnomalies(prev => [...prev, anomalyRecord]);  // keep history
    setDetectStatus(anomalyRecord.status);
    setDetectReason(anomalyRecord.reason);
    setLastCheckedAt(anomalyRecord.timestamp);
  } catch (e) {
    if (reqId !== detectInFlightRef.current) return;
    const anomalyRecord = {
      text,
      status: 'Error',
      reason: e?.message ? String(e.message) : 'Detection failed.',
      timestamp: new Date().toISOString()
    };
    setAnomalies(prev => [...prev, anomalyRecord]);
    setDetectStatus('Error');
    setDetectReason(anomalyRecord.reason);
    setLastCheckedAt(anomalyRecord.timestamp);
  }
}
function scheduleAutoCorrect(text) {
  if (!autoCorrectEnabled) return;

  // debounce ~500ms after last change
  if (correctDebounceRef.current) {
    window.clearTimeout(correctDebounceRef.current);
  }
  correctDebounceRef.current = window.setTimeout(async () => {
    const reqId = ++correctInFlightRef.current;
    setCorrectStatus('Checking');

    const result = await autoCorrectTranscript(text);
    if (reqId !== correctInFlightRef.current) return; // a newer request superseded this

    if (result) {
      setCorrected(result);
      setCorrectStatus('OK');
      setLastCorrectedAt(new Date().toISOString());
    } else {
      setCorrectStatus('Error');
      setLastCorrectedAt(new Date().toISOString());
    }
  }, 500);
}
  function renderDetectBadge() {
    const base = "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium";
    switch (detectStatus) {
      case 'Checking':
        return <span className={`${base} bg-amber-100 text-amber-700`}>Checking…</span>;
      case 'OK':
        return <span className={`${base} bg-green-100 text-green-700`}>No anomaly</span>;
      case 'Anomaly':
        return <span className={`${base} bg-rose-100 text-rose-700`}>Anomaly detected</span>;
      case 'Error':
        return <span className={`${base} bg-gray-200 text-gray-700`}>Error</span>;
      default:
        return <span className={`${base} bg-gray-100 text-gray-600`}>Idle</span>;
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-6">
      <div className="mx-auto w-full max-w-4xl px-4">
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="p-6">
            {/* Header */}
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">Live Captions</h2>
              <span
                className={[
                  "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium",
                  isListening
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-100 text-gray-600",
                ].join(" ")}
              >
                {status}
              </span>
            </div>

            {/* Controls */}
            <div className="mb-4 grid items-end gap-3 md:grid-cols-2">
              <div>
                <label
                  htmlFor="lang"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Recognition language
                </label>
                <select
                  id="lang"
                  value={language}
                  disabled={isListening}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:bg-gray-100"
                >
                  <option value="en-US">English (United States)</option>
                  {/* Add more locales as needed */}
                </select>
              </div>

              <div className="flex items-center justify-start gap-2 md:justify-end">
                {!isListening ? (
                  <button
                    type="button"
                    onClick={startLive}
                    className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  >
                    Start
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopLive}
                    className="inline-flex items-center rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-400"
                  >
                    Stop
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleCopy}
                  disabled={!transcript && !interim}
                  className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Copy
                </button>
              </div>
            </div>

            {/* Transcript */}
            <div
              ref={scrollRef}
              className="mb-2 max-h-72 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 p-4"
            >
              <div className="whitespace-pre-wrap text-gray-900">
                {transcript || "— No captions yet —"}
              </div>
              {interim && (
                <div className="mt-2 whitespace-pre-wrap italic text-gray-500">
                  […] {interim}
                </div>
              )}
            </div>

            {/* Anomaly Detection Panel */}
            <div className="mt-4 rounded-xl border border-gray-200 p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-semibold text-gray-900">Anomaly Detection</h3>
                  {renderDetectBadge()}
                </div>

                <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    checked={detectEnabled}
                    onChange={(e) => setDetectEnabled(e.target.checked)}
                  />
                  Enable
                </label>
              </div>
              <div className="mt-4 rounded-xl border border-gray-200 p-4">
  <h3 className="text-sm font-semibold text-gray-900 mb-2">Detected Anomalies</h3>
  {anomalies.length === 0 ? (
    <div className="text-sm text-gray-500">— No anomalies detected yet —</div>
  ) : (
    <ul className="space-y-2 max-h-64 overflow-y-auto">
      {anomalies.map((a, i) => (
        <li key={i} className="rounded-lg bg-gray-50 p-3 text-sm">
          <div className="font-medium">
            {a.status === 'Anomaly' ? 
              <span className="text-rose-600">⚠ Anomaly</span> : 
              <span className="text-green-600">✔ OK</span>}
          </div>
          <div className="text-gray-900 mt-1">{a.text}</div>
          <div className="text-xs text-gray-500">
            {a.reason} — {new Date(a.timestamp).toLocaleString()}
          </div>
        </li>
      ))}
    </ul>
  )}
</div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => checkAnomaly(transcript)}
                  disabled={!detectEnabled || !transcript || detectStatus === 'Checking'}
                  className="inline-flex items-center rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Re-check Now
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const report = `Anomaly Status: ${detectStatus}
              Reason: ${detectReason || 'N/A'}
              Last Checked: ${lastCheckedAt ? new Date(lastCheckedAt).toISOString() : 'N/A'}`;

                    navigator.clipboard.writeText(report).catch(() => {});
                  }}
                  disabled={!detectReason && detectStatus !== 'OK' && detectStatus !== 'Anomaly'}
                  className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Copy Result
                </button>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-gray-200 bg-white">
              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-semibold text-gray-900">Auto-Correction</h3>
                  <span
                    className={[
                      "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium",
                      correctStatus === 'Checking' ? "bg-amber-100 text-amber-700" :
                      correctStatus === 'OK'       ? "bg-green-100 text-green-700" :
                      correctStatus === 'Error'    ? "bg-gray-200 text-gray-700" :
                                                    "bg-gray-100 text-gray-600",
                    ].join(' ')}
                  >
                    {correctStatus === 'Idle' ? 'Idle' : correctStatus}
                  </span>
                </div>

                <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    checked={autoCorrectEnabled}
                    onChange={(e) => setAutoCorrectEnabled(e.target.checked)}
                  />
                  Enable
                </label>
              </div>

              <div className="px-4 pb-4">
                <div className="mb-2 max-h-72 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div className="whitespace-pre-wrap text-gray-900">
                    {corrected || (correctStatus === 'Checking' ? '— Correcting… —' : '— No corrected text yet —')}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => scheduleAutoCorrect(transcript)}
                    disabled={!autoCorrectEnabled || !transcript || correctStatus === 'Checking'}
                    className="inline-flex items-center rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Re-correct Now
                  </button>

                  <div className="text-xs text-gray-500">
                    Last corrected: {lastCorrectedAt ? new Date(lastCorrectedAt).toLocaleString() : '—'}
                  </div>
                </div>
              </div>
            </div>
            

            {/* Error */}
            {error && (
              <div className="mt-4 text-sm text-rose-600" role="alert">
                {error}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
