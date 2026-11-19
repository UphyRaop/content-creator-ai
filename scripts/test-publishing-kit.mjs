import assert from 'node:assert/strict';
import {
  approveSelectedThumbnail, buildPublishingExport, createSimulatedThumbnailVariants,
  editThumbnailVariant, normalizePublishingMetadata, regenerateThumbnailVariant,
  rejectThumbnailVariant, validatePublishingMetadata, validateThumbnailVariants,
} from '../src/lib/publishing-kit.ts';

const makeVariants = (orientation, idPrefix) => createSimulatedThumbnailVariants({
  count: 4, orientation, prompt: 'A clean cover', text: 'Watch this',
  fontFamily: 'Inter', textColor: '#ffffff', backgroundColor: '#123456',
  brandKitId: 'brand_1', referenceSceneIds: ['scene_1', 'scene_2'],
  createdAt: '2026-11-19T00:00:00.000Z', idPrefix,
});
const variants = [...makeVariants('landscape', 'cover-land'), ...makeVariants('portrait', 'cover-port')];
assert.equal(variants.length, 8);
assert.equal(new Set(variants.map(v => v.id)).size, variants.length);
assert.equal(variants.filter(v => v.orientation === 'landscape').length, 4);
assert.equal(variants.filter(v => v.orientation === 'portrait').length, 4);
assert.ok(variants.every(v => v.status === 'draft'));
assert.ok(validateThumbnailVariants([...makeVariants('landscape', 'min-land').slice(0, 3), ...makeVariants('portrait', 'min-port').slice(0, 3)]));
assert.ok(validateThumbnailVariants([...makeVariants('landscape', 'max-land').slice(0, 5), ...makeVariants('portrait', 'max-port').slice(0, 5)]));
assert.ok(variants.every(v => v.brandKitId === 'brand_1' && v.referenceSceneIds.join() === 'scene_1,scene_2'));
assert.ok(variants.every(v => v.source === 'simulated'));
assert.throws(() => createSimulatedThumbnailVariants({ ...{
  count: 3, orientation: 'landscape', prompt: '', text: '', fontFamily: 'Inter', textColor: '#ffffff',
  backgroundColor: '#000000', brandKitId: null, referenceSceneIds: [], createdAt: '2026-11-19', idPrefix: 'x',
}, count: 2 }));

const uploaded = { ...variants[0], id: 'manual', source: 'upload', assetRef: 'data:image/png;base64,iVBORw0KGgo=' };
assert.ok(validateThumbnailVariants([uploaded, ...variants.slice(1)]));
assert.equal(validateThumbnailVariants([{ ...uploaded, assetRef: 'data:image/svg+xml;base64,AAAA' }, ...variants.slice(1)]), false);
assert.equal(validateThumbnailVariants([{ ...uploaded, assetRef: 'data:image/png;base64,@@@@' }, ...variants.slice(1)]), false);
const tooLargeBase64 = 'A'.repeat(Math.ceil((2 * 1024 * 1024 + 1) / 3) * 4);
assert.equal(validateThumbnailVariants([{ ...uploaded, assetRef: `data:image/webp;base64,${tooLargeBase64}` }, ...variants.slice(1)]), false);
assert.equal(validateThumbnailVariants([{ ...variants[0], source: 'upload' }, ...variants.slice(1)]), false);
assert.equal(validateThumbnailVariants([{ ...variants[0], versions: [{ id: 'v', text: '', prompt: '', assetRef: 'data:image/gif;base64,AAAA', createdAt: '2026-11-19' }] }, ...variants.slice(1)]), false);
assert.throws(() => buildPublishingExport(variants, variants[0].id, {
  platform: 'youtube', title: 'Title', description: '', captions: '', hashtags: [], keywords: [], createdAt: '2026-11-19',
}, '2026-11-19'));

const approved = approveSelectedThumbnail(variants, variants[0].id);
assert.equal(approved.filter(v => v.status === 'approved').length, 1);
assert.equal(approved[0].status, 'approved');
assert.ok(approved.slice(1).every(v => v.status === 'draft'));
assert.ok(variants.every(v => v.status === 'draft'));
const portraitApproved = approveSelectedThumbnail(approved, variants[4].id);
assert.equal(portraitApproved.filter(v => v.status === 'approved').length, 1);
assert.equal(portraitApproved[4].status, 'approved');
assert.equal(portraitApproved[0].status, 'draft');
assert.throws(() => editThumbnailVariant(approved, variants[0].id, { text: 'Nope' }, { id: 'v1', createdAt: '2026-11-19' }));
assert.throws(() => regenerateThumbnailVariant(approved, variants[0].id, {
  prompt: 'new', text: 'new', assetRef: 'simulated:new', versionId: 'v1', createdAt: '2026-11-19',
}));

const edited = editThumbnailVariant(variants, variants[1].id, { text: 'Edited' }, { id: 'edit1', createdAt: '2026-11-19' });
assert.equal(variants[1].text, 'Watch this');
assert.equal(edited[1].text, 'Edited');
assert.equal(edited[1].versions[0].text, 'Watch this');
assert.equal(edited[0], variants[0]);
const regenerated = regenerateThumbnailVariant(approved, variants[1].id, {
  prompt: 'Revised concept', text: 'New text', assetRef: 'simulated:updated', versionId: 'regen1', createdAt: '2026-11-19',
});
assert.equal(regenerated[0].status, 'approved');
assert.equal(regenerated[1].status, 'draft');
assert.equal(regenerated[1].versions[0].text, 'Watch this');
assert.equal(approved[1].text, 'Watch this');
assert.equal(regenerated[2], approved[2]);
const rejected = rejectThumbnailVariant(variants, variants[2].id);
assert.equal(rejected[2].status, 'rejected');
assert.equal(rejected[1], variants[1]);
assert.throws(() => rejectThumbnailVariant(approved, variants[0].id));

const metadata = normalizePublishingMetadata({ platform: 'instagram', title: '  A title  ', description: ' desc ', captions: ' words ', hashtags: ['Travel', '#travel', 'Video'], keywords: ['cinema', 'Cinema', 'short'], createdAt: '2026-11-19' });
assert.equal(metadata.title, 'A title');
assert.deepEqual(metadata.hashtags, ['#Travel', '#Video']);
assert.deepEqual(metadata.keywords, ['cinema', 'short']);
assert.ok(validatePublishingMetadata(metadata));
assert.throws(() => normalizePublishingMetadata({ ...metadata, title: 'x'.repeat(151) }));
assert.equal(validatePublishingMetadata({ ...metadata, hashtags: Array(31).fill('tag') }), false);
assert.equal(validatePublishingMetadata({ ...metadata, platform: 'unknown' }), false);
assert.equal(validateThumbnailVariants(variants.slice(0, 4)), false);
assert.equal(validateThumbnailVariants([variants[0], { ...variants[1], id: variants[0].id }, ...variants.slice(2)]), false);
assert.equal(validateThumbnailVariants([...variants.slice(0, 5), ...variants.slice(4, 7)]), false);

const exportObject = buildPublishingExport(approved, variants[0].id, metadata, '2026-11-19');
assert.equal(exportObject.autoPublish, false);
assert.equal(exportObject.thumbnail.id, variants[0].id);
assert.notEqual(exportObject.thumbnail, approved[0]);
assert.throws(() => buildPublishingExport(approved, variants[1].id, metadata, '2026-11-19'));
console.log('publishing-kit fixtures passed');
