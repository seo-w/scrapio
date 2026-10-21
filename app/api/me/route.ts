import { NextResponse } from "next/server";
import { getScrapioUser } from "@/lib/auth";
import { clerkClient } from "@clerk/nextjs/server";
import crypto from "crypto";

export async function GET() {
  try {
    const user = await getScrapioUser();
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    return NextResponse.json({
      user,
      apiKey: user.apiKey,
    });
  } catch (error: any) {
    console.error("Error en /api/me:", error);
    return NextResponse.json(
      { error: error.message || "Error al obtener perfil" },
      { status: 500 }
    );
  }
}

/**
 * Regenera una nueva Scrapio API Key única para el usuario en sesión
 */
export async function POST() {
  try {
    const user = await getScrapioUser();
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const newApiKey = `sk_scrapio_${user.userId}_${crypto.randomBytes(12).toString("hex")}`;
    const client = await clerkClient();
    const clerkUser = await client.users.getUser(user.userId);

    await client.users.updateUserMetadata(user.userId, {
      publicMetadata: {
        ...(clerkUser.publicMetadata || {}),
        scrapio_api_key: newApiKey,
      },
    });

    return NextResponse.json({
      success: true,
      apiKey: newApiKey,
      message: "Scrapio API Key regenerada exitosamente.",
    });
  } catch (error: any) {
    console.error("Error regenerando API Key en /api/me:", error);
    return NextResponse.json(
      { error: error.message || "Error al regenerar Scrapio API Key" },
      { status: 500 }
    );
  }
}
