import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9\-_.]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function main() {
  const args = process.argv.slice(2);
  let namespace = "";
  let outDirArg = "";

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "--namespace" || args[i] === "-n") && args[i + 1]) {
      namespace = args[i + 1];
    }
    if ((args[i] === "--out" || args[i] === "-o") && args[i + 1]) {
      outDirArg = args[i + 1];
    }
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("❌ Error: Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local.");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Si no se proporcionó namespace, listamos los que existen en la BD
  if (!namespace) {
    console.log("ℹ️ No especificaste ningún namespace. Buscando namespaces disponibles en Supabase...\n");
    const { data: samplePages, error } = await supabase
      .from("pages")
      .select("namespace")
      .not("namespace", "is", null)
      .limit(2000);

    if (error) {
      console.error("❌ Error al consultar namespaces:", error.message);
      process.exit(1);
    }

    const availableNamespaces = Array.from(
      new Set((samplePages || []).map((p: any) => p.namespace).filter(Boolean))
    );

    if (availableNamespaces.length === 0) {
      console.log("⚠️ No se encontraron páginas con namespace en la base de datos.");
    } else {
      console.log("📂 Namespaces encontrados:");
      availableNamespaces.forEach((ns) => console.log(`  - ${ns}`));
      console.log("\n💡 Para descargar uno, ejecuta:");
      console.log(`  npm run export-md -- --namespace "${availableNamespaces[0]}"`);
    }
    return;
  }

  console.log(`🔍 Consultando páginas para el namespace: '${namespace}'...`);

  const { data: pages, error } = await supabase
    .from("pages")
    .select("id, url, slug, title, h1, markdown_content, crawled_at")
    .ilike("namespace", namespace)
    .order("crawled_at", { ascending: false });

  if (error) {
    console.error("❌ Error al obtener páginas de Supabase:", error.message);
    process.exit(1);
  }

  if (!pages || pages.length === 0) {
    console.warn(`⚠️ No se encontraron páginas para el namespace '${namespace}'.`);
    return;
  }

  const outputDirectory = outDirArg || path.join(process.cwd(), "markdown_exports", sanitizeFilename(namespace));
  if (!fs.existsSync(outputDirectory)) {
    fs.mkdirSync(outputDirectory, { recursive: true });
  }

  console.log(`📦 Descargando ${pages.length} páginas a: ${outputDirectory}\n`);

  const usedFilenames = new Set<string>();
  let exportedCount = 0;

  for (const page of pages) {
    const rawContent = page.markdown_content || "";
    let baseName = page.slug ? sanitizeFilename(page.slug) : "";

    if (!baseName || baseName === "index" || baseName === "inicio") {
      try {
        const parsed = new URL(page.url);
        const pathPart = parsed.pathname.replace(/^\/|\/$/g, "").replace(/\//g, "-");
        baseName = sanitizeFilename(pathPart || parsed.hostname);
      } catch {
        baseName = sanitizeFilename(page.title || "pagina");
      }
    }

    if (!baseName) baseName = `page-${page.id || Date.now()}`;

    // Evitar colisiones de nombres repetidos
    let fileName = `${baseName}.md`;
    let counter = 2;
    while (usedFilenames.has(fileName.toLowerCase())) {
      fileName = `${baseName}-${counter}.md`;
      counter++;
    }
    usedFilenames.add(fileName.toLowerCase());

    const filePath = path.join(outputDirectory, fileName);
    fs.writeFileSync(filePath, rawContent, "utf-8");
    exportedCount++;
    console.log(`  ✓ Guardado: ${fileName} (${page.url})`);
  }

  console.log("\n=======================================================");
  console.log(`🎉 ¡Exportación completada con éxito!`);
  console.log(`📁 Total de archivos .md guardados: ${exportedCount}`);
  console.log(`📍 Carpeta destino: ${outputDirectory}`);
  console.log("=======================================================");
}

main().catch((err) => {
  console.error("Error fatal:", err);
  process.exit(1);
});
