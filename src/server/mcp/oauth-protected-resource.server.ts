export function handleMissingMcpProtectedResourceMetadata(): Response {
  return new Response(null, {
    status: 404,
    headers: {
      "cache-control": "no-store",
    },
  })
}
