(() => {
  const icons = {
    dashboard: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9.5 20v-6h5v6"/>',
    services: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3.5V2h6v1.5M8.5 8h7M8.5 12h7M8.5 16h4"/>',
    pricing: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5h-5a2 2 0 0 0 0 4h3a2 2 0 0 1 0 4h-5M12 6.5v11"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
    transactions: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.2-1.7l2-1.5-2-3.4-2.4 1A7 7 0 0 0 14.9 5L14.6 2h-4l-.4 3a7 7 0 0 0-1.5.9l-2.4-1-2 3.4 2 1.5A7 7 0 0 0 6 12c0 .6.1 1.2.2 1.7l-2 1.5 2 3.4 2.4-1a7 7 0 0 0 1.5.9l.4 3h4l.4-3a7 7 0 0 0 1.5-.9l2.4 1 2-3.4-2-1.5c.2-.5.2-1.1.2-1.7Z"/>',
    system: '<path d="M12 3 4.5 6v5.5c0 4.6 3.1 7.8 7.5 9.5 4.4-1.7 7.5-4.9 7.5-9.5V6L12 3Z"/><path d="m9 12 2 2 4-5"/>',
    revenue: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h3"/>',
    kiosks: '<rect x="6" y="3" width="12" height="18" rx="2"/><path d="M9 7h6M9 11h6M10 17h4"/>',
    refunds: '<path d="M7 7H3v-4M3.5 7A9 9 0 1 1 5 18"/><path d="M14.5 9h-5a2 2 0 0 0 0 4h3a2 2 0 0 1 0 4h-5M11 7v12"/>',
    hierarchy: '<rect x="9" y="3" width="6" height="4" rx="1"/><rect x="3" y="17" width="6" height="4" rx="1"/><rect x="15" y="17" width="6" height="4" rx="1"/><path d="M12 7v5M6 17v-3h12v3"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    payments: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h2"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
    logout: '<path d="M10 17l5-5-5-5M15 12H3"/><path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
    refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 8a7 7 0 0 1 11.5-2.6L20 8M4 16l2.4 2.6A7 7 0 0 0 18 16"/>',
    language: '<path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    support: '<circle cx="12" cy="12" r="9"/><path d="M8.5 9a3.5 3.5 0 1 1 5.8 2.6c-1.5 1.2-2.3 1.7-2.3 3.4M12 18h.01"/>',
    printer: '<path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="7"/><path d="M18 12h.01"/>',
    alert: '<path d="M10.3 3.6 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
    activity: '<path d="M3 12h4l2.5-6 5 12 2.5-6h4"/>',
    pages: '<path d="M14 2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Z"/><path d="M8 6h4M8 10h4M8 14h3"/><path d="M9 22h9a2 2 0 0 0 2-2V7"/>'
  };

  function icon(name, size = 20) {
    const body = icons[name] || icons.activity;
    return `<svg class="ui-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  }

  window.PrintHubUI = { icon };
})();
