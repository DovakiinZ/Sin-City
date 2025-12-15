import { useAuth } from "@/context/AuthContext";

export default function UserPanel() {
  const { user } = useAuth();

  return (
    <div className="font-mono border border-green-700 p-3 bg-black/60">
      <div className="ascii-highlight mb-2">+-- User Panel --+</div>
      <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
        <label className="ascii-dim text-xs sm:text-sm">Username</label>
        <div className="flex-1 min-w-[220px] bg-black text-green-400 border border-green-700 px-2 py-1">
          @{user?.username || user?.displayName || "Anonymous"}
        </div>
      </div>
      <div className="ascii-dim text-xs mt-2">Posts you create will show this name.</div>
    </div>
  );
}

