// @vitest-environment jsdom
import { it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { SafeMarkdown } from '../agent-message';
afterEach(cleanup);
it('renders formatting without executing HTML, scripts or dangerous links',()=>{
 const {container}=render(<SafeMarkdown text={'**粗体**\n\n|项目|值|\n|---|---|\n|颜色|绿|\n\n```js\nalert(1)\n```\n\n<script>alert(1)</script>\n\n[bad](javascript:alert%281%29)\n\n![track](https://example.com/track.png)'} />);
 expect(container.querySelector('strong')?.textContent).toBe('粗体');
 expect(container.querySelector('table')).not.toBeNull();
 expect(container.querySelector('pre')).not.toBeNull();
 expect(container.querySelector('script,img')).toBeNull();
 expect(container.querySelector('a')?.getAttribute('href')).not.toContain('javascript:');
});
