import { useState, useEffect, useRef } from "react";
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
import { X, Plus, Image, Film, Loader2 } from "lucide-react";

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

    // Multi-media attachments state
    const [mediaFiles, setMediaFiles] = useState<{ url: string; type: 'image' | 'video'; file?: File }[]>([]);
    const [uploadingMedia, setUploadingMedia] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

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

    // Handle media file upload
    const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        // Limit to 4 media files like Twitter
        if (mediaFiles.length + files.length > 4) {
            toast({
                title: "Too many files",
                description: "You can only attach up to 4 media files",
                variant: "destructive",
            });
            return;
        }

        setUploadingMedia(true);
        try {
            for (const file of Array.from(files)) {
                // Validate file type
                const isImage = file.type.startsWith('image/');
                const isVideo = file.type.startsWith('video/');

                if (!isImage && !isVideo) {
                    toast({
                        title: "Invalid file type",
                        description: "Only images and videos are allowed",
                        variant: "destructive",
                    });
                    continue;
                }

                // Upload to Supabase Storage
                const fileExt = file.name.split('.').pop();
                const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
                const filePath = `post-media/${user?.id}/${fileName}`;

                const { error: uploadError } = await supabase.storage
                    .from('media')
                    .upload(filePath, file);

                if (uploadError) {
                    console.error("Upload error:", uploadError);
                    toast({
                        title: "Upload failed",
                        description: uploadError.message,
                        variant: "destructive",
                    });
                    continue;
                }

                // Get public URL
                const { data: { publicUrl } } = supabase.storage
                    .from('media')
                    .getPublicUrl(filePath);

                setMediaFiles(prev => [...prev, {
                    url: publicUrl,
                    type: isImage ? 'image' : 'video',
                    file
                }]);
            }
        } catch (error) {
            console.error("Error uploading media:", error);
            toast({
                title: "Upload error",
                description: "Failed to upload media",
                variant: "destructive",
            });
        } finally {
            setUploadingMedia(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const removeMedia = (index: number) => {
        setMediaFiles(prev => prev.filter((_, i) => i !== index));
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
            // Generate unique slug with timestamp to prevent conflicts
            const uniqueSlug = `${slug}-${Date.now().toString(36)}`;

            // Simplified post data - only essential fields
            const postData = {
                title,
                content,
                type: mediaFiles.length > 0 ? 'Image' : 'Text',
                slug: uniqueSlug,
                user_id: user?.id, // Required for RLS policies
                author_name: user?.displayName || user?.email || "Admin",
                author_email: user?.email,
                author_avatar: user?.avatarDataUrl || null,
                draft: draft,
                attachments: mediaFiles.length > 0 ? mediaFiles.map(m => ({ url: m.url, type: m.type })) : null,
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

            if (!draft && post) {
                navigate(`/post/${post.slug}`);
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

                    {/* Media Upload Section */}
                    <div>
                        <label className="block ascii-dim text-xs mb-2">MEDIA ATTACHMENTS (up to 4)</label>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*,video/*"
                            multiple
                            onChange={handleMediaUpload}
                            className="hidden"
                        />

                        {/* Media Preview Grid */}
                        <div className={`grid gap-2 mb-3 ${mediaFiles.length === 1 ? 'grid-cols-1' :
                            mediaFiles.length === 2 ? 'grid-cols-2' :
                                mediaFiles.length >= 3 ? 'grid-cols-2' : ''
                            }`}>
                            {mediaFiles.map((media, index) => (
                                <div key={index} className="relative aspect-video ascii-box overflow-hidden bg-black">
                                    {media.type === 'image' ? (
                                        <img
                                            src={media.url}
                                            alt={`Attachment ${index + 1}`}
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <video
                                            src={media.url}
                                            className="w-full h-full object-cover"
                                            controls
                                        />
                                    )}
                                    <button
                                        onClick={() => removeMedia(index)}
                                        className="absolute top-2 right-2 bg-black/70 p-1 rounded hover:bg-red-600 transition-colors"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                    <div className="absolute bottom-2 left-2 bg-black/70 px-2 py-1 text-xs flex items-center gap-1">
                                        {media.type === 'image' ? <Image className="w-3 h-3" /> : <Film className="w-3 h-3" />}
                                        {media.type}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Add Media Button */}
                        {mediaFiles.length < 4 && (
                            <Button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploadingMedia}
                                variant="outline"
                                className="ascii-box flex items-center gap-2"
                            >
                                {uploadingMedia ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Uploading...
                                    </>
                                ) : (
                                    <>
                                        <Plus className="w-4 h-4" />
                                        Add Photo/Video
                                    </>
                                )}
                            </Button>
                        )}
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
