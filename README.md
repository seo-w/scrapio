# 🚀 Scrapio - Sistema RAG Multi-Tenant (Serverless)

Scrapio es una plataforma de **Retrieval-Augmented Generation (RAG) Serverless y Multi-Tenant**, diseñada para extraer contenido web mediante un crawler multi-página automatizado, vectorizar la información por cliente de manera aislada (**Pinecone Namespaces**) y disponibilizar las consultas mediante una API con streaming y una interfaz web moderna.

---

## 📌 Guía de Replicación en Otras Cuentas / Entornos

Esta guía permite replicar el proyecto completo en una nueva cuenta de GitHub, Pinecone, Google AI Studio y Vercel desde cero.

### 1. Requisitos Previos

1. **Google AI Studio (Gemini API Key):**
   * Registra una cuenta en [Google AI Studio](https://aistudio.google.com).
   * Genera una API Key.
   * *Modelo de Embeddings:* `gemini-embedding-001` (Dimensión: 768 mediante `outputDimensionality: 768`).
   * *Modelo LLM para RAG:* `gemini-3.8-flash`.

2. **Pinecone Vector DB:**
   * Registra una cuenta gratuita en [Pinecone Console](https://app.pinecone.io).
   * Genera una API Key.
   * Crea un nuevo Índice Serverless con estas especificaciones:
     * **Name:** `scrapio` (o el configurado en `PINECONE_INDEX_NAME`).
     * **Dimensions:** `768` (imprescindible para la dimensión configurada en Gemini).
     * **Metric:** `Cosine`.
     * **Type:** `Serverless` (Cloud Provider: AWS, Region: us-east-1).

---

## 🔑 2. Variables de Entorno (.env.local)

Crea el archivo `.env.local` en la raíz del proyecto (basándote en `.env.example`):

```env
# Google Gemini API Key
GEMINI_API_KEY=tu_gemini_api_key_aqui

# Pinecone API Configuration
PINECONE_API_KEY=tu_pinecone_api_key_aqui
PINECONE_INDEX_NAME=scrapio

# Proveedor de IA por defecto (gemini | openai)
AI_PROVIDER=gemini

# Secreto para la API Headless (/api/v1/query)
SCRAPIO_API_KEY=tu_secret_token_personalizado
```

---

## 🚀 3. Comandos de Desarrollo e Ingesta Local

```bash
# 1. Instalar dependencias
npm install

# 2. Iniciar el servidor de desarrollo
npm run dev

# 3. Probar la ingesta de un sitio web desde la terminal (ejemplo: avafin.mx)
npx tsx scripts/ingest.ts --url https://avafin.mx --namespace cliente-avafin --maxPages 10
```

---

## 📡 4. Documentación de APIs (Endpoints)

### A. Endpoint RAG para Interfaz Web (`/api/chat`)
* **Método:** `POST`
* **Content-Type:** `application/json`
* **Body:**
  ```json
  {
    "query": "¿Cuáles son los requisitos para un préstamo?",
    "namespace": "cliente-avafin"
  }
  ```
* **Respuesta Exitosa:**
  ```json
  {
    "answer": "Para solicitar un préstamo se requiere...",
    "sources": [
      "https://avafin.mx/",
      "https://avafin.mx/sucursales-puebla"
    ],
    "matchesCount": 4
  }
  ```

### B. Endpoint Headless para Agentes / Terminal (`/api/v1/query`)
* **Método:** `POST`
* **Headers:** `Authorization: Bearer <SCRAPIO_API_KEY>`
* **Body:**
  ```json
  {
    "query": "¿Qué servicios ofrecen en sucursal?",
    "namespace": "cliente-avafin"
  }
  ```
* **Ejemplo cURL:**
  ```bash
  curl -X POST http://localhost:3000/api/v1/query \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer sk_scrapio_default_secret_key_2026" \
    -d '{"query": "¿Qué servicios ofrecen?", "namespace": "cliente-avafin"}'
  ```

---

## 🤖 5. Ingesta Automatizada en GitHub Actions

El proyecto incluye un workflow en `.github/workflows/ingesta.yml` que permite ejecutar el scraping e ingesta directamente desde la pestaña **Actions** de GitHub sin necesidad de terminal.

### Configuración de Secretos en GitHub:
En tu repositorio de GitHub, ve a **Settings > Secrets and variables > Actions** e ingresa:
1. `GEMINI_API_KEY`
2. `PINECONE_API_KEY`
3. `PINECONE_INDEX_NAME`

### Cómo Ejecutar:
1. Ve a la pestaña **Actions** en GitHub.
2. Selecciona el workflow **Ingesta & Crawler Scrapio RAG**.
3. Haz clic en **Run workflow** e ingresa los parámetros:
   * `target_url`: `https://unsitio.com`
   * `client_namespace`: `cliente-unsitio`
   * `max_pages`: `15`

---

## 🌐 6. Despliegue en Vercel

1. Sube tu repositorio a GitHub.
2. Conecta el repositorio en [Vercel Console](https://vercel.com).
3. En la sección **Environment Variables** de Vercel, agrega:
   * `GEMINI_API_KEY`
   * `PINECONE_API_KEY`
   * `PINECONE_INDEX_NAME`
   * `SCRAPIO_API_KEY`
4. Haz clic en **Deploy**. ¡Tu plataforma RAG Multi-Tenant estará en producción!

---

## 🏗️ Estructura del Código

```
scrapio/
├── .github/workflows/ingesta.yml   # Workflow de GitHub Actions para scraping
├── app/
│   ├── api/
│   │   ├── chat/route.ts        # Endpoint para Chat Web
│   │   └── v1/query/route.ts    # Endpoint Headless (JSON + Auth)
│   ├── globals.css              # Estilos globales con Tailwind CSS
│   ├── layout.tsx               # Layout principal
│   └── page.tsx                 # Interfaz de Chat con selección de Namespace
├── lib/
│   ├── ai.ts                    # Adaptador de Gemini (embeddings y LLM)
│   ├── pinecone.ts              # Operaciones aisladas por Namespace en Pinecone
│   └── crawler.ts               # Crawler multi-página con Cheerio y Turndown
├── scripts/
│   └── ingest.ts                # CLI ejecutable de scraping e ingesta
├── .env.example                 # Plantilla de variables de entorno
└── README.md                    # Documentación técnica de replicación
```
