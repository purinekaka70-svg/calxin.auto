const express = require("express");
const mysql = require("mysql2/promise");
const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");
const crypto = require("crypto");
const { createLocalStore } = require("./local-store.cjs");
const { buildSitemapManifest, isCanonicalBaseUrl, renderSitemapXml } = require("./sitemap-data");

dotenv.config();

const app = express();
app.set("trust proxy", true);
const ROOT_DIR = __dirname;
const PORT = Number(process.env.PORT) || 3000;
const SITE_BASE_URL = String(process.env.SITE_BASE_URL || `http://localhost:${PORT}`).replace(/\/+$/, "");
const UPLOADS_DIR = path.join(ROOT_DIR, process.env.UPLOADS_DIR || "uploads");
const IMAGE_UPLOADS_DIR = path.join(UPLOADS_DIR, "images");
const LOCAL_STORE_FILE = path.join(ROOT_DIR, ".local", "calxin-store.json");
const JSON_LIMIT = "25mb";
const ADMIN_SESSION_COOKIE = "calxinAdminSession";
const ADMIN_SESSION_DURATION_SECONDS = 60 * 60 * 12;
const PUBLIC_FILE_ALIASES = new Map([
    [
        "/calxin.images/WhatsApp Image 2026-01-23 at 5.00.11 PM.jpeg",
        "/calxin.images/WhatsApp Image 2026-01-23 at 5.01.09 PM.jpeg"
    ]
]);
const PUBLIC_EXTENSIONS = new Set([
    ".html",
    ".css",
    ".js",
    ".jpeg",
    ".jpg",
    ".png",
    ".gif",
    ".webp",
    ".svg",
    ".ico",
    ".txt",
    ".xml",
    ".webmanifest",
    ".json"
]);

class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.name = "HttpError";
        this.status = status;
    }
}

let dbPool = null;
let dbRetryAfter = 0;
let adminAuditTableReady = false;
const localStore = createLocalStore({
    dataFile: LOCAL_STORE_FILE,
    persist: !process.env.VERCEL
});

function buildDbConfig() {
    const host = String(process.env.MYSQL_HOST || "").trim();
    const database = String(process.env.MYSQL_DATABASE || "").trim();
    const user = String(process.env.MYSQL_USER || "").trim();

    if (!host || !database || !user) {
        return null;
    }

    return {
        host,
        port: Number(process.env.MYSQL_PORT) || 3306,
        user,
        password: String(process.env.MYSQL_PASSWORD || ""),
        database,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        ssl: { rejectUnauthorized: false } // Helps with cloud DB connections (PlanetScale, Aiven, etc.)
    };
}

function getDbPool() {
    if (dbPool) return dbPool;
    const config = buildDbConfig();
    if (!config) return null;
    dbPool = mysql.createPool(config);
    return dbPool;
}

async function getAvailableDbPool() {
    if (Date.now() < dbRetryAfter) {
        return null;
    }

    const pool = getDbPool();
    if (!pool) {
        return null;
    }

    try {
        await pool.query("SELECT 1");
        return pool;
    } catch (error) {
        dbRetryAfter = Date.now() + 30000;
        try {
            await pool.end();
        } catch (endError) {
            // Ignore pool shutdown errors; the fallback store will be used instead.
        }
        dbPool = null;
        adminAuditTableReady = false;
        console.warn("MySQL unavailable. Falling back to local store.", error.message);
        return null;
    }
}

function asyncHandler(handler) {
    return function wrappedHandler(req, res, next) {
        Promise.resolve(handler(req, res, next)).catch(next);
    };
}

function setCorsHeaders(req, res) {
    const configured = String(process.env.CORS_ORIGIN || "*").trim();
    const requestOrigin = req.headers.origin;

    if (configured === "*") {
        res.setHeader("Access-Control-Allow-Origin", "*");
    } else {
        const allowedOrigins = configured
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean);
        if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
            res.setHeader("Access-Control-Allow-Origin", requestOrigin);
        }
        res.setHeader("Vary", "Origin");
    }

    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
}

function setSecurityHeaders(res) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    res.setHeader(
        "Content-Security-Policy",
        [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline'",
            "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com",
            "font-src 'self' data: https://cdnjs.cloudflare.com https://fonts.gstatic.com",
            "img-src 'self' data: https:",
            "connect-src 'self'",
            "frame-src https://www.google.com https://www.google.com/maps",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'self'",
            "upgrade-insecure-requests"
        ].join("; ")
    );
}

app.use((req, res, next) => {
    setCorsHeaders(req, res);
    setSecurityHeaders(res);
    if (req.method === "OPTIONS") {
        return res.sendStatus(204);
    }
    return next();
});

app.use(express.json({ limit: JSON_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: JSON_LIMIT }));
app.use("/uploads", express.static(UPLOADS_DIR));

function ensureUploadsDirectories() {
    if (process.env.VERCEL) return; // Skip on Vercel (Read-only file system)
    try {
        if (!fs.existsSync(IMAGE_UPLOADS_DIR)) {
            fs.mkdirSync(IMAGE_UPLOADS_DIR, { recursive: true });
        }
    } catch (err) {
        console.warn("Warning: Could not create upload directories. System might be read-only.");
    }
}

function slugify(value) {
    return String(value || "")
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[^\w\s-]/g, "")
        .trim()
        .replace(/[-\s]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function stripHtml(value) {
    return String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function clampNumber(value, min, max, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(min, Math.min(max, numeric));
}

function coercePublished(value) {
    if (value === false || value === 0 || value === "0" || value === "false") {
        return 0;
    }
    return 1;
}

function toIsoString(value) {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString();
    return new Date(value).toISOString();
}

function normalizeFileName(value, fallbackBase) {
    const raw = String(value || "").trim();
    if (!raw) return fallbackBase;
    return raw.replace(/[^\w.-]/g, "-");
}

function getFileExtension(dataUrl, fileName) {
    const mimeMatch = String(dataUrl || "").match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/i);
    if (mimeMatch) {
        const mimeSubtype = mimeMatch[1].split("/")[1] || "png";
        return mimeSubtype.replace(/[^a-z0-9]/gi, "").toLowerCase() || "png";
    }
    const ext = path.extname(String(fileName || "")).replace(".", "").toLowerCase();
    return ext || "png";
}

async function saveImageDataUrl(dataUrl, fileName, prefix) {
    if (!dataUrl) return null;

    const match = String(dataUrl).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/i);
    if (!match) {
        throw new HttpError(400, "Invalid image payload. Expected a base64 data URL.");
    }

    // On Vercel, we cannot write files to disk. We return the dataUrl to store in DB directly.
    if (process.env.VERCEL) {
        return dataUrl;
    }

    try {
        ensureUploadsDirectories();

        const extension = getFileExtension(dataUrl, fileName);
        const baseName = normalizeFileName(fileName, `${prefix}.${extension}`).replace(new RegExp(`\\.${extension}$`, "i"), "");
        const uniqueName = `${baseName}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${extension}`;
        const outputPath = path.join(IMAGE_UPLOADS_DIR, uniqueName);
        const binary = Buffer.from(match[2], "base64");

        await fsp.writeFile(outputPath, binary);
        return `/uploads/images/${uniqueName}`;
    } catch (error) {
        // If file system is read-only or writing fails, fallback to using the Base64 data URL
        console.error("File write failed (likely read-only environment). Falling back to Base64 storage.", error.message);
        return dataUrl;
    }
}

function normalizeProduct(row) {
    return {
        id: Number(row.id),
        name: row.name,
        slug: row.slug,
        category: row.category,
        price: Number(row.price),
        stock: Number(row.stock_quantity),
        rating: Number(row.rating),
        image: row.image_url,
        description: row.description || "",
        documentUrl: row.document_url || "",
        documentProvider: row.document_provider || "",
        published: Boolean(row.is_published),
        createdAt: toIsoString(row.created_at),
        updatedAt: toIsoString(row.updated_at)
    };
}

function normalizePost(row) {
    return {
        id: Number(row.id),
        title: row.title,
        slug: row.slug,
        excerpt: row.excerpt || "",
        content: row.content,
        image: row.image_url || "",
        documentUrl: row.document_url || "",
        documentProvider: row.document_provider || "",
        published: Boolean(row.is_published),
        createdAt: toIsoString(row.created_at),
        updatedAt: toIsoString(row.updated_at)
    };
}

function normalizeMedia(row) {
    return {
        id: Number(row.id),
        name: row.name,
        url: row.file_url,
        type: row.mime_type || "",
        description: row.description || "",
        category: row.category,
        productId: row.product_id ? Number(row.product_id) : null,
        postId: row.post_id ? Number(row.post_id) : null,
        uploadDate: toIsoString(row.created_at),
        updatedAt: toIsoString(row.updated_at)
    };
}

function sanitizeProductPayload(body) {
    const name = String(body.name || "").trim();
    if (!name) {
        throw new HttpError(400, "Product name is required.");
    }

    return {
        name,
        slug: slugify(body.slug || name),
        category: String(body.category || "General").trim(),
        price: clampNumber(body.price, 0, 999999999, 0),
        stock: Math.round(clampNumber(body.stock ?? body.stock_quantity, 0, 999999, 0)),
        rating: clampNumber(body.rating, 0, 5, 4.5),
        imageUrl: String(body.imageUrl || body.image || body.image_url || "").trim(),
        imageDataUrl: String(body.imageDataUrl || "").trim(),
        imageFileName: String(body.imageFileName || "").trim(),
        description: String(body.description || "").trim(),
        documentUrl: String(body.documentUrl || body.document_url || "").trim(),
        documentProvider: String(body.documentProvider || body.document_provider || "").trim(),
        published: coercePublished(body.published)
    };
}

function sanitizePostPayload(body) {
    const title = String(body.title || "").trim();
    const content = String(body.content || "").trim();

    if (!title) {
        throw new HttpError(400, "Post title is required.");
    }

    if (!content) {
        throw new HttpError(400, "Post content is required.");
    }

    const excerptSource = String(body.excerpt || "").trim() || stripHtml(content);

    return {
        title,
        slug: slugify(body.slug || title),
        excerpt: excerptSource.slice(0, 220),
        content,
        imageUrl: String(body.imageUrl || body.image || body.image_url || "").trim(),
        imageDataUrl: String(body.imageDataUrl || "").trim(),
        imageFileName: String(body.imageFileName || "").trim(),
        documentUrl: String(body.documentUrl || body.document_url || "").trim(),
        documentProvider: String(body.documentProvider || body.document_provider || "").trim(),
        published: coercePublished(body.published)
    };
}

function sanitizeMediaPayload(body) {
    const name = String(body.name || "").trim();
    if (!name) {
        throw new HttpError(400, "Image name is required.");
    }

    return {
        name,
        url: String(body.url || body.imageUrl || "").trim(),
        dataUrl: String(body.dataUrl || body.imageDataUrl || "").trim(),
        fileName: String(body.fileName || body.imageFileName || "").trim(),
        description: String(body.description || "").trim(),
        category: String(body.category || "other").trim() || "other",
        productId: body.productId ? Number(body.productId) : null,
        postId: body.postId ? Number(body.postId) : null
    };
}

function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
}

function hashPassword(value) {
    return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function readAuthToken(req) {
    const header = String(req.headers.authorization || "").trim();
    if (header.toLowerCase().startsWith("bearer ")) {
        return header.slice(7).trim();
    }

    return String(req.headers["x-customer-token"] || "").trim();
}

function readCookie(req, name) {
    const cookieHeader = String(req.headers.cookie || "");
    if (!cookieHeader) return "";

    const cookies = cookieHeader.split(";").map((part) => part.trim());
    const match = cookies.find((cookie) => cookie.toLowerCase().startsWith(`${String(name || "").toLowerCase()}=`));
    if (!match) return "";

    return decodeURIComponent(match.slice(match.indexOf("=") + 1));
}

function serializeCookie(name, value, options = {}) {
    const parts = [`${name}=${encodeURIComponent(String(value || ""))}`];

    if (options.maxAge !== undefined) {
        parts.push(`Max-Age=${Math.max(0, Math.floor(Number(options.maxAge) || 0))}`);
    }

    parts.push(`Path=${options.path || "/"}`);

    if (options.httpOnly) {
        parts.push("HttpOnly");
    }

    if (options.sameSite) {
        parts.push(`SameSite=${options.sameSite}`);
    }

    if (options.secure) {
        parts.push("Secure");
    }

    return parts.join("; ");
}

function shouldUseSecureCookies(req) {
    const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim().toLowerCase();
    return forwardedProto === "https" || req.secure || Boolean(process.env.VERCEL);
}

function getAdminConfig() {
    const username = String(process.env.ADMIN_USERNAME || "admin").trim();
    const password = String(process.env.ADMIN_PASSWORD || "").trim();
    const configuredSecret = String(process.env.ADMIN_SESSION_SECRET || "").trim();

    if (!password) {
        return null;
    }

    return {
        username,
        password,
        secret: configuredSecret || hashPassword(`${username}:${password}:calxin-admin-session`)
    };
}

function safeCompareStrings(left, right) {
    const leftBuffer = Buffer.from(String(left || ""), "utf8");
    const rightBuffer = Buffer.from(String(right || ""), "utf8");

    if (leftBuffer.length !== rightBuffer.length) {
        return false;
    }

    return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function signAdminSessionToken(payload, secret) {
    const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    const signature = crypto.createHmac("sha256", secret).update(encodedPayload).digest("base64url");
    return `${encodedPayload}.${signature}`;
}

function verifyAdminSessionToken(token, secret) {
    const raw = String(token || "").trim();
    if (!raw || !raw.includes(".")) {
        return null;
    }

    const [encodedPayload, providedSignature] = raw.split(".");
    if (!encodedPayload || !providedSignature) {
        return null;
    }

    const expectedSignature = crypto.createHmac("sha256", secret).update(encodedPayload).digest("base64url");
    if (!safeCompareStrings(providedSignature, expectedSignature)) {
        return null;
    }

    try {
        const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
        if (!payload || typeof payload !== "object") {
            return null;
        }

        if (!payload.exp || Number(payload.exp) <= Math.floor(Date.now() / 1000)) {
            return null;
        }

        return payload;
    } catch (error) {
        return null;
    }
}

function createAdminSessionToken(adminConfig) {
    const now = Math.floor(Date.now() / 1000);
    return signAdminSessionToken(
        {
            sub: adminConfig.username,
            role: "admin",
            iat: now,
            exp: now + ADMIN_SESSION_DURATION_SECONDS
        },
        adminConfig.secret
    );
}

function setAdminSessionCookie(res, req, token) {
    res.setHeader(
        "Set-Cookie",
        serializeCookie(ADMIN_SESSION_COOKIE, token, {
            httpOnly: true,
            sameSite: "Lax",
            secure: shouldUseSecureCookies(req),
            maxAge: ADMIN_SESSION_DURATION_SECONDS,
            path: "/"
        })
    );
}

function clearAdminSessionCookie(res, req) {
    res.setHeader(
        "Set-Cookie",
        serializeCookie(ADMIN_SESSION_COOKIE, "", {
            httpOnly: true,
            sameSite: "Lax",
            secure: shouldUseSecureCookies(req),
            maxAge: 0,
            path: "/"
        })
    );
}

function getAuthenticatedAdmin(req) {
    const adminConfig = getAdminConfig();
    if (!adminConfig) {
        return null;
    }

    const token = readCookie(req, ADMIN_SESSION_COOKIE);
    if (!token) {
        return null;
    }

    const payload = verifyAdminSessionToken(token, adminConfig.secret);
    if (!payload) {
        return null;
    }

    if (payload.sub !== adminConfig.username || payload.role !== "admin") {
        return null;
    }

    return {
        username: adminConfig.username
    };
}

function requireAdmin(req) {
    const admin = getAuthenticatedAdmin(req);
    if (!admin) {
        throw new HttpError(401, "Admin sign-in required.");
    }
    return admin;
}

function sanitizeAdminLoginPayload(body) {
    const username = String(body.username || body.email || "").trim();
    const password = String(body.password || "");

    if (!username) {
        throw new HttpError(400, "Admin username is required.");
    }

    if (!password) {
        throw new HttpError(400, "Admin password is required.");
    }

    return {
        username,
        password
    };
}

function sanitizeCustomer(row) {
    if (!row) return null;

    return {
        id: Number(row.id),
        name: row.name,
        email: row.email,
        phone: row.phone,
        createdAt: toIsoString(row.created_at),
        updatedAt: toIsoString(row.updated_at),
        lastLoginAt: toIsoString(row.last_login_at)
    };
}

function sanitizeRegisterPayload(body) {
    const name = String(body.name || "").trim();
    const email = normalizeEmail(body.email);
    const phone = String(body.phone || "").trim();
    const password = String(body.password || "");

    if (!name) {
        throw new HttpError(400, "Full name is required.");
    }

    if (!email || !email.includes("@")) {
        throw new HttpError(400, "A valid email address is required.");
    }

    if (!phone) {
        throw new HttpError(400, "Phone number is required.");
    }

    if (password.length < 6) {
        throw new HttpError(400, "Password must be at least 6 characters.");
    }

    return {
        name,
        email,
        phone,
        password
    };
}

function sanitizeLoginPayload(body) {
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");

    if (!email || !email.includes("@")) {
        throw new HttpError(400, "Email is required.");
    }

    if (!password) {
        throw new HttpError(400, "Password is required.");
    }

    return {
        email,
        password
    };
}

function sanitizeOrderItems(items) {
    if (!Array.isArray(items) || !items.length) {
        throw new HttpError(400, "Select at least one product before sending a request.");
    }

    return items.map((item) => {
        const name = String(item.name || "").trim();
        const quantity = Math.max(1, Math.round(clampNumber(item.quantity || item.qty, 1, 999, 1)));
        const price = clampNumber(item.price, 0, 999999999, 0);

        if (!name) {
            throw new HttpError(400, "Each order item must have a product name.");
        }

        return {
            name,
            quantity,
            price
        };
    });
}

function sanitizeGuestOrderContact(payload) {
    const body = payload && typeof payload === "object" ? payload : {};
    const name = String(body.name || "").trim().slice(0, 180);
    const phone = String(body.phone || "").trim().slice(0, 60);
    const emailRaw = String(body.email || "").trim();
    const email = emailRaw ? normalizeEmail(emailRaw) : "";

    if (!name) {
        throw new HttpError(400, "Enter your name before sending the request.");
    }

    if (!phone) {
        throw new HttpError(400, "Enter your phone or WhatsApp number before sending the request.");
    }

    if (emailRaw && (!email || !email.includes("@"))) {
        throw new HttpError(400, "Enter a valid email address or leave it blank.");
    }

    return {
        name,
        phone,
        email
    };
}

function sanitizeChatMessage(value) {
    const message = String(value || "").trim();
    if (!message) {
        throw new HttpError(400, "Message is required.");
    }
    return message.slice(0, 4000);
}

function sanitizeChatSubject(value, fallback = "Customer Request") {
    return String(value || "").trim().slice(0, 255) || fallback;
}

function sanitizeChatStatus(value) {
    const normalized = String(value || "").trim();
    const allowed = new Set(["Open", "Waiting", "Resolved", "Closed"]);
    return allowed.has(normalized) ? normalized : "Open";
}

function normalizeOrderItem(row) {
    return {
        id: Number(row.id),
        order_id: Number(row.order_id),
        product_name: row.product_name,
        quantity: Number(row.quantity || 0),
        price: Number(row.price || 0)
    };
}

function normalizeOrder(row) {
    return {
        ...row,
        id: Number(row.id),
        customer_id: row.customer_id ? Number(row.customer_id) : null,
        total_amount: Number(row.total_amount || 0),
        items: Array.isArray(row.items) ? row.items.map(normalizeOrderItem) : []
    };
}

function normalizeChatThread(row) {
    return {
        id: Number(row.id),
        customerId: Number(row.customer_id),
        orderId: row.order_id ? Number(row.order_id) : null,
        subject: row.subject,
        status: row.status,
        customerName: row.customer_name || "",
        customerEmail: row.customer_email || "",
        customerPhone: row.customer_phone || "",
        orderTotal: Number(row.order_total || 0),
        orderStatus: row.order_status || "",
        lastMessage: row.last_message || "",
        lastMessageAt: toIsoString(row.last_message_at || row.updated_at || row.created_at),
        messageCount: Number(row.message_count || 0),
        createdAt: toIsoString(row.created_at),
        updatedAt: toIsoString(row.updated_at)
    };
}

function normalizeChatMessage(row) {
    return {
        id: Number(row.id),
        threadId: Number(row.thread_id),
        senderRole: row.sender_role,
        senderName: row.sender_name,
        message: row.message,
        createdAt: toIsoString(row.created_at)
    };
}

function normalizeAdminAuditLog(row) {
    let details = row.details;

    if (typeof details === "string") {
        try {
            details = JSON.parse(details);
        } catch (error) {
            details = details ? { raw: details } : null;
        }
    }

    return {
        id: Number(row.id),
        adminUsername: row.admin_username,
        action: row.action,
        targetType: row.target_type || "",
        targetId: row.target_id || "",
        ipAddress: row.ip_address || "",
        userAgent: row.user_agent || "",
        details: details && typeof details === "object" ? details : null,
        createdAt: toIsoString(row.created_at)
    };
}

function buildOrderChatMessage(orderId, items, total, note = "") {
    const lines = [`Order request ORD-${orderId}`, ""];

    items.forEach((item, index) => {
        lines.push(`${index + 1}. ${item.name} x${item.quantity} - KES ${Number(item.price || 0).toLocaleString()}`);
    });

    lines.push("");
    lines.push(`Estimated total: KES ${Number(total || 0).toLocaleString()}`);

    const trimmedNote = String(note || "").trim();
    if (trimmedNote) {
        lines.push(`Customer note: ${trimmedNote.slice(0, 1000)}`);
    }

    lines.push("Please confirm stock, collection or delivery, and how the customer should complete payment with admin.");
    return lines.join("\n");
}

async function getAuthenticatedCustomer(req, pool) {
    const token = readAuthToken(req);
    if (!token) return null;

    if (!pool) {
        return localStore.findCustomerBySessionToken(token);
    }

    const [rows] = await pool.execute(
        `SELECT
            id,
            name,
            email,
            phone,
            password_hash,
            session_token,
            created_at,
            updated_at,
            last_login_at
         FROM customers
         WHERE session_token = ?
         LIMIT 1`,
        [token]
    );

    return rows[0] || null;
}

async function listOrdersFromDb(pool, customerId = null) {
    const clauses = [];
    const params = [];

    if (customerId !== null && customerId !== undefined) {
        clauses.push("customer_id = ?");
        params.push(Number(customerId));
    }

    const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const [orders] = await pool.execute(`SELECT * FROM orders ${whereClause} ORDER BY created_at DESC`, params);

    const orderIds = orders.map((order) => Number(order.id));
    const itemsMap = new Map();

    if (orderIds.length) {
        const placeholders = orderIds.map(() => "?").join(", ");
        const [items] = await pool.execute(
            `SELECT * FROM order_items WHERE order_id IN (${placeholders}) ORDER BY id ASC`,
            orderIds
        );

        items.forEach((item) => {
            const key = Number(item.order_id);
            if (!itemsMap.has(key)) {
                itemsMap.set(key, []);
            }
            itemsMap.get(key).push(normalizeOrderItem(item));
        });
    }

    return orders.map((order) => normalizeOrder({
        ...order,
        items: itemsMap.get(Number(order.id)) || []
    }));
}

async function listChatThreadsFromDb(pool, customerId = null) {
    const clauses = [];
    const params = [];

    if (customerId !== null && customerId !== undefined) {
        clauses.push("ct.customer_id = ?");
        params.push(Number(customerId));
    }

    const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const [threads] = await pool.execute(
        `SELECT
            ct.*,
            c.name AS customer_name,
            c.email AS customer_email,
            c.phone AS customer_phone,
            o.total_amount AS order_total,
            o.status AS order_status
         FROM chat_threads ct
         INNER JOIN customers c ON c.id = ct.customer_id
         LEFT JOIN orders o ON o.id = ct.order_id
         ${whereClause}
         ORDER BY ct.updated_at DESC, ct.id DESC`,
        params
    );

    if (!threads.length) {
        return [];
    }

    const threadIds = threads.map((thread) => Number(thread.id));
    const placeholders = threadIds.map(() => "?").join(", ");
    const [messages] = await pool.execute(
        `SELECT thread_id, id, message, created_at
         FROM chat_messages
         WHERE thread_id IN (${placeholders})
         ORDER BY created_at DESC, id DESC`,
        threadIds
    );

    const lastMessageMap = new Map();
    const countMap = new Map();

    messages.forEach((message) => {
        const key = Number(message.thread_id);
        countMap.set(key, Number(countMap.get(key) || 0) + 1);
        if (!lastMessageMap.has(key)) {
            lastMessageMap.set(key, message);
        }
    });

    return threads.map((thread) => {
        const lastMessage = lastMessageMap.get(Number(thread.id));
        return normalizeChatThread({
            ...thread,
            last_message: lastMessage ? lastMessage.message : "",
            last_message_at: lastMessage ? lastMessage.created_at : thread.updated_at,
            message_count: countMap.get(Number(thread.id)) || 0
        });
    });
}

async function getChatThreadFromDb(pool, threadId) {
    const [rows] = await pool.execute(
        `SELECT
            ct.*,
            c.name AS customer_name,
            c.email AS customer_email,
            c.phone AS customer_phone,
            o.total_amount AS order_total,
            o.status AS order_status
         FROM chat_threads ct
         INNER JOIN customers c ON c.id = ct.customer_id
         LEFT JOIN orders o ON o.id = ct.order_id
         WHERE ct.id = ?
         LIMIT 1`,
        [threadId]
    );

    if (!rows[0]) {
        return null;
    }

    const [summaryRows] = await pool.execute(
        `SELECT thread_id, id, message, created_at
         FROM chat_messages
         WHERE thread_id = ?
         ORDER BY created_at DESC, id DESC`,
        [threadId]
    );

    return normalizeChatThread({
        ...rows[0],
        last_message: summaryRows[0] ? summaryRows[0].message : "",
        last_message_at: summaryRows[0] ? summaryRows[0].created_at : rows[0].updated_at,
        message_count: summaryRows.length
    });
}

async function listChatMessagesFromDb(pool, threadId) {
    const [rows] = await pool.execute(
        `SELECT * FROM chat_messages WHERE thread_id = ? ORDER BY created_at ASC, id ASC`,
        [threadId]
    );

    return rows.map(normalizeChatMessage);
}

async function insertMediaAsset(connection, payload) {
    if (!payload.url) return null;

    const [result] = await connection.execute(
        `INSERT INTO media_assets (
            name,
            file_url,
            mime_type,
            description,
            category,
            product_id,
            post_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
            payload.name,
            payload.url,
            payload.type || null,
            payload.description || "",
            payload.category || "other",
            payload.productId || null,
            payload.postId || null
        ]
    );

    return result.insertId;
}

function getClientIp(req) {
    const forwardedFor = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    return forwardedFor || req.ip || req.socket.remoteAddress || "";
}

async function ensureAdminAuditLogTable(pool) {
    if (adminAuditTableReady) {
        return;
    }

    await pool.execute(
        `CREATE TABLE IF NOT EXISTS admin_audit_logs (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            admin_username VARCHAR(120) NOT NULL,
            action VARCHAR(120) NOT NULL,
            target_type VARCHAR(80) DEFAULT NULL,
            target_id VARCHAR(120) DEFAULT NULL,
            ip_address VARCHAR(120) DEFAULT NULL,
            user_agent VARCHAR(255) DEFAULT NULL,
            details JSON DEFAULT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_admin_audit_logs_admin_username (admin_username),
            KEY idx_admin_audit_logs_action (action),
            KEY idx_admin_audit_logs_target_type (target_type),
            KEY idx_admin_audit_logs_created_at (created_at)
        )`
    );

    adminAuditTableReady = true;
}

async function listAdminAuditLogsFromDb(pool, limit = 50) {
    await ensureAdminAuditLogTable(pool);
    const rowLimit = Math.max(1, Math.min(200, Number(limit) || 50));
    const [rows] = await pool.execute(
        `SELECT
            id,
            admin_username,
            action,
            target_type,
            target_id,
            ip_address,
            user_agent,
            details,
            created_at
         FROM admin_audit_logs
         ORDER BY created_at DESC, id DESC
         LIMIT ?`,
        [rowLimit]
    );

    return rows.map(normalizeAdminAuditLog);
}

async function recordAdminAuditLog({ req, adminUsername, action, targetType = null, targetId = null, details = null }) {
    const payload = {
        admin_username: String(adminUsername || "").trim() || "admin",
        action: String(action || "").trim() || "unknown",
        target_type: targetType ? String(targetType).trim() : null,
        target_id: targetId !== null && targetId !== undefined ? String(targetId).trim() : null,
        ip_address: getClientIp(req) || null,
        user_agent: String(req.headers["user-agent"] || "").trim().slice(0, 255) || null,
        details: details && typeof details === "object" ? details : null
    };

    const pool = await getAvailableDbPool();

    try {
        if (!pool) {
            await localStore.createAdminAuditLog(payload);
            return;
        }

        await ensureAdminAuditLogTable(pool);
        await pool.execute(
            `INSERT INTO admin_audit_logs (
                admin_username,
                action,
                target_type,
                target_id,
                ip_address,
                user_agent,
                details
            ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                payload.admin_username,
                payload.action,
                payload.target_type,
                payload.target_id,
                payload.ip_address,
                payload.user_agent,
                payload.details ? JSON.stringify(payload.details) : null
            ]
        );
    } catch (error) {
        console.warn("Unable to record admin audit log:", error.message);
    }
}

function getRequestBaseUrl(req) {
    if (isCanonicalBaseUrl(SITE_BASE_URL)) {
        return SITE_BASE_URL;
    }

    const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
    const forwardedHost = String(req.headers["x-forwarded-host"] || "").split(",")[0].trim();
    const host = forwardedHost || String(req.headers.host || "").split(",")[0].trim();

    if (host) {
        const protocol = forwardedProto || req.protocol || "https";
        return `${protocol}://${host}`.replace(/\/+$/, "");
    }

    return SITE_BASE_URL;
}

async function getPublishedProductsForSitemap() {
    const pool = await getAvailableDbPool();
    if (!pool) {
        return localStore.listProducts({ publishedOnly: true });
    }

    try {
        const [productRows] = await pool.execute(
            `SELECT id, name, slug, updated_at
             FROM products
             WHERE is_published = 1
             ORDER BY updated_at DESC`
        );

        return productRows;
    } catch (error) {
        console.error("Unable to build product sitemap entries:", error.message);
        return [];
    }
}

app.get(
    "/api/health",
    asyncHandler(async (req, res) => {
        const pool = await getAvailableDbPool();
        if (!pool) {
            res.json({
                ok: true,
                message: "Local catalog store is active. MySQL is not configured."
            });
            return;
        }

        await pool.query("SELECT 1");
        res.json({
            ok: true,
            message: "MySQL connection is healthy."
        });
    })
);

app.post(
    "/api/admin/login",
    asyncHandler(async (req, res) => {
        const adminConfig = getAdminConfig();
        if (!adminConfig) {
            throw new HttpError(503, "Admin login is not configured on the server.");
        }

        const payload = sanitizeAdminLoginPayload(req.body);
        if (
            !safeCompareStrings(payload.username, adminConfig.username)
            || !safeCompareStrings(payload.password, adminConfig.password)
        ) {
            throw new HttpError(401, "Incorrect admin username or password.");
        }

        const token = createAdminSessionToken(adminConfig);
        setAdminSessionCookie(res, req, token);
        await recordAdminAuditLog({
            req,
            adminUsername: adminConfig.username,
            action: "admin.login",
            targetType: "session",
            details: {
                success: true
            }
        });

        res.json({
            ok: true,
            admin: {
                username: adminConfig.username
            }
        });
    })
);

app.get(
    "/api/admin/logs",
    asyncHandler(async (req, res) => {
        requireAdmin(req);
        const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));
        const pool = await getAvailableDbPool();
        const items = pool
            ? await listAdminAuditLogsFromDb(pool, limit)
            : await localStore.listAdminAuditLogs({ limit });

        res.json({ items });
    })
);

app.get(
    "/api/admin/session",
    asyncHandler(async (req, res) => {
        const admin = getAuthenticatedAdmin(req);
        if (!admin) {
            throw new HttpError(401, "Admin sign-in required.");
        }

        res.json({
            ok: true,
            admin
        });
    })
);

app.post(
    "/api/admin/logout",
    asyncHandler(async (req, res) => {
        const admin = getAuthenticatedAdmin(req);
        if (admin) {
            await recordAdminAuditLog({
                req,
                adminUsername: admin.username,
                action: "admin.logout",
                targetType: "session"
            });
        }

        clearAdminSessionCookie(res, req);
        res.json({ ok: true });
    })
);

app.get(
    "/api/products",
    asyncHandler(async (req, res) => {
        const publishedOnly = req.query.published === "1" || req.query.published === "true";
        const search = String(req.query.q || "").trim();
        const admin = getAuthenticatedAdmin(req);

        if (!publishedOnly && !admin) {
            throw new HttpError(401, "Admin sign-in required.");
        }

        const pool = await getAvailableDbPool();
        if (!pool) {
            const rows = await localStore.listProducts({ publishedOnly, search });
            res.json({ items: rows.map(normalizeProduct) });
            return;
        }

        const where = [];
        const params = [];

        if (publishedOnly) {
            where.push("is_published = 1");
        }

        if (search) {
            where.push("(name LIKE ? OR category LIKE ? OR description LIKE ?)");
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        const sql = `
            SELECT
                id,
                name,
                slug,
                category,
                price,
                stock_quantity,
                rating,
                image_url,
                description,
                document_url,
                document_provider,
                is_published,
                created_at,
                updated_at
            FROM products
            ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
            ORDER BY updated_at DESC, id DESC
        `;

        const [rows] = await pool.execute(sql, params);
        res.json({ items: rows.map(normalizeProduct) });
    })
);

app.get(
    "/api/products/:id",
    asyncHandler(async (req, res) => {
        const productId = Number(req.params.id);
        const admin = getAuthenticatedAdmin(req);

        if (!Number.isFinite(productId)) {
            throw new HttpError(400, "Invalid product id.");
        }

        const pool = await getAvailableDbPool();
        if (!pool) {
            const item = await localStore.getProduct(productId);
            if (!item || (!admin && Number(item.is_published) !== 1)) {
                throw new HttpError(404, "Product not found.");
            }
            res.json({ item: normalizeProduct(item) });
            return;
        }

        const [rows] = await pool.execute(
            `SELECT
                id,
                name,
                slug,
                category,
                price,
                stock_quantity,
                rating,
                image_url,
                description,
                document_url,
                document_provider,
                is_published,
                created_at,
                updated_at
             FROM products
             WHERE id = ?
             ${admin ? "" : "AND is_published = 1"}
             LIMIT 1`,
            [productId]
        );

        if (!rows.length) {
            throw new HttpError(404, "Product not found.");
        }

        res.json({ item: normalizeProduct(rows[0]) });
    })
);

app.post(
    "/api/products",
    asyncHandler(async (req, res) => {
        const admin = requireAdmin(req);
        const payload = sanitizeProductPayload(req.body);
        const finalImageUrl = payload.imageDataUrl
            ? await saveImageDataUrl(payload.imageDataUrl, payload.imageFileName || payload.slug, "product")
            : payload.imageUrl || null;

        const pool = await getAvailableDbPool();
        if (!pool) {
            const item = await localStore.createProduct({
                name: payload.name,
                slug: payload.slug,
                category: payload.category,
                price: payload.price,
                stock_quantity: payload.stock,
                rating: payload.rating,
                image_url: finalImageUrl,
                description: payload.description,
                document_url: payload.documentUrl || null,
                document_provider: payload.documentProvider || null,
                is_published: payload.published
            });

            if (finalImageUrl) {
                await localStore.createMedia({
                    name: payload.name,
                    file_url: finalImageUrl,
                    mime_type: finalImageUrl.startsWith("/uploads/") ? "image/upload" : "image/url",
                    description: payload.description,
                    category: "product",
                    product_id: item.id,
                    post_id: null
                });
            }

            const normalizedItem = normalizeProduct(item);
            await recordAdminAuditLog({
                req,
                adminUsername: admin.username,
                action: "product.create",
                targetType: "product",
                targetId: normalizedItem.id,
                details: {
                    name: normalizedItem.name,
                    published: normalizedItem.published
                }
            });
            res.status(201).json({ item: normalizedItem });
            return;
        }

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            const [result] = await connection.execute(
                `INSERT INTO products (
                    name,
                    slug,
                    category,
                    price,
                    stock_quantity,
                    rating,
                    image_url,
                    description,
                    document_url,
                    document_provider,
                    is_published
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    payload.name,
                    payload.slug,
                    payload.category,
                    payload.price,
                    payload.stock,
                    payload.rating,
                    finalImageUrl,
                    payload.description,
                    payload.documentUrl || null,
                    payload.documentProvider || null,
                    payload.published
                ]
            );

            if (finalImageUrl) {
                await insertMediaAsset(connection, {
                    name: payload.name,
                    url: finalImageUrl,
                    type: finalImageUrl.startsWith("/uploads/") ? "image/upload" : "image/url",
                    description: payload.description,
                    category: "product",
                    productId: result.insertId
                });
            }

            await connection.commit();

            const [rows] = await connection.execute(
                `SELECT
                    id,
                    name,
                    slug,
                    category,
                    price,
                    stock_quantity,
                    rating,
                    image_url,
                    description,
                    document_url,
                    document_provider,
                    is_published,
                    created_at,
                    updated_at
                 FROM products
                 WHERE id = ?
                 LIMIT 1`,
                [result.insertId]
            );

            const normalizedItem = normalizeProduct(rows[0]);
            await recordAdminAuditLog({
                req,
                adminUsername: admin.username,
                action: "product.create",
                targetType: "product",
                targetId: normalizedItem.id,
                details: {
                    name: normalizedItem.name,
                    published: normalizedItem.published
                }
            });
            res.status(201).json({ item: normalizedItem });
        } finally {
            connection.release();
        }
    })
);

app.put(
    "/api/products/:id",
    asyncHandler(async (req, res) => {
        const admin = requireAdmin(req);
        const productId = Number(req.params.id);

        if (!Number.isFinite(productId)) {
            throw new HttpError(400, "Invalid product id.");
        }

        const payload = sanitizeProductPayload(req.body);
        const pool = await getAvailableDbPool();

        if (!pool) {
            const existing = await localStore.getProduct(productId);
            if (!existing) {
                throw new HttpError(404, "Product not found.");
            }

            const finalImageUrl = payload.imageDataUrl
                ? await saveImageDataUrl(payload.imageDataUrl, payload.imageFileName || payload.slug, "product")
                : payload.imageUrl || existing.image_url || null;

            const item = await localStore.updateProduct(productId, {
                name: payload.name,
                slug: payload.slug,
                category: payload.category,
                price: payload.price,
                stock_quantity: payload.stock,
                rating: payload.rating,
                image_url: finalImageUrl,
                description: payload.description,
                document_url: payload.documentUrl || null,
                document_provider: payload.documentProvider || null,
                is_published: payload.published
            });

            if (payload.imageDataUrl) {
                await localStore.createMedia({
                    name: payload.name,
                    file_url: finalImageUrl,
                    mime_type: "image/upload",
                    description: payload.description,
                    category: "product",
                    product_id: productId,
                    post_id: null
                });
            }

            const normalizedItem = normalizeProduct(item);
            await recordAdminAuditLog({
                req,
                adminUsername: admin.username,
                action: "product.update",
                targetType: "product",
                targetId: normalizedItem.id,
                details: {
                    name: normalizedItem.name,
                    published: normalizedItem.published
                }
            });
            res.json({ item: normalizedItem });
            return;
        }

        const connection = await pool.getConnection();

        try {
            const [existingRows] = await connection.execute(
                "SELECT image_url FROM products WHERE id = ? LIMIT 1",
                [productId]
            );

            if (!existingRows.length) {
                throw new HttpError(404, "Product not found.");
            }

            const existingImageUrl = existingRows[0].image_url || null;
            const finalImageUrl = payload.imageDataUrl
                ? await saveImageDataUrl(payload.imageDataUrl, payload.imageFileName || payload.slug, "product")
                : payload.imageUrl || existingImageUrl;

            await connection.beginTransaction();

            await connection.execute(
                `UPDATE products
                 SET
                    name = ?,
                    slug = ?,
                    category = ?,
                    price = ?,
                    stock_quantity = ?,
                    rating = ?,
                    image_url = ?,
                    description = ?,
                    document_url = ?,
                    document_provider = ?,
                    is_published = ?
                 WHERE id = ?`,
                [
                    payload.name,
                    payload.slug,
                    payload.category,
                    payload.price,
                    payload.stock,
                    payload.rating,
                    finalImageUrl,
                    payload.description,
                    payload.documentUrl || null,
                    payload.documentProvider || null,
                    payload.published,
                    productId
                ]
            );

            if (payload.imageDataUrl) {
                await insertMediaAsset(connection, {
                    name: payload.name,
                    url: finalImageUrl,
                    type: "image/upload",
                    description: payload.description,
                    category: "product",
                    productId
                });
            }

            await connection.commit();

            const [rows] = await connection.execute(
                `SELECT
                    id,
                    name,
                    slug,
                    category,
                    price,
                    stock_quantity,
                    rating,
                    image_url,
                    description,
                    document_url,
                    document_provider,
                    is_published,
                    created_at,
                    updated_at
                 FROM products
                 WHERE id = ?
                 LIMIT 1`,
                [productId]
            );

            const normalizedItem = normalizeProduct(rows[0]);
            await recordAdminAuditLog({
                req,
                adminUsername: admin.username,
                action: "product.update",
                targetType: "product",
                targetId: normalizedItem.id,
                details: {
                    name: normalizedItem.name,
                    published: normalizedItem.published
                }
            });
            res.json({ item: normalizedItem });
        } finally {
            connection.release();
        }
    })
);

app.delete(
    "/api/products/:id",
    asyncHandler(async (req, res) => {
        const admin = requireAdmin(req);
        const productId = Number(req.params.id);

        if (!Number.isFinite(productId)) {
            throw new HttpError(400, "Invalid product id.");
        }

        const pool = await getAvailableDbPool();
        if (!pool) {
            const deleted = await localStore.deleteProduct(productId);
            if (!deleted) {
                throw new HttpError(404, "Product not found.");
            }
            await recordAdminAuditLog({
                req,
                adminUsername: admin.username,
                action: "product.delete",
                targetType: "product",
                targetId: productId
            });
            res.json({ ok: true });
            return;
        }

        await pool.execute("DELETE FROM media_assets WHERE product_id = ?", [productId]);
        const [result] = await pool.execute("DELETE FROM products WHERE id = ?", [productId]);

        if (!result.affectedRows) {
            throw new HttpError(404, "Product not found.");
        }

        await recordAdminAuditLog({
            req,
            adminUsername: admin.username,
            action: "product.delete",
            targetType: "product",
            targetId: productId
        });
        res.json({ ok: true });
    })
);

app.get(
    "/api/posts",
    asyncHandler(async (req, res) => {
        const publishedOnly = req.query.published === "1" || req.query.published === "true";
        const admin = getAuthenticatedAdmin(req);

        if (!publishedOnly && !admin) {
            throw new HttpError(401, "Admin sign-in required.");
        }

        const pool = await getAvailableDbPool();

        if (!pool) {
            const rows = await localStore.listPosts({ publishedOnly });
            res.json({ items: rows.map(normalizePost) });
            return;
        }

        const where = publishedOnly ? "WHERE is_published = 1" : "";

        const [rows] = await pool.execute(
            `SELECT
                id,
                title,
                slug,
                excerpt,
                content,
                image_url,
                document_url,
                document_provider,
                is_published,
                created_at,
                updated_at
             FROM posts
             ${where}
             ORDER BY updated_at DESC, id DESC`
        );

        res.json({ items: rows.map(normalizePost) });
    })
);

app.post(
    "/api/posts",
    asyncHandler(async (req, res) => {
        const admin = requireAdmin(req);
        const payload = sanitizePostPayload(req.body);
        const finalImageUrl = payload.imageDataUrl
            ? await saveImageDataUrl(payload.imageDataUrl, payload.imageFileName || payload.slug, "post")
            : payload.imageUrl || null;

        const pool = await getAvailableDbPool();
        if (!pool) {
            const item = await localStore.createPost({
                title: payload.title,
                slug: payload.slug,
                excerpt: payload.excerpt,
                content: payload.content,
                image_url: finalImageUrl,
                document_url: payload.documentUrl || null,
                document_provider: payload.documentProvider || null,
                is_published: payload.published
            });

            if (finalImageUrl) {
                await localStore.createMedia({
                    name: payload.title,
                    file_url: finalImageUrl,
                    mime_type: finalImageUrl.startsWith("/uploads/") ? "image/upload" : "image/url",
                    description: payload.excerpt,
                    category: "post",
                    product_id: null,
                    post_id: item.id
                });
            }

            const normalizedItem = normalizePost(item);
            await recordAdminAuditLog({
                req,
                adminUsername: admin.username,
                action: "post.create",
                targetType: "post",
                targetId: normalizedItem.id,
                details: {
                    title: normalizedItem.title,
                    published: normalizedItem.published
                }
            });
            res.status(201).json({ item: normalizedItem });
            return;
        }

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            const [result] = await connection.execute(
                `INSERT INTO posts (
                    title,
                    slug,
                    excerpt,
                    content,
                    image_url,
                    document_url,
                    document_provider,
                    is_published
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    payload.title,
                    payload.slug,
                    payload.excerpt,
                    payload.content,
                    finalImageUrl,
                    payload.documentUrl || null,
                    payload.documentProvider || null,
                    payload.published
                ]
            );

            if (finalImageUrl) {
                await insertMediaAsset(connection, {
                    name: payload.title,
                    url: finalImageUrl,
                    type: finalImageUrl.startsWith("/uploads/") ? "image/upload" : "image/url",
                    description: payload.excerpt,
                    category: "post",
                    postId: result.insertId
                });
            }

            await connection.commit();

            const [rows] = await connection.execute(
                `SELECT
                    id,
                    title,
                    slug,
                    excerpt,
                    content,
                    image_url,
                    document_url,
                    document_provider,
                    is_published,
                    created_at,
                    updated_at
                 FROM posts
                 WHERE id = ?
                 LIMIT 1`,
                [result.insertId]
            );

            const normalizedItem = normalizePost(rows[0]);
            await recordAdminAuditLog({
                req,
                adminUsername: admin.username,
                action: "post.create",
                targetType: "post",
                targetId: normalizedItem.id,
                details: {
                    title: normalizedItem.title,
                    published: normalizedItem.published
                }
            });
            res.status(201).json({ item: normalizedItem });
        } finally {
            connection.release();
        }
    })
);

app.put(
    "/api/posts/:id",
    asyncHandler(async (req, res) => {
        const admin = requireAdmin(req);
        const postId = Number(req.params.id);

        if (!Number.isFinite(postId)) {
            throw new HttpError(400, "Invalid post id.");
        }

        const payload = sanitizePostPayload(req.body);
        const pool = await getAvailableDbPool();

        if (!pool) {
            const existing = await localStore.getPost(postId);
            if (!existing) {
                throw new HttpError(404, "Post not found.");
            }

            const finalImageUrl = payload.imageDataUrl
                ? await saveImageDataUrl(payload.imageDataUrl, payload.imageFileName || payload.slug, "post")
                : payload.imageUrl || existing.image_url || null;

            const item = await localStore.updatePost(postId, {
                title: payload.title,
                slug: payload.slug,
                excerpt: payload.excerpt,
                content: payload.content,
                image_url: finalImageUrl,
                document_url: payload.documentUrl || null,
                document_provider: payload.documentProvider || null,
                is_published: payload.published
            });

            if (payload.imageDataUrl) {
                await localStore.createMedia({
                    name: payload.title,
                    file_url: finalImageUrl,
                    mime_type: "image/upload",
                    description: payload.excerpt,
                    category: "post",
                    product_id: null,
                    post_id: postId
                });
            }

            const normalizedItem = normalizePost(item);
            await recordAdminAuditLog({
                req,
                adminUsername: admin.username,
                action: "post.update",
                targetType: "post",
                targetId: normalizedItem.id,
                details: {
                    title: normalizedItem.title,
                    published: normalizedItem.published
                }
            });
            res.json({ item: normalizedItem });
            return;
        }

        const connection = await pool.getConnection();

        try {
            const [existingRows] = await connection.execute(
                "SELECT image_url FROM posts WHERE id = ? LIMIT 1",
                [postId]
            );

            if (!existingRows.length) {
                throw new HttpError(404, "Post not found.");
            }

            const existingImageUrl = existingRows[0].image_url || null;
            const finalImageUrl = payload.imageDataUrl
                ? await saveImageDataUrl(payload.imageDataUrl, payload.imageFileName || payload.slug, "post")
                : payload.imageUrl || existingImageUrl;

            await connection.beginTransaction();

            await connection.execute(
                `UPDATE posts
                 SET
                    title = ?,
                    slug = ?,
                    excerpt = ?,
                    content = ?,
                    image_url = ?,
                    document_url = ?,
                    document_provider = ?,
                    is_published = ?
                 WHERE id = ?`,
                [
                    payload.title,
                    payload.slug,
                    payload.excerpt,
                    payload.content,
                    finalImageUrl,
                    payload.documentUrl || null,
                    payload.documentProvider || null,
                    payload.published,
                    postId
                ]
            );

            if (payload.imageDataUrl) {
                await insertMediaAsset(connection, {
                    name: payload.title,
                    url: finalImageUrl,
                    type: "image/upload",
                    description: payload.excerpt,
                    category: "post",
                    postId
                });
            }

            await connection.commit();

            const [rows] = await connection.execute(
                `SELECT
                    id,
                    title,
                    slug,
                    excerpt,
                    content,
                    image_url,
                    document_url,
                    document_provider,
                    is_published,
                    created_at,
                    updated_at
                 FROM posts
                 WHERE id = ?
                 LIMIT 1`,
                [postId]
            );

            const normalizedItem = normalizePost(rows[0]);
            await recordAdminAuditLog({
                req,
                adminUsername: admin.username,
                action: "post.update",
                targetType: "post",
                targetId: normalizedItem.id,
                details: {
                    title: normalizedItem.title,
                    published: normalizedItem.published
                }
            });
            res.json({ item: normalizedItem });
        } finally {
            connection.release();
        }
    })
);

app.delete(
    "/api/posts/:id",
    asyncHandler(async (req, res) => {
        const admin = requireAdmin(req);
        const postId = Number(req.params.id);

        if (!Number.isFinite(postId)) {
            throw new HttpError(400, "Invalid post id.");
        }

        const pool = await getAvailableDbPool();
        if (!pool) {
            const deleted = await localStore.deletePost(postId);
            if (!deleted) {
                throw new HttpError(404, "Post not found.");
            }
            await recordAdminAuditLog({
                req,
                adminUsername: admin.username,
                action: "post.delete",
                targetType: "post",
                targetId: postId
            });
            res.json({ ok: true });
            return;
        }

        await pool.execute("DELETE FROM media_assets WHERE post_id = ?", [postId]);
        const [result] = await pool.execute("DELETE FROM posts WHERE id = ?", [postId]);

        if (!result.affectedRows) {
            throw new HttpError(404, "Post not found.");
        }

        await recordAdminAuditLog({
            req,
            adminUsername: admin.username,
            action: "post.delete",
            targetType: "post",
            targetId: postId
        });
        res.json({ ok: true });
    })
);

app.get(
    "/api/media",
    asyncHandler(async (req, res) => {
        requireAdmin(req);
        const pool = await getAvailableDbPool();
        if (!pool) {
            const rows = await localStore.listMedia();
            res.json({ items: rows.map(normalizeMedia) });
            return;
        }

        const [rows] = await pool.execute(
            `SELECT
                id,
                name,
                file_url,
                mime_type,
                description,
                category,
                product_id,
                post_id,
                created_at,
                updated_at
             FROM media_assets
             ORDER BY updated_at DESC, id DESC`
        );

        res.json({ items: rows.map(normalizeMedia) });
    })
);

app.post(
    "/api/media",
    asyncHandler(async (req, res) => {
        const admin = requireAdmin(req);
        const payload = sanitizeMediaPayload(req.body);
        const finalUrl = payload.dataUrl
            ? await saveImageDataUrl(payload.dataUrl, payload.fileName || payload.name, "gallery")
            : payload.url;

        if (!finalUrl) {
            throw new HttpError(400, "Provide an image file or an image URL.");
        }

        const pool = await getAvailableDbPool();
        if (!pool) {
            const item = await localStore.createMedia({
                name: payload.name,
                file_url: finalUrl,
                mime_type: payload.dataUrl ? "image/upload" : "image/url",
                description: payload.description,
                category: payload.category,
                product_id: payload.productId,
                post_id: payload.postId
            });
            const normalizedItem = normalizeMedia(item);
            await recordAdminAuditLog({
                req,
                adminUsername: admin.username,
                action: "media.create",
                targetType: "media",
                targetId: normalizedItem.id,
                details: {
                    name: normalizedItem.name,
                    category: normalizedItem.category
                }
            });
            res.status(201).json({ item: normalizedItem });
            return;
        }

        const [result] = await pool.execute(
            `INSERT INTO media_assets (
                name,
                file_url,
                mime_type,
                description,
                category,
                product_id,
                post_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                payload.name,
                finalUrl,
                payload.dataUrl ? "image/upload" : "image/url",
                payload.description,
                payload.category,
                payload.productId,
                payload.postId
            ]
        );

        const [rows] = await pool.execute(
            `SELECT
                id,
                name,
                file_url,
                mime_type,
                description,
                category,
                product_id,
                post_id,
                created_at,
                updated_at
             FROM media_assets
             WHERE id = ?
             LIMIT 1`,
            [result.insertId]
        );

        const normalizedItem = normalizeMedia(rows[0]);
        await recordAdminAuditLog({
            req,
            adminUsername: admin.username,
            action: "media.create",
            targetType: "media",
            targetId: normalizedItem.id,
            details: {
                name: normalizedItem.name,
                category: normalizedItem.category
            }
        });
        res.status(201).json({ item: normalizedItem });
    })
);

app.put(
    "/api/media/:id",
    asyncHandler(async (req, res) => {
        const admin = requireAdmin(req);
        const mediaId = Number(req.params.id);

        if (!Number.isFinite(mediaId)) {
            throw new HttpError(400, "Invalid media id.");
        }

        const payload = sanitizeMediaPayload(req.body);
        const pool = await getAvailableDbPool();

        if (!pool) {
            const existing = await localStore.getMedia(mediaId);
            if (!existing) {
                throw new HttpError(404, "Image not found.");
            }

            const finalUrl = payload.dataUrl
                ? await saveImageDataUrl(payload.dataUrl, payload.fileName || payload.name, "gallery")
                : payload.url || existing.file_url || "";

            const item = await localStore.updateMedia(mediaId, {
                name: payload.name,
                file_url: finalUrl,
                mime_type: payload.dataUrl ? "image/upload" : "image/url",
                description: payload.description,
                category: payload.category,
                product_id: payload.productId,
                post_id: payload.postId
            });

            const normalizedItem = normalizeMedia(item);
            await recordAdminAuditLog({
                req,
                adminUsername: admin.username,
                action: "media.update",
                targetType: "media",
                targetId: normalizedItem.id,
                details: {
                    name: normalizedItem.name,
                    category: normalizedItem.category
                }
            });
            res.json({ item: normalizedItem });
            return;
        }

        const [existingRows] = await pool.execute(
            "SELECT file_url FROM media_assets WHERE id = ? LIMIT 1",
            [mediaId]
        );

        if (!existingRows.length) {
            throw new HttpError(404, "Image not found.");
        }

        const existingUrl = existingRows[0].file_url || "";
        const finalUrl = payload.dataUrl
            ? await saveImageDataUrl(payload.dataUrl, payload.fileName || payload.name, "gallery")
            : payload.url || existingUrl;

        await pool.execute(
            `UPDATE media_assets
             SET
                name = ?,
                file_url = ?,
                mime_type = ?,
                description = ?,
                category = ?,
                product_id = ?,
                post_id = ?
             WHERE id = ?`,
            [
                payload.name,
                finalUrl,
                payload.dataUrl ? "image/upload" : "image/url",
                payload.description,
                payload.category,
                payload.productId,
                payload.postId,
                mediaId
            ]
        );

        const [rows] = await pool.execute(
            `SELECT
                id,
                name,
                file_url,
                mime_type,
                description,
                category,
                product_id,
                post_id,
                created_at,
                updated_at
             FROM media_assets
             WHERE id = ?
             LIMIT 1`,
            [mediaId]
        );

        const normalizedItem = normalizeMedia(rows[0]);
        await recordAdminAuditLog({
            req,
            adminUsername: admin.username,
            action: "media.update",
            targetType: "media",
            targetId: normalizedItem.id,
            details: {
                name: normalizedItem.name,
                category: normalizedItem.category
            }
        });
        res.json({ item: normalizedItem });
    })
);

app.delete(
    "/api/media/:id",
    asyncHandler(async (req, res) => {
        const admin = requireAdmin(req);
        const mediaId = Number(req.params.id);

        if (!Number.isFinite(mediaId)) {
            throw new HttpError(400, "Invalid media id.");
        }

        const pool = await getAvailableDbPool();
        if (!pool) {
            const deleted = await localStore.deleteMedia(mediaId);
            if (!deleted) {
                throw new HttpError(404, "Image not found.");
            }
            await recordAdminAuditLog({
                req,
                adminUsername: admin.username,
                action: "media.delete",
                targetType: "media",
                targetId: mediaId
            });
            res.json({ ok: true });
            return;
        }

        const [result] = await pool.execute("DELETE FROM media_assets WHERE id = ?", [mediaId]);

        if (!result.affectedRows) {
            throw new HttpError(404, "Image not found.");
        }

        await recordAdminAuditLog({
            req,
            adminUsername: admin.username,
            action: "media.delete",
            targetType: "media",
            targetId: mediaId
        });
        res.json({ ok: true });
    })
);

app.post(
    "/api/auth/register",
    asyncHandler(async (req, res) => {
        const payload = sanitizeRegisterPayload(req.body);
        const passwordHash = hashPassword(payload.password);
        const pool = await getAvailableDbPool();

        if (!pool) {
            const existing = await localStore.findCustomerByEmail(payload.email);
            if (existing) {
                throw new HttpError(409, "An account with that email already exists.");
            }

            const customer = await localStore.createCustomer({
                name: payload.name,
                email: payload.email,
                phone: payload.phone,
                password_hash: passwordHash
            });

            if (!customer) {
                throw new HttpError(409, "An account with that email already exists.");
            }

            const session = await localStore.createCustomerSession(customer.id);
            res.status(201).json({
                ok: true,
                customer: sanitizeCustomer(session),
                token: session.session_token
            });
            return;
        }

        const [existingRows] = await pool.execute(
            "SELECT id FROM customers WHERE email = ? LIMIT 1",
            [payload.email]
        );

        if (existingRows.length) {
            throw new HttpError(409, "An account with that email already exists.");
        }

        const token = crypto.randomBytes(24).toString("hex");
        const [result] = await pool.execute(
            `INSERT INTO customers (
                name,
                email,
                phone,
                password_hash,
                session_token,
                last_login_at
            ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [payload.name, payload.email, payload.phone, passwordHash, token]
        );

        const [rows] = await pool.execute(
            `SELECT
                id,
                name,
                email,
                phone,
                created_at,
                updated_at,
                last_login_at
             FROM customers
             WHERE id = ?
             LIMIT 1`,
            [result.insertId]
        );

        res.status(201).json({
            ok: true,
            customer: sanitizeCustomer(rows[0]),
            token
        });
    })
);

app.post(
    "/api/auth/login",
    asyncHandler(async (req, res) => {
        const payload = sanitizeLoginPayload(req.body);
        const passwordHash = hashPassword(payload.password);
        const pool = await getAvailableDbPool();

        if (!pool) {
            const customer = await localStore.findCustomerByEmail(payload.email);
            if (!customer || customer.password_hash !== passwordHash) {
                throw new HttpError(401, "Incorrect email or password.");
            }

            const session = await localStore.createCustomerSession(customer.id);
            res.json({
                ok: true,
                customer: sanitizeCustomer(session),
                token: session.session_token
            });
            return;
        }

        const [rows] = await pool.execute(
            `SELECT
                id,
                name,
                email,
                phone,
                password_hash,
                created_at,
                updated_at,
                last_login_at
             FROM customers
             WHERE email = ?
             LIMIT 1`,
            [payload.email]
        );

        if (!rows[0] || rows[0].password_hash !== passwordHash) {
            throw new HttpError(401, "Incorrect email or password.");
        }

        const token = crypto.randomBytes(24).toString("hex");
        await pool.execute(
            "UPDATE customers SET session_token = ?, last_login_at = CURRENT_TIMESTAMP WHERE id = ?",
            [token, rows[0].id]
        );

        const [customerRows] = await pool.execute(
            `SELECT
                id,
                name,
                email,
                phone,
                created_at,
                updated_at,
                last_login_at
             FROM customers
             WHERE id = ?
             LIMIT 1`,
            [rows[0].id]
        );

        res.json({
            ok: true,
            customer: sanitizeCustomer(customerRows[0]),
            token
        });
    })
);

app.get(
    "/api/auth/me",
    asyncHandler(async (req, res) => {
        const pool = await getAvailableDbPool();
        const customer = await getAuthenticatedCustomer(req, pool);

        if (!customer) {
            throw new HttpError(401, "Please sign in to continue.");
        }

        res.json({
            ok: true,
            customer: sanitizeCustomer(customer)
        });
    })
);

app.post(
    "/api/auth/logout",
    asyncHandler(async (req, res) => {
        const token = readAuthToken(req);
        if (!token) {
            res.json({ ok: true });
            return;
        }

        const pool = await getAvailableDbPool();
        if (!pool) {
            await localStore.clearCustomerSession(token);
            res.json({ ok: true });
            return;
        }

        await pool.execute("UPDATE customers SET session_token = NULL WHERE session_token = ?", [token]);
        res.json({ ok: true });
    })
);

app.get(
    "/api/orders",
    asyncHandler(async (req, res) => {
        const pool = await getAvailableDbPool();
        const mineOnly = String(req.query.mine || "") === "1";
        const admin = getAuthenticatedAdmin(req);
        const customer = mineOnly ? await getAuthenticatedCustomer(req, pool) : null;

        if (mineOnly && !customer) {
            throw new HttpError(401, "Please sign in to view your requests.");
        }

        if (!mineOnly && !admin) {
            throw new HttpError(401, "Admin sign-in required.");
        }

        if (!pool) {
            const items = await localStore.listOrders();
            res.json({
                items: mineOnly
                    ? items.filter((order) => Number(order.customer_id) === Number(customer.id)).map(normalizeOrder)
                    : items.map(normalizeOrder)
            });
            return;
        }

        const items = await listOrdersFromDb(pool, mineOnly ? customer.id : null);
        res.json({ items });
    })
);

app.post(
    "/api/orders",
    asyncHandler(async (req, res) => {
        const pool = await getAvailableDbPool();
        const customer = await getAuthenticatedCustomer(req, pool);
        const guestCustomer = customer
            ? null
            : sanitizeGuestOrderContact(req.body.customer || req.body.guestCustomer || {});
        const orderCustomer = customer || guestCustomer;

        const items = sanitizeOrderItems(req.body.items);
        const note = String(req.body.note || "").trim().slice(0, 1000);
        const total = items.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.quantity || 0)), 0);
        const subject = sanitizeChatSubject(req.body.subject, "Spare Parts Order Request");

        if (!pool) {
            const order = await localStore.createOrder({
                customerId: customer ? customer.id : null,
                user: orderCustomer,
                items,
                total
            });

            let thread = null;
            if (customer) {
                thread = await localStore.createChatThread({
                    customer_id: customer.id,
                    order_id: order.id,
                    subject: `${subject} ORD-${order.id}`,
                    status: "Open",
                    sender_role: "customer",
                    sender_name: customer.name,
                    initial_message: buildOrderChatMessage(order.id, items, total, note)
                });
            }

            res.status(201).json({
                ok: true,
                orderId: order.id,
                threadId: thread ? thread.id : null
            });
            return;
        }

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            const [orderResult] = await connection.execute(
                `INSERT INTO orders (
                    customer_id,
                    customer_name,
                    customer_email,
                    customer_phone,
                    total_amount,
                    status
                ) VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    customer ? customer.id : null,
                    orderCustomer.name,
                    orderCustomer.email || "",
                    orderCustomer.phone || "",
                    total,
                    "Pending"
                ]
            );

            const orderId = Number(orderResult.insertId);

            if (items.length) {
                const itemValues = [];
                const itemPlaceholders = items.map(() => "(?, ?, ?, ?)").join(", ");
                items.forEach((item) => {
                    itemValues.push(orderId, item.name, item.quantity, item.price);
                });

                await connection.execute(
                    `INSERT INTO order_items (order_id, product_name, quantity, price) VALUES ${itemPlaceholders}`,
                    itemValues
                );
            }

            let threadId = null;
            if (customer) {
                const [threadResult] = await connection.execute(
                    `INSERT INTO chat_threads (
                        customer_id,
                        order_id,
                        subject,
                        status
                    ) VALUES (?, ?, ?, ?)`,
                    [customer.id, orderId, `${subject} ORD-${orderId}`, "Open"]
                );

                await connection.execute(
                    `INSERT INTO chat_messages (
                        thread_id,
                        sender_role,
                        sender_name,
                        message
                    ) VALUES (?, ?, ?, ?)`,
                    [
                        threadResult.insertId,
                        "customer",
                        customer.name,
                        buildOrderChatMessage(orderId, items, total, note)
                    ]
                );

                threadId = Number(threadResult.insertId);
            }

            await connection.commit();
            res.status(201).json({
                ok: true,
                orderId,
                threadId
            });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    })
);

app.put("/api/orders/:id/status", asyncHandler(async (req, res) => {
    const admin = requireAdmin(req);
    const status = String(req.body.status || "Pending").trim() || "Pending";
    const pool = await getAvailableDbPool();

    if (!pool) {
        const updated = await localStore.updateOrderStatus(req.params.id, status);
        if (!updated) {
            throw new HttpError(404, "Order not found.");
        }
        await recordAdminAuditLog({
            req,
            adminUsername: admin.username,
            action: "order.status.update",
            targetType: "order",
            targetId: req.params.id,
            details: { status }
        });
        res.json({ ok: true });
        return;
    }

    const [result] = await pool.execute("UPDATE orders SET status = ? WHERE id = ?", [status, req.params.id]);
    if (!result.affectedRows) {
        throw new HttpError(404, "Order not found.");
    }

    await recordAdminAuditLog({
        req,
        adminUsername: admin.username,
        action: "order.status.update",
        targetType: "order",
        targetId: req.params.id,
        details: { status }
    });
    res.json({ ok: true });
}));

app.get(
    "/api/chat/threads",
    asyncHandler(async (req, res) => {
        const pool = await getAvailableDbPool();
        const adminView = String(req.query.admin || "") === "1";
        const admin = adminView ? requireAdmin(req) : null;
        const customer = await getAuthenticatedCustomer(req, pool);

        if (!adminView && !customer) {
            throw new HttpError(401, "Please sign in to view your chat.");
        }

        if (!pool) {
            const items = await localStore.listChatThreads({
                customerId: admin ? null : customer.id
            });
            res.json({ items: items.map(normalizeChatThread) });
            return;
        }

        const items = await listChatThreadsFromDb(pool, admin ? null : customer.id);
        res.json({ items });
    })
);

app.post(
    "/api/chat/threads",
    asyncHandler(async (req, res) => {
        const pool = await getAvailableDbPool();
        const customer = await getAuthenticatedCustomer(req, pool);
        if (!customer) {
            throw new HttpError(401, "Please sign in before starting a chat.");
        }

        const subject = sanitizeChatSubject(req.body.subject, "Customer Request");
        const message = sanitizeChatMessage(req.body.message);

        if (!pool) {
            const thread = await localStore.createChatThread({
                customer_id: customer.id,
                order_id: req.body.orderId ? Number(req.body.orderId) : null,
                subject,
                status: "Open",
                sender_role: "customer",
                sender_name: customer.name,
                initial_message: message
            });

            res.status(201).json({ item: normalizeChatThread(thread) });
            return;
        }

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            const [threadResult] = await connection.execute(
                `INSERT INTO chat_threads (
                    customer_id,
                    order_id,
                    subject,
                    status
                ) VALUES (?, ?, ?, ?)`,
                [customer.id, req.body.orderId ? Number(req.body.orderId) : null, subject, "Open"]
            );

            await connection.execute(
                `INSERT INTO chat_messages (
                    thread_id,
                    sender_role,
                    sender_name,
                    message
                ) VALUES (?, ?, ?, ?)`,
                [threadResult.insertId, "customer", customer.name, message]
            );

            await connection.commit();

            const item = await getChatThreadFromDb(pool, threadResult.insertId);
            res.status(201).json({ item });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    })
);

app.get(
    "/api/chat/threads/:id/messages",
    asyncHandler(async (req, res) => {
        const threadId = Number(req.params.id);
        if (!Number.isFinite(threadId)) {
            throw new HttpError(400, "Invalid chat thread id.");
        }

        const pool = await getAvailableDbPool();
        const adminView = String(req.query.admin || "") === "1";
        const admin = adminView ? requireAdmin(req) : null;
        const customer = await getAuthenticatedCustomer(req, pool);

        if (!adminView && !customer) {
            throw new HttpError(401, "Please sign in to view your chat.");
        }

        if (!pool) {
            const thread = await localStore.getChatThread(threadId);
            if (!thread) {
                throw new HttpError(404, "Chat thread not found.");
            }
            if (!admin && Number(thread.customer_id) !== Number(customer.id)) {
                throw new HttpError(403, "You cannot view this chat thread.");
            }

            const items = await localStore.listChatMessages(threadId);
            res.json({
                thread: normalizeChatThread(thread),
                items: items.map(normalizeChatMessage)
            });
            return;
        }

        const thread = await getChatThreadFromDb(pool, threadId);
        if (!thread) {
            throw new HttpError(404, "Chat thread not found.");
        }
        if (!admin && Number(thread.customerId) !== Number(customer.id)) {
            throw new HttpError(403, "You cannot view this chat thread.");
        }

        const items = await listChatMessagesFromDb(pool, threadId);
        res.json({ thread, items });
    })
);

app.post(
    "/api/chat/threads/:id/messages",
    asyncHandler(async (req, res) => {
        const threadId = Number(req.params.id);
        if (!Number.isFinite(threadId)) {
            throw new HttpError(400, "Invalid chat thread id.");
        }

        const pool = await getAvailableDbPool();
        const adminView = String(req.query.admin || "") === "1";
        const admin = adminView ? requireAdmin(req) : null;
        const customer = await getAuthenticatedCustomer(req, pool);

        if (!adminView && !customer) {
            throw new HttpError(401, "Please sign in before sending a message.");
        }

        const message = sanitizeChatMessage(req.body.message);
        const senderRole = admin ? "admin" : "customer";
        const senderName = admin
            ? sanitizeChatSubject(req.body.senderName, "Calxin Auto Support")
            : customer.name;

        if (!pool) {
            const thread = await localStore.getChatThread(threadId);
            if (!thread) {
                throw new HttpError(404, "Chat thread not found.");
            }
            if (!admin && Number(thread.customer_id) !== Number(customer.id)) {
                throw new HttpError(403, "You cannot reply to this chat thread.");
            }

            const item = await localStore.addChatMessage(threadId, {
                sender_role: senderRole,
                sender_name: senderName,
                message
            });

            const normalizedItem = normalizeChatMessage(item);
            if (admin) {
                await recordAdminAuditLog({
                    req,
                    adminUsername: admin.username,
                    action: "chat.reply",
                    targetType: "chat_thread",
                    targetId: threadId,
                    details: {
                        senderName,
                        messagePreview: message.slice(0, 160)
                    }
                });
            }
            res.status(201).json({ item: normalizedItem });
            return;
        }

        const thread = await getChatThreadFromDb(pool, threadId);
        if (!thread) {
            throw new HttpError(404, "Chat thread not found.");
        }
        if (!admin && Number(thread.customerId) !== Number(customer.id)) {
            throw new HttpError(403, "You cannot reply to this chat thread.");
        }

        await pool.execute(
            `INSERT INTO chat_messages (
                thread_id,
                sender_role,
                sender_name,
                message
            ) VALUES (?, ?, ?, ?)`,
            [threadId, senderRole, senderName, message]
        );

        await pool.execute(
            "UPDATE chat_threads SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            [threadId]
        );

        const items = await listChatMessagesFromDb(pool, threadId);
        if (admin) {
            await recordAdminAuditLog({
                req,
                adminUsername: admin.username,
                action: "chat.reply",
                targetType: "chat_thread",
                targetId: threadId,
                details: {
                    senderName,
                    messagePreview: message.slice(0, 160)
                }
            });
        }
        res.status(201).json({ item: items[items.length - 1] });
    })
);

app.put(
    "/api/chat/threads/:id/status",
    asyncHandler(async (req, res) => {
        const admin = requireAdmin(req);
        const threadId = Number(req.params.id);
        if (!Number.isFinite(threadId)) {
            throw new HttpError(400, "Invalid chat thread id.");
        }

        const status = sanitizeChatStatus(req.body.status);
        const pool = await getAvailableDbPool();

        if (!pool) {
            const updated = await localStore.updateChatThreadStatus(threadId, status);
            if (!updated) {
                throw new HttpError(404, "Chat thread not found.");
            }
            await recordAdminAuditLog({
                req,
                adminUsername: admin.username,
                action: "chat.status.update",
                targetType: "chat_thread",
                targetId: threadId,
                details: { status }
            });
            res.json({ ok: true });
            return;
        }

        const [result] = await pool.execute(
            "UPDATE chat_threads SET status = ? WHERE id = ?",
            [status, threadId]
        );

        if (!result.affectedRows) {
            throw new HttpError(404, "Chat thread not found.");
        }

        await recordAdminAuditLog({
            req,
            adminUsername: admin.username,
            action: "chat.status.update",
            targetType: "chat_thread",
            targetId: threadId,
            details: { status }
        });
        res.json({ ok: true });
    })
);

app.get(
    "/sitemap.xml",
    asyncHandler(async (req, res) => {
        const manifest = await buildSitemapManifest({
            baseUrl: getRequestBaseUrl(req),
            rootDir: ROOT_DIR,
            products: await getPublishedProductsForSitemap()
        });

        res.setHeader("Cache-Control", "public, max-age=0, s-maxage=3600");
        res.type("application/xml").send(renderSitemapXml(manifest.entries));
    })
);

app.get(
    "/sitemap.json",
    asyncHandler(async (req, res) => {
        const manifest = await buildSitemapManifest({
            baseUrl: getRequestBaseUrl(req),
            rootDir: ROOT_DIR,
            products: await getPublishedProductsForSitemap()
        });

        res.setHeader("Cache-Control", "public, max-age=0, s-maxage=3600");
        res.setHeader("X-Robots-Tag", "noindex");
        res.json(manifest);
    })
);

app.get("/robots.txt", (req, res) => {
    const baseUrl = getRequestBaseUrl(req);
    const body = [
        "User-agent: *",
        "Allow: /",
        "Disallow: /admin.html",
        "Disallow: /admin-login.html",
        "Disallow: /cart.html",
        "Disallow: /chat.html",
        "Disallow: /wishlist.html",
        "Disallow: /login.html",
        `Sitemap: ${baseUrl}/sitemap.xml`
    ].join("\n");

    res.type("text/plain").send(body);
});

app.get("/admin-login.html", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (getAuthenticatedAdmin(req)) {
        return res.redirect(302, "/admin.html");
    }

    return res.sendFile(path.join(ROOT_DIR, "admin-login.html"));
});

app.get("/admin-login", (req, res) => {
    res.redirect(302, "/admin-login.html");
});

app.get("/admin-login.htm", (req, res) => {
    res.redirect(302, "/admin-login.html");
});

app.get("/admin.html", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!getAuthenticatedAdmin(req)) {
        return res.redirect(302, "/admin-login.html");
    }

    return res.sendFile(path.join(ROOT_DIR, "admin.html"));
});

app.get("/admin", (req, res) => {
    res.redirect(302, "/admin.html");
});

app.get("/admin.htm", (req, res) => {
    res.redirect(302, "/admin.html");
});

app.get("/wishlist.html", (req, res) => {
    res.redirect(302, "/");
});

app.get("/calxin-hub.html", (req, res) => {
    res.redirect(302, "/");
});

function resolvePublicFile(requestPath) {
    const decodedPath = decodeURIComponent(requestPath || "/");
    const aliasedRequest = PUBLIC_FILE_ALIASES.get(decodedPath) || decodedPath;
    const normalizedRequest = aliasedRequest === "/" ? "/index.html" : aliasedRequest;
    const relativePath = normalizedRequest.replace(/^\/+/, "");

    if (
        relativePath === "server.js"
        || relativePath.startsWith("db/")
        || relativePath.split("/").some((segment) => segment.startsWith("."))
    ) {
        return null;
    }

    const filePath = path.join(ROOT_DIR, relativePath);

    if (!filePath.startsWith(ROOT_DIR)) {
        return null;
    }

    const ext = path.extname(filePath).toLowerCase();
    if (!PUBLIC_EXTENSIONS.has(ext)) {
        return null;
    }

    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        return null;
    }

    return filePath;
}

app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/") || req.path.startsWith("/uploads/")) {
        return next();
    }

    const filePath = resolvePublicFile(req.path);
    if (filePath) {
        const isNoStoreAsset = [
            "service-worker.js",
            "catalog-api.js",
            "admin.js",
            "admin-login.js",
            "admin.html",
            "admin-login.html"
        ].some((fileName) => filePath.endsWith(fileName));

        if (isNoStoreAsset) {
            res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
        } else if (filePath.endsWith(".js") || filePath.endsWith(".html") || filePath.endsWith(".css")) {
            res.setHeader("Cache-Control", "no-cache");
        }
        return res.sendFile(filePath);
    }

    return res.status(404).send("Not found");
});

app.use((error, req, res, next) => {
    const status = error.status || 500;
    const message = error.message || "Unexpected server error.";

    if (status >= 500) {
        console.error(error);
    }

    res.status(status).json({
        ok: false,
        message
    });
});

// Vercel requires exporting the app
if (require.main === module) {
    app.listen(PORT, () => {
        ensureUploadsDirectories();
        console.log(`Calxin Auto server running on ${SITE_BASE_URL}`);
    });
}

module.exports = app;
