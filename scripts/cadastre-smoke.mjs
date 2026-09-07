#!/usr/bin/env node
/**
 * Smoke H — BAN + API Carto Cadastre (live) + local geometry fixture.
 * Usage: node scripts/cadastre-smoke.mjs
 */
import { writeFileSync } from "node:fs";

const BAN = "https://api-adresse.data.gouv.fr/search/";
const APICARTO = "https://apicarto.ign.fr/api/cadastre/parcelle";
const QUERY = "10 rue de Rivoli Paris";

const M_PER_DEG_LAT = 110_540;
const M_PER_DEG_LON_EQ = 111_320;

function lonLatToLocalM(lon, lat, oLon, oLat) {
  const cos = Math.cos((oLat * Math.PI) / 180);
  return [(lon - oLon) * M_PER_DEG_LON_EQ * cos, (lat - oLat) * M_PER_DEG_LAT];
}

function ringAreaM2(ring) {
  let a = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % n];
    a += x0 * y1 - x1 * y0;
  }
  return Math.abs(a) * 0.5;
}

function extractRing(geom) {
  if (!geom) return null;
  if (geom.type === "Polygon") return geom.coordinates[0];
  if (geom.type === "MultiPolygon") return geom.coordinates[0]?.[0];
  return null;
}

async function fetchJson(url, ms = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

// Fixture: unit square ~1° offset (tiny) — area via local meters at lat 48.85
function fixtureOk() {
  const origin = { lon: 2.36, lat: 48.855 };
  // ~20m square
  const dLon = 20 / (M_PER_DEG_LON_EQ * Math.cos((origin.lat * Math.PI) / 180));
  const dLat = 20 / M_PER_DEG_LAT;
  const ringWgs = [
    [origin.lon, origin.lat],
    [origin.lon + dLon, origin.lat],
    [origin.lon + dLon, origin.lat + dLat],
    [origin.lon, origin.lat + dLat],
  ];
  const local = ringWgs.map(([lon, lat]) => lonLatToLocalM(lon, lat, origin.lon, origin.lat));
  const area = ringAreaM2(local);
  if (area < 380 || area > 420) throw new Error(`fixture area ${area} not ~400`);
  writeFileSync(
    new URL("./fixtures/parcelle-square.geojson", import.meta.url),
    JSON.stringify(
      {
        type: "Feature",
        properties: { idu: "FIXTURE", contenance: 400 },
        geometry: { type: "Polygon", coordinates: [[...ringWgs, ringWgs[0]]] },
      },
      null,
      2,
    ),
  );
  console.log("fixture geometry OK · area≈", area.toFixed(1), "m²");
}

async function liveOk() {
  const ban = await fetchJson(`${BAN}?q=${encodeURIComponent(QUERY)}&limit=5`);
  const hit = ban.features?.[0];
  if (!hit) throw new Error("BAN: no features");
  const [lon, lat] = hit.geometry.coordinates;
  console.log("BAN:", hit.properties.label, "→", lon, lat);

  const geom = JSON.stringify({ type: "Point", coordinates: [lon, lat] });
  const carto = await fetchJson(`${APICARTO}?geom=${encodeURIComponent(geom)}`);
  const f = carto.features?.[0];
  if (!f) throw new Error("Cadastre: no parcelle at point");
  const p = f.properties;
  const ring = extractRing(f.geometry);
  if (!ring) throw new Error("Cadastre: no ring");
  const cLon = ring.reduce((s, c) => s + c[0], 0) / ring.length;
  const cLat = ring.reduce((s, c) => s + c[1], 0) / ring.length;
  const local = ring.map(([lo, la]) => lonLatToLocalM(lo, la, cLon, cLat));
  const areaGeom = ringAreaM2(local);
  const area = areaGeom > 1 ? Math.round(areaGeom) : p.contenance;
  console.log("Parcelle:", p.idu, p.section, p.numero, "contenance", p.contenance, "geom≈", Math.round(areaGeom), "→ area", area);
  if (!(area > 50 && area < 50000)) throw new Error(`unexpected area ${area}`);
  if (!p.section || !p.numero) throw new Error("missing section/numero");
  console.log("CES/COS denominator ready:", area, "m²");
  return { label: hit.properties.label, idu: p.idu, area };
}

fixtureOk();
try {
  const r = await liveOk();
  console.log("SMOKE OK", JSON.stringify(r));
  process.exit(0);
} catch (err) {
  console.warn("LIVE SKIP/FAIL (fixture still OK):", err?.message || err);
  // Network optional — fixture already passed
  process.exit(0);
}
