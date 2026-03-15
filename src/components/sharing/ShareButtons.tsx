import { useState } from "react";
import { Share2, Twitter, Link as LinkIcon, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

interface ShareButtonsProps {
    title: string;
    slug: string;
    content?: string;
}

export default function ShareButtons({ title, slug, content }: ShareButtonsProps) {
    const { toast } = useToast();
    const [copied, setCopied] = useState(false);

    const url = `${window.location.origin}/post/${slug}`;
    const text = `Check out: ${title}`;

    const copyLink = () => {
        navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        toast({
            title: "Link copied!",
            description: "Post link copied to clipboard",
        });
    };

    const shareToTwitter = () => {
        const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
        window.open(twitterUrl, "_blank", "width=550,height=420");
    };

    const shareToReddit = () => {
        const redditUrl = `https://reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`;
        window.open(redditUrl, "_blank");
    };

    const shareToFacebook = () => {
        const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
        window.open(fbUrl, "_blank", "width=550,height=420");
    };

    const shareNative = async () => {
        if (navigator.share) {
            try {
                await navigator.share({
                    title,
                    text: content?.substring(0, 100),
                    url,
                });
            } catch (error) {
                // User cancelled or error occurred
            }
        } else {
            copyLink();
        }
    };

    return (
        <div className="mt-6 pt-6 border-t border-ascii-border">
            <div className="flex items-center justify-between">
                <span className="ascii-dim text-sm">Share this post:</span>
                <div className="flex gap-2">
                    <Button
                        onClick={copyLink}
                        variant="outline"
                        size="sm"
                        className="ascii-box"
                    >
                        {copied ? <Check className="w-4 h-4 mr-1" /> : <LinkIcon className="w-4 h-4 mr-1" />}
                        {copied ? "Copied!" : "Copy Link"}
                    </Button>

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="outline"
                                size="sm"
                                className="ascii-box"
                            >
                                <Share2 className="w-4 h-4 mr-1" />
                                Share
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={shareToTwitter}>
                                <Twitter className="w-4 h-4 mr-2" />
                                Share on Twitter
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={shareToReddit}>
                                <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z" />
                                </svg>
                                Share on Reddit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={shareToFacebook}>
                                <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                                </svg>
                                Share on Facebook
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {navigator.share && (
                                <DropdownMenuItem onClick={shareNative}>
                                    <Share2 className="w-4 h-4 mr-2" />
                                    More options...
                                </DropdownMenuItem>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>
        </div>
    );
}
