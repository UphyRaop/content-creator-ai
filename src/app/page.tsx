"use client";

import { useState } from "react";

function BrandMark() {
  return (
    <div className="prototype-loading-brand" role="img" aria-label="CCAI — Content Creator AI Creator Studio">
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <rect width="64" height="64" rx="16" fill="#090909" />
        <path d="M43 16a20 20 0 1 0 0 32" fill="none" stroke="#FF8A24" strokeWidth="6" strokeLinecap="round" />
        <path d="M25 32h22M37 21v22" fill="none" stroke="#800024" strokeWidth="5" strokeLinecap="round" />
      </svg>
      <span><strong>CCAI</strong><small>CONTENT CREATOR AI</small></span>
    </div>
  );
}

export default function Home() {
  const [loaded, setLoaded] = useState(false);

  return (
    <main className="prototype-frame-shell">
      {!loaded && (
        <div className="prototype-frame-loading" role="status" aria-live="polite">
          <BrandMark />
          <span className="prototype-frame-spinner" aria-hidden="true" />
          <span>Preparing your workspace…</span>
        </div>
      )}
      <iframe
        src="/prototype.html"
        title="CCAI — Content Creator AI Creator Studio"
        onLoad={() => setLoaded(true)}
      />
    </main>
  );
}
