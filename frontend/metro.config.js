const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('node:path');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
	resolver: {
		resolveRequest(context, moduleName, platform) {
			if (moduleName === 'react-native/src/private/featureflags/ReactNativeFeatureFlags') {
				return context.resolveRequest(
					context,
					path.resolve(
						__dirname,
						'node_modules/react-native/src/private/featureflags/ReactNativeFeatureFlags.js',
					),
					platform,
				);
			}

			return context.resolveRequest(context, moduleName, platform);
		},
	},
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
