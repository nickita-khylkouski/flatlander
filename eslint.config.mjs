const browser = {
  window: 'readonly', document: 'readonly', localStorage: 'readonly', performance: 'readonly',
  requestAnimationFrame: 'readonly', addEventListener: 'readonly', innerWidth: 'readonly', innerHeight: 'readonly',
  devicePixelRatio: 'readonly', Image: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly',
  confirm: 'readonly', console: 'readonly', process: 'readonly', URL: 'readonly', Proxy: 'readonly',
};
export default [{
  files: ['**/*.js', '**/*.mjs'],
  languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: browser },
  rules: { 'no-unused-vars': ['warn', { args: 'none' }], 'no-undef': 'error', 'no-unreachable': 'warn' },
}];
