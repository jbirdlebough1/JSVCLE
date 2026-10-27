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
            hasProjects: !!app.projects,
            projectsKeys: app.projects ? Object.keys(app.projects) : [],
            topbarHTML: document.getElementById('topbar') ? document.getElementById('topbar').innerHTML.slice(0, 500) : ''
        };
    }""")
    print("Projects:", res)
    browser.close()

