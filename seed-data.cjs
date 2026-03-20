function image(fileName) {
    return encodeURI(`/calxin.images/${fileName}`);
}

function timestamp(offsetHours) {
    const base = new Date("2026-01-23T08:00:00.000Z");
    base.setUTCHours(base.getUTCHours() + Number(offsetHours || 0));
    return base.toISOString();
}

function buildSeedData() {
    const products = [
        {
            id: 1,
            name: "Engine Assembly Complete",
            slug: "engine-assembly-complete",
            category: "Engines",
            price: 45000,
            stock_quantity: 12,
            rating: 4.8,
            image_url: image("WhatsApp Image 2026-01-23 at 4.58.16 PM.jpeg"),
            description: "Complete engine assembly for common Japanese vehicle imports.",
            document_url: null,
            document_provider: null,
            is_published: 1,
            created_at: timestamp(0),
            updated_at: timestamp(10)
        },
        {
            id: 2,
            name: "Automatic Transmission",
            slug: "automatic-transmission",
            category: "Transmissions",
            price: 38000,
            stock_quantity: 8,
            rating: 4.7,
            image_url: image("WhatsApp Image 2026-01-23 at 4.58.18 PM.jpeg"),
            description: "Automatic transmission unit inspected for smooth gear changes.",
            document_url: null,
            document_provider: null,
            is_published: 1,
            created_at: timestamp(1),
            updated_at: timestamp(11)
        },
        {
            id: 3,
            name: "Brake Pads Set",
            slug: "brake-pads-set",
            category: "Brakes",
            price: 2500,
            stock_quantity: 45,
            rating: 4.9,
            image_url: image("WhatsApp Image 2026-01-23 at 4.58.19 PM.jpeg"),
            description: "Reliable brake pad set for daily urban and highway driving.",
            document_url: null,
            document_provider: null,
            is_published: 1,
            created_at: timestamp(2),
            updated_at: timestamp(12)
        },
        {
            id: 4,
            name: "Car Battery 12V 100A",
            slug: "car-battery-12v-100a",
            category: "Electrical",
            price: 8500,
            stock_quantity: 28,
            rating: 4.8,
            image_url: image("WhatsApp Image 2026-01-23 at 4.58.23 PM.jpeg"),
            description: "High-capacity battery suited for larger vehicles and pickups.",
            document_url: null,
            document_provider: null,
            is_published: 1,
            created_at: timestamp(3),
            updated_at: timestamp(13)
        },
        {
            id: 5,
            name: "Water Pump Assembly",
            slug: "water-pump-assembly",
            category: "Cooling",
            price: 6800,
            stock_quantity: 22,
            rating: 4.6,
            image_url: image("WhatsApp Image 2026-01-23 at 4.58.27 PM.jpeg"),
            description: "Efficient water pump assembly for improved engine cooling.",
            document_url: null,
            document_provider: null,
            is_published: 1,
            created_at: timestamp(4),
            updated_at: timestamp(14)
        },
        {
            id: 6,
            name: "Thermostat Housing",
            slug: "thermostat-housing",
            category: "Cooling",
            price: 3200,
            stock_quantity: 35,
            rating: 4.8,
            image_url: image("WhatsApp Image 2026-01-23 at 4.58.31 PM.jpeg"),
            description: "Durable thermostat housing built for long service life.",
            document_url: null,
            document_provider: null,
            is_published: 1,
            created_at: timestamp(5),
            updated_at: timestamp(15)
        },
        {
            id: 7,
            name: "Fuel Pump",
            slug: "fuel-pump",
            category: "Fuel System",
            price: 7800,
            stock_quantity: 16,
            rating: 4.7,
            image_url: image("WhatsApp Image 2026-01-23 at 4.58.42 PM.jpeg"),
            description: "Electric fuel pump tested for steady fuel delivery.",
            document_url: null,
            document_provider: null,
            is_published: 1,
            created_at: timestamp(6),
            updated_at: timestamp(16)
        },
        {
            id: 8,
            name: "Shock Absorbers Pair",
            slug: "shock-absorbers-pair",
            category: "Suspension",
            price: 7500,
            stock_quantity: 25,
            rating: 4.7,
            image_url: image("WhatsApp Image 2026-01-23 at 4.58.47 PM.jpeg"),
            description: "Suspension dampers that improve handling and ride comfort.",
            document_url: null,
            document_provider: null,
            is_published: 1,
            created_at: timestamp(7),
            updated_at: timestamp(17)
        },
        {
            id: 9,
            name: "Tyre 175/65 R14",
            slug: "tyre-175-65-r14",
            category: "Tyres",
            price: 4500,
            stock_quantity: 38,
            rating: 4.8,
            image_url: image("WhatsApp Image 2026-01-23 at 4.58.55 PM.jpeg"),
            description: "All-season tyre with reliable grip for everyday driving.",
            document_url: null,
            document_provider: null,
            is_published: 1,
            created_at: timestamp(8),
            updated_at: timestamp(18)
        },
        {
            id: 10,
            name: "Reverse Camera Kit",
            slug: "reverse-camera-kit",
            category: "Audio",
            price: 4200,
            stock_quantity: 28,
            rating: 4.8,
            image_url: image("WhatsApp Image 2026-01-23 at 5.00.49 PM.jpeg"),
            description: "HD reverse camera kit with clear image and simple installation.",
            document_url: null,
            document_provider: null,
            is_published: 1,
            created_at: timestamp(9),
            updated_at: timestamp(19)
        },
        {
            id: 11,
            name: "LED Headlights Pair",
            slug: "led-headlights-pair",
            category: "Lighting",
            price: 8800,
            stock_quantity: 17,
            rating: 4.9,
            image_url: image("WhatsApp Image 2026-01-23 at 5.01.09 PM.jpeg"),
            description: "Bright LED headlight pair for improved road visibility.",
            document_url: null,
            document_provider: null,
            is_published: 1,
            created_at: timestamp(10),
            updated_at: timestamp(20)
        },
        {
            id: 12,
            name: "Floor Mats Set",
            slug: "floor-mats-set",
            category: "Accessories",
            price: 1800,
            stock_quantity: 42,
            rating: 4.7,
            image_url: image("WhatsApp Image 2026-01-23 at 5.01.14 PM.jpeg"),
            description: "Heavy-duty floor mats set sized for daily protection.",
            document_url: null,
            document_provider: null,
            is_published: 1,
            created_at: timestamp(11),
            updated_at: timestamp(21)
        }
    ];

    const posts = [
        {
            id: 1,
            title: "How To Choose Quality Spare Parts",
            slug: "how-to-choose-quality-spare-parts",
            excerpt: "A short guide for selecting reliable auto spare parts in Mombasa.",
            content: "Check part numbers, compare wear patterns, confirm stock availability, and buy from suppliers who can explain the source and condition of the part.",
            image_url: image("WhatsApp Image 2026-01-23 at 4.59.04 PM.jpeg"),
            document_url: null,
            document_provider: null,
            is_published: 1,
            created_at: timestamp(12),
            updated_at: timestamp(22)
        },
        {
            id: 2,
            title: "Battery Maintenance Basics",
            slug: "battery-maintenance-basics",
            excerpt: "Quick checks that help your battery last longer.",
            content: "Keep terminals clean, inspect charging voltage, avoid long idle periods, and replace weak batteries before they fail on the road.",
            image_url: image("WhatsApp Image 2026-01-23 at 4.58.23 PM.jpeg"),
            document_url: null,
            document_provider: null,
            is_published: 1,
            created_at: timestamp(13),
            updated_at: timestamp(23)
        }
    ];

    let mediaId = 1;
    const media_assets = [];

    products.forEach((product) => {
        if (!product.image_url) return;
        media_assets.push({
            id: mediaId++,
            name: product.name,
            file_url: product.image_url,
            mime_type: "image/jpeg",
            description: product.description || "",
            category: "product",
            product_id: product.id,
            post_id: null,
            created_at: product.created_at,
            updated_at: product.updated_at
        });
    });

    posts.forEach((post) => {
        if (!post.image_url) return;
        media_assets.push({
            id: mediaId++,
            name: post.title,
            file_url: post.image_url,
            mime_type: "image/jpeg",
            description: post.excerpt || "",
            category: "post",
            product_id: null,
            post_id: post.id,
            created_at: post.created_at,
            updated_at: post.updated_at
        });
    });

    return {
        counters: {
            products: products.length,
            posts: posts.length,
            media_assets: media_assets.length,
            admin_audit_logs: 0,
            orders: 0,
            order_items: 0,
            customers: 0,
            chat_threads: 0,
            chat_messages: 0
        },
        products,
        posts,
        media_assets,
        admin_audit_logs: [],
        orders: [],
        order_items: [],
        customers: [],
        chat_threads: [],
        chat_messages: []
    };
}

module.exports = {
    buildSeedData
};
