/**
 * YouTube URL Utilities
 * Centralized functions for handling YouTube URLs, video IDs, thumbnails, and embeds
 */

/**
 * Extract YouTube video ID from various URL formats
 * Supports:
 * - youtube.com/watch?v=VIDEO_ID
 * - youtu.be/VIDEO_ID
 * - music.youtube.com/watch?v=VIDEO_ID
 * - youtube.com/embed/VIDEO_ID
 * - youtube.com/v/VIDEO_ID
 */
export function extractYouTubeVideoId(url: string): string | null {
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

        // Pattern 4: youtube.com/v/VIDEO_ID
        const vPattern = /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/;
        const vMatch = url.match(vPattern);
        if (vMatch) return vMatch[1];

        return null;
    } catch (error) {
        // URL parsing failed
        return null;
    }
}

/**
 * Get YouTube thumbnail URL for a video ID
 * Quality options: maxres (1920x1080), hq (480x360), mq (320x180), default (120x90)
 * Falls back to lower quality if higher quality not available
 */
export function getYouTubeThumbnailUrl(
    videoId: string,
    quality: 'maxres' | 'hq' | 'mq' | 'default' = 'hq'
): string {
    const qualityMap = {
        maxres: 'maxresdefault',
        hq: 'hqdefault',
        mq: 'mqdefault',
        default: 'default',
    };

    return `https://img.youtube.com/vi/${videoId}/${qualityMap[quality]}.jpg`;
}

/**
 * Get multiple thumbnail URLs in fallback order (maxres → hq → mq)
 * Useful for trying higher quality first with fallback
 */
export function getYouTubeThumbnailFallbacks(videoId: string): string[] {
    return [
        getYouTubeThumbnailUrl(videoId, 'maxres'),
        getYouTubeThumbnailUrl(videoId, 'hq'),
        getYouTubeThumbnailUrl(videoId, 'mq'),
    ];
}

/**
 * Generate privacy-enhanced YouTube embed URL
 * Uses youtube-nocookie.com domain which doesn't set tracking cookies
 */
export function getPrivacyEnhancedEmbedUrl(videoId: string): string {
    return `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1`;
}

/**
 * Check if a URL is a YouTube URL (any format)
 */
export function isYouTubeUrl(url: string): boolean {
    const patterns = [
        /youtube\.com/,
        /youtu\.be/,
        /music\.youtube\.com/,
    ];

    return patterns.some(pattern => pattern.test(url));
}

/**
 * Validate if a YouTube URL is valid and extract video ID
 * Returns { valid: true, videoId: string } or { valid: false, videoId: null }
 */
export function validateYouTubeUrl(url: string): { valid: boolean; videoId: string | null } {
    if (!isYouTubeUrl(url)) {
        return { valid: false, videoId: null };
    }

    const videoId = extractYouTubeVideoId(url);
    return {
        valid: videoId !== null,
        videoId,
    };
}

/**
 * Fetch the best available YouTube thumbnail
 * Tries maxres first, falls back to hq if 404
 */
export async function fetchBestYouTubeThumbnail(videoId: string): Promise<string> {
    const thumbnails = getYouTubeThumbnailFallbacks(videoId);

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
