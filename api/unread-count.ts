import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Create Supabase client with service role for backend operations
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export default async function handler(req: Request): Promise<Response> {
    // Only allow GET requests
    if (req.method !== 'GET') {
        return new Response(
            JSON.stringify({ error: 'Method not allowed' }),
            {
                status: 405,
                headers: { 'Content-Type': 'application/json' }
            }
        );
    }

    try {
        // Get auth token from request
        const authHeader = req.headers.get('authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return new Response(
                JSON.stringify({ error: 'Unauthorized' }),
                {
                    status: 401,
                    headers: { 'Content-Type': 'application/json' }
                }
            );
        }

        const token = authHeader.replace('Bearer ', '');

        // Verify user session
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);

        if (authError || !user) {
            return new Response(
                JSON.stringify({ error: 'Invalid or expired token' }),
                {
                    status: 401,
                    headers: { 'Content-Type': 'application/json' }
                }
            );
        }

        // Call the database function to get unread count
        // Use the authenticated user's session context
        const supabaseWithAuth = createClient(supabaseUrl, supabaseServiceKey, {
            global: {
                headers: {
                    Authorization: authHeader
                }
            }
        });

        const { data, error } = await supabaseWithAuth.rpc('get_global_unread_count');

        if (error) {
            console.error('Error fetching unread count:', error);
            return new Response(
                JSON.stringify({ error: 'Failed to fetch unread count' }),
                {
                    status: 500,
                    headers: { 'Content-Type': 'application/json' }
                }
            );
        }

        // Return the unread count
        return new Response(
            JSON.stringify({ unread_count: data || 0 }),
            {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache, no-store, must-revalidate'
                }
            }
        );
    } catch (error) {
        console.error('Unexpected error in unread-count API:', error);
        return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            }
        );
    }
}
