import { useState } from "react";
import { Plus, Trash2, GripVertical, Image, X, Loader2 } from "lucide-react";
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
        // Validate at least first item has content
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
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <pre className="ascii-highlight text-lg">CREATE THREAD</pre>
                    <span className="ascii-dim text-sm">({items.length} posts)</span>
                </div>
                <button
                    onClick={onCancel}
                    className="ascii-dim hover:ascii-highlight"
                >
                    [Cancel]
                </button>
            </div>

            {/* Thread Items */}
            <div className="space-y-4">
                {items.map((item, index) => (
                    <div key={item.id} className="ascii-box p-4 relative">
                        {/* Thread Position Badge */}
                        <div className="absolute -left-3 -top-3 bg-background ascii-box px-2 py-1 text-xs ascii-highlight">
                            {index + 1}/{items.length}
                        </div>

                        {/* Connection Line */}
                        {index < items.length - 1 && (
                            <div className="absolute left-1/2 -bottom-4 h-4 border-l-2 border-dashed border-ascii-border" />
                        )}

                        <div className="flex gap-3">
                            {/* Drag Handle (placeholder for future reordering) */}
                            <div className="ascii-dim pt-2">
                                <GripVertical className="w-4 h-4" />
                            </div>

                            <div className="flex-1 space-y-3">
                                {/* Title (optional) */}
                                <input
                                    type="text"
                                    value={item.title}
                                    onChange={(e) => updateItem(index, 'title', e.target.value)}
                                    placeholder={`Title (optional)${index === 0 ? ' - Thread title' : ''}`}
                                    className="w-full bg-transparent border border-ascii-border p-2 ascii-text text-sm focus:border-green-500 outline-none"
                                />

                                {/* Content */}
                                <textarea
                                    value={item.content}
                                    onChange={(e) => updateItem(index, 'content', e.target.value)}
                                    placeholder={`Post ${index + 1} content...`}
                                    className="w-full bg-transparent border border-ascii-border p-2 ascii-text text-sm focus:border-green-500 outline-none min-h-[100px] resize-y"
                                />

                                {/* Media Preview */}
                                {item.attachments.length > 0 && (
                                    <div className="flex flex-wrap gap-2">
                                        {item.attachments.map((media, mediaIndex) => (
                                            <div key={mediaIndex} className="relative group">
                                                {media.type === 'image' ? (
                                                    <img
                                                        src={media.url}
                                                        alt=""
                                                        className="w-20 h-20 object-cover rounded border border-ascii-border"
                                                    />
                                                ) : (
                                                    <video
                                                        src={media.url}
                                                        className="w-20 h-20 object-cover rounded border border-ascii-border"
                                                    />
                                                )}
                                                <button
                                                    onClick={() => removeMedia(index, mediaIndex)}
                                                    className="absolute -top-2 -right-2 bg-red-500 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                                >
                                                    <X className="w-3 h-3 text-white" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Actions */}
                                <div className="flex items-center gap-3">
                                    {/* Add Media */}
                                    <label className="ascii-nav-link hover:ascii-highlight cursor-pointer flex items-center gap-1 text-xs">
                                        {uploadingIndex === index ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Image className="w-4 h-4" />
                                        )}
                                        <span>Add media</span>
                                        <input
                                            type="file"
                                            accept="image/*,video/*"
                                            onChange={(e) => handleMediaUpload(index, e)}
                                            className="hidden"
                                            disabled={uploadingIndex !== null}
                                        />
                                    </label>

                                    {/* Remove Post */}
                                    {items.length > 1 && (
                                        <button
                                            onClick={() => removeItem(index)}
                                            className="ascii-dim hover:text-red-400 flex items-center gap-1 text-xs"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                            <span>Remove</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Add Post Button */}
            <button
                onClick={addItem}
                className="w-full ascii-box p-3 border-dashed hover:border-green-500 transition-colors flex items-center justify-center gap-2 ascii-dim hover:ascii-highlight"
            >
                <Plus className="w-4 h-4" />
                <span>Add to thread</span>
            </button>

            {/* Publish */}
            <div className="flex justify-end gap-3 pt-4 border-t border-ascii-border">
                <button
                    onClick={onCancel}
                    className="ascii-nav-link hover:ascii-highlight px-4 py-2"
                >
                    Cancel
                </button>
                <button
                    onClick={handlePublish}
                    disabled={!canPublish || publishing}
                    className="ascii-nav-link hover:ascii-highlight border border-green-700 px-4 py-2 disabled:opacity-50"
                >
                    {publishing ? (
                        <span className="flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Publishing...
                        </span>
                    ) : (
                        `Publish Thread (${items.length} posts)`
                    )}
                </button>
            </div>
        </div>
    );
}
