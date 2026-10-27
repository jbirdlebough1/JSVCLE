from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True,
        args=["--allow-file-access-from-files", "--disable-web-security"]
    )
    page = browser.new_page()
    page.goto("file:///D:/CLEJS/Dev/index.htm")
    page.wait_for_timeout(3500)

    res = page.evaluate("""() => {
        const app = window.app || window.xe;
        const doc = app.scene && app.scene.doc ? app.scene.doc : null;
        return {
            docType: typeof doc,
            docKeys: doc ? Object.keys(doc) : [],
            sketches: doc ? doc.sketches : null,
            bodies: doc ? doc.bodies.length : 0
        };
    }""")
    print("Doc info:", res)
    browser.close()
