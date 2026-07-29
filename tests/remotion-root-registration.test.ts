import { describe, expect, it, vi } from 'vitest';
import { registerVideoRoot } from '../packages/video/src/index.js';
import { Root } from '../packages/video/src/root.js';

describe('Remotion entry point', () => {
  it('registers the shared Root component', () => {
    const registerRoot = vi.fn();

    registerVideoRoot(registerRoot);

    expect(registerRoot).toHaveBeenCalledOnce();
    expect(registerRoot).toHaveBeenCalledWith(Root);
  });
});
