const REQUEST_STORAGE_KEY = "cart";
const REQUEST_FALLBACK_IMAGE = encodeURI("calxin.images/WhatsApp Image 2026-01-23 at 4.58.19 PM.jpeg");
const OWNER_WHATSAPP_NUMBER = "254706931802";
const REQUEST_CONTACT_KEY = "calxinRequestContact";
const CATALOG_SYNC_EVENT_KEY = "calxinCatalogUpdatedAt";
const CATALOG_SYNC_CHANNEL = "calxin-catalog";
const REQUEST_SYNC_INTERVAL_MS = 10000;
let requestSyncPromise = null;
let lastRequestSyncAt = 0;
let requestSyncChannel = null;
let cartRealtimeSource = null;

function getStoredJson(key, fallback) {
    try {
        return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
    } catch (error) {
        return fallback;
    }
}

function setStoredJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
    if (key === REQUEST_STORAGE_KEY) {
        window.dispatchEvent(new Event("calxin-cart-updated"));
    }
}

function getStoredContact() {
    return getStoredJson(REQUEST_CONTACT_KEY, {
        name: "",
        phone: "",
        email: ""
    });
}

function setStoredContact(contact) {
    setStoredJson(REQUEST_CONTACT_KEY, {
        name: String(contact.name || "").trim(),
        phone: String(contact.phone || "").trim(),
        email: String(contact.email || "").trim()
    });
}

function resolveImagePath(value) {
    const raw = String(value || "").trim();
    if (!raw) return REQUEST_FALLBACK_IMAGE;
    if (window.CalxinApi) {
        return window.CalxinApi.toAbsoluteUrl(raw) || REQUEST_FALLBACK_IMAGE;
    }
    return raw;
}

function getRequestItems() {
    return getStoredJson(REQUEST_STORAGE_KEY, []).map((item) => {
        const quantity = Number(item.quantity || item.qty || 1);
        return {
            id: Number(item.id ?? item.productId ?? 0),
            productId: Number(item.productId ?? item.id ?? 0),
            name: item.name || "Product",
            price: Number(item.price || 0),
            quantity,
            image: resolveImagePath(item.image),
            category: item.category || "General",
            stock: Number(item.stock || 0)
        };
    });
}

function setRequestItems(items) {
    setStoredJson(REQUEST_STORAGE_KEY, items.map((item) => {
        const quantity = Number(item.quantity || item.qty || 1);
        return {
            ...item,
            id: Number(item.id ?? item.productId ?? 0),
            productId: Number(item.productId ?? item.id ?? 0),
            quantity,
            qty: quantity,
            image: resolveImagePath(item.image)
        };
    }));
}

function buildRequestItem(product, quantity) {
    const normalizedQuantity = Math.max(1, Number(quantity || 1));
    return {
        id: Number(product.id),
        productId: Number(product.id),
        name: product.name || "Product",
        price: Number(product.price || 0),
        quantity: normalizedQuantity,
        qty: normalizedQuantity,
        image: resolveImagePath(product.image),
        category: product.category || "General",
        stock: Number(product.stock || 0)
    };
}

function getRequestSignature(items) {
    return JSON.stringify(
        items.map((item) => ({
            id: Number(item.id ?? item.productId ?? 0),
            productId: Number(item.productId ?? item.id ?? 0),
            name: item.name || "Product",
            price: Number(item.price || 0),
            quantity: Math.max(1, Number(item.quantity || item.qty || 1)),
            image: resolveImagePath(item.image),
            category: item.category || "General",
            stock: Number(item.stock || 0)
        }))
    );
}

async function syncRequestItemsWithCatalog(force = false) {
    if (requestSyncPromise) {
        return requestSyncPromise;
    }

    if (!window.CalxinApi) {
        return false;
    }

    if (!force && Date.now() - lastRequestSyncAt < REQUEST_SYNC_INTERVAL_MS) {
        return false;
    }

    const currentItems = getRequestItems();
    if (!currentItems.length) {
        lastRequestSyncAt = Date.now();
        return false;
    }

    const requestPromise = (async () => {
        const products = await window.CalxinApi.getProducts({ published: true });
        const productMap = new Map(products.map((product) => [Number(product.id), product]));
        const syncedItems = currentItems
            .map((item) => {
                const product = productMap.get(Number(item.productId || item.id));
                if (!product) {
                    return null;
                }

                return buildRequestItem(product, item.quantity || item.qty || 1);
            })
            .filter(Boolean);

        lastRequestSyncAt = Date.now();

        if (getRequestSignature(currentItems) !== getRequestSignature(syncedItems)) {
            setRequestItems(syncedItems);
            return true;
        }

        return false;
    })();

    requestSyncPromise = requestPromise;

    try {
        return await requestPromise;
    } finally {
        if (requestSyncPromise === requestPromise) {
            requestSyncPromise = null;
        }
    }
}

function toggleMobileMenu() {
    const sideMenu = document.getElementById("sideMenu");
    const hamburger = document.querySelector(".hamburger");

    if (sideMenu) {
        sideMenu.classList.toggle("active");
    }

    if (hamburger) {
        hamburger.classList.toggle("active");
    }
}

function closeMobileMenu() {
    const sideMenu = document.getElementById("sideMenu");
    const hamburger = document.querySelector(".hamburger");

    if (sideMenu) {
        sideMenu.classList.remove("active");
    }

    if (hamburger) {
        hamburger.classList.remove("active");
    }
}

function bindMenuEvents() {
    document.querySelectorAll(".side-menu .nav-menu a").forEach((link) => {
        link.addEventListener("click", () => {
            closeMobileMenu();
        });
    });

    document.addEventListener("click", (event) => {
        const sideMenu = document.getElementById("sideMenu");
        const hamburger = document.querySelector(".hamburger");

        if (!sideMenu || !hamburger) return;
        if (!sideMenu.classList.contains("active")) return;

        if (!sideMenu.contains(event.target) && !hamburger.contains(event.target)) {
            closeMobileMenu();
        }
    });
}

function calculateTotals() {
    const items = getRequestItems();
    const itemCount = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const subtotal = items.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.quantity || 0)), 0);
    return { itemCount, subtotal };
}

function getContactInputs() {
    return {
        name: document.getElementById("requestCustomerName"),
        phone: document.getElementById("requestCustomerPhone"),
        email: document.getElementById("requestCustomerEmail")
    };
}

function getRequestContact() {
    const signedIn = window.CalxinSession ? window.CalxinSession.getCustomer() : null;
    if (signedIn) {
        return {
            name: signedIn.name || "",
            phone: signedIn.phone || "",
            email: signedIn.email || "",
            signedIn: true
        };
    }

    const stored = getStoredContact();
    return {
        name: stored.name || "",
        phone: stored.phone || "",
        email: stored.email || "",
        signedIn: false
    };
}

function fillContactInputs() {
    const contact = getRequestContact();
    const inputs = getContactInputs();
    if (inputs.name) inputs.name.value = contact.name;
    if (inputs.phone) inputs.phone.value = contact.phone;
    if (inputs.email) inputs.email.value = contact.email;
}

function readContactInputs() {
    const inputs = getContactInputs();
    return {
        name: String(inputs.name ? inputs.name.value : "").trim(),
        phone: String(inputs.phone ? inputs.phone.value : "").trim(),
        email: String(inputs.email ? inputs.email.value : "").trim()
    };
}

function persistGuestContact() {
    if (window.CalxinSession && window.CalxinSession.isLoggedIn()) return;
    setStoredContact(readContactInputs());
}

function validateRequestContact() {
    const contact = readContactInputs();

    if (!contact.name) {
        throw new Error("Enter your full name before sending the request.");
    }

    if (!contact.phone) {
        throw new Error("Enter your phone or WhatsApp number before sending the request.");
    }

    if (contact.email && !contact.email.includes("@")) {
        throw new Error("Enter a valid email address or leave it blank.");
    }

    persistGuestContact();
    return contact;
}

function updateSummary() {
    const totals = calculateTotals();
    const customer = getRequestContact();
    const hasContact = Boolean(customer.name || customer.phone || customer.email);

    document.getElementById("itemCount").textContent = String(totals.itemCount);
    document.getElementById("subtotal").textContent = `KES ${totals.subtotal.toLocaleString()}`;
    document.getElementById("accountStatus").textContent = customer.signedIn
        ? `Signed in as ${customer.name} (${customer.phone}). After sending, you can continue in live chat or WhatsApp.`
        : hasContact
            ? "Your request will be saved for admin using the contact details above. You can continue on WhatsApp right away."
            : "Add your phone or WhatsApp number above so the admin can call or message you after reviewing the cart.";

    const sendButton = document.getElementById("sendRequestBtn");
    if (sendButton) {
        sendButton.innerHTML = '<i class="fas fa-paper-plane"></i> Send Request To Admin';
    }
}

function createRequestItemElement(item, index) {
    const element = document.createElement("div");
    element.className = "cart-item";
    element.innerHTML = `
        <div class="cart-item-image">
            <img src="${resolveImagePath(item.image)}" alt="${item.name}">
        </div>
        <div class="cart-item-details">
            <div class="cart-item-name">${item.name}</div>
            <div class="cart-item-price">KES ${Number(item.price || 0).toLocaleString()}</div>
            <div class="cart-item-quantity">
                <button class="qty-btn" type="button">-</button>
                <input type="number" value="${item.quantity}" min="1" readonly>
                <button class="qty-btn" type="button">+</button>
            </div>
            <a class="view-details-btn" href="product-view.html?id=${item.productId}">View Details</a>
        </div>
        <div class="cart-item-total">
            <div class="item-subtotal">KES ${(Number(item.price || 0) * Number(item.quantity || 0)).toLocaleString()}</div>
            <button class="remove-btn" type="button">
                <i class="fas fa-trash"></i> Remove
            </button>
        </div>
    `;

    const buttons = element.querySelectorAll(".qty-btn");
    const removeButton = element.querySelector(".remove-btn");

    buttons[0].addEventListener("click", () => updateQuantity(index, -1));
    buttons[1].addEventListener("click", () => updateQuantity(index, 1));
    removeButton.addEventListener("click", () => removeFromRequest(index));

    return element;
}

function loadRequestList() {
    const items = getRequestItems();
    const container = document.getElementById("cartItemsContainer");
    const emptyMessage = document.getElementById("emptyCartMessage");

    if (!container || !emptyMessage) return;

    container.innerHTML = "";

    if (!items.length) {
        container.style.display = "none";
        emptyMessage.style.display = "block";
        updateSummary();
        return;
    }

    container.style.display = "flex";
    emptyMessage.style.display = "none";

    items.forEach((item, index) => {
        container.appendChild(createRequestItemElement(item, index));
    });

    updateSummary();
}

function updateQuantity(index, change) {
    const items = getRequestItems();
    const item = items[index];
    if (!item) return;

    item.quantity = Math.max(1, Number(item.quantity || 1) + Number(change || 0));
    setRequestItems(items);
    loadRequestList();
    loadSuggestedProducts();
}

function removeFromRequest(index) {
    const items = getRequestItems();
    items.splice(index, 1);
    setRequestItems(items);
    loadRequestList();
    loadSuggestedProducts();
}

function buildWhatsappUrl(items, subtotal, note) {
    const customer = readContactInputs();
    const lines = [
        "Hello Calxin Auto, I want to request these spare parts:",
        ""
    ];

    items.forEach((item, index) => {
        lines.push(`${index + 1}. ${item.name} x${item.quantity} - KES ${Number(item.price || 0).toLocaleString()}`);
    });

    lines.push("");
    lines.push(`Estimated total: KES ${Number(subtotal || 0).toLocaleString()}`);

    if (customer.name || customer.phone || customer.email) {
        lines.push(`Customer: ${customer.name || "Guest"}`);
        if (customer.phone) lines.push(`Phone: ${customer.phone}`);
        if (customer.email) lines.push(`Email: ${customer.email}`);
    }

    if (note) {
        lines.push(`Note: ${String(note).trim()}`);
    }

    lines.push("Please confirm stock, pickup or delivery, and how to pay after confirmation.");
    return `https://wa.me/${OWNER_WHATSAPP_NUMBER}?text=${encodeURIComponent(lines.join("\n"))}`;
}

async function sendRequest() {
    const items = getRequestItems();
    if (!items.length) {
        alert("Your request list is empty.");
        return;
    }

    const note = document.getElementById("requestNote").value.trim();
    const customer = validateRequestContact();
    const signedInCustomer = window.CalxinSession && window.CalxinSession.isLoggedIn();

    try {
        const response = await window.CalxinApi.createOrder({
            items,
            note,
            subject: "Website Spare Parts Request",
            customer
        });

        localStorage.removeItem(REQUEST_STORAGE_KEY);
        loadRequestList();
        loadSuggestedProducts();

        if (signedInCustomer && response.threadId) {
            window.location.href = `chat.html?thread=${encodeURIComponent(response.threadId)}`;
            return;
        }

        alert("Your request has been sent to admin. Use WhatsApp or phone for the next step.");
    } catch (error) {
        alert(error.message || "Unable to send your request.");
    }
}

function openWhatsapp() {
    const items = getRequestItems();
    if (!items.length) {
        alert("Your request list is empty.");
        return;
    }

    try {
        validateRequestContact();
        const totals = calculateTotals();
        const note = document.getElementById("requestNote").value.trim();
        window.open(buildWhatsappUrl(items, totals.subtotal, note), "_blank");
    } catch (error) {
        alert(error.message || "Add your contact details first.");
    }
}

function addSuggestedToRequest(product) {
    const items = getRequestItems();
    const existing = items.find((item) => Number(item.productId) === Number(product.id));

    if (existing) {
        existing.quantity += 1;
    } else {
        items.push({
            id: Number(product.id),
            productId: Number(product.id),
            name: product.name,
            price: Number(product.price || 0),
            quantity: 1,
            image: resolveImagePath(product.image),
            category: product.category || "General",
            stock: Number(product.stock || 0)
        });
    }

    setRequestItems(items);
    loadRequestList();
    loadSuggestedProducts();
}

function createSuggestedCard(product) {
    const card = document.createElement("div");
    card.className = "suggested-card";

    const stock = Number(product.stock || 0);
    const stockLabel = stock > 0 ? `${stock} in stock` : "Out of stock";

    card.innerHTML = `
        <div class="suggested-card-image">
            <span class="suggested-stock-badge">${stockLabel}</span>
            <img src="${resolveImagePath(product.image)}" alt="${product.name}">
        </div>
        <div class="suggested-card-info">
            <div class="suggested-card-name">${product.name}</div>
            <div class="suggested-card-price">KES ${Number(product.price || 0).toLocaleString()}</div>
            <div class="suggested-card-actions">
                <button class="suggested-card-btn" type="button"${stock <= 0 ? " disabled" : ""}>
                    <i class="fas fa-plus"></i> Add To Request
                </button>
            </div>
        </div>
    `;

    const image = card.querySelector(".suggested-card-image");
    const addButton = card.querySelector(".suggested-card-btn");

    image.addEventListener("click", () => {
        window.location.href = `product-view.html?id=${product.id}`;
    });
    addButton.addEventListener("click", () => addSuggestedToRequest(product));

    return card;
}

async function loadSuggestedProducts() {
    const container = document.getElementById("suggestedProducts");
    if (!container) return;

    container.innerHTML = "";

    try {
        const requestIds = new Set(getRequestItems().map((item) => Number(item.productId)));
        const products = await window.CalxinApi.getProducts({ published: true });
        const suggested = products
            .filter((product) => !requestIds.has(Number(product.id)))
            .slice(0, 8);

        if (!suggested.length) {
            container.innerHTML = "<p style='grid-column:1 / -1; text-align:center; color:#5e7383;'>No more products to suggest right now.</p>";
            return;
        }

        suggested.forEach((product) => {
            container.appendChild(createSuggestedCard(product));
        });
    } catch (error) {
        console.error(error);
        container.innerHTML = "<p style='grid-column:1 / -1; text-align:center; color:#5e7383;'>Unable to load suggestions.</p>";
    }
}

async function refreshCartPage(force = false) {
    try {
        await syncRequestItemsWithCatalog(force);
    } catch (error) {
        console.error(error);
    }

    loadRequestList();
    await loadSuggestedProducts();
}

function bindCatalogSync() {
    const refresh = () => {
        refreshCartPage(true).catch((error) => {
            console.error(error);
        });
    };

    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    window.addEventListener("storage", (event) => {
        if (event.key === CATALOG_SYNC_EVENT_KEY || event.key === REQUEST_STORAGE_KEY) {
            refresh();
        }
    });
    window.addEventListener("calxin-catalog-updated", refresh);
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
            refresh();
        }
    });

    if ("BroadcastChannel" in window) {
        requestSyncChannel = new BroadcastChannel(CATALOG_SYNC_CHANNEL);
        requestSyncChannel.addEventListener("message", refresh);
    }
}

function bindRealtimeCart() {
    if (!window.CalxinApi || typeof window.CalxinApi.subscribeToEvents !== "function") {
        return;
    }

    if (cartRealtimeSource && typeof cartRealtimeSource.close === "function") {
        cartRealtimeSource.close();
    }

    cartRealtimeSource = window.CalxinApi.subscribeToEvents(
        {
            topics: ["catalog"],
            includeToken: false
        },
        {
            onMessage(payload) {
                if (!payload || payload.type === "ready") {
                    return;
                }

                refreshCartPage(true).catch((error) => {
                    console.error(error);
                });
            },
            onError(error) {
                console.error("Cart realtime connection issue:", error);
            }
        }
    );
}

document.addEventListener("DOMContentLoaded", async () => {
    window.CalxinSession.updateAuthUi();
    bindMenuEvents();
    fillContactInputs();
    bindCatalogSync();
    bindRealtimeCart();
    await refreshCartPage(true);

    const inputs = getContactInputs();
    [inputs.name, inputs.phone, inputs.email].forEach((input) => {
        if (!input) return;
        input.addEventListener("input", () => {
            persistGuestContact();
            updateSummary();
        });
    });

    document.getElementById("sendRequestBtn").addEventListener("click", sendRequest);
    document.getElementById("whatsappQuoteBtn").addEventListener("click", openWhatsapp);
});

window.toggleMobileMenu = toggleMobileMenu;
window.closeMobileMenu = closeMobileMenu;

window.addEventListener("beforeunload", () => {
    if (cartRealtimeSource && typeof cartRealtimeSource.close === "function") {
        cartRealtimeSource.close();
    }
});
