import { NextRequest, NextResponse } from "next/server";
import { generateEmbedding, generateRAGResponse, ContextChunk } from "@/lib/ai";
import { queryPinecone, resolvePineconeNamespace, getIndexStats } from "@/lib/pinecone";
import { getScrapioUserOrApiKey, isNamespaceAllowed } from "@/lib/auth";
import { rerankHybridChunks } from "@/lib/hybrid";

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

    const authUser = await getScrapioUserOrApiKey(req, body);
    if (!authUser) {
      return NextResponse.json(
        {
          error:
            "No autorizado. Se requiere Scrapio API Key válida vía header 'Authorization: Bearer <TOKEN>', 'X-API-Key' o parámetro '?key=<TOKEN>'.",
          hint: "Obtén o regenera tu Scrapio API Key única en el panel de Integraciones de Scrapio.",
        },
        { status: 401, headers: CORS_HEADERS }
      );
    }

    const { searchParams } = new URL(req.url);
    const query = (body.query || searchParams.get("query") || "").trim();
    const namespace = (body.namespace || searchParams.get("namespace") || "").trim();
    const topKRaw = body.topK || searchParams.get("topK");
    const topK = Math.min(20, Math.max(1, parseInt(String(topKRaw || "10"), 10) || 10));
    const aiProvider = (body.aiProvider || searchParams.get("aiProvider") || "gemini").toLowerCase();
    const customApiKey = (body.customApiKey || searchParams.get("customApiKey") || "").trim() || undefined;

    const baseUrl = process.env.SCRAPIO_API_URL || "https://scrapio-one.vercel.app";

    if (!query) {
      const stats = await getIndexStats();
      let available = Object.keys(stats.namespaces || {});
      if (!authUser.isAdmin) {
        available = available.filter((ns) => isNamespaceAllowed(authUser, ns));
      }
      const targetNs = namespace || available[0] || "Avafin";
      return NextResponse.json(
        {
          status: "error",
          code: "MISSING_QUERY_PARAMETER",
          error: "El parámetro 'query' es obligatorio.",
          toolDocumentation: {
            tool: "scrapio_query_client",
            method: "GET or POST",
            endpoint: `${baseUrl}/api/v1/query`,
            requiredParameters: ["namespace", "query"],
            exampleGet: `${baseUrl}/api/v1/query?key=${authUser.apiKey}&namespace=${encodeURIComponent(targetNs)}&query=requisitos+prestamo`,
            postFormat: {
              url: `${baseUrl}/api/v1/query`,
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${authUser.apiKey}` },
              body: { namespace: targetNs, query: "requisitos de prestamo", topK: 10 },
            },
            note: "En peticiones GET con navegador o fetch, codifica los espacios con '+' (ej: query=terminos+de+servicio).",
          },
        },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    if (!namespace) {
      const stats = await getIndexStats();
      let available = Object.keys(stats.namespaces || {});
      if (!authUser.isAdmin) {
        available = available.filter((ns) => isNamespaceAllowed(authUser, ns));
      }
      return NextResponse.json(
        {
          status: "error",
          code: "MISSING_NAMESPACE_PARAMETER",
          error: "El parámetro 'namespace' es obligatorio.",
          availableNamespaces: available,
          toolDocumentation: {
            tool: "scrapio_query_client",
            method: "GET or POST",
            endpoint: `${baseUrl}/api/v1/query`,
            requiredParameters: ["namespace", "query"],
            exampleGet: `${baseUrl}/api/v1/query?key=${authUser.apiKey}&namespace=${encodeURIComponent(available[0] || "Avafin")}&query=condusef+sipres`,
          },
        },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // Validar aislamiento del namespace por usuario
    if (!isNamespaceAllowed(authUser, namespace)) {
      return NextResponse.json(
        {
          error: `No tienes permisos para consultar el cliente/namespace '${namespace}' con esta API Key.`,
          hint: authUser.allowedNamespaces.length === 0
            ? "Tu cuenta aún no tiene espacios de cliente asignados. Indexa un nuevo sitio o solicita asignación al administrador."
            : `Namespaces autorizados para tu cuenta: [${authUser.allowedNamespaces.join(", ")}].`,
        },
        { status: 403, headers: CORS_HEADERS }
      );
    }

    // Validar permiso de proveedor de IA
    if (aiProvider === "openai" && !authUser.canUseOpenAI && !customApiKey) {
      return NextResponse.json(
        { error: "El modelo OpenAI está restringido para este usuario. Ingresa tu propia API Key en BYOK o usa Gemini." },
        { status: 403, headers: CORS_HEADERS }
      );
    }

    if (aiProvider === "gemini" && !authUser.canUseGemini && !customApiKey) {
      return NextResponse.json(
        { error: "El modelo Google Gemini está restringido para este usuario. Ingresa tu propia API Key en BYOK." },
        { status: 403, headers: CORS_HEADERS }
      );
    }

    // 1 & 2. Resolver namespace y generar vector embedding en paralelo
    const [resolvedNs, queryVector] = await Promise.all([
      resolvePineconeNamespace(namespace),
      generateEmbedding(query, aiProvider, 3, customApiKey),
    ]);

    // 3. Query Pinecone con ventana amplia de candidatos para re-ranking híbrido
    const candidatePoolSize = Math.max(topK * 4, 40);
    const matches = await queryPinecone(resolvedNs, queryVector, candidatePoolSize);

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

    // 4. Aplicar Re-ranking Híbrido léxico + semántico
    const contextChunks: ContextChunk[] = rerankHybridChunks(query, matches, topK);

    // 5. Generar RAG sintetizado con IA
    const { text, sources } = await generateRAGResponse(query, contextChunks, aiProvider, customApiKey);

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
