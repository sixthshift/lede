import { serve } from "bun";
import { health } from "./routes/health";

const port = Number(process.env.PORT ?? 3000);

const server = serve({
  port,
  routes: {
    "/health": health,
  },
  fetch() {
    return new Response("Not Found", { status: 404 });
  },
});

console.log(`lede listening on http://localhost:${server.port}`);
