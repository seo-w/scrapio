import { NextRequest, NextResponse } from "next/server";
import { generateEmbedding, generateRAGResponse, ContextChunk } from "@/lib/ai";
import { queryPinecone } from "@/lib/pinecone";

export async function POST(req: NextRequest) {
  try {
    // Autenticación por Bearer Token
    const authHeader = req.headers.get("Authorization");
    const secretKey = process.env.SCRAPIO_API_KEY || "sk_scrapio_default_secret_key_2026";

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "No autorizado. Se requiere un header 'Authorization: Bearer <TOKEN>'." },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7).trim();
    if (token !== secretKey) {
      return NextResponse.json(
        { error: "Token de autorización no válido." },
        { status: 403 }
      );
    }

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
        { error: "El campo 'namespace' es obligatorio." },
        { status: 400 }
      );
    }

    // 1. Vectorizar
    const queryVector = await generateEmbedding(query);

    // 2. Query Pinecone
    const matches = await queryPinecone(namespace, queryVector, 4);

    if (matches.length === 0) {
      return NextResponse.json({
        status: "success",
        query,
        namespace,
        answer: "No hay información almacenada para este namespace.",
        sources: [],
        chunks: [],
      });
    }

    const contextChunks: ContextChunk[] = matches.map((match) => ({
      url: match.metadata.url,
      h1: match.metadata.h1,
      text: match.metadata.text_chunk,
    }));

    // 3. Generar RAG
    const { text, sources } = await generateRAGResponse(query, contextChunks);

    return NextResponse.json({
      status: "success",
      query,
      namespace,
      answer: text,
      sources,
      chunks: matches.map((m) => ({
        url: m.metadata.url,
        score: m.score,
        h1: m.metadata.h1,
        snippet: m.metadata.text_chunk.substring(0, 150) + "...",
      })),
    });
  } catch (error: any) {
    console.error("Error en Headless API /api/v1/query:", error);
    return NextResponse.json(
      { error: error.message || "Error interno del servidor." },
      { status: 500 }
    );
  }
}
