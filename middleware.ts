import { NextRequest, NextResponse } from 'next/server';

export const config = {
    matcher: '/post/:slug*',
};

export default function middleware(request: NextRequest) {
    const userAgent = request.headers.get('user-agent') || '';

    // Check if the request is from a social media crawler
    const isBot = /twitterbot|facebookexternalhit|linkedinbot|slackbot|telegrambot|whatsapp|discordbot/i.test(userAgent);

    if (isBot) {
        // Rewrite to our OG API route to serve meta tags
        const slug = request.nextUrl.pathname.replace('/post/', '');
        return NextResponse.rewrite(new URL(`/api/og/${slug}`, request.url));
    }

    // For regular users, continue to the SPA
    return NextResponse.next();
}
