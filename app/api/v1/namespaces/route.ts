import { NextRequest, NextResponse } from "next/server";
import { getIndexStats } from "@/lib/pinecone";

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

export async function GET(req: NextRequest) {
  try {
    // 1. Obtener token desde Header 'Authorization: Bearer <TOKEN>' o desde query param '?key=<TOKEN>'
    const authHeader = req.headers.get("Authorization");
    const { searchParams } = new URL(req.url);
    const queryKey = searchParams.get("key") || searchParams.get("apiKey") || searchParams.get("token");

    const secretKey = process.env.SCRAPIO_API_KEY || "sk_scrapio_default_secret_key_2026";

    let token = "";
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7).trim();
    } else if (queryKey) {
      token = queryKey.trim();
    }

    if (!token) {
      return NextResponse.json(
        {
          error:
            "No autorizado. Se requiere un header 'Authorization: Bearer <TOKEN>' o el parámetro de consulta '?key=<TOKEN>'.",
        },
        {
          status: 401,
          headers: {
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    if (token !== secretKey) {
      return NextResponse.json(
        { error: "Token de autorización no válido." },
        {
          status: 403,
          headers: {
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // 2. Obtener estadísticas de Pinecone
    const stats = await getIndexStats();

    const namespacesList = Object.entries(stats.namespaces || {}).map(([name, data]) => ({
      name,
      vectorCount: data.recordCount || 0,
    }));

    return NextResponse.json(
      {
        totalVectors: stats.totalRecordCount || 0,
        dimension: stats.dimension || 768,
        namespaces: namespacesList,
      },
      {
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error: any) {
    console.error("Error en /api/v1/namespaces:", error);
    return NextResponse.json(
      { error: error.message || "Error al obtener la lista de namespaces de Pinecone." },
      {
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
}
