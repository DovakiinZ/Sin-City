import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || ''
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') || 'Sin City <onboarding@resend.dev>'
const SITE_URL = Deno.env.get('SITE_URL') || 'https://cicada.city'

interface EmailQueueItem {
    id: string
    user_id: string
    session_id: string
    last_message_id: string
    sender_id: string
    scheduled_at: string
}

interface UserProfile {
    email: string
    username: string | null
}

serve(async (req) => {
    try {
        // Create Supabase client with service role
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

        const supabase = createClient(supabaseUrl, supabaseServiceKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        })

        console.log('🔄 Processing DM email queue...')

        // Fetch pending emails that are ready to send
        const { data: pendingEmails, error: fetchError } = await supabase
            .from('dm_email_queue')
            .select('*')
            .eq('status', 'pending')
            .lte('scheduled_at', new Date().toISOString())
            .limit(50)

        if (fetchError) {
            console.error('Error fetching pending emails:', fetchError)
            return new Response(JSON.stringify({ error: fetchError.message }), { status: 500 })
        }

        if (!pendingEmails || pendingEmails.length === 0) {
            console.log('✅ No pending emails to process')
            return new Response(JSON.stringify({ processed: 0, message: 'No pending emails' }), {
                headers: { 'Content-Type': 'application/json' }
            })
        }

        console.log(`📬 Found ${pendingEmails.length} pending email(s)`)

        let sentCount = 0
        let cancelledCount = 0
        let errorCount = 0

        // Process each email
        for (const email of pendingEmails as EmailQueueItem[]) {
            try {
                // Check if conversation is still unread
                const { data: unreadCount } = await supabase.rpc('get_conversation_unread_count', {
                    p_session_id: email.session_id
                })

                // If no unread messages, cancel the email
                if (!unreadCount || unreadCount === 0) {
                    await supabase
                        .from('dm_email_queue')
                        .update({
                            status: 'cancelled',
                            cancelled_at: new Date().toISOString()
                        })
                        .eq('id', email.id)

                    cancelledCount++
                    console.log(`❌ Cancelled email ${email.id} - conversation already read`)
                    continue
                }

                // Get recipient's email from auth.users
                const { data: userData, error: userError } = await supabase.auth.admin.getUserById(
                    email.user_id
                )

                if (userError || !userData?.user?.email) {
                    console.error(`Error getting user email for ${email.user_id}:`, userError)
                    errorCount++
                    continue
                }

                const recipientEmail = userData.user.email

                // Send email via Resend
                const emailSent = await sendDMNotification(
                    recipientEmail,
                    email.session_id
                )

                if (emailSent) {
                    // Mark as sent
                    await supabase
                        .from('dm_email_queue')
                        .update({
                            status: 'sent',
                            sent_at: new Date().toISOString()
                        })
                        .eq('id', email.id)

                    sentCount++
                    console.log(`✉️ Sent email to ${recipientEmail} for session ${email.session_id}`)
                } else {
                    errorCount++
                }
            } catch (error) {
                console.error(`Error processing email ${email.id}:`, error)
                errorCount++
            }
        }

        console.log(`✅ Processing complete: ${sentCount} sent, ${cancelledCount} cancelled, ${errorCount} errors`)

        return new Response(
            JSON.stringify({
                processed: pendingEmails.length,
                sent: sentCount,
                cancelled: cancelledCount,
                errors: errorCount
            }),
            {
                headers: { 'Content-Type': 'application/json' }
            }
        )
    } catch (error) {
        console.error('Fatal error in process-dm-emails:', error)
        return new Response(
            JSON.stringify({ error: error.message }),
            {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            }
        )
    }
})

async function sendDMNotification(
    recipientEmail: string,
    sessionId: string
): Promise<boolean> {
    if (!RESEND_API_KEY) {
        console.error('RESEND_API_KEY not configured')
        return false
    }

    try {
        const conversationUrl = `${SITE_URL}/chat?session=${sessionId}`

        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: FROM_EMAIL,
                to: [recipientEmail],
                subject: 'You have a new message on Sin City',
                html: `
          <div style="font-family: monospace; background: #0a0a0a; color: #22c55e; padding: 40px; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #22c55e; border-bottom: 2px solid #22c55e; padding-bottom: 20px; margin-bottom: 30px;">
              New Message
            </h1>
            
            <p style="font-size: 16px; line-height: 1.6; margin-bottom: 30px;">
              You received a new message on Sin City.
            </p>
            
            <div style="text-align: center; margin: 40px 0;">
              <a href="${conversationUrl}" 
                 style="background: #22c55e; color: #0a0a0a; padding: 16px 32px; 
                        text-decoration: none; border-radius: 6px; display: inline-block;
                        font-weight: bold; font-size: 16px;">
                Open Conversation
              </a>
            </div>
            
            <div style="margin-top: 50px; padding-top: 30px; border-top: 1px solid #333;">
              <p style="font-size: 12px; color: #666; margin-bottom: 10px;">
                This is an automated notification for unread messages.
              </p>
              <p style="font-size: 12px; color: #666;">
                You can manage your notification preferences in your settings.
              </p>
            </div>
            
            <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #222; font-size: 11px; color: #555; text-align: center;">
              Sin City - Anonymous Posting Platform
            </div>
          </div>
        `,
            }),
        })

        if (!response.ok) {
            const error = await response.json()
            console.error('Resend API error:', error)
            return false
        }

        return true
    } catch (error) {
        console.error('Error sending email via Resend:', error)
        return false
    }
}
