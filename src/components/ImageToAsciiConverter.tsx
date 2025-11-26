import { useState, useRef, ChangeEvent, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Upload, Copy, Check, Download } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";

const ASCII_CHARS = "@%#*+=-:. ";
const ASCII_CHARS_BW = "█▓▒░ "; // Better for black & white

export default function ImageToAsciiConverter() {
    const [asciiArt, setAsciiArt] = useState<string>("");
    const [isProcessing, setIsProcessing] = useState(false);
    const [width, setWidth] = useState(100);
    const [contrast, setContrast] = useState(1);
    const [copied, setCopied] = useState(false);
    const [blackAndWhite, setBlackAndWhite] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [bwImageSrc, setBwImageSrc] = useState<string | null>(null);

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
                if (blackAndWhite) {
                    generateBWImage(img);
                }
                setIsProcessing(false);
            };
            img.src = imageSrc;
        } else {
            setAsciiArt("");
            setBwImageSrc(null);
        }
    }, [imageSrc, width, contrast, blackAndWhite]);

    const generateBWImage = (img: HTMLImageElement) => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        if (!ctx) return;

        canvas.width = img.width;
        canvas.height = img.height;

        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // Convert to grayscale
        for (let i = 0; i < data.length; i += 4) {
            const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            data[i] = gray;     // R
            data[i + 1] = gray; // G
            data[i + 2] = gray; // B
        }

        ctx.putImageData(imageData, 0, 0);
        setBwImageSrc(canvas.toDataURL());
    };

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
        const chars = blackAndWhite ? ASCII_CHARS_BW : ASCII_CHARS;

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
                const charIndex = Math.floor((clamped / 255) * (chars.length - 1));
                asciiStr += chars[chars.length - 1 - charIndex];
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

    const downloadAsciiArt = () => {
        const blob = new Blob([asciiArt], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ascii-art-${Date.now()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const downloadBWImage = () => {
        if (!bwImageSrc) return;

        const a = document.createElement('a');
        a.href = bwImageSrc;
        a.download = `bw-image-${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
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
                    {/* Black & White Toggle */}
                    <div className="flex items-center justify-between bg-black/20 p-4 rounded border border-ascii-border">
                        <div className="flex items-center gap-3">
                            <Switch
                                checked={blackAndWhite}
                                onCheckedChange={setBlackAndWhite}
                                className="data-[state=checked]:bg-ascii-highlight"
                            />
                            <label className="text-sm ascii-text cursor-pointer" onClick={() => setBlackAndWhite(!blackAndWhite)}>
                                Black & White Mode
                            </label>
                        </div>
                        {blackAndWhite && (
                            <span className="text-xs ascii-dim">Using optimized B&W characters</span>
                        )}
                    </div>

                    {/* Settings */}
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

                    {/* Preview Grid */}
                    {blackAndWhite && bwImageSrc && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <label className="text-xs ascii-highlight">B&W Preview</label>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={downloadBWImage}
                                        className="h-7 text-xs hover:bg-ascii-highlight hover:text-black"
                                    >
                                        <Download className="w-3 h-3 mr-1" />
                                        Download PNG
                                    </Button>
                                </div>
                                <div className="border border-ascii-border bg-black/40 p-2 flex justify-center items-center min-h-[200px]">
                                    <img src={bwImageSrc} alt="B&W Preview" className="max-w-full max-h-[300px] object-contain" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <label className="text-xs ascii-highlight">ASCII Output</label>
                                    <div className="flex gap-1">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={copyToClipboard}
                                            className="h-7 text-xs hover:bg-ascii-highlight hover:text-black"
                                        >
                                            {copied ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
                                            Copy
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={downloadAsciiArt}
                                            className="h-7 text-xs hover:bg-ascii-highlight hover:text-black"
                                        >
                                            <Download className="w-3 h-3 mr-1" />
                                            Download TXT
                                        </Button>
                                    </div>
                                </div>
                                <pre className="ascii-text text-[6px] leading-[6px] overflow-auto p-4 bg-black/40 border border-ascii-border min-h-[200px] max-h-[300px]">
                                    {asciiArt}
                                </pre>
                            </div>
                        </div>
                    )}

                    {/* ASCII Output (non-BW mode) */}
                    {!blackAndWhite && (
                        <div className="relative group">
                            <div className="flex gap-2 absolute top-2 right-2 z-10">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={copyToClipboard}
                                    className="opacity-50 group-hover:opacity-100 transition-opacity bg-black/50 hover:bg-ascii-highlight hover:text-black h-8 w-8"
                                >
                                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={downloadAsciiArt}
                                    className="opacity-50 group-hover:opacity-100 transition-opacity bg-black/50 hover:bg-ascii-highlight hover:text-black h-8 w-8"
                                >
                                    <Download className="w-4 h-4" />
                                </Button>
                            </div>
                            <pre className="ascii-text text-[8px] leading-[8px] overflow-x-auto p-4 bg-black/40 border border-ascii-border min-h-[200px] flex justify-center">
                                {asciiArt}
                            </pre>
                        </div>
                    )}
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
