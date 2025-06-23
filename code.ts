figma.showUI(__html__, { width: 320, height: 400 });

if (figma.currentPage.selection.length === 0) {
  figma.closePlugin("Please select at least one frame or shape");
}

let allNodesToProcess: SceneNode[] = [];
const hexCache = new Map<string, string>();

// Ganti padStart dengan slice untuk dukungan ES5/ES6
function rgbToHex(r: number, g: number, b: number): string {
  return [r, g, b].map(v => {
    const val = Math.round(Number(v) * 255);
    const hex = val.toString(16);
    return ('0' + hex).slice(-2); // fallback padStart
  }).join('');
}

// Traverse semua node yang visible, unlocked, dan bisa punya fill/stroke
function collectShapesRecursively(node: SceneNode) {
  if (!node.visible || node.locked) return;

  if ("fills" in node || "strokes" in node) {
    allNodesToProcess.push(node);
  }

  if ("children" in node) {
    for (const child of node.children) {
      collectShapesRecursively(child);
    }
  }
}

// Mulai dari selection
for (const node of figma.currentPage.selection) {
  collectShapesRecursively(node);
}

// Ambil semua warna unik (SOLID fill dan stroke) dalam bentuk HEX
const colorMap = new Map<string, Paint>();

for (const node of allNodesToProcess) {
  if ("fills" in node && Array.isArray(node.fills)) {
    node.fills.forEach(fill => {
      if (fill.type === "SOLID") {
        const hex = rgbToHex(fill.color.r, fill.color.g, fill.color.b);
        colorMap.set(hex, fill);
      }
    });
  }

  if ("strokes" in node && Array.isArray(node.strokes)) {
    node.strokes.forEach(stroke => {
      if (stroke.type === "SOLID") {
        const hex = rgbToHex(stroke.color.r, stroke.color.g, stroke.color.b);
        colorMap.set(hex, stroke);
      }
    });
  }
}

// Kirim list warna ke UI
figma.ui.postMessage({
  type: "show-colors",
  colors: Array.from(colorMap.keys())
});

// Saat user klik generate style
figma.ui.onmessage = (msg) => {
  if (msg.type === "generate-style") {
    const selectedHexes: string[] = msg.selectedColors;
    let counter = 0;

    selectedHexes.forEach(hex => {
      const paint = colorMap.get(hex);
      if (paint) {
        const style = figma.createPaintStyle();
        style.name = `Color/${hex.toUpperCase()}`;
        style.description = `#${hex.toUpperCase()}`;
        style.paints = [paint];
        counter++;
      }
    });

    figma.closePlugin(`🎉 ${counter} color styles generated!`);
  }
};
