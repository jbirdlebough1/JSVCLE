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
        app.setMode('advanced');
        
        // Find Se
        // In index.htm, where is Se? Is it window.Se or within closure?
        // Let's check window properties or app properties
        return {
            hasWindowSe: !!window.Se,
            hasAppScene: !!app.scene,
            appSceneKeys: app.scene ? Object.keys(app.scene) : []
        };
    }""")
    print("Check Se:", res)
    browser.close()

