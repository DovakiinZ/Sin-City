import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";

export interface MusicLink {
    id: string;
    platform: "Spotify" | "YouTube Music";
    url: string;
    title: string;
    created_at: string;
    created_by: string | null;
    is_active: boolean;
}

export function useMusicLinks() {
    const [musicLinks, setMusicLinks] = useState<MusicLink[]>([]);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();

    const fetchMusicLinks = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from("music_links")
            .select("*")
            .eq("is_active", true)
            .order("created_at", { ascending: false });

        if (error) {
            console.error("Error fetching music links:", error);
            toast({
                title: "Error",
                description: "Failed to load music links",
                variant: "destructive",
            });
        } else {
            setMusicLinks(data || []);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchMusicLinks();
    }, []);

    const addMusicLink = async (
        platform: "Spotify" | "YouTube Music",
        url: string,
        title: string
    ) => {
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
            toast({
                title: "Error",
                description: "You must be logged in to add music",
                variant: "destructive",
            });
            return false;
        }

        const { data, error } = await supabase
            .from("music_links")
            .insert([{ platform, url, title, created_by: user.id }])
            .select()
            .single();

        if (error) {
            console.error("Error adding music link:", error);
            toast({
                title: "Error",
                description: error.message.includes("duplicate")
                    ? "This song URL already exists"
                    : "Failed to add music link",
                variant: "destructive",
            });
            return false;
        }

        toast({
            title: "Success",
            description: "Song added successfully",
        });
        fetchMusicLinks();
        return true;
    };

    const updateMusicLink = async (
        id: string,
        updates: Partial<Pick<MusicLink, "platform" | "url" | "title" | "is_active">>
    ) => {
        const { error } = await supabase
            .from("music_links")
            .update(updates)
            .eq("id", id);

        if (error) {
            console.error("Error updating music link:", error);
            toast({
                title: "Error",
                description: "Failed to update music link",
                variant: "destructive",
            });
            return false;
        }

        toast({
            title: "Success",
            description: "Song updated successfully",
        });
        fetchMusicLinks();
        return true;
    };

    const deleteMusicLink = async (id: string) => {
        const { error } = await supabase.from("music_links").delete().eq("id", id);

        if (error) {
            console.error("Error deleting music link:", error);
            toast({
                title: "Error",
                description: "Failed to delete music link",
                variant: "destructive",
            });
            return false;
        }

        toast({
            title: "Success",
            description: "Song deleted successfully",
        });
        fetchMusicLinks();
        return true;
    };

    const toggleMusicLink = async (id: string, isActive: boolean) => {
        return updateMusicLink(id, { is_active: isActive });
    };

    return {
        musicLinks,
        loading,
        addMusicLink,
        updateMusicLink,
        deleteMusicLink,
        toggleMusicLink,
        refetch: fetchMusicLinks,
    };
}

// Utility function to validate music URLs
export function validateMusicUrl(url: string): {
    valid: boolean;
    platform?: "Spotify" | "YouTube Music";
    error?: string;
} {
    // Spotify track URL pattern
    const spotifyPattern = /^https:\/\/open\.spotify\.com\/track\/[a-zA-Z0-9]+/;
    // YouTube Music URL pattern
    const youtubeMusicPattern = /^https:\/\/music\.youtube\.com\/watch\?v=[a-zA-Z0-9_-]+/;

    if (spotifyPattern.test(url)) {
        return { valid: true, platform: "Spotify" };
    } else if (youtubeMusicPattern.test(url)) {
        return { valid: true, platform: "YouTube Music" };
    } else {
        return {
            valid: false,
            error: "Invalid URL. Must be a Spotify track or YouTube Music song URL.",
        };
    }
}
