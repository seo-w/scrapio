import { NextRequest, NextResponse } from "next/server";
import { generateEmbedding, generateRAGResponse, ContextChunk } from "@/lib/ai";
import { queryPinecone, resolvePineconeNamespace } from "@/lib/pinecone";
import { getScrapioUserOrApiKey, isNamespaceAllowed } from "@/lib/auth";

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

async function handleEntities(req: NextRequest, isPost: boolean) {
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
        },
        { status: 401, headers: CORS_HEADERS }
      );
    }

    const { searchParams } = new URL(req.url);
    const rawNamespace = (body.namespace || searchParams.get("namespace") || "").trim();
    const aiProvider = (body.aiProvider || searchParams.get("aiProvider") || "gemini").toLowerCase();
    const customApiKey = (body.customApiKey || searchParams.get("customApiKey") || "").trim() || undefined;

    if (!rawNamespace) {
      return NextResponse.json(
        { error: "El parámetro 'namespace' es obligatorio." },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    if (!isNamespaceAllowed(authUser, rawNamespace)) {
      return NextResponse.json(
        { error: `No tienes permisos para consultar las entidades del namespace '${rawNamespace}'.` },
        { status: 403, headers: CORS_HEADERS }
      );
    }

    const namespace = await resolvePineconeNamespace(rawNamespace);

    // 1. Vectorizamos una consulta clave enfocada en la esencia de la empresa y su oferta
    const queryVector = await generateEmbedding(
      "empresa organización marcas productos servicios soluciones personas equipo ubicación contacto",
      aiProvider,
      3,
      customApiKey
    );

    // 2. Recuperamos los top 12 chunks
    const matches = await queryPinecone(namespace, queryVector, 12);

    if (matches.length === 0) {
      return NextResponse.json(
        {
          namespace,
          requestedNamespace: rawNamespace,
          entities: [],
          summary: `No se encontraron documentos ni contexto cargado para el espacio '${namespace}'.`,
          sources: [],
        },
        { headers: CORS_HEADERS }
      );
    }

    const contextChunks: ContextChunk[] = matches.map((match) => ({
      url: match.metadata.url,
      h1: match.metadata.h1,
      text: match.metadata.text_chunk,
    }));

    // 3. Prompt de extracción de entidades
    const prompt = `Analiza todos los fragmentos de texto disponibles del sitio web y genera un informe de Entidades SEO completo y estructurado:

1. MARCAS Y ORGANIZACIÓN: Nombre de la empresa, marcas asociadas, partners o filiales.
2. PRODUCTOS Y SERVICIOS: Catálogo completo de soluciones, productos o servicios que ofrece.
3. PERSONAS Y EQUIPO: Nombres de directivos, autores, fundadores o personas mencionadas.
4. LUGARES Y COBERTURA: Ciudades, países, sedes físicas o ámbito territorial.
5. CONCEPTOS CLAVE DEL NICHO: Temas y términos técnicos representativos.
6. TABLA RESUMEN CON SCHEMA.ORG: Una tabla que relacione cada Entidad encontrada con su tipo de Schema.org recomendado (Organization, Product, Service, Person, LocalBusiness, etc.).

Presenta la información de forma ejecutiva, limpia y precisa.`;

    const { text, sources } = await generateRAGResponse(prompt, contextChunks, aiProvider, customApiKey);

    return NextResponse.json(
      {
        status: "success",
        namespace,
        requestedNamespace: rawNamespace,
        analysis: text,
        sources,
        chunksAnalyzed: contextChunks.length,
        providerUsed: aiProvider,
      },
      { headers: CORS_HEADERS }
    );
  } catch (error: any) {
    console.error("Error en /api/v1/entities:", error);
    return NextResponse.json(
      { error: error.message || "Error al extraer entidades del sitio." },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

export async function GET(req: NextRequest) {
  return handleEntities(req, false);
}

export async function POST(req: NextRequest) {
  return handleEntities(req, true);
}
