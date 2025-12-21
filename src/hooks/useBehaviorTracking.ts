import { useState, useEffect, useCallback, useRef } from 'react';

interface BehaviorMetrics {
    focusTime: number;           // Time from page load/focus to action (ms)
    copyPasteCount: number;      // Number of paste events detected
    typingSpeed: number;         // Characters per minute
    idleTime: number;            // Time spent idle (ms)
    scrollDepth: number;         // Max scroll percentage
    mouseMovements: number;      // Number of mouse movements
}

interface UseBehaviorTrackingResult {
    metrics: BehaviorMetrics;
    startTracking: () => void;
    stopTracking: () => BehaviorMetrics;
    recordPaste: () => void;
    recordTyping: (charCount: number) => void;
}

export function useBehaviorTracking(): UseBehaviorTrackingResult {
    const [metrics, setMetrics] = useState<BehaviorMetrics>({
        focusTime: 0,
        copyPasteCount: 0,
        typingSpeed: 0,
        idleTime: 0,
        scrollDepth: 0,
        mouseMovements: 0,
    });

    const trackingRef = useRef<{
        startTime: number;
        lastActivityTime: number;
        charCount: number;
        typingStartTime: number;
        mouseCount: number;
        maxScroll: number;
        isTracking: boolean;
        pasteCount: number;
    }>({
        startTime: 0,
        lastActivityTime: 0,
        charCount: 0,
        typingStartTime: 0,
        mouseCount: 0,
        maxScroll: 0,
        isTracking: false,
        pasteCount: 0,
    });

    // Handle mouse movement
    const handleMouseMove = useCallback(() => {
        if (trackingRef.current.isTracking) {
            trackingRef.current.mouseCount++;
            trackingRef.current.lastActivityTime = Date.now();
        }
    }, []);

    // Handle scroll
    const handleScroll = useCallback(() => {
        if (trackingRef.current.isTracking) {
            const scrollPercent = (window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100;
            trackingRef.current.maxScroll = Math.max(trackingRef.current.maxScroll, scrollPercent || 0);
            trackingRef.current.lastActivityTime = Date.now();
        }
    }, []);

    // Handle paste event
    const handlePaste = useCallback(() => {
        if (trackingRef.current.isTracking) {
            trackingRef.current.pasteCount++;
            setMetrics(prev => ({ ...prev, copyPasteCount: prev.copyPasteCount + 1 }));
        }
    }, []);

    // Start tracking
    const startTracking = useCallback(() => {
        const now = Date.now();
        trackingRef.current = {
            startTime: now,
            lastActivityTime: now,
            charCount: 0,
            typingStartTime: now,
            mouseCount: 0,
            maxScroll: 0,
            isTracking: true,
            pasteCount: 0,
        };

        // Add event listeners
        window.addEventListener('mousemove', handleMouseMove, { passive: true });
        window.addEventListener('scroll', handleScroll, { passive: true });
        document.addEventListener('paste', handlePaste);
    }, [handleMouseMove, handleScroll, handlePaste]);

    // Stop tracking and return final metrics
    const stopTracking = useCallback((): BehaviorMetrics => {
        const now = Date.now();
        const ref = trackingRef.current;

        const focusTime = now - ref.startTime;
        const idleTime = now - ref.lastActivityTime;
        const typingDuration = (now - ref.typingStartTime) / 60000; // in minutes
        const typingSpeed = typingDuration > 0 ? Math.round(ref.charCount / typingDuration) : 0;

        const finalMetrics: BehaviorMetrics = {
            focusTime,
            copyPasteCount: ref.pasteCount,
            typingSpeed,
            idleTime,
            scrollDepth: Math.round(ref.maxScroll),
            mouseMovements: ref.mouseCount,
        };

        // Remove event listeners
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('scroll', handleScroll);
        document.removeEventListener('paste', handlePaste);

        ref.isTracking = false;
        setMetrics(finalMetrics);

        return finalMetrics;
    }, [handleMouseMove, handleScroll, handlePaste]);

    // Record paste event manually (for controlled inputs)
    const recordPaste = useCallback(() => {
        trackingRef.current.pasteCount++;
        setMetrics(prev => ({ ...prev, copyPasteCount: prev.copyPasteCount + 1 }));
    }, []);

    // Record typing activity
    const recordTyping = useCallback((charCount: number) => {
        trackingRef.current.charCount += charCount;
        trackingRef.current.lastActivityTime = Date.now();
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (trackingRef.current.isTracking) {
                window.removeEventListener('mousemove', handleMouseMove);
                window.removeEventListener('scroll', handleScroll);
                document.removeEventListener('paste', handlePaste);
            }
        };
    }, [handleMouseMove, handleScroll, handlePaste]);

    return {
        metrics,
        startTracking,
        stopTracking,
        recordPaste,
        recordTyping,
    };
}

export default useBehaviorTracking;
