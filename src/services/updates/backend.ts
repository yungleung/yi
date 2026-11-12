/**
 * Adapts Tauri's updater and process plugins to the update domain's ports.
 *
 * Example: Tauri's `Update` resource becomes a remote update whose
 * `install()` downloads and installs that exact signed artifact.
 *
 * May import: the official Tauri updater and process packages, plus updater
 * contracts. Upholds: plugin resources are released when installation is
 * declined.
 */

import { relaunch } from '@tauri-apps/plugin-process';
import { check } from '@tauri-apps/plugin-updater';
import type { RemoteUpdate, UpdateBackend } from './contracts';

/** How long GitHub may take before a manual or startup check gives up. */
const CHECK_TIMEOUT_MS = 30_000;

/** The desktop implementation of the update ports. */
export class TauriUpdateBackend implements UpdateBackend {
  async check(): Promise<RemoteUpdate | null> {
    const update = await check({ timeout: CHECK_TIMEOUT_MS });
    if (!update) {
      return null;
    }
    return {
      version: update.version,
      currentVersion: update.currentVersion,
      notes: update.body ?? null,
      date: update.date ?? null,
      install: async () => {
        await update.downloadAndInstall();
      },
      discard: async () => {
        await update.close();
      }
    };
  }

  async relaunch(): Promise<void> {
    await relaunch();
  }
}
