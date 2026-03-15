import { useState, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Image as ImageIcon, Eye, Edit } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface MarkdownEditorProps {
    initialValue?: string;
    onChange: (value: string) => void;
    onSave?: () => void;
    saving?: boolean;
}

export default function MarkdownEditor({
    initialValue = "",
    onChange,
    onSave,
    saving = false,
}: MarkdownEditorProps) {
    const [content, setContent] = useState(initialValue);
    const [uploading, setUploading] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        setContent(initialValue);
    }, [initialValue]);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newValue = e.target.value;
        setContent(newValue);
        onChange(newValue);
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;

        const file = e.target.files[0];
        const fileExt = file.name.split(".").pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `${fileName}`;

        setUploading(true);

        try {
            const { error: uploadError } = await supabase.storage
                .from("post-images")
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data } = supabase.storage.from("post-images").getPublicUrl(filePath);

            const imageMarkdown = `![${file.name}](${data.publicUrl})`;
            const newContent = content + "\n" + imageMarkdown;
            setContent(newContent);
            onChange(newContent);

            toast({
                title: "Image uploaded",
                description: "Image has been inserted into the editor",
            });
        } catch (error) {
            console.error("Error uploading image:", error);
            toast({
                title: "Upload failed",
                description: "Failed to upload image",
                variant: "destructive",
            });
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="w-full h-full flex flex-col gap-4">
            <div className="flex justify-between items-center">
                <div className="flex gap-2">
                    <div className="relative">
                        <input
                            type="file"
                            accept="image/*"
                            onChange={handleImageUpload}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            disabled={uploading}
                        />
                        <Button variant="outline" size="sm" disabled={uploading} className="ascii-box">
                            {uploading ? (
                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                            ) : (
                                <ImageIcon className="w-4 h-4 mr-2" />
                            )}
                            Add Image
                        </Button>
                    </div>
                </div>
                {onSave && (
                    <Button
                        onClick={onSave}
                        disabled={saving}
                        className="ascii-box bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                        {saving ? (
                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        ) : (
                            <Save className="w-4 h-4 mr-2" />
                        )}
                        Save Draft
                    </Button>
                )}
            </div>

            <Tabs defaultValue="write" className="w-full flex-1 flex flex-col">
                <TabsList className="grid w-full grid-cols-2 ascii-box p-1 bg-transparent">
                    <TabsTrigger value="write" className="data-[state=active]:bg-ascii-highlight data-[state=active]:text-black ascii-text">
                        <Edit className="w-4 h-4 mr-2" /> Write
                    </TabsTrigger>
                    <TabsTrigger value="preview" className="data-[state=active]:bg-ascii-highlight data-[state=active]:text-black ascii-text">
                        <Eye className="w-4 h-4 mr-2" /> Preview
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="write" className="flex-1 mt-4">
                    <Textarea
                        value={content}
                        onChange={handleChange}
                        placeholder="Write your post in Markdown..."
                        className="min-h-[500px] font-mono ascii-box bg-transparent focus-visible:ring-ascii-highlight"
                    />
                </TabsContent>

                <TabsContent value="preview" className="flex-1 mt-4">
                    <div className="ascii-box p-6 min-h-[500px] prose prose-invert max-w-none">
                        <ReactMarkdown>{content}</ReactMarkdown>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
