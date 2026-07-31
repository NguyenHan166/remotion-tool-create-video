import { Config } from '@remotion/cli/config';
import { overrideVideoWebpackConfig } from './src/bundler-config.js';

Config.overrideWebpackConfig(overrideVideoWebpackConfig);
