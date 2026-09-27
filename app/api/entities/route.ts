import { NextRequest, NextResponse } from "next/server";
import { generateEmbedding, generateRAGResponse, ContextChunk } from "@/lib/ai";
import { queryPinecone } from "@/lib/pinecone";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const namespace = searchParams.get("namespace");
  const aiProvider = searchParams.get("aiProvider") || undefined;

  if (!namespace) {
    return NextResponse.json(
      { error: "El parámetro 'namespace' es obligatorio en la URL (ej. ?namespace=cliente-avafin)." },
      { status: 400 }
    );
  }

  return processEntities(namespace, aiProvider);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { namespace, aiProvider } = body;

    if (!namespace || typeof namespace !== "string") {
      return NextResponse.json(
        { error: "El campo 'namespace' es obligatorio." },
        { status: 400 }
      );
    }

    return processEntities(namespace, aiProvider);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Error al procesar la solicitud." },
      { status: 500 }
    );
  }
}

async function processEntities(namespace: string, aiProvider?: string) {
  try {
    // 1. Vectorizamos una consulta clave enfocada en la esencia de la empresa y su oferta
    const queryVector = await generateEmbedding(
      "empresa organización marcas productos servicios soluciones personas equipo ubicación contacto",
      aiProvider
    );

    // 2. Recuperamos los top 12 chunks para tener la máxima cobertura del sitio
    const matches = await queryPinecone(namespace, queryVector, 12);

    if (matches.length === 0) {
      return NextResponse.json({
        namespace,
        entities: [],
        summary: "No se encontraron documentos ni contexto cargado para este namespace.",
        sources: [],
      });
    }

    const contextChunks: ContextChunk[] = matches.map((match) => ({
      url: match.metadata.url,
      h1: match.metadata.h1,
      text: match.metadata.text_chunk,
    }));

    // 3. Prompt especializado para extracción de entidades SEO
    const prompt = `Analiza todos los fragmentos de texto disponibles del sitio web y genera un informe de Entidades SEO completo y estructurado:

1. MARCAS Y ORGANIZACIÓN: Nombre de la empresa, marcas asociadas, partners o filiales.
2. PRODUCTOS Y SERVICIOS: Catálogo completo de soluciones, productos o servicios que ofrece.
3. PERSONAS Y EQUIPO: Nombres de directivos, autores, fundadores o personas mencionadas.
4. LUGARES Y COBERTURA: Ciudades, países, sedes físicas o ámbito territorial.
5. CONCEPTOS CLAVE DEL NICHO: Temas y términos técnicos representativos.
6. TABLA RESUMEN CON SCHEMA.ORG: Una tabla que relacione cada Entidad encontrada con su tipo de Schema.org recomendado (Organization, Product, Service, Person, LocalBusiness, etc.).

Presenta la información de forma ejecutiva, limpia y precisa.`;

    const { text, sources } = await generateRAGResponse(prompt, contextChunks, aiProvider);

    return NextResponse.json({
      namespace,
      analysis: text,
      sources,
      chunksAnalyzed: contextChunks.length,
      providerUsed: aiProvider || process.env.AI_PROVIDER || "gemini",
    });
  } catch (error: any) {
    console.error("Error en processEntities:", error);
    return NextResponse.json(
      { error: error.message || "Error al extraer entidades del sitio." },
      { status: 500 }
    );
  }
}
