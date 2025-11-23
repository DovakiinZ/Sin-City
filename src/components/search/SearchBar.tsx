import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSearch } from "@/hooks/useSearch";
import { Search, X } from "lucide-react";

export default function SearchBar() {
    const [query, setQuery] = useState("");
    const [isOpen, setIsOpen] = useState(false);
    const navigate = useNavigate();
    const { results, loading } = useSearch(query, isOpen && query.length > 2);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        if (query.trim()) {
            navigate(`/search?q=${encodeURIComponent(query)}`);
            setIsOpen(false);
        }
    };

    return (
        <div className="relative">
            <form onSubmit={handleSearch} className="relative">
                <input
                    type="text"
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setIsOpen(true);
                    }}
                    onFocus={() => setIsOpen(true)}
                    placeholder="Search posts... (press / to focus)"
                    className="w-full bg-background border border-ascii-border px-4 py-2 pr-10 ascii-text focus:border-ascii-highlight focus:outline-none"
                />
                <button
                    type="submit"
                    className="absolute right-2 top-1/2 -translate-y-1/2 ascii-text hover:ascii-highlight"
                >
                    <Search size={18} />
                </button>
            </form>

            {/* Search Results Dropdown */}
            {isOpen && query.length > 2 && (
                <div className="absolute top-full left-0 right-0 mt-2 ascii-box bg-background border-ascii-border max-h-96 overflow-y-auto z-50">
                    <div className="flex justify-between items-center p-2 border-b border-ascii-border">
                        <span className="ascii-dim text-xs">
                            {loading ? "Searching..." : `${results.length} results`}
                        </span>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="ascii-text hover:ascii-highlight"
                        >
                            <X size={16} />
                        </button>
                    </div>

                    {loading ? (
                        <div className="p-4 text-center ascii-dim">
                            <div className="ascii-spinner">Searching...</div>
                        </div>
                    ) : results.length === 0 ? (
                        <div className="p-4 text-center ascii-dim">
                            No results found for "{query}"
                        </div>
                    ) : (
                        <div className="divide-y divide-ascii-border">
                            {results.map((result) => (
                                <button
                                    key={result.id}
                                    onClick={() => {
                                        navigate(`/post/${result.id}`);
                                        setIsOpen(false);
                                        setQuery("");
                                    }}
                                    className="w-full text-left p-3 hover:bg-ascii-highlight/10 transition-colors"
                                >
                                    <div className="ascii-highlight text-sm mb-1">{result.title}</div>
                                    <div className="ascii-dim text-xs line-clamp-2">
                                        {result.content?.substring(0, 150)}...
                                    </div>
                                    <div className="ascii-dim text-xs mt-1">
                                        by {result.author_name || "Anonymous"} •{" "}
                                        {new Date(result.created_at).toLocaleDateString()}
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}

                    <div className="p-2 border-t border-ascii-border text-center">
                        <button
                            onClick={() => {
                                navigate(`/search?q=${encodeURIComponent(query)}`);
                                setIsOpen(false);
                            }}
                            className="ascii-nav-link text-xs hover:ascii-highlight"
                        >
                            View all results →
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
