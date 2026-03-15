import { useState, useCallback, useRef } from 'react';

/**
 * Hook to manage image cropping queue.
 * Separates files into croppable (static images) and non-croppable (videos, GIFs).
 * Shows cropper for each croppable image one by one.
 */
export function useImageCropper() {
    const [cropperImage, setCropperImage] = useState<string | null>(null);
    const queueRef = useRef<File[]>([]);
    const [remainingCount, setRemainingCount] = useState(0);

    /**
     * Separate files into croppable and non-croppable.
     * Opens the cropper for the first croppable image.
     * Returns the files that should skip cropping (videos, GIFs).
     */
    const processFiles = useCallback((files: File[]): File[] => {
        const skipFiles: File[] = [];
        const cropFiles: File[] = [];

        for (const file of files) {
            const isStaticImage = file.type.startsWith('image/') && file.type !== 'image/gif';
            if (isStaticImage) {
                cropFiles.push(file);
            } else {
                skipFiles.push(file);
            }
        }

        if (cropFiles.length > 0) {
            const [first, ...rest] = cropFiles;
            queueRef.current = rest;
            setRemainingCount(rest.length);
            setCropperImage(URL.createObjectURL(first));
        }

        return skipFiles;
    }, []);

    /** Advance to next file in queue or close cropper */
    const advanceQueue = useCallback(() => {
        if (cropperImage) URL.revokeObjectURL(cropperImage);

        if (queueRef.current.length > 0) {
            const next = queueRef.current.shift()!;
            setRemainingCount(queueRef.current.length);
            setCropperImage(URL.createObjectURL(next));
        } else {
            setCropperImage(null);
            setRemainingCount(0);
        }
    }, [cropperImage]);

    /** Cancel cropping and clear queue */
    const cancelCrop = useCallback(() => {
        if (cropperImage) URL.revokeObjectURL(cropperImage);
        queueRef.current = [];
        setCropperImage(null);
        setRemainingCount(0);
    }, [cropperImage]);

    return {
        cropperImage,
        isCropping: !!cropperImage,
        remainingCount,
        processFiles,
        advanceQueue,
        cancelCrop,
    };
}
