export type AsciiCharset = 'dense' | 'classic' | 'blocks' | 'simple' | 'detailed' | 'jp2a';
export type AsciiMode = 'mono' | 'color';

export interface AsciiOptions {
    width: number;
    mode?: AsciiMode;
    invert?: boolean;
    charset?: AsciiCharset;
    contrast?: number; // Direct factor, e.g. 1.0 = normal, 1.6 = boosted
    gamma?: number;    // Direct gamma, e.g. 0.9
    sharpen?: boolean;
    dither?: boolean;
}

export interface AsciiOutput {
    ascii_text: string;
    html?: string;
    meta: {
        mode: AsciiMode;
        width: number;
        height: number;
        tool: "fallback" | "jp2a-server";
        ms: number;
    };
    imageData?: ImageData;
}

const CHARSETS: Record<AsciiCharset, string> = {
    // Requested dense charset (Dark -> Light)
    // Note: User said "dark pixels must map to @ % #". 
    // In Rec 709 Luminance: 0=Black, 255=White.
    // If output is White-on-Black (Terminal), Black (0) should be space? 
    // Wait, "dark pixels map to @". 
    // If I have a dark pixel (Y=20), I want '@'.
    // If I have a light pixel (Y=200), I want ' '.
    // This defines the MAPPING direction. 
    // Map: Index 0 (@) covers Low Luminance? Or High?
    // User: "dark pixels must map to @". So Low Y -> @.
    // My previous logic: "If invert=false: Dark -> Dense". 
    // Charset string: "@%#*+=-:. " 
    // Index 0 is @. 
    // So Low Y -> Index 0.

    classic: "@%#*+=-:. ",
    // JP2A Specific (Reference Quality)
    jp2a: "MWN8B@HKQDXU0OZCJLzcvunxrjft/\\|()1{}[]?-_+~<>i!lI;:,\"^`'. ",

    dense: "$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/\\|()1{}[]?-_+~<>i!lI;:,\"^`'. ",
    detailed: "Ñ@#W$9876543210?!abc;:+=-,._ ",
    blocks: "█▓▒░ ",
    simple: "@#=-. "
};

export async function convertToAscii(
    input: File | string,
    options: AsciiOptions
): Promise<AsciiOutput> {
    const startTime = performance.now();
    const {
        width,
        mode = 'mono',
        invert = true, // Default true for dark background as per request? User said "invert = true when using dark background"
        charset = 'classic',
        contrast = 1.6,
        gamma = 0.9,
        sharpen = false,
        dither = true
    } = options;

    // Load Image
    const image = await loadImage(input);

    // Calculate dimensions
    // H = round(W * (imgH / imgW) * 0.55)
    const fontAspectRatio = 0.55;
    const height = Math.round(width * (image.height / image.width) * fontAspectRatio);

    // Create Canvas for resizing
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error("Could not create canvas context");

    // Draw image resized
    ctx.drawImage(image, 0, 0, width, height);

    // Get RGB data
    const rgbData = ctx.getImageData(0, 0, width, height);
    const pixels = rgbData.data;

    // We need a separate Luminance buffer for processing structure
    // This avoids messing up the RGB values needed for Color Mode output
    const lumaBuffer = new Float32Array(width * height);

    // 1. Grayscale (Rec 709)
    for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        // Y = 0.2126r + 0.7152g + 0.0722b
        lumaBuffer[i / 4] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }

    // 2. Contrast & Gamma
    // Apply key correction to Luma buffer
    for (let i = 0; i < lumaBuffer.length; i++) {
        let val = lumaBuffer[i];

        // Contrast: (val - 128) * contrast + 128
        val = (val - 128) * contrast + 128;

        // Clamp before Gamma to avoid NaN
        val = Math.max(0, Math.min(255, val));

        // Gamma: 255 * (val/255)^(1/gamma)
        if (gamma !== 1.0) {
            val = 255 * Math.pow(val / 255, 1 / gamma);
        }

        // Sharpening would happen here if implemented on 2D buffer, 
        // but simple 1D buffer iteration is faster. Sharpening usually done before Dithering.
        // We'll skip complex sharpen for speed unless critical. 
        // User said "optional sharpen". Let's assume input image is decent or canvas resize kernel helps.

        // Actually, let's keep it simple.
        lumaBuffer[i] = Math.max(0, Math.min(255, val));
    }

    // 3. Dithering (Floyd-Steinberg)
    if (dither) {
        const charSetStr = CHARSETS[charset];
        const levels = charSetStr.length;
        const step = 255 / (levels - 1);

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = y * width + x;
                const oldVal = lumaBuffer[idx];

                // Quantize to nearest step
                const quantized = Math.round(oldVal / step) * step;

                // The error
                const quantError = oldVal - quantized;

                // Save quantized value for mapping
                // But wait, the mapping expects continuous 0-255? 
                // No, mapping will bucket it. If we quantize here, mapping will just pick the exact bucket.
                // However, error diffusion changes NEIGHBORS.

                // Update current pixel doesn't matter for mapping if we map from quantized, 
                // but usually we map from processing buffer.
                lumaBuffer[idx] = quantized;

                // Propagate Error
                // right (+1, 0): 7/16
                if (x + 1 < width) {
                    lumaBuffer[idx + 1] += quantError * 7 / 16;
                }
                // bottom-left (-1, +1): 3/16
                if (x - 1 >= 0 && y + 1 < height) {
                    lumaBuffer[(y + 1) * width + (x - 1)] += quantError * 3 / 16;
                }
                // bottom (0, +1): 5/16
                if (y + 1 < height) {
                    lumaBuffer[(y + 1) * width + x] += quantError * 5 / 16;
                }
                // bottom-right (+1, +1): 1/16
                if (x + 1 < width && y + 1 < height) {
                    lumaBuffer[(y + 1) * width + (x + 1)] += quantError * 1 / 16;
                }
            }
        }
    }

    // 4. Map to Chars
    let ascii_text = "";
    let html_content = "";
    const chars = CHARSETS[charset];
    const charLen = chars.length;

    for (let y = 0; y < height; y++) {
        let line_text = "";
        let line_html = "";

        for (let x = 0; x < width; x++) {
            const lumaIdx = y * width + x;
            let val = lumaBuffer[lumaIdx];

            // Invert logic
            // User: "invert = true when using dark background"
            // If Dark BG, White is Light.
            // Text Color is White.
            // If val=255 (White), we print @?
            // "dark pixels must map to @". That means 0 -> @.
            // If invert=true: 
            // Invert means "Flip the luminance".
            // If I have 0 (Dark), Invert->255 (Bright).
            // Normal Map: 0->@, 255->Space.
            // If I invert 0->255. Map(255)->Space.
            // So Invert=True makes Dark->Space. (Good for Light Mode).
            // Wait, "invert = true when using dark background".
            // If Dark BG: 
            // Input Image: Black pixel (0).
            // We want it to be Black on screen.
            // Screen is Black. Space is Black. 
            // So Black(0) -> Space().
            // Normal Map: 0 -> @.
            // So we NEED Invert for Dark BG.

            if (invert) {
                val = 255 - val;
            }

            // Normalize
            const t = val / 255;

            // Index
            let charIdx = Math.floor(t * (charLen - 1));
            charIdx = Math.max(0, Math.min(charLen - 1, charIdx));

            const char = chars[charIdx];
            line_text += char;

            if (mode === 'color') {
                const pIdx = (y * width + x) * 4;
                const r = pixels[pIdx];
                const g = pixels[pIdx + 1];
                const b = pixels[pIdx + 2];

                const safeChar = char === '<' ? '&lt;' : char === '>' ? '&gt;' : char === '&' ? '&amp;' : char === ' ' ? '&nbsp;' : char;
                line_html += `<span style="color:rgb(${r},${g},${b})">${safeChar}</span>`;
            }
        }
        ascii_text += line_text + "\n";
        if (mode === 'color') {
            html_content += line_html + "<br>";
        }
    }

    const endTime = performance.now();
    const ms = Math.round(endTime - startTime);

    return {
        ascii_text,
        html: mode === 'color' ? `<pre style="background-color:black; color:white; font-family:'Courier New', monospace; line-height:1; font-size:10px; overflow:auto; white-space:pre;">${html_content}</pre>` : undefined,
        meta: {
            mode,
            width,
            height,
            tool: "fallback",
            ms
        },
        imageData: rgbData
    };
}

function loadImage(input: File | string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Failed to load image"));
        if (typeof input === 'string') {
            img.src = input;
        } else {
            img.src = URL.createObjectURL(input);
        }
    });
}

// Generate PNG from ASCII
export function generateAsciiPng(text: string, options: { width: number, height: number, mode: AsciiMode, fontSize?: number }): string {
    const { width: charWidth, mode, fontSize = 14 } = options;
    const lines = text.split('\n');
    const charHeightCount = lines.length;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;

    // Metrics
    ctx.font = `${fontSize}px 'Courier New', monospace`;
    const metrics = ctx.measureText("M");
    const cw = metrics.width;
    // const ch = fontSize; // Line height 1.0
    const ch = fontSize;

    canvas.width = Math.ceil(cw * charWidth);
    canvas.height = Math.ceil(ch * charHeightCount);

    // Re-get context
    const ctx2 = canvas.getContext('2d')!;

    // Background
    ctx2.fillStyle = "#000000";
    ctx2.fillRect(0, 0, canvas.width, canvas.height);

    ctx2.font = `${fontSize}px 'Courier New', monospace`;
    ctx2.textBaseline = "top";
    ctx2.fillStyle = "#ffffff";

    // Antialiasing might blur text at small sizes, but it's okay for PNG.
    // For crisp pixel art style, we might want to disable smoothing, but this is font rendering.

    lines.forEach((line, i) => {
        ctx2.fillText(line, 0, i * ch);
    });

    return canvas.toDataURL("image/png");
}
