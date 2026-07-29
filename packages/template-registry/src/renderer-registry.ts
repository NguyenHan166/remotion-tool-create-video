import { createElement, type ComponentType } from 'react';
import { TemplateRendererNotRegisteredError } from './errors.js';
import { type TemplateComponentProps } from './types.js';

const templateRenderers = new Map<string, ComponentType<TemplateComponentProps>>();

export function registerTemplateRenderer(
  templateId: string,
  Component: ComponentType<TemplateComponentProps>,
): void {
  const registeredComponent = templateRenderers.get(templateId);

  if (registeredComponent !== undefined && registeredComponent !== Component) {
    throw new Error(`Template renderer "${templateId}" is already registered.`);
  }

  templateRenderers.set(templateId, Component);
}

export function createRegisteredTemplateComponent(
  templateId: string,
): ComponentType<TemplateComponentProps> {
  function RegisteredTemplateComponent(props: TemplateComponentProps) {
    const Component = templateRenderers.get(templateId);

    if (Component === undefined) {
      throw new TemplateRendererNotRegisteredError(templateId);
    }

    return createElement(Component, props);
  }

  RegisteredTemplateComponent.displayName = `RegisteredTemplate(${templateId})`;
  return RegisteredTemplateComponent;
}
