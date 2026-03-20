function getNextUrl() {
    const params = new URLSearchParams(window.location.search);
    const next = String(params.get("next") || "").trim();
    return next || "chat.html";
}

function showAuthFeedback(message, type) {
    const box = document.getElementById("authFeedback");
    if (!box) return;

    box.textContent = message || "";
    box.className = "auth-feedback";

    if (message) {
        box.classList.add("visible");
        box.classList.add(type || "success");
    }
}

function setView(view) {
    const loginForm = document.getElementById("loginForm");
    const signupForm = document.getElementById("signupForm");

    document.querySelectorAll(".tab-btn").forEach((button) => {
        button.classList.toggle("active", button.dataset.view === view);
    });

    if (loginForm) {
        loginForm.classList.toggle("hidden", view !== "login");
    }
    if (signupForm) {
        signupForm.classList.toggle("hidden", view !== "signup");
    }

    showAuthFeedback("");
}

function updateRequestCenterShortcut() {
    const shortcut = document.getElementById("requestCenterShortcut");
    if (!shortcut || !window.CalxinSession) return;

    shortcut.textContent = window.CalxinSession.isLoggedIn()
        ? "Open request center"
        : "Create request account";
}

function openRequestCenterShortcut() {
    if (!window.CalxinSession) return;

    if (window.CalxinSession.isLoggedIn()) {
        window.location.href = "cart.html";
        return;
    }

    setView("signup");
    const signupName = document.getElementById("signupName");
    if (signupName) {
        signupName.focus();
    }
}

async function submitLogin(event) {
    event.preventDefault();

    try {
        const response = await window.CalxinApi.login({
            email: document.getElementById("loginEmail").value.trim(),
            password: document.getElementById("loginPassword").value
        });

        window.CalxinSession.setSession({
            token: response.token,
            customer: response.customer
        });
        updateRequestCenterShortcut();

        window.location.href = getNextUrl();
    } catch (error) {
        showAuthFeedback(error.message || "Unable to sign you in.", "error");
    }
}

async function submitSignup(event) {
    event.preventDefault();

    try {
        const response = await window.CalxinApi.register({
            name: document.getElementById("signupName").value.trim(),
            email: document.getElementById("signupEmail").value.trim(),
            phone: document.getElementById("signupPhone").value.trim(),
            password: document.getElementById("signupPassword").value
        });

        window.CalxinSession.setSession({
            token: response.token,
            customer: response.customer
        });
        updateRequestCenterShortcut();

        window.location.href = getNextUrl();
    } catch (error) {
        showAuthFeedback(error.message || "Unable to create your account.", "error");
    }
}

async function logoutCustomer() {
    try {
        await window.CalxinApi.logout();
    } catch (error) {
        console.error(error);
    }

    window.CalxinSession.clearSession();
    updateRequestCenterShortcut();
    showAuthFeedback("You have signed out.", "success");
}

document.addEventListener("DOMContentLoaded", () => {
    window.CalxinSession.updateAuthUi();
    updateRequestCenterShortcut();

    document.querySelectorAll(".tab-btn").forEach((button) => {
        button.addEventListener("click", () => {
            setView(button.dataset.view || "login");
        });
    });

    const loginForm = document.getElementById("loginForm");
    const signupForm = document.getElementById("signupForm");
    const logoutBtn = document.getElementById("logoutBtn");
    const requestCenterShortcut = document.getElementById("requestCenterShortcut");

    if (loginForm) {
        loginForm.addEventListener("submit", submitLogin);
    }

    if (signupForm) {
        signupForm.addEventListener("submit", submitSignup);
    }

    if (logoutBtn) {
        logoutBtn.addEventListener("click", logoutCustomer);
    }

    if (requestCenterShortcut) {
        requestCenterShortcut.addEventListener("click", openRequestCenterShortcut);
    }

    if (window.location.hash === "#signup") {
        setView("signup");
    }
});
