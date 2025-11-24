import { useState, useRef, ChangeEvent, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Upload, Copy, Check } from "lucide-react";
import { Slider } from "@/components/ui/slider";

const ASCII_CHARS = "@%#*+=-:. ";

export default function ImageToAsciiConverter() {
    const [asciiArt, setAsciiArt] = useState<string>("");
    const [isProcessing, setIsProcessing] = useState(false);
    const [width, setWidth] = useState(100);
    const [contrast, setContrast] = useState(1);
    const [copied, setCopied] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [imageSrc, setImageSrc] = useState<string | null>(null);

    const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const result = event.target?.result as string;
                setImageSrc(result);
            };
            reader.readAsDataURL(file);
        }
    };

    // Re-process when image or settings change
    useEffect(() => {
        if (imageSrc) {
            setIsProcessing(true);
            const img = new Image();
            img.onload = () => {
                convertToAscii(img);
                setIsProcessing(false);
            };
            img.src = imageSrc;
        } else {
            setAsciiArt("");
        }
    }, [imageSrc, width, contrast]);

    const convertToAscii = (img: HTMLImageElement) => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        if (!ctx) return;

        // Calculate dimensions
        const aspectRatio = img.height / img.width;
        const finalWidth = width;
        // Font aspect ratio correction (approx 0.55)
        const finalHeight = Math.floor(finalWidth * aspectRatio * 0.55);

        canvas.width = finalWidth;
        canvas.height = finalHeight;

        ctx.drawImage(img, 0, 0, finalWidth, finalHeight);

        const imageData = ctx.getImageData(0, 0, finalWidth, finalHeight);
        const data = imageData.data;

        let asciiStr = "";

        for (let i = 0; i < finalHeight; i++) {
            for (let j = 0; j < finalWidth; j++) {
                const offset = (i * finalWidth + j) * 4;
                const r = data[offset];
                const g = data[offset + 1];
                const b = data[offset + 2];

                // Calculate brightness
                const brightness = (0.299 * r + 0.587 * g + 0.114 * b);

                // Apply contrast
                const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
                const contrasted = factor * (brightness - 128) + 128;
                const clamped = Math.max(0, Math.min(255, contrasted));

                // Map to char
                const charIndex = Math.floor((clamped / 255) * (ASCII_CHARS.length - 1));
                asciiStr += ASCII_CHARS[ASCII_CHARS.length - 1 - charIndex];
            }
            asciiStr += "\n";
        }

        setAsciiArt(asciiStr);
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(asciiArt);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const triggerFileInput = () => {
        fileInputRef.current?.click();
    };

    return (
        <div className="ascii-box p-6 space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="ascii-highlight text-lg font-bold">Image to ASCII Converter</h2>
                <div className="flex gap-2">
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        accept="image/*"
                        className="hidden"
                    />
                    <Button
                        variant="outline"
                        onClick={triggerFileInput}
                        className="ascii-button border-ascii-border hover:bg-ascii-highlight hover:text-black"
                    >
                        <Upload className="w-4 h-4 mr-2" />
                        {imageSrc ? "Change Image" : "Upload Image"}
                    </Button>
                </div>
            </div>

            {imageSrc && (
                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-black/20 p-4 rounded border border-ascii-border">
                        <div className="space-y-2">
                            <div className="flex justify-between">
                                <label className="text-xs ascii-dim">Width</label>
                                <span className="text-xs ascii-highlight">{width} chars</span>
                            </div>
                            <Slider
                                value={[width]}
                                min={20}
                                max={200}
                                step={1}
                                onValueChange={(val) => setWidth(val[0])}
                                className="w-full"
                            />
                        </div>
                        <div className="space-y-2">
                            <div className="flex justify-between">
                                <label className="text-xs ascii-dim">Contrast</label>
                                <span className="text-xs ascii-highlight">{contrast}</span>
                            </div>
                            <Slider
                                value={[contrast]}
                                min={-100}
                                max={100}
                                step={10}
                                onValueChange={(val) => setContrast(val[0])}
                                className="w-full"
                            />
                        </div>
                    </div>

                    <div className="relative group">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={copyToClipboard}
                            className="absolute top-2 right-2 opacity-50 group-hover:opacity-100 transition-opacity bg-black/50 hover:bg-ascii-highlight hover:text-black z-10"
                        >
                            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        </Button>
                        <pre className="ascii-text text-[8px] leading-[8px] overflow-x-auto p-4 bg-black/40 border border-ascii-border min-h-[200px] flex justify-center">
                            {asciiArt}
                        </pre>
                    </div>
                </div>
            )}

            {!imageSrc && (
                <div
                    className="border-2 border-dashed border-ascii-border p-12 text-center cursor-pointer hover:bg-ascii-highlight/5 transition-colors"
                    onClick={triggerFileInput}
                >
                    <div className="ascii-dim mb-2">
                        {isProcessing ? "Processing..." : "Drop an image here or click to upload"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                        Supports JPG, PNG, GIF
                    </div>
                </div>
            )}
        </div>
    );
}
