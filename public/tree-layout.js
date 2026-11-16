import { sessionCommits } from './commit-evidence.js';
import { featureOwnerKey, sessionContributorKey } from './project-map.js';

// Build an explicit hierarchy, never a Git ancestry or inferred effort graph.
export function projectTree(model, project, grouping = 'people') {
  const sessionNode = (session, prefix) => ({ key: prefix + '/session/' + session.id, kind: 'session', id: session.id, title: session.participant || 'Contributor', subtitle: session.sync?.summary || session.intent || 'Session in progress', meta: `${sessionCommits(session).length} commits · ${session.sync?.verified?.changedFiles?.length || 0} files`, status: session.status, children: [] });
  const featureNode = (entry, prefix, person) => {
    const f = entry.feature;
    const linked = person ? entry.sessions.filter(s => sessionContributorKey(s) === person) : entry.sessions;
    const key = prefix + '/feature/' + f.id;
    return { key, kind: 'feature', id: f.id, title: f.title, subtitle: f.owner || 'Unassigned', status: f.status, comments: f.comments?.length || 0, meta: `${f.checklist?.filter(c => c.done).length || 0}/${f.checklist?.length || 0} checks · ${linked.length} sessions`, children: linked.map(s => sessionNode(s, key)) };
  };
  const root = { key: 'project/' + project.id, kind: 'project', id: project.id, title: project.name, subtitle: `${model.summary.people} contributors · ${model.summary.handoffs} handoffs`, meta: `${model.summary.features} features · ${model.summary.commits} recorded commits`, children: [] };
  if (grouping === 'people') root.children = model.groups.map(group => {
    const key = root.key + '/person/' + group.key;
    return { key, kind: 'person', id: group.key, title: group.label, subtitle: group.unassigned ? 'Unassigned work' : 'Contributor', meta: `${group.entries.filter(e => group.unassigned || featureOwnerKey(e.feature) === group.key).length} assigned · ${group.sessions.length} sessions`, children: [...group.entries.map(e => featureNode(e, key, group.unassigned ? '' : group.key)), ...model.unlinkedSessions.filter(s => sessionContributorKey(s) === group.key).map(s => sessionNode(s, key))] };
  });
  else root.children = [...model.entries.map(entry => featureNode(entry, root.key)), ...model.unlinkedSessions.map(s => sessionNode(s, root.key))];
  return root;
}
export function flattenTree(root) { return [root, ...root.children.flatMap(flattenTree)]; }
const dimensions = kind => ({ width: kind === 'project' ? 248 : kind === 'person' ? 220 : 240, height: kind === 'feature' ? 194 : kind === 'session' ? 202 : 130 });
export function layoutTree(root, isOpen = () => true, direction = "down") {
  if (direction === "down") return layoutDown(root, isOpen);
  const nodes = [], edges = [], gap = 28, column = 356, padding = 36;
  const measure = node => {
    const size = dimensions(node.kind), open = isOpen(node);
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

function layoutDown(root, isOpen) {
  const nodes=[], edges=[], gap=28, padding=36;
  const measure=node=>{
    const size=dimensions(node.kind),expanded=isOpen(node);
    const children=expanded?node.children.map(measure):[];
    return {...node,...size,expanded,childCount:node.children.length,children,span:Math.max(size.width,children.reduce((sum,c)=>sum+c.span,0)+Math.max(0,children.length-1)*gap)};
  };
  const tree=measure(root), rowHeights=[];
  const collect=(node,depth)=>{rowHeights[depth]=Math.max(rowHeights[depth]||0,node.height);node.children.forEach(child=>collect(child,depth+1));};
  collect(tree,0);
  const rowTops=rowHeights.map((_,depth)=>padding+rowHeights.slice(0,depth).reduce((sum,height)=>sum+height+48,0));
  const place=(node,depth,left,parent)=>{
    const placed={...node,x:left+(node.span-node.width)/2,y:rowTops[depth]};nodes.push(placed);
    if(parent)edges.push({from:parent.key,to:placed.key,x1:parent.x+parent.width/2,y1:parent.y+parent.height,x2:placed.x+placed.width/2,y2:placed.y,vertical:true});
    let cursor=left+(node.span-(node.children.reduce((sum,c)=>sum+c.span,0)+Math.max(0,node.children.length-1)*gap))/2;
    for(const child of node.children){place(child,depth+1,cursor,placed);cursor+=child.span+gap;}
  };
  place(tree,0,padding);
  return {nodes,edges,width:tree.span+padding*2,height:Math.max(...nodes.map(n=>n.y+n.height))+padding};
}
