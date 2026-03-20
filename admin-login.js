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

async function submitAdminLogin(event) {
    event.preventDefault();

    try {
        await window.CalxinApi.adminLogin({
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
        await window.CalxinApi.getAdminSession();
        window.location.href = getAdminNextUrl();
    } catch (error) {
        // Ignore unauthenticated state and keep the login form visible.
    }
});
