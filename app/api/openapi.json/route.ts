import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost:3000";
  const protocol = req.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
  const serverUrl = `${protocol}://${host}`;

  const openApiSpec = {
    openapi: "3.1.0",
    info: {
      title: "Scrapio SEO API",
      description: "API de Scrapio para consultar contenido web scrapeado, extraer entidades SEO y realizar consultas RAG con Inteligencia Artificial.",
      version: "1.0.0",
    },
    servers: [
      {
        url: serverUrl,
        description: "Servidor activo de Scrapio",
      },
    ],
    paths: {
      "/api/namespaces": {
        get: {
          operationId: "listSites",
          summary: "Listar sitios web y clientes disponibles",
          description: "Devuelve los nombres de los sitios scrapeados (namespaces) y cuántos vectores de conocimiento tienen.",
          responses: {
            "200": {
              description: "Lista de namespaces disponibles",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      totalVectors: { type: "integer" },
                      namespaces: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            name: { type: "string" },
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
      "/api/entities": {
        get: {
          operationId: "getSiteEntities",
          summary: "Extraer entidades SEO de un sitio web",
          description: "Analiza el contenido del sitio web scrapeado y devuelve un informe estructurado de entidades: marcas, productos, servicios, personas, ubicaciones y esquema Schema.org.",
          parameters: [
            {
              name: "namespace",
              in: "query",
              required: true,
              description: "El nombre del cliente o namespace a analizar (ej. cliente-avafin)",
              schema: { type: "string" },
            },
            {
              name: "aiProvider",
              in: "query",
              required: false,
              description: "Proveedor de IA a usar: 'gemini' u 'openai'",
              schema: { type: "string", enum: ["gemini", "openai"] },
            },
          ],
          responses: {
            "200": {
              description: "Análisis completo de entidades SEO",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      namespace: { type: "string" },
                      analysis: { type: "string" },
                      sources: { type: "array", items: { type: "string" } },
                      chunksAnalyzed: { type: "integer" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/chat": {
        post: {
          operationId: "querySiteContent",
          summary: "Hacer una pregunta específica al contenido del sitio",
          description: "Consulta mediante RAG semántico los textos del sitio y responde basándose exclusivamente en el contenido.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["query", "namespace"],
                  properties: {
                    query: { type: "string", description: "La pregunta o tarea a responder" },
                    namespace: { type: "string", description: "El namespace del cliente o sitio web" },
                    aiProvider: { type: "string", enum: ["gemini", "openai"], default: "gemini" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Respuesta generada con fuentes citadas",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      answer: { type: "string" },
                      sources: { type: "array", items: { type: "string" } },
                    },
                  },
                },
              },
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
