"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { exchangeCodeForToken } from "@/lib/spotify-auth";

/**
 * Inner component that reads search params (must be inside Suspense).
 */
function CallbackHandler() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");

  useEffect(() => {
    const code = searchParams.get("code");
    const error = searchParams.get("error");

    if (error) {
      console.error("[Spotify Callback] Auth denied:", error);
      setStatus("error");
      setTimeout(() => router.replace("/"), 3000);
      return;
    }

    if (!code) {
      console.error("[Spotify Callback] No code in URL.");
      setStatus("error");
      setTimeout(() => router.replace("/"), 3000);
      return;
    }

    exchangeCodeForToken(code).then((tokenData) => {
      if (tokenData) {
        console.log("[Spotify Auth] ✅ Login succeeded! Access token stored.");
        console.log("[Spotify Auth] Token preview:", tokenData.access_token.slice(0, 20) + "…");
        setStatus("success");
      } else {
        setStatus("error");
      }
      setTimeout(() => router.replace("/"), 2000);
    });
  }, [searchParams, router]);

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#0a0a0a",
        color: "#fff",
        fontFamily: "system-ui, sans-serif",
        gap: "16px",
      }}
    >
      {status === "loading" && (
        <>
          <div
            style={{
              width: "36px",
              height: "36px",
              border: "3px solid rgba(255,255,255,0.15)",
              borderTopColor: "#1DB954",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
            }}
          />
          <p style={{ opacity: 0.7, letterSpacing: "1px", fontSize: "13px", textTransform: "uppercase" }}>
            Connecting to Spotify…
          </p>
        </>
      )}
      {status === "success" && (
        <>
          <span style={{ fontSize: "42px" }}>✅</span>
          <p style={{ color: "#1DB954", fontWeight: 700, letterSpacing: "1px", fontSize: "14px", textTransform: "uppercase" }}>
            Logged in — redirecting…
          </p>
        </>
      )}
      {status === "error" && (
        <>
          <span style={{ fontSize: "42px" }}>❌</span>
          <p style={{ color: "#e74c3c", fontWeight: 700, letterSpacing: "1px", fontSize: "14px", textTransform: "uppercase" }}>
            Login failed — redirecting…
          </p>
        </>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/**
 * /callback page — wrapped in Suspense as required by Next.js for
 * components that use useSearchParams().
 */
export default function SpotifyCallback() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            width: "100vw",
            height: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#0a0a0a",
            color: "#fff",
          }}
        >
          <p style={{ opacity: 0.5, letterSpacing: "1px", fontSize: "13px", textTransform: "uppercase" }}>
            Loading…
          </p>
        </div>
      }
    >
      <CallbackHandler />
    </Suspense>
  );
}
