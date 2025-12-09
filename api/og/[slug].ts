import { createClient } from '@supabase/supabase-js';

// Vercel Edge API Route for Open Graph meta tags
export const config = {
    runtime: 'edge',
};

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY!;

export default async function handler(request: Request) {
    const url = new URL(request.url);
    const slug = url.pathname.split('/').pop() || '';

    // Detect social media crawlers
    const userAgent = request.headers.get('user-agent') || '';
    const isBot = /twitterbot|facebookexternalhit|linkedinbot|slackbot|telegrambot|whatsapp|discordbot/i.test(userAgent);

    if (!isBot) {
        // Not a crawler, redirect to the SPA
        return Response.redirect(`${url.origin}/post/${slug}`, 302);
    }

    // Fetch post data from Supabase
    let title = 'Sin City';
    let description = 'A terminal-style blog and Bassam\'s thoughts';
    let image = `${url.origin}/images/moth-logo.png`;

    try {
        const supabase = createClient(supabaseUrl, supabaseKey);
        const { data: post } = await supabase
            .from('posts')
            .select('title, content, slug')
            .or(`id.eq.${slug},slug.eq.${slug}`)
            .single();

        if (post) {
            title = post.title || title;
            // Extract first 150 chars of content as description
            const plainText = (post.content || '').replace(/<[^>]*>/g, '').substring(0, 150);
            description = plainText || description;
        }
    } catch (error) {
        console.error('Error fetching post for OG:', error);
    }

    const postUrl = `${url.origin}/post/${slug}`;

    // Return HTML with Open Graph meta tags
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${title} | Sin City</title>
  
  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="article" />
  <meta property="og:url" content="${postUrl}" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image" content="${image}" />
  <meta property="og:site_name" content="Sin City" />
  
  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:site" content="@Collapsingz" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image" content="${image}" />
  
  <!-- Redirect browsers to the actual page -->
  <meta http-equiv="refresh" content="0;url=${postUrl}" />
</head>
<body>
  <p>Redirecting to <a href="${postUrl}">${title}</a>...</p>
</body>
</html>`;

    return new Response(html, {
        headers: {
            'Content-Type': 'text/html',
            'Cache-Control': 'public, max-age=3600',
        },
    });
}
