const { contextBridge } = require('electron');

const apiUrl = typeof process.env.PLAYVERSE_API_URL === 'string'
  ? process.env.PLAYVERSE_API_URL.trim()
  : '';

contextBridge.exposeInMainWorld('PLAYVERSE_API_URL', apiUrl);
