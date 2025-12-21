import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Hash OTP for comparison
function hashOTP(otp: string): string {
    return crypto.createHash('sha256').update(otp).digest('hex');
}

export default async function handler(
    req: VercelRequest,
    res: VercelResponse
) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { guest_id, code } = req.body;

        // Validate inputs
        if (!guest_id) {
            return res.status(400).json({ error: 'Guest ID required' });
        }

        if (!code || code.length !== 6) {
            return res.status(400).json({ error: 'Valid 6-digit code required' });
        }

        // Hash the provided code
        const codeHash = hashOTP(code);

        // Verify against database
        const { data, error: dbError } = await supabase.rpc('verify_guest_code', {
            p_guest_id: guest_id,
            p_code_hash: codeHash,
        });

        if (dbError) {
            console.error('Database error:', dbError);
            return res.status(500).json({ error: 'Verification failed' });
        }

        const result = data?.[0] || { success: false, message: 'Verification failed', trust_score: 0 };

        if (result.success) {
            return res.status(200).json({
                success: true,
                message: result.message,
                trust_score: result.trust_score,
                verified: true,
            });
        } else {
            return res.status(400).json({
                success: false,
                message: result.message,
                verified: false,
            });
        }

    } catch (error) {
        console.error('Verify code error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
