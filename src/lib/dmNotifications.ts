import { supabase } from "@/lib/supabase";

interface DmNotificationInput {
    senderId: string;
    recipientId: string;
    sessionId: string;
    /** Text body of the message, if any. */
    content?: string | null;
    /** Set when the message is media-only, e.g. 'image' | 'voice' | 'gif' | 'video' | 'file'. */
    mediaKind?: string | null;
    /**
     * Name to show instead of the sender's real username - used for messages
     * sent under a masked identity, so the mask isn't blown by the bell.
     */
    senderLabel?: string | null;
}

const MEDIA_LABEL: Record<string, string> = {
    image: "sent an image",
    video: "sent a video",
    gif: "sent a GIF",
    voice: "sent a voice message",
    file: "sent a file",
};

function buildPreview({ content, mediaKind }: DmNotificationInput): string {
    const text = (content || "").trim();
    if (text) return text.length > 40 ? `${text.slice(0, 37)}...` : text;
    if (mediaKind) return MEDIA_LABEL[mediaKind] || "sent an attachment";
    return "";
}

/**
 * Notify the recipient of a new DM so the bell shows *who* messaged them
 * instead of a bare "New notification".
 *
 * Fire-and-forget: a failed notification must never fail the send itself.
 */
export async function notifyNewDirectMessage(input: DmNotificationInput): Promise<void> {
    const { senderId, recipientId, sessionId, senderLabel } = input;
    if (!senderId || !recipientId || senderId === recipientId) return;

    try {
        let displayName = senderLabel || null;

        if (!displayName) {
            const { data: senderProfile } = await supabase
                .from("profiles")
                .select("username")
                .eq("id", senderId)
                .single();
            displayName = senderProfile?.username || null;
        }

        await supabase.from("notifications").insert({
            user_id: recipientId,
            type: "dm_message",
            content: {
                senderUsername: displayName || "Someone",
                // Masked sends must not leak the real sender id either.
                senderId: senderLabel ? null : senderId,
                // The bell navigates with ?session=<id>; sessions and
                // conversations are the same thing to it.
                conversationId: sessionId,
                preview: buildPreview(input),
            },
            read: false,
        });
    } catch (error) {
        console.error("Error creating DM notification:", error);
    }
}
