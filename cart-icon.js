(function initCartIcon(global) {
    const STORAGE_KEY = "cart";
    const CATALOG_SYNC_EVENT_KEY = "calxinCatalogUpdatedAt";
    const CATALOG_SYNC_CHANNEL = "calxin-catalog";
    const CART_SYNC_INTERVAL_MS = 10000;
    let lastCartSyncAt = 0;
    let cartSyncPromise = null;
    let cartSyncChannel = null;
    let cartRealtimeSource = null;

    function readCartItems() {
        try {
            const items = JSON.parse(global.localStorage.getItem(STORAGE_KEY) || "[]");
            return Array.isArray(items) ? items : [];
        } catch (error) {
            return [];
        }
    }

    function getCartCount() {
        return readCartItems().reduce((total, item) => total + Math.max(0, Number(item.quantity || item.qty || 1)), 0);
    }

    function updateCartIndicators() {
        const count = getCartCount();

        document.querySelectorAll("[data-cart-count]").forEach((node) => {
            node.textContent = String(count);
            node.classList.toggle("is-empty", count === 0);
        });

        document.querySelectorAll("[data-cart-link]").forEach((node) => {
            node.setAttribute("aria-label", count > 0 ? `Open request list with ${count} item${count === 1 ? "" : "s"}` : "Open request list");
            node.setAttribute("title", count > 0 ? `Request List (${count})` : "Request List");
        });
    }

    async function syncCartItems(force = false) {
        if (!global.CalxinApi || cartSyncPromise) {
            return cartSyncPromise || false;
        }

        if (!force && Date.now() - lastCartSyncAt < CART_SYNC_INTERVAL_MS) {
            return false;
        }

        const items = readCartItems();
        if (!items.length) {
            lastCartSyncAt = Date.now();
            updateCartIndicators();
            return false;
        }

        const requestPromise = (async () => {
            const products = await global.CalxinApi.getProducts({ published: true });
            const productIds = new Set(products.map((item) => Number(item.id)));
            const nextItems = items.filter((item) => productIds.has(Number(item.productId || item.id)));

            lastCartSyncAt = Date.now();

            if (JSON.stringify(items) !== JSON.stringify(nextItems)) {
                global.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextItems));
                global.dispatchEvent(new Event("calxin-cart-updated"));
            }

            updateCartIndicators();
            return true;
        })();

        cartSyncPromise = requestPromise;

        try {
            return await requestPromise;
        } catch (error) {
            updateCartIndicators();
            return false;
        } finally {
            if (cartSyncPromise === requestPromise) {
                cartSyncPromise = null;
            }
        }
    }

    function refreshCartIndicators() {
        syncCartItems(true).catch(() => {
            updateCartIndicators();
        });
    }

    function bindRealtimeCart() {
        if (!global.CalxinApi || typeof global.CalxinApi.subscribeToEvents !== "function") {
            return;
        }

        if (cartRealtimeSource && typeof cartRealtimeSource.close === "function") {
            cartRealtimeSource.close();
        }

        cartRealtimeSource = global.CalxinApi.subscribeToEvents(
            {
                topics: ["catalog"],
                includeToken: false
            },
            {
                onMessage(payload) {
                    if (!payload || payload.type === "ready") {
                        return;
                    }

                    refreshCartIndicators();
                },
                onError() {
                    updateCartIndicators();
                }
            }
        );
    }

    global.CalxinCartIcon = {
        update: updateCartIndicators
    };

    document.addEventListener("DOMContentLoaded", () => {
        bindRealtimeCart();
        refreshCartIndicators();
    });
    global.addEventListener("storage", updateCartIndicators);
    global.addEventListener("storage", (event) => {
        if (event.key === CATALOG_SYNC_EVENT_KEY || event.key === STORAGE_KEY) {
            refreshCartIndicators();
        }
    });
    global.addEventListener("pageshow", refreshCartIndicators);
    global.addEventListener("focus", refreshCartIndicators);
    global.addEventListener("calxin-cart-updated", updateCartIndicators);
    global.addEventListener("calxin-catalog-updated", refreshCartIndicators);

    if ("BroadcastChannel" in global) {
        cartSyncChannel = new BroadcastChannel(CATALOG_SYNC_CHANNEL);
        cartSyncChannel.addEventListener("message", refreshCartIndicators);
    }

    global.addEventListener("beforeunload", () => {
        if (cartRealtimeSource && typeof cartRealtimeSource.close === "function") {
            cartRealtimeSource.close();
        }
    });
})(window);
