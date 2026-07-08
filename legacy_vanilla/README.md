# Lâm Kính — Rừng Việt Nam 3D

Prototype trực quan hóa lô rừng từ KML bằng **CesiumJS** và dữ liệu **Sentinel-2**.

## Chạy local

Không cần cài package. Tại thư mục dự án, chạy một static server:

```powershell
python -m http.server 4173
```

Sau đó mở `http://localhost:4173`.

## Ghi chú dữ liệu

- Đường biên và diện tích được đọc từ mọi `Polygon` trong `lô 68 hec.kml`.
- Cây 3D được sinh procedural bên trong polygon và là lớp mô phỏng trực quan.
- Lớp ảnh chính lấy từ Sentinel-2 L2A và cần kết nối internet.
- Cây 3D được phóng đại có chủ đích để dễ quan sát ở quy mô vùng.
- Có thể thay `KML_URL` trong `app.js` bằng file KML khác; nhiều Placemark/Polygon được hỗ trợ.
- App tự truy vấn Sentinel-2 L2A giao với KML từ Microsoft Planetary Computer và hỗ trợ True Color, False Color, NDVI.
- Chú giải màu tự đổi theo NDVI, NDMI, NBR và NDWI; nút tải xuống trên thanh công cụ xuất bản đồ hiện tại thành PNG kèm thông tin lớp ảnh.
- Truy vấn ảnh ưu tiên scene mới nhất có độ che phủ mây dưới 20% trong 18 tháng gần nhất.
- Mỗi polygon được tính NDVI trung bình, độ lệch chuẩn và tỷ lệ pixel hợp lệ để phân loại mật độ tương đối cùng sức khỏe thảm thực vật.
- Người dùng có thể vẽ thêm polygon trực tiếp trên địa cầu; bấm chuột trái để đặt đỉnh và chuột phải để hoàn tất.
- Mọi thống kê chỉ đọc pixel nằm trong polygon KML hoặc polygon người dùng vẽ, không tính theo bounding box.
- Phân loại NDVI là chỉ báo viễn thám, không phải mật độ cây/ha và không thay thế khảo sát thực địa.
- Khi triển khai công khai cần tuân thủ điều khoản sử dụng và hiển thị attribution của nhà cung cấp ảnh nền.

## Cấu trúc

- `index.html`: giao diện và khung Cesium
- `styles.css`: visual system responsive
- `app.js`: dữ liệu vùng, cây 3D và tương tác bản đồ
## Sentinel-2 SR Pipeline

Use this offline pipeline when the map needs a clean, high-quality raster instead of tiny preview JPG bands:

1. Open `scripts/gee_sentinel2_composite.js` in Google Earth Engine.
2. Replace the placeholder `aoi` with the KML polygon/asset.
3. Set `START_DATE` and `END_DATE`.
4. Run the script and export the median cloud-masked B04/B03/B02 GeoTIFF to Google Drive.
5. Install processing dependencies:

```powershell
python -m pip install -r scripts/requirements-sr.txt
```

6. Run SwinIR + CLAHE when a SwinIR repo/model is available:

```powershell
python scripts/swinir_clahe_pipeline.py `
  --input data/sentinel2_true_color_median_b432.tif `
  --output data/sentinel2_true_color_swinir_clahe.tif `
  --swinir-repo C:/models/SwinIR `
  --model C:/models/SwinIR/001_classicalSR_DF2K_s64w8_SwinIR-M_x4.pth
```

For a quick pipeline smoke test without SwinIR:

```powershell
python scripts/swinir_clahe_pipeline.py `
  --input data/sentinel2_true_color_median_b432.tif `
  --output data/sentinel2_true_color_bicubic_clahe.tif `
  --fallback-upscale
```

Do not use the small JPG files in `img/` as map overlays. They do not include georeferencing, so they can only be used as previews or for experiments, not as a correct Cesium raster layer.
