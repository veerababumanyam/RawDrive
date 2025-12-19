import React, { useState } from 'react';

interface Props {
  onAccept: () => void;
  accepted: boolean;
}

const UserAcceptanceBanner: React.FC<Props> = ({ onAccept, accepted }) => {
  const [checked, setChecked] = useState(false);

  return (
    <div className="fixed bottom-0 left-0 w-full bg-surface border-t border-border p-4 flex flex-col md:flex-row items-center justify-between z-50 shadow-lg">
      <div className="flex items-center gap-2">
        <input
          id="accept-banner"
          type="checkbox"
          checked={checked}
          onChange={e => setChecked(e.target.checked)}
          className="mr-2"
        />
        <label htmlFor="accept-banner" className="text-sm">
          I accept the <a href="/legal/terms" className="underline text-primary-600">Terms and Conditions</a>
        </label>
      </div>
      <button
        className="ml-4 bg-primary-600 text-white px-4 py-2 rounded disabled:opacity-50"
        disabled={!checked || accepted}
        onClick={onAccept}
      >
        {accepted ? 'Accepted' : 'Accept'}
      </button>
    </div>
  );
};

export default UserAcceptanceBanner;
