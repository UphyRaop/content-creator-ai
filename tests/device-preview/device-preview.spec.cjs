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
  const logos = page.locator('.logo-tap-target:visible');
  if (await logos.count()) await logos.first().scrollIntoViewIfNeeded();
  else await page.locator('footer .logo-tap-target').scrollIntoViewIfNeeded();
  const logo = page.locator('.logo-tap-target:visible').first();
  for (let tap = 0; tap < 6; tap++) await logo.click();
  await expect(page.locator('#device-preview-dialog')).toBeHidden();
  await logo.click();
  await expect(page.locator('#device-preview-dialog')).toBeVisible();
  await expect(page.locator('#developerModeTitle')).toHaveText('Device Preview Mode');
  await expect(page.locator('#device-preview-profile')).toBeVisible();
  await expect(page.locator('#device-preview-frame')).toBeVisible();
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
  const size = profileSizes[info.project.name];
  await page.locator('#device-preview-profile').selectOption(`${size.width}x${size.height}`);
  const frame = await appFrame(page);
  await expect.poll(() => frame.locator('html').evaluate(() => ({ width: innerWidth, height: innerHeight }))).toEqual(size);

  await frame.getByRole('button', { name: /new project/i }).click();
  await frame.locator('#newProjectTitle').fill(`QA ${info.project.name} synthetic project`);
  await frame.getByRole('button', { name: /create project/i }).click();
  await expect(frame.locator('#activeProjectName')).toHaveText(`QA ${info.project.name} synthetic project`);
  const briefGate = frame.getByRole('button', { name: /step 2: creative brief locked/i });
  await expect(briefGate).toHaveAttribute('aria-disabled', 'true');
  await briefGate.click({ force: true });
  await expect(frame.locator('#view h1')).toHaveText('What video do you want to make?');
  await frame.locator('#idea').fill(`Synthetic idea for ${info.project.name}; no external references or paid generation.`);
  await frame.getByRole('button', { name: 'Generate creative brief' }).click();
  await expect(frame.locator('#view h1')).toHaveText('Creative brief');

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

test('7-tap preview exit and profile switching preserve the app iframe and local project', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-1920x1080', 'State-preservation flow runs once; per-profile app navigation is covered above.');
  await openDevicePreview(page);
  const frame = await appFrame(page);

  const newProjectButton = frame.getByRole('button', { name: /new project/i });
  await newProjectButton.click();
  await frame.locator('#newProjectTitle').fill('QA Device Preview Synthetic Project');
  await frame.getByRole('button', { name: /create project/i }).click();
  await expect(frame.locator('#activeProjectName')).toHaveText('QA Device Preview Synthetic Project');
  const identity = await frame.locator('body').evaluate(() => {
    window.__ccaiDeviceQaIdentity ||= crypto.randomUUID();
    return window.__ccaiDeviceQaIdentity;
  });
  const storedProjectBefore = await frame.locator('body').evaluate(() => {
    const project = JSON.parse(localStorage.getItem('ccai-projects-v1')).find(item => item.title === 'QA Device Preview Synthetic Project');
    return project && { id: project.id, title: project.title };
  });
  expect(storedProjectBefore).toEqual(expect.objectContaining({ title: 'QA Device Preview Synthetic Project' }));

  const profile = page.locator('#device-preview-profile');
  for (const size of Object.values(profileSizes)) {
    await profile.selectOption(`${size.width}x${size.height}`);
    await expect.poll(() => frame.locator('body').evaluate(() => window.__ccaiDeviceQaIdentity)).toBe(identity);
  }

  await page.locator('#device-preview-exit').click();
  await expect(page.locator('#device-preview-dialog')).toBeHidden();
  await expect(page.locator('.project-card h2', { hasText: 'QA Device Preview Synthetic Project' })).toBeVisible();
  await openDevicePreview(page);
  const reopened = await appFrame(page);
  await expect(reopened.locator('#activeProjectName')).toHaveText('QA Device Preview Synthetic Project');
  const storedProjectAfter = await reopened.locator('body').evaluate(() => {
    const project = JSON.parse(localStorage.getItem('ccai-projects-v1')).find(item => item.title === 'QA Device Preview Synthetic Project');
    return project && { id: project.id, title: project.title };
  });
  expect(storedProjectAfter).toEqual(storedProjectBefore);
  await expect.poll(() => reopened.locator('body').evaluate(() => window.__ccaiDeviceQaIdentity)).toBe(identity);
});

test('all 13 workflow stage gates match their approval prerequisites', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-1920x1080', 'Synthetic prerequisite matrix is run once; each viewport exercises the live first-stage gate.');
  await openDevicePreview(page);
  const frame = await appFrame(page);
  await frame.getByRole('button', { name: /new project/i }).click();
  await frame.locator('#newProjectTitle').fill('QA stage-gate synthetic project');
  await frame.getByRole('button', { name: /create project/i }).click();
  await expect(frame.locator('#view h1')).toHaveText('What video do you want to make?');
  const stageButtons = frame.locator('#nav .step');
  await expect(stageButtons).toHaveCount(13);
  await expect(stageButtons.nth(0)).toHaveAttribute('aria-disabled', 'false');
  for (let index = 1; index < 13; index++) await expect(stageButtons.nth(index)).toHaveAttribute('aria-disabled', 'true');
  await stageButtons.nth(12).click({ force: true });
  await expect(frame.locator('#view h1')).toHaveText('What video do you want to make?');
  const results = await frame.locator('body').evaluate(() => {
    const originals = { voiceIsComplete, timelineApprovalValid, timelineInputSignature };
    const baseline = initialState('Synthetic gate fixture');
    Object.assign(state, baseline, {
      dashboard: false,
      idea: 'synthetic idea',
      brief: { summary: 'synthetic brief' },
      script: 'synthetic script',
      scriptApproved: true,
      scenes: [{ approved: true, image: true, voiceSegments: [{ approved: true, needsGeneration: false, status: 'completed', audio: 'data:audio/wav;base64,AA==' }] }],
      voice: true,
      timeline: { renderApproval: { approved: true, approvedAt: new Date().toISOString(), manifestHash: 'a'.repeat(64) } },
      timelineInputsSignature: 'synthetic-signature',
      render: true,
      post: true,
      thumb: true,
    });
    window.voiceIsComplete = () => true;
    window.timelineApprovalValid = () => true;
    window.timelineInputSignature = () => 'synthetic-signature';
    navdraw();
    const labels = [...document.querySelectorAll('#nav .step')].map(button => button.getAttribute('aria-label'));
    const fullyUnlocked = [...document.querySelectorAll('#nav .step')].map(button => button.getAttribute('aria-disabled'));
    const cases = [
      ['Creative brief', () => { state.idea = ''; }],
      ['AI script', () => { state.brief = null; }],
      ['Script approval', () => { state.script = ''; }],
      ['Scene breakdown', () => { state.scriptApproved = false; }],
      ['Image generation', () => { state.scenes = []; }],
      ['Scene approval', () => { state.scenes = []; }],
      ['Voice generation', () => { state.scenes[0].approved = false; }],
      ['Timeline & edit', () => { window.voiceIsComplete = () => false; }],
      ['Video render', () => { window.timelineApprovalValid = () => false; }],
      ['Post-production', () => { state.render = false; }],
      ['Thumbnail', () => { state.post = false; }],
      ['Video export', () => { state.thumb = false; }],
    ].map(([name, removePrerequisite], index) => {
      Object.assign(state, initialState('Synthetic gate fixture'), {
        dashboard: false, idea: 'synthetic idea', brief: { summary: 'synthetic brief' }, script: 'synthetic script', scriptApproved: true,
        scenes: [{ approved: true, image: true, voiceSegments: [{ approved: true, needsGeneration: false, status: 'completed', audio: 'data:audio/wav;base64,AA==' }] }],
        voice: true, timeline: { renderApproval: { approved: true, approvedAt: new Date().toISOString(), manifestHash: 'a'.repeat(64) } },
        timelineInputsSignature: 'synthetic-signature', render: true, post: true, thumb: true,
      });
      window.voiceIsComplete = () => true; window.timelineApprovalValid = () => true; window.timelineInputSignature = () => 'synthetic-signature';
      removePrerequisite(); navdraw();
      const button = document.querySelectorAll('#nav .step')[index + 1];
      return { name, ariaDisabled: button?.getAttribute('aria-disabled'), labels };
    });
    Object.assign(state, baseline); window.voiceIsComplete = originals.voiceIsComplete; window.timelineApprovalValid = originals.timelineApprovalValid; window.timelineInputSignature = originals.timelineInputSignature; navdraw();
    return { labels, fullyUnlocked, cases };
  });
  expect(results.labels).toHaveLength(13);
  expect(results.fullyUnlocked).toEqual(Array(13).fill('false'));
  expect(results.cases.map(item => item.ariaDisabled)).toEqual(Array(12).fill('true'));
});

test('all 13 stage screens navigate using a synthetic approved-media project and simulated completion', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-1920x1080', 'Complete stage walkthrough is run once; responsive behavior is covered across all six profiles.');
  const externalRequests = [];
  const apiRequests = [];
  await blockExternalAndApi(page, externalRequests, apiRequests);
  const browserErrors = [];
  page.on('pageerror', error => browserErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()); });
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      if (!['ccai.ur-project.biz', '127.0.0.1'].includes(url.hostname)) externalRequests.push(request.url());
      if (url.pathname.startsWith('/api/')) apiRequests.push(request.url());
    }
  });
  page.on('dialog', dialog => dialog.accept());
  await openDevicePreview(page);
  const frame = await appFrame(page);
  await frame.getByRole('button', { name: /new project/i }).click();
  await frame.locator('#newProjectTitle').fill('QA complete simulated workflow');
  await frame.getByRole('button', { name: /create project/i }).click();
  await expect(frame.locator('#view h1')).toHaveText('What video do you want to make?');

  await frame.locator('#idea').fill('A short synthetic workflow about a quiet morning studio.');
  await frame.getByRole('button', { name: 'Generate creative brief' }).click();
  await expect(frame.locator('#view h1')).toHaveText('Creative brief');
  await frame.getByRole('button', { name: 'Approve creative brief' }).click();

  await frame.locator('#nav .step').nth(2).click();
  await expect(frame.locator('#view h1')).toHaveText('Script development');
  await frame.getByRole('button', { name: 'Generate script' }).click();
  await expect(frame.locator('#script')).toBeVisible();
  await frame.locator('#nav .step').nth(3).click();
  await expect(frame.locator('#view h1')).toHaveText('Approve the script');
  await frame.getByRole('button', { name: 'Approve final script' }).click();

  await frame.locator('#nav .step').nth(4).click();
  await expect(frame.locator('#view h1')).toHaveText('Review the scene breakdown');
  await frame.getByRole('button', { name: 'Generate scene breakdown' }).click();
  await expect(frame.locator('.scene-editor')).toHaveCount(15);

  await frame.locator('body').evaluate(() => {
    const projectId = state.projectId;
    const projectTitle = state.projectTitle;
    Object.assign(state, initialState(projectTitle), { projectId, projectTitle, dashboard: false, step: 0 });
    state.idea = 'Synthetic approved-media fixture';
    state.brief = { title: 'Synthetic approved-media fixture', direction: 'Synthetic direction', goal: 'QA', audience: 'Test', tone: 'Calm', durationMinutes: 1, language: 'English', approved: true };
    state.script = '[NARRATOR] A quiet studio wakes in the morning. Light falls across the desk.';
    state.scriptSavedText = state.script;
    state.scriptApproved = true;
    const scene = createScene('A quiet studio wakes in the morning.', 0);
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#800024"/><text x="16" y="96" fill="#fff">Synthetic QA scene</text></svg>';
    scene.seconds = 2;
    scene.image = 'data:image/svg+xml;base64,' + btoa(svg);
    scene.imageProvider = 'simulated';
    scene.imageVersions = [{ image: scene.image, prompt: scene.prompt, scriptText: scene.line, aspectRatio: '16:9', provider: 'simulated', version: 1 }];
    scene.approved = true;
    scene.approvalStatus = 'approved';
    const wav = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';
    scene.voiceSegments = [{ id: 'qa-voice-segment', text: scene.line, role: 'narration', profileId: '', settings: { ...state.voiceSettings }, status: 'completed', approved: true, needsGeneration: false, durationSeconds: 2, estimatedDurationSeconds: 2, dataUrl: wav, versions: [] }];
    state.scenes = [scene];
    state.voice = true;
    state.render = false;
    state.post = false;
    state.thumb = false;
    state.timeline = null;
    state.timelineInputsSignature = '';
    draw();
  });

  const titles = [
    'What video do you want to make?', 'Creative brief', 'Script development', 'Approve the script',
    'Review the scene breakdown', 'Generate scene images', 'Approve or reject each scene', 'Voice generation studio',
    'Video timeline & editing', 'Render video', 'Post-production studio', 'Thumbnail studio', 'Publishing metadata',
  ];
  for (let index = 0; index <= 12; index++) {
    const navButton = frame.locator('#nav .step').nth(index);
    await expect(navButton).toHaveAttribute('aria-disabled', 'false');
    await navButton.click();
    await expect(frame.locator('#view h1')).toHaveText(titles[index]);
    if (index === 8) {
      await expect(frame.getByRole('button', { name: 'Review and approve timeline for render' })).toBeVisible();
      await frame.getByRole('button', { name: 'Review and approve timeline for render' }).click();
      await expect(frame.getByText(/RENDER APPROVED/)).toBeVisible();
    }
    if (index === 9) {
      await expect(frame.getByText(/No MP4 is produced|No video file will be created/i)).toBeVisible();
      await frame.getByRole('button', { name: 'Confirm simulated render' }).click();
      await expect(frame.getByText('Simulation complete')).toBeVisible();
    }
    if (index === 10) {
      await frame.getByRole('button', { name: 'Save post-production edits' }).click();
      await frame.getByRole('button', { name: 'Create revised simulated export' }).click();
      await expect(frame.getByText(/Revised simulated export recorded/)).toBeVisible();
    }
    if (index === 11) {
      await frame.getByRole('button', { name: 'Generate 3 landscape options' }).click();
      await frame.getByRole('button', { name: 'Generate 3 portrait options' }).click();
      await expect(frame.locator('.thumb-variant')).toHaveCount(6);
      await frame.getByRole('button', { name: 'Approve selected thumbnail' }).click();
      await expect(frame.getByText(/Thumbnail approved/)).toBeVisible();
    }
    if (index === 12) {
      await frame.getByRole('button', { name: 'Build publishing suggestions' }).click();
      await frame.getByRole('button', { name: 'Prepare export checklist' }).click();
      await expect(frame.getByText(/No post was published and no MP4 was created/).first()).toBeVisible();
    }
  }
  expect(externalRequests).toEqual([]);
  expect(apiRequests).toEqual([]);
  expect(browserErrors).toEqual([]);
});
