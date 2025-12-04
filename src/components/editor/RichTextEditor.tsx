import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import {
    Bold,
    Italic,
    List,
    ListOrdered,
    Code,
    Quote,
    Heading1,
    Heading2,
    Link as LinkIcon,
    Image as ImageIcon,
    Video,
    Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { useState, useRef } from "react";
import { useToast } from "@/hooks/use-toast";

interface RichTextEditorProps {
    content: string;
    onChange: (content: string) => void;
    placeholder?: string;
}

export default function RichTextEditor({
    content,
    onChange,
    placeholder = "Write your post content..."
}: RichTextEditorProps) {
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { toast } = useToast();

    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                heading: {
                    levels: [1, 2, 3],
                },
            }),
            Image.configure({
                HTMLAttributes: {
                    class: "max-w-full h-auto rounded",
                },
            }),
            Link.configure({
                openOnClick: false,
                HTMLAttributes: {
                    class: "text-ascii-highlight underline",
                },
            }),
            Placeholder.configure({
                placeholder,
            }),
        ],
        content,
        onUpdate: ({ editor }) => {
            onChange(editor.getHTML());
        },
        editorProps: {
            attributes: {
                class: "prose prose-invert max-w-none min-h-[300px] p-4 focus:outline-none",
            },
        },
    });

    if (!editor) {
        return null;
    }

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file size (10MB limit)
        const maxSize = 10 * 1024 * 1024; // 10MB
        if (file.size > maxSize) {
            toast({
                title: "File too large",
                description: "Maximum file size is 10MB",
                variant: "destructive",
            });
            return;
        }

        // Validate file type
        const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm', 'video/ogg'];
        if (!validTypes.includes(file.type)) {
            toast({
                title: "Invalid file type",
                description: "Please upload an image (JPEG, PNG, GIF, WebP) or video (MP4, WebM, OGG)",
                variant: "destructive",
            });
            return;
        }

        setUploading(true);

        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
            const filePath = fileName;

            const { error: uploadError } = await supabase.storage
                .from('post-images')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data } = supabase.storage
                .from('post-images')
                .getPublicUrl(filePath);

            // Insert image or video based on file type
            if (file.type.startsWith('image/')) {
                editor.chain().focus().setImage({ src: data.publicUrl }).run();
            } else if (file.type.startsWith('video/')) {
                // Insert video as HTML
                const videoHtml = `<video controls class="max-w-full h-auto rounded"><source src="${data.publicUrl}" type="${file.type}"></video>`;
                editor.chain().focus().insertContent(videoHtml).run();
            }

            toast({
                title: "Upload successful",
                description: `${file.type.startsWith('image/') ? 'Image' : 'Video'} has been added to your post`,
            });

            // Reset file input
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        } catch (error) {
            console.error("Error uploading file:", error);
            toast({
                title: "Upload failed",
                description: error instanceof Error ? error.message : "Failed to upload file",
                variant: "destructive",
            });
        } finally {
            setUploading(false);
        }
    };

    const addImage = () => {
        fileInputRef.current?.click();
    };

    const addLink = () => {
        const url = window.prompt("Enter URL:");
        if (url) {
            editor.chain().focus().setLink({ href: url }).run();
        }
    };

    return (
        <div className="ascii-box">
            {/* Hidden file input */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                onChange={handleFileUpload}
                className="hidden"
                disabled={uploading}
            />

            {/* Toolbar */}
            <div className="border-b border-ascii-border p-2 flex flex-wrap gap-1">
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => editor.chain().focus().toggleBold().run()}
                    className={editor.isActive("bold") ? "bg-ascii-highlight/20" : ""}
                >
                    <Bold className="w-4 h-4" />
                </Button>

                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                    className={editor.isActive("italic") ? "bg-ascii-highlight/20" : ""}
                >
                    <Italic className="w-4 h-4" />
                </Button>

                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                    className={editor.isActive("heading", { level: 1 }) ? "bg-ascii-highlight/20" : ""}
                >
                    <Heading1 className="w-4 h-4" />
                </Button>

                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                    className={editor.isActive("heading", { level: 2 }) ? "bg-ascii-highlight/20" : ""}
                >
                    <Heading2 className="w-4 h-4" />
                </Button>

                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => editor.chain().focus().toggleBulletList().run()}
                    className={editor.isActive("bulletList") ? "bg-ascii-highlight/20" : ""}
                >
                    <List className="w-4 h-4" />
                </Button>

                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => editor.chain().focus().toggleOrderedList().run()}
                    className={editor.isActive("orderedList") ? "bg-ascii-highlight/20" : ""}
                >
                    <ListOrdered className="w-4 h-4" />
                </Button>

                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => editor.chain().focus().toggleCodeBlock().run()}
                    className={editor.isActive("codeBlock") ? "bg-ascii-highlight/20" : ""}
                >
                    <Code className="w-4 h-4" />
                </Button>

                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => editor.chain().focus().toggleBlockquote().run()}
                    className={editor.isActive("blockquote") ? "bg-ascii-highlight/20" : ""}
                >
                    <Quote className="w-4 h-4" />
                </Button>

                <div className="w-px h-6 bg-ascii-border mx-1" />

                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={addLink}
                >
                    <LinkIcon className="w-4 h-4" />
                </Button>

                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={addImage}
                    disabled={uploading}
                    title="Upload image or video"
                >
                    {uploading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <ImageIcon className="w-4 h-4" />
                    )}
                </Button>
            </div>

            {/* Editor */}
            <EditorContent editor={editor} />
        </div>
    );
}
