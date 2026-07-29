import {
  listTemplateMetadata,
  templateRegistry,
  type TemplateMetadata,
  type TemplateRegistry,
} from '@hansys/template-registry';

export type TemplatePageResponse = {
  items: TemplateMetadata[];
};

export function createTemplateCollectionHandlers(registry: TemplateRegistry = templateRegistry): {
  GET: () => Response;
} {
  return {
    GET: () =>
      Response.json({
        items: listTemplateMetadata(registry),
      } satisfies TemplatePageResponse),
  };
}
