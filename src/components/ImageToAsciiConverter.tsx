import { useState, useRef, ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Upload, Copy, Check, Download } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { convertImageToAscii } from "image-to-ascii-art";

const ASCII_CHARS = "@%#*+=-:. ";
const ASCII_CHARS_BW = "█▓▒░ ";

export default function ImageToAsciiConverter() {
    const [asciiArt, setAsciiArt] = useState<string>("");
    const [isProcessing, setIsProcessing] = useState(false);
    const [width, setWidth] = useState(100);
    const [copied, setCopied] = useState(false);
    const [blackAndWhite, setBlackAndWhite] = useState(true);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [bwImageSrc, setBwImageSrc] = useState<string | null>(null);

    const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = async (event) => {
                const result = event.target?.result as string;
                setImageSrc(result);
                await convertToAscii(result);
            };
            reader.readAsDataURL(file);
        }
    };

    const generateBWImage = (imgSrc: string): Promise<string> => {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement("canvas");
                const ctx = canvas.getContext("2d");

                if (!ctx) {
                    resolve(imgSrc);
                    return;
                }

                canvas.width = img.width;
                canvas.height = img.height;

                ctx.drawImage(img, 0, 0);

                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const data = imageData.data;

                // Convert to grayscale
                for (let i = 0; i < data.length; i += 4) {
                    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                    data[i] = gray;
                    data[i + 1] = gray;
                    data[i + 2] = gray;
                }

                ctx.putImageData(imageData, 0, 0);
                resolve(canvas.toDataURL());
            };
            img.src = imgSrc;
        });
    };

    const convertToAscii = async (imgSrc: string) => {
        setIsProcessing(true);
        try {
            // Generate B&W image if needed
            if (blackAndWhite) {
                const bwImg = await generateBWImage(imgSrc);
                setBwImageSrc(bwImg);
            } else {
                setBwImageSrc(null);
            }

            // Create image element
            const img = new Image();
            img.crossOrigin = "anonymous";

            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = imgSrc;
            });

            // Convert using image-to-ascii-art
            const ascii = await convertImageToAscii(img, {
                width: width,
                chars: blackAndWhite ? ASCII_CHARS_BW : ASCII_CHARS,
            });

            setAsciiArt(ascii);
        } catch (error) {
            console.error('Error converting to ASCII:', error);
            setAsciiArt('Error converting image. Please try another image.');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleSettingsChange = async () => {
        if (imageSrc) {
            await convertToAscii(imageSrc);
        }
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
                                onCheckedChange={(checked) => {
                                    setBlackAndWhite(checked);
                                    setTimeout(() => handleSettingsChange(), 100);
                                }}
                                className="data-[state=checked]:bg-ascii-highlight"
                            />
                            <label className="text-sm ascii-text cursor-pointer" onClick={() => {
                                setBlackAndWhite(!blackAndWhite);
                                setTimeout(() => handleSettingsChange(), 100);
                            }}>
                                Black & White Mode
                            </label>
                        </div>
                        {blackAndWhite && (
                            <span className="text-xs ascii-dim">Optimized for monochrome</span>
                        )}
                    </div>

                    {/* Settings */}
                    <div className="bg-black/20 p-4 rounded border border-ascii-border">
                        <div className="space-y-2">
                            <div className="flex justify-between">
                                <label className="text-xs ascii-dim">Width</label>
                                <span className="text-xs ascii-highlight">{width} chars</span>
                            </div>
                            <Slider
                                value={[width]}
                                min={40}
                                max={200}
                                step={10}
                                onValueChange={(val) => setWidth(val[0])}
                                onValueCommit={() => handleSettingsChange()}
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
                                <pre className="text-black bg-white text-[6px] leading-[6px] overflow-auto p-4 border border-gray-300 min-h-[200px] max-h-[300px] font-mono whitespace-pre">
                                    {isProcessing ? 'Converting...' : asciiArt}
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
                            <pre className="text-black bg-white text-[8px] leading-[8px] overflow-x-auto p-4 border border-gray-300 min-h-[200px] flex justify-center font-mono whitespace-pre">
                                {isProcessing ? 'Converting...' : asciiArt}
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
