import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const { slug } = req.query;
    const postSlug = Array.isArray(slug) ? slug[0] : slug || '';

    // Get the host
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['host'] || 'cicada.city';
    const origin = `${protocol}://${host}`;

    // Detect social media crawlers
    const userAgent = req.headers['user-agent'] || '';
    const isBot = /twitterbot|facebookexternalhit|linkedinbot|slackbot|telegrambot|whatsapp|discordbot/i.test(userAgent);

    if (!isBot) {
        // Not a crawler, redirect to the SPA
        return res.redirect(302, `${origin}/post/${postSlug}`);
    }

    // Default values
    let title = 'Sin City';
    let description = "A terminal-style blog and Bassam's thoughts";
    const image = `${origin}/images/moth-logo.png`;

    // Fetch post data from Supabase
    try {
        if (supabaseUrl && supabaseKey) {
            const supabase = createClient(supabaseUrl, supabaseKey);
            const { data: post } = await supabase
                .from('posts')
                .select('title, content')
                .or(`id.eq.${postSlug},slug.eq.${postSlug}`)
                .single();

            if (post) {
                title = post.title || title;
                // Extract first 150 chars of content as description
                const plainText = (post.content || '').replace(/<[^>]*>/g, '').substring(0, 150);
                description = plainText || description;
            }
        }
    } catch (error) {
        console.error('Error fetching post for OG:', error);
    }

    const postUrl = `${origin}/post/${postSlug}`;

    // Return HTML with Open Graph meta tags
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)} | Sin City</title>
  
  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="article" />
  <meta property="og:url" content="${postUrl}" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:image" content="${image}" />
  <meta property="og:site_name" content="Sin City" />
  
  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:site" content="@Collapsingz" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${image}" />
  
  <!-- Redirect browsers to the actual page -->
  <meta http-equiv="refresh" content="0;url=${postUrl}" />
</head>
<body>
  <p>Redirecting to <a href="${postUrl}">${escapeHtml(title)}</a>...</p>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.status(200).send(html);
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
