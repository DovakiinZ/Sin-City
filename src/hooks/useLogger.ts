import { useMemo } from 'react';

/**
 * A hook for secure logging.
 * Logs are visible if the environment is Development OR if explicitly enabled (e.g., for Admins).
 * 
 * @param enabled - Force enable logs (e.g. if user is Admin). Default false.
 */
export function useLogger(enabled: boolean = false) {
    // Vite exposes env variables on import.meta.env
    // .DEV is true during development
    const isDev = import.meta.env.DEV;
    const shouldLog = isDev || enabled;

    return useMemo(() => ({
        log: (...args: any[]) => {
            if (shouldLog) console.log(...args);
        },
        error: (...args: any[]) => {
            if (shouldLog) console.error(...args);
        },
        warn: (...args: any[]) => {
            if (shouldLog) console.warn(...args);
        },
        info: (...args: any[]) => {
            if (shouldLog) console.info(...args);
        },
        debug: (...args: any[]) => {
            if (shouldLog) console.debug(...args);
        }
    }), [shouldLog]);
}
