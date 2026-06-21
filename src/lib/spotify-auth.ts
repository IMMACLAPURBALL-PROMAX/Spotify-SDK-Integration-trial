// ============================================================
// Spotify Authorization Code Flow with PKCE (Client-Side)
// ============================================================
// Reference: https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow

const SPOTIFY_AUTH_ENDPOINT = "https://accounts.spotify.com/authorize";
const SPOTIFY_TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token";

// Scopes determine what the token can access.
// Add more as needed: https://developer.spotify.com/documentation/web-api/concepts/scopes
const SCOPES = [
  "user-read-email",
  "user-read-private",
  "streaming",
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-read-currently-playing",
].join(" ");

// ---- PKCE helpers ----

/** Generate a cryptographically random string of a given length. */
function generateRandomString(length: number): string {
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const values = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(values, (v) => possible[v % possible.length]).join("");
}

/** SHA-256 hash a plain string and return the ArrayBuffer. */
async function sha256(plain: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return crypto.subtle.digest("SHA-256", data);
}

/** Base64-URL encode an ArrayBuffer (no padding). */
function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ---- Public API ----

/**
 * Kicks off the Spotify login flow.
 * Generates a PKCE code verifier / challenge pair, stores the verifier in
 * sessionStorage, then redirects the browser to Spotify's authorize page.
 */
export async function redirectToSpotifyLogin(): Promise<void> {
  const clientId = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID;
  if (!clientId) {
    console.error(
      "[Spotify Auth] NEXT_PUBLIC_SPOTIFY_CLIENT_ID is not set. " +
      "Create a .env.local file with your Client ID."
    );
    return;
  }

  const redirectUri = window.location.origin + "/callback";

  // Generate PKCE pair
  const codeVerifier = generateRandomString(64);
  const hashed = await sha256(codeVerifier);
  const codeChallenge = base64UrlEncode(hashed);

  // Persist verifier so we can use it after the redirect
  sessionStorage.setItem("spotify_code_verifier", codeVerifier);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope: SCOPES,
    redirect_uri: redirectUri,
    code_challenge_method: "S256",
    code_challenge: codeChallenge,
  });

  // Navigate to Spotify
  window.location.href = `${SPOTIFY_AUTH_ENDPOINT}?${params.toString()}`;
}

/**
 * Exchanges the authorization `code` (from the callback URL) for an access
 * token using the stored PKCE code verifier.
 *
 * Returns the full token response on success, or `null` on failure.
 */
export async function exchangeCodeForToken(
  code: string
): Promise<SpotifyTokenResponse | null> {
  const clientId = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID;
  if (!clientId) {
    console.error("[Spotify Auth] NEXT_PUBLIC_SPOTIFY_CLIENT_ID is not set.");
    return null;
  }

  const codeVerifier = sessionStorage.getItem("spotify_code_verifier");
  if (!codeVerifier) {
    console.error("[Spotify Auth] No code_verifier found in sessionStorage.");
    return null;
  }

  const redirectUri = window.location.origin + "/callback";

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: codeVerifier,
  });

  try {
    const res = await fetch(SPOTIFY_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    if (!res.ok) {
      const err = await res.json();
      console.error("[Spotify Auth] Token exchange failed:", err);
      return null;
    }

    const data: SpotifyTokenResponse = await res.json();

    // Store tokens
    localStorage.setItem("spotify_access_token", data.access_token);
    if (data.refresh_token) {
      localStorage.setItem("spotify_refresh_token", data.refresh_token);
    }
    localStorage.setItem(
      "spotify_token_expiry",
      String(Date.now() + data.expires_in * 1000)
    );

    // Clean up verifier
    sessionStorage.removeItem("spotify_code_verifier");

    return data;
  } catch (err) {
    console.error("[Spotify Auth] Network error during token exchange:", err);
    return null;
  }
}

/**
 * Returns the stored access token if it hasn't expired, otherwise `null`.
 */
export function getStoredAccessToken(): string | null {
  const token = localStorage.getItem("spotify_access_token");
  const expiry = localStorage.getItem("spotify_token_expiry");
  if (!token || !expiry) return null;
  if (Date.now() > Number(expiry)) {
    // Token expired — clear it
    localStorage.removeItem("spotify_access_token");
    localStorage.removeItem("spotify_token_expiry");
    return null;
  }
  return token;
}

/**
 * Clears all stored Spotify auth data (logout).
 */
export function clearSpotifyAuth(): void {
  localStorage.removeItem("spotify_access_token");
  localStorage.removeItem("spotify_refresh_token");
  localStorage.removeItem("spotify_token_expiry");
  sessionStorage.removeItem("spotify_code_verifier");
}

// ---- Types ----

export interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  expires_in: number;
  refresh_token?: string;
}
