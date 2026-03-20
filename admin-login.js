function getAdminNextUrl() {
    const params = new URLSearchParams(window.location.search);
    const next = String(params.get("next") || "").trim();
    return next || "admin.html";
}

function showAdminAuthFeedback(message, type) {
    const box = document.getElementById("adminAuthFeedback");
    if (!box) return;

    box.textContent = message || "";
    box.className = "auth-feedback";

    if (message) {
        box.classList.add("visible");
        box.classList.add(type || "success");
    }
}

function getAdminApiClient() {
    const candidates = [window.CalxinApi, window.calxinapi];

    for (const candidate of candidates) {
        if (!candidate) {
            continue;
        }

        const adminLogin = candidate.adminLogin || candidate.adminlogin;
        const getAdminSession = candidate.getAdminSession || candidate.getadminsession;

        if (typeof adminLogin === "function") {
            return {
                ...candidate,
                adminLogin,
                getAdminSession
            };
        }
    }

    throw new Error("Admin API client is not loaded. Please refresh the page.");
}

async function submitAdminLogin(event) {
    event.preventDefault();

    try {
        const api = getAdminApiClient();

        await api.adminLogin({
            username: document.getElementById("adminUsername").value.trim(),
            password: document.getElementById("adminPassword").value
        });

        window.location.href = getAdminNextUrl();
    } catch (error) {
        showAdminAuthFeedback(error.message || "Unable to sign in to admin.", "error");
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    const form = document.getElementById("adminLoginForm");
    if (form) {
        form.addEventListener("submit", submitAdminLogin);
    }

    try {
        const api = getAdminApiClient();
        if (typeof api.getAdminSession === "function") {
            await api.getAdminSession();
            window.location.href = getAdminNextUrl();
        }
    } catch (error) {
        // Ignore unauthenticated state and keep the login form visible.
    }
});
