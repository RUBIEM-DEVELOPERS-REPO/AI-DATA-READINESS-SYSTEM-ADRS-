import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

function getCurrentDirname(): string {
  if (typeof __dirname !== "undefined" && __dirname) {
    return __dirname;
  }
  try {
    return path.dirname(fileURLToPath(import.meta.url));
  } catch {
    return process.cwd();
  }
}

export function serveStatic(app: Express) {
  const currentDir = getCurrentDirname();
  // When running bundled from dist/index.cjs, public is adjacent at dist/public
  let distPath = path.resolve(currentDir, "public");
  if (!fs.existsSync(distPath)) {
    distPath = path.resolve(currentDir, "..", "dist", "public");
  }
  if (!fs.existsSync(distPath)) {
    distPath = path.resolve(process.cwd(), "dist", "public");
  }

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("/{*path}", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}

