// Home page with gallery display

// Sample products
const products = [
    {
        id: 1,
        name: "Premium SUV",
        price: 2500000,
        category: "SUVs",
        stock: 12,
        image: "calxin.images/WhatsApp Image 2026-01-23 at 4.58.08 PM.jpeg",
        rating: 4.8
    },
    {
        id: 2,
        name: "Compact Sedan",
        price: 1800000,
        category: "Sedans",
        stock: 25,
        image: "calxin.images/WhatsApp Image 2026-01-23 at 4.58.09 PM.jpeg",
        rating: 4.6
    },
    {
        id: 3,
        name: "Sports Coupe",
        price: 3500000,
        category: "Sports",
        stock: 5,
        image: "calxin.images/WhatsApp Image 2026-01-23 at 4.58.16 PM.jpeg",
        rating: 4.9
    },
    {
        id: 4,
        name: "Family Van",
        price: 2200000,
        category: "Vans",
        stock: 18,
        image: "calxin.images/WhatsApp Image 2026-01-23 at 4.58.18 PM.jpeg",
        rating: 4.5
    },
    {
        id: 5,
        name: "Executive SUV",
        price: 4200000,
        category: "SUVs",
        stock: 9,
        image: "calxin.images/WhatsApp Image 2026-01-23 at 4.58.19 PM.jpeg",
        rating: 4.7
    },
    {
        id: 6,
        name: "Pickup Truck",
        price: 2800000,
        category: "Trucks",
        stock: 14,
        image: "calxin.images/WhatsApp Image 2026-01-23 at 4.58.23 PM.jpeg",
        rating: 4.4
    },
    {
        id: 7,
        name: "Luxury Sedan",
        price: 3200000,
        category: "Sedans",
        stock: 8,
        image: "calxin.images/WhatsApp Image 2026-01-23 at 4.58.26 PM.jpeg",
        rating: 4.8
    },
    {
        id: 8,
        name: "Hatchback",
        price: 1500000,
        category: "Hatchbacks",
        stock: 20,
        image: "calxin.images/WhatsApp Image 2026-01-23 at 4.58.27 PM.jpeg",
        rating: 4.3
    },
    {
        id: 9,
        name: "Convertible",
        price: 4500000,
        category: "Sports",
        stock: 3,
        image: "calxin.images/WhatsApp Image 2026-01-23 at 4.58.30 PM.jpeg",
        rating: 4.9
    },
    {
        id: 10,
        name: "Crossover SUV",
        price: 2100000,
        category: "SUVs",
        stock: 15,
        image: "calxin.images/WhatsApp Image 2026-01-23 at 4.58.31 PM.jpeg",
        rating: 4.7
    },
    {
        id: 11,
        name: "Minivan",
        price: 2400000,
        category: "Vans",
        stock: 11,
        image: "calxin.images/WhatsApp Image 2026-01-23 at 4.58.34 PM.jpeg",
        rating: 4.5
    },
    {
        id: 12,
        name: "Budget Sedan",
        price: 1200000,
        category: "Sedans",
        stock: 30,
        image: "calxin.images/WhatsApp Image 2026-01-23 at 4.58.35 PM.jpeg",
        rating: 4.2
    },
    {
        id: 13,
        name: "Performance SUV",
        price: 5200000,
        category: "SUVs",
        stock: 2,
        image: "calxin.images/WhatsApp Image 2026-01-23 at 4.58.37 PM.jpeg",
        rating: 4.9
    },
    {
        id: 14,
        name: "Luxury Truck",
        price: 3800000,
        category: "Trucks",
        stock: 6,
        image: "calxin.images/WhatsApp Image 2026-01-23 at 4.58.39 PM.jpeg",
        rating: 4.8
    },
    {
        id: 15,
        name: "Eco Hybrid",
        price: 1900000,
        category: "Sedans",
        stock: 22,
        image: "calxin.images/WhatsApp Image 2026-01-23 at 4.58.40 PM.jpeg",
        rating: 4.6
    },
    {
        id: 16,
        name: "Compact SUV",
        price: 1700000,
        category: "SUVs",
        stock: 28,
        image: "calxin.images/WhatsApp Image 2026-01-23 at 4.58.42 PM.jpeg",
        rating: 4.4
    },
    {
        id: 17,
        name: "Roadster",
        price: 5800000,
        category: "Sports",
        stock: 1,
        image: "calxin.images/WhatsApp Image 2026-01-23 at 4.58.44 PM.jpeg",
        rating: 5.0
    },
    {
        id: 18,
        name: "Work Truck",
        price: 2300000,
        category: "Trucks",
        stock: 10,
        image: "calxin.images/WhatsApp Image 2026-01-23 at 4.58.45 PM.jpeg",
        rating: 4.3
    },
    {
        id: 19,
        name: "Elegant Coupe",
        price: 3100000,
        category: "Sports",
        stock: 4,
        image: "calxin.images/WhatsApp Image 2026-01-23 at 4.58.46 PM.jpeg",
        rating: 4.7
    },
    {
        id: 20,
        name: "Premium Hatchback",
        price: 1950000,
        category: "Hatchbacks",
        stock: 18,
        image: "calxin.images/WhatsApp Image 2026-01-23 at 4.58.47 PM.jpeg",
        rating: 4.5
    },
    {
        id: 21,
        name: "Mega SUV",
        price: 4800000,
        category: "SUVs",
        stock: 5,
        image: "calxin.images/WhatsApp Image 2026-01-23 at 4.58.49 PM.jpeg",
        rating: 4.8
    },
    {
        id: 22,
        name: "Sedan Plus",
        price: 2600000,
        category: "Sedans",
        stock: 12,
        image: "calxin.images/WhatsApp Image 2026-01-23 at 4.58.50 PM.jpeg",
        rating: 4.6
    }
];

const availableImageFiles = [
    "WhatsApp Image 2026-01-23 at 4.58.19 PM (1).jpeg",
    "WhatsApp Image 2026-01-23 at 4.58.19 PM.jpeg",
    "WhatsApp Image 2026-01-23 at 4.58.23 PM.jpeg",
    "WhatsApp Image 2026-01-23 at 4.58.26 PM.jpeg",
    "WhatsApp Image 2026-01-23 at 4.58.27 PM.jpeg",
    "WhatsApp Image 2026-01-23 at 4.58.31 PM.jpeg",
    "WhatsApp Image 2026-01-23 at 4.58.35 PM.jpeg",
    "WhatsApp Image 2026-01-23 at 4.58.37 PM.jpeg",
    "WhatsApp Image 2026-01-23 at 4.58.39 PM.jpeg",
    "WhatsApp Image 2026-01-23 at 4.58.42 PM.jpeg",
    "WhatsApp Image 2026-01-23 at 4.58.44 PM.jpeg",
    "WhatsApp Image 2026-01-23 at 4.58.45 PM.jpeg",
    "WhatsApp Image 2026-01-23 at 4.58.46 PM.jpeg",
    "WhatsApp Image 2026-01-23 at 4.58.47 PM.jpeg",
    "WhatsApp Image 2026-01-23 at 4.58.50 PM.jpeg",
    "WhatsApp Image 2026-01-23 at 4.58.53 PM.jpeg",
    "WhatsApp Image 2026-01-23 at 4.58.55 PM.jpeg",
    "WhatsApp Image 2026-01-23 at 4.58.59 PM.jpeg",
    "WhatsApp Image 2026-01-23 at 4.59.00 PM.jpeg",
    "WhatsApp Image 2026-01-23 at 4.59.04 PM.jpeg",
    "WhatsApp Image 2026-01-23 at 5.00.46 PM.jpeg",
    "WhatsApp Image 2026-01-23 at 5.00.48 PM.jpeg",
    "WhatsApp Image 2026-01-23 at 5.00.49 PM.jpeg",
    "WhatsApp Image 2026-01-23 at 5.00.56 PM.jpeg",
    "WhatsApp Image 2026-01-23 at 5.00.58 PM.jpeg",
    "WhatsApp Image 2026-01-23 at 5.01.00 PM.jpeg",
    "WhatsApp Image 2026-01-23 at 5.01.01 PM.jpeg",
    "WhatsApp Image 2026-01-23 at 5.01.02 PM.jpeg",
    "WhatsApp Image 2026-01-23 at 5.01.03 PM.jpeg",
    "WhatsApp Image 2026-01-23 at 5.01.06 PM.jpeg",
    "WhatsApp Image 2026-01-23 at 5.01.07 PM.jpeg",
    "WhatsApp Image 2026-01-23 at 5.01.09 PM.jpeg",
    "WhatsApp Image 2026-01-23 at 5.01.12 PM.jpeg",
    "WhatsApp Image 2026-01-23 at 5.01.13 PM.jpeg",
    "WhatsApp Image 2026-01-23 at 5.01.14 PM.jpeg",
    "WhatsApp Image 2026-01-23 at 5.01.16 PM.jpeg"
];

function resolveProductImage(path, index) {
    const rawName = (path || "").split("/").pop();
    if (rawName && availableImageFiles.includes(rawName)) {
        return encodeURI(`calxin.images/${rawName}`);
    }
    return encodeURI(`calxin.images/${availableImageFiles[index % availableImageFiles.length]}`);
}

products.forEach((product, index) => {
    product.image = resolveProductImage(product.image, index);
});

let currentFilter = 'all';

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    loadGallery();
});

// Load gallery display
function loadGallery() {
    const container = document.getElementById('productDisplay');
    const filteredProducts = currentFilter === 'all' 
        ? products 
        : products.filter(p => p.category === currentFilter);

    container.innerHTML = '';

    filteredProducts.forEach(product => {
        const card = document.createElement('div');
        card.className = 'product-card';
        card.innerHTML = `
            <div class="product-image" onclick="viewProductDetail(${product.id})" style="cursor: pointer;">
                <img src="${product.image}" alt="${product.name}" onerror="this.src='https://via.placeholder.com/280x250?text=${encodeURIComponent(product.name)}'">
                <div class="stock-badge">${product.stock > 0 ? product.stock + ' in Stock' : 'Out of Stock'}</div>
            </div>
            <div class="product-info">
                <h3>${product.name}</h3>
                <p class="category">${product.category}</p>
                <p class="price">KES ${product.price.toLocaleString()}</p>
                <p class="rating">⭐ ${product.rating}</p>
                <div class="product-buttons">
                    <button class="btn-add-cart" onclick="addToCart(${product.id})">
                        <i class="fas fa-shopping-cart"></i> Add to Cart
                    </button>
                    <button class="btn-wishlist" onclick="addToWishlist(${product.id})" title="Add to Wishlist">
                        <i class="fas fa-heart"></i>
                    </button>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

// Filter by category
function filterByCategory(category) {
    currentFilter = category;

    // Update button styles
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');

    loadGallery();
}

// Navigation
function navigateTo(page) {
    if(page === 'about') {
        window.location.href = 'about.html';
    } else if(page === 'contact') {
        window.location.href = 'contact.html';
    } else if(page === 'home') {
        window.location.href = 'index.html';
    }
}

// Cart functions
function showCart() {
    // Navigate to cart page
    window.location.href = 'cart.html';
}

// Menu toggle
function toggleMenu() {
    const menu = document.getElementById('sideMenu');
    menu.classList.toggle('active');
}

// Search
document.addEventListener('DOMContentLoaded', function() {
    const searchInput = document.getElementById('searchInput');
    if(searchInput) {
        searchInput.addEventListener('input', function(e) {
            const term = e.target.value.toLowerCase();
            const filtered = products.filter(p => 
                p.name.toLowerCase().includes(term) || 
                p.category.toLowerCase().includes(term)
            );
            
            const container = document.getElementById('productDisplay');
            container.innerHTML = '';
            
            if(filtered.length === 0) {
                container.innerHTML = '<p style="grid-column: 1/-1; text-align: center;">No vehicles found</p>';
                return;
            }
            
            filtered.forEach(product => {
                const card = document.createElement('div');
                card.className = 'product-card';
                card.innerHTML = `
                    <div class="product-image" onclick="viewProductDetail(${product.id})" style="cursor: pointer;">
                        <img src="${product.image}" alt="${product.name}" onerror="this.src='https://via.placeholder.com/280x250?text=${encodeURIComponent(product.name)}'">
                        <div class="stock-badge">${product.stock > 0 ? product.stock + ' in Stock' : 'Out of Stock'}</div>
                    </div>
                    <div class="product-info">
                        <h3>${product.name}</h3>
                        <p class="category">${product.category}</p>
                        <p class="price">KES ${product.price.toLocaleString()}</p>
                        <p class="rating">⭐ ${product.rating}</p>
                        <div class="product-buttons">
                            <button class="btn-add-cart" onclick="addToCart(${product.id})">
                                <i class="fas fa-shopping-cart"></i> Add to Cart
                            </button>
                            <button class="btn-wishlist" onclick="addToWishlist(${product.id})" title="Add to Wishlist">
                                <i class="fas fa-heart"></i>
                            </button>
                        </div>
                    </div>
                `;
                container.appendChild(card);
            });
        });
    }
});
// Add to cart function
function addToCart(productId) {
    const product = products.find(p => p.id === productId);
    if(product) {
        let cart = JSON.parse(localStorage.getItem('cart')) || [];
        const existingItem = cart.find(item => item.id === productId);
        
        if(existingItem) {
            existingItem.quantity += 1;
        } else {
            cart.push({...product, quantity: 1});
        }
        
        localStorage.setItem('cart', JSON.stringify(cart));
        updateCartCount();
        
        // Show cart icon animation
        const cartIcon = document.querySelector('.cart-icon');
        if(cartIcon) {
            cartIcon.style.animation = 'pulse 0.5s ease';
            setTimeout(() => {
                cartIcon.style.animation = '';
            }, 500);
        }
    }
}

// Add to wishlist function
function addToWishlist(productId) {
    const product = products.find(p => p.id === productId);
    if(product) {
        let wishlist = JSON.parse(localStorage.getItem('wishlist')) || [];
        const existingItem = wishlist.find(item => item.id === productId);
        
        if(!existingItem) {
            wishlist.push(product);
            localStorage.setItem('wishlist', JSON.stringify(wishlist));
        }
    }
}

// Update cart count
function updateCartCount() {
    const cart = JSON.parse(localStorage.getItem('cart')) || [];
    const count = cart.reduce((total, item) => total + item.quantity, 0);
    const cartCount = document.getElementById('cart-count');
    if(cartCount) {
        cartCount.textContent = count;
    }
}

// View product detail
function viewProductDetail(productId) {
    window.location.href = 'cart.html';
}

// Initialize cart count on page load
document.addEventListener('DOMContentLoaded', function() {
    updateCartCount();
});
