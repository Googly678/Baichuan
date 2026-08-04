import { useEffect } from 'react';

/**
 * 同步侧边栏宽度到 CSS 变量 `--sider-w`（粘性按钮区 left 偏移使用）
 * 监听 `[data-sider-width]` 属性的变化。
 */
export function useSiderWidthSync() {
  useEffect(() => {
    const sync = () => {
      const el = document.querySelector<HTMLElement>('[data-sider-width]');
      const w = el?.getAttribute('data-sider-width') || '220';
      document.documentElement.style.setProperty('--sider-w', `${w}px`);
    };
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['data-sider-width'] });
    return () => obs.disconnect();
  }, []);
}
