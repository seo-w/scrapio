import { NextRequest, NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { getScrapioUser } from "@/lib/auth";

export async function GET() {
  try {
    const currentUser = await getScrapioUser();
    if (!currentUser || !currentUser.isAdmin) {
      return NextResponse.json({ error: "Acceso denegado. Se requiere rol de administrador." }, { status: 403 });
    }

    const client = await clerkClient();
    const response = await client.users.getUserList({ limit: 100 });
    const userList = response.data || [];

    const formattedUsers = userList.map((u) => {
      const email =
        u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId)?.emailAddress ||
        u.emailAddresses[0]?.emailAddress ||
        "";
      const meta = (u.publicMetadata || {}) as Record<string, any>;
      const isAdmin = email.toLowerCase() === (process.env.ADMIN_EMAIL || "avraxas@gmail.com").toLowerCase() || meta.role === "admin";

      return {
        id: u.id,
        email,
        firstName: u.firstName || "",
        lastName: u.lastName || "",
        imageUrl: u.imageUrl,
        role: isAdmin ? "admin" : (meta.role || "user"),
        allowedNamespaces: Array.isArray(meta.allowed_namespaces) ? meta.allowed_namespaces : [],
        canUseOpenAI: isAdmin ? true : !!meta.can_use_openai,
        createdAt: u.createdAt,
        lastSignInAt: u.lastSignInAt,
      };
    });

    return NextResponse.json({ users: formattedUsers });
  } catch (error: any) {
    console.error("Error en GET /api/admin/users:", error);
    return NextResponse.json(
      { error: error.message || "Error al obtener lista de usuarios" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const currentUser = await getScrapioUser();
    if (!currentUser || !currentUser.isAdmin) {
      return NextResponse.json({ error: "Acceso denegado. Se requiere rol de administrador." }, { status: 403 });
    }

    const body = await req.json();
    const { userId, role, allowedNamespaces, canUseOpenAI } = body;

    if (!userId) {
      return NextResponse.json({ error: "userId es obligatorio." }, { status: 400 });
    }

    const client = await clerkClient();
    const targetUser = await client.users.getUser(userId);
    if (!targetUser) {
      return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
    }

    const currentMeta = (targetUser.publicMetadata || {}) as Record<string, any>;
    const updatedMeta = {
      ...currentMeta,
      ...(role !== undefined ? { role } : {}),
      ...(allowedNamespaces !== undefined ? { allowed_namespaces: allowedNamespaces } : {}),
      ...(canUseOpenAI !== undefined ? { can_use_openai: canUseOpenAI } : {}),
    };

    await client.users.updateUserMetadata(userId, {
      publicMetadata: updatedMeta,
    });

    return NextResponse.json({ success: true, metadata: updatedMeta });
  } catch (error: any) {
    console.error("Error en PATCH /api/admin/users:", error);
    return NextResponse.json(
      { error: error.message || "Error al actualizar usuario" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const currentUser = await getScrapioUser();
    if (!currentUser || !currentUser.isAdmin) {
      return NextResponse.json({ error: "Acceso denegado. Se requiere rol de administrador." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "userId es obligatorio." }, { status: 400 });
    }

    if (userId === currentUser.userId) {
      return NextResponse.json({ error: "No puedes eliminar tu propia cuenta de administrador." }, { status: 400 });
    }

    const client = await clerkClient();
    await client.users.deleteUser(userId);

    return NextResponse.json({ success: true, message: "Usuario eliminado exitosamente de Clerk." });
  } catch (error: any) {
    console.error("Error en DELETE /api/admin/users:", error);
    return NextResponse.json(
      { error: error.message || "Error al eliminar usuario" },
      { status: 500 }
    );
  }
}
