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
    discord_username: string | null;
    role?: string;
    created_at: string;
    updated_at: string;
}

/**
 * Load one profile row. Network / IP columns on profiles are not readable by
 * browsers (column privileges), so a plain select("*") is rejected; the
 * get_profile_public RPC returns the row without those columns. Falls back to
 * select("*") on databases where the RPC has not been installed yet.
 */
export async function fetchProfileRow(userId: string): Promise<{ data: any | null; error: { code?: string; message: string } | null }> {
    const { data, error } = await supabase.rpc("get_profile_public", { p_id: userId });
    if (!error) {
        return data
            ? { data, error: null }
            : { data: null, error: { code: "PGRST116", message: "Profile not found" } };
    }
    return await supabase.from("profiles").select("*").eq("id", userId).single();
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
                const { data, error: fetchError } = await fetchProfileRow(userId);

                if (fetchError) {
                    // Profile doesn't exist, create it
                    if (fetchError.code === "PGRST116") {
                        const { data: userData } = await supabase.auth.getUser();
                        if (userData.user) {
                            await createProfile({
                                id: userId,
                                username: userData.user.email?.split("@")[0] || null,
                                display_name: null,
                                bio: null,
                                avatar_url: null,
                                ascii_avatar: null,
                                header_url: null,
                                website: null,
                                location: null,
                                twitter_username: null,
                                instagram_username: null,
                                discord_username: null,
                            });
                            // Fetch again
                            const { data: newProfile } = await fetchProfileRow(userId);
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
                        // Merge: the realtime payload omits columns this role cannot read.
                        setProfile(prev => ({ ...(prev || {}), ...(payload.new as UserProfile) }));
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
    // No RETURNING *: it would need read access to every column.
    const { error } = await supabase
        .from("profiles")
        .insert([profile]);

    if (error) throw error;
    return (await fetchProfileRow(profile.id)).data;
}

export async function updateProfile(
    userId: string,
    updates: Partial<Omit<UserProfile, "id" | "created_at" | "updated_at">>
) {
    // No RETURNING *: it would need read access to every column.
    const { error } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", userId);

    if (error) throw error;
    return (await fetchProfileRow(userId)).data;
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
