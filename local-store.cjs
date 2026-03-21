const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function sortByUpdatedThenId(items) {
    return items
        .slice()
        .sort((left, right) => {
            const leftTime = new Date(left.updated_at || left.created_at || 0).getTime();
            const rightTime = new Date(right.updated_at || right.created_at || 0).getTime();
            if (rightTime !== leftTime) return rightTime - leftTime;
            return Number(right.id || 0) - Number(left.id || 0);
        });
}

function ensureUniqueSlug(items, desiredSlug, currentId) {
    const base = String(desiredSlug || "").trim() || "item";
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

function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
}

function currentTimestamp() {
    return new Date().toISOString();
}

function createToken() {
    return crypto.randomBytes(24).toString("hex");
}

function buildEmptyStore() {
    return {
        counters: {
            products: 0,
            posts: 0,
            media_assets: 0,
            admin_audit_logs: 0,
            orders: 0,
            order_items: 0,
            customers: 0,
            chat_threads: 0,
            chat_messages: 0
        },
        products: [],
        posts: [],
        media_assets: [],
        admin_audit_logs: [],
        orders: [],
        order_items: [],
        customers: [],
        chat_threads: [],
        chat_messages: []
    };
}

function resolveFallbackStore(seedData) {
    const baseStore = seedData && typeof seedData === "object"
        ? seedData
        : buildEmptyStore();

    return {
        ...buildEmptyStore(),
        ...clone(baseStore),
        counters: {
            ...buildEmptyStore().counters,
            ...((baseStore && baseStore.counters) || {})
        }
    };
}

function hydrateStore(store, seedData) {
    const fallback = resolveFallbackStore(seedData);
    const hydrated = store && typeof store === "object" ? store : {};

    hydrated.counters = {
        ...fallback.counters,
        ...(hydrated.counters || {})
    };

    [
        "products",
        "posts",
        "media_assets",
        "admin_audit_logs",
        "orders",
        "order_items",
        "customers",
        "chat_threads",
        "chat_messages"
    ].forEach((key) => {
        if (!Array.isArray(hydrated[key])) {
            hydrated[key] = clone(fallback[key] || []);
        }
    });

    return hydrated;
}

function buildOrderView(store, order) {
    const customer = store.customers.find((item) => Number(item.id) === Number(order.customer_id));
    return {
        ...order,
        customer_name: order.customer_name || (customer && customer.name) || "Customer",
        customer_email: order.customer_email || (customer && customer.email) || "",
        customer_phone: order.customer_phone || (customer && customer.phone) || "",
        items: store.order_items.filter((item) => Number(item.order_id) === Number(order.id))
    };
}

function buildThreadView(store, thread) {
    const customer = store.customers.find((item) => Number(item.id) === Number(thread.customer_id));
    const order = store.orders.find((item) => Number(item.id) === Number(thread.order_id));
    const messages = store.chat_messages
        .filter((item) => Number(item.thread_id) === Number(thread.id))
        .sort((left, right) => {
            const leftTime = new Date(left.created_at || 0).getTime();
            const rightTime = new Date(right.created_at || 0).getTime();
            if (leftTime !== rightTime) return leftTime - rightTime;
            return Number(left.id || 0) - Number(right.id || 0);
        });

    const lastMessage = messages[messages.length - 1] || null;

    return {
        ...thread,
        customer_name: (customer && customer.name) || "",
        customer_email: (customer && customer.email) || "",
        customer_phone: (customer && customer.phone) || "",
        order_total: order ? Number(order.total_amount || 0) : 0,
        order_status: order ? String(order.status || "") : "",
        last_message: lastMessage ? lastMessage.message : "",
        last_message_at: lastMessage ? lastMessage.created_at : thread.updated_at || thread.created_at,
        message_count: messages.length
    };
}

function createLocalStore(options = {}) {
    const dataFile = String(options.dataFile || "");
    const persist = Boolean(options.persist && dataFile);
    const seedData = resolveFallbackStore(options.seedData);
    let data = null;
    let loadingPromise = null;

    async function writeData() {
        if (!persist || !dataFile) return;
        await fsp.mkdir(path.dirname(dataFile), { recursive: true });
        await fsp.writeFile(dataFile, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    }

    async function loadData() {
        if (data) return data;
        if (loadingPromise) return loadingPromise;

        loadingPromise = (async () => {
            if (persist && fs.existsSync(dataFile)) {
                try {
                    const raw = await fsp.readFile(dataFile, "utf8");
                    data = hydrateStore(JSON.parse(raw), seedData);
                    await writeData();
                    return data;
                } catch (error) {
                    data = hydrateStore(seedData, seedData);
                    await writeData();
                    return data;
                }
            }

            data = hydrateStore(seedData, seedData);
            await writeData();
            return data;
        })();

        const loaded = await loadingPromise;
        loadingPromise = null;
        return loaded;
    }

    async function mutate(callback) {
        const store = await loadData();
        const result = await callback(store);
        await writeData();
        return result;
    }

    function nextId(store, collectionName) {
        store.counters[collectionName] = Number(store.counters[collectionName] || 0) + 1;
        return store.counters[collectionName];
    }

    return {
        async listProducts({ publishedOnly = false, search = "" } = {}) {
            const store = await loadData();
            const query = String(search || "").trim().toLowerCase();
            let products = store.products.slice();

            if (publishedOnly) {
                products = products.filter((item) => Number(item.is_published) === 1);
            }

            if (query) {
                products = products.filter((item) =>
                    [item.name, item.category, item.description]
                        .map((value) => String(value || "").toLowerCase())
                        .some((value) => value.includes(query))
                );
            }

            return clone(sortByUpdatedThenId(products));
        },

        async getProduct(id) {
            const store = await loadData();
            const item = store.products.find((product) => Number(product.id) === Number(id));
            return item ? clone(item) : null;
        },

        async createProduct(payload) {
            return mutate(async (store) => {
                const timestamp = currentTimestamp();
                const row = {
                    id: nextId(store, "products"),
                    name: payload.name,
                    slug: ensureUniqueSlug(store.products, payload.slug, null),
                    category: payload.category,
                    price: Number(payload.price || 0),
                    stock_quantity: Number(payload.stock_quantity || 0),
                    rating: Number(payload.rating || 0),
                    image_url: payload.image_url || null,
                    description: payload.description || "",
                    document_url: payload.document_url || null,
                    document_provider: payload.document_provider || null,
                    is_published: Number(payload.is_published) ? 1 : 0,
                    created_at: timestamp,
                    updated_at: timestamp
                };

                store.products.push(row);
                return clone(row);
            });
        },

        async updateProduct(id, payload) {
            return mutate(async (store) => {
                const row = store.products.find((product) => Number(product.id) === Number(id));
                if (!row) return null;

                row.name = payload.name;
                row.slug = ensureUniqueSlug(store.products, payload.slug, id);
                row.category = payload.category;
                row.price = Number(payload.price || 0);
                row.stock_quantity = Number(payload.stock_quantity || 0);
                row.rating = Number(payload.rating || 0);
                row.image_url = payload.image_url || null;
                row.description = payload.description || "";
                row.document_url = payload.document_url || null;
                row.document_provider = payload.document_provider || null;
                row.is_published = Number(payload.is_published) ? 1 : 0;
                row.updated_at = currentTimestamp();

                return clone(row);
            });
        },

        async deleteProduct(id) {
            return mutate(async (store) => {
                const index = store.products.findIndex((product) => Number(product.id) === Number(id));
                if (index < 0) return false;

                store.products.splice(index, 1);
                store.media_assets = store.media_assets.filter((item) => Number(item.product_id) !== Number(id));
                return true;
            });
        },

        async listPosts({ publishedOnly = false } = {}) {
            const store = await loadData();
            let posts = store.posts.slice();
            if (publishedOnly) {
                posts = posts.filter((item) => Number(item.is_published) === 1);
            }
            return clone(sortByUpdatedThenId(posts));
        },

        async getPost(id) {
            const store = await loadData();
            const item = store.posts.find((post) => Number(post.id) === Number(id));
            return item ? clone(item) : null;
        },

        async createPost(payload) {
            return mutate(async (store) => {
                const timestamp = currentTimestamp();
                const row = {
                    id: nextId(store, "posts"),
                    title: payload.title,
                    slug: ensureUniqueSlug(store.posts, payload.slug, null),
                    excerpt: payload.excerpt || "",
                    content: payload.content || "",
                    image_url: payload.image_url || null,
                    document_url: payload.document_url || null,
                    document_provider: payload.document_provider || null,
                    is_published: Number(payload.is_published) ? 1 : 0,
                    created_at: timestamp,
                    updated_at: timestamp
                };

                store.posts.push(row);
                return clone(row);
            });
        },

        async updatePost(id, payload) {
            return mutate(async (store) => {
                const row = store.posts.find((post) => Number(post.id) === Number(id));
                if (!row) return null;

                row.title = payload.title;
                row.slug = ensureUniqueSlug(store.posts, payload.slug, id);
                row.excerpt = payload.excerpt || "";
                row.content = payload.content || "";
                row.image_url = payload.image_url || null;
                row.document_url = payload.document_url || null;
                row.document_provider = payload.document_provider || null;
                row.is_published = Number(payload.is_published) ? 1 : 0;
                row.updated_at = currentTimestamp();

                return clone(row);
            });
        },

        async deletePost(id) {
            return mutate(async (store) => {
                const index = store.posts.findIndex((post) => Number(post.id) === Number(id));
                if (index < 0) return false;

                store.posts.splice(index, 1);
                store.media_assets = store.media_assets.filter((item) => Number(item.post_id) !== Number(id));
                return true;
            });
        },

        async listMedia() {
            const store = await loadData();
            return clone(sortByUpdatedThenId(store.media_assets));
        },

        async getMedia(id) {
            const store = await loadData();
            const item = store.media_assets.find((media) => Number(media.id) === Number(id));
            return item ? clone(item) : null;
        },

        async createMedia(payload) {
            return mutate(async (store) => {
                const timestamp = currentTimestamp();
                const row = {
                    id: nextId(store, "media_assets"),
                    name: payload.name,
                    file_url: payload.file_url,
                    mime_type: payload.mime_type || null,
                    description: payload.description || "",
                    category: payload.category || "other",
                    product_id: payload.product_id || null,
                    post_id: payload.post_id || null,
                    created_at: timestamp,
                    updated_at: timestamp
                };

                store.media_assets.push(row);
                return clone(row);
            });
        },

        async updateMedia(id, payload) {
            return mutate(async (store) => {
                const row = store.media_assets.find((media) => Number(media.id) === Number(id));
                if (!row) return null;

                row.name = payload.name;
                row.file_url = payload.file_url;
                row.mime_type = payload.mime_type || null;
                row.description = payload.description || "";
                row.category = payload.category || "other";
                row.product_id = payload.product_id || null;
                row.post_id = payload.post_id || null;
                row.updated_at = currentTimestamp();

                return clone(row);
            });
        },

        async deleteMedia(id) {
            return mutate(async (store) => {
                const index = store.media_assets.findIndex((media) => Number(media.id) === Number(id));
                if (index < 0) return false;

                store.media_assets.splice(index, 1);
                return true;
            });
        },

        async listAdminAuditLogs({ limit = 50 } = {}) {
            const store = await loadData();
            return clone(
                sortByUpdatedThenId(
                    store.admin_audit_logs
                        .slice()
                        .map((item) => ({
                            ...item,
                            updated_at: item.created_at
                        }))
                ).slice(0, Math.max(1, Number(limit) || 50))
            );
        },

        async createAdminAuditLog(payload) {
            return mutate(async (store) => {
                const row = {
                    id: nextId(store, "admin_audit_logs"),
                    admin_username: String(payload.admin_username || "").trim() || "admin",
                    action: String(payload.action || "").trim() || "unknown",
                    target_type: payload.target_type ? String(payload.target_type).trim() : null,
                    target_id: payload.target_id !== undefined && payload.target_id !== null
                        ? String(payload.target_id).trim()
                        : null,
                    ip_address: payload.ip_address ? String(payload.ip_address).trim() : null,
                    user_agent: payload.user_agent ? String(payload.user_agent).trim().slice(0, 255) : null,
                    details: payload.details && typeof payload.details === "object"
                        ? clone(payload.details)
                        : null,
                    created_at: currentTimestamp()
                };

                store.admin_audit_logs.push(row);
                return clone(row);
            });
        },

        async findCustomerByEmail(email) {
            const store = await loadData();
            const normalized = normalizeEmail(email);
            const item = store.customers.find((customer) => normalizeEmail(customer.email) === normalized);
            return item ? clone(item) : null;
        },

        async getCustomer(id) {
            const store = await loadData();
            const item = store.customers.find((customer) => Number(customer.id) === Number(id));
            return item ? clone(item) : null;
        },

        async findCustomerBySessionToken(token) {
            const store = await loadData();
            const match = String(token || "").trim();
            if (!match) return null;
            const item = store.customers.find((customer) => String(customer.session_token || "") === match);
            return item ? clone(item) : null;
        },

        async createCustomer(payload) {
            return mutate(async (store) => {
                const email = normalizeEmail(payload.email);
                const exists = store.customers.some((customer) => normalizeEmail(customer.email) === email);
                if (exists) {
                    return null;
                }

                const timestamp = currentTimestamp();
                const row = {
                    id: nextId(store, "customers"),
                    name: String(payload.name || "").trim(),
                    email,
                    phone: String(payload.phone || "").trim(),
                    password_hash: String(payload.password_hash || ""),
                    session_token: null,
                    created_at: timestamp,
                    updated_at: timestamp,
                    last_login_at: null
                };

                store.customers.push(row);
                return clone(row);
            });
        },

        async createCustomerSession(customerId) {
            return mutate(async (store) => {
                const row = store.customers.find((customer) => Number(customer.id) === Number(customerId));
                if (!row) return null;

                row.session_token = createToken();
                row.last_login_at = currentTimestamp();
                row.updated_at = currentTimestamp();

                return clone(row);
            });
        },

        async clearCustomerSession(token) {
            return mutate(async (store) => {
                const match = String(token || "").trim();
                const row = store.customers.find((customer) => String(customer.session_token || "") === match);
                if (!row) return false;

                row.session_token = null;
                row.updated_at = currentTimestamp();
                return true;
            });
        },

        async listOrders() {
            const store = await loadData();
            return clone(
                sortByUpdatedThenId(
                    store.orders.map((order) => ({
                        ...buildOrderView(store, order),
                        updated_at: order.created_at
                    }))
                )
            );
        },

        async createOrder({ customerId = null, user, items, total }) {
            return mutate(async (store) => {
                const customer = store.customers.find((item) => Number(item.id) === Number(customerId));
                const orderId = nextId(store, "orders");
                const timestamp = currentTimestamp();
                const order = {
                    id: orderId,
                    customer_id: customer ? customer.id : null,
                    customer_name: (customer && customer.name) || (user && user.name) || "Customer",
                    customer_email: (customer && customer.email) || (user && user.email) || "",
                    customer_phone: (customer && customer.phone) || (user && user.phone) || "",
                    total_amount: Number(total || 0),
                    status: "Pending",
                    created_at: timestamp
                };

                store.orders.push(order);

                (items || []).forEach((item) => {
                    store.order_items.push({
                        id: nextId(store, "order_items"),
                        order_id: orderId,
                        product_name: item.name || "Product",
                        quantity: Number(item.quantity || 1),
                        price: Number(item.price || 0)
                    });
                });

                return clone(order);
            });
        },

        async updateOrderStatus(id, status) {
            return mutate(async (store) => {
                const row = store.orders.find((order) => Number(order.id) === Number(id));
                if (!row) return false;
                row.status = String(status || "Pending");
                return true;
            });
        },

        async listChatThreads({ customerId = null } = {}) {
            const store = await loadData();
            let threads = store.chat_threads.slice();

            if (customerId !== null && customerId !== undefined) {
                threads = threads.filter((thread) => Number(thread.customer_id) === Number(customerId));
            }

            return clone(sortByUpdatedThenId(threads.map((thread) => buildThreadView(store, thread))));
        },

        async getChatThread(id) {
            const store = await loadData();
            const thread = store.chat_threads.find((item) => Number(item.id) === Number(id));
            return thread ? clone(buildThreadView(store, thread)) : null;
        },

        async createChatThread(payload) {
            return mutate(async (store) => {
                const customer = store.customers.find((item) => Number(item.id) === Number(payload.customer_id));
                if (!customer) return null;

                const timestamp = currentTimestamp();
                const thread = {
                    id: nextId(store, "chat_threads"),
                    customer_id: customer.id,
                    order_id: payload.order_id ? Number(payload.order_id) : null,
                    subject: String(payload.subject || "Customer Request").trim() || "Customer Request",
                    status: String(payload.status || "Open").trim() || "Open",
                    created_at: timestamp,
                    updated_at: timestamp
                };

                store.chat_threads.push(thread);

                if (payload.initial_message) {
                    store.chat_messages.push({
                        id: nextId(store, "chat_messages"),
                        thread_id: thread.id,
                        sender_role: String(payload.sender_role || "customer"),
                        sender_name: String(payload.sender_name || customer.name || "Customer"),
                        message: String(payload.initial_message || "").trim(),
                        created_at: timestamp
                    });
                }

                return clone(buildThreadView(store, thread));
            });
        },

        async listChatMessages(threadId) {
            const store = await loadData();
            const messages = store.chat_messages
                .filter((item) => Number(item.thread_id) === Number(threadId))
                .sort((left, right) => {
                    const leftTime = new Date(left.created_at || 0).getTime();
                    const rightTime = new Date(right.created_at || 0).getTime();
                    if (leftTime !== rightTime) return leftTime - rightTime;
                    return Number(left.id || 0) - Number(right.id || 0);
                });
            return clone(messages);
        },

        async addChatMessage(threadId, payload) {
            return mutate(async (store) => {
                const thread = store.chat_threads.find((item) => Number(item.id) === Number(threadId));
                if (!thread) return null;

                const timestamp = currentTimestamp();
                const row = {
                    id: nextId(store, "chat_messages"),
                    thread_id: Number(thread.id),
                    sender_role: String(payload.sender_role || "customer"),
                    sender_name: String(payload.sender_name || "Customer"),
                    message: String(payload.message || "").trim(),
                    created_at: timestamp
                };

                store.chat_messages.push(row);
                thread.updated_at = timestamp;

                return clone(row);
            });
        },

        async updateChatThreadStatus(id, status) {
            return mutate(async (store) => {
                const row = store.chat_threads.find((thread) => Number(thread.id) === Number(id));
                if (!row) return false;
                row.status = String(status || "Open").trim() || "Open";
                row.updated_at = currentTimestamp();
                return true;
            });
        }
    };
}

module.exports = {
    createLocalStore
};
