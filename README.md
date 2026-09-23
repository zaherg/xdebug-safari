# Xdebug Helper for Safari

> [!IMPORTANT]
> This version was converted to Safari using Astro Model from Codex. use it with caution.

A macOS Safari port of [JetBrains’ Xdebug Helper](https://github.com/JetBrains/xdebug-extension). Toggle Xdebug debugging, profiling, and tracing from the Safari toolbar, with configurable IDE keys and triggers.

## Install

**Requirements:** an Apple Silicon Mac (M1 or later) running macOS 13 or later. The current release does not support Intel Macs. You do not need Xcode or an Apple Developer account to install it.

1. Open the [latest release](https://github.com/zaherg/xdebug-safari/releases/latest).
2. Download **`Xdebug.Helper.for.Safari-notarized.zip`** from **Assets** and unzip it.
3. Move **Xdebug Helper for Safari.app** into your **Applications** folder.
4. Open the app and select **Open Safari Settings**.
5. In **Safari > Settings > Extensions**, enable **Xdebug Helper for Safari Extension**.
6. Allow the extension access to your development website, then reload that website.
7. Open the extension’s toolbar popup and select **Debug**, **Profile**, **Trace**, or **Disable**.

The release is Developer ID–signed and notarized by Apple, with the notarization ticket attached. You do not need to enable unsigned extensions or disable Gatekeeper. Keep the app installed: Safari loads the extension from inside it. If you previously loaded a temporary copy, remove or disable that copy to avoid duplicate helpers.

## Configure Xdebug

All three settings start blank, without preset values or placeholders. Open **options** in the popup to set an IDE key or trigger if your server requires one. Select **Save**, select a mode again, and reload your website. Previously saved values remain unchanged; use **Clear → Save** to remove them.

The extension sets browser cookies. It does not install Xdebug or configure your PHP server or IDE.

For a debugging session:

1. Enable Xdebug in the PHP runtime serving your website, with `xdebug.mode=debug` and `xdebug.start_with_request=trigger`.
2. Configure Xdebug’s client host and port so PHP can reach your IDE.
3. If you configured `xdebug.trigger_value`, enter the matching value in the extension.
4. Enable listening for PHP debug connections in your IDE and set a breakpoint.
5. Select **Debug** in the extension and request the PHP page again.

Profiling and tracing require the corresponding server-side Xdebug modes.

| Mode | Cookie |
| --- | --- |
| Debug | `XDEBUG_SESSION` |
| Profile | `XDEBUG_PROFILE` |
| Trace | `XDEBUG_TRACE` |
| Disable | Removes the three helper cookies |

## Behavior and limitations

- Settings stay in local browser storage. There is no analytics or uninstall survey.
- Changes apply to the next request; the extension does not automatically reload the page.
- Cookie scope follows upstream behavior: where allowed, a parent-domain cookie also affects sibling subdomains. Cookies are not isolated per tab or port.
- The helper does not remove `XDEBUG_TRIGGER` cookies or query parameters created by other tools. Those can independently trigger Xdebug.
- Restricted pages and websites without permission cannot be toggled. Grant access only to the development sites you need.
- Safari may reserve or ignore keyboard shortcuts. The toolbar popup is the primary control.
- UI labels retain upstream translations; new status and error messages are currently English.
- Automated browser checks cover cookie delivery, not a PHP/IDE connection. The native package and notarization were verified on macOS 27; older supported macOS versions still need testing.

## Develop

Clone the repository and use Node.js 22 or later:

```sh
git clone https://github.com/zaherg/xdebug-safari.git
cd xdebug-safari
npm ci
npm test
npm run test:browser
```

`npm test` runs dependency-free tests. `test:browser` uses the installed Google Chrome, real DOM elements, cookies, and a local HTTP server, with a simulated WebExtension API bridge. Set `CHROME_PATH` if Chrome is installed elsewhere. These checks do not replace testing in Safari against a PHP application.

For a local cookie-delivery check, run `npm run demo` and open `http://127.0.0.1:8765` in Safari. Allow extension access, select each mode, and reload to see the cookies received by the server. Stop the server with **Ctrl+C**.

### Load from source temporarily

Recent Safari versions can load `src/` directly:

1. Enable **Safari > Settings > Advanced > Show features for web developers**.
2. Open **Settings > Developer > Add Temporary Extension…**.
3. Select this repository’s **`src` folder** and approve Safari’s unsigned-extension prompt.
4. Enable the extension, grant website access, and reload the website.

Safari removes temporary extensions after 24 hours or when it quits. Reload the temporary extension in Safari’s settings after editing its files. If the temporary-install option is unavailable, use the Xcode build instead. See [Apple’s development instructions](https://developer.apple.com/documentation/safariservices/running-your-safari-web-extension).

### Build a signed macOS app

Install Xcode, accept its license, complete first-launch setup, and install your own Developer ID Application signing certificate. Supply your signing team through the environment:

```sh
TEAM_ID=YOUR_TEAM_ID npm run package:macos
```

The script also accepts `APPLE_TEAM_ID` as the team source. Override `DEVELOPER_DIR` or `SIGNING_IDENTITY` if necessary. No signing credentials are stored in this repository.

The Xcode project is `macos/Xdebug Helper for Safari/Xdebug Helper for Safari.xcodeproj` and references `src/` directly. The script builds for the current Mac’s architecture, signs with secure timestamping, verifies signatures and sandboxing, compares packaged resources against the source, and creates a ZIP under `build/`.

Packaging does **not** submit the app for notarization. For distribution, submit the ZIP with `xcrun notarytool`, require an **Accepted** result, staple and validate the app with `xcrun stapler`, verify it with `spctl --assess --type execute`, and create a new ZIP containing the stapled app. Keep credentials in your environment or Keychain. Never commit Apple account credentials, API keys, certificates, private keys, provisioning profiles, or notarization logs.

Build output is excluded from Git. The notarized app is distributed only as a [release asset](https://github.com/zaherg/xdebug-safari/releases).

## Credits and license

Based on upstream commit `ee97a1d3bde18fd32698e13bbe54bce125a433b5`, under the [MIT license](LICENSE), copyright Fraser Chapman. This is an independent port, not an official JetBrains or Apple release.

Upstream icon credits: [Freepik (bug)](https://www.flaticon.com/free-icons/bug), [rukanicon (trace)](https://www.freepik.com/icon/search_4529794), and [UIcons (profile)](https://www.freepik.com/icon/alarm-clock_3914623). The generated app icon reuses the upstream extension icon.
