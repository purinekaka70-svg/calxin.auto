(function initCalxinApi(global) {
    const SESSION_KEY = "calxinCustomerSession";
    const isLocalHost = global.location
        && ["localhost", "127.0.0.1"].includes(global.location.hostname);
    const apiOrigin = global.location && global.location.protocol === "file:"
        ? "http://localhost:3000"
        : isLocalHost && global.location.port && global.location.port !== "3000"
            ? `${global.location.protocol}//${global.location.hostname}:3000`
            : global.location.origin;
    const apiBaseUrl = `${apiOrigin.replace(/\/+$/, "")}/api`;

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

        const response = await fetch(`${apiBaseUrl}${path}`, {
            ...options,
            credentials: "same-origin",
            headers
        });

        let payload = null;
        try {
            payload = await response.json();
        } catch (error) {
            payload = null;
        }

        if (!response.ok) {
            const message = payload && payload.message ? payload.message : `Request failed with status ${response.status}`;
            throw new Error(message);
        }

        return payload;
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

        // Keep older cached admin pages working if they still call calxinapi.adminlogin().
        publicApi.adminlogin = (credentials) => target.adminLogin(credentials || readLegacyAdminCredentials() || {});

        return publicApi;
    }

    const api = {
        apiOrigin,
        apiBaseUrl,
        sessionKey: SESSION_KEY,
        toAbsoluteUrl,
        async getHealth() {
            return request("/health");
        },
        async register(customer) {
            return request("/auth/register", {
                method: "POST",
                body: JSON.stringify(customer || {})
            });
        },
        async adminLogin(credentials) {
            return request("/admin/login", {
                method: "POST",
                body: JSON.stringify(credentials || {})
            });
        },
        async getAdminSession() {
            return request("/admin/session");
        },
        async adminLogout() {
            return request("/admin/logout", {
                method: "POST",
                body: JSON.stringify({})
            });
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
        },
        async getProduct(id) {
            const payload = await request(`/products/${id}`);
            return normalizeProduct(payload.item);
        },
        async saveProduct(product) {
            const method = product && product.id ? "PUT" : "POST";
            const path = product && product.id ? `/products/${product.id}` : "/products";
            const payload = await request(path, {
                method,
                body: JSON.stringify(product || {})
            });
            return normalizeProduct(payload.item);
        },
        async deleteProduct(id) {
            return request(`/products/${id}`, { method: "DELETE" });
        },
        async getPosts(params) {
            const query = new URLSearchParams();
            if (params && params.published !== undefined) {
                query.set("published", params.published ? "1" : "0");
            }
            const suffix = query.toString() ? `?${query.toString()}` : "";
            const payload = await request(`/posts${suffix}`);
            return (payload.items || []).map(normalizePost);
        },
        async savePost(post) {
            const method = post && post.id ? "PUT" : "POST";
            const path = post && post.id ? `/posts/${post.id}` : "/posts";
            const payload = await request(path, {
                method,
                body: JSON.stringify(post || {})
            });
            return normalizePost(payload.item);
        },
        async deletePost(id) {
            return request(`/posts/${id}`, { method: "DELETE" });
        },
        async getMedia() {
            const payload = await request("/media");
            return (payload.items || []).map(normalizeMedia);
        },
        async saveMedia(media) {
            const method = media && media.id ? "PUT" : "POST";
            const path = media && media.id ? `/media/${media.id}` : "/media";
            const payload = await request(path, {
                method,
                body: JSON.stringify(media || {})
            });
            return normalizeMedia(payload.item);
        },
        async deleteMedia(id) {
            return request(`/media/${id}`, { method: "DELETE" });
        },
        async getOrders(params) {
            const query = new URLSearchParams();
            if (params && params.mine) {
                query.set("mine", "1");
            }
            const suffix = query.toString() ? `?${query.toString()}` : "";
            const payload = await request(`/orders${suffix}`);
            return payload.items || [];
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
            const query = new URLSearchParams();
            if (params && params.admin) {
                query.set("admin", "1");
            }
            const suffix = query.toString() ? `?${query.toString()}` : "";
            const payload = await request(`/chat/threads${suffix}`);
            return payload.items || [];
        },
        async createChatThread(thread) {
            const payload = await request("/chat/threads", {
                method: "POST",
                body: JSON.stringify(thread || {})
            });
            return payload.item;
        },
        async getChatMessages(id, params) {
            const query = new URLSearchParams();
            if (params && params.admin) {
                query.set("admin", "1");
            }
            const suffix = query.toString() ? `?${query.toString()}` : "";
            const payload = await request(`/chat/threads/${id}/messages${suffix}`);
            return payload;
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
        }
    };

    const publicApi = buildPublicApi(api);
    global.CalxinApi = publicApi;
    global.calxinapi = publicApi;
})(window);
