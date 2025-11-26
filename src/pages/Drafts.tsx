import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import BackButton from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { Trash2, Edit, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

interface Draft {
    id: string;
    title: string;
    content: string;
    category_id: string | null;
    tags: string[];
    auto_saved_at: string;
    created_at: string;
}

export default function Drafts() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const { toast } = useToast();
    const [drafts, setDrafts] = useState<Draft[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (user) {
            loadDrafts();
        }
    }, [user]);

    const loadDrafts = async () => {
        if (!user) return;

        try {
            const { data, error } = await supabase
                .from("drafts")
                .select("*")
                .eq("user_id", user.id)
                .order("updated_at", { ascending: false });

            if (error) throw error;
            setDrafts(data || []);
        } catch (error) {
            console.error("Error loading drafts:", error);
            toast({
                title: "Error",
                description: "Failed to load drafts",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const deleteDraft = async (draftId: string) => {
        if (!confirm("Delete this draft?")) return;

        try {
            const { error } = await supabase
                .from("drafts")
                .delete()
                .eq("id", draftId);

            if (error) throw error;

            setDrafts(drafts.filter(d => d.id !== draftId));
            toast({
                title: "Draft deleted",
                description: "Draft has been removed",
            });
        } catch (error) {
            console.error("Error deleting draft:", error);
            toast({
                title: "Error",
                description: "Failed to delete draft",
                variant: "destructive",
            });
        }
    };

    const editDraft = (draft: Draft) => {
        // Navigate to create page with draft data
        navigate("/create", { state: { draft } });
    };

    if (!user) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-4">
                <div className="ascii-box p-8 text-center">
                    <div className="text-red-400 mb-4">Access Denied</div>
                    <Button onClick={() => navigate("/login")} className="ascii-box">
                        Login to View Drafts
                    </Button>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-4">
                <div className="ascii-box p-8 text-center">
                    <div className="ascii-highlight text-xl mb-2">Loading drafts...</div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background p-4">
            <div className="max-w-4xl mx-auto space-y-6">
                <div className="flex justify-between items-center">
                    <BackButton />
                    <h1 className="ascii-highlight text-2xl">My Drafts</h1>
                    <Button
                        onClick={() => navigate("/create")}
                        className="ascii-box bg-ascii-highlight text-black hover:bg-ascii-highlight/90"
                    >
                        New Post
                    </Button>
                </div>

                {drafts.length === 0 ? (
                    <div className="ascii-box p-12 text-center">
                        <div className="ascii-dim mb-4">No drafts yet</div>
                        <Button
                            onClick={() => navigate("/create")}
                            className="ascii-box"
                        >
                            Create Your First Post
                        </Button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {drafts.map((draft) => (
                            <div key={draft.id} className="ascii-box p-6 hover:border-ascii-highlight transition-colors">
                                <div className="flex justify-between items-start gap-4">
                                    <div className="flex-1">
                                        <h3 className="ascii-highlight text-lg mb-2">
                                            {draft.title || "Untitled Draft"}
                                        </h3>
                                        <p className="ascii-dim text-sm mb-3 line-clamp-2">
                                            {draft.content?.substring(0, 150)}...
                                        </p>
                                        <div className="flex items-center gap-4 text-xs ascii-dim">
                                            <span className="flex items-center gap-1">
                                                <Clock className="w-3 h-3" />
                                                {formatDistanceToNow(new Date(draft.auto_saved_at), { addSuffix: true })}
                                            </span>
                                            {draft.tags && draft.tags.length > 0 && (
                                                <span>{draft.tags.length} tags</span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button
                                            onClick={() => editDraft(draft)}
                                            variant="outline"
                                            size="sm"
                                            className="ascii-box"
                                        >
                                            <Edit className="w-4 h-4 mr-1" />
                                            Edit
                                        </Button>
                                        <Button
                                            onClick={() => deleteDraft(draft.id)}
                                            variant="outline"
                                            size="sm"
                                            className="ascii-box hover:text-red-400"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
