# Calxin Auto

Static storefront plus a small Node/Express backend for:

- MySQL-backed products and posts
- Admin image uploads
- Dynamic `sitemap.xml` and `robots.txt`
- Frontend catalog loading through `/api`

## Setup

1. Copy `.env.example` to `.env`.
2. Create the MySQL database with `db/schema.sql`.
3. Optional: load starter content with `db/seed.sql`.
4. Set `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and optionally `ADMIN_SESSION_SECRET`.
5. Install dependencies with `npm install`.
6. Start the app with `npm start`.

The site will run on `http://localhost:3000` by default.

## Storage Model

- Products, posts, and image metadata: MySQL
- Uploaded product/post/gallery images: `uploads/images/`
- Document links: saved as URLs, so you can point them to Firebase documents if you want

## SEO

- `GET /sitemap.xml` builds a sitemap from the published catalog
- `GET /sitemap.json` exposes the same sitemap data in JSON for debugging or custom tooling
- `GET /robots.txt` points search engines to the sitemap and blocks admin/cart/wishlist/login
- Google Search Console should still submit `/sitemap.xml`, not the JSON endpoint

## Admin Access

- `GET /admin.html` is now protected by an admin session cookie
- Use `admin-login.html` to sign in with the credentials from your environment variables
- Admin APIs for products, posts, media, orders, and admin chat access require that admin session
- Admin login/logout and write actions are recorded in `admin_audit_logs`
- `GET /api/admin/logs` returns recent admin audit entries for the signed-in admin session

## Notes

- If MySQL is not configured, the server falls back to a local JSON-backed catalog store that starts empty, so the admin can add only the products and posts you want.
- API responses are served with `Cache-Control: no-store`, and legacy browser catalog keys are cleared on load to avoid stale posts or products reappearing.
- To use the real backend, open the site through `http://localhost:3000`, not `file://`.
