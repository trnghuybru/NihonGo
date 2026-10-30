module.exports = {
  preset: '@react-native/jest-preset',
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|react-native-flip-card|deprecated-react-native-prop-types)/)',
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
};
