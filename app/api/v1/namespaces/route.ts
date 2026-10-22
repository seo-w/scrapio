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
    const allowedNamespaceNames = namespacesList.map((ns) => ns.name);

    // Definición estándar MCP (Model Context Protocol) & OpenAPI Tools
    // Compatible nativamente con OpenAI Function Calling, Anthropic Claude Tool Use, Gemini y Cursor
    const tools = [
      {
        name: "scrapio_query_client",
        description:
          "Executes semantic & lexical hybrid RAG search over the crawled web knowledge base of a client website. Returns synthesized answers with exact citations, source URLs, and key CTAs.",
        method: "GET or POST",
        endpoint: `${baseUrl}/api/v1/query`,
        urlTemplate: `${baseUrl}/api/v1/query?key=${userApiKey}&namespace={namespace}&query={search_terms_with_plus}`,
        exampleUrl: `${baseUrl}/api/v1/query?key=${userApiKey}&namespace=${encodeURIComponent(allowedNamespaceNames[0] || "Avafin")}&query=regulaciones+condusef+sipres`,
        inputSchema: {
          type: "object",
          properties: {
            namespace: {
              type: "string",
              description: "The client website namespace to query.",
              enum: allowedNamespaceNames.length > 0 ? allowedNamespaceNames : undefined,
            },
            query: {
              type: "string",
              description:
                "Natural language question or search topic. In GET requests, encode spaces with '+' (e.g. 'condusef+sipres').",
            },
            topK: {
              type: "integer",
              description: "Number of context fragments to inspect (default 10, max 20).",
              default: 10,
            },
          },
          required: ["namespace", "query"],
        },
        parameters: {
          type: "object",
          properties: {
            namespace: {
              type: "string",
              description: "The client website namespace to query.",
              enum: allowedNamespaceNames.length > 0 ? allowedNamespaceNames : undefined,
            },
            query: {
              type: "string",
              description:
                "Natural language question or search topic. In GET requests, encode spaces with '+' (e.g. 'condusef+sipres').",
            },
            topK: {
              type: "integer",
              description: "Number of context fragments to inspect (default 10, max 20).",
              default: 10,
            },
          },
          required: ["namespace", "query"],
        },
      },
      {
        name: "scrapio_get_entities",
        description:
          "Extracts SEO entities, brands, products, organizations, and Schema.org structured data types from a client's crawled website.",
        method: "GET or POST",
        endpoint: `${baseUrl}/api/v1/entities`,
        urlTemplate: `${baseUrl}/api/v1/entities?key=${userApiKey}&namespace={namespace}`,
        exampleUrl: `${baseUrl}/api/v1/entities?key=${userApiKey}&namespace=${encodeURIComponent(allowedNamespaceNames[0] || "Avafin")}`,
        inputSchema: {
          type: "object",
          properties: {
            namespace: {
              type: "string",
              description: "The client website namespace to analyze.",
              enum: allowedNamespaceNames.length > 0 ? allowedNamespaceNames : undefined,
            },
          },
          required: ["namespace"],
        },
        parameters: {
          type: "object",
          properties: {
            namespace: {
              type: "string",
              description: "The client website namespace to analyze.",
              enum: allowedNamespaceNames.length > 0 ? allowedNamespaceNames : undefined,
            },
          },
          required: ["namespace"],
        },
      },
    ];

    return NextResponse.json(
      {
        status: "success",
        protocol: "mcp-declarative-v1",
        description: "Scrapio Universal MCP & Headless Knowledge Graph API",
        totalVectors,
        dimension: stats.dimension || 768,
        tools,
        mcp: {
          serverName: "scrapio-mcp-server",
          version: "1.0.0",
          sseEndpoint: `${baseUrl}/api/v1/mcp?key=${userApiKey}`,
          tools,
        },
        namespaces: namespacesList.map((ns) => ({
          ...ns,
          queryUrl: `${baseUrl}/api/v1/query?key=${userApiKey}&namespace=${encodeURIComponent(ns.name)}`,
          exampleQueryUrl: `${baseUrl}/api/v1/query?key=${userApiKey}&namespace=${encodeURIComponent(ns.name)}&query=regulaciones+condusef+sipres`,
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
        headers: { "Access-Control-Allow-Origin": "*" },
      }
    );
  }
}
