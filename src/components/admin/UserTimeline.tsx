import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, FileText, MessageSquare, Shield, Activity, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface TimelineEvent {
    id: string;
    type: 'post' | 'comment' | 'security_log';
    summary: string;
    details: any;
    created_at: string;
}

interface UserTimelineProps {
    userId: string;
}

export default function UserTimeline({ userId }: UserTimelineProps) {
    const [events, setEvents] = useState<TimelineEvent[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchTimeline();
    }, [userId]);

    const fetchTimeline = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase.rpc('get_user_timeline', { p_user_id: userId });
            if (error) throw error;
            setEvents(data || []);
        } catch (error) {
            console.error("Error fetching timeline:", error);
        } finally {
            setLoading(false);
        }
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'post': return <FileText className="w-4 h-4 text-neon-cyan" />;
            case 'comment': return <MessageSquare className="w-4 h-4 text-neon-purple" />;
            case 'security_log': return <Shield className="w-4 h-4 text-red-400" />;
            default: return <Activity className="w-4 h-4 text-gray-400" />;
        }
    };

    return (
        <ScrollArea className="h-[400px] w-full pr-4">
            {loading ? (
                <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            ) : events.length === 0 ? (
                <div className="text-center py-8 text-gray-500 text-sm">No activity recorded.</div>
            ) : (
                <div className="relative pl-4 border-l border-white/10 space-y-6 ml-2 my-2">
                    {events.map((event) => (
                        <div key={`${event.type}-${event.id}`} className="relative group">
                            {/* Dot */}
                            <div className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-black border border-white/20 group-hover:border-neon-cyan group-hover:bg-neon-cyan/20 transition-colors" />

                            <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2 text-sm text-gray-300">
                                    {getIcon(event.type)}
                                    <span className="font-medium">{event.summary}</span>
                                </div>
                                <div className="text-xs text-gray-500 pl-6 flex items-center gap-2">
                                    <Clock className="w-3 h-3" />
                                    {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
                                    <span className="text-white/10">•</span>
                                    <span className="font-mono text-[10px] opacity-50">
                                        {new Date(event.created_at).toLocaleString()}
                                    </span>
                                </div>
                                {event.type === 'security_log' && event.details && (
                                    <div className="ml-6 mt-1 text-[10px] bg-red-950/20 text-red-300/70 p-1.5 rounded border border-red-500/10 font-mono inline-block">
                                        IP Fingerprint: {event.details.fingerprint?.substring(0, 8)}...
                                        {event.details.city && ` • ${event.details.city}, ${event.details.country}`}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </ScrollArea>
    );
}
