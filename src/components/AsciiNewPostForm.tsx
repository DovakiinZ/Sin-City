import { useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { X, Plus, Image, Film, Loader2 } from "lucide-react";

export type NewPost = {
  title: string;
  date?: string;
  content: string;
  attachments?: { url: string; type: 'image' | 'video' }[];
};

export default function AsciiNewPostForm({ onAdd, onClose }: { onAdd: (p: NewPost) => void; onClose?: () => void }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const { user } = useAuth();
  const { toast } = useToast();

  // Media attachments state
  const [mediaFiles, setMediaFiles] = useState<{ url: string; type: 'image' | 'video' }[]>([]);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const today = new Date().toISOString().slice(0, 10);

  // Handle media file upload
  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Limit to 4 media files
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    onAdd({
      title: title.trim(),
      date: today,
      content,
      attachments: mediaFiles.length > 0 ? mediaFiles : undefined,
    });
    setTitle("");
    setContent("");
    setMediaFiles([]);
    onClose?.();
  }

  return (
    <form onSubmit={handleSubmit} className="font-mono border border-green-600 p-3 bg-black/70 space-y-3">
      <div className="ascii-highlight">+-- New Post --+</div>
      <label className="block">
        <div className="ascii-dim text-xs mb-1">Title</div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full bg-black text-green-400 border border-green-700 px-2 py-1 outline-none"
          placeholder="Post title"
        />
      </label>
      <label className="block">
        <div className="ascii-dim text-xs mb-1">Content (Markdown)</div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="w-full h-32 bg-black text-green-400 border border-green-700 px-2 py-1 outline-none resize-none"
          placeholder="Write your post in Markdown..."
        />
      </label>

      {/* Media Upload Section */}
      <div>
        <div className="ascii-dim text-xs mb-2">Media Attachments (up to 4)</div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          onChange={handleMediaUpload}
          className="hidden"
        />

        {/* Media Preview Grid */}
        {mediaFiles.length > 0 && (
          <div className={`grid gap-2 mb-2 ${mediaFiles.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
            }`}>
            {mediaFiles.map((media, index) => (
              <div key={index} className="relative aspect-video border border-green-700 overflow-hidden bg-black">
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
                  type="button"
                  onClick={() => removeMedia(index)}
                  className="absolute top-1 right-1 bg-black/70 p-1 rounded hover:bg-red-600 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
                <div className="absolute bottom-1 left-1 bg-black/70 px-1 py-0.5 text-[10px] flex items-center gap-1">
                  {media.type === 'image' ? <Image className="w-2 h-2" /> : <Film className="w-2 h-2" />}
                  {media.type}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add Media Button */}
        {mediaFiles.length < 4 && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingMedia}
            className="flex items-center gap-2 text-xs ascii-dim hover:ascii-highlight border border-green-700 px-2 py-1 disabled:opacity-50"
          >
            {uploadingMedia ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Plus className="w-3 h-3" />
                Add Photo/Video
              </>
            )}
          </button>
        )}
      </div>

      <div className="flex gap-2">
        <button type="submit" className="ascii-nav-link hover:ascii-highlight px-3 py-1 border border-green-700">
          Add Post
        </button>
        {onClose && (
          <button type="button" onClick={onClose} className="px-3 py-1 border border-green-700 ascii-dim">
            Cancel
          </button>
        )}
      </div>
      <div className="ascii-dim text-xs">Date: {today}</div>
    </form>
  );
}
