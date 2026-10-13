import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/versao")({
  server: {
    handlers: {
      GET: async () =>
        new Response(JSON.stringify({ versao: __BUILD_ID__ }), {
          headers: { "content-type": "application/json", "cache-control": "no-store" },
        }),
    },
  },
});
