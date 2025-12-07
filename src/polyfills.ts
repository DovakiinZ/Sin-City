import { Buffer } from 'buffer';

// Polyfill Buffer for browser compatibility
if (typeof window !== 'undefined') {
    window.Buffer = Buffer;
    (window as any).global = window;
}

export { };
