import { useState } from 'react';
import LegalPageLayout from '../../../components/legal/LegalPageLayout';
import policies from '../../../data/policies/terms';

export default function AcceptancePage() {
  const [accepted, setAccepted] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleAccept = () => {
    setAccepted(true);
    setSubmitted(true);
    // TODO: Integrate with backend to record acceptance if required
  };

  return (
    <LegalPageLayout policy={policies}>
      <div className="max-w-xl mx-auto my-8 p-6 bg-surface rounded shadow">
        <h2 className="text-2xl font-bold mb-4">Accept Terms and Conditions</h2>
        <p className="mb-4">Please review and accept the latest Terms and Conditions to continue using RawDrive.</p>
        <div className="flex items-center mb-4">
          <input
            id="accept"
            type="checkbox"
            checked={accepted}
            onChange={e => setAccepted(e.target.checked)}
            className="mr-2"
          />
          <label htmlFor="accept" className="text-sm">
            I have read and accept the Terms and Conditions
          </label>
        </div>
        <button
          className="bg-primary-600 text-white px-4 py-2 rounded disabled:opacity-50"
          disabled={!accepted || submitted}
          onClick={handleAccept}
        >
          {submitted ? 'Accepted' : 'Accept'}
        </button>
        {submitted && <div className="mt-4 text-green-600">Thank you for accepting the Terms and Conditions.</div>}
      </div>
    </LegalPageLayout>
  );
}
