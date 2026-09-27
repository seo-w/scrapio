# 🚀 Scrapio - Sistema RAG Multi-Tenant (Serverless)

Scrapio es una plataforma de **Retrieval-Augmented Generation (RAG) Serverless y Multi-Tenant**, construida para extraer contenido web mediante un crawler multi-página automatizado, vectorizar la información por cliente de manera aislada (Pinecone Namespaces) y consultar dicha información a través de una API con streaming y una interfaz web.

---

## 📌 Guía de Replicación en Otras Cuentas / Entornos

Esta sección detalla paso a paso cómo replicar completamente este proyecto desde cero en una cuenta de GitHub, Pinecone, Vercel y Google AI Studio diferente.

### 1. Requisitos Previos

1. **Google AI Studio (Gemini API):**
   * Registra una cuenta en [Google AI Studio](https://aistudio.google.com).
   * Genera una nueva API Key.
   * *Modelo de Embeddings utilizado:* `text-embedding-004` (Dimensión: 768).
   * *Modelo LLM utilizado:* `gemini-1.5-flash` / `gemini-2.0-flash`.

2. **Pinecone Vector DB:**
   * Registra una cuenta gratuita en [Pinecone Console](https://app.pinecone.io).
   * Genera una API Key.
   * Crea un nuevo Índice con las siguientes especificaciones **estrictas**:
     * **Name:** `scrapio` (o el nombre configurado en `PINECONE_INDEX_NAME`).
     * **Dimensions:** `768` (imprescindible para los embeddings de Gemini).
     * **Metric:** `Cosine`.
     * **Type:** `Serverless` (Cloud Provider: AWS, Region: us-east-1).

3. **Repositorio de GitHub:**
   * Clona este repositorio o sube el código a tu cuenta:
     ```bash
     git clone https://github.com/seo-w/scrapio.git
     cd scrapio
     ```

---

## 🔑 2. Variables de Entorno

Crea un archivo `.env.local` en la raíz del proyecto basándote en `.env.example`:

```bash
# Google Gemini API Key
GEMINI_API_KEY=AIzaSy...

# Pinecone Configuration
PINECONE_API_KEY=pcsk_...
PINECONE_INDEX_NAME=scrapio

# Configuración del Proveedor de IA (gemini | openai)
AI_PROVIDER=gemini

# Secreto para la API Headless (/api/v1/query)
SCRAPIO_API_KEY=sk_scrapio_secret_key
```

### GitHub Secrets (Para ejecuciones automatizadas de Ingesta):
En tu repositorio de GitHub, ve a **Settings > Secrets and variables > Actions** y agrega los siguientes secretos:
* `GEMINI_API_KEY`
* `PINECONE_API_KEY`
* `PINECONE_INDEX_NAME`

---

## 🛠️ 3. Instalación y Desarrollo Local

```bash
# 1. Instalar dependencias
npm install

# 2. Ejecutar el servidor de desarrollo
npm run dev

# 3. Ejecutar una ingesta/scraping de prueba desde la terminal
npx tsx scripts/ingest.ts --url https://avafin.mx --namespace cliente-avafin
```

---

## 🏗️ 4. Arquitectura del Proyecto

```
scrapio/
├── .github/
│   └── workflows/
│       └── ingesta.yml         # Workflow de ingesta multi-página automatizado
├── app/
│   ├── api/
│   │   ├── chat/route.ts      # Endpoint streaming para RAG (Web UI)
│   │   └── v1/query/route.ts  # Endpoint headless (JSON con Auth Bearer)
│   ├── page.tsx               # Interfaz Web de Chat y selección de Namespace
│   └── layout.tsx             # Layout global Next.js
├── lib/
│   ├── ai.ts                  # Adaptador modular para Gemini (y OpenAI)
│   ├── pinecone.ts            # Cliente y operaciones Pinecone Namespaces
│   └── crawler.ts             # Crawler multi-página con Cheerio y Turndown
├── scripts/
│   └── ingest.ts              # Script ejecutable de ingesta/vectorización
├── .env.example               # Plantilla de variables de entorno
└── README.md                  # Documentación de replicación y uso
```

---

## 🔒 5. Estrategia de Aislamiento Multi-Tenant

Para garantizar costo cero en la capa gratuita de Pinecone (que permite 1 solo índice), utilizamos **Pinecone Namespaces**:
* Cada cliente o sitio web scrapeado se almacena bajo un `namespace` único (ejemplo: `cliente-avafin`).
* Al realizar una consulta, la búsqueda por similitud vectorial queda estrictamente acotada a dicho `namespace`, impidiendo que los datos de distintos clientes se crucen.
