import { useState, useEffect } from "react";
import AsciiHeader from "@/components/AsciiHeader";
import AsciiSidebar from "@/components/AsciiSidebar";
import AsciiFooter from "@/components/AsciiFooter";
import { convertToAscii, AsciiOutput, AsciiOptions, AsciiCharset, AsciiMode, generateAsciiPng } from "@/lib/ascii";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Upload, FileText, Image as ImageIcon, Copy, Check, Download, Zap, Settings2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";



export default function AsciiTools() {
    const { toast } = useToast();
    const [file, setFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [output, setOutput] = useState<AsciiOutput | null>(null);
    const [copied, setCopied] = useState(false);

    // Options
    const [width, setWidth] = useState([140]);
    const [mode, setMode] = useState<AsciiMode>('mono');
    const [invert, setInvert] = useState(true); // Default true for dark background
    const [charset, setCharset] = useState<AsciiCharset>('jp2a');
    const [contrast, setContrast] = useState([1.8]); // Default recommended 1.8
    const [gamma, setGamma] = useState([0.85]);       // Default recommended 0.85
    const [sharpen, setSharpen] = useState(true);    // Optional sharpen
    const [dither, setDither] = useState(true);      // Dithering on by default

    // Server-side toggle (Hidden or Advanced? Let's keep it automatic but tracked)
    const [useServer, setUseServer] = useState(true);

    // Debounced conversion trigger
    useEffect(() => {
        if (!file && !previewUrl) return;

        const timer = setTimeout(() => {
            handleConvert();
        }, 300); // 300ms debounce to avoid spamming server

        return () => clearTimeout(timer);
    }, [file, previewUrl, width, mode, invert, charset, contrast, gamma, sharpen, dither, useServer]);

    const resetToDefault = () => {
        setWidth([140]);
        setContrast([1.8]);
        setGamma([0.85]);
        setCharset('jp2a');
        setSharpen(true);
        setDither(true);
        setInvert(true);
        setMode('mono');
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const f = e.target.files[0];
            setFile(f);
            setPreviewUrl(URL.createObjectURL(f));
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            const f = e.dataTransfer.files[0];
            if (!f.type.startsWith("image/")) {
                toast({ title: "Invalid file", description: "Please upload an image.", variant: "destructive" });
                return;
            }
            setFile(f);
            setPreviewUrl(URL.createObjectURL(f));
        }
    };

    const handleConvert = async () => {
        if (!file && !previewUrl) return;
        setLoading(true);

        const runClientSide = async () => {
            console.log("Running Client-Side Fallback...");
            const input = file || previewUrl!;
            const res = await convertToAscii(input, {
                width: width[0],
                mode,
                invert,
                charset,
                contrast: contrast[0],
                gamma: gamma[0],
                sharpen,
                dither
            });
            setOutput(res);
        };

        // Decision Logic: Use Server if Mono, File Available, and UseServer is true.
        // If mode is color, server is skipped (as configured for mono only).
        // If file is missing (only URL), we need to fetch it or skip to client (client can handle URL). 
        // For simplicity, if we have a file object, we try server.
        if (useServer && mode === 'mono' && file) {
            try {
                const formData = new FormData();
                formData.append('file', file);

                // Note: Server currently uses fixed settings per request spec
                // But we could pass params. The user spec said:
                // "Required jp2a command: jp2a --width=120 ... "
                // It hardcoded width=120. If user slider is 200, server might mismatch?
                // "Acceptance: converting... produces... recognizable..."
                // "Fallback... if jp2a errors".
                // If I use server, I get fixed width 120 (per spec). 
                // If I want dynamic width, I should probably pass query params, 
                // but the spec was very specific on the exec command.
                // "Required jp2a command... --width=120".
                // If the user specification forces 120, then the slider doesn't affect server.
                // This might be confusing. 
                // I will try to pass width if I can, but the instruction was "Required jp2a command...".
                // I'll assume that was a BASE command, but if I can make it better I should?
                // "Use jp2a --width=120 ... input.jpg".
                // I'll stick to the Spec for the Server. The fallback will use the slider.
                // This means 'Portrait Preset' (120) matches Server.

                const response = await fetch('/api/ascii', {
                    method: 'POST',
                    body: formData
                });

                if (!response.ok) {
                    throw new Error(`Server returned ${response.status}`);
                }

                const data = await response.json();
                if (data.fallback || !data.ascii) {
                    throw new Error("Server requested fallback");
                }

                setOutput({
                    ascii_text: data.ascii,
                    meta: {
                        mode: 'mono',
                        width: 120, // Server fixed width
                        height: 0, // Unknown
                        tool: "jp2a-server",
                        ms: 0
                    }
                });
            } catch (err) {
                console.warn("Server-side generation failed, falling back to client.", err);
                await runClientSide();
            }
        } else {
            // Color mode or no file or server disabled
            await runClientSide();
        }

        setLoading(false);
    };

    const copyToClipboard = () => {
        if (!output) return;
        const text = output.ascii_text;
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        toast({ title: "Copied", description: "ASCII text copied to clipboard." });
    };

    const downloadTxt = () => {
        if (!output) return;
        const blob = new Blob([output.ascii_text], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `ascii_art_${Date.now()}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const downloadPng = () => {
        if (!output) return;
        const dataUrl = generateAsciiPng(output.ascii_text, {
            width: output.meta.width,
            height: output.ascii_text.split('\n').length,
            mode
        });
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = `ascii_art_${Date.now()}.png`;
        a.click();
    };

    return (
        <div className="min-h-screen bg-background flex flex-col items-center px-4 py-4 font-mono">
            <div className="w-full max-w-7xl mx-auto flex-1 flex flex-col">
                <AsciiHeader />

                <div className="flex flex-col lg:flex-row gap-8 flex-1 mt-6">
                    {/* Sidebar */}
                    <div className="w-full lg:w-64 flex-shrink-0">
                        <AsciiSidebar />
                    </div>

                    {/* Main Content */}
                    <div className="flex-1 min-w-0 flex flex-col gap-6">

                        <div className="flex items-center justify-between">
                            <h1 className="text-2xl ascii-highlight flex items-center gap-2">
                                <FileText className="w-6 h-6" />
                                Terminal Art
                            </h1>
                            <div className="text-xs ascii-dim flex gap-4">
                                <span className={cn(output?.meta.tool === 'jp2a-server' ? "text-green-500 font-bold" : "opacity-50")}>
                                    SERVER {output?.meta.tool === 'jp2a-server' ? "ACTIVE" : ""}
                                </span>
                                <span className={cn(output?.meta.tool === 'fallback' ? "text-yellow-500 font-bold" : "opacity-50")}>
                                    CLIENT {output?.meta.tool === 'fallback' ? "ACTIVE" : ""}
                                </span>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                            {/* Controls Panel */}
                            <div className="xl:col-span-1 space-y-6">
                                <Card className="bg-black/40 border-green-900/50">
                                    <CardContent className="p-6 space-y-6">
                                        {/* Upload Zone */}
                                        <div
                                            className="border-2 border-dashed border-green-800 rounded-lg p-8 text-center hover:bg-green-900/10 transition-colors cursor-pointer relative group"
                                            onDragOver={(e) => e.preventDefault()}
                                            onDrop={handleDrop}
                                        >
                                            <input
                                                type="file"
                                                accept="image/*"
                                                className="absolute inset-0 opacity-0 cursor-pointer z-10"
                                                onChange={handleFileChange}
                                            />
                                            {file ? (
                                                <div className="flex flex-col items-center">
                                                    <img src={previewUrl!} alt="Preview" className="h-32 w-auto object-contain mb-2 rounded border border-green-700 max-w-full" />
                                                    <span className="text-xs text-green-400 truncate w-full">{file.name}</span>
                                                    <div className="mt-2 text-xs ascii-dim bg-black/50 px-2 py-1 rounded">Click to change</div>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col items-center text-green-600 group-hover:text-green-400 transition-colors">
                                                    <Upload className="w-10 h-10 mb-2" />
                                                    <span className="text-sm font-bold">DRAG PHOTO HERE</span>
                                                    <span className="text-xs mt-1 opacity-70">or click to browse</span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Advanced Controls */}
                                        <div className="space-y-4 pt-4 border-t border-green-900/30">
                                            <div className="flex items-center justify-between text-green-500 mb-2">
                                                <div className="flex items-center gap-2">
                                                    <Settings2 className="w-4 h-4" />
                                                    <span className="text-sm font-bold">Settings</span>
                                                </div>
                                                <Button size="sm" variant="ghost" className="h-6 text-[10px] text-green-600 hover:text-green-400" onClick={resetToDefault}>
                                                    Reset
                                                </Button>
                                            </div>

                                            {/* Width */}
                                            <div className="space-y-2">
                                                <div className="flex justify-between text-xs text-green-400">
                                                    <Label>Resolution (Width)</Label>
                                                    <span>{width[0]} chars</span>
                                                </div>
                                                <Slider value={width} onValueChange={(v) => { setWidth(v); }} max={300} min={40} step={5} />
                                            </div>

                                            {/* Contrast */}
                                            <div className="space-y-2">
                                                <div className="flex justify-between text-xs text-green-400">
                                                    <Label>Contrast Factor</Label>
                                                    <span>{contrast[0]}x</span>
                                                </div>
                                                <Slider value={contrast} onValueChange={(v) => { setContrast(v); }} max={3.0} min={0.5} step={0.1} />
                                            </div>

                                            {/* Gamma */}
                                            <div className="space-y-2">
                                                <div className="flex justify-between text-xs text-green-400">
                                                    <Label>Gamma Correction</Label>
                                                    <span>{gamma[0]}</span>
                                                </div>
                                                <Slider value={gamma} onValueChange={(v) => { setGamma(v); }} max={2.5} min={0.1} step={0.1} />
                                            </div>

                                            {/* Switches */}
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="flex items-center justify-between">
                                                    <Label className="text-xs">Sharpen</Label>
                                                    <Switch checked={sharpen} onCheckedChange={(v) => { setSharpen(v); }} />
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <Label className="text-xs">Dither</Label>
                                                    <Switch checked={dither} onCheckedChange={(v) => { setDither(v); }} />
                                                </div>
                                                <div className="flex items-center justify-between col-span-2">
                                                    <Label className="text-xs">Invert (Dark Mode)</Label>
                                                    <Switch checked={invert} onCheckedChange={(v) => { setInvert(v); }} />
                                                </div>

                                                <div className="flex items-center justify-between col-span-2 pt-2 border-t border-green-900/30">
                                                    <Label className="text-xs">Use Server (High Quality)</Label>
                                                    <Switch checked={useServer} onCheckedChange={setUseServer} />
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <Label className="text-xs">Charset</Label>
                                                <Select value={charset} onValueChange={(v: AsciiCharset) => { setCharset(v); }}>
                                                    <SelectTrigger className="bg-black border-green-800 text-green-400 h-8 text-xs">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-black border-green-800 text-green-400">
                                                        <SelectItem value="jp2a">JP2A Extended (Best)</SelectItem>
                                                        <SelectItem value="classic">Classic (@%#*)</SelectItem>
                                                        <SelectItem value="detailed">Detailed (Faces)</SelectItem>
                                                        <SelectItem value="dense">Dense ($@B%)</SelectItem>
                                                        <SelectItem value="blocks">Blocks</SelectItem>
                                                        <SelectItem value="simple">Simple</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            <div className="flex items-center justify-between pt-2">
                                                <Label className="text-xs">Color Output</Label>
                                                <Switch
                                                    checked={mode === 'color'}
                                                    onCheckedChange={(checked) => { setMode(checked ? 'color' : 'mono'); }}
                                                />
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>

                            {/* Preview Panel */}
                            <div className="xl:col-span-2 h-[600px] xl:h-[900px] relative border border-green-800 rounded-lg overflow-hidden bg-black flex flex-col">
                                {output ? (
                                    <>
                                        <div className="absolute top-2 right-2 z-10 flex gap-2">
                                            <Button size="sm" variant="outline" className="h-8 border-green-700 bg-black hover:bg-green-900" onClick={copyToClipboard}>
                                                {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
                                                {copied ? "Copied" : "Copy"}
                                            </Button>
                                        </div>

                                        {/* Download Toolbar */}
                                        <div className="absolute bottom-4 right-4 z-10 flex gap-2">
                                            <Button size="sm" variant="default" className="h-8 bg-green-700 hover:bg-green-600 text-white" onClick={downloadTxt}>
                                                <Download className="w-4 h-4 mr-2" />
                                                TXT
                                            </Button>
                                            <Button size="sm" variant="default" className="h-8 bg-blue-700 hover:bg-blue-600 text-white" onClick={downloadPng}>
                                                <Download className="w-4 h-4 mr-2" />
                                                PNG
                                            </Button>
                                        </div>

                                        <ScrollArea className="flex-1 w-full h-full p-4">
                                            {mode === 'color' && output.html ? (
                                                <div
                                                    dangerouslySetInnerHTML={{ __html: output.html! }}
                                                    style={{ lineHeight: 1, letterSpacing: 0, fontFamily: '"Courier New", Courier, monospace', fontSize: '10px' }}
                                                />
                                            ) : (
                                                <pre className="text-[10px] leading-[1] font-white whitespace-pre text-white origin-top-left" style={{ fontFamily: '"Courier New", Courier, monospace' }}>
                                                    {output.ascii_text}
                                                </pre>
                                            )}
                                        </ScrollArea>
                                    </>
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-green-900/40">
                                        <div className="text-center">
                                            <ImageIcon className="w-16 h-16 mx-auto mb-4" />
                                            <div>Ready to process</div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
                <AsciiFooter />
            </div>
        </div>
    );
}
