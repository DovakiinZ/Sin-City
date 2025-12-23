import { useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { X, Plus, Image, Film, Loader2, Music, Smile, ChevronDown, ChevronUp, Send } from "lucide-react";
import MusicEmbed from "./MusicEmbed";
import GifPicker from "./GifPicker";

export type NewPost = {
  title: string;
  date?: string;
  content: string;
  attachments?: { url: string; type: 'image' | 'video' | 'music' }[];
  gif_url?: string;
};

export default function AsciiNewPostForm({ onAdd, onClose }: { onAdd: (p: NewPost) => void; onClose?: () => void }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const { user } = useAuth();
  const { toast } = useToast();

  // Media state
  const [mediaFiles, setMediaFiles] = useState<{ url: string; type: 'image' | 'video' | 'music' }[]>([]);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [showMusicInput, setShowMusicInput] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [selectedGif, setSelectedGif] = useState<string | null>(null);
  const [mediaExpanded, setMediaExpanded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addMusic = (url: string) => {
    setMediaFiles(prev => [...prev, { url, type: 'music' }]);
    setShowMusicInput(false);
    setMediaExpanded(true);
  };

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (mediaFiles.length + files.length > 4) {
      toast({ title: "Limit reached", description: "Max 4 files", variant: "destructive" });
      return;
    }

    setUploadingMedia(true);
    try {
      for (const file of Array.from(files)) {
        const isImage = file.type.startsWith('image/');
        const isVideo = file.type.startsWith('video/');

        if (!isImage && !isVideo) {
          toast({ title: "Invalid type", description: "Images/videos only", variant: "destructive" });
          continue;
        }

        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
        const filePath = `post-media/${user?.id || 'anonymous'}/${fileName}`;

        const { error: uploadError } = await supabase.storage.from('media').upload(filePath, file);

        if (uploadError) {
          toast({ title: "Upload failed", description: uploadError.message, variant: "destructive" });
          continue;
        }

        const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(filePath);
        setMediaFiles(prev => [...prev, { url: publicUrl, type: isImage ? 'image' : 'video' }]);
        setMediaExpanded(true);
      }
    } catch (error) {
      toast({ title: "Error", description: "Upload failed", variant: "destructive" });
    } finally {
      setUploadingMedia(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeMedia = (index: number) => {
    setMediaFiles(prev => prev.filter((_, i) => i !== index));
  };

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim() && mediaFiles.length === 0 && !selectedGif) return;

    onAdd({
      title: title.trim(),
      date: new Date().toISOString().slice(0, 10),
      content,
      attachments: mediaFiles.length > 0 ? mediaFiles : undefined,
      gif_url: selectedGif || undefined,
    });
    setTitle("");
    setContent("");
    setMediaFiles([]);
    setSelectedGif(null);
    onClose?.();
  }

  const mediaCount = mediaFiles.length + (selectedGif ? 1 : 0);

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Title Input */}
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full bg-transparent text-base text-gray-100 placeholder-gray-600 border-b border-green-900/40 pb-2 focus:outline-none focus:border-green-500/50 transition-colors"
          placeholder="Post title (optional)"
        />

        {/* Content Textarea */}
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="w-full min-h-[120px] bg-transparent text-sm text-gray-200 placeholder-gray-600 focus:outline-none resize-none"
          placeholder="What's on your mind?"
        />

        {/* Media Section - Collapsible */}
        <div className="border border-green-900/30 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setMediaExpanded(!mediaExpanded)}
            className="w-full flex items-center justify-between px-3 py-2 bg-gray-900/30 hover:bg-gray-900/50 transition-colors"
          >
            <span className="text-xs text-gray-500">
              Media & GIFs {mediaCount > 0 && `(${mediaCount})`}
            </span>
            {mediaExpanded ? (
              <ChevronUp className="w-4 h-4 text-gray-500" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-500" />
            )}
          </button>

          {mediaExpanded && (
            <div className="p-3 space-y-3 bg-black/20">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                multiple
                onChange={handleMediaUpload}
                className="hidden"
              />

              {/* Media Previews Grid */}
              {(mediaFiles.length > 0 || selectedGif) && (
                <div className="grid grid-cols-3 gap-2">
                  {mediaFiles.map((media, index) => (
                    <div key={index} className="relative aspect-square bg-gray-900 rounded overflow-hidden">
                      {media.type === 'image' ? (
                        <img src={media.url} alt="" className="w-full h-full object-cover" />
                      ) : media.type === 'video' ? (
                        <video src={media.url} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Music className="w-6 h-6 text-green-500" />
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => removeMedia(index)}
                        className="absolute top-1 right-1 w-5 h-5 bg-black/80 rounded-full flex items-center justify-center hover:bg-red-500 transition-colors"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                      <div className="absolute bottom-1 left-1 px-1 py-0.5 bg-black/80 rounded text-[10px] text-gray-400">
                        {media.type}
                      </div>
                    </div>
                  ))}
                  {selectedGif && (
                    <div className="relative aspect-square bg-gray-900 rounded overflow-hidden">
                      <img src={selectedGif} alt="GIF" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setSelectedGif(null)}
                        className="absolute top-1 right-1 w-5 h-5 bg-black/80 rounded-full flex items-center justify-center hover:bg-red-500 transition-colors"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                      <div className="absolute bottom-1 left-1 px-1 py-0.5 bg-black/80 rounded text-[10px] text-gray-400">
                        gif
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Music Input */}
              {showMusicInput && (
                <div className="flex gap-2">
                  <input
                    type="url"
                    placeholder="Paste Spotify or YouTube URL"
                    className="flex-1 bg-gray-900/50 border border-green-900/30 rounded px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-green-500/50"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (e.currentTarget.value) addMusic(e.currentTarget.value);
                      }
                    }}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowMusicInput(false)}
                    className="p-2 text-gray-500 hover:text-red-400"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Add Media Buttons */}
              {!showMusicInput && (
                <div className="flex flex-wrap gap-2">
                  {mediaFiles.length < 4 && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingMedia}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900/50 border border-green-900/30 rounded text-xs text-gray-400 hover:text-green-400 hover:border-green-500/50 transition-colors disabled:opacity-50"
                    >
                      {uploadingMedia ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Plus className="w-3 h-3" />
                      )}
                      Photo/Video
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowMusicInput(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900/50 border border-green-900/30 rounded text-xs text-gray-400 hover:text-green-400 hover:border-green-500/50 transition-colors"
                  >
                    <Music className="w-3 h-3" />
                    Music
                  </button>
                  {!selectedGif && (
                    <button
                      type="button"
                      onClick={() => setShowGifPicker(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900/50 border border-green-900/30 rounded text-xs text-gray-400 hover:text-green-400 hover:border-green-500/50 transition-colors"
                    >
                      <Smile className="w-3 h-3" />
                      GIF
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2">
            {/* Quick access buttons when media is collapsed */}
            {!mediaExpanded && (
              <>
                <button
                  type="button"
                  onClick={() => { setMediaExpanded(true); fileInputRef.current?.click(); }}
                  disabled={uploadingMedia}
                  className="p-2 text-gray-500 hover:text-green-400 transition-colors disabled:opacity-50"
                  title="Add Photo/Video"
                >
                  <Image className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => { setMediaExpanded(true); setShowGifPicker(true); }}
                  className="p-2 text-gray-500 hover:text-green-400 transition-colors"
                  title="Add GIF"
                >
                  <Smile className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => { setMediaExpanded(true); setShowMusicInput(true); }}
                  className="p-2 text-gray-500 hover:text-green-400 transition-colors"
                  title="Add Music"
                >
                  <Music className="w-4 h-4" />
                </button>
              </>
            )}
          </div>

          <div className="flex gap-2">
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-300 transition-colors"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={uploadingMedia || (!content.trim() && mediaFiles.length === 0 && !selectedGif)}
              className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-400 text-black font-medium text-sm rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" />
              Post
            </button>
          </div>
        </div>
      </form>

      {/* GIF Picker Modal */}
      {showGifPicker && (
        <GifPicker
          onSelect={(url) => {
            setSelectedGif(url);
            setShowGifPicker(false);
            setMediaExpanded(true);
          }}
          onClose={() => setShowGifPicker(false)}
        />
      )}
    </>
  );
}
