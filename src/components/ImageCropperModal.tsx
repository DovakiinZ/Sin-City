import { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import type { Area, Point } from 'react-easy-crop';
import { Button } from '@/components/ui/button';
import { X, ZoomIn, ZoomOut, RotateCw } from 'lucide-react';

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

// Utility function to create cropped image
async function getCroppedImg(
    imageSrc: string,
    pixelCrop: Area,
    rotation: number = 0
): Promise<Blob> {
    const image = await createImage(imageSrc);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
        throw new Error('No 2d context');
    }

    const rotRad = getRadianAngle(rotation);

    // Calculate bounding box of the rotated image
    const { width: bBoxWidth, height: bBoxHeight } = rotateSize(
        image.width,
        image.height,
        rotation
    );

    // Set canvas size to match the bounding box
    canvas.width = bBoxWidth;
    canvas.height = bBoxHeight;

    // Translate canvas context to center of canvas and rotate
    ctx.translate(bBoxWidth / 2, bBoxHeight / 2);
    ctx.rotate(rotRad);
    ctx.translate(-image.width / 2, -image.height / 2);

    // Draw rotated image
    ctx.drawImage(image, 0, 0);

    // Extract the cropped portion
    const data = ctx.getImageData(
        pixelCrop.x,
        pixelCrop.y,
        pixelCrop.width,
        pixelCrop.height
    );

    // Set canvas to final crop size
    canvas.width = pixelCrop.width;
    canvas.height = pixelCrop.height;

    // Put the cropped data
    ctx.putImageData(data, 0, 0);

    // Return as blob
    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) => {
                if (blob) {
                    resolve(blob);
                } else {
                    reject(new Error('Canvas is empty'));
                }
            },
            'image/jpeg',
            0.9
        );
    });
}

function createImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.addEventListener('load', () => resolve(image));
        image.addEventListener('error', (error) => reject(error));
        image.setAttribute('crossOrigin', 'anonymous');
        image.src = url;
    });
}

function getRadianAngle(degreeValue: number): number {
    return (degreeValue * Math.PI) / 180;
}

function rotateSize(width: number, height: number, rotation: number) {
    const rotRad = getRadianAngle(rotation);
    return {
        width:
            Math.abs(Math.cos(rotRad) * width) + Math.abs(Math.sin(rotRad) * height),
        height:
            Math.abs(Math.sin(rotRad) * width) + Math.abs(Math.cos(rotRad) * height),
    };
}

export default function ImageCropperModal({
    image,
    aspectRatio,
    onCropComplete,
    onCancel,
    cropShape = 'rect',
    showAspectRatioSelector = false,
}: ImageCropperModalProps) {
    const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [rotation, setRotation] = useState(0);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
    const [processing, setProcessing] = useState(false);
    const [selectedAspect, setSelectedAspect] = useState<number | undefined>(aspectRatio);

    const effectiveAspect = showAspectRatioSelector ? selectedAspect : aspectRatio;

    const onCropChange = useCallback((location: Point) => {
        setCrop(location);
    }, []);

    const onZoomChange = useCallback((zoomValue: number) => {
        setZoom(zoomValue);
    }, []);

    const onCropCompleteInternal = useCallback(
        (_croppedArea: Area, croppedAreaPixels: Area) => {
            setCroppedAreaPixels(croppedAreaPixels);
        },
        []
    );

    const handleSave = async () => {
        if (!croppedAreaPixels) return;

        setProcessing(true);
        try {
            const croppedBlob = await getCroppedImg(image, croppedAreaPixels, rotation);
            onCropComplete(croppedBlob);
        } catch (error) {
            console.error('Error cropping image:', error);
        } finally {
            setProcessing(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 sm:p-4">
            <div className="bg-black border-0 sm:border border-green-600 rounded-none sm:rounded-lg w-full max-w-2xl h-full sm:h-auto sm:max-h-[90vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-green-600/50 shrink-0">
                    <h3 className="ascii-highlight text-lg">Adjust Image</h3>
                    <button onClick={onCancel} className="text-green-600 hover:text-green-400">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Cropper Area */}
                <div className="relative flex-1 min-h-[50vh] bg-black touch-none">
                    <Cropper
                        image={image}
                        crop={crop}
                        zoom={zoom}
                        rotation={rotation}
                        aspect={effectiveAspect}
                        cropShape={cropShape}
                        onCropChange={onCropChange}
                        onZoomChange={onZoomChange}
                        onCropComplete={onCropCompleteInternal}
                        classes={{
                            containerClassName: 'bg-black',
                            cropAreaClassName: 'border-2 border-green-500',
                            mediaClassName: 'object-contain', // Ensure image is contained
                        }}
                    />
                </div>

                {/* Controls */}
                <div className="p-4 space-y-4 border-t border-green-600/50">
                    {/* Aspect Ratio Selector */}
                    {showAspectRatioSelector && (
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-green-600 font-mono shrink-0">Ratio:</span>
                            <div className="flex gap-1.5 flex-1">
                                {ASPECT_RATIO_OPTIONS.map((opt) => (
                                    <button
                                        key={opt.label}
                                        type="button"
                                        onClick={() => {
                                            setSelectedAspect(opt.value);
                                            setCrop({ x: 0, y: 0 });
                                            setZoom(1);
                                        }}
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

                    {/* Zoom Control */}
                    <div className="flex items-center gap-4">
                        <ZoomOut className="w-4 h-4 text-green-600" />
                        <input
                            type="range"
                            min={1}
                            max={3}
                            step={0.1}
                            value={zoom}
                            onChange={(e) => setZoom(Number(e.target.value))}
                            className="flex-1 accent-green-500"
                        />
                        <ZoomIn className="w-4 h-4 text-green-600" />
                    </div>

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
                            disabled={processing}
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
