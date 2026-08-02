import React, { useState, useRef, useEffect, useMemo } from 'react';
import { styled } from '@mui/material/styles';
import { shallow } from 'zustand/shallow';
import { useResizeObserver } from 'src/hooks/useResizeObserver';
import { Gradient } from 'src/components/Gradient/Gradient';
import { ExpandButton } from './ExpandButton';
import { Label, Props as LabelProps } from './Label';
import { useUiStateStore, useUiStateStoreApi } from 'src/stores/uiStateStore';
import {
  LABEL_BASE_FONT_PX,
  labelCounterScaleFor
} from 'src/config/labelSettings';

type Props = Omit<LabelProps, 'maxHeight'> & {
  onToggleExpand?: (isExpanded: boolean) => void;
  /**
   * R5/OVL-02 — this label's own font size, for the "keep labels readable"
   * counter-scale. ADR 0015's floor is stated in terms of the label's on-screen
   * font size, so a label the user enlarged or shrank (ADR 0032's style strip)
   * needs its own factor; the module default was only ever right for a
   * default-sized label. Omitted = inherits `LABEL_BASE_FONT_PX`.
   */
  labelFontSizePx?: number;
};

const STANDARD_LABEL_HEIGHT = 80;

// T1 wholesale de-emotion: the scrollable content box's only style needing a
// stylesheet is the scrollbar-hide pseudo — baked once into a cached class so each
// node pays no per-instance sx pipeline. Dynamic overflow / maxHeight / padding go
// inline. (Gradient + ExpandButton stay sx — rendered only when truncated.)
const ScrollContent = styled('div')({
  '&::-webkit-scrollbar': { display: 'none' }
});

export const ExpandableLabel = ({
  children,
  onToggleExpand,
  labelFontSizePx,
  ...rest
}: Props) => {
  const { forceExpandLabels, editorMode, labelSettings } = useUiStateStore(
    (state) => ({
      forceExpandLabels: state.expandLabels,
      editorMode: state.editorMode,
      labelSettings: state.labelSettings
    }),
    shallow
  );
  const [isExpanded, setIsExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const counterScaleRef = useRef<HTMLDivElement>(null);
  const storeApi = useUiStateStoreApi();
  const { observe, size: contentSize } = useResizeObserver();

  useEffect(() => {
    if (!contentRef.current) return;

    observe(contentRef.current);
  }, [observe]);

  // "Keep labels readable" (ADR 0015): counter-scale the node name label up to
  // a legible floor below a zoom threshold. Driven by a direct DOM subscription
  // to uiState.zoom (the §8.8 / NodeActionBar pattern) so panning/zooming never
  // re-renders React; the scale is published as a CSS custom property the Label
  // composes into its transform. Label-only — node geometry is untouched.
  // Read through a ref so a font-size change does not have to re-subscribe —
  // the subscription exists to avoid React re-renders on pan/zoom.
  const fontSizeRef = useRef(labelFontSizePx);
  fontSizeRef.current = labelFontSizePx;
  useEffect(() => {
    const apply = () => {
      if (!counterScaleRef.current) return;
      const { zoom, readableLabels } = storeApi.getState();
      // R5/OVL-02 — this label's OWN font size, so an enlarged label is not
      // boosted again and a shrunk one is actually lifted to the floor.
      const scale = labelCounterScaleFor(zoom, readableLabels, fontSizeRef.current);
      counterScaleRef.current.style.setProperty(
        '--axoview-label-scale',
        String(scale)
      );
    };
    apply();
    return storeApi.subscribe((state, prev) => {
      if (
        state.zoom === prev.zoom &&
        state.readableLabels === prev.readableLabels
      ) {
        return;
      }
      apply();
    });
  }, [storeApi]);

  const effectiveExpanded = useMemo(() => {
    // Only force expand in NON_INTERACTIVE mode (export preview)
    const shouldForceExpand =
      forceExpandLabels && editorMode === 'NON_INTERACTIVE';
    return shouldForceExpand || isExpanded;
  }, [forceExpandLabels, isExpanded, editorMode]);

  const containerMaxHeight = useMemo(() => {
    return effectiveExpanded ? undefined : STANDARD_LABEL_HEIGHT;
  }, [effectiveExpanded]);

  const isContentTruncated = useMemo(() => {
    return (
      !effectiveExpanded && contentSize.height >= STANDARD_LABEL_HEIGHT - 10
    );
  }, [effectiveExpanded, contentSize.height]);

  // Determine overflow behavior based on mode
  const overflowBehavior = useMemo(() => {
    if (editorMode === 'NON_INTERACTIVE') {
      // In export mode, no overflow needed - container expands to fit
      return 'visible';
    }
    // In interactive modes, use scroll when expanded, hidden when collapsed
    return effectiveExpanded ? 'scroll' : 'hidden';
  }, [editorMode, effectiveExpanded]);

  // Reset scroll to top only on an actual expand/collapse transition. On initial
  // mount the freshly-rendered content is already at scrollTop 0, so this call is
  // a behavioural no-op — but during bulk spawn it forces a per-node scroll/layout
  // (≈364ms of JS self-time at N=1000, the single largest slice in the spawn CPU
  // profile — perf-results/cpuprofile-spawn-1000.md). Skip the first run.
  const didResetScrollRef = useRef(false);
  useEffect(() => {
    if (!didResetScrollRef.current) {
      didResetScrollRef.current = true;
      return;
    }
    contentRef.current?.scrollTo({ top: 0 });
  }, [effectiveExpanded]);

  return (
    <div ref={counterScaleRef}>
      <Label
        {...rest}
        maxHeight={containerMaxHeight}
        maxWidth={effectiveExpanded ? rest.maxWidth * 1.5 : rest.maxWidth}
      >
        <ScrollContent
          ref={contentRef}
          style={{
            overflowY: overflowBehavior,
            maxHeight: containerMaxHeight,
            // pb: labelSettings.expandButtonPadding (theme units; theme.spacing = 6)
            paddingBottom:
              isContentTruncated || isExpanded
                ? labelSettings.expandButtonPadding * 6
                : 0
          }}
        >
          {children}

          {isContentTruncated && (
            <Gradient
              sx={{
                position: 'absolute',
                width: '100%',
                height: 50,
                bottom: 0,
                left: 0
              }}
            />
          )}
        </ScrollContent>

        {editorMode !== 'NON_INTERACTIVE' &&
          ((!isExpanded && isContentTruncated) || isExpanded) && (
            <ExpandButton
              sx={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                m: 0.5
              }}
              isExpanded={isExpanded}
              onClick={() => {
                setIsExpanded(!isExpanded);
                onToggleExpand?.(!isExpanded);
              }}
            />
          )}
      </Label>
    </div>
  );
};
