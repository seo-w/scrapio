import { NextRequest, NextResponse } from "next/server";
import { generateEmbedding, generateRAGResponse, ContextChunk } from "@/lib/ai";
import { queryPinecone } from "@/lib/pinecone";
import { getScrapioUser } from "@/lib/auth";
import { rerankHybridChunks } from "@/lib/hybrid";

export async function POST(req: NextRequest) {
  try {
    const user = await getScrapioUser();
    if (!user) {
      return NextResponse.json({ error: "No autenticado. Por favor inicia sesión." }, { status: 401 });
    }

    const body = await req.json();
    const { query, namespace, aiProvider, customApiKey } = body;

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { error: "El campo 'query' es obligatorio." },
        { status: 400 }
      );
    }

    if (!namespace || typeof namespace !== "string") {
      return NextResponse.json(
        { error: "El campo 'namespace' es obligatorio para aislar el cliente." },
        { status: 400 }
      );
    }

    // 1. Validar acceso al namespace (multi-tenant isolation)
    if (!user.isAdmin && !user.allowedNamespaces.includes(namespace)) {
      return NextResponse.json(
        { error: `No tienes permisos para consultar el proyecto/namespace '${namespace}'.` },
        { status: 403 }
      );
    }

    // 2. Validar permiso de modelo (Gemini por defecto para todos, OpenAI solo con permiso o BYOK)
    const provider = (aiProvider || process.env.AI_PROVIDER || "gemini").toLowerCase();
    if (provider === "openai" && !user.canUseOpenAI && !customApiKey) {
      return NextResponse.json(
        { error: "El modelo OpenAI está restringido por el administrador. Ingresa tu propia API Key o utiliza Gemini." },
        { status: 403 }
      );
    }

    // 3. Vectorizar la consulta del usuario usando el proveedor y clave correspondiente
    const queryVector = await generateEmbedding(query, provider, 3, customApiKey);

    // 4. Recuperar candidatos desde Pinecone y aplicar re-ranking híbrido léxico en memoria
    const matches = await queryPinecone(namespace, queryVector, 12);

    if (matches.length === 0) {
      return NextResponse.json({
        answer: "No se encontraron documentos ni contexto cargado para este cliente/namespace.",
        sources: [],
      });
    }

    const contextChunks: ContextChunk[] = rerankHybridChunks(query, matches, 8);

    // 5. Generar la respuesta RAG mediante el modelo seleccionado
    const { text, sources } = await generateRAGResponse(query, contextChunks, provider, customApiKey);

    return NextResponse.json({
      answer: text,
      sources,
      matchesCount: matches.length,
      providerUsed: provider,
      isBYOK: Boolean(customApiKey),
    });
  } catch (error: any) {
    console.error("Error en /api/chat:", error);
    return NextResponse.json(
      { error: error.message || "Error interno del servidor." },
      { status: 500 }
    );
  }
}
