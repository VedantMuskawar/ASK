'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Calculator, Boxes, Ruler, AlertCircle, PaintBucket, Grid3x3 } from 'lucide-react';
import { useMemo, useState } from 'react';

import { type ProductDoc } from '@/lib/firestore-products';

type EstimatorEngineProps = {
  selectedProduct: ProductDoc;
};

type DimensionSummary = {
  lengthMeters: number;
  widthMeters: number;
  heightMeters: number;
  dimensionUnit: string;
};

type PaintCoverageSummary = {
  coverageAreaPerSqFt: number;
  paintMeasureUnit: string;
};

type TileDimensionSummary = {
  lengthMeters: number;
  widthMeters: number;
  dimensionUnit: string;
};

const SQUARE_FEET_PER_SQUARE_METER = 10.7639;

function toMeters(value: number, unit: string): number {
  const normalizedUnit = unit.trim().toLowerCase();

  if (normalizedUnit === 'mm') return value / 1000;
  if (normalizedUnit === 'cm') return value / 100;
  if (normalizedUnit === 'm' || normalizedUnit === 'meter' || normalizedUnit === 'meters') return value;
  if (normalizedUnit === 'in' || normalizedUnit === 'inch' || normalizedUnit === 'inches') return value * 0.0254;

  return value;
}

function parsePositiveNumber(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function normalizeProductType(productType: string | undefined): string {
  return String(productType ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function resolveBrickDimensions(product: ProductDoc): DimensionSummary | null {
  const rawAttributes =
    product.productAttributes && typeof product.productAttributes === 'object' && !Array.isArray(product.productAttributes)
      ? product.productAttributes
      : {};

  const length = Number(rawAttributes.length ?? rawAttributes.Length ?? rawAttributes.L ?? 0);
  const width = Number(rawAttributes.width ?? rawAttributes.Width ?? rawAttributes.W ?? 0);
  const height = Number(rawAttributes.height ?? rawAttributes.Height ?? rawAttributes.H ?? 0);
  const dimensionUnit = String(rawAttributes.dimensionUnit ?? rawAttributes.dimension_unit ?? 'mm');

  if (length <= 0 || width <= 0 || height <= 0) return null;

  return {
    lengthMeters: toMeters(length, dimensionUnit),
    widthMeters: toMeters(width, dimensionUnit),
    heightMeters: toMeters(height, dimensionUnit),
    dimensionUnit,
  };
}

function resolvePaintCoverage(product: ProductDoc): PaintCoverageSummary | null {
  const rawAttributes =
    product.productAttributes && typeof product.productAttributes === 'object' && !Array.isArray(product.productAttributes)
      ? product.productAttributes
      : {};

  const coverageAreaPerSqFt = Number(rawAttributes.coverageAreaPer ?? rawAttributes.coverage_area_per ?? 0);
  const paintMeasureUnit = String(rawAttributes.paintMeasureUnit ?? rawAttributes.measureUnit ?? 'Liter');

  if (coverageAreaPerSqFt <= 0) return null;

  return {
    coverageAreaPerSqFt,
    paintMeasureUnit,
  };
}

function resolveTileDimensions(product: ProductDoc): TileDimensionSummary | null {
  const rawAttributes =
    product.productAttributes && typeof product.productAttributes === 'object' && !Array.isArray(product.productAttributes)
      ? product.productAttributes
      : {};

  const length = Number(rawAttributes.length ?? rawAttributes.Length ?? rawAttributes.L ?? 0);
  const width = Number(rawAttributes.width ?? rawAttributes.Width ?? rawAttributes.W ?? 0);
  const dimensionUnit = String(rawAttributes.dimensionUnit ?? rawAttributes.dimension_unit ?? 'mm');

  if (length <= 0 || width <= 0) return null;

  return {
    lengthMeters: toMeters(length, dimensionUnit),
    widthMeters: toMeters(width, dimensionUnit),
    dimensionUnit,
  };
}

export default function EstimatorEngine({ selectedProduct }: EstimatorEngineProps) {
  const [wallLength, setWallLength] = useState('');
  const [wallWidth, setWallWidth] = useState('');
  const [wallHeight, setWallHeight] = useState('');
  const [tileSurfaceArea, setTileSurfaceArea] = useState('');
  const [surfaceArea, setSurfaceArea] = useState('');
  const [coats, setCoats] = useState('1');
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [estimatedUnits, setEstimatedUnits] = useState<number | null>(null);
  const [estimatedTilesQuantity, setEstimatedTilesQuantity] = useState<number | null>(null);
  const [estimatedPaintQuantity, setEstimatedPaintQuantity] = useState<number | null>(null);

  const normalizedType = normalizeProductType(selectedProduct.productType);
  const isBrickBlock = normalizedType.includes('brick') || normalizedType.includes('block');
  const isTilesMarble = normalizedType.includes('tile') || normalizedType.includes('marble');
  const isPaintsCoatings = normalizedType.includes('paint') || normalizedType.includes('coating');
  const dimensions = useMemo(() => resolveBrickDimensions(selectedProduct), [selectedProduct]);
  const tileDimensions = useMemo(() => resolveTileDimensions(selectedProduct), [selectedProduct]);
  const paintCoverage = useMemo(() => resolvePaintCoverage(selectedProduct), [selectedProduct]);

  const wallAreaSquareMeters = useMemo(() => {
    const length = parsePositiveNumber(wallLength);
    const height = parsePositiveNumber(wallHeight);
    if (!length || !height) return null;
    return length * height;
  }, [wallLength, wallHeight]);

  const estimatedWallVolume = useMemo(() => {
    const length = parsePositiveNumber(wallLength);
    const width = parsePositiveNumber(wallWidth);
    const height = parsePositiveNumber(wallHeight);
    if (!length || !width || !height) return null;
    return length * width * height;
  }, [wallLength, wallWidth, wallHeight]);

  const estimatedPaintCoverageArea = useMemo(() => {
    const area = parsePositiveNumber(surfaceArea);
    const coatsCount = parsePositiveNumber(coats);
    if (!area || !coatsCount) return null;
    return area * coatsCount;
  }, [surfaceArea, coats]);

  const estimatedPaintCoverageAreaSqFt = useMemo(() => {
    if (estimatedPaintCoverageArea === null) return null;
    return estimatedPaintCoverageArea * SQUARE_FEET_PER_SQUARE_METER;
  }, [estimatedPaintCoverageArea]);

  const estimatedTileSurfaceArea = useMemo(() => {
    const area = parsePositiveNumber(tileSurfaceArea);
    if (!area) return null;
    return area;
  }, [tileSurfaceArea]);

  const singleTileArea = useMemo(() => {
    if (!tileDimensions) return null;
    const area = tileDimensions.lengthMeters * tileDimensions.widthMeters;
    if (!Number.isFinite(area) || area <= 0) return null;
    return area;
  }, [tileDimensions]);

  const canEstimateBrick = isBrickBlock && Boolean(dimensions);
  const canEstimateTile = isTilesMarble && Boolean(tileDimensions);
  const canEstimatePaint = isPaintsCoatings && Boolean(paintCoverage);
  const canEstimate = canEstimateBrick || canEstimateTile || canEstimatePaint;
  const showValidationState = attemptedSubmit && !estimatedUnits && !estimatedTilesQuantity && !estimatedPaintQuantity;

  const handleCalculate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAttemptedSubmit(true);
    setEstimatedUnits(null);
    setEstimatedTilesQuantity(null);
    setEstimatedPaintQuantity(null);

    if (canEstimateBrick && dimensions) {
      const length = parsePositiveNumber(wallLength);
      const width = parsePositiveNumber(wallWidth);
      const height = parsePositiveNumber(wallHeight);

      if (!length || !width || !height) {
        return;
      }

      const wallVolume = length * width * height;
      const blockVolume = dimensions.lengthMeters * dimensions.widthMeters * dimensions.heightMeters;

      if (!Number.isFinite(blockVolume) || blockVolume <= 0) {
        return;
      }

      const requiredUnits = Math.ceil((wallVolume / blockVolume) * 1.05);
      setEstimatedUnits(requiredUnits);
      return;
    }

    if (canEstimateTile && tileDimensions) {
      const area = parsePositiveNumber(tileSurfaceArea);
      if (!area) {
        return;
      }

      const tileArea = tileDimensions.lengthMeters * tileDimensions.widthMeters;
      if (!Number.isFinite(tileArea) || tileArea <= 0) {
        return;
      }

      const requiredTiles = Math.ceil((area / tileArea) * 1.05);
      setEstimatedTilesQuantity(requiredTiles);
      return;
    }

    if (canEstimatePaint && paintCoverage) {
      const area = parsePositiveNumber(surfaceArea);
      const coatsCount = parsePositiveNumber(coats);

      if (!area || !coatsCount) {
        return;
      }

      const totalAreaSqFt = area * coatsCount * SQUARE_FEET_PER_SQUARE_METER;
      const requiredQuantity = (totalAreaSqFt / paintCoverage.coverageAreaPerSqFt) * 1.05;
      setEstimatedPaintQuantity(Number(requiredQuantity.toFixed(2)));
    }
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="overflow-hidden rounded-[30px] border border-(--border) bg-[linear-gradient(145deg,rgba(255,255,255,0.96),rgba(243,237,231,0.9))] shadow-[0_24px_64px_rgba(68,39,34,0.12)]"
    >
      <div className="border-b border-(--border) bg-[radial-gradient(circle_at_top_left,rgba(222,184,135,0.2),transparent_46%),linear-gradient(180deg,rgba(255,255,255,0.95),rgba(255,255,255,0.72))] p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.16em] text-(--soft-text)">
              <Calculator className="h-4 w-4" />
              LIVE ESTIMATE
            </div>
            <h3 className="mt-3 text-xl font-semibold tracking-tight text-(--foreground-strong)">
              {selectedProduct.name}
            </h3>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-(--muted)">
              {isBrickBlock
                ? 'Enter wall dimensions in meters. The engine converts the product dimensions to meters and adds 5% wastage automatically.'
                : isTilesMarble
                  ? 'Enter surface area in square meters. The engine converts tile L and W to meters and estimates quantity with 5% wastage.'
                  : 'Enter the paintable surface area in square meters and coats. The engine converts that area to square feet, uses the saved coverage-per-area value, and adds 5% wastage automatically.'}
            </p>
          </div>

          {dimensions && (
            <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 text-right shadow-sm">
              <p className="text-[11px] uppercase tracking-[0.14em] text-(--soft-text)">Unit Dimensions</p>
              <p className="mt-2 text-sm font-semibold text-(--foreground-strong)">
                {dimensions.lengthMeters.toFixed(3)}m x {dimensions.widthMeters.toFixed(3)}m x {dimensions.heightMeters.toFixed(3)}m
              </p>
              <p className="mt-1 text-xs text-(--muted)">Source unit: {dimensions.dimensionUnit}</p>
            </div>
          )}

          {paintCoverage && (
            <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 text-right shadow-sm">
              <p className="text-[11px] uppercase tracking-[0.14em] text-(--soft-text)">Coverage Rate</p>
              <p className="mt-2 text-sm font-semibold text-(--foreground-strong)">
                {paintCoverage.coverageAreaPerSqFt} sq.ft / {paintCoverage.paintMeasureUnit}
              </p>
              <p className="mt-1 text-xs text-(--muted)">
                {`${(paintCoverage.coverageAreaPerSqFt / SQUARE_FEET_PER_SQUARE_METER).toFixed(2)} sq.m / ${paintCoverage.paintMeasureUnit}`}
              </p>
            </div>
          )}

          {tileDimensions && (
            <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 text-right shadow-sm">
              <p className="text-[11px] uppercase tracking-[0.14em] text-(--soft-text)">Tile Dimensions</p>
              <p className="mt-2 text-sm font-semibold text-(--foreground-strong)">
                {tileDimensions.lengthMeters.toFixed(3)}m x {tileDimensions.widthMeters.toFixed(3)}m
              </p>
              <p className="mt-1 text-xs text-(--muted)">Source unit: {tileDimensions.dimensionUnit}</p>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
        <form onSubmit={handleCalculate} className="grid gap-4">
          {isBrickBlock && (
            <div className="grid gap-4 md:grid-cols-3">
              <label className="grid gap-2 rounded-2xl border border-(--border) bg-white/75 p-4 shadow-sm">
                <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-(--soft-text)">
                  <Ruler className="h-4 w-4" />
                  Wall Length
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={wallLength}
                  onChange={(event) => setWallLength(event.target.value)}
                  className="w-full rounded-xl border border-(--border) bg-white px-4 py-3 text-sm text-foreground outline-none transition focus:border-(--accent)"
                  aria-label="Wall length in meters"
                />
              </label>

              <label className="grid gap-2 rounded-2xl border border-(--border) bg-white/75 p-4 shadow-sm">
                <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-(--soft-text)">
                  <Ruler className="h-4 w-4" />
                  Wall Width
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={wallWidth}
                  onChange={(event) => setWallWidth(event.target.value)}
                  className="w-full rounded-xl border border-(--border) bg-white px-4 py-3 text-sm text-foreground outline-none transition focus:border-(--accent)"
                  aria-label="Wall width in meters"
                />
              </label>

              <label className="grid gap-2 rounded-2xl border border-(--border) bg-white/75 p-4 shadow-sm">
                <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-(--soft-text)">
                  <Ruler className="h-4 w-4" />
                  Wall Height
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={wallHeight}
                  onChange={(event) => setWallHeight(event.target.value)}
                  className="w-full rounded-xl border border-(--border) bg-white px-4 py-3 text-sm text-foreground outline-none transition focus:border-(--accent)"
                  aria-label="Wall height in meters"
                />
              </label>
            </div>
          )}

          {isPaintsCoatings && (
            <div className="grid gap-4 md:grid-cols-3">
              <label className="grid gap-2 rounded-2xl border border-(--border) bg-white/75 p-4 shadow-sm md:col-span-2">
                <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-(--soft-text)">
                  <PaintBucket className="h-4 w-4" />
                  Paintable Area
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={surfaceArea}
                  onChange={(event) => setSurfaceArea(event.target.value)}
                  className="w-full rounded-xl border border-(--border) bg-white px-4 py-8 text-sm text-foreground outline-none transition focus:border-(--accent) min-h-30"
                  aria-label="Paintable area in square meters"
                  placeholder="Enter area in sq.m"
                />
              </label>

              <label className="grid gap-2 rounded-2xl border border-(--border) bg-white/75 p-4 shadow-sm">
                <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-(--soft-text)">
                  <Calculator className="h-4 w-4" />
                  Coats
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="1"
                  step="1"
                  value={coats}
                  onChange={(event) => setCoats(event.target.value)}
                  className="w-full rounded-xl border border-(--border) bg-white px-4 py-3 text-sm text-foreground outline-none transition focus:border-(--accent)"
                  aria-label="Number of paint coats"
                />
              </label>
            </div>
          )}

          {isTilesMarble && (
            <div className="grid gap-4 md:grid-cols-3">
              <label className="grid gap-2 rounded-2xl border border-(--border) bg-white/75 p-4 shadow-sm md:col-span-2">
                <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-(--soft-text)">
                  <Grid3x3 className="h-4 w-4" />
                  Surface Area
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={tileSurfaceArea}
                  onChange={(event) => setTileSurfaceArea(event.target.value)}
                  className="w-full rounded-xl border border-(--border) bg-white px-4 py-3 text-sm text-foreground outline-none transition focus:border-(--accent)"
                  aria-label="Tile surface area in square meters"
                />
              </label>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              className="rounded-full border border-(--border) bg-(--surface) px-5 py-2.5 text-sm font-semibold text-foreground transition hover:border-(--accent) hover:bg-(--surface-soft)"
            >
              Calculate Estimate
            </button>
            <div className="text-xs text-(--muted)">
              {isBrickBlock
                ? 'Wall inputs are measured in meters.'
                : isTilesMarble
                  ? 'Surface area is measured in square meters.'
                  : 'Coverage is calculated in square meters with 5% wastage.'}
            </div>
          </div>

          <AnimatePresence>
            {showValidationState && !canEstimate && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>This product cannot be estimated yet. Use a Brick/Block product with valid dimensions, a Tile/Marble product with L/W + unit, or a Paints & Coatings product with coverage-per-area data.</p>
              </motion.div>
            )}

            {showValidationState && canEstimate && !estimatedUnits && !estimatedTilesQuantity && !estimatedPaintQuantity && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  {isBrickBlock
                    ? 'Enter positive wall length, width, and height values to calculate the unit requirement.'
                    : isTilesMarble
                      ? 'Enter a positive surface area value to calculate tile quantity.'
                      : 'Enter a positive paintable area and number of coats to calculate the required quantity.'}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </form>

        <div className="grid gap-3">
          <motion.div
            layout
            className="rounded-3xl border border-(--border) bg-[#111111] p-5 text-white shadow-[0_18px_45px_rgba(17,17,17,0.24)]"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">Estimate Result</p>
            <AnimatePresence mode="wait">
              <motion.div
                key={
                  estimatedUnits !== null
                    ? 'brick-result'
                    : estimatedTilesQuantity !== null
                      ? 'tile-result'
                      : estimatedPaintQuantity !== null
                        ? 'paint-result'
                        : 'empty'
                }
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.25 }}
                className="mt-4"
              >
                {estimatedUnits === null && estimatedPaintQuantity === null ? (
                  <div className="space-y-2">
                    <p className="text-3xl font-semibold tracking-tight">Ready</p>
                    <p className="max-w-xs text-sm leading-relaxed text-white/65">
                      Run the calculation to see the required quantity with wastage included.
                    </p>
                  </div>
                ) : estimatedUnits !== null ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-emerald-300">
                      <Boxes className="h-4 w-4" />
                      <span className="text-xs font-semibold uppercase tracking-[0.16em]">Units Required</span>
                    </div>
                    <p className="text-4xl font-semibold tracking-tight">{estimatedUnits}</p>
                    <p className="text-sm leading-relaxed text-white/65">Includes a 5% wastage allowance.</p>
                  </div>
                ) : estimatedTilesQuantity !== null ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-emerald-300">
                      <Grid3x3 className="h-4 w-4" />
                      <span className="text-xs font-semibold uppercase tracking-[0.16em]">Tiles Required</span>
                    </div>
                    <p className="text-4xl font-semibold tracking-tight">{estimatedTilesQuantity}</p>
                    <p className="text-sm leading-relaxed text-white/65">Includes a 5% wastage allowance.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-emerald-300">
                      <PaintBucket className="h-4 w-4" />
                      <span className="text-xs font-semibold uppercase tracking-[0.16em]">Quantity Required</span>
                    </div>
                    <p className="text-4xl font-semibold tracking-tight">{estimatedPaintQuantity}</p>
                    <p className="text-sm leading-relaxed text-white/65">
                      {paintCoverage?.paintMeasureUnit === 'KG' ? 'KG required' : 'Liters required'}, including 5% wastage.
                    </p>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </motion.div>

          {isBrickBlock ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-(--border) bg-white/75 p-4 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-(--soft-text)">Wall Area</p>
                <p className="mt-2 text-lg font-semibold text-(--foreground-strong)">
                  {wallAreaSquareMeters !== null ? `${wallAreaSquareMeters.toFixed(2)} sq.m` : 'Pending'}
                </p>
              </div>
              <div className="rounded-2xl border border-(--border) bg-white/75 p-4 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-(--soft-text)">Wall Volume</p>
                <p className="mt-2 text-lg font-semibold text-(--foreground-strong)">
                  {estimatedWallVolume !== null ? `${estimatedWallVolume.toFixed(3)} cu.m` : 'Pending'}
                </p>
              </div>
            </div>
          ) : isTilesMarble ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-(--border) bg-white/75 p-4 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-(--soft-text)">Surface Area</p>
                <p className="mt-2 text-lg font-semibold text-(--foreground-strong)">
                  {estimatedTileSurfaceArea !== null ? `${estimatedTileSurfaceArea.toFixed(2)} sq.m` : 'Pending'}
                </p>
              </div>
              <div className="rounded-2xl border border-(--border) bg-white/75 p-4 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-(--soft-text)">Tile Area (Per Unit)</p>
                <p className="mt-2 text-lg font-semibold text-(--foreground-strong)">
                  {singleTileArea !== null ? `${singleTileArea.toFixed(4)} sq.m` : 'Pending'}
                </p>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-(--border) bg-white/75 p-4 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-(--soft-text)">Paintable Area</p>
                <p className="mt-2 text-lg font-semibold text-(--foreground-strong)">
                  {parsePositiveNumber(surfaceArea) !== null ? `${Number(surfaceArea).toFixed(2)} sq.m` : 'Pending'}
                </p>
              </div>
              <div className="rounded-2xl border border-(--border) bg-white/75 p-4 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-(--soft-text)">Total Coverage Need</p>
                <p className="mt-2 text-lg font-semibold text-(--foreground-strong)">
                  {estimatedPaintCoverageArea !== null ? `${estimatedPaintCoverageArea.toFixed(2)} sq.m` : 'Pending'}
                </p>
                <p className="mt-1 text-xs text-(--muted)">
                  {estimatedPaintCoverageAreaSqFt !== null ? `${estimatedPaintCoverageAreaSqFt.toFixed(2)} sq.ft` : 'Converted automatically from sq.m'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.section>
  );
}
