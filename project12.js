const REQUEST_KEY = "cart";
const FALLBACK_IMAGE = encodeURI("calxin.images/WhatsApp Image 2026-01-23 at 4.58.19 PM.jpeg");

const MENU_CATEGORY_MAP = {
    "Engine Parts": "Engines",
    "Brake System": "Brakes",
    "Suspension": "Suspension",
    "Tires & Wheels": "Tyres",
    "Electrical": "Electrical",
    "Cooling System": "Cooling",
    "Transmission": "Transmissions",
    "Interior Trim": "Accessories",
    "Audio & Navigation": "Audio",
    "Lights": "Lighting",
    "Paint & Body": "Accessories",
    "Performance Parts": "Tools"
};

const homeState = {
    products: [],
    activeCategory: "",
    searchTerm: ""
};

function getStoredJson(key, fallback) {
    try {
        return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
    } catch (error) {
        return fallback;
    }
}

function setStoredJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new Event("calxin-cart-updated"));
}

function resolveImage(value) {
    const raw = String(value || "").trim();
    if (!raw) return FALLBACK_IMAGE;

    if (window.CalxinApi) {
        return window.CalxinApi.toAbsoluteUrl(raw) || FALLBACK_IMAGE;
    }

    return raw;
}

function getRequestList() {
    return getStoredJson(REQUEST_KEY, []);
}

function setRequestList(items) {
    setStoredJson(REQUEST_KEY, items.map((item) => {
        const quantity = Number(item.quantity || item.qty || 1);
        return {
            ...item,
            id: Number(item.id ?? item.productId ?? 0),
            productId: Number(item.productId ?? item.id ?? 0),
            quantity,
            qty: quantity,
            image: resolveImage(item.image)
        };
    }));
}

function toggleMenu() {
    const sideMenu = document.getElementById("sideMenu");
    const header = document.querySelector(".header");

    if (sideMenu) {
        sideMenu.classList.toggle("active");
    }

    if (header) {
        header.classList.toggle("menu-open");
    }
}

function closeMenu() {
    const sideMenu = document.getElementById("sideMenu");
    const header = document.querySelector(".header");

    if (sideMenu) {
        sideMenu.classList.remove("active");
    }

    if (header) {
        header.classList.remove("menu-open");
    }
}

function showToastNotification(message) {
    const toast = document.createElement("div");
    toast.style.cssText = [
        "position: fixed",
        "top: 92px",
        "right: 20px",
        "z-index: 3000",
        "background: #0c7abf",
        "color: #fff",
        "padding: 12px 16px",
        "border-radius: 10px",
        "box-shadow: 0 12px 30px rgba(12, 122, 191, 0.28)",
        "font-weight: 600",
        "max-width: 280px"
    ].join(";");
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 2200);
}

function getStockClass(stock) {
    if (stock > 45) return "stock-very-high";
    if (stock > 30) return "stock-high";
    if (stock > 15) return "stock-medium";
    if (stock > 5) return "stock-low";
    if (stock > 0) return "stock-critical";
    return "stock-out";
}

function getFilteredProducts() {
    return homeState.products.filter((product) => {
        const matchesCategory = !homeState.activeCategory || product.category === homeState.activeCategory;
        const haystack = [
            product.name,
            product.category,
            product.description,
            String(product.price || "")
        ]
            .join(" ")
            .toLowerCase();
        const matchesSearch = !homeState.searchTerm || haystack.includes(homeState.searchTerm);
        return matchesCategory && matchesSearch;
    });
}

function openProductDetails(productId) {
    window.location.href = `product-view.html?id=${productId}`;
}

function addProductToRequest(productId, openList = true) {
    const product = homeState.products.find((item) => Number(item.id) === Number(productId));
    if (!product) return;

    const requestList = getRequestList();
    const existing = requestList.find((item) => Number(item.productId || item.id) === Number(product.id));

    if (existing) {
        existing.quantity = Number(existing.quantity || existing.qty || 1) + 1;
        existing.qty = existing.quantity;
    } else {
        requestList.push({
            id: Number(product.id),
            productId: Number(product.id),
            name: product.name,
            price: Number(product.price || 0),
            quantity: 1,
            qty: 1,
            image: resolveImage(product.image),
            category: product.category,
            stock: Number(product.stock || 0),
            rating: Number(product.rating || 0)
        });
    }

    setRequestList(requestList);
    showToastNotification(`${product.name} added to your request list`);

    if (openList) {
        window.location.href = "cart.html";
    }
}

function createProductCard(product) {
    const card = document.createElement("article");
    card.className = "card";

    const stock = Number(product.stock || 0);
    const stockLabel = stock > 0 ? `${stock} in stock` : "Out of stock";
    const stockClass = getStockClass(stock);

    card.innerHTML = `
        <div class="card-image-wrapper">
            <img src="${resolveImage(product.image)}" alt="${product.name}">
            <span class="stock-badge ${stockClass}">${stockLabel}</span>
        </div>
        <div class="card-content">
            <h3>${product.name}</h3>
            <div class="card-rating">
                <span class="stars">${"★".repeat(Math.max(1, Math.floor(Number(product.rating || 0))))}</span>
                <span class="rating-value">${Number(product.rating || 0).toFixed(1)}</span>
            </div>
            <p class="card-category">${product.category}</p>
            <p class="card-price">KES ${Number(product.price || 0).toLocaleString()}</p>
            <div class="card-actions">
                <button class="home-add-btn" type="button">
                    <i class="fas fa-eye"></i> View Part
                </button>
                <button class="wishlist-heart-btn" type="button"${stock === 0 ? " disabled" : ""}>
                    <i class="fas fa-clipboard-list"></i> Request
                </button>
            </div>
        </div>
    `;

    const imageWrapper = card.querySelector(".card-image-wrapper");
    const detailButton = card.querySelector(".home-add-btn");
    const requestButton = card.querySelector(".wishlist-heart-btn");

    imageWrapper.addEventListener("click", () => openProductDetails(product.id));
    detailButton.addEventListener("click", (event) => {
        event.preventDefault();
        openProductDetails(product.id);
    });
    requestButton.addEventListener("click", (event) => {
        event.preventDefault();
        addProductToRequest(product.id, true);
    });

    return card;
}

function renderProducts() {
    const container = document.querySelector(".products");
    if (!container) return;

    const items = getFilteredProducts();
    container.innerHTML = "";

    if (!items.length) {
        container.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 48px 20px; color: #4f5d67;">
                No products match your current search.
            </div>
        `;
        return;
    }

    items.forEach((product) => {
        container.appendChild(createProductCard(product));
    });
}

async function loadProducts() {
    const container = document.querySelector(".products");

    try {
        if (!window.CalxinApi) {
            throw new Error("Catalog API client not loaded.");
        }

        homeState.products = await window.CalxinApi.getProducts({ published: true });
        renderProducts();
    } catch (error) {
        if (container) {
            container.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 48px 20px; color: #4f5d67;">
                    Unable to load products right now. Start the local server and refresh the page.
                </div>
            `;
        }
        console.error(error);
    }
}

function bindSearch() {
    const searchInput = document.getElementById("searchInput");
    if (!searchInput) return;

    searchInput.addEventListener("input", (event) => {
        homeState.searchTerm = String(event.target.value || "").trim().toLowerCase();
        renderProducts();
    });
}

function bindMenuInteractions() {
    document.querySelectorAll(".side-menu .nav-menu a").forEach((link) => {
        link.addEventListener("click", () => {
            closeMenu();
        });
    });

    document.querySelectorAll(".spare-parts-menu li").forEach((item) => {
        item.style.cursor = "pointer";
        item.addEventListener("click", () => {
            const label = item.textContent.trim();
            homeState.activeCategory = MENU_CATEGORY_MAP[label] || "";
            renderProducts();
            closeMenu();
        });
    });

    document.addEventListener("click", (event) => {
        const sideMenu = document.getElementById("sideMenu");
        const hamburger = document.querySelector(".hamburger");

        if (!sideMenu || !hamburger) return;
        if (!sideMenu.classList.contains("active")) return;

        if (!sideMenu.contains(event.target) && !hamburger.contains(event.target)) {
            closeMenu();
        }
    });
}

function setupProgressiveWebApp() {
    if (!document.querySelector('link[rel="manifest"]')) {
        const manifest = document.createElement("link");
        manifest.rel = "manifest";
        manifest.href = "manifest.json";
        document.head.appendChild(manifest);
    }

    if (!document.querySelector('meta[name="theme-color"]')) {
        const meta = document.createElement("meta");
        meta.name = "theme-color";
        meta.content = "#0d6ba8";
        document.head.appendChild(meta);
    }

    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.getRegistrations()
            .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
            .catch((error) => {
                console.error("Service worker cleanup failed:", error);
            });
    }

    if ("caches" in window) {
        window.caches.keys()
            .then((keys) => Promise.all(
                keys
                    .filter((key) => key.indexOf("calxin-auto") === 0)
                    .map((key) => window.caches.delete(key))
            ))
            .catch((error) => {
                console.error("Cache cleanup failed:", error);
            });
    }
}

document.addEventListener("DOMContentLoaded", () => {
    window.CalxinSession.updateAuthUi();
    setupProgressiveWebApp();
    bindSearch();
    bindMenuInteractions();
    loadProducts();
});

window.toggleMenu = toggleMenu;
