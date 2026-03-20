const fsp = require("fs/promises");
const path = require("path");

const LOCAL_HOSTNAME_PATTERN = /^(localhost|127\.0\.0\.1)(:\d+)?$/i;
const STATIC_PAGE_DEFINITIONS = [
    {
        path: "/",
        sourceFile: "index.html",
        priority: "1.0",
        changefreq: "daily",
        type: "page"
    },
    {
        path: "/about.html",
        sourceFile: "about.html",
        priority: "0.7",
        changefreq: "monthly",
        type: "page"
    },
    {
        path: "/contact.html",
        sourceFile: "contact.html",
        priority: "0.8",
        changefreq: "monthly",
        type: "page"
    }
];

function trimTrailingSlashes(value) {
    return String(value || "").replace(/\/+$/, "");
}

function normalizeIsoDate(value) {
    if (!value) return null;
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString();
}

async function getFileLastModified(rootDir, relativePath) {
    try {
        const filePath = path.join(rootDir, relativePath);
        const stat = await fsp.stat(filePath);
        return stat.mtime.toISOString();
    } catch (error) {
        return null;
    }
}

function toAbsoluteUrl(baseUrl, requestPath) {
    return new URL(requestPath, `${trimTrailingSlashes(baseUrl)}/`).toString();
}

async function buildStaticEntries(baseUrl, rootDir) {
    return Promise.all(
        STATIC_PAGE_DEFINITIONS.map(async (definition) => ({
            loc: toAbsoluteUrl(baseUrl, definition.path),
            lastmod: await getFileLastModified(rootDir, definition.sourceFile),
            priority: definition.priority,
            changefreq: definition.changefreq,
            type: definition.type
        }))
    );
}

function buildProductEntry(baseUrl, product) {
    const productId = Number(product && product.id);
    if (!Number.isFinite(productId)) {
        return null;
    }

    const name = String((product && product.name) || "").trim();
    const slug = String((product && product.slug) || "").trim();

    return {
        loc: toAbsoluteUrl(baseUrl, `/product-view.html?id=${encodeURIComponent(String(productId))}`),
        lastmod: normalizeIsoDate(
            (product && (product.updatedAt || product.updated_at))
            || (product && (product.createdAt || product.created_at))
        ),
        priority: "0.8",
        changefreq: "weekly",
        type: "product",
        id: productId,
        slug: slug || null,
        name: name || null
    };
}

function dedupeEntries(entries) {
    const seen = new Set();

    return entries.filter((entry) => {
        if (!entry || !entry.loc || seen.has(entry.loc)) {
            return false;
        }

        seen.add(entry.loc);
        return true;
    });
}

async function buildSitemapManifest(options = {}) {
    const baseUrl = trimTrailingSlashes(options.baseUrl);
    const rootDir = String(options.rootDir || "");
    const products = Array.isArray(options.products) ? options.products : [];

    const staticEntries = await buildStaticEntries(baseUrl, rootDir);
    const productEntries = products
        .map((product) => buildProductEntry(baseUrl, product))
        .filter(Boolean);
    const entries = dedupeEntries([...staticEntries, ...productEntries]);

    return {
        generatedAt: new Date().toISOString(),
        baseUrl,
        counts: {
            total: entries.length,
            pages: staticEntries.length,
            products: productEntries.length
        },
        entries
    };
}

function xmlEscape(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

function renderSitemapXml(entries = []) {
    const items = Array.isArray(entries) ? entries : [];
    const body = items
        .map((entry) => {
            const lastmod = entry.lastmod ? `\n    <lastmod>${xmlEscape(entry.lastmod)}</lastmod>` : "";
            const changefreq = entry.changefreq ? `\n    <changefreq>${xmlEscape(entry.changefreq)}</changefreq>` : "";
            const priority = entry.priority ? `\n    <priority>${xmlEscape(entry.priority)}</priority>` : "";

            return `  <url>\n    <loc>${xmlEscape(entry.loc)}</loc>${lastmod}${changefreq}${priority}\n  </url>`;
        })
        .join("\n");

    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>`;
}

function isCanonicalBaseUrl(value) {
    try {
        const parsed = new URL(String(value || ""));
        return !LOCAL_HOSTNAME_PATTERN.test(parsed.host);
    } catch (error) {
        return false;
    }
}

module.exports = {
    buildSitemapManifest,
    isCanonicalBaseUrl,
    renderSitemapXml
};
