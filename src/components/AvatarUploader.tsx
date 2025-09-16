import { useRef } from "react";

export default function AvatarUploader({ value, onChange }: { value?: string; onChange: (dataUrl?: string) => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return onChange(undefined);
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
        <button className="ascii-nav-link hover:ascii-highlight border border-green-700 px-3 py-1" onClick={() => inputRef.current?.click()} type="button">
          Upload
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

