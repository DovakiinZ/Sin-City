import { useRef, useState } from "react";

export default function AvatarUploader({ value, onChange, isAdmin = false, onUpload }: { value?: string; onChange: (dataUrl?: string) => void; isAdmin?: boolean; onUpload?: (file: File) => Promise<string | null> }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return onChange(undefined);

    // Initial check for GIF restriction
    if (file.type === 'image/gif' && !isAdmin) {
      alert("Only admins can use GIF profile pictures.");
      if (inputRef.current) inputRef.current.value = ''; // Reset input
      return;
    }

    if (onUpload) {
      setUploading(true);
      try {
        const url = await onUpload(file);
        if (url) onChange(url);
      } catch (err) {
        console.error("Upload failed", err);
        alert(`Upload failed: ${err instanceof Error ? err.message : JSON.stringify(err)}`);
      } finally {
        setUploading(false);
        if (inputRef.current) inputRef.current.value = '';
      }
      return;
    }

    const reader = new FileReader();
    reader.onload = () => onChange(String(reader.result || undefined));
    reader.readAsDataURL(file);
  }

  return (
    <div className="flex items-center gap-3">
      <div className="w-16 h-16 border border-green-700 bg-black/40 flex items-center justify-center overflow-hidden">
        {value ? (
          <img src={value} alt="avatar" className="w-full h-full object-cover" />
        ) : (
          <span className="ascii-dim text-xs">No avatar</span>
        )}
      </div>
      <div className="flex gap-2">
        <input ref={inputRef} onChange={handleFile} type="file" accept="image/*" className="hidden" />
        <button className="ascii-nav-link hover:ascii-highlight border border-green-700 px-3 py-1" onClick={() => inputRef.current?.click()} type="button" disabled={uploading}>
          {uploading ? "Uploading..." : "Upload"}
        </button>
        {value && (
          <button className="ascii-dim border border-green-700 px-3 py-1" onClick={() => onChange(undefined)} type="button">
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

