# Tauri + Vanilla TS

This template should help get you started developing with Tauri in vanilla HTML, CSS and Typescript.

## MCP bridge plugin

The app is now configured with the Rust-side Tauri MCP bridge plugin for development builds. It registers the plugin in [src-tauri/src/lib.rs](src-tauri/src/lib.rs) and grants the default capability in [src-tauri/capabilities/default.json](src-tauri/capabilities/default.json).

To run the app with the plugin enabled:

```bash
npm install
cargo check --manifest-path src-tauri/Cargo.toml
npm run tauri dev
```

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
