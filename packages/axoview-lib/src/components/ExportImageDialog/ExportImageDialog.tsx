import React, {
  memo,
  useRef,
  useEffect,
  useMemo,
  useCallback,
  useState
} from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  Box,
  Button,
  Stack,
  Alert,
  Checkbox,
  FormControlLabel,
  Typography,
  Slider,
  Select,
  MenuItem,
  FormControl
} from '@mui/material';
import { useModelStore } from 'src/stores/modelStore';
import {
  exportAsImage,
  exportAsSVG,
  downloadFile as downloadFileUtil,
  base64ToBlob,
  generateGenericFilename,
  modelFromModelStore,
  computeRenderTarget
} from 'src/utils';
import { ModelStore, Coords } from 'src/types';
import { useDiagramUtils } from 'src/hooks/useDiagramUtils';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { Axoview } from 'src/Axoview';
import { Loader } from 'src/components/Loader/Loader';
import { customVars } from 'src/styles/theme';
import { ColorPicker } from 'src/components/ColorSelector/ColorPicker';
import { DOMErrorBoundary } from 'src/components/DOMErrorBoundary';
import { useTranslation } from 'src/stores/localeStore';
import { waitForIconsDrawn } from './waitForIconsDrawn';

interface Props {
  onClose: () => void;
}

// The browser-compatibility notice is only relevant on Firefox (dom-to-image-more
// has known foreignObject quirks there). Chrome/Edge — the recommended browsers —
// never see it, so the dialog stays clean for the common case.
const IS_FIREFOX =
  typeof navigator !== 'undefined' && /firefox/i.test(navigator.userAgent);

interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Crop preview canvas size + interactive-handle tuning. The crop rectangle is
// resizable (8 handles) and movable, so the user trims to the exact edges
// instead of drawing once and guessing.
const CROP_CANVAS_W = 500;
const CROP_CANVAS_H = 300;
const CROP_HANDLE_DRAW = 8; // drawn handle square (px)
const CROP_HANDLE_HIT = 12; // grab radius around a handle (px)
const CROP_MIN_SIZE = 20; // smallest allowed crop edge (px)

type CropHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

const cropHandlePoints = (c: CropArea): Record<CropHandle, Coords> => ({
  nw: { x: c.x, y: c.y },
  n: { x: c.x + c.width / 2, y: c.y },
  ne: { x: c.x + c.width, y: c.y },
  e: { x: c.x + c.width, y: c.y + c.height / 2 },
  se: { x: c.x + c.width, y: c.y + c.height },
  s: { x: c.x + c.width / 2, y: c.y + c.height },
  sw: { x: c.x, y: c.y + c.height },
  w: { x: c.x, y: c.y + c.height / 2 }
});

const CROP_HANDLE_CURSORS: Record<CropHandle, string> = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize'
};

// Which part of the crop the pointer is over: a resize handle, the interior
// (move), or outside (start a fresh selection).
const cropRegionAt = (
  px: number,
  py: number,
  c: CropArea
): CropHandle | 'move' | 'outside' => {
  const pts = cropHandlePoints(c);
  for (const key of Object.keys(pts) as CropHandle[]) {
    const p = pts[key];
    if (
      Math.abs(px - p.x) <= CROP_HANDLE_HIT &&
      Math.abs(py - p.y) <= CROP_HANDLE_HIT
    ) {
      return key;
    }
  }
  if (px >= c.x && px <= c.x + c.width && py >= c.y && py <= c.y + c.height) {
    return 'move';
  }
  return 'outside';
};

const clampNum = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

// Paint a transparency checkerboard across the canvas backdrop.
function drawCheckerboard(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  squareSize = 10
) {
  for (let y = 0; y < height; y += squareSize) {
    for (let x = 0; x < width; x += squareSize) {
      ctx.fillStyle =
        (x / squareSize + y / squareSize) % 2 === 0 ? '#f0f0f0' : 'transparent';
      ctx.fillRect(x, y, squareSize, squareSize);
    }
  }
}

// Cut the selected area out of the dimming overlay, redraw the source image
// inside it, re-dim everything outside, and stroke the selection border.
function drawCropSelection(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  canvas: HTMLCanvasElement,
  cropArea: CropArea
) {
  // Clear the selected area (remove overlay), then redraw the source image there
  ctx.clearRect(cropArea.x, cropArea.y, cropArea.width, cropArea.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  // Redraw the overlay everywhere except the selected area
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';

  const right = cropArea.x + cropArea.width;
  const bottom = cropArea.y + cropArea.height;
  if (cropArea.y > 0) {
    ctx.fillRect(0, 0, canvas.width, cropArea.y);
  }
  if (bottom < canvas.height) {
    ctx.fillRect(0, bottom, canvas.width, canvas.height - bottom);
  }
  if (cropArea.x > 0) {
    ctx.fillRect(0, cropArea.y, cropArea.x, cropArea.height);
  }
  if (right < canvas.width) {
    ctx.fillRect(right, cropArea.y, canvas.width - right, cropArea.height);
  }

  ctx.restore();

  // Crop border
  ctx.strokeStyle = '#2196f3';
  ctx.lineWidth = 2;
  ctx.strokeRect(cropArea.x, cropArea.y, cropArea.width, cropArea.height);

  // Resize handles (corners + edge midpoints) — the grab targets.
  const pts = cropHandlePoints(cropArea);
  ctx.lineWidth = 1.5;
  (Object.keys(pts) as CropHandle[]).forEach((k) => {
    const p = pts[k];
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(
      p.x - CROP_HANDLE_DRAW / 2,
      p.y - CROP_HANDLE_DRAW / 2,
      CROP_HANDLE_DRAW,
      CROP_HANDLE_DRAW
    );
    ctx.strokeStyle = '#2196f3';
    ctx.strokeRect(
      p.x - CROP_HANDLE_DRAW / 2,
      p.y - CROP_HANDLE_DRAW / 2,
      CROP_HANDLE_DRAW,
      CROP_HANDLE_DRAW
    );
  });
}

export const ExportImageDialog = memo(({ onClose }: Props) => {
  const { t } = useTranslation('exportImageDialog');
  const containerRef = useRef<HTMLDivElement>(null);
  const cropCanvasRef = useRef<HTMLCanvasElement>(null);
  const isExporting = useRef<boolean>(false);
  // In-progress crop gesture (resize a handle / move the box / draw a fresh
  // one). A ref so per-frame pointer moves don't re-render on the gesture
  // bookkeeping — only setCropArea (which drives the redraw) does.
  const cropDragRef = useRef<{
    mode: 'new' | 'move' | CropHandle;
    startX: number;
    startY: number;
    startCrop: CropArea | null;
  } | null>(null);
  const [canvasCursor, setCanvasCursor] = useState<string>('crosshair');
  const currentView = useUiStateStore((state) => state.view);
  const [imageData, setImageData] = React.useState<string>();
  const [svgData, setSvgData] = useState<string>();
  const [croppedImageData, setCroppedImageData] = useState<string>();
  const [exportError, setExportError] = useState(false);
  const { getUnprojectedBounds } = useDiagramUtils();
  const model = useModelStore((state): Omit<ModelStore, 'actions'> => {
    return modelFromModelStore(state);
  });

  // Crop states
  const [cropToContent, setCropToContent] = useState(false);
  const [cropArea, setCropArea] = useState<CropArea | null>(null);
  const [isInCropMode, setIsInCropMode] = useState(false);

  // Scale/DPI state. The "Screenshot" preset (ADR 0025 §4) is the default
  // selection: 2× · fit-to-content · labels on · PNG — the one-click "good
  // screenshot" path. DPI presets remain for power users.
  const [exportScale, setExportScale] = useState<number>(2);
  const [scaleMode, setScaleMode] = useState<'screenshot' | 'preset' | 'custom'>(
    'screenshot'
  );

  // Name-label visibility in the export (ADR 0025 §3). On by default (part of
  // the Screenshot preset).
  const [showLabels, setShowLabels] = useState(true);

  // DPI presets
  const dpiPresets = [
    { label: '1x (72 DPI)', value: 1 },
    { label: '2x (144 DPI)', value: 2 },
    { label: '3x (216 DPI)', value: 3 },
    { label: '4x (288 DPI)', value: 4 }
  ];

  // Use original bounds for the base image
  const bounds = useMemo(() => {
    return getUnprojectedBounds();
  }, [getUnprojectedBounds]);

  // QA #10 (CI): `data-all-icons-drawn` is vacuously "true" on any paint whose
  // build saw no node with a pending icon — including the hidden Axoview's
  // mount-time paints that precede its content build. Readiness alone can
  // therefore approve a background-only capture AND skip the recapture (the
  // permanently-blank CI preview, measured in run 31330358840). The capture
  // waits additionally require ≥1 drawn node whenever the exported view has any
  // items. ≥1 rather than the item count: items on hidden layers never draw,
  // and builds are atomic over layer-visible nodes (no viewport culling), so a
  // single drawn node proves the content build happened. Routed through a ref,
  // like exportImageRef, so the capture effect keeps [axoviewReadySignal] as
  // its only dependency.
  const exportedView =
    model.views.find((v) => {
      return v.id === currentView;
    }) ?? model.views[0];
  const minNodesForCapture = (exportedView?.items.length ?? 0) > 0 ? 1 : 0;
  const minNodesForCaptureRef = useRef(minNodesForCapture);
  useEffect(() => {
    minNodesForCaptureRef.current = minNodesForCapture;
  }, [minNodesForCapture]);

  // Clamp the requested scale against the browser's canvas limits (ADR 0025 §2).
  // The same calculator runs inside exportAsImage/exportAsSVG; here it drives the
  // user-visible "size was reduced" notice so the cap is never silent (#18).
  const renderTarget = useMemo(
    () => computeRenderTarget(bounds, exportScale),
    [bounds, exportScale]
  );

  // Track when the hidden Axoview has finished its first render cycle
  const axoviewLoadedRef = useRef(false);
  const [axoviewReadySignal, setIsoflowReadySignal] = useState(0);

  // Called by the hidden Axoview's onModelUpdated — fires after its model store
  // is first populated, meaning React has the data and will paint next rAF
  const handleHiddenAxoviewReady = useCallback(() => {
    if (!axoviewLoadedRef.current) {
      axoviewLoadedRef.current = true;
      setIsoflowReadySignal((s) => s + 1);
    }
  }, []);

  const [transparentBackground, setTransparentBackground] = useState(false);

  const [backgroundColor, setBackgroundColor] = useState<string>(
    customVars.customPalette.diagramBg
  );

  const exportImage = useCallback(async () => {
    if (!containerRef.current || isExporting.current) {
      return;
    }

    isExporting.current = true;

    // Base size without scale (scale is applied via CSS transform)
    const containerSize = {
      width: bounds.width,
      height: bounds.height
    };

    const bgColor = transparentBackground ? 'transparent' : backgroundColor;

    try {
      // Export both PNG and SVG in parallel
      const [pngData, svgDataResult] = await Promise.all([
        exportAsImage(
          containerRef.current as HTMLDivElement,
          containerSize,
          exportScale,
          bgColor
        ),
        exportAsSVG(
          containerRef.current as HTMLDivElement,
          containerSize,
          bgColor
        )
      ]);

      setImageData(pngData);
      setSvgData(svgDataResult);
      isExporting.current = false;
    } catch (err) {
      console.error(err);
      setExportError(true);
      isExporting.current = false;
    }
  }, [bounds, exportScale, transparentBackground, backgroundColor]);

  // Stable ref so effects can call the latest exportImage without adding it
  // to their dependency arrays (which would cause spurious re-fires)
  const exportImageRef = useRef(exportImage);
  useEffect(() => {
    exportImageRef.current = exportImage;
  }, [exportImage]);

  // Crop the image based on selected area
  const cropImage = useCallback((cropArea: CropArea, sourceImage: string) => {
    return new Promise<string>((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();

      img.onload = () => {
        // Calculate the scaling factors between display canvas (500x300) and actual image
        const displayCanvas = cropCanvasRef.current;
        if (!displayCanvas) {
          reject(new Error('Display canvas not found'));
          return;
        }

        const scaleX = img.width / displayCanvas.width;
        const scaleY = img.height / displayCanvas.height;

        // Calculate the actual crop area in the source image coordinates
        const actualCropArea = {
          x: cropArea.x * scaleX,
          y: cropArea.y * scaleY,
          width: cropArea.width * scaleX,
          height: cropArea.height * scaleY
        };

        // Set canvas size to the actual crop dimensions
        canvas.width = actualCropArea.width;
        canvas.height = actualCropArea.height;

        if (ctx) {
          // Draw the cropped portion from the source image
          ctx.drawImage(
            img,
            actualCropArea.x,
            actualCropArea.y,
            actualCropArea.width,
            actualCropArea.height,
            0,
            0,
            actualCropArea.width,
            actualCropArea.height
          );

          resolve(canvas.toDataURL('image/png'));
        } else {
          reject(new Error('Could not get canvas context'));
        }
      };

      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = sourceImage;
    });
  }, []);

  // Handle crop area generation - only when not in crop mode (after applying)
  useEffect(() => {
    if (cropToContent && cropArea && imageData && !isInCropMode) {
      cropImage(cropArea, imageData)
        .then(setCroppedImageData)
        .catch(console.error);
    } else if (!cropToContent || !cropArea) {
      setCroppedImageData(undefined);
    }
  }, [cropArea, imageData, cropToContent, cropImage, isInCropMode]);

  // Pointer → canvas-internal coords (handles any CSS scaling of the canvas).
  const getCanvasPoint = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>): Coords | null => {
      const canvas = cropCanvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const sx = rect.width ? canvas.width / rect.width : 1;
      const sy = rect.height ? canvas.height / rect.height : 1;
      return {
        x: (e.clientX - rect.left) * sx,
        y: (e.clientY - rect.top) * sy
      };
    },
    []
  );

  // Mouse handlers for crop selection — resize a handle, move the box, or (when
  // pressing outside an existing box) draw a fresh one.
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isInCropMode) return;
      e.preventDefault();
      const p = getCanvasPoint(e);
      if (!p) return;

      const region = cropArea ? cropRegionAt(p.x, p.y, cropArea) : 'outside';
      if (region === 'outside' || !cropArea) {
        cropDragRef.current = {
          mode: 'new',
          startX: p.x,
          startY: p.y,
          startCrop: null
        };
        setCropArea(null);
      } else {
        cropDragRef.current = {
          mode: region, // 'move' | a handle
          startX: p.x,
          startY: p.y,
          startCrop: cropArea
        };
      }
    },
    [isInCropMode, cropArea, getCanvasPoint]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isInCropMode) return;
      const p = getCanvasPoint(e);
      if (!p) return;

      const drag = cropDragRef.current;
      if (!drag) {
        // Hover: reflect what a press would do via the cursor.
        const region = cropArea
          ? cropRegionAt(p.x, p.y, cropArea)
          : 'outside';
        setCanvasCursor(
          region === 'outside'
            ? 'crosshair'
            : region === 'move'
              ? 'move'
              : CROP_HANDLE_CURSORS[region]
        );
        return;
      }

      e.preventDefault();
      const px = clampNum(p.x, 0, CROP_CANVAS_W);
      const py = clampNum(p.y, 0, CROP_CANVAS_H);

      if (drag.mode === 'new') {
        setCropArea({
          x: Math.min(drag.startX, px),
          y: Math.min(drag.startY, py),
          width: Math.abs(px - drag.startX),
          height: Math.abs(py - drag.startY)
        });
        return;
      }

      const s = drag.startCrop;
      if (!s) return;

      if (drag.mode === 'move') {
        setCropArea({
          x: clampNum(s.x + (px - drag.startX), 0, CROP_CANVAS_W - s.width),
          y: clampNum(s.y + (py - drag.startY), 0, CROP_CANVAS_H - s.height),
          width: s.width,
          height: s.height
        });
        return;
      }

      // Resize: move the edges the grabbed handle controls, keep the opposite
      // edges fixed, and never let an edge cross its opposite (min size).
      let l = s.x;
      let t = s.y;
      let r = s.x + s.width;
      let b = s.y + s.height;
      const h = drag.mode;
      if (h.includes('w')) l = clampNum(px, 0, r - CROP_MIN_SIZE);
      if (h.includes('e')) r = clampNum(px, l + CROP_MIN_SIZE, CROP_CANVAS_W);
      if (h.includes('n')) t = clampNum(py, 0, b - CROP_MIN_SIZE);
      if (h.includes('s')) b = clampNum(py, t + CROP_MIN_SIZE, CROP_CANVAS_H);
      setCropArea({ x: l, y: t, width: r - l, height: b - t });
    },
    [isInCropMode, cropArea, getCanvasPoint]
  );

  const endCropDrag = useCallback(() => {
    const drag = cropDragRef.current;
    cropDragRef.current = null;
    // A stray click that drew a near-zero box → drop it rather than leave a
    // tiny invalid crop.
    if (
      drag?.mode === 'new' &&
      cropArea &&
      (cropArea.width < CROP_MIN_SIZE || cropArea.height < CROP_MIN_SIZE)
    ) {
      setCropArea(null);
    }
  }, [cropArea]);

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      endCropDrag();
    },
    [endCropDrag]
  );

  const handleMouseLeave = useCallback(() => {
    endCropDrag();
  }, [endCropDrag]);

  // Draw crop overlay
  useEffect(() => {
    const canvas = cropCanvasRef.current;
    if (!canvas || !imageData) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (transparentBackground) {
        drawCheckerboard(ctx, canvas.width, canvas.height);
      }

      // Draw the image scaled to fit canvas
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      if (!isInCropMode) return;

      // Semi-transparent overlay across the whole canvas
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // With a valid selection, cut it out of the overlay; otherwise prompt.
      if (cropArea && cropArea.width > 5 && cropArea.height > 5) {
        drawCropSelection(ctx, img, canvas, cropArea);
      } else {
        ctx.fillStyle = 'white';
        ctx.font = '14px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(t('cropInstruction'), 10, 25);
      }
    };

    img.src = imageData;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- redraw is driven by image/crop state; t only labels the crop hint
  }, [imageData, isInCropMode, cropArea, transparentBackground]);

  // Grid on by default — the exported diagram reads better with its isometric
  // reference grid than on a bare background.
  const [showGrid, setShowGrid] = useState(true);
  const handleShowGridChange = (checked: boolean) => {
    setShowGrid(checked);
  };

  const handleTransparentBackgroundChange = (checked: boolean) => {
    setTransparentBackground(checked);
    if (checked) {
      setBackgroundColor('transparent');
    } else {
      setBackgroundColor(customVars.customPalette.diagramBg);
    }
  };

  const handleBackgroundColorChange = (color: string) => {
    setBackgroundColor(color);
  };

  // Start crop mode with the whole image selected, so the user trims edges
  // inward (and never has to guess where to start the box).
  const fullCropArea = (): CropArea => ({
    x: 0,
    y: 0,
    width: CROP_CANVAS_W,
    height: CROP_CANVAS_H
  });

  const handleCropToContentChange = (checked: boolean) => {
    setCropToContent(checked);
    cropDragRef.current = null;
    setCroppedImageData(undefined);
    if (checked) {
      setIsInCropMode(true);
      setCropArea(fullCropArea());
    } else {
      setIsInCropMode(false);
      setCropArea(null);
    }
  };

  const handleRecrop = () => {
    cropDragRef.current = null;
    setIsInCropMode(true);
    setCropArea(fullCropArea());
    setCroppedImageData(undefined);
  };

  const handleResetCrop = () => {
    cropDragRef.current = null;
    setCropArea(fullCropArea());
  };

  const handleAcceptCrop = () => {
    setIsInCropMode(false);
  };

  // Initial export: fire once when the hidden Axoview signals it has rendered
  useEffect(() => {
    if (axoviewReadySignal === 0) return;
    setImageData(undefined);
    setSvgData(undefined);
    setExportError(false);
    isExporting.current = false;

    let cancelled = false;
    // A2: model-ready + one rAF guarantees React painted, but the canvas icon
    // bitmaps decode asynchronously and may not be on the first frame. Wait for
    // SceneCanvas to report `data-all-icons-drawn="true"` before capturing, so
    // icon nodes aren't dropped from the snapshot. Cap the wait so a stuck/broken
    // icon can never hang the export — we capture anyway and recapture below once
    // the icons finish.
    const ICONS_READY_TIMEOUT_MS = 400;
    // Longer budget for the post-capture recovery: slow icon decodes (large
    // sprites / many nodes) and a cold CI runner's first content build may
    // exceed the initial window; give them room before settling for the frame
    // that is there. Still bounded — the export can never hang on it.
    const ICONS_RECAPTURE_TIMEOUT_MS = 5000;

    const run = async () => {
      const iconsReady = await waitForIconsDrawn(
        containerRef.current,
        ICONS_READY_TIMEOUT_MS,
        minNodesForCaptureRef.current
      );
      if (cancelled) return;
      // Await the capture so the recapture below can't race the in-flight
      // exportImage (which guards on isExporting.current) or clobber its result.
      await exportImageRef.current();
      // A2 recapture fallback: the first capture fired before the scene was
      // ready (the wait timed out), so the snapshot may be missing content. Keep
      // waiting for the canvas to report ready, then capture once more to
      // replace the incomplete image. Bounded by ICONS_RECAPTURE_TIMEOUT_MS so
      // it always resolves and stops.
      if (iconsReady || cancelled) return;
      await waitForIconsDrawn(
        containerRef.current,
        ICONS_RECAPTURE_TIMEOUT_MS,
        minNodesForCaptureRef.current
      );
      if (cancelled) return;
      // Recapture even if readiness never flipped: the first capture is known
      // not-ready, so the freshest frame is never a worse replacement — and when
      // readiness is simply late (slow runner), waiting out the budget and NOT
      // recapturing is exactly the bug that froze a blank preview for good.
      await exportImageRef.current();
    };
    run();

    return () => {
      cancelled = true;
    };
  }, [axoviewReadySignal]);

  // Re-export when options change — only after the initial load has completed
  useEffect(() => {
    if (!axoviewLoadedRef.current || cropToContent) return;
    setImageData(undefined);
    setSvgData(undefined);
    setExportError(false);
    isExporting.current = false;
    let raf = 0;
    const timer = setTimeout(() => {
      raf = requestAnimationFrame(() => {
        exportImageRef.current();
      });
    }, 50);
    // Cancel BOTH the timer and any scheduled frame on unmount/re-run, so a late
    // rAF can't fire exportImage (setState) after the dialog has closed.
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [
    showGrid,
    backgroundColor,
    showLabels,
    cropToContent,
    exportScale,
    transparentBackground
  ]);

  const downloadFile = useCallback(() => {
    const dataToDownload = croppedImageData || imageData;
    if (!dataToDownload) return;

    const data = base64ToBlob(
      dataToDownload.replace('data:image/png;base64,', ''),
      'image/png;charset=utf-8'
    );

    downloadFileUtil(data, generateGenericFilename('png'));
  }, [imageData, croppedImageData]);

  const downloadSvgFile = useCallback(() => {
    if (!svgData) return;

    try {
      // Decode the base64 data URL to a Blob directly (atob) — mirrors the PNG
      // path. The old `fetch(svgData)` is blocked by the deployed connect-src
      // CSP (a data: URL is not an allowed connect source), and a local decode
      // avoids the network round-trip entirely. exportAsSVG always returns the
      // `data:image/svg+xml;base64,…` form.
      const blob = base64ToBlob(
        svgData.replace('data:image/svg+xml;base64,', ''),
        'image/svg+xml;charset=utf-8'
      );
      downloadFileUtil(blob, generateGenericFilename('svg'));
    } catch (error) {
      console.error('SVG download failed:', error);
      setExportError(true);
    }
  }, [svgData]);

  const displayImage = croppedImageData || imageData;

  const getCanvasCursor = () => (isInCropMode ? canvasCursor : 'default');

  const renderCropCanvas = () => (
    <Box>
      <canvas
        ref={cropCanvasRef}
        width={CROP_CANVAS_W}
        height={CROP_CANVAS_H}
        style={{
          maxWidth: '100%',
          maxHeight: '300px',
          cursor: getCanvasCursor(),
          border: isInCropMode ? '2px solid #2196f3' : 'none',
          userSelect: 'none'
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onContextMenu={(e) => e.preventDefault()}
      />
      {isInCropMode && (
        <Box sx={{ mt: 1 }}>
          <Typography variant="caption" color="primary">
            {t('cropInstruction')}
          </Typography>
        </Box>
      )}
    </Box>
  );

  const renderPreviewImage = () => (
    <Box
      component="img"
      sx={{
        maxWidth: '100%',
        maxHeight: '300px',
        objectFit: 'contain',
        backgroundImage: transparentBackground
          ? 'linear-gradient(45deg, #f0f0f0 25%, transparent 25%), linear-gradient(-45deg, #f0f0f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #f0f0f0 75%), linear-gradient(-45deg, transparent 75%, #f0f0f0 75%)'
          : undefined,
        backgroundSize: transparentBackground ? '20px 20px' : undefined,
        backgroundPosition: transparentBackground
          ? '0 0, 0 10px, 10px -10px, -10px 0px'
          : undefined
      }}
      src={displayImage}
      alt="preview"
    />
  );

  const renderPreview = () => {
    if (!displayImage) return null;
    return (
      <Box sx={{ position: 'relative', maxWidth: '100%' }}>
        {cropToContent && !croppedImageData
          ? renderCropCanvas()
          : renderPreviewImage()}
      </Box>
    );
  };

  const renderCropControlButtons = () => {
    if (croppedImageData) {
      return (
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" size="small" onClick={handleRecrop}>
            {t('recrop')}
          </Button>
          <Typography variant="caption" sx={{ alignSelf: 'center' }}>
            {t('cropApplied')}
          </Typography>
        </Stack>
      );
    }
    if (cropArea) {
      return (
        <Stack direction="row" spacing={1}>
          <Button variant="contained" size="small" onClick={handleAcceptCrop}>
            {t('applyCrop')}
          </Button>
          <Button variant="outlined" size="small" onClick={handleResetCrop}>
            {t('clearSelection')}
          </Button>
        </Stack>
      );
    }
    if (isInCropMode) {
      return (
        <Typography variant="caption" color="text.secondary">
          {t('cropHint')}
        </Typography>
      );
    }
    return null;
  };

  const renderCropControls = () => {
    if (!cropToContent || !imageData) return null;
    return <Box sx={{ mt: 2 }}>{renderCropControlButtons()}</Box>;
  };

  const renderActions = () => {
    if (!displayImage) return null;
    const cropSelectionPending =
      cropToContent && isInCropMode && !croppedImageData;
    return (
      <Stack sx={{ width: '100%' }} alignItems="flex-end">
        <Stack direction="row" spacing={2}>
          <Button variant="text" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            variant="outlined"
            data-testid="export-svg-button"
            onClick={downloadSvgFile}
            disabled={!svgData || cropSelectionPending}
          >
            {t('downloadSvg')}
          </Button>
          <Button onClick={downloadFile} disabled={cropSelectionPending}>
            {t('downloadPng')}
          </Button>
        </Stack>
      </Stack>
    );
  };

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{t('title')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          {IS_FIREFOX && (
            <Alert severity="info">
              <strong>{t('compatibilityTitle')}</strong>
              <br />
              {t('compatibilityMessage')}
            </Alert>
          )}

          <Box
            sx={{
              position: 'absolute',
              width: 0,
              height: 0,
              overflow: 'hidden'
            }}
          >
            <Box
              ref={containerRef}
              sx={{
                position: 'absolute',
                top: 0,
                left: 0
              }}
              style={{
                width: bounds.width,
                height: bounds.height
              }}
            >
              <DOMErrorBoundary>
                <Axoview
                  key="export-dialog-axoview"
                  editorMode="NON_INTERACTIVE"
                  initialData={{
                    ...model,
                    fitToView: true,
                    view: currentView
                  }}
                  renderer={{
                    showGrid,
                    backgroundColor,
                    // Always fully expand labels in the export so a long node
                    // name is never truncated/collapsed in the captured image.
                    // (User control removed — it referenced the now-gone node
                    // caption/description.)
                    expandLabels: true,
                    showLabels,
                    // A large fit-to-view export sits below the LABEL_LOD_ZOOM
                    // (0.25) cutoff, which would otherwise skip the whole name-
                    // label draw. readableLabels keeps labels rendered + counter-
                    // scaled to a legible size (ADR 0025 §3 / ADR 0015). Tied to
                    // showLabels: nothing to keep readable when labels are off.
                    readableLabels: showLabels
                  }}
                  onModelUpdated={handleHiddenAxoviewReady}
                />
              </DOMErrorBoundary>
            </Box>
          </Box>
          {!imageData && (
            <Box
              sx={{
                position: 'relative',
                top: 0,
                left: 0,
                width: 500,
                height: 300,
                bgcolor: 'common.white'
              }}
            >
              <Loader size={2} />
            </Box>
          )}
          <Stack alignItems="center" spacing={2}>
            {renderPreview()}
            <Box sx={{ width: '100%' }}>
              <Box component="fieldset">
                <Typography variant="caption" component="legend">
                  {t('options')}
                </Typography>

                {/* Appearance */}
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 600,
                    color: 'text.secondary',
                    display: 'block',
                    mt: 0.5
                  }}
                >
                  {t('groupAppearance')}
                </Typography>
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    columnGap: 1
                  }}
                >
                  <FormControlLabel
                    label={t('showGrid')}
                    control={
                      <Checkbox
                        size="small"
                        checked={showGrid}
                        onChange={(event) =>
                          handleShowGridChange(event.target.checked)
                        }
                      />
                    }
                  />
                  <FormControlLabel
                    label={t('showLabels')}
                    control={
                      <Checkbox
                        size="small"
                        checked={showLabels}
                        onChange={(event) => setShowLabels(event.target.checked)}
                      />
                    }
                  />
                </Box>

                {/* Background */}
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 600,
                    color: 'text.secondary',
                    display: 'block',
                    mt: 1.5
                  }}
                >
                  {t('groupBackground')}
                </Typography>
                <Box
                  sx={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    columnGap: 2
                  }}
                >
                  <FormControlLabel
                    label={t('backgroundColor')}
                    control={
                      <ColorPicker
                        value={backgroundColor}
                        onChange={handleBackgroundColorChange}
                        disabled={transparentBackground}
                      />
                    }
                  />
                  <FormControlLabel
                    label={t('transparentBackground')}
                    control={
                      <Checkbox
                        size="small"
                        checked={transparentBackground}
                        onChange={(event) =>
                          handleTransparentBackgroundChange(event.target.checked)
                        }
                      />
                    }
                  />
                </Box>

                {/* Crop */}
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 600,
                    color: 'text.secondary',
                    display: 'block',
                    mt: 1.5
                  }}
                >
                  {t('groupCrop')}
                </Typography>
                <FormControlLabel
                  label={t('cropToContent')}
                  control={
                    <Checkbox
                      size="small"
                      checked={cropToContent}
                      onChange={(event) =>
                        handleCropToContentChange(event.target.checked)
                      }
                    />
                  }
                />

                <Box sx={{ mt: 1.5, mb: 1 }}>
                  <Typography variant="caption" component="div" sx={{ mb: 1 }}>
                    {t('exportQuality')}
                  </Typography>

                  <FormControl fullWidth size="small" sx={{ mb: 1 }}>
                    <Select
                      value={
                        scaleMode === 'screenshot'
                          ? 'screenshot'
                          : scaleMode === 'custom'
                            ? 'custom'
                            : exportScale
                      }
                      onChange={(event) => {
                        const value = event.target.value;
                        if (value === 'screenshot') {
                          // Screenshot preset: 2× · fit-to-content · labels on.
                          setScaleMode('screenshot');
                          setExportScale(2);
                          setShowLabels(true);
                          if (cropToContent) handleCropToContentChange(false);
                        } else if (value === 'custom') {
                          setScaleMode('custom');
                        } else {
                          setScaleMode('preset');
                          setExportScale(Number(value));
                        }
                      }}
                    >
                      <MenuItem value="screenshot">
                        {t('screenshotPreset')}
                      </MenuItem>
                      {dpiPresets.map((preset) => (
                        <MenuItem key={preset.value} value={preset.value}>
                          {preset.label}
                        </MenuItem>
                      ))}
                      <MenuItem value="custom">{t('custom')}</MenuItem>
                    </Select>
                  </FormControl>

                  {renderTarget.wasClamped && (
                    <Alert severity="warning" sx={{ mb: 1 }}>
                      {t('scaleClamped')}{' '}
                      {renderTarget.width}&times;{renderTarget.height} px (
                      {renderTarget.effectiveScale.toFixed(1)}x)
                    </Alert>
                  )}

                  {scaleMode === 'custom' && (
                    <Box sx={{ px: 1 }}>
                      <Typography variant="caption" gutterBottom>
                        Scale: {exportScale.toFixed(1)}x (
                        {(exportScale * 72).toFixed(0)} DPI)
                      </Typography>
                      <Slider
                        value={exportScale}
                        onChange={(_, value) => setExportScale(value as number)}
                        min={1}
                        max={5}
                        step={0.1}
                        marks={[
                          { value: 1, label: '1x' },
                          { value: 2, label: '2x' },
                          { value: 3, label: '3x' },
                          { value: 4, label: '4x' },
                          { value: 5, label: '5x' }
                        ]}
                        valueLabelDisplay="auto"
                        valueLabelFormat={(value) => `${value.toFixed(1)}x`}
                      />
                    </Box>
                  )}
                </Box>
              </Box>

              {/* Crop controls */}
              {renderCropControls()}
            </Box>

            {renderActions()}
          </Stack>

          {exportError && <Alert severity="error">{t('error')}</Alert>}
        </Stack>
      </DialogContent>
    </Dialog>
  );
});
