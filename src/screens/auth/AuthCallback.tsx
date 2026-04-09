import React, { useEffect } from 'react';

export const AuthCallback: React.FC = () => {
  useEffect(() => {
    // This component handles the redirect back from OAuth providers
    // It sends a message to the opener window and closes the popup
    if (window.opener) {
      window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
      window.close();
    } else {
      // If opened directly, just redirect to home
      window.location.href = '/';
    }
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f0f1a] text-white">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-amber-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-white/60">Completing sign in...</p>
      </div>
    </div>
  );
};
