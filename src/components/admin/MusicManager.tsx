import { useState } from "react";
import { useMusicLinks, validateMusicUrl } from "@/hooks/useMusicLinks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Music, Trash2, ExternalLink, Plus, Edit2, Check, X } from "lucide-react";

export default function MusicManager() {
    const { musicLinks, loading, addMusicLink, updateMusicLink, deleteMusicLink } = useMusicLinks();
    const [newUrl, setNewUrl] = useState("");
    const [newTitle, setNewTitle] = useState("");
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editTitle, setEditTitle] = useState("");
    const [editUrl, setEditUrl] = useState("");

    const handleAdd = async () => {
        if (!newUrl.trim() || !newTitle.trim()) {
            return;
        }

        const validation = validateMusicUrl(newUrl);
        if (!validation.valid) {
            alert(validation.error);
            return;
        }

        const success = await addMusicLink(validation.platform!, newUrl, newTitle);
        if (success) {
            setNewUrl("");
            setNewTitle("");
        }
    };

    const handleDelete = async (id: string, title: string) => {
        if (confirm(`Are you sure you want to delete "${title}"?`)) {
            await deleteMusicLink(id);
        }
    };

    const startEdit = (id: string, title: string, url: string) => {
        setEditingId(id);
        setEditTitle(title);
        setEditUrl(url);
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditTitle("");
        setEditUrl("");
    };

    const saveEdit = async (id: string) => {
        if (!editUrl.trim() || !editTitle.trim()) return;

        const validation = validateMusicUrl(editUrl);
        if (!validation.valid) {
            alert(validation.error);
            return;
        }

        const success = await updateMusicLink(id, {
            url: editUrl,
            title: editTitle,
            platform: validation.platform,
        });

        if (success) {
            cancelEdit();
        }
    };

    if (loading) {
        return (
            <div className="ascii-box p-8 text-center">
                <div className="ascii-dim">Loading music library...</div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="ascii-box p-4">
                <div className="flex items-center gap-3 mb-2">
                    <Music className="w-5 h-5 ascii-highlight" />
                    <h2 className="ascii-highlight text-lg">MUSIC MANAGER</h2>
                </div>
                <p className="ascii-dim text-sm">
                    Manage songs for the "Hear This" button. All users will see these songs.
                </p>
            </div>

            {/* Add New Song Form */}
            <div className="ascii-box p-4">
                <h3 className="ascii-highlight text-sm mb-3">ADD NEW SONG</h3>
                <div className="space-y-3">
                    <div>
                        <label className="ascii-dim text-xs block mb-1">Song URL (Spotify or YouTube Music)</label>
                        <Input
                            type="url"
                            value={newUrl}
                            onChange={(e) => setNewUrl(e.target.value)}
                            placeholder="https://open.spotify.com/track/... or https://music.youtube.com/watch?v=..."
                            className="bg-black/30 border-ascii-border ascii-text"
                        />
                    </div>
                    <div>
                        <label className="ascii-dim text-xs block mb-1">Song Title</label>
                        <Input
                            type="text"
                            value={newTitle}
                            onChange={(e) => setNewTitle(e.target.value)}
                            placeholder="Song Name - Artist"
                            className="bg-black/30 border-ascii-border ascii-text"
                        />
                    </div>
                    <Button
                        onClick={handleAdd}
                        className="w-full bg-ascii-highlight text-black hover:bg-ascii-highlight/80"
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        Add Song
                    </Button>
                </div>
            </div>

            {/* Songs List */}
            <div className="ascii-box p-4">
                <h3 className="ascii-highlight text-sm mb-3">
                    CURRENT SONGS ({musicLinks.length})
                </h3>

                {musicLinks.length === 0 ? (
                    <div className="text-center py-8 ascii-dim">
                        No songs yet. Add your first song above!
                    </div>
                ) : (
                    <div className="space-y-2">
                        {musicLinks.map((song) => (
                            <div
                                key={song.id}
                                className="border border-ascii-border p-3 hover:bg-white/5 transition-colors"
                            >
                                {editingId === song.id ? (
                                    // Edit Mode
                                    <div className="space-y-2">
                                        <Input
                                            type="text"
                                            value={editTitle}
                                            onChange={(e) => setEditTitle(e.target.value)}
                                            className="bg-black/30 border-ascii-border ascii-text text-sm"
                                        />
                                        <Input
                                            type="url"
                                            value={editUrl}
                                            onChange={(e) => setEditUrl(e.target.value)}
                                            className="bg-black/30 border-ascii-border ascii-text text-xs"
                                        />
                                        <div className="flex gap-2">
                                            <Button
                                                size="sm"
                                                onClick={() => saveEdit(song.id)}
                                                className="bg-green-600 hover:bg-green-700 text-white"
                                            >
                                                <Check className="w-3 h-3 mr-1" />
                                                Save
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={cancelEdit}
                                                className="ascii-text hover:bg-white/10"
                                            >
                                                <X className="w-3 h-3 mr-1" />
                                                Cancel
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    // View Mode
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span
                                                    className={`text-xs px-2 py-0.5 rounded ${song.platform === "Spotify"
                                                            ? "bg-green-600/20 text-green-400"
                                                            : "bg-red-600/20 text-red-400"
                                                        }`}
                                                >
                                                    {song.platform}
                                                </span>
                                                <span className="ascii-text text-sm font-mono truncate">
                                                    {song.title}
                                                </span>
                                            </div>
                                            <div className="ascii-dim text-xs truncate">{song.url}</div>
                                        </div>
                                        <div className="flex gap-1 flex-shrink-0">
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => window.open(song.url, "_blank")}
                                                className="ascii-text hover:bg-white/10"
                                                title="Test link"
                                            >
                                                <ExternalLink className="w-3 h-3" />
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => startEdit(song.id, song.title, song.url)}
                                                className="ascii-text hover:bg-white/10"
                                                title="Edit"
                                            >
                                                <Edit2 className="w-3 h-3" />
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => handleDelete(song.id, song.title)}
                                                className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                                                title="Delete"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Instructions */}
            <div className="ascii-box p-4 bg-blue-900/10 border-blue-500/30">
                <h4 className="text-blue-400 text-xs font-bold mb-2">💡 HOW TO ADD SONGS</h4>
                <div className="ascii-dim text-xs space-y-1">
                    <div><strong className="text-green-400">Spotify:</strong> Open song → Share → Copy Song Link</div>
                    <div><strong className="text-red-400">YouTube Music:</strong> Open song → Share → Copy link</div>
                </div>
            </div>
        </div>
    );
}
