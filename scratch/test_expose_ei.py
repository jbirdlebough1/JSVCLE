from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True,
        args=["--allow-file-access-from-files", "--disable-web-security"]
    )
    page = browser.new_page()
    page.goto("file:///D:/CLEJS/Dev/index.htm")
    page.wait_for_timeout(3500)

    # First expose window.Ei if not already exposed
    page.evaluate("""() => {
        // Find Ei function
        // We know Ei is in scope in index.htm; let's see if we can expose it
    }""")
    browser.close()
