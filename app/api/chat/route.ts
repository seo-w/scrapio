import { NextRequest, NextResponse } from "next/server";
import { generateEmbedding, generateRAGResponse, ContextChunk } from "@/lib/ai";
import { queryPinecone } from "@/lib/pinecone";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { query, namespace, aiProvider } = body;

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

    // 1. Vectorizar la consulta del usuario usando el proveedor seleccionado
    const queryVector = await generateEmbedding(query, aiProvider);

    // 2. Recuperar el contexto relevante desde Pinecone acotado al namespace (8 chunks para mayor cobertura)
    const matches = await queryPinecone(namespace, queryVector, 8);

    if (matches.length === 0) {
      return NextResponse.json({
        answer: "No se encontraron documentos ni contexto cargado para este cliente/namespace.",
        sources: [],
      });
    }

    const contextChunks: ContextChunk[] = matches.map((match) => ({
      url: match.metadata.url,
      h1: match.metadata.h1,
      text: match.metadata.text_chunk,
    }));

    // 3. Generar la respuesta RAG mediante el modelo seleccionado (Gemini u OpenAI)
    const { text, sources } = await generateRAGResponse(query, contextChunks, aiProvider);

    return NextResponse.json({
      answer: text,
      sources,
      matchesCount: matches.length,
      providerUsed: aiProvider || process.env.AI_PROVIDER || "gemini",
    });
  } catch (error: any) {
    console.error("Error en /api/chat:", error);
    return NextResponse.json(
      { error: error.message || "Error interno del servidor." },
      { status: 500 }
    );
  }
}
