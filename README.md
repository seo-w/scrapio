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

### 3. Soporte BYOK (Bring Your Own Key)
* En la barra lateral y en el compositor, cualquier usuario puede pulsar **"Mis API Keys (BYOK)"**.
* Permite guardar claves personales de Gemini o OpenAI en el almacenamiento local de su navegador.
* Al ingresar una clave personal de OpenAI, el modelo **GPT-4o Mini se desbloquea inmediatamente**, facturando las consultas a la cuenta del propio usuario.

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

### 3. Perfil de Usuario (`GET /api/me`)
* Devuelve el rol del usuario actual, su correo, nombre y lista de proyectos autorizados.

### 4. Auditoría y Eliminación de URLs (`GET / DELETE /api/urls`)
* **`GET ?namespace=...`**: Compara en tiempo real las URLs vectorizadas en Pinecone contra las URLs descubiertas en el sitemap XML.
* **`DELETE ?namespace=...&url=...`**: Busca y elimina todos los vectores correspondientes a la URL especificada en el namespace sin alterar las demás páginas indexadas.

### 5. API Headless para LLMs y Agentes Externos (`/api/v1/*`)
* **Autenticación Flexible:**
  * Cabecera HTTP: `Authorization: Bearer <SCRAPIO_API_KEY>`
  * Cabecera HTTP: `X-API-Key: <SCRAPIO_API_KEY>`
  * O parámetro de consulta (Query param): `?key=<SCRAPIO_API_KEY>` (o `?apiKey=...`)
* **Endpoints:**
  * **`GET /api/v1/namespaces`**: Devuelve el listado de todos los sitios/clientes indexados y su cantidad de vectores en Pinecone.
  * **`POST /api/v1/query`**: Consulta RAG semántica serverless con citas de fuentes y CTAs.
  * **`POST /api/v1/entities`**: Extracción completa de entidades SEO (marcas, directivos, servicios, ubicaciones y Schema.org sugerido).
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

---

## 🌐 Despliegue en Vercel

1. Sube tu código a GitHub (`main`).
2. Conecta el repositorio en Vercel.
3. En **Settings > Environment Variables**:
   * Variables de tipo **Config**:
     * `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
     * `NEXT_PUBLIC_CLERK_SIGN_IN_URL` (`/sign-in`)
     * `NEXT_PUBLIC_CLERK_SIGN_UP_URL` (`/sign-up`)
     * `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` (`/`)
     * `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` (`/`)
     * `ADMIN_EMAIL` (`avraxas@gmail.com`)
     * `PINECONE_INDEX_NAME` (`scrapio`)
     * `AI_PROVIDER` (`gemini`)
   * Variables de tipo **Secret**:
     * `CLERK_SECRET_KEY`
     * `GEMINI_API_KEY`
     * `PINECONE_API_KEY`
     * `OPENAI_API_KEY` (opcional)
     * `SCRAPIO_API_KEY`
     * `GITHUB_TOKEN`
4. Despliega y listo.

---

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

