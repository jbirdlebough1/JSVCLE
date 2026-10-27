from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True,
        args=["--allow-file-access-from-files", "--disable-web-security"]
    )
    page = browser.new_page()
    page.goto("file:///D:/CLEJS/Vellum/index.htm")
    page.wait_for_timeout(2000)

    btn_visible = page.is_visible("#btnSaveToJS")
    print("btnSaveToJS visible:", btn_visible)
    
    # Click it
    page.click("#btnSaveToJS")
    page.wait_for_timeout(500)
    
    modal_visible = page.is_visible("#jsExportModal")
    print("Modal opened:", modal_visible)
    
    # Switch to extrude
    page.click("#optModeExtrude")
    extrude_panel_visible = page.is_visible("#extrudeOptionsPanel")
    print("Extrude panel visible:", extrude_panel_visible)
    
    browser.close()
