import { IncomingMessage, ServerResponse } from 'http';
import Busboy from 'busboy';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';

export const config = {
    runtime: 'nodejs',
};

export default function handler(req: IncomingMessage, res: ServerResponse) {
    if (req.method !== 'POST') {
        res.statusCode = 405;
        res.end('Method Not Allowed');
        return;
    }

    const busboy = Busboy({ headers: req.headers });
    const tmpFile = path.join(os.tmpdir(), `input-${Date.now()}.jpg`);
    let fileWritten = false;

    busboy.on('file', (fieldname, file, info) => {
        const writeStream = fs.createWriteStream(tmpFile);
        file.pipe(writeStream);

        writeStream.on('close', () => {
            fileWritten = true;
        });
    });

    busboy.on('finish', () => {
        if (!fileWritten) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'No file uploaded' }));
            return;
        }

        const binaryPath = path.join(process.cwd(), 'bin', 'jp2a');

        // Check if binary exists
        if (!fs.existsSync(binaryPath)) {
            console.warn("jp2a binary not found at", binaryPath);
            // Clean up
            try { fs.unlinkSync(tmpFile); } catch (e) { }

            res.statusCode = 500;
            res.end(JSON.stringify({ error: 'Binary not found', fallback: true }));
            return;
        }

        // Execute jp2a
        execFile(binaryPath, [
            '--width=120',
            '--background=dark',
            '--invert',
            '--colors=off',
            tmpFile
        ], { timeout: 5000 }, (error, stdout, stderr) => {
            // Clean up
            try { fs.unlinkSync(tmpFile); } catch (e) { }

            if (error) {
                console.error("jp2a error:", error);
                res.statusCode = 500;
                res.end(JSON.stringify({ error: 'Execution failed', fallback: true }));
                return;
            }

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ascii: stdout }));
        });
    });

    busboy.on('error', (err) => {
        console.error("Busboy error:", err);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: 'Upload parsing failed', fallback: true }));
    });

    req.pipe(busboy);
}
