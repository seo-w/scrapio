import { NextRequest, NextResponse } from "next/server";
import { getIndexStats, queryPinecone, resolvePineconeNamespace } from "@/lib/pinecone";
import { generateEmbedding, generateRAGResponse, ContextChunk } from "@/lib/ai";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

function extractToken(req: NextRequest, body?: any): string {
  const authHeader = req.headers.get("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7).trim();
  }
  const xApiKey = req.headers.get("X-API-Key");
  if (xApiKey) return xApiKey.trim();

  const { searchParams } = new URL(req.url);
  const queryKey = searchParams.get("key") || searchParams.get("apiKey") || searchParams.get("token");
  if (queryKey) return queryKey.trim();

  if (body?.apiKey && typeof body.apiKey === "string") {
    return body.apiKey.trim();
  }

  return "";
}

const MCP_TOOLS = [
  {
    name: "list_scraped_sites",
    description:
      "Obtiene la lista de todos los sitios web o clientes scrapeados disponibles en la base de datos de Scrapio con su número de vectores.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "query_site",
    description:
      "Realiza una consulta RAG semántica personalizada sobre el contenido del sitio web scrapeado.",
    inputSchema: {
      type: "object",
      properties: {
        namespace: {
          type: "string",
          description:
            "El nombre del cliente o sitio web a consultar (ej. 'Internexa', 'Avafin', 'Tivit', 'Triario', etc.)",
        },
        query: {
          type: "string",
          description: "La pregunta o tema específico a responder con evidencia del sitio",
        },
        topK: {
          type: "number",
          description: "Cantidad de fragmentos semánticos a recuperar (por defecto 6)",
        },
      },
      required: ["namespace", "query"],
    },
  },
  {
    name: "get_site_entities",
    description:
      "Extrae de forma exhaustiva todas las entidades SEO del sitio web (marcas, productos, servicios, directivos, lugares y Schema.org sugerido).",
    inputSchema: {
      type: "object",
      properties: {
        namespace: {
          type: "string",
          description: "El nombre del cliente o sitio web (ej. 'Internexa', 'Avafin')",
        },
      },
      required: ["namespace"],
    },
  },
];

export async function POST(req: NextRequest) {
  try {
    let rpc: any = {};
    try {
      rpc = await req.json();
    } catch {
      return NextResponse.json(
        { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error: JSON inválido" } },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const token = extractToken(req, rpc);
    const secretKey = process.env.SCRAPIO_API_KEY || "sk_scrapio_default_secret_key_2026";

    if (!token || token !== secretKey) {
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          id: rpc.id || null,
          error: {
            code: -32000,
            message:
              "No autorizado. Se requiere API Key válida vía 'Authorization: Bearer <KEY>', 'X-API-Key' o parámetro '?key=<KEY>'.",
          },
        },
        { status: 401, headers: CORS_HEADERS }
      );
    }

    const { id, method, params } = rpc;

    // 1. Handshake inicial MCP
    if (method === "initialize") {
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: {
              tools: {},
            },
            serverInfo: {
              name: "scrapio-mcp-server",
              version: "1.0.0",
            },
          },
        },
        { headers: CORS_HEADERS }
      );
    }

    if (method === "notifications/initialized") {
      return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
    }

    if (method === "ping") {
      return NextResponse.json({ jsonrpc: "2.0", id, result: {} }, { headers: CORS_HEADERS });
    }

    // 2. Listado de Herramientas disponibles
    if (method === "tools/list") {
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          id,
          result: {
            tools: MCP_TOOLS,
          },
        },
        { headers: CORS_HEADERS }
      );
    }

    // 3. Ejecución de herramientas
    if (method === "tools/call") {
      const toolName = params?.name;
      const args = params?.arguments || {};

      if (toolName === "list_scraped_sites") {
        const stats = await getIndexStats();
        const list = Object.entries(stats.namespaces || {}).map(([name, data]) => ({
          name,
          slug: name.toLowerCase().replace(/\s+/g, "-"),
          vectorCount: data.recordCount || 0,
        }));

        const resultText = [
          `# Sitios y Espacios de Clientes Disponibles en Scrapio (${list.length} en total, ${stats.totalRecordCount} vectores):\n`,
          ...list.map(
            (s, idx) =>
              `${idx + 1}. **${s.name}** (slug: \`${s.slug}\`) — ${s.vectorCount.toLocaleString()} vectores indexados`
          ),
        ].join("\n");

        return NextResponse.json(
          {
            jsonrpc: "2.0",
            id,
            result: {
              content: [{ type: "text", text: resultText }],
            },
          },
          { headers: CORS_HEADERS }
        );
      }

      if (toolName === "query_site") {
        const query = (args.query || "").trim();
        const rawNamespace = (args.namespace || "").trim();
        const topK = Math.min(20, Math.max(1, parseInt(String(args.topK || "6"), 10) || 6));

        if (!query || !rawNamespace) {
          return NextResponse.json(
            {
              jsonrpc: "2.0",
              id,
              result: {
                content: [{ type: "text", text: "Error: Los parámetros 'namespace' y 'query' son obligatorios." }],
                isError: true,
              },
            },
            { headers: CORS_HEADERS }
          );
        }

        const resolvedNs = await resolvePineconeNamespace(rawNamespace);
        const queryVector = await generateEmbedding(query);
        const matches = await queryPinecone(resolvedNs, queryVector, topK);

        if (matches.length === 0) {
          const stats = await getIndexStats();
          const available = Object.keys(stats.namespaces || {}).join(", ");
          return NextResponse.json(
            {
              jsonrpc: "2.0",
              id,
              result: {
                content: [
                  {
                    type: "text",
                    text: `No se encontró información almacenada para el espacio '${resolvedNs}'. Espacios disponibles: ${available}`,
                  },
                ],
              },
            },
            { headers: CORS_HEADERS }
          );
        }

        const contextChunks: ContextChunk[] = matches.map((match) => ({
          url: match.metadata.url,
          h1: match.metadata.h1,
          text: match.metadata.text_chunk,
        }));

        const { text, sources } = await generateRAGResponse(query, contextChunks);

        let fullText = text;
        if (sources && sources.length > 0) {
          fullText += "\n\n### Fuentes consultadas:\n" + sources.map((s, idx) => `${idx + 1}. [${s}](${s})`).join("\n");
        }

        return NextResponse.json(
          {
            jsonrpc: "2.0",
            id,
            result: {
              content: [{ type: "text", text: fullText }],
            },
          },
          { headers: CORS_HEADERS }
        );
      }

      if (toolName === "get_site_entities") {
        const rawNamespace = (args.namespace || "").trim();
        if (!rawNamespace) {
          return NextResponse.json(
            {
              jsonrpc: "2.0",
              id,
              result: {
                content: [{ type: "text", text: "Error: El parámetro 'namespace' es obligatorio." }],
                isError: true,
              },
            },
            { headers: CORS_HEADERS }
          );
        }

        const resolvedNs = await resolvePineconeNamespace(rawNamespace);
        const queryVector = await generateEmbedding(
          "empresa organización marcas productos servicios soluciones personas equipo ubicación contacto"
        );
        const matches = await queryPinecone(resolvedNs, queryVector, 12);

        if (matches.length === 0) {
          return NextResponse.json(
            {
              jsonrpc: "2.0",
              id,
              result: {
                content: [{ type: "text", text: `No se encontraron documentos para '${resolvedNs}'.` }],
              },
            },
            { headers: CORS_HEADERS }
          );
        }

        const contextChunks: ContextChunk[] = matches.map((match) => ({
          url: match.metadata.url,
          h1: match.metadata.h1,
          text: match.metadata.text_chunk,
        }));

        const prompt = `Analiza todos los fragmentos disponibles y genera un informe de Entidades SEO completo y estructurado:
1. MARCAS Y ORGANIZACIÓN
2. PRODUCTOS Y SERVICIOS
3. PERSONAS Y EQUIPO
4. LUGARES Y COBERTURA
5. TABLA RESUMEN CON SCHEMA.ORG (Organization, Product, Service, LocalBusiness, etc.)`;

        const { text, sources } = await generateRAGResponse(prompt, contextChunks);
        let fullText = text;
        if (sources && sources.length > 0) {
          fullText += "\n\n### Fuentes analizadas:\n" + sources.map((s, idx) => `${idx + 1}. [${s}](${s})`).join("\n");
        }

        return NextResponse.json(
          {
            jsonrpc: "2.0",
            id,
            result: {
              content: [{ type: "text", text: fullText }],
            },
          },
          { headers: CORS_HEADERS }
        );
      }

      return NextResponse.json(
        {
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `Herramienta desconocida: ${toolName}` },
        },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Método RPC no soportado: ${method}` },
      },
      { status: 400, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    console.error("Error en /api/v1/mcp:", err);
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32603, message: err.message || "Internal error" } },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

// GET endpoint para información o Server-Sent Events (SSE)
export async function GET(req: NextRequest) {
  const token = extractToken(req);
  const secretKey = process.env.SCRAPIO_API_KEY || "sk_scrapio_default_secret_key_2026";

  if (!token || token !== secretKey) {
    return NextResponse.json(
      {
        error: "No autorizado. Se requiere Scrapio API Key (?key=<TOKEN> o header Authorization: Bearer <TOKEN>).",
      },
      { status: 401, headers: CORS_HEADERS }
    );
  }

  // Si solicita SSE
  const acceptHeader = req.headers.get("accept") || "";
  if (acceptHeader.includes("text/event-stream")) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(`event: endpoint\ndata: ${JSON.stringify({ endpoint: "/api/v1/mcp" })}\n\n`)
        );
      },
    });
    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        ...CORS_HEADERS,
      },
    });
  }

  // Respuesta estándar con descripción del servidor MCP
  const stats = await getIndexStats();
  const sites = Object.keys(stats.namespaces || {});

  return NextResponse.json(
    {
      name: "scrapio-mcp-server",
      version: "1.0.0",
      description: "Servidor MCP (Model Context Protocol) activo para Scrapio RAG",
      protocolVersion: "2024-11-05",
      availableSites: sites,
      tools: MCP_TOOLS.map((t) => ({ name: t.name, description: t.description })),
    },
    { headers: CORS_HEADERS }
  );
}
