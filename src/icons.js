import { raw } from './util.js';

// Iconos de trazo sencillos (24x24), heredan el color del texto
const paths = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/><path d="M10 19.5v-5h4v5"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  images: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="m21 16-5-5-8.5 9"/>',
  chat: '<path d="M20.5 12a8 8 0 0 1-11.7 7.1L4 20.5l1.4-4.6A8 8 0 1 1 20.5 12Z"/>',
  dog: '<path d="M8.5 9.5 6 5.5c-1.4.4-2.6 2-2.5 4l2 1.5"/><path d="M15.5 9.5 18 5.5c1.4.4 2.6 2 2.5 4l-2 1.5"/><path d="M6.5 10.5c0-2.5 2.5-4.5 5.5-4.5s5.5 2 5.5 4.5v3.5c0 3.3-2.5 5.5-5.5 5.5s-5.5-2.2-5.5-5.5Z"/><circle cx="9.7" cy="11.8" r=".6" fill="currentColor"/><circle cx="14.3" cy="11.8" r=".6" fill="currentColor"/><path d="M11 15.3h2l-1 1.2Z"/>',
  family: '<circle cx="8" cy="6" r="2.3"/><circle cx="16.5" cy="9" r="1.8"/><path d="M4 20v-5.5A3.5 3.5 0 0 1 7.5 11h1A3.5 3.5 0 0 1 12 14.5V20"/><path d="M14 20v-3.5a2.5 2.5 0 0 1 5 0V20"/>',
  stall: '<path d="M3.5 9.5 5 4h14l1.5 5.5"/><path d="M3.5 9.5a2.8 2.8 0 0 0 5.7 0 2.8 2.8 0 0 0 5.6 0 2.8 2.8 0 0 0 5.7 0"/><path d="M5 12v8h14v-8M10 20v-4.5h4V20"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20Z"/>',
  paw: '<ellipse cx="12" cy="16" rx="4" ry="3.5"/><circle cx="6" cy="10.5" r="1.8"/><circle cx="9.5" cy="6.5" r="1.8"/><circle cx="14.5" cy="6.5" r="1.8"/><circle cx="18" cy="10.5" r="1.8"/>',
  star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9Z"/>',
  ball: '<circle cx="12" cy="12" r="8"/><path d="M4.5 9.5c4 1 11 1 15 0M4.5 14.5c4-1 11-1 15 0"/>',
  pin: '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.3"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  ticket: '<path d="M3.5 8V6.5h17V8a2.5 2.5 0 0 0 0 5v4.5h-17V13a2.5 2.5 0 0 0 0-5Z"/><path d="M14 6.5v11" stroke-dasharray="2 2"/>',
  share: '<circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="m8.2 10.8 7.6-4.1M8.2 13.2l7.6 4.1"/>',
  download: '<path d="M12 4v11M7 10.5l5 5 5-5M4.5 19.5h15"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  left: '<path d="m14.5 5-7 7 7 7"/>',
  right: '<path d="m9.5 5 7 7-7 7"/>',
  mail: '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="m3.5 7 8.5 6 8.5-6"/>',
  whatsapp: '<path d="M20.5 12a8.5 8.5 0 0 1-12.6 7.4L3.5 20.5l1.2-4.3A8.5 8.5 0 1 1 20.5 12Z"/><path d="M9 8.5c.3-.5.8-.5 1-.1l.8 1.7c.1.3 0 .6-.2.8l-.5.5c.6 1.3 1.6 2.3 2.9 2.9l.5-.5c.2-.2.5-.3.8-.2l1.7.8c.4.2.4.7-.1 1-.8.6-1.8.8-2.8.4a8 8 0 0 1-4.6-4.6c-.4-1-.2-2 .5-2.7Z"/>',
  instagram: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r=".9" fill="currentColor"/>',
  play: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l5.5-3.5Z" fill="currentColor"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  arrow: '<path d="M4.5 12h15M13.5 6l6 6-6 6"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>',
};
export const ICON_NAMES = ['dog', 'family', 'stall', 'heart', 'paw', 'star', 'ball'];
export function icon(name, cls = 'ic') {
  const p = paths[name] || paths.paw;
  return raw(`<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`);
}
