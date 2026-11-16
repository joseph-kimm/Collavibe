// Layout preferences are device-local and never change a team's project data.
export function initializeWorkspaceLayout({ workspace, getView, closeMobileNav }) {
  let collapsed = false;
  try { collapsed = localStorage.getItem('collavibe-sidebar-collapsed') === 'true'; } catch {}
  let focused = false;
  const toggle = document.getElementById('toggle-sidebar');
  const focusButton = document.getElementById('focus-tree');
  const sync = () => {
    if (getView() !== 'map') focused = false;
    workspace.classList.toggle('sidebar-collapsed', collapsed);
    workspace.classList.toggle('tree-focused', focused);
    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.setAttribute('aria-label', collapsed ? 'Show sidebar' : 'Hide sidebar');
    toggle.title = (collapsed ? 'Show sidebar' : 'Hide sidebar') + ' (⌘/Ctrl + \\)';
    focusButton.hidden = getView() !== 'map';
    focusButton.setAttribute('aria-pressed', String(focused));
    focusButton.querySelector('span:last-child').textContent = focused ? 'Exit focus' : 'Focus tree';
    document.querySelectorAll('[data-tree-focus]').forEach(button => {
      button.setAttribute('aria-pressed', String(focused));
      button.textContent = focused ? 'Exit focus' : 'Focus tree';
    });
  };
  const setCollapsed = value => {
    collapsed = value;
    try { localStorage.setItem('collavibe-sidebar-collapsed', String(value)); } catch {}
    sync();
  };
  const setFocused = value => { focused = value; closeMobileNav(); sync(); };
  toggle.addEventListener('click', () => setCollapsed(!collapsed));
  document.addEventListener('click', event => {
    if (event.target.closest('#focus-tree, [data-tree-focus]')) setFocused(!focused);
  });
  document.addEventListener('keydown', event => {
    if (workspace.hidden || document.querySelector('dialog[open]')) return;
    if ((event.ctrlKey || event.metaKey) && event.key === '\\') {
      event.preventDefault(); setCollapsed(!collapsed);
    }
  });
  sync();
  return { sync, setCollapsed, setFocused, get focused() { return focused; } };
}
