import { NextRequest, NextResponse } from "next/server";
import { getScrapioUserOrApiKey, isNamespaceAllowed } from "@/lib/auth";
import { getPineconeIndex, resolvePineconeNamespace } from "@/lib/pinecone";
import { getSupabaseClient, savePagesBatchToSupabase, populateLinksAndEntitiesForPages, PageRecord } from "@/lib/supabase";
import { toSlug } from "@/lib/crawler";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // 60 segundos de timeout en Vercel Pro

export async function POST(req: NextRequest) {
  try {
    const user = await getScrapioUserOrApiKey(req);
    if (!user) {
      return NextResponse.json({ error: "No autorizado." }, { status: 401 });
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Supabase no está configurado en las variables de entorno de este servidor. Asegúrate de añadir SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el panel de Vercel (Settings -> Environment Variables).",
        },
        { status: 500 }
      );
    }

    const body = await req.json();
    const rawNamespace = body.namespace;

    if (!rawNamespace) {
      return NextResponse.json({ error: "El campo 'namespace' es obligatorio." }, { status: 400 });
    }

    if (!isNamespaceAllowed(user, rawNamespace)) {
      return NextResponse.json({ error: "No tienes permiso sobre este namespace." }, { status: 403 });
    }

    const resolvedNs = await resolvePineconeNamespace(rawNamespace);
    const index = getPineconeIndex();
    const ns = index.namespace(resolvedNs);

    // Consultar vectores con metadata desde Pinecone
    const queryResponse = await ns.query({
      vector: new Array(768).fill(0),
      topK: 10000,
      includeMetadata: true,
    });

    if (!queryResponse.matches || queryResponse.matches.length === 0) {
      return NextResponse.json({
        success: false,
        message: `No se encontraron vectores en Pinecone para el namespace '${resolvedNs}'.`,
      });
    }

    // Agrupar chunks por URL
    const urlMap = new Map<string, { h1: string; chunks: string[]; createdAt?: string }>();

    for (const match of queryResponse.matches) {
      const meta = match.metadata as any;
      if (!meta || !meta.url) continue;

      if (!urlMap.has(meta.url)) {
        urlMap.set(meta.url, {
          h1: meta.h1 || "Sin Título",
          chunks: [],
          createdAt: meta.createdAt,
        });
      }

      if (meta.text_chunk) {
        urlMap.get(meta.url)!.chunks.push(meta.text_chunk);
      }
    }

    console.log(`📦 Reconstruyendo ${urlMap.size} páginas desde Pinecone hacia Supabase para '${resolvedNs}'...`);

    const pagesToInsert: PageRecord[] = [];

    for (const [url, info] of urlMap.entries()) {
      const slug = toSlug(url);
      const text = info.chunks.join("\n\n");
      const wordCount = text.split(/\s+/).filter(Boolean).length;

      const fullMarkdown = `---
url: "${url}"
slug: "${slug}"
title: "${info.h1.replace(/"/g, '\\"')}"
h1: "${info.h1.replace(/"/g, '\\"')}"
canonical: "${url}"
language: "es"
word_count: ${wordCount}
source: "pinecone_import"
crawled_at: "${info.createdAt || new Date().toISOString()}"
---

${text}`;

      pagesToInsert.push({
        namespace: resolvedNs, // Usar la forma canónica del namespace
        url,
        slug,
        title: info.h1,
        h1: info.h1,
        canonical: url,
        language: "es",
        word_count: wordCount,
        markdown_content: fullMarkdown,
        crawled_at: info.createdAt || new Date().toISOString(),
      });
    }

    const savedCount = await savePagesBatchToSupabase(pagesToInsert);

    if (savedCount === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "No se pudieron insertar páginas en Supabase. Verifica los permisos de la base de datos.",
        },
        { status: 500 }
      );
    }

    // Extraer y poblar enlaces internos y entidades del grafo
    try {
      await populateLinksAndEntitiesForPages(resolvedNs);
    } catch (graphErr: any) {
      console.warn("Advertencia poblando grafo relacional:", graphErr.message);
    }

    return NextResponse.json({
      success: true,
      namespace: rawNamespace,
      resolvedNamespace: resolvedNs,
      totalVectors: queryResponse.matches.length,
      pagesMigrated: savedCount,
      message: `¡Éxito! Se sincronizaron ${savedCount} páginas de '${resolvedNs}' desde Pinecone hacia Supabase en alta velocidad.`,
    });
  } catch (err: any) {
    console.error("Error en sync-pinecone:", err);
    return NextResponse.json({ error: err.message || "Error al sincronizar Pinecone con Supabase." }, { status: 500 });
  }
}
