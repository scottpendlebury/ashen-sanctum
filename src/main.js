import { bootstrap } from './game.js';
import './style.css';

window.addEventListener('DOMContentLoaded', () => {
  try {
    bootstrap();
  } catch (e) {
    console.error(e);
    const el = document.getElementById('webgl-error');
    if (el) {
      el.textContent = 'The game failed to start: ' + e.message;
      el.style.display = 'block';
    }
  }
});
