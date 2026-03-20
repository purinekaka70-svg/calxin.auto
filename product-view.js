const REQUEST_LIST_KEY = "cart";
const PRODUCT_FALLBACK_IMAGE = encodeURI("calxin.images/WhatsApp Image 2026-01-23 at 4.58.19 PM.jpeg");
const OWNER_WHATSAPP_NUMBER = "254706931802";

let currentProduct = null;
let quantity = 1;

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

function resolveProductImage(value) {
    const raw = String(value || "").trim();
    if (!raw) return PRODUCT_FALLBACK_IMAGE;
    if (window.CalxinApi) {
        return window.CalxinApi.toAbsoluteUrl(raw) || PRODUCT_FALLBACK_IMAGE;
    }
    return raw;
}

function toggleMenu() {
    const sideMenu = document.getElementById("sideMenu");
    const hamburger = document.querySelector(".hamburger");

    if (sideMenu) {
        sideMenu.classList.toggle("active");
    }

    if (hamburger) {
        hamburger.classList.toggle("active");
    }
}

function closeMenu() {
    const sideMenu = document.getElementById("sideMenu");
    const hamburger = document.querySelector(".hamburger");

    if (sideMenu) {
        sideMenu.classList.remove("active");
    }

    if (hamburger) {
        hamburger.classList.remove("active");
    }
}

function updateProductSeo() {
    if (!currentProduct) return;

    document.title = `${currentProduct.name} | Calxin Auto Mombasa`;

    const description = currentProduct.description
        || `${currentProduct.name} in ${currentProduct.category}. Request this part directly from Calxin Auto Mombasa.`;

    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
        meta = document.createElement("meta");
        meta.name = "description";
        document.head.appendChild(meta);
    }
    meta.setAttribute("content", description.slice(0, 160));
}

function renderProductDetails() {
    if (!currentProduct) return;

    const image = document.getElementById("mainImage");
    image.src = resolveProductImage(currentProduct.image);
    image.onerror = function onError() {
        this.src = PRODUCT_FALLBACK_IMAGE;
    };

    document.getElementById("productName").textContent = currentProduct.name;
    document.getElementById("breadcrumbName").textContent = currentProduct.name;
    document.getElementById("productCategory").textContent = currentProduct.category;
    document.getElementById("productRating").textContent = `⭐ ${Number(currentProduct.rating || 0).toFixed(1)}`;
    document.getElementById("productStock").textContent = Number(currentProduct.stock || 0) > 0
        ? `${Number(currentProduct.stock || 0)} in stock`
        : "Out of stock";
    document.getElementById("productPrice").textContent = `KES ${Number(currentProduct.price || 0).toLocaleString()}`;

    document.getElementById("specCategory").textContent = currentProduct.category;
    document.getElementById("specPrice").textContent = `KES ${Number(currentProduct.price || 0).toLocaleString()}`;
    document.getElementById("specStock").textContent = Number(currentProduct.stock || 0) > 0
        ? `${Number(currentProduct.stock || 0)} in stock`
        : "Out of stock";
    document.getElementById("specRating").textContent = `${Number(currentProduct.rating || 0).toFixed(1)}/5`;
    document.getElementById("relatedCategory").textContent = currentProduct.category;

    const requestButton = document.getElementById("requestBtn");
    if (requestButton) {
        requestButton.disabled = Number(currentProduct.stock || 0) <= 0;
        requestButton.innerHTML = Number(currentProduct.stock || 0) > 0
            ? '<i class="fas fa-clipboard-list"></i> Add To Request List'
            : '<i class="fas fa-ban"></i> Out Of Stock';
    }

    updateProductSeo();
}

async function renderRelatedProducts() {
    const container = document.getElementById("relatedProducts");
    if (!container || !window.CalxinApi || !currentProduct) return;

    try {
        const products = await window.CalxinApi.getProducts({ published: true });
        const related = products
            .filter((product) =>
                Number(product.id) !== Number(currentProduct.id)
                && product.category === currentProduct.category
            )
            .slice(0, 4);

        if (!related.length) {
            container.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; padding: 2rem;">No related products found.</p>';
            return;
        }

        container.innerHTML = "";
        related.forEach((product) => {
            const item = document.createElement("div");
            item.className = "related-item";
            item.innerHTML = `
                <div class="related-item-image">
                    <img src="${resolveProductImage(product.image)}" alt="${product.name}">
                </div>
                <div class="related-item-info">
                    <h4>${product.name}</h4>
                    <p class="related-item-price">KES ${Number(product.price || 0).toLocaleString()}</p>
                </div>
            `;
            item.addEventListener("click", () => {
                viewProduct(Number(product.id));
            });
            container.appendChild(item);
        });
    } catch (error) {
        container.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; padding: 2rem;">Unable to load related products.</p>';
        console.error(error);
    }
}

function increaseQuantity() {
    quantity += 1;
    document.getElementById("quantity").value = quantity;
}

function decreaseQuantity() {
    quantity = Math.max(1, quantity - 1);
    document.getElementById("quantity").value = quantity;
}

function getRequestList() {
    return getStoredJson(REQUEST_LIST_KEY, []);
}

function addProductToRequest() {
    if (!currentProduct || Number(currentProduct.stock || 0) <= 0) return;

    const requestList = getRequestList();
    const existing = requestList.find((item) => Number(item.productId || item.id) === Number(currentProduct.id));

    if (existing) {
        existing.quantity = Number(existing.quantity || existing.qty || 1) + quantity;
        existing.qty = existing.quantity;
    } else {
        requestList.push({
            id: Number(currentProduct.id),
            productId: Number(currentProduct.id),
            name: currentProduct.name,
            price: Number(currentProduct.price || 0),
            quantity,
            qty: quantity,
            image: resolveProductImage(currentProduct.image),
            category: currentProduct.category,
            stock: Number(currentProduct.stock || 0),
            rating: Number(currentProduct.rating || 0)
        });
    }

    setStoredJson(REQUEST_LIST_KEY, requestList);
    window.location.href = "cart.html";
}

function openProductWhatsapp() {
    if (!currentProduct) return;

    const customer = window.CalxinSession.getCustomer();
    const lines = [
        "Hello Calxin Auto, I need this spare part:",
        "",
        `Product: ${currentProduct.name}`,
        `Category: ${currentProduct.category}`,
        `Quantity: ${quantity}`,
        `Estimated price: KES ${Number(currentProduct.price || 0).toLocaleString()}`
    ];

    if (customer) {
        lines.push(`Customer: ${customer.name} (${customer.phone})`);
    }

    lines.push("Please confirm stock and final price.");
    window.open(`https://wa.me/${OWNER_WHATSAPP_NUMBER}?text=${encodeURIComponent(lines.join("\n"))}`, "_blank");
}

function viewProduct(productId) {
    window.location.href = `product-view.html?id=${productId}`;
}

async function initProductPage() {
    const params = new URLSearchParams(window.location.search);
    const productId = Number(params.get("id"));

    if (!Number.isFinite(productId) || !window.CalxinApi) {
        window.location.href = "index.html";
        return;
    }

    try {
        currentProduct = await window.CalxinApi.getProduct(productId);
        renderProductDetails();
        await renderRelatedProducts();
    } catch (error) {
        console.error(error);
        window.location.href = "index.html";
    }
}

document.addEventListener("DOMContentLoaded", () => {
    window.CalxinSession.updateAuthUi();

    document.querySelectorAll(".side-menu .nav-menu a").forEach((link) => {
        link.addEventListener("click", () => {
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

    initProductPage();
});

window.toggleMenu = toggleMenu;
window.closeMenu = closeMenu;
window.increaseQuantity = increaseQuantity;
window.decreaseQuantity = decreaseQuantity;
window.addProductToRequest = addProductToRequest;
window.openProductWhatsapp = openProductWhatsapp;
