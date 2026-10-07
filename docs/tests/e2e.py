# End-to-end data-integration test. Usage: python3 e2e.py <base-url> <server|static> [path-to-sqlite-db]
# See README.md, section "Testing the data integration".
import sys, sqlite3, json, time
from playwright.sync_api import sync_playwright

BASE = sys.argv[1]; MODE = sys.argv[2]; DB = sys.argv[3] if len(sys.argv) > 3 else None
results = []
def check(name, ok, detail=""):
    results.append((name, ok, detail)); print(("PASS " if ok else "FAIL ") + name + (("  -> " + str(detail)) if detail and not ok else ""))

def db_count(t):
    if not DB: return None
    c = sqlite3.connect(DB); n = c.execute(f"select count(*) from {t}").fetchone()[0]; c.close(); return n

PAGES = ["index","products","product-detail","brands","features","offers","gift-cards","about","faq","contact","cart","checkout","login","signup","account","admin","forgot-password","privacy-policy","terms-of-use"]

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width":1280,"height":900})
    page = ctx.new_page()
    errs = []; api_calls = []
    page.on("pageerror", lambda e: errs.append(("pageerror", page.url, str(e)[:160])))
    page.on("console", lambda m: errs.append(("console", page.url, m.text[:160])) if m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text else None)
    page.on("response", lambda r: api_calls.append((r.request.method, r.url.replace(BASE, ""), r.status)) if "/api/" in r.url else None)
    page.on("requestfailed", lambda r: errs.append(("reqfailed", r.url[:100])) if BASE in r.url else None)

    # 0. mode detection
    page.goto(BASE + "/index.html"); page.wait_for_timeout(1500)
    mode = page.evaluate("window.Api.mode()")
    check(f"API mode detected = {MODE}", mode == MODE, mode)

    # 1. every page loads w/o JS errors
    for pg in PAGES:
        errs.clear()
        url = f"{BASE}/{pg}.html" + ("?id=p003" if pg == "product-detail" else "")
        r = page.goto(url); page.wait_for_timeout(700)
        js = [e for e in errs if e[0] in ("pageerror",) or (e[0]=="console")]
        check(f"page loads clean: {pg}.html", r.status == 200 and not js, js[:2] or r.status)

    # 2. Shop grid from API/JSON
    page.goto(BASE + "/products.html"); page.wait_for_selector(".product-card", timeout=8000)
    n = page.locator("#product-grid .product-card").count()
    check("shop renders all 31 products from data layer", n == 31, n)
    first = page.locator("#product-grid .product-card").first
    check("card shows availability status", first.locator(".stock").count() == 1)
    check("card shows 5 CTAs", all(first.locator(s).count() for s in [".cta-order",".cta-cart","a.cta-link","[data-inquire]","[data-learn]"]))
    low = page.locator("#product-grid .stock.low").count()
    check("Low Stock items present (2 expected)", low == 2, low)
    page.click(".switch")  # in-stock only
    page.wait_for_timeout(300)
    check("in-stock toggle keeps in-stock items", page.locator("#product-grid .product-card").count() == 31)
    page.click(".switch")
    page.click('.filter-chip[data-category="Skincare"]'); page.wait_for_timeout(300)
    sk = page.locator("#product-grid .product-card").count()
    check("category filter (Skincare) works", 0 < sk < 31, sk)
    page.click('.filter-chip[data-category="All"]')
    page.fill("#product-search", "serum"); page.wait_for_timeout(300)
    sr = page.locator("#product-grid .product-card").count()
    check("search 'serum' filters", 0 < sr < 31, sr)
    page.fill("#product-search", "")

    # 3. Learn More toggle
    page.locator("#product-grid .product-card").first.locator("[data-learn]").click()
    check("Learn More expands benefits", page.locator("#product-grid .product-card").first.locator(".learn-panel").is_visible())

    # 4. Inquire Now -> DB
    before = db_count("inquiries")
    page.locator("#product-grid .product-card").first.locator("[data-inquire]").click()
    page.fill("#inq-name", "Tess Tester"); page.fill("#inq-email", "tess@example.com")
    page.click("#inq-form button[type=submit]")
    try:
        page.wait_for_selector(".inq-done", state="visible", timeout=4000); done = True
    except Exception:
        done = False
    check("Inquiry form submits + confirms", done)
    if DB: check("inquiry saved in database", db_count("inquiries") == before + 1, (before, db_count("inquiries")))
    else:  check("inquiry saved (browser demo database)", page.evaluate("JSON.parse(localStorage.getItem('sephora_static_db_v2')).inquiries.length") >= 3)
    page.keyboard.press("Escape")

    # 5. Product detail
    page.goto(BASE + "/product-detail.html?id=p003"); page.wait_for_selector("#product-detail h1", timeout=8000)
    check("detail page shows correct product", "Rouge Velvet" in page.inner_text("#product-detail h1"), page.inner_text("#product-detail h1"))
    check("detail page shows availability", page.locator(".pd-status").count() == 1)
    check("related products render", page.locator("#related-grid .product-card").count() > 0)

    # 6. Home featured
    page.goto(BASE + "/index.html"); page.wait_for_selector("#featured-grid .product-card", timeout=8000)
    check("home best sellers render", page.locator("#featured-grid .product-card").count() == 4)

    # 7. Signup via UI
    before_c = db_count("customers")
    page.goto(BASE + "/signup.html")
    email = f"e2e{int(time.time())}@example.com"
    page.fill("#su-name", "E2E Customer"); page.fill("#su-email", email)
    page.fill("#su-password", "secret12"); page.fill("#su-confirm", "secret12")
    page.check("#su-terms"); page.click("#signup-form button[type=submit]")
    page.wait_for_url("**/account.html", timeout=8000)
    page.wait_for_function("document.getElementById('acc-name').textContent.includes('E2E')", timeout=8000)
    check("signup creates account + lands on account page", True)
    if DB: check("customer saved in database", db_count("customers") == before_c + 1)
    check("account page shows new member's profile", page.inner_text("#acc-email") == email, page.inner_text("#acc-email"))
    check("new account lands on the CUSTOMER dashboard", page.locator("#acc-dash").is_visible() and "customer" in page.inner_text(".role-pill").lower())
    if MODE == "server":
        d = page.evaluate("fetch('api/customers').then(r => r.json())")
        check("public directory masks other members' emails", all("•••" in c["email"] for c in d if c["email"] != email), d[:1])
        check("public directory never lists admins", not any(c.get("role") == "admin" for c in d))
        code = page.evaluate("fetch('api/admin/stats', {headers:{Authorization:'Bearer '+JSON.parse(localStorage.sephora_session).token}}).then(r => r.status)")
        check("customer token is refused by /api/admin (403)", code == 403, code)

    # 8. Order Now -> checkout -> place order
    before_o = db_count("orders")
    page.goto(BASE + "/products.html"); page.wait_for_selector(".product-card")
    page.locator("#product-grid .product-card").nth(1).locator(".cta-order").click()
    page.wait_for_url("**/checkout.html", timeout=8000); page.wait_for_timeout(600)
    for k, v in {"co-first":"E2E","co-last":"Customer","co-address":"1 Ayala Ave","co-city":"Makati","co-postal":"1226","co-mobile":"09171234567"}.items(): page.fill("#"+k, v)
    page.click("#co-submit"); page.wait_for_selector("#checkout-success", state="visible", timeout=8000)
    txt = page.inner_text("#checkout-success")
    check("Order Now -> checkout -> order placed", "SEP-" in txt, txt[:90])
    if DB: check("order saved in database", db_count("orders") == before_o + 1)
    if MODE == "server": check("member earned points on order", "earned" in txt.lower(), txt[:140])
    page.goto(BASE + "/account.html"); page.wait_for_selector(".order-row", timeout=8000)
    check("order appears in order history", page.locator(".order-row").count() >= 1)

    # 9. Logout + login with demo account
    page.evaluate("window.Api.logout()"); 
    page.goto(BASE + "/login.html")
    page.fill("#li-email", "juana.delacruz@example.com"); page.fill("#li-password", "beauty123")
    page.click("#login-form button[type=submit]"); page.wait_for_url("**/account.html", timeout=8000)
    page.wait_for_function("document.getElementById('acc-name').textContent.includes('Juana')", timeout=8000)
    check("login with demo account shows profile", "Juana" in page.inner_text("#acc-name"))
    if MODE == "server":
        page.evaluate("window.Api.logout()"); page.goto(BASE + "/login.html")
        page.fill("#li-email", "juana.delacruz@example.com"); page.fill("#li-password", "WRONG")
        page.click("#login-form button[type=submit]"); page.wait_for_timeout(1000)
        check("wrong password rejected (server mode)", "/login.html" in page.url and "ncorrect" in page.inner_text("#login-form"), page.url)

    # 9b. Admin login -> admin dashboard (server mode)
    if MODE == "server":
        page.evaluate("window.Api.logout()"); page.goto(BASE + "/login.html")
        page.click('[data-demo="admin@sephora.com|admin123|go"]'); page.wait_for_url("**/admin.html", timeout=8000)
        page.wait_for_selector("#ad-stats .stat", timeout=8000)
        check("admin login lands on the ADMIN dashboard", "admin" in page.inner_text(".role-pill").lower())
        page.click('[data-tab="customers"]'); page.wait_for_selector("#c-body tr b", timeout=8000)
        check("admin sees every account incl. the one just signed up", email in page.inner_text("#c-body"))
        page.evaluate("window.Api.logout()")

    # 10. Contact -> DB
    before_m = db_count("messages")
    page.goto(BASE + "/contact.html")
    page.fill("#ct-name", "Maria Santos"); page.fill("#ct-email", "maria@example.com"); page.fill("#ct-subject", "Order question")
    page.fill("#ct-message", "Hello, where is my order?")
    page.click("#contact-form button[type=submit]"); page.wait_for_selector("#contact-success", state="visible", timeout=8000)
    check("contact form submits + shows ref", "ref" in page.inner_text("#contact-success"), page.inner_text("#contact-success")[:100])
    if DB: check("contact message saved in database", db_count("messages") == before_m + 1)

    # 11. Gift card -> DB
    before_g = db_count("gift_cards")
    page.goto(BASE + "/gift-cards.html")
    page.click('.amount-btn[data-amount="1000"]')
    page.fill("#gc-recipient-name", "Ana"); page.fill("#gc-recipient-email", "ana@example.com"); page.fill("#gc-your-name", "Maria")
    page.check("#gc-terms"); page.click("#giftcard-form button[type=submit]")
    page.wait_for_selector("#gc-confirmation", state="visible", timeout=8000)
    gtxt = page.inner_text("#gc-confirmation")
    check("gift card form submits + shows code", "GC-" in gtxt, gtxt[:120])
    if DB: check("gift card saved in database", db_count("gift_cards") == before_g + 1)

    # 12. Newsletter -> DB
    before_s = db_count("subscribers")
    page.goto(BASE + "/about.html")
    page.fill(".newsletter-strip input[type=email]", f"news{int(time.time())}@example.com")
    page.click(".newsletter-strip button[type=submit]"); page.wait_for_timeout(1200)
    msg = page.inner_text(".newsletter-strip .form-msg")
    check("newsletter shows confirmation", len(msg.strip()) > 0, msg)
    if DB: check("subscriber saved in database", db_count("subscribers") == before_s + 1)

    # 13. API calls actually made in server mode
    if MODE == "server":
        used = sorted({(m, u.split("?")[0]) for m, u, s in api_calls})
        bad = [(m,u,s) for m,u,s in api_calls if s >= 500]
        check("no HTTP 5xx from API during run", not bad, bad[:3])
        print("API endpoints exercised:", ", ".join(f"{m} {u}" for m, u in used))
    b.close()

fails = [r for r in results if not r[1]]
print(f"\n{len(results)-len(fails)}/{len(results)} checks passed")
sys.exit(1 if fails else 0)
