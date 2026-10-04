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
* **Barra de Progreso en Vivo**:
  * Interfaz web con barra de progreso que consulta en tiempo real el porcentaje y estado del workflow en GitHub Actions (`/api/ingest/status`).
* **Extracción de Entidades SEO**:
  * Endpoint `/api/entities` para analizar y extraer entidades semánticas clave de los sitios indexados.
* **Integración MCP & OpenAPI**:
  * Servidor MCP nativo (`npm run mcp`) para consultar Scrapio desde **Claude Desktop**, **Cursor** o agentes IA.
  * Especificación `/api/openapi.json` lista para conectar con GPTs personalizados de OpenAI o herramientas externas.

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

# Token Secreto para la API Headless (/api/v1/query)
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

### 5. Endpoint Headless con Autenticación Bearer (`POST /api/v1/query`)
* **Headers:** `Authorization: Bearer <SCRAPIO_API_KEY>`
* Ideal para conectar agentes de IA externos, n8n, Make y Claude Desktop sin requerir sesión de usuario interactiva.

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
* **Respuesta Exitosa:**
  ```json
  {
    "success": true,
    "url": "https://midominio.com/pagina-especifica",
    "chunksIndexed": 4,
    "providerUsed": "gemini",
    "message": "¡URL indexada con éxito! Se generaron y guardaron 4 vectores en Pinecone."
  }
  ```

---

## 🔌 Servidor MCP (Claude Desktop & Cursor)

Scrapio incluye un servidor **Model Context Protocol** en [scripts/mcp-server.ts](file:///c:/Users/seo_w/Documents/SEO%20scrapio/scripts/mcp-server.ts).

### Configuración en Claude Desktop (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "scrapio": {
      "command": "node",
      "args": ["C:/ruta/a/scrapio/scripts/mcp-server.ts"],
      "env": {
        "SCRAPIO_API_URL": "https://tu-app.vercel.app",
        "SCRAPIO_API_KEY": "tu_token_secreto"
      }
    }
  }
}
```

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
│   │   └── v1/query/route.ts    # API Headless con autenticación Bearer
│   ├── globals.css              # Estilos Tailwind CSS
│   ├── layout.tsx               # Layout principal con ClerkProvider
│   └── page.tsx                 # UI interactiva con RBAC, BYOK y selector de modelos
├── lib/
│   ├── auth.ts                  # Helper de autenticación y roles de Clerk
│   ├── ai.ts                    # Adaptador dual Gemini / OpenAI (Embeddings 768d + LLMs) con BYOK
│   ├── crawler.ts               # Crawler multi-página con Jitter, User-Agent pool y sitemaps
│   └── pinecone.ts              # Cliente y operaciones aisladas en Pinecone
├── scripts/
│   ├── ingest.ts                # CLI ejecutable de scraping e ingesta
│   └── mcp-server.ts            # Servidor Model Context Protocol
├── .env.example                 # Plantilla completa de variables de entorno
└── README.md                    # Documentación técnica completa y guía de replicación
```

