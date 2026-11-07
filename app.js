// App Logic for Caotun Population GIS Map Query System

let map = null;
let geojsonLayer = null;
let labelMarkers = [];
let selectedVillage = '總計';
let currentTheme = 'total_pop';
let pyramidChart = null;
let expandedGroups = new Set();

// 5-Year Age Groups List
const ageGroups = [
  '0~4歲', '5~9歲', '10~14歲', '15~19歲', '20~24歲',
  '25~29歲', '30~34歲', '35~39歲', '40~44歲', '45~49歲',
  '50~54歲', '55~59歲', '60~64歲', '65~69歲', '70~74歲',
  '75~79歲', '80~84歲', '85~89歲', '90~94歲', '95~99歲',
  '100歲以上'
];

// Theme Color Palettes & Scales
const themeConfigs = {
  'default': {
    title: '草屯鎮村里識別色',
    legend: []
  },
  'total_pop': {
    title: '總人口數分級 (人)',
    cuts: [1500, 2500, 4000, 6000, 8000],
    colors: ['#fee2e2', '#fca5a5', '#f87171', '#ef4444', '#dc2626', '#991b1b']
  },
  'elderly_pct': {
    title: '65歲以上高齡人口比例 (%)',
    cuts: [16, 19, 22, 25, 28],
    colors: ['#fef3c7', '#fde68a', '#fcd34d', '#fbbf24', '#f59e0b', '#b45309']
  },
  'youth_pct': {
    title: '0~14歲幼年人口比例 (%)',
    cuts: [7, 9, 11, 13, 15],
    colors: ['#e0f2fe', '#bae6fd', '#7dd3fc', '#38bdf8', '#0284c7', '#0369a1']
  },
  'working_pct': {
    title: '15~64歲青壯人口比例 (%)',
    cuts: [64, 66, 68, 70, 72],
    colors: ['#ede9fe', '#ddd6fe', '#c4b5fd', '#a78bfa', '#8b5cf6', '#6d28d9']
  },
  'aging_index': {
    title: '老化指數 (老年/幼年*100)',
    cuts: [120, 160, 200, 250, 300],
    colors: ['#ecfdf5', '#a7f3d0', '#6ee7b7', '#34d399', '#10b981', '#047857']
  },
  'sex_ratio': {
    title: '性別比 (每百名女性對應男性數)',
    cuts: [95, 98, 100, 105, 110],
    colors: ['#fce7f3', '#fbcfe8', '#f472b6', '#ec4899', '#db2777', '#9d174d']
  }
};

// Village Distinct Color Palette for Default Theme
const distinctColors = [
  '#4f46e5', '#0284c7', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16', '#06b6d4',
  '#a855f7', '#d946ef', '#eab308', '#22c55e', '#3b82f6', '#f43f5e',
  '#64748b', '#0d9488', '#ea580c', '#7c3aed', '#2563eb', '#16a34a',
  '#ca8a04', '#9333ea', '#c026d3'
];

// Initialize System
window.addEventListener('DOMContentLoaded', () => {
  if (!window.GEO_DATA || !window.POP_DATA) {
    console.error('Data not loaded!');
    alert('系統圖資資料尚未載入，請確認 data.js 是否存在！');
    return;
  }
  initMap();
  initVillageSelect();
  updateInfoPanel('總計');
});

// Init Map
function initMap() {
  map = L.map('map', {
    center: [23.985, 120.73],
    zoom: 12,
    zoomControl: true
  });

  // Basemap layers
  const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
    maxZoom: 18
  }).addTo(map);

  const cartoLight = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; CARTO',
    maxZoom: 19
  });

  const cartoDark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; CARTO',
    maxZoom: 19
  });

  // Add Base Map Controller
  L.control.layers({
    '標準地圖 (OSM)': osmLayer,
    '淺色底圖 (CartoDB Light)': cartoLight,
    '深色底圖 (CartoDB Dark)': cartoDark
  }, null, { position: 'topleft' }).addTo(map);

  // Create GeoJSON Layer
  renderGeojsonLayer();

  // Fit Bounds to Caotun Town
  if (geojsonLayer && geojsonLayer.getBounds().isValid()) {
    map.fitBounds(geojsonLayer.getBounds(), { padding: [25, 25] });
  }

  updateLegend();
}

// Render / Re-render GeoJSON
function renderGeojsonLayer() {
  if (geojsonLayer) {
    map.removeLayer(geojsonLayer);
  }

  clearLabelMarkers();

  geojsonLayer = L.geoJSON(window.GEO_DATA, {
    style: featureStyle,
    onEachFeature: onEachFeature
  }).addTo(map);

  const toggleElem = document.getElementById('showLabelsToggle');
  if (toggleElem && toggleElem.checked) {
    createLabelMarkers();
  }
}

// Feature Styling
function featureStyle(feature) {
  const vilName = feature.properties.VILLNAME;
  const isSelected = (vilName === selectedVillage);

  let fillColor = '#3b82f6';
  let fillOpacity = isSelected ? 0.88 : 0.65;

  if (currentTheme === 'default') {
    let idx = window.GEO_DATA.features.findIndex(f => f.properties.VILLNAME === vilName);
    fillColor = distinctColors[idx >= 0 ? (idx % distinctColors.length) : 0];
  } else {
    const cfg = themeConfigs[currentTheme];
    const val = feature.properties[currentTheme];
    fillColor = getColorForValue(val, cfg);
  }

  return {
    fillColor: fillColor,
    weight: isSelected ? 4 : 1.5,
    opacity: 1,
    color: isSelected ? '#f59e0b' : '#ffffff',
    fillOpacity: fillOpacity
  };
}

function getColorForValue(val, cfg) {
  if (val === undefined || val === null) return '#cbd5e1';
  for (let i = 0; i < cfg.cuts.length; i++) {
    if (val < cfg.cuts[i]) return cfg.colors[i];
  }
  return cfg.colors[cfg.colors.length - 1];
}

// On Each Village Polygon
function onEachFeature(feature, layer) {
  const props = feature.properties;
  const vilName = props.VILLNAME;

  // Mouseover
  layer.on('mouseover', function(e) {
    if (vilName !== selectedVillage) {
      layer.setStyle({
        weight: 3,
        color: '#38bdf8',
        fillOpacity: 0.85
      });
    }
    showHoverInfo(props);
  });

  // Mouseout
  layer.on('mouseout', function(e) {
    if (vilName !== selectedVillage) {
      geojsonLayer.resetStyle(layer);
    }
    hideHoverInfo();
  });

  // Click
  layer.on('click', function(e) {
    selectVillage(vilName, true);
  });

  // Tooltip
  layer.bindTooltip(`<strong>${vilName}</strong><br>人口: ${props.total_pop ? props.total_pop.toLocaleString() : 0} 人`, {
    direction: 'center',
    className: 'village-tooltip',
    permanent: false,
    sticky: true
  });
}

// Create Permanent Village Label Markers
function createLabelMarkers() {
  clearLabelMarkers();
  if (!window.GEO_DATA || !window.GEO_DATA.features) return;

  window.GEO_DATA.features.forEach(feat => {
    const props = feat.properties;
    const name = props.VILLNAME;
    const center = getFeatureCenter(feat);
    if (center) {
      const popStr = props.total_pop ? props.total_pop.toLocaleString() : '0';
      const icon = L.divIcon({
        className: 'village-label-permanent',
        html: `<div>${name}</div><div style="font-size:0.68rem;font-weight:600;opacity:0.85;">${popStr}人</div>`,
        iconSize: [80, 28],
        iconAnchor: [40, 14]
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

// Hover Box
function showHoverInfo(props) {
  const box = document.getElementById('hoverBox');
  if (!box) return;
  document.getElementById('hoverTitle').textContent = props.VILLNAME + ' (草屯鎮)';
  const tot = props.total_pop || 0;
  const m = props.male_pop || 0;
  const f = props.female_pop || 0;
  const mPct = tot > 0 ? ((m / tot) * 100).toFixed(1) : 0;
  const fPct = tot > 0 ? ((f / tot) * 100).toFixed(1) : 0;

  document.getElementById('hoverContent').innerHTML = `
    <div style="margin-top:4px;"><strong>總人口：</strong>${tot.toLocaleString()} 人</div>
    <div style="font-size:0.75rem; color:#94a3b8; margin-top:2px;">
      男: ${m.toLocaleString()} (${mPct}%) ｜ 女: ${f.toLocaleString()} (${fPct}%)
    </div>
    <div style="font-size:0.75rem; color:#fde047; margin-top:2px;">
      高齡比例: ${props.elderly_pct || 0}% ｜ 老化指數: ${props.aging_index || 0}
    </div>
  `;
  box.style.display = 'block';
}

function hideHoverInfo() {
  const box = document.getElementById('hoverBox');
  if (box) box.style.display = 'none';
}

// Village Selector dropdown
function initVillageSelect() {
  const sel = document.getElementById('villageSelect');
  if (!sel) return;
  sel.innerHTML = '';

  const optAll = document.createElement('option');
  optAll.value = '總計';
  optAll.textContent = '🌟 全草屯鎮總計 (98,247人)';
  sel.appendChild(optAll);

  const sortedVillages = [...window.GEO_DATA.features].sort((a,b) => 
    a.properties.VILLNAME.localeCompare(b.properties.VILLNAME, 'zh-Hant')
  );

  sortedVillages.forEach(feat => {
    const p = feat.properties;
    const opt = document.createElement('option');
    opt.value = p.VILLNAME;
    opt.textContent = `${p.VILLNAME} (${p.total_pop.toLocaleString()}人)`;
    sel.appendChild(opt);
  });
}

function onSelectVillageChange(val) {
  selectVillage(val, true);
}

// Select Village Action
function selectVillage(vilName, zoomToFeature = false) {
  selectedVillage = vilName;
  const sel = document.getElementById('villageSelect');
  if (sel) sel.value = vilName;

  // Update Map Styles
  if (geojsonLayer) {
    geojsonLayer.eachLayer(layer => {
      const isMatch = (layer.feature.properties.VILLNAME === vilName);
      if (isMatch) {
        layer.setStyle({
          weight: 4.5,
          color: '#f59e0b',
          fillOpacity: 0.9
        });
        layer.bringToFront();

        if (zoomToFeature) {
          map.flyToBounds(layer.getBounds(), { padding: [50, 50], duration: 0.8 });
        }
      } else {
        geojsonLayer.resetStyle(layer);
      }
    });

    if (vilName === '總計' && zoomToFeature) {
      map.flyToBounds(geojsonLayer.getBounds(), { padding: [25, 25], duration: 0.8 });
    }
  }

  // Update Panel Data
  updateInfoPanel(vilName);
}

// Reset View
function resetMapView() {
  selectVillage('總計', true);
}

// Change Theme
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
  updateLegend();
}

// Update Legend
function updateLegend() {
  const legTitle = document.getElementById('legendTitle');
  const legScale = document.getElementById('legendScale');
  if (!legTitle || !legScale) return;
  const cfg = themeConfigs[currentTheme];

  legTitle.textContent = cfg.title;
  legScale.innerHTML = '';

  if (currentTheme === 'default') {
    legScale.innerHTML = '<div style="color:var(--text-muted);font-size:0.75rem;">27 村里繽紛標記區隔</div>';
    return;
  }

  for (let i = 0; i < cfg.colors.length; i++) {
    const row = document.createElement('div');
    row.className = 'legend-item';

    let label = '';
    if (i === 0) {
      label = `< ${cfg.cuts[0]}`;
    } else if (i === cfg.colors.length - 1) {
      label = `≥ ${cfg.cuts[cfg.cuts.length - 1]}`;
    } else {
      label = `${cfg.cuts[i - 1]} - ${cfg.cuts[i]}`;
    }

    row.innerHTML = `
      <div class="legend-color" style="background:${cfg.colors[i]};"></div>
      <span>${label}</span>
    `;
    legScale.appendChild(row);
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

  // Title & Subtitle
  const panelName = document.getElementById('panelVilName');
  const panelSub = document.getElementById('panelVilSub');
  if (vilName === '總計') {
    panelName.innerHTML = `<i class="fa-solid fa-tree-city" style="color:var(--accent);"></i> <span>全草屯鎮總計</span>`;
    panelSub.textContent = `南投縣草屯鎮 ｜ 行政區代碼: 10008030 ｜ 全轄共 27 個村里`;
  } else {
    const feat = window.GEO_DATA.features.find(f => f.properties.VILLNAME === vilName);
    const code = feat ? feat.properties.VILLCODE : '';
    const eng = feat ? feat.properties.VILLENG : '';
    panelName.innerHTML = `<i class="fa-solid fa-location-dot" style="color:#ef4444;"></i> <span>${vilName}</span>`;
    panelSub.textContent = `${eng} ｜ 村里代碼: ${code} ｜ 草屯鎮轄區`;
  }

  // Broad Age Groups
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

  // Update Key Cards
  document.getElementById('cardTotalPop').textContent = totalPop.toLocaleString();
  document.getElementById('cardPopShare').textContent = vilName === '總計' ? '佔全鎮 100%' : `佔全鎮 ${((totalPop / townTotal) * 100).toFixed(2)}%`;

  document.getElementById('cardMalePop').textContent = malePop.toLocaleString();
  document.getElementById('cardMalePct').textContent = `${malePct}%`;

  document.getElementById('cardFemalePop').textContent = femPop.toLocaleString();
  document.getElementById('cardFemalePct').textContent = `${femPct}%`;

  document.getElementById('cardYouthPop').textContent = c_0_14.toLocaleString();
  document.getElementById('cardYouthPct').textContent = `${youthPct}% (0-14歲)`;

  document.getElementById('cardWorkPop').textContent = c_15_64.toLocaleString();
  document.getElementById('cardWorkPct').textContent = `${workPct}% (15-64歲)`;

  document.getElementById('cardElderPop').textContent = c_65_plus.toLocaleString();
  document.getElementById('cardElderPct').textContent = `${elderPct}% (65歲+)`;

  document.getElementById('cardSexRatio').textContent = sexRatio;
  document.getElementById('cardAgingIndex').textContent = agingIndex;
  document.getElementById('cardDepRatio').textContent = depRatio;

  // Update Ratio Bar
  document.getElementById('barYouth').style.width = youthPct + '%';
  document.getElementById('barWork').style.width = workPct + '%';
  document.getElementById('barElder').style.width = elderPct + '%';
  document.getElementById('ratioBarSummary').textContent = `幼年 ${youthPct}% ｜ 青壯 ${workPct}% ｜ 高齡 ${elderPct}%`;

  // Update Pyramid Chart
  renderPyramidChart(totData, maleData, femData);

  // Update Detailed Table
  renderAgeTable(totData, maleData, femData);
}

// Render Pyramid Chart
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
          backgroundColor: 'rgba(59, 130, 246, 0.85)',
          borderColor: '#2563eb',
          borderWidth: 1,
          borderRadius: 4
        },
        {
          label: '女性',
          data: femaleValues,
          backgroundColor: 'rgba(236, 72, 153, 0.85)',
          borderColor: '#db2777',
          borderWidth: 1,
          borderRadius: 4
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
          labels: {
            font: { family: 'Noto Sans TC', size: 12, weight: 600 }
          }
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
          grid: {
            color: '#e2e8f0'
          }
        },
        y: {
          stacked: true,
          ticks: {
            font: { family: 'Noto Sans TC', size: 11 }
          },
          grid: {
            display: false
          }
        }
      }
    }
  });
}

// Render Age Table
function renderAgeTable(totData, maleData, femData) {
  const tbody = document.getElementById('ageTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const totalPop = totData.total;
  const maxGroupCount = Math.max(...totData.groups.map(g => g.count), 1);

  // 1. Total Summary Row
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

  // 2. 5-Year Age Group Rows
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

    const trGroup = document.createElement('tr');
    trGroup.className = 'group-row';
    trGroup.id = `group-row-${idx}`;

    let toggleBtnHtml = hasSingles ? `
      <i class="fa-solid fa-chevron-right toggle-icon ${isExpanded ? 'expanded' : ''}" id="icon-${idx}"></i>
    ` : `<span style="display:inline-block;width:12px;"></span>`;

    trGroup.innerHTML = `
      <td>
        <div class="age-badge">
          ${toggleBtnHtml}
          <span>${gName}</span>
        </div>
      </td>
      <td><strong>${count.toLocaleString()}</strong></td>
      <td>${sharePct}%</td>
      <td class="male-text">${mCount.toLocaleString()} <span style="font-size:0.7rem;color:#64748b;">(${mShare}%)</span></td>
      <td class="female-text">${fCount.toLocaleString()} <span style="font-size:0.7rem;color:#64748b;">(${fShare}%)</span></td>
      <td>${sexRatio}</td>
      <td>
        <div class="bar-visual-wrap">
          <span class="bar-visual" style="width:${barWidth}px;"></span>
        </div>
      </td>
    `;

    if (hasSingles) {
      trGroup.onclick = () => toggleSingleAges(idx, gName);
    }

    tbody.appendChild(trGroup);

    // Single Age Rows container
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

// Toggle Single Age Rows
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

// Export Current Table to CSV
function exportCurrentCSV() {
  const vilData = window.POP_DATA[selectedVillage];
  if (!vilData) return;

  const lines = [];
  lines.push(`\uFEFF草屯鎮${selectedVillage}人口年齡分布明細表 (2026年9月)`);
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
  link.setAttribute('download', `草屯鎮_${selectedVillage}_人口年齡層資料_202609.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Copy Table to Clipboard
function copyTableData() {
  const table = document.getElementById('ageDetailTable');
  if (!table) return;
  const lines = [`草屯鎮 ${selectedVillage} 2026年9月 性別年齡層人口統計`];
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
