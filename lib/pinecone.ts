import { Pinecone, RecordMetadata } from "@pinecone-database/pinecone";

export interface DocumentVectorMetadata extends RecordMetadata {
  url: string;
  h1: string;
  text_chunk: string;
  client_namespace: string;
  createdAt: string;
}

export interface UpsertItem {
  id: string;
  values: number[];
  metadata: DocumentVectorMetadata;
}

function getPineconeClient() {
  const apiKey = process.env.PINECONE_API_KEY;
  if (!apiKey) {
    throw new Error("Falta la variable de entorno PINECONE_API_KEY");
  }
  return new Pinecone({ apiKey });
}

export function getPineconeIndex() {
  const pc = getPineconeClient();
  const indexName = process.env.PINECONE_INDEX_NAME || "scrapio";
  return pc.index<DocumentVectorMetadata>(indexName);
}

/**
 * Inserta o actualiza vectores en Pinecone bajo un namespace específico
 */
export async function upsertToPinecone(namespace: string, items: UpsertItem[]) {
  const index = getPineconeIndex();
  const ns = index.namespace(namespace);

  // Pinecone recomienda lotes de máximo 100 vectores por request
  const batchSize = 100;
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await ns.upsert(batch);
  }

  return { success: true, count: items.length };
}

/**
 * Realiza una búsqueda semántica de vectores dentro de un namespace
 */
export async function queryPinecone(
  namespace: string,
  queryVector: number[],
  topK: number = 4
) {
  const index = getPineconeIndex();
  const ns = index.namespace(namespace);

  const queryResponse = await ns.query({
    vector: queryVector,
    topK,
    includeMetadata: true,
  });

  return queryResponse.matches.map((match) => ({
    id: match.id,
    score: match.score || 0,
    metadata: match.metadata as DocumentVectorMetadata,
  }));
}

/**
 * Obtiene las estadísticas e información de los namespaces en el índice
 */
export async function getIndexStats() {
  const index = getPineconeIndex();
  const stats = await index.describeIndexStats();
  return stats;
}

/**
 * Elimina todos los vectores contenidos en un namespace específico
 */
export async function deleteNamespace(namespace: string) {
  const index = getPineconeIndex();
  const ns = index.namespace(namespace);
  await ns.deleteAll();
  return { success: true };
}
