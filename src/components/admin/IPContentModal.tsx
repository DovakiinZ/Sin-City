import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, FileText, MessageSquare, AlertTriangle, ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";

interface IPContentModalProps {
    isOpen: boolean;
    onClose: () => void;
    ipAddress: string;
    type: 'posts' | 'comments';
}

interface LinkedPost {
    id: string;
    title: string;
    excerpt: string;
    created_at: string;
    status: string;
    author_type: 'guest' | 'user';
    author_name: string;
    author_id: string;
}

interface LinkedComment {
    id: string;
    content: string;
    post_id: string;
    post_title: string;
    created_at: string;
    author_type: 'guest' | 'user';
    author_name: string;
}

export default function IPContentModal({ isOpen, onClose, ipAddress, type }: IPContentModalProps) {
    const [posts, setPosts] = useState<LinkedPost[]>([]);
    const [comments, setComments] = useState<LinkedComment[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (isOpen && ipAddress) {
            fetchContent();
        }
    }, [isOpen, ipAddress, type]);

    const fetchContent = async () => {
        setLoading(true);
        try {
            if (type === 'posts') {
                const { data, error } = await supabase.rpc('get_posts_by_ip', { p_ip: ipAddress });
                if (error) throw error;
                setPosts(data || []);
            } else {
                const { data, error } = await supabase.rpc('get_comments_by_ip', { p_ip: ipAddress });
                if (error) throw error;
                setComments(data || []);
            }
        } catch (error) {
            console.error("Error fetching linked content:", error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-3xl glass-panel border-white/10">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        {type === 'posts' ? <FileText className="h-5 w-5 text-neon-cyan" /> : <MessageSquare className="h-5 w-5 text-neon-cyan" />}
                        Linked {type === 'posts' ? 'Posts' : 'Comments'}
                    </DialogTitle>
                    <DialogDescription>
                        Content linked to IP: <span className="font-mono text-neon-cyan">{ipAddress}</span>
                    </DialogDescription>
                </DialogHeader>

                <ScrollArea className="h-[60vh] mt-4 pr-4">
                    {loading ? (
                        <div className="flex justify-center py-8">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {type === 'posts' ? (
                                posts.length > 0 ? (
                                    posts.map((post) => (
                                        <div key={post.id} className="p-4 rounded-lg bg-black/40 border border-white/5 hover:border-white/10 transition-colors">
                                            <div className="flex justify-between items-start mb-2">
                                                <h4 className="font-medium text-white line-clamp-1">{post.title}</h4>
                                                <Badge variant={post.status === 'published' ? 'default' : 'secondary'} className="text-xs">
                                                    {post.status}
                                                </Badge>
                                            </div>
                                            <p className="text-sm text-gray-400 line-clamp-2 mb-3">{post.excerpt}</p>
                                            <div className="flex items-center justify-between text-xs text-gray-500">
                                                <div className="flex items-center gap-2">
                                                    <span className={post.author_type === 'user' ? 'text-neon-purple' : 'text-neon-green'}>
                                                        {post.author_name}
                                                    </span>
                                                    <span>•</span>
                                                    <span>{formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}</span>
                                                </div>
                                                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => window.open(`/post/${post.id}`, '_blank')}>
                                                    View <ExternalLink className="ml-1 h-3 w-3" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-center py-8 text-gray-500">No linked posts found for this IP.</div>
                                )
                            ) : (
                                comments.length > 0 ? (
                                    comments.map((comment) => (
                                        <div key={comment.id} className="p-4 rounded-lg bg-black/40 border border-white/5 hover:border-white/10 transition-colors">
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="text-sm text-gray-300">
                                                    <span className="text-gray-500">On: </span>
                                                    {comment.post_title}
                                                </div>
                                            </div>
                                            <p className="text-sm text-white/90 mb-3">{comment.content}</p>
                                            <div className="flex items-center justify-between text-xs text-gray-500">
                                                <div className="flex items-center gap-2">
                                                    <span className={comment.author_type === 'user' ? 'text-neon-purple' : 'text-neon-green'}>
                                                        {comment.author_name}
                                                    </span>
                                                    <span>•</span>
                                                    <span>{formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}</span>
                                                </div>
                                                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => window.open(`/post/${comment.post_id}`, '_blank')}>
                                                    View Context <ExternalLink className="ml-1 h-3 w-3" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-center py-8 text-gray-500">No linked comments found for this IP.</div>
                                )
                            )}
                        </div>
                    )}
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
}
