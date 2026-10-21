import { NextResponse } from "next/server";
import { getIndexStats, deleteNamespace } from "@/lib/pinecone";
import { getScrapioUserOrApiKey, isNamespaceAllowed } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
    const user = await getScrapioUserOrApiKey(req);
    if (!user) {
      return NextResponse.json(
        { error: "No autorizado. Se requiere sesión activa o token Scrapio API Key válido." },
        {
          status: 401,
          headers: { "Access-Control-Allow-Origin": "*" },
        }
      );
    }

    const stats = await getIndexStats();
    
    // Transformar los namespaces de Pinecone en un formato limpio para el frontend
    let namespacesList = Object.entries(stats.namespaces || {}).map(([name, data]) => ({
      name,
      slug: name.toLowerCase().replace(/\s+/g, "-"),
      vectorCount: data.recordCount || 0,
    }));

    // Si el usuario no es admin, ve ÚNICAMENTE los namespaces que le pertenecen o han sido asignados
    if (!user.isAdmin) {
      namespacesList = namespacesList.filter((ns) =>
        isNamespaceAllowed(user, ns.name)
      );
    }

    const totalVectors = user.isAdmin
      ? (stats.totalRecordCount || 0)
      : namespacesList.reduce((acc, ns) => acc + ns.vectorCount, 0);

    return NextResponse.json(
      {
        totalVectors,
        dimension: stats.dimension || 768,
        namespaces: namespacesList,
        isAdmin: user.isAdmin,
      },
      {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
          "Pragma": "no-cache",
          "Expires": "0",
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
    const user = await getScrapioUserOrApiKey(req);
    if (!user) {
      return NextResponse.json(
        { error: "No autorizado. Se requiere sesión activa o Scrapio API Key." },
        { status: 401 }
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

    // Solo admin o usuarios con permiso explícito sobre el namespace pueden eliminarlo
    if (!isNamespaceAllowed(user, namespace)) {
      return NextResponse.json(
        { error: `No tienes permisos para eliminar el proyecto/namespace '${namespace}'.` },
        { status: 403 }
      );
    }

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
