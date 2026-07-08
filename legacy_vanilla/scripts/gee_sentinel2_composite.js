// Google Earth Engine script.
// Paste this into https://code.earthengine.google.com/ and update the AOI block.
//
// Output: cloud-masked Sentinel-2 median composite with B4/B3/B2 true color.

var START_DATE = '2026-01-01';
var END_DATE = '2026-07-01';
var EXPORT_NAME = 'sentinel2_true_color_median_b432';
var EXPORT_SCALE_METERS = 10;

// Option A: draw/import your KML polygon in the GEE editor and rename it to `aoi`.
// Option B: use an uploaded asset, for example:
// var aoi = ee.FeatureCollection('users/YOUR_USERNAME/lo_68_hec').geometry();
//
// Placeholder geometry prevents the script from running accidentally against the world.
var aoi = ee.Geometry.Polygon([
  [[108.05, 14.95], [108.06, 14.95], [108.06, 14.96], [108.05, 14.96], [108.05, 14.95]]
]);

function maskS2Qa60(image) {
  var qa = image.select('QA60');
  var cloudBitMask = 1 << 10;
  var cirrusBitMask = 1 << 11;
  var clear = qa.bitwiseAnd(cloudBitMask).eq(0)
    .and(qa.bitwiseAnd(cirrusBitMask).eq(0));

  return image
    .updateMask(clear)
    .divide(10000)
    .copyProperties(image, ['system:time_start']);
}

var collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterBounds(aoi)
  .filterDate(START_DATE, END_DATE)
  .filter(ee.Filter.lte('CLOUDY_PIXEL_PERCENTAGE', 35))
  .map(maskS2Qa60);

var composite = collection
  .median()
  .select(['B4', 'B3', 'B2'], ['red', 'green', 'blue'])
  .clip(aoi);

var display = {
  bands: ['red', 'green', 'blue'],
  min: 0.02,
  max: 0.35,
  gamma: 1.15
};

Map.centerObject(aoi, 14);
Map.addLayer(composite, display, 'Sentinel-2 median true color B4/B3/B2');

print('Image count', collection.size());
print('Composite projection', composite.projection());

Export.image.toDrive({
  image: composite,
  description: EXPORT_NAME,
  fileNamePrefix: EXPORT_NAME,
  folder: 'GeoVisualize',
  region: aoi,
  scale: EXPORT_SCALE_METERS,
  crs: 'EPSG:4326',
  maxPixels: 1e13,
  fileFormat: 'GeoTIFF'
});
