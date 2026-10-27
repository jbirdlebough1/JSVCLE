from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True,
        args=["--allow-file-access-from-files", "--disable-web-security"]
    )
    page = browser.new_page()
    page.goto("file:///D:/CLEJS/Dev/index.htm")
    page.wait_for_timeout(3500)

    # Test creating an iframe pointing to ../Vellum/index.htm
    iframe_loaded = page.evaluate("""() => {
        return new Promise((resolve) => {
            const iframe = document.createElement('iframe');
            iframe.src = '../Vellum/index.htm';
            iframe.style.width = '300px';
            iframe.style.height = '300px';
            iframe.onload = () => {
                const title = iframe.contentDocument ? iframe.contentDocument.title : 'no-doc';
                resolve({ loaded: true, title });
            };
            iframe.onerror = (e) => resolve({ loaded: false, error: String(e) });
            document.body.appendChild(iframe);
            setTimeout(() => resolve({ loaded: false, timeout: true }), 4000);
        });
    }""")
    print("Iframe load result:", iframe_loaded)
    browser.close()
