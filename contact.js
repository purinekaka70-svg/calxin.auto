const CONTACT_WHATSAPP = "254706931802";

function toggleMenu() {
    const sideMenu = document.getElementById("sideMenu");
    const header = document.querySelector(".header");
    if (sideMenu && header) {
        sideMenu.classList.toggle("active");
        header.classList.toggle("menu-open");
    }
}

function toggleOrderFields() {
    const messageType = document.getElementById("messageType").value;
    const orderFields = document.getElementById("orderFields");

    if (orderFields) {
        orderFields.style.display = messageType === "order" ? "block" : "none";
    }
}

function toggleFAQ(element) {
    const item = element.closest(".faq-item");
    if (!item) return;
    item.classList.toggle("active");
}

function buildContactWhatsappMessage(formData) {
    const lines = [
        "Hello Calxin Auto, I am contacting you from the website.",
        "",
        `Name: ${formData.name}`,
        `Email: ${formData.email}`,
        `Phone: ${formData.phone}`,
        `Request Type: ${formData.messageType || "inquiry"}`
    ];

    if (formData.subject) {
        lines.push(`Subject: ${formData.subject}`);
    }

    if (formData.vehicleType) {
        lines.push(`Vehicle: ${formData.vehicleType}`);
    }

    if (formData.spareParts && formData.spareParts.length) {
        lines.push(`Parts Needed: ${formData.spareParts.join(", ")}`);
    }

    if (formData.quantity) {
        lines.push(`Quantity: ${formData.quantity}`);
    }

    if (formData.budget) {
        lines.push(`Budget: ${formData.budget}`);
    }

    lines.push("");
    lines.push(`Message: ${formData.message}`);
    return `https://wa.me/${CONTACT_WHATSAPP}?text=${encodeURIComponent(lines.join("\n"))}`;
}

window.toggleMenu = toggleMenu;
window.toggleOrderFields = toggleOrderFields;
window.toggleFAQ = toggleFAQ;

document.addEventListener("DOMContentLoaded", () => {
    if (window.CalxinSession) {
        window.CalxinSession.updateAuthUi();
    }

    document.querySelectorAll(".side-menu .nav-menu a").forEach((link) => {
        link.addEventListener("click", () => {
            const sideMenu = document.getElementById("sideMenu");
            const header = document.querySelector(".header");
            if (sideMenu && header) {
                sideMenu.classList.remove("active");
                header.classList.remove("menu-open");
            }
        });
    });

    document.addEventListener("click", (event) => {
        const sideMenu = document.getElementById("sideMenu");
        const hamburger = document.querySelector(".hamburger");
        const header = document.querySelector(".header");

        if (!sideMenu || !hamburger || !header) return;
        if (!sideMenu.classList.contains("active")) return;

        if (!sideMenu.contains(event.target) && !hamburger.contains(event.target)) {
            sideMenu.classList.remove("active");
            header.classList.remove("menu-open");
        }
    });

    const contactForm = document.getElementById("contactForm");
    if (!contactForm) return;

    contactForm.addEventListener("submit", (event) => {
        event.preventDefault();

        const formData = {
            messageType: document.getElementById("messageType").value,
            name: document.getElementById("name").value.trim(),
            email: document.getElementById("email").value.trim(),
            phone: document.getElementById("phone").value.trim(),
            subject: document.getElementById("subject").value.trim(),
            message: document.getElementById("message").value.trim(),
            vehicleType: document.getElementById("vehicleType").value.trim(),
            spareParts: Array.from(document.getElementById("spareParts").selectedOptions).map((option) => option.value),
            quantity: document.getElementById("quantity").value.trim(),
            budget: document.getElementById("budget").value.trim()
        };

        const messageDiv = document.getElementById("formMessage");
        if (messageDiv) {
            messageDiv.classList.remove("error");
            messageDiv.classList.add("success");
            messageDiv.textContent = "WhatsApp is opening with your message.";
            messageDiv.style.display = "block";
        }

        window.open(buildContactWhatsappMessage(formData), "_blank");
        contactForm.reset();
        toggleOrderFields();
    });
});
