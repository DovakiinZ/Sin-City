import { useSearchParams, Link } from "react-router-dom";
import { useSearch } from "@/hooks/useSearch";
import BackButton from "@/components/BackButton";
import ReactMarkdown from "react-markdown";

export default function SearchResults() {
    const [searchParams] = useSearchParams();
    const query = searchParams.get("q") || "";
    const { results, loading, error } = useSearch(query, true);

    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
            <div className="w-full max-w-4xl mx-auto space-y-6">
                <BackButton />

                <div className="ascii-box p-6">
                    <pre className="ascii-highlight text-xl mb-4">
                        {`╔═══════════════════════════════════════════════════════════════╗
║                      SEARCH RESULTS                           ║
╚═══════════════════════════════════════════════════════════════╝`}
                    </pre>

                    <div className="mb-6">
                        <span className="ascii-text">Query: </span>
                        <span className="ascii-highlight">"{query}"</span>
                    </div>

                    {loading ? (
                        <div className="text-center py-12">
                            <div className="ascii-dim text-lg mb-2">Searching...</div>
                            <div className="ascii-spinner">▓▒░</div>
                        </div>
                    ) : error ? (
                        <div className="text-red-400 text-center py-12">
                            <div className="text-lg mb-2">Error</div>
                            <div>{error}</div>
                        </div>
                    ) : results.length === 0 ? (
                        <div className="text-center py-12">
                            <div className="ascii-dim text-lg mb-4">No results found</div>
                            <div className="ascii-text text-sm">
                                Try different keywords or check your spelling
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="ascii-dim text-sm mb-6">
                                Found {results.length} {results.length === 1 ? "result" : "results"}
                            </div>

                            <div className="space-y-6">
                                {results.map((result, index) => (
                                    <div
                                        key={result.id}
                                        className="border-l-2 border-ascii-border pl-4 py-2"
                                    >
                                        <div className="flex items-start justify-between mb-2">
                                            <Link
                                                to={`/post/${result.id}`}
                                                className="ascii-highlight text-lg hover:underline"
                                            >
                                                [{index + 1}] {result.title}
                                            </Link>
                                            <span className="ascii-dim text-xs">
                                                Relevance: {(result.rank * 100).toFixed(0)}%
                                            </span>
                                        </div>

                                        <div className="ascii-dim text-xs mb-3">
                                            by {result.author_name || "Anonymous"} •{" "}
                                            {new Date(result.created_at).toLocaleDateString()}
                                        </div>

                                        <div className="prose prose-invert prose-sm max-w-none">
                                            <ReactMarkdown>
                                                {result.content?.substring(0, 300)}
                                                {result.content && result.content.length > 300 ? "..." : ""}
                                            </ReactMarkdown>
                                        </div>

                                        <Link
                                            to={`/post/${result.id}`}
                                            className="ascii-nav-link text-sm hover:ascii-highlight mt-2 inline-block"
                                        >
                                            Read more →
                                        </Link>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                <div className="text-center">
                    <Link to="/posts" className="ascii-nav-link hover:ascii-highlight">
                        ← Back to all posts
                    </Link>
                </div>
            </div>
        </div>
    );
}
