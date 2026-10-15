import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import account from "./netlify/functions/account";
export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));
  return {
    plugins: [
      react(),
      {
        name: "local-netlify-account",
        configureServer(server) {
          server.middlewares.use(
            "/.netlify/functions/account",
            async (req, res) => {
              try {
                const chunks: Buffer[] = [];
                let size = 0;
                for await (const chunk of req) {
                  size += chunk.length;
                  if (size > 8 * 1024 * 1024) {
                    res.statusCode = 413;
                    res.end("Upload too large");
                    return;
                  }
                  chunks.push(Buffer.from(chunk));
                }
                const result = await account(
                  new Request(
                    `http://127.0.0.1:5173/.netlify/functions/account${req.url}`,
                    {
                      method: req.method,
                      headers: req.headers as HeadersInit,
                      body: ["GET", "HEAD"].includes(req.method || "GET")
                        ? undefined
                        : Buffer.concat(chunks),
                    },
                  ),
                );
                res.statusCode = result.status;
                result.headers.forEach((v, k) => res.setHeader(k, v));
                res.end(Buffer.from(await result.arrayBuffer()));
              } catch {
                res.statusCode = 500;
                res.end("Local function failed");
              }
            },
          );
        },
      },
    ],
  };
});
