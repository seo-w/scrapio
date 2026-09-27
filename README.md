# 🚀 Scrapio - Sistema RAG Multi-Tenant (Serverless)

Scrapio es una plataforma de **Retrieval-Augmented Generation (RAG) Serverless y Multi-Tenant**, diseñada para extraer contenido web mediante un crawler multi-página automatizado y recursivo, vectorizar la información por cliente de manera aislada (**Pinecone Namespaces**) y disponibilizar las consultas mediante una API con streaming y una interfaz web moderna.

---

## 📋 Tabla de Contenidos
- [✨ Características Principales](#-características-principales)
- [📌 Guía de Replicación Paso a Paso](#-guía-de-replicación-paso-a-paso)
- [🔑 Variables de Entorno (.env.local)](#-variables-de-entorno-envlocal)
- [🚀 Comandos de Desarrollo e Ingesta Local](#-comandos-de-desarrollo-e-ingesta-local)
- [📡 Documentación Completa de APIs (Endpoints)](#-documentación-completa-de-apis-endpoints)
- [🤖 Ingesta Automatizada en GitHub Actions](#-ingesta-automatizada-en-github-actions)
- [🌐 Despliegue en Vercel](#-despliegue-en-vercel)
- [🏗️ Estructura del Proyecto](#️-estructura-del-proyecto)

---

## ✨ Características Principales

* **Multi-Tenancy Aislado**: Almacena y consulta datos de múltiples clientes o sitios en un solo índice de Pinecone Serverless (768d) sin mezclar vectores mediante **Namespaces**.
* **Soporte de Doble Proveedor de IA**:
  * **Google Gemini**: `gemini-embedding-001` (768d) + `gemini-3.8-flash`.
  * **OpenAI**: `text-embedding-3-small` (dimensiones: 768) + `gpt-4o-mini`.
* **Crawler Web Avanzado**:
  * Extracción con Cheerio, Turndown (Markdown) y LangChain RecursiveCharacterTextSplitter.
  * Resuelve mapas de sitio simples (`sitemap.xml`) e **índices de mapas de sitio anidados** (`sitemap_index.xml`, `post-sitemap.xml`).
  * Filtrado estricto de URLs que previene el rastreo de archivos `.xml`, `.jpg`, `.pdf`, etc.
* **Control de Cuota & Salvaguarda Anti-Caídas**:
  * Agrupación por lotes (*batching*) con retardo de 350ms y reintentos con *backoff exponencial*.
  * Si la cuota gratuita de Gemini se agota durante una ingesta masiva, el sistema guarda de forma segura los vectores procesados en Pinecone y finaliza limpiamente sin romper el job.
* **Disparo Web de Ingesta desde UI**:
  * Botones **🔄 Actualizar Sitio** y **➕ Nuevo Sitio** en la web que activan workflows de GitHub Actions vía GitHub REST API.
* **Alertas de Cuota Diaria**:
  * Indicador visual en tiempo real que convierte las cuotas gratuitas a la métrica de **Páginas/URLs diarias** (~350 a 500 URLs/día gratis).
* **API Headless Con Autenticación Bearer**:
  * Endpoint `/api/v1/query` protegido con token Bearer para integración directa con agentes externos, n8n, Zapier o scripts de terminal.

---

## 📌 Guía de Replicación Paso a Paso

Esta guía permite replicar el proyecto completo en una nueva cuenta de GitHub, Pinecone, Google AI Studio / OpenAI y Vercel desde cero.

### 1. Requisitos Previos

1. **Google AI Studio (Gemini API Key):**
   * Registra una cuenta en [Google AI Studio](https://aistudio.google.com).
   * Genera una API Key.
   * *Modelo de Embeddings:* `gemini-embedding-001` (Dimensión: 768).
   * *Modelo LLM para RAG:* `gemini-3.8-flash`.

2. **OpenAI (Opcional - API Key):**
   * Registra una cuenta en [OpenAI Platform](https://platform.openai.com).
   * Genera una API Key.
   * *Modelo de Embeddings:* `text-embedding-3-small` (configurado a 768d).
   * *Modelo LLM para RAG:* `gpt-4o-mini`.

3. **Pinecone Vector DB:**
   * Registra una cuenta en [Pinecone Console](https://app.pinecone.io).
   * Genera una API Key.
   * Crea un nuevo Índice Serverless con las siguientes especificaciones exactas:
     * **Name:** `scrapio` (o el configurado en `PINECONE_INDEX_NAME`).
     * **Dimensions:** `768` (imprescindible para compatibilidad nativa Gemini/OpenAI).
     * **Metric:** `Cosine`.
     * **Cloud Provider:** AWS / Region: `us-east-1`.

4. **GitHub Personal Access Token (PAT):**
   * Para permitir que la web de Vercel dispare ingestas en GitHub Actions:
   * Ve a GitHub > **Settings > Developer Settings > Personal Access Tokens (Tokens classic)**.
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
```

---

## 🚀 Comandos de Desarrollo e Ingesta Local

```bash
# 1. Instalar dependencias
npm install

# 2. Iniciar el servidor de desarrollo en Next.js
npm run dev

# 3. Probar la ingesta de un sitio web desde la terminal CLI
npx tsx scripts/ingest.ts --url https://avafin.mx --namespace cliente-avafin --maxPages 50 --provider gemini
```

---

## 📡 Documentación Completa de APIs (Endpoints)

### A. Endpoint RAG para Interfaz Web (`/api/chat`)
* **Método:** `POST`
* **Content-Type:** `application/json`
* **Body:**
  ```json
  {
    "query": "¿Cuáles son los requisitos para pedir un préstamo?",
    "namespace": "cliente-avafin",
    "aiProvider": "gemini"
  }
  ```
* **Respuesta Exitosa:**
  ```json
  {
    "answer": "Para solicitar un préstamo se requiere...",
    "sources": ["https://avafin.mx/requisitos"],
    "matchesCount": 4
  }
  ```

### B. Endpoint Headless para Agentes / Terminal (`/api/v1/query`)
* **Método:** `POST`
* **Headers:** `Authorization: Bearer <SCRAPIO_API_KEY>`
* **Body:**
  ```json
  {
    "query": "¿Qué servicios ofrecen?",
    "namespace": "cliente-avafin",
    "aiProvider": "openai"
  }
  ```
* **Ejemplo cURL:**
  ```bash
  curl -X POST https://tu-app.vercel.app/api/v1/query \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer tu_secret_token_personalizado" \
    -d '{"query": "¿Qué requisitos piden?", "namespace": "cliente-avafin"}'
  ```

### C. Endpoint para Disparar Ingesta (`/api/ingest`)
* **Método:** `POST`
* **Body:**
  ```json
  {
    "targetUrl": "https://midominio.com",
    "clientNamespace": "cliente-midominio",
    "maxPages": 100,
    "aiProvider": "gemini"
  }
  ```

### D. Endpoint de Estado de Namespaces (`/api/namespaces`)
* **Método:** `GET`
* Devuelve la lista en tiempo real de todos los namespaces activos en Pinecone con su respectivo recuento de vectores y total del índice.

### E. Endpoint de Diagnóstico de Salud (`/api/health`)
* **Método:** `GET`
* Comprueba las variables de entorno configuradas y verifica la conectividad en vivo con Pinecone.

---

## 🤖 Ingesta Automatizada en GitHub Actions

El proyecto incluye un workflow en `.github/workflows/ingesta.yml` que ejecuta el scraping de sitios masivos de forma gratuita y aislada sin consumir límites de Vercel.

### Configuración de Secretos en GitHub:
En tu repositorio de GitHub, ve a **Settings > Secrets and variables > Actions** e ingresa:
1. `GEMINI_API_KEY`
2. `OPENAI_API_KEY` (opcional)
3. `PINECONE_API_KEY`
4. `PINECONE_INDEX_NAME`

---

## 🌐 Despliegue en Vercel

1. Subir el repositorio a GitHub.
2. Importar el proyecto en [Vercel](https://vercel.com).
3. Configurar las variables de entorno (`GEMINI_API_KEY`, `PINECONE_API_KEY`, `PINECONE_INDEX_NAME`, `SCRAPIO_API_KEY`, `GITHUB_TOKEN`, `GITHUB_REPO_OWNER`, `GITHUB_REPO_NAME`).
4. Desplegar. La plataforma quedará lista para producción.

---

## 🏗️ Estructura del Proyecto

```
scrapio/
├── .github/workflows/ingesta.yml   # Workflow de GitHub Actions para scraping e ingesta
├── app/
│   ├── api/
│   │   ├── chat/route.ts        # RAG query para la UI web
│   │   ├── health/route.ts      # Diagnóstico de variables y estado de Pinecone
│   │   ├── ingest/route.ts      # API handler para activar GitHub Actions
│   │   ├── namespaces/route.ts  # Consulta de namespaces y conteo de vectores
│   │   └── v1/query/route.ts    # API Headless con autenticación Bearer
│   ├── globals.css              # Configuración de estilos Tailwind CSS
│   ├── layout.tsx               # Layout principal de Next.js
│   └── page.tsx                 # Interfaz de usuario interactiva RAG y modal
├── lib/
│   ├── ai.ts                    # Adaptador dual de Google Gemini y OpenAI (Embeddings + RAG)
│   ├── crawler.ts               # Crawler multi-página, parseo XML/Sitemap y splitter
│   └── pinecone.ts              # Cliente y operaciones aisladas por Namespace en Pinecone
├── scripts/
│   └── ingest.ts                # CLI ejecutable de scraping e ingesta masiva
├── .env.example                 # Plantilla completa de variables de entorno
└── README.md                    # Guía técnica oficial y de replicación
```
