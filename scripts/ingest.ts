import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { crawlDomain } from "../lib/crawler";
import { generateEmbeddingsBatch } from "../lib/ai";
import { upsertToPinecone, UpsertItem, getExistingIndexedUrls } from "../lib/pinecone";
import crypto from "crypto";

async function reportProgress(data: {
  processedUrls: number;
  totalUrls: number;
  currentUrl: string;
  provider: string;
  quotaExhausted?: boolean;
}) {
  const apiUrl = process.env.SCRAPIO_API_URL || "https://scrapio-one.vercel.app";
  try {
    await fetch(`${apiUrl}/api/ingest/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  } catch {
    // Si no hay conectividad externa, continuamos localmente sin abortar
  }
}

async function main() {
  const args = process.argv.slice(2);
  let targetUrl = process.env.TARGET_URL || "https://avafin.mx";
  let namespace = process.env.CLIENT_NAMESPACE || "cliente-avafin";
  let maxPages = 20;
  let provider = process.env.AI_PROVIDER || "gemini";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--url" && args[i + 1]) targetUrl = args[i + 1];
    if (args[i] === "--namespace" && args[i + 1]) namespace = args[i + 1];
    if (args[i] === "--maxPages" && args[i + 1]) maxPages = parseInt(args[i + 1], 10);
    if (args[i] === "--provider" && args[i + 1]) provider = args[i + 1];
  }

  console.log("==========================================");
  console.log("🚀 SCRAPIO INGESTION PIPELINE (PONYTAIL MODE)");
  console.log(`URL Base: ${targetUrl}`);
  console.log(`Namespace: ${namespace}`);
  console.log(`Máximo de Páginas: ${maxPages}`);
  console.log(`Proveedor IA: ${provider.toUpperCase()}`);
  console.log("==========================================");

  if (provider === "openai" && !process.env.OPENAI_API_KEY && process.env.GEMINI_API_KEY) {
    console.warn("⚠️ Falta OPENAI_API_KEY en secretos. Alternando a Gemini.");
    provider = "gemini";
  } else if (provider === "gemini" && !process.env.GEMINI_API_KEY && process.env.OPENAI_API_KEY) {
    console.warn("⚠️ Falta GEMINI_API_KEY en secretos. Alternando a OpenAI.");
    provider = "openai";
  }

  if (!process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY) {
    console.error("❌ ERROR CRÍTICO: No se encontró GEMINI_API_KEY ni OPENAI_API_KEY.");
    process.exit(1);
  }

  if (!process.env.PINECONE_API_KEY) {
    console.error("❌ ERROR CRÍTICO: No se encontró PINECONE_API_KEY.");
    process.exit(1);
  }

  // 1. Rastreo de dominio
  console.log(`🌐 Fase 1: Rastreo y descubrimiento de URLs...`);
  const chunks = await crawlDomain({
    startUrl: targetUrl,
    maxPages,
    maxDepth: 3,
    chunkSize: 1000,
    chunkOverlap: 150,
  });

  if (chunks.length === 0) {
    console.error("❌ No se pudieron extraer chunks de contenido.");
    process.exit(1);
  }

  // Agrupar chunks por URL para rastrear progreso página por página
  const urlsMap = new Map<string, typeof chunks>();
  for (const chunk of chunks) {
    if (!urlsMap.has(chunk.url)) urlsMap.set(chunk.url, []);
    urlsMap.get(chunk.url)!.push(chunk);
  }
  const uniqueUrls = Array.from(urlsMap.keys());
  console.log(`📊 URLs únicas encontradas: ${uniqueUrls.length}`);

  // 2. Comprobar qué URLs ya existen en Pinecone para este namespace
  console.log(`🔎 Verificando URLs previamente indexadas en Pinecone (namespace: '${namespace}')...`);
  const existingUrls = await getExistingIndexedUrls(namespace);
  console.log(`💾 URLs ya indexadas previamente: ${existingUrls.size}`);

  const pendingUrls = uniqueUrls.filter((url) => !existingUrls.has(url));
  console.log(`🎯 URLs pendientes por procesar: ${pendingUrls.length}`);

  if (pendingUrls.length === 0) {
    console.log("✅ ¡Todas las URLs descubiertas ya están indexadas en Pinecone! Nada pendiente.");
    await reportProgress({
      processedUrls: uniqueUrls.length,
      totalUrls: uniqueUrls.length,
      currentUrl: "Completado",
      provider,
      quotaExhausted: false,
    });
    return;
  }

  // 3. Procesar URLs pendientes una a una con reporte en vivo
  console.log(`\n🧠 Fase 2: Procesamiento e inserción de embeddings con ${provider.toUpperCase()}...`);
  let quotaExhausted = false;
  let totalVectorsUpserted = 0;

  for (let i = 0; i < pendingUrls.length; i++) {
    const url = pendingUrls[i];
    const urlChunks = urlsMap.get(url)!;
    const currentTotalProcessed = existingUrls.size + i + 1;
    const remainingCount = uniqueUrls.length - currentTotalProcessed;
    const pct = Math.round((currentTotalProcessed / uniqueUrls.length) * 100);

    console.log(
      `[${provider.toUpperCase()}] URL ${currentTotalProcessed}/${uniqueUrls.length} (${pct}%) -> ${url} | Faltan ${remainingCount} URLs`
    );

    await reportProgress({
      processedUrls: currentTotalProcessed,
      totalUrls: uniqueUrls.length,
      currentUrl: url,
      provider,
      quotaExhausted: false,
    });

    const chunkTexts = urlChunks.map((c) => c.text);
    const { vectors, processedCount, quotaExhausted: isExhausted } = await generateEmbeddingsBatch(
      chunkTexts,
      provider,
      3,
      350
    );

    const upsertItems: UpsertItem[] = [];
    for (let j = 0; j < processedCount; j++) {
      const chunk = urlChunks[j];
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

    if (upsertItems.length > 0) {
      await upsertToPinecone(namespace, upsertItems);
      totalVectorsUpserted += upsertItems.length;
    }

    if (isExhausted) {
      quotaExhausted = true;
      const urlsInQueue = pendingUrls.length - (i + 1);
      console.log(`\n⚠️ LÍMITE DE CUOTA DE ${provider.toUpperCase()} ALCANZADO.`);
      console.log(`Se guardaron exitosamente los vectores hasta la URL actual.`);
      console.log(`Quedan ${urlsInQueue} URLs en cola para cuando se renueven los tokens.`);

      await reportProgress({
        processedUrls: currentTotalProcessed,
        totalUrls: uniqueUrls.length,
        currentUrl: url,
        provider,
        quotaExhausted: true,
      });
      break;
    }
  }

  console.log("==========================================");
  if (quotaExhausted) {
    console.log(`⚠️ INGESTA PAUSADA POR LÍMITE DE CUOTA DE GEMINI`);
    console.log(`Vectores agregados en esta sesión: ${totalVectorsUpserted}`);
    console.log(`Las URLs restantes quedan en cola y continuarán automáticamente en la próxima ejecución.`);
  } else {
    console.log(`🎉 INGESTA COMPLETADA EXITOSAMENTE AL 100%!`);
    console.log(`Total de URLs en el sitio: ${uniqueUrls.length}`);
    console.log(`Vectores nuevos cargados en Pinecone: ${totalVectorsUpserted}`);
  }
  console.log("==========================================");
}

main().catch((err) => {
  console.error("❌ Error en el proceso de ingesta:", err);
  process.exit(1);
});
