import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import RichTextEditor from "@/components/editor/RichTextEditor";
import BackButton from "@/components/BackButton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { X } from "lucide-react";

export default function CreatePost() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const { toast } = useToast();
    const [title, setTitle] = useState("");
    const [content, setContent] = useState("");
    const [saving, setSaving] = useState(false);
    const [slug, setSlug] = useState("");
    const [categoryId, setCategoryId] = useState<string>("");
    const [tagInput, setTagInput] = useState("");
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [categories, setCategories] = useState<any[]>([]);
    const [availableTags, setAvailableTags] = useState<any[]>([]);

    // Load categories and tags
    useEffect(() => {
        const loadData = async () => {
            const { data: cats } = await supabase
                .from("categories")
                .select("*")
                .order("name");

            const { data: tags } = await supabase
                .from("tags")
                .select("*")
                .order("usage_count", { ascending: false })
                .limit(50);

            if (cats) setCategories(cats);
            if (tags) setAvailableTags(tags);
        };
        loadData();
    }, []);

    // Auto-generate slug from title
    useEffect(() => {
        const generatedSlug = title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)+/g, "");
        setSlug(generatedSlug);
    }, [title]);

    const addTag = (tagName: string) => {
        const trimmed = tagName.trim().toLowerCase();
        if (trimmed && !selectedTags.includes(trimmed)) {
            setSelectedTags([...selectedTags, trimmed]);
            setTagInput("");
        }
    };

    const removeTag = (tag: string) => {
        setSelectedTags(selectedTags.filter(t => t !== tag));
    };

    const handleSave = async (draft: boolean = true) => {
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
            // Simplified post data - only essential fields
            const postData = {
                title,
                content,
                type: 'Text',
                author_name: user?.displayName || "Admin",
                draft: draft,
            };

            console.log('Saving post:', postData);

            const { data: post, error } = await supabase
                .from("posts")
                .insert(postData)
                .select()
                .single();

            if (error) {
                console.error("Error saving post:", error);
                throw error;
            }

            // Add tags
            if (selectedTags.length > 0 && post) {
                for (const tagName of selectedTags) {
                    const slug = tagName.toLowerCase().replace(/[^a-z0-9]+/g, "-");

                    // Create or get tag
                    const { data: tag } = await supabase
                        .from("tags")
                        .upsert({ name: tagName, slug }, { onConflict: "slug" })
                        .select()
                        .single();

                    if (tag) {
                        // Link tag to post
                        await supabase
                            .from("post_tags")
                            .upsert({ post_id: post.id, tag_id: tag.id }, { onConflict: "post_id,tag_id" });
                    }
                }
            }

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

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block ascii-dim text-xs mb-2">CATEGORY</label>
                            <Select value={categoryId} onValueChange={setCategoryId}>
                                <SelectTrigger className="ascii-box border-ascii-border">
                                    <SelectValue placeholder="Select category..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {categories.map((cat) => (
                                        <SelectItem key={cat.id} value={cat.id}>
                                            {cat.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div>
                            <label className="block ascii-dim text-xs mb-2">TAGS</label>
                            <div className="flex gap-2">
                                <Input
                                    value={tagInput}
                                    onChange={(e) => setTagInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            e.preventDefault();
                                            addTag(tagInput);
                                        }
                                    }}
                                    placeholder="Add tags..."
                                    className="ascii-box bg-transparent border-ascii-border"
                                />
                                <Button
                                    type="button"
                                    onClick={() => addTag(tagInput)}
                                    variant="outline"
                                    className="ascii-box"
                                >
                                    Add
                                </Button>
                            </div>
                            {selectedTags.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-2">
                                    {selectedTags.map((tag) => (
                                        <span
                                            key={tag}
                                            className="ascii-box px-2 py-1 text-xs flex items-center gap-1"
                                        >
                                            #{tag}
                                            <button
                                                onClick={() => removeTag(tag)}
                                                className="hover:text-red-400"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div>
                        <label className="block ascii-dim text-xs mb-2">CONTENT</label>
                        <RichTextEditor
                            content={content}
                            onChange={setContent}
                            placeholder="Write your post content..."
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
