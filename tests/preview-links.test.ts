import { describe, it, expect } from 'vitest';
import { previewWithLinks } from '../src/lib/markdown';

// Anchors reach the feed in two shapes: raw (saved by the /create editor) and
// entity-escaped (saved by the inline composer, which runs parseInlineMarkdown).
const RAW = '<a href="https://example.com" target="_blank" rel="noopener noreferrer" class="text-green-400 underline">the site</a>';
const ESCAPED = '&lt;a href="https://example.com" target="_blank" rel="noopener noreferrer" class="text-green-400 underline"&gt;the site&lt;/a&gt;';

describe('previewWithLinks', () => {
    it('keeps raw anchors clickable in the excerpt', () => {
        const out = previewWithLinks(`check ${RAW} out`);
        expect(out).toContain('<a href="https://example.com"');
        expect(out).toContain('>the site</a>');
    });

    it('restores anchors that were escaped on save', () => {
        const out = previewWithLinks(`check ${ESCAPED} out`);
        expect(out).toContain('<a href="https://example.com"');
        expect(out).toContain('>the site</a>');
    });

    it('preserves the spaces around a link', () => {
        expect(previewWithLinks(`check ${RAW} out`)).toBe(`check ${RAW} out`);
    });

    it('strips every other tag', () => {
        const out = previewWithLinks(`<strong>bold</strong> and <em>italic</em> ${RAW}`);
        expect(out).not.toContain('<strong>');
        expect(out).not.toContain('<em>');
        expect(out).toContain('<a href=');
    });

    it('counts visible text only, not markup, against the limit', () => {
        const out = previewWithLinks(`${RAW} tail`, 8);
        // "the site" is exactly 8 visible chars, so the tail is dropped
        expect(out).toContain('>the site</a>');
        expect(out).not.toContain('tail');
    });

    it('truncates a long link label without dropping the tag', () => {
        const out = previewWithLinks(RAW, 3);
        expect(out).toBe('<a href="https://example.com" target="_blank" rel="noopener noreferrer" class="text-green-400 underline">the</a>');
    });

    it('leaves plain posts unchanged', () => {
        expect(previewWithLinks('just a plain thought')).toBe('just a plain thought');
    });
});
