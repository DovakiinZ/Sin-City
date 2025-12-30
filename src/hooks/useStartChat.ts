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
            // Use the RPC function that handles ordering and conflicts
            const { data, error } = await supabase
                .rpc("get_or_create_session", { p_other_user_id: otherUserId });

            if (error) throw error;
            return data as string;
        } catch (error) {
            console.error("Error starting chat:", error);
            return null;
        }
    }, [user]);

    /**
     * Start an anonymous chat with a user
     * Note: Anonymous mode is simplified - just uses regular chat
     */
    const startAnonymousChat = useCallback(async (otherUserId: string): Promise<string | null> => {
        if (!user) return null;

        try {
            // Use the same RPC function (anonymous mode is not supported in simplified schema)
            const { data, error } = await supabase
                .rpc("get_or_create_session", { p_other_user_id: otherUserId });

            if (error) throw error;
            return data as string;
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
