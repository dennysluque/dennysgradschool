import { cpSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [
        {
            name: 'copy-media',
            closeBundle() {
                cpSync(resolve('media'), resolve('dist/media'), { recursive: true });
            }
        }
    ]
});
