// Caotun Population and Lifestyle Prescriptions GIS System Controller

let map = null;
let geojsonLayer = null;
let prescriptionLayerGroup = null;
let labelMarkers = [];
let selectedVillage = '總計';
let currentTheme = 'elderly_count';
let pyramidChart = null;
let rxBarChart = null;
let expandedGroups = new Set();
let hoverSyncEnabled = false;

// 5-Year Age Groups List
const ageGroups = [
  '0~4歲', '5~9歲', '10~14歲', '15~19歲', '20~24歲',
  '25~29歲', '30~34歲', '35~39歲', '40~44歲', '45~49歲',
  '50~54歲', '55~59歲', '60~64歲', '65~69歲', '70~74歲',
  '75~79歲', '80~84歲', '85~89歲', '90~94歲', '95~99歲',
  '100歲以上'
];

// Reference Image Theme: 65歲以上人口數 (人)
const elderlyCountTheme = {
  title: '65歲以上人口數 (人)',
  cuts: [382, 540, 664, 838, 1059],
  colors: ['#ffffd4', '#fee391', '#fec44f', '#fe9929', '#d95f0e', '#993404'],
  labels: ['192 - 382', '382 - 540', '540 - 664', '664 - 838', '838 - 1059', '1059 - 1972']
};

// Prescription Meta Definition
const prescriptionMeta = [
  { key: '社交', color: '#e11d48', icon: 'fa-users', total: 76 },
  { key: '紓壓', color: '#9333ea', icon: 'fa-spa', total: 62 },
  { key: '運動', color: '#16a34a', icon: 'fa-person-running', total: 33 },
  { key: '營養', color: '#ea580c', icon: 'fa-bowl-food', total: 76 },
  { key: '睡眠', color: '#0284c7', icon: 'fa-moon', total: 17 },
  { key: '藥物安全', color: '#78350f', icon: 'fa-pills', total: 17 }
];

// Other Map Themes
const otherThemes = {
  'rx_total': {
    title: '生活處方服務點數 (處)',
    cuts: [5, 10, 15, 20, 30],
    colors: ['#eff6ff', '#bfdbfe', '#60a5fa', '#3b82f6', '#1d4ed8', '#1e3a8a'],
    labels: ['< 5 處', '5 - 10 處', '10 - 15 處', '15 - 20 處', '20 - 30 處', '≥ 30 處']
  },
  'total_pop': {
    title: '總人口數 (人)',
    cuts: [1500, 2500, 4000, 6000, 8000],
    colors: ['#fee2e2', '#fca5a5', '#f87171', '#ef4444', '#dc2626', '#991b1b'],
    labels: ['< 1,500', '1,500 - 2,500', '2,500 - 4,000', '4,000 - 6,000', '6,000 - 8,000', '≥ 8,000']
  },
  'elderly_pct': {
    title: '65歲以上高齡比例 (%)',
    cuts: [16, 19, 22, 25, 28],
    colors: ['#fef3c7', '#fde68a', '#fcd34d', '#fbbf24', '#f59e0b', '#b45309'],
    labels: ['< 16%', '16% - 19%', '19% - 22%', '22% - 25%', '25% - 28%', '≥ 28%']
  },
  'aging_index': {
    title: '老化指數 (老年/幼年*100)',
    cuts: [120, 160, 200, 250, 300],
    colors: ['#ecfdf5', '#a7f3d0', '#6ee7b7', '#34d399', '#10b981', '#047857'],
    labels: ['< 120', '120 - 160', '160 - 200', '200 - 250', '250 - 300', '≥ 300']
  }
};

// Initialize
window.addEventListener('DOMContentLoaded', () => {
  if (!window.GEO_DATA || !window.POP_DATA || !window.PRESCRIPTION_BY_VILLAGE) {
    console.error('Data not loaded');
    return;
  }
  initMap();
  initVillageSelect();
  renderPrescriptionPoints();
  updateInfoPanel('總計');
});

// Init Map
function initMap() {
  map = L.map('map', {
    center: [23.985, 120.735],
    zoom: 12,
    zoomControl: true
  });

  // Base layers
  const cleanCanvas = L.tileLayer('', { attribution: '南投縣草屯鎮村里GIS圖資' });
  const cartoLight = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; CARTO',
    maxZoom: 19
  });
  const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap',
    maxZoom: 18
  });

  cleanCanvas.addTo(map);

  L.control.layers({
    '經典專案圖面 (純淨白底)': cleanCanvas,
    '淡色地理底圖 (CartoDB)': cartoLight,
    '標準道路底圖 (OSM)': osmLayer
  }, null, { position: 'topleft' }).addTo(map);

  renderGeojsonLayer();

  prescriptionLayerGroup = L.layerGroup().addTo(map);

  if (geojsonLayer && geojsonLayer.getBounds().isValid()) {
    map.fitBounds(geojsonLayer.getBounds(), { padding: [20, 20] });
  }

  updateLegends();
}

// Render GeoJSON
function renderGeojsonLayer() {
  if (geojsonLayer) {
    map.removeLayer(geojsonLayer);
  }

  clearLabelMarkers();

  geojsonLayer = L.geoJSON(window.GEO_DATA, {
    style: featureStyle,
    onEachFeature: onEachFeature
  }).addTo(map);

  const toggleLabelsElem = document.getElementById('showLabelsToggle');
  if (!toggleLabelsElem || toggleLabelsElem.checked) {
    createLabelMarkers();
  }
}

// Village Polygon Styling
function featureStyle(feature) {
  const vilName = feature.properties.VILLNAME;
  const isSelected = (vilName === selectedVillage);

  let fillColor = '#ffffd4';
  let fillOpacity = 0.95;

  if (currentTheme === 'elderly_count') {
    const val = feature.properties.pop_65_plus || 0;
    fillColor = getElderlyColor(val);
  } else if (otherThemes[currentTheme]) {
    const cfg = otherThemes[currentTheme];
    const val = feature.properties[currentTheme] || 0;
    fillColor = getColorForValue(val, cfg);
  }

  return {
    fillColor: fillColor,
    weight: isSelected ? 3.8 : 1.2,
    opacity: 1,
    color: isSelected ? '#1d4ed8' : '#44403c',
    fillOpacity: fillOpacity
  };
}

function getElderlyColor(val) {
  const cuts = elderlyCountTheme.cuts;
  const colors = elderlyCountTheme.colors;
  if (val <= cuts[0]) return colors[0];
  if (val <= cuts[1]) return colors[1];
  if (val <= cuts[2]) return colors[2];
  if (val <= cuts[3]) return colors[3];
  if (val <= cuts[4]) return colors[4];
  return colors[5];
}

function getColorForValue(val, cfg) {
  for (let i = 0; i < cfg.cuts.length; i++) {
    if (val < cfg.cuts[i]) return cfg.colors[i];
  }
  return cfg.colors[cfg.colors.length - 1];
}

// On Each Village
function onEachFeature(feature, layer) {
  const props = feature.properties;
  const vilName = props.VILLNAME;

  layer.on('mouseover', function(e) {
    if (vilName !== selectedVillage) {
      layer.setStyle({
        weight: 2.8,
        color: '#2563eb',
        fillOpacity: 1
      });
      layer.bringToFront();
    }
    showHoverInfo(props);

    if (hoverSyncEnabled) {
      selectVillage(vilName, false);
    }
  });

  layer.on('mouseout', function(e) {
    if (vilName !== selectedVillage) {
      geojsonLayer.resetStyle(layer);
    }
    hideHoverInfo();
  });

  layer.on('click', function(e) {
    selectVillage(vilName, true);
  });
}

// Render Village Labels
function createLabelMarkers() {
  clearLabelMarkers();
  if (!window.GEO_DATA || !window.GEO_DATA.features) return;

  window.GEO_DATA.features.forEach(feat => {
    const props = feat.properties;
    const name = props.VILLNAME.replace('里', '');
    const center = getFeatureCenter(feat);
    if (center) {
      const icon = L.divIcon({
        className: 'village-map-label',
        html: `<div>${name}</div>`,
        iconSize: [60, 20],
        iconAnchor: [30, 10]
      });
      const marker = L.marker([center[1], center[0]], { icon: icon, interactive: false }).addTo(map);
      labelMarkers.push(marker);
    }
  });
}

function clearLabelMarkers() {
  labelMarkers.forEach(m => map.removeLayer(m));
  labelMarkers = [];
}

function toggleLabels(show) {
  if (show) {
    createLabelMarkers();
  } else {
    clearLabelMarkers();
  }
}

function getFeatureCenter(feature) {
  const geom = feature.geometry;
  if (!geom) return null;
  let totalX = 0, totalY = 0, ptCount = 0;
  function processRings(rings) {
    rings.forEach(ring => {
      ring.forEach(pt => {
        totalX += pt[0];
        totalY += pt[1];
        ptCount++;
      });
    });
  }
  if (geom.type === 'Polygon') {
    processRings(geom.coordinates);
  } else if (geom.type === 'MultiPolygon') {
    geom.coordinates.forEach(poly => processRings(poly));
  }
  return ptCount > 0 ? [totalX / ptCount, totalY / ptCount] : null;
}

// Render Prescription Points (生活處方點位)
function renderPrescriptionPoints() {
  if (!prescriptionLayerGroup || !window.PRESCRIPTION_DATA) return;
  prescriptionLayerGroup.clearLayers();

  window.PRESCRIPTION_DATA.forEach(pt => {
    const coords = pt.geometry ? pt.geometry.coordinates : [pt.lng, pt.lat];
    const pProps = pt.properties || pt;

    const marker = L.circleMarker([coords[1], coords[0]], {
      radius: 4.8,
      fillColor: pProps.color,
      color: '#ffffff',
      weight: 1.2,
      opacity: 1,
      fillOpacity: 0.95
    });

    marker.bindPopup(`
      <div style="font-family:'Noto Sans TC',sans-serif;font-size:0.85rem;line-height:1.5;">
        <div style="font-weight:700;color:${pProps.color};margin-bottom:3px;">
          <span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${pProps.color};margin-right:4px;"></span>
          [${pProps.category}] ${pProps.name}
        </div>
        <div style="color:#475569;font-size:0.78rem;">${pProps.description || '長照/生活處方服務資源點位'}</div>
      </div>
    `);

    prescriptionLayerGroup.addLayer(marker);
  });
}

function togglePrescriptionLayer(show) {
  if (!prescriptionLayerGroup) return;
  if (show) {
    map.addLayer(prescriptionLayerGroup);
  } else {
    map.removeLayer(prescriptionLayerGroup);
  }
}

// Hover Box with both Population and Prescriptions
function showHoverInfo(props) {
  const box = document.getElementById('hoverBox');
  if (!box) return;
  const vilName = props.VILLNAME;
  document.getElementById('hoverTitle').textContent = vilName;
  const tot = props.total_pop || 0;
  const c65 = props.pop_65_plus || 0;
  const elderPct = props.elderly_pct || 0;

  const rxData = window.PRESCRIPTION_BY_VILLAGE.villages[vilName] || { 合計: 0, 社交: 0, 紓壓: 0, 運動: 0, 營養: 0, 睡眠: 0, 藥物安全: 0 };

  document.getElementById('hoverContent').innerHTML = `
    <div style="font-size:0.85rem;"><strong>65歲以上人口：</strong><span style="color:#f59e0b;font-weight:700;">${c65.toLocaleString()} 人</span> (${elderPct}%)</div>
    <div style="font-size:0.8rem;color:#cbd5e1;margin-top:2px;">總人口：${tot.toLocaleString()} 人 ｜ 老化指數：${props.aging_index || 0}</div>
    <div style="margin-top:5px;padding-top:4px;border-top:1px dashed rgba(255,255,255,0.25);font-size:0.8rem;color:#a7f3d0;">
      <strong>生活處方服務點：${rxData.合計} 處</strong>
      <div style="font-size:0.72rem;color:#e2e8f0;margin-top:1px;">
        社交${rxData.社交} ｜ 紓壓${rxData.紓壓} ｜ 運動${rxData.運動} ｜ 營養${rxData.營養} ｜ 睡眠${rxData.睡眠} ｜ 藥安${rxData.藥物安全}
      </div>
    </div>
  `;
  box.style.display = 'block';
}

function hideHoverInfo() {
  const box = document.getElementById('hoverBox');
  if (box) box.style.display = 'none';
}

// Village Selector
function initVillageSelect() {
  const sel = document.getElementById('villageSelect');
  if (!sel) return;
  sel.innerHTML = '';

  const optAll = document.createElement('option');
  optAll.value = '總計';
  optAll.textContent = '🌟 全草屯鎮總計 (98,247人 ｜ 處方點281處)';
  sel.appendChild(optAll);

  const sortedVillages = [...window.GEO_DATA.features].sort((a,b) => 
    a.properties.VILLNAME.localeCompare(b.properties.VILLNAME, 'zh-Hant')
  );

  sortedVillages.forEach(feat => {
    const p = feat.properties;
    const vName = p.VILLNAME;
    const rx = window.PRESCRIPTION_BY_VILLAGE.villages[vName] || { 合計: 0 };
    const opt = document.createElement('option');
    opt.value = vName;
    opt.textContent = `${vName} (65歲+: ${p.pop_65_plus}人 ｜ 處方點: ${rx.合計}處)`;
    sel.appendChild(opt);
  });
}

function onSelectVillageChange(val) {
  selectVillage(val, true);
}

// Select Village
function selectVillage(vilName, zoomToFeature = false) {
  selectedVillage = vilName;
  const sel = document.getElementById('villageSelect');
  if (sel) sel.value = vilName;

  if (geojsonLayer) {
    geojsonLayer.eachLayer(layer => {
      const isMatch = (layer.feature.properties.VILLNAME === vilName);
      if (isMatch) {
        layer.setStyle({
          weight: 4,
          color: '#1d4ed8',
          fillOpacity: 1
        });
        layer.bringToFront();

        if (zoomToFeature) {
          map.flyToBounds(layer.getBounds(), { padding: [60, 60], duration: 0.7 });
        }
      } else {
        geojsonLayer.resetStyle(layer);
      }
    });

    if (vilName === '總計' && zoomToFeature) {
      map.flyToBounds(geojsonLayer.getBounds(), { padding: [20, 20], duration: 0.7 });
    }
  }

  updateInfoPanel(vilName);
}

function resetMapView() {
  selectVillage('總計', true);
}

function changeMapTheme(themeKey) {
  currentTheme = themeKey;
  if (geojsonLayer) {
    geojsonLayer.eachLayer(layer => {
      geojsonLayer.resetStyle(layer);
    });
  }
  if (selectedVillage !== '總計') {
    selectVillage(selectedVillage, false);
  }
  updateLegends();
}

function toggleHoverSync(checked) {
  hoverSyncEnabled = checked;
}

// Legends Update
function updateLegends() {
  const scaleElem = document.getElementById('legendScale');
  const titleElem = document.getElementById('legendTitle');
  if (!scaleElem || !titleElem) return;

  if (currentTheme === 'elderly_count') {
    titleElem.textContent = elderlyCountTheme.title;
    let html = '';
    for (let i = 0; i < elderlyCountTheme.colors.length; i++) {
      html += `
        <div class="legend-item">
          <span class="legend-box" style="background:${elderlyCountTheme.colors[i]};"></span>
          <span>${elderlyCountTheme.labels[i]}</span>
        </div>
      `;
    }
    scaleElem.innerHTML = html;
  } else if (otherThemes[currentTheme]) {
    const cfg = otherThemes[currentTheme];
    titleElem.textContent = cfg.title;
    let html = '';
    for (let i = 0; i < cfg.colors.length; i++) {
      html += `
        <div class="legend-item">
          <span class="legend-box" style="background:${cfg.colors[i]};"></span>
          <span>${cfg.labels[i]}</span>
        </div>
      `;
    }
    scaleElem.innerHTML = html;
  }
}

// Update Info Panel
function updateInfoPanel(vilName) {
  const data = window.POP_DATA[vilName];
  if (!data) return;

  const totData = data['合計'];
  const maleData = data['男'];
  const femData = data['女'];

  const totalPop = totData.total;
  const malePop = maleData.total;
  const femPop = femData.total;
  const townTotal = window.POP_DATA['總計']['合計'].total;

  // Title
  const panelName = document.getElementById('panelVilName');
  const panelSub = document.getElementById('panelVilSub');
  if (vilName === '總計') {
    panelName.innerHTML = `<i class="fa-solid fa-tree-city" style="color:var(--accent);"></i> <span>全草屯鎮總計</span>`;
    panelSub.textContent = `草屯鎮公所 ｜ 全轄共 27 個村里 ｜ 處方服務點 281 處`;
  } else {
    const feat = window.GEO_DATA.features.find(f => f.properties.VILLNAME === vilName);
    const code = feat ? feat.properties.VILLCODE : '';
    const eng = feat ? feat.properties.VILLENG : '';
    panelName.innerHTML = `<i class="fa-solid fa-location-dot" style="color:#ef4444;"></i> <span>${vilName}</span>`;
    panelSub.textContent = `${eng} ｜ 代碼: ${code} ｜ 游標選取村里`;
  }

  // Broad groups
  const groups = totData.groups;
  const c_0_14 = groups.slice(0, 3).reduce((sum, g) => sum + g.count, 0);
  const c_15_64 = groups.slice(3, 13).reduce((sum, g) => sum + g.count, 0);
  const c_65_plus = groups.slice(13).reduce((sum, g) => sum + g.count, 0);

  const youthPct = totalPop > 0 ? ((c_0_14 / totalPop) * 100).toFixed(1) : 0;
  const workPct = totalPop > 0 ? ((c_15_64 / totalPop) * 100).toFixed(1) : 0;
  const elderPct = totalPop > 0 ? ((c_65_plus / totalPop) * 100).toFixed(1) : 0;

  const malePct = totalPop > 0 ? ((malePop / totalPop) * 100).toFixed(1) : 0;
  const femPct = totalPop > 0 ? ((femPop / totalPop) * 100).toFixed(1) : 0;
  const sexRatio = femPop > 0 ? ((malePop / femPop) * 100).toFixed(1) : '-';

  const agingIndex = c_0_14 > 0 ? ((c_65_plus / c_0_14) * 100).toFixed(1) : '-';
  const depRatio = c_15_64 > 0 ? (((c_0_14 + c_65_plus) / c_15_64) * 100).toFixed(1) : '-';

  // Update Population Stats Cards
  document.getElementById('cardTotalPop').textContent = totalPop.toLocaleString();
  document.getElementById('cardPopShare').textContent = vilName === '總計' ? '佔全鎮 100%' : `佔全鎮 ${((totalPop / townTotal) * 100).toFixed(2)}%`;

  document.getElementById('cardElderPop').textContent = c_65_plus.toLocaleString();
  document.getElementById('cardElderPct').textContent = `${elderPct}% (65歲+)`;

  document.getElementById('cardYouthPop').textContent = c_0_14.toLocaleString();
  document.getElementById('cardYouthPct').textContent = `${youthPct}% (0-14歲)`;

  document.getElementById('cardWorkPop').textContent = c_15_64.toLocaleString();
  document.getElementById('cardWorkPct').textContent = `${workPct}% (15-64歲)`;

  document.getElementById('cardMalePop').textContent = malePop.toLocaleString();
  document.getElementById('cardMalePct').textContent = `${malePct}%`;

  document.getElementById('cardFemalePop').textContent = femPop.toLocaleString();
  document.getElementById('cardFemalePct').textContent = `${femPct}%`;

  document.getElementById('cardSexRatio').textContent = sexRatio;
  document.getElementById('cardAgingIndex').textContent = agingIndex;
  document.getElementById('cardDepRatio').textContent = depRatio;

  // Ratio bar
  document.getElementById('barYouth').style.width = youthPct + '%';
  document.getElementById('barWork').style.width = workPct + '%';
  document.getElementById('barElder').style.width = elderPct + '%';
  document.getElementById('ratioBarSummary').textContent = `幼年 ${youthPct}% ｜ 青壯 ${workPct}% ｜ 高齡 ${elderPct}%`;

  // Render Prescription Stats for this Village
  renderPrescriptionTable(vilName);

  // Render Pyramid Chart
  renderPyramidChart(totData, maleData, femData);

  // Render 5-year Table
  renderAgeTable(totData, maleData, femData);
}

// Render Prescription Statistics Table for Village (New Requirement)
function renderPrescriptionTable(vilName) {
  const rxSection = document.getElementById('rxStatsSection');
  if (!rxSection) return;

  const isTownTotal = (vilName === '總計');
  const rxData = isTownTotal 
    ? window.PRESCRIPTION_BY_VILLAGE.town_total 
    : (window.PRESCRIPTION_BY_VILLAGE.villages[vilName] || { 合計: 0, 社交: 0, 紓壓: 0, 運動: 0, 營養: 0, 睡眠: 0, 藥物安全: 0, items: [] });

  const totalPoints = rxData.合計 || 0;
  const townTotalPoints = window.PRESCRIPTION_BY_VILLAGE.town_total.合計 || 281;

  document.getElementById('rxTotalBadge').textContent = `${totalPoints} 處服務點`;
  document.getElementById('rxShareText').textContent = isTownTotal 
    ? '全鎮 6 種處方點位涵蓋 27 個村里' 
    : `佔全鎮生活處方資源 ${((totalPoints / townTotalPoints) * 100).toFixed(1)}%`;

  // Prescription Summary Table Body
  const tbody = document.getElementById('rxTableBody');
  tbody.innerHTML = '';

  prescriptionMeta.forEach(meta => {
    const count = rxData[meta.key] || 0;
    const vilPct = totalPoints > 0 ? ((count / totalPoints) * 100).toFixed(1) : 0;
    const townPct = meta.total > 0 ? ((count / meta.total) * 100).toFixed(1) : 0;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${meta.color};"></span>
          <strong>${meta.key}</strong>
        </div>
      </td>
      <td style="text-align:right;">
        <span style="font-size:1rem;font-weight:800;color:${meta.color};font-family:'Outfit',sans-serif;">${count}</span> 處
      </td>
      <td style="text-align:right;">${vilPct}%</td>
      <td style="text-align:right;color:#64748b;">${count} / ${meta.total} (${townPct}%)</td>
      <td style="width:70px;">
        <div style="height:6px;background:#e2e8f0;border-radius:3px;overflow:hidden;">
          <div style="height:100%;background:${meta.color};width:${vilPct}%;"></div>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Items list container
  const itemsContainer = document.getElementById('rxItemsList');
  if (itemsContainer) {
    if (!isTownTotal && rxData.items && rxData.items.length > 0) {
      itemsContainer.style.display = 'block';
      let listHtml = `
        <div style="font-size:0.78rem;font-weight:700;color:#292524;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;">
          <span>【${vilName}】各服務點名單 (${rxData.items.length} 處)：</span>
          <button class="table-btn" onclick="toggleRxList()" id="btnToggleRxList">收合清單</button>
        </div>
        <div id="rxListContent" style="max-height:160px;overflow-y:auto;display:flex;flex-direction:column;gap:4px;">
      `;
      rxData.items.forEach((it, idx) => {
        const catMeta = prescriptionMeta.find(m => m.key === it.category) || { color: '#64748b' };
        listHtml += `
          <div style="padding:4px 8px;border-radius:4px;background:#f8fafc;border:1px solid #e2e8f0;font-size:0.75rem;display:flex;justify-content:space-between;align-items:center;">
            <span><strong style="color:${catMeta.color};">[${it.category}]</strong> ${it.name}</span>
            <span style="font-size:0.68rem;color:#64748b;">${it.desc ? it.desc.slice(0, 15) : ''}</span>
          </div>
        `;
      });
      listHtml += '</div>';
      itemsContainer.innerHTML = listHtml;
    } else {
      itemsContainer.style.display = 'none';
      itemsContainer.innerHTML = '';
    }
  }
}

function toggleRxList() {
  const content = document.getElementById('rxListContent');
  const btn = document.getElementById('btnToggleRxList');
  if (!content) return;
  if (content.style.display === 'none') {
    content.style.display = 'flex';
    btn.textContent = '收合清單';
  } else {
    content.style.display = 'none';
    btn.textContent = '展開清單';
  }
}

// Render Pyramid
function renderPyramidChart(totData, maleData, femData) {
  const canvas = document.getElementById('pyramidChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const labels = ageGroups;

  const maleValues = ageGroups.map((g, idx) => -maleData.groups[idx].count);
  const femaleValues = ageGroups.map((g, idx) => femData.groups[idx].count);

  if (pyramidChart) {
    pyramidChart.destroy();
  }

  pyramidChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: '男性',
          data: maleValues,
          backgroundColor: 'rgba(37, 99, 235, 0.85)',
          borderColor: '#1d4ed8',
          borderWidth: 1,
          borderRadius: 3
        },
        {
          label: '女性',
          data: femaleValues,
          backgroundColor: 'rgba(219, 39, 119, 0.85)',
          borderColor: '#be185d',
          borderWidth: 1,
          borderRadius: 3
        }
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: {
          callbacks: {
            label: function(context) {
              const val = Math.abs(context.raw);
              return `${context.dataset.label}: ${val.toLocaleString()} 人`;
            }
          }
        },
        legend: {
          position: 'top',
          labels: { font: { family: 'Noto Sans TC', size: 12, weight: 600 } }
        }
      },
      scales: {
        x: {
          stacked: true,
          ticks: {
            callback: function(value) {
              return Math.abs(value).toLocaleString();
            },
            font: { family: 'Outfit', size: 11 }
          },
          grid: { color: '#f1f5f9' }
        },
        y: {
          stacked: true,
          ticks: { font: { family: 'Noto Sans TC', size: 11 } },
          grid: { display: false }
        }
      }
    }
  });
}

// Render 5-Year Age Table
function renderAgeTable(totData, maleData, femData) {
  const tbody = document.getElementById('ageTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const totalPop = totData.total;
  const maxGroupCount = Math.max(...totData.groups.map(g => g.count), 1);

  // Total row
  const totMale = maleData.total;
  const totFem = femData.total;
  const totSexRatio = totFem > 0 ? ((totMale / totFem) * 100).toFixed(1) : '-';

  const trTotal = document.createElement('tr');
  trTotal.className = 'total-row';
  trTotal.innerHTML = `
    <td>🌟 總計 (全體人口)</td>
    <td><strong>${totalPop.toLocaleString()}</strong></td>
    <td>100%</td>
    <td class="male-text">${totMale.toLocaleString()} (${((totMale/totalPop)*100).toFixed(1)}%)</td>
    <td class="female-text">${totFem.toLocaleString()} (${((totFem/totalPop)*100).toFixed(1)}%)</td>
    <td>${totSexRatio}</td>
    <td></td>
  `;
  tbody.appendChild(trTotal);

  // 5-Year rows
  totData.groups.forEach((gData, idx) => {
    const gName = gData.group;
    const count = gData.count;
    const mCount = maleData.groups[idx].count;
    const fCount = femData.groups[idx].count;

    const sharePct = totalPop > 0 ? ((count / totalPop) * 100).toFixed(2) : 0;
    const mShare = count > 0 ? ((mCount / count) * 100).toFixed(1) : 0;
    const fShare = count > 0 ? ((fCount / count) * 100).toFixed(1) : 0;
    const sexRatio = fCount > 0 ? ((mCount / fCount) * 100).toFixed(1) : '-';

    const barWidth = Math.round((count / maxGroupCount) * 65);
    const hasSingles = Object.keys(gData.singles).length > 0;
    const isExpanded = expandedGroups.has(gName);
    const isElderlyGroup = idx >= 13;

    const trGroup = document.createElement('tr');
    trGroup.className = `group-row ${isElderlyGroup ? 'elderly-highlight-row' : ''}`;
    trGroup.id = `group-row-${idx}`;

    let toggleBtnHtml = hasSingles ? `
      <i class="fa-solid fa-chevron-right toggle-icon ${isExpanded ? 'expanded' : ''}" id="icon-${idx}"></i>
    ` : `<span style="display:inline-block;width:10px;"></span>`;

    trGroup.innerHTML = `
      <td>
        <div class="age-badge">
          ${toggleBtnHtml}
          <span>${gName} ${isElderlyGroup ? '<span style="font-size:0.68rem;color:#b45309;font-weight:700;">[65+]</span>' : ''}</span>
        </div>
      </td>
      <td><strong>${count.toLocaleString()}</strong></td>
      <td>${sharePct}%</td>
      <td class="male-text">${mCount.toLocaleString()} <span style="font-size:0.7rem;color:#64748b;">(${mShare}%)</span></td>
      <td class="female-text">${fCount.toLocaleString()} <span style="font-size:0.7rem;color:#64748b;">(${fShare}%)</span></td>
      <td>${sexRatio}</td>
      <td>
        <div class="bar-visual-wrap">
          <span class="bar-visual ${isElderlyGroup ? 'bar-elder' : ''}" style="width:${barWidth}px;"></span>
        </div>
      </td>
    `;

    if (hasSingles) {
      trGroup.onclick = () => toggleSingleAges(idx, gName);
    }

    tbody.appendChild(trGroup);

    if (hasSingles) {
      Object.keys(gData.singles).forEach(sAge => {
        const sTot = gData.singles[sAge];
        const sMale = maleData.groups[idx].singles[sAge] || 0;
        const sFem = femData.groups[idx].singles[sAge] || 0;
        const sRatio = sFem > 0 ? ((sMale / sFem) * 100).toFixed(1) : '-';
        const sShare = totalPop > 0 ? ((sTot / totalPop) * 100).toFixed(2) : 0;

        const trSingle = document.createElement('tr');
        trSingle.className = `single-age-row single-for-${idx}`;
        trSingle.style.display = isExpanded ? 'table-row' : 'none';
        trSingle.innerHTML = `
          <td>${sAge}</td>
          <td>${sTot.toLocaleString()}</td>
          <td>${sShare}%</td>
          <td class="male-text">${sMale.toLocaleString()}</td>
          <td class="female-text">${sFem.toLocaleString()}</td>
          <td>${sRatio}</td>
          <td></td>
        `;
        tbody.appendChild(trSingle);
      });
    }
  });
}

function toggleSingleAges(idx, gName) {
  const icon = document.getElementById(`icon-${idx}`);
  const singleRows = document.querySelectorAll(`.single-for-${idx}`);
  if (expandedGroups.has(gName)) {
    expandedGroups.delete(gName);
    if (icon) icon.classList.remove('expanded');
    singleRows.forEach(r => r.style.display = 'none');
  } else {
    expandedGroups.add(gName);
    if (icon) icon.classList.add('expanded');
    singleRows.forEach(r => r.style.display = 'table-row');
  }
}

function toggleAllSingles(expandAll) {
  const totData = window.POP_DATA[selectedVillage]['合計'];
  totData.groups.forEach((gData, idx) => {
    const gName = gData.group;
    const icon = document.getElementById(`icon-${idx}`);
    const singleRows = document.querySelectorAll(`.single-for-${idx}`);
    if (expandAll) {
      expandedGroups.add(gName);
      if (icon) icon.classList.add('expanded');
      singleRows.forEach(r => r.style.display = 'table-row');
    } else {
      expandedGroups.delete(gName);
      if (icon) icon.classList.remove('expanded');
      singleRows.forEach(r => r.style.display = 'none');
    }
  });
}

// Export CSV (Including Prescriptions Summary)
function exportCurrentCSV() {
  const vilData = window.POP_DATA[selectedVillage];
  if (!vilData) return;

  const rxData = (selectedVillage === '總計')
    ? window.PRESCRIPTION_BY_VILLAGE.town_total
    : (window.PRESCRIPTION_BY_VILLAGE.villages[selectedVillage] || { 合計: 0, 社交: 0, 紓壓: 0, 運動: 0, 營養: 0, 睡眠: 0, 藥物安全: 0 });

  const lines = [];
  lines.push(`\uFEFF草屯鎮${selectedVillage}人口年齡分布與生活處方資源明細表 (2026年9月)`);
  lines.push('');
  lines.push('【生活處方服務點統計】');
  lines.push(`處方類別,服務點數量,佔該里處方比率(%),佔全鎮該類處方比率(%)`);
  lines.push(`處方合計,${rxData.合計},100%,${((rxData.合計/281)*100).toFixed(2)}%`);
  prescriptionMeta.forEach(m => {
    const c = rxData[m.key] || 0;
    const vPct = rxData.合計 > 0 ? ((c / rxData.合計) * 100).toFixed(2) : 0;
    const tPct = ((c / m.total) * 100).toFixed(2);
    lines.push(`"${m.key}",${c},${vPct}%,${tPct}%`);
  });
  lines.push('');
  lines.push('【人口每差5歲年齡分布統計】');
  lines.push('年齡組別,合計人口,佔總人口比率(%),男性人口,男性佔該組(%),女性人口,女性佔該組(%),性別比');

  const totData = vilData['合計'];
  const maleData = vilData['男'];
  const femData = vilData['女'];
  const totalPop = totData.total;

  const totSr = femData.total > 0 ? ((maleData.total / femData.total) * 100).toFixed(1) : '-';
  lines.push(`全體總計,${totalPop},100%,${maleData.total},${((maleData.total/totalPop)*100).toFixed(2)}%,${femData.total},${((femData.total/totalPop)*100).toFixed(2)}%,${totSr}`);

  totData.groups.forEach((g, idx) => {
    const gName = g.group;
    const tot = g.count;
    const m = maleData.groups[idx].count;
    const f = femData.groups[idx].count;
    const pct = ((tot / totalPop) * 100).toFixed(2);
    const mPct = tot > 0 ? ((m / tot) * 100).toFixed(1) : 0;
    const fPct = tot > 0 ? ((f / tot) * 100).toFixed(1) : 0;
    const sr = f > 0 ? ((m / f) * 100).toFixed(1) : '';

    lines.push(`"${gName}",${tot},${pct}%,${m},${mPct}%,${f},${fPct}%,${sr}`);

    Object.keys(g.singles).forEach(sAge => {
      const st = g.singles[sAge];
      const sm = maleData.groups[idx].singles[sAge] || 0;
      const sf = femData.groups[idx].singles[sAge] || 0;
      const sp = ((st / totalPop) * 100).toFixed(2);
      const smp = st > 0 ? ((sm / st) * 100).toFixed(1) : 0;
      const sfp = st > 0 ? ((sf / st) * 100).toFixed(1) : 0;
      const ssr = sf > 0 ? ((sm / sf) * 100).toFixed(1) : '';
      lines.push(`"  ${sAge}",${st},${sp}%,${sm},${smp}%,${sf},${sfp}%,${ssr}`);
    });
  });

  const csvContent = lines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `草屯鎮_${selectedVillage}_人口與處方資料_202609.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Copy
function copyTableData() {
  const table = document.getElementById('ageDetailTable');
  if (!table) return;
  const lines = [`草屯鎮 ${selectedVillage} 2026年9月 性別年齡層人口與生活處方統計`];
  const rows = table.querySelectorAll('tr');
  rows.forEach(r => {
    const cells = Array.from(r.children).map(c => c.textContent.trim().replace(/\s+/g, ' '));
    lines.push(cells.join('\t'));
  });

  const text = lines.join('\n');
  navigator.clipboard.writeText(text).then(() => {
    alert(`已成功複製【${selectedVillage}】之每5歲人口統計資料至剪貼簿！`);
  }).catch(() => {
    alert('複製失敗，請手動選取複製');
  });
}
