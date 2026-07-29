import { registerRoot } from 'remotion';
import { Root } from './root.js';

type RegisterRoot = (root: typeof Root) => void;

export function registerVideoRoot(register: RegisterRoot = registerRoot): void {
  register(Root);
}

registerVideoRoot();
