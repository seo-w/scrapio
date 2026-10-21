import { NextRequest, NextResponse } from "next/server";
import { generateEmbedding, generateRAGResponse, ContextChunk } from "@/lib/ai";
import { queryPinecone, resolvePineconeNamespace, getIndexStats } from "@/lib/pinecone";
import { getScrapioUserOrApiKey, isNamespaceAllowed } from "@/lib/auth";

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

// Herramientas MCP expuestas para Claude / Cursor
const MCP_TOOLS = [
  {
    name: "list_scraped_sites",
    description:
      "Obtiene la lista de todos los sitios web o clientes scrapeados disponibles en la base de datos de Scrapio con su número de vectores.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "query_site",
    description:
      "Realiza una consulta RAG semántica personalizada sobre el contenido del sitio web scrapeado de un cliente.",
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
          description: "La pregunta o consulta a responder a partir del contenido de su sitio web",
        },
        topK: {
          type: "number",
          description: "Número de fragmentos relevantes a recuperar (por defecto 6, máx 20)",
        },
      },
      required: ["namespace", "query"],
    },
  },
  {
    name: "get_site_entities",
    description:
      "Extrae las entidades principales de un sitio web analizado: marcas, organizaciones, productos, personas y Schema.org.",
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
    let rpc: any;
    try {
      rpc = await req.json();
    } catch {
      return NextResponse.json(
        { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error: JSON inválido" } },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const authUser = await getScrapioUserOrApiKey(req, rpc);
    if (!authUser) {
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          id: rpc?.id || null,
          error: {
            code: -32000,
            message:
              "No autorizado. Se requiere Scrapio API Key válida vía 'Authorization: Bearer <KEY>', 'X-API-Key' o parámetro '?key=<KEY>'.",
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
        let list = Object.entries(stats.namespaces || {}).map(([name, data]) => ({
          name,
          slug: name.toLowerCase().replace(/\s+/g, "-"),
          vectorCount: data.recordCount || 0,
        }));

        if (!authUser.isAdmin) {
          list = list.filter((s) => isNamespaceAllowed(authUser, s.name));
        }

        const totalVectors = authUser.isAdmin
          ? (stats.totalRecordCount || 0)
          : list.reduce((acc, s) => acc + s.vectorCount, 0);

        const resultText = [
          `# Sitios y Espacios de Clientes Disponibles en Scrapio (${list.length} en total, ${totalVectors.toLocaleString()} vectores):\n`,
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

        if (!isNamespaceAllowed(authUser, rawNamespace)) {
          return NextResponse.json(
            {
              jsonrpc: "2.0",
              id,
              result: {
                content: [{ type: "text", text: `Error: No tienes permisos para consultar el cliente '${rawNamespace}'.` }],
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
          return NextResponse.json(
            {
              jsonrpc: "2.0",
              id,
              result: {
                content: [
                  {
                    type: "text",
                    text: `No se encontró información para la consulta en el cliente '${resolvedNs}'.`,
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

        if (!isNamespaceAllowed(authUser, rawNamespace)) {
          return NextResponse.json(
            {
              jsonrpc: "2.0",
              id,
              result: {
                content: [{ type: "text", text: `Error: No tienes permisos para consultar las entidades del cliente '${rawNamespace}'.` }],
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
  const authUser = await getScrapioUserOrApiKey(req);
  if (!authUser) {
    return NextResponse.json(
      {
        error: "No autorizado. Se requiere Scrapio API Key válida (?key=<TOKEN> o header Authorization: Bearer <TOKEN>).",
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
  let sites = Object.keys(stats.namespaces || {});
  if (!authUser.isAdmin) {
    sites = sites.filter((ns) => isNamespaceAllowed(authUser, ns));
  }

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