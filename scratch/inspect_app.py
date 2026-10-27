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
        const keys = Object.keys(app);
        const skKeys = app.sketcher ? Object.keys(app.sketcher) : [];
        return {
            keys,
            skKeys,
            mode: app.mode,
            hasDoc: !!(app.doc || (window.Se && window.Se.doc)),
            docKeys: window.Se && window.Se.doc ? Object.keys(window.Se.doc) : []
        };
    }""")
    print("App keys:", res["keys"])
    print("Sketcher keys:", res["skKeys"])
    print("Mode:", res["mode"])
    print("HasDoc:", res["hasDoc"])
    print("DocKeys:", res["docKeys"])
    browser.close()

