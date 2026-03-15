import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export default async function handler(
    req: VercelRequest,
    res: VercelResponse
) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        // Get auth token from request
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const token = authHeader.replace('Bearer ', '');

        // Verify user session
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);

        if (authError || !user) {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }

        // GET: Fetch user's notification settings
        if (req.method === 'GET') {
            const { data, error } = await supabase
                .from('dm_notification_settings')
                .select('email_enabled, delay_minutes')
                .eq('user_id', user.id)
                .single();

            if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
                console.error('Error fetching settings:', error);
                return res.status(500).json({ error: 'Failed to fetch settings' });
            }

            // Return default settings if none exist
            const settings = data || {
                email_enabled: true,
                delay_minutes: 5
            };

            return res.status(200).json(settings);
        }

        // PUT: Update user's notification settings
        if (req.method === 'PUT') {
            const { email_enabled, delay_minutes } = req.body;

            // Validate inputs
            if (typeof email_enabled !== 'boolean') {
                return res.status(400).json({ error: 'email_enabled must be boolean' });
            }

            if (![5, 15, 30, 60].includes(delay_minutes)) {
                return res.status(400).json({ error: 'delay_minutes must be 5, 15, 30, or 60' });
            }

            // Upsert settings
            const { error } = await supabase
                .from('dm_notification_settings')
                .upsert({
                    user_id: user.id,
                    email_enabled,
                    delay_minutes,
                    updated_at: new Date().toISOString()
                });

            if (error) {
                console.error('Error updating settings:', error);
                return res.status(500).json({ error: 'Failed to update settings' });
            }

            return res.status(200).json({
                success: true,
                email_enabled,
                delay_minutes
            });
        }

        return res.status(405).json({ error: 'Method not allowed' });

    } catch (error: any) {
        console.error('DM notification settings error:', error);
        return res.status(500).json({ error: 'Internal error: ' + (error.message || 'Unknown') });
    }
}
