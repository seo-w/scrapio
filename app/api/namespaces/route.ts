import { NextResponse } from "next/server";
import { getIndexStats } from "@/lib/pinecone";
import { getScrapioUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getScrapioUser();
    const stats = await getIndexStats();
    
    // Transformar los namespaces de Pinecone en un formato limpio para el frontend
    let namespacesList = Object.entries(stats.namespaces || {}).map(([name, data]) => ({
      name,
      vectorCount: data.recordCount || 0,
    }));

    // Si el usuario no es admin, filtrar estrictamente solo los namespaces que tiene permitidos
    if (user && !user.isAdmin) {
      namespacesList = namespacesList.filter((ns) =>
        user.allowedNamespaces.includes(ns.name)
      );
    }

    return NextResponse.json({
      totalVectors: stats.totalRecordCount || 0,
      dimension: stats.dimension || 768,
      namespaces: namespacesList,
      isAdmin: user?.isAdmin ?? false,
    });
  } catch (error: any) {
    console.error("Error en /api/namespaces:", error);
    return NextResponse.json(
      { error: error.message || "Error al obtener la lista de namespaces de Pinecone." },
      { status: 500 }
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
