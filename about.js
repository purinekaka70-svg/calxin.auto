// Toggle menu functionality
function toggleMenu() {
    const sideMenu = document.getElementById("sideMenu");
    const header = document.querySelector(".header");
    if (sideMenu && header) {
        sideMenu.classList.toggle("active");
        header.classList.toggle("menu-open");
    }
}

// Expose toggleMenu globally
window.toggleMenu = toggleMenu;

// Close menu when clicking on navigation links
document.addEventListener("DOMContentLoaded", function() {
    if (window.CalxinSession) {
        window.CalxinSession.updateAuthUi();
    }

    const navLinks = document.querySelectorAll(".side-menu .nav-menu a");
    navLinks.forEach(link => {
        link.addEventListener("click", function() {
            const sideMenu = document.getElementById("sideMenu");
            const header = document.querySelector(".header");
            if (sideMenu && header) {
                sideMenu.classList.remove("active");
                header.classList.remove("menu-open");
            }
        });
    });

    // Close menu when clicking outside of it
    document.addEventListener("click", function(event) {
        const sideMenu = document.getElementById("sideMenu");
        const hamburger = document.querySelector(".hamburger");
        const header = document.querySelector(".header");
        
        if (sideMenu && hamburger && header) {
            if (!sideMenu.contains(event.target) && !hamburger.contains(event.target)) {
                if (sideMenu.classList.contains("active")) {
                    sideMenu.classList.remove("active");
                    header.classList.remove("menu-open");
                }
            }
        }
    });
});
