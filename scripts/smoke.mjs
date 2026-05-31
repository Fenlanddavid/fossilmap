import fs from "node:fs";
import process from "node:process";

const baseUrl = process.env.FOSSILMAP_BASE_URL || "http://127.0.0.1:5173/fossilmap/";
const chromiumPath = process.env.CHROMIUM_PATH || "/nix/store/r7ifk1v95jfl02775kgbrd61dyr1rfsx-chromium-148.0.7778.178/bin/chromium";

async function loadPlaywright() {
  try {
    return await import("@playwright/test");
  } catch (localError) {
    const fallback = "/home/david/findspot/node_modules/@playwright/test/index.js";
    if (fs.existsSync(fallback)) return await import(fallback);
    throw localError;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function getStoreRows(page, storeName) {
  return page.evaluate((name) => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("fossilmap_uk");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(name, "readonly");
        const rows = tx.objectStore(name).getAll();
        rows.onerror = () => reject(rows.error);
        rows.onsuccess = () => resolve(rows.result);
      };
    });
  }, storeName);
}

const playwright = await loadPlaywright();
const chromium = playwright.chromium || playwright.default?.chromium;
if (!chromium) throw new Error("Playwright loaded, but chromium launcher was not found");
const launchOptions = fs.existsSync(chromiumPath)
  ? { executablePath: chromiumPath, args: ["--no-sandbox", "--disable-crash-reporter", "--disable-crashpad"] }
  : { args: ["--no-sandbox"] };

const browser = await chromium.launch({ headless: true, ...launchOptions });
const errors = [];

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true });
  await context.addInitScript(() => {
    localStorage.setItem("fm_onboarding_done", "1");
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (text.includes("TypeError: Failed to fetch") && text.includes("maplibre-gl")) return;
    errors.push(`console: ${text}`);
  });

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  assert(await page.getByText("Record the fossil, the place and the evidence together.").isVisible(), "Home dashboard did not render");

  await page.getByRole("link", { name: /Settings/i }).click();
  await page.getByText("Profile, storage and quick start.").waitFor();

  await page.goto(`${baseUrl.replace(/\/$/, "")}/location`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder(/Charmouth|Lyme Regis/i).fill("Smoke Test Locality");
  await page.getByPlaceholder(/Name or initials/i).fill("Smoke Tester");
  await page.getByRole("button", { name: /Create Location/i }).click();
  await page.getByText(/Location updated|Record completeness|Location Details/i).waitFor({ timeout: 6000 }).catch(() => {});

  await page.goto(`${baseUrl.replace(/\/$/, "")}/specimen`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder(/Charmouth|Lyme Regis/i).fill("Smoke Test Locality");
  await page.getByPlaceholder(/Dactylioceras/i).fill("Ammonite");
  await page.getByRole("button", { name: /Save Specimen Draft|Record Find/i }).click();
  await page.getByText(/Find Recorded|Record find first to unlock photos/i).waitFor({ timeout: 6000 });

  const specimens = await getStoreRows(page, "specimens");
  assert(specimens.length > 0, "Specimen was not written to IndexedDB");
  const specimenId = specimens[0].id;

  await page.goto(`${baseUrl.replace(/\/$/, "")}/specimen?id=${encodeURIComponent(specimenId)}`, { waitUntil: "domcontentloaded" });
  await page.getByText("Edit Find").waitFor({ timeout: 6000 });
  await page.waitForFunction(() => Array.from(document.querySelectorAll("input")).some((input) => input.value === "Ammonite"));
  await page.getByPlaceholder(/Dactylioceras/i).fill("Edited Smoke Ammonite");
  await page.getByRole("button", { name: /Save Changes/i }).click();
  await page.waitForTimeout(500);
  const editedSpecimens = await getStoreRows(page, "specimens");
  assert(editedSpecimens.some((item) => item.id === specimenId && item.taxon === "Edited Smoke Ammonite"), "Edited specimen was not saved");

  await page.goto(`${baseUrl.replace(/\/$/, "")}/field-trip`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder(/Charmouth|Lyme Regis/i).fill("Smoke Test Field Trip");
  await page.getByPlaceholder(/Name or initials/i).fill("Smoke Tester");
  await page.getByRole("button", { name: /Start Field Trip/i }).click();
  await page.getByRole("button", { name: /PDF Report/i }).waitFor({ timeout: 6000 });

  await page.goto(`${baseUrl.replace(/\/$/, "")}/map`, { waitUntil: "domcontentloaded" });
  await page.getByText(/Legend/i).waitFor({ timeout: 8000 });

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.getByText(/Recent finds/i).waitFor();

  await page.goto(`${baseUrl.replace(/\/$/, "")}/settings`, { waitUntil: "domcontentloaded" });
  await page.getByText("Profile, storage and quick start.").waitFor();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Records only/i }).click();
  const download = await downloadPromise;
  assert(download.suggestedFilename().includes("records-only"), "Records-only backup did not start");

  await page.getByRole("button", { name: /Show quick start/i }).click();
  await page.getByText(/FossilMap quick start/i).waitFor({ timeout: 6000 });

  if (errors.length > 0) throw new Error(errors.join("\n"));
  console.log("FossilMap smoke passed");
} finally {
  await browser.close();
}
