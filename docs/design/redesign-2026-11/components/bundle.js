/* @ds-bundle: {"format":4,"namespace":"Esta","components":[{"name":"Typeface"},{"name":"TypeScale"},{"name":"Color"},{"name":"Spacing"},{"name":"Density"},{"name":"Iconography"},{"name":"Motion"},{"name":"Layout"},{"name":"MoneyFormat"},{"name":"DateFormat"},{"name":"Button"},{"name":"TextInput"},{"name":"MoneyInput"},{"name":"DateInput"},{"name":"Select"},{"name":"Textarea"},{"name":"Checkbox"},{"name":"Radio"},{"name":"Switch"},{"name":"SelectionCard"},{"name":"StatusBadge"},{"name":"Completeness"},{"name":"AddressBlock"},{"name":"DataTable"},{"name":"StatCard"},{"name":"PropertyCard"},{"name":"EmptyState"},{"name":"Toast"},{"name":"InlineConfirm"},{"name":"Modal"},{"name":"BottomSheet"},{"name":"Skeleton"},{"name":"SidebarNavItem"},{"name":"FamilySwitcher"},{"name":"BottomNavItem"},{"name":"Avatar"},{"name":"AccountMenu"},{"name":"Voice"}]} */
(function () {
  'use strict';
  var ICONS = {"house":"<path d=\"M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8\"/><path d=\"M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z\"/>","building-2":"<path d=\"M10 12h4\"/><path d=\"M10 8h4\"/><path d=\"M14 21v-3a2 2 0 0 0-4 0v3\"/><path d=\"M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2\"/><path d=\"M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16\"/>","banknote":"<rect width=\"20\" height=\"12\" x=\"2\" y=\"6\" rx=\"2\"/><circle cx=\"12\" cy=\"12\" r=\"2\"/><path d=\"M6 12h.01M18 12h.01\"/>","wallet":"<path d=\"M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1\"/><path d=\"M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4\"/>","file-text":"<path d=\"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z\"/><path d=\"M14 2v5a1 1 0 0 0 1 1h5\"/><path d=\"M10 9H8\"/><path d=\"M16 13H8\"/><path d=\"M16 17H8\"/>","message-square-text":"<path d=\"M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z\"/><path d=\"M7 11h10\"/><path d=\"M7 15h6\"/><path d=\"M7 7h8\"/>","chart-column":"<path d=\"M3 3v16a2 2 0 0 0 2 2h16\"/><path d=\"M18 17V9\"/><path d=\"M13 17V5\"/><path d=\"M8 17v-3\"/>","settings":"<path d=\"M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/>","sliders-horizontal":"<path d=\"M10 5H3\"/><path d=\"M12 19H3\"/><path d=\"M14 3v4\"/><path d=\"M16 17v4\"/><path d=\"M21 12h-9\"/><path d=\"M21 19h-5\"/><path d=\"M21 5h-7\"/><path d=\"M8 10v4\"/><path d=\"M8 12H3\"/>","bell":"<path d=\"M10.268 21a2 2 0 0 0 3.464 0\"/><path d=\"M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326\"/>","search":"<path d=\"m21 21-4.34-4.34\"/><circle cx=\"11\" cy=\"11\" r=\"8\"/>","plus":"<path d=\"M5 12h14\"/><path d=\"M12 5v14\"/>","minus":"<path d=\"M5 12h14\"/>","chevron-down":"<path d=\"m6 9 6 6 6-6\"/>","chevron-right":"<path d=\"m9 18 6-6-6-6\"/>","chevron-left":"<path d=\"m15 18-6-6 6-6\"/>","chevron-up":"<path d=\"m18 15-6-6-6 6\"/>","chevrons-up-down":"<path d=\"m7 15 5 5 5-5\"/><path d=\"m7 9 5-5 5 5\"/>","check":"<path d=\"M20 6 9 17l-5-5\"/>","circle-check":"<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"m16 9-5.5 5.5L8 12\"/>","clock":"<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M12 6v6l4 2\"/>","triangle-alert":"<path d=\"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3\"/><path d=\"M12 9v4\"/><path d=\"M12 17h.01\"/>","circle-alert":"<circle cx=\"12\" cy=\"12\" r=\"10\"/><line x1=\"12\" x2=\"12\" y1=\"8\" y2=\"12\"/><line x1=\"12\" x2=\"12.01\" y1=\"16\" y2=\"16\"/>","circle-dashed":"<path d=\"M10.1 2.182a10 10 0 0 1 3.8 0\"/><path d=\"M13.9 21.818a10 10 0 0 1-3.8 0\"/><path d=\"M17.609 3.721a10 10 0 0 1 2.69 2.7\"/><path d=\"M2.182 13.9a10 10 0 0 1 0-3.8\"/><path d=\"M20.279 17.609a10 10 0 0 1-2.7 2.69\"/><path d=\"M21.818 10.1a10 10 0 0 1 0 3.8\"/><path d=\"M3.721 6.391a10 10 0 0 1 2.7-2.69\"/><path d=\"M6.391 20.279a10 10 0 0 1-2.69-2.7\"/>","pencil-line":"<path d=\"M13 21h8\"/><path d=\"m15 5 4 4\"/><path d=\"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z\"/>","archive":"<rect width=\"20\" height=\"5\" x=\"2\" y=\"3\" rx=\"1\"/><path d=\"M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8\"/><path d=\"M10 12h4\"/>","x":"<path d=\"M18 6 6 18\"/><path d=\"m6 6 12 12\"/>","calendar":"<path d=\"M8 2v3\"/><path d=\"M16 2v3\"/><rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\"/><path d=\"M3 9h18\"/>","calendar-days":"<path d=\"M8 2v3\"/><path d=\"M16 2v3\"/><rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\"/><path d=\"M3 9h18\"/><path d=\"M8 13h.01\"/><path d=\"M12 13h.01\"/><path d=\"M16 13h.01\"/><path d=\"M8 17h.01\"/><path d=\"M12 17h.01\"/><path d=\"M16 17h.01\"/>","map-pin":"<path d=\"M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0\"/><circle cx=\"12\" cy=\"10\" r=\"3\"/>","camera":"<path d=\"M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z\"/><circle cx=\"12\" cy=\"13\" r=\"3\"/>","qr-code":"<rect width=\"5\" height=\"5\" x=\"3\" y=\"3\" rx=\"1\"/><rect width=\"5\" height=\"5\" x=\"16\" y=\"3\" rx=\"1\"/><rect width=\"5\" height=\"5\" x=\"3\" y=\"16\" rx=\"1\"/><path d=\"M21 16h-3a2 2 0 0 0-2 2v3\"/><path d=\"M21 21v.01\"/><path d=\"M12 7v3a2 2 0 0 1-2 2H7\"/><path d=\"M3 12h.01\"/><path d=\"M12 3h.01\"/><path d=\"M12 16v.01\"/><path d=\"M16 12h1\"/><path d=\"M21 12v.01\"/><path d=\"M12 21v-1\"/>","zap":"<path d=\"M15.914 4a1.5 1.5 0 00-2.474-1.561l-9 9A1.5 1.5 0 005.5 14h4.002a.5.5 0 01.471.666L8.086 20a1.5 1.5 0 002.475 1.56l9-9A1.5 1.5 0 0018.5 10h-3.997a.5.5 0 01-.472-.667z\"/>","arrow-up-down":"<path d=\"m21 16-4 4-4-4\"/><path d=\"M17 20V4\"/><path d=\"m3 8 4-4 4 4\"/><path d=\"M7 4v16\"/>","arrow-up":"<path d=\"m5 12 7-7 7 7\"/><path d=\"M12 19V5\"/>","arrow-right":"<path d=\"M5 12h14\"/><path d=\"m12 5 7 7-7 7\"/>","arrow-down":"<path d=\"M12 5v14\"/><path d=\"m19 12-7 7-7-7\"/>","info":"<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M12 16v-4\"/><path d=\"M12 8h.01\"/>","user":"<path d=\"M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2\"/><circle cx=\"12\" cy=\"7\" r=\"4\"/>","users":"<path d=\"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2\"/><path d=\"M16 3.128a4 4 0 0 1 0 7.744\"/><path d=\"M22 21v-2a4 4 0 0 0-3-3.87\"/><circle cx=\"9\" cy=\"7\" r=\"4\"/>","log-out":"<path d=\"m16 17 5-5-5-5\"/><path d=\"M21 12H9\"/><path d=\"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4\"/>","languages":"<path d=\"m5 8 6 6\"/><path d=\"m4 14 6-6 2-3\"/><path d=\"M2 5h12\"/><path d=\"M7 2h1\"/><path d=\"m22 22-5-10-5 10\"/><path d=\"M14 18h6\"/>","moon":"<path d=\"M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401\"/>","sun":"<circle cx=\"12\" cy=\"12\" r=\"4\"/><path d=\"M12 2v2\"/><path d=\"M12 20v2\"/><path d=\"m4.93 4.93 1.41 1.41\"/><path d=\"m17.66 17.66 1.41 1.41\"/><path d=\"M2 12h2\"/><path d=\"M20 12h2\"/><path d=\"m6.34 17.66-1.41 1.41\"/><path d=\"m19.07 4.93-1.41 1.41\"/>","ellipsis":"<circle cx=\"12\" cy=\"12\" r=\"1\"/><circle cx=\"19\" cy=\"12\" r=\"1\"/><circle cx=\"5\" cy=\"12\" r=\"1\"/>","trash-2":"<path d=\"M10 11v6\"/><path d=\"M14 11v6\"/><path d=\"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6\"/><path d=\"M3 6h18\"/><path d=\"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2\"/>","undo-2":"<path d=\"M9 14 4 9l5-5\"/><path d=\"M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11\"/>","receipt":"<path d=\"M12 17V7\"/><path d=\"M16 8h-6a2 2 0 0 0 0 4h4a2 2 0 0 1 0 4H8\"/><path d=\"M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z\"/>","copy":"<rect width=\"14\" height=\"14\" x=\"8\" y=\"8\" rx=\"2\" ry=\"2\"/><path d=\"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2\"/>","send":"<path d=\"M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z\"/><path d=\"m21.854 2.147-10.94 10.939\"/>","loader-circle":"<path d=\"M21 12a9 9 0 1 1-6.219-8.56\"/>","scroll-text":"<path d=\"M15 12h-5\"/><path d=\"M15 8h-5\"/><path d=\"M19 17V5a2 2 0 0 0-2-2H4\"/><path d=\"M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3\"/>","phone":"<path d=\"M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384\"/>","image":"<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" ry=\"2\"/><circle cx=\"9\" cy=\"9\" r=\"2\"/><path d=\"m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21\"/>","upload":"<path d=\"M12 3v12\"/><path d=\"m17 8-5-5-5 5\"/><path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"/>","download":"<path d=\"M12 15V3\"/><path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"/><path d=\"m7 10 5 5 5-5\"/>","lock":"<rect width=\"18\" height=\"11\" x=\"3\" y=\"11\" rx=\"2\" ry=\"2\"/><path d=\"M7 11V7a5 5 0 0 1 10 0v4\"/>","eye":"<path d=\"M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/>","circle-x":"<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"m15 9-6 6\"/><path d=\"m9 9 6 6\"/>","type":"<path d=\"M12 4v16\"/><path d=\"M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2\"/><path d=\"M9 20h6\"/>","rows-3":"<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\"/><path d=\"M21 9H3\"/><path d=\"M21 15H3\"/>","house-plus":"<path d=\"M12.35 21H5a2 2 0 0 1-2-2v-9a2 2 0 0 1 .71-1.53l7-6a2 2 0 0 1 2.58 0l7 6A2 2 0 0 1 21 10v2.35\"/><path d=\"M14.8 12.4A1 1 0 0 0 14 12h-4a1 1 0 0 0-1 1v8\"/><path d=\"M15 18h6\"/><path d=\"M18 15v6\"/>","store":"<path d=\"M15 21v-5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5\"/><path d=\"M17.774 10.31a1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.451 0 1.12 1.12 0 0 0-1.548 0 2.5 2.5 0 0 1-3.452 0 1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.77-3.248l2.889-4.184A2 2 0 0 1 7 2h10a2 2 0 0 1 1.653.873l2.895 4.192a2.5 2.5 0 0 1-3.774 3.244\"/><path d=\"M4 10.95V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8.05\"/>","land-plot":"<path d=\"m12 8 6-3-6-3v10\"/><path d=\"m8 11.99-5.5 3.14a1 1 0 0 0 0 1.74l8.5 4.86a2 2 0 0 0 2 0l8.5-4.86a1 1 0 0 0 0-1.74L16 12\"/><path d=\"m6.49 12.85 11.02 6.3\"/><path d=\"M17.51 12.85 6.5 19.15\"/>","layout-grid":"<rect width=\"7\" height=\"7\" x=\"3\" y=\"3\" rx=\"1\"/><rect width=\"7\" height=\"7\" x=\"14\" y=\"3\" rx=\"1\"/><rect width=\"7\" height=\"7\" x=\"14\" y=\"14\" rx=\"1\"/><rect width=\"7\" height=\"7\" x=\"3\" y=\"14\" rx=\"1\"/>","list":"<path d=\"M3 5h.01\"/><path d=\"M3 12h.01\"/><path d=\"M3 19h.01\"/><path d=\"M8 5h13\"/><path d=\"M8 12h13\"/><path d=\"M8 19h13\"/>","filter":"<path d=\"M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z\"/>","refresh-cw":"<path d=\"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8\"/><path d=\"M21 3v5h-5\"/><path d=\"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16\"/><path d=\"M8 16H3v5\"/>","wifi-off":"<path d=\"M12 20h.01\"/><path d=\"M8.5 16.429a5 5 0 0 1 7 0\"/><path d=\"M5 12.859a10 10 0 0 1 5.17-2.69\"/><path d=\"M19 12.859a10 10 0 0 0-2.007-1.523\"/><path d=\"M2 8.82a15 15 0 0 1 4.177-2.643\"/><path d=\"M22 8.82a15 15 0 0 0-11.288-3.764\"/><path d=\"m2 2 20 20\"/>","hand-coins":"<path d=\"M11 15h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 17\"/><path d=\"m7 21 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.75-2.91l-4.2 3.9\"/><path d=\"m2 16 6 6\"/><circle cx=\"16\" cy=\"9\" r=\"2.9\"/><circle cx=\"6\" cy=\"5\" r=\"3\"/>","circle-help":"<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3\"/><path d=\"M12 17h.01\"/>","external-link":"<path d=\"M15 3h6v6\"/><path d=\"M10 14 21 3\"/><path d=\"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6\"/>"};
  var NBSP = ' ';

  /* ---------- icons ---------- */
  function icon(name, opts) {
    opts = opts || {};
    var size = opts.size || 20;
    var stroke = opts.stroke || (size <= 14 ? 2 : 1.75);
    var body = ICONS[name];
    if (!body) return '';
    return '<svg class="es-icon' + (opts.className ? ' ' + opts.className : '') + '" xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size +
      '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + stroke +
      '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + body + '</svg>';
  }
  function hydrate(root) {
    root = root || document;
    var nodes = root.querySelectorAll('i[data-icon]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var html = icon(el.getAttribute('data-icon'), { size: +(el.getAttribute('data-size') || 20), stroke: el.getAttribute('data-stroke') && +el.getAttribute('data-stroke'), className: el.className });
      if (html) el.outerHTML = html;
    }
    return root;
  }

  /* ---------- money (ported from packages/core: parse/vnd-input.ts, parse/decimal.ts, format/index.ts, format/words.ts) ---------- */
  function fold(text) { return text.toLowerCase().replace(/[đð]/g, 'd').normalize('NFD').replace(/\p{M}/gu, ''); }
  var UNITS = { ty: 1000000000n, ti: 1000000000n, trieu: 1000000n, tr: 1000000n, nghin: 1000n, ngan: 1000n, k: 1000n };
  var NUMBER = /^\d+(?:[.,]\d+)*$/;
  function isThousands(groups) { return groups[0] !== undefined && groups[0].length <= 3 && groups.slice(1).every(function (g) { return g.length === 3; }); }
  function parseDecimal(text) {
    if (!NUMBER.test(text)) return null;
    var seps = text.replace(/\d/g, ''), groups = text.split(/[.,]/);
    if (seps === '') return { digits: BigInt(text), scale: 0 };
    var uniform = new Set(seps).size === 1;
    if (uniform && isThousands(groups)) return { digits: BigInt(groups.join('')), scale: 0 };
    var intGroups = groups.slice(0, -1), fraction = groups[groups.length - 1], groupSeps = seps.slice(0, -1), dec = seps[seps.length - 1];
    var ok = groupSeps === '' || (new Set(groupSeps).size === 1 && groupSeps.indexOf(dec) < 0 && isThousands(intGroups));
    if (!ok) return null;
    return { digits: BigInt(intGroups.join('') + fraction), scale: fraction.length };
  }
  function toWhole(d, mult) {
    var div = 10n ** BigInt(d.scale), scaled = d.digits * mult;
    if (scaled % div !== 0n) return { ok: false, reason: 'fractional' };
    return { ok: true, value: scaled / div };
  }
  function parseCommaDecimal(text) {
    var m = /^(\d+),(\d+)$/.exec(text);
    if (!m) return parseDecimal(text);
    return { digits: BigInt(m[1] + m[2]), scale: m[2].length };
  }
  var MAX_AMOUNT = 1000000000000;
  /** parseVnd('3tr5') → {ok:true, value:3500000}; reasons: empty, invalid, fractional, too_large, ambiguous_separators, ambiguous_shorthand */
  function parseVnd(text) {
    var folded = fold(String(text)).trim().replace(/\s*(?:₫|đ|d|dong|vnd)$/, '').replace(/(\d)\s+(?=\d{3}(?!\d))/g, '$1');
    if (folded === '') return { ok: false, reason: 'empty' };
    var tokens = folded.match(/\d+(?:[.,]\d+)*|[a-z]+|\S/g) || [];
    var total = 0n, last;
    for (var i = 0; i < tokens.length; i++) {
      var token = tokens[i], unit = tokens[i + 1] === undefined ? undefined : UNITS[tokens[i + 1]];
      if (last !== undefined && i === tokens.length - 1 && (token === 'ruoi' || /^\d{1,3}$/.test(token))) {
        if (last.scale > 0) return { ok: false, reason: 'ambiguous_shorthand' };
        var frac = token === 'ruoi' ? { digits: 5n, scale: 1 } : { digits: BigInt(token), scale: token.length };
        var part = toWhole(frac, last.unit);
        if (!part.ok) return part;
        total += part.value;
        break;
      }
      var mixed = token.indexOf('.') >= 0 && token.indexOf(',') >= 0;
      if (mixed && !(unit !== undefined && /^\d{1,3}(?:\.\d{3})+,\d+$/.test(token))) return { ok: false, reason: 'ambiguous_separators' };
      var amount = unit === undefined ? parseDecimal(token) : parseCommaDecimal(token);
      if (amount === null) return { ok: false, reason: 'invalid' };
      if (unit === undefined) {
        if (tokens.length !== 1) return { ok: false, reason: 'invalid' };
        var whole = toWhole(amount, 1n);
        if (!whole.ok) return whole;
        total = whole.value;
        break;
      }
      if (last !== undefined && unit >= last.unit) return { ok: false, reason: 'invalid' };
      var p = toWhole(amount, unit);
      if (!p.ok) return p;
      total += p.value;
      last = { unit: unit, scale: amount.scale };
      i++;
    }
    if (total > BigInt(Number.MAX_SAFE_INTEGER)) return { ok: false, reason: 'too_large' };
    var value = Number(total);
    if (value > MAX_AMOUNT) return { ok: false, reason: 'too_large' };
    return { ok: true, value: value };
  }
  var vndFmt = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });
  /** 3500000 → "3.500.000 ₫" (NBSP before ₫) */
  function formatVnd(n) { return vndFmt.format(n); }
  /** Same, with a real minus (U+2212) or plus for ledger lines. */
  function formatVndSigned(n) { return (n < 0 ? '−' : n > 0 ? '+' : '') + formatVnd(Math.abs(n)); }
  var decFmts = [0, 1, 2].map(function (d) { return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: d }); });
  var COMPACT = [{ size: 1e9, decimals: 2, vi: 'tỷ' }, { size: 1e6, decimals: 1, vi: 'tr' }, { size: 1e3, decimals: 0, vi: 'nghìn' }];
  /** 42500000 → "42,5 tr"; 12500000000 → "12,5 tỷ"; 999999999 → "1 tỷ" */
  function formatVndCompact(n) {
    var mag = Math.abs(n), sign = n < 0 ? -1 : 1;
    for (var i = 0; i < COMPACT.length; i++) {
      var u = COMPACT[i], step = u.size / Math.pow(10, u.decimals), steps = Math.round(mag / step);
      if (steps * step < u.size) continue;
      return decFmts[u.decimals].format((sign * steps) / Math.pow(10, u.decimals)).replace('-', '−') + NBSP + u.vi;
    }
    return formatVnd(n);
  }
  var DIG = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'], SCALES = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ'];
  function viGroup(g, afterHigher) {
    var h = Math.floor(g / 100), t = Math.floor(g / 10) % 10, u = g % 10, w = h > 0 || afterHigher ? [DIG[h], 'trăm'] : [];
    if (t === 0) { if (u > 0) { if (w.length) w.push('lẻ'); w.push(DIG[u]); } }
    else { if (t === 1) w.push('mười'); else w.push(DIG[t], 'mươi'); if (u === 5) w.push('lăm'); else if (u === 1 && t > 1) w.push('mốt'); else if (u > 0) w.push(DIG[u]); }
    return w;
  }
  /** 3500000 → "Ba triệu năm trăm nghìn đồng"; −3500000 → "Âm ba triệu năm trăm nghìn đồng" */
  function vndInWords(n) {
    if (n < 0) { var pos = vndInWords(-n); return 'Âm ' + pos.charAt(0).toLowerCase() + pos.slice(1); }
    var groups = []; for (var r = n; r > 0; r = Math.floor(r / 1000)) groups.push(r % 1000);
    var spoken = groups.map(function (g, i) { return g === 0 ? [] : viGroup(g, i < groups.length - 1).concat([i === 4 && groups[3] !== 0 ? 'nghìn' : SCALES[i]]); }).reverse().flat().filter(Boolean);
    var text = (spoken.length ? spoken : ['không']).concat(['đồng']).join(' ');
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  /* ---------- dates (format/index.ts) ---------- */
  var WD = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  function parts(iso) { var a = iso.split('-').map(Number); return { y: a[0], m: a[1], d: a[2] }; }
  function utc(iso) { var p = parts(iso); return Date.UTC(p.y, p.m - 1, p.d); }
  function pad(n) { return String(n).padStart(2, '0'); }
  /** "2026-10-07" → "07/10/2026" */
  function formatDate(iso) { var p = parts(iso); return pad(p.d) + '/' + pad(p.m) + '/' + p.y; }
  /** "2026-10-07" → "Thứ Tư, 07/10/2026" */
  function formatDateLong(iso) { return WD[new Date(utc(iso)).getUTCDay()] + ', ' + formatDate(iso); }
  function daysBetween(a, b) { return Math.round((utc(b) - utc(a)) / 864e5); }
  /** "2026-11-25" → "25/11" in the year of `today`, else the full date */
  function formatDayMonth(iso, today) { return today && iso.slice(0, 4) !== today.slice(0, 4) ? formatDate(iso) : formatDate(iso).slice(0, 5); }
  /** "2026-10-07" → "Tháng 10/2026" */
  function formatMonth(iso) { var p = parts(iso); return 'Tháng ' + p.m + '/' + p.y; }
  /** "25/09/2026 – 24/10/2026" (en dash with spaces) */
  function formatDateRange(a, b) { return formatDate(a) + ' – ' + formatDate(b); }
  /** relative due, sentence case: "Quá hạn 12 ngày", "Đến hạn hôm nay", "Còn 3 ngày", then "Hạn 25/11" beyond 7 days */
  function formatRelativeDue(due, today) {
    var d = daysBetween(today, due);
    if (d < 0) return 'Quá hạn ' + -d + ' ngày';
    if (d === 0) return 'Đến hạn hôm nay';
    return d <= 7 ? 'Còn ' + d + ' ngày' : 'Hạn ' + formatDayMonth(due, today);
  }
  /** the due words inside a status badge; null beyond 7 days (no badge) */
  function formatDueBadge(due, today) {
    var d = daysBetween(today, due);
    if (d < 0) return 'Quá hạn ' + -d + ' ngày';
    if (d === 0) return 'Đến hạn hôm nay';
    return d <= 7 ? 'Đến hạn sau ' + d + ' ngày' : null;
  }
  /** activity time: "Hôm nay, 09:00", "Hôm qua, 18:30", "05/10, 14:20", "28/12/2025, 10:15" */
  function formatActivity(iso, time, today) {
    var d = daysBetween(iso, today);
    return (d === 0 ? 'Hôm nay' : d === 1 ? 'Hôm qua' : formatDayMonth(iso, today)) + ', ' + time;
  }
  /** "07/10/2026", "7/10/26", "07-10-2026" → {ok, iso} ; reasons: empty, invalid, no_such_day */
  function parseDate(text) {
    var t = String(text).trim();
    if (!t) return { ok: false, reason: 'empty' };
    var m = /^(\d{1,2})[\/.\-\s](\d{1,2})[\/.\-\s](\d{2}|\d{4})$/.exec(t);
    if (!m) return { ok: false, reason: 'invalid' };
    var d = +m[1], mo = +m[2], y = +m[3]; if (y < 100) y += 2000;
    var dt = new Date(Date.UTC(y, mo - 1, d));
    if (mo < 1 || mo > 12 || dt.getUTCDate() !== d) return { ok: false, reason: 'no_such_day' };
    return { ok: true, iso: y + '-' + pad(mo) + '-' + pad(d) };
  }

  /* ---------- contrast (for live tables) ---------- */
  function rgbOf(css) { var m = css.match(/[\d.]+/g); return m ? m.slice(0, 3).map(Number) : [0, 0, 0]; }
  function lumOf(rgb) { var c = rgb.map(function (v) { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
  function contrast(a, b) { var x = lumOf(rgbOf(a)), y = lumOf(rgbOf(b)); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  /** resolved colour of a token inside an element's theme */
  function tokenColor(name, scope) {
    var probe = document.createElement('span'); probe.style.color = 'var(--' + name + ')'; probe.style.display = 'none';
    (scope || document.body).appendChild(probe); var c = getComputedStyle(probe).color; probe.remove(); return c;
  }

  /* ---------- behaviours ---------- */
  var MONEY_ERRORS = {
    invalid: 'Chưa hiểu số này. Thử 3tr5, 850k hoặc 3.500.000.',
    fractional: 'Tiền đồng không có số lẻ. Bỏ phần sau dấu phẩy.',
    too_large: 'Số này lớn hơn mức Esta ghi được (1.000 tỷ).',
    ambiguous_separators: 'Dấu chấm và dấu phẩy lẫn nhau. Viết 3.500.000 hoặc 3,5tr.',
    ambiguous_shorthand: 'Chưa rõ số này. Viết 3tr5 hoặc 3,5tr, đừng dùng cả hai.',
  };
  var DATE_ERRORS = { invalid: 'Nhập theo dạng 07/10/2026.', no_such_day: 'Không có ngày này. Kiểm tra lại ngày và tháng.' };
  function bindMoney(input) {
    var field = input.closest('.es-field');
    var out = field && field.querySelector('[data-es-money-out]');
    var words = field && field.querySelector('[data-es-money-words]');
    function update() {
      var r = parseVnd(input.value);
      field.classList.toggle('is-error', !r.ok && r.reason !== 'empty');
      input.setAttribute('aria-invalid', String(!r.ok && r.reason !== 'empty'));
      if (!out) return;
      if (r.ok) { out.textContent = '= ' + formatVnd(r.value); if (words) words.textContent = vndInWords(r.value); out.dataset.state = 'ok'; }
      else if (r.reason === 'empty') { out.textContent = out.getAttribute('data-empty') || ''; if (words) words.textContent = ''; out.dataset.state = 'empty'; }
      else { out.textContent = MONEY_ERRORS[r.reason] || MONEY_ERRORS.invalid; if (words) words.textContent = ''; out.dataset.state = 'error'; }
    }
    input.addEventListener('input', update); update();
  }
  function bindDate(input) {
    var field = input.closest('.es-field');
    var out = field && field.querySelector('[data-es-date-out]');
    function update() {
      var r = parseDate(input.value);
      var bad = !r.ok && r.reason !== 'empty';
      field.classList.toggle('is-error', bad); input.setAttribute('aria-invalid', String(bad));
      if (!out) return;
      out.dataset.state = r.ok ? 'ok' : bad ? 'error' : 'empty';
      out.textContent = r.ok ? formatDateLong(r.iso) : r.reason === 'no_such_day' ? DATE_ERRORS.no_such_day : bad ? DATE_ERRORS.invalid : (out.getAttribute('data-empty') || '');
    }
    input.addEventListener('input', update); update();
  }
  function bindSort(table) {
    table.querySelectorAll('[data-es-sort]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var th = btn.closest('th'), idx = Array.prototype.indexOf.call(th.parentNode.children, th);
        var dir = th.getAttribute('aria-sort') === 'ascending' ? 'descending' : 'ascending';
        table.querySelectorAll('th[aria-sort]').forEach(function (o) { o.setAttribute('aria-sort', 'none'); });
        th.setAttribute('aria-sort', dir);
        var body = table.tBodies[0], rows = Array.prototype.slice.call(body.rows);
        rows.sort(function (a, b) {
          var x = a.cells[idx].getAttribute('data-v') || a.cells[idx].textContent, y = b.cells[idx].getAttribute('data-v') || b.cells[idx].textContent;
          var nx = +x, ny = +y, c = isNaN(nx) || isNaN(ny) ? x.localeCompare(y, 'vi') : nx - ny;
          return dir === 'ascending' ? c : -c;
        });
        rows.forEach(function (r) { body.appendChild(r); });
      });
    });
  }
  function bindSelect(table) {
    var scope = table.closest('.es-table-wrap') || table;
    var all = scope.querySelector('[data-es-select-all]'), bar = scope.querySelector('.es-bulkbar'), count = scope.querySelector('[data-es-count]');
    var boxes = Array.prototype.slice.call(table.querySelectorAll('tbody [data-es-select]'));
    function sync() {
      var n = 0;
      boxes.forEach(function (b) { var tr = b.closest('tr'); tr.classList.toggle('is-selected', b.checked); tr.setAttribute('aria-selected', String(b.checked)); if (b.checked) n++; });
      if (all) { all.checked = n === boxes.length && n > 0; all.indeterminate = n > 0 && n < boxes.length; }
      if (bar) bar.hidden = n === 0;
      if (count) count.textContent = String(n);
    }
    boxes.forEach(function (b) { b.addEventListener('change', sync); });
    if (all) all.addEventListener('change', function () { boxes.forEach(function (b) { b.checked = all.checked; }); sync(); });
    sync();
  }
  function bind(root) {
    root = root || document;
    root.querySelectorAll('[data-es-money]').forEach(bindMoney);
    root.querySelectorAll('[data-es-date]').forEach(bindDate);
    root.querySelectorAll('table[data-es-sortable]').forEach(bindSort);
    root.querySelectorAll('table[data-es-selectable]').forEach(bindSelect);
    return root;
  }

  /* ---------- preview scaffold: one source, rendered in light and dark (and both densities) ---------- */
  var uid = 0;
  function relink(node, suffix) {
    var ATTRS = ['id', 'for', 'aria-labelledby', 'aria-describedby', 'aria-controls', 'list', 'name'];
    node.querySelectorAll('*').forEach(function (el) {
      ATTRS.forEach(function (a) { var v = el.getAttribute(a); if (v) el.setAttribute(a, v.split(' ').map(function (s) { return s + suffix; }).join(' ')); });
    });
  }
  /**
   * themes('#src', {densities: true, stack: true, only: ['light']})
   * Clones #src into a panel per theme (and per density), each with its own data-theme, then wires icons and behaviours.
   */
  function themes(sel, opts) {
    opts = opts || {};
    var src = typeof sel === 'string' ? document.querySelector(sel) : sel;
    var wrap = document.createElement('div');
    wrap.className = 'ds-themes' + (opts.stack ? ' ds-themes--stack' : '') + (opts.densities ? ' ds-themes--quad' : '');
    var combos = [];
    (opts.only || ['light', 'dark']).forEach(function (t) { (opts.densities ? ['thoang', 'gon'] : [null]).forEach(function (d) { combos.push([t, d]); }); });
    src.parentNode.insertBefore(wrap, src);
    src.removeAttribute('id');
    combos.forEach(function (c) {
      var panel = document.createElement('section');
      panel.className = 'ds-theme';
      panel.setAttribute('data-theme', c[0]);
      if (c[1]) panel.setAttribute('data-density', c[1]);
      var label = document.createElement('p');
      label.className = 'ds-theme__label';
      label.textContent = (c[0] === 'light' ? 'Light' : 'Dark') + (c[1] ? ' · ' + (c[1] === 'gon' ? 'Gọn' : 'Thoáng') : '');
      panel.appendChild(label);
      var body = src.cloneNode(true);
      body.classList.add('ds-theme__body');
      relink(body, '-' + (++uid));
      panel.appendChild(body);
      wrap.appendChild(panel);
    });
    src.remove();
    hydrate(wrap);
    bind(wrap);
    return wrap;
  }
  function ready(fn) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }

  var api = {
    icons: ICONS, icon: icon, hydrate: hydrate, bind: bind, themes: themes, ready: ready,
    parseVnd: parseVnd, formatVnd: formatVnd, formatVndSigned: formatVndSigned, formatVndCompact: formatVndCompact, vndInWords: vndInWords,
    moneyErrors: MONEY_ERRORS, dateErrors: DATE_ERRORS,
    formatDate: formatDate, formatDateLong: formatDateLong, formatDayMonth: formatDayMonth, formatMonth: formatMonth, formatDateRange: formatDateRange,
    formatRelativeDue: formatRelativeDue, formatDueBadge: formatDueBadge, formatActivity: formatActivity, parseDate: parseDate, daysBetween: daysBetween,
    contrast: contrast, tokenColor: tokenColor,
  };
  window.Esta = Object.assign(window.Esta || {}, api);
})();
