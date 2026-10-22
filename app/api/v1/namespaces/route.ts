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

    const baseUrl =
      process.env.SCRAPIO_API_URL || "https://scrapio-one.vercel.app";
    const userApiKey = user.apiKey || "";

    return NextResponse.json(
      {
        status: "success",
        totalVectors,
        dimension: stats.dimension || 768,
        queryEndpoint: `${baseUrl}/api/v1/query`,
        apiUsage: {
          description:
            "Para realizar consultas RAG citando fuentes sobre cualquier cliente, realiza una petición GET (recomendado para bots y agentes web) o POST al queryEndpoint.",
          method: "GET | POST",
          fetchGuidance:
            "Tu herramienta de navegación web/fetch puede consultar directamente mediante GET usando la propiedad 'queryUrl' de cada namespace y añadiendo '&query=<tu_pregunta>'. No se requiere POST.",
          exampleGet: `${baseUrl}/api/v1/query?key=${userApiKey}&namespace=${encodeURIComponent(namespacesList[0]?.name || "Avafin")}&query=que+relacion+tiene+con+condusef`,
          examplePost: {
            url: `${baseUrl}/api/v1/query`,
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${userApiKey}`,
            },
            body: {
              namespace: namespacesList[0]?.name || "Avafin",
              query: "Tu pregunta aquí",
              topK: 10,
            },
          },
          parameters: {
            key: "Scrapio API Key (?key= en GET o cabecera Authorization: Bearer en POST)",
            namespace: "Nombre del cliente/sitio web (ej. 'Avafin', 'Internexa', etc.)",
            query: "La pregunta o tema a investigar",
            topK: "Número de fragmentos relevantes a recuperar (opcional, default: 10, max: 20)",
            aiProvider: "Proveedor de IA para sintetizar ('gemini' u 'openai', opcional)",
          },
        },
        namespaces: namespacesList.map((ns) => ({
          ...ns,
          queryUrl: `${baseUrl}/api/v1/query?key=${userApiKey}&namespace=${encodeURIComponent(ns.name)}`,
        })),
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
