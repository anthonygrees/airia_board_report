import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
/** Same native components as the live app; synthetic fixtures, no Airia key. */
export default defineConfig({ plugins: [react(), viteSingleFile()], build: { outDir: 'standalone', rollupOptions: { input: 'preview.html' } } })
