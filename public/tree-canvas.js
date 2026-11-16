import { icon } from './icons.js';
import { projectTree, flattenTree, layoutTree, fitCamera, zoomAt } from './tree-layout.js';
const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
const labels = { planned:'Planned', active:'In progress', review:'In review', blocked:'Blocked', done:'Done', synced:'Synced', choosing:'Choosing work' };
const states = new Map();

export function mountTreeCanvas(host, { model, project, grouping, selection, onOpen, onComments, onFilter, onFocusChange }) {
  const stateKey = project.id + ':' + grouping;
  if (!states.has(stateKey)) states.set(stateKey, { expanded:new Set(), collapsed:new Set(), camera:null, isolated:null, fit:true, direction:"down" });
  const state = states.get(stateKey), root = projectTree(model, project, grouping);
  const all = flattenTree(root), byKey = new Map(all.map(node => [node.key, node]));
  let layout, observer, controller = new AbortController();
  const on = (target, type, fn, options = {}) => target.addEventListener(type, fn, { ...options, signal:controller.signal });
  const isOpen = node => state.expanded.has(node.key) || (!state.collapsed.has(node.key) && ['project','person'].includes(node.kind));
  const draw = () => {
    const branch = byKey.get(state.isolated) || root;
    if (branch === root) state.isolated = null;
    layout = layoutTree(branch, node => node === branch || isOpen(node), state.direction);
    host.innerHTML = `<div class="tree-heading"><div><span class="tree-kicker">${state.isolated ? 'Focused branch' : 'Project tree'}</span><strong>${e(branch.title)}</strong></div><div class="tree-heading-actions"><label class="sr-only" for="tree-direction">Tree direction</label><select id="tree-direction" aria-label="Tree direction"><option value="down" ${state.direction==='down'?'selected':''}>↓ Down</option><option value="right" ${state.direction==='right'?'selected':''}>→ Right</option></select>${state.isolated ? '<button class="button compact" data-camera="project">Entire project</button>' : ''}<button class="button compact" data-tree-focus aria-pressed="false">Focus tree</button></div></div><div class="tree-stage tree-flow-${state.direction}" tabindex="0" role="region" aria-label="Interactive project tree" aria-describedby="tree-instructions"><div class="tree-world" style="width:${layout.width}px;height:${layout.height}px"><svg class="tree-edges" width="${layout.width}" height="${layout.height}" aria-hidden="true">${layout.edges.map(edge => `<path d="M${edge.x1},${edge.y1} ${edge.vertical ? `C${edge.x1},${(edge.y1+edge.y2)/2} ${edge.x2},${(edge.y1+edge.y2)/2}` : `C${(edge.x1+edge.x2)/2},${edge.y1} ${(edge.x1+edge.x2)/2},${edge.y2}`} ${edge.x2},${edge.y2}"/>`).join('')}</svg>${layout.nodes.map(node => nodeHtml(node, selection)).join('')}</div><div class="tree-camera-controls" role="group" aria-label="Tree zoom"><button type="button" data-camera="out" aria-label="Zoom out">−</button><button type="button" data-camera="actual" aria-label="Actual size" class="tree-scale">100%</button><button type="button" data-camera="in" aria-label="Zoom in">+</button><button type="button" data-camera="fit">Fit project</button></div><svg class="tree-minimap" role="img" aria-label="Project overview. Click to navigate." viewBox="0 0 ${layout.width} ${layout.height}" preserveAspectRatio="none">${layout.nodes.map(n => `<rect x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" rx="12" class="mini-${n.kind}"/>`).join('')}<rect class="mini-window"/></svg></div><div class="tree-caption"><p id="tree-instructions">Drag the background to pan. Use + / − to zoom, or Fit project. Arrow keys move the canvas; Enter opens a node.</p><span>${layout.nodes.length} nodes · ${model.entries.length} matching features</span></div>`;
    onFocusChange();
    if (!state.camera || state.fit) fit(); else paint();
  };
  const stage = () => host.querySelector('.tree-stage');
  function fit() { const el = stage(); if (!el?.clientWidth) return; state.camera = fitCamera(layout, el.clientWidth, Math.max(220, el.clientHeight - 58)); state.fit = true; paint(); }
  function paint() {
    const el = stage(); if (!state.camera || !el) return;
    const { x,y,scale } = state.camera;
    host.querySelector('.tree-world').style.transform = `translate(${x}px,${y}px) scale(${scale})`;
    host.querySelector('.tree-scale').textContent = Math.round(scale * 100) + '%';
    const rect = host.querySelector('.mini-window');
    for (const [key,value] of Object.entries({ x:-x/scale, y:-y/scale, width:el.clientWidth/scale, height:el.clientHeight/scale })) rect.setAttribute(key, value);
  }
  function zoom(factor, point) {
    const el=stage(); state.fit=false;
    state.camera=zoomAt(state.camera, state.camera.scale*factor, point || {x:el.clientWidth/2,y:el.clientHeight/2}); paint();
  }
  draw();
  observer = new ResizeObserver(() => { if (state.fit) fit(); else paint(); }); observer.observe(host);
  on(host,'click', event => {
    const button=event.target.closest('button'); if (!button) return;
    const key=button.dataset.treeKey, node=byKey.get(key);
    const action=button.dataset.treeAction;
    if (node && action) {
      if (action==='toggle') { if (isOpen(node)) {state.expanded.delete(key);state.collapsed.add(key);} else {state.collapsed.delete(key);state.expanded.add(key);} draw(); host.querySelector(`[data-tree-key="${CSS.escape(key)}"][data-tree-action="toggle"]`)?.focus({preventScroll:true}); }
      if (action==='isolate') { state.isolated=key;state.fit=true;draw();stage().focus({preventScroll:true}); }
      if (action==='open') {
        if (node.kind==='feature'||node.kind==='session') onOpen(node.kind,node.id);
        else if (node.kind==='person') onFilter(node.id);
        else { state.isolated=null;state.fit=true;draw(); }
      }
      if (action==='comments') onComments(node.kind,node.id);
      return;
    }
    const camera=button.dataset.camera;
    if(camera==='fit')fit();
    if(camera==='in')zoom(1.2);
    if(camera==='out')zoom(1/1.2);
    if(camera==='actual')zoom(1/state.camera.scale);
    if(camera==='project'){state.isolated=null;state.fit=true;draw();}
  });
  on(host,'change',event=>{if(event.target.id==='tree-direction'){state.direction=event.target.value;state.fit=true;draw();host.querySelector('#tree-direction').focus({preventScroll:true});}});
  let drag=null;
  on(host,'pointerdown',event=>{
    if(event.button!==0 || event.target.closest('button,input,select,.tree-node'))return;
    if(event.target.closest('.tree-minimap')) {
      const rect=host.querySelector('.tree-minimap').getBoundingClientRect(),el=stage();
      state.fit=false;state.camera.x=el.clientWidth/2-(event.clientX-rect.left)/rect.width*layout.width*state.camera.scale;
      state.camera.y=el.clientHeight/2-(event.clientY-rect.top)/rect.height*layout.height*state.camera.scale;paint();return;
    }
    if(!event.target.closest('.tree-stage'))return;
    drag={id:event.pointerId,x:event.clientX,y:event.clientY};stage().setPointerCapture(event.pointerId);stage().classList.add('panning');stage().focus({preventScroll:true});
  });
  on(host,'pointermove',event=>{
    if(!drag||drag.id!==event.pointerId)return;
    state.fit=false;state.camera.x+=event.clientX-drag.x;state.camera.y+=event.clientY-drag.y;drag.x=event.clientX;drag.y=event.clientY;paint();
  });
  const end=()=>{drag=null;stage()?.classList.remove('panning');};
  on(host,'pointerup',end);on(host,'pointercancel',end);on(host,'lostpointercapture',end);
  on(host,'wheel',event=>{
    if(!event.target.closest('.tree-stage'))return;
    // Ordinary scrolling stays native; Ctrl/Meta-wheel (including trackpad pinch) zooms.
    if(event.ctrlKey||event.metaKey){event.preventDefault();const r=stage().getBoundingClientRect();zoom(Math.exp(-event.deltaY*.008),{x:event.clientX-r.left,y:event.clientY-r.top});}
  },{passive:false});
  on(host,'keydown',event=>{
    if(event.target!==stage())return;
    const deltas={ArrowLeft:[70,0],ArrowRight:[-70,0],ArrowUp:[0,70],ArrowDown:[0,-70]};
    if(deltas[event.key]){event.preventDefault();state.fit=false;state.camera.x+=deltas[event.key][0];state.camera.y+=deltas[event.key][1];paint();}
    if(event.key==='+'||event.key==='='){event.preventDefault();zoom(1.2);}
    if(event.key==='-'){event.preventDefault();zoom(1/1.2);}
    if(event.key==='0'){event.preventDefault();fit();}
  });
  // Bring keyboard-focused nodes into view without native scrolling the transformed world.
  on(host,'focusin',event=>{
    const nodeElement=event.target.closest('.tree-node');if(!nodeElement)return;
    const node=layout.nodes.find(n=>n.key===nodeElement.dataset.nodeKey),el=stage();
    if(!node)return;
    const c=state.camera,left=node.x*c.scale+c.x,top=node.y*c.scale+c.y;
    if(left<0||top<0||left+node.width*c.scale>el.clientWidth||top+node.height*c.scale>el.clientHeight){state.fit=false;c.x=(el.clientWidth-node.width*c.scale)/2-node.x*c.scale;c.y=(el.clientHeight-node.height*c.scale)/2-node.y*c.scale;paint();}
  });
  return {
    expandAll(open) { for(const node of all){ if(open){state.collapsed.delete(node.key);state.expanded.add(node.key);}else{state.expanded.delete(node.key);state.collapsed.add(node.key);} }state.fit=true;draw(); },
    destroy(){observer.disconnect();controller.abort();},
  };
}
function nodeHtml(node,selection) {
  const active=selection?.kind===node.kind&&selection?.id===node.id;
  const label=node.kind==='person'?'Contributor':node.kind==='session'?'Session':node.kind==='project'?'Project':'Feature';
  const contentKind=['feature','session'].includes(node.kind);
  return `<article class="tree-node tree-${node.kind}${active?' selected':''}" data-node-key="${e(node.key)}" style="left:${node.x}px;top:${node.y}px;width:${node.width}px;height:${node.height}px"><div class="tree-node-top"><span class="tree-node-kind">${icon(node.kind==='person'?'user':node.kind==='session'?'git-commit-horizontal':node.kind==='project'?'git-branch':'network')}${label}</span>${node.status?`<span class="tree-node-status"><i class="status-dot ${e(node.status)}"></i>${e(labels[node.status]||node.status)}</span>`:''}</div><button class="tree-node-open" data-tree-action="open" data-tree-key="${e(node.key)}" aria-label="${e(contentKind?'Open '+label.toLowerCase()+': '+node.title:node.kind==='person'?'Filter by '+node.title:'View entire project')}"><strong>${e(node.title)}</strong><span>${e(node.subtitle)}</span></button><div class="tree-node-meta">${e(node.meta)}</div><div class="tree-node-actions">${contentKind?`<button data-tree-action="comments" data-tree-key="${e(node.key)}" aria-label="${node.kind==='feature'?'Comments on':'Discuss session by'} ${e(node.title)}">${icon('message-circle')}${node.kind==='feature'?'Comments'+(node.comments?' · '+node.comments:''):'Discuss'}</button>`:''}${node.childCount?`<button data-tree-action="isolate" data-tree-key="${e(node.key)}" aria-label="Focus branch: ${e(node.title)}">Focus branch</button>`:''}</div>${node.childCount&&node.kind!=='project'?`<button class="tree-node-toggle" data-tree-action="toggle" data-tree-key="${e(node.key)}" aria-expanded="${node.expanded}" aria-label="${node.expanded?'Collapse':'Expand'} ${e(node.title)}">${node.expanded?'−':'+'}<span class="sr-only"> ${node.childCount} branches</span></button>`:''}</article>`;
}
