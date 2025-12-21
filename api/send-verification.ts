import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Resend API for sending emails
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const FROM_EMAIL = process.env.FROM_EMAIL || 'Sin City <noreply@sin.city>';

// Generate 6-digit OTP
function generateOTP(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Hash OTP for storage
function hashOTP(otp: string): string {
    return crypto.createHash('sha256').update(otp).digest('hex');
}

// Email validation
function isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Send email via Resend
async function sendEmail(to: string, otp: string): Promise<boolean> {
    if (!RESEND_API_KEY) {
        console.error('RESEND_API_KEY not configured');
        return false;
    }

    try {
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: FROM_EMAIL,
                to: [to],
                subject: 'Your Sin City Verification Code',
                html: `
                    <div style="font-family: monospace; background: #0a0a0a; color: #22c55e; padding: 40px; max-width: 500px; margin: 0 auto;">
                        <h1 style="color: #22c55e; border-bottom: 1px solid #22c55e; padding-bottom: 20px;">
                            Sin City Verification
                        </h1>
                        <p style="font-size: 16px; line-height: 1.6;">
                            Your verification code is:
                        </p>
                        <div style="background: #1a1a1a; border: 2px solid #22c55e; padding: 20px; text-align: center; margin: 20px 0;">
                            <span style="font-size: 32px; letter-spacing: 8px; color: #22c55e; font-weight: bold;">
                                ${otp}
                            </span>
                        </div>
                        <p style="font-size: 14px; color: #888;">
                            This code expires in 10 minutes.<br>
                            If you didn't request this, you can ignore this email.
                        </p>
                        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #333; font-size: 12px; color: #666;">
                            Sin City - Anonymous Posting Platform
                        </div>
                    </div>
                `,
            }),
        });

        if (!response.ok) {
            const error = await response.json();
            console.error('Resend API error:', error);
            return false;
        }

        return true;
    } catch (error) {
        console.error('Email send error:', error);
        return false;
    }
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
        const { guest_id, email } = req.body;

        // Validate inputs
        if (!guest_id) {
            return res.status(400).json({ error: 'Guest ID required' });
        }

        if (!email || !isValidEmail(email)) {
            return res.status(400).json({ error: 'Valid email required' });
        }

        // Generate OTP
        const otp = generateOTP();
        const otpHash = hashOTP(otp);

        // Store in database
        const { error: dbError } = await supabase.rpc('set_guest_verification_code', {
            p_guest_id: guest_id,
            p_code_hash: otpHash,
            p_email: email,
        });

        if (dbError) {
            console.error('Database error:', dbError);
            if (dbError.message.includes('Rate limit')) {
                return res.status(429).json({ error: 'Please wait 2 minutes before requesting another code' });
            }
            return res.status(500).json({ error: 'Failed to generate verification code' });
        }

        // Send email
        const emailSent = await sendEmail(email, otp);

        if (!emailSent) {
            return res.status(500).json({ error: 'Failed to send verification email' });
        }

        return res.status(200).json({
            success: true,
            message: 'Verification code sent to your email',
        });

    } catch (error) {
        console.error('Send verification error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
