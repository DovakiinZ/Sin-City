import { useState } from "react";

export type NewPost = {
  title: string;
  date?: string;
  content: string;
};

export default function AsciiNewPostForm({ onAdd, onClose }: { onAdd: (p: NewPost) => void; onClose?: () => void }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const today = new Date().toISOString().slice(0, 10);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    onAdd({ title: title.trim(), date: today, content });
    setTitle("");
    setContent("");
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
          className="w-full h-40 bg-black text-green-400 border border-green-700 px-2 py-1 outline-none"
          placeholder="Write your post in Markdown..."
        />
      </label>
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

