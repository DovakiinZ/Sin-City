import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";

/**
 * Is the signed-in user a site admin?
 *
 * Reads profiles.role rather than trusting user_metadata, which is
 * client-writable and can be stale.
 */
export function useIsAdmin() {
    const { user } = useAuth();
    const [isAdmin, setIsAdmin] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;

        if (!user?.id) {
            setIsAdmin(false);
            setLoading(false);
            return;
        }

        setLoading(true);
        supabase
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .single()
            .then(({ data }) => {
                if (cancelled) return;
                setIsAdmin(data?.role === "admin");
                setLoading(false);
            });

        return () => { cancelled = true; };
    }, [user?.id]);

    return { isAdmin, loading };
}
