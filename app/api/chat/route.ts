import { NextRequest, NextResponse } from "next/server";
import { generateEmbedding, generateRAGResponse, ContextChunk } from "@/lib/ai";
import { queryPinecone } from "@/lib/pinecone";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { query, namespace } = body;

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

    // 1. Vectorizar la consulta del usuario
    const queryVector = await generateEmbedding(query);

    // 2. Recuperar el contexto relevante desde Pinecone acotado al namespace
    const matches = await queryPinecone(namespace, queryVector, 4);

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

    // 3. Generar la respuesta RAG mediante el modelo LLM de Gemini
    const { text, sources } = await generateRAGResponse(query, contextChunks);

    return NextResponse.json({
      answer: text,
      sources,
      matchesCount: matches.length,
    });
  } catch (error: any) {
    console.error("Error en /api/chat:", error);
    return NextResponse.json(
      { error: error.message || "Error interno del servidor." },
      { status: 500 }
    );
  }
}
