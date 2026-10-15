import { NextRequest, NextResponse } from "next/server";
import { generateEmbedding, generateRAGResponse, ContextChunk } from "@/lib/ai";
import { queryPinecone, resolvePineconeNamespace, getIndexStats } from "@/lib/pinecone";

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

async function handleQueryRequest(req: NextRequest, isPost: boolean) {
  try {
    let body: any = {};
    if (isPost) {
      try {
        body = await req.json();
      } catch {
        body = {};
      }
    }

    const { searchParams } = new URL(req.url);
    const token = extractToken(req, body);
    const secretKey = process.env.SCRAPIO_API_KEY || "sk_scrapio_default_secret_key_2026";

    if (!token) {
      return NextResponse.json(
        {
          error:
            "No autorizado. Se requiere header 'Authorization: Bearer <TOKEN>', 'X-API-Key' o parámetro '?key=<TOKEN>'.",
        },
        { status: 401, headers: CORS_HEADERS }
      );
    }

    if (token !== secretKey) {
      return NextResponse.json(
        { error: "Token de autorización no válido." },
        { status: 403, headers: CORS_HEADERS }
      );
    }

    const query = (body.query || searchParams.get("query") || "").trim();
    const namespace = (body.namespace || searchParams.get("namespace") || "").trim();
    const topKRaw = body.topK || searchParams.get("topK");
    const topK = Math.min(20, Math.max(1, parseInt(String(topKRaw || "6"), 10) || 6));
    const aiProvider = (body.aiProvider || searchParams.get("aiProvider") || "gemini").toLowerCase();

    if (!query) {
      return NextResponse.json(
        { error: "El campo 'query' es obligatorio con la pregunta a responder." },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    if (!namespace) {
      const stats = await getIndexStats();
      const available = Object.keys(stats.namespaces || {});
      return NextResponse.json(
        {
          error: "El campo 'namespace' es obligatorio.",
          availableNamespaces: available,
        },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // 1. Resolver el nombre real del namespace de forma tolerante (insensible a mayúsculas/guiones)
    const resolvedNs = await resolvePineconeNamespace(namespace);

    // 2. Vectorizar la consulta
    const queryVector = await generateEmbedding(query, aiProvider);

    // 3. Query Pinecone
    const matches = await queryPinecone(resolvedNs, queryVector, topK);

    if (matches.length === 0) {
      const stats = await getIndexStats();
      const available = Object.keys(stats.namespaces || {});
      return NextResponse.json(
        {
          status: "success",
          query,
          namespace: resolvedNs,
          requestedNamespace: namespace,
          answer: `No se encontró información almacenada en el espacio de conocimiento '${resolvedNs}'.`,
          availableNamespaces: available,
          sources: [],
          chunks: [],
        },
        { headers: CORS_HEADERS }
      );
    }

    const contextChunks: ContextChunk[] = matches.map((match) => ({
      url: match.metadata.url,
      h1: match.metadata.h1,
      text: match.metadata.text_chunk,
    }));

    // 4. Generar RAG sintetizado con IA
    const { text, sources } = await generateRAGResponse(query, contextChunks, undefined, aiProvider);

    return NextResponse.json(
      {
        status: "success",
        query,
        namespace: resolvedNs,
        answer: text,
        sources,
        chunks: matches.map((m) => ({
          url: m.metadata.url,
          score: m.score,
          h1: m.metadata.h1,
          snippet: (m.metadata.text_chunk || "").substring(0, 160) + "...",
        })),
      },
      { headers: CORS_HEADERS }
    );
  } catch (error: any) {
    console.error("Error en Headless API /api/v1/query:", error);
    return NextResponse.json(
      { error: error.message || "Error interno del servidor al procesar consulta RAG." },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

export async function POST(req: NextRequest) {
  return handleQueryRequest(req, true);
}

export async function GET(req: NextRequest) {
  return handleQueryRequest(req, false);
}
