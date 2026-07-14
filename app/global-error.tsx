"use client";

import { useEffect } from "react";

// Last-resort boundary for errors thrown by the root layout itself. It replaces
// the whole document, so it must render its own <html>/<body> and can't rely on
// the app's Tailwind stylesheet being present — hence inline styles.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "1rem",
          textAlign: "center",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <h1 style={{ fontSize: "1.125rem", fontWeight: 600 }}>
          Something went wrong
        </h1>
        <p style={{ fontSize: "0.875rem", color: "#71717a" }}>
          The app hit an unexpected error. Please reload.
        </p>
        <button
          onClick={reset}
          style={{
            borderRadius: "0.375rem",
            background: "#18181b",
            color: "#fff",
            padding: "0.5rem 1rem",
            fontSize: "0.875rem",
            fontWeight: 500,
            border: "none",
            cursor: "pointer",
          }}
        >
          Reload
        </button>
      </body>
    </html>
  );
}
