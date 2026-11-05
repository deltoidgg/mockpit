import { expect, test, type Page } from "@playwright/test"

const BASE = "http://127.0.0.1:5191"
const overlay = (page: Page) => page.locator("mockpit-overlay")
const toggleDrawer = async (page: Page, open: boolean) => {
  await expect(overlay(page).locator(".mp-strip")).toBeVisible()
  if (((await overlay(page).locator(".mp-drawer").count()) > 0) !== open) await page.keyboard.press("Alt+KeyM")
}
const snapshot = (page: Page) =>
  page.evaluate(() => {
    const s = window.__MOCKPIT__!.state()
    return {
      inventory: s.inventory,
      tiers: s.tiers,
      stages: Object.fromEntries(Object.entries(s.ledger.endpoints).map(([key, entry]) => [key, entry.stage])),
      session: s.session,
      parity: s.ledger.endpoints["RPC ListMenu"]?.parity,
    }
  })

test.describe.configure({ mode: "serial" })

test("mock Layers are inventory, calls are traced to Foldkit Commands", async ({ page }) => {
  const warnings: string[] = []
  page.on("console", (message) => message.type() === "warning" && warnings.push(message.text()))
  page.on("pageerror", (error) => warnings.push(String(error)))
  await page.goto(BASE)
  await expect(page.getByText("Rye and miso cookie")).toBeVisible()
  await expect.poll(async () => (await snapshot(page)).session["RPC ListMenu"]?.command).toBe("FetchMenu")
  const s = await snapshot(page)
  expect(s.inventory).toEqual(["RPC GetHours", "RPC GetSpecial", "RPC ListMenu"])
  expect(s.tiers).toContain("effect")
  expect(s.stages).toEqual({ "RPC GetHours": "mocked", "RPC GetSpecial": "mocked", "RPC ListMenu": "mocked" })
  await expect.poll(() => overlay(page).locator(".mp-mock").count()).toBeGreaterThan(6)
  expect(warnings).toEqual([])
})

test("flipping a procedure to the real Worker measures it against the Schema contract", async ({ page }) => {
  await page.goto(BASE)
  await toggleDrawer(page, true)
  await overlay(page).locator(".mp-line", { hasText: "RPC GetSpecial" }).click()
  await overlay(page).locator(".mp-text-button", { hasText: "Flip to real" }).click()
  await toggleDrawer(page, false)
  await page.getByRole("button", { name: "Refresh" }).click()
  await expect.poll(async () => (await snapshot(page)).stages["RPC GetSpecial"]).toBe("shadowed")
  const s = await page.evaluate(() => window.__MOCKPIT__!.state().ledger.endpoints["RPC GetSpecial"]!.parity)
  expect(s?.against).toBe("schema")
  expect(s?.diffs.map((diff) => `${diff.kind} ${diff.path}`)).toContain("missing $.pairing")
  // The real Worker lacks `pairing`, so the shared contract rejects the response: failing, not silently wrong.
  await expect.poll(async () => (await snapshot(page)).session["RPC GetSpecial"]?.failing).toBe(true)
})

test("inspect card shows the Command that loaded a value", async ({ page }) => {
  await page.goto(BASE)
  const item = page.getByText("Oat cortado")
  await expect(item).toBeVisible()
  await expect.poll(() => overlay(page).locator(".mp-region").count()).toBeGreaterThan(3)
  const box = (await item.boundingBox())!
  await page.keyboard.down("Alt")
  await page.mouse.move(box.x + 8, box.y + box.height / 2)
  const card = overlay(page).locator(".mp-card")
  await expect(card).toContainText("RPC ListMenu")
  await expect(card).toContainText("command FetchMenu")
  await page.keyboard.up("Alt")
})
