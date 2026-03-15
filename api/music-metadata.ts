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
 * Extract YouTube video ID from various URL formats
 */
function extractYouTubeVideoId(url: string): string | null {
    try {
        // Pattern 1: youtu.be/VIDEO_ID
        const youtuBePattern = /youtu\.be\/([a-zA-Z0-9_-]{11})/;
        const youtuBeMatch = url.match(youtuBePattern);
        if (youtuBeMatch) return youtuBeMatch[1];

        // Pattern 2: youtube.com/watch?v=VIDEO_ID or music.youtube.com/watch?v=VIDEO_ID
        const urlObj = new URL(url);
        const videoId = urlObj.searchParams.get('v');
        if (videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
            return videoId;
        }

        // Pattern 3: youtube.com/embed/VIDEO_ID
        const embedPattern = /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/;
        const embedMatch = url.match(embedPattern);
        if (embedMatch) return embedMatch[1];

        return null;
    } catch (error) {
        return null;
    }
}

/**
 * Get YouTube thumbnail URL with quality fallback
 */
function getYouTubeThumbnailUrl(videoId: string, quality: 'maxres' | 'hq' | 'mq' = 'hq'): string {
    const qualityMap = {
        maxres: 'maxresdefault',
        hq: 'hqdefault',
        mq: 'mqdefault',
    };
    return `https://img.youtube.com/vi/${videoId}/${qualityMap[quality]}.jpg`;
}

/**
 * Fetch the best available YouTube thumbnail
 * Tries maxres first, falls back to hq if not available
 */
async function fetchBestYouTubeThumbnail(videoId: string): Promise<string> {
    const thumbnails = [
        getYouTubeThumbnailUrl(videoId, 'maxres'),
        getYouTubeThumbnailUrl(videoId, 'hq'),
        getYouTubeThumbnailUrl(videoId, 'mq'),
    ];

    for (const thumbnailUrl of thumbnails) {
        try {
            const response = await fetch(thumbnailUrl, { method: 'HEAD' });
            if (response.ok) {
                return thumbnailUrl;
            }
        } catch {
            // Continue to next fallback
        }
    }

    // Return hq as final fallback (always exists)
    return getYouTubeThumbnailUrl(videoId, 'hq');
}

/**
 * Fetch YouTube metadata using oEmbed with enhanced video ID extraction and thumbnails
 */
async function fetchYouTubeMetadata(url: string): Promise<MusicMetadata | null> {
    try {
        // Extract video ID first (supports all URL formats)
        const videoId = extractYouTubeVideoId(url);
        if (!videoId) {
            console.error('Could not extract YouTube video ID from URL:', url);
            return null;
        }

        // Fetch metadata from oEmbed
        const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
        const response = await fetch(oembedUrl);

        let title = 'YouTube Video';
        let artist = 'YouTube';
        let oembedThumbnail = '';

        if (response.ok) {
            const data = await response.json();
            title = data.title || 'YouTube Video';
            artist = data.author_name || 'YouTube';
            oembedThumbnail = data.thumbnail_url || '';
        }

        // Fetch best quality thumbnail (independent of oEmbed)
        const coverImage = await fetchBestYouTubeThumbnail(videoId);

        return {
            url,
            platform: 'youtube',
            title,
            artist,
            cover_image: coverImage || oembedThumbnail,
            // Use privacy-enhanced embed domain
            embed_url: `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1`,
            cached_at: new Date().toISOString(),
        };
    } catch (error) {
        console.error('YouTube metadata fetch error:', error);

        // Fallback: Try to extract video ID and return basic metadata
        const videoId = extractYouTubeVideoId(url);
        if (videoId) {
            return {
                url,
                platform: 'youtube',
                title: 'YouTube Video',
                artist: 'YouTube',
                cover_image: getYouTubeThumbnailUrl(videoId, 'hq'),
                embed_url: `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1`,
                cached_at: new Date().toISOString(),
            };
        }

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
