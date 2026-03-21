import { useState, useCallback, useRef, useEffect } from 'react';
import ReactCrop, {
    type Crop,
    type PixelCrop,
    centerCrop,
    makeAspectCrop,
} from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Button } from '@/components/ui/button';
import { X, RotateCw } from 'lucide-react';

const ASPECT_RATIO_OPTIONS = [
    { label: 'Free', value: undefined },
    { label: '1:1', value: 1 },
    { label: '16:9', value: 16 / 9 },
    { label: '4:5', value: 4 / 5 },
] as const;

interface ImageCropperModalProps {
    image: string;
    aspectRatio?: number; // 1 for avatar (square), 4 for header (wide). undefined = free
    onCropComplete: (croppedImageBlob: Blob) => void;
    onCancel: () => void;
    cropShape?: 'rect' | 'round';
    showAspectRatioSelector?: boolean;
}

function makeCenteredCrop(
    width: number,
    height: number,
    aspect: number | undefined
): Crop {
    if (aspect) {
        return centerCrop(
            makeAspectCrop({ unit: '%', width: 90 }, aspect, width, height),
            width,
            height
        );
    }
    return centerCrop(
        { unit: '%', width: 90, height: 90, x: 0, y: 0 },
        width,
        height
    );
}

export default function ImageCropperModal({
    image,
    aspectRatio,
    onCropComplete,
    onCancel,
    cropShape = 'rect',
    showAspectRatioSelector = false,
}: ImageCropperModalProps) {
    const [crop, setCrop] = useState<Crop>();
    const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
    const [rotation, setRotation] = useState(0);
    const [selectedAspect, setSelectedAspect] = useState<number | undefined>(aspectRatio);
    const [processing, setProcessing] = useState(false);
    const [rotatedImageSrc, setRotatedImageSrc] = useState<string>(image);
    const imgRef = useRef<HTMLImageElement>(null);
    const isInitialLoad = useRef(true);

    const effectiveAspect = showAspectRatioSelector ? selectedAspect : aspectRatio;

    // Generate rotated image when rotation changes
    useEffect(() => {
        if (rotation === 0) {
            setRotatedImageSrc(image);
            return;
        }

        const timer = setTimeout(() => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                if (!ctx) return;

                const rotRad = (rotation * Math.PI) / 180;
                const bBoxWidth =
                    Math.abs(Math.cos(rotRad) * img.width) +
                    Math.abs(Math.sin(rotRad) * img.height);
                const bBoxHeight =
                    Math.abs(Math.sin(rotRad) * img.width) +
                    Math.abs(Math.cos(rotRad) * img.height);

                canvas.width = bBoxWidth;
                canvas.height = bBoxHeight;

                ctx.translate(bBoxWidth / 2, bBoxHeight / 2);
                ctx.rotate(rotRad);
                ctx.translate(-img.width / 2, -img.height / 2);
                ctx.drawImage(img, 0, 0);

                setRotatedImageSrc(canvas.toDataURL('image/jpeg', 0.9));
            };
            img.src = image;
        }, 200);

        return () => clearTimeout(timer);
    }, [image, rotation]);

    // Set initial crop when image first loads
    function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
        const { width, height } = e.currentTarget;
        if (isInitialLoad.current && width > 0 && height > 0) {
            isInitialLoad.current = false;
            setCrop(makeCenteredCrop(width, height, effectiveAspect));
        }
    }

    // Reset crop when aspect ratio changes
    useEffect(() => {
        if (imgRef.current) {
            const { width, height } = imgRef.current;
            if (width > 0 && height > 0) {
                setCrop(makeCenteredCrop(width, height, effectiveAspect));
            }
        }
    }, [effectiveAspect]);

    const handleSave = async () => {
        const imageEl = imgRef.current;
        if (!imageEl || !completedCrop) return;

        setProcessing(true);
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('No 2d context');

            const scaleX = imageEl.naturalWidth / imageEl.width;
            const scaleY = imageEl.naturalHeight / imageEl.height;

            const cropWidth = completedCrop.width * scaleX;
            const cropHeight = completedCrop.height * scaleY;

            canvas.width = cropWidth;
            canvas.height = cropHeight;

            ctx.drawImage(
                imageEl,
                completedCrop.x * scaleX,
                completedCrop.y * scaleY,
                cropWidth,
                cropHeight,
                0,
                0,
                cropWidth,
                cropHeight
            );

            const blob = await new Promise<Blob>((resolve, reject) => {
                canvas.toBlob(
                    (blob) => (blob ? resolve(blob) : reject(new Error('Canvas empty'))),
                    'image/jpeg',
                    0.9
                );
            });

            onCropComplete(blob);
        } catch (error) {
            console.error('Error cropping image:', error);
        } finally {
            setProcessing(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 sm:p-4">
            <style>{`
                .ReactCrop__crop-selection {
                    border: 2px solid #22c55e !important;
                }
                .ReactCrop__drag-handle::after {
                    border-color: #22c55e !important;
                }
            `}</style>
            <div className="bg-black border-0 sm:border border-green-600 rounded-none sm:rounded-lg w-full max-w-2xl h-full sm:h-auto sm:max-h-[90vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-green-600/50 shrink-0">
                    <h3 className="ascii-highlight text-lg">Adjust Image</h3>
                    <button onClick={onCancel} className="text-green-600 hover:text-green-400">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Cropper Area */}
                <div className="relative flex-1 min-h-[50vh] bg-black overflow-hidden flex items-center justify-center p-4">
                    <ReactCrop
                        crop={crop}
                        onChange={(_, percentCrop) => setCrop(percentCrop)}
                        onComplete={(c) => setCompletedCrop(c)}
                        aspect={effectiveAspect}
                        circularCrop={cropShape === 'round'}
                    >
                        <img
                            ref={imgRef}
                            src={rotatedImageSrc}
                            alt="Crop"
                            style={{ maxHeight: '50vh', maxWidth: '100%' }}
                            onLoad={onImageLoad}
                            crossOrigin="anonymous"
                        />
                    </ReactCrop>
                </div>

                {/* Controls */}
                <div className="p-4 space-y-4 border-t border-green-600/50 shrink-0">
                    {/* Aspect Ratio Selector */}
                    {showAspectRatioSelector && (
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-green-600 font-mono shrink-0">Ratio:</span>
                            <div className="flex gap-1.5 flex-1">
                                {ASPECT_RATIO_OPTIONS.map((opt) => (
                                    <button
                                        key={opt.label}
                                        type="button"
                                        onClick={() => setSelectedAspect(opt.value)}
                                        className={`flex-1 px-2 py-1.5 text-xs font-mono rounded border transition-colors ${
                                            selectedAspect === opt.value
                                                ? 'bg-green-600 text-black border-green-500'
                                                : 'bg-black text-green-500 border-green-900/50 hover:border-green-500/50'
                                        }`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Rotation Control */}
                    <div className="flex items-center gap-4">
                        <RotateCw className="w-4 h-4 text-green-600" />
                        <input
                            type="range"
                            min={0}
                            max={360}
                            step={1}
                            value={rotation}
                            onChange={(e) => setRotation(Number(e.target.value))}
                            className="flex-1 accent-green-500"
                        />
                        <span className="ascii-dim text-xs w-12">{rotation}°</span>
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-2 pt-2">
                        <Button
                            variant="outline"
                            onClick={onCancel}
                            className="ascii-box"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSave}
                            disabled={processing || !completedCrop}
                            className="bg-green-600 hover:bg-green-500 text-black"
                        >
                            {processing ? 'Processing...' : 'Apply'}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
