import { useState, useEffect } from 'react';

interface DeviceInfo {
    isMobile: boolean;
    isIOS: boolean;
    isAndroid: boolean;
    isDesktop: boolean;
    isTouchDevice: boolean;
}

export function useDeviceDetect(): DeviceInfo {
    const [deviceInfo, setDeviceInfo] = useState<DeviceInfo>({
        isMobile: false,
        isIOS: false,
        isAndroid: false,
        isDesktop: true,
        isTouchDevice: false,
    });

    useEffect(() => {
        const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera || '';

        const isIOS = /iPad|iPhone|iPod/.test(userAgent) && !(window as any).MSStream;
        const isAndroid = /android/i.test(userAgent);
        const isMobile = isIOS || isAndroid || /webOS|BlackBerry|Opera Mini|IEMobile/i.test(userAgent);
        const isDesktop = !isMobile;
        const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

        setDeviceInfo({
            isMobile,
            isIOS,
            isAndroid,
            isDesktop,
            isTouchDevice,
        });
    }, []);

    return deviceInfo;
}

export default useDeviceDetect;
