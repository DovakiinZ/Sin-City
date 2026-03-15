/**
 * Deterministic anonymous identity generator for chats
 * Creates consistent aliases and avatar seeds per conversation
 */

/**
 * Generate a deterministic hash from a string
 */
function simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
}

/**
 * Generate a random hex string from a seed
 */
function seededHex(seed: string, length: number = 4): string {
    const hash = simpleHash(seed);
    return hash.toString(16).toUpperCase().slice(0, length).padStart(length, '0');
}

/**
 * Generate a deterministic anonymous alias for a user in a specific chat session
 * The alias is consistent for the same user+session combination
 * 
 * @param userId - The real user ID
 * @param sessionId - The chat session ID
 * @returns An alias like "Unknown_A3F2"
 */
export function generateChatAlias(userId: string, sessionId: string): string {
    const combinedSeed = `${userId}:${sessionId}:anonymous`;
    const hex = seededHex(combinedSeed);
    return `Unknown_${hex}`;
}

/**
 * Generate a deterministic avatar seed for anonymous users
 * This seed can be used with DiceBear or similar avatar services
 * 
 * @param userId - The real user ID
 * @param sessionId - The chat session ID
 * @returns A consistent seed string for avatar generation
 */
export function generateAvatarSeed(userId: string, sessionId: string): string {
    const combinedSeed = `${userId}:${sessionId}:avatar`;
    return seededHex(combinedSeed, 8);
}

/**
 * Check if a name appears to be an anonymous alias
 */
export function isAnonymousAlias(name: string): boolean {
    return /^Unknown_[A-F0-9]{4}$/.test(name);
}

/**
 * Generate both alias and avatar seed together
 */
export function generateAnonymousIdentity(userId: string, sessionId: string): {
    alias: string;
    avatarSeed: string;
} {
    return {
        alias: generateChatAlias(userId, sessionId),
        avatarSeed: generateAvatarSeed(userId, sessionId)
    };
}
