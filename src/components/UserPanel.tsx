import { useEffect, useState } from "react";

export default function UserPanel() {
  const [name, setName] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const existing = localStorage.getItem("username") || "";
    setName(existing);
  }, []);

  function save() {
    localStorage.setItem("username", name.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 1200);
  }

  return (
    <div className="font-mono border border-green-700 p-3 bg-black/60">
      <div className="ascii-highlight mb-2">+-- User Panel --+</div>
      <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
        <label className="ascii-dim text-xs sm:text-sm">Username</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 min-w-[220px] bg-black text-green-400 border border-green-700 px-2 py-1 outline-none"
          placeholder="Enter username"
        />
        <button onClick={save} className="ascii-nav-link hover:ascii-highlight border border-green-700 px-3 py-1">
          Save
        </button>
        {saved && <span className="ascii-highlight text-xs">Saved</span>}
      </div>
      <div className="ascii-dim text-xs mt-2">Posts you create will show this name.</div>
    </div>
  );
}

