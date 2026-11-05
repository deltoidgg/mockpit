import { readFileSync } from "node:fs"
import { expect, test, type Page } from "@playwright/test"

const BASE = "http://127.0.0.1:5190"
const overlay = (page: Page) => page.locator("mockpit-overlay")
const openDrawer = async (page: Page) => {
  await expect(overlay(page).locator(".mp-strip")).toBeVisible()
  if ((await overlay(page).locator(".mp-drawer").count()) === 0) await page.keyboard.press("Alt+KeyM")
  await expect(overlay(page).locator(".mp-drawer")).toBeVisible()
}
const state = (page: Page) =>
  page.evaluate(() => {
    const s = window.__MOCKPIT__!.state()
    return {
      stages: Object.fromEntries(Object.entries(s.ledger.endpoints).map(([key, entry]) => [key, entry.stage])),
      parity: s.ledger.endpoints["GET /api/customers/:id"]?.parity,
      served: Object.fromEntries(Object.entries(s.session).map(([key, entry]) => [key, entry.lastServedBy])),
      tiers: s.tiers,
    }
  })

test.describe.configure({ mode: "serial" })

test("inventories MSW handlers and hatches mocked values with no app code", async ({ page }) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(String(error)))
  page.on("console", (message) => message.type() === "warning" && errors.push(message.text()))
  await page.goto(`${BASE}/customers/1`)
  await expect(overlay(page).locator(".mp-strip")).toContainText("4 mocked")
  const s = await state(page)
  expect(s.stages).toMatchObject({
    "GET /api/customers": "mocked",
    "GET /api/customers/:id": "mocked",
    "GET /api/customers/:id/kyc": "mocked",
    "POST /api/customers/:id/notes": "mocked",
    "GET /api/me": "unmocked",
  })
  expect(s.tiers).toEqual(expect.arrayContaining(["msw", "react", "source"]))
  await expect.poll(() => overlay(page).locator(".mp-mock").count()).toBeGreaterThan(8)
  // Real data is silent.
  const realName = await page.getByText("Sam Rivera").boundingBox()
  const painted = await overlay(page).locator(".mp-region rect").evaluateAll((rects) => rects.map((rect) => rect.getBoundingClientRect().toJSON()))
  expect(painted.some((rect: DOMRect) => realName && Math.abs(rect.x - realName.x) < 4 && Math.abs(rect.y - realName.y) < 4)).toBe(false)
  expect(errors).toEqual([])
})

test("flips an endpoint to real, keeps the mock as a shadow and measures parity", async ({ page }) => {
  await page.goto(`${BASE}/customers/1`)
  await openDrawer(page)
  const row = overlay(page).locator(".mp-line", { hasText: "GET /api/customers/:id" }).first()
  await row.click()
  await overlay(page).locator(".mp-text-button", { hasText: "Flip to real" }).first().click()
  await page.reload()
  await expect.poll(async () => (await state(page)).stages["GET /api/customers/:id"]).toBe("shadowed")
  await expect.poll(async () => (await state(page)).parity?.score).toBeGreaterThan(0)
  const s = await state(page)
  expect(s.served["GET /api/customers/:id"]).toBe("real")
  expect(s.parity?.score).toBeGreaterThan(0.4)
  expect(s.parity?.score).toBeLessThan(0.7)
  expect(s.parity?.diffs.map((diff) => `${diff.kind} ${diff.path}`)).toEqual(
    expect.arrayContaining(["missing $.customer.email", "missing $.customer.address", "empty $.customer.tags"]),
  )
  await expect(page.getByRole("heading", { name: "Ada Lovelace" })).toBeVisible()
  await expect.poll(() => overlay(page).locator(".mp-shadow").count()).toBeGreaterThan(0)
  await expect(overlay(page).locator(".mp-strip")).toContainText("1 shadowed")
  await page.evaluate(() => window.__MOCKPIT__!.flush())
})

test("writes the ledger to the repo through the Vite plugin", async ({ page }) => {
  await page.goto(`${BASE}/customers/1`)
  await page.evaluate(() => window.__MOCKPIT__!.flush())
  const ledger = JSON.parse(readFileSync("examples/react-msw/.mockpit/ledger.json", "utf8"))
  expect(ledger.project).toBe("ledgerline")
  expect(ledger.endpoints["GET /api/customers/:id"].stage).toBe("shadowed")
  expect(JSON.stringify(ledger)).not.toContain("Ada Lovelace")
})

test("inspect card attributes a value to endpoint, path and component", async ({ page }) => {
  await page.goto(`${BASE}/customers/2`)
  const company = page.getByText("Compiler Works").first()
  await expect(company).toBeVisible()
  await expect.poll(() => overlay(page).locator(".mp-region").count()).toBeGreaterThan(3)
  const box = (await company.boundingBox())!
  await page.keyboard.down("Alt")
  await page.mouse.move(box.x + 10, box.y + box.height / 2)
  const card = overlay(page).locator(".mp-card")
  await expect(card).toContainText("GET /api/customers/:id")
  await expect(card).toContainText("$.customer.company")
  await expect(card).toContainText("Profile")
  await expect(card).toContainText("matched")
  await page.keyboard.up("Alt")
  await expect(card).toHaveCount(0)
})

test("drawer views: ledger, literals, keyboard", async ({ page }) => {
  await page.goto(`${BASE}/customers`)
  await openDrawer(page)
  await overlay(page).getByRole("tab", { name: "Ledger" }).click()
  await expect(overlay(page).locator(".mp-ledger-head")).toContainText("5 endpoints")
  await overlay(page).getByRole("tab", { name: "Literals" }).click()
  await expect(overlay(page).locator(".mp-literals")).toContainText("Balances refresh nightly at 02:00.")
  await page.keyboard.press("Escape")
  await expect(overlay(page).locator(".mp-drawer")).toHaveCount(0)
  await page.keyboard.press("Alt+KeyX")
  await expect.poll(() => overlay(page).locator(".mp-mock").count()).toBe(0)
  await page.keyboard.press("Alt+KeyX")
  await expect.poll(() => overlay(page).locator(".mp-mock").count()).toBeGreaterThan(0)
})
