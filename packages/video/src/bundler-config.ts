import type { WebpackOverrideFn } from '@remotion/cli/config';

export const overrideVideoWebpackConfig: WebpackOverrideFn = (configuration) => {
  return {
    ...configuration,
    resolve: {
      ...configuration.resolve,
      extensionAlias: {
        ...configuration.resolve?.extensionAlias,
        '.js': ['.ts', '.tsx', '.js'],
      },
    },
  };
};
