import { useEffect, useState } from 'react';

export default function SurveySubmit() {
  const [email, setEmail] = useState('');
  const [rating, setRating] = useState(''); // Poor / Medium / Good / Excellent
  const [feedback, setFeedback] = useState(''); // Optional text feedback
  const [status, setStatus] = useState('Idle');
  const [error, setError] = useState('');

  const [allFeedback, setAllFeedback] = useState([]);
  const [showFeedback, setShowFeedback] = useState(false);
  const [loadingFeedback, setLoadingFeedback] = useState(false);

  const backendUrl = import.meta.env.VITE_BACKEND_URL;

  const [token, setToken] = useState('');
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('token');
    if (t) {
      setToken(t);
      fetch(`${backendUrl}/token-to-email/${t}`)
        .then(res => res.json())
        .then(data => {
          if (data.email) setEmail(data.email);
          else setError('Invalid or expired token.');
        })
        .catch(() => setError('Failed to fetch email.'));
    } else {
      setError('Missing token.');
    }
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!rating) {
      setError('Please select a rating before submitting.');
      return;
    }
    setStatus('Sending');
    setError('');

    try {
      const formData = new FormData();
      formData.append('token', token);
      formData.append('rate', rating);
      formData.append('feedback', feedback);

      const response = await fetch(`${backendUrl}/submit-feedback`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error(`Server error: ${response.status}`);
      setStatus('Sent');
    } catch (err) {
      console.error(err);
      setError('Failed to submit. Please try again.');
      setStatus('Error');
    }
  }

  async function handleShowAllFeedback() {
    setLoadingFeedback(true);
    try {
      const res = await fetch(`${backendUrl}/all-feedback`);
      if (!res.ok) throw new Error('Failed to fetch feedback');
      const data = await res.json();
      setAllFeedback(data.feedbacks || []);
      setShowFeedback(true);
    } catch (err) {
      console.error(err);
      setError('Failed to load feedback.');
    } finally {
      setLoadingFeedback(false);
    }
  }

  const ratingOptions = [
   
    { label: 'Excellent', value: 'Excellent', icon: '/icons/icon_excellent.png' },
    { label: 'Good', value: 'Good', icon: '/icons/icon_good.png' },
    { label: 'Medium', value: 'Medium', icon: '/icons/icon_medium.png' },
         { label: 'Poor', value: 'Poor', icon: '/icons/icon_poor.png' },
  ];

  return (
    <div className="mx-auto w-full max-w-md px-4 py-6">
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">Feedback Survey</h1>
        {email && <p className="text-gray-700 mb-4">For: <span className="font-medium">{email}</span></p>}
        {error && <p className="text-rose-600 mb-4">{error}</p>}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Rating icons */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              How was your experience?
            </label>
                <div className="flex justify-between gap-2 p-4">
                  {ratingOptions.map((option) => (
                    <img
                      key={option.label}
                      src={option.icon}
                      alt={option.label}
                      onClick={() => setRating(option.label)}
                      className={`cursor-pointer transition-transform ${
                        rating === option.label ? 'scale-125' : 'scale-100'
                      }`}
                      title={option.label}
                      style={{
                        width: '50px',  // fixed width
                        height: '50px', // fixed height
                        objectFit: 'contain', // keep PNG aspect ratio
                      }}
                    />
                  ))}
                </div>
          </div>

          {/* Optional feedback input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Additional Feedback (optional)</label>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm text-sm focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="Write your feedback here..."
            />
          </div>

          <button
            type="submit"
            disabled={status === 'Sending'}
            className={`w-full px-4 py-2 rounded-lg text-white font-medium shadow-sm transition ${
              status === 'Sending'
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            {status === 'Sending' ? 'Submitting...' : 'Submit Feedback'}
          </button>
        </form>

        {status === 'Sent' && <p className="text-green-600 mt-4">Thank you! Your feedback has been submitted.</p>}
        {status === 'Error' && <p className="text-rose-600 mt-4">{error}</p>}

        {/* See All Feedback */}
        <div className="mt-6">
          <button
            onClick={handleShowAllFeedback}
            className="w-full px-4 py-2 rounded-lg bg-gray-100 text-gray-700 font-medium shadow-sm hover:bg-gray-200 transition"
            disabled={loadingFeedback}
          >
            {loadingFeedback ? 'Loading...' : 'See All Feedback'}
          </button>

          {showFeedback && allFeedback.length > 0 && (
            <div className="mt-4 max-h-64 overflow-y-auto border border-gray-200 rounded-xl p-4 bg-gray-50">
              <h2 className="text-sm font-semibold text-gray-900 mb-2">All Feedback</h2>
              <ul className="space-y-2">
                {allFeedback.map((f, i) => (
                  <li key={i} className="p-2 border rounded-lg bg-white">
                    <p className="text-sm font-medium text-gray-800">{f.email}</p>
                    <p className="text-sm text-gray-700">Rate: {f.rate}</p>
                    <p className="text-sm text-gray-700">Feedback: {f.feedback}</p>
                    <p className="text-xs text-gray-500">Submitted: {new Date(f.submitted_at).toLocaleString()}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {showFeedback && allFeedback.length === 0 && (
            <p className="mt-4 text-gray-500 text-sm">No feedback submitted yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
