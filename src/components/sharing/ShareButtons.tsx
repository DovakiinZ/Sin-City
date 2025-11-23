import { Button } from "@/components/ui/button";
import { Twitter, Facebook, Linkedin, Link as LinkIcon, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ShareButtonsProps {
    title: string;
    slug: string;
    content?: string; // For export
}

export default function ShareButtons({ title, slug, content }: ShareButtonsProps) {
    const { toast } = useToast();
    const url = `${window.location.origin}/post/${slug}`;
    const encodedUrl = encodeURIComponent(url);
    const encodedTitle = encodeURIComponent(title);

    const handleCopyLink = () => {
        navigator.clipboard.writeText(url);
        toast({
            title: "Link copied",
            description: "Post URL copied to clipboard",
        });
    };

    const handleExportMarkdown = () => {
        if (!content) return;
        const blob = new Blob([content], { type: "text/markdown" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `${slug}.md`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast({
            title: "Exported",
            description: "Post downloaded as Markdown",
        });
    };

    return (
        <div className="flex flex-wrap gap-2 mt-6 pt-6 border-t border-ascii-border">
            <div className="w-full text-xs ascii-dim mb-2">SHARE & EXPORT</div>

            <Button
                variant="outline"
                size="sm"
                className="ascii-box hover:bg-ascii-highlight hover:text-black"
                onClick={() => window.open(`https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`, "_blank")}
            >
                <Twitter className="w-4 h-4 mr-2" />
                Tweet
            </Button>

            <Button
                variant="outline"
                size="sm"
                className="ascii-box hover:bg-ascii-highlight hover:text-black"
                onClick={() => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`, "_blank")}
            >
                <Facebook className="w-4 h-4 mr-2" />
                Share
            </Button>

            <Button
                variant="outline"
                size="sm"
                className="ascii-box hover:bg-ascii-highlight hover:text-black"
                onClick={() => window.open(`https://www.linkedin.com/shareArticle?mini=true&url=${encodedUrl}&title=${encodedTitle}`, "_blank")}
            >
                <Linkedin className="w-4 h-4 mr-2" />
                Post
            </Button>

            <Button
                variant="outline"
                size="sm"
                className="ascii-box hover:bg-ascii-highlight hover:text-black"
                onClick={handleCopyLink}
            >
                <LinkIcon className="w-4 h-4 mr-2" />
                Copy Link
            </Button>

            {content && (
                <Button
                    variant="outline"
                    size="sm"
                    className="ascii-box hover:bg-ascii-highlight hover:text-black ml-auto"
                    onClick={handleExportMarkdown}
                >
                    <Download className="w-4 h-4 mr-2" />
                    Export MD
                </Button>
            )}
        </div>
    );
}
