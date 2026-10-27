from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True,
        args=["--allow-file-access-from-files", "--disable-web-security"]
    )
    page = browser.new_page()
    page.goto("file:///D:/CLEJS/Dev/index.htm")
    page.wait_for_timeout(3500)

    # Check bb function in scope or test inserting an SVG
    svg_sample = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
        <rect x="10" y="10" width="80" height="80" rx="5"/>
        <circle cx="50" cy="50" r="20"/>
    </svg>"""

    result = page.evaluate("""(svgText) => {
        const app = window.app || window.xe;
        // switch to advanced mode
        app.setMode('advanced');
        
        // Let's see what insertFile or advanced has
        return {
            hasInsertFile: typeof app.insertFile === 'function',
            advancedKeys: Object.keys(app.advanced)
        };
    }""", svg_sample)
    print("Result:", result)
    browser.close()

