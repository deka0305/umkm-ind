const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

config.resolver.extraNodeModules = {
  '@opentelemetry/api': path.resolve(__dirname, 'stubs/opentelemetry-api.js'),
};

module.exports = config;
