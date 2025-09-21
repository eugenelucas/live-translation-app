import { useState } from 'react';

export default function FeedbackSubmit() {
  const [email, setEmail] = useState('');
  const [rating, setRating] = useState(''); // Excellent / Good / Medium / Poor
  const [feedbackText, setFeedbackText] = useState(''); // Optional multi-line feedback
  const [status, setStatus] = useState('Idle'); // Idle | Sending | Sent | Error
  const [error, setError] = useState('');

  const [allFeedback, setAllFeedback] = useState([]);
  const [showFeedback, setShowFeedback] = useState(false);
  const [loadingFeedback, setLoadingFeedback] = useState(false);

  const backendUrl = import.meta.env.VITE_BACKEND_URL;

  // Rating options matching your PNGs in public/icons
  const ratingOptions = [
    { label: 'Excellent', icon: '/icons/icon_excellent.png' },
    { label: 'Good', icon: '/icons/icon_good.png' },
    { label: 'Medium', icon: '/icons/icon_medium.png' },
    { label: 'Poor', icon: '/icons/icon_poor.png' },
  ];

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email || !rating) {
      setError('Please enter email and select a rating.');
      return;
    }

    setStatus('Sending');
    setError('');

    try {
      const formData = new FormData();
      formData.append('email', email); 
      formData.append('rate',rating);
      if (feedbackText) formData.append('feedback_text', feedbackText);

      const response = await fetch(`${backendUrl}/submit-feedback-email`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error(`Server error: ${response.status}`);

      setStatus('Sent');
      setEmail('');
      setRating('');
      setFeedbackText('');
    } catch (err) {
      console.error(err);
      setError('Failed to submit. Please try again.');
      setStatus('Error');
    }
  }

  async function handleShowAllFeedback() {
    setLoadingFeedback(true);
    try {
      const res = await fetch(`${backendUrl}/all-feedback-email`);
      if (!res.ok) throw new Error('Failed to fetch feedback');
      const data = await res.json();
      setAllFeedback(data.feedbacks || []);
      setShowFeedback(true);
      console.log(data.feedbacks)
    } catch (err) {
      console.error(err);
      setError('Failed to load feedback.');
    } finally {
      setLoadingFeedback(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-6">
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">Feedback Survey</h1>
        {error && <p className="text-rose-600 mb-4">{error}</p>}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="Enter your email"
              required
            />
          </div>

          {/* Rating Icons */}
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


          {/* Optional Feedback Text */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Additional Feedback (optional)
            </label>
            <textarea
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="Share more details..."
              rows={4}
            />
          </div>

          {/* Submit Button */}
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

        {status === 'Sent' && (
          <p className="text-green-600 mt-4">
            Thank you! Your feedback has been submitted.
          </p>
        )}
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
                    <p className="text-sm text-gray-700">Rating: {f.Rate}</p>
                    {f.feedback && (
                      <p className="text-sm text-gray-700">Feedback: {f.feedback}</p>
                    )}
                    <p className="text-xs text-gray-500">
                      Submitted: {new Date(f.submitted_at).toLocaleString()}
                    </p>
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
