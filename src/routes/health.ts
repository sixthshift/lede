export function health(): Response {
  return Response.json({ status: "ok", service: "lede" });
}
