import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost:3000";
  const protocol = req.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
  const serverUrl = `${protocol}://${host}`;

  const openApiSpec = {
    openapi: "3.1.0",
    info: {
      title: "Scrapio Headless RAG & SEO API",
      description:
        "API oficial de Scrapio para consultar conocimiento web vectorizado, realizar consultas RAG semánticas por namespace y extraer entidades SEO.",
      version: "1.0.0",
    },
    servers: [
      {
        url: serverUrl,
        description: "Servidor activo de Scrapio",
      },
    ],
    security: [
      {
        bearerAuth: [],
      },
      {
        apiKeyQuery: [],
      },
      {
        apiKeyHeader: [],
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "API Key",
          description: "Ingresa tu Scrapio API Key (sk_scrapio_...)",
        },
        apiKeyHeader: {
          type: "apiKey",
          in: "header",
          name: "X-API-Key",
          description: "Scrapio API Key en cabecera HTTP",
        },
        apiKeyQuery: {
          type: "apiKey",
          in: "query",
          name: "key",
          description: "Scrapio API Key como parámetro de consulta en la URL",
        },
      },
    },
    paths: {
      "/api/v1/namespaces": {
        get: {
          operationId: "listNamespaces",
          summary: "Listar sitios web y clientes disponibles",
          description:
            "Devuelve todos los sitios y clientes indexados en Pinecone con su conteo de vectores y slugs.",
          parameters: [
            {
              name: "key",
              in: "query",
              required: false,
              description: "Tu Scrapio API Key (opcional si usas cabecera Authorization)",
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Lista de namespaces disponibles",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      totalVectors: { type: "integer" },
                      dimension: { type: "integer" },
                      namespaces: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            name: { type: "string" },
                            slug: { type: "string" },
                            vectorCount: { type: "integer" },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/v1/query": {
        post: {
          operationId: "querySiteContent",
          summary: "Consultar conocimiento con RAG semántico",
          description:
            "Realiza una búsqueda semántica de vectores en Pinecone y genera una respuesta contextualizada utilizando IA con fuentes citadas.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["query", "namespace"],
                  properties: {
                    query: {
                      type: "string",
                      description: "Pregunta o tema a consultar (ej. '¿Cuáles son los precios?')",
                    },
                    namespace: {
                      type: "string",
                      description: "El nombre o slug del sitio a consultar (ej. 'Internexa', 'Avafin', 'Tivit')",
                    },
                    topK: {
                      type: "integer",
                      default: 6,
                      description: "Cantidad de fragmentos semánticos a recuperar",
                    },
                    aiProvider: {
                      type: "string",
                      enum: ["gemini", "openai"],
                      default: "gemini",
                      description: "Motor de IA para sintetizar la respuesta",
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Respuesta sintetizada con fuentes citadas",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      status: { type: "string" },
                      query: { type: "string" },
                      namespace: { type: "string" },
                      answer: { type: "string" },
                      sources: { type: "array", items: { type: "string" } },
                      chunks: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            url: { type: "string" },
                            score: { type: "number" },
                            h1: { type: "string" },
                            snippet: { type: "string" },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        get: {
          operationId: "querySiteContentGet",
          summary: "Consultar conocimiento con RAG vía GET",
          description: "Permite hacer consultas rápidas mediante parámetros en la URL.",
          parameters: [
            {
              name: "query",
              in: "query",
              required: true,
              description: "La pregunta o tarea a responder",
              schema: { type: "string" },
            },
            {
              name: "namespace",
              in: "query",
              required: true,
              description: "El sitio o cliente a consultar (ej. 'Internexa', 'Avafin')",
              schema: { type: "string" },
            },
            {
              name: "key",
              in: "query",
              required: false,
              description: "Tu Scrapio API Key",
              schema: { type: "string" },
            },
            {
              name: "topK",
              in: "query",
              required: false,
              schema: { type: "integer", default: 6 },
            },
          ],
          responses: {
            "200": {
              description: "Respuesta sintetizada con fuentes",
            },
          },
        },
      },
      "/api/v1/entities": {
        get: {
          operationId: "getSiteEntities",
          summary: "Extraer entidades SEO del sitio web",
          description:
            "Analiza el conocimiento del sitio web y extrae marcas, catálogo de productos/servicios, directivos, lugares y esquema Schema.org.",
          parameters: [
            {
              name: "namespace",
              in: "query",
              required: true,
              description: "El sitio o namespace a analizar (ej. 'Internexa', 'Avafin')",
              schema: { type: "string" },
            },
            {
              name: "key",
              in: "query",
              required: false,
              description: "Tu Scrapio API Key",
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Informe de entidades SEO estructuradas",
            },
          },
        },
      },
    },
  };

  return NextResponse.json(openApiSpec, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Content-Type": "application/json",
    },
  });
}
