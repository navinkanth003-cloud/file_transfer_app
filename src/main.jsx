import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Buffer } from 'buffer'
import process from 'process'
import stream from 'stream-browserify'
import './index.css'
import App from './App.jsx'

// Basic global polyfill for simple-peer
if (typeof window !== 'undefined') {
  window.global = window;
  window.process = process;
  window.Buffer = Buffer;
  window.stream = stream;
  window.process.env = window.process.env || {};
  window.process.nextTick = window.process.nextTick || function (func) {
    setTimeout(func, 0);
  };
}

createRoot(document.getElementById('root')).render(
  <App />
)
