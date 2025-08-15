import { useRef, useState, useEffect } from 'react';
import { getTokenOrRefresh } from './token_util';
import { ResultReason ,SpeechRecognizer,AudioConfig,SpeechConfig} from 'microsoft-cognitiveservices-speech-sdk';

 function App() {
  const [isListening, setIsListening] = useState(false);
  const [status, setStatus] = useState('Idle');
  const [language, setLanguage] = useState('en-US');
  const [transcript, setTranscript] = useState('');     // committed text
  const [interim, setInterim] = useState('');           // live partial line
  const [error, setError] = useState('');

  const recognizerRef = useRef(null);
  const scrollRef = useRef(null);

  // Auto-scroll transcript
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [transcript, interim]);

  async function startLive() {
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
        setTranscript(prev => (prev ? prev + ' ' : '') + e.result.text);
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
  }

  // Cleanup on unmount
  useEffect(() => {
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
              {/* <option value="en-GB">English (United Kingdom)</option>
              <option value="es-ES">Spanish (Spain)</option>
              <option value="fr-FR">French (France)</option>
              <option value="de-DE">German (Germany)</option>
              <option value="it-IT">Italian (Italy)</option>
              <option value="pt-BR">Portuguese (Brazil)</option> */}
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

        {/* Error */}
        {error && (
          <div className="mt-2 text-sm text-rose-600" role="alert">
            {error}
          </div>
        )}

         
      </div>
    </div>
  </div>
</div>
  );
}

export default App
