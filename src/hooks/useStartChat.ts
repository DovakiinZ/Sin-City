import { useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";

/**
 * Hook for creating or finding existing chat sessions
 */
export function useStartChat() {
    const { user } = useAuth();

    /**
     * Start a chat with a user - either find existing session or create new one
     * Returns the session ID
     */
    const startChat = useCallback(async (otherUserId: string): Promise<string | null> => {
        if (!user) return null;

        try {
            // Check if a session already exists between these users
            const { data: existing } = await supabase
                .from("chat_sessions")
                .select("id")
                .or(`and(participant_1.eq.${user.id},participant_2.eq.${otherUserId}),and(participant_1.eq.${otherUserId},participant_2.eq.${user.id})`)
                .single();

            if (existing) {
                return existing.id;
            }

            // Create new session
            const { data: newSession, error } = await supabase
                .from("chat_sessions")
                .insert({
                    participant_1: user.id,
                    participant_2: otherUserId,
                    participant_1_anonymous: false,
                    participant_2_anonymous: false
                })
                .select("id")
                .single();

            if (error) throw error;
            return newSession?.id || null;
        } catch (error) {
            console.error("Error starting chat:", error);
            return null;
        }
    }, [user]);

    /**
     * Start an anonymous chat with a user
     */
    const startAnonymousChat = useCallback(async (otherUserId: string): Promise<string | null> => {
        if (!user) return null;

        try {
            // Always create new anonymous session
            const { data: newSession, error } = await supabase
                .from("chat_sessions")
                .insert({
                    participant_1: user.id,
                    participant_2: otherUserId,
                    participant_1_anonymous: true,
                    participant_2_anonymous: false
                })
                .select("id")
                .single();

            if (error) throw error;
            return newSession?.id || null;
        } catch (error) {
            console.error("Error starting anonymous chat:", error);
            return null;
        }
    }, [user]);

    return {
        startChat,
        startAnonymousChat
    };
}
