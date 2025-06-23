figma.showUI(__html__, { width: 320, height: 400 });

const colorMap = new Map<string, Paint>();

// Ambil semua warna solid dari layer yang tidak disembunyikan
function extractColors(node: SceneNode) {
  if ("visible" in node && !node.visible) return;

  if ("fills" in node && Array.isArray(node.fills)) {
    for (const fill of node.fills as Paint[]) {
      if (fill.type === "SOLID") {
        const hex = rgbToHex(fill.color);
        colorMap.set(hex, fill);
      }
    }
  }

  if ("children" in node) {
    for (const child of node.children) {
      extractColors(child);
    }
  }
}

// Mulai dari semua frame/layer terpilih
const selection = figma.currentPage.selection;

if (selection.length === 0) {
  figma.closePlugin("🚫 Please select at least one frame or group.");
} else {
  selection.forEach(node => extractColors(node));
  figma.ui.postMessage({
    type: "show-colors",
    colorHexes: Array.from(colorMap.keys()),
  });
}

figma.ui.onmessage = (msg) => {
  if (msg.type === "generate-style") {
    const selectedHexes: string[] = msg.selectedColors;
    let counter = 0;

    const selected = selectedHexes.map(hex => {
      const paint = colorMap.get(hex);
      if (!paint || paint.type !== "SOLID") return null;
      const { r, g, b } = paint.color;
      const { h, s, l } = rgbToHsl(r, g, b);
      const group = getColorGroup(h, s, l);
      return { hex, paint, group, l };
    }).filter(Boolean) as { hex: string; paint: Paint; group: string; l: number }[];

    const grouped = new Map<string, typeof selected>();

    selected.forEach(item => {
      if (!grouped.has(item.group)) grouped.set(item.group, []);
      grouped.get(item.group)!.push(item);
    });

    const results: { name: string; hex: string; paint: Paint }[] = [];

    grouped.forEach((items, groupName) => {
      items.sort((a, b) => b.l - a.l); // terang → gelap
      const total = items.length;

      items.forEach((item, index) => {
        const level = total === 1 ? 100 : (index + 1) * 100;
        results.push({
          name: `${groupName} / ${level}`,
          hex: item.hex,
          paint: item.paint,
        });
      });
    });

    results.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    for (const entry of results) {
      const style = figma.createPaintStyle();
      style.name = entry.name;
      style.description = `#${entry.hex.toUpperCase()}`;
      style.paints = [entry.paint];
      counter++;
    }

    figma.closePlugin(`🎉 ${counter} color styles created!`);
  }
};

function rgbToHsl(r: number, g: number, b: number) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }
  return { h, s, l };
}

function rgbToHex({ r, g, b }: RGB): string {
  const toHex = (v: number) => {
    const val = Math.round(v * 255);
    const hex = val.toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  };
  return `${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function getColorGroup(h: number, s: number, l: number): string {
  if (s < 0.1) return "Neutral";
  if ((h >= 0 && h < 20) || h >= 340) return "Red";
  if (h >= 20 && h < 45) return "Orange";
  if (h >= 45 && h < 65) return "Yellow";
  if (h >= 65 && h < 170) return "Green";
  if (h >= 170 && h < 255) return "Blue";
  if (h >= 255 && h < 290) return "Purple";
  if (h >= 290 && h < 340) return "Pink";
  return "Other";
}
