import { describe, it, expect } from 'vitest';
import { projectTree, flattenTree, layoutTree, fitCamera, zoomAt, clampZoom } from '../public/tree-layout.js';
import { buildProjectMap } from '../public/project-map.js';
import { sampleWorkspace } from '../public/demo.js';
const sample=sampleWorkspace();
const model=buildProjectMap({projectId:'p1',features:sample.features,sessions:sample.sessions});
const project=sample.projects.find(p=>p.id==='p1');
describe('explorable project tree',()=>{
 it('has unique instance keys for shared features and only actual relationships',()=>{
  const root=projectTree(model,project,'people'),nodes=flattenTree(root);
  expect(new Set(nodes.map(n=>n.key)).size).toBe(nodes.length);
  expect(root.children.length).toBe(model.groups.length);
  for(const group of root.children) for(const feature of group.children.filter(n=>n.kind==='feature')) for(const s of feature.children) {
   const original=sample.sessions.find(item=>item.id===s.id);
   expect(original.featureId).toBe(feature.id);
   expect(original.participant).toBe(group.title);
  }
 });
 it('keeps orphan sessions and unassigned work navigable',()=>{
  const filtered=buildProjectMap({projectId:'empty',features:[{id:'f',projectId:'empty',title:'Unassigned',checklist:[],status:'planned'}],sessions:[{id:'s',projectId:'empty',participant:'Person',startedAt:'2026-11-16',status:'choosing'}]});
  for(const grouping of ['features','people']) {
   const nodes=flattenTree(projectTree(filtered,{id:'empty',name:'Empty'},grouping));
   expect(nodes.some(n=>n.id==='f')).toBe(true);expect(nodes.some(n=>n.id==='s')).toBe(true);
  }
 });
 it('lays out deep and broad trees without overlap or edges pointing to missing nodes',()=>{
  const root=projectTree(model,project,'people');
  for(const open of [()=>true,n=>n.kind==='project'||n.kind==='person']) {
   const layout=layoutTree(root,open);
   for(const a of layout.nodes) {
    expect(a.x).toBeGreaterThanOrEqual(0);expect(a.y).toBeGreaterThanOrEqual(0);
    expect(a.x+a.width).toBeLessThanOrEqual(layout.width);expect(a.y+a.height).toBeLessThanOrEqual(layout.height);
    for(const b of layout.nodes.filter(b=>b.key!==a.key)) expect(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y).toBe(true);
   }
   expect(layout.edges.length).toBe(layout.nodes.length-1);
   for(const edge of layout.edges) expect(layout.nodes.some(n=>n.key===edge.to)).toBe(true);
  }
 });
 it('collapses branches without losing children or metadata',()=>{
  const root=projectTree(model,project,'features'),layout=layoutTree(root,n=>n.kind==='project');
  expect(layout.nodes.filter(n=>n.kind==='session')).toHaveLength(0);
  expect(layout.nodes.some(n=>n.childCount>0&&n.kind==='feature')).toBe(true);
  expect(flattenTree(root).some(n=>n.kind==='session')).toBe(true);
 });
 it('fits a project and keeps the cursor world position fixed when zooming',()=>{
  const layout=layoutTree(projectTree(model,project,'people'),n=>n.kind==='project'||n.kind==='person');
  const camera=fitCamera(layout,1200,700),point={x:440,y:300};
  const next=zoomAt(camera,camera.scale*1.2,point);
  expect((point.x-camera.x)/camera.scale).toBeCloseTo((point.x-next.x)/next.scale);
  expect((point.y-camera.y)/camera.scale).toBeCloseTo((point.y-next.y)/next.scale);
  expect(clampZoom(Infinity)).toBe(1);expect(clampZoom(0)).toBe(.2);expect(clampZoom(10)).toBe(1.6);
  expect(camera.x).toBeGreaterThanOrEqual(0);expect(camera.y).toBeGreaterThanOrEqual(0);
 });
});
