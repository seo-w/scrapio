import { NextResponse } from "next/server";
import { getScrapioUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getScrapioUser();
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const apiKey = process.env.SCRAPIO_API_KEY || "sk_scrapio_default_secret_key_2026";

    return NextResponse.json({
      user,
      apiKey,
    });
  } catch (error: any) {
    console.error("Error en /api/me:", error);
    return NextResponse.json(
      { error: error.message || "Error al obtener perfil" },
      { status: 500 }
    );
  }
}
