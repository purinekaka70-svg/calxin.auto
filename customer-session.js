(function initCalxinSession(global) {
    const STORAGE_KEY = "calxinCustomerSession";

    function readSession() {
        try {
            return JSON.parse(global.localStorage.getItem(STORAGE_KEY) || "null");
        } catch (error) {
            return null;
        }
    }

    function writeSession(session) {
        if (!session) {
            global.localStorage.removeItem(STORAGE_KEY);
            return;
        }

        global.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    }

    function getCustomer() {
        const session = readSession();
        return session && session.customer ? session.customer : null;
    }

    function isLoggedIn() {
        const session = readSession();
        return Boolean(session && session.token && session.customer);
    }

    function getReturnUrl(explicitNext) {
        if (explicitNext) return explicitNext;
        const pathname = global.location.pathname.split("/").pop() || "index.html";
        const search = global.location.search || "";
        return `${pathname}${search}`;
    }

    function requireCustomer(nextUrl) {
        if (isLoggedIn()) {
            return getCustomer();
        }

        global.location.href = `login.html?next=${encodeURIComponent(getReturnUrl(nextUrl))}`;
        return null;
    }

    function updateAuthUi(root) {
        const scope = root || document;
        const customer = getCustomer();

        scope.querySelectorAll("[data-customer-name]").forEach((node) => {
            node.textContent = customer ? customer.name : "Guest";
        });

        scope.querySelectorAll("[data-auth-link='account']").forEach((node) => {
            const icon = node.querySelector("i");
            if (customer) {
                node.setAttribute("href", "chat.html");
            } else {
                node.setAttribute("href", "login.html");
            }

            if (icon) {
                const preservedIcon = icon.cloneNode(true);
                node.innerHTML = "";
                node.appendChild(preservedIcon);
                node.append(` ${customer ? "My Account" : "Sign In"}`);
            } else {
                node.textContent = customer ? "My Account" : "Sign In";
            }
        });

        scope.querySelectorAll("[data-auth-only]").forEach((node) => {
            node.style.display = customer ? "" : "none";
        });

        scope.querySelectorAll("[data-guest-only]").forEach((node) => {
            node.style.display = customer ? "none" : "";
        });
    }

    global.CalxinSession = {
        storageKey: STORAGE_KEY,
        getSession: readSession,
        setSession(session) {
            writeSession(session);
            updateAuthUi();
        },
        clearSession() {
            writeSession(null);
            updateAuthUi();
        },
        getCustomer,
        isLoggedIn,
        requireCustomer,
        updateAuthUi
    };

    document.addEventListener("DOMContentLoaded", () => {
        updateAuthUi();
    });
})(window);
