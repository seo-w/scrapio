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
* **Crawler Web Avanzado & Anti-Bloqueos**:
  * Parseo recursivo de sitemaps (`sitemap.xml` e índices `sitemap_index.xml`).
  * **Pool de User-Agents Reales** (Chrome, Firefox, Safari) y cabeceras HTTP/2.
  * **Jitter Aleatorio (350ms - 750ms)** que simula navegación humana.
  * Soporte opcional de proxies residenciales rotativos vía **ScraperAPI**.
  * Detección y autorregulación de errores **HTTP 429**: pausa de 3.5s y reintento automático.
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
```

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
* **Body:**
  ```json
  {
    "query": "¿Cuáles son los requisitos para un préstamo?",
    "namespace": "cliente-avafin",
    "aiProvider": "gemini"
  }
  ```
* **Respuesta Exitosa:**
  ```json
  {
    "answer": "Para solicitar un préstamo se requiere...",
    "sources": ["https://avafin.mx/requisitos"],
    "matchesCount": 8,
    "providerUsed": "gemini"
  }
  ```

### 2. Endpoint Headless con Autenticación Bearer (`POST /api/v1/query`)
* **Headers:** `Authorization: Bearer <SCRAPIO_API_KEY>`
* **Body:**
  ```json
  {
    "query": "¿Qué servicios ofrecen?",
    "namespace": "cliente-avafin",
    "aiProvider": "openai"
  }
  ```

### 3. Disparo de Ingesta a GitHub Actions (`POST /api/ingest`)
* **Body:**
  ```json
  {
    "targetUrl": "https://midominio.com",
    "clientNamespace": "cliente-midominio",
    "maxPages": 100,
    "aiProvider": "gemini"
  }
  ```

### 4. Estado y Progreso de Ingesta en Tiempo Real (`GET /api/ingest/status`)
* Consulta a GitHub Actions y devuelve el porcentaje ($0\%-100\%$), paso actual (`currentStepName`), estado (`queued`, `in_progress`, `completed`) y enlace al log.

### 5. Gestión de Namespaces (`/api/namespaces`)
* **`GET /api/namespaces`**: Devuelve la lista de sitios indexados con su conteo de vectores.
* **`DELETE /api/namespaces?namespace=cliente-demo`**: Elimina de forma inmediata todos los vectores asociados a ese namespace en Pinecone.

### 6. Extracción de Entidades SEO (`GET / POST /api/entities`)
* **`GET /api/entities?namespace=cliente-avafin&aiProvider=gemini`**
* Analiza el corpus vectorial del sitio y extrae las principales entidades de marca, productos, servicios, audiencias y conceptos SEO clave.

### 7. Especificación OpenAPI (`GET /api/openapi.json`)
* Devuelve el esquema JSON compatible con OpenAPI 3.0 para conectar Scrapio con GPTs de OpenAI, Swagger UI o plataformas no-code.

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

## 🤖 Ingesta Automatizada en GitHub Actions

En tu repositorio de GitHub (**Settings > Secrets and variables > Actions**), configura:
1. `GEMINI_API_KEY`
2. `OPENAI_API_KEY` (opcional)
3. `PINECONE_API_KEY`
4. `PINECONE_INDEX_NAME`
5. `SCRAPER_API_KEY` (opcional)

---

## 🌐 Despliegue en Vercel

1. Sube tu código a GitHub (`main`).
2. Conecta el repositorio en Vercel.
3. Agrega las variables de entorno en Vercel (`GEMINI_API_KEY`, `OPENAI_API_KEY`, `PINECONE_API_KEY`, `PINECONE_INDEX_NAME`, `SCRAPIO_API_KEY`, `GITHUB_TOKEN`, `GITHUB_REPO_OWNER`, `GITHUB_REPO_NAME`).
4. Despliega y listo.

---

## 🏗️ Estructura del Proyecto

```
scrapio/
├── .agents/skills/              # Skills de Antigravity (ponytail, ponytail-review, ponytail-audit)
├── .github/workflows/ingesta.yml # Workflow de GitHub Actions para scraping e ingesta
├── app/
│   ├── api/
│   │   ├── chat/route.ts        # RAG query para la UI web
│   │   ├── entities/route.ts    # Extractor de entidades SEO semánticas
│   │   ├── health/route.ts      # Diagnóstico de variables y estado de Pinecone
│   │   ├── ingest/
│   │   │   ├── route.ts         # Disparo de GitHub Actions vía REST API
│   │   │   └── status/route.ts  # Estado y porcentaje de la barra de progreso
│   │   ├── namespaces/route.ts  # Consulta (GET) y eliminación (DELETE) de namespaces
│   │   ├── openapi.json/route.ts# Especificación OpenAPI 3.0
│   │   └── v1/query/route.ts    # API Headless con autenticación Bearer
│   ├── globals.css              # Estilos Tailwind CSS
│   ├── layout.tsx               # Layout principal
│   └── page.tsx                 # UI interactiva con barra de progreso y selector de modelos
├── lib/
│   ├── ai.ts                    # Adaptador dual Gemini / OpenAI (Embeddings 768d + LLMs)
│   ├── crawler.ts               # Crawler multi-página con Jitter, User-Agent pool y sitemaps
│   └── pinecone.ts              # Cliente y operaciones aisladas en Pinecone
├── scripts/
│   ├── ingest.ts                # CLI ejecutable de scraping e ingesta
│   └── mcp-server.ts            # Servidor Model Context Protocol
├── .env.example                 # Plantilla completa de variables de entorno
└── README.md                    # Documentación técnica completa y guía de replicación
```
