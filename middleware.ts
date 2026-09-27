import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Rutas públicas que no requieren sesión de Clerk
const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/v1(.*)", // API Headless para MCP / Claude Desktop autenticada vía token SCRAPIO_API_KEY
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Omitir estáticos y archivos internos de Next.js
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Siempre evaluar para rutas de API
    "/(api|trpc)(.*)",
  ],
};
