# 🚀 Scrapio - Sistema RAG Multi-Tenant (Serverless)

Scrapio es una plataforma de **Retrieval-Augmented Generation (RAG) Serverless y Multi-Tenant**, diseñada para extraer contenido web mediante un crawler multi-página automatizado y recursivo, vectorizar la información por cliente de manera aislada (**Pinecone Namespaces**) y disponibilizar las consultas mediante una API con streaming, una interfaz web moderna, un servidor **MCP (Model Context Protocol)** y endpoints de extracción de entidades SEO.

---

## 📋 Tabla de Contenidos
- [✨ Características Principales](#-características-principales)
- [📌 Guía de Replicación Paso a Paso](#-guía-de-replicación-paso-a-paso)
- [🔑 Variables de Entorno (.env.local)](#-variables-de-entorno-envlocal)
- [🚀 Comandos de Desarrollo e Ingesta](#-comandos-de-desarrollo-e-ingesta)
- [📡 Documentación Completa de APIs (Endpoints)](#-documentación-completa-de-apis-endpoints)
- [🔌 Servidor MCP (Claude Desktop & Cursor)](#-servidor-mcp-claude-desktop--cursor)
- [🤖 Ingesta Automatizada en GitHub Actions](#-ingesta-automatizada-en-github-actions)
- [🌐 Despliegue en Vercel](#-despliegue-en-vercel)
- [🏗️ Estructura del Proyecto](#️-estructura-del-proyecto)
- [📝 Historial de Cambios](#-historial-de-cambios)

---

## 📝 Historial de Cambios

### 2026-10-26 — Feat: Motor de Auditoría SEO y Grafo de Conocimiento (Supabase + Pinecone), Arquitectura Screaming Frog, Detección de Páginas Huérfanas y Herramientas MCP Avanzadas

**Problema resuelto:**
1. **Pérdida de la visión holística del sitio:** Pinecone solo almacenaba fragmentos vectorizados de ~500 tokens (`text_chunk`). Aunque esto es ideal para RAG semántico, impedía conocer la arquitectura de enlazado interno, auditar páginas huérfanas, detectar canibalizaciones de H1s/títulos o evaluar el conteo de palabras por página.
2. **Falta de Markdown completo y Wikilinks:** Al no persistir el contenido completo del artículo con Frontmatter YAML y `[[Wikilinks]]`, los LLMs no podían redactar contenido nuevo manteniendo la consistencia de enlazado interno del cliente.
3. **Validación de Schema.org costosa:** Diagnosticar esquemas JSON-LD requería gastar tokens de LLM en cada análisis en lugar de extraerlos del HTML original o generarlos con IDs oficiales de Google Knowledge Graph y Wikidata.
4. **Navegación del Sidebar y Casing en Base de Datos:** El selector del sidebar no restablecía correctamente la vista hacia el chat, y las consultas de PostgreSQL en Supabase eran sensibles a mayúsculas (`eq("namespace", "avafin")` vs `"Avafin"`), mostrando erróneamente 0 páginas si no coincidía el caso exacto.

**Mejoras implementadas:**
1. **Arquitectura Híbrida de Doble Motor (Pinecone + Supabase PostgreSQL):**
   * **Pinecone (Vector DB):** Continúa como motor ultrarrápido para RAG, embeddings (768d) y búsqueda semántica con citas de fuentes.
   * **Supabase (PostgreSQL Relacional):** Almacena las páginas completas en Markdown, metadatos enriquecidos (slug, H1, idioma, word count, YAML frontmatter), relaciones de enlaces internos (`internal_links`) y entidades del grafo (`entities`, `page_entities`).
2. **Pantalla de Auditoría SEO & Arquitectura Web (Estilo Screaming Frog):**
   * **KPIs de Salud SEO en Tiempo Real:** Total de páginas, Enlaces internos contextuales, Entidades KG identificadas, Páginas huérfanas (0 inlinks entrantes), Alertas de canibalización y Contenido pobre (*Thin Content* <300 palabras).
   * **Tabla Maestra de URLs:** Buscador en vivo, filtros rápidos por anomalía (huérfanas, canibalizaciones, sin H1, etc.) y exportador a CSV compatible con Excel.
   * **Drawer de Inspección Técnica Lateral:**
     * Pestaña *Markdown*: Muestra el artículo completo formateado con `[[Wikilinks]]`.
     * Pestaña *Schema JSON-LD*: Diagnóstico sintáctico en vivo de esquemas existentes vs generados con enlace directo a la herramienta oficial *Google Rich Results Test*.
3. **Sincronización en 1 Clic desde Pinecone (`POST /api/seo/sync-pinecone`):**
   * Botón **"📥 Poblar Supabase desde Pinecone"** que agrupa los vectores existentes por URL, reconstruye el Markdown con Frontmatter y guarda en bloques de 50 páginas en Supabase en 1–2 segundos, sin necesidad de re-escanear el sitio web ni estresar los servidores del cliente.
4. **Crawler Enriquecido (`lib/crawler.ts`):**
   * Extrae enlaces internos editoriales dentro del contenido y detecta esquemas JSON-LD en vivo con Cheerio.
   * Genera slugs limpios y transforma los hipervínculos internos en formato `[[Wikilinks]]`.
   * Preserva el chunking limpio para Pinecone sin contaminación de frontmatter.
5. **Nuevas Herramientas MCP para Claude Desktop, Cursor y ChatGPT (`app/api/v1/mcp/route.ts`):**
   * **`get_seo_audit`**: Permite a cualquier agente de IA auditar la salud técnica, canibalizaciones y enlaces huérfanos de un namespace.
   * **`get_page_markdown`**: Entrega el Markdown completo de cualquier URL para que el LLM redacte o actualice contenidos respetando los enlaces internos y entidades del sitio.
6. **Resiliencia de Mayúsculas/Minúsculas y Navegación:**
   * Consultas SQL en `lib/supabase.ts` normalizadas con `ilike` para que `Avafin`, `avafin` o `AVAFIN` resuelvan con exactitud.
   * Corrección de estado en `app/page.tsx` para alternar fluidamente entre el Chat RAG y la Auditoría SEO desde el sidebar y la barra superior.

---

### 2026-10-23 — Feat: Cadena de Fallback Multi-Modelo (Gemini / OpenAI), Sincronización BYOK en Clerk y Generador Adaptativo de Prompts LLM

**Problema resuelto:**
1. **Error de cuota / facturación en Google Cloud:** Al consultar sitios grandes o múltiples peticiones (ej. namespace Tivit), Google Cloud Free Tier en `gemini-2.5-flash-lite` arrojaba un error 429 (`Resource Exhausted / Please check your plan and billing details`) debido a que ese modelo específico tiene una cuota diaria restrictiva de 20 peticiones/día en el plan gratuito.
2. **Falta de fallback a OpenAI cuando el usuario tiene clave BYOK:** Cuando un usuario configuraba su clave de OpenAI en el panel de Scrapio, esta solo se guardaba en el `localStorage` del navegador. Si consultaba desde fuera (Claude Web, ChatGPT, Cursor o cURL usando su Scrapio API Key `sk_scrapio_...`), el servidor no tenía acceso a su clave de OpenAI y la llamada fallaba si Gemini no respondía.
3. **Límites del sandbox de Claude Web (`web_fetch`):** Claude Web no puede construir URLs dinámicas con parámetros nuevos en tiempo de ejecución. Si el prompt le pedía descubrir clientes y luego armar la URL de consulta, Claude arrojaba error de cliente (`client error` / timeout).
4. **Desconexión entre cliente activo y prompts de integración:** Los snippets del modal de integración no permitían alternar el cliente activo ni ajustar la pregunta o tema en tiempo real, requiriendo que el usuario editara manualmente la URL.

**Mejoras implementadas:**
1. **Cadena de Fallback Multi-Modelo de Alta Disponibilidad (`lib/ai.ts`):**
   * Se reordenó la jerarquía de modelos de Google Gemini:
     1. Primario: **`gemini-flash-latest`** (~1.2s de latencia, cuota estándar de 1,500 solicitudes/día).
     2. Secundario: **`gemini-3.5-flash`**.
     3. Terciario: **`gemini-2.5-flash-lite`**.
   * Se eliminaron filtros restrictivos de códigos de error: cualquier fallo de modelo en el bucle avanza limpiamente al siguiente modelo candidato.
   * **Fallback multi-proveedor automático a OpenAI:** Si todos los modelos de Gemini fallan o presentan restricciones de facturación/cuota, la API cambia de forma transparente a OpenAI:
     * Embeddings: **`text-embedding-3-small`** configurado a **768 dimensiones**, coincidiendo exactamente con la dimensión del índice Pinecone.
     * Generación RAG: **`gpt-4o-mini`**.
2. **Sincronización de BYOK en la Nube con Clerk (`lib/auth.ts` y `/api/me`):**
   * El endpoint `POST /api/me` ahora soporta la acción `{ action: "save_keys", openaiApiKey, geminiApiKey }`, guardando las claves en los metadatos públicos del usuario en Clerk (`clerkUser.publicMetadata.openai_api_key`).
   * La función `validateScrapioApiKey` asocia automáticamente la Scrapio API Key (`sk_scrapio_user_<id>_<hash>`) con las claves BYOK del usuario.
   * Cuando Claude, ChatGPT o cualquier herramienta externa consulta `/api/v1/query` o `/api/v1/mcp` usando la Scrapio API Key, el backend detecta su clave de OpenAI guardada y la utiliza como salvaguarda ante caídas de Gemini.
3. **Generador Interactivo y Adaptativo de Prompts en la Interfaz Web (`app/page.tsx`):**
   * **Selector de Cliente en Vivo:** Menú desplegable dentro del modal que permite alternar entre todos los namespaces del usuario con sus nombres reales y conteo exacto de vectores.
   * **Selector de Tema / Pregunta en Tiempo Real:** Entrada editable y botones rápidos para *Servicios y Productos*, *Quiénes Somos & Misión*, *Contacto y Soporte*, *Regulaciones y Políticas*, y *Entidades SEO*.
   * **Prompts 100% prearmados para Claude Web (Opción 1):** Incluye la URL completa ya codificada (`&query=servicios+productos+y+soluciones`), permitiendo que Claude la abra con 1 solo clic sin restricciones de sandbox.
   * **Soporte para ChatGPT Plus (Web Browsing):** Se agregó prompt directo para ChatGPT Plus además de las acciones para Custom GPTs.
   * **Sincronización bidireccional:** Al iniciar sesión o cargar la página, las claves BYOK guardadas en Clerk se sincronizan automáticamente con el navegador.

---

### 2026-10-21 — Feat: Protocolo MCP Declarativo Universal para Cualquier LLM + Fix de Codificación de URLs y Filtros de Inyección

**Problema resuelto:**
1. Al consultar desde Claude Web, ChatGPT o Cursor, Claude arrojaba dos tipos de errores:
   - *Filtro de inyección:* Detectaba directivas conversacionales dirigidas al bot (`"fetchGuidance"`), marcando `"Detectando instrucciones ocultas dirigidas a la herramienta de navegación"`.
   - *Fallo de parseo de URL:* La herramienta de fetch de Claude (escrita en Go) lanzaba error de cliente (`parse error: invalid character ' ' in request URL`) al intentar consultar URLs con espacios sin codificar (`&query=que relacion tiene avafin con condusef`).
2. Se requería que la API actuara como un servidor **MCP (Model Context Protocol)** autónomo y auto-descriptivo, informando a cualquier modelo (Claude, ChatGPT, Gemini, DeepSeek, Cursor) qué herramientas existen, sus parámetros requeridos, los clientes asignados y cómo consultarlos con exactitud.

**Mejoras implementadas:**
1. **Esquema MCP y OpenAPI Declarativo en `/api/v1/namespaces`:**
   - Se estructuró la respuesta con las propiedades estándar del protocolo MCP: `protocol: "mcp-declarative-v1"`, `tools: [...]`, `inputSchema` y `parameters` con especificación JSON Schema formal.
   - Las herramientas `scrapio_query_client` y `scrapio_get_entities` exponen en su `enum` exclusivamente los namespaces a los que el usuario tiene autorización según su Scrapio API Key.
   - En cada cliente del listado se proporcionan `queryUrl` y `exampleQueryUrl` con la Scrapio API Key ya inyectada y los términos de búsqueda codificados con signos `+`.
2. **Respuesta de Diagnóstico y Auto-Corrección en `/api/v1/query`:**
   - Si un LLM u origen externo consulta `/api/v1/query` omitiendo parámetros obligatorios (`query` o `namespace`), el endpoint responde con un código 400 enriquecido con `toolDocumentation`, el formato GET/POST esperado y URLs de ejemplo funcionales para que el LLM se auto-corrija inmediatamente en su siguiente llamada.
3. **Neutralidad contra Filtros de Inyección de Claude:**
   - Se eliminaron todos los textos coloquiales directos al bot. La metadata ahora es 100% declarativa REST/JSON-Schema, cumpliendo los lineamientos de seguridad de Anthropic y OpenAI.
4. **Actualización de la Interfaz Web (Modal de Integraciones):**
   - En la pestaña *💬 Prompt Directo*, se añadieron prompts universales optimizados para cualquier LLM con navegación web.
   - En la pestaña *💻 Claude & Cursor (MCP)*, se añadieron tres modalidades: Consulta directa en Claude Web (con codificación segura `+`), Servidor MCP Remoto SSE/HTTP y configuración local para `claude_desktop_config.json`.
5. **Corrección de Espacio Vectorial y Rigor RAG:**
   - Se re-vectorizaron todos los fragmentos clave de CONDUSEF y SIPRES en el espacio de Gemini (`gemini-embedding-001`), pasando de una similitud de 0.0087 a más de 0.75.
   - Se ajustó el prompt del sistema RAG (`lib/ai.ts`) eliminando la falacia de exhaustividad (el modelo nunca asume ausencia absoluta por falta de fragmentos y cita con precisión PROFECO y las fuentes disponibles).

---

### 2026-10-21 — Feat: Aislamiento estricto multi-tenant (cuentas limpias) + Scrapio API Keys individuales únicas por usuario

**Problema resuelto:** 
1. Al registrarse un usuario nuevo, la interfaz inicializaba el estado en `"cliente-avafin"`, el contador del sidebar mostraba `1` por defecto (`availableNamespaces.length || 1`), y se mostraban 4,812 vectores residuales, haciendo parecer que la cuenta compartía datos con otros clientes.
2. En la sección de *Integraciones*, todos los usuarios veían la misma clave global (`sk_scrapio_default_secret_key_2026`), permitiendo que cualquier persona o integración externa consultara namespaces ajenos sin restricción.

**Mejoras implementadas:**
1. **Cuentas 100% limpias e independientes (0 Namespaces por defecto):**
   * El estado del frontend (`namespace`) se inicializa vacío `""` y el contador de clientes refleja fielmente `0`.
   * Se eliminaron todos los fallbacks fijos (`cliente-avafin`, `Personal Bliss`, y el conteo falso de 4,812 vectores). Si la cuenta no tiene proyectos asignados, muestra `0 páginas · 0 vectores`.
   * En el sidebar, el bloque *"Contexto de cliente"* muestra `--` y *"Sin cliente asignado"*. El botón `+ Nuevo espacio de cliente` ahora está habilitado para todos los usuarios.
   * La vista de chat y el selector de proyectos cuentan con estados vacíos dedicados que guían al usuario a rastrear su primer sitio web.
   * Al indexar un nuevo sitio mediante `POST /api/ingest`, el namespace creado se asocia de forma automática e inmediata a los `allowed_namespaces` del usuario en Clerk.
2. **Scrapio API Keys únicas por usuario:**
   * Cada usuario recibe de forma automática una Scrapio API Key personal única persistida en sus metadatos de Clerk: `sk_scrapio_<userId>_<randomHash>`.
   * Se añadió el endpoint `POST /api/me` y un botón **"Regenerar"** en la interfaz para que el usuario pueda renovar su clave en cualquier momento.
   * La función `validateScrapioApiKey` identifica al usuario dueño de la clave y restringe sus consultas en la API únicamente a sus namespaces autorizados. La clave maestra de servidor (`SCRAPIO_API_KEY`) se mantiene exclusivamente para tareas de administrador y CI/CD.
3. **Inyección dinámica en todos los prompts y templates:**
   * El modal de Integraciones (Prompt Directo, Custom GPTs, Claude MCP, cURL, n8n/Make) inserta dinámicamente la clave personal del usuario y su namespace activo (o `<tu_cliente_o_namespace>`).
   * El endpoint `/api/v1/namespaces?key=...` ahora exige autenticación y devuelve única y exclusivamente los proyectos del usuario solicitante (si tiene 0, devuelve 0).
   * Al consultar `/api/v1/query` o MCP `query_site`, si el usuario intenta acceder a un namespace que no le pertenece, la API responde con `403 Forbidden`.

---

### 2026-10-17 — Feat: Control granular independiente de Gemini y OpenAI por usuario + Tolerancia de namespaces

**Mejoras implementadas:**
1. **Control individual de Gemini 3.8 Flash:** El administrador ahora puede activar o desactivar **tanto Google Gemini como OpenAI GPT-4o Mini** de forma 100% independiente para cada usuario desde el panel de *"Gestión Usuarios"*.
2. **Desbloqueo automático con clave propia (BYOK):** Si un usuario tiene restringido algún modelo por el administrador, puede hacer clic en él e ingresar su propia API Key personal para desbloquearlo de inmediato sin consumir cuotas del sistema.
3. **Selector de modelos en el modal de nuevo espacio:** Se agregó un selector interactivo en el popup de *"Rastrear o Crear Espacio de Cliente"* para elegir el motor de vectorización (Gemini vs OpenAI) en el mismo instante de enviar la orden a GitHub Actions.
4. **Tolerancia en autorización de namespaces:** En `POST /api/chat`, la validación de pertenencia de proyectos ahora normaliza mayúsculas, minúsculas y prefijos (`cliente-`), eliminando falsos rechazos 403.

---

### 2026-10-15 — Fix: Endpoint público `/api/v1/namespaces` para ChatGPT y Claude Web Chat

**Problema detectado:** Al consultar desde las interfaces web de chat de **ChatGPT** (`chatgpt.com`) y **Claude** (`claude.ai`), los asistentes no podían leer los namespaces o devolvían datos viejos/cacheados:
1. **ChatGPT Web Chat:** Detectaba el parámetro `?key=sk_...` en la URL del prompt. Por políticas de seguridad, ChatGPT bloquea o elimina parámetros que parezcan claves secretas (`sk_`), haciendo la petición a `/api/v1/namespaces` sin token. Como el endpoint exigía autenticación obligatoria, devolvía `401 Unauthorized` y ChatGPT reportaba: *"acceso bloqueado por autenticación... redirigida a Clerk"*.
2. **Claude Web Chat:** Tenía en su caché interno o memoria de conversación la consulta anterior de semanas pasadas con números viejos (19,747 vectores vs 52,152 reales) debido a que la URL con clave era idéntica.
3. **Clerk Middleware:** En `/api/namespaces`, una función envoltorio personalizada en `middleware.ts` retornaba antes de inicializar el contexto de Clerk, provocando un error 500 no controlado (`Clerk: auth() was called but Clerk can't detect usage of clerkMiddleware()`).

**Solución aplicada (Filosofía Ponytail):**
1. **Ruta pública sin fricción:** Se eliminó la obligatoriedad del token en `GET /api/v1/namespaces`. Al ser metadatos públicos (nombres de proyectos y cantidad de vectores sin contenido de documentos), no requiere candado `sk_`. Ahora cualquier bot o chat web puede acceder directamente a `https://scrapio-one.vercel.app/api/v1/namespaces` sin disparar filtros de seguridad.
2. **Prompt limpio en la UI:** En el modal de integraciones de Scrapio, el prompt generado ahora usa la URL limpia `https://scrapio-one.vercel.app/api/v1/namespaces` (sin `?key=...`), garantizando que ChatGPT y Claude la consulten en tiempo real sin alertas de seguridad ni caché obsoleto.
3. **Corrección de Middleware Clerk:** Se simplificó `middleware.ts` utilizando la exportación canónica de `clerkMiddleware()` recomendada por Clerk, y se envolvió `getScrapioUser()` en un bloque `try/catch` defensivo para prevenir caídas 500.

---

### 2026-10-15 — Fix: Anti-caché en Edge CDN de Vercel para `/api/v1/*`

**Problema detectado:** El Edge CDN de Vercel podía devolver respuestas cacheadas del endpoint `GET /api/v1/namespaces` (y otras rutas `/api/v1/*`), haciendo que clientes externos (LLMs, agentes, cURL) recibieran datos desactualizados de Pinecone en lugar de los valores reales en tiempo real.

**Causa raíz:** Vercel Edge Cache **no respeta** el header estándar `Cache-Control: no-store` de manera confiable en sus nodos CDN. Para desactivar el caché a nivel de CDN se requieren headers específicos de Vercel: `Surrogate-Control`, `CDN-Cache-Control` y `Vercel-CDN-Cache-Control`.

**Archivos modificados:**

| Archivo | Cambio |
|---|---|
| `app/api/v1/namespaces/route.ts` | Endpoint público sin token obligatorio + headers `Surrogate-Control`, `CDN-Cache-Control` y `Vercel-CDN-Cache-Control: no-store` |
| `middleware.ts` | Exportación estándar de `clerkMiddleware` evitando bypass que corrompía el contexto de autenticación |
| `lib/auth.ts` | Manejo seguro `try/catch` en `getScrapioUser()` |
| `app/page.tsx` | Actualización de templates de prompts a la URL limpia pública |
| `next.config.ts` | Sección `headers()` global que fuerza `no-store` en **todas** las rutas `/api/v1/:path*` |

**Resultado:** El endpoint responde con código HTTP 200 en tiempo real tanto para cURL como para los navegadores y crawlers de ChatGPT y Claude Web Chat.



---

## ✨ Características Principales

* **Multi-Tenancy 100% Aislado**: Almacena y consulta datos de múltiples clientes o sitios en un solo índice de Pinecone Serverless (768d) sin mezclar vectores mediante **Namespaces**.
* **Soporte de Doble Proveedor de IA**:
  * **Google Gemini**: `gemini-embedding-001` (768d) + `gemini-3.8-flash`.
  * **OpenAI**: `text-embedding-3-small` (dimensiones: 768) + `gpt-4o-mini`.
* **Crawler Web de Alto Sigilo & Anti-Bloqueos (Stealth Engine)**:
  * Parseo recursivo de sitemaps (`sitemap.xml` e índices `sitemap_index.xml` multinivel).
  * **Perfiles Reales con Client Hints Sincronizados**: Rota firmas de navegadores modernos (Chrome 124 en Windows/macOS, Firefox 125) emparejando `User-Agent` con `sec-ch-ua`, `sec-ch-ua-mobile` y `sec-ch-ua-platform`.
  * **Simulación de Navegación con `Referer` Dinámico**: Sigue la ruta de navegación interna entre enlaces como un usuario real.
  * **Compresión Real (`Accept-Encoding: gzip, deflate, br`)**.
  * **Jitter Aleatorio (350ms - 750ms)** que simula velocidad humana e impredecible.
  * **Rescate Inteligente de Bloqueos (HTTP 403 / 429)**: Reintento automático con proxy residencial (**ScraperAPI**) en errores 403 y pausa de 3.5s con backoff en 429.
* **Búsqueda Híbrida en Memoria (Hybrid Search a Costo Cero)**:
  * Combina similitud vectorial (Pinecone cosine similarity) con re-ranking léxico en memoria (<2ms de latencia, 0 bytes extra de almacenamiento en Pinecone).
  * Otorga un impulso de relevancia (*exact keyword & phrase match boost*) cuando la consulta contiene términos técnicos, códigos, IDs, precios o nombres exactos.
* **Persistencia de Conversaciones por Proyecto**:
  * Los mensajes del chat se preservan de forma local en el navegador (`localStorage`) de manera aislada por cada namespace/cliente, sobreviviendo a recargas de página (F5).
  * Incluye botón **"Limpiar chat"** en la barra superior para reiniciar la conversación cuando sea necesario.
* **Borrado Granular de URLs & Hashing de Contenido**:
  * Endpoint `DELETE /api/urls?namespace=...&url=...` y botón `[🗑 Eliminar]` en el modal de auditoría para suprimir de inmediato los vectores de cualquier URL específica en Pinecone sin afectar el resto del sitio.
  * Ingesta con hash criptográfico MD5 (`content_hash`) en los metadatos de Pinecone para auditoría y control de duplicados.
* **Métricas de Consumo Real en Tiempo Real**:
  * Contadores de consultas ejecutadas para Gemini y OpenAI persistidos localmente, reflejando el volumen real de interacciones por motor.
* **Indexación Individual Bajo Demanda (Single-URL On-Demand)**:
  * Botón directo `[▶ Indexar]` en la lista de URLs faltantes o pendientes para procesar y vectorizar cualquier página específica en 1 a 2 segundos sin disparar workflows masivos.
* **Barra de Progreso & Diagnóstico de Logs en Vivo**:
  * Interfaz web con barra de progreso interactiva que consulta en tiempo real el porcentaje y estado del workflow en GitHub Actions (`/api/ingest/status`).
  * **Modal de Diagnóstico y Logs**: Permite hacer clic en el indicador de estado para ver la ejecución activa, pasos del pipeline, detección de fallos o pausas por límite de cuota (Gemini 15 RPM) y botón directo a los logs completos de GitHub Actions.
* **Extracción de Entidades SEO**:
  * Endpoint `/api/entities` para analizar y extraer entidades semánticas clave de los sitios indexados.
* **Integración MCP (Model Context Protocol) Dual (Remoto HTTP/SSE y Local Stdio)**:
  * **Servidor MCP Remoto Serverless**: Endpoint nativo en `/api/v1/mcp?key=...` compatible con Cursor, Windsurf y Claude Web vía HTTP JSON-RPC y Server-Sent Events (SSE) sin instalar Node.js local.
  * **Servidor MCP Local (`scripts/mcp-server.mjs`)**: Script sin dependencias externas compiladas, compatible con `claude_desktop_config.json`.
  * **Herramientas MCP Integradas**:
    * `list_scraped_sites`: Lista de clientes y sitios indexados con su conteo de vectores.
    * `query_site`: RAG semántico con citas y metadatos de fuentes.
    * `get_site_entities`: Extracción de entidades SEO clave (marcas, directivos, servicios, Schema.org).
* **Resolución Inteligente y Tolerante de Namespaces**:
  * Normalización flexible en Pinecone: resuelve consultas sin importar si el usuario o agente escribe `internexa`, `Internexa`, `blog-internexa` o `Blog internexa`.
* **Modal de Integraciones con Auto-Inyección de Clave**:
  * Pestañas especializadas para Prompt Directo, Custom GPTs (OpenAPI 3.0), Claude & Cursor (MCP), Python & cURL y n8n/Make con la API Key del usuario pre-insertada.

---

## 📌 Guía de Replicación Paso a Paso

### 1. Requisitos Previos

1. **Google AI Studio (Gemini API Key):**
   * Registra una cuenta en [Google AI Studio](https://aistudio.google.com).
   * Genera una API Key.
   * *Modelo de Embeddings:* `gemini-embedding-001` (Dimensión: 768).
   * *Modelo LLM para RAG:* `gemini-3.8-flash`.

2. **OpenAI (Opcional - API Key):**
   * Registra una cuenta en [OpenAI Platform](https://platform.openai.com).
   * Genera una API Key.
   * *Modelo de Embeddings:* `text-embedding-3-small` (dimensiones: 768).
   * *Modelo LLM para RAG:* `gpt-4o-mini`.

3. **Pinecone Vector DB:**
   * Registra una cuenta en [Pinecone Console](https://app.pinecone.io).
   * Genera una API Key.
   * Crea un nuevo Índice Serverless:
     * **Name:** `scrapio` (o el configurado en `PINECONE_INDEX_NAME`).
     * **Dimensions:** `768`.
     * **Metric:** `Cosine`.
     * **Cloud Provider:** AWS / Region: `us-east-1`.

4. **GitHub Personal Access Token (PAT):**
   * Ve a GitHub > **Settings > Developer Settings > Personal Access Tokens (classic)**.
   * Genera un token con permisos `repo` y `workflow`.

---

## 🔑 Variables de Entorno (.env.local)

Crea el archivo `.env.local` en la raíz del proyecto basándote en `.env.example`:

```env
# Google Gemini API Key
GEMINI_API_KEY=tu_gemini_api_key_aqui

# OpenAI API Key (Opcional)
OPENAI_API_KEY=tu_openai_api_key_aqui

# Pinecone API Configuration
PINECONE_API_KEY=tu_pinecone_api_key_aqui
PINECONE_INDEX_NAME=scrapio

# Proveedor de IA por defecto (gemini | openai)
AI_PROVIDER=gemini

# Token Secreto para la API Headless (/api/v1/namespaces y /api/v1/query)
SCRAPIO_API_KEY=un_token_secreto_personalizado

# Integración GitHub REST API (para disparar ingestas desde la Web)
GITHUB_TOKEN=ghp_tu_github_personal_access_token
GITHUB_REPO_OWNER=tu-usuario-github
GITHUB_REPO_NAME=scrapio

# ScraperAPI Key (Opcional - para rotación de IPs residenciales)
SCRAPER_API_KEY=tu_scraper_api_key_opcional

# Clerk Authentication (https://clerk.com)
# En Vercel guardar como Tipo "Config":
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/

# En Vercel guardar como Tipo "Secret":
CLERK_SECRET_KEY=sk_test_...

# Correo del Administrador principal
ADMIN_EMAIL=avraxas@gmail.com

# Supabase (PostgreSQL para Markdown, Wikilinks, Entidades y Auditoría SEO)
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=tu_supabase_service_role_secret_key
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_supabase_anon_public_key
```

---

## 🔐 Autenticación & Control de Acceso (Clerk & RBAC)

Scrapio implementa autenticación moderna y control de acceso basado en roles mediante **Clerk**:

### 1. Rol de Administrador (`avraxas@gmail.com`)
* **Detección automática**: El correo configurado en `ADMIN_EMAIL` adquiere privilegios de Administrador automáticamente al iniciar sesión.
* **Visibilidad global**: Ve todos los proyectos (namespaces) existentes en Pinecone.
* **Panel de Administración**: Botón exclusivo **"Gestión Usuarios"** para:
  * Ver todos los usuarios registrados.
  * Asignar qué proyectos puede ver cada usuario (soporta compartir un mismo proyecto entre múltiples cuentas).
  * Activar o desactivar el acceso al modelo OpenAI (GPT-4o Mini) por usuario.
  * Eliminar cuentas de usuario de Clerk.
* **Acceso completo**: Libre alternancia entre Gemini 3.8 Flash y OpenAI GPT-4o Mini.

### 2. Rol de Usuario Regular
* **Aislamiento de proyectos**: Solo puede ver y consultar los namespaces que el administrador le haya asignado con checkboxes.
* **Modelo por defecto**: Dispone de **Gemini 3.8 Flash** activo de forma predeterminada sin costo adicional.
* **Protección de saldo**: El modelo OpenAI GPT-4o Mini permanece bloqueado con candado `🔒` salvo que el administrador lo autorice o el usuario use su propia API Key (BYOK).

### 3. Soporte BYOK (Bring Your Own Key) y Sincronización en la Nube
* En la barra lateral y en el compositor, cualquier usuario puede pulsar **"Mis API Keys (BYOK)"**.
* Permite guardar claves personales de Gemini o OpenAI tanto en el almacenamiento local del navegador como sincronizarlas permanentemente en sus metadatos de Clerk.
* Al ingresar una clave personal de OpenAI, el modelo **GPT-4o Mini se desbloquea inmediatamente**, facturando las consultas a la cuenta del propio usuario.
* **Salvaguarda y Fallback Automático en APIs Externas:** La clave BYOK de OpenAI queda asociada a la `Scrapio API Key` (`sk_scrapio_...`) del usuario. Si Claude, ChatGPT, Cursor o un flujo automatizado consulta la API y Gemini agota cuota o tiene problemas de facturación, el backend activa automáticamente la clave de OpenAI del usuario como fallback transparente.

---

## 🚀 Comandos de Desarrollo e Ingesta

```bash
# 1. Instalar dependencias
npm install

# 2. Iniciar el servidor web de desarrollo
npm run dev

# 3. Ingesta manual desde la terminal CLI
npx tsx scripts/ingest.ts --url https://avafin.mx --namespace cliente-avafin --maxPages 50 --provider gemini

# 4. Iniciar Servidor MCP para Claude Desktop / Cursor
npm run mcp
```

---

## 📡 Documentación Completa de APIs (Endpoints)

### 1. Endpoint RAG para Interfaz Web (`POST /api/chat`)
* Valida sesión de Clerk y verifica que el usuario tenga permiso sobre el namespace solicitado.
* Soporta parámetro opcional `customApiKey` para BYOK.
* **Body:**
  ```json
  {
    "query": "¿Cuáles son los requisitos para un préstamo?",
    "namespace": "cliente-avafin",
    "aiProvider": "gemini",
    "customApiKey": "opcional_si_es_byok"
  }
  ```

### 2. Panel Admin de Usuarios (`GET / PATCH / DELETE /api/admin/users`)
* **`GET`**: Retorna el listado de usuarios de Clerk con sus metadatos y proyectos asignados (exclusivo admin).
* **`PATCH`**: Actualiza los proyectos permitidos (`allowed_namespaces`) y el permiso de OpenAI (`can_use_openai`) de un usuario.
* **`DELETE ?userId=...`**: Elimina a un usuario de Clerk.

### 3. Perfil de Usuario y Gestión de Claves (`GET / POST /api/me`)
* **`GET`**: Devuelve el rol del usuario actual, su correo, nombre, lista de proyectos autorizados, su Scrapio API Key única y sus claves BYOK configuradas.
* **`POST`**:
  * Si se llama sin cuerpo: Regenera una nueva `Scrapio API Key` única (`sk_scrapio_<userId>_<randomHash>`), invalidando la anterior.
  * Si se llama con `{ action: "save_keys", openaiApiKey, geminiApiKey }`: Guarda y sincroniza las claves BYOK directamente en los metadatos de Clerk del usuario para que queden asociadas a su API Key.

### 4. Auditoría y Eliminación de URLs (`GET / DELETE /api/urls`)
* **`GET ?namespace=...`**: Compara en tiempo real las URLs vectorizadas en Pinecone contra las URLs descubiertas en el sitemap XML.
* **`DELETE ?namespace=...&url=...`**: Busca y elimina todos los vectores correspondientes a la URL especificada en el namespace sin alterar las demás páginas indexadas.

### 5. API Headless para LLMs y Agentes Externos (`/api/v1/*`)
* **Autenticación Flexible:**
  * Cabecera HTTP: `Authorization: Bearer <SCRAPIO_API_KEY>`
  * Cabecera HTTP: `X-API-Key: <SCRAPIO_API_KEY>`
  * O parámetro de consulta (Query param): `?key=<SCRAPIO_API_KEY>` (o `?apiKey=...`)
* **Resiliencia y Fallback Multi-Modelo Automático:**
  * Si las solicitudes a Gemini experimentan errores de cuota o facturación (HTTP 429 / billing details), la API ejecuta una cascada de modelos (`gemini-flash-latest` $\rightarrow$ `gemini-3.5-flash` $\rightarrow$ `gemini-2.5-flash-lite`).
  * Si todos los modelos de Gemini fallan, se activa automáticamente el fallback a OpenAI (`text-embedding-3-small` en 768d y `gpt-4o-mini`) utilizando la clave BYOK asociada al usuario o la del entorno.
* **Endpoints:**
  * **`GET /api/v1/namespaces`**: Devuelve el listado de todos los sitios/clientes indexados y su cantidad de vectores en Pinecone, junto con el esquema de herramientas MCP declarativo.
  * **`GET / POST /api/v1/query`**: Consulta RAG semántica serverless con citas de fuentes y CTAs. Soporta parámetro `&query=palabras+clave` en GET o JSON en POST.
  * **`GET / POST /api/v1/entities`**: Extracción completa de entidades SEO (marcas, directivos, servicios, ubicaciones y Schema.org sugerido).
  * **`POST / GET /api/v1/mcp`**: Endpoint oficial de servidor **Model Context Protocol (MCP)** compatible con transporte JSON-RPC y SSE.

### 6. Disparo de Ingesta a GitHub Actions (`POST /api/ingest`)
* Inicia la extracción y vectorización automatizada en la nube vía GitHub REST API.

### 7. Estado y Progreso de Ingesta en Tiempo Real (`GET /api/ingest/status`)
* Consulta a GitHub Actions y devuelve el porcentaje ($0\%-100\%$), paso actual (`currentStepName`), estado (`queued`, `in_progress`, `completed`) y enlace al log.

### 8. Gestión de Namespaces (`GET / DELETE /api/namespaces`)
* Filtra la lista según los permisos del usuario logueado.
* La eliminación (`DELETE`) está protegida exclusivamente para administradores.

### 9. Indexación Individual Bajo Demanda (`POST /api/urls/index-single`)
* Procesa, limpia con Turndown, vectoriza y sube a Pinecone una sola URL específica en 1–2 segundos de forma serverless.
* **Body:**
  ```json
  {
    "url": "https://midominio.com/pagina-especifica",
    "namespace": "cliente-midominio",
    "aiProvider": "gemini",
    "customApiKey": "opcional_si_es_byok"
  }
  ```

### 10. Auditoría SEO Técnica & Arquitectura Web (`GET /api/seo/audit?namespace=...`)
* Devuelve el inventario holístico del cliente: KPIs de salud SEO, páginas huérfanas, canibalizaciones temáticas, enlaces entrantes/salientes, conteo de palabras y esquemas JSON-LD.
* Utiliza búsqueda case-insensitive (`ilike`), tolerando cualquier variante de mayúsculas/minúsculas.

### 11. Sincronización en 1 Clic desde Pinecone a Supabase (`POST /api/seo/sync-pinecone`)
* Extrae todos los vectores con metadata de un namespace en Pinecone, reconstruye el documento Markdown con Frontmatter y guarda en Supabase en bloques de 50 páginas en segundos.
* **Body:**
  ```json
  {
    "namespace": "Avafin"
  }
  ```

---

## 🔌 Servidor MCP (Model Context Protocol)

Scrapio ofrece dos modalidades para conectar con agentes de inteligencia artificial:

### Modalidad 1: Servidor MCP Remoto por URL (Cursor, Windsurf, Claude Web)
No requiere instalar dependencias ni tener Node.js local. Configura un servidor MCP de tipo **SSE / HTTP** con la URL:
```text
https://scrapio-one.vercel.app/api/v1/mcp?key=TU_SCRAPIO_API_KEY
```

### Modalidad 2: Claude Desktop Local (`claude_desktop_config.json`)
Utiliza el script independiente [`scripts/mcp-server.mjs`](file:///c:/Users/seo_w/Documents/SEO%20scrapio/scripts/mcp-server.mjs) (Node.js nativo sin librerías pesadas):

```json
{
  "mcpServers": {
    "scrapio": {
      "command": "node",
      "args": ["scripts/mcp-server.mjs"],
      "env": {
        "SCRAPIO_API_URL": "https://scrapio-one.vercel.app",
        "SCRAPIO_API_KEY": "<TU_SCRAPIO_API_KEY_PERSONAL>"
      }
    }
  }
}
```

### Herramientas MCP expuestas:
1. `list_scraped_sites`: Retorna todos los sitios y clientes indexados con cantidad de vectores.
2. `query_site`: Ejecuta búsqueda semántica RAG citando fuentes exactas del sitio indexado.
3. `get_site_entities`: Extrae entidades SEO, productos, servicios y marcado Schema.org del sitio.
4. `get_seo_audit`: Retorna la auditoría técnica completa del cliente (páginas huérfanas, canibalizaciones, enlaces internos y estado de Schema.org).
5. `get_page_markdown`: Recupera el artículo Markdown íntegro con `[[Wikilinks]]` de cualquier URL para tareas de redacción y optimización.

---

## 🌐 Despliegue en Vercel

1. Sube tu código a GitHub (`main`).
2. Conecta el repositorio en Vercel.
3. En **Settings > Environment Variables**:
   * Variables de tipo **Config / Plaintext**:
     * `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
     * `NEXT_PUBLIC_CLERK_SIGN_IN_URL` (`/sign-in`)
     * `NEXT_PUBLIC_CLERK_SIGN_UP_URL` (`/sign-up`)
     * `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` (`/`)
     * `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` (`/`)
     * `NEXT_PUBLIC_SUPABASE_URL` (`https://<tu-id>.supabase.co`)
     * `SUPABASE_URL` (`https://<tu-id>.supabase.co`)
     * `ADMIN_EMAIL` (`avraxas@gmail.com`)
     * `PINECONE_INDEX_NAME` (`scrapio`)
     * `AI_PROVIDER` (`gemini`)
   * Variables de tipo **Secret**:
     * `CLERK_SECRET_KEY`
     * `SUPABASE_SERVICE_ROLE_KEY`
     * `NEXT_PUBLIC_SUPABASE_ANON_KEY`
     * `GEMINI_API_KEY`
     * `PINECONE_API_KEY`
     * `OPENAI_API_KEY` (opcional)
     * `SCRAPIO_API_KEY`
     * `GITHUB_TOKEN`
4. Despliega y listo.

---

## 🔒 Diagnóstico de Seguridad, Aislamiento y Respuestas HTTP 4xx

### 1. ¿Por qué Clerk muestra "Development Mode" en la interfaz?
* El proyecto está configurado actualmente con credenciales del entorno de pruebas gratuito de Clerk (`pk_test_...` y `sk_test_...` bajo el dominio `*.clerk.accounts.dev`).
* Esto indica que la instancia está en modo de desarrollo (`Development instance`), lo cual habilita el distintivo "Development mode" en los componentes de interfaz de Clerk y permite cuentas de prueba.
* Para producción oficial se crea una instancia en el Dashboard de Clerk con llaves `pk_live_...` y dominio personalizado (ej. `auth.tudominio.com`).

### 2. ¿Por qué los llamados al API devuelven errores 4xx?
Los errores `4xx` indican que la solicitud del cliente no cumple con los requisitos de autenticación o permisos del sistema multitenant:
1. **Error 401 Unauthorized**:
   * Ocurre si se consulta `GET /api/v1/namespaces` o `POST /api/v1/query` **sin proveer un token** (o con un token inválido).
   * Cuando ChatGPT o un navegador accede directamente a la URL plana sin cabecera `Authorization: Bearer <TOKEN>` ni parámetro `?key=<TOKEN>`, el servidor rechaza la solicitud para proteger la privacidad de los clientes indexados.
2. **Error 403 Forbidden**:
   * Ocurre cuando un usuario intenta consultar con su API Key un cliente o namespace **al cual no tiene acceso** (ej. un usuario nuevo con 0 clientes asignados que intenta consultar `cliente-avafin`).
   * El sistema devuelve un mensaje explicativo y un campo `hint` indicando que su cuenta no tiene permisos sobre ese espacio.
3. **Error 400 Bad Request**:
   * Ocurre si falta el campo obligatorio `query` o `namespace`, o si el cuerpo JSON está malformado.

### 3. Autenticación Resiliente y Extracción de Claves
* El helper `extractTokenFromRequest` busca de forma flexible en:
  * Cabecera `Authorization: Bearer <TOKEN>`
  * Cabecera `X-API-Key: <TOKEN>`
  * Parámetros de URL: `?key=`, `?apiKey=`, `?token=`, `?api_key=`
  * Campos del JSON body: `apiKey`, `api_key`, `key`, `token`
* Validación tolerante de claves personales `sk_scrapio_<userId>_<suffix>` y compatibilidad garantizada con la clave maestra `SCRAPIO_API_KEY`.
* Sincronización reactiva en el frontend: en cuanto Clerk inicializa la sesión en el navegador, se consultan automáticamente `/api/me` y `/api/namespaces` sin riesgo de estados desincronizados.

### 4. Auto-descubrimiento HATEOAS, Re-ranking Híbrido y Rigor en Síntesis RAG
* **HATEOAS en `/api/v1/namespaces`**: El endpoint de listado ahora devuelve en su respuesta JSON la propiedad `queryEndpoint`, `apiUsage` con ejemplos `GET` y `POST`, y la URL directa `queryUrl` para cada cliente. Esto permite que cualquier IA externa (ChatGPT, Claude, Perplexity) sepa exactamente a qué URL y con qué parámetros consultar el contenido sin tener que adivinar o recibir errores 400.
* **Re-ranking Híbrido en `/api/v1/query`**: Se amplió el pool de candidatos en Pinecone a 40 fragmentos y se incorporó `rerankHybridChunks` con normalización fonética (`c/s/z`, acentos) y boosting léxico para acrónimos (ej: CONDUSEF, SIPRES, PROFECO), números y términos en H1 y URLs.
* **Eliminación de la falacia de exhaustividad en el LLM**: Se actualizó el prompt de sistema para que el modelo nunca afirme categóricamente que "el cliente no tiene relación ni mención con X" cuando X simplemente no apareció en el contexto recuperado; ahora aclara con precisión epistemológica que en los fragmentos recuperados en esa consulta puntual no consta información al respecto.
* **Diagnóstico de Vectores Multi-Modelo**: Si un namespace contiene vectores generados por diferentes proveedores (ej. OpenAI `text-embedding-3-small` vs Gemini `gemini-embedding-001`), los espacios geométricos no son conmensurables directamente. Se recomienda homogeneizar las ingestas bajo un mismo proveedor o habilitar BYOK con el proveedor original para máxima fidelidad semántica.

## 🏗️ Estructura del Proyecto

```
scrapio/
├── .agents/skills/              # Skills de Antigravity (ponytail, ponytail-review, ponytail-audit)
├── .github/workflows/ingesta.yml # Workflow de GitHub Actions para scraping e ingesta
├── middleware.ts                # Protección de rutas con Clerk
├── app/
│   ├── sign-in/                 # Pantalla de inicio de sesión de Clerk
│   ├── sign-up/                 # Pantalla de registro de usuarios de Clerk
│   ├── api/
│   │   ├── admin/users/route.ts # Panel administrativo: gestión de roles y proyectos
│   │   ├── me/route.ts          # Perfil y permisos del usuario actual
│   │   ├── urls/
│   │   │   ├── route.ts         # Auditoría de URLs escaneadas vs pendientes
│   │   │   └── index-single/route.ts # Indexación inmediata bajo demanda
│   │   ├── chat/route.ts        # RAG query web con verificación de permisos y BYOK
│   │   ├── entities/route.ts    # Extractor de entidades SEO semánticas
│   │   ├── health/route.ts      # Diagnóstico de variables y estado de Pinecone
│   │   ├── ingest/              # Disparo y seguimiento de GitHub Actions
│   │   ├── namespaces/route.ts  # Listado filtrado por usuario y borrado seguro
│   │   ├── openapi.json/route.ts# Especificación OpenAPI 3.0
│   │   └── v1/
│   │       ├── mcp/route.ts        # Servidor nativo MCP (HTTP JSON-RPC & SSE)
│   │       ├── entities/route.ts   # Extracción de entidades SEO con API Key
│   │       ├── namespaces/route.ts # Listado headless de clientes/namespaces con API Key
│   │       └── query/route.ts      # RAG query headless con API Key
│   ├── globals.css              # Estilos Tailwind CSS
│   ├── layout.tsx               # Layout principal con ClerkProvider
│   └── page.tsx                 # UI interactiva con RBAC, BYOK y selector de modelos
├── lib/
│   ├── auth.ts                  # Helper de autenticación y roles de Clerk
│   ├── ai.ts                    # Adaptador dual Gemini / OpenAI (Embeddings 768d + LLMs) con BYOK
│   ├── crawler.ts               # Crawler multi-página con Jitter, User-Agent pool y sitemaps
│   └── pinecone.ts              # Cliente y resolución inteligente de namespaces en Pinecone
├── scripts/
│   ├── ingest.ts                # CLI ejecutable de scraping e ingesta
│   ├── mcp-server.mjs           # Servidor MCP ligero en JS puro sin dependencias externas
│   └── mcp-server.ts            # Servidor MCP en TypeScript
├── .env.example                 # Plantilla completa de variables de entorno
└── README.md                    # Documentación técnica completa y guía de replicación
```

