import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getAllTags, type TagCount } from "@/hooks/useSearch";

export default function TagCloud() {
    const [tags, setTags] = useState<TagCount[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadTags = async () => {
            try {
                const data = await getAllTags();
                setTags(data);
            } catch (error) {
                console.error("Error loading tags:", error);
            } finally {
                setLoading(false);
            }
        };

        loadTags();
    }, []);

    if (loading) {
        return <div className="ascii-dim text-xs">Loading tags...</div>;
    }

    if (tags.length === 0) {
        return null;
    }

    // Calculate font sizes based on count
    const maxCount = Math.max(...tags.map((t) => t.count));
    const minCount = Math.min(...tags.map((t) => t.count));
    const range = maxCount - minCount || 1;

    const getFontSize = (count: number) => {
        const normalized = (count - minCount) / range;
        return `${0.75 + normalized * 0.75}rem`; // 0.75rem to 1.5rem
    };

    return (
        <div className="ascii-box p-4">
            <pre className="ascii-highlight text-xs mb-3">TAG CLOUD</pre>
            <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                    <Link
                        key={tag.tag}
                        to={`/posts?tag=${encodeURIComponent(tag.tag)}`}
                        className="ascii-nav-link hover:ascii-highlight transition-all"
                        style={{ fontSize: getFontSize(tag.count) }}
                        title={`${tag.count} ${tag.count === 1 ? "post" : "posts"}`}
                    >
                        #{tag.tag}
                        <span className="ascii-dim text-xs ml-1">({tag.count})</span>
                    </Link>
                ))}
            </div>
        </div>
    );
}
