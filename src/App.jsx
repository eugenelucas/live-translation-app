import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import AnomalyFeatures from './pages/AnomalyFeatures'; 
import Survey from './pages/Survey';
import SurveySubmit from './pages/SurveySubmit';
function App() {
<<<<<<< HEAD
=======
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

>>>>>>> 4d11c40b9b9f268d02b73e89c9939f498648678c
  return (
    <Router>
      <div className="min-h-screen bg-gray-50 py-6">
        <Routes>
          <Route path="/" element={<AnomalyFeatures />} />
          <Route path="/survey" element={<Survey />} /> 
          <Route path="/survey-submit" element={<SurveySubmit />} />   
        </Routes>
      </div>
    </Router>
  );
}

export default App;