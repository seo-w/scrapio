import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { crawlDomain } from "../lib/crawler";
import { generateEmbedding } from "../lib/ai";
import { upsertToPinecone, UpsertItem } from "../lib/pinecone";
import crypto from "crypto";

async function main() {
  const args = process.argv.slice(2);
  let targetUrl = "https://avafin.mx";
  let namespace = "cliente-avafin";
  let maxPages = 10;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--url" && args[i + 1]) targetUrl = args[i + 1];
    if (args[i] === "--namespace" && args[i + 1]) namespace = args[i + 1];
    if (args[i] === "--maxPages" && args[i + 1]) maxPages = parseInt(args[i + 1], 10);
  }

  // Permitir lectura de env vars (ej. GitHub Actions workflow dispatch)
  if (process.env.TARGET_URL) targetUrl = process.env.TARGET_URL;
  if (process.env.CLIENT_NAMESPACE) namespace = process.env.CLIENT_NAMESPACE;

  console.log("==========================================");
  console.log("🚀 SCRAPIO INGESTION PIPELINE");
  console.log(`URL Base: ${targetUrl}`);
  console.log(`Namespace: ${namespace}`);
  console.log(`Máximo de Páginas: ${maxPages}`);
  console.log("==========================================");

  // 1. Rastreo y Extracción
  const chunks = await crawlDomain({
    startUrl: targetUrl,
    maxPages,
    maxDepth: 2,
    chunkSize: 1000,
    chunkOverlap: 150,
  });

  if (chunks.length === 0) {
    console.error("❌ No se pudieron extraer chunks de contenido.");
    process.exit(1);
  }

  console.log(`\n🧠 Generando vectores embeddings y preparando upsert para ${chunks.length} chunks...`);

  const upsertItems: UpsertItem[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const vector = await generateEmbedding(chunk.text);
    
    // Crear ID determinístico basado en URL + índice
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

    if ((i + 1) % 5 === 0 || i === chunks.length - 1) {
      console.log(`⏳ Procesados ${i + 1}/${chunks.length} vectores...`);
    }
  }

  // 2. Cargar en Pinecone bajo el Namespace específico
  console.log(`\n📤 Subiendo ${upsertItems.length} vectores a Pinecone bajo el namespace '${namespace}'...`);
  await upsertToPinecone(namespace, upsertItems);

  console.log(`\n🎉 INGESTA COMPLETADA CON ÉXITO!`);
  console.log(`Los datos de '${targetUrl}' ahora están disponibles aislados en el namespace: '${namespace}'`);
}

main().catch((err) => {
  console.error("❌ Error en el proceso de ingesta:", err);
  process.exit(1);
});
