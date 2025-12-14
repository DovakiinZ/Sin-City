import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

export interface UserProfile {
    id: string;
    username: string | null;
    display_name: string | null;
    bio: string | null;
    avatar_url: string | null;
    ascii_avatar: string | null;
    header_url: string | null;
    website: string | null;
    location: string | null;
    twitter_username: string | null;
    instagram_username: string | null;
    created_at: string;
    updated_at: string;
}

export function useProfile(userId: string | undefined) {
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!userId) {
            setProfile(null);
            setLoading(false);
            return;
        }

        let channel: RealtimeChannel;

        const fetchProfile = async () => {
            try {
                setLoading(true);
                const { data, error: fetchError } = await supabase
                    .from("profiles")
                    .select("*")
                    .eq("id", userId)
                    .single();

                if (fetchError) {
                    // Profile doesn't exist, create it
                    if (fetchError.code === "PGRST116") {
                        const { data: userData } = await supabase.auth.getUser();
                        if (userData.user) {
                            await createProfile({
                                id: userId,
                                username: userData.user.email?.split("@")[0] || null,
                                bio: null,
                                avatar_url: null,
                                ascii_avatar: null,
                                website: null,
                                location: null,
                                twitter_username: null,
                                instagram_username: null,
                            });
                            // Fetch again
                            const { data: newProfile } = await supabase
                                .from("profiles")
                                .select("*")
                                .eq("id", userId)
                                .single();
                            setProfile(newProfile);
                        }
                    } else {
                        throw fetchError;
                    }
                } else {
                    setProfile(data);
                }
                setError(null);
            } catch (err) {
                console.error("Error fetching profile:", err);
                setError(err instanceof Error ? err.message : "Failed to fetch profile");
            } finally {
                setLoading(false);
            }
        };

        const setupRealtimeSubscription = () => {
            channel = supabase
                .channel(`profile-${userId}`)
                .on(
                    "postgres_changes",
                    {
                        event: "UPDATE",
                        schema: "public",
                        table: "profiles",
                        filter: `id=eq.${userId}`,
                    },
                    (payload) => {
                        setProfile(payload.new as UserProfile);
                    }
                )
                .subscribe();
        };

        fetchProfile();
        setupRealtimeSubscription();

        return () => {
            if (channel) {
                supabase.removeChannel(channel);
            }
        };
    }, [userId]);

    return { profile, loading, error };
}

export async function createProfile(profile: Omit<UserProfile, "created_at" | "updated_at">) {
    const { data, error } = await supabase
        .from("profiles")
        .insert([profile])
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function updateProfile(
    userId: string,
    updates: Partial<Omit<UserProfile, "id" | "created_at" | "updated_at">>
) {
    const { data, error } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", userId)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function getUserStats(userId: string) {
    const [postCount, commentCount] = await Promise.all([
        supabase.rpc("get_user_post_count", { user_uuid: userId }),
        supabase.rpc("get_user_comment_count", { user_uuid: userId }),
    ]);

    return {
        posts: postCount.data || 0,
        comments: commentCount.data || 0,
    };
}
