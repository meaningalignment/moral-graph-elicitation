import { vitePlugin as remix } from "@remix-run/dev"
import { installGlobals } from "@remix-run/node"
import { defineConfig } from "vite"
import tsconfigPaths from "vite-tsconfig-paths"
import { vercelPreset } from "@vercel/remix/vite"
import tailwindcss from "@tailwindcss/vite"


// Use undici (native-style) for fetch/Response/Request/etc. Without
// nativeFetch:true, Remix installs @remix-run/web-fetch — its Response.body
// is a web-streams-polyfill ReadableStream, which can't be pipeThrough'd
// with a native TransformStream (what ai@6 uses for SSE parsing). That
// mismatch surfaces as "First parameter has member 'readable' that is not
// a ReadableStream" when streamText starts streaming.
installGlobals({ nativeFetch: true })

export default defineConfig({
  plugins: [
    tailwindcss(),
    remix({
      presets: [vercelPreset()],
    }),
    tsconfigPaths(),
  ],
})
