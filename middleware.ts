import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Rutas públicas que no requieren sesión de Clerk (manejan su propia autenticación o son públicas)
const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/health(.*)",
  "/api/v1(.*)", // API Headless para MCP / Claude Desktop autenticada vía token SCRAPIO_API_KEY
  "/api/mcp(.*)", // Servidor MCP HTTP / SSE nativo
  "/api/openapi.json(.*)", // Especificación OpenAPI para GPTs y herramientas externas
  "/api/ingest/status(.*)", // Reporte de progreso en vivo desde el runner de GitHub Actions
  "/api/namespaces(.*)", // Permite acceso con sesión Clerk o con SCRAPIO_API_KEY
  "/api/entities(.*)", // Permite acceso con sesión Clerk o con SCRAPIO_API_KEY
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Omitir estáticos, archivos internos y APIs públicas/headless (v1, mcp, openapi)
    "/((?!_next|api/v1|api/mcp|api/openapi.json|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Evaluar solo APIs protegidas que requieren autenticación de Clerk (no v1 ni mcp ni openapi)
    "/api/((?!v1|mcp|openapi.json).*)",
    "/trpc(.*)",
  ],
};
