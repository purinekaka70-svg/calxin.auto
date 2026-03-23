(function initCalxinApi(global) {
    const SESSION_KEY = "calxinCustomerSession";
    const LOCAL_CATALOG_KEY = "calxinCatalogSnapshotV2";
    const LOCAL_ADMIN_SESSION_KEY = "calxinAdminLocalSession";
    const isLocalHost = global.location
        && ["localhost", "127.0.0.1"].includes(global.location.hostname);
    const apiOrigin = global.location && global.location.protocol === "file:"
        ? "http://localhost:3000"
        : isLocalHost && global.location.port && global.location.port !== "3000"
            ? `${global.location.protocol}//${global.location.hostname}:3000`
            : global.location.origin;
    const apiBaseUrl = `${apiOrigin.replace(/\/+$/, "")}/api`;
    const LEGACY_CATALOG_STORAGE_KEYS = [
        "products",
        "posts",
        "images",
        "uploadedImages",
        "adminProducts",
        "adminPosts",
        "adminImages",
        "calxinProducts",
        "calxinPosts",
        "calxinImages",
        "catalogProducts",
        "catalogPosts",
        "catalogImages",
        "siteProducts",
        "sitePosts",
        "siteImages"
    ];

    function clearLegacyCatalogStorage() {
        if (!global.localStorage) return;

        LEGACY_CATALOG_STORAGE_KEYS.forEach((key) => {
            try {
                global.localStorage.removeItem(key);
            } catch (error) {
                // Ignore storage cleanup errors and continue loading the live API.
            }
        });
    }

    function cleanupLegacyOfflineCache() {
        if (global.navigator && "serviceWorker" in global.navigator) {
            global.navigator.serviceWorker.getRegistrations()
                .then((registrations) => Promise.all(
                    registrations.map((registration) => registration.unregister())
                ))
                .catch(() => null);
        }

        if ("caches" in global) {
            global.caches.keys()
                .then((keys) => Promise.all(
                    keys
                        .filter((key) => key.indexOf("calxin-auto") === 0)
                        .map((key) => global.caches.delete(key))
                ))
                .catch(() => null);
        }
    }

    function cloneValue(value) {
        return value === null || value === undefined
            ? value
            : JSON.parse(JSON.stringify(value));
    }

    function currentTimestamp() {
        return new Date().toISOString();
    }

    function safeParseJson(value, fallback) {
        if (!value) {
            return cloneValue(fallback);
        }

        try {
            return JSON.parse(value);
        } catch (error) {
            return cloneValue(fallback);
        }
    }

    function safeGetLocalStorageItem(key) {
        if (!global.localStorage) return null;

        try {
            return global.localStorage.getItem(key);
        } catch (error) {
            return null;
        }
    }

    function safeSetLocalStorageItem(key, value) {
        if (!global.localStorage) return;

        try {
            global.localStorage.setItem(key, value);
        } catch (error) {
            // Ignore quota and browser privacy storage failures.
        }
    }

    function safeRemoveLocalStorageItem(key) {
        if (!global.localStorage) return;

        try {
            global.localStorage.removeItem(key);
        } catch (error) {
            // Ignore removal failures.
        }
    }

    function createEmptyLocalCatalog() {
        return {
            version: 2,
            updatedAt: currentTimestamp(),
            counters: {
                products: 0,
                posts: 0,
                media: 0
            },
            products: [],
            posts: [],
            media: []
        };
    }

    function normalizeLocalCatalog(value) {
        const fallback = createEmptyLocalCatalog();
        const candidate = value && typeof value === "object" ? value : {};

        return {
            ...fallback,
            ...candidate,
            counters: {
                ...fallback.counters,
                ...(candidate.counters || {})
            },
            products: Array.isArray(candidate.products) ? candidate.products : [],
            posts: Array.isArray(candidate.posts) ? candidate.posts : [],
            media: Array.isArray(candidate.media) ? candidate.media : []
        };
    }

    function readLocalCatalog() {
        const parsed = safeParseJson(safeGetLocalStorageItem(LOCAL_CATALOG_KEY), createEmptyLocalCatalog());
        return normalizeLocalCatalog(parsed);
    }

    function writeLocalCatalog(catalog) {
        const nextCatalog = normalizeLocalCatalog(catalog);
        nextCatalog.updatedAt = currentTimestamp();
        safeSetLocalStorageItem(LOCAL_CATALOG_KEY, JSON.stringify(nextCatalog));
        return nextCatalog;
    }

    function mutateLocalCatalog(mutator) {
        const catalog = readLocalCatalog();
        const result = mutator(catalog);
        writeLocalCatalog(catalog);
        return result;
    }

    function readLocalAdminSession() {
        const parsed = safeParseJson(safeGetLocalStorageItem(LOCAL_ADMIN_SESSION_KEY), null);
        return parsed && typeof parsed === "object" ? parsed : null;
    }

    function writeLocalAdminSession(session) {
        if (!session) {
            safeRemoveLocalStorageItem(LOCAL_ADMIN_SESSION_KEY);
            return null;
        }

        const nextSession = {
            ...session,
            mode: "browser-local",
            createdAt: session.createdAt || currentTimestamp()
        };

        safeSetLocalStorageItem(LOCAL_ADMIN_SESSION_KEY, JSON.stringify(nextSession));
        return nextSession;
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

    function ensureUniqueSlug(items, desiredSlug, currentId) {
        const base = slugify(desiredSlug) || "item";
        const taken = new Set(
            items
                .filter((item) => Number(item.id) !== Number(currentId))
                .map((item) => String(item.slug || "").trim())
                .filter(Boolean)
        );

        if (!taken.has(base)) {
            return base;
        }

        let attempt = 2;
        while (taken.has(`${base}-${attempt}`)) {
            attempt += 1;
        }

        return `${base}-${attempt}`;
    }

    function getNextLocalId(catalog, collectionName) {
        catalog.counters[collectionName] = Number(catalog.counters[collectionName] || 0) + 1;
        return Number(catalog.counters[collectionName]);
    }

    function sortByUpdatedDesc(items) {
        return items
            .slice()
            .sort((left, right) => {
                const leftTime = new Date(left.updatedAt || left.createdAt || 0).getTime();
                const rightTime = new Date(right.updatedAt || right.createdAt || 0).getTime();

                if (rightTime !== leftTime) {
                    return rightTime - leftTime;
                }

                return Number(right.id || 0) - Number(left.id || 0);
            });
    }

    function coercePublished(value, fallback = true) {
        if (value === undefined || value === null || value === "") {
            return Boolean(fallback);
        }

        if (value === false || value === 0 || value === "0" || value === "false") {
            return false;
        }

        return true;
    }

    function shouldUseLocalFallback(error) {
        return Boolean(error && error.isNetworkError);
    }

    function normalizeProduct(item) {
        return {
            ...item,
            id: Number(item.id),
            price: Number(item.price || 0),
            stock: Number(item.stock || 0),
            rating: Number(item.rating || 0),
            image: toAbsoluteUrl(item.image)
        };
    }

    function normalizePost(item) {
        return {
            ...item,
            id: Number(item.id),
            image: toAbsoluteUrl(item.image)
        };
    }

    function normalizeMedia(item) {
        return {
            ...item,
            id: Number(item.id),
            url: toAbsoluteUrl(item.url)
        };
    }

    function upsertProductMediaRecord(catalog, productRecord) {
        if (!productRecord || !String(productRecord.image || "").trim()) {
            return;
        }

        const existingIndex = catalog.media.findIndex((item) =>
            item.category === "product" && Number(item.productId || 0) === Number(productRecord.id)
        );
        const timestamp = currentTimestamp();
        const mediaRecord = {
            id: existingIndex >= 0 ? Number(catalog.media[existingIndex].id) : getNextLocalId(catalog, "media"),
            name: productRecord.name,
            url: productRecord.image,
            description: productRecord.description || "",
            category: "product",
            productId: Number(productRecord.id),
            createdAt: existingIndex >= 0 ? (catalog.media[existingIndex].createdAt || timestamp) : timestamp,
            updatedAt: timestamp
        };

        if (existingIndex >= 0) {
            catalog.media.splice(existingIndex, 1, mediaRecord);
            return;
        }

        catalog.media.push(mediaRecord);
    }

    function listLocalProducts(params) {
        const query = String((params && params.q) || "").trim().toLowerCase();
        let items = sortByUpdatedDesc(readLocalCatalog().products);

        if (params && params.published !== undefined) {
            items = items.filter((item) => Boolean(item.published) === Boolean(params.published));
        }

        if (query) {
            items = items.filter((item) =>
                [
                    item.name,
                    item.category,
                    item.description,
                    String(item.price || "")
                ]
                    .join(" ")
                    .toLowerCase()
                    .includes(query)
            );
        }

        return items.map(normalizeProduct);
    }

    function getLocalProduct(id) {
        const item = readLocalCatalog().products.find((product) => Number(product.id) === Number(id));

        if (!item) {
            const error = new Error("Product not found.");
            error.status = 404;
            throw error;
        }

        return normalizeProduct(item);
    }

    function saveLocalProduct(product) {
        let savedProduct = null;

        mutateLocalCatalog((catalog) => {
            const items = catalog.products;
            const existingIndex = items.findIndex((item) => Number(item.id) === Number(product && product.id));
            const existing = existingIndex >= 0 ? items[existingIndex] : null;
            const timestamp = currentTimestamp();
            const image = String(
                (product && (product.imageDataUrl || product.imageUrl)) || (existing && existing.image) || ""
            ).trim();

            const nextProduct = {
                id: existing ? Number(existing.id) : getNextLocalId(catalog, "products"),
                name: String((product && product.name) || (existing && existing.name) || "").trim(),
                slug: ensureUniqueSlug(
                    items,
                    (product && (product.slug || product.name)) || (existing && existing.slug) || "product",
                    existing ? existing.id : null
                ),
                category: String((product && product.category) || (existing && existing.category) || "").trim(),
                price: Number((product && product.price) !== undefined ? product.price : (existing && existing.price) || 0),
                stock: Number((product && product.stock) !== undefined ? product.stock : (existing && existing.stock) || 0),
                rating: Number((product && product.rating) !== undefined ? product.rating : (existing && existing.rating) || 0),
                image,
                description: String(
                    (product && product.description) !== undefined ? product.description : (existing && existing.description) || ""
                ),
                documentUrl: String(
                    (product && product.documentUrl) !== undefined ? product.documentUrl : (existing && existing.documentUrl) || ""
                ),
                documentProvider: String(
                    (product && product.documentProvider) !== undefined
                        ? product.documentProvider
                        : (existing && existing.documentProvider) || ""
                ),
                published: coercePublished(
                    product && Object.prototype.hasOwnProperty.call(product, "published") ? product.published : undefined,
                    existing ? existing.published : true
                ),
                createdAt: existing ? (existing.createdAt || timestamp) : timestamp,
                updatedAt: timestamp
            };

            if (!nextProduct.name) {
                throw new Error("Product name is required.");
            }

            if (!nextProduct.category) {
                throw new Error("Product category is required.");
            }

            if (existingIndex >= 0) {
                items.splice(existingIndex, 1, nextProduct);
            } else {
                items.push(nextProduct);
            }

            upsertProductMediaRecord(catalog, nextProduct);
            savedProduct = nextProduct;
        });

        return normalizeProduct(savedProduct);
    }

    function deleteLocalProduct(id) {
        return mutateLocalCatalog((catalog) => {
            const index = catalog.products.findIndex((item) => Number(item.id) === Number(id));

            if (index < 0) {
                return { deleted: false };
            }

            catalog.products.splice(index, 1);
            catalog.media = catalog.media.filter((item) => Number(item.productId || 0) !== Number(id));
            return { deleted: true };
        });
    }

    function listLocalPosts(params) {
        let items = sortByUpdatedDesc(readLocalCatalog().posts);

        if (params && params.published !== undefined) {
            items = items.filter((item) => Boolean(item.published) === Boolean(params.published));
        }

        return items.map(normalizePost);
    }

    function saveLocalPost(post) {
        let savedPost = null;

        mutateLocalCatalog((catalog) => {
            const items = catalog.posts;
            const existingIndex = items.findIndex((item) => Number(item.id) === Number(post && post.id));
            const existing = existingIndex >= 0 ? items[existingIndex] : null;
            const timestamp = currentTimestamp();
            const image = String(
                (post && (post.imageDataUrl || post.imageUrl)) || (existing && existing.image) || ""
            ).trim();

            const nextPost = {
                id: existing ? Number(existing.id) : getNextLocalId(catalog, "posts"),
                title: String((post && post.title) || (existing && existing.title) || "").trim(),
                slug: ensureUniqueSlug(
                    items,
                    (post && (post.slug || post.title)) || (existing && existing.slug) || "post",
                    existing ? existing.id : null
                ),
                excerpt: String(
                    (post && post.excerpt) !== undefined ? post.excerpt : (existing && existing.excerpt) || ""
                ),
                content: String(
                    (post && post.content) !== undefined ? post.content : (existing && existing.content) || ""
                ),
                image,
                documentUrl: String(
                    (post && post.documentUrl) !== undefined ? post.documentUrl : (existing && existing.documentUrl) || ""
                ),
                documentProvider: String(
                    (post && post.documentProvider) !== undefined
                        ? post.documentProvider
                        : (existing && existing.documentProvider) || ""
                ),
                published: coercePublished(
                    post && Object.prototype.hasOwnProperty.call(post, "published") ? post.published : undefined,
                    existing ? existing.published : true
                ),
                createdAt: existing ? (existing.createdAt || timestamp) : timestamp,
                updatedAt: timestamp
            };

            if (!nextPost.title) {
                throw new Error("Post title is required.");
            }

            if (!nextPost.content) {
                throw new Error("Post content is required.");
            }

            if (existingIndex >= 0) {
                items.splice(existingIndex, 1, nextPost);
            } else {
                items.push(nextPost);
            }

            savedPost = nextPost;
        });

        return normalizePost(savedPost);
    }

    function deleteLocalPost(id) {
        return mutateLocalCatalog((catalog) => {
            const index = catalog.posts.findIndex((item) => Number(item.id) === Number(id));

            if (index < 0) {
                return { deleted: false };
            }

            catalog.posts.splice(index, 1);
            return { deleted: true };
        });
    }

    function listLocalMedia() {
        return sortByUpdatedDesc(readLocalCatalog().media).map(normalizeMedia);
    }

    function saveLocalMedia(media) {
        let savedMedia = null;

        mutateLocalCatalog((catalog) => {
            const items = catalog.media;
            const existingIndex = items.findIndex((item) => Number(item.id) === Number(media && media.id));
            const existing = existingIndex >= 0 ? items[existingIndex] : null;
            const timestamp = currentTimestamp();
            const url = String((media && (media.dataUrl || media.url)) || (existing && existing.url) || "").trim();

            const nextMedia = {
                id: existing ? Number(existing.id) : getNextLocalId(catalog, "media"),
                name: String((media && media.name) || (existing && existing.name) || "").trim(),
                url,
                description: String(
                    (media && media.description) !== undefined ? media.description : (existing && existing.description) || ""
                ),
                category: String((media && media.category) || (existing && existing.category) || "other").trim(),
                productId: Number(
                    (media && media.productId) !== undefined ? media.productId : (existing && existing.productId) || 0
                ) || null,
                createdAt: existing ? (existing.createdAt || timestamp) : timestamp,
                updatedAt: timestamp
            };

            if (!nextMedia.name) {
                throw new Error("Image name is required.");
            }

            if (!nextMedia.url) {
                throw new Error("Select an image file or provide an image URL.");
            }

            if (existingIndex >= 0) {
                items.splice(existingIndex, 1, nextMedia);
            } else {
                items.push(nextMedia);
            }

            savedMedia = nextMedia;
        });

        return normalizeMedia(savedMedia);
    }

    function deleteLocalMedia(id) {
        return mutateLocalCatalog((catalog) => {
            const index = catalog.media.findIndex((item) => Number(item.id) === Number(id));

            if (index < 0) {
                return { deleted: false };
            }

            catalog.media.splice(index, 1);
            return { deleted: true };
        });
    }

    cleanupLegacyOfflineCache();

    function getStoredSession() {
        try {
            return JSON.parse(global.localStorage.getItem(SESSION_KEY) || "null");
        } catch (error) {
            return null;
        }
    }

    function getAuthToken() {
        const session = getStoredSession();
        return session && session.token ? String(session.token) : "";
    }

    function toAbsoluteUrl(value) {
        const raw = String(value || "").trim();
        if (!raw) return "";
        if (/^(https?:|data:)/i.test(raw)) return raw;
        if (raw.startsWith("//")) return `${global.location.protocol}${raw}`;
        if (raw.startsWith("/")) return `${apiOrigin}${raw}`;
        return raw;
    }

    async function request(path, options) {
        const token = getAuthToken();
        const headers = {
            ...(options && options.headers ? options.headers : {})
        };

        if (!(options && options.skipJsonHeader)) {
            headers["Content-Type"] = "application/json";
        }

        if (token && !headers.Authorization) {
            headers.Authorization = `Bearer ${token}`;
        }

        let response = null;

        try {
            response = await fetch(`${apiBaseUrl}${path}`, {
                ...options,
                cache: "no-store",
                credentials: "same-origin",
                headers
            });
        } catch (error) {
            const networkError = new Error(error && error.message ? error.message : "Unable to reach the server.");
            networkError.isNetworkError = true;
            networkError.cause = error;
            throw networkError;
        }

        let payload = null;
        try {
            payload = await response.json();
        } catch (error) {
            payload = null;
        }

        if (!response.ok) {
            const message = payload && payload.message ? payload.message : `Request failed with status ${response.status}`;
            const requestError = new Error(message);
            requestError.status = response.status;
            throw requestError;
        }

        return payload;
    }

    function buildEventsUrl(params) {
        const query = new URLSearchParams();

        if (params && Array.isArray(params.topics) && params.topics.length) {
            query.set("topics", params.topics.join(","));
        }

        if (params && params.admin) {
            query.set("admin", "1");
        }

        const token = params && params.token ? String(params.token).trim() : getAuthToken();
        if (token && params && params.includeToken !== false) {
            query.set("token", token);
        }

        const suffix = query.toString() ? `?${query.toString()}` : "";
        return `${apiBaseUrl}/events${suffix}`;
    }

    function subscribeToEvents(params, handlers = {}) {
        if (typeof global.EventSource !== "function") {
            return null;
        }

        const source = new global.EventSource(buildEventsUrl(params), { withCredentials: true });

        source.onmessage = (event) => {
            if (!event || !event.data) {
                return;
            }

            try {
                const payload = JSON.parse(event.data);
                if (typeof handlers.onMessage === "function") {
                    handlers.onMessage(payload);
                }
            } catch (error) {
                if (typeof handlers.onError === "function") {
                    handlers.onError(error);
                }
            }
        };

        source.onopen = () => {
            if (typeof handlers.onOpen === "function") {
                handlers.onOpen();
            }
        };

        source.onerror = (error) => {
            if (typeof handlers.onError === "function") {
                handlers.onError(error);
            }
        };

        return source;
    }

    function readLegacyAdminCredentials() {
        if (!global.document) return null;

        const usernameInput = global.document.getElementById("adminUsername");
        const passwordInput = global.document.getElementById("adminPassword");

        if (!usernameInput && !passwordInput) {
            return null;
        }

        return {
            username: usernameInput ? String(usernameInput.value || "").trim() : "",
            password: passwordInput ? String(passwordInput.value || "") : ""
        };
    }

    function buildPublicApi(target) {
        const publicApi = { ...target };

        Object.keys(target).forEach((key) => {
            if (typeof target[key] !== "function") {
                return;
            }

            const legacyKey = key.toLowerCase();
            if (legacyKey === key || Object.prototype.hasOwnProperty.call(publicApi, legacyKey)) {
                return;
            }

            publicApi[legacyKey] = (...args) => target[key](...args);
        });

        publicApi.adminlogin = (credentials) => target.adminLogin(credentials || readLegacyAdminCredentials() || {});

        return publicApi;
    }

    const api = {
        apiOrigin,
        apiBaseUrl,
        sessionKey: SESSION_KEY,
        toAbsoluteUrl,
        async getHealth() {
            try {
                return await request("/health");
            } catch (error) {
                if (shouldUseLocalFallback(error)) {
                    return {
                        ok: true,
                        storage: "browser-local",
                        message: "Browser local catalog storage is active."
                    };
                }

                throw error;
            }
        },
        async register(customer) {
            return request("/auth/register", {
                method: "POST",
                body: JSON.stringify(customer || {})
            });
        },
        async adminLogin(credentials) {
            try {
                return await request("/admin/login", {
                    method: "POST",
                    body: JSON.stringify(credentials || {})
                });
            } catch (error) {
                if (!shouldUseLocalFallback(error)) {
                    throw error;
                }

                const username = String((credentials && credentials.username) || "").trim();
                const password = String((credentials && credentials.password) || "");

                if (!username || !password) {
                    throw new Error("Enter admin username and password.");
                }

                const session = writeLocalAdminSession({
                    username,
                    ok: true
                });

                return { ok: true, session };
            }
        },
        async getAdminSession() {
            try {
                return await request("/admin/session");
            } catch (error) {
                if (!shouldUseLocalFallback(error)) {
                    throw error;
                }

                const session = readLocalAdminSession();
                if (session) {
                    return session;
                }

                const authError = new Error("Admin sign-in required.");
                authError.status = 401;
                throw authError;
            }
        },
        async adminLogout() {
            try {
                return await request("/admin/logout", {
                    method: "POST",
                    body: JSON.stringify({})
                });
            } catch (error) {
                if (!shouldUseLocalFallback(error)) {
                    throw error;
                }

                writeLocalAdminSession(null);
                return { ok: true };
            }
        },
        async login(credentials) {
            return request("/auth/login", {
                method: "POST",
                body: JSON.stringify(credentials || {})
            });
        },
        async getCurrentCustomer() {
            return request("/auth/me");
        },
        async logout() {
            return request("/auth/logout", {
                method: "POST",
                body: JSON.stringify({})
            });
        },
        async getProducts(params) {
            try {
                const query = new URLSearchParams();
                if (params && params.published !== undefined) {
                    query.set("published", params.published ? "1" : "0");
                }
                if (params && params.q) {
                    query.set("q", params.q);
                }
                const suffix = query.toString() ? `?${query.toString()}` : "";
                const payload = await request(`/products${suffix}`);
                return (payload.items || []).map(normalizeProduct);
            } catch (error) {
                if (shouldUseLocalFallback(error)) {
                    return listLocalProducts(params);
                }

                throw error;
            }
        },
        async getProduct(id) {
            try {
                const payload = await request(`/products/${id}`);
                return normalizeProduct(payload.item);
            } catch (error) {
                if (shouldUseLocalFallback(error)) {
                    return getLocalProduct(id);
                }

                throw error;
            }
        },
        async saveProduct(product) {
            try {
                const method = product && product.id ? "PUT" : "POST";
                const path = product && product.id ? `/products/${product.id}` : "/products";
                const payload = await request(path, {
                    method,
                    body: JSON.stringify(product || {})
                });
                return normalizeProduct(payload.item);
            } catch (error) {
                if (shouldUseLocalFallback(error)) {
                    return saveLocalProduct(product || {});
                }

                throw error;
            }
        },
        async deleteProduct(id) {
            try {
                return await request(`/products/${id}`, { method: "DELETE" });
            } catch (error) {
                if (shouldUseLocalFallback(error)) {
                    return deleteLocalProduct(id);
                }

                throw error;
            }
        },
        async getPosts(params) {
            try {
                const query = new URLSearchParams();
                if (params && params.published !== undefined) {
                    query.set("published", params.published ? "1" : "0");
                }
                const suffix = query.toString() ? `?${query.toString()}` : "";
                const payload = await request(`/posts${suffix}`);
                return (payload.items || []).map(normalizePost);
            } catch (error) {
                if (shouldUseLocalFallback(error)) {
                    return listLocalPosts(params);
                }

                throw error;
            }
        },
        async savePost(post) {
            try {
                const method = post && post.id ? "PUT" : "POST";
                const path = post && post.id ? `/posts/${post.id}` : "/posts";
                const payload = await request(path, {
                    method,
                    body: JSON.stringify(post || {})
                });
                return normalizePost(payload.item);
            } catch (error) {
                if (shouldUseLocalFallback(error)) {
                    return saveLocalPost(post || {});
                }

                throw error;
            }
        },
        async deletePost(id) {
            try {
                return await request(`/posts/${id}`, { method: "DELETE" });
            } catch (error) {
                if (shouldUseLocalFallback(error)) {
                    return deleteLocalPost(id);
                }

                throw error;
            }
        },
        async getMedia() {
            try {
                const payload = await request("/media");
                return (payload.items || []).map(normalizeMedia);
            } catch (error) {
                if (shouldUseLocalFallback(error)) {
                    return listLocalMedia();
                }

                throw error;
            }
        },
        async saveMedia(media) {
            try {
                const method = media && media.id ? "PUT" : "POST";
                const path = media && media.id ? `/media/${media.id}` : "/media";
                const payload = await request(path, {
                    method,
                    body: JSON.stringify(media || {})
                });
                return normalizeMedia(payload.item);
            } catch (error) {
                if (shouldUseLocalFallback(error)) {
                    return saveLocalMedia(media || {});
                }

                throw error;
            }
        },
        async deleteMedia(id) {
            try {
                return await request(`/media/${id}`, { method: "DELETE" });
            } catch (error) {
                if (shouldUseLocalFallback(error)) {
                    return deleteLocalMedia(id);
                }

                throw error;
            }
        },
        async getOrders(params) {
            try {
                const query = new URLSearchParams();
                if (params && params.mine) {
                    query.set("mine", "1");
                }
                const suffix = query.toString() ? `?${query.toString()}` : "";
                const payload = await request(`/orders${suffix}`);
                return payload.items || [];
            } catch (error) {
                if (shouldUseLocalFallback(error)) {
                    return [];
                }

                throw error;
            }
        },
        async createOrder(order) {
            return request("/orders", {
                method: "POST",
                body: JSON.stringify(order || {})
            });
        },
        async updateOrderStatus(id, status) {
            return request(`/orders/${id}/status`, {
                method: "PUT",
                body: JSON.stringify({ status })
            });
        },
        async getChatThreads(params) {
            try {
                const query = new URLSearchParams();
                if (params && params.admin) {
                    query.set("admin", "1");
                }
                const suffix = query.toString() ? `?${query.toString()}` : "";
                const payload = await request(`/chat/threads${suffix}`);
                return payload.items || [];
            } catch (error) {
                if (shouldUseLocalFallback(error)) {
                    return [];
                }

                throw error;
            }
        },
        async createChatThread(thread) {
            const payload = await request("/chat/threads", {
                method: "POST",
                body: JSON.stringify(thread || {})
            });
            return payload.item;
        },
        async getChatMessages(id, params) {
            try {
                const query = new URLSearchParams();
                if (params && params.admin) {
                    query.set("admin", "1");
                }
                const suffix = query.toString() ? `?${query.toString()}` : "";
                const payload = await request(`/chat/threads/${id}/messages${suffix}`);
                return payload;
            } catch (error) {
                if (shouldUseLocalFallback(error)) {
                    return {
                        thread: null,
                        items: []
                    };
                }

                throw error;
            }
        },
        async sendChatMessage(id, message, params) {
            const query = new URLSearchParams();
            if (params && params.admin) {
                query.set("admin", "1");
            }
            const suffix = query.toString() ? `?${query.toString()}` : "";
            const payload = await request(`/chat/threads/${id}/messages${suffix}`, {
                method: "POST",
                body: JSON.stringify(message || {})
            });
            return payload.item;
        },
        async updateChatStatus(id, status) {
            return request(`/chat/threads/${id}/status`, {
                method: "PUT",
                body: JSON.stringify({ status })
            });
        },
        subscribeToEvents
    };

    const publicApi = buildPublicApi(api);
    publicApi.subscribetoevents = (...args) => subscribeToEvents(...args);
    global.CalxinApi = publicApi;
    global.calxinapi = publicApi;
})(window);
