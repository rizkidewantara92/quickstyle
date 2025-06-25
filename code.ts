figma.showUI(__html__, { width: 320, height: 400 });

type ColorItem = {
  hex: string;
  opacity: number;
  name: string;
  fullHex: string;
};

const colorMap = new Map<string, { paint: Paint, name: string }>();

function extractColors(node: SceneNode) {
  if ("visible" in node && !node.visible) return;

  if ("fills" in node && Array.isArray(node.fills)) {
    for (const fill of node.fills as Paint[]) {
      const key = getPaintKey(fill);
      if (key) colorMap.set(key, { paint: fill, name: "" });
    }
  }

  if ("strokes" in node && Array.isArray(node.strokes)) {
    for (const stroke of node.strokes as Paint[]) {
      const key = getPaintKey(stroke);
      if (key) colorMap.set(key, { paint: stroke, name: "" });
    }
  }

  if ("children" in node) {
    for (const child of node.children) {
      extractColors(child);
    }
  }
}

function getPaintKey(paint: Paint): string | null {
  if (paint.type !== "SOLID") return null;
  const hex = rgbToHex(paint.color);
  const alpha = Math.round((paint.opacity ?? 1) * 255);
  const alphaHex = toHexManual(alpha);
  return `${hex}${alphaHex}`.toLowerCase();
}

function rgbToHex({ r, g, b }: RGB): string {
  return toHexManual(Math.round(r * 255)) +
         toHexManual(Math.round(g * 255)) +
         toHexManual(Math.round(b * 255));
}

function toHexManual(value: number): string {
  const hex = value.toString(16);
  return hex.length === 1 ? "0" + hex : hex;
}

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

const selection = figma.currentPage.selection;

if (selection.length === 0) {
  figma.closePlugin("🚫 Please select at least one frame or group.");
} else {
  selection.forEach(node => extractColors(node));

  const colorItems: ColorItem[] = [];
  const grouped = new Map<string, { item: ColorItem; l: number; fullHex: string }[]>();

  colorMap.forEach((data, fullHex) => {
    const paint = data.paint;
    if (paint.type !== "SOLID") return;

    const { r, g, b } = paint.color;
    const opacity = Math.round((paint.opacity ?? 1) * 100);
    const hex = rgbToHex(paint.color).toUpperCase();
    const { h, s, l } = rgbToHsl(r, g, b);
    const group = getColorGroup(h, s, l);

    const item: ColorItem = {
      hex,
      fullHex: fullHex.toUpperCase(),
      opacity,
      name: "", // to be filled
    };

    if (!grouped.has(group)) grouped.set(group, []);
    grouped.get(group)!.push({ item, l, fullHex });
  });

  grouped.forEach((items, groupName) => {
    items.sort((a, b) => b.l - a.l); // terang ke gelap
    const total = items.length;
    items.forEach((entry, i) => {
      const level = total === 1 ? 100 : (i + 1) * 100;
      entry.item.name = `${groupName} / ${level}`;
      colorItems.push(entry.item);

      const mapItem = colorMap.get(entry.fullHex.toLowerCase());
      if (mapItem) {
        mapItem.name = entry.item.name;
        colorMap.set(entry.fullHex.toLowerCase(), mapItem);
      }
    });
  });

  // FIX: Sort numerically by level
  colorItems.sort((a, b) => {
    const [groupA, levelA] = a.name.split(" / ");
    const [groupB, levelB] = b.name.split(" / ");
    if (groupA === groupB) return parseInt(levelA) - parseInt(levelB);
    return groupA.localeCompare(groupB);
  });

  figma.ui.postMessage({
    type: "show-colors",
    colors: colorItems
  });
}

figma.ui.onmessage = (msg) => {
  if (msg.type === "generate-style") {
    const selectedFullHexes: string[] = msg.selectedColors;
    let counter = 0;

    selectedFullHexes.forEach(fullHex => {
      const data = colorMap.get(fullHex.toLowerCase()); // ensure lowercase key match
      if (!data) return;

      const style = figma.createPaintStyle();
      style.name = data.name;
      style.description = `#${fullHex}`;
      style.paints = [data.paint];
      counter++;
    });

    figma.closePlugin(`🎉 ${counter} color styles created!`);
  }
};
