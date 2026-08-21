import { expect, test, type Page } from "playwright/test"

test.beforeEach(async ({ page }) => {
  await page.goto("/projects")
})

test("creates an MVP circuit, persists it, generates code, measures, and simulates", async ({
  page,
}) => {
  await page.getByTestId("new-empty-project").click()
  await expect(page.getByTestId("editor-page")).toBeVisible()
  await expect(page).toHaveURL(/\/projects\/prj_[^/]+\/editor$/)

  const svgBox = await page.locator("svg.schematic-canvas").boundingBox()
  if (!svgBox) {
    throw new Error("Expected canvas bounding box")
  }

  await expectClickDoesNotPlaceSymbol(page, svgBox)
  await placeSymbol(page, svgBox, "DC Voltage Source", 120, 160)
  await placeSymbol(page, svgBox, "Resistor", 240, 160)
  await placeSymbol(page, svgBox, "Capacitor", 360, 160)
  await placeToolObject(page, svgBox, "Ground", 400, 240)
  await drawWire(page, svgBox, 80, 160, 80, 120)
  await drawWire(page, svgBox, 80, 120, 200, 120)
  await drawWire(page, svgBox, 200, 120, 200, 160)
  await drawWire(page, svgBox, 280, 160, 320, 160)
  await drawWire(page, svgBox, 400, 160, 400, 240)
  await drawWire(page, svgBox, 160, 160, 160, 240)
  await drawWire(page, svgBox, 160, 240, 400, 240)
  await placeToolObject(page, svgBox, "Voltage Probe", 300, 160)
  await placeToolObject(page, svgBox, "Net Label", 300, 160)

  await page.getByRole("button", { name: /^Select/ }).click()
  await page.locator("svg").getByText("NET1", { exact: true }).click()
  await page.getByLabel("Net name").fill("VOUT")
  await expect(page.locator("svg").getByText("VOUT", { exact: true })).toBeVisible()

  const saveButton = page.getByRole("button", { name: "Save" })
  await expect(saveButton).toBeEnabled()
  await saveButton.click()
  await expect(saveButton).toBeDisabled()

  await expect(page.locator("svg .symbol")).toHaveCount(3)
  expect(await page.locator("svg polyline.wire").count()).toBeGreaterThanOrEqual(5)
  expect(
    await page.locator("svg .symbol .symbol-body").first().evaluate((element) =>
      getComputedStyle(element).stroke,
    ),
  ).not.toBe("none")
  await expect(page.getByText("ERC 0", { exact: false })).toBeVisible()

  await page.getByTestId("bottom-tab-code").click()
  await expect(page.getByText("Generated tscircuit TSX")).toBeVisible()
  await expect(page.locator(".code-panel pre")).toContainText("<resistor")
  await expect(page.locator(".code-panel pre")).toContainText("<voltageprobe")

  await page.getByTestId("bottom-tab-preview").click()
  await expect(page.locator(".preview-panel pre")).toContainText("<capacitor")

  await page.reload()
  await expect(page.getByTestId("editor-page")).toBeVisible()
  await expect(page.locator("svg .symbol")).toHaveCount(3)
  await expect(page.locator("svg").getByText("VOUT", { exact: true })).toBeVisible()

  await page.getByTestId("bottom-tab-measurements").click()
  await expect(page.getByTestId("measurements-panel")).toBeVisible()
  await expect(page.getByRole("cell", { name: "VP1" })).toBeVisible()

  await page.getByTestId("run-spice-simulation").click()
  await expect(page.getByTestId("simulation-panel")).toBeVisible()
  await expect(page.getByText("SPICE netlist")).toBeVisible()
  await expect(page.getByText("Engine:", { exact: false })).toBeVisible()
})

test("supports core canvas editing shortcuts", async ({ page }) => {
  await page.getByTestId("new-empty-project").click()
  await expect(page.getByTestId("editor-page")).toBeVisible()

  const svgBox = await page.locator("svg.schematic-canvas").boundingBox()
  if (!svgBox) {
    throw new Error("Expected canvas bounding box")
  }

  await placeSymbol(page, svgBox, "Resistor", 180, 160)
  await placeSymbol(page, svgBox, "Capacitor", 320, 160)
  await expect(page.locator("svg .symbol")).toHaveCount(2)

  await page.getByRole("button", { name: /^Select/ }).click()
  await page.locator("svg .symbol").first().click({ force: true })
  await expect(page.getByTestId("canvas-status")).toContainText("selected 1")

  await page.keyboard.press("Shift+D")
  await expect(page.locator("svg .symbol")).toHaveCount(3)

  await page.getByRole("button", { name: "Copy", exact: true }).click()
  await page.getByRole("button", { name: "Paste", exact: true }).click()
  await expect(page.locator("svg .symbol")).toHaveCount(4)

  await page.getByRole("button", { name: "Undo" }).click()
  await expect(page.locator("svg .symbol")).toHaveCount(3)
  await page.getByRole("button", { name: "Redo" }).click()
  await expect(page.locator("svg .symbol")).toHaveCount(4)

  await page.locator("svg .symbol").first().click({ force: true })
  await expect(page.getByTestId("canvas-status")).toContainText("selected 1")
  await page.locator("svg .symbol").nth(1).click({ modifiers: ["Shift"], force: true })
  await expect(page.locator("svg .symbol.selected")).toHaveCount(2)
  await page.getByRole("button", { name: "Align H" }).click()
  await page.keyboard.press("ArrowRight")
  await expect(page.locator("svg .symbol.selected")).toHaveCount(2)

  await page.getByTestId("zoom-in").click()
  await page.getByTestId("zoom-out").click()
  await page.getByTestId("zoom-fit").click()
  await expect(page.getByTestId("zoom-level")).toHaveText(/%/)
})

async function placeSymbol(
  page: Page,
  svgBox: { x: number; y: number },
  buttonName: string,
  worldX: number,
  worldY: number,
) {
  await page.getByRole("button", { name: new RegExp(buttonName) }).click()
  await page.mouse.move(svgBox.x + worldX + 80, svgBox.y + worldY + 80)
  await page.mouse.down()
  await page.mouse.move(svgBox.x + worldX + 160, svgBox.y + worldY + 80)
  await page.mouse.up()
}

async function placeToolObject(
  page: Page,
  svgBox: { x: number; y: number },
  buttonName: string,
  worldX: number,
  worldY: number,
) {
  await page.getByRole("button", { name: new RegExp(`^${buttonName}`) }).click()
  await page.mouse.click(svgBox.x + worldX + 120, svgBox.y + worldY + 80)
}

async function drawWire(
  page: Page,
  svgBox: { x: number; y: number },
  startX: number,
  startY: number,
  endX: number,
  endY: number,
) {
  await page.getByRole("button", { name: /^Wire/ }).click()
  await page.mouse.click(svgBox.x + startX + 120, svgBox.y + startY + 80)
  await page.mouse.click(svgBox.x + endX + 120, svgBox.y + endY + 80)
}

async function expectClickDoesNotPlaceSymbol(
  page: Page,
  svgBox: { x: number; y: number },
) {
  await page.getByRole("button", { name: /Resistor/ }).click()
  await page.mouse.click(svgBox.x + 300, svgBox.y + 240)
  await expect(page.locator("svg .symbol")).toHaveCount(0)
}
