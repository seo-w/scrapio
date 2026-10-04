import { NextRequest, NextResponse } from "next/server";
import { getScrapioUser } from "@/lib/auth";
import { scrapeSingleUrl } from "@/lib/crawler";
import { generateEmbeddingsBatch } from "@/lib/ai";
import { upsertToPinecone, UpsertItem } from "@/lib/pinecone";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  try {
    const user = await getScrapioUser();
    if (!user) {
      return NextResponse.json({ error: "No autenticado. Inicia sesión para continuar." }, { status: 401 });
    }

    const body = await req.json();
    const { url, namespace, aiProvider, customApiKey } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "El campo 'url' es obligatorio." }, { status: 400 });
    }

    if (!namespace || typeof namespace !== "string") {
      return NextResponse.json({ error: "El campo 'namespace' es obligatorio." }, { status: 400 });
    }

    // 1. Validar autorización sobre el namespace
    if (!user.isAdmin && !user.allowedNamespaces.includes(namespace)) {
      return NextResponse.json(
        { error: `No tienes permisos para modificar el proyecto '${namespace}'.` },
        { status: 403 }
      );
    }

    // 2. Validar permiso de proveedor de IA
    const provider = (aiProvider || process.env.AI_PROVIDER || "gemini").toLowerCase();
    if (provider === "openai" && !user.canUseOpenAI && !customApiKey) {
      return NextResponse.json(
        { error: "El modelo OpenAI está restringido. Ingresa tu propia clave en BYOK o usa Gemini." },
        { status: 403 }
      );
    }

    // 3. Descargar y procesar la URL específica
    const chunks = await scrapeSingleUrl(url);

    if (chunks.length === 0) {
      return NextResponse.json(
        { error: "No se pudo extraer contenido útil o texto suficiente de esta página." },
        { status: 422 }
      );
    }

    // 4. Vectorizar los chunks
    const chunkTexts = chunks.map((c) => c.text);
    const { vectors, processedCount, quotaExhausted } = await generateEmbeddingsBatch(
      chunkTexts,
      provider,
      3,
      350,
      customApiKey
    );

    if (quotaExhausted || processedCount === 0) {
      return NextResponse.json(
        { error: "Se ha alcanzado el límite de cuota en el proveedor de IA. Intenta con tu propia API Key (BYOK)." },
        { status: 429 }
      );
    }

    // 5. Formatear y subir vectores a Pinecone bajo el namespace correspondiente
    const upsertItems: UpsertItem[] = [];
    for (let j = 0; j < processedCount; j++) {
      const chunk = chunks[j];
      const vector = vectors[j];
      const idHash = crypto.createHash("md5").update(`${chunk.url}#${j}`).digest("hex");

      upsertItems.push({
        id: `${namespace}-${idHash}`,
        values: vector,
        metadata: {
          url: chunk.url,
          h1: chunk.h1,
          text_chunk: chunk.text,
          client_namespace: namespace,
          createdAt: new Date().toISOString(),
        },
      });
    }

    await upsertToPinecone(namespace, upsertItems);

    return NextResponse.json({
      success: true,
      url,
      namespace,
      chunksIndexed: upsertItems.length,
      providerUsed: provider,
      message: `¡URL indexada con éxito! Se generaron y guardaron ${upsertItems.length} vectores en Pinecone.`,
    });
  } catch (err: any) {
    console.error("Error en POST /api/urls/index-single:", err);
    return NextResponse.json(
      { error: err.message || "Error al indexar la página individual." },
      { status: 500 }
    );
  }
}
