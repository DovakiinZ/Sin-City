import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import RichTextEditor from "@/components/editor/RichTextEditor";
import BackButton from "@/components/BackButton";
import ThreadCreator from "@/components/thread/ThreadCreator";
import { createThread } from "@/hooks/useSupabasePosts";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { X, Plus, Image, Film, Loader2, Link2 } from "lucide-react";

type PostMode = "single" | "thread";

export default function CreatePost() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const { toast } = useToast();
    const [searchParams] = useSearchParams();

    // Mode toggle - can be set from URL param (?mode=thread)
    const initialMode = searchParams.get("mode") === "thread" ? "thread" : "single";
    const [mode, setMode] = useState<PostMode>(initialMode);

    const [title, setTitle] = useState("");
    const [content, setContent] = useState("");
    const [saving, setSaving] = useState(false);
    const [slug, setSlug] = useState("");

    // Multi-media attachments state
    const [mediaFiles, setMediaFiles] = useState<{ url: string; type: 'image' | 'video'; file?: File }[]>([]);
    const [uploadingMedia, setUploadingMedia] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);



    // Auto-generate slug from title
    useEffect(() => {
        const generatedSlug = title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)+/g, "");
        setSlug(generatedSlug);
    }, [title]);



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
                const filePath = `post-media/${user?.id || 'anonymous'}/${fileName}`;

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
        // Title is now optional - if not provided, we'll auto-generate one
        if (!content.trim() && mediaFiles.length === 0) {
            toast({
                title: "Content required",
                description: "Please add some text or media to your post",
                variant: "destructive",
            });
            return;
        }

        setSaving(true);
        try {
            // Auto-generate title if not provided
            const postTitle = title.trim() || `Post from ${new Date().toLocaleDateString()}`;
            const generatedSlug = postTitle
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/(^-|-$)+/g, "");
            // Generate unique slug with timestamp to prevent conflicts
            const uniqueSlug = `${generatedSlug}-${Date.now().toString(36)}`;

            // Post data - works for both logged in and anonymous users
            const postData = {
                title: postTitle,
                content,
                type: mediaFiles.length > 0 ? 'Image' : 'Text',
                slug: uniqueSlug,
                user_id: user?.id || null, // Allow null for anonymous posts
                author_name: user?.username || user?.email || "Anonymous",
                author_email: user?.email || null,
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

    // Handle thread publish
    const handleThreadPublish = async (items: { id: string; title: string; content: string; attachments: { url: string; type: 'image' | 'video' }[] }[]) => {
        try {
            const threadPosts = items.map(item => ({
                title: item.title || `Thread post`,
                content: item.content,
                attachments: item.attachments.length > 0 ? item.attachments : undefined,
            }));

            const { threadId, posts } = await createThread(threadPosts, {
                user_id: user?.id,
                author_name: user?.username || user?.email || "Anonymous",
                author_email: user?.email,
            });

            toast({
                title: "Thread published!",
                description: `Created ${posts?.length || 0} connected posts`,
            });

            // Navigate to thread view
            navigate(`/thread/${threadId}`);
        } catch (error) {
            console.error("Error creating thread:", error);
            toast({
                title: "Error",
                description: "Failed to create thread",
                variant: "destructive",
            });
        }
    };

    return (
        <div className="min-h-screen bg-background p-4">
            <div className="max-w-4xl mx-auto space-y-6">
                <div className="flex flex-col gap-4 md:flex-row md:justify-between md:items-center">
                    <div className="flex justify-between items-center w-full md:w-auto">
                        <BackButton />

                        {/* Mobile Actions - Visible only on mobile in single mode */}
                        {mode === "single" && (
                            <div className="flex gap-2 md:hidden">
                                <Button
                                    onClick={() => handleSave(true)}
                                    disabled={saving}
                                    variant="outline"
                                    size="sm"
                                    className="ascii-box px-3 h-9 text-xs"
                                >
                                    Save
                                </Button>
                                <Button
                                    onClick={() => handleSave(false)}
                                    disabled={saving}
                                    size="sm"
                                    className="ascii-box bg-ascii-highlight text-black hover:bg-ascii-highlight/90 px-3 h-9 text-xs"
                                >
                                    Publish
                                </Button>
                            </div>
                        )}
                    </div>

                    {/* Mode Toggle & Desktop Actions */}
                    <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
                        <div className="ascii-box flex overflow-hidden w-full md:w-auto justify-center">
                            <button
                                onClick={() => setMode("single")}
                                className={`flex-1 md:flex-none px-4 py-2 text-sm transition-colors ${mode === "single"
                                    ? "bg-green-500/20 ascii-highlight"
                                    : "ascii-dim hover:ascii-highlight"
                                    }`}
                            >
                                Single Post
                            </button>
                            <button
                                onClick={() => setMode("thread")}
                                className={`flex-1 md:flex-none px-4 py-2 text-sm flex items-center justify-center gap-1 transition-colors border-l border-ascii-border ${mode === "thread"
                                    ? "bg-green-500/20 ascii-highlight"
                                    : "ascii-dim hover:ascii-highlight"
                                    }`}
                            >
                                <Link2 className="w-4 h-4" />
                                Thread
                            </button>
                        </div>

                        {mode === "single" && (
                            <div className="hidden md:flex gap-2">
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
                        )}
                    </div>
                </div>

                {/* Thread Mode */}
                {mode === "thread" ? (
                    <ThreadCreator
                        onPublish={handleThreadPublish}
                        onCancel={() => setMode("single")}
                    />
                ) : (
                    /* Single Post Mode */
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
                )}
            </div>
        </div>
    );
}
