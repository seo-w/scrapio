import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { crawlDomain } from "../lib/crawler";
import { generateEmbeddingsBatch } from "../lib/ai";
import { upsertToPinecone, UpsertItem } from "../lib/pinecone";
import crypto from "crypto";

async function main() {
  const args = process.argv.slice(2);
  let targetUrl = process.env.TARGET_URL || "https://avafin.mx";
  let namespace = process.env.CLIENT_NAMESPACE || "cliente-avafin";
  let maxPages = 20;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--url" && args[i + 1]) targetUrl = args[i + 1];
    if (args[i] === "--namespace" && args[i + 1]) namespace = args[i + 1];
    if (args[i] === "--maxPages" && args[i + 1]) maxPages = parseInt(args[i + 1], 10);
  }

  console.log("==========================================");
  console.log("🚀 SCRAPIO INGESTION PIPELINE");
  console.log(`URL Base: ${targetUrl}`);
  console.log(`Namespace: ${namespace}`);
  console.log(`Máximo de Páginas: ${maxPages}`);
  console.log("==========================================");

  if (!process.env.GEMINI_API_KEY) {
    console.error("❌ ERROR CRÍTICO: No se encontró la variable GEMINI_API_KEY en los secretos del repositorio de GitHub.");
    process.exit(1);
  }

  if (!process.env.PINECONE_API_KEY) {
    console.error("❌ ERROR CRÍTICO: No se encontró la variable PINECONE_API_KEY en los secretos del repositorio de GitHub.");
    process.exit(1);
  }

  // 1. Rastreo y Extracción
  console.log(`🌐 Iniciando fase 1: Rastreo de dominio...`);
  const chunks = await crawlDomain({
    startUrl: targetUrl,
    maxPages,
    maxDepth: 3,
    chunkSize: 1000,
    chunkOverlap: 150,
  });

  if (chunks.length === 0) {
    console.error("❌ No se pudieron extraer chunks de contenido del sitio especificado.");
    process.exit(1);
  }

  console.log(`\n🧠 Iniciando fase 2: Generación de vectores embeddings (${chunks.length} chunks)...`);

  const chunkTexts = chunks.map((c) => c.text);
  const { vectors, processedCount, quotaExhausted } = await generateEmbeddingsBatch(chunkTexts, 3, 350);

  const upsertItems: UpsertItem[] = [];

  for (let i = 0; i < processedCount; i++) {
    const chunk = chunks[i];
    const vector = vectors[i];
    
    const idHash = crypto.createHash("md5").update(`${chunk.url}#${i}`).digest("hex");
    
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

  // 2. Cargar en Pinecone bajo el Namespace específico
  if (upsertItems.length > 0) {
    console.log(`\n📤 Iniciando fase 3: Carga de ${upsertItems.length} vectores en Pinecone (namespace: '${namespace}')...`);
    await upsertToPinecone(namespace, upsertItems);
  }

  if (quotaExhausted) {
    console.log(`\n⚠️ INGESTA PARCIAL COMPLETADA (LÍMITE DE CUOTA DE GEMINI ALCANZADO)`);
    console.log(`Se guardaron exitosamente ${upsertItems.length} vectores procesados en Pinecone bajo el namespace '${namespace}'.`);
  } else {
    console.log(`\n🎉 INGESTA COMPLETADA CON ÉXITO!`);
    console.log(`Los datos de '${targetUrl}' ahora están disponibles aislados en el namespace: '${namespace}' (${upsertItems.length} vectores cargados)`);
  }
}

main().catch((err) => {
  console.error("❌ Error en el proceso de ingesta:", err);
  process.exit(1);
});
