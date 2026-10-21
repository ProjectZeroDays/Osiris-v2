# Release Documentation

How a release is built, what is in it, and what is verified before it is
published.

## The process

1. **Build the desktop app.** `npm run dist` in `electron-app/`. It
   produces the standalone binary and the NSIS installer.
2. **Build the Android app.** `gradle assembleRelease` in `android-app/`.
   The unsigned APK is signed with `apksigner` and verified.
3. **Copy the artefacts** into `releases/`.
4. **Write the release notes.** `releases/RELEASE-NOTES.md` — what
   changed, what was verified, and what is still known to be wrong.
5. **Package** the four artefacts into `releases/osiris-release-<version>.zip`.
6. **Verify the package.** Open the zip and check the four files are
   there and are the right size.
7. **Tag and push.** The `release-package` job in CI builds the GitHub
   Release from a `v*` tag.

The CI/CD pipeline does steps 1, 2, 3 and 5 on the tag; the notes are
written by hand, because a note that nobody wrote says nothing.

## What is in a release

| File | What it is |
|------|------------|
| `electron.exe` | The Windows desktop app, standalone |
| `osiris-electron-<version>-x64.nsis.exe` | The Windows installer |
| `osiris-app-release.apk` | The Android app, signed |
| `RELEASE-NOTES.md` | What changed, and what was verified |

The web platform is not in the package. It is a deployment, not a
binary: it runs from the repository, and it is reached over HTTP by the
two native apps.

## Verification, before anything is published

- The Android APK is signed and `apksigner verify` says so, with the v2
  and v3 signature schemes.
- The Electron build produces both the standalone binary and the
  installer, and the new platform client is inside the package rather
  than left behind.
- The JavaScript and TypeScript suite passes, with and without a
  database.
- The Python suite passes: the worker's safety module, its routes
  driven over HTTP, and its tool isolation.
- `tsc --noEmit` is clean.
- The linter finishes, with no errors.
- The desktop client's session is tested against a running platform: a
  wrong password is refused, a capability without a session is refused
  with 401, the token is not in the file in the clear, the token is not
  exported to the renderer, and signing out revokes the session at once.

## The current release

**v1.0.19** — `releases/osiris-release-1.0.19.zip` (157 MB)

| Artefact | Size |
|----------|------|
| `electron.exe` | 169 MB |
| `osiris-app-release.apk` | 10.31 MB |
| `osiris-electron-1.0.19-x64.nsis.exe` | 73.3 MB |

The notes for it are in `releases/RELEASE-NOTES.md`.

## Code signing

The Windows binaries are unsigned. Signing needs a certificate from a
certificate authority, which is an external dependency: the build
already knows what to do with one.

- `CSC_LINK` — the certificate, as a path or a base64 blob
- `CSC_KEY_PASSWORD` — the certificate's password

With both set, `electron-builder` signs the installer and the
standalone binary, and the `electron-build` job in CI picks them up from
the repository's secrets.

The Android APK is signed with a keystore held in the repository's
secrets:

- `ANDROID_KEYSTORE_BASE64` — the base64-encoded keystore
- `ANDROID_KEYSTORE_PASSWORD` — the keystore's password
- `ANDROID_KEY_ALIAS` — the key's alias
- `ANDROID_KEY_PASSWORD` — the key's password

## What is still known to be wrong

- The Windows executables are unsigned, as above.
- In a local `next build` output the map's dynamic chunk is not
  requested by the client, so the globe does not initialise. This
  reproduces with the security-tool changes reverted, and the deployed
  build renders the globe correctly.
- The tool registry endpoint is open to anyone who can reach the
  platform. It is metadata rather than data, but it does name the
  platform's capabilities, and a deployment that wants it closed has no
  way to close it.
