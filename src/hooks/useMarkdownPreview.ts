import { useState, useCallback } from 'react';

// URL patterns for detection
const URL_REGEX = /(https?:\/\/[^\s]+)/g;
const SPOTIFY_REGEX = /https?:\/\/(?:open\.)?spotify\.com\/(track|album|playlist|artist)\/([a-zA-Z0-9]+)/;
const YOUTUBE_REGEX = /https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]+)/;

export type PostType = 'thought' | 'article' | 'media' | 'music';

export interface UrlMatch {
    url: string;
    type: 'spotify' | 'youtube' | 'link';
    id?: string;
    startIndex: number;
    endIndex: number;
}

export function useMarkdownPreview() {
    // Detect URLs in text
    const detectUrls = useCallback((text: string): UrlMatch[] => {
        const matches: UrlMatch[] = [];
        let match;

        URL_REGEX.lastIndex = 0;
        while ((match = URL_REGEX.exec(text)) !== null) {
            const url = match[0];
            const startIndex = match.index;
            const endIndex = startIndex + url.length;

            // Check if it's Spotify
            const spotifyMatch = url.match(SPOTIFY_REGEX);
            if (spotifyMatch) {
                matches.push({
                    url,
                    type: 'spotify',
                    id: spotifyMatch[2],
                    startIndex,
                    endIndex
                });
                continue;
            }

            // Check if it's YouTube
            const ytMatch = url.match(YOUTUBE_REGEX);
            if (ytMatch) {
                matches.push({
                    url,
                    type: 'youtube',
                    id: ytMatch[1],
                    startIndex,
                    endIndex
                });
                continue;
            }

            // Regular link
            matches.push({
                url,
                type: 'link',
                startIndex,
                endIndex
            });
        }

        return matches;
    }, []);

    // Detect post type based on content and media
    const detectPostType = useCallback((
        content: string,
        hasMedia: boolean,
        hasMusicUrl: boolean
    ): PostType => {
        if (hasMusicUrl) return 'music';
        if (hasMedia) return 'media';
        if (content.length < 280 && !content.includes('\n\n')) return 'thought';
        return 'article';
    }, []);

    // Parse markdown-style formatting for preview
    // Returns HTML string with basic formatting applied
    const parseInlineMarkdown = useCallback((text: string): string => {
        if (!text) return '';

        const result = text
            // Escape HTML
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            // Bold: **text**
            .replace(/\*\*(.+?)\*\*/g, '<strong class="text-white font-bold">$1</strong>')
            // Italic: _text_ or *text*
            .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em class="italic text-gray-300">$1</em>')
            .replace(/_(.+?)_/g, '<em class="italic text-gray-300">$1</em>')
            // Inline code: `code`
            .replace(/`(.+?)`/g, '<code class="bg-green-900/30 text-green-400 px-1 rounded font-mono text-sm">$1</code>')
            // Headings at start of line
            .replace(/^### (.+)$/gm, '<span class="text-lg font-bold text-green-400">$1</span>')
            .replace(/^## (.+)$/gm, '<span class="text-xl font-bold text-green-300">$1</span>')
            .replace(/^# (.+)$/gm, '<span class="text-2xl font-bold text-green-200">$1</span>')
            // Quote blocks
            .replace(/^> (.+)$/gm, '<span class="border-l-2 border-green-500 pl-3 text-gray-400 italic block">$1</span>')
            // Code block: ```lang\ncode\n```
            .replace(/```([\w-]+)?\n([\s\S]+?)```/g, (match, lang, code) => {
                const language = lang || 'plaintext';
                return `<div class="my-4 rounded-lg overflow-hidden border border-green-900/50 bg-black shadow-[0_0_15px_rgba(34,197,94,0.1)] group">
                    <div class="flex items-center justify-between px-3 py-1.5 bg-green-900/20 border-b border-green-900/50">
                        <div class="flex items-center gap-1.5">
                            <div class="w-2.5 h-2.5 rounded-full bg-red-500/80"></div>
                            <div class="w-2.5 h-2.5 rounded-full bg-yellow-500/80"></div>
                            <div class="w-2.5 h-2.5 rounded-full bg-green-500/80"></div>
                        </div>
                        <span class="text-xs font-mono text-green-500/70 lowercase">${language}</span>
                    </div>
                    <div class="p-3 overflow-x-auto">
                        <pre><code class="text-green-400 font-mono text-sm leading-relaxed">${code}</code></pre>
                    </div>
                </div>`;
            })
            // Links (only if not inside an HTML attribute like href="..." or src="...")
            .replace(/(?<!["'])(https?:\/\/[^\s<]+)/g, '<span class="text-green-400 underline cursor-pointer" onclick="window.open(\'$1\', \'_blank\')">$1</span>');

        return result;
    }, []);

    // Extract title from content (first # heading)
    const extractTitle = useCallback((content: string): string | null => {
        const match = content.match(/^#\s+(.+)$/m);
        return match ? match[1].trim() : null;
    }, []);

    return {
        detectUrls,
        detectPostType,
        parseInlineMarkdown,
        extractTitle
    };
}

export default useMarkdownPreview;
