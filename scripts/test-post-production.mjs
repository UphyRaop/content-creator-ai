import assert from "node:assert/strict";

const post=await import("../src/lib/post-production.ts");
const base=post.createPostProductionProject({id:"render-1",version:"r7",sourceRef:"renders/render-1.mp4",durationSeconds:120});
assert.deepEqual(base,{version:1,originalRender:{id:"render-1",version:"r7",sourceRef:"renders/render-1.mp4",durationSeconds:120},revisions:[],activeRevisionId:null});
assert.throws(()=>post.calculateDerivedAudioTimeline(base),/Create a post-production revision/);

const music=post.createPostAudioTrack({id:"music-1",kind:"music",sourceRef:"imports/music.wav",actualDurationSeconds:180,waveformPeaks:[0,.3,.8,1]});
const voice=post.createPostAudioTrack({id:"voice-1",kind:"voice-recording",sourceRef:"imports/voice.wav",actualDurationSeconds:10,waveformPeaks:[.1,.4,.7]});
const effect=post.createPostAudioTrack({id:"effect-1",kind:"sound-effect",sourceRef:"imports/chime.wav",actualDurationSeconds:2});
assert.equal(music.enabled,false,"music is off by default");assert.equal(voice.enabled,true);assert.equal(music.ducking.enabled,false);assert.ok(post.validatePostAudioTracks([music,voice,effect]));

assert.throws(()=>post.updatePostAudioTrack(music,{sourceOffsetSeconds:179,durationSeconds:2}),/Invalid post-production audio track/);
assert.throws(()=>post.updatePostAudioTrack(music,{fadeInSeconds:2,fadeOutSeconds:2,durationSeconds:3}),/Invalid post-production audio track/);
assert.throws(()=>post.updatePostAudioTrack(music,{fadeInSeconds:31}),/Invalid post-production audio track/);
const danglingDuck=post.updatePostAudioTrack(music,{ducking:{...music.ducking,enabled:true,targetTrackIds:["missing"]}});assert.equal(post.validatePostAudioTracks([danglingDuck,voice]),false,"ducking targets must resolve to voice tracks");
assert.equal(post.validatePostAudioTrack({...music,ducking:undefined}),false,"ducking settings must be explicit");
assert.equal(post.validatePostAudioTrack({...effect,waveformPeaks:Array(2001).fill(.5)}),false,"waveform size is bounded");
for(const id of ["x];[evil]", "has.dot", "has:colon", "space id"]){
  assert.equal(post.validatePostAudioTrack({...voice,id}),false,"filtergraph label IDs must use the safe identifier alphabet");
  assert.equal(post.validatePostAudioTrack({...music,ducking:{...music.ducking,enabled:true,targetTrackIds:[id]}}),false,"duck target IDs cannot contain filter syntax");
}

const placedMusic=post.updatePostAudioTrack(music,{enabled:true,startSeconds:1,sourceOffsetSeconds:20,durationSeconds:90,volume:.65,fadeInSeconds:2,fadeOutSeconds:3,ducking:{enabled:true,amount:.7,threshold:.12,attackSeconds:.2,releaseSeconds:.5,targetTrackIds:[voice.id]}});
const placedVoice=post.updatePostAudioTrack(voice,{startSeconds:.5,durationSeconds:8,sourceOffsetSeconds:1,volume:1.1,fadeInSeconds:.4});
const placedEffect=post.updatePostAudioTrack(effect,{enabled:false,startSeconds:2,durationSeconds:1});
assert.notEqual(placedMusic.waveformPeaks,music.waveformPeaks,"updates copy waveform metadata rather than aliasing the input array");
const rev1=post.createPostProductionRevision(base,{id:"post-1",createdAt:"2026-11-19T00:00:00.000Z",audioTracks:[placedMusic,placedVoice,placedEffect]});
assert.equal(base.revisions.length,0,"revision creation must not mutate source project");assert.equal(base.originalRender.sourceRef,"renders/render-1.mp4");assert.equal(rev1.originalRender.sourceRef,base.originalRender.sourceRef);
const plan=post.calculateDerivedAudioTimeline(rev1);
assert.equal(plan.parentRenderId,"render-1");assert.equal(plan.parentRenderVersion,"r7");assert.equal(plan.originalRenderRef,"renders/render-1.mp4");assert.equal(plan.videoDurationSeconds,120);assert.equal(plan.outputDurationSeconds,120);assert.deepEqual(plan.tracks.map(t=>t.id),["music-1","voice-1"]);assert.equal(plan.tracks[0].endSeconds,91);assert.deepEqual(plan.tracks[0].ducking.targetTrackIds,["voice-1"]);

const rev2=post.createPostProductionRevision(rev1,{id:"post-2",createdAt:"2026-11-19T00:01:00.000Z",audioTracks:[placedMusic,placedVoice,post.updatePostAudioTrack(placedEffect,{enabled:true,startSeconds:125})]});
assert.equal(rev2.revisions[1].parentRevisionId,"post-1");assert.equal(rev2.revisions[1].parentRenderVersion,"r7");assert.equal(rev2.revisions[1].originalRenderRef,"renders/render-1.mp4");
const extended=post.calculateDerivedAudioTimeline(rev2);assert.equal(extended.outputDurationSeconds,126);assert.equal(extended.tracks.length,3);
assert.equal(post.selectPostProductionRevision(rev2,"post-1").activeRevisionId,"post-1");assert.equal(post.selectPostProductionRevision(rev2,null).activeRevisionId,null);
assert.throws(()=>post.createPostProductionRevision(rev2,{id:"post-3",createdAt:"x",audioTracks:[placedMusic,{...placedVoice,enabled:false}]}),/Invalid post-production audio tracks/);
console.log("PASS audio import metadata, bounded trims/fades, explicit ducking, disabled-by-default music, derived timing, and immutable render-linked revisions");
