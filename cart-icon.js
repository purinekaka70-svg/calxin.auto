(function initCartIcon(global) {
    const STORAGE_KEY = "cart";

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

    global.CalxinCartIcon = {
        update: updateCartIndicators
    };

    document.addEventListener("DOMContentLoaded", updateCartIndicators);
    global.addEventListener("storage", updateCartIndicators);
    global.addEventListener("pageshow", updateCartIndicators);
    global.addEventListener("focus", updateCartIndicators);
    global.addEventListener("calxin-cart-updated", updateCartIndicators);
})(window);
