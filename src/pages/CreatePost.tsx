import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import MarkdownEditor from "@/components/editor/MarkdownEditor";
import BackButton from "@/components/BackButton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export default function CreatePost() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const { toast } = useToast();
    const [title, setTitle] = useState("");
    const [content, setContent] = useState("");
    const [saving, setSaving] = useState(false);
    const [slug, setSlug] = useState("");

    // Auto-generate slug from title
    useEffect(() => {
        const generatedSlug = title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)+/g, "");
        setSlug(generatedSlug);
    }, [title]);

    const handleSave = async (draft: boolean = true) => {
        if (!user) return;
        if (!title.trim()) {
            toast({
                title: "Title required",
                description: "Please enter a post title",
                variant: "destructive",
            });
            return;
        }

        setSaving(true);
        try {
            const postData = {
                title,
                content,
                slug,
                user_id: user.id,
                author_name: user.displayName || "Anonymous",
                draft,
                updated_at: new Date().toISOString(),
            };

            const { error } = await supabase
                .from("posts")
                .upsert(postData, { onConflict: "slug" });

            if (error) throw error;

            toast({
                title: draft ? "Draft saved" : "Post published",
                description: draft ? "Your draft has been saved" : "Your post is now live!",
            });

            if (!draft) {
                navigate(`/post/${slug}`);
            }
        } catch (error) {
            console.error("Error saving post:", error);
            toast({
                title: "Error",
                description: "Failed to save post",
                variant: "destructive",
            });
        } finally {
            setSaving(false);
        }
    };

    if (!user) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-4">
                <div className="ascii-box p-8 text-center">
                    <div className="text-red-400 mb-4">Access Denied</div>
                    <Button onClick={() => navigate("/login")} className="ascii-box">
                        Login to Create
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background p-4">
            <div className="max-w-4xl mx-auto space-y-6">
                <div className="flex justify-between items-center">
                    <BackButton />
                    <div className="flex gap-2">
                        <Button
                            onClick={() => handleSave(true)}
                            disabled={saving}
                            variant="outline"
                            className="ascii-box"
                        >
                            Save Draft
                        </Button>
                        <Button
                            onClick={() => handleSave(false)}
                            disabled={saving}
                            className="ascii-box bg-ascii-highlight text-black hover:bg-ascii-highlight/90"
                        >
                            Publish
                        </Button>
                    </div>
                </div>

                <div className="ascii-box p-6 space-y-6">
                    <div>
                        <label className="block ascii-dim text-xs mb-2">TITLE</label>
                        <Input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Enter post title..."
                            className="ascii-box bg-transparent text-xl font-bold border-ascii-border focus-visible:ring-ascii-highlight"
                        />
                    </div>

                    <div>
                        <label className="block ascii-dim text-xs mb-2">SLUG</label>
                        <div className="ascii-text text-sm opacity-70">/post/{slug}</div>
                    </div>

                    <div>
                        <label className="block ascii-dim text-xs mb-2">CONTENT</label>
                        <MarkdownEditor
                            initialValue={content}
                            onChange={setContent}
                            onSave={() => handleSave(true)}
                            saving={saving}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
