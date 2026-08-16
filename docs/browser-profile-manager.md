# BrowserProfileManager

`browser_profile_manager.py` launches isolated persistent Chromium profiles for
testing your own application and its allowed integrations.

Each `user_data_dir` is a separate browser profile. Chromium persists cookies,
cache, local storage, IndexedDB and browser settings in that folder. A lock file
prevents two workers from opening the same folder at once.

## Install once

```powershell
pip install -r requirements.txt
playwright install chromium
```

## One profile

```python
from browser_profile_manager import BrowserProfileManager

manager = BrowserProfileManager()
profile = {
    "profile_id": "wallet-01",
    "user_data_dir": "./browser_profiles/wallet-01",
    "headless": False,
    "proxy": "proxy.example.net:10000:login:password",  # optional
    "environment": {
        "locale": "ru-RU",
        "timezone_id": "Europe/Stockholm",
        "viewport": {"width": 1365, "height": 768},
        "color_scheme": "dark",
    },
}

with manager.open_profile(profile) as session:
    page = session.new_page()
    page.goto("http://localhost:8000/", wait_until="domcontentloaded")
    # Test a page you own. Do not submit wallet actions without user approval.

manager.shutdown_current_thread()
```

## Several profiles concurrently

```python
def check_home(session):
    page = session.new_page()
    page.goto("http://localhost:8000/", wait_until="domcontentloaded")
    return session.settings.profile_id, page.title()

results = manager.run_parallel(profile_settings, check_home, max_workers=3)
```

## Boundaries

- Proxy credentials stay in memory and are not written or logged by the module.
- The module never reads a seed phrase/private key, signs a wallet request, or
  sends blockchain transactions.
- It deliberately does not spoof `navigator.webdriver`, WebGL/canvas data,
  permissions, browser identity, or attempt to bypass Cloudflare/WAF/CAPTCHA.
- The `environment` section accepts only normal Playwright test settings:
  locale, timezone, viewport/screen, scale, colour theme and a declared user
  agent for compatibility testing.
