// Polyfills for browser compatibility (required by gray-matter)
if (typeof window !== 'undefined') {
    (window as any).global = window;

    // Buffer polyfill for gray-matter
    if (typeof (window as any).Buffer === 'undefined') {
        (window as any).Buffer = {
            isBuffer: function (obj: any) {
                return obj && obj._isBuffer === true;
            },
            from: function (data: any, encoding?: string) {
                if (typeof data === 'string') {
                    const encoder = new TextEncoder();
                    return encoder.encode(data);
                }
                return new Uint8Array(data);
            },
            alloc: function (size: number) {
                return new Uint8Array(size);
            },
            allocUnsafe: function (size: number) {
                return new Uint8Array(size);
            },
            concat: function (list: Uint8Array[]) {
                const totalLength = list.reduce((acc, arr) => acc + arr.length, 0);
                const result = new Uint8Array(totalLength);
                let offset = 0;
                for (const arr of list) {
                    result.set(arr, offset);
                    offset += arr.length;
                }
                return result;
            }
        };
    }
}

export { };
