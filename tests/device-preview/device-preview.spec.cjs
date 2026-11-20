const { test, expect } = require('playwright/test');

const profileSizes = {
  'desktop-1920x1080': { width: 1920, height: 1080 },
  'laptop-1366x768': { width: 1366, height: 768 },
  'tablet-portrait-768x1024': { width: 768, height: 1024 },
  'tablet-landscape-1024x768': { width: 1024, height: 768 },
  'mobile-portrait-390x844': { width: 390, height: 844 },
  'mobile-landscape-844x390': { width: 844, height: 390 },
};

async function openDevicePreview(page) {
  if (page.url() === 'about:blank') await page.goto('/');
  await page.locator('#startupLoading').waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {});
  await page.locator('#developerModeEntry').click();
  const gate = page.locator('#developerModeGateDialog');
  if (await gate.isVisible()) {
    await page.locator('#urtnGateInput').fill('URTN');
    await page.locator('#urtnGateUnlock').click();
  }
  await expect(page.locator('#navDrawer')).toBeVisible();
  await page.locator('[data-dev-link="device-simulation"]').click();
  await expect(page.locator('#device-preview-dialog')).toBeVisible();
  await expect(page.locator('#device-preview-profile')).toBeVisible();
  await expect(page.locator('#device-preview-frame')).toBeVisible();
}

async function openDrawer(page) {
  const drawer = page.locator('#navDrawer');
  if (await drawer.getAttribute('aria-hidden') !== 'false') await page.locator('#navDrawerToggle').click();
  await expect(drawer).toHaveAttribute('aria-hidden', 'false');
}

async function selectWorkflowStage(frame, index) {
  const drawer = frame.locator('#navDrawer');
  if (await drawer.getAttribute('aria-hidden') !== 'false') await frame.locator('#navDrawerToggle').click();
  const group = frame.locator('#productionWorkflowGroup');
  if (!(await group.evaluate(element => element.open))) await group.locator('summary').click();
  await group.locator('#nav .step').nth(index).click();
  await expect(drawer).toHaveAttribute('aria-hidden', 'true');
}

async function appFrame(page) {
  const frame = page.frameLocator('#device-preview-frame');
  await expect(frame.locator('body')).toBeVisible();
  return frame;
}

async function blockExternalAndApi(page, externalRequests, apiRequests) {
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return route.continue();
    if (!['ccai.ur-project.biz', '127.0.0.1'].includes(url.hostname)) {
      externalRequests.push(route.request().url());
      return route.abort();
    }
    if (url.pathname.startsWith('/api/')) {
      apiRequests.push(route.request().url());
      return route.abort();
    }
    return route.continue();
  });
}

async function auditVisibleControls(frame) {
  return frame.locator('html').evaluate(() => {
    const visible = element => {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      for (let current = element; current && current.nodeType === Node.ELEMENT_NODE; current = current.parentElement) {
        const style = getComputedStyle(current);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
      }
      return true;
    };
    const labelledbyText = element => (element.getAttribute('aria-labelledby') || '')
      .split(/\s+/).filter(Boolean).map(id => document.getElementById(id)?.innerText || '').join(' ').trim();
    const controls = [...document.querySelectorAll('button,a,input,select,textarea,[role="button"],[role="link"]')].filter(visible);
    const missingNames = controls.filter(element => {
      const nativeLabels = element.labels ? [...element.labels].map(label => label.innerText).join(' ') : '';
      const visibleText = ['BUTTON', 'A'].includes(element.tagName) ? element.innerText : '';
      return !(element.getAttribute('aria-label') || labelledbyText(element) || nativeLabels.trim() || visibleText.trim() || element.getAttribute('title') || element.getAttribute('alt'));
    }).map(element => `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}`);
    const zeroSizeControls = [...document.querySelectorAll('button,a,input,select,textarea,[role="button"],[role="link"]')]
      .filter(element => {
        for (let current = element; current && current.nodeType === Node.ELEMENT_NODE; current = current.parentElement) {
          const style = getComputedStyle(current);
          if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
        }
        return element.getBoundingClientRect().width <= 0 || element.getBoundingClientRect().height <= 0;
      })
      .map(element => `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}`);
    const clippedCriticalText = [...document.querySelectorAll('button,a,label,h1,h2,h3')].filter(visible).filter(element => {
      const style = getComputedStyle(element);
      const horizontalClip = ['hidden', 'clip'].includes(style.overflowX) && element.scrollWidth > element.clientWidth + 2;
      const verticalClip = ['hidden', 'clip'].includes(style.overflowY) && element.scrollHeight > element.clientHeight + 2;
      return horizontalClip || verticalClip || style.textOverflow === 'ellipsis';
    }).map(element => `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}.${String(element.className || '').toString().split(' ').slice(0, 2).join('.')}`);
    return { missingNames, zeroSizeControls, clippedCriticalText };
  });
}

test('device profile fits without horizontal overflow and has no browser errors', async ({ page }, info) => {
  const errors = [];
  const externalRequests = [];
  const unexpectedApiRequests = [];
  await blockExternalAndApi(page, externalRequests, unexpectedApiRequests);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      if (!['ccai.ur-project.biz', '127.0.0.1'].includes(url.hostname)) externalRequests.push(request.url());
      if (url.pathname.startsWith('/api/')) unexpectedApiRequests.push(request.url());
    }
  });

  await openDevicePreview(page);
  const simulatorAccessibility = await auditVisibleControls(page);
  expect(simulatorAccessibility.missingNames, JSON.stringify(simulatorAccessibility)).toEqual([]);
  expect(simulatorAccessibility.zeroSizeControls, JSON.stringify(simulatorAccessibility)).toEqual([]);
  expect(simulatorAccessibility.clippedCriticalText, JSON.stringify(simulatorAccessibility)).toEqual([]);
  const size = profileSizes[info.project.name];
  await page.locator('#device-preview-profile').selectOption(`${size.width}x${size.height}`);
  const frame = await appFrame(page);
  await expect.poll(() => frame.locator('html').evaluate(() => ({ width: innerWidth, height: innerHeight }))).toEqual(size);
  await frame.locator('#navDrawerToggle').click();
  const responsiveDrawer = frame.locator('#navDrawer');
  await expect(responsiveDrawer).toHaveAttribute('aria-hidden', 'false');
  await expect.poll(() => responsiveDrawer.evaluate(element => element.getBoundingClientRect().left)).toBeGreaterThanOrEqual(0);
  const drawerBounds = await responsiveDrawer.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return { x: rect.left, y: rect.top, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom };
  });
  expect(drawerBounds).not.toBeNull();
  expect(drawerBounds.x).toBeGreaterThanOrEqual(0);
  expect(drawerBounds.x + drawerBounds.width).toBeLessThanOrEqual(size.width + 1);
  expect(drawerBounds.y).toBeGreaterThanOrEqual(0);
  expect(drawerBounds.y + drawerBounds.height).toBeLessThanOrEqual(size.height + 1);
  for (const label of ['Workspace', 'Content library', 'Management']) {
    await expect(frame.locator('#navDrawer summary').filter({ hasText: label })).toBeVisible();
  }
  const iframeBox = await page.locator('#device-preview-frame').boundingBox();
  const scaleX = iframeBox.width / size.width;
  const scaleY = iframeBox.height / size.height;
  const outsideX = Math.min(size.width - 10, drawerBounds.right + 20);
  await page.mouse.click(iframeBox.x + outsideX * scaleX, iframeBox.y + Math.min(100, size.height - 10) * scaleY);
  await expect(responsiveDrawer).toHaveAttribute('aria-hidden', 'true');

  await frame.getByRole('button', { name: /new project/i }).click();
  await frame.locator('#newProjectTitle').fill(`QA ${info.project.name} synthetic project`);
  await frame.getByRole('button', { name: /create project/i }).click();
  await expect(frame.locator('#activeProjectName')).toHaveText(`QA ${info.project.name} synthetic project`);
  await openDrawer(frame);
  const workflowGroup = frame.locator('#productionWorkflowGroup');
  if (!(await workflowGroup.evaluate(element => element.open))) await workflowGroup.locator('summary').click();
  const briefGate = frame.getByRole('button', { name: /step 2: creative brief locked/i });
  await expect(briefGate).toHaveAttribute('aria-disabled', 'true');
  await briefGate.click({ force: true });
  await expect(frame.locator('#view h1')).toHaveText('What video do you want to make?');
  await frame.locator('#navDrawerToggle').click();
  await frame.locator('#idea').fill('A quiet morning in a small studio.');
  await frame.getByRole('button', { name: 'Generate creative brief' }).click();
  await expect(frame.locator('#view h1')).toHaveText('Creative brief');
  const accessibilityAudit = await auditVisibleControls(frame);
  expect(accessibilityAudit.missingNames, JSON.stringify(accessibilityAudit)).toEqual([]);
  expect(accessibilityAudit.zeroSizeControls, JSON.stringify(accessibilityAudit)).toEqual([]);
  expect(accessibilityAudit.clippedCriticalText, JSON.stringify(accessibilityAudit)).toEqual([]);

  const metrics = await frame.locator('html').evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const visible = [...document.querySelectorAll('body *')].filter(el => {
      const style = getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 && el.getBoundingClientRect().width > 0;
    });
    const offscreen = visible.filter(el => {
      for (let parent = el.parentElement; parent && parent !== body; parent = parent.parentElement) {
        const overflow = getComputedStyle(parent).overflowX;
        if (overflow === 'auto' || overflow === 'scroll') return false;
      }
      const rect = el.getBoundingClientRect();
      return rect.left < -1 || rect.right > innerWidth + 1;
    }).slice(0, 8).map(el => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}.${String(el.className || '').toString().split(' ').slice(0, 2).join('.')}`);
    return {
      viewport: [innerWidth, innerHeight],
      documentWidth: Math.max(root.scrollWidth, body.scrollWidth),
      horizontalOverflow: Math.max(root.scrollWidth, body.scrollWidth) > innerWidth + 1,
      offscreen,
    };
  });
  expect(metrics.horizontalOverflow, JSON.stringify(metrics)).toBe(false);
  expect(metrics.offscreen, JSON.stringify(metrics)).toEqual([]);
  expect(externalRequests).toEqual([]);
  expect(unexpectedApiRequests).toEqual([]);
  expect(errors).toEqual([]);

  await page.screenshot({ path: info.outputPath(`device-preview-${info.project.name}.png`) });
});

test('URTN preview gate handles invalid code, cancel, lock, and session reset without privileged access', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-1920x1080', 'Code/session flow runs once; responsive app behavior is covered in all six iframe profiles.');
  const externalRequests = [];
  const apiRequests = [];
  const browserErrors = [];
  await blockExternalAndApi(page, externalRequests, apiRequests);
  page.on('pageerror', error => browserErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()); });
  await page.goto('/');
  await page.locator('#startupLoading').waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {});

  const entry = page.locator('#developerModeEntry');
  const gate = page.locator('#developerModeGateDialog');
  const drawer = page.locator('#navDrawer');
  const links = page.locator('#developerModeLinks');
  await expect(entry).toBeVisible();
  await expect(links).toBeHidden();
  await entry.click();
  await expect(entry).toHaveText('</>');
  await expect(gate).toBeVisible();
  await expect(page.locator('#urtnGateInput')).toHaveAttribute('type', 'password');
  await page.locator('#urtnGateInput').fill('incorrect-test-code');
  await page.locator('#urtnGateUnlock').click();
  await expect(page.locator('#urtnGateStatus')).toHaveText('Access code was not accepted. Developer Mode remains locked.');
  await expect(gate).toBeVisible();
  await expect(drawer).toHaveAttribute('aria-hidden', 'true');
  await expect(links).toBeHidden();
  await expect(page.locator('#urtnGateInput')).toHaveValue('');

  await page.locator('#urtnGateInput').fill('escape-test');
  await page.locator('#urtnGateInput').press('Escape');
  await expect(gate).toBeHidden();
  await expect(page.locator('#urtnGateInput')).toHaveValue('');
  await expect(page.locator('#urtnGateStatus')).toHaveText('');

  await entry.click();
  await page.locator('#urtnGateInput').fill('cancel-me');
  await page.locator('#urtnGateCancel').click();
  await expect(gate).toBeHidden();
  await expect(page.locator('#urtnGateInput')).toHaveValue('');
  await expect(page.locator('#urtnGateStatus')).toHaveText('');
  expect(await page.evaluate(() => sessionStorage.getItem('ccai-dev-preview-unlocked'))).toBeNull();

  await entry.click();
  await page.locator('#urtnGateInput').fill('uRtN');
  await page.locator('#urtnGateUnlock').click();
  await expect(gate).toBeHidden();
  await expect(drawer).toHaveAttribute('aria-hidden', 'false');
  await expect(links).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('ccai-dev-preview-unlocked'))).toBe('1');
  await expect(links).toContainText('Client-side preview navigation only. No privileged operations are available.');
  const devLinkKinds = await links.locator('[data-dev-link]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-dev-link')).sort());
  expect(devLinkKinds).toEqual(['device-simulation', 'full-app']);
  const exposedControls = await links.locator('input,textarea,select,[data-admin],[data-secret]').count();
  expect(exposedControls).toBe(0);

  const browser = page.context().browser();
  const newSession = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1920, height: 1080 } });
  const newSessionPage = await newSession.newPage();
  await blockExternalAndApi(newSessionPage, externalRequests, apiRequests);
  await newSessionPage.goto(page.url());
  await newSessionPage.locator('#startupLoading').waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {});
  await expect(newSessionPage.locator('#developerModeLinks')).toBeHidden();
  await newSessionPage.locator('#developerModeEntry').click();
  await expect(newSessionPage.locator('#developerModeGateDialog')).toBeVisible();
  expect(await newSessionPage.evaluate(() => sessionStorage.getItem('ccai-dev-preview-unlocked'))).toBeNull();
  await newSession.close();

  await page.locator('#developerModeLock').click();
  await expect(drawer).toHaveAttribute('aria-hidden', 'true');
  await expect(links).toBeHidden();
  expect(await page.evaluate(() => sessionStorage.getItem('ccai-dev-preview-unlocked'))).toBeNull();
  await entry.click();
  await expect(gate).toBeVisible();
  await page.locator('#urtnGateInput').fill('URTN');
  await page.locator('#urtnGateUnlock').click();
  await expect(links).toBeVisible();

  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await page.locator('#startupLoading').waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {});
  await expect(links).toBeHidden();
  await entry.click();
  await expect(gate).toBeVisible();
  await expect(drawer).toHaveAttribute('aria-hidden', 'true');
  expect(externalRequests).toEqual([]);
  expect(apiRequests).toEqual([]);
  expect(browserErrors).toEqual([]);
});

test('drawer destination routes, submenu behavior, and production stage selection work', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-1920x1080', 'Full destination/menu matrix runs once; each device profile tests responsive app navigation.');
  const externalRequests = [];
  const apiRequests = [];
  const browserErrors = [];
  await blockExternalAndApi(page, externalRequests, apiRequests);
  page.on('pageerror', error => browserErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()); });
  const routes = [
    ['projects', 'Video projects'], ['queue', 'Production queue'], ['characters', 'Characters'],
    ['locations', 'Locations'], ['series', 'Video series'], ['brandKits', 'Brand kits'],
    ['channels', 'Channel profiles'], ['voices', 'Voice profiles'], ['billing', 'Cloud usage & billing'],
    ['backup', 'Backup & restore'],
  ];
  await page.goto('/');
  await page.locator('#startupLoading').waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {});

  await page.getByRole('button', { name: /new project/i }).click();
  await page.locator('#newProjectTitle').fill('QA drawer navigation project');
  await page.getByRole('button', { name: /create project/i }).click();
  await expect(page.locator('#activeProjectName')).toHaveText('QA drawer navigation project');

  const unsavedIdea = 'Unsaved draft carried across menu navigation.';
  await page.locator('#idea').fill(unsavedIdea);
  await page.locator('#navDrawerToggle').click();
  const preGateLibrary = page.locator('#navDrawer details.drawer-group').filter({ hasText: 'Content library' });
  if (!(await preGateLibrary.evaluate(element => element.open))) await preGateLibrary.locator('summary').click();
  await page.locator('[data-drawer-destination="characters"]').click();
  await expect(page.locator('#view h1')).toHaveText('Characters');
  await openDrawer(page);
  await page.locator('[data-drawer-destination="projects"]').click();
  await page.getByRole('button', { name: 'Open project' }).click();
  await expect(page.locator('#activeProjectName')).toHaveText('QA drawer navigation project');
  await expect(page.locator('#idea')).toHaveValue(unsavedIdea);

  await page.locator('#developerModeEntry').click();
  await page.locator('#urtnGateInput').fill('URTN');
  await page.locator('#urtnGateUnlock').click();

  const drawer = page.locator('#navDrawer');
  await expect(drawer).toHaveAttribute('aria-hidden', 'false');
  const workflow = page.locator('#productionWorkflowGroup');
  await expect(workflow).toBeVisible();
  const workflowSummary = workflow.locator('summary');
  await expect(workflow).toHaveAttribute('open', '');
  await workflowSummary.click();
  await expect(workflow).not.toHaveAttribute('open', '');
  await expect(page.locator('#nav')).toBeHidden();
  await workflowSummary.click();
  await expect(workflow).toHaveAttribute('open', '');
  await expect(page.locator('#nav .step')).toHaveCount(13);

  const library = page.locator('#navDrawer details.drawer-group').filter({ hasText: 'Content library' });
  const librarySummary = library.locator('summary');
  await librarySummary.click();
  await expect(library).not.toHaveAttribute('open', '');
  await expect(page.locator('[data-drawer-destination="characters"]')).toBeHidden();
  await librarySummary.click();
  await expect(library).toHaveAttribute('open', '');

  await page.locator('#navDrawerBackdrop').click({ position: { x: 1500, y: 500 } });
  await expect(drawer).toHaveAttribute('aria-hidden', 'true');
  await expect(pa