import { NextResponse } from "next/server";
import { getIndexStats } from "@/lib/pinecone";
import { getScrapioUser } from "@/lib/auth";

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
    },
  });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const queryKey = searchParams.get("key") || searchParams.get("apiKey");
    const authHeader = req.headers.get("Authorization");
    const xApiKey = req.headers.get("X-API-Key");
    const secretKey = process.env.SCRAPIO_API_KEY || "sk_scrapio_default_secret_key_2026";

    const hasApiKey =
      (queryKey && queryKey.trim() === secretKey) ||
      (xApiKey && xApiKey.trim() === secretKey) ||
      (authHeader && authHeader.startsWith("Bearer ") && authHeader.substring(7).trim() === secretKey);

    const user = await getScrapioUser();
    const stats = await getIndexStats();
    
    // Transformar los namespaces de Pinecone en un formato limpio para el frontend
    let namespacesList = Object.entries(stats.namespaces || {}).map(([name, data]) => ({
      name,
      slug: name.toLowerCase().replace(/\s+/g, "-"),
      vectorCount: data.recordCount || 0,
    }));

    // Si viene autenticado con API Key o el usuario es admin, ve todos los namespaces sin restricción
    const isAuthorizedFull = hasApiKey || Boolean(user?.isAdmin);

    if (!isAuthorizedFull && user) {
      // Filtrar tolerante a mayúsculas/minúsculas y guiones
      const clean = (s: string) =>
        s.toLowerCase().replace(/^cliente[-_]/, "").replace(/[-_]/g, " ").trim();
      const allowedClean = (user.allowedNamespaces || []).map(clean);

      namespacesList = namespacesList.filter((ns) =>
        allowedClean.includes(clean(ns.name))
      );
    } else if (!isAuthorizedFull && !user) {
      // Sin sesión y sin API Key
      return NextResponse.json(
        { error: "No autorizado. Se requiere sesión activa o token API Key." },
        {
          status: 401,
          headers: { "Access-Control-Allow-Origin": "*" },
        }
      );
    }

    return NextResponse.json(
      {
        totalVectors: stats.totalRecordCount || 0,
        dimension: stats.dimension || 768,
        namespaces: namespacesList,
        isAdmin: isAuthorizedFull,
      },
      {
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error: any) {
    console.error("Error en /api/namespaces:", error);
    return NextResponse.json(
      { error: error.message || "Error al obtener la lista de namespaces de Pinecone." },
      {
        status: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
      }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await getScrapioUser();
    if (!user || !user.isAdmin) {
      return NextResponse.json(
        { error: "Acceso denegado. Solo los administradores pueden eliminar proyectos/namespaces." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const namespace = searchParams.get("namespace");

    if (!namespace) {
      return NextResponse.json(
        { error: "El parámetro 'namespace' es obligatorio." },
        { status: 400 }
      );
    }

    const { deleteNamespace } = await import("@/lib/pinecone");
    await deleteNamespace(namespace);

    return NextResponse.json({
      success: true,
      message: `El namespace '${namespace}' ha sido eliminado exitosamente de Pinecone.`,
    });
  } catch (error: any) {
    console.error("Error en DELETE /api/namespaces:", error);
    return NextResponse.json(
      { error: error.message || "Error al eliminar el namespace en Pinecone." },
      { status: 500 }
    );
  }
}
