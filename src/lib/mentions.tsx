import { Link } from "react-router-dom";
import React from "react";

/**
 * Parse text and convert @mentions to clickable links
 */
export function parseMentions(text: string): React.ReactNode {
    // Match @username patterns (alphanumeric, underscores, max 30 chars)
    const mentionRegex = /@([a-zA-Z0-9_]{1,30})/g;

    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let key = 0;

    while ((match = mentionRegex.exec(text)) !== null) {
        // Add text before the mention
        if (match.index > lastIndex) {
            parts.push(text.slice(lastIndex, match.index));
        }

        // Add the mention as a link
        const username = match[1];
        parts.push(
            <Link
                key={key++}
                to={`/user/${username}`}
                className="text-blue-400 hover:underline"
            >
                @{username}
            </Link>
        );

        lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
        parts.push(text.slice(lastIndex));
    }

    return parts.length > 0 ? parts : text;
}

/**
 * Extract mentioned usernames from text
 */
export function extractMentions(text: string): string[] {
    const mentionRegex = /@([a-zA-Z0-9_]{1,30})/g;
    const mentions: string[] = [];
    let match: RegExpExecArray | null;

    while ((match = mentionRegex.exec(text)) !== null) {
        if (!mentions.includes(match[1])) {
            mentions.push(match[1]);
        }
    }

    return mentions;
}
