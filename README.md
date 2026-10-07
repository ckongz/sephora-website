# Sephora Project — Website

An academic, non-commercial recreation of Sephora's e-commerce storefront and digital marketing ecosystem, built for coursework purposes. This is an original build (not copied from sephora.com) demonstrating web publishing, branding, and digital marketing principles.

## Quick start

The site works in **two modes**. `js/api.js` detects which one is available automatically, so no page needs to change.

| Mode | How to run | Where data comes from / goes |
|---|---|---|
| **Server (recommended)** | `cd server && npm install && npm start`, then open http://localhost:3000 | Express REST API + **SQLite** database (`server/data/sephora.db`, created and seeded on first start) |
| **Static** (no `npm` needed) | `python3 -m http.server 8080`, then open http://localhost:8080 (or any static host such as **Netlify**) | `GET data/products.json` and `GET data/customers.json` feed the shop and the Member Directory. Logins are checked against password hashes (`data/demo-auth.json`), and a small demo database in the browser's `localStorage` keeps orders, sign-ups, messages and **all admin changes**. Both dashboards work. Data is per browser, and the admin sidebar has a **Reset demo data** button. |

Opening `index.html` straight from the file system (`file://`) works for browsing, but browsers block `fetch()` there, so use one of the two modes above.

> Server mode needs Node 18+ and uses `better-sqlite3` v12 (has prebuilt Windows binaries for Node 22 and 24, so no Visual Studio is needed). If it fails to install on your machine (rare, usually a very new Node version without a prebuilt binary), the static mode still runs the whole site, including both dashboards.

### Sample accounts (also listed on the Login page, with one-click buttons)

| Role | Email | Password | After login you land on |
|---|---|---|---|
| **Admin** | `admin@sephora.com` | `admin123` | `admin.html` (Admin Dashboard) |
| **Admin** | `manager@sephora.com` | `manager123` | `admin.html` |
| Customer (VIB) | `juana.delacruz@example.com` | `beauty123` | `account.html` (Customer Dashboard) |
| Customer (Insider) | `marco.reyes@example.com` | `beauty123` | `account.html` |
| Customer (Rouge) | `sophia.lim@example.com` | `beauty123` | `account.html` |
| Customer (VIB) | `emily.ramos@example.com` | `beauty123` | `account.html` |
| Customer (Rouge) | `chice.mercado@example.com` | `beauty123` | `account.html` |

These accounts are stored in the SQLite database (passwords hashed with scrypt) together with sample orders, messages, inquiries, subscribers and a gift card, so both dashboards have data on the first start. Anyone who signs up on `signup.html` becomes a **customer** and is saved to the same database; only an admin can create or promote admin accounts.

### Roles and dashboards

| | Customer Dashboard (`account.html`) | Admin Dashboard (`admin.html`) |
|---|---|---|
| Who | any logged-in customer | accounts with `role = admin` only |
| Overview | tier, points, orders placed, total spent, latest order | customers, orders, revenue, products, subscribers, orders by status, best sellers, recent orders, low stock |
| Orders | own order history | every order; change status (Placed → Processing → Shipped → Delivered / Cancelled). Cancelling returns the stock and takes the points back |
| Accounts | edit own name, change password | add / edit / suspend / delete customer and admin accounts, set tier, points and role |
| Products | | add / edit / delete products and stock (stock drives the In Stock / Low Stock / Out of Stock label in the shop) |
| Other | gift cards they sent | contact messages, product inquiries, newsletter subscribers, gift cards sold |

Roles are enforced **on the server** (`requireAdmin` in `server/util.js`): a customer's token gets `403` from every `/api/admin/*` endpoint, a logged-out visitor gets `401`, suspended accounts cannot log in, and the last active admin cannot be deleted, demoted or suspended.

## Data & API

```
Browser pages ──> js/api.js (data layer) ──┬─ server mode ──> Express /api/* ──> SQLite
                                           └─ static mode ──> data/*.json + demo database in localStorage
```

| Method & path | What it does |
|---|---|
| `GET /api/health` | Status + row counts (also used for mode detection) |
| `GET /api/products` | All products. Optional filters: `?category=`, `?brand=`, `?q=`, `?inStock=1` |
| `GET /api/products/:id` | One product (404 if unknown) |
| `GET /api/customers` | Member directory. **Never** returns passwords or hashes, and other members' emails are **masked on the server** (`j•••@example.com`); you only see your own email in full when logged in |
| `GET /api/customers/:id` | One customer (same masking rule) |
| `POST /api/customers` | Sign up `{name,email,password}` returns `{token, customer}` (409 if email exists). Always creates a **customer** |
| `POST /api/login` | Log in `{email,password}` returns `{token, customer}` incl. `role` (401 if wrong, 403 if suspended) |
| `GET /api/me` / `POST /api/logout` | Current account / end session (header `Authorization: Bearer <token>`) |
| `PUT /api/me` | Edit own name / change password `{name, currentPassword, newPassword}` |
| `GET /api/me/giftcards` | Gift cards the logged-in member bought |
| `GET /api/admin/stats` | **Admin only.** Dashboard numbers, orders by status, best sellers, recent orders, low stock |
| `GET/POST /api/admin/customers`, `PUT/DELETE /api/admin/customers/:id` | **Admin only.** Manage all accounts |
| `GET /api/admin/orders`, `PUT /api/admin/orders/:id` | **Admin only.** All orders / change an order's status |
| `GET/POST /api/admin/products`, `PUT/DELETE /api/admin/products/:id` | **Admin only.** Manage products and stock |
| `GET /api/admin/inbox` | **Admin only.** Messages, inquiries, subscribers, gift cards |
| `POST /api/orders` | Place an order `{items:[{id,qty}],name,email,address}`. Prices are re-read from the database, stock is checked and reduced, and logged-in members earn 1 point per whole peso |
| `GET /api/orders` | The logged-in customer's order history |
| `POST /api/subscribe` | Newsletter signup (stored once per email) |
| `POST /api/messages` | Contact form (name, email, subject, date, message) |
| `POST /api/inquiries` | "Inquire Now" product questions |
| `POST /api/giftcards` | Buy a gift card `{amount,format,recipientName,recipientEmail?,shippingAddress?,senderName,message?,deliveryDate?,promo?}`. Amount is validated (₱100–₱50,000) and a code like `GC-1A2B-3C4D-5E6F` is returned |

**Database tables:** `products` (with `stock`, which drives the In Stock / Low Stock / Out of Stock label), `customers` (scrypt-hashed passwords, `role` = customer/admin, `status` = active/suspended), `sessions`, `orders`, `order_items`, `subscribers`, `inquiries`, `messages`, `gift_cards`. Reset to the seed data any time with `cd server && npm run seed` (this also restores the sample admin/customer accounts and sample orders). If you already have a database from an earlier version, it is upgraded automatically: your accounts are kept and the sample admin accounts are added. To look inside the database: `sqlite3 server/data/sephora.db "select * from orders;"`.

**Where each page uses data**

| Page | Retrieves / saves |
|---|---|
| Shop, Home best sellers, Product detail, Cart suggestions | Products (list, filters, search, stock/availability) |
| Product cards, Product detail | Inquiry form saves to `inquiries` |
| Account (customer dashboard) | Logged-in profile (`/api/me`), order history, gift cards, edit profile / password |
| Admin (admin dashboard) | `/api/admin/*`: accounts, orders, products & stock, inbox |
| Sign up / Log in | Create account / verify password, issue session token |
| Checkout | Validates the form, places the order, updates stock and points |
| Contact | Saves to `messages` |
| Gift Cards | Saves to `gift_cards` and shows the generated code |
| Every footer newsletter box | Saves to `subscribers` |

**Security notes:** passwords are hashed with scrypt and never sent to the browser; the public `data/customers.json` contains no passwords; the server refuses to serve `server/`, `*.db` and dotfiles; all inputs are validated and length-limited; SQL uses parameterised queries; API requests are rate limited; user-supplied text is HTML-escaped before display. Sessions are simple random bearer tokens, which is fine for a coursework demo. A production site would add HTTPS, token expiry and email verification.

## Testing the data integration

`docs/tests/e2e.py` drives a real headless browser through the whole site: every page loads without JavaScript errors, the shop renders all 31 products from the data layer, filters/search/availability work, Inquire Now, sign-up, role-based log-in (customer and admin dashboards, 403 for customers on admin endpoints), Order Now → checkout, contact, gift card and newsletter all save, and (in server mode) the rows are checked directly in SQLite.

```bash
pip install playwright && playwright install chromium
# server mode (use a throwaway database so your real one is untouched)
cd server && DB_PATH=/tmp/test.db PORT=3111 node server.js &
python3 ../docs/tests/e2e.py http://localhost:3111 server /tmp/test.db
# static mode
cd .. && python3 -m http.server 8089 &
python3 docs/tests/e2e.py http://localhost:8089 static
```

Last run: **56/56 checks passed in server mode, 43/43 in static mode.**

## What's already working

- Every page is linked through a shared header (logo, nav, search, account, cart) and footer (newsletter, sitemap, socials).
- **Cart** with quantities, removal and a live subtotal, persisted in `localStorage` (`js/cart.js`).
- **Products** with availability, filters, search and CTAs (`js/products.js`).
- **Accounts with roles (admin / customer), a customer dashboard, an admin dashboard**, plus orders, contact, inquiries and newsletter, all via the API/data layer above.
- **Gift cards**, **FAQ**, **Offers** (filters + copy-code), **Features** (flip cards, calculator, lightbox, tabs).

## Replacing the placeholder media

Every image on the site currently points to a generated placeholder (via `placehold.co`) in the brand's color palette, so you can see the finished layout immediately. To swap in real photography:

1. Drop your files into the matching subfolder under `images/` (`hero/`, `products/`, `brands/`, `gallery/`, `video/`, `social-pubmats/<month>/`, `email-mockup/`).
2. Update the `src` attribute on the matching `<img>` tag in the relevant `.html` file (or the `image` field in `data/products.json` for product photos — the product grid re-renders automatically from that file).
3. For the brand video on `features.html` and the routine video on `index.html`, replace the poster `<img>` with a `<video>` element pointing at your `.mp4` file in `images/video/`.

## Folder structure

See the project documentation (Part I-A) for the full annotated tree. In short:

```
sephora-website/
├── *.html              18 pages
├── css/                 style.css, responsive.css, forms.css
├── js/                  api.js (data layer), main.js, cart.js, products.js,
│                        customers.js (customer dashboard), admin.js (admin dashboard), auth.js, giftcard.js, faq.js,
│                        newsletter.js, enhance.js
├── data/                products.json, customers.json (public, no passwords)
├── server/              Express + SQLite backend (db.js, routes/, seed/)
├── images/              placeholder folders, organized by use
├── assets/fonts/        (fonts are loaded from Google Fonts by default)
└── docs/                documentation + group contributions
```

## Color palette

| Token | Hex | Use |
|---|---|---|
| Deep Brown | `#3E2723` | Primary buttons, headlines |
| Warm Caramel | `#B9713F` | Links, accents, secondary buttons |
| Soft Beige | `#F6EEE4` | Section backgrounds |
| Muted Taupe | `#8C7A6B` | Secondary text, borders |
| Rose Blush | `#D98B94` | Sale badges, errors, wishlist — used sparingly |
| Black / White | `#171310` / `#FFFFFF` | Type, header, footer |

This is an academic, non-commercial project and is not affiliated with or endorsed by Sephora or LVMH.


## Going live (Netlify, no server needed)

The project is a static site first, so it can be published as-is:

1. Go to app.netlify.com, choose **Add new site → Deploy manually** and drag the whole `sephora-website9` folder in (or connect a GitHub repo; `netlify.toml` is already set up, no build command).
2. Open the link Netlify gives you. The page detects that there is no server and switches to static mode automatically.
3. Use the **sample accounts** on the login page: the admin accounts open the Admin Dashboard and the customer accounts open the Customer Dashboard.

**Part IV (API / data integration):** the data is retrieved with `GET` requests, as `fetch('data/products.json')` (Dataset 1: products) and `fetch('data/customers.json')` (Dataset 2: customers, shown in *My Account → Member Directory*). With the Node server running, the same pages use `GET /api/products` and `GET /api/customers` from SQLite instead. `npm` is only needed for that optional server mode.

Static-mode limits: the demo database lives in each visitor's own browser (it is not shared between people), and the login check happens in the browser, so it is a demonstration, not real security. For a shared database use the Node server on a host such as Render.
