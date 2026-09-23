# Contributing

Open an issue or pull request at [zaherg/xdebug-safari](https://github.com/zaherg/xdebug-safari).

## Development

The web extension lives in `src/` and uses plain JavaScript, HTML, and CSS. The macOS wrapper lives in `macos/` and references `src/` directly. See the [README](README.md) for Safari loading, testing, and signing instructions.

```sh
npm ci
npm test
npm run test:browser
```

The GitHub Actions workflow runs unit tests and syntax checks. It does not sign, notarize, or publish apps. The legacy Chromium/Firefox helpers under `test/` and `build.sh` are inherited from upstream and are not the Safari release workflow.

## Release a Safari build

1. Update the version in `src/manifest.json`, `package.json`, and `package-lock.json` together.
2. Run the tests and build locally with `TEAM_ID` supplied through the environment:

   ```sh
   npm run package:macos
   ```

3. Notarize the archive with your own Apple credentials. Confirm **Accepted**, staple the app, and validate its signature, ticket, and Gatekeeper assessment.
4. Create a ZIP of the stapled app and check the extracted archive again.
5. Commit source only. Keep `build/`, credentials, signing keys, certificates, provisioning profiles, and notarization logs out of Git.
6. Create a version tag and a GitHub release. Upload only the approved notarized ZIP and its checksum, with short installation and compatibility notes.

Use an environment variable or Keychain profile for Apple authentication. Do not put credential values in command examples, issue reports, workflow files, or logs. A signed app necessarily contains its public signing identity; it must never contain private signing keys or account credentials.
