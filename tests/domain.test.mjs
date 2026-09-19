import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,reducer,pickContent,ready} from '../src/lib/domain.ts';
test('version-bound review, revision, scheduling, partial result and safe retry',()=>{
 let s=initialState();const send=a=>{s=reducer(s,a)};const work=()=>s.work.find(w=>w.id==='CH-243');
 send({type:'role',role:'writer'});send({type:'edit',id:'CH-243',content:{...pickContent(work()),body:'نص جديد لليوم الوطني'}});send({type:'submit',id:'CH-243'});
 assert.equal(work().release.body,'نص جديد لليوم الوطني');assert.equal(work().release.revision,2);
 send({type:'role',role:'assistant'});send({type:'changes',id:'CH-243',text:'أضف رسالة شكر'});assert.equal(work().status,'CHANGES_REQUESTED');
 send({type:'role',role:'writer'});send({type:'edit',id:'CH-243',content:{...pickContent(work()),body:'شكراً لفريقنا'}});send({type:'submit',id:'CH-243'});
 send({type:'role',role:'director'});send({type:'approve',id:'CH-243'});assert.equal(work().release.revision,3);assert(ready(work()));
 send({type:'schedule',id:'CH-243',date:'2026-09-23T18:00'});assert.equal(work().status,'APPROVED');
 send({type:'role',role:'publisher'});send({type:'schedule',id:'CH-243',date:'2026-09-23T18:00'});assert.equal(work().scheduled,'2026-09-23T18:00');
 send({type:'publish',id:'CH-243'});assert.equal(work().status,'PUBLISHING');send({type:'result',id:'CH-243',mode:'partial'});assert.equal(work().status,'PARTIAL');assert.equal(work().results.Instagram,'SUCCESS');assert.equal(work().results.LinkedIn,'FAILED');
 send({type:'retry',id:'CH-243'});send({type:'result',id:'CH-243',mode:'success'});assert.equal(work().status,'PUBLISHED');assert.equal(work().results.Instagram,'SUCCESS');
 assert(s.notices.some(n=>n.kind==='attention'));send({type:'role',role:'writer'});send({type:'edit',id:'CH-243',content:{...pickContent(work()),body:'تعديل بعد الاعتماد'}});assert.equal(work().status,'DRAFT');assert.equal(work().release,undefined);assert.equal(work().scheduled,undefined);assert(!ready(work()));
});
test('Admin cannot approve or publish, and reading notification does not approve',()=>{let s=initialState();s=reducer(s,{type:'role',role:'admin'});s=reducer(s,{type:'approve',id:'CH-241'});assert.equal(s.work[0].status,'IN_REVIEW');s=reducer(s,{type:'read',id:'n1'});assert(s.notices[0].read);assert.equal(s.work[0].status,'IN_REVIEW');s=reducer(s,{type:'publish',id:'CH-242'});assert.equal(s.work[1].status,'APPROVED')});
test('failed publication and invalid input stay coherent',()=>{let s=initialState();s=reducer(s,{type:'role',role:'publisher'});s=reducer(s,{type:'schedule',id:'CH-242',date:'bad-date'});assert.equal(s.work[1].status,'APPROVED');s=reducer(s,{type:'publish',id:'CH-242'});s=reducer(s,{type:'result',id:'CH-242',mode:'failure'});assert.equal(s.work[1].status,'FAILED');s=reducer(s,{type:'create',content:pickContent(s.work[0]),submit:true});assert.equal(s.work.length,5)});
test('submitted and approved snapshots survive later edits with exact copy, variants and assets',()=>{
 let s=initialState();const send=a=>s=reducer(s,a);const work=()=>s.work[0];
 const submitted=structuredClone(work().history[0]);
 send({type:'approve',id:'CH-241'});const approved=structuredClone(work().history.at(-1));
 send({type:'role',role:'producer'});send({type:'edit',id:'CH-241',content:{...pickContent(work()),body:'المحتوى الجديد',assetId:'poster',assetVersion:3,channels:['X'],variants:{Instagram:'',X:'صياغة جديدة',LinkedIn:''}}});
 assert.deepEqual(work().history[0],submitted);assert.deepEqual(work().history.at(-1),approved);assert.equal(work().history.at(-1).release.assetVersion,4);assert.equal(work().history.at(-1).release.assetId,'reel');assert.equal(work().release,undefined);
 send({type:'submit',id:'CH-241'});assert.equal(work().history.length,3);assert.equal(work().history.at(-1).release.revision,5);assert.equal(work().history.at(-1).release.variants.X,'صياغة جديدة');
});
test('retry cannot replace a successful channel even if retry result fails',()=>{
 let s=initialState();const send=a=>s=reducer(s,a);send({type:'role',role:'publisher'});send({type:'publish',id:'CH-242'});send({type:'result',id:'CH-242',mode:'partial'});const successful=s.work[1].results.Instagram;
 send({type:'retry',id:'CH-242'});send({type:'result',id:'CH-242',mode:'failure'});assert.equal(s.work[1].results.Instagram,successful);assert.equal(s.work[1].results.X,'SUCCESS');assert.equal(s.work[1].results.LinkedIn,'FAILED');assert.equal(s.work[1].status,'PARTIAL');
});
