import { auth, currentUser, clerkClient } from "@clerk/nextjs/server";

export interface ScrapioAuthUser {
  userId: string;
  email: string;
  name: string;
  isAdmin: boolean;
  allowedNamespaces: string[];
  canUseOpenAI: boolean;
}

/**
 * Obtiene el usuario autenticado con sus roles y permisos
 */
export async function getScrapioUser(): Promise<ScrapioAuthUser | null> {
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

  // Auto-promover a admin en Clerk si coincide con el correo administrador
  if (isDefaultAdminEmail && (!isRoleAdmin || !user.publicMetadata?.can_use_openai)) {
    try {
      const client = await clerkClient();
      await client.users.updateUserMetadata(userId, {
        publicMetadata: {
          ...user.publicMetadata,
          role: "admin",
          can_use_openai: true,
        },
      });
    } catch (err) {
      console.warn("No se pudo auto-actualizar metadata de admin en Clerk:", err);
    }
  }

  const allowedNamespaces = Array.isArray(user.publicMetadata?.allowed_namespaces)
    ? (user.publicMetadata.allowed_namespaces as string[])
    : [];

  const canUseOpenAI = isAdmin || !!user.publicMetadata?.can_use_openai;

  return {
    userId,
    email: primaryEmail,
    name: `${user.firstName || ""} ${user.lastName || ""}`.trim() || primaryEmail,
    isAdmin,
    allowedNamespaces,
    canUseOpenAI,
  };
}
