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

    return NextResponse.json(
      {
        user,
        apiKey: user.apiKey,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
          "Pragma": "no-cache",
        },
      }
    );
  } catch (error: any) {
    console.error("Error en /api/me:", error);
    return NextResponse.json(
      { error: error.message || "Error al obtener perfil" },
      { status: 500 }
    );
  }
}

/**
 * Actualiza claves BYOK o regenera una nueva Scrapio API Key única para el usuario en sesión
 */
export async function POST(req: Request) {
  try {
    const user = await getScrapioUser();
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const client = await clerkClient();
    const clerkUser = await client.users.getUser(user.userId);
    const existingMeta = (clerkUser.publicMetadata || {}) as Record<string, any>;

    // Caso 1: Guardar claves BYOK (OpenAI / Gemini) en el perfil de Clerk del usuario
    if (body.action === "save_keys") {
      const updatedMeta: Record<string, any> = {
        ...existingMeta,
        openai_api_key: typeof body.openaiApiKey === "string" ? body.openaiApiKey.trim() : (existingMeta.openai_api_key || ""),
        gemini_api_key: typeof body.geminiApiKey === "string" ? body.geminiApiKey.trim() : (existingMeta.gemini_api_key || ""),
      };

      await client.users.updateUserMetadata(user.userId, {
        publicMetadata: updatedMeta,
      });

      return NextResponse.json({
        success: true,
        message: "Claves BYOK guardadas y asociadas exitosamente a tu Scrapio API Key.",
      });
    }

    // Caso 2: Regenerar nueva Scrapio API Key única
    const newApiKey = `sk_scrapio_${user.userId}_${crypto.randomBytes(12).toString("hex")}`;
    await client.users.updateUserMetadata(user.userId, {
      publicMetadata: {
        ...existingMeta,
        scrapio_api_key: newApiKey,
      },
    });

    return NextResponse.json({
      success: true,
      apiKey: newApiKey,
      message: "Scrapio API Key regenerada exitosamente.",
    });
  } catch (error: any) {
    console.error("Error en POST /api/me:", error);
    return NextResponse.json(
      { error: error.message || "Error al procesar solicitud en /api/me" },
      { status: 500 }
    );
  }
}
