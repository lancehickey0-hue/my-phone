// Leaflet map rendered in a WebView (dark CARTO tiles). Shared by the Find tab.
export const MAP_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map { height: 100%; margin: 0; padding: 0; background: #12161C; }
    .device-pin {
      width: 40px; height: 40px; border-radius: 20px;
      background: #15151C; border: 3px solid #E2B24A;
      display: flex; align-items: center; justify-content: center;
      font-size: 18px; box-shadow: 0 2px 6px rgba(0,0,0,0.5);
    }
    .device-pin.alarm { border-color: #FF5A4E; background: rgba(255,90,78,0.25); }
    .device-pin.selected { border-width: 4px; transform: scale(1.2); }
    .leaflet-control-attribution { font-size: 9px; }
    .leaflet-control-zoom a { width: 40px !important; height: 40px !important; line-height: 40px !important; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const map = L.map('map', { zoomControl: true }).setView([37.7749, -122.4194], 4);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    let markers = {};
    let routeLine = null;
    let userMarker = null;

    function post(msg) {
      window.ReactNativeWebView.postMessage(JSON.stringify(msg));
    }

    function updateMarkers(devices) {
      const seen = new Set();
      devices.forEach(function(d) {
        if (d.lat == null || d.lng == null) return;
        seen.add(d.id);
        const icon = L.divIcon({
          className: '',
          html: '<div class="device-pin' + (d.alarm ? ' alarm' : '') + (d.selected ? ' selected' : '') + '" style="font: 800 16px sans-serif; color: #F5F5F2">' + d.label + '</div>',
          iconSize: [40, 40],
          iconAnchor: [20, 20],
        });
        if (markers[d.id]) {
          markers[d.id].setLatLng([d.lat, d.lng]);
          markers[d.id].setIcon(icon);
        } else {
          const m = L.marker([d.lat, d.lng], { icon: icon }).addTo(map);
          m.on('click', function() { post({ type: 'selectDevice', deviceId: d.id }); });
          markers[d.id] = m;
        }
      });
      Object.keys(markers).forEach(function(id) {
        if (!seen.has(id)) { map.removeLayer(markers[id]); delete markers[id]; }
      });
    }

    function centerOn(lat, lng, zoom) {
      map.setView([lat, lng], zoom || 15, { animate: true });
    }

    function fitAll(points) {
      if (!points.length) return;
      const bounds = L.latLngBounds(points.map(function(p) { return [p.lat, p.lng]; }));
      map.fitBounds(bounds, { padding: [40, 40] });
    }

    function setUserLocation(lat, lng) {
      if (userMarker) {
        userMarker.setLatLng([lat, lng]);
      } else {
        userMarker = L.circleMarker([lat, lng], {
          radius: 8, color: '#F5F5F2', fillColor: '#3B82F6', fillOpacity: 0.8, weight: 2,
        }).addTo(map);
      }
    }

    function drawRoute(coords) {
      if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
      if (!coords || !coords.length) return;
      routeLine = L.polyline(coords, { color: '#8B5CF6', weight: 4, opacity: 0.85 }).addTo(map);
      map.fitBounds(routeLine.getBounds(), { padding: [50, 50] });
    }

    function clearRoute() {
      if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
    }

    document.addEventListener('message', function(e) { handleMessage(e.data); });
    window.addEventListener('message', function(e) { handleMessage(e.data); });

    function handleMessage(data) {
      try {
        const msg = JSON.parse(data);
        if (msg.type === 'updateMarkers') updateMarkers(msg.devices);
        else if (msg.type === 'centerOn') centerOn(msg.lat, msg.lng, msg.zoom);
        else if (msg.type === 'fitAll') fitAll(msg.points);
        else if (msg.type === 'setUserLocation') setUserLocation(msg.lat, msg.lng);
        else if (msg.type === 'drawRoute') drawRoute(msg.coords);
        else if (msg.type === 'clearRoute') clearRoute();
      } catch (err) {}
    }

    post({ type: 'ready' });
  </script>
</body>
</html>
`;
