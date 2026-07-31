import { syncAcustockCatalog } from "@tgs/database";

export const ACUSTOCK_SYNC_INTERVAL_MS = 4 * 60 * 60 * 1_000;

export async function runAcustockSyncLoop() {
  const once = process.argv.includes("--once");
  do {
    try {
      const result = await syncAcustockCatalog();
      console.log(JSON.stringify({ level: "info", task: "acustock-catalog", ...result }));
    } catch (error) {
      console.error(JSON.stringify({ level: "error", task: "acustock-catalog", error: String(error) }));
    }
    if (once) break;
    await new Promise((resolve) => setTimeout(resolve, ACUSTOCK_SYNC_INTERVAL_MS));
  } while (true);
}
