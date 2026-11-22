import { test, expect, type Page } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";

async function gotoReady(page: Page, path: string) {
  const settings = page.waitForResponse(response => response.url().endsWith('/api/settings') && response.request().method() === 'GET');
  await page.goto(path);
  const data = await (await settings).json();
  const preference = data.preferences?.themePreference;
  const expectedTheme = preference === 'dark' ? 'dark' : 'light';
  await expect(page.locator('html')).toHaveAttribute('data-theme', expectedTheme);
  // Read contrast after the saved theme and its CSS transitions have settled.
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter(animation => animation.playState === 'running' && animation.effect?.getComputedTiming().iterations !== Infinity).length)).toBe(0);
}

test("content-first case creation and run setup preserve data and recover from errors", async ({page}) => {
  await page.goto('/cases');
  await page.getByRole('button', {name:'New case',exact:true}).click();
  await expect(page.getByLabel('Key', {exact:true})).not.toBeVisible();
  await page.getByLabel('Title', {exact:true}).fill(`UX check ${Date.now()}`);
  await page.getByLabel('Step 1 action', {exact:true}).fill('Open checkout');
  await page.getByLabel('Step 1 expected', {exact:true}).fill('Cart is visible');
  await page.getByRole('button', { name: /Case details/ }).click();
  await expect(page.getByLabel('Key', {exact:true})).not.toHaveValue('');
  await page.getByLabel('Description', {exact:true}).fill('Keep this optional context');
  await page.getByRole('button', { name: /Case details/ }).click();
  const created = page.waitForResponse(r=>r.url().endsWith('/api/cases') && r.request().method()==='POST');
  await page.getByRole('button', {name:'Save case',exact:true}).click();
  const response = await created; expect(response.ok()).toBeTruthy();
  const body = response.request().postDataJSON();
  expect(body.description).toBe('Keep this optional context');
  expect(body.structuredSteps[0].action).toBe('Open checkout');
  const data = await response.json();
  await expect(page).toHaveURL(new RegExp(`case=${data.case.key}`));
  await expect(page.getByRole('button', {name:'Save case',exact:true})).not.toBeVisible();
  await page.goto(`/runs/new?cases=${data.case.id}`);
  const runOptions = page.getByRole('button', { name: /Run options/ });
  await expect(runOptions).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('status').filter({ hasText: 'Enter a run name to continue.' }).first()).toBeVisible();
  const runName = page.getByRole('textbox', { name: 'Run name', exact: true });
  await expect(runName).toBeEditable();
  await runName.fill('UX review run');
  await runOptions.click();
  await expect(runOptions).toHaveAttribute('aria-expanded', 'true');
  const environment = page.getByLabel('Environment',{exact:true}).locator('visible=true');
  await environment.fill('');
  await expect(page.getByRole('button',{name:/Create run ·/})).toBeDisabled();
  await expect(page.getByRole('status').filter({ hasText: 'Enter an environment in Run options.' }).first()).toBeVisible();
  await environment.fill('staging');
  await expect(environment).toBeVisible();
  await runOptions.click();
  await expect(runOptions).toHaveAttribute('aria-expanded', 'false');
  await page.route('**/api/runs', route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Temporary test outage. Try again.'})}));
  await page.getByRole('button',{name:/Create run ·/}).click();
  await expect(page.getByRole('alert').filter({hasText:'Temporary test outage'})).toBeVisible();
  await expect(runName).toHaveValue('UX review run');
  await page.unroute('**/api/runs');
  const runResponse = page.waitForResponse(r=>r.url().endsWith('/api/runs') && r.request().method()==='POST');
  await page.getByRole('button',{name:/Create run ·/}).click();
  const run = await (await runResponse).json();
  await expect(page).toHaveURL(new RegExp(`/runs/${run.run.id}(?:\\?.*)?$`), {timeout:20000});
  await expect(page.getByRole('heading',{name:'UX review run',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Start',exact:true}).click();
  await page.getByRole('button',{name:/^Failed 0$/}).click();
  await expect(page.getByText('No cases match these filters.')).toBeVisible();
  await page.getByRole('button',{name:'Clear filters',exact:true}).click();
  await expect(page.getByRole('button',{name:/^All 1$/})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:/^Mark [^ ]+ as passed$/}).click();
  await expect(page.getByRole('button',{name:/^Mark [^ ]+ as passed$/})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByRole('button',{name:'Abort run',exact:true})).not.toBeVisible();
  await page.getByRole('button',{name:'More actions',exact:true}).click();
  await page.getByRole('menuitem',{name:'Abort run',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Abort this run?'})).toBeVisible();
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
});

test("integration disclosures preserve direct links and keyboard access", async ({page})=>{
  await page.goto('/settings?section=integrations');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  const ciTrigger = page.locator('#ci').getByRole('button').first();
  await expect(ciTrigger).toHaveAttribute('aria-expanded', 'false');
  await ciTrigger.focus();
  await page.keyboard.press('Enter');
  await expect(ciTrigger).toHaveAttribute('aria-expanded', 'true');
  await page.goto('/settings?section=integrations#webhooks');
  await expect(page.locator('#webhooks').getByRole('button').first()).toHaveAttribute('aria-expanded', 'true');
  await page.goto('/settings?section=integrations#ci');
  await expect(page.locator('#ci').getByRole('button').first()).toHaveAttribute('aria-expanded', 'true');
  await page.locator('#webhooks').getByRole('button').first().click();
  await expect(page.locator('#webhooks').getByRole('button').first()).toHaveAttribute('aria-expanded', 'false');
  await page.goto('/settings?section=integrations#webhooks');
  await expect(page.locator('#webhooks').getByRole('button').first()).toHaveAttribute('aria-expanded', 'true');
  await page.goBack();
  await expect(page.locator('#ci').getByRole('button').first()).toHaveAttribute('aria-expanded', 'true');
  await page.goto('/settings?section=ci');
  await expect(page.locator('#ci').getByRole('button').first()).toHaveAttribute('aria-expanded', 'true');
});

for (const width of [320,768,1440]) {
 test(`core screens reflow and accessibility at ${width}px`, async({page},testInfo)=>{
  await page.setViewportSize({width,height:1000});
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  for (const route of ['/', '/cases', '/runs/new', '/settings?section=integrations']) {
    await gotoReady(page, route); await expect(page.locator('main h1')).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    const scan=await new AxeBuilder({page}).include('main').withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
    expect(scan.violations.filter(v=>v.impact==='serious'||v.impact==='critical')).toEqual([]);
    await page.screenshot({caret: "initial", path:`test-results/ux-simplification/${testInfo.project.name}-${width}-${route==='/'?'home':route.split('?')[0].replaceAll('/','-')}.png`,fullPage:true});
  }
  expect(errors).toEqual([]);
 });
}

test("filtering does not silently change the chosen cases", async ({page}) => {
  await page.goto('/runs/new');
  await expect(page.getByRole('heading', { name: 'Start a run' })).toBeVisible();
  const create = page.getByRole('button',{name:/Create run ·/});
  const initial = await create.textContent();
  const caseSearch = page.locator('[data-slot="search-field-input"]');
  await caseSearch.fill('no-matching-ux-case');
  await expect(page.getByText(/selected cases are outside these filters/)).toBeVisible();
  await expect(create).toHaveText(initial!);
  await page.getByRole('button',{name:'Clear filters',exact:true}).click();
  await expect(page.locator('[data-slot="search-field-input"]')).toHaveValue('');
  await expect(create).toHaveText(initial!);
});

test('empty run search has a clear recovery path', async ({page})=>{
  await page.goto('/runs?q=completed');
  await expect(page.locator('main a[href^="/runs/"]:not([href="/runs/new"])').first()).toBeVisible();
  await page.goto('/runs?q=no-such-ux-run');
  await expect(page.locator('#main-content').getByText('No runs match these filters.')).toBeVisible();
  await page.getByRole('button',{name:'Clear filters',exact:true}).click();
  await expect(page.locator('#main-content').getByText('No runs match these filters.')).not.toBeVisible();
  await expect(page.locator('main a[href^="/runs/"]:not([href="/runs/new"])').first()).toBeVisible({timeout:20000});
});

for (const theme of ['Light', 'Dark']) {
  test(`secondary screens and execution in ${theme.toLowerCase()} theme`, async ({page},testInfo)=>{
    const errors:string[]=[];
    page.on('pageerror', error=>errors.push(error.message));
    page.on('console', message=>{if(message.type()==='error') errors.push(message.text());});
    await gotoReady(page, '/');
    const savedTheme = page.waitForResponse(response => response.url().endsWith('/api/settings') && response.request().method() === 'PATCH');
    await page.getByRole('radiogroup', { name: 'Color theme' }).getByRole('radio', { name: `${theme} theme`, exact: true }).click();
    await savedTheme;
    for (const route of ['/runs','/plans','/reports','/triage','/automation']) {
      await gotoReady(page, route);
      await expect(page.locator('main h1')).toBeVisible();
      const scan=await new AxeBuilder({page}).include('main').withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
      expect(scan.violations.filter(v=>v.impact==='serious'||v.impact==='critical')).toEqual([]);
      await page.screenshot({caret: "initial", path:`test-results/ux-simplification/${testInfo.project.name}-${theme}-${route.slice(1)}.png`,fullPage:true});
    }
    await page.goto('/runs');
    await page.locator('main a[href^="/runs/"]:not([href="/runs/new"])').first().click();
    await expect(page.getByLabel('Search cases',{exact:true})).toBeVisible();
    for (const width of [320,1440]) {
      await page.setViewportSize({width,height:1000});
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
      const scan=await new AxeBuilder({page}).include('main').withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
      expect(scan.violations.filter(v=>v.impact==='serious'||v.impact==='critical')).toEqual([]);
      await page.screenshot({caret: "initial", path:`test-results/ux-simplification/${testInfo.project.name}-${theme}-execution-${width}.png`,fullPage:true});
    }
    expect(errors).toEqual([]);
  });
}

test('case details fill the workspace and the collapsed browser switches cases', async ({ page }) => {
  await gotoReady(page, '/cases?case=HAR-101');
  const inspector = page.getByRole('dialog', { name: 'Case HAR-101', exact: true });
  const browse = page.getByRole('button', { name: 'Browse test cases', exact: true });
  for (const width of [1600, 1456, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(inspector).toBeVisible();
    const bounds = await inspector.boundingBox();
    const workspace = await page.locator('.topo-cases-grid').boundingBox();
    expect(bounds!.width).toBeGreaterThanOrEqual(workspace!.width - (width >= 768 ? 88 : 2));
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await expect(page.getByLabel('Search cases', { exact: true })).not.toBeVisible();
  }
  await page.setViewportSize({ width: 1456, height: 1000 });
  await browse.hover();
  await expect(page.getByLabel('Search cases', { exact: true })).toBeVisible();
  await page.mouse.move(1000, 100);
  await expect(page.getByLabel('Search cases', { exact: true })).not.toBeVisible();
  await browse.focus();
  await expect(page.getByLabel('Search cases', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(browse).toHaveAttribute('aria-expanded', 'false');
  await expect(inspector).toBeVisible();
  await browse.click();
  const search = page.getByLabel('Search cases', { exact: true });
  await search.fill('HAR-102');
  await page.getByRole('button', {name: 'HAR-102', exact: true}).click();
  await expect(page.getByRole('dialog', { name: 'Case HAR-102', exact: true })).toBeVisible();
  await expect(search).not.toBeVisible();
  const title = page.getByLabel('Title', {exact: true});
  await title.fill('Unsaved review edit');
  await browse.click();
  await page.getByRole('button', {name: 'HAR-102', exact: true}).click();
  await expect(title).toHaveValue('Unsaved review edit');
  await browse.click();
  await search.fill('HAR-101');
  await page.getByRole('button', {name: 'HAR-101', exact: true}).click();
  await expect(page.getByRole('heading', {name:'Discard unsaved changes?'})).toBeVisible();
  await page.getByRole('button', {name:'Keep editing', exact:true}).click();
  await expect(title).toHaveValue('Unsaved review edit');
  await page.getByRole('button', {name:'Close case editor',exact:true}).click();
  await page.getByRole('button', {name:'Discard',exact:true}).click();
  await expect(page.locator('.topo-inspector')).not.toBeVisible();
  await expect(search).toBeVisible();
  await expect(search).toHaveValue('HAR-101');
  await expect(browse).not.toBeVisible();
  await expect(search).toBeFocused();
});

test('collapsed folder and case menus support rapid hover and touch-sized navigation', async ({ page }) => {
  await gotoReady(page, '/cases?case=HAR-101');
  const folders = page.getByRole('button', {name: 'Browse folders', exact: true});
  const cases = page.getByRole('button', {name: 'Browse test cases', exact: true});
  await folders.hover();
  await cases.hover();
  await page.waitForTimeout(300); // Exceed the hover dismissal delay to catch stale timers.
  await expect(cases).toHaveAttribute('aria-expanded', 'true');
  await folders.focus();
  await cases.focus();
  await expect(cases).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await page.setViewportSize({width:390, height:844});
  await folders.click();
  const menu = page.getByRole('region', {name: 'Folders', exact:true});
  await expect(menu.getByRole('button', {name:/All cases/})).toBeVisible();
  await menu.getByRole('button', {name:/All cases/}).focus();
  await page.keyboard.press('Enter');
  await expect(cases).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByLabel('Search cases', {exact:true})).toBeFocused();
  await expect(page.getByRole('dialog', {name:'Case HAR-101',exact:true})).toBeVisible();
  const popup = await page.getByRole('region', {name:'Test cases',exact:true}).boundingBox();
  expect(popup!.x).toBeGreaterThanOrEqual(0);
  expect(popup!.x + popup!.width).toBeLessThanOrEqual(390);
});

test('notifications close from the top-right icon and restore focus', async ({ page }) => {
  await page.goto('/cases');
  const trigger = page.getByRole('button', { name: /^Notifications/ });
  await trigger.click();
  const dialog = page.getByRole('dialog');
  const close = dialog.getByRole('button', { name: 'Close notifications', exact: true });
  await expect(close).toBeVisible();
  await expect(close).toHaveText('');
  const bounds = await dialog.boundingBox();
  const buttonBounds = await close.boundingBox();
  expect(buttonBounds!.x).toBeGreaterThan(bounds!.x + bounds!.width / 2);
  expect(buttonBounds!.y - bounds!.y).toBeLessThan(40);
  await close.click();
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test('case picker has a single vertical scroll area', async ({page}) => {
  await gotoReady(page, '/cases?case=HAR-101');
  for (const width of [1456, 1024, 390]) {
    await page.setViewportSize({width, height:852});
    await page.getByRole('button', {name:'Browse test cases',exact:true}).click();
    const picker = page.getByRole('region', {name:'Test cases',exact:true});
    await expect(picker).toBeVisible();
    const scrollAreas = await picker.evaluate(root => [root, ...root.querySelectorAll('*')].filter(element => {
      const style = getComputedStyle(element);
      return element.clientHeight > 0 && /auto|scroll/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 1;
    }).map(element => element === root ? 'picker' : element.getAttribute('aria-label') ?? element.tagName));
    expect(scrollAreas).toEqual(['picker']);
    await picker.evaluate(element => {element.scrollTop = element.scrollHeight;});
    await expect(picker.getByRole('button', {name:'Next',exact:true})).toBeVisible();
    expect(await picker.evaluate(element => Math.abs(element.scrollHeight - element.clientHeight - element.scrollTop))).toBeLessThan(2);
    await page.keyboard.press('Escape');
  }
});
