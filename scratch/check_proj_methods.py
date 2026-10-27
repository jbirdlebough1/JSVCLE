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
        return {
            newDesignSource: app.projects.newDesign ? app.projects.newDesign.toString() : null,
            saveVersionSource: app.projects.saveVersion ? app.projects.saveVersion.toString() : null,
            saveNowSource: app.projects.saveNow ? app.projects.saveNow.toString() : null
        };
    }""")
    print("newDesign:\n", res["newDesignSource"])
    print("\nsaveVersion:\n", res["saveVersionSource"])
    print("\nsaveNow:\n", res["saveNowSource"])
    browser.close()

