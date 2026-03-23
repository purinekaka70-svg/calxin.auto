const PRODUCT_CATEGORIES = [
    "Engines",
    "Transmissions",
    "Brakes",
    "Electrical",
    "Cooling",
    "Filters",
    "Ignition",
    "Fuel System",
    "Suspension",
    "Steering",
    "Tyres",
    "Wheels",
    "Accessories",
    "Audio",
    "Lighting",
    "HVAC",
    "Oils & Fluids",
    "Tools"
];

const adminState = {
    products: [],
    posts: [],
    images: [],
    orders: [],
    chats: [],
    editingProductId: null,
    editingPostId: null,
    editingImageId: null,
    selectedChatId: null,
    activeChat: null,
    activeChatMessages: [],
    chatPollTimer: null
};

const CATALOG_SYNC_EVENT_KEY = "calxinCatalogUpdatedAt";
const CATALOG_SYNC_CHANNEL = "calxin-catalog";
let catalogSyncChannel = null;
let adminRealtimeSource = null;
let adminRealtimeRefreshTimer = null;

function getAdminApi() {
    const candidates = [window.CalxinApi, window.calxinapi];

    for (const candidate of candidates) {
        if (candidate) {
            return candidate;
        }
    }

    throw new Error("Catalog API client is not available.");
}

function redirectToAdminLogin() {
    window.location.href = `admin-login.html?next=${encodeURIComponent("admin.html")}`;
}

function handleAdminError(error, fallbackMessage) {
    const message = error && error.message ? error.message : fallbackMessage;

    if (/admin sign-in required/i.test(String(message || ""))) {
        redirectToAdminLogin();
        return;
    }

    showStatus(message || fallbackMessage, "error");
}

function showStatus(message, type = "info") {
    const banner = document.getElementById("adminStatus");
    if (!banner) return;

    banner.textContent = message || "";
    banner.className = "admin-status";
    if (message) {
        banner.classList.add("visible");
        banner.classList.add(type);
    }
}

function clearStatus() {
    showStatus("");
}

function notifyCatalogUpdated(scope = "catalog") {
    const payload = {
        scope,
        updatedAt: new Date().toISOString()
    };

    try {
        window.localStorage.setItem(CATALOG_SYNC_EVENT_KEY, JSON.stringify(payload));
    } catch (error) {
        // Ignore storage write failures and still try the other sync paths.
    }

    if ("BroadcastChannel" in window) {
        catalogSyncChannel = catalogSyncChannel || new BroadcastChannel(CATALOG_SYNC_CHANNEL);
        catalogSyncChannel.postMessage(payload);
    }

    window.dispatchEvent(new CustomEvent("calxin-catalog-updated", { detail: payload }));
}

function scheduleAdminRealtimeRefresh() {
    if (adminRealtimeRefreshTimer) {
        return;
    }

    adminRealtimeRefreshTimer = window.setTimeout(async () => {
        adminRealtimeRefreshTimer = null;

        try {
            await refreshAllData();
        } catch (error) {
            console.error("Admin realtime refresh failed:", error);
        }
    }, 180);
}

function bindAdminRealtime() {
    const api = getAdminApi();

    if (adminRealtimeSource && typeof adminRealtimeSource.close === "function") {
        adminRealtimeSource.close();
    }

    if (typeof api.subscribeToEvents !== "function") {
        return;
    }

    adminRealtimeSource = api.subscribeToEvents(
        {
            admin: true,
            includeToken: false,
            topics: ["catalog", "media", "orders", "chat"]
        },
        {
            onMessage(payload) {
                if (!payload || payload.type === "ready") {
                    return;
                }

                scheduleAdminRealtimeRefresh();
            },
            onError(error) {
                console.error("Admin realtime connection issue:", error);
            }
        }
    );
}

function getAdminBackendLabel(health) {
    return health && health.storage === "mysql"
        ? "MySQL backend"
        : "local catalog backend";
}

function showSection(sectionId, navEl) {
    document.querySelectorAll(".section").forEach((section) => {
        section.classList.remove("active");
    });

    document.querySelectorAll(".nav-item").forEach((item) => {
        item.classList.remove("active");
    });

    const activeSection = document.getElementById(sectionId);
    if (activeSection) {
        activeSection.classList.add("active");
    }

    if (navEl) {
        navEl.classList.add("active");
    }

    if (sectionId === "chats") {
        startAdminChatPolling();
    } else {
        stopAdminChatPolling();
    }

    if (sectionId === "orders") {
        loadOrdersTable();
    }

    if (sectionId === "chats") {
        loadChatsSection();
    }
}

function getPreferredAdminChatId(explicitChatId = null) {
    const preferred = explicitChatId ?? adminState.selectedChatId;
    return preferred ? Number(preferred) : null;
}

function populateCategories() {
    const select = document.getElementById("productCategory");
    if (!select || select.options.length > 0) return;

    PRODUCT_CATEGORIES.forEach((category) => {
        const option = document.createElement("option");
        option.value = category;
        option.textContent = category;
        select.appendChild(option);
    });
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Unable to read the selected file."));
        reader.readAsDataURL(file);
    });
}

async function buildImagePayload(fileInputId, urlInputId, existingUrl = "") {
    const fileInput = document.getElementById(fileInputId);
    const urlInput = document.getElementById(urlInputId);
    const selectedFile = fileInput && fileInput.files ? fileInput.files[0] : null;
    const manualUrl = urlInput ? String(urlInput.value || "").trim() : "";

    if (selectedFile) {
        return {
            imageDataUrl: await readFileAsDataUrl(selectedFile),
            imageFileName: selectedFile.name
        };
    }

    return {
        imageUrl: manualUrl || existingUrl || ""
    };
}

function loadDashboard() {
    const openChats = adminState.chats.filter((chat) => !["Resolved", "Closed"].includes(chat.status)).length;

    document.getElementById("totalProducts").textContent = String(adminState.products.length);
    document.getElementById("totalPosts").textContent = String(adminState.posts.length);
    document.getElementById("totalImages").textContent = String(adminState.images.length);
    document.getElementById("totalOrders").textContent = String(adminState.orders.length);
    const totalChats = document.getElementById("totalChats");
    if (totalChats) {
        totalChats.textContent = String(openChats);
    }
}

async function refreshAllData() {
    const api = getAdminApi();
    const [products, posts, images, orders, chats] = await Promise.all([
        api.getProducts(),
        api.getPosts(),
        api.getMedia(),
        api.getOrders(),
        api.getChatThreads({ admin: true })
    ]);

    adminState.products = products;
    adminState.posts = posts;
    adminState.images = images;
    adminState.orders = orders;
    adminState.chats = chats;

    renderProductsTable();
    renderPostsTable();
    renderImagesGallery();
    renderOrdersTable();
    renderChatThreads();
    renderActiveChat();
    loadDashboard();
}

function showAddProductForm() {
    adminState.editingProductId = null;
    document.getElementById("productName").value = "";
    document.getElementById("productPrice").value = "";
    document.getElementById("productCategory").value = PRODUCT_CATEGORIES[0];
    document.getElementById("productStock").value = "";
    document.getElementById("productImage").value = "";
    document.getElementById("productImageFile").value = "";
    document.getElementById("productDescription").value = "";
    document.getElementById("productDocumentUrl").value = "";
    document.getElementById("productDocumentProvider").value = "";
    document.getElementById("productRating").value = "4.5";
    document.getElementById("productPublished").value = "1";
    document.getElementById("productForm").style.display = "block";
    clearStatus();
}

function hideAddProductForm() {
    document.getElementById("productForm").style.display = "none";
}

async function saveProduct(event) {
    event.preventDefault();

    try {
        const api = getAdminApi();
        const existing = adminState.products.find((item) => Number(item.id) === Number(adminState.editingProductId));
        const imagePayload = await buildImagePayload("productImageFile", "productImage", existing ? existing.image : "");

        const savedProduct = await api.saveProduct({
            id: adminState.editingProductId || undefined,
            name: document.getElementById("productName").value.trim(),
            price: Number(document.getElementById("productPrice").value || 0),
            category: document.getElementById("productCategory").value,
            stock: Number(document.getElementById("productStock").value || 0),
            description: document.getElementById("productDescription").value.trim(),
            documentUrl: document.getElementById("productDocumentUrl").value.trim(),
            documentProvider: document.getElementById("productDocumentProvider").value,
            rating: Number(document.getElementById("productRating").value || 4.5),
            published: Number(document.getElementById("productPublished").value || 1),
            ...imagePayload
        });

        hideAddProductForm();
        await loadProductsTable().catch(() => null);
        if (savedProduct && !adminState.products.some((item) => Number(item.id) === Number(savedProduct.id))) {
            adminState.products = [
                savedProduct,
                ...adminState.products.filter((item) => Number(item.id) !== Number(savedProduct.id))
            ];
            renderProductsTable();
            loadDashboard();
        }
        await loadImagesGallery();
        notifyCatalogUpdated("products");
        showStatus(
            adminState.editingProductId ? "Product updated." : "Product created.",
            "success"
        );
        adminState.editingProductId = null;
    } catch (error) {
        handleAdminError(error, "Unable to save the product.");
    }
}

function editProduct(id) {
    const product = adminState.products.find((item) => Number(item.id) === Number(id));
    if (!product) return;

    adminState.editingProductId = product.id;
    document.getElementById("productName").value = product.name || "";
    document.getElementById("productPrice").value = String(product.price || "");
    document.getElementById("productCategory").value = product.category || PRODUCT_CATEGORIES[0];
    document.getElementById("productStock").value = String(product.stock || 0);
    document.getElementById("productImage").value = product.image || "";
    document.getElementById("productImageFile").value = "";
    document.getElementById("productDescription").value = product.description || "";
    document.getElementById("productDocumentUrl").value = product.documentUrl || "";
    document.getElementById("productDocumentProvider").value = product.documentProvider || "";
    document.getElementById("productRating").value = String(product.rating || 4.5);
    document.getElementById("productPublished").value = product.published ? "1" : "0";
    document.getElementById("productForm").style.display = "block";
    clearStatus();
}

async function deleteProduct(id) {
    if (!confirm("Delete this product?")) return;

    try {
        const api = getAdminApi();
        await api.deleteProduct(id);
        await loadProductsTable();
        await loadImagesGallery();
        notifyCatalogUpdated("products");
        showStatus("Product deleted.", "success");
    } catch (error) {
        handleAdminError(error, "Unable to delete the product.");
    }
}

function renderProductsTable() {
    const tbody = document.getElementById("productsTableBody");
    tbody.innerHTML = "";

    if (!adminState.products.length) {
        const row = document.createElement("tr");
        row.innerHTML = "<td colspan='6' style='text-align:center;color:#777;'>No products found.</td>";
        tbody.appendChild(row);
        loadDashboard();
        return;
    }

    adminState.products.forEach((product) => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${product.name}</td>
            <td>${product.category}</td>
            <td>KES ${Number(product.price || 0).toLocaleString()}</td>
            <td>${Number(product.stock || 0)}</td>
            <td>⭐ ${Number(product.rating || 0).toFixed(1)}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-edit" onclick="editProduct(${product.id})">Edit</button>
                    <button class="btn btn-danger" onclick="deleteProduct(${product.id})">Delete</button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

async function loadProductsTable() {
    const api = getAdminApi();
    adminState.products = await api.getProducts();
    renderProductsTable();
    loadDashboard();
}

function showAddPostForm() {
    adminState.editingPostId = null;
    document.getElementById("postTitle").value = "";
    document.getElementById("postContent").value = "";
    document.getElementById("postExcerpt").value = "";
    document.getElementById("postImage").value = "";
    document.getElementById("postImageFile").value = "";
    document.getElementById("postDocumentUrl").value = "";
    document.getElementById("postDocumentProvider").value = "";
    document.getElementById("postPublished").value = "1";
    document.getElementById("postForm").style.display = "block";
    clearStatus();
}

function hideAddPostForm() {
    document.getElementById("postForm").style.display = "none";
}

async function savePost(event) {
    event.preventDefault();

    try {
        const api = getAdminApi();
        const existing = adminState.posts.find((item) => Number(item.id) === Number(adminState.editingPostId));
        const imagePayload = await buildImagePayload("postImageFile", "postImage", existing ? existing.image : "");

        await api.savePost({
            id: adminState.editingPostId || undefined,
            title: document.getElementById("postTitle").value.trim(),
            content: document.getElementById("postContent").value.trim(),
            excerpt: document.getElementById("postExcerpt").value.trim(),
            documentUrl: document.getElementById("postDocumentUrl").value.trim(),
            documentProvider: document.getElementById("postDocumentProvider").value,
            published: Number(document.getElementById("postPublished").value || 1),
            ...imagePayload
        });

        hideAddPostForm();
        await loadPostsTable();
        await loadImagesGallery();
        notifyCatalogUpdated("posts");
        showStatus(
            adminState.editingPostId ? "Post updated." : "Post created.",
            "success"
        );
        adminState.editingPostId = null;
    } catch (error) {
        handleAdminError(error, "Unable to save the post.");
    }
}

function editPost(id) {
    const post = adminState.posts.find((item) => Number(item.id) === Number(id));
    if (!post) return;

    adminState.editingPostId = post.id;
    document.getElementById("postTitle").value = post.title || "";
    document.getElementById("postContent").value = post.content || "";
    document.getElementById("postExcerpt").value = post.excerpt || "";
    document.getElementById("postImage").value = post.image || "";
    document.getElementById("postImageFile").value = "";
    document.getElementById("postDocumentUrl").value = post.documentUrl || "";
    document.getElementById("postDocumentProvider").value = post.documentProvider || "";
    document.getElementById("postPublished").value = post.published ? "1" : "0";
    document.getElementById("postForm").style.display = "block";
    clearStatus();
}

async function deletePost(id) {
    if (!confirm("Delete this post?")) return;

    try {
        const api = getAdminApi();
        await api.deletePost(id);
        await loadPostsTable();
        await loadImagesGallery();
        notifyCatalogUpdated("posts");
        showStatus("Post deleted.", "success");
    } catch (error) {
        handleAdminError(error, "Unable to delete the post.");
    }
}

function renderPostsTable() {
    const tbody = document.getElementById("postsTableBody");
    tbody.innerHTML = "";

    if (!adminState.posts.length) {
        const row = document.createElement("tr");
        row.innerHTML = "<td colspan='4' style='text-align:center;color:#777;'>No posts found.</td>";
        tbody.appendChild(row);
        loadDashboard();
        return;
    }

    adminState.posts.forEach((post) => {
        const preview = (post.excerpt || post.content || "").slice(0, 70);
        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${post.title}</td>
            <td>${new Date(post.updatedAt || post.createdAt || Date.now()).toLocaleDateString()}</td>
            <td>${preview}${preview.length >= 70 ? "..." : ""}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-edit" onclick="editPost(${post.id})">Edit</button>
                    <button class="btn btn-danger" onclick="deletePost(${post.id})">Delete</button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

async function loadPostsTable() {
    const api = getAdminApi();
    adminState.posts = await api.getPosts();
    renderPostsTable();
    loadDashboard();
}

function showUploadImageForm() {
    adminState.editingImageId = null;
    document.getElementById("imageName").value = "";
    document.getElementById("imageFile").value = "";
    document.getElementById("imageUrl").value = "";
    document.getElementById("imageDescription").value = "";
    document.getElementById("imageCategory").value = "product";
    document.getElementById("imagePreview").src = "";
    document.getElementById("imagePreviewContainer").style.display = "none";
    document.getElementById("imageForm").style.display = "block";
    clearStatus();
}

function hideUploadImageForm() {
    document.getElementById("imageForm").style.display = "none";
}

function editImage(id) {
    const image = adminState.images.find((item) => Number(item.id) === Number(id));
    if (!image) return;

    adminState.editingImageId = image.id;
    document.getElementById("imageName").value = image.name || "";
    document.getElementById("imageFile").value = "";
    document.getElementById("imageUrl").value = image.url || "";
    document.getElementById("imageDescription").value = image.description || "";
    document.getElementById("imageCategory").value = image.category || "product";
    document.getElementById("imagePreview").src = image.url || "";
    document.getElementById("imagePreviewContainer").style.display = image.url ? "block" : "none";
    document.getElementById("imageForm").style.display = "block";
    clearStatus();
}

async function saveImage(event) {
    event.preventDefault();

    try {
        const api = getAdminApi();
        const existing = adminState.images.find((item) => Number(item.id) === Number(adminState.editingImageId));
        const imagePayload = await buildImagePayload("imageFile", "imageUrl", existing ? existing.url : "");

        await api.saveMedia({
            id: adminState.editingImageId || undefined,
            name: document.getElementById("imageName").value.trim(),
            description: document.getElementById("imageDescription").value.trim(),
            category: document.getElementById("imageCategory").value,
            fileName: document.getElementById("imageFile").files[0]
                ? document.getElementById("imageFile").files[0].name
                : "",
            url: imagePayload.imageUrl || "",
            dataUrl: imagePayload.imageDataUrl || ""
        });

        hideUploadImageForm();
        await loadImagesGallery();
        showStatus(
            adminState.editingImageId ? "Image updated." : "Image saved.",
            "success"
        );
        adminState.editingImageId = null;
    } catch (error) {
        handleAdminError(error, "Unable to save the image.");
    }
}

async function deleteImage(id) {
    if (!confirm("Delete this image?")) return;

    try {
        const api = getAdminApi();
        await api.deleteMedia(id);
        await loadImagesGallery();
        showStatus("Image deleted.", "success");
    } catch (error) {
        handleAdminError(error, "Unable to delete the image.");
    }
}

function renderImagesGallery() {
    const gallery = document.getElementById("imagesGallery");
    gallery.innerHTML = "";

    if (!adminState.images.length) {
        gallery.innerHTML = "<p style='text-align:center;color:#777;padding:36px;'>No images found.</p>";
        loadDashboard();
        return;
    }

    adminState.images.forEach((image) => {
        const card = document.createElement("div");
        card.className = "image-card";
        card.innerHTML = `
            <div class="image-card-media">
                <img src="${image.url}" alt="${image.name}" class="image-card-img">
            </div>
            <div class="image-card-info">
                <div class="image-card-name">${image.name}</div>
                <div class="image-card-category">${image.category}</div>
                <div class="image-card-actions">
                    <button class="btn btn-edit" onclick="editImage(${image.id})">Edit</button>
                    <button class="btn btn-danger" onclick="deleteImage(${image.id})">Delete</button>
                </div>
            </div>
        `;
        gallery.appendChild(card);
    });
}

async function loadImagesGallery() {
    const api = getAdminApi();
    adminState.images = await api.getMedia();
    renderImagesGallery();
    loadDashboard();
}

function renderOrdersTable() {
    const tbody = document.getElementById("ordersTableBody");
    tbody.innerHTML = "";

    if (!adminState.orders.length) {
        tbody.innerHTML = "<tr><td colspan='6' style='text-align:center;color:#777;'>No orders found.</td></tr>";
        loadDashboard();
        return;
    }

    adminState.orders.forEach((order) => {
        const createdAt = new Date(order.created_at || order.createdAt || Date.now());
        const customerBits = [
            order.customer_name || "Customer",
            order.customer_phone || "",
            order.customer_email || ""
        ].filter(Boolean);
        const row = document.createElement("tr");
        row.innerHTML = `
            <td>ORD-${order.id}</td>
            <td>${createdAt.toLocaleDateString()}</td>
            <td>${customerBits.join(" • ")}</td>
            <td>${Array.isArray(order.items) ? order.items.length : 0} Items</td>
            <td>KES ${Number(order.total_amount || 0).toLocaleString()}</td>
            <td>
                <select class="order-status-select" onchange="updateOrderStatus(${order.id}, this.value)">
                    <option value="Pending"${order.status === "Pending" ? " selected" : ""}>Pending</option>
                    <option value="Processing"${order.status === "Processing" ? " selected" : ""}>Processing</option>
                    <option value="Completed"${order.status === "Completed" ? " selected" : ""}>Completed</option>
                    <option value="Cancelled"${order.status === "Cancelled" ? " selected" : ""}>Cancelled</option>
                </select>
            </td>
        `;
        tbody.appendChild(row);
    });
}

async function loadOrdersTable() {
    const api = getAdminApi();
    adminState.orders = await api.getOrders();
    renderOrdersTable();
    loadDashboard();
}

async function updateOrderStatus(orderId, status) {
    try {
        const api = getAdminApi();
        await api.updateOrderStatus(orderId, status);
        await loadOrdersTable();
        showStatus(`Request ${orderId} updated to ${status}.`, "success");
    } catch (error) {
        handleAdminError(error, "Unable to update the order status.");
    }
}

function renderChatThreads() {
    const container = document.getElementById("adminChatThreads");
    if (!container) return;

    container.innerHTML = "";

    if (!adminState.chats.length) {
        container.innerHTML = "<p style='color:#777; margin:0;'>No customer chats yet.</p>";
        return;
    }

    adminState.chats.forEach((chat) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `admin-chat-thread${Number(chat.id) === Number(adminState.selectedChatId) ? " active" : ""}`;
        const title = document.createElement("strong");
        title.textContent = chat.subject;

        const customer = document.createElement("span");
        customer.textContent = `${chat.customerName || "Customer"}${chat.customerPhone ? ` · ${chat.customerPhone}` : ""}`;

        const preview = document.createElement("span");
        preview.textContent = chat.lastMessage || "No messages yet.";

        const time = document.createElement("span");
        time.textContent = chat.lastMessageAt ? new Date(chat.lastMessageAt).toLocaleString() : "";

        button.appendChild(title);
        button.appendChild(customer);
        button.appendChild(preview);
        button.appendChild(time);
        button.addEventListener("click", () => {
            selectAdminChat(chat.id);
        });
        container.appendChild(button);
    });
}

function renderActiveChat() {
    const messageBox = document.getElementById("adminChatMessages");
    const replyInput = document.getElementById("adminChatReply");
    const statusSelect = document.getElementById("adminChatStatus");

    if (!messageBox || !replyInput || !statusSelect) return;

    if (!adminState.activeChat) {
        document.getElementById("adminActiveChatTitle").textContent = "Select a chat thread";
        document.getElementById("adminActiveChatMeta").textContent = "Open a conversation to view order details and reply.";
        messageBox.className = "admin-chat-messages empty";
        messageBox.innerHTML = "<p>Select a customer chat from the left.</p>";
        replyInput.disabled = true;
        statusSelect.disabled = true;
        statusSelect.value = "Open";
        return;
    }

    const chat = adminState.activeChat;
    document.getElementById("adminActiveChatTitle").textContent = chat.subject;
    document.getElementById("adminActiveChatMeta").textContent = chat.orderId
        ? `Order ORD-${chat.orderId} · ${chat.customerName || "Customer"} · ${chat.customerPhone || "No phone"}`
        : `${chat.customerName || "Customer"} · ${chat.customerPhone || "No phone"}`;
    statusSelect.disabled = false;
    statusSelect.value = chat.status || "Open";
    replyInput.disabled = false;

    messageBox.className = "admin-chat-messages";
    messageBox.innerHTML = "";

    adminState.activeChatMessages.forEach((item) => {
        const bubble = document.createElement("article");
        bubble.className = `admin-chat-bubble ${item.senderRole === "admin" ? "admin" : "customer"}`;

        const meta = document.createElement("span");
        meta.className = "admin-chat-meta";
        meta.textContent = `${item.senderName} · ${new Date(item.createdAt).toLocaleString()}`;

        const content = document.createElement("div");
        content.textContent = item.message;

        bubble.appendChild(meta);
        bubble.appendChild(content);
        messageBox.appendChild(bubble);
    });

    messageBox.scrollTop = messageBox.scrollHeight;
}

async function loadChatsSection(explicitChatId = null) {
    try {
        const api = getAdminApi();
        adminState.chats = await api.getChatThreads({ admin: true });
        renderChatThreads();
        loadDashboard();

        if (!adminState.chats.length) {
            adminState.selectedChatId = null;
            adminState.activeChat = null;
            adminState.activeChatMessages = [];
            renderActiveChat();
            return;
        }

        const preferredChatId = getPreferredAdminChatId(explicitChatId);
        const preferred = adminState.chats.find((item) => Number(item.id) === Number(preferredChatId))
            || adminState.chats[0];
        await selectAdminChat(preferred.id, false);
    } catch (error) {
        handleAdminError(error, "Unable to load chats.");
    }
}

async function selectAdminChat(chatId, rerenderThreads = true) {
    try {
        const api = getAdminApi();
        const payload = await api.getChatMessages(chatId, { admin: true });
        adminState.selectedChatId = Number(chatId);
        adminState.activeChat = payload.thread || null;
        adminState.activeChatMessages = payload.items || [];

        if (rerenderThreads) {
            renderChatThreads();
        }

        renderActiveChat();
    } catch (error) {
        handleAdminError(error, "Unable to load the selected chat.");
    }
}

async function sendAdminChatMessage(event) {
    event.preventDefault();

    if (!adminState.selectedChatId) {
        showStatus("Select a chat thread first.", "error");
        return;
    }

    const input = document.getElementById("adminChatReply");
    const message = String(input.value || "").trim();
    if (!message) {
        return;
    }

    try {
        const api = getAdminApi();
        await api.sendChatMessage(
            adminState.selectedChatId,
            { message, senderName: "Calxin Auto Support" },
            { admin: true }
        );

        input.value = "";
        await loadChatsSection(adminState.selectedChatId);
        showStatus("Reply sent.", "success");
    } catch (error) {
        handleAdminError(error, "Unable to send the reply.");
    }
}

async function updateAdminChatStatus(status) {
    if (!adminState.selectedChatId) {
        return;
    }

    try {
        const api = getAdminApi();
        await api.updateChatStatus(adminState.selectedChatId, status);
        await loadChatsSection(adminState.selectedChatId);
        showStatus(`Chat updated to ${status}.`, "success");
    } catch (error) {
        handleAdminError(error, "Unable to update the chat status.");
    }
}

function startAdminChatPolling() {
    if (adminRealtimeSource) {
        return;
    }

    stopAdminChatPolling();

    adminState.chatPollTimer = window.setInterval(async () => {
        const chatsSection = document.getElementById("chats");
        if (!chatsSection || !chatsSection.classList.contains("active")) {
            return;
        }

        try {
            await loadChatsSection(adminState.selectedChatId);
        } catch (error) {
            console.error(error);
        }
    }, 15000);
}

function stopAdminChatPolling() {
    if (adminState.chatPollTimer) {
        window.clearInterval(adminState.chatPollTimer);
        adminState.chatPollTimer = null;
    }
}

async function logoutAdmin() {
    try {
        const api = getAdminApi();
        await api.adminLogout();
    } catch (error) {
        console.error(error);
    }

    redirectToAdminLogin();
}

async function changeAdminPassword() {
    const currentPass = prompt("Enter your CURRENT password:");
    if (!currentPass) return;

    const newPass = prompt("Enter your NEW password (min 6 chars):");
    if (!newPass) return;

    try {
        const api = getAdminApi();
        await api.changeAdminPassword(currentPass, newPass);
        alert("Password changed successfully. Please login again.");
        logoutAdmin();
    } catch (error) {
        alert(error.message || "Failed to change password.");
    }
}

function bindImagePreview() {
    const imageFileInput = document.getElementById("imageFile");
    if (!imageFileInput) return;

    imageFileInput.addEventListener("change", async () => {
        const file = imageFileInput.files ? imageFileInput.files[0] : null;
        const preview = document.getElementById("imagePreview");
        const container = document.getElementById("imagePreviewContainer");

        if (!file) {
            preview.src = "";
            container.style.display = "none";
            return;
        }

        try {
            preview.src = await readFileAsDataUrl(file);
            container.style.display = "block";
        } catch (error) {
            showStatus(error.message || "Unable to preview the image.", "error");
        }
    });
}

document.addEventListener("DOMContentLoaded", async () => {
    populateCategories();
    bindImagePreview();

    // Prevent running dashboard logic if this script is included on the login page
    if (window.location.pathname.indexOf("admin-login") !== -1) {
        return;
    }

    // Inject Change Password button next to logout if possible
    const headerRight = document.querySelector(".header-right");
    if (headerRight) {
                const changeBtn = document.createElement("button");
                changeBtn.id = "changePasswordBtn";
                changeBtn.textContent = "Change Password";
                changeBtn.className = "btn";        changeBtn.style.marginRight = "10px";
        changeBtn.style.backgroundColor = "#444";
        changeBtn.style.color = "#fff";
        changeBtn.onclick = changeAdminPassword;

        // Insert before the last child (usually logout)
        headerRight.insertBefore(changeBtn, headerRight.firstChild);
    }

    try {
        const api = getAdminApi();
        if (typeof api.getAdminSession === "function") {
            await api.getAdminSession();
            const health = typeof api.getHealth === "function"
                ? await api.getHealth().catch(() => null)
                : null;
            await refreshAllData();
            bindAdminRealtime();
            showStatus(`Admin data loaded from ${getAdminBackendLabel(health)}.`, "success");
        } else {
            throw new Error("Calxin API client not loaded for admin dashboard. Please refresh.");
        }
    } catch (error) {
        handleAdminError(error, "Unable to load admin data.");
    }
});

window.showSection = showSection;
window.showAddProductForm = showAddProductForm;
window.hideAddProductForm = hideAddProductForm;
window.saveProduct = saveProduct;
window.editProduct = editProduct;
window.deleteProduct = deleteProduct;
window.showAddPostForm = showAddPostForm;
window.hideAddPostForm = hideAddPostForm;
window.savePost = savePost;
window.editPost = editPost;
window.deletePost = deletePost;
window.showUploadImageForm = showUploadImageForm;
window.hideUploadImageForm = hideUploadImageForm;
window.saveImage = saveImage;
window.editImage = editImage;
window.deleteImage = deleteImage;
window.updateOrderStatus = updateOrderStatus;
window.loadChatsSection = loadChatsSection;
window.sendAdminChatMessage = sendAdminChatMessage;
window.updateAdminChatStatus = updateAdminChatStatus;
window.logoutAdmin = logoutAdmin;
window.changeAdminPassword = changeAdminPassword;

window.addEventListener("beforeunload", () => {
    stopAdminChatPolling();
    if (adminRealtimeSource && typeof adminRealtimeSource.close === "function") {
        adminRealtimeSource.close();
    }
});
