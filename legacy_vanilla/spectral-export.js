(() => {
  "use strict";

  const legends = {
    ndvi: { min: "-0,2", max: "0,9", text: "Ít thực vật → tán lá khỏe", colors: "#a50026, #fdae61, #ffffbf, #a6d96a, #006837" },
    ndre: { min: "-0,1", max: "0,65", text: "Căng thẳng/chlorophyll thấp → tán lá dày khỏe", colors: "#a50026, #fdae61, #ffffbf, #a6d96a, #006837" },
    ndmi: { min: "-0,6", max: "0,8", text: "Khô/stress nước → ẩm tán lá tốt", colors: "#8c510a, #dfc27d, #f5f5f5, #80cdc1, #01665e" },
    nbr: { min: "-0,6", max: "0,9", text: "Cháy/suy thoái → thảm thực vật ổn định", colors: "#a50026, #f46d43, #ffffbf, #66bd63, #006837" },
    ndwi: { min: "-0,8", max: "0,5", text: "Đất khô/thực vật → nước hoặc vùng ẩm", colors: "#f2b66d, #f7e7c6, #c6dbef, #6baed6, #08519c" },
    savi: { min: "-0,2", max: "0,8", text: "Đất trống → thực vật trên nền đất lộ", colors: "#a50026, #fdae61, #ffffbf, #a6d96a, #006837" }
  };

  const $ = (selector) => document.querySelector(selector);

  function updateLegend() {
    const config = legends[$("#spectralMode").value];
    const legend = $("#ndviLegend");
    legend.classList.toggle("open", Boolean(config));
    if (!config) return;
    $("#legendMin").textContent = config.min;
    $("#legendMax").textContent = config.max;
    $("#legendDescription").textContent = config.text;
    $("#legendRamp").style.background = `linear-gradient(90deg, ${config.colors})`;
  }

  function filePart(value) {
    return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  }

  function exportMap() {
    const source = $("#cesiumContainer canvas");
    if (!source) return window.alert("Bản đồ chưa sẵn sàng để xuất ảnh.");
    try {
      const maxWidth = 2200;
      const scale = Math.min(1, maxWidth / source.width);
      const width = Math.round(source.width * scale);
      const mapHeight = Math.round(source.height * scale);
      const footerHeight = 88;
      const output = document.createElement("canvas");
      output.width = width;
      output.height = mapHeight + footerHeight;
      const context = output.getContext("2d");
      context.drawImage(source, 0, 0, width, mapHeight);
      context.fillStyle = "#0b1c13";
      context.fillRect(0, mapHeight, width, footerHeight);

      const select = $("#spectralMode");
      const mode = select.value;
      const label = select.selectedOptions[0]?.textContent || "Bản đồ Sentinel-2";
      const status = $("#spectralStatus").textContent;
      context.fillStyle = "#eef6f0";
      context.font = "600 20px Arial, sans-serif";
      context.fillText(label, 24, mapHeight + 32);
      context.fillStyle = "#9db1a4";
      context.font = "14px Arial, sans-serif";
      context.fillText(`Sentinel-2 L2A · ${status} · Ranh lô màu trắng`, 24, mapHeight + 60);

      output.toBlob((blob) => {
        if (!blob) return window.alert("Không tạo được tệp PNG từ bản đồ.");
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `lam-kinh-${filePart(mode)}-${new Date().toISOString().slice(0, 10)}.png`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      }, "image/png");
    } catch (error) {
      window.alert(`Không thể xuất PNG: ${error.message}`);
    }
  }

  window.addEventListener("DOMContentLoaded", () => {
    $("#spectralMode").addEventListener("change", updateLegend);
    $("#exportMap").addEventListener("click", exportMap);
    updateLegend();
  });
})();
