import fs from "node:fs";
import path from "node:path";

/**
 * Pretty URL middleware
 *
 * Examples:
 *   /             -> public/index.html
 *   /products     -> public/products.html
 *   /deals        -> public/deals.html
 *   /stores       -> public/stores.html
 *   /about        -> public/about.html
 *
 * It does NOT interfere with:
 *   /api/*
 *   /admin/*
 *   /css/*
 *   /js/*
 *   /images/*
 *   /favicon.ico
 *   /anything.css
 *   /anything.js
 */
export function prettyPages(publicDir) {
  return (req, res, next) => {
    // Only handle GET requests
    if (req.method !== "GET") {
      return next();
    }

    const requestPath = req.path;

    // Never intercept API/admin routes
    if (
      requestPath.startsWith("/api/") ||
      requestPath === "/api" ||
      requestPath.startsWith("/admin/") ||
      requestPath === "/admin"
    ) {
      return next();
    }

    // Root URL -> index.html
    if (requestPath === "/") {
      const indexFile = path.join(publicDir, "index.html");

      if (fs.existsSync(indexFile)) {
        return res.sendFile(indexFile);
      }

      return next();
    }

    // If URL already contains a file extension,
    // let express.static() handle it.
    if (path.extname(requestPath)) {
      return next();
    }

    // Remove leading slash
    const pageName = requestPath.slice(1);

    // Only allow simple page names.
    // Prevent paths such as:
    // /../something
    // /foo/bar
    // /foo\bar
    if (
      !pageName ||
      pageName.includes("..") ||
      pageName.includes("/") ||
      pageName.includes("\\")
    ) {
      return next();
    }

    // /products -> products.html
    const htmlFile = path.join(publicDir, `${pageName}.html`);

    // Only serve the page if the actual file exists
    if (fs.existsSync(htmlFile)) {
      return res.sendFile(htmlFile);
    }

    // Not a page we know about
    next();
  };
}
