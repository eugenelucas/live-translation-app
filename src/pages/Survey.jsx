import { useState } from 'react';

export default function Survey() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('Idle'); // Idle | Sending | Sent | Error
  const [error, setError] = useState('');

  const backendUrl = import.meta.env.VITE_BACKEND_URL;
  const SurveyUrl = import.meta.env.VITE_SURVEY_URL;
  async function handleSubmit(e) {
    e.preventDefault();
    setStatus('Sending');
    setError('');

    try {
      const formData = new FormData();
      formData.append('subject', 'Survey Invitation');
      formData.append('recipient', email);
      formData.append('surveylink', SurveyUrl);
      console.log(SurveyUrl)
      const response = await fetch(`${backendUrl}/send-email`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      setStatus('Sent');
    } catch (err) {
      console.error(err);
      setError('Failed to submit. Please try again.');
      setStatus('Error');
    }
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-6">
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6">
        <h1 className="text-2xl font-semibold text-gray-900 mb-4">Survey</h1>
        <p className="text-sm text-gray-600 mb-6">
          Enter your email to receive our survey.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              id="email"
              value={email}
              required
              onChange={(e) => setEmail(e.target.value)}
              className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
          </div>

          <button
            type="submit"
            disabled={status === 'Sending' || status === 'Sent'}
            className="w-full inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === 'Sending' ? 'Submitting…' : status === 'Sent' ? 'Submitted' : 'Submit'}
          </button>

          {error && <div className="text-sm text-rose-600">{error}</div>}
          {status === 'Sent' && (
            <div className="text-sm text-green-700">Thank you! Your email has been submitted.</div>
          )}
        </form>
      </div>
    </div>
  );
}