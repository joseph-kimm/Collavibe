import { icon } from './icons.js';
import { projectTree, flattenTree, layoutTree, fitCamera, zoomAt } from './tree-layout.js';
const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
const labels = { planned:'Planned', active:'In progress', review:'In review', blocked:'Blocked', done:'Done', synced:'Synced', choosing:'Choosing work' };
const states = new Map();

export function mountTreeCanvas(host, { model, project, grouping, selection, onOpen, onComments, onFilter, onFocusChange }) {
  const stateKey = project.id + ':' + grouping;
  if (!states.has(stateKey)) states.set(stateKey, { expanded:new Set(), collapsed:new Set(), camera:null, isolated:null, fit:true, firstView:true, direction:"down" });
  const state = states.get(stateKey), root = projectTree(model, project, grouping);
  const all = flattenTree(root), byKey = new Map(all.map(node => [node.key, node]));
  // A shared handoff link should reveal its path in the diagram as well as the inspector.
  const reveal = (node, ancestors = []) => {
    if (selection?.kind === node.kind && selection.id === node.id) {
      for (const parent of ancestors) { state.collapsed.delete(parent.key); state.expanded.add(parent.key); }
      if (state.isolated && !ancestors.some(parent => parent.key === state.isolated) && state.isolated !== node.key) state.isolated = null;
      return true;
    }
    return node.children.some(child => reveal(child, [...ancestors, node]));
  };
  reveal(root);
  let layout, observer, controller = new AbortController();
  const on = (target, type, fn, options = {}) => target.addEventListener(type, fn, { ...options, signal:controller.signal });
  const isOpen = node => state.expanded.has(node.key) || (!state.collapsed.has(node.key) && ['project','person'].includes(node.kind));
  const draw = () => {
    const branch = byKey.get(state.isolated) || root;
    if (branch === root) state.isolated = null;
    layout = layoutTree(branch, node => node === branch || isOpen(node), state.direction, host.clientWidth < 600);
    host.innerHTML = `<div class="tree-heading"><div><span class="tree-kicker">${state.isolated ? 'Focused branch' : 'Project tree'}</span><strong>${e(branch.title)}</strong></div><div class="tree-heading-actions"><label class="sr-only" for="tree-direction">Tree direction</label><select id="tree-direction" aria-label="Tree direction"><option value="down" ${state.direction==='down'?'selected':''}>↓ Down</option><option value="right" ${state.direction==='right'?'selected':''}>→ Right</option></select>${state.isolated ? '<button class="button compact" data-camera="project">Entire project</button>' : ''}<button class="button compact" data-tree-focus aria-pressed="false">Focus tree</button></div></div><div class="tree-stage tree-flow-${state.direction}" tabindex="0" role="region" aria-label="Interactive project tree" aria-describedby="tree-instructions"><div class="tree-world" style="width:${layout.width}px;height:${layout.height}px"><svg class="tree-edges" width="${layout.width}" height="${layout.height}" aria-hidden="true">${layout.edges.map(edge => `<path data-edge-from="${e(edge.from)}" data-edge-to="${e(edge.to)}" d="${edge.path || `M${edge.x1},${edge.y1} ${edge.vertical ? `C${edge.x1},${(edge.y1+edge.y2)/2} ${edge.x2},${(edge.y1+edge.y2)/2}` : `C${(edge.x1+edge.x2)/2},${edge.y1} ${(edge.x1+edge.x2)/2},${edge.y2}`} ${edge.x2},${edge.y2}`}"/>`).join('')}</svg>${layout.nodes.map((node, index) => nodeHtml(node, selection, index === 0)).join('')}</div><div class="tree-camera-controls" role="group" aria-label="Tree zoom"><button type="button" data-camera="out" aria-label="Zoom out">−</button><button type="button" data-camera="actual" aria-label="Actual size" class="tree-scale">100%</button><button type="button" data-camera="in" aria-label="Zoom in">+</button><button type="button" data-camera="fit">Fit project</button></div><svg class="tree-minimap" role="img" aria-label="Project overview. Click to navigate." viewBox="0 0 ${layout.width} ${layout.height}" preserveAspectRatio="none">${layout.nodes.map(n => `<rect x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" rx="12" class="mini-${n.kind}"/>`).join('')}<rect class="mini-window"/></svg></div><div class="tree-caption"><p id="tree-instructions">Drag to pan · + / − to zoom · Arrow keys to move · 0 to fit</p><span>${layout.nodes.length} nodes · ${layout.nodes.filter(node => node.kind === 'feature').length} feature ${layout.nodes.filter(node => node.kind === 'feature').length===1?'card':'cards'} in view</span></div>`;
    onFocusChange();
    if (!state.camera || state.fit) fit(); else paint();
  };
  const stage = () => host.querySelector('.tree-stage');
  function fit() {
    const el = stage(); if (!el?.clientWidth) return;
    // Open narrow screens at a readable scale. Fit remains an explicit overview action.
    if (state.firstView && el.clientWidth < 600) {
      const target = layout.nodes.find(n => selection?.kind === n.kind && selection.id === n.id) || layout.nodes[0];
      const scale = Math.min(1, (el.clientWidth - 40) / target.width);
      state.camera = { scale, x:(el.clientWidth - target.width * scale)/2 - target.x * scale, y:24 - target.y * scale };
      state.fit = false;
    } else if (state.firstView || state.fit === 'width') {
      const scale = Math.min(1, Math.max(.75, (el.clientWidth - 48) / layout.width));
      state.camera = { scale, x:(el.clientWidth-layout.width*scale)/2, y:24 };
      state.fit = 'width';
    } else {
      state.camera = fitCamera(layout, el.clientWidth, Math.max(220, el.clientHeight));
      state.fit = true;
    }
    state.firstView = false; paint();
  }
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
      if (action==='isolate') { state.isolated=key;state.fit=true;state.firstView=host.clientWidth<600;draw();stage().focus({preventScroll:true}); }
      if (action==='open') {
        if (node.kind==='feature'||node.kind==='session') onOpen(node.kind,node.id);
        else if (node.kind==='person') onFilter(node.id);
        else { state.isolated=null;state.fit=true;draw(); }
      }
      if (action==='comments') onComments(node.kind,node.id);
      return;
    }
    const camera=button.dataset.camera;
    if(camera==='fit'){state.fit=true;state.firstView=false;fit();}
    if(camera==='in')zoom(1.2);
    if(camera==='out')zoom(1/1.2);
    if(camera==='actual')zoom(1/state.camera.scale);
    if(camera==='project'){state.isolated=null;state.fit=true;draw();}
  });
  on(host,'change',event=>{if(event.target.id==='tree-direction'){state.direction=event.target.value;state.fit=true;draw();host.querySelector('#tree-direction').focus({preventScroll:true});}});
  // Highlight only the ancestry of a hovered or keyboard-focused node.
  const trace = key => {
    const route = new Set();
    let cursor = key;
    while (cursor) { route.add(cursor); cursor = layout.edges.find(edge => edge.to === cursor)?.from; }
    host.querySelectorAll('.tree-edges path').forEach(path => path.classList.toggle('edge-traced', route.has(path.dataset.edgeTo)));
    host.querySelectorAll('.tree-node').forEach(node => node.classList.toggle('node-traced', route.has(node.dataset.nodeKey)));
  };
  on(host, 'pointerover', event => trace(event.target.closest('.tree-node')?.dataset.nodeKey));
  on(host, 'pointerleave', () => trace(null));
  on(host, 'focusout', event => { if (!host.contains(event.relatedTarget)) trace(null); });
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
    if(event.key==='0'){event.preventDefault();state.fit=true;state.firstView=false;fit();}
  });
  // Bring keyboard-focused nodes into view without native scrolling the transformed world.
  on(host,'focusin',event=>{
    const nodeElement=event.target.closest('.tree-node');if(!nodeElement)return;
    trace(nodeElement.dataset.nodeKey);
    const nativeStage=stage();
    if(nativeStage.scrollLeft || nativeStage.scrollTop) {
      state.camera.x-=nativeStage.scrollLeft; state.camera.y-=nativeStage.scrollTop;
      state.fit=false; nativeStage.scrollLeft=0;nativeStage.scrollTop=0;paint();
    }
    // Pointer focus must not move the target between pointerdown and click.
    if (!event.target.matches(':focus-visible')) return;
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
const initials = name => String(name || '?').split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase();
const avatar = name => `<span class="graph-avatar" aria-hidden="true">${e(initials(name))}</span>`;
const shortDate = value => { const date = new Date(value); return Number.isNaN(date.getTime()) ? 'Date not recorded' : date.toLocaleDateString(undefined, {month:'short',day:'numeric'}); };
function nodeHtml(node,selection,isRoot) {
  const active=selection?.kind===node.kind&&selection?.id===node.id;
  const attr=`data-tree-key="${e(node.key)}"`;
  const action=(type,text,label,extra='')=>`<button type="button" data-tree-action="${type}" ${attr} ${label?`aria-label="${e(label)}"`:''} ${extra}>${text}</button>`;
  const focus=node.childCount&&!isRoot?action('isolate',icon('maximize'),'Focus branch: '+node.title,'class="graph-focus"'):'';
  const status=`<span class="graph-status"><i class="status-dot ${e(node.status)}"></i>${e(labels[node.status]||node.status)}</span>`;
  let body;
  if(node.kind==='project') {
    body=`<div class="graph-hub-mark">${icon('git-branch')}<span>Project</span></div>${action('open',`<strong>${e(node.title)}</strong>`,'View entire project','class="graph-title"')}<p>${e(node.subtitle)}</p><div class="graph-hub-stats">${e(node.meta)}</div>`;
  } else if(node.kind==='person') {
    body=`<div class="graph-person-row">${avatar(node.title)}<div>${action('open',`<strong>${e(node.title)}</strong>`,'Filter by '+node.title,'class="graph-title"')}<span>${e(node.meta)}</span></div>${focus}</div><div class="graph-person-bottom"><span>${e(node.subtitle)}</span>${node.childCount&&!isRoot?action('toggle',`${node.expanded?'−':'+'} ${node.childCount} ${node.childCount===1?'branch':'branches'}`,(node.expanded?'Collapse ':'Expand ')+node.title,`aria-expanded="${node.expanded}"`):''}</div>`;
  } else if(node.kind==='feature') {
    const percent=node.total?100*node.completed/node.total:0;
    body=`<div class="graph-top">${status}${focus}</div>${action('open',`<strong>${e(node.title)}</strong>`,'Open feature: '+node.title,'class="graph-title"')}<div class="graph-owner">${avatar(node.subtitle)}<span>${e(node.subtitle)}</span></div><div class="graph-progress-label"><span>Checklist</span><span>${node.completed} / ${node.total}</span></div><div class="graph-progress" role="progressbar" aria-label="${e(node.title)} checklist" aria-valuemin="0" aria-valuemax="${node.total||1}" aria-valuenow="${node.completed}"><span style="width:${percent}%"></span></div><div class="graph-actions">${action('comments',`${icon('message-circle')}${node.comments||'Comments'}`,'Comments on '+node.title)}${node.childCount&&!isRoot?action('toggle',`${icon('git-commit-horizontal')}${node.sessionCount} ${node.sessionCount===1?'session':'sessions'} <span>${node.expanded?'−':'+'}</span>`,(node.expanded?'Collapse ':'Expand ')+'sessions for '+node.title,`aria-expanded="${node.expanded}"`):`<span class="graph-no-sessions">${node.sessionCount||0} sessions</span>`}</div>`;
  } else {
    body=`<div class="graph-top"><span class="graph-session-date">${icon('git-commit-horizontal')}${e(shortDate(node.timestamp))}</span>${status}</div>${action('open',`<strong>${e(node.title)}</strong><span>${e(node.subtitle)}</span>`,'Open session by '+node.title,'class="graph-title graph-session-title"')}<div class="graph-session-footer"><span>${e(node.meta)}</span>${action('comments',icon('message-circle'),'Discuss session by '+node.title)}</div>`;
  }
  return `<article class="tree-node graph-${node.kind}${active?' selected':''}" data-node-key="${e(node.key)}" style="left:${node.x}px;top:${node.y}px;width:${node.width}px;height:${node.height}px">${body}</article>`;
}
