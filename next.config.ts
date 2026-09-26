import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (WASM) e pdfkit (font AFM + dati) leggono file dal filesystem:
  // il bundling li romperebbe, restano esterni. L'SDK MCP porta con sé server
  // HTTP interi (express, hono): esterno anche lui, non va impacchettato.
  // pg gestisce le connessioni TCP native a PostgreSQL su Linux/server dedicato.
  serverExternalPackages: ["@electric-sql/pglite", "pdfkit", "@modelcontextprotocol/sdk", "pg"],
};

export default nextConfig;
