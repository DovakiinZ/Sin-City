import { useState } from "react";
import { Plus, Trash2, Image, X, Loader2, Music, Smile, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface ThreadItem {
    id: string;
    title: string;
    content: string;
    attachments: { url: string; type: 'image' | 'video' }[];
}

interface ThreadCreatorProps {
    onPublish: (items: ThreadItem[]) => Promise<void>;
    onCancel: () => void;
}

export default function ThreadCreator({ onPublish, onCancel }: ThreadCreatorProps) {
    const [items, setItems] = useState<ThreadItem[]>([
        { id: crypto.randomUUID(), title: "", content: "", attachments: [] }
    ]);
    const [publishing, setPublishing] = useState(false);
    const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
    const [expandedMedia, setExpandedMedia] = useState<Set<number>>(new Set());

    const addItem = () => {
        setItems([...items, {
            id: crypto.randomUUID(),
            title: "",
            content: "",
            attachments: []
        }]);
    };

    const removeItem = (index: number) => {
        if (items.length <= 1) return;
        setItems(items.filter((_, i) => i !== index));
    };

    const updateItem = (index: number, field: keyof ThreadItem, value: string) => {
        setItems(items.map((item, i) =>
            i === index ? { ...item, [field]: value } : item
        ));
    };

    const toggleMediaExpanded = (index: number) => {
        setExpandedMedia(prev => {
            const next = new Set(prev);
            if (next.has(index)) next.delete(index);
            else next.add(index);
            return next;
        });
    };

    const handleMediaUpload = async (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const maxSize = 10 * 1024 * 1024; // 10MB
        if (file.size > maxSize) {
            alert("File too large. Max size is 10MB.");
            return;
        }

        setUploadingIndex(index);

        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${crypto.randomUUID()}.${fileExt}`;
            const filePath = `thread-media/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('media')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('media')
                .getPublicUrl(filePath);

            const mediaType = file.type.startsWith('video/') ? 'video' : 'image';

            setItems(items.map((item, i) =>
                i === index
                    ? { ...item, attachments: [...item.attachments, { url: publicUrl, type: mediaType }] }
                    : item
            ));

            // Auto-expand media section when media is added
            setExpandedMedia(prev => new Set(prev).add(index));
        } catch (error) {
            console.error("Upload error:", error);
            alert("Failed to upload file");
        } finally {
            setUploadingIndex(null);
        }
    };

    const removeMedia = (itemIndex: number, mediaIndex: number) => {
        setItems(items.map((item, i) =>
            i === itemIndex
                ? { ...item, attachments: item.attachments.filter((_, mi) => mi !== mediaIndex) }
                : item
        ));
    };

    const handlePublish = async () => {
        if (!items[0].content.trim()) {
            alert("First post must have content");
            return;
        }

        setPublishing(true);
        try {
            await onPublish(items);
        } finally {
            setPublishing(false);
        }
    };

    const canPublish = items.some(item => item.content.trim());

    return (
        <div className="space-y-4">
            {/* Thread Posts */}
            <div className="space-y-3">
                {items.map((item, index) => (
                    <div key={item.id} className="bg-gray-900/30 border border-green-900/30 rounded-lg overflow-hidden">
                        {/* Post Header */}
                        <div className="flex items-center justify-between px-4 py-2 bg-gray-900/50 border-b border-green-900/20">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-mono text-green-400 bg-green-500/10 px-2 py-0.5 rounded">
                                    {index + 1}/{items.length}
                                </span>
                                {index === 0 && (
                                    <span className="text-xs text-gray-500">First post</span>
                                )}
                            </div>
                            {items.length > 1 && (
                                <button
                                    onClick={() => removeItem(index)}
                                    className="p-1 text-gray-500 hover:text-red-400 transition-colors"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            )}
                        </div>

                        {/* Post Content */}
                        <div className="p-4 space-y-3">
                            {/* Title */}
                            <input
                                type="text"
                                value={item.title}
                                onChange={(e) => updateItem(index, 'title', e.target.value)}
                                placeholder={index === 0 ? "Thread title (optional)" : "Post title (optional)"}
                                className="w-full bg-transparent text-sm text-gray-100 placeholder-gray-600 border-b border-green-900/30 pb-2 focus:outline-none focus:border-green-500/50 transition-colors"
                            />

                            {/* Content */}
                            <textarea
                                value={item.content}
                                onChange={(e) => updateItem(index, 'content', e.target.value)}
                                placeholder={`Write post ${index + 1}...`}
                                className="w-full bg-transparent text-sm text-gray-200 placeholder-gray-600 focus:outline-none min-h-[100px] resize-y"
                            />

                            {/* Media Section - Collapsible */}
                            <div className="border border-green-900/20 rounded-lg overflow-hidden">
                                <button
                                    onClick={() => toggleMediaExpanded(index)}
                                    className="w-full flex items-center justify-between px-3 py-2 bg-gray-900/30 hover:bg-gray-900/50 transition-colors"
                                >
                                    <span className="text-xs text-gray-500">
                                        Media {item.attachments.length > 0 && `(${item.attachments.length})`}
                                    </span>
                                    {expandedMedia.has(index) ? (
                                        <ChevronUp className="w-3 h-3 text-gray-500" />
                                    ) : (
                                        <ChevronDown className="w-3 h-3 text-gray-500" />
                                    )}
                                </button>

                                {expandedMedia.has(index) && (
                                    <div className="p-3 space-y-2 bg-black/20">
                                        {/* Media Previews */}
                                        {item.attachments.length > 0 && (
                                            <div className="grid grid-cols-3 gap-2">
                                                {item.attachments.map((media, mediaIndex) => (
                                                    <div key={mediaIndex} className="relative aspect-square bg-gray-900 rounded overflow-hidden">
                                                        {media.type === 'image' ? (
                                                            <img src={media.url} alt="" className="w-full h-full object-cover" />
                                                        ) : (
                                                            <video src={media.url} className="w-full h-full object-cover" />
                                                        )}
                                                        <button
                                                            onClick={() => removeMedia(index, mediaIndex)}
                                                            className="absolute top-1 right-1 w-5 h-5 bg-black/80 rounded-full flex items-center justify-center hover:bg-red-500 transition-colors"
                                                        >
                                                            <X className="w-2.5 h-2.5" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* Add Media Button */}
                                        <label className="flex items-center justify-center gap-2 py-2 px-3 bg-gray-900/50 border border-green-900/30 rounded text-xs text-gray-400 hover:text-green-400 hover:border-green-500/50 transition-colors cursor-pointer">
                                            {uploadingIndex === index ? (
                                                <Loader2 className="w-3 h-3 animate-spin" />
                                            ) : (
                                                <Plus className="w-3 h-3" />
                                            )}
                                            <span>Add Photo/Video</span>
                                            <input
                                                type="file"
                                                accept="image/*,video/*"
                                                onChange={(e) => handleMediaUpload(index, e)}
                                                className="hidden"
                                                disabled={uploadingIndex !== null}
                                            />
                                        </label>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Connection Line */}
                        {index < items.length - 1 && (
                            <div className="h-4 flex justify-center">
                                <div className="w-px h-full bg-green-900/50" />
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Add Post Button */}
            <button
                onClick={addItem}
                className="w-full py-3 border border-dashed border-green-900/50 rounded-lg text-sm text-gray-500 hover:text-green-400 hover:border-green-500/50 transition-colors flex items-center justify-center gap-2"
            >
                <Plus className="w-4 h-4" />
                Add to thread
            </button>

            {/* Bottom Actions - Sticky on mobile */}
            <div className="fixed bottom-0 left-0 right-0 md:relative md:bottom-auto bg-black/95 backdrop-blur md:bg-transparent border-t border-green-900/30 md:border-t-0 px-4 py-3 md:px-0 md:pt-4 safe-area-bottom">
                <div className="flex gap-3 max-w-4xl mx-auto">
                    <button
                        onClick={onCancel}
                        className="flex-1 py-3 bg-gray-900 border border-green-900/30 rounded-lg text-gray-400 font-medium text-sm hover:text-gray-300 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handlePublish}
                        disabled={!canPublish || publishing}
                        className="flex-1 py-3 bg-green-500 rounded-lg text-black font-medium text-sm hover:bg-green-400 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {publishing ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Publishing...
                            </>
                        ) : (
                            `Publish (${items.length} posts)`
                        )}
                    </button>
                </div>
            </div>

            {/* Spacer for fixed bottom bar on mobile */}
            <div className="h-20 md:h-0" />
        </div>
    );
}
