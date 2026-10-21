import { NextRequest, NextResponse } from "next/server";
import { getIndexStats } from "@/lib/pinecone";
import { getScrapioUserOrApiKey, isNamespaceAllowed } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
    },
  });
}

export async function GET(req: NextRequest) {
  try {
    const user = await getScrapioUserOrApiKey(req);
    if (!user) {
      return NextResponse.json(
        {
          error:
            "No autorizado. Se requiere Scrapio API Key (?key=<TOKEN> o header 'Authorization: Bearer <TOKEN>').",
          hint: "Si eres usuario de Scrapio, obtén tu clave única personal en el menú 'Integraciones & API' de la plataforma.",
        },
        {
          status: 401,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
          },
        }
      );
    }

    // Obtener estadísticas de Pinecone en tiempo real
    const stats = await getIndexStats();

    let namespacesList = Object.entries(stats.namespaces || {}).map(([name, data]) => ({
      name,
      slug: name.toLowerCase().replace(/\s+/g, "-"),
      vectorCount: data.recordCount || 0,
    }));

    // Si el usuario no es admin, filtrar estrictamente para ver solo sus namespaces asignados
    if (!user.isAdmin) {
      namespacesList = namespacesList.filter((ns) =>
        isNamespaceAllowed(user, ns.name)
      );
    }

    const totalVectors = user.isAdmin
      ? (stats.totalRecordCount || 0)
      : namespacesList.reduce((acc, ns) => acc + ns.vectorCount, 0);

    return NextResponse.json(
      {
        totalVectors,
        dimension: stats.dimension || 768,
        namespaces: namespacesList,
      },
      {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
          "Surrogate-Control": "no-store",
          "CDN-Cache-Control": "no-store",
          "Vercel-CDN-Cache-Control": "no-store",
          "Pragma": "no-cache",
          "Expires": "0",
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
