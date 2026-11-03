let api: Promise<(typeof import('mermaid'))['default']> | undefined;
let queue = Promise.resolve();
let serial = 0;

/** Mermaid chỉ tải khi có sơ đồ, chạy tuần tự để không dùng chung state của parser. */
export function renderDiagrams(root: ParentNode): Promise<void> {
  const nodes = [...root.querySelectorAll<HTMLElement>('pre.mermaid:not([data-processed])')];
  if (!nodes.length) return Promise.resolve();
  const run = async () => {
    api ??= import('mermaid').then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'dark',
        securityLevel: 'strict',
        suppressErrorRendering: true,
      });
      return mermaid;
    });
    const mermaid = await api;
    for (const node of nodes) {
      if (!node.isConnected || node.dataset.processed) continue;
      const source = node.textContent ?? '';
      try {
        const { svg } = await mermaid.render(`diagram-${++serial}`, source);
        if (!node.isConnected) continue;
        node.innerHTML = svg;
        node.dataset.processed = 'true';
        node.setAttribute('role', 'img');
        node.setAttribute('aria-label', 'Sơ đồ Mermaid');
      } catch {
        node.textContent = source;
        node.dataset.processed = 'error';
        node.title = 'Không render được sơ đồ; hiển thị source.';
      }
    }
  };
  const result = queue.then(run);
  queue = result.catch(() => {
    api = undefined;
  });
  return result;
}

document.addEventListener('astro:page-load', () => {
  void renderDiagrams(document).catch(console.error);
});
