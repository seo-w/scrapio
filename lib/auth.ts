import { auth, currentUser, clerkClient } from "@clerk/nextjs/server";
import crypto from "crypto";

export interface ScrapioAuthUser {
  userId: string;
  email: string;
  name: string;
  isAdmin: boolean;
  allowedNamespaces: string[];
  canUseOpenAI: boolean;
  canUseGemini: boolean;
  apiKey: string;
  customOpenAiKey?: string;
  customGeminiKey?: string;
}

/**
 * Obtiene el usuario autenticado con sus roles, permisos y Scrapio API Key única
 */
export async function getScrapioUser(): Promise<ScrapioAuthUser | null> {
  try {
    const { userId } = await auth();
    if (!userId) return null;

    const user = await currentUser();
    if (!user) return null;

    const primaryEmail =
      user.emailAddresses?.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress ||
      user.emailAddresses?.[0]?.emailAddress ||
      "";

    const adminEmail = (process.env.ADMIN_EMAIL || "avraxas@gmail.com").toLowerCase();
    const isDefaultAdminEmail = primaryEmail.toLowerCase() === adminEmail;
    const isRoleAdmin = user.publicMetadata?.role === "admin";
    const isAdmin = isDefaultAdminEmail || isRoleAdmin;

    let apiKey = (user.publicMetadata?.scrapio_api_key as string) || "";
    let shouldUpdateClerk = false;
    const currentMeta = (user.publicMetadata || {}) as Record<string, any>;
    const updatedMeta: Record<string, any> = { ...currentMeta };

    // Si el usuario aún no tiene su Scrapio API Key personal única, generarla
    if (!apiKey) {
      apiKey = `sk_scrapio_${userId}_${crypto.randomBytes(12).toString("hex")}`;
      updatedMeta.scrapio_api_key = apiKey;
      shouldUpdateClerk = true;
    }

    // Auto-promover a admin en Clerk si coincide con el correo administrador
    if (isDefaultAdminEmail && (!isRoleAdmin || !user.publicMetadata?.can_use_openai)) {
      updatedMeta.role = "admin";
      updatedMeta.can_use_openai = true;
      shouldUpdateClerk = true;
    }

    if (shouldUpdateClerk) {
      try {
        const client = await clerkClient();
        await client.users.updateUserMetadata(userId, {
          publicMetadata: updatedMeta,
        });
      } catch (err) {
        console.warn("No se pudo auto-actualizar metadata en Clerk:", err);
      }
    }

    const allowedNamespaces = Array.isArray(user.publicMetadata?.allowed_namespaces)
      ? (user.publicMetadata.allowed_namespaces as string[])
      : [];

    const canUseOpenAI = isAdmin || !!user.publicMetadata?.can_use_openai;
    const canUseGemini = isAdmin || user.publicMetadata?.can_use_gemini !== false;

    const customOpenAiKey =
      (user.publicMetadata?.openai_api_key as string) ||
      (user.unsafeMetadata?.openai_api_key as string) ||
      "";

    const customGeminiKey =
      (user.publicMetadata?.gemini_api_key as string) ||
      (user.unsafeMetadata?.gemini_api_key as string) ||
      "";

    return {
      userId,
      email: primaryEmail,
      name: `${user.firstName || ""} ${user.lastName || ""}`.trim() || primaryEmail,
      isAdmin,
      allowedNamespaces,
      canUseOpenAI,
      canUseGemini,
      apiKey,
      customOpenAiKey: customOpenAiKey || undefined,
      customGeminiKey: customGeminiKey || undefined,
    };
  } catch (err) {
    console.warn("Error resolviendo usuario de Clerk en getScrapioUser:", err);
    return null;
  }
}

/**
 * Extrae token de API Key desde cabeceras HTTP, parámetros de URL o cuerpo de la petición
 */
export function extractTokenFromRequest(req: Request, body?: any): string {
  const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.substring(7).trim();
  }

  const xApiKey = req.headers.get("X-API-Key") || req.headers.get("x-api-key");
  if (xApiKey) return xApiKey.trim();

  try {
    const { searchParams } = new URL(req.url);
    const queryKey = searchParams.get("key") || searchParams.get("apiKey") || searchParams.get("token") || searchParams.get("api_key");
    if (queryKey) return queryKey.trim();
  } catch {}

  if (body) {
    const bodyKey = body.apiKey || body.api_key || body.key || body.token;
    if (typeof bodyKey === "string" && bodyKey.trim()) {
      return bodyKey.trim();
    }
  }

  return "";
}

/**
 * Valida un token Scrapio API Key (Master Key o clave única de usuario sk_scrapio_user_XXXXX_YYYYYY)
 */
export async function validateScrapioApiKey(token: string): Promise<ScrapioAuthUser | null> {
  if (!token || typeof token !== "string") return null;
  const cleanToken = token.trim();

  // 1. Master Server Key (entorno / CI/CD)
  const masterKey = process.env.SCRAPIO_API_KEY || "sk_scrapio_default_secret_key_2026";
  if (cleanToken === masterKey.trim()) {
    return {
      userId: "master_admin",
      email: process.env.ADMIN_EMAIL || "avraxas@gmail.com",
      name: "Master Admin",
      isAdmin: true,
      allowedNamespaces: ["*"],
      canUseOpenAI: true,
      canUseGemini: true,
      apiKey: masterKey,
      customOpenAiKey: process.env.OPENAI_API_KEY || undefined,
    };
  }

  // 2. Clave de usuario única: sk_scrapio_<userId>_<suffix>
  if (cleanToken.startsWith("sk_scrapio_")) {
    const withoutPrefix = cleanToken.slice(11); // quitar "sk_scrapio_"
    const lastUnder = withoutPrefix.lastIndexOf("_");
    if (lastUnder > 0) {
      const userId = withoutPrefix.slice(0, lastUnder);
      try {
        const client = await clerkClient();
        const user = await client.users.getUser(userId);
        if (user) {
          const storedKey = user.publicMetadata?.scrapio_api_key as string | undefined;
          if (storedKey && storedKey === cleanToken) {
            const primaryEmail =
              user.emailAddresses?.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress ||
              user.emailAddresses?.[0]?.emailAddress ||
              "";

            const adminEmail = (process.env.ADMIN_EMAIL || "avraxas@gmail.com").toLowerCase();
            const isDefaultAdminEmail = primaryEmail.toLowerCase() === adminEmail;
            const isRoleAdmin = user.publicMetadata?.role === "admin";
            const isAdmin = isDefaultAdminEmail || isRoleAdmin;

            const allowedNamespaces = Array.isArray(user.publicMetadata?.allowed_namespaces)
              ? (user.publicMetadata.allowed_namespaces as string[])
              : [];

            const canUseOpenAI = isAdmin || !!user.publicMetadata?.can_use_openai;
            const canUseGemini = isAdmin || user.publicMetadata?.can_use_gemini !== false;

            const customOpenAiKey =
              (user.publicMetadata?.openai_api_key as string) ||
              (user.unsafeMetadata?.openai_api_key as string) ||
              "";

            const customGeminiKey =
              (user.publicMetadata?.gemini_api_key as string) ||
              (user.unsafeMetadata?.gemini_api_key as string) ||
              "";

            return {
              userId: user.id,
              email: primaryEmail,
              name: `${user.firstName || ""} ${user.lastName || ""}`.trim() || primaryEmail,
              isAdmin,
              allowedNamespaces,
              canUseOpenAI,
              canUseGemini,
              apiKey: storedKey,
              customOpenAiKey: customOpenAiKey || undefined,
              customGeminiKey: customGeminiKey || undefined,
            };
          }
        }
      } catch (err) {
        console.error("Error validando Scrapio API Key con Clerk:", err);
        return null;
      }
    }
  }

  return null;
}

/**
 * Autentica una solicitud mediante Scrapio API Key O sesión activa de Clerk
 */
export async function getScrapioUserOrApiKey(req: Request, body?: any): Promise<ScrapioAuthUser | null> {
  const token = extractTokenFromRequest(req, body);
  if (token) {
    const authFromKey = await validateScrapioApiKey(token);
    if (authFromKey) return authFromKey;
  }
  return await getScrapioUser();
}

/**
 * Comprueba si el usuario tiene permiso para acceder a un namespace dado
 */
export function isNamespaceAllowed(user: ScrapioAuthUser, namespace: string): boolean {
  if (!namespace) return false;
  if (user.isAdmin) return true;
  if (user.allowedNamespaces.includes("*")) return true;

  const clean = (s: string) =>
    s.toLowerCase().replace(/^cliente[-_]/, "").replace(/[-_]/g, " ").trim();
  const allowedClean = (user.allowedNamespaces || []).map(clean);

  return allowedClean.includes(clean(namespace));
}
