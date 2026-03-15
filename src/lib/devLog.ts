const isDev = import.meta.env.DEV;

export const devLog = (...args: any[]) => { if (isDev) console.log(...args); };
export const devWarn = (...args: any[]) => { if (isDev) console.warn(...args); };
export const devError = (...args: any[]) => { if (isDev) console.error(...args); };
