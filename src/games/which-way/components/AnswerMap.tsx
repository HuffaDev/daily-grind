"use client";

import { useEffect, useRef, useState } from "react";
import { AIM_COLOR, TRUE_COLOR } from "@/platform/roundGame/ui";
import { bearing, City, distanceKm } from "../lib/rules";
import LAND from "../lib/land.json";

const EARTH_HALF_CIRCLE_KM = 20015;
const OCEAN = "#101a2c";
const LAND_COLOR = "#46597a";
const NORTH_POLE = { lat: 90, lon: 0 };
const SOUTH_POLE = { lat: -90, lon: 0 };

interface Props {
  origin: City;
  target: City;
  aimed: number;
}

function ringContains(ring: [number, number][], lon: number, lat: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const mapSize = () => Math.round(Math.min(300, Math.max(210, Math.min(window.innerWidth - 60, window.innerHeight * 0.36))));

/**
 * The whole world as seen from the player's city, with north up. On this kind of map every straight
 * line from the centre is the true shortest route, which a normal flat map can't show.
 */
export default function AnswerMap({ origin, target, aimed }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size] = useState(mapSize);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.min(window.devicePixelRatio, 2);
    canvas.width = canvas.height = size * ratio;
    const context = canvas.getContext("2d")!;
    context.scale(ratio, ratio);
    const centre = size / 2;
    const radius = centre - 1;
    const project = (lat: number, lon: number) => {
      const angle = (bearing(origin, { lat, lon }) * Math.PI) / 180;
      const reach = (distanceKm(origin, { lat, lon }) / EARTH_HALF_CIRCLE_KM) * radius;
      return { x: centre + Math.sin(angle) * reach, y: centre - Math.cos(angle) * reach, reach };
    };
    const disc = () => context.arc(centre, centre, radius, 0, Math.PI * 2);

    context.fillStyle = OCEAN;
    context.beginPath();
    disc();
    context.fill();
    context.save();
    context.beginPath();
    disc();
    context.clip();

    // Latitude rings, so the poles and the equator read at a glance.
    context.strokeStyle = "rgba(255,255,255,0.16)";
    for (const lat of [-60, -30, 0, 30, 60]) {
      context.lineWidth = lat === 0 ? 1.2 : 0.6;
      context.beginPath();
      for (let lon = -180; lon <= 180; lon += 3) {
        const { x, y } = project(lat, lon + 0.001);
        if (lon === -180) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.stroke();
    }

    const antipode = { lat: -origin.lat, lon: origin.lon > 0 ? origin.lon - 180 : origin.lon + 180 };
    context.fillStyle = LAND_COLOR;
    for (const ring of LAND as [number, number][][]) {
      context.beginPath();
      // A landmass on the exact far side of the world wraps around the rim and turns inside out,
      // so everything outside its traced shape is what gets filled.
      if (ringContains(ring, antipode.lon, antipode.lat)) disc();
      ring.forEach(([lon, lat], i) => {
        const { x, y } = project(lat, lon);
        if (i === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.closePath();
      context.fill("evenodd");
    }
    context.restore();

    const ray = (degrees: number, length: number, color: string, dash: number[], width: number) => {
      const angle = (degrees * Math.PI) / 180;
      context.strokeStyle = color;
      context.lineWidth = width;
      context.setLineDash(dash);
      context.beginPath();
      context.moveTo(centre, centre);
      context.lineTo(centre + Math.sin(angle) * length, centre - Math.cos(angle) * length);
      context.stroke();
      context.setLineDash([]);
    };
    ray(aimed, radius, AIM_COLOR, [6, 5], 2);
    const end = project(target.lat, target.lon);
    ray(bearing(origin, target), end.reach, TRUE_COLOR, [], 3);

    const dot = (x: number, y: number, r: number, color: string) => {
      context.fillStyle = color;
      context.beginPath();
      context.arc(x, y, r, 0, Math.PI * 2);
      context.fill();
    };
    const label = (text: string, x: number, y: number, color: string) => {
      context.font = `600 11px ${getComputedStyle(canvas).fontFamily}`;
      const half = context.measureText(text).width / 2;
      // Kept inside the disc, so a label near the rim stays readable.
      const left = Math.max(half + 3, Math.min(size - half - 3, x));
      const top = Math.max(12, Math.min(size - 5, y));
      context.textAlign = "center";
      context.lineWidth = 3;
      context.strokeStyle = "rgba(0,0,0,0.85)";
      context.strokeText(text, left, top);
      context.fillStyle = color;
      context.fillText(text, left, top);
    };

    const north = project(NORTH_POLE.lat, NORTH_POLE.lon);
    const south = project(SOUTH_POLE.lat, SOUTH_POLE.lon);
    dot(north.x, north.y, 3, "#ffffff");
    label("North Pole", north.x, north.y - 6, "#ffffff");
    dot(south.x, south.y, 3, "#ffffff");
    label("South Pole", south.x, south.y + 14, "#ffffff");
    dot(end.x, end.y, 4.5, TRUE_COLOR);
    label(target.name, end.x, end.y - 8, TRUE_COLOR);
    dot(centre, centre, 3.5, "#ffffff");
    label(origin.name, centre, centre + 15, "#ffffff");
  }, [origin, target, aimed, size]);

  return <canvas ref={canvasRef} style={{ width: size, height: size }} className="shrink-0 rounded-full ring-1 ring-white/25" />;
}
