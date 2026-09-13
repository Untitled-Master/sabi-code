#!/usr/bin/env node
// sabi — minimalistic fast file explorer/editor.
// The codebase lives in ../src/ (state, themes/, highlight/, explorer,
// editor, settings, ui, config, main). This file only launches.
const api = require('../src/index');

if (require.main === module) api.main();

module.exports = api;
