// Polyfill global for browser compatibility (required by gray-matter)
if (typeof window !== 'undefined') {
    (window as any).global = window;
}

export { };
