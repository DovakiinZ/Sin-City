// Utilities for Spotify PKCE Authentication

const clientId = (import.meta.env.VITE_SPOTIFY_CLIENT_ID || '').trim();
const redirectUri = window.location.origin + '/profile/edit'; // Must match Spotify App exactly

const generateRandomString = (length: number) => {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const values = crypto.getRandomValues(new Uint8Array(length));
    return values.reduce((acc, x) => acc + possible[x % possible.length], "");
}

const sha256 = async (plain: string) => {
    const encoder = new TextEncoder()
    const data = encoder.encode(plain)
    return window.crypto.subtle.digest('SHA-256', data)
}

const base64encode = (input: ArrayBuffer) => {
    return btoa(String.fromCharCode(...new Uint8Array(input)))
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

export const loginWithSpotify = async () => {
    if (!clientId) {
        throw new Error('Spotify Client ID not configured in .env');
    }

    const codeVerifier = generateRandomString(64);
    const hashed = await sha256(codeVerifier);
    const codeChallenge = base64encode(hashed);

    window.localStorage.setItem('spotify_code_verifier', codeVerifier);

    const authUrl = new URL("https://accounts.spotify.com/authorize");
    
    const params = {
        response_type: 'code',
        client_id: clientId,
        scope: 'user-read-currently-playing',
        code_challenge_method: 'S256',
        code_challenge: codeChallenge,
        redirect_uri: redirectUri,
    }

    authUrl.search = new URLSearchParams(params).toString();
    window.location.href = authUrl.toString();
};

export const handleSpotifyCallback = async (code: string) => {
    const codeVerifier = localStorage.getItem('spotify_code_verifier');
    if (!codeVerifier) throw new Error('No code verifier found');

    const payload = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            client_id: clientId,
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri,
            code_verifier: codeVerifier,
        }),
    }

    const body = await fetch('https://accounts.spotify.com/api/token', payload);
    const response = await body.json();

    if (response.access_token) {
        localStorage.setItem('spotify_access_token', response.access_token);
        localStorage.setItem('spotify_refresh_token', response.refresh_token);
        localStorage.setItem('spotify_expires_at', (Date.now() + response.expires_in * 1000).toString());
        return true;
    }
    throw new Error(response.error_description || 'Failed to authenticate');
};

export const refreshSpotifyToken = async () => {
    const refreshToken = localStorage.getItem('spotify_refresh_token');
    if (!refreshToken) return null;

    const payload = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: clientId
        }),
    }

    try {
        const body = await fetch('https://accounts.spotify.com/api/token', payload);
        const response = await body.json();

        if (response.access_token) {
            localStorage.setItem('spotify_access_token', response.access_token);
            if (response.refresh_token) {
                localStorage.setItem('spotify_refresh_token', response.refresh_token);
            }
            localStorage.setItem('spotify_expires_at', (Date.now() + response.expires_in * 1000).toString());
            return response.access_token;
        }
    } catch (e) {
        console.error("Failed to refresh token", e);
    }
    
    // If refresh fails permanently, clear tokens
    localStorage.removeItem('spotify_access_token');
    localStorage.removeItem('spotify_refresh_token');
    return null;
};

export const getValidAccessToken = async () => {
    let token = localStorage.getItem('spotify_access_token');
    const expiresAt = localStorage.getItem('spotify_expires_at');

    if (!token || !expiresAt) return null;

    // If expires in less than 5 minutes, refresh it
    if (Date.now() > parseInt(expiresAt) - 300000) {
        token = await refreshSpotifyToken();
    }

    return token;
};

export const disconnectSpotify = () => {
    localStorage.removeItem('spotify_access_token');
    localStorage.removeItem('spotify_refresh_token');
    localStorage.removeItem('spotify_expires_at');
};
