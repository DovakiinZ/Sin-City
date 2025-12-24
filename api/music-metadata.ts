import type { VercelRequest, VercelResponse } from '@vercel/node';

interface MusicMetadata {
    url: string;
    platform: 'spotify' | 'youtube' | 'apple';
    title: string;
    artist: string;
    cover_image: string;
    embed_url: string;
    preview_url?: string;
    cached_at: string;
}

/**
 * Fetch Spotify metadata using oEmbed (public, no auth required)
 */
async function fetchSpotifyMetadata(url: string): Promise<MusicMetadata | null> {
    try {
        const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`;
        const response = await fetch(oembedUrl);
        if (!response.ok) return null;

        const data = await response.json();

        // Extract track/album/playlist ID for embed URL
        const match = url.match(/spotify\.com\/(track|album|playlist)\/([a-zA-Z0-9]+)/);
        const type = match?.[1] || 'track';
        const id = match?.[2];

        // Parse title - format is usually "Song Name - Artist Name" or just the title
        let title = data.title || 'Unknown Track';
        let artist = 'Spotify';

        // Try to extract artist from title if it contains " - " or " by "
        if (title.includes(' - ')) {
            const parts = title.split(' - ');
            title = parts[0].trim();
            artist = parts.slice(1).join(' - ').trim();
        }

        return {
            url,
            platform: 'spotify',
            title,
            artist,
            cover_image: data.thumbnail_url || '',
            embed_url: id ? `https://open.spotify.com/embed/${type}/${id}?utm_source=generator&theme=0` : '',
            cached_at: new Date().toISOString(),
        };
    } catch (error) {
        console.error('Spotify metadata fetch error:', error);
        return null;
    }
}

/**
 * Fetch YouTube metadata using oEmbed
 */
async function fetchYouTubeMetadata(url: string): Promise<MusicMetadata | null> {
    try {
        const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
        const response = await fetch(oembedUrl);
        if (!response.ok) return null;

        const data = await response.json();

        // Extract video ID
        let videoId = '';
        if (url.includes('youtu.be')) {
            videoId = url.split('/').pop()?.split('?')[0] || '';
        } else {
            try {
                const urlObj = new URL(url);
                videoId = urlObj.searchParams.get('v') || '';
            } catch {
                // URL parsing failed
            }
        }

        return {
            url,
            platform: 'youtube',
            title: data.title || 'Unknown Video',
            artist: data.author_name || 'YouTube',
            cover_image: data.thumbnail_url || '',
            embed_url: videoId ? `https://www.youtube.com/embed/${videoId}` : '',
            cached_at: new Date().toISOString(),
        };
    } catch (error) {
        console.error('YouTube metadata fetch error:', error);
        return null;
    }
}

/**
 * Fetch Apple Music metadata using oEmbed
 */
async function fetchAppleMusicMetadata(url: string): Promise<MusicMetadata | null> {
    try {
        // Apple Music oEmbed endpoint
        const oembedUrl = `https://music.apple.com/oembed?url=${encodeURIComponent(url)}&format=json`;
        const response = await fetch(oembedUrl);

        if (!response.ok) {
            // Fallback: Try to parse the URL for basic info
            return createAppleMusicFallback(url);
        }

        const data = await response.json();

        // Extract song/album ID for embed
        // URL format: https://music.apple.com/{country}/album/{album-name}/{album-id}?i={track-id}
        const match = url.match(/music\.apple\.com\/([a-z]{2})\/(album|song|playlist)\/[^/]+\/(\d+)/i);
        const country = match?.[1] || 'us';
        const type = match?.[2] || 'album';
        const id = match?.[3];

        // Check for track ID in query params
        let embedUrl = '';
        try {
            const urlObj = new URL(url);
            const trackId = urlObj.searchParams.get('i');
            if (trackId) {
                embedUrl = `https://embed.music.apple.com/${country}/album/${id}?i=${trackId}&app=music`;
            } else if (id) {
                embedUrl = `https://embed.music.apple.com/${country}/${type}/${id}?app=music`;
            }
        } catch {
            // URL parsing failed
        }

        return {
            url,
            platform: 'apple',
            title: data.title || 'Apple Music',
            artist: data.author_name || 'Apple Music',
            cover_image: data.thumbnail_url || '',
            embed_url: embedUrl,
            cached_at: new Date().toISOString(),
        };
    } catch (error) {
        console.error('Apple Music metadata fetch error:', error);
        return createAppleMusicFallback(url);
    }
}

/**
 * Create fallback metadata for Apple Music when oEmbed fails
 */
function createAppleMusicFallback(url: string): MusicMetadata | null {
    try {
        // Try to extract info from URL
        const match = url.match(/music\.apple\.com\/([a-z]{2})\/(album|song|playlist)\/([^/]+)\/(\d+)/i);
        if (!match) return null;

        const country = match[1];
        const type = match[2];
        const titleSlug = match[3];
        const id = match[4];

        // Convert slug to readable title
        const title = titleSlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

        const urlObj = new URL(url);
        const trackId = urlObj.searchParams.get('i');

        let embedUrl = '';
        if (trackId) {
            embedUrl = `https://embed.music.apple.com/${country}/album/${id}?i=${trackId}&app=music`;
        } else {
            embedUrl = `https://embed.music.apple.com/${country}/${type}/${id}?app=music`;
        }

        return {
            url,
            platform: 'apple',
            title,
            artist: 'Apple Music',
            cover_image: '', // No cover available without API
            embed_url: embedUrl,
            cached_at: new Date().toISOString(),
        };
    } catch {
        return null;
    }
}

/**
 * Detect platform from URL
 */
function detectPlatform(url: string): 'spotify' | 'youtube' | 'apple' | null {
    if (url.includes('spotify.com')) return 'spotify';
    if (url.includes('youtube.com') || url.includes('youtu.be') || url.includes('music.youtube.com')) return 'youtube';
    if (url.includes('music.apple.com')) return 'apple';
    return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { url } = req.body;
    if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: 'URL required' });
    }

    const platform = detectPlatform(url);
    if (!platform) {
        return res.status(422).json({
            error: 'Unsupported platform. Use Spotify, Apple Music, or YouTube Music URLs.'
        });
    }

    let metadata: MusicMetadata | null = null;

    switch (platform) {
        case 'spotify':
            metadata = await fetchSpotifyMetadata(url);
            break;
        case 'youtube':
            metadata = await fetchYouTubeMetadata(url);
            break;
        case 'apple':
            metadata = await fetchAppleMusicMetadata(url);
            break;
    }

    if (!metadata) {
        return res.status(422).json({
            error: 'Could not fetch metadata for this URL. The link may be invalid or the service is unavailable.'
        });
    }

    return res.status(200).json(metadata);
}
