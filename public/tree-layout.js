import { sessionCommits } from './commit-evidence.js';
import { featureOwnerKey, sessionContributorKey } from './project-map.js';

// Build an explicit hierarchy, never a Git ancestry or inferred effort graph.
export function projectTree(model, project, grouping = 'people') {
  const sessionNode = (session, prefix) => ({ key: prefix + '/session/' + session.id, kind: 'session', id: session.id, title: session.participant || 'Contributor', subtitle: session.sync?.summary || session.intent || 'Session in progress', meta: `${sessionCommits(session).length} ${sessionCommits(session).length === 1 ? 'commit' : 'commits'} · ${session.sync?.verified?.changedFiles?.length || 0} ${session.sync?.verified?.changedFiles?.length === 1 ? 'file' : 'files'}`, status: session.status, timestamp: session.syncedAt || session.startedAt, children: [] });
  const featureNode = (entry, prefix, person) => {
    const f = entry.feature;
    const linked = person ? entry.sessions.filter(s => sessionContributorKey(s) === person) : entry.sessions;
    const key = prefix + '/feature/' + f.id;
    return { key, kind: 'feature', compact: grouping === 'people', id: f.id, title: f.title, subtitle: f.owner || 'Unassigned', status: f.status, comments: f.comments?.length || 0, completed: f.checklist?.filter(c => c.done).length || 0, total: f.checklist?.length || 0, sessionCount: linked.length, meta: `${f.checklist?.filter(c => c.done).length || 0}/${f.checklist?.length || 0} checks · ${linked.length} ${linked.length === 1 ? "session" : "sessions"}`, children: linked.map(s => sessionNode(s, key)) };
  };
  const root = { key: 'project/' + project.id, kind: 'project', id: project.id, title: project.name, subtitle: `${model.summary.people} contributors · ${model.summary.handoffs} handoffs`, meta: `${model.summary.features} features · ${model.summary.commits} recorded commits`, children: [] };
  if (grouping === 'people') root.children = model.groups.map(group => {
    const key = root.key + '/person/' + group.key;
    return { key, kind: 'person', id: group.key, title: group.label, subtitle: group.unassigned ? 'Unassigned work' : 'Contributor', meta: `${group.entries.filter(e => group.unassigned || featureOwnerKey(e.feature) === group.key).length} assigned · ${group.sessions.length} ${group.sessions.length === 1 ? "session" : "sessions"}`, children: [...group.entries.map(e => featureNode(e, key, group.unassigned ? '' : group.key)), ...model.unlinkedSessions.filter(s => sessionContributorKey(s) === group.key).map(s => sessionNode(s, key))] };
  });
  else root.children = [...model.entries.map(entry => featureNode(entry, root.key)), ...model.unlinkedSessions.map(s => sessionNode(s, root.key))];
  return root;
}
export function flattenTree(root) { return [root, ...root.children.flatMap(flattenTree)]; }
const dimensions = node => ({ width: node.kind === 'project' ? 300 : node.kind === 'person' ? 250 : 280, height: node.kind === 'feature' ? 208 : node.kind === 'session' ? 208 : node.kind === 'person' ? 104 : 148 });
export function layoutTree(root, isOpen = () => true, direction = "down", compact = false) {
  if (direction === "down") return layoutDown(root, isOpen, compact);
  const nodes = [], edges = [], gap = 28, column = 356, padding = 36;
  const measure = node => {
    const size = dimensions(node), open = isOpen(node);
    const children = open ? node.children.map(measure) : [];
    return { ...node, ...size, expanded: open, childCount: node.children.length, children, span: Math.max(size.height, children.reduce((sum, child) => sum + child.span, 0) + Math.max(0, children.length - 1) * gap) };
  };
  const tree = measure(root);
  const place = (node, depth, top, parent) => {
    const placed = { ...node, x: padding + depth * column, y: top + (node.span - node.height) / 2 };
    nodes.push(placed);
    if (parent) edges.push({ from: parent.key, to: placed.key, x1: parent.x + parent.width, y1: parent.y + parent.height / 2, x2: placed.x, y2: placed.y + placed.height / 2 });
    let cursor = top + (node.span - (node.children.reduce((sum, child) => sum + child.span, 0) + Math.max(0, node.children.length - 1) * gap)) / 2;
    for (const child of node.children) { place(child, depth + 1, cursor, placed); cursor += child.span + gap; }
  };
  place(tree, 0, padding);
  return { nodes, edges, width: Math.max(...nodes.map(n => n.x + n.width)) + padding, height: tree.span + padding * 2 };
}
export const clampZoom = scale => Math.max(.2, Math.min(1.6, Number.isFinite(scale) ? scale : 1));
export function fitCamera(layout, width, height) {
  const scale = clampZoom(Math.min((width - 40) / layout.width, (height - 40) / layout.height, 1));
  return { scale, x: (width - layout.width * scale) / 2, y: (height - layout.height * scale) / 2 };
}
export function zoomAt(camera, nextScale, point) {
  const scale = clampZoom(nextScale), ratio = scale / camera.scale;
  return { scale, x: point.x - (point.x - camera.x) * ratio, y: point.y - (point.y - camera.y) * ratio };
}

function layoutDown(root, isOpen, compact) {
  const nodes=[], edges=[], gap=32, padding=20, levelGap=20;
  const measure=node=>{
    const size=dimensions(node), expanded=isOpen(node);
    const children=expanded?node.children.map(measure):[];
    // Contributor branches stack sibling features, keeping large teams compact.
    const stacked=(node.kind==='person'&&(compact||root.children.length>2||node.children.length>2))||(compact&&node.kind==='feature');
    const childrenWidth=stacked?Math.max(0,...children.map(c=>c.span))+24:children.reduce((sum,c)=>sum+c.span,0)+Math.max(0,children.length-1)*gap;
    const childrenHeight=stacked?children.reduce((sum,c)=>sum+c.depthHeight,0)+Math.max(0,children.length-1)*gap:Math.max(0,...children.map(c=>c.depthHeight));
    return {...node,...size,expanded,childCount:node.children.length,children,stacked,span:Math.max(size.width,childrenWidth),depthHeight:size.height+(children.length?levelGap+childrenHeight:0)};
  };
  const tree=measure(root);
  const place=(node,left,top,parent)=>{
    const placed={...node,x:left+(node.span-node.width)/2,y:top};nodes.push(placed);
    if(parent) {
      if(parent.stacked) {
        const lane=left+4;
        edges.push({from:parent.key,to:placed.key,path:`M${parent.x+16},${parent.y+parent.height} V${parent.y+parent.height+18} Q${parent.x+16},${parent.y+parent.height+26} ${lane},${parent.y+parent.height+26} V${placed.y+placed.height/2-8} Q${lane},${placed.y+placed.height/2} ${lane+8},${placed.y+placed.height/2} H${placed.x}`});
      } else edges.push({from:parent.key,to:placed.key,x1:parent.x+parent.width/2,y1:parent.y+parent.height,x2:placed.x+placed.width/2,y2:placed.y,vertical:true});
    }
    let cursor=left+(node.span-(node.children.reduce((sum,c)=>sum+c.span,0)+Math.max(0,node.children.length-1)*gap))/2;
    let y=top+node.height+levelGap;
    for(const child of node.children) {
      if(node.stacked){place(child,left+24,y,placed);y+=child.depthHeight+gap;}
      else {place(child,cursor,y,placed);cursor+=child.span+gap;}
    }
  };
  place(tree,padding,padding);
  return {nodes,edges,width:tree.span+padding*2,height:tree.depthHeight+padding*2};
}
