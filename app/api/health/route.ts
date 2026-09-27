import { NextResponse } from "next/server";
import { getIndexStats } from "@/lib/pinecone";

export async function GET() {
  const issues: string[] = [];

  if (!process.env.GEMINI_API_KEY) {
    issues.push("Falta la variable de entorno GEMINI_API_KEY en Vercel.");
  }

  if (!process.env.PINECONE_API_KEY) {
    issues.push("Falta la variable de entorno PINECONE_API_KEY en Vercel.");
  }

  if (!process.env.GITHUB_TOKEN) {
    issues.push("Falta la variable GITHUB_TOKEN en Vercel (requerida para disparar escaneos automáticamente desde la web).");
  }

  let pineconeOk = false;
  let vectorCount = 0;
  let namespacesCount = 0;

  try {
    const stats = await getIndexStats();
    pineconeOk = true;
    vectorCount = stats.totalRecordCount || 0;
    namespacesCount = Object.keys(stats.namespaces || {}).length;
  } catch (err: any) {
    issues.push(`Error al conectar con Pinecone: ${err.message || err}`);
  }

  return NextResponse.json({
    status: issues.length === 0 ? "healthy" : "warning",
    pineconeOk,
    vectorCount,
    namespacesCount,
    issues,
  });
}
