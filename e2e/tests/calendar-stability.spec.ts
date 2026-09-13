import { test, expect } from "@playwright/test";

/**
 * The archive page re-renders on every `timeupdate` while audio plays. Any
 * component defined inside a render body is a new component *type* on each of
 * those renders, so React unmounts and remounts its subtree — and when that
 * component is the calendar's `Root`, the whole calendar DOM is rebuilt several
 * times a second. Month navigation then appears to ignore clicks, because a
 * mousedown and mouseup that land on different nodes produce no click event.
 *
 * These drive playback with a generated silent track: the dev server cannot
 * sign S3 URLs without AWS credentials, so nothing would play otherwise, and
 * without playback the bug does not occur at all.
 */

/** Point the media element at a silent track so `timeupdate` fires locally. */
async function startSilentPlayback(page: import("@playwright/test").Page) {
  const result = await page.evaluate(async () => {
    const audio = document.querySelector("audio");
    if (!audio) return { ok: false, reason: "no audio element" };

    const sampleRate = 8000;
    const samples = sampleRate * 2;
    const buffer = new ArrayBuffer(44 + samples);
    const view = new DataView(buffer);
    const ascii = (offset: number, text: string) => {
      for (let i = 0; i < text.length; i++) {
        view.setUint8(offset + i, text.charCodeAt(i));
      }
    };
    ascii(0, "RIFF");
    view.setUint32(4, 36 + samples, true);
    ascii(8, "WAVEfmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate, true);
    view.setUint16(32, 1, true);
    view.setUint16(34, 8, true);
    ascii(36, "data");
    view.setUint32(40, samples, true);
    for (let i = 0; i < samples; i++) view.setUint8(44 + i, 128);

    audio.src = URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
    audio.muted = true;
    audio.loop = true;
    try {
      await audio.play();
    } catch (error) {
      return { ok: false, reason: String(error) };
    }

    let ticks = 0;
    audio.addEventListener("timeupdate", () => ticks++);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return { ok: ticks > 0, ticks };
  });

  expect(
    result.ok,
    `could not drive playback, so this test proves nothing: ${JSON.stringify(result)}`
  ).toBe(true);
}

async function openDatePicker(page: import("@playwright/test").Page) {
  // The trigger is labelled with the selected date, e.g. "September 12, 2026".
  await page
    .getByRole("button", { name: /^\w+ \d{1,2}, \d{4}$/ })
    .first()
    .click();
  // PopoverContent portals to <body>, so locate page-wide.
  await expect(page.locator(".rdp-month_caption")).toBeVisible();
}

test.describe("calendar stability during playback", () => {
  test("the calendar is not rebuilt while the page re-renders", async ({
    page,
  }) => {
    await page.goto("/");
    await startSilentPlayback(page);
    await openDatePicker(page);

    const removals = await page.evaluate(async () => {
      let count = 0;
      const observer = new MutationObserver((records) => {
        for (const record of records) {
          record.removedNodes.forEach((node) => {
            if (node instanceof HTMLElement && node.classList.contains("rdp-root")) {
              count++;
            }
          });
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      await new Promise((resolve) => setTimeout(resolve, 3000));
      observer.disconnect();
      return count;
    });

    expect(
      removals,
      "the calendar root was torn down mid-interaction; a component is being defined during render"
    ).toBe(0);
  });

  test("a human-paced click on previous-month registers", async ({ page }) => {
    await page.goto("/");
    await startSilentPlayback(page);
    await openDatePicker(page);

    const caption = page.locator(".rdp-month_caption");
    const before = (await caption.textContent())?.trim() ?? "";
    expect(before).not.toBe("");

    const prev = page.getByRole("button", { name: /previous month/i });
    const box = await prev.boundingBox();
    expect(box, "previous-month button has no box").not.toBeNull();

    // Deliberately NOT locator.click(): Playwright re-resolves the locator and
    // retries, which papers over exactly the failure being guarded against. A
    // real click is a mousedown and a mouseup on the SAME node, separated by
    // human reaction time — and if a re-render replaces the node in between,
    // the browser fires no click event at all.
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    // Held for a full second on purpose. The failure is a race — the button
    // has to be replaced between mousedown and mouseup — and the broken build
    // rebuilds roughly six times a second, so a brief hold slips through the
    // gap about a quarter of the time and the test flakes green. A second-long
    // hold spans several rebuilds, which makes the failure deterministic.
    await page.mouse.down();
    await page.waitForTimeout(1000);
    await page.mouse.up();

    const after = (await caption.textContent())?.trim() ?? "";
    expect(
      after,
      "the click was swallowed: the button was replaced between mousedown and mouseup"
    ).not.toBe(before);
  });
});
