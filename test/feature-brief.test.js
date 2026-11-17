import { describe, it, expect } from 'vitest';
import { featureBrief } from '../public/feature-brief.js';
import { sampleWorkspace } from '../public/demo.js';
import { projectTree } from '../public/tree-layout.js';
import { buildProjectMap } from '../public/project-map.js';

describe('features continue across conversations', () => {
  it('copies every recorded session for the feature without initiating work', () => {
    const data = sampleWorkspace();
    const feature = data.features.find(f => f.id === 'f1');
    const before = JSON.stringify(data);
    const brief = featureBrief(feature, data.projects[0], [
      ...data.sessions,
      { id:'private', projectId:'other', featureId:'f1', participant:'Private person', intent:'Unrelated confidential work' },
    ]);
    expect(brief).toContain('Recorded session history (3)');
    for (const id of ['s1', 's5', 's6']) expect(brief).toContain(` · ${id}\n`);
    expect(brief.indexOf(' · s5\n')).toBeLessThan(brief.indexOf(' · s1\n'));
    expect(brief.indexOf(' · s1\n')).toBeLessThan(brief.indexOf(' · s6\n'));
    expect(brief).toContain('Status: active');
    expect(brief).toContain('- [ ] Show dates');
    expect(brief).not.toMatch(/Private person|Unrelated confidential work|start_collaboration_session|claim_feature|Call Collavibe/);
    expect(JSON.stringify(data)).toBe(before);
  });

  it('shows the same unfinished feature across contributors and all its sessions together by feature', () => {
    const data = sampleWorkspace();
    const model = buildProjectMap({projectId:'p1',features:data.features,sessions:data.sessions});
    const featureTree = projectTree(model, data.projects[0], 'features');
    const dueDates = featureTree.children.find(n => n.id === 'f1');
    expect(dueDates).toMatchObject({status:'active',completed:1,total:3,sessionCount:3});
    expect(dueDates.children.map(n=>n.id).sort()).toEqual(['s1','s5','s6']);
    const peopleTree = projectTree(model, data.projects[0], 'people');
    const maya = peopleTree.children.find(n=>n.title==='Maya').children.find(n=>n.id==='f1');
    const sam = peopleTree.children.find(n=>n.title==='Sam').children.find(n=>n.id==='f1');
    expect(maya.sessionCount).toBe(2);
    expect(sam.sessionCount).toBe(1);
    expect(maya.id).toBe(sam.id);
  });

  it('keeps a planned feature with no sessions usable as a brief', () => {
    const brief = featureBrief({id:'new',projectId:'p',title:'Search',status:'planned'}, {name:'Example'});
    expect(brief).toContain('Owner: Unassigned');
    expect(brief).toContain('Recorded session history (0)');
    expect(brief).toContain('No description recorded.');
  });
});
