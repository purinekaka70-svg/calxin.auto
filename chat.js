const chatState = {
    threads: [],
    selectedThreadId: null,
    pollTimer: null,
    realtimeSource: null,
    realtimeRefreshTimer: null
};

function showChatNotice(message, type) {
    const box = document.getElementById("chatNotice");
    if (!box) return;

    box.textContent = message || "";
    box.className = "chat-notice";

    if (message) {
        box.classList.add("visible");
        box.classList.add(type || "success");
    }
}

function renderThreadList() {
    const container = document.getElementById("threadList");
    if (!container) return;

    container.innerHTML = "";

    if (!chatState.threads.length) {
        container.innerHTML = "<p style='margin:0;color:#5e7383;'>No conversations yet. Start one from the form above.</p>";
        return;
    }

    chatState.threads.forEach((thread) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `thread-card${Number(thread.id) === Number(chatState.selectedThreadId) ? " active" : ""}`;
        const title = document.createElement("strong");
        title.textContent = thread.subject || "Customer Request";

        const preview = document.createElement("span");
        preview.textContent = thread.lastMessage || "No messages yet.";

        const time = document.createElement("span");
        time.textContent = thread.lastMessageAt ? new Date(thread.lastMessageAt).toLocaleString() : "";

        button.appendChild(title);
        button.appendChild(preview);
        button.appendChild(time);
        button.addEventListener("click", () => {
            selectThread(thread.id);
        });
        container.appendChild(button);
    });
}

function renderEmptyState(show) {
    const emptyState = document.getElementById("chatEmptyState");
    const conversation = document.getElementById("chatConversation");

    if (emptyState) {
        emptyState.classList.toggle("visible", Boolean(show));
    }
    if (conversation) {
        conversation.style.display = show ? "none" : "flex";
    }
}

function renderMessages(payload) {
    const list = document.getElementById("messageList");
    if (!list) return;

    list.innerHTML = "";

    (payload.items || []).forEach((item) => {
        const bubble = document.createElement("article");
        bubble.className = `message-bubble ${item.senderRole === "admin" ? "admin" : "customer"}`;
        const meta = document.createElement("span");
        meta.className = "message-meta";
        meta.textContent = `${item.senderName} · ${new Date(item.createdAt).toLocaleString()}`;

        const content = document.createElement("div");
        content.textContent = item.message;

        bubble.appendChild(meta);
        bubble.appendChild(content);
        list.appendChild(bubble);
    });

    list.scrollTop = list.scrollHeight;

    const thread = payload.thread || {};
    document.getElementById("activeThreadTitle").textContent = thread.subject || "Customer Request";
    document.getElementById("activeThreadMeta").textContent = thread.orderId
        ? `Order ORD-${thread.orderId} · ${thread.orderTotal ? `KES ${Number(thread.orderTotal).toLocaleString()}` : "Pending total"}`
        : "General support chat";
    document.getElementById("activeThreadStatus").textContent = thread.status || "Open";
}

async function loadThreads(preferredThreadId) {
    const threads = await window.CalxinApi.getChatThreads();
    chatState.threads = threads;
    renderThreadList();

    if (!threads.length) {
        renderEmptyState(true);
        return;
    }

    const requested = Number(preferredThreadId || chatState.selectedThreadId || new URLSearchParams(window.location.search).get("thread") || 0);
    const match = threads.find((thread) => Number(thread.id) === requested) || threads[0];
    await selectThread(match.id, false);
}

async function selectThread(threadId, rerender = true) {
    chatState.selectedThreadId = Number(threadId);
    if (rerender) {
        renderThreadList();
    }

    renderEmptyState(false);
    const payload = await window.CalxinApi.getChatMessages(threadId);
    renderMessages(payload);
}

async function createNewChat(event) {
    event.preventDefault();

    try {
        const thread = await window.CalxinApi.createChatThread({
            subject: document.getElementById("newChatSubject").value.trim(),
            message: document.getElementById("newChatMessage").value.trim()
        });

        document.getElementById("newChatForm").reset();
        await loadThreads(thread.id);
        showChatNotice("Live chat opened.", "success");
    } catch (error) {
        showChatNotice(error.message || "Unable to open the chat.", "error");
    }
}

async function sendMessage(event) {
    event.preventDefault();

    if (!chatState.selectedThreadId) {
        showChatNotice("Select a chat thread first.", "error");
        return;
    }

    const input = document.getElementById("messageInput");
    const message = String(input.value || "").trim();
    if (!message) return;

    try {
        await window.CalxinApi.sendChatMessage(chatState.selectedThreadId, { message });
        input.value = "";
        await selectThread(chatState.selectedThreadId);
        await loadThreads(chatState.selectedThreadId);
    } catch (error) {
        showChatNotice(error.message || "Unable to send the message.", "error");
    }
}

function scheduleRealtimeChatRefresh() {
    if (chatState.realtimeRefreshTimer) {
        return;
    }

    chatState.realtimeRefreshTimer = window.setTimeout(async () => {
        chatState.realtimeRefreshTimer = null;

        try {
            await loadThreads(chatState.selectedThreadId);
        } catch (error) {
            console.error("Chat realtime refresh failed:", error);
        }
    }, 150);
}

function bindRealtimeChat() {
    const session = window.CalxinSession.getSession();
    const token = session && session.token ? String(session.token) : "";

    if (!token || !window.CalxinApi || typeof window.CalxinApi.subscribeToEvents !== "function") {
        return;
    }

    if (chatState.realtimeSource && typeof chatState.realtimeSource.close === "function") {
        chatState.realtimeSource.close();
    }

    chatState.realtimeSource = window.CalxinApi.subscribeToEvents(
        {
            topics: ["chat"],
            token
        },
        {
            onMessage(payload) {
                if (!payload || payload.type === "ready") {
                    return;
                }

                scheduleRealtimeChatRefresh();
            },
            onError(error) {
                console.error("Chat realtime connection issue:", error);
            }
        }
    );
}

function startPolling() {
    if (chatState.realtimeSource) {
        return;
    }

    stopPolling();
    chatState.pollTimer = window.setInterval(async () => {
        try {
            await loadThreads(chatState.selectedThreadId);
        } catch (error) {
            console.error(error);
        }
    }, 15000);
}

function stopPolling() {
    if (chatState.pollTimer) {
        window.clearInterval(chatState.pollTimer);
        chatState.pollTimer = null;
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    const customer = window.CalxinSession.requireCustomer("chat.html");
    if (!customer) return;

    window.CalxinSession.updateAuthUi();
    renderEmptyState(true);

    document.getElementById("newChatForm").addEventListener("submit", createNewChat);
    document.getElementById("messageForm").addEventListener("submit", sendMessage);
    document.getElementById("refreshThreadsBtn").addEventListener("click", async () => {
        try {
            await loadThreads(chatState.selectedThreadId);
            showChatNotice("Chat updated.", "success");
        } catch (error) {
            showChatNotice(error.message || "Unable to refresh chat.", "error");
        }
    });

    try {
        await loadThreads();
        bindRealtimeChat();
        startPolling();
    } catch (error) {
        showChatNotice(error.message || "Unable to load your live chat.", "error");
    }
});

window.addEventListener("beforeunload", () => {
    stopPolling();
    if (chatState.realtimeSource && typeof chatState.realtimeSource.close === "function") {
        chatState.realtimeSource.close();
    }
});
