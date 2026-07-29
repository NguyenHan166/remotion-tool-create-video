import { Config } from '@remotion/cli/config';

Config.overrideWebpackConfig((configuration) => ({
  ...configuration,
  resolve: {
    ...configuration.resolve,
    extensionAlias: {
      ...configuration.resolve?.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    },
  },
}));
