# distortion-waves (vendored)

Source of the React/web build of **Distortion waves** by Jakub Antalik, from
[github.com/Jakubantalik/Libraries.dev](https://github.com/Jakubantalik/Libraries.dev)
(`packages/distortion-waves/src`, commit `14ae9d2`). MIT — see [LICENSE](LICENSE).
Docs: https://libraries.dev/waves

Kept as source (not the npm package) so the code the app ships is the code that
was read, and so it type-checks with the app.

Local change, marked `Rudge:` in the code:

- `capture.ts` → `backgroundOf` reads the CSS property `--dw-bg` first. The app's
  surfaces are translucent glass; this names the opaque colour behind them so the
  picture under the lens matches the screen.

How Rudge uses it: `src/components/Wave.tsx`.
